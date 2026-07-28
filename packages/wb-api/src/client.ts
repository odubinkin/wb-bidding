import {
  bidRecommendationsResponseSchema,
  campaignBudgetResponseSchema,
  campaignCountResponseSchema,
  campaignDetailsResponseSchema,
  campaignStatisticsResponseSchema,
  cardWriteBidsSchema,
  clusterBidsResponseSchema,
  clusterListResponseSchema,
  clusterStatisticsRequestSchema,
  clusterStatisticsResponseSchema,
  clusterWriteRequestSchema,
  clusterPairsRequestSchema,
  minimumBidsRequestSchema,
  minimumBidsResponseSchema,
  pingResponseSchema,
  sellerInfoResponseSchema,
  type BidRecommendationsResponse,
  type CampaignCountResponse,
  type CampaignDetailsResponse,
  type CardWriteBids,
  type ClusterPairsRequest,
  type ClusterStatisticsRequest,
  type ClusterWriteRequest,
  type MinimumBidsRequest,
  type MinimumBidsResponse,
} from './schemas.js';
import { endpointDefinition, type WbEndpointDefinition } from './endpoint-registry.js';
import {
  WbApiError,
  classifyHttpFailure,
  withBoundedRetry,
  type CircuitBreaker,
  type CircuitBreakerRegistry,
  type RetryPolicy,
} from './resilience.js';
import type { WbRateLimiter } from './rate-limiter.js';
import type { EndpointKey } from '@wb-bidder/contracts';
import type { z } from 'zod';
import { WbTransportError } from './transport.js';

/**
 * Fetch-compatible transport boundary.
 */
export type WbFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Bounded telemetry emitted once for every admitted WB request.
 */
export interface WbRequestObservation {
  /** Endpoint registry key. */
  readonly endpointKey: EndpointKey;
  /** Total transport/application latency in milliseconds. */
  readonly latencyMs: number;
  /** Time spent waiting for distributed quota admission. */
  readonly limiterWaitMs: number;
  /** Stable outcome class without payload or credential data. */
  readonly outcome: 'error' | 'success';
  /** HTTP status when a response was received. */
  readonly status: number | null;
}

/**
 * Immutable WB client configuration.
 */
export interface WbClientConfiguration {
  /** Promotion API origin selected by mode. */
  readonly baseUrl: URL;
  /** Circuit breakers shared across calls. */
  readonly breakers: CircuitBreakerRegistry;
  /** Common API origin used only for seller identity. */
  readonly commonBaseUrl: URL;
  /** Contract contour; verified-mock is accepted only for a loopback/local mock origin. */
  readonly contractMode?: 'production' | 'verified-mock';
  /** HTTP transport. */
  readonly fetch: WbFetch;
  /** Maximum simultaneous requests. */
  readonly maxInFlight: number;
  /** Optional bounded telemetry sink. */
  readonly observeRequest?: (observation: WbRequestObservation) => void;
  /** Read/verify retry policy. */
  readonly readRetryPolicy: RetryPolicy;
  /** Shared two-level account limiter. */
  readonly rateLimiter: WbRateLimiter;
  /** Per-attempt timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Secret authorization value retained only at transport boundary. */
  readonly token: string;
  /** Effective integration write gate. */
  readonly writesEnabled: boolean;
}

/**
 * One already-admitted card-write slot. A reservation is single-use and must be released.
 */
export interface ReservedCardBidWrite {
  dispatch(request: CardWriteBids): Promise<CardWriteBids>;
  release(): void;
}

/**
 * One admitted cluster write/delete slot. The reservation is single-use.
 */
export interface ReservedClusterBidWrite {
  dispatch(request: ClusterWriteRequest): Promise<z.infer<typeof clusterBidsResponseSchema>>;
  release(): void;
}

/**
 * Validated WB API adapter with exact current paths and fail-closed write gates.
 */
export class WbApiClient {
  private readonly semaphore: Semaphore;

  /**
   * Creates an adapter without performing network I/O.
   *
   * @param configuration - Fully validated transport and safety dependencies.
   */
  public constructor(private readonly configuration: WbClientConfiguration) {
    assertSafeOrigin(configuration.baseUrl, false);
    assertSafeOrigin(configuration.commonBaseUrl, true);
    if (
      configuration.contractMode === 'verified-mock' &&
      !isVerifiedMockOrigin(configuration.baseUrl)
    ) {
      throw new Error('Verified mock contract requires a loopback or wb-mock HTTP origin');
    }
    this.semaphore = new Semaphore(configuration.maxInFlight);
  }

