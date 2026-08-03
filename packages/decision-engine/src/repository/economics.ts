/* eslint-disable jsdoc/require-jsdoc */
import { randomUUID } from 'node:crypto';
import { scopedChecksum } from '../checksum.js';
import {
  advisoryTransactionLock,
  claimEconomicsImportRecord,
  withTransaction,
  type DatabaseClient,
} from '@wb-bidder/database';
import type { EconomicsMutation, EconomicsImportRow } from './types.js';
import {
  importItem,
  importMutation,
  validateEconomicsMutation,
  validateImportRequest,
  appendAudit,
  prismaJson,
  classifyImportError,
  safeMessage,
} from './helpers.js';
import type { ClaimedImport } from './helpers.js';

/** Cohesive decision repository capability layer. */
export class DecisionEconomicsRepositoryBase {
  /**
   * Creates a repository.
   *
   * @param database - Shared Prisma Client.
   */
  public constructor(protected readonly database: DatabaseClient) {}

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

  protected async claimImport(workerId: string): Promise<ClaimedImport | null> {
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
