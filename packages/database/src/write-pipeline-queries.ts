/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { executeRaw, queryRaw } from './sql.js';
import { withTransaction } from './transactions.js';

/** Row returned by the atomic decision-queue claim primitive. */
export interface WriteClaimRow {
  readonly action: string;
  readonly attemptCount: number;
  readonly boundedBidMinor: string | null;
  readonly campaignBidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignId: string;
  readonly campaignPaymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly decisionId: string;
  readonly metricSnapshotId: string;
  readonly nmId: string;
  readonly normQueryWire: string | null;
  readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
  readonly policyVersion: string;
  readonly priority: number;
  readonly queueItemId: string;
  readonly targetId: string;
  readonly targetKind: 'CARD' | 'CLUSTER';
  readonly wbCampaignId: string;
}

/** Row returned by the due reconciliation read model. */
export interface WriteReconciliationRow extends WriteClaimRow {
  readonly attemptItemId: string;
  readonly desiredBidState: 'ABSENT' | 'EXPLICIT';
  readonly preWriteState: unknown;
  readonly sentBidMinor: string | null;
}

/** Atomically claims one bounded decision-queue page across worker replicas. */
export async function claimDecisionQueueItems(
  database: DatabaseClient,
  input: {
    readonly action?: 'DELETE' | 'SET';
    readonly leaseSeconds: number;
    readonly limit: number;
    readonly targetKind?: 'CARD' | 'CLUSTER';
    readonly workerId: string;
  },
): Promise<readonly WriteClaimRow[]> {
  return queryRaw<WriteClaimRow>(
    database,
    Prisma.sql`
      WITH candidates AS (
        SELECT queue."id"
          FROM "DecisionQueueItem" queue
          JOIN "BidDecision" decision ON decision."id" = queue."decisionId"
          JOIN "CampaignTarget" target ON target."id" = decision."targetId"
         WHERE queue."status" IN ('QUEUED', 'RETRY_WAIT')
           AND queue."availableAt" <= clock_timestamp()
           AND (queue."leaseUntil" IS NULL OR queue."leaseUntil" < clock_timestamp())
           AND (
             ${input.targetKind ?? null}::text IS NULL
             OR target."targetKind"::text = ${input.targetKind ?? null}
           )
           AND (
             ${input.action ?? null}::text IS NULL
             OR (
               ${input.action ?? null} = 'DELETE'
               AND decision."action" = 'RESTORE_ABSENT_OVERRIDE'
             )
             OR (
               ${input.action ?? null} = 'SET'
               AND decision."action" IN ('INCREASE', 'DECREASE')
             )
           )
           AND NOT EXISTS (
             SELECT 1
               FROM "DecisionQueueItem" active_queue
               JOIN "BidDecision" active_decision
                 ON active_decision."id" = active_queue."decisionId"
              WHERE active_decision."targetId" = decision."targetId"
                AND active_queue."id" <> queue."id"
                AND active_queue."status" IN ('LEASED', 'SENT', 'VERIFY_WAIT')
           )
         ORDER BY queue."priority" DESC, queue."availableAt", queue."id"
         FOR UPDATE OF queue SKIP LOCKED
         LIMIT ${input.limit}
      )
      UPDATE "DecisionQueueItem" queue
         SET "status" = 'LEASED',
             "leaseOwner" = ${input.workerId},
             "leaseUntil" = clock_timestamp() + make_interval(secs => ${input.leaseSeconds}),
             "version" = queue."version" + 1
        FROM candidates selected, "BidDecision" decision,
             "CampaignTarget" target, "Campaign" campaign
       WHERE queue."id" = selected."id"
         AND decision."id" = queue."decisionId"
         AND target."id" = decision."targetId"
         AND campaign."id" = target."campaignId"
      RETURNING queue."id" AS "queueItemId", queue."decisionId", decision."targetId",
                target."campaignId", target."nmId", target."normQueryWire",
                target."placement"::text, target."targetKind"::text,
                campaign."wbCampaignId", campaign."bidType"::text AS "campaignBidType",
                campaign."paymentType"::text AS "campaignPaymentType",
                queue."priority", decision."action"::text,
                decision."boundedBidMinor", queue."attemptCount", decision."policyVersion",
                decision."metricSnapshotId"
    `,
  );
}

