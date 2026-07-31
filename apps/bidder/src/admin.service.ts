/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';

import { DATABASE_CLIENT } from './database.js';
import { AdminApiError } from './problem-details.js';
import { RuntimeClockService } from './runtime-clock.service.js';
import type {
  AutomationDto,
  EconomicsImportDto,
  EconomicsUpdateDto,
  GlobalKillDto,
  ManualJobDto,
  PolicyCreateDto,
} from './admin-dto.js';
import { DecisionRepository, type DecisionPolicy } from '@wb-bidder/decision-engine';
import {
  advisoryTransactionLock,
  Prisma,
  type DatabaseClient,
  type DatabaseTransaction,
  type DecisionAction,
  type ImportItemStatus,
  loadAuditEventPage,
  type PolicyScope,
  withTransaction,
} from '@wb-bidder/database';
import { WritePipelineRepository } from '@wb-bidder/write-pipeline';

@Injectable()
export class AdminService {
  private readonly database: DatabaseClient;
  private readonly decisions: DecisionRepository;
  private readonly writes: WritePipelineRepository;

  public constructor(
    @Inject(DATABASE_CLIENT) database: DatabaseClient,
    private readonly clock: RuntimeClockService,
  ) {
    this.database = database;
    this.decisions = new DecisionRepository(database);
    this.writes = new WritePipelineRepository(database);
  }

  public async getEconomics(nmId: bigint, at?: Date) {
    const effectiveAt = at ?? this.clock.now();
    const row = await this.database.productEconomics.findFirst({
      orderBy: { version: 'desc' },
      select: {
        createdAt: true,
        createdByActor: true,
        effectiveFrom: true,
        effectiveTo: true,
        expectedContributionBeforeAdsMinor: true,
        id: true,
        nmId: true,
        source: true,
        sourceReference: true,
        sourceUpdatedAt: true,
        version: true,
      },
      where: {
        effectiveFrom: { lte: effectiveAt },
        nmId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
      },
    });
    if (row === null)
      throw new AdminApiError(404, 'PRODUCT_ECONOMICS_NOT_FOUND', 'No effective version exists.');
    return { body: serialize(row), etag: economicsEtag(row.version) };
  }

