---
id: "202607281322-S6QCNX"
title: "Stage 2: data synchronization and statistical evidence"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 8
origin:
  system: "manual"
depends_on:
  - "202607281322-QKFWZS"
tags:
  - "backend"
  - "code"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run lint"
  - "pnpm run prisma:validate"
  - "pnpm run test:integration"
  - "pnpm run test:load-sync"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T14:43:34.243Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T15:15:20.222Z"
  updated_by: "CODER"
  note: "Implemented and verified production-safe data synchronization, PostgreSQL evidence, scheduler non-overlap/checkpoints, target snapshots, and 10k/100k capacity gates."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-07-28T15:14:58.730Z"
  updated_by: "EVALUATOR"
  note: "Stage 2 satisfies the approved synchronization/evidence scope and all local quality gates."
  evaluated_sha: "5aa1a1933b942c332a7ee5fc7ca4ab64c42aaf11"
  blueprint_digest: "9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa"
  evidence_refs:
    - ".agentplane/tasks/202607281322-S6QCNX/README.md"
    - ".agentplane/tasks/202607281322-S6QCNX/quality/20260728-151458730-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607281322-S6QCNX/quality/20260728-151458730-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607281322-S6QCNX/quality/20260728-151458730-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607281322-S6QCNX/blueprint/resolved-snapshot.json"
    - "commit:5aa1a19"
    - "pnpm run quality"
    - "pnpm run build"
    - "pnpm run smoke:built"
    - "DATABASE_URL=local-postgresql pnpm run test:integration"
    - "pnpm run test:load-sync"
  findings:
    - "Clean and populated PostgreSQL migrations, independent scheduler locks/checkpoints, fail-closed target snapshots, immutable/superseding performance evidence, 54 unit tests, 6 integration tests, and 10k/100k load test all passed."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: execute the user-approved Stage 2 data synchronization and statistical evidence plan in direct mode."
events:
  -
    type: "status"
    at: "2026-07-28T14:43:34.891Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: execute the user-approved Stage 2 data synchronization and statistical evidence plan in direct mode."
  -
    type: "verify"
    at: "2026-07-28T15:14:38.372Z"
    author: "CODER"
    state: "ok"
    note: "Stage 2 verification passed: Prisma validation; clean and populated PostgreSQL migration; 54 unit tests with 100% statements/lines; 6 PostgreSQL integration tests; 10k-campaign/100k-target bounded load; full quality, build, built smoke, and three Compose static configs."
  -
    type: "verify"
    at: "2026-07-28T15:15:20.222Z"
    author: "CODER"
    state: "ok"
    note: "Implemented and verified production-safe data synchronization, PostgreSQL evidence, scheduler non-overlap/checkpoints, target snapshots, and 10k/100k capacity gates."
