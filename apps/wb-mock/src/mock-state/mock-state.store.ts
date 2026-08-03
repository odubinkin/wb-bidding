import { createHash } from 'node:crypto';
import type { MockConfiguration } from '@wb-bidder/config';
import type {
  MockRequestRecord,
  MockFaultRule,
  MockCampaign,
  PendingCardWrite,
} from './mock-state.types.js';
import { clusterKey } from './mock-state.helpers.js';

/** Cohesive mock-state capability layer. */
export class MockStateStoreBase {
  protected campaigns = new Map<number, MockCampaign>();
  protected clusterBids = new Map<string, number>();
  protected dailyDates = new Set<string>();
  protected faults: MockFaultRule[] = [];
  protected initialTimeMs: number;
  protected journal: MockRequestRecord[] = [];
  protected pendingCardWrites: PendingCardWrite[] = [];
  protected sequence = 0;
  protected virtualTimeMs: number;
  protected activeSeed: string;
  protected rateBuckets = new Map<string, { lastRefillAtMs: number; tokens: number }>();

  /**
   * Creates initial deterministic state from application configuration.
   *
   * @param configuration - Seed and virtual initial time.
   */
  protected constructor(configuration: MockConfiguration) {
    this.initialTimeMs = Date.parse(configuration.initialTime);
    this.virtualTimeMs = this.initialTimeMs;
    this.activeSeed = configuration.seed;
    this.seed(configuration.seed);
  }

  /**
   * Seeds all mutable state from one built-in scenario.
   *
   * @param scenario - Scenario identifier.
   * @returns Nothing.
   */
  protected seed(scenario: string): void {
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
    this.clusterBids = new Map([[clusterKey(10_001, 20_001, 'synthetic cluster one'), 700]]);
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
  protected applyVisibleWrites(): void {
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
  protected statisticDay(
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
  protected nowIso(): string {
    return new Date(this.virtualTimeMs).toISOString();
  }

  /**
   * Computes canonical-enough checksum over sorted deterministic state.
   *
   * @returns SHA-256 hex.
   */
  protected checksum(): string {
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
