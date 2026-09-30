// The pass lines are fixed, every one of them reads rows that exist, and no line or wave passes
// by construction (Engines v3 PR-16, EN-1, CUL-1131). Run with:
//   deno test --allow-read=supabase/functions supabase/functions/generate-signal/eval/
//
// FIXED: the digest below is of PASS_LINES as ruled before any flag-on run. A change reds this
// test on purpose. Re-pin only with the PM's sign-off named beside the new digest (who, when, on
// which issue), never after reading a flag-on result: choosing a line after seeing the number it
// has to clear is the failure the freeze exists to prevent.
//
// NON-VACUOUS: a line naming a row the committed scorecard does not carry would report
// "incomplete" forever and read as coverage (C-38). This fails instead.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { evaluatePassLines, HARNESS_OBSERVES, PASS_LINES, WAVE_KEYS, waveStatus, type PassLine, type Wave } from './passLines.ts'
import type { Scorecard } from './scorecard.ts'

// Pinned 2026-09-30, PR-16 (CUL-1131): the lines as the 9/26 plan review ruled them (the
// measures, comparisons and directions), with the second adversarial pass's additions approved
// by the PM in session the same day (EN-9.reRaiseEver, EN-9.askAfterAck, EN-11.falseWorsening,
// EN-8's lane gate, the red-flag floor of 3), and the third pass's (WAVE_KEYS, EN-11 split by
// unit into detection and delay, EN-11.eligible, EN-11.falseWorseningEvenings, the floors on
// scored pets and acknowledged cats), and the fourth's (HARNESS_OBSERVES, an arm that moved
// nothing is incomparable, EN-9's floors per scenario, EN-9.scored, EN-11.eligible's margin made
// an unruled tolerance), and the fifth's (EN-11's food lines, approved by the PM in session;
// exact keys per wave; EN-8 not observed; the never-acknowledged fixed-day doubling counted).
// Every value but the two ruled ones is null.
const PINNED = 'ee751b3887e1198c1af5a073d9b8c8716ec3cfce16dc1e71ab80abb79baac0ed'

async function digest(lines: readonly PassLine[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(lines)))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const committed: Scorecard = JSON.parse(Deno.readTextFileSync(new URL('./scorecard.json', import.meta.url)))
const line = (id: string) => PASS_LINES.find((l) => l.id === id)!

const EN9_KEYS = WAVE_KEYS['EN-9']
const EN11_KEYS = WAVE_KEYS['EN-11']

/** A flag-on arm over the committed rows, with `patch` applied, carrying EN-11's keys unless told
 *  otherwise (a comparison arm carries exactly its wave's keys). It carries one marker row so it never equals flag off (an arm that moved nothing
 *  is incomparable); `sameRows` builds that arm on purpose. */
function onArm(patch: Record<string, number | null> = {}, flagsOn: readonly string[] = EN11_KEYS): Scorecard {
  return { meta: { ...committed.meta, arm: `flag_on:${flagsOn.join('+')}`, flagsOn }, rows: { ...committed.rows, 'test/armMoved': 1, ...patch } }
}
function sameRows(flagsOn: readonly string[]): Scorecard {
  return { meta: { ...committed.meta, arm: `flag_on:${flagsOn.join('+')}`, flagsOn }, rows: { ...committed.rows } }
}

/** Every wave treated as observed, to test a wave's lines before the harness can run its engine. */
const OBSERVE_ALL: Record<Wave, boolean> = { 'EN-9': true, 'EN-8': true, 'EN-3/4/7': true, 'EN-11': true }

Deno.test('the pass lines are the pinned set', async () => {
  assertEquals(await digest(PASS_LINES), PINNED)
})

Deno.test('every wave the plan names has a line, ids are unique, and every line pairs with one that exists', () => {
  const waves = new Set(PASS_LINES.map((l) => l.wave))
  for (const w of ['EN-9', 'EN-8', 'EN-3/4/7', 'EN-11']) assert(waves.has(w as PassLine['wave']), w)
  assertEquals(new Set(PASS_LINES.map((l) => l.id)).size, PASS_LINES.length)
  for (const l of PASS_LINES) {
    assert(l.pairedWith !== null, `${l.id} has a pair`)
    assert(PASS_LINES.some((x) => x.id === l.pairedWith && x.wave === l.wave), `${l.id} pairs within its wave`)
  }
})

