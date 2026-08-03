import { randomUUID } from 'node:crypto';
import { type AdminRequest } from '../admin-security.js';
import { AdminApiError } from '../problem-details.js';

/**
 * Performs the correlation id operation while preserving domain invariants.
 *
 * @param request Current administrative HTTP request.
 * @returns Result produced by the correlation id operation.
 */
export function correlationId(request: AdminRequest): string {
  if (request.correlationId !== undefined) return request.correlationId;
  const supplied = request.header('x-correlation-id');
  request.correlationId =
    supplied !== undefined && /^[0-9a-f-]{36}$/iu.test(supplied) ? supplied : randomUUID();
  return request.correlationId;
}

/**
 * Performs the positive big int operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the positive big int operation.
 */
export function positiveBigInt(value: string): bigint {
  if (!/^[1-9][0-9]*$/u.test(value))
    throw new AdminApiError(422, 'INVALID_NM_ID', 'nmId must be a positive decimal string.');
  return BigInt(value);
}

/**
 * Performs the date or now operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the date or now operation.
 */
export function dateOrNow(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value))
    throw new AdminApiError(422, 'INVALID_DATE', 'at must be RFC 3339 UTC.');
  const result = new Date(value);
  if (result.toString() === 'Invalid Date')
    throw new AdminApiError(422, 'INVALID_DATE', 'at must be RFC 3339 UTC.');
  return result;
}

/**
 * Performs the version header operation while preserving domain invariants.
 *
 * @param prefix Stable resource prefix used in the serialized value.
 * @param result Operation result to convert or expose.
 * @returns Result produced by the version header operation.
 */
export function versionHeader(prefix: string, result: unknown): string {
  const version =
    typeof result === 'object' && result !== null && 'version' in result
      ? String(result.version)
      : '0';
  return `"${prefix}-${version}"`;
}
