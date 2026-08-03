import { type ExperimentState } from '@wb-bidder/decision-engine';

export const EXPERIMENT_PAGE_SIZE = 100;

/**
 * Database representation required to advance one experiment without WB calls.
 */
export interface ExperimentRuntimeRow {
  readonly actualRevertBidMinor: bigint | null;
  readonly activePolicyConfiguration: unknown;
  readonly activePolicyId: string | null;
  readonly activePolicyVersion: bigint | null;
  readonly applyEligible: boolean | null;
  readonly campaignAutomation: string | null;
  readonly capability: string;
  readonly collectedEligibleDays: number;
  readonly completedAt: Date | null;
  readonly currentBidMinor: bigint | null;
  readonly desiredRevertBidMinor: bigint;
  readonly economicsId: string | null;
  readonly expectedContributionMinor: bigint | null;
  readonly economicsVersion: bigint | null;
  readonly evaluationNotBefore: Date | null;
  readonly experimentBidMinor: bigint;
  readonly id: string;
  readonly observedExperimentSpendMinor: bigint;
  readonly plannedFullDays: number;
  readonly reservedUnobservedSpendMinor: bigint;
  readonly revertDeadlineAt: Date | null;
  readonly revertDecisionId: string | null;
  readonly revertStartedAt: Date | null;
  readonly sourceBidMinor: bigint;
  readonly spendLimitMinor: bigint;
  readonly spendSafetyBufferMinor: bigint;
  readonly startDecisionId: string | null;
  readonly startedAt: Date | null;
  readonly status: ExperimentState['status'];
  readonly targetAutomation: string | null;
  readonly targetId: string;
  readonly terminalReasonCode: string | null;
  readonly wbMinimumBidMinor: bigint | null;
}
