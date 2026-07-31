---
id: "202607310803-GHSSR3"
title: "Enforce fail-closed campaign status eligibility"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 9
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "safety"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:21.522Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:31:08.315Z"
  updated_by: "CODER"
  note: "Campaign status unit matrix passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 27 integration tests passed."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: enforce fail-closed campaign status eligibility across synchronization, decision inputs, and pre-dispatch validation."
events:
  -
    type: "status"
    at: "2026-07-31T08:22:50.224Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: enforce fail-closed campaign status eligibility across synchronization, decision inputs, and pre-dispatch validation."
  -
    type: "verify"
    at: "2026-07-31T08:31:08.315Z"
    author: "CODER"
    state: "ok"
    note: "Campaign status unit matrix passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 27 integration tests passed."
doc_version: 3
doc_updated_at: "2026-07-31T08:31:08.402Z"
doc_updated_by: "CODER"
description: "Allow bid application only for WB campaign statuses 9 and 11, keep status 7 statistics-only, reject stopped and unknown statuses, and add status-matrix coverage."
sections:
  Summary: "Make campaign write eligibility explicit and fail closed for unsupported or unknown WB statuses."
  Scope: |-
    - Permit APPLY only for campaign statuses 9 and 11.
    - Keep status 7 available for statistics synchronization but ineligible for writes.
    - Reject status 4 and all unknown statuses.
    - Add a complete status-matrix test across synchronization, decision inputs, and pre-dispatch validation.
  Plan: "Centralize or consistently apply the supported and writable campaign status sets across data sync, decision construction, and pre-dispatch validation, then add fail-closed regression coverage."
  Verify Steps: |-
    1. Run targeted campaign-status unit and integration tests for statuses 4, 7, 9, 11, and an unknown value.
    2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
    3. Run pnpm run test:unit and pnpm run test:integration.
    4. Confirm no unrelated status semantics changed.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:31:08.315Z — VERIFY — ok

    By: CODER

    Note: Campaign status unit matrix passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 27 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:22:50.224Z, excerpt_hash=sha256:26db33982b4f5ebb7792efb69585dacc92ab06b6fdef026e080f7a6c7a10aae9

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-GHSSR3/blueprint/resolved-snapshot.json
    - old_digest: 95a45f2d08778ee73eca811e4f6f71a09b6626c493ed17b4c826a25531983a11
    - current_digest: 95a45f2d08778ee73eca811e4f6f71a09b6626c493ed17b4c826a25531983a11
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310803-GHSSR3

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310803-GHSSR3
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and disable production writes if campaign eligibility becomes ambiguous."
  Findings: |-
    - Observation: Campaign status eligibility was previously represented by status != 4, allowing completed and unknown statuses into decision and write paths.
      Impact: Only statuses 9 and 11 can now reach APPLY; status 7 is statistics-only and every other status fails closed.
      Resolution: Centralized explicit status sets, filtered current/slow sync and Decision Job stages, hardened pre-dispatch validation, and added status-matrix coverage.
id_source: "generated"
---
## Summary

Make campaign write eligibility explicit and fail closed for unsupported or unknown WB statuses.

## Scope

- Permit APPLY only for campaign statuses 9 and 11.
- Keep status 7 available for statistics synchronization but ineligible for writes.
- Reject status 4 and all unknown statuses.
- Add a complete status-matrix test across synchronization, decision inputs, and pre-dispatch validation.

## Plan

Centralize or consistently apply the supported and writable campaign status sets across data sync, decision construction, and pre-dispatch validation, then add fail-closed regression coverage.

## Verify Steps

1. Run targeted campaign-status unit and integration tests for statuses 4, 7, 9, 11, and an unknown value.
2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
3. Run pnpm run test:unit and pnpm run test:integration.
4. Confirm no unrelated status semantics changed.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:31:08.315Z — VERIFY — ok

By: CODER

Note: Campaign status unit matrix passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 27 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:22:50.224Z, excerpt_hash=sha256:26db33982b4f5ebb7792efb69585dacc92ab06b6fdef026e080f7a6c7a10aae9

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-GHSSR3/blueprint/resolved-snapshot.json
- old_digest: 95a45f2d08778ee73eca811e4f6f71a09b6626c493ed17b4c826a25531983a11
- current_digest: 95a45f2d08778ee73eca811e4f6f71a09b6626c493ed17b4c826a25531983a11
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310803-GHSSR3

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310803-GHSSR3
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and disable production writes if campaign eligibility becomes ambiguous.

## Findings

- Observation: Campaign status eligibility was previously represented by status != 4, allowing completed and unknown statuses into decision and write paths.
  Impact: Only statuses 9 and 11 can now reach APPLY; status 7 is statistics-only and every other status fails closed.
  Resolution: Centralized explicit status sets, filtered current/slow sync and Decision Job stages, hardened pre-dispatch validation, and added status-matrix coverage.
