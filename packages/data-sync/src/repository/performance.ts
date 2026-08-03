import { randomUUID } from 'node:crypto';
import {
  advisoryTransactionLock,
  loadDataSyncPerformanceCandidates,
  withTransaction,
} from '@wb-bidder/database';
import { assessPerformanceDay } from '../evidence.js';
import type { PerformanceDayAssessment, PerformanceDayCandidate, SyncDataKind } from '../types.js';
import type { PerformanceFinalizationConfiguration } from './types.js';
import { inputJson, maximumObservationGap } from './helpers.js';
import { DataSyncEvidenceRepositoryBase } from './evidence.js';

/** Cohesive data-sync repository capability layer. */
export class DataSyncPerformanceRepositoryBase extends DataSyncEvidenceRepositoryBase {
  /**
   * Materializes immutable performance-day versions from the newest exact leaf aggregation.
   *
   * The query selects one content version, appType leaves only, deterministic day-boundary bid
   * observations, and the first stable read sequence. This keeps work bounded by the campaign page
   * and prevents later probes with unchanged content from churning a finalized checksum.
   *
   * @param campaignId - Local campaign UUID.
   * @param configuration - Validated finalization policy.
   * @param assessedAt - Stable scheduler instant.
   * @returns Lifecycle counters.
   */
  public async finalizePerformanceDaysForCampaign(
    campaignId: string,
    configuration: PerformanceFinalizationConfiguration,
    assessedAt: Date,
  ): Promise<{
    readonly draft: number;
    readonly finalized: number;
    readonly invalid: number;
    readonly superseded: number;
  }> {
    const rows = await loadDataSyncPerformanceCandidates(this.database, {
      campaignId,
      conversionLagDays: configuration.conversionLagDays,
      stableMinutes: configuration.dayFinalizationStableMinutes,
      stableReads: configuration.dayFinalizationStableReads,
    });
    let draft = 0;
    let finalized = 0;
    let invalid = 0;
    let superseded = 0;
    for (const row of rows) {
      const date = row.date;
      const dayStartedAt = new Date(`${date}T00:00:00.000Z`);
      const dayEndedAt = new Date(dayStartedAt.getTime() + 86_400_000);
      const bidStates = Object.freeze(
        row.bidStates.map((item) =>
          Object.freeze({
            changeMarkerObserved: item.changeMarkerObserved,
            configurationChecksum: item.configurationChecksum,
            currentBidMinor: item.currentBidMinor === null ? null : BigInt(item.currentBidMinor),
            observedAt: new Date(item.observedAt),
          }),
        ),
      );
      const sourceReads = Object.freeze(
        row.sourceReads.map((item) =>
          Object.freeze({
            checksum: item.checksum,
            fetchedAt: new Date(item.fetchedAt),
          }),
        ),
      );
      const candidate: PerformanceDayCandidate = Object.freeze({
        assessedAt,
        attributionUnambiguous: row.bidType === 'UNIFIED' || row.placementCount === 1,
        bidStates,
        campaignTrafficEligible:
          row.bidStates.length > 0 &&
          row.bidStates.every((item) => item.campaignStatus === 9 || item.campaignStatus === 11),
        conversionCutoff: new Date(
          dayEndedAt.getTime() + configuration.conversionLagDays * 86_400_000,
        ),
        dayEndedAt,
        dayStartedAt,
        externalWriteControlMode: configuration.externalWriteControlMode,
        moneyContractValid: true,
        preEnrollment:
          row.enrolledAt === null || new Date(row.enrolledAt).getTime() > dayStartedAt.getTime(),
        sourceReads,
        statistic: Object.freeze({
          atbs: BigInt(row.atbs),
          attributedRevenueMinor: BigInt(row.attributedRevenueMinor),
          clicks: BigInt(row.clicks),
          date,
          orderedUnits: row.orderedUnits === null ? null : BigInt(row.orderedUnits),
          orders: BigInt(row.orders),
          spendMinor: BigInt(row.spendMinor),
          views: row.views === null ? null : BigInt(row.views),
        }),
      });
      const assessment = assessPerformanceDay(candidate, {
        maxObservationGapMinutes: configuration.bidStateMaxObservationGapMinutes,
        minimumStableMinutes: configuration.dayFinalizationStableMinutes,
        minimumStableReads: configuration.dayFinalizationStableReads,
      });
      const persisted = await this.persistPerformanceDay(
        row.targetId,
        candidate,
        assessment,
        assessedAt,
      );
      if (persisted.superseded) superseded += 1;
      if (assessment.status === 'FINALIZED') finalized += 1;
      else if (assessment.status === 'DRAFT') draft += 1;
      else invalid += 1;
    }
    return Object.freeze({ draft, finalized, invalid, superseded });
  }

