// CUL-1272 (BRK-10) — a chronicity card's firm ask holds until the course's count falls or the
// course stands down, never because a comparison window slid (`holdChronicityTier`).
//
// Run with:  deno test supabase/functions/generate-signal/detection.chronicityHold.test.ts
//
// Every assertion drives the shipped `detectSignals`. The CONTROL (what the card said before
// the hold) is `suppressWorseningWhenChronic` over the two shipped detectors at the same `now`,
// i.e. the exact pre-CUL-1272 composition, never a restatement of either arm. Each fixture first
// asserts the control shows the defect it exists for, so a fixture that stopped exercising the
// defect fails rather than going green over nothing (C-35).
//
// READ TIMES ARE PART OF THE FIXTURE (adversarial pass, 2026-09-26). Home regenerates seconds
// after each log and whenever its 24h cache lapses, so one day holds reads at several times. The
// first version of this suite read at one time of day and the first version of the hold sampled
// on a 24h grid from `now`: each was true by construction at the time of day the other used.
// Fixtures here read at more than one time of day, and the property reads at random times.
//
// TIMEZONE NOTE (B-514): ⑦ and ④ bucket by UTC day and read durations, so UTC literals are the
// honest fixture here; there is no `timezone` field to pin.

import { strict as assert } from 'node:assert'
import {
  detectChronicity,
  detectSignals,
  detectWorsening,
  holdChangeInstants,
  replayInputAsOf,
  suppressWorseningWhenChronic,
  CHRONICITY_HOLD_MAX_DAYS,
  CHRONICITY_HOLD_MAX_STEPS,
  DEFAULT_CONFIG,
  type DetectionInput,
  type MealEvent,
  type PetContext,
  type SymptomChronicityFinding,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

const HOUR = 3_600_000
const DAY = 86_400_000

let idSeq = 0
const nextId = () => `ch-${++idSeq}`

const cat: PetContext = { name: 'Nyx', species: 'cat', dietTrialActive: false }

const iso = (ms: number): string => new Date(ms).toISOString()
/** 07:00 UTC on a 2026 calendar day. */
const morning = (month: number, day: number, hour = 7): number => Date.UTC(2026, month - 1, day, hour)
/** 20:00 UTC on a 2026 calendar day — the evening the Signal is read. */
const evening = (month: number, day: number): number => Date.UTC(2026, month - 1, day, 20)

const vomits = (onsetsMs: readonly number[]): SymptomEvent[] =>
  onsetsMs.map((ms) => ({ id: nextId(), type: 'vomit', occurredAt: iso(ms) }))
const coughEvents = (onsetsMs: readonly number[]): SymptomEvent[] =>
  onsetsMs.map((ms) => ({ id: nextId(), type: 'cough', occurredAt: iso(ms) }))

/** Two protein-less meals a day: logging-eligible for ⑦ and ④, silent for the correlation lane. */
function dailyMeals(fromMs: number, toMs: number): MealEvent[] {
  const meals: MealEvent[] = []
  for (let d = Math.floor(fromMs / DAY); d <= Math.floor(toMs / DAY); d++) {
    for (const h of [8, 18]) {
      meals.push({
        id: nextId(),
        occurredAt: iso(d * DAY + h * HOUR),
        foodItemId: null,
        primaryProtein: null,
        intakeRating: null,
        foodType: 'meal',
        foodLabel: null,
      })
    }
  }
  return meals
}

const inputAt = (nowMs: number, symptomEvents: SymptomEvent[], mealEvents: MealEvent[]): DetectionInput => ({
  pet: cat,
  symptomEvents,
  mealEvents,
  now: iso(nowMs),
})

interface Read {
  tier: 'firm' | 'standard'
  count: number
}

/** The vomiting card as Home shows it (the shipped pipeline), or null when it is not firing. */
function shipped(inp: DetectionInput): Read | null {
  const f = detectSignals(inp, DEFAULT_CONFIG)
    .map((r) => r.finding)
    .find((x): x is SymptomChronicityFinding => x.type === 'symptom_chronicity' && x.symptomType === 'vomit')
  return f ? { tier: f.tier, count: f.episodeCount } : null
}

/** The CONTROL: the same card under the pre-CUL-1272 composition (both arms, no hold). */
function unheld(inp: DetectionInput): Read | null {
  const f = suppressWorseningWhenChronic([...detectChronicity(inp, DEFAULT_CONFIG), ...detectWorsening(inp, DEFAULT_CONFIG)])
    .find((x): x is SymptomChronicityFinding => x.type === 'symptom_chronicity' && x.symptomType === 'vomit')
  return f ? { tier: f.tier, count: f.episodeCount } : null
}

// ── The June shape (the issue's fixture) ──────────────────────────────────────
//
// Modelled on Nyx's record (the page's DAYS array, 6/8 to 6/24): a vomiting course that began in
// mid-May, a dense week in early June that lends the card the firm tier through ④, a quiet
// stretch at an unchanged count, a rise, and the span reaching six weeks on 6/24. Before the fix
// the card asked for a booking, softened for six evenings while the count held and then ROSE, and
// firmed again on its own span.
function juneCourse(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const onsets = [
    morning(5, 13), morning(5, 17), morning(5, 21), morning(5, 25), morning(5, 29),
    morning(6, 2), morning(6, 5),
    // The dense week: ④ fires, and ⑦ inherits firm.
    morning(6, 9), morning(6, 10), morning(6, 11), morning(6, 12), morning(6, 14), morning(6, 15),
    // Quiet 6/16 to 6/20 at an unchanged count, then two episodes on 6/21 (8h apart: two
    // episodes, not one re-log) and one on 6/24 (the span reaches 42 days).
    morning(6, 21), morning(6, 21, 15), morning(6, 24),
  ]
  return { symptomEvents: vomits(onsets), mealEvents: dailyMeals(morning(5, 1), evening(6, 30)) }
}

Deno.test('CUL-1272 — the June shape: the control softens while the count holds and rises (the defect is present)', () => {
  const { symptomEvents, mealEvents } = juneCourse()
  let softenedWithoutFall = 0
  let prev: Read | null = null
  for (let d = 8; d <= 28; d++) {
    const cur = unheld(inputAt(evening(6, d), symptomEvents, mealEvents))
    if (prev && cur && prev.tier === 'firm' && cur.tier === 'standard' && cur.count >= prev.count) softenedWithoutFall++
    prev = cur
  }
  assert.ok(softenedWithoutFall >= 1, 'the fixture must reproduce the BRK-10 softening, or it proves nothing')
  // And the named evenings: after the dense week lapses, the control says "a word with your vet"
  // at 13 and then 15 episodes, having said "book a vet visit" at 13.
  assert.equal(unheld(inputAt(evening(6, 17), symptomEvents, mealEvents))?.tier, 'firm')
  for (const d of [18, 19, 20, 21, 22, 23]) {
    assert.equal(unheld(inputAt(evening(6, d), symptomEvents, mealEvents))?.tier, 'standard', `control 6/${d}`)
  }
  assert.equal(unheld(inputAt(evening(6, 24), symptomEvents, mealEvents))?.tier, 'firm', 'the span arm on 6/24')
})

Deno.test('CUL-1272 — the June shape: the shipped card keeps "book a vet visit" until the count falls', () => {
  const { symptomEvents, mealEvents } = juneCourse()
  const reads: Array<{ d: number; r: Read }> = []
  for (let d = 8; d <= 28; d++) {
    const r = shipped(inputAt(evening(6, d), symptomEvents, mealEvents))
    assert.ok(r, `the vomiting course fires on 6/${d}`)
    reads.push({ d, r })
  }
  const firstFirm = reads.findIndex((x) => x.r.tier === 'firm')
  assert.ok(firstFirm >= 0, 'the course earns firm in the dense week')
  // No evening after the first firm one softens: the count never falls in this record.
  for (let i = firstFirm + 1; i < reads.length; i++) {
    assert.ok(reads[i].r.count >= reads[i - 1].r.count, `fixture: the count never falls (6/${reads[i].d})`)
    assert.equal(reads[i].r.tier, 'firm', `6/${reads[i].d} at ${reads[i].r.count} episodes must stay firm`)
  }
  // The six evenings the control softened are the six the hold now carries.
  for (const d of [18, 19, 20, 21, 22, 23]) {
    assert.equal(shipped(inputAt(evening(6, d), symptomEvents, mealEvents))?.tier, 'firm', `held 6/${d}`)
  }
})

// ── Two reads a day (adversarial D1) ──────────────────────────────────────────
//
// ④ fires for five hours on day 32 (a day-25 episode crosses into the prior week at 14:00, after
// the day-32 episode at 09:00 entered the current one). A hold that sampled 24h back from `now`
// saw that window from a morning read and never from an evening one, so the card read firm every
// morning and standard every evening at the same count.
const D1 = Date.UTC(2026, 1, 1) // 2026-02-01T00:00Z
function fiveHourBlip(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const onsets = [0, 4, 7, 11, 14, 18, 21, 25, 28].map((d) => D1 + d * DAY + 14 * HOUR)
  onsets.push(D1 + 32 * DAY + 9 * HOUR)
  return { symptomEvents: vomits(onsets), mealEvents: dailyMeals(D1 - 20 * DAY, D1 + 40 * DAY) }
}

Deno.test('CUL-1272 — two reads a day: the five-hour ④ window anchors the hold at every time of day', () => {
  const { symptomEvents, mealEvents } = fiveHourBlip()
  // The control: firm only inside the five hours, so the morning read of day 32 is firm and
  // every evening read after it is standard at the same count.
  assert.deepEqual(unheld(inputAt(D1 + 32 * DAY + 9.5 * HOUR, symptomEvents, mealEvents)), { tier: 'firm', count: 10 })
  assert.deepEqual(unheld(inputAt(D1 + 32 * DAY + 19 * HOUR, symptomEvents, mealEvents)), { tier: 'standard', count: 10 })
  for (let d = 32; d <= 36; d++) {
    for (const h of [9.5, 19]) {
      assert.deepEqual(
        shipped(inputAt(D1 + d * DAY + h * HOUR, symptomEvents, mealEvents)),
        { tier: 'firm', count: 10 },
        `day ${d} at ${h}:00`,
      )
    }
  }
})

// ── A stand-down shorter than a day (adversarial D3) ──────────────────────────
//
// A dense run earns firm; then nothing for fifteen days, so the course stands down at 12:00 on
// day 40 (its recency floor), and a relapse at 14:00 the same day brings it back. Two hours of
// stand-down is still a stand-down: the relapsed course earns its own tier.
function shortStandDown(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const onsets = [0, 4, 7, 11, 14, 18, 21, 22, 23, 24, 25].map((d) => D1 + d * DAY + 12 * HOUR)
  onsets.push(D1 + 40 * DAY + 14 * HOUR)
  return { symptomEvents: vomits(onsets), mealEvents: dailyMeals(D1 - 20 * DAY, D1 + 45 * DAY) }
}

Deno.test('CUL-1272 — a two-hour stand-down still ends the course: the relapse earns its own tier', () => {
  const { symptomEvents, mealEvents } = shortStandDown()
  // The dense run earned firm.
  assert.equal(unheld(inputAt(D1 + 25 * DAY + 13 * HOUR, symptomEvents, mealEvents))?.tier, 'firm')
  // Stood down between 12:00 and 14:00 on day 40.
  assert.equal(unheld(inputAt(D1 + 40 * DAY + 13 * HOUR, symptomEvents, mealEvents)), null)
  // After the relapse: standard on both arms, and not held across the gap.
  const after = inputAt(D1 + 40 * DAY + 16 * HOUR, symptomEvents, mealEvents)
  assert.deepEqual(unheld(after), { tier: 'standard', count: 12 })
  assert.deepEqual(shipped(after), { tier: 'standard', count: 12 })
})

// ── A cough before the meal that makes ④ eligible (adversarial D4) ─────────────
//
// Meals are logged on three days only, so ④'s logging floor is what decides whether it can speak.
// The meal at 18:00 on day 27 makes the current week eligible, ④ fires, and the card earns firm.
// A cough logged at 07:00 that day is not something ④'s floor counts; the first day bounds took
// it as the day's first event anyway, dropped the 18:00 instant, and the card read "book" at 7
// and then "a word" at 7.
function coughBeforeMeal(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const symptomEvents = [
    ...vomits([0, 4, 8, 12, 16, 24, 26].map((d) => D1 + d * DAY + 12 * HOUR)),
    ...coughEvents([D1 + 27 * DAY + 7 * HOUR]),
  ]
  const mealEvents = dailyMeals(D1, D1 + 30 * DAY).filter((m) => {
    const ms = Date.parse(m.occurredAt)
    return ms === D1 + 27 * DAY + 18 * HOUR || ms === D1 + 14 * DAY + 18 * HOUR || ms === D1 + 18 * DAY + 18 * HOUR
  })
  return { symptomEvents, mealEvents }
}

Deno.test('CUL-1272 — a cough logged before the meal that makes ④ eligible does not hide that instant', () => {
  const { symptomEvents, mealEvents } = coughBeforeMeal()
  assert.equal(mealEvents.length, 3)
  // The control: firm while ④ lasts, then standard at the same count.
  assert.deepEqual(unheld(inputAt(D1 + 27 * DAY + 19 * HOUR, symptomEvents, mealEvents)), { tier: 'firm', count: 7 })
  const lapsed = unheld(inputAt(D1 + 30 * DAY + 19 * HOUR, symptomEvents, mealEvents))
  assert.deepEqual(lapsed, { tier: 'standard', count: 7 })
  for (const t of [D1 + 27 * DAY + 19 * HOUR, D1 + 28 * DAY + 11 * HOUR, D1 + 28 * DAY + 19 * HOUR, D1 + 30 * DAY + 19 * HOUR]) {
    assert.deepEqual(shipped(inputAt(t, symptomEvents, mealEvents)), { tier: 'firm', count: 7 }, iso(t))
  }
})

// ── Any earned count in the course binds, not only the latest ─────────────────
//
// The span arm's edge (PM ruling (a)): a course firm on its own six-week span whose FIRST episode
// then ages out of the 8-week lookback. The count falls 11 → 10 with it, but this course was
// first judged firm at 9 (the day its span reached 44 days), so "a word" at 10 would contradict
// "book a visit" at 9. It holds. Anchoring on the latest firm instant (11) would release here.
const T0 = Date.UTC(2026, 7, 1, 7) // 2026-08-01T07:00Z
const spanCourse = (withNewEpisode: boolean): SymptomEvent[] => {
  const onsets = [T0]
  for (let d = 16; d <= 52; d += 4) onsets.push(T0 + d * DAY)
  if (withNewEpisode) onsets.push(T0 + 56 * DAY)
  return vomits(onsets)
}
const dayBefore = T0 + 55 * DAY + 13 * HOUR // T0 is inside the 56-day lookback
const dayOf = T0 + 56 * DAY + 13 * HOUR // T0 has aged out

Deno.test('CUL-1272 — an age-out that drops the count still holds while the course was once firm at or below it', () => {
  const symptomEvents = spanCourse(false)
  const mealEvents = dailyMeals(T0 - 20 * DAY, dayOf)
  // The course was first firm at 9 episodes, on its own span.
  assert.deepEqual(unheld(inputAt(T0 + 44 * DAY + 13 * HOUR, symptomEvents, mealEvents)), { tier: 'firm', count: 9 })
  assert.deepEqual(shipped(inputAt(dayBefore, symptomEvents, mealEvents)), { tier: 'firm', count: 11 })
  // The control softens as T0 ages out; the shipped card does not, because 10 ≥ 9.
  assert.deepEqual(unheld(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'standard', count: 10 })
  assert.deepEqual(shipped(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'firm', count: 10 })
})

Deno.test('CUL-1272 — the span arm is held too (ruling (a)): the same age-out with a new episode that day stays firm', () => {
  const symptomEvents = spanCourse(true)
  const mealEvents = dailyMeals(T0 - 20 * DAY, dayOf)
  // Control: the span is 40 days once T0 ages out, so the pre-hold card softens at an unchanged count.
  assert.deepEqual(unheld(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'standard', count: 11 })
  assert.deepEqual(shipped(inputAt(dayBefore, symptomEvents, mealEvents)), { tier: 'firm', count: 11 })
  assert.deepEqual(shipped(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'firm', count: 11 }, 'a slid window is not the pet improving')
})

// ── Release: the count falls below every count the course was firm at ─────────
//
// Three episodes a week for six weeks (a steady course: never worsening once both weeks are
// full, so it is first judged firm on its span, at 19), then one a week for three weeks and
// nothing after day 63. As the dense weeks age out the count falls while the span stays six
// weeks; on day 77 the span drops to 40 days with the count at 12, below the 13 it was last
// judged firm at, a day before the course would stand down on its recency floor.
function denseThenSparse(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[]; start: number } {
  const start = Date.UTC(2026, 5, 1, 9) // 2026-06-01T09:00Z
  const onsets: number[] = []
  for (let w = 0; w < 6; w++) for (const d of [0, 2, 4]) onsets.push(start + (w * 7 + d) * DAY)
  onsets.push(start + 42 * DAY)
  for (const d of [49, 56, 63]) onsets.push(start + d * DAY)
  return { symptomEvents: vomits(onsets), mealEvents: dailyMeals(start - 20 * DAY, start + 90 * DAY), start }
}

Deno.test('CUL-1272 — release: the ask softens once the count is below every count the course was judged firm at', () => {
  const { symptomEvents, mealEvents, start } = denseThenSparse()
  // Walk the course hour by hour (every change instant here is on a whole hour, so :30 reads see
  // every state), tracking the lowest count the CONTROL was firm at.
  let lowestFirm = Infinity
  let released: { at: number; r: Read } | null = null
  for (let h = 0; h < 90 * 24; h++) {
    const t = start + h * HOUR + 30 * 60_000
    const inp = inputAt(t, symptomEvents, mealEvents)
    const ctl = unheld(inp)
    if (ctl === null) {
      assert.equal(released, null, 'the course must not stand down before it releases, or this proves nothing')
      lowestFirm = Infinity
      continue
    }
    if (ctl.tier === 'firm') lowestFirm = Math.min(lowestFirm, ctl.count)
    const cur = shipped(inp)
    assert.ok(cur)
    if (cur.tier === 'standard' && lowestFirm !== Infinity) {
      released = { at: t, r: cur }
      break
    }
  }
  assert.ok(released, 'the course must release inside the fixture')
  assert.ok(released.r.count < lowestFirm, `released at ${released.r.count}, lowest firm count ${lowestFirm}`)
  assert.ok(released.r.count >= DEFAULT_CONFIG.chronicity.minEpisodes, 'still a chronic course when it softens')
})

// ── The course boundary ───────────────────────────────────────────────────────
//
// An earlier course earned firm at 8 episodes, stood down on its recency floor, and a NEW course
// begins once every old episode has left the 8-week lookback (a new episode inside it would revive
// the old course as one long firm course, which the engine is right to call one course). The new
// course is chronic at 'standard' with 8 episodes. A walk that stepped over the silent stretch
// would reach the old course's firm instant and hold the new one at 8 ≥ 8. It must not: whatever
// the old course earned belongs to the old course.
const B = Date.UTC(2026, 3, 1, 7) // 2026-04-01T07:00Z
function twoCourses(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[]; nowMs: number } {
  const old = [0, 4, 8, 12, 16, 21, 22, 23].map((d) => B + d * DAY)
  // Every 3.5 days: two episodes in every 7-day window, so the new course never rises week over
  // week once it is chronic, and never earns firm on its own.
  const fresh = [85, 88.5, 92, 95.5, 99, 102.5, 106, 109.5].map((d) => B + d * DAY)
  const nowMs = B + 110 * DAY + 13 * HOUR
  return { symptomEvents: vomits([...old, ...fresh]), mealEvents: dailyMeals(B - 20 * DAY, nowMs), nowMs }
}

Deno.test('CUL-1272 — a course that stood down never lends its firm tier to the next one', () => {
  const { symptomEvents, mealEvents, nowMs } = twoCourses()
  // The old course did earn firm, at 8 episodes, well inside the walk's reach.
  assert.deepEqual(unheld(inputAt(B + 24 * DAY + 13 * HOUR, symptomEvents, mealEvents)), { tier: 'firm', count: 8 })
  assert.ok((nowMs - (B + 24 * DAY)) / DAY < CHRONICITY_HOLD_MAX_DAYS, 'the old firm instant is inside the walk')
  // It stood down: not firing between the two courses.
  assert.equal(unheld(inputAt(B + 60 * DAY + 13 * HOUR, symptomEvents, mealEvents)), null)
  // The new course is standard on both arms, at a count equal to the old anchor.
  assert.deepEqual(unheld(inputAt(nowMs, symptomEvents, mealEvents)), { tier: 'standard', count: 8 })
  assert.deepEqual(shipped(inputAt(nowMs, symptomEvents, mealEvents)), { tier: 'standard', count: 8 })
})

Deno.test('CUL-1272 — the walk is bounded inside the 180-day fetch', () => {
  const reachDays =
    CHRONICITY_HOLD_MAX_DAYS +
    Math.max(DEFAULT_CONFIG.chronicity.windowDays, 2 * DEFAULT_CONFIG.reflection.windowDays) +
    DEFAULT_CONFIG.symptomEpisodeGapHours / 24
  assert.ok(reachDays <= 180, `a replayed instant must read only events generate-signal fetched (reach ${reachDays} days)`)
  assert.ok(CHRONICITY_HOLD_MAX_STEPS > 0)
})

// ── The generator and the properties ──────────────────────────────────────────
//
// Seeded synthetic courses (never an export: R-1), each a sequence of phases at random daily
// vomiting rates over logged meals. EVERY instant in them sits on a whole hour (episodes, meals,
// and every window offset, which are whole days), so the detectors' answer can only change on a
// whole hour and a read at :30 of each hour sees every state the course is ever in. The
// properties use that to check continuity exactly, without restating the engine.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const GEN_START = Date.UTC(2026, 0, 1, 7)
function syntheticPet(
  rand: () => number,
  days: number,
  /** Log meals on only some days, so ④'s logging floor (three logged days a week) turns on and off. */
  patchyMeals = false,
): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const onsets: number[] = []
  const coughs: number[] = []
  let day = 0
  while (day < days) {
    const len = 5 + Math.floor(rand() * 20)
    const r = rand()
    // Quiet, a steady course, or a burst — the three shapes whose boundaries move the tier.
    const p = r < 0.25 ? 0.02 : r < 0.75 ? 0.25 + rand() * 0.2 : 0.6 + rand() * 0.35
    for (let d = day; d < Math.min(day + len, days); d++) {
      if (rand() < p) {
        const ms = GEN_START + d * DAY + Math.floor(rand() * 12) * HOUR
        onsets.push(ms)
        // A re-log an hour or two later: one episode, chained (the 3h collapse).
        if (rand() < 0.3) onsets.push(ms + (1 + Math.floor(rand() * 2)) * HOUR)
      }
      // A cough on about a third of days: a sign ⑦ counts and ④'s logging floor does NOT, the
      // shape that hid a meal's instant from the first version of the day bounds (adversarial D4).
      if (rand() < 0.35) coughs.push(GEN_START + d * DAY + Math.floor(rand() * 16) * HOUR)
    }
    day += len
  }
  const allMeals = dailyMeals(GEN_START - 20 * DAY, GEN_START + days * DAY)
  const symptomEvents = [...vomits(onsets), ...coughEvents(coughs)]
  if (!patchyMeals) return { symptomEvents, mealEvents: allMeals }
  // Whole days kept or dropped together, in runs, so some weeks fall under the floor.
  const keptDays = new Set<number>()
  let keep = true
  for (let d = Math.floor((GEN_START - 20 * DAY) / DAY); d <= Math.floor((GEN_START + days * DAY) / DAY); d++) {
    if (rand() < 0.2) keep = !keep
    if (keep && rand() < 0.6) keptDays.add(d)
  }
  return {
    symptomEvents,
    mealEvents: allMeals.filter((m) => keptDays.has(Math.floor(Date.parse(m.occurredAt) / DAY))),
  }
}

