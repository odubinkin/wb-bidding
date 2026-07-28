/* eslint-disable jsdoc/check-param-names, jsdoc/require-jsdoc, jsdoc/require-param */
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { normalizeCanonical, scopedChecksum } from './checksum.js';
import { uuidV7 } from './ids.js';
import { validateDecisionPolicy } from './policy.js';
import type { DecisionPolicy, DecisionResult } from './types.js';

/**
 * Conditional immutable product-economics mutation.
 */
export interface EconomicsMutation {
  readonly actor: string;
  readonly contributionMinor: bigint;
  readonly correlationId: string;
  readonly effectiveFrom: Date;
  readonly expectedCurrentVersion: bigint;
  readonly mutationKey: string;
  readonly nmId: bigint;
  readonly source: 'IMPORT' | 'MANUAL';
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/**
 * One asynchronous economics import row.
 */
export interface EconomicsImportRow {
  readonly contributionMinor: bigint;
  readonly effectiveFrom: Date;
  readonly expectedCurrentVersion: bigint;
  readonly nmId: bigint;
  readonly rowId: string;
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/**
 * PostgreSQL persistence for immutable economics, policies, snapshots, and decisions.
 */
export class DecisionRepository {
  /**
   * Creates a repository.
   *
   * @param pool - Deployment PostgreSQL pool.
   */
  public constructor(private readonly pool: Pool) {}

