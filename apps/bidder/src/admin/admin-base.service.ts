/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DATABASE_CLIENT } from '../database.js';
import { RuntimeClockService } from '../runtime-clock.service.js';
import { DecisionRepository } from '@wb-bidder/decision-engine';
import {
  advisoryTransactionLock,
  Prisma,
  type DatabaseClient,
  type DatabaseTransaction,
  withTransaction,
} from '@wb-bidder/database';
import { WritePipelineRepository } from '@wb-bidder/write-pipeline';
import { checksum, inputJson, serialize } from './admin.helpers.js';
import type { MutationContext } from './admin.helpers.js';

/** Cohesive Admin application-service capability layer. */
export class AdminServiceBase {
  protected readonly database: DatabaseClient;
  protected readonly decisions: DecisionRepository;
  protected readonly writes: WritePipelineRepository;

  /**
   * Creates a admin service base instance with its required dependencies.
   *
   * @param database Database client used for the transactional operation.
   * @param clock Clock supplying deterministic operation timestamps.
   */
  public constructor(
    @Inject(DATABASE_CLIENT) database: DatabaseClient,
    protected readonly clock: RuntimeClockService,
  ) {
    this.database = database;
    this.decisions = new DecisionRepository(database);
    this.writes = new WritePipelineRepository(database);
  }

  /**
   * Performs the transactional mutation operation while preserving domain invariants.
   *
   * @param input Validated input values for the operation.
   * @param mutation Transactional mutation callback.
   * @returns Result produced by the transactional mutation operation.
   */
  protected async transactionalMutation(
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
