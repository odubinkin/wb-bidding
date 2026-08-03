-- P1 query indexes for lifecycle workers, cursor pagination, retention, and
-- temporal policy resolution.
--
-- Each statement is concurrent so production deployment does not take a
-- table-wide write lock while workers and administrative reads remain active.

CREATE INDEX CONCURRENTLY "BidExperiment_non_terminal_created_idx"
  ON "BidExperiment" ("createdAt", "id")
  WHERE "status" IN ('PLANNED', 'ACTIVE', 'COLLECTING', 'EVALUATING', 'REVERTING');

CREATE INDEX CONCURRENTLY "BidDecision_createdAt_id_idx"
  ON "BidDecision" ("createdAt", "id");

CREATE INDEX CONCURRENTLY "AuditEvent_createdAt_id_idx"
  ON "AuditEvent" ("createdAt", "id");

CREATE INDEX CONCURRENTLY "WbWriteAttempt_terminal_cleanup_idx"
  ON "WbWriteAttempt" ("completedAt", "id")
  WHERE "status" IN ('ACCEPTED', 'REJECTED') AND "completedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY "WbWriteAttempt_dispatching_recovery_idx"
  ON "WbWriteAttempt" ("dispatchCommittedAt", "id")
  WHERE "status" = 'DISPATCHING' AND "dispatchCommittedAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY "BiddingPolicy_target_temporal_idx"
  ON "BiddingPolicy" ("targetId", "validFrom" DESC, "version" DESC)
  INCLUDE ("validTo")
  WHERE "enabled" = true AND "scope" = 'TARGET';

CREATE INDEX CONCURRENTLY "BiddingPolicy_campaign_temporal_idx"
  ON "BiddingPolicy" ("campaignId", "validFrom" DESC, "version" DESC)
  INCLUDE ("validTo")
  WHERE "enabled" = true AND "scope" = 'CAMPAIGN';

CREATE INDEX CONCURRENTLY "BiddingPolicy_deployment_temporal_idx"
  ON "BiddingPolicy" ("validFrom" DESC, "version" DESC)
  INCLUDE ("validTo")
  WHERE "enabled" = true AND "scope" = 'DEPLOYMENT';
