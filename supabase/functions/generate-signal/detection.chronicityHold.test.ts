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
// TIMEZONE NOTE (B-514): ⑦ and ④ bucket by UTC day and read durations, so UTC literals are the
// honest fixture here; there is no `timezone` field to pin.

import { strict as assert } from 'node:assert'
import {
  detectChronicity,
  detectSignals,
  detectWorsening,
  suppressWorseningWhenChronic,
  CHRONICITY_HOLD_MAX_DAYS,
  DEFAULT_CONFIG,
  type DetectionInput,
  type MealEvent,
  type PetContext,
  type SymptomChronicityFinding,
  type SymptomEvent,
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

// ── Release: the count falls ──────────────────────────────────────────────────
//
// The span arm's edge (PM ruling (a)): a course firm on its own six-week span, whose FIRST episode
// then ages out of the 8-week lookback. With nothing new that day the count falls, so the ask may
// soften. With a new episode the same day the count holds, so it may not.
const T0 = Date.UTC(2026, 7, 1, 7) // 2026-08-01T07:00Z
const spanCourse = (withNewEpisode: boolean): SymptomEvent[] => {
  const onsets = [T0]
  for (let d = 16; d <= 52; d += 4) onsets.push(T0 + d * DAY)
  if (withNewEpisode) onsets.push(T0 + 56 * DAY)
  return vomits(onsets)
}
const dayBefore = T0 + 55 * DAY + 13 * HOUR // T0 is inside the 56-day lookback
const dayOf = T0 + 56 * DAY + 13 * HOUR // T0 has aged out

Deno.test('CUL-1272 — release: a firm span whose first episode ages out softens when the count falls', () => {
  const symptomEvents = spanCourse(false)
  const mealEvents = dailyMeals(T0 - 20 * DAY, dayOf)
  const before = shipped(inputAt(dayBefore, symptomEvents, mealEvents))
  const after = shipped(inputAt(dayOf, symptomEvents, mealEvents))
  assert.deepEqual(before, { tier: 'firm', count: 11 }, 'firm on its own six-week span')
  assert.deepEqual(after, { tier: 'standard', count: 10 }, 'the count fell by the episode that aged out: the ask may soften')
})

Deno.test('CUL-1272 — the span arm is held too (ruling (a)): the same age-out with a new episode that day stays firm', () => {
  const symptomEvents = spanCourse(true)
  const mealEvents = dailyMeals(T0 - 20 * DAY, dayOf)
  // Control: the span is 40 days once T0 ages out, so the pre-hold card softens at an unchanged count.
  assert.deepEqual(unheld(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'standard', count: 11 })
  assert.deepEqual(shipped(inputAt(dayBefore, symptomEvents, mealEvents)), { tier: 'firm', count: 11 })
  assert.deepEqual(shipped(inputAt(dayOf, symptomEvents, mealEvents)), { tier: 'firm', count: 11 }, 'a slid window is not the pet improving')
})

// ── The course boundary ───────────────────────────────────────────────────────
//
// An earlier course earned firm at 8 episodes, stood down on its recency floor, and a NEW course
// begins once every old episode has left the 8-week lookback (a new episode inside it would revive
// the old course as one long firm course, which the engine is right to call one course). The new
// course is chronic at 'standard' with 8 episodes. A walk that stepped over the silent days would
// reach the old course's firm day and hold the new one at 8 ≥ 8. It must not: whatever the old
// course earned belongs to the old course.
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
  assert.ok((nowMs - (B + 24 * DAY)) / DAY < CHRONICITY_HOLD_MAX_DAYS, 'the old firm day is inside the walk')
  // It stood down: not firing between the two courses.
  assert.equal(unheld(inputAt(B + 60 * DAY + 13 * HOUR, symptomEvents, mealEvents)), null)
  // The new course is standard on both arms, at a count equal to the old anchor.
  assert.deepEqual(unheld(inputAt(nowMs, symptomEvents, mealEvents)), { tier: 'standard', count: 8 })
  assert.deepEqual(shipped(inputAt(nowMs, symptomEvents, mealEvents)), { tier: 'standard', count: 8 })
})

