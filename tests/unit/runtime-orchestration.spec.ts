import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeCoordinatorService } from '../../apps/bidder/src/runtime-coordinator.service.js';
import { SchedulerService } from '../../apps/bidder/src/scheduler.service.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import { WriteRuntimeService } from '../../apps/bidder/src/write-runtime.service.js';
import { loadConfiguration, type AppConfiguration } from '@wb-bidder/config';
import { validateWbToken } from '@wb-bidder/wb-api';

afterEach(() => {
  vi.useRealTimers();
});

describe('runtime bootstrap orchestration', () => {
  it('keeps every runtime gate closed when scheduler maintenance mode is selected', async () => {
    const configuration = runtimeConfiguration(false);
    const state = new RuntimeSafetyState();
    const dependencies = coordinatorDependencies();
    const coordinator = new RuntimeCoordinatorService(
      configuration,
      dependencies.database as never,
      validateWbToken('mock-test-token', 'mock'),
      dependencies.wbClient as never,
      dependencies.dataRepository as never,
      dependencies.decisionRepository as never,
      dependencies.writeRuntime as never,
      dependencies.scheduler as never,
      dependencies.observability as never,
      state,
      dependencies.clock as never,
    );

    await coordinator.onApplicationBootstrap();

    expect(state.writeBlocker()).toBe('ACCOUNT_BINDING_UNCONFIRMED');
    expect(dependencies.clock.refresh).not.toHaveBeenCalled();
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
  });

  it('fails before binding or scheduler startup when the remote seller identity drifts', async () => {
    const configuration = runtimeConfiguration(true);
    const state = new RuntimeSafetyState();
    const dependencies = coordinatorDependencies();
    dependencies.wbClient.getSellerInfo.mockResolvedValue({ sid: 'wrong-seller' });
    const coordinator = new RuntimeCoordinatorService(
      configuration,
      dependencies.database as never,
      validateWbToken('mock-test-token', 'mock'),
      dependencies.wbClient as never,
      dependencies.dataRepository as never,
      dependencies.decisionRepository as never,
      dependencies.writeRuntime as never,
      dependencies.scheduler as never,
      dependencies.observability as never,
      state,
      dependencies.clock as never,
    );

    await expect(coordinator.onApplicationBootstrap()).rejects.toThrow('ACCOUNT_IDENTITY_MISMATCH');
    expect(dependencies.dataRepository.ensureAccountBinding).not.toHaveBeenCalled();
    expect(dependencies.writeRuntime.recoverCrashWindows).not.toHaveBeenCalled();
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
  });

  it('binds, creates the safe policy, recovers crash windows, proves capacity, and starts in order', async () => {
    const configuration = runtimeConfiguration(true);
    const state = new RuntimeSafetyState();
    const dependencies = coordinatorDependencies();
    const coordinator = new RuntimeCoordinatorService(
      configuration,
      dependencies.database as never,
      validateWbToken('mock-test-token', 'mock'),
      dependencies.wbClient as never,
      dependencies.dataRepository as never,
      dependencies.decisionRepository as never,
      dependencies.writeRuntime as never,
      dependencies.scheduler as never,
      dependencies.observability as never,
      state,
      dependencies.clock as never,
    );

    await coordinator.onApplicationBootstrap();

    expect(dependencies.dataRepository.ensureAccountBinding).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'MOCK', tokenType: 'TEST' }),
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
    );
    expect(dependencies.decisionRepository.createPolicyVersion).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'SYSTEM', scope: 'DEPLOYMENT' }),
    );
    expect(dependencies.writeRuntime.recoverCrashWindows).toHaveBeenCalledTimes(1);
    expect(dependencies.scheduler.setCapacityRefresh).toHaveBeenCalledWith(expect.any(Function));
    expect(dependencies.scheduler.start).toHaveBeenCalledTimes(1);
    expect(state.writeBlocker()).toBeNull();
  });
});

