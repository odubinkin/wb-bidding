import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { APP_CONFIGURATION } from './application-config.js';
import { DATABASE_POOL } from './database.js';
import { parseDecisionPolicy } from './decision-job.service.js';
import { ObservabilityService } from './observability.service.js';
import { DECISION_REPOSITORY } from './runtime.providers.js';
import { RuntimeSafetyState } from './runtime-state.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import {
  addIsoCalendarDays,
  formatAccountLocalDate,
  type AppConfiguration,
} from '@wb-bidder/config';
import {
  advanceExperiment,
  confirmExperimentRevert,
  DecisionRepository,
  resolveExperimentRevert,
  scopedChecksum,
  type DecisionPolicy,
  type DecisionResult,
  type ExperimentState,
} from '@wb-bidder/decision-engine';

const EXPERIMENT_PAGE_SIZE = 100;

/**
 * Database representation required to advance one experiment without WB calls.
 */
interface ExperimentRuntimeRow {
  readonly actualRevertBidMinor: string | null;
  readonly activePolicyConfiguration: unknown;
  readonly activePolicyId: string | null;
  readonly activePolicyVersion: string | null;
  readonly applyEligible: boolean | null;
  readonly campaignAutomation: string | null;
  readonly capability: string;
  readonly collectedEligibleDays: number;
  readonly completedAt: Date | null;
  readonly currentBidMinor: string | null;
  readonly desiredRevertBidMinor: string;
  readonly economicsId: string | null;
  readonly expectedContributionMinor: string | null;
  readonly economicsVersion: string | null;
  readonly evaluationNotBefore: Date | null;
  readonly experimentBidMinor: string;
  readonly id: string;
  readonly observedExperimentSpendMinor: string;
  readonly plannedFullDays: number;
  readonly reservedUnobservedSpendMinor: string;
  readonly revertDeadlineAt: Date | null;
  readonly revertDecisionId: string | null;
  readonly sourceBidMinor: string;
  readonly spendLimitMinor: string;
  readonly spendSafetyBufferMinor: string;
  readonly startDecisionId: string | null;
  readonly startedAt: Date | null;
  readonly status: ExperimentState['status'];
  readonly targetAutomation: string | null;
  readonly targetId: string;
  readonly terminalReasonCode: string | null;
  readonly wbMinimumBidMinor: string | null;
}

/**
 * Production experiment lifecycle worker.
 *
 * It never sends WB traffic directly: starting and revert bids use the same durable decision queue,
 * executor, pre-dispatch validation, verification, and reconciliation path as ordinary decisions.
 */
