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
  detectReflections,
  detectSignals,
  rankFindings,
  fisherExactRightTail,
  mcNemarExactRightTail,
  intakeScore,
  DEFAULT_CONFIG,
  type CorrelationFinding,
  type IntakeDeclineFinding,
  type ReflectionFinding,
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

/** Protein meal at a specific hour, with optional attribution confidence (B-050). */
const pMeal = (
  day: number,
  protein: string,
  hour: number,
  attribution?: 'high' | 'low',
): MealEvent =>
  meal({
    occurredAt: at(day, hour),
    primaryProtein: protein,
    ...(attribution ? { attributionConfidence: attribution } : {}),
  })

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

// ── mcNemarExactRightTail (matched test for the case-crossover) ───────────────

Deno.test('mcNemarExactRightTail — all discordant pairs favour the case → 0.5^n', () => {
  assert.ok(Math.abs(mcNemarExactRightTail(3, 0) - 0.125) < 1e-9, 'b=3,c=0 → 0.5^3')
  assert.ok(Math.abs(mcNemarExactRightTail(6, 0) - 1 / 64) < 1e-9, 'b=6,c=0 → 0.5^6 = 0.015625')
})

Deno.test('mcNemarExactRightTail — no discordant pairs carries no evidence (p=1)', () => {
  assert.equal(mcNemarExactRightTail(0, 0), 1)
})

Deno.test('mcNemarExactRightTail — balanced discordants are not significant', () => {
  // b=c → exactly at the null; one-sided p should be well above any alpha.
  assert.ok(mcNemarExactRightTail(2, 2) > 0.5, `expected > 0.5, got ${mcNemarExactRightTail(2, 2)}`)
})

// ── intakeScore ──────────────────────────────────────────────────────────────

Deno.test('intakeScore — maps the WSAVA ordinal scale 0..4', () => {
  assert.equal(intakeScore('refused'), 0)
  assert.equal(intakeScore('picked'), 1)
  assert.equal(intakeScore('some'), 2)
  assert.equal(intakeScore('most'), 3)
  assert.equal(intakeScore('all'), 4)
})

// ── Detector ①: correlation — case-crossover (B-050) ─────────────────────────

// Helper: a daily staple meal of `protein` at `hour` across an inclusive day range.
const staple = (from: number, to: number, protein: string, hour: number): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = from; d <= to; d++) out.push(pMeal(d, protein, hour))
  return out
}

Deno.test('detectCorrelations — Early tier fires; a daily staple correctly washes out', () => {
  const mealEvents = [
    ...staple(1, 10, 'chicken', 9), // staple — present before sick AND well days
    pMeal(2, 'beef', 10), // sporadic treat, only on symptom days
    pMeal(4, 'beef', 10),
    pMeal(6, 'beef', 10),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1, 'chicken must wash out (in case AND control windows); only beef surfaces')
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.tier, 'early')
  assert.equal(f.matchedPairs, 3)
  assert.equal(f.caseExposed, 3)
  assert.equal(f.controlExposed, 0)
  assert.equal(f.discordantCaseOnly, 3)
  assert.equal(f.attributionFloor, 'high')
  assert.ok(f.riskDifference > 0.9)
  assert.equal(f.associationalOnly, true)
})

Deno.test('detectCorrelations — Established tier clears ≥5 pairs + corrected McNemar significance', () => {
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.tier, 'established')
  assert.equal(f.matchedPairs, 6)
  assert.equal(f.discordantCaseOnly, 6)
  // Family = {chicken×vomit, beef×vomit} → Bonferroni alpha 0.025; McNemar p = 0.5^6 ≈ 0.0156.
  assert.ok(Math.abs(f.correctedAlpha - 0.025) < 1e-9, `got ${f.correctedAlpha}`)
  assert.ok(f.pValue <= f.correctedAlpha, `p ${f.pValue} must clear corrected alpha`)
})

Deno.test('detectCorrelations — a low-attribution (shared-bowl) exposure CAPS the finding at Early', () => {
  // Identical to the Established case, but beef comes from a shared free-fed bowl.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10, 'low')),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.matchedPairs, 6, 'same sample size that reached Established with clean attribution')
  assert.equal(f.attributionFloor, 'low')
  assert.equal(f.tier, 'early', 'a shared bowl can never reach Established — we are not sure this pet ate it')
})

