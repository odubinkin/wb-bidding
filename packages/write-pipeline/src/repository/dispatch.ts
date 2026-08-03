/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';
import { advisoryTransactionLock, withTransaction } from '@wb-bidder/database';
import { redactSecrets } from '../redaction.js';
import { stateChecksum } from '../state-machine.js';
import type { ClaimedQueueItem, DispatchResult, LiveBidState, PreparedWrite } from '../types.js';
import {
  assertAutomationAllows,
  classifyRejected,
  isRetryableRejected,
  oldestRead,
  checksum,
  inputJson,
} from './helpers.js';
import { WriteLeaseRepositoryBase } from './lease.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteDispatchRepositoryBase extends WriteLeaseRepositoryBase {
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
}
