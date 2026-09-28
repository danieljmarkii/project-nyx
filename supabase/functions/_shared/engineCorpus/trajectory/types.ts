// The trajectory corpus: types (Engines v3 PR-15, CUL-508).
//
// A scenario is a small simulation with three layers, kept apart on purpose:
//   TRUTH     what the pet actually did (episodes, meals eaten, true weight). The known answer.
//   LOGGING   what the owner recorded of it. This is the only layer the engine is ever fed.
//   RESPONSE  what the owner did after an evening's cards (answers, visits, rechecks, lapses).
//
// `SyntheticRecord` is the logged layer. Its field names mirror the replay's `PetRecord`
// (scripts/engine-replay/record.deno.ts) so PR-16's move of the replay core onto this corpus
// is mechanical; every row also carries a `petKey`, because one scenario can hold two pets.
// `TruthLedger` is the answer key. It is never part of the record, so an engine fed the
// record cannot read it by accident.

export type Iso = string

export type SyntheticSpecies = 'cat' | 'dog' | 'other'

/** The signs this corpus generates. A subset of detection.ts's SymptomType. */
export type Sign = 'vomit' | 'diarrhea' | 'cough'

// ─── The logged layer: what the engine may see ─────────────────────────────────────────

export interface SynEvent {
  id: string
  petKey: string
  /** events.event_type */
  ty: 'vomit' | 'diarrhea' | 'cough' | 'meal' | 'weight_check'
  /** occurred_at (UTC ISO). For a found pile this is the window's latest edge, as the app writes it. */
  at: Iso
  /** occurred_at_confidence */
  cf: 'witnessed' | 'estimated' | 'window'
  /** occurred_at_earliest / occurred_at_latest, set only on a window row. */
  ea: Iso | null
  la: Iso | null
  /** created_at: when the row was written. Later than `at`, sometimes by a day (back-fill). */
  cr: Iso
  /** deleted_at: soft delete only (CLAUDE.md hard constraint). */
  del: Iso | null
  sev: number | null
}

export interface SynMeal {
  /** The meal's event id (meals are events with a child row). */
  id: string
  petKey: string
  at: Iso
  cf: 'witnessed'
  cr: Iso
  del: Iso | null
  foodItemId: string
  rating: 'all' | 'most' | 'some' | null
}

export interface SynFood {
  id: string
  primaryProtein: string
  proteins: string[]
  foodType: 'dry' | 'wet' | 'treat'
  format: 'kibble' | 'pate' | 'chunks' | 'jerky'
  brand: string
  productName: string
}

export interface SynTrial {
  petKey: string
  started_at: string // YYYY-MM-DD
  target_duration_days: number
  status: 'active'
  created_at: Iso
  foodItemId: string
}

/** A free-choice standing fact (feeding_arrangements, method = 'free_choice'). */
export interface SynArrangement {
  id: string
  petKey: string
  food_item_id: string
  is_shared: boolean
  active_from: string
  active_until: string | null
  method: 'free_choice'
  deleted_at: Iso | null
  created_at: Iso
  primary_protein: string
  proteins: string[]
}

/** event_ai_analysis.blood_present (013's vomit_blood). Only fresh_red and coffee_ground are red flags. */
export type VomitBlood = 'none_visible' | 'fresh_red' | 'coffee_ground' | 'unsure'
/** 013's vomit_tristate. */
export type VomitTristate = 'yes' | 'no' | 'unsure'

/** A photo read's structured output (event_ai_analysis), as the model is stated to have answered. */
export interface SynAnalysis {
  event_id: string
  incident_type: 'vomit'
  status: 'completed'
  blood_present: VomitBlood
  stool_blood_present: null
  foreign_material_present: VomitTristate
  contents: string[] | null
  bile_present: VomitTristate
  created_at: Iso
  edited_at: null
  recommendation: null
  contextual_flags: null
  visual_flags: null
  /** ai_raw_payload's blood / foreign material: the model's own answer (no owner edits here). */
  rb: VomitBlood
  rf: VomitTristate
}

/** weight_checks (024): the child of a `weight_check` event. There is no source column. */
export interface SynWeightCheck {
  event_id: string
  petKey: string
  weight_kg: number
}

/** pets.weight_kg as first entered on the profile: a number with no date and no source. */
export interface SynProfileWeight {
  petKey: string
  weight_kg: number
  /** The pet row's created_at; the profile weight has no timestamp of its own. */
  pet_created_at: Iso
}

/** pet_weight_displacements (072): the value a later write displaced. */
export interface SynWeightDisplacement {
  petKey: string
  weight_kg: number
  replaced_by_kg: number
  source: 'profile'
  held_since_earliest: Iso
  held_since_latest: Iso
  displaced_at: Iso
}

export interface SynAppointmentQuestion {
  text: string
  source: 'record' | 'owner'
  /** The sign the question raises; a 'record' question is the concern the app listed. */
  source_ref: Sign
  asked_at: Iso
}