doc_version: 3
doc_updated_at: "2026-07-28T15:15:20.296Z"
doc_updated_by: "CODER"
description: "Implement PostgreSQL models and migrations, scheduler leases and checkpoints, quota-aware incremental current-state and data sync, capability discovery, target snapshots, BidPerformanceDay finalization, freshness and completeness, late-attribution invalidation, audit and capacity metrics required by sections 7-8, 11, 13 and AC-03/16/18/21/26/27/29."
sections:
  Summary: |-
    Stage 2: data synchronization and statistical evidence

    Implement PostgreSQL models and migrations, scheduler leases and checkpoints, quota-aware incremental current-state and data sync, capability discovery, target snapshots, BidPerformanceDay finalization, freshness and completeness, late-attribution invalidation, audit and capacity metrics required by sections 7-8, 11, 13 and AC-03/16/18/21/26/27/29.
  Scope: |-
    - In scope: Implement PostgreSQL models and migrations, scheduler leases and checkpoints, quota-aware incremental current-state and data sync, capability discovery, target snapshots, BidPerformanceDay finalization, freshness and completeness, late-attribution invalidation, audit and capacity metrics required by sections 7-8, 11, 13 and AC-03/16/18/21/26/27/29.
    - Out of scope: unrelated refactors not required for "Stage 2: data synchronization and statistical evidence".
  Plan: |-
    1. Implement Prisma migrations and repositories for binding, campaigns, targets, raw statistics, finalized performance days, scheduler runs, snapshots and immutable audit.
    2. Implement independent scheduler jobs, PostgreSQL locks/leases, deadlines, cursors and non-overlap recovery.
    3. Implement quota-aware campaign discovery/current-state/minimum/statistics/cluster/recommendation/budget stages with atomic target-level completeness and freshness.
    4. Implement statistical-day normalization/finalization, continuous bid/configuration evidence, orderedUnits=shks enforcement and late-attribution supersession.
    5. Implement capacity/fairness calculations for 10,000 campaigns and 100,000 targets with SLA, lag and ETA metrics.
    6. Add real-PostgreSQL integration and bounded load tests for idempotency, recovery, gaps, external-control provenance and starvation resistance.
  Verify Steps: |-
    1. Run pnpm run prisma:validate. Expected: clean and populated migration paths succeed without destructive production operations.
    2. Run pnpm run lint, pnpm run typecheck and pnpm run test:unit. Expected: stage selection, freshness, capability, money normalization and statistical-day eligibility invariants pass.
    3. Run pnpm run test:integration against real PostgreSQL. Expected: scheduler locks, checkpoints, raw upsert, BidPerformanceDay finalization/supersession, singleton binding and audit append-only behavior pass.
    4. Run pnpm run test:load-sync. Expected: generated 10,000-campaign/100,000-target workload is paged, cursors remain fair, minimum-bid lower-bound/SLA calculations are correct and memory is bounded.
    5. Exercise default current-state schedule/deadline. Expected: no overlap, coverage invalidates on missed SLA, and decisions can consume only coherent target snapshots.
    6. Inspect negative fixtures. Expected: missing shks, ambiguous placement, NFC collision, stale/minimum gaps, shared-mode uncertain provenance and malformed monetary fields block APPLY with specified reasons.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T15:14:38.372Z — VERIFY — ok

    By: CODER

    Note: Stage 2 verification passed: Prisma validation; clean and populated PostgreSQL migration; 54 unit tests with 100% statements/lines; 6 PostgreSQL integration tests; 10k-campaign/100k-target bounded load; full quality, build, built smoke, and three Compose static configs.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T14:43:34.891Z, excerpt_hash=sha256:f401427f573264000283ab2dd1571d2f1bdc582bccf3e83d2353ea258919addc

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-S6QCNX/blueprint/resolved-snapshot.json
    - old_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
    - current_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281322-S6QCNX

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281322-S6QCNX
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T15:15:20.222Z — VERIFY — ok

    By: CODER

    Note: Implemented and verified production-safe data synchronization, PostgreSQL evidence, scheduler non-overlap/checkpoints, target snapshots, and 10k/100k capacity gates.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T15:14:38.463Z, excerpt_hash=sha256:f401427f573264000283ab2dd1571d2f1bdc582bccf3e83d2353ea258919addc

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-S6QCNX/blueprint/resolved-snapshot.json
    - old_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
    - current_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281322-S6QCNX

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: agentplane task next-action 202607281322-S6QCNX --explain
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: unsafe_shell_chain_route

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: |-
    - Observation: Local Docker daemon is unavailable, so image runtime execution was not repeated; built Node smoke and Compose config validation passed, while CI retains Docker image build gates.
      Impact: No Stage 2 functional gap; container runtime remains an external environment verification gap.
      Resolution: Retain CI image builds and repeat Docker runtime smoke on a host with an active daemon before release.
id_source: "generated"
---
## Summary

Stage 2: data synchronization and statistical evidence

Implement PostgreSQL models and migrations, scheduler leases and checkpoints, quota-aware incremental current-state and data sync, capability discovery, target snapshots, BidPerformanceDay finalization, freshness and completeness, late-attribution invalidation, audit and capacity metrics required by sections 7-8, 11, 13 and AC-03/16/18/21/26/27/29.

