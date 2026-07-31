import { Inject, Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from 'prom-client';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_CLIENT } from './database.js';
import type { AppConfiguration } from '@wb-bidder/config';
import {
  countTargetsWithoutCurrentEconomics,
  listAppliedMigrationNames,
  probeDatabase,
  readDatabaseConnectionUtilization,
  type DatabaseClient,
} from '@wb-bidder/database';

const REQUIRED_MIGRATIONS = Object.freeze([
  '202607281330_initial',
  '202607281410_stage1_rate_limiter',
  '202607281500_stage2_sync_evidence',
  '202607281600_stage3_decision_engine',
  '202607281700_stage4_write_pipeline',
  '202607291000_stage5_production_runtime',
  '202607291200_stage5_cluster_contract',
]);
const INTEGRATION_STATE_TTL_MS = 120_000;

/**
 * One bounded readiness check result.
 */
export interface ReadinessCheck {
  /** Stable check name. */
  readonly name: 'account_binding' | 'configuration' | 'database' | 'integration' | 'migrations';
  /** Redacted machine-readable detail. */
  readonly detail: string;
  /** Whether the invariant currently permits readiness. */
  readonly ok: boolean;
}

/**
 * Aggregate readiness state returned without performing WB network I/O.
 */
export interface ReadinessSnapshot {
  /** Individual bounded checks. */
  readonly checks: readonly ReadinessCheck[];
  /** Overall readiness. */
  readonly ready: boolean;
}

/**
 * Cached state of the quota-aware WB integration check.
 */
export interface IntegrationHealth {
  /** Redacted failure class, if the last check failed. */
  readonly errorCode: string | null;
  /** Last successful authorized check. */
  readonly lastSuccessAt: Date | null;
  /** Last attempted check. */
  readonly lastAttemptAt: Date | null;
}

/**
 * Central bounded-cardinality metrics and readiness service.
 *
 * Database gauges are refreshed only when `/metrics` is scraped. WB is never called by a
 * readiness or metrics request.
 */
@Injectable()
export class ObservabilityService {
  private readonly registry = new Registry();
  private integrationHealth: IntegrationHealth = Object.freeze({
    errorCode: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
  });

  /** Scheduler run outcomes. */
  public readonly schedulerRuns = this.counter({
    help: 'Completed bidder scheduler runs.',
    labelNames: ['job', 'status'] as const,
    name: 'bidder_scheduler_runs_total',
  });