/** What the walk reads at an instant for its pending cards: (sign, earned tier, count). */
function composedState(inp: DetectionInput, pending: ReadonlySet<SymptomType>): string {
  return JSON.stringify(
    suppressWorseningWhenChronic([...detectChronicity(inp, DEFAULT_CONFIG), ...detectWorsening(inp, DEFAULT_CONFIG)])
      .filter((f): f is SymptomChronicityFinding => f.type === 'symptom_chronicity' && pending.has(f.symptomType))
      .map((f) => [f.symptomType, f.tier, f.episodeCount]),
  )
}

/** ⑦ alone for the pending cards, as the walk reads what it carries across a ⑦ stretch: sign,
 *  tier, count (a carried finding's `daysSinceLastEpisode` goes stale inside a stretch, and
 *  nothing in the walk reads it). */
function chronicityState(inp: DetectionInput, pending: ReadonlySet<SymptomType>): string {
  return JSON.stringify(
    detectChronicity(inp, DEFAULT_CONFIG)
      .filter((f) => pending.has(f.symptomType))
      .map((f) => [f.symptomType, f.tier, f.episodeCount]),
  )
}

Deno.test('CUL-1272 — the replay input is exact: cutting the record to what ⑦ and ④ can see changes nothing they return', () => {
  const rand = mulberry32(12720)
  let compared = 0
  for (let pet = 0; pet < 12; pet++) {
    const { symptomEvents, mealEvents } = syntheticPet(rand, 110)
    const full = inputAt(GEN_START, symptomEvents, mealEvents)
    const asOf = replayInputAsOf(full, DEFAULT_CONFIG)
    // Random instants, plus one aimed at every re-log chain so that ⑦'s lookback edge falls
    // INSIDE the chain: the one place a cut without its gap margin reads the chain's second event
    // as a new episode inside the lookback.
    const ms = symptomEvents
      .filter((e) => e.type === 'vomit')
      .map((e) => Date.parse(e.occurredAt))
      .sort((a, b) => a - b)
    const aimed: number[] = []
    for (let k = 1; k < ms.length; k++) {
      if (ms[k] - ms[k - 1] <= DEFAULT_CONFIG.symptomEpisodeGapHours * HOUR) {
        const inside = Math.floor((ms[k] - ms[k - 1]) / 2)
        // ⑦'s lookback edge, and ④'s two-week edge, each falling inside the chain.
        aimed.push(ms[k - 1] + DEFAULT_CONFIG.chronicity.windowDays * DAY + inside)
        aimed.push(ms[k - 1] + 2 * DEFAULT_CONFIG.reflection.windowDays * DAY + inside)
      }
    }
    assert.ok(aimed.length >= 3, `non-vacuity: pet ${pet} has re-log chains to aim at`)
    const probes = [...aimed, ...Array.from({ length: 40 }, () => GEN_START + Math.floor(rand() * 110 * DAY))]
    for (const t of probes) {
      // Any instant, not only whole hours: the cut must hold between change instants too.
      const whole = inputAt(t, symptomEvents, mealEvents)
      const cutL = asOf(t, 'chronicity')
      const cutW = asOf(t, 'worsening')
      assert.ok(cutW.symptomEvents.length <= cutL.symptomEvents.length)
      assert.ok(cutL.symptomEvents.length <= whole.symptomEvents.length)
      assert.deepEqual(detectChronicity(cutL, DEFAULT_CONFIG), detectChronicity(whole, DEFAULT_CONFIG), `⑦ pet ${pet} t ${iso(t)}`)
      assert.deepEqual(detectWorsening(cutW, DEFAULT_CONFIG), detectWorsening(whole, DEFAULT_CONFIG), `④ pet ${pet} t ${iso(t)}`)
      compared++
    }
  }
  assert.ok(compared >= 400)
})

