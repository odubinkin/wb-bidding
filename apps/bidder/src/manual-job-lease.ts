import type { Pool } from 'pg';

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
 * @param pool - Authoritative PostgreSQL pool.
 * @param workerId - Process-scoped lease owner.
 * @returns Claimed job, or null when no work is available.
 */
export async function claimManualJob(
  pool: Pool,
  workerId: string,
): Promise<ClaimedManualJob | null> {
  const result = await pool.query<{
    id: string;
    leaseOwner: string;
    scope: unknown;
    type: string;
  }>(
    `WITH candidate AS (
       SELECT "id"
         FROM "ManualJob"
        WHERE "status" = 'QUEUED'
           OR (
             "status" = 'RUNNING'
             AND COALESCE("leaseUntil", '-infinity'::timestamptz) < clock_timestamp()
           )
        ORDER BY "requestedAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE "ManualJob" job
        SET "status" = 'RUNNING',
            "startedAt" = COALESCE(job."startedAt", clock_timestamp()),
            "finishedAt" = NULL,
            "leaseOwner" = $1,
            "leaseUntil" = clock_timestamp() + INTERVAL '10 minutes',
            "result" = NULL,
            "errorCode" = NULL
       FROM candidate
      WHERE job."id" = candidate."id"
     RETURNING job."id", job."type", job."scope", job."leaseOwner"`,
    [workerId],
  );
  const row = result.rows[0];
  return row === undefined ? null : Object.freeze(row);
}
