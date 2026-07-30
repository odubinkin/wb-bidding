/** Durable lifecycle states of a decision queue item. */
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

/** Durable outcome states of one remote WB write attempt. */
export type AttemptStatus = 'PREPARED' | 'DISPATCHING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';

/** Operator-selected write authority for a deployment, campaign, or target. */
export type AutomationMode = 'DISABLED' | 'OBSERVE_ONLY' | 'APPLY';

/** Queue item leased by one executor together with its immutable decision context. */
export interface ClaimedQueueItem {
  readonly queueItemId: string;
  readonly decisionId: string;
  readonly targetId: string;
  readonly campaignId: string;
  readonly campaignBidType: 'MANUAL' | 'UNIFIED' | 'UNKNOWN';
  readonly campaignPaymentType: 'CPC' | 'CPM' | 'UNKNOWN';
  readonly wbCampaignId: bigint;
  readonly nmId: bigint;
  readonly normQueryWire: string | null;
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

/** Fresh live bid state read from WB immediately before validation or reconciliation. */
export interface LiveBidState {
  readonly bidMinor: bigint | null;
  readonly explicit: boolean;
  readonly observedAt: Date;
  readonly sourceMarker: string;
}

/** Persisted dispatch reservation that may be sent after its transaction commits. */
export interface PreparedWrite {
  readonly attemptId: string;
  readonly correlationId: string;
  readonly items: readonly PreparedWriteItem[];
}

/** One indexed queue item inside a prepared remote write request. */
export interface PreparedWriteItem {
  readonly attemptItemId: string;
  readonly decisionId: string;
  readonly queueItemId: string;
  readonly targetId: string;
  readonly requestIndex: number;
  readonly attemptNumber: number;
}

/** Per-item result returned by a batched WB dispatch request. */
export interface DispatchItemResult {
  readonly requestIndex: number;
  readonly accepted: boolean;
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly responseFragment?: unknown;
}

/** Transport-level and per-item result of a WB dispatch attempt. */
export interface DispatchResult {
  readonly httpStatus: number;
  readonly wbRequestId?: string;
  readonly rateLimitHeaders?: Readonly<Record<string, string>>;
  readonly items: readonly DispatchItemResult[];
}

/** Rate-limit reservation held while dispatching one homogeneous write batch. */
export interface DispatchReservation {
  dispatch(
    items: readonly {
      decisionId: string;
      action: 'SET' | 'DELETE';
      bidMinor: bigint | null;
      normQueryWire: string | null;
      wbCampaignId: bigint;
      nmId: bigint;
      placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
      targetKind: 'CARD' | 'CLUSTER';
      wireBidRaw: bigint | null;
    }[],
    correlationId: string,
  ): Promise<DispatchResult>;
  release(): void;
}

/** Boundary through which the executor reads and mutates WB bid state. */
export interface WriteGateway {
  readLiveState(item: ClaimedQueueItem): Promise<LiveBidState>;
  reserveDispatch(endpointKey: string): Promise<DispatchReservation>;
  dispatch(
    endpointKey: string,
    items: readonly {
      decisionId: string;
      action: 'SET' | 'DELETE';
      bidMinor: bigint | null;
      normQueryWire: string | null;
      wbCampaignId: bigint;
      nmId: bigint;
      placement: 'COMBINED' | 'RECOMMENDATIONS' | 'SEARCH';
      targetKind: 'CARD' | 'CLUSTER';
      wireBidRaw: bigint | null;
    }[],
    correlationId: string,
  ): Promise<DispatchResult>;
}

/** Fail-closed validator that approves a queued write against current durable evidence. */
export interface PreDispatchValidator {
  validate(
    item: ClaimedQueueItem,
    liveState: LiveBidState,
  ): Promise<{ readonly valid: true } | { readonly valid: false; readonly code: string }>;
}

/** Classification of a post-dispatch live state relative to desired and old states. */
export type ReconciliationClassification =
  'DESIRED_STATE' | 'STABLE_OLD_STATE' | 'THIRD_STATE' | 'INCONCLUSIVE';

/** Evidence collected while reconciling an accepted, rejected, or unknown write. */
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
