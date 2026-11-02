// CUL-2439 (PM ruling (a) on CUL-2368, 2026-11-02): ④'s getting-worse check also reads the owner's
// calendar weeks. Run with:
//   deno test --allow-read=supabase/functions supabase/functions/generate-signal/detection.calendarWeek.test.ts
//
// The rule under test: a warning fires when EITHER reading (today's rolling 7 × 24h UTC windows, or
// the owner's local calendar weeks) sees it, and a calm card speaks only when BOTH agree. So the
// change can never fire less often, or reassure more often, than the detector it extends.
//
// TIMEZONE NOTE (B-514): the calendar reading's day boundary is LOCAL midnight, so every fixture
// here builds its instants from New York local components (`ny`), and the zone-less arm is the
// same events with no `timezone`, whose calendar falls back to UTC days.

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  computeReflectionDensity,
  computeWeekReadings,
  detectReflections,
  detectWorsening,
  foldedWorsening,
  holdChangeInstants,
  type DetectionInput,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NY = 'America/New_York'

let seq = 0
/** A New York wall-clock time in 2026 as a UTC ISO string (EDT, UTC−4, before Nov 1; EST after). */
const ny = (month: number, day: number, hour: number, min = 0): string => {
  const offset = month < 11 ? 4 : 5
  return new Date(Date.UTC(2026, month - 1, day, hour + offset, min)).toISOString()
}
const vomit = (occurredAt: string): SymptomEvent => ({
  id: `s-${++seq}`,
  type: 'vomit',
  occurredAt,
  occurredAtConfidence: 'witnessed',
})
const meal = (occurredAt: string): MealEvent => ({
  id: `m-${++seq}`,
  occurredAt,
  foodItemId: null,
  primaryProtein: 'chicken',
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
})
/** Meals at the given New York hours on every day from (month, from) to (month, to). */
const mealsNy = (month: number, from: number, to: number, hours: number[]): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = from; d <= to; d++) for (const h of hours) out.push(meal(ny(month, d, h)))
  return out
}
const input = (
  now: string,
  symptomEvents: SymptomEvent[],
  mealEvents: MealEvent[],
  timezone: string | null = NY,
): DetectionInput => ({
  pet: { name: 'Mochi', species: 'dog', dietTrialActive: false },
  symptomEvents,
  mealEvents,
  now,
  // null is the zone-less pet (an explicit `undefined` would take the default above).
  ...(timezone === null ? {} : { timezone }),
})
const RUN = ny(7, 2, 8) // Jul 2, 08:00 EDT

Deno.test('CUL-2368 counterexample eleven — a calendar-week rise the 7 × 24h weeks read as 3 vs 3 now fires', () => {
  // Meals daily; vomits Jun 18 15:00 EDT, then Jun 22, 24, 27, 29 and Jul 1. The rolling prior week
  // (Jun 18 08:00 to Jun 25 08:00) takes in the Jun 18 afternoon vomit: 3 vs 3, no rise. The owner's
  // calendar weeks (Jun 26–Jul 2 against Jun 19–25) hold 3 vs 2.
  const inp = input(
    RUN,
    [vomit(ny(6, 18, 15)), ...[22, 24, 27, 29].map((d) => vomit(ny(6, d, 8))), vomit(ny(7, 1, 8))],
    [...mealsNy(6, 1, 30, [7, 18]), ...mealsNy(7, 1, 2, [7])],
  )
  const r = computeWeekReadings(inp, DEFAULT_CONFIG)!
  const rolling = r.rolling.stats.find((s) => s.symptomType === 'vomit')!
  const calendar = r.calendar.stats.find((s) => s.symptomType === 'vomit')!
  assert.deepEqual([rolling.currentCount, rolling.priorCount], [3, 3], 'the counterexample holds: the rolling weeks see no rise')
  assert.deepEqual([calendar.currentCount, calendar.priorCount], [3, 2])

  const f = detectWorsening(inp, DEFAULT_CONFIG)
  assert.equal(f.length, 1)
  assert.equal(f[0].symptomType, 'vomit')
  assert.deepEqual([f[0].currentCount, f[0].priorCount, f[0].trigger], [3, 2, 'more_episodes'], 'the card carries the calendar week')
  assert.equal(foldedWorsening(inp, DEFAULT_CONFIG, 'vomit'), 'rising')
  // Today the rolling 3 vs 3 let the calm layer say "same as last week". A rise in either reading mutes it.
  assert.deepEqual(detectReflections(inp, DEFAULT_CONFIG), [])
})

