import { endpointDefinition, type WbEndpointDefinition } from '../endpoint-registry.js';
import {
  WbApiError,
  classifyHttpFailure,
  withBoundedRetry,
  type CircuitBreaker,
} from '../resilience.js';
import type { EndpointKey } from '@wb-bidder/contracts';
import type { z } from 'zod';
import { WbTransportError } from '../transport.js';
import type { WbRequestObservation, WbClientConfiguration } from './types.js';
import {
  Semaphore,
  assertSafeOrigin,
  isVerifiedMockOrigin,
  assertRequestDestination,
} from './helpers.js';

/** Cohesive WB API client capability layer. */
export class WbApiClientCore {
  protected readonly semaphore: Semaphore;

  /**
   * Creates an adapter without performing network I/O.
   *
   * @param configuration - Fully validated transport and safety dependencies.
   */
  public constructor(protected readonly configuration: WbClientConfiguration) {
    assertSafeOrigin(configuration.baseUrl, false);
    assertSafeOrigin(configuration.commonBaseUrl, true);
    if (
      configuration.contractMode === 'verified-mock' &&
      !isVerifiedMockOrigin(configuration.baseUrl)
    ) {
      throw new Error('Verified mock contract requires a loopback or wb-mock HTTP origin');
    }
    this.semaphore = new Semaphore(configuration.maxInFlight);
  }

