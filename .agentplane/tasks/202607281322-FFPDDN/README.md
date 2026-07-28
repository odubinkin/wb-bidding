---
id: "202607281322-FFPDDN"
title: "Stage 3: deterministic profit Decision Engine"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 6
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
  state: "approved"
  updated_at: "2026-07-28T15:15:46.382Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T15:45:56.175Z"
  updated_by: "CODER"
  note: "Stage 3 verification passed: lint/typecheck; 83 unit tests at 98.10% statements/98.06% lines/90.13% branches; 3 property tests; versioned golden replay; 100% source mutation score (9/9 critical mutants killed); 10 real-PostgreSQL integration tests including clean/populated migration; full quality, build, built smoke, and Compose static validation."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: execute the user-approved Stage 3 deterministic profit Decision Engine plan in direct mode."
events:
  -
    type: "status"
    at: "2026-07-28T15:15:52.101Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: execute the user-approved Stage 3 deterministic profit Decision Engine plan in direct mode."
  -
    type: "verify"
    at: "2026-07-28T15:45:56.175Z"
    author: "CODER"
    state: "ok"
    note: "Stage 3 verification passed: lint/typecheck; 83 unit tests at 98.10% statements/98.06% lines/90.13% branches; 3 property tests; versioned golden replay; 100% source mutation score (9/9 critical mutants killed); 10 real-PostgreSQL integration tests including clean/populated migration; full quality, build, built smoke, and Compose static validation."
doc_version: 3
doc_updated_at: "2026-07-28T15:45:56.377Z"
doc_updated_by: "CODER"
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
    ### 2026-07-28T15:45:56.175Z — VERIFY — ok

    By: CODER

    Note: Stage 3 verification passed: lint/typecheck; 83 unit tests at 98.10% statements/98.06% lines/90.13% branches; 3 property tests; versioned golden replay; 100% source mutation score (9/9 critical mutants killed); 10 real-PostgreSQL integration tests including clean/populated migration; full quality, build, built smoke, and Compose static validation.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T15:15:52.101Z, excerpt_hash=sha256:2f822f83ffed5de6c167072fe1473ffc3b364a47731984b9282c0073fdbdeeb9

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-FFPDDN/blueprint/resolved-snapshot.json
    - old_digest: 5fbb8b8ede01fe05d539d84e03348d6e3fc9e4ddb1c5859c88e64761bd35c177
    - current_digest: 5fbb8b8ede01fe05d539d84e03348d6e3fc9e4ddb1c5859c88e64761bd35c177
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281322-FFPDDN

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281322-FFPDDN
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: |-
    - Observation: Local Docker daemon remains unavailable; container runtime smoke was not repeated, while built Node smoke and static Compose validation passed.
      Impact: No Decision Engine functional gap; image runtime remains an external environment verification gate retained in CI/release.
      Resolution: Repeat image runtime and Compose end-to-end gates on the release host with an active Docker daemon.
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
### 2026-07-28T15:45:56.175Z — VERIFY — ok

By: CODER

Note: Stage 3 verification passed: lint/typecheck; 83 unit tests at 98.10% statements/98.06% lines/90.13% branches; 3 property tests; versioned golden replay; 100% source mutation score (9/9 critical mutants killed); 10 real-PostgreSQL integration tests including clean/populated migration; full quality, build, built smoke, and Compose static validation.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T15:15:52.101Z, excerpt_hash=sha256:2f822f83ffed5de6c167072fe1473ffc3b364a47731984b9282c0073fdbdeeb9

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-FFPDDN/blueprint/resolved-snapshot.json
- old_digest: 5fbb8b8ede01fe05d539d84e03348d6e3fc9e4ddb1c5859c88e64761bd35c177
- current_digest: 5fbb8b8ede01fe05d539d84e03348d6e3fc9e4ddb1c5859c88e64761bd35c177
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281322-FFPDDN

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281322-FFPDDN
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings

- Observation: Local Docker daemon remains unavailable; container runtime smoke was not repeated, while built Node smoke and static Compose validation passed.
  Impact: No Decision Engine functional gap; image runtime remains an external environment verification gate retained in CI/release.
  Resolution: Repeat image runtime and Compose end-to-end gates on the release host with an active Docker daemon.
