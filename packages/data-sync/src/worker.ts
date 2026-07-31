import {
  CURRENT_ENDPOINT_PROFILE,
  isCampaignApplyEligibleStatus,
  type EndpointProfile,
} from '@wb-bidder/contracts';
import type { WbApiClient } from '@wb-bidder/wb-api';

import { evidenceChecksum } from './checksum.js';
import {
  assessTargetSnapshot,
  canonicalizeNormQuery,
  findNormQueryNfcCollisions,
  normalizeCampaignStatisticDay,
  normalizeClusterStatisticDay,
} from './evidence.js';
import type { CampaignWorkItem, CampaignWorkScope, DataSyncRepository } from './repository.js';
import type { SyncDataKind } from './types.js';

/**
 * Data-sync runtime configuration.
 */
export interface DataSyncWorkerConfiguration {
  /** Deadline for current-state sync. */
  readonly currentStateDeadlineMs: number;
  /** Campaign-details/current-bid maximum age. */
  readonly currentStateFreshnessMinutes: number;
  /** Operator external-write guarantee. */
  readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
  /** Whether fullstats exact leaf/money semantics are verified for this runtime. */
  readonly fullstatsContractVerified?: boolean;
  /** Maximum campaigns loaded from PostgreSQL at once. */
  readonly pageSize: number;
  /** Card minimum-bid maximum age. */
  readonly minimumBidFreshnessMinutes: number;
  /** Statistical overlap first date provider. */
  readonly statisticsBeginDate: () => string;
  /** Latest campaign-statistics read maximum age. */
  readonly campaignStatisticsFreshnessMinutes: number;
  /** Statistical overlap last date provider. */
  readonly statisticsEndDate: () => string;
  /** Whether current-day spend/coverage semantics are verified for this runtime. */
  readonly sameDaySpendContractVerified?: boolean;
  /** Full statistical days to wait before finalization. */
  readonly conversionLagDays: number;
  /** Stable identical source reads required after conversion cutoff. */
  readonly dayFinalizationStableReads: number;
  /** Minimum duration spanned by stable reads. */
  readonly dayFinalizationStableMinutes: number;
  /** Maximum gap between continuous bid-state observations. */
  readonly bidStateMaxObservationGapMinutes: number;
}

/**
 * Operator-bounded synchronization request.
 */
export interface ManualDataSyncScope extends CampaignWorkScope {
  /** Empty or omitted means every supported data kind. */
  readonly dataKinds?: readonly SyncDataKind[];
}

/**
 * Bounded synchronization counters.
 */
export interface DataSyncCounters {
  /** Campaign rows processed. */
  readonly campaigns: number;
  /** Source errors retained as invalid evidence. */
  readonly invalidSources: number;
  /** Target rows processed. */
  readonly targets: number;
}

/**
 * Quota-aware WB synchronization application service.
 */
