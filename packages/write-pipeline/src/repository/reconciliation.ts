/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';
import { withTransaction } from '@wb-bidder/database';
import type { ReconciliationObservation } from '../types.js';
import {
  reconciliationOutcome,
  applyReconciliationOutcome,
  isRetryableClassification,
  checksum,
  inputJson,
  appendAudit,
  replayIdempotency,
  storeIdempotency,
} from './helpers.js';
import { WriteRecoveryRepositoryBase } from './recovery.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteReconciliationRepositoryBase extends WriteRecoveryRepositoryBase {
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
}
