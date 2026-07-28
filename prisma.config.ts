import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Defines the Prisma schema, migration directory, and externally supplied PostgreSQL URL.
 *
 * @returns Prisma CLI configuration. The connection string is never checked into source.
 */
export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
  schema: 'prisma/schema.prisma',
});
