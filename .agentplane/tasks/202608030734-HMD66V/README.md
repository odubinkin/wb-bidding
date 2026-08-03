---
id: "202608030734-HMD66V"
title: "Replace six raw SQL operations with Prisma delegates"
result_summary: "Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks."
status: "DONE"
priority: "med"
owner: "CODER"
revision: 24
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T07:35:08.813Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T07:50:00.721Z"
  updated_by: "CODER"
  note: "Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-08-03T07:49:24.038Z"
  updated_by: "EVALUATOR"
  note: "Six raw SQL executions were replaced without weakening database invariants, and Prisma-only single-consumer helpers are colocated with their repositories."
  evaluated_sha: "5e23231c301e1bb144c293d35f7cfff3ed541a9e"
  blueprint_digest: "4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340"
  evidence_refs:
    - ".agentplane/tasks/202608030734-HMD66V/README.md"
    - ".agentplane/tasks/202608030734-HMD66V/quality/20260803-074924038-recovery-context/quality-report.json"
    - ".agentplane/tasks/202608030734-HMD66V/quality/20260803-074924038-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202608030734-HMD66V/quality/20260803-074924038-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json"
    - "commit 5e23231c301e1bb144c293d35f7cfff3ed541a9e"
    - "pnpm run typecheck"
    - "pnpm run verify:database-architecture"
    - "PostgreSQL 18 pnpm run test:integration: 35/35"
    - "pnpm run format:check and pnpm run lint"
  findings:
    - "Snapshot idempotency uses createManyAndReturn plus findFirst; reconciliation preserves due ordering and latest pending attempt selection; cleanup retains FOR UPDATE SKIP LOCKED while using ordered Prisma deleteMany calls."
    - "Strict static checks and PostgreSQL 18 integration tests 35/35 passed on the reviewed implementation commit."
commit:
  hash: "5e23231c301e1bb144c293d35f7cfff3ed541a9e"
  message: "♻️ HMD66V task: replace six raw SQL operations"
comments:
  -
    author: "CODER"
    body: "Start: replace the six approved raw SQL executions with generated Prisma delegates while preserving snapshot idempotency, reconciliation ordering, and lock-safe bounded cleanup."
  -
    author: "CODER"
    body: "Verified: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
events:
  -
    type: "status"
    at: "2026-08-03T07:35:14.437Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: replace the six approved raw SQL executions with generated Prisma delegates while preserving snapshot idempotency, reconciliation ordering, and lock-safe bounded cleanup."
  -
    type: "verify"
    at: "2026-08-03T07:41:22.672Z"
    author: "CODER"
    state: "ok"
    note: "Verified all six Prisma replacements: strict typechecks, database architecture guard, PostgreSQL 18 integration tests 35/35, formatting, lint, diff, doctor, and routing checks passed."
  -
    type: "verify"
    at: "2026-08-03T07:48:23.789Z"
    author: "CODER"
    state: "ok"
    note: "Re-verified final placement: Prisma-only helpers now live with their single consumers; typechecks, architecture guard, PostgreSQL 18 integration tests 35/35, formatting, lint, diff, doctor, and routing passed."
  -
    type: "verify"
    at: "2026-08-03T07:49:00.378Z"
    author: "CODER"
    state: "ok"
    note: "Replaced six raw SQL executions with Prisma delegates, colocated single-consumer Prisma helpers with data-sync and write-pipeline, retained lock-safe shared raw cleanup selection, and verified PostgreSQL behavior."
  -
    type: "verify"
    at: "2026-08-03T07:49:39.383Z"
    author: "CODER"
    state: "ok"
    note: "Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks."
  -
    type: "verify"
    at: "2026-08-03T07:50:00.721Z"
    author: "CODER"
    state: "ok"
    note: "Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks."
  -
    type: "status"
    at: "2026-08-03T07:50:00.858Z"
    author: "CODER"
    from: "DOING"
    to: "DONE"
    note: "Verified: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
