import { roundToQuantum } from './rational.js';

const PPM = 1_000_000n;

/**
 * Pure persisted experiment state used by the lifecycle reducer.
 */
export interface ExperimentState {
  readonly actualRevertBidMinor: bigint | null;
  readonly collectedEligibleDays: number;
  readonly completedAt: Date | null;
  readonly desiredRevertBidMinor: bigint;
  readonly evaluationNotBefore: Date | null;
  readonly experimentBidMinor: bigint;
  readonly observedExperimentSpendMinor: bigint;
  readonly plannedFullDays: number;
  readonly reservedUnobservedSpendMinor: bigint;
  readonly sourceBidMinor: bigint;
  readonly spendLimitMinor: bigint;
  readonly spendSafetyBufferMinor: bigint;
  readonly status:
    | 'ACCEPTED'
    | 'ACTIVE'
    | 'CANCELLED'
    | 'COLLECTING'
    | 'EVALUATING'
    | 'FAILED'
    | 'FAILED_REVERT_BLOCKED'
    | 'PLANNED'
    | 'REVERTED'
    | 'REVERTING'
    | 'REVERT_CONSTRAINED';
  readonly terminalReasonCode: string | null;
}

/**
 * Plans a lower-only exploration bid through legal bounds and quantum.
 *
 * @param input Experiment prerequisites.
 * @param input.currentBidMinor current bid minor field of the validated input.
 * @param input.explorationStepPpm exploration step ppm field of the validated input.
 * @param input.floorMinor floor minor field of the validated input.
 * @param input.maxSpendMinor max spend minor field of the validated input.
 * @param input.plannedFullDays planned full days field of the validated input.
 * @param input.quantumMinor quantum minor field of the validated input.
 * @param input.safetyBufferPpm safety buffer ppm field of the validated input.
 * @returns Planned experiment or null when no distinct lower candidate exists.
 */
export function planLowerExperiment(input: {
  readonly currentBidMinor: bigint;
  readonly explorationStepPpm: number;
  readonly floorMinor: bigint;
  readonly maxSpendMinor: bigint;
  readonly plannedFullDays: number;
  readonly quantumMinor: bigint;
  readonly safetyBufferPpm: number;
}): ExperimentState | null {
  if (
    input.currentBidMinor <= 0n ||
    input.floorMinor < 0n ||
    input.quantumMinor <= 0n ||
    input.maxSpendMinor <= 0n ||
    !Number.isInteger(input.plannedFullDays) ||
    input.plannedFullDays < 1 ||
    !validPpm(input.explorationStepPpm) ||
    !validPpm(input.safetyBufferPpm)
  ) {
    throw new Error('Invalid experiment planning inputs');
  }
  const percentage = (input.currentBidMinor * BigInt(input.explorationStepPpm)) / PPM;
  const step = maximum(input.quantumMinor, roundToQuantum(percentage, input.quantumMinor));
  const raw = input.currentBidMinor > step ? input.currentBidMinor - step : 0n;
  const experimentBidMinor = maximum(input.floorMinor, roundToQuantum(raw, input.quantumMinor));
  if (experimentBidMinor >= input.currentBidMinor) {
    return null;
  }
  return Object.freeze({
    actualRevertBidMinor: null,
    collectedEligibleDays: 0,
    completedAt: null,
    desiredRevertBidMinor: input.currentBidMinor,
    evaluationNotBefore: null,
    experimentBidMinor,
    observedExperimentSpendMinor: 0n,
    plannedFullDays: input.plannedFullDays,
    reservedUnobservedSpendMinor: 0n,
    sourceBidMinor: input.currentBidMinor,
    spendLimitMinor: input.maxSpendMinor,
    spendSafetyBufferMinor: (input.maxSpendMinor * BigInt(input.safetyBufferPpm)) / PPM,
    status: 'PLANNED',
    terminalReasonCode: null,
  });
}

/**
 * Advances collection using model time and the complete observed spend, never wall-clock sleeps.
 *
 * @param state Current immutable experiment state.
 * @param input Newly synchronized evidence.
 * @param input.collectedEligibleDays collected eligible days field of the validated input.
 * @param input.configurationValid configuration valid field of the validated input.
 * @param input.evaluationNotBefore evaluation not before field of the validated input.
 * @param input.now now field of the validated input.
 * @param input.observedExperimentSpendMinor observed experiment spend minor field of the validated input.
 * @param input.reservedUnobservedSpendMinor reserved unobserved spend minor field of the validated input.
 * @returns Next immutable state.
 */
