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
  /** Structured logger level. */
  readonly logLevel: 'debug' | 'error' | 'fatal' | 'info' | 'silent' | 'trace' | 'warn';
  /** Production log serialization format. */
  readonly logFormat: 'json';
  /** Whether Prometheus metrics are exposed. */
  readonly metricsEnabled: boolean;
  /** HTTP port for the selected application. */
  readonly port: number;
  /** Whether scheduler jobs are registered. */
  readonly schedulerEnabled: boolean;
  /** Data synchronization schedules, evidence gates, and bounded page sizes. */
  readonly sync: {
    /** Current-state six-field cron. */
    readonly currentStateCron: string;
    /** Maximum wall time for one current-state run. */
    readonly currentStateDeadlineMs: number;
    /** Maximum current-bid observation age. */
    readonly currentBidFreshnessMinutes: number;
    /** Maximum full-pass SLA for current-bid observations. */
    readonly currentBidTargetSlaMinutes: number;
    /** Slow data-sync six-field cron. */
    readonly dataCron: string;
    /** Maximum age of the latest successful daily-statistics read. */
    readonly campaignStatisticsFreshnessMinutes: number;
    /** Full statistical days to wait for attribution. */
    readonly conversionLagDays: number;
    /** Stable source reads required before finalization. */
    readonly dayFinalizationStableReads: number;
    /** Minimum minutes spanned by stable finalization reads. */
    readonly dayFinalizationStableMinutes: number;
    /** Maximum accepted bid-state observation gap. */
    readonly bidStateMaxObservationGapMinutes: number;
    /** Minimum-bid freshness threshold. */
    readonly minimumBidFreshnessMinutes: number;
    /** Maximum full-pass SLA for minimum bids. */
    readonly minimumBidTargetSlaMinutes: number;
    /** Database page size; all sync paths remain bounded by this value. */
    readonly pageSize: number;
    /** Operator guarantee governing external bid provenance. */
    readonly externalWriteControlMode: 'EXCLUSIVE' | 'SHARED';
  };
  /** Write execution, verification, reconciliation, and retention controls. */
  readonly writePipeline: {
    readonly decisionCron: string;
    readonly campaignApplyCron: string;
    readonly verificationPollIntervalMs: number;
    readonly reconciliationCron: string;
    readonly verificationInitialDelayMs: number;
    readonly verificationTimeoutMs: number;
    readonly stableOldStateReads: number;
    readonly stableReadIntervalMs: number;
    readonly maximumWriteAttempts: number;
    readonly preByteMaximumRetries: number;
    readonly preWriteStateMaximumAgeMs: number;
    readonly maximumDecisionAgeMinutes: number;
    readonly experimentRevertDeadlineMs: number;
    readonly attemptRetentionDays: number;
  };
  /** Validated WB integration settings. */
  readonly wb: {
    /** Base URL selected for the current mode. */
    readonly baseUrl: URL;
    /** Connection establishment timeout in milliseconds. */
    readonly connectTimeoutMs: number;
    /** Pinned immutable endpoint-profile identifier. */
    readonly endpointProfileVersion: string;
    /** Account-wide request burst cap. */
    readonly globalRateLimitBurst: number;
    /** Account-wide request interval in milliseconds. */
    readonly globalRateLimitIntervalMs: number;
    /** Account-wide requests per interval. */
    readonly globalRateLimitRequests: number;
    /** Maximum simultaneous WB HTTP calls. */
    readonly maxInFlight: number;
    /** Maximum transport attempts for ordinary reads. */
    readonly readMaximumAttempts: number;
    /** Initial ordinary-read retry delay. */
    readonly readRetryBaseMs: number;
    /** Maximum ordinary-read retry delay. */
    readonly readRetryCapMs: number;
    /** Integration mode. */
    readonly mode: WbApiMode;
    /** Operator endpoint override JSON, checked again against the embedded profile. */
    readonly rateLimitOverrides: Readonly<Record<string, unknown>>;
    /** Per-attempt total HTTP timeout in milliseconds. */
    readonly timeoutMs: number;
    /** Secret token used only at the transport boundary. */
    readonly token: string;
    /** Expected decoded token type. */
    readonly tokenType: WbTokenType;
    /** Advance warning window for token expiry. */
    readonly tokenExpiryWarningDays: number;
    /** Maximum transport attempts in one verification poll. */
    readonly verificationHttpMaximumAttempts: number;
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
  LOG_FORMAT: z.literal('json').default('json'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  METRICS_ENABLED: booleanFromString,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SCHEDULER_ENABLED: booleanFromString,
  BID_STATE_MAX_OBSERVATION_GAP_MINUTES: z.coerce.number().int().min(1).max(1_440).default(20),
  CONVERSION_LAG_DAYS: z.coerce.number().int().min(0).max(30).default(1),
  CURRENT_BID_FRESHNESS_MINUTES: z.coerce.number().int().min(1).max(1_440).default(20),
  CURRENT_STATE_SYNC_CRON: z.string().trim().min(1).default('5 */15 * * * *'),
  CURRENT_STATE_SYNC_RUN_DEADLINE_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(86_400_000)
    .default(600_000),
  CURRENT_STATE_TARGET_SYNC_SLA_MINUTES: z.coerce.number().int().min(1).max(1_440).default(20),
  DATA_SYNC_CRON: z.string().trim().min(1).default('25 */30 * * * *'),
  CAMPAIGN_STATISTICS_FRESHNESS_MINUTES: z.coerce.number().int().min(1).max(43_200).default(180),
  DECISION_CRON: z.string().trim().min(1).default('45 */30 * * * *'),
  DAY_FINALIZATION_MIN_STABLE_MINUTES: z.coerce.number().int().min(0).max(10_080).default(60),
  DAY_FINALIZATION_MIN_STABLE_READS: z.coerce.number().int().min(2).max(100).default(2),
  EXTERNAL_WRITE_CONTROL_MODE: z.enum(['EXCLUSIVE', 'SHARED']).default('SHARED'),
  CAMPAIGN_APPLY_CRON: z.string().trim().min(1).default('*/10 * * * * *'),
  VERIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
  RECONCILIATION_CRON: z.string().trim().min(1).default('15 * * * * *'),
  BID_VERIFICATION_INITIAL_DELAY_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(3_600_000)
    .default(30_000),
  BID_VERIFICATION_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(600_000),
  RECONCILIATION_STABLE_OLD_STATE_READS: z.coerce.number().int().min(2).max(10).default(2),
  RECONCILIATION_STABLE_READ_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(30_000),
  RECONCILIATION_MAX_WRITE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(2),
  WB_WRITE_PRE_BYTE_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
  PRE_WRITE_STATE_MAX_AGE_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  MAX_DECISION_AGE_MINUTES: z.coerce.number().int().min(1).max(10_080).default(60),
  EXPERIMENT_REVERT_DEADLINE_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(604_800_000)
    .default(86_400_000),
  WB_WRITE_ATTEMPT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(30),
  MINIMUM_BID_FRESHNESS_MINUTES: z.coerce.number().int().min(1).max(43_200).default(720),
  MINIMUM_BID_TARGET_SYNC_SLA_MINUTES: z.coerce.number().int().min(1).max(43_200).default(720),
  WB_API_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
  WB_API_GLOBAL_RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(1_000).default(5),
  WB_API_GLOBAL_RATE_LIMIT_INTERVAL_MS: z.coerce.number().int().min(1).max(60_000).default(1_000),
  WB_API_GLOBAL_RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(1_000).default(5),
  WB_API_MAX_IN_FLIGHT: z.coerce.number().int().min(1).max(100).default(5),
  WB_API_MOCK_BASE_URL: z.url().default('http://wb-mock:3001'),
  WB_API_MODE: z.enum(['mock', 'sandbox', 'prod']).default('mock'),
  WB_API_PROD_BASE_URL: z.url().default('https://advert-api.wildberries.ru'),
  WB_API_RATE_LIMITS_JSON: z.string().default('{}'),
  WB_API_SANDBOX_BASE_URL: z.url().default('https://advert-api-sandbox.wildberries.ru'),
  WB_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(15_000),
  WB_API_TOKEN: z.string().min(1),
  WB_API_WRITE_ENABLED: booleanFromString,
  WB_ENDPOINT_PROFILE_VERSION: z.string().min(1),
  WB_EXPECTED_TOKEN_TYPE: z.enum(['PERSONAL', 'TEST', 'BASE']),
  WB_PRODUCTION_WRITE_CONFIRMATION: z.string().default(''),
  WB_TOKEN_EXPIRY_WARN_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  WB_READ_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  WB_READ_RETRY_BASE_MS: z.coerce.number().int().min(1).max(60_000).default(250),
  WB_READ_RETRY_CAP_MS: z.coerce.number().int().min(1).max(120_000).default(5_000),
  WB_VERIFY_HTTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(2),
  SYNC_PAGE_SIZE: z.coerce.number().int().min(1).max(5_000).default(500),
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
  const rateLimitOverrides = parseRateLimitOverrides(value.WB_API_RATE_LIMITS_JSON);
  validateSyncInvariants(value);

  return Object.freeze({
    accountCurrency: value.ACCOUNT_CURRENCY,
    accountTimezone: value.ACCOUNT_TIMEZONE,
    adminApiServiceToken: value.ADMIN_API_SERVICE_TOKEN,
    databaseUrl: value.DATABASE_URL,
    logFormat: value.LOG_FORMAT,
    logLevel: value.LOG_LEVEL,
    metricsEnabled: value.METRICS_ENABLED,
    port: value.PORT,
    schedulerEnabled: value.SCHEDULER_ENABLED,
    sync: Object.freeze({
      bidStateMaxObservationGapMinutes: value.BID_STATE_MAX_OBSERVATION_GAP_MINUTES,
      conversionLagDays: value.CONVERSION_LAG_DAYS,
      currentBidFreshnessMinutes: value.CURRENT_BID_FRESHNESS_MINUTES,
      currentBidTargetSlaMinutes: value.CURRENT_STATE_TARGET_SYNC_SLA_MINUTES,
      currentStateCron: value.CURRENT_STATE_SYNC_CRON,
      currentStateDeadlineMs: value.CURRENT_STATE_SYNC_RUN_DEADLINE_MS,
      dataCron: value.DATA_SYNC_CRON,
      campaignStatisticsFreshnessMinutes: value.CAMPAIGN_STATISTICS_FRESHNESS_MINUTES,
      dayFinalizationStableMinutes: value.DAY_FINALIZATION_MIN_STABLE_MINUTES,
      dayFinalizationStableReads: value.DAY_FINALIZATION_MIN_STABLE_READS,
      externalWriteControlMode: value.EXTERNAL_WRITE_CONTROL_MODE,
      minimumBidFreshnessMinutes: value.MINIMUM_BID_FRESHNESS_MINUTES,
      minimumBidTargetSlaMinutes: value.MINIMUM_BID_TARGET_SYNC_SLA_MINUTES,
      pageSize: value.SYNC_PAGE_SIZE,
    }),
    writePipeline: Object.freeze({
      attemptRetentionDays: value.WB_WRITE_ATTEMPT_RETENTION_DAYS,
      campaignApplyCron: value.CAMPAIGN_APPLY_CRON,
      decisionCron: value.DECISION_CRON,
      experimentRevertDeadlineMs: value.EXPERIMENT_REVERT_DEADLINE_MS,
      maximumDecisionAgeMinutes: value.MAX_DECISION_AGE_MINUTES,
      maximumWriteAttempts: value.RECONCILIATION_MAX_WRITE_ATTEMPTS,
      preByteMaximumRetries: value.WB_WRITE_PRE_BYTE_MAX_RETRIES,
      preWriteStateMaximumAgeMs: value.PRE_WRITE_STATE_MAX_AGE_MS,
      reconciliationCron: value.RECONCILIATION_CRON,
      stableOldStateReads: value.RECONCILIATION_STABLE_OLD_STATE_READS,
      stableReadIntervalMs: value.RECONCILIATION_STABLE_READ_INTERVAL_MS,
      verificationInitialDelayMs: value.BID_VERIFICATION_INITIAL_DELAY_MS,
      verificationPollIntervalMs: value.VERIFICATION_POLL_INTERVAL_MS,
      verificationTimeoutMs: value.BID_VERIFICATION_TIMEOUT_MS,
    }),
    wb: Object.freeze({
      baseUrl,
      connectTimeoutMs: value.WB_API_CONNECT_TIMEOUT_MS,
      endpointProfileVersion: value.WB_ENDPOINT_PROFILE_VERSION,
      globalRateLimitBurst: value.WB_API_GLOBAL_RATE_LIMIT_BURST,
      globalRateLimitIntervalMs: value.WB_API_GLOBAL_RATE_LIMIT_INTERVAL_MS,
      globalRateLimitRequests: value.WB_API_GLOBAL_RATE_LIMIT_REQUESTS,
      maxInFlight: value.WB_API_MAX_IN_FLIGHT,
      mode: value.WB_API_MODE,
      readMaximumAttempts: value.WB_READ_MAX_ATTEMPTS,
      readRetryBaseMs: value.WB_READ_RETRY_BASE_MS,
      readRetryCapMs: value.WB_READ_RETRY_CAP_MS,
      rateLimitOverrides,
      timeoutMs: value.WB_API_TIMEOUT_MS,
      token: value.WB_API_TOKEN,
      tokenExpiryWarningDays: value.WB_TOKEN_EXPIRY_WARN_DAYS,
      tokenType: value.WB_EXPECTED_TOKEN_TYPE,
      verificationHttpMaximumAttempts: value.WB_VERIFY_HTTP_MAX_ATTEMPTS,
      writesEnabled,
    }),
  });
}

/**
 * Enforces schedule, freshness, and evidence ordering before scheduler registration.
 *
 * @param value - Parsed application environment.
 * @returns Nothing when synchronization invariants are coherent.
 * @throws {ConfigurationError} When a deadline or SLA cannot preserve current-state coverage.
 */
function validateSyncInvariants(value: z.infer<typeof rawSchema>): void {
  const currentStateIntervalMinutes = inferSimpleMinuteInterval(value.CURRENT_STATE_SYNC_CRON);
  if (
    currentStateIntervalMinutes !== null &&
    value.CURRENT_STATE_SYNC_RUN_DEADLINE_MS >= currentStateIntervalMinutes * 60_000
  ) {
    throw new ConfigurationError(
      'CURRENT_STATE_SYNC_RUN_DEADLINE_MS must be less than the cron interval',
    );
  }
  if (
    value.CURRENT_STATE_TARGET_SYNC_SLA_MINUTES > value.CURRENT_BID_FRESHNESS_MINUTES ||
    value.BID_STATE_MAX_OBSERVATION_GAP_MINUTES > value.CURRENT_BID_FRESHNESS_MINUTES
  ) {
    throw new ConfigurationError(
      'Current-state SLA and observation gap must not exceed current-bid freshness',
    );
  }
  for (const expression of [
    value.DATA_SYNC_CRON,
    value.DECISION_CRON,
    value.CAMPAIGN_APPLY_CRON,
    value.RECONCILIATION_CRON,
  ]) {
    inferSimpleMinuteInterval(expression);
  }
  if (value.WB_READ_RETRY_BASE_MS > value.WB_READ_RETRY_CAP_MS) {
    throw new ConfigurationError('WB_READ_RETRY_BASE_MS must not exceed WB_READ_RETRY_CAP_MS');
  }
  if (value.BID_VERIFICATION_INITIAL_DELAY_MS >= value.BID_VERIFICATION_TIMEOUT_MS) {
    throw new ConfigurationError(
      'BID_VERIFICATION_INITIAL_DELAY_MS must be less than BID_VERIFICATION_TIMEOUT_MS',
    );
  }
  const minimumReconciliationWindowMs =
    value.BID_VERIFICATION_INITIAL_DELAY_MS +
    value.RECONCILIATION_STABLE_READ_INTERVAL_MS *
      (value.RECONCILIATION_STABLE_OLD_STATE_READS - 1);
  if (minimumReconciliationWindowMs >= value.BID_VERIFICATION_TIMEOUT_MS) {
    throw new ConfigurationError(
      'BID_VERIFICATION_TIMEOUT_MS must include the stable-read reconciliation window',
    );
  }
  if (value.WB_WRITE_ATTEMPT_RETENTION_DAYS * 86_400_000 <= value.BID_VERIFICATION_TIMEOUT_MS) {
    throw new ConfigurationError(
      'WB_WRITE_ATTEMPT_RETENTION_DAYS must exceed the verification/reconciliation window',
    );
  }
}

/**
 * Reads the interval from the supported six-field star-slash minute schedule.
 *
 * Other valid cron forms remain operator-managed and return null.
 *
 * @param expression - Six-field cron expression.
 * @returns Minute interval or null for a non-simple schedule.
 */
function inferSimpleMinuteInterval(expression: string): number | null {
  const fields = expression.trim().split(/\s+/u);
  if (fields.length !== 6) {
    throw new ConfigurationError('Scheduler cron values must contain six fields');
  }
  const match = /^\*\/(\d+)$/.exec(fields[1] ?? '');
  if (match === null) {
    return null;
  }
  const minutes = Number(match[1]);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) {
    throw new ConfigurationError('Scheduler cron minute interval must be between 1 and 59');
  }
  return minutes;
}

/**
 * Parses endpoint override JSON without accepting arrays or primitives.
 *
 * Semantic strictness against the embedded profile is enforced by the WB rate-limit module.
 *
 * @param source - Operator JSON text.
 * @returns Frozen plain-object overrides.
 * @throws {ConfigurationError} When JSON is malformed or not an object.
 */
function parseRateLimitOverrides(source: string): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ConfigurationError('WB_API_RATE_LIMITS_JSON must be valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigurationError('WB_API_RATE_LIMITS_JSON must be a JSON object');
  }
  return Object.freeze({ ...value });
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
