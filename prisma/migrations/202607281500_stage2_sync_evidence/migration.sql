-- Stage 2 adds synchronization evidence without deleting or rewriting existing data.

CREATE TYPE "SyncDataKind" AS ENUM (
  'CAMPAIGN_DISCOVERY',
  'CAMPAIGN_DETAILS',
  'CURRENT_BID',
  'MINIMUM_BID',
  'CAMPAIGN_STATISTICS',
  'CLUSTER_LIST',
  'CLUSTER_STATISTICS',
  'BID_RECOMMENDATION',
  'BUDGET_DIAGNOSTIC',
  'SAME_DAY_SPEND'
);

CREATE TYPE "SyncSnapshotStatus" AS ENUM ('COMPLETE', 'INCOMPLETE', 'INVALID', 'STALE');

ALTER TABLE "DeploymentAccountBinding"
  ADD COLUMN "tokenFor" TEXT;

ALTER TABLE "Campaign"
  ADD COLUMN "detailsFetchedAt" TIMESTAMPTZ(3),
  ADD COLUMN "detailsChecksum" CHAR(64),
  ADD COLUMN "detailsSyncRunId" UUID;

ALTER TABLE "CampaignTarget"
  ADD COLUMN "currentBidChecksum" CHAR(64),
  ADD COLUMN "currentBidSyncRunId" UUID,
  ADD COLUMN "minimumBidConfirmedAt" TIMESTAMPTZ(3),
  ADD COLUMN "minimumBidChecksum" CHAR(64),
  ADD COLUMN "minimumBidSyncRunId" UUID,
  ADD COLUMN "capability" TEXT NOT NULL DEFAULT 'OBSERVE_ONLY';

CREATE TABLE "SyncCheckpoint" (
  "dataKind" "SyncDataKind" NOT NULL,
  "cursor" JSONB NOT NULL,
  "fullPassStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "fullPassCompletedAt" TIMESTAMPTZ(3),
  "lastSuccessAt" TIMESTAMPTZ(3),
  "oldestPendingAt" TIMESTAMPTZ(3),
  "processedCount" BIGINT NOT NULL DEFAULT 0,
  "totalEstimate" BIGINT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("dataKind")
);

CREATE TABLE "BidStateObservation" (
  "id" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "observedAt" TIMESTAMPTZ(3) NOT NULL,
  "currentBidMinor" BIGINT,
  "clusterBidState" "ClusterBidState",
  "campaignStatus" INTEGER NOT NULL,
  "bidType" "CampaignBidType" NOT NULL,
  "paymentType" "CampaignPaymentType" NOT NULL,
  "activePlacementConfig" JSONB NOT NULL,
  "configurationChecksum" CHAR(64) NOT NULL,
  "sourceMarker" TEXT,
  "syncRunId" UUID NOT NULL,
  "externalWriteControlMode" "ExternalWriteControlMode" NOT NULL,
  "changeMarkerObserved" BOOLEAN NOT NULL,
  CONSTRAINT "BidStateObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncSourceSnapshot" (
  "id" UUID NOT NULL,
  "dataKind" "SyncDataKind" NOT NULL,
  "campaignId" UUID,
  "targetId" UUID,
  "sourceDate" DATE,
  "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
  "endpointProfile" TEXT NOT NULL,
  "sourceChecksum" CHAR(64) NOT NULL,
  "normalizedData" JSONB NOT NULL,
  "valid" BOOLEAN NOT NULL,
  "invalidReason" TEXT,
  "syncRunId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncSourceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TargetDataSnapshot" (
  "id" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "syncRunId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "SyncSnapshotStatus" NOT NULL,
  "requiredSourceVersions" JSONB NOT NULL,
  "completenessFlags" TEXT[],
  "oldestFetchedAt" TIMESTAMPTZ(3),
  "coherentRegimeChecksum" CHAR(64),
  "applyEligible" BOOLEAN NOT NULL,
  "increaseEligible" BOOLEAN NOT NULL,
  "inputChecksum" CHAR(64) NOT NULL,
  CONSTRAINT "TargetDataSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulerRun_one_active_job_key"
  ON "SchedulerRun" ("jobType")
  WHERE "status" = 'RUNNING';

CREATE UNIQUE INDEX "BidStateObservation_targetId_observedAt_configurationChecksum_key"
  ON "BidStateObservation" ("targetId", "observedAt", "configurationChecksum");
CREATE INDEX "BidStateObservation_targetId_observedAt_idx"
  ON "BidStateObservation" ("targetId", "observedAt");
CREATE INDEX "BidStateObservation_syncRunId_idx"
  ON "BidStateObservation" ("syncRunId");

CREATE UNIQUE INDEX "SyncSourceSnapshot_natural_version_key"
  ON "SyncSourceSnapshot" (
    "dataKind",
    COALESCE("campaignId", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetId", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("sourceDate", DATE '0001-01-01'),
    "sourceChecksum"
  );
CREATE INDEX "SyncSourceSnapshot_dataKind_fetchedAt_idx"
  ON "SyncSourceSnapshot" ("dataKind", "fetchedAt");
CREATE INDEX "SyncSourceSnapshot_targetId_dataKind_fetchedAt_idx"
  ON "SyncSourceSnapshot" ("targetId", "dataKind", "fetchedAt");
CREATE INDEX "SyncSourceSnapshot_syncRunId_idx"
  ON "SyncSourceSnapshot" ("syncRunId");

CREATE UNIQUE INDEX "TargetDataSnapshot_inputChecksum_key"
  ON "TargetDataSnapshot" ("inputChecksum");
CREATE INDEX "TargetDataSnapshot_targetId_createdAt_idx"
  ON "TargetDataSnapshot" ("targetId", "createdAt");
CREATE INDEX "TargetDataSnapshot_status_createdAt_idx"
  ON "TargetDataSnapshot" ("status", "createdAt");

ALTER TABLE "BidStateObservation"
  ADD CONSTRAINT "BidStateObservation_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SyncSourceSnapshot"
  ADD CONSTRAINT "SyncSourceSnapshot_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SyncSourceSnapshot_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TargetDataSnapshot"
  ADD CONSTRAINT "TargetDataSnapshot_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "SyncSourceSnapshot" IS
  'Immutable normalized/redacted WB source evidence; no authorization credentials.';
COMMENT ON TABLE "TargetDataSnapshot" IS
  'Atomic target-level completeness/freshness decision input boundary.';
