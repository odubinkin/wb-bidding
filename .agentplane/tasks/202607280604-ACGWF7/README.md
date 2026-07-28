---
id: "202607280604-ACGWF7"
title: "Clarify per-unit variable costs in product economics"
status: "DOING"
priority: "med"
owner: "DOCS"
revision: 14
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T06:04:56.770Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T06:07:59.569Z"
  updated_by: "REVIEWER"
  note: "Clarified that other variable costs are expected per-unit costs assumed proportional to ordered units within the calculation window."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-28T06:08:37.003Z"
  updated_by: "EVALUATOR"
  note: "The wording-only change satisfies the approved clarification scope and remains consistent with the per-unit profit formulas."
  evaluated_sha: "5b2d7c350744ae46f1f4e84503361d100e2b33dd"
  blueprint_digest: "b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b"
  evidence_refs:
    - ".agentplane/tasks/202607280604-ACGWF7/README.md"
    - ".agentplane/tasks/202607280604-ACGWF7/quality/20260728-060837003-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280604-ACGWF7/quality/20260728-060837003-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280604-ACGWF7/quality/20260728-060837003-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280604-ACGWF7/blueprint/resolved-snapshot.json"
    - "docs/technical-specification.md:46"
    - "docs/technical-specification.md:54"
    - "docs/technical-specification.md:61"
    - "commit 5b2d7c350744"
    - "node .agentplane/policy/check-routing.mjs: policy routing OK"
    - "ap doctor: OK, errors=0 warnings=0"
  findings:
    - "No defects found: section 2.1 now explicitly identifies expected per-unit variable costs and states the proportionality assumption within the calculation window, without changing formulas, API contracts, or data-model semantics."
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-28T06:05:11.590Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T06:06:22.821Z"
    author: "REVIEWER"
    state: "ok"
    note: "Verified: the wording now states the expected per-unit and proportionality assumptions; diff scope and all required docs checks passed."
  -
    type: "verify"
    at: "2026-07-28T06:07:59.569Z"
    author: "REVIEWER"
    state: "ok"
    note: "Clarified that other variable costs are expected per-unit costs assumed proportional to ordered units within the calculation window."
doc_version: 3
doc_updated_at: "2026-07-28T06:08:00.001Z"
doc_updated_by: "DOCS"
description: "Clarify docs/technical-specification.md so expectedContributionBeforeAdsMinor explicitly represents expected per-unit variable costs assumed proportional to ordered units within the calculation window; do not change formulas, API, or data model."
sections:
  Summary: "Clarify that expectedContributionBeforeAdsMinor contains expected per-unit variable costs and relies on a proportionality assumption within the calculation window."
  Scope: "Edit only docs/technical-specification.md. Refine the existing bullet about other variable costs. Do not change formulas, API contracts, data model, or optimization behavior."
  Plan: "Replace the ambiguous variable-cost bullet with wording that identifies expected per-unit variable costs and states that, within the calculation window, they are assumed proportional to ordered units. Review all expectedContributionBeforeAdsMinor references for consistency, then run the documentation verification checks."
  Verify Steps: "1. Run: rg -n -C 8 'expectedContributionBeforeAdsMinor|удельн|пропорцион' docs/technical-specification.md. Expected: the definition clearly states the per-unit and proportionality assumptions and existing formulas remain consistent. 2. Run: git diff --check && git diff -- docs/technical-specification.md. Expected: one intentional wording-only documentation change with no whitespace errors. 3. Run: node .agentplane/policy/check-routing.mjs. Expected: pass. 4. Run: ap doctor. Expected: pass or only pre-existing non-scope warnings documented. 5. Run: git status --short --untracked-files=all. Expected: no unintended changes."
  Verification: |-
    Command: rg -n -C 8 'expectedContributionBeforeAdsMinor|удельн|пропорцион' docs/technical-specification.md. Result: pass. Evidence: line 54 now identifies expected per-unit variable costs and states the proportionality assumption; formulas at lines 61-65 and 615-618 remain consistent. Scope: docs/technical-specification.md. Links: sections 2.1 and 9.4.

    Command: git diff --check && git diff -- docs/technical-specification.md. Result: pass. Evidence: no whitespace errors and exactly one wording-only replacement. Scope: docs/technical-specification.md. Links: section 2.1.

    Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy routing. Links: AGENTS.md.

    Command: ap doctor. Result: pass. Evidence: doctor OK with zero errors and zero warnings. Scope: workflow and workspace health. Links: .agentplane/WORKFLOW.md.

    Command: git status --short --untracked-files=all. Result: pass. Evidence: only the intended technical specification change and task artifacts for 202607280604-ACGWF7 are present. Scope: full repository worktree. Links: task README and blueprint snapshot.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T06:06:22.821Z — VERIFY — ok

    By: REVIEWER

    Note: Verified: the wording now states the expected per-unit and proportionality assumptions; diff scope and all required docs checks passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:06:22.204Z, excerpt_hash=sha256:b37ecd0bac1f4c8c235d81156e0bc1419b0a1f1ca9405fe91052bed692402446

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280604-ACGWF7/blueprint/resolved-snapshot.json
    - old_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
    - current_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280604-ACGWF7

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

    ### 2026-07-28T06:07:59.569Z — VERIFY — ok

    By: REVIEWER

    Note: Clarified that other variable costs are expected per-unit costs assumed proportional to ordered units within the calculation window.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:06:23.117Z, excerpt_hash=sha256:b37ecd0bac1f4c8c235d81156e0bc1419b0a1f1ca9405fe91052bed692402446

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280604-ACGWF7/blueprint/resolved-snapshot.json
    - old_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
    - current_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280604-ACGWF7

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
  Rollback Plan: "Revert the single wording change in docs/technical-specification.md and re-run the same verification checks."
  Findings: "No findings yet."
