import { claimDecisionQueueItems, type DatabaseClient } from '@wb-bidder/database';
import type { ClaimedQueueItem } from '../types.js';
import { toClaimed } from './helpers.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteLeaseRepositoryBase {
  protected readonly database: DatabaseClient;

  /**
   * Creates a write lease repository base instance with its required dependencies.
   *
   * @param database Database client used for the transactional operation.
   */
  public constructor(database: DatabaseClient) {
    this.database = database;
  }

  /**
   * Performs the claim operation while preserving domain invariants.
   *
   * @param workerId Replica-safe worker identifier owning the lease.
   * @param limit Maximum number of records to process.
   * @param leaseSeconds Duration of the worker lease in seconds.
   * @param selector Bounded selector used to choose eligible records.
   * @param selector.action Action selected for the durable state transition.
   * @param selector.targetKind Target kind selecting card or cluster behavior.
   * @returns Result produced by the claim operation.
   */
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

  /**
   * Performs the heartbeat operation while preserving domain invariants.
   *
   * @param workerId Replica-safe worker identifier owning the lease.
   * @param queueItemIds Queue item identifiers whose leases are renewed together.
   * @param leaseSeconds Duration of the worker lease in seconds.
   * @returns Result produced by the heartbeat operation.
   */
  public async heartbeat(workerId: string, queueItemIds: readonly string[], leaseSeconds: number) {
    if (queueItemIds.length === 0) return 0;
    const result = await this.database.decisionQueueItem.updateMany({
      data: { leaseUntil: new Date(Date.now() + leaseSeconds * 1_000) },
      where: { id: { in: [...queueItemIds] }, leaseOwner: workerId, status: 'LEASED' },
    });
    return result.count;
  }

  /**
   * Releases or removes lease.
   *
   * @param queueItemId Queue item identifier selecting the durable work item.
   * @param workerId Replica-safe worker identifier owning the lease.
   * @param classification Failure classification assigned to the queue item.
   * @param retryAt Earliest timestamp at which retry is allowed.
   */
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

  /**
   * Performs the fail leased operation while preserving domain invariants.
   *
   * @param queueItemId Queue item identifier selecting the durable work item.
   * @param workerId Replica-safe worker identifier owning the lease.
   * @param code Stable machine-readable outcome code.
   * @param classification Failure classification assigned to the queue item.
   */
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