  public async updateEconomics(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: EconomicsUpdateDto;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
    readonly nmId: bigint;
  }) {
    const created = await this.decisions.createEconomicsVersion({
      actor: input.actor,
      changeReason: input.dto.changeReason,
      contributionMinor: parseSignedBigInt(input.dto.expectedContributionBeforeAdsMinor),
      correlationId: input.correlationId,
      effectiveFrom: parseDate(input.dto.effectiveFrom),
      effectiveTo:
        input.dto.effectiveTo === undefined || input.dto.effectiveTo === null
          ? null
          : parseDate(input.dto.effectiveTo),
      expectedCurrentVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      mutationKey: `PUT:/api/v1/product-economics/${input.nmId.toString()}:${input.idempotencyKey}`,
      nmId: input.nmId,
      source: 'MANUAL',
      ...(input.dto.sourceReference === undefined
        ? {}
        : { sourceReference: input.dto.sourceReference }),
      ...(input.dto.sourceUpdatedAt === undefined
        ? {}
        : { sourceUpdatedAt: parseDate(input.dto.sourceUpdatedAt) }),
    });
    return this.getEconomics(input.nmId, parseDate(input.dto.effectiveFrom)).then((value) => ({
      ...value,
      created: created.created,
    }));
  }

  public async createImport(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: EconomicsImportDto;
    readonly idempotencyKey: string;
  }) {
    const result = await this.decisions.enqueueEconomicsImport({
      actor: input.actor,
      changeReason: input.dto.changeReason,
      correlationId: input.correlationId,
      dryRun: input.dto.dryRun,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: 'POST:/api/v1/product-economics/imports',
      rows: input.dto.items.map((item) => ({
        contributionMinor: parseSignedBigInt(item.expectedContributionBeforeAdsMinor),
        effectiveFrom: parseDate(item.effectiveFrom),
        effectiveTo:
          item.effectiveTo === undefined || item.effectiveTo === null
            ? null
            : parseDate(item.effectiveTo),
        expectedCurrentVersion: BigInt(item.expectedCurrentVersion),
        nmId: BigInt(item.nmId),
        rowId: item.rowId,
        ...(item.sourceReference === undefined ? {} : { sourceReference: item.sourceReference }),
        ...(item.sourceUpdatedAt === undefined
          ? {}
          : { sourceUpdatedAt: parseDate(item.sourceUpdatedAt) }),
      })),
    });
    const status = await this.getImport(result.importId);
    return { ...status, created: result.created };
  }

  public async getImport(importId: string) {
    const row = await this.database.productEconomicsImport.findUnique({
      select: {
        changeReason: true,
        createdAt: true,
        dryRun: true,
        failedItems: true,
        finishedAt: true,
        id: true,
        lastError: true,
        processedItems: true,
        requestChecksum: true,
        startedAt: true,
        status: true,
        succeededItems: true,
        totalItems: true,
        validatedItems: true,
      },
      where: { id: importId },
    });
    if (row === null) throw new AdminApiError(404, 'IMPORT_NOT_FOUND', 'Import not found.');
    const { id, ...body } = row;
    return serialize({ ...body, importId: id });
  }

  public async listImportItems(importId: string, query: ListQuery & { status?: string }) {
    const page = pageFrom(query);
    const status = enumFilter<ImportItemStatus>(query.status, [
      'PENDING',
      'PROCESSING',
      'VALIDATED',
      'SUCCEEDED',
      'FAILED',
    ]);
    const rows = await this.database.productEconomicsImportItem.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        actualCurrentVersion: true,
        createdAt: true,
        createdVersion: true,
        errorCode: true,
        errorDetail: true,
        id: true,
        nmId: true,
        rowId: true,
        status: true,
      },
      take: page.limit + 1,
      where: {
        importId,
        ...(status === null ? {} : { status }),
        ...createdCursorWhere(page),
      },
    });
    return listResponse(
      rows.map(({ errorCode, errorDetail, ...row }) => ({
        ...row,
        code: errorCode,
        detail: errorDetail,
      })),
      page.limit,
    );
  }

  public async listPolicies(query: ListQuery & { scope?: string }) {
    const page = pageFrom(query);
    const scope = enumFilter<PolicyScope>(query.scope, ['DEPLOYMENT', 'CAMPAIGN', 'TARGET']);
    const rows = await this.database.biddingPolicy.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: policySelect,
      take: page.limit + 1,
      where: {
        ...(scope === null ? {} : { scope }),
        ...createdCursorWhere(page),
      },
    });
    return listResponse(
      rows.map((row) => ({ ...row })),
      page.limit,
    );
  }

  public async getPolicy(id: string) {
    const row = await this.database.biddingPolicy.findUnique({
      select: policySelect,
      where: { id },
    });
    if (row === null) throw new AdminApiError(404, 'POLICY_NOT_FOUND', 'Policy not found.');
    return { body: serialize(row), etag: versionEtag('policy', row.version) };
  }

  public async createPolicy(
    actor: string,
    correlationId: string,
    idempotencyKey: string,
    dto: PolicyCreateDto,
  ) {
    const created = await this.decisions.createPolicyVersion({
      actor,
      campaignId: dto.campaignId ?? null,
      changeReason: dto.changeReason,
      configuration: dto.configuration as unknown as DecisionPolicy,
      correlationId,
      enabled: false,
      idempotencyKey,
      idempotencyScope: 'POST:/api/v1/policies',
      scope: dto.scope,
      targetId: dto.targetId ?? null,
      validFrom: parseDate(dto.validFrom),
    });
    const response = await this.getPolicy(created.id);
    return {
      body: {
        ...(response.body as Record<string, unknown>),
        id: created.id,
        validation: { valid: true },
        version: created.version.toString(),
      },
      etag: response.etag,
    };
  }

  public async activatePolicy(input: MutationContext & { readonly policyId: string }) {
    return this.transactionalMutation(input, async (transaction, audit) => {
      const policy = await transaction.biddingPolicy.findUnique({
        select: {
          campaignId: true,
          enabled: true,
          scope: true,
          targetId: true,
          validFrom: true,
          version: true,
        },
        where: { id: input.policyId },
      });
      if (policy === null) throw new Error('POLICY_NOT_FOUND');
      audit.before = policy;
      if (policy.version !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      if (!policy.enabled) {
        await transaction.biddingPolicy.updateMany({
          data: { validTo: policy.validFrom },
          where: {
            campaignId: policy.campaignId,
            enabled: true,
            id: { not: input.policyId },
            scope: policy.scope,
            targetId: policy.targetId,
            validTo: null,
          },
        });
        await transaction.biddingPolicy.update({
          data: { enabled: true },
          where: { id: input.policyId },
        });
        await transaction.decisionQueueItem.updateMany({
          data: { status: 'SUPERSEDED', version: { increment: 1n } },
          where: {
            status: { in: ['QUEUED', 'RETRY_WAIT'] },
            ...policyDecisionQueueScope(policy),
          },
        });
      }
      return { enabled: true, id: input.policyId, version: policy.version.toString() };
    });
  }

  public async assignPolicy(
    input: MutationContext & {
      readonly policyId: string;
      readonly scopeId: string;
      readonly scopeType: string;
    },
  ) {
    const source = await this.getPolicy(input.policyId);
    const body = source.body as {
      configuration: DecisionPolicy;
    };
    const scope = input.scopeType.toUpperCase();
    if (!['CAMPAIGN', 'TARGET'].includes(scope))
      throw new AdminApiError(422, 'INVALID_SCOPE', 'scopeType must be campaign or target.');
    const created = await this.decisions.createPolicyVersion({
      actor: input.actor,
      campaignId: scope === 'CAMPAIGN' ? input.scopeId : null,
      configuration: body.configuration,
      correlationId: input.correlationId,
      expectedCurrentVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      idempotencyInput: {
        changeReason: (input.dto as { changeReason?: string }).changeReason ?? null,
        expectedVersion: input.expectedVersion,
        policyId: input.policyId,
        scope,
        scopeId: input.scopeId,
      },
      idempotencyScope: input.scope,
      scope: scope as 'CAMPAIGN' | 'TARGET',
      supersedeQueued: true,
      targetId: scope === 'TARGET' ? input.scopeId : null,
      validFrom: this.clock.now(),
      ...((input.dto as { changeReason?: string }).changeReason === undefined
        ? {}
        : { changeReason: (input.dto as { changeReason: string }).changeReason }),
    });
    return this.getPolicy(created.id);
  }

  public async listAssignments(query: ListQuery & { campaignId?: string; targetId?: string }) {
    const page = pageFrom(query);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const rows = await this.database.biddingPolicy.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        campaignId: true,
        createdAt: true,
        id: true,
        scope: true,
        targetId: true,
        validFrom: true,
        validTo: true,
        version: true,
      },
      take: page.limit + 1,
      where: {
        enabled: true,
        ...(campaignId === null ? {} : { campaignId }),
        ...(targetId === null ? {} : { targetId }),
        ...createdCursorWhere(page),
      },
    });
    return listResponse(
      rows.map((row) => ({
        createdAt: row.createdAt,
        id: row.id,
        policyId: row.id,
        scopeId: row.campaignId ?? row.targetId,
        scopeType: row.scope,
        validFrom: row.validFrom,
        validTo: row.validTo,
        version: row.version,
      })),
      page.limit,
    );
  }

  public async getAutomation() {
    const [control, campaigns, targets] = await Promise.all([
      this.database.deploymentControl.findUnique({
        select: {
          globalKill: true,
          reason: true,
          updatedAt: true,
          updatedBy: true,
          version: true,
        },
        where: { id: '00000000-0000-0000-0000-000000000002' },
      }),
      this.database.campaignAutomation.findMany({
        orderBy: { campaignId: 'asc' },
        select: {
          campaignId: true,
          mode: true,
          reason: true,
          updatedAt: true,
          updatedBy: true,
          version: true,
        },
      }),
      this.database.targetAutomation.findMany({
        orderBy: { targetId: 'asc' },
        select: {
          mode: true,
          reason: true,
          targetId: true,
          updatedAt: true,
          updatedBy: true,
          version: true,
        },
      }),
    ]);
    return serialize({
      deployment: control ?? undefined,
      campaigns,
      targets,
    });
  }

  public async setAutomation(
    input: MutationContext & {
      readonly dto: AutomationDto;
      readonly entityId: string;
      readonly entityType: 'campaign' | 'target';
    },
  ) {
    return this.transactionalMutation(input, async (transaction, audit) => {
      const previous =
        input.entityType === 'campaign'
          ? await transaction.campaignAutomation.findUnique({
              select: { id: true, mode: true, version: true },
              where: { campaignId: input.entityId },
            })
          : await transaction.targetAutomation.findUnique({
              select: { id: true, mode: true, version: true },
              where: { targetId: input.entityId },
            });
      audit.before = previous ?? null;
      const actualVersion = previous?.version ?? 0n;
      if (actualVersion !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
      const version = actualVersion + 1n;
      const id = previous?.id ?? randomUUID();
      const data = {
        mode: input.dto.mode,
        reason: input.dto.changeReason,
        updatedBy: input.actor,
        version,
      };
      if (input.entityType === 'campaign') {
        await transaction.campaignAutomation.upsert({
          create: { ...data, campaignId: input.entityId, id },
          update: data,
          where: { campaignId: input.entityId },
        });
      } else {
        await transaction.targetAutomation.upsert({
          create: { ...data, id, targetId: input.entityId },
          update: data,
          where: { targetId: input.entityId },
        });
      }
      return {
        [`${input.entityType}Id`]: input.entityId,
        mode: input.dto.mode,
        version: version.toString(),
      };
    });
  }

  public async setGlobalKill(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly dto: GlobalKillDto;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
  }) {
    const version = await this.writes.setGlobalKill({
      actor: input.actor,
      correlationId: input.correlationId,
      enabled: input.dto.enabled,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: 'POST:/api/v1/automation/global-kill',
      reason: input.dto.changeReason,
    });
    return { enabled: input.dto.enabled, version: version.toString() };
  }

  public async createJob(
    input: MutationContext & {
      readonly dto: ManualJobDto;
      readonly type: 'RECALCULATE' | 'RESYNC';
    },
  ) {
    return this.transactionalMutation(input, async (transaction, audit) => {
      if ((input.dto.campaignIds?.length ?? 0) === 0 && (input.dto.targetIds?.length ?? 0) === 0) {
        throw new AdminApiError(
          422,
          'UNBOUNDED_JOB_SCOPE',
          'At least one bounded scope is required.',
        );
      }
      const scope = jobScope(input.dto);
      await advisoryTransactionLock(transaction, `manual-job:${input.type}:${checksum(scope)}`);
      const active = await transaction.manualJob.findFirst({
        select: { id: true, status: true },
        where: {
          scope: { equals: scope },
          status: { in: ['QUEUED', 'RUNNING'] },
          type: input.type,
        },
      });
      audit.before = active;
      if (active !== null) {
        return { jobId: active.id, status: active.status };
      }
      const jobId = randomUUID();
      await transaction.manualJob.create({
        data: {
          correlationId: input.correlationId,
          id: jobId,
          requestedBy: input.actor,
          scope,
          status: 'QUEUED',
          type: input.type,
        },
      });
      return { jobId, status: 'QUEUED' };
    });
  }

  public async getJob(jobId: string) {
    const row = await this.database.manualJob.findUnique({
      select: {
        correlationId: true,
        errorCode: true,
        finishedAt: true,
        id: true,
        requestedAt: true,
        requestedBy: true,
        result: true,
        scope: true,
        startedAt: true,
        status: true,
        type: true,
      },
      where: { id: jobId },
    });
    if (row === null) throw new AdminApiError(404, 'JOB_NOT_FOUND', 'Job not found.');
    const { id, ...body } = row;
    return serialize({ ...body, jobId: id });
  }

  public async listDecisions(
    query: ListQuery & {
      action?: string;
      campaignId?: string;
      targetId?: string;
    },
  ) {
    const page = pageFrom(query);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const action = enumFilter<DecisionAction>(query.action, [
      'NO_CHANGE',
      'INCREASE',
      'DECREASE',
      'RESTORE_ABSENT_OVERRIDE',
      'BLOCKED',
    ]);
    const rows = await this.database.bidDecision.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        action: true,
        algorithmVersion: true,
        boundedBidMinor: true,
        createdAt: true,
        currentBidMinor: true,
        decisionInputChecksum: true,
        guardrailCodes: true,
        id: true,
        outcomeReasonCode: true,
        policyVersion: true,
        proposedBidMinor: true,
        queueItem: { select: { status: true } },
        target: { select: { campaignId: true } },
        targetId: true,
      },
      take: page.limit + 1,
      where: {
        ...(action === null ? {} : { action }),
        ...(targetId === null ? {} : { targetId }),
        ...(campaignId === null ? {} : { target: { campaignId } }),
        ...createdCursorWhere(page),
      },
    });
    return listResponse(
      rows.map(({ queueItem, target, ...row }) => ({
        ...row,
        campaignId: target.campaignId,
        queueStatus: queueItem?.status ?? null,
      })),
      page.limit,
    );
  }

  public async getDecision(decisionId: string) {
    const row = await this.database.bidDecision.findUnique({
      include: {
        queueItem: {
          select: {
            failureClassification: true,
            manualRetryBlocked: true,
            status: true,
            version: true,
          },
        },
        writeAttemptItems: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            attemptId: true,
            attemptNumber: true,
            errorCode: true,
            httpStatus: true,
            id: true,
            reconciledAt: true,
            reconciliationStatus: true,
            status: true,
          },
        },
      },
      where: { id: decisionId },
    });
    if (row === null) throw new AdminApiError(404, 'DECISION_NOT_FOUND', 'Decision not found.');
    const { queueItem, writeAttemptItems, ...decision } = row;
    return serialize({
      ...decision,
      attempts: writeAttemptItems,
      failureClassification: queueItem?.failureClassification ?? null,
      manualRetryBlocked: queueItem?.manualRetryBlocked ?? null,
      queueStatus: queueItem?.status ?? null,
      queueVersion: queueItem?.version ?? null,
    });
  }

  public async listFailures(query: ListQuery & { classification?: string }) {
    const page = pageFrom(query);
    const classification = codeFilter(query.classification);
    const rows = await this.database.decisionQueueItem.findMany({
      orderBy: [{ decision: { createdAt: 'asc' } }, { id: 'asc' }],
      select: {
        attemptCount: true,
        decision: { select: { createdAt: true } },
        decisionId: true,
        failureClassification: true,
        id: true,
        lastErrorCode: true,
        lastHttpStatus: true,
        manualRetryBlocked: true,
        status: true,
        version: true,
      },
      take: page.limit + 1,
      where: {
        ...(classification === null ? {} : { failureClassification: classification }),
        status: 'FAILED',
        ...decisionCreatedCursorWhere(page),
      },
    });
    return listResponse(
      rows.map(({ decision, ...row }) => ({ ...row, createdAt: decision.createdAt })),
      page.limit,
    );
  }

  public async retryFailure(input: {
    readonly actor: string;
    readonly correlationId: string;
    readonly decisionId: string;
    readonly expectedVersion: bigint;
    readonly idempotencyKey: string;
    readonly reason: string;
  }) {
    const version = await this.writes.retryFailure({
      ...input,
      idempotencyScope: `POST:/api/v1/queue/failures/${input.decisionId}/retry`,
    });
    return { decisionId: input.decisionId, status: 'RETRY_WAIT', version: version.toString() };
  }

  public async listAudit(
    query: ListQuery & {
      action?: string;
      actor?: string;
      campaignId?: string;
      correlationId?: string;
      createdFrom?: string;
      createdTo?: string;
      entityId?: string;
      entityType?: string;
      targetId?: string;
    },
  ) {
    const page = pageFrom(query);
    const correlationId = uuidFilter(query.correlationId);
    const campaignId = uuidFilter(query.campaignId);
    const targetId = uuidFilter(query.targetId);
    const createdFrom = optionalDateFilter(query.createdFrom);
    const createdTo = optionalDateFilter(query.createdTo);
    if (createdFrom !== null && createdTo !== null && createdFrom >= createdTo) {
      throw new AdminApiError(422, 'INVALID_DATE_RANGE', 'createdFrom must precede createdTo.');
    }
    const rows = await loadAuditEventPage(this.database, {
      action: query.action ?? null,
      actor: query.actor ?? null,
      campaignId,
      correlationId,
      createdFrom,
      createdTo,
      cursorAt: page.cursorAt,
      cursorId: page.cursorId,
      entityId: query.entityId ?? null,
      entityType: query.entityType ?? null,
      limit: page.limit + 1,
      targetId,
    });
    return listResponse(
      rows.map((row) => ({ ...row })),
      page.limit,
    );
  }

  private async transactionalMutation(
    input: MutationContext,
    mutation: (transaction: DatabaseTransaction, audit: { before?: unknown }) => Promise<unknown>,
  ) {
    const scope = input.scope;
    const requestChecksum = checksum({
      dto: input.dto,
      expectedVersion: input.expectedVersion,
    });
    return withTransaction(
      this.database,
      async (transaction) => {
        await advisoryTransactionLock(
          transaction,
          `admin-idempotency:${scope}:${input.idempotencyKey}`,
        );
        const replay = await transaction.idempotencyRecord.findUnique({
          select: { requestChecksum: true, responseBody: true },
          where: {
            scope_idempotencyKey: {
              idempotencyKey: input.idempotencyKey,
              scope,
            },
          },
        });
        if (replay !== null) {
          if (replay.requestChecksum !== requestChecksum) throw new Error('IDEMPOTENCY_KEY_REUSED');
          return serialize(replay.responseBody);
        }
        const audit: { before?: unknown } = {};
        const body = await mutation(transaction, audit);
        await transaction.auditEvent.create({
          data: {
            action: scope,
            actor: input.actor,
            after: inputJson({
              body,
              changeReason:
                typeof input.dto === 'object' && input.dto !== null && 'changeReason' in input.dto
                  ? input.dto.changeReason
                  : null,
              idempotencyKey: input.idempotencyKey,
            }),
            before: audit.before === undefined ? Prisma.DbNull : inputJson(audit.before),
            correlationId: input.correlationId,
            entityId: scope,
            entityType: 'AdminMutation',
            id: randomUUID(),
          },
        });
        const expiresAt = new Date(Date.now() + 400 * 24 * 60 * 60 * 1_000);
        await transaction.idempotencyRecord.create({
          data: {
            expiresAt,
            id: randomUUID(),
            idempotencyKey: input.idempotencyKey,
            requestChecksum,
            responseBody: inputJson(body),
            responseHeaders: {},
            responseStatus: 200,
            scope,
          },
        });
        return serialize(body);
      },
      { timeoutMs: 60_000 },
    );
  }
}

