CREATE TABLE "wb_rate_limit_bucket" (
    "bucket_key" TEXT NOT NULL,
    "blocked_until_ms" BIGINT NOT NULL DEFAULT 0,
    "tokens" DECIMAL(20,9) NOT NULL,
    "last_refill_at_ms" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wb_rate_limit_bucket_pkey" PRIMARY KEY ("bucket_key"),
    CONSTRAINT "wb_rate_limit_bucket_tokens_nonnegative" CHECK ("tokens" >= 0)
);

COMMENT ON TABLE "wb_rate_limit_bucket" IS
  'Deployment-wide WB account and endpoint token buckets; contains no credentials.';
