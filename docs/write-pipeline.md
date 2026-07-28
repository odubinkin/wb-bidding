# Durable write pipeline and Admin API

## Safety model

All WB mutations pass through `DecisionQueueItem`. The executor claims bounded pages with
`FOR UPDATE SKIP LOCKED`, creates a lease, and serializes active work per target. It then performs a
fresh WB read and policy validation, reserves the write endpoint quota plus an in-flight slot, and
only then creates an immutable `WbWriteAttempt` with per-item pre-write evidence. The
`DISPATCHING` transaction itself rejects evidence older than `PRE_WRITE_STATE_MAX_AGE_MS`, so a
rate-limit wait cannot silently make the live read stale.

The network call is allowed only after a separate transaction commits:

- the request and every item as `DISPATCHING`;
- the queue items as `SENT`;
- the exact desired state, pre-write checksum, source marker, attempt number, and verification
  deadline.

`PREPARED` therefore proves that no dispatch was committed and is safe to recover without consuming
an attempt. A stale `DISPATCHING` attempt is always `UNKNOWN`; it is never blindly retried.
Transport failure proven to occur before any request byte is retried at most
`WB_WRITE_PRE_BYTE_MAX_RETRIES` times in the same attempt; exhaustion is a safe terminal failure,
not `UNKNOWN`.

Card writes are grouped by bid type, payment type, action, endpoint, and priority order. Unsupported
target kinds, actions, or unknown campaign contracts fail closed before dispatch. One WB response is
mapped back by request index, so accepted and rejected items in a batch have independent terminal
state and audit evidence.

## Reconciliation

Verification starts only after the endpoint visibility delay.

- Desired state: queue becomes `APPLIED`.
- Same pre-write state: the configured number (minimum two) of fresh reads with the same checksum,
  separated by the configured minimum interval and followed by successful prevalidation, permit a
  bounded automatic retry.
- Third state: `FAILED / EXTERNAL_STATE_CONFLICT`.
- Deadline: `FAILED / RECONCILIATION_INCONCLUSIVE`; manual retry remains blocked.

Every retry retains `decisionId` and increments `attemptNumber`. `UNKNOWN`, pending reconciliation,
authentication/capability denial, invalid payload, superseded decisions, and inconclusive
reconciliation return `RETRY_NOT_SAFE`.
Pre-byte/no-dispatch records do not consume
`RECONCILIATION_MAX_WRITE_ATTEMPTS`; ambiguous or accepted external dispatches do.

## Write controls

`DeploymentControl`, `CampaignAutomation`, and `TargetAutomation` are checked again inside both the
prepare and dispatch-commit transactions. Global kill takes precedence. Enabling and disabling it
are separate conditional, idempotent, append-only audited operations.

`APPLY` never overrides the process-level `WB_API_WRITE_ENABLED` gate or WB token/profile
capabilities. Cluster write/delete remains fail-closed while its official WB contract is
`UNVERIFIED`.

## Admin API

All `/api/v1` Admin endpoints use constant-time bearer service-token authentication and explicit
permission metadata in runtime-generated OpenAPI:

- `product-economics:read|write|import`;
- `policies:read|write|activate`;
- `automation:read|write|kill`;
- `jobs:read|trigger`;
- `decisions:read`;
- `queue:read|retry`;
- `audit:read`.

Mutations require `Idempotency-Key`; current-state changes also require `If-Match` (or
`If-None-Match: *` for the first economics version). Idempotency result and audit event are stored in
the mutation transaction. Policy content remains immutable: creation produces an inactive version,
and activation is a separate ETag-protected, idempotent, audited transition.

Lists use stable `(createdAt, id)` cursor ordering and `limit=1..500`; filter values and cursor
components are validated before SQL. PostgreSQL `BIGINT` values are
serialized as decimal strings. Errors use `application/problem+json` with a correlation ID. Secrets
are redacted before logging, persistence, and API serialization. Swagger UI and `/docs-json` require
the same service token.

No Admin endpoint calls WB synchronously. Manual jobs enqueue bounded scopes, recalculation consumes
stored coherent snapshots, and writes remain behind queue, lease, limiter, capability, kill, and
reconciliation gates.

## Verification

Automated checks cover:

- queue transitions, stable-old proof, deep redaction, and dispatch ordering;
- clean and populated PostgreSQL migration;
- lease/claim behavior, partial batch mapping, both crash windows, `UNKNOWN`, safe retry, kill
  switches, atomic policy activation/assignment and supersede, idempotency, effective-period
  economics, and append-only before/after audit;
- complete Admin path/security/permission/problem contract;
- real HTTP flow through the deterministic WB mock, including delayed visibility, verified apply,
  a post-dispatch 503, and proof that no duplicate write occurs.
