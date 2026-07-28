---
id: "202607280917-7XFVZX"
title: "Define decision checksum and idempotency"
result_summary: "Defined deterministic checksum-based decision deduplication with UUIDv7 identity."
risk_level: "low"
status: "DONE"
priority: "med"
owner: "DOCS"
revision: 23
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T09:18:58.138Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T09:25:07.441Z"
  updated_by: "DOCS"
  note: "Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-07-28T09:24:50.335Z"
  updated_by: "EVALUATOR"
  note: "The specification now separates technical UUID identity from semantic checksum deduplication and defines deterministic checksum construction."
  evaluated_sha: "20104929f60ecd1c03550c257557e46795578642"
  blueprint_digest: "d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1"
  evidence_refs:
    - ".agentplane/tasks/202607280917-7XFVZX/README.md"
    - ".agentplane/tasks/202607280917-7XFVZX/quality/20260728-092450335-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280917-7XFVZX/quality/20260728-092450335-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280917-7XFVZX/quality/20260728-092450335-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json"
    - "docs/technical-specification.md"
    - "git diff --check: pass"
    - "node .agentplane/policy/check-routing.mjs: policy routing OK"
    - "ap doctor: errors=0 warnings=0"
  findings:
    - "The old nine-field BidDecision idempotency formula is removed; decisionInputChecksum alone is unique and retries reuse decisionId."
    - "inputSnapshotChecksum and decisionInputChecksum have explicit domains, SHA-256 formula, RFC 8785 canonicalization, normalization rules, included inputs, and versioning requirements."
    - "Product economics HTTP Idempotency-Key contracts remain unchanged."
commit:
  hash: "20104929f60ecd1c03550c257557e46795578642"
  message: "🚧 7XFVZX task: Define decision checksum idempotency"
comments:
  -
    author: "DOCS"
    body: "Start: Define the canonical decision input checksum and replace composite idempotency fields with UUID identity plus checksum uniqueness."
  -
    author: "DOCS"
    body: "Blocked: Guarded commit was rejected before commit creation because the subject format was invalid; verified content remains staged and unchanged."
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "DOCS"
    body: "Blocked: Closeout requires the configured EVALUATOR quality review; implementation commit is valid and scope remains unchanged."
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "DOCS"
    body: "Blocked: Deterministic closeout requires the evaluator and recovery task artifacts to be committed first; specification scope is unchanged."
  -
    author: "DOCS"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "DOCS"
    body: "Verified: Deterministic snapshot and decision checksum contracts are defined; UUID identity, checksum uniqueness, repository checks, and evaluator review all pass."
events:
  -
    type: "status"
    at: "2026-07-28T09:19:04.966Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: Define the canonical decision input checksum and replace composite idempotency fields with UUID identity plus checksum uniqueness."
  -
    type: "verify"
    at: "2026-07-28T09:22:14.671Z"
    author: "DOCS"
    state: "ok"
    note: "Documentation contract verified: deterministic checksums, UUID identity, and checksum uniqueness are consistent."
  -
    type: "status"
    at: "2026-07-28T09:23:24.015Z"
    author: "DOCS"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Guarded commit was rejected before commit creation because the subject format was invalid; verified content remains staged and unchanged."
  -
    type: "status"
    at: "2026-07-28T09:23:37.719Z"
    author: "DOCS"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T09:24:03.485Z"
    author: "DOCS"
    state: "ok"
    note: "Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication."
  -
    type: "status"
    at: "2026-07-28T09:24:37.875Z"
    author: "DOCS"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Closeout requires the configured EVALUATOR quality review; implementation commit is valid and scope remains unchanged."
  -
    type: "status"
    at: "2026-07-28T09:25:00.086Z"
    author: "DOCS"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T09:25:07.441Z"
    author: "DOCS"
    state: "ok"
    note: "Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication."
  -
    type: "status"
    at: "2026-07-28T09:25:38.519Z"
    author: "DOCS"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Deterministic closeout requires the evaluator and recovery task artifacts to be committed first; specification scope is unchanged."
  -
    type: "status"
    at: "2026-07-28T09:25:56.044Z"
    author: "DOCS"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-28T09:26:12.233Z"
    author: "DOCS"
    from: "DOING"
    to: "DONE"
    note: "Verified: Deterministic snapshot and decision checksum contracts are defined; UUID identity, checksum uniqueness, repository checks, and evaluator review all pass."
