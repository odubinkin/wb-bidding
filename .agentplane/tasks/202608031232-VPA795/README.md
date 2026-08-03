---
id: "202608031232-VPA795"
title: "Prevent built smoke response timeout after HTTP success"
status: "DOING"
priority: "med"
owner: "CODER"
revision: 13
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-08-03T12:33:31.252Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-08-03T12:35:52.701Z"
  updated_by: "CODER"
  note: "Response detachment fix passes syntax, formatting, full quality, build, routing, and workflow checks; database-backed smoke is an approved local skip pending CI because DATABASE_URL is absent."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-08-03T12:33:41.204Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-08-03T12:35:52.701Z"
    author: "CODER"
    state: "ok"
    note: "Response detachment fix passes syntax, formatting, full quality, build, routing, and workflow checks; database-backed smoke is an approved local skip pending CI because DATABASE_URL is absent."
doc_version: 3
doc_updated_at: "2026-08-03T12:35:52.786Z"
doc_updated_by: "CODER"
description: "Fix smoke-built-apps so per-request timeout signals cannot abort successful response bodies while later startup probes finish. Preserve bounded startup retries and validate the built artifacts path without external service setup."
sections:
  Summary: "Prevent a successful built-smoke HTTP response from being aborted later by its expired per-request timeout signal."
  Scope: "Change scripts/smoke-built-apps.mjs and task records only. Preserve the one-second request bound, ten-second startup retry deadline, endpoint assertions, and child shutdown behavior. No dependency changes, external service setup, network access, or GitHub publication."
  Plan: "1. Buffer each successful response body while its request timeout is active and return a detached Response for later parsing. 2. Run syntax, quality, and build checks. 3. Record the database-backed smoke as locally skipped because DATABASE_URL is absent; retain CI as authoritative for the full process smoke. 4. Run policy and workflow checks, evaluator review, and clean closeout."
  Verify Steps: "1. Run node --check scripts/smoke-built-apps.mjs. Expected: syntax passes. 2. Run pnpm run quality. Expected: all formatting, lint, type, unit, contract, schema, and repository checks pass. 3. Run pnpm run build. Expected: bidder, mock, and workspace packages build successfully. 4. Inspect DATABASE_URL presence without printing its value, then run pnpm run smoke:built only when present. Expected: the full built smoke passes; when absent, record an approved local skip with CI as the authoritative database-backed check. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: routing passes and workflow health has no task-caused errors. 6. Run git diff --check and git status --short --untracked-files=all. Expected: only the approved script and task artifacts remain."
  Verification: |-
    Command: node --check scripts/smoke-built-apps.mjs and pnpm exec prettier --check scripts/smoke-built-apps.mjs. Result: pass. Evidence: syntax accepted and Prettier reported matched style. Scope: changed smoke script. Command: pnpm run quality. Result: pass. Evidence: Prisma generation, formatting, lint, typecheck, scripts, architecture, unit/golden/OpenAPI/contract tests, Prisma validation, profile checksum, WB fixtures, and deprecated-endpoint checks completed successfully. Scope: repository quality gate. Command: pnpm run build. Result: pass. Evidence: all nine buildable workspace projects, including bidder and wb-mock applications, built successfully. Scope: built artifacts consumed by the smoke script. Skipped: pnpm run smoke:built. Reason: DATABASE_URL is absent locally and external database setup was excluded from approved scope. Risk: the complete multi-process database-backed path remains pending CI confirmation. Approval: user approved the plan with CI as the authoritative full smoke check. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: AgentPlane routing. Command: ap doctor. Result: pass. Evidence: doctor OK with only pre-existing informational fallback and historical archive warnings. Scope: workflow health. Command: git diff --check and git status --short --untracked-files=all. Result: pass. Evidence: no whitespace errors; only scripts/smoke-built-apps.mjs and task artifacts changed. Scope: final change hygiene.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-08-03T12:35:52.701Z — VERIFY — ok

    By: CODER

    Note: Response detachment fix passes syntax, formatting, full quality, build, routing, and workflow checks; database-backed smoke is an approved local skip pending CI because DATABASE_URL is absent.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T12:35:48.186Z, excerpt_hash=sha256:36b59f0ba543c34cedb3e8e6c97197b0a7e161cdb49ddd6f6646bb916542dfe0

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031232-VPA795/blueprint/resolved-snapshot.json
    - old_digest: 7a7c2cc11600ca6d2fd5563e30dbc67b4bd1c6379bedd3c88495c4ef6a6df78f
    - current_digest: 7a7c2cc11600ca6d2fd5563e30dbc67b4bd1c6379bedd3c88495c4ef6a6df78f
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202608031232-VPA795

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202608031232-VPA795
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Revert the scoped script and task commits; the previous timeout behavior will be restored without database or dependency changes."
  Findings: "Root cause confirmed: AbortSignal.timeout(1000) remained attached after fetch resolved. Because the script awaited all six probes before parsing four bodies, successful HTTP 200 responses could be aborted before response.json ran. Resolution: consume each successful response body with arrayBuffer while the request timeout remains active, then construct a detached Response for later parsing. Residual risk: the full database-backed smoke could not run locally without DATABASE_URL and requires CI confirmation."
