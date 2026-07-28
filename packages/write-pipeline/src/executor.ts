/* eslint-disable jsdoc/require-jsdoc */
import { performance } from 'node:perf_hooks';
import { WbApiError } from '@wb-bidder/wb-api';

import type { WritePipelineRepository } from './repository.js';
import type {
  ClaimedQueueItem,
  DispatchReservation,
  PreDispatchValidator,
  WriteGateway,
} from './types.js';

export interface ExecutorOptions {
  readonly endpointKey: string;
  readonly leaseSeconds: number;
  readonly maximumBatchSize: number;
  readonly maximumWriteAttempts: number;
  readonly preByteMaximumRetries: number;
  readonly preWriteStateMaximumAgeMs: number;
  readonly reconciliationDeadlineMs: number;
  readonly visibilityDelayMs: number;
}

/**
 * Executes writes only after durable evidence and DISPATCHING commit.
 */
export class WriteExecutor {
  public constructor(
    private readonly repository: WritePipelineRepository,
    private readonly gateway: WriteGateway,
    private readonly validator: PreDispatchValidator,
    private readonly options: ExecutorOptions,
  ) {}

  public async runOnce(workerId: string): Promise<number> {
    const claimed = await this.repository.claim(
      workerId,
      this.options.maximumBatchSize,
      this.options.leaseSeconds,
    );
    if (claimed.length === 0) return 0;
    const supported: ClaimedQueueItem[] = [];
    for (const item of claimed) {
      if (
        this.options.endpointKey !== 'cardBidsWrite' ||
        item.targetKind !== 'CARD' ||
        item.action !== 'SET' ||
        item.campaignBidType === 'UNKNOWN' ||
        item.campaignPaymentType === 'UNKNOWN'
      ) {
        await this.repository.failLeased(
          item.queueItemId,
          workerId,
          'UNSUPPORTED_WRITE_CAPABILITY',
          'CAPABILITY',
        );
      } else {
        supported.push(item);
      }
    }
    const first = supported[0];
    if (first === undefined) return claimed.length;
    const batchKey = `${first.campaignBidType}:${first.campaignPaymentType}:${first.action}`;
    const selected: ClaimedQueueItem[] = [];
    for (const item of supported) {
      const candidateKey = `${item.campaignBidType}:${item.campaignPaymentType}:${item.action}`;
      if (candidateKey === batchKey) {
        selected.push(item);
      } else {
        await this.repository.releaseLease(
          item.queueItemId,
          workerId,
          'BATCH_GROUP_DEFERRED',
          new Date(Date.now() + 100),
        );
      }
    }
    const valid: {
      item: ClaimedQueueItem;
      live: Awaited<ReturnType<WriteGateway['readLiveState']>>;
    }[] = [];
    for (const item of selected) {
      try {
        const live = await this.gateway.readLiveState(item);
        const result = await this.validator.validate(item, live);
        if (!result.valid) {
          await this.repository.failLeased(item.queueItemId, workerId, result.code, 'INVALID');
          continue;
        }
        valid.push({ item, live });
      } catch {
        await this.repository.releaseLease(
          item.queueItemId,
          workerId,
          'PREWRITE_READ_FAILED',
          new Date(Date.now() + 5_000),
        );
      }
    }
    if (valid.length === 0) return claimed.length;
    let reservation: DispatchReservation;
    try {
      reservation = await this.gateway.reserveDispatch(this.options.endpointKey);
    } catch {
      for (const { item } of valid) {
        await this.repository.releaseLease(
          item.queueItemId,
          workerId,
          'WRITE_ADMISSION_FAILED',
          new Date(Date.now() + 5_000),
        );
      }
      return claimed.length;
    }
    if (oldestStateAgeMs(valid) > this.options.preWriteStateMaximumAgeMs) {
      reservation.release();
      for (const { item } of valid) {
        await this.repository.releaseLease(
          item.queueItemId,
          workerId,
          'PREWRITE_STATE_STALE',
          new Date(),
        );
      }
      return claimed.length;
    }
    let prepared: Awaited<ReturnType<WritePipelineRepository['prepare']>> | undefined;
    try {
      prepared = await this.repository.prepare({
        endpointKey: this.options.endpointKey,
        items: valid,
        method: 'PATCH',
        reconciliationDeadlineMs: this.options.reconciliationDeadlineMs,
        visibilityDelayMs: this.options.visibilityDelayMs,
        workerId,
      });
      await this.repository.commitDispatch(
        prepared,
        workerId,
        this.options.visibilityDelayMs,
        this.options.reconciliationDeadlineMs,
        this.options.preWriteStateMaximumAgeMs,
      );
    } catch (error: unknown) {
      reservation.release();
      if (
        error instanceof Error &&
        error.message === 'PREWRITE_STATE_STALE' &&
        prepared !== undefined
      ) {
        await this.repository.rejectPreparedNoDispatch(prepared, workerId, 'PREWRITE_STATE_STALE');
        return claimed.length;
      }
      throw error;
    }
    const started = performance.now();
    const dispatchItems = valid.map(({ item }) => ({
      action: item.action,
      bidMinor: item.bidMinor,
      decisionId: item.decisionId,
      nmId: item.nmId,
      placement: item.placement,
      targetKind: item.targetKind,
      wbCampaignId: item.wbCampaignId,
    }));
    for (let retry = 0; ; retry += 1) {
      try {
        const result = await reservation.dispatch(dispatchItems, prepared.correlationId);
        await this.repository.completeDispatch(
          prepared.attemptId,
          result,
          Math.max(0, Math.round(performance.now() - started)),
        );
        break;
      } catch (error: unknown) {
        if (
          error instanceof WbApiError &&
          error.code === 'TRANSPORT_PRE_BYTE' &&
          retry < this.options.preByteMaximumRetries
        ) {
          try {
            reservation = await this.gateway.reserveDispatch(this.options.endpointKey);
          } catch (reservationError: unknown) {
            await this.repository.markPreByteFailure(prepared.attemptId, {
              message:
                reservationError instanceof Error
                  ? reservationError.message
                  : 'Write admission failed after a proven pre-byte failure',
            });
            break;
          }
          if (oldestStateAgeMs(valid) <= this.options.preWriteStateMaximumAgeMs) {
            continue;
          }
        }
        if (error instanceof WbApiError && error.code === 'TRANSPORT_PRE_BYTE') {
          reservation.release();
          await this.repository.markPreByteFailure(prepared.attemptId, {
            message: error.message,
          });
        } else {
          await this.repository.markUnknown(prepared.attemptId, 'AMBIGUOUS_DISPATCH_RESULT', {
            message: error instanceof Error ? error.message : 'Unknown dispatch failure',
          });
        }
        break;
      }
    }
    return claimed.length;
  }
}

function oldestStateAgeMs(
  items: readonly { readonly live: { readonly observedAt: Date } }[],
): number {
  const oldest = Math.min(...items.map(({ live }) => live.observedAt.getTime()));
  return Math.max(0, Date.now() - oldest);
}
