import { scopedChecksum } from './checksum.js';
import { buildBidResponseCurve, scoreCandidate, selectBestCandidate } from './estimator.js';
import { validateDecisionPolicy } from './policy.js';
import { roundToQuantum } from './rational.js';
import type {
  BidCandidate,
  DecisionInput,
  DecisionPerformanceDay,
  DecisionResult,
} from './types.js';

const PPM = 1_000_000n;

/**
 * Executes the pure deterministic rules-v1 Decision Engine.
 *
 * @param input Complete normalized immutable target input.
 * @returns Explained decision without any network or persistence side effects.
 */
export function decideBid(input: DecisionInput): DecisionResult {
  validateDecisionPolicy(input.policy);
  validateInput(input);
  const unconditionalBlockers = collectUnconditionalBlockers(input);
  const inputSnapshotPayload = {
    budget: input.budget,
    currentBidMinor: input.currentBidMinor,
    currentTrafficRegimeChecksum: input.currentTrafficRegimeChecksum,
    endpointQuantumMinor: input.endpointQuantumMinor,
    expectedContributionBeforeAdsMinor: input.expectedContributionBeforeAdsMinor,
    performanceDays: [...input.performanceDays]
      .sort((left, right) =>
        `${left.date}:${left.bidMinor.toString()}`.localeCompare(
          `${right.date}:${right.bidMinor.toString()}`,
        ),
      )
      .map((day) => ({ ...day })),
    productEconomicsVersion: input.productEconomicsVersion,
    recommendationBidHintsMinor: input.recommendationBidHintsMinor,
    recommendationSnapshotChecksum: input.recommendationSnapshotChecksum,
    recommendationSnapshotFetchedAt: input.recommendationSnapshotFetchedAt,
    targetKey: input.targetKey,
    wbMinimumBidMinor: input.wbMinimumBidMinor,
  };
  const inputSnapshotChecksum = scopedChecksum('input-snapshot-v1', inputSnapshotPayload);
  const decisionContext = {
    accountLocalDate: input.accountLocalDate,
    algorithmVersion: input.algorithmVersion,
    budgetPhase: budgetPhase(input),
    cooldownDeadline:
      input.lastWriteAt === null
        ? null
        : new Date(
            input.lastWriteAt.getTime() + input.policy.cooldownMinutes * 60_000,
          ).toISOString(),
    cooldownPhase: isCooldownActive(input) ? 'ACTIVE' : 'ELAPSED',
    dailyAnchorBidMinor: input.dailyAnchorBidMinor,
    inputSnapshotChecksum,
    policy: input.policy,
  };
  const decisionInputChecksum = scopedChecksum('bid-decision-v1', decisionContext);
  if (unconditionalBlockers.length > 0) {
    return result({
      action: 'BLOCKED',
      actionBlockers: [],
      boundedBidMinor: null,
      buckets: [],
      candidates: [],
      decisionInputChecksum,
      guardrailCodes: unconditionalBlockers,
      inputSnapshotChecksum,
      outcomeReasonCode: unconditionalBlockers[0] ?? 'DATA_INCONSISTENCY',
      proposedBidMinor: null,
      queueEligible: false,
      reservedUnobservedSpendMinor: null,
      strategyReasonCode: 'NO_STRATEGY',
      unconditionalBlockers,
    });
  }

  const contribution = input.expectedContributionBeforeAdsMinor;
  if (contribution === null) {
    throw new Error('Unconditional blocker resolution lost product economics');
  }
  const floor = maximum(input.policy.policyMinBidMinor ?? 0n, input.wbMinimumBidMinor ?? 0n);
  const cap = input.policy.policyMaxBidMinor;
  const curve = buildBidResponseCurve(input.performanceDays, input.paymentType, input.policy);
  const currentAggregate = aggregateCurrentRegime(input.performanceDays, input);
  let strategyReasonCode: string;
  let rawRecommendedBid: bigint | null = null;
  let candidates: readonly BidCandidate[] = [];

  if (contribution <= 0n) {
    strategyReasonCode = 'NEGATIVE_CONTRIBUTION_BEFORE_ADS';
    rawRecommendedBid = floor;
  } else if (isZeroConversion(input, currentAggregate)) {
    strategyReasonCode = 'ZERO_CONVERSION_DECREASE';
    rawRecommendedBid =
      (input.currentBidMinor * (PPM - BigInt(input.policy.zeroConversionDecreasePpm))) / PPM;
  } else {
    const candidateBids = buildCandidateSet(input, curve.exact, floor, cap);
    candidates = Object.freeze(
      candidateBids
        .map((bid) =>
          scoreCandidate(bid, curve.exact, contribution, input.policy.predictionHorizonDays),
        )
        .filter((candidate): candidate is BidCandidate => candidate !== null),
    );
    const currentCandidate = candidates.find(
      (candidate) => candidate.bidMinor === input.currentBidMinor,
    );
    if (currentCandidate === undefined) {
      return blockedOutcome(
        input,
        inputSnapshotChecksum,
        decisionInputChecksum,
        curve.buckets,
        candidates,
        input.performanceDays.some((day) => day.orderedUnits === null)
          ? 'MISSING_ORDERED_UNITS'
          : 'INSUFFICIENT_DATA',
      );
    }
    if (candidates.length < 2) {
      return blockedOutcome(
        input,
        inputSnapshotChecksum,
        decisionInputChecksum,
        curve.buckets,
        candidates,
        'INSUFFICIENT_BID_RESPONSE_DATA',
      );
    }
    const best = selectBestCandidate(candidates, input.currentBidMinor);
    if (best === null || best.bidMinor === input.currentBidMinor) {
      strategyReasonCode = 'MAX_PROFIT_CURRENT_BID';
      rawRecommendedBid = input.currentBidMinor;
    } else {
      const improvement =
        best.conservativeProfitScoreMinor - currentCandidate.conservativeProfitScoreMinor;
      if (improvement < input.policy.minExpectedProfitImprovementMinor) {
        return result({
          action: 'NO_CHANGE',
          actionBlockers: [],
          boundedBidMinor: input.currentBidMinor,
          buckets: curve.buckets,
          candidates,
          decisionInputChecksum,
          guardrailCodes: [],
          inputSnapshotChecksum,
          outcomeReasonCode: 'NO_PROFIT_IMPROVEMENT',
          proposedBidMinor: best.bidMinor,
          queueEligible: false,
          reservedUnobservedSpendMinor: null,
          strategyReasonCode:
            best.bidMinor > input.currentBidMinor
              ? 'PROFITABLE_INCREASE'
              : 'PROFIT_MAXIMIZING_DECREASE',
          unconditionalBlockers: [],
        });
      }
      strategyReasonCode =
        best.bidMinor > input.currentBidMinor
          ? 'PROFITABLE_INCREASE'
          : 'PROFIT_MAXIMIZING_DECREASE';
      rawRecommendedBid = best.bidMinor;
    }
  }

  const bounded = applyBounds(input, rawRecommendedBid, floor, cap);
  const direction =
    bounded.bidMinor > input.currentBidMinor
      ? 'INCREASE'
      : bounded.bidMinor < input.currentBidMinor
        ? 'DECREASE'
        : 'NO_CHANGE';
  const actionBlockers: string[] = [];
  let reservedUnobservedSpendMinor: bigint | null = null;
  if (direction === 'INCREASE') {
    const budget = assessIncreaseBudget(input);
    reservedUnobservedSpendMinor = budget.reserved;
    if (!budget.allowed) {
      actionBlockers.push('BUDGET_SIGNAL_UNAVAILABLE');
    }
  }
  if (direction !== 'NO_CHANGE' && !meetsHysteresis(input, bounded.bidMinor)) {
    actionBlockers.push('BELOW_MIN_CHANGE');
  }
  if (direction !== 'NO_CHANGE' && isCooldownActive(input)) {
    actionBlockers.push('COOLDOWN');
  }
  const guardrailCodes = Object.freeze([...new Set([...bounded.guardrails, ...actionBlockers])]);
  let outcomeReasonCode =
    direction === 'NO_CHANGE'
      ? bounded.floorReached
        ? 'AT_FLOOR'
        : bounded.capReached
          ? 'AT_CAP'
          : strategyReasonCode
      : strategyReasonCode;
  let action: DecisionResult['action'] = direction;
  let queueEligible = direction === 'INCREASE' || direction === 'DECREASE';
  if (actionBlockers.length > 0) {
    action = 'BLOCKED';
    queueEligible = false;
    outcomeReasonCode = actionBlockers[0] ?? 'DATA_INCONSISTENCY';
  } else if (input.policy.executionMode === 'OBSERVE_ONLY') {
    action = direction;
    queueEligible = false;
    outcomeReasonCode = 'OBSERVE_ONLY';
  }
  return result({
    action,
    actionBlockers,
    boundedBidMinor: bounded.bidMinor,
    buckets: curve.buckets,
    candidates,
    decisionInputChecksum,
    guardrailCodes,
    inputSnapshotChecksum,
    outcomeReasonCode,
    proposedBidMinor: rawRecommendedBid,
    queueEligible,
    reservedUnobservedSpendMinor,
    strategyReasonCode,
    unconditionalBlockers: [],
  });
}

