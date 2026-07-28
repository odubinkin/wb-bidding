/**
 * Branded signed 64-bit integer used for domain money in account minor units.
 */
export type MinorUnits = bigint & { readonly __minorUnits: unique symbol };

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const MIN_SIGNED_BIGINT = -9_223_372_036_854_775_808n;
const CANONICAL_INTEGER = /^(?:0|-[1-9]\d*|[1-9]\d*)$/u;

/**
 * Raised when an internal API monetary string is non-canonical or outside PostgreSQL BIGINT.
 */
export class MoneyValidationError extends Error {
  /**
   * Creates a non-secret validation error.
   *
   * @param message - Stable diagnostic code or description.
   */
  public constructor(message: string) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

/**
 * Parses a canonical decimal integer string as signed PostgreSQL BIGINT minor units.
 *
 * @param value - Canonical decimal integer without exponent, plus sign, fraction, or leading zeros.
 * @returns Branded signed minor-unit value.
 * @throws {MoneyValidationError} When syntax or signed 64-bit range is invalid.
 */
export function parseMinorUnits(value: string): MinorUnits {
  if (!CANONICAL_INTEGER.test(value)) {
    throw new MoneyValidationError('INVALID_MINOR_UNIT_INTEGER');
  }
  const parsed = BigInt(value);
  if (parsed < MIN_SIGNED_BIGINT || parsed > MAX_SIGNED_BIGINT) {
    throw new MoneyValidationError('MINOR_UNIT_OUT_OF_BIGINT_RANGE');
  }
  return parsed as MinorUnits;
}
