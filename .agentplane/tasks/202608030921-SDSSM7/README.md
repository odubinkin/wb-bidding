---
id: "202608030921-SDSSM7"
title: "Split oversized TypeScript modules by responsibility"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 16
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T09:22:01.623Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T09:48:44.604Z"
  updated_by: "CODER"
  note: "verified-202608030921-SDSSM7"
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-08-03T09:48:34.241Z"
  updated_by: "EVALUATOR"
  note: "The refactor satisfies the approved modularity, naming, compatibility, and verification contract."
  evaluated_sha: "56a09c3ba215dba2116912842f1129b5b6ad1ee8"
  blueprint_digest: "48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec"
  evidence_refs:
    - ".agentplane/tasks/202608030921-SDSSM7/README.md"
    - ".agentplane/tasks/202608030921-SDSSM7/quality/20260803-094834241-recovery-context/quality-report.json"
    - ".agentplane/tasks/202608030921-SDSSM7/quality/20260803-094834241-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202608030921-SDSSM7/quality/20260803-094834241-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json"
    - "pnpm run quality"
  findings:
    - "All replacement TypeScript modules are at most 500 lines (maximum 483), old source entry files are removed, consumers and tests use direct module paths, and format/lint/typecheck/build/unit/contract/runbook/full-quality checks pass."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: refactor approved oversized TypeScript modules using NestJS and TypeScript conventions, direct imports, and a strict 500-line ceiling."
events:
  -
    type: "status"
    at: "2026-08-03T09:22:11.950Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: refactor approved oversized TypeScript modules using NestJS and TypeScript conventions, direct imports, and a strict 500-line ceiling."
  -
    type: "verify"
    at: "2026-08-03T09:47:17.933Z"
    author: "CODER"
    state: "ok"
    note: "Verified: all split modules are at most 500 lines (maximum 483); stale production/test imports are removed; direct helper/module imports are used; format, lint, typecheck, build, unit 126/126, contract 19/19, runbook 3/3, full quality, doctor, routing, and diff checks pass. PostgreSQL integration suites were skipped only because DATABASE_URL is not configured, as recorded in Findings."
  -
    type: "verify"
    at: "2026-08-03T09:47:47.492Z"
    author: "CODER"
    state: "ok"
    note: "verified-202608030921-SDSSM7"
  -
    type: "verify"
    at: "2026-08-03T09:48:44.604Z"
    author: "CODER"
    state: "ok"
    note: "verified-202608030921-SDSSM7"
doc_version: 3
doc_updated_at: "2026-08-03T09:48:44.692Z"
doc_updated_by: "CODER"
description: "Refactor the 11 approved oversized data-sync, decision-engine, wb-api, write-pipeline, wb-mock, and bidder source files into cohesive modules of at most 500 lines; follow NestJS and general TypeScript conventions; update production and test imports directly without test-only compatibility wrappers."
sections:
  Summary: "Refactor the approved oversized TypeScript source files into cohesive modules with unchanged runtime behavior. Every listed source file and every new split module must be at most 500 lines. NestJS applications must follow feature-oriented Nest naming and structure; packages must follow standard TypeScript module boundaries."
  Scope: "In scope: packages/data-sync/src/repository.ts, packages/data-sync/src/worker.ts, packages/decision-engine/src/repository.ts, packages/wb-api/src/client.ts, packages/write-pipeline/src/repository.ts, apps/wb-mock/src/mock-state.service.ts, apps/bidder/src/admin.controller.ts, apps/bidder/src/admin.service.ts, apps/bidder/src/decision-job.service.ts, apps/bidder/src/experiment-runtime.service.ts, apps/bidder/src/scheduler.service.ts; newly extracted sibling modules; required package barrel exports; direct production consumers; and tests that exercise moved functions. No database schema, external API behavior, authentication, deployment, or unrelated feature changes."
  Plan: "Split the 11 approved oversized files into cohesive <=500-line modules, using NestJS conventions in applications and TypeScript conventions in packages; migrate production and test imports directly; preserve runtime contracts; verify formatting, lint, types, build, unit/contract and available integration behavior."
  Verify Steps: "1. Run a line-count check over all 11 original files and all newly created split TypeScript modules; each must be <= 500 lines. 2. Search original files for compatibility wrappers and verify tests import moved helpers directly from their owning modules. 3. Run pnpm exec prettier --check on changed TypeScript files. 4. Run pnpm run lint. 5. Run pnpm run typecheck. 6. Run pnpm run build. 7. Run pnpm run test:unit. 8. Run pnpm run test:contract. 9. Run relevant integration suites when their database prerequisite is available; otherwise record the concrete environment blocker and residual risk. 10. Run ap doctor and node .agentplane/policy/check-routing.mjs. 11. Inspect git diff --check and git status --short --untracked-files=all for unintended changes."
  Verification: |-
    Pending implementation and execution of the approved Verify Steps.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T09:47:17.933Z — VERIFY — ok

    By: CODER

    Note: Verified: all split modules are at most 500 lines (maximum 483); stale production/test imports are removed; direct helper/module imports are used; format, lint, typecheck, build, unit 126/126, contract 19/19, runbook 3/3, full quality, doctor, routing, and diff checks pass. PostgreSQL integration suites were skipped only because DATABASE_URL is not configured, as recorded in Findings.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:17.504Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
    - old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608030921-SDSSM7
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T09:47:47.492Z — VERIFY — ok

    By: CODER

    Note: verified-202608030921-SDSSM7
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:18.014Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
    - old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030921-SDSSM7 --result verified-202608030921-SDSSM7 --commit 03aaf23aaf98f094039332f68aabba1181c22682
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T09:48:44.604Z — VERIFY — ok

    By: CODER

    Note: verified-202608030921-SDSSM7
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:47.575Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
    - old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030921-SDSSM7 --result verified-202608030921-SDSSM7 --commit 56a09c3ba215dba2116912842f1129b5b6ad1ee8
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert the task implementation commit to restore the previous monolithic modules and imports. No database or external-state rollback is expected because this task changes source organization only."
  Findings: |-
    Initial inventory: the 11 target files total 10,345 lines and range from 641 to 1,691 lines. Existing unrelated Agentplane task artifacts are dirty and must remain untouched.

    - Observation: DATABASE_URL is not configured in the current environment, so the five relevant PostgreSQL integration suites could not be executed locally.
      Impact: Repository SQL behavior is covered by unchanged integration tests and compile/build checks but was not re-exercised against PostgreSQL in this workspace run.
      Resolution: Run the existing data-sync, decision-engine, production-runtime, and write-pipeline integration suites in CI or a local environment with DATABASE_URL configured.
