import { Inject, Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { APP_CONFIGURATION } from '../application-config.js';
import { DATABASE_CLIENT } from '../database.js';
import { ObservabilityService } from '../observability.service.js';
import { DECISION_REPOSITORY } from '../runtime.providers.js';
import { RuntimeClockService } from '../runtime-clock.service.js';
import { RuntimeSafetyState } from '../runtime-state.js';
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
  type DecisionInput,
  type DecisionPerformanceDay,
  type DecisionPolicy,
  type DecisionResult,
  type ExperimentPlanWrite,
} from '@wb-bidder/decision-engine';
import { DECISION_PAGE_SIZE, type DecisionJobScope } from './decision-job.types.js';
import {
  parseDecisionPolicy,
  readJsonString,
  requireConfirmedBidMinor,
  extractRecommendationHints,
  parseSameDaySpend,
  normalizeCapability,
  maximum,
} from './decision-policy.parser.js';

/**
 *
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