  /**
   * Inserts a performance-day version and atomically supersedes a changed finalized version.
   *
   * @param targetId - Local target UUID.
   * @param candidate - Full normalized evidence.
   * @param assessment - Pure finalization assessment.
   * @param finalizedAt - Finalization time.
   * @returns Persisted row UUID and whether a prior finalized row was superseded.
   */
  public async persistPerformanceDay(
    targetId: string,
    candidate: PerformanceDayCandidate,
    assessment: PerformanceDayAssessment,
    finalizedAt: Date,
  ): Promise<{ readonly id: string; readonly superseded: boolean }> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `performance-day:${targetId}:${candidate.statistic.date}`,
      );
      const statisticDate = new Date(`${candidate.statistic.date}T00:00:00.000Z`);
      const existing = await transaction.bidPerformanceDay.findMany({
        select: { id: true, inputChecksum: true, status: true },
        where: { targetId, wbStatisticDate: statisticDate },
      });
      const current = existing.find((row) => row.status === 'FINALIZED');
      const matching = existing.find((row) => row.inputChecksum === assessment.inputChecksum);
      if (
        current !== undefined &&
        matching?.id === current.id &&
        current.status === assessment.status
      ) {
        return Object.freeze({ id: current.id, superseded: false });
      }
      const superseded = current !== undefined && current.id !== matching?.id;
      if (current !== undefined && current.id !== matching?.id) {
        await transaction.bidPerformanceDay.update({
          data: { status: 'SUPERSEDED', supersededAt: finalizedAt },
          where: { id: current.id },
        });
      }
      if (matching !== undefined) {
        await transaction.bidPerformanceDay.update({
          data: {
            qualityFlags: [...assessment.qualityFlags],
            statisticsFinalizedAt: assessment.status === 'FINALIZED' ? finalizedAt : null,
            status: assessment.status,
            supersededAt: null,
          },
          where: { id: matching.id },
        });
        return Object.freeze({ id: matching.id, superseded });
      }
      const id = randomUUID();
      const firstObservation = [...candidate.bidStates].sort(
        (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
      )[0];
      const lastObservation = [...candidate.bidStates].sort(
        (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
      )[0];
      const maxGap = maximumObservationGap(candidate);
      const target = await transaction.campaignTarget.findUnique({
        select: { campaign: { select: { bidType: true, paymentType: true, status: true } } },
        where: { id: targetId },
      });
      if (target === null) throw new Error('PERFORMANCE_DAY_TARGET_NOT_FOUND');
      await transaction.bidPerformanceDay.create({
        data: {
          activePlacementConfig: {
            configurationChecksum: firstObservation?.configurationChecksum ?? null,
          },
          atbsDelta: candidate.statistic.atbs,
          attributedRevenueDelta: candidate.statistic.attributedRevenueMinor,
          bidType: target.campaign.bidType,
          campaignStatus: target.campaign.status,
          changeMarkerCoverage:
            candidate.externalWriteControlMode === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'OBSERVED',
          clicksDelta: candidate.statistic.clicks,
          confirmedBidMinor: assessment.confirmedBidMinor,
          conversionLagDays: 1,
          coverageEndedAt: lastObservation?.observedAt ?? candidate.dayEndedAt,
          coverageStartedAt: firstObservation?.observedAt ?? candidate.dayStartedAt,
          externalWriteControl: candidate.externalWriteControlMode,
          id,
          inputChecksum: assessment.inputChecksum,
          maxObservedGapMinutes: maxGap,
          orderedUnitsDelta: candidate.statistic.orderedUnits ?? 0n,
          orderedUnitsSource: 'SHKS',
          ordersDelta: candidate.statistic.orders,
          paymentType: target.campaign.paymentType,
          placementBidState: {},
          qualityFlags: [...assessment.qualityFlags],
          sourceSnapshotReferences: inputJson(candidate.sourceReads),
          spendDeltaMinor: candidate.statistic.spendMinor,
          statisticalDayProfile: 'wb-statistical-day-v1',
          statisticsFinalizedAt: assessment.status === 'FINALIZED' ? finalizedAt : null,
          status: assessment.status,
          targetId,
          viewsDelta: candidate.statistic.views,
          wbStatisticDate: statisticDate,
        },
      });
      return Object.freeze({ id, superseded });
    });
  }

  /**
   * Upserts a quota-aware full-pass checkpoint.
   *
   * @param dataKind - Independent cursor identity.
   * @param cursor - JSON-compatible cursor.
   * @param now - Update time.
   * @param processedCount - Monotonic processed count for this pass.
   * @param totalEstimate - Optional total cardinality.
   * @param passCompleted - Whether the cursor completed a full pass.
   * @returns Nothing.
   */
  public async saveCheckpoint(
    dataKind: SyncDataKind,
    cursor: unknown,
    now: Date,
    processedCount: bigint,
    totalEstimate: bigint | null,
    passCompleted: boolean,
  ): Promise<void> {
    await this.database.syncCheckpoint.upsert({
      create: {
        cursor: inputJson(cursor),
        dataKind,
        fullPassCompletedAt: passCompleted ? now : null,
        fullPassStartedAt: now,
        lastSuccessAt: now,
        processedCount,
        totalEstimate,
        updatedAt: now,
      },
      update: {
        cursor: inputJson(cursor),
        ...(passCompleted ? { fullPassCompletedAt: now } : {}),
        lastSuccessAt: now,
        processedCount,
        totalEstimate,
        updatedAt: now,
      },
      where: { dataKind },
    });
  }
}
