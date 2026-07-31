import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_CLIENT } from './database.js';
import { RuntimeSafetyState } from './runtime-state.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { CURRENT_ENDPOINT_PROFILE, isCampaignApplyEligibleStatus } from '@wb-bidder/contracts';
import type { AppConfiguration } from '@wb-bidder/config';
import type { DatabaseClient } from '@wb-bidder/database';
import type {
  ClaimedQueueItem,
  LiveBidState,
  PreDispatchValidator,
} from '@wb-bidder/write-pipeline';

/**
 * Database row locked immediately before durable write preparation.
 */
interface PreDispatchRow {
  /** Active campaign automation mode. */
  readonly campaignAutomation: string | null;
  /** Current campaign status. */
  readonly campaignStatus: number;
  /** Target capability from the latest normalized state. */
  readonly capability: string;
  /** Durable pre-bidder baseline state for cluster restore safety. */
  readonly clusterBaselineBidState: string | null;
  /** Whether the current cluster override was written by this bidder. */
  readonly clusterOverrideOwned: boolean;
  /** Current persisted cluster state. */
  readonly clusterBidState: string | null;
  /** Current decision input bid. */
  readonly currentBidMinor: bigint | null;
  /** Decision creation time. */
  readonly decisionCreatedAt: Date;
  /** Decision direction. */
  readonly decisionAction: string;
  /** Whether the deployment kill switch is active. */
  readonly globalKill: boolean;
  /** Latest WB minimum. */
  readonly minimumBidMinor: bigint | null;
  /** Current product-economics version or null. */
  readonly currentEconomicsVersion: bigint | null;
  /** Economics version captured by the metric snapshot. */
  readonly decisionEconomicsVersion: bigint | null;
  /** Policy execution mode captured by the metric snapshot. */
  readonly executionMode: string;
  /** Policy JSON used for maximum-bid revalidation. */
  readonly policyConfiguration: unknown;
  /** Policy version captured by the decision. */
  readonly policyVersion: bigint;
  /** Whether the exact policy remains active. */
  readonly policyStillActive: boolean;
  /** Latest target snapshot apply eligibility. */
  readonly snapshotApplyEligible: boolean | null;
  /** Latest target automation override. */
  readonly targetAutomation: string | null;
  /** Target kind persisted in the database. */
  readonly targetKind: string;
}

/**
 * Complete live pre-dispatch validation required before any durable DISPATCHING transition.
 */
