import { evidenceChecksum } from './checksum.js';
import { decimalMajorToMinor } from '@wb-bidder/wb-api';
import type {
  NormalizedStatisticDay,
  PerformanceDayAssessment,
  PerformanceDayCandidate,
  PerformanceDayPolicy,
  SourceEvidence,
  TargetSnapshotAssessment,
} from './types.js';

/**
 * Runtime-validated WB daily counters before semantic normalization.
 */
export interface RawCampaignStatisticDay {
  /** Add-to-basket count. */
  readonly atbs: number;
  /** Click count. */
  readonly clicks: number;
  /** Technically undelivered ordered items. */
  readonly canceled?: number;
  /** WB statistical date. */
  readonly date: string;
  /** Order count. */
  readonly orders: number;
  /** Ordered units from the WB shks field. */
  readonly shks?: number;
  /** Advertising spend major-unit field. */
  readonly sum: number | string;
  /** Attributed revenue major-unit field. */
  readonly sum_price: number | string;
  /** Views where the payment profile supplies them. */
  readonly views?: number;
}

/**
 * Normalizes a WB daily row only when its money/aggregation contract is VERIFIED.
 *
 * @param source - Runtime-schema-validated source row.
 * @param contractStatus - Immutable endpoint-profile evidence status.
 * @returns Exact minor units and bigint counters.
 * @throws {Error} For unverified semantics, missing SHKS, negative/unsafe counters, or money loss.
 */
export function normalizeCampaignStatisticDay(
  source: RawCampaignStatisticDay,
  contractStatus: 'UNVERIFIED' | 'VERIFIED',
): NormalizedStatisticDay {
  if (contractStatus !== 'VERIFIED') {
    throw new Error('Fullstats money and aggregation contract is UNVERIFIED');
  }
  if (source.shks === undefined) {
    throw new Error('WB statistical day is missing SHKS ordered units');
  }
  for (const [field, value] of Object.entries({
    atbs: source.atbs,
    ...(source.canceled === undefined ? {} : { canceled: source.canceled }),
    clicks: source.clicks,
    orders: source.orders,
    shks: source.shks,
    ...(source.views === undefined ? {} : { views: source.views }),
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`WB statistical counter is invalid: ${field}`);
    }
  }
  return Object.freeze({
    atbs: BigInt(source.atbs),
    attributedRevenueMinor: decimalMajorToMinor(source.sum_price, 'fullstats.sum_price'),
    canceled: source.canceled === undefined ? null : BigInt(source.canceled),
    clicks: BigInt(source.clicks),
    date: source.date,
    orderedUnits: BigInt(source.shks),
    orders: BigInt(source.orders),
    spendMinor: decimalMajorToMinor(source.sum, 'fullstats.sum'),
    views: source.views === undefined ? null : BigInt(source.views),
  });
}

/**
 * Canonicalizes a WB normalized query using Unicode NFC only.
 *
 * @param wireValue - Exact query returned by WB.
 * @returns NFC form preserving whitespace and case.
 */
export function canonicalizeNormQuery(wireValue: string): string {
  if (wireValue.length === 0) {
    throw new Error('WB norm query must not be empty');
  }
  return wireValue.normalize('NFC');
}

/**
 * Detects distinct WB wire values that collide after the mandated NFC transformation.
 *
 * @param wireValues - Values belonging to one campaign/article/placement natural key.
 * @returns Canonical values whose wire provenance is ambiguous.
 */
export function findNormQueryNfcCollisions(wireValues: readonly string[]): readonly string[] {
  const byCanonical = new Map<string, Set<string>>();
  for (const wireValue of wireValues) {
    const canonical = canonicalizeNormQuery(wireValue);
    const values = byCanonical.get(canonical) ?? new Set<string>();
    values.add(wireValue);
    byCanonical.set(canonical, values);
  }
  return Object.freeze(
    [...byCanonical.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([canonical]) => canonical)
      .sort(),
  );
}

/**
 * Evaluates completeness, freshness, validity, and regime coherence atomically.
 *
 * @param evidence - Target source references.
 * @param now - Snapshot creation instant.
 * @returns Eligibility and stable reason codes.
 */
export function assessTargetSnapshot(
  evidence: readonly SourceEvidence[],
  now: Date,
): TargetSnapshotAssessment {
  const flags = new Set<string>();
  const required = evidence.filter((item) => item.required);
  if (required.length === 0) {
    flags.add('NO_REQUIRED_SOURCES');
  }
  for (const item of required) {
    if (!item.valid) {
      flags.add(`INVALID_${item.dataKind}`);
    }
    const ageMinutes = (now.getTime() - item.fetchedAt.getTime()) / 60_000;
    if (ageMinutes < 0 || ageMinutes > item.freshnessMinutes) {
      flags.add(`STALE_${item.dataKind}`);
    }
  }
  const regimes = new Set(
    required.map((item) => item.regimeChecksum).filter((value): value is string => value !== null),
  );
  if (regimes.size > 1) {
    flags.add('INCOHERENT_TRAFFIC_REGIME');
  }
  const hasInvalid = [...flags].some((flag) => flag.startsWith('INVALID_'));
  const hasStale = [...flags].some((flag) => flag.startsWith('STALE_'));
  const hasSameDaySpend = evidence.some((item) => {
    const ageMinutes = (now.getTime() - item.fetchedAt.getTime()) / 60_000;
    return (
      item.dataKind === 'SAME_DAY_SPEND' &&
      item.valid &&
      ageMinutes >= 0 &&
      ageMinutes <= item.freshnessMinutes
    );
  });
  const status =
    required.length === 0
      ? 'INCOMPLETE'
      : hasInvalid || regimes.size > 1
        ? 'INVALID'
        : hasStale
          ? 'STALE'
          : 'COMPLETE';
  const oldestFetchedAt =
    evidence.length === 0
      ? null
      : new Date(Math.min(...evidence.map((item) => item.fetchedAt.getTime())));
  return Object.freeze({
    applyEligible: status === 'COMPLETE',
    flags: Object.freeze([...flags].sort()),
    increaseEligible: status === 'COMPLETE' && hasSameDaySpend,
    oldestFetchedAt,
    regimeChecksum: regimes.size === 1 ? ([...regimes][0] ?? null) : null,
    status,
  });
}

