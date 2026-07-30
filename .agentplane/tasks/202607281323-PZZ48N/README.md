---
id: "202607281323-PZZ48N"
title: "Stage 5: production readiness and complete DoD audit"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 29
origin:
  system: "manual"
depends_on:
  - "202607281322-C5T8TR"
tags:
  - "code"
task_kind: "release"
mutation_scope: "release"
risk_flags:
  - "credentials"
  - "deploy"
  - "network"
  - "security"
verify:
  - "ap doctor"
  - "docker compose -f docker-compose.mock-only.yml config"
  - "docker compose -f docker-compose.mock.yml config"
  - "docker compose config"
  - "node .agentplane/policy/check-routing.mjs"
  - "pnpm run docs:check"
  - "pnpm run quality"
  - "pnpm run security:scan"
  - "pnpm run test:contract"
  - "pnpm run test:e2e"
  - "pnpm run test:integration"
  - "pnpm run test:load"
  - "pnpm run test:runbook"
  - "pnpm run verify:deprecated-endpoints"
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T17:12:25.088Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "needs_rework"
  updated_at: "2026-07-28T20:04:45.360Z"
  updated_by: "CODER"
  note: "Local functional scope complete: 51/51 scenarios, quality/integration/e2e/load/runbook/property/mutation/build/built-smoke/docs/secrets/container-policy/compose-config green; release remains externally gated."
  attempts: 2
commit: null
comments:
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: Docker runtime build exposed pnpm 10 deploy incompatibility; fixing the approved Dockerfile command is required before image verification can continue."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: Compose mock-only smoke exposed an Authorization header mismatch; correcting the approved runtime smoke contract is required before container verification can continue."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: Trivy scanner container cannot access Docker Desktop's local image socket; the approved socket-mounted scan must replace the failed invocation."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: Trivy found HIGH/CRITICAL packages in unused runtime npm; final images require npm/corepack removal before release verification can continue."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: Trivy template rendering did not match this scanner version; rerunning the approved scan with a compatible root-array template is required."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: PostgreSQL-backed integration execution found three deterministic Stage 5 failures in decision-engine invariants. Observation: database constraints on ProductEconomics and BiddingPolicy conflict with repository version-creation and activation semantics; the affected import reports two failures instead of one. Impact: section 31.3 and production readiness cannot be claimed. Resolution: align repository logic and migration constraints with immutable append-only versioning, add regression coverage, then rerun the full PostgreSQL suite. Fixability: local."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: final quality run stopped at Prettier because the rewritten acceptance-evidence document is not formatted. Impact: no source or runtime failure occurred, but the quality gate cannot be recorded green. Resolution: apply the repository formatter to that document and rerun quality. Fixability: local."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
  -
    author: "CODER"
    body: "Blocked: workspace build succeeded, but smoke:built was invoked without its required DATABASE_URL. Impact: the application entrypoint was not exercised in that invocation, so the gate is not green. Resolution: rerun smoke:built against the isolated PostgreSQL 18 verification database after confirming the script requirements. Fixability: local."
  -
    author: "CODER"
    body: "Start: continue direct-mode task in current checkout."
events:
  -
    type: "status"
    at: "2026-07-28T17:12:36.841Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "verify"
    at: "2026-07-28T19:24:51.501Z"
    author: "CODER"
    state: "needs_rework"
    note: "Local Stage 5 runtime and quality gates pass; release DoD remains open."
  -
    type: "verify"
    at: "2026-07-28T20:04:45.360Z"
    author: "CODER"
    state: "needs_rework"
    note: "Local functional scope complete: 51/51 scenarios, quality/integration/e2e/load/runbook/property/mutation/build/built-smoke/docs/secrets/container-policy/compose-config green; release remains externally gated."
  -
    type: "status"
    at: "2026-07-30T04:43:17.568Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Docker runtime build exposed pnpm 10 deploy incompatibility; fixing the approved Dockerfile command is required before image verification can continue."
  -
    type: "status"
    at: "2026-07-30T04:43:26.309Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T04:49:54.009Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Compose mock-only smoke exposed an Authorization header mismatch; correcting the approved runtime smoke contract is required before container verification can continue."
  -
    type: "status"
    at: "2026-07-30T04:50:05.308Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T04:58:13.990Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Trivy scanner container cannot access Docker Desktop's local image socket; the approved socket-mounted scan must replace the failed invocation."
  -
    type: "status"
    at: "2026-07-30T04:58:23.906Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T05:00:53.686Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Trivy found HIGH/CRITICAL packages in unused runtime npm; final images require npm/corepack removal before release verification can continue."
  -
    type: "status"
    at: "2026-07-30T05:01:03.361Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T05:05:43.889Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: Trivy template rendering did not match this scanner version; rerunning the approved scan with a compatible root-array template is required."
  -
    type: "status"
    at: "2026-07-30T05:05:52.287Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T05:13:18.751Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: PostgreSQL-backed integration execution found three deterministic Stage 5 failures in decision-engine invariants. Observation: database constraints on ProductEconomics and BiddingPolicy conflict with repository version-creation and activation semantics; the affected import reports two failures instead of one. Impact: section 31.3 and production readiness cannot be claimed. Resolution: align repository logic and migration constraints with immutable append-only versioning, add regression coverage, then rerun the full PostgreSQL suite. Fixability: local."
  -
    type: "status"
    at: "2026-07-30T05:13:28.621Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T05:19:33.036Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: final quality run stopped at Prettier because the rewritten acceptance-evidence document is not formatted. Impact: no source or runtime failure occurred, but the quality gate cannot be recorded green. Resolution: apply the repository formatter to that document and rerun quality. Fixability: local."
  -
    type: "status"
    at: "2026-07-30T05:19:43.049Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
  -
    type: "status"
    at: "2026-07-30T05:21:24.948Z"
    author: "CODER"
    from: "DOING"
    to: "BLOCKED"
    note: "Blocked: workspace build succeeded, but smoke:built was invoked without its required DATABASE_URL. Impact: the application entrypoint was not exercised in that invocation, so the gate is not green. Resolution: rerun smoke:built against the isolated PostgreSQL 18 verification database after confirming the script requirements. Fixability: local."
  -
    type: "status"
    at: "2026-07-30T05:21:34.575Z"
    author: "CODER"
    from: "BLOCKED"
    to: "DOING"
    note: "Start: continue direct-mode task in current checkout."
