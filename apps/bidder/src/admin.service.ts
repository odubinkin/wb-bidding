/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-base-to-string, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { Pool, PoolClient } from 'pg';

import { DATABASE_POOL } from './database.js';
import { AdminApiError } from './problem-details.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import type {
  AutomationDto,
  EconomicsImportDto,
  EconomicsUpdateDto,
  GlobalKillDto,
  ManualJobDto,
  PolicyCreateDto,
} from './admin-dto.js';
import { DecisionRepository, type DecisionPolicy } from '@wb-bidder/decision-engine';
import { WritePipelineRepository } from '@wb-bidder/write-pipeline';

@Injectable()
export class AdminService {
  private readonly decisions: DecisionRepository;
  private readonly writes: WritePipelineRepository;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly clock: RuntimeClockService,
  ) {
    this.decisions = new DecisionRepository(pool);
    this.writes = new WritePipelineRepository(pool);
  }

  public async getEconomics(nmId: bigint, at?: Date) {
    const effectiveAt = at ?? this.clock.now();
    const result = await this.pool.query(
      `SELECT "id", "nmId", "expectedContributionBeforeAdsMinor", "effectiveFrom",
              "effectiveTo", "source"::text, "sourceUpdatedAt", "sourceReference", "version",
              "createdAt", "createdByActor"
         FROM "ProductEconomics"
        WHERE "nmId" = $1 AND "effectiveFrom" <= $2
          AND ("effectiveTo" IS NULL OR "effectiveTo" > $2)
        ORDER BY "version" DESC LIMIT 1`,
      [nmId.toString(), effectiveAt],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row === undefined)
      throw new AdminApiError(404, 'PRODUCT_ECONOMICS_NOT_FOUND', 'No effective version exists.');
    return { body: serialize(row), etag: economicsEtag(row.version) };
  }

  public async updateEconomics(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: EconomicsUpdateDto;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
    readonly nmId: bigint;
  }) {
    const created = await this.decisions.createEconomicsVersion({
      actor: input.actor,
      changeReason: input.dto.changeReason,
      contributionMinor: parseSignedBigInt(input.dto.expectedContributionBeforeAdsMinor),
      correlationId: input.correlationId,
      effectiveFrom: parseDate(input.dto.effectiveFrom),
      effectiveTo:
        input.dto.effectiveTo === undefined || input.dto.effectiveTo === null
          ? null
          : parseDate(input.dto.effectiveTo),
      expectedCurrentVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      mutationKey: `PUT:/api/v1/product-economics/${input.nmId.toString()}:${input.idempotencyKey}`,
      nmId: input.nmId,
      source: 'MANUAL',
      ...(input.dto.sourceReference === undefined
        ? {}
        : { sourceReference: input.dto.sourceReference }),
      ...(input.dto.sourceUpdatedAt === undefined
        ? {}
        : { sourceUpdatedAt: parseDate(input.dto.sourceUpdatedAt) }),
    });
    return this.getEconomics(input.nmId, parseDate(input.dto.effectiveFrom)).then((value) => ({
      ...value,
      created: created.created,
    }));
  }

  public async createImport(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: EconomicsImportDto;
    readonly idempotencyKey: string;
  }) {
    const result = await this.decisions.enqueueEconomicsImport({
      actor: input.actor,
      changeReason: input.dto.changeReason,
      correlationId: input.correlationId,
      dryRun: input.dto.dryRun,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: 'POST:/api/v1/product-economics/imports',
      rows: input.dto.items.map((item) => ({
        contributionMinor: parseSignedBigInt(item.expectedContributionBeforeAdsMinor),
        effectiveFrom: parseDate(item.effectiveFrom),
        effectiveTo:
          item.effectiveTo === undefined || item.effectiveTo === null
            ? null
            : parseDate(item.effectiveTo),
        expectedCurrentVersion: BigInt(item.expectedCurrentVersion),
        nmId: BigInt(item.nmId),
        rowId: item.rowId,
        ...(item.sourceReference === undefined ? {} : { sourceReference: item.sourceReference }),
        ...(item.sourceUpdatedAt === undefined
          ? {}
          : { sourceUpdatedAt: parseDate(item.sourceUpdatedAt) }),
      })),
    });
    const status = await this.getImport(result.importId);
    return { ...status, created: result.created };
  }

  public async getImport(importId: string) {
    const result = await this.pool.query(
      `SELECT "id" AS "importId", "status"::text, "dryRun", "changeReason",
              "totalItems", "processedItems",
              "validatedItems", "succeededItems", "failedItems", "createdAt", "startedAt",
              "finishedAt", "requestChecksum", "lastError"
         FROM "ProductEconomicsImport" WHERE "id" = $1`,
      [importId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new AdminApiError(404, 'IMPORT_NOT_FOUND', 'Import not found.');
    return serialize(row);
  }

  public async listImportItems(importId: string, query: ListQuery & { status?: string }) {
    const page = pageFrom(query);
    const status = enumFilter(query.status, [
      'PENDING',
      'PROCESSING',
      'VALIDATED',
      'SUCCEEDED',
      'FAILED',
    ]);
    const result = await this.pool.query(
      `SELECT "rowId", "nmId", "status"::text, "errorCode" AS "code",
              "errorDetail" AS "detail", "actualCurrentVersion", "createdVersion",
              "createdAt", "id"
         FROM "ProductEconomicsImportItem"
        WHERE "importId" = $1 AND ($2::text IS NULL OR "status"::text = $2)
          AND ($3::timestamptz IS NULL OR ("createdAt", "id") > ($3, $4::uuid))
        ORDER BY "createdAt", "id" LIMIT $5`,
      [importId, status, page.cursorAt, page.cursorId, page.limit + 1],
    );
    return listResponse(result.rows, page.limit);
  }

  public async listPolicies(query: ListQuery & { scope?: string }) {
    const page = pageFrom(query);
    const scope = enumFilter(query.scope, ['DEPLOYMENT', 'CAMPAIGN', 'TARGET']);
    const result = await this.pool.query(
      `SELECT "id", "scope"::text, "campaignId", "targetId", "executionMode"::text,
              "configuration", "enabled", "version", "validFrom", "validTo",
              "inputChecksum", "createdAt", "createdByActor"
         FROM "BiddingPolicy"
        WHERE ($1::text IS NULL OR "scope"::text = $1)
          AND ($2::timestamptz IS NULL OR ("createdAt", "id") > ($2, $3::uuid))
        ORDER BY "createdAt", "id" LIMIT $4`,
      [scope, page.cursorAt, page.cursorId, page.limit + 1],
    );
    return listResponse(result.rows, page.limit);
  }

  public async getPolicy(id: string) {
    const result = await this.pool.query(
      `SELECT "id", "scope"::text, "campaignId", "targetId", "executionMode"::text,
              "configuration", "enabled", "version", "validFrom", "validTo",
              "inputChecksum", "createdAt", "createdByActor"
         FROM "BiddingPolicy" WHERE "id" = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) throw new AdminApiError(404, 'POLICY_NOT_FOUND', 'Policy not found.');
    return { body: serialize(row), etag: versionEtag('policy', row.version) };
  }

  public async createPolicy(
    actor: string,
    correlationId: string,
    idempotencyKey: string,
    dto: PolicyCreateDto,
  ) {
    const created = await this.decisions.createPolicyVersion({
      actor,
      campaignId: dto.campaignId ?? null,
      changeReason: dto.changeReason,
      configuration: dto.configuration as unknown as DecisionPolicy,
      correlationId,
      enabled: false,
      idempotencyKey,
      idempotencyScope: 'POST:/api/v1/policies',
      scope: dto.scope,
      targetId: dto.targetId ?? null,
      validFrom: parseDate(dto.validFrom),
    });
    const response = await this.getPolicy(created.id);
    return {
      body: {
        ...(response.body as Record<string, unknown>),
        id: created.id,
        validation: { valid: true },
        version: created.version.toString(),
      },
      etag: response.etag,
    };
  }

  public async activatePolicy(input: MutationContext & { readonly policyId: string }) {
    return this.transactionalMutation(input, async (client, audit) => {
      const row = await client.query<{
        campaignId: string | null;
        enabled: boolean;
        scope: string;
        targetId: string | null;
        validFrom: Date;
        version: string;
      }>(
        `SELECT "campaignId", "enabled", "scope"::text, "targetId", "validFrom", "version"
           FROM "BiddingPolicy" WHERE "id" = $1 FOR UPDATE`,
        [input.policyId],
      );
      const policy = row.rows[0];
      if (policy === undefined) throw new Error('POLICY_NOT_FOUND');
      audit.before = policy;
      if (BigInt(policy.version) !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      if (!policy.enabled) {
        await client.query(
          `UPDATE "BiddingPolicy"
              SET "validTo" = $4
            WHERE "scope" = $1::"PolicyScope"
              AND "campaignId" IS NOT DISTINCT FROM $2
              AND "targetId" IS NOT DISTINCT FROM $3
              AND "enabled" = true AND "validTo" IS NULL AND "id" <> $5`,
          [policy.scope, policy.campaignId, policy.targetId, policy.validFrom, input.policyId],
        );
        await client.query(`UPDATE "BiddingPolicy" SET "enabled" = true WHERE "id" = $1`, [
          input.policyId,
        ]);
        await client.query(
          `UPDATE "DecisionQueueItem" q
              SET "status" = 'SUPERSEDED', "version" = q."version" + 1
             FROM "BidDecision" d, "CampaignTarget" t
            WHERE q."decisionId" = d."id" AND t."id" = d."targetId"
              AND q."status" IN ('QUEUED','RETRY_WAIT')
              AND (($1 = 'TARGET' AND d."targetId" = $2)
                OR ($1 = 'CAMPAIGN' AND t."campaignId" = $3)
                OR $1 = 'DEPLOYMENT')`,
          [policy.scope, policy.targetId, policy.campaignId],
        );
      }
      return { enabled: true, id: input.policyId, version: policy.version };
    });
  }

  public async assignPolicy(
    input: MutationContext & {
      readonly policyId: string;
      readonly scopeId: string;
      readonly scopeType: string;
    },
  ) {
    const source = await this.getPolicy(input.policyId);
    const body = source.body as {
      configuration: DecisionPolicy;
    };
    const scope = input.scopeType.toUpperCase();
    if (!['CAMPAIGN', 'TARGET'].includes(scope))
      throw new AdminApiError(422, 'INVALID_SCOPE', 'scopeType must be campaign or target.');
    const created = await this.decisions.createPolicyVersion({
      actor: input.actor,
      campaignId: scope === 'CAMPAIGN' ? input.scopeId : null,
      configuration: body.configuration,
      correlationId: input.correlationId,
      expectedCurrentVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      idempotencyInput: {
        changeReason: (input.dto as { changeReason?: string }).changeReason ?? null,
        expectedVersion: input.expectedVersion,
        policyId: input.policyId,
        scope,
        scopeId: input.scopeId,
      },
      idempotencyScope: input.scope,
      scope: scope as 'CAMPAIGN' | 'TARGET',
      supersedeQueued: true,
      targetId: scope === 'TARGET' ? input.scopeId : null,
      validFrom: this.clock.now(),
      ...((input.dto as { changeReason?: string }).changeReason === undefined
        ? {}
        : { changeReason: (input.dto as { changeReason: string }).changeReason }),
    });
    return this.getPolicy(created.id);
  }

  public async listAssignments(query: ListQuery & { campaignId?: string; targetId?: string }) {
    const page = pageFrom(query);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const result = await this.pool.query(
      `SELECT "id" AS "policyId", "scope"::text AS "scopeType",
              COALESCE("campaignId", "targetId") AS "scopeId", "version", "validFrom", "validTo",
              "createdAt", "id"
         FROM "BiddingPolicy"
        WHERE "enabled" = true
          AND ($1::uuid IS NULL OR "campaignId" = $1)
          AND ($2::uuid IS NULL OR "targetId" = $2)
          AND ($3::timestamptz IS NULL OR ("createdAt", "id") > ($3, $4::uuid))
        ORDER BY "createdAt", "id" LIMIT $5`,
      [campaignId, targetId, page.cursorAt, page.cursorId, page.limit + 1],
    );
    return listResponse(result.rows, page.limit);
  }

  public async getAutomation() {
    const control = await this.pool.query(
      `SELECT "globalKill", "reason", "version", "updatedAt", "updatedBy"
         FROM "DeploymentControl" WHERE "id" = $1`,
      ['00000000-0000-0000-0000-000000000002'],
    );
    const campaigns = await this.pool.query(
      `SELECT "campaignId", "mode"::text, "reason", "version", "updatedAt", "updatedBy"
         FROM "CampaignAutomation" ORDER BY "campaignId"`,
    );
    const targets = await this.pool.query(
      `SELECT "targetId", "mode"::text, "reason", "version", "updatedAt", "updatedBy"
         FROM "TargetAutomation" ORDER BY "targetId"`,
    );
    return serialize({
      deployment: control.rows[0],
      campaigns: campaigns.rows,
      targets: targets.rows,
    });
  }

  public async setAutomation(
    input: MutationContext & {
      readonly dto: AutomationDto;
      readonly entityId: string;
      readonly entityType: 'campaign' | 'target';
    },
  ) {
    const table = input.entityType === 'campaign' ? 'CampaignAutomation' : 'TargetAutomation';
    const column = input.entityType === 'campaign' ? 'campaignId' : 'targetId';
    return this.transactionalMutation(input, async (client, audit) => {
      const current = await client.query<Record<string, unknown>>(
        `SELECT "id", "mode"::text, "version" FROM "${table}" WHERE "${column}" = $1 FOR UPDATE`,
        [input.entityId],
      );
      const previous = current.rows[0];
      audit.before = previous ?? null;
      const actualVersion = BigInt(String(previous?.version ?? 0));
      if (actualVersion !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      const version = actualVersion + 1n;
      const id = String(previous?.id ?? randomUUID());
      await client.query(
        `INSERT INTO "${table}"
           ("id", "${column}", "mode", "reason", "version", "updatedAt", "updatedBy")
         VALUES ($1, $2, $3::"AutomationMode", $4, $5, NOW(), $6)
         ON CONFLICT ("${column}") DO UPDATE SET
           "mode" = EXCLUDED."mode", "reason" = EXCLUDED."reason",
           "version" = EXCLUDED."version", "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy"`,
        [
          id,
          input.entityId,
          input.dto.mode,
          input.dto.changeReason,
          version.toString(),
          input.actor,
        ],
      );
      return {
        [`${input.entityType}Id`]: input.entityId,
        mode: input.dto.mode,
        version: version.toString(),
      };
    });
  }

  public async setGlobalKill(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: GlobalKillDto;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
  }) {
    const version = await this.writes.setGlobalKill({
      actor: input.actor,
      correlationId: input.correlationId,
      enabled: input.dto.enabled,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: 'POST:/api/v1/automation/global-kill',
      reason: input.dto.changeReason,
    });
    return { enabled: input.dto.enabled, version: version.toString() };
  }

  public async createJob(
    input: MutationContext & {
      readonly dto: ManualJobDto;
      readonly type: 'RECALCULATE' | 'RESYNC';
    },
  ) {
    return this.transactionalMutation(input, async (client, audit) => {
      if ((input.dto.campaignIds?.length ?? 0) === 0 && (input.dto.targetIds?.length ?? 0) === 0) {
        throw new AdminApiError(
          422,
          'UNBOUNDED_JOB_SCOPE',
          'At least one bounded scope is required.',
        );
      }
      const scope = jobScope(input.dto);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `manual-job:${input.type}:${checksum(scope)}`,
      ]);
      const active = await client.query<{ id: string; status: 'QUEUED' | 'RUNNING' }>(
        `SELECT "id", "status"::text FROM "ManualJob"
          WHERE "type" = $1 AND "status" IN ('QUEUED','RUNNING')
            AND "scope" = $2::jsonb LIMIT 1 FOR UPDATE`,
        [input.type, json(scope)],
      );
      audit.before = active.rows[0] ?? null;
      if (active.rows[0] !== undefined) {
        return { jobId: active.rows[0].id, status: active.rows[0].status };
      }
      const jobId = randomUUID();
      await client.query(
        `INSERT INTO "ManualJob"
           ("id", "type", "status", "scope", "requestedBy", "correlationId")
         VALUES ($1, $2, 'QUEUED', $3::jsonb, $4, $5)`,
        [jobId, input.type, json(scope), input.actor, input.correlationId],
      );
      return { jobId, status: 'QUEUED' };
    });
  }

  public async getJob(jobId: string) {
    const result = await this.pool.query(
      `SELECT "id" AS "jobId", "type", "status"::text, "scope", "requestedAt",
              "requestedBy", "correlationId", "startedAt", "finishedAt", "result", "errorCode"
         FROM "ManualJob" WHERE "id" = $1`,
      [jobId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new AdminApiError(404, 'JOB_NOT_FOUND', 'Job not found.');
    return serialize(row);
  }

  public async listDecisions(
    query: ListQuery & {
      action?: string;
      campaignId?: string;
      targetId?: string;
    },
  ) {
    const page = pageFrom(query);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const action = enumFilter(query.action, [
      'NO_CHANGE',
      'INCREASE',
      'DECREASE',
      'RESTORE_ABSENT_OVERRIDE',
      'BLOCKED',
    ]);
    const result = await this.pool.query(
      `SELECT d."id", d."targetId", t."campaignId", d."action"::text,
              d."currentBidMinor", d."proposedBidMinor", d."boundedBidMinor",
              d."outcomeReasonCode", d."guardrailCodes", d."policyVersion",
              d."algorithmVersion", d."decisionInputChecksum", d."createdAt",
              q."status"::text AS "queueStatus"
         FROM "BidDecision" d
         JOIN "CampaignTarget" t ON t."id" = d."targetId"
         LEFT JOIN "DecisionQueueItem" q ON q."decisionId" = d."id"
        WHERE ($1::uuid IS NULL OR t."campaignId" = $1)
          AND ($2::uuid IS NULL OR d."targetId" = $2)
          AND ($3::text IS NULL OR d."action"::text = $3)
          AND ($4::timestamptz IS NULL OR (d."createdAt", d."id") > ($4, $5::uuid))
        ORDER BY d."createdAt", d."id" LIMIT $6`,
      [campaignId, targetId, action, page.cursorAt, page.cursorId, page.limit + 1],
    );
    return listResponse(result.rows, page.limit);
  }

  public async getDecision(decisionId: string) {
    const result = await this.pool.query(
      `SELECT d.*, q."status"::text AS "queueStatus", q."failureClassification",
              q."manualRetryBlocked", q."version" AS "queueVersion",
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', i."id", 'attemptId', i."attemptId", 'attemptNumber', i."attemptNumber",
                'status', i."status"::text, 'httpStatus', i."httpStatus",
                'errorCode', i."errorCode", 'reconciliationStatus', i."reconciliationStatus"::text,
                'reconciledAt', i."reconciledAt"
              ) ORDER BY i."attemptNumber") FILTER (WHERE i."id" IS NOT NULL), '[]') AS "attempts"
         FROM "BidDecision" d
         LEFT JOIN "DecisionQueueItem" q ON q."decisionId" = d."id"
         LEFT JOIN "WbWriteAttemptItem" i ON i."decisionId" = d."id"
        WHERE d."id" = $1 GROUP BY d."id", q."id"`,
      [decisionId],
    );
    const row = result.rows[0];
    if (row === undefined)
      throw new AdminApiError(404, 'DECISION_NOT_FOUND', 'Decision not found.');
    return serialize(row);
  }

  public async listFailures(query: ListQuery & { classification?: string }) {
    const page = pageFrom(query);
    const classification = codeFilter(query.classification);
    const result = await this.pool.query(
      `SELECT q."decisionId", q."status"::text, q."failureClassification",
              q."lastErrorCode", q."lastHttpStatus", q."attemptCount",
              q."manualRetryBlocked", q."version", d."createdAt", q."id"
         FROM "DecisionQueueItem" q JOIN "BidDecision" d ON d."id" = q."decisionId"
        WHERE q."status" = 'FAILED'
          AND ($1::text IS NULL OR q."failureClassification" = $1)
          AND ($2::timestamptz IS NULL OR (d."createdAt", q."id") > ($2, $3::uuid))
        ORDER BY d."createdAt", q."id" LIMIT $4`,
      [classification, page.cursorAt, page.cursorId, page.limit + 1],
    );
    return listResponse(result.rows, page.limit);
  }

  public async retryFailure(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly decisionId: string;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
    readonly reason: string;
  }) {
    const version = await this.writes.retryFailure({
      ...input,
      idempotencyScope: `POST:/api/v1/queue/failures/${input.decisionId}/retry`,
    });
    return { decisionId: input.decisionId, status: 'RETRY_WAIT', version: version.toString() };
  }

  public async listAudit(
    query: ListQuery & {
      action?: string;
      actor?: string;
      campaignId?: string;
      correlationId?: string;
      createdFrom?: string;
      createdTo?: string;
      entityId?: string;
      entityType?: string;
      targetId?: string;
    },
  ) {
    const page = pageFrom(query);
    const correlationId = uuidFilter(query.correlationId);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const createdFrom = optionalDateFilter(query.createdFrom);
    const createdTo = optionalDateFilter(query.createdTo);
    if (createdFrom !== null && createdTo !== null && createdFrom >= createdTo) {
      throw new AdminApiError(422, 'INVALID_DATE_RANGE', 'createdFrom must precede createdTo.');
    }
    const result = await this.pool.query(
      `SELECT "id", "actor", "action", "entityType", "entityId", "before", "after",
              "correlationId", "causationId", "createdAt"
         FROM "AuditEvent"
        WHERE ($1::text IS NULL OR "actor" = $1)
          AND ($2::text IS NULL OR "action" = $2)
          AND ($3::text IS NULL OR "entityType" = $3)
          AND ($4::text IS NULL OR "entityId" = $4)
          AND ($5::uuid IS NULL OR "correlationId" = $5)
          AND ($6::uuid IS NULL OR "entityId" = $6::text
            OR "entityId" IN (
              SELECT t."id"::text FROM "CampaignTarget" t WHERE t."campaignId" = $6
              UNION
              SELECT d."id"::text FROM "BidDecision" d
                JOIN "CampaignTarget" t ON t."id" = d."targetId"
               WHERE t."campaignId" = $6
            ))
          AND ($7::uuid IS NULL OR "entityId" = $7::text
            OR "entityId" IN (
              SELECT d."id"::text FROM "BidDecision" d WHERE d."targetId" = $7
            ))
          AND ($8::timestamptz IS NULL OR "createdAt" >= $8)
          AND ($9::timestamptz IS NULL OR "createdAt" < $9)
          AND ($10::timestamptz IS NULL OR ("createdAt", "id") > ($10, $11::uuid))
        ORDER BY "createdAt", "id" LIMIT $12`,
      [
        query.actor ?? null,
        query.action ?? null,
        query.entityType ?? null,
        query.entityId ?? null,
        correlationId,
        campaignId,
        targetId,
        createdFrom,
        createdTo,
        page.cursorAt,
        page.cursorId,
        page.limit + 1,
      ],
    );
    return listResponse(result.rows, page.limit);
  }

  private async transactionalMutation(
    input: MutationContext,
    mutation: (client: PoolClient, audit: { before?: unknown }) => Promise<unknown>,
  ) {
    const scope = input.scope;
    const requestChecksum = checksum({
      dto: input.dto,
      expectedVersion: input.expectedVersion,
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockIdempotencyKey(client, scope, input.idempotencyKey);
      const replay = await client.query<{ requestChecksum: string; responseBody: unknown }>(
        `SELECT "requestChecksum", "responseBody" FROM "IdempotencyRecord"
          WHERE "scope" = $1 AND "idempotencyKey" = $2 FOR UPDATE`,
        [scope, input.idempotencyKey],
      );
      if (replay.rows[0] !== undefined) {
        if (replay.rows[0].requestChecksum !== requestChecksum)
          throw new Error('IDEMPOTENCY_KEY_REUSED');
        await client.query('COMMIT');
        return serialize(replay.rows[0].responseBody);
      }
      const audit: { before?: unknown } = {};
      const body = await mutation(client, audit);
      await client.query(
        `INSERT INTO "AuditEvent"
           ("id", "actor", "action", "entityType", "entityId",
            "before", "after", "correlationId")
         VALUES ($1, $2, $3, 'AdminMutation', $4, $5::jsonb, $6::jsonb, $7)`,
        [
          randomUUID(),
          input.actor,
          scope,
          scope,
          audit.before === undefined ? null : json(audit.before),
          json({
            body,
            changeReason:
              typeof input.dto === 'object' && input.dto !== null && 'changeReason' in input.dto
                ? input.dto.changeReason
                : null,
            idempotencyKey: input.idempotencyKey,
          }),
          input.correlationId,
        ],
      );
      await client.query(
        `INSERT INTO "IdempotencyRecord"
           ("id", "scope", "idempotencyKey", "requestChecksum", "responseStatus",
            "responseHeaders", "responseBody", "expiresAt")
         VALUES ($1, $2, $3, $4, 200, '{}'::jsonb, $5::jsonb, NOW() + INTERVAL '400 days')`,
        [randomUUID(), scope, input.idempotencyKey, requestChecksum, json(body)],
      );
      await client.query('COMMIT');
      return serialize(body);
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockIdempotencyKey(client: PoolClient, scope: string, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `admin-idempotency:${scope}:${key}`,
  ]);
}

/** Optional cursor and page-size query parameters accepted by list endpoints. */
export interface ListQuery {
  readonly cursor?: string;
  readonly limit?: string;
}

interface MutationContext {
  readonly actor: string;
  readonly correlationId: string;
  readonly dto: unknown;
  readonly expectedVersion: bigint;
  readonly idempotencyKey: string;
  readonly scope: string;
}

function pageFrom(query: ListQuery) {
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new AdminApiError(422, 'INVALID_LIMIT', 'limit must be in range 1..500.');
  if (query.cursor === undefined) return { cursorAt: null, cursorId: null, limit };
  try {
    const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as {
      at?: string;
      id: string;
    };
    const cursorId = uuidFilter(cursor.id);
    if (cursorId === null) throw new Error('INVALID_CURSOR');
    const cursorAt = optionalDateFilter(cursor.at);
    if (cursorAt === null) throw new Error('INVALID_CURSOR');
    return { cursorAt, cursorId, limit };
  } catch {
    throw new AdminApiError(422, 'INVALID_CURSOR', 'Cursor is malformed.');
  }
}

function listResponse(rows: readonly Record<string, unknown>[], limit: number, idKey = 'id') {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? Buffer.from(
          JSON.stringify({
            at:
              last.createdAt instanceof Date
                ? last.createdAt.toISOString()
                : (last.createdAt ?? undefined),
            id: last[idKey],
          }),
        ).toString('base64url')
      : null;
  return { items: serialize(items), nextCursor };
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  }
  const date = new Date(value);
  if (date.toString() === 'Invalid Date')
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  return date;
}

function parseSignedBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new AdminApiError(422, 'VALUE_OUT_OF_BIGINT_RANGE', 'Expected a signed BIGINT string.');
  }
}

function enumFilter<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (value === undefined) return null;
  if (!allowed.includes(value as T)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Filter value is not supported.');
  }
  return value as T;
}

function codeFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Classification filter is malformed.');
  }
  return value;
}

function uuidFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'UUID filter is malformed.');
  }
  return value;
}

function optionalDateFilter(value: string | undefined): Date | null {
  if (value === undefined) return null;
  return parseDate(value);
}

function economicsEtag(version: unknown): string {
  return `"product-economics-${String(version)}"`;
}

function versionEtag(prefix: string, version: unknown): string {
  return `"${prefix}-${String(version)}"`;
}

function jobScope(dto: ManualJobDto) {
  return {
    campaignIds: [...(dto.campaignIds ?? [])].sort(),
    dataKinds: [...(dto.dataKinds ?? [])].sort(),
    targetIds: [...(dto.targetIds ?? [])].sort(),
  };
}

function checksum(value: unknown): string {
  const canonical = canonicalize(serialize(value));
  if (canonical === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(canonical).digest('hex');
}

function json(value: unknown): string {
  return JSON.stringify(serialize(value));
}

function serialize(value: unknown): any {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

/**
 * Parses a resource ETag into its optimistic-concurrency version.
 *
 * @param ifMatch - Value of the `If-Match` header.
 * @param prefix - Resource prefix used in the ETag format.
 * @param allowNoneMatch - Whether an `If-None-Match: *` create precondition is accepted.
 * @param ifNoneMatch - Value of the `If-None-Match` header.
 * @returns Parsed non-negative database version.
 * @throws {AdminApiError} When the conditional headers are missing or malformed.
 */
export function parseExpectedVersion(
  ifMatch: string | undefined,
  prefix: string,
  allowNoneMatch = false,
  ifNoneMatch?: string,
): bigint {
  if (allowNoneMatch && ifNoneMatch === '*') return 0n;
  if (ifMatch === undefined)
    throw new AdminApiError(428, 'PRECONDITION_REQUIRED', 'A conditional header is required.');
  const match = new RegExp(`^"${prefix}-([0-9]+)"$`, 'u').exec(ifMatch);
  if (match?.[1] === undefined)
    throw new AdminApiError(412, 'VERSION_MISMATCH', 'ETag format does not match this resource.');
  return BigInt(match[1]);
}

/**
 * Requires a non-empty idempotency key for a durable administrative mutation.
 *
 * @param value - Request `Idempotency-Key` header value.
 * @returns Validated key unchanged.
 * @throws {AdminApiError} When the key is absent or empty.
 */
export function requireIdempotency(value: string | undefined): string {
  if (value === undefined || value.length < 1)
    throw new AdminApiError(428, 'PRECONDITION_REQUIRED', 'Idempotency-Key is required.');
  return value;
}
