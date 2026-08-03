import type { WbApiClient } from '@wb-bidder/wb-api';

import type {
  ClaimedQueueItem,
  DispatchReservation,
  DispatchResult,
  LiveBidState,
  WriteGateway,
} from './types.js';

/**
 * Defines the supported values for dispatch input.
 */
type DispatchInput = Parameters<WriteGateway['dispatch']>[1][number];

/**
 * Card-bid gateway that preserves WB identifiers only at the transport boundary.
 */
export class WbCardBidGateway implements WriteGateway {
  /**
   * Creates a wb card bid gateway instance with its required dependencies.
   *
   * @param client Database or API client used by the operation.
   */
  public constructor(private readonly client: WbApiClient) {}

  /**
   * Retrieves live state.
   *
   * @param item Queue or domain item processed by the operation.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Executes dispatch with the required safety and persistence checks.
   *
   * @param endpointKey Endpoint profile key selecting transport behavior.
   * @param items Items processed as one bounded operation.
   * @param correlationId Correlation identifier propagated to audit and logs.
   * @returns Outcome produced after the required safety checks complete.
   */
  public async dispatch(
    endpointKey: string,
    items: readonly DispatchInput[],
    correlationId: string,
  ): Promise<DispatchResult> {
    if (endpointKey !== 'cardBidsWrite') throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
    return this.dispatchWith(items, correlationId, (payload) => this.client.writeCardBids(payload));
  }

  /**
   * Performs the reserve dispatch operation while preserving domain invariants.
   *
   * @param endpointKey Endpoint profile key selecting transport behavior.
   * @returns Result produced by the reserve dispatch operation.
   */
  public async reserveDispatch(endpointKey: string): Promise<DispatchReservation> {
    if (endpointKey !== 'cardBidsWrite') throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
    const reserved = await this.client.reserveCardBidWrite();
    return Object.freeze({
      /**
       * Executes dispatch with the required safety and persistence checks.
       *
       * @param items Items processed as one bounded operation.
       * @param correlationId Correlation identifier propagated to audit and logs.
       * @returns Outcome produced after the required safety checks complete.
       */
      dispatch: (items: readonly DispatchInput[], correlationId: string) =>
        this.dispatchWith(items, correlationId, (payload) => reserved.dispatch(payload)),
      /**
       * Releases or removes the selected state.
       */
      release: () => {
        reserved.release();
      },
    });
  }

  /**
   * Executes dispatch with with the required safety and persistence checks.
   *
   * @param items Items processed as one bounded operation.
   * @param correlationId Correlation identifier propagated to audit and logs.
   * @param write Transport callback that performs the bounded write.
   * @returns Outcome produced after the required safety checks complete.
   */
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

/**
 * Verified-mock cluster gateway preserving the exact normQuery wire spelling.
 */
export class WbClusterBidGateway implements WriteGateway {
  /**
   * Creates a wb cluster bid gateway instance with its required dependencies.
   *
   * @param client Database or API client used by the operation.
   */
  public constructor(private readonly client: WbApiClient) {}

  /**
   * Retrieves live state.
   *
   * @param item Queue or domain item processed by the operation.
   * @returns Requested value or bounded result set.
   */
  public async readLiveState(item: ClaimedQueueItem): Promise<LiveBidState> {
    if (item.targetKind !== 'CLUSTER' || item.normQueryWire === null) {
      throw new Error('CLUSTER_TARGET_REQUIRED');
    }
    const campaignId = safeWbNumber(item.wbCampaignId);
    const nmId = safeWbNumber(item.nmId);
    const response = await this.client.getClusterBids({
      items: [{ advert_id: campaignId, nm_id: nmId }],
    });
    const match = response.bids.find(
      (bid) =>
        bid.advert_id === campaignId && bid.nm_id === nmId && bid.norm_query === item.normQueryWire,
    );
    return Object.freeze({
      bidMinor: match === undefined ? null : BigInt(match.bid),
      explicit: match !== undefined,
      observedAt: new Date(),
      sourceMarker:
        match === undefined
          ? `cluster-current-bids:${String(campaignId)}:${String(nmId)}:${item.normQueryWire}:ABSENT`
          : `cluster-current-bids:${String(campaignId)}:${String(nmId)}:${item.normQueryWire}:${String(match.bid)}`,
    });
  }

  /**
   * Executes dispatch with the required safety and persistence checks.
   *
   * @param endpointKey Endpoint profile key selecting transport behavior.
   * @param items Items processed as one bounded operation.
   * @param correlationId Correlation identifier propagated to audit and logs.
   * @returns Outcome produced after the required safety checks complete.
   */
  public async dispatch(
    endpointKey: string,
    items: readonly DispatchInput[],
    correlationId: string,
  ): Promise<DispatchResult> {
    assertClusterEndpoint(endpointKey);
    return this.dispatchWith(endpointKey, items, correlationId, (payload) =>
      endpointKey === 'clusterDeleteBids'
        ? this.client.deleteClusterBids(payload)
        : this.client.writeClusterBids(payload),
    );
  }

