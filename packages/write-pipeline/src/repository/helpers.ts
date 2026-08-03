import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import {
  advisoryTransactionLock,
  type DatabaseClient,
  type DatabaseTransaction,
  Prisma,
} from '@wb-bidder/database';
import { redactSecrets } from '../redaction.js';
import { isSafeStableOldRetry } from '../state-machine.js';
import type { ClaimedQueueItem, LiveBidState, ReconciliationObservation } from '../types.js';
import { DEPLOYMENT_CONTROL_ID } from './types.js';

/**
 * Defines the data contract for control mutation.
 */
export interface ControlMutation {
  readonly actor: string;
  readonly correlationId: string;
  readonly enabled: boolean;
  readonly expectedVersion: bigint;
  readonly idempotencyKey?: string;
  readonly idempotencyScope?: string;
  readonly reason: string;
}

/**
 * Defines the data contract for claim row.
 */
export interface ClaimRow {
  readonly queueItemId: string;
  readonly decisionId: string;
  readonly targetId: string;
  readonly campaignId: string;
  readonly campaignBidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignPaymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly wbCampaignId: string;
  readonly nmId: string;
  readonly normQueryWire: string | null;
  readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
  readonly targetKind: 'CARD' | 'CLUSTER';
  readonly priority: number;
  readonly action: string;
  readonly boundedBidMinor: string | null;
  readonly attemptCount: number;
  readonly policyVersion: string;
  readonly metricSnapshotId: string;
}

/**
 * Defines the data contract for reconciliation queue row.
 */
export interface ReconciliationQueueRow {
  readonly actualDispatchCount: number;
  readonly stableReadChecksum: string | null;
  readonly stableReadCount: number;
  readonly lastReconciliationReadAt: Date | null;
  readonly reconciliationDeadlineAt: Date | null;
  readonly nextVerificationAt: Date | null;
  readonly status: string;
}

/**
 * Loads the latest pending attempt item for each due reconciliation queue row.
 *
 * @param database Shared Prisma client.
 * @param limit Maximum due queue rows.
 * @returns Flattened reconciliation work rows.
 */
export async function loadReconciliationWorkPage(database: DatabaseClient, limit: number) {
  const dueAt = new Date();
  const rows = await database.decisionQueueItem.findMany({
    orderBy: [{ nextVerificationAt: { nulls: 'first', sort: 'asc' } }, { id: 'asc' }],
    select: {
      attemptCount: true,
      decision: {
        select: {
          action: true,
          boundedBidMinor: true,
          metricSnapshotId: true,
          policyVersion: true,
          target: {
            select: {
              campaign: {
                select: { bidType: true, paymentType: true, wbCampaignId: true },
              },
              campaignId: true,
              nmId: true,
              normQueryWire: true,
              placement: true,
              targetKind: true,
            },
          },
          targetId: true,
          writeAttemptItems: {
            orderBy: { attemptNumber: 'desc' },
            select: {
              decisionId: true,
              desiredBidState: true,
              id: true,
              preWriteState: true,
              sentBidMinor: true,
            },
            take: 1,
            where: { reconciliationStatus: 'PENDING' },
          },
        },
      },
      id: true,
      priority: true,
    },
    take: limit,
    where: {
      decision: {
        writeAttemptItems: { some: { reconciliationStatus: 'PENDING' } },
      },
      OR: [{ nextVerificationAt: null }, { nextVerificationAt: { lte: dueAt } }],
      status: 'VERIFY_WAIT',
    },
  });
  return rows.map((queue) => {
    const decision = queue.decision;
    const target = decision.target;
    const item = decision.writeAttemptItems[0];
    if (item === undefined) throw new Error('PENDING_RECONCILIATION_ITEM_NOT_FOUND');
    return {
      action: decision.action,
      attemptCount: queue.attemptCount,
      attemptItemId: item.id,
      boundedBidMinor: decision.boundedBidMinor?.toString() ?? null,
      campaignBidType: target.campaign.bidType,
      campaignId: target.campaignId,
      campaignPaymentType: target.campaign.paymentType,
      decisionId: item.decisionId,
      desiredBidState: item.desiredBidState,
      metricSnapshotId: decision.metricSnapshotId,
      nmId: target.nmId.toString(),
      normQueryWire: target.normQueryWire,
      placement: target.placement,
      policyVersion: decision.policyVersion.toString(),
      preWriteState: item.preWriteState,
      priority: queue.priority,
      queueItemId: queue.id,
      sentBidMinor: item.sentBidMinor?.toString() ?? null,
      targetId: decision.targetId,
      targetKind: target.targetKind,
      wbCampaignId: target.campaign.wbCampaignId.toString(),
    };
  });
}

