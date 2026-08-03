import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_CLIENT } from './database.js';
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
import type { DatabaseClient } from '@wb-bidder/database';
import {
  CURRENT_ENDPOINT_PROFILE,
  type EndpointKey,
  type RateLimitProfile,
} from '@wb-bidder/contracts';
import { WbApiClient, type ValidatedTokenProfile } from '@wb-bidder/wb-api';

/**
 * Performs fail-closed production initialization before any scheduler callback is registered.
 */
@Injectable()
export class RuntimeCoordinatorService implements OnApplicationBootstrap {
  /**
   * Creates the startup coordinator.
   *
   * @param configuration - Validated environment.
   * @param database - Shared Prisma Client.
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
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
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
   * Validates identity/binding, initial policy, recovery, and capacity in order.
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
    const existing = await this.database.biddingPolicy.findFirst({
      select: { id: true },
      where: { scope: 'DEPLOYMENT' },
    });
    if (existing !== null) return;
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
    const campaigns = await this.database.campaign.count({
      where: { supported: true },
    });
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