Deno.test('CUL-2368 case 4 — an evening vomit west of UTC counts on its own local day (3 days vs 2)', () => {
  // Current week: Jun 27 21:00 EDT (Jun 28 UTC), Jun 28 08:00 and Jun 30 08:00 EDT: three local days,
  // two UTC days. Prior week: Jun 21 08:00 and 14:00 and Jun 23 08:00: three episodes on two days.
  // Counts 3 vs 3; the spread arm is the whole case.
  const events = [
    vomit(ny(6, 27, 21)),
    vomit(ny(6, 28, 8)),
    vomit(ny(6, 30, 8)),
    vomit(ny(6, 21, 8)),
    vomit(ny(6, 21, 14)),
    vomit(ny(6, 23, 8)),
  ]
  const meals = [...mealsNy(6, 1, 30, [7, 18]), ...mealsNy(7, 1, 2, [7])]
  const zoned = detectWorsening(input(RUN, events, meals), DEFAULT_CONFIG)
  assert.equal(zoned.length, 1)
  assert.deepEqual(
    [zoned[0].currentCount, zoned[0].priorCount, zoned[0].currentDays, zoned[0].priorDays, zoned[0].trigger],
    [3, 3, 3, 2, 'more_days'],
  )
  // The mutation: with no zone the calendar falls back to UTC days, where the spread is 2 vs 2 and
  // nothing fires. So the zone is what fires the card, and the fixture is not green over nothing.
  assert.deepEqual(detectWorsening(input(RUN, events, meals, null), DEFAULT_CONFIG), [])
})

Deno.test('CUL-2368 adversarial pass 2 — an evening logger west of UTC clears the 3-day gate on local days', () => {
  // Current week: meals 22:00 and 18:00 EDT on alternating days Jun 26–29 and vomits Jun 27 and 29 at
  // 19:00 EDT: four local days, two UTC days (Jun 27 and Jun 29). Prior week: a 07:00 EDT meal daily,
  // no vomiting. A 0 → 2 rise the rolling gate never checks.
  const events = [vomit(ny(6, 27, 19)), vomit(ny(6, 29, 19))]
  const meals = [
    ...mealsNy(6, 19, 25, [7]),
    meal(ny(6, 26, 22)),
    meal(ny(6, 27, 18)),
    meal(ny(6, 28, 22)),
    meal(ny(6, 29, 18)),
  ]
  const r = computeWeekReadings(input(RUN, events, meals), DEFAULT_CONFIG)!
  assert.equal(r.rolling.loggingEligible, false, 'the counterexample holds: 2 UTC logged days fail the gate')
  assert.equal(r.rolling.currentLoggingDays, 2)
  assert.equal(r.calendar.currentLoggingDays, 4)

  const f = detectWorsening(input(RUN, events, meals), DEFAULT_CONFIG)
  assert.equal(f.length, 1)
  assert.deepEqual([f[0].symptomType, f[0].currentCount, f[0].priorCount], ['vomit', 2, 0])
  // The mutation: zone-less, the calendar is UTC days too and the gate holds the check back, as today.
  assert.deepEqual(detectWorsening(input(RUN, events, meals, null), DEFAULT_CONFIG), [])
})

