---
id: "202607281022-V0JW74"
title: "Revise bidding specification from WB API review"
status: "DOING"
priority: "high"
owner: "DOCS"
revision: 10
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T10:23:02.417Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T10:41:55.630Z"
  updated_by: "DOCS"
  note: "All specification, semantic, routing, workspace, and scoped-status checks passed; official WB content was verified via browser fallback because direct portal fetches return 498."
  attempts: 0
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-28T10:23:15.337Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T10:41:21.537Z"
    author: "DOCS"
    state: "ok"
    note: "Command: targeted rg for BidPerformanceDay, attribution blocker, WB list/recommendations, virtual time, sandbox profiles, decision checksum, and AC-19..22. Result: pass. Evidence: all required concepts found in aligned sections. Scope: docs/technical-specification.md. Links: official WB promotion, API information, sandbox, and release-notes links in section 4. Command: read-only Node semantic assertion. Result: pass. Evidence: 6 required markers, 0 obsolete interval-model identifiers, exactly AC-01..AC-22. Scope: algorithm/model/testing/acceptance. Command: git diff --check. Result: pass. Evidence: no whitespace errors. Scope: specification diff. Command: git diff inspection and git status --short --untracked-files=all. Result: pass. Evidence: 532 insertions/165 deletions in the specification; only the approved specification and task artifacts are changed. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository routing policy. Command: ap doctor. Result: pass. Evidence: errors=0 warnings=0, compatibility info only. Scope: workspace. Link check: direct Node fetch returned portal-specific HTTP 498; official WB browser/search fallback resolved and confirmed fullstats limits, v1 cluster statistics, CPM-only cluster writes/recommendations, cluster visibility threshold, synchronization intervals, and sandbox daily statistics rule. The fallback and caveat are recorded in Findings."
  -
    type: "verify"
    at: "2026-07-28T10:41:55.630Z"
    author: "DOCS"
    state: "ok"
    note: "All specification, semantic, routing, workspace, and scoped-status checks passed; official WB content was verified via browser fallback because direct portal fetches return 498."
