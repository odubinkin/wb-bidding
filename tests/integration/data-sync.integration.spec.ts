import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DataSyncRepository,
  assessPerformanceDay,
  assessTargetSnapshot,
  evidenceChecksum,
  type AccountBindingCandidate,
  type PerformanceDayCandidate,
} from '@wb-bidder/data-sync';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('data synchronization persistence', () => {
  let pool: Pool;
  let repository: DataSyncRepository;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    repository = new DataSyncRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enforces singleton binding transitions and append-only audit', async () => {
    const binding: AccountBindingCandidate = {
      accountCurrency: 'RUB',
      accountTimezone: 'Europe/Moscow',
      environment: 'MOCK',
      sellerSid: '00000000-0000-4000-8000-000000000001',
      tokenCategory: 'PROMOTION',
      tokenFingerprint: '1'.repeat(64),
      tokenFor: null,
      tokenType: 'TEST',
    };
    const first = await repository.ensureAccountBinding(binding, randomUUID());
    expect(['CREATE', 'VALIDATE']).toContain(first.transition);
    const rotated = await repository.ensureAccountBinding(
      { ...binding, tokenFingerprint: '2'.repeat(64) },
      randomUUID(),
    );
    expect(['ROTATE', 'VALIDATE']).toContain(rotated.transition);
    await expect(
      repository.ensureAccountBinding(
        { ...binding, sellerSid: '00000000-0000-4000-8000-000000000002' },
        randomUUID(),
      ),
    ).rejects.toThrow('mismatch');

    const audit = await pool.query<{ id: string }>(
      `SELECT "id" FROM "AuditEvent"
        WHERE "entityType" = 'DeploymentAccountBinding'
        ORDER BY "createdAt" DESC LIMIT 1`,
    );
    await expect(
      pool.query(`UPDATE "AuditEvent" SET "action" = 'MUTATED' WHERE "id" = $1`, [
        audit.rows[0]?.id,
      ]),
    ).rejects.toThrow('append-only');
  });

  it('prevents overlap and persists checkpoints after a bounded scheduler run', async () => {
    let releaseWorker: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseWorker = resolve;
    });
    const firstRun = repository.withSchedulerRun(
      `INTEGRATION_LOCK_${randomUUID()}`,
      5_000,
      async () => {
        markStarted?.();
        await release;
        return 'done';
      },
    );
    await started;
    const activeJob = await pool.query<{ jobType: string }>(
      `SELECT "jobType" FROM "SchedulerRun"
        WHERE "status" = 'RUNNING'
        ORDER BY "startedAt" DESC LIMIT 1`,
    );
    const second = await repository.withSchedulerRun(
      activeJob.rows[0]?.jobType ?? 'missing',
      5_000,
      () => Promise.resolve('duplicate'),
    );
    expect(second.started).toBe(false);
    releaseWorker?.();
    await expect(firstRun).resolves.toMatchObject({ result: 'done', started: true });

    await repository.saveCheckpoint('MINIMUM_BID', { value: '10001' }, new Date(), 1n, 10n, false);
    await expect(repository.loadNumericCheckpoint('MINIMUM_BID')).resolves.toBe(10_001n);
  });

  it('upserts current/minimum evidence and versions finalized statistical days', async () => {
    const suffix = Date.now() % 100_000;
    const wbCampaignId = 900_000 + suffix;
    const nmId = 800_000 + suffix;
    const runId = randomUUID();
    const observedAt = new Date('2026-07-30T12:00:00.000Z');
    const details = {
      adverts: [
        {
          bid_type: 'manual' as const,
          id: wbCampaignId,
          nm_settings: [
            {
              bids_kopecks: { recommendations: 900, search: 1200 },
              nm_id: nmId,
              subject: { id: 52, name: 'synthetic subject' },
            },
          ],
          settings: {
            name: `Integration ${String(wbCampaignId)}`,
            payment_type: 'cpm' as const,
            placements: { recommendations: false, search: true },
          },
          status: 9 as const,
          timestamps: {
            created: '2026-07-20T00:00:00.000Z',
            deleted: '2100-01-01T00:00:00.000Z',
            started: '2026-07-20T00:00:00.000Z',
            updated: observedAt.toISOString(),
          },
        },
      ],
    };
    const current = await repository.upsertCampaignDetails(details, observedAt, runId, 'EXCLUSIVE');
    expect(current).toEqual({ campaigns: 1, targets: 1 });
    const work = await repository.loadCampaignWorkPage(BigInt(wbCampaignId - 1), 10);
    const campaign = work.find((item) => item.wbCampaignId === BigInt(wbCampaignId));
    expect(campaign?.targets).toHaveLength(1);
    const target = campaign?.targets[0];
    if (campaign === undefined || target === undefined) {
      throw new Error('Integration campaign target was not persisted');
    }
    await expect(
      repository.applyMinimumBids(
        campaign.campaignId,
        {
          bids: [
            {
              bids: [{ type: 'search', value: 250 }],
              nm_id: nmId,
            },
          ],
        },
        'SEARCH',
        observedAt,
        runId,
      ),
    ).resolves.toBe(1);

    const sourceWrite = {
      campaignId: campaign.campaignId,
      dataKind: 'CURRENT_BID' as const,
      endpointProfile: 'wb-promotion-2026-07-28-v1',
      fetchedAt: observedAt,
      normalizedData: { bidMinor: '1200' },
      sourceChecksum: evidenceChecksum({ bidMinor: 1200 }),
      syncRunId: runId,
      targetId: target.targetId,
      valid: true,
    };
    const sourceId = await repository.recordSourceSnapshot(sourceWrite);
    await expect(repository.recordSourceSnapshot(sourceWrite)).resolves.toBe(sourceId);

    const targetAssessment = assessTargetSnapshot(
      [
        {
          dataKind: 'CURRENT_BID',
          fetchedAt: observedAt,
          freshnessMinutes: 20,
          regimeChecksum: 'regime-integration',
          required: true,
          sourceChecksum: sourceWrite.sourceChecksum,
          valid: true,
        },
      ],
      observedAt,
    );
    await expect(
      repository.recordTargetSnapshot(target.targetId, runId, observedAt, targetAssessment, {
        CURRENT_BID: sourceWrite.sourceChecksum,
      }),
    ).resolves.toMatch(/^[a-f0-9-]{36}$/u);

    const candidate = performanceCandidate(nmId);
    const policy = {
      maxObservationGapMinutes: 20,
      minimumStableMinutes: 60,
      minimumStableReads: 2,
    };
    const firstAssessment = assessPerformanceDay(candidate, policy);
    expect(firstAssessment.status).toBe('FINALIZED');
    const first = await repository.persistPerformanceDay(
      target.targetId,
      candidate,
      firstAssessment,
      new Date('2026-07-29T02:00:00.000Z'),
    );
    expect(first.superseded).toBe(false);

    const changedCandidate = {
      ...candidate,
      statistic: { ...candidate.statistic, clicks: 11n },
    };
    const changedAssessment = assessPerformanceDay(changedCandidate, policy);
    const changed = await repository.persistPerformanceDay(
      target.targetId,
      changedCandidate,
      changedAssessment,
      new Date('2026-07-29T03:00:00.000Z'),
    );
    expect(changed.superseded).toBe(true);
    const versions = await pool.query<{ status: string }>(
      `SELECT "status" FROM "BidPerformanceDay"
        WHERE "targetId" = $1 AND "wbStatisticDate" = '2026-07-27'
        ORDER BY "createdAt"`,
      [target.targetId],
    );
    expect(versions.rows.map((row) => row.status).sort()).toEqual(['FINALIZED', 'SUPERSEDED']);
  });

  it('applies the exact Stage 2 migration SQL over a populated pre-Stage-2 database', async () => {
    if (databaseUrl === undefined) {
      throw new Error('DATABASE_URL is required by this integration project');
    }
    const databaseName = `wb_stage2_populated_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString: databaseUrl });
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    let isolated: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      isolated = new Pool({ connectionString: isolatedUrl.toString() });
      for (const migration of ['202607281330_initial', '202607281410_stage1_rate_limiter']) {
        const sql = await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        );
        await isolated.query(sql);
      }
      const campaignId = randomUUID();
      await isolated.query(
        `INSERT INTO "Campaign"
           ("id", "wbCampaignId", "type", "status", "bidType", "paymentType",
            "name", "lastSyncedAt", "supported")
         VALUES ($1, 123456789, 9, 9, 'MANUAL', 'CPM', 'populated',
                 NOW(), true)`,
        [campaignId],
      );
      const stageTwoSql = await readFile(
        new URL(
          '../../prisma/migrations/202607281500_stage2_sync_evidence/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await isolated.query(stageTwoSql);
      await expect(
        isolated.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM "Campaign" WHERE "id" = $1`,
          [campaignId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '1' }] });
      await expect(
        isolated.query(`SELECT "dataKind", "cursor" FROM "SyncCheckpoint" LIMIT 1`),
      ).resolves.toBeDefined();
    } finally {
      await isolated?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  });
});

