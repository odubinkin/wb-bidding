import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './sql.js';

/**
 * Reads bounded session utilization for this application's Prisma pool.
 *
 * @param database - Shared Prisma Client.
 * @param applicationName - Configured PostgreSQL application name.
 * @param maximumConnections - Connection capacity configured for Prisma's adapter.
 * @returns Ratio in the inclusive range zero to one.
 */
export async function readDatabaseConnectionUtilization(
  database: DatabaseClient,
  applicationName: string,
  maximumConnections: number,
): Promise<number> {
  const rows = await queryRaw<{ count: bigint }>(
    database,
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND application_name = ${applicationName}
    `,
  );
  const count = Number(rows[0]?.count ?? 0n);
  return maximumConnections <= 0 ? 0 : Math.min(1, count / maximumConnections);
}
