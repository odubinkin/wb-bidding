/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';
import {
  WbCardBidGateway,
  WriteExecutor,
  WritePipelineRepository,
  classifyReconciliation,
  stateChecksum,
} from '@wb-bidder/write-pipeline';
import {
  CircuitBreakerRegistry,
  InMemoryRateLimitStore,
  WbApiClient,
  WbRateLimiter,
  selectRateLimitProfile,
} from '@wb-bidder/wb-api';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('mock HTTP to durable verified write flow', () => {
  let admin: Pool;
  let application: INestApplication;
  let baseUrl: URL;
  let databaseName: string;
  let executor: WriteExecutor;
  let gateway: WbCardBidGateway;
  let pool: Pool;
  let repository: WritePipelineRepository;
  let server: Server;
  let targetId: string;

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    Object.assign(process.env, {
      LOG_LEVEL: 'silent',
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });
    application = await NestFactory.create(MockAppModule, { logger: false });
    await application.listen(0, '127.0.0.1');
    server = application.getHttpServer();
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Mock did not bind.');
    baseUrl = new URL(`http://127.0.0.1:${String(address.port)}`);

    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_e2e_${randomUUID().replaceAll('-', '').slice(0, 22)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    admin = new Pool({ connectionString: adminUrl.toString() });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedUrl.toString() });
    for (const migration of [
      '202607281330_initial',
      '202607281410_stage1_rate_limiter',
      '202607281500_stage2_sync_evidence',
      '202607281600_stage3_decision_engine',
      '202607281700_stage4_write_pipeline',
      '202607291000_stage5_production_runtime',
    ]) {
      await pool.query(
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    }
    targetId = await createFixture(pool);
    repository = new WritePipelineRepository(pool);
    const client = new WbApiClient({
      baseUrl,
      breakers: new CircuitBreakerRegistry(),
      commonBaseUrl: baseUrl,
      fetch,
      maxInFlight: 5,
      rateLimiter: new WbRateLimiter(
        'e2e-seller',
        selectRateLimitProfile('PERSONAL+PROD'),
        { burst: 100, intervalMs: 1_000, requests: 100 },
        new InMemoryRateLimitStore(),
      ),
      readRetryPolicy: {
        baseMs: 1,
        capMs: 10,
        deadlineMs: 2_000,
        maxAttempts: 2,
      },
      timeoutMs: 1_000,
      token: 'mock-test-token',
      writesEnabled: true,
    });
    gateway = new WbCardBidGateway(client);
    executor = new WriteExecutor(
      repository,
      gateway,
      { validate: () => Promise.resolve({ valid: true as const }) },
      {
        endpointKey: 'cardBidsWrite',
        leaseSeconds: 30,
        maximumBatchSize: 50,
        maximumWriteAttempts: 2,
        preByteMaximumRetries: 1,
        preWriteStateMaximumAgeMs: 10_000,
        reconciliationDeadlineMs: 120_000,
        visibilityDelayMs: 1,
      },
    );
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
    await application.close();
  });

  it('writes once, waits for visibility, reconciles to APPLIED, and does not duplicate', async () => {
    await request(server).post('/__mock/reset').expect(201);
    await expect(executor.runOnce('e2e-worker-success')).resolves.toBe(1);
    const queued = await pool.query<{
      attemptItemId: string;
      decisionId: string;
      status: string;
    }>(
      `SELECT q."decisionId", q."status"::text, i."id" AS "attemptItemId"
         FROM "DecisionQueueItem" q
         JOIN "WbWriteAttemptItem" i ON i."decisionId" = q."decisionId"
        WHERE q."status" = 'VERIFY_WAIT' ORDER BY i."attemptNumber" DESC LIMIT 1`,
    );
    expect(queued.rows[0]?.status).toBe('VERIFY_WAIT');
    await request(server)
      .post('/__mock/time/advance')
      .send({ days: 0, finalizeStatistics: false, hours: 0, minutes: 1 })
      .expect(201);
    const claimedShape = (await repository.claim('reconciliation-shape', 1, 30))[0];
    expect(claimedShape).toBeUndefined();
    const live = await gateway.readLiveState({
      action: 'SET',
      attemptCount: 1,
      bidMinor: 1500n,
      campaignBidType: 'MANUAL',
      campaignId: '00000000-0000-4000-8000-000000000101',
      campaignPaymentType: 'CPM',
      decisionId: queued.rows[0]?.decisionId ?? '',
      desiredBidState: 'EXPLICIT',
      metricSnapshotId: '00000000-0000-4000-8000-000000000103',
      nmId: 20001n,
      placement: 'SEARCH',
      policyVersion: 1n,
      priority: 100,
      queueItemId: '00000000-0000-4000-8000-000000000104',
      targetId,
      targetKind: 'CARD',
      wbCampaignId: 10001n,
    });
    expect(live.bidMinor).toBe(1500n);
    await expect(
      repository.recordReconciliation({
        attemptItemId: queued.rows[0]?.attemptItemId ?? '',
        decisionId: queued.rows[0]?.decisionId ?? '',
        minimumReadIntervalMs: 10,
        maximumWriteAttempts: 2,
        observation: {
          classification: classifyReconciliation(
            live,
            { ...live, bidMinor: 1200n },
            {
              bidMinor: 1500n,
              explicit: true,
            },
          ),
          fresh: true,
          prevalidationPassed: true,
          sourceMarker: live.sourceMarker,
          state: live,
          stateChecksum: stateChecksum(live),
        },
        observedAt: live.observedAt,
        requiredStableReadCount: 2,
        targetId,
      }),
    ).resolves.toBe('APPLIED');
    await expect(executor.runOnce('e2e-worker-after-applied')).resolves.toBe(0);
    const journal = (await request(server).get('/__mock/requests').expect(200)).body as {
      endpointKey: string;
    }[];
    expect(journal.filter((entry) => entry.endpointKey === 'cardWriteBids')).toHaveLength(1);
  });

  it('turns a post-dispatch 503 into UNKNOWN and never performs a blind second write', async () => {
    const decisionId = await enqueueNextDecision(pool, targetId, 1600n);
    await request(server)
      .post('/__mock/faults')
      .send({ rules: [{ endpointKey: 'cardWriteBids', remaining: 1, status: 503 }] })
      .expect(201);
    await expect(executor.runOnce('e2e-worker-unknown')).resolves.toBe(1);
    const queue = await pool.query<{ manualRetryBlocked: boolean; status: string }>(
      `SELECT "status"::text, "manualRetryBlocked"
         FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
      [decisionId],
    );
    expect(queue.rows[0]).toEqual({ manualRetryBlocked: true, status: 'VERIFY_WAIT' });
    await expect(executor.runOnce('e2e-worker-no-blind-retry')).resolves.toBe(0);
    const journal = (await request(server).get('/__mock/requests').expect(200)).body as {
      endpointKey: string;
    }[];
    expect(journal.filter((entry) => entry.endpointKey === 'cardWriteBids')).toHaveLength(2);
  });
});

async function createFixture(pool: Pool): Promise<string> {
  const campaignId = '00000000-0000-4000-8000-000000000101';
  const targetId = randomUUID();
  const economicsId = randomUUID();
  const policyId = randomUUID();
  await pool.query(
    `INSERT INTO "Campaign"
       ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
        "supported", "lastSyncedAt")
     VALUES ($1, 10001, 9, 9, 'MANUAL', 'CPM', 'mock-e2e', true, NOW())`,
    [campaignId],
  );
  await pool.query(
    `INSERT INTO "CampaignTarget"
       ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor", "capability")
     VALUES ($1, $2, 20001, 'CARD', 'SEARCH', 1200, 'CARD_WRITE_READY')`,
    [targetId, campaignId],
  );
  await pool.query(
    `INSERT INTO "CampaignAutomation"
       ("id", "campaignId", "mode", "reason", "version", "updatedBy")
     VALUES ($1, $2, 'APPLY', 'e2e', 1, 'test')`,
    [randomUUID(), campaignId],
  );
  await pool.query(
    `INSERT INTO "ProductEconomics"
       ("id", "nmId", "effectiveFrom", "expectedContributionBeforeAdsMinor", "source",
        "version", "mutationKey", "inputChecksum", "createdByActor")
     VALUES ($1, 20001, NOW() - INTERVAL '1 day', 5000, 'MANUAL', 1, $2, $3, 'test')`,
    [economicsId, randomUUID(), 'e'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO "BiddingPolicy"
       ("id", "scope", "targetId", "executionMode", "configuration", "enabled", "version",
        "validFrom", "inputChecksum", "createdByActor")
     VALUES ($1, 'TARGET', $2, 'APPLY', '{}'::jsonb, true, 1,
             NOW() - INTERVAL '1 day', $3, 'test')`,
    [policyId, targetId, 'f'.repeat(64)],
  );
  await enqueueDecision(pool, targetId, economicsId, policyId, 1500n);
  return targetId;
}