/**
 * Performs the collect unconditional blockers operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @returns Result produced by the collect unconditional blockers operation.
 */
function collectUnconditionalBlockers(input: DecisionInput): readonly string[] {
  const blockers = new Set<string>();
  if (input.manualPause) {
    blockers.add('MANUAL_PAUSE');
  }
  if (!input.campaignRunning) {
    blockers.add('CAMPAIGN_NOT_RUNNING');
  }
  if (input.capability === 'UNSUPPORTED') {
    blockers.add('UNSUPPORTED_CAMPAIGN');
  }
  if (input.targetKey.targetKind === 'CLUSTER' && input.paymentType !== 'CPM') {
    blockers.add('UNSUPPORTED_CAMPAIGN');
  }
  if (input.targetKey.targetKind === 'CLUSTER' && input.capability !== 'CLUSTER_WRITE_READY') {
    blockers.add('UNVERIFIED_CLUSTER_BID_CONTRACT');
  }
  if (!input.attributionUnambiguous) {
    blockers.add('INSUFFICIENT_ATTRIBUTION_GRANULARITY');
  }
  if (input.expectedContributionBeforeAdsMinor === null || input.productEconomicsVersion === null) {
    blockers.add('MISSING_PRODUCT_ECONOMICS');
  }
  if (!input.snapshotApplyEligible || input.wbMinimumBidMinor === null) {
    blockers.add('STALE_DATA');
  }
  if (
    input.policy.policyMaxBidMinor !== null &&
    input.wbMinimumBidMinor !== null &&
    input.wbMinimumBidMinor > input.policy.policyMaxBidMinor
  ) {
    blockers.add('MIN_ABOVE_POLICY_MAX');
  }
  const priority = [
    'MANUAL_PAUSE',
    'CAMPAIGN_NOT_RUNNING',
    'UNSUPPORTED_CAMPAIGN',
    'UNVERIFIED_CLUSTER_BID_CONTRACT',
    'INSUFFICIENT_ATTRIBUTION_GRANULARITY',
    'DATA_INCONSISTENCY',
    'INVALID_PRODUCT_ECONOMICS',
    'MISSING_PRODUCT_ECONOMICS',
    'STALE_DATA',
    'MIN_ABOVE_POLICY_MAX',
  ];
  return Object.freeze(priority.filter((reason) => blockers.has(reason)));
}

