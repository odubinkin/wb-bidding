---
id: "202608030819-KAS2Z3"
title: "Implement P1 lifecycle and pagination indexes"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 15
origin:
  system: "manual"
depends_on:
  - "202608030819-NPBW9T"
tags:
  - "backend"
  - "code"
  - "database"
task_kind: "code"
mutation_scope: "code"
verify:
  - "node scripts/verify-database-architecture.mjs"
  - "pnpm exec vitest run tests/contract/admin-api.contract.spec.ts"
  - "pnpm exec vitest run tests/integration/decision-engine.integration.spec.ts tests/integration/production-runtime.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts"
  - "pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts"
  - "pnpm lint"
  - "pnpm prisma:validate"
  - "pnpm typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T08:28:02.160Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T08:39:29.870Z"
  updated_by: "CODER"
  note: "Verified P1: dependency NPBW9T is DONE; Prisma schema validates; clean-database index suite passes 19/19 and confirms 2 Prisma declarations plus 6 named SQL-only comments and EXPLAIN usage; migrate deploy applies both index migrations; load/integration/contract suite passes 31/31 including 10,000 campaigns and 100,000 targets; architecture, lint, typecheck, diff check, and scoped status pass."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-08-03T08:39:51.908Z"
  updated_by: "EVALUATOR"
  note: "P1 index migration is additive, schema-aligned, and fully verified."
  evaluated_sha: "2a585df7a57419e582ebcb985d20c6719a2fb5f3"
  blueprint_digest: "953fcee88b17988deff0ccd0edf4a16ff83827239e0082ede3bef7e9720d0bf1"
  evidence_refs:
    - ".agentplane/tasks/202608030819-KAS2Z3/README.md"
    - ".agentplane/tasks/202608030819-KAS2Z3/quality/20260803-083951908-recovery-context/quality-report.json"
    - ".agentplane/tasks/202608030819-KAS2Z3/quality/20260803-083951908-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202608030819-KAS2Z3/quality/20260803-083951908-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202608030819-KAS2Z3/blueprint/resolved-snapshot.json"
    - "prisma/migrations/202608031000_p1_lifecycle_indexes/migration.sql"
    - "tests/load/database-indexes.load.spec.ts"
    - "prisma/schema.prisma"
  findings:
    - "All eight P1 indexes match audited predicates; two are declared with mapped Prisma @@index entries and six PostgreSQL-only partial/INCLUDE indexes are named in adjacent schema comments."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-08-03T08:36:13.992Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-08-03T08:39:29.870Z"
    author: "CODER"
    state: "ok"
    note: "Verified P1: dependency NPBW9T is DONE; Prisma schema validates; clean-database index suite passes 19/19 and confirms 2 Prisma declarations plus 6 named SQL-only comments and EXPLAIN usage; migrate deploy applies both index migrations; load/integration/contract suite passes 31/31 including 10,000 campaigns and 100,000 targets; architecture, lint, typecheck, diff check, and scoped status pass."
