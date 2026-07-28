ALTER TABLE "CampaignTarget"
  ADD COLUMN "clusterBaselineBidState" "ClusterBidState",
  ADD COLUMN "clusterBaselineBidMinor" BIGINT,
  ADD COLUMN "clusterBaselineChecksum" CHAR(64),
  ADD COLUMN "clusterOverrideOwned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CampaignTarget"
  ADD CONSTRAINT "CampaignTarget_cluster_baseline_consistency"
  CHECK (
    ("clusterBaselineBidState" IS NULL AND "clusterBaselineBidMinor" IS NULL)
    OR ("clusterBaselineBidState" = 'ABSENT' AND "clusterBaselineBidMinor" IS NULL)
    OR ("clusterBaselineBidState" = 'EXPLICIT' AND "clusterBaselineBidMinor" IS NOT NULL)
    OR ("clusterBaselineBidState" = 'UNKNOWN' AND "clusterBaselineBidMinor" IS NULL)
  );

ALTER TABLE "CampaignTarget"
  ADD CONSTRAINT "CampaignTarget_cluster_override_scope"
  CHECK ("clusterOverrideOwned" = false OR "targetKind" = 'CLUSTER');

CREATE UNIQUE INDEX "CampaignStatDaily_cluster_day_source_key"
  ON "CampaignStatDaily"
     ("wbCampaignId", "nmId", "date", "sourceVersion", "normQueryCanonical")
  WHERE "normalizedAggregationKind" = 'CLUSTER_DAILY';
