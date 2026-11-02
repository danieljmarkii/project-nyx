// The sustained-refusal floor (the stopgap for a record with no good meals, so no baseline to fall
// from). adversarial-reviewer pass 2 on VR2-13 (P2b, P7, P10b): a cat with 60 rated meals over 30
// days, every one picked at or refused, raised no intake flag, because ②'s two triggers both
// compare against the pet's own normal and this cat has none. The floor fires on the record
// itself: every watched rated meal in the last 72 hours refused or picked at, at least three of
// them, on at least two of the owner's days. The threshold is PROVISIONAL (the PM's and Dr.
// Chen's ruling); each boundary below is derived from the shipped config, never retyped (C-34).

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  detectIntakeDecline,
  detectSignals,
  type DetectionInput,
  type FeedingArrangement,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'
import { sustainedRefusalSentence, templateIntakeDecline, validatePhrasing } from './phrasing.ts'

const RULE = DEFAULT_CONFIG.intakeDecline.sustainedRefusal
const MS_PER_HOUR = 3_600_000
const NOW = '2026-07-30T20:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const WET = 'f-wet'
const KIBBLE = 'f-kibble'

let seq = 0
/** A meal `hoursAgo` before NOW. */
function meal(hoursAgo: number, rating: IntakeRating | null, foodItemId = WET): MealEvent {
  seq += 1
  return {
    id: `m${seq}`,
    occurredAt: new Date(NOW_MS - hoursAgo * MS_PER_HOUR).toISOString(),
    foodItemId,
    primaryProtein: 'chicken',
    intakeRating: rating,
    foodType: 'meal',
    foodLabel: foodItemId === WET ? 'Wet food' : 'Kibble',
  }
}

function input(species: Species, mealEvents: MealEvent[], extra: Partial<DetectionInput> = {}): DetectionInput {
  return {
    pet: { name: 'Nyx', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents,
    now: NOW,
    timezone: 'UTC',
    ...extra,
  }
}

/** The P2b cat: two rated meals a day for 30 days, alternating picked and refused. */
function p2bCat(): MealEvent[] {
  const meals: MealEvent[] = []
  for (let d = 0; d < 30; d++) {
    meals.push(meal(d * 24 + 2, d % 2 === 0 ? 'picked' : 'refused'), meal(d * 24 + 12, 'refused'))
  }
  return meals
}

Deno.test('the P2b cat: 60 meals over 30 days, none eaten well, raises the floor', () => {
  const meals = p2bCat()
  assert.equal(meals.length, 60)
  const out = detectIntakeDecline(input('cat', meals))
  assert.equal(out.length, 1, 'one intake card, the floor')
  const f = out[0]
  assert.equal(f.trigger, 'sustained_refusal')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.lastFullMealIso, null, 'no full meal anywhere in the record')
  const r = f.sustainedRefusal
  assert.ok(r)
  // Inside 72 h: hours 2, 12, 26, 36, 50, 60 (74 is out).
  assert.equal(r.meals, 6)
  assert.equal(r.days, 3)
  assert.equal(r.refused + r.picked, r.meals)
  assert.equal(r.windowHours, RULE.windowHours)
})

Deno.test('the floor reaches the ranked Signal, and leads the safety band', () => {
  const ranked = detectSignals(input('cat', p2bCat()))
  const intake = ranked.filter(({ finding }) => finding.type === 'intake_decline')
  assert.equal(intake.length, 1)
  assert.equal((intake[0].finding as { trigger: string }).trigger, 'sustained_refusal')
})