Deno.test('CUL-1272 — the change instants are complete: between two of them, what the walk reads never changes', () => {
  const rand = mulberry32(12721)
  let stretches = 0
  let changed = 0
  let chronicityStretches = 0
  const pendingSets: ReadonlySet<SymptomType>[] = [new Set(['vomit']), new Set(['cough']), new Set(['vomit', 'cough'])]
  for (let pet = 0; pet < 12; pet++) {
    // Half the pets log meals patchily, so the logging floor's own instants carry state changes.
    const { symptomEvents, mealEvents } = syntheticPet(rand, 110, pet % 2 === 1)
    const now = GEN_START + 110 * DAY
    const pending = pendingSets[pet % pendingSets.length]
    const { all, chronicity } = holdChangeInstants(inputAt(now, symptomEvents, mealEvents), DEFAULT_CONFIG, now, pending)
    const asc = [...all].sort((a, b) => a - b)
    for (let i = 0; i + 1 < asc.length; i++) {
      const lo = asc[i] + 1
      const hi = asc[i + 1] - 1
      if (hi <= lo) continue
      const probe = lo + Math.floor(rand() * (hi - lo))
      const a = composedState(inputAt(lo, symptomEvents, mealEvents), pending)
      const b = composedState(inputAt(probe, symptomEvents, mealEvents), pending)
      assert.equal(b, a, `pet ${pet}: the state moved between ${iso(lo)} and ${iso(probe)} with no change instant between`)
      // Across an instant the state is allowed to move; count how often it does, so the walk is
      // known to be crossing real boundaries and not an empty set of them.
      if (composedState(inputAt(asc[i + 1] + 1, symptomEvents, mealEvents), pending) !== a) changed++
      stretches++
    }
    // The carry: between two ⑦ instants, ⑦ returns the same for the pending cards.
    const ascC = [...chronicity].sort((a, b) => a - b)
    for (let i = 0; i + 1 < ascC.length; i++) {
      const lo = ascC[i] + 1
      const hi = ascC[i + 1] - 1
      if (hi <= lo) continue
      const probe = lo + Math.floor(rand() * (hi - lo))
      assert.equal(
        chronicityState(inputAt(probe, symptomEvents, mealEvents), pending),
        chronicityState(inputAt(lo, symptomEvents, mealEvents), pending),
        `pet ${pet}: ⑦ moved between ${iso(lo)} and ${iso(probe)} with no ⑦ instant between`,
      )
      chronicityStretches++
    }
  }
  assert.ok(stretches >= 1000, `non-vacuity: ${stretches} stretches probed`)
  assert.ok(changed >= 20, `non-vacuity: the state changes across the instants (${changed})`)
  assert.ok(chronicityStretches >= 200, `non-vacuity: ${chronicityStretches} ⑦ stretches probed`)
})

