import { CURRENT_ENDPOINT_PROFILE, type EndpointProfile } from '@wb-bidder/contracts';
import type { WbApiClient } from '@wb-bidder/wb-api';
import { assessTargetSnapshot } from '../evidence.js';
import type { CampaignWorkItem, DataSyncRepository } from '../repository/index.js';
import type { DataSyncWorkerConfiguration } from './types.js';

/** Cohesive data-sync worker capability layer. */
export class DataSyncWorkerStateBase {
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
    protected readonly api: WbApiClient,
    protected readonly repository: DataSyncRepository,
    protected readonly configuration: DataSyncWorkerConfiguration,
    protected readonly profile: EndpointProfile = CURRENT_ENDPOINT_PROFILE,
    protected readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Publishes atomic target snapshots without mixing incompatible source versions.
   *
   * @param campaign - Campaign work row after its source stages.
   * @param runId - Scheduler run UUID.
   * @returns Nothing after all target snapshots are persisted.
   */
  protected async finalizeTargetSnapshots(
    campaign: CampaignWorkItem,
    runId: string,
  ): Promise<void> {
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
  /**
   * Resolves the environment-specific fullstats contract gate.
   *
   * @returns Whether normalized fullstats evidence may be finalized.
   */
  protected fullstatsContractVerified(): boolean {
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
  protected sameDaySpendContractVerified(): boolean {
    return (
      this.configuration.sameDaySpendContractVerified ??
      this.profile.wireContracts.sameDaySpend.status === 'VERIFIED'
    );
  }
}