/**
 * Converts to claimed into its required representation.
 *
 * @param row Persisted database row to map into the domain representation.
 * @returns Constructed or normalized result.
 */
export function toClaimed(row: ClaimRow): ClaimedQueueItem {
  const deleteAction = row.action === 'RESTORE_ABSENT_OVERRIDE';
  return Object.freeze({
    action: deleteAction ? 'DELETE' : 'SET',
    attemptCount: row.attemptCount,
    bidMinor: deleteAction
      ? null
      : row.boundedBidMinor === null
        ? null
        : BigInt(row.boundedBidMinor),
    campaignBidType: row.campaignBidType,
    campaignId: row.campaignId,
    campaignPaymentType: row.campaignPaymentType,
    decisionId: row.decisionId,
    desiredBidState: deleteAction ? 'ABSENT' : 'EXPLICIT',
    metricSnapshotId: row.metricSnapshotId,
    nmId: BigInt(row.nmId),
    normQueryWire: row.normQueryWire,
    placement: row.placement,
    policyVersion: BigInt(row.policyVersion),
    priority: row.priority,
    queueItemId: row.queueItemId,
    targetId: row.targetId,
    targetKind: row.targetKind,
    wbCampaignId: BigInt(row.wbCampaignId),
  });
}

/**
 * Validates and restores one persisted pre-write live state.
 *
 * @param value JSONB state.
 * @returns Typed immutable live state.
 */
export function parseStoredLiveState(value: unknown): LiveBidState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_PREWRITE_STATE');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const bidValue = record.bidMinor;
  const bidMinor =
    bidValue === null
      ? null
      : typeof bidValue === 'string' && /^-?\d+$/.test(bidValue)
        ? BigInt(bidValue)
        : typeof bidValue === 'number' && Number.isSafeInteger(bidValue)
          ? BigInt(bidValue)
          : undefined;
  const observedAt =
    typeof record.observedAt === 'string' || record.observedAt instanceof Date
      ? new Date(record.observedAt)
      : null;
  if (
    bidMinor === undefined ||
    typeof record.explicit !== 'boolean' ||
    observedAt === null ||
    Number.isNaN(observedAt.getTime()) ||
    typeof record.sourceMarker !== 'string'
  ) {
    throw new Error('INVALID_PREWRITE_STATE');
  }
  return Object.freeze({
    bidMinor,
    explicit: record.explicit,
    observedAt,
    sourceMarker: record.sourceMarker,
  });
}

/**
 * Validates automation allows.
 *
 * @param client Database or API client used by the operation.
 * @param entries Validated entries value supplied to the operation.
 */
export async function assertAutomationAllows(
  client: DatabaseTransaction,
  entries: readonly { readonly item: { readonly campaignId: string; readonly targetId: string } }[],
): Promise<void> {
  const control = await client.deploymentControl.findUnique({
    select: { globalKill: true },
    where: { id: DEPLOYMENT_CONTROL_ID },
  });
  if (control?.globalKill !== false) throw new Error('GLOBAL_KILL_ACTIVE');
  for (const { item } of entries) {
    const [campaign, target] = await Promise.all([
      client.campaign.findUnique({
        select: { automation: { select: { mode: true } } },
        where: { id: item.campaignId },
      }),
      client.targetAutomation.findUnique({
        select: { mode: true },
        where: { targetId: item.targetId },
      }),
    ]);
    if (campaign?.automation?.mode !== 'APPLY' || (target !== null && target.mode !== 'APPLY')) {
      throw new Error('AUTOMATION_NOT_APPLY');
    }
  }
}

/**
 * Performs the reconciliation outcome operation while preserving domain invariants.
 *
 * @param queue Queue item and decision state used by reconciliation.
 * @param input Validated input values for the operation.
 * @param input.observation observation field of the validated input.
 * @param input.observedAt observed at field of the validated input.
 * @param input.minimumReadIntervalMs minimum read interval ms field of the validated input.
 * @param input.requiredStableReadCount required stable read count field of the validated input.
 * @param input.maximumWriteAttempts maximum write attempts field of the validated input.
 * @returns Result produced by the reconciliation outcome operation.
 */
