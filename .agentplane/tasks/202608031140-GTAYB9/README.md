---
id: "202608031140-GTAYB9"
title: "Fix GitHub Actions action versions"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 6
origin:
  system: "manual"
depends_on: []
tags:
  - "ci"
  - "ops"
task_kind: "ops"
mutation_scope: "ops"
risk_flags:
  - "external_system"
  - "network"
verify:
  - "Run actionlint .github/workflows/ci.yml when actionlint is available; otherwise validate the workflow YAML with a local parser and record the limitation."
  - "Run ap doctor and node .agentplane/policy/check-routing.mjs; expected: repository workflow and policy checks pass."
  - "Run git status --short --untracked-files=all; expected: only the approved CI workflow and task artifacts are changed before closure."
  - "Run pnpm exec prettier --check .github/workflows/ci.yml and git diff --check; expected: workflow formatting and whitespace checks pass."
  - "Validate every referenced GitHub Action tag against its upstream repository; expected: each selected ref resolves to a commit."
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T11:40:45.739Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T11:43:02.236Z"
  updated_by: "REVIEWER"
  note: "CI action refs resolve upstream, formatting and YAML parsing pass, and repository policy checks are green; the diff is limited to the approved workflow and task artifacts."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: inspect the failed GitHub Actions run, update only CI action refs, and execute the approved verification contract."
events:
  -
    type: "status"
    at: "2026-08-03T11:40:52.870Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: inspect the failed GitHub Actions run, update only CI action refs, and execute the approved verification contract."
  -
    type: "verify"
    at: "2026-08-03T11:43:02.236Z"
    author: "REVIEWER"
    state: "ok"
    note: "CI action refs resolve upstream, formatting and YAML parsing pass, and repository policy checks are green; the diff is limited to the approved workflow and task artifacts."
doc_version: 3
doc_updated_at: "2026-08-03T11:43:02.337Z"
doc_updated_by: "CODER"
description: "Repair the failing CI workflow by replacing the unresolved Trivy action tag and upgrading JavaScript-based actions away from deprecated Node.js 20 runtimes, without changing job behavior."
sections:
  Summary: |-
    Fix GitHub Actions action versions

    Repair the failing CI workflow by replacing the unresolved Trivy action tag and upgrading JavaScript-based actions away from deprecated Node.js 20 runtimes, without changing job behavior.
  Scope: |-
    - In scope: Repair the failing CI workflow by replacing the unresolved Trivy action tag and upgrading JavaScript-based actions away from deprecated Node.js 20 runtimes, without changing job behavior.
    - Out of scope: unrelated refactors not required for "Fix GitHub Actions action versions".
  Plan: "1. Inspect the failed run and resolve current upstream action refs with approved read-only GitHub access. 2. Update only .github/workflows/ci.yml, preserving existing jobs and scan policy. 3. Validate action refs, workflow syntax/formatting, repository policy, and final scope. 4. Record verification and close the direct-mode task with traceable evidence."
  Verify Steps: |-
    1. Query the failed GitHub Actions run and upstream repositories for every selected action ref. Expected: the root cause matches the annotations and each replacement ref resolves to a commit.
    2. Run `pnpm exec prettier --check .github/workflows/ci.yml` and `git diff --check`. Expected: formatting and whitespace checks pass.
    3. Run `actionlint .github/workflows/ci.yml` when available; otherwise parse the YAML locally and record the limitation. Expected: no workflow syntax errors.
    4. Run `ap doctor` and `node .agentplane/policy/check-routing.mjs`. Expected: repository workflow and policy checks pass.
    5. Run `git status --short --untracked-files=all` and inspect the diff. Expected: only the approved CI workflow and AgentPlane task artifacts are changed before closure.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T11:43:02.236Z — VERIFY — ok

    By: REVIEWER

    Note: CI action refs resolve upstream, formatting and YAML parsing pass, and repository policy checks are green; the diff is limited to the approved workflow and task artifacts.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T11:40:52.870Z, excerpt_hash=sha256:521e658c776db8cb80cdee5840e00e983d2a7540be229db82d3dd74d6d1a0e82

    Details:

    Command: gh run view 30808332680 --repo odubinkin/wb-bidding --log-failed; git ls-remote --exit-code for actions/checkout@v7, actions/setup-node@v7, pnpm/action-setup@v6, and aquasecurity/trivy-action@v0.36.0. Result: pass. Evidence: failed run reports missing Trivy 0.33.1; all four replacement refs resolve; JavaScript actions declare node24. Scope: upstream action selection.

    Command: pnpm exec prettier --check .github/workflows/ci.yml; git diff --check. Result: pass. Evidence: Prettier matched and no whitespace errors. Scope: CI workflow diff.

    Command: Ruby YAML.safe_load fallback because actionlint is unavailable. Result: pass. Evidence: jobs quality and dependency-security parsed. Scope: workflow YAML syntax.

    Command: ap doctor; node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: doctor OK with one unrelated historical archive warning; policy routing OK. Scope: repository workflow health.

    Command: git status --short --untracked-files=all and git diff. Result: pass. Evidence: only .github/workflows/ci.yml and task 202608031140-GTAYB9 artifacts changed. Scope: approved task boundary.

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031140-GTAYB9/blueprint/resolved-snapshot.json
    - old_digest: 91b6568af90914ceb764a3ff46bf093c7b98247877e4e97e09c7a2344b4efe34
    - current_digest: 91b6568af90914ceb764a3ff46bf093c7b98247877e4e97e09c7a2344b4efe34
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608031140-GTAYB9

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608031140-GTAYB9
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: |-
    - Observation: The local environment has no actionlint binary, and the first Ruby fallback used an unavailable Psych safe_load_file method.
      Impact: Full actionlint semantic validation was unavailable locally; the first fallback attempt did not validate the file.
      Resolution: The supported YAML.safe_load API parsed both jobs successfully, all replacement refs resolved upstream, and hosted CI remains the final post-push confirmation.