## Scope

- In scope: Implement PostgreSQL models and migrations, scheduler leases and checkpoints, quota-aware incremental current-state and data sync, capability discovery, target snapshots, BidPerformanceDay finalization, freshness and completeness, late-attribution invalidation, audit and capacity metrics required by sections 7-8, 11, 13 and AC-03/16/18/21/26/27/29.
- Out of scope: unrelated refactors not required for "Stage 2: data synchronization and statistical evidence".

## Plan

1. Implement Prisma migrations and repositories for binding, campaigns, targets, raw statistics, finalized performance days, scheduler runs, snapshots and immutable audit.
2. Implement independent scheduler jobs, PostgreSQL locks/leases, deadlines, cursors and non-overlap recovery.
3. Implement quota-aware campaign discovery/current-state/minimum/statistics/cluster/recommendation/budget stages with atomic target-level completeness and freshness.
4. Implement statistical-day normalization/finalization, continuous bid/configuration evidence, orderedUnits=shks enforcement and late-attribution supersession.
5. Implement capacity/fairness calculations for 10,000 campaigns and 100,000 targets with SLA, lag and ETA metrics.
6. Add real-PostgreSQL integration and bounded load tests for idempotency, recovery, gaps, external-control provenance and starvation resistance.

## Verify Steps

1. Run pnpm run prisma:validate. Expected: clean and populated migration paths succeed without destructive production operations.
2. Run pnpm run lint, pnpm run typecheck and pnpm run test:unit. Expected: stage selection, freshness, capability, money normalization and statistical-day eligibility invariants pass.
3. Run pnpm run test:integration against real PostgreSQL. Expected: scheduler locks, checkpoints, raw upsert, BidPerformanceDay finalization/supersession, singleton binding and audit append-only behavior pass.
4. Run pnpm run test:load-sync. Expected: generated 10,000-campaign/100,000-target workload is paged, cursors remain fair, minimum-bid lower-bound/SLA calculations are correct and memory is bounded.
5. Exercise default current-state schedule/deadline. Expected: no overlap, coverage invalidates on missed SLA, and decisions can consume only coherent target snapshots.
6. Inspect negative fixtures. Expected: missing shks, ambiguous placement, NFC collision, stale/minimum gaps, shared-mode uncertain provenance and malformed monetary fields block APPLY with specified reasons.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T15:14:38.372Z — VERIFY — ok

By: CODER

Note: Stage 2 verification passed: Prisma validation; clean and populated PostgreSQL migration; 54 unit tests with 100% statements/lines; 6 PostgreSQL integration tests; 10k-campaign/100k-target bounded load; full quality, build, built smoke, and three Compose static configs.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T14:43:34.891Z, excerpt_hash=sha256:f401427f573264000283ab2dd1571d2f1bdc582bccf3e83d2353ea258919addc

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-S6QCNX/blueprint/resolved-snapshot.json
- old_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
- current_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281322-S6QCNX

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281322-S6QCNX
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T15:15:20.222Z — VERIFY — ok

By: CODER

Note: Implemented and verified production-safe data synchronization, PostgreSQL evidence, scheduler non-overlap/checkpoints, target snapshots, and 10k/100k capacity gates.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T15:14:38.463Z, excerpt_hash=sha256:f401427f573264000283ab2dd1571d2f1bdc582bccf3e83d2353ea258919addc

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-S6QCNX/blueprint/resolved-snapshot.json
- old_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
- current_digest: 9028c2a150545abbd359e0af394692340e246e3680897a64d1f359ef3d8a96fa
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281322-S6QCNX

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: agentplane task next-action 202607281322-S6QCNX --explain
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: unsafe_shell_chain_route

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings

- Observation: Local Docker daemon is unavailable, so image runtime execution was not repeated; built Node smoke and Compose config validation passed, while CI retains Docker image build gates.
  Impact: No Stage 2 functional gap; container runtime remains an external environment verification gap.
  Resolution: Retain CI image builds and repeat Docker runtime smoke on a host with an active daemon before release.
