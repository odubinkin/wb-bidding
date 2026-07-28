---
id: "202607281323-PZZ48N"
title: "Stage 5: production readiness and complete DoD audit"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 7
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
doc_version: 3
doc_updated_at: "2026-07-28T20:04:45.425Z"
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
    - Observation: E2E-24 and E2E-49 lack a verified mock-only cluster profile/executor; Docker runtime/image/dependency scans, sandbox smoke, and product/API owner decisions have no evidence.
      Impact: AC-14, AC-24, AC-30 and DoD 31.1/31.3/31.4/31.10 cannot be marked complete; production writes remain disabled.
      Resolution: Implement the immutable verified mock cluster contract and cluster write/delete pipeline; then obtain green CI/Docker, sandbox manifest/Test credential evidence, and signed owner decisions.

    - Observation: Docker runtime/image scan unavailable; full all-dependencies audit retains dev-only brace-expansion advisory; sandbox fixture/Test credential and product/API release-owner evidence were not supplied.
      Impact: DoD section 31 and production release cannot be marked complete or task finished without external CI/sandbox/owner evidence.
      Resolution: Run CI Docker/Trivy and parent dev-tool dependency upgrades, provide sandbox manifest/Test credential with approval, and attach signed product/API release-owner decisions.
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

- Observation: E2E-24 and E2E-49 lack a verified mock-only cluster profile/executor; Docker runtime/image/dependency scans, sandbox smoke, and product/API owner decisions have no evidence.
  Impact: AC-14, AC-24, AC-30 and DoD 31.1/31.3/31.4/31.10 cannot be marked complete; production writes remain disabled.
  Resolution: Implement the immutable verified mock cluster contract and cluster write/delete pipeline; then obtain green CI/Docker, sandbox manifest/Test credential evidence, and signed owner decisions.

- Observation: Docker runtime/image scan unavailable; full all-dependencies audit retains dev-only brace-expansion advisory; sandbox fixture/Test credential and product/API release-owner evidence were not supplied.
  Impact: DoD section 31 and production release cannot be marked complete or task finished without external CI/sandbox/owner evidence.
  Resolution: Run CI Docker/Trivy and parent dev-tool dependency upgrades, provide sandbox manifest/Test credential with approval, and attach signed product/API release-owner decisions.
