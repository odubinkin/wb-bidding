---
id: "202607310804-RBA764"
title: "Deduplicate concurrent manual job creation"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 9
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "concurrency"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:22.542Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T09:04:15.891Z"
  updated_by: "CODER"
  note: "Manual-job concurrency tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 33 integration tests passed."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: deduplicate concurrent manual-job creation by normalized job type and scope."
events:
  -
    type: "status"
    at: "2026-07-31T09:01:00.819Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: deduplicate concurrent manual-job creation by normalized job type and scope."
  -
    type: "verify"
    at: "2026-07-31T09:04:15.891Z"
    author: "CODER"
    state: "ok"
    note: "Manual-job concurrency tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 33 integration tests passed."
doc_version: 3
doc_updated_at: "2026-07-31T09:04:15.991Z"
doc_updated_by: "CODER"
description: "Serialize manual-job creation for the same job type and canonical scope so concurrent requests cannot create duplicate active jobs; preserve and return the existing job state; add concurrency coverage."
sections:
  Summary: "Guarantee at most one active manual job exists for a given job type and canonical scope under concurrent requests."
  Scope: |-
    - Serialize createJob for the same type and canonical scope.
    - Return the existing job and its actual state when one is already active.
    - Preserve concurrency for unrelated job scopes.
    - Add a two-transaction concurrency regression test.
  Plan: "Acquire a transaction-scoped advisory lock derived from job type and canonical scope before checking for active work, return existing state accurately, and prove deduplication under concurrent creation."
  Verify Steps: |-
    1. Run targeted concurrent manual-job creation integration tests.
    2. Verify same-scope calls converge and different scopes do not block semantically.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T09:04:15.891Z — VERIFY — ok

    By: CODER

    Note: Manual-job concurrency tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 33 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:01:00.819Z, excerpt_hash=sha256:c194e7ff7f2cc21892e35f2f6982f75717464cb65bf4fed88e533c01e670ef22

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-RBA764/blueprint/resolved-snapshot.json
    - old_digest: 51de4d22bd84fac8b3d38d56a801b2118323a952b27dff391a330760c795d975
    - current_digest: 51de4d22bd84fac8b3d38d56a801b2118323a952b27dff391a330760c795d975
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310804-RBA764

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310804-RBA764
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. Remove any duplicate queued jobs created during rollback assessment before resuming workers."
  Findings: |-
    - Observation: Concurrent createJob calls with different idempotency keys could both observe no active ManualJob because FOR UPDATE cannot lock an absent row.
      Impact: Replica-concurrent Admin requests could enqueue duplicate active work for the same job type and canonical scope, and existing RUNNING jobs were incorrectly reported as QUEUED.
      Resolution: Added a transaction-scoped advisory lock keyed by job type and canonical scope, returned the stored active status, and covered same-scope convergence plus independent-scope progress in PostgreSQL tests.
id_source: "generated"
---
## Summary

Guarantee at most one active manual job exists for a given job type and canonical scope under concurrent requests.

## Scope

- Serialize createJob for the same type and canonical scope.
- Return the existing job and its actual state when one is already active.
- Preserve concurrency for unrelated job scopes.
- Add a two-transaction concurrency regression test.

## Plan

Acquire a transaction-scoped advisory lock derived from job type and canonical scope before checking for active work, return existing state accurately, and prove deduplication under concurrent creation.

## Verify Steps

1. Run targeted concurrent manual-job creation integration tests.
2. Verify same-scope calls converge and different scopes do not block semantically.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T09:04:15.891Z — VERIFY — ok

By: CODER

Note: Manual-job concurrency tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 33 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:01:00.819Z, excerpt_hash=sha256:c194e7ff7f2cc21892e35f2f6982f75717464cb65bf4fed88e533c01e670ef22

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-RBA764/blueprint/resolved-snapshot.json
- old_digest: 51de4d22bd84fac8b3d38d56a801b2118323a952b27dff391a330760c795d975
- current_digest: 51de4d22bd84fac8b3d38d56a801b2118323a952b27dff391a330760c795d975
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310804-RBA764

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310804-RBA764
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. Remove any duplicate queued jobs created during rollback assessment before resuming workers.

## Findings

- Observation: Concurrent createJob calls with different idempotency keys could both observe no active ManualJob because FOR UPDATE cannot lock an absent row.
  Impact: Replica-concurrent Admin requests could enqueue duplicate active work for the same job type and canonical scope, and existing RUNNING jobs were incorrectly reported as QUEUED.
  Resolution: Added a transaction-scoped advisory lock keyed by job type and canonical scope, returned the stored active status, and covered same-scope convergence plus independent-scope progress in PostgreSQL tests.
