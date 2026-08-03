import {
  validateDecisionPolicy,
  type DecisionInput,
  type DecisionPolicy,
} from '@wb-bidder/decision-engine';
import { bidRecommendationsResponseSchema } from '@wb-bidder/wb-api';

/**
 * Reads one string property from a Prisma JSON value.
 *
 * @param value - Stored JSON value.
 * @param key - Property name.
 * @returns String value or null.
 */
export function readJsonString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = (value as Readonly<Record<string, unknown>>)[key];
  return typeof entry === 'string' ? entry : null;
}

/**
 * Enforces the finalized-day confirmed-bid invariant.
 *
 * @param value - Persisted confirmed bid.
 * @returns Non-null confirmed bid.
 */
export function requireConfirmedBidMinor(value: bigint | null): bigint {
  if (value === null) throw new Error('FINALIZED_PERFORMANCE_DAY_MISSING_CONFIRMED_BID');
  return value;
}

/**
 * Extracts positive base and matching-query recommendation hints without changing wire spelling.
 *
 * Optional recommendation corruption never blocks an otherwise valid ordinary decision; the
 * entire hint set is discarded instead.
 *
 * @param source - Persisted WB response snapshot.
 * @param normQueryCanonical - NFC-only target query, or null for an article placement.
 * @returns Unique positive internal-minor-unit hints.
 */
export function extractRecommendationHints(
  source: unknown,
  normQueryCanonical: string | null,
): readonly bigint[] {
  const parsed = bidRecommendationsResponseSchema.safeParse(source);
  if (!parsed.success) return Object.freeze([]);
  const groups = [
    parsed.data.base.competitiveBid,
    parsed.data.base.leadersBid,
    parsed.data.base.top2,
  ];
  if (normQueryCanonical !== null) {
    const matches = parsed.data.normQueries.filter(
      (entry) => entry.normQuery.normalize('NFC') === normQueryCanonical,
    );
    if (new Set(matches.map((entry) => entry.normQuery)).size > 1) {
      return Object.freeze([]);
    }
    for (const match of matches) {
      groups.push(match.reachMin, match.reachMedium, match.reachMax);
    }
  }
  const hints = new Set<string>();
  for (const group of groups) {
    if (group.bidKopecks > 0) hints.add(String(group.bidKopecks));
    if (group.bidKopecksMin !== undefined && group.bidKopecksMin > 0) {
      hints.add(String(group.bidKopecksMin));
    }
  }
  return Object.freeze([...hints].map(BigInt).sort((left, right) => (left < right ? -1 : 1)));
}

/**
 * Parses the internal verified current-day spend snapshot for one exact account-local day.
 *
 * @param source - Persisted normalized source.
 * @param accountLocalDate - Decision account-local date.
 * @returns Exact spend and coverage, or null for an incomplete/mismatched snapshot.
 */
export function parseSameDaySpend(
  source: unknown,
  accountLocalDate: string,
): {
  readonly coverageEndedAt: Date;
  readonly observedSameDaySpendMinor: bigint;
} | null {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const record = source as Readonly<Record<string, unknown>>;
  if (
    record.statisticalDate !== accountLocalDate ||
    typeof record.observedSameDaySpendMinor !== 'string' ||
    !/^\d+$/.test(record.observedSameDaySpendMinor) ||
    typeof record.coverageEndedAt !== 'string'
  ) {
    return null;
  }
  const coverageEndedAt = new Date(record.coverageEndedAt);
  if (!Number.isFinite(coverageEndedAt.getTime())) return null;
  return Object.freeze({
    coverageEndedAt,
    observedSameDaySpendMinor: BigInt(record.observedSameDaySpendMinor),
  });
}

/**
 * Parses canonical JSON into the exact policy contract and revalidates all invariants.
 *
 * @param source - PostgreSQL JSONB value.
 * @param version - Authoritative row version.
 * @returns Validated immutable policy.
 */
