import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../../apps/bidder/src/admin.service.js';
import {
  WritePipelineRepository,
  stateChecksum,
  type LiveBidState,
} from '@wb-bidder/write-pipeline';

import { decisionPolicy } from '../helpers/decision-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase('write pipeline PostgreSQL invariants', () => {
  let admin: Pool;
  let databaseName: string;
  let pool: Pool;
  let repository: WritePipelineRepository;

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    const sourceUrl = new URL(databaseUrl);
    databaseName = `wb_s4_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
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
    ]) {
      await pool.query(
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    }
    repository = new WritePipelineRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  });

  it('claims with a lease, commits dispatch before I/O, and verifies accepted item state', async () => {
    const fixture = await createFixture(pool, 'accepted');
    const claimed = await claimFixtures(pool, repository, 'worker-accepted', fixture.decisionId);
    const item = claimed.find((candidate) => candidate.decisionId === fixture.decisionId);
    expect(item).toBeDefined();
    if (item === undefined) return;
    const oldState = liveState(1000n, 'source:old');
    const prepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [{ item, live: oldState }],
      method: 'PATCH',
      reconciliationDeadlineMs: 60_000,
      visibilityDelayMs: 1,
      workerId: 'worker-accepted',
    });
    const preparedStatus = await pool.query<{ status: string }>(
      `SELECT "status"::text FROM "WbWriteAttempt" WHERE "id" = $1`,
      [prepared.attemptId],
    );
    expect(preparedStatus.rows[0]?.status).toBe('PREPARED');

    await repository.commitDispatch(prepared, 'worker-accepted', 1, 60_000, 10_000);
    const committed = await pool.query<{ attemptStatus: string; queueStatus: string }>(
      `SELECT a."status"::text AS "attemptStatus", q."status"::text AS "queueStatus"
         FROM "WbWriteAttempt" a
         JOIN "WbWriteAttemptItem" i ON i."attemptId" = a."id"
         JOIN "DecisionQueueItem" q ON q."decisionId" = i."decisionId"
        WHERE a."id" = $1`,
      [prepared.attemptId],
    );
    expect(committed.rows[0]).toEqual({
      attemptStatus: 'DISPATCHING',
      queueStatus: 'SENT',
    });

    await repository.completeDispatch(
      prepared.attemptId,
      { httpStatus: 200, items: [{ accepted: true, requestIndex: 0 }] },
      12,
    );
    expect(
      (
        await pool.query<{ status: string }>(
          `SELECT "status"::text FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
          [fixture.decisionId],
        )
      ).rows[0]?.status,
    ).toBe('VERIFY_WAIT');

    const desired = liveState(1200n, 'source:new', new Date(Date.now() + 50));
    await expect(
      repository.recordReconciliation({
        attemptItemId: prepared.items[0]?.attemptItemId ?? '',
        decisionId: fixture.decisionId,
        minimumReadIntervalMs: 10,
        maximumWriteAttempts: 2,
        observation: {
          classification: 'DESIRED_STATE',
          fresh: true,
          prevalidationPassed: true,
          sourceMarker: desired.sourceMarker,
          state: desired,
          stateChecksum: stateChecksum(desired),
        },
        observedAt: desired.observedAt,
        requiredStableReadCount: 2,
        targetId: fixture.targetId,
      }),
    ).resolves.toBe('APPLIED');
  });

  it('never blind-retries UNKNOWN and requires two separated stable-old-state reads', async () => {
    const fixture = await createFixture(pool, 'unknown');
    const claimed = await claimFixtures(pool, repository, 'worker-unknown', fixture.decisionId);
    const item = claimed.find((candidate) => candidate.decisionId === fixture.decisionId);
    expect(item).toBeDefined();
    if (item === undefined) return;
    const oldState = liveState(1000n, 'source:old');
    const prepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [{ item, live: oldState }],
      method: 'PATCH',
      reconciliationDeadlineMs: 120_000,
      visibilityDelayMs: 1,
      workerId: 'worker-unknown',
    });
    await repository.commitDispatch(prepared, 'worker-unknown', 1, 120_000, 10_000);
    await repository.markUnknown(prepared.attemptId, 'TIMEOUT_AFTER_DISPATCH', {
      Authorization: 'must-not-persist',
    });
    const queue = await pool.query<{
      manualRetryBlocked: boolean;
      status: string;
      version: string;
    }>(
      `SELECT "status"::text, "manualRetryBlocked", "version"
         FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
      [fixture.decisionId],
    );
    expect(queue.rows[0]).toMatchObject({ manualRetryBlocked: true, status: 'VERIFY_WAIT' });
    await expect(
      repository.retryFailure({
        actor: 'ADMIN:test',
        correlationId: randomUUID(),
        decisionId: fixture.decisionId,
        expectedVersion: BigInt(queue.rows[0]?.version ?? '0'),
        reason: 'unsafe operator attempt',
      }),
    ).rejects.toThrow('RETRY_NOT_SAFE');

    const firstAt = new Date(Date.now() + 50);
    const firstState = { ...oldState, observedAt: firstAt };
    const common = {
      attemptItemId: prepared.items[0]?.attemptItemId ?? '',
      decisionId: fixture.decisionId,
      minimumReadIntervalMs: 10,
      maximumWriteAttempts: 2,
      requiredStableReadCount: 2,
      targetId: fixture.targetId,
    };
    await expect(
      repository.recordReconciliation({
        ...common,
        observation: {
          classification: 'STABLE_OLD_STATE' as const,
          fresh: true,
          prevalidationPassed: true,
          sourceMarker: firstState.sourceMarker,
          state: firstState,
          stateChecksum: stateChecksum(firstState),
        },
        observedAt: firstAt,
      }),
    ).resolves.toBe('WAIT');
    const secondAt = new Date(firstAt.getTime() + 20);
    const secondState = { ...oldState, observedAt: secondAt };
    await expect(
      repository.recordReconciliation({
        ...common,
        observation: {
          classification: 'STABLE_OLD_STATE' as const,
          fresh: true,
          prevalidationPassed: true,
          sourceMarker: secondState.sourceMarker,
          state: secondState,
          stateChecksum: stateChecksum(secondState),
        },
        observedAt: secondAt,
      }),
    ).resolves.toBe('RETRY_WAIT');
    const attempts = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS "count" FROM "WbWriteAttemptItem" WHERE "decisionId" = $1`,
      [fixture.decisionId],
    );
    expect(attempts.rows[0]?.count).toBe('1');

    const retryClaimed = await claimFixtures(
      pool,
      repository,
      'worker-unknown-retry',
      fixture.decisionId,
    );
    const retryItem = retryClaimed.find((candidate) => candidate.decisionId === fixture.decisionId);
    expect(retryItem).toBeDefined();
    if (retryItem === undefined) return;
    const retryPrepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [{ item: retryItem, live: oldState }],
      method: 'PATCH',
      reconciliationDeadlineMs: 120_000,
      visibilityDelayMs: 1,
      workerId: 'worker-unknown-retry',
    });
    await repository.commitDispatch(retryPrepared, 'worker-unknown-retry', 1, 120_000, 10_000);
    await repository.markUnknown(retryPrepared.attemptId, 'TIMEOUT_AFTER_RETRY', {});
    const retryFirstAt = new Date(secondAt.getTime() + 20);
    const retrySecondAt = new Date(retryFirstAt.getTime() + 20);
    for (const [index, observedAt] of [retryFirstAt, retrySecondAt].entries()) {
      const state = { ...oldState, observedAt };
      await expect(
        repository.recordReconciliation({
          attemptItemId: retryPrepared.items[0]?.attemptItemId ?? '',
          decisionId: fixture.decisionId,
          maximumWriteAttempts: 2,
          minimumReadIntervalMs: 10,
          observation: {
            classification: 'STABLE_OLD_STATE',
            fresh: true,
            prevalidationPassed: true,
            sourceMarker: state.sourceMarker,
            state,
            stateChecksum: stateChecksum(state),
          },
          observedAt,
          requiredStableReadCount: 2,
          targetId: fixture.targetId,
        }),
      ).resolves.toBe(index === 0 ? 'WAIT' : 'FAILED');
    }
    const exhausted = await pool.query<{
      code: string | null;
      manualRetryBlocked: boolean;
      status: string;
    }>(
      `SELECT "status"::text, "lastErrorCode" AS "code", "manualRetryBlocked"
         FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
      [fixture.decisionId],
    );
    expect(exhausted.rows[0]).toEqual({
      code: 'WRITE_ATTEMPTS_EXHAUSTED',
      manualRetryBlocked: true,
      status: 'FAILED',
    });
  });

  it('recovers PREPARED without dispatch and DISPATCHING as UNKNOWN', async () => {
    const preparedFixture = await createFixture(pool, 'prepared-crash');
    const claimedPrepared = await claimFixtures(
      pool,
      repository,
      'worker-prepared-crash',
      preparedFixture.decisionId,
    );
    const preparedItem = claimedPrepared.find(
      (candidate) => candidate.decisionId === preparedFixture.decisionId,
    );
    expect(preparedItem).toBeDefined();
    if (preparedItem === undefined) return;
    const prepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [{ item: preparedItem, live: liveState(1000n, 'source:old') }],
      method: 'PATCH',
      reconciliationDeadlineMs: 60_000,
      visibilityDelayMs: 1,
      workerId: 'worker-prepared-crash',
    });
    await pool.query(
      `UPDATE "WbWriteAttempt" SET "preparedAt" = NOW() - INTERVAL '10 minutes' WHERE "id" = $1`,
      [prepared.attemptId],
    );
    await pool.query(
      `UPDATE "DecisionQueueItem" SET "leaseUntil" = NOW() - INTERVAL '1 minute'
        WHERE "decisionId" = $1`,
      [preparedFixture.decisionId],
    );
    await repository.recoverCrashWindows();
    expect(
      (
        await pool.query<{ status: string }>(
          `SELECT "status"::text FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
          [preparedFixture.decisionId],
        )
      ).rows[0]?.status,
    ).toBe('QUEUED');

    const dispatchFixture = await createFixture(pool, 'dispatch-crash');
    const claimedDispatch = await claimFixtures(
      pool,
      repository,
      'worker-dispatch-crash',
      dispatchFixture.decisionId,
    );
    const dispatchItem = claimedDispatch.find(
      (candidate) => candidate.decisionId === dispatchFixture.decisionId,
    );
    expect(dispatchItem).toBeDefined();
    if (dispatchItem === undefined) return;
    const dispatchPrepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [{ item: dispatchItem, live: liveState(1000n, 'source:old') }],
      method: 'PATCH',
      reconciliationDeadlineMs: 60_000,
      visibilityDelayMs: 1,
      workerId: 'worker-dispatch-crash',
    });
    await repository.commitDispatch(dispatchPrepared, 'worker-dispatch-crash', 1, 60_000, 10_000);
    await pool.query(
      `UPDATE "WbWriteAttempt" SET "dispatchCommittedAt" = NOW() - INTERVAL '10 minutes'
        WHERE "id" = $1`,
      [dispatchPrepared.attemptId],
    );
    await repository.recoverCrashWindows();
    const recovered = await pool.query<{ attemptStatus: string; queueStatus: string }>(
      `SELECT a."status"::text AS "attemptStatus", q."status"::text AS "queueStatus"
         FROM "WbWriteAttempt" a
         JOIN "WbWriteAttemptItem" i ON i."attemptId" = a."id"
         JOIN "DecisionQueueItem" q ON q."decisionId" = i."decisionId"
        WHERE a."id" = $1`,
      [dispatchPrepared.attemptId],
    );
    expect(recovered.rows[0]).toEqual({
      attemptStatus: 'UNKNOWN',
      queueStatus: 'VERIFY_WAIT',
    });
  });

  it('rejects a stale pre-write read at the DISPATCHING commit boundary', async () => {
    const fixture = await createFixture(pool, 'stale-prewrite');
    const claimed = await claimFixtures(
      pool,
      repository,
      'worker-stale-prewrite',
      fixture.decisionId,
    );
    const item = claimed.find((candidate) => candidate.decisionId === fixture.decisionId);
    expect(item).toBeDefined();
    if (item === undefined) return;
    const prepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [
        {
          item,
          live: liveState(1000n, 'source:stale', new Date(Date.now() - 20_000)),
        },
      ],
      method: 'PATCH',
      reconciliationDeadlineMs: 60_000,
      visibilityDelayMs: 1,
      workerId: 'worker-stale-prewrite',
    });
    await expect(
      repository.commitDispatch(prepared, 'worker-stale-prewrite', 1, 60_000, 10_000),
    ).rejects.toThrow('PREWRITE_STATE_STALE');
    await repository.rejectPreparedNoDispatch(
      prepared,
      'worker-stale-prewrite',
      'PREWRITE_STATE_STALE',
    );
    const state = await pool.query<{ attemptStatus: string; queueStatus: string }>(
      `SELECT a."status"::text AS "attemptStatus", q."status"::text AS "queueStatus"
         FROM "WbWriteAttempt" a
         JOIN "WbWriteAttemptItem" i ON i."attemptId" = a."id"
         JOIN "DecisionQueueItem" q ON q."decisionId" = i."decisionId"
        WHERE a."id" = $1`,
      [prepared.attemptId],
    );
    expect(state.rows[0]).toEqual({
      attemptStatus: 'REJECTED',
      queueStatus: 'RETRY_WAIT',
    });
  });

  it('maps partial batch outcomes by request index without losing item audit', async () => {
    const acceptedFixture = await createFixture(pool, 'partial-accepted');
    const rejectedFixture = await createFixture(pool, 'partial-rejected');
    const claimed = await claimFixtures(
      pool,
      repository,
      'worker-partial',
      acceptedFixture.decisionId,
      rejectedFixture.decisionId,
    );
    const accepted = claimed.find(
      (candidate) => candidate.decisionId === acceptedFixture.decisionId,
    );
    const rejected = claimed.find(
      (candidate) => candidate.decisionId === rejectedFixture.decisionId,
    );
    expect(accepted).toBeDefined();
    expect(rejected).toBeDefined();
    if (accepted === undefined || rejected === undefined) return;
    const prepared = await repository.prepare({
      endpointKey: 'cardBidsWrite',
      items: [
        { item: accepted, live: liveState(1000n, 'partial:accepted') },
        { item: rejected, live: liveState(1000n, 'partial:rejected') },
      ],
      method: 'PATCH',
      reconciliationDeadlineMs: 60_000,
      visibilityDelayMs: 1,
      workerId: 'worker-partial',
    });
    await repository.commitDispatch(prepared, 'worker-partial', 1, 60_000, 10_000);
    await repository.completeDispatch(
      prepared.attemptId,
      {
        httpStatus: 207,
        items: [
          { accepted: true, requestIndex: 0, responseFragment: { ok: true } },
          {
            accepted: false,
            errorCode: 'INVALID_BID_PAYLOAD',
            requestIndex: 1,
            responseFragment: { authorization: 'must-be-redacted' },
          },
        ],
      },
      8,
    );
    const outcomes = await pool.query<{
      decisionId: string;
      queueStatus: string;
      status: string;
    }>(
      `SELECT i."decisionId", i."status"::text,
              q."status"::text AS "queueStatus"
         FROM "WbWriteAttemptItem" i
         JOIN "DecisionQueueItem" q ON q."decisionId" = i."decisionId"
        WHERE i."attemptId" = $1 ORDER BY i."requestIndex"`,
      [prepared.attemptId],
    );
    expect(outcomes.rows).toEqual([
      {
        decisionId: acceptedFixture.decisionId,
        queueStatus: 'VERIFY_WAIT',
        status: 'ACCEPTED',
      },
      {
        decisionId: rejectedFixture.decisionId,
        queueStatus: 'FAILED',
        status: 'REJECTED',
      },
    ]);
  });

  it('enforces and audits global and target kill controls at dispatch preparation', async () => {
    const fixture = await createFixture(pool, 'kill-switch');
    const claimed = await claimFixtures(pool, repository, 'worker-kill', fixture.decisionId);
    const item = claimed.find((candidate) => candidate.decisionId === fixture.decisionId);
    expect(item).toBeDefined();
    if (item === undefined) return;
    const enabledVersion = await repository.setGlobalKill({
      actor: 'ADMIN:kill-test',
      correlationId: randomUUID(),
      enabled: true,
      expectedVersion: 1n,
      idempotencyKey: 'global-kill-enable',
      idempotencyScope: 'POST:/api/v1/automation/global-kill',
      reason: 'integration emergency stop',
    });
    await expect(
      repository.setGlobalKill({
        actor: 'ADMIN:kill-test',
        correlationId: randomUUID(),
        enabled: true,
        expectedVersion: 1n,
        idempotencyKey: 'global-kill-enable',
        idempotencyScope: 'POST:/api/v1/automation/global-kill',
        reason: 'integration emergency stop',
      }),
    ).resolves.toBe(enabledVersion);
    await expect(
      repository.prepare({
        endpointKey: 'cardBidsWrite',
        items: [{ item, live: liveState(1000n, 'kill:global') }],
        method: 'PATCH',
        reconciliationDeadlineMs: 60_000,
        visibilityDelayMs: 1,
        workerId: 'worker-kill',
      }),
    ).rejects.toThrow('GLOBAL_KILL_ACTIVE');
    await repository.setGlobalKill({
      actor: 'ADMIN:kill-test',
      correlationId: randomUUID(),
      enabled: false,
      expectedVersion: enabledVersion,
      idempotencyKey: 'global-kill-disable',
      idempotencyScope: 'POST:/api/v1/automation/global-kill',
      reason: 'approved re-enable',
    });
    await pool.query(
      `INSERT INTO "TargetAutomation"
         ("id", "targetId", "mode", "reason", "version", "updatedBy")
       VALUES ($1, $2, 'OBSERVE_ONLY', 'target pause', 1, 'ADMIN:kill-test')`,
      [randomUUID(), fixture.targetId],
    );
    await expect(
      repository.prepare({
        endpointKey: 'cardBidsWrite',
        items: [{ item, live: liveState(1000n, 'kill:target') }],
        method: 'PATCH',
        reconciliationDeadlineMs: 60_000,
        visibilityDelayMs: 1,
        workerId: 'worker-kill',
      }),
    ).rejects.toThrow('AUTOMATION_NOT_APPLY');
    const audit = await pool.query<{ action: string }>(
      `SELECT "action" FROM "AuditEvent"
        WHERE "actor" = 'ADMIN:kill-test' ORDER BY "createdAt", "id"`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'GLOBAL_KILL_ENABLED',
      'GLOBAL_KILL_DISABLED',
    ]);
  });

  it('creates an inactive immutable policy idempotently and activates it with ETag semantics', async () => {
    const fixture = await createFixture(pool, 'policy-activation');
    const service = new AdminService(pool);
    const dto = {
      campaignId: fixture.campaignId,
      changeReason: 'new campaign policy',
      configuration: decisionPolicy() as unknown as Record<string, unknown>,
      scope: 'CAMPAIGN' as const,
      validFrom: new Date(Date.now() + 60_000).toISOString(),
    };
    const first = await service.createPolicy(
      'ADMIN:policy-test',
      randomUUID(),
      'policy-create-idempotency',
      dto,
    );
    const replay = await service.createPolicy(
      'ADMIN:policy-test',
      randomUUID(),
      'policy-create-idempotency',
      dto,
    );
    expect((replay.body as { id: string }).id).toBe((first.body as { id: string }).id);
    const created = await pool.query<{ enabled: boolean; version: string }>(
      `SELECT "enabled", "version" FROM "BiddingPolicy" WHERE "id" = $1`,
      [(first.body as { id: string }).id],
    );
    expect(created.rows[0]).toEqual({ enabled: false, version: '1' });
    const activation = {
      actor: 'ADMIN:policy-test',
      correlationId: randomUUID(),
      dto: { changeReason: 'approved activation' },
      expectedVersion: 1n,
      idempotencyKey: 'policy-activation-idempotency',
      policyId: (first.body as { id: string }).id,
      scope: `POST:/api/v1/policies/${(first.body as { id: string }).id}/activations`,
    };
    await expect(service.activatePolicy(activation)).resolves.toMatchObject({
      enabled: true,
      version: '1',
    });
    const assignmentInput = {
      actor: 'ADMIN:policy-test',
      correlationId: randomUUID(),
      dto: { changeReason: 'assign approved policy', policyId: first.body.id },
      entityId: fixture.targetId,
      expectedVersion: 1n,
      idempotencyKey: 'policy-assignment-idempotency',
      policyId: first.body.id,
      scope: `PUT:/api/v1/policy-assignments/target/${fixture.targetId}`,
      scopeId: fixture.targetId,
      scopeType: 'target',
    };
    const assigned = await service.assignPolicy(assignmentInput);
    const assignmentReplay = await service.assignPolicy({
      ...assignmentInput,
      correlationId: randomUUID(),
    });
    expect(assignmentReplay.body).toMatchObject({
      id: (assigned.body as unknown as { id: string }).id,
      version: '2',
    });
    expect(assigned.etag).toBe('"policy-2"');
    expect(
      (
        await pool.query<{ status: string }>(
          `SELECT "status"::text FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
          [fixture.decisionId],
        )
      ).rows[0]?.status,
    ).toBe('SUPERSEDED');
    await expect(service.activatePolicy(activation)).resolves.toMatchObject({
      enabled: true,
      version: '1',
    });
    const evidence = await pool.query<{ auditCount: string; idempotencyCount: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM "AuditEvent"
           WHERE "actor" = 'ADMIN:policy-test' AND "action" LIKE '%policies%activations') AS "auditCount",
         (SELECT COUNT(*)::text FROM "IdempotencyRecord"
           WHERE "idempotencyKey" = 'policy-activation-idempotency') AS "idempotencyCount"`,
    );
    expect(evidence.rows[0]).toEqual({ auditCount: '1', idempotencyCount: '1' });
  });

  it('applies the Stage 4 migration over a clean Stage 3 database', async () => {
    const control = await pool.query<{ globalKill: boolean; version: string }>(
      `SELECT "globalKill", "version" FROM "DeploymentControl"`,
    );
    expect(control.rows[0]?.globalKill).toBe(false);
    expect(BigInt(control.rows[0]?.version ?? '0')).toBeGreaterThanOrEqual(1n);
  });
});

