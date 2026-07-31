import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './sql.js';

/** Raw row returned by the atomic manual-job claim helper. */
export interface ClaimedManualJobRecord {
  readonly id: string;
  readonly leaseOwner: string;
  readonly scope: unknown;
  readonly type: string;
}

/**
 * Atomically claims the oldest available manual job.
 *
 * Prisma model operations cannot express PostgreSQL SKIP LOCKED with an
 * UPDATE ... RETURNING claim, so the whole primitive is isolated here.
 *
 * @param database - Shared Prisma Client.
 * @param workerId - Process-scoped lease owner.
 * @returns Claimed job, or null when no work is available.
 */
export async function claimManualJobRecord(
  database: DatabaseClient,
  workerId: string,
): Promise<ClaimedManualJobRecord | null> {
  const rows = await queryRaw<ClaimedManualJobRecord>(
    database,
    Prisma.sql`
      WITH candidate AS (
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
             "leaseOwner" = ${workerId},
             "leaseUntil" = clock_timestamp() + INTERVAL '10 minutes',
             "result" = NULL,
             "errorCode" = NULL
        FROM candidate
       WHERE job."id" = candidate."id"
      RETURNING job."id", job."type", job."scope", job."leaseOwner"
    `,
  );
  return rows[0] ?? null;
}
