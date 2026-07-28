import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { MockStateService } from './mock-state.service.js';
import {
  BidRecommendationsResponseDto,
  CampaignBudgetResponseDto,
  CampaignCountResponseDto,
  CampaignDetailsResponseDto,
  CampaignStatisticsItemDto,
  CardWriteBidsDto,
  ClusterBidsResponseDto,
  ClusterListResponseDto,
  ClusterPairsRequestDto,
  ClusterStatisticsRequestDto,
  ClusterStatisticsResponseDto,
  ClusterWriteRequestDto,
  MinimumBidsRequestDto,
  MinimumBidsResponseDto,
  PingResponseDto,
  SellerInfoResponseDto,
  WbErrorResponseDto,
} from './promotion.dto.js';
import type {
  CardWriteBids,
  ClusterPairsRequest,
  ClusterStatisticsRequest,
  ClusterWriteRequest,
  MinimumBidsRequest,
} from '@wb-bidder/wb-api';
import type { EndpointKey } from '@wb-bidder/contracts';

/**
 * WB-compatible Promotion/Common API subset backed by deterministic state.
 */
@ApiTags('wb-compatible')
@ApiHeader({
  description: 'Synthetic mock credential; production secrets are never documented.',
  name: 'Authorization',
  required: true,
})
@ApiResponse({
  description: 'Invalid request or runtime-schema mismatch.',
  status: 400,
  type: WbErrorResponseDto,
})
@ApiResponse({
  description: 'Missing or invalid synthetic token.',
  status: 401,
  type: WbErrorResponseDto,
})
@ApiResponse({ description: 'Injected capability denial.', status: 403, type: WbErrorResponseDto })
@ApiResponse({
  description: 'Token bucket exhausted.',
  headers: {
    'Retry-After': { description: 'Minimum retry delay in seconds.', schema: { type: 'integer' } },
    'X-Ratelimit-Limit': { schema: { type: 'integer' } },
    'X-Ratelimit-Remaining': { schema: { type: 'integer' } },
    'X-Ratelimit-Reset': { schema: { type: 'integer' } },
    'X-Ratelimit-Retry': { schema: { type: 'integer' } },
  },
  status: 429,
  type: WbErrorResponseDto,
})
@ApiResponse({
  description: 'Injected transient WB failure.',
  status: 503,
  type: WbErrorResponseDto,
})
@Controller()
export class PromotionController {
  /**
   * Creates WB-compatible endpoints.
   *
   * @param state - Shared deterministic state.
   */
  public constructor(private readonly state: MockStateService) {}

