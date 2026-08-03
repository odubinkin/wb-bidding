---
id: "202608030819-NPBW9T"
title: "Implement P0 database query indexes"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 14
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "code"
  - "database"
task_kind: "code"
mutation_scope: "code"
verify:
  - "node scripts/verify-database-architecture.mjs"
  - "pnpm exec vitest run tests/integration/data-sync.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts"
  - "pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts"
  - "pnpm lint"
  - "pnpm prisma:validate"
  - "pnpm typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T08:27:58.610Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T08:32:56.138Z"
  updated_by: "CODER"
  note: "P0 migration, Prisma declarations/comments, and representative index plans verified on PostgreSQL 18."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-08-03T08:21:26.712Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-08-03T08:32:56.138Z"
    author: "CODER"
    state: "ok"
    note: "P0 migration, Prisma declarations/comments, and representative index plans verified on PostgreSQL 18."
doc_version: 3
doc_updated_at: "2026-08-03T08:32:56.217Z"
doc_updated_by: "CODER"
description: "Add and verify high-priority PostgreSQL indexes for decision queue claiming, due reconciliation, CampaignStatDaily latest-content aggregation, and SyncSourceSnapshot evidence/recommendation lookups."
sections:
  Summary: "Add the first migration containing the high-confidence hot-path indexes identified by the full application query audit."
  Scope: "In scope: Prisma schema declarations for every representable P0 index; adjacent Prisma schema comments documenting every SQL-only partial, expression, or INCLUDE index and why Prisma cannot express it; one additive PostgreSQL migration for queue claim/reconciliation, CampaignStatDaily latest-content aggregation, and SyncSourceSnapshot recommendation/evidence lookups; deterministic PostgreSQL index-plan and schema-documentation verification. Out of scope: P1 lifecycle/admin indexes, query rewrites, production deployment, dropping existing indexes, and network access."
  Plan: "1. Classify each P0 index as Prisma-declarable or SQL-only. 2. Add Prisma schema index declarations wherever the DSL can express the required structure; add adjacent named comments for partial, expression, or INCLUDE indexes that require raw SQL. 3. Align the additive P0 migration with the schema declarations/comments. 4. Extend PostgreSQL tests to apply all migrations, validate declaration/comment coverage, and prove representative predicates can use the indexes. 5. Run schema, focused PostgreSQL, integration, architecture, lint, and type checks. 6. Record verification and finish P0 before starting P1."
  Verify Steps: |-
    1. Run pnpm prisma:validate. Expected: Prisma schema is valid and contains declarations for every representable P0 index.
    2. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Expected: a clean database accepts all migrations; the test proves schema declarations or explicit SQL-only comments exist for every P0 index; EXPLAIN with sequential scans disabled selects every P0 index for its representative predicate/order.
    3. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/data-sync.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts. Expected: PostgreSQL load and integration tests pass.
    4. Run node scripts/verify-database-architecture.mjs. Expected: database access remains centralized.
    5. Run pnpm lint. Expected: pass.
    6. Run pnpm typecheck. Expected: pass.
    7. Inspect git diff and git status --short --untracked-files=all. Expected: only the P0 migration, Prisma schema, focused test/support coverage, and approved AgentPlane task artifacts are changed.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T08:32:56.138Z — VERIFY — ok

    By: CODER

    Note: P0 migration, Prisma declarations/comments, and representative index plans verified on PostgreSQL 18.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:27:49.703Z, excerpt_hash=sha256:6c38a70fca539ab13d49e346bd96632d7f84109f949678748c10f335031930ff

    Details:

    Command: pnpm prisma:validate. Result: pass. Evidence: Prisma schema valid. Scope: Prisma declarations and comments.
    Command: DATABASE_URL=local-test pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Result: pass. Evidence: 9/9 tests; clean migration, catalog, schema documentation, and EXPLAIN coverage. Scope: all seven P0 indexes.
    Command: DATABASE_URL=local-test pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/data-sync.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts. Result: pass. Evidence: 24/24 tests including 10,000 campaigns and 100,000 targets. Scope: sync and write paths.
    Command: node scripts/verify-database-architecture.mjs. Result: pass. Evidence: Prisma-only centralized raw SQL. Scope: database architecture.
    Command: pnpm lint && pnpm typecheck. Result: pass. Evidence: zero errors. Scope: changed TypeScript and schema consumers.

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030819-NPBW9T/blueprint/resolved-snapshot.json
    - old_digest: 41d373787042e55f47b487d1cd93f7a501e89d80433123705701b3cf6130b19c
    - current_digest: 41d373787042e55f47b487d1cd93f7a501e89d80433123705701b3cf6130b19c
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030819-NPBW9T

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608030819-NPBW9T
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Do not drop legacy indexes in this task. If validation fails before deployment, revert the additive migration and test change. If an index build is rejected after deployment, remove only the named new index with a separately approved rollback migration; preserve data and existing indexes."
  Findings: "No findings yet."