@Injectable()
export class ExperimentRuntimeService {
  /**
   * Creates the lifecycle worker.
   *
   * @param pool - Authoritative PostgreSQL pool.
   * @param configuration - Revert deadline and write gates.
   * @param decisions - Atomic decision/queue repository.
   * @param runtimeState - Process-level close-only write gates.
   * @param observability - Experiment metrics.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    private readonly runtimeState: RuntimeSafetyState,
    private readonly observability: ObservabilityService,
    private readonly clock: RuntimeClockService,
  ) {}

  /**
   * Advances one bounded page of non-terminal experiments.
   *
   * @returns Processed experiment count.
   */
  public async run(): Promise<number> {
    const now = this.clock.now();
    const result = await this.pool.query<ExperimentRuntimeRow>(
      `SELECT experiment."id", experiment."targetId", experiment."status"::text,
              experiment."sourceBidMinor", experiment."experimentBidMinor",
              experiment."desiredRevertBidMinor", experiment."actualRevertBidMinor",
              experiment."plannedFullDays", experiment."collectedEligibleDays",
              experiment."spendLimitMinor", experiment."spendSafetyBufferMinor",
              experiment."observedExperimentSpendMinor",
              experiment."reservedUnobservedSpendMinor", experiment."startedAt",
              experiment."evaluationNotBefore", experiment."terminalReasonCode",
              experiment."completedAt", experiment."startDecisionId",
              experiment."revertDecisionId", experiment."revertDeadlineAt",
              target."currentBidMinor", target."minimumBidMinor" AS "wbMinimumBidMinor",
              target."capability",
              policy."id" AS "activePolicyId", policy."version" AS "activePolicyVersion",
              policy."configuration" AS "activePolicyConfiguration",
              economics."id" AS "economicsId", economics."version" AS "economicsVersion",
              economics."expectedContributionBeforeAdsMinor" AS "expectedContributionMinor",
              snapshot."applyEligible",
              campaign_automation."mode"::text AS "campaignAutomation",
              target_automation."mode"::text AS "targetAutomation"
         FROM "BidExperiment" experiment
         JOIN "CampaignTarget" target ON target."id" = experiment."targetId"
         JOIN "Campaign" campaign ON campaign."id" = target."campaignId"
         LEFT JOIN LATERAL (
           SELECT current_policy."id", current_policy."version", current_policy."configuration"
             FROM "BiddingPolicy" current_policy
            WHERE current_policy."enabled" = true
              AND current_policy."validFrom" <= $2
              AND (current_policy."validTo" IS NULL OR current_policy."validTo" > $2)
              AND (("scope" = 'TARGET' AND current_policy."targetId" = target."id")
                OR ("scope" = 'CAMPAIGN' AND current_policy."campaignId" = campaign."id")
                OR current_policy."scope" = 'DEPLOYMENT')
            ORDER BY CASE current_policy."scope"
                       WHEN 'TARGET' THEN 1 WHEN 'CAMPAIGN' THEN 2 ELSE 3
                     END,
                     current_policy."version" DESC
            LIMIT 1
         ) policy ON true
         LEFT JOIN LATERAL (
           SELECT product."id", product."version",
                  product."expectedContributionBeforeAdsMinor"
             FROM "ProductEconomics" product
            WHERE product."nmId" = target."nmId"
              AND product."effectiveFrom" <= $2
              AND (product."effectiveTo" IS NULL OR product."effectiveTo" > $2)
            ORDER BY product."effectiveFrom" DESC, product."version" DESC
            LIMIT 1
         ) economics ON true
         LEFT JOIN LATERAL (
           SELECT data_snapshot."applyEligible"
             FROM "TargetDataSnapshot" data_snapshot
            WHERE data_snapshot."targetId" = target."id"
            ORDER BY data_snapshot."createdAt" DESC
            LIMIT 1
         ) snapshot ON true
         LEFT JOIN "CampaignAutomation" campaign_automation
           ON campaign_automation."campaignId" = campaign."id"
         LEFT JOIN "TargetAutomation" target_automation
           ON target_automation."targetId" = target."id"
        WHERE experiment."status" IN
              ('PLANNED','ACTIVE','COLLECTING','EVALUATING','REVERTING')
        ORDER BY experiment."createdAt", experiment."id"
        LIMIT $1`,
      [EXPERIMENT_PAGE_SIZE, now],
    );
    for (const row of result.rows) {
      await this.advance(row, now);
    }
    return result.rows.length;
  }

  /**
   * Routes one row by its persisted lifecycle state.
   *
   * @param row - Current experiment and target state.
   * @param now - Stable evaluation instant.
   * @returns Nothing.
   */
  private async advance(row: ExperimentRuntimeRow, now: Date): Promise<void> {
    if (row.status === 'PLANNED') {
      await this.observeStart(row, now);
      return;
    }
    if (row.status === 'ACTIVE' || row.status === 'COLLECTING') {
      await this.collect(row, now);
      return;
    }
    if (row.status === 'EVALUATING') {
      await this.evaluate(row, now);
      return;
    }
    await this.revert(row, now);
  }

