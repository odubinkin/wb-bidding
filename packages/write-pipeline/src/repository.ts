/* eslint-disable jsdoc/require-jsdoc */
import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import {
  advisoryTransactionLock,
  claimDecisionQueueItems,
  cleanupTerminalWriteAttempts,
  type DatabaseClient,
  type DatabaseTransaction,
  Prisma,
  withTransaction,
} from '@wb-bidder/database';

import { redactSecrets } from './redaction.js';
import { isSafeStableOldRetry, stateChecksum } from './state-machine.js';
import type {
  ClaimedQueueItem,
  DispatchResult,
  LiveBidState,
  PreparedWrite,
  ReconciliationObservation,
  ReconciliationWorkItem,
} from './types.js';

/** Stable primary key of the singleton deployment-level automation control row. */
export const DEPLOYMENT_CONTROL_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Transactional PostgreSQL persistence for the write and reconciliation lifecycle.
 */
export class WritePipelineRepository {
  private readonly database: DatabaseClient;

  public constructor(database: DatabaseClient) {
    this.database = database;
  }

  public async claim(
    workerId: string,
    limit: number,
    leaseSeconds: number,
    selector?: {
      readonly action: 'DELETE' | 'SET';
      readonly targetKind: 'CARD' | 'CLUSTER';
    },
  ): Promise<readonly ClaimedQueueItem[]> {
    if (limit < 1 || limit > 500 || leaseSeconds < 5 || leaseSeconds > 900) {
      throw new Error('INVALID_CLAIM_BOUNDS');
    }
    const rows = await claimDecisionQueueItems(this.database, {
      leaseSeconds,
      limit,
      workerId,
      ...(selector?.action === undefined ? {} : { action: selector.action }),
      ...(selector?.targetKind === undefined ? {} : { targetKind: selector.targetKind }),
    });
    return Object.freeze(rows.map(toClaimed));
  }

  public async heartbeat(workerId: string, queueItemIds: readonly string[], leaseSeconds: number) {
    if (queueItemIds.length === 0) return 0;
    const result = await this.database.decisionQueueItem.updateMany({
      data: { leaseUntil: new Date(Date.now() + leaseSeconds * 1_000) },
      where: { id: { in: [...queueItemIds] }, leaseOwner: workerId, status: 'LEASED' },
    });
    return result.count;
  }

  public async releaseLease(
    queueItemId: string,
    workerId: string,
    classification: string,
    retryAt: Date,
  ): Promise<void> {
    await this.database.decisionQueueItem.updateMany({
      data: {
        availableAt: retryAt,
        failureClassification: classification,
        leaseOwner: null,
        leaseUntil: null,
        status: 'RETRY_WAIT',
        version: { increment: 1n },
      },
      where: { id: queueItemId, leaseOwner: workerId, status: 'LEASED' },
    });
  }

  public async failLeased(
    queueItemId: string,
    workerId: string,
    code: string,
    classification: string,
  ): Promise<void> {
    await this.database.decisionQueueItem.updateMany({
      data: {
        failureClassification: classification,
        lastErrorCode: code,
        leaseOwner: null,
        leaseUntil: null,
        manualRetryBlocked: ['AUTH', 'CAPABILITY', 'INVALID', 'SUPERSEDED'].includes(
          classification,
        ),
        status: 'FAILED',
        version: { increment: 1n },
      },
      where: { id: queueItemId, leaseOwner: workerId, status: 'LEASED' },
    });
  }