Deno.test('every row every line names exists in the committed scorecard (a line cannot quietly read fewer scenarios)', () => {
  for (const l of PASS_LINES) {
    assert(l.rows.length > 0, l.id)
    for (const key of l.rows) assert(key in committed.rows, `${l.id}: no committed row ${key}`)
    for (const key of l.nonVacuity?.rows ?? []) assert(key in committed.rows, `${l.id}: no committed row ${key}`)
  }
})

Deno.test('flag off alone: the hard property has a verdict, the weight lines are incomplete, the rest wait for a flag-on arm', () => {
  for (const r of evaluatePassLines(committed)) {
    const l = line(r.id)
    const expected = l.direction === 'zero' ? 'pass' : l.needsLane === 'weight' ? 'incomplete' : 'awaiting_flag_on'
    assertEquals(r.status, expected, r.id)
  }
})

Deno.test('with a flag-on arm, an unruled line says so and never passes', () => {
  for (const l of PASS_LINES) {
    const r = evaluatePassLines(committed, onArm({}, WAVE_KEYS[l.wave]), [l], OBSERVE_ALL)[0]
    if (l.value === null && l.needsLane === undefined) assertEquals(r.status, 'unruled', r.id)
  }
})

Deno.test('the weight lines are incomplete for every engine until a card can be a weight card, whatever the values', () => {
  for (const id of ['EN-8.falseCards', 'EN-8.delay']) {
    const ruled: PassLine = { ...line(id), value: 1000 }
    const zeros = onArm(Object.fromEntries(ruled.rows.map((k) => [k, 0])), WAVE_KEYS['EN-8'])
    // Not observed today (no weights reach the engine): incomparable. Observed: still incomplete.
    assertEquals(evaluatePassLines(committed, zeros, [ruled])[0].status, 'incomparable', id)
    assertEquals(evaluatePassLines(committed, zeros, [ruled], OBSERVE_ALL)[0].status, 'incomplete', id)
  }
})

Deno.test('a ruled comparison line fails a flag-on arm that detects less, and a red flag below tier fails the property', () => {
  const ruled: PassLine = { ...line('EN-11.detection'), value: 0.02 }
  const key = ruled.rows.find((k) => typeof committed.rows[k] === 'number' && (committed.rows[k] as number) > 0.1)!
  assert(key, 'a detected worsening row to break')
  const same = onArm()
  assertEquals(evaluatePassLines(committed, same, [ruled])[0].status, 'pass')
  assertEquals(evaluatePassLines(committed, onArm({ [key]: (committed.rows[key] as number) - 0.1 }), [ruled])[0].status, 'fail')
  // A detection flag off made and flag on no longer makes (a number becoming null) fails too.
  assertEquals(evaluatePassLines(committed, onArm({ [key]: null }), [ruled])[0].status, 'fail')

  const hard = line('EN-3.redFlagTier')
  assertEquals(evaluatePassLines(committed, onArm({ 'engine/redFlag/belowShippedTier': 1 }, WAVE_KEYS['EN-3/4/7']), [hard], OBSERVE_ALL)[0].status, 'fail')
})

Deno.test('the zero property is no proof over too few injected flags', () => {
  const hard = line('EN-3.redFlagTier')
  for (const injected of [0, hard.nonVacuity!.min - 1]) {
    const thin: Scorecard = { ...committed, rows: { ...committed.rows, 'engine/redFlag/injected': injected, 'engine/redFlag/belowShippedTier': 0 } }
    assertEquals(evaluatePassLines(thin, null, [hard])[0].status, 'incomplete', `${injected} injected`)
  }
})