  /**
   * Gets campaign groups and identifiers.
   *
   * @returns Validated campaign-list response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignCount(): Promise<CampaignCountResponse> {
    return this.read('campaignCount', campaignCountResponseSchema);
  }

  /**
   * Gets up to 50 campaign details.
   *
   * @param ids - Optional campaign IDs, maximum 50.
   * @param statuses - Optional supported WB statuses.
   * @param paymentType - Optional payment filter.
   * @returns Validated campaign details.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignDetails(
    ids: readonly number[] = [],
    statuses: readonly number[] = [],
    paymentType?: 'cpc' | 'cpm',
  ): Promise<CampaignDetailsResponse> {
    if (ids.length > 50) {
      throw new WbApiError('PAYLOAD', 'Campaign details accepts at most 50 IDs', null, false);
    }
    const query = new URLSearchParams();
    if (ids.length > 0) {
      query.set('ids', ids.join(','));
    }
    if (statuses.length > 0) {
      query.set('statuses', statuses.join(','));
    }
    if (paymentType !== undefined) {
      query.set('payment_type', paymentType);
    }
    return this.read('campaignDetails', campaignDetailsResponseSchema, query);
  }

  /**
   * Gets minimum card bids for one campaign and up to 100 articles.
   *
   * @param request - Exact current wire request; recommendation is singular here.
   * @returns Validated kopeck values.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getMinimumBids(request: MinimumBidsRequest): Promise<MinimumBidsResponse> {
    return this.read(
      'cardMinimumBids',
      minimumBidsResponseSchema,
      undefined,
      minimumBidsRequestSchema.parse(request),
    );
  }

  /**
   * Writes card bids in kopecks, up to 50 campaign groups.
   *
   * @param request - Exact card-bid payload.
   * @returns Validated WB echo response.
   * @throws {WbApiError} When the write gate is closed or outcome is unknown.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async writeCardBids(request: CardWriteBids): Promise<CardWriteBids> {
    return this.write('cardWriteBids', cardWriteBidsSchema, cardWriteBidsSchema.parse(request));
  }

  /**
   * Waits for write quota and an in-flight slot before the caller performs its final live read
   * freshness check and durable DISPATCHING commit.
   *
   * @returns Single-use admission whose dispatch does not wait on the limiter again.
   */
  public async reserveCardBidWrite(): Promise<ReservedCardBidWrite> {
    this.assertOperationAllowed('cardWriteBids', true, false);
    const limiterWaitMs = await this.configuration.rateLimiter.acquire('cardWriteBids');
    const releaseSemaphore = await this.semaphore.acquire();
    let active = true;
    /** Releases an unused reservation. */
    const release = (): void => {
      if (!active) return;
      active = false;
      releaseSemaphore();
    };
    return Object.freeze({
      /**
       * Dispatches exactly once using the admitted slot.
       *
       * @param request - Validated card-bid request.
       * @returns Validated WB echo.
       */
      dispatch: async (request: CardWriteBids): Promise<CardWriteBids> => {
        if (!active) {
          throw new WbApiError('CONTRACT', 'WB write admission was already consumed', null, false);
        }
        active = false;
        try {
          return await this.request(
            'cardWriteBids',
            cardWriteBidsSchema,
            undefined,
            cardWriteBidsSchema.parse(request),
            true,
            false,
            limiterWaitMs,
          );
        } finally {
          releaseSemaphore();
        }
      },
      release,
    });
  }

