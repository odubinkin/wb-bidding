import { isCampaignApplyEligibleStatus } from '@wb-bidder/contracts';
import type { ManualDataSyncScope, DataSyncCounters } from './types.js';
import { selectedDataKinds, statisticsOnlyKinds, chunks, assertNotAborted } from './helpers.js';
import { DataSyncWorkerStatisticsBase } from './statistics.js';

/** Cohesive data-sync worker capability layer. */
export class DataSyncWorkerPageBase extends DataSyncWorkerStatisticsBase {
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
}
