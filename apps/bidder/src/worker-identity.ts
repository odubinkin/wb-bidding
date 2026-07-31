import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Pool } from 'pg';

/** Immutable process incarnation used to own durable worker leases. */
export interface WorkerIdentity {
  /** Prefix shared only by workers in this exact process incarnation. */
  readonly prefix: string;
  /** Builds one exact lease owner for a worker purpose. */
  readonly owner: (suffix: string) => string;
}

/** Inputs used to construct a deterministic worker identity. */
export interface WorkerIdentitySource {
  readonly bootId: string;
  readonly hostname: string;
  readonly pid: number;
}

/**
 * Builds one process-incarnation identity from replica and boot components.
 *
 * @param source - Hostname, PID, and process boot UUID.
 * @returns Frozen identity with exact worker-owner construction.
 */
export function createWorkerIdentity(source: WorkerIdentitySource): WorkerIdentity {
  const prefix = `host:${source.hostname}:pid:${source.pid.toString()}:boot:${source.bootId}`;
  return Object.freeze({
    /**
     * Builds an exact owner within this process incarnation.
     *
     * @param suffix - Worker purpose.
     * @returns Exact durable lease owner.
     */
    owner: (suffix: string) => `${prefix}:${suffix}`,
    prefix,
  });
}

/** Process-stable identity shared by every scheduler-owned worker in this runtime. */
export const PROCESS_WORKER_IDENTITY = createWorkerIdentity({
  bootId: randomUUID(),
  hostname: hostname(),
  pid: process.pid,
});

/**
 * Releases only scheduler leases owned by the exact shutting-down process.
 *
 * @param pool - Shared PostgreSQL pool.
 * @param identity - Exact process incarnation.
 * @returns Nothing after import and manual-job leases are released.
 */
export async function releaseOwnedSchedulerLeases(
  pool: Pool,
  identity: WorkerIdentity,
): Promise<void> {
  await pool.query(
    `UPDATE "ProductEconomicsImport"
        SET "status" = 'QUEUED', "leaseOwner" = NULL, "leaseUntil" = NULL
      WHERE "status" = 'PROCESSING' AND "leaseOwner" = $1`,
    [identity.owner('economics-import')],
  );
  await pool.query(
    `UPDATE "ManualJob"
        SET "status" = 'QUEUED', "leaseOwner" = NULL, "leaseUntil" = NULL
      WHERE "status" = 'RUNNING' AND "leaseOwner" = $1`,
    [identity.owner('manual-job')],
  );
}
