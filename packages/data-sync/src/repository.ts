import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { accountSettingsChecksum, validateAccountBindingTransition } from './binding.js';
import { evidenceChecksum } from './checksum.js';
import type {
  AccountBindingCandidate,
  ExistingAccountBinding,
  PerformanceDayAssessment,
  PerformanceDayCandidate,
  SyncDataKind,
  TargetSnapshotAssessment,
} from './types.js';
import type { CampaignDetailsResponse, MinimumBidsResponse } from '@wb-bidder/wb-api';

const BINDING_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Context supplied to one non-overlapping scheduler run.
 */
export interface SchedulerRunContext {
  /** Deadline cancellation signal. */
  readonly signal: AbortSignal;
  /** Persisted run identifier. */
  readonly runId: string;
  /** Absolute deadline. */
  readonly deadlineAt: Date;
}

/**
 * Scheduler execution result.
 */
export interface SchedulerRunResult<T> {
  /** Worker result when a run started. */
  readonly result?: T;
  /** Persisted run identifier. */
  readonly runId?: string;
  /** Whether this replica acquired the job lock. */
  readonly started: boolean;
}

/**
 * Immutable source-snapshot write.
 */
export interface SourceSnapshotWrite {
  /** Optional local campaign UUID. */
  readonly campaignId?: string;
  /** Logical data kind. */
  readonly dataKind: SyncDataKind;
  /** Embedded endpoint profile. */
  readonly endpointProfile: string;
  /** Observation time. */
  readonly fetchedAt: Date;
  /** Normalization failure reason. */
  readonly invalidReason?: string;
  /** Redacted normalized payload. */
  readonly normalizedData: unknown;
  /** Optional WB statistical date. */
  readonly sourceDate?: string;
  /** Immutable source checksum. */
  readonly sourceChecksum: string;
  /** Scheduler run UUID. */
  readonly syncRunId: string;
  /** Optional local target UUID. */
  readonly targetId?: string;
  /** Whether the source is valid for its declared semantics. */
  readonly valid: boolean;
}

/**
 * Bounded campaign work row used by the slow data-sync job.
 */
export interface CampaignWorkItem {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Bid strategy. */
  readonly bidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  /** Immutable campaign-details checksum. */
  readonly detailsChecksum: string | null;
  /** Campaign-details observation time. */
  readonly detailsFetchedAt: Date | null;
  /** Article/placement targets. */
  readonly targets: readonly {
    /** Current-bid checksum. */
    readonly currentBidChecksum: string | null;
    /** Current-bid confirmation time. */
    readonly currentBidConfirmedAt: Date | null;
    /** Minimum-bid checksum. */
    readonly minimumBidChecksum: string | null;
    /** Minimum-bid confirmation time. */
    readonly minimumBidConfirmedAt: Date | null;
    readonly nmId: bigint;
    readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
    readonly targetId: string;
  }[];
  /** Payment type. */
  readonly paymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * PostgreSQL persistence boundary for synchronization, evidence, and leases.
 */
export class DataSyncRepository {
  /**
   * Creates a repository over the deployment pool.
   *
   * @param pool - Shared PostgreSQL pool.
   */
  public constructor(private readonly pool: Pool) {}

