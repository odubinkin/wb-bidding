import {
  campaignCountResponseSchema,
  campaignDetailsResponseSchema,
  cardWriteBidsSchema,
  minimumBidsRequestSchema,
  minimumBidsResponseSchema,
  type CampaignCountResponse,
  type CampaignDetailsResponse,
  type CardWriteBids,
  type MinimumBidsRequest,
  type MinimumBidsResponse,
} from '../schemas.js';
import { WbApiError } from '../resilience.js';
import type { ReservedCardBidWrite } from './types.js';
import { WbApiClientCore } from './core.js';

/** Cohesive WB API client capability layer. */
export class WbCampaignClientBase extends WbApiClientCore {
  /**
   * Gets campaign groups and identifiers.
   *
   * @returns Validated campaign-list response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignCount(): Promise<CampaignCountResponse> {
    return this.read('campaignCount', campaignCountResponseSchema);
  }

  /**
   * Gets up to 50 campaign details.
   *
   * @param ids - Optional campaign IDs, maximum 50.
   * @param statuses - Optional supported WB statuses.
   * @param paymentType - Optional payment filter.
   * @returns Validated campaign details.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getCampaignDetails(
    ids: readonly number[] = [],
    statuses: readonly number[] = [],
    paymentType?: 'cpc' | 'cpm',
  ): Promise<CampaignDetailsResponse> {
    if (ids.length > 50) {
      throw new WbApiError('PAYLOAD', 'Campaign details accepts at most 50 IDs', null, false);
    }
    const query = new URLSearchParams();
    if (ids.length > 0) {
      query.set('ids', ids.join(','));
    }
    if (statuses.length > 0) {
      query.set('statuses', statuses.join(','));
    }
    if (paymentType !== undefined) {
      query.set('payment_type', paymentType);
    }
    return this.read('campaignDetails', campaignDetailsResponseSchema, query);
  }

  /**
   * Gets minimum card bids for one campaign and up to 100 articles.
   *
   * @param request - Exact current wire request; recommendation is singular here.
   * @returns Validated kopeck values.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getMinimumBids(request: MinimumBidsRequest): Promise<MinimumBidsResponse> {
    return this.read(
      'cardMinimumBids',
      minimumBidsResponseSchema,
      undefined,
      minimumBidsRequestSchema.parse(request),
    );
  }

  /**
   * Writes card bids in kopecks, up to 50 campaign groups.
   *
   * @param request - Exact card-bid payload.
   * @returns Validated WB echo response.
   * @throws {WbApiError} When the write gate is closed or outcome is unknown.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async writeCardBids(request: CardWriteBids): Promise<CardWriteBids> {
    return this.write('cardWriteBids', cardWriteBidsSchema, cardWriteBidsSchema.parse(request));
  }

  /**
   * Waits for write quota and an in-flight slot before the caller performs its final live read
   * freshness check and durable DISPATCHING commit.
   *
   * @returns Single-use admission whose dispatch does not wait on the limiter again.
   */
  public async reserveCardBidWrite(): Promise<ReservedCardBidWrite> {
    this.assertOperationAllowed('cardWriteBids', true, false);
    const limiterWaitMs = await this.configuration.rateLimiter.acquire('cardWriteBids');
    const releaseSemaphore = await this.semaphore.acquire();
    let active = true;
    /** Releases an unused reservation. */
    const release = (): void => {
      if (!active) return;
      active = false;
      releaseSemaphore();
    };
    return Object.freeze({
      /**
       * Dispatches exactly once using the admitted slot.
       *
       * @param request - Validated card-bid request.
       * @returns Validated WB echo.
       */
      dispatch: async (request: CardWriteBids): Promise<CardWriteBids> => {
        if (!active) {
          throw new WbApiError('CONTRACT', 'WB write admission was already consumed', null, false);
        }
        active = false;
        try {
          return await this.request(
            'cardWriteBids',
            cardWriteBidsSchema,
            undefined,
            cardWriteBidsSchema.parse(request),
            true,
            false,
            limiterWaitMs,
          );
        } finally {
          releaseSemaphore();
        }
      },
      release,
    });
  }
}
