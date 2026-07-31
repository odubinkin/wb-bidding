import { Inject, Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_CLIENT } from './database.js';
import { ObservabilityService } from './observability.service.js';
import { DECISION_REPOSITORY } from './runtime.providers.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { RuntimeSafetyState } from './runtime-state.js';
import {
  CURRENT_ENDPOINT_PROFILE,
  MOCK_ENDPOINT_PROFILE,
  isCampaignApplyEligibleStatus,
} from '@wb-bidder/contracts';
import { formatAccountLocalDate, type AppConfiguration } from '@wb-bidder/config';
import {
  loadDecisionTargetPage,
  type DatabaseClient,
  type DecisionTargetRow,
} from '@wb-bidder/database';
import {
  DecisionRepository,
  decideBid,
  planLowerExperiment,
  scopedChecksum,
  validateDecisionPolicy,
  type DecisionInput,
  type DecisionPerformanceDay,
  type DecisionPolicy,
  type DecisionResult,
  type ExperimentPlanWrite,
} from '@wb-bidder/decision-engine';
import { bidRecommendationsResponseSchema } from '@wb-bidder/wb-api';

const DECISION_PAGE_SIZE = 500;

/**
 * Optional bounded scope used by a manual recalculation job.
 */
export interface DecisionJobScope {
  /** Optional campaign UUIDs. */
  readonly campaignIds?: readonly string[];
  /** Optional target UUIDs. */
  readonly targetIds?: readonly string[];
}

/**
 * Bounded target row required to reconstruct one deterministic decision input.
 */
/**
 * Database-backed Decision job that performs no WB network calls.
 */
@Injectable()
export class DecisionJobService {
  /**
   * Creates the Decision job.
   *
   * @param database - Authoritative Prisma Client.
   * @param repository - Atomic decision and queue persistence.
   * @param configuration - Account and safety configuration.
   * @param runtimeState - Runtime write gates.
   * @param observability - Bounded decision metrics.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(DECISION_REPOSITORY) private readonly repository: DecisionRepository,
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    private readonly runtimeState: RuntimeSafetyState,
    private readonly observability: ObservabilityService,
    private readonly clock: RuntimeClockService,
  ) {}

  /**
   * Processes all matching targets in stable bounded pages.
   *
   * @param signal - Scheduler deadline/shutdown cancellation.
   * @param scope - Optional manual-job filter.
   * @returns Counters for persisted and skipped targets.
   */
  public async run(
    signal: AbortSignal,
    scope: DecisionJobScope = {},
  ): Promise<{ readonly persisted: number; readonly skipped: number }> {
    const decisionAt = this.clock.now();
    let cursor = '00000000-0000-0000-0000-000000000000';
    let persisted = 0;
    let skipped = 0;
    for (;;) {
      if (signal.aborted) break;
      const page = await this.loadTargetPage(cursor, scope, decisionAt);
      if (page.length === 0) break;
      for (const row of page) {
        signal.throwIfAborted();
        const started = performance.now();
        try {
          const policy = parseDecisionPolicy(row.policyConfiguration, row.policyVersion);
          const effectivePolicy = this.effectivePolicy(policy, row);
          const days = await this.loadPerformanceDays(row.targetId, effectivePolicy, decisionAt);
          const input = this.buildInput(row, effectivePolicy, days, decisionAt);
          const ordinaryResult = decideBid(input);
          const exploration = this.planExploration(
            row,
            effectivePolicy,
            ordinaryResult,
            decisionAt,
          );
          const result = exploration?.result ?? ordinaryResult;
          await this.repository.persistDecision({
            calculatedAt: decisionAt,
            currentBidMinor: row.currentBidMinor,
            economicsId: row.economicsId,
            economicsVersion: row.economicsVersion,
            expectedContributionMinor: row.expectedContributionMinor,
            ...(exploration === null ? {} : { experiment: exploration.plan }),
            periodEnd:
              days.at(-1)?.date ??
              formatAccountLocalDate(this.configuration.accountTimezone, decisionAt),
            periodStart:
              days[0]?.date ??
              formatAccountLocalDate(this.configuration.accountTimezone, decisionAt),
            policyId: row.policyId,
            policyVersion: row.policyVersion,
            result,
            targetId: row.targetId,
          });
          persisted += 1;
          this.observability.decisions.inc({
            action: result.action,
            reason: result.outcomeReasonCode,
          });
        } catch (error: unknown) {
          skipped += 1;
          this.observability.dataInvalid.inc({
            reason:
              error instanceof Error && error.message.startsWith('INVALID_POLICY')
                ? 'INVALID_POLICY'
                : 'DECISION_INPUT_INVALID',
          });
        } finally {
          this.observability.decisionDuration.observe(
            Math.max(0, performance.now() - started) / 1_000,
          );
        }
      }
      cursor = page.at(-1)?.targetId ?? cursor;
      if (page.length < DECISION_PAGE_SIZE) break;
    }
    return Object.freeze({ persisted, skipped });
  }

