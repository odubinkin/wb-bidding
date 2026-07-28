---
id: "202607280615-PRC6DA"
title: "Require Swagger and OpenAPI documentation endpoints"
status: "DOING"
priority: "med"
owner: "DOCS"
revision: 13
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T06:15:53.225Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T06:19:45.690Z"
  updated_by: "EVALUATOR"
  note: "Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-28T06:20:08.667Z"
  updated_by: "EVALUATOR"
  note: "The committed Swagger/OpenAPI specification change passes semantic quality review and all approved documentation checks."
  evaluated_sha: "0cf90b49b359c3291e965a123c0ec84cebeb8626"
  blueprint_digest: "3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770"
  evidence_refs:
    - ".agentplane/tasks/202607280615-PRC6DA/README.md"
    - ".agentplane/tasks/202607280615-PRC6DA/quality/20260728-062008667-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280615-PRC6DA/quality/20260728-062008667-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280615-PRC6DA/quality/20260728-062008667-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json"
    - ".agentplane/tasks/202607280615-PRC6DA/quality/20260728-061937344-recovery-context/quality-report.json"
    - "commit:0cf90b49b359c3291e965a123c0ec84cebeb8626"
    - "docs/technical-specification.md"
    - "node .agentplane/policy/check-routing.mjs: policy routing OK"
    - "ap doctor: OK, errors=0, warnings=0"
    - "git diff --check: pass"
  findings:
    - "The change mandates /docs and /docs-json for both applications, defines complete contract coverage, connects the requirement to tests and CI, adds AC-19 and traceability, and preserves bidder production access controls."
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-28T06:16:08.544Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T06:17:53.247Z"
    author: "DOCS"
    state: "ok"
    note: "Command: rg -n \"(/docs|/docs-json|OpenAPI 3|Swagger)\" docs/technical-specification.md; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check; git status --short --untracked-files=all. Result: pass. Evidence: both bidder and mock requirements, AC-19, tests, CI, traceability, and implementation stage are present; routing reports OK; doctor reports errors=0 warnings=0; diff check is clean; changed paths are limited to docs/technical-specification.md and task 202607280615-PRC6DA artifacts. Scope: docs/technical-specification.md. Links: sections 15.5, 17, 24, 25, 26, 27, 28, and 29."
  -
    type: "verify"
    at: "2026-07-28T06:19:22.370Z"
    author: "EVALUATOR"
    state: "ok"
    note: "Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks."
  -
    type: "verify"
    at: "2026-07-28T06:19:45.690Z"
    author: "EVALUATOR"
    state: "ok"
    note: "Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks."
doc_version: 3
doc_updated_at: "2026-07-28T06:19:46.044Z"
doc_updated_by: "DOCS"
description: "Add mandatory Swagger UI and machine-readable OpenAPI documentation endpoints for both bidder and WB mock server to the technical specification."
sections:
  Summary: |-
    Require Swagger and OpenAPI documentation endpoints

    Add mandatory Swagger UI and machine-readable OpenAPI documentation endpoints for both bidder and WB mock server to the technical specification.
  Scope: |-
    - In scope: update docs/technical-specification.md to require Swagger UI at /docs and an OpenAPI 3.x JSON document at /docs-json for both bidder and wb-mock; define coverage, DTO/runtime consistency, security constraints, automated acceptance criteria, traceability, and implementation-stage placement.
    - In scope: Agentplane task artifacts and lifecycle metadata required for this documentation change.
    - Out of scope: application implementation, generated OpenAPI files, other project documentation, API behavior changes, and network access.
  Plan: |-
    1. Update bidder and mock-server requirements in docs/technical-specification.md with mandatory Swagger UI and OpenAPI JSON endpoints.
    2. Require coverage of bidder /api/v1, WB-compatible mock endpoints, and /__mock; document schema/error/auth consistency and secret-safe examples.
    3. Add an explicit acceptance criterion, traceability entry, and implementation-stage requirement.
    4. Verify exact endpoint requirements, internal consistency, Agentplane routing policy, and repository health; record evidence and finish the task.
  Verify Steps: |-
    1. Run: rg -n "(/docs|/docs-json|OpenAPI 3|Swagger)" docs/technical-specification.md. Expected: mandatory requirements exist for both bidder and wb-mock, including UI and machine-readable specification endpoints.
    2. Review sections 15, 17, 24, 27, 28, and 29. Expected: API coverage, runtime DTO consistency, authentication/security wording, acceptance criterion, traceability, and implementation stage are mutually consistent with no duplicate or conflicting requirement.
    3. Run: node .agentplane/policy/check-routing.mjs. Expected: exit code 0.
    4. Run: ap doctor. Expected: exit code 0 with no blocking repository-policy failure.
    5. Run: git diff --check. Expected: exit code 0.
    6. Run: git status --short --untracked-files=all. Expected: only the approved technical-specification and Agentplane task/lifecycle artifacts are changed.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T06:17:53.247Z — VERIFY — ok

    By: DOCS

    Note: Command: rg -n "(/docs|/docs-json|OpenAPI 3|Swagger)" docs/technical-specification.md; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check; git status --short --untracked-files=all. Result: pass. Evidence: both bidder and mock requirements, AC-19, tests, CI, traceability, and implementation stage are present; routing reports OK; doctor reports errors=0 warnings=0; diff check is clean; changed paths are limited to docs/technical-specification.md and task 202607280615-PRC6DA artifacts. Scope: docs/technical-specification.md. Links: sections 15.5, 17, 24, 25, 26, 27, 28, and 29.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:16:08.544Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
    - old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T06:19:22.370Z — VERIFY — ok

    By: EVALUATOR

    Note: Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:17:53.556Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
    - old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T06:19:45.690Z — VERIFY — ok

    By: EVALUATOR

    Note: Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:19:22.672Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
    - old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert the task close commit created by Agentplane, then rerun the targeted text checks, routing policy check, and repository health check to confirm the Swagger/OpenAPI requirement and its task artifacts were removed cleanly."
  Findings: |-
    - Observation: Swagger/OpenAPI requirements are explicit and consistent across API contracts, documentation, tests, CI, acceptance, traceability, and implementation planning.
      Impact: Implementations now have testable documentation endpoint contracts for both applications.
      Resolution: Verified the approved documentation-only change with targeted text review, routing validation, repository doctor, whitespace validation, and final scope status.
