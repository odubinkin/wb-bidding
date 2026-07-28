import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { MockStateService, type MockFaultRule } from './mock-state.service.js';
import type { TimeAdvanceResult } from './mock-state.service.js';

/**
 * Positive virtual duration request.
 */
export class TimeAdvanceRequestDto {
  /** Model days. */
  @ApiProperty({ default: 0, minimum: 0, type: Number })
  public readonly days: number = 0;

  /** Whether completed source dates should be materialized. */
  @ApiProperty({ default: true, type: Boolean })
  public readonly finalizeStatistics: boolean = true;

  /** Model hours. */
  @ApiProperty({ default: 0, maximum: 23, minimum: 0, type: Number })
  public readonly hours: number = 0;

  /** Model minutes. */
  @ApiProperty({ default: 0, maximum: 59, minimum: 0, type: Number })
  public readonly minutes: number = 0;
}

/**
 * Deterministic fault rule request.
 */
export class MockFaultRuleDto {
  /** WB endpoint key. */
  @ApiProperty({ example: 'cardWriteBids', type: String })
  public readonly endpointKey!: MockFaultRule['endpointKey'];

  /** Number of matching calls. */
  @ApiProperty({ example: 1, minimum: 1, type: Number })
  public readonly remaining!: number;

  /** Optional stricter token bucket. */
  @ApiProperty({
    example: { burst: 1, intervalMs: 1_000, requests: 1 },
    required: false,
    type: Object,
  })
  public readonly rateLimit?: MockFaultRule['rateLimit'];

  /** Optional deterministic rate-limit headers. */
  @ApiProperty({
    example: { 'x-ratelimit-retry': '3' },
    required: false,
    type: Object,
  })
  public readonly responseHeaders?: MockFaultRule['responseHeaders'];

  /** Optional injected HTTP status. */
  @ApiProperty({
    enum: [400, 401, 402, 403, 409, 413, 429, 500, 502, 503],
    required: false,
    type: Number,
  })
  public readonly status?: MockFaultRule['status'];

  /** Optional bid visibility delay. */
  @ApiProperty({ example: 90_000, minimum: 0, required: false, type: Number })
  public readonly visibilityDelayMs?: number;
}

/**
 * Fault collection request.
 */
export class MockFaultsRequestDto {
  /** Replacement fault rules. */
  @ApiProperty({ isArray: true, type: MockFaultRuleDto })
  public readonly rules!: readonly MockFaultRuleDto[];
}

/**
 * Deterministic mock control and health endpoints.
 */
@ApiTags('mock-control')
@Controller()
export class MockController {
  /**
   * Creates control endpoints over shared in-memory state.
   *
   * @param state - Deterministic state service.
   */
  public constructor(private readonly state: MockStateService) {}

  /**
   * Returns cheap process liveness.
   *
   * @returns Stable liveness status.
   */
  @ApiOperation({ summary: 'Mock process liveness' })
  @ApiOkResponse({ schema: { properties: { status: { example: 'ok', type: 'string' } } } })
  @Get('/health/live')
  public live(): Readonly<{ status: 'ok' }> {
    return { status: 'ok' };
  }

  /**
   * Returns current deterministic state.
   *
   * @returns State snapshot and checksum.
   */
  @ApiOperation({ summary: 'Current deterministic mock state' })
  @ApiOkResponse({ schema: { type: 'object' } })
  @Get('/__mock/state')
  public currentState(): Readonly<Record<string, unknown>> {
    return this.state.snapshot();
  }

  /**
   * Resets the active scenario.
   *
   * @returns Reset state snapshot.
   */
  @ApiOperation({ summary: 'Reset active seed, time, faults and journal' })
  @ApiOkResponse({ schema: { type: 'object' } })
  @Post('/__mock/reset')
  public reset(): Readonly<Record<string, unknown>> {
    return this.state.reset();
  }

