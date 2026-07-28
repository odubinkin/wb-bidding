import { Decimal } from 'decimal.js';

/**
 * Error raised when a WB decimal cannot be represented exactly in scale-two minor units.
 */
export class WbMoneyNormalizationError extends Error {
  /**
   * Creates a redacted money normalization error.
   *
   * @param field - Endpoint-qualified field name.
   */
  public constructor(field: string) {
    super(`WB money field cannot be normalized exactly: ${field}`);
    this.name = 'WbMoneyNormalizationError';
  }
}

/**
 * Converts a decimal major-unit field to exact scale-two minor units.
 *
 * @param value - Decimal string or finite number supplied by a validated wire schema.
 * @param field - Endpoint-qualified field used in safe diagnostics.
 * @returns Exact signed integer minor units.
 * @throws {WbMoneyNormalizationError} When the value is fractional below scale two or unsafe.
 */
export function decimalMajorToMinor(value: number | string, field: string): bigint {
  try {
    const scaled = new Decimal(value).mul(100);
    if (!scaled.isFinite() || !scaled.isInteger()) {
      throw new WbMoneyNormalizationError(field);
    }
    return BigInt(scaled.toFixed(0));
  } catch (error: unknown) {
    if (error instanceof WbMoneyNormalizationError) {
      throw error;
    }
    throw new WbMoneyNormalizationError(field);
  }
}

/**
 * Maps an integer kopeck field one-to-one to internal minor units.
 *
 * @param value - Non-negative integer from the card-bid wire contract.
 * @param field - Endpoint-qualified field used in safe diagnostics.
 * @returns Exact non-negative minor units.
 * @throws {WbMoneyNormalizationError} When the integer is negative or unsafe.
 */
export function kopecksToMinor(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WbMoneyNormalizationError(field);
  }
  return BigInt(value);
}
