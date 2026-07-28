import { describe, expect, it } from 'vitest';

import { CURRENT_ENDPOINT_PROFILE } from '@wb-bidder/contracts';

describe('CURRENT_ENDPOINT_PROFILE', () => {
  it('pins the official card bid and campaign statistics limits', () => {
    expect(CURRENT_ENDPOINT_PROFILE.personalProductionLimits.cardMinimumBids).toEqual({
      burst: 5,
      intervalMs: 60_000,
      requests: 20,
    });
    expect(CURRENT_ENDPOINT_PROFILE.personalProductionLimits.campaignStatistics).toEqual({
      burst: 1,
      intervalMs: 60_000,
      requests: 3,
    });
  });

  it('keeps uncertain write and budget semantics fail closed', () => {
    expect(CURRENT_ENDPOINT_PROFILE.wireContracts.cardBidMinorUnits.status).toBe('VERIFIED');
    expect(CURRENT_ENDPOINT_PROFILE.wireContracts.clusterBid.status).toBe('UNVERIFIED');
    expect(CURRENT_ENDPOINT_PROFILE.wireContracts.budgetSemantics.status).toBe('UNVERIFIED');
    expect(CURRENT_ENDPOINT_PROFILE.wireContracts.sameDaySpend.status).toBe('UNVERIFIED');
  });

  it('is immutable at the top level and for contract entries', () => {
    expect(Object.isFrozen(CURRENT_ENDPOINT_PROFILE)).toBe(true);
    expect(Object.isFrozen(CURRENT_ENDPOINT_PROFILE.wireContracts.clusterBid)).toBe(true);
  });
});
