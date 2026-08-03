import { type EndpointKey } from '@wb-bidder/contracts';
import { type CardWriteBids } from '@wb-bidder/wb-api';

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
export interface MockCampaign {
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
export interface PendingCardWrite {
  /** Requested wire payload. */
  readonly payload: CardWriteBids;
  /** Virtual time at which reads expose it. */
  readonly visibleAtMs: number;
}
