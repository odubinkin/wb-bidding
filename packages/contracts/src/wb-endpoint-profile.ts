/**
 * Evidence state for a versioned wire contract.
 */
export type ContractStatus = 'DEPRECATED' | 'UNVERIFIED' | 'VERIFIED';

/**
 * WB endpoint keys supported by the first bidder release.
 */
export type EndpointKey =
  | 'campaignCount'
  | 'campaignDetails'
  | 'cardMinimumBids'
  | 'cardWriteBids'
  | 'clusterCurrentBids'
  | 'clusterList'
  | 'clusterWriteBids'
  | 'clusterDeleteBids'
  | 'campaignStatistics'
  | 'clusterStatistics'
  | 'bidRecommendations'
  | 'campaignBudget'
  | 'sellerInfo'
  | 'ping';

/**
 * Token-bucket parameters for one endpoint and token/environment profile.
 */
export interface RateLimitProfile {
  /** Maximum burst accepted by the local limiter. */
  readonly burst: number;
  /** Minimum interval represented by the quota. */
  readonly intervalMs: number;
  /** Requests permitted during intervalMs. */
  readonly requests: number;
}

/**
 * Reproducible evidence status for a semantic wire contract.
 */
export interface WireContractProfile {
  /** Short explanation for operators and release checks. */
  readonly note: string;
  /** Evidence state; uncertain write semantics must remain UNVERIFIED. */
  readonly status: ContractStatus;
  /** Version identifying fixtures and runtime schemas. */
  readonly version: string;
}

/**
 * Immutable endpoint profile embedded into the production artifact.
 */
export interface EndpointProfile {
  /** ISO timestamp of the official-documentation check. */
  readonly checkedAt: string;
  /** Endpoint-level request limits for the Personal production token profile. */
  readonly personalProductionLimits: Readonly<Record<EndpointKey, RateLimitProfile>>;
  /** Immutable profile identifier selected by configuration. */
  readonly profileId: string;
  /** Official sources used for the read-only documentation check. */
  readonly sources: readonly string[];
  /** Semantic wire contracts that gate normalization and writes. */
  readonly wireContracts: {
    readonly budgetSemantics: WireContractProfile;
    readonly cardBidMinorUnits: WireContractProfile;
    readonly clusterBid: WireContractProfile;
    readonly fullstatsMoneyAndAggregation: WireContractProfile;
    readonly sameDaySpend: WireContractProfile;
  };
}

const PER_SECOND_5: RateLimitProfile = Object.freeze({
  burst: 5,
  intervalMs: 1_000,
  requests: 5,
});

const PER_SECOND_5_BURST_10: RateLimitProfile = Object.freeze({
  burst: 10,
  intervalMs: 1_000,
  requests: 5,
});

/**
 * Current checked-in profile. Cluster, budget, and same-day semantics intentionally fail closed.
 */
export const CURRENT_ENDPOINT_PROFILE: EndpointProfile = Object.freeze({
  checkedAt: '2026-07-28T00:00:00.000Z',
  personalProductionLimits: Object.freeze({
    bidRecommendations: Object.freeze({ burst: 5, intervalMs: 60_000, requests: 5 }),
    campaignBudget: Object.freeze({ burst: 4, intervalMs: 1_000, requests: 4 }),
    campaignCount: PER_SECOND_5,
    campaignDetails: PER_SECOND_5,
    campaignStatistics: Object.freeze({ burst: 1, intervalMs: 60_000, requests: 3 }),
    cardMinimumBids: Object.freeze({ burst: 5, intervalMs: 60_000, requests: 20 }),
    cardWriteBids: PER_SECOND_5,
    clusterCurrentBids: PER_SECOND_5_BURST_10,
    clusterDeleteBids: PER_SECOND_5_BURST_10,
    clusterList: PER_SECOND_5_BURST_10,
    clusterStatistics: Object.freeze({ burst: 20, intervalMs: 60_000, requests: 10 }),
    clusterWriteBids: Object.freeze({ burst: 4, intervalMs: 1_000, requests: 2 }),
    ping: Object.freeze({ burst: 3, intervalMs: 30_000, requests: 3 }),
    sellerInfo: Object.freeze({ burst: 1, intervalMs: 1_000, requests: 1 }),
  }),
  profileId: 'wb-promotion-2026-07-28-v1',
  sources: Object.freeze([
    'https://dev.wildberries.ru/ru/openapi/promotion',
    'https://dev.wildberries.ru/ru/openapi/api-information',
    'https://dev.wildberries.ru/knowledge-base/articles/019d49a1-28ca-7735-bf2f-98210695abc7/limity-zaprosov-wb-api',
    'https://dev.wildberries.ru/knowledge-base/articles/019d49a0-f60a-7b42-bcbb-15b1cfee9023/sposoby-podkliucheniia-k-wb-api-token-i-oauth-2-0',
    'https://dev.wildberries.ru/sandbox',
    'https://dev.wildberries.ru/release-notes',
  ]),
  wireContracts: Object.freeze({
    budgetSemantics: Object.freeze({
      note: 'cash/netting/total are stored diagnostically and are not treated as remaining balance.',
      status: 'UNVERIFIED',
      version: 'budget-unverified-v1',
    }),
    cardBidMinorUnits: Object.freeze({
      note: 'Current card-bid fields explicitly use kopecks and map one-to-one to minor units.',
      status: 'VERIFIED',
      version: 'card-bid-minor-v1',
    }),
    clusterBid: Object.freeze({
      note: 'Unit, normative minimum, absence, and delete semantics need reproducible fixtures.',
      status: 'UNVERIFIED',
      version: 'cluster-bid-unverified-v1',
    }),
    fullstatsMoneyAndAggregation: Object.freeze({
      note: 'Runtime schemas exist later; exact live type, scale, date, and row-level evidence is pending.',
      status: 'UNVERIFIED',
      version: 'fullstats-unverified-v1',
    }),
    sameDaySpend: Object.freeze({
      note: 'Current-day coverage and reporting-lag semantics are not proven by documentation alone.',
      status: 'UNVERIFIED',
      version: 'same-day-spend-unverified-v1',
    }),
  }),
});
