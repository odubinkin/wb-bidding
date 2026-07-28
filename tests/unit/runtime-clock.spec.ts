import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeClockService } from '../../apps/bidder/src/runtime-clock.service.js';
import { loadConfiguration } from '@wb-bidder/config';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RuntimeClockService', () => {
  it('requires and preserves the deterministic mock control-plane instant', async () => {
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-clock-admin-token-with-32-chars',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      WB_API_MOCK_BASE_URL: 'http://mock.invalid:3001',
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ virtualTime: '2026-08-03T04:05:06.000Z' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const clock = new RuntimeClockService(configuration);

    expect(() => clock.now()).toThrow('MOCK_CLOCK_NOT_SYNCHRONIZED');
    await expect(clock.refresh()).resolves.toEqual(new Date('2026-08-03T04:05:06.000Z'));
    expect(clock.now()).toEqual(new Date('2026-08-03T04:05:06.000Z'));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://mock.invalid:3001/__mock/state'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('rejects malformed virtual time instead of falling back to wall time', async () => {
    const configuration = loadConfiguration({
      ACCOUNT_CURRENCY: 'RUB',
      ACCOUNT_TIMEZONE: 'Europe/Moscow',
      ADMIN_API_SERVICE_TOKEN: 'runtime-test-clock-admin-token-with-32-chars',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      WB_API_MODE: 'mock',
      WB_API_TOKEN: 'mock-test-token',
      WB_API_WRITE_ENABLED: 'false',
      WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
      WB_EXPECTED_TOKEN_TYPE: 'TEST',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ virtualTime: 'not-a-date' }))),
    );

    await expect(new RuntimeClockService(configuration).refresh()).rejects.toThrow(
      'MOCK_CLOCK_RESPONSE_INVALID',
    );
  });
});