Deno.test('detectCorrelations — multi-implication: a symptom implicates EVERY in-window protein', () => {
  // The 9am-wet + 10am-treat + 11am-symptom case the PM raised: both must be implicated,
  // not just the nearest meal (the rejected winner-take-all). Controls eat only salmon.
  const mealEvents = [
    pMeal(2, 'chicken', 9), pMeal(2, 'beef', 10),
    pMeal(4, 'chicken', 9), pMeal(4, 'beef', 10),
    pMeal(6, 'chicken', 9), pMeal(6, 'beef', 10),
    pMeal(1, 'salmon', 9), pMeal(3, 'salmon', 9), pMeal(5, 'salmon', 9), pMeal(7, 'salmon', 9),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 2, 'both chicken and beef are implicated')
  const proteins = findings.map((f) => f.protein).sort()
  assert.deepEqual(proteins, ['beef', 'chicken'])
  assert.ok(findings.every((f) => f.tier === 'early'))
})

// ── Detector ①: B-052 protein-key canonicalization (read-time) ───────────────

Deno.test('detectCorrelations — B-052: by-product/casing variants pool into one protein', () => {
  // The same sporadic protein logged under three fragmented labels across the
  // symptom days. Pre-B-052 each keyed as a DISTINCT protein (appearing once →
  // below the ≥2 discordant-case floor → NO finding). Canonicalized, they pool
  // into one 'beef' key that clears the Early floor — the exact fracture B-052
  // exists to fix (chicken staple still washes out as before).
  const mealEvents = [
    ...staple(1, 10, 'chicken', 9),
    pMeal(2, 'Beef', 10),
    pMeal(4, 'Beef By-Product Meal', 10),
    pMeal(6, 'beef by-product', 10),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1, 'the fragmented beef labels must pool into one finding')
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.matchedPairs, 3)
  assert.equal(f.caseExposed, 3, 'all three case windows count toward one canonical key')
  assert.equal(f.discordantCaseOnly, 3)
})

