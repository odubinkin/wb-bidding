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

/** Immutable runtime limits governing leasing, batching, dispatch, and reconciliation. */
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
      selectorForEndpoint(this.options.endpointKey),
    );
    if (claimed.length === 0) return 0;
    const supported: ClaimedQueueItem[] = [];
    for (const item of claimed) {
      if (!supportsEndpoint(this.options.endpointKey, item)) {
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
    const leases = new LeaseHeartbeat(
      this.repository,
      workerId,
      selected.map((item) => item.queueItemId),
      this.options.leaseSeconds,
    );
    leases.start();
    try {
      const valid: {
        item: ClaimedQueueItem;
        live: Awaited<ReturnType<WriteGateway['readLiveState']>>;
      }[] = [];
      for (const item of selected) {
        leases.assertHealthy();
        try {
          const live = await this.gateway.readLiveState(item);
          const result = await this.validator.validate(item, live);
          leases.assertHealthy();
          if (!result.valid) {
            await leases.remove(item.queueItemId);
            await this.repository.failLeased(item.queueItemId, workerId, result.code, 'INVALID');
            continue;
          }
          valid.push({ item, live });
        } catch {
          await leases.remove(item.queueItemId);
          await this.repository.releaseLease(
            item.queueItemId,
            workerId,
            'PREWRITE_READ_FAILED',
            new Date(Date.now() + 5_000),
          );
        }
        leases.assertHealthy();
      }
      if (valid.length === 0) return claimed.length;
      await leases.renewNow();
      let reservation: DispatchReservation;
      try {
        reservation = await this.gateway.reserveDispatch(this.options.endpointKey);
      } catch {
        for (const { item } of valid) {
          await leases.remove(item.queueItemId);
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
          await leases.remove(item.queueItemId);
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
        await leases.renewNow();
        prepared = await this.repository.prepare({
          endpointKey: this.options.endpointKey,
          items: valid,
          method: methodForEndpoint(this.options.endpointKey),
          reconciliationDeadlineMs: this.options.reconciliationDeadlineMs,
          visibilityDelayMs: this.options.visibilityDelayMs,
          workerId,
        });
        await leases.renewNow();
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
          (error.message === 'PREWRITE_STATE_STALE' || error.message === 'DECISION_SUPERSEDED') &&
          prepared !== undefined
        ) {
          await this.repository.rejectPreparedNoDispatch(prepared, workerId, error.message);
          return claimed.length;
        }
        throw error;
      }
      await leases.stop();
      const started = performance.now();
      const dispatchItems = valid.map(({ item, live }) => ({
        action: item.action,
        bidMinor: item.bidMinor,
        decisionId: item.decisionId,
        nmId: item.nmId,
        normQueryWire: item.normQueryWire,
        placement: item.placement,
        targetKind: item.targetKind,
        wireBidRaw: item.action === 'DELETE' ? live.bidMinor : item.bidMinor,
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
    } finally {
      await leases.stop();
    }
  }
}

class LeaseHeartbeat {
  private readonly activeQueueItemIds: Set<string>;
  private failure: Error | undefined;
  private renewal: Promise<void> | undefined;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly repository: WritePipelineRepository,
    private readonly workerId: string,
    queueItemIds: readonly string[],
    private readonly leaseSeconds: number,
  ) {
    this.activeQueueItemIds = new Set(queueItemIds);
  }

  public start(): void {
    if (this.running || this.activeQueueItemIds.size === 0) return;
    this.running = true;
    this.schedule();
  }

  public assertHealthy(): void {
    if (this.failure !== undefined) throw this.failure;
  }

  public async remove(queueItemId: string): Promise<void> {
    if (this.renewal !== undefined) await this.renewal;
    this.assertHealthy();
    this.activeQueueItemIds.delete(queueItemId);
  }

  public async renewNow(): Promise<void> {
    await this.renewOnce();
    this.assertHealthy();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.renewal !== undefined) await this.renewal;
  }

  private schedule(): void {
    this.timer = setTimeout(
      () => {
        void this.renewOnce().finally(() => {
          if (this.running) this.schedule();
        });
      },
      Math.max(250, Math.floor((this.leaseSeconds * 1_000) / 3)),
    );
  }

  private renewOnce(): Promise<void> {
    if (this.renewal !== undefined) return this.renewal;
    this.renewal = this.renew().finally(() => {
      this.renewal = undefined;
    });
    return this.renewal;
  }

  private async renew(): Promise<void> {
    if (this.failure !== undefined || this.activeQueueItemIds.size === 0) return;
    const queueItemIds = [...this.activeQueueItemIds];
    try {
      const renewed = await this.repository.heartbeat(
        this.workerId,
        queueItemIds,
        this.leaseSeconds,
      );
      if (renewed !== queueItemIds.length) {
        this.failure = new Error('LEASE_LOST');
      }
    } catch (error: unknown) {
      this.failure = error instanceof Error ? error : new Error('WRITE_LEASE_HEARTBEAT_FAILED');
    }
  }
}

function selectorForEndpoint(endpointKey: string): {
  readonly action: 'DELETE' | 'SET';
  readonly targetKind: 'CARD' | 'CLUSTER';
} {
  if (endpointKey === 'cardBidsWrite') return { action: 'SET', targetKind: 'CARD' };
  if (endpointKey === 'clusterWriteBids') return { action: 'SET', targetKind: 'CLUSTER' };
  if (endpointKey === 'clusterDeleteBids') return { action: 'DELETE', targetKind: 'CLUSTER' };
  throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
}

function supportsEndpoint(endpointKey: string, item: ClaimedQueueItem): boolean {
  if (item.campaignBidType === 'UNKNOWN' || item.campaignPaymentType === 'UNKNOWN') return false;
  if (endpointKey === 'cardBidsWrite') {
    return item.targetKind === 'CARD' && item.action === 'SET';
  }
  if (endpointKey === 'clusterWriteBids' || endpointKey === 'clusterDeleteBids') {
    return (
      item.targetKind === 'CLUSTER' &&
      item.campaignBidType === 'MANUAL' &&
      item.campaignPaymentType === 'CPM' &&
      item.action === (endpointKey === 'clusterDeleteBids' ? 'DELETE' : 'SET') &&
      item.normQueryWire !== null
    );
  }
  return false;
}

function methodForEndpoint(endpointKey: string): 'DELETE' | 'PATCH' | 'POST' {
  if (endpointKey === 'cardBidsWrite') return 'PATCH';
  if (endpointKey === 'clusterWriteBids') return 'POST';
  if (endpointKey === 'clusterDeleteBids') return 'DELETE';
  throw new Error('UNSUPPORTED_WRITE_ENDPOINT');
}

function oldestStateAgeMs(
  items: readonly { readonly live: { readonly observedAt: Date } }[],
): number {
  const oldest = Math.min(...items.map(({ live }) => live.observedAt.getTime()));
  return Math.max(0, Date.now() - oldest);
}
