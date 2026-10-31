// A synthetic export, shaped exactly like export.sql's result (CUL-2308, ruling X).
//
// Nothing here is real: an invented cat, an invented owner, invented foods and dates. It is
// the one piece of the harness that is committed with data in it, and it exists so the
// tests can drive the loader and the stand-in end to end without touching the database.
// Every read export.sql returns is present, embeds included, in the shape PostgREST gives
// the loader (a many-to-one embed as an object, a one-to-many as an array).

import { md5, type ExportRow } from './snapshot.ts'

export const FIXTURE_PET = 'f1f1f1f1-0000-4000-8000-000000000001'
export const FIXTURE_OWNER = 'f1f1f1f1-0000-4000-8000-0000000000aa'
export const FIXTURE_CUTOFF = '2026-10-01T12:00:00+00:00'

const DAY = 86_400_000
const at = (daysAgo: number, hour = 8) =>
  new Date(Date.parse(FIXTURE_CUTOFF) - daysAgo * DAY + (hour - 12) * 3_600_000).toISOString()

const FOOD = {
  food_type: 'food',
  format: 'dry',
  primary_protein: 'rabbit',
  proteins: ['rabbit'],
  ingredients_notes: null,
  ai_extraction_confidence: null,
  brand: 'Invented Kitchen',
  product_name: 'Rabbit Formula',
}

type EventFixture = Record<string, unknown> & { id: string; occurred_at: string }

function eventRow(id: string, type: string, daysAgo: number, hour: number): EventFixture {
  return {
    id,
    event_type: type,
    occurred_at: at(daysAgo, hour),
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    created_at: at(daysAgo, hour),
    meals: type === 'meal'
      ? { food_item_id: 'food-1', intake_rating: 'all', quantity: null, component_count: null, food_items: FOOD }
      : null,
    meal_components: [],
  }
}

/** The fixture's rows by read. `mealDays` sets how many days of two meals a day it holds. */
export function fixtureRows(mealDays = 30): Record<string, unknown[]> {
  const events: EventFixture[] = []
  for (let d = 0; d < mealDays; d++) {
    events.push(eventRow(`meal-${d}-am`, 'meal', d, 8), eventRow(`meal-${d}-pm`, 'meal', d, 18))
  }
  events.push(eventRow('vomit-1', 'vomit', 3, 9), eventRow('vomit-2', 'vomit', 10, 21))
  events.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : a.id < b.id ? 1 : -1))

  return {
    pet: [{
      id: FIXTURE_PET, user_id: FIXTURE_OWNER, name: 'Pebble', species: 'cat', breed: null, sex: 'female',
      date_of_birth: '2019-04-01', date_of_birth_precision: 'month', weight_kg: 4.1,
    }],
    user_profiles: [{ display_name: 'Invented Owner', timezone: 'UTC' }],
    vet_visits: [],
    diet_trials: [{
      id: 'trial-1', food_item_id: 'food-1', started_at: at(20, 7), target_duration_days: 56, status: 'active',
      completed_at: null, ended_at: null, indication: 'gi', outcome: null, outcome_notes: null,
      stopped_reason: null, food_label: 'Invented Kitchen Rabbit Formula', vet_name: null,
      target_protein: 'rabbit', target_protein_set_at: at(20, 7),
      food_items: FOOD,
      diet_trial_foods: [{
        food_item_id: 'food-1', food_label: 'Invented Kitchen Rabbit Formula', role: 'primary_diet',
        allowed_from: at(20, 7), allowed_until: null,
        food_items: { ...FOOD },
      }],
    }],
    household: [{ id: FIXTURE_PET, species: 'cat', user_id: FIXTURE_OWNER }],
    app_config: [{ key: 'engines_v3_en0', value: { enabled: false, allowlist: [FIXTURE_OWNER] } }],
    events,
    event_ai_analysis: [],
    weight_checks: [],
    medication_administrations: [],
    medications: [],
    feeding_arrangements: [],
    conditions: [],
    event_attachments: [{ id: 'att-1', event_id: 'vomit-1', storage_path: 'withheld/att-1', mime_type: 'image/jpeg', sort_order: 0 }],
    looks: [],
    capture_changes: [],
    medication_items: [],
  }
}

/** The fixture as export.sql's result rows: `read`, `n`, `md5` taken over `body`, `body`. */
export function fixtureExport(rows: Record<string, unknown[]> = fixtureRows()): ExportRow[] {
  const meta = JSON.stringify({ subjects: 1, pet_id: FIXTURE_PET, owner_id: FIXTURE_OWNER, cutoff: FIXTURE_CUTOFF })
  const out: ExportRow[] = [{ read: 'meta', n: 1, md5: md5(meta), body: meta }]
  for (const [read, list] of Object.entries(rows)) {
    const body = JSON.stringify(list)
    out.push({ read, n: list.length, md5: md5(body), body })
  }
  return out
}