  /**
   * Switches to a built-in scenario and resets state.
   *
   * @param scenario - Built-in deterministic scenario.
   * @returns New state snapshot.
   */
  @ApiOperation({ summary: 'Select deterministic seed scenario' })
  @ApiParam({
    enum: ['foundation', 'multi-day', 'partial-failure', 'delayed-visibility', 'ambiguous-write'],
    name: 'scenario',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  @Post('/__mock/seed/:scenario')
  public seed(@Param('scenario') scenario: string): Readonly<Record<string, unknown>> {
    return this.state.selectSeed(scenario);
  }

  /**
   * Replaces active deterministic fault rules.
   *
   * @param body - Synthetic-only fault rules.
   * @returns Active fault rules.
   */
  @ApiOperation({ summary: 'Inject bounded deterministic faults' })
  @ApiBody({ type: MockFaultsRequestDto })
  @ApiOkResponse({ type: MockFaultRuleDto, isArray: true })
  @Post('/__mock/faults')
  public faults(@Body() body: MockFaultsRequestDto): readonly MockFaultRule[] {
    return this.state.setFaults(body.rules.map(validateFaultRule));
  }

  /**
   * Advances virtual model time synchronously.
   *
   * @param body - Positive model duration and statistics flag.
   * @returns New time, touched source dates, and checksum.
   */
  @ApiOperation({ summary: 'Advance virtual time and finalize deterministic source dates' })
  @ApiBody({ type: TimeAdvanceRequestDto })
  @ApiOkResponse({ schema: { type: 'object' } })
  @Post('/__mock/time/advance')
  public advance(@Body() body: TimeAdvanceRequestDto): TimeAdvanceResult {
    return this.state.advanceTime(
      {
        days: body.days,
        hours: body.hours,
        minutes: body.minutes,
      },
      body.finalizeStatistics,
    );
  }

  /**
   * Returns full synthetic request/response pairs.
   *
   * @returns Request journal in processing order.
   */
  @ApiOperation({ summary: 'Get synthetic request/response journal' })
  @ApiOkResponse({ schema: { items: { type: 'object' }, type: 'array' } })
  @Get('/__mock/requests')
  public requests(): readonly unknown[] {
    return this.state.requests();
  }
}

/**
 * Validates one fault rule without accepting arbitrary endpoint/status values.
 *
 * @param value - DTO-shaped fault rule.
 * @returns Validated mutable fault rule.
 */
function validateFaultRule(value: MockFaultRuleDto): MockFaultRule {
  const statuses = [400, 401, 402, 403, 409, 413, 429, 500, 502, 503] as const;
  const allowedResponseHeaders = new Set([
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-retry',
  ]);
  if (
    !Number.isInteger(value.remaining) ||
    value.remaining < 1 ||
    (value.status !== undefined && !statuses.includes(value.status)) ||
    (value.status === undefined && value.rateLimit === undefined) ||
    (value.rateLimit !== undefined &&
      (!Number.isInteger(value.rateLimit.requests) ||
        value.rateLimit.requests < 1 ||
        !Number.isInteger(value.rateLimit.intervalMs) ||
        value.rateLimit.intervalMs < 1 ||
        !Number.isInteger(value.rateLimit.burst) ||
        value.rateLimit.burst < 1)) ||
    (value.responseHeaders !== undefined &&
      Object.entries(value.responseHeaders).some(
        ([name, headerValue]) =>
          !allowedResponseHeaders.has(name.toLowerCase()) ||
          typeof headerValue !== 'string' ||
          headerValue.length > 128,
      )) ||
    (value.visibilityDelayMs !== undefined &&
      (!Number.isInteger(value.visibilityDelayMs) || value.visibilityDelayMs < 0))
  ) {
    throw new Error('Invalid deterministic mock fault rule');
  }
  return {
    endpointKey: value.endpointKey,
    remaining: value.remaining,
    ...(value.rateLimit === undefined ? {} : { rateLimit: { ...value.rateLimit } }),
    ...(value.responseHeaders === undefined
      ? {}
      : { responseHeaders: { ...value.responseHeaders } }),
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.visibilityDelayMs === undefined
      ? {}
      : { visibilityDelayMs: value.visibilityDelayMs }),
  };
}