  /**
   * Creates or validates the singleton account binding under a transaction lock.
   *
   * @param candidate - Identity confirmed by an authorized WB call.
   * @param correlationId - Correlation UUID for append-only audit.
   * @returns Allowed transition and binding version.
   */
  public async ensureAccountBinding(
    candidate: AccountBindingCandidate,
    correlationId: string,
  ): Promise<{ readonly transition: string; readonly version: bigint }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('deployment-account-binding', 0))",
      );
      const existingResult = await client.query<BindingRow>(
        `SELECT "sellerSid", "wbEnvironment", "tokenType", "tokenCategory", "tokenFor",
                "tokenAccessFingerprint", "accountCurrency", "accountTimezone",
                "accountSettingsChecksum", "bindingVersion"
           FROM "DeploymentAccountBinding"
          WHERE "id" = $1
          FOR UPDATE`,
        [BINDING_ID],
      );
      const existing =
        existingResult.rows[0] === undefined ? null : mapExistingBinding(existingResult.rows[0]);
      const businessDataExists = existing === null ? await hasBusinessData(client) : false;
      const transition = validateAccountBindingTransition(existing, candidate, businessDataExists);
      const settingsChecksum = accountSettingsChecksum(
        candidate.accountCurrency,
        candidate.accountTimezone,
      );
      const now = new Date();
      let version: bigint;
      if (transition === 'CREATE') {
        version = 1n;
        await client.query(
          `INSERT INTO "DeploymentAccountBinding"
             ("id", "sellerSid", "wbEnvironment", "tokenType", "tokenCategory", "tokenFor",
              "tokenAccessFingerprint", "accountCurrency", "accountTimezone",
              "accountSettingsSource", "accountSettingsChecksum", "initializedAt",
              "lastValidatedAt", "bindingVersion")
           VALUES ($1, $2, $3::"WbEnvironment", $4::"WbTokenType", $5, $6, $7, $8, $9,
                   'ENV_OPERATOR_PROVISIONED', $10, $11, $11, 1)`,
          [
            BINDING_ID,
            candidate.sellerSid,
            candidate.environment,
            candidate.tokenType,
            candidate.tokenCategory,
            candidate.tokenFor,
            candidate.tokenFingerprint,
            candidate.accountCurrency,
            candidate.accountTimezone,
            settingsChecksum,
            now,
          ],
        );
      } else {
        const changesIdentityToken = transition === 'ROTATE' || transition === 'UPGRADE';
        version = (existing?.bindingVersion ?? 0n) + (changesIdentityToken ? 1n : 0n);
        await client.query(
          `UPDATE "DeploymentAccountBinding"
              SET "tokenType" = $2::"WbTokenType",
                  "tokenFor" = $3,
                  "tokenAccessFingerprint" = $4,
                  "lastValidatedAt" = $5,
                  "bindingVersion" = $6
            WHERE "id" = $1`,
          [
            BINDING_ID,
            candidate.tokenType,
            candidate.tokenFor,
            candidate.tokenFingerprint,
            now,
            version.toString(),
          ],
        );
      }
      await appendAudit(client, {
        action: `ACCOUNT_BINDING_${transition}`,
        actor: 'SYSTEM',
        after: {
          bindingVersion: version.toString(),
          environment: candidate.environment,
          sellerSid: candidate.sellerSid,
          tokenType: candidate.tokenType,
        },
        correlationId,
        entityId: BINDING_ID,
        entityType: 'DeploymentAccountBinding',
      });
      await client.query('COMMIT');
      return Object.freeze({ transition, version });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs one job under a session advisory lock and persisted deadline.
   *
   * @template T - Worker result.
   * @param jobType - Stable job identity.
   * @param deadlineMs - Positive run deadline.
   * @param worker - Job body.
   * @returns Started flag and worker result.
   */
  public async withSchedulerRun<T>(
    jobType: string,
    deadlineMs: number,
    worker: (context: SchedulerRunContext) => Promise<T>,
  ): Promise<SchedulerRunResult<T>> {
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
      throw new Error('Scheduler deadline must be a positive integer');
    }
    const client = await this.pool.connect();
    const lock = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [`scheduler:${jobType}`],
    );
    if (lock.rows[0]?.acquired !== true) {
      client.release();
      return Object.freeze({ started: false });
    }
    const runId = randomUUID();
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + deadlineMs);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('Scheduler run deadline exceeded'));
    }, deadlineMs);
    try {
      await client.query(
        `INSERT INTO "SchedulerRun"
           ("id", "jobType", "startedAt", "deadlineAt", "status", "counters", "leaseOwner", "leaseUntil")
         VALUES ($1, $2, $3, $4, 'RUNNING', '{}'::jsonb, $5, $4)`,
        [runId, jobType, startedAt, deadlineAt, `pid:${String(process.pid)}`],
      );
      const result = await worker(Object.freeze({ deadlineAt, runId, signal: controller.signal }));
      const deadlineExceeded = controller.signal.aborted || Date.now() > deadlineAt.getTime();
      await client.query(
        `UPDATE "SchedulerRun"
            SET "endedAt" = NOW(),
                "status" = $2::"SchedulerRunStatus",
                "leaseUntil" = NULL
          WHERE "id" = $1`,
        [runId, deadlineExceeded ? 'DEADLINE_EXCEEDED' : 'SUCCEEDED'],
      );
      return Object.freeze({ result, runId, started: true });
    } catch (error: unknown) {
      await client.query(
        `UPDATE "SchedulerRun"
            SET "endedAt" = NOW(),
                "status" = $2::"SchedulerRunStatus",
                "errorSummary" = $3::jsonb,
                "leaseUntil" = NULL
          WHERE "id" = $1`,
        [
          runId,
          controller.signal.aborted ? 'DEADLINE_EXCEEDED' : 'FAILED',
          JSON.stringify({ code: 'JOB_FAILED', message: safeErrorMessage(error) }),
        ],
      );
      throw error;
    } finally {
      clearTimeout(timer);
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
        `scheduler:${jobType}`,
      ]);
      client.release();
    }
  }

  /**
   * Upserts validated campaign details, card targets, and current-bid observations atomically.
   *
   * @param details - Runtime-validated WB response.
   * @param fetchedAt - Observation time.
   * @param syncRunId - Scheduler run UUID.
   * @param externalWriteControlMode - External-write provenance guarantee.
   * @returns Number of campaigns and card targets processed.
   */
  public async upsertCampaignDetails(
    details: CampaignDetailsResponse,
    fetchedAt: Date,
    syncRunId: string,
    externalWriteControlMode: 'EXCLUSIVE' | 'SHARED',
  ): Promise<{ readonly campaigns: number; readonly targets: number }> {
    const client = await this.pool.connect();
    let targetCount = 0;
    try {
      await client.query('BEGIN');
      for (const campaign of details.adverts) {
        const detailsChecksum = evidenceChecksum(campaign);
        const campaignResult = await client.query<{ id: string }>(
          `INSERT INTO "Campaign"
             ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
              "lastSyncedAt", "supported", "unsupportedReason", "detailsFetchedAt",
              "detailsChecksum", "detailsSyncRunId")
           VALUES ($1, $2, 9, $3, $4::"CampaignBidType", $5::"CampaignPaymentType", $6,
                   $7, $8, $9, $7, $10, $11)
           ON CONFLICT ("wbCampaignId") DO UPDATE SET
             "status" = EXCLUDED."status",
             "bidType" = EXCLUDED."bidType",
             "paymentType" = EXCLUDED."paymentType",
             "name" = EXCLUDED."name",
             "lastSyncedAt" = EXCLUDED."lastSyncedAt",
             "supported" = EXCLUDED."supported",
             "unsupportedReason" = EXCLUDED."unsupportedReason",
             "detailsFetchedAt" = EXCLUDED."detailsFetchedAt",
             "detailsChecksum" = EXCLUDED."detailsChecksum",
             "detailsSyncRunId" = EXCLUDED."detailsSyncRunId"
           RETURNING "id"`,
          [
            randomUUID(),
            String(campaign.id),
            campaign.status,
            campaign.bid_type.toUpperCase(),
            campaign.settings.payment_type.toUpperCase(),
            campaign.settings.name,
            fetchedAt,
            campaign.status !== 4,
            campaign.status === 4 ? 'CAMPAIGN_NOT_RUNNING' : null,
            detailsChecksum,
            syncRunId,
          ],
        );
        const campaignId = campaignResult.rows[0]?.id;
        if (campaignId === undefined) {
          throw new Error('Campaign upsert did not return an identifier');
        }
        for (const nm of campaign.nm_settings) {
          const placements = activeCardPlacements(campaign.settings.placements);
          for (const placement of placements) {
            const bidMinor =
              placement === 'SEARCH' ? nm.bids_kopecks.search : nm.bids_kopecks.recommendations;
            const bidChecksum = evidenceChecksum({
              bidMinor,
              detailsChecksum,
              placement,
            });
            const targetResult = await client.query<{ id: string }>(
              `INSERT INTO "CampaignTarget"
                 ("id", "campaignId", "nmId", "targetKind", "placement", "currentBidMinor",
                  "lastConfirmedAt", "currentBidChecksum", "currentBidSyncRunId", "capability")
               VALUES ($1, $2, $3, 'CARD', $4::"CampaignPlacement", $5, $6, $7, $8,
                       'OBSERVE_ONLY')
               ON CONFLICT ("campaignId", "nmId", "placement")
                 WHERE "targetKind" = 'CARD'
               DO UPDATE SET
                 "currentBidMinor" = EXCLUDED."currentBidMinor",
                 "lastConfirmedAt" = EXCLUDED."lastConfirmedAt",
                 "currentBidChecksum" = EXCLUDED."currentBidChecksum",
                 "currentBidSyncRunId" = EXCLUDED."currentBidSyncRunId"
               RETURNING "id"`,
              [
                randomUUID(),
                campaignId,
                String(nm.nm_id),
                placement,
                String(bidMinor),
                fetchedAt,
                bidChecksum,
                syncRunId,
              ],
            );
            const targetId = targetResult.rows[0]?.id;
            if (targetId === undefined) {
              throw new Error('Campaign target upsert did not return an identifier');
            }
            await client.query(
              `INSERT INTO "BidStateObservation"
                 ("id", "targetId", "observedAt", "currentBidMinor", "campaignStatus",
                  "bidType", "paymentType", "activePlacementConfig",
                  "configurationChecksum", "syncRunId", "externalWriteControlMode",
                  "changeMarkerObserved")
               VALUES ($1, $2, $3, $4, $5, $6::"CampaignBidType",
                       $7::"CampaignPaymentType", $8::jsonb, $9, $10,
                       $11::"ExternalWriteControlMode", $12)
               ON CONFLICT ("targetId", "observedAt", "configurationChecksum") DO NOTHING`,
              [
                randomUUID(),
                targetId,
                fetchedAt,
                String(bidMinor),
                campaign.status,
                campaign.bid_type.toUpperCase(),
                campaign.settings.payment_type.toUpperCase(),
                JSON.stringify(campaign.settings.placements),
                evidenceChecksum({
                  bidType: campaign.bid_type,
                  paymentType: campaign.settings.payment_type,
                  placements: campaign.settings.placements,
                  status: campaign.status,
                }),
                syncRunId,
                externalWriteControlMode,
                externalWriteControlMode === 'EXCLUSIVE',
              ],
            );
            targetCount += 1;
          }
        }
      }
      await client.query('COMMIT');
      return Object.freeze({ campaigns: details.adverts.length, targets: targetCount });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Records campaign discovery without treating missing details as supported.
   *
   * @param campaigns - WB identifiers and discovery status/type.
   * @param fetchedAt - Discovery time.
   * @returns Number of discovered rows.
   */
  public async upsertDiscoveredCampaigns(
    campaigns: readonly {
      readonly status: number;
      readonly type: number;
      readonly wbCampaignId: number;
    }[],
    fetchedAt: Date,
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const campaign of campaigns) {
        await client.query(
          `INSERT INTO "Campaign"
             ("id", "wbCampaignId", "type", "status", "bidType", "paymentType", "name",
              "lastSyncedAt", "supported", "unsupportedReason")
           VALUES ($1, $2, $3, $4, 'UNKNOWN', 'UNKNOWN', '', $5, false, 'DETAILS_PENDING')
           ON CONFLICT ("wbCampaignId") DO UPDATE SET
             "type" = EXCLUDED."type",
             "status" = EXCLUDED."status",
             "lastSyncedAt" = EXCLUDED."lastSyncedAt"`,
          [randomUUID(), String(campaign.wbCampaignId), campaign.type, campaign.status, fetchedAt],
        );
      }
      await client.query('COMMIT');
      return campaigns.length;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Loads one bounded supported-campaign page after a stable WB-ID cursor.
   *
   * @param afterWbCampaignId - Exclusive cursor, or zero for the first page.
   * @param limit - Bounded page size.
   * @returns Work rows ordered by WB campaign ID.
   */
  public async loadCampaignWorkPage(
    afterWbCampaignId: bigint,
    limit: number,
  ): Promise<readonly CampaignWorkItem[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5_000) {
      throw new Error('Campaign work page limit is out of range');
    }
    const result = await this.pool.query<CampaignWorkRow>(
      `SELECT c."id" AS "campaignId", c."wbCampaignId", c."bidType", c."paymentType",
              c."detailsChecksum", c."detailsFetchedAt",
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'targetId', t."id",
                    'nmId', t."nmId"::text,
                    'placement', t."placement",
                    'currentBidChecksum', t."currentBidChecksum",
                    'currentBidConfirmedAt', t."lastConfirmedAt",
                    'minimumBidChecksum', t."minimumBidChecksum",
                    'minimumBidConfirmedAt', t."minimumBidConfirmedAt"
                  ) ORDER BY t."nmId", t."placement"
                ) FILTER (WHERE t."id" IS NOT NULL),
                '[]'::jsonb
              ) AS targets
         FROM "Campaign" c
         LEFT JOIN "CampaignTarget" t
           ON t."campaignId" = c."id" AND t."targetKind" = 'CARD'
        WHERE c."supported" = true
          AND c."status" <> 4
          AND c."wbCampaignId" > $1
        GROUP BY c."id"
        ORDER BY c."wbCampaignId"
        LIMIT $2`,
      [afterWbCampaignId.toString(), limit],
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          bidType: row.bidType,
          campaignId: row.campaignId,
          detailsChecksum: row.detailsChecksum,
          detailsFetchedAt: row.detailsFetchedAt === null ? null : new Date(row.detailsFetchedAt),
          paymentType: row.paymentType,
          targets: Object.freeze(
            row.targets.map((target) =>
              Object.freeze({
                currentBidChecksum: target.currentBidChecksum,
                currentBidConfirmedAt:
                  target.currentBidConfirmedAt === null
                    ? null
                    : new Date(target.currentBidConfirmedAt),
                minimumBidChecksum: target.minimumBidChecksum,
                minimumBidConfirmedAt:
                  target.minimumBidConfirmedAt === null
                    ? null
                    : new Date(target.minimumBidConfirmedAt),
                nmId: BigInt(target.nmId),
                placement: target.placement,
                targetId: target.targetId,
              }),
            ),
          ),
          wbCampaignId: BigInt(row.wbCampaignId),
        }),
      ),
    );
  }

  /**
   * Reads the numeric cursor stored for a synchronization data kind.
   *
   * @param dataKind - Independent checkpoint identity.
   * @returns Cursor or zero when no pass has started.
   */
  public async loadNumericCheckpoint(dataKind: SyncDataKind): Promise<bigint> {
    const result = await this.pool.query<{ cursor: { value?: unknown } }>(
      `SELECT "cursor" FROM "SyncCheckpoint" WHERE "dataKind" = $1::"SyncDataKind"`,
      [dataKind],
    );
    const value = result.rows[0]?.cursor.value;
    return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : 0n;
  }

  /**
   * Updates card minimum bids without transferring card semantics to cluster targets.
   *
   * @param campaignId - Local campaign UUID.
   * @param response - Runtime-validated WB response in kopecks.
   * @param placement - Requested card placement.
   * @param fetchedAt - Observation time.
   * @param syncRunId - Scheduler run UUID.
   * @returns Updated target count.
   */
  public async applyMinimumBids(
    campaignId: string,
    response: MinimumBidsResponse,
    placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH',
    fetchedAt: Date,
    syncRunId: string,
  ): Promise<number> {
    let updated = 0;
    for (const row of response.bids) {
      const minimum = row.bids.find(
        (item) =>
          item.type.toUpperCase() === placement ||
          (item.type === 'recommendation' && placement === 'RECOMMENDATIONS'),
      );
      if (minimum === undefined) {
        continue;
      }
      const checksum = evidenceChecksum({ minimum: minimum.value, placement });
      const result = await this.pool.query(
        `UPDATE "CampaignTarget"
            SET "minimumBidMinor" = $4,
                "minimumBidConfirmedAt" = $5,
                "minimumBidChecksum" = $6,
                "minimumBidSyncRunId" = $7,
                "capability" = CASE
                  WHEN "currentBidMinor" IS NOT NULL THEN 'CARD_WRITE_READY'
                  ELSE 'OBSERVE_ONLY'
                END
          WHERE "campaignId" = $1
            AND "nmId" = $2
            AND "targetKind" = 'CARD'
            AND "placement" = $3::"CampaignPlacement"`,
        [
          campaignId,
          String(row.nm_id),
          placement,
          String(minimum.value),
          fetchedAt,
          checksum,
          syncRunId,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  /**
   * Upserts exactly the cluster queries returned by WB without synthesizing hidden clusters.
   *
   * @param campaignId - Local campaign UUID.
   * @param nmId - WB article identifier.
   * @param normQueries - Exact wire/canonical pairs after collision checks.
   * @returns Upserted cluster-target count.
   */
  public async upsertClusterTargets(
    campaignId: string,
    nmId: bigint,
    normQueries: readonly {
      readonly canonical: string;
      readonly wire: string;
    }[],
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const query of normQueries) {
        await client.query(
          `INSERT INTO "CampaignTarget"
             ("id", "campaignId", "nmId", "targetKind", "placement",
              "normQueryWire", "normQueryCanonical", "clusterBidState", "capability")
           VALUES ($1, $2, $3, 'CLUSTER', 'SEARCH', $4, $5, 'UNKNOWN', 'OBSERVE_ONLY')
           ON CONFLICT ("campaignId", "nmId", "placement", "normQueryCanonical")
             WHERE "targetKind" = 'CLUSTER'
           DO UPDATE SET "normQueryWire" = EXCLUDED."normQueryWire"`,
          [randomUUID(), campaignId, nmId.toString(), query.wire, query.canonical],
        );
      }
      await client.query('COMMIT');
      return normQueries.length;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Inserts one immutable normalized source snapshot idempotently.
   *
   * @param snapshot - Source write.
   * @returns Snapshot UUID, existing or newly inserted.
   */
  public async recordSourceSnapshot(snapshot: SourceSnapshotWrite): Promise<string> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO "SyncSourceSnapshot"
         ("id", "dataKind", "campaignId", "targetId", "sourceDate", "fetchedAt",
          "endpointProfile", "sourceChecksum", "normalizedData", "valid",
          "invalidReason", "syncRunId")
       VALUES ($1, $2::"SyncDataKind", $3, $4, $5::date, $6, $7, $8, $9::jsonb, $10, $11, $12)
       ON CONFLICT DO NOTHING
       RETURNING "id"`,
      [
        id,
        snapshot.dataKind,
        snapshot.campaignId ?? null,
        snapshot.targetId ?? null,
        snapshot.sourceDate ?? null,
        snapshot.fetchedAt,
        snapshot.endpointProfile,
        snapshot.sourceChecksum,
        safeJson(snapshot.normalizedData),
        snapshot.valid,
        snapshot.invalidReason ?? null,
        snapshot.syncRunId,
      ],
    );
    if (result.rows[0]?.id !== undefined) {
      return result.rows[0].id;
    }
    const existing = await this.pool.query<{ id: string }>(
      `SELECT "id"
         FROM "SyncSourceSnapshot"
        WHERE "dataKind" = $1::"SyncDataKind"
          AND "campaignId" IS NOT DISTINCT FROM $2
          AND "targetId" IS NOT DISTINCT FROM $3
          AND "sourceDate" IS NOT DISTINCT FROM $4::date
          AND "sourceChecksum" = $5`,
      [
        snapshot.dataKind,
        snapshot.campaignId ?? null,
        snapshot.targetId ?? null,
        snapshot.sourceDate ?? null,
        snapshot.sourceChecksum,
      ],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId === undefined) {
      throw new Error('Source snapshot idempotency lookup failed');
    }
    return existingId;
  }

  /**
   * Persists one atomic target-level eligibility snapshot.
   *
   * @param targetId - Local target UUID.
   * @param syncRunId - Scheduler run UUID.
   * @param createdAt - Snapshot time.
   * @param assessment - Pure eligibility result.
   * @param requiredSourceVersions - Data-kind to checksum mapping.
   * @returns Snapshot UUID.
   */
  public async recordTargetSnapshot(
    targetId: string,
    syncRunId: string,
    createdAt: Date,
    assessment: TargetSnapshotAssessment,
    requiredSourceVersions: Readonly<Record<string, string>>,
  ): Promise<string> {
    const inputChecksum = evidenceChecksum({
      assessment,
      requiredSourceVersions,
      targetId,
    });
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO "TargetDataSnapshot"
         ("id", "targetId", "syncRunId", "createdAt", "status",
          "requiredSourceVersions", "completenessFlags", "oldestFetchedAt",
          "coherentRegimeChecksum", "applyEligible", "increaseEligible", "inputChecksum")
       VALUES ($1, $2, $3, $4, $5::"SyncSnapshotStatus", $6::jsonb, $7, $8, $9, $10, $11, $12)
       ON CONFLICT ("inputChecksum") DO UPDATE SET
         "inputChecksum" = EXCLUDED."inputChecksum"
       RETURNING "id"`,
      [
        id,
        targetId,
        syncRunId,
        createdAt,
        assessment.status,
        JSON.stringify(requiredSourceVersions),
        assessment.flags,
        assessment.oldestFetchedAt,
        assessment.regimeChecksum,
        assessment.applyEligible,
        assessment.increaseEligible,
        inputChecksum,
      ],
    );
    const persistedId = result.rows[0]?.id;
    if (persistedId === undefined) {
      throw new Error('Target snapshot persistence failed');
    }
    return persistedId;
  }

  /**
   * Inserts a performance-day version and atomically supersedes a changed finalized version.
   *
   * @param targetId - Local target UUID.
   * @param candidate - Full normalized evidence.
   * @param assessment - Pure finalization assessment.
   * @param finalizedAt - Finalization time.
   * @returns Persisted row UUID and whether a prior finalized row was superseded.
   */
  public async persistPerformanceDay(
    targetId: string,
    candidate: PerformanceDayCandidate,
    assessment: PerformanceDayAssessment,
    finalizedAt: Date,
  ): Promise<{ readonly id: string; readonly superseded: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `performance-day:${targetId}:${candidate.statistic.date}`,
      ]);
      const existing = await client.query<{ id: string; inputChecksum: string }>(
        `SELECT "id", "inputChecksum"
           FROM "BidPerformanceDay"
          WHERE "targetId" = $1
            AND "wbStatisticDate" = $2::date
            AND "status" = 'FINALIZED'
          FOR UPDATE`,
        [targetId, candidate.statistic.date],
      );
      const current = existing.rows[0];
      if (current?.inputChecksum === assessment.inputChecksum) {
        await client.query('COMMIT');
        return Object.freeze({ id: current.id, superseded: false });
      }
      const superseded = current !== undefined;
      if (current !== undefined) {
        await client.query(
          `UPDATE "BidPerformanceDay"
              SET "status" = 'SUPERSEDED', "supersededAt" = $2
            WHERE "id" = $1`,
          [current.id, finalizedAt],
        );
      }
      const id = randomUUID();
      const firstObservation = [...candidate.bidStates].sort(
        (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
      )[0];
      const lastObservation = [...candidate.bidStates].sort(
        (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
      )[0];
      const maxGap = maximumObservationGap(candidate);
      await client.query(
        `INSERT INTO "BidPerformanceDay"
           ("id", "targetId", "wbStatisticDate", "statisticalDayProfile",
            "confirmedBidMinor", "placementBidState", "campaignStatus", "paymentType",
            "bidType", "activePlacementConfig", "viewsDelta", "clicksDelta", "atbsDelta",
            "ordersDelta", "orderedUnitsDelta", "spendDeltaMinor",
            "attributedRevenueDelta", "orderedUnitsSource", "coverageStartedAt",
            "coverageEndedAt", "maxObservedGapMinutes", "externalWriteControl",
            "changeMarkerCoverage", "sourceSnapshotReferences", "statisticsFinalizedAt",
            "conversionLagDays", "status", "qualityFlags", "inputChecksum")
         SELECT $1, $2, $3::date, 'wb-statistical-day-v1', $4, '{}'::jsonb,
                c."status", c."paymentType", c."bidType", $5::jsonb, $6, $7, $8, $9, $10,
                $11, $12, 'SHKS', $13, $14, $15, $16::"ExternalWriteControlMode",
                $17, $18::jsonb, $19, 1, $20::"PerformanceDayStatus", $21, $22
           FROM "CampaignTarget" t
           JOIN "Campaign" c ON c."id" = t."campaignId"
          WHERE t."id" = $2`,
        [
          id,
          targetId,
          candidate.statistic.date,
          assessment.confirmedBidMinor?.toString() ?? null,
          safeJson({
            configurationChecksum: firstObservation?.configurationChecksum ?? null,
          }),
          candidate.statistic.views?.toString() ?? null,
          candidate.statistic.clicks.toString(),
          candidate.statistic.atbs.toString(),
          candidate.statistic.orders.toString(),
          candidate.statistic.orderedUnits?.toString() ?? '0',
          candidate.statistic.spendMinor.toString(),
          candidate.statistic.attributedRevenueMinor.toString(),
          firstObservation?.observedAt ?? candidate.dayStartedAt,
          lastObservation?.observedAt ?? candidate.dayEndedAt,
          maxGap,
          candidate.externalWriteControlMode,
          candidate.externalWriteControlMode === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'OBSERVED',
          safeJson(candidate.sourceReads),
          assessment.status === 'FINALIZED' ? finalizedAt : null,
          assessment.status,
          assessment.qualityFlags,
          assessment.inputChecksum,
        ],
      );
      await client.query('COMMIT');
      return Object.freeze({ id, superseded });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Upserts a quota-aware full-pass checkpoint.
   *
   * @param dataKind - Independent cursor identity.
   * @param cursor - JSON-compatible cursor.
   * @param now - Update time.
   * @param processedCount - Monotonic processed count for this pass.
   * @param totalEstimate - Optional total cardinality.
   * @param passCompleted - Whether the cursor completed a full pass.
   * @returns Nothing.
   */
  public async saveCheckpoint(
    dataKind: SyncDataKind,
    cursor: unknown,
    now: Date,
    processedCount: bigint,
    totalEstimate: bigint | null,
    passCompleted: boolean,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO "SyncCheckpoint"
         ("dataKind", "cursor", "fullPassStartedAt", "fullPassCompletedAt",
          "lastSuccessAt", "processedCount", "totalEstimate", "updatedAt")
       VALUES ($1::"SyncDataKind", $2::jsonb, $3, $4, $3, $5, $6, $3)
       ON CONFLICT ("dataKind") DO UPDATE SET
         "cursor" = EXCLUDED."cursor",
         "fullPassCompletedAt" = CASE
           WHEN $7 THEN EXCLUDED."fullPassCompletedAt"
           ELSE "SyncCheckpoint"."fullPassCompletedAt"
         END,
         "lastSuccessAt" = EXCLUDED."lastSuccessAt",
         "processedCount" = EXCLUDED."processedCount",
         "totalEstimate" = EXCLUDED."totalEstimate",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        dataKind,
        safeJson(cursor),
        now,
        passCompleted ? now : null,
        processedCount.toString(),
        totalEstimate?.toString() ?? null,
        passCompleted,
      ],
    );
  }
}