Deno.test('a thin record below ②\'s coverage floor still fires: three refusals on two days', () => {
  const meals = [meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused')]
  assert.ok(meals.length < DEFAULT_CONFIG.intakeDecline.minRatedMealsForBaseline, 'the fixture is under the coverage floor')
  const out = detectIntakeDecline(input('cat', meals))
  assert.equal(out.length, 1)
  assert.equal(out[0].trigger, 'sustained_refusal')
  assert.equal(out[0].sustainedRefusal?.meals, RULE.minMeals)
})

Deno.test('one meal under the meal floor is silent (and that silence is not an all-clear)', () => {
  const meals = [meal(2, 'refused'), meal(30, 'refused')]
  assert.equal(meals.length, RULE.minMeals - 1)
  assert.deepEqual(detectIntakeDecline(input('cat', meals)), [])
})

Deno.test('one bad night on a single local day does not fire the floor', () => {
  // Three refusals inside one UTC day (NOW is 20:00 UTC): hours 1, 5 and 9 ago.
  const meals = [meal(1, 'refused'), meal(5, 'refused'), meal(9, 'refused')]
  assert.equal(new Set(meals.map((m) => m.occurredAt.slice(0, 10))).size, 1)
  assert.equal(RULE.minDays, 2)
  assert.deepEqual(detectIntakeDecline(input('cat', meals)).filter((f) => f.trigger === 'sustained_refusal'), [])
  // The same three across local midnight in New York fall on two of the OWNER's days and fire.
  const ny = detectIntakeDecline(input('cat', [meal(1, 'refused'), meal(5, 'refused'), meal(23, 'refused')], { timezone: 'America/New_York' }))
  assert.equal(ny[0]?.trigger, 'sustained_refusal')
})

Deno.test('CUL-2404 (a): only "ate most" or better stands the floor down; "ate some" is counted', () => {
  for (const better of ['most', 'all'] as const) {
    const meals = [meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused'), meal(40, better)]
    assert.deepEqual(
      detectIntakeDecline(input('cat', meals)).filter((f) => f.trigger === 'sustained_refusal'),
      [],
      `a meal rated ${better} was eaten well`,
    )
  }
  // The B2 cat: picked and refused with an "ate some" in the window still fires, and says so.
  const withSome = detectIntakeDecline(input('cat', [meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused'), meal(40, 'some')]))
  assert.equal(withSome[0]?.trigger, 'sustained_refusal')
  assert.deepEqual(
    { meals: withSome[0].sustainedRefusal?.meals, some: withSome[0].sustainedRefusal?.some },
    { meals: 4, some: 1 },
  )
  assert.match(templateIntakeDecline(withSome[0], 'Nyx'), /\(2 refused, 1 picked at, 1 ate some\)/)
})

Deno.test('half-eaten meals alone never raise the call-today card: at least one refused or picked at', () => {
  const meals = [meal(2, 'some'), meal(20, 'some'), meal(30, 'some'), meal(44, 'some')]
  assert.deepEqual(detectIntakeDecline(input('cat', meals)).filter((f) => f.trigger === 'sustained_refusal'), [])
  const oneRefusal = [...meals, meal(50, 'refused')]
  assert.equal(detectIntakeDecline(input('cat', oneRefusal))[0]?.trigger, 'sustained_refusal')
})

Deno.test('CUL-2404 (a): lapsed logging keeps the floor for up to 72 hours past the last rating', () => {
  // Refusals, then nothing rated: the last rating is 50 hours before now.
  const lapsed = [meal(50, 'refused'), meal(62, 'refused'), meal(74, 'picked'), meal(86, 'refused')]
  const f = detectIntakeDecline(input('cat', lapsed))[0]
  assert.equal(f?.trigger, 'sustained_refusal')
  assert.equal(f.sustainedRefusal?.meals, 4, 'the window ends at the last rating and reaches 72 hours back from it')
  assert.equal(f.sustainedRefusal?.anchoredToLastRating, true)
  assert.equal(f.sustainedRefusal?.endIso, lapsed[0].occurredAt)
  assert.match(templateIntakeDecline(f, 'Nyx'), /in the 72 hours to July 28:/)
  // Past the bound the window ends at now, and an empty window is silence.
  const old = [meal(RULE.windowHours + 1, 'refused'), meal(RULE.windowHours + 12, 'refused'), meal(RULE.windowHours + 30, 'refused')]
  assert.deepEqual(detectIntakeDecline(input('cat', old)).filter((x) => x.trigger === 'sustained_refusal'), [])
})

Deno.test('a good meal older than the window does not stand it down', () => {
  const meals = [meal(RULE.windowHours + 1, 'all'), meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused')]
  const out = detectIntakeDecline(input('cat', meals))
  assert.equal(out[0]?.trigger, 'sustained_refusal')
  assert.equal(out[0].sustainedRefusal?.meals, 3, 'the old meal is outside the count')
  assert.equal(out[0].lastFullMealIso, meals[0].occurredAt, 'and is the last full meal the report names')
})

Deno.test('an unrated meal is unknown: it neither counts nor stands the floor down', () => {
  const meals = [meal(2, 'refused'), meal(10, null), meal(20, 'picked'), meal(30, 'refused')]
  const out = detectIntakeDecline(input('cat', meals))
  assert.equal(out[0]?.sustainedRefusal?.meals, 3)
})

Deno.test('a free-fed bowl is not a watched meal: its "all" stands nothing down, its refusal counts for nothing', () => {
  const bowl: FeedingArrangement = {
    id: 'a1',
    primaryProtein: 'chicken',
    activeFrom: '2026-07-01',
    activeUntil: null,
    foodItemId: KIBBLE,
    createdAt: '2026-07-01T00:00:00.000Z',
    endedAt: null,
  }
  const withAll = [meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused'), meal(25, 'all', KIBBLE)]
  // Without the bowl on file the kibble "all" is a watched meal and stands the floor down: the
  // fixture reaches the exclusion.
  assert.deepEqual(detectIntakeDecline(input('cat', withAll)).filter((f) => f.trigger === 'sustained_refusal'), [])
  assert.equal(detectIntakeDecline(input('cat', withAll, { feedingArrangements: [bowl] }))[0]?.trigger, 'sustained_refusal')

  const bowlRefusalsOnly = [meal(2, 'refused'), meal(30, 'refused'), meal(20, 'refused', KIBBLE)]
  assert.deepEqual(detectIntakeDecline(input('cat', bowlRefusalsOnly, { feedingArrangements: [bowl] })), [])
})

Deno.test('a meal logged after the read\'s now is not in its window', () => {
  const meals = [meal(2, 'refused'), meal(20, 'picked'), meal(30, 'refused'), meal(-5, 'all')]
  assert.equal(detectIntakeDecline(input('cat', meals))[0]?.trigger, 'sustained_refusal')
})

Deno.test('dogs fire too (the louder side, pending the ruling)', () => {
  const out = detectIntakeDecline(input('dog', [meal(2, 'refused'), meal(26, 'refused'), meal(50, 'refused')]))
  assert.equal(out[0]?.trigger, 'sustained_refusal')
  assert.equal(out[0].species, 'dog')
})

Deno.test('adversarial pass 1, B1: two weeks eaten well, then 72 hours refused, gets the floor\'s call, not "less than usual today"', () => {
  const meals: MealEvent[] = []
  for (let d = 3; d <= 16; d++) meals.push(meal(d * 24 + 4, 'all'), meal(d * 24 + 14, 'all'))
  meals.push(meal(2, 'refused'), meal(12, 'refused'), meal(26, 'refused'), meal(36, 'refused'), meal(50, 'refused'), meal(60, 'refused'))
  for (const species of ['cat', 'dog'] as const) {
    const out = detectIntakeDecline(input(species, meals))
    const triggers = out.map((f) => f.trigger)
    assert.equal(triggers[0], 'sustained_refusal', `${species}: the floor leads`)
    assert.ok(!triggers.includes('consecutive_low'), `${species}: one "is she eating" card, the louder one`)
    assert.match(templateIntakeDecline(out[0], 'Nyx'), /worth a call to your vet today/)
  }
})

Deno.test('a good baseline and one bad day keeps the relative card (the floor needs two days)', () => {
  const meals: MealEvent[] = []
  for (let d = 2; d < 14; d++) meals.push(meal(d * 24 + 4, 'all'), meal(d * 24 + 14, 'all'))
  meals.push(meal(2, 'refused'), meal(6, 'refused'), meal(10, 'refused'))
  const triggers = detectIntakeDecline(input('cat', meals)).map((f) => f.trigger)
  assert.ok(triggers.includes('consecutive_low'))
  assert.ok(!triggers.includes('sustained_refusal'))
})

Deno.test('the floor sits beside a refusal of a normally-eaten food, and leads it', () => {
  // A dog: kibble eaten well 5 to 10 days ago; wet food refused twice two days ago; kibble refused
  // today. Yesterday holds no rated meal, so the dog's two-day consecutive-low cannot run, and the
  // record has no good meal in 72 hours.
  const meals: MealEvent[] = []
  for (let d = 5; d <= 10; d++) meals.push(meal(d * 24, 'all', KIBBLE))
  meals.push(meal(45, 'refused'), meal(50, 'refused'), meal(2, 'refused', KIBBLE))
  const out = detectIntakeDecline(input('dog', meals))
  assert.deepEqual(out.map((f) => f.trigger), ['sustained_refusal', 'refused_normal_food'])
  assert.equal(out[1].refusedFoodLabel, 'Kibble')
})

Deno.test('the sentence: counts over the named window, a call today, never "less than usual" or "picky"', () => {
  const f = detectIntakeDecline(input('cat', p2bCat()))[0]
  const text = templateIntakeDecline(f, 'Nyx')
  assert.equal(text, sustainedRefusalSentence(f.sustainedRefusal!, 'Nyx'))
  assert.equal(text, "Nyx hasn't eaten well at any meal you watched and rated in the last 72 hours: 6 meals on 3 days (4 refused, 2 picked at). That's worth a call to your vet today.")
  assert.doesNotMatch(text, /less than usual|picky|fussy|!/i)
  const base = { meals: 3, refused: 3, picked: 0, some: 0, days: 2, windowHours: 72, firstIso: NOW, endIso: NOW, endLocalDay: '2026-07-30', anchoredToLastRating: false }
  assert.match(sustainedRefusalSentence(base, 'Nyx'), /: 3 meals on 2 days \(3 refused\)\./)
  assert.match(sustainedRefusalSentence({ ...base, anchoredToLastRating: true }, 'Nyx'), /in the 72 hours to July 30:/)
})

Deno.test('the floor never reaches the model: the shell routes it to its template, and the validator refuses any sentence', () => {
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  const fn = src.slice(src.indexOf('async function phraseFinding('))
  // The template-only `if`, which the I5 clause closes (pinned in detection.en5.test.ts).
  const end = fn.indexOf("finding.refusedThenVomited !== undefined)\n  ) {")
  assert.ok(end > 0)
  assert.match(fn.slice(0, end), /\(finding\.type === 'intake_decline' && finding\.trigger === 'sustained_refusal'\) \|\|/)
  const f = detectIntakeDecline(input('cat', p2bCat()))[0]
  assert.equal(validatePhrasing(templateIntakeDecline(f, 'Nyx'), f), false)
})

Deno.test('adversarial pass 2: an old build\'s take-up day cannot let a bowl\'s "ate it all" silence the floor', () => {
  // New York; now is 07-30 20:00 local. Six watched refusals over 07-28 to 07-30. A kibble bowl down
  // since 07-01, taken up on 07-30 by a build that wrote no `ended_at`, rated "all" at 09:00 local
  // on the take-up day: was it the bowl or a watched meal? The record cannot say.
  const now = '2026-07-31T00:00:00.000Z'
  const at = (iso: string, rating: IntakeRating, foodItemId = WET): MealEvent => ({
    id: `p2-${iso}`, occurredAt: iso, foodItemId, primaryProtein: 'chicken', intakeRating: rating, foodType: 'meal',
    foodLabel: foodItemId === WET ? 'Wet food' : 'Kibble',
  })
  const meals = [
    at('2026-07-28T12:00:00.000Z', 'refused'), at('2026-07-28T22:00:00.000Z', 'refused'),
    at('2026-07-29T12:00:00.000Z', 'refused'), at('2026-07-29T22:00:00.000Z', 'refused'),
    at('2026-07-30T12:00:00.000Z', 'refused'), at('2026-07-30T22:00:00.000Z', 'refused'),
    at('2026-07-30T13:00:00.000Z', 'all', KIBBLE),
  ]
  const bowl = (endedAt: string | null): FeedingArrangement => ({
    id: 'a-p2', primaryProtein: 'chicken', activeFrom: '2026-07-01', activeUntil: '2026-07-30', foodItemId: KIBBLE,
    createdAt: '2026-07-01T12:00:00.000Z', endedAt,
  })
  const run = (endedAt: string | null) =>
    detectIntakeDecline({ ...input('cat', meals, { timezone: 'America/New_York', feedingArrangements: [bowl(endedAt)] }), now })
  // With the toggle-off instant on file (after the rating), the bowl is excluded and the floor fires.
  assert.equal(run('2026-07-30T23:30:00.000Z')[0]?.trigger, 'sustained_refusal')
  // Without it, the narrow reading counts the rating as watched; it must still not stand the floor down.
  const pre076 = run(null)
  assert.equal(pre076[0]?.trigger, 'sustained_refusal')
  assert.equal(pre076[0].sustainedRefusal?.meals, 6, 'the uncertain rating is not counted as a refusal either')
  assert.equal(pre076[0].lastFullMealIso, null, 'nor named as the last full meal')
})
