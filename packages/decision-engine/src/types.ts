/**
 * One finalized daily observation consumed by the estimator.
 */
export interface DecisionPerformanceDay {
  readonly bidMinor: bigint;
  readonly clicks: bigint;
  readonly configurationChecksum: string;
  readonly date: string;
  readonly inputChecksum: string;
  readonly orderedUnits: bigint | null;
  readonly spendMinor: bigint;
  readonly views: bigint | null;
}

/**
 * Fully resolved versioned decision policy.
 */
export interface DecisionPolicy {
  readonly baselineWindowDays: number;
  readonly candidateBidStepPpm: number;
  readonly cooldownMinutes: number;
  readonly dailySpendLimitMinor: bigint | null;
  readonly executionMode: 'APPLY' | 'OBSERVE_ONLY';
  readonly explorationEnabled: boolean;
  readonly explorationSpendSafetyBufferPpm: number;
  readonly explorationStepPpm: number;
  readonly maxDailyDecreasePpm: number;
  readonly maxDailyIncreasePpm: number;
  readonly maxDecreasePerCyclePpm: number;
  readonly maxExplorationSpendMinor: bigint | null;
  readonly maxIncreasePerCyclePpm: number;
  readonly maxSpendPerMinuteMinor: bigint | null;
  readonly maxSpendReportingLagMinutes: number | null;
  readonly minAbsoluteChangeMinor: bigint;
  readonly minBidClicks: bigint;
  readonly minBidObservationDays: number;
  readonly minBidOrderedUnits: bigint;
  readonly minBidSpendMinor: bigint | null;
  readonly minBidViews: bigint;
  readonly minExpectedProfitImprovementMinor: bigint;
  readonly minRelativeChangePpm: number;
  readonly orderedUnitsSafetyDiscountPpm: number;
  readonly policyMaxBidMinor: bigint | null;
  readonly policyMinBidMinor: bigint | null;
  readonly predictionHorizonDays: number;
  readonly primaryWindowDays: number;
  readonly spendSafetyPremiumPpm: number;
  readonly version: bigint;
  readonly zeroConversionDecreasePpm: number;
  readonly zeroConversionMinClicks: bigint;
  readonly zeroConversionMinViews: bigint;
  readonly zeroConversionSpendThresholdMinor: bigint | null;
}

/**
 * Conservative same-day spend evidence used only for increase gating.
 */
export interface BudgetEvidence {
  readonly contractStatus: 'UNVERIFIED' | 'VERIFIED';
  readonly observedSameDaySpendMinor: bigint | null;
  readonly signalFetchedAt: Date | null;
  readonly signalFreshnessMinutes: number;
  readonly spendSignalCoverageEndedAt: Date | null;
  readonly targetSyncSlaMinutes: number;
  readonly writeVisibilitySlaSeconds: number;
}

/**
 * Complete normalized target input for one deterministic decision.
 */
export interface DecisionInput {
  readonly algorithmVersion: 'rules-v1';
  readonly attributionUnambiguous: boolean;
  readonly budget: BudgetEvidence;
  readonly campaignRunning: boolean;
  readonly capability: 'CARD_WRITE_READY' | 'CLUSTER_WRITE_READY' | 'OBSERVE_ONLY' | 'UNSUPPORTED';
  readonly currentBidMinor: bigint;
  readonly currentTrafficRegimeChecksum: string;
  readonly dailyAnchorBidMinor: bigint;
  readonly decisionAt: Date;
  readonly endpointQuantumMinor: bigint;
  readonly expectedContributionBeforeAdsMinor: bigint | null;
  readonly lastWriteAt: Date | null;
  readonly manualPause: boolean;
  readonly performanceDays: readonly DecisionPerformanceDay[];
  readonly paymentType: 'CPC' | 'CPM';
  readonly policy: DecisionPolicy;
  readonly productEconomicsVersion: bigint | null;
  readonly snapshotApplyEligible: boolean;
  readonly targetKey: {
    readonly nmId: bigint;
    readonly normQueryCanonical: string | null;
    readonly placement: string;
    readonly targetKind: 'CARD' | 'CLUSTER';
    readonly wbCampaignId: bigint;
  };
  readonly wbMinimumBidMinor: bigint | null;
}

/**
 * One exact bid-response bucket.
 */
export interface BidResponseBucket {
  readonly bidMinor: bigint;
  readonly clicks: bigint;
  readonly eligible: boolean;
  readonly eligibleDays: number;
  readonly exclusionReasons: readonly string[];
  readonly orderedUnits: bigint;
  readonly orderedUnitsPerDayPava: string;
  readonly orderedUnitsPerDayRaw: string;
  readonly orderedUnitsPerDaySafe: string;
  readonly spendMinor: bigint;
  readonly spendMinorPerDayPava: string;
  readonly spendMinorPerDayRaw: string;
  readonly spendMinorPerDaySafe: string;
  readonly views: bigint | null;
}

/**
 * Scored bid candidate with exact decimal explanation.
 */
export interface BidCandidate {
  readonly bidMinor: bigint;
  readonly conservativeProfitScoreExact: string;
  readonly conservativeProfitScoreMinor: bigint;
  readonly expectedAdvertisingSpendExact: string;
  readonly expectedOrderedUnitsExact: string;
}

/**
 * Immutable pure decision output.
 */
export interface DecisionResult {
  readonly action: 'BLOCKED' | 'DECREASE' | 'INCREASE' | 'NO_CHANGE';
  readonly boundedBidMinor: bigint | null;
  readonly decisionInputChecksum: string;
  readonly explanation: {
    readonly actionBlockers: readonly string[];
    readonly buckets: readonly BidResponseBucket[];
    readonly candidates: readonly BidCandidate[];
    readonly inputSnapshotChecksum: string;
    readonly reservedUnobservedSpendMinor: bigint | null;
    readonly unconditionalBlockers: readonly string[];
  };
  readonly guardrailCodes: readonly string[];
  readonly outcomeReasonCode: string;
  readonly proposedBidMinor: bigint | null;
  readonly queueEligible: boolean;
  readonly strategyReasonCode: string;
}
