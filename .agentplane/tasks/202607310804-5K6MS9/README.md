---
id: "202607310804-5K6MS9"
title: "Serialize concurrent Admin API idempotency"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 8
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "concurrency"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:23.239Z"
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
    body: "Start: serialize concurrent Admin API idempotency while preserving independent-key concurrency."
events:
  -
    type: "status"
    at: "2026-07-31T08:42:05.684Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: serialize concurrent Admin API idempotency while preserving independent-key concurrency."
doc_version: 3
doc_updated_at: "2026-07-31T08:42:05.684Z"
doc_updated_by: "CODER"
description: "Acquire transaction-scoped idempotency locks before replay checks across Admin mutations so concurrent requests with the same key converge on one effect and one replayable result; add concurrency coverage."
sections:
  Summary: "Make concurrent Admin API mutations with the same idempotency key converge on one committed effect and replayable result."
  Scope: |-
    - Lock each Admin idempotency scope and key before its replay check.
    - Cover service-owned and delegated repository mutations.
    - Preserve independent execution for different keys.
    - Add concurrent success, replay, and error-path regression tests.
  Plan: "Add transaction-scoped advisory idempotency locks before replay reads in every Admin mutation path, retain existing response-hash semantics, and verify same-key concurrency across service and repository implementations."
  Verify Steps: |-
    1. Run targeted concurrent Admin mutation integration tests for service-owned and delegated paths.
    2. Verify one side effect, identical replay response, and no unnecessary serialization for different keys.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and keep high-risk Admin mutations serialized operationally until a corrected build is deployed."
  Findings: ""
id_source: "generated"
---
## Summary

Make concurrent Admin API mutations with the same idempotency key converge on one committed effect and replayable result.

## Scope

- Lock each Admin idempotency scope and key before its replay check.
- Cover service-owned and delegated repository mutations.
- Preserve independent execution for different keys.
- Add concurrent success, replay, and error-path regression tests.

## Plan

Add transaction-scoped advisory idempotency locks before replay reads in every Admin mutation path, retain existing response-hash semantics, and verify same-key concurrency across service and repository implementations.

## Verify Steps

1. Run targeted concurrent Admin mutation integration tests for service-owned and delegated paths.
2. Verify one side effect, identical replay response, and no unnecessary serialization for different keys.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and keep high-risk Admin mutations serialized operationally until a corrected build is deployed.

## Findings
