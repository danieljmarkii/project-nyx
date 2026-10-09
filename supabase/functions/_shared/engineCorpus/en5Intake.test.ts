// EN-5, intake evidence on the vomit read (Engines v3 PR-30, CUL-1722). Run with:
// deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/en5Intake.test.ts
//
// The ruling (PM, 2026-10-09, threshold A; CUL-1136): an unrated meal is unknown. The cat
// intake arm fires on a half of the record holding at least one RATED meal and none rated
// Most or All, the halves being the 24 h before the vomit, from the vomit to the read (at most
// 24 h), and the 24 h before the read; plus the Noticed predicate in union (I1).
//
// HAND-BUILT, NEVER EXPORTED, like vomitContext.corpus.ts: the "record replay" below restates
// each named read from the facts the step-change brief prints (§3's table), never from an
// export (PMD-12 / CUL-1313). Where the brief does not say what else the week held, the
// fixture adds the least it needs for the SHIPPED arm to fire as it did (one rated meal in the
// week), and says so.
//
// Every test drives the real builder (buildVomitContext), the real flag rule
// (computeContextualFlags) and the real copy, never a restatement (C-34).

import { assertEquals, assertNotEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildVomitContext,
  EN0_CONTEXT_STEP,
  EN5_CONTEXT_STEP,
  vomitAnchoredReads,
  type BuildVomitContextArgs,
  type ContextInput,
  type IntakeRecord,
  type VomitContextRows,
  type VomitContextStep,
} from '../../analyze-vomit/context.ts'
import { buildEn0ContextualReadText, buildEn0PhotoFirstReadText, computeContextualFlags } from '../../analyze-vomit/index.ts'
import { detectWeightLoss, type DetectionInput } from '../../generate-signal/detection.ts'
import type { WeightReading } from '../../../../lib/weightStory.ts'
import type { EngineFlags } from '../engineFlags.ts'
import { VOMIT_CONTEXT_CORPUS } from './vomitContext.corpus.ts'

const H = 3_600_000
const OFF: EngineFlags = { on: [], readOk: true }
const EN0: EngineFlags = { on: ['engines_v3_en0'], readOk: true }
const EN5: EngineFlags = { on: ['engines_v3_en5'], readOk: true }
const BOTH: EngineFlags = { on: ['engines_v3_en0', 'engines_v3_en5'], readOk: true }

const iso = (ms: number) => new Date(ms).toISOString()
const meal = (ms: number, rating: string | null, foodType: string | null = 'meal', foodItemId: string | null = 'food-a') => ({
  occurred_at: iso(ms),
  meals: { intake_rating: rating, food_item_id: foodItemId, food_items: { food_type: foodType } },
})

function ctx(rows: VomitContextRows, vomitMs: number, nowMs: number, engineFlags: EngineFlags, species = 'cat', step?: VomitContextStep, en5Step?: VomitContextStep): ContextInput {
  const args: BuildVomitContextArgs = { rows, thisEventOccurredAt: iso(vomitMs), species, nowMs, engineFlags }
  return buildVomitContext(args, step ?? EN0_CONTEXT_STEP, en5Step ?? EN5_CONTEXT_STEP)
}
const intakeFires = (c: ContextInput) => computeContextualFlags(c).includes('feline_reduced_intake')
const rowsOf = (meals: ReturnType<typeof meal>[], vomitMs: number): VomitContextRows => ({
  vomits: [{ occurred_at: iso(vomitMs) }],
  lethargy: [],
  meals,
})

// ── The gate (C-36): flag-off is the EN-5 step's ABSENCE ─────────────────────────────────

const SENTINEL: VomitContextStep = (prior) => ({ ...prior, en5IntakeFires: !(prior.en5IntakeFires ?? false), hasRecentLethargy: !prior.hasRecentLethargy })

