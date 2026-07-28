import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { CURRENT_ENDPOINT_PROFILE, type EndpointKey } from '@wb-bidder/contracts';
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
import type { MockConfiguration } from '@wb-bidder/config';
import { MOCK_CONFIGURATION } from './mock-config.js';

/**
 * JSON-compatible mock request journal record.
 */
export interface MockRequestRecord {
  /** Validated or raw synthetic request body. */
  readonly body: unknown;
  /** Endpoint key. */
  readonly endpointKey: EndpointKey;
  /** Selected synthetic request headers. */
  readonly headers: Readonly<Record<string, string>>;
  /** Monotonic request sequence. */
  readonly id: number;
  /** HTTP method. */
  readonly method: string;
  /** Request path and query. */
  readonly path: string;
  /** Parsed synthetic query. */
  readonly query: Readonly<Record<string, string>>;
  /** Full synthetic response body. */
  responseBody: unknown;
  /** Response status. */
  responseStatus: number;
  /** Virtual processing time. */
  readonly receivedAt: string;
}

/**
 * Configurable deterministic fault rule.
 */
export interface MockFaultRule {
  /** Endpoint key to match. */
  readonly endpointKey: EndpointKey;
  /** Optional stricter token-bucket profile active while this rule has remaining calls. */
  readonly rateLimit?: {
    readonly burst: number;
    readonly intervalMs: number;
    readonly requests: number;
  };
  /** Optional deterministic rate-limit response headers. */
  readonly responseHeaders?: Readonly<Record<string, string>>;
  /** Optional visibility delay applied to successful card writes. */
  readonly visibilityDelayMs?: number;
  /** Number of matching calls affected. */
  remaining: number;
  /** Optional HTTP status to return; omit to alter only rate-limit behavior. */
  readonly status?: 400 | 401 | 402 | 403 | 409 | 413 | 429 | 500 | 502 | 503;
}

/**
 * Result of virtual time advancement.
 */
export interface TimeAdvanceResult {
  /** Checksum of deterministic mutable state. */
  readonly checksum: string;
  /** Source dates created or finalized. */
  readonly sourceDates: readonly string[];
  /** New virtual instant. */
  readonly virtualTime: string;
}

/**
 * Metadata supplied by controllers for exact journaling.
 */
export interface MockRequestContext {
  /** Authorization header. */
  readonly authorization: string | undefined;
  /** Validated or raw body. */
  readonly body: unknown;
  /** Endpoint key. */
  readonly endpointKey: EndpointKey;
  /** HTTP method. */
  readonly method: string;
  /** Path with query. */
  readonly path: string;
  /** Parsed query. */
  readonly query: Readonly<Record<string, string>>;
}

/**
 * In-memory campaign representation used by seed fixtures.
 */
interface MockCampaign {
  /** Bid type. */
  readonly bidType: 'manual' | 'unified';
  /** Campaign ID. */
  readonly id: number;
  /** Product rows. */
  readonly nms: { bidRecommendations: number; bidSearch: number; nmId: number }[];
  /** Payment type. */
  readonly paymentType: 'cpc' | 'cpm';
  /** Active placement flags. */
  readonly placements: { recommendations: boolean; search: boolean };
  /** WB campaign status. */
  status: 4 | 7 | 8 | 9 | 11;
}

/**
 * Card write awaiting documented delayed visibility.
 */
interface PendingCardWrite {
  /** Requested wire payload. */
  readonly payload: CardWriteBids;
  /** Virtual time at which reads expose it. */
  readonly visibleAtMs: number;
}

/**
 * Deterministic, database-free state machine backing the WB mock application.
 */
@Injectable()
export class MockStateService {
  private campaigns = new Map<number, MockCampaign>();
  private clusterBids = new Map<string, number>();
  private dailyDates = new Set<string>();
  private faults: MockFaultRule[] = [];
  private initialTimeMs: number;
  private journal: MockRequestRecord[] = [];
  private pendingCardWrites: PendingCardWrite[] = [];
  private sequence = 0;
  private virtualTimeMs: number;
  private activeSeed: string;
  private rateBuckets = new Map<string, { lastRefillAtMs: number; tokens: number }>();

  /**
   * Creates initial deterministic state from application configuration.
   *
   * @param configuration - Seed and virtual initial time.
   */
  public constructor(@Inject(MOCK_CONFIGURATION) configuration: MockConfiguration) {
    this.initialTimeMs = Date.parse(configuration.initialTime);
    this.virtualTimeMs = this.initialTimeMs;
    this.activeSeed = configuration.seed;
    this.seed(configuration.seed);
  }

