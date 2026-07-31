import { createDatabaseClient, type DatabaseClient, type DatabaseClientOptions } from './client.js';
/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import {
  createRawDatabaseClient,
  type RawDatabaseClient,
  type RawTransactionClient,
} from './raw.js';

/** Prisma Client augmented with the small SQL facade used by database tests. */
export type TestDatabaseClient = DatabaseClient &
  RawDatabaseClient & {
    end(): Promise<void>;
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
  const raw = createRawDatabaseClient(database);
  return new Proxy(database as TestDatabaseClient, {
    get(target, property) {
      if (property === 'query') return raw.query;
      if (property === 'connect') {
        return (): Promise<RawTransactionClient> => raw.connect();
      }
      if (property === 'end') return (): Promise<void> => database.$disconnect();
      return Reflect.get(target, property, target);
    },
  });
}
