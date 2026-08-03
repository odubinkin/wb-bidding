import { HttpException } from '@nestjs/common';
import { MOCK_CLUSTER_BID_CONTRACT } from '@wb-bidder/contracts';
import {
  cardWriteBidsSchema,
  clusterPairsRequestSchema,
  clusterStatisticsRequestSchema,
  clusterWriteRequestSchema,
  minimumBidsRequestSchema,
  type CardWriteBids,
  type ClusterPairsRequest,
  type ClusterStatisticsRequest,
  type ClusterWriteRequest,
  type MinimumBidsRequest,
} from '@wb-bidder/wb-api';
import { clusterKey } from './mock-state.helpers.js';
import { MockStateRuntimeBase } from './mock-state-runtime.service.js';

/** Cohesive mock-state capability layer. */
export class MockStateResponsesBase extends MockStateRuntimeBase {
  /**
   * Returns campaign-count wire response.
   *
   * @returns WB-compatible grouped list.
   */
  public campaignCount(): unknown {
    const groups = new Map<number, number[]>();
    for (const campaign of this.campaigns.values()) {
      const ids = groups.get(campaign.status) ?? [];
      ids.push(campaign.id);
      groups.set(campaign.status, ids);
    }
    return {
      adverts: [...groups.entries()].map(([status, ids]) => ({
        advert_list: ids.map((advertId) => ({
          advertId,
          changeTime: this.nowIso(),
        })),
        count: ids.length,
        status,
        type: 9,
      })),
      all: this.campaigns.size,
    };
  }

  /**
   * Returns campaign details filtered by query.
   *
   * @param ids - Optional campaign ID filter.
   * @param statuses - Optional status filter.
   * @param paymentType - Optional payment filter.
   * @returns WB-compatible details response.
   */
  public campaignDetails(
    ids: readonly number[],
    statuses: readonly number[],
    paymentType?: 'cpc' | 'cpm',
  ): unknown {
    const adverts = [...this.campaigns.values()]
      .filter((campaign) => ids.length === 0 || ids.includes(campaign.id))
      .filter((campaign) => statuses.length === 0 || statuses.includes(campaign.status))
      .filter((campaign) => paymentType === undefined || campaign.paymentType === paymentType)
      .map((campaign) => ({
        bid_type: campaign.bidType,
        id: campaign.id,
        nm_settings: campaign.nms.map((nm) => ({
          bids_kopecks: {
            recommendations: nm.bidRecommendations,
            search: nm.bidSearch,
          },
          nm_id: nm.nmId,
          subject: { id: 52, name: 'synthetic subject' },
        })),
        settings: {
          name: `Synthetic ${String(campaign.id)}`,
          payment_type: campaign.paymentType,
          placements: campaign.placements,
        },
        status: campaign.status,
        timestamps: {
          created: new Date(this.initialTimeMs).toISOString(),
          deleted: '2100-01-01T00:00:00.000Z',
          started: new Date(this.initialTimeMs).toISOString(),
          updated: this.nowIso(),
        },
      }));
    return { adverts };
  }

  /**
   * Returns deterministic minimum card bids.
   *
   * @param input - Exact validated request.
   * @returns WB-compatible kopeck response.
   */
  public minimumBids(input: MinimumBidsRequest): unknown {
    return {
      bids: input.nm_ids.map((nmId) => ({
        bids: input.placement_types.map((type) => ({
          type,
          value: input.payment_type === 'cpc' ? 500 : type === 'combined' ? 155 : 250,
        })),
        nm_id: nmId,
      })),
    };
  }

  /**
   * Queues a card write for delayed read visibility.
   *
   * @param input - Exact validated write body.
   * @returns Echo response.
   */
  public writeCardBids(input: CardWriteBids): CardWriteBids {
    const scenarioDelay = this.activeSeed === 'delayed-visibility' ? 90_000 : 30_000;
    const configured = this.faults.find(
      (fault) => fault.endpointKey === 'cardWriteBids' && fault.visibilityDelayMs !== undefined,
    )?.visibilityDelayMs;
    if (this.activeSeed === 'partial-failure' && input.bids.length > 1) {
      this.pendingCardWrites.push({
        payload: { bids: structuredClone(input.bids.slice(0, 1)) },
        visibleAtMs: this.virtualTimeMs + (configured ?? scenarioDelay),
      });
      throw new HttpException(
        {
          accepted_indices: [0],
          detail: 'synthetic partial dispatch followed by failure',
          status: 503,
        },
        503,
      );
    }
    this.pendingCardWrites.push({
      payload: structuredClone(input),
      visibleAtMs: this.virtualTimeMs + (configured ?? scenarioDelay),
    });
    if (this.activeSeed === 'ambiguous-write') {
      throw new HttpException(
        {
          detail: 'synthetic response lost after full dispatch',
          outcome: 'UNKNOWN',
          status: 503,
        },
        503,
      );
    }
    return structuredClone(input);
  }

  /**
   * Gets cluster bids for requested pairs.
   *
   * @param input - Validated pair list.
   * @returns Raw bid-unit response.
   */
  public getClusterBids(input: ClusterPairsRequest): unknown {
    return {
      bids: input.items.flatMap((item) =>
        ['synthetic cluster one', 'synthetic cluster two'].flatMap((normQuery) => {
          const bid = this.clusterBids.get(clusterKey(item.advert_id, item.nm_id, normQuery));
          return bid === undefined
            ? []
            : [
                {
                  advert_id: item.advert_id,
                  bid,
                  nm_id: item.nm_id,
                  norm_query: normQuery,
                },
              ];
        }),
      ),
    };
  }

