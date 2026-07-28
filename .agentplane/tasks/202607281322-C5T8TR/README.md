---
id: "202607281322-C5T8TR"
title: "Stage 4: queue, executor, reconciliation and Admin API"
status: "TODO"
priority: "high"
owner: "CODER"
revision: 3
origin:
  system: "manual"
depends_on:
  - "202607281322-FFPDDN"
tags:
  - "backend"
  - "code"
task_kind: "code"
mutation_scope: "code"
risk_flags:
  - "security"
verify:
  - "pnpm run lint"
  - "pnpm run test:contract"
  - "pnpm run test:e2e"
  - "pnpm run test:integration"
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
doc_updated_at: "2026-07-28T13:24:55.230Z"
doc_updated_by: "PLANNER"
description: "Implement transactional decision queue, leases and semantic idempotency, request and item write audit, pre-write validation, batching, UNKNOWN-result reconciliation, safe retry, verification, authenticated and authorized Admin API with problem+json, idempotency, ETag, pagination and audit, plus end-to-end mock workflows required by sections 7-8, 10, 14, 17, 19 and AC-07/08/09/11/17/25/28/29."
sections:
  Summary: |-
    Stage 4: queue, executor, reconciliation and Admin API

    Implement transactional decision queue, leases and semantic idempotency, request and item write audit, pre-write validation, batching, UNKNOWN-result reconciliation, safe retry, verification, authenticated and authorized Admin API with problem+json, idempotency, ETag, pagination and audit, plus end-to-end mock workflows required by sections 7-8, 10, 14, 17, 19 and AC-07/08/09/11/17/25/28/29.
  Scope: |-
    - In scope: Implement transactional decision queue, leases and semantic idempotency, request and item write audit, pre-write validation, batching, UNKNOWN-result reconciliation, safe retry, verification, authenticated and authorized Admin API with problem+json, idempotency, ETag, pagination and audit, plus end-to-end mock workflows required by sections 7-8, 10, 14, 17, 19 and AC-07/08/09/11/17/25/28/29.
    - Out of scope: unrelated refactors not required for "Stage 4: queue, executor, reconciliation and Admin API".
  Plan: |-
    1. Implement transactional decision and queue creation, UUIDv7 identity, leases, SKIP LOCKED claims, priority and target serialization.
    2. Implement durable PREPARED and atomic DISPATCHING/SENT write-attempt/item transitions, batch mapping and pre-write live validation.
    3. Implement verification, UNKNOWN reconciliation, stable-old-state proof, bounded safe retry and crash recovery without double writes.
    4. Implement complete /api/v1 Admin API for economics, policies, assignments, automation/kill, jobs, decisions, failures and audit with service-token permissions.
    5. Implement problem+json, cursor pagination, decimal-string BigInt, idempotency keys, ETags/conditional headers, atomic audit and safe retry classifications.
    6. Add contract/integration/e2e fault-injection scenarios proving AC-07/08/09/11/17/25/28/29.
  Verify Steps: |-
    1. Run pnpm run lint, pnpm run typecheck and pnpm run test:unit. Expected: queue/write/reconciliation state machines, batching, redaction and Admin API guards pass.
    2. Run pnpm run test:integration against real PostgreSQL. Expected: decision+queue transaction, SKIP LOCKED, leases, PREPARED/DISPATCHING crash windows, per-item partial outcomes and audit atomics pass.
    3. Run pnpm run test:contract. Expected: every Admin path satisfies permissions, idempotency, conditional headers, pagination, problem+json, BigInt strings and generated OpenAPI.
    4. Run pnpm run test:e2e through docker-compose.mock.yml. Expected: full sync-to-verified-write flows and all mandated failure/reconciliation scenarios execute without duplicate writes.
    5. Verify global and target kill switches. Expected: writes stop immediately, re-enable is separately audited and no endpoint bypasses queue/locks/limiter/reconciliation.
    6. Verify UNKNOWN retry safety. Expected: ambiguous results never blind-retry, require stable old-state evidence, and RETRY_NOT_SAFE covers inconclusive/auth/capability/invalid/superseded states.
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

Stage 4: queue, executor, reconciliation and Admin API

Implement transactional decision queue, leases and semantic idempotency, request and item write audit, pre-write validation, batching, UNKNOWN-result reconciliation, safe retry, verification, authenticated and authorized Admin API with problem+json, idempotency, ETag, pagination and audit, plus end-to-end mock workflows required by sections 7-8, 10, 14, 17, 19 and AC-07/08/09/11/17/25/28/29.

## Scope

- In scope: Implement transactional decision queue, leases and semantic idempotency, request and item write audit, pre-write validation, batching, UNKNOWN-result reconciliation, safe retry, verification, authenticated and authorized Admin API with problem+json, idempotency, ETag, pagination and audit, plus end-to-end mock workflows required by sections 7-8, 10, 14, 17, 19 and AC-07/08/09/11/17/25/28/29.
- Out of scope: unrelated refactors not required for "Stage 4: queue, executor, reconciliation and Admin API".

## Plan

1. Implement transactional decision and queue creation, UUIDv7 identity, leases, SKIP LOCKED claims, priority and target serialization.
2. Implement durable PREPARED and atomic DISPATCHING/SENT write-attempt/item transitions, batch mapping and pre-write live validation.
3. Implement verification, UNKNOWN reconciliation, stable-old-state proof, bounded safe retry and crash recovery without double writes.
4. Implement complete /api/v1 Admin API for economics, policies, assignments, automation/kill, jobs, decisions, failures and audit with service-token permissions.
5. Implement problem+json, cursor pagination, decimal-string BigInt, idempotency keys, ETags/conditional headers, atomic audit and safe retry classifications.
6. Add contract/integration/e2e fault-injection scenarios proving AC-07/08/09/11/17/25/28/29.

## Verify Steps

1. Run pnpm run lint, pnpm run typecheck and pnpm run test:unit. Expected: queue/write/reconciliation state machines, batching, redaction and Admin API guards pass.
2. Run pnpm run test:integration against real PostgreSQL. Expected: decision+queue transaction, SKIP LOCKED, leases, PREPARED/DISPATCHING crash windows, per-item partial outcomes and audit atomics pass.
3. Run pnpm run test:contract. Expected: every Admin path satisfies permissions, idempotency, conditional headers, pagination, problem+json, BigInt strings and generated OpenAPI.
4. Run pnpm run test:e2e through docker-compose.mock.yml. Expected: full sync-to-verified-write flows and all mandated failure/reconciliation scenarios execute without duplicate writes.
5. Verify global and target kill switches. Expected: writes stop immediately, re-enable is separately audited and no endpoint bypasses queue/locks/limiter/reconciliation.
6. Verify UNKNOWN retry safety. Expected: ambiguous results never blind-retry, require stable old-state evidence, and RETRY_NOT_SAFE covers inconclusive/auth/capability/invalid/superseded states.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
