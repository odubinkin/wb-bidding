import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createTestDatabaseClient, type TestDatabaseClient } from '@wb-bidder/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const BASE_MIGRATIONS = Object.freeze([
  '202607281330_initial',
  '202607281410_stage1_rate_limiter',
  '202607281500_stage2_sync_evidence',
  '202607281600_stage3_decision_engine',
  '202607281700_stage4_write_pipeline',
  '202607291000_stage5_production_runtime',
  '202607291200_stage5_cluster_contract',
]);
const INDEX_MIGRATIONS = Object.freeze([
  '202608030900_p0_query_indexes',
  '202608031000_p1_lifecycle_indexes',
]);
const P0_INDEXES = Object.freeze([
  'DecisionQueueItem_claim_ready_idx',
  'DecisionQueueItem_verify_due_idx',
  'CampaignStatDaily_latest_content_idx',
  'SyncSourceSnapshot_campaign_latest_idx',
  'SyncSourceSnapshot_recommendation_lookup_idx',
  'SyncSourceSnapshot_campaign_evidence_idx',
  'SyncSourceSnapshot_target_evidence_idx',
]);
const P0_PRISMA_INDEXES = Object.freeze([
  'SyncSourceSnapshot_campaign_latest_idx',
  'SyncSourceSnapshot_campaign_evidence_idx',
  'SyncSourceSnapshot_target_evidence_idx',
]);
const P0_SQL_ONLY_INDEXES = Object.freeze([
  'DecisionQueueItem_claim_ready_idx',
  'DecisionQueueItem_verify_due_idx',
  'CampaignStatDaily_latest_content_idx',
  'SyncSourceSnapshot_recommendation_lookup_idx',
]);
const P1_INDEXES = Object.freeze([
  'BidExperiment_non_terminal_created_idx',
  'BidDecision_createdAt_id_idx',
  'AuditEvent_createdAt_id_idx',
  'WbWriteAttempt_terminal_cleanup_idx',
  'WbWriteAttempt_dispatching_recovery_idx',
  'BiddingPolicy_target_temporal_idx',
  'BiddingPolicy_campaign_temporal_idx',
  'BiddingPolicy_deployment_temporal_idx',
]);
const P1_PRISMA_INDEXES = Object.freeze([
  'BidDecision_createdAt_id_idx',
  'AuditEvent_createdAt_id_idx',
]);
const P1_SQL_ONLY_INDEXES = Object.freeze([
  'BidExperiment_non_terminal_created_idx',
  'WbWriteAttempt_terminal_cleanup_idx',
  'WbWriteAttempt_dispatching_recovery_idx',
  'BiddingPolicy_target_temporal_idx',
  'BiddingPolicy_campaign_temporal_idx',
  'BiddingPolicy_deployment_temporal_idx',
]);

