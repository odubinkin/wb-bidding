/* eslint-disable jsdoc/check-param-names, jsdoc/require-jsdoc, jsdoc/require-param */
import { Rational, divideOrNull } from './rational.js';
import type {
  BidCandidate,
  BidResponseBucket,
  DecisionPerformanceDay,
  DecisionPolicy,
} from './types.js';

const PPM = 1_000_000n;

interface ExactBucket {
  readonly bidMinor: bigint;
  readonly clicks: bigint;
  readonly eligible: boolean;
  readonly eligibleDays: number;
  readonly exclusionReasons: readonly string[];
  readonly orderedUnits: bigint;
  readonly orderedUnitsPerDayPava: Rational;
  readonly orderedUnitsPerDayRaw: Rational;
  readonly orderedUnitsPerDaySafe: Rational;
  readonly spendMinor: bigint;
  readonly spendMinorPerDayPava: Rational;
  readonly spendMinorPerDayRaw: Rational;
  readonly spendMinorPerDaySafe: Rational;
  readonly views: bigint | null;
}

/**
 * Diagnostic exact ratios for one aggregate.
 */
export interface DiagnosticMetrics {
  readonly acos: string | null;
  readonly cpcMinor: string | null;
  readonly cpmMinor: string | null;
  readonly cr: string | null;
  readonly ctr: string | null;
  readonly roas: string | null;
}

/**
 * Builds deterministic exact response buckets, including weighted PAVA and safety adjustments.
 *
 * @param days - Eligible finalized days from the baseline window.
 * @param paymentType - Target payment type.
 * @param policy - Resolved immutable policy.
 * @returns Public bucket explanation and an opaque exact curve.
 */
