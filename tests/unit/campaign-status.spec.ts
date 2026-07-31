import { describe, expect, it } from 'vitest';

import {
  isCampaignApplyEligibleStatus,
  isCampaignStatisticsEligibleStatus,
} from '@wb-bidder/contracts';

describe('WB campaign status eligibility', () => {
  it.each([
    [-1, false, false],
    [4, false, false],
    [7, true, false],
    [8, false, false],
    [9, true, true],
    [11, true, true],
    [999, false, false],
  ])(
    'classifies status %i for statistics=%s and apply=%s',
    (status, statisticsEligible, applyEligible) => {
      expect(isCampaignStatisticsEligibleStatus(status)).toBe(statisticsEligible);
      expect(isCampaignApplyEligibleStatus(status)).toBe(applyEligible);
    },
  );
});
