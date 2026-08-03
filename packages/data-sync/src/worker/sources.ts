import { evidenceChecksum } from '../checksum.js';
import {
  canonicalizeNormQuery,
  findNormQueryNfcCollisions,
  normalizeClusterStatisticDay,
} from '../evidence.js';
import type { CampaignWorkItem } from '../repository/index.js';
import type { SyncDataKind } from '../types.js';
import { oldestRecommendationTarget, selectedDataKinds } from './helpers.js';
import { DataSyncWorkerStateBase } from './state.js';

/** Cohesive data-sync worker capability layer. */
export class DataSyncWorkerSourcesBase extends DataSyncWorkerStateBase {
  /**
   * Synchronizes verified card minimum bids for one campaign.
   *
   * @param campaign - Bounded work row.
   * @param runId - Scheduler run UUID.
   * @returns Updated target count.
   */
  protected async synchronizeMinimumBids(
    campaign: CampaignWorkItem,
    runId: string,
  ): Promise<number> {
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
  protected async synchronizeOptionalSources(
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
}