  public async prepare(input: {
    readonly workerId: string;
    readonly endpointKey: string;
    readonly method: string;
    readonly items: readonly { readonly item: ClaimedQueueItem; readonly live: LiveBidState }[];
    readonly visibilityDelayMs: number;
    readonly reconciliationDeadlineMs: number;
  }): Promise<PreparedWrite> {
    if (input.items.length === 0) throw new Error('EMPTY_WRITE_BATCH');
    const correlationId = randomUUID();
    const attemptId = randomUUID();
    return withTransaction(
      this.database,
      async (transaction) => {
        await assertAutomationAllows(transaction, input.items);
        const requestDigest = input.items.map(({ item }) => ({
          action: item.action,
          bidMinor: item.bidMinor?.toString() ?? null,
          decisionId: item.decisionId,
        }));
        await transaction.wbWriteAttempt.create({
          data: {
            batchSize: input.items.length,
            correlationId,
            endpointKey: input.endpointKey,
            id: attemptId,
            method: input.method,
            preWriteReadAt: oldestRead(input.items),
            preWriteSourceMarker: input.items.map(({ live }) => live.sourceMarker).join(','),
            preWriteStateChecksum: checksum(input.items.map(({ live }) => stateChecksum(live))),
            preparedAt: new Date(),
            requestChecksum: checksum(requestDigest),
            requestDigest: inputJson(requestDigest),
            status: 'PREPARED',
          },
        });
        const preparedItems = [];
        for (const [requestIndex, entry] of input.items.entries()) {
          const locked = await transaction.decisionQueueItem.updateMany({
            data: { attemptCount: { increment: 0 } },
            where: {
              decisionId: entry.item.decisionId,
              id: entry.item.queueItemId,
              leaseOwner: input.workerId,
              status: 'LEASED',
            },
          });
          if (locked.count !== 1) throw new Error('LEASE_LOST');
          const queue = await transaction.decisionQueueItem.findUniqueOrThrow({
            select: { attemptCount: true },
            where: { id: entry.item.queueItemId },
          });
          const attemptNumber = queue.attemptCount + 1;
          const attemptItemId = randomUUID();
          const desired = {
            bidMinor: entry.item.bidMinor?.toString() ?? null,
            explicit: entry.item.desiredBidState === 'EXPLICIT',
          };
          await transaction.wbWriteAttemptItem.create({
            data: {
              action: entry.item.action,
              attemptId,
              attemptNumber,
              decisionId: entry.item.decisionId,
              desiredBidState: entry.item.desiredBidState,
              desiredStateChecksum: checksum(desired),
              endpointTargetKey: entry.item.targetId,
              id: attemptItemId,
              preWriteReadAt: entry.live.observedAt,
              preWriteSourceMarker: entry.live.sourceMarker,
              preWriteState: inputJson(entry.live),
              preWriteStateChecksum: stateChecksum(entry.live),
              reconciliationStatus: 'NOT_REQUIRED',
              requestIndex,
              sentBidMinor: entry.item.bidMinor,
              status: 'PREPARED',
              wireBidRaw:
                entry.item.action === 'DELETE'
                  ? (entry.live.bidMinor?.toString() ?? '')
                  : (entry.item.bidMinor?.toString() ?? ''),
            },
          });
          preparedItems.push({
            attemptItemId,
            attemptNumber,
            decisionId: entry.item.decisionId,
            queueItemId: entry.item.queueItemId,
            requestIndex,
            targetId: entry.item.targetId,
          });
        }
        return Object.freeze({
          attemptId,
          correlationId,
          items: Object.freeze(preparedItems),
        });
      },
      { timeoutMs: 60_000 },
    );
  }

