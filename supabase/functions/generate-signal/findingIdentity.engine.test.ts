// CUL-1213 — every finding the engine serves on one run has its own identity.
//
// `lib/findingIdentity.ts` is the key the phone folds, routes and opens the Signal screen on,
// and the key generate-signal writes into `signal_shown_log`. Two findings sharing it fold as
// one card, open each other's screen and merge in the log. The engine is the only thing that
// knows which findings can coexist (the correlation lane runs once per symptom and nothing
// merges across symptoms; the intake lane emits one finding per trigger), so this drives the
// REAL `detectSignals` over records that make those findings coexist, rather than asserting
// over hand-built findings the engine might never emit together (C-35).
import { strict as assert } from 'node:assert'
import { detectSignals, type DetectionInput, type MealEvent, type SymptomEvent, type SymptomType } from './detection.ts'
import { runSignalPipeline, templatePayload } from './pipeline.ts'
import { ENGINE_KEYS, type EngineFlags } from '../_shared/engineFlags.ts'
import { SIGNAL_PIPELINE_CORPUS } from '../_shared/engineCorpus/signalPipeline.corpus.ts'
import { findingIdentity } from '../../../lib/findingIdentity.ts'

let idSeq = 0
const nextId = () => `cul1213-${++idSeq}`
const at = (day: number, hour = 8): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
const NOW = at(30, 12)

const meal = (over: Partial<MealEvent>): MealEvent => ({
  id: nextId(),
  occurredAt: at(20, 8),
  foodItemId: null,
  primaryProtein: null,
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
  ...over,
})
const proteinMeal = (day: number, protein: string, hour: number): MealEvent =>
  meal({ occurredAt: at(day, hour), primaryProtein: protein })
const symptom = (type: SymptomType, occurredAt: string): SymptomEvent => ({ id: nextId(), type, occurredAt })

/** Every identity that more than one served finding claims. */
function sharedIdentities(input: DetectionInput): string[] {
  const seen = new Map<string, number>()
  for (const { finding } of detectSignals(input)) {
    const key = findingIdentity(finding)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k)
}

// Chicken on three days, a salmon staple every day (it washes out and keeps the control days
// eligible). Vomiting 4h after each chicken meal (inside the 12h GI window) and itching ~52h
// after (inside the 72h derm window): one protein, two symptoms, two correlation findings.
function chickenTwoSymptoms(): DetectionInput {
  const mealEvents: MealEvent[] = []
  for (let d = 1; d <= 28; d++) mealEvents.push(proteinMeal(d, 'salmon', 6))
  const chickenDays = [1, 8, 15, 22]
  for (const d of chickenDays) mealEvents.push(proteinMeal(d, 'chicken', 8))
  const symptomEvents: SymptomEvent[] = [
    ...chickenDays.map((d) => symptom('vomit', at(d, 12))),
    ...chickenDays.map((d) => symptom('itch', at(d + 2, 12))),
  ]
  return { pet: { name: 'Mochi', species: 'dog', dietTrialActive: false }, symptomEvents, mealEvents, now: NOW }
}

// A cat that ate its usual food well for ten days and refused it this morning: the one-day
// feline path fires a consecutive-low decline AND the refusal fires its own, in one run.
function catRefusesUsualFood(): DetectionInput {
  const usual = { foodItemId: 'F1', foodLabel: 'the turkey pâté' }
  const mealEvents: MealEvent[] = []
  for (let d = 18; d <= 28; d++) mealEvents.push(meal({ occurredAt: at(d, 8), intakeRating: 'all', ...usual }))
  mealEvents.push(meal({ occurredAt: at(30, 8), intakeRating: 'refused', ...usual }))
  return { pet: { name: 'Pixel', species: 'cat', dietTrialActive: false }, symptomEvents: [], mealEvents, now: NOW }
}

Deno.test('CUL-1213 — the fixtures produce the coexisting findings the identity has to tell apart', () => {
  // Non-vacuity: without both findings in one run the uniqueness tests below prove nothing.
  const correlations = detectSignals(chickenTwoSymptoms())
    .map((r) => r.finding)
    .filter((f) => f.type === 'food_symptom_correlation')
  const symptoms = correlations.map((f) => (f as { symptomType: string }).symptomType).sort()
  assert.deepEqual(symptoms, ['itch', 'vomit'], 'chicken→itch and chicken→vomit both fire')

  const declines = detectSignals(catRefusesUsualFood())
    .map((r) => r.finding)
    .filter((f) => f.type === 'intake_decline')
  const triggers = declines.map((f) => (f as { trigger: string }).trigger).sort()
  assert.deepEqual(triggers, ['consecutive_low', 'refused_normal_food'], 'both intake triggers fire')
})

