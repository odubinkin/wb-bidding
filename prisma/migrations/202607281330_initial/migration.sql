-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WbEnvironment" AS ENUM ('MOCK', 'SANDBOX', 'PROD');

-- CreateEnum
CREATE TYPE "WbTokenType" AS ENUM ('BASE', 'PERSONAL', 'TEST');

-- CreateEnum
CREATE TYPE "CampaignBidType" AS ENUM ('MANUAL', 'UNIFIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CampaignPaymentType" AS ENUM ('CPM', 'CPC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CampaignTargetKind" AS ENUM ('CARD', 'CLUSTER');

-- CreateEnum
CREATE TYPE "CampaignPlacement" AS ENUM ('COMBINED', 'SEARCH', 'RECOMMENDATIONS');

-- CreateEnum
CREATE TYPE "ClusterBidState" AS ENUM ('EXPLICIT', 'ABSENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PerformanceDayStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED', 'INVALID');

-- CreateEnum
CREATE TYPE "ExternalWriteControlMode" AS ENUM ('EXCLUSIVE', 'SHARED');

-- CreateEnum
CREATE TYPE "ProductEconomicsSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'VALIDATED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('DEPLOYMENT', 'CAMPAIGN', 'TARGET');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('APPLY', 'OBSERVE_ONLY');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('NO_CHANGE', 'INCREASE', 'DECREASE', 'RESTORE_ABSENT_OVERRIDE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING', 'ACCEPTED', 'REVERTED', 'REVERT_CONSTRAINED', 'FAILED', 'FAILED_REVERT_BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DecisionQueueStatus" AS ENUM ('QUEUED', 'LEASED', 'SENT', 'VERIFY_WAIT', 'RETRY_WAIT', 'APPLIED', 'FAILED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WriteAttemptStatus" AS ENUM ('PREPARED', 'DISPATCHING', 'ACCEPTED', 'REJECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WriteAction" AS ENUM ('SET', 'DELETE');

-- CreateEnum
CREATE TYPE "DesiredBidState" AS ENUM ('EXPLICIT', 'ABSENT');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "SchedulerRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'DEADLINE_EXCEEDED');

-- CreateTable
CREATE TABLE "DeploymentAccountBinding" (
    "id" UUID NOT NULL,
    "sellerSid" TEXT NOT NULL,
    "wbEnvironment" "WbEnvironment" NOT NULL,
    "tokenType" "WbTokenType" NOT NULL,
    "tokenCategory" TEXT NOT NULL,
    "tokenAccessFingerprint" TEXT NOT NULL,
    "accountCurrency" CHAR(3) NOT NULL,
    "accountTimezone" TEXT NOT NULL,
    "accountSettingsSource" TEXT NOT NULL,
    "accountSettingsChecksum" CHAR(64) NOT NULL,
    "initializedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastValidatedAt" TIMESTAMPTZ(3) NOT NULL,
    "bindingVersion" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "DeploymentAccountBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "wbCampaignId" BIGINT NOT NULL,
    "type" INTEGER NOT NULL,
    "status" INTEGER NOT NULL,
    "bidType" "CampaignBidType" NOT NULL,
    "paymentType" "CampaignPaymentType" NOT NULL,
    "name" TEXT NOT NULL,
    "wbChangedAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3) NOT NULL,
    "supported" BOOLEAN NOT NULL,
    "unsupportedReason" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTarget" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "nmId" BIGINT NOT NULL,
    "targetKind" "CampaignTargetKind" NOT NULL,
    "placement" "CampaignPlacement" NOT NULL,
    "normQueryWire" TEXT,
    "normQueryCanonical" TEXT,
    "currentBidMinor" BIGINT,
    "minimumBidMinor" BIGINT,
    "clusterBidState" "ClusterBidState",
    "clusterBidContractVersion" TEXT,
    "lastConfirmedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CampaignTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignStatDaily" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "wbCampaignId" BIGINT NOT NULL,
    "nmId" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "placement" "CampaignPlacement",
    "normQueryWire" TEXT,
    "normQueryCanonical" TEXT,
    "appType" INTEGER,
    "dimensions" JSONB NOT NULL,
    "views" BIGINT,
    "clicks" BIGINT NOT NULL,
    "atbs" BIGINT NOT NULL,
    "orders" BIGINT NOT NULL,
    "orderedUnits" BIGINT,
    "canceled" BIGINT,
    "spendMinor" BIGINT NOT NULL,
    "attributedRevenueMinor" BIGINT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceChecksum" CHAR(64) NOT NULL,
    "syncRunId" UUID NOT NULL,
    "normalizedAggregationKind" TEXT NOT NULL,

    CONSTRAINT "CampaignStatDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPerformanceDay" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "wbStatisticDate" DATE NOT NULL,
    "statisticalDayProfile" TEXT NOT NULL,
    "confirmedBidMinor" BIGINT,
    "placementBidState" JSONB NOT NULL,
    "campaignStatus" INTEGER NOT NULL,
    "paymentType" "CampaignPaymentType" NOT NULL,
    "bidType" "CampaignBidType" NOT NULL,
    "activePlacementConfig" JSONB NOT NULL,
    "viewsDelta" BIGINT,
    "clicksDelta" BIGINT NOT NULL,
    "atbsDelta" BIGINT NOT NULL,
    "ordersDelta" BIGINT NOT NULL,
    "orderedUnitsDelta" BIGINT NOT NULL,
    "spendDeltaMinor" BIGINT NOT NULL,
    "attributedRevenueDelta" BIGINT NOT NULL,
    "orderedUnitsSource" TEXT NOT NULL DEFAULT 'SHKS',
    "coverageStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "coverageEndedAt" TIMESTAMPTZ(3) NOT NULL,
    "maxObservedGapMinutes" INTEGER NOT NULL,
    "externalWriteControl" "ExternalWriteControlMode" NOT NULL,
    "changeMarkerCoverage" TEXT NOT NULL,
    "sourceSnapshotReferences" JSONB NOT NULL,
    "statisticsFinalizedAt" TIMESTAMPTZ(3),
    "conversionLagDays" INTEGER NOT NULL,
    "status" "PerformanceDayStatus" NOT NULL,
    "supersededAt" TIMESTAMPTZ(3),
    "qualityFlags" TEXT[],
    "inputChecksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidPerformanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEconomics" (
    "id" UUID NOT NULL,
    "nmId" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "expectedContributionBeforeAdsMinor" BIGINT NOT NULL,
    "source" "ProductEconomicsSource" NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "sourceReference" TEXT,
    "version" BIGINT NOT NULL,
    "mutationKey" TEXT NOT NULL,
    "inputChecksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActor" TEXT NOT NULL,

    CONSTRAINT "ProductEconomics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEconomicsImport" (
    "id" UUID NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "idempotencyScope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestChecksum" CHAR(64) NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "validatedItems" INTEGER NOT NULL DEFAULT 0,
    "succeededItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdByActor" TEXT NOT NULL,
    "correlationId" UUID NOT NULL,

    CONSTRAINT "ProductEconomicsImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEconomicsImportItem" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "rowId" TEXT NOT NULL,
    "nmId" BIGINT NOT NULL,
    "normalizedInput" JSONB NOT NULL,
    "rowChecksum" CHAR(64) NOT NULL,
    "status" "ImportItemStatus" NOT NULL,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "expectedCurrentVersion" BIGINT NOT NULL,
    "actualCurrentVersion" BIGINT,
    "createdVersion" BIGINT,

    CONSTRAINT "ProductEconomicsImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiddingPolicy" (
    "id" UUID NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "campaignId" UUID,
    "targetId" UUID,
    "executionMode" "ExecutionMode" NOT NULL,
    "configuration" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" BIGINT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "inputChecksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActor" TEXT NOT NULL,

    CONSTRAINT "BiddingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "productEconomicsId" UUID NOT NULL,
    "productEconomicsVersion" BIGINT NOT NULL,
    "expectedContributionBeforeAdsMinor" BIGINT NOT NULL,
    "policyId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "candidateEstimates" JSONB NOT NULL,
    "completenessFlags" TEXT[],
    "inputSnapshotChecksum" CHAR(64) NOT NULL,
    "inputSnapshotSchema" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidDecision" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "currentBidMinor" BIGINT,
    "proposedBidMinor" BIGINT,
    "boundedBidMinor" BIGINT,
    "strategyReasonCode" TEXT NOT NULL,
    "outcomeReasonCode" TEXT NOT NULL,
    "guardrailCodes" TEXT[],
    "explanation" JSONB NOT NULL,
    "metricSnapshotId" UUID NOT NULL,
    "policyVersion" BIGINT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "decisionInputChecksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidExperiment" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "status" "ExperimentStatus" NOT NULL,
    "sourceBidMinor" BIGINT NOT NULL,
    "experimentBidMinor" BIGINT NOT NULL,
    "desiredRevertBidMinor" BIGINT NOT NULL,
    "actualRevertBidMinor" BIGINT,
    "plannedFullDays" INTEGER NOT NULL,
    "collectedEligibleDays" INTEGER NOT NULL DEFAULT 0,
    "spendLimitMinor" BIGINT NOT NULL,
    "spendSafetyBufferMinor" BIGINT NOT NULL,
    "observedExperimentSpendMinor" BIGINT NOT NULL DEFAULT 0,
    "reservedUnobservedSpendMinor" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3),
    "firstEligibleDate" DATE,
    "lastEligibleDate" DATE,
    "evaluationNotBefore" TIMESTAMPTZ(3),
    "policyVersion" BIGINT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "experimentReasonCode" TEXT NOT NULL,
    "terminalReasonCode" TEXT,
    "resultDecisionId" UUID,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BidExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionQueueItem" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "status" "DecisionQueueStatus" NOT NULL,
    "priority" INTEGER NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verificationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorClass" TEXT,
    "lastErrorCode" TEXT,
    "lastHttpStatus" INTEGER,
    "sentAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DecisionQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbWriteAttempt" (
    "id" UUID NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "correlationId" UUID NOT NULL,
    "wbRequestId" TEXT,
    "requestChecksum" CHAR(64) NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "status" "WriteAttemptStatus" NOT NULL,
    "preparedAt" TIMESTAMPTZ(3) NOT NULL,
    "dispatchCommittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "latencyMs" INTEGER,
    "preWriteReadAt" TIMESTAMPTZ(3),
    "preWriteStateChecksum" CHAR(64),
    "preWriteSourceMarker" TEXT,
    "httpStatus" INTEGER,
    "rateLimitHeaders" JSONB,
    "requestDigest" JSONB NOT NULL,
    "responseDigest" JSONB,
    "errorClass" TEXT,
    "errorCode" TEXT,

    CONSTRAINT "WbWriteAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbWriteAttemptItem" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "requestIndex" INTEGER NOT NULL,
    "endpointTargetKey" TEXT NOT NULL,
    "action" "WriteAction" NOT NULL,
    "desiredBidState" "DesiredBidState" NOT NULL,
    "sentBidMinor" BIGINT,
    "wireBidRaw" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "WriteAttemptStatus" NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "responseFragmentHash" TEXT,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL,
    "reconciledAt" TIMESTAMPTZ(3),

    CONSTRAINT "WbWriteAttemptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "correlationId" UUID NOT NULL,
    "causationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerRun" (
    "id" UUID NOT NULL,
    "jobType" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "deadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "SchedulerRunStatus" NOT NULL,
    "counters" JSONB NOT NULL,
    "checkpoint" JSONB,
    "errorSummary" JSONB,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),

    CONSTRAINT "SchedulerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestChecksum" CHAR(64) NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseHeaders" JSONB NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentAccountBinding_sellerSid_wbEnvironment_key" ON "DeploymentAccountBinding"("sellerSid", "wbEnvironment");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_wbCampaignId_key" ON "Campaign"("wbCampaignId");

-- CreateIndex
CREATE INDEX "Campaign_status_supported_idx" ON "Campaign"("status", "supported");

-- CreateIndex
CREATE INDEX "CampaignTarget_campaignId_nmId_targetKind_placement_idx" ON "CampaignTarget"("campaignId", "nmId", "targetKind", "placement");

-- CreateIndex
CREATE INDEX "CampaignTarget_lastConfirmedAt_idx" ON "CampaignTarget"("lastConfirmedAt");

-- CreateIndex
CREATE INDEX "CampaignStatDaily_campaignId_date_idx" ON "CampaignStatDaily"("campaignId", "date");

-- CreateIndex
CREATE INDEX "CampaignStatDaily_syncRunId_idx" ON "CampaignStatDaily"("syncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignStatDaily_wbCampaignId_nmId_date_sourceChecksum_key" ON "CampaignStatDaily"("wbCampaignId", "nmId", "date", "sourceChecksum");

-- CreateIndex
CREATE INDEX "BidPerformanceDay_targetId_wbStatisticDate_status_idx" ON "BidPerformanceDay"("targetId", "wbStatisticDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BidPerformanceDay_targetId_wbStatisticDate_inputChecksum_key" ON "BidPerformanceDay"("targetId", "wbStatisticDate", "inputChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEconomics_mutationKey_key" ON "ProductEconomics"("mutationKey");

-- CreateIndex
CREATE INDEX "ProductEconomics_nmId_effectiveFrom_effectiveTo_idx" ON "ProductEconomics"("nmId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEconomics_nmId_version_key" ON "ProductEconomics"("nmId", "version");

-- CreateIndex
CREATE INDEX "ProductEconomicsImport_status_createdAt_idx" ON "ProductEconomicsImport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEconomicsImport_idempotencyScope_idempotencyKey_key" ON "ProductEconomicsImport"("idempotencyScope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductEconomicsImportItem_importId_status_idx" ON "ProductEconomicsImportItem"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEconomicsImportItem_importId_rowId_key" ON "ProductEconomicsImportItem"("importId", "rowId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEconomicsImportItem_importId_nmId_key" ON "ProductEconomicsImportItem"("importId", "nmId");

-- CreateIndex
CREATE INDEX "BiddingPolicy_scope_campaignId_targetId_validFrom_validTo_idx" ON "BiddingPolicy"("scope", "campaignId", "targetId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "BiddingPolicy_scope_campaignId_targetId_version_key" ON "BiddingPolicy"("scope", "campaignId", "targetId", "version");

-- CreateIndex
CREATE INDEX "MetricSnapshot_targetId_calculatedAt_idx" ON "MetricSnapshot"("targetId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_targetId_inputSnapshotChecksum_key" ON "MetricSnapshot"("targetId", "inputSnapshotChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "BidDecision_decisionInputChecksum_key" ON "BidDecision"("decisionInputChecksum");

-- CreateIndex
CREATE INDEX "BidDecision_targetId_createdAt_idx" ON "BidDecision"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "BidExperiment_targetId_status_idx" ON "BidExperiment"("targetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionQueueItem_decisionId_key" ON "DecisionQueueItem"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionQueueItem_status_availableAt_priority_idx" ON "DecisionQueueItem"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "DecisionQueueItem_leaseUntil_idx" ON "DecisionQueueItem"("leaseUntil");

-- CreateIndex
CREATE INDEX "WbWriteAttempt_status_preparedAt_idx" ON "WbWriteAttempt"("status", "preparedAt");

-- CreateIndex
CREATE INDEX "WbWriteAttemptItem_reconciliationStatus_reconciledAt_idx" ON "WbWriteAttemptItem"("reconciliationStatus", "reconciledAt");

-- CreateIndex
CREATE UNIQUE INDEX "WbWriteAttemptItem_attemptId_decisionId_key" ON "WbWriteAttemptItem"("attemptId", "decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "WbWriteAttemptItem_decisionId_attemptNumber_key" ON "WbWriteAttemptItem"("decisionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "SchedulerRun_jobType_status_startedAt_idx" ON "SchedulerRun"("jobType", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_idempotencyKey_key" ON "IdempotencyRecord"("scope", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStatDaily" ADD CONSTRAINT "CampaignStatDaily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPerformanceDay" ADD CONSTRAINT "BidPerformanceDay_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEconomicsImportItem" ADD CONSTRAINT "ProductEconomicsImportItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProductEconomicsImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiddingPolicy" ADD CONSTRAINT "BiddingPolicy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiddingPolicy" ADD CONSTRAINT "BiddingPolicy_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_productEconomicsId_fkey" FOREIGN KEY ("productEconomicsId") REFERENCES "ProductEconomics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "BiddingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDecision" ADD CONSTRAINT "BidDecision_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDecision" ADD CONSTRAINT "BidDecision_metricSnapshotId_fkey" FOREIGN KEY ("metricSnapshotId") REFERENCES "MetricSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidExperiment" ADD CONSTRAINT "BidExperiment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionQueueItem" ADD CONSTRAINT "DecisionQueueItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "BidDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbWriteAttemptItem" ADD CONSTRAINT "WbWriteAttemptItem_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "WbWriteAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbWriteAttemptItem" ADD CONSTRAINT "WbWriteAttemptItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "BidDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Production invariants that Prisma cannot express in the schema language.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX "DeploymentAccountBinding_singleton_key"
ON "DeploymentAccountBinding" ((true));

CREATE UNIQUE INDEX "CampaignTarget_card_natural_key"
ON "CampaignTarget" ("campaignId", "nmId", "placement")
WHERE "targetKind" = 'CARD';

CREATE UNIQUE INDEX "CampaignTarget_cluster_natural_key"
ON "CampaignTarget" ("campaignId", "nmId", "placement", "normQueryCanonical")
WHERE "targetKind" = 'CLUSTER';

ALTER TABLE "CampaignTarget"
ADD CONSTRAINT "CampaignTarget_kind_fields_check"
CHECK (
  (
    "targetKind" = 'CARD'
    AND "normQueryWire" IS NULL
    AND "normQueryCanonical" IS NULL
    AND "currentBidMinor" IS NOT NULL
    AND "clusterBidState" IS NULL
  )
  OR
  (
    "targetKind" = 'CLUSTER'
    AND "normQueryWire" IS NOT NULL
    AND length("normQueryWire") > 0
    AND "normQueryCanonical" IS NOT NULL
    AND length("normQueryCanonical") > 0
    AND "clusterBidState" IS NOT NULL
    AND (
      ("clusterBidState" = 'EXPLICIT' AND "currentBidMinor" IS NOT NULL)
      OR
      ("clusterBidState" IN ('ABSENT', 'UNKNOWN') AND "currentBidMinor" IS NULL)
    )
  )
);

CREATE UNIQUE INDEX "BidPerformanceDay_current_finalized_key"
ON "BidPerformanceDay" ("targetId", "wbStatisticDate")
WHERE "status" = 'FINALIZED';

ALTER TABLE "ProductEconomics"
ADD CONSTRAINT "ProductEconomics_period_order_check"
CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "ProductEconomics"
ADD CONSTRAINT "ProductEconomics_no_overlapping_periods"
EXCLUDE USING gist (
  "nmId" WITH =,
  tstzrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamptz), '[)') WITH &&
);

ALTER TABLE "ProductEconomicsImport"
ADD CONSTRAINT "ProductEconomicsImport_counter_invariant"
CHECK (
  "processedItems" = "validatedItems" + "succeededItems" + "failedItems"
  AND "processedItems" <= "totalItems"
  AND "validatedItems" >= 0
  AND "succeededItems" >= 0
  AND "failedItems" >= 0
);

CREATE UNIQUE INDEX "ProductEconomicsImport_one_processing"
ON "ProductEconomicsImport" ((true))
WHERE "status" = 'PROCESSING';

CREATE UNIQUE INDEX "BidExperiment_one_non_terminal_per_target"
ON "BidExperiment" ("targetId")
WHERE "status" IN ('PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING');

ALTER TABLE "BiddingPolicy"
ADD CONSTRAINT "BiddingPolicy_scope_reference_check"
CHECK (
  ("scope" = 'DEPLOYMENT' AND "campaignId" IS NULL AND "targetId" IS NULL)
  OR ("scope" = 'CAMPAIGN' AND "campaignId" IS NOT NULL AND "targetId" IS NULL)
  OR ("scope" = 'TARGET' AND "campaignId" IS NULL AND "targetId" IS NOT NULL)
);

ALTER TABLE "WbWriteAttemptItem"
ADD CONSTRAINT "WbWriteAttemptItem_action_state_check"
CHECK (
  (
    "action" = 'SET'
    AND "desiredBidState" = 'EXPLICIT'
    AND "sentBidMinor" IS NOT NULL
    AND length("wireBidRaw") > 0
  )
  OR
  (
    "action" = 'DELETE'
    AND "desiredBidState" = 'ABSENT'
    AND "sentBidMinor" IS NULL
    AND length("wireBidRaw") > 0
  )
);

CREATE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$;

CREATE TRIGGER "AuditEvent_prevent_update"
BEFORE UPDATE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TRIGGER "AuditEvent_prevent_delete"
BEFORE DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