Deno.test('CUL-2439 — never quieter: a rise only the rolling weeks hold still fires, with their numbers (a DST week)', () => {
  // New York, run Nov 3 08:00 EST (the clocks fell back Nov 1). A vomit Oct 27 23:30 EDT is in the
  // rolling current week (from Oct 27 13:00Z) but on local day Oct 27, the calendar's prior week.
  // Rolling: 3 vs 1. Calendar: 2 vs 2 on 2 days each, no rise.
  const now = ny(11, 3, 8)
  const events = [vomit(ny(10, 22, 8)), vomit(ny(10, 27, 23, 30)), vomit(ny(10, 29, 8)), vomit(ny(10, 31, 8))]
  const meals = [...mealsNy(10, 15, 31, [12]), ...mealsNy(11, 1, 3, [7])]
  const inp = input(now, events, meals)
  const r = computeWeekReadings(inp, DEFAULT_CONFIG)!
  const cal = r.calendar.stats.find((s) => s.symptomType === 'vomit')!
  assert.deepEqual([cal.currentCount, cal.priorCount], [2, 2], 'the calendar week has passed the rise')
  const f = detectWorsening(inp, DEFAULT_CONFIG)
  assert.equal(f.length, 1)
  assert.deepEqual([f[0].currentCount, f[0].priorCount], [3, 1], 'the rolling reading fires, as it did before CUL-2439')
})

Deno.test('CUL-2439 — a calm card needs both readings calm, and then names the calendar week', () => {
  // Falling by both readings: prior week Jun 19–24 holds 4 episodes on 4 days, the current week 1.
  const meals = [...mealsNy(6, 1, 30, [7, 18]), ...mealsNy(7, 1, 2, [7])]
  const calm = input(RUN, [...[19, 20, 22, 24].map((d) => vomit(ny(6, d, 12))), vomit(ny(6, 30, 12))], meals)
  const both = detectReflections(calm, DEFAULT_CONFIG)
  assert.equal(both.length, 1)
  assert.deepEqual([both[0].currentCount, both[0].priorCount, both[0].direction], [1, 4, 'improving'])

  // The readings disagree on numbers but agree it is calm: two vomits on Jun 25 after 08:00 EDT are
  // in the rolling CURRENT week (it starts Jun 25 08:00) and in the calendar PRIOR week (local day
  // Jun 25). Rolling: 3 vs 3, flat. Calendar: 1 vs 5, falling. The card states the SMALLER fall.
  const split = input(
    RUN,
    [
      ...[19, 20, 22].map((d) => vomit(ny(6, d, 12))),
      vomit(ny(6, 25, 9)),
      vomit(ny(6, 25, 13)),
      vomit(ny(6, 30, 12)),
    ],
    meals,
  )
  const r = computeWeekReadings(split, DEFAULT_CONFIG)!
  const roll = r.rolling.stats.find((s) => s.symptomType === 'vomit')!
  const cal = r.calendar.stats.find((s) => s.symptomType === 'vomit')!
  assert.deepEqual([roll.currentCount, roll.priorCount], [3, 3])
  assert.deepEqual([cal.currentCount, cal.priorCount], [1, 5])
  // Both readings are calm, so ③ speaks, and never calmer than either: flat 3 vs 3, not "down from 5".
  const out = detectReflections(split, DEFAULT_CONFIG)
  assert.equal(out.length, 1)
  assert.deepEqual([out[0].currentCount, out[0].priorCount, out[0].direction], [3, 3, 'flat'])
})

// ── Adversarial pass 1 on CUL-2439: the slice between the two readings (Jun 25 08:00 to midnight
// EDT is the rolling CURRENT week and the calendar PRIOR week) must never soften a card. ──

const MEALS = [...mealsNy(6, 1, 30, [7, 18]), ...mealsNy(7, 1, 2, [7])]
const at8 = (days: number[]): SymptomEvent[] => days.map((d) => vomit(ny(6, d, 8)))

