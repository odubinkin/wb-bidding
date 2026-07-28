import type { ContractStatus, EndpointKey } from '@wb-bidder/contracts';

/**
 * HTTP methods used by the supported WB Promotion surface.
 */
export type WbHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

/**
 * Resilience group isolated by a circuit breaker.
 */
export type EndpointGroup = 'auth' | 'campaigns' | 'finance' | 'statistics' | 'writes';

/**
 * Immutable transport metadata for one supported endpoint.
 */
export interface WbEndpointDefinition {
  /** Whether this operation can mutate WB state. */
  readonly isWrite: boolean;
  /** Maximum request items; undefined means that the endpoint is not batched. */
  readonly maxBatchItems?: number;
  /** HTTP method required by the current profile. */
  readonly method: WbHttpMethod;
  /** Exact current path. */
  readonly path: string;
  /** Circuit-breaker isolation group. */
  readonly group: EndpointGroup;
  /** Contract status controlling fail-closed access. */
  readonly status: ContractStatus;
}

/**
 * Current WB endpoint registry. Deprecated pairs are deliberately absent.
 */
export const WB_ENDPOINTS: Readonly<Record<EndpointKey, WbEndpointDefinition>> = Object.freeze({
  bidRecommendations: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    method: 'GET',
    path: '/api/advert/v0/bids/recommendations',
    status: 'VERIFIED',
  }),
  campaignBudget: Object.freeze({
    group: 'finance',
    isWrite: false,
    method: 'GET',
    path: '/adv/v1/budget',
    status: 'UNVERIFIED',
  }),
  campaignCount: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    method: 'GET',
    path: '/adv/v1/promotion/count',
    status: 'VERIFIED',
  }),
  campaignDetails: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    maxBatchItems: 50,
    method: 'GET',
    path: '/api/advert/v2/adverts',
    status: 'VERIFIED',
  }),
  campaignStatistics: Object.freeze({
    group: 'statistics',
    isWrite: false,
    maxBatchItems: 50,
    method: 'GET',
    path: '/adv/v3/fullstats',
    status: 'UNVERIFIED',
  }),
  cardMinimumBids: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    maxBatchItems: 100,
    method: 'POST',
    path: '/api/advert/v1/bids/min',
    status: 'VERIFIED',
  }),
  cardWriteBids: Object.freeze({
    group: 'writes',
    isWrite: true,
    maxBatchItems: 50,
    method: 'PATCH',
    path: '/api/advert/v1/bids',
    status: 'VERIFIED',
  }),
  clusterCurrentBids: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    maxBatchItems: 100,
    method: 'POST',
    path: '/adv/v0/normquery/get-bids',
    status: 'UNVERIFIED',
  }),
  clusterDeleteBids: Object.freeze({
    group: 'writes',
    isWrite: true,
    maxBatchItems: 100,
    method: 'DELETE',
    path: '/adv/v0/normquery/bids',
    status: 'UNVERIFIED',
  }),
  clusterList: Object.freeze({
    group: 'campaigns',
    isWrite: false,
    maxBatchItems: 100,
    method: 'POST',
    path: '/adv/v0/normquery/list',
    status: 'VERIFIED',
  }),
  clusterStatistics: Object.freeze({
    group: 'statistics',
    isWrite: false,
    maxBatchItems: 100,
    method: 'POST',
    path: '/adv/v1/normquery/stats',
    status: 'VERIFIED',
  }),
  clusterWriteBids: Object.freeze({
    group: 'writes',
    isWrite: true,
    maxBatchItems: 100,
    method: 'POST',
    path: '/adv/v0/normquery/bids',
    status: 'UNVERIFIED',
  }),
  ping: Object.freeze({
    group: 'auth',
    isWrite: false,
    method: 'GET',
    path: '/ping',
    status: 'VERIFIED',
  }),
  sellerInfo: Object.freeze({
    group: 'auth',
    isWrite: false,
    method: 'GET',
    path: '/api/v1/seller-info',
    status: 'VERIFIED',
  }),
});

/**
 * Deprecated method/path pairs rejected by source and contract checks.
 */
export const DEPRECATED_WB_ENDPOINTS: readonly Readonly<{
  method: WbHttpMethod;
  path: string;
}>[] = Object.freeze([
  Object.freeze({ method: 'POST', path: '/adv/v1/promotion/adverts' }),
  Object.freeze({ method: 'GET', path: '/adv/v0/auction/adverts' }),
  Object.freeze({ method: 'PATCH', path: '/adv/v0/bids' }),
  Object.freeze({ method: 'PATCH', path: '/adv/v0/auction/bids' }),
  Object.freeze({ method: 'POST', path: '/adv/v2/fullstats' }),
]);

/**
 * Returns immutable metadata for an endpoint key.
 *
 * @param endpointKey - Current profile endpoint key.
 * @returns Exact transport metadata.
 */
export function endpointDefinition(endpointKey: EndpointKey): WbEndpointDefinition {
  return WB_ENDPOINTS[endpointKey];
}
