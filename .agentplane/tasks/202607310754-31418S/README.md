---
id: "202607310754-31418S"
title: "Document purpose and usage of every data model table and column"
status: "DOING"
priority: "med"
owner: "DOCS"
revision: 16
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-31T07:55:10.855Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-31T08:20:12.661Z"
  updated_by: "DOCS"
  note: "User-requested deduplication is complete in commit f2ac30cf6432: all 28 models have one canonical heading, all 416 scalar columns remain covered, and formatting, docs, routing, doctor, and commit diff checks passed."
  attempts: 0
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: Expand the data model reference with standalone table descriptions and one usage-grounded row for every stored column."
events:
  -
    type: "status"
    at: "2026-07-31T07:55:18.164Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: Expand the data model reference with standalone table descriptions and one usage-grounded row for every stored column."
  -
    type: "verify"
    at: "2026-07-31T08:07:45.406Z"
    author: "DOCS"
    state: "ok"
    note: "Documentation verification passed: 28 schema models and 416 stored scalar columns are covered; Prettier, docs checks, routing validation, diff check, and doctor completed successfully. Doctor warnings were pre-existing and recorded in Findings."
  -
    type: "verify"
    at: "2026-07-31T08:08:35.380Z"
    author: "DOCS"
    state: "needs_rework"
    note: "Lifecycle rework only: create the required allowlisted implementation commit before recording the already completed verification evidence."
  -
    type: "verify"
    at: "2026-07-31T08:20:12.661Z"
    author: "DOCS"
    state: "ok"
    note: "User-requested deduplication is complete in commit f2ac30cf6432: all 28 models have one canonical heading, all 416 scalar columns remain covered, and formatting, docs, routing, doctor, and commit diff checks passed."
