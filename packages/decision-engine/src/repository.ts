/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';

import { normalizeCanonical, scopedChecksum } from './checksum.js';
import { uuidV7 } from './ids.js';
import { validateDecisionPolicy } from './policy.js';
import type { DecisionPolicy, DecisionResult } from './types.js';
import {
  Prisma,
  advisoryTransactionLock,
  claimEconomicsImportRecord,
  withTransaction,
  type DatabaseClient,
  type DatabaseTransaction,
} from '@wb-bidder/database';

/** Atomic lower-only experiment creation accompanying its starting decision. */
export interface ExperimentPlanWrite {
  readonly experimentBidMinor: bigint;
  readonly maxConcurrentPerAccount: number;
  readonly maxConcurrentPerCampaign: number;
  readonly plannedFullDays: number;
  readonly sourceBidMinor: bigint;
  readonly spendLimitMinor: bigint;
  readonly spendSafetyBufferMinor: bigint;
}

/** Conditional immutable product-economics mutation. */
export interface EconomicsMutation {
  readonly actor: string;
  readonly changeReason?: string;
  readonly contributionMinor: bigint;
  readonly correlationId: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly expectedCurrentVersion: bigint;
  readonly mutationKey: string;
  readonly idempotencyKey?: string;
  readonly nmId: bigint;
  readonly source: 'IMPORT' | 'MANUAL';
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/** One asynchronous economics import row. */
export interface EconomicsImportRow {
  readonly contributionMinor: bigint;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly expectedCurrentVersion: bigint;
  readonly nmId: bigint;
  readonly rowId: string;
  readonly sourceReference?: string;
  readonly sourceUpdatedAt?: Date;
}

/** Prisma persistence for immutable economics, policies, snapshots, and decisions. */
export class DecisionRepository {
  /**
   * Creates a repository.
   *
   * @param database - Shared Prisma Client.
   */
  public constructor(private readonly database: DatabaseClient) {}