doc_version: 3
doc_updated_at: "2026-07-30T05:22:23.612Z"
doc_updated_by: "CODER"
description: "Complete security hardening, observability, retention, non-root Docker images, all Compose scenarios, full CI gates, load, graceful-shutdown, outage, rollback and kill-switch validation, Russian documentation and Mermaid diagrams, endpoint-profile evidence, AC-01 through AC-30 traceability, section 31 evidence, sandbox smoke harness and explicit deviations register. Production remains write-disabled until separately approved."
sections:
  Summary: |-
    Stage 5: production readiness and complete DoD audit

    Complete security hardening, observability, retention, non-root Docker images, all Compose scenarios, full CI gates, load, graceful-shutdown, outage, rollback and kill-switch validation, Russian documentation and Mermaid diagrams, endpoint-profile evidence, AC-01 through AC-30 traceability, section 31 evidence, sandbox smoke harness and explicit deviations register. Production remains write-disabled until separately approved.
  Scope: |-
    - In scope: Complete security hardening, observability, retention, non-root Docker images, all Compose scenarios, full CI gates, load, graceful-shutdown, outage, rollback and kill-switch validation, Russian documentation and Mermaid diagrams, endpoint-profile evidence, AC-01 through AC-30 traceability, section 31 evidence, sandbox smoke harness and explicit deviations register. Production remains write-disabled until separately approved.
    - Out of scope: unrelated refactors not required for "Stage 5: production readiness and complete DoD audit".
  Plan: |-
    1. Complete production hardening, structured observability, alerts, retention, graceful shutdown, secret handling and non-root container delivery.
    2. Complete all required Russian documentation, Mermaid diagrams, ADRs, configuration matrices, API/runbook/rollback guidance and deviations register.
    3. Complete CI gates, coverage thresholds, mutation, OpenAPI, migration, dependency/container/security/secret/link/deprecated-endpoint checks.
    4. Run full unit, integration, consumer contract, e2e, load, outage, rollback, kill-switch and Compose smoke suites and record AC-01 through AC-30 evidence.
    5. Validate section 31 line by line; execute sandbox smoke only with externally provisioned manifest/Test token and separately authorized external actions, never substituting a mock result.
    6. Produce production artifact/profile traceability and final release findings while keeping production writes disabled absent recorded product-owner enablement.
  Verify Steps: |-
    1. Run pnpm run quality. Expected: locked install, compile, formatting, ESLint/JSDoc, unit coverage thresholds, OpenAPI, Prisma and deprecated endpoint gates all pass.
    2. Run pnpm run test:integration, pnpm run test:contract and pnpm run test:e2e. Expected: complete PostgreSQL/mock behavior covers all mandatory scenarios 1 through 51 and AC-01 through AC-30.
    3. Run pnpm run test:load. Expected: 10,000 campaigns and 100,000 targets, queue bursts, slow WB, pool exhaustion, replica races, starvation and graceful shutdown satisfy documented budgets.
    4. Run pnpm run test:runbook. Expected: WB outage, DB outage, 429 storm, stuck queue, rollback and global kill-switch drills pass with recorded evidence.
    5. Run pnpm run security:scan and the CI secret/dependency/container scans. Expected: no secrets or unresolved release-blocking vulnerabilities.
    6. Run pnpm run docs:check. Expected: Russian documentation set, Mermaid diagrams, clickable links, environment matrix, runbook and deviations register are complete and current.
    7. Validate all three Compose files and run their documented smoke tests. Expected: production topology excludes mock, full mock topology works, and mock-only is independent.
    8. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: repository governance and Agentplane state are valid.
    9. Audit docs/acceptance-evidence.md against AC-01 through AC-30 and every item of section 31. Expected: each requirement has direct command/runtime/artifact evidence or an explicitly unresolved external gate; no external gate may be claimed complete without evidence.
    10. Confirm production defaults and release artifact. Expected: writes are disabled, UNVERIFIED contracts cannot write, sameDay UNVERIFIED blocks increases, and profile ID/date/checksum are embedded.
    11. If SANDBOX_FIXTURE_MANIFEST and Test credentials are supplied with explicit external-action approval, run sandbox smoke. Expected: documented safe subset passes without unexplained discrepancies; otherwise section 31 remains open rather than being waived.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T19:24:51.501Z — VERIFY — needs_rework

    By: CODER

    Note: Local Stage 5 runtime and quality gates pass; release DoD remains open.
    Attempts: 1

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T17:12:36.841Z, excerpt_hash=sha256:0f7ebe81cafca4ae9eda8825f8edf22adeacc6abe07cae0aa0bc3ca8b936f5a3

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281323-PZZ48N/blueprint/resolved-snapshot.json
    - old_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
    - current_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281323-PZZ48N

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281323-PZZ48N
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    ### 2026-07-28T20:04:45.360Z — VERIFY — needs_rework

    By: CODER

    Note: Local functional scope complete: 51/51 scenarios, quality/integration/e2e/load/runbook/property/mutation/build/built-smoke/docs/secrets/container-policy/compose-config green; release remains externally gated.
    Attempts: 2

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T19:24:51.564Z, excerpt_hash=sha256:0f7ebe81cafca4ae9eda8825f8edf22adeacc6abe07cae0aa0bc3ca8b936f5a3

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281323-PZZ48N/blueprint/resolved-snapshot.json
    - old_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
    - current_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607281323-PZZ48N

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607281323-PZZ48N
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: |-
    ### Resolved local findings

    - pnpm deploy now uses pnpm 10 legacy deploy mode in both Dockerfiles; both non-root runtime images build successfully.
    - Compose smoke now uses the verified raw mock authorization contract; mock-only and full-mock topologies pass.
    - Full and production dependency audits are clean. HIGH/CRITICAL runtime image scans are clean after unused npm and corepack are removed only from final stages.
    - PostgreSQL integration, contract, E2E, load and runbook suites passed against a new PostgreSQL 18 database with all seven migrations. A prior failed integration rerun used persisted append-only fixtures; testing guidance now requires a new source database for repeated full integration runs.

    ### Remaining external release gates

    - Section 31.4 sandbox smoke cannot run: the user confirmed that WB sandbox credentials and fixture manifest do not exist and will not be supplied. This is a documented forced gap, never a mock substitute or waiver.
    - No hosted CI run or immutable release artifact exists because the user explicitly excluded GitHub while the project is unpublished. Local CI-equivalent checks passed, but this does not claim a hosted CI result.
    - Product-owner approval for production writes and API release-owner evidence for UNVERIFIED to VERIFIED promotion are absent. Production writes remain disabled.
