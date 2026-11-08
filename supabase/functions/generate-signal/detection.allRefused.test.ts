// CUL-2424 (PM ruling (a), 2026-11-02; wording option 1, 2026-11-05): a cat that refused every
// meal today on a food with too few past meals to compare fires `consecutive_low` with a recent
// score of 0, and every surface worded it "eating less than usual". The engine now marks that
// finding `allRefused`, and the template, the carried line and the model gate word it as refusal.
// Every boundary reads the shipped scale (`intakeScore`), never a retyped 0 (C-34).

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  detectIntakeDecline,
  intakeScore,
  type DetectionInput,
  type IntakeDeclineFinding,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'
import { templateCarried, templateIntakeDecline, validatePhrasing } from './phrasing.ts'

const MS_PER_HOUR = 3_600_000
const NOW = '2026-07-30T20:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const USUAL = 'f-usual'
const NEW = 'f-new'

let seq = 0
function meal(hoursAgo: number, rating: IntakeRating, foodItemId: string): MealEvent {
  seq += 1
  return {
    id: `m${seq}`,
    occurredAt: new Date(NOW_MS - hoursAgo * MS_PER_HOUR).toISOString(),
    foodItemId,
    primaryProtein: 'chicken',
    intakeRating: rating,
    foodType: 'meal',
    foodLabel: foodItemId === USUAL ? 'Usual food' : 'New food',
  }
}

function input(species: Species, mealEvents: MealEvent[]): DetectionInput {
  return { pet: { name: 'Miso', species, dietTrialActive: false }, symptomEvents: [], mealEvents, now: NOW, timezone: 'UTC' }
}

/** A week of the usual food eaten well (days 2..8 back), then today on a food with no history. */
function record(species: Species, today: IntakeRating[], todayDays = 1): MealEvent[] {
  const meals: MealEvent[] = []
  for (let d = 1 + todayDays; d <= 8; d++) meals.push(meal(d * 24 + 6, 'all', USUAL), meal(d * 24 - 4, 'all', USUAL))
  for (let d = 0; d < todayDays; d++) today.forEach((r, i) => meals.push(meal(d * 24 + 2 + i * 3, r, NEW)))
  return meals
}

function lowOf(out: IntakeDeclineFinding[]): IntakeDeclineFinding {
  const low = out.find((f) => f.trigger === 'consecutive_low')
  assert.ok(low, `a consecutive_low fires; got ${JSON.stringify(out.map((f) => f.trigger))}`)
  return low
}

Deno.test('CUL-2424: the cat that refused every meal today on a new food is marked allRefused', () => {
  const out = detectIntakeDecline(input('cat', record('cat', ['refused', 'refused'])))
  // The case the issue names: no refusal of a normally-eaten food (the food is new), no floor.
  assert.ok(!out.some((f) => f.trigger === 'refused_normal_food'), 'the new food has no history to refuse')
  assert.ok(!out.some((f) => f.trigger === 'sustained_refusal'), 'one day is under the floor')
  const low = lowOf(out)
  assert.equal(low.recentScore, intakeScore('refused'))
  assert.equal(low.allRefused, true)
})

Deno.test('CUL-2424: a day picked at, or one meal eaten, is a dip and not marked', () => {
  // The single-day path's own ceiling: picked sits under it, so the card fires as a dip.
  assert.ok(intakeScore('picked') <= DEFAULT_CONFIG.intakeDecline.cat.singleDayConcernCeiling)
  assert.equal(lowOf(detectIntakeDecline(input('cat', record('cat', ['picked', 'picked'])))).allRefused, false)
  assert.equal(lowOf(detectIntakeDecline(input('cat', record('cat', ['refused', 'picked'])))).allRefused, false)
})

Deno.test('CUL-2424: a dog that refused every rated meal for two days is marked too', () => {
  const low = lowOf(detectIntakeDecline(input('dog', record('dog', ['refused', 'refused'], 2))))
  assert.equal(low.daysBelowBaseline, 2)
  assert.equal(low.allRefused, true)
})

const base = lowOf(detectIntakeDecline(input('cat', record('cat', ['refused', 'refused']))))

Deno.test('CUL-2424: the template words a day of refusals as refusal, never "less"', () => {
  const t = templateIntakeDecline(base, 'Miso')
  // CUL-2593: a cat's day of refusals asks for a call today (detection.allRefusedAsk.test.ts).
  assert.equal(t, 'Miso refused every meal you rated today — call your vet today.')
  assert.ok(!/less/i.test(t))
  const two = templateIntakeDecline({ ...base, daysBelowBaseline: 2, species: 'dog' }, 'Rex')
  assert.equal(two, 'Rex refused every meal you rated over the last two days — worth keeping an eye on, and a word with your vet if it carries on.')
  // The dip keeps its own words.
  assert.match(templateIntakeDecline({ ...base, allRefused: false }, 'Miso'), /eaten less than usual today/)
  // A cache written before the field existed reads as before (no inference from the score).
  const { allRefused: _drop, ...legacy } = base
  assert.match(templateIntakeDecline(legacy as IntakeDeclineFinding, 'Miso'), /eaten less than usual/)
})

Deno.test('CUL-2424: the carried line says refusing, never "eating less"', () => {
  const t = templateCarried(base, 'Miso', '2026-07-29T10:00:00.000Z')
  assert.match(t, /showed refusing every meal you rated —/)
  assert.ok(!/eating less/.test(t))
})

Deno.test('CUL-2424: no model sentence is accepted on an all-refused card', () => {
  const calm = 'Miso has been off her food today — worth keeping an eye on, and a word with your vet if it carries on.'
  // A dip with a good meal in the last day (CUL-2680: one without meets the floor, template-only).
  assert.equal(validatePhrasing(calm, { ...base, allRefused: false, noGoodMeal24h: false }), true, 'the dip still takes a model sentence')
  assert.equal(validatePhrasing(calm, { ...base, allRefused: false, noGoodMeal24h: true }), false, 'a dip meeting D3 takes none')
  assert.equal(validatePhrasing(calm, base), false)
})
