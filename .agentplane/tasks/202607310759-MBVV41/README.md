---
id: "202607310759-MBVV41"
title: "Fix bidding safety and concurrency defects"
result_summary: "No-op closure recorded and committed."
risk_level: "low"
breaking: false
status: "DONE"
priority: "high"
owner: "CODER"
revision: 13
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:00:33.962Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T09:07:50.450Z"
  updated_by: "CODER"
  note: "No-op umbrella closure verified: implementation was superseded before mutation by seven separately scoped and approved executable tasks; no repository code belongs to this task."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-07-31T09:08:01.072Z"
  updated_by: "EVALUATOR"
  note: "The umbrella task is correctly represented as a no-op closure after its approved scope was split into seven independently traceable tasks."
  evaluated_sha: "813e48c86e07d62d738cb3e52b3a6f16a4e10c8b"
  blueprint_digest: "c656347d6f6d1df6f34180d35c981a714cefce2dad4f2401e93ec557d1096ac1"
  evidence_refs:
    - ".agentplane/tasks/202607310759-MBVV41/README.md"
    - ".agentplane/tasks/202607310759-MBVV41/quality/20260731-090801072-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607310759-MBVV41/quality/20260731-090801072-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607310759-MBVV41/quality/20260731-090801072-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607310759-MBVV41/blueprint/resolved-snapshot.json"
    - "commit:2e0eef817d8e"
    - "task-local no-op verification commit:813e48c86e07"
  findings:
    - "No implementation paths are attributed to the umbrella task, preventing duplicate ownership and mixed commits."
    - "The task README records the seven replacement task IDs and the closure artifact is committed separately."
commit:
  hash: "813e48c86e07d62d738cb3e52b3a6f16a4e10c8b"
  message: "🚧 MBVV41 task: record no-op verification"
comments:
  -
    author: "CODER"
    body: "Start: implement approved bidding safety and concurrency fixes with regression coverage while preserving the parallel documentation task."
  -
    author: "ORCHESTRATOR"
    body: |-
      Verified: no implementation changes were required; closure is recorded as no-op bookkeeping.

      Note: Superseded before implementation by seven independently scoped and approved tasks: 202607310803-3PHC95, 202607310803-GHSSR3, 202607310804-Q3FC51, 202607310804-RK1D6P, 202607310804-RBA764, 202607310804-H5383N, and 202607310804-5K6MS9.
  -
    author: "ORCHESTRATOR"
    body: "Verified: superseded umbrella task is closed as no-op bookkeeping and its closure artifacts are committed separately."
events:
  -
    type: "status"
    at: "2026-07-31T08:00:49.262Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: implement approved bidding safety and concurrency fixes with regression coverage while preserving the parallel documentation task."
  -
    type: "status"
    at: "2026-07-31T08:05:23.585Z"
    author: "ORCHESTRATOR"
    from: "DOING"
    to: "DONE"
    note: |-
      Verified: no implementation changes were required; closure is recorded as no-op bookkeeping.

      Note: Superseded before implementation by seven independently scoped and approved tasks: 202607310803-3PHC95, 202607310803-GHSSR3, 202607310804-Q3FC51, 202607310804-RK1D6P, 202607310804-RBA764, 202607310804-H5383N, and 202607310804-5K6MS9.
  -
    type: "verify"
    at: "2026-07-31T09:07:50.450Z"
    author: "CODER"
    state: "ok"
    note: "No-op umbrella closure verified: implementation was superseded before mutation by seven separately scoped and approved executable tasks; no repository code belongs to this task."
  -
    type: "status"
    at: "2026-07-31T09:08:22.082Z"
    author: "ORCHESTRATOR"
    from: "DONE"
    to: "DONE"
    note: "Verified: superseded umbrella task is closed as no-op bookkeeping and its closure artifacts are committed separately."