  /**
   * Authorizes one synthetic request.
   *
   * @param authorization - Exact mock token header.
   * @returns Nothing for the synthetic token.
   * @throws {UnauthorizedException} For any other value.
   */
  public authorize(authorization: string | undefined): void {
    if (authorization !== 'mock-test-token') {
      throw new UnauthorizedException({ detail: 'synthetic token required', status: 401 });
    }
  }

  /**
   * Starts journaling and enforces mock token bucket/faults.
   *
   * @param context - Synthetic request context.
   * @returns Journal ID and response rate-limit headers.
   * @throws {HttpException} For configured faults or rate exhaustion.
   */
  public beginRequest(context: MockRequestContext): {
    readonly headers: Readonly<Record<string, string>>;
    readonly journalId: number;
  } {
    this.authorize(context.authorization);
    this.applyVisibleWrites();
    this.sequence += 1;
    const record: MockRequestRecord = {
      body: structuredClone(context.body),
      endpointKey: context.endpointKey,
      headers: Object.freeze({ authorization: context.authorization ?? '' }),
      id: this.sequence,
      method: context.method,
      path: context.path,
      query: Object.freeze({ ...context.query }),
      receivedAt: this.nowIso(),
      responseBody: null,
      responseStatus: 0,
    };
    this.journal.push(record);
    const fault = this.faults.find(
      (candidate) => candidate.endpointKey === context.endpointKey && candidate.remaining > 0,
    );
    const embeddedProfile = CURRENT_ENDPOINT_PROFILE.personalProductionLimits[context.endpointKey];
    const profile = fault?.rateLimit ?? embeddedProfile;
    const refillRate = profile.requests / profile.intervalMs;
    const quotaNowMs = Date.now();
    const state = this.rateBuckets.get(context.endpointKey) ?? {
      lastRefillAtMs: quotaNowMs,
      tokens: profile.burst,
    };
    state.tokens = Math.min(
      profile.burst,
      state.tokens + Math.max(0, quotaNowMs - state.lastRefillAtMs) * refillRate,
    );
    state.lastRefillAtMs = quotaNowMs;
    const retryAtMs =
      state.tokens >= 1 ? quotaNowMs : quotaNowMs + Math.ceil((1 - state.tokens) / refillRate);
    const headers: Readonly<Record<string, string>> = Object.freeze({
      'x-ratelimit-limit': String(profile.requests),
      'x-ratelimit-remaining': String(Math.max(0, Math.floor(state.tokens - 1))),
      'x-ratelimit-reset': String(Math.ceil(retryAtMs / 1_000)),
      ...(fault?.responseHeaders ?? {}),
    });
    if (state.tokens < 1) {
      const quotaResponse = { detail: 'mock account quota exhausted', status: 429 };
      record.responseStatus = 429;
      record.responseBody = quotaResponse;
      throw createMockHttpException(quotaResponse, 429, {
        'retry-after': String(Math.max(1, Math.ceil((retryAtMs - quotaNowMs) / 1_000))),
        'x-ratelimit-retry': String(Math.max(1, Math.ceil((retryAtMs - quotaNowMs) / 1_000))),
        ...headers,
      });
    }
    state.tokens -= 1;
    this.rateBuckets.set(context.endpointKey, state);

    if (fault !== undefined) {
      fault.remaining -= 1;
      if (fault.status !== undefined) {
        const faultResponse = { detail: 'deterministic injected fault', status: fault.status };
        record.responseStatus = fault.status;
        record.responseBody = faultResponse;
        throw createMockHttpException(
          faultResponse,
          fault.status,
          fault.status === 429
            ? {
                ...headers,
                'retry-after': headers['retry-after'] ?? '1',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-retry': headers['x-ratelimit-retry'] ?? '1',
              }
            : headers,
        );
      }
    }
    return { headers, journalId: record.id };
  }

  /**
   * Completes a request journal pair.
   *
   * @param journalId - ID returned by beginRequest.
   * @param status - Synthetic response status.
   * @param body - Synthetic response body.
   * @returns The supplied body for controller convenience.
   */
  public finishRequest<T>(journalId: number, status: number, body: T): T {
    const record = this.journal.find((candidate) => candidate.id === journalId);
    if (record === undefined) {
      throw new Error('Mock request journal invariant failed');
    }
    record.responseStatus = status;
    record.responseBody = structuredClone(body);
    return body;
  }

  /**
   * Resets mutable state, request journal, faults, quota and virtual time.
   *
   * @returns Public state snapshot.
   */
  public reset(): Readonly<Record<string, unknown>> {
    this.seed(this.activeSeed);
    return this.snapshot();
  }