Deno.test('CUL-1213 — two correlations on one protein, different symptoms, have different identities', () => {
  assert.deepEqual(sharedIdentities(chickenTwoSymptoms()), [])
})

Deno.test('CUL-1213 — a consecutive-low decline and a refusal on one run have different identities', () => {
  assert.deepEqual(sharedIdentities(catRefusesUsualFood()), [])
})

Deno.test('CUL-1213 — every identity still names its own type (migration 075 signal_shown_log_key_names_its_type)', () => {
  for (const input of [chickenTwoSymptoms(), catRefusesUsualFood()]) {
    for (const { finding } of detectSignals(input)) {
      const key = findingIdentity(finding)
      assert.ok(key === finding.type || key.startsWith(`${finding.type}:`), key)
    }
  }
})

// The wider sweep: every hand-built case in the Signal pipeline corpus, through the whole
// pipeline (mapping, detection, composition, stand-down, the cache row), every Engines v3 key
// off and every key on. A served row whose identity another row claims is the defect, whatever
// lane it comes from.
Deno.test('CUL-1213 — no cache row in the Signal pipeline corpus shares an identity, flags off or on', () => {
  const states: Record<string, EngineFlags> = {
    'every key off': { on: [], readOk: true },
    'every key on': { on: [...ENGINE_KEYS], readOk: true },
  }
  let rows = 0
  for (const [state, engineFlags] of Object.entries(states)) {
    for (const c of SIGNAL_PIPELINE_CORPUS) {
      const result = runSignalPipeline({
        rows: c.rows,
        incompletePulls: [],
        prior: c.prior,
        nowMs: Date.parse(c.nowIso),
        engineFlags,
        careRecord: { ownerAnswers: [], appointments: [] },
        careContextFacts: null,
      })
      const keys = templatePayload(result).findings.map((e) => findingIdentity(e.finding))
      rows += keys.length
      assert.equal(new Set(keys).size, keys.length, `${state} · ${c.name}: ${keys.join(', ')}`)
    }
  }
  // Non-vacuity: a corpus that served nothing would pass the uniqueness check trivially.
  assert.ok(rows >= SIGNAL_PIPELINE_CORPUS.length, `only ${rows} rows served`)
})

// The carry over an incomplete read (CUL-989) keys a prior safety card on its identity too. When
// it keyed `intake_decline:` for both triggers, a prior Signal holding a refusal AND a
// consecutive-low decline, followed by an incomplete read that reproduced only the refusal,
// treated the decline as shown and dropped it: an eating-less card lost in the reassuring
// direction (adversarial review, this PR). Red on the hand-rolled key.
Deno.test('CUL-1213 — an incomplete read carries the prior decline beside the refusal it reproduced', () => {
  const c = SIGNAL_PIPELINE_CORPUS.find((x) => x.name.startsWith('a cat that ate everything'))
  assert.ok(c, 'the corpus holds the refusing-cat case')
  const run = (incompletePulls: string[], prior: Parameters<typeof runSignalPipeline>[0]['prior']) =>
    runSignalPipeline({
      rows: c.rows,
      incompletePulls,
      prior,
      nowMs: Date.parse(c.nowIso),
      engineFlags: { on: [], readOk: true },
      careRecord: { ownerAnswers: [], appointments: [] },
      careContextFacts: null,
    })
  const complete = templatePayload(run([], null))
  const refused = complete.findings.find((e) => e.finding.type === 'intake_decline')
  assert.ok(refused && (refused.finding as { trigger: string }).trigger === 'refused_normal_food', 'the case serves the refusal')
  const decline = { ...refused.finding, trigger: 'consecutive_low', daysBelowBaseline: 1, refusedFoodLabel: null }
  const prior = {
    findings: [{ rank: 0, text: 'x', finding: refused.finding }, { rank: 1, text: 'y', finding: decline }],
    generatedAt: new Date(Date.parse(c.nowIso) - 3_600_000).toISOString(),
    engineFlags: [],
  } as unknown as Parameters<typeof runSignalPipeline>[0]['prior']
  const keys = templatePayload(run(['events'], prior)).findings.map((e) => findingIdentity(e.finding))
  assert.ok(keys.includes('intake_decline:consecutive_low'), keys.join(', '))
  assert.ok(keys.includes('intake_decline:refused_normal_food'), keys.join(', '))
})
