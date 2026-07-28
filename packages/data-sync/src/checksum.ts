import { createHash } from 'node:crypto';

/**
 * Produces a deterministic SHA-256 for JSON-compatible values, including bigint and Date.
 *
 * @param value - Evidence value.
 * @returns Lowercase SHA-256 hex.
 */
export function evidenceChecksum(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

/**
 * Serializes evidence with sorted object keys and explicit temporal/numeric tags.
 *
 * @param value - Value to serialize.
 * @returns Stable JSON text.
 */
function stableSerialize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/**
 * Recursively normalizes a value into stable JSON-compatible data.
 *
 * @param value - Arbitrary evidence value.
 * @returns Stable JSON-compatible representation.
 */
function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { $bigint: value.toString() };
  }
  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}
