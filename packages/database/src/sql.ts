import type { Prisma } from './generated/prisma/client.js';
import type { DatabaseExecutor } from './client.js';

/**
 * Executes a typed PostgreSQL query through Prisma.
 *
 * This internal helper keeps the mechanics of parameterized raw queries
 * consistent across the database package.
 *
 * @param database - Prisma client or active Prisma transaction.
 * @param query - Parameterized Prisma SQL object.
 * @returns Typed result rows.
 */
export async function queryRaw<TRow>(
  database: DatabaseExecutor,
  query: Prisma.Sql,
): Promise<readonly TRow[]> {
  return database.$queryRaw<TRow[]>(query);
}

/**
 * Executes a parameterized PostgreSQL statement through Prisma.
 *
 * @param database - Prisma client or active Prisma transaction.
 * @param statement - Parameterized Prisma SQL object.
 * @returns Number of affected rows reported by PostgreSQL.
 */
export async function executeRaw(
  database: DatabaseExecutor,
  statement: Prisma.Sql,
): Promise<number> {
  return database.$executeRaw(statement);
}
