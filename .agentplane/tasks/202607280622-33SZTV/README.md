---
id: "202607280622-33SZTV"
title: "Replace English glossary terms in Russian specification text"
status: "DOING"
priority: "med"
owner: "DOCS"
revision: 13
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-28T06:22:39.755Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-28T06:23:22.063Z"
  updated_by: "DOCS"
  note: "Verified: all four approved glossary-term replacements are present; English normative terms remain only in the bilingual glossary, and all required documentation checks pass."
  attempts: 0
quality_review:
  state: "pass"
  provenance: "evaluator_supplied"
  updated_at: "2026-07-28T06:24:37.854Z"
  updated_by: "EVALUATOR"
  note: "The approved terminology normalization is complete and semantically preserves all four normative requirements."
  evaluated_sha: "32923187ecadf60d2c96b386f310ef7238af8264"
  blueprint_digest: "31147b92f7a77e09c778a377da36267cd131baa89814d34fa9b606922c8de346"
  evidence_refs:
    - ".agentplane/tasks/202607280622-33SZTV/README.md"
    - ".agentplane/tasks/202607280622-33SZTV/quality/20260728-062437854-recovery-context/quality-report.json"
    - ".agentplane/tasks/202607280622-33SZTV/quality/20260728-062437854-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202607280622-33SZTV/quality/20260728-062437854-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202607280622-33SZTV/blueprint/resolved-snapshot.json"
    - "git show 32923187ecad -- docs/technical-specification.md"
    - "rg -n '(MUST NOT|MUST|SHOULD|MAY)' docs/technical-specification.md"
    - "node .agentplane/policy/check-routing.mjs"
    - "ap doctor"
  findings:
    - "The diff contains exactly three SHOULD-to-СЛЕДУЕТ substitutions and one MAY-to-МОЖЕТ substitution in Russian prose; glossary mappings remain intact and no normative English term remains outside the glossary."
commit: null
comments:
  -
    author: "DOCS"
    body: "Start: Replace the four approved English glossary terms in Russian prose and verify that only bilingual glossary definitions retain them."
events:
  -
    type: "status"
    at: "2026-07-28T06:22:46.118Z"
    author: "DOCS"
    from: "TODO"
    to: "DOING"
    note: "Start: Replace the four approved English glossary terms in Russian prose and verify that only bilingual glossary definitions retain them."
  -
    type: "verify"
    at: "2026-07-28T06:23:22.063Z"
    author: "DOCS"
    state: "ok"
    note: "Verified: all four approved glossary-term replacements are present; English normative terms remain only in the bilingual glossary, and all required documentation checks pass."
doc_version: 3
doc_updated_at: "2026-07-28T06:23:22.360Z"
doc_updated_by: "DOCS"
description: "Use the Russian equivalents defined by the glossary for normative English terms appearing in Russian prose in docs/technical-specification.md; preserve the bilingual glossary definitions and historical task records."
sections:
  Summary: "Replace English normative terms from the bilingual glossary with their defined Russian equivalents where those terms appear in Russian prose."
  Scope: "In scope: docs/technical-specification.md body text. Replace three SHOULD occurrences with СЛЕДУЕТ and one MAY occurrence with МОЖЕТ. Out of scope: the bilingual glossary definitions, English technical identifiers, AGENTS.md, canonical policy modules, and historical task records."
  Plan: "1. Confirm all MUST, MUST NOT, SHOULD, and MAY occurrences in docs/technical-specification.md. 2. Replace glossary terms used in Russian prose with the mapped Russian forms while preserving glossary definitions. 3. Verify no mapped English normative terms remain outside the glossary and run the required documentation checks."
  Verify Steps: "1. Run rg -n '(MUST NOT|MUST|SHOULD|MAY)' docs/technical-specification.md and confirm matches exist only in the bilingual glossary. 2. Run git diff --check. 3. Run node .agentplane/policy/check-routing.mjs. 4. Run ap doctor. 5. Review git diff -- docs/technical-specification.md and confirm exactly the approved prose replacements."
  Verification: |-
    Command: rg -n '(MUST NOT|MUST|SHOULD|MAY)' docs/technical-specification.md. Result: pass. Evidence: only glossary definition lines 16-19 remain. Scope: docs/technical-specification.md. Links: bilingual glossary in the same document.

    Command: git diff --check. Result: pass. Evidence: no whitespace errors. Scope: approved documentation diff. Links: none.

    Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository documentation/policy routing contract. Links: AGENTS.md canonical policy references.

    Command: ap doctor. Result: pass. Evidence: errors=0, warnings=0; one informational blueprint compatibility note. Scope: repository workflow health. Links: none.

    Command: git diff -- docs/technical-specification.md. Result: pass. Evidence: exactly three SHOULD-to-СЛЕДУЕТ replacements and one MAY-to-МОЖЕТ replacement; glossary unchanged. Scope: docs/technical-specification.md. Links: bilingual glossary in the same document.

    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-28T06:23:22.063Z — VERIFY — ok

    By: DOCS

    Note: Verified: all four approved glossary-term replacements are present; English normative terms remain only in the bilingual glossary, and all required documentation checks pass.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:23:21.435Z, excerpt_hash=sha256:63d1ab4554fbaa1e73d5736330709c34fe30aafc6c6fd69096621a151ea475b3

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280622-33SZTV/blueprint/resolved-snapshot.json
    - old_digest: 31147b92f7a77e09c778a377da36267cd131baa89814d34fa9b606922c8de346
    - current_digest: 31147b92f7a77e09c778a377da36267cd131baa89814d34fa9b606922c8de346
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607280622-33SZTV

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
  Rollback Plan: "Revert only the four approved term substitutions in docs/technical-specification.md; preserve all unrelated user changes."
  Findings: "No findings before implementation."
