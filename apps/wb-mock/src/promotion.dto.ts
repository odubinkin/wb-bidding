import { ApiProperty } from '@nestjs/swagger';

/**
 * Campaign/article pair used by cluster endpoints.
 */
export class ClusterPairDto {
  /** WB campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1, type: Number })
  public readonly advert_id!: number;

  /** WB article identifier. */
  @ApiProperty({ example: 20001, minimum: 1, type: Number })
  public readonly nm_id!: number;
}

/**
 * Request shared by cluster discovery and current-bid endpoints.
 */
export class ClusterPairsRequestDto {
  /** One to one hundred campaign/article pairs. */
  @ApiProperty({ isArray: true, maxItems: 100, minItems: 1, type: ClusterPairDto })
  public readonly items!: readonly ClusterPairDto[];
}

/**
 * One raw cluster bid whose production unit remains fail-closed.
 */
export class ClusterBidDto extends ClusterPairDto {
  /** Raw WB bid value; no production monetary semantic is inferred. */
  @ApiProperty({
    description: 'Raw WB value; monetary unit remains UNVERIFIED for production writes.',
    example: 1000,
    minimum: 0,
    type: Number,
  })
  public readonly bid!: number;

  /** Normalized search query. */
  @ApiProperty({ example: 'synthetic cluster one', minLength: 1, type: String })
  public readonly norm_query!: string;
}

/**
 * Cluster write/delete request.
 */
export class ClusterWriteRequestDto {
  /** One to one hundred explicit cluster values. */
  @ApiProperty({ isArray: true, maxItems: 100, minItems: 1, type: ClusterBidDto })
  public readonly bids!: readonly ClusterBidDto[];
}

/**
 * Cluster current-bid response.
 */
export class ClusterBidsResponseDto {
  /** Current raw cluster values. */
  @ApiProperty({ isArray: true, type: ClusterBidDto })
  public readonly bids!: readonly ClusterBidDto[];
}

/**
 * Minimum-card-bid request.
 */
export class MinimumBidsRequestDto {
  /** Single campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1, type: Number })
  public readonly advert_id!: number;

  /** One to one hundred article identifiers. */
  @ApiProperty({ example: [20001], maxItems: 100, minItems: 1, type: [Number] })
  public readonly nm_ids!: readonly number[];

  /** Campaign payment type. */
  @ApiProperty({ enum: ['cpc', 'cpm'] })
  public readonly payment_type!: 'cpc' | 'cpm';

  /** WB minimum-bid placement spelling; recommendation is singular. */
  @ApiProperty({
    enum: ['combined', 'recommendation', 'search'],
    isArray: true,
    maxItems: 3,
    minItems: 1,
  })
  public readonly placement_types!: readonly ('combined' | 'recommendation' | 'search')[];
}

/**
 * One placement minimum in kopecks.
 */
export class MinimumBidValueDto {
  /** WB placement spelling. */
  @ApiProperty({ enum: ['combined', 'recommendation', 'search'] })
  public readonly type!: 'combined' | 'recommendation' | 'search';

  /** Minimum bid in kopecks. */
  @ApiProperty({ description: 'Kopecks (minor RUB units).', example: 250, minimum: 0 })
  public readonly value!: number;
}

/**
 * One article minimum-bid row.
 */
export class MinimumBidRowDto {
  /** Placement values. */
  @ApiProperty({ isArray: true, minItems: 1, type: MinimumBidValueDto })
  public readonly bids!: readonly MinimumBidValueDto[];

  /** WB article identifier. */
  @ApiProperty({ example: 20001, minimum: 1, type: Number })
  public readonly nm_id!: number;
}

/**
 * Minimum-card-bid response.
 */
export class MinimumBidsResponseDto {
  /** Article minimum-bid rows. */
  @ApiProperty({ isArray: true, type: MinimumBidRowDto })
  public readonly bids!: readonly MinimumBidRowDto[];
}

/**
 * One card placement bid.
 */
export class CardNmBidDto {
  /** Bid in kopecks. */
  @ApiProperty({ description: 'Kopecks (minor RUB units).', example: 1300, minimum: 1 })
  public readonly bid_kopecks!: number;

  /** WB article identifier. */
  @ApiProperty({ example: 20001, minimum: 1, type: Number })
  public readonly nm_id!: number;

  /** Placement whose bid is changed. */
  @ApiProperty({ enum: ['combined', 'recommendations', 'search'] })
  public readonly placement!: 'combined' | 'recommendations' | 'search';
}

/**
 * Card bids grouped by campaign.
 */
export class CardCampaignBidsDto {
  /** WB campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1, type: Number })
  public readonly advert_id!: number;

  /** Article/placement bid rows. */
  @ApiProperty({ isArray: true, minItems: 1, type: CardNmBidDto })
  public readonly nm_bids!: readonly CardNmBidDto[];
}