  /**
   * Creates or idempotently replays the next economics version.
   *
   * @param mutation - Versioned conditional mutation.
   * @returns Version identity.
   */
  public async createEconomicsVersion(
    mutation: EconomicsMutation,
  ): Promise<{ readonly created: boolean; readonly id: string; readonly version: bigint }> {
    validateEconomicsMutation(mutation);
    const checksum = scopedChecksum('product-economics-v1', {
      contributionMinor: mutation.contributionMinor,
      effectiveFrom: mutation.effectiveFrom,
      nmId: mutation.nmId,
      source: mutation.source,
      sourceReference: mutation.sourceReference ?? null,
      sourceUpdatedAt: mutation.sourceUpdatedAt ?? null,
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('economics:' || $1, 0))", [
        mutation.nmId.toString(),
      ]);
      const replay = await client.query<{
        id: string;
        inputChecksum: string;
        version: string;
      }>(
        `SELECT "id", "inputChecksum", "version" FROM "ProductEconomics"
          WHERE "mutationKey" = $1`,
        [mutation.mutationKey],
      );
      const replayed = replay.rows[0];
      if (replayed !== undefined) {
        if (replayed.inputChecksum !== checksum) {
          throw new Error('IDEMPOTENCY_KEY_REUSED');
        }
        await client.query('COMMIT');
        return Object.freeze({
          created: false,
          id: replayed.id,
          version: BigInt(replayed.version),
        });
      }
      const current = await client.query<{ id: string; version: string }>(
        `SELECT "id", "version" FROM "ProductEconomics"
          WHERE "nmId" = $1 AND "effectiveTo" IS NULL FOR UPDATE`,
        [mutation.nmId.toString()],
      );
      const actualVersion = BigInt(current.rows[0]?.version ?? '0');
      if (actualVersion !== mutation.expectedCurrentVersion) {
        throw new Error(
          `VERSION_CONFLICT expected=${mutation.expectedCurrentVersion.toString()} actual=${actualVersion.toString()}`,
        );
      }
      if (current.rows[0] !== undefined) {
        await client.query(`UPDATE "ProductEconomics" SET "effectiveTo" = $2 WHERE "id" = $1`, [
          current.rows[0].id,
          mutation.effectiveFrom,
        ]);
      }
      const id = randomUUID();
      const version = actualVersion + 1n;
      await client.query(
        `INSERT INTO "ProductEconomics"
           ("id", "nmId", "effectiveFrom", "expectedContributionBeforeAdsMinor",
            "source", "sourceUpdatedAt", "sourceReference", "version", "mutationKey",
            "inputChecksum", "createdByActor")
         VALUES ($1, $2, $3, $4, $5::"ProductEconomicsSource", $6, $7, $8, $9, $10, $11)`,
        [
          id,
          mutation.nmId.toString(),
          mutation.effectiveFrom,
          mutation.contributionMinor.toString(),
          mutation.source,
          mutation.sourceUpdatedAt ?? null,
          mutation.sourceReference ?? null,
          version.toString(),
          mutation.mutationKey,
          checksum,
          mutation.actor,
        ],
      );
      await appendAudit(
        client,
        mutation.actor,
        'PRODUCT_ECONOMICS_VERSION_CREATED',
        id,
        mutation.correlationId,
        {
          contributionMinor: mutation.contributionMinor,
          nmId: mutation.nmId,
          version,
        },
      );
      await client.query('COMMIT');
      return Object.freeze({ created: true, id, version });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enqueues an idempotent import of up to 10,000 unique articles.
   *
   * @param request - Batch request.
   * @returns Existing or created import.
   */
  public async enqueueEconomicsImport(request: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dryRun: boolean;
    readonly idempotencyKey: string;
    readonly idempotencyScope: string;
    readonly rows: readonly EconomicsImportRow[];
  }): Promise<{ readonly created: boolean; readonly importId: string }> {
    validateImportRequest(request.rows);
    const requestChecksum = scopedChecksum('product-economics-import-v1', {
      dryRun: request.dryRun,
      rows: request.rows,
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ id: string; requestChecksum: string }>(
        `SELECT "id", "requestChecksum" FROM "ProductEconomicsImport"
          WHERE "idempotencyScope" = $1 AND "idempotencyKey" = $2 FOR UPDATE`,
        [request.idempotencyScope, request.idempotencyKey],
      );
      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].requestChecksum !== requestChecksum) {
          throw new Error('IDEMPOTENCY_KEY_REUSED');
        }
        await client.query('COMMIT');
        return Object.freeze({ created: false, importId: existing.rows[0].id });
      }
      const importId = randomUUID();
      await client.query(
        `INSERT INTO "ProductEconomicsImport"
           ("id", "status", "dryRun", "idempotencyScope", "idempotencyKey",
            "requestChecksum", "totalItems", "createdByActor", "correlationId")
         VALUES ($1, 'QUEUED', $2, $3, $4, $5, $6, $7, $8)`,
        [
          importId,
          request.dryRun,
          request.idempotencyScope,
          request.idempotencyKey,
          requestChecksum,
          request.rows.length,
          request.actor,
          request.correlationId,
        ],
      );
      for (const row of request.rows) {
        await client.query(
          `INSERT INTO "ProductEconomicsImportItem"
             ("id", "importId", "rowId", "nmId", "normalizedInput", "rowChecksum",
              "status", "expectedCurrentVersion")
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'PENDING', $7)`,
          [
            randomUUID(),
            importId,
            row.rowId,
            row.nmId.toString(),
            JSON.stringify(normalizeCanonical(row)),
            scopedChecksum('product-economics-import-row-v1', row),
            row.expectedCurrentVersion.toString(),
          ],
        );
      }
      await client.query('COMMIT');
      return Object.freeze({ created: true, importId });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Claims and processes one import with per-row partial success.
   *
   * @param workerId - Stable lease owner.
   * @returns Processed import identifier or null.
   */
  public async processNextEconomicsImport(workerId: string): Promise<string | null> {
    const claimed = await this.claimImport(workerId);
    if (claimed === null) {
      return null;
    }
    const items = await this.pool.query<ImportItemRow>(
      `SELECT "id", "rowId", "nmId", "normalizedInput", "expectedCurrentVersion"
         FROM "ProductEconomicsImportItem" WHERE "importId" = $1 ORDER BY "rowId"`,
      [claimed.id],
    );
    let validated = 0;
    let succeeded = 0;
    let failed = 0;
    for (const item of items.rows) {
      try {
        const mutation = importMutation(claimed, item);
        validateEconomicsMutation(mutation);
        if (claimed.dryRun) {
          validated += 1;
          await this.pool.query(
            `UPDATE "ProductEconomicsImportItem" SET "status" = 'VALIDATED' WHERE "id" = $1`,
            [item.id],
          );
        } else {
          const created = await this.createEconomicsVersion(mutation);
          succeeded += 1;
          await this.pool.query(
            `UPDATE "ProductEconomicsImportItem"
                SET "status" = 'SUCCEEDED', "createdVersion" = $2 WHERE "id" = $1`,
            [item.id, created.version.toString()],
          );
        }
      } catch (error: unknown) {
        failed += 1;
        await this.pool.query(
          `UPDATE "ProductEconomicsImportItem"
              SET "status" = 'FAILED', "errorCode" = $2, "errorDetail" = $3 WHERE "id" = $1`,
          [item.id, classifyImportError(error), safeMessage(error)],
        );
      }
    }
    await this.pool.query(
      `UPDATE "ProductEconomicsImport"
          SET "status" = $2::"ImportStatus", "processedItems" = $3,
              "validatedItems" = $4, "succeededItems" = $5, "failedItems" = $6,
              "finishedAt" = NOW(), "leaseOwner" = NULL, "leaseUntil" = NULL
        WHERE "id" = $1`,
      [
        claimed.id,
        failed === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS',
        items.rows.length,
        validated,
        succeeded,
        failed,
      ],
    );
    return claimed.id;
  }

