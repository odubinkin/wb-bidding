import { randomUUID } from 'node:crypto';
import {
  advisoryTransactionLock,
  upsertClusterStatisticRecord,
  withTransaction,
} from '@wb-bidder/database';
import { evidenceChecksum } from '../checksum.js';
import type { TargetSnapshotAssessment } from '../types.js';
import type {
  SourceSnapshotWrite,
  ClusterStatisticDayWrite,
  CampaignStatisticLeafWrite,
} from './types.js';
import { upsertSyncSourceSnapshot, inputJson } from './helpers.js';
import { DataSyncCampaignRepositoryBase } from './campaign.js';

/** Cohesive data-sync repository capability layer. */
export class DataSyncEvidenceRepositoryBase extends DataSyncCampaignRepositoryBase {
  /**
   * Inserts one immutable normalized source snapshot idempotently.
   *
   * @param snapshot - Source write.
   * @returns Snapshot UUID, existing or newly inserted.
   */
  public async recordSourceSnapshot(snapshot: SourceSnapshotWrite): Promise<string> {
    return upsertSyncSourceSnapshot(this.database, {
      campaignId: snapshot.campaignId ?? null,
      dataKind: snapshot.dataKind,
      endpointProfile: snapshot.endpointProfile,
      fetchedAt: snapshot.fetchedAt,
      id: randomUUID(),
      invalidReason: snapshot.invalidReason ?? null,
      normalizedData: inputJson(snapshot.normalizedData),
      sourceChecksum: snapshot.sourceChecksum,
      sourceDate:
        snapshot.sourceDate === undefined ? null : new Date(`${snapshot.sourceDate}T00:00:00.000Z`),
      syncRunId: snapshot.syncRunId,
      targetId: snapshot.targetId ?? null,
      valid: snapshot.valid,
    });
  }

