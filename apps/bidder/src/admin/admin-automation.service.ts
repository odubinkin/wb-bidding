/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-unsafe-return */
import { randomUUID } from 'node:crypto';
import type { AutomationDto, GlobalKillDto } from '../admin-dto.js';
import { serialize } from './admin.helpers.js';
import type { MutationContext } from './admin.helpers.js';
import { AdminPolicyServiceBase } from './admin-policy.service.js';

/** Cohesive Admin application-service capability layer. */
export class AdminAutomationServiceBase extends AdminPolicyServiceBase {
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
}
