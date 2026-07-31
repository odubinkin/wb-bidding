---
id: "202607310914-VD45PJ"
title: "Migrate all database access to Prisma Client"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 8
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T09:15:21.304Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T09:55:01.278Z"
  updated_by: "CODER"
  note: "verified-202607310914-VD45PJ"
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: migrate every database access path to the shared Prisma Client, isolate unavoidable raw SQL in shared Prisma helpers, remove direct pg usage, and verify all database-backed behavior."
events:
  -
    type: "status"
    at: "2026-07-31T09:15:33.155Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: migrate every database access path to the shared Prisma Client, isolate unavoidable raw SQL in shared Prisma helpers, remove direct pg usage, and verify all database-backed behavior."
  -
    type: "verify"
    at: "2026-07-31T09:54:48.921Z"
    author: "CODER"
    state: "ok"
    note: "Prisma migration verified: schema generate/validate, architecture guard/searches, format/lint/typecheck/scripts, 117 unit tests, golden/property/openapi/contract, 33 integration tests, 3 e2e tests, 4 load tests, 28 runbook tests, full build and built-app smoke all pass."
  -
    type: "verify"
    at: "2026-07-31T09:55:01.278Z"
    author: "CODER"
    state: "ok"
    note: "verified-202607310914-VD45PJ"
