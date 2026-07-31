import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@wb-bidder/database';

import {
  createWorkerIdentity,
  releaseOwnedSchedulerLeases,
} from '../../apps/bidder/src/worker-identity.js';

describe('replica-safe worker identity', () => {
  it('is stable within one process incarnation and changes across replicas or restarts', () => {
    const bootId = randomUUID();
    const first = createWorkerIdentity({ bootId, hostname: 'bidder-a', pid: 7 });
    const same = createWorkerIdentity({ bootId, hostname: 'bidder-a', pid: 7 });
    const otherReplica = createWorkerIdentity({ bootId, hostname: 'bidder-b', pid: 7 });
    const restarted = createWorkerIdentity({
      bootId: randomUUID(),
      hostname: 'bidder-a',
      pid: 7,
    });

    expect(first.prefix).toBe(same.prefix);
    expect(first.owner('manual-job')).toBe(same.owner('manual-job'));
    expect(otherReplica.prefix).not.toBe(first.prefix);
    expect(restarted.prefix).not.toBe(first.prefix);
    expect(first.owner('manual-job')).not.toBe(first.owner('economics-import'));
  });

  it('releases scheduler leases only for exact owners from this process', async () => {
    const identity = createWorkerIdentity({
      bootId: randomUUID(),
      hostname: 'bidder-a',
      pid: 11,
    });
    const otherIdentity = createWorkerIdentity({
      bootId: randomUUID(),
      hostname: 'bidder-a',
      pid: 11,
    });
    let economicsOwner = '';
    let jobOwner = '';
    const updateEconomics = vi.fn((input: { readonly where: { readonly leaseOwner: string } }) => {
      economicsOwner = input.where.leaseOwner;
      return Promise.resolve({ count: 0 });
    });
    const updateJobs = vi.fn((input: { readonly where: { readonly leaseOwner: string } }) => {
      jobOwner = input.where.leaseOwner;
      return Promise.resolve({ count: 0 });
    });
    const transaction = vi.fn(async (operations: readonly Promise<unknown>[]) =>
      Promise.all(operations),
    );

    await releaseOwnedSchedulerLeases(
      {
        $transaction: transaction,
        manualJob: { updateMany: updateJobs },
        productEconomicsImport: { updateMany: updateEconomics },
      } as unknown as DatabaseClient,
      identity,
    );

    expect(updateEconomics).toHaveBeenCalledTimes(1);
    expect(updateJobs).toHaveBeenCalledTimes(1);
    for (const owner of [economicsOwner, jobOwner]) {
      expect(owner).toMatch(new RegExp(`^${escapeRegExp(identity.prefix)}:`));
      expect(owner).not.toMatch(new RegExp(`^${escapeRegExp(otherIdentity.prefix)}:`));
    }
    expect(economicsOwner).toBe(identity.owner('economics-import'));
    expect(jobOwner).toBe(identity.owner('manual-job'));
  });
});

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
