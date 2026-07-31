/** WB campaign statuses eligible for statistics synchronization. */
const STATISTICS_ELIGIBLE_STATUSES = new Set([7, 9, 11]);

/** WB campaign statuses eligible for automated bid application. */
const APPLY_ELIGIBLE_STATUSES = new Set([9, 11]);

/**
 * Returns whether a WB campaign status permits automated bid application.
 *
 * @param status - WB campaign lifecycle status.
 * @returns True only for explicitly supported running statuses.
 */
export function isCampaignApplyEligibleStatus(status: number): boolean {
  return APPLY_ELIGIBLE_STATUSES.has(status);
}

/**
 * Returns whether a WB campaign status permits statistics synchronization.
 *
 * @param status - WB campaign lifecycle status.
 * @returns True for running campaigns and completed campaigns eligible for backfill.
 */
export function isCampaignStatisticsEligibleStatus(status: number): boolean {
  return STATISTICS_ELIGIBLE_STATUSES.has(status);
}
