import type { Provider } from '@nestjs/common';
import type { Pool } from 'pg';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_POOL } from './database.js';
import { ObservabilityService } from './observability.service.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { WB_TOKEN_PROFILE } from './wb-integration.js';
import { DataSyncRepository, WbDataSyncWorker } from '@wb-bidder/data-sync';
import { DecisionRepository } from '@wb-bidder/decision-engine';
import { formatAccountLocalDate, type AppConfiguration } from '@wb-bidder/config';
import {
  CURRENT_ENDPOINT_PROFILE,
  type EndpointKey,
  type RateLimitProfile,
} from '@wb-bidder/contracts';
import {
  CircuitBreakerRegistry,
  PostgresRateLimitStore,
  WbApiClient,
  WbRateLimiter,
  applyStricterOverrides,
  createNodeWbFetch,
  selectRateLimitProfile,
  type RateProfileSelection,
  type ValidatedTokenProfile,
  type WbRequestObservation,
} from '@wb-bidder/wb-api';
import { WbCardBidGateway, WritePipelineRepository } from '@wb-bidder/write-pipeline';

/** Nest token for the shared circuit-breaker registry. */
export const WB_BREAKERS = Symbol('WB_BREAKERS');
/** Nest token for the production WB API client. */
export const WB_API_CLIENT = Symbol('WB_API_CLIENT');
/** Nest token for data synchronization persistence. */
export const DATA_SYNC_REPOSITORY = Symbol('DATA_SYNC_REPOSITORY');
/** Nest token for the quota-aware synchronization worker. */
export const DATA_SYNC_WORKER = Symbol('DATA_SYNC_WORKER');
/** Nest token for decision persistence. */
export const DECISION_REPOSITORY = Symbol('DECISION_REPOSITORY');
/** Nest token for durable write persistence. */
export const WRITE_PIPELINE_REPOSITORY = Symbol('WRITE_PIPELINE_REPOSITORY');
/** Nest token for the card-bid gateway. */
export const CARD_BID_GATEWAY = Symbol('CARD_BID_GATEWAY');

/**
 * Production runtime providers sharing one pool, limiter, breakers, and WB client.
 */
export const runtimeProviders: readonly Provider[] = [
  {
    provide: WB_BREAKERS,
    useFactory: createCircuitBreakerRegistry,
  },
  {
    inject: [APP_CONFIGURATION, DATABASE_POOL, WB_TOKEN_PROFILE, WB_BREAKERS, ObservabilityService],
    provide: WB_API_CLIENT,
    useFactory: createWbApiClient,
  },
  {
    inject: [DATABASE_POOL],
    provide: DATA_SYNC_REPOSITORY,
    useFactory: createDataSyncRepository,
  },
  {
    inject: [APP_CONFIGURATION, WB_API_CLIENT, DATA_SYNC_REPOSITORY, RuntimeClockService],
    provide: DATA_SYNC_WORKER,
    useFactory: createDataSyncWorker,
  },
  {
    inject: [DATABASE_POOL],
    provide: DECISION_REPOSITORY,
    useFactory: createDecisionRepository,
  },
  {
    inject: [DATABASE_POOL],
    provide: WRITE_PIPELINE_REPOSITORY,
    useFactory: createWritePipelineRepository,
  },
  {
    inject: [WB_API_CLIENT],
    provide: CARD_BID_GATEWAY,
    useFactory: createCardBidGateway,
  },
] as const;

/**
 * Creates the shared circuit-breaker registry.
 *
 * @returns Empty registry.
 */
function createCircuitBreakerRegistry(): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry();
}

/**
 * Creates data-sync persistence.
 *
 * @param pool - Shared database pool.
 * @returns Repository.
 */
function createDataSyncRepository(pool: Pool): DataSyncRepository {
  return new DataSyncRepository(pool);
}

/**
 * Creates decision persistence.
 *
 * @param pool - Shared database pool.
 * @returns Repository.
 */
function createDecisionRepository(pool: Pool): DecisionRepository {
  return new DecisionRepository(pool);
}

/**
 * Creates write-pipeline persistence.
 *
 * @param pool - Shared database pool.
 * @returns Repository.
 */
