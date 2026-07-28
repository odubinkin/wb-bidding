import { z } from 'zod';

/**
 * WB runtime integration mode.
 */
export type WbApiMode = 'mock' | 'prod' | 'sandbox';

/**
 * Token profile understood by the self-hosted deployment.
 */
export type WbTokenType = 'BASE' | 'PERSONAL' | 'TEST';

/**
 * Fully validated immutable application configuration.
 */
export interface AppConfiguration {
  /** ISO 4217 account currency with exactly two fractional digits. */
  readonly accountCurrency: string;
  /** IANA timezone provisioned by the operator. */
  readonly accountTimezone: string;
  /** Service token protecting the internal Admin API. */
  readonly adminApiServiceToken: string;
  /** PostgreSQL connection string. */
  readonly databaseUrl: string;
  /** Whether Prometheus metrics are exposed. */
  readonly metricsEnabled: boolean;
  /** HTTP port for the selected application. */
  readonly port: number;
  /** Whether scheduler jobs are registered. */
  readonly schedulerEnabled: boolean;
  /** Validated WB integration settings. */
  readonly wb: {
    /** Base URL selected for the current mode. */
    readonly baseUrl: URL;
    /** Pinned immutable endpoint-profile identifier. */
    readonly endpointProfileVersion: string;
    /** Integration mode. */
    readonly mode: WbApiMode;
    /** Secret token used only at the transport boundary. */
    readonly token: string;
    /** Expected decoded token type. */
    readonly tokenType: WbTokenType;
    /** Effective write gate after all startup invariants. */
    readonly writesEnabled: boolean;
  };
}

/**
 * Validated configuration for the standalone deterministic mock.
 */
export interface MockConfiguration {
  /** Clock mode; CI and E2E only support virtual time. */
  readonly clockMode: 'virtual';
  /** Initial deterministic RFC 3339 instant. */
  readonly initialTime: string;
  /** HTTP port for the mock application. */
  readonly port: number;
  /** Seed scenario identifier. */
  readonly seed: string;
}

/**
 * Raised when startup configuration is missing, malformed, or unsafe.
 */
export class ConfigurationError extends Error {
  /**
   * Creates a fail-closed configuration error without including secret values.
   *
   * @param message - Redacted diagnostic suitable for startup logs.
   */
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const rawSchema = z.object({
  ACCOUNT_CURRENCY: z.string().trim().toUpperCase(),
  ACCOUNT_TIMEZONE: z.string().trim(),
  ADMIN_API_SERVICE_TOKEN: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('replace-')),
  DATABASE_URL: z
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  METRICS_ENABLED: booleanFromString,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SCHEDULER_ENABLED: booleanFromString,
  WB_API_MOCK_BASE_URL: z.url().default('http://wb-mock:3001'),
  WB_API_MODE: z.enum(['mock', 'sandbox', 'prod']).default('mock'),
  WB_API_PROD_BASE_URL: z.url().default('https://advert-api.wildberries.ru'),
  WB_API_SANDBOX_BASE_URL: z.url().default('https://advert-api-sandbox.wildberries.ru'),
  WB_API_TOKEN: z.string().min(1),
  WB_API_WRITE_ENABLED: booleanFromString,
  WB_ENDPOINT_PROFILE_VERSION: z.string().min(1),
  WB_EXPECTED_TOKEN_TYPE: z.enum(['PERSONAL', 'TEST', 'BASE']),
  WB_PRODUCTION_WRITE_CONFIRMATION: z.string().default(''),
});

const mockRawSchema = z.object({
  MOCK_CLOCK_MODE: z.literal('virtual').default('virtual'),
  MOCK_INITIAL_TIME: z.iso.datetime({ offset: true }),
  MOCK_SEED: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
});

/**
 * Loads and validates startup configuration without mutating the supplied environment.
 *
 * @param environment - Process-like key/value map. Secret values are never copied to errors.
 * @returns Frozen configuration whose write flag already incorporates mode and token-type gates.
 * @throws {ConfigurationError} When any required value or cross-field invariant is invalid.
 */