/** vet_appointments (066). */
export interface SynAppointment {
  id: string
  petKey: string
  scheduled_at: Iso
  reason: string
  questions: SynAppointmentQuestion[] | null
  vet_visit_id: string | null
  created_at: Iso
}

/** vet_visits (001). `next_visit_at` is the recheck date. */
export interface SynVisit {
  id: string
  petKey: string
  visited_at: string // YYYY-MM-DD
  reason: string
  next_visit_at: string | null // YYYY-MM-DD
  created_at: Iso
}

/**
 * The owner's "My vet knows" (the 9/26 ruling: an acknowledgement of a concern, per sign,
 * stored as a dated fact). Corpus-local shape (PR-15 D-2): PR-11b's input contract spells
 * the field; PR-16 maps this onto it.
 */
export interface SynOwnerAnswer {
  petKey: string
  sign: Sign
  kind: 'vet_knows'
  answeredAt: Iso
}

export interface SynPet {
  key: string
  name: string
  species: SyntheticSpecies
  created_at: Iso
  /** pets.weight_kg at the end of the simulation (the latest weigh-in, or the profile value). */
  weight_kg: number | null
}

export interface SyntheticRecord {
  scenarioId: string
  seed: number
  tz: string
  pets: SynPet[]
  events: SynEvent[]
  meals: SynMeal[]
  foods: SynFood[]
  trials: SynTrial[]
  arrangements: SynArrangement[]
  /** Always empty today: no scenario models a medication course yet (stated, not implied). */
  medications: never[]
  administrations: never[]
  analyses: SynAnalysis[]
  weightChecks: SynWeightCheck[]
  profileWeights: SynProfileWeight[]
  weightDisplacements: SynWeightDisplacement[]
  appointments: SynAppointment[]
  visits: SynVisit[]
  ownerAnswers: SynOwnerAnswer[]
}

// ─── The truth layer: the answer key ───────────────────────────────────────────────────

/** Why an episode happened. Everything except 'background' is an effect the scenario put there. */
export type EpisodeCause =
  | 'background' // the null process
  | 'rate_step' // an injected change in rate (onset, doubling)
  | 'protein' // an injected protein reaction
  | 'indiscretion' // a dog's garbage-raid spike (a null for the food lanes)
  | 'flare' // a self-limiting flare (the trial-at-a-peak null)
  | 'infection' // a self-limiting infectious cough (kennel cough)

export interface TruthEpisode {
  id: string
  petKey: string
  sign: Sign
  at: Iso
  cause: EpisodeCause
  /** Rows the owner wrote for it (0: missed; 2: a duplicate). */
  loggedEventIds: string[]
  /** The pet the row was logged to. Differs from `petKey` when a found pile goes to the wrong cat. */
  loggedPetKey: string | null
  /** The logged type. 'vomit' for a kennel-cough gag the owner called a vomit. */
  loggedAs: SynEvent['ty'] | null
}

export interface TruthMeal {
  petKey: string
  at: Iso
  foodItemId: string
  protein: string
  loggedEventId: string | null
}

export interface TruthWeighIn {
  eventId: string
  petKey: string
  trueKg: number
  scale: 'home' | 'clinic'
}

export interface TruthAck {
  petKey: string
  sign: Sign
  day: number
  via: 'answer' | 'visit'
}

export interface TruthLedger {
  episodes: TruthEpisode[]
  meals: TruthMeal[]
  weighIns: TruthWeighIn[]
  acks: TruthAck[]
}

// ─── The engine seam ───────────────────────────────────────────────────────────────────

export type AskRegister = 'call' | 'book_visit' | 'word_with_vet' | 'mention_to_vet' | 'none'

/** One card as the owner saw it on an evening. PR-16 fills this from the pipeline and
 *  `signalHomeAsk` (lib/signalHomeLine.ts), never from a text match. */
export interface ShownCard {
  petKey: string
  findingType: string
  /** The sign the card is about, or null (a food or weight card). */
  sign: Sign | null
  ask: AskRegister
  priorityClass: string
}

export interface EveningView {
  scenarioId: string
  dayIndex: number
  /** The evening's instant (21:00 local), UTC ISO. */
  nowIso: Iso
  /**
   * Every row written so far. A back-filled row can carry a `cr` later than `nowIso`; the
   * observer applies the one as-of visibility rule (the replay's `visibleAt`), which this
   * corpus does not restate.
   */
  record: SyntheticRecord
}

/** The only seam between the corpus and an engine. */
export type Observer = (view: EveningView) => ShownCard[]

export interface ResponseLogEntry {
  petKey: string
  day: number
  action: 'answer' | 'book' | 'visit' | 'recheck_booked' | 'lapse_started'
  sign: Sign | null
}

export interface SimulationResult {
  record: SyntheticRecord
  truth: TruthLedger
  responses: ResponseLogEntry[]
  /** Cards the observer returned, per evening, as the owner saw them. */
  shown: { day: number; nowIso: Iso; cards: ShownCard[] }[]
}
