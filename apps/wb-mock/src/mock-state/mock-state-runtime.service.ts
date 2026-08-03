import { HttpException, UnauthorizedException } from '@nestjs/common';
import { CURRENT_ENDPOINT_PROFILE } from '@wb-bidder/contracts';
import type {
  MockRequestRecord,
  MockFaultRule,
  TimeAdvanceResult,
  MockRequestContext,
} from './mock-state.types.js';
import { createMockHttpException, startOfUtcDay } from './mock-state.helpers.js';
import { MockStateStoreBase } from './mock-state.store.js';

/** Cohesive mock-state capability layer. */
export class MockStateRuntimeBase extends MockStateStoreBase {
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
}