/** Optional cursor and page-size query parameters accepted by list endpoints. */
export interface ListQuery {
  readonly cursor?: string;
  readonly limit?: string;
}

interface MutationContext {
  readonly actor: string;
  readonly correlationId: string;
  readonly dto: unknown;
  readonly expectedVersion: bigint;
  readonly idempotencyKey: string;
  readonly scope: string;
}

interface Page {
  readonly cursorAt: Date | null;
  readonly cursorId: string | null;
  readonly limit: number;
}

const policySelect = {
  campaignId: true,
  configuration: true,
  createdAt: true,
  createdByActor: true,
  enabled: true,
  executionMode: true,
  id: true,
  inputChecksum: true,
  scope: true,
  targetId: true,
  validFrom: true,
  validTo: true,
  version: true,
} satisfies Prisma.BiddingPolicySelect;

function pageFrom(query: ListQuery): Page {
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new AdminApiError(422, 'INVALID_LIMIT', 'limit must be in range 1..500.');
  if (query.cursor === undefined) return { cursorAt: null, cursorId: null, limit };
  try {
    const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as {
      at?: string;
      id: string;
    };
    const cursorId = uuidFilter(cursor.id);
    if (cursorId === null) throw new Error('INVALID_CURSOR');
    const cursorAt = optionalDateFilter(cursor.at);
    if (cursorAt === null) throw new Error('INVALID_CURSOR');
    return { cursorAt, cursorId, limit };
  } catch {
    throw new AdminApiError(422, 'INVALID_CURSOR', 'Cursor is malformed.');
  }
}