  public async commitDispatch(
    prepared: PreparedWrite,
    workerId: string,
    visibilityDelayMs: number,
    reconciliationDeadlineMs: number,
    preWriteStateMaximumAgeMs: number,
  ): Promise<void> {
    await withTransaction(
      this.database,
      async (transaction) => {
        const itemRows = await transaction.wbWriteAttemptItem.findMany({
          select: {
            decision: {
              select: {
                createdAt: true,
                id: true,
                target: { select: { campaignId: true } },
                targetId: true,
              },
            },
          },
          where: { attemptId: prepared.attemptId },
        });
        const targets = itemRows.map(({ decision }) => ({
          campaignId: decision.target.campaignId,
          decisionCreatedAt: decision.createdAt,
          decisionId: decision.id,
          targetId: decision.targetId,
        }));
        const targetIds = [...new Set(targets.map((row) => row.targetId))].sort();
        for (const targetId of targetIds) {
          await advisoryTransactionLock(transaction, `decision:${targetId}`);
        }
        for (const item of targets) {
          const newer = await transaction.bidDecision.findFirst({
            select: { id: true },
            where: {
              targetId: item.targetId,
              OR: [
                { createdAt: { gt: item.decisionCreatedAt } },
                { createdAt: item.decisionCreatedAt, id: { gt: item.decisionId } },
              ],
            },
          });
          if (newer !== null) throw new Error('DECISION_SUPERSEDED');
        }
        await assertAutomationAllows(
          transaction,
          targets.map((row) => ({
            item: { campaignId: row.campaignId, targetId: row.targetId },
          })),
        );
        const now = new Date();
        const oldestAllowed = new Date(now.getTime() - preWriteStateMaximumAgeMs);
        const attempt = await transaction.wbWriteAttempt.updateMany({
          data: { dispatchCommittedAt: now, status: 'DISPATCHING' },
          where: {
            id: prepared.attemptId,
            preWriteReadAt: { gte: oldestAllowed },
            status: 'PREPARED',
          },
        });
        if (attempt.count !== 1) {
          const current = await transaction.wbWriteAttempt.findUnique({
            select: { preWriteReadAt: true },
            where: { id: prepared.attemptId },
          });
          if (current?.preWriteReadAt != null && current.preWriteReadAt < oldestAllowed)
            throw new Error('PREWRITE_STATE_STALE');
          throw new Error('ATTEMPT_NOT_PREPARED');
        }
        await transaction.wbWriteAttemptItem.updateMany({
          data: { reconciliationStatus: 'PENDING', status: 'DISPATCHING' },
          where: { attemptId: prepared.attemptId, status: 'PREPARED' },
        });
        let updatedQueueItems = 0;
        for (const item of prepared.items) {
          const queueUpdate = await transaction.decisionQueueItem.updateMany({
            data: {
              attemptCount: item.attemptNumber,
              lastReconciliationReadAt: null,
              leaseOwner: null,
              leaseUntil: null,
              nextVerificationAt: new Date(now.getTime() + visibilityDelayMs),
              reconciliationDeadlineAt: new Date(now.getTime() + reconciliationDeadlineMs),
              sentAt: now,
              stableReadChecksum: null,
              stableReadCount: 0,
              status: 'SENT',
              version: { increment: 1n },
            },
            where: {
              decisionId: item.decisionId,
              leaseOwner: workerId,
              status: 'LEASED',
            },
          });
          updatedQueueItems += queueUpdate.count;
        }
        if (updatedQueueItems !== prepared.items.length) throw new Error('LEASE_LOST');
      },
      { timeoutMs: 60_000 },
    );
  }