  /**
   * Executes one bounded read/verify request.
   *
   * @template T - Validated response.
   * @param endpointKey - Endpoint registry key.
   * @param schema - Runtime response schema.
   * @param query - Optional query.
   * @param body - Optional already validated body.
   * @param allowUnverifiedRead - Explicit observational-only contract opt-in.
   * @returns Validated response.
   */
  protected async read<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    query?: URLSearchParams,
    body?: unknown,
    allowUnverifiedRead = false,
  ): Promise<T> {
    return withBoundedRetry(
      async () => this.request(endpointKey, schema, query, body, false, allowUnverifiedRead),
      this.configuration.readRetryPolicy,
    );
  }

  /**
   * Executes one non-blindly-retried write request.
   *
   * @template T - Validated response.
   * @param endpointKey - Write endpoint.
   * @param schema - Runtime response schema.
   * @param body - Validated body.
   * @returns Validated response.
   */
  protected async write<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    body: unknown,
  ): Promise<T> {
    return this.request(endpointKey, schema, undefined, body, true, false);
  }

  /**
   * Performs one transport request under limiter, semaphore, host, redirect and breaker gates.
   *
   * @template T - Validated response.
   * @param endpointKey - Endpoint registry key.
   * @param schema - Runtime response schema.
   * @param query - Optional query.
   * @param body - Optional validated body.
   * @param write - Whether dispatch can mutate remote state.
   * @param allowUnverifiedRead - Explicit observational access.
   * @param admittedLimiterWaitMs - Limiter wait when admission was reserved by the caller.
   * @returns Validated response.
   */
  protected async request<T>(
    endpointKey: EndpointKey,
    schema: z.ZodType<T>,
    query: URLSearchParams | undefined,
    body: unknown,
    write: boolean,
    allowUnverifiedRead: boolean,
    admittedLimiterWaitMs?: number,
  ): Promise<T> {
    const { breaker, definition } = this.assertOperationAllowed(
      endpointKey,
      write,
      allowUnverifiedRead,
    );
    const limiterWaitMs =
      admittedLimiterWaitMs ?? (await this.configuration.rateLimiter.acquire(endpointKey));
    const release =
      admittedLimiterWaitMs === undefined ? await this.semaphore.acquire() : undefined;
    const startedAt = performance.now();
    let observedStatus: number | null = null;
    let outcome: WbRequestObservation['outcome'] = 'error';
    try {
      const baseUrl =
        endpointKey === 'sellerInfo'
          ? this.configuration.commonBaseUrl
          : this.configuration.baseUrl;
      const url = new URL(definition.path, baseUrl);
      if (query !== undefined) {
        url.search = query.toString();
      }
      assertRequestDestination(url, baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort(new Error('WB request timeout'));
      }, this.configuration.timeoutMs);
      let response: Response;
      try {
        response = await this.configuration.fetch(url, {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            Accept: 'application/json',
            Authorization: this.configuration.token,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          method: definition.method,
          redirect: 'manual',
          signal: controller.signal,
        });
        observedStatus = response.status;
      } catch (cause: unknown) {
        const provenPreByte = cause instanceof WbTransportError && cause.beforeBytes;
        const error =
          !write || provenPreByte
            ? new WbApiError(
                'TRANSPORT_PRE_BYTE',
                write ? 'WB write transport failed before connection' : 'WB read transport failed',
                null,
                true,
              )
            : new WbApiError(
                'WRITE_OUTCOME_UNKNOWN',
                'WB write transport failed after dispatch boundary',
                null,
                false,
              );
        breaker.recordFailure(error);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (response.status >= 300 && response.status < 400) {
        const error = new WbApiError(
          'CONTRACT',
          'WB redirect is forbidden',
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      await this.configuration.rateLimiter.observe(endpointKey, response.headers);
      const text = await response.text();
      if (!response.ok) {
        const error = classifyHttpFailure(
          response.status,
          write ? 'write' : 'read',
          write,
          text.slice(0, 1_024),
        );
        breaker.recordFailure(error);
        throw error;
      }
      let payload: unknown;
      try {
        payload = text === '' ? {} : JSON.parse(text);
      } catch {
        const error = new WbApiError(
          'CONTRACT',
          'WB returned non-JSON success payload',
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const error = new WbApiError(
          'CONTRACT',
          `WB response schema mismatch for ${endpointKey}`,
          response.status,
          false,
        );
        breaker.recordFailure(error);
        throw error;
      }
      breaker.recordSuccess();
      outcome = 'success';
      return parsed.data;
    } finally {
      release?.();
      this.configuration.observeRequest?.(
        Object.freeze({
          endpointKey,
          latencyMs: Math.max(0, performance.now() - startedAt),
          limiterWaitMs,
          outcome,
          status: observedStatus,
        }),
      );
    }
  }

  /**
   * Validates endpoint contract, operation kind, write gate, and circuit state.
   *
   * @param endpointKey - Endpoint registry key.
   * @param write - Whether the requested operation mutates WB state.
   * @param allowUnverifiedRead - Whether an observational unverified read is explicitly allowed.
   * @returns Validated endpoint and its breaker.
   */
  protected assertOperationAllowed(
    endpointKey: EndpointKey,
    write: boolean,
    allowUnverifiedRead: boolean,
  ): { readonly breaker: CircuitBreaker; readonly definition: WbEndpointDefinition } {
    const definition = endpointDefinition(endpointKey);
    const verifiedByMockProfile =
      this.configuration.contractMode === 'verified-mock' &&
      (endpointKey === 'clusterCurrentBids' ||
        endpointKey === 'clusterWriteBids' ||
        endpointKey === 'clusterDeleteBids');
    if (
      definition.status !== 'VERIFIED' &&
      !verifiedByMockProfile &&
      !(allowUnverifiedRead && !definition.isWrite)
    ) {
      throw new WbApiError(
        'CONTRACT',
        `WB endpoint contract is ${definition.status}: ${endpointKey}`,
        null,
        false,
      );
    }
    if (write !== definition.isWrite) {
      throw new WbApiError(
        'CONTRACT',
        'Adapter operation kind does not match endpoint',
        null,
        false,
      );
    }
    if (write && !this.configuration.writesEnabled) {
      throw new WbApiError('CAPABILITY', 'WB write gate is closed', null, false);
    }
    const breaker = this.configuration.breakers.forGroup(definition.group);
    breaker.assertRequestAllowed();
    return { breaker, definition };
  }
}
