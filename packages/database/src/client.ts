import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';
import type { Prisma } from './generated/prisma/client.js';

/** The generated application database client. */
export type DatabaseClient = PrismaClient;

/** A Prisma client pinned to one interactive database transaction. */
export type DatabaseTransaction = Prisma.TransactionClient;

/** Database operations accepted by shared raw-SQL helpers. */
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction;

/** Bounded PostgreSQL connection settings owned by the shared database package. */
export interface DatabaseClientOptions {
  readonly applicationName?: string;
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly statementTimeoutMs?: number;
}

/**
 * Creates the only application PostgreSQL client.
 *
 * @param options - Validated connection and pool bounds.
 * @returns Generated Prisma Client backed by Prisma's PostgreSQL adapter.
 */
export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const adapter = new PrismaPg({
    application_name: options.applicationName ?? 'wb-bidder',
    connectionString: options.connectionString,
    max: options.maxConnections ?? 20,
    statement_timeout: options.statementTimeoutMs ?? 30_000,
  });
  return new PrismaClient({ adapter });
}