export function buildBidResponseCurve(
  days: readonly DecisionPerformanceDay[],
  paymentType: 'CPC' | 'CPM',
  policy: DecisionPolicy,
): { readonly buckets: readonly BidResponseBucket[]; readonly exact: readonly ExactBucket[] } {
  const aggregates = new Map<
    string,
    {
      bidMinor: bigint;
      clicks: bigint;
      days: number;
      orderedUnits: bigint;
      spendMinor: bigint;
      views: bigint | null;
    }
  >();
  for (const day of days) {
    if (day.orderedUnits === null) {
      continue;
    }
    const key = day.bidMinor.toString();
    const aggregate = aggregates.get(key) ?? {
      bidMinor: day.bidMinor,
      clicks: 0n,
      days: 0,
      orderedUnits: 0n,
      spendMinor: 0n,
      views: day.views === null ? null : 0n,
    };
    aggregate.days += 1;
    aggregate.clicks += day.clicks;
    aggregate.orderedUnits += day.orderedUnits;
    aggregate.spendMinor += day.spendMinor;
    aggregate.views =
      aggregate.views === null || day.views === null ? null : aggregate.views + day.views;
    aggregates.set(key, aggregate);
  }
  const raw = [...aggregates.values()]
    .sort((left, right) => compareBigInt(left.bidMinor, right.bidMinor))
    .map((aggregate) => {
      const exclusionReasons: string[] = [];
      if (aggregate.days < policy.minBidObservationDays) {
        exclusionReasons.push('INSUFFICIENT_OBSERVATION_DAYS');
      }
      const trafficEligible =
        paymentType === 'CPM'
          ? (aggregate.views !== null && aggregate.views >= policy.minBidViews) ||
            (policy.minBidSpendMinor !== null && aggregate.spendMinor >= policy.minBidSpendMinor)
          : aggregate.clicks >= policy.minBidClicks ||
            (policy.minBidSpendMinor !== null && aggregate.spendMinor >= policy.minBidSpendMinor);
      if (!trafficEligible) {
        exclusionReasons.push('INSUFFICIENT_TRAFFIC');
      }
      if (aggregate.orderedUnits < policy.minBidOrderedUnits) {
        exclusionReasons.push(
          aggregate.orderedUnits === 0n ? 'ZERO_ORDERED_UNITS' : 'INSUFFICIENT_ORDERED_UNITS',
        );
      }
      return {
        ...aggregate,
        eligible: exclusionReasons.length === 0,
        exclusionReasons: Object.freeze(exclusionReasons),
        orderedUnitsPerDayRaw: new Rational(aggregate.orderedUnits, BigInt(aggregate.days)),
        spendMinorPerDayRaw: new Rational(aggregate.spendMinor, BigInt(aggregate.days)),
      };
    });
  const eligible = raw.filter((bucket) => bucket.eligible);
  const orderedPava = weightedPava(
    eligible.map((bucket) => ({
      value: bucket.orderedUnitsPerDayRaw,
      weight: BigInt(bucket.days),
    })),
  );
  const spendPava = weightedPava(
    eligible.map((bucket) => ({
      value: bucket.spendMinorPerDayRaw,
      weight: BigInt(bucket.days),
    })),
  );
  let eligibleIndex = 0;
  const exact = raw.map((bucket): ExactBucket => {
    const ordered =
      bucket.eligible && orderedPava[eligibleIndex] !== undefined
        ? orderedPava[eligibleIndex]
        : bucket.orderedUnitsPerDayRaw;
    const spend =
      bucket.eligible && spendPava[eligibleIndex] !== undefined
        ? spendPava[eligibleIndex]
        : bucket.spendMinorPerDayRaw;
    if (bucket.eligible) {
      eligibleIndex += 1;
    }
    if (ordered === undefined || spend === undefined) {
      throw new Error('PAVA result does not match eligible buckets');
    }
    return Object.freeze({
      bidMinor: bucket.bidMinor,
      clicks: bucket.clicks,
      eligible: bucket.eligible,
      eligibleDays: bucket.days,
      exclusionReasons: bucket.exclusionReasons,
      orderedUnits: bucket.orderedUnits,
      orderedUnitsPerDayPava: ordered,
      orderedUnitsPerDayRaw: bucket.orderedUnitsPerDayRaw,
      orderedUnitsPerDaySafe: ordered.multiply(
        new Rational(PPM - BigInt(policy.orderedUnitsSafetyDiscountPpm), PPM),
      ),
      spendMinor: bucket.spendMinor,
      spendMinorPerDayPava: spend,
      spendMinorPerDayRaw: bucket.spendMinorPerDayRaw,
      spendMinorPerDaySafe: spend.multiply(
        new Rational(PPM + BigInt(policy.spendSafetyPremiumPpm), PPM),
      ),
      views: bucket.views,
    });
  });
  return Object.freeze({
    buckets: Object.freeze(exact.map(toPublicBucket)),
    exact: Object.freeze(exact),
  });
}

/**
 * Scores a candidate only inside the evidence-supported interval.
 *
 * @param candidateBidMinor - Candidate bid.
 * @param curve - Exact response curve.
 * @param contributionMinor - Signed contribution per ordered unit.
 * @param horizonDays - Positive prediction horizon.
 * @returns Candidate score, or null when extrapolation would be required.
 */
