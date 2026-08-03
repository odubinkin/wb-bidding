const DECIMAL_SCALE = 1_000_000n;

/**
 * Exact rational number used by the decision domain.
 */
export class Rational {
  /** Signed numerator. */
  public readonly numerator: bigint;
  /** Strictly positive denominator. */
  public readonly denominator: bigint;

  /**
   * Creates a normalized exact rational.
   *
   * @param numerator Signed numerator.
   * @param denominator Non-zero denominator.
   */
  public constructor(numerator: bigint, denominator = 1n) {
    if (denominator === 0n) {
      throw new Error('Rational denominator must not be zero');
    }
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(abs(numerator), abs(denominator));
    this.numerator = (numerator * sign) / divisor;
    this.denominator = abs(denominator) / divisor;
  }

  /**
   * Adds another exact value.
   *
   * @param other Addend.
   * @returns Sum.
   */
  public add(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  /**
   * Subtracts another exact value.
   *
   * @param other Subtrahend.
   * @returns Difference.
   */
  public subtract(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  /**
   * Multiplies by an exact value.
   *
   * @param other Multiplier.
   * @returns Product.
   */
  public multiply(other: Rational | bigint): Rational {
    const factor = typeof other === 'bigint' ? new Rational(other) : other;
    return new Rational(this.numerator * factor.numerator, this.denominator * factor.denominator);
  }

  /**
   * Compares two exact values.
   *
   * @param other Comparator.
   * @returns Negative, zero, or positive ordering value.
   */
  public compare(other: Rational): number {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  /**
   * Floors toward negative infinity.
   *
   * @returns Conservative integer value.
   */
  public floor(): bigint {
    const quotient = this.numerator / this.denominator;
    const remainder = this.numerator % this.denominator;
    return remainder < 0n ? quotient - 1n : quotient;
  }

  /**
   * Serializes to a deterministic scale-six decimal string.
   *
   * @returns Fixed-scale decimal.
   */
  public toDecimalString(): string {
    const scaled = new Rational(this.numerator * DECIMAL_SCALE, this.denominator).floor();
    const sign = scaled < 0n ? '-' : '';
    const magnitude = abs(scaled);
    const whole = magnitude / DECIMAL_SCALE;
    const fraction = (magnitude % DECIMAL_SCALE).toString().padStart(6, '0');
    return `${sign}${whole.toString()}.${fraction}`;
  }
}

/**
 * Divides exact integer values and returns null for a zero denominator.
 *
 * @param numerator Numerator.
 * @param denominator Denominator.
 * @returns Exact ratio or null.
 */
export function divideOrNull(numerator: bigint, denominator: bigint): Rational | null {
  return denominator === 0n ? null : new Rational(numerator, denominator);
}

/**
 * Rounds an integer to the nearest endpoint quantum, resolving exact halves downward.
 *
 * @param value Non-negative integer bid.
 * @param quantum Positive endpoint quantum.
 * @returns Quantized bid.
 */
export function roundToQuantum(value: bigint, quantum: bigint): bigint {
  if (value < 0n || quantum <= 0n) {
    throw new Error('Bid and endpoint quantum are out of range');
  }
  const lower = (value / quantum) * quantum;
  const upper = lower + quantum;
  return value - lower <= upper - value ? lower : upper;
}

/**
 * Performs the greatest common divisor operation while preserving domain invariants.
 *
 * @param left Left-hand value used by the comparison.
 * @param right Right-hand value used by the comparison.
 * @returns Result produced by the greatest common divisor operation.
 */
function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

/**
 * Performs the abs operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the abs operation.
 */
function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
