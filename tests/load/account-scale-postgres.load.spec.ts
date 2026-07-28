import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DataSyncRepository } from '@wb-bidder/data-sync';

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

describeWithDatabase('PostgreSQL account-scale capacity', () => {
  let admin: Pool;
  let databaseName: string;
  let isolatedUrl: URL;
  let pool: Pool;
  let repository: DataSyncRepository;

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_load_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    admin = new Pool({ connectionString: adminUrl.toString(), max: 2 });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedUrl.toString(), max: 4 });
    for (const migration of MIGRATIONS) {
      await pool.query(
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    }
    repository = new DataSyncRepository(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  });

  it('persists and pages 10,000 campaigns with 100,000 targets in bounded memory', async () => {
    await pool.query(
      `INSERT INTO "Campaign"
           ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
            "supported", "lastSyncedAt")
         SELECT md5('load-campaign:' || campaign)::uuid,
                campaign,
                9,
                9,
                'MANUAL'::"CampaignBidType",
                'CPM'::"CampaignPaymentType",
                'load-' || campaign,
                true,
                NOW()
           FROM generate_series(1, 10000) campaign`,
    );
    await pool.query(
      `INSERT INTO "CampaignTarget"
           ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
            "capability")
         SELECT md5('load-target:' || campaign || ':' || target)::uuid,
                md5('load-campaign:' || campaign)::uuid,
                campaign * 10 + target,
                'CARD'::"CampaignTargetKind",
                'SEARCH'::"CampaignPlacement",
                1000,
                'CARD_WRITE_READY'
           FROM generate_series(1, 10000) campaign
          CROSS JOIN generate_series(1, 10) target`,
    );

    const persisted = await pool.query<{ campaigns: string; targets: string }>(
      `SELECT (SELECT COUNT(*) FROM "Campaign")::text AS campaigns,
                (SELECT COUNT(*) FROM "CampaignTarget")::text AS targets`,
    );
    expect(persisted.rows[0]).toEqual({ campaigns: '10000', targets: '100000' });

    const heapBefore = process.memoryUsage().heapUsed;
    let cursor = 0n;
    let campaignCount = 0;
    let targetCount = 0;
    let pageCount = 0;
    for (;;) {
      const page = await repository.loadCampaignWorkPage(cursor, 500);
      if (page.length === 0) break;
      pageCount += 1;
      campaignCount += page.length;
      for (const campaign of page) targetCount += campaign.targets.length;
      const last = page.at(-1);
      if (last === undefined || last.wbCampaignId <= cursor) {
        throw new Error('Stable campaign cursor did not advance');
      }
      cursor = last.wbCampaignId;
    }

    expect(pageCount).toBe(20);
    expect(campaignCount).toBe(10_000);
    expect(targetCount).toBe(100_000);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(128 * 1024 * 1024);
  }, 120_000);

  it('queues work under pool exhaustion without opening extra connections', async () => {
    const constrained = new Pool({
      connectionString: isolatedUrl.toString(),
      connectionTimeoutMillis: 5_000,
      max: 2,
    });
    const first = await constrained.connect();
    const second = await constrained.connect();
    const waiting = constrained.query<{ value: number }>('SELECT 42 AS value');
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(constrained.totalCount).toBe(2);
    expect(constrained.waitingCount).toBe(1);

    first.release();
    await expect(waiting).resolves.toMatchObject({ rows: [{ value: 42 }] });
    second.release();
    await constrained.end();
  });
});