  /**
   * Selects and resets a deterministic built-in scenario.
   *
   * @param scenario - Built-in deterministic scenario.
   * @returns Public state snapshot.
   * @throws {HttpException} For unknown scenarios.
   */
  public selectSeed(scenario: string): Readonly<Record<string, unknown>> {
    if (
      ![
        'ambiguous-write',
        'delayed-visibility',
        'foundation',
        'multi-day',
        'partial-failure',
      ].includes(scenario)
    ) {
      throw new HttpException({ detail: 'unknown mock scenario', status: 400 }, 400);
    }
    this.activeSeed = scenario;
    this.seed(scenario);
    return this.snapshot();
  }

  /**
   * Replaces deterministic fault rules.
   *
   * @param rules - Fully validated synthetic fault rules.
   * @returns Active rules.
   */
  public setFaults(rules: readonly MockFaultRule[]): readonly MockFaultRule[] {
    for (const rule of rules) {
      if (rule.rateLimit === undefined) {
        continue;
      }
      const embedded = CURRENT_ENDPOINT_PROFILE.personalProductionLimits[rule.endpointKey];
      if (
        rule.rateLimit.requests / rule.rateLimit.intervalMs >
          embedded.requests / embedded.intervalMs ||
        rule.rateLimit.burst > embedded.burst
      ) {
        throw new HttpException(
          { detail: 'mock rate limit override must be stricter', status: 400 },
          400,
        );
      }
    }
    this.faults = rules.map((rule) => ({ ...rule }));
    return structuredClone(this.faults);
  }

  /**
   * Advances virtual time and materializes full model days synchronously.
   *
   * @param duration - Positive day/hour/minute components.
   * @param finalizeStatistics - Whether completed dates are materialized.
   * @returns New time, touched dates, and checksum.
   */
  public advanceTime(
    duration: Readonly<{ days: number; hours: number; minutes: number }>,
    finalizeStatistics: boolean,
  ): TimeAdvanceResult {
    const totalMinutes = duration.days * 1_440 + duration.hours * 60 + duration.minutes;
    if (
      !Number.isInteger(duration.days) ||
      !Number.isInteger(duration.hours) ||
      !Number.isInteger(duration.minutes) ||
      totalMinutes <= 0
    ) {
      throw new HttpException(
        { detail: 'model duration must be positive integers', status: 400 },
        400,
      );
    }
    const previousMs = this.virtualTimeMs;
    this.virtualTimeMs += totalMinutes * 60_000;
    const sourceDates: string[] = [];
    if (finalizeStatistics) {
      let cursor = startOfUtcDay(previousMs) + 86_400_000;
      while (cursor <= startOfUtcDay(this.virtualTimeMs)) {
        const date = new Date(cursor - 86_400_000).toISOString().slice(0, 10);
        if (!this.dailyDates.has(date)) {
          this.dailyDates.add(date);
          sourceDates.push(date);
        }
        cursor += 86_400_000;
      }
    }
    this.applyVisibleWrites();
    return Object.freeze({
      checksum: this.checksum(),
      sourceDates: Object.freeze(sourceDates),
      virtualTime: this.nowIso(),
    });
  }

