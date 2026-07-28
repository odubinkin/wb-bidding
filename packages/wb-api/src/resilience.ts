import type { EndpointGroup } from './endpoint-registry.js';

/**
 * Stable error classes used by retry, breaker, metrics, and audit logic.
 */
export type WbErrorCode =
  | 'AUTH'
  | 'BILLING_PROFILE_ANOMALY'
  | 'CAPABILITY'
  | 'CONFLICT'
  | 'CONTRACT'
  | 'PAYLOAD'
  | 'RATE_LIMIT'
  | 'REMOTE_UNAVAILABLE'
  | 'RESOURCE_NOT_FOUND'
  | 'TRANSPORT_PRE_BYTE'
  | 'WRITE_OUTCOME_UNKNOWN';

/**
 * Structured WB failure safe for logs and higher-level state machines.
 */
export class WbApiError extends Error {
  /**
   * Creates a classified error without retaining credentials or full payloads.
   *
   * @param code - Stable behavior class.
   * @param message - Redacted explanation.
   * @param status - HTTP status when a response exists.
   * @param retryable - Whether the same operation can enter bounded retry.
   */
  public constructor(
    public readonly code: WbErrorCode,
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'WbApiError';
  }
}

/**
 * Circuit breaker state.
 */
export type CircuitState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

/**
 * Immutable snapshot for readiness and metrics.
 */
export interface CircuitSnapshot {
  /** Consecutive availability failures. */
  readonly consecutiveFailures: number;
  /** Current breaker state. */
  readonly state: CircuitState;
  /** Epoch millisecond at which a half-open probe may run. */
  readonly retryAtMs: number | null;
}

/**
 * Per-group auth and availability circuit breaker.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private state: CircuitState = 'CLOSED';

  /**
   * Creates an availability breaker.
   *
   * @param failureThreshold - Consecutive 5xx/timeout failures before opening.
   * @param resetAfterMs - Cooldown before one half-open probe.
   * @param now - Epoch millisecond provider.
   */
  public constructor(
    private readonly failureThreshold = 5,
    private readonly resetAfterMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {
    if (failureThreshold < 1 || resetAfterMs < 1) {
      throw new Error('Circuit breaker thresholds must be positive');
    }
  }

  /**
   * Checks whether a request may proceed.
   *
   * @returns Nothing when closed or when granting one half-open probe.
   * @throws {WbApiError} While the breaker remains open.
   */
  public assertRequestAllowed(): void {
    if (
      this.state === 'OPEN' &&
      this.openedAtMs !== null &&
      this.now() - this.openedAtMs >= this.resetAfterMs
    ) {
      this.state = 'HALF_OPEN';
      return;
    }
    if (this.state !== 'CLOSED') {
      throw new WbApiError('REMOTE_UNAVAILABLE', 'WB endpoint group circuit is open', null, false);
    }
  }

  /**
   * Closes the breaker after a successful request or half-open probe.
   *
   * @returns Nothing.
   */
  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
    this.state = 'CLOSED';
  }

  /**
   * Records a classified failure.
   *
   * Auth/capability failures open immediately; availability errors use the threshold.
   *
   * @param error - Classified WB failure.
   * @returns Nothing.
   */
  public recordFailure(error: WbApiError): void {
    if (error.code === 'AUTH' || error.code === 'CAPABILITY') {
      this.open();
      return;
    }
    if (error.code !== 'REMOTE_UNAVAILABLE' && error.code !== 'TRANSPORT_PRE_BYTE') {
      return;
    }
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.open();
    }
  }

  /**
   * Returns an immutable readiness snapshot.
   *
   * @returns Current breaker state without side effects.
   */
  public snapshot(): CircuitSnapshot {
    return Object.freeze({
      consecutiveFailures: this.consecutiveFailures,
      retryAtMs: this.openedAtMs === null ? null : this.openedAtMs + this.resetAfterMs,
      state: this.state,
    });
  }

  /**
   * Opens the breaker at the current instant.
   *
   * @returns Nothing.
   */
  private open(): void {
    this.openedAtMs = this.now();
    this.state = 'OPEN';
  }
}

/**
 * Breaker registry isolating each endpoint group.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<EndpointGroup, CircuitBreaker>();

  /**
   * Creates one breaker per known endpoint group.
   *
   * @param factory - Optional deterministic breaker factory.
   */
  public constructor(factory: () => CircuitBreaker = () => new CircuitBreaker()) {
    for (const group of ['auth', 'campaigns', 'finance', 'statistics', 'writes'] as const) {
      this.breakers.set(group, factory());
    }
  }

  /**
   * Returns the breaker for one endpoint group.
   *
   * @param group - Registry group.
   * @returns Stable breaker instance.
   */
  public forGroup(group: EndpointGroup): CircuitBreaker {
    const breaker = this.breakers.get(group);
    if (breaker === undefined) {
      throw new Error(`Unknown circuit breaker group: ${group}`);
    }
    return breaker;
  }

  /**
   * Returns bounded snapshots for every fixed endpoint group.
   *
   * @returns Immutable map suitable for readiness and low-cardinality metrics.
   */
  public snapshots(): Readonly<Record<EndpointGroup, CircuitSnapshot>> {
    return Object.freeze({
      auth: this.forGroup('auth').snapshot(),
      campaigns: this.forGroup('campaigns').snapshot(),
      finance: this.forGroup('finance').snapshot(),
      statistics: this.forGroup('statistics').snapshot(),
      writes: this.forGroup('writes').snapshot(),
    });
  }
}