export function scoreCandidate(
  candidateBidMinor: bigint,
  curve: readonly ExactBucket[],
  contributionMinor: bigint,
  horizonDays: number,
): BidCandidate | null {
  const eligible = curve.filter((bucket) => bucket.eligible);
  const leftIndex = findLeftIndex(eligible, candidateBidMinor);
  if (leftIndex === -1) {
    return null;
  }
  const left = eligible[leftIndex];
  if (left === undefined) {
    return null;
  }
  let units = left.orderedUnitsPerDaySafe;
  let spend = left.spendMinorPerDaySafe;
  if (left.bidMinor !== candidateBidMinor) {
    const right = eligible[leftIndex + 1];
    if (right === undefined || candidateBidMinor > right.bidMinor) {
      return null;
    }
    units = interpolate(
      left.bidMinor,
      left.orderedUnitsPerDaySafe,
      right.bidMinor,
      right.orderedUnitsPerDaySafe,
      candidateBidMinor,
    );
    spend = interpolate(
      left.bidMinor,
      left.spendMinorPerDaySafe,
      right.bidMinor,
      right.spendMinorPerDaySafe,
      candidateBidMinor,
    );
  }
  const horizon = BigInt(horizonDays);
  const expectedUnits = units.multiply(horizon);
  const expectedSpend = spend.multiply(horizon);
  const profit = expectedUnits.multiply(contributionMinor).subtract(expectedSpend);
  return Object.freeze({
    bidMinor: candidateBidMinor,
    conservativeProfitScoreExact: profit.toDecimalString(),
    conservativeProfitScoreMinor: profit.floor(),
    expectedAdvertisingSpendExact: expectedSpend.toDecimalString(),
    expectedOrderedUnitsExact: expectedUnits.toDecimalString(),
  });
}

/**
 * Selects the maximum exact score with the normative deterministic tie-break.
 *
 * @param candidates - Candidate scores.
 * @param currentBidMinor - Current confirmed bid.
 * @returns Winning candidate.
 */
export function selectBestCandidate(
  candidates: readonly BidCandidate[],
  currentBidMinor: bigint,
): BidCandidate | null {
  const exactByCandidate = candidates.map((candidate) => ({
    candidate,
    score: parseScaleSix(candidate.conservativeProfitScoreExact),
  }));
  exactByCandidate.sort((left, right) => {
    const scoreOrder = right.score.compare(left.score);
    if (scoreOrder !== 0) {
      return scoreOrder;
    }
    const leftCurrent = left.candidate.bidMinor === currentBidMinor;
    const rightCurrent = right.candidate.bidMinor === currentBidMinor;
    if (leftCurrent !== rightCurrent) {
      return leftCurrent ? -1 : 1;
    }
    const bidOrder = compareBigInt(left.candidate.bidMinor, right.candidate.bidMinor);
    if (bidOrder !== 0) {
      return bidOrder;
    }
    return compareBigInt(
      abs(left.candidate.bidMinor - currentBidMinor),
      abs(right.candidate.bidMinor - currentBidMinor),
    );
  });
  return exactByCandidate[0]?.candidate ?? null;
}

/**
 * Calculates diagnostic ratios with explicit zero-denominator handling.
 *
 * @param totals - Exact aggregate counters.
 * @returns Scale-six decimal ratios or null.
 */
export function calculateDiagnosticMetrics(totals: {
  readonly attributedRevenueMinor: bigint;
  readonly clicks: bigint;
  readonly orderedUnits: bigint;
  readonly spendMinor: bigint;
  readonly views: bigint | null;
}): DiagnosticMetrics {
  return Object.freeze({
    acos: decimalOrNull(divideOrNull(totals.spendMinor, totals.attributedRevenueMinor)),
    cpcMinor: decimalOrNull(divideOrNull(totals.spendMinor, totals.clicks)),
    cpmMinor:
      totals.views === null
        ? null
        : decimalOrNull(divideOrNull(totals.spendMinor * 1_000n, totals.views)),
    cr: decimalOrNull(divideOrNull(totals.orderedUnits, totals.clicks)),
    ctr: totals.views === null ? null : decimalOrNull(divideOrNull(totals.clicks, totals.views)),
    roas: decimalOrNull(divideOrNull(totals.attributedRevenueMinor, totals.spendMinor)),
  });
}

/**
 * Performs weighted non-decreasing isotonic regression.
 *
 * @param points - Exact values and positive weights.
 * @returns One adjusted value per input point.
 */
