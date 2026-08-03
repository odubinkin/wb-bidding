/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { AdminApiError } from '../problem-details.js';
import type { EconomicsImportDto, EconomicsUpdateDto } from '../admin-dto.js';
import { type ImportItemStatus } from '@wb-bidder/database';
import {
  pageFrom,
  createdCursorWhere,
  listResponse,
  parseDate,
  parseSignedBigInt,
  enumFilter,
  economicsEtag,
  serialize,
} from './admin.helpers.js';
import type { ListQuery } from './admin.helpers.js';
import { AdminServiceBase } from './admin-base.service.js';

/** Cohesive Admin application-service capability layer. */
export class AdminEconomicsServiceBase extends AdminServiceBase {
  /**
   * Retrieves economics.
   *
   * @param nmId Wildberries article identifier.
   * @param at Optional effective timestamp for the lookup.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Updates economics.
   *
   * @param input Validated input values for the operation.
   * @param input.actor Authenticated actor recorded in the audit trail.
   * @param input.correlationId Correlation identifier propagated to audit and logs.
   * @param input.dto Validated HTTP request payload.
   * @param input.expectedVersion Optimistic-concurrency version required by the mutation.
   * @param input.idempotencyKey Client key used to make the mutation safely repeatable.
   * @param input.nmId Wildberries article identifier.
   * @returns Result produced by the update economics operation.
   */
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

  /**
   * Creates import.
   *
   * @param input Validated input values for the operation.
   * @param input.actor Authenticated actor recorded in the audit trail.
   * @param input.correlationId Correlation identifier propagated to audit and logs.
   * @param input.dto Validated HTTP request payload.
   * @param input.idempotencyKey Client key used to make the mutation safely repeatable.
   * @returns Constructed or normalized result.
   */
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

  /**
   * Retrieves import.
   *
   * @param importId Import batch identifier selecting the durable operation.
   * @returns Requested value or bounded result set.
   */
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

  /**
   * Lists import items.
   *
   * @param importId Import batch identifier selecting the durable operation.
   * @param query Validated filter and pagination query.
   * @returns Requested value or bounded result set.
   */
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
}