doc_version: 3
doc_updated_at: "2026-08-03T07:50:00.859Z"
doc_updated_by: "CODER"
description: "Replace the six approved raw SQL executions in snapshot upsert, terminal write cleanup, and reconciliation work loading with generated Prisma delegate operations while preserving idempotency, lock-safe cleanup selection, ordering, and repository return contracts."
sections:
  Summary: "Replace six approved raw SQL executions in the shared database package with generated Prisma delegates while retaining the PostgreSQL-specific lock-safe cleanup selector."
  Scope: "In scope: replace the six approved raw SQL executions; keep only shared or raw-SQL functions in packages/database; move Prisma-only single-consumer snapshot upsert into packages/data-sync/src/repository.ts and reconciliation work loading into packages/write-pipeline/src/repository.ts; update database exports and focused integration coverage. Out of scope: schema migrations, public API changes, other retained PostgreSQL-specific SQL, and unrelated refactors."
  Plan: "1. Replace SyncSourceSnapshot raw INSERT/SELECT with createManyAndReturn(skipDuplicates) plus findFirst in its data-sync repository consumer. 2. Replace reconciliation raw SELECT with relation-aware decisionQueueItem.findMany and explicit bigint-to-string mapping in its write-pipeline repository consumer. 3. Retain the FOR UPDATE SKIP LOCKED cleanup selector in packages/database and replace its three DELETE statements with relation-filtered Prisma deleteMany calls. 4. Remove the two Prisma-only single-consumer functions and exports from packages/database so that package retains shared helpers and raw-SQL boundaries. 5. Run declared database architecture, static, and PostgreSQL-backed verification."
  Verify Steps: "1. Run pnpm --filter @wb-bidder/database typecheck. Expected: generated delegate queries and mappings compile under strict TypeScript. 2. Run pnpm run verify:database-architecture. Expected: no forbidden raw database access is introduced. 3. Run pnpm run test:integration. Expected: snapshot idempotency and write-pipeline reconciliation/cleanup behavior pass against PostgreSQL. 4. Run pnpm run format:check, pnpm run lint, and git diff --check. Expected: source and tests satisfy repository static checks. 5. Run agentplane doctor, node .agentplane/policy/check-routing.mjs, and git status --short --untracked-files=all. Expected: workflow policy passes and only task-scoped changes remain."
  Verification: |-
    Command: pnpm --filter @wb-bidder/database typecheck and pnpm run typecheck; Result: pass; Evidence: database and repository strict TypeScript completed after moving Prisma-only helpers to consumers; Scope: all changed source and fixtures. Command: pnpm run verify:database-architecture; Result: pass; Evidence: Prisma Client only and centralized raw execution confirmed; Scope: packages/database boundary and consumers. Command: DATABASE_URL=<isolated-local-postgres-18> pnpm run prisma:migrate:deploy && pnpm run test:integration; Result: pass; Evidence: seven migrations applied, 6 test files and 35 tests passed after final placement; Scope: snapshot idempotency, reconciliation selection, cleanup, and all integration invariants. Command: pnpm run format:check && pnpm run lint && git diff --check; Result: pass; Evidence: Prettier, ESLint, and diff checks clean; Scope: final task diff. Command: ap doctor && node .agentplane/policy/check-routing.mjs; Result: pass; Evidence: doctor OK with no errors and routing OK; Scope: workflow policy.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T07:48:23.789Z — VERIFY — ok

    By: CODER

    Note: Re-verified final placement: Prisma-only helpers now live with their single consumers; typechecks, architecture guard, PostgreSQL 18 integration tests 35/35, formatting, lint, diff, doctor, and routing passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:48:23.309Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
    - old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030734-HMD66V

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 9eed596283cd267e66c264ce8aa224b981c8b1ec
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T07:49:00.378Z — VERIFY — ok

    By: CODER

    Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer Prisma helpers with data-sync and write-pipeline, retained lock-safe shared raw cleanup selection, and verified PostgreSQL behavior.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:48:23.896Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
    - old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030734-HMD66V

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 5e23231c301e1bb144c293d35f7cfff3ed541a9e
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T07:49:39.383Z — VERIFY — ok

    By: CODER

    Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:49:00.461Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
    - old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030734-HMD66V

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 5e23231c301e1bb144c293d35f7cfff3ed541a9e
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T07:50:00.721Z — VERIFY — ok

    By: CODER

    Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:49:39.468Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
    - old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030734-HMD66V

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 04eee21cd2858237ddb9fb852e1cd7f1a6633a55
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert the task-scoped source and test changes, restoring the six raw SQL executions, then rerun the declared verification checks."
  Findings: "User-approved scope refinement: Prisma-only functions with one consumer belong in that consumer module; packages/database retains shared functions and raw-SQL functions. The first commit attempt was rejected because its subject used only the short task suffix; changes remained staged and the final commit will bind the full AGENTPLANE_TASK_ID. Earlier integration setup notes remain: DATABASE_URL is required, base migrations must be applied, and the properly prepared PostgreSQL 18 run passed 35/35 before this placement refinement."
id_source: "generated"
---
## Summary

Replace six approved raw SQL executions in the shared database package with generated Prisma delegates while retaining the PostgreSQL-specific lock-safe cleanup selector.

## Scope

In scope: replace the six approved raw SQL executions; keep only shared or raw-SQL functions in packages/database; move Prisma-only single-consumer snapshot upsert into packages/data-sync/src/repository.ts and reconciliation work loading into packages/write-pipeline/src/repository.ts; update database exports and focused integration coverage. Out of scope: schema migrations, public API changes, other retained PostgreSQL-specific SQL, and unrelated refactors.

