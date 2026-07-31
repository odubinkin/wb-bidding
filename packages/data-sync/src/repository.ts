import { randomUUID } from 'node:crypto';
import {
  advisoryTransactionLock,
  loadDataSyncCampaignWorkPage,
  loadDataSyncPerformanceCandidates,
  type Prisma,
  upsertCardCampaignTarget,
  upsertClusterCampaignTarget,
  upsertClusterStatisticRecord,
  upsertSyncSourceSnapshot,
  withTransaction,
  type DatabaseClient,
  type DatabaseTransaction,
} from '@wb-bidder/database';

import { accountSettingsChecksum, validateAccountBindingTransition } from './binding.js';
import { evidenceChecksum } from './checksum.js';
import { assessPerformanceDay } from './evidence.js';
import type {
  AccountBindingCandidate,
  ExistingAccountBinding,
  NormalizedStatisticDay,
  PerformanceDayAssessment,
  PerformanceDayCandidate,
  SyncDataKind,
  TargetSnapshotAssessment,
} from './types.js';
import { isCampaignStatisticsEligibleStatus } from '@wb-bidder/contracts';
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
 * One verified normalized cluster statistical day.
 */
export interface ClusterStatisticDayWrite {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Observation time. */
  readonly fetchedAt: Date;
  /** WB article identifier. */
  readonly nmId: bigint;
  /** NFC-only query key. */
  readonly normQueryCanonical: string;
  /** Exact WB query spelling sent back to write endpoints. */
  readonly normQueryWire: string;
  /** Exact normalized counters and spend. */
  readonly normalized: NormalizedStatisticDay;
  /** Embedded endpoint profile ID. */
  readonly profileId: string;
  /** Scheduler run UUID. */
  readonly runId: string;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Existing discovered cluster pairs eligible for the fast current-state refresh.
 */
export interface ClusterCurrentWorkItem {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Discovered article identifiers. */
  readonly nmIds: readonly bigint[];
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
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
    /** Exact cluster query wire spelling, null for card targets. */
    readonly normQueryWire: string | null;
    readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
    /** Last recommendation observation for this campaign/article. */
    readonly recommendationFetchedAt: Date | null;
    readonly targetId: string;
    /** Card or discovered cluster target. */
    readonly targetKind: 'CARD' | 'CLUSTER';
  }[];
  /** Payment type. */
  readonly paymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  /** Current WB campaign lifecycle status. */
  readonly status: number;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Optional bounded filters for an operator-requested synchronization.
 */
export interface CampaignWorkScope {
  /** Campaign UUIDs selected by the operator. */
  readonly campaignIds?: readonly string[];
  /** Target UUIDs selected by the operator. */
  readonly targetIds?: readonly string[];
}

/**
 * One exact app/nm leaf belonging to a versioned WB campaign day.
 */
export interface CampaignStatisticLeafWrite {
  /** WB application/platform dimension. */
  readonly appType: number;
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Read time. */
  readonly fetchedAt: Date;
  /** WB article identifier. */
  readonly nmId: bigint;
  /** Exact normalized counters. */
  readonly statistic: NormalizedStatisticDay;
  /** Checksum of the complete campaign/day content version. */
  readonly sourceVersion: string;
  /** Scheduler run UUID. */
  readonly syncRunId: string;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Fixed finalization policy selected from validated deployment configuration.
 */
export interface PerformanceFinalizationConfiguration {
  /** Maximum continuous bid-state gap. */
  readonly bidStateMaxObservationGapMinutes: number;
  /** Full days to wait for conversion attribution. */
  readonly conversionLagDays: number;
  /** Stable equal reads required. */
  readonly dayFinalizationStableReads: number;
  /** Minimum minutes spanned by stable reads. */
  readonly dayFinalizationStableMinutes: number;
  /** External-write provenance guarantee. */
  readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
}

/**
 * PostgreSQL persistence boundary for synchronization, evidence, and leases.
 */
export class DataSyncRepository {
  /** Generated Prisma model surface. */
  private readonly database: DatabaseClient;

