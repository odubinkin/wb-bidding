import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';
import { createDatabaseClient, type DatabaseClient } from '@wb-bidder/database';

/** Nest dependency-injection token for the shared Prisma Client. */
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

/** Builds the bounded Prisma Client from already validated configuration. */
export const databaseClientProvider = {
  provide: DATABASE_CLIENT,
  inject: [APP_CONFIGURATION],
  /**
   * Builds the shared database client from validated application configuration.
   *
   * @param configuration Validated immutable application configuration.
   * @returns Configured Prisma database client.
   */
  useFactory(configuration: AppConfiguration): DatabaseClient {
    return createDatabaseClient({
      applicationName: 'wb-bidder',
      connectionString: configuration.databaseUrl,
      maxConnections: 20,
      statementTimeoutMs: 30_000,
    });
  },
};

/**
 * Closes Prisma-managed PostgreSQL connections during graceful shutdown.
 */
@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  /**
   * Creates a lifecycle hook for the shared database client.
   *
   * @param database Database client used for the transactional operation.
   */
  public constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Disconnects the database client during graceful application shutdown. */
  public async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}