export class WbDataSyncWorker {
  /**
   * Creates a worker with explicit API, persistence, profile, and time dependencies.
   *
   * @param api - Runtime-validating WB adapter.
   * @param repository - PostgreSQL persistence boundary.
   * @param configuration - Bounded page/deadline settings.
   * @param profile - Immutable embedded endpoint profile.
   * @param now - Current instant provider.
   */
  public constructor(
    private readonly api: WbApiClient,
    private readonly repository: DataSyncRepository,
    private readonly configuration: DataSyncWorkerConfiguration,
    private readonly profile: EndpointProfile = CURRENT_ENDPOINT_PROFILE,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Runs discovery, details, and current-card-bid observation as a short independent job.
   *
   * @returns Non-overlap result and bounded counters.
   */
  public async synchronizeCurrentState(): Promise<{
    readonly started: boolean;
    readonly counters?: DataSyncCounters;
  }> {
    const run = await this.repository.withSchedulerRun(
      'CURRENT_STATE_SYNC',
      this.configuration.currentStateDeadlineMs,
      async ({ runId, signal }) => {
        const fetchedAt = this.now();
        const grouped = await this.api.getCampaignCount();
        const discovered = grouped.adverts.flatMap((group) =>
          group.advert_list.map((campaign) => ({
            status: group.status,
            type: group.type,
            wbCampaignId: campaign.advertId,
          })),
        );
        await this.repository.upsertDiscoveredCampaigns(discovered, fetchedAt);
        const cursor = await this.repository.loadNumericCheckpoint('CAMPAIGN_DETAILS');
        const orderedIds = discovered
          .filter(
            (campaign) => campaign.status === 4 || isCampaignApplyEligibleStatus(campaign.status),
          )
          .map((campaign) => BigInt(campaign.wbCampaignId))
          .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
        let selected = orderedIds.filter((id) => id > cursor).slice(0, this.configuration.pageSize);
        let wrapped = false;
        if (selected.length === 0 && orderedIds.length > 0) {
          selected = orderedIds.slice(0, this.configuration.pageSize);
          wrapped = true;
        }
        let targets = 0;
        for (const ids of chunks(selected, 50)) {
          assertNotAborted(signal);
          const details = await this.api.getCampaignDetails(ids.map(Number));
          const result = await this.repository.upsertCampaignDetails(
            details,
            this.now(),
            runId,
            this.configuration.externalWriteControlMode,
          );
          targets += result.targets;
        }
        if (
          this.profile.wireContracts.clusterBid.status === 'VERIFIED' &&
          this.profile.clusterBidSemantics !== null
        ) {
          const clusterWork = await this.repository.loadClusterCurrentWork(selected);
          for (const campaign of clusterWork) {
            for (const nmIds of chunks(campaign.nmIds, 100)) {
              const currentBids = await this.api.getClusterBids({
                items: nmIds.map((nmId) => ({
                  advert_id: Number(campaign.wbCampaignId),
                  nm_id: Number(nmId),
                })),
              });
              targets += await this.repository.applyClusterBidStates({
                bids: currentBids.bids,
                campaignId: campaign.campaignId,
                contractVersion: this.profile.wireContracts.clusterBid.version,
                externalWriteControlMode: this.configuration.externalWriteControlMode,
                fetchedAt: this.now(),
                minimumBidMinor: this.profile.clusterBidSemantics.minimumBidMinor,
                profileId: this.profile.profileId,
                runId,
              });
            }
          }
        }
        const nextCursor = selected.at(-1) ?? 0n;
        await this.repository.saveCheckpoint(
          'CAMPAIGN_DETAILS',
          { value: nextCursor.toString() },
          this.now(),
          BigInt(selected.length),
          BigInt(orderedIds.length),
          wrapped || selected.length === orderedIds.length,
        );
        await this.repository.saveCheckpoint(
          'CURRENT_BID',
          { value: nextCursor.toString() },
          this.now(),
          BigInt(targets),
          null,
          wrapped || selected.length === orderedIds.length,
        );
        return Object.freeze({
          campaigns: selected.length,
          invalidSources: 0,
          targets,
        });
      },
    );
    return Object.freeze({
      ...(run.result === undefined ? {} : { counters: run.result }),
      started: run.started,
    });
  }

  /**
   * Runs one bounded page of slow minimum/statistics/cluster/recommendation/budget stages.
   *
   * Unverified money/budget/cluster-bid semantics are retained diagnostically and never marked
   * eligible for APPLY.
   *
   * @returns Non-overlap result and bounded counters.
   */
  public async synchronizeDataPage(): Promise<{
    readonly started: boolean;
    readonly counters?: DataSyncCounters;
  }> {
    const run = await this.repository.withSchedulerRun(
      'DATA_SYNC',
      Math.max(this.configuration.currentStateDeadlineMs * 6, 60_000),
      async ({ runId, signal }) => {
        let cursor = await this.repository.loadNumericCheckpoint('MINIMUM_BID');
        let page = await this.repository.loadCampaignWorkPage(cursor, this.configuration.pageSize);
        let wrapped = false;
        if (page.length === 0 && cursor !== 0n) {
          cursor = 0n;
          page = await this.repository.loadCampaignWorkPage(cursor, this.configuration.pageSize);
          wrapped = true;
        }
        let targets = 0;
        let invalidSources = 0;
        for (const campaign of page) {
          if (!isCampaignApplyEligibleStatus(campaign.status)) continue;
          assertNotAborted(signal);
          targets += await this.synchronizeMinimumBids(campaign, runId);
        }
        page = await this.repository.loadCampaignWorkPage(cursor, this.configuration.pageSize);
        for (const campaignBatch of chunks(page, 50)) {
          assertNotAborted(signal);
          invalidSources += await this.synchronizeStatistics(campaignBatch, runId);
        }
        for (const campaign of page) {
          assertNotAborted(signal);
          invalidSources += await this.synchronizeOptionalSources(
            campaign,
            runId,
            isCampaignApplyEligibleStatus(campaign.status)
              ? selectedDataKinds()
              : statisticsOnlyKinds(selectedDataKinds()),
          );
          await this.finalizePerformanceEvidence(campaign);
          if (isCampaignApplyEligibleStatus(campaign.status)) {
            await this.finalizeTargetSnapshots(campaign, runId);
          }
        }
        const nextCursor = page.at(-1)?.wbCampaignId ?? 0n;
        for (const dataKind of [
          'MINIMUM_BID',
          'CAMPAIGN_STATISTICS',
          'CLUSTER_LIST',
          'BID_RECOMMENDATION',
          'BUDGET_DIAGNOSTIC',
        ] as const) {
          await this.repository.saveCheckpoint(
            dataKind,
            { value: nextCursor.toString() },
            this.now(),
            BigInt(page.length),
            null,
            wrapped || page.length < this.configuration.pageSize,
          );
        }
        return Object.freeze({ campaigns: page.length, invalidSources, targets });
      },
    );
    return Object.freeze({
      ...(run.result === undefined ? {} : { counters: run.result }),
      started: run.started,
    });
  }

  /**
   * Runs an operator-requested bounded resync without widening it to the whole account.
   *
   * @param scope - Campaign/target filters and selected data kinds.
   * @returns Non-overlap result and exact counters.
   */
  public async synchronizeScope(scope: ManualDataSyncScope): Promise<{
    readonly started: boolean;
    readonly counters?: DataSyncCounters;
  }> {
    const selectedKinds = selectedDataKinds(scope.dataKinds);
    const run = await this.repository.withSchedulerRun(
      'MANUAL_RESYNC',
      Math.max(this.configuration.currentStateDeadlineMs * 6, 60_000),
      async ({ runId, signal }) => {
        let page = await this.repository.loadCampaignWorkPage(
          0n,
          this.configuration.pageSize,
          scope,
          true,
        );
        let targets = 0;
        let invalidSources = 0;
        if (
          selectedKinds.has('CAMPAIGN_DISCOVERY') ||
          selectedKinds.has('CAMPAIGN_DETAILS') ||
          selectedKinds.has('CURRENT_BID')
        ) {
          for (const batch of chunks(page, 50)) {
            assertNotAborted(signal);
            const details = await this.api.getCampaignDetails(
              batch.map((campaign) => Number(campaign.wbCampaignId)),
            );
            const result = await this.repository.upsertCampaignDetails(
              details,
              this.now(),
              runId,
              this.configuration.externalWriteControlMode,
            );
            targets += result.targets;
          }
          page = await this.repository.loadCampaignWorkPage(0n, this.configuration.pageSize, scope);
        }
        if (selectedKinds.has('MINIMUM_BID')) {
          for (const campaign of page) {
            if (!isCampaignApplyEligibleStatus(campaign.status)) continue;
            assertNotAborted(signal);
            targets += await this.synchronizeMinimumBids(campaign, runId);
          }
        }
        if (selectedKinds.has('CAMPAIGN_STATISTICS')) {
          for (const batch of chunks(page, 50)) {
            assertNotAborted(signal);
            invalidSources += await this.synchronizeStatistics(batch, runId);
          }
        }
        for (const campaign of page) {
          assertNotAborted(signal);
          invalidSources += await this.synchronizeOptionalSources(
            campaign,
            runId,
            isCampaignApplyEligibleStatus(campaign.status)
              ? selectedKinds
              : statisticsOnlyKinds(selectedKinds),
          );
          if (selectedKinds.has('CAMPAIGN_STATISTICS')) {
            await this.finalizePerformanceEvidence(campaign);
          }
          if (isCampaignApplyEligibleStatus(campaign.status)) {
            await this.finalizeTargetSnapshots(campaign, runId);
          }
        }
        return Object.freeze({ campaigns: page.length, invalidSources, targets });
      },
    );
    return Object.freeze({
      ...(run.result === undefined ? {} : { counters: run.result }),
      started: run.started,
    });
  }

  /**
   * Stores one fullstats read per campaign/day and normalizes only its app/nm leaves.
   *
   * @param campaigns - At most 50 campaign work rows.
   * @param runId - Scheduler run UUID.
   * @returns Invalid source-day count.
   */
  private async synchronizeStatistics(
    campaigns: readonly CampaignWorkItem[],
    runId: string,
  ): Promise<number> {
    if (campaigns.length === 0) return 0;
    const response = await this.api.getCampaignStatistics(
      campaigns.map((campaign) => Number(campaign.wbCampaignId)),
      this.configuration.statisticsBeginDate(),
      this.configuration.statisticsEndDate(),
    );
    const fetchedAt = this.now();
    const contractVerified = this.fullstatsContractVerified();
    let invalidSources = 0;
    for (const campaign of campaigns) {
      const source = response.find((item) => BigInt(item.advertId) === campaign.wbCampaignId);
      if (source === undefined) {
        invalidSources += 1;
        await this.repository.recordSourceSnapshot({
          campaignId: campaign.campaignId,
          dataKind: 'CAMPAIGN_STATISTICS',
          endpointProfile: this.profile.profileId,
          fetchedAt,
          invalidReason: 'CAMPAIGN_STATISTICS_MISSING',
          normalizedData: [],
          sourceChecksum: evidenceChecksum([]),
          syncRunId: runId,
          valid: false,
        });
        continue;
      }
      if (source.days.length === 0) {
        invalidSources += 1;
        await this.repository.recordSourceSnapshot({
          campaignId: campaign.campaignId,
          dataKind: 'CAMPAIGN_STATISTICS',
          endpointProfile: this.profile.profileId,
          fetchedAt,
          invalidReason: contractVerified
            ? 'CAMPAIGN_STATISTICS_EMPTY'
            : 'FULLSTATS_MONEY_AND_AGGREGATION_UNVERIFIED',
          normalizedData: source,
          sourceChecksum: evidenceChecksum(source),
          syncRunId: runId,
          valid: false,
        });
        continue;
      }
      for (const day of source.days) {
        const date = day.date.slice(0, 10);
        const sourceVersion = evidenceChecksum(day);
        const hasLeafRows = day.apps.some((app) => app.nms.length > 0);
        const valid = contractVerified && hasLeafRows;
        await this.repository.recordSourceSnapshot({
          campaignId: campaign.campaignId,
          dataKind: 'CAMPAIGN_STATISTICS',
          endpointProfile: this.profile.profileId,
          fetchedAt,
          ...(valid
            ? {}
            : {
                invalidReason: contractVerified
                  ? 'FULLSTATS_LEAF_AGGREGATION_MISSING'
                  : 'FULLSTATS_MONEY_AND_AGGREGATION_UNVERIFIED',
              }),
          normalizedData: day,
          sourceChecksum: sourceVersion,
          sourceDate: date,
          syncRunId: runId,
          valid,
        });
        if (!valid) {
          invalidSources += 1;
          continue;
        }
        await this.repository.upsertCampaignStatisticLeaves(
          day.apps.flatMap((app) =>
            app.nms.map((nm) => ({
              appType: app.appType,
              campaignId: campaign.campaignId,
              fetchedAt,
              nmId: BigInt(nm.nmId),
              sourceVersion,
              statistic: normalizeCampaignStatisticDay(
                {
                  atbs: nm.atbs,
                  ...(nm.canceled === undefined ? {} : { canceled: nm.canceled }),
                  clicks: nm.clicks,
                  date,
                  orders: nm.orders,
                  ...(nm.shks === undefined ? {} : { shks: nm.shks }),
                  sum: nm.sum,
                  sum_price: nm.sum_price,
                  views: nm.views,
                },
                'VERIFIED',
              ),
              syncRunId: runId,
              wbCampaignId: campaign.wbCampaignId,
            })),
          ),
        );
        if (
          this.sameDaySpendContractVerified() &&
          date === this.configuration.statisticsEndDate()
        ) {
          await this.recordSameDaySpend(campaign, day, fetchedAt, runId);
        }
      }
    }
    return invalidSources;
  }

  /**
   * Finalizes eligible historical response days only for a verified statistics profile.
   *
   * @param campaign - Bounded campaign page item.
   * @returns Nothing after draft/final/superseded versions are persisted.
   */
  private async finalizePerformanceEvidence(campaign: CampaignWorkItem): Promise<void> {
    if (!this.fullstatsContractVerified()) return;
    await this.repository.finalizePerformanceDaysForCampaign(
      campaign.campaignId,
      {
        bidStateMaxObservationGapMinutes: this.configuration.bidStateMaxObservationGapMinutes,
        conversionLagDays: this.configuration.conversionLagDays,
        dayFinalizationStableMinutes: this.configuration.dayFinalizationStableMinutes,
        dayFinalizationStableReads: this.configuration.dayFinalizationStableReads,
        externalWriteControlMode: this.configuration.externalWriteControlMode,
      },
      this.now(),
    );
  }

  /**
   * Stores deterministic target-level current-day spend and explicit coverage for a verified
   * runtime contract.
   *
   * @param campaign - Campaign work item with article targets.
   * @param day - Validated fullstats day.
   * @param day.apps - Application-level leaves.
   * @param day.date - WB statistical date.
   * @param fetchedAt - Model-time source read.
   * @param runId - Owning synchronization run.
   * @returns Nothing after immutable source snapshots are recorded.
   */
  private async recordSameDaySpend(
    campaign: CampaignWorkItem,
    day: {
      readonly apps: readonly {
        readonly nms: readonly {
          readonly nmId: number;
          readonly sum: number | string;
        }[];
      }[];
      readonly date: string;
    },
    fetchedAt: Date,
    runId: string,
  ): Promise<void> {
    const spendByArticle = new Map<string, bigint>();
    for (const app of day.apps) {
      for (const nm of app.nms) {
        const spend = normalizeCampaignStatisticDay(
          {
            atbs: 0,
            canceled: 0,
            clicks: 0,
            date: day.date.slice(0, 10),
            orders: 0,
            shks: 0,
            sum: nm.sum,
            sum_price: 0,
            views: 0,
          },
          'VERIFIED',
        ).spendMinor;
        const key = String(nm.nmId);
        spendByArticle.set(key, (spendByArticle.get(key) ?? 0n) + spend);
      }
    }
    for (const target of campaign.targets) {
      const observedSameDaySpendMinor = spendByArticle.get(target.nmId.toString());
      if (observedSameDaySpendMinor === undefined) continue;
      const normalizedData = {
        coverageEndedAt: fetchedAt.toISOString(),
        observedSameDaySpendMinor: observedSameDaySpendMinor.toString(),
        statisticalDate: day.date.slice(0, 10),
      };
      await this.repository.recordSourceSnapshot({
        campaignId: campaign.campaignId,
        dataKind: 'SAME_DAY_SPEND',
        endpointProfile: this.profile.profileId,
        fetchedAt,
        normalizedData,
        sourceChecksum: evidenceChecksum(normalizedData),
        sourceDate: normalizedData.statisticalDate,
        syncRunId: runId,
        targetId: target.targetId,
        valid: true,
      });
    }
  }

  /**
   * Resolves the environment-specific fullstats contract gate.
   *
   * @returns Whether normalized fullstats evidence may be finalized.
   */
  private fullstatsContractVerified(): boolean {
    return (
      this.configuration.fullstatsContractVerified ??
      this.profile.wireContracts.fullstatsMoneyAndAggregation.status === 'VERIFIED'
    );
  }

  /**
   * Resolves the environment-specific current-day coverage contract gate.
   *
   * @returns Whether current-day spend snapshots may be produced.
   */
  private sameDaySpendContractVerified(): boolean {
    return (
      this.configuration.sameDaySpendContractVerified ??
      this.profile.wireContracts.sameDaySpend.status === 'VERIFIED'
    );
  }

  /**
   * Synchronizes verified card minimum bids for one campaign.
   *
   * @param campaign - Bounded work row.
   * @param runId - Scheduler run UUID.
   * @returns Updated target count.
   */
  private async synchronizeMinimumBids(campaign: CampaignWorkItem, runId: string): Promise<number> {
    const cardTargets = campaign.targets.filter((target) => target.targetKind === 'CARD');
    const nmIds = [...new Set(cardTargets.map((target) => target.nmId.toString()))]
      .slice(0, 100)
      .map(Number);
    if (nmIds.length === 0 || (campaign.paymentType !== 'CPM' && campaign.paymentType !== 'CPC')) {
      return 0;
    }
    const placements = [
      ...new Set(
        cardTargets.map((target) =>
          target.placement === 'RECOMMENDATIONS'
            ? ('recommendation' as const)
            : (target.placement.toLowerCase() as 'combined' | 'search'),
        ),
      ),
    ];
    const response = await this.api.getMinimumBids({
      advert_id: Number(campaign.wbCampaignId),
      nm_ids: nmIds,
      payment_type: campaign.paymentType.toLowerCase() as 'cpc' | 'cpm',
      placement_types: placements,
    });
    let updated = 0;
    for (const placement of cardTargets.map((target) => target.placement)) {
      updated += await this.repository.applyMinimumBids(
        campaign.campaignId,
        response,
        placement,
        this.now(),
        runId,
      );
    }
    return updated;
  }

  /**
   * Synchronizes cluster discovery plus diagnostic recommendations and budget.
   *
   * @param campaign - Bounded work row.
   * @param runId - Scheduler run UUID.
   * @param selectedKinds - Closed data-kind selection.
   * @returns Number of invalid diagnostic sources retained.
   */
  private async synchronizeOptionalSources(
    campaign: CampaignWorkItem,
    runId: string,
    selectedKinds: ReadonlySet<SyncDataKind> = selectedDataKinds(),
  ): Promise<number> {
    let invalidSources = 0;
    const pairs = [...new Set(campaign.targets.map((target) => target.nmId.toString()))]
      .slice(0, 100)
      .map((nmId) => ({
        advert_id: Number(campaign.wbCampaignId),
        nm_id: Number(nmId),
      }));
    if (pairs.length > 0 && campaign.bidType === 'MANUAL' && selectedKinds.has('CLUSTER_LIST')) {
      const clusters = await this.api.listClusters({ items: pairs });
      for (const item of clusters.items) {
        const collisions = findNormQueryNfcCollisions(item.norm_queries);
        const localTarget = campaign.targets.find((target) => target.nmId === BigInt(item.nm_id));
        if (localTarget === undefined) {
          continue;
        }
        const valid = collisions.length === 0;
        await this.repository.recordSourceSnapshot({
          campaignId: campaign.campaignId,
          dataKind: 'CLUSTER_LIST',
          endpointProfile: this.profile.profileId,
          fetchedAt: this.now(),
          ...(valid ? {} : { invalidReason: 'NFC_QUERY_COLLISION' }),
          normalizedData: item,
          sourceChecksum: evidenceChecksum(item),
          syncRunId: runId,
          targetId: localTarget.targetId,
          valid,
        });
        if (valid) {
          await this.repository.upsertClusterTargets(
            campaign.campaignId,
            BigInt(item.nm_id),
            item.norm_queries.map((wire) => ({
              canonical: canonicalizeNormQuery(wire),
              wire,
            })),
          );
        } else {
          invalidSources += 1;
        }
      }
      if (
        campaign.paymentType === 'CPM' &&
        this.profile.wireContracts.clusterBid.status === 'VERIFIED' &&
        this.profile.clusterBidSemantics !== null
      ) {
        const currentBids = await this.api.getClusterBids({ items: pairs });
        await this.repository.applyClusterBidStates({
          bids: currentBids.bids,
          campaignId: campaign.campaignId,
          contractVersion: this.profile.wireContracts.clusterBid.version,
          externalWriteControlMode: this.configuration.externalWriteControlMode,
          fetchedAt: this.now(),
          minimumBidMinor: this.profile.clusterBidSemantics.minimumBidMinor,
          profileId: this.profile.profileId,
          runId,
        });
      }
    }
    const recommendationTarget =
      campaign.paymentType === 'CPM'
        ? oldestRecommendationTarget(
            campaign.targets.filter((target) => target.targetKind === 'CARD'),
          )
        : undefined;
    if (recommendationTarget !== undefined && selectedKinds.has('BID_RECOMMENDATION')) {
      const recommendation = await this.api.getBidRecommendations(
        Number(campaign.wbCampaignId),
        Number(recommendationTarget.nmId),
      );
      await this.repository.recordSourceSnapshot({
        campaignId: campaign.campaignId,
        dataKind: 'BID_RECOMMENDATION',
        endpointProfile: this.profile.profileId,
        fetchedAt: this.now(),
        normalizedData: recommendation,
        sourceChecksum: evidenceChecksum(recommendation),
        syncRunId: runId,
        targetId: recommendationTarget.targetId,
        valid: true,
      });
    }
    if (
      selectedKinds.has('CLUSTER_STATISTICS') &&
      pairs.length > 0 &&
      campaign.bidType === 'MANUAL'
    ) {
      const clusterStatistics = await this.api.getClusterStatistics({
        from: this.configuration.statisticsBeginDate(),
        items: pairs,
        to: this.configuration.statisticsEndDate(),
      });
      if (this.fullstatsContractVerified()) {
        const fetchedAt = this.now();
        for (const item of clusterStatistics.items) {
          for (const day of item.dailyStats) {
            const normalized = normalizeClusterStatisticDay(
              {
                atbs: day.stat.atbs,
                clicks: day.stat.clicks,
                date: day.date,
                normQuery: day.stat.normQuery,
                orders: day.stat.orders,
                ...(day.stat.shks === undefined ? {} : { shks: day.stat.shks }),
                spend: day.stat.spend,
                ...(day.stat.views === undefined ? {} : { views: day.stat.views }),
              },
              'VERIFIED',
            );
            await this.repository.upsertClusterStatisticDay({
              campaignId: campaign.campaignId,
              fetchedAt,
              nmId: BigInt(item.nmId),
              normQueryCanonical: canonicalizeNormQuery(day.stat.normQuery),
              normQueryWire: day.stat.normQuery,
              normalized,
              profileId: this.profile.profileId,
              runId,
              wbCampaignId: BigInt(item.advertId),
            });
          }
        }
      } else {
        await this.repository.recordSourceSnapshot({
          campaignId: campaign.campaignId,
          dataKind: 'CLUSTER_STATISTICS',
          endpointProfile: this.profile.profileId,
          fetchedAt: this.now(),
          invalidReason: 'CLUSTER_STATISTICS_SEMANTICS_UNVERIFIED',
          normalizedData: clusterStatistics,
          sourceChecksum: evidenceChecksum(clusterStatistics),
          syncRunId: runId,
          valid: false,
        });
        invalidSources += 1;
      }
    }
    if (selectedKinds.has('BUDGET_DIAGNOSTIC')) {
      const budget = await this.api.getCampaignBudget(Number(campaign.wbCampaignId));
      await this.repository.recordSourceSnapshot({
        campaignId: campaign.campaignId,
        dataKind: 'BUDGET_DIAGNOSTIC',
        endpointProfile: this.profile.profileId,
        fetchedAt: this.now(),
        invalidReason: 'BUDGET_SEMANTICS_UNVERIFIED',
        normalizedData: budget,
        sourceChecksum: evidenceChecksum(budget),
        syncRunId: runId,
        valid: false,
      });
      invalidSources += 1;
    }
    return invalidSources;
  }

  /**
   * Publishes atomic target snapshots without mixing incompatible source versions.
   *
   * @param campaign - Campaign work row after its source stages.
   * @param runId - Scheduler run UUID.
   * @returns Nothing after all target snapshots are persisted.
   */
  private async finalizeTargetSnapshots(campaign: CampaignWorkItem, runId: string): Promise<void> {
    const createdAt = this.now();
    const statistics = await this.repository.loadLatestCampaignStatisticsEvidence(
      campaign.campaignId,
    );
    for (const target of campaign.targets) {
      const targetStatistics =
        target.targetKind === 'CLUSTER'
          ? await this.repository.loadLatestClusterStatisticsEvidence(target.targetId)
          : statistics;
      const sameDaySpend = await this.repository.loadLatestSameDaySpendEvidence(target.targetId);
      const evidence = [
        {
          dataKind: 'CAMPAIGN_DETAILS' as const,
          fetchedAt: campaign.detailsFetchedAt ?? new Date(0),
          freshnessMinutes: this.configuration.currentStateFreshnessMinutes,
          regimeChecksum: campaign.detailsChecksum,
          required: true,
          sourceChecksum: campaign.detailsChecksum ?? 'missing',
          valid: campaign.detailsChecksum !== null && campaign.detailsFetchedAt !== null,
        },
        {
          dataKind: 'CURRENT_BID' as const,
          fetchedAt: target.currentBidConfirmedAt ?? new Date(0),
          freshnessMinutes: this.configuration.currentStateFreshnessMinutes,
          regimeChecksum: campaign.detailsChecksum,
          required: true,
          sourceChecksum: target.currentBidChecksum ?? 'missing',
          valid: target.currentBidChecksum !== null && target.currentBidConfirmedAt !== null,
        },
        {
          dataKind: 'MINIMUM_BID' as const,
          fetchedAt: target.minimumBidConfirmedAt ?? new Date(0),
          freshnessMinutes: this.configuration.minimumBidFreshnessMinutes,
          regimeChecksum: null,
          required: true,
          sourceChecksum: target.minimumBidChecksum ?? 'missing',
          valid: target.minimumBidChecksum !== null && target.minimumBidConfirmedAt !== null,
        },
        {
          dataKind:
            target.targetKind === 'CLUSTER'
              ? ('CLUSTER_STATISTICS' as const)
              : ('CAMPAIGN_STATISTICS' as const),
          fetchedAt: targetStatistics?.fetchedAt ?? new Date(0),
          freshnessMinutes: this.configuration.campaignStatisticsFreshnessMinutes,
          regimeChecksum: campaign.detailsChecksum,
          required: true,
          sourceChecksum: targetStatistics?.sourceChecksum ?? 'missing',
          valid: targetStatistics?.valid === true && this.fullstatsContractVerified(),
        },
        {
          dataKind: 'SAME_DAY_SPEND' as const,
          fetchedAt: sameDaySpend?.fetchedAt ?? new Date(0),
          freshnessMinutes: this.configuration.campaignStatisticsFreshnessMinutes,
          regimeChecksum: null,
          required: false,
          sourceChecksum: sameDaySpend?.sourceChecksum ?? 'missing',
          valid: sameDaySpend?.valid === true && this.sameDaySpendContractVerified(),
        },
      ];
      const assessment = assessTargetSnapshot(evidence, createdAt);
      await this.repository.recordTargetSnapshot(
        target.targetId,
        runId,
        createdAt,
        assessment,
        Object.fromEntries(evidence.map((item) => [item.dataKind, item.sourceChecksum])),
      );
    }
  }
}

/**
 * Selects one oldest article-level recommendation target without starving large campaigns.
 *
 * @param targets - Stable campaign target page.
 * @returns One representative target for the least recently synchronized article.
 */
function oldestRecommendationTarget(
  targets: CampaignWorkItem['targets'],
): CampaignWorkItem['targets'][number] | undefined {
  const byArticle = new Map<string, CampaignWorkItem['targets'][number]>();
  for (const target of targets) {
    const key = target.nmId.toString();
    const current = byArticle.get(key);
    if (
      current === undefined ||
      recommendationOrder(target.recommendationFetchedAt) <
        recommendationOrder(current.recommendationFetchedAt)
    ) {
      byArticle.set(key, target);
    }
  }
  return [...byArticle.values()].sort((left, right) => {
    const freshness =
      recommendationOrder(left.recommendationFetchedAt) -
      recommendationOrder(right.recommendationFetchedAt);
    return freshness !== 0
      ? freshness
      : left.nmId < right.nmId
        ? -1
        : left.nmId > right.nmId
          ? 1
          : 0;
  })[0];
}

/**
 * Converts missing recommendation evidence into highest oldest-first priority.
 *
 * @param value - Last successful fetch time.
 * @returns Comparable epoch value.
 */
function recommendationOrder(value: Date | null): number {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}

const ALL_SYNC_DATA_KINDS: readonly SyncDataKind[] = Object.freeze([
  'CAMPAIGN_DISCOVERY',
  'CAMPAIGN_DETAILS',
  'CURRENT_BID',
  'MINIMUM_BID',
  'CAMPAIGN_STATISTICS',
  'CLUSTER_LIST',
  'CLUSTER_STATISTICS',
  'BID_RECOMMENDATION',
  'BUDGET_DIAGNOSTIC',
  'SAME_DAY_SPEND',
]);

/**
 * Validates an operator-selected data-kind list against the closed enum.
 *
 * @param values - Optional selection; empty means every supported kind.
 * @returns Immutable membership set.
 */
function selectedDataKinds(values: readonly SyncDataKind[] = []): ReadonlySet<SyncDataKind> {
  const selected = values.length === 0 ? ALL_SYNC_DATA_KINDS : values;
  const allowed = new Set<SyncDataKind>(ALL_SYNC_DATA_KINDS);
  if (selected.some((value) => !allowed.has(value))) {
    throw new Error('INVALID_MANUAL_JOB_DATA_KIND');
  }
  return new Set(selected);
}

/**
 * Retains only slow statistical work for a completed campaign.
 *
 * @param selected - Requested data kinds.
 * @returns Statistical optional-source kinds allowed for status 7.
 */
function statisticsOnlyKinds(selected: ReadonlySet<SyncDataKind>): ReadonlySet<SyncDataKind> {
  return new Set<SyncDataKind>(selected.has('CLUSTER_STATISTICS') ? ['CLUSTER_STATISTICS'] : []);
}

/**
 * Splits a readonly array into bounded contiguous batches.
 *
 * @template T - Item type.
 * @param values - Source values.
 * @param size - Positive maximum batch size.
 * @returns Batches.
 */
function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Stops a stage at the scheduler deadline.
 *
 * @param signal - Deadline signal.
 * @returns Nothing before cancellation.
 */
function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Scheduler run deadline exceeded');
  }
}
