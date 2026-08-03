import { randomUUID } from 'node:crypto';
import {
  advisoryTransactionLock,
  upsertCardCampaignTarget,
  withTransaction,
  type DatabaseClient,
} from '@wb-bidder/database';
import { accountSettingsChecksum, validateAccountBindingTransition } from '../binding.js';
import { evidenceChecksum } from '../checksum.js';
import type { AccountBindingCandidate } from '../types.js';
import { isCampaignStatisticsEligibleStatus } from '@wb-bidder/contracts';
import type { CampaignDetailsResponse } from '@wb-bidder/wb-api';
import { BINDING_ID } from './types.js';
import type { SchedulerRunContext, SchedulerRunResult } from './types.js';
import {
  mapExistingBinding,
  hasBusinessData,
  appendAudit,
  activeCardPlacements,
  inputJson,
  safeErrorMessage,
} from './helpers.js';

/** Cohesive data-sync repository capability layer. */
export class DataSyncBindingRepositoryBase {
  /** Generated Prisma model surface. */
  protected readonly database: DatabaseClient;

  /**
   * Creates a repository over the shared Prisma Client.
   *
   * @param database - Shared Prisma Client.
   */
  public constructor(database: DatabaseClient) {
    this.database = database;
  }

  /**
   * Creates or validates the singleton account binding under a transaction lock.
   *
   * @param candidate - Identity confirmed by an authorized WB call.
   * @param correlationId - Correlation UUID for append-only audit.
   * @returns Allowed transition and binding version.
   */
  public async ensureAccountBinding(
    candidate: AccountBindingCandidate,
    correlationId: string,
  ): Promise<{ readonly transition: string; readonly version: bigint }> {
    return withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, 'deployment-account-binding');
      const stored = await transaction.deploymentAccountBinding.findUnique({
        select: {
          accountCurrency: true,
          accountSettingsChecksum: true,
          accountTimezone: true,
          bindingVersion: true,
          sellerSid: true,
          tokenAccessFingerprint: true,
          tokenCategory: true,
          tokenFor: true,
          tokenType: true,
          wbEnvironment: true,
        },
        where: { id: BINDING_ID },
      });
      const existing = stored === null ? null : mapExistingBinding(stored);
      const businessDataExists = existing === null ? await hasBusinessData(transaction) : false;
      const transition = validateAccountBindingTransition(existing, candidate, businessDataExists);
      const settingsChecksum = accountSettingsChecksum(
        candidate.accountCurrency,
        candidate.accountTimezone,
      );
      const now = new Date();
      let version: bigint;
      if (transition === 'CREATE') {
        version = 1n;
        await transaction.deploymentAccountBinding.create({
          data: {
            accountCurrency: candidate.accountCurrency,
            accountSettingsChecksum: settingsChecksum,
            accountSettingsSource: 'ENV_OPERATOR_PROVISIONED',
            accountTimezone: candidate.accountTimezone,
            bindingVersion: version,
            id: BINDING_ID,
            initializedAt: now,
            lastValidatedAt: now,
            sellerSid: candidate.sellerSid,
            tokenAccessFingerprint: candidate.tokenFingerprint,
            tokenCategory: candidate.tokenCategory,
            tokenFor: candidate.tokenFor,
            tokenType: candidate.tokenType,
            wbEnvironment: candidate.environment,
          },
        });
      } else {
        const changesIdentityToken = transition === 'ROTATE' || transition === 'UPGRADE';
        version = (existing?.bindingVersion ?? 0n) + (changesIdentityToken ? 1n : 0n);
        await transaction.deploymentAccountBinding.update({
          data: {
            bindingVersion: version,
            lastValidatedAt: now,
            tokenAccessFingerprint: candidate.tokenFingerprint,
            tokenFor: candidate.tokenFor,
            tokenType: candidate.tokenType,
          },
          where: { id: BINDING_ID },
        });
      }
      await appendAudit(transaction, {
        action: `ACCOUNT_BINDING_${transition}`,
        actor: 'SYSTEM',
        after: {
          bindingVersion: version.toString(),
          environment: candidate.environment,
          sellerSid: candidate.sellerSid,
          tokenType: candidate.tokenType,
        },
        correlationId,
        entityId: BINDING_ID,
        entityType: 'DeploymentAccountBinding',
      });
      return Object.freeze({ transition, version });
    });
  }

  /**
   * Runs one job under a session advisory lock and persisted deadline.
   *
   * @template T - Worker result.
   * @param jobType - Stable job identity.
   * @param deadlineMs - Positive run deadline.
   * @param worker - Job body.
   * @returns Started flag and worker result.
   */
  public async withSchedulerRun<T>(
    jobType: string,
    deadlineMs: number,
    worker: (context: SchedulerRunContext) => Promise<T>,
  ): Promise<SchedulerRunResult<T>> {
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
      throw new Error('Scheduler deadline must be a positive integer');
    }
    const runId = randomUUID();
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + deadlineMs);
    const claimed = await withTransaction(this.database, async (transaction) => {
      await advisoryTransactionLock(transaction, `scheduler:${jobType}`);
      const active = await transaction.schedulerRun.findFirst({
        select: { id: true },
        where: {
          deadlineAt: { gt: startedAt },
          jobType,
          status: 'RUNNING',
        },
      });
      if (active !== null) return false;
      await transaction.schedulerRun.create({
        data: {
          counters: {},
          deadlineAt,
          id: runId,
          jobType,
          leaseOwner: `pid:${String(process.pid)}`,
          leaseUntil: deadlineAt,
          startedAt,
          status: 'RUNNING',
        },
      });
      return true;
    });
    if (!claimed) return Object.freeze({ started: false });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('Scheduler run deadline exceeded'));
    }, deadlineMs);
    try {
      const result = await worker(Object.freeze({ deadlineAt, runId, signal: controller.signal }));
      const deadlineExceeded = controller.signal.aborted || Date.now() > deadlineAt.getTime();
      await this.database.schedulerRun.update({
        data: {
          endedAt: new Date(),
          leaseUntil: null,
          status: deadlineExceeded ? 'DEADLINE_EXCEEDED' : 'SUCCEEDED',
        },
        where: { id: runId },
      });
      return Object.freeze({ result, runId, started: true });
    } catch (error: unknown) {
      await this.database.schedulerRun.update({
        data: {
          endedAt: new Date(),
          errorSummary: { code: 'JOB_FAILED', message: safeErrorMessage(error) },
          leaseUntil: null,
          status: controller.signal.aborted ? 'DEADLINE_EXCEEDED' : 'FAILED',
        },
        where: { id: runId },
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Upserts validated campaign details, card targets, and current-bid observations atomically.
   *
   * @param details - Runtime-validated WB response.
   * @param fetchedAt - Observation time.
   * @param syncRunId - Scheduler run UUID.
   * @param externalWriteControlMode - External-write provenance guarantee.
   * @returns Number of campaigns and card targets processed.
   */
  public async upsertCampaignDetails(
    details: CampaignDetailsResponse,
    fetchedAt: Date,
    syncRunId: string,
    externalWriteControlMode: 'EXCLUSIVE' | 'SHARED',
  ): Promise<{ readonly campaigns: number; readonly targets: number }> {
    let targetCount = 0;
    await withTransaction(this.database, async (transaction) => {
      for (const campaign of details.adverts) {
        const detailsChecksum = evidenceChecksum(campaign);
        const supported = isCampaignStatisticsEligibleStatus(campaign.status);
        const storedCampaign = await transaction.campaign.upsert({
          create: {
            bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
            detailsChecksum,
            detailsFetchedAt: fetchedAt,
            detailsSyncRunId: syncRunId,
            id: randomUUID(),
            lastSyncedAt: fetchedAt,
            name: campaign.settings.name,
            paymentType: campaign.settings.payment_type.toUpperCase() as 'CPC' | 'CPM' | 'UNKNOWN',
            status: campaign.status,
            supported,
            type: 9,
            unsupportedReason: supported
              ? null
              : campaign.status === 4
                ? 'CAMPAIGN_NOT_RUNNING'
                : 'UNSUPPORTED_CAMPAIGN',
            wbCampaignId: BigInt(campaign.id),
          },
          update: {
            bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
            detailsChecksum,
            detailsFetchedAt: fetchedAt,
            detailsSyncRunId: syncRunId,
            lastSyncedAt: fetchedAt,
            name: campaign.settings.name,
            paymentType: campaign.settings.payment_type.toUpperCase() as 'CPC' | 'CPM' | 'UNKNOWN',
            status: campaign.status,
            supported,
            unsupportedReason: supported
              ? null
              : campaign.status === 4
                ? 'CAMPAIGN_NOT_RUNNING'
                : 'UNSUPPORTED_CAMPAIGN',
          },
          where: { wbCampaignId: BigInt(campaign.id) },
        });
        const campaignId = storedCampaign.id;
        for (const nm of campaign.nm_settings) {
          const placements = activeCardPlacements(campaign.settings.placements);
          for (const placement of placements) {
            const bidMinor =
              placement === 'SEARCH' ? nm.bids_kopecks.search : nm.bids_kopecks.recommendations;
            const bidChecksum = evidenceChecksum({
              bidMinor,
              detailsChecksum,
              placement,
            });
            const targetId = await upsertCardCampaignTarget(transaction, {
              bidChecksum,
              bidMinor: BigInt(bidMinor),
              campaignId,
              fetchedAt,
              id: randomUUID(),
              nmId: BigInt(nm.nm_id),
              placement,
              syncRunId,
            });
            const configurationChecksum = evidenceChecksum({
              bidType: campaign.bid_type,
              paymentType: campaign.settings.payment_type,
              placements: campaign.settings.placements,
              status: campaign.status,
            });
            await transaction.bidStateObservation.upsert({
              create: {
                activePlacementConfig: inputJson(campaign.settings.placements),
                bidType: campaign.bid_type.toUpperCase() as 'MANUAL' | 'UNIFIED' | 'UNKNOWN',
                campaignStatus: campaign.status,
                changeMarkerObserved: externalWriteControlMode === 'EXCLUSIVE',
                configurationChecksum,
                currentBidMinor: BigInt(bidMinor),
                externalWriteControlMode,
                id: randomUUID(),
                observedAt: fetchedAt,
                paymentType: campaign.settings.payment_type.toUpperCase() as
                  'CPC' | 'CPM' | 'UNKNOWN',
                syncRunId,
                targetId,
              },
              update: {},
              where: {
                targetId_observedAt_configurationChecksum: {
                  configurationChecksum,
                  observedAt: fetchedAt,
                  targetId,
                },
              },
            });
            targetCount += 1;
          }
        }
      }
    });
    return Object.freeze({ campaigns: details.adverts.length, targets: targetCount });
  }
}
