---
id: "202607280553-TPKTPK"
title: "Align specification with single-seller scope"
result_summary: "ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены."
status: "DONE"
priority: "med"
owner: "DOCS"
revision: 15
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T05:53:55.090Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T06:01:14.369Z"
  updated_by: "DOCS"
  note: "ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-28T06:00:46.694Z"
  updated_by: "EVALUATOR"
  note: "ТЗ последовательно приведено к single-seller deployment с одной валютой из env."
  evaluated_sha: "e868a798ecbfb3cd2763dd820787c18c99cb8258"
  blueprint_digest: "55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30"
  evidence_refs:
    - ".agentplane/tasks/202607280553-TPKTPK/README.md"
    - ".agentplane/tasks/202607280553-TPKTPK/quality/20260728-060046694-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280553-TPKTPK/quality/20260728-060046694-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280553-TPKTPK/quality/20260728-060046694-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json"
    - "docs/technical-specification.md"
  findings:
    - "Один WB token и один account scope зафиксированы в продуктовых границах; sellerId, seller-scoped API routes, multi-seller scheduling/fairness and per-record currency fields removed across data model, scheduler, executor, internal API, tests and acceptance criteria. ACCOUNT_CURRENCY is required at startup and becomes the sole runtime currency constant; conversion and currency selection remain explicitly out of scope."
commit:
  hash: "e868a798ecbfb3cd2763dd820787c18c99cb8258"
  message: "docs: align bidder specification with single-seller scope"
comments:
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "DOCS"
    body: "Verified: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
events:
  -
    type: "status"
    at: "2026-07-28T05:54:10.043Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T05:59:31.244Z"
    author: "DOCS"
    state: "ok"
    note: "Command: targeted rg checks, full diff review, git diff --check, node .agentplane/policy/check-routing.mjs, ap doctor, git status. Result: pass. Evidence: sellerId, seller-scoped routes, CURRENCY_MISMATCH, fairness, round-robin and per-record currency fields are absent; ACCOUNT_CURRENCY is a required startup-validated env value used as one runtime constant; routing OK; doctor errors=0 warnings=0. Scope: docs/technical-specification.md and task artifacts. Links: sections 2, 3, 8, 11-14, 17-18, 21, 25-31."
  -
    type: "verify"
    at: "2026-07-28T06:00:22.668Z"
    author: "DOCS"
    state: "ok"
    note: "ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены."
  -
    type: "verify"
    at: "2026-07-28T06:00:55.788Z"
    author: "DOCS"
    state: "ok"
    note: "ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены."
  -
    type: "verify"
    at: "2026-07-28T06:01:14.369Z"
    author: "DOCS"
    state: "ok"
    note: "ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены."
  -
    type: "status"
    at: "2026-07-28T06:01:14.773Z"
    author: "DOCS"
    from: "DOING"
    to: "DONE"
    note: "Verified: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.. Guided shortcut recorded verification and is closing the direct task with traceable commit metadata."
doc_version: 3
doc_updated_at: "2026-07-28T06:01:14.774Z"
doc_updated_by: "DOCS"
description: "Revise docs/technical-specification.md for one WB seller account per deployment and a deployment-level currency constant; remove unsupported multi-seller and multi-currency requirements."
sections:
  Summary: "Revise the canonical WB Bidder specification so the system manages thousands of campaigns for one seller through one WB account per deployment. Configure the account currency as a deployment constant instead of modeling multi-currency data."
  Scope: "In scope: docs/technical-specification.md and task artifacts; product boundaries, architecture, scheduler, rate limiting, data model, product economics API, audit/observability, security/isolation statements, tests, acceptance criteria, traceability, and implementation phases affected by single-seller scope. Out of scope: implementation code, WB API endpoint changes unrelated to tenancy, currency conversion, and support for multiple seller accounts in one deployment."
  Plan: "1. Inventory every multi-seller and per-record currency requirement. 2. Define one WB account and one ACCOUNT_CURRENCY constant per deployment. 3. Rewrite affected architecture, data model, scheduling, API, validation, testing, acceptance, and rollout requirements. 4. Search for residual sellerId, seller-account pluralization, fairness/round-robin, currency fields, and currency mismatch behavior. 5. Run documentation and AgentPlane verification and record evidence."
  Verify Steps: "1. Run targeted rg checks for sellerId, seller accounts, active sellers, fairness, round-robin, currency fields, CURRENCY_MISMATCH, and different-currency behavior; expected: no multi-seller behavior remains and currency appears only as the deployment constant or explanatory scope exclusion. 2. Review the full diff; expected: all dependent sections consistently describe one seller account and no unrelated WB API contract is changed. 3. Run git diff --check; expected: clean. 4. Run node .agentplane/policy/check-routing.mjs; expected: pass. 5. Run ap doctor; expected: pass. 6. Run git status --short --untracked-files=all; expected: only intentional specification and task artifacts before closure."
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T05:59:31.244Z — VERIFY — ok

    By: DOCS

    Note: Command: targeted rg checks, full diff review, git diff --check, node .agentplane/policy/check-routing.mjs, ap doctor, git status. Result: pass. Evidence: sellerId, seller-scoped routes, CURRENCY_MISMATCH, fairness, round-robin and per-record currency fields are absent; ACCOUNT_CURRENCY is a required startup-validated env value used as one runtime constant; routing OK; doctor errors=0 warnings=0. Scope: docs/technical-specification.md and task artifacts. Links: sections 2, 3, 8, 11-14, 17-18, 21, 25-31.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T05:54:10.043Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
    - old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

    ### 2026-07-28T06:00:22.668Z — VERIFY — ok

    By: DOCS

    Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T05:59:31.550Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
    - old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

    ### 2026-07-28T06:00:55.788Z — VERIFY — ok

    By: DOCS

    Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:00:22.984Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
    - old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

    ### 2026-07-28T06:01:14.369Z — VERIFY — ok

    By: DOCS

    Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:00:56.094Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
    - old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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
  Rollback Plan: "Revert only the documentation commit produced for task 202607280553-TPKTPK; no database, deployment, or external system changes are performed."
  Findings: "No findings yet."