doc_version: 3
doc_updated_at: "2026-08-03T08:39:29.947Z"
doc_updated_by: "CODER"
description: "After P0 verification, add and verify PostgreSQL indexes for experiment lifecycle scans, decision and audit pagination, write-attempt retention/recovery, and scoped temporal policy resolution."
sections:
  Summary: "Add the second migration containing lifecycle, pagination, recovery/retention, and temporal-policy indexes after P0 is verified."
  Scope: "In scope: Prisma schema declarations for every representable P1 index; adjacent named Prisma schema comments for SQL-only partial, expression, or INCLUDE indexes and their DSL limitation; one additive PostgreSQL migration for non-terminal experiment scans, decision and audit cursor pagination, terminal-attempt cleanup, dispatch crash recovery, and scoped temporal policy resolution; deterministic PostgreSQL index-plan and schema-documentation verification. Out of scope: P0 indexes, cross-table last-applied denormalization, optional low-confidence indexes, query rewrites, production deployment, dropping existing indexes, and network access."
  Plan: "1. Wait for verified P0 and reload its state. 2. Classify every P1 index as Prisma-declarable or SQL-only. 3. Add Prisma schema declarations wherever possible and adjacent named comments for partial/expression/INCLUDE indexes that require raw SQL. 4. Add the P1 migration and extend clean-database/index-plan tests. 5. Run schema, PostgreSQL, integration/contract, architecture, lint, and type checks. 6. Record verification and finish the dependent task."
  Verify Steps: |-
    1. Confirm dependency 202608030819-NPBW9T is DONE and run ap task verify-show 202608030819-KAS2Z3. Expected: P1 starts only after verified P0.
    2. Run pnpm prisma:validate. Expected: Prisma schema is valid and contains declarations for every representable P1 index.
    3. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Expected: a clean database accepts all migrations; every P1 index has a Prisma declaration or explicit SQL-only comment; representative P1 predicates use every new index with sequential scans disabled.
    4. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/decision-engine.integration.spec.ts tests/integration/production-runtime.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts tests/contract/admin-api.contract.spec.ts. Expected: load, runtime, pipeline, decision, and admin tests pass.
    5. Run node scripts/verify-database-architecture.mjs. Expected: pass.
    6. Run pnpm lint. Expected: pass.
    7. Run pnpm typecheck. Expected: pass.
    8. Inspect git diff and git status --short --untracked-files=all. Expected: only the P1 migration, Prisma schema, focused test extension, and approved AgentPlane artifacts are changed.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T08:39:29.870Z — VERIFY — ok

    By: CODER

    Note: Verified P1: dependency NPBW9T is DONE; Prisma schema validates; clean-database index suite passes 19/19 and confirms 2 Prisma declarations plus 6 named SQL-only comments and EXPLAIN usage; migrate deploy applies both index migrations; load/integration/contract suite passes 31/31 including 10,000 campaigns and 100,000 targets; architecture, lint, typecheck, diff check, and scoped status pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:36:13.992Z, excerpt_hash=sha256:6daf5f13faa8938e02ca11221f0c3f2b0a2b32ae2441568a6743b55621fe7f8e

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030819-KAS2Z3/blueprint/resolved-snapshot.json
    - old_digest: 953fcee88b17988deff0ccd0edf4a16ff83827239e0082ede3bef7e9720d0bf1
    - current_digest: 953fcee88b17988deff0ccd0edf4a16ff83827239e0082ede3bef7e9720d0bf1
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030819-KAS2Z3

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608030819-KAS2Z3
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Do not drop legacy indexes in this task. If validation fails before deployment, revert the additive P1 migration and focused test extension. Any deployed rollback must remove only the named new indexes in a separately approved migration without changing data."
  Findings: |-
    Deferred from static audit: optional actor/action audit indexes, ManualJob scope lookup, failed-queue classification, and cross-table last-applied lookup remain measurement-gated and are not part of this task.

    - Observation: Eight P1 indexes cover experiment lifecycle, decision and audit pagination, write-attempt cleanup/recovery, and three temporal policy scopes.
      Impact: Every audited P1 hot-path predicate now has a matching tested index while PostgreSQL-only definitions remain visible in Prisma schema comments.
      Resolution: Added one additive concurrent migration, two mapped Prisma indexes, six SQL-only schema comments, and deterministic catalog/schema/EXPLAIN coverage.
id_source: "generated"
---
## Summary

Add the second migration containing lifecycle, pagination, recovery/retention, and temporal-policy indexes after P0 is verified.

## Scope

