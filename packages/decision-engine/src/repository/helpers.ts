import { randomUUID } from 'node:crypto';
import { normalizeCanonical } from '../checksum.js';
import type { DecisionResult } from '../types.js';
import { Prisma, type DatabaseTransaction } from '@wb-bidder/database';
import type { EconomicsMutation, EconomicsImportRow } from './types.js';

/**
 * Defines the data contract for claimed import.
 */
export interface ClaimedImport {
  readonly actor: string;
  readonly changeReason: string;
  readonly correlationId: string;
  readonly dryRun: boolean;
  readonly id: string;
  readonly workerId: string;
}

/**
 * Defines the data contract for import item row.
 */
export interface ImportItemRow {
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

/**
 * Defines the data contract for decision replay row.
 */
export interface DecisionReplayRow {
  readonly action: string;
  readonly boundedBidMinor: bigint | null;
  readonly id: string;
  readonly outcomeReasonCode: string;
}

/**
 * Performs the import item operation while preserving domain invariants.
 *
 * @param stored Persisted value converted into a domain representation.
 * @param stored.expectedCurrentVersion expected current version field of the validated stored.
 * @param stored.id Identifier selecting the requested record.
 * @param stored.nmId Wildberries article identifier.
 * @param stored.normalizedInput normalized input field of the validated stored.
 * @param stored.rowId row id field of the validated stored.
 * @returns Result produced by the import item operation.
 */
export function importItem(stored: {
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

/**
 * Performs the import mutation operation while preserving domain invariants.
 *
 * @param claimed Validated claimed value supplied to the operation.
 * @param item Queue or domain item processed by the operation.
 * @returns Result produced by the import mutation operation.
 */
export function importMutation(claimed: ClaimedImport, item: ImportItemRow): EconomicsMutation {
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

/**
 * Validates economics mutation.
 *
 * @param mutation Transactional mutation callback.
 */
export function validateEconomicsMutation(mutation: EconomicsMutation): void {
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

/**
 * Validates import request.
 *
 * @param rows Persisted rows included in the bounded result.
 */
export function validateImportRequest(rows: readonly EconomicsImportRow[]): void {
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

/**
 * Validates policy scope.
 *
 * @param request Current administrative HTTP request.
 * @param request.campaignId Campaign identifier defining the operation scope.
 * @param request.scope Stable namespace for the operation.
 * @param request.targetId Target identifier defining the operation scope.
 */
export function validatePolicyScope(request: {
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

/**
 * Validates same decision.
 *
 * @param existing Validated existing value supplied to the operation.
 * @param result Operation result to convert or expose.
 */
export function assertSameDecision(existing: DecisionReplayRow, result: DecisionResult): void {
  if (
    existing.action !== result.action ||
    existing.boundedBidMinor !== result.boundedBidMinor ||
    existing.outcomeReasonCode !== result.outcomeReasonCode
  ) {
    throw new Error('DATA_INCONSISTENCY');
  }
}

/**
 * Performs the append audit operation while preserving domain invariants.
 *
 * @param transaction Open database transaction used for atomic persistence.
 * @param actor Authenticated actor recorded in the audit trail.
 * @param action Action selected for the durable state transition.
 * @param entityId Identifier of the audited entity.
 * @param correlationId Correlation identifier propagated to audit and logs.
 * @param after Entity state captured after the mutation.
 * @param before Entity state captured before the mutation.
 */
export async function appendAudit(
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

/**
 * Performs the policy replay operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the policy replay operation.
 */
export function policyReplay(value: Prisma.JsonValue): {
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

/**
 * Performs the prisma json operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the prisma json operation.
 */
export function prismaJson(value: unknown): Prisma.InputJsonValue {
  return normalizeCanonical(value) as Prisma.InputJsonValue;
}

/**
 * Determines whether iso date is satisfied.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Whether the requested condition is satisfied.
 */
export function isoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Performs the classify import error operation while preserving domain invariants.
 *
 * @param error Unknown failure value to classify or redact.
 * @returns Result produced by the classify import error operation.
 */
export function classifyImportError(error: unknown): string {
  const message = safeMessage(error);
  return message.startsWith('VERSION_CONFLICT')
    ? 'VERSION_CONFLICT'
    : message === 'IDEMPOTENCY_KEY_REUSED'
      ? 'IDEMPOTENCY_KEY_REUSED'
      : 'INVALID_PRODUCT_ECONOMICS';
}

/**
 * Performs the safe message operation while preserving domain invariants.
 *
 * @param error Unknown failure value to classify or redact.
 * @returns Result produced by the safe message operation.
 */
export function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown import error';
}

/**
 * Performs the decision priority operation while preserving domain invariants.
 *
 * @param result Operation result to convert or expose.
 * @returns Result produced by the decision priority operation.
 */
export function decisionPriority(result: DecisionResult): number {
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
