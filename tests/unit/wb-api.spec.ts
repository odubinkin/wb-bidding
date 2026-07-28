import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  InMemoryRateLimitStore,
  WbApiError,
  WbApiClient,
  WbRateLimiter,
  WbTransportError,
  applyStricterOverrides,
  bidRecommendationsResponseSchema,
  campaignDetailsResponseSchema,
  cardWriteBidsSchema,
  classifyHttpFailure,
  createNodeWbFetch,
  decimalMajorToMinor,
  endpointDefinition,
  kopecksToMinor,
  clusterListResponseSchema,
  clusterWriteRequestSchema,
  minimumBidsRequestSchema,
  parseRateLimitHeaders,
  selectRateLimitProfile,
  validateWbToken,
  withBoundedRetry,
} from '@wb-bidder/wb-api';
import { CURRENT_ENDPOINT_PROFILE } from '@wb-bidder/contracts';

describe('WB runtime schemas and exact units', () => {
  it('validates checked-in synthetic contract fixtures', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../../fixtures/wb-contracts/wb-promotion-runtime-v1.json', import.meta.url),
        'utf8',
      ),
    ) as {
      contracts: {
        campaignDetails: { response: unknown };
        cardMinimumBids: { request: unknown };
        cardWriteBids: { request: unknown };
      };
    };

    expect(
      campaignDetailsResponseSchema.parse(fixture.contracts.campaignDetails.response).adverts,
    ).toHaveLength(1);
    expect(
      minimumBidsRequestSchema.parse(fixture.contracts.cardMinimumBids.request).nm_ids,
    ).toEqual([20_001]);
    expect(cardWriteBidsSchema.parse(fixture.contracts.cardWriteBids.request).bids).toHaveLength(1);
  });

  it('normalizes only endpoint-qualified exact decimal and kopeck fields', () => {
    expect(decimalMajorToMinor('12.34', 'fullstats.sum')).toBe(1234n);
    expect(decimalMajorToMinor(0, 'clusterStats.spend')).toBe(0n);
    expect(kopecksToMinor(1_250, 'card.bid_kopecks')).toBe(1250n);
    expect(() => decimalMajorToMinor('12.345', 'fullstats.sum')).toThrow(
      'cannot be normalized exactly',
    );
    expect(() => decimalMajorToMinor('not-a-decimal', 'fullstats.sum')).toThrow(
      'cannot be normalized exactly',
    );
    expect(() => kopecksToMinor(-1, 'card.bid_kopecks')).toThrow('cannot be normalized exactly');
  });

  it('preserves cluster query case and whitespace on every wire schema', () => {
    const wire = '  Dress\u00A0';
    expect(
      clusterListResponseSchema.parse({
        items: [{ advert_id: 1, nm_id: 2, norm_queries: [wire] }],
      }).items[0]?.norm_queries[0],
    ).toBe(wire);
    expect(
      clusterWriteRequestSchema.parse({
        bids: [{ advert_id: 1, bid: 100, nm_id: 2, norm_query: wire }],
      }).bids[0]?.norm_query,
    ).toBe(wire);
    expect(
      bidRecommendationsResponseSchema.parse({
        advertId: 1,
        base: {
          competitiveBid: { bidKopecks: 100 },
          leadersBid: { bidKopecks: 110 },
          top2: { bidKopecks: 0 },
        },
        nmId: 2,
        normQueries: [
          {
            normQuery: wire,
            reachMax: { bidKopecks: 130 },
            reachMedium: { bidKopecks: 120 },
            reachMin: { bidKopecks: 110 },
          },
        ],
      }).normQueries[0]?.normQuery,
    ).toBe(wire);
  });

  it('keeps unverified writes and deprecated pairs fail-closed', () => {
    expect(endpointDefinition('cardWriteBids').status).toBe('VERIFIED');
    expect(endpointDefinition('clusterWriteBids').status).toBe('UNVERIFIED');
    expect(endpointDefinition('campaignBudget').status).toBe('UNVERIFIED');
  });
});