  /**
   * Performs the reserve dispatch operation while preserving domain invariants.
   *
   * @param endpointKey Endpoint profile key selecting transport behavior.
   * @returns Result produced by the reserve dispatch operation.
   */
  public async reserveDispatch(endpointKey: string): Promise<DispatchReservation> {
    assertClusterEndpoint(endpointKey);
    const reserved = await this.client.reserveClusterBidWrite(endpointKey);
    return Object.freeze({
      /**
       * Executes dispatch with the required safety and persistence checks.
       *
       * @param items Items processed as one bounded operation.
       * @param correlationId Correlation identifier propagated to audit and logs.
       * @returns Outcome produced after the required safety checks complete.
       */
      dispatch: (items: readonly DispatchInput[], correlationId: string) =>
        this.dispatchWith(endpointKey, items, correlationId, (payload) =>
          reserved.dispatch(payload),
        ),
      /**
       * Releases or removes the selected state.
       */
      release: () => {
        reserved.release();
      },
    });
  }

  /**
   * Executes dispatch with with the required safety and persistence checks.
   *
   * @param endpointKey Endpoint profile key selecting transport behavior.
   * @param items Items processed as one bounded operation.
   * @param correlationId Correlation identifier propagated to audit and logs.
   * @param write Transport callback that performs the bounded write.
   * @returns Outcome produced after the required safety checks complete.
   */
  private async dispatchWith(
    endpointKey: 'clusterDeleteBids' | 'clusterWriteBids',
    items: readonly DispatchInput[],
    correlationId: string,
    write: (
      payload: ClusterWritePayload,
    ) => ReturnType<WbApiClient['writeClusterBids'] | WbApiClient['deleteClusterBids']>,
  ): Promise<DispatchResult> {
    const expectedAction = endpointKey === 'clusterDeleteBids' ? 'DELETE' : 'SET';
    if (
      items.some(
        (item) =>
          item.targetKind !== 'CLUSTER' ||
          item.action !== expectedAction ||
          item.normQueryWire === null,
      )
    ) {
      throw new Error('UNSUPPORTED_CLUSTER_WRITE_ACTION');
    }
    const payload: ClusterWritePayload = {
      bids: items.map((item) => ({
        advert_id: safeWbNumber(item.wbCampaignId),
        bid: safePositiveBid(item.wireBidRaw),
        nm_id: safeWbNumber(item.nmId),
        norm_query: requiredNormQuery(item.normQueryWire),
      })),
    };
    const response = await write(payload);
    const echoed = new Set(
      response.bids.map(
        (item) =>
          `${String(item.advert_id)}:${String(item.nm_id)}:${item.norm_query}:${String(item.bid)}`,
      ),
    );
    return Object.freeze({
      httpStatus: 200,
      items: Object.freeze(
        payload.bids.map((item, requestIndex) => {
          const key = `${String(item.advert_id)}:${String(item.nm_id)}:${item.norm_query}:${String(item.bid)}`;
          const accepted = echoed.has(key);
          return Object.freeze({
            accepted,
            ...(accepted ? {} : { errorCode: 'WB_ITEM_NOT_ECHOED' }),
            httpStatus: 200,
            requestIndex,
            responseFragment: { echoed: accepted },
          });
        }),
      ),
      wbRequestId: correlationId,
    });
  }
}

/**
 * Defines the supported values for card write payload.
 */
type CardWritePayload = Parameters<WbApiClient['writeCardBids']>[0];
/**
 * Defines the supported values for cluster write payload.
 */
type ClusterWritePayload = Parameters<WbApiClient['writeClusterBids']>[0];

/**
 * Validates cluster endpoint.
 *
 * @param endpointKey Endpoint profile key selecting transport behavior.
 */
function assertClusterEndpoint(
  endpointKey: string,
): asserts endpointKey is 'clusterDeleteBids' | 'clusterWriteBids' {
  if (endpointKey !== 'clusterDeleteBids' && endpointKey !== 'clusterWriteBids') {
    throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
  }
}

/**
 * Validates d norm query.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the required norm query operation.
 */
function requiredNormQuery(value: string | null): string {
  if (value === null || value.length === 0) throw new Error('CLUSTER_NORM_QUERY_REQUIRED');
  return value;
}

/**
 * Validates card.
 *
 * @param targetKind Target kind selecting card or cluster behavior.
 */
function assertCard(targetKind: 'CARD' | 'CLUSTER'): void {
  if (targetKind !== 'CARD') throw new Error('CLUSTER_GATEWAY_REQUIRED');
}

/**
 * Performs the safe wb number operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the safe wb number operation.
 */
function safeWbNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('WB_ID_OUT_OF_SAFE_RANGE');
  return result;
}

/**
 * Performs the safe positive bid operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the safe positive bid operation.
 */
function safePositiveBid(value: bigint | null): number {
  if (value === null) throw new Error('CARD_BID_REQUIRED');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('CARD_BID_OUT_OF_SAFE_RANGE');
  return result;
}

/**
 * Performs the placement wire operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the placement wire operation.
 */
function placementWire(
  value: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH',
): 'combined' | 'recommendations' | 'search' {
  return value.toLowerCase() as 'combined' | 'recommendations' | 'search';
}
