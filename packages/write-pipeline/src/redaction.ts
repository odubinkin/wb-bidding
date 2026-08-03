const SENSITIVE_KEY = /authorization|cookie|token|secret|password|credential|api[-_]?key/i;

/**
 * Deeply redacts known credential fields before persistence or API serialization.
 *
 * @param value Value to validate, transform, or persist.
 * @returns Result produced by the redact secrets operation.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSecrets(entry),
      ]),
    );
  }
  return value;
}