  /**
   * Returns grouped campaigns.
   *
   * @param authorization - Synthetic mock token.
   * @param request - Express request for exact journal path.
   * @param response - Passthrough response for rate headers.
   * @returns WB-compatible campaign count.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Списки кампаний' })
  @ApiOkResponse({ type: CampaignCountResponseDto })
  @Get('/adv/v1/promotion/count')
  public campaignCount(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('campaignCount', authorization, request, response, undefined, () =>
      this.state.campaignCount(),
    );
  }

  /**
   * Returns campaign details.
   *
   * @param authorization - Synthetic mock token.
   * @param ids - Comma-separated IDs.
   * @param statuses - Comma-separated statuses.
   * @param paymentType - Optional payment filter.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible details.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Информация о кампаниях' })
  @ApiQuery({ name: 'ids', required: false, type: String })
  @ApiQuery({ name: 'statuses', required: false, type: String })
  @ApiQuery({ enum: ['cpm', 'cpc'], name: 'payment_type', required: false })
  @ApiOkResponse({ type: CampaignDetailsResponseDto })
  @Get('/api/advert/v2/adverts')
  public campaignDetails(
    @Headers('authorization') authorization: string | undefined,
    @Query('ids') ids: string | undefined,
    @Query('statuses') statuses: string | undefined,
    @Query('payment_type') paymentType: 'cpc' | 'cpm' | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    const parsedIds = parseCsvNumbers(ids, 50);
    const parsedStatuses = parseCsvNumbers(statuses, 6);
    return this.execute('campaignDetails', authorization, request, response, undefined, () =>
      this.state.campaignDetails(parsedIds, parsedStatuses, paymentType),
    );
  }

  /**
   * Returns minimum card bids.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Unknown JSON validated by runtime schema.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible minimum bid response.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Минимальные ставки для карточек товаров' })
  @ApiBody({ type: MinimumBidsRequestDto })
  @ApiOkResponse({ type: MinimumBidsResponseDto })
  @Post('/api/advert/v1/bids/min')
  public minimumBids(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('cardMinimumBids', authorization, request, response, body, () =>
      this.state.minimumBids(this.state.parseBody('cardMinimumBids', body) as MinimumBidsRequest),
    );
  }

  /**
   * Changes card bids with delayed visibility.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Unknown JSON validated by runtime schema.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible echo.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Изменение ставок в кампаниях' })
  @ApiBody({ type: CardWriteBidsDto })
  @ApiOkResponse({ type: CardWriteBidsDto })
  @Patch('/api/advert/v1/bids')
  public writeCardBids(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('cardWriteBids', authorization, request, response, body, () =>
      this.state.writeCardBids(this.state.parseBody('cardWriteBids', body) as CardWriteBids),
    );
  }

  /**
   * Gets current cluster bids.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Pair list.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible raw cluster bids.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Список ставок поисковых кластеров' })
  @ApiBody({ type: ClusterPairsRequestDto })
  @ApiOkResponse({ type: ClusterBidsResponseDto })
  @Post('/adv/v0/normquery/get-bids')
  public clusterBids(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('clusterCurrentBids', authorization, request, response, body, () =>
      this.state.getClusterBids(
        this.state.parseBody('clusterCurrentBids', body) as ClusterPairsRequest,
      ),
    );
  }

  /**
   * Lists discovered clusters.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Pair list.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible discovery rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Активные и неактивные поисковые кластеры' })
  @ApiBody({ type: ClusterPairsRequestDto })
  @ApiOkResponse({ type: ClusterListResponseDto })
  @Post('/adv/v0/normquery/list')
  public clusterList(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('clusterList', authorization, request, response, body, () =>
      this.state.listClusters(this.state.parseBody('clusterList', body) as ClusterPairsRequest),
    );
  }

  /**
   * Sets mock cluster bids.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Raw cluster writes.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns Echo rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Установить ставки для поисковых кластеров' })
  @ApiBody({ type: ClusterWriteRequestDto })
  @ApiOkResponse({ type: ClusterBidsResponseDto })
  @Post('/adv/v0/normquery/bids')
  public writeClusterBids(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('clusterWriteBids', authorization, request, response, body, () =>
      this.state.writeClusterBids(
        this.state.parseBody('clusterWriteBids', body) as ClusterWriteRequest,
      ),
    );
  }

  /**
   * Deletes mock cluster bid overrides.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Raw explicit overrides.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns Echo rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Удалить ставки поисковых кластеров' })
  @ApiBody({ type: ClusterWriteRequestDto })
  @ApiOkResponse({ type: ClusterBidsResponseDto })
  @Delete('/adv/v0/normquery/bids')
  public deleteClusterBids(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('clusterDeleteBids', authorization, request, response, body, () =>
      this.state.deleteClusterBids(
        this.state.parseBody('clusterDeleteBids', body) as ClusterWriteRequest,
      ),
    );
  }

  /**
   * Returns campaign statistics.
   *
   * @param authorization - Synthetic mock token.
   * @param ids - Comma-separated IDs.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible daily statistics.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Статистика кампаний' })
  @ApiQuery({ name: 'ids', required: true, type: String })
  @ApiQuery({ name: 'begin', required: true, type: String })
  @ApiQuery({ name: 'end', required: true, type: String })
  @ApiOkResponse({ isArray: true, type: CampaignStatisticsItemDto })
  @Get('/adv/v3/fullstats')
  public campaignStatistics(
    @Headers('authorization') authorization: string | undefined,
    @Query('ids') ids: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    const parsedIds = parseCsvNumbers(ids, 50);
    return this.execute('campaignStatistics', authorization, request, response, undefined, () =>
      this.state.campaignStatistics(parsedIds),
    );
  }

  /**
   * Returns daily cluster statistics.
   *
   * @param authorization - Synthetic mock token.
   * @param body - Date range and pairs.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible daily cluster rows.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Статистика поисковых кластеров по дням' })
  @ApiBody({ type: ClusterStatisticsRequestDto })
  @ApiOkResponse({ type: ClusterStatisticsResponseDto })
  @Post('/adv/v1/normquery/stats')
  public clusterStatistics(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('clusterStatistics', authorization, request, response, body, () =>
      this.state.clusterStatistics(
        this.state.parseBody('clusterStatistics', body) as ClusterStatisticsRequest,
      ),
    );
  }

  /**
   * Returns bid recommendation hints.
   *
   * @param authorization - Synthetic mock token.
   * @param advertId - Campaign ID.
   * @param nmId - Article ID.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns WB-compatible recommendations.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Рекомендуемые ставки' })
  @ApiQuery({ name: 'advertId', required: true, type: Number })
  @ApiQuery({ name: 'nmId', required: true, type: Number })
  @ApiOkResponse({ type: BidRecommendationsResponseDto })
  @Get('/api/advert/v0/bids/recommendations')
  public recommendations(
    @Headers('authorization') authorization: string | undefined,
    @Query('advertId') advertId: string,
    @Query('nmId') nmId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('bidRecommendations', authorization, request, response, undefined, () =>
      this.state.recommendations(parsePositiveInteger(advertId), parsePositiveInteger(nmId)),
    );
  }

  /**
   * Returns diagnostic campaign budget.
   *
   * @param authorization - Synthetic mock token.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns Raw WB-compatible budget fields.
   * @see https://dev.wildberries.ru/ru/openapi/promotion
   */
  @ApiOperation({ summary: 'Бюджет кампании' })
  @ApiQuery({ name: 'id', required: true, type: Number })
  @ApiOkResponse({ type: CampaignBudgetResponseDto })
  @Get('/adv/v1/budget')
  public budget(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('campaignBudget', authorization, request, response, undefined, () =>
      this.state.budget(),
    );
  }

