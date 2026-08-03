import {
  type clusterBidsResponseSchema,
  type CardWriteBids,
  type ClusterWriteRequest,
} from '../schemas.js';
import { type CircuitBreakerRegistry, type RetryPolicy } from '../resilience.js';
import type { WbRateLimiter } from '../rate-limiter.js';
import type { EndpointKey } from '@wb-bidder/contracts';
import type { z } from 'zod';

/**
 * Fetch-compatible transport boundary.
 */
export type WbFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Bounded telemetry emitted once for every admitted WB request.
 */
export interface WbRequestObservation {
  /** Endpoint registry key. */
  readonly endpointKey: EndpointKey;
  /** Total transport/application latency in milliseconds. */
  readonly latencyMs: number;
  /** Time spent waiting for distributed quota admission. */
  readonly limiterWaitMs: number;
  /** Stable outcome class without payload or credential data. */
  readonly outcome: 'error' | 'success';
  /** HTTP status when a response was received. */
  readonly status: number | null;
}

/**
 * Immutable WB client configuration.
 */
export interface WbClientConfiguration {
  /** Promotion API origin selected by mode. */
  readonly baseUrl: URL;
  /** Circuit breakers shared across calls. */
  readonly breakers: CircuitBreakerRegistry;
  /** Common API origin used only for seller identity. */
  readonly commonBaseUrl: URL;
  /** Contract contour; verified-mock is accepted only for a loopback/local mock origin. */
  readonly contractMode?: 'production' | 'verified-mock';
  /** HTTP transport. */
  readonly fetch: WbFetch;
  /** Maximum simultaneous requests. */
  readonly maxInFlight: number;
  /** Optional bounded telemetry sink. */
  readonly observeRequest?: (observation: WbRequestObservation) => void;
  /** Read/verify retry policy. */
  readonly readRetryPolicy: RetryPolicy;
  /** Shared two-level account limiter. */
  readonly rateLimiter: WbRateLimiter;
  /** Per-attempt timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Secret authorization value retained only at transport boundary. */
  readonly token: string;
  /** Effective integration write gate. */
  readonly writesEnabled: boolean;
}

/**
 * One already-admitted card-write slot. A reservation is single-use and must be released.
 */
export interface ReservedCardBidWrite {
  dispatch(request: CardWriteBids): Promise<CardWriteBids>;
  release(): void;
}

/**
 * One admitted cluster write/delete slot. The reservation is single-use.
 */
export interface ReservedClusterBidWrite {
  dispatch(request: ClusterWriteRequest): Promise<z.infer<typeof clusterBidsResponseSchema>>;
  release(): void;
}

/**
 * Validated WB API adapter with exact current paths and fail-closed write gates.
 */