doc_version: 3
doc_updated_at: "2026-07-28T09:26:12.234Z"
doc_updated_by: "DOCS"
description: "Specify deterministic decisionInputChecksum computation and replace the composite BidDecision idempotency key with UUID identity plus checksum-based uniqueness."
sections:
  Summary: "Define a normative, deterministic inputSnapshotChecksum contract for Decision Engine inputs. Use UUIDv7 only as the technical BidDecision identifier and use a checksum-based decisionInputChecksum unique constraint for semantic deduplication."
  Scope: |-
    - In scope: docs/technical-specification.md sections describing MetricSnapshot, BidDecision, Decision Engine versioning, queue idempotency, retry semantics, and related verification requirements.
    - In scope: canonical serialization, checksum algorithm, included/excluded inputs, UUID identity, and checksum uniqueness.
    - Out of scope: implementation code, database migrations, unrelated reason-code documentation, HTTP Idempotency-Key contracts, and WB API behavior.
  Plan: |-
    1. Define inputSnapshotChecksum as SHA-256 over a versioned canonical representation of every decision-relevant input, including deterministic treatment of target identity, source data, economics, policy, algorithm, temporal state, nulls, integers, dates, and collections.
    2. Specify BidDecision.id as UUIDv7, add decisionInputChecksum derived from the input snapshot checksum, and enforce unique decisionInputChecksum instead of a separate composite idempotencyKey.
    3. Replace section 10.2 with the minimal deduplication and retry contract: semantic deduplication by decisionInputChecksum and retries by the existing decisionId.
    4. Align related testing and explanatory text without changing HTTP Idempotency-Key contracts.
    5. Run docs verification, record evidence, and finish the task with a traceable commit.
  Verify Steps: |-
    1. Run rg -n "inputSnapshotChecksum|decisionInputChecksum|idempotencyKey|Idempotency key|unique.*checksum" docs/technical-specification.md and confirm the definitions are consistent and the old nine-field formula is absent.
    2. Run git diff --check and confirm the documentation patch has no whitespace errors.
    3. Run node .agentplane/policy/check-routing.mjs and confirm repository policy routing remains valid.
    4. Run ap doctor and confirm AgentPlane health checks pass.
    5. Review git diff -- docs/technical-specification.md and confirm HTTP Idempotency-Key contracts and unrelated documentation remain unchanged.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T09:22:14.671Z — VERIFY — ok

    By: DOCS

    Note: Documentation contract verified: deterministic checksums, UUID identity, and checksum uniqueness are consistent.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:19:04.966Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

    Details:

    Command: rg -n checksum/idempotency terms docs/technical-specification.md
    Result: pass
    Evidence: old nine-field BidDecision idempotency formula is absent; product economics HTTP Idempotency-Key contracts remain unchanged.
    Scope: docs/technical-specification.md sections 8, 9, 10, and 25.
    Links: MetricSnapshot, BidDecision, Decision Engine versioning, queue idempotency, unit and integration test requirements.

    Command: git diff --check
    Result: pass
    Evidence: no whitespace errors.
    Scope: task documentation patch.

    Command: node .agentplane/policy/check-routing.mjs
    Result: pass
    Evidence: policy routing OK.
    Scope: repository policy graph.

    Command: ap doctor
    Result: pass
    Evidence: errors=0, warnings=0; informational blueprint compatibility only.
    Scope: AgentPlane workspace health.

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
    - old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607280917-7XFVZX
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T09:24:03.485Z — VERIFY — ok

    By: DOCS

    Note: Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:23:37.719Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
    - old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: agentplane task next-action 202607280917-7XFVZX --explain
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: unsafe_shell_chain_route

    ### 2026-07-28T09:25:07.441Z — VERIFY — ok

    By: DOCS

    Note: Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:25:00.086Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
    - old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: agentplane task next-action 202607280917-7XFVZX --explain
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: unsafe_shell_chain_route

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert the task close commit created by AgentPlane.
    - Re-run the listed verification commands to confirm the previous documentation contract is restored.
  Findings: |-
    Commit attempt recovery:

    - Observation: ap commit rejected the initial subject before creating a commit because it did not match the required emoji/task-suffix/scope format.
    - Impact: verified specification content remained unchanged.
    - Resolution: used the AgentPlane-provided subject format; implementation commit 20104929f60ecd1c03550c257557e46795578642 was created.
    - Fixability: repo-local command correction; no scope or risk change.

    Closeout quality-gate recovery:

    - Observation: the first task complete attempt found the required EVALUATOR quality review missing.
    - Impact: task remained open; implementation commit was unchanged.
    - Resolution: EVALUATOR review completed with verdict pass and report recorded under the task quality directory.
    - Fixability: repo-local lifecycle correction; no scope or risk change.

    Close-commit cleanliness recovery:

    - Observation: task complete requires a clean tracked worktree before its deterministic close commit, while the evaluator and recovery steps had updated the tracked task README.
    - Impact: task remained open; no specification or implementation commit changed.
    - Resolution: commit only the active task lifecycle and quality artifacts through ap commit --allow-tasks, then resume and rerun task complete.
    - Fixability: repo-local lifecycle correction; no scope or risk change.
id_source: "generated"
---
## Summary

Define a normative, deterministic inputSnapshotChecksum contract for Decision Engine inputs. Use UUIDv7 only as the technical BidDecision identifier and use a checksum-based decisionInputChecksum unique constraint for semantic deduplication.

## Scope

