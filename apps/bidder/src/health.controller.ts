import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Registry } from 'prom-client';

import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';

/**
 * Stable health response shared by liveness and readiness endpoints.
 */
export interface HealthResponse {
  /** Machine-readable state. */
  readonly status: 'ok';
}

const METRICS_REGISTRY = new Registry();

/**
 * Exposes cheap liveness, startup readiness, and Prometheus endpoints.
 */
@ApiTags('observability')
@Controller()
export class HealthController {
  /**
   * Creates the observability controller.
   *
   * @param configuration - Validated startup configuration used for readiness.
   */
  public constructor(@Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration) {}

  /**
   * Confirms that the process and event loop can serve a request.
   *
   * @returns Cheap liveness state without external calls.
   */
  @ApiOperation({ summary: 'Process liveness' })
  @ApiOkResponse({ description: 'The process is alive.' })
  @Get('/health/live')
  public live(): HealthResponse {
    return { status: 'ok' };
  }

  /**
   * Confirms Stage 0 startup configuration validity.
   *
   * Database, migrations, account binding, and cached integration state are added by later tasks.
   *
   * @returns Readiness state without issuing a WB request.
   */
  @ApiOperation({ summary: 'Service readiness' })
  @ApiOkResponse({ description: 'Required startup invariants are valid.' })
  @Get('/health/ready')
  public ready(): HealthResponse {
    void this.configuration.accountCurrency;
    return { status: 'ok' };
  }

  /**
   * Returns bounded-cardinality Prometheus exposition text.
   *
   * @returns Promise resolving to the current registry in Prometheus text format.
   */
  @ApiOperation({ summary: 'Prometheus metrics' })
  @ApiOkResponse({ description: 'Prometheus text exposition.' })
  @Header('Content-Type', Registry.PROMETHEUS_CONTENT_TYPE)
  @Get('/metrics')
  public metrics(): Promise<string> {
    return METRICS_REGISTRY.metrics();
  }
}
