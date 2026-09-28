// The Engines v3 guard corpus: the Signal pipeline (Engines v3 PR-11b, CUL-1267).
//
// HAND-BUILT, NEVER EXPORTED. Every row below was written by hand to state one scenario;
// none came from a real pet's record, and none may (real-record exports never enter the
// repo: the engine-replay README, PMD-12 / CUL-1313). It lives under supabase/functions/
// because that is the only tree CI's Deno job reads (ci.yml `--allow-read`).
//
// Rows are in the shape PostgREST hands generate-signal/index.ts (snake_case, embeds as
// objects), so a case exercises the mapping as well as the engine. Each case states, by
// hand, the finding types the shipped pipeline puts in the cache row (stand-down markers
// included, in order) and any mapping fact the case exists for. They are the flag-off
// expectations: what EN-F promises every account not on an allowlist keeps. A Signal phase
// that adds a key adds each case's flag-on expectation beside it, as PR-13a does for the
// vomit corpus.
//
// PR-15 (CUL-508) writes the synthetic population beside this file; it does not edit it.

import type {
  ArrangementRow,
  CareRecord,
  IncidentAnalysisRow,
  MealEventRow,
  MedDoseEventRow,
  PriorSignal,
  RegimenRow,
  SignalRows,
  SymptomRow,
} from '../../generate-signal/pipeline.ts'

export interface SignalPipelineCase {
  name: string
  nowIso: string
  rows: SignalRows
  prior: PriorSignal | null
  // The cache row's `findings[].finding.type`, in order, stated by hand.
  expectedTypes: string[]
  // A fact about the mapping or the run this case exists to pin, checked by the guard.
  expect?: {
    dietTrialActive?: boolean
    vehicleMealIds?: string[]
    medicationWindowCount?: number
    isBuilding?: boolean
    hasRecentActivity?: boolean
  }
}

const DAY = 86_400_000
export const NOW = '2026-09-10T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)