## Plan

1. Replace SyncSourceSnapshot raw INSERT/SELECT with createManyAndReturn(skipDuplicates) plus findFirst in its data-sync repository consumer. 2. Replace reconciliation raw SELECT with relation-aware decisionQueueItem.findMany and explicit bigint-to-string mapping in its write-pipeline repository consumer. 3. Retain the FOR UPDATE SKIP LOCKED cleanup selector in packages/database and replace its three DELETE statements with relation-filtered Prisma deleteMany calls. 4. Remove the two Prisma-only single-consumer functions and exports from packages/database so that package retains shared helpers and raw-SQL boundaries. 5. Run declared database architecture, static, and PostgreSQL-backed verification.

## Verify Steps

1. Run pnpm --filter @wb-bidder/database typecheck. Expected: generated delegate queries and mappings compile under strict TypeScript. 2. Run pnpm run verify:database-architecture. Expected: no forbidden raw database access is introduced. 3. Run pnpm run test:integration. Expected: snapshot idempotency and write-pipeline reconciliation/cleanup behavior pass against PostgreSQL. 4. Run pnpm run format:check, pnpm run lint, and git diff --check. Expected: source and tests satisfy repository static checks. 5. Run agentplane doctor, node .agentplane/policy/check-routing.mjs, and git status --short --untracked-files=all. Expected: workflow policy passes and only task-scoped changes remain.

## Verification

Command: pnpm --filter @wb-bidder/database typecheck and pnpm run typecheck; Result: pass; Evidence: database and repository strict TypeScript completed after moving Prisma-only helpers to consumers; Scope: all changed source and fixtures. Command: pnpm run verify:database-architecture; Result: pass; Evidence: Prisma Client only and centralized raw execution confirmed; Scope: packages/database boundary and consumers. Command: DATABASE_URL=<isolated-local-postgres-18> pnpm run prisma:migrate:deploy && pnpm run test:integration; Result: pass; Evidence: seven migrations applied, 6 test files and 35 tests passed after final placement; Scope: snapshot idempotency, reconciliation selection, cleanup, and all integration invariants. Command: pnpm run format:check && pnpm run lint && git diff --check; Result: pass; Evidence: Prettier, ESLint, and diff checks clean; Scope: final task diff. Command: ap doctor && node .agentplane/policy/check-routing.mjs; Result: pass; Evidence: doctor OK with no errors and routing OK; Scope: workflow policy.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T07:48:23.789Z — VERIFY — ok

By: CODER

Note: Re-verified final placement: Prisma-only helpers now live with their single consumers; typechecks, architecture guard, PostgreSQL 18 integration tests 35/35, formatting, lint, diff, doctor, and routing passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:48:23.309Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
- old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030734-HMD66V

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 9eed596283cd267e66c264ce8aa224b981c8b1ec
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T07:49:00.378Z — VERIFY — ok

By: CODER

Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer Prisma helpers with data-sync and write-pipeline, retained lock-safe shared raw cleanup selection, and verified PostgreSQL behavior.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:48:23.896Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
- old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030734-HMD66V

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 5e23231c301e1bb144c293d35f7cfff3ed541a9e
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T07:49:39.383Z — VERIFY — ok

By: CODER

Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:49:00.461Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
- old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030734-HMD66V

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 5e23231c301e1bb144c293d35f7cfff3ed541a9e
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T07:50:00.721Z — VERIFY — ok

By: CODER

Note: Replaced six raw SQL executions with Prisma delegates, colocated single-consumer helpers with data-sync and write-pipeline, retained shared lock-safe raw cleanup selection, and passed all declared checks.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T07:49:39.468Z, excerpt_hash=sha256:3146d68cc4ffba3a30b236bfcd26fd006eee27517207999b6ba8217b88c566e1

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030734-HMD66V/blueprint/resolved-snapshot.json
- old_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- current_digest: 4f07550a028cf9040677b3c6786948a200c4586d1a028d3a82d7c78997eb2340
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030734-HMD66V

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030734-HMD66V --result verified-202608030734-HMD66V --commit 04eee21cd2858237ddb9fb852e1cd7f1a6633a55
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert the task-scoped source and test changes, restoring the six raw SQL executions, then rerun the declared verification checks.

## Findings

User-approved scope refinement: Prisma-only functions with one consumer belong in that consumer module; packages/database retains shared functions and raw-SQL functions. The first commit attempt was rejected because its subject used only the short task suffix; changes remained staged and the final commit will bind the full AGENTPLANE_TASK_ID. Earlier integration setup notes remain: DATABASE_URL is required, base migrations must be applied, and the properly prepared PostgreSQL 18 run passed 35/35 before this placement refinement.
