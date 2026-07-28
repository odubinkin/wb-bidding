import { describe, expect, it } from 'vitest';

import { decideBid } from '@wb-bidder/decision-engine';

import { bucketDays, decisionInput, decisionPolicy } from '../helpers/decision-fixtures.js';

interface SemanticMutant {
  readonly name: string;
  readonly survives: () => boolean;
}

describe('critical formula and guardrail mutation matrix', () => {
  it('kills at least 80 percent of explicit critical semantic mutants', () => {
    const baseline = decideBid(decisionInput());
    const mutants: readonly SemanticMutant[] = [
      {
        name: 'profit adds spend',
        survives: () =>
          8n * 500n + 1_100n === baseline.explanation.candidates[1]?.conservativeProfitScoreMinor,
      },
      {
        name: 'safety discount omitted',
        survives: () =>
          baseline.explanation.buckets.some(
            (bucket) => bucket.orderedUnitsPerDayRaw === bucket.orderedUnitsPerDaySafe,
          ),
      },
      {
        name: 'spend premium omitted',
        survives: () =>
          baseline.explanation.buckets.some(
            (bucket) => bucket.spendMinorPerDayRaw === bucket.spendMinorPerDaySafe,
          ),
      },
      {
        name: 'stale snapshot writes',
        survives: () => decideBid(decisionInput({ snapshotApplyEligible: false })).queueEligible,
      },
      {
        name: 'cluster contract writes',
        survives: () =>
          decideBid(
            decisionInput({
              capability: 'OBSERVE_ONLY',
              targetKey: {
                ...decisionInput().targetKey,
                normQueryCanonical: 'q',
                targetKind: 'CLUSTER',
              },
            }),
          ).queueEligible,
      },
      {
        name: 'negative contribution increases',
        survives: () =>
          decideBid(decisionInput({ expectedContributionBeforeAdsMinor: -1n })).action ===
          'INCREASE',
      },
      {
        name: 'unverified spend permits increase',
        survives: () =>
          decideBid(
            decisionInput({
              budget: { ...decisionInput().budget, contractStatus: 'UNVERIFIED' },
              performanceDays: [
                ...bucketDays(80n, 5n, 800n),
                ...bucketDays(100n, 7n, 1_000n),
                ...bucketDays(120n, 15n, 1_200n),
              ],
            }),
          ).queueEligible,
      },
      {
        name: 'hysteresis uses OR',
        survives: () =>
          decideBid(
            decisionInput({
              expectedContributionBeforeAdsMinor: -1n,
              policy: decisionPolicy({ minAbsoluteChangeMinor: 50n }),
            }),
          ).queueEligible,
      },
      {
        name: 'cooldown ignored',
        survives: () =>
          decideBid(
            decisionInput({
              expectedContributionBeforeAdsMinor: -1n,
              lastWriteAt: new Date('2026-07-28T11:30:00.000Z'),
            }),
          ).queueEligible,
      },
      {
        name: 'minimum above cap writes',
        survives: () =>
          decideBid(
            decisionInput({
              policy: decisionPolicy({ policyMaxBidMinor: 49n }),
              wbMinimumBidMinor: 50n,
            }),
          ).queueEligible,
      },
    ];
    const survivors = mutants.filter((mutant) => mutant.survives());
    const score = ((mutants.length - survivors.length) / mutants.length) * 100;
    expect(
      { score, survivors: survivors.map((mutant) => mutant.name) },
      'critical semantic mutation score',
    ).toMatchObject({ score: 100, survivors: [] });
    expect(score).toBeGreaterThanOrEqual(80);
  });
});
