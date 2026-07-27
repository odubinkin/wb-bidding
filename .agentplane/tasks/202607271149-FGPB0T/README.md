---
id: "202607271149-FGPB0T"
title: "Align specification with profit-only optimization"
status: "DOING"
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
  updated_at: "2026-07-27T11:49:50.911Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-27T12:01:27.359Z"
  updated_by: "DOCS"
  note: "Verified documentation consistency, JSON examples, routing policy, repository health, and evaluator quality review."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-27T12:01:15.084Z"
  updated_by: "EVALUATOR"
  note: "The specification consistently defines profit as the sole optimization objective and provides implementable product economics ingestion contracts."
  evaluated_sha: "ff1f9c6730e32fd85866cdeeecd24118171c5543"
  blueprint_digest: "9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679"
  evidence_refs:
    - ".agentplane/tasks/202607271149-FGPB0T/README.md"
    - ".agentplane/tasks/202607271149-FGPB0T/quality/20260727-120115084-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607271149-FGPB0T/quality/20260727-120115084-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607271149-FGPB0T/quality/20260727-120115084-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json"
    - "commit ff1f9c6730e32fd85866cdeeecd24118171c5543"
    - "docs/technical-specification.md sections 2.1, 8, 9, 17, 25, 27"
    - "JSON parse, git diff --check, node .agentplane/policy/check-routing.mjs, and ap doctor all passed"
  findings:
    - "Legacy ACOS/ROAS objective modes and component-level UnitEconomics are removed; ACOS/ROAS remain diagnostics only, while missing product economics fails closed per nmId."
    - "Single-item PUT and asynchronous batch import define monetary serialization, versioning, optimistic locking, idempotency, validation, partial success, dry-run, recovery, audit, pagination, and Decision Engine concurrency effects."
    - "BidPerformanceObservation closes the data-model gap required to evaluate candidate profit at confirmed historical bids."
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-27T11:50:00.839Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-27T11:59:48.189Z"
    author: "DOCS"
    state: "ok"
    note: "Verified: profit-only objective, aggregate product economics, deterministic candidate profit selection, and detailed single/batch API contracts are internally consistent; legacy modes are absent; JSON, diff, routing, and doctor checks pass."
  -
    type: "verify"
    at: "2026-07-27T12:00:45.971Z"
    author: "DOCS"
    state: "ok"
    note: "Verified documentation consistency, JSON examples, routing policy, and repository health."
  -
    type: "verify"
    at: "2026-07-27T12:01:27.359Z"
    author: "DOCS"
    state: "ok"
    note: "Verified documentation consistency, JSON examples, routing policy, repository health, and evaluator quality review."
doc_version: 3
doc_updated_at: "2026-07-27T12:01:27.657Z"
doc_updated_by: "DOCS"
description: "Revise docs/technical-specification.md so profit maximization is the only optimization objective, replace detailed unit economics with expectedContributionBeforeAds, and define single-item and batch import API contracts."
sections:
  Summary: "Revise the Russian technical specification so the only optimization objective is maximum expected profit. Replace component-level unit economics and ACOS/ROAS fallback modes with a seller-provided expectedContributionBeforeAds value per nmId, including precise single-item and asynchronous batch-import REST contracts."
  Scope: "In scope: docs/technical-specification.md only; business objective, product boundaries, modules, data model, decision formulas and reasons, Admin API contracts, audit/observability, mock scenarios, and test requirements affected by the new economics model. Out of scope: implementation code, other documentation, WB endpoint verification over the network, and alternative ACOS/ROAS optimization modes."
  Plan: "Revise docs/technical-specification.md for profit-only optimization; replace detailed unit economics with expectedContributionBeforeAds per sellerId+nmId; define exact single-item and asynchronous idempotent batch-import Admin API contracts; remove ACOS/ROAS objective modes and reconcile formulas, data model, audit, mock, observability, and tests; verify consistency plus AgentPlane checks."
  Verify Steps: "1. Run: rg -n 'TARGET_ACOS|TARGET_ROAS|UnitEconomics|unit economics|expectedBuyoutRatePpm|cogsMinor|desiredProfitRatePpm' docs/technical-specification.md. Expected: no legacy alternative optimization modes or component-level economics model remain except intentional explanatory statements. 2. Run: rg -n 'expectedContributionBeforeAds|/product-economics|batch|MISSING_PRODUCT_ECONOMICS|expectedProfit' docs/technical-specification.md. Expected: the objective, model, formulas, API contracts, failure behavior, audit, and tests are covered. 3. Manually inspect the git diff. Expected: only approved documentation/task artifacts changed and endpoint schemas are internally consistent. 4. Run: node .agentplane/policy/check-routing.mjs. Expected: pass. 5. Run: ap doctor. Expected: pass or only pre-existing non-scope warnings documented."
  Verification: |-
    Command: rg legacy economics/mode terms in docs/technical-specification.md. Result: pass. Evidence: no TARGET_ACOS, TARGET_ROAS, UnitEconomics, component-level economics fields, or legacy reason codes remain. Scope: docs/technical-specification.md. Links: sections 2.1, 8, 9, 17, 25, 27.

    Command: rg required expectedContributionBeforeAds/API/profit terms. Result: pass. Evidence: 57 matching lines cover objective, model, formulas, endpoints, failure behavior, audit, observability, and tests. Scope: docs/technical-specification.md. Links: sections 2.1, 8, 9, 17.

    Command: JSON fenced-block parse and git diff --check. Result: pass. Evidence: all 6 JSON examples parse; no whitespace errors. Scope: docs/technical-specification.md. Links: section 17.

    Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy graph; no policy files changed.

    Command: ap doctor. Result: pass. Evidence: errors=0, warnings=0, info=1; doctor OK. Scope: repository workflow health.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-27T11:59:48.189Z — VERIFY — ok

    By: DOCS

    Note: Verified: profit-only objective, aggregate product economics, deterministic candidate profit selection, and detailed single/batch API contracts are internally consistent; legacy modes are absent; JSON, diff, routing, and doctor checks pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T11:59:47.592Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
    - old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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

    ### 2026-07-27T12:00:45.971Z — VERIFY — ok

    By: DOCS

    Note: Verified documentation consistency, JSON examples, routing policy, and repository health.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T11:59:48.484Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
    - old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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

    ### 2026-07-27T12:01:27.359Z — VERIFY — ok

    By: DOCS

    Note: Verified documentation consistency, JSON examples, routing policy, repository health, and evaluator quality review.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T12:00:46.269Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
    - old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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
  Rollback Plan: "Revert the task close commit to restore the previous specification, then rerun node .agentplane/policy/check-routing.mjs and ap doctor. No database or external state migration is performed by this documentation-only task."
  Findings: "No material scope drift or unresolved documentation contradiction found. Product-wide profit maximization now depends on deterministic bid-response observations; the specification adds BidPerformanceObservation so candidate profit estimates are implementable. No network verification was performed because WB API facts were not changed."
