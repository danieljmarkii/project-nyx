// Engines v3 PR-32 (EN-11, CUL-1141; CUL-1411): insight honesty, behind `engines_v3_en11`.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/detection.en11.test.ts
//
// Every test drives the real detector twice, under DEFAULT_CONFIG (flag off, today) and under
// EN11_CONFIG (flag on), so each states what the key changes and that flag off did not move.
// The four changes: the Early food tier retired (D5 = B); ④'s card floor with ③'s mute held at
// today's floor (the isWorsening split, CUL-1411); the reversed-in-time control on ① and ⑤; and
// ①'s control windows kept out of the hours after a GI episode. The pipeline-level absence guard
// is _shared/engineCorpus/signalPipeline.test.ts (c-en11).

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  EN11_CONFIG,
  detectCorrelations,
  detectPostprandialTiming,
  detectReflections,
  detectSignals,
  detectWorsening,
  type DetectionInput,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

let seq = 0
/** ISO-8601 UTC for a day/hour in May 2026. */
const at = (day: number, hour = 8, min = 0): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`
const NOW = at(30, 12)

const sign = (type: SymptomType, day: number, hour = 8, min = 0): SymptomEvent => ({
  id: `s-${++seq}`,
  type,
  occurredAt: at(day, hour, min),
  occurredAtConfidence: 'witnessed',
})
const meal = (day: number, hour: number, protein: string, over: Partial<MealEvent> = {}): MealEvent => ({
  id: `m-${++seq}`,
  occurredAt: at(day, hour),
  foodItemId: null,
  primaryProtein: protein,
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
  ...over,
})
const daily = (from: number, to: number, protein: string, hours: number[]): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = from; d <= to; d++) for (const h of hours) out.push(meal(d, h, protein))
  return out
}
const input = (symptomEvents: SymptomEvent[], mealEvents: MealEvent[]): DetectionInput => ({
  pet: { name: 'Mochi', species: 'dog', dietTrialActive: false },
  symptomEvents,
  mealEvents,
  now: NOW,
})

Deno.test('EN11_CONFIG is DEFAULT_CONFIG plus the en11 block, and DEFAULT_CONFIG carries none', () => {
  assert.equal(DEFAULT_CONFIG.en11, undefined, 'flag off must not carry EN-11')
  const { en11, ...rest } = EN11_CONFIG
  assert.deepEqual(rest, DEFAULT_CONFIG, 'EN-11 may move only its own block')
  assert.ok(en11)
  // The floor's whole point: 2 vs 0 is no longer a safety card, and ③'s mute is unmoved.
  assert.ok(en11.worseningCardMinEpisodes > DEFAULT_CONFIG.reflection.worseningMinEpisodes)
  assert.equal(EN11_CONFIG.reflection.worseningMinEpisodes, 2)
})

// ── ④'s floor and the split (CUL-1411) ──────────────────────────────────────────────────
//
// The window is 7 days: current = May 23 12:00 → May 30 12:00, prior = the 7 days before.
const MEALS = daily(8, 30, 'chicken', [7, 18])
// A vomit course that is FALLING, 5 → 3 a week: on its own, ③'s calm "down from 5" card.
const FALLING_VOMIT = [...[17, 18, 19, 20, 21].map((d) => sign('vomit', d)), ...[24, 26, 28].map((d) => sign('vomit', d))]
// An itch that went from 0 to 2 episodes: the dogfood case (brief §2 R4).
const ITCH_2_VS_0 = [sign('itch', 27), sign('itch', 29)]

Deno.test('premise: the falling vomit course alone gets ③\'s calm card, under either config', () => {
  for (const config of [DEFAULT_CONFIG, EN11_CONFIG]) {
    const r = detectReflections(input(FALLING_VOMIT, MEALS), config)
    assert.equal(r.length, 1, JSON.stringify(r))
    assert.equal(r[0].symptomType, 'vomit')
  }
})

Deno.test('④ — 2 vs 0 is a safety card today and nothing under EN-11', () => {
  const i = input([...FALLING_VOMIT, ...ITCH_2_VS_0], MEALS)
  const off = detectWorsening(i, DEFAULT_CONFIG)
  assert.equal(off.length, 1)
  assert.equal(off[0].symptomType, 'itch')
  assert.deepEqual(detectWorsening(i, EN11_CONFIG), [])
})

Deno.test('CUL-1411 — the split: ③ stays silent over the 2-vs-0 itch under EN-11, as it does today', () => {
  // The mute keeps today's floor, so raising ④'s floor cannot hand the owner a calm "vomit is
  // down from 5" while the itch is rising. Mutation proof: point the mute at the card predicate
  // and this goes red (the vomit reflection returns).
  const i = input([...FALLING_VOMIT, ...ITCH_2_VS_0], MEALS)
  assert.deepEqual(detectReflections(i, DEFAULT_CONFIG), [])
  assert.deepEqual(detectReflections(i, EN11_CONFIG), [])
  // And on the whole Signal: no calm card under EN-11 either, and no safety card the floor removed.
  const types = detectSignals(i, EN11_CONFIG).map((r) => r.finding.type)
  assert.equal(types.includes('reflection'), false, JSON.stringify(types))
})

Deno.test('④ — at the floor the card fires under EN-11 with the tier it fires with today', () => {
  const floor = EN11_CONFIG.en11!.worseningCardMinEpisodes
  const itch = Array.from({ length: floor }, (_, k) => sign('itch', 24 + k))
  const i = input([sign('itch', 18), ...itch], MEALS)
  const off = detectWorsening(i, DEFAULT_CONFIG)
  const on = detectWorsening(i, EN11_CONFIG)
  assert.equal(on.length, 1)
  assert.deepEqual(on, off, 'at or above the floor EN-11 changes nothing about the card')
  // One below the floor: silent under EN-11, a card today.
  const below = input([sign('itch', 18), ...itch.slice(1)], MEALS)
  assert.equal(detectWorsening(below, DEFAULT_CONFIG).length, floor - 1 >= 2 ? 1 : 0)
  assert.deepEqual(detectWorsening(below, EN11_CONFIG), [])
})

// ── ①: the Early tier retired (D5 = B) ─────────────────────────────────────────────────

Deno.test('① — an Early card today is withheld under EN-11; an Established one survives unchanged', () => {
  // Early: three beef treats, each before a vomit; a daily chicken staple washes out.
  const early = input(
    [2, 4, 6].map((d) => sign('vomit', d, 11)),
    [...daily(1, 10, 'chicken', [9]), ...[2, 4, 6].map((d) => meal(d, 10, 'beef'))],
  )
  const off = detectCorrelations(early, DEFAULT_CONFIG)
  assert.equal(off.length, 1)
  assert.equal(off[0].tier, 'early')
  assert.deepEqual(detectCorrelations(early, EN11_CONFIG), [])

  // Established: six beef days, six vomits, p = 0.0156 against a corrected 0.025.
  const established = input(
    [1, 2, 3, 4, 5, 6].map((d) => sign('vomit', d, 11)),
    [...daily(1, 12, 'chicken', [9]), ...[1, 2, 3, 4, 5, 6].map((d) => meal(d, 10, 'beef'))],
  )
  const offE = detectCorrelations(established, DEFAULT_CONFIG)
  assert.equal(offE.length, 1)
  assert.equal(offE[0].tier, 'established')
  assert.deepEqual(detectCorrelations(established, EN11_CONFIG), offE)
})

// ── ①: the control windows after an episode (the bland-diet case) ──────────────────────
//
// The reverse-causation case the issue names. A dog on a chicken staple vomits every third
// morning; after each vomit the owner feeds a bland turkey meal for two days, then chicken again.
// Chicken is in every case window (the evening before) and absent from the nearest controls
// (inside the bland days), so today's matcher reads the STAPLE as the culprit, at Established,
// so that the Early retirement cannot be what removes it under EN-11: this isolates rule 4.
const BLAND_VOMIT_DAYS = [3, 6, 9, 12, 15, 18, 21, 24]
function blandDietRecord(): DetectionInput {
  const meals: MealEvent[] = []
  for (let d = 1; d <= 29; d++) {
    const sinceVomit = BLAND_VOMIT_DAYS.filter((v) => v <= d).map((v) => d - v).sort((a, b) => a - b)[0]
    const bland = sinceVomit === 0 || sinceVomit === 1
    for (const h of [8, 20]) meals.push(meal(d, h, bland ? 'turkey' : 'chicken'))
  }
  return input(BLAND_VOMIT_DAYS.map((d) => sign('vomit', d, 7)), meals)
}

Deno.test('① — the bland-diet case: today the staple reads guilty; under EN-11 it does not', () => {
  const i = blandDietRecord()
  const off = detectCorrelations(i, DEFAULT_CONFIG)
  const chicken = off.find((f) => f.protein === 'chicken')
  assert.ok(chicken, `premise: today blames the staple ${JSON.stringify(off)}`)
  assert.equal(chicken.tier, 'established', 'premise: Established, so only rule 4 can remove it')
  const on = detectCorrelations(i, EN11_CONFIG)
  assert.equal(on.some((f) => f.proteins.includes('chicken')), false, JSON.stringify(on))
  assert.equal(on.some((f) => f.proteins.includes('turkey')), false, 'and the bland meal is never blamed either')
})

Deno.test('① — 24 h of exclusion would not have been enough for a two-day bland diet (why 48)', () => {
  const short = { ...EN11_CONFIG, en11: { ...EN11_CONFIG.en11!, postEpisodeControlExclusionHours: 24 } }
  const chicken = detectCorrelations(blandDietRecord(), short).find((f) => f.protein === 'chicken')
  assert.equal(chicken?.tier, 'established')
})

// ── ①: the reversed-in-time control ────────────────────────────────────────────────────
//
// A food the owner reaches for BECAUSE of the vomiting: rice at noon on each vomit day, and a late
// rice supper on each vomit day but the last of a run. Vomits come in runs of four mornings, so the
// late rice of one vomit day is in the next morning's case window: 6 of 8 episodes are "after
// rice", and today that is Established (p = 0.0156 against 0.025). Backwards, rice follows all 8
// (the noon meal), so the forward card cannot be ordered in time. Isolation: the forward card stays
// Established under EN-11's 48 h exclusion (the controls hold no rice), so only rule 3 removes it;
// mutation-checked by disabling the hit.
function reaction(): DetectionInput {
  const runs = [[2, 3, 4, 5], [14, 15, 16, 17]]
  const meals: MealEvent[] = daily(0, 28, 'chicken', [8, 18])
  for (const run of runs) {
    run.forEach((d, k) => {
      meals.push(meal(d, 12, 'rice'))
      if (k < run.length - 1) meals.push(meal(d, 23, 'rice'))
    })
  }
  return input(runs.flat().map((d) => sign('vomit', d, 10)), meals)
}

Deno.test('① — a food fed after each episode: Established today, withheld under EN-11', () => {
  const off = detectCorrelations(reaction(), DEFAULT_CONFIG)
  const rice = off.find((f) => f.protein === 'rice')
  assert.ok(rice, `premise: today names rice ${JSON.stringify(off)}`)
  assert.equal(rice.tier, 'established')
  assert.deepEqual(detectCorrelations(reaction(), EN11_CONFIG).filter((f) => f.proteins.includes('rice')), [])
})

Deno.test('① — a day-level culprit (fed at both meals of the days it is fed) is NOT withheld: a tie keeps the card', () => {
  // Beef at breakfast and dinner on six beef days, a vomit mid-morning on each: beef is in both
  // windows of every episode. That is a real culprit's day-level exposure, so the reversed
  // control must not take it (strictly stronger backwards, never a tie).
  const beefDays = [2, 5, 8, 11, 14, 17]
  const meals = daily(0, 26, 'chicken', [8, 20]).filter((m) => !beefDays.includes(new Date(m.occurredAt).getUTCDate()))
  for (const d of beefDays) meals.push(meal(d, 8, 'beef'), meal(d, 20, 'beef'))
  const i = input(beefDays.map((d) => sign('vomit', d, 11)), meals)
  const off = detectCorrelations(i, DEFAULT_CONFIG).filter((f) => f.protein === 'beef')
  assert.equal(off.length, 1)
  assert.equal(off[0].tier, 'established', JSON.stringify(off))
  assert.deepEqual(detectCorrelations(i, EN11_CONFIG).filter((f) => f.protein === 'beef'), off)
})

// ── ⑤: the reversed-in-time control ────────────────────────────────────────────────────

/** 12 witnessed vomits at noon, two meals a day, the last six 20 minutes after a snack. */
function rapidRecord(afterToo: boolean): DetectionInput {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  for (let k = 0; k < 12; k++) {
    const d = 17 + k
    symptomEvents.push(sign('vomit', d, 12))
    mealEvents.push(meal(d, 7, 'x', { foodType: 'treat' }), meal(d, 18, 'x', { foodType: 'treat' }))
    if (k >= 6) {
      mealEvents.push(meal(d, 11, 'x', { foodType: 'treat', occurredAt: at(d, 11, 40) }))
      // The household that also feeds within half an hour AFTER the vomit (or logs the two together).
      if (afterToo) mealEvents.push(meal(d, 12, 'x', { foodType: 'treat', occurredAt: at(d, 12, 10) }))
    }
  }
  return input(symptomEvents, mealEvents)
}

Deno.test('⑤ — rapid after meals and not before them: fires today and under EN-11', () => {
  const off = detectPostprandialTiming(rapidRecord(false), DEFAULT_CONFIG)
  assert.equal(off.length, 1)
  assert.deepEqual(detectPostprandialTiming(rapidRecord(false), EN11_CONFIG), off)
})

Deno.test('⑤ — a meal as often within half an hour AFTER the vomit as before it: withheld under EN-11', () => {
  const off = detectPostprandialTiming(rapidRecord(true), DEFAULT_CONFIG)
  assert.equal(off.length, 1, 'premise: today fires on the household rhythm')
  assert.deepEqual(detectPostprandialTiming(rapidRecord(true), EN11_CONFIG), [])
})
