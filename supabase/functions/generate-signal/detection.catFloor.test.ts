// CUL-2680 (clinical-guardrails line 85, D3: the predicate wins over the card type): a cat with no
// meal rated Most or All in 24 hours gets the floor's words in the server sentence, whatever trigger
// raised the card. The fixture is the issue's own record, driven through the REAL detector (C-34,
// C-35): nine days of "All", the last at 07:00 yesterday, then "Some" at 18:00, 08:00 and 18:00, and
// now is 20:00. The engine files it `consecutive_low` with `allRefused` false; before this fix the
// sentence said "a word with your vet if it carries on".

import { strict as assert } from 'node:assert'
import {
  detectIntakeDecline,
  intakeMeetsCatFloor,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'
import { NO_GOOD_MEAL_CLAUSE, templateCarried, templateIntakeDecline, validatePhrasing } from './phrasing.ts'

const HOUR = 3_600_000
const NOW = '2026-11-08T20:00:00.000Z'
const LAST_ALL = '2026-11-07T07:00:00.000Z'
const CALL = 'call your vet today'
const SOFT = 'worth keeping an eye on, and a word with your vet if it carries on'

let seq = 0
function meal(iso: string, rating: IntakeRating): MealEvent {
  seq += 1
  return { id: `m${seq}`, occurredAt: iso, foodItemId: 'f1', primaryProtein: 'chicken', intakeRating: rating, foodType: 'meal', foodLabel: 'Kibble' }
}

function issueRecord(species: Species, extra: MealEvent[] = []): DetectionInput {
  const meals: MealEvent[] = []
  for (let d = 0; d < 9; d++) {
    meals.push(meal(new Date(Date.parse(LAST_ALL) - d * 24 * HOUR).toISOString(), 'all'))
    meals.push(meal(new Date(Date.parse(LAST_ALL) - d * 24 * HOUR - 11 * HOUR).toISOString(), 'all'))
  }
  meals.push(meal('2026-11-07T18:00:00.000Z', 'some'), meal('2026-11-08T08:00:00.000Z', 'some'), meal('2026-11-08T18:00:00.000Z', 'some'), ...extra)
  return { pet: { name: 'Kiki', species, dietTrialActive: false }, symptomEvents: [], mealEvents: meals, now: NOW, timezone: 'UTC' }
}

Deno.test('CUL-2680: the issue’s cat is filed as eating less, and carries D3’s facts', () => {
  const [f] = detectIntakeDecline(issueRecord('cat'))
  assert.equal(f.trigger, 'consecutive_low')
  assert.equal(f.allRefused, false)
  assert.equal(f.lastGoodMealIso, LAST_ALL)
  assert.equal(f.noGoodMeal24h, true)
  assert.equal(intakeMeetsCatFloor(f), true)
})

Deno.test('CUL-2680: the server sentence takes the floor and says why', () => {
  const [f] = detectIntakeDecline(issueRecord('cat'))
  const t = templateIntakeDecline(f, 'Kiki')
  assert.equal(t, `Kiki has eaten less than usual today, and ${NO_GOOD_MEAL_CLAUSE} — ${CALL}.`)
  assert.ok(!t.includes('if it carries on'))
  // The carried form keeps the floor too.
  assert.match(templateCarried(f, 'Kiki', '2026-11-08T09:00:00.000Z'), new RegExp(`— ${CALL}\\.`))
})

Deno.test('CUL-2680: every partial trigger meeting D3 takes the floor', () => {
  const [f] = detectIntakeDecline(issueRecord('cat'))
  const refused = templateIntakeDecline({ ...f, trigger: 'refused_normal_food', refusedFoodLabel: 'tuna pâté' }, 'Kiki')
  assert.equal(refused, `Kiki just turned down tuna pâté, which Kiki normally eats, and ${NO_GOOD_MEAL_CLAUSE} — ${CALL}.`)
  const i5 = templateIntakeDecline(
    { ...f, trigger: 'refused_then_vomited', refusedThenVomited: { episodeCount: 2, dayCount: 2, windowMinutes: 30, firstLocalDay: '2026-11-06' } as never },
    'Kiki',
  )
  assert.ok(i5.endsWith(`Kiki ${NO_GOOD_MEAL_CLAUSE}, so ${CALL}.`), i5)
})

Deno.test('CUL-2680: no model sentence stands over a card meeting D3 (it falls back to the template)', () => {
  const [f] = detectIntakeDecline(issueRecord('cat'))
  const soft = `Kiki has eaten less than usual today — ${SOFT}.`
  assert.equal(validatePhrasing(soft, f), false)
  assert.equal(validatePhrasing(soft, { ...f, noGoodMeal24h: false }), true, 'the control: the same card with a good meal in the day')
})

Deno.test('CUL-2680: a dog keeps the conditional ask (Pattern 11); a cat who ate Most 23 h ago keeps the card’s own', () => {
  // The same facts on a dog's card (a dog's day of "Some" may not fire at all; the rule is the card's).
  const [cat] = detectIntakeDecline(issueRecord('cat'))
  const dog = { ...cat, species: 'dog' as const }
  assert.equal(intakeMeetsCatFloor(dog), false)
  assert.ok(templateIntakeDecline(dog, 'Rex').endsWith(`${SOFT}.`))
  const fed = detectIntakeDecline(issueRecord('cat', [meal('2026-11-07T21:00:00.000Z', 'most')]))
  assert.ok(fed.length > 0, 'premise: the day is still low enough to fire')
  for (const f of fed) {
    assert.equal(f.noGoodMeal24h, false)
    assert.equal(f.lastGoodMealIso, '2026-11-07T21:00:00.000Z')
  }
})