Deno.test('adv 1 B1 — a rise straddling the slice keeps the louder tier on the same sign', () => {
  // Rolling 4 vs 1 on 4 days (firm); calendar 3 vs 2 (standard). The card is firm, 4 vs 1.
  const a1 = input(RUN, [vomit(ny(6, 20, 8)), vomit(ny(6, 25, 10)), ...at8([27, 29]), vomit(ny(7, 1, 8))], MEALS)
  const f1 = detectWorsening(a1, DEFAULT_CONFIG)
  assert.deepEqual(f1.map((f) => [f.currentCount, f.priorCount, f.tier]), [[4, 1, 'firm']])
  // Rolling 4 vs 2 (firm); calendar 3 vs 3, more days (soft). Firm, never soft.
  const a2 = input(RUN, [vomit(ny(6, 20, 8)), vomit(ny(6, 20, 14)), vomit(ny(6, 25, 10)), ...at8([27, 29]), vomit(ny(7, 1, 8))], MEALS)
  assert.deepEqual(detectWorsening(a2, DEFAULT_CONFIG).map((f) => [f.currentCount, f.priorCount, f.tier]), [[4, 2, 'firm']])
})

Deno.test('adv 1 B2 — a calendar-only rise never displaces the card the rolling weeks pick', () => {
  // Vomit firm in both readings; diarrhea rises 3 vs 0 only by the calendar (its prior episodes sit
  // in Jun 18's afternoon, the rolling prior week alone), a steeper rise than vomit's.
  const events = [
    ...at8([20, 21, 26, 27, 28, 29]),
    ...[10, 14, 18].map((h): SymptomEvent => ({ ...vomit(ny(6, 18, h)), type: 'diarrhea' })),
    ...[ny(6, 27, 9), ny(6, 29, 9), ny(7, 1, 9)].map((t): SymptomEvent => ({ ...vomit(t), type: 'diarrhea' })),
  ]
  const f = detectWorsening(input(RUN, events, MEALS), DEFAULT_CONFIG)
  assert.deepEqual(f.map((x) => [x.symptomType, x.tier]), [['vomit', 'firm']])
})

Deno.test('adv 1 B3 — the calm card is never calmer than the rolling read it replaced', () => {
  // Rolling 3 vs 3, flat; calendar 2 vs 4. Before the fix it said "2, down from 4".
  const a5 = input(RUN, [...at8([19, 21, 23]), vomit(ny(6, 25, 12)), ...at8([28, 30])], MEALS)
  const out = detectReflections(a5, DEFAULT_CONFIG)
  assert.deepEqual(out.map((r) => [r.currentCount, r.priorCount, r.direction]), [[3, 3, 'flat']])
})

Deno.test('adv 1 B4 — the hold walk counts the same instants in every zone (its reach is unchanged)', () => {
  const rand = mulberry32(24391)
  const { symptomEvents, mealEvents } = randomPet(rand, 50)
  const nowMs = START + 50 * DAY
  const counted = (tz: string | null): number[] => {
    const r = holdChangeInstants(input(new Date(nowMs).toISOString(), symptomEvents, mealEvents, tz), DEFAULT_CONFIG, nowMs, new Set(['vomit']))
    return r.all.filter((ms) => !r.calendarOnly.has(ms))
  }
  const utc = counted(null)
  assert.ok(utc.length > 100, `non-vacuity: ${utc.length} counted instants`)
  for (const tz of ['America/Los_Angeles', 'Asia/Kathmandu', 'Pacific/Kiritimati']) {
    // The counted instants are today's, which read no zone: the calendar's extras ride uncounted.
    assert.deepEqual(new Set(counted(tz)), new Set(utc), tz)
  }
})

// ── The never-quieter property, over random histories in three zones ──

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const ZONES: (string | null)[] = ['America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kathmandu', null]
const START = Date.parse('2026-09-01T00:00:00Z')
const SIGNS: SymptomType[] = ['vomit', 'diarrhea', 'itch']