/**
 * Bounded retry configuration.
 */
export interface RetryPolicy {
  /** Maximum backoff before jitter in milliseconds. */
  readonly capMs: number;
  /** First exponential backoff in milliseconds. */
  readonly baseMs: number;
  /** Total deadline across all attempts and waits. */
  readonly deadlineMs: number;
  /** Maximum HTTP attempts including the first call. */
  readonly maxAttempts: number;
}

/**
 * Context supplied to each bounded attempt.
 */
export interface RetryAttempt {
  /** One-based attempt number. */
  readonly attempt: number;
  /** Remaining deadline in milliseconds. */
  readonly remainingMs: number;
}

/**
 * Executes a retryable operation with exponential backoff and full jitter.
 *
 * @template T - Successful result.
 * @param operation - Attempt callback; it must throw WbApiError on expected failures.
 * @param policy - Bounded attempt and deadline policy.
 * @param random - Uniform [0,1) source, injected for deterministic tests.
 * @param now - Monotonic-ish epoch millisecond provider.
 * @param sleep - Delay function.
 * @returns Successful operation result.
 * @throws {WbApiError} On terminal failure or exhaustion.
 */
export async function withBoundedRetry<T>(
  operation: (context: RetryAttempt) => Promise<T>,
  policy: RetryPolicy,
  random: () => number = Math.random,
  now: () => number = Date.now,
  sleep: (milliseconds: number) => Promise<void> = sleepFor,
): Promise<T> {
  validateRetryPolicy(policy);
  const startedAt = now();
  let lastError: WbApiError | null = null;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const elapsed = now() - startedAt;
    const remainingMs = policy.deadlineMs - elapsed;
    if (remainingMs <= 0) {
      break;
    }
    try {
      return await operation({ attempt, remainingMs });
    } catch (error: unknown) {
      if (!(error instanceof WbApiError) || !error.retryable) {
        throw error;
      }
      lastError = error;
      if (attempt === policy.maxAttempts) {
        break;
      }
      const exponential = Math.min(policy.capMs, policy.baseMs * 2 ** (attempt - 1));
      const delay = Math.floor(random() * exponential);
      if (delay >= policy.deadlineMs - (now() - startedAt)) {
        break;
      }
      await sleep(delay);
    }
  }
  throw (
    lastError ?? new WbApiError('REMOTE_UNAVAILABLE', 'WB retry deadline exhausted', null, false)
  );
}

/**
 * Classifies an HTTP failure according to the WB integration table.
 *
 * @param status - HTTP status.
 * @param operation - Read or write boundary.
 * @param dispatchPossible - Whether write bytes may have reached the peer.
 * @param responseText - Bounded redacted response excerpt used only for 403/409 classification.
 * @returns Stable error.
 */
export function classifyHttpFailure(
  status: number,
  operation: 'read' | 'verify' | 'write',
  dispatchPossible: boolean,
  responseText: string,
): WbApiError {
  if (status === 400 || status === 422) {
    return new WbApiError(
      'PAYLOAD',
      `WB rejected payload with HTTP ${String(status)}`,
      status,
      false,
    );
  }
  if (status === 401) {
    return new WbApiError('AUTH', 'WB authorization failed', status, false);
  }
  if (status === 402) {
    return new WbApiError(
      'BILLING_PROFILE_ANOMALY',
      'WB API service billing/profile anomaly',
      status,
      false,
    );
  }
  if (status === 403) {
    const capability = /token|categor|read.?only|access|permission|authoriz/i.test(responseText);
    return new WbApiError(
      capability ? 'CAPABILITY' : 'PAYLOAD',
      capability ? 'WB token capability denied' : 'WB operation forbidden for payload',
      status,
      false,
    );
  }
  if (status === 404) {
    return new WbApiError(
      'RESOURCE_NOT_FOUND',
      'WB resource or profile path was not found',
      status,
      false,
    );
  }
  if (status === 409) {
    const temporary = /tempor|retry|later|rate/i.test(responseText);
    return new WbApiError(
      'CONFLICT',
      'WB returned a classified conflict',
      status,
      temporary && operation !== 'write',
    );
  }
  if (status === 413) {
    return new WbApiError('CONTRACT', 'WB rejected request batch size', status, false);
  }
  if (status === 429) {
    return new WbApiError('RATE_LIMIT', 'WB account quota exhausted', status, true);
  }
  if (status >= 500) {
    if (operation === 'write' && dispatchPossible) {
      return new WbApiError(
        'WRITE_OUTCOME_UNKNOWN',
        'WB write outcome is unknown after dispatch',
        status,
        false,
      );
    }
    return new WbApiError('REMOTE_UNAVAILABLE', 'WB endpoint is unavailable', status, true);
  }
  return new WbApiError('CONTRACT', `Unexpected WB HTTP ${String(status)}`, status, false);
}

/**
 * Validates retry policy invariants.
 *
 * @param policy - Candidate policy.
 * @returns Nothing when valid.
 */
function validateRetryPolicy(policy: RetryPolicy): void {
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.baseMs < 1 ||
    policy.capMs < policy.baseMs ||
    policy.deadlineMs < 1
  ) {
    throw new Error('Retry policy is invalid');
  }
}

/**
 * Real-time delay used by production retries.
 *
 * @param milliseconds - Non-negative delay.
 * @returns Promise resolving after the delay.
 */
async function sleepFor(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
