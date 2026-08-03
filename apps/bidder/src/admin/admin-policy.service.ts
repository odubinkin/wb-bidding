/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { AdminApiError } from '../problem-details.js';
import type { PolicyCreateDto } from '../admin-dto.js';
import { type DecisionPolicy } from '@wb-bidder/decision-engine';
import { type PolicyScope } from '@wb-bidder/database';
import {
  policySelect,
  pageFrom,
  createdCursorWhere,
  policyDecisionQueueScope,
  listResponse,
  parseDate,
  enumFilter,
  uuidFilter,
  versionEtag,
  serialize,
} from './admin.helpers.js';
import type { ListQuery, MutationContext } from './admin.helpers.js';
import { AdminEconomicsServiceBase } from './admin-economics.service.js';

/** Cohesive Admin application-service capability layer. */
export class AdminPolicyServiceBase extends AdminEconomicsServiceBase {
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
}