  /**
   * Loads one stable target page and resolves policy/economics/snapshot at database time.
   *
   * @param cursor - Exclusive target UUID cursor.
   * @param scope - Optional bounded manual scope.
   * @param decisionAt - Stable run instant used for account-local daily anchors.
   * @returns Target rows.
   */
  private async loadTargetPage(
    cursor: string,
    scope: DecisionJobScope,
    decisionAt: Date,
  ): Promise<readonly DecisionTargetRow[]> {
    return Object.freeze(
      await loadDecisionTargetPage(this.database, {
        accountTimezone: this.configuration.accountTimezone,
        ...(scope.campaignIds === undefined ? {} : { campaignIds: scope.campaignIds }),
        cursor,
        decisionAt,
        endpointProfileId:
          this.configuration.wb.mode === 'mock'
            ? MOCK_ENDPOINT_PROFILE.profileId
            : CURRENT_ENDPOINT_PROFILE.profileId,
        pageSize: DECISION_PAGE_SIZE,
        ...(scope.targetIds === undefined ? {} : { targetIds: scope.targetIds }),
      }),
    );
  }

  /**
   * Loads finalized performance days inside the resolved baseline window.
   *
   * @param targetId - Target UUID.
   * @param policy - Resolved policy.
   * @param decisionAt - Stable model instant.
   * @returns Chronological immutable days.
   */
  private async loadPerformanceDays(
    targetId: string,
    policy: DecisionPolicy,
    decisionAt: Date,
  ): Promise<readonly DecisionPerformanceDay[]> {
    const anchorDate = formatAccountLocalDate(this.configuration.accountTimezone, decisionAt);
    const lowerBound = new Date(`${anchorDate}T00:00:00.000Z`);
    lowerBound.setUTCDate(
      lowerBound.getUTCDate() -
        (policy.baselineWindowDays + this.configuration.sync.conversionLagDays + 2),
    );
    const rows = await this.database.bidPerformanceDay.findMany({
      orderBy: [{ wbStatisticDate: 'asc' }, { confirmedBidMinor: 'asc' }],
      select: {
        activePlacementConfig: true,
        clicksDelta: true,
        confirmedBidMinor: true,
        inputChecksum: true,
        orderedUnitsDelta: true,
        spendDeltaMinor: true,
        viewsDelta: true,
        wbStatisticDate: true,
      },
      where: {
        status: 'FINALIZED',
        targetId,
        wbStatisticDate: { gte: lowerBound },
      },
    });
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          bidMinor: requireConfirmedBidMinor(row.confirmedBidMinor),
          clicks: row.clicksDelta,
          configurationChecksum:
            readJsonString(row.activePlacementConfig, 'configurationChecksum') ?? row.inputChecksum,
          date: row.wbStatisticDate.toISOString().slice(0, 10),
          inputChecksum: row.inputChecksum,
          orderedUnits: row.orderedUnitsDelta,
          spendMinor: row.spendDeltaMinor,
          views: row.viewsDelta,
        }),
      ),
    );
  }

  /**
   * Applies automation and deployment gates without weakening the stored policy.
   *
   * @param policy - Valid immutable policy.
   * @param row - Current automation state.
   * @returns Policy forced to observe-only when APPLY is not currently possible.
   */
  private effectivePolicy(policy: DecisionPolicy, row: DecisionTargetRow): DecisionPolicy {
    const automationApply =
      row.campaignAutomation === 'APPLY' &&
      (row.targetAutomation === null || row.targetAutomation === 'APPLY');
    const applyAllowed =
      automationApply &&
      row.activeExperimentStatus === null &&
      this.configuration.wb.writesEnabled &&
      this.runtimeState.writeBlocker() === null;
    return applyAllowed || policy.executionMode === 'OBSERVE_ONLY'
      ? policy
      : Object.freeze({ ...policy, executionMode: 'OBSERVE_ONLY' });
  }

  /**
   * Converts only an insufficient-data outcome into a bounded lower-only experiment.
   *
   * @param row - Current target state.
   * @param policy - Effective APPLY policy.
   * @param result - Ordinary deterministic engine result.
   * @param decisionAt - Stable model time.
   * @returns Atomic experiment plan and starting decision, or null.
   */
  private planExploration(
    row: DecisionTargetRow,
    policy: DecisionPolicy,
    result: DecisionResult,
    decisionAt: Date,
  ): { readonly plan: ExperimentPlanWrite; readonly result: DecisionResult } | null {
    if (
      !policy.explorationEnabled ||
      policy.executionMode !== 'APPLY' ||
      (this.configuration.wb.mode !== 'mock' &&
        CURRENT_ENDPOINT_PROFILE.wireContracts.sameDaySpend.status !== 'VERIFIED') ||
      result.outcomeReasonCode !== 'INSUFFICIENT_BID_RESPONSE_DATA' ||
      row.capability !== 'CARD_WRITE_READY' ||
      row.applyEligible !== true ||
      row.currentBidMinor === null ||
      row.minimumBidMinor === null ||
      row.expectedContributionMinor === null ||
      row.expectedContributionMinor <= 0n ||
      policy.maxExplorationSpendMinor === null
    ) {
      return null;
    }
    if (
      row.lastWriteAt !== null &&
      decisionAt.getTime() - new Date(row.lastWriteAt).getTime() < policy.cooldownMinutes * 60_000
    ) {
      return null;
    }
    const current = row.currentBidMinor;
    const dailyAnchor = row.dailyAnchorBidMinor ?? current;
    const cycleFloor =
      (current * BigInt(1_000_000 - policy.maxDecreasePerCyclePpm) + 999_999n) / 1_000_000n;
    const dailyFloor =
      (dailyAnchor * BigInt(1_000_000 - policy.maxDailyDecreasePpm) + 999_999n) / 1_000_000n;
    const floor = maximum(
      row.minimumBidMinor,
      policy.policyMinBidMinor ?? 0n,
      cycleFloor,
      dailyFloor,
    );
    const state = planLowerExperiment({
      currentBidMinor: current,
      explorationStepPpm: policy.explorationStepPpm,
      floorMinor: floor,
      maxSpendMinor: policy.maxExplorationSpendMinor,
      plannedFullDays: Math.max(policy.minExplorationFullDays, policy.minBidObservationDays),
      quantumMinor: 1n,
      safetyBufferPpm: policy.explorationSpendSafetyBufferPpm,
    });
    if (state === null) return null;
    const plan: ExperimentPlanWrite = Object.freeze({
      experimentBidMinor: state.experimentBidMinor,
      maxConcurrentPerAccount: policy.maxConcurrentExperimentsPerAccount,
      maxConcurrentPerCampaign: policy.maxConcurrentExperimentsPerCampaign,
      plannedFullDays: state.plannedFullDays,
      sourceBidMinor: state.sourceBidMinor,
      spendLimitMinor: state.spendLimitMinor,
      spendSafetyBufferMinor: state.spendSafetyBufferMinor,
    });
    const inputSnapshotChecksum = scopedChecksum('exploration-input-snapshot-v1', {
      ordinary: result.explanation.inputSnapshotChecksum,
      plan,
    });
    return Object.freeze({
      plan,
      result: Object.freeze({
        action: 'DECREASE',
        boundedBidMinor: state.experimentBidMinor,
        decisionInputChecksum: scopedChecksum('exploration-bid-decision-v1', {
          decisionAt,
          inputSnapshotChecksum,
          policyVersion: policy.version,
        }),
        explanation: Object.freeze({
          ...result.explanation,
          actionBlockers: Object.freeze([]),
          inputSnapshotChecksum,
          unconditionalBlockers: Object.freeze([]),
        }),
        guardrailCodes: Object.freeze([]),
        outcomeReasonCode: 'EXPLORATION_PLANNED',
        proposedBidMinor: state.experimentBidMinor,
        queueEligible: true,
        strategyReasonCode: 'EXPLORATION_PLANNED',
      }),
    });
  }

  /**
   * Builds one pure engine input from persisted normalized evidence.
   *
   * @param row - Target row.
   * @param policy - Effective policy.
   * @param days - Finalized performance days.
   * @param decisionAt - Stable calculation instant.
   * @returns Complete input.
   */
  private buildInput(
    row: DecisionTargetRow,
    policy: DecisionPolicy,
    days: readonly DecisionPerformanceDay[],
    decisionAt: Date,
  ): DecisionInput {
    const currentBid = row.currentBidMinor ?? 0n;
    const accountLocalDate = formatAccountLocalDate(this.configuration.accountTimezone, decisionAt);
    const recommendationBidHintsMinor = extractRecommendationHints(
      row.recommendationData,
      row.normQueryCanonical,
    );
    const sameDaySpend = parseSameDaySpend(row.sameDaySpendData, accountLocalDate);
    const sameDaySpendVerified =
      this.configuration.wb.mode === 'mock' ||
      CURRENT_ENDPOINT_PROFILE.wireContracts.sameDaySpend.status === 'VERIFIED';
    const campaignAutomationDisabled =
      row.campaignAutomation === null ||
      row.campaignAutomation === 'DISABLED' ||
      row.targetAutomation === 'DISABLED';
    return Object.freeze({
      accountLocalDate,
      algorithmVersion: 'rules-v1',
      attributionUnambiguous: !(
        row.bidType === 'MANUAL' &&
        row.targetKind === 'CARD' &&
        row.siblingPlacements > 1
      ),
      budget: Object.freeze({
        contractStatus: sameDaySpendVerified ? 'VERIFIED' : 'UNVERIFIED',
        observedSameDaySpendMinor:
          sameDaySpendVerified && sameDaySpend !== null
            ? sameDaySpend.observedSameDaySpendMinor
            : null,
        signalFetchedAt:
          sameDaySpendVerified && sameDaySpend !== null && row.sameDaySpendFetchedAt !== null
            ? new Date(row.sameDaySpendFetchedAt)
            : null,
        signalFreshnessMinutes: this.configuration.sync.campaignStatisticsFreshnessMinutes,
        spendSignalCoverageEndedAt:
          sameDaySpendVerified && sameDaySpend !== null ? sameDaySpend.coverageEndedAt : null,
        targetSyncSlaMinutes: this.configuration.sync.campaignStatisticsFreshnessMinutes,
        writeVisibilitySlaSeconds: Math.ceil(
          this.configuration.writePipeline.verificationInitialDelayMs / 1_000,
        ),
      }),
      campaignRunning: isCampaignApplyEligibleStatus(row.campaignStatus),
      capability: normalizeCapability(row.capability),
      currentBidMinor: currentBid,
      currentTrafficRegimeChecksum: row.coherentRegimeChecksum ?? 'missing-regime',
      dailyAnchorBidMinor: row.dailyAnchorBidMinor ?? currentBid,
      decisionAt,
      endpointQuantumMinor: 1n,
      expectedContributionBeforeAdsMinor: row.expectedContributionMinor,
      lastWriteAt: row.lastWriteAt === null ? null : new Date(row.lastWriteAt),
      manualPause: campaignAutomationDisabled,
      paymentType: row.paymentType === 'CPC' ? 'CPC' : 'CPM',
      performanceDays: days,
      policy,
      productEconomicsVersion: row.economicsVersion,
      recommendationBidHintsMinor,
      recommendationSnapshotChecksum:
        recommendationBidHintsMinor.length === 0 ? null : row.recommendationSourceChecksum,
      recommendationSnapshotFetchedAt:
        recommendationBidHintsMinor.length === 0 || row.recommendationFetchedAt === null
          ? null
          : new Date(row.recommendationFetchedAt),
      snapshotApplyEligible:
        row.applyEligible === true &&
        row.currentBidMinor !== null &&
        row.minimumBidMinor !== null &&
        row.paymentType !== 'UNKNOWN' &&
        row.bidType !== 'UNKNOWN',
      targetKey: Object.freeze({
        nmId: row.nmId,
        normQueryCanonical: row.normQueryCanonical,
        placement: row.placement,
        targetKind: row.targetKind,
        wbCampaignId: row.wbCampaignId,
      }),
      wbMinimumBidMinor: row.minimumBidMinor,
    });
  }
}

