---
id: "202607280628-MEEK6T"
title: "Replace WbApiCall with WbWriteAttempt"
result_summary: "Replaced WbApiCall with the scoped WbWriteAttempt journal in the technical specification."
status: "DONE"
priority: "med"
owner: "DOCS"
revision: 17
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
  updated_at: "2026-07-28T06:33:13.104Z"
  updated_by: "DOCS"
  note: "Semantic quality review passed after deterministic checks; the approved documentation scope is complete."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-28T06:32:57.247Z"
  updated_by: "EVALUATOR"
  note: "The specification consistently limits durable WB request records to outbound write attempts while preserving operational observability for reads."
  evaluated_sha: "8145854af1dad6b9fc175bad2a7a5309280429d2"
  blueprint_digest: "26bb1815e094ca94211d181e62d27d66152880feffc6c4eb3071b6a85c305449"
  evidence_refs:
    - ".agentplane/tasks/202607280628-MEEK6T/README.md"
    - ".agentplane/tasks/202607280628-MEEK6T/quality/20260728-063257247-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280628-MEEK6T/quality/20260728-063257247-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280628-MEEK6T/quality/20260728-063257247-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280628-MEEK6T/blueprint/resolved-snapshot.json"
    - "docs/technical-specification.md"
  findings:
    - "WbWriteAttempt has a clear decision link, attempt identity, transport and reconciliation states, redacted digests, safe retry behavior, and bounded terminal retention; related execution, logging, audit, testing, implementation, and production-decision sections are aligned without retaining ordinary read calls in PostgreSQL."
commit:
  hash: "0ff243fd8c4ca11d9038a03768a8c8ee0b501f79"
  message: "✅ MEEK6T docs: done"
comments:
  -
    author: "DOCS"
    body: "Start: revise the specification to persist outbound WB write attempts only and align logging, retention, reconciliation, and verification semantics."
  -
    author: "DOCS"
    body: "Verified: WbWriteAttempt now persists outbound WB write attempts only; read calls remain in logs and metrics, with reconciliation, redaction, retention, and tests specified."
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
  -
    type: "verify"
    at: "2026-07-28T06:33:13.104Z"
    author: "DOCS"
    state: "ok"
    note: "Semantic quality review passed after deterministic checks; the approved documentation scope is complete."
  -
    type: "status"
    at: "2026-07-28T06:33:31.809Z"
    author: "DOCS"
    from: "DOING"
    to: "DONE"
    note: "Verified: WbWriteAttempt now persists outbound WB write attempts only; read calls remain in logs and metrics, with reconciliation, redaction, retention, and tests specified."
doc_version: 3
doc_updated_at: "2026-07-28T06:33:31.810Z"
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

    ### 2026-07-28T06:33:13.104Z — VERIFY — ok

    By: DOCS

    Note: Semantic quality review passed after deterministic checks; the approved documentation scope is complete.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:31:15.324Z, excerpt_hash=sha256:332e93776522e79512d0ac9b506007ba672722058401654e19e316fb266356fc

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
  implementation_commit:
    hash: "8145854af1dad6b9fc175bad2a7a5309280429d2"
    message: "✅ MEEK6T docs: done"
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

### 2026-07-28T06:33:13.104Z — VERIFY — ok

By: DOCS

Note: Semantic quality review passed after deterministic checks; the approved documentation scope is complete.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:31:15.324Z, excerpt_hash=sha256:332e93776522e79512d0ac9b506007ba672722058401654e19e316fb266356fc

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
