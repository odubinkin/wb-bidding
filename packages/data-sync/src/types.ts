/**
 * Logical synchronization stages with independent checkpoints.
 */
export type SyncDataKind =
  | 'CAMPAIGN_DISCOVERY'
  | 'CAMPAIGN_DETAILS'
  | 'CURRENT_BID'
  | 'MINIMUM_BID'
  | 'CAMPAIGN_STATISTICS'
  | 'CLUSTER_LIST'
  | 'CLUSTER_STATISTICS'
  | 'BID_RECOMMENDATION'
  | 'BUDGET_DIAGNOSTIC'
  | 'SAME_DAY_SPEND';

/**
 * Immutable source reference used to assemble a target-level snapshot.
 */
export interface SourceEvidence {
  /** Data-kind identity. */
  readonly dataKind: SyncDataKind;
  /** Observation time. */
  readonly fetchedAt: Date;
  /** Whether this source is required for the requested capability. */
  readonly required: boolean;
  /** Maximum acceptable age. */
  readonly freshnessMinutes: number;
  /** Traffic-regime checksum, when applicable. */
  readonly regimeChecksum: string | null;
  /** Immutable source checksum. */
  readonly sourceChecksum: string;
  /** Whether normalization and semantic validation succeeded. */
  readonly valid: boolean;
}

/**
 * Result of atomic target-snapshot eligibility evaluation.
 */
export interface TargetSnapshotAssessment {
  /** Whether any write may use the snapshot. */
  readonly applyEligible: boolean;
  /** Whether an increase may use the snapshot. */
  readonly increaseEligible: boolean;
  /** Deterministic completeness/freshness reason codes. */
  readonly flags: readonly string[];
  /** Oldest included observation. */
  readonly oldestFetchedAt: Date | null;
  /** Shared traffic-regime checksum. */
  readonly regimeChecksum: string | null;
  /** Overall snapshot state. */
  readonly status: 'COMPLETE' | 'INCOMPLETE' | 'INVALID' | 'STALE';
}

/**
 * One immutable raw daily statistical row after exact normalization.
 */
export interface NormalizedStatisticDay {
  /** Add-to-basket count. */
  readonly atbs: bigint;
  /** Attributed revenue in account minor units. */
  readonly attributedRevenueMinor: bigint;
  /** Click count. */
  readonly clicks: bigint;
  /** Technically undelivered ordered items when WB supplies the field. */
  readonly canceled?: bigint | null;
  /** WB statistical date. */
  readonly date: string;
  /** Order count. */
  readonly orders: bigint;
  /** Ordered units; must originate from WB shks. */
  readonly orderedUnits: bigint | null;
  /** Advertising spend in account minor units. */
  readonly spendMinor: bigint;
  /** View count where available. */
  readonly views: bigint | null;
}

/**
 * One bid/configuration observation bounding a statistical day.
 */
export interface BidStateEvidence {
  /** Active placements and all traffic-affecting configuration. */
  readonly configurationChecksum: string;
  /** Confirmed bid in minor units, or null for unknown/absent cluster state. */
  readonly currentBidMinor: bigint | null;
  /** Whether a WB/operator change marker was observed. */
  readonly changeMarkerObserved: boolean;
  /** Observation instant. */
  readonly observedAt: Date;
}

/**
 * Complete evidence candidate for one BidPerformanceDay.
 */
export interface PerformanceDayCandidate {
  /** Deterministic finalization evaluation instant. */
  readonly assessedAt?: Date;
  /** Whether placement attribution is unambiguous. */
  readonly attributionUnambiguous: boolean;
  /** Bid/configuration observations spanning the source day. */
  readonly bidStates: readonly BidStateEvidence[];
  /** Whether the campaign could receive traffic for the entire day. */
  readonly campaignTrafficEligible: boolean;
  /** Conversion-lag cutoff instant. */
  readonly conversionCutoff: Date;
  /** Statistical day end instant. */
  readonly dayEndedAt: Date;
  /** Statistical day start instant. */
  readonly dayStartedAt: Date;
  /** Operator guarantee governing unobserved external writes. */
  readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
  /** Whether money fields were normalized exactly from a verified contract. */
  readonly moneyContractValid: boolean;
  /** Whether the source predates local enrollment. */
  readonly preEnrollment: boolean;
  /** Stable reads of the same source day. */
  readonly sourceReads: readonly {
    readonly checksum: string;
    readonly fetchedAt: Date;
  }[];
  /** Normalized source counters. */
  readonly statistic: NormalizedStatisticDay;
}

/**
 * Policy controls for performance-day finalization.
 */
export interface PerformanceDayPolicy {
  /** Maximum interval between adjacent bid observations. */
  readonly maxObservationGapMinutes: number;
  /** Minimum equal source reads after conversion lag. */
  readonly minimumStableReads: number;
  /** Minimum time spanned by equal stable reads. */
  readonly minimumStableMinutes: number;
}

/**
 * Deterministic performance-day eligibility result.
 */
export interface PerformanceDayAssessment {
  /** Single confirmed bid when eligibility is proven. */
  readonly confirmedBidMinor: bigint | null;
  /** Immutable evidence checksum. */
  readonly inputChecksum: string;
  /** Exclusion/information flags. */
  readonly qualityFlags: readonly string[];
  /** Lifecycle state to persist. */
  readonly status: 'DRAFT' | 'FINALIZED' | 'INVALID';
}

/**
 * Validated deployment/account identity candidate.
 */
export interface AccountBindingCandidate {
  /** ISO 4217 scale-two account currency. */
  readonly accountCurrency: string;
  /** IANA timezone. */
  readonly accountTimezone: string;
  /** Environment permanently associated with the database. */
  readonly environment: 'MOCK' | 'SANDBOX' | 'PROD';
  /** Non-secret seller identity from an authorized integration call. */
  readonly sellerSid: string;
  /** Promotion category marker. */
  readonly tokenCategory: string;
  /** Safe fingerprint of token identity claims. */
  readonly tokenFingerprint: string;
  /** Personal token audience. */
  readonly tokenFor: 'SELF' | null;
  /** Supported self-hosted token type. */
  readonly tokenType: 'BASE' | 'PERSONAL' | 'TEST';
}

/**
 * Existing immutable account binding read under lock.
 */
export interface ExistingAccountBinding extends AccountBindingCandidate {
  /** Settings checksum stored at initialization. */
  readonly accountSettingsChecksum: string;
  /** Monotonic binding version. */
  readonly bindingVersion: bigint;
}

/**
 * Binding transition classification.
 */
export type AccountBindingTransition = 'CREATE' | 'ROTATE' | 'UPGRADE' | 'VALIDATE';
