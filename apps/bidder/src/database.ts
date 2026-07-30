/* eslint-disable jsdoc/require-jsdoc */
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';

/** Nest dependency-injection token for the shared PostgreSQL connection pool. */
export const DATABASE_POOL = Symbol('DATABASE_POOL');

/** Builds the bounded PostgreSQL pool from already validated configuration. */
export const databasePoolProvider = {
  provide: DATABASE_POOL,
  inject: [APP_CONFIGURATION],
  useFactory(configuration: AppConfiguration): Pool {
    return new Pool({
      application_name: 'wb-bidder',
      connectionString: configuration.databaseUrl,
      max: 20,
      statement_timeout: 30_000,
    });
  },
};

/**
 * Closes PostgreSQL connections during graceful shutdown.
 */
@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
