---
id: "202608030852-TW5B28"
title: "Strengthen critical scenario test coverage"
result_summary: "verified-202608030852-TW5B28"
status: "DONE"
priority: "high"
owner: "TESTER"
revision: 18
origin:
  system: "manual"
depends_on: []
tags:
  - "backend"
  - "code"
  - "testing"
task_kind: "code"
mutation_scope: "code"
blueprint_request: "quality.regression"
verify:
  - "pnpm run build"
  - "pnpm run quality"
  - "pnpm run test:e2e"
  - "pnpm run test:integration"
  - "pnpm run test:load"
  - "pnpm run test:mutation"
  - "pnpm run test:property"
  - "pnpm run test:runbook"
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T08:54:40.143Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T09:18:16.189Z"
  updated_by: "CODER"
  note: "verified-202608030852-TW5B28"
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-08-03T09:17:38.474Z"
  updated_by: "EVALUATOR"
  note: "Coverage hardening is scoped, deterministic, and fully verified without production behavior changes."
  evaluated_sha: "19f36324952177c65827518a65472830e3c2b563"
  blueprint_digest: "d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166"
  evidence_refs:
    - ".agentplane/tasks/202608030852-TW5B28/README.md"
    - ".agentplane/tasks/202608030852-TW5B28/quality/20260803-091738474-recovery-context/quality-report.json"
    - ".agentplane/tasks/202608030852-TW5B28/quality/20260803-091738474-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202608030852-TW5B28/quality/20260803-091738474-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json"
    - "pnpm run quality: pass, 125 unit tests and 79.97% line coverage over expanded scope"
    - "PostgreSQL 18: 36 integration, 4 E2E, 23 load, and 30 runbook tests pass"
    - "pnpm run test:mutation: 100% score, 9/9 killed"
    - "pnpm run build; ap doctor; policy routing: pass"
  findings:
    - "The former narrow aggregate coverage gate is replaced by expanded per-file measurement with stronger domain overrides."
    - "Runtime bootstrap, scheduler shutdown, Admin success routes, Stage 5 populated upgrade, and real bidder bootstrap now have executable regression evidence."
commit:
  hash: "6cdf56757b43b6ce6d81e558580a969139d753f0"
  message: "🚧 TW5B28 task: record coverage evaluation"
comments:
  -
    author: "TESTER"
    body: "Start: implement the approved critical-scenario coverage and CI hardening plan in the current direct-mode checkout."
  -
    author: "CODER"
    body: "Verified: verified-202608030852-TW5B28. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
events:
  -
    type: "status"
    at: "2026-08-03T08:54:53.060Z"
    author: "TESTER"
    from: "TODO"
    to: "DOING"
    note: "Start: implement the approved critical-scenario coverage and CI hardening plan in the current direct-mode checkout."
  -
    type: "verify"
    at: "2026-08-03T09:15:51.251Z"
    author: "TESTER"
    state: "ok"
    note: "Expanded critical coverage and all approved verification layers pass."
  -
    type: "verify"
    at: "2026-08-03T09:17:52.226Z"
    author: "CODER"
    state: "ok"
    note: "verified-202608030852-TW5B28"
  -
    type: "verify"
    at: "2026-08-03T09:18:16.189Z"
    author: "CODER"
    state: "ok"
    note: "verified-202608030852-TW5B28"
  -
    type: "status"
    at: "2026-08-03T09:18:16.396Z"
    author: "CODER"
    from: "DOING"
    to: "DONE"
    note: "Verified: verified-202608030852-TW5B28. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