// ISO for `days` before NOW at `hour`:00 UTC, in PostgREST's `+00:00` spelling when asked
// (the pipeline parses every instant, C-40).
const ago = (days: number, hour = 11, spelling: 'Z' | '+00:00' = 'Z'): string => {
  const d = new Date(NOW_MS - days * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  const iso = d.toISOString()
  return spelling === 'Z' ? iso : iso.replace('.000Z', '+00:00')
}

let seq = 0
const id = (prefix: string) => `${prefix}-${String(++seq).padStart(4, '0')}`

const KIBBLE = {
  primary_protein: 'chicken',
  proteins: ['chicken'],
  food_type: 'meal',
  format: 'dry',
  brand: 'Acme',
  product_name: 'Chicken Kibble',
}
const TREAT = {
  primary_protein: 'beef',
  proteins: ['beef'],
  food_type: 'treat',
  format: 'treat',
  brand: 'Acme',
  product_name: 'Beef Bites',
}

const meal = (
  days: number,
  rating: string | null = 'all',
  food: typeof KIBBLE = KIBBLE,
  hour = 8,
  mealId = id('meal'),
): MealEventRow => ({
  id: mealId,
  occurred_at: ago(days, hour),
  occurred_at_confidence: null,
  meals: { food_item_id: food === KIBBLE ? 'food-kibble' : 'food-treat', intake_rating: rating, food_items: food },
})
const mealsDaily = (from: number, to: number, rating: string | null = 'all'): MealEventRow[] => {
  const out: MealEventRow[] = []
  for (let d = from; d <= to; d++) out.push(meal(d, rating))
  return out
}
const symptom = (type: string, days: number, hour = 11): SymptomRow => ({
  id: id(type),
  event_type: type,
  occurred_at: ago(days, hour, days % 2 === 0 ? 'Z' : '+00:00'),
  occurred_at_confidence: 'witnessed',
  severity: null,
})
// A q2-day course of `type` from `newest` to `oldest` days ago.
const courseQ2 = (type: string, newest: number, oldest: number): SymptomRow[] => {
  const out: SymptomRow[] = []
  for (let d = newest; d <= oldest; d += 2) out.push(symptom(type, d))
  return out
}

const EMPTY = {
  symptoms: [] as SymptomRow[],
  meals: [] as MealEventRow[],
  activeTrials: [],
  arrangements: [] as ArrangementRow[],
  timezone: null,
  regimens: [] as RegimenRow[],
  doseEvents: [] as MedDoseEventRow[],
  incidentAnalyses: [] as IncidentAnalysisRow[],
}
const dog = { name: 'Rex', species: 'dog' }
const cat = { name: 'Miso', species: 'cat' }

// The chronicity card as the previous run cached it (the stand-down's memory).
const priorChronicityRow = (engineFlags: unknown): PriorSignal => ({
  findings: [
    {
      rank: 0,
      text: 'Rex has vomited on and off for six weeks. Worth a call to your vet.',
      finding: {
        type: 'symptom_chronicity',
        priorityClass: 'safety',
        symptomType: 'vomit',
        episodeCount: 21,
        spanDays: 42,
        activeWeeks: 6,
        symptomDays: 21,
        daysSinceLastEpisode: 14,
        firstOnsetIso: ago(56),
        tier: 'firm',
        windowDays: 56,
        associationalOnly: true,
      },
    },
  ],
  generatedAt: new Date(NOW_MS - DAY).toISOString(),
  engineFlags,
})

// The golden stand-down shape (standDown.test.ts): a q2-day vomiting course whose last
// episode was 15 days ago, one past the 14-day recency floor, with meals logged every day
// across the gap. Silent under the real floors; the prior card makes it a stand-down.
const stoppedCourse = (): Omit<SignalRows, 'pet'> => ({
  ...EMPTY,
  symptoms: courseQ2('vomit', 15, 55),
  meals: mealsDaily(0, 15),
})

const vehicleMealId = 'meal-vehicle'

export const SIGNAL_PIPELINE_CORPUS: SignalPipelineCase[] = [
  {
    name: 'a new pet with nothing logged',
    nowIso: NOW,
    rows: { pet: dog, ...EMPTY },
    prior: null,
    expectedTypes: [],
    expect: { isBuilding: true, hasRecentActivity: false },
  },
  {
    name: 'a dog eating well every day, no symptoms',
    nowIso: NOW,
    rows: { pet: dog, ...EMPTY, meals: mealsDaily(0, 20) },
    prior: null,
    expectedTypes: [],
    expect: { isBuilding: true, hasRecentActivity: true },
  },
  {
    name: 'a q2-day vomiting course, still going, meals daily',
    nowIso: NOW,
    rows: { pet: dog, ...EMPTY, symptoms: courseQ2('vomit', 1, 55), meals: mealsDaily(0, 55) },
    prior: null,
    expectedTypes: ['symptom_chronicity'],
    expect: { isBuilding: false },
  },
  {
    name: 'the stopped course, the previous card was chronicity: a stand-down',
    nowIso: NOW,
    rows: { pet: dog, ...stoppedCourse() },
    prior: priorChronicityRow([]),
    expectedTypes: ['stood_down'],
  },
  {
    name: 'the stopped course, the previous row pre-dates the stamps (engine_flags NULL)',
    nowIso: NOW,
    rows: { pet: dog, ...stoppedCourse() },
    prior: priorChronicityRow(null),
    expectedTypes: ['stood_down'],
  },
  {
    name: 'the stopped course, the previous row ran under another key (the Signal reads none yet)',
    nowIso: NOW,
    rows: { pet: dog, ...stoppedCourse() },
    prior: priorChronicityRow(['engines_v3_en0']),
    expectedTypes: ['stood_down'],
  },
  {
    name: 'the stopped course, the previous row could not be read',
    nowIso: NOW,
    rows: { pet: dog, ...stoppedCourse() },
    prior: null,
    expectedTypes: [],
  },
  {
    name: 'the stopped course, the previous row is malformed',
    nowIso: NOW,
    rows: { pet: dog, ...stoppedCourse() },
    prior: { findings: 'not an array', generatedAt: 'not a date', engineFlags: 7 },
    expectedTypes: [],
  },
  {
    name: 'a photographed vomit showing fresh blood, yesterday',
    nowIso: NOW,
    rows: {
      pet: dog,
      ...EMPTY,
      symptoms: [{ ...symptom('vomit', 1), id: 'vomit-blood' }],
      meals: mealsDaily(0, 10),
      incidentAnalyses: [
        {
          event_id: 'vomit-blood',
          incident_type: 'vomit',
          status: 'completed',
          blood_present: 'fresh_red',
          stool_blood_present: null,
          foreign_material_present: 'no',
          contents: ['food'],
          bile_present: 'no',
          events: { occurred_at: ago(1, 11, '+00:00') },
        },
      ],
    },
    prior: null,
    expectedTypes: ['incident_red_flag'],
  },
  {
    name: 'a cat that ate everything for two weeks and refused both meals yesterday',
    nowIso: NOW,
    rows: {
      pet: cat,
      ...EMPTY,
      meals: [...mealsDaily(2, 16, 'all'), meal(1, 'refused', KIBBLE, 8), meal(1, 'refused', KIBBLE, 18)],
    },
    prior: null,
    expectedTypes: ['intake_decline'],
  },
  {
    name: 'a diet trial in its third week, nothing else of note',
    nowIso: NOW,
    rows: {
      pet: dog,
      ...EMPTY,
      meals: mealsDaily(0, 20),
      activeTrials: [{ started_at: ago(20, 0).slice(0, 10), target_duration_days: 56 }],
    },
    prior: null,
    expectedTypes: [],
    expect: { dietTrialActive: true },
  },
  {
    name: 'a diet trial whose target ran out months ago (status still active)',
    nowIso: NOW,
    rows: {
      pet: dog,
      ...EMPTY,
      meals: mealsDaily(0, 20),
      activeTrials: [{ started_at: ago(150, 0).slice(0, 10), target_duration_days: 56 }],
    },
    prior: null,
    expectedTypes: [],
    expect: { dietTrialActive: false },
  },
  {
    name: 'a pill in a treat: the treat is the drug vehicle; a refused dose is not on board',
    nowIso: NOW,
    rows: {
      pet: dog,
      ...EMPTY,
      meals: [...mealsDaily(0, 10), meal(2, 'all', TREAT, 9, vehicleMealId)],
      regimens: [
        { id: 'reg-1', drug_name: 'Metronidazole', medication_item_id: 'med-1', started_at: ago(5, 0).slice(0, 10), ended_at: null },
      ],
      doseEvents: [
        {
          occurred_at: ago(2, 9),
          medication_administrations: {
            medication_id: 'reg-1',
            medication_item_id: 'med-1',
            medication_items: { generic_name: 'metronidazole', brand_name: null },
            adherence: 'given',
            paired_event_id: vehicleMealId,
          },
        },
        {
          occurred_at: ago(1, 9),
          medication_administrations: {
            medication_id: 'reg-1',
            medication_item_id: 'med-1',
            medication_items: { generic_name: 'metronidazole', brand_name: null },
            adherence: 'refused',
            paired_event_id: null,
          },
        },
      ],
    },
    prior: null,
    expectedTypes: [],
    // The regimen span plus the given dose; the refused dose is dropped.
    expect: { vehicleMealIds: [vehicleMealId], medicationWindowCount: 2 },
  },
]

// A populated care record, for the guard that nothing reads it yet.
export const POPULATED_CARE_RECORD: CareRecord = {
  ownerAnswers: [{ findingKey: 'symptom_chronicity:vomit', answeredAt: ago(3) }],
  appointments: [
    { id: 'appt-1', scheduledAt: ago(-4, 15), cancelledAt: null, vetVisitId: null },
    { id: 'appt-2', scheduledAt: ago(20, 10), cancelledAt: null, vetVisitId: 'visit-1' },
  ],
}
export const EMPTY_CARE_RECORD: CareRecord = { ownerAnswers: [], appointments: [] }