Deno.test('detectCorrelations — B-052: the "null" string is not a protein (no false contrast)', () => {
  // A pet fed only chicken, but some rows carry the literal "null" string. Pre-B-052
  // that string counted as a second protein — manufacturing the contrast the
  // proteins.length >= 2 guard needs AND surfacing a junk "meals containing null"
  // finding. Canonicalized to null it is excluded, so the genuinely single-protein
  // diet correctly yields nothing.
  const mealEvents = [
    ...staple(1, 10, 'chicken', 9),
    pMeal(2, 'null', 10),
    pMeal(4, 'null', 10),
    pMeal(6, 'null', 10),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

// ── Detector ①: below-floor and negative cases → empty (building) ────────────

Deno.test('detectCorrelations — below the episode floor → empty', () => {
  const mealEvents = [
    ...staple(1, 6, 'chicken', 9),
    pMeal(2, 'beef', 10),
    pMeal(4, 'beef', 10),
  ]
  // Only 2 vomit episodes — under the ≥3 floor.
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — single protein (no contrast) → empty', () => {
  const mealEvents = staple(1, 6, 'chicken', 9)
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — two constant staples (no variable) → empty', () => {
  // Both proteins are present before sick AND well days → both concordant → no signal.
  const mealEvents = [...staple(1, 8, 'chicken', 9), ...staple(1, 8, 'beef', 10)]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

Deno.test('detectCorrelations — no logged control days → empty (never fabricate "absent")', () => {
  // Beef + chicken only ever logged on the symptom days; nothing logged on any other day.
  // The logging-eligibility guard means there is no valid control window, so we refuse to
  // score the un-logged days as "beef absent" and invent an association (Biostatistician).
  const mealEvents = [
    pMeal(2, 'chicken', 9), pMeal(2, 'beef', 10),
    pMeal(4, 'chicken', 9), pMeal(4, 'beef', 10),
    pMeal(6, 'chicken', 9), pMeal(6, 'beef', 10),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  assert.deepEqual(detectCorrelations(input({ mealEvents, symptomEvents })), [])
})

// ── Detector ①: symptom-class-specific window (Dr. Chen) ─────────────────────

Deno.test('detectCorrelations — dermatological symptoms use the longer (72h) window', () => {
  // Chicken ~52h before each itch — far outside a 12h GI window, inside the 72h derm one.
  // Controls sit ≥4 days away (non-overlapping window) and eat only the daily salmon.
  const mealEvents = [
    ...staple(1, 18, 'salmon', 20), // daily staple → washes; keeps control days logging-eligible
    pMeal(1, 'chicken', 8),
    pMeal(8, 'chicken', 8),
    pMeal(15, 'chicken', 8),
  ]
  const symptomEvents = [
    symptom('itch', at(3, 12)), // ~52h after chicken day 1
    symptom('itch', at(10, 12)), // ~52h after chicken day 8
    symptom('itch', at(17, 12)), // ~52h after chicken day 15
  ]
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  const chicken = findings.find((f) => f.protein === 'chicken')
  assert.ok(chicken, 'chicken→itch should surface on the 72h window')
  assert.equal(chicken!.correlationWindowHours, 72)
  assert.equal(chicken!.symptomType, 'itch')
})

// ── Detector ②: intake-decline triggers ─────────────────────────────────────

Deno.test('detectIntakeDecline — consecutive low days below baseline fire the flag (dog, 2-day path)', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'most'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(29, 'picked'), // recent day 1
    ratedMeal(30, 'refused'), // recent day 0
  ]
  // Dog: the 2-consecutive-day path. (Cats fire on a single day — see the feline test below.)
  const findings = detectIntakeDecline(input({ pet: dog, mealEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.trigger, 'consecutive_low')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.species, 'dog')
  assert.equal(f.daysBelowBaseline, 2)
  assert.ok(f.baselineScore > f.recentScore)
  assert.equal(f.refusedFoodLabel, null)
})

// ── Detector ②: feline sensitivity (P0 — Dr. Chen) ───────────────────────────

Deno.test('detectIntakeDecline — a CAT fires on a SINGLE below-baseline day (48hr window)', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'all'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(30, 'refused'), // ONE recent low day, nothing logged day 29
  ]
  const findings = detectIntakeDecline(input({ pet: cat, mealEvents }))
  assert.equal(findings.length, 1, 'a cat should not have to wait for a second low day')
  assert.equal(findings[0].trigger, 'consecutive_low')
  assert.equal(findings[0].daysBelowBaseline, 1)
})

Deno.test('detectIntakeDecline — a DOG does NOT fire on a single low day (needs two)', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'all'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(30, 'refused'), // only one recent low day
  ]
  assert.deepEqual(detectIntakeDecline(input({ pet: dog, mealEvents })), [])
})

Deno.test('detectIntakeDecline — cat single-day path ignores a mild one-notch dip (all→most)', () => {
  const mealEvents = [
    ratedMeal(18, 'all'),
    ratedMeal(20, 'all'),
    ratedMeal(22, 'all'),
    ratedMeal(24, 'all'),
    ratedMeal(26, 'all'),
    ratedMeal(30, 'most'), // below baseline but not genuinely low — must not cry wolf
  ]
  assert.deepEqual(detectIntakeDecline(input({ pet: cat, mealEvents })), [])
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
  // Dog isolates the refusal trigger: the 2-day baseline window has too few prior
  // meals to evaluate the consecutive-low path, so only refused_normal_food can fire.
  const findings = detectIntakeDecline(input({ pet: dog, mealEvents }))
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

// ── Detector ③: symptom-count reflection (B-051) ─────────────────────────────
// Windows are week-over-week relative to NOW = 2026-05-30T12:00 →
//   current = [May 23 12:00, May 30 12:00)   prior = [May 16 12:00, May 23 12:00)

Deno.test('detectReflections — flat trend surfaces one reflection ("same as last week")', () => {
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)), // current: 3
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)), symptom('vomit', at(21, 8)), // prior: 3
  ]
  const findings = detectReflections(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.type, 'reflection')
  assert.equal(f.priorityClass, 'insight')
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.currentCount, 3)
  assert.equal(f.priorCount, 3)
  assert.equal(f.direction, 'flat')
  assert.equal(f.windowDays, 7)
})

