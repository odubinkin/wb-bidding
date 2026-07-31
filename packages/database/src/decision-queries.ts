import { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './client.js';
import { queryRaw } from './raw.js';

/** One target row used to reconstruct a deterministic decision input. */
export interface DecisionTargetRow {
  readonly activeExperimentStatus: string | null;
  readonly applyEligible: boolean | null;
  readonly bidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignAutomation: string | null;
  readonly campaignId: string;
  readonly campaignStatus: number;
  readonly capability: string;
  readonly coherentRegimeChecksum: string | null;
  readonly currentBidMinor: bigint | null;
  readonly dailyAnchorBidMinor: bigint | null;
  readonly economicsId: string | null;
  readonly economicsVersion: bigint | null;
  readonly expectedContributionMinor: bigint | null;
  readonly lastWriteAt: Date | null;
  readonly minimumBidMinor: bigint | null;
  readonly nmId: bigint;
  readonly normQueryCanonical: string | null;
  readonly paymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly placement: string;
  readonly policyConfiguration: unknown;
  readonly policyId: string;
  readonly policyVersion: bigint;
  readonly recommendationData: unknown;
  readonly recommendationFetchedAt: Date | null;
  readonly recommendationSourceChecksum: string | null;
  readonly sameDaySpendData: unknown;
  readonly sameDaySpendFetchedAt: Date | null;
  readonly siblingPlacements: number;
  readonly targetAutomation: string | null;
  readonly targetId: string;
  readonly targetKind: 'CARD' | 'CLUSTER';
  readonly wbCampaignId: bigint;
}

/** Raw finalized-day row used by the deterministic decision input mapper. */
export interface DecisionPerformanceDayRow {
  readonly clicks: bigint;
  readonly confirmedBidMinor: bigint;
  readonly configurationChecksum: string;
  readonly date: string;
  readonly inputChecksum: string;
  readonly orderedUnits: bigint | null;
  readonly spendMinor: bigint;
  readonly views: bigint | null;
}

/** Inputs for one bounded decision-target page. */
export interface DecisionTargetPageQuery {
  readonly accountTimezone: string;
  readonly campaignIds?: readonly string[];
  readonly cursor: string;
  readonly decisionAt: Date;
  readonly endpointProfileId: string;
  readonly pageSize: number;
  readonly targetIds?: readonly string[];
}

/**
 * Loads a policy/evidence/economics-resolved target page.
 *
 * PostgreSQL lateral joins, JSON extraction, timezone truncation, and scoped
 * policy precedence cannot be represented faithfully by generated Prisma
 * delegates, so this read model is isolated in the shared raw-SQL boundary.
 *
 * @param database - Shared Prisma Client.
 * @param input - Stable page and model-time inputs.
 * @returns Resolved target rows.
 */
export async function loadDecisionTargetPage(
  database: DatabaseClient,
  input: DecisionTargetPageQuery,
): Promise<readonly DecisionTargetRow[]> {
  const campaignFilter =
    input.campaignIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND target."campaignId" IN (${Prisma.join(input.campaignIds)})`;
  const targetFilter =
    input.targetIds === undefined
      ? Prisma.empty
      : Prisma.sql`AND target."id" IN (${Prisma.join(input.targetIds)})`;
  return queryRaw<DecisionTargetRow>(
    database,
    Prisma.sql`
      SELECT target."id" AS "targetId", target."campaignId", target."nmId",
             target."targetKind"::text, target."placement"::text,
             target."normQueryCanonical", target."currentBidMinor",
             target."minimumBidMinor", target."capability",
             campaign."wbCampaignId", campaign."status" AS "campaignStatus",
             campaign."bidType"::text, campaign."paymentType"::text,
             snapshot."applyEligible", snapshot."coherentRegimeChecksum",
             economics."id" AS "economicsId", economics."version" AS "economicsVersion",
             economics."expectedContributionBeforeAdsMinor" AS "expectedContributionMinor",
             policy."id" AS "policyId", policy."version" AS "policyVersion",
             policy."configuration" AS "policyConfiguration",
             recommendation."normalizedData" AS "recommendationData",
             recommendation."fetchedAt" AS "recommendationFetchedAt",
             recommendation."sourceChecksum" AS "recommendationSourceChecksum",
             same_day_spend."normalizedData" AS "sameDaySpendData",
             same_day_spend."fetchedAt" AS "sameDaySpendFetchedAt",
             campaign_automation."mode"::text AS "campaignAutomation",
             target_automation."mode"::text AS "targetAutomation",
             active_experiment."status"::text AS "activeExperimentStatus",
             COALESCE(placements."count", 0)::integer AS "siblingPlacements",
             last_write."verifiedAt" AS "lastWriteAt",
             daily_anchor."currentBidMinor" AS "dailyAnchorBidMinor"
        FROM "CampaignTarget" target
        JOIN "Campaign" campaign ON campaign."id" = target."campaignId"
        LEFT JOIN LATERAL (
          SELECT candidate."applyEligible", candidate."coherentRegimeChecksum"
            FROM "TargetDataSnapshot" candidate
           WHERE candidate."targetId" = target."id"
           ORDER BY candidate."createdAt" DESC
           LIMIT 1
        ) snapshot ON true
        LEFT JOIN LATERAL (
          SELECT source."normalizedData", source."fetchedAt", source."sourceChecksum"
            FROM "SyncSourceSnapshot" source
           WHERE source."campaignId" = campaign."id"
             AND source."dataKind" = 'BID_RECOMMENDATION'
             AND source."valid" = true
             AND source."endpointProfile" = ${input.endpointProfileId}
             AND source."normalizedData"->>'nmId' = target."nmId"::text
           ORDER BY source."fetchedAt" DESC, source."createdAt" DESC
           LIMIT 1
        ) recommendation ON true
        LEFT JOIN LATERAL (
          SELECT source."normalizedData", source."fetchedAt"
            FROM "SyncSourceSnapshot" source
           WHERE source."targetId" = target."id"
             AND source."dataKind" = 'SAME_DAY_SPEND'
             AND source."valid" = true
             AND source."endpointProfile" = ${input.endpointProfileId}
           ORDER BY source."fetchedAt" DESC, source."createdAt" DESC
           LIMIT 1
        ) same_day_spend ON true
        LEFT JOIN LATERAL (
          SELECT candidate."id", candidate."version",
                 candidate."expectedContributionBeforeAdsMinor"
            FROM "ProductEconomics" candidate
           WHERE candidate."nmId" = target."nmId"
             AND candidate."effectiveFrom" <= ${input.decisionAt}
             AND (
               candidate."effectiveTo" IS NULL
               OR candidate."effectiveTo" > ${input.decisionAt}
             )
           ORDER BY candidate."effectiveFrom" DESC, candidate."version" DESC
           LIMIT 1
        ) economics ON true
        JOIN LATERAL (
          SELECT candidate."id", candidate."version", candidate."configuration"
            FROM "BiddingPolicy" candidate
           WHERE candidate."enabled" = true
             AND candidate."validFrom" <= ${input.decisionAt}
             AND (
               candidate."validTo" IS NULL
               OR candidate."validTo" > ${input.decisionAt}
             )
             AND (
               (candidate."scope" = 'TARGET' AND candidate."targetId" = target."id")
               OR (
                 candidate."scope" = 'CAMPAIGN'
                 AND candidate."campaignId" = campaign."id"
               )
               OR candidate."scope" = 'DEPLOYMENT'
             )
           ORDER BY
             CASE candidate."scope"
               WHEN 'TARGET' THEN 1
               WHEN 'CAMPAIGN' THEN 2
               ELSE 3
             END,
             candidate."version" DESC
           LIMIT 1
        ) policy ON true
        LEFT JOIN "CampaignAutomation" campaign_automation
          ON campaign_automation."campaignId" = campaign."id"
        LEFT JOIN "TargetAutomation" target_automation
          ON target_automation."targetId" = target."id"
        LEFT JOIN LATERAL (
          SELECT experiment."status"
            FROM "BidExperiment" experiment
           WHERE experiment."targetId" = target."id"
             AND experiment."status" IN
                 ('PLANNED','ACTIVE','COLLECTING','EVALUATING','REVERTING')
           ORDER BY experiment."createdAt" DESC
           LIMIT 1
        ) active_experiment ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(DISTINCT sibling."placement") AS "count"
            FROM "CampaignTarget" sibling
           WHERE sibling."campaignId" = target."campaignId"
             AND sibling."nmId" = target."nmId"
             AND sibling."targetKind" = 'CARD'
        ) placements ON true
        LEFT JOIN LATERAL (
          SELECT queue."verifiedAt"
            FROM "BidDecision" prior
            JOIN "DecisionQueueItem" queue ON queue."decisionId" = prior."id"
           WHERE prior."targetId" = target."id"
             AND queue."status" = 'APPLIED'
           ORDER BY queue."verifiedAt" DESC NULLS LAST
           LIMIT 1
        ) last_write ON true
        LEFT JOIN LATERAL (
          SELECT prior."currentBidMinor"
            FROM "BidDecision" prior
            JOIN "DecisionQueueItem" queue ON queue."decisionId" = prior."id"
           WHERE prior."targetId" = target."id"
             AND queue."status" = 'APPLIED'
             AND queue."verifiedAt" >= (
               date_trunc(
                 'day',
                 ${input.decisionAt}::timestamptz AT TIME ZONE ${input.accountTimezone}
               ) AT TIME ZONE ${input.accountTimezone}
             )
           ORDER BY queue."verifiedAt", prior."createdAt"
           LIMIT 1
        ) daily_anchor ON true
       WHERE campaign."supported" = true
         AND campaign."status" IN (9, 11)
         AND target."id" > ${input.cursor}::uuid
         ${campaignFilter}
         ${targetFilter}
       ORDER BY target."id"
       LIMIT ${input.pageSize}
    `,
  );
}

/**
 * Loads finalized performance days inside one decision baseline horizon.
 *
 * The JSON checksum fallback and date interval arithmetic are isolated here
 * because they are PostgreSQL read-model operations.
 *
 * @param database - Shared Prisma Client.
 * @param targetId - Target UUID.
 * @param windowDays - Inclusive historical horizon.
 * @param anchorDate - Account-local decision date.
 * @returns Chronological finalized day rows.
 */
export async function loadDecisionPerformanceDayRows(
  database: DatabaseClient,
  targetId: string,
  windowDays: number,
  anchorDate: string,
): Promise<readonly DecisionPerformanceDayRow[]> {
  return queryRaw<DecisionPerformanceDayRow>(
    database,
    Prisma.sql`
      SELECT "wbStatisticDate"::text AS date, "confirmedBidMinor",
             "clicksDelta" AS clicks, "orderedUnitsDelta" AS "orderedUnits",
             "spendDeltaMinor" AS "spendMinor", "viewsDelta" AS views,
             "inputChecksum",
             COALESCE(
               "activePlacementConfig"->>'configurationChecksum',
               "inputChecksum"
             ) AS "configurationChecksum"
        FROM "BidPerformanceDay"
       WHERE "targetId" = ${targetId}::uuid
         AND "status" = 'FINALIZED'
         AND "wbStatisticDate" >=
             ${anchorDate}::date - (${windowDays} * INTERVAL '1 day')
       ORDER BY "wbStatisticDate", "confirmedBidMinor"
    `,
  );
}