doc_version: 3
doc_updated_at: "2026-07-31T09:55:01.353Z"
doc_updated_by: "CODER"
description: "Replace every runtime and test database access path based on node-postgres with the shared Prisma Client; isolate unavoidable raw SQL in shared Prisma helpers; remove direct pg dependencies and verify all database-backed modules end to end."
sections:
  Summary: |-
    Migrate all database access to Prisma Client

    Replace every runtime and test database access path based on node-postgres with the shared Prisma Client; isolate unavoidable raw SQL in shared Prisma helpers; remove direct pg dependencies and verify all database-backed modules end to end.
  Scope: |-
    - In scope: package manifests and lockfile; Prisma generator/client configuration; a shared database package; every DB consumer under apps/bidder and packages/data-sync, packages/decision-engine, packages/write-pipeline, and packages/wb-api; database-backed test harnesses and tests; build/container scripts affected by client generation; architecture and implementation documentation; automated enforcement against direct pg/raw SQL access.
    - Required behavior: Prisma Client is the only runtime database API. Model-safe operations use generated Prisma delegates. PostgreSQL-specific operations that genuinely require raw SQL use Prisma raw-query APIs only through shared typed functions. Existing transactions, advisory locks, leases, SKIP LOCKED claims, idempotency, audit, exact bigint behavior, and fail-closed semantics remain intact.
    - Out of scope: business-rule changes, API contract changes, destructive migrations, schema redesign, network actions, deployment, and unrelated refactors.
  Plan: "1. Inventory every production and test PostgreSQL access path, classify operations as Prisma model queries or unavoidable PostgreSQL-specific raw SQL, and map each operation to the shared schema. 2. Add one shared database package that owns Prisma Client lifecycle, transaction client types, PostgreSQL-specific raw SQL helpers, and the only permitted raw-query boundary. 3. Replace pg Pool/PoolClient usage in bidder, data-sync, decision-engine, write-pipeline, WB rate limiting, and database-backed tests with Prisma Client or shared Prisma transaction helpers while preserving transaction, lock, lease, SKIP LOCKED, JSON, bigint, and audit invariants. 4. Remove runtime node-postgres dependencies and direct raw SQL outside the shared layer; add an automated architectural guard that fails on regressions. 5. Update database architecture documentation and run schema, static, unit, integration, contract, E2E, load, runbook, build, and smoke verification; fix all regressions before closeout."
  Verify Steps: |-
    1. Run `pnpm run prisma:generate` and `pnpm run prisma:validate`. Expected: the shared generated Prisma Client and authoritative schema are valid.
    2. Run the database-access architecture guard plus repository searches. Expected: no production or test import of `pg`, no `Pool`/`PoolClient`, no direct `$queryRaw*`/`$executeRaw*` outside the shared database package, and no runtime `pg` dependency.
    3. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, and `pnpm run scripts:check`. Expected: all static and policy checks pass.
    4. Run `pnpm run test:unit`, `pnpm run test:golden`, `pnpm run test:property`, `pnpm run test:openapi`, and `pnpm run test:contract`. Expected: deterministic domain behavior and API contracts remain unchanged.
    5. Run `pnpm run test:integration`, `pnpm run test:e2e`, `pnpm run test:load`, and `pnpm run test:runbook`. Expected: all PostgreSQL-backed transaction, locking, recovery, rate-limit, decision, write, and operational flows pass through Prisma Client.
    6. Run `pnpm run build` and `pnpm run smoke:built`. Expected: both applications build with generated Prisma artifacts and start successfully.
    7. Run `agentplane doctor`, `node .agentplane/policy/check-routing.mjs`, `git diff --check`, and `git status --short --untracked-files=all`. Expected: workflow policy passes and only intentional task changes remain.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T09:54:48.921Z — VERIFY — ok

    By: CODER

    Note: Prisma migration verified: schema generate/validate, architecture guard/searches, format/lint/typecheck/scripts, 117 unit tests, golden/property/openapi/contract, 33 integration tests, 3 e2e tests, 4 load tests, 28 runbook tests, full build and built-app smoke all pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:15:33.155Z, excerpt_hash=sha256:8453c2acc6469c4fcb8bcca8bef13a3487e59eda600fe90e2b1c23cbdd6317c0

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310914-VD45PJ/blueprint/resolved-snapshot.json
    - old_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
    - current_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310914-VD45PJ

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310914-VD45PJ
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-31T09:55:01.278Z — VERIFY — ok

    By: CODER

    Note: verified-202607310914-VD45PJ
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:54:49.003Z, excerpt_hash=sha256:8453c2acc6469c4fcb8bcca8bef13a3487e59eda600fe90e2b1c23cbdd6317c0

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310914-VD45PJ/blueprint/resolved-snapshot.json
    - old_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
    - current_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310914-VD45PJ

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202607310914-VD45PJ --result verified-202607310914-VD45PJ --commit 3a97875e50a083febffd8dd0568f41dd2e478e2a
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
    - Observation: All database consumers use the shared Prisma Client; direct pg imports/dependencies and direct raw API calls outside packages/database are absent.
      Impact: Decision, synchronization, rate-limit, write, admin, runtime, and test database paths retain transaction and concurrency behavior through Prisma.
      Resolution: Centralized generated client and PostgreSQL-only raw primitives in @wb-bidder/database and added a regression guard.
id_source: "generated"
---
## Summary

Migrate all database access to Prisma Client

Replace every runtime and test database access path based on node-postgres with the shared Prisma Client; isolate unavoidable raw SQL in shared Prisma helpers; remove direct pg dependencies and verify all database-backed modules end to end.

## Scope

- In scope: package manifests and lockfile; Prisma generator/client configuration; a shared database package; every DB consumer under apps/bidder and packages/data-sync, packages/decision-engine, packages/write-pipeline, and packages/wb-api; database-backed test harnesses and tests; build/container scripts affected by client generation; architecture and implementation documentation; automated enforcement against direct pg/raw SQL access.
- Required behavior: Prisma Client is the only runtime database API. Model-safe operations use generated Prisma delegates. PostgreSQL-specific operations that genuinely require raw SQL use Prisma raw-query APIs only through shared typed functions. Existing transactions, advisory locks, leases, SKIP LOCKED claims, idempotency, audit, exact bigint behavior, and fail-closed semantics remain intact.
- Out of scope: business-rule changes, API contract changes, destructive migrations, schema redesign, network actions, deployment, and unrelated refactors.

## Plan

