import { describe, expect, it, vi } from 'vitest';

import { ObservabilityService } from '../../apps/bidder/src/observability.service.js';
import { CronSchedule } from '../../apps/bidder/src/scheduler/cron-schedule.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import type { AppConfiguration } from '@wb-bidder/config';
import type { DatabaseClient } from '@wb-bidder/database';

const configuration = {
  metricsEnabled: false,
  wb: { mode: 'mock' },
} as AppConfiguration;

describe('operational runbook drills', () => {
  it('fails readiness immediately on a database outage without touching WB', async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new ObservabilityService(
      { deploymentControl: { findFirst } } as unknown as DatabaseClient,
      configuration,
    );

    const snapshot = await service.readiness();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks).toContainEqual({
      detail: 'query failed',
      name: 'database',
      ok: false,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('uses only cached integration authorization during readiness', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'deployment-control' });
    const queryRaw = vi.fn();
    const service = new ObservabilityService(
      {
        $queryRaw: queryRaw,
        deploymentAccountBinding: { count: vi.fn().mockResolvedValue(1) },
        deploymentControl: { findFirst },
      } as unknown as DatabaseClient,
      configuration,
    );
    service.integrationSucceeded(new Date());

    const snapshot = await service.readiness();

    expect(snapshot.ready).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(snapshot.checks.map((check) => check.name)).toEqual([
      'configuration',
      'database',
      'account_binding',
      'integration',
    ]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('keeps the shutdown write gate closed and validates non-overlapping schedules', () => {
    const state = new RuntimeSafetyState();
    state.confirmAccountBinding();
    state.setCapacityAllowsWrites(true);
    state.setIntegrationAuthorized(true);
    expect(state.writeBlocker()).toBeNull();

    state.beginShutdown();
    state.setIntegrationAuthorized(true);
    expect(state.writeBlocker()).toBe('PROCESS_STOPPING');

    const currentState = new CronSchedule('5 */15 * * * *');
    expect(currentState.minimumIntervalMinutes(new Date('2026-07-29T00:00:00.000Z'))).toBe(15);
    expect(currentState.matches(new Date('2026-07-29T00:15:05.000Z'))).toBe(true);
    expect(currentState.matches(new Date('2026-07-29T00:15:06.000Z'))).toBe(false);
  });
});
