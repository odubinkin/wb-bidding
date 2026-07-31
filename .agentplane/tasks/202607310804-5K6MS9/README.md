---
id: "202607310804-5K6MS9"
title: "Serialize concurrent Admin API idempotency"
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
  updated_at: "2026-07-31T08:05:23.239Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:48:39.781Z"
  updated_by: "CODER"
  note: "Concurrent Admin idempotency tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: serialize concurrent Admin API idempotency while preserving independent-key concurrency."
events:
  -
    type: "status"
    at: "2026-07-31T08:42:05.684Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: serialize concurrent Admin API idempotency while preserving independent-key concurrency."
  -
    type: "verify"
    at: "2026-07-31T08:48:39.781Z"
    author: "CODER"
    state: "ok"
    note: "Concurrent Admin idempotency tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed."
doc_version: 3
doc_updated_at: "2026-07-31T08:48:39.865Z"
doc_updated_by: "CODER"
description: "Acquire transaction-scoped idempotency locks before replay checks across Admin mutations so concurrent requests with the same key converge on one effect and one replayable result; add concurrency coverage."
sections:
  Summary: "Make concurrent Admin API mutations with the same idempotency key converge on one committed effect and replayable result."
  Scope: |-
    - Lock each Admin idempotency scope and key before its replay check.
    - Cover service-owned and delegated repository mutations.
    - Preserve independent execution for different keys.
    - Add concurrent success, replay, and error-path regression tests.
  Plan: "Add transaction-scoped advisory idempotency locks before replay reads in every Admin mutation path, retain existing response-hash semantics, and verify same-key concurrency across service and repository implementations."
  Verify Steps: |-
    1. Run targeted concurrent Admin mutation integration tests for service-owned and delegated paths.
    2. Verify one side effect, identical replay response, and no unnecessary serialization for different keys.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:48:39.781Z — VERIFY — ok

    By: CODER

    Note: Concurrent Admin idempotency tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:42:05.684Z, excerpt_hash=sha256:334129086886fa5110a490d6137f002b3652089bf4cd898c9e506ca5046c19ac

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-5K6MS9/blueprint/resolved-snapshot.json
    - old_digest: 7b27ced10a8012877182d899c5035cec8ee3d5bb4226104be508b0655a548e23
    - current_digest: 7b27ced10a8012877182d899c5035cec8ee3d5bb4226104be508b0655a548e23
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310804-5K6MS9

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310804-5K6MS9
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and keep high-risk Admin mutations serialized operationally until a corrected build is deployed."
  Findings: |-
    - Observation: A row lock on an absent idempotency record allowed concurrent same-key requests to pass replay checks before either transaction inserted the record.
      Impact: Concurrent retries could return a unique-key or stale-version error instead of the committed replay response, despite rolling back the losing side effect.
      Resolution: Acquired transaction-scoped advisory locks per Admin scope and key before replay checks in service-owned, decision-engine, import, economics, and write-pipeline mutation paths; added same-key, mismatched-payload, and independent-key PostgreSQL coverage.
id_source: "generated"
---
## Summary

Make concurrent Admin API mutations with the same idempotency key converge on one committed effect and replayable result.

## Scope

- Lock each Admin idempotency scope and key before its replay check.
- Cover service-owned and delegated repository mutations.
- Preserve independent execution for different keys.
- Add concurrent success, replay, and error-path regression tests.

## Plan

Add transaction-scoped advisory idempotency locks before replay reads in every Admin mutation path, retain existing response-hash semantics, and verify same-key concurrency across service and repository implementations.

## Verify Steps

1. Run targeted concurrent Admin mutation integration tests for service-owned and delegated paths.
2. Verify one side effect, identical replay response, and no unnecessary serialization for different keys.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:48:39.781Z — VERIFY — ok

By: CODER

Note: Concurrent Admin idempotency tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 31 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:42:05.684Z, excerpt_hash=sha256:334129086886fa5110a490d6137f002b3652089bf4cd898c9e506ca5046c19ac

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-5K6MS9/blueprint/resolved-snapshot.json
- old_digest: 7b27ced10a8012877182d899c5035cec8ee3d5bb4226104be508b0655a548e23
- current_digest: 7b27ced10a8012877182d899c5035cec8ee3d5bb4226104be508b0655a548e23
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310804-5K6MS9

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310804-5K6MS9
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and keep high-risk Admin mutations serialized operationally until a corrected build is deployed.

## Findings

- Observation: A row lock on an absent idempotency record allowed concurrent same-key requests to pass replay checks before either transaction inserted the record.
  Impact: Concurrent retries could return a unique-key or stale-version error instead of the committed replay response, despite rolling back the losing side effect.
  Resolution: Acquired transaction-scoped advisory locks per Admin scope and key before replay checks in service-owned, decision-engine, import, economics, and write-pipeline mutation paths; added same-key, mismatched-payload, and independent-key PostgreSQL coverage.