export function weightedPava(
  points: readonly { readonly value: Rational; readonly weight: bigint }[],
): readonly Rational[] {
  const blocks: {
    end: number;
    start: number;
    total: Rational;
    weight: bigint;
  }[] = [];
  points.forEach((point, index) => {
    if (point.weight <= 0n) {
      throw new Error('PAVA weights must be positive');
    }
    blocks.push({
      end: index,
      start: index,
      total: point.value.multiply(point.weight),
      weight: point.weight,
    });
    while (blocks.length >= 2) {
      const right = blocks.at(-1);
      const left = blocks.at(-2);
      if (
        left === undefined ||
        right === undefined ||
        new Rational(left.total.numerator, left.total.denominator * left.weight).compare(
          new Rational(right.total.numerator, right.total.denominator * right.weight),
        ) <= 0
      ) {
        break;
      }
      blocks.splice(-2, 2, {
        end: right.end,
        start: left.start,
        total: left.total.add(right.total),
        weight: left.weight + right.weight,
      });
    }
  });
  const result: Rational[] = Array.from({ length: points.length });
  for (const block of blocks) {
    const average = new Rational(block.total.numerator, block.total.denominator * block.weight);
    for (let index = block.start; index <= block.end; index += 1) {
      result[index] = average;
    }
  }
  return Object.freeze(result);
}

/**
 * Interpolates inside a closed bid interval without floating point.
 *
 * @param leftBid - Left bound.
 * @param leftValue - Left exact value.
 * @param rightBid - Right bound.
 * @param rightValue - Right exact value.
 * @param candidateBid - Candidate inside the interval.
 * @returns Exact interpolated value.
 */
export function interpolate(
  leftBid: bigint,
  leftValue: Rational,
  rightBid: bigint,
  rightValue: Rational,
  candidateBid: bigint,
): Rational {
  if (rightBid <= leftBid || candidateBid < leftBid || candidateBid > rightBid) {
    throw new Error('Interpolation candidate is outside a valid interval');
  }
  const position = new Rational(candidateBid - leftBid, rightBid - leftBid);
  return leftValue.add(rightValue.subtract(leftValue).multiply(position));
}

function toPublicBucket(bucket: ExactBucket): BidResponseBucket {
  return Object.freeze({
    bidMinor: bucket.bidMinor,
    clicks: bucket.clicks,
    eligible: bucket.eligible,
    eligibleDays: bucket.eligibleDays,
    exclusionReasons: bucket.exclusionReasons,
    orderedUnits: bucket.orderedUnits,
    orderedUnitsPerDayPava: bucket.orderedUnitsPerDayPava.toDecimalString(),
    orderedUnitsPerDayRaw: bucket.orderedUnitsPerDayRaw.toDecimalString(),
    orderedUnitsPerDaySafe: bucket.orderedUnitsPerDaySafe.toDecimalString(),
    spendMinor: bucket.spendMinor,
    spendMinorPerDayPava: bucket.spendMinorPerDayPava.toDecimalString(),
    spendMinorPerDayRaw: bucket.spendMinorPerDayRaw.toDecimalString(),
    spendMinorPerDaySafe: bucket.spendMinorPerDaySafe.toDecimalString(),
    views: bucket.views,
  });
}

function findLeftIndex(curve: readonly ExactBucket[], bid: bigint): number {
  if (
    curve.length === 0 ||
    bid < (curve[0]?.bidMinor ?? bid + 1n) ||
    bid > (curve.at(-1)?.bidMinor ?? bid - 1n)
  ) {
    return -1;
  }
  let found = 0;
  for (let index = 0; index < curve.length; index += 1) {
    if ((curve[index]?.bidMinor ?? bid + 1n) <= bid) {
      found = index;
    } else {
      break;
    }
  }
  return found;
}

function decimalOrNull(value: Rational | null): string | null {
  return value === null ? null : value.toDecimalString();
}

function parseScaleSix(value: string): Rational {
  const match = /^(-?)(\d+)\.(\d{6})$/.exec(value);
  if (match === null) {
    throw new Error('Invalid scale-six decimal');
  }
  const sign = match[1] === '-' ? -1n : 1n;
  return new Rational(sign * (BigInt(match[2] ?? '0') * PPM + BigInt(match[3] ?? '0')), PPM);
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
