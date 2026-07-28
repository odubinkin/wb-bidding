/**
 * Formats an instant as an ISO calendar date in the account timezone.
 *
 * @param timezone - Valid IANA timezone.
 * @param instant - Instant to format.
 * @returns Account-local `YYYY-MM-DD`.
 * @throws {RangeError} When the instant or timezone is invalid.
 */
export function formatAccountLocalDate(timezone: string, instant: Date): string {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('Account-local date instant is invalid');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = values.year;
  const month = values.month;
  const day = values.day;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day)
  ) {
    throw new RangeError('Account-local date formatter returned an invalid calendar date');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Adds whole calendar days to a strict ISO date without applying a host timezone.
 *
 * @param date - Strict `YYYY-MM-DD` calendar date.
 * @param days - Whole number of calendar days to add.
 * @returns Shifted strict ISO date.
 * @throws {RangeError} When the date or day count is invalid.
 */
export function addIsoCalendarDays(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isSafeInteger(days)) {
    throw new RangeError('ISO calendar date or day count is invalid');
  }
  const instant = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
    throw new RangeError('ISO calendar date is invalid');
  }
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