Deno.test('detectReflections — a falling count reads as improving (Dr. Chen §7.1: counts falling may reflect)', () => {
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)), // current: 3
    symptom('vomit', at(17, 8)), symptom('vomit', at(18, 8)), symptom('vomit', at(19, 8)),
    symptom('vomit', at(20, 8)), symptom('vomit', at(21, 8)), // prior: 5
  ]
  const findings = detectReflections(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].direction, 'improving')
  assert.equal(findings[0].currentCount, 3)
  assert.equal(findings[0].priorCount, 5)
})

Deno.test('detectReflections — a RISING trend is suppressed (never normalized; yields to safety lane)', () => {
  // current 4 > prior 2. Coverage is satisfied in BOTH windows (meals pad prior),
  // so the ONLY reason for silence is the direction guard — a worsening trend must
  // never be framed as a neutral reflection (Dr. Chen §7.1 amendment #5).
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)),
  ]
  const mealEvents = [meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(20, 8) }), meal({ occurredAt: at(21, 8) })]
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectReflections — a zero-symptom week is NEVER a reflection (absence ≠ wellness, §9)', () => {
  // Current week well-logged (meals) but no vomiting; prior week had 5. This is the
  // exact reassurance-by-absence the layer must not produce ("no vomiting this week").
  const symptomEvents = [
    symptom('vomit', at(17, 8)), symptom('vomit', at(18, 8)), symptom('vomit', at(19, 8)),
    symptom('vomit', at(20, 8)), symptom('vomit', at(21, 8)),
  ]
  const mealEvents = [meal({ occurredAt: at(24, 8) }), meal({ occurredAt: at(26, 8) }), meal({ occurredAt: at(28, 8) })]
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectReflections — below the episode floor (max < 3) stays silent (noise, not a trend)', () => {
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), // current: 2
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)), // prior: 2
  ]
  // Pad coverage so the suppression is attributable to the episode floor, not coverage.
  const mealEvents = [meal({ occurredAt: at(28, 8) }), meal({ occurredAt: at(21, 8) })]
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectReflections — a prior-window acute single day is not read as "same as last week" (meal-padding closed)', () => {
  // The load-bearing adversarial case (B-051 review): current 4 vomits across 4 days;
  // prior 4 vomits ALL on a single acute day (4 bouts >3h apart → 4 episodes, 1
  // calendar day). Episode counts are flat (4 vs 4), but last week was only a single
  // acute day — clinically NOT "the same". The fix tracks symptom-DAYS: current spread
  // across 4 days vs prior 1 day is an INCREASE in symptom-days → worsening → silent.
  // Crucially this holds even when the prior window is meal-PADDED to clear the coarse
  // logging-eligibility floor — the original meal-omitting test passed only by accident.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(17, 12)), symptom('vomit', at(17, 16)), symptom('vomit', at(17, 20)),
  ]
  // 2 meal-only prior days → prior logging-days = 3, clears minLoggingDaysPerWindow.
  const mealEvents = [meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) })]
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectReflections — a falling symptom-DAY spread alone is enough; rising spread suppresses', () => {
  // Same episode count both weeks (3 vs 3) but this week is spread over MORE days than
  // last (3 days vs 1) → an increase in symptom-days → worsening → silent. A reflection
  // only renders when BOTH episodes and spread are flat-or-falling.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)), // current: 3 episodes / 3 days
    symptom('vomit', at(17, 8)), symptom('vomit', at(17, 12)), symptom('vomit', at(17, 16)), // prior: 3 episodes / 1 day
  ]
  const mealEvents = [meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) })]
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectReflections — CROSS-SYMPTOM: a reflection is silent while ANY symptom is worsening', () => {
  // The highest-severity adversarial break (B-051 review): per-symptom the itch is
  // improving (3 vs 5) and would render a calm "itch is down" card — but the vomit is
  // RISING (4 vs 1). A soothing reflection must never surface while the pet is worsening
  // on another axis (Dr. Chen §7.1 amendment #5). The global worsening gate stays silent.
  const symptomEvents = [
    // vomit rising 1 → 4
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)),
    // itch improving 5 → 3
    symptom('itch', at(24, 9)), symptom('itch', at(26, 9)), symptom('itch', at(28, 9)),
    symptom('itch', at(16, 13)), symptom('itch', at(17, 9)), symptom('itch', at(18, 9)),
    symptom('itch', at(19, 9)), symptom('itch', at(20, 9)),
  ]
  assert.deepEqual(detectReflections(input({ symptomEvents })), [])
})

