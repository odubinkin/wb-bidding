import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DatabasePreDispatchValidator } from '../../apps/bidder/src/pre-dispatch-validator.js';
import { RuntimeSafetyState } from '../../apps/bidder/src/runtime-state.js';
import { loadConfiguration } from '@wb-bidder/config';
import type { ClaimedQueueItem, LiveBidState } from '@wb-bidder/write-pipeline';

const now = new Date('2026-07-28T12:00:00.000Z');
const restore: ClaimedQueueItem = Object.freeze({
  action: 'DELETE',
  attemptCount: 0,
  bidMinor: null,
  campaignBidType: 'MANUAL',
  campaignId: '00000000-0000-4000-8000-000000000101',
  campaignPaymentType: 'CPM',
  decisionId: '00000000-0000-4000-8000-000000000102',
  desiredBidState: 'ABSENT',
  metricSnapshotId: '00000000-0000-4000-8000-000000000103',
  nmId: 20_001n,
  normQueryWire: 'synthetic cluster two',
  placement: 'SEARCH',
  policyVersion: 1n,
  priority: 100,
  queueItemId: '00000000-0000-4000-8000-000000000104',
  targetId: '00000000-0000-4000-8000-000000000105',
  targetKind: 'CLUSTER',
  wbCampaignId: 10_001n,
});
const live: LiveBidState = Object.freeze({
  bidMinor: 900n,
  explicit: true,
  observedAt: new Date(),
  sourceMarker: 'cluster-current-bids:explicit:900',
});

describe('cluster restore pre-dispatch proof', () => {
  it('permits DELETE only for a bidder-owned explicit override with proven ABSENT baseline', async () => {
    const row = {
      campaignAutomation: 'APPLY',
      campaignStatus: 9,
      capability: 'CLUSTER_WRITE_READY',
      clusterBaselineBidState: 'ABSENT',
      clusterBidState: 'EXPLICIT',
      clusterOverrideOwned: true,
      currentBidMinor: '900',
      currentEconomicsVersion: '1',
      decisionAction: 'RESTORE_ABSENT_OVERRIDE',
      decisionCreatedAt: now,
      decisionEconomicsVersion: '1',
      executionMode: 'APPLY',
      globalKill: false,
      minimumBidMinor: '500',
      policyConfiguration: { policyMaxBidMinor: '5000' },
      policyStillActive: true,
      policyVersion: '1',
      snapshotApplyEligible: true,
      targetAutomation: null,
      targetKind: 'CLUSTER',
    };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      WB_API_MOCK_BASE_URL: 'http://127.0.0.1:3001',
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'true',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const runtime = new RuntimeSafetyState();
    runtime.confirmAccountBinding();
    runtime.setCapacityAllowsWrites(true);
    runtime.setIntegrationAuthorized(true);
    const validator = new DatabasePreDispatchValidator(
      { query } as unknown as Pool,
      configuration,
      runtime,
      { now: () => now } as never,
    );

    await expect(validator.validate(restore, live)).resolves.toEqual({ valid: true });
    query.mockResolvedValueOnce({
      rows: [{ ...row, clusterBaselineBidState: 'EXPLICIT' }],
    });
    await expect(validator.validate(restore, live)).resolves.toEqual({
      code: 'CLUSTER_RESTORE_PROOF_MISSING',
      valid: false,
    });
    query.mockResolvedValueOnce({
      rows: [{ ...row, clusterOverrideOwned: false }],
    });
    await expect(validator.validate(restore, live)).resolves.toEqual({
      code: 'CLUSTER_RESTORE_PROOF_MISSING',
      valid: false,
    });
  });

  it.each([
    [4, 'CAMPAIGN_NOT_RUNNING'],
    [7, 'CAMPAIGN_STATUS_NOT_APPLY_ELIGIBLE'],
    [8, 'CAMPAIGN_STATUS_NOT_APPLY_ELIGIBLE'],
    [-1, 'CAMPAIGN_STATUS_NOT_APPLY_ELIGIBLE'],
    [9, null],
    [11, null],
    [999, 'CAMPAIGN_STATUS_NOT_APPLY_ELIGIBLE'],
  ])('applies the fail-closed status matrix for campaign status %i', async (status, code) => {
    const row = {
      campaignAutomation: 'APPLY',
      campaignStatus: status,
      capability: 'CLUSTER_WRITE_READY',
      clusterBaselineBidState: 'ABSENT',
      clusterBidState: 'EXPLICIT',
      clusterOverrideOwned: true,
      currentBidMinor: '900',
      currentEconomicsVersion: '1',
      decisionAction: 'RESTORE_ABSENT_OVERRIDE',
      decisionCreatedAt: now,
      decisionEconomicsVersion: '1',
      executionMode: 'APPLY',
      globalKill: false,
      minimumBidMinor: '500',
      policyConfiguration: { policyMaxBidMinor: '5000' },
      policyStillActive: true,
      policyVersion: '1',
      snapshotApplyEligible: true,
      targetAutomation: null,
      targetKind: 'CLUSTER',
    };
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-admin-token-with-32-chars',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      WB_API_MOCK_BASE_URL: 'http://127.0.0.1:3001',
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'true',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const runtime = new RuntimeSafetyState();
    runtime.confirmAccountBinding();
    runtime.setCapacityAllowsWrites(true);
    runtime.setIntegrationAuthorized(true);
    const validator = new DatabasePreDispatchValidator(
      { query: vi.fn().mockResolvedValue({ rows: [row] }) } as unknown as Pool,
      configuration,
      runtime,
      { now: () => now } as never,
    );

    await expect(validator.validate(restore, live)).resolves.toEqual(
      code === null ? { valid: true } : { code, valid: false },
    );
  });
});