  /** Scheduler wall-clock duration. */
  public readonly schedulerDuration = this.histogram({
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300, 900],
    help: 'Scheduler run duration in seconds.',
    labelNames: ['job'] as const,
    name: 'bidder_scheduler_run_duration_seconds',
  });

  /** Campaign synchronization outcomes. */
  public readonly syncCampaigns = this.counter({
    help: 'Campaign synchronization outcomes.',
    labelNames: ['status'] as const,
    name: 'bidder_sync_campaigns_total',
  });

  /** Maximum synchronization lag. */
  public readonly syncLag = this.gauge({
    help: 'Maximum synchronization lag in seconds.',
    name: 'bidder_sync_lag_seconds',
  });

  /** Maximum snapshot age by bounded data kind. */
  public readonly snapshotAge = this.gauge({
    help: 'Maximum snapshot age in seconds by data kind.',
    labelNames: ['data_kind'] as const,
    name: 'bidder_snapshot_age_seconds',
  });

  /** Snapshot SLA violations. */
  public readonly syncSlaViolations = this.counter({
    help: 'Synchronization SLA violations by data kind.',
    labelNames: ['data_kind'] as const,
    name: 'bidder_sync_sla_violations_total',
  });

  /** Estimated full-pass completion time. */
  public readonly syncFullPassEta = this.gauge({
    help: 'Estimated full-pass completion time in seconds.',
    labelNames: ['data_kind'] as const,
    name: 'bidder_sync_full_pass_eta_seconds',
  });

  /** Decision outcomes. */
  public readonly decisions = this.counter({
    help: 'Decision outcomes by bounded action and reason.',
    labelNames: ['action', 'reason'] as const,
    name: 'bidder_decisions_total',
  });

  /** Decision duration. */
  public readonly decisionDuration = this.histogram({
    buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.5],
    help: 'Decision calculation duration in seconds.',
    name: 'bidder_decision_duration_seconds',
  });

  /** Current queue cardinality. */
  public readonly queueItems = this.gauge({
    help: 'Decision queue items by status.',
    labelNames: ['status'] as const,
    name: 'bidder_queue_items',
  });

  /** Oldest actionable queue age. */
  public readonly queueOldestAge = this.gauge({
    help: 'Oldest actionable queue item age in seconds.',
    name: 'bidder_queue_oldest_age_seconds',
  });

  /** Executor attempt outcomes. */
  public readonly executorAttempts = this.counter({
    help: 'Executor attempts by endpoint and result.',
    labelNames: ['endpoint', 'result'] as const,
    name: 'bidder_executor_attempts_total',
  });

  /** Verification and reconciliation outcomes. */
  public readonly verification = this.counter({
    help: 'Verification outcomes.',
    labelNames: ['result'] as const,
    name: 'bidder_verification_total',
  });

  /** WB request totals populated by application workers. */
  public readonly wbRequests = this.counter({
    help: 'WB requests by endpoint and status class.',
    labelNames: ['endpoint', 'status_class'] as const,
    name: 'bidder_wb_requests_total',
  });

  /** WB request duration populated by application workers. */
  public readonly wbRequestDuration = this.histogram({
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15],
    help: 'WB request duration in seconds.',
    labelNames: ['endpoint'] as const,
    name: 'bidder_wb_request_duration_seconds',
  });

  /** WB rate-limit wait duration. */
  public readonly wbRateLimitWait = this.histogram({
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 5, 30, 60],
    help: 'WB rate-limit wait in seconds.',
    labelNames: ['endpoint'] as const,
    name: 'bidder_wb_rate_limit_wait_seconds',
  });

  /** WB quota responses. */
  public readonly wb429 = this.counter({
    help: 'WB HTTP 429 responses.',
    labelNames: ['endpoint'] as const,
    name: 'bidder_wb_429_total',
  });

  /** Circuit state by bounded endpoint group. */
  public readonly circuitBreakerState = this.gauge({
    help: 'Circuit breaker state: 0 closed, 0.5 half-open, 1 open.',
    labelNames: ['group'] as const,
    name: 'bidder_circuit_breaker_state',
  });

  /** Invalid data outcomes. */
  public readonly dataInvalid = this.counter({
    help: 'Invalid normalized data by bounded reason.',
    labelNames: ['reason'] as const,
    name: 'bidder_data_invalid_total',
  });

  /** Product economics imports. */
  public readonly economicsImports = this.counter({
    help: 'Product economics imports by result and dry-run marker.',
    labelNames: ['status', 'dry_run'] as const,
    name: 'bidder_product_economics_imports_total',
  });

  /** Product economics import item outcomes. */
  public readonly economicsImportItems = this.counter({
    help: 'Product economics import items by result and bounded reason.',
    labelNames: ['status', 'reason'] as const,
    name: 'bidder_product_economics_import_items_total',
  });

  /** Targets currently missing effective economics. */
  public readonly targetsWithoutEconomics = this.gauge({
    help: 'Targets without effective product economics.',
    name: 'bidder_targets_without_product_economics',
  });

  /** Active experiments by state. */
  public readonly bidExperiments = this.gauge({
    help: 'Bid experiments by bounded state.',
    labelNames: ['status'] as const,
    name: 'bidder_bid_experiments',
  });

  /** Experiment reverts. */
  public readonly bidExperimentReverts = this.counter({
    help: 'Bid experiment reverts by bounded reason.',
    labelNames: ['reason'] as const,
    name: 'bidder_bid_experiment_reverts_total',
  });

  /** Audit failures. */
  public readonly auditWriteFailures = this.counter({
    help: 'Business audit persistence failures.',
    name: 'bidder_audit_write_failures_total',
  });

  /** PostgreSQL pool utilization. */
  public readonly databasePoolUtilization = this.gauge({
    help: 'PostgreSQL pool utilization ratio.',
    name: 'bidder_database_pool_utilization_ratio',
  });

  /** Stuck ambiguous write attempts. */
  public readonly stuckWriteAttempts = this.gauge({
    help: 'Write attempts in non-terminal state beyond their safety window.',
    labelNames: ['status'] as const,
    name: 'bidder_stuck_write_attempts',
  });

  /**
   * Creates the metrics service and registers process metrics when enabled.
   *
   * @param database - Shared Prisma Client.
   * @param configuration - Immutable startup configuration.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
  ) {
    this.registry.setDefaultLabels({
      environment: configuration.wb.mode,
      service: 'wb-bidder',
      version: '0.1.0',
    });
    if (configuration.metricsEnabled) {
      collectDefaultMetrics({ prefix: 'bidder_process_', register: this.registry });
    }
  }

  /**
   * Records a successful authorized integration check.
   *
   * @param at - Completion instant.
   * @returns Nothing.
   */
  public integrationSucceeded(at: Date): void {
    this.integrationHealth = Object.freeze({
      errorCode: null,
      lastAttemptAt: at,
      lastSuccessAt: at,
    });
  }

  /**
   * Records a redacted integration failure without discarding the last success.
   *
   * @param at - Attempt instant.
   * @param errorCode - Stable non-secret failure class.
   * @returns Nothing.
   */
  public integrationFailed(at: Date, errorCode: string): void {
    this.integrationHealth = Object.freeze({
      errorCode,
      lastAttemptAt: at,
      lastSuccessAt: this.integrationHealth.lastSuccessAt,
    });
  }

  /**
   * Returns the current cached integration state.
   *
   * @returns Immutable state without network I/O.
   */
  public integrationSnapshot(): IntegrationHealth {
    return this.integrationHealth;
  }

  /**
   * Checks database, migrations, binding, configuration, and cached integration freshness.
   *
   * @returns Readiness snapshot; WB is never contacted.
   */
  public async readiness(): Promise<ReadinessSnapshot> {
    const checks: ReadinessCheck[] = [
      { detail: 'validated startup schema', name: 'configuration', ok: true },
    ];
    try {
      await probeDatabase(this.database);
      checks.push({ detail: 'query succeeded', name: 'database', ok: true });
    } catch {
      checks.push({ detail: 'query failed', name: 'database', ok: false });
      return Object.freeze({ checks: Object.freeze(checks), ready: false });
    }

    const migrations = await this.readMigrationState();
    checks.push({
      detail: migrations.detail,
      name: 'migrations',
      ok: migrations.ok,
    });
    const bindingPresent = (await this.database.deploymentAccountBinding.count()) > 0;
    checks.push({
      detail: bindingPresent ? 'singleton present' : 'singleton missing',
      name: 'account_binding',
      ok: bindingPresent,
    });
    const now = Date.now();
    const lastSuccess = this.integrationHealth.lastSuccessAt?.getTime() ?? 0;
    const integrationFresh = now - lastSuccess <= INTEGRATION_STATE_TTL_MS;
    checks.push({
      detail: integrationFresh
        ? 'cached authorized check is fresh'
        : (this.integrationHealth.errorCode ?? 'cached authorized check expired'),
      name: 'integration',
      ok: integrationFresh,
    });
    return Object.freeze({
      checks: Object.freeze(checks),
      ready: checks.every((check) => check.ok),
    });
  }

  /**
   * Refreshes database-derived gauges and renders Prometheus text.
   *
   * @returns Current registry in Prometheus exposition format.
   */
  public async metricsText(): Promise<string> {
    if (this.configuration.metricsEnabled) {
      await this.refreshDatabaseGauges();
    }
    return this.registry.metrics();
  }

  /**
   * Registers a counter in the private service registry.
   *
   * @template T - Tuple of allowed label names.
   * @param configuration - Counter metadata.
   * @returns Registered counter.
   */
  private counter<T extends string>(configuration: CounterConfiguration<T>): Counter<T> {
    return new Counter({ ...configuration, registers: [this.registry] });
  }

  /**
   * Registers a gauge in the private service registry.
   *
   * @template T - Tuple of allowed label names.
   * @param configuration - Gauge metadata.
   * @returns Registered gauge.
   */
  private gauge<T extends string>(configuration: GaugeConfiguration<T>): Gauge<T> {
    return new Gauge({ ...configuration, registers: [this.registry] });
  }

  /**
   * Registers a histogram in the private service registry.
   *
   * @template T - Tuple of allowed label names.
   * @param configuration - Histogram metadata.
   * @returns Registered histogram.
   */
  private histogram<T extends string>(configuration: HistogramConfiguration<T>): Histogram<T> {
    return new Histogram({ ...configuration, registers: [this.registry] });
  }

  /**
   * Reads the exact checked-in migration set from Prisma's migration table.
   *
   * @returns Redacted migration status.
   */
  private async readMigrationState(): Promise<{ readonly detail: string; readonly ok: boolean }> {
    try {
      const applied = new Set(await listAppliedMigrationNames(this.database));
      const missing = REQUIRED_MIGRATIONS.filter((migration) => !applied.has(migration));
      return missing.length === 0
        ? { detail: 'all required migrations applied', ok: true }
        : { detail: `missing ${String(missing.length)} required migration(s)`, ok: false };
    } catch {
      return { detail: 'Prisma migration state unavailable', ok: false };
    }
  }

  /**
   * Refreshes only bounded aggregate gauges; identifiers never become labels.
   *
   * @returns Promise resolving after database aggregates are sampled.
   */
  private async refreshDatabaseGauges(): Promise<void> {
    this.databasePoolUtilization.set(
      await readDatabaseConnectionUtilization(this.database, 'wb-bidder', 20),
    );
    const queue = await this.database.decisionQueueItem.groupBy({
      _count: { _all: true },
      _min: { availableAt: true },
      by: ['status'],
    });
    this.queueItems.reset();
    let oldest = 0;
    for (const row of queue) {
      this.queueItems.set({ status: row.status }, row._count._all);
      if (row.status === 'QUEUED' || row.status === 'RETRY_WAIT') {
        oldest = Math.max(
          oldest,
          row._min.availableAt === null ? 0 : (Date.now() - row._min.availableAt.getTime()) / 1_000,
        );
      }
    }
    this.queueOldestAge.set(Math.max(0, oldest));

    this.targetsWithoutEconomics.set(
      await countTargetsWithoutCurrentEconomics(this.database, new Date()),
    );

    const experiments = await this.database.bidExperiment.groupBy({
      _count: { _all: true },
      by: ['status'],
    });
    this.bidExperiments.reset();
    for (const row of experiments) {
      this.bidExperiments.set({ status: row.status }, row._count._all);
    }

    const stuck = await this.database.wbWriteAttempt.groupBy({
      _count: { _all: true },
      by: ['status'],
      where: {
        preparedAt: { lt: new Date(Date.now() - 15 * 60_000) },
        status: { in: ['PREPARED', 'DISPATCHING', 'UNKNOWN'] },
      },
    });
    this.stuckWriteAttempts.reset();
    for (const row of stuck) {
      this.stuckWriteAttempts.set({ status: row.status }, row._count._all);
    }
  }
}