/**
 * Creates candidate set.
 *
 * @param input Validated input values for the operation.
 * @param curve Estimated bid-response curve used for scoring.
 * @param floor Minimum bid allowed by the active constraints.
 * @param cap Maximum bid allowed by the active constraints.
 * @returns Constructed or normalized result.
 */
function buildCandidateSet(
  input: DecisionInput,
  curve: readonly { readonly bidMinor: bigint; readonly eligible: boolean }[],
  floor: bigint,
  cap: bigint | null,
): readonly bigint[] {
  const candidates = new Set<string>([input.currentBidMinor.toString()]);
  for (const bucket of curve) {
    if (bucket.eligible) {
      candidates.add(bucket.bidMinor.toString());
    }
  }
  const percentageStep = roundToQuantum(
    (input.currentBidMinor * BigInt(input.policy.candidateBidStepPpm)) / PPM,
    input.endpointQuantumMinor,
  );
  const step = maximum(input.endpointQuantumMinor, percentageStep);
  if (input.currentBidMinor >= step) {
    candidates.add((input.currentBidMinor - step).toString());
  }
  candidates.add((input.currentBidMinor + step).toString());
  candidates.add(floor.toString());
  if (cap !== null) {
    candidates.add(cap.toString());
  }
  if (input.paymentType === 'CPM') {
    for (const recommendation of input.recommendationBidHintsMinor) {
      if (recommendation > 0n) candidates.add(recommendation.toString());
    }
  }
  return Object.freeze(
    [...candidates]
      .map(BigInt)
      .filter((bid) => bid >= floor && (cap === null || bid <= cap))
      .sort(compareBigInt),
  );
}

