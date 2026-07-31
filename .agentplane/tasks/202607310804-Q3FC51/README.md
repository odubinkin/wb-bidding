---
id: "202607310804-Q3FC51"
title: "Recover expired manual-job and economics-import leases"
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
  updated_at: "2026-07-31T08:05:21.868Z"
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
    body: "Start: recover expired manual-job and economics-import leases without duplicating completed item effects."
events:
  -
    type: "status"
    at: "2026-07-31T08:32:56.620Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: recover expired manual-job and economics-import leases without duplicating completed item effects."
doc_version: 3
doc_updated_at: "2026-07-31T08:32:56.620Z"
doc_updated_by: "CODER"
description: "Atomically reclaim expired RUNNING ManualJob and PROCESSING ProductEconomicsImport work after worker crashes without duplicating completed item effects; add recovery coverage."
sections:
  Summary: "Ensure expired manual-job and economics-import work resumes automatically and safely after worker crashes."
  Scope: |-
    - Atomically reclaim expired RUNNING ManualJob leases.
    - Atomically reclaim expired PROCESSING ProductEconomicsImport leases.
    - Preserve completed import-item effects and counters during replay.
    - Add crash-recovery and duplicate-effect regression tests.
  Plan: "Extend claim transactions to recover expired leases, make import item replay terminal-state aware and idempotent, and verify crash recovery for both work types."
  Verify Steps: |-
    1. Run targeted lease-expiry tests for manual jobs and economics imports.
    2. Verify completed import items are not applied twice after reclaim.
    3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
    4. Run migration checks if schema changes are introduced.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. If a migration was deployed, use a forward corrective migration and pause affected workers."
  Findings: ""
id_source: "generated"
---
## Summary

Ensure expired manual-job and economics-import work resumes automatically and safely after worker crashes.

## Scope

- Atomically reclaim expired RUNNING ManualJob leases.
- Atomically reclaim expired PROCESSING ProductEconomicsImport leases.
- Preserve completed import-item effects and counters during replay.
- Add crash-recovery and duplicate-effect regression tests.

## Plan

Extend claim transactions to recover expired leases, make import item replay terminal-state aware and idempotent, and verify crash recovery for both work types.

## Verify Steps

1. Run targeted lease-expiry tests for manual jobs and economics imports.
2. Verify completed import items are not applied twice after reclaim.
3. Run pnpm run format:check, pnpm run lint, pnpm run typecheck, pnpm run test:unit, and pnpm run test:integration.
4. Run migration checks if schema changes are introduced.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. If a migration was deployed, use a forward corrective migration and pause affected workers.

## Findings