function performanceCandidate(nmId: number): PerformanceDayCandidate {
  const dayStartedAt = new Date('2026-07-27T00:00:00.000Z');
  const dayEndedAt = new Date('2026-07-28T00:00:00.000Z');
  return {
    attributionUnambiguous: true,
    bidStates: Array.from({ length: 73 }, (_, index) => ({
      changeMarkerObserved: true,
      configurationChecksum: `regime-${String(nmId)}`,
      currentBidMinor: 1200n,
      observedAt: new Date(dayStartedAt.getTime() + index * 20 * 60_000),
    })),
    campaignTrafficEligible: true,
    conversionCutoff: new Date('2026-07-29T00:00:00.000Z'),
    dayEndedAt,
    dayStartedAt,
    externalWriteControlMode: 'EXCLUSIVE',
    moneyContractValid: true,
    preEnrollment: false,
    sourceReads: [
      {
        checksum: 'stable',
        fetchedAt: new Date('2026-07-29T00:00:00.000Z'),
      },
      {
        checksum: 'stable',
        fetchedAt: new Date('2026-07-29T01:00:00.000Z'),
      },
    ],
    statistic: {
      atbs: 3n,
      attributedRevenueMinor: 20_000n,
      clicks: 10n,
      date: '2026-07-27',
      orderedUnits: 2n,
      orders: 2n,
      spendMinor: 5_000n,
      views: 100n,
    },
  };
}