/**
 * Card write request and mock echo response.
 */
export class CardWriteBidsDto {
  /** One to fifty campaign groups. */
  @ApiProperty({ isArray: true, maxItems: 50, minItems: 1, type: CardCampaignBidsDto })
  public readonly bids!: readonly CardCampaignBidsDto[];
}

/**
 * Daily cluster-statistics request.
 */
export class ClusterStatisticsRequestDto {
  /** Inclusive first WB statistical date. */
  @ApiProperty({ example: '2026-07-27', format: 'date', type: String })
  public readonly from!: string;

  /** One to one hundred campaign/article pairs. */
  @ApiProperty({ isArray: true, maxItems: 100, minItems: 1, type: ClusterPairDto })
  public readonly items!: readonly ClusterPairDto[];

  /** Inclusive last WB statistical date. */
  @ApiProperty({ example: '2026-07-28', format: 'date', type: String })
  public readonly to!: string;
}

/**
 * Generic WB-compatible API error body.
 */
export class WbErrorResponseDto {
  /** Human-readable synthetic detail. */
  @ApiProperty({ example: 'deterministic injected fault', type: String })
  public readonly detail!: string;

  /** HTTP status mirrored in the body. */
  @ApiProperty({ example: 429, type: Number })
  public readonly status!: number;
}

/**
 * Campaign-count list item.
 */
export class CampaignCountItemDto {
  /** WB campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1, type: Number })
  public readonly advertId!: number;

  /** Last synthetic change instant. */
  @ApiProperty({ format: 'date-time', type: String })
  public readonly changeTime!: string;
}

/**
 * Campaign-count status group.
 */
export class CampaignCountGroupDto {
  /** Campaign rows in this status group. */
  @ApiProperty({ isArray: true, type: CampaignCountItemDto })
  public readonly advert_list!: readonly CampaignCountItemDto[];

  /** Number of rows in the group. */
  @ApiProperty({ minimum: 0, type: Number })
  public readonly count!: number;

  /** WB campaign status. */
  @ApiProperty({ example: 9, type: Number })
  public readonly status!: number;

  /** WB campaign type. */
  @ApiProperty({ example: 9, type: Number })
  public readonly type!: number;
}

/**
 * Campaign-count response.
 */
export class CampaignCountResponseDto {
  /** Campaigns grouped by status/type. */
  @ApiProperty({ isArray: true, type: CampaignCountGroupDto })
  public readonly adverts!: readonly CampaignCountGroupDto[];

  /** Total campaign count. */
  @ApiProperty({ minimum: 0, type: Number })
  public readonly all!: number;
}

/**
 * Placement switches in campaign details.
 */
export class CampaignPlacementsDto {
  /** Recommendations placement enabled. */
  @ApiProperty({ type: Boolean })
  public readonly recommendations!: boolean;

  /** Search placement enabled. */
  @ApiProperty({ type: Boolean })
  public readonly search!: boolean;
}

/**
 * One article row in campaign details.
 */
export class CampaignNmSettingsDto {
  /** Current card bids in kopecks. */
  @ApiProperty({
    description: 'Search and recommendations bids in kopecks.',
    example: { recommendations: 900, search: 1200 },
    type: Object,
  })
  public readonly bids_kopecks!: {
    readonly recommendations: number;
    readonly search: number;
  };

  /** WB article identifier. */
  @ApiProperty({ example: 20001, minimum: 1, type: Number })
  public readonly nm_id!: number;

  /** Subject identity and name. */
  @ApiProperty({ example: { id: 52, name: 'synthetic subject' }, type: Object })
  public readonly subject!: { readonly id: number; readonly name: string };
}

/**
 * One campaign-details row.
 */
export class CampaignDetailsItemDto {
  /** Bid strategy reported by WB. */
  @ApiProperty({ enum: ['manual', 'unified'] })
  public readonly bid_type!: 'manual' | 'unified';

  /** WB campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1, type: Number })
  public readonly id!: number;

  /** Article settings. */
  @ApiProperty({ isArray: true, type: CampaignNmSettingsDto })
  public readonly nm_settings!: readonly CampaignNmSettingsDto[];

  /** Campaign display/payment/placement settings. */
  @ApiProperty({
    example: {
      name: 'Synthetic 10001',
      payment_type: 'cpm',
      placements: { recommendations: true, search: true },
    },
    type: Object,
  })
  public readonly settings!: {
    readonly name: string;
    readonly payment_type: 'cpc' | 'cpm';
    readonly placements: CampaignPlacementsDto;
  };

  /** WB campaign lifecycle status. */
  @ApiProperty({ enum: [-1, 4, 7, 8, 9, 11] })
  public readonly status!: -1 | 4 | 7 | 8 | 9 | 11;

