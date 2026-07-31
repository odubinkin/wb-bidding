import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTestDatabaseClient, type TestDatabaseClient } from '@wb-bidder/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DecisionRepository, decideBid, type DecisionResult } from '@wb-bidder/decision-engine';
import { DataSyncRepository } from '@wb-bidder/data-sync';

import { decisionInput, decisionPolicy } from '../helpers/decision-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('Decision Engine PostgreSQL invariants', () => {
  let pool: TestDatabaseClient;
  let repository: DecisionRepository;
  const campaignId = randomUUID();
  const targetId = randomUUID();
  const correlationId = randomUUID();

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('DATABASE_URL is required');
    pool = createTestDatabaseClient({ connectionString: databaseUrl });
    repository = new DecisionRepository(pool);
    await new DataSyncRepository(pool).ensureAccountBinding(
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
    await pool.query(
      `INSERT INTO "Campaign"
         ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
          "supported", "lastSyncedAt")
       VALUES ($1, 31001, 9, 9, 'MANUAL', 'CPM', 'decision-integration', true, NOW())
       ON CONFLICT ("wbCampaignId") DO NOTHING`,
      [campaignId],
    );
    const campaign = await pool.query<{ id: string }>(
      `SELECT "id" FROM "Campaign" WHERE "wbCampaignId" = 31001`,
    );
    const persistedCampaignId = campaign.rows[0]?.id;
    if (persistedCampaignId === undefined) {
      throw new Error('Campaign fixture was not created');
    }
    await pool.query(
      `INSERT INTO "CampaignTarget"
         ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
          "clusterBidState", "capability")
       VALUES ($1, $2, 123, 'CARD', 'SEARCH', 100, NULL, 'CARD_WRITE_READY')
       ON CONFLICT ("campaignId", "nmId", "placement")
         WHERE "targetKind" = 'CARD'
       DO NOTHING`,
      [targetId, persistedCampaignId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('versions economics with optimistic locking, idempotency, audit, and immutability', async () => {
    const first = await repository.createEconomicsVersion({
      actor: 'ADMIN:test',
      contributionMinor: -50n,
      correlationId,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      expectedCurrentVersion: 0n,
      mutationKey: `economics-${correlationId}-1`,
      nmId: 123n,
      source: 'MANUAL',
    });
    expect(first).toMatchObject({ created: true, version: 1n });
    const replay = await repository.createEconomicsVersion({
      actor: 'ADMIN:test',
      contributionMinor: -50n,
      correlationId,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      expectedCurrentVersion: 0n,
      mutationKey: `economics-${correlationId}-1`,
      nmId: 123n,
      source: 'MANUAL',
    });
    expect(replay).toMatchObject({ created: false, id: first.id, version: 1n });
    const second = await repository.createEconomicsVersion({
      actor: 'ADMIN:test',
      contributionMinor: 500n,
      correlationId,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
      expectedCurrentVersion: 1n,
      mutationKey: `economics-${correlationId}-2`,
      nmId: 123n,
      source: 'MANUAL',
    });
    expect(second.version).toBe(2n);
    const finite = await repository.createEconomicsVersion({
      actor: 'ADMIN:test',
      contributionMinor: 700n,
      correlationId,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-03-01T00:00:00.000Z'),
      expectedCurrentVersion: 0n,
      mutationKey: `economics-${correlationId}-finite`,
      nmId: 126n,
      source: 'MANUAL',
    });
    expect(
      (
        await pool.query<{ effectiveTo: Date | null }>(
          `SELECT "effectiveTo" FROM "ProductEconomics" WHERE "id" = $1`,
          [finite.id],
        )
      ).rows[0]?.effectiveTo?.toISOString(),
    ).toBe('2026-03-01T00:00:00.000Z');
    await expect(
      repository.createEconomicsVersion({
        actor: 'ADMIN:test',
        contributionMinor: 600n,
        correlationId,
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-04-01T00:00:00.000Z'),
        expectedCurrentVersion: 0n,
        mutationKey: `economics-${correlationId}-invalid-period`,
        nmId: 125n,
        source: 'MANUAL',
      }),
    ).rejects.toThrow('INVALID_PRODUCT_ECONOMICS');
    await expect(
      repository.createEconomicsVersion({
        actor: 'ADMIN:test',
        contributionMinor: 600n,
        correlationId,
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        expectedCurrentVersion: 1n,
        mutationKey: `economics-${correlationId}-conflict`,
        nmId: 123n,
        source: 'MANUAL',
      }),
    ).rejects.toThrow('VERSION_CONFLICT');
    await expect(
      pool.query(
        `UPDATE "ProductEconomics"
            SET "expectedContributionBeforeAdsMinor" = 999
          WHERE "id" = $1`,
        [second.id],
      ),
    ).rejects.toThrow('immutable');
    const audit = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "AuditEvent"
        WHERE "action" = 'PRODUCT_ECONOMICS_VERSION_CREATED' AND "entityId" IN ($1, $2)`,
      [first.id, second.id],
    );
    expect(audit.rows[0]?.count).toBe('2');
  });

  it('processes async dry-run and partial imports without rolling back successful rows', async () => {
    const queued = await repository.enqueueEconomicsImport({
      actor: 'ADMIN:test',
      correlationId,
      dryRun: false,
      idempotencyKey: `import-${correlationId}`,
      idempotencyScope: 'product-economics',
      rows: [
        {
          contributionMinor: 700n,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 124n,
          rowId: 'ok',
        },
        {
          contributionMinor: 700n,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 123n,
          rowId: 'conflict',
        },
      ],
    });
    expect(queued.created).toBe(true);
    expect(await repository.processNextEconomicsImport('integration-worker')).toBe(queued.importId);
    const status = await pool.query<{
      failedItems: number;
      status: string;
      succeededItems: number;
    }>(
      `SELECT "status", "succeededItems", "failedItems"
         FROM "ProductEconomicsImport" WHERE "id" = $1`,
      [queued.importId],
    );
    expect(status.rows[0]).toEqual({
      failedItems: 1,
      status: 'COMPLETED_WITH_ERRORS',
      succeededItems: 1,
    });
    const replay = await repository.enqueueEconomicsImport({
      actor: 'ADMIN:test',
      correlationId,
      dryRun: false,
      idempotencyKey: `import-${correlationId}`,
      idempotencyScope: 'product-economics',
      rows: [
        {
          contributionMinor: 700n,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 124n,
          rowId: 'ok',
        },
        {
          contributionMinor: 700n,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 123n,
          rowId: 'conflict',
        },
      ],
    });
    expect(replay).toEqual({ created: false, importId: queued.importId });
  });

  it('reclaims an expired import without duplicating completed row effects', async () => {
    const changeReason = 'crash recovery';
    const queued = await repository.enqueueEconomicsImport({
      actor: 'ADMIN:recovery',
      changeReason,
      correlationId,
      dryRun: false,
      idempotencyKey: `recovery-${correlationId}`,
      idempotencyScope: 'product-economics',
      rows: [
        {
          contributionMinor: 800n,
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 127n,
          rowId: 'replayed',
        },
        {
          contributionMinor: 900n,
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 128n,
          rowId: 'terminal',
        },
        {
          contributionMinor: 1_000n,
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          expectedCurrentVersion: 0n,
          nmId: 129n,
          rowId: 'pending',
        },
      ],
    });
    const replayed = await repository.createEconomicsVersion({
      actor: 'ADMIN:recovery',
      changeReason,
      contributionMinor: 800n,
      correlationId,
      effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
      expectedCurrentVersion: 0n,
      mutationKey: `import:${queued.importId}:replayed`,
      nmId: 127n,
      source: 'IMPORT',
    });
    const terminal = await repository.createEconomicsVersion({
      actor: 'ADMIN:recovery',
      changeReason,
      contributionMinor: 900n,
      correlationId,
      effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
      expectedCurrentVersion: 0n,
      mutationKey: `import:${queued.importId}:terminal`,
      nmId: 128n,
      source: 'IMPORT',
    });
    await pool.query(
      `UPDATE "ProductEconomicsImportItem"
          SET "status" = 'SUCCEEDED', "createdVersion" = $2
        WHERE "importId" = $1 AND "rowId" = 'terminal'`,
      [queued.importId, terminal.version.toString()],
    );
    await pool.query(
      `UPDATE "ProductEconomicsImport"
          SET "status" = 'PROCESSING', "startedAt" = NOW() - INTERVAL '10 minutes',
              "leaseOwner" = 'dead-worker', "leaseUntil" = NOW() - INTERVAL '1 minute',
              "attemptCount" = 1
        WHERE "id" = $1`,
      [queued.importId],
    );

    await expect(repository.processNextEconomicsImport('recovery-worker')).resolves.toBe(
      queued.importId,
    );

    const status = await pool.query<{
      attemptCount: number;
      failedItems: number;
      processedItems: number;
      status: string;
      succeededItems: number;
    }>(
      `SELECT "status", "attemptCount", "processedItems", "succeededItems", "failedItems"
         FROM "ProductEconomicsImport" WHERE "id" = $1`,
      [queued.importId],
    );
    expect(status.rows[0]).toEqual({
      attemptCount: 2,
      failedItems: 0,
      processedItems: 3,
      status: 'COMPLETED',
      succeededItems: 3,
    });
    const effects = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS "count"
         FROM "ProductEconomics"
        WHERE "mutationKey" LIKE $1`,
      [`import:${queued.importId}:%`],
    );
    expect(effects.rows[0]?.count).toBe('3');
    expect(replayed.created).toBe(true);
  });

  it('resolves policy priority and persists deduplicated/superseding immutable decisions', async () => {
    const campaign = await pool.query<{ id: string }>(
      `SELECT "id" FROM "Campaign" WHERE "wbCampaignId" = 31001`,
    );
    const persistedCampaignId = campaign.rows[0]?.id;
    if (persistedCampaignId === undefined) {
      throw new Error('Campaign fixture is missing');
    }
    const target = await pool.query<{ id: string }>(
      `SELECT "id" FROM "CampaignTarget"
        WHERE "campaignId" = $1 AND "nmId" = 123 AND "targetKind" = 'CARD'`,
      [persistedCampaignId],
    );
    const persistedTargetId = target.rows[0]?.id;
    if (persistedTargetId === undefined) {
      throw new Error('Target fixture is missing');
    }
    const deployment = await repository.createPolicyVersion({
      actor: 'ADMIN:test',
      campaignId: null,
      configuration: decisionPolicy({ executionMode: 'OBSERVE_ONLY' }),
      correlationId,
      scope: 'DEPLOYMENT',
      targetId: null,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    const targetPolicy = await repository.createPolicyVersion({
      actor: 'ADMIN:test',
      campaignId: null,
      configuration: decisionPolicy(),
      correlationId,
      scope: 'TARGET',
      targetId: persistedTargetId,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    const resolved = await repository.resolvePolicy(
      persistedTargetId,
      persistedCampaignId,
      new Date('2026-07-28T00:00:00.000Z'),
    );
    expect(resolved?.id).toBe(targetPolicy.id);
    expect(resolved?.id).not.toBe(deployment.id);
    const economics = await pool.query<{ id: string; version: string }>(
      `SELECT "id", "version" FROM "ProductEconomics"
        WHERE "nmId" = 123 AND "effectiveTo" IS NULL`,
    );
    const result = decideBid(decisionInput());
    const economicsRow = economics.rows[0];
    if (economicsRow === undefined) {
      throw new Error('Economics fixture is missing');
    }
    const request = {
      calculatedAt: new Date('2026-07-28T12:00:00.000Z'),
      currentBidMinor: 100n,
      economicsId: economicsRow.id,
      economicsVersion: BigInt(economicsRow.version),
      expectedContributionMinor: 500n,
      periodEnd: '2026-07-28',
      periodStart: '2026-07-01',
      policyId: targetPolicy.id,
      policyVersion: targetPolicy.version,
      result,
      targetId: persistedTargetId,
    };
    const first = await repository.persistDecision(request);
    expect(first.created).toBe(true);
    expect(first.decisionId[14]).toBe('7');
    expect(await repository.persistDecision(request)).toEqual({
      created: false,
      decisionId: first.decisionId,
    });
    const laterResult = decideBid(
      decisionInput({ decisionAt: new Date('2026-07-29T12:00:00.000Z') }),
    );
    const later = await repository.persistDecision({
      ...request,
      calculatedAt: new Date('2026-07-29T12:00:00.000Z'),
      result: laterResult,
    });
    expect(later.created).toBe(true);
    const queues = await pool.query<{ status: string }>(
      `SELECT "status" FROM "DecisionQueueItem" q
        JOIN "BidDecision" d ON d."id" = q."decisionId"
       WHERE d."targetId" = $1 ORDER BY d."createdAt"`,
      [persistedTargetId],
    );
    expect(queues.rows.map((row) => row.status)).toEqual(['SUPERSEDED', 'QUEUED']);
    await expect(
      pool.query(`UPDATE "BidDecision" SET "outcomeReasonCode" = 'tampered' WHERE "id" = $1`, [
        first.decisionId,
      ]),
    ).rejects.toThrow('immutable');
  });

  it('creates an experiment atomically with its start decision and enforces capacity', async () => {
    const target = await pool.query<{ id: string }>(
      `SELECT t."id" FROM "CampaignTarget" t
        JOIN "Campaign" c ON c."id" = t."campaignId"
       WHERE c."wbCampaignId" = 31001 AND t."nmId" = 123 AND t."targetKind" = 'CARD'`,
    );
    const persistedTargetId = target.rows[0]?.id;
    if (persistedTargetId === undefined) {
      throw new Error('Experiment target is missing');
    }
    const policy = await pool.query<{ id: string; version: string }>(
      `SELECT "id", "version" FROM "BiddingPolicy"
        WHERE "scope" = 'TARGET' AND "targetId" = $1
        ORDER BY "version" DESC LIMIT 1`,
      [persistedTargetId],
    );
    const economics = await pool.query<{ id: string; version: string }>(
      `SELECT "id", "version" FROM "ProductEconomics"
        WHERE "nmId" = 123 AND "effectiveTo" IS NULL`,
    );
    const policyRow = policy.rows[0];
    const economicsRow = economics.rows[0];
    if (policyRow === undefined || economicsRow === undefined) {
      throw new Error('Experiment prerequisites are missing');
    }
    const experimentResult: DecisionResult = {
      action: 'DECREASE',
      boundedBidMinor: 90n,
      decisionInputChecksum: 'd'.repeat(64),
      explanation: {
        actionBlockers: [],
        buckets: [],
        candidates: [],
        inputSnapshotChecksum: 'e'.repeat(64),
        reservedUnobservedSpendMinor: 10n,
        unconditionalBlockers: [],
      },
      guardrailCodes: ['EXPLORATION_LOWER_ONLY'],
      outcomeReasonCode: 'EXPLORATION_PLANNED',
      proposedBidMinor: 90n,
      queueEligible: true,
      strategyReasonCode: 'EXPLORATION_PLANNED',
    };
    const request = {
      calculatedAt: new Date('2026-07-30T12:00:00.000Z'),
      currentBidMinor: 100n,
      economicsId: economicsRow.id,
      economicsVersion: BigInt(economicsRow.version),
      expectedContributionMinor: 500n,
      experiment: {
        experimentBidMinor: 90n,
        maxConcurrentPerAccount: 10,
        maxConcurrentPerCampaign: 2,
        plannedFullDays: 2,
        sourceBidMinor: 100n,
        spendLimitMinor: 1_000n,
        spendSafetyBufferMinor: 100n,
      },
      periodEnd: '2026-07-30',
      periodStart: '2026-07-01',
      policyId: policyRow.id,
      policyVersion: BigInt(policyRow.version),
      result: experimentResult,
      targetId: persistedTargetId,
    };

    const created = await repository.persistDecision(request);
    const persisted = await pool.query<{
      experimentBidMinor: string;
      startDecisionId: string;
      status: string;
    }>(
      `SELECT "status"::text, "experimentBidMinor", "startDecisionId"
         FROM "BidExperiment" WHERE "targetId" = $1`,
      [persistedTargetId],
    );
    expect(persisted.rows[0]).toEqual({
      experimentBidMinor: 90n,
      startDecisionId: created.decisionId,
      status: 'PLANNED',
    });
    await expect(repository.persistDecision(request)).resolves.toEqual({
      created: false,
      decisionId: created.decisionId,
    });

    await expect(
      repository.persistDecision({
        ...request,
        calculatedAt: new Date('2026-07-30T12:01:00.000Z'),
        result: {
          ...experimentResult,
          decisionInputChecksum: 'f'.repeat(64),
          explanation: {
            ...experimentResult.explanation,
            inputSnapshotChecksum: 'a'.repeat(64),
          },
        },
      }),
    ).rejects.toThrow('EXPERIMENT_ALREADY_ACTIVE');
  });

  it('applies the exact Stage 3 migration over valid populated Stage 2 data', async () => {
    if (databaseUrl === undefined) {
      throw new Error('Database URL is required');
    }
    const sourceUrl = new URL(databaseUrl);
    const databaseName = `wb_stage3_populated_${randomUUID().replaceAll('-', '')}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const isolatedUrl = new URL(sourceUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    const admin = createTestDatabaseClient({ connectionString: adminUrl.toString() });
    let isolated: TestDatabaseClient | undefined;
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      isolated = createTestDatabaseClient({ connectionString: isolatedUrl.toString() });
      for (const migration of [
        '202607281330_initial',
        '202607281410_stage1_rate_limiter',
        '202607281500_stage2_sync_evidence',
      ]) {
        await isolated.query(
          await readFile(
            new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
            'utf8',
          ),
        );
      }
      const economicsId = randomUUID();
      await isolated.query(
        `INSERT INTO "ProductEconomics"
           ("id", "nmId", "effectiveFrom", "expectedContributionBeforeAdsMinor", "source",
            "version", "mutationKey", "inputChecksum", "createdByActor")
         VALUES ($1, 777, NOW(), -10, 'MANUAL', 1, $2, $3, 'ADMIN:test')`,
        [economicsId, randomUUID(), 'a'.repeat(64)],
      );
      await isolated.query(
        `INSERT INTO "BiddingPolicy"
           ("id", "scope", "executionMode", "configuration", "enabled", "version",
            "validFrom", "inputChecksum", "createdByActor")
         VALUES ($1, 'DEPLOYMENT', 'OBSERVE_ONLY', '{}'::jsonb, true, 1, NOW(), $2, 'ADMIN:test')`,
        [randomUUID(), 'b'.repeat(64)],
      );
      await isolated.query(
        await readFile(
          new URL(
            '../../prisma/migrations/202607281600_stage3_decision_engine/migration.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await expect(
        isolated.query(
          `UPDATE "ProductEconomics"
              SET "expectedContributionBeforeAdsMinor" = 0
            WHERE "id" = $1`,
          [economicsId],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        isolated.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "ProductEconomics" WHERE "id" = $1`,
          [economicsId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '1' }] });
    } finally {
      await isolated?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