  /**
   * Returns deterministic seller identity.
   *
   * @param authorization - Synthetic mock token.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns Synthetic seller info.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  @ApiOperation({ summary: 'Информация о продавце' })
  @ApiOkResponse({ type: SellerInfoResponseDto })
  @Get('/api/v1/seller-info')
  public sellerInfo(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('sellerInfo', authorization, request, response, undefined, () => ({
      name: 'Synthetic Seller',
      sid: '00000000-0000-4000-8000-000000000001',
      tradeMark: 'WB Mock',
    }));
  }

  /**
   * Returns deterministic integration ping.
   *
   * @param authorization - Synthetic mock token.
   * @param request - Express request.
   * @param response - Rate-header response.
   * @returns Synthetic ping.
   * @see https://dev.wildberries.ru/ru/openapi/api-information
   */
  @ApiOperation({ summary: 'Проверка подключения' })
  @ApiOkResponse({ type: PingResponseDto })
  @Get('/ping')
  public ping(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): unknown {
    return this.execute('ping', authorization, request, response, undefined, () => ({
      Status: 'OK',
      TS: String(this.state.snapshot().virtualTime),
    }));
  }

  /**
   * Executes one journaled endpoint and emits rate headers.
   *
   * @param endpointKey - Exact endpoint key.
   * @param authorization - Synthetic authorization.
   * @param request - Express request.
   * @param response - Express response.
   * @param body - Request body.
   * @param operation - Deterministic endpoint operation.
   * @returns Operation response.
   */
  private execute(
    endpointKey: EndpointKey,
    authorization: string | undefined,
    request: Request,
    response: Response,
    body: unknown,
    operation: () => unknown,
  ): unknown {
    const started = this.state.beginRequest({
      authorization,
      body,
      endpointKey,
      method: request.method,
      path: request.originalUrl,
      query: toStringRecord(request.query),
    });
    for (const [name, value] of Object.entries(started.headers)) {
      response.setHeader(name, value);
    }
    try {
      const result = operation();
      return this.state.finishRequest(started.journalId, 200, result);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        this.state.finishRequest(started.journalId, error.getStatus(), error.getResponse());
      }
      throw error;
    }
  }
}

/**
 * Parses comma-separated positive integers with a batch limit.
 *
 * @param value - Optional CSV query.
 * @param maximum - Maximum items.
 * @returns Parsed integer list.
 */
function parseCsvNumbers(value: string | undefined, maximum: number): number[] {
  if (value === undefined || value === '') {
    return [];
  }
  const parsed = value.split(',').map(parsePositiveInteger);
  if (parsed.length > maximum) {
    throw new Error('WB mock query exceeds endpoint batch limit');
  }
  return parsed;
}

/**
 * Parses one positive safe integer.
 *
 * @param value - Query string.
 * @returns Positive safe integer.
 */
function parsePositiveInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('WB mock query ID must be a positive integer');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('WB mock query ID must be a positive safe integer');
  }
  return parsed;
}

/**
 * Converts Express parsed query values to the synthetic string journal contract.
 *
 * @param query - Express query object.
 * @returns String-only query map.
 */
function toStringRecord(query: Request['query']): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(query).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    ),
  );
}
