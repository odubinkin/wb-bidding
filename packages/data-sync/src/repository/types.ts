import type { NormalizedStatisticDay, SyncDataKind } from '../types.js';

export const BINDING_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Context supplied to one non-overlapping scheduler run.
 */
export interface SchedulerRunContext {
  /** Deadline cancellation signal. */
  readonly signal: AbortSignal;
  /** Persisted run identifier. */
  readonly runId: string;
  /** Absolute deadline. */
  readonly deadlineAt: Date;
}

/**
 * Scheduler execution result.
 */
export interface SchedulerRunResult<T> {
  /** Worker result when a run started. */
  readonly result?: T;
  /** Persisted run identifier. */
  readonly runId?: string;
  /** Whether this replica acquired the job lock. */
  readonly started: boolean;
}

/**
 * Immutable source-snapshot write.
 */
export interface SourceSnapshotWrite {
  /** Optional local campaign UUID. */
  readonly campaignId?: string;
  /** Logical data kind. */
  readonly dataKind: SyncDataKind;
  /** Embedded endpoint profile. */
  readonly endpointProfile: string;
  /** Observation time. */
  readonly fetchedAt: Date;
  /** Normalization failure reason. */
  readonly invalidReason?: string;
  /** Redacted normalized payload. */
  readonly normalizedData: unknown;
  /** Optional WB statistical date. */
  readonly sourceDate?: string;
  /** Immutable source checksum. */
  readonly sourceChecksum: string;
  /** Scheduler run UUID. */
  readonly syncRunId: string;
  /** Optional local target UUID. */
  readonly targetId?: string;
  /** Whether the source is valid for its declared semantics. */
  readonly valid: boolean;
}

/**
 * One verified normalized cluster statistical day.
 */
export interface ClusterStatisticDayWrite {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Observation time. */
  readonly fetchedAt: Date;
  /** WB article identifier. */
  readonly nmId: bigint;
  /** NFC-only query key. */
  readonly normQueryCanonical: string;
  /** Exact WB query spelling sent back to write endpoints. */
  readonly normQueryWire: string;
  /** Exact normalized counters and spend. */
  readonly normalized: NormalizedStatisticDay;
  /** Embedded endpoint profile ID. */
  readonly profileId: string;
  /** Scheduler run UUID. */
  readonly runId: string;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Existing discovered cluster pairs eligible for the fast current-state refresh.
 */
export interface ClusterCurrentWorkItem {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Discovered article identifiers. */
  readonly nmIds: readonly bigint[];
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Bounded campaign work row used by the slow data-sync job.
 */
export interface CampaignWorkItem {
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Bid strategy. */
  readonly bidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  /** Immutable campaign-details checksum. */
  readonly detailsChecksum: string | null;
  /** Campaign-details observation time. */
  readonly detailsFetchedAt: Date | null;
  /** Article/placement targets. */
  readonly targets: readonly {
    /** Current-bid checksum. */
    readonly currentBidChecksum: string | null;
    /** Current-bid confirmation time. */
    readonly currentBidConfirmedAt: Date | null;
    /** Minimum-bid checksum. */
    readonly minimumBidChecksum: string | null;
    /** Minimum-bid confirmation time. */
    readonly minimumBidConfirmedAt: Date | null;
    readonly nmId: bigint;
    /** Exact cluster query wire spelling, null for card targets. */
    readonly normQueryWire: string | null;
    readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
    /** Last recommendation observation for this campaign/article. */
    readonly recommendationFetchedAt: Date | null;
    readonly targetId: string;
    /** Card or discovered cluster target. */
    readonly targetKind: 'CARD' | 'CLUSTER';
  }[];
  /** Payment type. */
  readonly paymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  /** Current WB campaign lifecycle status. */
  readonly status: number;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Optional bounded filters for an operator-requested synchronization.
 */
export interface CampaignWorkScope {
  /** Campaign UUIDs selected by the operator. */
  readonly campaignIds?: readonly string[];
  /** Target UUIDs selected by the operator. */
  readonly targetIds?: readonly string[];
}

/**
 * One exact app/nm leaf belonging to a versioned WB campaign day.
 */
export interface CampaignStatisticLeafWrite {
  /** WB application/platform dimension. */
  readonly appType: number;
  /** Local campaign UUID. */
  readonly campaignId: string;
  /** Read time. */
  readonly fetchedAt: Date;
  /** WB article identifier. */
  readonly nmId: bigint;
  /** Exact normalized counters. */
  readonly statistic: NormalizedStatisticDay;
  /** Checksum of the complete campaign/day content version. */
  readonly sourceVersion: string;
  /** Scheduler run UUID. */
  readonly syncRunId: string;
  /** WB campaign identifier. */
  readonly wbCampaignId: bigint;
}

/**
 * Fixed finalization policy selected from validated deployment configuration.
 */
export interface PerformanceFinalizationConfiguration {
  /** Maximum continuous bid-state gap. */
  readonly bidStateMaxObservationGapMinutes: number;
  /** Full days to wait for conversion attribution. */
  readonly conversionLagDays: number;
  /** Stable equal reads required. */
  readonly dayFinalizationStableReads: number;
  /** Minimum minutes spanned by stable reads. */
  readonly dayFinalizationStableMinutes: number;
  /** External-write provenance guarantee. */
  readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
}

/**
 * PostgreSQL persistence boundary for synchronization, evidence, and leases.
 */
