import { CURRENT_ENDPOINT_PROFILE, type EndpointProfile } from '@wb-bidder/contracts';
import type { WbApiClient } from '@wb-bidder/wb-api';

import { evidenceChecksum } from './checksum.js';
import {
  assessTargetSnapshot,
  canonicalizeNormQuery,
  findNormQueryNfcCollisions,
} from './evidence.js';
import type { CampaignWorkItem, DataSyncRepository } from './repository.js';

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
  /** Maximum campaigns loaded from PostgreSQL at once. */
  readonly pageSize: number;
  /** Card minimum-bid maximum age. */
  readonly minimumBidFreshnessMinutes: number;
  /** Statistical overlap first date provider. */
  readonly statisticsBeginDate: () => string;
  /** Statistical overlap last date provider. */
  readonly statisticsEndDate: () => string;
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
          assertNotAborted(signal);
          targets += await this.synchronizeMinimumBids(campaign, runId);
        }
        page = await this.repository.loadCampaignWorkPage(cursor, this.configuration.pageSize);
        for (const campaignBatch of chunks(page, 50)) {
          assertNotAborted(signal);
          const statistics = await this.api.getCampaignStatistics(
            campaignBatch.map((campaign) => Number(campaign.wbCampaignId)),
            this.configuration.statisticsBeginDate(),
            this.configuration.statisticsEndDate(),
          );
          for (const campaign of campaignBatch) {
            await this.repository.recordSourceSnapshot({
              campaignId: campaign.campaignId,
              dataKind: 'CAMPAIGN_STATISTICS',
              endpointProfile: this.profile.profileId,
              fetchedAt: this.now(),
              invalidReason: 'FULLSTATS_MONEY_AND_AGGREGATION_UNVERIFIED',
              normalizedData: statistics.filter(
                (item) => BigInt(item.advertId) === campaign.wbCampaignId,
              ),
              sourceChecksum: evidenceChecksum(statistics),
              syncRunId: runId,
              valid: false,
            });
            invalidSources += 1;
          }
        }
        for (const campaign of page) {
          assertNotAborted(signal);
          invalidSources += await this.synchronizeOptionalSources(campaign, runId);
          await this.finalizeTargetSnapshots(campaign, runId);
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
   * Synchronizes verified card minimum bids for one campaign.
   *
   * @param campaign - Bounded work row.
   * @param runId - Scheduler run UUID.
   * @returns Updated target count.
   */
  private async synchronizeMinimumBids(campaign: CampaignWorkItem, runId: string): Promise<number> {
    const nmIds = [...new Set(campaign.targets.map((target) => target.nmId.toString()))]
      .slice(0, 100)
      .map(Number);
    if (nmIds.length === 0 || (campaign.paymentType !== 'CPM' && campaign.paymentType !== 'CPC')) {
      return 0;
    }
    const placements = [
      ...new Set(
        campaign.targets.map((target) =>
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
    for (const placement of campaign.targets.map((target) => target.placement)) {
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
   * @returns Number of invalid diagnostic sources retained.
   */
  private async synchronizeOptionalSources(
    campaign: CampaignWorkItem,
    runId: string,
  ): Promise<number> {
    let invalidSources = 0;
    const pairs = campaign.targets.slice(0, 100).map((target) => ({
      advert_id: Number(campaign.wbCampaignId),
      nm_id: Number(target.nmId),
    }));
    if (pairs.length > 0 && campaign.bidType === 'MANUAL') {
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
    }
    const recommendationTarget = campaign.paymentType === 'CPM' ? campaign.targets[0] : undefined;
    if (recommendationTarget !== undefined) {
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
    return invalidSources + 1;
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
    for (const target of campaign.targets) {
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
          dataKind: 'CAMPAIGN_STATISTICS' as const,
          fetchedAt: createdAt,
          freshnessMinutes: this.configuration.minimumBidFreshnessMinutes,
          regimeChecksum: campaign.detailsChecksum,
          required: true,
          sourceChecksum: this.profile.wireContracts.fullstatsMoneyAndAggregation.version,
          valid: this.profile.wireContracts.fullstatsMoneyAndAggregation.status === 'VERIFIED',
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