Deno.test('flag-off equals the EN-5 step\'s absence, with or without EN-0, even with a step that changes everything', () => {
  let cases = 0
  for (const c of VOMIT_CONTEXT_CORPUS) {
    for (const flags of [OFF, EN0, { on: [], readOk: false }] as EngineFlags[]) {
      const args: BuildVomitContextArgs = { rows: c.rows, thisEventOccurredAt: c.thisEventOccurredAt, species: c.species, nowMs: Date.parse(c.nowIso), engineFlags: flags }
      assertEquals(buildVomitContext(args, EN0_CONTEXT_STEP, SENTINEL), buildVomitContext(args, EN0_CONTEXT_STEP, (p) => p), c.name)
      cases++
    }
  }
  assertStrictEquals(cases >= 36, true)
})

Deno.test('the gate opens for the key: the EN-5 step runs on every case', () => {
  for (const c of VOMIT_CONTEXT_CORPUS) {
    for (const flags of [EN5, BOTH]) {
      const args: BuildVomitContextArgs = { rows: c.rows, thisEventOccurredAt: c.thisEventOccurredAt, species: c.species, nowMs: Date.parse(c.nowIso), engineFlags: flags }
      assertNotEquals(buildVomitContext(args, EN0_CONTEXT_STEP, SENTINEL), buildVomitContext(args, EN0_CONTEXT_STEP, (p) => p), c.name)
    }
  }
})

Deno.test('dogs are untouched: EN-5 changes no flag for a dog', () => {
  for (const c of VOMIT_CONTEXT_CORPUS.filter((c) => c.species === 'dog')) {
    const args = (engineFlags: EngineFlags): BuildVomitContextArgs => ({ rows: c.rows, thisEventOccurredAt: c.thisEventOccurredAt, species: c.species, nowMs: Date.parse(c.nowIso), engineFlags })
    assertEquals(buildVomitContext(args(EN5)), buildVomitContext(args(OFF)), c.name)
    assertEquals(buildVomitContext(args(BOTH)), buildVomitContext(args(EN0)), c.name)
  }
})

// ── The record replay (brief §3), hand-built ─────────────────────────────────────────────

interface Replay {
  name: string
  vomitMs: number
  nowMs: number
  meals: ReturnType<typeof meal>[]
  shippedFires: boolean
  en5Fires: boolean
  record?: IntakeRecord
}

const V819 = Date.parse('2026-08-19T17:40:00Z')
const V904 = Date.parse('2026-09-04T07:02:00Z')
const V922 = Date.parse('2026-09-22T01:30:00Z')
const V727 = Date.parse('2026-07-27T10:56:00Z')

const REPLAY: Replay[] = [
  {
    // Six meals in the 24 h before, all unrated; read two days late. The week's one rated meal
    // (an All, 2.4 days before) is what let the shipped arm call this cat "not eating".
    name: '8/19: six unrated meals, read two days late, goes quiet',
    vomitMs: V819,
    nowMs: V819 + 48 * H,
    meals: [...[2, 5, 8, 12, 16, 20].map((h) => meal(V819 - h * H, null)), meal(V819 - 58 * H, 'all')],
    shippedFires: true,
    en5Fires: false,
  },
  {
    // Four meals in the 24 h before, all unrated. The brief does not say what rated the week;
    // one Some three days earlier is the least that makes the shipped arm fire.
    name: '9/4: four unrated meals goes quiet',
    vomitMs: V904,
    nowMs: V904 + 10 * 60_000,
    meals: [...[4, 9, 14, 19].map((h) => meal(V904 - h * H, null)), meal(V904 - 72 * H, 'some')],
    shippedFires: true,
    en5Fires: false,
  },
  {
    // Six meals in the window: one Picked, five unrated. Under threshold A the Picked meal is
    // a rated meal with nothing eaten well, so the arm still fires, and its sentence now says
    // exactly that (one rated meal, five with no rating) instead of "hasn't eaten a full meal".
    // The issue's acceptance line expected 9/22 to go quiet; that holds only under threshold B.
    // Reported on CUL-1136. The read is call-worthy anyway for the possible foreign material.
    name: '9/22: one Picked among five unrated still fires under threshold A, and says so',
    vomitMs: V922,
    nowMs: V922 + 5 * 60_000,
    meals: [meal(V922 - 3.5 * H, 'picked'), ...[7, 11, 15, 19, 23].map((h) => meal(V922 - h * H, null))],
    shippedFires: true,
    en5Fires: true,
    record: { window: 'before_vomit', mealsLogged: 6, mealsRated: 1 },
  },
  {
    // Trial day 2: three Refused, two Picked, one Some of the new diet in 24 h, and a seventh
    // meal unrated (migration 086's note: "six of seven"). Stays call today.
    name: '7/27: the trial-day refusals stay call today',
    vomitMs: V727,
    nowMs: V727 + 15 * 60_000,
    meals: [
      ...(['refused', 'refused', 'refused', 'picked', 'picked', 'some'] as const).map((r, i) => meal(V727 - (2 + i * 3.5) * H, r)),
      meal(V727 - 22 * H, null),
    ],
    shippedFires: true,
    en5Fires: true,
    record: { window: 'before_vomit', mealsLogged: 7, mealsRated: 6 },
  },
]

