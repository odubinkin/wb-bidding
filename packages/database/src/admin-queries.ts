/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './sql.js';

/** Filters for the polymorphic administrative audit-event read model. */
export interface AuditEventPageQuery {
  readonly action: string | null;
  readonly actor: string | null;
  readonly campaignId: string | null;
  readonly correlationId: string | null;
  readonly createdFrom: Date | null;
  readonly createdTo: Date | null;
  readonly cursorAt: Date | null;
  readonly cursorId: string | null;
  readonly entityId: string | null;
  readonly entityType: string | null;
  readonly limit: number;
  readonly targetId: string | null;
}

/** One administrative audit-event row. */
export interface AuditEventRow {
  readonly action: string;
  readonly actor: string;
  readonly after: unknown;
  readonly before: unknown;
  readonly causationId: string | null;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly entityId: string;
  readonly entityType: string;
  readonly id: string;
}

/**
 * Loads a bounded audit page with campaign and target polymorphic filtering.
 *
 * Audit entities intentionally use a generic string identity, so campaign and
 * target traversal cannot be represented as Prisma relations. The resulting
 * union read model remains centralized at the database boundary.
 */
export async function loadAuditEventPage(
  database: DatabaseClient,
  input: AuditEventPageQuery,
): Promise<readonly AuditEventRow[]> {
  return queryRaw<AuditEventRow>(
    database,
    Prisma.sql`
      SELECT "id", "actor", "action", "entityType", "entityId", "before", "after",
             "correlationId", "causationId", "createdAt"
        FROM "AuditEvent"
       WHERE (${input.actor}::text IS NULL OR "actor" = ${input.actor})
         AND (${input.action}::text IS NULL OR "action" = ${input.action})
         AND (${input.entityType}::text IS NULL OR "entityType" = ${input.entityType})
         AND (${input.entityId}::text IS NULL OR "entityId" = ${input.entityId})
         AND (
           ${input.correlationId}::uuid IS NULL
           OR "correlationId" = ${input.correlationId}::uuid
         )
         AND (
           ${input.campaignId}::uuid IS NULL
           OR "entityId" = ${input.campaignId}::text
           OR "entityId" IN (
             SELECT target."id"::text
               FROM "CampaignTarget" target
              WHERE target."campaignId" = ${input.campaignId}::uuid
             UNION
             SELECT decision."id"::text
               FROM "BidDecision" decision
               JOIN "CampaignTarget" target ON target."id" = decision."targetId"
              WHERE target."campaignId" = ${input.campaignId}::uuid
           )
         )
         AND (
           ${input.targetId}::uuid IS NULL
           OR "entityId" = ${input.targetId}::text
           OR "entityId" IN (
             SELECT decision."id"::text
               FROM "BidDecision" decision
              WHERE decision."targetId" = ${input.targetId}::uuid
           )
         )
         AND (${input.createdFrom}::timestamptz IS NULL OR "createdAt" >= ${input.createdFrom})
         AND (${input.createdTo}::timestamptz IS NULL OR "createdAt" < ${input.createdTo})
         AND (
           ${input.cursorAt}::timestamptz IS NULL
           OR ("createdAt", "id") > (${input.cursorAt}, ${input.cursorId}::uuid)
         )
       ORDER BY "createdAt", "id"
       LIMIT ${input.limit}
    `,
  );
}
