import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DecisionJobService } from '../../apps/bidder/src/decision-job.service.js';
import { ObservabilityService } from '../../apps/bidder/src/observability.service.js';
import { DatabasePreDispatchValidator } from '../../apps/bidder/src/pre-dispatch-validator.js';
import { RuntimeClockService } from '../../apps/bidder/src/runtime-clock.service.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import { decisionPolicy } from '../helpers/decision-fixtures.js';
import { loadConfiguration } from '@wb-bidder/config';
import { MockAppModule } from '../../apps/wb-mock/src/app.module.js';
import { DataSyncRepository, WbDataSyncWorker } from '@wb-bidder/data-sync';
import { DecisionRepository } from '@wb-bidder/decision-engine';
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
const MIGRATIONS = Object.freeze([
  '202607281330_initial',
  '202607281410_stage1_rate_limiter',
  '202607281500_stage2_sync_evidence',
  '202607281600_stage3_decision_engine',
  '202607281700_stage4_write_pipeline',
  '202607291000_stage5_production_runtime',
]);

describeWithDatabase('WB mock to PostgreSQL synchronization', () => {
  let admin: Pool;
  let application: INestApplication;
  let databaseName: string;
  let mockBaseUrl: URL;
  let pool: Pool;
  let verifiedMockWorker: WbDataSyncWorker;
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
    mockBaseUrl = new URL(`http://127.0.0.1:${String(address.port)}`);
    if (databaseUrl === undefined) throw new Error('DATABASE_URL is required');
    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_sync_worker_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    admin = new Pool({ connectionString: adminUrl.toString() });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedUrl.toString() });
    for (const migration of MIGRATIONS) {
      await pool.query(
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    }
    const repository = new DataSyncRepository(pool);
    await repository.ensureAccountBinding(
      {
        accountCurrency: 'RUB',
        accountTimezone: 'Europe/Moscow',
        environment: 'MOCK',
        sellerSid: '00000000-0000-4000-8000-000000000001',
        tokenCategory: 'PROMOTION',
        tokenFingerprint: '1'.repeat(64),
        tokenFor: null,
        tokenType: 'TEST',
      },
      randomUUID(),
    );
    const api = createClient(mockBaseUrl, 'stage2-worker');
    worker = new WbDataSyncWorker(
      api,
      repository,
      {
        bidStateMaxObservationGapMinutes: 20,
        campaignStatisticsFreshnessMinutes: 180,
        conversionLagDays: 1,
        currentStateDeadlineMs: 30_000,
        currentStateFreshnessMinutes: 20,
        dayFinalizationStableMinutes: 60,
        dayFinalizationStableReads: 2,
        externalWriteControlMode: 'EXCLUSIVE',
        minimumBidFreshnessMinutes: 720,
        pageSize: 100,
        statisticsBeginDate: () => '2026-07-27',
        statisticsEndDate: () => '2026-07-28',
      },
      undefined,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );
    verifiedMockWorker = new WbDataSyncWorker(
      createClient(mockBaseUrl, 'stage2-verified-mock-worker'),
      repository,
      {
        bidStateMaxObservationGapMinutes: 20,
        campaignStatisticsFreshnessMinutes: 180,
        conversionLagDays: 1,
        currentStateDeadlineMs: 30_000,
        currentStateFreshnessMinutes: 20,
        dayFinalizationStableMinutes: 60,
        dayFinalizationStableReads: 2,
        externalWriteControlMode: 'EXCLUSIVE',
        fullstatsContractVerified: true,
        minimumBidFreshnessMinutes: 720,
        pageSize: 100,
        sameDaySpendContractVerified: true,
        statisticsBeginDate: () => '2026-07-27',
        statisticsEndDate: () => '2026-07-28',
      },
      undefined,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
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

  it('materializes verified mock fullstats and explicit same-day coverage separately', async () => {
    const reset = await fetch(new URL('/__mock/reset', mockBaseUrl), { method: 'POST' });
    expect(reset.ok).toBe(true);
    const advance = await fetch(new URL('/__mock/time/advance', mockBaseUrl), {
      body: JSON.stringify({ days: 1, finalizeStatistics: true, hours: 0, minutes: 0 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(advance.ok).toBe(true);
    const slow = await verifiedMockWorker.synchronizeDataPage();
    expect(slow.started).toBe(true);

    const evidence = await pool.query<{
      coverageEndedAt: string;
      observedSameDaySpendMinor: string;
      statisticalDate: string;
    }>(
      `SELECT "normalizedData"->>'coverageEndedAt' AS "coverageEndedAt",
              "normalizedData"->>'observedSameDaySpendMinor' AS "observedSameDaySpendMinor",
              "normalizedData"->>'statisticalDate' AS "statisticalDate"
         FROM "SyncSourceSnapshot"
        WHERE "dataKind" = 'SAME_DAY_SPEND' AND "valid" = true`,
    );
    expect(evidence.rows.length).toBeGreaterThan(0);
    expect(
      evidence.rows.some(
        (row) =>
          row.coverageEndedAt === '2026-07-28T12:00:00.000Z' &&
          /^\d+$/u.test(row.observedSameDaySpendMinor) &&
          row.statisticalDate === '2026-07-28',
      ),
    ).toBe(true);
  });

  it('runs synchronized evidence through decision, durable dispatch, and verified APPLIED', async () => {
    await fetch(new URL('/__mock/reset', mockBaseUrl), { method: 'POST' });
    await verifiedMockWorker.synchronizeCurrentState();
    await fetch(new URL('/__mock/time/advance', mockBaseUrl), {
      body: JSON.stringify({ days: 1, finalizeStatistics: true, hours: 0, minutes: 0 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    await verifiedMockWorker.synchronizeDataPage();

    const target = await pool.query<{
      campaignId: string;
      coherentRegimeChecksum: string;
      currentBidMinor: string;
      id: string;
      nmId: string;
      wbCampaignId: string;
    }>(
      `SELECT target."id", target."campaignId", target."nmId", target."currentBidMinor",
              campaign."wbCampaignId", snapshot."coherentRegimeChecksum"
         FROM "CampaignTarget" target
         JOIN "Campaign" campaign ON campaign."id" = target."campaignId"
         JOIN LATERAL (
           SELECT snapshot."applyEligible", snapshot."coherentRegimeChecksum"
             FROM "TargetDataSnapshot" snapshot
            WHERE snapshot."targetId" = target."id"
            ORDER BY snapshot."createdAt" DESC
            LIMIT 1
         ) snapshot ON true
        WHERE target."targetKind" = 'CARD'
          AND target."capability" = 'CARD_WRITE_READY'
          AND snapshot."applyEligible" = true
        ORDER BY campaign."wbCampaignId", target."id"
        LIMIT 1`,
    );
    const selected = target.rows[0];
    expect(selected).toBeDefined();
    if (selected === undefined) throw new Error('Verified mock target was not materialized');

    for (const [index, date] of ['2026-07-25', '2026-07-26', '2026-07-27'].entries()) {
      await pool.query(
        `INSERT INTO "BidPerformanceDay"
           ("id", "targetId", "wbStatisticDate", "statisticalDayProfile",
            "confirmedBidMinor", "placementBidState", "campaignStatus", "paymentType",
            "bidType", "activePlacementConfig", "viewsDelta", "clicksDelta", "atbsDelta",
            "ordersDelta", "orderedUnitsDelta", "spendDeltaMinor",
            "attributedRevenueDelta", "coverageStartedAt", "coverageEndedAt",
            "maxObservedGapMinutes", "externalWriteControl", "changeMarkerCoverage",
            "sourceSnapshotReferences", "statisticsFinalizedAt", "conversionLagDays",
            "status", "qualityFlags", "inputChecksum")
         VALUES ($1, $2, $3::date, 'wb-statistical-day-v1', $4, '{}'::jsonb, 9, 'CPM',
                 'MANUAL', $5::jsonb, 400, 20, 5, 3, 3, 1000, 15000,
                 $3::date, $3::date + INTERVAL '1 day', 15, 'EXCLUSIVE', 'EXCLUSIVE',
                 '{}'::jsonb, $3::date + INTERVAL '2 days', 1, 'FINALIZED',
                 ARRAY[]::text[], $6)`,
        [
          randomUUID(),
          selected.id,
          date,
          selected.currentBidMinor,
          JSON.stringify({ configurationChecksum: selected.coherentRegimeChecksum }),
          String(index + 1).repeat(64),
        ],
      );
    }

    const policyId = randomUUID();
    const policy = decisionPolicy({
      explorationEnabled: true,
      maxExplorationSpendMinor: 100_000n,
      policyMaxBidMinor: 5_000n,
    });
    await pool.query(
      `INSERT INTO "ProductEconomics"
         ("id", "nmId", "effectiveFrom", "expectedContributionBeforeAdsMinor", "source",
          "version", "mutationKey", "inputChecksum", "createdByActor")
       VALUES ($1, $2, '1970-01-01T00:00:00.000Z', 5000, 'MANUAL', 1, $3,
               repeat('e', 64), 'TEST:E2E')`,
      [randomUUID(), selected.nmId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO "BiddingPolicy"
         ("id", "scope", "targetId", "executionMode", "configuration", "enabled", "version",
          "validFrom", "inputChecksum", "createdByActor")
       VALUES ($1, 'TARGET', $2, 'APPLY', $3::jsonb, true, 1,
               '1970-01-01T00:00:00.000Z', repeat('f', 64), 'TEST:E2E')`,
      [policyId, selected.id, jsonWithBigInts(policy)],
    );
    await pool.query(
      `INSERT INTO "CampaignAutomation"
         ("id", "campaignId", "mode", "reason", "version", "updatedBy")
       VALUES ($1, $2, 'APPLY', 'full-cycle-e2e', 1, 'TEST:E2E')
       ON CONFLICT ("campaignId") DO UPDATE
         SET "mode" = 'APPLY', "reason" = EXCLUDED."reason", "updatedBy" = EXCLUDED."updatedBy"`,
      [randomUUID(), selected.campaignId],
    );

    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
      DATABASE_URL: pool.options.connectionString ?? '',
      WB_API_MOCK_BASE_URL: mockBaseUrl.toString(),
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'true',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const runtimeState = new RuntimeSafetyState();
    runtimeState.confirmAccountBinding();
    runtimeState.setCapacityAllowsWrites(true);
    runtimeState.setIntegrationAuthorized(true);
    const clock = new RuntimeClockService(configuration);
    await clock.refresh();
    const decisions = new DecisionRepository(pool);
    const decisionJob = new DecisionJobService(
      pool,
      decisions,
      configuration,
      runtimeState,
      new ObservabilityService(pool, configuration),
      clock,
    );

    await expect(
      decisionJob.run(new AbortController().signal, { targetIds: [selected.id] }),
    ).resolves.toMatchObject({ persisted: 1, skipped: 0 });
    const queued = await pool.query<{
      action: string;
      decisionId: string;
      guardrailCodes: string[];
      outcomeReasonCode: string;
      status: string | null;
    }>(
      `SELECT decision."id" AS "decisionId", decision."action"::text,
              decision."outcomeReasonCode", decision."guardrailCodes",
              queue."status"::text
         FROM "BidDecision" decision
         LEFT JOIN "DecisionQueueItem" queue ON queue."decisionId" = decision."id"
        WHERE decision."targetId" = $1
        ORDER BY decision."createdAt" DESC
        LIMIT 1`,
      [selected.id],
    );
    expect(queued.rows[0]).toMatchObject({
      action: 'DECREASE',
      outcomeReasonCode: 'EXPLORATION_PLANNED',
      status: 'QUEUED',
    });

    await fetch(new URL('/__mock/reset', mockBaseUrl), { method: 'POST' });
    const api = createClient(mockBaseUrl, 'full-cycle-write', true);
    const gateway = new WbCardBidGateway(api);
    const writes = new WritePipelineRepository(pool);
    const executor = new WriteExecutor(
      writes,
      gateway,
      new DatabasePreDispatchValidator(pool, configuration, runtimeState, clock),
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
    await expect(executor.runOnce('full-cycle-e2e')).resolves.toBe(1);
    const dispatched = await pool.query<{
      attemptItemId: string;
      bidMinor: string;
      decisionId: string;
      status: string;
    }>(
      `SELECT item."id" AS "attemptItemId", item."decisionId",
              item."sentBidMinor" AS "bidMinor",
              queue."status"::text
         FROM "WbWriteAttemptItem" item
         JOIN "DecisionQueueItem" queue ON queue."decisionId" = item."decisionId"
        WHERE item."decisionId" = $1
        ORDER BY item."attemptNumber" DESC
        LIMIT 1`,
      [queued.rows[0]?.decisionId],
    );
    expect(dispatched.rows[0]?.status).toBe('VERIFY_WAIT');

    await fetch(new URL('/__mock/time/advance', mockBaseUrl), {
      body: JSON.stringify({ days: 0, finalizeStatistics: false, hours: 0, minutes: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const desiredBid = BigInt(dispatched.rows[0]?.bidMinor ?? '0');
    const live = await gateway.readLiveState({
      action: 'SET',
      attemptCount: 1,
      bidMinor: desiredBid,
      campaignBidType: 'MANUAL',
      campaignId: selected.campaignId,
      campaignPaymentType: 'CPM',
      decisionId: queued.rows[0]?.decisionId ?? '',
      desiredBidState: 'EXPLICIT',
      metricSnapshotId: '',
      nmId: BigInt(selected.nmId),
      placement: 'SEARCH',
      policyVersion: 1n,
      priority: 100,
      queueItemId: '',
      targetId: selected.id,
      targetKind: 'CARD',
      wbCampaignId: BigInt(selected.wbCampaignId),
    });
    expect(live.bidMinor).toBe(desiredBid);
    await expect(
      writes.recordReconciliation({
        attemptItemId: dispatched.rows[0]?.attemptItemId ?? '',
        decisionId: queued.rows[0]?.decisionId ?? '',
        minimumReadIntervalMs: 10,
        maximumWriteAttempts: 2,
        observation: {
          classification: classifyReconciliation(
            live,
            { ...live, bidMinor: BigInt(selected.currentBidMinor) },
            { bidMinor: desiredBid, explicit: true },
          ),
          fresh: true,
          prevalidationPassed: true,
          sourceMarker: live.sourceMarker,
          state: live,
          stateChecksum: stateChecksum(live),
        },
        observedAt: live.observedAt,
        requiredStableReadCount: 2,
        targetId: selected.id,
      }),
    ).resolves.toBe('APPLIED');
  }, 60_000);
});

/**
 * Creates an independently metered mock adapter for one test contour.
 *
 * @param baseUrl - Bound in-process mock origin.
 * @param accountKey - Isolated limiter identity.
 * @param writesEnabled - Whether the adapter may invoke synthetic write methods.
 * @returns Runtime-validating WB adapter.
 */
function createClient(baseUrl: URL, accountKey: string, writesEnabled = false): WbApiClient {
  return new WbApiClient({
    baseUrl,
    breakers: new CircuitBreakerRegistry(),
    commonBaseUrl: baseUrl,
    fetch,
    maxInFlight: 5,
    rateLimiter: new WbRateLimiter(
      accountKey,
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
    writesEnabled,
  });
}

/**
 * Serializes a domain policy to canonical JSON-compatible decimal strings.
 *
 * @param value - Domain object containing exact bigint values.
 * @returns JSON text accepted by PostgreSQL JSONB.
 */
function jsonWithBigInts(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}
