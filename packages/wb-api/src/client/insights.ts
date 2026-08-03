import {
  bidRecommendationsResponseSchema,
  campaignBudgetResponseSchema,
  campaignStatisticsResponseSchema,
  clusterStatisticsRequestSchema,
  clusterStatisticsResponseSchema,
  pingResponseSchema,
  sellerInfoResponseSchema,
  type BidRecommendationsResponse,
  type ClusterStatisticsRequest,
} from '../schemas.js';
import { WbApiError } from '../resilience.js';
import type { z } from 'zod';
import { WbClusterClientBase } from './clusters.js';

/** Cohesive WB API client capability layer. */
export class WbInsightsClientBase extends WbClusterClientBase {
  /**
   * Gets campaign statistics for up to 50 IDs and at most 31 calendar days.
   *
   * Data remains observational while its money/aggregation contract is UNVERIFIED.
   *
   * @param ids - Campaign IDs, 1..50.
   * @param begin - Inclusive WB date.
   * @param end - Inclusive WB date.
   * @returns Runtime-validated raw statistics.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignStatistics(
    ids: readonly number[],
    begin: string,
    end: string,
  ): Promise<z.infer<typeof campaignStatisticsResponseSchema>> {
    if (ids.length < 1 || ids.length > 50) {
      throw new WbApiError('PAYLOAD', 'Fullstats requires 1..50 campaign IDs', null, false);
    }
    const query = new URLSearchParams({
      begin,
      end,
      ids: ids.join(','),
    });
    return this.read(
      'campaignStatistics',
      campaignStatisticsResponseSchema,
      query,
      undefined,
      true,
    );
  }

  /**
   * Gets daily cluster statistics with CPC impression fields optional.
   *
   * @param request - Date range and up to 100 pairs.
   * @returns Validated daily source rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getClusterStatistics(
    request: ClusterStatisticsRequest,
  ): Promise<z.infer<typeof clusterStatisticsResponseSchema>> {
    return this.read(
      'clusterStatistics',
      clusterStatisticsResponseSchema,
      undefined,
      clusterStatisticsRequestSchema.parse(request),
    );
  }

  /**
   * Gets CPM recommendation hints in kopecks.
   *
   * @param advertId - Campaign ID.
   * @param nmId - WB article ID.
   * @returns Validated hint response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getBidRecommendations(
    advertId: number,
    nmId: number,
  ): Promise<BidRecommendationsResponse> {
    return this.read(
      'bidRecommendations',
      bidRecommendationsResponseSchema,
      new URLSearchParams({ advertId: String(advertId), nmId: String(nmId) }),
    );
  }

  /**
   * Gets raw-normalized diagnostic campaign budget fields.
   *
   * No caller may interpret these fields as remaining balance while the profile is UNVERIFIED.
   *
   * @param advertId - Campaign ID.
   * @returns Validated diagnostic fields.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignBudget(
    advertId: number,
  ): Promise<z.infer<typeof campaignBudgetResponseSchema>> {
    return this.read(
      'campaignBudget',
      campaignBudgetResponseSchema,
      new URLSearchParams({ id: String(advertId) }),
      undefined,
      true,
    );
  }

  /**
   * Gets seller identity from the fixed common-api origin.
   *
   * @returns Validated seller identity.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  public async getSellerInfo(): Promise<z.infer<typeof sellerInfoResponseSchema>> {
    return this.read('sellerInfo', sellerInfoResponseSchema);
  }

  /**
   * Performs a quota-aware integration check.
   *
   * @returns Validated ping response.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  public async ping(): Promise<z.infer<typeof pingResponseSchema>> {
    return this.read('ping', pingResponseSchema);
  }
}
