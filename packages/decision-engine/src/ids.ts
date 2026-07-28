import { randomBytes } from 'node:crypto';

/**
 * Generates an RFC 9562 UUIDv7 using the supplied domain clock.
 *
 * @param now - Timestamp source.
 * @returns Time-ordered UUID string.
 */
export function uuidV7(now = new Date()): string {
  const milliseconds = BigInt(now.getTime());
  if (milliseconds < 0n || milliseconds > 0xffffffffffffn) {
    throw new Error('UUIDv7 timestamp is out of range');
  }
  const bytes = randomBytes(16);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((milliseconds >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}