doc_version: 3
doc_updated_at: "2026-08-03T09:18:16.397Z"
doc_updated_by: "CODER"
description: "Close the approved gaps in CI coverage gates, runtime composition, Admin API, runbook shutdown, database migration coverage, and representative system E2E tests without modifying production behavior."
sections:
  Summary: |-
    Strengthen critical scenario test coverage

    Close the approved gaps in CI coverage gates, runtime composition, Admin API, runbook shutdown, database migration coverage, and representative system E2E tests without modifying production behavior.
  Scope: |-
    In scope:
    - Strengthen CI gates for property, mutation, database-backed suite execution, and coverage visibility.
    - Add tests for runtime bootstrap/scheduler/write orchestration, Admin API success and permission paths, graceful shutdown, Stage 5 populated upgrades, and representative full-system flows.
    - Update only test files, test/CI configuration, package scripts, and test evidence documentation.
    - Preserve production behavior; production source changes are out of scope unless separately re-approved.

    Expected touched areas:
    - .github/workflows/ci.yml, package.json, vitest.config.ts
    - tests/unit, tests/integration, tests/e2e, tests/runbook
    - docs/testing.md and docs/e2e-scenario-evidence.md when evidence changes

    Constraints:
    - No network access or production/sandbox credentials.
    - Local Docker/PostgreSQL may be used only from already installed images.
    - Stop for re-approval if a production implementation defect requires source changes or if scope expands materially.
  Plan: |-
    1. Make property and mutation suites mandatory in CI and add a guard that prevents database-backed suites from silently skipping in CI.
    2. Broaden coverage measurement to the critical executable modules with explicit global/per-file expectations that reflect real suite coverage rather than a narrow denominator.
    3. Add runtime composition tests for bootstrap gates, scheduler registration/non-overlap, write-runtime delegation, integration-health transitions, and graceful shutdown lease release.
    4. Add PostgreSQL-backed Admin API success/permission/idempotency/audit tests and targeted populated-upgrade checks for Stage 5 migrations.
    5. Add representative full-system E2E evidence through the real bidder composition where deterministic execution is possible; correct the evidence matrix so each scenario states its actual test level.
    6. Run the complete verification contract with an isolated local PostgreSQL service, record evidence, and finish only with a clean intentional diff.
  Verify Steps: |-
    1. pnpm run quality — formatting, lint, typecheck, unit coverage, contract/OpenAPI, and static gates pass.
    2. pnpm run test:property — all invariant/property cases pass.
    3. pnpm run test:mutation — semantic mutation score meets the configured threshold.
    4. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:integration — no DB suite is skipped and all scenarios pass.
    5. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:e2e — all representative system/write flows pass without duplicate writes.
    6. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:load and pnpm run test:runbook — load and operational scenarios pass.
    7. pnpm run build — all workspace packages build.
    8. ap doctor and node .agentplane/policy/check-routing.mjs — repository routing remains valid.
    9. git status --short --untracked-files=all — only intentional task files are present.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T09:15:51.251Z — VERIFY — ok

    By: TESTER

    Note: Expanded critical coverage and all approved verification layers pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:15:37.625Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

    Details:

    Command: pnpm run quality. Result: pass. Evidence: 13 unit files/125 tests; expanded coverage 79.97% lines, 70.61% branches; golden, OpenAPI, 19 contract tests, schema/profile/fixture gates pass. Scope: fast critical modules and HTTP contracts.
    Command: pnpm run test:property and pnpm run test:mutation. Result: pass. Evidence: 3 property tests and 100% mutation score (9/9 killed). Scope: decision invariants and semantic guardrails.
    Command: database-backed integration files on fresh PostgreSQL 18. Result: pass. Evidence: 36/36 integration tests including populated Stage 5 upgrade. Scope: repositories, migrations, runtime and concurrency.
    Command: pnpm run test:e2e. Result: pass. Evidence: 2 files/4 tests including real AppModule bootstrap against wb-mock and PostgreSQL. Scope: system composition and durable write flow.
    Command: pnpm run test:load and pnpm run test:runbook. Result: pass. Evidence: 23 load and 30 operational tests. Scope: capacity, indexes, recovery and shutdown.
    Command: pnpm run build; ap doctor; node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: all workspaces built; doctor OK; policy routing OK. Scope: build and repository governance.

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
    - old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030852-TW5B28

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608030852-TW5B28
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T09:17:52.226Z — VERIFY — ok

    By: CODER

    Note: verified-202608030852-TW5B28
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:16:27.684Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
    - old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030852-TW5B28

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030852-TW5B28 --result verified-202608030852-TW5B28 --commit 19f36324952177c65827518a65472830e3c2b563
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-08-03T09:18:16.189Z — VERIFY — ok

    By: CODER

    Note: verified-202608030852-TW5B28
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:17:52.396Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
    - old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608030852-TW5B28

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task complete 202608030852-TW5B28 --result verified-202608030852-TW5B28 --commit 6cdf56757b43b6ce6d81e558580a969139d753f0
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert the implementation commit and the deterministic AgentPlane close commit for this task.
    - Remove only the isolated task PostgreSQL container/database if it is still present; do not touch unrelated Docker resources.
    - Re-run pnpm run quality and pnpm run build to confirm the prior baseline is restored.
  Findings: |-
    - Observation: The previous unit coverage gate reported 98.04 percent lines over only 551 executable lines and CI omitted property and mutation suites.
      Impact: Critical runtime, WB client, write orchestration, and test-quality regressions could merge behind a misleading green aggregate.
      Resolution: Expanded per-file coverage to the critical fast-test surface, added runtime/Admin/system/migration tests, made property and mutation mandatory in CI, and made DB-backed scripts fail when DATABASE_URL is absent.
      Promotion: incident-candidate
      Fixability: repo-fixable

    - Observation: A repeated integration run against the same source database fails because append-only fixtures intentionally preserve immutable versions.
      Impact: Local verification can appear flaky if the documented fresh-database precondition is ignored.
      Resolution: Final database evidence used a freshly recreated PostgreSQL 18 service; suites were executed once in their normal order, with the long integration group split by file only to stay within the local command runner time limit.
      Promotion: incident-candidate
      Fixability: repo-fixable
