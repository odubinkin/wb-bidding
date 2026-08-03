---
id: "202608031040-RDFEWP"
title: "Harden repository utility scripts"
status: "DOING"
priority: "med"
owner: "CODER"
revision: 13
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T10:41:25.857Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T10:50:46.933Z"
  updated_by: "CODER"
  note: "verified-202608031040-RDFEWP"
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-08-03T10:50:36.773Z"
  updated_by: "EVALUATOR"
  note: "Repository script hardening and documentation satisfy the approved scope."
  evaluated_sha: "a92aa1018c95bc4db361e92569788f7778b3cbd6"
  blueprint_digest: "dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af"
  evidence_refs:
    - ".agentplane/tasks/202608031040-RDFEWP/README.md"
    - ".agentplane/tasks/202608031040-RDFEWP/quality/20260803-105036773-recovery-context/quality-report.json"
    - ".agentplane/tasks/202608031040-RDFEWP/quality/20260803-105036773-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202608031040-RDFEWP/quality/20260803-105036773-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202608031040-RDFEWP/blueprint/resolved-snapshot.json"
    - "pnpm run quality"
  findings:
    - "All declared local checks passed; stateful Docker and WB sandbox smoke remain delegated to their existing CI/release environments."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: harden repository scripts and add their canonical documentation while preserving fixed ports."
events:
  -
    type: "status"
    at: "2026-08-03T10:41:30.899Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: harden repository scripts and add their canonical documentation while preserving fixed ports."
  -
    type: "verify"
    at: "2026-08-03T10:49:37.998Z"
    author: "CODER"
    state: "ok"
    note: "Verified: all declared local script, mutation, quality, documentation, security, routing, and repository health checks passed; approved stateful smoke exclusions are recorded."
  -
    type: "verify"
    at: "2026-08-03T10:50:46.933Z"
    author: "CODER"
    state: "ok"
    note: "verified-202608031040-RDFEWP"