  /**
   * Opens collection only after the lower bid is verified APPLIED.
   *
   * @param row - Planned experiment.
   * @param now - Model time.
   * @returns Nothing.
   */
  private async observeStart(row: ExperimentRuntimeRow, now: Date): Promise<void> {
    if (row.startDecisionId === null) {
      await this.fail(row, now, 'EXPERIMENT_START_DECISION_MISSING', false);
      return;
    }
    const queue = await this.pool.query<{ status: string; verifiedAt: Date | null }>(
      `SELECT "status"::text, "verifiedAt"
         FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
      [row.startDecisionId],
    );
    const state = queue.rows[0];
    if (state?.status === 'APPLIED') {
      const startedAt = state.verifiedAt ?? now;
      const firstEligibleDate = addIsoCalendarDays(
        formatAccountLocalDate(this.configuration.accountTimezone, startedAt),
        1,
      );
      await this.pool.query(
        `UPDATE "BidExperiment"
            SET "status" = 'ACTIVE', "startedAt" = $2, "firstEligibleDate" = $3::date
          WHERE "id" = $1 AND "status" = 'PLANNED'`,
        [row.id, startedAt, firstEligibleDate],
      );
    } else if (state?.status === 'FAILED' || state?.status === 'SUPERSEDED') {
      await this.fail(row, now, 'EXPERIMENT_START_WRITE_FAILED', false);
    }
  }

  /**
   * Aggregates complete experiment days and moves to evaluation or revert.
   *
   * @param row - Active/collecting experiment.
   * @param now - Model time.
   * @returns Nothing.
   */
  private async collect(row: ExperimentRuntimeRow, now: Date): Promise<void> {
    if (row.startedAt === null) {
      await this.fail(row, now, 'EXPERIMENT_START_TIME_MISSING', false);
      return;
    }
    const evidence = await this.pool.query<{
      collectedDays: number;
      evaluationNotBefore: Date | null;
      observedSpendMinor: string;
    }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE "wbStatisticDate" >= ($3::date + INTERVAL '1 day')::date
             AND "confirmedBidMinor" = $2
         )::integer AS "collectedDays",
         MAX("statisticsFinalizedAt") FILTER (
           WHERE "wbStatisticDate" >= ($3::date + INTERVAL '1 day')::date
             AND "confirmedBidMinor" = $2
         ) AS "evaluationNotBefore",
         COALESCE(SUM("spendDeltaMinor") FILTER (
           WHERE "wbStatisticDate" >= $3::date
         ), 0)::text AS "observedSpendMinor"
       FROM "BidPerformanceDay"
      WHERE "targetId" = $1 AND "status" = 'FINALIZED'`,
      [row.targetId, row.experimentBidMinor, row.startedAt.toISOString().slice(0, 10)],
    );
    const current = evidence.rows[0];
    if (current === undefined) return;
    const configurationValid =
      row.currentBidMinor === row.experimentBidMinor &&
      row.capability === 'CARD_WRITE_READY' &&
      row.applyEligible === true &&
      row.activePolicyId !== null &&
      row.activePolicyVersion !== null &&
      row.campaignAutomation === 'APPLY' &&
      (row.targetAutomation === null || row.targetAutomation === 'APPLY');
    const evaluationNotBefore = current.evaluationNotBefore ?? now;
    const state = advanceExperiment(toState(row), {
      collectedEligibleDays: current.collectedDays,
      configurationValid,
      evaluationNotBefore,
      now,
      observedExperimentSpendMinor: BigInt(current.observedSpendMinor),
      reservedUnobservedSpendMinor: 0n,
    });
    const reverting = state.status === 'REVERTING';
    await this.pool.query(
      `UPDATE "BidExperiment"
          SET "status" = $2::"ExperimentStatus",
              "collectedEligibleDays" = $3,
              "observedExperimentSpendMinor" = $4,
              "reservedUnobservedSpendMinor" = $5,
              "evaluationNotBefore" = $6,
              "terminalReasonCode" = $7,
              "revertStartedAt" = CASE WHEN $8 THEN COALESCE("revertStartedAt", $9) ELSE NULL END,
              "revertDeadlineAt" = CASE
                WHEN $8 THEN COALESCE(
                  "revertDeadlineAt",
                  $9 + ($10::integer * INTERVAL '1 millisecond')
                )
                ELSE NULL
              END
        WHERE "id" = $1`,
      [
        row.id,
        state.status,
        state.collectedEligibleDays,
        state.observedExperimentSpendMinor.toString(),
        state.reservedUnobservedSpendMinor.toString(),
        state.evaluationNotBefore,
        state.terminalReasonCode,
        reverting,
        now,
        this.configuration.writePipeline.experimentRevertDeadlineMs,
      ],
    );
    if (reverting) this.observability.bidExperimentReverts.inc({ reason: 'started' });
  }

