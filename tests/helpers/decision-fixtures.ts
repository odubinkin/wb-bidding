import type {
  DecisionInput,
  DecisionPerformanceDay,
  DecisionPolicy,
} from '@wb-bidder/decision-engine';
import { initialObserveOnlyPolicy } from '@wb-bidder/decision-engine';

/**
 * Creates a fully valid policy with deterministic overrides.
 *
 * @param overrides - Fields changed for one scenario.
 * @returns Immutable policy.
 */
export function decisionPolicy(overrides: Partial<DecisionPolicy> = {}): DecisionPolicy {
  return Object.freeze({
    ...initialObserveOnlyPolicy(),
    dailySpendLimitMinor: 1_000_000n,
    executionMode: 'APPLY',
    maxSpendPerMinuteMinor: 100n,
    maxSpendReportingLagMinutes: 10,
    policyMaxBidMinor: 1_000n,
    ...overrides,
  });
}

/**
 * Creates three complete days for an exact bid bucket.
 *
 * @param bidMinor - Confirmed bid.
 * @param orderedUnits - Daily ordered units.
 * @param spendMinor - Daily spend.
 * @param configurationChecksum - Traffic regime.
 * @returns Three finalized daily inputs.
 */
export function bucketDays(
  bidMinor: bigint,
  orderedUnits: bigint,
  spendMinor: bigint,
  configurationChecksum = 'regime-a',
): readonly DecisionPerformanceDay[] {
  return Object.freeze(
    [1, 2, 3].map((day) =>
      Object.freeze({
        bidMinor,
        clicks: 20n,
        configurationChecksum,
        date: `2026-07-${String(day).padStart(2, '0')}`,
        inputChecksum: `${bidMinor.toString()}-${String(day)}`,
        orderedUnits,
        spendMinor,
        views: 400n,
      }),
    ),
  );
}

/**
 * Creates a complete APPLY-capable decision input.
 *
 * @param overrides - Scenario overrides.
 * @returns Immutable decision input.
 */
export function decisionInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  const decisionAt = new Date('2026-07-28T12:00:00.000Z');
  return Object.freeze({
    algorithmVersion: 'rules-v1',
    attributionUnambiguous: true,
    budget: Object.freeze({
      contractStatus: 'VERIFIED',
      observedSameDaySpendMinor: 10_000n,
      signalFetchedAt: new Date('2026-07-28T11:55:00.000Z'),
      signalFreshnessMinutes: 180,
      spendSignalCoverageEndedAt: new Date('2026-07-28T11:50:00.000Z'),
      targetSyncSlaMinutes: 30,
      writeVisibilitySlaSeconds: 60,
    }),
    campaignRunning: true,
    capability: 'CARD_WRITE_READY',
    currentBidMinor: 100n,
    currentTrafficRegimeChecksum: 'regime-a',
    dailyAnchorBidMinor: 100n,
    decisionAt,
    endpointQuantumMinor: 1n,
    expectedContributionBeforeAdsMinor: 500n,
    lastWriteAt: null,
    manualPause: false,
    paymentType: 'CPM',
    performanceDays: Object.freeze([
      ...bucketDays(80n, 9n, 400n),
      ...bucketDays(100n, 10n, 1_000n),
      ...bucketDays(120n, 11n, 1_500n),
    ]),
    policy: decisionPolicy(),
    productEconomicsVersion: 1n,
    snapshotApplyEligible: true,
    targetKey: Object.freeze({
      nmId: 123n,
      normQueryCanonical: null,
      placement: 'SEARCH',
      targetKind: 'CARD',
      wbCampaignId: 10_001n,
    }),
    wbMinimumBidMinor: 50n,
    ...overrides,
  });
}