extensions:
  workflow_route_baseline:
    start_head_sha: "b68641343e356881e02e9a8a1bf6da1b92045169"
    version: 1
id_source: "generated"
---
## Summary

Revise the Russian technical specification so the only optimization objective is maximum expected profit. Replace component-level unit economics and ACOS/ROAS fallback modes with a seller-provided expectedContributionBeforeAds value per nmId, including precise single-item and asynchronous batch-import REST contracts.

## Scope

In scope: docs/technical-specification.md only; business objective, product boundaries, modules, data model, decision formulas and reasons, Admin API contracts, audit/observability, mock scenarios, and test requirements affected by the new economics model. Out of scope: implementation code, other documentation, WB endpoint verification over the network, and alternative ACOS/ROAS optimization modes.

## Plan

Revise docs/technical-specification.md for profit-only optimization; replace detailed unit economics with expectedContributionBeforeAds per sellerId+nmId; define exact single-item and asynchronous idempotent batch-import Admin API contracts; remove ACOS/ROAS objective modes and reconcile formulas, data model, audit, mock, observability, and tests; verify consistency plus AgentPlane checks.

## Verify Steps

1. Run: rg -n 'TARGET_ACOS|TARGET_ROAS|UnitEconomics|unit economics|expectedBuyoutRatePpm|cogsMinor|desiredProfitRatePpm' docs/technical-specification.md. Expected: no legacy alternative optimization modes or component-level economics model remain except intentional explanatory statements. 2. Run: rg -n 'expectedContributionBeforeAds|/product-economics|batch|MISSING_PRODUCT_ECONOMICS|expectedProfit' docs/technical-specification.md. Expected: the objective, model, formulas, API contracts, failure behavior, audit, and tests are covered. 3. Manually inspect the git diff. Expected: only approved documentation/task artifacts changed and endpoint schemas are internally consistent. 4. Run: node .agentplane/policy/check-routing.mjs. Expected: pass. 5. Run: ap doctor. Expected: pass or only pre-existing non-scope warnings documented.

## Verification

Command: rg legacy economics/mode terms in docs/technical-specification.md. Result: pass. Evidence: no TARGET_ACOS, TARGET_ROAS, UnitEconomics, component-level economics fields, or legacy reason codes remain. Scope: docs/technical-specification.md. Links: sections 2.1, 8, 9, 17, 25, 27.

Command: rg required expectedContributionBeforeAds/API/profit terms. Result: pass. Evidence: 57 matching lines cover objective, model, formulas, endpoints, failure behavior, audit, observability, and tests. Scope: docs/technical-specification.md. Links: sections 2.1, 8, 9, 17.

Command: JSON fenced-block parse and git diff --check. Result: pass. Evidence: all 6 JSON examples parse; no whitespace errors. Scope: docs/technical-specification.md. Links: section 17.

Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy graph; no policy files changed.

Command: ap doctor. Result: pass. Evidence: errors=0, warnings=0, info=1; doctor OK. Scope: repository workflow health.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-27T11:59:48.189Z — VERIFY — ok

By: DOCS

Note: Verified: profit-only objective, aggregate product economics, deterministic candidate profit selection, and detailed single/batch API contracts are internally consistent; legacy modes are absent; JSON, diff, routing, and doctor checks pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T11:59:47.592Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
- old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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

### 2026-07-27T12:00:45.971Z — VERIFY — ok

By: DOCS

Note: Verified documentation consistency, JSON examples, routing policy, and repository health.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T11:59:48.484Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
- old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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

### 2026-07-27T12:01:27.359Z — VERIFY — ok

By: DOCS

Note: Verified documentation consistency, JSON examples, routing policy, repository health, and evaluator quality review.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-27T12:00:46.269Z, excerpt_hash=sha256:6792ff53d1a949361592a2c5c944d5ce38c215cb7472b6a3c617b82cc440d0f4

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607271149-FGPB0T/blueprint/resolved-snapshot.json
- old_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- current_digest: 9c477cefcc2420b0c149332e02ea210f82033580fdf654ade37f9229fcad5679
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607271149-FGPB0T

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

Revert the task close commit to restore the previous specification, then rerun node .agentplane/policy/check-routing.mjs and ap doctor. No database or external state migration is performed by this documentation-only task.

## Findings

No material scope drift or unresolved documentation contradiction found. Product-wide profit maximization now depends on deterministic bid-response observations; the specification adds BidPerformanceObservation so candidate profit estimates are implementable. No network verification was performed because WB API facts were not changed.
