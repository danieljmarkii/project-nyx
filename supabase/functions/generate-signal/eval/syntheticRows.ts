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
import type { CareRecord, AckFact } from '../careState.ts'
import type { CareContextFacts } from '../careContext.ts'

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

// ── EN-9 (Engines v3 PR-23, CUL-1417): the care record and the logging facts ──────────────
//
// What the shell reads while `engines_v3_en9` is on, restated over the corpus, which spells the
// owner's side its own way (PR-15 D-2):
//   · a "My vet knows" answer (`ownerAnswers`, kind vet_knows) is a `my_vet_knows` row anchored
//     on its local day;
//   · a visit whose appointment carried the concern (a `record` question naming the sign) is an
//     `at_vet_tick` row anchored on the visit day and written when the visit was. That is the tick
//     at the vet the client half (PR-35) collects, and the corpus's own `via: 'visit'`
//     acknowledgement. A visit that carried nothing (the vaccine visit) writes no row: a visit
//     alone acknowledges nothing (E-2);
//   · no appointment is passed, as the shell passes none (CUL-1531);
//   · lethargy instants, though no scenario writes one yet (stated: C1a's source 2 reads ~0 here).
// The logging facts are EN-10's: every visible event and meal in the lookback, and the last visit.

function localDayOf(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}

/** One pet's care record as the shell would have read it at `T` (ms). */
export function careAt(record: SyntheticRecord, petKey: string, T: number): CareRecord {
  const acknowledgements: AckFact[] = []
  for (const a of record.ownerAnswers) {
    if (a.petKey !== petKey || Date.parse(a.answeredAt) > T) continue
    acknowledgements.push({
      id: `ack:${petKey}:${a.sign}:${a.answeredAt}`,
      sign: a.sign as AckFact['sign'],
      source: 'my_vet_knows',
      anchorOn: localDayOf(Date.parse(a.answeredAt), record.tz),
      createdAt: a.answeredAt,
      retracts: null,
      trial: null,
      course: null,
    })
  }
  for (const v of record.visits) {
    if (v.petKey !== petKey || Date.parse(v.created_at) > T) continue
    const appt = record.appointments.find((x) => x.visitId === v.id)
    const signs = new Set((appt?.questions ?? []).filter((q) => q.source === 'record').map((q) => q.source_ref))
    for (const sign of signs) {
      acknowledgements.push({
        id: `ack:${petKey}:${sign}:${v.id}`,
        sign: sign as AckFact['sign'],
        source: 'at_vet_tick',
        anchorOn: v.visited_at,
        createdAt: v.created_at,
        retracts: null,
        trial: null,
        course: null,
      })
    }
  }
  const lethargyAt = record.events
    .filter((e) => e.petKey === petKey && (e.ty as string) === 'lethargy' && visibleAt(e, T, LOOKBACK_DAYS))
    .map((e) => e.at)
  // The corpus runs 180 days, the lookback's length, so nothing lies behind it: no history read.
  return { acknowledgements, appointments: [], lethargyAt, history: null }
}

/** EN-10's facts at `T`: the last visit before today, and every visible event and meal. */
export function careFactsAt(record: SyntheticRecord, petKey: string, T: number): CareContextFacts {
  const today = localDayOf(T, record.tz)
  const lastVisit = record.visits
    .filter((v) => v.petKey === petKey && Date.parse(v.created_at) <= T && v.visited_at < today)
    .map((v) => v.visited_at)
    .sort()
    .pop() ?? null
  const loggedAt = [
    ...record.events.filter((e) => e.petKey === petKey && visibleAt(e, T, LOOKBACK_DAYS)).map((e) => e.at),
    ...record.meals.filter((m) => m.petKey === petKey && visibleAt(m, T, LOOKBACK_DAYS)).map((m) => m.at),
  ]
  return { lastVisitOn: lastVisit, loggedAt, readSinceIso: new Date(T - LOOKBACK_DAYS * 86_400_000).toISOString() }
}