/**
 * Reads one string property from a Prisma JSON value.
 *
 * @param value - Stored JSON value.
 * @param key - Property name.
 * @returns String value or null.
 */
function readJsonString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = (value as Readonly<Record<string, unknown>>)[key];
  return typeof entry === 'string' ? entry : null;
}

/**
 * Enforces the finalized-day confirmed-bid invariant.
 *
 * @param value - Persisted confirmed bid.
 * @returns Non-null confirmed bid.
 */
function requireConfirmedBidMinor(value: bigint | null): bigint {
  if (value === null) throw new Error('FINALIZED_PERFORMANCE_DAY_MISSING_CONFIRMED_BID');
  return value;
}

/**
 * Extracts positive base and matching-query recommendation hints without changing wire spelling.
 *
 * Optional recommendation corruption never blocks an otherwise valid ordinary decision; the
 * entire hint set is discarded instead.
 *
 * @param source - Persisted WB response snapshot.
 * @param normQueryCanonical - NFC-only target query, or null for an article placement.
 * @returns Unique positive internal-minor-unit hints.
 */
function extractRecommendationHints(
  source: unknown,
  normQueryCanonical: string | null,
): readonly bigint[] {
  const parsed = bidRecommendationsResponseSchema.safeParse(source);
  if (!parsed.success) return Object.freeze([]);
  const groups = [
    parsed.data.base.competitiveBid,
    parsed.data.base.leadersBid,
    parsed.data.base.top2,
  ];
  if (normQueryCanonical !== null) {
    const matches = parsed.data.normQueries.filter(
      (entry) => entry.normQuery.normalize('NFC') === normQueryCanonical,
    );
    if (new Set(matches.map((entry) => entry.normQuery)).size > 1) {
      return Object.freeze([]);
    }
    for (const match of matches) {
      groups.push(match.reachMin, match.reachMedium, match.reachMax);
    }
  }
  const hints = new Set<string>();
  for (const group of groups) {
    if (group.bidKopecks > 0) hints.add(String(group.bidKopecks));
    if (group.bidKopecksMin !== undefined && group.bidKopecksMin > 0) {
      hints.add(String(group.bidKopecksMin));
    }
  }
  return Object.freeze([...hints].map(BigInt).sort((left, right) => (left < right ? -1 : 1)));
}

