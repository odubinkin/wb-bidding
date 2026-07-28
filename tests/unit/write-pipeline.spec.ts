import { describe, expect, it, vi } from 'vitest';

import {
  WriteExecutor,
  assertQueueTransition,
  classifyReconciliation,
  isSafeStableOldRetry,
  redactSecrets,
  stateChecksum,
  type ClaimedQueueItem,
  type LiveBidState,
  type WritePipelineRepository,
} from '@wb-bidder/write-pipeline';
import { WbApiError } from '@wb-bidder/wb-api';

const claimed: ClaimedQueueItem = {
  action: 'SET',
  attemptCount: 0,
  bidMinor: 1200n,
  campaignBidType: 'MANUAL',
  campaignId: '00000000-0000-4000-8000-000000000011',
  campaignPaymentType: 'CPM',
  wbCampaignId: 10001n,
  decisionId: '00000000-0000-4000-8000-000000000012',
  desiredBidState: 'EXPLICIT',
  metricSnapshotId: '00000000-0000-4000-8000-000000000013',
  nmId: 20001n,
  placement: 'SEARCH',
  policyVersion: 1n,
  priority: 100,
  queueItemId: '00000000-0000-4000-8000-000000000014',
  targetId: '00000000-0000-4000-8000-000000000015',
  targetKind: 'CARD',
};

const oldState: LiveBidState = {
  bidMinor: 1000n,
  explicit: true,
  observedAt: new Date('2026-07-28T00:00:00.000Z'),
  sourceMarker: 'mock:1',
};

