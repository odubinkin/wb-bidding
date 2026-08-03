/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';
import { scopedChecksum } from '../checksum.js';
import { validateDecisionPolicy } from '../policy.js';
import type { DecisionPolicy } from '../types.js';
import {
  advisoryTransactionLock,
  withTransaction,
  type DatabaseTransaction,
} from '@wb-bidder/database';
import type { ExperimentPlanWrite } from './types.js';
import { validatePolicyScope, appendAudit, policyReplay, prismaJson } from './helpers.js';
import { DecisionEconomicsRepositoryBase } from './economics.js';

/** Cohesive decision repository capability layer. */
export class DecisionPolicyRepositoryBase extends DecisionEconomicsRepositoryBase {
  public async createPolicyVersion(request: {
    readonly actor: string;
    readonly campaignId: string | null;
    readonly changeReason?: string;
    readonly configuration: DecisionPolicy;
    readonly correlationId: string;
    readonly enabled?: boolean;
    readonly expectedCurrentVersion?: bigint;
    readonly idempotencyKey?: string;
    readonly idempotencyInput?: unknown;
    readonly idempotencyScope?: string;
    readonly scope: 'CAMPAIGN' | 'DEPLOYMENT' | 'TARGET';
    readonly supersedeQueued?: boolean;
    readonly targetId: string | null;
    readonly validFrom: Date;
  }): Promise<{ readonly id: string; readonly version: bigint }> {
    validateDecisionPolicy(request.configuration);
    validatePolicyScope(request);
    const idempotencyChecksum = scopedChecksum(
      'policy-admin-mutation-v1',
      request.idempotencyInput ?? {
        campaignId: request.campaignId,
        changeReason: request.changeReason ?? null,
        configuration: request.configuration,
        enabled: request.enabled ?? true,
        expectedCurrentVersion: request.expectedCurrentVersion ?? null,
        scope: request.scope,
        supersedeQueued: request.supersedeQueued ?? false,
        targetId: request.targetId,
        validFrom: request.validFrom,
      },
    );
    return withTransaction(this.database, async (transaction) => {
      if (request.idempotencyKey !== undefined && request.idempotencyScope !== undefined) {
        await advisoryTransactionLock(
          transaction,
          `admin-idempotency:${request.idempotencyScope}:${request.idempotencyKey}`,
        );
        const replay = await transaction.idempotencyRecord.findUnique({
          select: { requestChecksum: true, responseBody: true },
          where: {
            scope_idempotencyKey: {
              idempotencyKey: request.idempotencyKey,
              scope: request.idempotencyScope,
            },
          },
        });
        if (replay !== null) {
          if (replay.requestChecksum !== idempotencyChecksum) {
            throw new Error('IDEMPOTENCY_KEY_REUSED');
          }
          return policyReplay(replay.responseBody);
        }
      }
      await advisoryTransactionLock(
        transaction,
        `policy:${request.scope}:${request.campaignId ?? ''}:${request.targetId ?? ''}`,
      );
      const scopeWhere = {
        campaignId: request.campaignId,
        scope: request.scope,
        targetId: request.targetId,
      } as const;
      const [current, latest] = await Promise.all([
        transaction.biddingPolicy.findFirst({
          orderBy: { version: 'desc' },
          select: { id: true, version: true },
          where: { ...scopeWhere, enabled: true, validTo: null },
        }),
        transaction.biddingPolicy.findFirst({
          orderBy: { version: 'desc' },
          select: { version: true },
          where: scopeWhere,
        }),
      ]);
      const enabled = request.enabled ?? true;
      if (
        request.expectedCurrentVersion !== undefined &&
        (current?.version ?? 0n) !== request.expectedCurrentVersion
      ) {
        throw new Error('VERSION_MISMATCH');
      }
      if (enabled && current !== null) {
        await transaction.biddingPolicy.update({
          data: { validTo: request.validFrom },
          where: { id: current.id },
        });
      }
      const version = (latest?.version ?? 0n) + 1n;
      const id = randomUUID();
      const checksum = scopedChecksum('bidding-policy-v1', request.configuration);
      await transaction.biddingPolicy.create({
        data: {
          campaignId: request.campaignId,
          configuration: prismaJson(request.configuration),
          createdByActor: request.actor,
          enabled,
          executionMode: request.configuration.executionMode,
          id,
          inputChecksum: checksum,
          scope: request.scope,
          targetId: request.targetId,
          validFrom: request.validFrom,
          version,
        },
      });
      await appendAudit(
        transaction,
        request.actor,
        'BIDDING_POLICY_VERSION_CREATED',
        id,
        request.correlationId,
        {
          checksum,
          changeReason: request.changeReason ?? null,
          idempotencyKey: request.idempotencyKey ?? null,
          scope: request.scope,
          version,
        },
        current,
      );
      if (enabled && request.supersedeQueued === true) {
        await transaction.decisionQueueItem.updateMany({
          data: { status: 'SUPERSEDED', version: { increment: 1 } },
          where: {
            status: { in: ['QUEUED', 'RETRY_WAIT'] },
            decision:
              request.scope === 'TARGET'
                ? { targetId: request.targetId ?? '' }
                : request.scope === 'CAMPAIGN'
                  ? { target: { campaignId: request.campaignId ?? '' } }
                  : {},
          },
        });
      }
      if (request.idempotencyKey !== undefined && request.idempotencyScope !== undefined) {
        await transaction.idempotencyRecord.create({
          data: {
            expiresAt: new Date(Date.now() + 400 * 86_400_000),
            id: randomUUID(),
            idempotencyKey: request.idempotencyKey,
            requestChecksum: idempotencyChecksum,
            responseBody: prismaJson({ id, version }),
            responseHeaders: {},
            responseStatus: 201,
            scope: request.idempotencyScope,
          },
        });
      }
      return Object.freeze({ id, version });
    });
  }

