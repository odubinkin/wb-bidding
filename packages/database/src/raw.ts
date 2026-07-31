/* eslint-disable jsdoc/require-jsdoc */
import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient, DatabaseExecutor, DatabaseTransaction } from './client.js';

/** Options for an interactive Prisma transaction. */
export interface DatabaseTransactionOptions {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
}

/** Raw row returned by the atomic manual-job claim helper. */
export interface ClaimedManualJobRecord {
  readonly id: string;
  readonly leaseOwner: string;
  readonly scope: unknown;
  readonly type: string;
}

/** Raw row returned by the atomic economics-import claim helper. */
export interface ClaimedEconomicsImportRecord {
  readonly changeReason: string;
  readonly correlationId: string;
  readonly createdByActor: string;
  readonly dryRun: boolean;
  readonly id: string;
}

/** Minimal result shape used by legacy-shaped raw persistence primitives. */
export interface RawQueryResult<TRow = Record<string, unknown>> {
  readonly rowCount: number | null;
  readonly rows: readonly TRow[];
}

/** Transaction-bound raw query surface implemented exclusively through Prisma. */
export interface RawTransactionClient {
  query<TRow = Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<RawQueryResult<TRow>>;
  release(): void;
}

/** Raw query surface backed by the shared Prisma client. */
export interface RawDatabaseClient {
  connect(): Promise<RawTransactionClient>;
  query<TRow = Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<RawQueryResult<TRow>>;
}

/**
 * Executes a typed PostgreSQL query through Prisma.
 *
 * Raw SQL is intentionally centralized here. Callers must prefer generated
 * model delegates and use this helper only for PostgreSQL features that Prisma
 * cannot express.
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

/**
 * Executes one positional-parameter SQL statement through Prisma.
 *
 * This compatibility surface exists for PostgreSQL primitives that are not
 * representable by generated delegates. It keeps unsafe Prisma APIs and
 * transaction ownership inside the shared database package while repositories
 * are progressively reduced to generated model operations.
 *
 * @param database - Prisma client or active transaction.
 * @param statement - Static SQL statement using PostgreSQL `$n` placeholders.
 * @param values - Bound values; never interpolated into the SQL text.
 * @returns Rows for result-producing statements and an affected-row count.
 */
export async function queryParameterizedRaw<TRow = Record<string, unknown>>(
  database: DatabaseExecutor,
  statement: string,
  values: readonly unknown[] = [],
): Promise<RawQueryResult<TRow>> {
  if (isAdvisoryLockStatement(statement)) {
    const rowCount = await database.$executeRawUnsafe(statement, ...values);
    return { rowCount, rows: [] };
  }
  if (returnsRows(statement)) {
    const rows = await database.$queryRawUnsafe<TRow[]>(statement, ...values);
    return { rowCount: rows.length, rows };
  }
  const rowCount = await database.$executeRawUnsafe(statement, ...values);
  return { rowCount, rows: [] };
}

/**
 * Creates a Prisma-backed raw SQL facade for complex PostgreSQL primitives.
 *
 * `connect()` pins every statement to one Prisma interactive transaction.
 * BEGIN/COMMIT/ROLLBACK are interpreted as transaction control and are never
 * sent as raw statements.
 *
 * @param database - Shared Prisma Client.
 * @returns Query facade without a direct PostgreSQL driver dependency.
 */
export function createRawDatabaseClient(database: DatabaseClient): RawDatabaseClient {
  return {
    connect: () => connectRawTransaction(database),
    query: (statement, values) => queryParameterizedRaw(database, statement, values),
  };
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

/**
 * Probes database connectivity without exposing raw SQL to consumers.
 *
 * @param database - Shared Prisma Client.
 */
export async function probeDatabase(database: DatabaseClient): Promise<void> {
  await queryRaw<unknown>(database, Prisma.sql`SELECT 1`);
}

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

/**
 * Atomically claims the oldest queued or expired economics import.
 *
 * PostgreSQL SKIP LOCKED is required for cross-replica claim safety and is
 * isolated in this shared Prisma raw-SQL primitive.
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
 * The schema intentionally relates economics to articles by `nmId` rather
 * than a foreign key, which cannot be expressed as a Prisma relation filter.
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

function returnsRows(statement: string): boolean {
  const normalized = statement.trimStart().toUpperCase();
  return (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('WITH') ||
    /\bRETURNING\b/u.test(normalized)
  );
}

function isAdvisoryLockStatement(statement: string): boolean {
  return /\bpg_advisory_(?:xact_)?(?:un)?lock\s*\(/iu.test(statement);
}

async function connectRawTransaction(database: DatabaseClient): Promise<RawTransactionClient> {
  let settle!: (outcome: 'commit' | 'rollback') => void;
  const outcome = new Promise<'commit' | 'rollback'>((resolve) => {
    settle = resolve;
  });
  let expose!: (client: RawTransactionClient) => void;
  const exposed = new Promise<RawTransactionClient>((resolve) => {
    expose = resolve;
  });
  let settled = false;

  const transactionCompletion = database
    .$transaction(
      async (transaction) => {
        const client: RawTransactionClient = {
          async query<TRow = Record<string, unknown>>(
            statement: string,
            values: readonly unknown[] = [],
          ): Promise<RawQueryResult<TRow>> {
            const control = statement.trim().toUpperCase();
            if (control === 'BEGIN') return { rowCount: null, rows: [] };
            if (control === 'COMMIT') {
              if (!settled) {
                settled = true;
                settle('commit');
              }
              await transactionCompletion;
              return { rowCount: null, rows: [] };
            }
            if (control === 'ROLLBACK') {
              if (!settled) {
                settled = true;
                settle('rollback');
              }
              await transactionCompletion;
              return { rowCount: null, rows: [] };
            }
            return queryParameterizedRaw<TRow>(transaction, statement, values);
          },
          release() {
            if (!settled) {
              settled = true;
              settle('rollback');
            }
          },
        };
        expose(client);
        if ((await outcome) === 'rollback') throw new RawTransactionRollback();
      },
      { maxWait: 5_000, timeout: 60_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof RawTransactionRollback)) throw error;
    });

  void transactionCompletion.catch(() => {
    // The repository operation observes the authoritative statement failure.
  });
  return exposed;
}

class RawTransactionRollback extends Error {}
