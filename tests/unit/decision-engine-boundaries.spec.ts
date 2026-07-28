import { describe, expect, it } from 'vitest';

import {
  Rational,
  advanceExperiment,
  buildBidResponseCurve,
  calculateDiagnosticMetrics,
  confirmExperimentRevert,
  decideBid,
  normalizeCanonical,
  planLowerExperiment,
  resolveExperimentRevert,
  roundToQuantum,
  scoreCandidate,
  selectBestCandidate,
  uuidV7,
  validateDecisionPolicy,
  weightedPava,
} from '@wb-bidder/decision-engine';

import { bucketDays, decisionInput, decisionPolicy } from '../helpers/decision-fixtures.js';

describe('Decision Engine boundary coverage', () => {
  it('covers diagnostic values, UUIDv7, PAVA errors, and candidate interval edges', () => {
    expect(
      calculateDiagnosticMetrics({
        attributedRevenueMinor: 2_000n,
        clicks: 20n,
        orderedUnits: 4n,
        spendMinor: 1_000n,
        views: 400n,
      }),
    ).toEqual({
      acos: '0.500000',
      cpcMinor: '50.000000',
      cpmMinor: '2500.000000',
      cr: '0.200000',
      ctr: '0.050000',
      roas: '2.000000',
    });
    expect(uuidV7(new Date('2026-07-28T00:00:00.000Z'))).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(() => uuidV7(new Date(-1))).toThrow('out of range');
    expect(() => weightedPava([{ value: new Rational(1n), weight: 0n }])).toThrow('weights');
    expect(normalizeCanonical(null)).toBeNull();
    expect(normalizeCanonical(true)).toBe(true);
    expect(() => normalizeCanonical(undefined)).toThrow('Unsupported');
    expect(() => normalizeCanonical(Number.NaN)).toThrow('Unsupported');
    expect(new Rational(1n, -2n).toDecimalString()).toBe('-0.500000');
    expect(new Rational(0n).toDecimalString()).toBe('0.000000');
    expect(roundToQuantum(106n, 10n)).toBe(110n);
    const curve = buildBidResponseCurve(
      [...bucketDays(100n, 5n, 500n), ...bucketDays(200n, 10n, 1_000n)],
      'CPM',
      decisionPolicy(),
    );
    expect(scoreCandidate(100n, curve.exact, 500n, 1)?.bidMinor).toBe(100n);
    expect(scoreCandidate(150n, curve.exact, 500n, 1)?.expectedOrderedUnitsExact).toBe('6.000000');
    expect(scoreCandidate(99n, curve.exact, 500n, 1)).toBeNull();
    expect(scoreCandidate(201n, curve.exact, 500n, 1)).toBeNull();
    expect(
      scoreCandidate(100n, buildBidResponseCurve([], 'CPM', decisionPolicy()).exact, 500n, 1),
    ).toBeNull();
    expect(selectBestCandidate([], 100n)).toBeNull();
    expect(() =>
      selectBestCandidate(
        [
          {
            bidMinor: 100n,
            conservativeProfitScoreExact: 'invalid',
            conservativeProfitScoreMinor: 0n,
            expectedAdvertisingSpendExact: '0.000000',
            expectedOrderedUnitsExact: '0.000000',
          },
        ],
        100n,
      ),
    ).toThrow('scale-six');
  });

  it('covers spend thresholds, observation gaps, and missing ordered-unit evidence', () => {
    const spendQualified = buildBidResponseCurve(
      bucketDays(100n, 4n, 500n).map((day) => ({ ...day, views: null })),
      'CPM',
      decisionPolicy({ minBidSpendMinor: 1_000n }),
    );
    expect(spendQualified.buckets[0]?.eligible).toBe(true);
    expect(
      buildBidResponseCurve(bucketDays(100n, 1n, 100n).slice(0, 1), 'CPC', decisionPolicy())
        .buckets[0]?.exclusionReasons,
    ).toEqual(expect.arrayContaining(['INSUFFICIENT_OBSERVATION_DAYS', 'INSUFFICIENT_TRAFFIC']));
    const missingUnits = decideBid(
      decisionInput({
        performanceDays: bucketDays(100n, 5n, 500n).map((day) => ({
          ...day,
          orderedUnits: null,
        })),
      }),
    );
    expect(missingUnits.outcomeReasonCode).toBe('MISSING_ORDERED_UNITS');
  });

  it('covers blocker priority, missing identities, and minimum/cap conflict', () => {
    const blocked = decideBid(
      decisionInput({
        campaignRunning: false,
        manualPause: true,
        policy: decisionPolicy({ policyMaxBidMinor: 49n }),
        wbMinimumBidMinor: 50n,
      }),
    );
    expect(blocked.explanation.unconditionalBlockers).toEqual([
      'MANUAL_PAUSE',
      'CAMPAIGN_NOT_RUNNING',
      'MIN_ABOVE_POLICY_MAX',
    ]);
    expect(decideBid(decisionInput({ productEconomicsVersion: null })).outcomeReasonCode).toBe(
      'MISSING_PRODUCT_ECONOMICS',
    );
    expect(decideBid(decisionInput({ wbMinimumBidMinor: null })).outcomeReasonCode).toBe(
      'STALE_DATA',
    );
  });

  it('covers allowed, stale, exhausted, and incomplete increase budget inputs', () => {
    const increasingDays = [
      ...bucketDays(80n, 5n, 800n),
      ...bucketDays(100n, 7n, 1_000n),
      ...bucketDays(120n, 15n, 1_200n),
    ];
    const allowed = decideBid(decisionInput({ performanceDays: increasingDays }));
    expect(allowed.action).toBe('INCREASE');
    expect(allowed.explanation.reservedUnobservedSpendMinor).toBe(4_100n);
    for (const budget of [
      {
        ...decisionInput().budget,
        signalFetchedAt: new Date('2026-07-27T00:00:00.000Z'),
      },
      {
        ...decisionInput().budget,
        observedSameDaySpendMinor: 999_000n,
      },
      {
        ...decisionInput().budget,
        spendSignalCoverageEndedAt: null,
      },
    ]) {
      expect(
        decideBid(decisionInput({ budget, performanceDays: increasingDays })).outcomeReasonCode,
      ).toBe('BUDGET_SIGNAL_UNAVAILABLE');
    }
  });

  it('covers current maximum, insufficient alternatives, threshold, observe-only, and invalid input', () => {
    const currentBest = decideBid(
      decisionInput({
        performanceDays: [
          ...bucketDays(80n, 8n, 900n),
          ...bucketDays(100n, 12n, 1_000n),
          ...bucketDays(120n, 13n, 3_000n),
        ],
      }),
    );
    expect(currentBest.strategyReasonCode).toBe('MAX_PROFIT_CURRENT_BID');
    expect(
      decideBid(decisionInput({ performanceDays: bucketDays(80n, 5n, 500n) })).outcomeReasonCode,
    ).toBe('INSUFFICIENT_DATA');
    expect(
      decideBid(decisionInput({ performanceDays: bucketDays(100n, 5n, 500n) })).outcomeReasonCode,
    ).toBe('INSUFFICIENT_BID_RESPONSE_DATA');
    expect(
      decideBid(
        decisionInput({
          policy: decisionPolicy({ minExpectedProfitImprovementMinor: 1_000_000n }),
        }),
      ).outcomeReasonCode,
    ).toBe('NO_PROFIT_IMPROVEMENT');
    expect(
      decideBid(
        decisionInput({
          expectedContributionBeforeAdsMinor: -1n,
          policy: decisionPolicy({ executionMode: 'OBSERVE_ONLY' }),
        }),
      ).outcomeReasonCode,
    ).toBe('OBSERVE_ONLY');
    expect(
      decideBid(decisionInput({ expectedContributionBeforeAdsMinor: 0n })).strategyReasonCode,
    ).toBe('NEGATIVE_CONTRIBUTION_BEFORE_ADS');
    expect(() => decideBid(decisionInput({ currentBidMinor: -1n }))).toThrow(
      'must not be negative',
    );
    expect(() => decideBid(decisionInput({ endpointQuantumMinor: 0n }))).toThrow(
      'must be positive',
    );
    expect(() => decideBid(decisionInput({ dailyAnchorBidMinor: -1n }))).toThrow(
      'must not be negative',
    );
    expect(() => decideBid(decisionInput({ decisionAt: new Date('invalid') }))).toThrow(
      'Decision time',
    );
    expect(() => decideBid(decisionInput({ accountLocalDate: '28-07-2026' }))).toThrow(
      'Account-local date',
    );
    expect(
      decideBid(decisionInput({ accountLocalDate: '2026-07-29' })).decisionInputChecksum,
    ).not.toBe(decideBid(decisionInput()).decisionInputChecksum);
  });

  it('covers all policy validation classes', () => {
    const invalidPolicies = [
      decisionPolicy({ primaryWindowDays: 0 }),
      decisionPolicy({ baselineWindowDays: 6, primaryWindowDays: 7 }),
      decisionPolicy({ orderedUnitsSafetyDiscountPpm: 1_000_001 }),
      decisionPolicy({ spendSafetyPremiumPpm: 10_000_001 }),
      decisionPolicy({ minAbsoluteChangeMinor: -1n }),
      decisionPolicy({
        explorationEnabled: true,
        maxExplorationSpendMinor: null,
      }),
    ];
    for (const policy of invalidPolicies) {
      expect(() => {
        validateDecisionPolicy(policy);
      }).toThrow();
    }
  });

  it('covers experiment collection, evaluation, terminal stability, and normal revert', () => {
    const planned = experiment();
    const active = advanceExperiment(planned, evidence(2, '2026-07-31T00:00:00.000Z'));
    expect(active.status).toBe('ACTIVE');
    const collecting = advanceExperiment(active, evidence(2, '2026-07-31T12:00:00.000Z'));
    expect(collecting.status).toBe('COLLECTING');
    const evaluating = advanceExperiment(collecting, evidence(3, '2026-08-01T00:00:00.000Z'));
    expect(evaluating.status).toBe('EVALUATING');
    expect(advanceExperiment({ ...evaluating, status: 'ACCEPTED' }, evidence(3)).status).toBe(
      'ACCEPTED',
    );
    const reverting = advanceExperiment(planned, {
      ...evidence(1),
      configurationValid: false,
    });
    expect(reverting.status).toBe('REVERTING');
    const instruction = resolveExperimentRevert(reverting, {
      capabilityAvailable: true,
      now: new Date(),
      policyMaxBidMinor: 200n,
      policyMinBidMinor: null,
      quantumMinor: 1n,
      wbMinimumBidMinor: 50n,
    });
    expect(instruction).toMatchObject({ bidMinor: 100n, constrained: false });
    expect(confirmExperimentRevert(reverting, 100n, new Date()).status).toBe('REVERTED');
  });

  it('covers invalid experiment inputs and fail-closed revert prerequisites', () => {
    expect(() =>
      planLowerExperiment({
        currentBidMinor: 0n,
        explorationStepPpm: 100_000,
        floorMinor: 0n,
        maxSpendMinor: 1n,
        plannedFullDays: 1,
        quantumMinor: 1n,
        safetyBufferPpm: 0,
      }),
    ).toThrow('Invalid');
    const reverting = { ...experiment(), status: 'REVERTING' as const };
    for (const capabilityAvailable of [false, true]) {
      const result = resolveExperimentRevert(reverting, {
        capabilityAvailable,
        now: new Date(),
        policyMaxBidMinor: capabilityAvailable ? 90n : 200n,
        policyMinBidMinor: null,
        quantumMinor: 1n,
        wbMinimumBidMinor: capabilityAvailable ? 100n : 50n,
      });
      expect(result.state.status).toBe('FAILED_REVERT_BLOCKED');
    }
    expect(() =>
      advanceExperiment(reverting, {
        ...evidence(1),
        collectedEligibleDays: -1,
      }),
    ).toThrow('must not be negative');
    expect(() =>
      confirmExperimentRevert({ ...reverting, status: 'ACTIVE' }, 100n, new Date()),
    ).toThrow('not reverting');
    expect(() =>
      resolveExperimentRevert(
        { ...reverting, status: 'ACTIVE' },
        {
          capabilityAvailable: true,
          now: new Date(),
          policyMaxBidMinor: 200n,
          policyMinBidMinor: null,
          quantumMinor: 1n,
          wbMinimumBidMinor: 50n,
        },
      ),
    ).toThrow('not reverting');
  });
});

function experiment() {
  const planned = planLowerExperiment({
    currentBidMinor: 100n,
    explorationStepPpm: 100_000,
    floorMinor: 50n,
    maxSpendMinor: 10_000n,
    plannedFullDays: 3,
    quantumMinor: 1n,
    safetyBufferPpm: 200_000,
  });
  if (planned === null) {
    throw new Error('Expected planned experiment');
  }
  return planned;
}

function evidence(collectedEligibleDays: number, now = '2026-07-31T00:00:00.000Z') {
  return {
    collectedEligibleDays,
    configurationValid: true,
    evaluationNotBefore: new Date('2026-08-01T00:00:00.000Z'),
    now: new Date(now),
    observedExperimentSpendMinor: 1_000n,
    reservedUnobservedSpendMinor: 100n,
  };
}
