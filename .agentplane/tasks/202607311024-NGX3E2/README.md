---
id: "202607311024-NGX3E2"
title: "Reduce raw SQL to irreducible Prisma primitives"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 6
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T10:24:55.868Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T11:16:26.650Z"
  updated_by: "CODER"
  note: "Refactor verified: raw.ts removed; non-SQL single-consumer readiness probe moved to ObservabilityService; shared transaction/lock utilities and domain SQL queries split into named modules. Quality, PostgreSQL 18 integration/e2e/load/runbook, build, and smoke checks pass."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: replace safely expressible raw SQL with Prisma delegates, isolate irreducible PostgreSQL operations, remove the generic raw facade, and verify all database behavior."
events:
  -
    type: "status"
    at: "2026-07-31T10:24:56.485Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: replace safely expressible raw SQL with Prisma delegates, isolate irreducible PostgreSQL operations, remove the generic raw facade, and verify all database behavior."
  -
    type: "verify"
    at: "2026-07-31T11:16:26.650Z"
    author: "CODER"
    state: "ok"
    note: "Refactor verified: raw.ts removed; non-SQL single-consumer readiness probe moved to ObservabilityService; shared transaction/lock utilities and domain SQL queries split into named modules. Quality, PostgreSQL 18 integration/e2e/load/runbook, build, and smoke checks pass."
