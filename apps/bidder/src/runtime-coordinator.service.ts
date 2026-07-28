import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_POOL } from './database.js';
import { ObservabilityService } from './observability.service.js';
import { DATA_SYNC_REPOSITORY, DECISION_REPOSITORY, WB_API_CLIENT } from './runtime.providers.js';
import { RuntimeSafetyState } from './runtime-state.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { CronSchedule, SchedulerService } from './scheduler.service.js';
import { WriteRuntimeService } from './write-runtime.service.js';
import { WB_TOKEN_PROFILE } from './wb-integration.js';
import {
  calculateCurrentStateCapacity,
  calculateMinimumBidCapacity,
  DataSyncRepository,
  type AccountBindingCandidate,
} from '@wb-bidder/data-sync';
import { DecisionRepository, initialObserveOnlyPolicy } from '@wb-bidder/decision-engine';
import type { AppConfiguration } from '@wb-bidder/config';
import {
  CURRENT_ENDPOINT_PROFILE,
  type EndpointKey,
  type RateLimitProfile,
} from '@wb-bidder/contracts';
import { WbApiClient, type ValidatedTokenProfile } from '@wb-bidder/wb-api';

const REQUIRED_MIGRATIONS = Object.freeze([
  '202607281330_initial',
  '202607281410_stage1_rate_limiter',
  '202607281500_stage2_sync_evidence',
  '202607281600_stage3_decision_engine',
  '202607281700_stage4_write_pipeline',
  '202607291000_stage5_production_runtime',
]);

/**
 * Performs fail-closed production initialization before any scheduler callback is registered.
 */
@Injectable()
export class RuntimeCoordinatorService implements OnApplicationBootstrap {
  /**
   * Creates the startup coordinator.
   *
   * @param configuration - Validated environment.
   * @param pool - Shared database.
   * @param token - Safe decoded token profile.
   * @param wbClient - Quota-aware integration client.
   * @param dataRepository - Binding and scheduler persistence.
   * @param decisionRepository - Initial safe policy persistence.
   * @param writeRuntime - Crash-window recovery.
   * @param scheduler - Permanent scheduler.
   * @param observability - Cached readiness and metrics.
   * @param runtimeState - Process-local closing gates.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(WB_TOKEN_PROFILE) private readonly token: ValidatedTokenProfile,
    @Inject(WB_API_CLIENT) private readonly wbClient: WbApiClient,
    @Inject(DATA_SYNC_REPOSITORY) private readonly dataRepository: DataSyncRepository,
    @Inject(DECISION_REPOSITORY) private readonly decisionRepository: DecisionRepository,
    private readonly writeRuntime: WriteRuntimeService,
    private readonly scheduler: SchedulerService,
    private readonly observability: ObservabilityService,
    private readonly runtimeState: RuntimeSafetyState,
    private readonly clock: RuntimeClockService,
  ) {}

  /**
   * Validates migrations, identity/binding, initial policy, recovery, and capacity in order.
   *
   * Scheduler-disabled mode is an explicit maintenance mode: HTTP/Admin may start, but readiness
   * and all write gates remain closed.
   *
   * @returns Promise resolving after safe scheduler registration.
   */
  public async onApplicationBootstrap(): Promise<void> {
    if (!this.configuration.schedulerEnabled) {
      this.runtimeState.setCapacityAllowsWrites(false);
      this.runtimeState.setIntegrationAuthorized(false);
      return;
    }
    await this.clock.refresh();
    await this.assertMigrationsApplied();
    const candidate = await this.confirmRemoteIdentity();
    await this.dataRepository.ensureAccountBinding(candidate, randomUUID());
    this.runtimeState.confirmAccountBinding();
    this.runtimeState.setIntegrationAuthorized(true);
    this.observability.integrationSucceeded(new Date());
    await this.ensureInitialPolicy();
    await this.writeRuntime.recoverCrashWindows();
    this.scheduler.setCapacityRefresh(() => this.evaluateCapacity());
    await this.evaluateCapacity();
    this.scheduler.start();
  }

  /**
   * Confirms seller identity through an authorized call appropriate to the environment.
   *
   * @returns Binding candidate containing no secret.
   */
  private async confirmRemoteIdentity(): Promise<AccountBindingCandidate> {
    let sellerSid = this.token.sellerSid;
    if (this.configuration.wb.mode === 'prod' || this.configuration.wb.mode === 'mock') {
      const seller = await this.wbClient.getSellerInfo();
      if (seller.sid !== this.token.sellerSid) {
        throw new Error('ACCOUNT_IDENTITY_MISMATCH');
      }
      sellerSid = seller.sid;
    } else {
      await this.wbClient.ping();
    }
    return Object.freeze({
      accountCurrency: this.configuration.accountCurrency,
      accountTimezone: this.configuration.accountTimezone,
      environment:
        this.configuration.wb.mode === 'prod'
          ? 'PROD'
          : this.configuration.wb.mode === 'sandbox'
            ? 'SANDBOX'
            : 'MOCK',
      sellerSid,
      tokenCategory: 'PROMOTION',
      tokenFingerprint: this.token.identityFingerprint,
      tokenFor: this.token.tokenType === 'PERSONAL' ? 'SELF' : null,
      tokenType:
        this.token.tokenType === 'PERSONAL'
          ? 'PERSONAL'
          : this.token.tokenType === 'BASE'
            ? 'BASE'
            : 'TEST',
    });
  }