export function parseDecisionPolicy(source: unknown, version: bigint): DecisionPolicy {
  const record = asRecord(source);
  const policy: DecisionPolicy = {
    baselineWindowDays: integer(record, 'baselineWindowDays'),
    candidateBidStepPpm: integer(record, 'candidateBidStepPpm'),
    cooldownMinutes: integer(record, 'cooldownMinutes'),
    dailySpendLimitMinor: nullableBigInt(record, 'dailySpendLimitMinor'),
    executionMode: enumValue(record, 'executionMode', ['APPLY', 'OBSERVE_ONLY']),
    explorationEnabled: booleanValue(record, 'explorationEnabled'),
    explorationSpendSafetyBufferPpm: integer(record, 'explorationSpendSafetyBufferPpm'),
    explorationStepPpm: integer(record, 'explorationStepPpm'),
    maxDailyDecreasePpm: integer(record, 'maxDailyDecreasePpm'),
    maxDailyIncreasePpm: integer(record, 'maxDailyIncreasePpm'),
    maxDecreasePerCyclePpm: integer(record, 'maxDecreasePerCyclePpm'),
    maxExplorationSpendMinor: nullableBigInt(record, 'maxExplorationSpendMinor'),
    maxIncreasePerCyclePpm: integer(record, 'maxIncreasePerCyclePpm'),
    maxConcurrentExperimentsPerAccount: integer(record, 'maxConcurrentExperimentsPerAccount'),
    maxConcurrentExperimentsPerCampaign: integer(record, 'maxConcurrentExperimentsPerCampaign'),
    maxSpendPerMinuteMinor: nullableBigInt(record, 'maxSpendPerMinuteMinor'),
    maxSpendReportingLagMinutes: nullableInteger(record, 'maxSpendReportingLagMinutes'),
    minAbsoluteChangeMinor: bigintValue(record, 'minAbsoluteChangeMinor'),
    minBidClicks: bigintValue(record, 'minBidClicks'),
    minBidObservationDays: integer(record, 'minBidObservationDays'),
    minBidOrderedUnits: bigintValue(record, 'minBidOrderedUnits'),
    minBidSpendMinor: nullableBigInt(record, 'minBidSpendMinor'),
    minBidViews: bigintValue(record, 'minBidViews'),
    minExpectedProfitImprovementMinor: bigintValue(record, 'minExpectedProfitImprovementMinor'),
    minExplorationFullDays: integer(record, 'minExplorationFullDays'),
    minRelativeChangePpm: integer(record, 'minRelativeChangePpm'),
    orderedUnitsSafetyDiscountPpm: integer(record, 'orderedUnitsSafetyDiscountPpm'),
    policyMaxBidMinor: nullableBigInt(record, 'policyMaxBidMinor'),
    policyMinBidMinor: nullableBigInt(record, 'policyMinBidMinor'),
    predictionHorizonDays: integer(record, 'predictionHorizonDays'),
    primaryWindowDays: integer(record, 'primaryWindowDays'),
    spendSafetyPremiumPpm: integer(record, 'spendSafetyPremiumPpm'),
    version,
    zeroConversionDecreasePpm: integer(record, 'zeroConversionDecreasePpm'),
    zeroConversionMinClicks: bigintValue(record, 'zeroConversionMinClicks'),
    zeroConversionMinViews: bigintValue(record, 'zeroConversionMinViews'),
    zeroConversionSpendThresholdMinor: nullableBigInt(record, 'zeroConversionSpendThresholdMinor'),
  };
  validateDecisionPolicy(policy);
  return Object.freeze(policy);
}

/**
 * Normalizes persisted capability.
 *
 * @param value - Database capability.
 * @returns Engine capability.
 */
export function normalizeCapability(value: string): DecisionInput['capability'] {
  if (value === 'CARD_WRITE_READY' || value === 'CLUSTER_WRITE_READY' || value === 'OBSERVE_ONLY') {
    return value;
  }
  return 'UNSUPPORTED';
}

/**
 * Requires a plain JSON object.
 *
 * @param value - Unknown value.
 * @returns Readonly record.
 */
export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_POLICY_OBJECT');
  }
  return value as Readonly<Record<string, unknown>>;
}

/**
 * Reads a finite integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Integer.
 */
export function integer(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`INVALID_POLICY_INTEGER:${key}`);
  }
  return value;
}

/**
 * Reads a nullable integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Integer or null.
 */
export function nullableInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  return record[key] === null ? null : integer(record, key);
}

/**
 * Reads a canonical bigint string or safe integer.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Bigint.
 */
export function bigintValue(record: Readonly<Record<string, unknown>>, key: string): bigint {
  const value = record[key];
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new Error(`INVALID_POLICY_BIGINT:${key}`);
}

/**
 * Reads a nullable canonical bigint.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Bigint or null.
 */
export function nullableBigInt(
  record: Readonly<Record<string, unknown>>,
  key: string,
): bigint | null {
  return record[key] === null ? null : bigintValue(record, key);
}

/**
 * Reads a boolean field.
 *
 * @param record - Policy object.
 * @param key - Field.
 * @returns Boolean.
 */
export function booleanValue(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new Error(`INVALID_POLICY_BOOLEAN:${key}`);
  return value;
}

/**
 * Reads one string enum.
 *
 * @template T - Allowed string literal.
 * @param record - Policy object.
 * @param key - Field.
 * @param allowed - Allowed values.
 * @returns Validated literal.
 */
export function enumValue<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`INVALID_POLICY_ENUM:${key}`);
  }
  return value as T;
}

/**
 * Selects the greatest exact minor-unit value.
 *
 * @param values - Non-empty values.
 * @returns Maximum.
 */
export function maximum(...values: readonly bigint[]): bigint {
  return values.reduce((current, value) => (value > current ? value : current));
}