export function loadConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): AppConfiguration {
  const parsed = rawSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'environment')
      .sort()
      .join(', ');
    throw new ConfigurationError(`Invalid startup configuration fields: ${fields}`);
  }

  const value = parsed.data;
  validateCurrency(value.ACCOUNT_CURRENCY);
  validateTimezone(value.ACCOUNT_TIMEZONE);

  const baseUrl = selectBaseUrl(value);
  validateModeAndToken(value.WB_API_MODE, value.WB_EXPECTED_TOKEN_TYPE);
  validateBaseUrl(value.WB_API_MODE, baseUrl);
  validateEndpointProfile(value.WB_ENDPOINT_PROFILE_VERSION);
  validateTokenPlaceholder(value.WB_API_MODE, value.WB_API_TOKEN);

  const writesEnabled = calculateWriteGate(value);

  return Object.freeze({
    accountCurrency: value.ACCOUNT_CURRENCY,
    accountTimezone: value.ACCOUNT_TIMEZONE,
    adminApiServiceToken: value.ADMIN_API_SERVICE_TOKEN,
    databaseUrl: value.DATABASE_URL,
    metricsEnabled: value.METRICS_ENABLED,
    port: value.PORT,
    schedulerEnabled: value.SCHEDULER_ENABLED,
    wb: Object.freeze({
      baseUrl,
      endpointProfileVersion: value.WB_ENDPOINT_PROFILE_VERSION,
      mode: value.WB_API_MODE,
      token: value.WB_API_TOKEN,
      tokenType: value.WB_EXPECTED_TOKEN_TYPE,
      writesEnabled,
    }),
  });
}

/**
 * Loads configuration for the independent in-memory WB mock.
 *
 * @param environment - Process-like key/value map with no production credentials.
 * @returns Frozen deterministic mock configuration.
 * @throws {ConfigurationError} When virtual time, seed, port, or initial time is invalid.
 */
export function loadMockConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): MockConfiguration {
  const parsed = mockRawSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'environment')
      .sort()
      .join(', ');
    throw new ConfigurationError(`Invalid mock configuration fields: ${fields}`);
  }
  return Object.freeze({
    clockMode: parsed.data.MOCK_CLOCK_MODE,
    initialTime: parsed.data.MOCK_INITIAL_TIME,
    port: parsed.data.PORT,
    seed: parsed.data.MOCK_SEED,
  });
}

/**
 * Confirms that the runtime recognizes a currency and that it has scale two.
 *
 * @param currency - Uppercase ISO 4217 candidate.
 * @returns Nothing when the currency is supported.
 * @throws {ConfigurationError} When the code is unknown or does not have scale two.
 */
function validateCurrency(currency: string): void {
  try {
    const options = new Intl.NumberFormat('en', {
      currency,
      style: 'currency',
    }).resolvedOptions();
    if (
      currency.length !== 3 ||
      options.minimumFractionDigits !== 2 ||
      options.maximumFractionDigits !== 2
    ) {
      throw new ConfigurationError('ACCOUNT_CURRENCY must be an ISO 4217 currency with scale 2');
    }
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError('ACCOUNT_CURRENCY must be an ISO 4217 currency with scale 2');
  }
}

/**
 * Confirms that the configured account timezone is an IANA timezone.
 *
 * @param timezone - Operator-provisioned timezone.
 * @returns Nothing when Intl accepts the timezone.
 * @throws {ConfigurationError} When the timezone is invalid.
 */
function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0);
  } catch {
    throw new ConfigurationError('ACCOUNT_TIMEZONE must be a valid IANA timezone');
  }
}

/**
 * Chooses the mode-specific base URL after raw schema validation.
 *
 * @param value - Parsed environment object.
 * @returns URL corresponding to the selected WB mode.
 */
