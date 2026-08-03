import { randomUUID } from 'node:crypto';
import {
  advisoryTransactionLock,
  loadDataSyncCampaignWorkPage,
  upsertClusterCampaignTarget,
  withTransaction,
} from '@wb-bidder/database';
import { evidenceChecksum } from '../checksum.js';
import type { SyncDataKind } from '../types.js';
import type { MinimumBidsResponse } from '@wb-bidder/wb-api';
import type { ClusterCurrentWorkItem, CampaignWorkItem, CampaignWorkScope } from './types.js';
import { upsertSyncSourceSnapshot, inputJson, readJsonObject } from './helpers.js';
import { DataSyncBindingRepositoryBase } from './binding.js';

/** Cohesive data-sync repository capability layer. */
export class DataSyncCampaignRepositoryBase extends DataSyncBindingRepositoryBase {
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
}
