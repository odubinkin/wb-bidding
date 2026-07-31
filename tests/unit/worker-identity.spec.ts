import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

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
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });

    await releaseOwnedSchedulerLeases({ query } as unknown as Pool, identity);

    expect(query).toHaveBeenCalledTimes(2);
    for (const [statement, parameters] of query.mock.calls as [string, readonly string[]][]) {
      expect(statement).toContain('"leaseOwner" = $1');
      expect(statement).not.toContain('LIKE');
      expect(parameters).toHaveLength(1);
      expect(parameters[0]).toMatch(new RegExp(`^${escapeRegExp(identity.prefix)}:`));
      expect(parameters[0]).not.toMatch(new RegExp(`^${escapeRegExp(otherIdentity.prefix)}:`));
    }
    expect(query.mock.calls[0]?.[1]).toEqual([identity.owner('economics-import')]);
    expect(query.mock.calls[1]?.[1]).toEqual([identity.owner('manual-job')]);
  });
});

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