/**
 * Quoted PostgreSQL account-binding row.
 */
interface BindingRow {
  readonly accountCurrency: string;
  readonly accountSettingsChecksum: string;
  readonly accountTimezone: string;
  readonly bindingVersion: string;
  readonly sellerSid: string;
  readonly tokenAccessFingerprint: string;
  readonly tokenCategory: string;
  readonly tokenFor: string | null;
  readonly tokenType: AccountBindingCandidate['tokenType'];
  readonly wbEnvironment: AccountBindingCandidate['environment'];
}

/**
 * PostgreSQL campaign work row before bigint conversion.
 */
interface CampaignWorkRow {
  readonly bidType: CampaignWorkItem['bidType'];
  readonly campaignId: string;
  readonly detailsChecksum: string | null;
  readonly detailsFetchedAt: string | Date | null;
  readonly paymentType: CampaignWorkItem['paymentType'];
  readonly targets: {
    readonly currentBidChecksum: string | null;
    readonly currentBidConfirmedAt: string | null;
    readonly minimumBidChecksum: string | null;
    readonly minimumBidConfirmedAt: string | null;
    readonly nmId: string;
    readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
    readonly targetId: string;
  }[];
  readonly wbCampaignId: string;
}

/**
 * Maps a quoted PostgreSQL row to the domain binding.
 *
 * @param row - Database row.
 * @returns Existing binding.
 */