  public async rejectPreparedNoDispatch(
    prepared: PreparedWrite,
    workerId: string,
    code: string,
  ): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      const attempt = await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: new Date(),
          errorClass: 'NO_DISPATCH',
          errorCode: code,
          status: 'REJECTED',
        },
        where: { id: prepared.attemptId, status: 'PREPARED' },
      });
      if (attempt.count !== 1) throw new Error('ATTEMPT_NOT_PREPARED');
      await transaction.wbWriteAttemptItem.updateMany({
        data: { errorCode: code, reconciliationStatus: 'NOT_REQUIRED', status: 'REJECTED' },
        where: { attemptId: prepared.attemptId, status: 'PREPARED' },
      });
      const superseded = code === 'DECISION_SUPERSEDED';
      let updated = 0;
      for (const item of prepared.items) {
        const queue = await transaction.decisionQueueItem.updateMany({
          data: {
            ...(superseded ? {} : { availableAt: new Date() }),
            failureClassification: superseded ? 'SUPERSEDED' : 'SAFE_NO_DISPATCH',
            lastErrorCode: code,
            leaseOwner: null,
            leaseUntil: null,
            manualRetryBlocked: superseded,
            status: superseded ? 'SUPERSEDED' : 'RETRY_WAIT',
            version: { increment: 1n },
          },
          where: {
            decisionId: item.decisionId,
            leaseOwner: workerId,
            status: 'LEASED',
          },
        });
        updated += queue.count;
      }
      if (updated !== prepared.items.length) throw new Error('LEASE_LOST');
    });
  }

  public async completeDispatch(
    attemptId: string,
    result: DispatchResult,
    latencyMs: number,
  ): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: new Date(),
          httpStatus: result.httpStatus,
          latencyMs,
          rateLimitHeaders: inputJson(result.rateLimitHeaders ?? {}),
          responseDigest: inputJson(redactSecrets(result)),
          status: result.items.every((item) => item.accepted) ? 'ACCEPTED' : 'REJECTED',
          wbRequestId: result.wbRequestId ?? null,
        },
        where: { id: attemptId, status: 'DISPATCHING' },
      });
      for (const item of result.items) {
        const fragmentHash = checksum(redactSecrets(item.responseFragment ?? null));
        const stored = await transaction.wbWriteAttemptItem.findFirst({
          select: { decisionId: true, id: true },
          where: { attemptId, requestIndex: item.requestIndex, status: 'DISPATCHING' },
        });
        if (stored === null) continue;
        const httpStatus = item.httpStatus ?? result.httpStatus;
        await transaction.wbWriteAttemptItem.update({
          data: {
            errorCode: item.errorCode ?? null,
            httpStatus,
            reconciliationStatus: item.accepted ? 'PENDING' : 'NOT_REQUIRED',
            responseFragmentHash: fragmentHash,
            status: item.accepted ? 'ACCEPTED' : 'REJECTED',
          },
          where: { id: stored.id },
        });
        await transaction.decisionQueueItem.updateMany({
          data: {
            failureClassification: item.accepted ? null : classifyRejected(item.errorCode),
            lastErrorCode: item.errorCode ?? null,
            lastHttpStatus: httpStatus,
            manualRetryBlocked: item.accepted ? false : !isRetryableRejected(item.errorCode),
            status: item.accepted ? 'VERIFY_WAIT' : 'FAILED',
            version: { increment: 1n },
          },
          where: { decisionId: stored.decisionId },
        });
      }
    });
  }

  public async markUnknown(attemptId: string, code: string, detail: unknown): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: new Date(),
          errorClass: 'AMBIGUOUS',
          errorCode: code,
          responseDigest: inputJson(redactSecrets(detail)),
          status: 'UNKNOWN',
        },
        where: { id: attemptId, status: 'DISPATCHING' },
      });
      const items = await transaction.wbWriteAttemptItem.findMany({
        select: { decisionId: true },
        where: { attemptId },
      });
      await transaction.wbWriteAttemptItem.updateMany({
        data: { errorCode: code, reconciliationStatus: 'PENDING', status: 'UNKNOWN' },
        where: { attemptId, status: 'DISPATCHING' },
      });
      await transaction.decisionQueueItem.updateMany({
        data: {
          failureClassification: 'UNKNOWN',
          lastErrorCode: code,
          manualRetryBlocked: true,
          status: 'VERIFY_WAIT',
          version: { increment: 1n },
        },
        where: { decisionId: { in: items.map((item) => item.decisionId) } },
      });
    });
  }

  public async markPreByteFailure(attemptId: string, detail: unknown): Promise<void> {
    await withTransaction(this.database, async (transaction) => {
      const code = 'TRANSPORT_PRE_BYTE_RETRIES_EXHAUSTED';
      await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: new Date(),
          errorClass: 'TRANSPORT_PRE_BYTE',
          errorCode: code,
          responseDigest: inputJson(redactSecrets(detail)),
          status: 'REJECTED',
        },
        where: { id: attemptId, status: 'DISPATCHING' },
      });
      const items = await transaction.wbWriteAttemptItem.findMany({
        select: { decisionId: true },
        where: { attemptId },
      });
      await transaction.wbWriteAttemptItem.updateMany({
        data: { errorCode: code, reconciliationStatus: 'NOT_REQUIRED', status: 'REJECTED' },
        where: { attemptId, status: 'DISPATCHING' },
      });
      await transaction.decisionQueueItem.updateMany({
        data: {
          failureClassification: 'TRANSIENT_REJECTED',
          lastErrorCode: code,
          manualRetryBlocked: false,
          status: 'FAILED',
          version: { increment: 1n },
        },
        where: {
          decisionId: { in: items.map((item) => item.decisionId) },
          status: 'SENT',
        },
      });
    });
  }

  public async recoverCrashWindows(): Promise<{
    readonly prepared: number;
    readonly unknown: number;
  }> {
    return withTransaction(this.database, async (transaction) => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 5 * 60 * 1_000);
      const preparedAttempts = await transaction.wbWriteAttempt.findMany({
        select: { id: true },
        where: { preparedAt: { lt: cutoff }, status: 'PREPARED' },
      });
      const preparedIds = preparedAttempts.map(({ id }) => id);
      await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: now,
          errorClass: 'RECOVERED_NO_DISPATCH',
          errorCode: 'PREPARED_CRASH_RECOVERED',
          status: 'REJECTED',
        },
        where: { id: { in: preparedIds }, status: 'PREPARED' },
      });
      const prepared = await transaction.wbWriteAttemptItem.updateMany({
        data: { errorCode: 'PREPARED_CRASH_RECOVERED', status: 'REJECTED' },
        where: { attemptId: { in: preparedIds } },
      });
      await transaction.decisionQueueItem.updateMany({
        data: {
          availableAt: now,
          leaseOwner: null,
          leaseUntil: null,
          status: 'QUEUED',
          version: { increment: 1n },
        },
        where: { leaseUntil: { lt: now }, status: 'LEASED' },
      });
      const unknownAttempts = await transaction.wbWriteAttempt.findMany({
        select: { id: true },
        where: { dispatchCommittedAt: { lt: cutoff }, status: 'DISPATCHING' },
      });
      const unknownIds = unknownAttempts.map(({ id }) => id);
      await transaction.wbWriteAttempt.updateMany({
        data: {
          completedAt: now,
          errorClass: 'AMBIGUOUS',
          errorCode: 'DISPATCHING_CRASH_RECOVERED',
          status: 'UNKNOWN',
        },
        where: { id: { in: unknownIds }, status: 'DISPATCHING' },
      });
      const unknownItems = await transaction.wbWriteAttemptItem.findMany({
        select: { decisionId: true },
        where: { attemptId: { in: unknownIds } },
      });
      const unknown = await transaction.wbWriteAttemptItem.updateMany({
        data: {
          errorCode: 'DISPATCHING_CRASH_RECOVERED',
          reconciliationStatus: 'PENDING',
          status: 'UNKNOWN',
        },
        where: { attemptId: { in: unknownIds } },
      });
      await transaction.decisionQueueItem.updateMany({
        data: {
          failureClassification: 'UNKNOWN',
          manualRetryBlocked: true,
          status: 'VERIFY_WAIT',
          version: { increment: 1n },
        },
        where: {
          decisionId: { in: unknownItems.map(({ decisionId }) => decisionId) },
          status: 'SENT',
        },
      });
      return { prepared: prepared.count, unknown: unknown.count };
    });
  }

  /**
   * Loads a bounded due verification/reconciliation page without taking a write lease.
   *
   * Individual state transitions remain serialized by `recordReconciliation` row locks.
   *
   * @param limit - Maximum rows, from 1 through 500.
   * @returns Due work ordered by verification time and queue identity.
   */
  public async loadReconciliationBatch(limit: number): Promise<readonly ReconciliationWorkItem[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('INVALID_RECONCILIATION_BATCH_SIZE');
    }
    const rows = await loadReconciliationWorkPage(this.database, limit);
    return Object.freeze(
      rows.map((row) => {
        const oldState = parseStoredLiveState(row.preWriteState);
        return Object.freeze({
          attemptItemId: row.attemptItemId,
          decisionId: row.decisionId,
          desired: Object.freeze({
            bidMinor: row.sentBidMinor === null ? null : BigInt(row.sentBidMinor),
            explicit: row.desiredBidState === 'EXPLICIT',
          }),
          item: toClaimed(row),
          oldState,
        });
      }),
    );
  }

  /**
   * Releases queue leases owned by a stopping process.
   *
   * @param workerId - Exact lease owner.
   * @returns Number of released queue rows.
   */
  public async releaseWorkerLeases(workerId: string): Promise<number> {
    const result = await this.database.decisionQueueItem.updateMany({
      data: {
        availableAt: new Date(),
        failureClassification: 'GRACEFUL_SHUTDOWN',
        leaseOwner: null,
        leaseUntil: null,
        status: 'RETRY_WAIT',
        version: { increment: 1n },
      },
      where: { leaseOwner: workerId, status: 'LEASED' },
    });
    return result.count;
  }

  /**
   * Deletes one bounded batch of terminal detailed write records after retention.
   *
   * PREPARED, DISPATCHING, UNKNOWN, and pending reconciliation are never selected.
   * Business audit and decisions remain intact.
   *
   * @param retentionDays - Positive configured retention.
   * @param limit - Maximum attempts deleted in one transaction.
   * @returns Deleted attempt count.
   */
  public async cleanupTerminalAttempts(retentionDays: number, limit = 1_000): Promise<number> {
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10_000
    ) {
      throw new Error('INVALID_RETENTION_BOUNDS');
    }
    return cleanupTerminalWriteAttempts(this.database, retentionDays, limit);
  }

  public async recordReconciliation(input: {
    readonly attemptItemId: string;
    readonly decisionId: string;
    readonly targetId: string;
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
    readonly minimumReadIntervalMs: number;
    readonly requiredStableReadCount: number;
    readonly maximumWriteAttempts: number;
  }): Promise<'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED'> {
    return withTransaction(
      this.database,
      async (transaction) => {
        await transaction.decisionQueueItem.updateMany({
          data: { stableReadCount: { increment: 0 } },
          where: { decisionId: input.decisionId },
        });
        const storedQueue = await transaction.decisionQueueItem.findUnique({
          select: {
            lastReconciliationReadAt: true,
            nextVerificationAt: true,
            reconciliationDeadlineAt: true,
            stableReadChecksum: true,
            stableReadCount: true,
            status: true,
          },
          where: { decisionId: input.decisionId },
        });
        const actualDispatchCount = await transaction.wbWriteAttemptItem.count({
          where: {
            decisionId: input.decisionId,
            attempt: {
              OR: [
                { errorClass: null },
                { errorClass: { notIn: ['TRANSPORT_PRE_BYTE', 'NO_DISPATCH'] } },
              ],
            },
          },
        });
        const queue = storedQueue === null ? null : { ...storedQueue, actualDispatchCount };
        if (queue?.status !== 'VERIFY_WAIT') {
          throw new Error('RECONCILIATION_NOT_PENDING');
        }
        if (queue.nextVerificationAt !== null && input.observedAt < queue.nextVerificationAt) {
          throw new Error('RECONCILIATION_VISIBILITY_DELAY_ACTIVE');
        }
        await transaction.reconciliationRead.create({
          data: {
            attemptItemId: input.attemptItemId,
            classification: input.observation.classification,
            fresh: input.observation.fresh,
            id: randomUUID(),
            prevalidationPassed: input.observation.prevalidationPassed,
            readAt: input.observedAt,
            sourceMarker: input.observation.sourceMarker,
            state: inputJson(input.observation.state),
            stateChecksum: input.observation.stateChecksum,
            targetId: input.targetId,
          },
        });
        const outcome = reconciliationOutcome(queue, input);
        await applyReconciliationOutcome(transaction, input, queue, outcome);
        return outcome;
      },
      { timeoutMs: 60_000 },
    );
  }

  public async retryFailure(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly decisionId: string;
    readonly expectedVersion: bigint;
    readonly idempotencyKey?: string;
    readonly idempotencyScope?: string;
    readonly reason: string;
  }): Promise<bigint> {
    return withTransaction(
      this.database,
      async (transaction) => {
        const idempotencyChecksum = checksum({
          decisionId: input.decisionId,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        });
        const replay = await replayIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
        );
        if (replay !== null) {
          return BigInt(replay.version);
        }
        const row = await transaction.decisionQueueItem.findUnique({
          select: {
            failureClassification: true,
            manualRetryBlocked: true,
            status: true,
            version: true,
          },
          where: { decisionId: input.decisionId },
        });
        if (row === null) throw new Error('QUEUE_ITEM_NOT_FOUND');
        if (row.version !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
        if (
          row.status !== 'FAILED' ||
          row.manualRetryBlocked ||
          !isRetryableClassification(row.failureClassification)
        ) {
          throw new Error('RETRY_NOT_SAFE');
        }
        const newVersion = row.version + 1n;
        const updated = await transaction.decisionQueueItem.updateMany({
          data: {
            availableAt: new Date(),
            failureClassification: null,
            lastErrorClass: null,
            lastErrorCode: null,
            manualRetryBlocked: false,
            stableReadChecksum: null,
            stableReadCount: 0,
            status: 'RETRY_WAIT',
            version: newVersion,
          },
          where: {
            decisionId: input.decisionId,
            failureClassification: row.failureClassification,
            manualRetryBlocked: false,
            status: 'FAILED',
            version: row.version,
          },
        });
        if (updated.count !== 1) throw new Error('VERSION_MISMATCH');
        await appendAudit(transaction, {
          action: 'QUEUE_FAILURE_RETRY_SCHEDULED',
          actor: input.actor,
          after: {
            decisionId: input.decisionId,
            idempotencyKey: input.idempotencyKey ?? null,
            reason: input.reason,
            version: newVersion.toString(),
          },
          correlationId: input.correlationId,
          entityId: input.decisionId,
          entityType: 'DecisionQueueItem',
        });
        await storeIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
          { decisionId: input.decisionId, status: 'RETRY_WAIT', version: newVersion.toString() },
        );
        return newVersion;
      },
      { timeoutMs: 60_000 },
    );
  }

  public async setGlobalKill(input: ControlMutation): Promise<bigint> {
    return withTransaction(
      this.database,
      async (transaction) => {
        const idempotencyChecksum = checksum({
          enabled: input.enabled,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        });
        const replay = await replayIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
        );
        if (replay !== null) {
          return BigInt(replay.version);
        }
        const row = await transaction.deploymentControl.findUnique({
          select: { globalKill: true, version: true },
          where: { id: DEPLOYMENT_CONTROL_ID },
        });
        if (row === null) throw new Error('CONTROL_NOT_INITIALIZED');
        if (row.version !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
        const version = row.version + 1n;
        const updated = await transaction.deploymentControl.updateMany({
          data: {
            globalKill: input.enabled,
            reason: input.reason,
            updatedBy: input.actor,
            version,
          },
          where: { id: DEPLOYMENT_CONTROL_ID, version: row.version },
        });
        if (updated.count !== 1) throw new Error('VERSION_MISMATCH');
        await appendAudit(transaction, {
          action: input.enabled ? 'GLOBAL_KILL_ENABLED' : 'GLOBAL_KILL_DISABLED',
          actor: input.actor,
          before: { globalKill: row.globalKill, version: row.version },
          after: {
            globalKill: input.enabled,
            idempotencyKey: input.idempotencyKey ?? null,
            reason: input.reason,
            version: version.toString(),
          },
          correlationId: input.correlationId,
          entityId: DEPLOYMENT_CONTROL_ID,
          entityType: 'DeploymentControl',
        });
        await storeIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
          { enabled: input.enabled, version: version.toString() },
        );
        return version;
      },
      { timeoutMs: 60_000 },
    );
  }
}

