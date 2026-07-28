import { describe, expect, it } from 'vitest';

import {
  accountSettingsChecksum,
  assessPerformanceDay,
  assessTargetSnapshot,
  calculateCurrentStateCapacity,
  calculateMinimumBidCapacity,
  canonicalizeNormQuery,
  findNormQueryNfcCollisions,
  normalizeCampaignStatisticDay,
  selectFairWorkPage,
  validateAccountBindingTransition,
  type AccountBindingCandidate,
  type PerformanceDayCandidate,
} from '@wb-bidder/data-sync';

const BINDING_CANDIDATE: AccountBindingCandidate = {
  accountCurrency: 'RUB',
  accountTimezone: 'Europe/Moscow',
  environment: 'PROD',
  sellerSid: '00000000-0000-4000-8000-000000000001',
  tokenCategory: 'PROMOTION',
  tokenFingerprint: 'a'.repeat(64),
  tokenFor: null,
  tokenType: 'BASE',
};

describe('immutable account binding', () => {
  it('allows only empty initialization, same-account rotation and one-way BASE upgrade', () => {
    expect(validateAccountBindingTransition(null, BINDING_CANDIDATE, false)).toBe('CREATE');
    expect(() => validateAccountBindingTransition(null, BINDING_CANDIDATE, true)).toThrow(
      'existing business data',
    );
    const existing = {
      ...BINDING_CANDIDATE,
      accountSettingsChecksum: accountSettingsChecksum('RUB', 'Europe/Moscow'),
      bindingVersion: 1n,
    };
    expect(validateAccountBindingTransition(existing, BINDING_CANDIDATE, false)).toBe('VALIDATE');
    expect(
      validateAccountBindingTransition(
        existing,
        { ...BINDING_CANDIDATE, tokenFingerprint: 'b'.repeat(64) },
        false,
      ),
    ).toBe('ROTATE');
    expect(
      validateAccountBindingTransition(
        existing,
        {
          ...BINDING_CANDIDATE,
          tokenFingerprint: 'c'.repeat(64),
          tokenFor: 'SELF',
          tokenType: 'PERSONAL',
        },
        false,
      ),
    ).toBe('UPGRADE');
    expect(() =>
      validateAccountBindingTransition(
        { ...existing, tokenType: 'PERSONAL', tokenFor: 'SELF' },
        BINDING_CANDIDATE,
        false,
      ),
    ).toThrow('forbidden');
  });
});

describe('target and statistical evidence', () => {
  it('preserves WB query spelling and detects NFC-only collisions', () => {
    const decomposed = 'и\u0306';
    const composed = 'й';
    expect(canonicalizeNormQuery(decomposed)).toBe(composed);
    expect(canonicalizeNormQuery(' Query ')).toBe(' Query ');
    expect(findNormQueryNfcCollisions([decomposed, composed, 'query', 'Query'])).toEqual([
      composed,
    ]);
  });

  it('requires fresh coherent sources and same-day spend only for increases', () => {
    const now = new Date('2026-07-30T12:00:00.000Z');
    const complete = assessTargetSnapshot(
      [
        source('CAMPAIGN_DETAILS', now, true, 'regime-1'),
        source('CURRENT_BID', now, true, 'regime-1'),
        source('MINIMUM_BID', now, true, null),
      ],
      now,
    );
    expect(complete).toMatchObject({
      applyEligible: true,
      increaseEligible: false,
      status: 'COMPLETE',
    });
    const increase = assessTargetSnapshot(
      [
        source('CAMPAIGN_DETAILS', now, true, 'regime-1'),
        source('CURRENT_BID', now, true, 'regime-1'),
        source('MINIMUM_BID', now, true, null),
        source('SAME_DAY_SPEND', now, false, null),
      ],
      now,
    );
    expect(increase.increaseEligible).toBe(true);
    const inconsistent = assessTargetSnapshot(
      [
        source('CAMPAIGN_DETAILS', now, true, 'regime-1'),
        source('CURRENT_BID', now, true, 'regime-2'),
      ],
      now,
    );
    expect(inconsistent).toMatchObject({
      applyEligible: false,
      status: 'INVALID',
    });
    expect(inconsistent.flags).toContain('INCOHERENT_TRAFFIC_REGIME');
  });

  it('finalizes only stable full SHKS days with continuous bid provenance', () => {
    const candidate = eligibleCandidate();
    const policy = {
      maxObservationGapMinutes: 20,
      minimumStableMinutes: 60,
      minimumStableReads: 2,
    };
    const eligible = assessPerformanceDay(candidate, policy);
    expect(eligible).toMatchObject({
      confirmedBidMinor: 1200n,
      qualityFlags: [],
      status: 'FINALIZED',
    });
    expect(eligible.inputChecksum).toMatch(/^[a-f0-9]{64}$/u);

    const missingShks = assessPerformanceDay(
      {
        ...candidate,
        statistic: { ...candidate.statistic, orderedUnits: null },
      },
      policy,
    );
    expect(missingShks.status).toBe('INVALID');
    expect(missingShks.qualityFlags).toContain('MISSING_SHKS');

    const ambiguous = assessPerformanceDay({ ...candidate, attributionUnambiguous: false }, policy);
    expect(ambiguous.qualityFlags).toContain('AMBIGUOUS_PLACEMENT_ATTRIBUTION');

    const shared = assessPerformanceDay(
      {
        ...candidate,
        bidStates: candidate.bidStates.map((item) => ({
          ...item,
          changeMarkerObserved: false,
        })),
        externalWriteControlMode: 'SHARED',
      },
      policy,
    );
    expect(shared.qualityFlags).toContain('SHARED_PROVENANCE_UNCERTAIN');

    const malformedMoney = assessPerformanceDay(
      { ...candidate, moneyContractValid: false },
      policy,
    );
    expect(malformedMoney.qualityFlags).toContain('MONEY_CONTRACT_UNVERIFIED');
  });

  it('normalizes fullstats money exactly only under verified semantics', () => {
    expect(
      normalizeCampaignStatisticDay(
        {
          atbs: 3,
          clicks: 10,
          date: '2026-07-27',
          orders: 2,
          shks: 2,
          sum: '50.00',
          sum_price: '200.00',
          views: 100,
        },
        'VERIFIED',
      ),
    ).toEqual({
      atbs: 3n,
      attributedRevenueMinor: 20_000n,
      clicks: 10n,
      date: '2026-07-27',
      orderedUnits: 2n,
      orders: 2n,
      spendMinor: 5_000n,
      views: 100n,
    });
    expect(() =>
      normalizeCampaignStatisticDay(
        {
          atbs: 3,
          clicks: 10,
          date: '2026-07-27',
          orders: 2,
          shks: 2,
          sum: '50.00',
          sum_price: '200.00',
        },
        'UNVERIFIED',
      ),
    ).toThrow('UNVERIFIED');
    expect(() =>
      normalizeCampaignStatisticDay(
        {
          atbs: 3,
          clicks: 10,
          date: '2026-07-27',
          orders: 2,
          sum: '50.00',
          sum_price: '200.00',
        },
        'VERIFIED',
      ),
    ).toThrow('missing SHKS');
    expect(() =>
      normalizeCampaignStatisticDay(
        {
          atbs: -1,
          clicks: 10,
          date: '2026-07-27',
          orders: 2,
          shks: 2,
          sum: '50.00',
          sum_price: '200.00',
        },
        'VERIFIED',
      ),
    ).toThrow('counter is invalid');
  });
});

