import {
  scopedChecksum,
  type DecisionPolicy,
  type DecisionResult,
  type ExperimentState,
} from '@wb-bidder/decision-engine';
import type { ExperimentRuntimeRow } from './experiment-runtime.types.js';

/**
 * Maps a persistence row to the pure lifecycle reducer state.
 *
 * @param row - Persistence row.
 * @returns Pure immutable state.
 */
export function toState(row: ExperimentRuntimeRow): ExperimentState {
  return Object.freeze({
    actualRevertBidMinor: row.actualRevertBidMinor,
    collectedEligibleDays: row.collectedEligibleDays,
    completedAt: row.completedAt,
    desiredRevertBidMinor: row.desiredRevertBidMinor,
    evaluationNotBefore: row.evaluationNotBefore,
    experimentBidMinor: row.experimentBidMinor,
    observedExperimentSpendMinor: row.observedExperimentSpendMinor,
    plannedFullDays: row.plannedFullDays,
    reservedUnobservedSpendMinor: row.reservedUnobservedSpendMinor,
    sourceBidMinor: row.sourceBidMinor,
    spendLimitMinor: row.spendLimitMinor,
    spendSafetyBufferMinor: row.spendSafetyBufferMinor,
    status: row.status,
    terminalReasonCode: row.terminalReasonCode,
  });
}

/**
 * Builds a deterministic durable revert decision.
 *
 * @param row - Experiment state.
 * @param bidMinor - Currently legal revert target.
 * @param policy - Active policy.
 * @param now - Decision time.
 * @returns Queue-eligible decision result.
 */
export function revertDecision(
  row: ExperimentRuntimeRow,
  bidMinor: bigint,
  policy: DecisionPolicy,
  now: Date,
): DecisionResult {
  const current = row.currentBidMinor ?? row.experimentBidMinor;
  const inputSnapshotChecksum = scopedChecksum('experiment-revert-input-v1', {
    bidMinor,
    experimentId: row.id,
    policyVersion: policy.version,
  });
  return Object.freeze({
    action: bidMinor > current ? 'INCREASE' : bidMinor < current ? 'DECREASE' : 'NO_CHANGE',
    boundedBidMinor: bidMinor,
    decisionInputChecksum: scopedChecksum('experiment-revert-decision-v1', {
      inputSnapshotChecksum,
      now,
    }),
    explanation: Object.freeze({
      actionBlockers: Object.freeze([]),
      buckets: Object.freeze([]),
      candidates: Object.freeze([]),
      inputSnapshotChecksum,
      reservedUnobservedSpendMinor: 0n,
      unconditionalBlockers: Object.freeze([]),
    }),
    guardrailCodes: Object.freeze([]),
    outcomeReasonCode: 'EXPLORATION_REVERT_REQUESTED',
    proposedBidMinor: bidMinor,
    queueEligible: bidMinor !== current,
    strategyReasonCode: 'EXPLORATION_REVERT',
  });
}
