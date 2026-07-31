import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './sql.js';

/** Raw row returned by the atomic economics-import claim helper. */
export interface ClaimedEconomicsImportRecord {
  readonly changeReason: string;
  readonly correlationId: string;
  readonly createdByActor: string;
  readonly dryRun: boolean;
  readonly id: string;
}

/**
 * Atomically claims the oldest queued or expired economics import.
 *
 * PostgreSQL SKIP LOCKED is required for cross-replica claim safety.
 *
 * @param database - Shared Prisma Client.
 * @param workerId - Process-scoped lease owner.
 * @returns Claimed import, or null when no work is available.
 */
export async function claimEconomicsImportRecord(
  database: DatabaseClient,
  workerId: string,
): Promise<ClaimedEconomicsImportRecord | null> {
  const rows = await queryRaw<ClaimedEconomicsImportRecord>(
    database,
    Prisma.sql`
      WITH candidate AS (
        SELECT "id"
          FROM "ProductEconomicsImport"
         WHERE "status" = 'QUEUED'
            OR (
              "status" = 'PROCESSING'
              AND COALESCE("leaseUntil", '-infinity'::timestamptz) < clock_timestamp()
            )
         ORDER BY "createdAt", "id"
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      UPDATE "ProductEconomicsImport" economics_import
         SET "status" = 'PROCESSING',
             "startedAt" = COALESCE(economics_import."startedAt", clock_timestamp()),
             "finishedAt" = NULL,
             "leaseOwner" = ${workerId},
             "leaseUntil" = clock_timestamp() + INTERVAL '5 minutes',
             "attemptCount" = economics_import."attemptCount" + 1
        FROM candidate
       WHERE economics_import."id" = candidate."id"
      RETURNING economics_import."id", economics_import."dryRun",
                economics_import."createdByActor", economics_import."correlationId",
                economics_import."changeReason"
    `,
  );
  return rows[0] ?? null;
}

/**
 * Counts targets without currently effective product economics.
 *
 * The schema relates economics to articles by `nmId` rather than a foreign
 * key, which cannot be expressed as a Prisma relation filter.
 *
 * @param database - Shared Prisma Client.
 * @param now - Effective-time boundary.
 * @returns Number of uncovered targets.
 */
export async function countTargetsWithoutCurrentEconomics(
  database: DatabaseClient,
  now: Date,
): Promise<number> {
  const rows = await queryRaw<{ count: bigint }>(
    database,
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
        FROM "CampaignTarget" target
       WHERE NOT EXISTS (
         SELECT 1
           FROM "ProductEconomics" economics
          WHERE economics."nmId" = target."nmId"
            AND economics."effectiveFrom" <= ${now}
            AND (
              economics."effectiveTo" IS NULL
              OR economics."effectiveTo" > ${now}
            )
       )
    `,
  );
  return Number(rows[0]?.count ?? 0n);
}
