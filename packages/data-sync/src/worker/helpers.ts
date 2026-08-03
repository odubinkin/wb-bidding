import type { CampaignWorkItem } from '../repository/index.js';
import type { SyncDataKind } from '../types.js';

/**
 * Selects one oldest article-level recommendation target without starving large campaigns.
 *
 * @param targets - Stable campaign target page.
 * @returns One representative target for the least recently synchronized article.
 */
export function oldestRecommendationTarget(
  targets: CampaignWorkItem['targets'],
): CampaignWorkItem['targets'][number] | undefined {
  const byArticle = new Map<string, CampaignWorkItem['targets'][number]>();
  for (const target of targets) {
    const key = target.nmId.toString();
    const current = byArticle.get(key);
    if (
      current === undefined ||
      recommendationOrder(target.recommendationFetchedAt) <
        recommendationOrder(current.recommendationFetchedAt)
    ) {
      byArticle.set(key, target);
    }
  }
  return [...byArticle.values()].sort((left, right) => {
    const freshness =
      recommendationOrder(left.recommendationFetchedAt) -
      recommendationOrder(right.recommendationFetchedAt);
    return freshness !== 0
      ? freshness
      : left.nmId < right.nmId
        ? -1
        : left.nmId > right.nmId
          ? 1
          : 0;
  })[0];
}

/**
 * Converts missing recommendation evidence into highest oldest-first priority.
 *
 * @param value - Last successful fetch time.
 * @returns Comparable epoch value.
 */
export function recommendationOrder(value: Date | null): number {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}

export const ALL_SYNC_DATA_KINDS: readonly SyncDataKind[] = Object.freeze([
  'CAMPAIGN_DISCOVERY',
  'CAMPAIGN_DETAILS',
  'CURRENT_BID',
  'MINIMUM_BID',
  'CAMPAIGN_STATISTICS',
  'CLUSTER_LIST',
  'CLUSTER_STATISTICS',
  'BID_RECOMMENDATION',
  'BUDGET_DIAGNOSTIC',
  'SAME_DAY_SPEND',
]);

/**
 * Validates an operator-selected data-kind list against the closed enum.
 *
 * @param values - Optional selection; empty means every supported kind.
 * @returns Immutable membership set.
 */
export function selectedDataKinds(values: readonly SyncDataKind[] = []): ReadonlySet<SyncDataKind> {
  const selected = values.length === 0 ? ALL_SYNC_DATA_KINDS : values;
  const allowed = new Set<SyncDataKind>(ALL_SYNC_DATA_KINDS);
  if (selected.some((value) => !allowed.has(value))) {
    throw new Error('INVALID_MANUAL_JOB_DATA_KIND');
  }
  return new Set(selected);
}

/**
 * Retains only slow statistical work for a completed campaign.
 *
 * @param selected - Requested data kinds.
 * @returns Statistical optional-source kinds allowed for status 7.
 */
export function statisticsOnlyKinds(
  selected: ReadonlySet<SyncDataKind>,
): ReadonlySet<SyncDataKind> {
  return new Set<SyncDataKind>(selected.has('CLUSTER_STATISTICS') ? ['CLUSTER_STATISTICS'] : []);
}

/**
 * Splits a readonly array into bounded contiguous batches.
 *
 * @template T - Item type.
 * @param values - Source values.
 * @param size - Positive maximum batch size.
 * @returns Batches.
 */
export function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Stops a stage at the scheduler deadline.
 *
 * @param signal - Deadline signal.
 * @returns Nothing before cancellation.
 */
export function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Scheduler run deadline exceeded');
  }
}