Deno.test('arms that are not flag off against something else, over the same seeds and scenario ids, are incomparable', () => {
  const ruled: PassLine = { ...line('EN-11.detection'), value: 0 }
  const status = (off: Scorecard, on: Scorecard) => evaluatePassLines(off, on, [ruled])[0].status
  // The flag-off file handed in as the flag-on arm (the runner with SCORECARD_OFF and no SCORECARD_FLAGS).
  assertEquals(status(committed, committed), 'incomparable')
  // An "off" arm that is not flag off.
  assertEquals(status(onArm(), { ...onArm(), meta: { ...committed.meta, arm: 'flag_on:other' } }), 'incomparable')
  // Other seeds.
  assertEquals(status(committed, { ...onArm(), meta: { ...onArm().meta, seeds: '10000..10999' } }), 'incomparable')
  // An arm whose name differs but which does not carry the wave's key (a key the Signal never reads):
  // its rows equal flag off's, and it passed EN-11 and EN-3 by construction (third adversarial pass).
  const en0 = onArm({}, ['engines_v3_en0'])
  assertEquals(status(committed, en0), 'incomparable')
  const redFlag = line('EN-3.redFlagTier')
  assertEquals(evaluatePassLines(committed, en0, [redFlag])[0].status, 'incomparable')
  // The wave's real key, but an engine the harness does not run: with engines_v3_en3 on, the rows
  // were byte-identical to flag off and EN-3/4/7 read "pass" (fourth adversarial pass).
  assertEquals(HARNESS_OBSERVES['EN-3/4/7'], false)
  assertEquals(evaluatePassLines(committed, onArm({}, ['engines_v3_en3']), [redFlag])[0].status, 'incomparable')
  // Observed, but the arm moved nothing: still incomparable. Observed and moved: read.
  assertEquals(evaluatePassLines(committed, sameRows(['engines_v3_en3']), [redFlag], OBSERVE_ALL)[0].status, 'incomparable')
  assertEquals(evaluatePassLines(committed, onArm({}, ['engines_v3_en3']), [redFlag], OBSERVE_ALL)[0].status, 'pass')
  // The same count of scenarios, different ones.
  const ids = [...committed.meta.scenarioIds]
  ids[0] = 'some-other-scenario'
  assertEquals(status(committed, { ...onArm(), meta: { ...onArm().meta, scenarioIds: ids } }), 'incomparable')
  // A flag-on arm missing rows (run over a subset) is incomplete.
  const subset = onArm()
  subset.rows = Object.fromEntries(Object.entries(committed.rows).filter(([k]) => k.startsWith('inj-rate-doubling/')))
  assertEquals(status(committed, subset), 'incomplete')
})

// ── A wave passes only when every line of it does, and silence or a late latch cannot pass EN-9 ──

/** EN-9 with values chosen for the test (never the ruling): a stable cat is not asked again, a doubling is. */
const EN9_TEST_VALUES: Record<string, number> = {
  'EN-9.reRaise': 0.1,
  'EN-9.reRaiseEver': 0.1,
  'EN-9.askAfterAck': 0.5,
  'EN-9.doubling': 0.8,
  'EN-9.doublingDelay': 45,
  'EN-9.silence': 14,
  'EN-9.scored': 0,
}
const EN9 = PASS_LINES.filter((l) => l.wave === 'EN-9').map((l) => ({ ...l, value: EN9_TEST_VALUES[l.id] ?? l.value }))
const set = (ids: string[], value: number) => Object.fromEntries(ids.flatMap((id) => line(id).rows.map((k) => [k, value])))

/** An arm that clears every EN-9 line: quiet on stable cats, the doubling caught in ten days. */
const GOOD = {
  ...set(['EN-9.reRaise', 'EN-9.reRaiseEver', 'EN-9.askAfterAck'], 0),
  ...set(['EN-9.doubling'], 1),
  ...set(['EN-9.doublingDelay'], 10),
  ...set(['EN-9.silence'], 5),
  // Enough acknowledged cats and scored pets to read the lines at all.
  ...Object.fromEntries(line('EN-9.reRaise').nonVacuity!.rows.map((k) => [k, 3])),
  ...Object.fromEntries(line('EN-9.doubling').nonVacuity!.rows.map((k) => [k, 3])),
  // No more pets left unscored than flag off.
  ...Object.fromEntries(line('EN-9.scored').rows.map((k) => [k, committed.rows[k] as number])),
  // No more false reassurance behind a lapse than flag off.
  ...Object.fromEntries(line('EN-9.lapseReassurance').rows.map((k) => [k, committed.rows[k] as number])),
}

Deno.test('EN-9: the passing arm passes, silence fails on the doubling line alone, and removing that line would pass it', () => {
  assertEquals(waveStatus(evaluatePassLines(committed, onArm(GOOD, EN9_KEYS), EN9, OBSERVE_ALL), 'EN-9', EN9), 'pass')
  // Never raises again: only the doubling probability differs from the passing arm.
  const silent = onArm({ ...GOOD, ...set(['EN-9.doubling'], 0) }, EN9_KEYS)
  const results = evaluatePassLines(committed, silent, EN9, OBSERVE_ALL)
  assertEquals(results.filter((r) => r.status !== 'pass').map((r) => r.id), ['EN-9.doubling'])
  assertEquals(waveStatus(results, 'EN-9', EN9), 'fail')
  // The mutation: without the doubling line, the same silent arm passes the wave.
  const without = EN9.filter((l) => l.id !== 'EN-9.doubling')
  assertEquals(waveStatus(evaluatePassLines(committed, silent, without, OBSERVE_ALL), 'EN-9', without), 'pass')
})