- In scope: docs/technical-specification.md sections describing MetricSnapshot, BidDecision, Decision Engine versioning, queue idempotency, retry semantics, and related verification requirements.
- In scope: canonical serialization, checksum algorithm, included/excluded inputs, UUID identity, and checksum uniqueness.
- Out of scope: implementation code, database migrations, unrelated reason-code documentation, HTTP Idempotency-Key contracts, and WB API behavior.

## Plan

1. Define inputSnapshotChecksum as SHA-256 over a versioned canonical representation of every decision-relevant input, including deterministic treatment of target identity, source data, economics, policy, algorithm, temporal state, nulls, integers, dates, and collections.
2. Specify BidDecision.id as UUIDv7, add decisionInputChecksum derived from the input snapshot checksum, and enforce unique decisionInputChecksum instead of a separate composite idempotencyKey.
3. Replace section 10.2 with the minimal deduplication and retry contract: semantic deduplication by decisionInputChecksum and retries by the existing decisionId.
4. Align related testing and explanatory text without changing HTTP Idempotency-Key contracts.
5. Run docs verification, record evidence, and finish the task with a traceable commit.

## Verify Steps

1. Run rg -n "inputSnapshotChecksum|decisionInputChecksum|idempotencyKey|Idempotency key|unique.*checksum" docs/technical-specification.md and confirm the definitions are consistent and the old nine-field formula is absent.
2. Run git diff --check and confirm the documentation patch has no whitespace errors.
3. Run node .agentplane/policy/check-routing.mjs and confirm repository policy routing remains valid.
4. Run ap doctor and confirm AgentPlane health checks pass.
5. Review git diff -- docs/technical-specification.md and confirm HTTP Idempotency-Key contracts and unrelated documentation remain unchanged.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T09:22:14.671Z — VERIFY — ok

By: DOCS

Note: Documentation contract verified: deterministic checksums, UUID identity, and checksum uniqueness are consistent.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:19:04.966Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

Details:

Command: rg -n checksum/idempotency terms docs/technical-specification.md
Result: pass
Evidence: old nine-field BidDecision idempotency formula is absent; product economics HTTP Idempotency-Key contracts remain unchanged.
Scope: docs/technical-specification.md sections 8, 9, 10, and 25.
Links: MetricSnapshot, BidDecision, Decision Engine versioning, queue idempotency, unit and integration test requirements.

Command: git diff --check
Result: pass
Evidence: no whitespace errors.
Scope: task documentation patch.

Command: node .agentplane/policy/check-routing.mjs
Result: pass
Evidence: policy routing OK.
Scope: repository policy graph.

Command: ap doctor
Result: pass
Evidence: errors=0, warnings=0; informational blueprint compatibility only.
Scope: AgentPlane workspace health.

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
- old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607280917-7XFVZX
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T09:24:03.485Z — VERIFY — ok

By: DOCS

Note: Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:23:37.719Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
- old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: agentplane task next-action 202607280917-7XFVZX --explain
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: unsafe_shell_chain_route

### 2026-07-28T09:25:07.441Z — VERIFY — ok

By: DOCS

Note: Defined deterministic snapshot and decision checksums; UUIDv7 now serves only as BidDecision identity and checksum uniqueness provides deduplication.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T09:25:00.086Z, excerpt_hash=sha256:801d7120e7d559f97a397c68c5746a4f71cc5dfd8c5fad115ca3089c448c1636

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280917-7XFVZX/blueprint/resolved-snapshot.json
- old_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- current_digest: d0a410619c6a8b6fb1ff1c3fe0979c2b6cbc6ce2e1bad06042e5763e3e7f6fc1
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280917-7XFVZX

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: agentplane task next-action 202607280917-7XFVZX --explain
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: unsafe_shell_chain_route

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert the task close commit created by AgentPlane.
- Re-run the listed verification commands to confirm the previous documentation contract is restored.

## Findings

Commit attempt recovery:

- Observation: ap commit rejected the initial subject before creating a commit because it did not match the required emoji/task-suffix/scope format.
- Impact: verified specification content remained unchanged.
- Resolution: used the AgentPlane-provided subject format; implementation commit 20104929f60ecd1c03550c257557e46795578642 was created.
- Fixability: repo-local command correction; no scope or risk change.

Closeout quality-gate recovery:

- Observation: the first task complete attempt found the required EVALUATOR quality review missing.
- Impact: task remained open; implementation commit was unchanged.
- Resolution: EVALUATOR review completed with verdict pass and report recorded under the task quality directory.
- Fixability: repo-local lifecycle correction; no scope or risk change.

Close-commit cleanliness recovery:

- Observation: task complete requires a clean tracked worktree before its deterministic close commit, while the evaluator and recovery steps had updated the tracked task README.
- Impact: task remained open; no specification or implementation commit changed.
- Resolution: commit only the active task lifecycle and quality artifacts through ap commit --allow-tasks, then resume and rerun task complete.
- Fixability: repo-local lifecycle correction; no scope or risk change.
