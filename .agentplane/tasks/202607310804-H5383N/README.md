---
id: "202607310804-H5383N"
title: "Renew write leases during pre-dispatch validation"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 8
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "reliability"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:22.880Z"
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
    body: "Start: renew owned write leases across pre-dispatch validation and fail closed on lease loss."
events:
  -
    type: "status"
    at: "2026-07-31T08:50:42.110Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: renew owned write leases across pre-dispatch validation and fail closed on lease loss."
doc_version: 3
doc_updated_at: "2026-07-31T08:50:42.110Z"
doc_updated_by: "CODER"
description: "Heartbeat owned write-queue leases throughout potentially slow live reads and validation, fail safely on lease loss, and add regression coverage for long batches."
sections:
  Summary: "Keep write-queue leases alive throughout slow pre-dispatch reads and validation so active work cannot be reclaimed."
  Scope: |-
    - Renew leases while a claimed batch performs live reads and validation.
    - Track only items still owned by the worker.
    - Fail safely if heartbeat ownership is lost.
    - Add long-running batch and partial-failure regression tests.
  Plan: "Integrate bounded lease heartbeats into pre-dispatch processing, maintain the active owned-item set as items are rejected, define safe lease-loss behavior, and add timing-sensitive regression coverage."
  Verify Steps: |-
    1. Run targeted write-executor tests with validation time exceeding the original lease window.
    2. Verify rejected items leave the heartbeat set and lease loss prevents dispatch.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and reduce worker batch size or increase lease duration temporarily before resuming writes."
  Findings: ""
id_source: "generated"
---
## Summary

Keep write-queue leases alive throughout slow pre-dispatch reads and validation so active work cannot be reclaimed.

## Scope

- Renew leases while a claimed batch performs live reads and validation.
- Track only items still owned by the worker.
- Fail safely if heartbeat ownership is lost.
- Add long-running batch and partial-failure regression tests.

## Plan

Integrate bounded lease heartbeats into pre-dispatch processing, maintain the active owned-item set as items are rejected, define safe lease-loss behavior, and add timing-sensitive regression coverage.

## Verify Steps

1. Run targeted write-executor tests with validation time exceeding the original lease window.
2. Verify rejected items leave the heartbeat set and lease loss prevents dispatch.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and reduce worker batch size or increase lease duration temporarily before resuming writes.

## Findings