doc_version: 3
doc_updated_at: "2026-07-31T09:08:22.084Z"
doc_updated_by: "ORCHESTRATOR"
description: "Correct stale-decision dispatch, campaign status eligibility, durable job/import lease recovery, replica-safe worker identity, concurrent manual-job deduplication, write lease heartbeats, and concurrent Admin idempotency; add regression coverage."
sections:
  Summary: "Fix the confirmed bidding safety and concurrency defects without touching the parallel data-model documentation task."
  Scope: |-
    - Prevent dispatch of a leased decision when a newer decision exists for the same target.
    - Restrict campaign APPLY eligibility to WB statuses 9 and 11; keep status 7 statistics-only and all other statuses fail-closed.
    - Recover expired ManualJob and ProductEconomicsImport leases after crashes and make worker identity replica-safe.
    - Serialize/deduplicate concurrent manual-job creation and concurrent Admin idempotency.
    - Renew write leases during bounded pre-dispatch work.
    - Add focused unit/integration regression coverage and any required forward-only migration.
    - Preserve docs/data-model.md and task 202607310754-31418S untouched.
  Plan: "Implement the seven confirmed safety/concurrency fixes as one backend task: latest-decision dispatch exclusion, strict campaign status gating, crash lease recovery, replica-safe owners, manual-job deduplication, write heartbeats, and concurrent Admin idempotency; add regression tests and full PostgreSQL verification."
  Verify Steps: |-
    1. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck. Expected: all pass with no warnings.
    2. Run pnpm run test:unit. Expected: all unit tests pass and coverage thresholds remain satisfied.
    3. Start an isolated PostgreSQL 18 database, apply pnpm run prisma:migrate:deploy, and run pnpm run test:integration. Expected: migrations and all integration tests pass, including new race/recovery cases.
    4. With the same isolated database, run pnpm run test:e2e and pnpm run test:runbook. Expected: all write-flow and operational tests pass.
    5. Run pnpm run build, pnpm run docs:check, pnpm run security:secrets, pnpm run security:container, ap doctor, and node .agentplane/policy/check-routing.mjs. Expected: all required gates pass; only documented pre-existing informational diagnostics are allowed.
    6. Run git status --short --untracked-files=all. Expected: only intentional task changes plus preserved artifacts of parallel task 202607310754-31418S are present.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T09:07:50.450Z — VERIFY — ok

    By: CODER

    Note: No-op umbrella closure verified: implementation was superseded before mutation by seven separately scoped and approved executable tasks; no repository code belongs to this task.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:05:23.585Z, excerpt_hash=sha256:1958982f63f2e7ce0e4ebd3715d1a26ee7e8da563c4d4ad9b4557990a983b234

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310759-MBVV41/blueprint/resolved-snapshot.json
    - old_digest: c656347d6f6d1df6f34180d35c981a714cefce2dad4f2401e93ec557d1096ac1
    - current_digest: c656347d6f6d1df6f34180d35c981a714cefce2dad4f2401e93ec557d1096ac1
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310759-MBVV41

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert the implementation commit for this task only.
    - Apply a forward corrective migration if database changes have already been deployed; do not rewrite migration history.
    - Keep WB production writes disabled until the corrected build is verified.
  Findings: |-
    - Observation: The original umbrella task was split before implementation into seven independently traceable defect tasks.
      Impact: Keeping implementation or verification claims on the umbrella would duplicate ownership and obscure task-specific commits.
      Resolution: Retained the umbrella as a no-op closure record and committed only its task documentation and resolved blueprint.
id_source: "generated"
---
## Summary

Fix the confirmed bidding safety and concurrency defects without touching the parallel data-model documentation task.

## Scope

- Prevent dispatch of a leased decision when a newer decision exists for the same target.
- Restrict campaign APPLY eligibility to WB statuses 9 and 11; keep status 7 statistics-only and all other statuses fail-closed.
- Recover expired ManualJob and ProductEconomicsImport leases after crashes and make worker identity replica-safe.
- Serialize/deduplicate concurrent manual-job creation and concurrent Admin idempotency.
- Renew write leases during bounded pre-dispatch work.
- Add focused unit/integration regression coverage and any required forward-only migration.
- Preserve docs/data-model.md and task 202607310754-31418S untouched.

## Plan

Implement the seven confirmed safety/concurrency fixes as one backend task: latest-decision dispatch exclusion, strict campaign status gating, crash lease recovery, replica-safe owners, manual-job deduplication, write heartbeats, and concurrent Admin idempotency; add regression tests and full PostgreSQL verification.

## Verify Steps

1. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck. Expected: all pass with no warnings.
2. Run pnpm run test:unit. Expected: all unit tests pass and coverage thresholds remain satisfied.
3. Start an isolated PostgreSQL 18 database, apply pnpm run prisma:migrate:deploy, and run pnpm run test:integration. Expected: migrations and all integration tests pass, including new race/recovery cases.
4. With the same isolated database, run pnpm run test:e2e and pnpm run test:runbook. Expected: all write-flow and operational tests pass.
5. Run pnpm run build, pnpm run docs:check, pnpm run security:secrets, pnpm run security:container, ap doctor, and node .agentplane/policy/check-routing.mjs. Expected: all required gates pass; only documented pre-existing informational diagnostics are allowed.
6. Run git status --short --untracked-files=all. Expected: only intentional task changes plus preserved artifacts of parallel task 202607310754-31418S are present.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T09:07:50.450Z — VERIFY — ok

By: CODER

Note: No-op umbrella closure verified: implementation was superseded before mutation by seven separately scoped and approved executable tasks; no repository code belongs to this task.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:05:23.585Z, excerpt_hash=sha256:1958982f63f2e7ce0e4ebd3715d1a26ee7e8da563c4d4ad9b4557990a983b234

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310759-MBVV41/blueprint/resolved-snapshot.json
- old_digest: c656347d6f6d1df6f34180d35c981a714cefce2dad4f2401e93ec557d1096ac1
- current_digest: c656347d6f6d1df6f34180d35c981a714cefce2dad4f2401e93ec557d1096ac1
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310759-MBVV41

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert the implementation commit for this task only.
- Apply a forward corrective migration if database changes have already been deployed; do not rewrite migration history.
- Keep WB production writes disabled until the corrected build is verified.

## Findings

- Observation: The original umbrella task was split before implementation into seven independently traceable defect tasks.
  Impact: Keeping implementation or verification claims on the umbrella would duplicate ownership and obscure task-specific commits.
  Resolution: Retained the umbrella as a no-op closure record and committed only its task documentation and resolved blueprint.