  /**
   * Reads cluster overrides without assigning a monetary unit to bid.
   *
   * @param request - Up to 100 campaign/article pairs.
   * @returns Validated raw cluster bid response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getClusterBids(
    request: ClusterPairsRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.read(
      'clusterCurrentBids',
      clusterBidsResponseSchema,
      undefined,
      clusterPairsRequestSchema.parse(request),
      true,
    );
  }

  /**
   * Lists visible active/inactive clusters for up to 100 pairs.
   *
   * @param request - Campaign/article pairs.
   * @returns Validated discovery response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async listClusters(
    request: ClusterPairsRequest,
  ): Promise<z.infer<typeof clusterListResponseSchema>> {
    return this.read(
      'clusterList',
      clusterListResponseSchema,
      undefined,
      clusterPairsRequestSchema.parse(request),
    );
  }

  /**
   * Fails closed until cluster unit/minimum/absence/delete semantics are VERIFIED.
   *
   * @param request - Raw cluster write request.
   * @returns Validated per-item echo if a future profile verifies the contract.
   * @throws {WbApiError} In the current profile because the cluster contract is UNVERIFIED.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async writeClusterBids(
    request: ClusterWriteRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.write(
      'clusterWriteBids',
      clusterBidsResponseSchema,
      clusterWriteRequestSchema.parse(request),
    );
  }

  /**
   * Fails closed until cluster absence/delete semantics are VERIFIED.
   *
   * @param request - Raw explicit overrides to restore to ABSENT.
   * @returns Validated deleted-item echo under a future verified profile.
   * @throws {WbApiError} In the current profile.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async deleteClusterBids(
    request: ClusterWriteRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.write(
      'clusterDeleteBids',
      clusterBidsResponseSchema,
      clusterWriteRequestSchema.parse(request),
    );
  }

  /**
   * Reserves one exact cluster POST or DELETE admission for the durable write pipeline.
   *
   * @param endpointKey - Verified mock cluster mutation.
   * @returns Single-use admitted dispatch.
   */
  public async reserveClusterBidWrite(
    endpointKey: 'clusterDeleteBids' | 'clusterWriteBids',
  ): Promise<ReservedClusterBidWrite> {
    this.assertOperationAllowed(endpointKey, true, false);
    const limiterWaitMs = await this.configuration.rateLimiter.acquire(endpointKey);
    const releaseSemaphore = await this.semaphore.acquire();
    let active = true;
    /** Releases this reservation without dispatch. */
    const release = (): void => {
      if (!active) return;
      active = false;
      releaseSemaphore();
    };
    return Object.freeze({
      /**
       * Dispatches exactly once through the already-admitted cluster slot.
       *
       * @param request - Validated cluster write/delete payload.
       * @returns Validated per-item echo.
       */
      dispatch: async (
        request: ClusterWriteRequest,
      ): Promise<z.infer<typeof clusterBidsResponseSchema>> => {
        if (!active) {
          throw new WbApiError('CONTRACT', 'WB write admission was already consumed', null, false);
        }
        active = false;
        try {
          return await this.request(
            endpointKey,
            clusterBidsResponseSchema,
            undefined,
            clusterWriteRequestSchema.parse(request),
            true,
            false,
            limiterWaitMs,
          );
        } finally {
          releaseSemaphore();
        }
      },
      release,
    });
  }

