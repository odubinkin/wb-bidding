import { z } from 'zod';

/** Positive WB int64 represented within JavaScript's safe integer range. */
export const wbIdSchema = z.number().int().positive();

/** Supported payment type. */
export const paymentTypeSchema = z.enum(['cpc', 'cpm']);

/** Internal placement spelling. */
export const placementSchema = z.enum(['combined', 'recommendations', 'search']);

/** Minimum-bid endpoint placement spelling, where recommendation is singular. */
export const minimumPlacementSchema = z.enum(['combined', 'recommendation', 'search']);

/** Campaign bid strategy. */
export const bidTypeSchema = z.enum(['manual', 'unified']);

/** ISO calendar date used by WB statistical endpoints. */
export const wbDateSchema = z.iso.date();

/** Non-negative finite wire decimal. */
export const wireDecimalSchema = z.union([z.number().nonnegative(), z.string().min(1)]);

/** Campaign-list response schema. */
export const campaignCountResponseSchema = z.object({
  adverts: z.array(
    z.object({
      advert_list: z.array(
        z.object({
          advertId: wbIdSchema,
          changeTime: z.iso.datetime({ offset: true }),
        }),
      ),
      count: z.number().int().nonnegative(),
      status: z.number().int(),
      type: z.number().int(),
    }),
  ),
  all: z.number().int().nonnegative(),
});

/** Campaign-details response schema. */
export const campaignDetailsResponseSchema = z.object({
  adverts: z.array(
    z
      .object({
        bid_type: bidTypeSchema,
        id: wbIdSchema,
        nm_settings: z.array(
          z.object({
            bids_kopecks: z.object({
              recommendations: z.number().int().nonnegative(),
              search: z.number().int().nonnegative(),
            }),
            nm_id: wbIdSchema,
            subject: z.object({
              id: wbIdSchema,
              name: z.string(),
            }),
          }),
        ),
        settings: z.object({
          name: z.string(),
          payment_type: paymentTypeSchema,
          placements: z.object({
            recommendations: z.boolean(),
            search: z.boolean(),
          }),
        }),
        status: z.union([
          z.literal(-1),
          z.literal(4),
          z.literal(7),
          z.literal(8),
          z.literal(9),
          z.literal(11),
        ]),
        timestamps: z.object({
          created: z.iso.datetime({ offset: true }),
          deleted: z.iso.datetime({ offset: true }),
          started: z.iso.datetime({ offset: true }).nullable(),
          updated: z.iso.datetime({ offset: true }),
        }),
      })
      .strict(),
  ),
});

/** Minimum-card-bid request schema. */
export const minimumBidsRequestSchema = z
  .object({
    advert_id: wbIdSchema,
    nm_ids: z.array(wbIdSchema).min(1).max(100),
    payment_type: paymentTypeSchema,
    placement_types: z.array(minimumPlacementSchema).min(1).max(3),
  })
  .strict();

/** Minimum-card-bid response schema. */
export const minimumBidsResponseSchema = z.object({
  bids: z.array(
    z
      .object({
        bids: z
          .array(
            z
              .object({
                type: minimumPlacementSchema,
                value: z.number().int().nonnegative(),
              })
              .strict(),
          )
          .min(1),
        nm_id: wbIdSchema,
      })
      .strict(),
  ),
});

