/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient, DatabaseTransaction } from './client.js';
import { queryRaw } from './sql.js';

/** Upserts one card target through its PostgreSQL partial unique index. */
export async function upsertCardCampaignTarget(
  transaction: DatabaseTransaction,
  input: {
    readonly bidChecksum: string;
    readonly bidMinor: bigint;
    readonly campaignId: string;
    readonly fetchedAt: Date;
    readonly id: string;
    readonly nmId: bigint;
    readonly placement: 'RECOMMENDATIONS' | 'SEARCH';
    readonly syncRunId: string;
  },
): Promise<string> {
  const rows = await queryRaw<{ id: string }>(
    transaction,
    Prisma.sql`
      INSERT INTO "CampaignTarget"
        ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
         "lastConfirmedAt", "currentBidChecksum", "currentBidSyncRunId", "capability")
      VALUES (
        ${input.id}, ${input.campaignId}, ${input.nmId}, 'CARD',
        ${input.placement}::"CampaignPlacement", ${input.bidMinor}, ${input.fetchedAt},
        ${input.bidChecksum}, ${input.syncRunId}, 'OBSERVE_ONLY'
      )
      ON CONFLICT ("campaignId", "nmId", "placement")
        WHERE "targetKind" = 'CARD'
      DO UPDATE SET
        "currentBidMinor" = EXCLUDED."currentBidMinor",
        "lastConfirmedAt" = EXCLUDED."lastConfirmedAt",
        "currentBidChecksum" = EXCLUDED."currentBidChecksum",
        "currentBidSyncRunId" = EXCLUDED."currentBidSyncRunId"
      RETURNING "id"
    `,
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('CAMPAIGN_TARGET_UPSERT_FAILED');
  return id;
}

/** Upserts one cluster target through its PostgreSQL partial unique index. */
export async function upsertClusterCampaignTarget(
  transaction: DatabaseTransaction,
  input: {
    readonly campaignId: string;
    readonly id: string;
    readonly nmId: bigint;
    readonly normQueryCanonical: string;
    readonly normQueryWire: string;
  },
): Promise<void> {
  await queryRaw(
    transaction,
    Prisma.sql`
      INSERT INTO "CampaignTarget"
        ("id", "campaignId", "nmId", "targetKind", "placement",
         "normQueryWire", "normQueryCanonical", "clusterBidState", "capability")
      VALUES (
        ${input.id}, ${input.campaignId}, ${input.nmId}, 'CLUSTER', 'SEARCH',
        ${input.normQueryWire}, ${input.normQueryCanonical}, 'UNKNOWN', 'OBSERVE_ONLY'
      )
      ON CONFLICT ("campaignId", "nmId", "placement", "normQueryCanonical")
        WHERE "targetKind" = 'CLUSTER'
      DO UPDATE SET "normQueryWire" = EXCLUDED."normQueryWire"
      RETURNING "id"
    `,
  );
}

/** Upserts one cluster statistical day through its PostgreSQL partial unique index. */
export async function upsertClusterStatisticRecord(
  transaction: DatabaseTransaction,
  input: {
    readonly atbs: bigint;
    readonly attributedRevenueMinor: bigint;
    readonly campaignId: string;
    readonly clicks: bigint;
    readonly date: Date;
    readonly fetchedAt: Date;
    readonly id: string;
    readonly nmId: bigint;
    readonly normQueryCanonical: string;
    readonly normQueryWire: string;
    readonly orderedUnits: bigint | null;
    readonly orders: bigint;
    readonly runId: string;
    readonly sourceChecksum: string;
    readonly spendMinor: bigint;
    readonly views: bigint | null;
    readonly wbCampaignId: bigint;
  },
): Promise<void> {
  await queryRaw(
    transaction,
    Prisma.sql`
      INSERT INTO "CampaignStatDaily"
        ("id", "campaignId", "wbCampaignId", "nmId", "date", "placement",
         "normQueryWire", "normQueryCanonical", "appType", "dimensions", "views",
         "clicks", "atbs", "orders", "orderedUnits", "canceled", "spendMinor",
         "attributedRevenueMinor", "fetchedAt", "sourceVersion", "sourceChecksum",
         "syncRunId", "normalizedAggregationKind")
      VALUES (
        ${input.id}, ${input.campaignId}, ${input.wbCampaignId}, ${input.nmId},
        ${input.date}::date, 'SEARCH', ${input.normQueryWire}, ${input.normQueryCanonical},
        NULL, ${JSON.stringify({
          normQueryCanonical: input.normQueryCanonical,
          normQueryWire: input.normQueryWire,
        })}::jsonb,
        ${input.views}, ${input.clicks}, ${input.atbs}, ${input.orders},
        ${input.orderedUnits}, NULL, ${input.spendMinor}, ${input.attributedRevenueMinor},
        ${input.fetchedAt}, ${input.sourceChecksum}, ${input.sourceChecksum},
        ${input.runId}, 'CLUSTER_DAILY'
      )
      ON CONFLICT ("wbCampaignId", "nmId", "date", "sourceVersion", "normQueryCanonical")
        WHERE "normalizedAggregationKind" = 'CLUSTER_DAILY'
      DO UPDATE SET
        "fetchedAt" = EXCLUDED."fetchedAt",
        "syncRunId" = EXCLUDED."syncRunId"
      RETURNING "id"
    `,
  );
}

/** Campaign work-page row with its nested target evidence. */
export interface DataSyncCampaignWorkRow {
  readonly bidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignId: string;
  readonly detailsChecksum: string | null;
  readonly detailsFetchedAt: string | Date | null;
  readonly paymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly status: number;
  readonly targets: readonly {
    readonly currentBidChecksum: string | null;
    readonly currentBidConfirmedAt: string | null;
    readonly minimumBidChecksum: string | null;
    readonly minimumBidConfirmedAt: string | null;
    readonly nmId: string;
    readonly normQueryWire: string | null;
    readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
    readonly recommendationFetchedAt: string | null;
    readonly targetId: string;
    readonly targetKind: 'CARD' | 'CLUSTER';
  }[];
  readonly wbCampaignId: string;
}

/** Loads the nested campaign work read model used by the slow synchronization job. */
export async function loadDataSyncCampaignWorkPage(
  database: DatabaseClient,
  input: {
    readonly afterWbCampaignId: bigint;
    readonly campaignIds: readonly string[] | null;
    readonly includeReadyCampaigns: boolean;
    readonly limit: number;
    readonly targetIds: readonly string[] | null;
  },
): Promise<readonly DataSyncCampaignWorkRow[]> {
  const campaignFilter =
    input.campaignIds === null
      ? Prisma.empty
      : Prisma.sql`AND campaign."id" IN (${Prisma.join(input.campaignIds)})`;
  const targetJoinFilter =
    input.targetIds === null
      ? Prisma.empty
      : Prisma.sql`AND target."id" IN (${Prisma.join(input.targetIds)})`;
  const targetScopeFilter =
    input.targetIds === null
      ? Prisma.empty
      : Prisma.sql`
          AND EXISTS (
            SELECT 1
              FROM "CampaignTarget" scoped
             WHERE scoped."campaignId" = campaign."id"
               AND scoped."id" IN (${Prisma.join(input.targetIds)})
          )
        `;
  return queryRaw<DataSyncCampaignWorkRow>(
    database,
    Prisma.sql`
      SELECT campaign."id" AS "campaignId", campaign."wbCampaignId", campaign."status",
             campaign."bidType", campaign."paymentType",
             campaign."detailsChecksum", campaign."detailsFetchedAt",
             COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'targetId', target."id",
                   'nmId', target."nmId"::text,
                   'placement', target."placement",
                   'targetKind', target."targetKind",
                   'normQueryWire', target."normQueryWire",
                   'currentBidChecksum', target."currentBidChecksum",
                   'currentBidConfirmedAt', target."lastConfirmedAt",
                   'minimumBidChecksum', target."minimumBidChecksum",
                   'minimumBidConfirmedAt', target."minimumBidConfirmedAt",
                   'recommendationFetchedAt', (
                     SELECT MAX(recommendation."fetchedAt")
                       FROM "SyncSourceSnapshot" recommendation
                      WHERE recommendation."campaignId" = campaign."id"
                        AND recommendation."dataKind" = 'BID_RECOMMENDATION'
                        AND recommendation."valid" = true
                        AND recommendation."normalizedData"->>'nmId' = target."nmId"::text
                   )
                 )
                 ORDER BY target."nmId", target."placement"
               ) FILTER (WHERE target."id" IS NOT NULL),
               '[]'::jsonb
             ) AS targets
        FROM "Campaign" campaign
        LEFT JOIN "CampaignTarget" target
          ON target."campaignId" = campaign."id"
          ${targetJoinFilter}
       WHERE campaign."supported" = true
         AND (${input.includeReadyCampaigns} OR campaign."status" <> 4)
         AND campaign."wbCampaignId" > ${input.afterWbCampaignId}
         ${campaignFilter}
         ${targetScopeFilter}
       GROUP BY campaign."id"
       ORDER BY campaign."wbCampaignId"
       LIMIT ${input.limit}
    `,
  );
}

/** Aggregate target/day row with bounded bid and source evidence. */
export interface DataSyncPerformanceCandidateRow {
  readonly atbs: string;
  readonly attributedRevenueMinor: string;
  readonly bidStates: readonly {
    readonly campaignStatus: number;
    readonly changeMarkerObserved: boolean;
    readonly configurationChecksum: string;
    readonly currentBidMinor: string | null;
    readonly observedAt: string | Date;
  }[];
  readonly bidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly clicks: string;
  readonly date: string;
  readonly enrolledAt: string | Date | null;
  readonly orderedUnits: string | null;
  readonly orders: string;
  readonly placementCount: number;
  readonly sourceReads: readonly {
    readonly checksum: string;
    readonly fetchedAt: string | Date;
  }[];
  readonly sourceVersion: string;
  readonly spendMinor: string;
  readonly targetId: string;
  readonly views: string | null;
}

/** Loads finalized-day candidates using the latest exact source-content version. */
export async function loadDataSyncPerformanceCandidates(
  database: DatabaseClient,
  input: {
    readonly campaignId: string;
    readonly conversionLagDays: number;
    readonly stableMinutes: number;
    readonly stableReads: number;
  },
): Promise<readonly DataSyncPerformanceCandidateRow[]> {
  return queryRaw<DataSyncPerformanceCandidateRow>(
    database,
    Prisma.sql`
      WITH latest_content AS (
        SELECT DISTINCT ON (
                 statistic."campaignId", statistic."nmId", statistic."date",
                 COALESCE(statistic."normQueryCanonical", ''),
                 statistic."normalizedAggregationKind"
               )
               statistic."campaignId", statistic."wbCampaignId", statistic."nmId",
               statistic."date", statistic."sourceVersion", statistic."normQueryWire",
               statistic."normQueryCanonical", statistic."normalizedAggregationKind"
          FROM "CampaignStatDaily" statistic
         WHERE statistic."campaignId" = ${input.campaignId}
           AND statistic."normalizedAggregationKind"
               IN ('FULLSTATS_APP_NM_LEAF', 'CLUSTER_DAILY')
         ORDER BY statistic."campaignId", statistic."nmId", statistic."date",
                  COALESCE(statistic."normQueryCanonical", ''),
                  statistic."normalizedAggregationKind",
                  statistic."fetchedAt" DESC, statistic."sourceVersion" DESC
      ),
      aggregate_day AS (
        SELECT statistic."campaignId", statistic."wbCampaignId", statistic."nmId",
               statistic."date", statistic."sourceVersion", statistic."normQueryWire",
               statistic."normQueryCanonical", statistic."normalizedAggregationKind",
               CASE WHEN bool_and(statistic."views" IS NOT NULL)
                    THEN SUM(statistic."views") END AS views,
               SUM(statistic."clicks") AS clicks,
               SUM(statistic."atbs") AS atbs,
               SUM(statistic."orders") AS orders,
               CASE WHEN bool_and(statistic."orderedUnits" IS NOT NULL)
                    THEN SUM(statistic."orderedUnits") END AS "orderedUnits",
               SUM(statistic."spendMinor") AS "spendMinor",
               SUM(statistic."attributedRevenueMinor") AS "attributedRevenueMinor"
          FROM "CampaignStatDaily" statistic
          JOIN latest_content latest
            ON latest."campaignId" = statistic."campaignId"
           AND latest."nmId" = statistic."nmId"
           AND latest."date" = statistic."date"
           AND latest."sourceVersion" = statistic."sourceVersion"
           AND latest."normQueryCanonical"
               IS NOT DISTINCT FROM statistic."normQueryCanonical"
           AND latest."normalizedAggregationKind" = statistic."normalizedAggregationKind"
         GROUP BY statistic."campaignId", statistic."wbCampaignId", statistic."nmId",
                  statistic."date", statistic."sourceVersion", statistic."normQueryWire",
                  statistic."normQueryCanonical", statistic."normalizedAggregationKind"
      )
      SELECT target."id" AS "targetId", aggregate_day."date"::text AS date,
             aggregate_day."sourceVersion", aggregate_day.views::text,
             aggregate_day.clicks::text, aggregate_day.atbs::text,
             aggregate_day.orders::text, aggregate_day."orderedUnits"::text,
             aggregate_day."spendMinor"::text,
             aggregate_day."attributedRevenueMinor"::text,
             campaign."bidType"::text AS "bidType",
             CASE WHEN target."targetKind" = 'CLUSTER' THEN 1 ELSE (
               SELECT COUNT(*)::integer
                 FROM "CampaignTarget" sibling
                WHERE sibling."campaignId" = target."campaignId"
                  AND sibling."nmId" = target."nmId"
                  AND sibling."targetKind" = 'CARD'
             ) END AS "placementCount",
             (
               SELECT MIN(enrollment."observedAt")
                 FROM "BidStateObservation" enrollment
                WHERE enrollment."targetId" = target."id"
             ) AS "enrolledAt",
             COALESCE(bid_evidence.items, '[]'::jsonb) AS "bidStates",
             COALESCE(source_evidence.items, '[]'::jsonb) AS "sourceReads"
        FROM aggregate_day
        JOIN "CampaignTarget" target
          ON target."campaignId" = aggregate_day."campaignId"
         AND target."nmId" = aggregate_day."nmId"
         AND (
           (
             aggregate_day."normalizedAggregationKind" = 'FULLSTATS_APP_NM_LEAF'
             AND target."targetKind" = 'CARD'
           )
           OR (
             aggregate_day."normalizedAggregationKind" = 'CLUSTER_DAILY'
             AND target."targetKind" = 'CLUSTER'
             AND target."normQueryCanonical" = aggregate_day."normQueryCanonical"
           )
         )
        JOIN "Campaign" campaign ON campaign."id" = target."campaignId"
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'observedAt', observation."observedAt",
                     'currentBidMinor', observation."currentBidMinor"::text,
                     'configurationChecksum', observation."configurationChecksum",
                     'changeMarkerObserved', observation."changeMarkerObserved",
                     'campaignStatus', observation."campaignStatus"
                   )
                   ORDER BY observation."observedAt"
                 ) AS items
            FROM (
              (SELECT candidate.*
                 FROM "BidStateObservation" candidate
                WHERE candidate."targetId" = target."id"
                  AND candidate."observedAt" <=
                      (aggregate_day."date"::timestamp AT TIME ZONE 'UTC')
                ORDER BY candidate."observedAt" DESC
                LIMIT 1)
              UNION ALL
              (SELECT candidate.*
                 FROM "BidStateObservation" candidate
                WHERE candidate."targetId" = target."id"
                  AND candidate."observedAt" >
                      (aggregate_day."date"::timestamp AT TIME ZONE 'UTC')
                  AND candidate."observedAt" <
                      (aggregate_day."date"::timestamp AT TIME ZONE 'UTC')
                        + INTERVAL '1 day'
                ORDER BY candidate."observedAt")
              UNION ALL
              (SELECT candidate.*
                 FROM "BidStateObservation" candidate
                WHERE candidate."targetId" = target."id"
                  AND candidate."observedAt" >=
                      (aggregate_day."date"::timestamp AT TIME ZONE 'UTC')
                        + INTERVAL '1 day'
                ORDER BY candidate."observedAt"
                LIMIT 1)
            ) observation
        ) bid_evidence ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'checksum', stable."sourceChecksum",
                     'fetchedAt', stable."fetchedAt"
                   )
                   ORDER BY stable."fetchedAt"
                 ) AS items
            FROM (
              SELECT ranked."sourceChecksum", ranked."fetchedAt"
                FROM (
                  SELECT source."sourceChecksum", source."fetchedAt",
                         row_number() OVER (ORDER BY source."fetchedAt") AS sequence,
                         MIN(source."fetchedAt") OVER () AS first_read
                    FROM "SyncSourceSnapshot" source
                   WHERE source."campaignId" = aggregate_day."campaignId"
                     AND source."dataKind" = CASE
                       WHEN aggregate_day."normalizedAggregationKind" = 'CLUSTER_DAILY'
                         THEN 'CLUSTER_STATISTICS'::"SyncDataKind"
                       ELSE 'CAMPAIGN_STATISTICS'::"SyncDataKind"
                     END
                     AND (
                       aggregate_day."normalizedAggregationKind" <> 'CLUSTER_DAILY'
                       OR source."targetId" = target."id"
                     )
                     AND source."sourceDate" = aggregate_day."date"
                     AND source."sourceChecksum" = aggregate_day."sourceVersion"
                     AND source."valid" = true
                     AND source."fetchedAt" >=
                         (aggregate_day."date"::timestamp AT TIME ZONE 'UTC')
                           + INTERVAL '1 day'
                           + (${input.conversionLagDays} * INTERVAL '1 day')
                ) ranked
               WHERE ranked.sequence < ${input.stableReads}
                  OR ranked."fetchedAt" >=
                     ranked.first_read + (${input.stableMinutes} * INTERVAL '1 minute')
               ORDER BY ranked."fetchedAt"
               LIMIT ${input.stableReads}
            ) stable
        ) source_evidence ON true
       ORDER BY target."id", aggregate_day."date"
    `,
  );
}