doc_version: 3
doc_updated_at: "2026-07-28T10:41:55.706Z"
doc_updated_by: "DOCS"
description: "Update docs/technical-specification.md with the approved deterministic daily estimator, WB API capability matrix, exploration lifecycle, complete policy and decision semantics, target-level sync freshness, mock virtual-time acceleration, sandbox smoke/soak behavior, and aligned tests/acceptance criteria."
sections:
  Summary: |-
    Revise bidding specification from WB API review

    Update docs/technical-specification.md with the approved deterministic daily estimator, WB API capability matrix, exploration lifecycle, complete policy and decision semantics, target-level sync freshness, mock virtual-time acceleration, sandbox smoke/soak behavior, and aligned tests/acceptance criteria.
  Scope: "In scope: docs/technical-specification.md and task artifacts. Revise WB API method coverage and capability matrix; replace interval profit observations with attribution-safe daily observations; define deterministic bid estimator, exploration, policy schema, guardrail precedence, money terminology, sync freshness, checksum semantics, mock virtual-time behavior, sandbox smoke/soak limitations, testing, acceptance, traceability, risks, and DoD. Out of scope: implementation code, other project docs, live WB writes, and support for portfolio budget optimization."
  Plan: "1. Update WB API sources, endpoints, capability matrix, product scope, and money terminology. 2. Revise data cycle and logical model for target-day observations and exploration state. 3. Replace Decision Engine sections with an exact daily bucket estimator, candidate rules, special strategies, decision pipeline, policy parameters, and reason semantics. 4. Align scheduler/freshness, mock virtual time, sandbox smoke/soak, checksum, audit, observability, and configuration. 5. Update tests, acceptance criteria, traceability, implementation stages, risks, and DoD. 6. Run semantic searches, Markdown/diff checks, routing validation, Agentplane doctor, and final status review."
  Verify Steps: "1. Inspect sections 3, 4, 7-9, 11-13, 15, 18-20, 25, and 27-31 and confirm capability, estimator, exploration, sync, mock/sandbox, acceptance, and DoD semantics are aligned. 2. Run targeted rg checks for BidPerformanceDay, INSUFFICIENT_ATTRIBUTION_GRANULARITY, bids/recommendations, normquery/list, virtual time, sandbox smoke/soak, decision fingerprint, and AC-19/new ACs. 3. Run a read-only script asserting required section markers and that obsolete interval-estimator claims are absent. 4. Run git diff --check and inspect git diff -- docs/technical-specification.md. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. 6. Run git status --short --untracked-files=all and confirm changes are limited to the specification and task artifacts."
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T10:41:21.537Z — VERIFY — ok

    By: DOCS

    Note: Command: targeted rg for BidPerformanceDay, attribution blocker, WB list/recommendations, virtual time, sandbox profiles, decision checksum, and AC-19..22. Result: pass. Evidence: all required concepts found in aligned sections. Scope: docs/technical-specification.md. Links: official WB promotion, API information, sandbox, and release-notes links in section 4. Command: read-only Node semantic assertion. Result: pass. Evidence: 6 required markers, 0 obsolete interval-model identifiers, exactly AC-01..AC-22. Scope: algorithm/model/testing/acceptance. Command: git diff --check. Result: pass. Evidence: no whitespace errors. Scope: specification diff. Command: git diff inspection and git status --short --untracked-files=all. Result: pass. Evidence: 532 insertions/165 deletions in the specification; only the approved specification and task artifacts are changed. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository routing policy. Command: ap doctor. Result: pass. Evidence: errors=0 warnings=0, compatibility info only. Scope: workspace. Link check: direct Node fetch returned portal-specific HTTP 498; official WB browser/search fallback resolved and confirmed fullstats limits, v1 cluster statistics, CPM-only cluster writes/recommendations, cluster visibility threshold, synchronization intervals, and sandbox daily statistics rule. The fallback and caveat are recorded in Findings.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T10:41:05.682Z, excerpt_hash=sha256:d5f10e080498990e6af78a045d3be8f9f263bbfef1b4ef1a7526fd326aef4528

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281022-V0JW74/blueprint/resolved-snapshot.json
    - old_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
    - current_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281022-V0JW74

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281022-V0JW74
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T10:41:55.630Z — VERIFY — ok

    By: DOCS

    Note: All specification, semantic, routing, workspace, and scoped-status checks passed; official WB content was verified via browser fallback because direct portal fetches return 498.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T10:41:21.614Z, excerpt_hash=sha256:d5f10e080498990e6af78a045d3be8f9f263bbfef1b4ef1a7526fd326aef4528

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281022-V0JW74/blueprint/resolved-snapshot.json
    - old_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
    - current_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281022-V0JW74

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: agentplane task next-action 202607281022-V0JW74 --explain
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: unsafe_shell_chain_route

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert only the task-specific changes to docs/technical-specification.md and the lifecycle artifacts for task 202607281022-V0JW74. Preserve unrelated user changes. Re-run the documentation, routing, doctor, and status checks after rollback."
  Findings: "WB portal raw-fetch note: a direct Node fetch check of the five official dev.wildberries.ru links returned HTTP 498 for every URL because the portal rejects that client path. This does not indicate broken links: the official WB search/browser source successfully resolved the promotion documentation, API information, sandbox page, release notes, and the required endpoint/rule content. Verification therefore uses the official browser-index evidence; no specification claim depends on the failed raw fetch."
id_source: "generated"
---
## Summary

Revise bidding specification from WB API review

Update docs/technical-specification.md with the approved deterministic daily estimator, WB API capability matrix, exploration lifecycle, complete policy and decision semantics, target-level sync freshness, mock virtual-time acceleration, sandbox smoke/soak behavior, and aligned tests/acceptance criteria.

## Scope

In scope: docs/technical-specification.md and task artifacts. Revise WB API method coverage and capability matrix; replace interval profit observations with attribution-safe daily observations; define deterministic bid estimator, exploration, policy schema, guardrail precedence, money terminology, sync freshness, checksum semantics, mock virtual-time behavior, sandbox smoke/soak limitations, testing, acceptance, traceability, risks, and DoD. Out of scope: implementation code, other project docs, live WB writes, and support for portfolio budget optimization.

## Plan