  /**
   * Accepts the experiment only when a new ordinary observation prefers the current experiment bid.
   *
   * @param row - Evaluating experiment.
   * @param now - Model time.
   * @returns Nothing.
   */
  private async evaluate(row: ExperimentRuntimeRow, now: Date): Promise<void> {
    const decision = await this.pool.query<{
      boundedBidMinor: string | null;
      id: string;
      outcomeReasonCode: string;
    }>(
      `SELECT "id", "boundedBidMinor", "outcomeReasonCode"
         FROM "BidDecision"
        WHERE "targetId" = $1
          AND "createdAt" >= COALESCE($2, '-infinity'::timestamptz)
          AND "strategyReasonCode" NOT IN ('EXPLORATION_PLANNED','EXPLORATION_REVERT')
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      [row.targetId, row.evaluationNotBefore],
    );
    const observed = decision.rows[0];
    if (observed === undefined) return;
    if (
      observed.boundedBidMinor === row.experimentBidMinor &&
      !['INSUFFICIENT_DATA', 'INSUFFICIENT_BID_RESPONSE_DATA'].includes(observed.outcomeReasonCode)
    ) {
      await this.pool.query(
        `UPDATE "BidExperiment"
            SET "status" = 'ACCEPTED', "completedAt" = $2,
                "terminalReasonCode" = 'EXPLORATION_ACCEPTED',
                "resultDecisionId" = $3
          WHERE "id" = $1 AND "status" = 'EVALUATING'`,
        [row.id, now, observed.id],
      );
      return;
    }
    await this.beginRevert(row.id, now, 'EXPLORATION_EVALUATION_REVERT');
  }

  /**
   * Creates or observes one ordinary durable revert decision.
   *
   * @param row - Reverting experiment.
   * @param now - Model time.
   * @returns Nothing.
   */
  private async revert(row: ExperimentRuntimeRow, now: Date): Promise<void> {
    if (row.revertDeadlineAt !== null && now > new Date(row.revertDeadlineAt)) {
      await this.fail(row, now, 'EXPLORATION_REVERT_DEADLINE_EXCEEDED', true);
      return;
    }
    if (row.revertDecisionId !== null) {
      const queue = await this.pool.query<{ status: string; verifiedAt: Date | null }>(
        `SELECT "status"::text, "verifiedAt"
           FROM "DecisionQueueItem" WHERE "decisionId" = $1`,
        [row.revertDecisionId],
      );
      const result = queue.rows[0];
      if (result?.status === 'APPLIED' && row.currentBidMinor !== null) {
        const terminal = confirmExperimentRevert(
          toState(row),
          BigInt(row.currentBidMinor),
          result.verifiedAt ?? now,
        );
        await this.pool.query(
          `UPDATE "BidExperiment"
              SET "status" = $2::"ExperimentStatus", "actualRevertBidMinor" = $3,
                  "completedAt" = $4, "terminalReasonCode" = $5
            WHERE "id" = $1`,
          [
            row.id,
            terminal.status,
            terminal.actualRevertBidMinor?.toString() ?? null,
            terminal.completedAt,
            terminal.terminalReasonCode,
          ],
        );
        this.observability.bidExperimentReverts.inc({ reason: terminal.status.toLowerCase() });
      }
      return;
    }
    const policy = this.currentPolicy(row);
    const instruction = resolveExperimentRevert(toState(row), {
      capabilityAvailable: row.capability === 'CARD_WRITE_READY' && row.applyEligible === true,
      now,
      policyMaxBidMinor: policy?.policyMaxBidMinor ?? 0n,
      policyMinBidMinor: policy?.policyMinBidMinor ?? null,
      quantumMinor: 1n,
      wbMinimumBidMinor: row.wbMinimumBidMinor === null ? null : BigInt(row.wbMinimumBidMinor),
    });
    if (instruction.bidMinor === null || policy === null) {
      await this.fail(row, now, 'EXPLORATION_REVERT_BLOCKED', true);
      return;
    }
    if (
      !this.configuration.wb.writesEnabled ||
      this.runtimeState.writeBlocker() !== null ||
      policy.executionMode !== 'APPLY' ||
      row.campaignAutomation !== 'APPLY' ||
      (row.targetAutomation !== null && row.targetAutomation !== 'APPLY') ||
      row.currentBidMinor === null ||
      row.activePolicyId === null ||
      row.activePolicyVersion === null ||
      row.economicsId === null ||
      row.economicsVersion === null ||
      row.expectedContributionMinor === null
    ) {
      return;
    }
    if (instruction.bidMinor === BigInt(row.currentBidMinor)) {
      const terminal = confirmExperimentRevert(toState(row), instruction.bidMinor, now);
      await this.pool.query(
        `UPDATE "BidExperiment"
            SET "status" = $2::"ExperimentStatus", "actualRevertBidMinor" = $3,
                "completedAt" = $4, "terminalReasonCode" = $5
          WHERE "id" = $1`,
        [
          row.id,
          terminal.status,
          instruction.bidMinor.toString(),
          now,
          terminal.terminalReasonCode,
        ],
      );
      return;
    }
    const decisionResult = revertDecision(row, instruction.bidMinor, policy, now);
    const persisted = await this.decisions.persistDecision({
      calculatedAt: now,
      currentBidMinor: BigInt(row.currentBidMinor),
      economicsId: row.economicsId,
      economicsVersion: BigInt(row.economicsVersion),
      expectedContributionMinor: BigInt(row.expectedContributionMinor),
      periodEnd: now.toISOString().slice(0, 10),
      periodStart: now.toISOString().slice(0, 10),
      policyId: row.activePolicyId,
      policyVersion: BigInt(row.activePolicyVersion),
      result: decisionResult,
      targetId: row.targetId,
    });
    await this.pool.query(
      `UPDATE "BidExperiment"
          SET "revertDecisionId" = $2,
              "terminalReasonCode" = CASE
                WHEN $3 THEN 'EXPLORATION_REVERT_CONSTRAINED_PENDING'
                ELSE 'EXPLORATION_REVERT_PENDING'
              END
        WHERE "id" = $1 AND "status" = 'REVERTING'`,
      [row.id, persisted.decisionId, instruction.constrained],
    );
  }

  /**
   * Opens a bounded revert window once.
   *
   * @param id - Experiment UUID.
   * @param now - Start instant.
   * @param reason - Trigger reason.
   * @returns Nothing.
   */
  private async beginRevert(id: string, now: Date, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE "BidExperiment"
          SET "status" = 'REVERTING', "terminalReasonCode" = $3,
              "revertStartedAt" = COALESCE("revertStartedAt", $2),
              "revertDeadlineAt" = COALESCE(
                "revertDeadlineAt",
                $2 + ($4::integer * INTERVAL '1 millisecond')
              )
        WHERE "id" = $1 AND "status" = 'EVALUATING'`,
      [id, now, reason, this.configuration.writePipeline.experimentRevertDeadlineMs],
    );
    this.observability.bidExperimentReverts.inc({ reason: 'started' });
  }

