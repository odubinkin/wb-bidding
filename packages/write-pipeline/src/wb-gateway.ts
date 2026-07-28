/* eslint-disable jsdoc/require-jsdoc */
import type { WbApiClient } from '@wb-bidder/wb-api';

import type {
  ClaimedQueueItem,
  DispatchReservation,
  DispatchResult,
  LiveBidState,
  WriteGateway,
} from './types.js';

type DispatchInput = Parameters<WriteGateway['dispatch']>[1][number];

/**
 * Card-bid gateway that preserves WB identifiers only at the transport boundary.
 */
export class WbCardBidGateway implements WriteGateway {
  public constructor(private readonly client: WbApiClient) {}

  public async readLiveState(item: ClaimedQueueItem): Promise<LiveBidState> {
    assertCard(item.targetKind);
    const campaignId = safeWbNumber(item.wbCampaignId);
    const nmId = safeWbNumber(item.nmId);
    const details = await this.client.getCampaignDetails([campaignId]);
    const campaign = details.adverts.find((candidate) => candidate.id === campaignId);
    const target = campaign?.nm_settings.find((candidate) => candidate.nm_id === nmId);
    if (campaign === undefined || target === undefined) throw new Error('LIVE_TARGET_NOT_FOUND');
    const placement = placementWire(item.placement);
    const bidMinor =
      placement === 'recommendations'
        ? BigInt(target.bids_kopecks.recommendations)
        : placement === 'search'
          ? BigInt(target.bids_kopecks.search)
          : BigInt(Math.max(target.bids_kopecks.search, target.bids_kopecks.recommendations));
    return Object.freeze({
      bidMinor,
      explicit: true,
      observedAt: new Date(),
      sourceMarker: `campaign-details:${campaign.timestamps.updated}`,
    });
  }

  public async dispatch(
    endpointKey: string,
    items: readonly DispatchInput[],
    correlationId: string,
  ): Promise<DispatchResult> {
    if (endpointKey !== 'cardBidsWrite') throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
    return this.dispatchWith(items, correlationId, (payload) => this.client.writeCardBids(payload));
  }

  public async reserveDispatch(endpointKey: string): Promise<DispatchReservation> {
    if (endpointKey !== 'cardBidsWrite') throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
    const reserved = await this.client.reserveCardBidWrite();
    return Object.freeze({
      dispatch: (items: readonly DispatchInput[], correlationId: string) =>
        this.dispatchWith(items, correlationId, (payload) => reserved.dispatch(payload)),
      release: () => {
        reserved.release();
      },
    });
  }

  private async dispatchWith(
    items: readonly DispatchInput[],
    correlationId: string,
    write: (payload: CardWritePayload) => ReturnType<WbApiClient['writeCardBids']>,
  ): Promise<DispatchResult> {
    if (items.some((item) => item.targetKind !== 'CARD' || item.action !== 'SET')) {
      throw new Error('UNSUPPORTED_CARD_WRITE_ACTION');
    }
    const grouped = new Map<number, DispatchInput[]>();
    for (const item of items) {
      const campaignId = safeWbNumber(item.wbCampaignId);
      const existing = grouped.get(campaignId) ?? [];
      existing.push(item);
      grouped.set(campaignId, existing);
    }
    const payload: CardWritePayload = {
      bids: [...grouped.entries()].map(([advertId, group]) => ({
        advert_id: advertId,
        nm_bids: group.map((item) => ({
          bid_kopecks: safePositiveBid(item.bidMinor),
          nm_id: safeWbNumber(item.nmId),
          placement: placementWire(item.placement),
        })),
      })),
    };
    const response = await write(payload);
    const echoed = new Set(
      response.bids.flatMap((group) =>
        group.nm_bids.map(
          (item) =>
            `${String(group.advert_id)}:${String(item.nm_id)}:${item.placement}:${String(
              item.bid_kopecks,
            )}`,
        ),
      ),
    );
    return Object.freeze({
      httpStatus: 200,
      items: Object.freeze(
        items.map((item, requestIndex) => {
          const key = `${String(safeWbNumber(item.wbCampaignId))}:${String(
            safeWbNumber(item.nmId),
          )}:${placementWire(item.placement)}:${String(safePositiveBid(item.bidMinor))}`;
          return Object.freeze({
            accepted: echoed.has(key),
            ...(echoed.has(key) ? {} : { errorCode: 'WB_ITEM_NOT_ECHOED' }),
            httpStatus: 200,
            requestIndex,
            responseFragment: { echoed: echoed.has(key) },
          });
        }),
      ),
      wbRequestId: correlationId,
    });
  }
}

type CardWritePayload = Parameters<WbApiClient['writeCardBids']>[0];

function assertCard(targetKind: 'CARD' | 'CLUSTER'): void {
  if (targetKind !== 'CARD') throw new Error('CLUSTER_GATEWAY_REQUIRED');
}

function safeWbNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('WB_ID_OUT_OF_SAFE_RANGE');
  return result;
}

function safePositiveBid(value: bigint | null): number {
  if (value === null) throw new Error('CARD_BID_REQUIRED');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('CARD_BID_OUT_OF_SAFE_RANGE');
  return result;
}

function placementWire(
  value: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH',
): 'combined' | 'recommendations' | 'search' {
  return value.toLowerCase() as 'combined' | 'recommendations' | 'search';
}