/**
 * Updates bounds.
 *
 * @param input Validated input values for the operation.
 * @param rawBid Unbounded bid proposed before safety constraints are applied.
 * @param floor Minimum bid allowed by the active constraints.
 * @param configuredCap Validated configured cap value supplied to the operation.
 * @returns Result produced by the apply bounds operation.
 */
function applyBounds(
  input: DecisionInput,
  rawBid: bigint | null,
  floor: bigint,
  configuredCap: bigint | null,
): {
  readonly bidMinor: bigint;
  readonly capReached: boolean;
  readonly floorReached: boolean;
  readonly guardrails: readonly string[];
} {
  const raw = rawBid ?? input.currentBidMinor;
  const cap = configuredCap ?? maximum(raw, input.currentBidMinor);
  let bid = clamp(raw, floor, cap);
  bid = clamp(roundToQuantum(bid, input.endpointQuantumMinor), floor, cap);
  const cycleLower =
    (input.currentBidMinor * (PPM - BigInt(input.policy.maxDecreasePerCyclePpm))) / PPM;
  const cycleUpper =
    (input.currentBidMinor * (PPM + BigInt(input.policy.maxIncreasePerCyclePpm))) / PPM;
  const dailyLower =
    (input.dailyAnchorBidMinor * (PPM - BigInt(input.policy.maxDailyDecreasePpm))) / PPM;
  const dailyUpper =
    (input.dailyAnchorBidMinor * (PPM + BigInt(input.policy.maxDailyIncreasePpm))) / PPM;
  const speedLower = maximum(floor, cycleLower, dailyLower);
  const speedUpper = minimum(cap, cycleUpper, dailyUpper);
  const guardrails: string[] = [];
  if (bid < speedLower) {
    bid = speedLower;
    guardrails.push('DECREASE_SPEED_CAP');
  }
  if (bid > speedUpper) {
    bid = speedUpper;
    guardrails.push('INCREASE_SPEED_CAP');
  }
  bid = clamp(roundToQuantum(bid, input.endpointQuantumMinor), floor, cap);
  return Object.freeze({
    bidMinor: bid,
    capReached: raw >= cap && bid === input.currentBidMinor,
    floorReached: raw <= floor && bid === input.currentBidMinor,
    guardrails: Object.freeze(guardrails),
  });
}

/**
 * Performs the assess increase budget operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @returns Result produced by the assess increase budget operation.
 */
function assessIncreaseBudget(input: DecisionInput): {
  readonly allowed: boolean;
  readonly reserved: bigint | null;
} {
  const policy = input.policy;
  const budget = input.budget;
  if (
    budget.contractStatus !== 'VERIFIED' ||
    budget.observedSameDaySpendMinor === null ||
    budget.signalFetchedAt === null ||
    budget.spendSignalCoverageEndedAt === null ||
    policy.dailySpendLimitMinor === null ||
    policy.maxSpendPerMinuteMinor === null ||
    policy.maxSpendReportingLagMinutes === null
  ) {
    return Object.freeze({ allowed: false, reserved: null });
  }
  const ageMinutes = (input.decisionAt.getTime() - budget.signalFetchedAt.getTime()) / 60_000;
  if (ageMinutes < 0 || ageMinutes > budget.signalFreshnessMinutes) {
    return Object.freeze({ allowed: false, reserved: null });
  }
  const unobservedMinutes =
    Math.ceil(
      Math.max(
        0,
        (input.decisionAt.getTime() - budget.spendSignalCoverageEndedAt.getTime()) / 60_000,
      ),
    ) +
    budget.targetSyncSlaMinutes +
    Math.ceil(budget.writeVisibilitySlaSeconds / 60);
  const reserved = policy.maxSpendPerMinuteMinor * BigInt(unobservedMinutes);
  return Object.freeze({
    allowed: budget.observedSameDaySpendMinor + reserved < policy.dailySpendLimitMinor,
    reserved,
  });
}

/**
 * Performs the aggregate current regime operation while preserving domain invariants.
 *
 * @param days Complete performance days included in the calculation.
 * @param input Validated input values for the operation.
 * @returns Result produced by the aggregate current regime operation.
 */
