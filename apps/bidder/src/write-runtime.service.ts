import { Inject, Injectable } from '@nestjs/common';
import { hostname } from 'node:os';

import { APP_CONFIGURATION } from './application-config.js';
import { ObservabilityService } from './observability.service.js';
import { DatabasePreDispatchValidator } from './pre-dispatch-validator.js';
import { CARD_BID_GATEWAY, WRITE_PIPELINE_REPOSITORY } from './runtime.providers.js';
import type { AppConfiguration } from '@wb-bidder/config';
import {
  WbCardBidGateway,
  WriteExecutor,
  WritePipelineRepository,
  classifyReconciliation,
  stateChecksum,
} from '@wb-bidder/write-pipeline';

const MAXIMUM_BATCH_SIZE = 50;
const LEASE_SECONDS = 60;
const RECONCILIATION_BATCH_SIZE = 100;

/**
 * Production application service for queue execution, verification, recovery, and retention.
 */
@Injectable()
export class WriteRuntimeService {
  private readonly executor: WriteExecutor;
  private readonly workerId = `${hostname()}:${String(process.pid)}:card-writer`;

  /**
   * Creates all write workers over the same repository, gateway, and validator.
   *
   * @param configuration - Write safety windows.
   * @param repository - Durable write persistence.
   * @param gateway - Card-bid WB gateway.
   * @param validator - Complete pre-dispatch validation.
   * @param observability - Bounded metrics.
   */
  public constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: AppConfiguration,
    @Inject(WRITE_PIPELINE_REPOSITORY)
    private readonly repository: WritePipelineRepository,
    @Inject(CARD_BID_GATEWAY) private readonly gateway: WbCardBidGateway,
    private readonly validator: DatabasePreDispatchValidator,
    private readonly observability: ObservabilityService,
  ) {
    this.executor = new WriteExecutor(repository, gateway, validator, {
      endpointKey: 'cardBidsWrite',
      leaseSeconds: LEASE_SECONDS,
      maximumBatchSize: MAXIMUM_BATCH_SIZE,
      maximumWriteAttempts: configuration.writePipeline.maximumWriteAttempts,
      preByteMaximumRetries: configuration.writePipeline.preByteMaximumRetries,
      preWriteStateMaximumAgeMs: configuration.writePipeline.preWriteStateMaximumAgeMs,
      reconciliationDeadlineMs: configuration.writePipeline.verificationTimeoutMs,
      visibilityDelayMs: configuration.writePipeline.verificationInitialDelayMs,
    });
  }

  /**
   * Claims and executes at most one card-bid batch.
   *
   * @returns Number of claimed items.
   */
  public async executeOnce(): Promise<number> {
    const claimed = await this.executor.runOnce(this.workerId);
    this.observability.executorAttempts.inc({
      endpoint: 'cardBidsWrite',
      result: claimed === 0 ? 'idle' : 'processed',
    });
    return claimed;
  }

  /**
   * Performs one bounded verification/reconciliation page.
   *
   * @returns Number of work items observed.
   */
  public async reconcileOnce(): Promise<number> {
    const work = await this.repository.loadReconciliationBatch(RECONCILIATION_BATCH_SIZE);
    for (const entry of work) {
      try {
        const live = await this.gateway.readLiveState(entry.item);
        const prevalidation = await this.validator.validate(entry.item, live);
        const classification = classifyReconciliation(live, entry.oldState, entry.desired);
        const outcome = await this.repository.recordReconciliation({
          attemptItemId: entry.attemptItemId,
          decisionId: entry.decisionId,
          maximumWriteAttempts: this.configuration.writePipeline.maximumWriteAttempts,
          minimumReadIntervalMs: this.configuration.writePipeline.stableReadIntervalMs,
          observation: {
            classification,
            fresh:
              Date.now() - live.observedAt.getTime() <=
              this.configuration.writePipeline.preWriteStateMaximumAgeMs,
            prevalidationPassed: prevalidation.valid,
            sourceMarker: live.sourceMarker,
            state: live,
            stateChecksum: stateChecksum(live),
          },
          observedAt: live.observedAt,
          requiredStableReadCount: this.configuration.writePipeline.stableOldStateReads,
          targetId: entry.item.targetId,
        });
        this.observability.verification.inc({ result: outcome });
      } catch (error: unknown) {
        const code =
          error instanceof Error && error.message === 'RECONCILIATION_VISIBILITY_DELAY_ACTIVE'
            ? 'visibility_delay'
            : 'read_error';
        this.observability.verification.inc({ result: code });
      }
    }
    return work.length;
  }

  /**
   * Recovers durable PREPARED and DISPATCHING crash windows.
   *
   * @returns Recovered attempt counts.
   */
  public recoverCrashWindows(): Promise<{ readonly prepared: number; readonly unknown: number }> {
    return this.repository.recoverCrashWindows();
  }

  /**
   * Deletes one bounded terminal-attempt retention batch.
   *
   * @returns Deleted attempt count.
   */
  public cleanupRetention(): Promise<number> {
    return this.repository.cleanupTerminalAttempts(
      this.configuration.writePipeline.attemptRetentionDays,
    );
  }

  /**
   * Releases this process's undispatched queue leases during graceful shutdown.
   *
   * @returns Released lease count.
   */
  public releaseLeases(): Promise<number> {
    return this.repository.releaseWorkerLeases(this.workerId);
  }
}
