import { Prisma } from './generated/prisma/client.js';
import type { DatabaseTransaction } from './client.js';
import { executeRaw } from './sql.js';

/**
 * Takes a transaction-scoped PostgreSQL advisory lock.
 *
 * @param transaction - Active Prisma transaction.
 * @param key - Stable lock namespace and identity.
 */
export async function advisoryTransactionLock(
  transaction: DatabaseTransaction,
  key: string,
): Promise<void> {
  await executeRaw(
    transaction,
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}