  /**
   * Gets campaign statistics for up to 50 IDs and at most 31 calendar days.
   *
   * Data remains observational while its money/aggregation contract is UNVERIFIED.
   *
   * @param ids - Campaign IDs, 1..50.
   * @param begin - Inclusive WB date.
   * @param end - Inclusive WB date.
   * @returns Runtime-validated raw statistics.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignStatistics(
    ids: readonly number[],
    begin: string,
    end: string,
  ): Promise<z.infer<typeof campaignStatisticsResponseSchema>> {
    if (ids.length < 1 || ids.length > 50) {
      throw new WbApiError('PAYLOAD', 'Fullstats requires 1..50 campaign IDs', null, false);
    }
    const query = new URLSearchParams({
      begin,
      end,
      ids: ids.join(','),
    });
    return this.read(
      'campaignStatistics',
      campaignStatisticsResponseSchema,
      query,
      undefined,
      true,
    );
  }

  /**
   * Gets daily cluster statistics with CPC impression fields optional.
   *
   * @param request - Date range and up to 100 pairs.
   * @returns Validated daily source rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getClusterStatistics(
    request: ClusterStatisticsRequest,
  ): Promise<z.infer<typeof clusterStatisticsResponseSchema>> {
    return this.read(
      'clusterStatistics',
      clusterStatisticsResponseSchema,
      undefined,
      clusterStatisticsRequestSchema.parse(request),
    );
  }

  /**
   * Gets CPM recommendation hints in kopecks.
   *
   * @param advertId - Campaign ID.
   * @param nmId - WB article ID.
   * @returns Validated hint response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getBidRecommendations(
    advertId: number,
    nmId: number,
  ): Promise<BidRecommendationsResponse> {
    return this.read(
      'bidRecommendations',
      bidRecommendationsResponseSchema,
      new URLSearchParams({ advertId: String(advertId), nmId: String(nmId) }),
    );
  }

  /**
   * Gets raw-normalized diagnostic campaign budget fields.
   *
   * No caller may interpret these fields as remaining balance while the profile is UNVERIFIED.
   *
   * @param advertId - Campaign ID.
   * @returns Validated diagnostic fields.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignBudget(
    advertId: number,
  ): Promise<z.infer<typeof campaignBudgetResponseSchema>> {
    return this.read(
      'campaignBudget',
      campaignBudgetResponseSchema,
      new URLSearchParams({ id: String(advertId) }),
      undefined,
      true,
    );
  }

  /**
   * Gets seller identity from the fixed common-api origin.
   *
   * @returns Validated seller identity.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  public async getSellerInfo(): Promise<z.infer<typeof sellerInfoResponseSchema>> {
    return this.read('sellerInfo', sellerInfoResponseSchema);
  }

  /**
   * Performs a quota-aware integration check.
   *
   * @returns Validated ping response.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  public async ping(): Promise<z.infer<typeof pingResponseSchema>> {
    return this.read('ping', pingResponseSchema);
  }

  /**
   * Executes one bounded read/verify request.
   *
   * @template T - Validated response.
   * @param endpointKey - Endpoint registry key.
   * @param schema - Runtime response schema.
   * @param query - Optional query.
   * @param body - Optional already validated body.
   * @param allowUnverifiedRead - Explicit observational-only contract opt-in.
   * @returns Validated response.
   */
  private async read<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    query?: URLSearchParams,
    body?: unknown,
    allowUnverifiedRead = false,
  ): Promise<T> {
    return withBoundedRetry(
      async () => this.request(endpointKey, schema, query, body, false, allowUnverifiedRead),
      this.configuration.readRetryPolicy,
    );
  }

  /**
   * Executes one non-blindly-retried write request.
   *
   * @template T - Validated response.
   * @param endpointKey - Write endpoint.
   * @param schema - Runtime response schema.
   * @param body - Validated body.
   * @returns Validated response.
   */
  private async write<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    body: unknown,
  ): Promise<T> {
    return this.request(endpointKey, schema, undefined, body, true, false);
  }

  /**
   * Performs one transport request under limiter, semaphore, host, redirect and breaker gates.
   *
   * @template T - Validated response.
   * @param endpointKey - Endpoint registry key.
   * @param schema - Runtime response schema.
   * @param query - Optional query.
   * @param body - Optional validated body.
   * @param write - Whether dispatch can mutate remote state.
   * @param allowUnverifiedRead - Explicit observational access.
   * @param admittedLimiterWaitMs - Limiter wait when admission was reserved by the caller.
   * @returns Validated response.
   */
  private async request<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    query: URLSearchParams | undefined,
    body: unknown,
    write: boolean,
    allowUnverifiedRead: boolean,
    admittedLimiterWaitMs?: number,
  ): Promise<T> {
    const { breaker, definition } = this.assertOperationAllowed(
      endpointKey,
      write,
      allowUnverifiedRead,
    );
    const limiterWaitMs =
      admittedLimiterWaitMs ?? (await this.configuration.rateLimiter.acquire(endpointKey));
    const release =
      admittedLimiterWaitMs === undefined ? await this.semaphore.acquire() : undefined;
    const startedAt = performance.now();
    let observedStatus: number | null = null;
    let outcome: WbRequestObservation['outcome'] = 'error';
    try {
      const baseUrl =
        endpointKey === 'sellerInfo'
          ? this.configuration.commonBaseUrl
          : this.configuration.baseUrl;
      const url = new URL(definition.path, baseUrl);
      if (query !== undefined) {
        url.search = query.toString();
      }
      assertRequestDestination(url, baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort(new Error('WB request timeout'));
      }, this.configuration.timeoutMs);
      let response: Response;
      try {
        response = await this.configuration.fetch(url, {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            Accept: 'application/json',
            Authorization: this.configuration.token,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          method: definition.method,
          redirect: 'manual',
          signal: controller.signal,
        });
        observedStatus = response.status;
      } catch (cause: unknown) {
        const provenPreByte = cause instanceof WbTransportError && cause.beforeBytes;
        const error =
          !write || provenPreByte
            ? new WbApiError(
                'TRANSPORT_PRE_BYTE',
                write ? 'WB write transport failed before connection' : 'WB read transport failed',
                null,
                true,
              )
            : new WbApiError(
                'WRITE_OUTCOME_UNKNOWN',
                'WB write transport failed after dispatch boundary',
                null,
                false,
              );
        breaker.recordFailure(error);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (response.status >= 300 && response.status < 400) {
        const error = new WbApiError(
          'CONTRACT',
          'WB redirect is forbidden',
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      await this.configuration.rateLimiter.observe(endpointKey, response.headers);
      const text = await response.text();
      if (!response.ok) {
        const error = classifyHttpFailure(
          response.status,
          write ? 'write' : 'read',
          write,
          text.slice(0, 1_024),
        );
        breaker.recordFailure(error);
        throw error;
      }
      let payload: unknown;
      try {
        payload = text === '' ? {} : JSON.parse(text);
      } catch {
        const error = new WbApiError(
          'CONTRACT',
          'WB returned non-JSON success payload',
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const error = new WbApiError(
          'CONTRACT',
          `WB response schema mismatch for ${endpointKey}`,
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      breaker.recordSuccess();
      outcome = 'success';
      return parsed.data;
    } finally {
      release?.();
      this.configuration.observeRequest?.(
        Object.freeze({
          endpointKey,
          latencyMs: Math.max(0, performance.now() - startedAt),
          limiterWaitMs,
          outcome,
          status: observedStatus,
        }),
      );
    }
  }

  /**
   * Validates endpoint contract, operation kind, write gate, and circuit state.
   *
   * @param endpointKey - Endpoint registry key.
   * @param write - Whether the requested operation mutates WB state.
   * @param allowUnverifiedRead - Whether an observational unverified read is explicitly allowed.
   * @returns Validated endpoint and its breaker.
   */
  private assertOperationAllowed(
    endpointKey: EndpointKey,
    write: boolean,
    allowUnverifiedRead: boolean,
  ): { readonly breaker: CircuitBreaker; readonly definition: WbEndpointDefinition } {
    const definition = endpointDefinition(endpointKey);
    const verifiedByMockProfile =
      this.configuration.contractMode === 'verified-mock' &&
      (endpointKey === 'clusterCurrentBids' ||
        endpointKey === 'clusterWriteBids' ||
        endpointKey === 'clusterDeleteBids');
    if (
      definition.status !== 'VERIFIED' &&
      !verifiedByMockProfile &&
      !(allowUnverifiedRead && !definition.isWrite)
    ) {
      throw new WbApiError(
        'CONTRACT',
        `WB endpoint contract is ${definition.status}: ${endpointKey}`,
        null,
        false,
      );
    }
    if (write !== definition.isWrite) {
      throw new WbApiError(
        'CONTRACT',
        'Adapter operation kind does not match endpoint',
        null,
        false,
      );
    }
    if (write && !this.configuration.writesEnabled) {
      throw new WbApiError('CAPABILITY', 'WB write gate is closed', null, false);
    }
    const breaker = this.configuration.breakers.forGroup(definition.group);
    breaker.assertRequestAllowed();
    return { breaker, definition };
  }
}

/**
 * Minimal fair FIFO semaphore bounding in-flight WB requests.
 */
class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  /**
   * Creates a semaphore.
   *
   * @param maximum - Positive concurrency ceiling.
   */
  public constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('WB max in-flight must be a positive integer');
    }
  }

  /**
   * Acquires one slot.
   *
   * @returns Idempotent release callback.
   */
  public async acquire(): Promise<() => void> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

/**
 * Validates a configured origin.
 *
 * @param url - Base URL.
 * @param common - Whether common-api is required for production HTTPS.
 * @returns Nothing when safe.
 */
function assertSafeOrigin(url: URL, common: boolean): void {
  if (url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new Error('WB base URL must not contain credentials or fragment');
  }
  if (url.protocol === 'https:') {
    const expected = common ? 'common-api.wildberries.ru' : 'advert-api.wildberries.ru';
    const sandbox = !common && url.hostname === 'advert-api-sandbox.wildberries.ru';
    if (url.hostname !== expected && !sandbox) {
      throw new Error('WB HTTPS base URL host is not allowed');
    }
  } else if (url.protocol !== 'http:') {
    throw new Error('WB base URL protocol is not allowed');
  }
}

/**
 * Restricts synthetic verified semantics to a local plain-HTTP mock boundary.
 *
 * @param url - Configured promotion origin.
 * @returns Whether the host is an allowed deterministic mock target.
 */
function isVerifiedMockOrigin(url: URL): boolean {
  if (url.protocol !== 'http:') return false;
  return (
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1' ||
    url.hostname === 'localhost' ||
    url.hostname === 'wb-mock'
  );
}

/**
 * Enforces same-origin transport and exact base path.
 *
 * @param requestUrl - Constructed request.
 * @param baseUrl - Approved origin.
 * @returns Nothing when the URL cannot exfiltrate Authorization.
 */
function assertRequestDestination(requestUrl: URL, baseUrl: URL): void {
  if (requestUrl.origin !== baseUrl.origin) {
    throw new Error('WB request destination escaped approved origin');
  }
}
