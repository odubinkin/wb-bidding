---
id: "202607310759-MBVV41"
title: "Fix bidding safety and concurrency defects"
result_summary: "No-op closure recorded."
risk_level: "low"
breaking: false
status: "DONE"
priority: "high"
owner: "CODER"
revision: 10
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
  state: "pending"
  updated_at: null
  updated_by: null
  note: null
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: implement approved bidding safety and concurrency fixes with regression coverage while preserving the parallel documentation task."
  -
    author: "ORCHESTRATOR"
    body: |-
      Verified: no implementation changes were required; closure is recorded as no-op bookkeeping.

      Note: Superseded before implementation by seven independently scoped and approved tasks: 202607310803-3PHC95, 202607310803-GHSSR3, 202607310804-Q3FC51, 202607310804-RK1D6P, 202607310804-RBA764, 202607310804-H5383N, and 202607310804-5K6MS9.
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
doc_version: 3
doc_updated_at: "2026-07-31T08:05:23.585Z"
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
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert the implementation commit for this task only.
    - Apply a forward corrective migration if database changes have already been deployed; do not rewrite migration history.
    - Keep WB production writes disabled until the corrected build is verified.
  Findings: ""
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
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert the implementation commit for this task only.
- Apply a forward corrective migration if database changes have already been deployed; do not rewrite migration history.
- Keep WB production writes disabled until the corrected build is verified.

## Findings
