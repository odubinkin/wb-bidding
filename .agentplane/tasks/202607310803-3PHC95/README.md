---
id: "202607310803-3PHC95"
title: "Prevent dispatch of superseded bidding decisions"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 10
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
  updated_at: "2026-07-31T08:05:21.196Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:12:36.492Z"
  updated_by: "CODER"
  note: "verified-202607310803-3PHC95"
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: prevent dispatch of superseded bidding decisions and add focused race regression coverage."
events:
  -
    type: "status"
    at: "2026-07-31T08:05:51.348Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: prevent dispatch of superseded bidding decisions and add focused race regression coverage."
  -
    type: "verify"
    at: "2026-07-31T08:12:13.182Z"
    author: "CODER"
    state: "ok"
    note: "Targeted write-pipeline unit test passed; PostgreSQL 18 stale-decision integration regression passed; full format, lint, typecheck, 99 unit tests, migrations, and 26 integration tests passed."
  -
    type: "verify"
    at: "2026-07-31T08:12:36.492Z"
    author: "CODER"
    state: "ok"
    note: "verified-202607310803-3PHC95"
doc_version: 3
doc_updated_at: "2026-07-31T08:12:36.580Z"
doc_updated_by: "CODER"
description: "Serialize final dispatch validation with decision persistence so a leased decision cannot be sent after a newer decision for the same target exists; add race regression coverage."
sections:
  Summary: "Prevent any stale leased decision from reaching WB after a newer decision is persisted for the same target."
  Scope: |-
    - Serialize the final dispatch decision with decision persistence using the same target-level lock.
    - Mark a superseded queued write terminally without sending it.
    - Add an integration race test covering a newer decision arriving after the old decision was leased.
    - Do not change unrelated campaign or scheduler behavior.
  Plan: "Add a transactionally serialized latest-decision check immediately before dispatch commit, handle the superseded outcome explicitly in the write executor, and add focused race regression tests."
  Verify Steps: |-
    1. Run targeted write-pipeline unit and integration tests, including the stale leased-decision race.
    2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
    3. Run pnpm run test:unit and pnpm run test:integration against isolated PostgreSQL 18.
    4. Run git status --short and confirm only this task's changes plus known parallel-task artifacts.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:12:13.182Z — VERIFY — ok

    By: CODER

    Note: Targeted write-pipeline unit test passed; PostgreSQL 18 stale-decision integration regression passed; full format, lint, typecheck, 99 unit tests, migrations, and 26 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:05:51.348Z, excerpt_hash=sha256:28e2576afb9b7bab6a27b8471dc82a8f38dd643a2153ed729c10a3b32e6b1d6a

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-3PHC95/blueprint/resolved-snapshot.json
    - old_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
    - current_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310803-3PHC95

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310803-3PHC95
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-31T08:12:36.492Z — VERIFY — ok

    By: CODER

    Note: verified-202607310803-3PHC95
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:12:13.298Z, excerpt_hash=sha256:28e2576afb9b7bab6a27b8471dc82a8f38dd643a2153ed729c10a3b32e6b1d6a

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-3PHC95/blueprint/resolved-snapshot.json
    - old_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
    - current_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310803-3PHC95

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202607310803-3PHC95 --result verified-202607310803-3PHC95 --commit eca135488c2c2a4d6ab10a6bb94941574b0020ce
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. Keep production writes disabled until the previous safe version is restored."
  Findings: |-
    - Observation: A newer target decision is now detected under the same advisory lock used by decision persistence before DISPATCHING is committed.
      Impact: A stale leased decision is rejected without WB I/O and the queue item becomes terminal SUPERSEDED.
      Resolution: Added serialized latest-decision validation, explicit executor handling, and PostgreSQL regression coverage.
id_source: "generated"
---
## Summary

Prevent any stale leased decision from reaching WB after a newer decision is persisted for the same target.

## Scope

- Serialize the final dispatch decision with decision persistence using the same target-level lock.
- Mark a superseded queued write terminally without sending it.
- Add an integration race test covering a newer decision arriving after the old decision was leased.
- Do not change unrelated campaign or scheduler behavior.

## Plan

Add a transactionally serialized latest-decision check immediately before dispatch commit, handle the superseded outcome explicitly in the write executor, and add focused race regression tests.

## Verify Steps

1. Run targeted write-pipeline unit and integration tests, including the stale leased-decision race.
2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
3. Run pnpm run test:unit and pnpm run test:integration against isolated PostgreSQL 18.
4. Run git status --short and confirm only this task's changes plus known parallel-task artifacts.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:12:13.182Z — VERIFY — ok

By: CODER

Note: Targeted write-pipeline unit test passed; PostgreSQL 18 stale-decision integration regression passed; full format, lint, typecheck, 99 unit tests, migrations, and 26 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:05:51.348Z, excerpt_hash=sha256:28e2576afb9b7bab6a27b8471dc82a8f38dd643a2153ed729c10a3b32e6b1d6a

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-3PHC95/blueprint/resolved-snapshot.json
- old_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
- current_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310803-3PHC95

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310803-3PHC95
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-31T08:12:36.492Z — VERIFY — ok

By: CODER

Note: verified-202607310803-3PHC95
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:12:13.298Z, excerpt_hash=sha256:28e2576afb9b7bab6a27b8471dc82a8f38dd643a2153ed729c10a3b32e6b1d6a

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310803-3PHC95/blueprint/resolved-snapshot.json
- old_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
- current_digest: 5f1703beb938fa4407f0a7c29ffc581fb8a67925f555eb63f3fd8ad44bb2a2c3
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310803-3PHC95

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202607310803-3PHC95 --result verified-202607310803-3PHC95 --commit eca135488c2c2a4d6ab10a6bb94941574b0020ce
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. Keep production writes disabled until the previous safe version is restored.

## Findings

- Observation: A newer target decision is now detected under the same advisory lock used by decision persistence before DISPATCHING is committed.
  Impact: A stale leased decision is rejected without WB I/O and the queue item becomes terminal SUPERSEDED.
  Resolution: Added serialized latest-decision validation, explicit executor handling, and PostgreSQL regression coverage.
