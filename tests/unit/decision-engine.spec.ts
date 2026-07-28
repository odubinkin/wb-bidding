import { describe, expect, it } from 'vitest';

import {
  Rational,
  advanceExperiment,
  buildBidResponseCurve,
  calculateDiagnosticMetrics,
  confirmExperimentRevert,
  decideBid,
  divideOrNull,
  initialObserveOnlyPolicy,
  interpolate,
  planLowerExperiment,
  resolveExperimentRevert,
  roundToQuantum,
  scopedChecksum,
  selectBestCandidate,
  validateDecisionPolicy,
  weightedPava,
} from '@wb-bidder/decision-engine';

import { bucketDays, decisionInput, decisionPolicy } from '../helpers/decision-fixtures.js';

describe('exact Decision Engine arithmetic', () => {
  it('normalizes rationals, floors negative values conservatively, and rounds half down', () => {
    expect(new Rational(2n, 4n).toDecimalString()).toBe('0.500000');
    expect(new Rational(-1n, 3n).floor()).toBe(-1n);
    expect(divideOrNull(1n, 0n)).toBeNull();
    expect(roundToQuantum(105n, 10n)).toBe(100n);
    expect(roundToQuantum(106n, 10n)).toBe(110n);
    expect(() => new Rational(1n, 0n)).toThrow('denominator');
    expect(() => roundToQuantum(-1n, 1n)).toThrow('out of range');
  });

  it('handles all diagnostic zero denominators explicitly', () => {
    expect(
      calculateDiagnosticMetrics({
        attributedRevenueMinor: 0n,
        clicks: 0n,
        orderedUnits: 0n,
        spendMinor: 0n,
        views: null,
      }),
    ).toEqual({
      acos: null,
      cpcMinor: null,
      cpmMinor: null,
      cr: null,
      ctr: null,
      roas: null,
    });
  });

  it('applies weighted PAVA and exact interpolation without extrapolation', () => {
    const adjusted = weightedPava([
      { value: new Rational(10n), weight: 1n },
      { value: new Rational(2n), weight: 3n },
      { value: new Rational(12n), weight: 1n },
    ]);
    expect(adjusted.map((value) => value.toDecimalString())).toEqual([
      '4.000000',
      '4.000000',
      '12.000000',
    ]);
    expect(
      interpolate(100n, new Rational(10n), 200n, new Rational(20n), 150n).toDecimalString(),
    ).toBe('15.000000');
    expect(() => interpolate(100n, new Rational(10n), 200n, new Rational(20n), 99n)).toThrow(
      'outside',
    );
  });

  it('enforces CPM/CPC thresholds and preserves zero-conversion buckets as excluded', () => {
    const cpm = buildBidResponseCurve(
      [...bucketDays(100n, 0n, 100n), ...bucketDays(120n, 4n, 200n)],
      'CPM',
      decisionPolicy(),
    );
    expect(cpm.buckets[0]).toMatchObject({
      eligible: false,
      exclusionReasons: ['ZERO_ORDERED_UNITS'],
    });
    const cpc = buildBidResponseCurve(
      bucketDays(100n, 4n, 100n).map((day) => ({ ...day, views: null })),
      'CPC',
      decisionPolicy({ minBidClicks: 61n }),
    );
    expect(cpc.buckets[0]?.exclusionReasons).toContain('INSUFFICIENT_TRAFFIC');
  });

  it('uses current, then lower bid as deterministic score ties', () => {
    const candidates = [
      {
        bidMinor: 120n,
        conservativeProfitScoreExact: '10.000000',
        conservativeProfitScoreMinor: 10n,
        expectedAdvertisingSpendExact: '1.000000',
        expectedOrderedUnitsExact: '1.000000',
      },
      {
        bidMinor: 100n,
        conservativeProfitScoreExact: '10.000000',
        conservativeProfitScoreMinor: 10n,
        expectedAdvertisingSpendExact: '1.000000',
        expectedOrderedUnitsExact: '1.000000',
      },
    ];
    expect(selectBestCandidate(candidates, 100n)?.bidMinor).toBe(100n);
    expect(selectBestCandidate(candidates, 110n)?.bidMinor).toBe(100n);
  });
});