Deno.test('record replay: the unrated-only flags go quiet, 7/27 stays, 9/22 states its record', () => {
  for (const r of REPLAY) {
    const rows = rowsOf(r.meals, r.vomitMs)
    assertStrictEquals(intakeFires(ctx(rows, r.vomitMs, r.nowMs, OFF)), r.shippedFires, `${r.name} (shipped)`)
    for (const flags of [EN5, BOTH]) {
      const on = ctx(rows, r.vomitMs, r.nowMs, flags)
      assertStrictEquals(intakeFires(on), r.en5Fires, `${r.name} (${flags.on.join('+')})`)
      assertEquals(on.intakeRecord, r.record, r.name)
    }
  }
})

Deno.test('record replay: the words each read now says', () => {
  const said = (r: Replay) => {
    const on = ctx(rowsOf(r.meals, r.vomitMs), r.vomitMs, r.nowMs, EN5)
    return buildEn0PhotoFirstReadText('Nyx', computeContextualFlags(on), ['suspected_foreign_material'], on.intakeRecord)
  }
  assertStrictEquals(
    said(REPLAY[2]),
    "I can see something that doesn't look like food in this photo. When I read this, one rated meal was logged for Nyx in the 24 hours before this vomit, and it wasn't marked Most or All. Another 5 had no rating. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
  const on727 = ctx(rowsOf(REPLAY[3].meals, V727), V727, REPLAY[3].nowMs, EN5)
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', computeContextualFlags(on727), on727.intakeRecord),
    "When I read this, 6 rated meals were logged for Nyx in the 24 hours before this vomit, and none was marked Most or All. Another one had no rating. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

// ── CUL-1195's fixture: the alternate-night refuser ──────────────────────────────────────

Deno.test('CUL-1195: breakfast unrated, dinner refused on alternate nights, a vomit minutes after each refusal, fires every time', () => {
  const day0 = Date.parse('2026-09-01T00:00:00Z')
  const meals: ReturnType<typeof meal>[] = []
  const vomits: number[] = []
  for (let d = 0; d < 22; d++) {
    meals.push(meal(day0 + d * 24 * H + 8 * H, null))
    const dinner = day0 + d * 24 * H + 22 * H
    if (d % 2 === 0) {
      meals.push(meal(dinner, 'refused'))
      vomits.push(dinner + 5 * 60_000)
    } else {
      meals.push(meal(dinner, null))
    }
  }
  assertStrictEquals(vomits.length, 11)
  for (const v of vomits) {
    const visible = meals.filter((m) => Date.parse(m.occurred_at) <= v + 10 * 60_000)
    const on = ctx(rowsOf(visible, v), v, v + 10 * 60_000, BOTH)
    assertStrictEquals(intakeFires(on), true, iso(v))
    assertEquals(on.intakeRecord?.window, 'before_vomit', iso(v))
  }
})

// ── The halves: what each one adds ───────────────────────────────────────────────────────

Deno.test('BRK-2: eating before a vomit never cancels refusals after it (louder than shipped)', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 1 * H, 'all'), meal(v + 4 * H, 'refused'), meal(v + 9 * H, 'refused')], v)
  const now = v + 10 * H
  assertStrictEquals(intakeFires(ctx(rows, v, now, OFF)), false, 'shipped: the All in the read window cancels')
  const on = ctx(rows, v, now, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'after_vomit', mealsLogged: 2, mealsRated: 2, cappedAt24h: false })
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', computeContextualFlags(on), on.intakeRecord).startsWith('When I read this, 2 rated meals had been logged for Nyx since this vomit, and none was marked Most or All.'),
    true,
  )
})

