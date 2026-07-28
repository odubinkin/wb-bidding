import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Registry } from 'prom-client';

import { ObservabilityService, type ReadinessCheck } from './observability.service.js';

/**
 * Stable health response shared by liveness and readiness endpoints.
 */
export interface HealthResponse {
  /** Machine-readable state. */
  readonly status: 'ok';
}

/**
 * Readiness response containing only bounded, non-secret diagnostics.
 */
export interface ReadyResponse {
  /** Individual readiness checks. */
  readonly checks: readonly ReadinessCheck[];
  /** Machine-readable state. */
  readonly status: 'ok';
}

/**
 * Exposes cheap liveness, startup readiness, and Prometheus endpoints.
 */
@ApiTags('observability')
@Controller()
export class HealthController {
  /**
   * Creates the observability controller.
   *
   * @param observability - Cached health and metrics service.
   */
  public constructor(private readonly observability: ObservabilityService) {}

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
   * Confirms database, migrations, account binding, configuration, and cached WB integration.
   *
   * @returns Readiness state without issuing a WB request.
   * @throws {ServiceUnavailableException} When any required readiness invariant is false.
   */
  @ApiOperation({ summary: 'Service readiness' })
  @ApiOkResponse({ description: 'Required startup invariants are valid.' })
  @ApiResponse({ description: 'One or more required invariants failed.', status: 503 })
  @Get('/health/ready')
  public async ready(): Promise<ReadyResponse> {
    const snapshot = await this.observability.readiness();
    if (!snapshot.ready) {
      throw new ServiceUnavailableException({
        checks: snapshot.checks,
        status: 'error',
      });
    }
    return { checks: snapshot.checks, status: 'ok' };
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
    return this.observability.metricsText();
  }
}
