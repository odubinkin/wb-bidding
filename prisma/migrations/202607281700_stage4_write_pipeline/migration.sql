CREATE TYPE "AutomationMode" AS ENUM ('DISABLED', 'OBSERVE_ONLY', 'APPLY');
CREATE TYPE "ManualJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

DROP INDEX "BiddingPolicy_one_open_deployment";
DROP INDEX "BiddingPolicy_one_open_campaign";
DROP INDEX "BiddingPolicy_one_open_target";

CREATE UNIQUE INDEX "BiddingPolicy_one_open_deployment"
ON "BiddingPolicy" ((true))
WHERE "scope" = 'DEPLOYMENT' AND "enabled" = true AND "validTo" IS NULL;

CREATE UNIQUE INDEX "BiddingPolicy_one_open_campaign"
ON "BiddingPolicy" ("campaignId")
WHERE "scope" = 'CAMPAIGN' AND "enabled" = true AND "validTo" IS NULL;

CREATE UNIQUE INDEX "BiddingPolicy_one_open_target"
ON "BiddingPolicy" ("targetId")
WHERE "scope" = 'TARGET' AND "enabled" = true AND "validTo" IS NULL;

CREATE OR REPLACE FUNCTION protect_versioned_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BiddingPolicy versions are immutable';
  END IF;
  IF OLD."validTo" IS NULL
     AND NEW."validTo" IS NOT NULL
     AND NEW."validTo" > OLD."validFrom"
     AND (to_jsonb(NEW) - 'validTo') = (to_jsonb(OLD) - 'validTo') THEN
    RETURN NEW;
  END IF;
  IF NEW."enabled" IS DISTINCT FROM OLD."enabled"
     AND (to_jsonb(NEW) - 'enabled') = (to_jsonb(OLD) - 'enabled') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'BiddingPolicy versions are immutable';
END;
$$;

ALTER TABLE "ProductEconomicsImportItem"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ProductEconomicsImportItem_importId_createdAt_id_idx"
  ON "ProductEconomicsImportItem"("importId", "createdAt", "id");

ALTER TABLE "ProductEconomicsImport"
  ADD COLUMN "changeReason" TEXT NOT NULL DEFAULT 'legacy import';
ALTER TABLE "ProductEconomicsImport"
  ALTER COLUMN "changeReason" DROP DEFAULT;

ALTER TABLE "DecisionQueueItem"
  ADD COLUMN "nextVerificationAt" TIMESTAMPTZ(3),
  ADD COLUMN "reconciliationDeadlineAt" TIMESTAMPTZ(3),
  ADD COLUMN "stableReadChecksum" CHAR(64),
  ADD COLUMN "stableReadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReconciliationReadAt" TIMESTAMPTZ(3),
  ADD COLUMN "manualRetryBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "failureClassification" TEXT,
  ADD COLUMN "version" BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT "DecisionQueueItem_stableReadCount_check" CHECK ("stableReadCount" >= 0);

ALTER TABLE "WbWriteAttemptItem"
  ADD COLUMN "preWriteReadAt" TIMESTAMPTZ(3),
  ADD COLUMN "preWriteStateChecksum" CHAR(64),
  ADD COLUMN "preWriteSourceMarker" TEXT,
  ADD COLUMN "preWriteState" JSONB,
  ADD COLUMN "desiredStateChecksum" CHAR(64);

CREATE TABLE "DeploymentControl" (
  "id" UUID NOT NULL,
  "globalKill" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "version" BIGINT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "DeploymentControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignAutomation" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "mode" "AutomationMode" NOT NULL,
  "reason" TEXT NOT NULL,
  "version" BIGINT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "CampaignAutomation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TargetAutomation" (
  "id" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "mode" "AutomationMode" NOT NULL,
  "reason" TEXT NOT NULL,
  "version" BIGINT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "TargetAutomation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualJob" (
  "id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "status" "ManualJobStatus" NOT NULL,
  "scope" JSONB NOT NULL,
  "campaignId" UUID,
  "targetId" UUID,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedBy" TEXT NOT NULL,
  "correlationId" UUID NOT NULL,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "finishedAt" TIMESTAMPTZ(3),
  "result" JSONB,
  "errorCode" TEXT,
  CONSTRAINT "ManualJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationRead" (
  "id" UUID NOT NULL,
  "attemptItemId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "readAt" TIMESTAMPTZ(3) NOT NULL,
  "stateChecksum" CHAR(64) NOT NULL,
  "sourceMarker" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "classification" TEXT NOT NULL,
  "fresh" BOOLEAN NOT NULL,
  "prevalidationPassed" BOOLEAN NOT NULL,
  CONSTRAINT "ReconciliationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignAutomation_campaignId_key" ON "CampaignAutomation"("campaignId");
CREATE UNIQUE INDEX "TargetAutomation_targetId_key" ON "TargetAutomation"("targetId");
CREATE INDEX "ManualJob_status_requestedAt_idx" ON "ManualJob"("status", "requestedAt");
CREATE INDEX "ManualJob_campaignId_status_idx" ON "ManualJob"("campaignId", "status");
CREATE INDEX "ManualJob_targetId_status_idx" ON "ManualJob"("targetId", "status");
CREATE INDEX "ReconciliationRead_attemptItemId_readAt_idx" ON "ReconciliationRead"("attemptItemId", "readAt");
CREATE INDEX "ReconciliationRead_targetId_readAt_idx" ON "ReconciliationRead"("targetId", "readAt");

ALTER TABLE "CampaignAutomation"
  ADD CONSTRAINT "CampaignAutomation_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TargetAutomation"
  ADD CONSTRAINT "TargetAutomation_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualJob"
  ADD CONSTRAINT "ManualJob_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualJob"
  ADD CONSTRAINT "ManualJob_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRead"
  ADD CONSTRAINT "ReconciliationRead_attemptItemId_fkey"
  FOREIGN KEY ("attemptItemId") REFERENCES "WbWriteAttemptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRead"
  ADD CONSTRAINT "ReconciliationRead_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DeploymentControl"
  ("id", "globalKill", "reason", "version", "updatedBy")
VALUES
  ('00000000-0000-0000-0000-000000000002', false, 'initial safe control state', 1, 'migration');
