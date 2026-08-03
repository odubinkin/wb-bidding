import type { CampaignWorkScope } from '../repository/index.js';
import type { SyncDataKind } from '../types.js';

/**
 * Data-sync runtime configuration.
 */
export interface DataSyncWorkerConfiguration {
  /** Deadline for current-state sync. */
  readonly currentStateDeadlineMs: number;
  /** Campaign-details/current-bid maximum age. */
  readonly currentStateFreshnessMinutes: number;
  /** Operator external-write guarantee. */
  readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
  /** Whether fullstats exact leaf/money semantics are verified for this runtime. */
  readonly fullstatsContractVerified?: boolean;
  /** Maximum campaigns loaded from PostgreSQL at once. */
  readonly pageSize: number;
  /** Card minimum-bid maximum age. */
  readonly minimumBidFreshnessMinutes: number;
  /** Statistical overlap first date provider. */
  readonly statisticsBeginDate: () => string;
  /** Latest campaign-statistics read maximum age. */
  readonly campaignStatisticsFreshnessMinutes: number;
  /** Statistical overlap last date provider. */
  readonly statisticsEndDate: () => string;
  /** Whether current-day spend/coverage semantics are verified for this runtime. */
  readonly sameDaySpendContractVerified?: boolean;
  /** Full statistical days to wait before finalization. */
  readonly conversionLagDays: number;
  /** Stable identical source reads required after conversion cutoff. */
  readonly dayFinalizationStableReads: number;
  /** Minimum duration spanned by stable reads. */
  readonly dayFinalizationStableMinutes: number;
  /** Maximum gap between continuous bid-state observations. */
  readonly bidStateMaxObservationGapMinutes: number;
}

/**
 * Operator-bounded synchronization request.
 */
export interface ManualDataSyncScope extends CampaignWorkScope {
  /** Empty or omitted means every supported data kind. */
  readonly dataKinds?: readonly SyncDataKind[];
}

/**
 * Bounded synchronization counters.
 */
export interface DataSyncCounters {
  /** Campaign rows processed. */
  readonly campaigns: number;
  /** Source errors retained as invalid evidence. */
  readonly invalidSources: number;
  /** Target rows processed. */
  readonly targets: number;
}

/**
 * Quota-aware WB synchronization application service.
 */