function aggregateCurrentRegime(
  days: readonly DecisionPerformanceDay[],
  input: DecisionInput,
): {
  readonly clicks: bigint;
  readonly days: number;
  readonly orderedUnits: bigint;
  readonly spendMinor: bigint;
  readonly views: bigint | null;
} {
  const matching = days.filter(
    (day) =>
      day.bidMinor === input.currentBidMinor &&
      day.configurationChecksum === input.currentTrafficRegimeChecksum &&
      day.orderedUnits !== null,
  );
  return {
    clicks: matching.reduce((sum, day) => sum + day.clicks, 0n),
    days: matching.length,
    orderedUnits: matching.reduce((sum, day) => sum + (day.orderedUnits ?? 0n), 0n),
    spendMinor: matching.reduce((sum, day) => sum + day.spendMinor, 0n),
    views: matching.some((day) => day.views === null)
      ? null
      : matching.reduce((sum, day) => sum + (day.views ?? 0n), 0n),
  };
}

/**
 * Determines whether is zero conversion is satisfied.
 *
 * @param input Validated input values for the operation.
 * @param aggregate Validated aggregate value supplied to the operation.
 * @returns Whether the requested condition is satisfied.
 */
function isZeroConversion(
  input: DecisionInput,
  aggregate: ReturnType<typeof aggregateCurrentRegime>,
): boolean {
  if (aggregate.days < input.policy.minBidObservationDays || aggregate.orderedUnits !== 0n) {
    return false;
  }
  return input.paymentType === 'CPM'
    ? (aggregate.views !== null && aggregate.views >= input.policy.zeroConversionMinViews) ||
        (input.policy.zeroConversionSpendThresholdMinor !== null &&
          aggregate.spendMinor >= input.policy.zeroConversionSpendThresholdMinor)
    : aggregate.clicks >= input.policy.zeroConversionMinClicks ||
        (input.policy.zeroConversionSpendThresholdMinor !== null &&
          aggregate.spendMinor >= input.policy.zeroConversionSpendThresholdMinor);
}

/**
 * Performs the meets hysteresis operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @param bid Bid value evaluated by the decision rule.
 * @returns Result produced by the meets hysteresis operation.
 */
function meetsHysteresis(input: DecisionInput, bid: bigint): boolean {
  const absolute = abs(bid - input.currentBidMinor);
  const relativePpm = input.currentBidMinor === 0n ? PPM : (absolute * PPM) / input.currentBidMinor;
  return (
    absolute >= input.policy.minAbsoluteChangeMinor &&
    relativePpm >= BigInt(input.policy.minRelativeChangePpm)
  );
}

/**
 * Determines whether is cooldown active is satisfied.
 *
 * @param input Validated input values for the operation.
 * @returns Whether the requested condition is satisfied.
 */
function isCooldownActive(input: DecisionInput): boolean {
  return (
    input.lastWriteAt !== null &&
    input.decisionAt.getTime() < input.lastWriteAt.getTime() + input.policy.cooldownMinutes * 60_000
  );
}

/**
 * Performs the budget phase operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @returns Result produced by the budget phase operation.
 */
function budgetPhase(input: DecisionInput): string {
  const assessment = assessIncreaseBudget(input);
  return assessment.allowed ? 'HEADROOM' : 'UNAVAILABLE_OR_EXHAUSTED';
}

/**
 * Performs the blocked outcome operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @param inputSnapshotChecksum Checksum binding the result to its immutable input snapshot.
 * @param decisionInputChecksum Validated decision input checksum value supplied to the operation.
 * @param buckets Response-curve buckets included in the decision evidence.
 * @param candidates Candidate bids evaluated by the decision engine.
 * @param reason Stable reason code explaining the outcome.
 * @returns Result produced by the blocked outcome operation.
 */
function blockedOutcome(
  input: DecisionInput,
  inputSnapshotChecksum: string,
  decisionInputChecksum: string,
  buckets: DecisionResult['explanation']['buckets'],
  candidates: readonly BidCandidate[],
  reason: string,
): DecisionResult {
  return result({
    action: 'BLOCKED',
    actionBlockers: [reason],
    boundedBidMinor: input.currentBidMinor,
    buckets,
    candidates,
    decisionInputChecksum,
    guardrailCodes: [reason],
    inputSnapshotChecksum,
    outcomeReasonCode: reason,
    proposedBidMinor: null,
    queueEligible: false,
    reservedUnobservedSpendMinor: null,
    strategyReasonCode: 'NO_STRATEGY',
    unconditionalBlockers: [],
  });
}

