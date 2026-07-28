import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { MOCK_CONFIGURATION } from './mock-config.js';
import type { MockConfiguration } from '@wb-bidder/config';

/**
 * Lightweight mock status returned by the Stage 0 skeleton.
 */
export class MockStateResponse {
  /** Active deterministic seed. */
  @ApiProperty({ example: 'foundation', type: String })
  public readonly seed: string;

  /** Current virtual-clock instant. */
  @ApiProperty({
    example: '2026-07-28T00:00:00.000Z',
    format: 'date-time',
    type: String,
  })
  public readonly virtualTime: string;

  /**
   * Creates a visible state response from immutable mock configuration.
   *
   * @param configuration - Deterministic mock configuration.
   */
  public constructor(configuration: MockConfiguration) {
    this.seed = configuration.seed;
    this.virtualTime = configuration.initialTime;
  }
}

/**
 * Stage 0 control and health surface for the independent WB mock.
 */
@ApiTags('mock-control')
@Controller()
export class MockController {
  /**
   * Creates the mock controller.
   *
   * @param configuration - Virtual-clock configuration.
   */
  public constructor(
    @Inject(MOCK_CONFIGURATION) private readonly configuration: MockConfiguration,
  ) {}

  /**
   * Returns a cheap process liveness response.
   *
   * @returns Stable liveness state.
   */
  @ApiOperation({ summary: 'Mock process liveness' })
  @ApiOkResponse({ schema: { properties: { status: { example: 'ok', type: 'string' } } } })
  @Get('/health/live')
  public live(): Readonly<{ status: 'ok' }> {
    return { status: 'ok' };
  }

  /**
   * Exposes deterministic state without credentials or external data.
   *
   * @returns Current seed and virtual time.
   */
  @ApiOperation({ summary: 'Current deterministic mock state' })
  @ApiOkResponse({ type: MockStateResponse })
  @Get('/__mock/state')
  public state(): MockStateResponse {
    return new MockStateResponse(this.configuration);
  }
}