Deno.test('the after-vomit half stops at 24 h: a re-read days later is not judged by later refusals', () => {
  // A refusal 30 h after the vomit, read 60 h after it: past the after-vomit half's 24 h and
  // already outside the read's own 24 h, so only the cap stands between it and the old vomit.
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 2 * H, 'all'), meal(v + 30 * H, 'refused')], v)
  assertStrictEquals(intakeFires(ctx(rows, v, v + 60 * H, EN5)), false)
  // Inside the cap the same refusal speaks.
  const inside = rowsOf([meal(v - 2 * H, 'all'), meal(v + 20 * H, 'refused')], v)
  assertStrictEquals(intakeFires(ctx(inside, v, v + 60 * H, EN5)), true)
})

Deno.test('unknowns never cancel a recorded refusal', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 3 * H, 'refused'), meal(v - 2 * H, null), meal(v - 1 * H, null), meal(v - 0.5 * H, null)], v)
  const on = ctx(rows, v, v + 5 * 60_000, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'before_vomit', mealsLogged: 4, mealsRated: 1 })
})

Deno.test('a meal rated Most or All in a half silences that half, as today', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 3 * H, 'refused'), meal(v - 1 * H, 'most')], v)
  assertStrictEquals(intakeFires(ctx(rows, v, v + 5 * 60_000, EN5)), false)
})

Deno.test('I1: the Noticed predicate fires in union where no rating half does (louder)', () => {
  // Refused and Picked 35 to 40 hours before the vomit, then a Most at 30 h; a treat eaten in
  // full two hours before. The shipped arm reads the treat's All as eating and stays quiet, and
  // so do EN-5's rating halves (a treat marked All cancels them, as today). The Noticed
  // predicate sets treats aside, so its newest three qualifying meals hold two refusals.
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 40 * H, 'refused'), meal(v - 35 * H, 'picked'), meal(v - 30 * H, 'most'), meal(v - 2 * H, 'all', 'treat')], v)
  assertStrictEquals(intakeFires(ctx(rows, v, v + 5 * 60_000, OFF)), false, 'shipped: the treat marked All cancels')
  const on = ctx(rows, v, v + 5 * 60_000, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'noticed', at: 'vomit', mealsLogged: 3, mealsRated: 3, refusedOrPicked: 2 })
  assertStrictEquals(
    buildEn0ContextualReadText('Pixel', computeContextualFlags(on), on.intakeRecord),
    "Of the last 3 rated meals logged for Pixel before this vomit, 2 had been marked Refused or Picked. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('the Noticed predicate sets treats and free-fed bowls aside, as it does on Home', () => {
  // Three refusals 30 to 40 hours before the vomit, outside every 24 h rating half: a treat, a
  // free-fed bowl and a meal. With the bowl's span read, one qualifying refusal is below the
  // floor. Without it (the bowl read failed or the pet has none), the bowl counts: the louder
  // reading of an unknown.
  const v = Date.parse('2026-09-10T08:00:00Z')
  const refusals = [meal(v - 40 * H, 'refused', 'treat'), meal(v - 35 * H, 'refused', 'meal', 'bowl'), meal(v - 30 * H, 'refused')]
  const withBowl: VomitContextRows = { ...rowsOf(refusals, v), freeFedSpans: [{ foodItemId: 'bowl', fromMs: v - 100 * H, untilMs: Infinity }] }
  // Noticed sets the bowl aside and stays below its floor; the provisional last-rated backstop
  // (newest rating a refusal) is what speaks, and the record says which one did.
  assertEquals(ctx(withBowl, v, v + 5 * 60_000, EN5).intakeRecord?.window, 'last_rated')
  const noBowl = rowsOf(refusals, v)
  const on = ctx(noBowl, v, v + 5 * 60_000, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'noticed', at: 'vomit', mealsLogged: 2, mealsRated: 2, refusedOrPicked: 2 })
})

