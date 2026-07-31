import {
  CURRENT_ENDPOINT_PROFILE,
  type EndpointKey,
  type RateLimitProfile,
} from '@wb-bidder/contracts';
import { advisoryTransactionLock, withTransaction, type DatabaseClient } from '@wb-bidder/database';

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
export class PrismaRateLimitStore implements RateLimitStore {
  /**
   * Creates a store over the shared Prisma Client.
   *
   * The migration must create wb_rate_limit_bucket before scheduler startup.
   *
   * @param database - Shared Prisma Client.
   */
  public constructor(private readonly database: DatabaseClient) {}

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
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `rate-limit:${key}`);
      const row = await transaction.wbRateLimitBucket.findUnique({
        where: { bucketKey: key },
      });
      const blockedUntilMs = Number(row?.blockedUntilMs ?? 0n);
      if (blockedUntilMs > nowMs) {
        return { allowed: false, retryAtMs: blockedUntilMs };
      }
      const lastRefillAtMs = Number(row?.lastRefillAtMs ?? BigInt(nowMs));
      const refillRate = profile.requests / profile.intervalMs;
      const tokens = Math.min(
        profile.burst,
        (row === null ? profile.burst : Number(row.tokens)) +
          Math.max(0, nowMs - lastRefillAtMs) * refillRate,
      );
      if (tokens < 1) {
        return { allowed: false, retryAtMs: nowMs + Math.ceil((1 - tokens) / refillRate) };
      }
      await transaction.wbRateLimitBucket.upsert({
        create: {
          blockedUntilMs: BigInt(blockedUntilMs),
          bucketKey: key,
          lastRefillAtMs: BigInt(nowMs),
          tokens: tokens - 1,
        },
        update: {
          blockedUntilMs: BigInt(blockedUntilMs),
          lastRefillAtMs: BigInt(nowMs),
          tokens: tokens - 1,
        },
        where: { bucketKey: key },
      });
      return { allowed: true, retryAtMs: nowMs };
    });
  }

  /**
   * Persists a monotonic server-directed freeze across replicas.
   *
   * @param key - Bucket key.
   * @param untilMs - Earliest allowed epoch millisecond.
   * @returns Promise resolving after persistence.
   */
  public async freeze(key: string, untilMs: number): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `rate-limit:${key}`);
      const current = await transaction.wbRateLimitBucket.findUnique({
        select: { blockedUntilMs: true },
        where: { bucketKey: key },
      });
      await transaction.wbRateLimitBucket.upsert({
        create: {
          blockedUntilMs: BigInt(untilMs),
          bucketKey: key,
          lastRefillAtMs: BigInt(untilMs),
          tokens: 0,
        },
        update: {
          blockedUntilMs:
            current === null
              ? BigInt(untilMs)
              : current.blockedUntilMs > BigInt(untilMs)
                ? current.blockedUntilMs
                : BigInt(untilMs),
        },
        where: { bucketKey: key },
      });
    });
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