id_source: "generated"
---
## Summary

Stage 5: production readiness and complete DoD audit

Complete security hardening, observability, retention, non-root Docker images, all Compose scenarios, full CI gates, load, graceful-shutdown, outage, rollback and kill-switch validation, Russian documentation and Mermaid diagrams, endpoint-profile evidence, AC-01 through AC-30 traceability, section 31 evidence, sandbox smoke harness and explicit deviations register. Production remains write-disabled until separately approved.

## Scope

- In scope: Complete security hardening, observability, retention, non-root Docker images, all Compose scenarios, full CI gates, load, graceful-shutdown, outage, rollback and kill-switch validation, Russian documentation and Mermaid diagrams, endpoint-profile evidence, AC-01 through AC-30 traceability, section 31 evidence, sandbox smoke harness and explicit deviations register. Production remains write-disabled until separately approved.
- Out of scope: unrelated refactors not required for "Stage 5: production readiness and complete DoD audit".

## Plan

1. Complete production hardening, structured observability, alerts, retention, graceful shutdown, secret handling and non-root container delivery.
2. Complete all required Russian documentation, Mermaid diagrams, ADRs, configuration matrices, API/runbook/rollback guidance and deviations register.
3. Complete CI gates, coverage thresholds, mutation, OpenAPI, migration, dependency/container/security/secret/link/deprecated-endpoint checks.
4. Run full unit, integration, consumer contract, e2e, load, outage, rollback, kill-switch and Compose smoke suites and record AC-01 through AC-30 evidence.
5. Validate section 31 line by line; execute sandbox smoke only with externally provisioned manifest/Test token and separately authorized external actions, never substituting a mock result.
6. Produce production artifact/profile traceability and final release findings while keeping production writes disabled absent recorded product-owner enablement.