// ── Two properties over seeded records ───────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const RATINGS = [null, null, null, 'refused', 'picked', 'some', 'most', 'all'] as const

function randomRecord(seed: number) {
  const r = rng(seed)
  const vomitMs = Date.parse('2026-09-15T12:00:00Z') + Math.floor(r() * 48) * H
  const nowMs = vomitMs + Math.floor(r() * 72 * 60) * 60_000
  const meals = Array.from({ length: Math.floor(r() * 18) }, () =>
    meal(vomitMs - 8 * 24 * H + Math.floor(r() * (8 * 24 * 60 + (nowMs - vomitMs) / 60_000)) * 60_000, RATINGS[Math.floor(r() * RATINGS.length)], r() < 0.15 ? 'treat' : 'meal'),
  ).filter((m) => Date.parse(m.occurred_at) <= nowMs)
  return { vomitMs, nowMs, rows: rowsOf(meals, vomitMs) }
}

Deno.test('property: EN-5 is quieter than shipped ONLY where the read window held no rated meal', () => {
  let shippedFired = 0
  let quieter = 0
  for (let seed = 1; seed <= 3000; seed++) {
    const { vomitMs, nowMs, rows } = randomRecord(seed)
    const shipped = intakeFires(ctx(rows, vomitMs, nowMs, OFF))
    const en5 = intakeFires(ctx(rows, vomitMs, nowMs, BOTH))
    if (shipped) shippedFired++
    if (shipped && !en5) {
      quieter++
      const readWindowRated = rows.meals.some((m) => {
        const t = Date.parse(m.occurred_at)
        const rating = (m.meals as { intake_rating: string | null }).intake_rating
        return t >= nowMs - 24 * H && t <= nowMs && rating !== null
      })
      assertStrictEquals(readWindowRated, false, `seed ${seed}: quieter over a rated read window`)
    }
  }
  // Non-vacuity: the shipped arm fired often, and EN-5 did go quiet somewhere.
  assertStrictEquals(shippedFired > 300, true, `shipped fired ${shippedFired}`)
  assertStrictEquals(quieter > 20, true, `quieter ${quieter}`)
})

Deno.test('property: an unrated meal never fires the arm (unknown is never "didn\'t eat")', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { vomitMs, nowMs, rows } = randomRecord(seed)
    const unratedOnly: VomitContextRows = {
      ...rows,
      meals: rows.meals.map((m) => ({ ...m, meals: { ...(m.meals as object), intake_rating: null } as never })),
    }
    assertStrictEquals(intakeFires(ctx(unratedOnly, vomitMs, nowMs, BOTH)), false, `seed ${seed}`)
  }
})

// ── P3 (brief §8): 42 unrated servings in a week while weight falls ──────────────────────
// The counterexample that made EN-5 "never alone": the intake arm goes silent on unrated
// meals, so the weight lane (EN-8, PR-19) must catch the cat. Seeded over servings' timing and
// the size of the fall; one Some five days back keeps the shipped arm firing, so the property
// shows the trade itself: EN-5 removes a flag the shipped arm raised, and EN-8 raises the
// weight finding instead.

const home = (kg: number, ms: number): WeightReading => ({ kg, occurredAt: iso(ms), source: 'home_scale' })

