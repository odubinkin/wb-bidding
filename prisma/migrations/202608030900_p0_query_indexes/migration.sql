-- P0 query indexes for the account-scale synchronization and write hot paths.
--
-- Each statement is concurrent so production deployment does not take a table-wide
-- write lock while immutable evidence and queue traffic continue to arrive.

CREATE INDEX CONCURRENTLY "DecisionQueueItem_claim_ready_idx"
  ON "DecisionQueueItem" ("priority" DESC, "availableAt", "id")
  INCLUDE ("leaseUntil", "decisionId")
  WHERE "status" IN ('QUEUED', 'RETRY_WAIT');

CREATE INDEX CONCURRENTLY "DecisionQueueItem_verify_due_idx"
  ON "DecisionQueueItem" ("nextVerificationAt" ASC NULLS FIRST, "id")
  INCLUDE ("decisionId")
  WHERE "status" = 'VERIFY_WAIT';

CREATE INDEX CONCURRENTLY "CampaignStatDaily_latest_content_idx"
  ON "CampaignStatDaily" (
    "campaignId",
    "nmId",
    "date",
    (COALESCE("normQueryCanonical", '')),
    "normalizedAggregationKind",
    "fetchedAt" DESC,
    "sourceVersion" DESC
  );

CREATE INDEX CONCURRENTLY "SyncSourceSnapshot_campaign_latest_idx"
  ON "SyncSourceSnapshot" (
    "campaignId",
    "dataKind",
    "fetchedAt" DESC,
    "createdAt" DESC
  );

CREATE INDEX CONCURRENTLY "SyncSourceSnapshot_recommendation_lookup_idx"
  ON "SyncSourceSnapshot" (
    "campaignId",
    "endpointProfile",
    (("normalizedData" ->> 'nmId')),
    "fetchedAt" DESC,
    "createdAt" DESC
  )
  WHERE "dataKind" = 'BID_RECOMMENDATION' AND "valid" = true;

CREATE INDEX CONCURRENTLY "SyncSourceSnapshot_campaign_evidence_idx"
  ON "SyncSourceSnapshot" (
    "dataKind",
    "campaignId",
    "sourceDate",
    "sourceChecksum",
    "valid",
    "fetchedAt"
  );

CREATE INDEX CONCURRENTLY "SyncSourceSnapshot_target_evidence_idx"
  ON "SyncSourceSnapshot" (
    "dataKind",
    "targetId",
    "sourceDate",
    "sourceChecksum",
    "valid",
    "fetchedAt"
  );