In scope: Prisma schema declarations for every representable P1 index; adjacent named Prisma schema comments for SQL-only partial, expression, or INCLUDE indexes and their DSL limitation; one additive PostgreSQL migration for non-terminal experiment scans, decision and audit cursor pagination, terminal-attempt cleanup, dispatch crash recovery, and scoped temporal policy resolution; deterministic PostgreSQL index-plan and schema-documentation verification. Out of scope: P0 indexes, cross-table last-applied denormalization, optional low-confidence indexes, query rewrites, production deployment, dropping existing indexes, and network access.

## Plan

1. Wait for verified P0 and reload its state. 2. Classify every P1 index as Prisma-declarable or SQL-only. 3. Add Prisma schema declarations wherever possible and adjacent named comments for partial/expression/INCLUDE indexes that require raw SQL. 4. Add the P1 migration and extend clean-database/index-plan tests. 5. Run schema, PostgreSQL, integration/contract, architecture, lint, and type checks. 6. Record verification and finish the dependent task.

## Verify Steps

1. Confirm dependency 202608030819-NPBW9T is DONE and run ap task verify-show 202608030819-KAS2Z3. Expected: P1 starts only after verified P0.
2. Run pnpm prisma:validate. Expected: Prisma schema is valid and contains declarations for every representable P1 index.
3. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/database-indexes.load.spec.ts. Expected: a clean database accepts all migrations; every P1 index has a Prisma declaration or explicit SQL-only comment; representative P1 predicates use every new index with sequential scans disabled.
4. Run DATABASE_URL=postgresql://wb_bidder:index-test-only@127.0.0.1:55432/postgres pnpm exec vitest run tests/load/account-scale-postgres.load.spec.ts tests/integration/decision-engine.integration.spec.ts tests/integration/production-runtime.integration.spec.ts tests/integration/write-pipeline.integration.spec.ts tests/contract/admin-api.contract.spec.ts. Expected: load, runtime, pipeline, decision, and admin tests pass.
5. Run node scripts/verify-database-architecture.mjs. Expected: pass.
6. Run pnpm lint. Expected: pass.
7. Run pnpm typecheck. Expected: pass.
8. Inspect git diff and git status --short --untracked-files=all. Expected: only the P1 migration, Prisma schema, focused test extension, and approved AgentPlane artifacts are changed.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T08:39:29.870Z — VERIFY — ok

By: CODER

Note: Verified P1: dependency NPBW9T is DONE; Prisma schema validates; clean-database index suite passes 19/19 and confirms 2 Prisma declarations plus 6 named SQL-only comments and EXPLAIN usage; migrate deploy applies both index migrations; load/integration/contract suite passes 31/31 including 10,000 campaigns and 100,000 targets; architecture, lint, typecheck, diff check, and scoped status pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:36:13.992Z, excerpt_hash=sha256:6daf5f13faa8938e02ca11221f0c3f2b0a2b32ae2441568a6743b55621fe7f8e

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030819-KAS2Z3/blueprint/resolved-snapshot.json
- old_digest: 953fcee88b17988deff0ccd0edf4a16ff83827239e0082ede3bef7e9720d0bf1
- current_digest: 953fcee88b17988deff0ccd0edf4a16ff83827239e0082ede3bef7e9720d0bf1
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030819-KAS2Z3

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608030819-KAS2Z3
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Do not drop legacy indexes in this task. If validation fails before deployment, revert the additive P1 migration and focused test extension. Any deployed rollback must remove only the named new indexes in a separately approved migration without changing data.

## Findings

Deferred from static audit: optional actor/action audit indexes, ManualJob scope lookup, failed-queue classification, and cross-table last-applied lookup remain measurement-gated and are not part of this task.

- Observation: Eight P1 indexes cover experiment lifecycle, decision and audit pagination, write-attempt cleanup/recovery, and three temporal policy scopes.
  Impact: Every audited P1 hot-path predicate now has a matching tested index while PostgreSQL-only definitions remain visible in Prisma schema comments.
  Resolution: Added one additive concurrent migration, two mapped Prisma indexes, six SQL-only schema comments, and deterministic catalog/schema/EXPLAIN coverage.
