export const DECISION_PAGE_SIZE = 500;

/**
 * Optional bounded scope used by a manual recalculation job.
 */
export interface DecisionJobScope {
  /** Optional campaign UUIDs. */
  readonly campaignIds?: readonly string[];
  /** Optional target UUIDs. */
  readonly targetIds?: readonly string[];
}
