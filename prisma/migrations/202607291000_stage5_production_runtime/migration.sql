-- Stage 5 production runtime.
--
-- A blocked decision without product economics is a first-class audited outcome. Stage 3 made the
-- metric snapshot's economics foreign key mandatory, which prevented persisting the normative
-- MISSING_PRODUCT_ECONOMICS decision. The relation is optional only for that blocked input; queue
-- eligibility remains false in the decision engine.
ALTER TABLE "MetricSnapshot"
  ALTER COLUMN "productEconomicsId" DROP NOT NULL,
  ALTER COLUMN "productEconomicsVersion" DROP NOT NULL,
  ALTER COLUMN "expectedContributionBeforeAdsMinor" DROP NOT NULL;

ALTER TABLE "BidExperiment"
  ADD COLUMN "startDecisionId" UUID,
  ADD COLUMN "revertDecisionId" UUID,
  ADD COLUMN "revertStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "revertDeadlineAt" TIMESTAMPTZ(3);

ALTER TABLE "BidExperiment"
  ADD CONSTRAINT "BidExperiment_startDecisionId_fkey"
    FOREIGN KEY ("startDecisionId") REFERENCES "BidDecision"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "BidExperiment_revertDecisionId_fkey"
    FOREIGN KEY ("revertDecisionId") REFERENCES "BidDecision"("id") ON DELETE RESTRICT;

-- A statistical content version contains every appType leaf, including unchanged leaves. Keeping
-- the day-level sourceVersion in the key makes a late-attribution version reconstructible without
-- summing it together with an older version.
DROP INDEX "CampaignStatDaily_wbCampaignId_nmId_date_sourceChecksum_key";
CREATE UNIQUE INDEX "CampaignStatDaily_day_content_app_key"
  ON "CampaignStatDaily" ("wbCampaignId", "nmId", "date", "sourceVersion", "appType");

-- Equal source content must still produce separate read observations: finalization requires two
-- reads separated in time. The sync run is the bounded observation identity.
DROP INDEX "SyncSourceSnapshot_natural_version_key";
CREATE UNIQUE INDEX "SyncSourceSnapshot_run_observation_key"
  ON "SyncSourceSnapshot" (
    "dataKind",
    COALESCE("campaignId", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetId", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("sourceDate", DATE '0001-01-01'),
    "sourceChecksum",
    "syncRunId"
  );

CREATE UNIQUE INDEX "BidPerformanceDay_one_current_finalized_key"
  ON "BidPerformanceDay" ("targetId", "wbStatisticDate")
  WHERE "status" = 'FINALIZED';

CREATE UNIQUE INDEX "BidExperiment_one_non_terminal_target_key"
  ON "BidExperiment" ("targetId")
  WHERE "status" IN ('PLANNED','ACTIVE','COLLECTING','EVALUATING','REVERTING');