  /**
   * Creates a repository over the shared Prisma Client.
   *
   * @param database - Shared Prisma Client.
   */
  public constructor(database: DatabaseClient) {
    this.database = database;
  }

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
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, 'deployment-account-binding');
      const stored = await transaction.deploymentAccountBinding.findUnique({
        select: {
          accountCurrency: true,
          accountSettingsChecksum: true,
          accountTimezone: true,
          bindingVersion: true,
          sellerSid: true,
          tokenAccessFingerprint: true,
          tokenCategory: true,
          tokenFor: true,
          tokenType: true,
          wbEnvironment: true,
        },
        where: { id: BINDING_ID },
      });
      const existing = stored === null ? null : mapExistingBinding(stored);
      const businessDataExists = existing === null ? await hasBusinessData(transaction) : false;
      const transition = validateAccountBindingTransition(existing, candidate, businessDataExists);
      const settingsChecksum = accountSettingsChecksum(
        candidate.accountCurrency,
        candidate.accountTimezone,
      );
      const now = new Date();
      let version: bigint;
      if (transition === 'CREATE') {
        version = 1n;
        await transaction.deploymentAccountBinding.create({
          data: {
            accountCurrency: candidate.accountCurrency,
            accountSettingsChecksum: settingsChecksum,
            accountSettingsSource: 'ENV_OPERATOR_PROVISIONED',
            accountTimezone: candidate.accountTimezone,
            bindingVersion: version,
            id: BINDING_ID,
            initializedAt: now,
            lastValidatedAt: now,
            sellerSid: candidate.sellerSid,
            tokenAccessFingerprint: candidate.tokenFingerprint,
            tokenCategory: candidate.tokenCategory,
            tokenFor: candidate.tokenFor,
            tokenType: candidate.tokenType,
            wbEnvironment: candidate.environment,
          },
        });
      } else {
        const changesIdentityToken = transition === 'ROTATE' || transition === 'UPGRADE';
        version = (existing?.bindingVersion ?? 0n) + (changesIdentityToken ? 1n : 0n);
        await transaction.deploymentAccountBinding.update({
          data: {
            bindingVersion: version,
            lastValidatedAt: now,
            tokenAccessFingerprint: candidate.tokenFingerprint,
            tokenFor: candidate.tokenFor,
            tokenType: candidate.tokenType,
          },
          where: { id: BINDING_ID },
        });
      }
      await appendAudit(transaction, {
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
      return Object.freeze({ transition, version });
    });
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
    const runId = randomUUID();
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + deadlineMs);
    const claimed = await withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `scheduler:${jobType}`);
      const active = await transaction.schedulerRun.findFirst({
        select: { id: true },
        where: {
          deadlineAt: { gt: startedAt },
          jobType,
          status: 'RUNNING',
        },
      });
      if (active !== null) return false;
      await transaction.schedulerRun.create({
        data: {
          counters: {},
          deadlineAt,
          id: runId,
          jobType,
          leaseOwner: `pid:${String(process.pid)}`,
          leaseUntil: deadlineAt,
          startedAt,
          status: 'RUNNING',
        },
      });
      return true;
    });
    if (!claimed) return Object.freeze({ started: false });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('Scheduler run deadline exceeded'));
    }, deadlineMs);
    try {
      const result = await worker(Object.freeze({ deadlineAt, runId, signal: controller.signal }));
      const deadlineExceeded = controller.signal.aborted || Date.now() > deadlineAt.getTime();
      await this.database.schedulerRun.update({
        data: {
          endedAt: new Date(),
          leaseUntil: null,
          status: deadlineExceeded ? 'DEADLINE_EXCEEDED' : 'SUCCEEDED',
        },
        where: { id: runId },
      });
      return Object.freeze({ result, runId, started: true });
    } catch (error: unknown) {
      await this.database.schedulerRun.update({
        data: {
          endedAt: new Date(),
          errorSummary: { code: 'JOB_FAILED', message: safeErrorMessage(error) },
          leaseUntil: null,
          status: controller.signal.aborted ? 'DEADLINE_EXCEEDED' : 'FAILED',
        },
        where: { id: runId },
      });
      throw error;
    } finally {
      clearTimeout(timer);
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
    let targetCount = 0;
    await withTransaction(this.database, async (transaction) => {
      for (const campaign of details.adverts) {
        const detailsChecksum = evidenceChecksum(campaign);
        const supported = isCampaignStatisticsEligibleStatus(campaign.status);
        const storedCampaign = await transaction.campaign.upsert({
          create: {
            bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
            detailsChecksum,
            detailsFetchedAt: fetchedAt,
            detailsSyncRunId: syncRunId,
            id: randomUUID(),
            lastSyncedAt: fetchedAt,
            name: campaign.settings.name,
            paymentType: campaign.settings.payment_type.toUpperCase() as 'CPC' | 'CPM' | 'UNKNOWN',
            status: campaign.status,
            supported,
            type: 9,
            unsupportedReason: supported
              ? null
              : campaign.status === 4
                ? 'CAMPAIGN_NOT_RUNNING'
                : 'UNSUPPORTED_CAMPAIGN',
            wbCampaignId: BigInt(campaign.id),
          },
          update: {
            bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
            detailsChecksum,
            detailsFetchedAt: fetchedAt,
            detailsSyncRunId: syncRunId,
            lastSyncedAt: fetchedAt,
            name: campaign.settings.name,
            paymentType: campaign.settings.payment_type.toUpperCase() as 'CPC' | 'CPM' | 'UNKNOWN',
            status: campaign.status,
            supported,
            unsupportedReason: supported
              ? null
              : campaign.status === 4
                ? 'CAMPAIGN_NOT_RUNNING'
                : 'UNSUPPORTED_CAMPAIGN',
          },
          where: { wbCampaignId: BigInt(campaign.id) },
        });
        const campaignId = storedCampaign.id;
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
            const targetId = await upsertCardCampaignTarget(transaction, {
              bidChecksum,
              bidMinor: BigInt(bidMinor),
              campaignId,
              fetchedAt,
              id: randomUUID(),
              nmId: BigInt(nm.nm_id),
              placement,
              syncRunId,
            });
            const configurationChecksum = evidenceChecksum({
              bidType: campaign.bid_type,
              paymentType: campaign.settings.payment_type,
              placements: campaign.settings.placements,
              status: campaign.status,
            });
            await transaction.bidStateObservation.upsert({
              create: {
                activePlacementConfig: inputJson(campaign.settings.placements),
                bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
                campaignStatus: campaign.status,
                changeMarkerObserved: externalWriteControlMode === 'EXCLUSIVE',
                configurationChecksum,
                currentBidMinor: BigInt(bidMinor),
                externalWriteControlMode,
                id: randomUUID(),
                observedAt: fetchedAt,
                paymentType: campaign.settings.payment_type.toUpperCase() as
                  'CPC' | 'CPM' | 'UNKNOWN',
                syncRunId,
                targetId,
              },
              update: {},
              where: {
                targetId_observedAt_configurationChecksum: {
                  configurationChecksum,
                  observedAt: fetchedAt,
                  targetId,
                },
              },
            });
            targetCount += 1;
          }
        }
      }
    });
    return Object.freeze({ campaigns: details.adverts.length, targets: targetCount });
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
    await withTransaction(this.database, async (transaction) => {
      for (const campaign of campaigns) {
        await transaction.campaign.upsert({
          create: {
            bidType: 'UNKNOWN',
            id: randomUUID(),
            lastSyncedAt: fetchedAt,
            name: '',
            paymentType: 'UNKNOWN',
            status: campaign.status,
            supported: false,
            type: campaign.type,
            unsupportedReason: 'DETAILS_PENDING',
            wbCampaignId: BigInt(campaign.wbCampaignId),
          },
          update: {
            lastSyncedAt: fetchedAt,
            status: campaign.status,
            type: campaign.type,
          },
          where: { wbCampaignId: BigInt(campaign.wbCampaignId) },
        });
      }
    });
    return campaigns.length;
  }

  /**
   * Loads one bounded supported-campaign page after a stable WB-ID cursor.
   *
   * @param afterWbCampaignId - Exclusive cursor, or zero for the first page.
   * @param limit - Bounded page size.
   * @param scope - Optional operator-bounded campaign/target filters.
   * @param includeReadyCampaigns - Whether status 4 is eligible for current-state refresh.
   * @returns Work rows ordered by WB campaign ID.
   */
  public async loadCampaignWorkPage(
    afterWbCampaignId: bigint,
    limit: number,
    scope: CampaignWorkScope = {},
    includeReadyCampaigns = false,
  ): Promise<readonly CampaignWorkItem[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5_000) {
      throw new Error('Campaign work page limit is out of range');
    }
    const campaignIds =
      scope.campaignIds === undefined || scope.campaignIds.length === 0
        ? null
        : [...scope.campaignIds];
    const targetIds =
      scope.targetIds === undefined || scope.targetIds.length === 0 ? null : [...scope.targetIds];
    const rows = await loadDataSyncCampaignWorkPage(this.database, {
      afterWbCampaignId,
      campaignIds,
      includeReadyCampaigns,
      limit,
      targetIds,
    });
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          bidType: row.bidType,
          campaignId: row.campaignId,
          detailsChecksum: row.detailsChecksum,
          detailsFetchedAt: row.detailsFetchedAt === null ? null : new Date(row.detailsFetchedAt),
          paymentType: row.paymentType,
          status: row.status,
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
                normQueryWire: target.normQueryWire,
                placement: target.placement,
                recommendationFetchedAt:
                  target.recommendationFetchedAt === null
                    ? null
                    : new Date(target.recommendationFetchedAt),
                targetId: target.targetId,
                targetKind: target.targetKind,
              }),
            ),
          ),
          wbCampaignId: BigInt(row.wbCampaignId),
        }),
      ),
    );
  }

  /**
   * Loads already-discovered manual CPM cluster pairs for selected WB campaigns.
   *
   * @param wbCampaignIds - Exact current-state page identifiers.
   * @returns Bounded campaign/pair rows; no cluster is synthesized.
   */
  public async loadClusterCurrentWork(
    wbCampaignIds: readonly bigint[],
  ): Promise<readonly ClusterCurrentWorkItem[]> {
    if (wbCampaignIds.length === 0) return Object.freeze([]);
    const rows = await this.database.campaign.findMany({
      orderBy: { wbCampaignId: 'asc' },
      select: {
        id: true,
        targets: {
          orderBy: { nmId: 'asc' },
          select: { nmId: true },
          where: { targetKind: 'CLUSTER' },
        },
        wbCampaignId: true,
      },
      where: {
        bidType: 'MANUAL',
        paymentType: 'CPM',
        targets: { some: { targetKind: 'CLUSTER' } },
        wbCampaignId: { in: [...wbCampaignIds] },
      },
    });
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          campaignId: row.id,
          nmIds: Object.freeze([...new Set(row.targets.map(({ nmId }) => nmId))]),
          wbCampaignId: row.wbCampaignId,
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
    const checkpoint = await this.database.syncCheckpoint.findUnique({
      select: { cursor: true },
      where: { dataKind },
    });
    const value = readJsonObject(checkpoint?.cursor).value;
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
      const writeReady = await this.database.campaignTarget.updateMany({
        data: {
          capability: 'CARD_WRITE_READY',
          minimumBidChecksum: checksum,
          minimumBidConfirmedAt: fetchedAt,
          minimumBidMinor: BigInt(minimum.value),
          minimumBidSyncRunId: syncRunId,
        },
        where: {
          campaignId,
          currentBidMinor: { not: null },
          nmId: BigInt(row.nm_id),
          placement,
          targetKind: 'CARD',
        },
      });
      const observeOnly = await this.database.campaignTarget.updateMany({
        data: {
          capability: 'OBSERVE_ONLY',
          minimumBidChecksum: checksum,
          minimumBidConfirmedAt: fetchedAt,
          minimumBidMinor: BigInt(minimum.value),
          minimumBidSyncRunId: syncRunId,
        },
        where: {
          campaignId,
          currentBidMinor: null,
          nmId: BigInt(row.nm_id),
          placement,
          targetKind: 'CARD',
        },
      });
      updated += writeReady.count + observeOnly.count;
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
    await withTransaction(this.database, async (transaction) => {
      for (const query of normQueries) {
        await upsertClusterCampaignTarget(transaction, {
          campaignId,
          id: randomUUID(),
          nmId,
          normQueryCanonical: query.canonical,
          normQueryWire: query.wire,
        });
      }
    });
    return normQueries.length;
  }

  /**
   * Applies the exact verified cluster response, treating an omitted discovered row as ABSENT.
   *
   * @param input - Verified mock contract evidence and source metadata.
   * @param input.bids - Exact explicit rows returned by get-bids.
   * @param input.campaignId - Local campaign UUID.
   * @param input.contractVersion - Verified immutable cluster contract version.
   * @param input.externalWriteControlMode - Provenance ownership mode.
   * @param input.fetchedAt - Observation time.
   * @param input.minimumBidMinor - Verified exact cluster minimum.
   * @param input.profileId - Embedded endpoint profile ID.
   * @param input.runId - Scheduler run UUID.
   * @returns Number of cluster targets updated.
   */
  public async applyClusterBidStates(input: {
    readonly bids: readonly {
      readonly advert_id: number;
      readonly bid: number;
      readonly nm_id: number;
      readonly norm_query: string;
    }[];
    readonly campaignId: string;
    readonly contractVersion: string;
    readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
    readonly fetchedAt: Date;
    readonly minimumBidMinor: bigint;
    readonly profileId: string;
    readonly runId: string;
  }): Promise<number> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `cluster-bid-states:${input.campaignId}`);
      const targets = await transaction.campaignTarget.findMany({
        select: {
          campaign: {
            select: {
              bidType: true,
              paymentType: true,
              status: true,
              wbCampaignId: true,
            },
          },
          clusterBaselineBidState: true,
          clusterOverrideOwned: true,
          id: true,
          nmId: true,
          normQueryWire: true,
        },
        where: {
          campaignId: input.campaignId,
          normQueryWire: { not: null },
          targetKind: 'CLUSTER',
        },
      });
      for (const target of targets) {
        const wire = target.normQueryWire;
        if (wire === null) continue;
        const matched = input.bids.find(
          (bid) =>
            BigInt(bid.advert_id) === target.campaign.wbCampaignId &&
            BigInt(bid.nm_id) === target.nmId &&
            bid.norm_query === wire,
        );
        const state = matched === undefined ? 'ABSENT' : 'EXPLICIT';
        const currentBid = matched === undefined ? null : BigInt(matched.bid);
        const source = {
          bidMinor: currentBid?.toString() ?? null,
          contractVersion: input.contractVersion,
          state,
          wire,
        };
        const sourceChecksum = evidenceChecksum(source);
        const configurationChecksum = evidenceChecksum({
          bidType: target.campaign.bidType,
          paymentType: target.campaign.paymentType,
          status: target.campaign.status,
          targetKind: 'CLUSTER',
          wire,
        });
        const initializeBaseline =
          target.clusterBaselineBidState === null && !target.clusterOverrideOwned;
        await transaction.campaignTarget.update({
          data: {
            capability:
              target.campaign.bidType === 'MANUAL' && target.campaign.paymentType === 'CPM'
                ? 'CLUSTER_WRITE_READY'
                : 'UNSUPPORTED',
            ...(initializeBaseline
              ? {
                  clusterBaselineBidMinor: currentBid,
                  clusterBaselineBidState: state,
                  clusterBaselineChecksum: evidenceChecksum({
                    bidMinor: currentBid,
                    contractVersion: input.contractVersion,
                    state,
                  }),
                }
              : {}),
            clusterBidContractVersion: input.contractVersion,
            clusterBidState: state,
            currentBidChecksum: sourceChecksum,
            currentBidMinor: currentBid,
            currentBidSyncRunId: input.runId,
            lastConfirmedAt: input.fetchedAt,
            minimumBidChecksum: evidenceChecksum({
              minimumBidMinor: input.minimumBidMinor,
              version: input.contractVersion,
            }),
            minimumBidConfirmedAt: input.fetchedAt,
            minimumBidMinor: input.minimumBidMinor,
            minimumBidSyncRunId: input.runId,
          },
          where: { id: target.id },
        });
        await transaction.bidStateObservation.upsert({
          create: {
            activePlacementConfig: { normQueryWire: wire, placement: 'SEARCH' },
            bidType: target.campaign.bidType,
            campaignStatus: target.campaign.status,
            changeMarkerObserved: false,
            clusterBidState: state,
            configurationChecksum,
            currentBidMinor: currentBid,
            externalWriteControlMode: input.externalWriteControlMode,
            id: randomUUID(),
            observedAt: input.fetchedAt,
            paymentType: target.campaign.paymentType,
            sourceMarker: `cluster-current-bids:${sourceChecksum}`,
            syncRunId: input.runId,
            targetId: target.id,
          },
          update: {},
          where: {
            targetId_observedAt_configurationChecksum: {
              configurationChecksum,
              observedAt: input.fetchedAt,
              targetId: target.id,
            },
          },
        });
        await upsertSyncSourceSnapshot(transaction, {
          campaignId: input.campaignId,
          dataKind: 'CURRENT_BID',
          endpointProfile: input.profileId,
          fetchedAt: input.fetchedAt,
          id: randomUUID(),
          invalidReason: null,
          normalizedData: inputJson(source),
          sourceChecksum,
          sourceDate: null,
          syncRunId: input.runId,
          targetId: target.id,
          valid: true,
        });
      }
      return targets.length;
    });
  }

  /**
   * Inserts one immutable normalized source snapshot idempotently.
   *
   * @param snapshot - Source write.
   * @returns Snapshot UUID, existing or newly inserted.
   */
  public async recordSourceSnapshot(snapshot: SourceSnapshotWrite): Promise<string> {
    return upsertSyncSourceSnapshot(this.database, {
      campaignId: snapshot.campaignId ?? null,
      dataKind: snapshot.dataKind,
      endpointProfile: snapshot.endpointProfile,
      fetchedAt: snapshot.fetchedAt,
      id: randomUUID(),
      invalidReason: snapshot.invalidReason ?? null,
      normalizedData: inputJson(snapshot.normalizedData),
      sourceChecksum: snapshot.sourceChecksum,
      sourceDate:
        snapshot.sourceDate === undefined ? null : new Date(`${snapshot.sourceDate}T00:00:00.000Z`),
      syncRunId: snapshot.syncRunId,
      targetId: snapshot.targetId ?? null,
      valid: snapshot.valid,
    });
  }

  /**
   * Loads the most recent observed campaign-statistics source state.
   *
   * @param campaignId - Local campaign UUID.
   * @returns Exact source evidence or null when no response has been observed.
   */
  public async loadLatestCampaignStatisticsEvidence(campaignId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { campaignId, dataKind: 'CAMPAIGN_STATISTICS' },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Loads the latest verified target-level current-day spend source.
   *
   * @param targetId - Local target UUID.
   * @returns Exact source evidence or null when none has been observed.
   */
  public async loadLatestSameDaySpendEvidence(targetId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { dataKind: 'SAME_DAY_SPEND', targetId },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Loads the latest verified target-level cluster-statistics source.
   *
   * @param targetId - Local cluster target UUID.
   * @returns Exact source evidence or null when no verified day was observed.
   */
  public async loadLatestClusterStatisticsEvidence(targetId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { dataKind: 'CLUSTER_STATISTICS', targetId },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Persists every lowest-level app/nm row for one content version without parent-total mixing.
   *
   * @param rows - Exact normalized leaf rows from a single WB response.
   * @returns Inserted or idempotently refreshed row count.
   */
  public async upsertCampaignStatisticLeaves(
    rows: readonly CampaignStatisticLeafWrite[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    await withTransaction(this.database, async (transaction) => {
      for (const row of rows) {
        const date = new Date(`${row.statistic.date}T00:00:00.000Z`);
        await transaction.campaignStatDaily.upsert({
          create: {
            appType: row.appType,
            atbs: row.statistic.atbs,
            attributedRevenueMinor: row.statistic.attributedRevenueMinor,
            campaignId: row.campaignId,
            canceled: row.statistic.canceled ?? null,
            clicks: row.statistic.clicks,
            date,
            dimensions: { appType: row.appType },
            fetchedAt: row.fetchedAt,
            id: randomUUID(),
            nmId: row.nmId,
            normalizedAggregationKind: 'FULLSTATS_APP_NM_LEAF',
            orderedUnits: row.statistic.orderedUnits ?? null,
            orders: row.statistic.orders,
            sourceChecksum: evidenceChecksum({
              appType: row.appType,
              nmId: row.nmId,
              statistic: row.statistic,
            }),
            sourceVersion: row.sourceVersion,
            spendMinor: row.statistic.spendMinor,
            syncRunId: row.syncRunId,
            views: row.statistic.views ?? null,
            wbCampaignId: row.wbCampaignId,
          },
          update: { fetchedAt: row.fetchedAt, syncRunId: row.syncRunId },
          where: {
            wbCampaignId_nmId_date_sourceVersion_appType: {
              appType: row.appType,
              date,
              nmId: row.nmId,
              sourceVersion: row.sourceVersion,
              wbCampaignId: row.wbCampaignId,
            },
          },
        });
      }
    });
    return rows.length;
  }

  /**
   * Persists one verified cluster day and its target-scoped immutable source snapshot.
   *
   * @param row - Exact normalized cluster day.
   * @returns Local cluster target UUID.
   */
  public async upsertClusterStatisticDay(row: ClusterStatisticDayWrite): Promise<string> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `cluster-statistic:${row.campaignId}:${row.nmId.toString()}:${row.normQueryCanonical}`,
      );
      const target = await transaction.campaignTarget.findFirst({
        select: { id: true },
        where: {
          campaignId: row.campaignId,
          nmId: row.nmId,
          normQueryCanonical: row.normQueryCanonical,
          targetKind: 'CLUSTER',
        },
      });
      const targetId = target?.id;
      if (targetId === undefined) {
        throw new Error('CLUSTER_STATISTIC_TARGET_NOT_DISCOVERED');
      }
      const normalizedData = {
        ...row.normalized,
        normQueryCanonical: row.normQueryCanonical,
        normQueryWire: row.normQueryWire,
      };
      const sourceChecksum = evidenceChecksum(normalizedData);
      const statisticDate = new Date(`${row.normalized.date}T00:00:00.000Z`);
      await upsertClusterStatisticRecord(transaction, {
        atbs: row.normalized.atbs,
        attributedRevenueMinor: row.normalized.attributedRevenueMinor,
        campaignId: row.campaignId,
        clicks: row.normalized.clicks,
        date: statisticDate,
        fetchedAt: row.fetchedAt,
        id: randomUUID(),
        nmId: row.nmId,
        normQueryCanonical: row.normQueryCanonical,
        normQueryWire: row.normQueryWire,
        orderedUnits: row.normalized.orderedUnits ?? null,
        orders: row.normalized.orders,
        runId: row.runId,
        sourceChecksum,
        spendMinor: row.normalized.spendMinor,
        views: row.normalized.views ?? null,
        wbCampaignId: row.wbCampaignId,
      });
      await upsertSyncSourceSnapshot(transaction, {
        campaignId: row.campaignId,
        dataKind: 'CLUSTER_STATISTICS',
        endpointProfile: row.profileId,
        fetchedAt: row.fetchedAt,
        id: randomUUID(),
        invalidReason: null,
        normalizedData: inputJson(normalizedData),
        sourceChecksum,
        sourceDate: statisticDate,
        syncRunId: row.runId,
        targetId,
        valid: true,
      });
      return targetId;
    });
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
    const row = await this.database.targetDataSnapshot.upsert({
      create: {
        applyEligible: assessment.applyEligible,
        coherentRegimeChecksum: assessment.regimeChecksum,
        completenessFlags: [...assessment.flags],
        createdAt,
        id: randomUUID(),
        increaseEligible: assessment.increaseEligible,
        inputChecksum,
        oldestFetchedAt: assessment.oldestFetchedAt,
        requiredSourceVersions: inputJson(requiredSourceVersions),
        status: assessment.status,
        syncRunId,
        targetId,
      },
      update: { inputChecksum },
      where: { inputChecksum },
    });
    return row.id;
  }

  /**
   * Materializes immutable performance-day versions from the newest exact leaf aggregation.
   *
   * The query selects one content version, appType leaves only, deterministic day-boundary bid
   * observations, and the first stable read sequence. This keeps work bounded by the campaign page
   * and prevents later probes with unchanged content from churning a finalized checksum.
   *
   * @param campaignId - Local campaign UUID.
   * @param configuration - Validated finalization policy.
   * @param assessedAt - Stable scheduler instant.
   * @returns Lifecycle counters.
   */
  public async finalizePerformanceDaysForCampaign(
    campaignId: string,
    configuration: PerformanceFinalizationConfiguration,
    assessedAt: Date,
  ): Promise<{
    readonly draft: number;
    readonly finalized: number;
    readonly invalid: number;
    readonly superseded: number;
  }> {
    const rows = await loadDataSyncPerformanceCandidates(this.database, {
      campaignId,
      conversionLagDays: configuration.conversionLagDays,
      stableMinutes: configuration.dayFinalizationStableMinutes,
      stableReads: configuration.dayFinalizationStableReads,
    });
    let draft = 0;
    let finalized = 0;
    let invalid = 0;
    let superseded = 0;
    for (const row of rows) {
      const date = row.date;
      const dayStartedAt = new Date(`${date}T00:00:00.000Z`);
      const dayEndedAt = new Date(dayStartedAt.getTime() + 86_400_000);
      const bidStates = Object.freeze(
        row.bidStates.map((item) =>
          Object.freeze({
            changeMarkerObserved: item.changeMarkerObserved,
            configurationChecksum: item.configurationChecksum,
            currentBidMinor: item.currentBidMinor === null ? null : BigInt(item.currentBidMinor),
            observedAt: new Date(item.observedAt),
          }),
        ),
      );
      const sourceReads = Object.freeze(
        row.sourceReads.map((item) =>
          Object.freeze({
            checksum: item.checksum,
            fetchedAt: new Date(item.fetchedAt),
          }),
        ),
      );
      const candidate: PerformanceDayCandidate = Object.freeze({
        assessedAt,
        attributionUnambiguous: row.bidType === 'UNIFIED' || row.placementCount === 1,
        bidStates,
        campaignTrafficEligible:
          row.bidStates.length > 0 &&
          row.bidStates.every((item) => item.campaignStatus === 9 || item.campaignStatus === 11),
        conversionCutoff: new Date(
          dayEndedAt.getTime() + configuration.conversionLagDays * 86_400_000,
        ),
        dayEndedAt,
        dayStartedAt,
        externalWriteControlMode: configuration.externalWriteControlMode,
        moneyContractValid: true,
        preEnrollment:
          row.enrolledAt === null || new Date(row.enrolledAt).getTime() > dayStartedAt.getTime(),
        sourceReads,
        statistic: Object.freeze({
          atbs: BigInt(row.atbs),
          attributedRevenueMinor: BigInt(row.attributedRevenueMinor),
          clicks: BigInt(row.clicks),
          date,
          orderedUnits: row.orderedUnits === null ? null : BigInt(row.orderedUnits),
          orders: BigInt(row.orders),
          spendMinor: BigInt(row.spendMinor),
          views: row.views === null ? null : BigInt(row.views),
        }),
      });
      const assessment = assessPerformanceDay(candidate, {
        maxObservationGapMinutes: configuration.bidStateMaxObservationGapMinutes,
        minimumStableMinutes: configuration.dayFinalizationStableMinutes,
        minimumStableReads: configuration.dayFinalizationStableReads,
      });
      const persisted = await this.persistPerformanceDay(
        row.targetId,
        candidate,
        assessment,
        assessedAt,
      );
      if (persisted.superseded) superseded += 1;
      if (assessment.status === 'FINALIZED') finalized += 1;
      else if (assessment.status === 'DRAFT') draft += 1;
      else invalid += 1;
    }
    return Object.freeze({ draft, finalized, invalid, superseded });
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
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `performance-day:${targetId}:${candidate.statistic.date}`,
      );
      const statisticDate = new Date(`${candidate.statistic.date}T00:00:00.000Z`);
      const existing = await transaction.bidPerformanceDay.findMany({
        select: { id: true, inputChecksum: true, status: true },
        where: { targetId, wbStatisticDate: statisticDate },
      });
      const current = existing.find((row) => row.status === 'FINALIZED');
      const matching = existing.find((row) => row.inputChecksum === assessment.inputChecksum);
      if (
        current !== undefined &&
        matching?.id === current.id &&
        current.status === assessment.status
      ) {
        return Object.freeze({ id: current.id, superseded: false });
      }
      const superseded = current !== undefined && current.id !== matching?.id;
      if (current !== undefined && current.id !== matching?.id) {
        await transaction.bidPerformanceDay.update({
          data: { status: 'SUPERSEDED', supersededAt: finalizedAt },
          where: { id: current.id },
        });
      }
      if (matching !== undefined) {
        await transaction.bidPerformanceDay.update({
          data: {
            qualityFlags: [...assessment.qualityFlags],
            statisticsFinalizedAt: assessment.status === 'FINALIZED' ? finalizedAt : null,
            status: assessment.status,
            supersededAt: null,
          },
          where: { id: matching.id },
        });
        return Object.freeze({ id: matching.id, superseded });
      }
      const id = randomUUID();
      const firstObservation = [...candidate.bidStates].sort(
        (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
      )[0];
      const lastObservation = [...candidate.bidStates].sort(
        (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
      )[0];
      const maxGap = maximumObservationGap(candidate);
      const target = await transaction.campaignTarget.findUnique({
        select: { campaign: { select: { bidType: true, paymentType: true, status: true } } },
        where: { id: targetId },
      });
      if (target === null) throw new Error('PERFORMANCE_DAY_TARGET_NOT_FOUND');
      await transaction.bidPerformanceDay.create({
        data: {
          activePlacementConfig: {
            configurationChecksum: firstObservation?.configurationChecksum ?? null,
          },
          atbsDelta: candidate.statistic.atbs,
          attributedRevenueDelta: candidate.statistic.attributedRevenueMinor,
          bidType: target.campaign.bidType,
          campaignStatus: target.campaign.status,
          changeMarkerCoverage:
            candidate.externalWriteControlMode === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'OBSERVED',
          clicksDelta: candidate.statistic.clicks,
          confirmedBidMinor: assessment.confirmedBidMinor,
          conversionLagDays: 1,
          coverageEndedAt: lastObservation?.observedAt ?? candidate.dayEndedAt,
          coverageStartedAt: firstObservation?.observedAt ?? candidate.dayStartedAt,
          externalWriteControl: candidate.externalWriteControlMode,
          id,
          inputChecksum: assessment.inputChecksum,
          maxObservedGapMinutes: maxGap,
          orderedUnitsDelta: candidate.statistic.orderedUnits ?? 0n,
          orderedUnitsSource: 'SHKS',
          ordersDelta: candidate.statistic.orders,
          paymentType: target.campaign.paymentType,
          placementBidState: {},
          qualityFlags: [...assessment.qualityFlags],
          sourceSnapshotReferences: inputJson(candidate.sourceReads),
          spendDeltaMinor: candidate.statistic.spendMinor,
          statisticalDayProfile: 'wb-statistical-day-v1',
          statisticsFinalizedAt: assessment.status === 'FINALIZED' ? finalizedAt : null,
          status: assessment.status,
          targetId,
          viewsDelta: candidate.statistic.views,
          wbStatisticDate: statisticDate,
        },
      });
      return Object.freeze({ id, superseded });
    });
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
    await this.database.syncCheckpoint.upsert({
      create: {
        cursor: inputJson(cursor),
        dataKind,
        fullPassCompletedAt: passCompleted ? now : null,
        fullPassStartedAt: now,
        lastSuccessAt: now,
        processedCount,
        totalEstimate,
        updatedAt: now,
      },
      update: {
        cursor: inputJson(cursor),
        ...(passCompleted ? { fullPassCompletedAt: now } : {}),
        lastSuccessAt: now,
        processedCount,
        totalEstimate,
        updatedAt: now,
      },
      where: { dataKind },
    });
  }
}

