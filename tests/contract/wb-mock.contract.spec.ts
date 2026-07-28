import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { INestApplication } from '@nestjs/common';

import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';
import {
  CircuitBreakerRegistry,
  InMemoryRateLimitStore,
  WbApiClient,
  WbRateLimiter,
  campaignStatisticsResponseSchema,
  campaignDetailsResponseSchema,
  selectRateLimitProfile,
} from '@wb-bidder/wb-api';

describe('WB deterministic mock consumer contract', () => {
  let application: INestApplication;
  let baseUrl: URL;

  beforeAll(async () => {
    Object.assign(process.env, {
      LOG_LEVEL: 'silent',
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });
    application = await NestFactory.create(MockAppModule, { logger: false });
    await application.listen(0, '127.0.0.1');
    const server = application.getHttpServer() as unknown as Server;
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Mock test server did not bind a TCP port');
    }
    baseUrl = new URL(`http://127.0.0.1:${String(address.port)}`);
  });

  afterAll(async () => {
    await application.close();
  });

  it('implements every required current method/path with synthetic auth and schemas', async () => {
    const server = application.getHttpServer() as unknown as Server;
    const auth = { Authorization: 'mock-test-token' };

    await request(server).get('/adv/v1/promotion/count').set(auth).expect(200);
    await request(server).get('/api/advert/v2/adverts?ids=10001').set(auth).expect(200);
    await request(server)
      .post('/api/advert/v1/bids/min')
      .set(auth)
      .send({
        advert_id: 10001,
        nm_ids: [20001],
        payment_type: 'cpm',
        placement_types: ['search'],
      })
      .expect(201);
    await request(server)
      .patch('/api/advert/v1/bids')
      .set(auth)
      .send({
        bids: [
          {
            advert_id: 10001,
            nm_bids: [{ bid_kopecks: 1300, nm_id: 20001, placement: 'search' }],
          },
        ],
      })
      .expect(200);
    await request(server)
      .post('/adv/v0/normquery/get-bids')
      .set(auth)
      .send({ items: [{ advert_id: 10001, nm_id: 20001 }] })
      .expect(201);
    await request(server)
      .post('/adv/v0/normquery/list')
      .set(auth)
      .send({ items: [{ advert_id: 10001, nm_id: 20001 }] })
      .expect(201);
    const clusterBody = {
      bids: [
        {
          advert_id: 10001,
          bid: 1000,
          nm_id: 20001,
          norm_query: 'synthetic cluster one',
        },
      ],
    };
    await request(server).post('/adv/v0/normquery/bids').set(auth).send(clusterBody).expect(201);
    await request(server).delete('/adv/v0/normquery/bids').set(auth).send(clusterBody).expect(200);
    await request(server)
      .get('/adv/v3/fullstats?ids=10001&begin=2026-07-27&end=2026-07-28')
      .set(auth)
      .expect(200);
    await request(server)
      .post('/adv/v1/normquery/stats')
      .set(auth)
      .send({
        from: '2026-07-27',
        items: [{ advert_id: 10001, nm_id: 20001 }],
        to: '2026-07-28',
      })
      .expect(201);
    await request(server)
      .get('/api/advert/v0/bids/recommendations?advertId=10001&nmId=20001')
      .set(auth)
      .expect(200);
    await request(server).get('/adv/v1/budget?id=10001').set(auth).expect(200);
    await request(server).get('/api/v1/seller-info').set(auth).expect(200);
    await request(server).get('/ping').set(auth).expect(200);
  });

  it('models delayed visibility, virtual days, deterministic faults and reset', async () => {
    const server = application.getHttpServer() as unknown as Server;
    const auth = { Authorization: 'mock-test-token' };
    await request(server).post('/__mock/reset').expect(201);
    const write = {
      bids: [
        {
          advert_id: 10001,
          nm_bids: [{ bid_kopecks: 1500, nm_id: 20001, placement: 'search' }],
        },
      ],
    };
    await request(server).patch('/api/advert/v1/bids').set(auth).send(write).expect(200);
    const before = await request(server)
      .get('/api/advert/v2/adverts?ids=10001')
      .set(auth)
      .expect(200);
    const beforeBody = campaignDetailsResponseSchema.parse(before.body as unknown);
    expect(beforeBody.adverts[0]?.nm_settings[0]?.bids_kopecks.search).toBe(1200);

    const advance = await request(server)
      .post('/__mock/time/advance')
      .send({ days: 2, finalizeStatistics: true, hours: 0, minutes: 1 })
      .expect(201);
    const advanceBody = z
      .object({
        checksum: z.string(),
        sourceDates: z.array(z.string()),
      })
      .parse(advance.body as unknown);
    expect(advanceBody.sourceDates).toEqual(['2026-07-28', '2026-07-29']);
    expect(advanceBody.checksum).toMatch(/^[a-f0-9]{64}$/u);

    const currentDay = await request(server)
      .get('/adv/v3/fullstats?ids=10001&begin=2026-07-27&end=2026-07-30')
      .set(auth)
      .expect(200);
    expect(
      campaignStatisticsResponseSchema
        .parse(currentDay.body as unknown)[0]
        ?.days.some((day) => day.date.startsWith('2026-07-30')),
    ).toBe(true);

    const after = await request(server)
      .get('/api/advert/v2/adverts?ids=10001')
      .set(auth)
      .expect(200);
    const afterBody = campaignDetailsResponseSchema.parse(after.body as unknown);
    expect(afterBody.adverts[0]?.nm_settings[0]?.bids_kopecks.search).toBe(1500);

    await request(server)
      .post('/__mock/faults')
      .send({ rules: [{ endpointKey: 'campaignBudget', remaining: 1, status: 402 }] })
      .expect(201);
    await request(server).get('/adv/v1/budget?id=10001').set(auth).expect(402);
    await request(server).get('/adv/v1/budget?id=10001').set(auth).expect(200);

    const journal = await request(server).get('/__mock/requests').expect(200);
    const journalBody = z
      .array(z.object({ endpointKey: z.string(), responseStatus: z.number() }).loose())
      .parse(journal.body as unknown);
    expect(journalBody.length).toBeGreaterThan(4);
    expect(journalBody.at(-1)).toMatchObject({
      endpointKey: 'campaignBudget',
      responseStatus: 200,
    });

    const reset = await request(server).post('/__mock/reset').expect(201);
    const resetBody = z
      .object({
        requestCount: z.number(),
        virtualTime: z.string(),
      })
      .loose()
      .parse(reset.body as unknown);
    expect(resetBody.requestCount).toBe(0);
    expect(resetBody.virtualTime).toBe('2026-07-28T00:00:00.000Z');
  });

  it('rejects missing auth, invalid batch bounds and deprecated paths', async () => {
    const server = application.getHttpServer() as unknown as Server;
    await request(server).get('/adv/v1/promotion/count').expect(401);
    await request(server)
      .post('/api/advert/v1/bids/min')
      .set({ Authorization: 'mock-test-token' })
      .send({
        advert_id: 10001,
        nm_ids: [],
        payment_type: 'cpm',
        placement_types: ['search'],
      })
      .expect(400);
    await request(server).post('/adv/v1/promotion/adverts').expect(404);
    await request(server).post('/adv/v2/fullstats').expect(404);
  });

  it('satisfies the validated WB adapter contract and fail-closes cluster writes', async () => {
    const server = application.getHttpServer() as unknown as Server;
    await request(server).post('/__mock/reset').expect(201);
    const client = new WbApiClient({
      baseUrl,
      breakers: new CircuitBreakerRegistry(),
      commonBaseUrl: baseUrl,
      fetch,
      maxInFlight: 5,
      rateLimiter: new WbRateLimiter(
        'synthetic-seller',
        selectRateLimitProfile('PERSONAL+PROD'),
        { burst: 100, intervalMs: 1_000, requests: 100 },
        new InMemoryRateLimitStore(),
      ),
      readRetryPolicy: {
        baseMs: 1,
        capMs: 10,
        deadlineMs: 2_000,
        maxAttempts: 3,
      },
      timeoutMs: 1_000,
      token: 'mock-test-token',
      writesEnabled: true,
    });

    expect((await client.getCampaignCount()).all).toBe(2);
    expect((await client.getCampaignDetails([10_001])).adverts).toHaveLength(1);
    expect(
      (
        await client.getMinimumBids({
          advert_id: 10_001,
          nm_ids: [20_001],
          payment_type: 'cpm',
          placement_types: ['search'],
        })
      ).bids[0]?.bids[0]?.value,
    ).toBe(250);
    expect(
      await client.writeCardBids({
        bids: [
          {
            advert_id: 10_001,
            nm_bids: [{ bid_kopecks: 1_400, nm_id: 20_001, placement: 'search' }],
          },
        ],
      }),
    ).toMatchObject({ bids: [{ advert_id: 10_001 }] });
    expect(
      (
        await client.getClusterBids({
          items: [{ advert_id: 10_001, nm_id: 20_001 }],
        })
      ).bids,
    ).toHaveLength(1);
    expect(
      (
        await client.listClusters({
          items: [{ advert_id: 10_001, nm_id: 20_001 }],
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await client.getClusterStatistics({
          from: '2026-07-27',
          items: [{ advert_id: 10_001, nm_id: 20_001 }],
          to: '2026-07-28',
        })
      ).items,
    ).toHaveLength(1);
    expect(await client.getCampaignStatistics([10_001], '2026-07-27', '2026-07-28')).toHaveLength(
      1,
    );
    expect((await client.getBidRecommendations(10_001, 20_001)).nmId).toBe(20_001);
    expect((await client.getCampaignBudget(10_001)).total).toBe(500);
    expect((await client.getSellerInfo()).sid).toBe('00000000-0000-4000-8000-000000000001');
    expect((await client.ping()).Status).toBe('OK');
    await expect(
      client.writeClusterBids({
        bids: [
          {
            advert_id: 10_001,
            bid: 1_000,
            nm_id: 20_001,
            norm_query: 'synthetic cluster one',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT' });

    await request(server)
      .post('/__mock/faults')
      .send({ rules: [{ endpointKey: 'campaignCount', remaining: 1, status: 503 }] })
      .expect(201);
    expect((await client.getCampaignCount()).all).toBe(2);
  });

  it('proves verified-mock cluster minor unit, minimum, absence and delete semantics', async () => {
    const server = application.getHttpServer() as unknown as Server;
    await request(server).post('/__mock/reset').expect(201);
    const client = createMockClient(baseUrl, 'verified-mock');
    const pair = { advert_id: 10_001, nm_id: 20_001 };
    const initial = await client.getClusterBids({ items: [pair] });
    expect(initial.bids).toEqual([
      {
        ...pair,
        bid: 700,
        norm_query: 'synthetic cluster one',
      },
    ]);
    await expect(
      client.writeClusterBids({
        bids: [
          {
            ...pair,
            bid: 499,
            norm_query: 'synthetic cluster two',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'PAYLOAD' });
    await expect(
      client.writeClusterBids({
        bids: [
          {
            ...pair,
            bid: 900,
            norm_query: 'synthetic cluster two',
          },
        ],
      }),
    ).resolves.toMatchObject({ bids: [{ bid: 900 }] });
    expect((await client.getClusterBids({ items: [pair] })).bids).toHaveLength(2);
    await expect(
      client.deleteClusterBids({
        bids: [
          {
            ...pair,
            bid: 900,
            norm_query: 'synthetic cluster two',
          },
        ],
      }),
    ).resolves.toMatchObject({ bids: [{ bid: 900 }] });
    expect((await client.getClusterBids({ items: [pair] })).bids).toEqual(initial.bids);
  });

  it('exposes 429 headers, partial dispatch and ambiguous write outcomes deterministically', async () => {
    const server = application.getHttpServer() as unknown as Server;
    const auth = { Authorization: 'mock-test-token' };
    await request(server).post('/__mock/seed/partial-failure').expect(201);
    const partial = await request(server)
      .patch('/api/advert/v1/bids')
      .set(auth)
      .send({
        bids: [
          {
            advert_id: 10_001,
            nm_bids: [{ bid_kopecks: 1_600, nm_id: 20_001, placement: 'search' }],
          },
          {
            advert_id: 10_002,
            nm_bids: [{ bid_kopecks: 900, nm_id: 20_002, placement: 'combined' }],
          },
        ],
      })
      .expect(503);
    expect(partial.body as unknown).toMatchObject({ accepted_indices: [0] });
    await request(server)
      .post('/__mock/time/advance')
      .send({ days: 0, finalizeStatistics: false, hours: 0, minutes: 1 })
      .expect(201);
    const partialState = await request(server)
      .get('/api/advert/v2/adverts?ids=10001,10002')
      .set(auth)
      .expect(200);
    const partialBody = campaignDetailsResponseSchema.parse(partialState.body as unknown);
    expect(partialBody.adverts[0]?.nm_settings[0]?.bids_kopecks.search).toBe(1_600);
    expect(partialBody.adverts[1]?.nm_settings[0]?.bids_kopecks.search).toBe(500);

    await request(server).post('/__mock/seed/ambiguous-write').expect(201);
    const client = createMockClient(baseUrl);
    await expect(
      client.writeCardBids({
        bids: [
          {
            advert_id: 10_001,
            nm_bids: [{ bid_kopecks: 1_700, nm_id: 20_001, placement: 'search' }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'WRITE_OUTCOME_UNKNOWN' });
    await request(server)
      .post('/__mock/time/advance')
      .send({ days: 0, finalizeStatistics: false, hours: 0, minutes: 1 })
      .expect(201);
    const reconciled = await client.getCampaignDetails([10_001]);
    expect(reconciled.adverts[0]?.nm_settings[0]?.bids_kopecks.search).toBe(1_700);

    await request(server).post('/__mock/reset').expect(201);
    await request(server)
      .post('/__mock/faults')
      .send({ rules: [{ endpointKey: 'campaignCount', remaining: 1, status: 429 }] })
      .expect(201);
    const quota = await request(server).get('/adv/v1/promotion/count').set(auth).expect(429);
    expect(quota.headers['retry-after']).toBe('1');
    expect(quota.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('uses a refillable token bucket and accepts only stricter deterministic quota faults', async () => {
    const server = application.getHttpServer() as unknown as Server;
    const auth = { Authorization: 'mock-test-token' };
    const quotaNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(quotaNow);
    await request(server).post('/__mock/reset').expect(201);
    await request(server)
      .post('/__mock/faults')
      .send({
        rules: [
          {
            endpointKey: 'campaignCount',
            rateLimit: { burst: 1, intervalMs: 10_000, requests: 1 },
            remaining: 3,
            responseHeaders: { 'x-ratelimit-retry': '10' },
          },
        ],
      })
      .expect(201);
    const admitted = await request(server).get('/adv/v1/promotion/count').set(auth).expect(200);
    expect(admitted.headers['x-ratelimit-limit']).toBe('1');
    await request(server)
      .get('/adv/v1/promotion/count')
      .set(auth)
      .expect(429)
      .expect('x-ratelimit-retry', '10');
    await request(server)
      .post('/__mock/time/advance')
      .send({ days: 0, finalizeStatistics: false, hours: 0, minutes: 1 })
      .expect(201);
    await request(server).get('/adv/v1/promotion/count').set(auth).expect(429);
    nowSpy.mockReturnValue(quotaNow + 10_001);
    await request(server).get('/adv/v1/promotion/count').set(auth).expect(200);

    await request(server)
      .post('/__mock/faults')
      .send({
        rules: [
          {
            endpointKey: 'campaignCount',
            rateLimit: { burst: 6, intervalMs: 1_000, requests: 6 },
            remaining: 1,
          },
        ],
      })
      .expect(400);
    nowSpy.mockRestore();
  });
});

function createMockClient(
  baseUrl: URL,
  contractMode: 'production' | 'verified-mock' = 'production',
): WbApiClient {
  return new WbApiClient({
    baseUrl,
    breakers: new CircuitBreakerRegistry(),
    commonBaseUrl: baseUrl,
    contractMode,
    fetch,
    maxInFlight: 5,
    rateLimiter: new WbRateLimiter(
      'synthetic-seller',
      selectRateLimitProfile('PERSONAL+PROD'),
      { burst: 100, intervalMs: 1_000, requests: 100 },
      new InMemoryRateLimitStore(),
    ),
    readRetryPolicy: {
      baseMs: 1,
      capMs: 10,
      deadlineMs: 2_000,
      maxAttempts: 3,
    },
    timeoutMs: 1_000,
    token: 'mock-test-token',
    writesEnabled: true,
  });
}
