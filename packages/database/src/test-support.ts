import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseClientOptions,
  type DatabaseExecutor,
} from './client.js';
/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unsafe-return */

interface TestQueryResult<TRow = Record<string, unknown>> {
  readonly rowCount: number | null;
  readonly rows: readonly TRow[];
}

interface TestDatabaseConnection {
  query<TRow = Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<TestQueryResult<TRow>>;
  release(): void;
}

/** Prisma Client augmented with the small SQL facade used by database tests. */
export type TestDatabaseClient = DatabaseClient & {
  connect(): Promise<TestDatabaseConnection>;
  end(): Promise<void>;
  query<TRow = Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<TestQueryResult<TRow>>;
};

/**
 * Creates an integration-test database client without importing `pg`.
 *
 * Application repositories receive the object as a normal Prisma Client.
 * Test fixture SQL uses the attached query facade, whose execution remains
 * centralized in this package and parameterized through Prisma.
 *
 * @param options - Isolated database connection options.
 * @returns Prisma Client with test-only query/connect/end conveniences.
 */
export function createTestDatabaseClient(options: DatabaseClientOptions): TestDatabaseClient {
  const database = createDatabaseClient(options);
  return new Proxy(database as TestDatabaseClient, {
    get(target, property) {
      if (property === 'query') {
        return <TRow = Record<string, unknown>>(
          statement: string,
          values: readonly unknown[] = [],
        ): Promise<TestQueryResult<TRow>> => executeTestStatement(database, statement, values);
      }
      if (property === 'connect') {
        return (): Promise<TestDatabaseConnection> => connectTestTransaction(database);
      }
      if (property === 'end') return (): Promise<void> => database.$disconnect();
      return Reflect.get(target, property, target);
    },
  });
}

async function executeTestStatement<TRow>(
  database: DatabaseExecutor,
  statement: string,
  values: readonly unknown[],
): Promise<TestQueryResult<TRow>> {
  const normalized = statement.trimStart().toUpperCase();
  if (/\bPG_ADVISORY_(?:XACT_)?(?:UN)?LOCK\s*\(/u.test(normalized)) {
    const rowCount = await database.$executeRawUnsafe(statement, ...values);
    return { rowCount, rows: [] };
  }
  if (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('WITH') ||
    /\bRETURNING\b/u.test(normalized)
  ) {
    const rows = await database.$queryRawUnsafe<TRow[]>(statement, ...values);
    return { rowCount: rows.length, rows };
  }
  const rowCount = await database.$executeRawUnsafe(statement, ...values);
  return { rowCount, rows: [] };
}

async function connectTestTransaction(database: DatabaseClient): Promise<TestDatabaseConnection> {
  let settle!: (outcome: 'commit' | 'rollback') => void;
  const outcome = new Promise<'commit' | 'rollback'>((resolve) => {
    settle = resolve;
  });
  let expose!: (client: TestDatabaseConnection) => void;
  const exposed = new Promise<TestDatabaseConnection>((resolve) => {
    expose = resolve;
  });
  let settled = false;
  const transactionCompletion = database
    .$transaction(
      async (transaction) => {
        const connection: TestDatabaseConnection = {
          async query<TRow = Record<string, unknown>>(
            statement: string,
            values: readonly unknown[] = [],
          ): Promise<TestQueryResult<TRow>> {
            const control = statement.trim().toUpperCase();
            if (control === 'BEGIN') return { rowCount: null, rows: [] };
            if (control === 'COMMIT' || control === 'ROLLBACK') {
              if (!settled) {
                settled = true;
                settle(control === 'COMMIT' ? 'commit' : 'rollback');
              }
              await transactionCompletion;
              return { rowCount: null, rows: [] };
            }
            return executeTestStatement<TRow>(transaction, statement, values);
          },
          release() {
            if (!settled) {
              settled = true;
              settle('rollback');
            }
          },
        };
        expose(connection);
        if ((await outcome) === 'rollback') throw new TestTransactionRollback();
      },
      { maxWait: 5_000, timeout: 60_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof TestTransactionRollback)) throw error;
    });
  void transactionCompletion.catch(() => {
    // The test statement observes the authoritative transaction failure.
  });
  return exposed;
}

class TestTransactionRollback extends Error {}