describe('sync capacity and fairness', () => {
  it('matches the 10,000 campaign minimum-bid lower bound and reserve', () => {
    expect(calculateMinimumBidCapacity(10_000, 20, 720)).toEqual({
      applyCapacityProven: true,
      fullPassLowerBoundMinutes: 500,
      requiredSlaMinutes: 600,
    });
    expect(calculateMinimumBidCapacity(10_000, 20, 599).applyCapacityProven).toBe(false);
    expect(calculateCurrentStateCapacity(10_000, 50, 5, 15, 10, 20, 20)).toEqual({
      applyCapacityProven: true,
      fullPassLowerBoundSeconds: 40,
      targetObservationGapWorstCaseMinutes: 15 + 2 / 3,
    });
  });

  it('reserves round-robin capacity under a permanent urgent stream', () => {
    let cursor = 0;
    const seen = new Set<number>();
    for (let page = 0; page < 1_000; page += 1) {
      const selected = selectFairWorkPage(100_000, cursor, 500, [99_999, 99_998, 99_997]);
      cursor = selected.nextCursor;
      for (const index of selected.indices) {
        seen.add(index);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(100_000);
    expect(cursor).toBe(0);
  });
});

function source(
  dataKind: 'CAMPAIGN_DETAILS' | 'CURRENT_BID' | 'MINIMUM_BID' | 'SAME_DAY_SPEND',
  fetchedAt: Date,
  required: boolean,
  regimeChecksum: string | null,
) {
  return {
    dataKind,
    fetchedAt,
    freshnessMinutes: 20,
    regimeChecksum,
    required,
    sourceChecksum: `${dataKind}-checksum`,
    valid: true,
  } as const;
}

function eligibleCandidate(): PerformanceDayCandidate {
  const dayStartedAt = new Date('2026-07-27T00:00:00.000Z');
  const dayEndedAt = new Date('2026-07-28T00:00:00.000Z');
  const bidStates = Array.from({ length: 73 }, (_, index) => ({
    changeMarkerObserved: true,
    configurationChecksum: 'regime-1',
    currentBidMinor: 1200n,
    observedAt: new Date(dayStartedAt.getTime() + index * 20 * 60_000),
  }));
  return {
    attributionUnambiguous: true,
    bidStates,
    campaignTrafficEligible: true,
    conversionCutoff: new Date('2026-07-29T00:00:00.000Z'),
    dayEndedAt,
    dayStartedAt,
    externalWriteControlMode: 'EXCLUSIVE',
    moneyContractValid: true,
    preEnrollment: false,
    sourceReads: [
      {
        checksum: 'stable-source',
        fetchedAt: new Date('2026-07-29T00:00:00.000Z'),
      },
      {
        checksum: 'stable-source',
        fetchedAt: new Date('2026-07-29T01:00:00.000Z'),
      },
    ],
    statistic: {
      atbs: 3n,
      attributedRevenueMinor: 20_000n,
      clicks: 10n,
      date: '2026-07-27',
      orderedUnits: 2n,
      orders: 2n,
      spendMinor: 5_000n,
      views: 100n,
    },
  };
}