async function enqueueNextDecision(pool: Pool, targetId: string, bidMinor: bigint) {
  const reference = await pool.query<{ economicsId: string; policyId: string }>(
    `SELECT e."id" AS "economicsId", p."id" AS "policyId"
       FROM "ProductEconomics" e CROSS JOIN "BiddingPolicy" p
      WHERE e."nmId" = 20001 AND p."targetId" = $1 LIMIT 1`,
    [targetId],
  );
  const row = reference.rows[0];
  if (row === undefined) throw new Error('E2E fixture missing.');
  return enqueueDecision(pool, targetId, row.economicsId, row.policyId, bidMinor);
}

async function enqueueDecision(
  pool: Pool,
  targetId: string,
  economicsId: string,
  policyId: string,
  bidMinor: bigint,
) {
  const metricId = randomUUID();
  const decisionId = randomUUID();
  await pool.query(
    `INSERT INTO "MetricSnapshot"
       ("id", "targetId", "productEconomicsId", "productEconomicsVersion",
        "expectedContributionBeforeAdsMinor", "policyId", "periodStart", "periodEnd",
        "metrics", "candidateEstimates", "completenessFlags", "inputSnapshotChecksum",
        "inputSnapshotSchema", "algorithmVersion", "calculatedAt")
     VALUES ($1, $2, $3, 1, 5000, $4, CURRENT_DATE - 1, CURRENT_DATE,
             '{}'::jsonb, '{}'::jsonb, ARRAY[]::text[], $5,
             'input-snapshot-v1', 'rules-v1', NOW())`,
    [metricId, targetId, economicsId, policyId, hexChecksum(`metric-${decisionId}`)],
  );
  await pool.query(
    `INSERT INTO "BidDecision"
       ("id", "targetId", "action", "currentBidMinor", "proposedBidMinor", "boundedBidMinor",
        "strategyReasonCode", "outcomeReasonCode", "guardrailCodes", "explanation",
        "metricSnapshotId", "policyVersion", "algorithmVersion", "decisionInputChecksum")
     VALUES ($1, $2, 'INCREASE', 1200, $3, $3, 'PROFIT_MAX',
             'BID_CHANGE_SELECTED', ARRAY[]::text[], '{}'::jsonb, $4, 1, 'rules-v1', $5)`,
    [decisionId, targetId, bidMinor.toString(), metricId, hexChecksum(`decision-${decisionId}`)],
  );
  await pool.query(
    `INSERT INTO "DecisionQueueItem"
       ("id", "decisionId", "status", "priority", "availableAt")
     VALUES ($1, $2, 'QUEUED', 100, NOW())`,
    [randomUUID(), decisionId],
  );
  return decisionId;
}

function hexChecksum(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