/** Card-bid write request and response schema. */
export const cardWriteBidsSchema = z
  .object({
    bids: z
      .array(
        z
          .object({
            advert_id: wbIdSchema,
            nm_bids: z
              .array(
                z
                  .object({
                    bid_kopecks: z.number().int().positive(),
                    nm_id: wbIdSchema,
                    placement: placementSchema,
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

/** Campaign/nm pair used by cluster endpoints. */
export const clusterPairSchema = z
  .object({
    advert_id: wbIdSchema,
    nm_id: wbIdSchema,
  })
  .strict();

/** Cluster discovery/current-bid request schema. */
export const clusterPairsRequestSchema = z
  .object({
    items: z.array(clusterPairSchema).min(1).max(100),
  })
  .strict();

/** One cluster bid wire item whose unit remains unverified. */
export const clusterBidItemSchema = clusterPairSchema.extend({
  bid: z.number().int().nonnegative(),
  norm_query: z.string().trim().min(1),
});

/** Cluster-current-bids response schema. */
export const clusterBidsResponseSchema = z.object({
  bids: z.array(clusterBidItemSchema),
});

/** Cluster write/delete request schema. */
export const clusterWriteRequestSchema = z
  .object({
    bids: z.array(clusterBidItemSchema).min(1).max(100),
  })
  .strict();

/** Cluster-list response schema. */
export const clusterListResponseSchema = z.object({
  items: z.array(
    clusterPairSchema.extend({
      norm_queries: z.array(z.string().trim().min(1)),
    }),
  ),
});

const statisticCountersSchema = z.object({
  atbs: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative(),
  cpc: wireDecimalSchema,
  cr: z.number().nonnegative(),
  ctr: z.number().nonnegative(),
  orders: z.number().int().nonnegative(),
  shks: z.number().int().nonnegative().optional(),
  sum: wireDecimalSchema,
  sum_price: wireDecimalSchema,
  views: z.number().int().nonnegative(),
});

/** Full-statistics response schema preserving daily and nm-level source rows. */
export const campaignStatisticsResponseSchema = z.array(
  statisticCountersSchema.extend({
    advertId: wbIdSchema,
    days: z.array(
      statisticCountersSchema.extend({
        apps: z.array(
          statisticCountersSchema.extend({
            appType: z.number().int(),
            nms: z.array(
              statisticCountersSchema.extend({
                name: z.string(),
                nmId: wbIdSchema,
              }),
            ),
          }),
        ),
        date: z.iso.datetime({ offset: true }),
      }),
    ),
  }),
);

/** Cluster-statistics request schema. */
export const clusterStatisticsRequestSchema = z
  .object({
    from: wbDateSchema,
    items: z.array(clusterPairSchema).min(1).max(100),
    to: wbDateSchema,
  })
  .strict()
  .refine((value) => value.from <= value.to, { message: 'from must not follow to' });

const clusterStatisticSchema = z
  .object({
    atbs: z.number().int().nonnegative(),
    avgPos: z.number().nonnegative(),
    clicks: z.number().int().nonnegative(),
    cpc: wireDecimalSchema,
    cpm: wireDecimalSchema.optional(),
    ctr: z.number().nonnegative().optional(),
    normQuery: z.string().trim().min(1),
    orders: z.number().int().nonnegative(),
    shks: z.number().int().nonnegative().optional(),
    spend: wireDecimalSchema,
    views: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Cluster-statistics response schema with CPM/CPC optional impression metrics. */
export const clusterStatisticsResponseSchema = z.object({
  items: z.array(
    z
      .object({
        advertId: wbIdSchema,
        dailyStats: z.array(
          z
            .object({
              date: wbDateSchema,
              stat: clusterStatisticSchema,
            })
            .strict(),
        ),
        nmId: wbIdSchema,
      })
      .strict(),
  ),
});

const recommendationValueSchema = z
  .object({
    bidKopecks: z.number().int().nonnegative(),
    bidKopecksMin: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Bid-recommendations response schema. */
export const bidRecommendationsResponseSchema = z
  .object({
    advertId: wbIdSchema,
    base: z
      .object({
        competitiveBid: recommendationValueSchema,
        leadersBid: recommendationValueSchema,
        top2: recommendationValueSchema,
      })
      .strict(),
    nmId: wbIdSchema,
    normQueries: z.array(
      z
        .object({
          normQuery: z.string().trim().min(1),
          reachMax: recommendationValueSchema,
          reachMedium: recommendationValueSchema,
          reachMin: recommendationValueSchema,
        })
        .strict(),
    ),
  })
  .strict();

/** Campaign-budget diagnostic schema; no balance semantics are inferred. */
export const campaignBudgetResponseSchema = z
  .object({
    cash: wireDecimalSchema,
    netting: wireDecimalSchema,
    total: wireDecimalSchema,
  })
  .strict();

/** Seller-identity response schema from common API. */
export const sellerInfoResponseSchema = z
  .object({
    name: z.string().min(1),
    sid: z.uuid(),
    tradeMark: z.string().optional(),
  })
  .loose();

/** Ping response schema. */
export const pingResponseSchema = z.object({
  Status: z.literal('OK'),
  TS: z.iso.datetime({ offset: true }),
});

/** Supported validated request bodies keyed by endpoint. */
export const requestSchemas = Object.freeze({
  cardMinimumBids: minimumBidsRequestSchema,
  cardWriteBids: cardWriteBidsSchema,
  clusterCurrentBids: clusterPairsRequestSchema,
  clusterDeleteBids: clusterWriteRequestSchema,
  clusterList: clusterPairsRequestSchema,
  clusterStatistics: clusterStatisticsRequestSchema,
  clusterWriteBids: clusterWriteRequestSchema,
});

/** Supported validated response bodies keyed by endpoint. */
export const responseSchemas = Object.freeze({
  bidRecommendations: bidRecommendationsResponseSchema,
  campaignBudget: campaignBudgetResponseSchema,
  campaignCount: campaignCountResponseSchema,
  campaignDetails: campaignDetailsResponseSchema,
  campaignStatistics: campaignStatisticsResponseSchema,
  cardMinimumBids: minimumBidsResponseSchema,
  cardWriteBids: cardWriteBidsSchema,
  clusterCurrentBids: clusterBidsResponseSchema,
  clusterDeleteBids: z.object({ bids: z.array(clusterBidItemSchema) }),
  clusterList: clusterListResponseSchema,
  clusterStatistics: clusterStatisticsResponseSchema,
  clusterWriteBids: z.object({ bids: z.array(clusterBidItemSchema) }),
  ping: pingResponseSchema,
  sellerInfo: sellerInfoResponseSchema,
});

/** Validated campaign count response. */
export type CampaignCountResponse = z.infer<typeof campaignCountResponseSchema>;
/** Validated campaign details response. */
export type CampaignDetailsResponse = z.infer<typeof campaignDetailsResponseSchema>;
/** Validated minimum-bid request. */
export type MinimumBidsRequest = z.infer<typeof minimumBidsRequestSchema>;
/** Validated minimum-bid response. */
export type MinimumBidsResponse = z.infer<typeof minimumBidsResponseSchema>;
/** Validated card write payload and echo response. */
export type CardWriteBids = z.infer<typeof cardWriteBidsSchema>;
/** Validated cluster-pairs request. */
export type ClusterPairsRequest = z.infer<typeof clusterPairsRequestSchema>;
/** Validated cluster write/delete request. */
export type ClusterWriteRequest = z.infer<typeof clusterWriteRequestSchema>;
/** Validated cluster-statistics request. */
export type ClusterStatisticsRequest = z.infer<typeof clusterStatisticsRequestSchema>;
/** Validated bid recommendations response. */
export type BidRecommendationsResponse = z.infer<typeof bidRecommendationsResponseSchema>;
