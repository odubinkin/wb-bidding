import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExperimentRuntimeService } from '../../apps/bidder/src/experiment-runtime.service.js';
import { DecisionJobService } from '../../apps/bidder/src/decision-job.service.js';
import { ObservabilityService } from '../../apps/bidder/src/observability.service.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import { RuntimeClockService } from '../../apps/bidder/src/runtime-clock.service.js';
import { loadConfiguration } from '@wb-bidder/config';
import { DecisionRepository } from '@wb-bidder/decision-engine';

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

describeWithDatabase('production runtime PostgreSQL lifecycle', () => {
  let admin: Pool;
  let databaseName: string;
  let isolatedUrl: URL;
  let pool: Pool;

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_runtime_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    isolatedUrl = new URL(sourceUrl);
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
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  });

  it('fails an expired revert safely and disables only the affected target', async () => {
    const campaignId = randomUUID();
    const targetId = randomUUID();
    const experimentId = randomUUID();
    await pool.query(
      `INSERT INTO "Campaign"
         ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
          "supported", "lastSyncedAt")
       VALUES ($1, 910001, 9, 9, 'MANUAL', 'CPM', 'runtime-experiment', true, NOW())`,
      [campaignId],
    );
    await pool.query(
      `INSERT INTO "CampaignTarget"
         ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
          "minimumBidMinor", "capability")
       VALUES ($1, $2, 920001, 'CARD', 'SEARCH', 90, 50, 'CARD_WRITE_READY')`,
      [targetId, campaignId],
    );
    await pool.query(
      `INSERT INTO "BidExperiment"
         ("id", "targetId", "status", "sourceBidMinor", "experimentBidMinor",
          "desiredRevertBidMinor", "plannedFullDays", "spendLimitMinor",
          "spendSafetyBufferMinor", "policyVersion", "algorithmVersion",
          "experimentReasonCode", "revertStartedAt", "revertDeadlineAt")
       VALUES ($1, $2, 'REVERTING', 100, 90, 100, 2, 1000, 100, 1,
               'rules-v1', 'EXPLORATION_TEST', '2026-07-27T00:00:00.000Z',
               '2026-07-28T00:00:00.000Z')`,
      [experimentId, targetId],
    );
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
      DATABASE_URL: isolatedUrl.toString(),
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const runtime = new ExperimentRuntimeService(
      pool,
      configuration,
      new DecisionRepository(pool),
      new RuntimeSafetyState(),
      new ObservabilityService(pool, configuration),
      modelClock(configuration, new Date('2026-07-29T00:00:00.000Z')),
    );

    await expect(runtime.run()).resolves.toBe(1);

    const result = await pool.query<{ mode: string; reason: string; status: string }>(
      `SELECT experiment."status"::text,
              automation."mode"::text,
              automation."reason"
         FROM "BidExperiment" experiment
         JOIN "TargetAutomation" automation
           ON automation."targetId" = experiment."targetId"
        WHERE experiment."id" = $1`,
      [experimentId],
    );
    expect(result.rows[0]).toEqual({
      mode: 'DISABLED',
      reason: 'EXPLORATION_REVERT_DEADLINE_EXCEEDED',
      status: 'FAILED_REVERT_BLOCKED',
    });
  });

  it('resolves the first applied bid of the account-local day as the daily anchor', async () => {
    const campaignId = randomUUID();
    const targetId = randomUUID();
    const policyId = randomUUID();
    const snapshotId = randomUUID();
    await pool.query(
      `INSERT INTO "Campaign"
         ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
          "supported", "lastSyncedAt")
       VALUES ($1, 930001, 9, 9, 'MANUAL', 'CPM', 'daily-anchor', true, NOW())`,
      [campaignId],
    );
    await pool.query(
      `INSERT INTO "CampaignTarget"
         ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
          "minimumBidMinor", "capability")
       VALUES ($1, $2, 940001, 'CARD', 'SEARCH', 100, 50, 'CARD_WRITE_READY')`,
      [targetId, campaignId],
    );
    await pool.query(
      `INSERT INTO "BiddingPolicy"
         ("id", "scope", "executionMode", "configuration", "enabled", "version",
          "validFrom", "inputChecksum", "createdByActor")
       VALUES ($1, 'DEPLOYMENT', 'OBSERVE_ONLY', '{}'::jsonb, true, 1,
               '1970-01-01T00:00:00.000Z', repeat('a', 64), 'TEST')`,
      [policyId],
    );
    await pool.query(
      `INSERT INTO "MetricSnapshot"
         ("id", "targetId", "policyId", "periodStart", "periodEnd", "metrics",
          "candidateEstimates", "completenessFlags", "inputSnapshotChecksum",
          "inputSnapshotSchema", "algorithmVersion", "calculatedAt")
       VALUES ($1, $2, $3, '2026-07-27', '2026-07-28', '{}'::jsonb, '[]'::jsonb,
               ARRAY[]::text[], repeat('b', 64), 'input-snapshot-v1', 'rules-v1',
               '2026-07-29T02:00:00.000Z')`,
      [snapshotId, targetId, policyId],
    );
    const applied = [
      { bid: 130, suffix: '1', verifiedAt: '2026-07-29T03:30:00.000Z' },
      { bid: 120, suffix: '2', verifiedAt: '2026-07-29T05:00:00.000Z' },
      { bid: 110, suffix: '3', verifiedAt: '2026-07-29T06:00:00.000Z' },
    ] as const;
    for (const item of applied) {
      const decisionId = randomUUID();
      await pool.query(
        `INSERT INTO "BidDecision"
           ("id", "targetId", "action", "currentBidMinor", "proposedBidMinor",
            "boundedBidMinor", "strategyReasonCode", "outcomeReasonCode",
            "guardrailCodes", "explanation", "metricSnapshotId", "policyVersion",
            "algorithmVersion", "decisionInputChecksum", "createdAt")
         VALUES ($1, $2, 'DECREASE', $3, $3, $3, 'TEST', 'TEST',
                 ARRAY[]::text[], '{}'::jsonb, $4, 1, 'rules-v1',
                 repeat($5, 64), $6)`,
        [decisionId, targetId, item.bid, snapshotId, item.suffix, item.verifiedAt],
      );
      await pool.query(
        `INSERT INTO "DecisionQueueItem"
           ("id", "decisionId", "status", "priority", "availableAt", "verifiedAt")
         VALUES ($1, $2, 'APPLIED', 0, $3, $3)`,
        [randomUUID(), decisionId, item.verifiedAt],
      );
    }
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'America/New_York',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
      DATABASE_URL: isolatedUrl.toString(),
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const runtimeState = new RuntimeSafetyState();
    const job = new DecisionJobService(
      pool,
      new DecisionRepository(pool),
      configuration,
      runtimeState,
      new ObservabilityService(pool, configuration),
      modelClock(configuration, new Date('2026-07-29T07:00:00.000Z')),
    );
    const pageLoader = job as unknown as {
      loadTargetPage(
        cursor: string,
        scope: { readonly targetIds?: readonly string[] },
        decisionAt: Date,
      ): Promise<readonly { readonly dailyAnchorBidMinor: string | null }[]>;
    };

    const rows = await pageLoader.loadTargetPage(
      '00000000-0000-0000-0000-000000000000',
      { targetIds: [targetId] },
      new Date('2026-07-29T07:00:00.000Z'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.dailyAnchorBidMinor).toBe('120');
  });
});

/**
 * Creates a deterministic mock-mode clock without requiring an HTTP mock in this DB test.
 *
 * @param configuration - Runtime configuration.
 * @param now - Model instant.
 * @returns Clock with a deterministic `now`.
 */
function modelClock(
  configuration: ReturnType<typeof loadConfiguration>,
  now: Date,
): RuntimeClockService {
  const clock = new RuntimeClockService(configuration);
  vi.spyOn(clock, 'now').mockReturnValue(now);
  return clock;
}