@Injectable()
export class DatabasePreDispatchValidator implements PreDispatchValidator {
  /**
   * Creates a validator over the authoritative deployment database.
   *
   * @param database - Shared Prisma Client.
   * @param configuration - Effective startup write gate.
   * @param runtimeState - Cached binding, integration, capacity, and shutdown gates.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    private readonly runtimeState: RuntimeSafetyState,
    private readonly clock: RuntimeClockService,
  ) {}

  /**
   * Revalidates every mutable prerequisite against live WB state and current database state.
   *
   * @param item - Leased queue item.
   * @param liveState - Fresh quota-aware WB observation.
   * @returns Valid result or one stable rejection code.
   */
  public async validate(
    item: ClaimedQueueItem,
    liveState: LiveBidState,
  ): Promise<{ readonly valid: true } | { readonly valid: false; readonly code: string }> {
    const modelNow = this.clock.now();
    if (!this.configuration.wb.writesEnabled) return invalid('WRITE_GATE_CLOSED');
    const runtimeBlocker = this.runtimeState.writeBlocker();
    if (runtimeBlocker !== null) return invalid(runtimeBlocker);
    if (
      Date.now() - liveState.observedAt.getTime() >
      this.configuration.writePipeline.preWriteStateMaximumAgeMs
    ) {
      return invalid('PREWRITE_STATE_STALE');
    }
    const decision = await this.database.bidDecision.findUnique({
      select: {
        action: true,
        createdAt: true,
        currentBidMinor: true,
        metricSnapshot: {
          select: {
            policy: {
              select: {
                configuration: true,
                enabled: true,
                executionMode: true,
                validFrom: true,
                validTo: true,
              },
            },
            productEconomicsVersion: true,
          },
        },
        policyVersion: true,
        target: {
          select: {
            automation: { select: { mode: true } },
            campaign: {
              select: {
                automation: { select: { mode: true } },
                status: true,
              },
            },
            capability: true,
            clusterBaselineBidState: true,
            clusterBidState: true,
            clusterOverrideOwned: true,
            dataSnapshots: {
              orderBy: { createdAt: 'desc' },
              select: { applyEligible: true },
              take: 1,
            },
            minimumBidMinor: true,
            nmId: true,
            targetKind: true,
          },
        },
      },
      where: { id: item.decisionId },
    });
    if (decision === null) return invalid('DECISION_NOT_FOUND');
    const [control, currentEconomics] = await Promise.all([
      this.database.deploymentControl.findUnique({
        select: { globalKill: true },
        where: { id: '00000000-0000-0000-0000-000000000002' },
      }),
      this.database.productEconomics.findFirst({
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
        select: { version: true },
        where: {
          effectiveFrom: { lte: modelNow },
          nmId: decision.target.nmId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: modelNow } }],
        },
      }),
    ]);
    if (control === null) return invalid('DEPLOYMENT_CONTROL_MISSING');
    const policy = decision.metricSnapshot.policy;
    const row: PreDispatchRow = {
      campaignAutomation: decision.target.campaign.automation?.mode ?? null,
      campaignStatus: decision.target.campaign.status,
      capability: decision.target.capability,
      clusterBaselineBidState: decision.target.clusterBaselineBidState,
      clusterBidState: decision.target.clusterBidState,
      clusterOverrideOwned: decision.target.clusterOverrideOwned,
      currentBidMinor: decision.currentBidMinor,
      currentEconomicsVersion: currentEconomics?.version ?? null,
      decisionAction: decision.action,
      decisionCreatedAt: decision.createdAt,
      decisionEconomicsVersion: decision.metricSnapshot.productEconomicsVersion,
      executionMode: policy.executionMode,
      globalKill: control.globalKill,
      minimumBidMinor: decision.target.minimumBidMinor,
      policyConfiguration: policy.configuration,
      policyStillActive:
        policy.enabled &&
        policy.validFrom <= modelNow &&
        (policy.validTo === null || policy.validTo > modelNow),
      policyVersion: decision.policyVersion,
      snapshotApplyEligible: decision.target.dataSnapshots[0]?.applyEligible ?? null,
      targetAutomation: decision.target.automation?.mode ?? null,
      targetKind: decision.target.targetKind,
    };
    if (
      modelNow.getTime() - new Date(row.decisionCreatedAt).getTime() >
      this.configuration.writePipeline.maximumDecisionAgeMinutes * 60_000
    ) {
      return invalid('DECISION_EXPIRED');
    }
    if (row.globalKill) return invalid('GLOBAL_KILL_ACTIVE');
    if (row.campaignAutomation !== 'APPLY') return invalid('CAMPAIGN_AUTOMATION_NOT_APPLY');
    if (row.targetAutomation !== null && row.targetAutomation !== 'APPLY') {
      return invalid('TARGET_AUTOMATION_NOT_APPLY');
    }
    if (row.executionMode !== 'APPLY' || !row.policyStillActive) {
      return invalid('POLICY_NOT_APPLY');
    }
    if (row.policyVersion !== item.policyVersion) {
      return invalid('POLICY_VERSION_CHANGED');
    }
    if (row.currentEconomicsVersion !== row.decisionEconomicsVersion) {
      return invalid('PRODUCT_ECONOMICS_CHANGED');
    }
    if (row.snapshotApplyEligible !== true) return invalid('SNAPSHOT_NOT_APPLY_ELIGIBLE');
    if (!isCampaignApplyEligibleStatus(row.campaignStatus)) {
      return invalid(
        row.campaignStatus === 4 ? 'CAMPAIGN_NOT_RUNNING' : 'CAMPAIGN_STATUS_NOT_APPLY_ELIGIBLE',
      );
    }
    const cardWrite = row.capability === 'CARD_WRITE_READY' && row.targetKind === 'CARD';
    const clusterWrite =
      this.configuration.wb.mode === 'mock' &&
      row.capability === 'CLUSTER_WRITE_READY' &&
      row.targetKind === 'CLUSTER' &&
      item.campaignBidType === 'MANUAL' &&
      item.campaignPaymentType === 'CPM' &&
      item.normQueryWire !== null;
    if (!cardWrite && !clusterWrite) return invalid('UNSUPPORTED_WRITE_CAPABILITY');
    if (item.action === 'DELETE') {
      if (
        !clusterWrite ||
        row.decisionAction !== 'RESTORE_ABSENT_OVERRIDE' ||
        row.clusterBaselineBidState !== 'ABSENT' ||
        !row.clusterOverrideOwned ||
        row.clusterBidState !== 'EXPLICIT' ||
        row.currentBidMinor === null ||
        !liveState.explicit ||
        liveState.bidMinor === null ||
        row.currentBidMinor !== liveState.bidMinor
      ) {
        return invalid('CLUSTER_RESTORE_PROOF_MISSING');
      }
      if (item.bidMinor !== null) return invalid('DELETE_DESIRED_BID_MUST_BE_ABSENT');
      return { valid: true };
    }
    if (
      (row.currentBidMinor === null) !== (liveState.bidMinor === null) ||
      (row.currentBidMinor !== null &&
        liveState.bidMinor !== null &&
        row.currentBidMinor !== liveState.bidMinor) ||
      (clusterWrite &&
        ((row.clusterBidState === 'EXPLICIT') !== liveState.explicit ||
          (row.clusterBidState !== 'EXPLICIT' && row.clusterBidState !== 'ABSENT')))
    ) {
      return invalid('LIVE_BID_CHANGED');
    }
    if (item.bidMinor === null) return invalid('DESIRED_BID_MISSING');
    if (row.minimumBidMinor === null || item.bidMinor < row.minimumBidMinor) {
      return invalid('BELOW_WB_MINIMUM');
    }
    const policyMaximum = readNullableBigInt(row.policyConfiguration, 'policyMaxBidMinor');
    if (policyMaximum === null || item.bidMinor > policyMaximum) {
      return invalid('ABOVE_POLICY_MAXIMUM');
    }
    if (
      row.decisionAction === 'INCREASE' &&
      this.configuration.wb.mode !== 'mock' &&
      CURRENT_ENDPOINT_PROFILE.wireContracts.sameDaySpend.status !== 'VERIFIED'
    ) {
      return invalid('SAME_DAY_SPEND_CONTRACT_UNVERIFIED');
    }
    return { valid: true };
  }
}

/**
 * Creates a typed invalid validation outcome.
 *
 * @param code - Stable blocker.
 * @returns Frozen invalid result.
 */
function invalid(code: string): { readonly valid: false; readonly code: string } {
  return Object.freeze({ code, valid: false });
}

/**
 * Reads one canonical bigint-or-null JSON field.
 *
 * @param source - Stored policy JSON.
 * @param key - Required field.
 * @returns Parsed bigint or null.
 */
function readNullableBigInt(source: unknown, key: string): bigint | null {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const value = (source as Readonly<Record<string, unknown>>)[key];
  if (value === null) return null;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}
