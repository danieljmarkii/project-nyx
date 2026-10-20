// CUL-2059 (PM ruling (A), 2026-10-20) — the cap is read before it is counted, a call it turns
// away is never counted, and a rebuild after a log is never turned away (it runs on templates).
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/capRoute.test.ts
//
// A refused entry holds every Signal at the 1-hour expiry (CUL-2037), so ordinary Home opens
// could reach the cap; counting the turned-away calls spent the month, and a capped log's
// rebuild left a new warning unbuilt. These drive the exported helpers and pin the handler's
// wiring by source scan, because the handler itself is not unit-driven.
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { blankComments } from '../_shared/sourceScan.testutil.ts'
import {
  type FunctionCaps,
  parseRegenReason,
  resolveCapRoute,
  usageFromRows,
  usageWindow,
} from './index.ts'

const CAPS: FunctionCaps = { daily: 12, monthly: 240 }

Deno.test('CUL-2059 — only the literal "log" is a log; an older build is a refresh', () => {
  assertEquals(parseRegenReason('log'), 'log')
  for (const v of [undefined, null, 'refresh', 'LOG', true, 1, {}]) assertEquals(parseRegenReason(v), 'refresh', String(v))
})

Deno.test('CUL-2059 — under the cap every call is counted; the 12th proceeds, the 13th does not', () => {
  // usage is the count BEFORE this call: 11 used, so this is the 12th.
  assertEquals(resolveCapRoute({ dayCount: 11, monthCount: 30 }, CAPS, 'refresh'), { kind: 'count' })
  assertEquals(resolveCapRoute({ dayCount: 11, monthCount: 30 }, CAPS, 'log'), { kind: 'count' })
  assertEquals(resolveCapRoute({ dayCount: 12, monthCount: 30 }, CAPS, 'refresh'), { kind: 'turn_away', cap: 'daily' })
  assertEquals(resolveCapRoute({ dayCount: 2, monthCount: 239 }, CAPS, 'refresh'), { kind: 'count' })
  assertEquals(resolveCapRoute({ dayCount: 2, monthCount: 240 }, CAPS, 'refresh'), { kind: 'turn_away', cap: 'monthly' })
})

Deno.test('CUL-2059 — over the cap a log is never turned away, daily or monthly', () => {
  assertEquals(resolveCapRoute({ dayCount: 12, monthCount: 30 }, CAPS, 'log'), { kind: 'log_over_cap' })
  assertEquals(resolveCapRoute({ dayCount: 2, monthCount: 240 }, CAPS, 'log'), { kind: 'log_over_cap' })
  assertEquals(resolveCapRoute({ dayCount: 500, monthCount: 9000 }, CAPS, 'log'), { kind: 'log_over_cap' })
})

Deno.test('CUL-2059 — a failed usage read fails open to counting, as the RPC error did', () => {
  assertEquals(resolveCapRoute(null, CAPS, 'refresh'), { kind: 'count' })
  assertEquals(resolveCapRoute(null, CAPS, 'log'), { kind: 'count' })
})

Deno.test('CUL-2059 — usage sums the month and picks out today, by UTC day', () => {
  const { day, monthStart } = usageWindow(Date.parse('2026-10-20T23:30:00.000Z'))
  assertEquals(day, '2026-10-20')
  assertEquals(monthStart, '2026-10-01')
  assertEquals(usageWindow(Date.parse('2026-11-01T00:00:00.000Z')), { day: '2026-11-01', monthStart: '2026-11-01' })
  assertEquals(
    usageFromRows([{ day: '2026-10-01', count: 12 }, { day: '2026-10-19', count: 7 }, { day: '2026-10-20', count: 5 }], '2026-10-20'),
    { dayCount: 5, monthCount: 24 },
  )
  assertEquals(usageFromRows([], '2026-10-20'), { dayCount: 0, monthCount: 0 })
})

// A refused-row phone opening Home ~20 times a day: turned-away calls no longer count, so the
// month is spent only by calls that ran. And a log on day 30 still runs.
Deno.test('CUL-2059 — turned-away refreshes never spend the month; a log on a capped day still runs', () => {
  let month = 0
  let logsRan = 0
  for (let d = 0; d < 30; d++) {
    let day = 0
    for (let open = 0; open < 20; open++) {
      const route = resolveCapRoute({ dayCount: day, monthCount: month }, CAPS, 'refresh')
      if (route.kind === 'count') { day++; month++ }
    }
    if (resolveCapRoute({ dayCount: day, monthCount: month }, CAPS, 'log').kind !== 'turn_away') logsRan++
  }
  assertEquals(month, 240, 'only calls that ran are counted, and they stop at the month')
  assertEquals(logsRan, 30, 'every day\'s log rebuild ran')
})

Deno.test('CUL-2059 — the handler reads before it counts, counts only a counted route, and phrases only then', async () => {
  const src = blankComments(await Deno.readTextFile(new URL('./index.ts', import.meta.url)))
  const handler = src.slice(src.indexOf('const handler = async'))
  assertNotEquals(handler.length, src.length, 'the handler was found')
  assertEquals(/regenReason = parseRegenReason\(body\.reason\)/.test(handler), true, 'the reason is read off the body')
  const route = handler.indexOf('resolveCapRoute(await readUsage(supabase, petId, nowMs), caps, regenReason)')
  assertNotEquals(route, -1, 'the route is resolved from an uncounted read')
  const record = handler.indexOf("if (capRoute.kind === 'count') await recordUsage(supabase, petId)")
  assertNotEquals(record, -1, 'only a counted route records usage')
  assertEquals(route < record, true, 'the read comes before the count')
  assertEquals((handler.match(/recordUsage\(/g) ?? []).length, 1, 'no other call counts')
  assertEquals(/if \(capRoute\.kind === 'turn_away'\) \{\s*return Response\.json/.test(handler), true, 'a turn-away returns before the pipeline')
  assertEquals(
    /const phrasingEnabled = modelPhrasingAllowed\(phrasingFlag, consented\) && capRoute\.kind === 'count'/.test(handler),
    true,
    'a log over the cap runs on templates',
  )
})
