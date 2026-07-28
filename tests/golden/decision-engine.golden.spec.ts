import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { decideBid } from '@wb-bidder/decision-engine';

import { decisionInput } from '../helpers/decision-fixtures.js';

describe('rules-v1 golden decision fixture', () => {
  it('replays the versioned conservative-profit decision exactly', async () => {
    const fixture = JSON.parse(
      await readFile(new URL('../fixtures/decision-golden-v1.json', import.meta.url), 'utf8'),
    ) as {
      expected: {
        action: string;
        boundedBidMinor: string;
        bucketCount: number;
        minimumCandidateCount: number;
        outcomeReasonCode: string;
        queueEligible: boolean;
        strategyReasonCode: string;
      };
    };
    const decision = decideBid(decisionInput());
    expect({
      action: decision.action,
      boundedBidMinor: decision.boundedBidMinor?.toString(),
      bucketCount: decision.explanation.buckets.length,
      outcomeReasonCode: decision.outcomeReasonCode,
      queueEligible: decision.queueEligible,
      strategyReasonCode: decision.strategyReasonCode,
    }).toMatchObject({
      action: fixture.expected.action,
      boundedBidMinor: fixture.expected.boundedBidMinor,
      bucketCount: fixture.expected.bucketCount,
      outcomeReasonCode: fixture.expected.outcomeReasonCode,
      queueEligible: fixture.expected.queueEligible,
      strategyReasonCode: fixture.expected.strategyReasonCode,
    });
    expect(decision.explanation.candidates.length).toBeGreaterThanOrEqual(
      fixture.expected.minimumCandidateCount,
    );
  });
});
