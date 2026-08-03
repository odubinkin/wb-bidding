---
id: "202608030801-AZPS5E"
title: "Remove runtime migration-table checks"
status: "DOING"
priority: "med"
owner: "CODER"
revision: 15
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T08:03:23.353Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T08:06:27.725Z"
  updated_by: "CODER"
  note: "All declared checks passed, including the migration command and 35 integration tests on isolated PostgreSQL 18."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-08-03T08:03:31.610Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-08-03T08:06:27.725Z"
    author: "CODER"
    state: "ok"
    note: "All declared checks passed, including the migration command and 35 integration tests on isolated PostgreSQL 18."
doc_version: 3
doc_updated_at: "2026-08-03T08:06:27.804Z"
doc_updated_by: "CODER"
description: "Remove application reads of Prisma migration history and verify migrations in the migration service after deploy."
sections:
  Summary: "Move migration freshness enforcement out of the bidder runtime and into the dedicated migration service."
  Scope: "Remove runtime reads of Prisma's internal _prisma_migrations table from the database package and bidder services; keep the database readiness query; make the migration service run deploy and then status; update focused tests. Expected files: package.json, docker-compose.yml, apps/bidder/src/observability.service.ts, apps/bidder/src/runtime-coordinator.service.ts, packages/database/src/index.ts, packages/database/src/migration-queries.ts (delete), tests/runbook/operational-runbook.spec.ts."
  Plan: |-
    1. Remove listAppliedMigrationNames, its export, and packages/database/src/migration-queries.ts.
    2. Remove startup and readiness migration-history checks while preserving the ordinary database readiness probe.
    3. Add a root command that runs prisma migrate deploy followed by prisma migrate status, and use it in the Compose migration service.
    4. Update focused readiness tests to assert no raw migration-table query occurs.
    5. Verify formatting, lint, types, database architecture, unit/runbook tests, Compose configuration, and the migration command against isolated PostgreSQL.
  Verify Steps: |-
    - pnpm run format:check
    - pnpm run lint
    - pnpm run typecheck
    - pnpm run verify:database-architecture
    - pnpm run test:unit
    - pnpm run test:runbook
    - docker compose config --quiet
    - Against isolated local PostgreSQL 18: pnpm run prisma:migrate:verify and pnpm run test:integration
    - git diff --check
    - ap doctor
    - node .agentplane/policy/check-routing.mjs
  Verification: |-
    Command: pnpm run format:check && pnpm run lint
    Result: pass
    Evidence: Prettier clean; ESLint exited 0.
    Scope: changed TypeScript, JSON, YAML, and test files.

    Command: pnpm run typecheck && pnpm run verify:database-architecture
    Result: pass
    Evidence: TypeScript exited 0; database architecture verified Prisma Client/raw execution boundaries.
    Scope: bidder and database package API changes.

    Command: pnpm run test:unit && pnpm run test:runbook
    Result: pass
    Evidence: 117 unit tests passed; 14 runbook tests passed with 16 database-dependent tests skipped in the no-DATABASE_URL run.
    Scope: unit behavior and focused readiness/runbook behavior.

    Command: isolated PostgreSQL 18: pnpm run prisma:migrate:verify && pnpm run test:integration
    Result: pass
    Evidence: 7 migrations applied; Prisma reported Database schema is up to date; 35 integration tests passed.
    Scope: migration-service command and complete database integration suite.

    Command: docker compose config --quiet && git diff --check
    Result: pass
    Evidence: Compose configuration valid; diff whitespace clean.
    Scope: migration service wiring and patch integrity.

    Command: ap doctor && node .agentplane/policy/check-routing.mjs
    Result: pass
    Evidence: doctor OK with one unrelated historical archive warning; policy routing OK.
    Scope: repository lifecycle and policy.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T08:06:27.725Z — VERIFY — ok

    By: CODER

    Note: All declared checks passed, including the migration command and 35 integration tests on isolated PostgreSQL 18.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:06:27.326Z, excerpt_hash=sha256:d3bca07fddb88fc1f0203d6c538f3adca8902186f707545b75a4140b3ff09682

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030801-AZPS5E/blueprint/resolved-snapshot.json
    - old_digest: a37ba756dbfd564193ef408fa084b3785fef8913b86e6451078af5c71271dfed
    - current_digest: a37ba756dbfd564193ef408fa084b3785fef8913b86e6451078af5c71271dfed
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030801-AZPS5E

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608030801-AZPS5E
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert the task commits to restore runtime migration-history checks and the previous Compose migration command."
  Findings: "Planning note: Markdown command markers were interpreted by the shell while authoring Verify Steps, causing read-only checks to run early. No implementation files were mutated; the Verify Steps contract was rewritten as literal text."