extensions:
  implementation_commit:
    hash: "19f36324952177c65827518a65472830e3c2b563"
    message: "🚧 TW5B28 task: strengthen critical scenario coverage"
id_source: "generated"
---
## Summary

Strengthen critical scenario test coverage

Close the approved gaps in CI coverage gates, runtime composition, Admin API, runbook shutdown, database migration coverage, and representative system E2E tests without modifying production behavior.

## Scope

In scope:
- Strengthen CI gates for property, mutation, database-backed suite execution, and coverage visibility.
- Add tests for runtime bootstrap/scheduler/write orchestration, Admin API success and permission paths, graceful shutdown, Stage 5 populated upgrades, and representative full-system flows.
- Update only test files, test/CI configuration, package scripts, and test evidence documentation.
- Preserve production behavior; production source changes are out of scope unless separately re-approved.

Expected touched areas:
- .github/workflows/ci.yml, package.json, vitest.config.ts
- tests/unit, tests/integration, tests/e2e, tests/runbook
- docs/testing.md and docs/e2e-scenario-evidence.md when evidence changes

Constraints:
- No network access or production/sandbox credentials.
- Local Docker/PostgreSQL may be used only from already installed images.
- Stop for re-approval if a production implementation defect requires source changes or if scope expands materially.

## Plan

1. Make property and mutation suites mandatory in CI and add a guard that prevents database-backed suites from silently skipping in CI.
2. Broaden coverage measurement to the critical executable modules with explicit global/per-file expectations that reflect real suite coverage rather than a narrow denominator.
3. Add runtime composition tests for bootstrap gates, scheduler registration/non-overlap, write-runtime delegation, integration-health transitions, and graceful shutdown lease release.
4. Add PostgreSQL-backed Admin API success/permission/idempotency/audit tests and targeted populated-upgrade checks for Stage 5 migrations.
5. Add representative full-system E2E evidence through the real bidder composition where deterministic execution is possible; correct the evidence matrix so each scenario states its actual test level.
6. Run the complete verification contract with an isolated local PostgreSQL service, record evidence, and finish only with a clean intentional diff.

## Verify Steps