function mapExistingBinding(row: BindingRow): ExistingAccountBinding {
  return Object.freeze({
    accountCurrency: row.accountCurrency.trim(),
    accountSettingsChecksum: row.accountSettingsChecksum,
    accountTimezone: row.accountTimezone,
    bindingVersion: BigInt(row.bindingVersion),
    environment: row.wbEnvironment,
    sellerSid: row.sellerSid,
    tokenCategory: row.tokenCategory,
    tokenFingerprint: row.tokenAccessFingerprint,
    tokenFor: row.tokenFor === null ? null : 'SELF',
    tokenType: row.tokenType,
  });
}

/**
 * Checks whether historical business rows exist before first binding.
 *
 * @param client - Transaction client holding the binding lock.
 * @returns Whether initialization would reinterpret history.
 */
async function hasBusinessData(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM "Campaign"
       UNION ALL SELECT 1 FROM "CampaignStatDaily"
       UNION ALL SELECT 1 FROM "BidDecision"
       UNION ALL SELECT 1 FROM "AuditEvent"
     ) AS present`,
  );
  return result.rows[0]?.present === true;
}

/**
 * Redacted append-only audit write.
 */
interface AuditWrite {
  readonly action: string;
  readonly actor: string;
  readonly after: unknown;
  readonly correlationId: string;
  readonly entityId: string;
  readonly entityType: string;
}

/**
 * Appends one redacted audit event inside the caller transaction.
 *
 * @param client - Transaction client.
 * @param event - Non-secret event.
 * @returns Nothing.
 */
async function appendAudit(client: PoolClient, event: AuditWrite): Promise<void> {
  await client.query(
    `INSERT INTO "AuditEvent"
       ("id", "actor", "action", "entityType", "entityId", "after", "correlationId")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      randomUUID(),
      event.actor,
      event.action,
      event.entityType,
      event.entityId,
      safeJson(event.after),
      event.correlationId,
    ],
  );
}