id_source: "generated"
---
## Summary

Add the first migration containing the high-confidence hot-path indexes identified by the full application query audit.

## Scope

In scope: Prisma schema declarations for every representable P0 index; adjacent Prisma schema comments documenting every SQL-only partial, expression, or INCLUDE index and why Prisma cannot express it; one additive PostgreSQL migration for queue claim/reconciliation, CampaignStatDaily latest-content aggregation, and SyncSourceSnapshot recommendation/evidence lookups; deterministic PostgreSQL index-plan and schema-documentation verification. Out of scope: P1 lifecycle/admin indexes, query rewrites, production deployment, dropping existing indexes, and network access.

## Plan

1. Classify each P0 index as Prisma-declarable or SQL-only. 2. Add Prisma schema index declarations wherever the DSL can express the required structure; add adjacent named comments for partial, expression, or INCLUDE indexes that require raw SQL. 3. Align the additive P0 migration with the schema declarations/comments. 4. Extend PostgreSQL tests to apply all migrations, validate declaration/comment coverage, and prove representative predicates can use the indexes. 5. Run schema, focused PostgreSQL, integration, architecture, lint, and type checks. 6. Record verification and finish P0 before starting P1.

## Verify Steps

1. Run pnpm prisma:validate. Expected: Prisma schema is valid and contains declarations for every representable P0 index.
2. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Expected: a clean database accepts all migrations; the test proves schema declarations or explicit SQL-only comments exist for every P0 index; EXPLAIN with sequential scans disabled selects every P0 index for its representative predicate/order.
3. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/data-sync.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts. Expected: PostgreSQL load and integration tests pass.
4. Run node scripts/verify-database-architecture.mjs. Expected: database access remains centralized.
5. Run pnpm lint. Expected: pass.
6. Run pnpm typecheck. Expected: pass.
7. Inspect git diff and git status --short --untracked-files=all. Expected: only the P0 migration, Prisma schema, focused test/support coverage, and approved AgentPlane task artifacts are changed.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T08:32:56.138Z — VERIFY — ok

By: CODER

Note: P0 migration, Prisma declarations/comments, and representative index plans verified on PostgreSQL 18.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:27:49.703Z, excerpt_hash=sha256:6c38a70fca539ab13d49e346bd96632d7f84109f949678748c10f335031930ff

Details:

Command: pnpm prisma:validate. Result: pass. Evidence: Prisma schema valid. Scope: Prisma declarations and comments.
Command: DATABASE_URL=local-test pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Result: pass. Evidence: 9/9 tests; clean migration, catalog, schema documentation, and EXPLAIN coverage. Scope: all seven P0 indexes.
Command: DATABASE_URL=local-test pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/data-sync.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts. Result: pass. Evidence: 24/24 tests including 10,000 campaigns and 100,000 targets. Scope: sync and write paths.
Command: node scripts/verify-database-architecture.mjs. Result: pass. Evidence: Prisma-only centralized raw SQL. Scope: database architecture.
Command: pnpm lint && pnpm typecheck. Result: pass. Evidence: zero errors. Scope: changed TypeScript and schema consumers.

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030819-NPBW9T/blueprint/resolved-snapshot.json
- old_digest: 41d373787042e55f47b487d1cd93f7a501e89d80433123705701b3cf6130b19c
- current_digest: 41d373787042e55f47b487d1cd93f7a501e89d80433123705701b3cf6130b19c
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030819-NPBW9T

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608030819-NPBW9T
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Do not drop legacy indexes in this task. If validation fails before deployment, revert the additive migration and test change. If an index build is rejected after deployment, remove only the named new index with a separately approved rollback migration; preserve data and existing indexes.

## Findings

No findings yet.
