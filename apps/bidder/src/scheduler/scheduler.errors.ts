/**
 * Reduces an arbitrary scheduler failure to a bounded stable code.
 *
 * @param error - Unknown scheduler failure.
 * @returns Stable public error code.
 */
export function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as Readonly<{ code?: unknown }>).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,80}$/u.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Z0-9_]{2,80}$/u.test(error.message)) return error.message;
  return 'JOB_FAILED';
}