/**
 * Performs the result operation while preserving domain invariants.
 *
 * @param input Validated input values for the operation.
 * @param input.action Action selected for the durable state transition.
 * @param input.actionBlockers action blockers field of the validated input.
 * @param input.boundedBidMinor bounded bid minor field of the validated input.
 * @param input.buckets Response-curve buckets included in the decision evidence.
 * @param input.candidates Candidate bids evaluated by the decision engine.
 * @param input.decisionInputChecksum decision input checksum field of the validated input.
 * @param input.guardrailCodes guardrail codes field of the validated input.
 * @param input.inputSnapshotChecksum Checksum binding the result to its immutable input snapshot.
 * @param input.outcomeReasonCode outcome reason code field of the validated input.
 * @param input.proposedBidMinor proposed bid minor field of the validated input.
 * @param input.queueEligible queue eligible field of the validated input.
 * @param input.reservedUnobservedSpendMinor reserved unobserved spend minor field of the validated input.
 * @param input.strategyReasonCode strategy reason code field of the validated input.
 * @param input.unconditionalBlockers unconditional blockers field of the validated input.
 * @returns Result produced by the result operation.
 */
function result(input: {
  readonly action: DecisionResult['action'];
  readonly actionBlockers: readonly string[];
  readonly boundedBidMinor: bigint | null;
  readonly buckets: DecisionResult['explanation']['buckets'];
  readonly candidates: readonly BidCandidate[];
  readonly decisionInputChecksum: string;
  readonly guardrailCodes: readonly string[];
  readonly inputSnapshotChecksum: string;
  readonly outcomeReasonCode: string;
  readonly proposedBidMinor: bigint | null;
  readonly queueEligible: boolean;
  readonly reservedUnobservedSpendMinor: bigint | null;
  readonly strategyReasonCode: string;
  readonly unconditionalBlockers: readonly string[];
}): DecisionResult {
  return Object.freeze({
    action: input.action,
    boundedBidMinor: input.boundedBidMinor,
    decisionInputChecksum: input.decisionInputChecksum,
    explanation: Object.freeze({
      actionBlockers: Object.freeze([...input.actionBlockers]),
      buckets: Object.freeze([...input.buckets]),
      candidates: Object.freeze([...input.candidates]),
      inputSnapshotChecksum: input.inputSnapshotChecksum,
      reservedUnobservedSpendMinor: input.reservedUnobservedSpendMinor,
      unconditionalBlockers: Object.freeze([...input.unconditionalBlockers]),
    }),
    guardrailCodes: Object.freeze([...input.guardrailCodes]),
    outcomeReasonCode: input.outcomeReasonCode,
    proposedBidMinor: input.proposedBidMinor,
    queueEligible: input.queueEligible,
    strategyReasonCode: input.strategyReasonCode,
  });
}

/**
 * Validates input.
 *
 * @param input Validated input values for the operation.
 */
function validateInput(input: DecisionInput): void {
  if (input.currentBidMinor < 0n || input.dailyAnchorBidMinor < 0n) {
    throw new Error('Confirmed bids must not be negative');
  }
  if (input.endpointQuantumMinor <= 0n) {
    throw new Error('Endpoint quantum must be positive');
  }
  if (input.decisionAt.toString() === 'Invalid Date') {
    throw new Error('Decision time is invalid');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.accountLocalDate)) {
    throw new Error('Account-local date is invalid');
  }
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
  if (lower > upper) {
    throw new Error('Invalid bid bounds');
  }
  return value < lower ? lower : value > upper ? upper : value;
}

/**
 * Performs the maximum operation while preserving domain invariants.
 *
 * @param values Values to validate or transform.
 * @returns Result produced by the maximum operation.
 */
function maximum(...values: readonly bigint[]): bigint {
  const first = values[0];
  if (first === undefined) {
    throw new Error('Maximum requires values');
  }
  return values.reduce((current, value) => (value > current ? value : current), first);
}

/**
 * Performs the minimum operation while preserving domain invariants.
 *
 * @param values Values to validate or transform.
 * @returns Result produced by the minimum operation.
 */
function minimum(...values: readonly bigint[]): bigint {
  const first = values[0];
  if (first === undefined) {
    throw new Error('Minimum requires values');
  }
  return values.reduce((current, value) => (value < current ? value : current), first);
}

/**
 * Performs the compare big int operation while preserving domain invariants.
 *
 * @param left Left-hand value used by the comparison.
 * @param right Right-hand value used by the comparison.
 * @returns Result produced by the compare big int operation.
 */
function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