describe('rules-v1 decisions', () => {
  it('replays the golden profit fixture with full buckets and candidates', () => {
    const decision = decideBid(decisionInput());
    expect(decision).toMatchObject({
      action: 'DECREASE',
      boundedBidMinor: 80n,
      outcomeReasonCode: 'PROFIT_MAXIMIZING_DECREASE',
      queueEligible: true,
      strategyReasonCode: 'PROFIT_MAXIMIZING_DECREASE',
    });
    expect(decision.explanation.buckets).toHaveLength(3);
    expect(decision.explanation.candidates.length).toBeGreaterThanOrEqual(3);
    expect(decision.decisionInputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is canonical and deterministic across object insertion order', () => {
    expect(scopedChecksum('input-snapshot-v1', { b: 2n, a: 1n })).toBe(
      scopedChecksum('input-snapshot-v1', { a: 1n, b: 2n }),
    );
    const first = decideBid(decisionInput());
    const second = decideBid(decisionInput());
    expect(second).toEqual(first);
    expect(() => scopedChecksum('unversioned', {})).toThrow('versioned');
  });

  it.each([
    [{ manualPause: true }, 'MANUAL_PAUSE'],
    [{ campaignRunning: false }, 'CAMPAIGN_NOT_RUNNING'],
    [{ capability: 'UNSUPPORTED' as const }, 'UNSUPPORTED_CAMPAIGN'],
    [{ attributionUnambiguous: false }, 'INSUFFICIENT_ATTRIBUTION_GRANULARITY'],
    [{ expectedContributionBeforeAdsMinor: null }, 'MISSING_PRODUCT_ECONOMICS'],
    [{ snapshotApplyEligible: false }, 'STALE_DATA'],
  ])('fail-closes unconditional blocker %#', (override, reason) => {
    const decision = decideBid(decisionInput(override));
    expect(decision.action).toBe('BLOCKED');
    expect(decision.outcomeReasonCode).toBe(reason);
    expect(decision.queueEligible).toBe(false);
  });

  it('blocks cluster writes unless their versioned capability is verified', () => {
    const decision = decideBid(
      decisionInput({
        capability: 'OBSERVE_ONLY',
        targetKey: {
          ...decisionInput().targetKey,
          normQueryCanonical: 'dress',
          targetKind: 'CLUSTER',
        },
      }),
    );
    expect(decision.outcomeReasonCode).toBe('UNVERIFIED_CLUSTER_BID_CONTRACT');
  });

  it('uses signed non-positive contribution only for a capped protective decrease', () => {
    const decision = decideBid(decisionInput({ expectedContributionBeforeAdsMinor: -10n }));
    expect(decision.strategyReasonCode).toBe('NEGATIVE_CONTRIBUTION_BEFORE_ADS');
    expect(decision.boundedBidMinor).toBe(80n);
    expect(decision.action).toBe('DECREASE');
  });

  it('applies zero-conversion only to complete current-regime days', () => {
    const zeroDays = bucketDays(100n, 0n, 100n);
    const decision = decideBid(decisionInput({ performanceDays: zeroDays }));
    expect(decision.strategyReasonCode).toBe('ZERO_CONVERSION_DECREASE');
    expect(decision.boundedBidMinor).toBe(80n);
  });

  it('blocks only an increase when same-day spend semantics are unverified', () => {
    const increasingDays = [
      ...bucketDays(80n, 5n, 800n),
      ...bucketDays(100n, 7n, 1_000n),
      ...bucketDays(120n, 15n, 1_200n),
    ];
    const decision = decideBid(
      decisionInput({
        budget: {
          ...decisionInput().budget,
          contractStatus: 'UNVERIFIED',
        },
        performanceDays: increasingDays,
      }),
    );
    expect(decision.strategyReasonCode).toBe('PROFITABLE_INCREASE');
    expect(decision.outcomeReasonCode).toBe('BUDGET_SIGNAL_UNAVAILABLE');
    expect(decision.queueEligible).toBe(false);
  });

  it('applies AND hysteresis, cooldown, speed caps, and observe-only last', () => {
    const small = decideBid(
      decisionInput({
        expectedContributionBeforeAdsMinor: -1n,
        policy: decisionPolicy({
          executionMode: 'OBSERVE_ONLY',
          minAbsoluteChangeMinor: 50n,
        }),
      }),
    );
    expect(small.outcomeReasonCode).toBe('BELOW_MIN_CHANGE');
    const cooling = decideBid(
      decisionInput({
        expectedContributionBeforeAdsMinor: -1n,
        lastWriteAt: new Date('2026-07-28T11:30:00.000Z'),
      }),
    );
    expect(cooling.outcomeReasonCode).toBe('COOLDOWN');
  });
});

describe('policy and lower-only experiments', () => {
  it('validates safe defaults and rejects incomplete APPLY or invalid bounds', () => {
    expect(() => {
      validateDecisionPolicy(initialObserveOnlyPolicy());
    }).not.toThrow();
    expect(() => {
      validateDecisionPolicy({
        ...initialObserveOnlyPolicy(),
        executionMode: 'APPLY',
      });
    }).toThrow('prerequisites');
    expect(() => {
      validateDecisionPolicy(decisionPolicy({ policyMinBidMinor: 101n, policyMaxBidMinor: 100n }));
    }).toThrow('minimum exceeds');
  });

  it('plans only a distinct lower candidate and advances on model time/spend', () => {
    const planned = planLowerExperiment({
      currentBidMinor: 100n,
      explorationStepPpm: 100_000,
      floorMinor: 50n,
      maxSpendMinor: 10_000n,
      plannedFullDays: 3,
      quantumMinor: 1n,
      safetyBufferPpm: 200_000,
    });
    expect(planned?.experimentBidMinor).toBe(90n);
    if (planned === null) {
      throw new Error('Expected experiment');
    }
    const collecting = advanceExperiment(planned, {
      collectedEligibleDays: 2,
      configurationValid: true,
      evaluationNotBefore: new Date('2026-08-01T00:00:00.000Z'),
      now: new Date('2026-07-31T00:00:00.000Z'),
      observedExperimentSpendMinor: 1_000n,
      reservedUnobservedSpendMinor: 100n,
    });
    expect(collecting.status).toBe('ACTIVE');
    const reverting = advanceExperiment(collecting, {
      collectedEligibleDays: 2,
      configurationValid: true,
      evaluationNotBefore: new Date('2026-08-01T00:00:00.000Z'),
      now: new Date('2026-07-31T00:00:00.000Z'),
      observedExperimentSpendMinor: 7_900n,
      reservedUnobservedSpendMinor: 100n,
    });
    expect(reverting.status).toBe('REVERTING');
    const instruction = resolveExperimentRevert(reverting, {
      capabilityAvailable: true,
      now: new Date('2026-07-31T00:00:00.000Z'),
      policyMaxBidMinor: 95n,
      policyMinBidMinor: null,
      quantumMinor: 1n,
      wbMinimumBidMinor: 50n,
    });
    expect(instruction).toMatchObject({ bidMinor: 95n, constrained: true });
    expect(
      confirmExperimentRevert(reverting, 95n, new Date('2026-07-31T00:01:00.000Z')).status,
    ).toBe('REVERT_CONSTRAINED');
  });

  it('fails revert closed when minimum exceeds cap and never plans upper exploration', () => {
    expect(
      planLowerExperiment({
        currentBidMinor: 50n,
        explorationStepPpm: 100_000,
        floorMinor: 50n,
        maxSpendMinor: 10_000n,
        plannedFullDays: 3,
        quantumMinor: 1n,
        safetyBufferPpm: 200_000,
      }),
    ).toBeNull();
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
      throw new Error('Expected experiment');
    }
    const state = {
      ...planned,
      status: 'REVERTING' as const,
    };
    expect(
      resolveExperimentRevert(state, {
        capabilityAvailable: true,
        now: new Date('2026-07-31T00:00:00.000Z'),
        policyMaxBidMinor: 90n,
        policyMinBidMinor: null,
        quantumMinor: 1n,
        wbMinimumBidMinor: 100n,
      }).state.status,
    ).toBe('FAILED_REVERT_BLOCKED');
  });
});
