import { createTestDatabaseClient, type TestDatabaseClient } from '@wb-bidder/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaRateLimitStore } from '@wb-bidder/wb-api';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('PostgreSQL WB rate-limit coordination', () => {
  let pool: TestDatabaseClient;

  beforeAll(() => {
    if (databaseUrl === undefined) throw new Error('DATABASE_URL is required');
    pool = createTestDatabaseClient({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('admits only one concurrent replica and shares authoritative freezes', async () => {
    const bucketKey = `integration:${String(process.pid)}:${String(Date.now())}`;
    const firstReplica = new PrismaRateLimitStore(pool);
    const secondReplica = new PrismaRateLimitStore(pool);
    const profile = { burst: 1, intervalMs: 1_000, requests: 1 };
    const nowMs = 2_000_000_000_000;

    const admissions = await Promise.all([
      firstReplica.consume(bucketKey, profile, nowMs),
      secondReplica.consume(bucketKey, profile, nowMs),
    ]);
    expect(admissions.filter((result) => result.allowed)).toHaveLength(1);
    expect(admissions.filter((result) => !result.allowed)).toHaveLength(1);

    await secondReplica.freeze(bucketKey, nowMs + 5_000);
    await expect(firstReplica.consume(bucketKey, profile, nowMs + 1_000)).resolves.toEqual({
      allowed: false,
      retryAtMs: nowMs + 5_000,
    });

    await pool.query('DELETE FROM wb_rate_limit_bucket WHERE bucket_key = $1', [bucketKey]);
  });
});
