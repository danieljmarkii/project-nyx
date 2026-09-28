// Local time for the corpus, across DST (Engines v3 PR-15, CUL-508).
// Run with: deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { localDayIndex, localHour, localToUtcMs } from './time.ts'

const at = (ms: number) => new Date(ms).toISOString()

Deno.test('the US spring-forward day: the skipped hour lands after the change, as Date does', () => {
  assertEquals(at(localToUtcMs('2026-03-08', 1.5, 'America/Chicago')), '2026-03-08T07:30:00.000Z') // 01:30 CST
  assertEquals(at(localToUtcMs('2026-03-08', 2.5, 'America/Chicago')), '2026-03-08T08:30:00.000Z') // 03:30 CDT
  assertEquals(at(localToUtcMs('2026-03-08', 3.5, 'America/Chicago')), '2026-03-08T08:30:00.000Z') // 03:30 CDT
  assertEquals(at(localToUtcMs('2026-03-29', 1.5, 'Europe/London')), '2026-03-29T01:30:00.000Z') // 02:30 BST
})

Deno.test('the fall-back day: the repeated hour resolves to one of its two true readings', () => {
  const t = at(localToUtcMs('2026-11-01', 1.5, 'America/Chicago'))
  assert(t === '2026-11-01T06:30:00.000Z' || t === '2026-11-01T07:30:00.000Z', t)
  assertEquals(at(localToUtcMs('2026-11-01', 0.5, 'America/Chicago')), '2026-11-01T05:30:00.000Z')
  assertEquals(at(localToUtcMs('2026-11-01', 2.5, 'America/Chicago')), '2026-11-01T08:30:00.000Z')
})

Deno.test('every existing quarter hour of a year round-trips, in three hemispheres and a half-hour zone', () => {
  for (const tz of ['America/Chicago', 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata']) {
    for (let day = 0; day < 365; day++) {
      const ymd = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10)
      for (let q = 0; q < 96; q++) {
        const hour = q / 4
        const utc = localToUtcMs(ymd, hour, tz)
        const back = localHour(utc, tz)
        // Only the skipped spring hour may move, and it moves forward by exactly one hour.
        assert(Math.abs(back - hour) < 1e-9 || Math.abs(back - (hour + 1)) < 1e-9, `${tz} ${ymd} ${hour}: back ${back}`)
      }
    }
  }
})

Deno.test('localDayIndex counts local days from the start date, with an optional boundary hour', () => {
  const start = '2026-03-01'
  assertEquals(localDayIndex(localToUtcMs('2026-03-01', 0, 'America/Chicago'), start, 'America/Chicago'), 0)
  assertEquals(localDayIndex(localToUtcMs('2026-03-01', 23.99, 'America/Chicago'), start, 'America/Chicago'), 0)
  assertEquals(localDayIndex(localToUtcMs('2026-03-10', 12, 'America/Chicago'), start, 'America/Chicago'), 9)
  // With days starting at 06:00, 02:00 belongs to the day before.
  assertEquals(localDayIndex(localToUtcMs('2026-03-10', 2, 'America/Chicago'), start, 'America/Chicago', 6), 8)
})
