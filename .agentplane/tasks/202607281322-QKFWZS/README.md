---
id: "202607281322-QKFWZS"
title: "Stage 1: WB adapter, rate limiter and deterministic mock"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 7
origin:
  system: "manual"
depends_on:
  - "202607281321-E58Y7W"
tags:
  - "backend"
  - "code"
task_kind: "code"
mutation_scope: "code"
risk_flags:
  - "network"
  - "security"
verify:
  - "docker compose -f docker-compose.mock-only.yml config"
  - "pnpm run lint"
  - "pnpm run test:contract"
  - "pnpm run test:mock-openapi"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T13:55:18.236Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T14:42:06.120Z"
  updated_by: "CODER"
  note: "Stage 1 local verification passed: quality, build, built-process smoke, WB consumer/OpenAPI contracts, deterministic virtual-time/fault scenarios, clean PostgreSQL migration and cross-replica limiter integration, and all Compose configs. Official WB evidence is pinned; uncertain cluster/budget/fullstats/same-day semantics remain UNVERIFIED and fail-closed."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-07-28T14:42:44.386Z"
  updated_by: "EVALUATOR"
  note: "Stage 1 adapter, distributed limiter, deterministic mock and contracts satisfy approved scope with fail-closed uncertain WB semantics."
  evaluated_sha: "1c5d82e00a9aceb982bb0c0b5e7666a4ca8fbd50"
  blueprint_digest: "226d93ae7730451d39ca4e20b8a491c481eb75470b615bf4ec3c753a24218e08"
  evidence_refs:
    - ".agentplane/tasks/202607281322-QKFWZS/README.md"
    - ".agentplane/tasks/202607281322-QKFWZS/quality/20260728-144244386-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607281322-QKFWZS/quality/20260728-144244386-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607281322-QKFWZS/quality/20260728-144244386-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607281322-QKFWZS/blueprint/resolved-snapshot.json"
    - "pnpm run quality; pnpm run build; pnpm run smoke:built; pnpm run test:integration; docker compose -f docker-compose.mock-only.yml config"
  findings:
    - "Quality/build/smoke/contracts/OpenAPI and PostgreSQL limiter integration passed; Docker daemon is externally unavailable locally, while CI retains Docker build gates."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-28T13:55:28.443Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T14:42:06.120Z"
    author: "CODER"
    state: "ok"
    note: "Stage 1 local verification passed: quality, build, built-process smoke, WB consumer/OpenAPI contracts, deterministic virtual-time/fault scenarios, clean PostgreSQL migration and cross-replica limiter integration, and all Compose configs. Official WB evidence is pinned; uncertain cluster/budget/fullstats/same-day semantics remain UNVERIFIED and fail-closed."