function createdCursorWhere(page: Page) {
  if (page.cursorAt === null || page.cursorId === null) return {};
  return {
    OR: [
      { createdAt: { gt: page.cursorAt } },
      { createdAt: page.cursorAt, id: { gt: page.cursorId } },
    ],
  };
}

function decisionCreatedCursorWhere(page: Page) {
  if (page.cursorAt === null || page.cursorId === null) return {};
  return {
    OR: [
      { decision: { createdAt: { gt: page.cursorAt } } },
      { decision: { createdAt: page.cursorAt }, id: { gt: page.cursorId } },
    ],
  };
}

function policyDecisionQueueScope(policy: {
  readonly campaignId: string | null;
  readonly scope: PolicyScope;
  readonly targetId: string | null;
}) {
  if (policy.scope === 'DEPLOYMENT') return {};
  if (policy.scope === 'CAMPAIGN') {
    if (policy.campaignId === null) throw new Error('CAMPAIGN_POLICY_MISSING_CAMPAIGN');
    return { decision: { target: { campaignId: policy.campaignId } } };
  }
  if (policy.targetId === null) throw new Error('TARGET_POLICY_MISSING_TARGET');
  return { decision: { targetId: policy.targetId } };
}

function listResponse(rows: readonly Record<string, unknown>[], limit: number, idKey = 'id') {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? Buffer.from(
          JSON.stringify({
            at:
              last.createdAt instanceof Date
                ? last.createdAt.toISOString()
                : (last.createdAt ?? undefined),
            id: last[idKey],
          }),
        ).toString('base64url')
      : null;
  return { items: serialize(items), nextCursor };
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  }
  const date = new Date(value);
  if (date.toString() === 'Invalid Date')
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  return date;
}

function parseSignedBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new AdminApiError(422, 'VALUE_OUT_OF_BIGINT_RANGE', 'Expected a signed BIGINT string.');
  }
}

function enumFilter<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (value === undefined) return null;
  if (!allowed.includes(value as T)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Filter value is not supported.');
  }
  return value as T;
}

function codeFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Classification filter is malformed.');
  }
  return value;
}

function uuidFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'UUID filter is malformed.');
  }
  return value;
}

function optionalDateFilter(value: string | undefined): Date | null {
  if (value === undefined) return null;
  return parseDate(value);
}

function economicsEtag(version: unknown): string {
  return `"product-economics-${String(version)}"`;
}

function versionEtag(prefix: string, version: unknown): string {
  return `"${prefix}-${String(version)}"`;
}

function jobScope(dto: ManualJobDto) {
  return {
    campaignIds: [...(dto.campaignIds ?? [])].sort(),
    dataKinds: [...(dto.dataKinds ?? [])].sort(),
    targetIds: [...(dto.targetIds ?? [])].sort(),
  };
}

function checksum(value: unknown): string {
  const canonical = canonicalize(serialize(value));
  if (canonical === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(canonical).digest('hex');
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(serialize(value))) as Prisma.InputJsonValue;
}

function serialize(value: unknown): any {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

/**
 * Parses a resource ETag into its optimistic-concurrency version.
 *
 * @param ifMatch - Value of the `If-Match` header.
 * @param prefix - Resource prefix used in the ETag format.
 * @param allowNoneMatch - Whether an `If-None-Match: *` create precondition is accepted.
 * @param ifNoneMatch - Value of the `If-None-Match` header.
 * @returns Parsed non-negative database version.
 * @throws {AdminApiError} When the conditional headers are missing or malformed.
 */
export function parseExpectedVersion(
  ifMatch: string | undefined,
  prefix: string,
  allowNoneMatch = false,
  ifNoneMatch?: string,
): bigint {
  if (allowNoneMatch && ifNoneMatch === '*') return 0n;
  if (ifMatch === undefined)
    throw new AdminApiError(428, 'PRECONDITION_REQUIRED', 'A conditional header is required.');
  const match = new RegExp(`^"${prefix}-([0-9]+)"$`, 'u').exec(ifMatch);
  if (match?.[1] === undefined)
    throw new AdminApiError(412, 'VERSION_MISMATCH', 'ETag format does not match this resource.');
  return BigInt(match[1]);
}

/**
 * Requires a non-empty idempotency key for a durable administrative mutation.
 *
 * @param value - Request `Idempotency-Key` header value.
 * @returns Validated key unchanged.
 * @throws {AdminApiError} When the key is absent or empty.
 */
export function requireIdempotency(value: string | undefined): string {
  if (value === undefined || value.length < 1)
    throw new AdminApiError(428, 'PRECONDITION_REQUIRED', 'Idempotency-Key is required.');
  return value;
}
