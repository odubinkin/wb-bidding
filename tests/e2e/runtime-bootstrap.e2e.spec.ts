import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createTestDatabaseClient, type TestDatabaseClient } from '@wb-bidder/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../apps/bidder/src/app.module.js';
import { configureBidderHttp } from '../../apps/bidder/src/main.js';
import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const migrations = Object.freeze([
  '202607281330_initial',
  '202607281410_stage1_rate_limiter',
  '202607281500_stage2_sync_evidence',
  '202607281600_stage3_decision_engine',
  '202607281700_stage4_write_pipeline',
  '202607291000_stage5_production_runtime',
  '202607291200_stage5_cluster_contract',
]);

describeWithDatabase('real bidder runtime bootstrap', () => {
  let admin: TestDatabaseClient | undefined;
  let bidder: NestExpressApplication | undefined;
  let bidderServer: Server;
  let databaseName: string;
  let mock: NestExpressApplication;

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('DATABASE_URL is required');
    Object.assign(process.env, {
      LOG_LEVEL: 'silent',
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });
    mock = await NestFactory.create<NestExpressApplication>(MockAppModule, { logger: false });
    await mock.listen(0, '127.0.0.1');
    const mockAddress = mock.getHttpServer().address();
    if (mockAddress === null || typeof mockAddress === 'string') {
      throw new Error('Mock did not bind a TCP port');
    }
    const mockBaseUrl = `http://127.0.0.1:${String(mockAddress.port)}`;

    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_bootstrap_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    admin = createTestDatabaseClient({ connectionString: adminUrl.toString() });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const migrationClient = createTestDatabaseClient({ connectionString: isolatedUrl.toString() });
    try {
      for (const migration of migrations) {
        await migrationClient.query(
          await readFile(
            new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
            'utf8',
          ),
        );
      }
    } finally {
      await migrationClient.end();
    }

    Object.assign(process.env, {
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-e2e-admin-token-with-32-chars',
      CAMPAIGN_APPLY_CRON: '56 * * * * *',
      CURRENT_STATE_SYNC_CRON: '59 */15 * * * *',
      DATABASE_URL: isolatedUrl.toString(),
      DATA_SYNC_CRON: '58 */30 * * * *',
      DECISION_CRON: '57 */30 * * * *',
      METRICS_ENABLED: 'false',
      PORT: '3000',
      RECONCILIATION_CRON: '55 * * * * *',
      SCHEDULER_ENABLED: 'true',
      WB_API_MOCK_BASE_URL: mockBaseUrl,
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    bidder = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      bodyParser: false,
      logger: false,
    });
    configureBidderHttp(bidder);
    await bidder.listen(0, '127.0.0.1');
    bidderServer = bidder.getHttpServer();
  });

  afterAll(async () => {
    await bidder?.close();
    await mock.close();
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin?.end();
  });

  it('confirms binding and cached WB identity before exposing ready Admin reads', async () => {
    const readiness = await request(bidderServer).get('/health/ready').expect(200);
    const readinessBody = readiness.body as { checks: readonly unknown[]; status: string };
    expect(readinessBody).toMatchObject({ status: 'ok' });
    expect(readinessBody.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'account_binding', ok: true }),
        expect.objectContaining({ name: 'integration', ok: true }),
      ]),
    );

    const automation = await request(bidderServer)
      .get('/api/v1/automation')
      .set('Authorization', 'Bearer runtime-e2e-admin-token-with-32-chars')
      .expect(200);
    expect(automation.body).toMatchObject({ campaigns: [], targets: [] });

    const serviceInfo = await request(bidderServer).get('/api/v1/service-info').expect(200);
    expect(JSON.stringify(serviceInfo.body)).not.toContain('mock-test-token');
    expect(JSON.stringify(serviceInfo.body)).not.toContain('runtime-e2e-admin-token');
  });
});