  /**
   * Creates a new policy version and closes the previous validity interval.
   *
   * @param request - Scoped policy mutation.
   * @returns New policy identity.
   */
  public async createPolicyVersion(request: {
    readonly actor: string;
    readonly campaignId: string | null;
    readonly configuration: DecisionPolicy;
    readonly correlationId: string;
    readonly scope: 'CAMPAIGN' | 'DEPLOYMENT' | 'TARGET';
    readonly targetId: string | null;
    readonly validFrom: Date;
  }): Promise<{ readonly id: string; readonly version: bigint }> {
    validateDecisionPolicy(request.configuration);
    validatePolicyScope(request);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('policy:' || $1, 0))", [
        `${request.scope}:${request.campaignId ?? ''}:${request.targetId ?? ''}`,
      ]);
      const current = await client.query<{ id: string; version: string }>(
        `SELECT "id", "version" FROM "BiddingPolicy"
          WHERE "scope" = $1::"PolicyScope"
            AND "campaignId" IS NOT DISTINCT FROM $2
            AND "targetId" IS NOT DISTINCT FROM $3
            AND "validTo" IS NULL FOR UPDATE`,
        [request.scope, request.campaignId, request.targetId],
      );
      if (current.rows[0] !== undefined) {
        await client.query(`UPDATE "BiddingPolicy" SET "validTo" = $2 WHERE "id" = $1`, [
          current.rows[0].id,
          request.validFrom,
        ]);
      }
      const version = BigInt(current.rows[0]?.version ?? '0') + 1n;
      const id = randomUUID();
      const checksum = scopedChecksum('bidding-policy-v1', request.configuration);
      await client.query(
        `INSERT INTO "BiddingPolicy"
           ("id", "scope", "campaignId", "targetId", "executionMode", "configuration",
            "enabled", "version", "validFrom", "inputChecksum", "createdByActor")
         VALUES ($1, $2::"PolicyScope", $3, $4, $5::"ExecutionMode", $6::jsonb,
                 true, $7, $8, $9, $10)`,
        [
          id,
          request.scope,
          request.campaignId,
          request.targetId,
          request.configuration.executionMode,
          JSON.stringify(normalizeCanonical(request.configuration)),
          version.toString(),
          request.validFrom,
          checksum,
          request.actor,
        ],
      );
      await appendAudit(
        client,
        request.actor,
        'BIDDING_POLICY_VERSION_CREATED',
        id,
        request.correlationId,
        {
          checksum,
          scope: request.scope,
          version,
        },
      );
      await client.query('COMMIT');
      return Object.freeze({ id, version });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolves target, campaign, then deployment policy priority.
   *
   * @param targetId - Target UUID.
   * @param campaignId - Campaign UUID.
   * @param at - Resolution instant.
   * @returns Stored policy row or null.
   */
  public async resolvePolicy(
    targetId: string,
    campaignId: string,
    at: Date,
  ): Promise<{
    readonly configuration: unknown;
    readonly id: string;
    readonly version: bigint;
  } | null> {
    const result = await this.pool.query<{
      configuration: unknown;
      id: string;
      version: string;
    }>(
      `SELECT "id", "version", "configuration" FROM "BiddingPolicy"
        WHERE "enabled" = true AND "validFrom" <= $3
          AND ("validTo" IS NULL OR "validTo" > $3)
          AND (("scope" = 'TARGET' AND "targetId" = $1)
            OR ("scope" = 'CAMPAIGN' AND "campaignId" = $2)
            OR "scope" = 'DEPLOYMENT')
        ORDER BY CASE "scope" WHEN 'TARGET' THEN 1 WHEN 'CAMPAIGN' THEN 2 ELSE 3 END,
                 "version" DESC LIMIT 1`,
      [targetId, campaignId, at],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : Object.freeze({
          configuration: row.configuration,
          id: row.id,
          version: BigInt(row.version),
        });
  }

  /**
   * Persists a metric snapshot, semantically deduplicated decision, and optional queue item.
   *
   * @param request - Immutable references and pure result.
   * @returns Existing or created decision.
   */
  public async persistDecision(request: {
    readonly calculatedAt: Date;
    readonly currentBidMinor: bigint;
    readonly economicsId: string;
    readonly economicsVersion: bigint;
    readonly expectedContributionMinor: bigint;
    readonly periodEnd: string;
    readonly periodStart: string;
    readonly policyId: string;
    readonly policyVersion: bigint;
    readonly result: DecisionResult;
    readonly targetId: string;
  }): Promise<{ readonly created: boolean; readonly decisionId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('decision:' || $1, 0))", [
        request.targetId,
      ]);
      const existingMetric = await client.query<{ id: string }>(
        `SELECT "id" FROM "MetricSnapshot"
          WHERE "targetId" = $1 AND "inputSnapshotChecksum" = $2`,
        [request.targetId, request.result.explanation.inputSnapshotChecksum],
      );
      let metricId = existingMetric.rows[0]?.id;
      if (metricId === undefined) {
        metricId = randomUUID();
        await client.query(
          `INSERT INTO "MetricSnapshot"
           ("id", "targetId", "productEconomicsId", "productEconomicsVersion",
            "expectedContributionBeforeAdsMinor", "policyId", "periodStart", "periodEnd",
            "metrics", "candidateEstimates", "completenessFlags", "inputSnapshotChecksum",
            "inputSnapshotSchema", "algorithmVersion", "calculatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::jsonb, $10::jsonb,
                 $11, $12, 'input-snapshot-v1', 'rules-v1', $13)`,
          [
            metricId,
            request.targetId,
            request.economicsId,
            request.economicsVersion.toString(),
            request.expectedContributionMinor.toString(),
            request.policyId,
            request.periodStart,
            request.periodEnd,
            json({ buckets: request.result.explanation.buckets }),
            json(request.result.explanation.candidates),
            request.result.guardrailCodes,
            request.result.explanation.inputSnapshotChecksum,
            request.calculatedAt,
          ],
        );
      }
      const existing = await client.query<DecisionReplayRow>(
        `SELECT "id", "action", "boundedBidMinor", "outcomeReasonCode"
           FROM "BidDecision" WHERE "decisionInputChecksum" = $1 FOR UPDATE`,
        [request.result.decisionInputChecksum],
      );
      const replay = existing.rows[0];
      if (replay !== undefined) {
        assertSameDecision(replay, request.result);
        await client.query('COMMIT');
        return Object.freeze({ created: false, decisionId: replay.id });
      }
      await client.query(
        `UPDATE "DecisionQueueItem" q SET "status" = 'SUPERSEDED'
           FROM "BidDecision" d
          WHERE q."decisionId" = d."id" AND d."targetId" = $1
            AND q."status" IN ('QUEUED', 'RETRY_WAIT')`,
        [request.targetId],
      );
      const decisionId = uuidV7(request.calculatedAt);
      await client.query(
        `INSERT INTO "BidDecision"
           ("id", "targetId", "action", "currentBidMinor", "proposedBidMinor",
            "boundedBidMinor", "strategyReasonCode", "outcomeReasonCode", "guardrailCodes",
            "explanation", "metricSnapshotId", "policyVersion", "algorithmVersion",
            "decisionInputChecksum", "createdAt")
         VALUES ($1, $2, $3::"DecisionAction", $4, $5, $6, $7, $8, $9, $10::jsonb,
                 $11, $12, 'rules-v1', $13, $14)`,
        [
          decisionId,
          request.targetId,
          request.result.action,
          request.currentBidMinor.toString(),
          request.result.proposedBidMinor?.toString() ?? null,
          request.result.boundedBidMinor?.toString() ?? null,
          request.result.strategyReasonCode,
          request.result.outcomeReasonCode,
          request.result.guardrailCodes,
          json(request.result.explanation),
          metricId,
          request.policyVersion.toString(),
          request.result.decisionInputChecksum,
          request.calculatedAt,
        ],
      );
      if (request.result.queueEligible) {
        await client.query(
          `INSERT INTO "DecisionQueueItem"
             ("id", "decisionId", "status", "priority", "availableAt")
           VALUES ($1, $2, 'QUEUED', 100, $3)`,
          [randomUUID(), decisionId, request.calculatedAt],
        );
      }
      await client.query('COMMIT');
      return Object.freeze({ created: true, decisionId });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async claimImport(workerId: string): Promise<ClaimedImport | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('product-economics-import-worker', 0))",
      );
      const selected = await client.query<{
        correlationId: string;
        createdByActor: string;
        dryRun: boolean;
        id: string;
      }>(
        `SELECT "id", "dryRun", "createdByActor", "correlationId"
           FROM "ProductEconomicsImport" WHERE "status" = 'QUEUED'
          ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = selected.rows[0];
      if (row === undefined) {
        await client.query('COMMIT');
        return null;
      }
      await client.query(
        `UPDATE "ProductEconomicsImport"
            SET "status" = 'PROCESSING', "startedAt" = NOW(), "leaseOwner" = $2,
                "leaseUntil" = NOW() + INTERVAL '5 minutes', "attemptCount" = "attemptCount" + 1
          WHERE "id" = $1`,
        [row.id, workerId],
      );
      await client.query('COMMIT');
      return Object.freeze({
        actor: row.createdByActor,
        correlationId: row.correlationId,
        dryRun: row.dryRun,
        id: row.id,
      });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

interface ClaimedImport {
  readonly actor: string;
  readonly correlationId: string;
  readonly dryRun: boolean;
  readonly id: string;
}

interface ImportItemRow {
  readonly expectedCurrentVersion: string;
  readonly id: string;
  readonly nmId: string;
  readonly normalizedInput: {
    readonly contributionMinor: string;
    readonly effectiveFrom: string;
    readonly sourceReference?: string;
    readonly sourceUpdatedAt?: string;
  };
  readonly rowId: string;
}

interface DecisionReplayRow {
  readonly action: string;
  readonly boundedBidMinor: string | null;
  readonly id: string;
  readonly outcomeReasonCode: string;
}

function importMutation(claimed: ClaimedImport, item: ImportItemRow): EconomicsMutation {
  return {
    actor: claimed.actor,
    contributionMinor: BigInt(item.normalizedInput.contributionMinor),
    correlationId: claimed.correlationId,
    effectiveFrom: new Date(item.normalizedInput.effectiveFrom),
    expectedCurrentVersion: BigInt(item.expectedCurrentVersion),
    mutationKey: `import:${claimed.id}:${item.rowId}`,
    nmId: BigInt(item.nmId),
    source: 'IMPORT',
    ...(item.normalizedInput.sourceReference === undefined
      ? {}
      : { sourceReference: item.normalizedInput.sourceReference }),
    ...(item.normalizedInput.sourceUpdatedAt === undefined
      ? {}
      : { sourceUpdatedAt: new Date(item.normalizedInput.sourceUpdatedAt) }),
  };
}

function validateEconomicsMutation(mutation: EconomicsMutation): void {
  if (
    mutation.nmId <= 0n ||
    mutation.expectedCurrentVersion < 0n ||
    mutation.effectiveFrom.toString() === 'Invalid Date' ||
    mutation.mutationKey.length < 1
  ) {
    throw new Error('INVALID_PRODUCT_ECONOMICS');
  }
}

function validateImportRequest(rows: readonly EconomicsImportRow[]): void {
  if (rows.length < 1 || rows.length > 10_000) {
    throw new Error('IMPORT_SIZE_OUT_OF_RANGE');
  }
  if (new Set(rows.map((row) => row.rowId)).size !== rows.length) {
    throw new Error('DUPLICATE_ROW_ID');
  }
  if (new Set(rows.map((row) => row.nmId.toString())).size !== rows.length) {
    throw new Error('DUPLICATE_NM_ID');
  }
  for (const row of rows) {
    validateEconomicsMutation({
      actor: 'validation',
      contributionMinor: row.contributionMinor,
      correlationId: '00000000-0000-0000-0000-000000000000',
      effectiveFrom: row.effectiveFrom,
      expectedCurrentVersion: row.expectedCurrentVersion,
      mutationKey: row.rowId,
      nmId: row.nmId,
      source: 'IMPORT',
    });
  }
}

function validatePolicyScope(request: {
  readonly campaignId: string | null;
  readonly scope: 'CAMPAIGN' | 'DEPLOYMENT' | 'TARGET';
  readonly targetId: string | null;
}): void {
  const valid =
    (request.scope === 'DEPLOYMENT' && request.campaignId === null && request.targetId === null) ||
    (request.scope === 'CAMPAIGN' && request.campaignId !== null && request.targetId === null) ||
    (request.scope === 'TARGET' && request.campaignId === null && request.targetId !== null);
  if (!valid) {
    throw new Error('INVALID_POLICY_SCOPE');
  }
}

function assertSameDecision(existing: DecisionReplayRow, result: DecisionResult): void {
  if (
    existing.action !== result.action ||
    existing.boundedBidMinor !==
      (result.boundedBidMinor === null ? null : result.boundedBidMinor.toString()) ||
    existing.outcomeReasonCode !== result.outcomeReasonCode
  ) {
    throw new Error('DATA_INCONSISTENCY');
  }
}

async function appendAudit(
  client: PoolClient,
  actor: string,
  action: string,
  entityId: string,
  correlationId: string,
  after: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO "AuditEvent"
       ("id", "actor", "action", "entityType", "entityId", "after", "correlationId")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      randomUUID(),
      actor,
      action,
      action.startsWith('PRODUCT') ? 'ProductEconomics' : 'BiddingPolicy',
      entityId,
      json(after),
      correlationId,
    ],
  );
}

function json(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

function classifyImportError(error: unknown): string {
  const message = safeMessage(error);
  return message.startsWith('VERSION_CONFLICT')
    ? 'VERSION_CONFLICT'
    : message === 'IDEMPOTENCY_KEY_REUSED'
      ? 'IDEMPOTENCY_KEY_REUSED'
      : 'INVALID_PRODUCT_ECONOMICS';
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown import error';
}