doc_version: 3
doc_updated_at: "2026-08-03T10:50:47.025Z"
doc_updated_by: "CODER"
description: "Improve correctness and diagnostics of scripts/, preserve fixed ports, and add documentation covering every script."
sections:
  Summary: "Harden repository utility scripts based on the completed review, preserve all fixed port numbers, and add a canonical Russian-language guide for every script."
  Scope: "Included: targeted correctness and diagnostic improvements in scripts/run-decision-mutation-tests.mjs, scripts/sandbox-smoke.mjs, scripts/smoke-built-apps.mjs, scripts/verify-container.mjs, scripts/verify-database-architecture.mjs, scripts/verify-deprecated-endpoints.mjs, scripts/verify-docs.mjs, scripts/verify-secrets.mjs; a new docs/scripts.md; and minimal links or script registry updates in README.md, docs/testing.md, package.json, or vitest.config.ts when required. Fixed port numbers must remain unchanged. Excluded: production application behavior, database schema, Docker/Compose topology, real sandbox execution, network access, releases, and unrelated cleanup."
  Plan: "1. Inspect the relevant script contracts and their fixtures/configuration. 2. Implement bounded robustness fixes without changing fixed ports. 3. Add docs/scripts.md covering purpose, invocation, prerequisites, side effects, and CI role for every script, then link it from existing documentation. 4. Run syntax, targeted script gates, mutation tests, quality, AgentPlane doctor, routing validation, and final status checks. 5. Record any Docker, database, or sandbox checks not run with their concrete residual risk."
  Verify Steps: "1. Run node --check for every scripts/*.mjs file. Expected: all scripts parse. 2. Run pnpm run test:mutation. Expected: baseline passes and all configured Decision Engine mutants are killed without infrastructure-error misclassification. 3. Run pnpm run verify:database-architecture, verify:deprecated-endpoints, docs:check, security:secrets, security:container, profile:checksum, and verify:wb-contract-fixtures. Expected: all pass and security:secrets no longer flags the committed runtime E2E test token. 4. Run pnpm run quality. Expected: all configured static, unit, contract, profile, fixture, and architecture checks pass. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: policy routing and repository health pass. 6. Run git diff --check and git status --short --untracked-files=all. Expected: no whitespace errors or unintended files; fixed port literals remain unchanged. Docker Compose, built-app, and sandbox smoke are not executed unless their stateful prerequisites are separately approved."
  Verification: |-
    Command: node --check scripts/*.mjs; pnpm run test:mutation; pnpm run verify:database-architecture; pnpm run verify:deprecated-endpoints; pnpm run docs:check; pnpm run security:secrets; pnpm run security:container; pnpm run profile:checksum; pnpm run verify:wb-contract-fixtures; pnpm run quality; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check. Result: pass. Evidence: all 12 scripts parse; mutation score 100% (9/9); 126 unit, 1 golden, 2 OpenAPI, and 19 contract tests passed; 24 mandatory documents and all script descriptions passed; secret scan checked 567 files with no findings; container, architecture, endpoint profile, fixture, deprecated endpoint, routing, doctor, formatting, lint, typecheck, Prisma validation, and whitespace checks passed. Scope: task-scoped scripts, package command registry, README/testing links, and docs/scripts.md.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T10:49:37.998Z — VERIFY — ok

    By: CODER

    Note: Verified: all declared local script, mutation, quality, documentation, security, routing, and repository health checks passed; approved stateful smoke exclusions are recorded.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T10:49:37.621Z, excerpt_hash=sha256:268e95107b0b58b6ee6947f19d49de0a8308f0f28e3d8aab9cb19e4965117d6c

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031040-RDFEWP/blueprint/resolved-snapshot.json
    - old_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
    - current_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608031040-RDFEWP

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608031040-RDFEWP
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T10:50:46.933Z — VERIFY — ok

    By: CODER

    Note: verified-202608031040-RDFEWP
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T10:49:38.072Z, excerpt_hash=sha256:268e95107b0b58b6ee6947f19d49de0a8308f0f28e3d8aab9cb19e4965117d6c

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031040-RDFEWP/blueprint/resolved-snapshot.json
    - old_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
    - current_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608031040-RDFEWP

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608031040-RDFEWP --result verified-202608031040-RDFEWP --commit a92aa1018c95bc4db361e92569788f7778b3cbd6
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert only the task-scoped script and documentation changes. No data migration or external rollback is required because real sandbox, Docker Compose, and database-backed smoke execution are excluded."
  Findings: |-
    - Observation: Stateful smoke commands smoke:compose, smoke:built, and smoke:sandbox were not executed under the approved local verification plan.
      Impact: Docker topology and external WB sandbox behavior were not re-exercised in this task; syntax, lint, static policy checks, and existing contract/runtime-independent tests cover the changed code paths.
      Resolution: Keep CI smoke:compose and smoke:built as the runtime evidence; run smoke:sandbox only in the separately provisioned release environment with explicit write confirmation.
id_source: "generated"
---
## Summary

Harden repository utility scripts based on the completed review, preserve all fixed port numbers, and add a canonical Russian-language guide for every script.

## Scope

Included: targeted correctness and diagnostic improvements in scripts/run-decision-mutation-tests.mjs, scripts/sandbox-smoke.mjs, scripts/smoke-built-apps.mjs, scripts/verify-container.mjs, scripts/verify-database-architecture.mjs, scripts/verify-deprecated-endpoints.mjs, scripts/verify-docs.mjs, scripts/verify-secrets.mjs; a new docs/scripts.md; and minimal links or script registry updates in README.md, docs/testing.md, package.json, or vitest.config.ts when required. Fixed port numbers must remain unchanged. Excluded: production application behavior, database schema, Docker/Compose topology, real sandbox execution, network access, releases, and unrelated cleanup.

## Plan

1. Inspect the relevant script contracts and their fixtures/configuration. 2. Implement bounded robustness fixes without changing fixed ports. 3. Add docs/scripts.md covering purpose, invocation, prerequisites, side effects, and CI role for every script, then link it from existing documentation. 4. Run syntax, targeted script gates, mutation tests, quality, AgentPlane doctor, routing validation, and final status checks. 5. Record any Docker, database, or sandbox checks not run with their concrete residual risk.

## Verify Steps

1. Run node --check for every scripts/*.mjs file. Expected: all scripts parse. 2. Run pnpm run test:mutation. Expected: baseline passes and all configured Decision Engine mutants are killed without infrastructure-error misclassification. 3. Run pnpm run verify:database-architecture, verify:deprecated-endpoints, docs:check, security:secrets, security:container, profile:checksum, and verify:wb-contract-fixtures. Expected: all pass and security:secrets no longer flags the committed runtime E2E test token. 4. Run pnpm run quality. Expected: all configured static, unit, contract, profile, fixture, and architecture checks pass. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: policy routing and repository health pass. 6. Run git diff --check and git status --short --untracked-files=all. Expected: no whitespace errors or unintended files; fixed port literals remain unchanged. Docker Compose, built-app, and sandbox smoke are not executed unless their stateful prerequisites are separately approved.

## Verification

Command: node --check scripts/*.mjs; pnpm run test:mutation; pnpm run verify:database-architecture; pnpm run verify:deprecated-endpoints; pnpm run docs:check; pnpm run security:secrets; pnpm run security:container; pnpm run profile:checksum; pnpm run verify:wb-contract-fixtures; pnpm run quality; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check. Result: pass. Evidence: all 12 scripts parse; mutation score 100% (9/9); 126 unit, 1 golden, 2 OpenAPI, and 19 contract tests passed; 24 mandatory documents and all script descriptions passed; secret scan checked 567 files with no findings; container, architecture, endpoint profile, fixture, deprecated endpoint, routing, doctor, formatting, lint, typecheck, Prisma validation, and whitespace checks passed. Scope: task-scoped scripts, package command registry, README/testing links, and docs/scripts.md.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T10:49:37.998Z — VERIFY — ok

By: CODER

Note: Verified: all declared local script, mutation, quality, documentation, security, routing, and repository health checks passed; approved stateful smoke exclusions are recorded.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T10:49:37.621Z, excerpt_hash=sha256:268e95107b0b58b6ee6947f19d49de0a8308f0f28e3d8aab9cb19e4965117d6c

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031040-RDFEWP/blueprint/resolved-snapshot.json
- old_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
- current_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608031040-RDFEWP

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608031040-RDFEWP
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T10:50:46.933Z — VERIFY — ok

By: CODER

Note: verified-202608031040-RDFEWP
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T10:49:38.072Z, excerpt_hash=sha256:268e95107b0b58b6ee6947f19d49de0a8308f0f28e3d8aab9cb19e4965117d6c

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031040-RDFEWP/blueprint/resolved-snapshot.json
- old_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
- current_digest: dec22f996ec0a884227ff7d1db7cb03930cac8b42aa806d80b795deca87a50af
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608031040-RDFEWP

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608031040-RDFEWP --result verified-202608031040-RDFEWP --commit a92aa1018c95bc4db361e92569788f7778b3cbd6
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert only the task-scoped script and documentation changes. No data migration or external rollback is required because real sandbox, Docker Compose, and database-backed smoke execution are excluded.

## Findings

- Observation: Stateful smoke commands smoke:compose, smoke:built, and smoke:sandbox were not executed under the approved local verification plan.
  Impact: Docker topology and external WB sandbox behavior were not re-exercised in this task; syntax, lint, static policy checks, and existing contract/runtime-independent tests cover the changed code paths.
  Resolution: Keep CI smoke:compose and smoke:built as the runtime evidence; run smoke:sandbox only in the separately provisioned release environment with explicit write confirmation.
