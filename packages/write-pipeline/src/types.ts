/* eslint-disable jsdoc/require-jsdoc */
export type QueueStatus =
  | 'QUEUED'
  | 'LEASED'
  | 'SENT'
  | 'VERIFY_WAIT'
  | 'RETRY_WAIT'
  | 'APPLIED'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type AttemptStatus = 'PREPARED' | 'DISPATCHING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';

export type AutomationMode = 'DISABLED' | 'OBSERVE_ONLY' | 'APPLY';

export interface ClaimedQueueItem {
  readonly queueItemId: string;
  readonly decisionId: string;
  readonly targetId: string;
  readonly campaignId: string;
  readonly campaignBidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignPaymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly wbCampaignId: bigint;
  readonly nmId: bigint;
  readonly placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
  readonly targetKind: 'CARD' | 'CLUSTER';
  readonly priority: number;
  readonly action: 'SET' | 'DELETE';
  readonly desiredBidState: 'EXPLICIT' | 'ABSENT';
  readonly bidMinor: bigint | null;
  readonly attemptCount: number;
  readonly policyVersion: bigint;
  readonly metricSnapshotId: string;
}

export interface LiveBidState {
  readonly bidMinor: bigint | null;
  readonly explicit: boolean;
  readonly observedAt: Date;
  readonly sourceMarker: string;
}

export interface PreparedWrite {
  readonly attemptId: string;
  readonly correlationId: string;
  readonly items: readonly PreparedWriteItem[];
}

export interface PreparedWriteItem {
  readonly attemptItemId: string;
  readonly decisionId: string;
  readonly queueItemId: string;
  readonly targetId: string;
  readonly requestIndex: number;
  readonly attemptNumber: number;
}

export interface DispatchItemResult {
  readonly requestIndex: number;
  readonly accepted: boolean;
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly responseFragment?: unknown;
}

export interface DispatchResult {
  readonly httpStatus: number;
  readonly wbRequestId?: string;
  readonly rateLimitHeaders?: Readonly<Record<string, string>>;
  readonly items: readonly DispatchItemResult[];
}

export interface DispatchReservation {
  dispatch(
    items: readonly {
      decisionId: string;
      action: 'SET' | 'DELETE';
      bidMinor: bigint | null;
      wbCampaignId: bigint;
      nmId: bigint;
      placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
      targetKind: 'CARD' | 'CLUSTER';
    }[],
    correlationId: string,
  ): Promise<DispatchResult>;
  release(): void;
}

export interface WriteGateway {
  readLiveState(item: ClaimedQueueItem): Promise<LiveBidState>;
  reserveDispatch(endpointKey: string): Promise<DispatchReservation>;
  dispatch(
    endpointKey: string,
    items: readonly {
      decisionId: string;
      action: 'SET' | 'DELETE';
      bidMinor: bigint | null;
      wbCampaignId: bigint;
      nmId: bigint;
      placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
      targetKind: 'CARD' | 'CLUSTER';
    }[],
    correlationId: string,
  ): Promise<DispatchResult>;
}

export interface PreDispatchValidator {
  validate(
    item: ClaimedQueueItem,
    liveState: LiveBidState,
  ): Promise<{ readonly valid: true } | { readonly valid: false; readonly code: string }>;
}

export type ReconciliationClassification =
  'DESIRED_STATE' | 'STABLE_OLD_STATE' | 'THIRD_STATE' | 'INCONCLUSIVE';

export interface ReconciliationObservation {
  readonly classification: ReconciliationClassification;
  readonly stateChecksum: string;
  readonly sourceMarker: string;
  readonly state: LiveBidState;
  readonly fresh: boolean;
  readonly prevalidationPassed: boolean;
}

/**
 * One bounded verification/reconciliation work item loaded from PostgreSQL.
 */
export interface ReconciliationWorkItem {
  /** Latest write-attempt item. */
  readonly attemptItemId: string;
  /** Queue/decision identifier. */
  readonly decisionId: string;
  /** Desired post-write state. */
  readonly desired: {
    readonly bidMinor: bigint | null;
    readonly explicit: boolean;
  };
  /** Claimed-shape identifiers required for a live WB read and prevalidation. */
  readonly item: ClaimedQueueItem;
  /** Durable state read immediately before dispatch. */
  readonly oldState: LiveBidState;
}