export function reconciliationOutcome(
  queue: ReconciliationQueueRow,
  input: {
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
    readonly minimumReadIntervalMs: number;
    readonly requiredStableReadCount: number;
    readonly maximumWriteAttempts: number;
  },
): 'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED' {
  if (input.observation.classification === 'DESIRED_STATE') return 'APPLIED';
  if (input.observation.classification === 'THIRD_STATE') return 'FAILED';
  if (
    queue.reconciliationDeadlineAt === null ||
    input.observedAt >= queue.reconciliationDeadlineAt
  ) {
    return 'FAILED';
  }
  const sameChecksum = queue.stableReadChecksum === input.observation.stateChecksum;
  const stableReadCount = sameChecksum ? queue.stableReadCount + 1 : 1;
  const elapsed =
    queue.lastReconciliationReadAt === null
      ? Number.POSITIVE_INFINITY
      : input.observedAt.getTime() - queue.lastReconciliationReadAt.getTime();
  const safeStableOld = isSafeStableOldRetry({
    beforeDeadline: true,
    elapsedSincePreviousMs: elapsed,
    fresh: input.observation.fresh,
    minimumReadIntervalMs: input.minimumReadIntervalMs,
    prevalidationPassed: input.observation.prevalidationPassed,
    requiredStableReadCount: input.requiredStableReadCount,
    stableReadCount,
  });
  if (!safeStableOld) return 'WAIT';
  return queue.actualDispatchCount >= input.maximumWriteAttempts ? 'FAILED' : 'RETRY_WAIT';
}

/**
 * Updates reconciliation outcome.
 *
 * @param client Database or API client used by the operation.
 * @param input Validated input values for the operation.
 * @param input.attemptItemId attempt item id field of the validated input.
 * @param input.decisionId Decision identifier selecting the durable record.
 * @param input.targetId Target identifier defining the operation scope.
 * @param input.observation observation field of the validated input.
 * @param input.observedAt observed at field of the validated input.
 * @param queue Queue item and decision state used by reconciliation.
 * @param outcome Reconciliation outcome selected for persistence.
 */
export async function applyReconciliationOutcome(
  client: DatabaseTransaction,
  input: {
    readonly attemptItemId: string;
    readonly decisionId: string;
    readonly targetId: string;
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
  },
  queue: ReconciliationQueueRow,
  outcome: 'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED',
): Promise<void> {
  const deadlineExceeded =
    queue.reconciliationDeadlineAt === null || input.observedAt >= queue.reconciliationDeadlineAt;
  const thirdState = input.observation.classification === 'THIRD_STATE';
  const attemptsExhausted =
    input.observation.classification === 'STABLE_OLD_STATE' &&
    outcome === 'FAILED' &&
    !deadlineExceeded &&
    !thirdState;
  const stableReadCount =
    queue.stableReadChecksum === input.observation.stateChecksum ? queue.stableReadCount + 1 : 1;
  const failure = thirdState
    ? 'EXTERNAL_STATE_CONFLICT'
    : deadlineExceeded
      ? 'RECONCILIATION_INCONCLUSIVE'
      : attemptsExhausted
        ? 'WRITE_ATTEMPTS_EXHAUSTED'
        : null;
  await client.decisionQueueItem.updateMany({
    data: {
      ...(outcome === 'RETRY_WAIT' ? { availableAt: input.observedAt } : {}),
      ...(failure === null ? {} : { failureClassification: failure, lastErrorCode: failure }),
      lastReconciliationReadAt: input.observedAt,
      ...(outcome === 'WAIT' ? {} : { manualRetryBlocked: outcome === 'FAILED' }),
      stableReadChecksum: input.observation.stateChecksum,
      stableReadCount,
      status: outcome === 'WAIT' ? 'VERIFY_WAIT' : outcome,
      ...(outcome === 'APPLIED' ? { verifiedAt: input.observedAt } : {}),
      version: { increment: 1n },
    },
    where: { decisionId: input.decisionId },
  });
  const reconciliationStatus =
    outcome === 'APPLIED' ? 'CONFIRMED' : outcome === 'FAILED' ? 'MISMATCH' : 'PENDING';
  await client.wbWriteAttemptItem.update({
    data: {
      reconciledAt: reconciliationStatus === 'PENDING' ? null : input.observedAt,
      reconciliationStatus,
    },
    where: { id: input.attemptItemId },
  });
  if (outcome === 'APPLIED') {
    await client.campaignTarget.updateMany({
      data: {
        clusterBidState: input.observation.state.explicit ? 'EXPLICIT' : 'ABSENT',
        clusterOverrideOwned: input.observation.state.explicit,
        currentBidMinor: input.observation.state.bidMinor,
        lastConfirmedAt: input.observedAt,
      },
      where: {
        decisions: { some: { id: input.decisionId } },
        id: input.targetId,
        targetKind: 'CLUSTER',
      },
    });
  }
}

/**
 * Performs the classify rejected operation while preserving domain invariants.
 *
 * @param code Stable machine-readable outcome code.
 * @returns Result produced by the classify rejected operation.
 */
export function classifyRejected(code: string | undefined): string {
  if (code?.includes('AUTH') === true) return 'AUTH';
  if (code?.includes('CAPABILITY') === true) return 'CAPABILITY';
  if (code?.includes('INVALID') === true) return 'INVALID';
  return 'TRANSIENT_REJECTED';
}

