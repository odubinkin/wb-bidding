import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIGURATION } from './application-config.js';
import type { AppConfiguration } from '@wb-bidder/config';

/**
 * Shared model clock.
 *
 * Production and sandbox always use wall time. Mock mode refreshes the deterministic virtual
 * instant from the mock control plane before scheduler work, so multi-day scenarios do not depend
 * on wall-clock passage.
 */
@Injectable()
export class RuntimeClockService {
  private mockInstant: Date | null = null;

  /**
   * Creates the environment-aware clock.
   *
   * @param configuration - Validated runtime mode and mock base URL.
   */
  public constructor(@Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration) {}

  /**
   * Returns a fresh immutable model instant.
   *
   * @returns Wall time outside mock mode, otherwise the last refreshed mock time.
   * @throws {Error} When mock work starts before a successful clock refresh.
   */
  public now(): Date {
    if (this.configuration.wb.mode !== 'mock') return new Date();
    if (this.mockInstant === null) throw new Error('MOCK_CLOCK_NOT_SYNCHRONIZED');
    return new Date(this.mockInstant);
  }

  /**
   * Refreshes virtual time through the mock-only control endpoint.
   *
   * @returns Current model instant.
   * @throws {Error} When the control response is unavailable or malformed.
   */
  public async refresh(): Promise<Date> {
    if (this.configuration.wb.mode !== 'mock') return new Date();
    const url = new URL('/__mock/state', this.configuration.wb.baseUrl);
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(this.configuration.wb.timeoutMs),
    });
    if (!response.ok) throw new Error('MOCK_CLOCK_REFRESH_FAILED');
    const source: unknown = await response.json();
    if (
      typeof source !== 'object' ||
      source === null ||
      !('virtualTime' in source) ||
      typeof source.virtualTime !== 'string'
    ) {
      throw new Error('MOCK_CLOCK_RESPONSE_INVALID');
    }
    const instant = new Date(source.virtualTime);
    if (!Number.isFinite(instant.getTime())) throw new Error('MOCK_CLOCK_RESPONSE_INVALID');
    this.mockInstant = instant;
    return new Date(instant);
  }
}
