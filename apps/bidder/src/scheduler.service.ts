import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import type { Pool } from 'pg';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_POOL } from './database.js';
import { DecisionJobService } from './decision-job.service.js';
import { ExperimentRuntimeService } from './experiment-runtime.service.js';
import { claimManualJob } from './manual-job-lease.js';
import { ObservabilityService } from './observability.service.js';
import {
  DATA_SYNC_REPOSITORY,
  DATA_SYNC_WORKER,
  DECISION_REPOSITORY,
  WB_API_CLIENT,
  WB_BREAKERS,
} from './runtime.providers.js';
import { RuntimeSafetyState } from './runtime-state.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import { PROCESS_WORKER_IDENTITY, releaseOwnedSchedulerLeases } from './worker-identity.js';
import { WriteRuntimeService } from './write-runtime.service.js';
import type { AppConfiguration } from '@wb-bidder/config';
import {
  DataSyncRepository,
  WbDataSyncWorker,
  type SchedulerRunContext,
  type SyncDataKind,
} from '@wb-bidder/data-sync';
import { DecisionRepository } from '@wb-bidder/decision-engine';
import { CircuitBreakerRegistry, WbApiClient } from '@wb-bidder/wb-api';

const SHUTDOWN_GRACE_MS = 30_000;
const SECOND_MS = 1_000;

/**
 * One registered cron callback.
 */
interface CronRegistration {
  /** Parsed six-field cron. */
  readonly schedule: CronSchedule;
  /** Stable scheduler job label. */
  readonly name: string;
  /** Non-overlapping callback. */
  readonly run: () => Promise<void>;
}

/**
 * Six-field cron schedule supporting lists, ranges, and positive steps.
 */
export class CronSchedule {
  private readonly fields: readonly Set<number>[];
  private readonly dayOfMonthWildcard: boolean;
  private readonly dayOfWeekWildcard: boolean;

  /**
   * Parses a six-field cron expression.
   *
   * @param expression - Seconds through day-of-week cron fields.
   * @throws {Error} When syntax or a value is invalid.
   */
  public constructor(expression: string) {
    const parts = expression.trim().split(/\s+/u);
    if (parts.length !== 6) throw new Error('Cron expression must contain six fields');
    const ranges = [
      [0, 59],
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ] as const;
    this.fields = Object.freeze(
      parts.map((part, index) => {
        const range = ranges[index];
        if (range === undefined) throw new Error('Cron field range missing');
        return parseCronField(part, range[0], range[1]);
      }),
    );
    this.dayOfMonthWildcard = parts[3] === '*';
    this.dayOfWeekWildcard = parts[5] === '*';
  }

  /**
   * Tests a UTC instant against the cron expression.
   *
   * @param instant - Tick instant.
   * @returns Whether the callback is due.
   */
  public matches(instant: Date): boolean {
    const values = [
      instant.getUTCSeconds(),
      instant.getUTCMinutes(),
      instant.getUTCHours(),
      instant.getUTCDate(),
      instant.getUTCMonth() + 1,
      instant.getUTCDay(),
    ];
    const baseMatches = values
      .slice(0, 3)
      .every((value, index) => this.fields[index]?.has(value) === true);
    const monthMatches = this.fields[4]?.has(values[4] ?? -1) === true;
    const domMatches = this.fields[3]?.has(values[3] ?? -1) === true;
    const dowMatches = this.fields[5]?.has(values[5] ?? -1) === true;
    const dayMatches =
      this.dayOfMonthWildcard || this.dayOfWeekWildcard
        ? domMatches && dowMatches
        : domMatches || dowMatches;
    return baseMatches && monthMatches && dayMatches;
  }