function randomPet(rand: () => number, days: number): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // A patchy logger, so the logging gates move as well as the counts.
  const rate = 0.25 + rand() * 0.5
  for (let d = 0; d < days; d++) {
    if (rand() < 0.8) {
      const n = 1 + Math.floor(rand() * 2)
      for (let k = 0; k < n; k++) mealEvents.push(meal(new Date(START + d * DAY + Math.floor(rand() * DAY)).toISOString()))
    }
    for (const t of SIGNS) {
      if (rand() < rate * (t === 'vomit' ? 1 : 0.4)) {
        symptomEvents.push({ id: `s-${++seq}`, type: t, occurredAt: new Date(START + d * DAY + Math.floor(rand() * DAY)).toISOString(), occurredAtConfidence: 'witnessed' })
      }
    }
  }
  return { symptomEvents, mealEvents }
}

Deno.test('CUL-2439 property — a sign either reading cards always fires; ③ speaks only when both readings are calm', () => {
  const rand = mulberry32(2439)
  let rollingFires = 0
  let calendarOnly = 0
  let reflections = 0
  for (let pet = 0; pet < 40; pet++) {
    const { symptomEvents, mealEvents } = randomPet(rand, 50)
    const tz = ZONES[pet % ZONES.length]
    for (let k = 0; k < 15; k++) {
      const now = new Date(START + 20 * DAY + Math.floor(rand() * 28 * DAY)).toISOString()
      const inp = input(now, symptomEvents, mealEvents, tz)
      const r = computeWeekReadings(inp, DEFAULT_CONFIG)!
      const fired = detectWorsening(inp, DEFAULT_CONFIG)
      const cards = (w: typeof r.rolling) =>
        w.loggingEligible &&
        w.stats.some((s) => s.currentCount >= DEFAULT_CONFIG.reflection.worseningMinEpisodes && (s.currentCount > s.priorCount || s.currentDays > s.priorDays))
      if (cards(r.rolling)) {
        rollingFires++
        assert.equal(fired.length, 1, `never quieter: the rolling reading cards at ${now} (${tz})`)
      }
      if (cards(r.calendar)) {
        if (!cards(r.rolling)) calendarOnly++
        assert.equal(fired.length, 1, `the calendar reading cards at ${now} (${tz})`)
      }
      if (!cards(r.rolling) && !cards(r.calendar)) assert.equal(fired.length, 0, `nothing else fires ④ at ${now} (${tz})`)

      for (const ref of detectReflections(inp, DEFAULT_CONFIG)) {
        reflections++
        for (const w of [r.rolling, r.calendar]) {
          const s = w.stats.find((x) => x.symptomType === ref.symptomType)!
          assert.ok(w.loggingEligible && s.currentCount <= s.priorCount && s.currentDays <= s.priorDays, `③ calm in both at ${now} (${tz})`)
        }
      }
      const d = computeReflectionDensity(inp, DEFAULT_CONFIG)!
      assert.deepEqual([d.currentLoggingDays, d.priorLoggingDays], [r.rolling.currentLoggingDays, r.rolling.priorLoggingDays], 'the printed counts stay the rolling ones')
    }
  }
  assert.ok(rollingFires >= 30, `non-vacuity: ${rollingFires} rolling fires`)
  assert.ok(calendarOnly >= 5, `non-vacuity: ${calendarOnly} fires only the calendar reading sees`)
  assert.ok(reflections >= 5, `non-vacuity: ${reflections} reflections`)
})

