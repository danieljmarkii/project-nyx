// Q14 (CUL-772) / CUL-2037 — a rebuild over a device with unsent or refused rows is an incomplete read.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/unsentRows.test.ts
//
// The phone sends `unsentRows: true` when rows it holds have not reached the server after its
// push, and `refusedRows: true` when it holds a row the server refused (lib/signal.ts
// `readSignalRecordGaps`; a refused row sets both). The function adds the `unsent` / `refused` pull, which routes the run through CUL-989's incomplete read: the 1-hour expiry,
// templates only, nothing reassures. These drive the exported helpers and the real pipeline, and
// pin the handler's wiring by source scan, because the handler itself is not unit-driven.
import { assertEquals, assertNotEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { blankComments } from '../_shared/sourceScan.testutil.ts'
import { EMPTY_CARE_RECORD } from './careState.ts'
import { runSignalPipeline, templatePayload } from './pipeline.ts'
import { SIGNAL_PIPELINE_CORPUS } from '../_shared/engineCorpus/signalPipeline.corpus.ts'
import { incompleteReadExpiry, REFUSED_ROWS_PULL, UNSENT_ROWS_PULL, withUnsentRows } from './index.ts'

const HOUR_MS = 60 * 60 * 1000
const NOW_MS = Date.parse('2026-10-16T12:00:00.000Z')

Deno.test('Q14 — unsent rows add the unsent pull; anything but true adds nothing', () => {
  assertEquals(withUnsentRows([], true), [UNSENT_ROWS_PULL])
  assertEquals(withUnsentRows(['weights'], true), ['weights', UNSENT_ROWS_PULL])
  // An older build sends no field; a malformed one is not the client's claim. Both keep today's.
  for (const v of [false, undefined, null, 'true', 1, {}]) {
    assertEquals(withUnsentRows([], v), [], String(v))
    assertEquals(withUnsentRows(['symptoms'], v), ['symptoms'], String(v))
  }
})

// CUL-2037 (PM ruling (a)): a refused row is off the server's record like an unsent one.
Deno.test('CUL-2037 — refused rows add the refused pull; anything but true adds nothing', () => {
  assertEquals(withUnsentRows([], false, true), [REFUSED_ROWS_PULL])
  // What the current phone sends over a refused row: both names, so the record says which.
  assertEquals(withUnsentRows([], true, true), [UNSENT_ROWS_PULL, REFUSED_ROWS_PULL])
  assertEquals(withUnsentRows(['weights'], false, true), ['weights', REFUSED_ROWS_PULL])
  assertNotEquals(REFUSED_ROWS_PULL, UNSENT_ROWS_PULL)
  for (const v of [false, undefined, null, 'true', 1, {}]) {
    assertEquals(withUnsentRows([], false, v), [], String(v))
    assertEquals(withUnsentRows([], true, v), [UNSENT_ROWS_PULL], String(v))
  }
})

Deno.test('CUL-2037 — a rebuild with only a refused row writes the 1-hour expiry', () => {
  // The server alone holds the line: a client that set refusedRows but not unsentRows still
  // gets the hour, never the 24-hour default.
  const override = incompleteReadExpiry(withUnsentRows([], false, true), NOW_MS)
  assertEquals(override, { expires_at: new Date(NOW_MS + HOUR_MS).toISOString() })
})

Deno.test('Q14 — a rebuild with unsent rows writes the 1-hour expiry, never the 24-hour default', () => {
  const override = incompleteReadExpiry(withUnsentRows([], true), NOW_MS)
  assertEquals(override, { expires_at: new Date(NOW_MS + HOUR_MS).toISOString() })
})

Deno.test('Q14 — a rebuild with nothing unsent keeps the 24-hour expiry (no override)', () => {
  // No `expires_at` in the insert leaves the column default, NOW() + 24h (005_ai_signals.sql).
  assertEquals(incompleteReadExpiry(withUnsentRows([], false), NOW_MS), {})
  assertEquals(incompleteReadExpiry(withUnsentRows([], undefined), NOW_MS), {})
  assertEquals(incompleteReadExpiry(withUnsentRows([], false, false), NOW_MS), {})
  assertEquals(incompleteReadExpiry(withUnsentRows([], undefined, undefined), NOW_MS), {})
})

// The calm Signal: a case whose complete read serves a summary (the line Home reads as the
// state of things). With unsent rows it must not be renewed: the summary becomes the disclosure,
// no packet is phrased, and the row takes the hour.
Deno.test('Q14 — unsent rows never renew a calm read: the summary is withheld behind the disclosure', () => {
  const run = (unsentRows: unknown, c: (typeof SIGNAL_PIPELINE_CORPUS)[number], refusedRows: unknown = false) =>
    runSignalPipeline({
      rows: c.rows,
      incompletePulls: withUnsentRows([], unsentRows, refusedRows),
      prior: c.prior,
      priorReadFailed: false,
      nowMs: Date.parse(c.nowIso),
      engineFlags: { on: [], readOk: true },
      careRecord: EMPTY_CARE_RECORD,
      careContextFacts: null,
      weightFacts: null,
    })
  let calm = 0
  for (const c of SIGNAL_PIPELINE_CORPUS) {
    const complete = run(false, c)
    if (complete.summaryPacket === null) continue
    calm++
    assertStrictEquals(complete.incompleteDisclosure, null, c.name)
    const unsent = run(true, c)
    assertStrictEquals(unsent.summaryPacket, null, c.name)
    assertNotEquals(unsent.incompleteDisclosure, null, c.name)
    assertEquals(templatePayload(unsent).summary, unsent.incompleteDisclosure, c.name)
    // CUL-2037: a refused row alone withholds the calm read the same way.
    const refused = run(false, c, true)
    assertStrictEquals(refused.summaryPacket, null, `${c.name} (refused)`)
    assertNotEquals(refused.incompleteDisclosure, null, `${c.name} (refused)`)
    assertEquals(templatePayload(refused).summary, refused.incompleteDisclosure, `${c.name} (refused)`)
  }
  // Non-vacuity: a corpus with no calm case would pass by skipping everything.
  assertNotEquals(calm, 0, 'no corpus case serves a summary')
})

// The handler's wiring, which no unit test drives: the body's field reaches the pull list, and
// the list reaches the insert's expiry. Comments blanked so a commented-out call cannot pass.
Deno.test('Q14 — the handler passes the body flag into the pull list and the list into the expiry', async () => {
  const src = blankComments(await Deno.readTextFile(new URL('./index.ts', import.meta.url)))
  const handler = src.slice(src.indexOf('const handler = async'))
  assertNotEquals(handler.length, src.length, 'the handler was found')
  const m = handler.match(/const incompletePulls = withUnsentRows\(([\s\S]*?)\)\n/)
  assertNotEquals(m, null, 'incompletePulls is built by withUnsentRows')
  assertEquals(/,\s*unsentRows,\s*refusedRows,?\s*$/.test(m![1]), true, `the flags are its second and third arguments: ${m![1]}`)
  assertEquals(/unsentRows = body\.unsentRows/.test(handler), true, 'the flag is read off the body')
  assertEquals(/refusedRows = body\.refusedRows/.test(handler), true, 'the refused flag is read off the body')
  assertEquals(/\.\.\.incompleteReadExpiry\(incompletePulls, nowMs\)/.test(handler), true, 'the insert spreads the expiry')
})