  /**
   * Computes a bounded minimum interval for startup capacity checks.
   *
   * @param from - Search origin.
   * @returns Minimum interval in minutes across the next eight matches.
   */
  public minimumIntervalMinutes(from: Date = new Date()): number {
    const matches: number[] = [];
    const start = Math.floor(from.getTime() / SECOND_MS) * SECOND_MS;
    const firstMinute = Math.floor(start / 60_000) * 60_000;
    const limit = start + 400 * 86_400_000;
    const seconds = [...(this.fields[0] ?? [])].sort((left, right) => left - right);
    for (let minute = firstMinute; minute <= limit && matches.length < 8; minute += 60_000) {
      for (const second of seconds) {
        const value = minute + second * SECOND_MS;
        if (value < start || value > limit) continue;
        if (this.matches(new Date(value))) matches.push(value);
        if (matches.length === 8) break;
      }
    }
    if (matches.length < 2) throw new Error('Cron interval cannot be proven within 400 days');
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 1; index < matches.length; index += 1) {
      const current = matches[index];
      const previous = matches[index - 1];
      if (current === undefined || previous === undefined) {
        throw new Error('Cron match sequence is incomplete');
      }
      minimum = Math.min(minimum, (current - previous) / 60_000);
    }
    return minimum;
  }
}

/**
 * Permanent scheduler registering independent non-backlogging jobs.
 */