  public async resolvePolicy(
    targetId: string,
    campaignId: string,
    at: Date,
  ): Promise<{
    readonly configuration: unknown;
    readonly id: string;
    readonly version: bigint;
  } | null> {
    const common = {
      enabled: true,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    };
    const select = { configuration: true, id: true, version: true } as const;
    const [target, campaign, deployment] = await Promise.all([
      this.database.biddingPolicy.findFirst({
        orderBy: { version: 'desc' },
        select,
        where: { ...common, scope: 'TARGET', targetId },
      }),
      this.database.biddingPolicy.findFirst({
        orderBy: { version: 'desc' },
        select,
        where: { ...common, campaignId, scope: 'CAMPAIGN' },
      }),
      this.database.biddingPolicy.findFirst({
        orderBy: { version: 'desc' },
        select,
        where: { ...common, scope: 'DEPLOYMENT' },
      }),
    ]);
    const policy = target ?? campaign ?? deployment;
    return policy === null ? null : Object.freeze(policy);
  }

  protected async assertExperimentCapacity(
    transaction: DatabaseTransaction,
    targetId: string,
    plan: ExperimentPlanWrite,
  ): Promise<void> {
    await advisoryTransactionLock(transaction, 'experiment-account');
    const target = await transaction.campaignTarget.findUnique({
      select: { campaignId: true },
      where: { id: targetId },
    });
    if (target === null) throw new Error('EXPERIMENT_TARGET_NOT_FOUND');
    const activeStatuses = ['PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING'] as const;
    const [accountCount, campaignCount, targetCount] = await Promise.all([
      transaction.bidExperiment.count({ where: { status: { in: [...activeStatuses] } } }),
      transaction.bidExperiment.count({
        where: {
          status: { in: [...activeStatuses] },
          target: { campaignId: target.campaignId },
        },
      }),
      transaction.bidExperiment.count({
        where: { status: { in: [...activeStatuses] }, targetId },
      }),
    ]);
    if (targetCount > 0) throw new Error('EXPERIMENT_ALREADY_ACTIVE');
    if (campaignCount >= plan.maxConcurrentPerCampaign) {
      throw new Error('EXPERIMENT_CAMPAIGN_CONCURRENCY_LIMIT');
    }
    if (accountCount >= plan.maxConcurrentPerAccount) {
      throw new Error('EXPERIMENT_ACCOUNT_CONCURRENCY_LIMIT');
    }
  }
}
