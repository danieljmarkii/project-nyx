// The pass lines are fixed, and every one of them reads rows that exist
// (Engines v3 PR-16, EN-1, CUL-1131). Run with:
//   deno test --allow-read=supabase/functions supabase/functions/generate-signal/eval/
//
// FIXED: the digest below is of PASS_LINES as ruled before any flag-on run. A change reds this
// test on purpose. Re-pin only with the PM's sign-off named beside the new digest (who, when, on
// which issue), never after reading a flag-on result: choosing a line after seeing the number it
// has to clear is the failure the freeze exists to prevent.
//
// NON-VACUOUS: a line whose pattern matches no row in the committed scorecard would report
// "no_rows" forever and read as coverage (C-38). This fails instead.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { evaluatePassLines, PASS_LINES, waveStatus, type PassLine } from './passLines.ts'
import type { Scorecard } from './scorecard.ts'

// Pinned 2026-09-30, PR-16 (CUL-1131): the lines as the 9/26 plan review ruled them (the
// measures, comparisons and directions); every value but the red-flag property is null, unruled.
const PINNED = '8e78b071f29930a44aedd2dc51525aea8dd5ff8df167d01d5439b6ebe31f398c'

async function digest(lines: readonly PassLine[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(lines)))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const committed: Scorecard = JSON.parse(Deno.readTextFileSync(new URL('./scorecard.json', import.meta.url)))

Deno.test('the pass lines are the pinned set', async () => {
  assertEquals(await digest(PASS_LINES), PINNED)
})

Deno.test('every wave the plan names has a line, and ids are unique', () => {
  const waves = new Set(PASS_LINES.map((l) => l.wave))
  for (const w of ['EN-9', 'EN-8', 'EN-3/4/7', 'EN-11']) assert(waves.has(w as PassLine['wave']), w)
  assertEquals(new Set(PASS_LINES.map((l) => l.id)).size, PASS_LINES.length)
  for (const l of PASS_LINES) if (l.pairedWith) assert(PASS_LINES.some((x) => x.id === l.pairedWith), `${l.id} pairs with a line that exists`)
})

Deno.test('every row every line names exists in the committed scorecard (a line cannot quietly read fewer scenarios)', () => {
  for (const line of PASS_LINES) {
    assert(line.rows.length > 0, line.id)
    for (const key of line.rows) assert(key in committed.rows, `${line.id}: no committed row ${key}`)
    if (line.nonVacuity) assert(line.nonVacuity in committed.rows, `${line.id}: no committed row ${line.nonVacuity}`)
  }
})

Deno.test('flag off alone: only the hard property has a verdict; the rest wait for a flag-on arm', () => {
  for (const r of evaluatePassLines(committed)) {
    const line = PASS_LINES.find((l) => l.id === r.id)!
    if (line.direction === 'zero') assertEquals(r.status, 'pass')
    else assertEquals(r.status, 'awaiting_flag_on')
  }
})

Deno.test('with a flag-on arm, an unruled line says so and never passes', () => {
  for (const r of evaluatePassLines(committed, committed)) {
    const line = PASS_LINES.find((l) => l.id === r.id)!
    if (line.value === null) assertEquals(r.status, 'unruled', r.id)
  }
})

Deno.test('a ruled comparison line fails a flag-on arm that detects less, and a red flag below tier fails the property', () => {
  const line: PassLine = { ...PASS_LINES.find((l) => l.id === 'EN-11.worsening')!, value: 0.02 }
  const worse: Scorecard = { ...committed, rows: { ...committed.rows } }
  const key = line.rows.find((k) => k.endsWith('/probability') && (worse.rows[k] as number) > 0.1)!
  assert(key, 'a detected worsening row to break')
  worse.rows[key] = (committed.rows[key] as number) - 0.1
  assertEquals(evaluatePassLines(committed, committed, [line])[0].status, 'pass')
  assertEquals(evaluatePassLines(committed, worse, [line])[0].status, 'fail')

  const hard = PASS_LINES.find((l) => l.id === 'EN-3.redFlagTier')!
  const below: Scorecard = { ...committed, rows: { ...committed.rows, 'engine/redFlag/belowShippedTier': 1 } }
  assertEquals(evaluatePassLines(committed, below, [hard])[0].status, 'fail')
})

Deno.test('the zero property is no proof over nothing injected', () => {
  const hard = PASS_LINES.find((l) => l.id === 'EN-3.redFlagTier')!
  const none: Scorecard = { ...committed, rows: { ...committed.rows, 'engine/redFlag/injected': 0, 'engine/redFlag/belowShippedTier': 0 } }
  assertEquals(evaluatePassLines(none, null, [hard])[0].status, 'incomplete')
})

Deno.test('a flag-on arm missing rows is incomplete, and one over other seeds is incomparable, never a pass', () => {
  const line: PassLine = { ...PASS_LINES.find((l) => l.id === 'EN-11.worsening')!, value: 0 }
  const subset: Scorecard = { ...committed, rows: Object.fromEntries(Object.entries(committed.rows).filter(([k]) => k.startsWith('inj-rate-doubling/'))) }
  assertEquals(evaluatePassLines(committed, subset, [line])[0].status, 'incomplete')
  const other: Scorecard = { ...committed, meta: { ...committed.meta, seeds: '10000..10999' } }
  assertEquals(evaluatePassLines(committed, other, [line])[0].status, 'incomparable')
})

Deno.test('a wave passes only when every line of it does', () => {
  const ruled = PASS_LINES.map((l) => (l.wave === 'EN-9' ? { ...l, value: l.value ?? 0 } : l))
  // Silence alone: never raised again (reRaise 0) but the doubling is never caught.
  const silent: Scorecard = { ...committed, rows: { ...committed.rows } }
  for (const k of ruled.find((l) => l.id === 'EN-9.reRaise')!.rows) silent.rows[k] = 0
  for (const k of ruled.find((l) => l.id === 'EN-9.doubling')!.rows) silent.rows[k] = 0
  const results = evaluatePassLines(committed, silent, ruled)
  assertEquals(results.find((r) => r.id === 'EN-9.reRaise')!.status, 'pass')
  assertEquals(waveStatus(results, 'EN-9', ruled), 'fail')
})
