// CUL-2593 (adversarial pass 2): the Signal now leads a cat's all-refused card (the call today)
// above refused_normal_food, but the vet report carries ONE intake finding and its detail has no
// all-refused branch. Taking the ranker's first card turned "refused a food it normally eats (the
// food)" into "below baseline for 1 consecutive day". The report picks by trigger order, so its
// flag is the one it carried before the lift. Driven through the real detector and ranker (C-34).

import { strict as assert } from 'node:assert'
import {
  detectIntakeDecline,
  rankFindings,
  type IntakeDeclineFinding,
  type IntakeRating,
  type MealEvent,
  type Species,
} from '../generate-signal/detection.ts'
import { reportIntakeOf } from './report.ts'

const MS_PER_HOUR = 3_600_000
const NOW = '2026-07-30T20:00:00.000Z'
const NOW_MS = Date.parse(NOW)

let seq = 0
function meal(hoursAgo: number, rating: IntakeRating): MealEvent {
  seq += 1
  return {
    id: `m${seq}`,
    occurredAt: new Date(NOW_MS - hoursAgo * MS_PER_HOUR).toISOString(),
    foodItemId: 'f-usual',
    primaryProtein: 'chicken',
    intakeRating: rating,
    foodType: 'meal',
    foodLabel: 'Usual food',
  }
}

/** A week of the usual food eaten well, then `todayDays` days of it refused at both meals. */
function rankedIntake(species: Species, todayDays: number): IntakeDeclineFinding[] {
  const meals: MealEvent[] = []
  for (let d = 1 + todayDays; d <= 8; d++) meals.push(meal(d * 24 + 6, 'all'), meal(d * 24 - 4, 'all'))
  for (let d = 0; d < todayDays; d++) meals.push(meal(d * 24 + 2, 'refused'), meal(d * 24 + 5, 'refused'))
  const out = detectIntakeDecline({
    pet: { name: 'Miso', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents: meals,
    now: NOW,
    timezone: 'UTC',
  })
  return rankFindings(out, { name: 'Miso', species, dietTrialActive: false })
    .map((r) => r.finding)
    .filter((f): f is IntakeDeclineFinding => f.type === 'intake_decline')
}

function reportFlag(ranked: IntakeDeclineFinding[]): IntakeDeclineFinding | null {
  return ranked.reduce<IntakeDeclineFinding | null>((cur, f) => reportIntakeOf(cur, f), null)
}

Deno.test('CUL-2593: a cat refusing her usual food all day: the report still names the refused food', () => {
  const ranked = rankedIntake('cat', 1)
  // The premise: the Signal leads with the call-today card.
  assert.deepEqual(ranked.map((f) => f.trigger), ['consecutive_low', 'refused_normal_food'])
  const flag = reportFlag(ranked)
  assert.equal(flag?.trigger, 'refused_normal_food')
  assert.equal(flag?.refusedFoodLabel, 'Usual food')
})

Deno.test('CUL-2593: a dog and "other" keep the report flag they carried before', () => {
  for (const species of ['dog', 'other'] as const) {
    assert.equal(reportFlag(rankedIntake(species, 2))?.trigger, 'refused_normal_food', species)
  }
})

Deno.test('CUL-2593: a lone intake card is the report flag, whatever its trigger', () => {
  const [low] = rankedIntake('cat', 1)
  assert.equal(reportIntakeOf(null, low), low)
})