  /** WB campaign timestamps. */
  @ApiProperty({
    example: {
      created: '2026-07-28T00:00:00.000Z',
      deleted: '2100-01-01T00:00:00.000Z',
      started: '2026-07-28T00:00:00.000Z',
      updated: '2026-07-28T00:00:00.000Z',
    },
    type: Object,
  })
  public readonly timestamps!: Readonly<Record<string, string | null>>;
}

/**
 * Campaign-details response.
 */
export class CampaignDetailsResponseDto {
  /** Campaign detail rows. */
  @ApiProperty({ isArray: true, type: CampaignDetailsItemDto })
  public readonly adverts!: readonly CampaignDetailsItemDto[];
}

/**
 * Cluster-list item.
 */
export class ClusterListItemDto extends ClusterPairDto {
  /** Visible normalized queries. */
  @ApiProperty({ example: ['synthetic cluster one'], isArray: true, type: String })
  public readonly norm_queries!: readonly string[];
}

/**
 * Cluster-list response.
 */
export class ClusterListResponseDto {
  /** Campaign/article cluster lists. */
  @ApiProperty({ isArray: true, type: ClusterListItemDto })
  public readonly items!: readonly ClusterListItemDto[];
}

/**
 * Raw campaign-statistics response row.
 */
export class CampaignStatisticsItemDto {
  /** Campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1 })
  public readonly advertId!: number;

  /** WB daily rows; monetary semantics remain unverified. */
  @ApiProperty({
    description:
      'WB-compatible daily/app/article rows. sum, sum_price and cpc are raw major-unit fields with UNVERIFIED aggregation semantics.',
    isArray: true,
    type: Object,
  })
  public readonly days!: readonly Record<string, unknown>[];

  /** Total clicks. */
  @ApiProperty({ minimum: 0 })
  public readonly clicks!: number;

  /** Raw WB spend. */
  @ApiProperty({ description: 'Raw WB major-unit field; aggregation semantics UNVERIFIED.' })
  public readonly sum!: number | string;

  /** Total views. */
  @ApiProperty({ minimum: 0 })
  public readonly views!: number;
}

/**
 * Cluster-statistics response.
 */
export class ClusterStatisticsResponseDto {
  /** Daily cluster rows. */
  @ApiProperty({
    description:
      'Items contain advertId, nmId and dailyStats. Monetary fields are preserved as raw WB values.',
    isArray: true,
    type: Object,
  })
  public readonly items!: readonly Record<string, unknown>[];
}

/**
 * Bid-recommendation response.
 */
export class BidRecommendationsResponseDto {
  /** Campaign identifier. */
  @ApiProperty({ example: 10001, minimum: 1 })
  public readonly advertId!: number;

  /** Base recommendation groups in kopecks. */
  @ApiProperty({
    description: 'competitiveBid, leadersBid and top2 values in kopecks.',
    type: Object,
  })
  public readonly base!: Readonly<Record<string, unknown>>;

  /** Article identifier. */
  @ApiProperty({ example: 20001, minimum: 1 })
  public readonly nmId!: number;

  /** Query-specific recommendations in kopecks. */
  @ApiProperty({ isArray: true, type: Object })
  public readonly normQueries!: readonly Record<string, unknown>[];
}

/**
 * Diagnostic campaign budget response.
 */
export class CampaignBudgetResponseDto {
  /** Raw WB cash field with unverified balance semantics. */
  @ApiProperty({ description: 'Raw WB major-unit field; balance semantics UNVERIFIED.' })
  public readonly cash!: number | string;

  /** Raw WB netting field with unverified balance semantics. */
  @ApiProperty({ description: 'Raw WB major-unit field; balance semantics UNVERIFIED.' })
  public readonly netting!: number | string;

  /** Raw WB total field with unverified balance semantics. */
  @ApiProperty({ description: 'Raw WB major-unit field; balance semantics UNVERIFIED.' })
  public readonly total!: number | string;
}

/**
 * Seller identity response from the Common API.
 */
export class SellerInfoResponseDto {
  /** Seller display name. */
  @ApiProperty({ example: 'Synthetic Seller' })
  public readonly name!: string;

  /** Seller UUID. */
  @ApiProperty({ format: 'uuid', type: String })
  public readonly sid!: string;

  /** Optional trademark. */
  @ApiProperty({ required: false, type: String })
  public readonly tradeMark?: string;
}

/**
 * WB ping response.
 */
export class PingResponseDto {
  /** Stable successful status. */
  @ApiProperty({ enum: ['OK'] })
  public readonly Status!: 'OK';

  /** Synthetic server instant. */
  @ApiProperty({ format: 'date-time', type: String })
  public readonly TS!: string;
}