Deno.test('P3: 42 unrated servings in a week while weight falls: intake goes quiet, the weight lane catches her', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed)
    const vomitMs = Date.parse('2026-08-21T07:00:00Z') + Math.floor(r() * 12) * H
    const nowMs = vomitMs + 10 * 60_000
    const servings = Array.from({ length: 42 }, (_, i) => meal(vomitMs - 7 * 24 * H + i * 4 * H + Math.floor(r() * 120) * 60_000, null))
      .filter((m) => Date.parse(m.occurred_at) <= vomitMs)
    const rows = rowsOf([...servings, meal(vomitMs - 5 * 24 * H, 'some')], vomitMs)
    assertStrictEquals(intakeFires(ctx(rows, vomitMs, nowMs, OFF)), true, `seed ${seed}: the shipped arm fired on the unrated week`)
    assertStrictEquals(intakeFires(ctx(rows, vomitMs, nowMs, BOTH)), false, `seed ${seed}: EN-5 reads the unrated week as unknown`)

    const highKg = 3.8 + r() * 2
    const lowKg = highKg * (1 - (0.1 + r() * 0.1))
    const day = 24 * H
    const input: DetectionInput = {
      pet: { name: 'Nyx', species: 'cat', dietTrialActive: false },
      symptomEvents: [],
      mealEvents: [],
      now: iso(nowMs),
      weight: {
        // Each pair differs by a scale's jitter (10 to 60 g). Two readings equal to the gram
        // never pair (lib/weightStory.ts EXACT_COPY_NEVER_PAIRS, ⚠ awaiting the PM's sign-off
        // on CUL-1413): with that rule, a P3 cat whose owner saved the pre-filled low twice is
        // silent in BOTH lanes unless the fall clears 0.6 kg. Stated here, reported on CUL-1136.
        readings: [
          home(highKg, vomitMs - 70 * day),
          home(highKg + 0.01 + r() * 0.05, vomitMs - 63 * day),
          home(lowKg, vomitMs - 6 * day),
          home(lowKg - 0.01 - r() * 0.05, vomitMs - 1 * day),
        ],
        dateOfBirth: '2023-09-01',
      },
    }
    const found = detectWeightLoss(input)
    assertStrictEquals(found.length, 1, `seed ${seed}: ${highKg.toFixed(2)} → ${lowKg.toFixed(2)} kg`)
  }
})

// ── The words (Pattern 8; nyx-voice) ─────────────────────────────────────────────────────
// Every sentence EN-5 can build: never reassures, never shouts, never concludes "hasn't
// eaten", never dated relative to the reader's day, always routes to the vet, and every
// count of unrated meals is said as "no rating", never as eating or not eating.

const REASSURE_VOCAB = /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i

Deno.test('EN-5 copy: every sentence it can build never reassures, never concludes, always routes to the vet', () => {
  const records: IntakeRecord[] = []
  for (const window of ['before_vomit', 'after_vomit', 'before_read'] as const) {
    for (const mealsRated of [1, 2, 6]) {
      for (const unrated of [0, 1, 5]) {
        for (const cappedAt24h of window === 'after_vomit' ? [false, true] : [undefined]) {
          records.push({ window, mealsLogged: mealsRated + unrated, mealsRated, ...(cappedAt24h === undefined ? {} : { cappedAt24h }) })
        }
      }
    }
  }
  for (const at of ['vomit', 'read', 'after_vomit_24h'] as const) {
    for (const n of [2, 3]) for (const k of [2, 3].filter((k) => k <= n)) records.push({ window: 'noticed', at, mealsLogged: n, mealsRated: n, refusedOrPicked: k })
  }
  for (const hoursBefore of [1, 25, 70]) for (const rating of ['refused', 'picked'] as const) records.push({ window: 'last_rated', mealsLogged: 1, mealsRated: 1, hoursBefore, rating })
  let seen = 0
  for (const pet of ['Pixel', '']) {
    for (const record of records) {
      for (const t of [
        buildEn0ContextualReadText(pet, ['feline_reduced_intake'], record),
        buildEn0PhotoFirstReadText(pet, ['feline_reduced_intake', 'repeated_vomiting'], ['blood'], record),
      ]) {
        seen++
        assertStrictEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
        assertStrictEquals(t.includes('!'), false, t)
        assertStrictEquals(/hasn't eaten|didn't eat|not eating|\brecently\b|\byesterday\b|\btoday\b|\blast night\b/i.test(t), false, `concluded or dated: "${t}"`)
        assertStrictEquals(/vet/.test(t), true, t)
        assertStrictEquals(/\b1 (meal|more|rated|hours)|Another 1\b/.test(t), false, `a bare "1": "${t}"`)
      }
    }
  }
  assertStrictEquals(seen > 100, true)
})

