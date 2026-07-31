import type { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient, DatabaseTransaction } from './client.js';

/** Options for an interactive Prisma transaction. */
export interface DatabaseTransactionOptions {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
}

/**
 * Runs an operation inside one Prisma interactive transaction.
 *
 * @param database - Shared Prisma Client.
 * @param operation - Work bound to the transaction connection.
 * @param options - Optional isolation and timeout bounds.
 * @returns Operation result.
 */
export async function withTransaction<TResult>(
  database: DatabaseClient,
  operation: (transaction: DatabaseTransaction) => Promise<TResult>,
  options: DatabaseTransactionOptions = {},
): Promise<TResult> {
  return database.$transaction(operation, {
    ...(options.isolationLevel === undefined ? {} : { isolationLevel: options.isolationLevel }),
    maxWait: options.maxWaitMs ?? 5_000,
    timeout: options.timeoutMs ?? 30_000,
  });
}
