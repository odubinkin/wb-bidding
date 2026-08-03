const SECOND_MS = 1_000;

/**
 *
 */
export class CronSchedule {
  private readonly fields: readonly Set<number>[];
  private readonly dayOfMonthWildcard: boolean;
  private readonly dayOfWeekWildcard: boolean;

  /**
   * Parses a six-field cron expression.
   *
   * @param expression - Seconds through day-of-week cron fields.
   * @throws {Error} When syntax or a value is invalid.
   */
  public constructor(expression: string) {
    const parts = expression.trim().split(/\s+/u);
    if (parts.length !== 6) throw new Error('Cron expression must contain six fields');
    const ranges = [
      [0, 59],
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ] as const;
    this.fields = Object.freeze(
      parts.map((part, index) => {
        const range = ranges[index];
        if (range === undefined) throw new Error('Cron field range missing');
        return parseCronField(part, range[0], range[1]);
      }),
    );
    this.dayOfMonthWildcard = parts[3] === '*';
    this.dayOfWeekWildcard = parts[5] === '*';
  }

  /**
   * Tests a UTC instant against the cron expression.
   *
   * @param instant - Tick instant.
   * @returns Whether the callback is due.
   */
  public matches(instant: Date): boolean {
    const values = [
      instant.getUTCSeconds(),
      instant.getUTCMinutes(),
      instant.getUTCHours(),
      instant.getUTCDate(),
      instant.getUTCMonth() + 1,
      instant.getUTCDay(),
    ];
    const baseMatches = values
      .slice(0, 3)
      .every((value, index) => this.fields[index]?.has(value) === true);
    const monthMatches = this.fields[4]?.has(values[4] ?? -1) === true;
    const domMatches = this.fields[3]?.has(values[3] ?? -1) === true;
    const dowMatches = this.fields[5]?.has(values[5] ?? -1) === true;
    const dayMatches =
      this.dayOfMonthWildcard || this.dayOfWeekWildcard
        ? domMatches && dowMatches
        : domMatches || dowMatches;
    return baseMatches && monthMatches && dayMatches;
  }

  /**
   * Computes a bounded minimum interval for startup capacity checks.
   *
   * @param from - Search origin.
   * @returns Minimum interval in minutes across the next eight matches.
   */
  public minimumIntervalMinutes(from: Date = new Date()): number {
    const matches: number[] = [];
    const start = Math.floor(from.getTime() / SECOND_MS) * SECOND_MS;
    const firstMinute = Math.floor(start / 60_000) * 60_000;
    const limit = start + 400 * 86_400_000;
    const seconds = [...(this.fields[0] ?? [])].sort((left, right) => left - right);
    for (let minute = firstMinute; minute <= limit && matches.length < 8; minute += 60_000) {
      for (const second of seconds) {
        const value = minute + second * SECOND_MS;
        if (value < start || value > limit) continue;
        if (this.matches(new Date(value))) matches.push(value);
        if (matches.length === 8) break;
      }
    }
    if (matches.length < 2) throw new Error('Cron interval cannot be proven within 400 days');
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 1; index < matches.length; index += 1) {
      const current = matches[index];
      const previous = matches[index - 1];
      if (current === undefined || previous === undefined) {
        throw new Error('Cron match sequence is incomplete');
      }
      minimum = Math.min(minimum, (current - previous) / 60_000);
    }
    return minimum;
  }
}

/**
 * Parses one cron field with lists, ranges, wildcards, and positive steps.
 *
 * @param source - Raw cron field.
 * @param minimum - Inclusive minimum value.
 * @param maximum - Inclusive maximum value.
 * @returns Parsed field values.
 */
export function parseCronField(source: string, minimum: number, maximum: number): Set<number> {
  const values = new Set<number>();
  for (const segment of source.split(',')) {
    const [rangeSource, stepSource] = segment.split('/');
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step < 1 || rangeSource === undefined) {
      throw new Error(`Invalid cron field: ${source}`);
    }
    const [start, end] =
      rangeSource === '*'
        ? [minimum, maximum]
        : rangeSource.includes('-')
          ? rangeSource.split('-').map(Number)
          : [Number(rangeSource), Number(rangeSource)];
    if (
      start === undefined ||
      end === undefined ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < minimum ||
      end > maximum ||
      start > end
    ) {
      throw new Error(`Cron field is out of range: ${source}`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}
