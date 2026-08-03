import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

import type { LiveBidState, QueueStatus, ReconciliationClassification } from './types.js';

const QUEUE_TRANSITIONS: Readonly<Record<QueueStatus, readonly QueueStatus[]>> = Object.freeze({
  QUEUED: ['LEASED', 'SUPERSEDED', 'CANCELLED'],
  LEASED: ['QUEUED', 'SENT', 'FAILED', 'SUPERSEDED', 'CANCELLED'],
  SENT: ['VERIFY_WAIT', 'FAILED'],
  VERIFY_WAIT: ['APPLIED', 'RETRY_WAIT', 'FAILED'],
  RETRY_WAIT: ['LEASED', 'FAILED', 'SUPERSEDED', 'CANCELLED'],
  APPLIED: [],
  FAILED: ['RETRY_WAIT'],
  SUPERSEDED: [],
  CANCELLED: [],
});

/**
 * Verifies a queue transition against the fail-closed lifecycle.
 *
 * @param from Current state at the start of the transition.
 * @param to Requested destination state for the transition.
 */
export function assertQueueTransition(from: QueueStatus, to: QueueStatus): void {
  if (!QUEUE_TRANSITIONS[from].includes(to)) {
    throw new Error(`INVALID_QUEUE_TRANSITION ${from}->${to}`);
  }
}

/**
 * Returns a stable secret-free state checksum.
 *
 * @param state State value to normalize or classify.
 * @returns Result produced by the state checksum operation.
 */
export function stateChecksum(state: LiveBidState): string {
  const canonical = canonicalize({
    bidMinor: state.bidMinor?.toString() ?? null,
    explicit: state.explicit,
    sourceMarker: state.sourceMarker,
  });
  if (canonical === undefined) {
    throw new Error('STATE_CANONICALIZATION_FAILED');
  }
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Classifies a reconciliation read against pre-write and desired states.
 *
 * @param observed Live state observed from Wildberries.
 * @param preWrite Live state captured immediately before dispatch.
 * @param desired Desired live bid state produced by the decision.
 * @returns Result produced by the classify reconciliation operation.
 */
export function classifyReconciliation(
  observed: LiveBidState,
  preWrite: LiveBidState,
  desired: Pick<LiveBidState, 'bidMinor' | 'explicit'>,
): ReconciliationClassification {
  if (sameBidState(observed, desired)) {
    return 'DESIRED_STATE';
  }
  if (sameBidState(observed, preWrite)) {
    return 'STABLE_OLD_STATE';
  }
  return 'THIRD_STATE';
}

/**
 * Determines whether another write can be scheduled from stable-old-state evidence.
 *
 * @param input Validated input values for the operation.
 * @param input.stableReadCount stable read count field of the validated input.
 * @param input.requiredStableReadCount required stable read count field of the validated input.
 * @param input.fresh fresh field of the validated input.
 * @param input.prevalidationPassed prevalidation passed field of the validated input.
 * @param input.elapsedSincePreviousMs elapsed since previous ms field of the validated input.
 * @param input.minimumReadIntervalMs minimum read interval ms field of the validated input.
 * @param input.beforeDeadline before deadline field of the validated input.
 * @returns Whether the requested condition is satisfied.
 */
export function isSafeStableOldRetry(input: {
  readonly stableReadCount: number;
  readonly requiredStableReadCount: number;
  readonly fresh: boolean;
  readonly prevalidationPassed: boolean;
  readonly elapsedSincePreviousMs: number;
  readonly minimumReadIntervalMs: number;
  readonly beforeDeadline: boolean;
}): boolean {
  return (
    input.stableReadCount >= input.requiredStableReadCount &&
    input.fresh &&
    input.prevalidationPassed &&
    input.elapsedSincePreviousMs >= input.minimumReadIntervalMs &&
    input.beforeDeadline
  );
}

/**
 * Performs the same bid state operation while preserving domain invariants.
 *
 * @param left Left-hand value used by the comparison.
 * @param right Right-hand value used by the comparison.
 * @returns Result produced by the same bid state operation.
 */
function sameBidState(
  left: Pick<LiveBidState, 'bidMinor' | 'explicit'>,
  right: Pick<LiveBidState, 'bidMinor' | 'explicit'>,
): boolean {
  return left.explicit === right.explicit && left.bidMinor === right.bidMinor;
}
