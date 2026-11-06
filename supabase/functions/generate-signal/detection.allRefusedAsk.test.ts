// CUL-2593 (PM ruling option (1), 2026-11-06): an all-refused consecutive-low card asks for a call
// today unless the pet is a dog. A cat can get into liver trouble inside about 48 hours of not
// eating, so a full day of refusal is not a "wait and see" card. A dog keeps the conditional ask;
// `'other'` and a finding with no species take the louder one (fail loud). Each case is driven
// through the REAL detector over a record the engine can produce (C-34, C-35), then the template.

import { strict as assert } from 'node:assert'
import {
  detectIntakeDecline,
  rankFindings,
  type DetectionInput,
  type IntakeDeclineFinding,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'
import { allRefusedCallsToday, templateCarried, templateIntakeDecline, validatePhrasing } from './phrasing.ts'
import { leadingSafetyText } from '../ask/answer.ts'

const MS_PER_HOUR = 3_600_000
const NOW = '2026-07-30T20:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const CALL = 'worth a call to your vet today'
const SOFT = 'worth keeping an eye on, and a word with your vet if it carries on'

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
    foodLabel: foodItemId === 'f-usual' ? 'Usual food' : 'New food',
  }
}

/** A week of the usual food eaten well, then `todayDays` days of `today` on `todayFood`. */
function recordOf(species: Species, today: IntakeRating[], todayDays: number, todayFood: string): DetectionInput {
  const meals: MealEvent[] = []
  for (let d = 1 + todayDays; d <= 8; d++) meals.push(meal(d * 24 + 6, 'all', 'f-usual'), meal(d * 24 - 4, 'all', 'f-usual'))
  for (let d = 0; d < todayDays; d++) today.forEach((r, i) => meals.push(meal(d * 24 + 2 + i * 3, r, todayFood)))
  return { pet: { name: 'Miso', species, dietTrialActive: false }, symptomEvents: [], mealEvents: meals, now: NOW, timezone: 'UTC' }
}