/**
 * Determines whether is retryable rejected is satisfied.
 *
 * @param code Stable machine-readable outcome code.
 * @returns Whether the requested condition is satisfied.
 */
export function isRetryableRejected(code: string | undefined): boolean {
  return classifyRejected(code) === 'TRANSIENT_REJECTED';
}

/**
 * Determines whether is retryable classification is satisfied.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Whether the requested condition is satisfied.
 */
export function isRetryableClassification(value: string | null): boolean {
  return value === 'TRANSIENT_REJECTED' || value === 'SAFE_STABLE_OLD_STATE';
}

/**
 * Performs the oldest read operation while preserving domain invariants.
 *
 * @param items Items processed as one bounded operation.
 * @returns Result produced by the oldest read operation.
 */
export function oldestRead(items: readonly { readonly live: LiveBidState }[]): Date {
  return new Date(Math.min(...items.map(({ live }) => live.observedAt.getTime())));
}

/**
 * Performs the checksum operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the checksum operation.
 */
export function checksum(value: unknown): string {
  const valueJson = canonicalize(normalize(value));
  if (valueJson === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(valueJson).digest('hex');
}

/**
 * Performs the json operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the json operation.
 */
export function json(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/**
 * Performs the input json operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the input json operation.
 */
export function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(json(value)) as Prisma.InputJsonValue;
}

/**
 * Converts normalize into its required representation.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Constructed or normalized result.
 */
export function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

/**
 * Performs the append audit operation while preserving domain invariants.
 *
 * @param client Database or API client used by the operation.
 * @param event Audit event payload to persist.
 * @param event.action Action selected for the durable state transition.
 * @param event.actor Authenticated actor recorded in the audit trail.
 * @param event.before Entity state captured before the mutation.
 * @param event.after Entity state captured after the mutation.
 * @param event.correlationId Correlation identifier propagated to audit and logs.
 * @param event.entityId Identifier of the audited entity.
 * @param event.entityType entity type field of the validated event.
 */
export async function appendAudit(
  client: DatabaseTransaction,
  event: {
    readonly action: string;
    readonly actor: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly correlationId: string;
    readonly entityId: string;
    readonly entityType: string;
  },
): Promise<void> {
  await client.auditEvent.create({
    data: {
      action: event.action,
      actor: event.actor,
      after: event.after === undefined ? Prisma.DbNull : inputJson(redactSecrets(event.after)),
      before: event.before === undefined ? Prisma.DbNull : inputJson(redactSecrets(event.before)),
      correlationId: event.correlationId,
      entityId: event.entityId,
      entityType: event.entityType,
      id: randomUUID(),
    },
  });
}

/**
 * Performs the replay idempotency operation while preserving domain invariants.
 *
 * @param client Database or API client used by the operation.
 * @param scope Stable namespace for the operation.
 * @param key Stable key selecting the requested record.
 * @param requestChecksum Checksum binding the idempotency key to its request.
 * @returns Result produced by the replay idempotency operation.
 */
export async function replayIdempotency(
  client: DatabaseTransaction,
  scope: string | undefined,
  key: string | undefined,
  requestChecksum: string,
): Promise<{ readonly version: string } | null> {
  if (scope === undefined || key === undefined) return null;
  await advisoryTransactionLock(client, `admin-idempotency:${scope}:${key}`);
  const row = await client.idempotencyRecord.findUnique({
    select: { requestChecksum: true, responseBody: true },
    where: { scope_idempotencyKey: { idempotencyKey: key, scope } },
  });
  if (row === null) return null;
  if (row.requestChecksum !== requestChecksum) throw new Error('IDEMPOTENCY_KEY_REUSED');
  return row.responseBody as { readonly version: string };
}

/**
 * Performs the store idempotency operation while preserving domain invariants.
 *
 * @param client Database or API client used by the operation.
 * @param scope Stable namespace for the operation.
 * @param key Stable key selecting the requested record.
 * @param requestChecksum Checksum binding the idempotency key to its request.
 * @param responseBody Serialized response stored for idempotent replay.
 */
export async function storeIdempotency(
  client: DatabaseTransaction,
  scope: string | undefined,
  key: string | undefined,
  requestChecksum: string,
  responseBody: unknown,
): Promise<void> {
  if (scope === undefined || key === undefined) return;
  await client.idempotencyRecord.create({
    data: {
      expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1_000),
      id: randomUUID(),
      idempotencyKey: key,
      requestChecksum,
      responseBody: inputJson(responseBody),
      responseHeaders: {},
      responseStatus: 200,
      scope,
    },
  });
}