doc_version: 3
doc_updated_at: "2026-07-31T08:20:12.882Z"
doc_updated_by: "DOCS"
description: "Expand docs/data-model.md so each Prisma-backed table has a standalone description of what it stores, why it exists, and where it is used, and every physical column has an individual description of meaning and usage grounded in the schema and implementation."
sections:
  Summary: "Expand the canonical PostgreSQL reference so every Prisma-backed table and every stored column has an explicit, implementation-grounded description of meaning, purpose, and usage."
  Scope: |-
    - In scope: docs/data-model.md and AgentPlane task artifacts.
    - Document all 28 Prisma models from the current prisma/schema.prisma as standalone table sections.
    - Give every physical scalar column one individual reference row with what it stores and where it is used.
    - Ground usage claims in prisma/schema.prisma, repositories, services, migrations, and tests.
    - Clarify that Prisma relation navigation fields are not physical PostgreSQL columns.
    - Out of scope: schema, migration, runtime, API, or unrelated documentation changes.
  Plan: |-
    1. Inventory all models and physical scalar columns from prisma/schema.prisma and trace their implementation usage.
    2. Replace the grouped field reference in docs/data-model.md with one standalone section per model and one row per stored column, including meaning/purpose and usage.
    3. Review the resulting diff against schema and code evidence, then run targeted documentation and repository policy checks.
    4. Record verification evidence and finish the direct-mode task.
  Verify Steps: |-
    1. Compare docs/data-model.md with prisma/schema.prisma. Expected: all 28 current models have exactly one table heading in the whole document and all 416 stored scalar columns appear exactly once as individual field rows; Prisma-only relation fields are explicitly excluded.
    2. Review document structure. Expected: the introduction, ER model, enums, lifecycle, implementation tracing, and one canonical detailed reference remain coherent; the earlier short per-table catalog is absent.
    3. Review descriptions against the repositories and services that read or write the fields. Expected: every table and field states what it is for and where it is used without claiming unshipped behavior.
    4. Run `pnpm exec prettier --check docs/data-model.md`. Expected: pass.
    5. Run the schema-to-document coverage and duplicate-heading check recorded in Verification. Expected: `models=28`, `scalarColumns=416`, `duplicateModelHeadings=0`, `result=PASS`.
    6. Run `pnpm run docs:check`. Expected: pass with all required documents, links, Mermaid, and model tracing present.
    7. Run `node .agentplane/policy/check-routing.mjs`. Expected: pass.
    8. Run `ap doctor`. Expected: pass or report only pre-existing non-task issues, recorded explicitly.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-31T08:07:45.406Z — VERIFY — ok

    By: DOCS

    Note: Documentation verification passed: 28 schema models and 416 stored scalar columns are covered; Prettier, docs checks, routing validation, diff check, and doctor completed successfully. Doctor warnings were pre-existing and recorded in Findings.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:07:31.514Z, excerpt_hash=sha256:b135174fb333bac3b1291926b4723490f40808e968decd34d35cbce8702b05a2

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
    - old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310754-31418S

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310754-31418S
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-31T08:08:35.380Z — VERIFY — needs_rework

    By: DOCS

    Note: Lifecycle rework only: create the required allowlisted implementation commit before recording the already completed verification evidence.
    Attempts: 1

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:07:45.482Z, excerpt_hash=sha256:b135174fb333bac3b1291926b4723490f40808e968decd34d35cbce8702b05a2

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
    - old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310754-31418S

    DecisionContextRef:
    - operator_action: stop
    - can_execute_now: false
    - safe_command: none
    - diagnostic_command: agentplane task next-action 202607310754-31418S --explain
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: false
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: unsafe_shell_chain_route

    ### 2026-07-31T08:20:12.661Z — VERIFY — ok

    By: DOCS

    Note: User-requested deduplication is complete in commit f2ac30cf6432: all 28 models have one canonical heading, all 416 scalar columns remain covered, and formatting, docs, routing, doctor, and commit diff checks passed.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:18:36.742Z, excerpt_hash=sha256:3bca6a92f106924ce74074b830b14eecfbc48f5e2331f24e7e23f572e02ef9a0

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
    - old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607310754-31418S

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607310754-31418S
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert the documentation commit created for this task.
    - Preserve unrelated pre-existing workspace changes.
    - Re-run the documentation checks to confirm the prior canonical state is restored.
  Findings: |-
    - Observation: The current prisma/schema.prisma contains 28 models and 416 stored scalar columns; the planning estimate said 29 models.
      Impact: The numeric estimate was inaccurate, but the approved exhaustive scope and implementation boundary are unchanged.
      Resolution: Use the schema-derived count of 28 and verify all 416 stored scalar columns mechanically; no runtime or schema changes are required.

    - Observation: ap doctor completed with ok=true and reported three pre-existing warnings: archived task 202607310759-MBVV41 is untracked/missing an implementation commit, and an older task references a close commit; the clean-project hook fallback was informational.
      Impact: These findings are outside the approved data-model documentation scope and do not affect the changed document or its verification.
      Resolution: Preserve the unrelated workspace state and report the warnings without staging or modifying other task artifacts.

    - Observation: Verification was recorded before the implementation commit required by the direct close route.
      Impact: Content and checks remain valid, but the task cannot close with traceable implementation evidence in this order.
      Resolution: Reset verification, commit only docs/data-model.md and the active task subtree through agentplane commit, then record verification again.
id_source: "generated"
---
## Summary

Expand the canonical PostgreSQL reference so every Prisma-backed table and every stored column has an explicit, implementation-grounded description of meaning, purpose, and usage.

## Scope

- In scope: docs/data-model.md and AgentPlane task artifacts.
- Document all 28 Prisma models from the current prisma/schema.prisma as standalone table sections.
- Give every physical scalar column one individual reference row with what it stores and where it is used.
- Ground usage claims in prisma/schema.prisma, repositories, services, migrations, and tests.
- Clarify that Prisma relation navigation fields are not physical PostgreSQL columns.
- Out of scope: schema, migration, runtime, API, or unrelated documentation changes.

## Plan

1. Inventory all models and physical scalar columns from prisma/schema.prisma and trace their implementation usage.
2. Replace the grouped field reference in docs/data-model.md with one standalone section per model and one row per stored column, including meaning/purpose and usage.
3. Review the resulting diff against schema and code evidence, then run targeted documentation and repository policy checks.
4. Record verification evidence and finish the direct-mode task.

## Verify Steps