doc_version: 3
doc_updated_at: "2026-07-28T14:42:06.201Z"
doc_updated_by: "CODER"
description: "Implement versioned WB endpoint profiles/runtime schemas, token and account-binding validation, exact wire normalization, distributed rate limiting, retries/circuit breakers, WB adapter modes, deterministic NestJS mock with virtual clock, fault injection, request journal, Swagger, fixtures and consumer contract tests required by sections 4, 8, 12, 15 and AC-02/10/13/19/23/24/27/29/30."
sections:
  Summary: |-
    Stage 1: WB adapter, rate limiter and deterministic mock

    Implement versioned WB endpoint profiles/runtime schemas, token and account-binding validation, exact wire normalization, distributed rate limiting, retries/circuit breakers, WB adapter modes, deterministic NestJS mock with virtual clock, fault injection, request journal, Swagger, fixtures and consumer contract tests required by sections 4, 8, 12, 15 and AC-02/10/13/19/23/24/27/29/30.
  Scope: |-
    - In scope: Implement versioned WB endpoint profiles/runtime schemas, token and account-binding validation, exact wire normalization, distributed rate limiting, retries/circuit breakers, WB adapter modes, deterministic NestJS mock with virtual clock, fault injection, request journal, Swagger, fixtures and consumer contract tests required by sections 4, 8, 12, 15 and AC-02/10/13/19/23/24/27/29/30.
    - Out of scope: unrelated refactors not required for "Stage 1: WB adapter, rate limiter and deterministic mock".
  Plan: |-
    1. Implement endpoint-keyed WB transport DTOs, runtime schemas, unit normalization and token/environment capability profiles from the pinned evidence artifact.
    2. Implement account identity/binding validation, redirect and host safety, retries, error classification, circuit breakers and account-wide distributed rate limiting.
    3. Implement all required WB read/write adapter methods while fail-closing deprecated or unverified capabilities.
    4. Build the independent deterministic NestJS wb-mock with in-memory seed state, virtual clock, scenarios, fault injection, rate headers, delayed visibility and request journal.
    5. Add redacted fixtures, checksums, generated Swagger/OpenAPI and exhaustive consumer/adapter contracts, preserving external unverifiable contracts as UNVERIFIED.
    6. Record official-source verification evidence and exact supported/unsupported wire semantics without enabling production writes.
  Verify Steps: |-
    1. Run pnpm run lint and pnpm run typecheck. Expected: adapter boundaries validate unknown input immediately and all public/private callables satisfy JSDoc policy.
    2. Run pnpm run test:unit. Expected: exact field units, JWT profiles, host/redirect safety, limiter selection, headers, retry/backoff, error classes and breakers pass.
    3. Run pnpm run test:contract. Expected: every required WB method/path, batch boundary, schema, enum, unit, error and rate-limit fixture passes against the deterministic mock; deprecated pairs are rejected.
    4. Run pnpm run test:mock-openapi. Expected: WB-compatible paths and all service endpoints under /__mock are documented and runtime DTOs match OpenAPI.
    5. Run docker compose -f docker-compose.mock-only.yml config and its smoke command documented in README. Expected: mock starts without PostgreSQL, resets deterministically and serves health/docs.
    6. Exercise virtual time and fault scenarios. Expected: time advance produces deterministic daily rows/checksums and 429, delayed visibility, partial failure and ambiguous transport outcomes are observable without wall-clock day waits.
    7. Inspect endpoint profile evidence. Expected: exact official-source URLs/date/checksums are pinned, and cluster write/delete, budget and same-day contracts stay fail-closed unless reproducible evidence qualifies them as VERIFIED.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T14:42:06.120Z — VERIFY — ok

    By: CODER

    Note: Stage 1 local verification passed: quality, build, built-process smoke, WB consumer/OpenAPI contracts, deterministic virtual-time/fault scenarios, clean PostgreSQL migration and cross-replica limiter integration, and all Compose configs. Official WB evidence is pinned; uncertain cluster/budget/fullstats/same-day semantics remain UNVERIFIED and fail-closed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T13:55:28.443Z, excerpt_hash=sha256:a9586e9a0c94107508fa1750f05d04a5d3b935366429828523dd5e41830bf5fc

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-QKFWZS/blueprint/resolved-snapshot.json
    - old_digest: 226d93ae7730451d39ca4e20b8a491c481eb75470b615bf4ec3c753a24218e08
    - current_digest: 226d93ae7730451d39ca4e20b8a491c481eb75470b615bf4ec3c753a24218e08
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281322-QKFWZS

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281322-QKFWZS
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
    - Observation: Docker CLI is present but the local Docker daemon is unavailable, so image build and container runtime were not executable in this environment.
      Impact: Local verification used compiled-process smoke and static Compose validation; CI remains the authoritative Docker image/runtime gate.
      Resolution: CI builds both Dockerfiles against PostgreSQL 18; no production write capability is enabled by this local limitation.
id_source: "generated"
---
## Summary

Stage 1: WB adapter, rate limiter and deterministic mock

Implement versioned WB endpoint profiles/runtime schemas, token and account-binding validation, exact wire normalization, distributed rate limiting, retries/circuit breakers, WB adapter modes, deterministic NestJS mock with virtual clock, fault injection, request journal, Swagger, fixtures and consumer contract tests required by sections 4, 8, 12, 15 and AC-02/10/13/19/23/24/27/29/30.