async function createFixture(pool: Pool, suffix: string) {
  const campaignId = randomUUID();
  const targetId = randomUUID();
  const economicsId = randomUUID();
  const policyId = randomUUID();
  const metricId = randomUUID();
  const decisionId = randomUUID();
  const numericSuffix = BigInt(`9${createNumericSuffix()}`);
  await pool.query(
    `INSERT INTO "Campaign"
       ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
        "supported", "lastSyncedAt")
     VALUES ($1, $2, 9, 9, 'MANUAL', 'CPM', $3, true, NOW())`,
    [campaignId, numericSuffix.toString(), `write-${suffix}`],
  );
  await pool.query(
    `INSERT INTO "CampaignTarget"
       ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
        "capability")
     VALUES ($1, $2, $3, 'CARD', 'SEARCH', 1000, 'CARD_WRITE_READY')`,
    [targetId, campaignId, numericSuffix.toString()],
  );
  await pool.query(
    `INSERT INTO "CampaignAutomation"
       ("id", "campaignId", "mode", "reason", "version", "updatedBy")
     VALUES ($1, $2, 'APPLY', 'integration fixture', 1, 'test')`,
    [randomUUID(), campaignId],
  );
  await pool.query(
    `INSERT INTO "ProductEconomics"
       ("id", "nmId", "effectiveFrom", "expectedContributionBeforeAdsMinor", "source",
        "version", "mutationKey", "inputChecksum", "createdByActor")
     VALUES ($1, $2, NOW() - INTERVAL '1 day', 5000, 'MANUAL', 1, $3, $4, 'test')`,
    [economicsId, numericSuffix.toString(), randomUUID(), 'e'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO "BiddingPolicy"
       ("id", "scope", "targetId", "executionMode", "configuration", "enabled", "version",
        "validFrom", "inputChecksum", "createdByActor")
     VALUES ($1, 'TARGET', $2, 'APPLY', '{}'::jsonb, true, 1,
             NOW() - INTERVAL '1 day', $3, 'test')`,
    [policyId, targetId, 'p'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO "MetricSnapshot"
       ("id", "targetId", "productEconomicsId", "productEconomicsVersion",
        "expectedContributionBeforeAdsMinor", "policyId", "periodStart", "periodEnd",
        "metrics", "candidateEstimates", "completenessFlags", "inputSnapshotChecksum",
        "inputSnapshotSchema", "algorithmVersion", "calculatedAt")
     VALUES ($1, $2, $3, 1, 5000, $4, CURRENT_DATE - 1, CURRENT_DATE,
             '{}'::jsonb, '{}'::jsonb, ARRAY[]::text[], $5,
             'input-snapshot-v1', 'rules-v1', NOW())`,
    [metricId, targetId, economicsId, policyId, checksumFor(`metric-${decisionId}`)],
  );
  await pool.query(
    `INSERT INTO "BidDecision"
       ("id", "targetId", "action", "currentBidMinor", "proposedBidMinor", "boundedBidMinor",
        "strategyReasonCode", "outcomeReasonCode", "guardrailCodes", "explanation",
        "metricSnapshotId", "policyVersion", "algorithmVersion", "decisionInputChecksum")
     VALUES ($1, $2, 'INCREASE', 1000, 1200, 1200, 'PROFIT_MAX',
             'BID_CHANGE_SELECTED', ARRAY[]::text[], '{}'::jsonb, $3, 1, 'rules-v1', $4)`,
    [decisionId, targetId, metricId, checksumFor(`decision-${decisionId}`)],
  );
  await pool.query(
    `INSERT INTO "DecisionQueueItem"
       ("id", "decisionId", "status", "priority", "availableAt")
     VALUES ($1, $2, 'QUEUED', 100, NOW())`,
    [randomUUID(), decisionId],
  );
  return { campaignId, decisionId, targetId };
}

function liveState(bidMinor: bigint, sourceMarker: string, observedAt = new Date()): LiveBidState {
  return { bidMinor, explicit: true, observedAt, sourceMarker };
}

function createNumericSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 14).replaceAll(/[a-f]/gu, '7');
}