id_source: "generated"
---
## Summary

Move migration freshness enforcement out of the bidder runtime and into the dedicated migration service.

## Scope

Remove runtime reads of Prisma's internal _prisma_migrations table from the database package and bidder services; keep the database readiness query; make the migration service run deploy and then status; update focused tests. Expected files: package.json, docker-compose.yml, apps/bidder/src/observability.service.ts, apps/bidder/src/runtime-coordinator.service.ts, packages/database/src/index.ts, packages/database/src/migration-queries.ts (delete), tests/runbook/operational-runbook.spec.ts.

## Plan

1. Remove listAppliedMigrationNames, its export, and packages/database/src/migration-queries.ts.
2. Remove startup and readiness migration-history checks while preserving the ordinary database readiness probe.
3. Add a root command that runs prisma migrate deploy followed by prisma migrate status, and use it in the Compose migration service.
4. Update focused readiness tests to assert no raw migration-table query occurs.
5. Verify formatting, lint, types, database architecture, unit/runbook tests, Compose configuration, and the migration command against isolated PostgreSQL.

## Verify Steps

- pnpm run format:check
- pnpm run lint
- pnpm run typecheck
- pnpm run verify:database-architecture
- pnpm run test:unit
- pnpm run test:runbook
- docker compose config --quiet
- Against isolated local PostgreSQL 18: pnpm run prisma:migrate:verify and pnpm run test:integration
- git diff --check
- ap doctor
- node .agentplane/policy/check-routing.mjs

## Verification

Command: pnpm run format:check && pnpm run lint
Result: pass
Evidence: Prettier clean; ESLint exited 0.
Scope: changed TypeScript, JSON, YAML, and test files.

Command: pnpm run typecheck && pnpm run verify:database-architecture
Result: pass
Evidence: TypeScript exited 0; database architecture verified Prisma Client/raw execution boundaries.
Scope: bidder and database package API changes.

Command: pnpm run test:unit && pnpm run test:runbook
Result: pass
Evidence: 117 unit tests passed; 14 runbook tests passed with 16 database-dependent tests skipped in the no-DATABASE_URL run.
Scope: unit behavior and focused readiness/runbook behavior.

Command: isolated PostgreSQL 18: pnpm run prisma:migrate:verify && pnpm run test:integration
Result: pass
Evidence: 7 migrations applied; Prisma reported Database schema is up to date; 35 integration tests passed.
Scope: migration-service command and complete database integration suite.

Command: docker compose config --quiet && git diff --check
Result: pass
Evidence: Compose configuration valid; diff whitespace clean.
Scope: migration service wiring and patch integrity.

Command: ap doctor && node .agentplane/policy/check-routing.mjs
Result: pass
Evidence: doctor OK with one unrelated historical archive warning; policy routing OK.
Scope: repository lifecycle and policy.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T08:06:27.725Z — VERIFY — ok

By: CODER

Note: All declared checks passed, including the migration command and 35 integration tests on isolated PostgreSQL 18.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T08:06:27.326Z, excerpt_hash=sha256:d3bca07fddb88fc1f0203d6c538f3adca8902186f707545b75a4140b3ff09682

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030801-AZPS5E/blueprint/resolved-snapshot.json
- old_digest: a37ba756dbfd564193ef408fa084b3785fef8913b86e6451078af5c71271dfed
- current_digest: a37ba756dbfd564193ef408fa084b3785fef8913b86e6451078af5c71271dfed
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030801-AZPS5E

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608030801-AZPS5E
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert the task commits to restore runtime migration-history checks and the previous Compose migration command.

## Findings

Planning note: Markdown command markers were interpreted by the shell while authoring Verify Steps, causing read-only checks to run early. No implementation files were mutated; the Verify Steps contract was rewritten as literal text.
