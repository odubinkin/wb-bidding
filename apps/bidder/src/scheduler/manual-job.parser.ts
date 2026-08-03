import { type SyncDataKind } from '@wb-bidder/data-sync';

/** Validated scope shared by manual resync and recalculation jobs. */
export interface ManualJobScope {
  readonly campaignIds?: readonly string[];
  readonly dataKinds?: readonly SyncDataKind[];
  readonly targetIds?: readonly string[];
}

/**
 * Parses only bounded manual-job scope fields.
 *
 * @param source - Stored manual-job scope.
 * @returns Validated scope.
 */
export function parseManualScope(source: unknown): ManualJobScope {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error('INVALID_MANUAL_JOB_SCOPE');
  }
  const record = source as Readonly<Record<string, unknown>>;
  const campaignIds = parseUuidArray(record.campaignIds);
  const dataKinds = parseDataKinds(record.dataKinds);
  const targetIds = parseUuidArray(record.targetIds);
  return Object.freeze({
    ...(campaignIds === undefined ? {} : { campaignIds }),
    ...(dataKinds === undefined ? {} : { dataKinds }),
    ...(targetIds === undefined ? {} : { targetIds }),
  });
}

/**
 * Parses an optional bounded UUID array.
 *
 * @param source - Unknown field.
 * @returns Frozen values or undefined.
 */
export function parseUuidArray(source: unknown): readonly string[] | undefined {
  if (source === undefined) return undefined;
  if (!Array.isArray(source) || source.length > 500) {
    throw new Error('INVALID_MANUAL_JOB_SCOPE');
  }
  if (source.length === 0) return undefined;
  const values: string[] = [];
  for (const value of source) {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ) {
      throw new Error('INVALID_MANUAL_JOB_SCOPE');
    }
    values.push(value);
  }
  return Object.freeze(values);
}

export const SYNC_DATA_KINDS = new Set<SyncDataKind>([
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
 * Parses an optional closed-list data-kind selection.
 *
 * @param source - Stored JSON field.
 * @returns Validated data kinds or undefined for the default full resync.
 */
export function parseDataKinds(source: unknown): readonly SyncDataKind[] | undefined {
  if (source === undefined) return undefined;
  if (
    !Array.isArray(source) ||
    source.length > SYNC_DATA_KINDS.size ||
    source.some((value) => typeof value !== 'string' || !SYNC_DATA_KINDS.has(value as SyncDataKind))
  ) {
    throw new Error('INVALID_MANUAL_JOB_DATA_KIND');
  }
  if (source.length === 0) return undefined;
  return Object.freeze([...new Set(source as SyncDataKind[])]);
}

/**
 * Returns a stable error class without including payloads or secrets.
 *
 * @param error - Unknown failure.
 * @returns Redacted code.
 */
