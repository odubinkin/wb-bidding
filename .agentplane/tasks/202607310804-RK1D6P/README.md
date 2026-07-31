---
id: "202607310804-RK1D6P"
title: "Make scheduler worker identities replica-safe"
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
  - "pnpm run test:unit"
  - "pnpm run typecheck"
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T08:05:22.211Z"
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
    body: "Start: make scheduler worker identities unique per replica and scope shutdown cleanup to the exact process."
events:
  -
    type: "status"
    at: "2026-07-31T09:05:22.330Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: make scheduler worker identities unique per replica and scope shutdown cleanup to the exact process."
doc_version: 3
doc_updated_at: "2026-07-31T09:05:22.330Z"
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
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert this task's implementation commit; allow existing leases to expire naturally before restarting workers."
  Findings: ""
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
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert this task's implementation commit; allow existing leases to expire naturally before restarting workers.

## Findings
