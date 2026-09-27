// Wall-clock helpers for timezone-aware "is this slot in the past" checks.
//
// ChairOS stores booking slots as timezone-naive wall-clock strings
// (YYYY-MM-DD + HH:MM:SS) and shops carry no timezone column, so "past"
// has to be evaluated in *some* zone. The public booking page sends the
// customer's browser zone (they're overwhelmingly local to the shop);
// every caller falls back to UTC when no zone is supplied.

/** Validate an IANA time zone string from an untrusted client; falls back to UTC. */
export function resolveTimeZone(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return 'UTC'
  try {
    // Throws RangeError on unknown zones.
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return raw
  } catch {
    return 'UTC'
  }
}

/**
 * Current wall-clock in `tz` as 'YYYY-MM-DDTHH:MM:SS'. Fixed-width, so two
 * wall-clock strings in the same zone compare correctly with plain
 * lexicographic comparison.
 */
export function nowWallClock(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

/** Today's calendar date in `tz` as 'YYYY-MM-DD'. */
export function todayInTimeZone(tz: string): string {
  return nowWallClock(tz).slice(0, 10)
}