extensions:
  workflow_route_baseline:
    start_head_sha: "a1e27ccd1902779415a69f4322e3f41e9253925e"
    version: 1
id_source: "generated"
---
## Summary

Revise the canonical WB Bidder specification so the system manages thousands of campaigns for one seller through one WB account per deployment. Configure the account currency as a deployment constant instead of modeling multi-currency data.

## Scope

In scope: docs/technical-specification.md and task artifacts; product boundaries, architecture, scheduler, rate limiting, data model, product economics API, audit/observability, security/isolation statements, tests, acceptance criteria, traceability, and implementation phases affected by single-seller scope. Out of scope: implementation code, WB API endpoint changes unrelated to tenancy, currency conversion, and support for multiple seller accounts in one deployment.

## Plan

1. Inventory every multi-seller and per-record currency requirement. 2. Define one WB account and one ACCOUNT_CURRENCY constant per deployment. 3. Rewrite affected architecture, data model, scheduling, API, validation, testing, acceptance, and rollout requirements. 4. Search for residual sellerId, seller-account pluralization, fairness/round-robin, currency fields, and currency mismatch behavior. 5. Run documentation and AgentPlane verification and record evidence.

## Verify Steps

1. Run targeted rg checks for sellerId, seller accounts, active sellers, fairness, round-robin, currency fields, CURRENCY_MISMATCH, and different-currency behavior; expected: no multi-seller behavior remains and currency appears only as the deployment constant or explanatory scope exclusion. 2. Review the full diff; expected: all dependent sections consistently describe one seller account and no unrelated WB API contract is changed. 3. Run git diff --check; expected: clean. 4. Run node .agentplane/policy/check-routing.mjs; expected: pass. 5. Run ap doctor; expected: pass. 6. Run git status --short --untracked-files=all; expected: only intentional specification and task artifacts before closure.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T05:59:31.244Z — VERIFY — ok

By: DOCS

Note: Command: targeted rg checks, full diff review, git diff --check, node .agentplane/policy/check-routing.mjs, ap doctor, git status. Result: pass. Evidence: sellerId, seller-scoped routes, CURRENCY_MISMATCH, fairness, round-robin and per-record currency fields are absent; ACCOUNT_CURRENCY is a required startup-validated env value used as one runtime constant; routing OK; doctor errors=0 warnings=0. Scope: docs/technical-specification.md and task artifacts. Links: sections 2, 3, 8, 11-14, 17-18, 21, 25-31.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T05:54:10.043Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
- old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

### 2026-07-28T06:00:22.668Z — VERIFY — ok

By: DOCS

Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T05:59:31.550Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
- old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

### 2026-07-28T06:00:55.788Z — VERIFY — ok

By: DOCS

Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:00:22.984Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
- old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

### 2026-07-28T06:01:14.369Z — VERIFY — ok

By: DOCS

Note: ТЗ приведено к одному WB-аккаунту на deployment; ACCOUNT_CURRENCY задаётся через env и используется как единая runtime-константа; multi-seller и per-record currency требования удалены.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:00:56.094Z, excerpt_hash=sha256:fc18f00fb3b24638b841a365f6850a6a41a1bfd6e4e76378a301d6824306f323

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280553-TPKTPK/blueprint/resolved-snapshot.json
- old_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- current_digest: 55af973df1173cfecb9c9c70b6d6cd66849a0be6a0bbb7d060731df4e6a28c30
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280553-TPKTPK

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

Revert only the documentation commit produced for task 202607280553-TPKTPK; no database, deployment, or external system changes are performed.

## Findings

No findings yet.