function createWritePipelineRepository(pool: Pool): WritePipelineRepository {
  return new WritePipelineRepository(pool);
}

/**
 * Creates the card-bid WB gateway.
 *
 * @param client - Shared WB client.
 * @returns Gateway.
 */
function createCardBidGateway(client: WbApiClient): WbCardBidGateway {
  return new WbCardBidGateway(client);
}

/**
 * Creates one runtime WB adapter over a cross-replica PostgreSQL limiter.
 *
 * @param configuration - Validated environment.
 * @param pool - Shared pool.
 * @param token - Safe decoded token profile.
 * @param breakers - Shared circuit breakers.
 * @param observability - Bounded telemetry sink.
 * @returns Configured client without performing network I/O.
 */
function createWbApiClient(
  configuration: AppConfiguration,
  pool: Pool,
  token: ValidatedTokenProfile,
  breakers: CircuitBreakerRegistry,
  observability: ObservabilityService,
): WbApiClient {
  const baseLimits = selectRateLimitProfile(selectRateProfile(configuration, token));
  const endpointLimits = applyStricterOverrides(
    baseLimits,
    parseRateLimitOverrides(configuration.wb.rateLimitOverrides, baseLimits),
  );
  return new WbApiClient({
    baseUrl: configuration.wb.baseUrl,
    breakers,
    commonBaseUrl:
      configuration.wb.mode === 'mock'
        ? configuration.wb.baseUrl
        : new URL('https://common-api.wildberries.ru'),
    fetch: createNodeWbFetch(configuration.wb.connectTimeoutMs),
    maxInFlight: configuration.wb.maxInFlight,
    observeRequest: recordWbObservation.bind(null, observability),
    rateLimiter: new WbRateLimiter(
      token.sellerSid,
      endpointLimits,
      {
        burst: configuration.wb.globalRateLimitBurst,
        intervalMs: configuration.wb.globalRateLimitIntervalMs,
        requests: configuration.wb.globalRateLimitRequests,
      },
      new PostgresRateLimitStore(pool),
    ),
    readRetryPolicy: {
      baseMs: configuration.wb.readRetryBaseMs,
      capMs: configuration.wb.readRetryCapMs,
      deadlineMs: configuration.wb.timeoutMs * configuration.wb.readMaximumAttempts,
      maxAttempts: configuration.wb.readMaximumAttempts,
    },
    timeoutMs: configuration.wb.timeoutMs,
    token: configuration.wb.token,
    writesEnabled: configuration.wb.writesEnabled && token.writeCapable,
  });
}

/**
 * Creates the bounded data-sync worker.
 *
 * @param configuration - Validated schedules and freshness thresholds.
 * @param client - Shared WB adapter.
 * @param repository - Data-sync persistence.
 * @param clock - Wall or deterministic mock model clock.
 * @returns Worker with account-local overlap dates.
 */
function createDataSyncWorker(
  configuration: AppConfiguration,
  client: WbApiClient,
  repository: DataSyncRepository,
  clock: RuntimeClockService,
): WbDataSyncWorker {
  return new WbDataSyncWorker(
    client,
    repository,
    {
      bidStateMaxObservationGapMinutes: configuration.sync.bidStateMaxObservationGapMinutes,
      campaignStatisticsFreshnessMinutes: configuration.sync.campaignStatisticsFreshnessMinutes,
      conversionLagDays: configuration.sync.conversionLagDays,
      currentStateDeadlineMs: configuration.sync.currentStateDeadlineMs,
      currentStateFreshnessMinutes: configuration.sync.currentBidFreshnessMinutes,
      dayFinalizationStableMinutes: configuration.sync.dayFinalizationStableMinutes,
      dayFinalizationStableReads: configuration.sync.dayFinalizationStableReads,
      externalWriteControlMode: configuration.sync.externalWriteControlMode,
      minimumBidFreshnessMinutes: configuration.sync.minimumBidFreshnessMinutes,
      pageSize: configuration.sync.pageSize,
      fullstatsContractVerified:
        configuration.wb.mode === 'mock' ||
        CURRENT_ENDPOINT_PROFILE.wireContracts.fullstatsMoneyAndAggregation.status === 'VERIFIED',
      sameDaySpendContractVerified:
        configuration.wb.mode === 'mock' ||
        CURRENT_ENDPOINT_PROFILE.wireContracts.sameDaySpend.status === 'VERIFIED',
      /**
       * Resolves the overlap start from the refreshed model clock.
       *
       * @returns Account-local inclusive start.
       */
      statisticsBeginDate: () => statisticsBeginDate(configuration.accountTimezone, clock.now()),
      /**
       * Resolves the overlap end from the refreshed model clock.
       *
       * @returns Account-local inclusive end.
       */
      statisticsEndDate: () => statisticsEndDate(configuration.accountTimezone, clock.now()),
    },
    CURRENT_ENDPOINT_PROFILE,
    () => clock.now(),
  );
}