describeWithDatabase('PostgreSQL query index coverage', () => {
  let admin: TestDatabaseClient;
  let databaseName: string;
  let pool: TestDatabaseClient;

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_indexes_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    admin = createTestDatabaseClient({
      connectionString: adminUrl.toString(),
      maxConnections: 2,
    });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = createTestDatabaseClient({
      connectionString: isolatedUrl.toString(),
      maxConnections: 4,
    });
    for (const migration of BASE_MIGRATIONS) {
      await pool.query(await migrationSql(migration));
    }
    for (const migration of INDEX_MIGRATIONS) {
      for (const statement of concurrentStatements(await migrationSql(migration))) {
        await pool.query(statement);
      }
    }
    await seedSnapshotPlannerEvidence();
    await pool.query('ANALYZE');
    await pool.query('SET enable_seqscan = off');
  }, 120_000);

  afterAll(async () => {
    if (databaseUrl === undefined) return;
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  });

  it('creates every P0 index on a clean migrated database', async () => {
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [[...P0_INDEXES]],
    );
    expect(result.rows.map(({ indexname }) => indexname)).toEqual([...P0_INDEXES].sort());
  });

  it('declares or documents every P0 index in the Prisma schema', async () => {
    const schema = await readFile(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const index of P0_PRISMA_INDEXES) {
      expect(schema).toContain(`map: "${index}"`);
    }
    for (const index of P0_SQL_ONLY_INDEXES) {
      expect(schema).toContain(`SQL-only index ${index}`);
    }
  });

  it('creates every P1 index on a clean migrated database', async () => {
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [[...P1_INDEXES]],
    );
    expect(result.rows.map(({ indexname }) => indexname)).toEqual([...P1_INDEXES].sort());
  });

  it('declares or documents every P1 index in the Prisma schema', async () => {
    const schema = await readFile(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const index of P1_PRISMA_INDEXES) {
      expect(schema).toContain(`map: "${index}"`);
    }
    for (const index of P1_SQL_ONLY_INDEXES) {
      expect(schema).toContain(`SQL-only index ${index}`);
    }
  });

  it.each([
    {
      index: 'DecisionQueueItem_claim_ready_idx',
      query: `SELECT "id"
                FROM "DecisionQueueItem"
               WHERE "status" IN ('QUEUED', 'RETRY_WAIT')
                 AND "availableAt" <= clock_timestamp()
                 AND ("leaseUntil" IS NULL OR "leaseUntil" < clock_timestamp())
               ORDER BY "priority" DESC, "availableAt", "id"
               LIMIT 10`,
    },
    {
      index: 'DecisionQueueItem_verify_due_idx',
      query: `SELECT "id"
                FROM "DecisionQueueItem"
               WHERE "status" = 'VERIFY_WAIT'
                 AND ("nextVerificationAt" IS NULL OR "nextVerificationAt" <= clock_timestamp())
               ORDER BY "nextVerificationAt" ASC NULLS FIRST, "id"
               LIMIT 10`,
    },
    {
      index: 'CampaignStatDaily_latest_content_idx',
      query: `SELECT DISTINCT ON (
                       statistic."campaignId", statistic."nmId", statistic."date",
                       COALESCE(statistic."normQueryCanonical", ''),
                       statistic."normalizedAggregationKind"
                     ) statistic."sourceVersion"
                FROM "CampaignStatDaily" statistic
               WHERE statistic."campaignId" = '00000000-0000-0000-0000-000000000001'::uuid
                 AND statistic."normalizedAggregationKind"
                     IN ('FULLSTATS_APP_NM_LEAF', 'CLUSTER_DAILY')
               ORDER BY statistic."campaignId", statistic."nmId", statistic."date",
                        COALESCE(statistic."normQueryCanonical", ''),
                        statistic."normalizedAggregationKind",
                        statistic."fetchedAt" DESC, statistic."sourceVersion" DESC`,
    },
    {
      index: 'SyncSourceSnapshot_campaign_latest_idx',
      query: `SELECT "id"
                FROM "SyncSourceSnapshot"
               WHERE "campaignId" = '00000000-0000-0000-0000-000000000001'::uuid
                 AND "dataKind" = 'CAMPAIGN_STATISTICS'
               ORDER BY "fetchedAt" DESC, "createdAt" DESC
               LIMIT 1`,
    },
    {
      index: 'SyncSourceSnapshot_recommendation_lookup_idx',
      query: `SELECT "id"
                FROM "SyncSourceSnapshot"
               WHERE "campaignId" = '00000000-0000-0000-0000-000000000001'::uuid
                 AND "dataKind" = 'BID_RECOMMENDATION'
                 AND "valid" = true
                 AND "endpointProfile" = 'profile-v1'
                 AND "normalizedData" ->> 'nmId' = '123'
               ORDER BY "fetchedAt" DESC, "createdAt" DESC
               LIMIT 1`,
    },
    {
      index: 'SyncSourceSnapshot_campaign_evidence_idx',
      query: `SELECT "sourceChecksum", "fetchedAt"
                FROM "SyncSourceSnapshot"
               WHERE "dataKind" = 'CAMPAIGN_STATISTICS'
                 AND "campaignId" = '00000000-0000-0000-0000-000000000001'::uuid
                 AND "sourceDate" = DATE '2026-08-01'
                 AND "sourceChecksum" = repeat('a', 64)
                 AND "valid" = true
               ORDER BY "fetchedAt"`,
    },
    {
      index: 'SyncSourceSnapshot_target_evidence_idx',
      query: `SELECT "sourceChecksum", "fetchedAt"
                FROM "SyncSourceSnapshot"
               WHERE "dataKind" = 'CLUSTER_STATISTICS'
                 AND "targetId" = '00000000-0000-0000-0000-000000000002'::uuid
                 AND "sourceDate" = DATE '2026-08-01'
                 AND "sourceChecksum" = repeat('b', 64)
                 AND "valid" = true
               ORDER BY "fetchedAt"`,
    },
  ])('supports the representative predicate with $index', async ({ index, query }) => {
    const plan = await explain(query);
    expect(plan).toContain(index);
  });

  it.each([
    {
      index: 'BidExperiment_non_terminal_created_idx',
      query: `SELECT "id"
                FROM "BidExperiment"
               WHERE "status" IN
                     ('PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING')
               ORDER BY "createdAt", "id"
               LIMIT 100`,
    },
    {
      index: 'BidDecision_createdAt_id_idx',
      query: `SELECT "id"
                FROM "BidDecision"
               WHERE ("createdAt", "id") >
                     (TIMESTAMPTZ '2026-01-01 00:00:00+00',
                      '00000000-0000-0000-0000-000000000000'::uuid)
               ORDER BY "createdAt", "id"
               LIMIT 100`,
    },
    {
      index: 'AuditEvent_createdAt_id_idx',
      query: `SELECT "id"
                FROM "AuditEvent"
               WHERE ("createdAt", "id") >
                     (TIMESTAMPTZ '2026-01-01 00:00:00+00',
                      '00000000-0000-0000-0000-000000000000'::uuid)
               ORDER BY "createdAt", "id"
               LIMIT 100`,
    },
    {
      index: 'WbWriteAttempt_terminal_cleanup_idx',
      query: `SELECT "id"
                FROM "WbWriteAttempt"
               WHERE "status" IN ('ACCEPTED', 'REJECTED')
                 AND "completedAt" < TIMESTAMPTZ '2026-08-01 00:00:00+00'
               ORDER BY "completedAt", "id"
               LIMIT 100`,
    },
    {
      index: 'WbWriteAttempt_dispatching_recovery_idx',
      query: `SELECT "id"
                FROM "WbWriteAttempt"
               WHERE "status" = 'DISPATCHING'
                 AND "dispatchCommittedAt" < TIMESTAMPTZ '2026-08-01 00:00:00+00'`,
    },
    {
      index: 'BiddingPolicy_target_temporal_idx',
      query: `SELECT "id"
                FROM "BiddingPolicy"
               WHERE "enabled" = true
                 AND "scope" = 'TARGET'
                 AND "targetId" = '00000000-0000-0000-0000-000000000002'::uuid
                 AND "validFrom" <= TIMESTAMPTZ '2026-08-01 00:00:00+00'
                 AND ("validTo" IS NULL OR "validTo" > TIMESTAMPTZ '2026-08-01 00:00:00+00')
               ORDER BY "version" DESC
               LIMIT 1`,
    },
    {
      index: 'BiddingPolicy_campaign_temporal_idx',
      query: `SELECT "id"
                FROM "BiddingPolicy"
               WHERE "enabled" = true
                 AND "scope" = 'CAMPAIGN'
                 AND "campaignId" = '00000000-0000-0000-0000-000000000001'::uuid
                 AND "validFrom" <= TIMESTAMPTZ '2026-08-01 00:00:00+00'
                 AND ("validTo" IS NULL OR "validTo" > TIMESTAMPTZ '2026-08-01 00:00:00+00')
               ORDER BY "version" DESC
               LIMIT 1`,
    },
    {
      index: 'BiddingPolicy_deployment_temporal_idx',
      query: `SELECT "id"
                FROM "BiddingPolicy"
               WHERE "enabled" = true
                 AND "scope" = 'DEPLOYMENT'
                 AND "validFrom" <= TIMESTAMPTZ '2026-08-01 00:00:00+00'
                 AND ("validTo" IS NULL OR "validTo" > TIMESTAMPTZ '2026-08-01 00:00:00+00')
               ORDER BY "version" DESC
               LIMIT 1`,
    },
  ])('supports the P1 representative predicate with $index', async ({ index, query }) => {
    const plan = await explain(query);
    expect(plan).toContain(index);
  });

  async function explain(query: string): Promise<string> {
    const result = await pool.query(`EXPLAIN (FORMAT JSON) ${query}`);
    return JSON.stringify(Object.values(result.rows[0] ?? {})[0] ?? null);
  }

  async function seedSnapshotPlannerEvidence(): Promise<void> {
    await pool.query(`
      INSERT INTO "Campaign"
        ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
         "lastSyncedAt", "supported")
      VALUES
        ('00000000-0000-0000-0000-000000000001', 1, 9, 9, 'MANUAL', 'CPM',
         'index-test', NOW(), true)
    `);
    await pool.query(`
      INSERT INTO "CampaignTarget"
        ("id", "campaignId", "nmId", "targetKind", "placement", "normQueryWire",
         "normQueryCanonical", "clusterBidState", "capability")
      VALUES
        ('00000000-0000-0000-0000-000000000002',
         '00000000-0000-0000-0000-000000000001', 123, 'CLUSTER', 'SEARCH',
         'index query', 'index query', 'UNKNOWN', 'OBSERVE_ONLY')
    `);
    await pool.query(`
      INSERT INTO "SyncSourceSnapshot"
        ("id", "dataKind", "campaignId", "targetId", "sourceDate", "fetchedAt",
         "endpointProfile", "sourceChecksum", "normalizedData", "valid", "syncRunId")
      SELECT md5('index-snapshot:' || item)::uuid,
             CASE WHEN item % 2 = 0
               THEN 'CAMPAIGN_STATISTICS'::"SyncDataKind"
               ELSE 'CLUSTER_STATISTICS'::"SyncDataKind"
             END,
             '00000000-0000-0000-0000-000000000001'::uuid,
             CASE WHEN item % 2 = 0
               THEN NULL
               ELSE '00000000-0000-0000-0000-000000000002'::uuid
             END,
             DATE '2025-01-01' + (item % 365),
             TIMESTAMPTZ '2026-01-01 00:00:00+00' + (item * INTERVAL '1 minute'),
             'profile-v1',
             lpad(item::text, 64, '0'),
             jsonb_build_object('nmId', item::text),
             true,
             md5('index-run:' || item)::uuid
        FROM generate_series(1, 2000) item
    `);
  }
});

async function migrationSql(migration: string): Promise<string> {
  return readFile(
    new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
    'utf8',
  );
}

function concurrentStatements(sql: string): readonly string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
