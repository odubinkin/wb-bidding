import {
  CURRENT_ENDPOINT_PROFILE,
  type EndpointKey,
  type RateLimitProfile,
} from '@wb-bidder/contracts';
import type { Pool, PoolClient } from 'pg';

/**
 * Token profile/environment combination selecting immutable endpoint limits.
 */
export type RateProfileSelection = 'BASE+PROD' | 'PERSONAL+PROD' | 'TEST+SANDBOX';

/**
 * Result of one atomic bucket-consumption attempt.
 */
export interface BucketConsumption {
  /** Whether one request token was consumed. */
  readonly allowed: boolean;
  /** Earliest epoch millisecond at which another attempt is allowed. */
  readonly retryAtMs: number;
}

/**
 * Atomic shared state required by the account-wide rate limiter.
 */
export interface RateLimitStore {
  /**
   * Attempts to consume one request from a fixed-window bucket.
   *
   * @param key - Deployment/account-scoped bucket key.
   * @param profile - Immutable effective rate profile.
   * @param nowMs - Current epoch milliseconds.
   * @returns Atomic admission result.
   */
  consume(key: string, profile: RateLimitProfile, nowMs: number): Promise<BucketConsumption>;

  /**
   * Freezes a bucket in response to authoritative server headers.
   *
   * @param key - Deployment/account-scoped bucket key.
   * @param untilMs - Earliest allowed epoch millisecond.
   * @returns Promise resolving after the monotonic freeze is persisted.
   */
  freeze(key: string, untilMs: number): Promise<void>;
}

/**
 * Parsed restrictive WB response-header signal.
 */
export interface RateLimitSignal {
  /** Advertised maximum, retained for diagnostics only. */
  readonly limit: number | null;
  /** Remaining quota, which may only reduce local availability. */
  readonly remaining: number | null;
  /** Earliest next request time, or null when no freeze was advertised. */
  readonly retryAtMs: number | null;
}

/**
 * In-memory store for the deterministic mock and explicitly single-replica tests.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<
    string,
    { blockedUntilMs: number; lastRefillAtMs: number; tokens: number }
  >();

  /**
   * Atomically consumes one in-process fixed-window token.
   *
   * @param key - Bucket key.
   * @param profile - Effective request window.
   * @param nowMs - Deterministic current time.
   * @returns Immediate admission result.
   */
  public consume(
    key: string,
    profile: RateLimitProfile,
    nowMs: number,
  ): Promise<BucketConsumption> {
    const current = this.buckets.get(key);
    if (current !== undefined && current.blockedUntilMs > nowMs) {
      return Promise.resolve({ allowed: false, retryAtMs: current.blockedUntilMs });
    }
    const refillRate = profile.requests / profile.intervalMs;
    const state = current ?? {
      blockedUntilMs: 0,
      lastRefillAtMs: nowMs,
      tokens: profile.burst,
    };
    state.tokens = Math.min(
      profile.burst,
      state.tokens + Math.max(0, nowMs - state.lastRefillAtMs) * refillRate,
    );
    state.lastRefillAtMs = nowMs;
    if (state.tokens < 1) {
      this.buckets.set(key, state);
      return Promise.resolve({
        allowed: false,
        retryAtMs: nowMs + Math.ceil((1 - state.tokens) / refillRate),
      });
    }
    state.tokens -= 1;
    this.buckets.set(key, state);
    return Promise.resolve({ allowed: true, retryAtMs: nowMs });
  }

  /**
   * Applies a monotonic in-process freeze.
   *
   * @param key - Bucket key.
   * @param untilMs - Server-authoritative retry time.
   * @returns Resolved promise after state mutation.
   */
  public freeze(key: string, untilMs: number): Promise<void> {
    const current = this.buckets.get(key) ?? {
      blockedUntilMs: 0,
      lastRefillAtMs: untilMs,
      tokens: 0,
    };
    current.blockedUntilMs = Math.max(current.blockedUntilMs, untilMs);
    this.buckets.set(key, current);
    return Promise.resolve();
  }
}