/**
 * Determines whether a normalized full day can become immutable response evidence.
 *
 * @param candidate - Source, bid-state, attribution, and provenance evidence.
 * @param policy - Stable-read and observation-gap policy.
 * @returns Lifecycle state, confirmed bid, checksum, and exclusion reasons.
 */
export function assessPerformanceDay(
  candidate: PerformanceDayCandidate,
  policy: PerformanceDayPolicy,
): PerformanceDayAssessment {
  const flags = new Set<string>();
  const statistic = candidate.statistic;
  if (candidate.assessedAt !== undefined && candidate.assessedAt < candidate.conversionCutoff) {
    flags.add('CONVERSION_LAG_NOT_ELAPSED');
  }
  if (candidate.preEnrollment) {
    flags.add('PRE_ENROLLMENT');
  }
  if (!candidate.campaignTrafficEligible) {
    flags.add('CAMPAIGN_NOT_RUNNING');
  }
  if (!candidate.attributionUnambiguous) {
    flags.add('AMBIGUOUS_PLACEMENT_ATTRIBUTION');
  }
  if (!candidate.moneyContractValid) {
    flags.add('MONEY_CONTRACT_UNVERIFIED');
  }
  if (statistic.orderedUnits === null) {
    flags.add('MISSING_SHKS');
  }
  if (
    statistic.atbs < 0n ||
    statistic.attributedRevenueMinor < 0n ||
    statistic.clicks < 0n ||
    statistic.orders < 0n ||
    statistic.spendMinor < 0n ||
    (statistic.orderedUnits !== null && statistic.orderedUnits < 0n) ||
    (statistic.views !== null && statistic.views < 0n)
  ) {
    flags.add('NEGATIVE_COUNTER_OR_MONEY');
  }
  const observations = [...candidate.bidStates].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
  if (
    observations.length < 2 ||
    (observations[0]?.observedAt.getTime() ?? Number.POSITIVE_INFINITY) >
      candidate.dayStartedAt.getTime() ||
    (observations.at(-1)?.observedAt.getTime() ?? Number.NEGATIVE_INFINITY) <
      candidate.dayEndedAt.getTime()
  ) {
    flags.add('BID_STATE_COVERAGE_GAP');
  }
  let maximumGapMinutes = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    maximumGapMinutes = Math.max(
      maximumGapMinutes,
      (current.observedAt.getTime() - previous.observedAt.getTime()) / 60_000,
    );
  }
  if (maximumGapMinutes > policy.maxObservationGapMinutes) {
    flags.add('BID_STATE_MAX_GAP_EXCEEDED');
  }
  const bids = new Set(observations.map((item) => String(item.currentBidMinor)));
  const configurations = new Set(observations.map((item) => item.configurationChecksum));
  if (bids.size !== 1 || bids.has('null')) {
    flags.add('BID_STATE_CHANGED_OR_UNKNOWN');
  }
  if (configurations.size !== 1) {
    flags.add('TRAFFIC_CONFIGURATION_CHANGED');
  }
  if (
    candidate.externalWriteControlMode === 'SHARED' &&
    observations.some((item) => !item.changeMarkerObserved)
  ) {
    flags.add('SHARED_PROVENANCE_UNCERTAIN');
  }
  const readsAfterCutoff = candidate.sourceReads
    .filter((read) => read.fetchedAt >= candidate.conversionCutoff)
    .sort((left, right) => left.fetchedAt.getTime() - right.fetchedAt.getTime());
  const readChecksums = new Set(readsAfterCutoff.map((read) => read.checksum));
  if (readsAfterCutoff.length < policy.minimumStableReads || readChecksums.size !== 1) {
    flags.add('SOURCE_NOT_STABLE');
  } else {
    const first = readsAfterCutoff[0];
    const last = readsAfterCutoff.at(-1);
    if (
      first === undefined ||
      last === undefined ||
      (last.fetchedAt.getTime() - first.fetchedAt.getTime()) / 60_000 < policy.minimumStableMinutes
    ) {
      flags.add('SOURCE_STABILITY_WINDOW_TOO_SHORT');
    }
  }
  const qualityFlags = Object.freeze([...flags].sort());
  const draftOnly = qualityFlags.every((flag) =>
    [
      'CONVERSION_LAG_NOT_ELAPSED',
      'SOURCE_NOT_STABLE',
      'SOURCE_STABILITY_WINDOW_TOO_SHORT',
    ].includes(flag),
  );
  return Object.freeze({
    confirmedBidMinor:
      qualityFlags.length === 0 ? (observations[0]?.currentBidMinor ?? null) : null,
    inputChecksum: evidenceChecksum({ candidate, policy, qualityFlags }),
    qualityFlags,
    status: qualityFlags.length === 0 ? 'FINALIZED' : draftOnly ? 'DRAFT' : 'INVALID',
  });
}
