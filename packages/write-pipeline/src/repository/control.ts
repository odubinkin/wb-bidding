import { withTransaction } from '@wb-bidder/database';
import { DEPLOYMENT_CONTROL_ID } from './types.js';
import { checksum, appendAudit, replayIdempotency, storeIdempotency } from './helpers.js';
import type { ControlMutation } from './helpers.js';
import { WriteReconciliationRepositoryBase } from './reconciliation.js';

/** Cohesive write-pipeline repository capability layer. */
export class WriteControlRepositoryBase extends WriteReconciliationRepositoryBase {
  /**
   * Updates global kill.
   *
   * @param input Validated input values for the operation.
   * @returns Result produced by the set global kill operation.
   */
  public async setGlobalKill(input: ControlMutation): Promise<bigint> {
    return withTransaction(
      this.database,
      async (transaction) => {
        const idempotencyChecksum = checksum({
          enabled: input.enabled,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        });
        const replay = await replayIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
        );
        if (replay !== null) {
          return BigInt(replay.version);
        }
        const row = await transaction.deploymentControl.findUnique({
          select: { globalKill: true, version: true },
          where: { id: DEPLOYMENT_CONTROL_ID },
        });
        if (row === null) throw new Error('CONTROL_NOT_INITIALIZED');
        if (row.version !== input.expectedVersion) throw new Error('VERSION_MISMATCH');
        const version = row.version + 1n;
        const updated = await transaction.deploymentControl.updateMany({
          data: {
            globalKill: input.enabled,
            reason: input.reason,
            updatedBy: input.actor,
            version,
          },
          where: { id: DEPLOYMENT_CONTROL_ID, version: row.version },
        });
        if (updated.count !== 1) throw new Error('VERSION_MISMATCH');
        await appendAudit(transaction, {
          action: input.enabled ? 'GLOBAL_KILL_ENABLED' : 'GLOBAL_KILL_DISABLED',
          actor: input.actor,
          before: { globalKill: row.globalKill, version: row.version },
          after: {
            globalKill: input.enabled,
            idempotencyKey: input.idempotencyKey ?? null,
            reason: input.reason,
            version: version.toString(),
          },
          correlationId: input.correlationId,
          entityId: DEPLOYMENT_CONTROL_ID,
          entityType: 'DeploymentControl',
        });
        await storeIdempotency(
          transaction,
          input.idempotencyScope,
          input.idempotencyKey,
          idempotencyChecksum,
          { enabled: input.enabled, version: version.toString() },
        );
        return version;
      },
      { timeoutMs: 60_000 },
    );
  }
}