id_source: "generated"
---
## Summary

Prevent a successful built-smoke HTTP response from being aborted later by its expired per-request timeout signal.

## Scope

Change scripts/smoke-built-apps.mjs and task records only. Preserve the one-second request bound, ten-second startup retry deadline, endpoint assertions, and child shutdown behavior. No dependency changes, external service setup, network access, or GitHub publication.

## Plan

1. Buffer each successful response body while its request timeout is active and return a detached Response for later parsing. 2. Run syntax, quality, and build checks. 3. Record the database-backed smoke as locally skipped because DATABASE_URL is absent; retain CI as authoritative for the full process smoke. 4. Run policy and workflow checks, evaluator review, and clean closeout.

## Verify Steps

1. Run node --check scripts/smoke-built-apps.mjs. Expected: syntax passes. 2. Run pnpm run quality. Expected: all formatting, lint, type, unit, contract, schema, and repository checks pass. 3. Run pnpm run build. Expected: bidder, mock, and workspace packages build successfully. 4. Inspect DATABASE_URL presence without printing its value, then run pnpm run smoke:built only when present. Expected: the full built smoke passes; when absent, record an approved local skip with CI as the authoritative database-backed check. 5. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: routing passes and workflow health has no task-caused errors. 6. Run git diff --check and git status --short --untracked-files=all. Expected: only the approved script and task artifacts remain.

## Verification

Command: node --check scripts/smoke-built-apps.mjs and pnpm exec prettier --check scripts/smoke-built-apps.mjs. Result: pass. Evidence: syntax accepted and Prettier reported matched style. Scope: changed smoke script. Command: pnpm run quality. Result: pass. Evidence: Prisma generation, formatting, lint, typecheck, scripts, architecture, unit/golden/OpenAPI/contract tests, Prisma validation, profile checksum, WB fixtures, and deprecated-endpoint checks completed successfully. Scope: repository quality gate. Command: pnpm run build. Result: pass. Evidence: all nine buildable workspace projects, including bidder and wb-mock applications, built successfully. Scope: built artifacts consumed by the smoke script. Skipped: pnpm run smoke:built. Reason: DATABASE_URL is absent locally and external database setup was excluded from approved scope. Risk: the complete multi-process database-backed path remains pending CI confirmation. Approval: user approved the plan with CI as the authoritative full smoke check. Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: AgentPlane routing. Command: ap doctor. Result: pass. Evidence: doctor OK with only pre-existing informational fallback and historical archive warnings. Scope: workflow health. Command: git diff --check and git status --short --untracked-files=all. Result: pass. Evidence: no whitespace errors; only scripts/smoke-built-apps.mjs and task artifacts changed. Scope: final change hygiene.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-08-03T12:35:52.701Z — VERIFY — ok

By: CODER

Note: Response detachment fix passes syntax, formatting, full quality, build, routing, and workflow checks; database-backed smoke is an approved local skip pending CI because DATABASE_URL is absent.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-08-03T12:35:48.186Z, excerpt_hash=sha256:36b59f0ba543c34cedb3e8e6c97197b0a7e161cdb49ddd6f6646bb916542dfe0

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202608031232-VPA795/blueprint/resolved-snapshot.json
- old_digest: 7a7c2cc11600ca6d2fd5563e30dbc67b4bd1c6379bedd3c88495c4ef6a6df78f
- current_digest: 7a7c2cc11600ca6d2fd5563e30dbc67b4bd1c6379bedd3c88495c4ef6a6df78f
- route_changed: no
- safe_command: agentplane blueprint snapshot 202608031232-VPA795

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202608031232-VPA795
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Revert the scoped script and task commits; the previous timeout behavior will be restored without database or dependency changes.

## Findings

Root cause confirmed: AbortSignal.timeout(1000) remained attached after fetch resolved. Because the script awaited all six probes before parsing four bodies, successful HTTP 200 responses could be aborted before response.json ran. Resolution: consume each successful response body with arrayBuffer while the request timeout remains active, then construct a detached Response for later parsing. Residual risk: the full database-backed smoke could not run locally without DATABASE_URL and requires CI confirmation.
