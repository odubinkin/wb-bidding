import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';
import { DataSyncRepository, WbDataSyncWorker } from '@wb-bidder/data-sync';
import {
  CircuitBreakerRegistry,
  InMemoryRateLimitStore,
  WbApiClient,
  WbRateLimiter,
  selectRateLimitProfile,
} from '@wb-bidder/wb-api';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('WB mock to PostgreSQL synchronization', () => {
  let application: INestApplication;
  let pool: Pool;
  let worker: WbDataSyncWorker;

  beforeAll(async () => {
    Object.assign(process.env, {
      LOG_LEVEL: 'silent',
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });
    application = await NestFactory.create(MockAppModule, { logger: false });
    await application.listen(0, '127.0.0.1');
    const server = application.getHttpServer() as unknown as Server;
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Mock integration server did not bind a TCP port');
    }
    const baseUrl = new URL(`http://127.0.0.1:${String(address.port)}`);
    pool = new Pool({ connectionString: databaseUrl });
    const repository = new DataSyncRepository(pool);
    const api = new WbApiClient({
      baseUrl,
      breakers: new CircuitBreakerRegistry(),
      commonBaseUrl: baseUrl,
      fetch,
      maxInFlight: 5,
      rateLimiter: new WbRateLimiter(
        'stage2-worker',
        selectRateLimitProfile('PERSONAL+PROD'),
        { burst: 100, intervalMs: 1_000, requests: 100 },
        new InMemoryRateLimitStore(),
      ),
      readRetryPolicy: {
        baseMs: 1,
        capMs: 10,
        deadlineMs: 2_000,
        maxAttempts: 3,
      },
      timeoutMs: 1_000,
      token: 'mock-test-token',
      writesEnabled: false,
    });
    worker = new WbDataSyncWorker(api, repository, {
      currentStateDeadlineMs: 30_000,
      currentStateFreshnessMinutes: 20,
      externalWriteControlMode: 'EXCLUSIVE',
      minimumBidFreshnessMinutes: 720,
      pageSize: 100,
      statisticsBeginDate: () => '2026-07-27',
      statisticsEndDate: () => '2026-07-28',
    });
  });

  afterAll(async () => {
    await pool.end();
    await application.close();
  });

  it('persists current state separately from slow source stages and fail-closes uncertainty', async () => {
    const current = await worker.synchronizeCurrentState();
    expect(current).toMatchObject({
      counters: { campaigns: 2, invalidSources: 0 },
      started: true,
    });
    expect(current.counters?.targets).toBeGreaterThan(1);

    const slow = await worker.synchronizeDataPage();
    expect(slow.started).toBe(true);
    expect(slow.counters?.campaigns).toBeGreaterThan(0);
    expect(slow.counters?.invalidSources).toBeGreaterThan(0);

    const targets = await pool.query<{
      capability: string;
      currentBidMinor: string | null;
      minimumBidMinor: string | null;
      targetKind: string;
    }>(
      `SELECT "targetKind", "currentBidMinor", "minimumBidMinor", "capability"
         FROM "CampaignTarget" t
         JOIN "Campaign" c ON c."id" = t."campaignId"
        WHERE c."wbCampaignId" IN (10001, 10002)`,
    );
    expect(
      targets.rows.some(
        (target) =>
          target.targetKind === 'CARD' &&
          target.currentBidMinor !== null &&
          target.minimumBidMinor !== null &&
          target.capability === 'CARD_WRITE_READY',
      ),
    ).toBe(true);
    expect(
      targets.rows
        .filter((target) => target.targetKind === 'CLUSTER')
        .every(
          (target) =>
            target.currentBidMinor === null &&
            target.minimumBidMinor === null &&
            target.capability === 'OBSERVE_ONLY',
        ),
    ).toBe(true);

    const uncertainty = await pool.query<{ invalidReason: string | null }>(
      `SELECT "invalidReason"
         FROM "SyncSourceSnapshot"
        WHERE "dataKind" IN ('CAMPAIGN_STATISTICS', 'BUDGET_DIAGNOSTIC')`,
    );
    expect(uncertainty.rows.map((row) => row.invalidReason)).toEqual(
      expect.arrayContaining([
        'FULLSTATS_MONEY_AND_AGGREGATION_UNVERIFIED',
        'BUDGET_SEMANTICS_UNVERIFIED',
      ]),
    );
    const snapshots = await pool.query<{
      applyEligible: boolean;
      completenessFlags: string[];
      increaseEligible: boolean;
    }>(
      `SELECT "applyEligible", "increaseEligible", "completenessFlags"
         FROM "TargetDataSnapshot"
        WHERE "syncRunId" = (
          SELECT "id"
            FROM "SchedulerRun"
           WHERE "jobType" = 'DATA_SYNC'
           ORDER BY "startedAt" DESC
           LIMIT 1
        )
        ORDER BY "createdAt" DESC`,
    );
    expect(snapshots.rows.length).toBeGreaterThan(0);
    expect(
      snapshots.rows.every(
        (snapshot) =>
          !snapshot.applyEligible &&
          !snapshot.increaseEligible &&
          snapshot.completenessFlags.includes('INVALID_CAMPAIGN_STATISTICS'),
      ),
    ).toBe(true);
  });
});
