---
id: "202607310804-H5383N"
title: "Renew write leases during pre-dispatch validation"
result_summary: "Renewed active write leases throughout pre-dispatch validation with fail-closed ownership checks."
status: "DONE"
priority: "high"
owner: "CODER"
revision: 11
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "reliability"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:22.880Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:57:07.305Z"
  updated_by: "CODER"
  note: "Slow-validation lease-heartbeat tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-07-31T08:59:09.274Z"
  updated_by: "EVALUATOR"
  note: "WriteExecutor now renews active owned leases throughout slow pre-dispatch validation and fails closed before dispatch on ownership loss."
  evaluated_sha: "2881252ff077b4b03ec7599316f503f2751cc7ed"
  blueprint_digest: "d560dde85b977119bae4cf44c81fee486143477128fddbb8b1b63a3671ca1582"
  evidence_refs:
    - ".agentplane/tasks/202607310804-H5383N/README.md"
    - ".agentplane/tasks/202607310804-H5383N/quality/20260731-085909274-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607310804-H5383N/quality/20260731-085909274-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607310804-H5383N/quality/20260731-085909274-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607310804-H5383N/blueprint/resolved-snapshot.json"
    - "commit:2881252ff077"
    - "tests/unit/write-pipeline.spec.ts"
    - "targeted write-pipeline unit suite: 7 passed"
    - "pnpm run format:check; pnpm run lint; pnpm run typecheck; pnpm run test:unit (115 passed)"
    - "PostgreSQL 18 migrations and full integration suite (31 passed)"
  findings:
    - "A per-batch heartbeat renews leases every third of the configured lease window and performs explicit ownership checks before prepare and commitDispatch."
    - "Rejected, released, and stale items are removed from the active heartbeat set before their queue transition, preventing unnecessary renewal."
    - "Focused tests cover validation beyond the original lease duration and prove that a short renewal count prevents admission, prepare, and dispatch."
commit:
  hash: "2881252ff077b4b03ec7599316f503f2751cc7ed"
  message: "🚧 H5383N task: renew pre-dispatch write leases"
comments:
  -
    author: "CODER"
    body: "Start: renew owned write leases across pre-dispatch validation and fail closed on lease loss."
  -
    author: "CODER"
    body: "Verified: write leases remain owned through slow validation, rejected items leave renewal, and lease loss prevents dispatch."
events:
  -
    type: "status"
    at: "2026-07-31T08:50:42.110Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: renew owned write leases across pre-dispatch validation and fail closed on lease loss."
  -
    type: "verify"
    at: "2026-07-31T08:57:07.305Z"
    author: "CODER"
    state: "ok"
    note: "Slow-validation lease-heartbeat tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed."
  -
    type: "status"
    at: "2026-07-31T08:59:19.464Z"
    author: "CODER"
    from: "DOING"
    to: "DONE"
    note: "Verified: write leases remain owned through slow validation, rejected items leave renewal, and lease loss prevents dispatch."
doc_version: 3
doc_updated_at: "2026-07-31T08:59:19.465Z"
doc_updated_by: "CODER"
description: "Heartbeat owned write-queue leases throughout potentially slow live reads and validation, fail safely on lease loss, and add regression coverage for long batches."
sections:
  Summary: "Keep write-queue leases alive throughout slow pre-dispatch reads and validation so active work cannot be reclaimed."
  Scope: |-
    - Renew leases while a claimed batch performs live reads and validation.
    - Track only items still owned by the worker.
    - Fail safely if heartbeat ownership is lost.
    - Add long-running batch and partial-failure regression tests.
  Plan: "Integrate bounded lease heartbeats into pre-dispatch processing, maintain the active owned-item set as items are rejected, define safe lease-loss behavior, and add timing-sensitive regression coverage."
  Verify Steps: |-
    1. Run targeted write-executor tests with validation time exceeding the original lease window.
    2. Verify rejected items leave the heartbeat set and lease loss prevents dispatch.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:57:07.305Z — VERIFY — ok

    By: CODER

    Note: Slow-validation lease-heartbeat tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:50:42.110Z, excerpt_hash=sha256:f712395786627d096c4f0e0e4bb3a10d3c12337e80876b5b6d7b54e0b72a7150

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-H5383N/blueprint/resolved-snapshot.json
    - old_digest: d560dde85b977119bae4cf44c81fee486143477128fddbb8b1b63a3671ca1582
    - current_digest: d560dde85b977119bae4cf44c81fee486143477128fddbb8b1b63a3671ca1582
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310804-H5383N

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310804-H5383N
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and reduce worker batch size or increase lease duration temporarily before resuming writes."
  Findings: |-
    - Observation: WriteExecutor claimed a batch once and performed sequential live reads and validation without renewing leases, allowing recovery to reclaim active work after the original lease window.
      Impact: A slow validation batch could lose ownership before PREPARED/DISPATCHING and either duplicate processing or fail at the dispatch boundary.
      Resolution: Added periodic per-batch heartbeats over the active owned-item set, removed rejected or released items from renewal, checked ownership before prepare and commit, and prevented dispatch after heartbeat lease loss.
id_source: "generated"
---
## Summary

Keep write-queue leases alive throughout slow pre-dispatch reads and validation so active work cannot be reclaimed.

## Scope

- Renew leases while a claimed batch performs live reads and validation.
- Track only items still owned by the worker.
- Fail safely if heartbeat ownership is lost.
- Add long-running batch and partial-failure regression tests.

## Plan

Integrate bounded lease heartbeats into pre-dispatch processing, maintain the active owned-item set as items are rejected, define safe lease-loss behavior, and add timing-sensitive regression coverage.

## Verify Steps

1. Run targeted write-executor tests with validation time exceeding the original lease window.
2. Verify rejected items leave the heartbeat set and lease loss prevents dispatch.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:57:07.305Z — VERIFY — ok

By: CODER

Note: Slow-validation lease-heartbeat tests passed; format, lint, typecheck, 115 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:50:42.110Z, excerpt_hash=sha256:f712395786627d096c4f0e0e4bb3a10d3c12337e80876b5b6d7b54e0b72a7150

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-H5383N/blueprint/resolved-snapshot.json
- old_digest: d560dde85b977119bae4cf44c81fee486143477128fddbb8b1b63a3671ca1582
- current_digest: d560dde85b977119bae4cf44c81fee486143477128fddbb8b1b63a3671ca1582
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310804-H5383N

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310804-H5383N
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and reduce worker batch size or increase lease duration temporarily before resuming writes.

## Findings

- Observation: WriteExecutor claimed a batch once and performed sequential live reads and validation without renewing leases, allowing recovery to reclaim active work after the original lease window.
  Impact: A slow validation batch could lose ownership before PREPARED/DISPATCHING and either duplicate processing or fail at the dispatch boundary.
  Resolution: Added periodic per-batch heartbeats over the active owned-item set, removed rejected or released items from renewal, checked ownership before prepare and commit, and prevented dispatch after heartbeat lease loss.
