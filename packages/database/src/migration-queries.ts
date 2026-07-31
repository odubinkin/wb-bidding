import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './sql.js';

/**
 * Reads successful migration names from Prisma's internal migration table.
 *
 * The migration table has no generated model and therefore requires raw SQL.
 *
 * @param database - Shared Prisma Client.
 * @returns Applied migration names.
 */
export async function listAppliedMigrationNames(
  database: DatabaseClient,
): Promise<readonly string[]> {
  const rows = await queryRaw<{ migration_name: string }>(
    database,
    Prisma.sql`
      SELECT migration_name
        FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `,
  );
  return rows.map((row) => row.migration_name);
}