export function advanceExperiment(
  state: ExperimentState,
  input: {
    readonly collectedEligibleDays: number;
    readonly configurationValid: boolean;
    readonly evaluationNotBefore: Date;
    readonly now: Date;
    readonly observedExperimentSpendMinor: bigint;
    readonly reservedUnobservedSpendMinor: bigint;
  },
): ExperimentState {
  if (isTerminal(state.status)) {
    return state;
  }
  if (
    input.collectedEligibleDays < 0 ||
    input.observedExperimentSpendMinor < 0n ||
    input.reservedUnobservedSpendMinor < 0n
  ) {
    throw new Error('Experiment evidence must not be negative');
  }
  const spendReached =
    input.observedExperimentSpendMinor + input.reservedUnobservedSpendMinor >=
    state.spendLimitMinor - state.spendSafetyBufferMinor;
  const mustRevert = !input.configurationValid || spendReached;
  const enoughDays = input.collectedEligibleDays >= state.plannedFullDays;
  const conversionElapsed = input.now >= input.evaluationNotBefore;
  return Object.freeze({
    ...state,
    collectedEligibleDays: input.collectedEligibleDays,
    evaluationNotBefore: input.evaluationNotBefore,
    observedExperimentSpendMinor: input.observedExperimentSpendMinor,
    reservedUnobservedSpendMinor: input.reservedUnobservedSpendMinor,
    status: mustRevert
      ? 'REVERTING'
      : enoughDays && conversionElapsed
        ? 'EVALUATING'
        : state.status === 'PLANNED'
          ? 'ACTIVE'
          : 'COLLECTING',
    terminalReasonCode: mustRevert
      ? !input.configurationValid
        ? 'CONFIGURATION_CHANGED'
        : 'EXPLORATION_SPEND_THRESHOLD'
      : null,
  });
}

/**
 * Resolves a revert target without bypassing current legal bounds.
 *
 * @param state Reverting experiment.
 * @param input Current verified capability and bounds.
 * @param input.capabilityAvailable capability available field of the validated input.
 * @param input.now now field of the validated input.
 * @param input.policyMaxBidMinor policy max bid minor field of the validated input.
 * @param input.policyMinBidMinor policy min bid minor field of the validated input.
 * @param input.quantumMinor quantum minor field of the validated input.
 * @param input.wbMinimumBidMinor wb minimum bid minor field of the validated input.
 * @returns Revert instruction or fail-closed terminal state.
 */
export function resolveExperimentRevert(
  state: ExperimentState,
  input: {
    readonly capabilityAvailable: boolean;
    readonly now: Date;
    readonly policyMaxBidMinor: bigint;
    readonly policyMinBidMinor: bigint | null;
    readonly quantumMinor: bigint;
    readonly wbMinimumBidMinor: bigint | null;
  },
):
  | { readonly bidMinor: bigint; readonly constrained: boolean; readonly state: ExperimentState }
  | { readonly bidMinor: null; readonly constrained: false; readonly state: ExperimentState } {
  if (state.status !== 'REVERTING') {
    throw new Error('Experiment is not reverting');
  }
  if (
    !input.capabilityAvailable ||
    input.wbMinimumBidMinor === null ||
    input.wbMinimumBidMinor > input.policyMaxBidMinor
  ) {
    return Object.freeze({
      bidMinor: null,
      constrained: false,
      state: Object.freeze({
        ...state,
        completedAt: input.now,
        status: 'FAILED_REVERT_BLOCKED',
        terminalReasonCode: 'EXPLORATION_REVERT_BLOCKED',
      }),
    });
  }
  const floor = maximum(input.policyMinBidMinor ?? 0n, input.wbMinimumBidMinor);
  const legal = clamp(
    roundToQuantum(state.desiredRevertBidMinor, input.quantumMinor),
    floor,
    input.policyMaxBidMinor,
  );
  return Object.freeze({
    bidMinor: legal,
    constrained: legal !== state.desiredRevertBidMinor,
    state,
  });
}

/**
 * Marks a verified revert result terminal.
 *
 * @param state Reverting state.
 * @param actualBidMinor Confirmed live bid.
 * @param now Model clock instant.
 * @returns Terminal state.
 */
export function confirmExperimentRevert(
  state: ExperimentState,
  actualBidMinor: bigint,
  now: Date,
): ExperimentState {
  if (state.status !== 'REVERTING') {
    throw new Error('Experiment is not reverting');
  }
  const constrained = actualBidMinor !== state.desiredRevertBidMinor;
  return Object.freeze({
    ...state,
    actualRevertBidMinor: actualBidMinor,
    completedAt: now,
    status: constrained ? 'REVERT_CONSTRAINED' : 'REVERTED',
    terminalReasonCode: constrained ? 'EXPLORATION_REVERT_CONSTRAINED' : 'EXPLORATION_REVERTED',
  });
}

/**
 * Determines whether is terminal is satisfied.
 *
 * @param status Lifecycle status to count or classify.
 * @returns Whether the requested condition is satisfied.
 */
function isTerminal(status: ExperimentState['status']): boolean {
  return [
    'ACCEPTED',
    'CANCELLED',
    'FAILED',
    'FAILED_REVERT_BLOCKED',
    'REVERTED',
    'REVERT_CONSTRAINED',
  ].includes(status);
}

/**
 * Performs the valid ppm operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the valid ppm operation.
 */
function validPpm(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= Number(PPM);
}

/**
 * Performs the maximum operation while preserving domain invariants.
 *
 * @param values Values to validate or transform.
 * @returns Result produced by the maximum operation.
 */
function maximum(...values: readonly bigint[]): bigint {
  return values.reduce((current, value) => (value > current ? value : current));
}

/**
 * Performs the clamp operation while preserving domain invariants.
 *
 * @param value Value to validate, transform, or persist.
 * @param lower Lower numeric bound used by the calculation.
 * @param upper Upper numeric bound used by the calculation.
 * @returns Result produced by the clamp operation.
 */
function clamp(value: bigint, lower: bigint, upper: bigint): bigint {
  return value < lower ? lower : value > upper ? upper : value;
}