Deno.test('EN-9: a latch that starts after week eight, or a timer, fails on the whole-run lines though the eight-week line passes', () => {
  // Quiet for 56 days, then asking again: reRaise (eight weeks) reads 0, the whole run does not.
  const late = onArm({ ...GOOD, ...set(['EN-9.reRaiseEver'], 1), ...set(['EN-9.askAfterAck'], 15) }, EN9_KEYS)
  const results = evaluatePassLines(committed, late, EN9, OBSERVE_ALL)
  assertEquals(results.find((r) => r.id === 'EN-9.reRaise')!.status, 'pass')
  assertEquals(results.find((r) => r.id === 'EN-9.reRaiseEver')!.status, 'fail')
  assertEquals(waveStatus(results, 'EN-9', EN9), 'fail')
})

/** EN-11 with values chosen for the test (never the ruling). */
const EN11 = PASS_LINES.filter((l) => l.wave === 'EN-11').map((l) => ({
  ...l,
  value: l.value ?? ({ 'EN-11.detection': 0.02, 'EN-11.delay': 7, 'EN-11.eligible': 0, 'EN-11.falseWorsening': 0.02, 'EN-11.falseWorseningEvenings': 1,
    'EN-11.foodDetection': 0.02, 'EN-11.foodDelay': 7, 'EN-11.foodEligible': 0, 'EN-11.falseFood': 0.02, 'EN-11.falseFoodEvenings': 1 } as Record<string, number>)[l.id],
}))
const rowsOf = (id: string) => line(id).rows

Deno.test('EN-11: flag off against itself (under a real key) passes every line, so the lines are not failed by construction', () => {
  const results = evaluatePassLines(committed, onArm(), EN11)
  assertEquals(results.filter((r) => r.status !== 'pass').map((r) => `${r.id}:${r.status}`), [])
})

Deno.test('EN-11: a noisier engine that detects faster fails on its false-card pairs', () => {
  const faster = Object.fromEntries([...rowsOf('EN-11.detection').map((k) => [k, 1]), ...rowsOf('EN-11.delay').map((k) => [k, 0])])
  const noisier = Object.fromEntries(rowsOf('EN-11.falseWorsening').map((k) => [k, Math.min(1, (committed.rows[k] as number) + 0.2)]))
  const results = evaluatePassLines(committed, onArm({ ...faster, ...noisier }), EN11)
  assertEquals(results.find((r) => r.id === 'EN-11.detection')!.status, 'pass')
  assertEquals(results.find((r) => r.id === 'EN-11.falseWorsening')!.status, 'fail')
  assertEquals(waveStatus(results, 'EN-11', EN11), 'fail')
})

Deno.test('EN-11: an engine that never stands a card down fails on the scored pets and on the burden evenings, though its detection share rises', () => {
  const eligible = rowsOf('EN-11.eligible')
  const latch = onArm({
    ...Object.fromEntries(rowsOf('EN-11.detection').map((k) => [k, 1])),
    // Fewer clear pets than flag off (still enough to read), and twenty times the burden evenings.
    ...Object.fromEntries(eligible.map((k) => [k, Math.max(0, (committed.rows[k] as number) - 1)])),
    [eligible[0]]: 3,
    ...Object.fromEntries(rowsOf('EN-11.falseWorseningEvenings').map((k) => [k, (committed.rows[k] as number) * 20 + 1])),
  })
  const results = evaluatePassLines(committed, latch, EN11)
  assertEquals(results.find((r) => r.id === 'EN-11.detection')!.status, 'pass')
  assertEquals(results.find((r) => r.id === 'EN-11.eligible')!.status, 'fail')
  assertEquals(results.find((r) => r.id === 'EN-11.falseWorseningEvenings')!.status, 'fail')
})