/** A week of the usual food eaten well, then `todayDays` days of `today` on a food with no history. */
function lowFor(species: Species, today: IntakeRating[], todayDays = 1): IntakeDeclineFinding {
  const meals: MealEvent[] = []
  for (let d = 1 + todayDays; d <= 8; d++) meals.push(meal(d * 24 + 6, 'all', 'f-usual'), meal(d * 24 - 4, 'all', 'f-usual'))
  for (let d = 0; d < todayDays; d++) today.forEach((r, i) => meals.push(meal(d * 24 + 2 + i * 3, r, 'f-new')))
  const input: DetectionInput = {
    pet: { name: 'Miso', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents: meals,
    now: NOW,
    timezone: 'UTC',
  }
  const low = detectIntakeDecline(input).find((f) => f.trigger === 'consecutive_low')
  assert.ok(low, 'a consecutive_low fires')
  return low
}

Deno.test('CUL-2593: a cat that refused every rated meal today is asked to call today', () => {
  const f = lowFor('cat', ['refused', 'refused'])
  assert.equal(f.allRefused, true)
  assert.equal(f.species, 'cat')
  assert.equal(allRefusedCallsToday(f), true)
  assert.equal(templateIntakeDecline(f, 'Miso'), `Miso refused every meal you rated today — ${CALL}.`)
  assert.ok(!/carries on/.test(templateIntakeDecline(f, 'Miso')))
})

Deno.test('CUL-2593: a dog keeps "if it carries on"', () => {
  // A dog's card needs two days of refusals to fire (no single-day path), so that is its shape.
  const f = lowFor('dog', ['refused', 'refused'], 2)
  assert.equal(f.allRefused, true)
  assert.equal(f.daysBelowBaseline, 2)
  assert.equal(allRefusedCallsToday(f), false)
  assert.equal(templateIntakeDecline(f, 'Rex'), `Rex refused every meal you rated over the last two days — ${SOFT}.`)
})

Deno.test('CUL-2593: "other" and a missing species take the louder ask', () => {
  const other = lowFor('other', ['refused', 'refused'], 2)
  assert.equal(other.allRefused, true)
  assert.equal(templateIntakeDecline(other, 'Pip'), `Pip refused every meal you rated over the last two days — ${CALL}.`)
  const { species: _drop, ...noSpecies } = lowFor('cat', ['refused', 'refused'])
  assert.equal(templateIntakeDecline(noSpecies as IntakeDeclineFinding, 'Pip'), `Pip refused every meal you rated today — ${CALL}.`)
})

Deno.test('CUL-2593: only the all-refused card moves; a cat\'s plain dip keeps its own ask', () => {
  const dip = lowFor('cat', ['picked', 'picked'])
  assert.equal(dip.allRefused, false)
  assert.equal(allRefusedCallsToday(dip), false)
  assert.match(templateIntakeDecline(dip, 'Miso'), /eaten less than usual today — worth keeping an eye on/)
  // A cache written before the fact existed is not inferred from the score.
  const { allRefused: _drop, ...legacy } = lowFor('cat', ['refused', 'refused'])
  assert.equal(allRefusedCallsToday(legacy as IntakeDeclineFinding), false)
  // The fact belongs to consecutive_low alone.
  assert.equal(allRefusedCallsToday({ ...lowFor('cat', ['refused', 'refused']), trigger: 'refused_normal_food' }), false)
})

Deno.test('CUL-2593: a carried all-refused card keeps the call for a cat, the word for a dog', () => {
  const cat = templateCarried(lowFor('cat', ['refused', 'refused']), 'Miso', '2026-07-29T10:00:00.000Z')
  assert.match(cat, /showed refusing every meal you rated — worth a call to your vet\. /)
  const dog = templateCarried(lowFor('dog', ['refused', 'refused'], 2), 'Rex', '2026-07-29T10:00:00.000Z')
  assert.match(dog, /showed refusing every meal you rated — worth a word with your vet\. /)
})

Deno.test('CUL-2593: the model never phrases the card, so it cannot soften the call', () => {
  const soft = `Miso refused her meals today — ${SOFT}.`
  assert.equal(validatePhrasing(soft, lowFor('cat', ['refused', 'refused'])), false)
})

// Adversarial pass 1: the shape production most often makes. A cat refusing her USUAL food all day
// fires refused_normal_food (the conditional ask) beside the all-refused card (the call today). By
// trigger alone the soft card led, so Ask's safety line and Home's lead dropped the call.
function usualFoodLead(species: Species, todayDays: number): IntakeDeclineFinding[] {
  const out = detectIntakeDecline(recordOf(species, ['refused', 'refused'], todayDays, 'f-usual'))
  const ranked = rankFindings(out, { name: 'Miso', species, dietTrialActive: false }).map((r) => r.finding)
  return ranked.filter((f): f is IntakeDeclineFinding => f.type === 'intake_decline')
}

Deno.test('CUL-2593: a cat refusing her usual food all day leads with the call, not "just turned down"', () => {
  const ranked = usualFoodLead('cat', 1)
  assert.deepEqual(ranked.map((f) => f.trigger), ['consecutive_low', 'refused_normal_food'])
  assert.equal(ranked[0].allRefused, true)
  assert.equal(templateIntakeDecline(ranked[0], 'Miso'), `Miso refused every meal you rated today — ${CALL}.`)
})

Deno.test('CUL-2593: "other" refusing the usual food leads with the call too; a dog keeps the trigger order', () => {
  assert.deepEqual(usualFoodLead('other', 2).map((f) => f.trigger), ['consecutive_low', 'refused_normal_food'])
  const dog = usualFoodLead('dog', 2)
  assert.deepEqual(dog.map((f) => f.trigger), ['refused_normal_food', 'consecutive_low'])
})

Deno.test("CUL-2593: a cat's plain dip beside a turned-down usual food keeps the trigger order", () => {
  const out = detectIntakeDecline(recordOf('cat', ['refused', 'picked'], 1, 'f-usual'))
  const ranked = rankFindings(out, { name: 'Miso', species: 'cat', dietTrialActive: false }).map((r) => r.finding).filter((f): f is IntakeDeclineFinding => f.type === 'intake_decline')
  assert.deepEqual(ranked.map((f) => f.trigger), ['refused_normal_food', 'consecutive_low'])
  assert.equal(ranked[1].allRefused, false)
})

Deno.test("CUL-2593: Ask's safety line relays the call on a cat refusing her usual food", () => {
  // Ask leads with the first live safety card in the cached order, which is the ranker's.
  const raw = usualFoodLead('cat', 1).map((f) => ({ type: f.type, priorityClass: f.priorityClass, payload: { text: templateIntakeDecline(f, 'Miso') } }))
  assert.equal(leadingSafetyText(raw, 'Miso'), `Miso refused every meal you rated today — ${CALL}.`)
})
