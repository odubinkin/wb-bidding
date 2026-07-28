---
id: "202607280628-MEEK6T"
title: "Replace WbApiCall with WbWriteAttempt"
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
  updated_at: "2026-07-28T06:28:41.326Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T06:31:15.074Z"
  updated_by: "DOCS"
  note: "Verified: the specification now persists only outbound WB write attempts, keeps read calls in logs and metrics, and defines reconciliation, redaction, retention, and test requirements; targeted diff checks, routing validation, and AgentPlane doctor all pass."
  attempts: 0
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: revise the specification to persist outbound WB write attempts only and align logging, retention, reconciliation, and verification semantics."
events:
  -
    type: "status"
    at: "2026-07-28T06:28:48.270Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: revise the specification to persist outbound WB write attempts only and align logging, retention, reconciliation, and verification semantics."
  -
    type: "verify"
    at: "2026-07-28T06:31:15.074Z"
    author: "DOCS"
    state: "ok"
    note: "Verified: the specification now persists only outbound WB write attempts, keeps read calls in logs and metrics, and defines reconciliation, redaction, retention, and test requirements; targeted diff checks, routing validation, and AgentPlane doctor all pass."
doc_version: 3
doc_updated_at: "2026-07-28T06:31:15.324Z"
doc_updated_by: "DOCS"
description: "Revise docs/technical-specification.md so PostgreSQL persists outbound WB write attempts rather than every WB API call; keep ordinary reads in structured logs and metrics, and define redaction, reconciliation linkage, and retention semantics."
sections:
  Summary: "Replace the overly broad WbApiCall persistence model with WbWriteAttempt, an operational journal limited to outbound WB write attempts."
  Scope: "In scope: docs/technical-specification.md and task artifacts; data-model semantics, structured logging boundary, retention/redaction, reconciliation linkage, implementation-phase wording, and related test expectations. Out of scope: application code, database migrations, other documentation, and WB API contract changes."
  Plan: "Rename WbApiCall to WbWriteAttempt; persist every outbound WB write attempt with decision linkage, attempt/result metadata, redacted digest, reconciliation status, and bounded retention; keep ordinary reads in logs/metrics; align related documentation and verify repository policy checks."
  Verify Steps: "1. Run rg -n \"WbApiCall|WbWriteAttempt|write attempt|write-attempt|read.*logs|retention\" docs/technical-specification.md and confirm the old entity is absent and the new persistence boundary is explicit. 2. Inspect git diff -- docs/technical-specification.md and confirm only the approved semantics changed. 3. Run node .agentplane/policy/check-routing.mjs. 4. Run ap doctor. 5. Run git status --short --untracked-files=all and confirm no unintended files are present."
  Verification: |-
    Command: rg -n "WbApiCall|WbWriteAttempt|WB_WRITE_ATTEMPT_RETENTION_DAYS|Read-запросы|Все вызовы WB API" docs/technical-specification.md plus an explicit failing check for any remaining WbApiCall. Result: pass. Evidence: WbApiCall is absent; WbWriteAttempt, read/logging boundary, reconciliation, redaction, and retention requirements are present. Scope: docs/technical-specification.md. Links: sections 7.6, 8.1, 18, 19, 25, 29, and 30. Command: git diff --check and git diff -- docs/technical-specification.md. Result: pass. Evidence: no whitespace errors and the diff is limited to the approved specification semantics. Scope: docs/technical-specification.md. Links: changed canonical specification sections. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy gateway. Links: AGENTS.md routing contract. Command: ap doctor. Result: pass. Evidence: doctor OK with zero errors and zero warnings; one informational blueprint compatibility result. Scope: repository workflow health. Links: AgentPlane runtime checks.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T06:31:15.074Z — VERIFY — ok

    By: DOCS

    Note: Verified: the specification now persists only outbound WB write attempts, keeps read calls in logs and metrics, and defines reconciliation, redaction, retention, and test requirements; targeted diff checks, routing validation, and AgentPlane doctor all pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:31:14.682Z, excerpt_hash=sha256:332e93776522e79512d0ac9b506007ba672722058401654e19e316fb266356fc

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280628-MEEK6T/blueprint/resolved-snapshot.json
    - old_digest: 26bb1815e094ca94211d181e62d27d66152880feffc6c4eb3071b6a85c305449
    - current_digest: 26bb1815e094ca94211d181e62d27d66152880feffc6c4eb3071b6a85c305449
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280628-MEEK6T

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
  Rollback Plan: "Revert only the specification edits and task-local artifacts introduced by this task; no runtime or data migration rollback is required."
  Findings: "No material scope drift, security issue, skipped check, or unresolved documentation conflict was found."