doc_version: 3
doc_updated_at: "2026-07-31T11:16:26.776Z"
doc_updated_by: "CODER"
description: "Replace straightforward raw SQL in admin, data-sync, decision, and write-pipeline paths with generated Prisma delegates; isolate unavoidable PostgreSQL operations as typed shared database functions; remove the generic raw SQL facade; strengthen the architecture guard; preserve locking, concurrency, and API behavior."
sections:
  Summary: |-
    Reduce raw SQL to irreducible Prisma primitives

    Replace straightforward raw SQL in admin, data-sync, decision, and write-pipeline paths with generated Prisma delegates; isolate unavoidable PostgreSQL operations as typed shared database functions; remove the generic raw SQL facade; strengthen the architecture guard; preserve locking, concurrency, and API behavior.
  Scope: |-
    - In scope: Replace straightforward raw SQL in admin, data-sync, decision, and write-pipeline paths with generated Prisma delegates; isolate unavoidable PostgreSQL operations as typed shared database functions; remove the generic raw SQL facade; strengthen the architecture guard; preserve locking, concurrency, and API behavior.
    - Out of scope: unrelated refactors not required for "Reduce raw SQL to irreducible Prisma primitives".
  Plan: |-
    Goal: make generated Prisma delegates the default database path and retain raw SQL only for PostgreSQL capabilities that Prisma cannot express.

    Scope:
    1. Replace simple reads, writes, upserts, and state transitions in AdminService, DataSyncRepository, WritePipelineRepository, and decision read paths with Prisma delegates.
    2. Keep only concurrency/system-catalog/read-model operations that require advisory locks, SKIP LOCKED, PostgreSQL catalogs, migration metadata, or materially more efficient relational read models.
    3. Move every retained raw statement behind a named, typed function in @wb-bidder/database.
    4. Remove createRawDatabaseClient, RawDatabaseClient, RawTransactionClient, queryParameterizedRaw, and generic SQL execution outside the shared database package.
    5. Strengthen the architecture guard to reject SQL facades and raw SQL calls outside @wb-bidder/database.

    Success criteria:
    - No generic .query(sql, params) compatibility surface remains.
    - No raw SQL text remains in app/domain repositories.
    - Prisma delegates implement all safely expressible CRUD/read/state-transition operations.
    - Retained raw functions have narrow typed inputs/outputs and rationale comments.
    - Existing API, transaction, locking, recovery, rate-limit, and decision behavior passes unchanged.

    Verify Steps:
    1. Run pnpm run prisma:generate, pnpm run prisma:validate, and pnpm run verify:database-architecture.
    2. Search apps/packages/tests for pg imports, Pool/PoolClient, createRawDatabaseClient, queryParameterizedRaw, generic database query facades, and direct Prisma raw APIs outside packages/database; expect no matches.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run scripts:check, and git diff --check.
    4. Run pnpm run test:unit, test:golden, test:property, test:openapi, and test:contract.
    5. Against PostgreSQL 18 run test:integration, test:e2e, test:load, and test:runbook.
    6. Run pnpm run build and smoke:built.
    7. Run agentplane doctor, node .agentplane/policy/check-routing.mjs, and confirm only intentional clean task state.

    Stop rules: request re-approval only if a schema migration, public API change, weakened concurrency guarantee, or material performance regression becomes necessary.
  Verify Steps: |-
    1. Run `pnpm run prisma:generate`, `pnpm run prisma:validate`, and `pnpm run verify:database-architecture`. Expected: schema/client valid and architectural guard passes.
    2. Search `apps`, `packages`, and `tests` for `pg`, `Pool`/`PoolClient`, `createRawDatabaseClient`, `queryParameterizedRaw`, generic `.query(sql, params)` facades, direct Prisma raw APIs outside `packages/database`, and SQL statement literals outside `packages/database`. Expected: no forbidden matches.
    3. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run scripts:check`, and `git diff --check`. Expected: all static checks pass.
    4. Run `pnpm run test:unit`, `pnpm run test:golden`, `pnpm run test:property`, `pnpm run test:openapi`, and `pnpm run test:contract`. Expected: domain and API behavior pass unchanged.
    5. Against PostgreSQL 18 run `pnpm run test:integration`, `pnpm run test:e2e`, `pnpm run test:load`, and `pnpm run test:runbook`. Expected: transaction, locking, recovery, rate-limit, decision, and write behavior passes.
    6. Run `pnpm run build` and `pnpm run smoke:built`. Expected: applications build and start successfully.
    7. Run `agentplane doctor`, `node .agentplane/policy/check-routing.mjs`, and inspect `git status --short --untracked-files=all`. Expected: policy passes and only intentional task changes remain.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T11:16:26.650Z — VERIFY — ok

    By: CODER

    Note: Refactor verified: raw.ts removed; non-SQL single-consumer readiness probe moved to ObservabilityService; shared transaction/lock utilities and domain SQL queries split into named modules. Quality, PostgreSQL 18 integration/e2e/load/runbook, build, and smoke checks pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T10:25:21.267Z, excerpt_hash=sha256:8c91eb3791b99c0913c50a769f13a2e2b59c04729a15eacbb168a5a70a3167d3

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607311024-NGX3E2/blueprint/resolved-snapshot.json
    - old_digest: e719322ab32bedf0df1aeba3b8704af3b5fcb43a594e105aaccee75e1b8390ec
    - current_digest: e719322ab32bedf0df1aeba3b8704af3b5fcb43a594e105aaccee75e1b8390ec
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607311024-NGX3E2

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607311024-NGX3E2
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: |-
    - Observation: All required verification commands passed; database architecture guard reports Prisma-only access with centralized raw SQL.
      Impact: Database package API now exposes responsibility-specific modules without a generic raw facade.
      Resolution: Retained only shared non-SQL helpers and PostgreSQL-specific query functions in the database package.
id_source: "generated"
---
## Summary

Reduce raw SQL to irreducible Prisma primitives

Replace straightforward raw SQL in admin, data-sync, decision, and write-pipeline paths with generated Prisma delegates; isolate unavoidable PostgreSQL operations as typed shared database functions; remove the generic raw SQL facade; strengthen the architecture guard; preserve locking, concurrency, and API behavior.

## Scope

- In scope: Replace straightforward raw SQL in admin, data-sync, decision, and write-pipeline paths with generated Prisma delegates; isolate unavoidable PostgreSQL operations as typed shared database functions; remove the generic raw SQL facade; strengthen the architecture guard; preserve locking, concurrency, and API behavior.
- Out of scope: unrelated refactors not required for "Reduce raw SQL to irreducible Prisma primitives".

## Plan

Goal: make generated Prisma delegates the default database path and retain raw SQL only for PostgreSQL capabilities that Prisma cannot express.

Scope:
1. Replace simple reads, writes, upserts, and state transitions in AdminService, DataSyncRepository, WritePipelineRepository, and decision read paths with Prisma delegates.
2. Keep only concurrency/system-catalog/read-model operations that require advisory locks, SKIP LOCKED, PostgreSQL catalogs, migration metadata, or materially more efficient relational read models.
3. Move every retained raw statement behind a named, typed function in @wb-bidder/database.
4. Remove createRawDatabaseClient, RawDatabaseClient, RawTransactionClient, queryParameterizedRaw, and generic SQL execution outside the shared database package.
5. Strengthen the architecture guard to reject SQL facades and raw SQL calls outside @wb-bidder/database.

Success criteria:
- No generic .query(sql, params) compatibility surface remains.
- No raw SQL text remains in app/domain repositories.
- Prisma delegates implement all safely expressible CRUD/read/state-transition operations.
- Retained raw functions have narrow typed inputs/outputs and rationale comments.
- Existing API, transaction, locking, recovery, rate-limit, and decision behavior passes unchanged.

Verify Steps:
1. Run pnpm run prisma:generate, pnpm run prisma:validate, and pnpm run verify:database-architecture.
2. Search apps/packages/tests for pg imports, Pool/PoolClient, createRawDatabaseClient, queryParameterizedRaw, generic database query facades, and direct Prisma raw APIs outside packages/database; expect no matches.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run scripts:check, and git diff --check.
4. Run pnpm run test:unit, test:golden, test:property, test:openapi, and test:contract.
5. Against PostgreSQL 18 run test:integration, test:e2e, test:load, and test:runbook.
6. Run pnpm run build and smoke:built.
7. Run agentplane doctor, node .agentplane/policy/check-routing.mjs, and confirm only intentional clean task state.

Stop rules: request re-approval only if a schema migration, public API change, weakened concurrency guarantee, or material performance regression becomes necessary.

## Verify Steps

1. Run `pnpm run prisma:generate`, `pnpm run prisma:validate`, and `pnpm run verify:database-architecture`. Expected: schema/client valid and architectural guard passes.
2. Search `apps`, `packages`, and `tests` for `pg`, `Pool`/`PoolClient`, `createRawDatabaseClient`, `queryParameterizedRaw`, generic `.query(sql, params)` facades, direct Prisma raw APIs outside `packages/database`, and SQL statement literals outside `packages/database`. Expected: no forbidden matches.
3. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run scripts:check`, and `git diff --check`. Expected: all static checks pass.
4. Run `pnpm run test:unit`, `pnpm run test:golden`, `pnpm run test:property`, `pnpm run test:openapi`, and `pnpm run test:contract`. Expected: domain and API behavior pass unchanged.
5. Against PostgreSQL 18 run `pnpm run test:integration`, `pnpm run test:e2e`, `pnpm run test:load`, and `pnpm run test:runbook`. Expected: transaction, locking, recovery, rate-limit, decision, and write behavior passes.
6. Run `pnpm run build` and `pnpm run smoke:built`. Expected: applications build and start successfully.
7. Run `agentplane doctor`, `node .agentplane/policy/check-routing.mjs`, and inspect `git status --short --untracked-files=all`. Expected: policy passes and only intentional task changes remain.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T11:16:26.650Z — VERIFY — ok

By: CODER

Note: Refactor verified: raw.ts removed; non-SQL single-consumer readiness probe moved to ObservabilityService; shared transaction/lock utilities and domain SQL queries split into named modules. Quality, PostgreSQL 18 integration/e2e/load/runbook, build, and smoke checks pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T10:25:21.267Z, excerpt_hash=sha256:8c91eb3791b99c0913c50a769f13a2e2b59c04729a15eacbb168a5a70a3167d3

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607311024-NGX3E2/blueprint/resolved-snapshot.json
- old_digest: e719322ab32bedf0df1aeba3b8704af3b5fcb43a594e105aaccee75e1b8390ec
- current_digest: e719322ab32bedf0df1aeba3b8704af3b5fcb43a594e105aaccee75e1b8390ec
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607311024-NGX3E2

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607311024-NGX3E2
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings

- Observation: All required verification commands passed; database architecture guard reports Prisma-only access with centralized raw SQL.
  Impact: Database package API now exposes responsibility-specific modules without a generic raw facade.
  Resolution: Retained only shared non-SQL helpers and PostgreSQL-specific query functions in the database package.
