/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
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
 */
export function assertQueueTransition(from: QueueStatus, to: QueueStatus): void {
  if (!QUEUE_TRANSITIONS[from].includes(to)) {
    throw new Error(`INVALID_QUEUE_TRANSITION ${from}->${to}`);
  }
}

/**
 * Returns a stable secret-free state checksum.
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

function sameBidState(
  left: Pick<LiveBidState, 'bidMinor' | 'explicit'>,
  right: Pick<LiveBidState, 'bidMinor' | 'explicit'>,
): boolean {
  return left.explicit === right.explicit && left.bidMinor === right.bidMinor;
}