extensions:
  workflow_route_baseline:
    start_head_sha: "ebfa8ee7248ca20fe0fc00100270d719e9bd4452"
    version: 1
id_source: "generated"
---
## Summary

Replace the overly broad WbApiCall persistence model with WbWriteAttempt, an operational journal limited to outbound WB write attempts.

## Scope

In scope: docs/technical-specification.md and task artifacts; data-model semantics, structured logging boundary, retention/redaction, reconciliation linkage, implementation-phase wording, and related test expectations. Out of scope: application code, database migrations, other documentation, and WB API contract changes.

## Plan

Rename WbApiCall to WbWriteAttempt; persist every outbound WB write attempt with decision linkage, attempt/result metadata, redacted digest, reconciliation status, and bounded retention; keep ordinary reads in logs/metrics; align related documentation and verify repository policy checks.

## Verify Steps

1. Run rg -n "WbApiCall|WbWriteAttempt|write attempt|write-attempt|read.*logs|retention" docs/technical-specification.md and confirm the old entity is absent and the new persistence boundary is explicit. 2. Inspect git diff -- docs/technical-specification.md and confirm only the approved semantics changed. 3. Run node .agentplane/policy/check-routing.mjs. 4. Run ap doctor. 5. Run git status --short --untracked-files=all and confirm no unintended files are present.

## Verification

Command: rg -n "WbApiCall|WbWriteAttempt|WB_WRITE_ATTEMPT_RETENTION_DAYS|Read-запросы|Все вызовы WB API" docs/technical-specification.md plus an explicit failing check for any remaining WbApiCall. Result: pass. Evidence: WbApiCall is absent; WbWriteAttempt, read/logging boundary, reconciliation, redaction, and retention requirements are present. Scope: docs/technical-specification.md. Links: sections 7.6, 8.1, 18, 19, 25, 29, and 30. Command: git diff --check and git diff -- docs/technical-specification.md. Result: pass. Evidence: no whitespace errors and the diff is limited to the approved specification semantics. Scope: docs/technical-specification.md. Links: changed canonical specification sections. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository policy gateway. Links: AGENTS.md routing contract. Command: ap doctor. Result: pass. Evidence: doctor OK with zero errors and zero warnings; one informational blueprint compatibility result. Scope: repository workflow health. Links: AgentPlane runtime checks.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T06:31:15.074Z — VERIFY — ok

By: DOCS

Note: Verified: the specification now persists only outbound WB write attempts, keeps read calls in logs and metrics, and defines reconciliation, redaction, retention, and test requirements; targeted diff checks, routing validation, and AgentPlane doctor all pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:31:14.682Z, excerpt_hash=sha256:332e93776522e79512d0ac9b506007ba672722058401654e19e316fb266356fc

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280628-MEEK6T/blueprint/resolved-snapshot.json
- old_digest: 26bb1815e094ca94211d181e62d27d66152880feffc6c4eb3071b6a85c305449
- current_digest: 26bb1815e094ca94211d181e62d27d66152880feffc6c4eb3071b6a85c305449
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280628-MEEK6T

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

Revert only the specification edits and task-local artifacts introduced by this task; no runtime or data migration rollback is required.

## Findings

No material scope drift, security issue, skipped check, or unresolved documentation conflict was found.