Deno.test('CUL-2439 — the hold walk sees every local midnight: between two change instants a zoned pet\'s ④ never moves', () => {
  const rand = mulberry32(24390)
  let stretches = 0
  let changed = 0
  const pending: ReadonlySet<SymptomType> = new Set(['vomit'])
  // ④'s own answer: the part of the walk's state the calendar reading can move (⑦ is unchanged).
  const state = (inp: DetectionInput): string => JSON.stringify(detectWorsening(inp, DEFAULT_CONFIG))
  for (let pet = 0; pet < 6; pet++) {
    const { symptomEvents, mealEvents } = randomPet(rand, 50)
    const tz = ZONES[pet % 3]
    const nowMs = START + 50 * DAY
    const at = (ms: number) => input(new Date(ms).toISOString(), symptomEvents, mealEvents, tz)
    const { all } = holdChangeInstants(at(nowMs), DEFAULT_CONFIG, nowMs, pending)
    const asc = [...all].filter((ms) => ms > START + 20 * DAY).sort((a, b) => a - b)
    for (let i = 0; i + 1 < asc.length; i++) {
      const lo = asc[i] + 1
      const hi = asc[i + 1] - 1
      if (hi <= lo) continue
      const probe = lo + Math.floor(rand() * (hi - lo))
      assert.equal(state(at(probe)), state(at(lo)), `pet ${pet} (${tz}): ④ moved between ${new Date(lo).toISOString()} and ${new Date(probe).toISOString()}`)
      if (state(at(asc[i + 1] + 1)) !== state(at(lo))) changed++
      stretches++
    }
  }
  assert.ok(stretches >= 300, `non-vacuity: ${stretches} stretches`)
  assert.ok(changed >= 20, `non-vacuity: ${changed} changes across instants`)
})

// ── Adversarial pass 2 on CUL-2439: a card an owner was already shown prints the numbers it printed. ──

Deno.test('adv 2 Q1 — the calm card states the rolling numbers, never a lower count from the calendar week', () => {
  // A New York cat read Jul 15 06:00 EDT: five vomits on Jul 1, then Jul 5, two on Jul 8, Jul 12.
  // Rolling 3 vs 6; calendar 1 vs 3 (a smaller fall from a much lower count). Both calm.
  const events = [
    ...[6, 10, 14, 18, 22].map((h) => vomit(ny(7, 1, h, 30))),
    vomit(ny(7, 5, 8)),
    vomit(ny(7, 8, 10)),
    vomit(ny(7, 8, 18)),
    vomit(ny(7, 12, 8)),
  ]
  const inp = { ...input(ny(7, 15, 6), events, mealsNy(6, 20, 30, [7, 18]).concat(mealsNy(7, 1, 15, [7, 18]).filter((m) => m.occurredAt < ny(7, 15, 6)))), pet: { name: 'Mochi', species: 'cat' as const, dietTrialActive: false } }
  const r = computeWeekReadings(inp, DEFAULT_CONFIG)!
  const cal = r.calendar.stats.find((s) => s.symptomType === 'vomit')!
  assert.deepEqual([cal.currentCount, cal.priorCount], [1, 3], 'the counterexample holds')
  const out = detectReflections(inp, DEFAULT_CONFIG)
  assert.deepEqual(out.map((x) => [x.currentCount, x.priorCount]), [[3, 6]])
})

Deno.test('adv 2 Q2 — a tie in tier keeps the rolling days: "6 of the last 7", never 5', () => {
  // A Los Angeles dog read Jul 15 10:00 PDT. Diarrhea Jul 2–6 at 10:00; then Jul 9 at 14:00 and 19:00
  // (two UTC dates, one local) and Jul 11–14 at 10:00. Rolling 6 vs 5 on 6 days; calendar 6 vs 5 on 5.
  const LA = 'America/Los_Angeles'
  const la = (d: number, h: number): string => new Date(Date.UTC(2026, 6, d, h + 7)).toISOString()
  const dz = (t: string): SymptomEvent => ({ ...vomit(t), type: 'diarrhea' })
  const events = [...[2, 3, 4, 5, 6].map((d) => dz(la(d, 10))), dz(la(9, 14)), dz(la(9, 19)), ...[11, 12, 13, 14].map((d) => dz(la(d, 10)))]
  const meals: MealEvent[] = []
  for (let d = 1; d <= 15; d++) for (const h of [7, 18]) if (la(d, h) < la(15, 10)) meals.push(meal(la(d, h)))
  const f = detectWorsening(input(la(15, 10), events, meals, LA), DEFAULT_CONFIG)
  assert.deepEqual(f.map((x) => [x.symptomType, x.currentCount, x.priorCount, x.currentDays, x.tier]), [['diarrhea', 6, 5, 6, 'firm']])
})
