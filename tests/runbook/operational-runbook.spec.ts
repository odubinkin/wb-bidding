import { describe, expect, it, vi } from 'vitest';

import { ObservabilityService } from '../../apps/bidder/src/observability.service.js';
import { CronSchedule } from '../../apps/bidder/src/scheduler.service.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import type { AppConfiguration } from '@wb-bidder/config';
import type { DatabaseClient } from '@wb-bidder/database';

const configuration = {
  metricsEnabled: false,
  wb: { mode: 'mock' },
} as AppConfiguration;

describe('operational runbook drills', () => {
  it('fails readiness immediately on a database outage without touching WB', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new ObservabilityService(
      { $queryRaw: queryRaw } as unknown as DatabaseClient,
      configuration,
    );

    const snapshot = await service.readiness();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks).toContainEqual({
      detail: 'query failed',
      name: 'database',
      ok: false,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('uses only cached integration authorization during readiness', async () => {
    const requiredMigrations = [
      '202607281330_initial',
      '202607281410_stage1_rate_limiter',
      '202607281500_stage2_sync_evidence',
      '202607281600_stage3_decision_engine',
      '202607281700_stage4_write_pipeline',
      '202607291000_stage5_production_runtime',
      '202607291200_stage5_cluster_contract',
    ];
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce(requiredMigrations.map((migration_name) => ({ migration_name })));
    const service = new ObservabilityService(
      {
        $queryRaw: queryRaw,
        deploymentAccountBinding: { count: vi.fn().mockResolvedValue(1) },
      } as unknown as DatabaseClient,
      configuration,
    );
    service.integrationSucceeded(new Date());

    const snapshot = await service.readiness();

    expect(snapshot.ready).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(2);
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