// ── The adversarial pass's counterexamples, kept (CUL-1722) ──────────────────────────────

Deno.test('B: an after-vomit fire read more than a day later says "in the 24 hours after", true when stored', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 30 * H, 'all'), meal(v + 5 * H, 'refused'), meal(v + 30 * H, 'all')], v)
  const on = ctx(rows, v, v + 48 * H, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'after_vomit', mealsLogged: 1, mealsRated: 1, cappedAt24h: true })
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', computeContextualFlags(on), on.intakeRecord),
    "When I read this, one rated meal had been logged for Nyx in the 24 hours after this vomit, and it wasn't marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('C: the Noticed predicate firing at the vomit is described before the vomit, not at the read', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 40 * H, 'refused'), meal(v - 30 * H, 'refused'), meal(v - 20 * H, 'all'), meal(v + 3 * H, 'all'), meal(v + 10 * H, 'all')], v)
  const on = ctx(rows, v, v + 26 * H, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord?.at, 'vomit')
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', computeContextualFlags(on), on.intakeRecord).startsWith('Of the last 3 rated meals logged for Nyx before this vomit, 2 had been marked Refused or Picked.'),
    true,
  )
})

Deno.test('A (provisional): a refusal 25 h before the vomit with nothing logged since still fires; 6/7 stays quiet', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 50 * H, 'all'), meal(v - 40 * H, 'all'), meal(v - 25 * H, 'refused')], v)
  assertStrictEquals(intakeFires(ctx(rows, v, v + 1 * H, OFF)), true, 'shipped fires')
  const on = ctx(rows, v, v + 1 * H, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord, { window: 'last_rated', mealsLogged: 1, mealsRated: 1, hoursBefore: 25, rating: 'refused' })
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', computeContextualFlags(on), on.intakeRecord),
    "The last rated meal logged for Nyx before this vomit, about 25 hours earlier, was marked Refused. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
  // Unrated meals since the refusal do not cancel it either.
  const withUnrated = rowsOf([meal(v - 40 * H, 'all'), meal(v - 25 * H, 'picked'), meal(v - 10 * H, null), meal(v - 2 * H, null)], v)
  assertEquals(ctx(withUnrated, v, v + 1 * H, EN5).intakeRecord?.window, 'last_rated')
  // Past the three-day bound it is not "the last rated meal" any more.
  const old = rowsOf([meal(v - 80 * H, 'refused')], v)
  assertStrictEquals(intakeFires(ctx(old, v, v + 1 * H, EN5)), false)
  // The 6/7 shape: the newest rating was Most, nothing logged since. Shipped fires; EN-5 does not.
  const sixSeven = rowsOf([meal(v - 49 * H, 'most')], v)
  assertStrictEquals(intakeFires(ctx(sixSeven, v, v, OFF)), true)
  assertStrictEquals(intakeFires(ctx(sixSeven, v, v, EN5)), false)
})

Deno.test('L: a vomit stamped a minute ahead of the server clock still sees the refusal just before it', () => {
  const v = Date.parse('2026-09-10T08:00:00Z')
  const rows = rowsOf([meal(v - 30 * H, 'all'), meal(v - 60_000, 'refused')], v)
  const on = ctx(rows, v, v - 2 * 60_000, EN5)
  assertStrictEquals(intakeFires(on), true)
  assertEquals(on.intakeRecord?.window, 'before_vomit')
})

Deno.test('J: under EN-5 the anchored meal read reaches 24 h after the vomit; flag-off it stops at the vomit', () => {
  const v = Date.parse('2026-09-01T08:00:00Z')
  const now = v + 9 * 24 * H
  const on = vomitAnchoredReads(now, iso(v), EN5)
  assertStrictEquals(on?.meals?.toIso, iso(v + 24 * H))
  assertStrictEquals(vomitAnchoredReads(now, iso(v), EN0)?.meals?.toIso, iso(v))
  assertStrictEquals(vomitAnchoredReads(now, iso(v), OFF), null)
})