/**
 * Quoted PostgreSQL account-binding row.
 */
interface BindingRow {
  readonly accountCurrency: string;
  readonly accountSettingsChecksum: string;
  readonly accountTimezone: string;
  readonly bindingVersion: bigint | string;
  readonly sellerSid: string;
  readonly tokenAccessFingerprint: string;
  readonly tokenCategory: string;
  readonly tokenFor: string | null;
  readonly tokenType: AccountBindingCandidate['tokenType'];
  readonly wbEnvironment: AccountBindingCandidate['environment'];
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
async function hasBusinessData(client: DatabaseTransaction): Promise<boolean> {
  const [campaigns, statistics, decisions, audits] = await Promise.all([
    client.campaign.count(),
    client.campaignStatDaily.count(),
    client.bidDecision.count(),
    client.auditEvent.count(),
  ]);
  return campaigns + statistics + decisions + audits > 0;
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
async function appendAudit(client: DatabaseTransaction, event: AuditWrite): Promise<void> {
  await client.auditEvent.create({
    data: {
      action: event.action,
      actor: event.actor,
      after: inputJson(event.after),
      correlationId: event.correlationId,
      entityId: event.entityId,
      entityType: event.entityType,
      id: randomUUID(),
    },
  });
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
 * Converts normalized runtime evidence into a Prisma JSON input.
 *
 * @param value - JSON-compatible runtime value.
 * @returns Prisma JSON input.
 */
function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(safeJson(value)) as Prisma.InputJsonValue;
}

/**
 * Narrows a stored JSON value to an object.
 *
 * @param value - Stored JSON value.
 * @returns Object value or an empty object.
 */
function readJsonObject(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
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