describe('WB token profiles', () => {
  it('accepts a Personal promotion token and detects read-only restriction', () => {
    const promotionBit = 2 ** 5;
    const readOnlyBit = 2 ** 29;
    const token = jwt({
      acc: 3,
      exp: 2_000_000_000,
      for: 'self',
      id: '00000000-0000-4000-8000-000000000002',
      s: promotionBit | readOnlyBit,
      sid: '00000000-0000-4000-8000-000000000001',
      t: false,
    });

    const profile = validateWbToken(token, 'prod', 1_900_000_000);

    expect(profile.tokenType).toBe('PERSONAL');
    expect(profile.promotionAccess).toBe(true);
    expect(profile.readOnly).toBe(true);
    expect(profile.writeCapable).toBe(false);
    expect(profile.identityFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('enforces Test/Base/Personal environment matrix and expiry', () => {
    const claims = {
      acc: 2,
      exp: 2_000_000_000,
      id: '00000000-0000-4000-8000-000000000002',
      s: 2 ** 5,
      sid: '00000000-0000-4000-8000-000000000001',
      t: true,
    };
    const testProfile = validateWbToken(jwt(claims), 'sandbox', 1_900_000_000);
    expect(testProfile.tokenType).toBe('TEST');
    expect(testProfile.writeCapable).toBe(true);
    expect(() => validateWbToken(jwt(claims), 'prod', 1_900_000_000)).toThrow(
      'production requires',
    );
    expect(() => validateWbToken(jwt({ ...claims, exp: 1 }), 'sandbox', 2)).toThrow('expired');
    expect(validateWbToken('mock-test-token', 'mock').tokenType).toBe('MOCK');
  });
});

describe('WB quota handling', () => {
  it('coordinates global and endpoint token buckets with deterministic waits', async () => {
    let nowMs = 0;
    const delays: number[] = [];
    const profiles = {
      ...CURRENT_ENDPOINT_PROFILE.personalProductionLimits,
      campaignCount: { burst: 1, intervalMs: 1_000, requests: 1 },
    };
    const limiter = new WbRateLimiter(
      'seller-1',
      profiles,
      { burst: 2, intervalMs: 1_000, requests: 2 },
      new InMemoryRateLimitStore(),
      () => nowMs,
      (delay) => {
        delays.push(delay);
        nowMs += delay;
        return Promise.resolve();
      },
    );

    expect(await limiter.acquire('campaignCount')).toBe(0);
    expect(await limiter.acquire('campaignCount')).toBe(1_000);
    expect(delays).toEqual([1_000]);
  });

  it('parses server freezes and rejects relaxed operator overrides', () => {
    const headers = new Headers({
      'retry-after': '2',
      'x-ratelimit-limit': '5',
      'x-ratelimit-remaining': '0',
    });
    expect(parseRateLimitHeaders(headers, 1_000)).toEqual({
      limit: 5,
      remaining: 0,
      retryAtMs: 3_000,
    });
    expect(
      parseRateLimitHeaders(
        new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1',
        }),
        2_000,
      ),
    ).toEqual({
      limit: null,
      remaining: 0,
      retryAtMs: null,
    });

    const base = selectRateLimitProfile('PERSONAL+PROD');
    expect(
      applyStricterOverrides(base, {
        campaignCount: { burst: 1, intervalMs: 1_000, requests: 1 },
      }).campaignCount.requests,
    ).toBe(1);
    expect(() =>
      applyStricterOverrides(base, {
        campaignCount: { burst: 6, intervalMs: 1_000, requests: 6 },
      }),
    ).toThrow('not stricter');
  });
});

describe('WB errors, retries and breaker', () => {
  it('classifies billing, payload, auth, quota and ambiguous writes distinctly', () => {
    expect(classifyHttpFailure(402, 'read', false, '').code).toBe('BILLING_PROFILE_ANOMALY');
    expect(classifyHttpFailure(403, 'read', false, 'token category missing').code).toBe(
      'CAPABILITY',
    );
    expect(classifyHttpFailure(403, 'read', false, 'campaign type unsupported').code).toBe(
      'PAYLOAD',
    );
    expect(classifyHttpFailure(429, 'read', false, '').retryable).toBe(true);
    expect(classifyHttpFailure(503, 'write', true, '').code).toBe('WRITE_OUTCOME_UNKNOWN');
  });

  it('uses bounded full-jitter retries and opens/recovers breaker', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const result = await withBoundedRetry(
      () => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(new WbApiError('REMOTE_UNAVAILABLE', 'temporary', 503, true));
        }
        return Promise.resolve('ok');
      },
      { baseMs: 100, capMs: 500, deadlineMs: 5_000, maxAttempts: 3 },
      () => 0.5,
      vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(10).mockReturnValueOnce(20),
      (delay) => {
        sleeps.push(delay);
        return Promise.resolve();
      },
    );
    expect(result).toBe('ok');
    expect(sleeps).toEqual([50, 100]);

    let nowMs = 0;
    const breaker = new CircuitBreaker(2, 1_000, () => nowMs);
    breaker.recordFailure(new WbApiError('REMOTE_UNAVAILABLE', 'temporary', 503, true));
    breaker.recordFailure(new WbApiError('REMOTE_UNAVAILABLE', 'temporary', 503, true));
    expect(() => {
      breaker.assertRequestAllowed();
    }).toThrow('circuit is open');
    nowMs = 1_000;
    breaker.assertRequestAllowed();
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('uses the bounded Node transport and distinguishes proven pre-byte writes', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const transport = createNodeWbFetch(1_000);
    const response = await transport(`http://127.0.0.1:${String(address.port)}/ping`);
    expect(await response.json()).toEqual({ ok: true });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });

    const client = new WbApiClient({
      baseUrl: new URL('http://wb-mock:3001'),
      breakers: new CircuitBreakerRegistry(),
      commonBaseUrl: new URL('http://wb-mock:3001'),
      fetch: () => Promise.reject(new WbTransportError('synthetic connection failure', true)),
      maxInFlight: 1,
      rateLimiter: new WbRateLimiter(
        'seller-transport',
        selectRateLimitProfile('PERSONAL+PROD'),
        { burst: 100, intervalMs: 1_000, requests: 100 },
        new InMemoryRateLimitStore(),
      ),
      readRetryPolicy: { baseMs: 1, capMs: 1, deadlineMs: 10, maxAttempts: 1 },
      timeoutMs: 1_000,
      token: 'synthetic',
      writesEnabled: true,
    });
    await expect(
      client.writeCardBids({
        bids: [
          {
            advert_id: 1,
            nm_bids: [{ bid_kopecks: 100, nm_id: 1, placement: 'search' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_PRE_BYTE' });
    const reserved = await client.reserveCardBidWrite();
    await expect(
      reserved.dispatch({
        bids: [
          {
            advert_id: 1,
            nm_bids: [{ bid_kopecks: 100, nm_id: 1, placement: 'search' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_PRE_BYTE' });
    await expect(
      reserved.dispatch({
        bids: [
          {
            advert_id: 1,
            nm_bids: [{ bid_kopecks: 100, nm_id: 1, placement: 'search' }],
          },
        ],
      }),
    ).rejects.toThrow('already consumed');

    const redirectingClient = new WbApiClient({
      baseUrl: new URL('http://wb-mock:3001'),
      breakers: new CircuitBreakerRegistry(),
      commonBaseUrl: new URL('http://wb-mock:3001'),
      fetch: () =>
        Promise.resolve(
          new Response('', {
            headers: { location: 'https://example.com/credential-capture' },
            status: 302,
          }),
        ),
      maxInFlight: 1,
      rateLimiter: new WbRateLimiter(
        'seller-redirect',
        selectRateLimitProfile('PERSONAL+PROD'),
        { burst: 100, intervalMs: 1_000, requests: 100 },
        new InMemoryRateLimitStore(),
      ),
      readRetryPolicy: { baseMs: 1, capMs: 1, deadlineMs: 10, maxAttempts: 1 },
      timeoutMs: 1_000,
      token: 'synthetic',
      writesEnabled: false,
    });
    await expect(redirectingClient.getCampaignCount()).rejects.toMatchObject({
      code: 'CONTRACT',
      status: 302,
    });
  });
});

function jwt(claims: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}