extensions:
  workflow_route_baseline:
    start_head_sha: "df81cfe542edd97355800a229373c5f32e332981"
    version: 1
id_source: "generated"
---
## Summary

Replace English normative terms from the bilingual glossary with their defined Russian equivalents where those terms appear in Russian prose.

## Scope

In scope: docs/technical-specification.md body text. Replace three SHOULD occurrences with СЛЕДУЕТ and one MAY occurrence with МОЖЕТ. Out of scope: the bilingual glossary definitions, English technical identifiers, AGENTS.md, canonical policy modules, and historical task records.

## Plan

1. Confirm all MUST, MUST NOT, SHOULD, and MAY occurrences in docs/technical-specification.md. 2. Replace glossary terms used in Russian prose with the mapped Russian forms while preserving glossary definitions. 3. Verify no mapped English normative terms remain outside the glossary and run the required documentation checks.

## Verify Steps

1. Run rg -n '(MUST NOT|MUST|SHOULD|MAY)' docs/technical-specification.md and confirm matches exist only in the bilingual glossary. 2. Run git diff --check. 3. Run node .agentplane/policy/check-routing.mjs. 4. Run ap doctor. 5. Review git diff -- docs/technical-specification.md and confirm exactly the approved prose replacements.

## Verification

Command: rg -n '(MUST NOT|MUST|SHOULD|MAY)' docs/technical-specification.md. Result: pass. Evidence: only glossary definition lines 16-19 remain. Scope: docs/technical-specification.md. Links: bilingual glossary in the same document.

Command: git diff --check. Result: pass. Evidence: no whitespace errors. Scope: approved documentation diff. Links: none.

Command: node .agentplane/policy/check-routing.mjs. Result: pass. Evidence: policy routing OK. Scope: repository documentation/policy routing contract. Links: AGENTS.md canonical policy references.

Command: ap doctor. Result: pass. Evidence: errors=0, warnings=0; one informational blueprint compatibility note. Scope: repository workflow health. Links: none.

Command: git diff -- docs/technical-specification.md. Result: pass. Evidence: exactly three SHOULD-to-СЛЕДУЕТ replacements and one MAY-to-МОЖЕТ replacement; glossary unchanged. Scope: docs/technical-specification.md. Links: bilingual glossary in the same document.

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-28T06:23:22.063Z — VERIFY — ok

By: DOCS

Note: Verified: all four approved glossary-term replacements are present; English normative terms remain only in the bilingual glossary, and all required documentation checks pass.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-28T06:23:21.435Z, excerpt_hash=sha256:63d1ab4554fbaa1e73d5736330709c34fe30aafc6c6fd69096621a151ea475b3

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607280622-33SZTV/blueprint/resolved-snapshot.json
- old_digest: 31147b92f7a77e09c778a377da36267cd131baa89814d34fa9b606922c8de346
- current_digest: 31147b92f7a77e09c778a377da36267cd131baa89814d34fa9b606922c8de346
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607280622-33SZTV

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

Revert only the four approved term substitutions in docs/technical-specification.md; preserve all unrelated user changes.

## Findings

No findings before implementation.
