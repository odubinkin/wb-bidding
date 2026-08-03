/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';
import { uuidV7 } from '../ids.js';
import type { DecisionResult } from '../types.js';
import { advisoryTransactionLock, withTransaction } from '@wb-bidder/database';
import type { ExperimentPlanWrite } from './types.js';
import { assertSameDecision, prismaJson, isoDate, decisionPriority } from './helpers.js';
import { DecisionPolicyRepositoryBase } from './policy.js';

/** Cohesive decision repository capability layer. */
export class DecisionPersistenceRepositoryBase extends DecisionPolicyRepositoryBase {
  public async persistDecision(request: {
    readonly calculatedAt: Date;
    readonly currentBidMinor: bigint | null;
    readonly economicsId: string | null;
    readonly economicsVersion: bigint | null;
    readonly experiment?: ExperimentPlanWrite;
    readonly expectedContributionMinor: bigint | null;
    readonly periodEnd: string;
    readonly periodStart: string;
    readonly policyId: string;
    readonly policyVersion: bigint;
    readonly result: DecisionResult;
    readonly targetId: string;
  }): Promise<{ readonly created: boolean; readonly decisionId: string }> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `decision:${request.targetId}`);
      const existingMetric = await transaction.metricSnapshot.findUnique({
        select: { id: true },
        where: {
          targetId_inputSnapshotChecksum: {
            inputSnapshotChecksum: request.result.explanation.inputSnapshotChecksum,
            targetId: request.targetId,
          },
        },
      });
      const metricId =
        existingMetric?.id ??
        (
          await transaction.metricSnapshot.create({
            data: {
              algorithmVersion: 'rules-v1',
              calculatedAt: request.calculatedAt,
              candidateEstimates: prismaJson(request.result.explanation.candidates),
              completenessFlags: [...request.result.guardrailCodes],
              expectedContributionBeforeAdsMinor: request.expectedContributionMinor,
              id: randomUUID(),
              inputSnapshotChecksum: request.result.explanation.inputSnapshotChecksum,
              inputSnapshotSchema: 'input-snapshot-v1',
              metrics: prismaJson({ buckets: request.result.explanation.buckets }),
              periodEnd: isoDate(request.periodEnd),
              periodStart: isoDate(request.periodStart),
              policyId: request.policyId,
              productEconomicsId: request.economicsId,
              productEconomicsVersion: request.economicsVersion,
              targetId: request.targetId,
            },
            select: { id: true },
          })
        ).id;
      const replay = await transaction.bidDecision.findUnique({
        select: {
          action: true,
          boundedBidMinor: true,
          id: true,
          outcomeReasonCode: true,
        },
        where: { decisionInputChecksum: request.result.decisionInputChecksum },
      });
      if (replay !== null) {
        assertSameDecision(replay, request.result);
        return Object.freeze({ created: false, decisionId: replay.id });
      }
      if (request.experiment !== undefined) {
        await this.assertExperimentCapacity(transaction, request.targetId, request.experiment);
      }
      await transaction.decisionQueueItem.updateMany({
        data: { status: 'SUPERSEDED' },
        where: {
          decision: { targetId: request.targetId },
          status: { in: ['QUEUED', 'RETRY_WAIT'] },
        },
      });
      const decisionId = uuidV7(request.calculatedAt);
      await transaction.bidDecision.create({
        data: {
          action: request.result.action,
          algorithmVersion: 'rules-v1',
          boundedBidMinor: request.result.boundedBidMinor,
          createdAt: request.calculatedAt,
          currentBidMinor: request.currentBidMinor,
          decisionInputChecksum: request.result.decisionInputChecksum,
          explanation: prismaJson(request.result.explanation),
          guardrailCodes: [...request.result.guardrailCodes],
          id: decisionId,
          metricSnapshotId: metricId,
          outcomeReasonCode: request.result.outcomeReasonCode,
          policyVersion: request.policyVersion,
          proposedBidMinor: request.result.proposedBidMinor,
          strategyReasonCode: request.result.strategyReasonCode,
          targetId: request.targetId,
        },
      });
      if (request.result.queueEligible) {
        await transaction.decisionQueueItem.create({
          data: {
            availableAt: new Date(),
            decisionId,
            id: randomUUID(),
            priority: decisionPriority(request.result),
            status: 'QUEUED',
          },
        });
      }
      if (request.experiment !== undefined) {
        await transaction.bidExperiment.create({
          data: {
            algorithmVersion: 'rules-v1',
            desiredRevertBidMinor: request.experiment.sourceBidMinor,
            experimentBidMinor: request.experiment.experimentBidMinor,
            experimentReasonCode: 'EXPLORATION_PLANNED',
            id: randomUUID(),
            plannedFullDays: request.experiment.plannedFullDays,
            policyVersion: request.policyVersion,
            sourceBidMinor: request.experiment.sourceBidMinor,
            spendLimitMinor: request.experiment.spendLimitMinor,
            spendSafetyBufferMinor: request.experiment.spendSafetyBufferMinor,
            startDecisionId: decisionId,
            status: 'PLANNED',
            targetId: request.targetId,
          },
        });
      }
      return Object.freeze({ created: true, decisionId });
    });
  }
}