/**
 * Parses the internal verified current-day spend snapshot for one exact account-local day.
 *
 * @param source - Persisted normalized source.
 * @param accountLocalDate - Decision account-local date.
 * @returns Exact spend and coverage, or null for an incomplete/mismatched snapshot.
 */
function parseSameDaySpend(
  source: unknown,
  accountLocalDate: string,
): {
  readonly coverageEndedAt: Date;
  readonly observedSameDaySpendMinor: bigint;
} | null {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const record = source as Readonly<Record<string, unknown>>;
  if (
    record.statisticalDate !== accountLocalDate ||
    typeof record.observedSameDaySpendMinor !== 'string' ||
    !/^\d+$/.test(record.observedSameDaySpendMinor) ||
    typeof record.coverageEndedAt !== 'string'
  ) {
    return null;
  }
  const coverageEndedAt = new Date(record.coverageEndedAt);
  if (!Number.isFinite(coverageEndedAt.getTime())) return null;
  return Object.freeze({
    coverageEndedAt,
    observedSameDaySpendMinor: BigInt(record.observedSameDaySpendMinor),
  });
}

/**
 * Parses canonical JSON into the exact policy contract and revalidates all invariants.
 *
 * @param source - PostgreSQL JSONB value.
 * @param version - Authoritative row version.
 * @returns Validated immutable policy.
 */