Deno.test('CUL-1272 — property: reads at any time of day; never softer, and never "a word" at a count it said "book" at', () => {
  const rand = mulberry32(1272)
  const DAYS = 100
  const READ_FROM = 50
  let reads = 0
  let heldReads = 0
  let releases = 0
  let controlBroke = 0
  for (let pet = 0; pet < 24; pet++) {
    const { symptomEvents, mealEvents } = syntheticPet(rand, DAYS)
    // Two to four reads a day at random minutes: the owner's own pattern, never one clock time.
    const times: number[] = []
    for (let d = READ_FROM; d < DAYS; d++) {
      const n = 2 + Math.floor(rand() * 3)
      for (let k = 0; k < n; k++) times.push(GEN_START + d * DAY + Math.floor(rand() * DAY))
    }
    times.sort((a, b) => a - b)
    // Per course: the lowest count a firm read showed, for the shipped card and for the control.
    let lowestFirm = Infinity
    let lowestFirmCtl = Infinity
    let prevT: number | null = null
    for (const t of times) {
      // Continuity since the previous read, exactly: every state is visible at :30 of an hour.
      if (prevT !== null) {
        for (let h = Math.ceil((prevT - GEN_START) / HOUR); GEN_START + h * HOUR + 30 * 60_000 < t; h++) {
          if (unheld(inputAt(GEN_START + h * HOUR + 30 * 60_000, symptomEvents, mealEvents)) === null) {
            lowestFirm = Infinity
            lowestFirmCtl = Infinity
            break
          }
        }
      }
      prevT = t
      const inp = inputAt(t, symptomEvents, mealEvents)
      const cur = shipped(inp)
      const ctl = unheld(inp)
      reads++
      assert.equal(cur === null, ctl === null, `pet ${pet} ${iso(t)}: the hold never changes WHETHER the card fires`)
      if (!cur || !ctl) {
        lowestFirm = Infinity
        lowestFirmCtl = Infinity
        continue
      }
      assert.equal(cur.count, ctl.count)
      if (ctl.tier === 'firm') assert.equal(cur.tier, 'firm', `pet ${pet} ${iso(t)}: never softer than the control`)
      if (cur.tier === 'firm' && ctl.tier === 'standard') heldReads++
      if (cur.tier === 'standard') {
        assert.ok(cur.count < lowestFirm, `pet ${pet} ${iso(t)}: "a word" at ${cur.count} after "book" at ${lowestFirm}`)
        if (lowestFirm !== Infinity) releases++
      } else {
        lowestFirm = Math.min(lowestFirm, cur.count)
      }
      if (ctl.tier === 'standard' && ctl.count >= lowestFirmCtl) controlBroke++
      if (ctl.tier === 'firm') lowestFirmCtl = Math.min(lowestFirmCtl, ctl.count)
    }
  }
  assert.ok(reads >= 2000, `non-vacuity: ${reads} reads`)
  assert.ok(controlBroke >= 5, `non-vacuity: the generator must produce the defect in the control (got ${controlBroke})`)
  assert.ok(heldReads >= 10, `non-vacuity: the hold must act (got ${heldReads})`)
  assert.ok(releases >= 1, `non-vacuity: a real fall must still release the ask (got ${releases})`)
})