/**
 * PostgreSQL-backed store coordinating buckets across all deployment replicas.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  /**
   * Creates a store over an existing application pool.
   *
   * The migration must create wb_rate_limit_bucket before scheduler startup.
   *
   * @param pool - Shared PostgreSQL pool.
   */
  public constructor(private readonly pool: Pool) {}

  /**
   * Consumes one token under a transaction-scoped advisory lock.
   *
   * @param key - Deployment/account-scoped bucket key.
   * @param profile - Effective fixed-window profile.
   * @param nowMs - Current epoch milliseconds.
   * @returns Atomic cross-replica admission result.
   */
  public async consume(
    key: string,
    profile: RateLimitProfile,
    nowMs: number,
  ): Promise<BucketConsumption> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockBucket(client, key);
      const result = await client.query<{
        blocked_until_ms: string;
        last_refill_at_ms: string;
        tokens: string;
      }>(
        `SELECT blocked_until_ms, last_refill_at_ms, tokens
           FROM wb_rate_limit_bucket
          WHERE bucket_key = $1
          FOR UPDATE`,
        [key],
      );
      const row = result.rows[0];
      const blockedUntilMs = row === undefined ? 0 : Number(row.blocked_until_ms);
      if (blockedUntilMs > nowMs) {
        await client.query('COMMIT');
        return { allowed: false, retryAtMs: blockedUntilMs };
      }
      const lastRefillAtMs = row === undefined ? nowMs : Number(row.last_refill_at_ms);
      const refillRate = profile.requests / profile.intervalMs;
      const tokens = Math.min(
        profile.burst,
        (row === undefined ? profile.burst : Number(row.tokens)) +
          Math.max(0, nowMs - lastRefillAtMs) * refillRate,
      );
      if (tokens < 1) {
        await client.query('COMMIT');
        return { allowed: false, retryAtMs: nowMs + Math.ceil((1 - tokens) / refillRate) };
      }
      await client.query(
        `INSERT INTO wb_rate_limit_bucket
           (bucket_key, blocked_until_ms, tokens, last_refill_at_ms, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (bucket_key) DO UPDATE SET
           blocked_until_ms = EXCLUDED.blocked_until_ms,
           tokens = EXCLUDED.tokens,
           last_refill_at_ms = EXCLUDED.last_refill_at_ms,
           updated_at = NOW()`,
        [key, blockedUntilMs, tokens - 1, nowMs],
      );
      await client.query('COMMIT');
      return { allowed: true, retryAtMs: nowMs };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Persists a monotonic server-directed freeze across replicas.
   *
   * @param key - Bucket key.
   * @param untilMs - Earliest allowed epoch millisecond.
   * @returns Promise resolving after persistence.
   */
  public async freeze(key: string, untilMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO wb_rate_limit_bucket
         (bucket_key, blocked_until_ms, tokens, last_refill_at_ms, updated_at)
       VALUES ($1, $2, 0, $2, NOW())
       ON CONFLICT (bucket_key) DO UPDATE SET
         blocked_until_ms = GREATEST(wb_rate_limit_bucket.blocked_until_ms, EXCLUDED.blocked_until_ms),
         updated_at = NOW()`,
      [key, untilMs],
    );
  }
}

/**
 * Two-level account/global and endpoint rate-limit coordinator.
 */
export class WbRateLimiter {
  /**
   * Creates a quota coordinator.
   *
   * @param accountKey - Stable non-secret seller/deployment identity.
   * @param endpointProfiles - Effective endpoint limits.
   * @param globalProfile - Account-wide safety cap.
   * @param store - Distributed or explicitly in-memory state.
   * @param now - Current epoch millisecond provider.
   * @param sleep - Abort-aware delay function.
   */
  public constructor(
    private readonly accountKey: string,
    private readonly endpointProfiles: Readonly<Record<EndpointKey, RateLimitProfile>>,
    private readonly globalProfile: RateLimitProfile,
    private readonly store: RateLimitStore,
    private readonly now: () => number = Date.now,
    private readonly sleep: (
      milliseconds: number,
      signal?: AbortSignal,
    ) => Promise<void> = sleepFor,
  ) {}

  /**
   * Waits until both account and endpoint buckets admit one request.
   *
   * @param endpointKey - Endpoint quota key.
   * @param signal - Optional cancellation signal.
   * @returns Total limiter wait in milliseconds.
   */
  public async acquire(endpointKey: EndpointKey, signal?: AbortSignal): Promise<number> {
    let waitedMs = 0;
    for (;;) {
      const nowMs = this.now();
      const global = await this.store.consume(this.bucketKey('global'), this.globalProfile, nowMs);
      if (!global.allowed) {
        const delay = Math.max(1, global.retryAtMs - nowMs);
        await this.sleep(delay, signal);
        waitedMs += delay;
        continue;
      }
      const endpoint = await this.store.consume(
        this.bucketKey(endpointKey),
        this.endpointProfiles[endpointKey],
        nowMs,
      );
      if (endpoint.allowed) {
        return waitedMs;
      }
      const delay = Math.max(1, endpoint.retryAtMs - nowMs);
      await this.sleep(delay, signal);
      waitedMs += delay;
    }
  }

  /**
   * Applies restrictive WB response headers to endpoint and global buckets.
   *
   * @param endpointKey - Endpoint that produced the response.
   * @param headers - Fetch-compatible response headers.
   * @returns Parsed signal after any required freezes are stored.
   */
  public async observe(
    endpointKey: EndpointKey,
    headers: Pick<Headers, 'get'>,
  ): Promise<RateLimitSignal> {
    const signal = parseRateLimitHeaders(headers, this.now());
    if (signal.retryAtMs !== null) {
      await Promise.all([
        this.store.freeze(this.bucketKey('global'), signal.retryAtMs),
        this.store.freeze(this.bucketKey(endpointKey), signal.retryAtMs),
      ]);
    }
    return signal;
  }

  /**
   * Constructs a non-secret account-scoped bucket key.
   *
   * @param suffix - Global or endpoint suffix.
   * @returns Stable storage key.
   */
  private bucketKey(suffix: EndpointKey | 'global'): string {
    return `${this.accountKey}:${suffix}`;
  }
}

/**
 * Selects immutable endpoint limits for a token/environment pair.
 *
 * @param selection - Validated token/environment profile.
 * @returns Frozen endpoint limit map.
 */
export function selectRateLimitProfile(
  selection: RateProfileSelection,
): Readonly<Record<EndpointKey, RateLimitProfile>> {
  switch (selection) {
    case 'BASE+PROD':
      return CURRENT_ENDPOINT_PROFILE.baseProductionLimits;
    case 'PERSONAL+PROD':
      return CURRENT_ENDPOINT_PROFILE.personalProductionLimits;
    case 'TEST+SANDBOX':
      return CURRENT_ENDPOINT_PROFILE.testSandboxLimits;
  }
}

/**
 * Accepts endpoint overrides only when they are no less restrictive than the embedded profile.
 *
 * @param base - Embedded token/environment profile.
 * @param overrides - Operator overrides for a subset of endpoints.
 * @returns Frozen effective profile.
 * @throws {Error} When an override increases rate or burst.
 */
export function applyStricterOverrides(
  base: Readonly<Record<EndpointKey, RateLimitProfile>>,
  overrides: Readonly<Partial<Record<EndpointKey, RateLimitProfile>>>,
): Readonly<Record<EndpointKey, RateLimitProfile>> {
  const effective = { ...base };
  for (const [rawKey, override] of Object.entries(overrides)) {
    const key = rawKey as EndpointKey;
    const original = base[key];
    const originalRate = original.requests / original.intervalMs;
    const overrideRate = override.requests / override.intervalMs;
    if (
      !Number.isInteger(override.requests) ||
      !Number.isInteger(override.intervalMs) ||
      !Number.isInteger(override.burst) ||
      override.requests <= 0 ||
      override.intervalMs <= 0 ||
      override.burst <= 0 ||
      overrideRate > originalRate ||
      override.burst > original.burst
    ) {
      throw new Error(`WB rate override is not stricter for ${key}`);
    }
    effective[key] = Object.freeze({ ...override });
  }
  return Object.freeze(effective);
}

/**
 * Parses WB quota headers without ever increasing embedded limits.
 *
 * @param headers - Fetch-compatible response headers.
 * @param nowMs - Current epoch milliseconds.
 * @returns Restrictive quota signal.
 */
export function parseRateLimitHeaders(
  headers: Pick<Headers, 'get'>,
  nowMs: number,
): RateLimitSignal {
  const remaining = parseNonNegativeInteger(headers.get('x-ratelimit-remaining'));
  const limit = parseNonNegativeInteger(headers.get('x-ratelimit-limit'));
  const explicitRetryCandidates = [
    parseRetryAfter(headers.get('retry-after'), nowMs),
    parseDelaySeconds(headers.get('x-ratelimit-retry'), nowMs),
  ].filter((value): value is number => value !== null);
  const resetAtMs = parseEpochSeconds(headers.get('x-ratelimit-reset'));
  const retryCandidates = [
    ...explicitRetryCandidates,
    ...(remaining === 0 && resetAtMs !== null && resetAtMs > nowMs ? [resetAtMs] : []),
  ];
  return Object.freeze({
    limit,
    remaining,
    retryAtMs: retryCandidates.length > 0 ? Math.max(nowMs, ...retryCandidates) : null,
  });
}

/**
 * Acquires a transaction-scoped lock for one storage key.
 *
 * @param client - Active transaction client.
 * @param key - Bucket key.
 * @returns Promise resolving after lock acquisition.
 */
async function lockBucket(client: PoolClient, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
}

/**
 * Parses a non-negative integer header.
 *
 * @param value - Raw header value.
 * @returns Parsed value or null.
 */
function parseNonNegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  return Number(value);
}

/**
 * Parses Retry-After seconds or HTTP date.
 *
 * @param value - Header value.
 * @param nowMs - Current time.
 * @returns Retry epoch milliseconds or null.
 */
function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return nowMs + Math.ceil(Number(value) * 1_000);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses a documented seconds-until-retry header.
 *
 * @param value - Header value.
 * @param nowMs - Current time.
 * @returns Retry epoch milliseconds or null.
 */
function parseDelaySeconds(value: string | null, nowMs: number): number | null {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  return nowMs + Math.ceil(Number(value) * 1_000);
}

/**
 * Parses a reset header as absolute Unix epoch seconds.
 *
 * @param value - Header value.
 * @returns Reset epoch milliseconds or null.
 */
function parseEpochSeconds(value: string | null): number | null {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  return Math.ceil(Number(value) * 1_000);
}

/**
 * Abort-aware real-time sleep used outside deterministic tests.
 *
 * @param milliseconds - Positive delay.
 * @param signal - Optional cancellation signal.
 * @returns Promise resolving after the delay.
 */
async function sleepFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(
          signal.reason instanceof Error ? signal.reason : new Error('Rate-limit wait aborted'),
        );
      },
      { once: true },
    );
  });
}
