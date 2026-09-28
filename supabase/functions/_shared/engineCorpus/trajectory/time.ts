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
  return wallToUtcMs(Date.UTC(y, m - 1, d) + hour * 3_600_000, tz)
}

/** The UTC instant of a local wall-clock time given as "local ms since the epoch". */
export function wallToUtcMs(wall: number, tz: string): number {
  // Guess with the offset at the wall time read as UTC, then correct once with the offset at
  // the guess. If the result does not round-trip, the wall time does not exist (the hour the
  // clocks skip in spring); take the later candidate, as JavaScript's Date does, so 02:30 on
  // the US change day becomes 03:30 daylight time rather than 01:30 standard. In the hour the
  // clocks repeat in autumn, either instant is a true reading and the first one found stands.
  const t1 = wall - offsetMs(wall, tz)
  const o = offsetMs(t1, tz)
  const t2 = wall - o
  return offsetMs(t2, tz) === o ? t2 : Math.max(t1, t2)
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const offsets = new Map<string, Map<number, number>>()
const QUARTER_HOUR_MS = 900_000

/**
 * The zone's offset from UTC at an instant (local minus UTC). Cached per quarter hour of UTC:
 * every IANA offset is a whole number of quarter hours and every transition falls on a local
 * quarter hour, so no quarter-hour bucket straddles a change. Intl's formatToParts is the
 * simulator's hot path, and the cache is what keeps a 1,000-pet sweep in minutes.
 */
export function offsetMs(utcMs: number, tz: string): number {
  let zone = offsets.get(tz)
  if (!zone) {
    zone = new Map()
    offsets.set(tz, zone)
  }
  const bucket = Math.floor(utcMs / QUARTER_HOUR_MS)
  const hit = zone.get(bucket)
  if (hit !== undefined) return hit
  const value = computeOffsetMs(bucket * QUARTER_HOUR_MS, tz)
  zone.set(bucket, value)
  return value
}

function computeOffsetMs(utcMs: number, tz: string): number {
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
  return asLocal - utcMs
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