  /**
   * Creates the normative safe deployment policy only when no deployment policy exists.
   *
   * @returns Nothing after existing or newly created policy is available.
   */
  private async ensureInitialPolicy(): Promise<void> {
    const existing = await this.pool.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "BiddingPolicy" WHERE "scope" = 'DEPLOYMENT'
       ) AS present`,
    );
    if (existing.rows[0]?.present === true) return;
    await this.decisionRepository.createPolicyVersion({
      actor: 'SYSTEM',
      campaignId: null,
      changeReason: 'Initial safe observe-only policy',
      configuration: initialObserveOnlyPolicy(),
      correlationId: randomUUID(),
      scope: 'DEPLOYMENT',
      targetId: null,
      validFrom: new Date(0),
    });
  }

  /**
   * Proves current-state and minimum-bid capacity for the actual campaign scope.
   *
   * @returns Nothing after updating the close-only runtime gate and ETA metrics.
   */
  private async evaluateCapacity(): Promise<void> {
    const count = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "Campaign" WHERE "supported" = true`,
    );
    const campaigns = Number(count.rows[0]?.count ?? '0');
    const limits = selectEmbeddedLimits(this.configuration, this.token);
    const currentProfile = stricterConfiguredLimit(
      limits.campaignDetails,
      this.configuration.wb.rateLimitOverrides.campaignDetails,
    );
    const minimumProfile = stricterConfiguredLimit(
      limits.cardMinimumBids,
      this.configuration.wb.rateLimitOverrides.cardMinimumBids,
    );
    const currentScheduleMinutes = new CronSchedule(
      this.configuration.sync.currentStateCron,
    ).minimumIntervalMinutes();
    const current = calculateCurrentStateCapacity(
      campaigns,
      50,
      currentProfile.requests / (currentProfile.intervalMs / 1_000),
      currentScheduleMinutes,
      this.configuration.sync.currentStateDeadlineMs / 60_000,
      this.configuration.sync.bidStateMaxObservationGapMinutes,
      this.configuration.sync.currentBidFreshnessMinutes,
    );
    const minimum = calculateMinimumBidCapacity(
      campaigns,
      minimumProfile.requests / (minimumProfile.intervalMs / 60_000),
      this.configuration.sync.minimumBidTargetSlaMinutes,
    );
    this.runtimeState.setCapacityAllowsWrites(
      current.applyCapacityProven && minimum.applyCapacityProven,
    );
    this.observability.syncFullPassEta.set(
      { data_kind: 'CURRENT_BID' },
      current.fullPassLowerBoundSeconds,
    );
    this.observability.syncFullPassEta.set(
      { data_kind: 'MINIMUM_BID' },
      minimum.fullPassLowerBoundMinutes * 60,
    );
    if (!current.applyCapacityProven) {
      this.observability.syncSlaViolations.inc({ data_kind: 'CURRENT_BID' });
    }
    if (!minimum.applyCapacityProven) {
      this.observability.syncSlaViolations.inc({ data_kind: 'MINIMUM_BID' });
    }
  }

  /**
   * Requires every migration embedded in this artifact to be marked successful.
   *
   * @returns Nothing.
   * @throws {Error} When migration state is incomplete.
   */
  private async assertMigrationsApplied(): Promise<void> {
    const result = await this.pool.query<{ migration_name: string }>(
      `SELECT migration_name
         FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const applied = new Set(result.rows.map((row) => row.migration_name));
    if (REQUIRED_MIGRATIONS.some((migration) => !applied.has(migration))) {
      throw new Error('DATABASE_MIGRATIONS_INCOMPLETE');
    }
  }
}

/**
 * Selects the embedded limiter map for the validated environment/token.
 *
 * @param configuration - Environment.
 * @param token - Token type.
 * @returns Embedded endpoint limits.
 */
function selectEmbeddedLimits(
  configuration: AppConfiguration,
  token: ValidatedTokenProfile,
): Readonly<Record<EndpointKey, RateLimitProfile>> {
  if (configuration.wb.mode === 'sandbox') return CURRENT_ENDPOINT_PROFILE.testSandboxLimits;
  if (token.tokenType === 'BASE') return CURRENT_ENDPOINT_PROFILE.baseProductionLimits;
  return CURRENT_ENDPOINT_PROFILE.personalProductionLimits;
}

/**
 * Applies an already configuration-validated restrictive override for capacity math.
 *
 * @param embedded - Embedded limit.
 * @param source - Optional unknown JSON value.
 * @returns Effective conservative limit.
 */
function stricterConfiguredLimit(embedded: RateLimitProfile, source: unknown): RateLimitProfile {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return embedded;
  const record = source as Readonly<Record<string, unknown>>;
  if (
    !Number.isInteger(record.requests) ||
    !Number.isInteger(record.intervalMs) ||
    !Number.isInteger(record.burst)
  ) {
    return embedded;
  }
  return Object.freeze({
    burst: Math.min(embedded.burst, Number(record.burst)),
    intervalMs: Number(record.intervalMs),
    requests: Number(record.requests),
  });
}
