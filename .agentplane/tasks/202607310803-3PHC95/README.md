---
id: "202607310803-3PHC95"
title: "Prevent dispatch of superseded bidding decisions"
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
  updated_at: "2026-07-31T08:05:21.196Z"
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
    body: "Start: prevent dispatch of superseded bidding decisions and add focused race regression coverage."
events:
  -
    type: "status"
    at: "2026-07-31T08:05:51.348Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: prevent dispatch of superseded bidding decisions and add focused race regression coverage."
doc_version: 3
doc_updated_at: "2026-07-31T08:05:51.348Z"
doc_updated_by: "CODER"
description: "Serialize final dispatch validation with decision persistence so a leased decision cannot be sent after a newer decision for the same target exists; add race regression coverage."
sections:
  Summary: "Prevent any stale leased decision from reaching WB after a newer decision is persisted for the same target."
  Scope: |-
    - Serialize the final dispatch decision with decision persistence using the same target-level lock.
    - Mark a superseded queued write terminally without sending it.
    - Add an integration race test covering a newer decision arriving after the old decision was leased.
    - Do not change unrelated campaign or scheduler behavior.
  Plan: "Add a transactionally serialized latest-decision check immediately before dispatch commit, handle the superseded outcome explicitly in the write executor, and add focused race regression tests."
  Verify Steps: |-
    1. Run targeted write-pipeline unit and integration tests, including the stale leased-decision race.
    2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
    3. Run pnpm run test:unit and pnpm run test:integration against isolated PostgreSQL 18.
    4. Run git status --short and confirm only this task's changes plus known parallel-task artifacts.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit. Keep production writes disabled until the previous safe version is restored."
  Findings: ""
id_source: "generated"
---
## Summary

Prevent any stale leased decision from reaching WB after a newer decision is persisted for the same target.

## Scope

- Serialize the final dispatch decision with decision persistence using the same target-level lock.
- Mark a superseded queued write terminally without sending it.
- Add an integration race test covering a newer decision arriving after the old decision was leased.
- Do not change unrelated campaign or scheduler behavior.

## Plan

Add a transactionally serialized latest-decision check immediately before dispatch commit, handle the superseded outcome explicitly in the write executor, and add focused race regression tests.

## Verify Steps

1. Run targeted write-pipeline unit and integration tests, including the stale leased-decision race.
2. Run pnpm run format:check, pnpm run lint, and pnpm run typecheck.
3. Run pnpm run test:unit and pnpm run test:integration against isolated PostgreSQL 18.
4. Run git status --short and confirm only this task's changes plus known parallel-task artifacts.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit. Keep production writes disabled until the previous safe version is restored.

## Findings