  /**
   * Lists deterministic discovered clusters.
   *
   * @param input - Validated pair list.
   * @returns WB-compatible discovery response.
   */
  public listClusters(input: ClusterPairsRequest): unknown {
    return {
      items: input.items.map((item) => ({
        ...item,
        norm_queries: ['synthetic cluster one', 'synthetic cluster two'],
      })),
    };
  }

  /**
   * Applies raw cluster bids in mock only.
   *
   * @param input - Validated raw cluster body.
   * @returns Echo response.
   */
  public writeClusterBids(input: ClusterWriteRequest): unknown {
    for (const bid of input.bids) {
      if (BigInt(bid.bid) < MOCK_CLUSTER_BID_CONTRACT.minimumBidMinor) {
        throw new HttpException(
          { detail: 'cluster bid is below verified mock minimum', status: 400 },
          400,
        );
      }
      this.clusterBids.set(clusterKey(bid.advert_id, bid.nm_id, bid.norm_query), bid.bid);
    }
    return structuredClone(input);
  }

  /**
   * Deletes raw cluster overrides in mock only.
   *
   * @param input - Validated explicit overrides.
   * @returns Echo of deleted rows.
   */
  public deleteClusterBids(input: ClusterWriteRequest): unknown {
    for (const bid of input.bids) {
      this.clusterBids.delete(clusterKey(bid.advert_id, bid.nm_id, bid.norm_query));
    }
    return structuredClone(input);
  }

  /**
   * Returns deterministic daily campaign statistics.
   *
   * @param ids - Requested campaigns.
   * @returns WB-compatible fullstats rows.
   */
  public campaignStatistics(ids: readonly number[]): unknown {
    return ids.map((advertId) => {
      const currentStatisticalDate = this.nowIso().slice(0, 10);
      const days = [...new Set([...this.dailyDates, currentStatisticalDate])]
        .sort()
        .map((date, index) => this.statisticDay(date, 20001, index));
      const sum = days.reduce((total, day) => total + day.sum, 0);
      const views = days.reduce((total, day) => total + day.views, 0);
      const clicks = days.reduce((total, day) => total + day.clicks, 0);
      const orders = days.reduce((total, day) => total + day.orders, 0);
      const shks = days.reduce((total, day) => total + day.shks, 0);
      const sumPrice = days.reduce((total, day) => total + day.sum_price, 0);
      return {
        advertId,
        atbs: orders,
        canceled: 0,
        clicks,
        cpc: clicks === 0 ? 0 : Number((sum / clicks).toFixed(2)),
        cr: clicks === 0 ? 0 : Number(((orders / clicks) * 100).toFixed(2)),
        ctr: views === 0 ? 0 : Number(((clicks / views) * 100).toFixed(2)),
        days,
        orders,
        shks,
        sum,
        sum_price: sumPrice,
        views,
      };
    });
  }

  /**
   * Returns deterministic daily cluster statistics.
   *
   * @param input - Validated range and pairs.
   * @returns WB-compatible daily rows.
   */
  public clusterStatistics(input: ClusterStatisticsRequest): unknown {
    const dates = [...this.dailyDates]
      .filter((date) => date >= input.from && date <= input.to)
      .sort();
    return {
      items: input.items.map((item) => ({
        advertId: item.advert_id,
        dailyStats: dates.map((date, index) => ({
          date,
          stat: {
            atbs: index + 1,
            avgPos: 3.3,
            clicks: 10 + index,
            cpc: 1.25,
            cpm: 500,
            ctr: 5,
            normQuery: 'synthetic cluster one',
            orders: 1,
            shks: 1,
            spend: Number((12.5 + index).toFixed(2)),
            views: 200 + index,
          },
        })),
        nmId: item.nm_id,
      })),
    };
  }

  /**
   * Returns deterministic CPM recommendation hints.
   *
   * @param advertId - Campaign ID.
   * @param nmId - Article ID.
   * @returns WB-compatible recommendation response.
   */
  public recommendations(advertId: number, nmId: number): unknown {
    return {
      advertId,
      base: {
        competitiveBid: { bidKopecks: 1_200 },
        leadersBid: { bidKopecks: 1_800 },
        top2: { bidKopecks: 2_500 },
      },
      nmId,
      normQueries: [
        {
          normQuery: 'synthetic cluster one',
          reachMax: { bidKopecks: 2_000, bidKopecksMin: 1_500 },
          reachMedium: { bidKopecks: 1_500 },
          reachMin: { bidKopecks: 1_000 },
        },
      ],
    };
  }

  /**
   * Returns diagnostic budget fields with no remaining-balance semantics.
   *
   * @returns WB-compatible raw fields.
   */
  public budget(): unknown {
    return { cash: 0, netting: 0, total: 500 };
  }

  /**
   * Validates a controller body by endpoint schema.
   *
   * @param endpointKey - Body-bearing endpoint.
   * @param value - Unknown JSON body.
   * @returns Parsed request body.
   */
  public parseBody(
    endpointKey:
      | 'cardMinimumBids'
      | 'cardWriteBids'
      | 'clusterCurrentBids'
      | 'clusterDeleteBids'
      | 'clusterList'
      | 'clusterStatistics'
      | 'clusterWriteBids',
    value: unknown,
  ): unknown {
    const schema = {
      cardMinimumBids: minimumBidsRequestSchema,
      cardWriteBids: cardWriteBidsSchema,
      clusterCurrentBids: clusterPairsRequestSchema,
      clusterDeleteBids: clusterWriteRequestSchema,
      clusterList: clusterPairsRequestSchema,
      clusterStatistics: clusterStatisticsRequestSchema,
      clusterWriteBids: clusterWriteRequestSchema,
    }[endpointKey];
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new HttpException(
        { detail: 'request body does not match WB runtime schema', status: 400 },
        400,
      );
    }
    return parsed.data;
  }
}
