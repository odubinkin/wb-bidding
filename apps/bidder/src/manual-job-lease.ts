import { claimManualJobRecord, type DatabaseClient } from '@wb-bidder/database';

/**
 * Manual job claimed by one scheduler process.
 */
export interface ClaimedManualJob {
  /** Job identifier. */
  readonly id: string;
  /** Exact lease owner required for terminal updates. */
  readonly leaseOwner: string;
  /** Stored bounded job scope. */
  readonly scope: unknown;
  /** Manual job type. */
  readonly type: string;
}

/**
 * Atomically claims the oldest queued or expired running manual job.
 *
 * @param database - Authoritative Prisma Client.
 * @param workerId - Process-scoped lease owner.
 * @returns Claimed job, or null when no work is available.
 */
export async function claimManualJob(
  database: DatabaseClient,
  workerId: string,
): Promise<ClaimedManualJob | null> {
  const row = await claimManualJobRecord(database, workerId);
  return row === null ? null : Object.freeze(row);
}