describe('scheduler lifecycle orchestration', () => {
  it('registers the complete bounded job set once and releases owned leases on shutdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T08:00:01.000Z'));
    const configuration = runtimeConfiguration(true);
    const releaseLeases = vi.fn().mockResolvedValue(3);
    const productEconomicsImportUpdate = vi.fn().mockReturnValue(Promise.resolve({ count: 0 }));
    const manualJobUpdate = vi.fn().mockReturnValue(Promise.resolve({ count: 0 }));
    const transaction = vi.fn().mockResolvedValue([]);
    const scheduler = new SchedulerService(
      configuration,
      {
        $transaction: transaction,
        manualJob: { updateMany: manualJobUpdate },
        productEconomicsImport: { updateMany: productEconomicsImportUpdate },
      } as never,
      { synchronizeCurrentState: vi.fn(), synchronizeDataPage: vi.fn() } as never,
      { withSchedulerRun: vi.fn() } as never,
      { processNextEconomicsImport: vi.fn() } as never,
      { run: vi.fn() } as never,
      { run: vi.fn() } as never,
      {
        cleanupRetention: vi.fn(),
        executeOnce: vi.fn(),
        reconcileOnce: vi.fn(),
        releaseLeases,
      } as never,
      { ping: vi.fn() } as never,
      { snapshots: vi.fn().mockReturnValue({}) } as never,
      schedulerObservability() as never,
      new RuntimeSafetyState(),
      { refresh: vi.fn().mockResolvedValue(undefined) } as never,
    );

    scheduler.setCapacityRefresh(vi.fn().mockResolvedValue(undefined));
    scheduler.start();
    scheduler.start();

    const internals = scheduler as unknown as {
      readonly registrations: readonly unknown[];
      readonly timers: ReadonlySet<NodeJS.Timeout>;
    };
    expect(internals.registrations).toHaveLength(6);
    expect(internals.timers.size).toBe(6);
    expect(() => {
      scheduler.setCapacityRefresh(vi.fn());
    }).toThrow('Scheduler capacity refresh cannot change after startup');

    await scheduler.beforeApplicationShutdown('SIGTERM');

    expect(releaseLeases).toHaveBeenCalledTimes(1);
    expect(productEconomicsImportUpdate).toHaveBeenCalledTimes(1);
    expect(manualJobUpdate).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(internals.timers.size).toBe(0);
  });

  it('closes and reopens cached integration authorization without throwing scheduler work', async () => {
    const state = new RuntimeSafetyState();
    state.confirmAccountBinding();
    state.setCapacityAllowsWrites(true);
    const ping = vi
      .fn()
      .mockRejectedValueOnce(new Error('WB_DOWN'))
      .mockResolvedValueOnce(undefined);
    const observability = schedulerObservability();
    const scheduler = new SchedulerService(
      runtimeConfiguration(false),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { ping } as never,
      {
        snapshots: vi.fn().mockReturnValue({ promotion: { state: 'HALF_OPEN' } }),
      } as never,
      observability as never,
      state,
      {} as never,
    );

    await scheduler.runIntegrationCheck();
    expect(state.writeBlocker()).toBe('INTEGRATION_NOT_AUTHORIZED');
    expect(observability.integrationFailed).toHaveBeenCalledWith(expect.any(Date), 'WB_DOWN');

    await scheduler.runIntegrationCheck();
    expect(state.writeBlocker()).toBeNull();
    expect(observability.integrationSucceeded).toHaveBeenCalledWith(expect.any(Date));
    expect(observability.circuitBreakerState.set).toHaveBeenCalledWith({ group: 'promotion' }, 0.5);
  });
});

