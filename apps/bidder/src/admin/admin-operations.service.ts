/* eslint-disable @typescript-eslint/no-unsafe-return */
import { randomUUID } from 'node:crypto';
import { AdminApiError } from '../problem-details.js';
import type { ManualJobDto } from '../admin-dto.js';
import {
  advisoryTransactionLock,
  type DecisionAction,
  loadAuditEventPage,
} from '@wb-bidder/database';
import {
  pageFrom,
  createdCursorWhere,
  decisionCreatedCursorWhere,
  listResponse,
  enumFilter,
  codeFilter,
  uuidFilter,
  optionalDateFilter,
  jobScope,
  checksum,
  serialize,
} from './admin.helpers.js';
import type { ListQuery, MutationContext } from './admin.helpers.js';
import { AdminAutomationServiceBase } from './admin-automation.service.js';

/** Cohesive Admin application-service capability layer. */
export class AdminOperationsServiceBase extends AdminAutomationServiceBase {
  /**
   * Creates job.
   *
   * @param input Validated input values for the operation.
   * @returns Constructed or normalized result.
   */
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

  /**
   * Retrieves job.
   *
   * @param jobId Manual job identifier selecting the durable job.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Lists decisions.
   *
   * @param query Validated filter and pagination query.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Retrieves decision.
   *
   * @param decisionId Decision identifier selecting the durable record.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Lists failures.
   *
   * @param query Validated filter and pagination query.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Performs the retry failure operation while preserving domain invariants.
   *
   * @param input Validated input values for the operation.
   * @param input.actor Authenticated actor recorded in the audit trail.
   * @param input.correlationId Correlation identifier propagated to audit and logs.
   * @param input.decisionId Decision identifier selecting the durable record.
   * @param input.expectedVersion Optimistic-concurrency version required by the mutation.
   * @param input.idempotencyKey Client key used to make the mutation safely repeatable.
   * @param input.reason Stable reason code explaining the outcome.
   * @returns Result produced by the retry failure operation.
   */
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

  /**
   * Lists audit.
   *
   * @param query Validated filter and pagination query.
   * @returns Requested value or bounded result set.
   */
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
}