  public async createEconomicsVersion(
    mutation: EconomicsMutation,
  ): Promise<{ readonly created: boolean; readonly id: string; readonly version: bigint }> {
    validateEconomicsMutation(mutation);
    const checksum = scopedChecksum('product-economics-v1', {
      changeReason: mutation.changeReason ?? null,
      contributionMinor: mutation.contributionMinor,
      effectiveFrom: mutation.effectiveFrom,
      effectiveTo: mutation.effectiveTo ?? null,
      nmId: mutation.nmId,
      source: mutation.source,
      sourceReference: mutation.sourceReference ?? null,
      sourceUpdatedAt: mutation.sourceUpdatedAt ?? null,
    });
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `admin-idempotency:product-economics:${mutation.mutationKey}`,
      );
      await advisoryTransactionLock(transaction, `economics:${mutation.nmId.toString()}`);
      const replay = await transaction.productEconomics.findUnique({
        select: { id: true, inputChecksum: true, version: true },
        where: { mutationKey: mutation.mutationKey },
      });
      if (replay !== null) {
        if (replay.inputChecksum !== checksum) throw new Error('IDEMPOTENCY_KEY_REUSED');
        return Object.freeze({ created: false, id: replay.id, version: replay.version });
      }
      const current = await transaction.productEconomics.findFirst({
        orderBy: { effectiveFrom: 'desc' },
        select: {
          effectiveFrom: true,
          effectiveTo: true,
          expectedContributionBeforeAdsMinor: true,
          id: true,
          version: true,
        },
        where: {
          effectiveFrom: { lt: mutation.effectiveFrom },
          nmId: mutation.nmId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: mutation.effectiveFrom } }],
        },
      });
      const actualVersion = current?.version ?? 0n;
      if (actualVersion !== mutation.expectedCurrentVersion) {
        throw new Error(
          `VERSION_CONFLICT expected=${mutation.expectedCurrentVersion.toString()} actual=${actualVersion.toString()}`,
        );
      }
      if (current !== null) {
        await transaction.productEconomics.update({
          data: { effectiveTo: mutation.effectiveFrom },
          where: { id: current.id },
        });
      }
      const id = randomUUID();
      const version = actualVersion + 1n;
      await transaction.productEconomics.create({
        data: {
          createdByActor: mutation.actor,
          effectiveFrom: mutation.effectiveFrom,
          effectiveTo: mutation.effectiveTo ?? null,
          expectedContributionBeforeAdsMinor: mutation.contributionMinor,
          id,
          inputChecksum: checksum,
          mutationKey: mutation.mutationKey,
          nmId: mutation.nmId,
          source: mutation.source,
          sourceReference: mutation.sourceReference ?? null,
          sourceUpdatedAt: mutation.sourceUpdatedAt ?? null,
          version,
        },
      });
      await appendAudit(
        transaction,
        mutation.actor,
        'PRODUCT_ECONOMICS_VERSION_CREATED',
        id,
        mutation.correlationId,
        {
          changeReason: mutation.changeReason ?? null,
          contributionMinor: mutation.contributionMinor,
          effectiveFrom: mutation.effectiveFrom,
          effectiveTo: mutation.effectiveTo ?? null,
          idempotencyKey: mutation.idempotencyKey ?? null,
          nmId: mutation.nmId,
          version,
        },
        current,
      );
      return Object.freeze({ created: true, id, version });
    });
  }

  public async enqueueEconomicsImport(request: {
    readonly actor: string;
    readonly changeReason?: string;
    readonly correlationId: string;
    readonly dryRun: boolean;
    readonly idempotencyKey: string;
    readonly idempotencyScope: string;
    readonly rows: readonly EconomicsImportRow[];
  }): Promise<{ readonly created: boolean; readonly importId: string }> {
    validateImportRequest(request.rows);
    const requestChecksum = scopedChecksum('product-economics-import-v1', {
      changeReason: request.changeReason ?? null,
      dryRun: request.dryRun,
      rows: request.rows,
    });
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `admin-idempotency:${request.idempotencyScope}:${request.idempotencyKey}`,
      );
      const existing = await transaction.productEconomicsImport.findUnique({
        select: { id: true, requestChecksum: true },
        where: {
          idempotencyScope_idempotencyKey: {
            idempotencyKey: request.idempotencyKey,
            idempotencyScope: request.idempotencyScope,
          },
        },
      });
      if (existing !== null) {
        if (existing.requestChecksum !== requestChecksum) {
          throw new Error('IDEMPOTENCY_KEY_REUSED');
        }
        return Object.freeze({ created: false, importId: existing.id });
      }
      const importId = randomUUID();
      await transaction.productEconomicsImport.create({
        data: {
          changeReason: request.changeReason ?? 'unspecified import',
          correlationId: request.correlationId,
          createdByActor: request.actor,
          dryRun: request.dryRun,
          id: importId,
          idempotencyKey: request.idempotencyKey,
          idempotencyScope: request.idempotencyScope,
          requestChecksum,
          status: 'QUEUED',
          totalItems: request.rows.length,
          items: {
            createMany: {
              data: request.rows.map((row) => ({
                expectedCurrentVersion: row.expectedCurrentVersion,
                id: randomUUID(),
                nmId: row.nmId,
                normalizedInput: prismaJson(row),
                rowChecksum: scopedChecksum('product-economics-import-row-v1', row),
                rowId: row.rowId,
                status: 'PENDING',
              })),
            },
          },
        },
      });
      await appendAudit(
        transaction,
        request.actor,
        'PRODUCT_ECONOMICS_IMPORT_QUEUED',
        importId,
        request.correlationId,
        {
          changeReason: request.changeReason ?? null,
          dryRun: request.dryRun,
          idempotencyKey: request.idempotencyKey,
          requestChecksum,
          totalItems: request.rows.length,
        },
      );
      return Object.freeze({ created: true, importId });
    });
  }

  public async processNextEconomicsImport(workerId: string): Promise<string | null> {
    const claimed = await this.claimImport(workerId);
    if (claimed === null) return null;
    const items = await this.database.productEconomicsImportItem.findMany({
      orderBy: { rowId: 'asc' },
      where: {
        importId: claimed.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    for (const stored of items) {
      const heartbeat = await this.database.productEconomicsImport.updateMany({
        data: { leaseUntil: new Date(Date.now() + 5 * 60_000) },
        where: { id: claimed.id, leaseOwner: claimed.workerId, status: 'PROCESSING' },
      });
      if (heartbeat.count !== 1) throw new Error('ECONOMICS_IMPORT_LEASE_LOST');
      const processing = await this.database.productEconomicsImportItem.updateMany({
        data: { errorCode: null, errorDetail: null, status: 'PROCESSING' },
        where: { id: stored.id, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (processing.count !== 1) continue;
      const item = importItem(stored);
      try {
        const mutation = importMutation(claimed, item);
        validateEconomicsMutation(mutation);
        if (claimed.dryRun) {
          await this.database.productEconomicsImportItem.updateMany({
            data: { status: 'VALIDATED' },
            where: { id: item.id, status: 'PROCESSING' },
          });
        } else {
          const created = await this.createEconomicsVersion(mutation);
          await this.database.productEconomicsImportItem.updateMany({
            data: { createdVersion: created.version, status: 'SUCCEEDED' },
            where: { id: item.id, status: 'PROCESSING' },
          });
        }
      } catch (error: unknown) {
        await this.database.productEconomicsImportItem.updateMany({
          data: {
            errorCode: classifyImportError(error),
            errorDetail: safeMessage(error),
            status: 'FAILED',
          },
          where: { id: item.id, status: 'PROCESSING' },
        });
      }
    }
    const statuses = await this.database.productEconomicsImportItem.groupBy({
      _count: { _all: true },
      by: ['status'],
      where: { importId: claimed.id },
    });
    const count = (status: 'FAILED' | 'SUCCEEDED' | 'VALIDATED'): number =>
      statuses.find((row) => row.status === status)?._count._all ?? 0;
    const failed = count('FAILED');
    const succeeded = count('SUCCEEDED');
    const validated = count('VALIDATED');
    const processed = failed + succeeded + validated;
    const completed = await this.database.productEconomicsImport.updateMany({
      data: {
        failedItems: failed,
        finishedAt: new Date(),
        leaseOwner: null,
        leaseUntil: null,
        processedItems: processed,
        status: failed === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS',
        succeededItems: succeeded,
        validatedItems: validated,
      },
      where: { id: claimed.id, leaseOwner: claimed.workerId, status: 'PROCESSING' },
    });
    if (completed.count !== 1) throw new Error('ECONOMICS_IMPORT_LEASE_LOST');
    return claimed.id;
  }

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

  private async assertExperimentCapacity(
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

  private async claimImport(workerId: string): Promise<ClaimedImport | null> {
    const row = await claimEconomicsImportRecord(this.database, workerId);
    return row === null
      ? null
      : Object.freeze({
          actor: row.createdByActor,
          changeReason: row.changeReason,
          correlationId: row.correlationId,
          dryRun: row.dryRun,
          id: row.id,
          workerId,
        });
  }
}

interface ClaimedImport {
  readonly actor: string;
  readonly changeReason: string;
  readonly correlationId: string;
  readonly dryRun: boolean;
  readonly id: string;
  readonly workerId: string;
}

interface ImportItemRow {
  readonly expectedCurrentVersion: bigint;
  readonly id: string;
  readonly nmId: bigint;
  readonly normalizedInput: {
    readonly contributionMinor: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string | null;
    readonly sourceReference?: string;
    readonly sourceUpdatedAt?: string;
  };
  readonly rowId: string;
}

interface DecisionReplayRow {
  readonly action: string;
  readonly boundedBidMinor: bigint | null;
  readonly id: string;
  readonly outcomeReasonCode: string;
}

function importItem(stored: {
  readonly expectedCurrentVersion: bigint;
  readonly id: string;
  readonly nmId: bigint;
  readonly normalizedInput: Prisma.JsonValue;
  readonly rowId: string;
}): ImportItemRow {
  if (
    typeof stored.normalizedInput !== 'object' ||
    stored.normalizedInput === null ||
    Array.isArray(stored.normalizedInput)
  ) {
    throw new Error('INVALID_PRODUCT_ECONOMICS');
  }
  return {
    expectedCurrentVersion: stored.expectedCurrentVersion,
    id: stored.id,
    nmId: stored.nmId,
    normalizedInput: stored.normalizedInput as unknown as ImportItemRow['normalizedInput'],
    rowId: stored.rowId,
  };
}

function importMutation(claimed: ClaimedImport, item: ImportItemRow): EconomicsMutation {
  return {
    actor: claimed.actor,
    changeReason: claimed.changeReason,
    contributionMinor: BigInt(item.normalizedInput.contributionMinor),
    correlationId: claimed.correlationId,
    effectiveFrom: new Date(item.normalizedInput.effectiveFrom),
    effectiveTo:
      item.normalizedInput.effectiveTo === undefined || item.normalizedInput.effectiveTo === null
        ? null
        : new Date(item.normalizedInput.effectiveTo),
    expectedCurrentVersion: item.expectedCurrentVersion,
    mutationKey: `import:${claimed.id}:${item.rowId}`,
    nmId: item.nmId,
    source: 'IMPORT',
    ...(item.normalizedInput.sourceReference === undefined
      ? {}
      : { sourceReference: item.normalizedInput.sourceReference }),
    ...(item.normalizedInput.sourceUpdatedAt === undefined
      ? {}
      : { sourceUpdatedAt: new Date(item.normalizedInput.sourceUpdatedAt) }),
  };
}

function validateEconomicsMutation(mutation: EconomicsMutation): void {
  if (
    mutation.nmId <= 0n ||
    mutation.expectedCurrentVersion < 0n ||
    mutation.effectiveFrom.toString() === 'Invalid Date' ||
    (mutation.effectiveTo !== undefined &&
      mutation.effectiveTo !== null &&
      (mutation.effectiveTo.toString() === 'Invalid Date' ||
        mutation.effectiveTo <= mutation.effectiveFrom)) ||
    mutation.mutationKey.length < 1
  ) {
    throw new Error('INVALID_PRODUCT_ECONOMICS');
  }
}

function validateImportRequest(rows: readonly EconomicsImportRow[]): void {
  if (rows.length < 1) throw new Error('EMPTY_ITEMS');
  if (rows.length > 10_000) throw new Error('TOO_MANY_ITEMS');
  if (new Set(rows.map((row) => row.rowId)).size !== rows.length) {
    throw new Error('DUPLICATE_ROW_ID');
  }
  if (new Set(rows.map((row) => row.nmId.toString())).size !== rows.length) {
    throw new Error('DUPLICATE_NM_ID');
  }
  for (const row of rows) {
    validateEconomicsMutation({
      actor: 'validation',
      contributionMinor: row.contributionMinor,
      correlationId: '00000000-0000-0000-0000-000000000000',
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? null,
      expectedCurrentVersion: row.expectedCurrentVersion,
      mutationKey: row.rowId,
      nmId: row.nmId,
      source: 'IMPORT',
    });
  }
}

function validatePolicyScope(request: {
  readonly campaignId: string | null;
  readonly scope: 'CAMPAIGN' | 'DEPLOYMENT' | 'TARGET';
  readonly targetId: string | null;
}): void {
  const valid =
    (request.scope === 'DEPLOYMENT' && request.campaignId === null && request.targetId === null) ||
    (request.scope === 'CAMPAIGN' && request.campaignId !== null && request.targetId === null) ||
    (request.scope === 'TARGET' && request.campaignId === null && request.targetId !== null);
  if (!valid) throw new Error('INVALID_POLICY_SCOPE');
}

function assertSameDecision(existing: DecisionReplayRow, result: DecisionResult): void {
  if (
    existing.action !== result.action ||
    existing.boundedBidMinor !== result.boundedBidMinor ||
    existing.outcomeReasonCode !== result.outcomeReasonCode
  ) {
    throw new Error('DATA_INCONSISTENCY');
  }
}

async function appendAudit(
  transaction: DatabaseTransaction,
  actor: string,
  action: string,
  entityId: string,
  correlationId: string,
  after: unknown,
  before?: unknown,
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      action,
      actor,
      after: prismaJson(after),
      before: before === undefined ? Prisma.JsonNull : prismaJson(before),
      correlationId,
      entityId,
      entityType: action.includes('IMPORT')
        ? 'ProductEconomicsImport'
        : action.startsWith('PRODUCT')
          ? 'ProductEconomics'
          : 'BiddingPolicy',
      id: randomUUID(),
    },
  });
}

function policyReplay(value: Prisma.JsonValue): {
  readonly id: string;
  readonly version: bigint;
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof value.id !== 'string' ||
    typeof value.version !== 'string'
  ) {
    throw new Error('IDEMPOTENCY_RESPONSE_INVALID');
  }
  return Object.freeze({ id: value.id, version: BigInt(value.version) });
}

function prismaJson(value: unknown): Prisma.InputJsonValue {
  return normalizeCanonical(value) as Prisma.InputJsonValue;
}

function isoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function classifyImportError(error: unknown): string {
  const message = safeMessage(error);
  return message.startsWith('VERSION_CONFLICT')
    ? 'VERSION_CONFLICT'
    : message === 'IDEMPOTENCY_KEY_REUSED'
      ? 'IDEMPOTENCY_KEY_REUSED'
      : 'INVALID_PRODUCT_ECONOMICS';
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown import error';
}

function decisionPriority(result: DecisionResult): number {
  if (
    result.action === 'DECREASE' &&
    result.guardrailCodes.some((code) => code.includes('BUDGET') || code.includes('LOSS'))
  ) {
    return 500;
  }
  if (result.action === 'DECREASE') return 400;
  if (result.action === 'INCREASE') return 200;
  return 100;
}
