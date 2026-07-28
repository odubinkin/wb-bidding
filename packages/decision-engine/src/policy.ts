import type { DecisionPolicy } from './types.js';

const PPM = 1_000_000;

/**
 * Validates a fully resolved immutable policy.
 *
 * @param policy - Policy candidate.
 * @throws {Error} When a normative range or APPLY prerequisite is violated.
 */
export function validateDecisionPolicy(policy: DecisionPolicy): void {
  const positiveIntegers = [
    policy.baselineWindowDays,
    policy.candidateBidStepPpm,
    policy.cooldownMinutes,
    policy.explorationStepPpm,
    policy.maxDailyDecreasePpm,
    policy.maxDailyIncreasePpm,
    policy.maxDecreasePerCyclePpm,
    policy.maxIncreasePerCyclePpm,
    policy.minBidObservationDays,
    policy.minRelativeChangePpm,
    policy.predictionHorizonDays,
    policy.primaryWindowDays,
    policy.zeroConversionDecreasePpm,
  ];
  if (positiveIntegers.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error('Policy integer thresholds must be positive');
  }
  if (policy.baselineWindowDays < policy.primaryWindowDays) {
    throw new Error('Baseline window must contain the primary window');
  }
  for (const value of [
    policy.orderedUnitsSafetyDiscountPpm,
    policy.explorationSpendSafetyBufferPpm,
    policy.minRelativeChangePpm,
    policy.maxIncreasePerCyclePpm,
    policy.maxDecreasePerCyclePpm,
    policy.maxDailyIncreasePpm,
    policy.maxDailyDecreasePpm,
    policy.zeroConversionDecreasePpm,
  ]) {
    if (!Number.isInteger(value) || value < 0 || value > PPM) {
      throw new Error('Policy discount/change ppm is out of range');
    }
  }
  if (
    !Number.isInteger(policy.spendSafetyPremiumPpm) ||
    policy.spendSafetyPremiumPpm < 0 ||
    policy.spendSafetyPremiumPpm > 10 * PPM
  ) {
    throw new Error('Spend safety premium is out of range');
  }
  for (const value of [
    policy.minAbsoluteChangeMinor,
    policy.minBidClicks,
    policy.minBidOrderedUnits,
    policy.minBidViews,
    policy.minExpectedProfitImprovementMinor,
    ...(policy.policyMinBidMinor === null ? [] : [policy.policyMinBidMinor]),
    ...(policy.policyMaxBidMinor === null ? [] : [policy.policyMaxBidMinor]),
  ]) {
    if (value < 0n) {
      throw new Error('Policy money/counter threshold must not be negative');
    }
  }
  if (
    policy.policyMinBidMinor !== null &&
    policy.policyMaxBidMinor !== null &&
    policy.policyMinBidMinor > policy.policyMaxBidMinor
  ) {
    throw new Error('Policy minimum exceeds maximum');
  }
  if (
    policy.executionMode === 'APPLY' &&
    (policy.policyMaxBidMinor === null ||
      policy.dailySpendLimitMinor === null ||
      policy.maxSpendPerMinuteMinor === null ||
      policy.maxSpendReportingLagMinutes === null)
  ) {
    throw new Error('APPLY policy is missing cap or increase budget prerequisites');
  }
  if (
    policy.explorationEnabled &&
    (policy.maxExplorationSpendMinor === null || policy.maxExplorationSpendMinor <= 0n)
  ) {
    throw new Error('Exploration requires an explicit spend threshold');
  }
}

/**
 * Safe reproducible initial policy from the specification.
 *
 * @returns Observe-only policy version one.
 */
export function initialObserveOnlyPolicy(): DecisionPolicy {
  return Object.freeze({
    baselineWindowDays: 28,
    candidateBidStepPpm: 100_000,
    cooldownMinutes: 1_440,
    dailySpendLimitMinor: null,
    executionMode: 'OBSERVE_ONLY',
    explorationEnabled: false,
    explorationSpendSafetyBufferPpm: 200_000,
    explorationStepPpm: 100_000,
    maxDailyDecreasePpm: 400_000,
    maxDailyIncreasePpm: 200_000,
    maxDecreasePerCyclePpm: 200_000,
    maxExplorationSpendMinor: null,
    maxIncreasePerCyclePpm: 100_000,
    maxSpendPerMinuteMinor: null,
    maxSpendReportingLagMinutes: null,
    minAbsoluteChangeMinor: 1n,
    minBidClicks: 30n,
    minBidObservationDays: 3,
    minBidOrderedUnits: 3n,
    minBidSpendMinor: null,
    minBidViews: 1_000n,
    minExpectedProfitImprovementMinor: 0n,
    minRelativeChangePpm: 50_000,
    orderedUnitsSafetyDiscountPpm: 200_000,
    policyMaxBidMinor: null,
    policyMinBidMinor: null,
    predictionHorizonDays: 1,
    primaryWindowDays: 7,
    spendSafetyPremiumPpm: 100_000,
    version: 1n,
    zeroConversionDecreasePpm: 200_000,
    zeroConversionMinClicks: 30n,
    zeroConversionMinViews: 1_000n,
    zeroConversionSpendThresholdMinor: null,
  });
}
