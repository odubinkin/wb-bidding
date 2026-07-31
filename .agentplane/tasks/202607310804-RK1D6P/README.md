---
id: "202607310804-RK1D6P"
title: "Make scheduler worker identities replica-safe"
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
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:22.211Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T09:12:31.996Z"
  updated_by: "CODER"
  note: "Scheduler identity and exact shutdown-release tests passed; format, lint, typecheck, and 117 unit tests passed."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: make scheduler worker identities unique per replica and scope shutdown cleanup to the exact process."
events:
  -
    type: "status"
    at: "2026-07-31T09:05:22.330Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: make scheduler worker identities unique per replica and scope shutdown cleanup to the exact process."
  -
    type: "verify"
    at: "2026-07-31T09:12:31.996Z"
    author: "CODER"
    state: "ok"
    note: "Scheduler identity and exact shutdown-release tests passed; format, lint, typecheck, and 117 unit tests passed."
doc_version: 3
doc_updated_at: "2026-07-31T09:12:32.098Z"
doc_updated_by: "CODER"
description: "Replace PID-only scheduler lease owners with a process-stable replica-unique identity and constrain graceful-shutdown lease release to the exact owning process; add coverage."
sections:
  Summary: "Guarantee scheduler lease-owner identities are unique across replicas, restarts, and PID reuse."
  Scope: |-
    - Replace PID-only lease-owner prefixes with hostname, PID, and boot UUID.
    - Keep the identity stable for the process lifetime.
    - Release only leases owned by the exact shutting-down process.
    - Add deterministic unit coverage for owner construction and shutdown matching.
  Plan: "Introduce a process-stable replica-unique scheduler identity, use exact owner values for each worker type, tighten graceful-shutdown release queries, and test collision avoidance."
  Verify Steps: |-
    1. Run targeted scheduler identity and shutdown-release unit tests.
    2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
    3. Run pnpm run test:unit.
    4. Confirm no lease owned by another process can match the shutdown cleanup predicate.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T09:12:31.996Z — VERIFY — ok

    By: CODER

    Note: Scheduler identity and exact shutdown-release tests passed; format, lint, typecheck, and 117 unit tests passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:05:22.330Z, excerpt_hash=sha256:1c9e1c3f9f778c78b67909ce5e690c1913c8c955aab628a1d56296fc9cdf8d8b

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-RK1D6P/blueprint/resolved-snapshot.json
    - old_digest: d0b493722424e2768d3007e62d199a0863d7b42cb5ff2bf3c1c19d6d76f034bd
    - current_digest: d0b493722424e2768d3007e62d199a0863d7b42cb5ff2bf3c1c19d6d76f034bd
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310804-RK1D6P

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310804-RK1D6P
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit; allow existing leases to expire naturally before restarting workers."
  Findings: |-
    - Observation: Scheduler lease owners used only the PID and graceful shutdown released owners by a PID prefix, allowing collisions across replicas and accidental cleanup after PID reuse.
      Impact: One replica could be indistinguishable from another and release or complete work leased by a different process incarnation.
      Resolution: Introduced a process-stable hostname, PID, and boot-UUID identity shared by scheduler and write workers; shutdown now releases only the two exact scheduler owner values, with deterministic unit coverage.
id_source: "generated"
---
## Summary

Guarantee scheduler lease-owner identities are unique across replicas, restarts, and PID reuse.

## Scope

- Replace PID-only lease-owner prefixes with hostname, PID, and boot UUID.
- Keep the identity stable for the process lifetime.
- Release only leases owned by the exact shutting-down process.
- Add deterministic unit coverage for owner construction and shutdown matching.

## Plan

Introduce a process-stable replica-unique scheduler identity, use exact owner values for each worker type, tighten graceful-shutdown release queries, and test collision avoidance.

## Verify Steps

1. Run targeted scheduler identity and shutdown-release unit tests.
2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
3. Run pnpm run test:unit.
4. Confirm no lease owned by another process can match the shutdown cleanup predicate.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T09:12:31.996Z — VERIFY — ok

By: CODER

Note: Scheduler identity and exact shutdown-release tests passed; format, lint, typecheck, and 117 unit tests passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T09:05:22.330Z, excerpt_hash=sha256:1c9e1c3f9f778c78b67909ce5e690c1913c8c955aab628a1d56296fc9cdf8d8b

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310804-RK1D6P/blueprint/resolved-snapshot.json
- old_digest: d0b493722424e2768d3007e62d199a0863d7b42cb5ff2bf3c1c19d6d76f034bd
- current_digest: d0b493722424e2768d3007e62d199a0863d7b42cb5ff2bf3c1c19d6d76f034bd
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310804-RK1D6P

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310804-RK1D6P
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit; allow existing leases to expire naturally before restarting workers.

## Findings

- Observation: Scheduler lease owners used only the PID and graceful shutdown released owners by a PID prefix, allowing collisions across replicas and accidental cleanup after PID reuse.
  Impact: One replica could be indistinguishable from another and release or complete work leased by a different process incarnation.
  Resolution: Introduced a process-stable hostname, PID, and boot-UUID identity shared by scheduler and write workers; shutdown now releases only the two exact scheduler owner values, with deterministic unit coverage.
