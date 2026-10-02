// The synthetic record at an instant, in the shape generate-signal's reads return
// (Engines v3 PR-16, EN-1, CUL-1131).
//
// PR-15's corpus hands the observer ONE live record per scenario, every pet's rows together and
// in write order (trajectory/types.ts). This file is the shell's reads, restated over that
// record: one pet, the as-of rule (asOf.ts), the 180-day lookback and the filters each query in
// generate-signal/index.ts carries. It restates the QUERIES, never the engine: everything after
// the rows is the shipped `runSignalPipeline`, imported unchanged (C-34).
//
// What the corpus cannot give the shell, stated so a blind spot does not read as coverage:
//   · medications: no scenario models a course (`regimens` and `doseEvents` are always []);
//   · `feeding_arrangements.ended_at` (076): the corpus writes no toggle-off, so it is null;
//   · the owner's zone read can fail in production and degrade ⑥; here it always answers.

import { CORRELATION_SYMPTOM_TYPES } from '../detection.ts'
import type { SignalRows } from '../pipeline.ts'
import type { SyntheticRecord } from '../../_shared/engineCorpus/trajectory/types.ts'
import { flagsAsOf, visibleAt } from './asOf.ts'

/** generate-signal/index.ts LOOKBACK_DAYS. */
export const LOOKBACK_DAYS = 180

const SYMPTOM_TYPES = new Set<string>(CORRELATION_SYMPTOM_TYPES as readonly string[])

/** One pet's rows as the shell would have read them at `T` (ms). */
export function rowsAt(record: SyntheticRecord, petKey: string, T: number): SignalRows {
  const pet = record.pets.find((p) => p.key === petKey)
  if (!pet) throw new Error(`rowsAt: no pet ${petKey} in ${record.scenarioId}`)
  const foods = new Map(record.foods.map((f) => [f.id, f]))

  const symptoms = record.events
    .filter((e) => e.petKey === petKey && SYMPTOM_TYPES.has(e.ty) && visibleAt(e, T, LOOKBACK_DAYS))
    .map((e) => ({ id: e.id, event_type: e.ty, occurred_at: e.at, occurred_at_confidence: e.cf, severity: e.sev }))

  const meals = record.meals
    .filter((m) => m.petKey === petKey && visibleAt(m, T, LOOKBACK_DAYS))
    .map((m) => {
      const f = foods.get(m.foodItemId)
      return {
        id: m.id,
        occurred_at: m.at,
        occurred_at_confidence: m.cf,
        meals: {
          food_item_id: m.foodItemId,
          intake_rating: m.rating,
          food_items: f
            ? { primary_protein: f.primaryProtein, proteins: f.proteins, food_type: f.foodType, format: f.format, brand: f.brand, product_name: f.productName }
            : null,
        },
      }
    })

  // `status = 'active'`, limit 1, as the query reads it: the trial row exists once it is written.
  const activeTrials = record.trials
    .filter((t) => t.petKey === petKey && t.status === 'active' && Date.parse(t.created_at) <= T)
    .slice(0, 1)
    .map((t) => ({ started_at: t.started_at, target_duration_days: t.target_duration_days }))

  const arrangements = record.arrangements
    .filter((a) => a.petKey === petKey && a.method === 'free_choice' && Date.parse(a.created_at) <= T && (a.deleted_at === null || Date.parse(a.deleted_at) > T))
    .map((a) => ({
      id: a.id,
      food_item_id: a.food_item_id,
      created_at: a.created_at,
      is_shared: a.is_shared,
      active_from: a.active_from,
      active_until: a.active_until,
      ended_at: null,
      food_items: { primary_protein: a.primary_protein, proteins: a.proteins },
    }))

  // `events!inner(occurred_at)` with the event's deleted_at and lookback filters: a read is in
  // the set when its event is visible at T and the read itself was written by T.
  const eventById = new Map(record.events.map((e) => [e.id, e]))
  const incidentAnalyses = record.analyses.flatMap((a) => {
    const ev = eventById.get(a.event_id)
    if (!ev || ev.petKey !== petKey || !visibleAt(ev, T, LOOKBACK_DAYS) || Date.parse(a.created_at) > T) return []
    const f = flagsAsOf(a, T)
    return [{
      event_id: a.event_id,
      incident_type: a.incident_type,
      status: a.status,
      blood_present: f.blood,
      stool_blood_present: a.stool_blood_present,
      foreign_material_present: f.foreign,
      contents: a.contents,
      bile_present: a.bile_present,
      events: { occurred_at: ev.at },
    }]
  })

  return {
    pet: { name: pet.name, species: pet.species },
    symptoms,
    meals,
    activeTrials,
    arrangements,
    timezone: record.tz,
    regimens: [],
    doseEvents: [],
    incidentAnalyses,
  }
}
