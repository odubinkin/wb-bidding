-- Stage 3: immutable decision inputs/results and policy-version integrity.

ALTER TABLE "BiddingPolicy"
ADD CONSTRAINT "BiddingPolicy_period_order_check"
CHECK ("validTo" IS NULL OR "validTo" > "validFrom");

CREATE UNIQUE INDEX "BiddingPolicy_one_open_deployment"
ON "BiddingPolicy" ((true))
WHERE "scope" = 'DEPLOYMENT' AND "validTo" IS NULL;

CREATE UNIQUE INDEX "BiddingPolicy_one_open_campaign"
ON "BiddingPolicy" ("campaignId")
WHERE "scope" = 'CAMPAIGN' AND "validTo" IS NULL;

CREATE UNIQUE INDEX "BiddingPolicy_one_open_target"
ON "BiddingPolicy" ("targetId")
WHERE "scope" = 'TARGET' AND "validTo" IS NULL;

CREATE FUNCTION protect_versioned_economics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ProductEconomics versions are immutable';
  END IF;
  IF OLD."effectiveTo" IS NULL
     AND NEW."effectiveTo" IS NOT NULL
     AND NEW."effectiveTo" > OLD."effectiveFrom"
     AND (to_jsonb(NEW) - 'effectiveTo') = (to_jsonb(OLD) - 'effectiveTo') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ProductEconomics versions are immutable';
END;
$$;

CREATE TRIGGER "ProductEconomics_immutable"
BEFORE UPDATE OR DELETE ON "ProductEconomics"
FOR EACH ROW EXECUTE FUNCTION protect_versioned_economics();

CREATE FUNCTION protect_versioned_policy()
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
  RAISE EXCEPTION 'BiddingPolicy versions are immutable';
END;
$$;

CREATE TRIGGER "BiddingPolicy_immutable"
BEFORE UPDATE OR DELETE ON "BiddingPolicy"
FOR EACH ROW EXECUTE FUNCTION protect_versioned_policy();

CREATE FUNCTION prevent_immutable_decision_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "MetricSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "MetricSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_decision_artifact_mutation();

CREATE TRIGGER "BidDecision_immutable"
BEFORE UPDATE OR DELETE ON "BidDecision"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_decision_artifact_mutation();

ALTER TABLE "BidExperiment"
ADD CONSTRAINT "BidExperiment_lower_only_check"
CHECK ("experimentBidMinor" < "sourceBidMinor");

ALTER TABLE "BidExperiment"
ADD CONSTRAINT "BidExperiment_spend_invariant_check"
CHECK (
  "spendLimitMinor" > 0
  AND "spendSafetyBufferMinor" >= 0
  AND "spendSafetyBufferMinor" < "spendLimitMinor"
  AND "observedExperimentSpendMinor" >= 0
  AND "reservedUnobservedSpendMinor" >= 0
);