id_source: "generated"
---
## Summary

Fix GitHub Actions action versions

Repair the failing CI workflow by replacing the unresolved Trivy action tag and upgrading JavaScript-based actions away from deprecated Node.js 20 runtimes, without changing job behavior.

## Scope

- In scope: Repair the failing CI workflow by replacing the unresolved Trivy action tag and upgrading JavaScript-based actions away from deprecated Node.js 20 runtimes, without changing job behavior.
- Out of scope: unrelated refactors not required for "Fix GitHub Actions action versions".

## Plan

1. Inspect the failed run and resolve current upstream action refs with approved read-only GitHub access. 2. Update only .github/workflows/ci.yml, preserving existing jobs and scan policy. 3. Validate action refs, workflow syntax/formatting, repository policy, and final scope. 4. Record verification and close the direct-mode task with traceable evidence.

## Verify Steps

1. Query the failed GitHub Actions run and upstream repositories for every selected action ref. Expected: the root cause matches the annotations and each replacement ref resolves to a commit.
2. Run `pnpm exec prettier --check .github/workflows/ci.yml` and `git diff --check`. Expected: formatting and whitespace checks pass.
3. Run `actionlint .github/workflows/ci.yml` when available; otherwise parse the YAML locally and record the limitation. Expected: no workflow syntax errors.
4. Run `ap doctor` and `node .agentplane/policy/check-routing.mjs`. Expected: repository workflow and policy checks pass.
5. Run `git status --short --untracked-files=all` and inspect the diff. Expected: only the approved CI workflow and AgentPlane task artifacts are changed before closure.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T11:43:02.236Z — VERIFY — ok

By: REVIEWER

Note: CI action refs resolve upstream, formatting and YAML parsing pass, and repository policy checks are green; the diff is limited to the approved workflow and task artifacts.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T11:40:52.870Z, excerpt_hash=sha256:521e658c776db8cb80cdee5840e00e983d2a7540be229db82d3dd74d6d1a0e82

Details:

Command: gh run view 30808332680 --repo odubinkin/wb-bidding --log-failed; git ls-remote --exit-code for actions/checkout@v7, actions/setup-node@v7, pnpm/action-setup@v6, and aquasecurity/trivy-action@v0.36.0. Result: pass. Evidence: failed run reports missing Trivy 0.33.1; all four replacement refs resolve; JavaScript actions declare node24. Scope: upstream action selection.

Command: pnpm exec prettier --check .github/workflows/ci.yml; git diff --check. Result: pass. Evidence: Prettier matched and no whitespace errors. Scope: CI workflow diff.

Command: Ruby YAML.safe_load fallback because actionlint is unavailable. Result: pass. Evidence: jobs quality and dependency-security parsed. Scope: workflow YAML syntax.

Command: ap doctor; node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: doctor OK with one unrelated historical archive warning; policy routing OK. Scope: repository workflow health.

Command: git status --short --untracked-files=all and git diff. Result: pass. Evidence: only .github/workflows/ci.yml and task 202608031140-GTAYB9 artifacts changed. Scope: approved task boundary.

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031140-GTAYB9/blueprint/resolved-snapshot.json
- old_digest: 91b6568af90914ceb764a3ff46bf093c7b98247877e4e97e09c7a2344b4efe34
- current_digest: 91b6568af90914ceb764a3ff46bf093c7b98247877e4e97e09c7a2344b4efe34
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608031140-GTAYB9

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608031140-GTAYB9
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings

- Observation: The local environment has no actionlint binary, and the first Ruby fallback used an unavailable Psych safe_load_file method.
  Impact: Full actionlint semantic validation was unavailable locally; the first fallback attempt did not validate the file.
  Resolution: The supported YAML.safe_load API parsed both jobs successfully, all replacement refs resolved upstream, and hosted CI remains the final post-push confirmation.
