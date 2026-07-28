---
id: "202607281322-FFPDDN"
title: "Stage 3: deterministic profit Decision Engine"
status: "TODO"
priority: "high"
owner: "CODER"
revision: 3
origin:
  system: "manual"
depends_on:
  - "202607281322-S6QCNX"
tags:
  - "backend"
  - "code"
task_kind: "code"
mutation_scope: "code"
risk_flags:
  - "security"
verify:
  - "pnpm run lint"
  - "pnpm run test:integration"
  - "pnpm run test:mutation"
  - "pnpm run test:property"
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
doc_updated_at: "2026-07-28T13:24:54.488Z"
doc_updated_by: "PLANNER"
description: "Implement immutable product economics and batch imports, policy versioning and assignment, exact fixed-point metrics, canonical checksums, evidence eligibility, PAVA, interpolation, candidate scoring, guardrails, lower-only exploration and revert state machine, explainability and observe-only behavior required by sections 2, 8-9, 17 and AC-04/05/06/17/20/21/22/26/27/28."
sections:
  Summary: |-
    Stage 3: deterministic profit Decision Engine

    Implement immutable product economics and batch imports, policy versioning and assignment, exact fixed-point metrics, canonical checksums, evidence eligibility, PAVA, interpolation, candidate scoring, guardrails, lower-only exploration and revert state machine, explainability and observe-only behavior required by sections 2, 8-9, 17 and AC-04/05/06/17/20/21/22/26/27/28.
  Scope: |-
    - In scope: Implement immutable product economics and batch imports, policy versioning and assignment, exact fixed-point metrics, canonical checksums, evidence eligibility, PAVA, interpolation, candidate scoring, guardrails, lower-only exploration and revert state machine, explainability and observe-only behavior required by sections 2, 8-9, 17 and AC-04/05/06/17/20/21/22/26/27/28.
    - Out of scope: unrelated refactors not required for "Stage 3: deterministic profit Decision Engine".
  Plan: |-
    1. Implement immutable product economics, conditional single updates, idempotent asynchronous batch imports and policy version/assignment resolution.
    2. Implement exact fixed-point metrics, RFC8785-scoped checksums and complete immutable input snapshots.
    3. Implement CPM/CPC bucket evidence, weighted PAVA, safety adjustments, rational interpolation, candidate construction, deterministic profit argmax and all reason codes.
    4. Implement guardrail ordering, daily-spend reserve behavior, zero-conversion protection, bounds/hysteresis/cooldown and fail-closed capability matrix.
    5. Implement lower-only BidExperiment lifecycle and safe/constrained revert using virtual-time compatible domain clocks.
    6. Add table-driven, property, golden, mutation and PostgreSQL integration tests proving AC-04/05/06/17/20/21/22/26/27/28.
  Verify Steps: |-
    1. Run pnpm run lint and pnpm run typecheck. Expected: domain logic is decorator-free, exact arithmetic is typed and documentation gates pass.
    2. Run pnpm run test:unit. Expected: formulas, zero denominators, signed contribution, windows, evidence thresholds, PAVA, interpolation, tie-breaks, bounds, reasons and exploration transitions pass.
    3. Run pnpm run test:property. Expected: deterministic inputs give identical checksums/results, no float money loss, no extrapolation, bounds/caps always hold and invalid/stale evidence never writes.
    4. Run pnpm run test:integration. Expected: immutable economics/policies, optimistic locking, partial batch import, checksum deduplication and supersession pass with PostgreSQL.
    5. Run pnpm run test:mutation. Expected: formula/guardrail mutation score reaches at least 80 percent, with surviving critical mutants resolved.
    6. Replay golden decision fixtures. Expected: selected candidate maximizes conservative expected marginal profit and every included/excluded bucket/candidate is explained with normative reason codes.
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

Stage 3: deterministic profit Decision Engine

Implement immutable product economics and batch imports, policy versioning and assignment, exact fixed-point metrics, canonical checksums, evidence eligibility, PAVA, interpolation, candidate scoring, guardrails, lower-only exploration and revert state machine, explainability and observe-only behavior required by sections 2, 8-9, 17 and AC-04/05/06/17/20/21/22/26/27/28.

## Scope

- In scope: Implement immutable product economics and batch imports, policy versioning and assignment, exact fixed-point metrics, canonical checksums, evidence eligibility, PAVA, interpolation, candidate scoring, guardrails, lower-only exploration and revert state machine, explainability and observe-only behavior required by sections 2, 8-9, 17 and AC-04/05/06/17/20/21/22/26/27/28.
- Out of scope: unrelated refactors not required for "Stage 3: deterministic profit Decision Engine".

## Plan

1. Implement immutable product economics, conditional single updates, idempotent asynchronous batch imports and policy version/assignment resolution.
2. Implement exact fixed-point metrics, RFC8785-scoped checksums and complete immutable input snapshots.
3. Implement CPM/CPC bucket evidence, weighted PAVA, safety adjustments, rational interpolation, candidate construction, deterministic profit argmax and all reason codes.
4. Implement guardrail ordering, daily-spend reserve behavior, zero-conversion protection, bounds/hysteresis/cooldown and fail-closed capability matrix.
5. Implement lower-only BidExperiment lifecycle and safe/constrained revert using virtual-time compatible domain clocks.
6. Add table-driven, property, golden, mutation and PostgreSQL integration tests proving AC-04/05/06/17/20/21/22/26/27/28.

## Verify Steps

1. Run pnpm run lint and pnpm run typecheck. Expected: domain logic is decorator-free, exact arithmetic is typed and documentation gates pass.
2. Run pnpm run test:unit. Expected: formulas, zero denominators, signed contribution, windows, evidence thresholds, PAVA, interpolation, tie-breaks, bounds, reasons and exploration transitions pass.
3. Run pnpm run test:property. Expected: deterministic inputs give identical checksums/results, no float money loss, no extrapolation, bounds/caps always hold and invalid/stale evidence never writes.
4. Run pnpm run test:integration. Expected: immutable economics/policies, optimistic locking, partial batch import, checksum deduplication and supersession pass with PostgreSQL.
5. Run pnpm run test:mutation. Expected: formula/guardrail mutation score reaches at least 80 percent, with surviving critical mutants resolved.
6. Replay golden decision fixtures. Expected: selected candidate maximizes conservative expected marginal profit and every included/excluded bucket/candidate is explained with normative reason codes.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