1. Inventory every production and test PostgreSQL access path, classify operations as Prisma model queries or unavoidable PostgreSQL-specific raw SQL, and map each operation to the shared schema. 2. Add one shared database package that owns Prisma Client lifecycle, transaction client types, PostgreSQL-specific raw SQL helpers, and the only permitted raw-query boundary. 3. Replace pg Pool/PoolClient usage in bidder, data-sync, decision-engine, write-pipeline, WB rate limiting, and database-backed tests with Prisma Client or shared Prisma transaction helpers while preserving transaction, lock, lease, SKIP LOCKED, JSON, bigint, and audit invariants. 4. Remove runtime node-postgres dependencies and direct raw SQL outside the shared layer; add an automated architectural guard that fails on regressions. 5. Update database architecture documentation and run schema, static, unit, integration, contract, E2E, load, runbook, build, and smoke verification; fix all regressions before closeout.

## Verify Steps

1. Run `pnpm run prisma:generate` and `pnpm run prisma:validate`. Expected: the shared generated Prisma Client and authoritative schema are valid.
2. Run the database-access architecture guard plus repository searches. Expected: no production or test import of `pg`, no `Pool`/`PoolClient`, no direct `$queryRaw*`/`$executeRaw*` outside the shared database package, and no runtime `pg` dependency.
3. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, and `pnpm run scripts:check`. Expected: all static and policy checks pass.
4. Run `pnpm run test:unit`, `pnpm run test:golden`, `pnpm run test:property`, `pnpm run test:openapi`, and `pnpm run test:contract`. Expected: deterministic domain behavior and API contracts remain unchanged.
5. Run `pnpm run test:integration`, `pnpm run test:e2e`, `pnpm run test:load`, and `pnpm run test:runbook`. Expected: all PostgreSQL-backed transaction, locking, recovery, rate-limit, decision, write, and operational flows pass through Prisma Client.
6. Run `pnpm run build` and `pnpm run smoke:built`. Expected: both applications build with generated Prisma artifacts and start successfully.
7. Run `agentplane doctor`, `node .agentplane/policy/check-routing.mjs`, `git diff --check`, and `git status --short --untracked-files=all`. Expected: workflow policy passes and only intentional task changes remain.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T09:54:48.921Z — VERIFY — ok

By: CODER

Note: Prisma migration verified: schema generate/validate, architecture guard/searches, format/lint/typecheck/scripts, 117 unit tests, golden/property/openapi/contract, 33 integration tests, 3 e2e tests, 4 load tests, 28 runbook tests, full build and built-app smoke all pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:15:33.155Z, excerpt_hash=sha256:8453c2acc6469c4fcb8bcca8bef13a3487e59eda600fe90e2b1c23cbdd6317c0

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310914-VD45PJ/blueprint/resolved-snapshot.json
- old_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
- current_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310914-VD45PJ

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310914-VD45PJ
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-31T09:55:01.278Z — VERIFY — ok

By: CODER

Note: verified-202607310914-VD45PJ
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:54:49.003Z, excerpt_hash=sha256:8453c2acc6469c4fcb8bcca8bef13a3487e59eda600fe90e2b1c23cbdd6317c0

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310914-VD45PJ/blueprint/resolved-snapshot.json
- old_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
- current_digest: 24ec3179fa3ca38e3c58d72530660a82b68bd4759ad99992dcb9354d58a437a9
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310914-VD45PJ

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202607310914-VD45PJ --result verified-202607310914-VD45PJ --commit 3a97875e50a083febffd8dd0568f41dd2e478e2a
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

- Observation: All database consumers use the shared Prisma Client; direct pg imports/dependencies and direct raw API calls outside packages/database are absent.
  Impact: Decision, synchronization, rate-limit, write, admin, runtime, and test database paths retain transaction and concurrency behavior through Prisma.
  Resolution: Centralized generated client and PostgreSQL-only raw primitives in @wb-bidder/database and added a regression guard.