  /**
   * Loads the most recent observed campaign-statistics source state.
   *
   * @param campaignId - Local campaign UUID.
   * @returns Exact source evidence or null when no response has been observed.
   */
  public async loadLatestCampaignStatisticsEvidence(campaignId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { campaignId, dataKind: 'CAMPAIGN_STATISTICS' },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Loads the latest verified target-level current-day spend source.
   *
   * @param targetId - Local target UUID.
   * @returns Exact source evidence or null when none has been observed.
   */
  public async loadLatestSameDaySpendEvidence(targetId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { dataKind: 'SAME_DAY_SPEND', targetId },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Loads the latest verified target-level cluster-statistics source.
   *
   * @param targetId - Local cluster target UUID.
   * @returns Exact source evidence or null when no verified day was observed.
   */
  public async loadLatestClusterStatisticsEvidence(targetId: string): Promise<{
    readonly fetchedAt: Date;
    readonly sourceChecksum: string;
    readonly valid: boolean;
  } | null> {
    const row = await this.database.syncSourceSnapshot.findFirst({
      orderBy: [{ fetchedAt: 'desc' }, { createdAt: 'desc' }],
      select: { fetchedAt: true, sourceChecksum: true, valid: true },
      where: { dataKind: 'CLUSTER_STATISTICS', targetId },
    });
    return row === null
      ? null
      : Object.freeze({
          fetchedAt: new Date(row.fetchedAt),
          sourceChecksum: row.sourceChecksum,
          valid: row.valid,
        });
  }

  /**
   * Persists every lowest-level app/nm row for one content version without parent-total mixing.
   *
   * @param rows - Exact normalized leaf rows from a single WB response.
   * @returns Inserted or idempotently refreshed row count.
   */
  public async upsertCampaignStatisticLeaves(
    rows: readonly CampaignStatisticLeafWrite[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    await withTransaction(this.database, async (transaction) => {
      for (const row of rows) {
        const date = new Date(`${row.statistic.date}T00:00:00.000Z`);
        await transaction.campaignStatDaily.upsert({
          create: {
            appType: row.appType,
            atbs: row.statistic.atbs,
            attributedRevenueMinor: row.statistic.attributedRevenueMinor,
            campaignId: row.campaignId,
            canceled: row.statistic.canceled ?? null,
            clicks: row.statistic.clicks,
            date,
            dimensions: { appType: row.appType },
            fetchedAt: row.fetchedAt,
            id: randomUUID(),
            nmId: row.nmId,
            normalizedAggregationKind: 'FULLSTATS_APP_NM_LEAF',
            orderedUnits: row.statistic.orderedUnits ?? null,
            orders: row.statistic.orders,
            sourceChecksum: evidenceChecksum({
              appType: row.appType,
              nmId: row.nmId,
              statistic: row.statistic,
            }),
            sourceVersion: row.sourceVersion,
            spendMinor: row.statistic.spendMinor,
            syncRunId: row.syncRunId,
            views: row.statistic.views ?? null,
            wbCampaignId: row.wbCampaignId,
          },
          update: { fetchedAt: row.fetchedAt, syncRunId: row.syncRunId },
          where: {
            wbCampaignId_nmId_date_sourceVersion_appType: {
              appType: row.appType,
              date,
              nmId: row.nmId,
              sourceVersion: row.sourceVersion,
              wbCampaignId: row.wbCampaignId,
            },
          },
        });
      }
    });
    return rows.length;
  }

  /**
   * Persists one verified cluster day and its target-scoped immutable source snapshot.
   *
   * @param row - Exact normalized cluster day.
   * @returns Local cluster target UUID.
   */
  public async upsertClusterStatisticDay(row: ClusterStatisticDayWrite): Promise<string> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(
        transaction,
        `cluster-statistic:${row.campaignId}:${row.nmId.toString()}:${row.normQueryCanonical}`,
      );
      const target = await transaction.campaignTarget.findFirst({
        select: { id: true },
        where: {
          campaignId: row.campaignId,
          nmId: row.nmId,
          normQueryCanonical: row.normQueryCanonical,
          targetKind: 'CLUSTER',
        },
      });
      const targetId = target?.id;
      if (targetId === undefined) {
        throw new Error('CLUSTER_STATISTIC_TARGET_NOT_DISCOVERED');
      }
      const normalizedData = {
        ...row.normalized,
        normQueryCanonical: row.normQueryCanonical,
        normQueryWire: row.normQueryWire,
      };
      const sourceChecksum = evidenceChecksum(normalizedData);
      const statisticDate = new Date(`${row.normalized.date}T00:00:00.000Z`);
      await upsertClusterStatisticRecord(transaction, {
        atbs: row.normalized.atbs,
        attributedRevenueMinor: row.normalized.attributedRevenueMinor,
        campaignId: row.campaignId,
        clicks: row.normalized.clicks,
        date: statisticDate,
        fetchedAt: row.fetchedAt,
        id: randomUUID(),
        nmId: row.nmId,
        normQueryCanonical: row.normQueryCanonical,
        normQueryWire: row.normQueryWire,
        orderedUnits: row.normalized.orderedUnits ?? null,
        orders: row.normalized.orders,
        runId: row.runId,
        sourceChecksum,
        spendMinor: row.normalized.spendMinor,
        views: row.normalized.views ?? null,
        wbCampaignId: row.wbCampaignId,
      });
      await upsertSyncSourceSnapshot(transaction, {
        campaignId: row.campaignId,
        dataKind: 'CLUSTER_STATISTICS',
        endpointProfile: row.profileId,
        fetchedAt: row.fetchedAt,
        id: randomUUID(),
        invalidReason: null,
        normalizedData: inputJson(normalizedData),
        sourceChecksum,
        sourceDate: statisticDate,
        syncRunId: row.runId,
        targetId,
        valid: true,
      });
      return targetId;
    });
  }

  /**
   * Persists one atomic target-level eligibility snapshot.
   *
   * @param targetId - Local target UUID.
   * @param syncRunId - Scheduler run UUID.
   * @param createdAt - Snapshot time.
   * @param assessment - Pure eligibility result.
   * @param requiredSourceVersions - Data-kind to checksum mapping.
   * @returns Snapshot UUID.
   */
  public async recordTargetSnapshot(
    targetId: string,
    syncRunId: string,
    createdAt: Date,
    assessment: TargetSnapshotAssessment,
    requiredSourceVersions: Readonly<Record<string, string>>,
  ): Promise<string> {
    const inputChecksum = evidenceChecksum({
      assessment,
      requiredSourceVersions,
      targetId,
    });
    const row = await this.database.targetDataSnapshot.upsert({
      create: {
        applyEligible: assessment.applyEligible,
        coherentRegimeChecksum: assessment.regimeChecksum,
        completenessFlags: [...assessment.flags],
        createdAt,
        id: randomUUID(),
        increaseEligible: assessment.increaseEligible,
        inputChecksum,
        oldestFetchedAt: assessment.oldestFetchedAt,
        requiredSourceVersions: inputJson(requiredSourceVersions),
        status: assessment.status,
        syncRunId,
        targetId,
      },
      update: { inputChecksum },
      where: { inputChecksum },
    });
    return row.id;
  }
}
