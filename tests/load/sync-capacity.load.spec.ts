import { describe, expect, it } from 'vitest';

import { calculateMinimumBidCapacity, selectFairWorkPage } from '@wb-bidder/data-sync';

describe('10,000 campaign / 100,000 target sync capacity', () => {
  it('pages the generated scope fairly within a bounded memory envelope', () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const campaigns = new Uint32Array(10_000);
    const targets = new Uint32Array(100_000);
    for (let index = 0; index < campaigns.length; index += 1) {
      campaigns[index] = index + 1;
    }
    for (let index = 0; index < targets.length; index += 1) {
      targets[index] = Math.floor(index / 10);
    }

    const visited = new Uint8Array(targets.length);
    let cursor = 0;
    let wrapped = false;
    let pages = 0;
    while (!wrapped) {
      const page = selectFairWorkPage(targets.length, cursor, 500, [
        targets.length - 1,
        targets.length - 2,
      ]);
      cursor = page.nextCursor;
      wrapped = page.wrapped;
      pages += 1;
      for (const index of page.indices) {
        visited[index] = 1;
      }
      expect(page.indices.length).toBeLessThanOrEqual(500);
    }

    expect(pages).toBe(1_000);
    expect(visited.reduce((total, value) => total + value, 0)).toBe(targets.length);
    expect(calculateMinimumBidCapacity(campaigns.length, 20, 720)).toEqual({
      applyCapacityProven: true,
      fullPassLowerBoundMinutes: 500,
      requiredSlaMinutes: 600,
    });
    expect(Math.ceil(campaigns.length / 50)).toBe(200);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(64 * 1024 * 1024);
  });
});
