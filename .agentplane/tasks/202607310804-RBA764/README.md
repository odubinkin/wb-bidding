---
id: "202607310804-RBA764"
title: "Deduplicate concurrent manual job creation"
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
  updated_at: "2026-07-31T08:05:22.542Z"
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
    body: "Start: deduplicate concurrent manual-job creation by normalized job type and scope."
events:
  -
    type: "status"
    at: "2026-07-31T09:01:00.819Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: deduplicate concurrent manual-job creation by normalized job type and scope."
doc_version: 3
doc_updated_at: "2026-07-31T09:01:00.819Z"
doc_updated_by: "CODER"
description: "Serialize manual-job creation for the same job type and canonical scope so concurrent requests cannot create duplicate active jobs; preserve and return the existing job state; add concurrency coverage."
sections:
  Summary: "Guarantee at most one active manual job exists for a given job type and canonical scope under concurrent requests."
  Scope: |-
    - Serialize createJob for the same type and canonical scope.
    - Return the existing job and its actual state when one is already active.
    - Preserve concurrency for unrelated job scopes.
    - Add a two-transaction concurrency regression test.
  Plan: "Acquire a transaction-scoped advisory lock derived from job type and canonical scope before checking for active work, return existing state accurately, and prove deduplication under concurrent creation."
  Verify Steps: |-
    1. Run targeted concurrent manual-job creation integration tests.
    2. Verify same-scope calls converge and different scopes do not block semantically.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. Remove any duplicate queued jobs created during rollback assessment before resuming workers."
  Findings: ""
id_source: "generated"
---
## Summary

Guarantee at most one active manual job exists for a given job type and canonical scope under concurrent requests.

## Scope

- Serialize createJob for the same type and canonical scope.
- Return the existing job and its actual state when one is already active.
- Preserve concurrency for unrelated job scopes.
- Add a two-transaction concurrency regression test.

## Plan

Acquire a transaction-scoped advisory lock derived from job type and canonical scope before checking for active work, return existing state accurately, and prove deduplication under concurrent creation.

## Verify Steps

1. Run targeted concurrent manual-job creation integration tests.
2. Verify same-scope calls converge and different scopes do not block semantically.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. Remove any duplicate queued jobs created during rollback assessment before resuming workers.

## Findings