function selectBaseUrl(value: z.infer<typeof rawSchema>): URL {
  switch (value.WB_API_MODE) {
    case 'mock':
      return new URL(value.WB_API_MOCK_BASE_URL);
    case 'sandbox':
      return new URL(value.WB_API_SANDBOX_BASE_URL);
    case 'prod':
      return new URL(value.WB_API_PROD_BASE_URL);
  }
}

/**
 * Enforces the token-type matrix before any integration component starts.
 *
 * @param mode - Selected environment.
 * @param tokenType - Expected token profile.
 * @returns Nothing when the pairing is permitted.
 * @throws {ConfigurationError} When the pairing can reinterpret credentials across environments.
 */
function validateModeAndToken(mode: WbApiMode, tokenType: WbTokenType): void {
  if (mode === 'sandbox' && tokenType !== 'TEST') {
    throw new ConfigurationError('Sandbox mode requires a TEST token profile');
  }
  if (mode === 'prod' && tokenType === 'TEST') {
    throw new ConfigurationError('Production mode rejects a TEST token profile');
  }
  if (mode === 'mock' && tokenType !== 'TEST') {
    throw new ConfigurationError('Mock mode requires a synthetic TEST token profile');
  }
}

/**
 * Rejects production URL overrides, credentials in URLs, redirects by configuration, and ports.
 *
 * @param mode - Selected environment.
 * @param url - Parsed mode-specific base URL.
 * @returns Nothing when the URL is safe for the mode.
 * @throws {ConfigurationError} When a production host or general URL invariant is unsafe.
 */
function validateBaseUrl(mode: WbApiMode, url: URL): void {
  if (url.username !== '' || url.password !== '') {
    throw new ConfigurationError('WB API base URL must not contain credentials');
  }
  if (mode === 'prod') {
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'advert-api.wildberries.ru' ||
      url.port !== '' ||
      url.pathname !== '/'
    ) {
      throw new ConfigurationError('Production WB API URL must be the official HTTPS origin');
    }
  }
}

/**
 * Rejects configuration that refers to an endpoint profile absent from the artifact.
 *
 * @param profileId - Operator-selected immutable profile identifier.
 * @returns Nothing when the artifact contains the profile.
 * @throws {ConfigurationError} When the profile cannot supply schemas and safety gates.
 */
function validateEndpointProfile(profileId: string): void {
  if (profileId !== 'wb-promotion-2026-07-28-v1') {
    throw new ConfigurationError('WB_ENDPOINT_PROFILE_VERSION is not embedded in this artifact');
  }
}

/**
 * Prevents deployment examples from being mistaken for usable external credentials.
 *
 * @param mode - Selected integration environment.
 * @param token - Secret value inspected only for exact known placeholders.
 * @returns Nothing for mock or a non-placeholder external token.
 * @throws {ConfigurationError} When sandbox or production still uses a documented placeholder.
 */
function validateTokenPlaceholder(mode: WbApiMode, token: string): void {
  if (mode !== 'mock' && (token === 'missing-token' || token.startsWith('replace-'))) {
    throw new ConfigurationError('WB_API_TOKEN must be supplied from a secret source');
  }
}

/**
 * Computes the effective write gate from all Stage 0 safety flags.
 *
 * @param value - Parsed environment object.
 * @returns True only when the selected mode and explicit flags permit writes.
 */
function calculateWriteGate(value: z.infer<typeof rawSchema>): boolean {
  if (!value.WB_API_WRITE_ENABLED || value.WB_EXPECTED_TOKEN_TYPE === 'BASE') {
    return false;
  }
  if (value.WB_API_MODE === 'prod') {
    return (
      value.WB_EXPECTED_TOKEN_TYPE === 'PERSONAL' &&
      value.WB_PRODUCTION_WRITE_CONFIRMATION === 'I_UNDERSTAND_WB_WRITES'
    );
  }
  return true;
}