## Verify Steps

1. Run pnpm run quality. Expected: locked install, compile, formatting, ESLint/JSDoc, unit coverage thresholds, OpenAPI, Prisma and deprecated endpoint gates all pass.
2. Run pnpm run test:integration, pnpm run test:contract and pnpm run test:e2e. Expected: complete PostgreSQL/mock behavior covers all mandatory scenarios 1 through 51 and AC-01 through AC-30.
3. Run pnpm run test:load. Expected: 10,000 campaigns and 100,000 targets, queue bursts, slow WB, pool exhaustion, replica races, starvation and graceful shutdown satisfy documented budgets.
4. Run pnpm run test:runbook. Expected: WB outage, DB outage, 429 storm, stuck queue, rollback and global kill-switch drills pass with recorded evidence.
5. Run pnpm run security:scan and the CI secret/dependency/container scans. Expected: no secrets or unresolved release-blocking vulnerabilities.
6. Run pnpm run docs:check. Expected: Russian documentation set, Mermaid diagrams, clickable links, environment matrix, runbook and deviations register are complete and current.
7. Validate all three Compose files and run their documented smoke tests. Expected: production topology excludes mock, full mock topology works, and mock-only is independent.
8. Run node .agentplane/policy/check-routing.mjs and ap doctor. Expected: repository governance and Agentplane state are valid.
9. Audit docs/acceptance-evidence.md against AC-01 through AC-30 and every item of section 31. Expected: each requirement has direct command/runtime/artifact evidence or an explicitly unresolved external gate; no external gate may be claimed complete without evidence.
10. Confirm production defaults and release artifact. Expected: writes are disabled, UNVERIFIED contracts cannot write, sameDay UNVERIFIED blocks increases, and profile ID/date/checksum are embedded.
11. If SANDBOX_FIXTURE_MANIFEST and Test credentials are supplied with explicit external-action approval, run sandbox smoke. Expected: documented safe subset passes without unexplained discrepancies; otherwise section 31 remains open rather than being waived.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T19:24:51.501Z — VERIFY — needs_rework

By: CODER

Note: Local Stage 5 runtime and quality gates pass; release DoD remains open.
Attempts: 1

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T17:12:36.841Z, excerpt_hash=sha256:0f7ebe81cafca4ae9eda8825f8edf22adeacc6abe07cae0aa0bc3ca8b936f5a3

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281323-PZZ48N/blueprint/resolved-snapshot.json
- old_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
- current_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281323-PZZ48N

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281323-PZZ48N
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

### 2026-07-28T20:04:45.360Z — VERIFY — needs_rework

By: CODER

Note: Local functional scope complete: 51/51 scenarios, quality/integration/e2e/load/runbook/property/mutation/build/built-smoke/docs/secrets/container-policy/compose-config green; release remains externally gated.
Attempts: 2

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T19:24:51.564Z, excerpt_hash=sha256:0f7ebe81cafca4ae9eda8825f8edf22adeacc6abe07cae0aa0bc3ca8b936f5a3

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607281323-PZZ48N/blueprint/resolved-snapshot.json
- old_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
- current_digest: dd16438f127e6adb6f7a1435b7f7fc1e7ab22cfda2fe1298c4b616ac2f02c0ae
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607281323-PZZ48N

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607281323-PZZ48N
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings

### Resolved local findings

- pnpm deploy now uses pnpm 10 legacy deploy mode in both Dockerfiles; both non-root runtime images build successfully.
- Compose smoke now uses the verified raw mock authorization contract; mock-only and full-mock topologies pass.
- Full and production dependency audits are clean. HIGH/CRITICAL runtime image scans are clean after unused npm and corepack are removed only from final stages.
- PostgreSQL integration, contract, E2E, load and runbook suites passed against a new PostgreSQL 18 database with all seven migrations. A prior failed integration rerun used persisted append-only fixtures; testing guidance now requires a new source database for repeated full integration runs.

### Remaining external release gates

- Section 31.4 sandbox smoke cannot run: the user confirmed that WB sandbox credentials and fixture manifest do not exist and will not be supplied. This is a documented forced gap, never a mock substitute or waiver.
- No hosted CI run or immutable release artifact exists because the user explicitly excluded GitHub while the project is unpublished. Local CI-equivalent checks passed, but this does not claim a hosted CI result.
- Product-owner approval for production writes and API release-owner evidence for UNVERIFIED to VERIFIED promotion are absent. Production writes remain disabled.