describe('write runtime wiring', () => {
  it('runs every endpoint worker, exposes recovery/retention, and releases every process lease', async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const recoverCrashWindows = vi.fn().mockResolvedValue({ prepared: 1, unknown: 2 });
    const cleanupTerminalAttempts = vi.fn().mockResolvedValue(4);
    const releaseWorkerLeases = vi.fn().mockResolvedValue(1);
    const executorAttempts = { inc: vi.fn() };
    const runtime = new WriteRuntimeService(
      runtimeConfiguration(false),
      {
        claim,
        cleanupTerminalAttempts,
        recoverCrashWindows,
        releaseWorkerLeases,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { executorAttempts, verification: { inc: vi.fn() } } as never,
    );

    await expect(runtime.executeOnce()).resolves.toBe(0);
    await expect(runtime.recoverCrashWindows()).resolves.toEqual({ prepared: 1, unknown: 2 });
    await expect(runtime.cleanupRetention()).resolves.toBe(4);
    await expect(runtime.releaseLeases()).resolves.toBe(3);

    expect(claim).toHaveBeenCalledTimes(3);
    expect(executorAttempts.inc).toHaveBeenCalledTimes(3);
    expect(cleanupTerminalAttempts).toHaveBeenCalledWith(
      runtimeConfiguration(false).writePipeline.attemptRetentionDays,
    );
    expect(releaseWorkerLeases).toHaveBeenCalledTimes(3);
  });

  it('reconciles card and cluster observations through the real classification boundary', async () => {
    const now = new Date();
    const work = [reconciliationEntry('CARD', 'card'), reconciliationEntry('CLUSTER', 'cluster')];
    const recordReconciliation = vi.fn().mockResolvedValue('APPLIED');
    const verification = { inc: vi.fn() };
    const runtime = new WriteRuntimeService(
      runtimeConfiguration(false),
      { loadReconciliationBatch: vi.fn().mockResolvedValue(work), recordReconciliation } as never,
      { readLiveState: vi.fn().mockResolvedValue(liveState(now)) } as never,
      { readLiveState: vi.fn().mockResolvedValue(liveState(now)) } as never,
      { validate: vi.fn().mockResolvedValue({ valid: true }) } as never,
      { executorAttempts: { inc: vi.fn() }, verification } as never,
    );

    await expect(runtime.reconcileOnce()).resolves.toBe(2);
    expect(recordReconciliation).toHaveBeenCalledTimes(2);
    expect(verification.inc).toHaveBeenNthCalledWith(1, { result: 'APPLIED' });
    expect(verification.inc).toHaveBeenNthCalledWith(2, { result: 'APPLIED' });
  });

  it('classifies visibility-delay and read failures without aborting the reconciliation page', async () => {
    const work = [reconciliationEntry('CARD', 'card'), reconciliationEntry('CLUSTER', 'cluster')];
    const verification = { inc: vi.fn() };
    const runtime = new WriteRuntimeService(
      runtimeConfiguration(false),
      { loadReconciliationBatch: vi.fn().mockResolvedValue(work) } as never,
      {
        readLiveState: vi
          .fn()
          .mockRejectedValue(new Error('RECONCILIATION_VISIBILITY_DELAY_ACTIVE')),
      } as never,
      { readLiveState: vi.fn().mockRejectedValue(new Error('WB_DOWN')) } as never,
      {} as never,
      { executorAttempts: { inc: vi.fn() }, verification } as never,
    );

    await expect(runtime.reconcileOnce()).resolves.toBe(2);
    expect(verification.inc).toHaveBeenNthCalledWith(1, { result: 'visibility_delay' });
    expect(verification.inc).toHaveBeenNthCalledWith(2, { result: 'read_error' });
  });
});

function runtimeConfiguration(schedulerEnabled: boolean): AppConfiguration {
  return loadConfiguration({
    ACCOUNT_CURRENCY: 'RUB',
    ACCOUNT_TIMEZONE: 'Europe/Moscow',
    ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    METRICS_ENABLED: 'false',
    SCHEDULER_ENABLED: String(schedulerEnabled),
    WB_API_MOCK_BASE_URL: 'http://127.0.0.1:3001',
    WB_API_MODE: 'mock',
    WB_API_TOKEN: 'mock-test-token',
    WB_API_WRITE_ENABLED: 'true',
    WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
    WB_EXPECTED_TOKEN_TYPE: 'TEST',
  });
}

function coordinatorDependencies() {
  return {
    clock: { refresh: vi.fn().mockResolvedValue(undefined) },
    dataRepository: { ensureAccountBinding: vi.fn().mockResolvedValue(undefined) },
    database: {
      biddingPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
      campaign: { count: vi.fn().mockResolvedValue(0) },
    },
    decisionRepository: { createPolicyVersion: vi.fn().mockResolvedValue({}) },
    observability: {
      integrationSucceeded: vi.fn(),
      syncFullPassEta: { set: vi.fn() },
      syncSlaViolations: { inc: vi.fn() },
    },
    scheduler: { setCapacityRefresh: vi.fn(), start: vi.fn() },
    wbClient: {
      getSellerInfo: vi.fn().mockResolvedValue({ sid: '00000000-0000-4000-8000-000000000001' }),
    },
    writeRuntime: {
      recoverCrashWindows: vi.fn().mockResolvedValue({ prepared: 0, unknown: 0 }),
    },
  };
}

function schedulerObservability() {
  return {
    circuitBreakerState: { set: vi.fn() },
    integrationFailed: vi.fn(),
    integrationSucceeded: vi.fn(),
    schedulerDuration: { observe: vi.fn() },
    schedulerRuns: { inc: vi.fn() },
    syncCampaigns: { inc: vi.fn() },
  };
}

function reconciliationEntry(targetKind: 'CARD' | 'CLUSTER', suffix: string) {
  return {
    attemptItemId: `attempt-${suffix}`,
    decisionId: `decision-${suffix}`,
    desired: { bidMinor: 200n, explicit: true },
    item: { targetId: `target-${suffix}`, targetKind },
    oldState: { bidMinor: 100n, explicit: true },
  };
}

function liveState(observedAt: Date) {
  return {
    bidMinor: 200n,
    explicit: true,
    observedAt,
    sourceMarker: 'runtime-test',
  };
}