interface ControlMutation {
  readonly actor: string;
  readonly correlationId: string;
  readonly enabled: boolean;
  readonly expectedVersion: bigint;
  readonly idempotencyKey?: string;
  readonly idempotencyScope?: string;
  readonly reason: string;
}

interface ClaimRow {
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

interface ReconciliationQueueRow {
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
 * @param database - Shared Prisma client.
 * @param limit - Maximum due queue rows.
 * @returns Flattened reconciliation work rows.
 */
async function loadReconciliationWorkPage(database: DatabaseClient, limit: number) {
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

function toClaimed(row: ClaimRow): ClaimedQueueItem {
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
 * @param value - JSONB state.
 * @returns Typed immutable live state.
 */
function parseStoredLiveState(value: unknown): LiveBidState {
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

async function assertAutomationAllows(
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

function reconciliationOutcome(
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

async function applyReconciliationOutcome(
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

function classifyRejected(code: string | undefined): string {
  if (code?.includes('AUTH') === true) return 'AUTH';
  if (code?.includes('CAPABILITY') === true) return 'CAPABILITY';
  if (code?.includes('INVALID') === true) return 'INVALID';
  return 'TRANSIENT_REJECTED';
}

function isRetryableRejected(code: string | undefined): boolean {
  return classifyRejected(code) === 'TRANSIENT_REJECTED';
}

function isRetryableClassification(value: string | null): boolean {
  return value === 'TRANSIENT_REJECTED' || value === 'SAFE_STABLE_OLD_STATE';
}

function oldestRead(items: readonly { readonly live: LiveBidState }[]): Date {
  return new Date(Math.min(...items.map(({ live }) => live.observedAt.getTime())));
}

function checksum(value: unknown): string {
  const valueJson = canonicalize(normalize(value));
  if (valueJson === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(valueJson).digest('hex');
}

function json(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(json(value)) as Prisma.InputJsonValue;
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

async function appendAudit(
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

async function replayIdempotency(
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

async function storeIdempotency(
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
