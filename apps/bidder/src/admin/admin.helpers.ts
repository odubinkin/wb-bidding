/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { AdminApiError } from '../problem-details.js';
import type { ManualJobDto } from '../admin-dto.js';
import { type Prisma, type PolicyScope } from '@wb-bidder/database';

/** Optional cursor and page-size query parameters accepted by list endpoints. */
export interface ListQuery {
  readonly cursor?: string;
  readonly limit?: string;
}

export interface MutationContext {
  readonly actor: string;
  readonly correlationId: string;
  readonly dto: unknown;
  readonly expectedVersion: bigint;
  readonly idempotencyKey: string;
  readonly scope: string;
}

export interface Page {
  readonly cursorAt: Date | null;
  readonly cursorId: string | null;
  readonly limit: number;
}

export const policySelect = {
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

export function pageFrom(query: ListQuery): Page {
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

export function createdCursorWhere(page: Page) {
  if (page.cursorAt === null || page.cursorId === null) return {};
  return {
    OR: [
      { createdAt: { gt: page.cursorAt } },
      { createdAt: page.cursorAt, id: { gt: page.cursorId } },
    ],
  };
}

export function decisionCreatedCursorWhere(page: Page) {
  if (page.cursorAt === null || page.cursorId === null) return {};
  return {
    OR: [
      { decision: { createdAt: { gt: page.cursorAt } } },
      { decision: { createdAt: page.cursorAt }, id: { gt: page.cursorId } },
    ],
  };
}

export function policyDecisionQueueScope(policy: {
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

export function listResponse(
  rows: readonly Record<string, unknown>[],
  limit: number,
  idKey = 'id',
) {
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

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  }
  const date = new Date(value);
  if (date.toString() === 'Invalid Date')
    throw new AdminApiError(422, 'INVALID_DATE', 'Expected an RFC 3339 UTC date-time.');
  return date;
}

export function parseSignedBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new AdminApiError(422, 'VALUE_OUT_OF_BIGINT_RANGE', 'Expected a signed BIGINT string.');
  }
}

export function enumFilter<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (value === undefined) return null;
  if (!allowed.includes(value as T)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Filter value is not supported.');
  }
  return value as T;
}

export function codeFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'Classification filter is malformed.');
  }
  return value;
}

export function uuidFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new AdminApiError(422, 'INVALID_FILTER', 'UUID filter is malformed.');
  }
  return value;
}

export function optionalDateFilter(value: string | undefined): Date | null {
  if (value === undefined) return null;
  return parseDate(value);
}

export function economicsEtag(version: unknown): string {
  return `"product-economics-${String(version)}"`;
}

export function versionEtag(prefix: string, version: unknown): string {
  return `"${prefix}-${String(version)}"`;
}

export function jobScope(dto: ManualJobDto) {
  return {
    campaignIds: [...(dto.campaignIds ?? [])].sort(),
    dataKinds: [...(dto.dataKinds ?? [])].sort(),
    targetIds: [...(dto.targetIds ?? [])].sort(),
  };
}

export function checksum(value: unknown): string {
  const canonical = canonicalize(serialize(value));
  if (canonical === undefined) throw new Error('CANONICALIZATION_FAILED');
  return createHash('sha256').update(canonical).digest('hex');
}

export function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(serialize(value))) as Prisma.InputJsonValue;
}

export function serialize(value: unknown): any {
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
