# Implementation deviations and verification constraints

## Functional deviations

There are no intentional functional deviations from the technical specification in completed
stages.

The official WB endpoint profile currently marks cluster bid unit, minimum, absence, write, and
delete semantics as `UNVERIFIED`. In accordance with the specification's fail-closed rule, cluster
automation is observation-only and cluster mutation methods reject dispatch. This is a required
safety state, not an alternative contract. Enabling it requires a new pinned profile supported by
official WB documentation and contract fixtures.

The corporate identity provider remains intentionally replaceable. The production boundary uses
the specification's interim service-token mode, explicit per-operation permissions, private-network
deployment assumptions, constant-time comparison, protected documentation routes, and secret
redaction. Replacing the service token with the selected corporate provider must preserve the same
permission names and audit actor contract.

## Local verification constraint

The local Docker daemon was unavailable during development. Docker Compose definitions and
multi-stage non-root images are validated statically, all packages build, built Node entrypoints
pass smoke tests, and the complete write flow was executed against a temporary local PostgreSQL
server plus the real deterministic WB mock HTTP application. CI/release environments must still run
the Docker image build and Compose smoke gates; this is a verification-environment constraint, not
a difference in implemented behavior.