describe('write pipeline state safety', () => {
  it('rejects lifecycle shortcuts and classifies desired, old, and external states', () => {
    expect(() => {
      assertQueueTransition('QUEUED', 'SENT');
    }).toThrow('INVALID_QUEUE_TRANSITION');
    expect(() => {
      assertQueueTransition('QUEUED', 'LEASED');
    }).not.toThrow();
    expect(
      classifyReconciliation({ ...oldState, bidMinor: 1200n }, oldState, {
        bidMinor: 1200n,
        explicit: true,
      }),
    ).toBe('DESIRED_STATE');
    expect(classifyReconciliation(oldState, oldState, { bidMinor: 1200n, explicit: true })).toBe(
      'STABLE_OLD_STATE',
    );
    expect(
      classifyReconciliation({ ...oldState, bidMinor: 1100n }, oldState, {
        bidMinor: 1200n,
        explicit: true,
      }),
    ).toBe('THIRD_STATE');
  });

  it('requires two separated fresh validated stable-old reads', () => {
    expect(
      isSafeStableOldRetry({
        beforeDeadline: true,
        elapsedSincePreviousMs: 10_000,
        fresh: true,
        minimumReadIntervalMs: 10_000,
        prevalidationPassed: true,
        requiredStableReadCount: 2,
        stableReadCount: 2,
      }),
    ).toBe(true);
    for (const override of [
      { stableReadCount: 1 },
      { elapsedSincePreviousMs: 9_999 },
      { fresh: false },
      { prevalidationPassed: false },
      { requiredStableReadCount: 3 },
      { beforeDeadline: false },
    ]) {
      expect(
        isSafeStableOldRetry({
          beforeDeadline: true,
          elapsedSincePreviousMs: 10_000,
          fresh: true,
          minimumReadIntervalMs: 10_000,
          prevalidationPassed: true,
          requiredStableReadCount: 2,
          stableReadCount: 2,
          ...override,
        }),
      ).toBe(false);
    }
  });

  it('produces deterministic state evidence and recursively redacts credentials', () => {
    expect(stateChecksum(oldState)).toMatch(/^[a-f0-9]{64}$/u);
    expect(stateChecksum({ ...oldState })).toBe(stateChecksum(oldState));
    expect(
      redactSecrets({
        nested: { Authorization: 'Bearer secret', okay: 'visible' },
        token: 'secret',
      }),
    ).toEqual({
      nested: { Authorization: '[REDACTED]', okay: 'visible' },
      token: '[REDACTED]',
    });
  });

  it('commits DISPATCHING before I/O and maps ambiguous transport failure to UNKNOWN once', async () => {
    const calls: string[] = [];
    const repository = {
      claim: vi.fn().mockResolvedValue([claimed]),
      commitDispatch: vi.fn().mockImplementation(() => {
        calls.push('commit');
        return Promise.resolve();
      }),
      completeDispatch: vi.fn(),
      failLeased: vi.fn(),
      markUnknown: vi.fn().mockImplementation(() => {
        calls.push('unknown');
        return Promise.resolve();
      }),
      prepare: vi.fn().mockResolvedValue({
        attemptId: '00000000-0000-4000-8000-000000000016',
        correlationId: '00000000-0000-4000-8000-000000000017',
        items: [],
      }),
      releaseLease: vi.fn(),
    } as unknown as WritePipelineRepository;
    const gateway = {
      dispatch: vi.fn().mockImplementation(() => {
        calls.push('dispatch');
        return Promise.reject(new Error('connection reset after request body'));
      }),
      readLiveState: vi.fn().mockResolvedValue({ ...oldState, observedAt: new Date() }),
      reserveDispatch: vi.fn().mockResolvedValue({
        dispatch: vi.fn().mockImplementation(() => {
          calls.push('dispatch');
          return Promise.reject(new Error('connection reset after request body'));
        }),
        release: vi.fn(),
      }),
    };
    const executor = new WriteExecutor(
      repository,
      gateway,
      { validate: vi.fn().mockResolvedValue({ valid: true }) },
      {
        endpointKey: 'cardBidsWrite',
        leaseSeconds: 30,
        maximumBatchSize: 10,
        maximumWriteAttempts: 2,
        preByteMaximumRetries: 1,
        preWriteStateMaximumAgeMs: 10_000,
        reconciliationDeadlineMs: 60_000,
        visibilityDelayMs: 5_000,
      },
    );
    await expect(executor.runOnce('worker-1')).resolves.toBe(1);
    expect(calls).toEqual(['commit', 'dispatch', 'unknown']);
    expect(gateway.reserveDispatch).toHaveBeenCalledTimes(1);
  });

  it('retries a proven pre-byte failure once in the same durable attempt', async () => {
    const completeDispatch = vi.fn();
    const markPreByteFailure = vi.fn();
    const markUnknown = vi.fn();
    const repository = {
      claim: vi.fn().mockResolvedValue([claimed]),
      commitDispatch: vi.fn(),
      completeDispatch,
      failLeased: vi.fn(),
      markPreByteFailure,
      markUnknown,
      prepare: vi.fn().mockResolvedValue({
        attemptId: '00000000-0000-4000-8000-000000000016',
        correlationId: '00000000-0000-4000-8000-000000000017',
        items: [],
      }),
      releaseLease: vi.fn(),
    } as unknown as WritePipelineRepository;
    const firstDispatch = vi
      .fn()
      .mockRejectedValue(
        new WbApiError('TRANSPORT_PRE_BYTE', 'connection failed before bytes', null, true),
      );
    const secondDispatch = vi.fn().mockResolvedValue({
      httpStatus: 200,
      items: [{ accepted: true, requestIndex: 0 }],
    });
    const gateway = {
      dispatch: vi.fn(),
      readLiveState: vi.fn().mockResolvedValue({ ...oldState, observedAt: new Date() }),
      reserveDispatch: vi
        .fn()
        .mockResolvedValueOnce({ dispatch: firstDispatch, release: vi.fn() })
        .mockResolvedValueOnce({ dispatch: secondDispatch, release: vi.fn() }),
    };
    const executor = new WriteExecutor(
      repository,
      gateway,
      { validate: vi.fn().mockResolvedValue({ valid: true }) },
      {
        endpointKey: 'cardBidsWrite',
        leaseSeconds: 30,
        maximumBatchSize: 10,
        maximumWriteAttempts: 2,
        preByteMaximumRetries: 1,
        preWriteStateMaximumAgeMs: 10_000,
        reconciliationDeadlineMs: 60_000,
        visibilityDelayMs: 5_000,
      },
    );

    await expect(executor.runOnce('worker-pre-byte')).resolves.toBe(1);
    expect(firstDispatch).toHaveBeenCalledTimes(1);
    expect(secondDispatch).toHaveBeenCalledTimes(1);
    expect(completeDispatch).toHaveBeenCalledTimes(1);
    expect(markPreByteFailure).not.toHaveBeenCalled();
    expect(markUnknown).not.toHaveBeenCalled();
  });
});
