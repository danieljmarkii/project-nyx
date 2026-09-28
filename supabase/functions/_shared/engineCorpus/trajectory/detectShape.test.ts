// The corpus's rows fit the shipped engine's input (Engines v3 PR-15, CUL-508).
// Run with: deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/
//
// A SHAPE check, not a scorecard. It feeds one evening of a few scenarios to the shipped
// `detectSignals` (imported read-only; this PR does not touch generate-signal) and asserts only
// that the rows map onto its types and that it reads them. What the engine SAYS about these
// pets is PR-16's to measure, with the replay core moved here and the one as-of visibility
// rule; the mapping below is deliberately thin and is not that rule.
//
// It earned its place on the day it was written: the first draft of the corpus wrote photo
// reads with blood as yes/no, and the engine's type (013's vomit_blood) is none_visible /
// fresh_red / coffee_ground / unsure. A corpus in the wrong vocabulary would have shown every
// injected red flag as a miss.

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  CORRELATION_SYMPTOM_TYPES,
  DEFAULT_CONFIG,
  detectSignals,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type SymptomEvent,
} from '../../../generate-signal/detection.ts'
import { scenarioById, simulate } from './index.ts'
import type { SimulationResult } from './index.ts'

/** The last evening the owner was shown anything: the final day at 21:00 local. */
function lastEvening(r: SimulationResult): string {
  return r.shown[r.shown.length - 1].nowIso
}

function inputAt(r: SimulationResult, petKey: string, T: number): DetectionInput {
  const rec = r.record
  const pet = rec.pets.find((p) => p.key === petKey)!
  const live = (row: { cr: string; del: string | null; at: string }) => Date.parse(row.cr) <= T && (row.del === null || Date.parse(row.del) > T) && Date.parse(row.at) <= T
  const types = new Set<string>(CORRELATION_SYMPTOM_TYPES)
  const foods = new Map(rec.foods.map((f) => [f.id, f]))
  const symptomEvents: SymptomEvent[] = rec.events
    .filter((e) => e.petKey === petKey && types.has(e.ty) && live(e))
    .map((e) => ({ id: e.id, type: e.ty as SymptomEvent['type'], occurredAt: e.at, occurredAtConfidence: e.cf, severity: e.sev }))
  const mealEvents: MealEvent[] = rec.meals
    .filter((m) => m.petKey === petKey && live(m))
    .map((m) => {
      const f = foods.get(m.foodItemId)!
      return {
        id: m.id,
        occurredAt: m.at,
        occurredAtConfidence: m.cf,
        isMedicationVehicle: false,
        foodItemId: m.foodItemId,
        primaryProtein: f.primaryProtein,
        proteins: f.proteins,
        intakeRating: m.rating as IntakeRating | null,
        foodType: f.foodType as MealEvent['foodType'],
        format: f.format as MealEvent['format'],
        foodLabel: `${f.brand} ${f.productName}`,
      }
    })
  const eventsById = new Map(rec.events.map((e) => [e.id, e]))
  const trial = rec.trials.find((t) => t.petKey === petKey && Date.parse(t.created_at) <= T)
  return {
    pet: { name: pet.name, species: pet.species, dietTrialActive: trial !== undefined },
    symptomEvents,
    mealEvents,
    feedingArrangements: rec.arrangements
      .filter((a) => a.petKey === petKey)
      .map((a) => ({ id: a.id, primaryProtein: a.primary_protein, proteins: a.proteins, activeFrom: a.active_from, activeUntil: a.active_until, attributionConfidence: 'high' as const })),
    incidentAnalyses: rec.analyses
      .filter((a) => eventsById.get(a.event_id)?.petKey === petKey && Date.parse(a.created_at) <= T)
      .map((a) => ({ eventId: a.event_id, incidentType: a.incident_type, occurredAt: eventsById.get(a.event_id)!.at, bloodPresent: a.blood_present, stoolBloodPresent: a.stool_blood_present, foreignMaterialPresent: a.foreign_material_present })),
    dietTrial: trial ? { startedAt: trial.started_at, targetDurationDays: trial.target_duration_days } : undefined,
    timezone: rec.tz,
    now: new Date(T).toISOString(),
  }
}

Deno.test('one evening of each shape of pet maps onto the shipped engine’s input, and the engine reads it', () => {
  const cases: [string, string][] = [
    ['inj-enteropathy-onset', 'a'],
    ['inj-red-flag', 'a'],
    ['null-two-cat-home', 'a'],
    ['null-grazer', 'a'],
    ['inj-trial-responder', 'a'],
    ['null-species-other', 'a'],
    ['inj-kennel-cough-gag', 'a'],
  ]
  for (const [id, petKey] of cases) {
    const sc = scenarioById(id)
    const r = simulate(sc, sc.ciSeeds[0])
    const T = Date.parse(lastEvening(r))
    const input = inputAt(r, petKey, T)
    assert(input.symptomEvents.length > 0 && input.mealEvents.length > 0, `${id}: the evening has rows`)
    const findings = detectSignals(input, DEFAULT_CONFIG)
    assert(Array.isArray(findings), `${id}: the engine returned findings`)
  }
})

Deno.test('the injected red flag is in the engine’s red-flag vocabulary', () => {
  const sc = scenarioById('inj-red-flag')
  const r = simulate(sc, sc.ciSeeds[0])
  const T = Date.parse(lastEvening(r)) + 2 * 86_400_000 // past any back-fill
  const flagged = inputAt(r, 'a', T).incidentAnalyses!.filter((a) => a.bloodPresent === 'fresh_red' || a.bloodPresent === 'coffee_ground')
  assert(flagged.length === 1, 'exactly one red-flag read reaches the engine')
})