1. Update WB API sources, endpoints, capability matrix, product scope, and money terminology. 2. Revise data cycle and logical model for target-day observations and exploration state. 3. Replace Decision Engine sections with an exact daily bucket estimator, candidate rules, special strategies, decision pipeline, policy parameters, and reason semantics. 4. Align scheduler/freshness, mock virtual time, sandbox smoke/soak, checksum, audit, observability, and configuration. 5. Update tests, acceptance criteria, traceability, implementation stages, risks, and DoD. 6. Run semantic searches, Markdown/diff checks, routing validation, Agentplane doctor, and final status review.

## Verify Steps

1. Inspect sections 3, 4, 7-9, 11-13, 15, 18-20, 25, and 27-31 and confirm capability, estimator, exploration, sync, mock/sandbox, acceptance, and DoD semantics are aligned. 2. Run targeted rg checks for BidPerformanceDay, INSUFFICIENT_ATTRIBUTION_GRANULARITY, bids/recommendations, normquery/list, virtual time, sandbox smoke/soak, decision fingerprint, and AC-19/new ACs. 3. Run a read-only script asserting required section markers and that obsolete interval-estimator claims are absent. 4. Run git diff --check and inspect git diff -- docs/technical-specification.md. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. 6. Run git status --short --untracked-files=all and confirm changes are limited to the specification and task artifacts.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T10:41:21.537Z — VERIFY — ok

By: DOCS

Note: Command: targeted rg for BidPerformanceDay, attribution blocker, WB list/recommendations, virtual time, sandbox profiles, decision checksum, and AC-19..22. Result: pass. Evidence: all required concepts found in aligned sections. Scope: docs/technical-specification.md. Links: official WB promotion, API information, sandbox, and release-notes links in section 4. Command: read-only Node semantic assertion. Result: pass. Evidence: 6 required markers, 0 obsolete interval-model identifiers, exactly AC-01..AC-22. Scope: algorithm/model/testing/acceptance. Command: git diff --check. Result: pass. Evidence: no whitespace errors. Scope: specification diff. Command: git diff inspection and git status --short --untracked-files=all. Result: pass. Evidence: 532 insertions/165 deletions in the specification; only the approved specification and task artifacts are changed. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository routing policy. Command: ap doctor. Result: pass. Evidence: errors=0 warnings=0, compatibility info only. Scope: workspace. Link check: direct Node fetch returned portal-specific HTTP 498; official WB browser/search fallback resolved and confirmed fullstats limits, v1 cluster statistics, CPM-only cluster writes/recommendations, cluster visibility threshold, synchronization intervals, and sandbox daily statistics rule. The fallback and caveat are recorded in Findings.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T10:41:05.682Z, excerpt_hash=sha256:d5f10e080498990e6af78a045d3be8f9f263bbfef1b4ef1a7526fd326aef4528

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281022-V0JW74/blueprint/resolved-snapshot.json
- old_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
- current_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281022-V0JW74

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281022-V0JW74
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T10:41:55.630Z — VERIFY — ok

By: DOCS

Note: All specification, semantic, routing, workspace, and scoped-status checks passed; official WB content was verified via browser fallback because direct portal fetches return 498.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T10:41:21.614Z, excerpt_hash=sha256:d5f10e080498990e6af78a045d3be8f9f263bbfef1b4ef1a7526fd326aef4528

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281022-V0JW74/blueprint/resolved-snapshot.json
- old_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
- current_digest: 90b3813bbe5d387152d425c69bd0f74e6e4bb05cbcf4a190a67d259837b11ffe
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281022-V0JW74

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: agentplane task next-action 202607281022-V0JW74 --explain
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: unsafe_shell_chain_route

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert only the task-specific changes to docs/technical-specification.md and the lifecycle artifacts for task 202607281022-V0JW74. Preserve unrelated user changes. Re-run the documentation, routing, doctor, and status checks after rollback.

## Findings

WB portal raw-fetch note: a direct Node fetch check of the five official dev.wildberries.ru links returned HTTP 498 for every URL because the portal rejects that client path. This does not indicate broken links: the official WB search/browser source successfully resolved the promotion documentation, API information, sandbox page, release notes, and the required endpoint/rule content. Verification therefore uses the official browser-index evidence; no specification claim depends on the failed raw fetch.