extensions:
  workflow_route_baseline:
    start_head_sha: "0656e02030a383f91f692fed73773ebd49093961"
    version: 1
id_source: "generated"
---
## Summary

Require Swagger and OpenAPI documentation endpoints

Add mandatory Swagger UI and machine-readable OpenAPI documentation endpoints for both bidder and WB mock server to the technical specification.

## Scope

- In scope: update docs/technical-specification.md to require Swagger UI at /docs and an OpenAPI 3.x JSON document at /docs-json for both bidder and wb-mock; define coverage, DTO/runtime consistency, security constraints, automated acceptance criteria, traceability, and implementation-stage placement.
- In scope: Agentplane task artifacts and lifecycle metadata required for this documentation change.
- Out of scope: application implementation, generated OpenAPI files, other project documentation, API behavior changes, and network access.

## Plan

1. Update bidder and mock-server requirements in docs/technical-specification.md with mandatory Swagger UI and OpenAPI JSON endpoints.
2. Require coverage of bidder /api/v1, WB-compatible mock endpoints, and /__mock; document schema/error/auth consistency and secret-safe examples.
3. Add an explicit acceptance criterion, traceability entry, and implementation-stage requirement.
4. Verify exact endpoint requirements, internal consistency, Agentplane routing policy, and repository health; record evidence and finish the task.

## Verify Steps

1. Run: rg -n "(/docs|/docs-json|OpenAPI 3|Swagger)" docs/technical-specification.md. Expected: mandatory requirements exist for both bidder and wb-mock, including UI and machine-readable specification endpoints.
2. Review sections 15, 17, 24, 27, 28, and 29. Expected: API coverage, runtime DTO consistency, authentication/security wording, acceptance criterion, traceability, and implementation stage are mutually consistent with no duplicate or conflicting requirement.
3. Run: node .agentplane/policy/check-routing.mjs. Expected: exit code 0.
4. Run: ap doctor. Expected: exit code 0 with no blocking repository-policy failure.
5. Run: git diff --check. Expected: exit code 0.
6. Run: git status --short --untracked-files=all. Expected: only the approved technical-specification and Agentplane task/lifecycle artifacts are changed.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T06:17:53.247Z — VERIFY — ok

By: DOCS

Note: Command: rg -n "(/docs|/docs-json|OpenAPI 3|Swagger)" docs/technical-specification.md; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check; git status --short --untracked-files=all. Result: pass. Evidence: both bidder and mock requirements, AC-19, tests, CI, traceability, and implementation stage are present; routing reports OK; doctor reports errors=0 warnings=0; diff check is clean; changed paths are limited to docs/technical-specification.md and task 202607280615-PRC6DA artifacts. Scope: docs/technical-specification.md. Links: sections 15.5, 17, 24, 25, 26, 27, 28, and 29.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:16:08.544Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
- old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T06:19:22.370Z — VERIFY — ok

By: EVALUATOR

Note: Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:17:53.556Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
- old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T06:19:45.690Z — VERIFY — ok

By: EVALUATOR

Note: Semantic quality review passed against commit 0cf90b49b359 and all approved verification checks.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:19:22.672Z, excerpt_hash=sha256:46f60ecc1eb6d7833092b7af97e2885bc0e5fb652624e3c19cf0a0827342d1f7

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280615-PRC6DA/blueprint/resolved-snapshot.json
- old_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- current_digest: 3cf0fe77ef0a583e6535cd8b5c38bb3ee9dc4c16a4f747519005a68224ca3770
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280615-PRC6DA

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert the task close commit created by Agentplane, then rerun the targeted text checks, routing policy check, and repository health check to confirm the Swagger/OpenAPI requirement and its task artifacts were removed cleanly.

## Findings

- Observation: Swagger/OpenAPI requirements are explicit and consistent across API contracts, documentation, tests, CI, acceptance, traceability, and implementation planning.
  Impact: Implementations now have testable documentation endpoint contracts for both applications.
  Resolution: Verified the approved documentation-only change with targeted text review, routing validation, repository doctor, whitespace validation, and final scope status.