1. pnpm run quality — formatting, lint, typecheck, unit coverage, contract/OpenAPI, and static gates pass.
2. pnpm run test:property — all invariant/property cases pass.
3. pnpm run test:mutation — semantic mutation score meets the configured threshold.
4. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:integration — no DB suite is skipped and all scenarios pass.
5. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:e2e — all representative system/write flows pass without duplicate writes.
6. DATABASE_URL=<isolated PostgreSQL 18> pnpm run test:load and pnpm run test:runbook — load and operational scenarios pass.
7. pnpm run build — all workspace packages build.
8. ap doctor and node .agentplane/policy/check-routing.mjs — repository routing remains valid.
9. git status --short --untracked-files=all — only intentional task files are present.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T09:15:51.251Z — VERIFY — ok

By: TESTER

Note: Expanded critical coverage and all approved verification layers pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:15:37.625Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

Details:

Command: pnpm run quality. Result: pass. Evidence: 13 unit files/125 tests; expanded coverage 79.97% lines, 70.61% branches; golden, OpenAPI, 19 contract tests, schema/profile/fixture gates pass. Scope: fast critical modules and HTTP contracts.
Command: pnpm run test:property and pnpm run test:mutation. Result: pass. Evidence: 3 property tests and 100% mutation score (9/9 killed). Scope: decision invariants and semantic guardrails.
Command: database-backed integration files on fresh PostgreSQL 18. Result: pass. Evidence: 36/36 integration tests including populated Stage 5 upgrade. Scope: repositories, migrations, runtime and concurrency.
Command: pnpm run test:e2e. Result: pass. Evidence: 2 files/4 tests including real AppModule bootstrap against wb-mock and PostgreSQL. Scope: system composition and durable write flow.
Command: pnpm run test:load and pnpm run test:runbook. Result: pass. Evidence: 23 load and 30 operational tests. Scope: capacity, indexes, recovery and shutdown.
Command: pnpm run build; ap doctor; node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: all workspaces built; doctor OK; policy routing OK. Scope: build and repository governance.

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
- old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030852-TW5B28

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608030852-TW5B28
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T09:17:52.226Z — VERIFY — ok

By: CODER

Note: verified-202608030852-TW5B28
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:16:27.684Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
- old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030852-TW5B28

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030852-TW5B28 --result verified-202608030852-TW5B28 --commit 19f36324952177c65827518a65472830e3c2b563
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-08-03T09:18:16.189Z — VERIFY — ok

By: CODER

Note: verified-202608030852-TW5B28
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T09:17:52.396Z, excerpt_hash=sha256:843509e7ac560015434194ed758c1026e587da686a456122b3ccdc3d434303fa

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608030852-TW5B28/blueprint/resolved-snapshot.json
- old_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- current_digest: d276a4ec4eaba10fd518dd9c6b4b8903a49d2861f382260e2fcc36ac5bf81166
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608030852-TW5B28

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task complete 202608030852-TW5B28 --result verified-202608030852-TW5B28 --commit 6cdf56757b43b6ce6d81e558580a969139d753f0
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert the implementation commit and the deterministic AgentPlane close commit for this task.
- Remove only the isolated task PostgreSQL container/database if it is still present; do not touch unrelated Docker resources.
- Re-run pnpm run quality and pnpm run build to confirm the prior baseline is restored.

## Findings

- Observation: The previous unit coverage gate reported 98.04 percent lines over only 551 executable lines and CI omitted property and mutation suites.
  Impact: Critical runtime, WB client, write orchestration, and test-quality regressions could merge behind a misleading green aggregate.
  Resolution: Expanded per-file coverage to the critical fast-test surface, added runtime/Admin/system/migration tests, made property and mutation mandatory in CI, and made DB-backed scripts fail when DATABASE_URL is absent.
  Promotion: incident-candidate
  Fixability: repo-fixable

- Observation: A repeated integration run against the same source database fails because append-only fixtures intentionally preserve immutable versions.
  Impact: Local verification can appear flaky if the documented fresh-database precondition is ignored.
  Resolution: Final database evidence used a freshly recreated PostgreSQL 18 service; suites were executed once in their normal order, with the long integration group split by file only to stay within the local command runner time limit.
  Promotion: incident-candidate
  Fixability: repo-fixable
