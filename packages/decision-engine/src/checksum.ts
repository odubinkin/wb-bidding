import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

/**
 * Computes the scoped SHA-256 fingerprint mandated by the specification.
 *
 * @param scope - Versioned canonical schema name.
 * @param payload - Complete semantic input payload.
 * @returns Lowercase hexadecimal checksum.
 */
export function scopedChecksum(scope: string, payload: unknown): string {
  if (!/^[a-z][a-z0-9-]*-v[1-9]\d*$/.test(scope)) {
    throw new Error('Checksum scope must be explicitly versioned');
  }
  const normalized = normalizeCanonical(payload);
  const serialized = canonicalize(normalized);
  if (serialized === undefined) {
    throw new Error('Canonical payload cannot be serialized');
  }
  return createHash('sha256').update(`${scope}\n${serialized}`, 'utf8').digest('hex');
}

/**
 * Converts domain values to RFC 8785-compatible JSON values.
 *
 * @param value - Domain value.
 * @returns JSON-compatible value with exact integers and UTC instants.
 */
export function normalizeCanonical(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeCanonical);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeCanonical(item)]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}