@Injectable()
export class SchedulerService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly registrations: CronRegistration[] = [];
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly inFlight = new Set<Promise<void>>();
  private capacityRefresh: (() => Promise<void>) | null = null;
  private lastCronSecond = -1;
  private started = false;

  /**
   * Creates the scheduler and all job dependencies.
   *
   * @param configuration - Independent schedules and intervals.
   * @param pool - Shared database pool.
   * @param dataWorker - Current/slow synchronization worker.
   * @param dataRepository - Cross-replica scheduler lock persistence.
   * @param decisionRepository - Economics import worker.
   * @param decisionJob - Database-only calculation worker.
   * @param experiments - Durable lower-only experiment lifecycle.
   * @param writeRuntime - Write/reconciliation/retention workers.
   * @param wbClient - Quota-aware integration client.
   * @param breakers - Shared breaker registry.
   * @param observability - Metrics and cached integration health.
   * @param runtimeState - Process safety gates.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(DATA_SYNC_WORKER) private readonly dataWorker: WbDataSyncWorker,
    @Inject(DATA_SYNC_REPOSITORY) private readonly dataRepository: DataSyncRepository,
    @Inject(DECISION_REPOSITORY) private readonly decisionRepository: DecisionRepository,
    private readonly decisionJob: DecisionJobService,
    private readonly experiments: ExperimentRuntimeService,
    private readonly writeRuntime: WriteRuntimeService,
    @Inject(WB_API_CLIENT) private readonly wbClient: WbApiClient,
    @Inject(WB_BREAKERS) private readonly breakers: CircuitBreakerRegistry,
    private readonly observability: ObservabilityService,
    private readonly runtimeState: RuntimeSafetyState,
    private readonly clock: RuntimeClockService,
  ) {}

  /**
   * Registers jobs and begins cron/interval ticking exactly once.
   *
   * @returns Nothing.
   */
  public start(): void {
    if (this.started || !this.configuration.schedulerEnabled) return;
    this.started = true;
    this.registerCron('current_state_sync', this.configuration.sync.currentStateCron, async () => {
      const result = await this.dataWorker.synchronizeCurrentState();
      if (result.started) {
        this.observability.syncCampaigns.inc(
          { status: 'succeeded' },
          result.counters?.campaigns ?? 0,
        );
        await this.refreshCapacity();
      }
    });
    this.registerCron('data_sync', this.configuration.sync.dataCron, async () => {
      const result = await this.dataWorker.synchronizeDataPage();
      if (result.started) {
        this.observability.syncCampaigns.inc(
          { status: 'succeeded' },
          result.counters?.campaigns ?? 0,
        );
        await this.refreshCapacity();
      }
    });
    this.registerCron('decision', this.configuration.writePipeline.decisionCron, async () => {
      await this.runLocked('DECISION', 10 * 60_000, ({ signal }) => this.decisionJob.run(signal));
    });
    this.registerCron(
      'campaign_apply',
      this.configuration.writePipeline.campaignApplyCron,
      async () => {
        await this.runLocked('CAMPAIGN_APPLY', 9_000, () => this.writeRuntime.executeOnce());
      },
    );
    this.registerCron(
      'reconciliation',
      this.configuration.writePipeline.reconciliationCron,
      async () => {
        await this.runLocked('RECONCILIATION', 55_000, () => this.writeRuntime.reconcileOnce());
        await this.writeRuntime.recoverCrashWindows();
      },
    );
    this.registerCron('retention', '0 17 3 * * *', async () => {
      await this.runLocked('RETENTION', 5 * 60_000, () => this.writeRuntime.cleanupRetention());
    });
    this.addInterval(
      'verification',
      this.configuration.writePipeline.verificationPollIntervalMs,
      async () => {
        await this.runLocked(
          'VERIFICATION',
          Math.max(1_000, this.configuration.writePipeline.verificationPollIntervalMs - 100),
          () => this.writeRuntime.reconcileOnce(),
        );
      },
    );
    this.addInterval('integration_check', 15_000, () => this.runIntegrationCheck());
    this.addInterval('economics_import', 1_000, async () => {
      await this.runLocked('ECONOMICS_IMPORT', 60_000, () =>
        this.decisionRepository.processNextEconomicsImport(this.workerId('economics-import')),
      );
    });
    this.addInterval('experiment_lifecycle', 1_000, async () => {
      await this.runLocked('EXPERIMENT_LIFECYCLE', 60_000, () => this.experiments.run());
    });
    this.addInterval('manual_jobs', 1_000, () => this.processManualJob());
    const cronTimer = setInterval(() => {
      this.tickCron();
    }, 250);
    cronTimer.unref();
    this.timers.add(cronTimer);
    this.tickCron();
  }

  /**
   * Registers the authoritative campaign-scope capacity refresh before scheduler startup.
   *
   * @param refresh - Callback that can only close or reopen the calculated capacity gate.
   * @returns Nothing.
   * @throws {Error} When changed after jobs have started.
   */
  public setCapacityRefresh(refresh: () => Promise<void>): void {
    if (this.started) throw new Error('Scheduler capacity refresh cannot change after startup');
    this.capacityRefresh = refresh;
  }

  /**
   * Stops new work, waits for in-flight jobs, and releases undispatched leases.
   *
   * @param signal - Shutdown signal, when supplied by Nest.
   * @returns Promise resolving after bounded graceful cleanup.
   */
  public async beforeApplicationShutdown(signal?: string): Promise<void> {
    void signal;
    this.runtimeState.beginShutdown();
    if (!this.started) return;
    for (const timer of this.timers) clearInterval(timer);
    this.timers.clear();
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SHUTDOWN_GRACE_MS);
      }),
    ]);
    await this.writeRuntime.releaseLeases();
    await releaseOwnedSchedulerLeases(this.pool, PROCESS_WORKER_IDENTITY);
  }

  /**
   * Performs a cached, quota-aware integration check.
   *
   * @returns Nothing after cached readiness and breaker metrics update.
   */
  public async runIntegrationCheck(): Promise<void> {
    const now = new Date();
    try {
      await this.wbClient.ping();
      this.observability.integrationSucceeded(now);
      this.runtimeState.setIntegrationAuthorized(true);
    } catch (error: unknown) {
      this.observability.integrationFailed(now, safeErrorCode(error));
      this.runtimeState.setIntegrationAuthorized(false);
    }
    for (const [group, snapshot] of Object.entries(this.breakers.snapshots())) {
      this.observability.circuitBreakerState.set(
        { group },
        snapshot.state === 'CLOSED' ? 0 : snapshot.state === 'HALF_OPEN' ? 0.5 : 1,
      );
    }
  }

  /**
   * Registers one validated cron expression.
   *
   * @param name - Stable job label.
   * @param expression - Six-field UTC cron.
   * @param run - Callback.
   * @returns Nothing.
   */
  private registerCron(name: string, expression: string, run: () => Promise<void>): void {
    this.registrations.push({
      name,
      run,
      schedule: new CronSchedule(expression),
    });
  }

  /**
   * Registers a bounded non-backlogging interval.
   *
   * @param name - Stable job label.
   * @param intervalMs - Positive interval.
   * @param run - Callback.
   * @returns Nothing.
   */
  private addInterval(name: string, intervalMs: number, run: () => Promise<void>): void {
    const timer = setInterval(() => {
      this.track(name, run);
    }, intervalMs);
    timer.unref();
    this.timers.add(timer);
  }

  /**
   * Dispatches cron callbacks at most once per epoch second.
   *
   * @returns Nothing.
   */
  private tickCron(): void {
    const now = new Date();
    const second = Math.floor(now.getTime() / SECOND_MS);
    if (second === this.lastCronSecond) return;
    this.lastCronSecond = second;
    for (const registration of this.registrations) {
      if (registration.schedule.matches(now)) {
        this.track(registration.name, registration.run);
      }
    }
  }

  /**
   * Tracks a callback for shutdown and emits scheduler metrics.
   *
   * @param name - Bounded job label.
   * @param run - Callback.
   * @returns Nothing.
   */
  private track(name: string, run: () => Promise<void>): void {
    if (this.runtimeState.writeBlocker() === 'PROCESS_STOPPING') return;
    const startedAt = performance.now();
    const promise = this.clock
      .refresh()
      .then(run)
      .then(() => {
        this.observability.schedulerRuns.inc({ job: name, status: 'succeeded' });
      })
      .catch((error: unknown) => {
        this.observability.schedulerRuns.inc({ job: name, status: 'failed' });
        this.logger.error({ code: safeErrorCode(error), event: 'scheduler_job_failed', job: name });
      })
      .finally(() => {
        this.observability.schedulerDuration.observe(
          { job: name },
          Math.max(0, performance.now() - startedAt) / 1_000,
        );
        this.inFlight.delete(promise);
      });
    this.inFlight.add(promise);
  }

  /**
   * Runs a callback under the deployment-wide scheduler advisory lock.
   *
   * @template T - Job result.
   * @param jobType - Persisted job identity.
   * @param deadlineMs - Bounded deadline.
   * @param run - Job body.
   * @returns Job result or undefined when another replica owns the lock.
   */
  private async runLocked<T>(
    jobType: string,
    deadlineMs: number,
    run: (context: SchedulerRunContext) => Promise<T>,
  ): Promise<T | undefined> {
    const result = await this.dataRepository.withSchedulerRun(jobType, deadlineMs, run);
    return result.result;
  }

  /**
   * Claims and executes one asynchronous Admin manual job.
   *
   * @returns Nothing when the queue is empty or after completion.
   */
  private async processManualJob(): Promise<void> {
    await this.runLocked('MANUAL_JOB', 10 * 60_000, async ({ signal }) => {
      const job = await claimManualJob(this.pool, this.workerId('manual-job'));
      if (job === null) return null;
      try {
        const scope = parseManualScope(job.scope);
        const result =
          job.type === 'RECALCULATE'
            ? await this.decisionJob.run(signal, scope)
            : await this.runManualResync(scope);
        const completed = await this.pool.query(
          `UPDATE "ManualJob"
              SET "status" = 'SUCCEEDED', "finishedAt" = NOW(),
                  "leaseOwner" = NULL, "leaseUntil" = NULL, "result" = $2::jsonb
            WHERE "id" = $1 AND "status" = 'RUNNING' AND "leaseOwner" = $3`,
          [job.id, JSON.stringify(result), job.leaseOwner],
        );
        if (completed.rowCount !== 1) throw new Error('MANUAL_JOB_LEASE_LOST');
      } catch (error: unknown) {
        const failed = await this.pool.query(
          `UPDATE "ManualJob"
              SET "status" = 'FAILED', "finishedAt" = NOW(),
                  "leaseOwner" = NULL, "leaseUntil" = NULL, "errorCode" = $2
            WHERE "id" = $1 AND "status" = 'RUNNING' AND "leaseOwner" = $3`,
          [job.id, safeErrorCode(error), job.leaseOwner],
        );
        if (failed.rowCount !== 1) throw new Error('MANUAL_JOB_LEASE_LOST');
      }
      return job.id;
    });
  }

  /**
   * Runs a bounded synchronization scoped to the exact Admin request.
   *
   * @param scope - Validated campaign/target/data-kind selection.
   * @returns Aggregate results.
   */
  private runManualResync(scope: ManualJobScope): Promise<unknown> {
    return this.dataWorker.synchronizeScope(scope);
  }

  /**
   * Recomputes capacity after a successful campaign-scope synchronization.
   *
   * @returns Nothing when no startup coordinator callback is registered.
   */
  private async refreshCapacity(): Promise<void> {
    await this.capacityRefresh?.();
  }

  /**
   * Builds a process-scoped lease owner.
   *
   * @param suffix - Worker purpose.
   * @returns Stable worker ID.
   */
  private workerId(suffix: string): string {
    return PROCESS_WORKER_IDENTITY.owner(suffix);
  }
}

