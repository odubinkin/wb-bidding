import { HttpException } from '@nestjs/common';

/**
 * Creates a stable cluster override key.
 *
 * @param advertId - Campaign ID.
 * @param nmId - Article ID.
 * @param normQuery - Exact normalized cluster string.
 * @returns Map key.
 */
export function clusterKey(advertId: number, nmId: number, normQuery: string): string {
  return `${String(advertId)}:${String(nmId)}:${normQuery}`;
}

/**
 * Creates an HTTP exception carrying deterministic headers for the global filter.
 *
 * @param body - Public error response.
 * @param status - HTTP status.
 * @param headers - Synthetic WB response headers.
 * @returns Nest exception with immutable header metadata.
 */
export function createMockHttpException(
  body: Readonly<Record<string, unknown>>,
  status: number,
  headers: Readonly<Record<string, string>>,
): HttpException {
  return Object.assign(new HttpException(body, status), {
    mockHeaders: Object.freeze({ ...headers }),
  });
}

/**
 * Floors an instant to its UTC calendar-day boundary.
 *
 * @param epochMs - Epoch milliseconds.
 * @returns UTC midnight epoch milliseconds.
 */
export function startOfUtcDay(epochMs: number): number {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