/**
 * Selects a pinned token/environment limiter profile.
 *
 * @param configuration - Validated environment.
 * @param token - Decoded token type.
 * @returns Immutable profile selection.
 */
function selectRateProfile(
  configuration: AppConfiguration,
  token: ValidatedTokenProfile,
): RateProfileSelection {
  if (configuration.wb.mode === 'sandbox' || configuration.wb.mode === 'mock') {
    return 'TEST+SANDBOX';
  }
  if (token.tokenType === 'BASE') return 'BASE+PROD';
  return 'PERSONAL+PROD';
}

/**
 * Validates unknown JSON overrides against the fixed endpoint-key set.
 *
 * @param source - Parsed configuration JSON.
 * @param base - Embedded profile used to reject unknown keys.
 * @returns Typed override subset.
 */
function parseRateLimitOverrides(
  source: Readonly<Record<string, unknown>>,
  base: Readonly<Record<EndpointKey, RateLimitProfile>>,
): Readonly<Partial<Record<EndpointKey, RateLimitProfile>>> {
  const result: Partial<Record<EndpointKey, RateLimitProfile>> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (!(rawKey in base)) {
      throw new Error(`Unknown WB rate-limit endpoint override: ${rawKey}`);
    }
    if (!isRateLimitProfile(rawValue)) {
      throw new Error(`Invalid WB rate-limit override: ${rawKey}`);
    }
    result[rawKey as EndpointKey] = Object.freeze({ ...rawValue });
  }
  return Object.freeze(result);
}

/**
 * Checks a rate-limit JSON value without unsafe type assertions.
 *
 * @param value - Unknown JSON.
 * @returns Whether all three positive integer fields are present.
 */
function isRateLimitProfile(value: unknown): value is RateLimitProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return (
    Number.isInteger(record.requests) &&
    Number(record.requests) > 0 &&
    Number.isInteger(record.intervalMs) &&
    Number(record.intervalMs) > 0 &&
    Number.isInteger(record.burst) &&
    Number(record.burst) > 0
  );
}

/**
 * Records one low-cardinality WB request observation.
 *
 * @param observability - Metrics service.
 * @param observation - Sanitized adapter telemetry.
 * @returns Nothing.
 */
function recordWbObservation(
  observability: ObservabilityService,
  observation: WbRequestObservation,
): void {
  const statusClass =
    observation.status === null ? 'transport' : `${String(Math.floor(observation.status / 100))}xx`;
  observability.wbRequests.inc({
    endpoint: observation.endpointKey,
    status_class: statusClass,
  });
  observability.wbRequestDuration.observe(
    { endpoint: observation.endpointKey },
    observation.latencyMs / 1_000,
  );
  observability.wbRateLimitWait.observe(
    { endpoint: observation.endpointKey },
    observation.limiterWaitMs / 1_000,
  );
  if (observation.status === 429) {
    observability.wb429.inc({ endpoint: observation.endpointKey });
  }
}

/**
 * Returns the inclusive 32-day overlap start.
 *
 * @param timezone - Account timezone.
 * @param now - Refreshed model instant.
 * @returns Account-local date.
 */
function statisticsBeginDate(timezone: string, now: Date): string {
  return formatAccountLocalDate(timezone, new Date(now.getTime() - 32 * 86_400_000));
}

/**
 * Returns the current overlap end.
 *
 * @param timezone - Account timezone.
 * @param now - Refreshed model instant.
 * @returns Account-local date.
 */
function statisticsEndDate(timezone: string, now: Date): string {
  return formatAccountLocalDate(timezone, now);
}
