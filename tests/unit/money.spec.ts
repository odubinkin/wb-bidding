import { describe, expect, it } from 'vitest';

import { MoneyValidationError, parseMinorUnits } from '@wb-bidder/contracts';

describe('parseMinorUnits', () => {
  it.each([
    ['0', 0n],
    ['1', 1n],
    ['-1', -1n],
    ['9223372036854775807', 9_223_372_036_854_775_807n],
    ['-9223372036854775808', -9_223_372_036_854_775_808n],
  ])('parses canonical signed BIGINT %s', (input, expected) => {
    expect(parseMinorUnits(input)).toBe(expected);
  });

  it.each(['+1', '01', '-0', '1.00', '1e3', '', ' 1 ', '9223372036854775808'])(
    'rejects invalid or out-of-range value %s',
    (input) => {
      expect(() => parseMinorUnits(input)).toThrow(MoneyValidationError);
    },
  );

  it('uses a distinct error code for range overflow', () => {
    expect(() => parseMinorUnits('-9223372036854775809')).toThrow('MINOR_UNIT_OUT_OF_BIGINT_RANGE');
  });
});