export function parseDecisionPolicy(source: unknown, version: bigint): DecisionPolicy {
  const record = asRecord(source);
  const policy: DecisionPolicy = {
    baselineWindowDays: integer(record, 'baselineWindowDays'),
    candidateBidStepPpm: integer(record, 'candidateBidStepPpm'),
    cooldownMinutes: integer(record, 'cooldownMinutes'),
    dailySpendLimitMinor: nullableBigInt(record, 'dailySpendLimitMinor'),
    executionMode: enumValue(record, 'executionMode', ['APPLY', 'OBSERVE_ONLY']),
    explorationEnabled: booleanValue(record, 'explorationEnabled'),
    explorationSpendSafetyBufferPpm: integer(record, 'explorationSpendSafetyBufferPpm'),
    explorationStepPpm: integer(record, 'explorationStepPpm'),
    maxDailyDecreasePpm: integer(record, 'maxDailyDecreasePpm'),
    maxDailyIncreasePpm: integer(record, 'maxDailyIncreasePpm'),
    maxDecreasePerCyclePpm: integer(record, 'maxDecreasePerCyclePpm'),
    maxExplorationSpendMinor: nullableBigInt(record, 'maxExplorationSpendMinor'),
    maxIncreasePerCyclePpm: integer(record, 'maxIncreasePerCyclePpm'),
    maxConcurrentExperimentsPerAccount: integer(record, 'maxConcurrentExperimentsPerAccount'),
    maxConcurrentExperimentsPerCampaign: integer(record, 'maxConcurrentExperimentsPerCampaign'),
    maxSpendPerMinuteMinor: nullableBigInt(record, 'maxSpendPerMinuteMinor'),
    maxSpendReportingLagMinutes: nullableInteger(record, 'maxSpendReportingLagMinutes'),
    minAbsoluteChangeMinor: bigintValue(record, 'minAbsoluteChangeMinor'),
    minBidClicks: bigintValue(record, 'minBidClicks'),
    minBidObservationDays: integer(record, 'minBidObservationDays'),
    minBidOrderedUnits: bigintValue(record, 'minBidOrderedUnits'),
    minBidSpendMinor: nullableBigInt(record, 'minBidSpendMinor'),
    minBidViews: bigintValue(record, 'minBidViews'),
    minExpectedProfitImprovementMinor: bigintValue(record, 'minExpectedProfitImprovementMinor'),
    minExplorationFullDays: integer(record, 'minExplorationFullDays'),
    minRelativeChangePpm: integer(record, 'minRelativeChangePpm'),
    orderedUnitsSafetyDiscountPpm: integer(record, 'orderedUnitsSafetyDiscountPpm'),
    policyMaxBidMinor: nullableBigInt(record, 'policyMaxBidMinor'),
    policyMinBidMinor: nullableBigInt(record, 'policyMinBidMinor'),
    predictionHorizonDays: integer(record, 'predictionHorizonDays'),
    primaryWindowDays: integer(record, 'primaryWindowDays'),
    spendSafetyPremiumPpm: integer(record, 'spendSafetyPremiumPpm'),
    version,
    zeroConversionDecreasePpm: integer(record, 'zeroConversionDecreasePpm'),
    zeroConversionMinClicks: bigintValue(record, 'zeroConversionMinClicks'),
    zeroConversionMinViews: bigintValue(record, 'zeroConversionMinViews'),
    zeroConversionSpendThresholdMinor: nullableBigInt(record, 'zeroConversionSpendThresholdMinor'),
  };
  validateDecisionPolicy(policy);
  return Object.freeze(policy);
}