Deno.test('CUL-1272 — the walk is bounded inside the 180-day fetch', () => {
  assert.ok(
    CHRONICITY_HOLD_MAX_DAYS + DEFAULT_CONFIG.chronicity.windowDays <= 180,
    'a replayed day must read only events generate-signal fetched (LOOKBACK_DAYS 180)',
  )
})

// ── The property ──────────────────────────────────────────────────────────────
//
// Seeded synthetic courses (never an export: R-1), each a sequence of phases at random daily
// vomiting rates over logged meals. Every evening in the read range is checked two ways:
//   (1) the shipped tier is never softer than the control's (the hold can only add a warning);
//   (2) between two consecutive evenings on which the course fires, a firm ask never softens
//       unless the count fell.
// The non-vacuity floors prove the generator produces the defect (control drops without a fall),
// the hold acting on it, AND real releases (drops with a fall) — so "always firm" cannot pass.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

Deno.test('CUL-1272 — property: never softer than before, and no firm → standard without a fall in the count', () => {
  const rand = mulberry32(1272)
  const START = Date.UTC(2026, 0, 1, 7)
  const HISTORY_DAYS = 110
  const READ_FROM = 50 // evenings 50..109 are read
  let controlDropsWithoutFall = 0
  let heldEvenings = 0
  let releases = 0
  let evenings = 0

  for (let pet = 0; pet < 40; pet++) {
    const onsets: number[] = []
    let day = 0
    while (day < HISTORY_DAYS) {
      const len = 5 + Math.floor(rand() * 20)
      const r = rand()
      // Quiet, a steady course, or a burst — the three shapes whose boundaries move the tier.
      const p = r < 0.25 ? 0.02 : r < 0.75 ? 0.25 + rand() * 0.2 : 0.6 + rand() * 0.35
      for (let d = day; d < Math.min(day + len, HISTORY_DAYS); d++) {
        if (rand() < p) onsets.push(START + d * DAY + Math.floor(rand() * 12) * HOUR)
      }
      day += len
    }
    const symptomEvents = vomits(onsets)
    const mealEvents = dailyMeals(START - 20 * DAY, START + HISTORY_DAYS * DAY)

    let prev: Read | null = null
    for (let d = READ_FROM; d < HISTORY_DAYS; d++) {
      const nowMs = START + d * DAY + 13 * HOUR
      const inp = inputAt(nowMs, symptomEvents, mealEvents)
      const cur = shipped(inp)
      const ctl = unheld(inp)
      evenings++
      // (1) Same firing set, never softer.
      assert.equal(cur === null, ctl === null, `pet ${pet} day ${d}: the hold never changes WHETHER the card fires`)
      if (cur && ctl) {
        assert.equal(cur.count, ctl.count)
        if (ctl.tier === 'firm') assert.equal(cur.tier, 'firm', `pet ${pet} day ${d}: never softer than the control`)
        if (cur.tier === 'firm' && ctl.tier === 'standard') heldEvenings++
      }
      // (2) No softening without a fall, across consecutive evenings of one course.
      if (prev && cur && prev.tier === 'firm' && cur.tier === 'standard') {
        assert.ok(cur.count < prev.count, `pet ${pet} day ${d}: firm → standard at ${prev.count} → ${cur.count}`)
        releases++
      }
      prev = cur
    }
    // The control's defect, measured over the same evenings.
    let cprev: Read | null = null
    for (let d = READ_FROM; d < HISTORY_DAYS; d++) {
      const c = unheld(inputAt(START + d * DAY + 13 * HOUR, symptomEvents, mealEvents))
      if (cprev && c && cprev.tier === 'firm' && c.tier === 'standard' && c.count >= cprev.count) controlDropsWithoutFall++
      cprev = c
    }
  }

  assert.ok(evenings >= 2000, 'non-vacuity: the sweep read enough evenings')
  assert.ok(controlDropsWithoutFall >= 5, `non-vacuity: the generator must produce the defect (got ${controlDropsWithoutFall})`)
  assert.ok(heldEvenings >= 10, `non-vacuity: the hold must act (got ${heldEvenings})`)
  assert.ok(releases >= 1, `non-vacuity: a real fall must still release the ask (got ${releases})`)
})