Deno.test('detectReflections — a lone single worsening log does NOT blank a strong improvement', () => {
  // The worsening gate is sensitive but not hair-trigger: one stray new symptom (count 1,
  // below worseningMinEpisodes) must not suppress a genuine, material improvement on
  // another symptom — otherwise noise re-introduces the silence B-051 exists to fix.
  const symptomEvents = [
    // itch improving 6 → 3 (material)
    symptom('itch', at(24, 9)), symptom('itch', at(26, 9)), symptom('itch', at(28, 9)),
    symptom('itch', at(16, 13)), symptom('itch', at(17, 9)), symptom('itch', at(18, 9)),
    symptom('itch', at(19, 9)), symptom('itch', at(20, 9)), symptom('itch', at(21, 9)),
    // a single new vomit this week (count 1 — below the worsening floor of 2)
    symptom('vomit', at(25, 8)),
  ]
  const findings = detectReflections(input({ symptomEvents }))
  assert.equal(findings.length, 1, 'the strong itch improvement still surfaces')
  assert.equal(findings[0].symptomType, 'itch')
  assert.equal(findings[0].direction, 'improving')
})

Deno.test('detectReflections — surfaces ONE reflection (the symptom most present right now)', () => {
  const symptomEvents = [
    // vomit current 4 / prior 5 (improving) — the more present symptom
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(18, 8)), symptom('vomit', at(19, 8)),
    symptom('vomit', at(20, 8)), symptom('vomit', at(21, 8)),
    // diarrhea current 3 / prior 3 (flat) — also qualifies but is less present
    symptom('diarrhea', at(24, 9)), symptom('diarrhea', at(26, 9)), symptom('diarrhea', at(28, 9)),
    symptom('diarrhea', at(17, 9)), symptom('diarrhea', at(19, 9)), symptom('diarrhea', at(21, 9)),
  ]
  const findings = detectReflections(input({ symptomEvents }))
  assert.equal(findings.length, 1, 'one reflection only — never a wall of count cards')
  assert.equal(findings[0].symptomType, 'vomit', 'the symptom with the highest current count wins')
  assert.equal(findings[0].currentCount, 4)
})

// ── Composition & ranking (§5) ───────────────────────────────────────────────

const reflectionFinding = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 4,
  direction: 'flat',
  windowDays: 7,
  ...over,
})

Deno.test('rankFindings — a reflection ranks below safety AND below a correlation', () => {
  const early: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: 'vomit',
    protein: 'beef',
    matchedPairs: 4,
    caseExposed: 3,
    controlExposed: 0,
    discordantCaseOnly: 3,
    discordantControlOnly: 0,
    riskDifference: 0.75,
    pValue: 0.07,
    correctedAlpha: 0.025,
    symptomEventCount: 3,
    correlationWindowHours: 12,
    attributionFloor: 'high',
    associationalOnly: true,
  }
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
  const reflection = reflectionFinding()
  // Deliberately pass the reflection FIRST to prove ordering is by band, not input order.
  const ranked = rankFindings([reflection, early, safety], cat)
  assert.equal(ranked[0].finding.type, 'intake_decline', 'safety leads')
  assert.equal(ranked[1].finding.type, 'food_symptom_correlation', 'correlation before reflection')
  assert.equal(ranked[2].finding.type, 'reflection', 'reflection is the gentlest, lowest layer')
})

Deno.test('rankFindings — safety always leads, then Established before Early', () => {
  const early: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: 'itch',
    protein: 'chicken',
    matchedPairs: 4,
    caseExposed: 3,
    controlExposed: 0,
    discordantCaseOnly: 3,
    discordantControlOnly: 0,
    riskDifference: 0.75,
    pValue: 0.07,
    correctedAlpha: 0.025,
    symptomEventCount: 3,
    correlationWindowHours: 72,
    attributionFloor: 'high',
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
    ...staple(1, 10, 'chicken', 9),
    pMeal(2, 'beef', 10),
    pMeal(4, 'beef', 10),
    pMeal(6, 'beef', 10),
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
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]
  const ranked = detectSignals(
    input({ pet: { name: 'Pixel', species: 'cat', dietTrialActive: true }, mealEvents: [...correlationMeals, ...intakeMeals], symptomEvents }),
  )
  assert.ok(ranked.length >= 2, 'expected both a safety and a correlation finding')
  assert.equal(ranked[0].finding.type, 'intake_decline', 'safety must lead (§5)')
  assert.ok(
    ranked.some((r) => r.finding.type === 'food_symptom_correlation'),
    'the beef→vomit correlation should also be present',
  )
})

