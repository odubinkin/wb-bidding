import { isCampaignApplyEligibleStatus } from '@wb-bidder/contracts';
import type { DataSyncCounters } from './types.js';
import { chunks, assertNotAborted } from './helpers.js';
import { DataSyncWorkerPageBase } from './page.js';

/** Cohesive data-sync worker capability layer. */
export class DataSyncWorkerCurrentStateBase extends DataSyncWorkerPageBase {
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
}
