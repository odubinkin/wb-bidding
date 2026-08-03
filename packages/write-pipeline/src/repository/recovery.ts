import { cleanupTerminalWriteAttempts, withTransaction } from '@wb-bidder/database';
import type { ReconciliationWorkItem } from '../types.js';
import { loadReconciliationWorkPage, toClaimed, parseStoredLiveState } from './helpers.js';
import { WriteDispatchRepositoryBase } from './dispatch.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteRecoveryRepositoryBase extends WriteDispatchRepositoryBase {
  /**
   * Executes recover crash windows with the required safety and persistence checks.
   *
   * @returns Outcome produced after the required safety checks complete.
   */
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
   * @param limit Maximum rows, from 1 through 500.
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
   * @param workerId Exact lease owner.
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
   * @param retentionDays Positive configured retention.
   * @param limit Maximum attempts deleted in one transaction.
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
}
