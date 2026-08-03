import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIGURATION } from '../application-config.js';
import { DATABASE_CLIENT } from '../database.js';
import { ObservabilityService } from '../observability.service.js';
import { DECISION_REPOSITORY } from '../runtime.providers.js';
import { RuntimeSafetyState } from '../runtime-state.js';
import { RuntimeClockService } from '../runtime-clock.service.js';
import {
  addIsoCalendarDays,
  formatAccountLocalDate,
  type AppConfiguration,
} from '@wb-bidder/config';
import type { DatabaseClient } from '@wb-bidder/database';
import {
  advanceExperiment,
  confirmExperimentRevert,
  DecisionRepository,
  resolveExperimentRevert,
} from '@wb-bidder/decision-engine';
import { Injectable } from '@nestjs/common';
import { EXPERIMENT_PAGE_SIZE, type ExperimentRuntimeRow } from './experiment-runtime.types.js';
import { resolveExperimentPolicy, currentExperimentPolicy } from './experiment-policy.resolver.js';
import { toState, revertDecision } from './experiment-state.mapper.js';

/**
 *
 */
@Injectable()
export class ExperimentRuntimeService {
  /**
   * Creates the lifecycle worker.
   *
   * @param database - Authoritative Prisma Client.
   * @param configuration - Revert deadline and write gates.
   * @param decisions - Atomic decision/queue repository.
   * @param runtimeState - Process-level close-only write gates.
   * @param observability - Experiment metrics.
   * @param clock - Wall or deterministic mock model clock.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
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
    const experiments = await this.database.bidExperiment.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: EXPERIMENT_PAGE_SIZE,
      where: {
        status: { in: ['PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING'] },
      },
      include: {
        target: {
          include: {
            automation: { select: { mode: true } },
            campaign: {
              include: { automation: { select: { mode: true } } },
            },
            dataSnapshots: {
              orderBy: { createdAt: 'desc' },
              select: { applyEligible: true },
              take: 1,
            },
          },
        },
      },
    });
    for (const experiment of experiments) {
      const [policy, economics] = await Promise.all([
        resolveExperimentPolicy(
          this.database,
          experiment.targetId,
          experiment.target.campaignId,
          now,
        ),
        this.database.productEconomics.findFirst({
          orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
          select: {
            expectedContributionBeforeAdsMinor: true,
            id: true,
            version: true,
          },
          where: {
            effectiveFrom: { lte: now },
            nmId: experiment.target.nmId,
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        }),
      ]);
      const row: ExperimentRuntimeRow = {
        actualRevertBidMinor: experiment.actualRevertBidMinor,
        activePolicyConfiguration: policy?.configuration ?? null,
        activePolicyId: policy?.id ?? null,
        activePolicyVersion: policy?.version ?? null,
        applyEligible: experiment.target.dataSnapshots[0]?.applyEligible ?? null,
        campaignAutomation: experiment.target.campaign.automation?.mode ?? null,
        capability: experiment.target.capability,
        collectedEligibleDays: experiment.collectedEligibleDays,
        completedAt: experiment.completedAt,
        currentBidMinor: experiment.target.currentBidMinor,
        desiredRevertBidMinor: experiment.desiredRevertBidMinor,
        economicsId: economics?.id ?? null,
        economicsVersion: economics?.version ?? null,
        evaluationNotBefore: experiment.evaluationNotBefore,
        expectedContributionMinor: economics?.expectedContributionBeforeAdsMinor ?? null,
        experimentBidMinor: experiment.experimentBidMinor,
        id: experiment.id,
        observedExperimentSpendMinor: experiment.observedExperimentSpendMinor,
        plannedFullDays: experiment.plannedFullDays,
        reservedUnobservedSpendMinor: experiment.reservedUnobservedSpendMinor,
        revertDeadlineAt: experiment.revertDeadlineAt,
        revertDecisionId: experiment.revertDecisionId,
        revertStartedAt: experiment.revertStartedAt,
        sourceBidMinor: experiment.sourceBidMinor,
        spendLimitMinor: experiment.spendLimitMinor,
        spendSafetyBufferMinor: experiment.spendSafetyBufferMinor,
        startDecisionId: experiment.startDecisionId,
        startedAt: experiment.startedAt,
        status: experiment.status,
        targetAutomation: experiment.target.automation?.mode ?? null,
        targetId: experiment.targetId,
        terminalReasonCode: experiment.terminalReasonCode,
        wbMinimumBidMinor: experiment.target.minimumBidMinor,
      };
      await this.advance(row, now);
    }
    return experiments.length;
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
    const state = await this.database.decisionQueueItem.findUnique({
      select: { status: true, verifiedAt: true },
      where: { decisionId: row.startDecisionId },
    });
    if (state?.status === 'APPLIED') {
      const startedAt = state.verifiedAt ?? now;
      const firstEligibleDate = addIsoCalendarDays(
        formatAccountLocalDate(this.configuration.accountTimezone, startedAt),
        1,
      );
      await this.database.bidExperiment.updateMany({
        data: {
          firstEligibleDate: new Date(`${firstEligibleDate}T00:00:00.000Z`),
          startedAt,
          status: 'ACTIVE',
        },
        where: { id: row.id, status: 'PLANNED' },
      });
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
    const startDate = new Date(`${row.startedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const firstEligibleDate = new Date(startDate.getTime() + 86_400_000);
    const [eligible, spend] = await Promise.all([
      this.database.bidPerformanceDay.aggregate({
        _count: { _all: true },
        _max: { statisticsFinalizedAt: true },
        where: {
          confirmedBidMinor: row.experimentBidMinor,
          status: 'FINALIZED',
          targetId: row.targetId,
          wbStatisticDate: { gte: firstEligibleDate },
        },
      }),
      this.database.bidPerformanceDay.aggregate({
        _sum: { spendDeltaMinor: true },
        where: {
          status: 'FINALIZED',
          targetId: row.targetId,
          wbStatisticDate: { gte: startDate },
        },
      }),
    ]);
    const configurationValid =
      row.currentBidMinor === row.experimentBidMinor &&
      row.capability === 'CARD_WRITE_READY' &&
      row.applyEligible === true &&
      row.activePolicyId !== null &&
      row.activePolicyVersion !== null &&
      row.campaignAutomation === 'APPLY' &&
      (row.targetAutomation === null || row.targetAutomation === 'APPLY');
    const evaluationNotBefore = eligible._max.statisticsFinalizedAt ?? now;
    const state = advanceExperiment(toState(row), {
      collectedEligibleDays: eligible._count._all,
      configurationValid,
      evaluationNotBefore,
      now,
      observedExperimentSpendMinor: spend._sum.spendDeltaMinor ?? 0n,
      reservedUnobservedSpendMinor: 0n,
    });
    const reverting = state.status === 'REVERTING';
    await this.database.bidExperiment.update({
      data: {
        collectedEligibleDays: state.collectedEligibleDays,
        evaluationNotBefore: state.evaluationNotBefore,
        observedExperimentSpendMinor: state.observedExperimentSpendMinor,
        reservedUnobservedSpendMinor: state.reservedUnobservedSpendMinor,
        revertDeadlineAt: reverting
          ? (row.revertDeadlineAt ??
            new Date(now.getTime() + this.configuration.writePipeline.experimentRevertDeadlineMs))
          : null,
        revertStartedAt: reverting ? (row.revertStartedAt ?? now) : null,
        status: state.status,
        terminalReasonCode: state.terminalReasonCode,
      },
      where: { id: row.id },
    });
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
    const observed = await this.database.bidDecision.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        boundedBidMinor: true,
        id: true,
        outcomeReasonCode: true,
      },
      where: {
        ...(row.evaluationNotBefore === null
          ? {}
          : { createdAt: { gte: row.evaluationNotBefore } }),
        strategyReasonCode: { notIn: ['EXPLORATION_PLANNED', 'EXPLORATION_REVERT'] },
        targetId: row.targetId,
      },
    });
    if (observed === null) return;
    if (
      observed.boundedBidMinor === row.experimentBidMinor &&
      !['INSUFFICIENT_DATA', 'INSUFFICIENT_BID_RESPONSE_DATA'].includes(observed.outcomeReasonCode)
    ) {
      await this.database.bidExperiment.updateMany({
        data: {
          completedAt: now,
          resultDecisionId: observed.id,
          status: 'ACCEPTED',
          terminalReasonCode: 'EXPLORATION_ACCEPTED',
        },
        where: { id: row.id, status: 'EVALUATING' },
      });
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
      const result = await this.database.decisionQueueItem.findUnique({
        select: { status: true, verifiedAt: true },
        where: { decisionId: row.revertDecisionId },
      });
      if (result?.status === 'APPLIED' && row.currentBidMinor !== null) {
        const terminal = confirmExperimentRevert(
          toState(row),
          row.currentBidMinor,
          result.verifiedAt ?? now,
        );
        await this.database.bidExperiment.update({
          data: {
            actualRevertBidMinor: terminal.actualRevertBidMinor,
            completedAt: terminal.completedAt,
            status: terminal.status,
            terminalReasonCode: terminal.terminalReasonCode,
          },
          where: { id: row.id },
        });
        this.observability.bidExperimentReverts.inc({ reason: terminal.status.toLowerCase() });
      }
      return;
    }
    const policy = currentExperimentPolicy(row);
    const instruction = resolveExperimentRevert(toState(row), {
      capabilityAvailable: row.capability === 'CARD_WRITE_READY' && row.applyEligible === true,
      now,
      policyMaxBidMinor: policy?.policyMaxBidMinor ?? 0n,
      policyMinBidMinor: policy?.policyMinBidMinor ?? null,
      quantumMinor: 1n,
      wbMinimumBidMinor: row.wbMinimumBidMinor,
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
    if (instruction.bidMinor === row.currentBidMinor) {
      const terminal = confirmExperimentRevert(toState(row), instruction.bidMinor, now);
      await this.database.bidExperiment.update({
        data: {
          actualRevertBidMinor: instruction.bidMinor,
          completedAt: now,
          status: terminal.status,
          terminalReasonCode: terminal.terminalReasonCode,
        },
        where: { id: row.id },
      });
      return;
    }
    const decisionResult = revertDecision(row, instruction.bidMinor, policy, now);
    const persisted = await this.decisions.persistDecision({
      calculatedAt: now,
      currentBidMinor: row.currentBidMinor,
      economicsId: row.economicsId,
      economicsVersion: row.economicsVersion,
      expectedContributionMinor: row.expectedContributionMinor,
      periodEnd: now.toISOString().slice(0, 10),
      periodStart: now.toISOString().slice(0, 10),
      policyId: row.activePolicyId,
      policyVersion: row.activePolicyVersion,
      result: decisionResult,
      targetId: row.targetId,
    });
    await this.database.bidExperiment.updateMany({
      data: {
        revertDecisionId: persisted.decisionId,
        terminalReasonCode: instruction.constrained
          ? 'EXPLORATION_REVERT_CONSTRAINED_PENDING'
          : 'EXPLORATION_REVERT_PENDING',
      },
      where: { id: row.id, status: 'REVERTING' },
    });
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
    const current = await this.database.bidExperiment.findUnique({
      select: { revertDeadlineAt: true, revertStartedAt: true },
      where: { id },
    });
    await this.database.bidExperiment.updateMany({
      data: {
        revertDeadlineAt:
          current?.revertDeadlineAt ??
          new Date(now.getTime() + this.configuration.writePipeline.experimentRevertDeadlineMs),
        revertStartedAt: current?.revertStartedAt ?? now,
        status: 'REVERTING',
        terminalReasonCode: reason,
      },
      where: { id, status: 'EVALUATING' },
    });
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
    await this.database.$transaction(async (transaction) => {
      await transaction.bidExperiment.update({
        data: { completedAt: now, status, terminalReasonCode: reason },
        where: { id: row.id },
      });
      if (disableTarget) {
        await transaction.targetAutomation.upsert({
          create: {
            id: randomUUID(),
            mode: 'DISABLED',
            reason,
            targetId: row.targetId,
            updatedBy: 'SYSTEM',
          },
          update: {
            mode: 'DISABLED',
            reason,
            updatedBy: 'SYSTEM',
            version: { increment: 1 },
          },
          where: { targetId: row.targetId },
        });
      }
    });
    this.observability.bidExperimentReverts.inc({ reason: status.toLowerCase() });
  }
}