## Scope

- In scope: Implement versioned WB endpoint profiles/runtime schemas, token and account-binding validation, exact wire normalization, distributed rate limiting, retries/circuit breakers, WB adapter modes, deterministic NestJS mock with virtual clock, fault injection, request journal, Swagger, fixtures and consumer contract tests required by sections 4, 8, 12, 15 and AC-02/10/13/19/23/24/27/29/30.
- Out of scope: unrelated refactors not required for "Stage 1: WB adapter, rate limiter and deterministic mock".

## Plan

1. Implement endpoint-keyed WB transport DTOs, runtime schemas, unit normalization and token/environment capability profiles from the pinned evidence artifact.
2. Implement account identity/binding validation, redirect and host safety, retries, error classification, circuit breakers and account-wide distributed rate limiting.
3. Implement all required WB read/write adapter methods while fail-closing deprecated or unverified capabilities.
4. Build the independent deterministic NestJS wb-mock with in-memory seed state, virtual clock, scenarios, fault injection, rate headers, delayed visibility and request journal.
5. Add redacted fixtures, checksums, generated Swagger/OpenAPI and exhaustive consumer/adapter contracts, preserving external unverifiable contracts as UNVERIFIED.
6. Record official-source verification evidence and exact supported/unsupported wire semantics without enabling production writes.

## Verify Steps

1. Run pnpm run lint and pnpm run typecheck. Expected: adapter boundaries validate unknown input immediately and all public/private callables satisfy JSDoc policy.
2. Run pnpm run test:unit. Expected: exact field units, JWT profiles, host/redirect safety, limiter selection, headers, retry/backoff, error classes and breakers pass.
3. Run pnpm run test:contract. Expected: every required WB method/path, batch boundary, schema, enum, unit, error and rate-limit fixture passes against the deterministic mock; deprecated pairs are rejected.
4. Run pnpm run test:mock-openapi. Expected: WB-compatible paths and all service endpoints under /__mock are documented and runtime DTOs match OpenAPI.
5. Run docker compose -f docker-compose.mock-only.yml config and its smoke command documented in README. Expected: mock starts without PostgreSQL, resets deterministically and serves health/docs.
6. Exercise virtual time and fault scenarios. Expected: time advance produces deterministic daily rows/checksums and 429, delayed visibility, partial failure and ambiguous transport outcomes are observable without wall-clock day waits.
7. Inspect endpoint profile evidence. Expected: exact official-source URLs/date/checksums are pinned, and cluster write/delete, budget and same-day contracts stay fail-closed unless reproducible evidence qualifies them as VERIFIED.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T14:42:06.120Z — VERIFY — ok

By: CODER

Note: Stage 1 local verification passed: quality, build, built-process smoke, WB consumer/OpenAPI contracts, deterministic virtual-time/fault scenarios, clean PostgreSQL migration and cross-replica limiter integration, and all Compose configs. Official WB evidence is pinned; uncertain cluster/budget/fullstats/same-day semantics remain UNVERIFIED and fail-closed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T13:55:28.443Z, excerpt_hash=sha256:a9586e9a0c94107508fa1750f05d04a5d3b935366429828523dd5e41830bf5fc

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281322-QKFWZS/blueprint/resolved-snapshot.json
- old_digest: 226d93ae7730451d39ca4e20b8a491c481eb75470b615bf4ec3c753a24218e08
- current_digest: 226d93ae7730451d39ca4e20b8a491c481eb75470b615bf4ec3c753a24218e08
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281322-QKFWZS

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281322-QKFWZS
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

- Observation: Docker CLI is present but the local Docker daemon is unavailable, so image build and container runtime were not executable in this environment.
  Impact: Local verification used compiled-process smoke and static Compose validation; CI remains the authoritative Docker image/runtime gate.
  Resolution: CI builds both Dockerfiles against PostgreSQL 18; no production write capability is enabled by this local limitation.