function checksumFor(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}

async function claimFixtures(
  pool: Pool,
  repository: WritePipelineRepository,
  workerId: string,
  ...decisionIds: string[]
) {
  await pool.query(
    `UPDATE "DecisionQueueItem"
        SET "availableAt" = CASE WHEN "decisionId" = ANY($1::uuid[])
                                  THEN NOW() ELSE NOW() + INTERVAL '1 hour' END
      WHERE "status" IN ('QUEUED','RETRY_WAIT')`,
    [decisionIds],
  );
  const claimed = await repository.claim(workerId, 50, 30);
  const missing = decisionIds.filter(
    (decisionId) => !claimed.some((candidate) => candidate.decisionId === decisionId),
  );
  if (missing.length > 0) {
    const diagnostic = await pool.query(
      `SELECT q."decisionId", q."status"::text, q."availableAt", q."leaseOwner",
              q."leaseUntil", d."targetId"
         FROM "DecisionQueueItem" q
         JOIN "BidDecision" d ON d."id" = q."decisionId"
        ORDER BY q."availableAt", q."id"`,
    );
    throw new Error(
      `CLAIM_MISSING expected=${JSON.stringify(decisionIds)} claimed=${JSON.stringify(
        claimed.map((candidate) => candidate.decisionId),
      )} queues=${JSON.stringify(diagnostic.rows)}`,
    );
  }
  return claimed;
}
