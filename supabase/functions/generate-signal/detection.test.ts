// Unit tests for the AI Signal deterministic detection engine (B-045, Step 1).
//
// Run with:  deno test supabase/functions/generate-signal/detection.test.ts
//
// Uses Deno's built-in test runner + node:assert (bundled — no remote imports),
// so the suite runs in a network-restricted CI/dev container. Covers the
// clinically and statistically load-bearing logic: the correlation Early/
// Established tiering with the §7 sample floors + multiple-comparison correction,
// Fisher's exact test, the intake-decline safety triggers, the never-reassure /
// silent-on-thin-coverage invariants (§9), and §5 ranking (safety always leads).

import { strict as assert } from 'node:assert'
import {
  detectCorrelations,
  detectIntakeDecline,
  detectSignals,
  rankFindings,
  fisherExactRightTail,
  intakeScore,
  DEFAULT_CONFIG,
  type CorrelationFinding,
  type IntakeDeclineFinding,
  type DetectionInput,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
  type IntakeRating,
  type PetContext,
  type Finding,
} from './detection.ts'

// ── Fixture helpers ───────────────────────────────────────────────────────────

let idSeq = 0
const nextId = () => `id-${++idSeq}`

/** ISO-8601 UTC for a day/hour in May 2026. */
const at = (day: number, hour = 8, min = 0): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`

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

const symptom = (type: SymptomType, occurredAt: string): SymptomEvent => ({
  id: nextId(),
  type,
  occurredAt,
})

const proteinMeal = (day: number, protein: string): MealEvent =>
  meal({ occurredAt: at(day, 8), primaryProtein: protein })

const ratedMeal = (
  day: number,
  rating: IntakeRating,
  over: Partial<MealEvent> = {},
): MealEvent => meal({ occurredAt: at(day, 8), intakeRating: rating, foodType: 'meal', ...over })

const dog: PetContext = { name: 'Mochi', species: 'dog', dietTrialActive: false }
const cat: PetContext = { name: 'Pixel', species: 'cat', dietTrialActive: false }

const input = (over: Partial<DetectionInput>): DetectionInput => ({
  pet: dog,
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  ...over,
})

// ── fisherExactRightTail ────────────────────────────────────────────────────

Deno.test('fisherExactRightTail — strong enrichment yields a small p', () => {
  // [[5,1],[0,6]] — symptom follows the exposed protein 5/6 times, never otherwise.
  const p = fisherExactRightTail(5, 1, 0, 6)
  assert.ok(p > 0, 'p must be positive')
  assert.ok(p < 0.01, `expected p < 0.01, got ${p}`)
  assert.ok(Math.abs(p - 6 / 792) < 1e-9, `expected ~0.00758, got ${p}`)
})

Deno.test('fisherExactRightTail — no association yields a large p', () => {
  const p = fisherExactRightTail(2, 2, 2, 2)
  assert.ok(p > 0.5, `expected p > 0.5, got ${p}`)
  assert.ok(Math.abs(p - 53 / 70) < 1e-9, `expected ~0.757, got ${p}`)
})

Deno.test('fisherExactRightTail — degenerate table carries no evidence (p=1)', () => {
  assert.equal(fisherExactRightTail(3, 0, 0, 0), 1)
  assert.equal(fisherExactRightTail(0, 0, 3, 3), 1)
})

// ── intakeScore ──────────────────────────────────────────────────────────────

Deno.test('intakeScore — maps the WSAVA ordinal scale 0..4', () => {
  assert.equal(intakeScore('refused'), 0)
  assert.equal(intakeScore('picked'), 1)
  assert.equal(intakeScore('some'), 2)
  assert.equal(intakeScore('most'), 3)
  assert.equal(intakeScore('all'), 4)
})

// ── Detector ①: correlation — Early tier ────────────────────────────────────

Deno.test('detectCorrelations — Early tier fires at the §7 floor (≥3 events, ≥3 both arms)', () => {
  const mealEvents = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(23, 'chicken'), // not followed
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
    proteinMeal(28, 'salmon'),
  ]
  const symptomEvents = [
    symptom('itch', at(20, 11)),
    symptom('itch', at(21, 11)),
    symptom('itch', at(22, 12)),
  ]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1, 'only the chicken→itch association should surface')
  const f = findings[0]
  assert.equal(f.protein, 'chicken')
  assert.equal(f.symptomType, 'itch')
  assert.equal(f.tier, 'early')
  assert.equal(f.exposedWithSymptom, 3)
  assert.equal(f.exposedTotal, 4)
  assert.equal(f.unexposedWithSymptom, 0)
  assert.equal(f.unexposedTotal, 4)
  assert.equal(f.symptomEventCount, 3)
  assert.ok(f.riskDifference > 0.7)
  assert.equal(f.associationalOnly, true)
})

// ── Detector ①: correlation — Established tier ──────────────────────────────

Deno.test('detectCorrelations — Established tier clears ≥5+5 + corrected significance', () => {
  const mealEvents = [
    proteinMeal(18, 'chicken'),
    proteinMeal(19, 'chicken'),
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(23, 'chicken'), // not followed
    proteinMeal(24, 'salmon'),
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
    proteinMeal(28, 'salmon'),
    proteinMeal(29, 'salmon'),
  ]
  const symptomEvents = [
    symptom('itch', at(18, 11)),
    symptom('itch', at(19, 11)),
    symptom('itch', at(20, 11)),
    symptom('itch', at(21, 11)),
    symptom('itch', at(22, 11)),
  ]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.protein, 'chicken')
  assert.equal(f.tier, 'established')
  assert.equal(f.exposedWithSymptom, 5)
  assert.equal(f.exposedTotal, 6)
  assert.equal(f.unexposedTotal, 6)
  assert.equal(f.symptomEventCount, 5)
  // Family of looked-at pairs = {chicken×itch, salmon×itch} → Bonferroni alpha 0.025.
  assert.ok(Math.abs(f.correctedAlpha - 0.025) < 1e-9, `got ${f.correctedAlpha}`)
  assert.ok(f.pValue <= f.correctedAlpha, `p ${f.pValue} must clear corrected alpha`)
})

// ── Detector ①: below-floor and negative cases → empty (building) ────────────

Deno.test('detectCorrelations — below the symptom-event floor → empty', () => {
  const mealEvents = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
  ]
  // Only 2 itch events — under the ≥3 Early floor.
  const symptomEvents = [symptom('itch', at(20, 11)), symptom('itch', at(21, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — single protein (no comparison arm) → empty', () => {
  const mealEvents = [proteinMeal(20, 'chicken'), proteinMeal(21, 'chicken'), proteinMeal(22, 'chicken')]
  const symptomEvents = [
    symptom('itch', at(20, 11)),
    symptom('itch', at(21, 11)),
    symptom('itch', at(22, 11)),
  ]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — equal rates across arms (no enrichment) → empty', () => {
  const mealEvents = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(23, 'chicken'),
    proteinMeal(24, 'salmon'),
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
  ]
  // 2 itches follow chicken, 2 follow salmon → risk difference 0.
  const symptomEvents = [
    symptom('itch', at(20, 11)),
    symptom('itch', at(21, 11)),
    symptom('itch', at(24, 11)),
    symptom('itch', at(25, 11)),
  ]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — single coincident exposure (a<2 guard) → empty', () => {
  const mealEvents = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
  ]
  // 3 itch events but only ONE within 8h of a chicken meal; the other two are
  // far from any meal. Risk difference clears the bar, but a=1 must not print.
  const symptomEvents = [
    symptom('itch', at(20, 11)), // follows chicken
    symptom('itch', at(28, 11)), // no meal nearby
    symptom('itch', at(29, 11)), // no meal nearby
  ]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

// ── Detector ②: intake-decline triggers ─────────────────────────────────────

Deno.test('detectIntakeDecline — consecutive low days below baseline fire the flag', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'most'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(29, 'picked'), // recent day 1
    ratedMeal(30, 'refused'), // recent day 0
  ]
  const findings = detectIntakeDecline(input({ pet: cat, mealEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.trigger, 'consecutive_low')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.species, 'cat')
  assert.equal(f.daysBelowBaseline, 2)
  assert.ok(f.baselineScore > f.recentScore)
  assert.equal(f.refusedFoodLabel, null)
})

Deno.test('detectIntakeDecline — refusal of a normally-eaten food fires even when daily means look ok', () => {
  const mealEvents = [
    // F1: eaten well historically, then refused on the most recent day.
    ratedMeal(18, 'all', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    ratedMeal(20, 'all', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    ratedMeal(22, 'most', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    ratedMeal(30, 'refused', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    // F2: keeps recent daily means up so the consecutive-low trigger stays quiet.
    ratedMeal(29, 'all', { foodItemId: 'F2', foodLabel: 'the chicken can' }),
    ratedMeal(30, 'all', { foodItemId: 'F2', foodLabel: 'the chicken can' }),
  ]
  const findings = detectIntakeDecline(input({ pet: cat, mealEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.trigger, 'refused_normal_food')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.refusedFoodLabel, 'the turkey pâté')
  assert.equal(f.recentScore, 0)
  assert.ok(f.baselineScore >= 3)
})

// ── Detector ②: the never-reassure / silent invariants (§9) ──────────────────

Deno.test('detectIntakeDecline — healthy intake produces NO finding (never reassures)', () => {
  const mealEvents = [
    ratedMeal(20, 'all'),
    ratedMeal(22, 'all'),
    ratedMeal(24, 'most'),
    ratedMeal(26, 'all'),
    ratedMeal(29, 'all'),
    ratedMeal(30, 'most'),
  ]
  // No finding at all — the engine has no "intake is fine" output by design.
  assert.deepEqual(detectIntakeDecline(input({ pet: cat, mealEvents })), [])
})

Deno.test('detectIntakeDecline — thin coverage stays SILENT, not a false flag', () => {
  // A steep drop, but only 3 rated meals — below the coverage floor. Silence is
  // not an all-clear; the composition layer renders the building state.
  const mealEvents = [ratedMeal(28, 'all'), ratedMeal(29, 'all'), ratedMeal(30, 'refused')]
  assert.deepEqual(detectIntakeDecline(input({ pet: cat, mealEvents })), [])
})

Deno.test('detectIntakeDecline — a logging gap is not read as a decline', () => {
  // Pet ate well historically, then nothing logged in the recent window. Absence
  // of data must never be treated as anorexia.
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'most'),
    ratedMeal(24, 'all'),
  ]
  assert.deepEqual(detectIntakeDecline(input({ pet: cat, mealEvents })), [])
})

Deno.test('detectIntakeDecline — treats are excluded from the intake baseline', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'most'),
    ratedMeal(24, 'all'),
    // A refused TREAT on the recent day must not trip the flag — treats don't count.
    ratedMeal(30, 'refused', { foodType: 'treat', foodItemId: 'T1', foodLabel: 'a dental chew' }),
  ]
  assert.deepEqual(detectIntakeDecline(input({ pet: cat, mealEvents })), [])
})

// ── Composition & ranking (§5) ───────────────────────────────────────────────

Deno.test('rankFindings — safety always leads, then Established before Early', () => {
  const early: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: 'itch',
    protein: 'chicken',
    exposedWithSymptom: 3,
    exposedTotal: 4,
    unexposedWithSymptom: 0,
    unexposedTotal: 4,
    exposedRate: 0.75,
    unexposedRate: 0,
    riskDifference: 0.75,
    pValue: 0.07,
    correctedAlpha: 0.025,
    symptomEventCount: 3,
    correlationWindowHours: 8,
    associationalOnly: true,
  }
  const established: CorrelationFinding = { ...early, tier: 'established', protein: 'beef', pValue: 0.007 }
  const safety: IntakeDeclineFinding = {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3.8,
    recentScore: 0.5,
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 5,
  }
  const findings: Finding[] = [early, established, safety]
  const ranked = rankFindings(findings, cat)
  assert.equal(ranked[0].finding.type, 'intake_decline')
  assert.equal((ranked[1].finding as CorrelationFinding).tier, 'established')
  assert.equal((ranked[2].finding as CorrelationFinding).tier, 'early')
  assert.deepEqual(ranked.map((r) => r.rank), [0, 1, 2])
})

Deno.test('detectSignals — end to end: empty input → empty (building)', () => {
  assert.deepEqual(detectSignals(input({})), [])
})

Deno.test('detectSignals — end to end: safety flag outranks a correlation finding', () => {
  const correlationMeals = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'chicken'),
    proteinMeal(22, 'chicken'),
    proteinMeal(23, 'chicken'),
    proteinMeal(25, 'salmon'),
    proteinMeal(26, 'salmon'),
    proteinMeal(27, 'salmon'),
    proteinMeal(28, 'salmon'),
  ]
  const intakeMeals = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'most'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(29, 'picked'),
    ratedMeal(30, 'refused'),
  ]
  const symptomEvents = [
    symptom('itch', at(20, 11)),
    symptom('itch', at(21, 11)),
    symptom('itch', at(22, 12)),
  ]
  const ranked = detectSignals(
    input({ pet: { name: 'Pixel', species: 'cat', dietTrialActive: true }, mealEvents: [...correlationMeals, ...intakeMeals], symptomEvents }),
  )
  assert.ok(ranked.length >= 2, 'expected both a safety and a correlation finding')
  assert.equal(ranked[0].finding.type, 'intake_decline', 'safety must lead (§5)')
  assert.ok(
    ranked.some((r) => r.finding.type === 'food_symptom_correlation'),
    'the chicken→itch correlation should also be present',
  )
})

Deno.test('DEFAULT_CONFIG — encodes the §7 v1 thresholds', () => {
  assert.equal(DEFAULT_CONFIG.correlationWindowHours, 8)
  assert.equal(DEFAULT_CONFIG.correlation.earlyMinSymptomEvents, 3)
  assert.equal(DEFAULT_CONFIG.correlation.earlyMinExposuresPerArm, 3)
  assert.equal(DEFAULT_CONFIG.correlation.establishedMinSymptomEvents, 5)
  assert.equal(DEFAULT_CONFIG.correlation.establishedMinExposuresPerArm, 5)
  assert.equal(DEFAULT_CONFIG.intakeDecline.consecutiveDaysBelowBaseline, 2)
})