id_source: "generated"
---
## Summary

Refactor the approved oversized TypeScript source files into cohesive modules with unchanged runtime behavior. Every listed source file and every new split module must be at most 500 lines. NestJS applications must follow feature-oriented Nest naming and structure; packages must follow standard TypeScript module boundaries.

## Scope

In scope: packages/data-sync/src/repository.ts, packages/data-sync/src/worker.ts, packages/decision-engine/src/repository.ts, packages/wb-api/src/client.ts, packages/write-pipeline/src/repository.ts, apps/wb-mock/src/mock-state.service.ts, apps/bidder/src/admin.controller.ts, apps/bidder/src/admin.service.ts, apps/bidder/src/decision-job.service.ts, apps/bidder/src/experiment-runtime.service.ts, apps/bidder/src/scheduler.service.ts; newly extracted sibling modules; required package barrel exports; direct production consumers; and tests that exercise moved functions. No database schema, external API behavior, authentication, deployment, or unrelated feature changes.

## Plan

Split the 11 approved oversized files into cohesive <=500-line modules, using NestJS conventions in applications and TypeScript conventions in packages; migrate production and test imports directly; preserve runtime contracts; verify formatting, lint, types, build, unit/contract and available integration behavior.

## Verify Steps

1. Run a line-count check over all 11 original files and all newly created split TypeScript modules; each must be <= 500 lines. 2. Search original files for compatibility wrappers and verify tests import moved helpers directly from their owning modules. 3. Run pnpm exec prettier --check on changed TypeScript files. 4. Run pnpm run lint. 5. Run pnpm run typecheck. 6. Run pnpm run build. 7. Run pnpm run test:unit. 8. Run pnpm run test:contract. 9. Run relevant integration suites when their database prerequisite is available; otherwise record the concrete environment blocker and residual risk. 10. Run ap doctor and node .agentplane/policy/check-routing.mjs. 11. Inspect git diff --check and git status --short --untracked-files=all for unintended changes.

## Verification

Pending implementation and execution of the approved Verify Steps.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T09:47:17.933Z — VERIFY — ok

By: CODER

Note: Verified: all split modules are at most 500 lines (maximum 483); stale production/test imports are removed; direct helper/module imports are used; format, lint, typecheck, build, unit 126/126, contract 19/19, runbook 3/3, full quality, doctor, routing, and diff checks pass. PostgreSQL integration suites were skipped only because DATABASE_URL is not configured, as recorded in Findings.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:17.504Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
- old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608030921-SDSSM7
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T09:47:47.492Z — VERIFY — ok

By: CODER

Note: verified-202608030921-SDSSM7
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:18.014Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
- old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030921-SDSSM7 --result verified-202608030921-SDSSM7 --commit 03aaf23aaf98f094039332f68aabba1181c22682
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T09:48:44.604Z — VERIFY — ok

By: CODER

Note: verified-202608030921-SDSSM7
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:47:47.575Z, excerpt_hash=sha256:5f7756a202477ebec05010b4dffcb0f940935b775721a36994d660eaa1594d43

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030921-SDSSM7/blueprint/resolved-snapshot.json
- old_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- current_digest: 48a0ba4be7345d643b20e781c055510deb0cd7e79bd2cb012efa1557809439ec
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030921-SDSSM7

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030921-SDSSM7 --result verified-202608030921-SDSSM7 --commit 56a09c3ba215dba2116912842f1129b5b6ad1ee8
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert the task implementation commit to restore the previous monolithic modules and imports. No database or external-state rollback is expected because this task changes source organization only.

## Findings

Initial inventory: the 11 target files total 10,345 lines and range from 641 to 1,691 lines. Existing unrelated Agentplane task artifacts are dirty and must remain untouched.

- Observation: DATABASE_URL is not configured in the current environment, so the five relevant PostgreSQL integration suites could not be executed locally.
  Impact: Repository SQL behavior is covered by unchanged integration tests and compile/build checks but was not re-exercised against PostgreSQL in this workspace run.
  Resolution: Run the existing data-sync, decision-engine, production-runtime, and write-pipeline integration suites in CI or a local environment with DATABASE_URL configured.