Deno.test('detectSignals — B-051: a data-rich pet with no ①/② finding still gets a reflection', () => {
  // The dogfooding case that opened B-051: a single constant staple (chicken every
  // day → ① washes out / no protein contrast) and no rated meals (② silent), yet the
  // owner has logged heavily and the pet vomits. Previously → empty (the misleading
  // "keep logging" building state). Now → one honest reflection, NOT a safety flag.
  const mealEvents = staple(16, 30, 'chicken', 9) // unrated meals → no correlation, no intake baseline
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)), symptom('vomit', at(21, 8)),
  ]
  const ranked = detectSignals(input({ pet: cat, mealEvents, symptomEvents }))
  assert.equal(ranked.length, 1, 'exactly the reflection — ① and ② produced nothing')
  assert.equal(ranked[0].finding.type, 'reflection')
  assert.equal(ranked[0].rank, 0)
})

Deno.test('detectSignals — a reflection never outranks a co-occurring safety flag', () => {
  const mealEvents = [
    // unrated staple keeps ① quiet; the rated decline drives ②
    ...staple(16, 30, 'chicken', 9),
    ratedMeal(18, 'all'), ratedMeal(20, 'all'), ratedMeal(22, 'all'), ratedMeal(24, 'all'),
    ratedMeal(26, 'all'), ratedMeal(29, 'picked'), ratedMeal(30, 'refused'),
  ]
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)), symptom('vomit', at(21, 8)),
  ]
  const ranked = detectSignals(input({ pet: dog, mealEvents, symptomEvents }))
  assert.equal(ranked[0].finding.priorityClass, 'safety', 'safety leads')
  const reflectionRank = ranked.findIndex((r) => r.finding.type === 'reflection')
  assert.ok(reflectionRank > 0, 'a reflection is present but never the lead while a safety finding exists')
})

Deno.test('DEFAULT_CONFIG — encodes the §7 v1 thresholds', () => {
  assert.equal(DEFAULT_CONFIG.correlationWindowHours, 12)
  assert.equal(DEFAULT_CONFIG.correlation.earlyMinMatchedPairs, 3)
  assert.equal(DEFAULT_CONFIG.correlation.earlyMinDiscordantCaseOnly, 2)
  assert.equal(DEFAULT_CONFIG.correlation.establishedMinMatchedPairs, 5)
  assert.equal(DEFAULT_CONFIG.intakeDecline.consecutiveDaysBelowBaseline, 2)
  // Split GI windows (vomit vs diarrhea) + dermatological window + re-log episode gap.
  assert.equal(DEFAULT_CONFIG.correlationWindowHoursByType.vomit, 12)
  assert.equal(DEFAULT_CONFIG.correlationWindowHoursByType.diarrhea, 24)
  assert.equal(DEFAULT_CONFIG.correlationWindowHoursByType.itch, 72)
  assert.equal(DEFAULT_CONFIG.symptomEpisodeGapHours, 3)
  // Feline sensitivity override (P0).
  assert.equal(DEFAULT_CONFIG.intakeDecline.cat.consecutiveDaysBelowBaseline, 1)
  assert.equal(DEFAULT_CONFIG.intakeDecline.cat.singleDayConcernCeiling, 2)
  // B-051 reflection floor (Conservative-but-useful) + worsening gate.
  assert.equal(DEFAULT_CONFIG.reflection.windowDays, 7)
  assert.equal(DEFAULT_CONFIG.reflection.minEpisodesEitherWindow, 3)
  assert.equal(DEFAULT_CONFIG.reflection.minLoggingDaysPerWindow, 3)
  assert.equal(DEFAULT_CONFIG.reflection.worseningMinEpisodes, 2)
})
