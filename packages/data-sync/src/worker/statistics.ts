import { evidenceChecksum } from '../checksum.js';
import { normalizeCampaignStatisticDay } from '../evidence.js';
import type { CampaignWorkItem } from '../repository/index.js';
import { DataSyncWorkerSourcesBase } from './sources.js';

/** Cohesive data-sync worker capability layer. */
export class DataSyncWorkerStatisticsBase extends DataSyncWorkerSourcesBase {
  /**
   * Stores one fullstats read per campaign/day and normalizes only its app/nm leaves.
   *
   * @param campaigns - At most 50 campaign work rows.
   * @param runId - Scheduler run UUID.
   * @returns Invalid source-day count.
   */
  protected async synchronizeStatistics(
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
  protected async finalizePerformanceEvidence(campaign: CampaignWorkItem): Promise<void> {
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
  protected async recordSameDaySpend(
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
}