1. Compare docs/data-model.md with prisma/schema.prisma. Expected: all 28 current models have exactly one table heading in the whole document and all 416 stored scalar columns appear exactly once as individual field rows; Prisma-only relation fields are explicitly excluded.
2. Review document structure. Expected: the introduction, ER model, enums, lifecycle, implementation tracing, and one canonical detailed reference remain coherent; the earlier short per-table catalog is absent.
3. Review descriptions against the repositories and services that read or write the fields. Expected: every table and field states what it is for and where it is used without claiming unshipped behavior.
4. Run `pnpm exec prettier --check docs/data-model.md`. Expected: pass.
5. Run the schema-to-document coverage and duplicate-heading check recorded in Verification. Expected: `models=28`, `scalarColumns=416`, `duplicateModelHeadings=0`, `result=PASS`.
6. Run `pnpm run docs:check`. Expected: pass with all required documents, links, Mermaid, and model tracing present.
7. Run `node .agentplane/policy/check-routing.mjs`. Expected: pass.
8. Run `ap doctor`. Expected: pass or report only pre-existing non-task issues, recorded explicitly.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-31T08:07:45.406Z — VERIFY — ok

By: DOCS

Note: Documentation verification passed: 28 schema models and 416 stored scalar columns are covered; Prettier, docs checks, routing validation, diff check, and doctor completed successfully. Doctor warnings were pre-existing and recorded in Findings.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:07:31.514Z, excerpt_hash=sha256:b135174fb333bac3b1291926b4723490f40808e968decd34d35cbce8702b05a2

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
- old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310754-31418S

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310754-31418S
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-31T08:08:35.380Z — VERIFY — needs_rework

By: DOCS

Note: Lifecycle rework only: create the required allowlisted implementation commit before recording the already completed verification evidence.
Attempts: 1

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:07:45.482Z, excerpt_hash=sha256:b135174fb333bac3b1291926b4723490f40808e968decd34d35cbce8702b05a2

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
- old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310754-31418S

DecisionContextRef:
- operator_action: stop
- can_execute_now: false
- safe_command: none
- diagnostic_command: agentplane task next-action 202607310754-31418S --explain
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: false
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: unsafe_shell_chain_route

### 2026-07-31T08:20:12.661Z — VERIFY — ok

By: DOCS

Note: User-requested deduplication is complete in commit f2ac30cf6432: all 28 models have one canonical heading, all 416 scalar columns remain covered, and formatting, docs, routing, doctor, and commit diff checks passed.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-31T08:18:36.742Z, excerpt_hash=sha256:3bca6a92f106924ce74074b830b14eecfbc48f5e2331f24e7e23f572e02ef9a0

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607310754-31418S/blueprint/resolved-snapshot.json
- old_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- current_digest: a7d87495e8fb3332ce0b914f6a923c45f4f725d29cec177e576226727457f654
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607310754-31418S

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607310754-31418S
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert the documentation commit created for this task.
- Preserve unrelated pre-existing workspace changes.
- Re-run the documentation checks to confirm the prior canonical state is restored.

## Findings

- Observation: The current prisma/schema.prisma contains 28 models and 416 stored scalar columns; the planning estimate said 29 models.
  Impact: The numeric estimate was inaccurate, but the approved exhaustive scope and implementation boundary are unchanged.
  Resolution: Use the schema-derived count of 28 and verify all 416 stored scalar columns mechanically; no runtime or schema changes are required.

- Observation: ap doctor completed with ok=true and reported three pre-existing warnings: archived task 202607310759-MBVV41 is untracked/missing an implementation commit, and an older task references a close commit; the clean-project hook fallback was informational.
  Impact: These findings are outside the approved data-model documentation scope and do not affect the changed document or its verification.
  Resolution: Preserve the unrelated workspace state and report the warnings without staging or modifying other task artifacts.

- Observation: Verification was recorded before the implementation commit required by the direct close route.
  Impact: Content and checks remain valid, but the task cannot close with traceable implementation evidence in this order.
  Resolution: Reset verification, commit only docs/data-model.md and the active task subtree through agentplane commit, then record verification again.