extensions:
  workflow_route_baseline:
    start_head_sha: "577aadaa2fc066994d4473066b89de7d44ca2bd8"
    version: 1
id_source: "generated"
---
## Summary

Clarify that expectedContributionBeforeAdsMinor contains expected per-unit variable costs and relies on a proportionality assumption within the calculation window.

## Scope

Edit only docs/technical-specification.md. Refine the existing bullet about other variable costs. Do not change formulas, API contracts, data model, or optimization behavior.

## Plan

Replace the ambiguous variable-cost bullet with wording that identifies expected per-unit variable costs and states that, within the calculation window, they are assumed proportional to ordered units. Review all expectedContributionBeforeAdsMinor references for consistency, then run the documentation verification checks.

## Verify Steps

1. Run: rg -n -C 8 'expectedContributionBeforeAdsMinor|удельн|пропорцион' docs/technical-specification.md. Expected: the definition clearly states the per-unit and proportionality assumptions and existing formulas remain consistent. 2. Run: git diff --check && git diff -- docs/technical-specification.md. Expected: one intentional wording-only documentation change with no whitespace errors. 3. Run: node .agentplane/policy/check-routing.mjs. Expected: pass. 4. Run: ap doctor. Expected: pass or only pre-existing non-scope warnings documented. 5. Run: git status --short --untracked-files=all. Expected: no unintended changes.

## Verification

Command: rg -n -C 8 'expectedContributionBeforeAdsMinor|удельн|пропорцион' docs/technical-specification.md. Result: pass. Evidence: line 54 now identifies expected per-unit variable costs and states the proportionality assumption; formulas at lines 61-65 and 615-618 remain consistent. Scope: docs/technical-specification.md. Links: sections 2.1 and 9.4.

Command: git diff --check && git diff -- docs/technical-specification.md. Result: pass. Evidence: no whitespace errors and exactly one wording-only replacement. Scope: docs/technical-specification.md. Links: section 2.1.

Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy routing. Links: AGENTS.md.

Command: ap doctor. Result: pass. Evidence: doctor OK with zero errors and zero warnings. Scope: workflow and workspace health. Links: .agentplane/WORKFLOW.md.

Command: git status --short --untracked-files=all. Result: pass. Evidence: only the intended technical specification change and task artifacts for 202607280604-ACGWF7 are present. Scope: full repository worktree. Links: task README and blueprint snapshot.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T06:06:22.821Z — VERIFY — ok

By: REVIEWER

Note: Verified: the wording now states the expected per-unit and proportionality assumptions; diff scope and all required docs checks passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:06:22.204Z, excerpt_hash=sha256:b37ecd0bac1f4c8c235d81156e0bc1419b0a1f1ca9405fe91052bed692402446

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280604-ACGWF7/blueprint/resolved-snapshot.json
- old_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
- current_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280604-ACGWF7

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

### 2026-07-28T06:07:59.569Z — VERIFY — ok

By: REVIEWER

Note: Clarified that other variable costs are expected per-unit costs assumed proportional to ordered units within the calculation window.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:06:23.117Z, excerpt_hash=sha256:b37ecd0bac1f4c8c235d81156e0bc1419b0a1f1ca9405fe91052bed692402446

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280604-ACGWF7/blueprint/resolved-snapshot.json
- old_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
- current_digest: b78dcba108faa0211e10db4eb9ae1c586730a6c8826d593b3fb43b444855b84b
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280604-ACGWF7

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

Revert the single wording change in docs/technical-specification.md and re-run the same verification checks.

## Findings

No findings yet.