  /**
   * Returns a safe deterministic state snapshot.
   *
   * @returns Seed, time, counts, pending writes, dates, and checksum.
   */
  public snapshot(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      campaignCount: this.campaigns.size,
      checksum: this.checksum(),
      dailyDates: [...this.dailyDates].sort(),
      pendingCardWrites: this.pendingCardWrites.length,
      requestCount: this.journal.length,
      seed: this.activeSeed,
      virtualTime: this.nowIso(),
    });
  }

  /**
   * Returns journal records in processing order.
   *
   * @returns Deep-cloned request/response pairs.
   */
  public requests(): readonly MockRequestRecord[] {
    return structuredClone(this.journal);
  }

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
        ['synthetic cluster one', 'synthetic cluster two'].map((normQuery) => ({
          advert_id: item.advert_id,
          bid: this.clusterBids.get(clusterKey(item.advert_id, item.nm_id, normQuery)) ?? 700,
          nm_id: item.nm_id,
          norm_query: normQuery,
        })),
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

  /**
   * Seeds all mutable state from one built-in scenario.
   *
   * @param scenario - Scenario identifier.
   * @returns Nothing.
   */
  private seed(scenario: string): void {
    this.virtualTimeMs = this.initialTimeMs;
    this.campaigns = new Map([
      [
        10_001,
        {
          bidType: 'manual',
          id: 10_001,
          nms: [{ bidRecommendations: 0, bidSearch: 1_200, nmId: 20_001 }],
          paymentType: 'cpm',
          placements: { recommendations: false, search: true },
          status: 9,
        },
      ],
      [
        10_002,
        {
          bidType: 'unified',
          id: 10_002,
          nms: [{ bidRecommendations: 500, bidSearch: 500, nmId: 20_002 }],
          paymentType: 'cpc',
          placements: { recommendations: true, search: true },
          status: 11,
        },
      ],
    ]);
    this.clusterBids = new Map();
    this.dailyDates = new Set();
    if (scenario === 'multi-day') {
      this.dailyDates = new Set(['2026-07-25', '2026-07-26', '2026-07-27']);
    }
    this.faults = [];
    this.journal = [];
    this.pendingCardWrites = [];
    this.rateBuckets = new Map();
    this.sequence = 0;
  }

  /**
   * Applies delayed card writes whose visibility time has elapsed.
   *
   * @returns Nothing.
   */
  private applyVisibleWrites(): void {
    const pending: PendingCardWrite[] = [];
    for (const write of this.pendingCardWrites) {
      if (write.visibleAtMs > this.virtualTimeMs) {
        pending.push(write);
        continue;
      }
      for (const campaignWrite of write.payload.bids) {
        const campaign = this.campaigns.get(campaignWrite.advert_id);
        if (campaign === undefined) {
          continue;
        }
        for (const nmWrite of campaignWrite.nm_bids) {
          const nm = campaign.nms.find((candidate) => candidate.nmId === nmWrite.nm_id);
          if (nm === undefined) {
            continue;
          }
          if (nmWrite.placement === 'combined') {
            nm.bidSearch = nmWrite.bid_kopecks;
            nm.bidRecommendations = nmWrite.bid_kopecks;
          } else if (nmWrite.placement === 'search') {
            nm.bidSearch = nmWrite.bid_kopecks;
          } else {
            nm.bidRecommendations = nmWrite.bid_kopecks;
          }
        }
      }
    }
    this.pendingCardWrites = pending;
  }

  /**
   * Generates one internally consistent fullstats day.
   *
   * @param date - WB source date.
   * @param nmId - Synthetic article.
   * @param index - Deterministic day offset.
   * @returns Fullstats day row.
   */
  private statisticDay(
    date: string,
    nmId: number,
    index: number,
  ): {
    apps: readonly unknown[];
    atbs: number;
    canceled: number;
    clicks: number;
    cpc: number;
    cr: number;
    ctr: number;
    date: string;
    orders: number;
    shks: number;
    sum: number;
    sum_price: number;
    views: number;
  } {
    const views = 200 + index * 10;
    const clicks = 10 + index;
    const orders = index % 2;
    const sum = Number((12.5 + index).toFixed(2));
    const counters = {
      atbs: orders,
      canceled: 0,
      clicks,
      cpc: Number((sum / clicks).toFixed(2)),
      cr: Number(((orders / clicks) * 100).toFixed(2)),
      ctr: Number(((clicks / views) * 100).toFixed(2)),
      orders,
      shks: orders,
      sum,
      sum_price: orders * 500,
      views,
    };
    return {
      ...counters,
      apps: [
        {
          ...counters,
          appType: 1,
          nms: [{ ...counters, name: 'synthetic product', nmId }],
        },
      ],
      date: `${date}T00:00:00.000Z`,
    };
  }

  /**
   * Returns current virtual instant.
   *
   * @returns RFC 3339 UTC string.
   */
  private nowIso(): string {
    return new Date(this.virtualTimeMs).toISOString();
  }

  /**
   * Computes canonical-enough checksum over sorted deterministic state.
   *
   * @returns SHA-256 hex.
   */
  private checksum(): string {
    const value = JSON.stringify({
      campaigns: [...this.campaigns.entries()].sort(([left], [right]) => left - right),
      clusterBids: [...this.clusterBids.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      dailyDates: [...this.dailyDates].sort(),
      pendingCardWrites: this.pendingCardWrites,
      seed: this.activeSeed,
      virtualTime: this.nowIso(),
    });
    return createHash('sha256').update(value).digest('hex');
  }
}

/**
 * Creates a stable cluster override key.
 *
 * @param advertId - Campaign ID.
 * @param nmId - Article ID.
 * @param normQuery - Exact normalized cluster string.
 * @returns Map key.
 */
function clusterKey(advertId: number, nmId: number, normQuery: string): string {
  return `${String(advertId)}:${String(nmId)}:${normQuery}`;
}

/**
 * Creates an HTTP exception carrying deterministic headers for the global filter.
 *
 * @param body - Public error response.
 * @param status - HTTP status.
 * @param headers - Synthetic WB response headers.
 * @returns Nest exception with immutable header metadata.
 */
function createMockHttpException(
  body: Readonly<Record<string, unknown>>,
  status: number,
  headers: Readonly<Record<string, string>>,
): HttpException {
  return Object.assign(new HttpException(body, status), {
    mockHeaders: Object.freeze({ ...headers }),
  });
}

/**
 * Floors an instant to its UTC calendar-day boundary.
 *
 * @param epochMs - Epoch milliseconds.
 * @returns UTC midnight epoch milliseconds.
 */
function startOfUtcDay(epochMs: number): number {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
