/* eslint-disable jsdoc/require-jsdoc */
import { claimDecisionQueueItems, type DatabaseClient } from '@wb-bidder/database';
import type { ClaimedQueueItem } from '../types.js';
import { toClaimed } from './helpers.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteLeaseRepositoryBase {
  protected readonly database: DatabaseClient;

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
}
