---
id: "202607310804-Q3FC51"
title: "Recover expired manual-job and economics-import leases"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 9
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
  updated_at: "2026-07-31T08:05:21.868Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:40:00.630Z"
  updated_by: "CODER"
  note: "Expired lease recovery tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 29 integration tests passed."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: recover expired manual-job and economics-import leases without duplicating completed item effects."
events:
  -
    type: "status"
    at: "2026-07-31T08:32:56.620Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: recover expired manual-job and economics-import leases without duplicating completed item effects."
  -
    type: "verify"
    at: "2026-07-31T08:40:00.630Z"
    author: "CODER"
    state: "ok"
    note: "Expired lease recovery tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 29 integration tests passed."
doc_version: 3
doc_updated_at: "2026-07-31T08:40:00.717Z"
doc_updated_by: "CODER"
description: "Atomically reclaim expired RUNNING ManualJob and PROCESSING ProductEconomicsImport work after worker crashes without duplicating completed item effects; add recovery coverage."
sections:
  Summary: "Ensure expired manual-job and economics-import work resumes automatically and safely after worker crashes."
  Scope: |-
    - Atomically reclaim expired RUNNING ManualJob leases.
    - Atomically reclaim expired PROCESSING ProductEconomicsImport leases.
    - Preserve completed import-item effects and counters during replay.
    - Add crash-recovery and duplicate-effect regression tests.
  Plan: "Extend claim transactions to recover expired leases, make import item replay terminal-state aware and idempotent, and verify crash recovery for both work types."
  Verify Steps: |-
    1. Run targeted lease-expiry tests for manual jobs and economics imports.
    2. Verify completed import items are not applied twice after reclaim.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
    4. Run migration checks if schema changes are introduced.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:40:00.630Z — VERIFY — ok

    By: CODER

    Note: Expired lease recovery tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 29 integration tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:32:56.620Z, excerpt_hash=sha256:0523be23b4b956818313be89c6ad059a56804cc233ad495b6caa1b4fcae2d262

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-Q3FC51/blueprint/resolved-snapshot.json
    - old_digest: 8434e0de52759011097bae959fb282a1d1f0a906d1739350d8e042c1a2dfd787
    - current_digest: 8434e0de52759011097bae959fb282a1d1f0a906d1739350d8e042c1a2dfd787
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310804-Q3FC51

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310804-Q3FC51
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. If a migration was deployed, use a forward corrective migration and pause affected workers."
  Findings: |-
    - Observation: PROCESSING imports and RUNNING manual jobs were claimable only from QUEUED state and could remain stranded after worker crashes.
      Impact: Expired work is now reclaimed atomically; terminal import items are skipped and crash-window row effects replay idempotently.
      Resolution: Added expired-state claim paths, import lease heartbeats and terminal counter reconstruction, ownership-guarded manual completion, and PostgreSQL crash-recovery tests.
id_source: "generated"
---
## Summary

Ensure expired manual-job and economics-import work resumes automatically and safely after worker crashes.

## Scope

- Atomically reclaim expired RUNNING ManualJob leases.
- Atomically reclaim expired PROCESSING ProductEconomicsImport leases.
- Preserve completed import-item effects and counters during replay.
- Add crash-recovery and duplicate-effect regression tests.

## Plan

Extend claim transactions to recover expired leases, make import item replay terminal-state aware and idempotent, and verify crash recovery for both work types.

## Verify Steps

1. Run targeted lease-expiry tests for manual jobs and economics imports.
2. Verify completed import items are not applied twice after reclaim.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
4. Run migration checks if schema changes are introduced.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:40:00.630Z — VERIFY — ok

By: CODER

Note: Expired lease recovery tests passed; format, lint, typecheck, 113 unit tests, PostgreSQL 18 migrations, and 29 integration tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:32:56.620Z, excerpt_hash=sha256:0523be23b4b956818313be89c6ad059a56804cc233ad495b6caa1b4fcae2d262

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-Q3FC51/blueprint/resolved-snapshot.json
- old_digest: 8434e0de52759011097bae959fb282a1d1f0a906d1739350d8e042c1a2dfd787
- current_digest: 8434e0de52759011097bae959fb282a1d1f0a906d1739350d8e042c1a2dfd787
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310804-Q3FC51

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310804-Q3FC51
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. If a migration was deployed, use a forward corrective migration and pause affected workers.

## Findings

- Observation: PROCESSING imports and RUNNING manual jobs were claimable only from QUEUED state and could remain stranded after worker crashes.
  Impact: Expired work is now reclaimed atomically; terminal import items are skipped and crash-window row effects replay idempotently.
  Resolution: Added expired-state claim paths, import lease heartbeats and terminal counter reconstruction, ownership-guarded manual completion, and PostgreSQL crash-recovery tests.
