/**
 * Capacity result for one account-wide endpoint pass.
 */
export interface SyncCapacity {
  /** Whether configured SLA can contain the pass with the required reserve. */
  readonly applyCapacityProven: boolean;
  /** Theoretical full-pass lower bound. */
  readonly fullPassLowerBoundMinutes: number;
  /** Required SLA after twenty-percent retry/jitter reserve. */
  readonly requiredSlaMinutes: number;
}

/**
 * Current-state schedule/deadline capacity result.
 */
export interface CurrentStateCapacity {
  /** Whether all schedule, deadline, gap, and freshness inequalities hold. */
  readonly applyCapacityProven: boolean;
  /** Theoretical details/current-bid pass duration. */
  readonly fullPassLowerBoundSeconds: number;
  /** Worst-case interval between complete observations of one target. */
  readonly targetObservationGapWorstCaseMinutes: number;
}

/**
 * Evaluates the normative current-state schedule/deadline inequalities.
 *
 * @param supportedCampaigns - Campaigns requiring details/current-bid reads.
 * @param batchSize - Endpoint campaign batch limit.
 * @param requestsPerSecond - Effective token-profile endpoint rate.
 * @param scheduleIntervalMinutes - Trigger interval.
 * @param deadlineMinutes - Run deadline.
 * @param maxObservationGapMinutes - Bid-state evidence gap ceiling.
 * @param freshnessMinutes - Current-bid freshness ceiling.
 * @returns Capacity proof and lower bounds.
 */
export function calculateCurrentStateCapacity(
  supportedCampaigns: number,
  batchSize: number,
  requestsPerSecond: number,
  scheduleIntervalMinutes: number,
  deadlineMinutes: number,
  maxObservationGapMinutes: number,
  freshnessMinutes: number,
): CurrentStateCapacity {
  if (
    !Number.isInteger(supportedCampaigns) ||
    supportedCampaigns < 0 ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    !Number.isFinite(requestsPerSecond) ||
    requestsPerSecond <= 0 ||
    [scheduleIntervalMinutes, deadlineMinutes, maxObservationGapMinutes, freshnessMinutes].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  ) {
    throw new Error('Invalid current-state capacity inputs');
  }
  const fullPassLowerBoundSeconds = Math.ceil(supportedCampaigns / batchSize) / requestsPerSecond;
  const targetObservationGapWorstCaseMinutes =
    scheduleIntervalMinutes + fullPassLowerBoundSeconds / 60;
  return Object.freeze({
    applyCapacityProven:
      fullPassLowerBoundSeconds < deadlineMinutes * 60 &&
      deadlineMinutes < scheduleIntervalMinutes &&
      targetObservationGapWorstCaseMinutes <= maxObservationGapMinutes &&
      maxObservationGapMinutes <= freshnessMinutes,
    fullPassLowerBoundSeconds,
    targetObservationGapWorstCaseMinutes,
  });
}

/**
 * Computes the minimum-bid full-pass lower bound from campaigns, not targets.
 *
 * @param supportedCampaigns - Campaigns requiring one request each.
 * @param effectiveRequestsPerMinute - Token-profile endpoint rate.
 * @param configuredSlaMinutes - Operator/policy target SLA.
 * @returns Lower bound, reserve-adjusted SLA, and write-capacity gate.
 */
export function calculateMinimumBidCapacity(
  supportedCampaigns: number,
  effectiveRequestsPerMinute: number,
  configuredSlaMinutes: number,
): SyncCapacity {
  if (
    !Number.isInteger(supportedCampaigns) ||
    supportedCampaigns < 0 ||
    !Number.isFinite(effectiveRequestsPerMinute) ||
    effectiveRequestsPerMinute <= 0 ||
    !Number.isInteger(configuredSlaMinutes) ||
    configuredSlaMinutes < 1
  ) {
    throw new Error('Invalid minimum-bid capacity inputs');
  }
  const fullPassLowerBoundMinutes = Math.ceil(supportedCampaigns / effectiveRequestsPerMinute);
  const requiredSlaMinutes = Math.ceil(fullPassLowerBoundMinutes * 1.2);
  return Object.freeze({
    applyCapacityProven: configuredSlaMinutes >= requiredSlaMinutes,
    fullPassLowerBoundMinutes,
    requiredSlaMinutes,
  });
}

/**
 * Bounded fair-page selection result.
 */
export interface FairWorkPage {
  /** Selected zero-based work indices. */
  readonly indices: readonly number[];
  /** Cursor for the next call. */
  readonly nextCursor: number;
  /** Whether this page crossed the end of a full pass. */
  readonly wrapped: boolean;
}

/**
 * Combines urgent work with a reserved round-robin share so no target can starve.
 *
 * @param totalItems - Total work cardinality.
 * @param cursor - Round-robin cursor.
 * @param pageSize - Bounded page size.
 * @param priorityIndices - Urgent indices ordered by urgency.
 * @param fairSharePpm - Page share reserved for the full-pass cursor.
 * @returns Unique bounded indices and next cursor.
 */
export function selectFairWorkPage(
  totalItems: number,
  cursor: number,
  pageSize: number,
  priorityIndices: readonly number[],
  fairSharePpm = 200_000,
): FairWorkPage {
  if (
    !Number.isInteger(totalItems) ||
    totalItems < 0 ||
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isInteger(fairSharePpm) ||
    fairSharePpm < 1 ||
    fairSharePpm > 1_000_000
  ) {
    throw new Error('Invalid fair-work page inputs');
  }
  if (totalItems === 0) {
    return Object.freeze({ indices: Object.freeze([]), nextCursor: 0, wrapped: false });
  }
  const normalizedCursor = cursor % totalItems;
  const fairSlots = Math.min(
    pageSize,
    Math.max(1, Math.ceil((pageSize * fairSharePpm) / 1_000_000)),
  );
  const selected = new Set<number>();
  for (const priority of priorityIndices) {
    if (
      selected.size >= pageSize - fairSlots ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority >= totalItems
    ) {
      continue;
    }
    selected.add(priority);
  }
  let scan = normalizedCursor;
  let inspected = 0;
  while (selected.size < pageSize && inspected < totalItems) {
    selected.add(scan);
    scan = (scan + 1) % totalItems;
    inspected += 1;
  }
  const advanced = Math.min(fairSlots, totalItems);
  const nextCursor = (normalizedCursor + advanced) % totalItems;
  return Object.freeze({
    indices: Object.freeze([...selected]),
    nextCursor,
    wrapped: normalizedCursor + advanced >= totalItems,
  });
}
