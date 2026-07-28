import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfiguration, loadMockConfiguration } from '@wb-bidder/config';

const BASE_ENVIRONMENT = {
  ACCOUNT_CURRENCY: 'RUB',
  ACCOUNT_TIMEZONE: 'Europe/Moscow',
  ADMIN_API_SERVICE_TOKEN: 'test-admin-token-with-32-characters',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  METRICS_ENABLED: 'true',
  PORT: '3000',
  SCHEDULER_ENABLED: 'true',
  WB_API_MODE: 'prod',
  WB_API_PROD_BASE_URL: 'https://advert-api.wildberries.ru',
  WB_API_TOKEN: 'header.payload.signature',
  WB_API_WRITE_ENABLED: 'false',
  WB_ENDPOINT_PROFILE_VERSION: 'wb-promotion-2026-07-28-v1',
  WB_EXPECTED_TOKEN_TYPE: 'PERSONAL',
  WB_PRODUCTION_WRITE_CONFIRMATION: '',
} as const;

describe('loadConfiguration', () => {
  it('keeps production writes disabled by default', () => {
    const configuration = loadConfiguration(BASE_ENVIRONMENT);

    expect(configuration.wb.baseUrl.href).toBe('https://advert-api.wildberries.ru/');
    expect(configuration.wb.writesEnabled).toBe(false);
    expect(configuration.sync).toMatchObject({
      currentBidFreshnessMinutes: 20,
      currentBidTargetSlaMinutes: 20,
      currentStateCron: '5 */15 * * * *',
      currentStateDeadlineMinutes: 10,
      minimumBidTargetSlaMinutes: 720,
      pageSize: 500,
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.wb)).toBe(true);
    expect(Object.isFrozen(configuration.sync)).toBe(true);
  });

  it('requires both the write flag and explicit production confirmation', () => {
    const withoutConfirmation = loadConfiguration({
      ...BASE_ENVIRONMENT,
      WB_API_WRITE_ENABLED: 'true',
    });
    const withConfirmation = loadConfiguration({
      ...BASE_ENVIRONMENT,
      WB_API_WRITE_ENABLED: 'true',
      WB_PRODUCTION_WRITE_CONFIRMATION: 'I_UNDERSTAND_WB_WRITES',
    });

    expect(withoutConfirmation.wb.writesEnabled).toBe(false);
    expect(withConfirmation.wb.writesEnabled).toBe(true);
  });

  it('forces Base token profiles to read-only', () => {
    const configuration = loadConfiguration({
      ...BASE_ENVIRONMENT,
      WB_API_WRITE_ENABLED: 'true',
      WB_EXPECTED_TOKEN_TYPE: 'BASE',
      WB_PRODUCTION_WRITE_CONFIRMATION: 'I_UNDERSTAND_WB_WRITES',
    });

    expect(configuration.wb.writesEnabled).toBe(false);
  });

  it.each([
    ['mock', 'http://wb-mock:3001', 'WB_API_MOCK_BASE_URL'],
    ['sandbox', 'https://advert-api-sandbox.wildberries.ru', 'WB_API_SANDBOX_BASE_URL'],
  ] as const)(
    'selects the %s URL and permits explicitly enabled non-production TEST writes',
    (mode, expectedUrl, urlField) => {
      const configuration = loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_MODE: mode,
        WB_API_WRITE_ENABLED: 'true',
        WB_EXPECTED_TOKEN_TYPE: 'TEST',
        [urlField]: expectedUrl,
      });

      expect(configuration.wb.baseUrl.href).toBe(`${expectedUrl}/`);
      expect(configuration.wb.writesEnabled).toBe(true);
    },
  );

  it('rejects a non-Test token in mock mode', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_MODE: 'mock',
      }),
    ).toThrow('Mock mode requires a synthetic TEST token profile');
  });

  it.each([
    ['http://advert-api.wildberries.ru', 'PERSONAL'],
    ['https://example.com', 'PERSONAL'],
    ['https://advert-api.wildberries.ru:8443', 'PERSONAL'],
    ['https://user:password@advert-api.wildberries.ru', 'PERSONAL'],
  ])('rejects unsafe production URL %s', (url, tokenType) => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_PROD_BASE_URL: url,
        WB_EXPECTED_TOKEN_TYPE: tokenType,
      }),
    ).toThrow(ConfigurationError);
  });

  it('rejects Test tokens in production and non-Test tokens in sandbox', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_EXPECTED_TOKEN_TYPE: 'TEST',
      }),
    ).toThrow('Production mode rejects a TEST token profile');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_MODE: 'sandbox',
      }),
    ).toThrow('Sandbox mode requires a TEST token profile');
  });

  it.each(['JPY', 'BHD', 'INVALID'])('rejects unsupported scale for %s', (currency) => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        ACCOUNT_CURRENCY: currency,
      }),
    ).toThrow(ConfigurationError);
  });

  it('rejects an invalid IANA timezone without disclosing values from other fields', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        ACCOUNT_TIMEZONE: 'Not/AZone',
      }),
    ).toThrow('ACCOUNT_TIMEZONE must be a valid IANA timezone');
  });

  it('reports only invalid field names for raw schema failures', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        ADMIN_API_SERVICE_TOKEN: 'secret',
      }),
    ).toThrow('Invalid startup configuration fields: ADMIN_API_SERVICE_TOKEN');
  });

  it('rejects example credentials and endpoint profiles absent from the artifact', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_TOKEN: 'missing-token',
      }),
    ).toThrow('WB_API_TOKEN must be supplied from a secret source');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_ENDPOINT_PROFILE_VERSION: 'unknown-profile',
      }),
    ).toThrow('WB_ENDPOINT_PROFILE_VERSION is not embedded in this artifact');
  });

  it('rejects incoherent scheduler deadlines, freshness, cron shape and rate JSON', () => {
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        CURRENT_STATE_SYNC_RUN_DEADLINE_MINUTES: '15',
      }),
    ).toThrow('must be less than the cron interval');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        CURRENT_BID_FRESHNESS_MINUTES: '10',
      }),
    ).toThrow('must not exceed current-bid freshness');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        CURRENT_STATE_SYNC_CRON: '* * * * *',
      }),
    ).toThrow('must contain six fields');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        CURRENT_STATE_SYNC_CRON: '5 */60 * * * *',
      }),
    ).toThrow('must be between 1 and 59');
    expect(
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        CURRENT_STATE_SYNC_CRON: '5 0 * * * *',
      }).sync.currentStateCron,
    ).toBe('5 0 * * * *');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_RATE_LIMITS_JSON: '{',
      }),
    ).toThrow('must be valid JSON');
    expect(() =>
      loadConfiguration({
        ...BASE_ENVIRONMENT,
        WB_API_RATE_LIMITS_JSON: '[]',
      }),
    ).toThrow('must be a JSON object');
  });
});

describe('loadMockConfiguration', () => {
  it('creates a deterministic virtual-clock configuration and ignores unrelated process keys', () => {
    const configuration = loadMockConfiguration({
      HOME: '/not/read',
      MOCK_CLOCK_MODE: 'virtual',
      MOCK_INITIAL_TIME: '2026-07-28T00:00:00.000Z',
      MOCK_SEED: 'foundation',
      PORT: '3001',
    });

    expect(configuration).toEqual({
      clockMode: 'virtual',
      initialTime: '2026-07-28T00:00:00.000Z',
      port: 3001,
      seed: 'foundation',
    });
  });

  it('rejects real time and malformed initial instants', () => {
    expect(() =>
      loadMockConfiguration({
        MOCK_CLOCK_MODE: 'real',
        MOCK_INITIAL_TIME: 'now',
        MOCK_SEED: 'foundation',
      }),
    ).toThrow(ConfigurationError);
  });
});
