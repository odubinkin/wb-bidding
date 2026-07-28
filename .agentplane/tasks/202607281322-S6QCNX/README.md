---
id: "202607281322-S6QCNX"
title: "Stage 2: data synchronization and statistical evidence"
status: "TODO"
priority: "high"
owner: "CODER"
revision: 3
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
  state: "pending"
  updated_at: null
  updated_by: null
  note: null
verification:
  state: "pending"
  updated_at: null
  updated_by: null
  note: null
  attempts: 0
commit: null
comments: []
events: []
doc_version: 3
doc_updated_at: "2026-07-28T13:24:53.775Z"
doc_updated_by: "PLANNER"
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
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
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
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
