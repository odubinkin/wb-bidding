# EVALUATOR opinion: pass

Concurrent manual-job creation now converges per job type and canonical scope while unrelated scopes continue independently.

## Findings
- createJob acquires a transaction-scoped advisory lock derived from job type and the checksum of the sorted canonical scope before checking active work.
- Concurrent calls with different idempotency keys and equivalent reordered scopes return the same job identifier and persist only one ManualJob.
- Existing RUNNING work is returned with its stored state, and a different canonical scope completes while another scope lock is held.

## Evidence
- .agentplane/tasks/202607310804-RBA764/README.md
- commit:d3cd988d6674
- tests/integration/write-pipeline.integration.spec.ts
- targeted PostgreSQL 18 integration: 14 passed
- pnpm run format:check; pnpm run lint; pnpm run typecheck; pnpm run test:unit (115 passed)
- PostgreSQL 18 migrations and full integration suite (33 passed)

## Missing Tests
- none recorded

## Hidden Assumptions
- none recorded

## Residual Risks
- The at-most-one-active-job invariant applies to creation through AdminService; direct database writers must use the same lock discipline.
