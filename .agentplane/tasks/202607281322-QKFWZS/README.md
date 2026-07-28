---
id: "202607281322-QKFWZS"
title: "Stage 1: WB adapter, rate limiter and deterministic mock"
status: "TODO"
priority: "high"
owner: "CODER"
revision: 3
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
doc_updated_at: "2026-07-28T13:24:53.063Z"
doc_updated_by: "PLANNER"
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
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
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
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
