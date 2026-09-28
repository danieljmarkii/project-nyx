// Local-time arithmetic for the trajectory corpus (Engines v3 PR-15, CUL-508).
//
// Owners live in time zones: breakfast is 07:30 local, the evening check is 21:00 local, and
// a scenario in a DST zone crosses a change. Every stored instant is UTC (CLAUDE.md hard
// constraint); local time exists only here, to place events.

const DAY_MS = 86_400_000

/** YYYY-MM-DD, `days` after `ymd`. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The UTC instant of a local wall-clock time in an IANA zone. `hour` may be fractional. */
export function localToUtcMs(ymd: string, hour: number, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d) + hour * 3_600_000
  // Two passes of offset correction settle every instant except the skipped DST hour, which
  // lands an hour late: acceptable for placing a meal.
  let guess = wall
  for (let i = 0; i < 2; i++) guess = wall - offsetMs(guess, tz)
  return guess
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The zone's offset from UTC at an instant (local minus UTC). */
export function offsetMs(utcMs: number, tz: string): number {
  let fmt = formatters.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, fmt)
  }
  const parts = fmt.formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asLocal - Math.floor(utcMs / 1000) * 1000
}

/** The local hour (fractional) of an instant. */
export function localHour(utcMs: number, tz: string): number {
  const local = utcMs + offsetMs(utcMs, tz)
  return (((local % DAY_MS) + DAY_MS) % DAY_MS) / 3_600_000
}

/**
 * Which scenario day an instant falls on, in local time, with the day starting at
 * `boundaryHour` (0 for midnight; the tests use 06:00 so an evening meal and the vomit it
 * causes overnight land on the same day).
 */
export function localDayIndex(utcMs: number, startDate: string, tz: string, boundaryHour = 0): number {
  const [y, m, d] = startDate.split('-').map(Number)
  const local = utcMs + offsetMs(utcMs, tz) - boundaryHour * 3_600_000
  return Math.floor((local - Date.UTC(y, m - 1, d)) / DAY_MS)
}

export function iso(ms: number): string {
  return new Date(Math.round(ms)).toISOString()
}

export const HOUR_MS = 3_600_000
export const MINUTE_MS = 60_000
export { DAY_MS }