Deno.test('EN-11: a detection loss fails the share line whatever the days margin, and a slower one fails the delay line', () => {
  const lost = onArm(Object.fromEntries(rowsOf('EN-11.detection').map((k) => [k, 0])))
  const detection = evaluatePassLines(committed, lost, EN11).find((r) => r.id === 'EN-11.detection')!
  const anyDetected = rowsOf('EN-11.detection').some((k) => typeof committed.rows[k] === 'number' && (committed.rows[k] as number) > 0.02)
  assert(anyDetected, 'flag off detects something')
  assertEquals(detection.status, 'fail')
  const slower = onArm(Object.fromEntries(rowsOf('EN-11.delay').map((k) => [k, typeof committed.rows[k] === 'number' ? (committed.rows[k] as number) + 8 : null])))
  assertEquals(evaluatePassLines(committed, slower, EN11).find((r) => r.id === 'EN-11.delay')!.status, 'fail')
})

Deno.test('EN-11 and EN-9 are incomplete over nothing scored: no clear pets, no acknowledged cats', () => {
  const patch = Object.fromEntries([
    ...rowsOf('EN-11.detection').map((k) => [k, null]),
    ...line('EN-11.detection').nonVacuity!.rows.map((k) => [k, 0]),
    ...line('EN-9.reRaise').nonVacuity!.rows.map((k) => [k, 0]),
    ...rowsOf('EN-9.reRaise').map((k) => [k, 0]),
  ])
  const results = [
    ...evaluatePassLines(committed, onArm(patch, EN11_KEYS), EN11, OBSERVE_ALL),
    ...evaluatePassLines(committed, onArm(patch, EN9_KEYS), EN9, OBSERVE_ALL),
  ]
  assertEquals(results.find((r) => r.id === 'EN-11.detection')!.status, 'incomplete')
  assertEquals(results.find((r) => r.id === 'EN-9.reRaise')!.status, 'incomplete')
})

Deno.test('EN-9: a shrunken scored population fails, and one scenario read over one pet is incomplete', () => {
  // Fourth adversarial pass: 1 scored doubling pet (999 acknowledged too late) and 3 of 1,000 cats
  // acknowledged passed every EN-9 line when the floor was a sum.
  const [thenElig, fixedElig] = line('EN-9.doubling').nonVacuity!.rows
  const shrunk = onArm({
    ...GOOD,
    [thenElig]: 1000,
    [fixedElig]: 1,
    'own-visit-doubling-fixed/detect/a:re_raise:vomit/ackTooLate': 999,
    'own-answers-vet-knows/care/neverAcknowledged': 997,
  }, EN9_KEYS)
  const results = evaluatePassLines(committed, shrunk, EN9, OBSERVE_ALL)
  assertEquals(results.find((r) => r.id === 'EN-9.doubling')!.status, 'incomplete')
  assertEquals(results.find((r) => r.id === 'EN-9.scored')!.status, 'fail')
  assertEquals(waveStatus(results, 'EN-9', EN9), 'fail')
})

Deno.test('every wave the harness does not run reads incomparable against any flag-on arm, EN-9 included', () => {
  for (const wave of Object.keys(HARNESS_OBSERVES) as Wave[]) {
    if (HARNESS_OBSERVES[wave]) continue
    for (const r of evaluatePassLines(committed, onArm(), PASS_LINES.filter((l) => l.wave === wave))) assertEquals(r.status, 'incomparable', r.id)
  }
})

Deno.test('EN-11: an engine that stops catching protein reactions and fires culprit cards on every staple fails, though worsening is untouched', () => {
  // Fifth adversarial pass: with worsening-only lines this arm read "pass".
  const foodBroken = onArm({
    ...Object.fromEntries(rowsOf('EN-11.foodDetection').map((k) => [k, 0])),
    ...Object.fromEntries(rowsOf('EN-11.falseFood').map((k) => [k, 1])),
  })
  const results = evaluatePassLines(committed, foodBroken, EN11)
  assertEquals(results.find((r) => r.id === 'EN-11.detection')!.status, 'pass')
  assertEquals(results.find((r) => r.id === 'EN-11.foodDetection')!.status, 'fail')
  assertEquals(results.find((r) => r.id === 'EN-11.falseFood')!.status, 'fail')
  assertEquals(waveStatus(results, 'EN-11', EN11), 'fail')
})

Deno.test('a comparison arm carries exactly its wave\'s keys: a bundled key is incomparable, whatever else moved', () => {
  // Fifth adversarial pass: [en11, en8] with only a weight row moved let a no-op EN-11 pass.
  const bundled = onArm({ 'wt-loss-weekly/safetyCard/180d': 0.5 }, [...EN11_KEYS, ...WAVE_KEYS['EN-8']])
  for (const r of evaluatePassLines(committed, bundled, EN11)) assertEquals(r.status, 'incomparable', r.id)
})
