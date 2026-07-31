---
id: "202607310803-GHSSR3"
title: "Enforce fail-closed campaign status eligibility"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 8
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "safety"
task_kind: "code"
mutation_scope: "code"
verify:
  - "pnpm run test:integration"
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:21.522Z"
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
    body: "Start: enforce fail-closed campaign status eligibility across synchronization, decision inputs, and pre-dispatch validation."
events:
  -
    type: "status"
    at: "2026-07-31T08:22:50.224Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: enforce fail-closed campaign status eligibility across synchronization, decision inputs, and pre-dispatch validation."
doc_version: 3
doc_updated_at: "2026-07-31T08:22:50.224Z"
doc_updated_by: "CODER"
description: "Allow bid application only for WB campaign statuses 9 and 11, keep status 7 statistics-only, reject stopped and unknown statuses, and add status-matrix coverage."
sections:
  Summary: "Make campaign write eligibility explicit and fail closed for unsupported or unknown WB statuses."
  Scope: |-
    - Permit APPLY only for campaign statuses 9 and 11.
    - Keep status 7 available for statistics synchronization but ineligible for writes.
    - Reject status 4 and all unknown statuses.
    - Add a complete status-matrix test across synchronization, decision inputs, and pre-dispatch validation.
  Plan: "Centralize or consistently apply the supported and writable campaign status sets across data sync, decision construction, and pre-dispatch validation, then add fail-closed regression coverage."
  Verify Steps: |-
    1. Run targeted campaign-status unit and integration tests for statuses 4, 7, 9, 11, and an unknown value.
    2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
    3. Run pnpm run test:unit and pnpm run test:integration.
    4. Confirm no unrelated status semantics changed.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit and disable production writes if campaign eligibility becomes ambiguous."
  Findings: ""
id_source: "generated"
---
## Summary

Make campaign write eligibility explicit and fail closed for unsupported or unknown WB statuses.

## Scope

- Permit APPLY only for campaign statuses 9 and 11.
- Keep status 7 available for statistics synchronization but ineligible for writes.
- Reject status 4 and all unknown statuses.
- Add a complete status-matrix test across synchronization, decision inputs, and pre-dispatch validation.

## Plan

Centralize or consistently apply the supported and writable campaign status sets across data sync, decision construction, and pre-dispatch validation, then add fail-closed regression coverage.

## Verify Steps

1. Run targeted campaign-status unit and integration tests for statuses 4, 7, 9, 11, and an unknown value.
2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
3. Run pnpm run test:unit and pnpm run test:integration.
4. Confirm no unrelated status semantics changed.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit and disable production writes if campaign eligibility becomes ambiguous.

## Findings