  /**
   * Terminates an experiment and optionally disables only that target.
   *
   * @param row - Experiment row.
   * @param now - Terminal instant.
   * @param reason - Stable reason code.
   * @param disableTarget - Whether manual recovery is required.
   * @returns Nothing.
   */
  private async fail(
    row: ExperimentRuntimeRow,
    now: Date,
    reason: string,
    disableTarget: boolean,
  ): Promise<void> {
    const status = disableTarget ? 'FAILED_REVERT_BLOCKED' : 'FAILED';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "BidExperiment"
            SET "status" = $2::"ExperimentStatus", "completedAt" = $3,
                "terminalReasonCode" = $4
          WHERE "id" = $1`,
        [row.id, status, now, reason],
      );
      if (disableTarget) {
        await client.query(
          `INSERT INTO "TargetAutomation"
             ("id", "targetId", "mode", "reason", "updatedBy")
           VALUES ($1, $2, 'DISABLED', $3, 'SYSTEM')
           ON CONFLICT ("targetId") DO UPDATE SET
             "mode" = 'DISABLED',
             "reason" = EXCLUDED."reason",
             "version" = "TargetAutomation"."version" + 1,
             "updatedBy" = 'SYSTEM'`,
          [randomUUID(), row.targetId, reason],
        );
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    this.observability.bidExperimentReverts.inc({ reason: status.toLowerCase() });
  }

  /**
   * Parses the currently resolved policy, returning null on missing/invalid state.
   *
   * @param row - Runtime row.
   * @returns Valid policy or null.
   */
  private currentPolicy(row: ExperimentRuntimeRow): DecisionPolicy | null {
    if (row.activePolicyConfiguration === null || row.activePolicyVersion === null) return null;
    try {
      return parseDecisionPolicy(row.activePolicyConfiguration, BigInt(row.activePolicyVersion));
    } catch {
      return null;
    }
  }
}

/**
 * Maps a persistence row to the pure lifecycle reducer state.
 *
 * @param row - Persistence row.
 * @returns Pure immutable state.
 */
function toState(row: ExperimentRuntimeRow): ExperimentState {
  return Object.freeze({
    actualRevertBidMinor:
      row.actualRevertBidMinor === null ? null : BigInt(row.actualRevertBidMinor),
    collectedEligibleDays: row.collectedEligibleDays,
    completedAt: row.completedAt,
    desiredRevertBidMinor: BigInt(row.desiredRevertBidMinor),
    evaluationNotBefore: row.evaluationNotBefore,
    experimentBidMinor: BigInt(row.experimentBidMinor),
    observedExperimentSpendMinor: BigInt(row.observedExperimentSpendMinor),
    plannedFullDays: row.plannedFullDays,
    reservedUnobservedSpendMinor: BigInt(row.reservedUnobservedSpendMinor),
    sourceBidMinor: BigInt(row.sourceBidMinor),
    spendLimitMinor: BigInt(row.spendLimitMinor),
    spendSafetyBufferMinor: BigInt(row.spendSafetyBufferMinor),
    status: row.status,
    terminalReasonCode: row.terminalReasonCode,
  });
}

/**
 * Builds a deterministic durable revert decision.
 *
 * @param row - Experiment state.
 * @param bidMinor - Currently legal revert target.
 * @param policy - Active policy.
 * @param now - Decision time.
 * @returns Queue-eligible decision result.
 */
function revertDecision(
  row: ExperimentRuntimeRow,
  bidMinor: bigint,
  policy: DecisionPolicy,
  now: Date,
): DecisionResult {
  const current = BigInt(row.currentBidMinor ?? row.experimentBidMinor);
  const inputSnapshotChecksum = scopedChecksum('experiment-revert-input-v1', {
    bidMinor,
    experimentId: row.id,
    policyVersion: policy.version,
  });
  return Object.freeze({
    action: bidMinor > current ? 'INCREASE' : bidMinor < current ? 'DECREASE' : 'NO_CHANGE',
    boundedBidMinor: bidMinor,
    decisionInputChecksum: scopedChecksum('experiment-revert-decision-v1', {
      inputSnapshotChecksum,
      now,
    }),
    explanation: Object.freeze({
      actionBlockers: Object.freeze([]),
      buckets: Object.freeze([]),
      candidates: Object.freeze([]),
      inputSnapshotChecksum,
      reservedUnobservedSpendMinor: 0n,
      unconditionalBlockers: Object.freeze([]),
    }),
    guardrailCodes: Object.freeze([]),
    outcomeReasonCode: 'EXPLORATION_REVERT_REQUESTED',
    proposedBidMinor: bidMinor,
    queueEligible: bidMinor !== current,
    strategyReasonCode: 'EXPLORATION_REVERT',
  });
}
