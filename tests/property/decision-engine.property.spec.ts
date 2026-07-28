import { describe, expect, it } from 'vitest';

import {
  Rational,
  decideBid,
  interpolate,
  roundToQuantum,
  scopedChecksum,
  weightedPava,
} from '@wb-bidder/decision-engine';

import { decisionInput, decisionPolicy } from '../helpers/decision-fixtures.js';

describe('Decision Engine deterministic properties', () => {
  it('keeps PAVA non-decreasing and interpolation inside adjacent values', () => {
    const random = lcg(0x5eed);
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const points = Array.from({ length: 2 + Math.floor(random() * 20) }, () => ({
        value: new Rational(BigInt(Math.floor(random() * 100_000)), 1_000n),
        weight: BigInt(1 + Math.floor(random() * 20)),
      }));
      const adjusted = weightedPava(points);
      for (let index = 1; index < adjusted.length; index += 1) {
        const previous = adjusted[index - 1];
        const current = adjusted[index];
        if (previous === undefined || current === undefined) {
          throw new Error('PAVA result cardinality changed');
        }
        expect(previous.compare(current)).toBeLessThanOrEqual(0);
      }
      const left = new Rational(BigInt(Math.floor(random() * 1_000)));
      const right = new Rational(BigInt(Math.floor(random() * 1_000)));
      const value = interpolate(100n, left, 200n, right, 150n);
      const minimum = left.compare(right) <= 0 ? left : right;
      const maximum = left.compare(right) >= 0 ? left : right;
      expect(value.compare(minimum)).toBeGreaterThanOrEqual(0);
      expect(value.compare(maximum)).toBeLessThanOrEqual(0);
    }
  });

  it('never emits a queued write outside floor/cap or speed bounds', () => {
    const random = lcg(0xc0ffee);
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const current = BigInt(100 + Math.floor(random() * 900));
      const floor = BigInt(Math.floor(random() * Number(current)));
      const cap = current + BigInt(1 + Math.floor(random() * 1_000));
      const policy = decisionPolicy({
        maxDailyDecreasePpm: 400_000,
        maxDailyIncreasePpm: 200_000,
        maxDecreasePerCyclePpm: 200_000,
        maxIncreasePerCyclePpm: 100_000,
        policyMaxBidMinor: cap,
        policyMinBidMinor: floor,
      });
      const input = decisionInput({
        currentBidMinor: current,
        dailyAnchorBidMinor: current,
        expectedContributionBeforeAdsMinor: -1n,
        endpointQuantumMinor: 1n,
        policy,
        wbMinimumBidMinor: floor,
      });
      const first = decideBid(input);
      const second = decideBid(input);
      expect(second).toEqual(first);
      const bounded = first.boundedBidMinor;
      if (bounded !== null) {
        expect(bounded).toBeGreaterThanOrEqual(floor);
        expect(bounded).toBeLessThanOrEqual(cap);
        expect(bounded).toBeGreaterThanOrEqual((current * 800_000n) / 1_000_000n);
        expect(bounded).toBeLessThanOrEqual((current * 1_100_000n) / 1_000_000n);
      }
    }
  });

  it('never queues stale/invalid evidence and preserves exact integer fingerprints', () => {
    const random = lcg(0xbadc0de);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const invalid = decideBid(
        decisionInput({
          currentBidMinor: BigInt(1 + Math.floor(random() * 10_000)),
          snapshotApplyEligible: false,
        }),
      );
      expect(invalid.queueEligible).toBe(false);
      expect(invalid.outcomeReasonCode).toBe('STALE_DATA');
      const integer = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(iteration);
      expect(scopedChecksum('input-snapshot-v1', { integer })).toBe(
        scopedChecksum('input-snapshot-v1', { integer: integer.toString() }),
      );
      const quantum = BigInt(1 + Math.floor(random() * 100));
      const value = BigInt(Math.floor(random() * 1_000_000));
      expect(roundToQuantum(value, quantum) % quantum).toBe(0n);
    }
  });
});

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