/**
 * Parses a single cron field.
 *
 * @param source - Field text.
 * @param minimum - Inclusive lower bound.
 * @param maximum - Inclusive upper bound.
 * @returns Accepted values.
 */
function parseCronField(source: string, minimum: number, maximum: number): Set<number> {
  const values = new Set<number>();
  for (const segment of source.split(',')) {
    const [rangeSource, stepSource] = segment.split('/');
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step < 1 || rangeSource === undefined) {
      throw new Error(`Invalid cron field: ${source}`);
    }
    const [start, end] =
      rangeSource === '*'
        ? [minimum, maximum]
        : rangeSource.includes('-')
          ? rangeSource.split('-').map(Number)
          : [Number(rangeSource), Number(rangeSource)];
    if (
      start === undefined ||
      end === undefined ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < minimum ||
      end > maximum ||
      start > end
    ) {
      throw new Error(`Cron field is out of range: ${source}`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

/** Validated scope shared by manual resync and recalculation jobs. */
interface ManualJobScope {
  readonly campaignIds?: readonly string[];
  readonly dataKinds?: readonly SyncDataKind[];
  readonly targetIds?: readonly string[];
}

/**
 * Parses only bounded manual-job scope fields.
 *
 * @param source - Stored manual-job scope.
 * @returns Validated scope.
 */
function parseManualScope(source: unknown): ManualJobScope {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error('INVALID_MANUAL_JOB_SCOPE');
  }
  const record = source as Readonly<Record<string, unknown>>;
  const campaignIds = parseUuidArray(record.campaignIds);
  const dataKinds = parseDataKinds(record.dataKinds);
  const targetIds = parseUuidArray(record.targetIds);
  return Object.freeze({
    ...(campaignIds === undefined ? {} : { campaignIds }),
    ...(dataKinds === undefined ? {} : { dataKinds }),
    ...(targetIds === undefined ? {} : { targetIds }),
  });
}

/**
 * Parses an optional bounded UUID array.
 *
 * @param source - Unknown field.
 * @returns Frozen values or undefined.
 */
function parseUuidArray(source: unknown): readonly string[] | undefined {
  if (source === undefined) return undefined;
  if (!Array.isArray(source) || source.length > 500) {
    throw new Error('INVALID_MANUAL_JOB_SCOPE');
  }
  if (source.length === 0) return undefined;
  const values: string[] = [];
  for (const value of source) {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ) {
      throw new Error('INVALID_MANUAL_JOB_SCOPE');
    }
    values.push(value);
  }
  return Object.freeze(values);
}

const SYNC_DATA_KINDS = new Set<SyncDataKind>([
  'CAMPAIGN_DISCOVERY',
  'CAMPAIGN_DETAILS',
  'CURRENT_BID',
  'MINIMUM_BID',
  'CAMPAIGN_STATISTICS',
  'CLUSTER_LIST',
  'CLUSTER_STATISTICS',
  'BID_RECOMMENDATION',
  'BUDGET_DIAGNOSTIC',
  'SAME_DAY_SPEND',
]);

/**
 * Parses an optional closed-list data-kind selection.
 *
 * @param source - Stored JSON field.
 * @returns Validated data kinds or undefined for the default full resync.
 */
function parseDataKinds(source: unknown): readonly SyncDataKind[] | undefined {
  if (source === undefined) return undefined;
  if (
    !Array.isArray(source) ||
    source.length > SYNC_DATA_KINDS.size ||
    source.some((value) => typeof value !== 'string' || !SYNC_DATA_KINDS.has(value as SyncDataKind))
  ) {
    throw new Error('INVALID_MANUAL_JOB_DATA_KIND');
  }
  if (source.length === 0) return undefined;
  return Object.freeze([...new Set(source as SyncDataKind[])]);
}

/**
 * Returns a stable error class without including payloads or secrets.
 *
 * @param error - Unknown failure.
 * @returns Redacted code.
 */
function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as Readonly<{ code?: unknown }>).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,80}$/u.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Z0-9_]{2,80}$/u.test(error.message)) return error.message;
  return 'JOB_FAILED';
}
