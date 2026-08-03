import {
  clusterBidsResponseSchema,
  clusterListResponseSchema,
  clusterWriteRequestSchema,
  clusterPairsRequestSchema,
  type ClusterPairsRequest,
  type ClusterWriteRequest,
} from '../schemas.js';
import { WbApiError } from '../resilience.js';
import type { z } from 'zod';
import type { ReservedClusterBidWrite } from './types.js';
import { WbCampaignClientBase } from './campaigns.js';

/** Cohesive WB API client capability layer. */
export class WbClusterClientBase extends WbCampaignClientBase {
  /**
   * Reads cluster overrides without assigning a monetary unit to bid.
   *
   * @param request - Up to 100 campaign/article pairs.
   * @returns Validated raw cluster bid response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async getClusterBids(
    request: ClusterPairsRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.read(
      'clusterCurrentBids',
      clusterBidsResponseSchema,
      undefined,
      clusterPairsRequestSchema.parse(request),
      true,
    );
  }

  /**
   * Lists visible active/inactive clusters for up to 100 pairs.
   *
   * @param request - Campaign/article pairs.
   * @returns Validated discovery response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async listClusters(
    request: ClusterPairsRequest,
  ): Promise<z.infer<typeof clusterListResponseSchema>> {
    return this.read(
      'clusterList',
      clusterListResponseSchema,
      undefined,
      clusterPairsRequestSchema.parse(request),
    );
  }

  /**
   * Fails closed until cluster unit/minimum/absence/delete semantics are VERIFIED.
   *
   * @param request - Raw cluster write request.
   * @returns Validated per-item echo if a future profile verifies the contract.
   * @throws {WbApiError} In the current profile because the cluster contract is UNVERIFIED.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async writeClusterBids(
    request: ClusterWriteRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.write(
      'clusterWriteBids',
      clusterBidsResponseSchema,
      clusterWriteRequestSchema.parse(request),
    );
  }

  /**
   * Fails closed until cluster absence/delete semantics are VERIFIED.
   *
   * @param request - Raw explicit overrides to restore to ABSENT.
   * @returns Validated deleted-item echo under a future verified profile.
   * @throws {WbApiError} In the current profile.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  public async deleteClusterBids(
    request: ClusterWriteRequest,
  ): Promise<z.infer<typeof clusterBidsResponseSchema>> {
    return this.write(
      'clusterDeleteBids',
      clusterBidsResponseSchema,
      clusterWriteRequestSchema.parse(request),
    );
  }

  /**
   * Reserves one exact cluster POST or DELETE admission for the durable write pipeline.
   *
   * @param endpointKey - Verified mock cluster mutation.
   * @returns Single-use admitted dispatch.
   */
  public async reserveClusterBidWrite(
    endpointKey: 'clusterDeleteBids' | 'clusterWriteBids',
  ): Promise<ReservedClusterBidWrite> {
    this.assertOperationAllowed(endpointKey, true, false);
    const limiterWaitMs = await this.configuration.rateLimiter.acquire(endpointKey);
    const releaseSemaphore = await this.semaphore.acquire();
    let active = true;
    /** Releases this reservation without dispatch. */
    const release = (): void => {
      if (!active) return;
      active = false;
      releaseSemaphore();
    };
    return Object.freeze({
      /**
       * Dispatches exactly once through the already-admitted cluster slot.
       *
       * @param request - Validated cluster write/delete payload.
       * @returns Validated per-item echo.
       */
      dispatch: async (
        request: ClusterWriteRequest,
      ): Promise<z.infer<typeof clusterBidsResponseSchema>> => {
        if (!active) {
          throw new WbApiError('CONTRACT', 'WB write admission was already consumed', null, false);
        }
        active = false;
        try {
          return await this.request(
            endpointKey,
            clusterBidsResponseSchema,
            undefined,
            clusterWriteRequestSchema.parse(request),
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