/**
 * Normalizes persisted capability.
 *
 * @param value - Database capability.
 * @returns Engine capability.
 */
function normalizeCapability(value: string): DecisionInput['capability'] {
  if (value === 'CARD_WRITE_READY' || value === 'CLUSTER_WRITE_READY' || value === 'OBSERVE_ONLY') {
    return value;
  }
  return 'UNSUPPORTED';
}

/**
 * Requires a plain JSON object.
 *
 * @param value - Unknown value.
 * @returns Readonly record.
 */
function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_POLICY_OBJECT');
  }
  return value as Readonly<Record<string, unknown>>;
}

/**
 * Reads a finite integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Integer.
 */
function integer(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`INVALID_POLICY_INTEGER:${key}`);
  }
  return value;
}

/**
 * Reads a nullable integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Integer or null.
 */
function nullableInteger(record: Readonly<Record<string, unknown>>, key: string): number | null {
  return record[key] === null ? null : integer(record, key);
}

/**
 * Reads a canonical bigint string or safe integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Bigint.
 */
function bigintValue(record: Readonly<Record<string, unknown>>, key: string): bigint {
  const value = record[key];
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new Error(`INVALID_POLICY_BIGINT:${key}`);
}

/**
 * Reads a nullable canonical bigint.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Bigint or null.
 */
function nullableBigInt(record: Readonly<Record<string, unknown>>, key: string): bigint | null {
  return record[key] === null ? null : bigintValue(record, key);
}

/**
 * Reads a boolean field.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Boolean.
 */
function booleanValue(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new Error(`INVALID_POLICY_BOOLEAN:${key}`);
  return value;
}

/**
 * Reads one string enum.
 *
 * @template T - Allowed string literal.
 * @param record - Policy object.
 * @param key - Field.
 * @param allowed - Allowed values.
 * @returns Validated literal.
 */
function enumValue<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`INVALID_POLICY_ENUM:${key}`);
  }
  return value as T;
}

/**
 * Selects the greatest exact minor-unit value.
 *
 * @param values - Non-empty values.
 * @returns Maximum.
 */
function maximum(...values: readonly bigint[]): bigint {
  return values.reduce((current, value) => (value > current ? value : current));
}