/**
 * Derives card-target rows from WB placement flags.
 *
 * @param placements - Runtime-validated placement switches.
 * @param placements.recommendations - Whether recommendations traffic is active.
 * @param placements.search - Whether search traffic is active.
 * @returns Internal placement enum values.
 */
function activeCardPlacements(placements: {
  readonly recommendations: boolean;
  readonly search: boolean;
}): readonly ('RECOMMENDATIONS' | 'SEARCH')[] {
  return Object.freeze([
    ...(placements.search ? (['SEARCH'] as const) : []),
    ...(placements.recommendations ? (['RECOMMENDATIONS'] as const) : []),
  ]);
}

/**
 * Produces JSON text without bigint serialization failures.
 *
 * @param value - Redacted evidence value.
 * @returns JSON text.
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item,
  );
}

/**
 * Redacts an arbitrary error to a bounded class/message.
 *
 * @param error - Worker failure.
 * @returns Bounded diagnostic.
 */
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error';
  return message.slice(0, 512);
}

/**
 * Calculates the maximum adjacent bid-state gap.
 *
 * @param candidate - Performance-day evidence.
 * @returns Ceiling minutes.
 */
function maximumObservationGap(candidate: PerformanceDayCandidate): number {
  const observations = [...candidate.bidStates].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
  let maximum = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (previous !== undefined && current !== undefined) {
      maximum = Math.max(
        maximum,
        (current.observedAt.getTime() - previous.observedAt.getTime()) / 60_000,
      );
    }
  }
  return Math.ceil(maximum);
}