/** Loads the latest pending attempt item for each due reconciliation queue row. */
export async function loadReconciliationWorkPage(
  database: DatabaseClient,
  limit: number,
): Promise<readonly WriteReconciliationRow[]> {
  return queryRaw<WriteReconciliationRow>(
    database,
    Prisma.sql`
      SELECT item."id" AS "attemptItemId", item."decisionId", item."sentBidMinor",
             item."desiredBidState"::text AS "desiredBidState", item."preWriteState",
             queue."id" AS "queueItemId", queue."priority", queue."attemptCount",
             decision."targetId", decision."action"::text, decision."boundedBidMinor",
             decision."policyVersion", decision."metricSnapshotId",
             target."campaignId", target."nmId", target."normQueryWire",
             target."placement"::text, target."targetKind"::text,
             campaign."wbCampaignId", campaign."bidType"::text AS "campaignBidType",
             campaign."paymentType"::text AS "campaignPaymentType"
        FROM "DecisionQueueItem" queue
        JOIN "BidDecision" decision ON decision."id" = queue."decisionId"
        JOIN "CampaignTarget" target ON target."id" = decision."targetId"
        JOIN "Campaign" campaign ON campaign."id" = target."campaignId"
        JOIN LATERAL (
          SELECT candidate.*
            FROM "WbWriteAttemptItem" candidate
           WHERE candidate."decisionId" = decision."id"
             AND candidate."reconciliationStatus" = 'PENDING'
           ORDER BY candidate."attemptNumber" DESC
           LIMIT 1
        ) item ON true
       WHERE queue."status" = 'VERIFY_WAIT'
         AND (queue."nextVerificationAt" IS NULL OR queue."nextVerificationAt" <= NOW())
       ORDER BY queue."nextVerificationAt" NULLS FIRST, queue."id"
       LIMIT ${limit}
    `,
  );
}

/** Deletes a bounded, lock-safe page of terminal write-attempt detail records. */
export async function cleanupTerminalWriteAttempts(
  database: DatabaseClient,
  retentionDays: number,
  limit: number,
): Promise<number> {
  return withTransaction(database, async (transaction) => {
    const selected = await queryRaw<{ id: string }>(
      transaction,
      Prisma.sql`
        SELECT attempt."id"
          FROM "WbWriteAttempt" attempt
         WHERE attempt."status" IN ('ACCEPTED', 'REJECTED')
           AND attempt."completedAt" < NOW() - (${retentionDays} * INTERVAL '1 day')
           AND NOT EXISTS (
             SELECT 1
               FROM "WbWriteAttemptItem" item
              WHERE item."attemptId" = attempt."id"
                AND item."reconciliationStatus" = 'PENDING'
           )
         ORDER BY attempt."completedAt", attempt."id"
         FOR UPDATE SKIP LOCKED
         LIMIT ${limit}
      `,
    );
    const ids = selected.map(({ id }) => id);
    if (ids.length === 0) return 0;
    await executeRaw(
      transaction,
      Prisma.sql`
        DELETE FROM "ReconciliationRead" read
         USING "WbWriteAttemptItem" item
         WHERE read."attemptItemId" = item."id"
           AND item."attemptId" IN (${Prisma.join(ids)})
      `,
    );
    await executeRaw(
      transaction,
      Prisma.sql`
        DELETE FROM "WbWriteAttemptItem"
         WHERE "attemptId" IN (${Prisma.join(ids)})
      `,
    );
    return executeRaw(
      transaction,
      Prisma.sql`DELETE FROM "WbWriteAttempt" WHERE "id" IN (${Prisma.join(ids)})`,
    );
  });
}
