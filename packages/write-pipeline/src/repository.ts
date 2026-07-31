/* eslint-disable jsdoc/require-jsdoc */
import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import {
  createRawDatabaseClient,
  type DatabaseClient,
  type RawTransactionClient,
} from '@wb-bidder/database';

import { redactSecrets } from './redaction.js';
import { isSafeStableOldRetry, stateChecksum } from './state-machine.js';
import type {
  ClaimedQueueItem,
  DispatchResult,
  LiveBidState,
  PreparedWrite,
  ReconciliationObservation,
  ReconciliationWorkItem,
} from './types.js';

/** Stable primary key of the singleton deployment-level automation control row. */
export const DEPLOYMENT_CONTROL_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Transactional PostgreSQL persistence for the write and reconciliation lifecycle.
 */
export class WritePipelineRepository {
  private readonly pool;

  public constructor(database: DatabaseClient) {
    this.pool = createRawDatabaseClient(database);
  }

  public async claim(
    workerId: string,
    limit: number,
    leaseSeconds: number,
    selector?: {
      readonly action: 'DELETE' | 'SET';
      readonly targetKind: 'CARD' | 'CLUSTER';
    },
  ): Promise<readonly ClaimedQueueItem[]> {
    if (limit < 1 || limit > 500 || leaseSeconds < 5 || leaseSeconds > 900) {
      throw new Error('INVALID_CLAIM_BOUNDS');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ClaimRow>(
        `WITH candidates AS (
           SELECT q."id"
             FROM "DecisionQueueItem" q
             JOIN "BidDecision" d ON d."id" = q."decisionId"
             JOIN "CampaignTarget" candidate_target ON candidate_target."id" = d."targetId"
            WHERE q."status" IN ('QUEUED', 'RETRY_WAIT')
              AND q."availableAt" <= clock_timestamp()
              AND (q."leaseUntil" IS NULL OR q."leaseUntil" < clock_timestamp())
              AND ($4::text IS NULL OR candidate_target."targetKind"::text = $4)
              AND (
                $5::text IS NULL
                OR ($5 = 'DELETE' AND d."action" = 'RESTORE_ABSENT_OVERRIDE')
                OR ($5 = 'SET' AND d."action" IN ('INCREASE', 'DECREASE'))
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM "DecisionQueueItem" active_q
                  JOIN "BidDecision" active_d ON active_d."id" = active_q."decisionId"
                 WHERE active_d."targetId" = d."targetId"
                   AND active_q."id" <> q."id"
                   AND active_q."status" IN ('LEASED', 'SENT', 'VERIFY_WAIT')
              )
            ORDER BY q."priority" DESC, q."availableAt", q."id"
            FOR UPDATE OF q SKIP LOCKED
            LIMIT $1
         )
         UPDATE "DecisionQueueItem" q
            SET "status" = 'LEASED',
                "leaseOwner" = $2,
                "leaseUntil" = clock_timestamp() + make_interval(secs => $3),
                "version" = q."version" + 1
           FROM candidates selected, "BidDecision" d, "CampaignTarget" t, "Campaign" campaign
          WHERE q."id" = selected."id"
            AND d."id" = q."decisionId"
            AND t."id" = d."targetId"
            AND campaign."id" = t."campaignId"
         RETURNING q."id" AS "queueItemId", q."decisionId", d."targetId",
                   t."campaignId", t."nmId", t."normQueryWire",
                   t."placement"::text, t."targetKind"::text,
                   campaign."wbCampaignId", campaign."bidType"::text AS "campaignBidType",
                   campaign."paymentType"::text AS "campaignPaymentType",
                   q."priority", d."action"::text,
                   d."boundedBidMinor", q."attemptCount", d."policyVersion",
                   d."metricSnapshotId"`,
        [limit, workerId, leaseSeconds, selector?.targetKind ?? null, selector?.action ?? null],
      );
      await client.query('COMMIT');
      return Object.freeze(result.rows.map(toClaimed));
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async heartbeat(workerId: string, queueItemIds: readonly string[], leaseSeconds: number) {
    if (queueItemIds.length === 0) return 0;
    const result = await this.pool.query(
      `UPDATE "DecisionQueueItem"
          SET "leaseUntil" = NOW() + make_interval(secs => $3)
        WHERE "id" = ANY($1::uuid[]) AND "status" = 'LEASED' AND "leaseOwner" = $2`,
      [queueItemIds, workerId, leaseSeconds],
    );
    return result.rowCount ?? 0;
  }

  public async releaseLease(
    queueItemId: string,
    workerId: string,
    classification: string,
    retryAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "DecisionQueueItem"
          SET "status" = 'RETRY_WAIT', "availableAt" = $3, "leaseOwner" = NULL,
              "leaseUntil" = NULL, "failureClassification" = $4, "version" = "version" + 1
        WHERE "id" = $1 AND "leaseOwner" = $2 AND "status" = 'LEASED'`,
      [queueItemId, workerId, retryAt, classification],
    );
  }

  public async failLeased(
    queueItemId: string,
    workerId: string,
    code: string,
    classification: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "DecisionQueueItem"
          SET "status" = 'FAILED', "leaseOwner" = NULL, "leaseUntil" = NULL,
              "lastErrorCode" = $3, "failureClassification" = $4,
              "manualRetryBlocked" = $4 = ANY(ARRAY['AUTH','CAPABILITY','INVALID','SUPERSEDED']),
              "version" = "version" + 1
        WHERE "id" = $1 AND "leaseOwner" = $2 AND "status" = 'LEASED'`,
      [queueItemId, workerId, code, classification],
    );
  }

  public async prepare(input: {
    readonly workerId: string;
    readonly endpointKey: string;
    readonly method: string;
    readonly items: readonly { readonly item: ClaimedQueueItem; readonly live: LiveBidState }[];
    readonly visibilityDelayMs: number;
    readonly reconciliationDeadlineMs: number;
  }): Promise<PreparedWrite> {
    if (input.items.length === 0) throw new Error('EMPTY_WRITE_BATCH');
    const correlationId = randomUUID();
    const attemptId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await assertAutomationAllows(client, input.items);
      const requestDigest = input.items.map(({ item }) => ({
        action: item.action,
        bidMinor: item.bidMinor?.toString() ?? null,
        decisionId: item.decisionId,
      }));
      await client.query(
        `INSERT INTO "WbWriteAttempt"
           ("id", "endpointKey", "method", "correlationId", "requestChecksum", "batchSize",
            "status", "preparedAt", "preWriteReadAt", "preWriteStateChecksum",
            "preWriteSourceMarker", "requestDigest")
         VALUES ($1, $2, $3, $4, $5, $6, 'PREPARED', NOW(), $7, $8, $9, $10::jsonb)`,
        [
          attemptId,
          input.endpointKey,
          input.method,
          correlationId,
          checksum(requestDigest),
          input.items.length,
          oldestRead(input.items),
          checksum(input.items.map(({ live }) => stateChecksum(live))),
          input.items.map(({ live }) => live.sourceMarker).join(','),
          json(requestDigest),
        ],
      );
      const preparedItems = [];
      for (const [requestIndex, entry] of input.items.entries()) {
        const locked = await client.query<{ attemptCount: number }>(
          `SELECT "attemptCount" FROM "DecisionQueueItem"
            WHERE "id" = $1 AND "decisionId" = $2 AND "status" = 'LEASED'
              AND "leaseOwner" = $3 FOR UPDATE`,
          [entry.item.queueItemId, entry.item.decisionId, input.workerId],
        );
        if (locked.rows[0] === undefined) throw new Error('LEASE_LOST');
        const attemptNumber = locked.rows[0].attemptCount + 1;
        const attemptItemId = randomUUID();
        const desired = {
          bidMinor: entry.item.bidMinor?.toString() ?? null,
          explicit: entry.item.desiredBidState === 'EXPLICIT',
        };
        await client.query(
          `INSERT INTO "WbWriteAttemptItem"
             ("id", "attemptId", "decisionId", "requestIndex", "endpointTargetKey",
              "action", "desiredBidState", "sentBidMinor", "wireBidRaw", "attemptNumber",
              "status", "reconciliationStatus", "preWriteReadAt", "preWriteStateChecksum",
              "preWriteSourceMarker", "preWriteState", "desiredStateChecksum")
           VALUES ($1, $2, $3, $4, $5, $6::"WriteAction", $7::"DesiredBidState",
                   $8, $9, $10, 'PREPARED', 'NOT_REQUIRED', $11, $12, $13, $14::jsonb, $15)`,
          [
            attemptItemId,
            attemptId,
            entry.item.decisionId,
            requestIndex,
            entry.item.targetId,
            entry.item.action,
            entry.item.desiredBidState,
            entry.item.bidMinor?.toString() ?? null,
            entry.item.action === 'DELETE'
              ? (entry.live.bidMinor?.toString() ?? '')
              : (entry.item.bidMinor?.toString() ?? ''),
            attemptNumber,
            entry.live.observedAt,
            stateChecksum(entry.live),
            entry.live.sourceMarker,
            json(entry.live),
            checksum(desired),
          ],
        );
        preparedItems.push({
          attemptItemId,
          attemptNumber,
          decisionId: entry.item.decisionId,
          queueItemId: entry.item.queueItemId,
          requestIndex,
          targetId: entry.item.targetId,
        });
      }
      await client.query('COMMIT');
      return Object.freeze({
        attemptId,
        correlationId,
        items: Object.freeze(preparedItems),
      });
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async commitDispatch(
    prepared: PreparedWrite,
    workerId: string,
    visibilityDelayMs: number,
    reconciliationDeadlineMs: number,
    preWriteStateMaximumAgeMs: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const itemRows = await client.query<{ campaignId: string; targetId: string }>(
        `SELECT t."campaignId", d."targetId"
           FROM "WbWriteAttemptItem" i
           JOIN "BidDecision" d ON d."id" = i."decisionId"
           JOIN "CampaignTarget" t ON t."id" = d."targetId"
          WHERE i."attemptId" = $1 FOR UPDATE OF i`,
        [prepared.attemptId],
      );
      const targetIds = [...new Set(itemRows.rows.map((row) => row.targetId))].sort();
      for (const targetId of targetIds) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('decision:' || $1, 0))", [
          targetId,
        ]);
      }
      const superseded = await client.query<{ superseded: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM "WbWriteAttemptItem" i
             JOIN "BidDecision" current_decision ON current_decision."id" = i."decisionId"
             JOIN "BidDecision" newer
               ON newer."targetId" = current_decision."targetId"
              AND (
                newer."createdAt" > current_decision."createdAt"
                OR (
                  newer."createdAt" = current_decision."createdAt"
                  AND newer."id" > current_decision."id"
                )
              )
            WHERE i."attemptId" = $1
         ) AS "superseded"`,
        [prepared.attemptId],
      );
      if (superseded.rows[0]?.superseded === true) {
        throw new Error('DECISION_SUPERSEDED');
      }
      await assertAutomationAllows(
        client,
        itemRows.rows.map((row) => ({
          item: { campaignId: row.campaignId, targetId: row.targetId },
        })),
      );
      const attempt = await client.query(
        `UPDATE "WbWriteAttempt"
            SET "status" = 'DISPATCHING', "dispatchCommittedAt" = NOW()
          WHERE "id" = $1 AND "status" = 'PREPARED'
            AND "preWriteReadAt" >=
                clock_timestamp() - ($2 * INTERVAL '1 millisecond')`,
        [prepared.attemptId, preWriteStateMaximumAgeMs],
      );
      if (attempt.rowCount !== 1) {
        const current = await client.query<{ status: string; stale: boolean }>(
          `SELECT "status"::text,
                  "preWriteReadAt" <
                    clock_timestamp() - ($2 * INTERVAL '1 millisecond') AS "stale"
             FROM "WbWriteAttempt" WHERE "id" = $1`,
          [prepared.attemptId, preWriteStateMaximumAgeMs],
        );
        if (current.rows[0]?.stale === true) throw new Error('PREWRITE_STATE_STALE');
        throw new Error('ATTEMPT_NOT_PREPARED');
      }
      await client.query(
        `UPDATE "WbWriteAttemptItem" SET "status" = 'DISPATCHING',
                 "reconciliationStatus" = 'PENDING'
          WHERE "attemptId" = $1 AND "status" = 'PREPARED'`,
        [prepared.attemptId],
      );
      const queueUpdate = await client.query(
        `UPDATE "DecisionQueueItem" q
            SET "status" = 'SENT', "sentAt" = NOW(), "attemptCount" = i."attemptNumber",
                "leaseOwner" = NULL, "leaseUntil" = NULL,
                "nextVerificationAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
                "reconciliationDeadlineAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
                "stableReadChecksum" = NULL, "stableReadCount" = 0,
                "lastReconciliationReadAt" = NULL,
                "version" = q."version" + 1
           FROM "WbWriteAttemptItem" i
          WHERE i."attemptId" = $1 AND q."decisionId" = i."decisionId"
            AND q."status" = 'LEASED' AND q."leaseOwner" = $2`,
        [prepared.attemptId, workerId, visibilityDelayMs, reconciliationDeadlineMs],
      );
      if (queueUpdate.rowCount !== prepared.items.length) throw new Error('LEASE_LOST');
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async rejectPreparedNoDispatch(
    prepared: PreparedWrite,
    workerId: string,
    code: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const attempt = await client.query(
        `UPDATE "WbWriteAttempt"
            SET "status" = 'REJECTED', "completedAt" = NOW(),
                "errorClass" = 'NO_DISPATCH', "errorCode" = $2
          WHERE "id" = $1 AND "status" = 'PREPARED'`,
        [prepared.attemptId, code],
      );
      if (attempt.rowCount !== 1) throw new Error('ATTEMPT_NOT_PREPARED');
      await client.query(
        `UPDATE "WbWriteAttemptItem"
            SET "status" = 'REJECTED', "errorCode" = $2,
                "reconciliationStatus" = 'NOT_REQUIRED'
          WHERE "attemptId" = $1 AND "status" = 'PREPARED'`,
        [prepared.attemptId, code],
      );
      const queue = await client.query(
        `UPDATE "DecisionQueueItem" q
            SET "status" = CASE
                  WHEN $3 = 'DECISION_SUPERSEDED' THEN 'SUPERSEDED'::"DecisionQueueStatus"
                  ELSE 'RETRY_WAIT'::"DecisionQueueStatus"
                END,
                "availableAt" = CASE WHEN $3 = 'DECISION_SUPERSEDED'
                  THEN q."availableAt" ELSE NOW() END,
                "leaseOwner" = NULL, "leaseUntil" = NULL,
                "failureClassification" = CASE WHEN $3 = 'DECISION_SUPERSEDED'
                  THEN 'SUPERSEDED' ELSE 'SAFE_NO_DISPATCH' END,
                "manualRetryBlocked" = $3 = 'DECISION_SUPERSEDED',
                "lastErrorCode" = $3, "version" = q."version" + 1
           FROM "WbWriteAttemptItem" i
          WHERE i."attemptId" = $1 AND q."decisionId" = i."decisionId"
            AND q."status" = 'LEASED' AND q."leaseOwner" = $2`,
        [prepared.attemptId, workerId, code],
      );
      if (queue.rowCount !== prepared.items.length) throw new Error('LEASE_LOST');
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async completeDispatch(
    attemptId: string,
    result: DispatchResult,
    latencyMs: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "WbWriteAttempt"
            SET "status" = $2::"WriteAttemptStatus", "completedAt" = NOW(), "latencyMs" = $3,
                "wbRequestId" = $4, "httpStatus" = $5, "rateLimitHeaders" = $6::jsonb,
                "responseDigest" = $7::jsonb
          WHERE "id" = $1 AND "status" = 'DISPATCHING'`,
        [
          attemptId,
          result.items.every((item) => item.accepted) ? 'ACCEPTED' : 'REJECTED',
          latencyMs,
          result.wbRequestId ?? null,
          result.httpStatus,
          json(result.rateLimitHeaders ?? {}),
          json(redactSecrets(result)),
        ],
      );
      for (const item of result.items) {
        const fragmentHash = checksum(redactSecrets(item.responseFragment ?? null));
        await client.query(
          `WITH updated_item AS (
             UPDATE "WbWriteAttemptItem"
                SET "status" = $3::"WriteAttemptStatus", "httpStatus" = $4,
                    "errorCode" = $5, "responseFragmentHash" = $6,
                    "reconciliationStatus" = $7::"ReconciliationStatus"
              WHERE "attemptId" = $1 AND "requestIndex" = $2 AND "status" = 'DISPATCHING'
             RETURNING "decisionId"
           )
           UPDATE "DecisionQueueItem" q
              SET "status" = $8::"DecisionQueueStatus", "lastHttpStatus" = $4,
                  "lastErrorCode" = $5, "failureClassification" = $9,
                  "manualRetryBlocked" = $10, "version" = q."version" + 1
             FROM updated_item i WHERE q."decisionId" = i."decisionId"`,
          [
            attemptId,
            item.requestIndex,
            item.accepted ? 'ACCEPTED' : 'REJECTED',
            item.httpStatus ?? result.httpStatus,
            item.errorCode ?? null,
            fragmentHash,
            item.accepted ? 'PENDING' : 'NOT_REQUIRED',
            item.accepted ? 'VERIFY_WAIT' : 'FAILED',
            item.accepted ? null : classifyRejected(item.errorCode),
            item.accepted ? false : !isRetryableRejected(item.errorCode),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async markUnknown(attemptId: string, code: string, detail: unknown): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "WbWriteAttempt"
            SET "status" = 'UNKNOWN', "completedAt" = NOW(), "errorClass" = 'AMBIGUOUS',
                "errorCode" = $2, "responseDigest" = $3::jsonb
          WHERE "id" = $1 AND "status" = 'DISPATCHING'`,
        [attemptId, code, json(redactSecrets(detail))],
      );
      await client.query(
        `UPDATE "WbWriteAttemptItem" SET "status" = 'UNKNOWN',
                 "reconciliationStatus" = 'PENDING', "errorCode" = $2
          WHERE "attemptId" = $1 AND "status" = 'DISPATCHING'`,
        [attemptId, code],
      );
      await client.query(
        `UPDATE "DecisionQueueItem" q
            SET "status" = 'VERIFY_WAIT', "failureClassification" = 'UNKNOWN',
                "manualRetryBlocked" = true, "lastErrorCode" = $2,
                "version" = q."version" + 1
           FROM "WbWriteAttemptItem" i
          WHERE i."attemptId" = $1 AND i."decisionId" = q."decisionId"`,
        [attemptId, code],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async markPreByteFailure(attemptId: string, detail: unknown): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "WbWriteAttempt"
            SET "status" = 'REJECTED', "completedAt" = NOW(),
                "errorClass" = 'TRANSPORT_PRE_BYTE',
                "errorCode" = 'TRANSPORT_PRE_BYTE_RETRIES_EXHAUSTED',
                "responseDigest" = $2::jsonb
          WHERE "id" = $1 AND "status" = 'DISPATCHING'`,
        [attemptId, json(redactSecrets(detail))],
      );
      await client.query(
        `UPDATE "WbWriteAttemptItem"
            SET "status" = 'REJECTED', "reconciliationStatus" = 'NOT_REQUIRED',
                "errorCode" = 'TRANSPORT_PRE_BYTE_RETRIES_EXHAUSTED'
          WHERE "attemptId" = $1 AND "status" = 'DISPATCHING'`,
        [attemptId],
      );
      await client.query(
        `UPDATE "DecisionQueueItem" q
            SET "status" = 'FAILED', "failureClassification" = 'TRANSIENT_REJECTED',
                "manualRetryBlocked" = false,
                "lastErrorCode" = 'TRANSPORT_PRE_BYTE_RETRIES_EXHAUSTED',
                "version" = q."version" + 1
           FROM "WbWriteAttemptItem" i
          WHERE i."attemptId" = $1 AND i."decisionId" = q."decisionId"
            AND q."status" = 'SENT'`,
        [attemptId],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async recoverCrashWindows(): Promise<{
    readonly prepared: number;
    readonly unknown: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prepared = await client.query(
        `WITH recovered AS (
           UPDATE "WbWriteAttempt" SET "status" = 'REJECTED', "completedAt" = NOW(),
                  "errorClass" = 'RECOVERED_NO_DISPATCH', "errorCode" = 'PREPARED_CRASH_RECOVERED'
            WHERE "status" = 'PREPARED' AND "preparedAt" < NOW() - INTERVAL '5 minutes'
           RETURNING "id"
         )
         UPDATE "WbWriteAttemptItem" i
            SET "status" = 'REJECTED', "errorCode" = 'PREPARED_CRASH_RECOVERED'
           FROM recovered r WHERE i."attemptId" = r."id"`,
      );
      await client.query(
        `UPDATE "DecisionQueueItem"
            SET "status" = 'QUEUED', "leaseOwner" = NULL, "leaseUntil" = NULL,
                "availableAt" = NOW(), "version" = "version" + 1
          WHERE "status" = 'LEASED' AND "leaseUntil" < NOW()`,
      );
      const unknown = await client.query(
        `WITH recovered AS (
           UPDATE "WbWriteAttempt" SET "status" = 'UNKNOWN', "completedAt" = NOW(),
                  "errorClass" = 'AMBIGUOUS', "errorCode" = 'DISPATCHING_CRASH_RECOVERED'
            WHERE "status" = 'DISPATCHING'
              AND "dispatchCommittedAt" < NOW() - INTERVAL '5 minutes'
           RETURNING "id"
         )
         UPDATE "WbWriteAttemptItem" i
            SET "status" = 'UNKNOWN', "reconciliationStatus" = 'PENDING',
                "errorCode" = 'DISPATCHING_CRASH_RECOVERED'
           FROM recovered r WHERE i."attemptId" = r."id"`,
      );
      await client.query(
        `UPDATE "DecisionQueueItem" q
            SET "status" = 'VERIFY_WAIT', "failureClassification" = 'UNKNOWN',
                "manualRetryBlocked" = true, "version" = q."version" + 1
           FROM "WbWriteAttemptItem" i
           JOIN "WbWriteAttempt" a ON a."id" = i."attemptId"
          WHERE a."status" = 'UNKNOWN' AND q."decisionId" = i."decisionId"
            AND q."status" = 'SENT'`,
      );
      await client.query('COMMIT');
      return { prepared: prepared.rowCount ?? 0, unknown: unknown.rowCount ?? 0 };
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Loads a bounded due verification/reconciliation page without taking a write lease.
   *
   * Individual state transitions remain serialized by `recordReconciliation` row locks.
   *
   * @param limit - Maximum rows, from 1 through 500.
   * @returns Due work ordered by verification time and queue identity.
   */
  public async loadReconciliationBatch(limit: number): Promise<readonly ReconciliationWorkItem[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('INVALID_RECONCILIATION_BATCH_SIZE');
    }
    const result = await this.pool.query<ReconciliationWorkRow>(
      `SELECT i."id" AS "attemptItemId", i."decisionId", i."sentBidMinor",
              i."desiredBidState"::text AS "desiredBidState", i."preWriteState",
              q."id" AS "queueItemId", q."priority", q."attemptCount",
              d."targetId", d."action"::text, d."boundedBidMinor",
              d."policyVersion", d."metricSnapshotId",
              t."campaignId", t."nmId", t."normQueryWire", t."placement"::text,
              t."targetKind"::text, c."wbCampaignId",
              c."bidType"::text AS "campaignBidType",
              c."paymentType"::text AS "campaignPaymentType"
         FROM "DecisionQueueItem" q
         JOIN "BidDecision" d ON d."id" = q."decisionId"
         JOIN "CampaignTarget" t ON t."id" = d."targetId"
         JOIN "Campaign" c ON c."id" = t."campaignId"
         JOIN LATERAL (
           SELECT wi.*
             FROM "WbWriteAttemptItem" wi
            WHERE wi."decisionId" = d."id"
              AND wi."reconciliationStatus" = 'PENDING'
            ORDER BY wi."attemptNumber" DESC
            LIMIT 1
         ) i ON true
        WHERE q."status" = 'VERIFY_WAIT'
          AND (q."nextVerificationAt" IS NULL OR q."nextVerificationAt" <= NOW())
        ORDER BY q."nextVerificationAt" NULLS FIRST, q."id"
        LIMIT $1`,
      [limit],
    );
    return Object.freeze(
      result.rows.map((row) => {
        const oldState = parseStoredLiveState(row.preWriteState);
        return Object.freeze({
          attemptItemId: row.attemptItemId,
          decisionId: row.decisionId,
          desired: Object.freeze({
            bidMinor: row.sentBidMinor === null ? null : BigInt(row.sentBidMinor),
            explicit: row.desiredBidState === 'EXPLICIT',
          }),
          item: toClaimed(row),
          oldState,
        });
      }),
    );
  }

  /**
   * Releases queue leases owned by a stopping process.
   *
   * @param workerId - Exact lease owner.
   * @returns Number of released queue rows.
   */
  public async releaseWorkerLeases(workerId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE "DecisionQueueItem"
          SET "status" = 'RETRY_WAIT', "availableAt" = NOW(),
              "leaseOwner" = NULL, "leaseUntil" = NULL,
              "failureClassification" = 'GRACEFUL_SHUTDOWN',
              "version" = "version" + 1
        WHERE "status" = 'LEASED' AND "leaseOwner" = $1`,
      [workerId],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Deletes one bounded batch of terminal detailed write records after retention.
   *
   * PREPARED, DISPATCHING, UNKNOWN, and pending reconciliation are never selected.
   * Business audit and decisions remain intact.
   *
   * @param retentionDays - Positive configured retention.
   * @param limit - Maximum attempts deleted in one transaction.
   * @returns Deleted attempt count.
   */
  public async cleanupTerminalAttempts(retentionDays: number, limit = 1_000): Promise<number> {
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10_000
    ) {
      throw new Error('INVALID_RETENTION_BOUNDS');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{ id: string }>(
        `SELECT a."id"
           FROM "WbWriteAttempt" a
          WHERE a."status" IN ('ACCEPTED', 'REJECTED')
            AND a."completedAt" <
                NOW() - ($1 * INTERVAL '1 day')
            AND NOT EXISTS (
              SELECT 1 FROM "WbWriteAttemptItem" i
               WHERE i."attemptId" = a."id"
                 AND i."reconciliationStatus" = 'PENDING'
            )
          ORDER BY a."completedAt", a."id"
          FOR UPDATE SKIP LOCKED
          LIMIT $2`,
        [retentionDays, limit],
      );
      const ids = selected.rows.map((row) => row.id);
      if (ids.length === 0) {
        await client.query('COMMIT');
        return 0;
      }
      await client.query(
        `DELETE FROM "ReconciliationRead" r
          USING "WbWriteAttemptItem" i
          WHERE r."attemptItemId" = i."id"
            AND i."attemptId" = ANY($1::uuid[])`,
        [ids],
      );
      await client.query(`DELETE FROM "WbWriteAttemptItem" WHERE "attemptId" = ANY($1::uuid[])`, [
        ids,
      ]);
      const deleted = await client.query(
        `DELETE FROM "WbWriteAttempt" WHERE "id" = ANY($1::uuid[])`,
        [ids],
      );
      await client.query('COMMIT');
      return deleted.rowCount ?? 0;
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordReconciliation(input: {
    readonly attemptItemId: string;
    readonly decisionId: string;
    readonly targetId: string;
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
    readonly minimumReadIntervalMs: number;
    readonly requiredStableReadCount: number;
    readonly maximumWriteAttempts: number;
  }): Promise<'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const queueResult = await client.query<ReconciliationQueueRow>(
        `SELECT q."stableReadChecksum", q."stableReadCount", q."lastReconciliationReadAt",
                q."reconciliationDeadlineAt", q."nextVerificationAt", q."status"::text,
                (
                  SELECT COUNT(*)::integer
                    FROM "WbWriteAttemptItem" wi
                    JOIN "WbWriteAttempt" wa ON wa."id" = wi."attemptId"
                   WHERE wi."decisionId" = q."decisionId"
                     AND wa."errorClass" IS DISTINCT FROM 'TRANSPORT_PRE_BYTE'
                     AND wa."errorClass" IS DISTINCT FROM 'NO_DISPATCH'
                ) AS "actualDispatchCount"
           FROM "DecisionQueueItem" q WHERE q."decisionId" = $1 FOR UPDATE`,
        [input.decisionId],
      );
      const queue = queueResult.rows[0];
      if (queue?.status !== 'VERIFY_WAIT') {
        throw new Error('RECONCILIATION_NOT_PENDING');
      }
      if (queue.nextVerificationAt !== null && input.observedAt < queue.nextVerificationAt) {
        throw new Error('RECONCILIATION_VISIBILITY_DELAY_ACTIVE');
      }
      await client.query(
        `INSERT INTO "ReconciliationRead"
           ("id", "attemptItemId", "targetId", "readAt", "stateChecksum", "sourceMarker",
            "state", "classification", "fresh", "prevalidationPassed")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
        [
          randomUUID(),
          input.attemptItemId,
          input.targetId,
          input.observedAt,
          input.observation.stateChecksum,
          input.observation.sourceMarker,
          json(input.observation.state),
          input.observation.classification,
          input.observation.fresh,
          input.observation.prevalidationPassed,
        ],
      );
      const outcome = reconciliationOutcome(queue, input);
      await applyReconciliationOutcome(client, input, queue, outcome);
      await client.query('COMMIT');
      return outcome;
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async retryFailure(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly decisionId: string;
    readonly expectedVersion: bigint;
    readonly idempotencyKey?: string;
    readonly idempotencyScope?: string;
    readonly reason: string;
  }): Promise<bigint> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const idempotencyChecksum = checksum({
        decisionId: input.decisionId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      });
      const replay = await replayIdempotency(
        client,
        input.idempotencyScope,
        input.idempotencyKey,
        idempotencyChecksum,
      );
      if (replay !== null) {
        await client.query('COMMIT');
        return BigInt(replay.version);
      }
      const result = await client.query<RetryRow>(
        `SELECT "status"::text, "failureClassification", "manualRetryBlocked", "version"
           FROM "DecisionQueueItem" WHERE "decisionId" = $1 FOR UPDATE`,
        [input.decisionId],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error('QUEUE_ITEM_NOT_FOUND');
      if (BigInt(row.version) !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      if (
        row.status !== 'FAILED' ||
        row.manualRetryBlocked ||
        !isRetryableClassification(row.failureClassification)
      ) {
        throw new Error('RETRY_NOT_SAFE');
      }
      const newVersion = BigInt(row.version) + 1n;
      await client.query(
        `UPDATE "DecisionQueueItem"
            SET "status" = 'RETRY_WAIT', "availableAt" = NOW(),
                "lastErrorClass" = NULL, "lastErrorCode" = NULL,
                "failureClassification" = NULL, "manualRetryBlocked" = false,
                "stableReadChecksum" = NULL, "stableReadCount" = 0,
                "version" = $2
          WHERE "decisionId" = $1`,
        [input.decisionId, newVersion.toString()],
      );
      await appendAudit(client, {
        action: 'QUEUE_FAILURE_RETRY_SCHEDULED',
        actor: input.actor,
        after: {
          decisionId: input.decisionId,
          idempotencyKey: input.idempotencyKey ?? null,
          reason: input.reason,
          version: newVersion.toString(),
        },
        correlationId: input.correlationId,
        entityId: input.decisionId,
        entityType: 'DecisionQueueItem',
      });
      await storeIdempotency(
        client,
        input.idempotencyScope,
        input.idempotencyKey,
        idempotencyChecksum,
        { decisionId: input.decisionId, status: 'RETRY_WAIT', version: newVersion.toString() },
      );
      await client.query('COMMIT');
      return newVersion;
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async setGlobalKill(input: ControlMutation): Promise<bigint> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const idempotencyChecksum = checksum({
        enabled: input.enabled,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      });
      const replay = await replayIdempotency(
        client,
        input.idempotencyScope,
        input.idempotencyKey,
        idempotencyChecksum,
      );
      if (replay !== null) {
        await client.query('COMMIT');
        return BigInt(replay.version);
      }
      const current = await client.query<{ globalKill: boolean; version: string }>(
        `SELECT "globalKill", "version" FROM "DeploymentControl" WHERE "id" = $1 FOR UPDATE`,
        [DEPLOYMENT_CONTROL_ID],
      );
      const row = current.rows[0];
      if (row === undefined) throw new Error('CONTROL_NOT_INITIALIZED');
      if (BigInt(row.version) !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      const version = BigInt(row.version) + 1n;
      await client.query(
        `UPDATE "DeploymentControl"
            SET "globalKill" = $2, "reason" = $3, "version" = $4,
                "updatedAt" = NOW(), "updatedBy" = $5 WHERE "id" = $1`,
        [DEPLOYMENT_CONTROL_ID, input.enabled, input.reason, version.toString(), input.actor],
      );
      await appendAudit(client, {
        action: input.enabled ? 'GLOBAL_KILL_ENABLED' : 'GLOBAL_KILL_DISABLED',
        actor: input.actor,
        before: { globalKill: row.globalKill, version: row.version },
        after: {
          globalKill: input.enabled,
          idempotencyKey: input.idempotencyKey ?? null,
          reason: input.reason,
          version: version.toString(),
        },
        correlationId: input.correlationId,
        entityId: DEPLOYMENT_CONTROL_ID,
        entityType: 'DeploymentControl',
      });
      await storeIdempotency(
        client,
        input.idempotencyScope,
        input.idempotencyKey,
        idempotencyChecksum,
        { enabled: input.enabled, version: version.toString() },
      );
      await client.query('COMMIT');
      return version;
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

interface ControlMutation {
  readonly actor: string;
  readonly correlationId: string;
  readonly enabled: boolean;
  readonly expectedVersion: bigint;
  readonly idempotencyKey?: string;
  readonly idempotencyScope?: string;
  readonly reason: string;
}

interface ClaimRow {
  readonly queueItemId: string;
  readonly decisionId: string;
  readonly targetId: string;
  readonly campaignId: string;
  readonly campaignBidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignPaymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly wbCampaignId: string;
  readonly nmId: string;
  readonly normQueryWire: string | null;
  readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
  readonly targetKind: 'CARD' | 'CLUSTER';
  readonly priority: number;
  readonly action: string;
  readonly boundedBidMinor: string | null;
  readonly attemptCount: number;
  readonly policyVersion: string;
  readonly metricSnapshotId: string;
}

/**
 * Database row used by the reconciliation page mapper.
 */
interface ReconciliationWorkRow extends ClaimRow {
  readonly attemptItemId: string;
  readonly desiredBidState: 'ABSENT' | 'EXPLICIT';
  readonly preWriteState: unknown;
  readonly sentBidMinor: string | null;
}

interface ReconciliationQueueRow {
  readonly actualDispatchCount: number;
  readonly stableReadChecksum: string | null;
  readonly stableReadCount: number;
  readonly lastReconciliationReadAt: Date | null;
  readonly reconciliationDeadlineAt: Date | null;
  readonly nextVerificationAt: Date | null;
  readonly status: string;
}

interface RetryRow {
  readonly status: string;
  readonly failureClassification: string | null;
  readonly manualRetryBlocked: boolean;
  readonly version: string;
}

function toClaimed(row: ClaimRow): ClaimedQueueItem {
  const deleteAction = row.action === 'RESTORE_ABSENT_OVERRIDE';
  return Object.freeze({
    action: deleteAction ? 'DELETE' : 'SET',
    attemptCount: row.attemptCount,
    bidMinor: deleteAction
      ? null
      : row.boundedBidMinor === null
        ? null
        : BigInt(row.boundedBidMinor),
    campaignBidType: row.campaignBidType,
    campaignId: row.campaignId,
    campaignPaymentType: row.campaignPaymentType,
    decisionId: row.decisionId,
    desiredBidState: deleteAction ? 'ABSENT' : 'EXPLICIT',
    metricSnapshotId: row.metricSnapshotId,
    nmId: BigInt(row.nmId),
    normQueryWire: row.normQueryWire,
    placement: row.placement,
    policyVersion: BigInt(row.policyVersion),
    priority: row.priority,
    queueItemId: row.queueItemId,
    targetId: row.targetId,
    targetKind: row.targetKind,
    wbCampaignId: BigInt(row.wbCampaignId),
  });
}

/**
 * Validates and restores one persisted pre-write live state.
 *
 * @param value - JSONB state.
 * @returns Typed immutable live state.
 */
function parseStoredLiveState(value: unknown): LiveBidState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_PREWRITE_STATE');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const bidValue = record.bidMinor;
  const bidMinor =
    bidValue === null
      ? null
      : typeof bidValue === 'string' && /^-?\d+$/.test(bidValue)
        ? BigInt(bidValue)
        : typeof bidValue === 'number' && Number.isSafeInteger(bidValue)
          ? BigInt(bidValue)
          : undefined;
  const observedAt =
    typeof record.observedAt === 'string' || record.observedAt instanceof Date
      ? new Date(record.observedAt)
      : null;
  if (
    bidMinor === undefined ||
    typeof record.explicit !== 'boolean' ||
    observedAt === null ||
    Number.isNaN(observedAt.getTime()) ||
    typeof record.sourceMarker !== 'string'
  ) {
    throw new Error('INVALID_PREWRITE_STATE');
  }
  return Object.freeze({
    bidMinor,
    explicit: record.explicit,
    observedAt,
    sourceMarker: record.sourceMarker,
  });
}

async function assertAutomationAllows(
  client: RawTransactionClient,
  entries: readonly { readonly item: { readonly campaignId: string; readonly targetId: string } }[],
): Promise<void> {
  const control = await client.query<{ globalKill: boolean }>(
    `SELECT "globalKill" FROM "DeploymentControl" WHERE "id" = $1 FOR SHARE`,
    [DEPLOYMENT_CONTROL_ID],
  );
  if (control.rows[0]?.globalKill !== false) throw new Error('GLOBAL_KILL_ACTIVE');
  for (const { item } of entries) {
    const mode = await client.query<{ campaignMode: string | null; targetMode: string | null }>(
      `SELECT ca."mode"::text AS "campaignMode", ta."mode"::text AS "targetMode"
         FROM "Campaign" c
         LEFT JOIN "CampaignAutomation" ca ON ca."campaignId" = c."id"
         LEFT JOIN "TargetAutomation" ta ON ta."targetId" = $2
        WHERE c."id" = $1`,
      [item.campaignId, item.targetId],
    );
    const row = mode.rows[0];
    if (row?.campaignMode !== 'APPLY' || (row.targetMode !== null && row.targetMode !== 'APPLY')) {
      throw new Error('AUTOMATION_NOT_APPLY');
    }
  }
}

function reconciliationOutcome(
  queue: ReconciliationQueueRow,
  input: {
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
    readonly minimumReadIntervalMs: number;
    readonly requiredStableReadCount: number;
    readonly maximumWriteAttempts: number;
  },
): 'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED' {
  if (input.observation.classification === 'DESIRED_STATE') return 'APPLIED';
  if (input.observation.classification === 'THIRD_STATE') return 'FAILED';
  if (
    queue.reconciliationDeadlineAt === null ||
    input.observedAt >= queue.reconciliationDeadlineAt
  ) {
    return 'FAILED';
  }
  const sameChecksum = queue.stableReadChecksum === input.observation.stateChecksum;
  const stableReadCount = sameChecksum ? queue.stableReadCount + 1 : 1;
  const elapsed =
    queue.lastReconciliationReadAt === null
      ? Number.POSITIVE_INFINITY
      : input.observedAt.getTime() - queue.lastReconciliationReadAt.getTime();
  const safeStableOld = isSafeStableOldRetry({
    beforeDeadline: true,
    elapsedSincePreviousMs: elapsed,
    fresh: input.observation.fresh,
    minimumReadIntervalMs: input.minimumReadIntervalMs,
    prevalidationPassed: input.observation.prevalidationPassed,
    requiredStableReadCount: input.requiredStableReadCount,
    stableReadCount,
  });
  if (!safeStableOld) return 'WAIT';
  return queue.actualDispatchCount >= input.maximumWriteAttempts ? 'FAILED' : 'RETRY_WAIT';
}

async function applyReconciliationOutcome(
  client: RawTransactionClient,
  input: {
    readonly attemptItemId: string;
    readonly decisionId: string;
    readonly targetId: string;
    readonly observation: ReconciliationObservation;
    readonly observedAt: Date;
  },
  queue: ReconciliationQueueRow,
  outcome: 'APPLIED' | 'WAIT' | 'RETRY_WAIT' | 'FAILED',
): Promise<void> {
  const deadlineExceeded =
    queue.reconciliationDeadlineAt === null || input.observedAt >= queue.reconciliationDeadlineAt;
  const thirdState = input.observation.classification === 'THIRD_STATE';
  const attemptsExhausted =
    input.observation.classification === 'STABLE_OLD_STATE' &&
    outcome === 'FAILED' &&
    !deadlineExceeded &&
    !thirdState;
  const stableReadCount =
    queue.stableReadChecksum === input.observation.stateChecksum ? queue.stableReadCount + 1 : 1;
  await client.query(
    `UPDATE "DecisionQueueItem"
        SET "status" = $2::"DecisionQueueStatus",
            "stableReadChecksum" = $3, "stableReadCount" = $4,
            "lastReconciliationReadAt" = $5,
            "verifiedAt" = CASE WHEN $2 = 'APPLIED' THEN $5 ELSE "verifiedAt" END,
            "availableAt" = CASE WHEN $2 = 'RETRY_WAIT' THEN $5 ELSE "availableAt" END,
            "failureClassification" = CASE
              WHEN $6 THEN 'EXTERNAL_STATE_CONFLICT'
              WHEN $7 THEN 'RECONCILIATION_INCONCLUSIVE'
              WHEN $8 THEN 'WRITE_ATTEMPTS_EXHAUSTED'
              ELSE "failureClassification" END,
            "lastErrorCode" = CASE
              WHEN $6 THEN 'EXTERNAL_STATE_CONFLICT'
              WHEN $7 THEN 'RECONCILIATION_INCONCLUSIVE'
              WHEN $8 THEN 'WRITE_ATTEMPTS_EXHAUSTED'
              ELSE "lastErrorCode" END,
            "manualRetryBlocked" = CASE WHEN $2 IN ('APPLIED','RETRY_WAIT') THEN false
                                        WHEN $2 = 'FAILED' THEN true
                                        ELSE "manualRetryBlocked" END,
            "version" = "version" + 1
      WHERE "decisionId" = $1`,
    [
      input.decisionId,
      outcome === 'WAIT' ? 'VERIFY_WAIT' : outcome,
      input.observation.stateChecksum,
      stableReadCount,
      input.observedAt,
      thirdState,
      deadlineExceeded,
      attemptsExhausted,
    ],
  );
  await client.query(
    `UPDATE "WbWriteAttemptItem"
        SET "reconciliationStatus" = $2::"ReconciliationStatus",
            "reconciledAt" = CASE WHEN $2 IN ('CONFIRMED','MISMATCH')
                                  THEN $3::timestamptz ELSE NULL END
      WHERE "id" = $1`,
    [
      input.attemptItemId,
      outcome === 'APPLIED' ? 'CONFIRMED' : outcome === 'FAILED' ? 'MISMATCH' : 'PENDING',
      input.observedAt,
    ],
  );
  if (outcome === 'APPLIED') {
    await client.query(
      `UPDATE "CampaignTarget" t
          SET "currentBidMinor" = $3,
              "clusterBidState" = CASE WHEN $4 THEN 'EXPLICIT'::"ClusterBidState"
                                       ELSE 'ABSENT'::"ClusterBidState" END,
              "clusterOverrideOwned" = $4,
              "lastConfirmedAt" = $5
         FROM "BidDecision" d
        WHERE t."id" = $1
          AND d."id" = $2
          AND d."targetId" = t."id"
          AND t."targetKind" = 'CLUSTER'`,
      [
        input.targetId,
        input.decisionId,
        input.observation.state.bidMinor?.toString() ?? null,
        input.observation.state.explicit,
        input.observedAt,
      ],
    );
  }
}

function classifyRejected(code: string | undefined): string {
  if (code?.includes('AUTH') === true) return 'AUTH';
  if (code?.includes('CAPABILITY') === true) return 'CAPABILITY';
  if (code?.includes('INVALID') === true) return 'INVALID';
  return 'TRANSIENT_REJECTED';
}

function isRetryableRejected(code: string | undefined): boolean {
  return classifyRejected(code) === 'TRANSIENT_REJECTED';
}

function isRetryableClassification(value: string | null): boolean {
  return value === 'TRANSIENT_REJECTED' || value === 'SAFE_STABLE_OLD_STATE';
}

function oldestRead(items: readonly { readonly live: LiveBidState }[]): Date {
  return new Date(Math.min(...items.map(({ live }) => live.observedAt.getTime())));
}

function checksum(value: unknown): string {
  const valueJson = canonicalize(normalize(value));
  if (valueJson === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(valueJson).digest('hex');
}

function json(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

async function appendAudit(
  client: RawTransactionClient,
  event: {
    readonly action: string;
    readonly actor: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly correlationId: string;
    readonly entityId: string;
    readonly entityType: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO "AuditEvent"
       ("id", "actor", "action", "entityType", "entityId", "before", "after", "correlationId")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      randomUUID(),
      event.actor,
      event.action,
      event.entityType,
      event.entityId,
      event.before === undefined ? null : json(redactSecrets(event.before)),
      event.after === undefined ? null : json(redactSecrets(event.after)),
      event.correlationId,
    ],
  );
}

async function replayIdempotency(
  client: RawTransactionClient,
  scope: string | undefined,
  key: string | undefined,
  requestChecksum: string,
): Promise<{ readonly version: string } | null> {
  if (scope === undefined || key === undefined) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `admin-idempotency:${scope}:${key}`,
  ]);
  const result = await client.query<{
    requestChecksum: string;
    responseBody: { version: string };
  }>(
    `SELECT "requestChecksum", "responseBody" FROM "IdempotencyRecord"
      WHERE "scope" = $1 AND "idempotencyKey" = $2 FOR UPDATE`,
    [scope, key],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.requestChecksum !== requestChecksum) throw new Error('IDEMPOTENCY_KEY_REUSED');
  return row.responseBody;
}

async function storeIdempotency(
  client: RawTransactionClient,
  scope: string | undefined,
  key: string | undefined,
  requestChecksum: string,
  responseBody: unknown,
): Promise<void> {
  if (scope === undefined || key === undefined) return;
  await client.query(
    `INSERT INTO "IdempotencyRecord"
       ("id", "scope", "idempotencyKey", "requestChecksum", "responseStatus",
        "responseHeaders", "responseBody", "expiresAt")
     VALUES ($1, $2, $3, $4, 200, '{}'::jsonb, $5::jsonb, NOW() + INTERVAL '400 days')`,
    [randomUUID(), scope, key, requestChecksum, json(responseBody)],
  );
}

async function rollback(client: RawTransactionClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The original database error remains authoritative.
  }
}
