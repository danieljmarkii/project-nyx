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
  detectWorsening,
  detectChronicity,
  detectPostprandialTiming,
  detectTimeOfDayClustering,
  detectSignals,
  detectCoverage,
  doseToMedicationWindow,
  rankCoverageDiagnostics,
  rankFindings,
  fisherExactRightTail,
  mcNemarExactRightTail,
  intakeScore,
  computeHumanFoodProvenance,
  HUMAN_FOOD_FORMAT,
  DEFAULT_CONFIG,
  type CorrelationFinding,
  type IntakeDeclineFinding,
  type ReflectionFinding,
  type SymptomWorseningFinding,
  type PostprandialTimingFinding,
  type TimeOfDayClusteringFinding,
  type OccurredAtConfidence,
  type DetectionInput,
  type MealEvent,
  type FeedingArrangement,
  type MedicationWindow,
  type SymptomEvent,
  type SymptomType,
  type IntakeRating,
  type PetContext,
  type Finding,
  type CoverageDiagnostic,
  type RateMealsDiagnostic,
  type StapleWashoutDiagnostic,
  type MealTypeCollapseDiagnostic,
  type HumanFoodProvenance,
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

/** A treat (food_type='treat') carrying a protein — a real exposure for ① and the staple denominator (B-070). */
const proteinTreat = (day: number, protein: string, hour = 8): MealEvent =>
  meal({ occurredAt: at(day, hour), primaryProtein: protein, foodType: 'treat' })

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

/** A free-fed standing fact (B-040). Dates are ISO; null activeUntil = still active. */
const arrangement = (
  protein: string | null,
  activeFrom: string | null,
  activeUntil: string | null,
  attribution?: 'high' | 'low',
): FeedingArrangement => ({
  id: nextId(),
  primaryProtein: protein,
  activeFrom,
  activeUntil,
  ...(attribution ? { attributionConfidence: attribution } : {}),
})

/** A medication regimen exposure span (B-117 PR 9). ISO; null activeUntil = still on board. */
const medRegimen = (
  activeFrom: string | null,
  activeUntil: string | null,
  medicationItemId: string | null = 'drug-1',
): MedicationWindow => ({ medicationItemId, activeFrom, activeUntil })

/** An administered dose as a POINT exposure window (B-117 PR 9). */
const medDose = (occurredAt: string, medicationItemId: string | null = 'drug-1'): MedicationWindow => ({
  medicationItemId,
  activeFrom: occurredAt,
  activeUntil: occurredAt,
})

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

// ── Detector ①: B-040 free-feeding ingestion (standing exposures, PR 4) ──────

Deno.test('detectCorrelations — B-040: a free-fed food does not surface from its OWN sporadic discrete logs (no false correlate)', () => {
  // A pet free-fed chicken 24/7, plus a daily beef staple. Chicken ALSO gets logged
  // as a discrete meal on symptom days only (the owner happens to log it then).
  // WITHOUT the arrangement, that sporadic discrete chicken false-fires (present in
  // case windows, absent from controls). WITH the free-fed fact, chicken is excluded
  // from candidacy (background context, §3) → it cannot surface. Beef is a daily
  // staple → concordant → washes out. Net: no finding (the honest answer).
  const mealEvents = [
    ...staple(1, 7, 'beef', 9), // daily staple → washes out, but gives contrast + eligibility
    pMeal(2, 'chicken', 10), // discrete chicken logged only on symptom days
    pMeal(4, 'chicken', 10),
    pMeal(6, 'chicken', 10),
  ]
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]

  // Sanity: without the free-fed fact, the sporadic discrete chicken DOES false-fire.
  const withoutArr = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(withoutArr.length, 1, 'baseline: sporadic discrete chicken surfaces as an Early correlate')
  assert.equal(withoutArr[0].protein, 'chicken')

  // With the free-fed fact, chicken is always-present → concordant → washes out.
  const withArr = detectCorrelations(
    input({ mealEvents, symptomEvents, feedingArrangements: [arrangement('chicken', at(1, 0), null)] }),
  )
  assert.equal(withArr.length, 0, 'a free-fed food is excluded — never a clean correlate on its own')
})

Deno.test('detectCorrelations — B-040: a free-fed food cannot MANUFACTURE a correlate at its active-window boundary (adversarial review)', () => {
  // The adversarial-review counterexample (PR 4): a new free-fed chicken introduced at
  // a CONTIGUOUS symptom flare. The discrete data alone is ONE chicken log (b=1, below
  // the discordant floor → no finding). With the arrangement, chicken is present on
  // every symptom day inside its span, but the time-of-day-matched controls are forced
  // onto days BEFORE activeFrom (contiguous symptom days leave no in-span control day),
  // where chicken is genuinely absent — which (pre-fix) fabricated case-discordant
  // pairs and surfaced an Early chicken correlate the discrete data cannot support.
  // A free-fed protein is background context, never a clean correlate on its own (§3),
  // so it is excluded entirely; its active-window boundary can no longer manufacture one.
  const mealEvents = [
    ...staple(1, 25, 'beef', 8), // eligibility + contrast; concordant → washes out
    pMeal(12, 'chicken', 9), // the single discrete chicken log, at introduction
  ]
  const symptomEvents = [12, 13, 14, 15].map((d) => symptom('vomit', at(d, 11)))

  // Baseline: without the arrangement, a single discrete chicken log is below the Early
  // discordant floor (b=1 < 2) → no chicken finding.
  const withoutArr = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(
    withoutArr.some((f) => f.protein === 'chicken'),
    false,
    'one discrete chicken log alone is below the discordant floor',
  )

  // With the free-fed arrangement, the active-window boundary must NOT fabricate one.
  const withArr = detectCorrelations(
    input({ mealEvents, symptomEvents, feedingArrangements: [arrangement('chicken', at(12, 0), null)] }),
  )
  assert.equal(
    withArr.some((f) => f.protein === 'chicken'),
    false,
    'a free-fed protein is excluded — its active-window boundary cannot manufacture a correlate',
  )
})

Deno.test('detectCorrelations — B-040: an in-window free-fed bowl CAPS an otherwise-Established finding at Early (confounder)', () => {
  // The Established fixture (beef → vomit, 6 clean pairs), but the pet ALSO free-feeds
  // a SEPARATE food (salmon) the whole time. Salmon is never the subject of a finding
  // (not a discrete-meal protein), but as an uncontrolled standing exposure it confounds
  // the matched set → beef can no longer reach Established (§3 engine rule). The sample
  // size and beef's own attribution are unchanged — only the tier is capped.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({ mealEvents, symptomEvents, feedingArrangements: [arrangement('salmon', at(1, 0), null)] }),
  )
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.matchedPairs, 6, 'same sample size that reached Established with no free-feeding')
  assert.equal(f.attributionFloor, 'high', "beef's own attribution is untouched — salmon is the confounder")
  assert.equal(f.tier, 'early', 'an uncontrolled standing exposure in-window blocks Established')
})

Deno.test('detectCorrelations — B-040: a null-protein free-fed bowl still caps the tier (generic standing confounder)', () => {
  // Even when the free-fed food has no identified protein, it is an uncontrolled
  // standing exposure and must cap the tier. It injects no named protein (so it never
  // becomes a finding) but still sets standingInWindow.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({ mealEvents, symptomEvents, feedingArrangements: [arrangement(null, at(1, 0), null)] }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].tier, 'early', 'an unidentified standing exposure is still a confounder')
})

Deno.test('detectCorrelations — B-040: an ENDED arrangement (active span before the episodes) does NOT cap (boundary respect)', () => {
  // The same Established fixture shifted to days 5–16, with a free-fed bowl that was
  // active ONLY on days 1–2 and has since ended. No analysis window overlaps that span,
  // so it is correctly absent — no blanket "always present forever" — and Established
  // is reached. This is the active-window boundary being honoured.
  const mealEvents = [
    ...staple(5, 16, 'chicken', 9),
    ...[5, 6, 7, 8, 9, 10].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [5, 6, 7, 8, 9, 10].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({ mealEvents, symptomEvents, feedingArrangements: [arrangement('salmon', at(1, 0), at(2, 0))] }),
  )
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.matchedPairs, 6)
  assert.equal(f.tier, 'established', 'an arrangement that ended before the episodes does not confound them')
})

// ── Detector ①: B-117 PR 9 — medication as confounder (§8) ───────────────────

Deno.test('doseToMedicationWindow — administered doses become a point window; not-given doses are dropped', () => {
  // given / partial / null(→given default) = drug ON BOARD → a point window at the dose time.
  for (const adherence of ['given', 'partial', null]) {
    const w = doseToMedicationWindow({ medicationItemId: 'drug-1', occurredAt: at(5, 9), adherence })
    assert.ok(w, `adherence=${adherence} must yield a window`)
    assert.equal(w!.activeFrom, at(5, 9))
    assert.equal(w!.activeUntil, at(5, 9), 'a dose is a POINT — from === until')
  }
  // missed / refused = drug NOT given → NEVER an exposure (a forgotten antibiotic must not
  // suppress a real food finding; absence of a given dose is not drug-presence).
  assert.equal(doseToMedicationWindow({ medicationItemId: 'd', occurredAt: at(5, 9), adherence: 'missed' }), null)
  assert.equal(doseToMedicationWindow({ medicationItemId: 'd', occurredAt: at(5, 9), adherence: 'refused' }), null)
})

Deno.test('detectCorrelations — B-117: an acute drug case-enriched across a symptom cluster SUPPRESSES the food correlation', () => {
  // THE §1 / §13-PR9 counterexample: a "chicken → vomit" that is really "antibiotic → nausea".
  // A contiguous vomit flare (days 11–14) on which chicken is the food in-window; the
  // time-matched controls are forced onto symptom-free days 10/15, where chicken is absent
  // → WITHOUT med context chicken false-fires as an Early correlate. An antibiotic regimen
  // is active EXACTLY over the flare (days 11–14) and absent from the off-flare controls →
  // the drug is case-enriched (clears the same case-crossover bar a protein would), so we
  // cannot separate drug from food → the engine declines to surface "chicken → vomit".
  const mealEvents = [
    ...staple(1, 20, 'beef', 9), // daily staple: eligibility + contrast; concordant → washes out
    pMeal(11, 'chicken', 10),
    pMeal(12, 'chicken', 10),
    pMeal(13, 'chicken', 10),
    pMeal(14, 'chicken', 10),
  ]
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))

  // Baseline: without med context, chicken surfaces (the false attribution we must prevent).
  const baseline = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(baseline.some((f) => f.protein === 'chicken'), true, 'baseline: chicken false-fires')

  // With an antibiotic active over the flare, chicken is suppressed entirely.
  const withMed = detectCorrelations(
    input({ mealEvents, symptomEvents, medicationWindows: [medRegimen(at(11, 0), at(14, 12))] }),
  )
  assert.equal(
    withMed.some((f) => f.protein === 'chicken'),
    false,
    'a case-enriched drug suppresses the symptom\'s food correlations (declines the false attribution)',
  )
  assert.equal(withMed.length, 0, 'nothing else surfaces — the honest answer while a drug confounds the window')
})

Deno.test('detectCorrelations — B-117: suppression works off regimen-UNLINKED dose points (the dominant signal today, B-135)', () => {
  // Same flare, but the drug presence comes from administered DOSE EVENTS (not a regimen) —
  // the current reality, since logged doses are regimen-unlinked. Each dose is a point in its
  // own case window (given ~2h before onset), absent from the off-flare controls → case-enriched
  // → suppressed. Proves the confounder pass does not depend on a regimen having been set up.
  const mealEvents = [
    ...staple(1, 20, 'beef', 9),
    ...[11, 12, 13, 14].map((d) => pMeal(d, 'chicken', 10)),
  ]
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))
  const withDoses = detectCorrelations(
    input({
      mealEvents,
      symptomEvents,
      medicationWindows: [11, 12, 13, 14].map((d) => medDose(at(d, 9))),
    }),
  )
  assert.equal(
    withDoses.some((f) => f.protein === 'chicken'),
    false,
    'administered dose points alone suppress a case-enriched confounded correlation',
  )
})

Deno.test('detectCorrelations — B-117: missed/refused doses are NOT on board — a forgotten drug does not suppress a real finding', () => {
  // The SAME flare + dose times as the dose-point suppression test, but every dose was MISSED
  // (owner forgot) → the drug was never administered → it is NOT on board → it must not
  // suppress. doseToMedicationWindow drops missed/refused upstream, so the engine sees no med
  // windows and chicken surfaces exactly as the baseline. Modelling a non-administration as
  // drug-presence would be a false negative we would never catch.
  const mealEvents = [
    ...staple(1, 20, 'beef', 9),
    ...[11, 12, 13, 14].map((d) => pMeal(d, 'chicken', 10)),
  ]
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))
  const missedWindows = [11, 12, 13, 14]
    .map((d) => doseToMedicationWindow({ medicationItemId: 'drug-1', occurredAt: at(d, 9), adherence: 'missed' }))
    .filter((w): w is MedicationWindow => w !== null)
  assert.equal(missedWindows.length, 0, 'missed doses produce no exposure windows')
  const withMissed = detectCorrelations(input({ mealEvents, symptomEvents, medicationWindows: missedWindows }))
  assert.equal(withMissed.some((f) => f.protein === 'chicken'), true, 'a forgotten drug does not suppress chicken')
})

Deno.test('detectCorrelations — B-117: a CHRONIC concordant drug does NOT suppress, but caps the tier at Early (§8 caveat)', () => {
  // The Established beef fixture (6 clean pairs), plus a chronic drug on board the WHOLE time
  // (active since before the episodes, still active). It sits in BOTH the case and control
  // windows of every pair → concordant → the self-matching controls for it → it does NOT
  // suppress (we must not gut the wedge for chronically-medicated pets). But an uncontrolled
  // drug on board means we cannot certify Established, so — like a free-fed standing exposure —
  // it caps the finding at Early. The insight still surfaces; only the tier is caveated.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({ mealEvents, symptomEvents, medicationWindows: [medRegimen(at(1, 0), null)] }),
  )
  assert.equal(findings.length, 1, 'the real beef correlation still surfaces — not suppressed')
  const f = findings[0]
  assert.equal(f.protein, 'beef')
  assert.equal(f.matchedPairs, 6, 'same sample size that reached Established with no medication')
  assert.equal(f.attributionFloor, 'high', "beef's own attribution is untouched — the drug is the confounder")
  assert.equal(f.tier, 'early', 'a present-but-concordant drug caps Established at Early (caveated)')
})

Deno.test('detectCorrelations — B-117: medicationWindows:[] is byte-identical to no medication context (inert)', () => {
  // The empty-input no-op contract. An explicit empty array must reach Established exactly as
  // the no-medicationWindows Established fixture does — the confounder pass adds nothing when
  // there are no meds.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(input({ mealEvents, symptomEvents, medicationWindows: [] }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].tier, 'established', 'an empty medicationWindows must not change anything')
})

Deno.test('detectCorrelations — B-117: a drug started MID-window (control-enriched, not case-enriched) does NOT over-suppress', () => {
  // Adversarial: a chronic drug introduced PART-WAY through the analysis (day 4) on the
  // Established beef fixture (symptom days 1–6). The early cases (1–3) predate the drug; their
  // controls (days 7–12) are after it → the drug is CONTROL-enriched (medC), the OPPOSITE of the
  // dangerous case-enriched direction. Suppression fires ONLY on case-enrichment (b>c, positive
  // riskDifference), so a control-enriched drug must NOT suppress — it only caps at Early.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({ mealEvents, symptomEvents, medicationWindows: [medRegimen(at(4, 0), null)] }),
  )
  assert.equal(findings.length, 1, 'a control-enriched drug must not suppress a real finding')
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].tier, 'early', 'present-in-window → capped at Early, but never suppressed')
})

Deno.test('detectCorrelations — B-117: a brief drug touching few of MANY symptom episodes does not suppress (riskDifference floor)', () => {
  // Adversarial: the riskDifference floor is what stops a brief/incidental drug from suppressing
  // a long symptom history. 11 vomit episodes (even days 2–22) with beef case-enriched on each,
  // chicken a daily staple. A drug touches only 2 of the 11 case windows (days 2, 4) → medB=2
  // (meets the discordant-case floor) BUT riskDifference = 2/11 ≈ 0.18 < 0.20 → NOT a confounder.
  // The beef correlation is preserved (capped at Early, since a drug is present in-window).
  const evenDays = [2, 4, 6, 8, 10, 12, 14, 16, 18, 22]
  const mealEvents = [
    ...staple(1, 23, 'chicken', 9),
    ...evenDays.map((d) => pMeal(d, 'beef', 10)),
    pMeal(20, 'beef', 10),
  ]
  const symptomEvents = [...evenDays, 20].sort((a, b) => a - b).map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(
    input({
      mealEvents,
      symptomEvents,
      medicationWindows: [medDose(at(2, 9)), medDose(at(4, 9))],
    }),
  )
  const beef = findings.find((f) => f.protein === 'beef')
  assert.ok(beef, 'a drug touching only 2 of 11 episodes must not suppress the beef correlation')
  assert.equal(beef!.tier, 'early', 'a drug present in-window caps at Early, but the riskDifference floor blocks suppression')
})

Deno.test('detectCorrelations — B-117: suppression is symptom-type-wide — two co-enriched proteins are both suppressed (documented trade-off)', () => {
  // When a drug confounds a symptom window, the engine cannot disentangle WHICH food is
  // implicated (drug + every co-enriched food are collinear in the matched set, and a systemic
  // drug plausibly shifts the response to all foods). The honest, conservative output is to
  // suppress ALL of that symptom's food correlations — accepting a temporary false negative on a
  // genuinely-independent food over a false attribution (§1). Both chicken AND beef are
  // case-enriched over the flare; the antibiotic suppresses both.
  const mealEvents = [
    ...staple(1, 20, 'salmon', 8), // staple: contrast + eligibility; concordant → washes out
    ...[11, 12, 13, 14].flatMap((d) => [pMeal(d, 'chicken', 9), pMeal(d, 'beef', 10)]),
  ]
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))

  const baseline = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.deepEqual(
    baseline.map((f) => f.protein).sort(),
    ['beef', 'chicken'],
    'baseline: both proteins false-fire over the flare',
  )
  const withMed = detectCorrelations(
    input({ mealEvents, symptomEvents, medicationWindows: [medRegimen(at(11, 0), at(14, 12))] }),
  )
  assert.equal(withMed.length, 0, 'a confounding drug suppresses every food correlation for that symptom type')
})

Deno.test('detectCorrelations — B-117: suppressing one symptom type must NOT inflate an UNRELATED finding\'s tier (Bonferroni family stays stable)', () => {
  // Adversarial-review defect (B-117 PR 9): when a drug suppresses a whole symptom type, those
  // withdrawn candidates must STILL count toward the multiple-comparison family — else
  // correctedAlpha grows and an UNRELATED finding flips Early→Established purely because we
  // suppressed elsewhere (a tier-inflation wart, never a false reassurance). Fixture: a clean
  // beef→DIARRHEA correlation (6 pairs) + a separate, far-away vomit flare an antibiotic
  // suppresses. The diarrhea finding's correctedAlpha and tier must be IDENTICAL whether or not
  // the unrelated antibiotic suppresses the vomit type.
  const mealEvents = [
    ...staple(1, 30, 'chicken', 8), // washes out both types; eligibility + contrast everywhere
    ...[2, 5, 8, 11, 14, 17].map((d) => pMeal(d, 'beef', 10)), // beef enriched on diarrhea days only
  ]
  const symptomEvents = [
    ...[2, 5, 8, 11, 14, 17].map((d) => symptom('diarrhea', at(d, 11))),
    ...[22, 23, 24].map((d) => symptom('vomit', at(d, 11))), // a separate, unrelated vomit flare
  ]
  const beefDiarrhea = (fs: CorrelationFinding[]) =>
    fs.find((f) => f.protein === 'beef' && f.symptomType === 'diarrhea')

  const noMed = detectCorrelations(input({ mealEvents, symptomEvents }))
  const withMed = detectCorrelations(
    input({ mealEvents, symptomEvents, medicationWindows: [medRegimen(at(22, 0), at(24, 12))] }),
  )
  const bdNo = beefDiarrhea(noMed)
  const bdMed = beefDiarrhea(withMed)
  assert.ok(bdNo && bdMed, 'the beef→diarrhea finding exists in both runs (diarrhea is never suppressed)')
  assert.equal(withMed.some((f) => f.symptomType === 'vomit'), false, 'the vomit type IS suppressed by the antibiotic')
  assert.equal(
    bdMed!.correctedAlpha,
    bdNo!.correctedAlpha,
    'suppressing the vomit type must not shrink the Bonferroni family for the unrelated diarrhea finding',
  )
  assert.equal(bdMed!.tier, bdNo!.tier, "the unrelated finding's tier must not inflate Early→Established")
})

// ── Detector ①: B-156 PR C1 — the dose↔vehicle pairing (combo confounder) ────
//
// A medication given INSIDE a food (a pill in a Delectable) is ONE act stored as TWO events —
// a meal/treat AND a dose, linked by paired_event_id. For that exposure the food and the drug
// are collinear by construction, so the engine attributes it to the DRUG, never the food:
//   • the vehicle meal's protein is dropped from the case/control exposure set (PR C1 core);
//   • an in-doubt combo dose (vehicle refused/picked, adherence still null) is NOT on board
//     (B-174 — the carrier wasn't eaten → the drug most likely wasn't delivered).
// Both reconcile with the B-117 PR 9 confounder pass; absent (no combos) ⇒ byte-identical.

const vehicleMeal = (day: number, protein: string, hour = 10): MealEvent =>
  meal({ occurredAt: at(day, hour), primaryProtein: protein, isMedicationVehicle: true })

Deno.test('doseToMedicationWindow — B-174: an unconfirmed combo dose with a refused/picked vehicle is NOT on board', () => {
  const base = { medicationItemId: 'drug-1', occurredAt: at(5, 9) }
  // The exact collision B-174 resolves: B3 lands a combo dose at adherence `null` ("unconfirmed")
  // when the owner marked the carrier food refused/picked. The carrier wasn't eaten → the pill in
  // it most likely wasn't delivered → not on board → no window (just like a refused dose).
  assert.equal(doseToMedicationWindow({ ...base, adherence: null, pairedVehicleIntake: 'refused' }), null)
  assert.equal(doseToMedicationWindow({ ...base, adherence: null, pairedVehicleIntake: 'picked' }), null)
  // The carrier WAS eaten (some/most/all) → §5.1 default holds → on board (a point window). This
  // also keeps B3's documented `some`-edge known-limit (B-173): `some` reads as given/on-board.
  for (const intake of ['some', 'most', 'all'] as const) {
    const w = doseToMedicationWindow({ ...base, adherence: null, pairedVehicleIntake: intake })
    assert.ok(w, `vehicle=${intake} → the dose is on board`)
    assert.equal(w!.activeFrom, at(5, 9), 'a dose is still a POINT at its time')
  }
  // An EXPLICIT owner answer overrides the in-doubt drop: "I pilled her directly after she spat
  // the treat" → given/partial → on board even on a refused vehicle.
  assert.ok(doseToMedicationWindow({ ...base, adherence: 'given', pairedVehicleIntake: 'refused' }))
  assert.ok(doseToMedicationWindow({ ...base, adherence: 'partial', pairedVehicleIntake: 'picked' }))
  // missed/refused adherence is dropped regardless of the vehicle (unchanged from PR 9).
  assert.equal(doseToMedicationWindow({ ...base, adherence: 'missed', pairedVehicleIntake: 'all' }), null)
  assert.equal(doseToMedicationWindow({ ...base, adherence: 'refused', pairedVehicleIntake: 'all' }), null)
  // A STANDALONE null dose (no vehicle) is UNTOUCHED — still administered (§5.1). The new branch
  // requires a refused/picked vehicle, which only a combo has, so standalone semantics can't drift.
  assert.ok(doseToMedicationWindow({ ...base, adherence: null }), 'standalone null = administered')
  assert.ok(
    doseToMedicationWindow({ ...base, adherence: null, pairedVehicleIntake: null }),
    'a combo whose vehicle intake we cannot see (deleted / out-of-lookback) keeps the §5.1 default',
  )
})

Deno.test('detectCorrelations — B-156 PR C1: a protein logged ONLY as a medication vehicle never builds a food correlation', () => {
  // THE combo false-attribution: every chicken exposure over the flare is a pill-in-a-treat. The
  // same fixture WITHOUT the pairing false-fires "chicken → vomit" (the B-117 baseline). With the
  // vehicle flag set, the chicken is attributed to the drug and never surfaces as a food card —
  // even with NO medication window present, the per-exposure drop alone is decisive.
  const baseMeals = staple(1, 20, 'beef', 9)
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))

  const baseline = detectCorrelations(
    input({ mealEvents: [...baseMeals, ...[11, 12, 13, 14].map((d) => pMeal(d, 'chicken', 10))], symptomEvents }),
  )
  assert.equal(baseline.some((f) => f.protein === 'chicken'), true, 'baseline (clean chicken) false-fires')

  const asVehicle = detectCorrelations(
    input({ mealEvents: [...baseMeals, ...[11, 12, 13, 14].map((d) => vehicleMeal(d, 'chicken'))], symptomEvents }),
  )
  assert.equal(
    asVehicle.some((f) => f.protein === 'chicken'),
    false,
    'a vehicle-only protein is attributed to the drug, never surfaced as a food correlation',
  )
})

Deno.test('detectCorrelations — B-156 PR C1: a vehicle is a PER-EXPOSURE drop, not a candidacy exclusion (unlike free-fed)', () => {
  // The load-bearing distinction from free-feeding: a free-fed protein is excluded from candidacy
  // WHOLESALE (always present); a vehicle drops only ITS OWN exposure. Here chicken is case-
  // enriched via CLEAN meals over the flare AND also appears as a medication vehicle on two
  // symptom-free days. The clean flare signal must still fire — the off-flare vehicle exposures
  // must NOT blind the engine to the protein the way a free-fed exclusion would.
  const mealEvents = [
    ...staple(1, 20, 'beef', 9),
    ...[11, 12, 13, 14].map((d) => pMeal(d, 'chicken', 10)), // clean, case-enriched over the flare
    vehicleMeal(3, 'chicken', 15), // off-flare vehicle exposures — dropped, but the protein stays a candidate
    vehicleMeal(6, 'chicken', 15),
  ]
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(
    findings.some((f) => f.protein === 'chicken'),
    true,
    'clean chicken still fires — a vehicle exposure elsewhere does not exclude the protein from candidacy',
  )
})

Deno.test('detectCorrelations — B-156 PR C1: a FINISHED combo drops the vehicle food AND keeps the drug on board for the §8 pass', () => {
  // The realistic eaten combo: the cat ATE the chicken treat carrying the pill on every flare day.
  // Two things hold together — (1) the chicken vehicle never builds its own card (PR C1 core), and
  // (2) the dose IS on board (vehicle eaten → §5.1 default), so the drug is present for the B-117
  // confounder analysis. The honest combo outcome: no "chicken → vomit".
  const baseMeals = staple(1, 20, 'beef', 9)
  const vehicleChicken = [11, 12, 13, 14].map((d) => vehicleMeal(d, 'chicken'))
  const symptomEvents = [11, 12, 13, 14].map((d) => symptom('vomit', at(d, 11)))
  const doseWindows = [11, 12, 13, 14]
    .map((d) =>
      doseToMedicationWindow({ medicationItemId: 'drug-1', occurredAt: at(d, 10), adherence: null, pairedVehicleIntake: 'all' }),
    )
    .filter((w): w is MedicationWindow => w !== null)
  assert.equal(doseWindows.length, 4, 'an eaten-vehicle combo dose IS on board (a point window each)')
  const findings = detectCorrelations(
    input({ mealEvents: [...baseMeals, ...vehicleChicken], symptomEvents, medicationWindows: doseWindows }),
  )
  assert.equal(findings.some((f) => f.protein === 'chicken'), false, 'the vehicle chicken never surfaces as a food card')
})

Deno.test('detectCorrelations — B-174: a refused-vehicle in-doubt combo dose cannot suppress a real finding', () => {
  // The combo safety case meets the confounder pass. The owner tried to pill the cat in a chicken
  // treat on the beef-flare days but the cat REFUSED it → in-doubt doses (adherence null, vehicle
  // refused). doseToMedicationWindow drops every one (drug not delivered), so the engine sees NO
  // med window and the genuine beef→vomit Established finding survives — a phantom "drug on board"
  // must never suppress (or even cap) a real food correlation.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const inDoubtWindows = [1, 2, 3, 4, 5, 6]
    .map((d) =>
      doseToMedicationWindow({ medicationItemId: 'drug-1', occurredAt: at(d, 9), adherence: null, pairedVehicleIntake: 'refused' }),
    )
    .filter((w): w is MedicationWindow => w !== null)
  assert.equal(inDoubtWindows.length, 0, 'every in-doubt refused-vehicle dose is dropped (not on board)')
  const findings = detectCorrelations(input({ mealEvents, symptomEvents, medicationWindows: inDoubtWindows }))
  assert.equal(findings.length, 1, 'the real beef finding survives')
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].tier, 'established', 'with no real drug on board it is not even capped at Early')
})

Deno.test('detectCorrelations — B-156 PR C1: no vehicle flag is byte-identical (the Established fixture still reaches Established)', () => {
  // Inertness lock: isMedicationVehicle absent/false must perturb nothing. The canonical
  // Established beef fixture must reach Established exactly as it does without the field.
  const mealEvents = [
    ...staple(1, 12, 'chicken', 9),
    ...[1, 2, 3, 4, 5, 6].map((d) => pMeal(d, 'beef', 10)),
  ]
  const symptomEvents = [1, 2, 3, 4, 5, 6].map((d) => symptom('vomit', at(d, 11)))
  const findings = detectCorrelations(input({ mealEvents, symptomEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].tier, 'established', 'no vehicle flag ⇒ unchanged behavior')
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

Deno.test('detectIntakeDecline — same-day re-logged refusals still fire (B-090: no inverse-pseudoreplication suppression)', () => {
  // A dog refuses its normally-eaten food THREE times in one calendar day (breakfast,
  // midday, late morning — all before NOW). Under the old `prior = sorted.slice(0,-1)`,
  // two of those same-day refusals leaked into `prior`, dragged priorMean below
  // normallyEatenScoreFloor (3), and SILENCED the watch — refusing harder yielded LESS
  // concern (the inverse-pseudoreplication false-negative the adversarial review caught
  // client-side, B-090). Excluding the whole latest calendar day from `prior` fixes it.
  const mealEvents = [
    // F1 eaten well across three distinct prior days (the established baseline)…
    ratedMeal(26, 'all', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    ratedMeal(27, 'all', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    ratedMeal(28, 'all', { foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    // …then refused three times on the latest day.
    meal({ occurredAt: at(30, 6), intakeRating: 'refused', foodType: 'meal', foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    meal({ occurredAt: at(30, 9), intakeRating: 'refused', foodType: 'meal', foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
    meal({ occurredAt: at(30, 11), intakeRating: 'refused', foodType: 'meal', foodItemId: 'F1', foodLabel: 'the turkey pâté' }),
  ]
  // Dog isolates the refusal trigger: only 3 prior-day meals (< baseline floor of 4),
  // so the consecutive-low path can't fire and confound the assertion.
  const findings = detectIntakeDecline(input({ pet: dog, mealEvents }))
  const refusal = findings.find((f) => f.trigger === 'refused_normal_food')
  assert.ok(refusal, 'a dog refusing its normally-eaten food 3× in one day must still fire')
  assert.equal(refusal.priorityClass, 'safety')
  assert.equal(refusal.refusedFoodLabel, 'the turkey pâté')
  assert.equal(refusal.recentScore, 0)
  // Baseline must be the three prior 'all' days (score 4), NOT polluted by the same-day
  // refusals (which would pull it to 2.4 and suppress the flag).
  assert.ok(refusal.baselineScore >= 3, `baseline must exclude same-day refusals, got ${refusal.baselineScore}`)
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

// ── Detector ④: symptom-frequency worsening (the deterministic worsening lane) ──
// Same week-over-week windows as ③ relative to NOW = 2026-05-30T12:00.

Deno.test('detectWorsening — an episode-count rise fires the STANDARD tier (not dense)', () => {
  // current 4 episodes across only 2 days (24, 26 — two bouts each, >3h apart) → not
  // dense; prior 2 episodes. A clear rise, calm "word with your vet" register.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(24, 12)),
    symptom('vomit', at(26, 8)), symptom('vomit', at(26, 12)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)),
  ]
  // Pad logging-eligibility to 3 distinct days in BOTH windows (meals, not symptoms).
  const mealEvents = [meal({ occurredAt: at(28, 8) }), meal({ occurredAt: at(21, 8) })]
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.type, 'symptom_worsening')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.currentCount, 4)
  assert.equal(f.priorCount, 2)
  assert.equal(f.currentDays, 2)
  assert.equal(f.priorDays, 2)
  assert.equal(f.trigger, 'more_episodes')
  assert.equal(f.tier, 'standard')
  assert.equal(f.windowDays, 7)
})

Deno.test('detectWorsening — symptoms on most days fires the FIRM tier (density-anchored)', () => {
  // current 4 episodes on 4 DISTINCT days (≥ worseningDenseDayFloor) → "book a vet
  // visit soon"; prior 2 episodes. Density, not raw count, lifts it to firm.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)),
    symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(19, 8)),
  ]
  const mealEvents = [meal({ occurredAt: at(21, 8) })] // prior 3rd logging day
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].tier, 'firm')
  assert.equal(findings[0].currentDays, 4)
  assert.equal(findings[0].currentCount, 4)
  assert.equal(findings[0].trigger, 'more_episodes')
})

Deno.test('detectWorsening — FIRM via the more_days arm on a FALLING count (adversarial repro)', () => {
  // prior 6 episodes on 2 acute days; current 4 episodes spread over 4 days. The episode
  // count FELL (6→4) but the symptom-day spread ROSE (2→4) and the current week is dense
  // (≥4 days) → firm tier via the more_days arm. The finding is real; the phrasing layer
  // must compare on the DAYS axis here, never render "(4 episodes) up from 6" (the wart
  // the adversarial review caught) — asserted in phrasing.test.ts / signalCopy.test.ts.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(17, 12)), symptom('vomit', at(17, 16)),
    symptom('vomit', at(19, 8)), symptom('vomit', at(19, 12)), symptom('vomit', at(19, 16)),
  ]
  const mealEvents = [meal({ occurredAt: at(21, 8) })] // prior 3rd logging day
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].tier, 'firm')
  assert.equal(findings[0].trigger, 'more_days')
  assert.equal(findings[0].currentCount, 4)
  assert.equal(findings[0].priorCount, 6) // count fell — the days axis is what rose
  assert.equal(findings[0].currentDays, 4)
  assert.equal(findings[0].priorDays, 2)
})

Deno.test('detectWorsening — same count but more SPREAD fires the SOFT (more_days) tier', () => {
  // current 3 episodes over 3 days; prior 3 episodes ALL on one acute day. Episode
  // counts are flat (3 vs 3) but the symptom-day spread rose (3 vs 1) → worsening via
  // the more_days arm, the gentlest "keeping an eye on" register. This is the EXACT
  // input ③'s gate suppresses on — the valve: ③ silent ⟺ ④ speaks.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(17, 12)), symptom('vomit', at(17, 16)),
  ]
  const mealEvents = [meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) })]
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].trigger, 'more_days')
  assert.equal(findings[0].tier, 'soft')
  assert.equal(findings[0].currentCount, 3)
  assert.equal(findings[0].priorCount, 3)
  assert.equal(findings[0].currentDays, 3)
  assert.equal(findings[0].priorDays, 1)
  // The valve: reflections are silent on exactly this input.
  assert.deepEqual(detectReflections(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectWorsening — a rise from a LOGGED zero fires (prior count 0 is allowed)', () => {
  // current 3 episodes; prior week had NO vomiting but WAS logged (meals on 3 days),
  // so the zero is real, not a logging gap. A symptom appearing is at least as real as
  // 2→4 — it must fire, with the "after none last week" framing.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)),
  ]
  const mealEvents = [
    meal({ occurredAt: at(17, 8) }), meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) }),
  ]
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].priorCount, 0)
  assert.equal(findings[0].currentCount, 3)
  assert.equal(findings[0].trigger, 'more_episodes')
  assert.equal(findings[0].tier, 'standard')
})

Deno.test('detectWorsening — a DARK prior week cannot manufacture a rise (fake-rise guard)', () => {
  // current 4 episodes; prior window has only ONE logged day → not logging-eligible.
  // current 4 > prior 0 looks like a rise, but we cannot trust a rise measured against
  // an unlogged week (the symptoms may simply not have been recorded). Stay SILENT —
  // and note the residual that DOES get through (a logged-but-under-logged prior) errs
  // toward escalation, never toward a false all-clear (§9).
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)),
    symptom('vomit', at(26, 8)), symptom('vomit', at(27, 8)),
  ]
  const mealEvents = [meal({ occurredAt: at(17, 8) })] // prior logging days = 1 (< floor)
  assert.deepEqual(detectWorsening(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectWorsening — re-logs of ONE bout collapse to one episode (no manufactured rise)', () => {
  // Five rapid logs of a single bout (all within 3h) collapse to ONE episode, so the
  // current count is 1 — below the worsening floor — and nothing fires. A single bout
  // logged five times must never read as a five-episode surge.
  const symptomEvents = [
    symptom('vomit', at(24, 8, 0)), symptom('vomit', at(24, 8, 30)), symptom('vomit', at(24, 9, 0)),
    symptom('vomit', at(24, 9, 30)), symptom('vomit', at(24, 10, 0)),
  ]
  const mealEvents = [
    meal({ occurredAt: at(25, 8) }), meal({ occurredAt: at(26, 8) }), // current logging days
    meal({ occurredAt: at(17, 8) }), meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) }),
  ]
  assert.deepEqual(detectWorsening(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectWorsening — an IMPROVING trend never fires (worsening lane only)', () => {
  // current 3 vs prior 5 (falling) → ③ reflects "improving"; ④ stays silent.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)), symptom('vomit', at(18, 8)), symptom('vomit', at(19, 8)),
    symptom('vomit', at(20, 8)), symptom('vomit', at(21, 8)),
  ]
  assert.deepEqual(detectWorsening(input({ symptomEvents })), [])
})

Deno.test('detectWorsening — a lone single new episode does NOT fire (count 1 < floor)', () => {
  // One new vomit this week, none last week. A single isolated episode is not a
  // worsening trend (mirrors ③'s lone-log guard) — per-incident analysis owns the
  // acute single event, not this trend lane.
  const symptomEvents = [symptom('vomit', at(25, 8))]
  const mealEvents = [
    meal({ occurredAt: at(24, 8) }), meal({ occurredAt: at(26, 8) }),
    meal({ occurredAt: at(17, 8) }), meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) }),
  ]
  assert.deepEqual(detectWorsening(input({ symptomEvents, mealEvents })), [])
})

Deno.test('detectWorsening — CROSS-SYMPTOM: fires for the worsening symptom while ③ is silent (valve closed)', () => {
  // The mirror of the reflection cross-symptom test: vomit rising 1→4 (worsening),
  // itch improving 5→3. ③ stays globally silent (a soothing "itch is down" card must
  // not surface while vomit rises); ④ now OWNS the suppressed case and emits ONE card
  // for the rising vomit. ③ silent ⟺ ④ speaks — the one-way valve is closed.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)),
    symptom('itch', at(24, 9)), symptom('itch', at(26, 9)), symptom('itch', at(28, 9)),
    symptom('itch', at(16, 13)), symptom('itch', at(17, 9)), symptom('itch', at(18, 9)),
    symptom('itch', at(19, 9)), symptom('itch', at(20, 9)),
  ]
  assert.deepEqual(detectReflections(input({ symptomEvents })), [])
  const worsening = detectWorsening(input({ symptomEvents }))
  assert.equal(worsening.length, 1)
  assert.equal(worsening[0].symptomType, 'vomit')
  assert.equal(worsening[0].tier, 'firm') // vomit on 4 days → dense
})

Deno.test('detectWorsening — surfaces ONE card: the symptom with the largest rise', () => {
  // vomit rises 1→4 (rise 3); diarrhea rises 2→3 (rise 1). Both worsen, but the calm
  // safety surface shows only the most-worsening symptom.
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)),
    symptom('diarrhea', at(24, 9)), symptom('diarrhea', at(26, 9)), symptom('diarrhea', at(28, 9)),
    symptom('diarrhea', at(17, 9)), symptom('diarrhea', at(19, 9)),
  ]
  const mealEvents = [meal({ occurredAt: at(21, 8) })]
  const findings = detectWorsening(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'vomit')
})

Deno.test('detectWorsening — within the safety band, intake-decline outranks worsening (both kept)', () => {
  // A pet eating less AND vomiting more shows BOTH safety cards (curation never drops
  // safety) — the two-signal gestalt the re-run brief found missing. Intake-decline
  // (faster-killing anorexia) leads.
  const worsening: SymptomWorseningFinding = {
    type: 'symptom_worsening',
    priorityClass: 'safety',
    symptomType: 'vomit',
    currentCount: 4,
    priorCount: 2,
    currentDays: 4,
    priorDays: 2,
    trigger: 'more_episodes',
    tier: 'firm',
    windowDays: 7,
  }
  const decline: IntakeDeclineFinding = {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3.6,
    recentScore: 1,
    daysBelowBaseline: 1,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
  }
  const ranked = rankFindings([worsening, decline], cat)
  assert.equal(ranked.length, 2, 'both safety cards are kept')
  assert.equal(ranked[0].finding.type, 'intake_decline', 'intake-decline leads worsening')
  assert.equal(ranked[1].finding.type, 'symptom_worsening')
})

Deno.test('detectSignals — end to end: a worsening pet leads with the safety worsening card', () => {
  const symptomEvents = [
    symptom('vomit', at(24, 8)), symptom('vomit', at(25, 8)), symptom('vomit', at(26, 8)), symptom('vomit', at(28, 8)),
    symptom('vomit', at(17, 8)),
  ]
  // Prior window needs ≥3 logged days for the rise to be trustworthy (fake-rise guard).
  const mealEvents = [meal({ occurredAt: at(18, 8) }), meal({ occurredAt: at(19, 8) })]
  const ranked = detectSignals(input({ pet: cat, symptomEvents, mealEvents }))
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].finding.type, 'symptom_worsening')
  assert.equal(ranked[0].finding.priorityClass, 'safety')
})

// ── Detector ⑦: symptom chronicity / persistence (B-182) ─────────────────────
//
// The §7 fixtures, pasted as the visible AC for this build step. The fires-correctly
// cases (1–5) prove the lane states the chronicity sentence the engine never said; the
// silence cases (6–10) are the never-reassure / honesty gates (a settled, short, sparse,
// acute, or manufactured course must stay SILENT — never a resolution or all-clear); the
// property test (14) is the §6 calibration gate (sparse noise must not trip the conjunction).
// Composition/ranking fixtures (11–13) + the validatePhrasing fixture (15) land with PR 2/3.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const NOW_MS = Date.parse(NOW) // 2026-05-30T12:00:00Z

/** ISO-8601 UTC for an onset `days` before NOW, at `atHour:atMin` UTC that day. */
const ago = (days: number, atHour = 11, atMin = 0): string => {
  const d = new Date(NOW_MS - days * DAY_MS)
  d.setUTCHours(atHour, atMin, 0, 0)
  return d.toISOString()
}
const vomitAgo = (days: number, atHour = 11, atMin = 0): SymptomEvent =>
  symptom('vomit', ago(days, atHour, atMin))
const diarrheaAgo = (days: number, atHour = 11): SymptomEvent => symptom('diarrhea', ago(days, atHour))
const mealAgo = (days: number): MealEvent => meal({ occurredAt: ago(days) })

// Fixture 1 — the council case (golden). ~q2-day vomiting over 6 weeks, most recent today.
Deno.test('detectChronicity — the council case: ~6 weeks of q2-day vomiting fires FIRM', () => {
  const symptomEvents: SymptomEvent[] = []
  for (let d = 0; d <= 42; d += 2) symptomEvents.push(vomitAgo(d)) // 22 episodes, span 42d
  const findings = detectChronicity(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.type, 'symptom_chronicity')
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.tier, 'firm') // span 42 ≥ firmSpanDays
  assert.equal(f.spanDays, 42)
  assert.equal(f.episodeCount, 22)
  assert.equal(f.activeWeeks, 7) // buckets 0..6
  assert.equal(f.daysSinceLastEpisode, 0)
  assert.equal(f.windowDays, 56)
  assert.equal(f.associationalOnly, true)
})

// Fixture 2 — the flat-relentless case (the whole point). Steady 3/wk for 6 weeks, ongoing.
Deno.test('detectChronicity — flat-relentless: steady 3/wk for 6 weeks fires while ④ is SILENT', () => {
  const symptomEvents: SymptomEvent[] = []
  for (let w = 0; w <= 5; w++) {
    symptomEvents.push(vomitAgo(7 * w + 0), vomitAgo(7 * w + 2), vomitAgo(7 * w + 4))
  }
  const inp = input({ symptomEvents })
  const findings = detectChronicity(inp)
  assert.equal(findings.length, 1, 'chronicity fires on the relentless-but-flat course')
  assert.equal(findings[0].episodeCount, 18)
  assert.equal(findings[0].spanDays, 39)
  assert.equal(findings[0].activeWeeks, 6)
  assert.equal(findings[0].tier, 'standard') // 39 < firmSpanDays; firm-inheritance is PR 2
  assert.equal(findings[0].daysSinceLastEpisode, 0)
  // ④ is SILENT — the count is flat week-over-week (no rise), the exact gap ⑦ exists to fill.
  assert.deepEqual(detectWorsening(inp), [])
  // (③ still renders its calm "same as last week" here — the ⑦→③ suppression VALVE that
  // blanks it is the PR-2 composition change; this fixture proves ⑦ FIRES, which is its
  // prerequisite.)
})

// Fixture 3 — standard tier: distributed vomiting over ~3.5 weeks, recent.
Deno.test('detectChronicity — a distributed ~3-week course fires the STANDARD tier', () => {
  const symptomEvents = [0, 4, 8, 12, 16, 20, 24].map((d) => vomitAgo(d)) // span 24d, 4 active weeks
  const findings = detectChronicity(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].tier, 'standard')
  assert.equal(findings[0].spanDays, 24)
  assert.equal(findings[0].activeWeeks, 4)
  assert.equal(findings[0].episodeCount, 7)
})

// Fixture 4 — intermittent-but-chronic: episodes in alternating weeks (gap weeks quiet).
Deno.test('detectChronicity — recurrent-across-weeks fires even with quiet weeks between', () => {
  // Onsets distributed across week-buckets 0, 2, 4 (recent, span 30 days). The current week
  // carries only one episode (so this is chronicity, not a week-over-week ④ rise). 6 episodes
  // across 3 distinct weeks — recurrent chronic is real (§7 #4), even with quiet weeks between.
  const symptomEvents = [
    vomitAgo(3), // bucket 0 (current week — single episode, no ④ rise)
    vomitAgo(15), vomitAgo(17), // bucket 2
    vomitAgo(29), vomitAgo(31), vomitAgo(33), // bucket 4
  ]
  const findings = detectChronicity(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].activeWeeks, 3)
  assert.equal(findings[0].episodeCount, 6)
  assert.equal(findings[0].spanDays, 30)
  assert.equal(findings[0].tier, 'standard')
})

// Fixture 5 — non-vomit symptom: ⑦ is symptom-agnostic (chronic diarrhea is real).
Deno.test('detectChronicity — fires for chronic DIARRHEA (symptom-agnostic, unlike ⑤)', () => {
  const symptomEvents = [1, 8, 15, 22, 29, 36].map((d) => diarrheaAgo(d)) // 6 wks, q1wk
  const findings = detectChronicity(input({ symptomEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'diarrhea')
  assert.equal(findings[0].tier, 'standard')
  assert.equal(findings[0].spanDays, 35)
})

// Fixture 6 — recently resolved: last episode older than the recency floor → SILENT.
Deno.test('detectChronicity — a SETTLED course is SILENT (recency floor; never "resolved")', () => {
  // A genuine 6-week course, but the last episode was 20 days ago (> ongoingRecencyDays 14).
  // ⑦ must stay silent AND emit no resolution copy — silence ≠ wellness (§4.7 #1).
  const symptomEvents = [20, 25, 30, 35, 40, 45, 50].map((d) => vomitAgo(d))
  assert.deepEqual(detectChronicity(input({ symptomEvents })), [])
})

// Fixture 7 — one bad week: a single acute week, then nothing → span floor → SILENT.
Deno.test('detectChronicity — one bad week (span < minSpanDays) stays SILENT', () => {
  const symptomEvents = [0, 1, 2, 3, 4].map((d) => vomitAgo(d)) // span 4d < 21
  assert.deepEqual(detectChronicity(input({ symptomEvents })), [])
})

// Fixture 8 — two distant bouts: long span but only 2 episodes / 2 active weeks → SILENT.
Deno.test('detectChronicity — two distant bouts (episodes/active-weeks floors) stay SILENT', () => {
  // Vomit 40 days ago and 2 days ago, nothing between. "Twice in 6 weeks" is not ongoing.
  const symptomEvents = [vomitAgo(40), vomitAgo(2)]
  const mealEvents = [mealAgo(35), mealAgo(20), mealAgo(8)] // logging-eligible; the floors that block are episodes/active-weeks
  assert.deepEqual(detectChronicity(input({ symptomEvents, mealEvents })), [])
})

// Fixture 9 — acute multi-bout single day: collapses to ~2 episodes, span ≈ 0 → SILENT.
Deno.test('detectChronicity — an acute multi-bout single day collapses and stays SILENT', () => {
  // Six vomits in one afternoon. The 3h re-log collapse → 2 episodes (an 11:00 cluster and
  // an 18:00 cluster), span ≈ 0 → silent. A single bad day is per-incident territory, not ⑦.
  const symptomEvents = [
    vomitAgo(5, 11, 0), vomitAgo(5, 11, 30), vomitAgo(5, 12, 0), vomitAgo(5, 12, 30),
    vomitAgo(5, 18, 0), vomitAgo(5, 18, 30),
  ]
  assert.deepEqual(detectChronicity(input({ symptomEvents })), [])
})

// Fixture 10 — manufactured span: a recent cluster + two stale singles across a DARK first
// half of the span → the logging-eligibility floor is the unique blocker → SILENT.
Deno.test('detectChronicity — a manufactured span (dark first half) stays SILENT (logging floor)', () => {
  // Episodes pass span (49), episodes (5), active-weeks (3) AND recency (0) — but the first
  // half of the onset span [49d..24.5d] holds only the two stale singles (49, 35), < the
  // logging-days floor. The span is two endpoints + a recent cluster, not a sustained course.
  const symptomEvents = [vomitAgo(0), vomitAgo(2), vomitAgo(4), vomitAgo(35), vomitAgo(49)]
  const stats = detectChronicity(input({ symptomEvents }))
  assert.deepEqual(stats, [], 'the dark first half of the span fails logging-eligibility')
})

// Fixture 14 — property test (REQUIRED §6 calibration gate): an OCCASIONAL vomiter, on the
// REALISTIC engaged-owner regime (meals logged daily → the span-halves logging floor is
// trivially met, so minEpisodes is the binding floor — the regime where false positives
// actually live), must NOT trip the §4.3 conjunction at a meaningful rate. This is the gate
// that drove minEpisodes 4→6 (see DEFAULT_CONFIG.chronicity calibration note): at 4 this
// fired ~9.9%, at 6 it fires ~1.3%.
Deno.test('detectChronicity — property: an occasional vomiter (meals logged) fires ⑦ at ≪ a small rate', () => {
  // Seeded LCG so the sweep is deterministic (no Math.random). Each trial = a pet whose
  // owner logs a meal every day and whose pet has occasional, UNRELATED single vomits
  // (~2 expected over the 56-day window — roughly one every few weeks).
  let seed = 0xc0ffee >>> 0
  const rng = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const TRIALS = 20000
  const P_VOMIT_PER_DAY = 2 / 56 // an occasional, unrelated single vomit
  let fires = 0
  for (let t = 0; t < TRIALS; t++) {
    const symptomEvents: SymptomEvent[] = []
    const mealEvents: MealEvent[] = []
    for (let d = 0; d < 56; d++) {
      mealEvents.push(mealAgo(d)) // engaged owner — logging-eligibility always met
      if (rng() < P_VOMIT_PER_DAY) symptomEvents.push(vomitAgo(d, Math.floor(rng() * 24)))
    }
    if (detectChronicity(input({ symptomEvents, mealEvents })).length > 0) fires++
  }
  const rate = fires / TRIALS
  console.log(`detectChronicity occasional-vomiter fire rate: ${(rate * 100).toFixed(3)}% (${fires}/${TRIALS})`)
  assert.ok(rate < 0.02, `occasional-vomiter fire rate ${(rate * 100).toFixed(3)}% must be ≪ small (< 2%)`)
})

// ── Detector ⑤: postprandial timing (B-078 — descriptive lane Phase 1) ───────
//
// The §7 falsification fixtures, pasted as the visible AC for this build step. Each
// load-bearing gate — the grazing guard, the witnessed-confidence gate, the
// free-feeding exclusion — has a fixture that tries to break it.

/** A WITNESSED-onset vomit episode at day/hour/min (the only timed-eligible onset). */
const wVomit = (day: number, hour = 12, min = 0): SymptomEvent => ({
  ...symptom('vomit', at(day, hour, min)),
  occurredAtConfidence: 'witnessed',
})

/** A vomit episode with explicit (or NULL) timestamp confidence. */
const cVomit = (
  day: number,
  hour: number,
  confidence: OccurredAtConfidence | null,
): SymptomEvent => ({
  ...symptom('vomit', at(day, hour, 0)),
  occurredAtConfidence: confidence,
})

/** A timed feeding (treat) at day/hour/min; confidence absent ⇒ witnessed semantics. */
const feeding = (day: number, hour: number, min = 0, over: Partial<MealEvent> = {}): MealEvent =>
  meal({ occurredAt: at(day, hour, min), foodType: 'treat', primaryProtein: 'x', ...over })

/**
 * The golden fixture (§7 #1): 12 witnessed vomit episodes (May 16..27), the last 4 rapid
 * (a feeding 20 min before onset) and the first 8 slow (a feeding 5h before), with ~8
 * feedings/day so the grazing guard is genuinely exercised at the bar.
 *   eligible = 12, rapid = 4, fraction 0.33, expectedRapid ≈ 2.0 → threshold = 4 → FIRES.
 */
function ppGolden(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  for (let i = 0; i < 12; i++) {
    const day = 16 + i
    symptomEvents.push(wVomit(day, 12, 0))
    if (i >= 8) mealEvents.push(feeding(day, 11, 40)) // 20 min before onset → rapid
    else mealEvents.push(feeding(day, 7, 0)) // 5h before onset → eligible, not rapid
    for (let h = 0; h < 7; h++) mealEvents.push(feeding(day, h, 0)) // 7 earlier fillers → 8/day
  }
  return { symptomEvents, mealEvents }
}

const ppFinding = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 4,
  eligibleCount: 12,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 18,
  feedingFormsInEvidence: ['dry treat'],
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

Deno.test('detectPostprandialTiming — golden: 4 rapid of 12 timed, ~8 feedings/day → fires with exact counts', () => {
  const { symptomEvents, mealEvents } = ppGolden()
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.rapidCount, 4)
  assert.equal(f.eligibleCount, 12)
  assert.equal(f.totalEpisodes, 12)
  assert.equal(f.rapidWindowMinutes, 30)
  assert.equal(f.lastTwoEligibleRapid, true)
  assert.equal(f.medianMinutesSinceFeeding, 20)
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.priorityClass, 'insight')
  assert.equal(f.associationalOnly, true)
})

Deno.test('detectPostprandialTiming — §7#2: discovered onsets are excluded from numerator AND denominator (still counted in totalEpisodes)', () => {
  const { symptomEvents, mealEvents } = ppGolden()
  // 3 EXTRA rapid-looking episodes (a feeding 20 min before each) but DISCOVERED — a
  // discovered vomit can never be "20 min after eating". If confidence were ignored
  // they'd inflate eligible 12→15 and rapid 4→7. They must not — but they DO count toward
  // the "of N total" honesty context.
  const extraSymptoms = [cVomit(13, 12, 'estimated'), cVomit(14, 12, 'window'), cVomit(15, 12, null)]
  const extraFeedings = [feeding(13, 11, 40), feeding(14, 11, 40), feeding(15, 11, 40)]
  const findings = detectPostprandialTiming(
    input({
      symptomEvents: [...symptomEvents, ...extraSymptoms],
      mealEvents: [...mealEvents, ...extraFeedings],
    }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].eligibleCount, 12, 'estimated/window/NULL onsets excluded from the denominator')
  assert.equal(findings[0].rapidCount, 4, 'estimated/window/NULL onsets excluded from the numerator')
  assert.equal(findings[0].totalEpisodes, 15, 'but they DO count toward "of N total" honesty context')
})

Deno.test('detectPostprandialTiming — §7#3: an episode under an active free_choice bowl is ineligible (free-feeding exclusion)', () => {
  const { symptomEvents, mealEvents } = ppGolden()
  // A free-fed bowl down across the whole span: "minutes since last LOGGED feeding" is
  // fiction (the pet may have grazed at any moment) → every episode ineligible → silent.
  const findings = detectPostprandialTiming(
    input({ symptomEvents, mealEvents, feedingArrangements: [arrangement('x', '2026-05-01', null, 'high')] }),
  )
  assert.equal(findings.length, 0)
})

Deno.test('detectPostprandialTiming — §7#4: a 20-treat/day grazer (4 rapid of 14) stays silent (grazing guard)', () => {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // 14 witnessed episodes (May 14..27); 4 rapid, 10 slow; 20 feedings/day. The chance base
  // rate is high (expected ≈ 5.8, threshold ≈ 11.7) so 4 observed rapid cannot clear it —
  // Sam's all-day nibbler can't trip a scary card. Recency + fraction + minRapid all pass,
  // so ONLY the grazing guard is doing the suppression.
  for (let i = 0; i < 14; i++) {
    const day = 14 + i
    symptomEvents.push(wVomit(day, 12, 0))
    if (i >= 10) mealEvents.push(feeding(day, 11, 40))
    else mealEvents.push(feeding(day, 6, 0))
    for (let h = 0; h < 19; h++) mealEvents.push(feeding(day, 0, h * 2)) // 19 earlier fillers → 20/day
  }
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 0)
})

Deno.test('detectPostprandialTiming — §7#5: rapid episodes all >14 days old stay silent (recency floor)', () => {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // 6 witnessed rapid episodes on May 1..6 — in-window (60d) and above the eligible-
  // denominator floor, but all >14 days before NOW (May 30), so none is recent enough to
  // lead. Only recency suppresses (denominator + grazing both pass).
  for (let i = 0; i < 6; i++) {
    const day = 1 + i
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(feeding(day, 11, 40))
    mealEvents.push(feeding(day, 7, 0))
  }
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 0)
})

Deno.test('detectPostprandialTiming — §7#6: a legacy NULL-confidence meal is still a valid feeding; an ESTIMATED feeding is not', () => {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // The rapid feedings carry NO occurredAtConfidence (legacy NULL) — they must still
  // anchor the "20 min after eating" timing (meals are inherently witnessed). Per loop the
  // 11:40 feeding is at an EVEN index, the 7:00 feeding at an odd index. 6 episodes (May
  // 22..27) to clear the eligible-denominator floor.
  for (let i = 0; i < 6; i++) {
    const day = 22 + i
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(meal({ occurredAt: at(day, 11, 40), foodType: 'treat', primaryProtein: 'x' })) // NULL conf
    mealEvents.push(feeding(day, 7, 0))
  }
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rapidCount, 6, 'NULL-confidence meals anchor the rapid claim')

  // Contrast: if those rapid feedings were ESTIMATED (a guessed time), they cannot anchor
  // the claim — the nearest TIMED-eligible feeding becomes the 5h-earlier one → no rapid.
  const estimated = mealEvents.map((m, idx) =>
    idx % 2 === 0 ? { ...m, occurredAtConfidence: 'estimated' as OccurredAtConfidence } : m,
  )
  assert.equal(
    detectPostprandialTiming(input({ symptomEvents, mealEvents: estimated })).length,
    0,
    'an estimated feeding time cannot anchor the rapid claim',
  )
})

Deno.test('detectPostprandialTiming — §7#7: a re-logged bout (3 rows in 2h) collapses to ONE episode (no inflated count)', () => {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // 6 rapid bouts (May 22..27); the day-27 bout is logged 3 times within 2h (< the 3h
  // episode gap). If re-logs inflated the count, rapid/total would read 8 — they must read 6.
  for (let i = 0; i < 6; i++) {
    const day = 22 + i
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(feeding(day, 11, 40))
    mealEvents.push(feeding(day, 7, 0))
  }
  symptomEvents.push(wVomit(27, 12, 50), wVomit(27, 13, 30)) // re-logs of the day-27 bout
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rapidCount, 6, 're-logs collapse: 6 bouts, not 8')
  assert.equal(findings[0].totalEpisodes, 6)
  assert.equal(findings[0].eligibleCount, 6)
})

Deno.test('detectPostprandialTiming — below the rapid FRACTION floor stays silent (3 rapid of 20 timed is noise)', () => {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  // 20 witnessed eligible episodes, only 3 rapid → fraction 0.15 < 0.25. Feeding rate is
  // low (2/day) so the grazing guard passes; the FRACTION floor is the sole suppressor.
  for (let i = 0; i < 17; i++) {
    const day = 1 + i // May 1..17, slow
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(feeding(day, 6, 0))
    mealEvents.push(feeding(day, 5, 0))
  }
  for (const day of [25, 26, 27]) {
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(feeding(day, 11, 40)) // rapid, recent
    mealEvents.push(feeding(day, 5, 0))
  }
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 0)
})

Deno.test('detectPostprandialTiming — no timed feeding in the preceding 24h → episode leaves the denominator', () => {
  // Witnessed rapid-looking episodes but the only feeding is 30h before onset → no feeding
  // in the preceding window → "time since feeding" is undefined → eligible 0 → silent.
  const symptomEvents = [wVomit(24, 12), wVomit(25, 12), wVomit(26, 12)]
  const mealEvents = [feeding(23, 6, 0), feeding(24, 6, 0), feeding(25, 6, 0)] // each 30h before next onset
  // (onset day d at 12:00; nearest feeding day d-1 at 06:00 = 30h earlier → outside 24h)
  const findings = detectPostprandialTiming(input({ symptomEvents, mealEvents }))
  assert.equal(findings.length, 0)
})

Deno.test('detectPostprandialTiming — ADVERSARIAL REGRESSION: a grazer with 3 witnessed vomits near feedings is suppressed (denominator floor, B-078/B-081)', () => {
  // The adversarial-review break: a 20-feeds/day grazer with only 3 witnessed vomits, each
  // ~10 min after a graze. The 2× grazing guard scales with eligibleCount, so at
  // eligibleCount=3 it collapses to the minRapidEpisodes floor and FIRES on a ~7% base-rate
  // coincidence. The minimum-eligible DENOMINATOR floor (6) suppresses it — "3 of 3" is too
  // small a sample to call a pattern.
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  for (const day of [25, 26, 27]) {
    symptomEvents.push(wVomit(day, 12, 0))
    mealEvents.push(feeding(day, 11, 50)) // 10 min before onset → rapid
    for (let h = 0; h < 19; h++) mealEvents.push(feeding(day, Math.floor(h / 2), (h % 2) * 30)) // 20 grazes/day
  }
  const findings = detectPostprandialTiming(input({ pet: cat, symptomEvents, mealEvents }))
  assert.equal(findings.length, 0, 'eligibleCount 3 < minEligibleEpisodes 6 → silent')
})

Deno.test('detectPostprandialTiming — the eligible-denominator floor: 5 timeable episodes is too few, 6 fires', () => {
  const build = (n: number) => {
    const symptomEvents: SymptomEvent[] = []
    const mealEvents: MealEvent[] = []
    for (let i = 0; i < n; i++) {
      const day = 22 + i // recent, distinct days
      symptomEvents.push(wVomit(day, 12, 0))
      mealEvents.push(feeding(day, 11, 40)) // 20 min before → rapid
      mealEvents.push(feeding(day, 7, 0)) // a second feeding so the rate isn't degenerate
    }
    return { symptomEvents, mealEvents }
  }
  assert.equal(detectPostprandialTiming(input(build(5))).length, 0, '5 eligible < floor → silent')
  assert.equal(detectPostprandialTiming(input(build(6))).length, 1, '6 eligible == floor → fires')
})

Deno.test('detectPostprandialTiming — within band 2, a correlation leads ⑤ (descriptive lane order, §6)', () => {
  const corr: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: 'vomit',
    protein: 'beef',
    matchedPairs: 4,
    caseExposed: 4,
    controlExposed: 1,
    discordantCaseOnly: 3,
    discordantControlOnly: 0,
    riskDifference: 0.75,
    pValue: 0.06,
    correctedAlpha: 0.01,
    symptomEventCount: 4,
    correlationWindowHours: 12,
    attributionFloor: 'high',
    associationalOnly: true,
  }
  const ranked = rankFindings([ppFinding(), corr], dog)
  assert.equal(ranked[0].finding.type, 'food_symptom_correlation', 'correlation leads the descriptive lane')
  assert.equal(ranked[1].finding.type, 'postprandial_timing')
})

Deno.test('detectPostprandialTiming — ⑤ is an INSIGHT (cap-subject), never above a co-firing safety flag', () => {
  const worsening: SymptomWorseningFinding = {
    type: 'symptom_worsening',
    priorityClass: 'safety',
    symptomType: 'vomit',
    currentCount: 4,
    priorCount: 2,
    currentDays: 4,
    priorDays: 2,
    trigger: 'more_episodes',
    tier: 'firm',
    windowDays: 7,
  }
  const ranked = rankFindings([ppFinding(), worsening], dog)
  assert.equal(ranked[0].finding.priorityClass, 'safety', 'safety always leads')
  assert.equal(ranked[1].finding.type, 'postprandial_timing')
})

Deno.test('detectSignals — end to end: a clean post-prandial pattern surfaces ⑤ as an insight card', () => {
  const { symptomEvents, mealEvents } = ppGolden()
  const ranked = detectSignals(input({ symptomEvents, mealEvents }))
  const pp = ranked.find((r) => r.finding.type === 'postprandial_timing')
  assert.ok(pp, 'the post-prandial card surfaces end to end')
  assert.equal(pp!.finding.priorityClass, 'insight')
})

// ── Detector ⑥: time-of-day clustering (B-079 — descriptive lane Phase 2) ─────
//
// The §7 ⑥ falsification fixtures, pasted as the visible AC for this build step:
//   #1 golden (non-UTC tz, exact local hours) + a DST-crossing variant
//   #2 the REQUIRED uniform-random property test (≥1,000 fixtures fire ≪5%)
//   #3 missing/invalid timezone → silent
//   #4 ⑤ fires for the symptom type → ⑥ suppressed (via detectSignals composition)
//   #5 wrap-around cluster (23:00–03:00) detected correctly
// plus the shared gates: witnessed-confidence eligibility, the minEligibleEpisodes
// denominator floor, episode-collapse, and the cluster-mass / cluster-fraction floors.

const NY = 'America/New_York' // EDT (UTC-4) in May 2026; EST (UTC-5) after Nov 1.

/** A witnessed vomit at an explicit ISO instant (for the DST + property fixtures). */
const wVomitIso = (iso: string): SymptomEvent => ({
  ...symptom('vomit', iso),
  occurredAtConfidence: 'witnessed',
})

/**
 * The ⑥ golden (§7 #1): 8 witnessed vomit episodes in May (NY = EDT, UTC-4), 5 of them in
 * the local 4–8am band (local hours 4,5,6,7,5 → UTC 8,9,10,11,9) and 3 elsewhere (local
 * 13,14,16). eligible 8, cluster 5 in [4,8) → fires; start local hour 4.
 */
function todGolden(): SymptomEvent[] {
  return [
    wVomit(20, 8), // local 4
    wVomit(21, 9), // local 5
    wVomit(22, 10), // local 6
    wVomit(23, 11), // local 7
    wVomit(24, 9), // local 5
    wVomit(25, 17), // local 13
    wVomit(26, 18), // local 14
    wVomit(27, 20), // local 16
  ]
}

const todFinding = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 4,
  clusterWindowHours: 4,
  clusterCount: 5,
  eligibleCount: 8,
  totalEpisodes: 8,
  timezone: NY,
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

Deno.test('detectTimeOfDayClustering — §7#1 golden: 5 of 8 in a local 4–8am band fires with exact local hours (non-UTC tz)', () => {
  const findings = detectTimeOfDayClustering(input({ symptomEvents: todGolden(), timezone: NY }))
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.clusterStartLocalHour, 4, 'cluster window starts at local 4am')
  assert.equal(f.clusterWindowHours, 4)
  assert.equal(f.clusterCount, 5)
  assert.equal(f.eligibleCount, 8)
  assert.equal(f.totalEpisodes, 8)
  assert.equal(f.timezone, NY)
  assert.equal(f.symptomType, 'vomit')
  assert.equal(f.priorityClass, 'insight')
  assert.equal(f.associationalOnly, true)
})

Deno.test('detectTimeOfDayClustering — §7#1 golden: DST-crossing set converts per-instant (a fixed offset would miscount)', () => {
  // 8 witnessed episodes straddling the Nov 1 2026 fall-back. The Oct-31 onset (UTC 08:00,
  // still EDT/-4 → local 4) and the Nov-5 onset (UTC 10:00, now EST/-5 → local 5) only BOTH
  // land in the 4–8am band under per-instant conversion. A naive fixed -4 would push the
  // Nov-10 onset (UTC 12:00) to local 8 (outside the band) → cluster 4, not 5. So a
  // clusterCount of 5 at start 4 is the DST-correctness assertion.
  const symptomEvents = [
    wVomitIso('2026-10-20T09:00:00.000Z'), // EDT → local 5
    wVomitIso('2026-10-28T10:00:00.000Z'), // EDT → local 6
    wVomitIso('2026-10-31T08:00:00.000Z'), // EDT → local 4
    wVomitIso('2026-11-05T10:00:00.000Z'), // EST → local 5  (post-fallback, -5)
    wVomitIso('2026-11-10T12:00:00.000Z'), // EST → local 7
    wVomitIso('2026-10-22T17:00:00.000Z'), // EDT → local 13
    wVomitIso('2026-11-07T20:00:00.000Z'), // EST → local 15
    wVomitIso('2026-11-12T23:00:00.000Z'), // EST → local 18
  ]
  const findings = detectTimeOfDayClustering(
    input({ symptomEvents, timezone: NY, now: '2026-11-15T12:00:00.000Z' }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].clusterStartLocalHour, 4)
  assert.equal(findings[0].clusterCount, 5)
  assert.equal(findings[0].eligibleCount, 8)
})

Deno.test('detectTimeOfDayClustering — §7#3: a MISSING timezone is silent (never guess UTC)', () => {
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents: todGolden() })).length, 0)
})

Deno.test('detectTimeOfDayClustering — §7#3: an INVALID timezone is silent (Intl throws → no false cluster)', () => {
  assert.equal(
    detectTimeOfDayClustering(input({ symptomEvents: todGolden(), timezone: 'Not/AZone' })).length,
    0,
  )
})

Deno.test('detectTimeOfDayClustering — §7#5: a wrap-around cluster (11pm–3am) is detected correctly', () => {
  // 5 episodes in the local 23–03 band (local hours 23,0,1,2,23) + 3 elsewhere. The episodes
  // are placed on non-adjacent UTC days so the 23:00/00:00 pair never collapses (>3h apart).
  // EDT: local h → UTC h+4. local 23 → UTC 03 (next UTC day), local 0 → UTC 04, etc.
  const symptomEvents = [
    wVomitIso('2026-05-21T03:00:00.000Z'), // May20 local 23
    wVomitIso('2026-05-22T04:00:00.000Z'), // May22 local 0
    wVomitIso('2026-05-24T05:00:00.000Z'), // May24 local 1
    wVomitIso('2026-05-26T06:00:00.000Z'), // May26 local 2
    wVomitIso('2026-05-29T03:00:00.000Z'), // May28 local 23
    wVomitIso('2026-05-15T14:00:00.000Z'), // local 10
    wVomitIso('2026-05-17T15:00:00.000Z'), // local 11
    wVomitIso('2026-05-19T16:00:00.000Z'), // local 12
  ]
  const findings = detectTimeOfDayClustering(input({ symptomEvents, timezone: NY }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].clusterStartLocalHour, 23, 'the winning window wraps from 11pm')
  assert.equal(findings[0].clusterCount, 5)
  assert.equal(findings[0].eligibleCount, 8)
})

Deno.test('detectTimeOfDayClustering — §2 witnessed gate: discovered onsets are excluded from numerator AND denominator (but counted in totalEpisodes)', () => {
  // The golden's 5 cluster episodes are downgraded to discovered (estimated/window/NULL): a
  // discovered onset's time is a guess and can't be placed on the clock → eligible drops to
  // 3 (< floor) → silent, yet totalEpisodes still sees all 8.
  const symptomEvents = [
    cVomit(20, 8, 'estimated'),
    cVomit(21, 9, 'window'),
    cVomit(22, 10, null),
    cVomit(23, 11, 'estimated'),
    cVomit(24, 9, 'window'),
    wVomit(25, 17),
    wVomit(26, 18),
    wVomit(27, 20),
  ]
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents, timezone: NY })).length, 0)
})

Deno.test('detectTimeOfDayClustering — the eligible-denominator floor: 5 timeable episodes is too few, 6 fires', () => {
  // n episodes all at local 5am (UTC 9). The whole set IS the cluster (fraction 1.0), so only
  // the minEligibleEpisodes floor decides: 5 → silent, 6 → fires.
  const build = (n: number) => {
    const out: SymptomEvent[] = []
    for (let i = 0; i < n; i++) out.push(wVomit(20 + i, 9)) // distinct days, local 5
    return out
  }
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents: build(5), timezone: NY })).length, 0)
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents: build(6), timezone: NY })).length, 1)
})

Deno.test('detectTimeOfDayClustering — below the cluster-FRACTION floor stays silent (mass passes, fraction fails)', () => {
  // 9 eligible, 5 in the local 4–8am band (mass 5 ≥ minClusterEpisodes passes) but the other
  // 4 are scattered, so the band holds only 5/9 = 0.556 < minClusterFraction (0.6) → silent.
  // ISOLATES the fraction floor (the mass floor is satisfied).
  const symptomEvents = [
    wVomit(20, 8), // local 4
    wVomit(21, 9), // local 5
    wVomit(22, 10), // local 6
    wVomit(23, 11), // local 7
    wVomit(24, 9), // local 5
    wVomit(25, 16), // local 12  (spread, all midday UTC so consecutive days never collapse)
    wVomit(26, 17), // local 13
    wVomit(27, 20), // local 16
    wVomit(28, 23), // local 19
  ]
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents, timezone: NY })).length, 0)
})

Deno.test('detectTimeOfDayClustering — below the cluster-MASS floor stays silent (fraction passes, mass fails)', () => {
  // 6 eligible, the densest 4h band holds 4 (fraction 4/6 = 0.667 ≥ minClusterFraction passes)
  // but 4 < minClusterEpisodes (5) → silent. ISOLATES the mass floor (the fraction is fine).
  // local hours {4,5,6,7, 15,16}: [4,8)=4, [13,17)=2.
  const symptomEvents = [
    wVomit(20, 8), // local 4
    wVomit(21, 9), // local 5
    wVomit(22, 10), // local 6
    wVomit(23, 11), // local 7
    wVomit(24, 19), // local 15
    wVomit(25, 20), // local 16
  ]
  assert.equal(detectTimeOfDayClustering(input({ symptomEvents, timezone: NY })).length, 0)
})

Deno.test('detectTimeOfDayClustering — tie-break: an all-same-hour cluster reports a band that STARTS on the occupied hour', () => {
  // 6 episodes all at local 7am (UTC 11). Windows [4,8),[5,9),[6,10),[7,11) all catch 6; the
  // occupied-start tie-break picks [7,11) ("between 7am and 11am") over the looser [4,8),
  // tightening the band's leading edge onto where the episodes actually are (adversarial review).
  const symptomEvents = [20, 21, 22, 23, 24, 25].map((d) => wVomit(d, 11)) // local 7
  const findings = detectTimeOfDayClustering(input({ symptomEvents, timezone: NY }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].clusterStartLocalHour, 7, 'band starts on the occupied hour, not an empty leading hour')
  assert.equal(findings[0].clusterCount, 6)
})

Deno.test('detectTimeOfDayClustering — a re-logged bout (3 rows in 2h) collapses to ONE episode (no inflated cluster)', () => {
  // 6 distinct cluster bouts at local 5am; the day-25 bout is logged 3 times within 2h (< the
  // 3h gap). If re-logs inflated the count, cluster/eligible would read 8 — they must read 6.
  const symptomEvents = [
    wVomit(20, 9),
    wVomit(21, 9),
    wVomit(22, 9),
    wVomit(23, 9),
    wVomit(24, 9),
    wVomit(25, 9, 0),
    wVomit(25, 9, 50), // re-log
    wVomit(25, 10, 30), // re-log
  ]
  const findings = detectTimeOfDayClustering(input({ symptomEvents, timezone: NY }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].clusterCount, 6, 're-logs collapse: 6 bouts, not 8')
  assert.equal(findings[0].eligibleCount, 6)
  assert.equal(findings[0].totalEpisodes, 6)
})

Deno.test('detectTimeOfDayClustering — §7#4: ⑤ fires for the symptom → ⑥ suppressed (via detectSignals composition)', () => {
  // The ⑤ golden (a schedule-fed post-prandial vomiter) clusters by clock trivially — all
  // onsets at UTC 12:00 → local 8. So ⑥ WOULD fire standalone; the §4.4 mutual exclusion
  // (⑤ wins) drops it in detectSignals.
  const { symptomEvents, mealEvents } = ppGolden()
  // Standalone, ⑥ fires (proving the suppression — not absence — explains the result).
  assert.equal(
    detectTimeOfDayClustering(input({ symptomEvents, mealEvents, timezone: NY })).length,
    1,
    '⑥ fires standalone on the clustered post-prandial pattern',
  )
  const ranked = detectSignals(input({ symptomEvents, mealEvents, timezone: NY }))
  assert.ok(
    ranked.some((r) => r.finding.type === 'postprandial_timing'),
    '⑤ fires',
  )
  assert.ok(
    !ranked.some((r) => r.finding.type === 'timeofday_clustering'),
    '⑥ is suppressed because ⑤ fired for vomit (§4.4)',
  )
})

Deno.test('detectTimeOfDayClustering — ⑥ surfaces via detectSignals when ⑤ does NOT fire (no meals → no post-prandial)', () => {
  // A NOT-meal-adjacent early-morning cluster (no feedings at all → ⑤ silent) is exactly ⑥'s
  // clinical value. It surfaces as a band-2 insight.
  const ranked = detectSignals(input({ symptomEvents: todGolden(), timezone: NY }))
  const tod = ranked.find((r) => r.finding.type === 'timeofday_clustering')
  assert.ok(tod, '⑥ surfaces end to end when ⑤ is silent')
  assert.equal(tod!.finding.priorityClass, 'insight')
})

Deno.test('detectTimeOfDayClustering — §7#2 PROPERTY TEST: ≥1,000 uniform-random onset fixtures fire ≪5%', () => {
  // The 24 sliding window positions are an implicit multiple-comparison; this is the required
  // falsification that the conservative floors keep the CHANCE fire rate well under 5%. Seeded
  // RNG so the result is deterministic. Each fixture: n∈[6,10] witnessed episodes on distinct
  // recent days (so no episode-collapse confounds), each at a uniform-random local time.
  const rng = mulberry32(0x9e3779b9)
  const nowMs = Date.parse(NOW)
  const DAY_MS = 86_400_000
  // 4000 trials per n so the per-n slice (below) is a stable estimate, not noise.
  const PER_N = 4000
  let fires = 0
  let total = 0
  const perN: Record<number, { fires: number; total: number }> = {}
  for (let n = 6; n <= 10; n++) {
    perN[n] = { fires: 0, total: 0 }
    for (let t = 0; t < PER_N; t++) {
      const days = new Set<number>()
      while (days.size < n) days.add(1 + Math.floor(rng() * 50)) // n distinct day offsets in 1..50
      const symptomEvents: SymptomEvent[] = []
      for (const d of days) {
        const ms = nowMs - d * DAY_MS + Math.floor(rng() * DAY_MS) // uniform within the day
        symptomEvents.push(wVomitIso(new Date(ms).toISOString()))
      }
      const fired = detectTimeOfDayClustering(input({ symptomEvents, timezone: NY })).length > 0
      perN[n].total++
      total++
      if (fired) {
        perN[n].fires++
        fires++
      }
    }
  }
  const pooledRate = fires / total
  // (1) The spec's §7 AC: the POOLED n=6..10 rate is ≪5%. Measured ~3.6% with the calibrated
  // floors (minClusterEpisodes 5 + minClusterFraction 0.6); the spec's listed 4/0.5 defaults
  // fire at ~21.6% here (see the DEFAULT_CONFIG.timeofday calibration note). Seed is fixed →
  // deterministic; the 4.5% bar is a guard with margin.
  assert.ok(pooledRate < 0.045, `pooled uniform-random fire rate ${(pooledRate * 100).toFixed(2)}% must be ≪5%`)
  // (2) Make the per-n residual VISIBLE, not hidden by pooling (adversarial review, B-083):
  // n=8 is the worst slice (~7.4%) because "5 of 8" (0.625) is exactly the golden — an
  // INTRINSIC residual the floors cannot remove without killing the golden. Assert each slice
  // stays under a tracked ceiling so a regression that worsens it is caught; the n=8 bound is
  // deliberately above 7.4%. (Accepted for v1: descriptive, never-reassure card — see config.)
  for (let n = 6; n <= 10; n++) {
    const r = perN[n].fires / perN[n].total
    const ceiling = n === 8 ? 0.1 : 0.05
    assert.ok(
      r < ceiling,
      `n=${n} uniform-random fire rate ${(r * 100).toFixed(2)}% exceeded its tracked ceiling ${ceiling}`,
    )
  }
})

// Deterministic mulberry32 PRNG — keeps the property test reproducible across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

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
  // Detector ④ firm-tier density floor (B-reshaped): symptoms on ≥4 of 7 days.
  assert.equal(DEFAULT_CONFIG.reflection.worseningDenseDayFloor, 4)
  // B-078 detector ⑤ floors (window science-anchored; denominator floor = adversarial fix).
  assert.equal(DEFAULT_CONFIG.postprandial.rapidWindowMinutes, 30)
  assert.equal(DEFAULT_CONFIG.postprandial.minRapidEpisodes, 3)
  assert.equal(DEFAULT_CONFIG.postprandial.minEligibleEpisodes, 6)
  assert.equal(DEFAULT_CONFIG.postprandial.minObservedToExpectedRatio, 2)
  assert.equal(DEFAULT_CONFIG.postprandial.windowDays, 60)
  // B-053 coverage-diagnostic floors.
  assert.equal(DEFAULT_CONFIG.coverage.stapleMinMeals, 4)
  // staple_washout's symptom floor MUST track ①'s Early episode floor so it only fires
  // when the staple is the sole blocker (closes the below-floor masquerade — B-053).
  assert.equal(DEFAULT_CONFIG.coverage.stapleMinSymptomEpisodes, 3)
  assert.equal(
    DEFAULT_CONFIG.coverage.stapleMinSymptomEpisodes,
    DEFAULT_CONFIG.correlation.earlyMinMatchedPairs,
    'staple-washout symptom floor must stay aligned with the correlation Early episode floor',
  )
  // B-070 dominance + copy-register floors.
  assert.equal(DEFAULT_CONFIG.coverage.stapleDominanceFraction, 0.8)
  assert.equal(DEFAULT_CONFIG.coverage.stapleSourceMajorityFraction, 0.8)
})

// ── Coverage diagnostics (B-053) ────────────────────────────────────────────
// The "why is there still no signal?" companion. v1 surfaces exactly two reasons:
// rate_meals (ACTION) and staple_washout (EXPLANATION). The clinical guardrails
// under test: staple_washout is FULLY suppressed on a diet-trial pet, never fires
// without symptoms to explain, and the action diagnostic always outranks the
// explanation.

const dietTrialDog: PetContext = { name: 'Mochi', species: 'dog', dietTrialActive: true }

/** A meal carrying BOTH a protein and an intake rating (the "rated staple" shape). */
const ratedProteinMeal = (day: number, protein: string, rating: IntakeRating): MealEvent =>
  meal({ occurredAt: at(day, 8), primaryProtein: protein, intakeRating: rating, foodType: 'meal' })

const findDiag = <T extends CoverageDiagnostic['type']>(
  diags: CoverageDiagnostic[],
  type: T,
): Extract<CoverageDiagnostic, { type: T }> | undefined =>
  diags.find((d) => d.type === type) as Extract<CoverageDiagnostic, { type: T }> | undefined

Deno.test('detectCoverage — rate_meals fires when meals are logged but too few are rated', () => {
  const mealEvents = [
    proteinMeal(20, 'chicken'),
    proteinMeal(21, 'beef'),
    proteinMeal(22, 'chicken'),
    ratedProteinMeal(23, 'chicken', 'all'), // only 1 rated; floor is 4
  ]
  const rm = findDiag(detectCoverage(input({ mealEvents })), 'rate_meals')
  assert.ok(rm, 'rate_meals present')
  assert.equal(rm!.actionability, 'action')
  assert.equal(rm!.ratedMeals, 1)
  assert.equal(rm!.ratedMealsNeeded, DEFAULT_CONFIG.intakeDecline.minRatedMealsForBaseline)
})

Deno.test('detectCoverage — rate_meals is silent once enough meals are rated (② steady, not a gap)', () => {
  const mealEvents = [
    ratedProteinMeal(20, 'chicken', 'all'),
    ratedProteinMeal(21, 'beef', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(23, 'beef', 'all'),
  ]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'rate_meals'), undefined)
})

Deno.test('detectCoverage — rate_meals does not fire when no meals are logged (not a coverage gap)', () => {
  const symptomEvents = [symptom('vomit', at(20, 8)), symptom('vomit', at(24, 8))]
  assert.equal(findDiag(detectCoverage(input({ symptomEvents })), 'rate_meals'), undefined)
})

Deno.test('detectCoverage — staple_washout explains a single-protein diet with symptoms (Nyx)', () => {
  // chicken in every (well-rated) meal → ② is fed enough (no rate_meals); ① has no contrast.
  const mealEvents = [
    ratedProteinMeal(18, 'chicken', 'all'),
    ratedProteinMeal(20, 'chicken', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(24, 'chicken', 'all'),
    ratedProteinMeal(26, 'chicken', 'all'),
  ]
  const symptomEvents = [
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(21, 8)),
    symptom('vomit', at(25, 8)),
  ]
  const diags = detectCoverage(input({ pet: dog, mealEvents, symptomEvents }))
  const sw = findDiag(diags, 'staple_washout')
  assert.ok(sw, 'staple_washout present')
  assert.equal(sw!.actionability, 'explanation')
  assert.equal(sw!.protein, 'chicken')
  assert.equal(sw!.symptomEpisodes, 3)
  // All exposures are chicken MEALS → the copy may honestly say "in most meals".
  assert.equal(sw!.stapleSource, 'meals')
  // Nyx's meals are well-rated → no rate-meals nudge, only the explanation.
  assert.equal(findDiag(diags, 'rate_meals'), undefined)
})

Deno.test('detectCoverage — B-070: dominant TREAT-borne staple fires (the real Nyx: chicken treats, tuna meals)', () => {
  // The named motivating case. Chicken arrives via many treats; her actual MEALS are
  // tuna-led. v1 (exactly-one-protein) stayed silent here; B-070 fires on ≥80% dominance
  // over ALL exposures (meals + treats) — exactly the set the case-crossover washes out.
  const mealEvents = [
    // 12 chicken treats + 2 tuna meals = chicken is 12/14 ≈ 86% of exposures → dominant.
    ...Array.from({ length: 12 }, (_, i) => proteinTreat(10 + i, 'chicken', 9)),
    ratedProteinMeal(12, 'tuna', 'all'),
    ratedProteinMeal(20, 'tuna', 'all'),
  ]
  const symptomEvents = [
    symptom('vomit', at(13, 8)),
    symptom('vomit', at(17, 8)),
    symptom('vomit', at(24, 8)),
  ]
  const sw = findDiag(detectCoverage(input({ pet: dog, mealEvents, symptomEvents })), 'staple_washout')
  assert.ok(sw, 'staple_washout fires on a dominant treat-borne staple')
  assert.equal(sw!.protein, 'chicken')
  // The copy must NOT say "every meal" — the chicken is treats, the meals are tuna. A false
  // "every meal" premise could misdirect an elimination-diet talk (the whole point of B-070).
  assert.equal(sw!.stapleSource, 'treats')
})

Deno.test('detectCoverage — B-070: a dominant staple WITH protein contrast still washes out and is explained', () => {
  // 9 chicken meals + 1 beef meal = chicken 90% → dominant. There IS contrast (① runs),
  // but chicken is concordant (in nearly every window) → washes out, beef is a single
  // exposure below the Early floor → no finding. staple_washout explains the chicken.
  const mealEvents = [
    ...Array.from({ length: 9 }, (_, i) => proteinMeal(10 + i, 'chicken')),
    proteinMeal(15, 'beef'),
  ]
  const symptomEvents = [
    symptom('vomit', at(12, 8)),
    symptom('vomit', at(16, 8)),
    symptom('vomit', at(22, 8)),
  ]
  const sw = findDiag(detectCoverage(input({ pet: dog, mealEvents, symptomEvents })), 'staple_washout')
  assert.ok(sw, 'a ≥80%-dominant staple fires even with minority contrast')
  assert.equal(sw!.protein, 'chicken')
  assert.equal(sw!.stapleSource, 'meals')
})

Deno.test('detectCoverage — B-070: NOT dominant (60/40) → silent, no false staple claim', () => {
  // 6 chicken + 4 beef = top share 60% < the 0.8 dominance floor. Neither is "most of what
  // the pet eats", so claiming a staple washout would be false. Stay silent.
  const mealEvents = [
    ...Array.from({ length: 6 }, (_, i) => proteinMeal(10 + i, 'chicken')),
    ...Array.from({ length: 4 }, (_, i) => proteinMeal(16 + i, 'beef')),
  ]
  const symptomEvents = [
    symptom('vomit', at(12, 8)),
    symptom('vomit', at(18, 8)),
    symptom('vomit', at(24, 8)),
  ]
  assert.equal(
    findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'staple_washout'),
    undefined,
    'a 60/40 split is not a dominant staple — never claim one',
  )
})

Deno.test('detectCoverage — B-070: a genuinely mixed-source staple reports stapleSource=mixed', () => {
  // Chicken dominates exposures (12 of 14 ≈ 86%) but is split evenly across meals and
  // treats (6/6) — neither kind is the ≥80% majority → the day-based "most days" register,
  // never the meal-specific claim. (beef minority keeps total exposures honest.)
  const mealEvents = [
    ...Array.from({ length: 6 }, (_, i) => proteinMeal(10 + i, 'chicken')),
    ...Array.from({ length: 6 }, (_, i) => proteinTreat(10 + i, 'chicken', 14)),
    proteinMeal(17, 'beef'),
    proteinMeal(19, 'beef'),
  ]
  const symptomEvents = [
    symptom('vomit', at(12, 8)),
    symptom('vomit', at(16, 8)),
    symptom('vomit', at(22, 8)),
  ]
  const sw = findDiag(detectCoverage(input({ pet: dog, mealEvents, symptomEvents })), 'staple_washout')
  assert.ok(sw, 'a dominant but meal/treat-split staple still fires')
  assert.equal(sw!.protein, 'chicken')
  assert.equal(sw!.stapleSource, 'mixed')
})

Deno.test('detectCoverage — staple_washout is FULLY suppressed on a diet-trial pet', () => {
  const mealEvents = [
    ratedProteinMeal(18, 'chicken', 'all'),
    ratedProteinMeal(20, 'chicken', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(24, 'chicken', 'all'),
  ]
  const symptomEvents = [
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(21, 8)),
    symptom('vomit', at(25, 8)),
  ]
  assert.equal(
    findDiag(detectCoverage(input({ pet: dietTrialDog, mealEvents, symptomEvents })), 'staple_washout'),
    undefined,
    'a constant staple on a diet-trial pet must never be flagged — that IS the elimination diet',
  )
})

Deno.test('detectCoverage — staple_washout stays silent on a balanced 50/50 diet (no protein dominates)', () => {
  // B-070: it is non-DOMINANCE that suppresses, not the mere presence of contrast. A 2-and-2
  // split tops out at 50% < the 0.8 floor — neither protein is "most of what the pet eats" —
  // so there is no staple to explain. (A ≥80%-dominant staple WITH minority contrast still
  // fires; see the B-070 dominance test above.)
  const mealEvents = [
    ratedProteinMeal(18, 'chicken', 'all'),
    ratedProteinMeal(20, 'beef', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(24, 'beef', 'all'),
  ]
  const symptomEvents = [
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(21, 8)),
    symptom('vomit', at(25, 8)),
  ]
  assert.equal(
    findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'staple_washout'),
    undefined,
  )
})

Deno.test('detectCoverage — staple_washout stays silent with no symptoms (never imply symptoms exist)', () => {
  const mealEvents = [
    ratedProteinMeal(18, 'chicken', 'all'),
    ratedProteinMeal(20, 'chicken', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(24, 'chicken', 'all'),
  ]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'staple_washout'), undefined)
})

Deno.test('detectCoverage — staple_washout needs real exposure volume before claiming a staple', () => {
  const mealEvents = [proteinMeal(22, 'chicken'), proteinMeal(24, 'chicken')] // 2 < stapleMinMeals(4)
  // Enough symptoms (≥3) that meal VOLUME is the only thing keeping staple_washout silent.
  const symptomEvents = [
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(21, 8)),
    symptom('vomit', at(23, 8)),
  ]
  assert.equal(
    findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'staple_washout'),
    undefined,
  )
})

Deno.test('detectCoverage — staple_washout stays silent below the symptom-episode floor (no below-floor masquerade)', () => {
  // A constant staple + real meal volume, but only 2 symptom episodes — below the
  // correlation Early floor (3). The staple is NOT the sole blocker (too-few-symptoms
  // is co-present, an out-of-v1 reason), so we must NOT explain it as a staple problem.
  const mealEvents = [
    ratedProteinMeal(18, 'chicken', 'all'),
    ratedProteinMeal(20, 'chicken', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(24, 'chicken', 'all'),
  ]
  const symptomEvents = [symptom('vomit', at(21, 8)), symptom('vomit', at(25, 8))] // 2 < floor 3
  assert.equal(
    findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'staple_washout'),
    undefined,
  )
})

Deno.test('detectCoverage — B-052: by-product/qualifier variants pool into one staple', () => {
  const mealEvents = [
    meal({ occurredAt: at(18, 8), primaryProtein: 'Chicken', intakeRating: 'all' }),
    meal({ occurredAt: at(20, 8), primaryProtein: 'chicken by-product meal', intakeRating: 'all' }),
    meal({ occurredAt: at(22, 8), primaryProtein: 'CHICKEN', intakeRating: 'all' }),
    meal({ occurredAt: at(24, 8), primaryProtein: 'chicken', intakeRating: 'all' }),
  ]
  const symptomEvents = [
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(21, 8)),
    symptom('vomit', at(23, 8)),
  ]
  const sw = findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'staple_washout')
  assert.ok(sw, 'variants pool to a single staple → washout is explained, not fractured')
  assert.equal(sw!.protein, 'chicken')
})

Deno.test('detectCoverage — ranks the ACTION (rate_meals) above the EXPLANATION (staple_washout)', () => {
  // A single staple (chicken), most meals unrated → BOTH diagnostics apply.
  const mealEvents = [
    proteinMeal(18, 'chicken'),
    proteinMeal(20, 'chicken'),
    proteinMeal(22, 'chicken'),
    ratedProteinMeal(24, 'chicken', 'all'), // 1 rated < floor
  ]
  const symptomEvents = [
    symptom('vomit', at(17, 8)),
    symptom('vomit', at(19, 8)),
    symptom('vomit', at(23, 8)),
  ]
  const diags = detectCoverage(input({ mealEvents, symptomEvents }))
  assert.equal(diags.length, 2)
  assert.equal(diags[0].type, 'rate_meals', 'action leads (it also activates detector ②)')
  assert.equal(diags[1].type, 'staple_washout', 'explanation follows')
})

Deno.test('rankCoverageDiagnostics — action before explanation regardless of input order', () => {
  const sw: StapleWashoutDiagnostic = {
    type: 'staple_washout',
    actionability: 'explanation',
    protein: 'chicken',
    symptomEpisodes: 2,
    stapleSource: 'meals',
  }
  const rm: RateMealsDiagnostic = {
    type: 'rate_meals',
    actionability: 'action',
    ratedMeals: 1,
    ratedMealsNeeded: 4,
  }
  const ranked = rankCoverageDiagnostics([sw, rm])
  assert.equal(ranked[0].type, 'rate_meals')
  assert.equal(ranked[1].type, 'staple_washout')
})

Deno.test('detectCoverage — empty input yields no diagnostics', () => {
  assert.deepEqual(detectCoverage(input({})), [])
})

// ── Diet-structure observations (B-080, descriptive lane Phase 3) ────────────
// Placed in the coverage lane per the §9.3 PM decision. Fixtures = spec §7
// "Diet-structure must pass". The guardrails under test: dark days never count as
// gap days (the ④ fake-rise sibling), the classification floor, FULL suppression on
// diet-trial pets, churn needs active symptoms, and the §5.2 collapse-suppresses-
// {churn, staple} curation. The copy-honesty fixture lives in lib/signalCopy.test.ts.

/** A treat-type feeding on a given day (protein null → never seen by classifyMeals). */
const treatOn = (day: number, hour = 9): MealEvent =>
  meal({ occurredAt: at(day, hour), foodType: 'treat', primaryProtein: null })

/** A meal-type feeding on a given day (varied protein so it never trips staple_washout). */
const mealOn = (day: number, protein = 'chicken', hour = 8): MealEvent =>
  meal({ occurredAt: at(day, hour), foodType: 'meal', primaryProtein: protein })

/** A first-ever-appearance food log (distinct foodItemId) for the churn fixtures. */
const novelFood = (day: number, foodItemId: string): MealEvent =>
  meal({ occurredAt: at(day, 8), foodType: 'meal', foodItemId, primaryProtein: 'chicken' })

// Six treats-only gap days (21–26) + two meal days (28–29), all inside the last-10-day
// window [May 20 12:00, May 30 12:00]. ≥80% classified (all carry a foodType).
const collapseGoldenMeals = (): MealEvent[] => [
  treatOn(21), treatOn(21, 15),
  treatOn(22), treatOn(22, 15),
  treatOn(23), treatOn(23, 15),
  treatOn(24), treatOn(24, 15),
  treatOn(25), treatOn(25, 15),
  treatOn(26), treatOn(26, 15),
  mealOn(28, 'chicken'),
  mealOn(29, 'beef'),
]

Deno.test('detectCoverage — meal_type_collapse golden: 6 treats-only days of the last 10 → fires', () => {
  const diags = detectCoverage(input({ mealEvents: collapseGoldenMeals() }))
  const c = findDiag(diags, 'meal_type_collapse')
  assert.ok(c, 'collapse present')
  assert.equal(c.gapDays, 6)
  assert.equal(c.loggedDays, 8)
  assert.equal(c.treatsPerDayMedian, 2)
  assert.equal(c.windowDays, 10)
})

Deno.test('detectCoverage — meal_type_collapse boundary: 4 gap days silent, 5 gap days fires', () => {
  const fourGap = [
    treatOn(22), treatOn(22, 15),
    treatOn(23), treatOn(23, 15),
    treatOn(24), treatOn(24, 15),
    treatOn(25), treatOn(25, 15),
    mealOn(29),
  ]
  assert.equal(findDiag(detectCoverage(input({ mealEvents: fourGap })), 'meal_type_collapse'), undefined)

  const fiveGap = [...fourGap, treatOn(26), treatOn(26, 15)]
  assert.ok(findDiag(detectCoverage(input({ mealEvents: fiveGap })), 'meal_type_collapse'))
})

Deno.test('detectCoverage — meal_type_collapse: a single stray treat is not a gap day (needs ≥2)', () => {
  // Five days with exactly ONE treat each — below minTreatsPerGapDay, so zero gap days.
  const mealEvents = [treatOn(21), treatOn(22), treatOn(23), treatOn(24), treatOn(25)]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'meal_type_collapse'), undefined)
})

Deno.test('detectCoverage — meal_type_collapse: dark days (no logging) never count as gap days', () => {
  // 4 MIXED days (a meal + treats each → not gap); the other 6 in-window days are DARK
  // (no events at all). "6 of 10 days had no meal" is vacuously true, but the engine must
  // NOT read silence as "treats-only" → silent. (The ④ fake-rise guard's sibling.)
  const mealEvents = [
    mealOn(26), treatOn(26, 15), treatOn(26, 16),
    mealOn(27), treatOn(27, 15), treatOn(27, 16),
    mealOn(28), treatOn(28, 15), treatOn(28, 16),
    mealOn(29), treatOn(29, 15), treatOn(29, 16),
  ]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'meal_type_collapse'), undefined)
})

Deno.test('detectCoverage — meal_type_collapse: below the classification floor (>20% unclassified) → silent', () => {
  // 6 genuine gap days (12 classified treats) but 4 null-foodType feedings drag the
  // classified fraction to 12/16 = 0.75 < 0.8 → the meal/treat split is unreliable, silent.
  const mealEvents = [
    ...collapseGoldenMeals().filter((m) => m.foodType === 'treat'), // the 12 treats only
    meal({ occurredAt: at(27, 10), foodType: null }),
    meal({ occurredAt: at(27, 11), foodType: null }),
    meal({ occurredAt: at(28, 10), foodType: null }),
    meal({ occurredAt: at(28, 11), foodType: null }),
  ]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'meal_type_collapse'), undefined)
})

Deno.test('detectCoverage — diet_structure is FULLY suppressed on a diet-trial pet (both observations)', () => {
  // A fixture that would fire BOTH collapse and churn on a normal pet.
  const mealEvents = [
    ...collapseGoldenMeals(),
    novelFood(18, 'NF1'), novelFood(19, 'NF2'), novelFood(20, 'NF3'),
  ]
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  const diags = detectCoverage(input({ pet: dietTrialDog, mealEvents, symptomEvents }))
  assert.equal(findDiag(diags, 'meal_type_collapse'), undefined)
  assert.equal(findDiag(diags, 'diet_churn'), undefined)
})

Deno.test('detectCoverage — diet_churn golden: 3 new foods with active symptoms → fires', () => {
  const mealEvents = [novelFood(18, 'NF1'), novelFood(19, 'NF2'), novelFood(20, 'NF3')]
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  const c = findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'diet_churn')
  assert.ok(c, 'churn present')
  assert.equal(c.novelFoodCount, 3)
  assert.equal(c.symptomEpisodesInWindow, 2)
  assert.equal(c.windowDays, 14)
})

Deno.test('detectCoverage — diet_churn is silent without symptoms in-window (never unsolicited diet advice)', () => {
  const mealEvents = [novelFood(18, 'NF1'), novelFood(19, 'NF2'), novelFood(20, 'NF3')]
  assert.equal(findDiag(detectCoverage(input({ mealEvents })), 'diet_churn'), undefined)
})

Deno.test('detectCoverage — diet_churn boundary: 2 new foods silent, 3 fires', () => {
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  const two = [novelFood(18, 'NF1'), novelFood(19, 'NF2')]
  assert.equal(findDiag(detectCoverage(input({ mealEvents: two, symptomEvents })), 'diet_churn'), undefined)
  const three = [...two, novelFood(20, 'NF3')]
  assert.ok(findDiag(detectCoverage(input({ mealEvents: three, symptomEvents })), 'diet_churn'))
})

Deno.test('detectCoverage — diet_churn: a food first seen BEFORE the window is not novel even if it reappears', () => {
  // F0 first appeared on day 9 (well before the 14-day window) and is logged again
  // in-window — it must NOT count toward novelty. Only NF1/NF2 are genuinely new → 2 < 3.
  const mealEvents = [
    novelFood(9, 'F0'),
    novelFood(20, 'F0'), // reappearance, not a first-ever
    novelFood(18, 'NF1'),
    novelFood(19, 'NF2'),
  ]
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  assert.equal(findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'diet_churn'), undefined)
})

Deno.test('detectCoverage — §5.2 curation: collapse + churn both true → ONE card (collapse), churn suppressed', () => {
  const mealEvents = [
    ...collapseGoldenMeals(),
    novelFood(18, 'NF1'), novelFood(19, 'NF2'), novelFood(20, 'NF3'),
  ]
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  const diags = detectCoverage(input({ mealEvents, symptomEvents }))
  assert.ok(findDiag(diags, 'meal_type_collapse'), 'collapse present')
  assert.equal(findDiag(diags, 'diet_churn'), undefined, 'churn suppressed by collapse (§5.2)')
})

Deno.test('detectCoverage — §5.2 curation: collapse is never co-rendered with staple_washout (collapse wins)', () => {
  // A single-protein meal stream (would fire staple_washout) PLUS treats-only days that
  // fire collapse, with enough symptoms for staple's floor. Collapse must suppress staple.
  const mealEvents = [
    // staple_washout shape: 4 chicken meals (well outside the collapse window so those
    // days aren't treats-only) — established staple, single protein.
    ratedProteinMeal(21, 'chicken', 'all'),
    ratedProteinMeal(22, 'chicken', 'all'),
    ratedProteinMeal(23, 'chicken', 'all'),
    ratedProteinMeal(24, 'chicken', 'all'),
    // collapse shape: 5 later treats-only days (25–29).
    treatOn(25), treatOn(25, 15),
    treatOn(26), treatOn(26, 15),
    treatOn(27), treatOn(27, 15),
    treatOn(28), treatOn(28, 15),
    treatOn(29), treatOn(29, 15),
  ]
  const symptomEvents = [symptom('vomit', at(20, 8)), symptom('vomit', at(21, 8)), symptom('vomit', at(23, 8))]
  const diags = detectCoverage(input({ mealEvents, symptomEvents }))
  assert.ok(findDiag(diags, 'meal_type_collapse'), 'collapse present')
  assert.equal(findDiag(diags, 'staple_washout'), undefined, 'staple suppressed by collapse (§5.2)')
})

Deno.test('rankCoverageDiagnostics — rate_meals (ACTION) still leads diet-structure observations', () => {
  const collapse: MealTypeCollapseDiagnostic = {
    type: 'meal_type_collapse', actionability: 'explanation',
    gapDays: 6, loggedDays: 8, treatsPerDayMedian: 2, windowDays: 10,
  }
  const rm: RateMealsDiagnostic = {
    type: 'rate_meals', actionability: 'action', ratedMeals: 1, ratedMealsNeeded: 4,
  }
  const ranked = rankCoverageDiagnostics([collapse, rm])
  assert.equal(ranked[0].type, 'rate_meals')
  assert.equal(ranked[1].type, 'meal_type_collapse')
})

Deno.test('detectCoverage — meal_type_collapse: window is the trailing W CALENDAR days, gapDays never exceeds windowDays', () => {
  // Adversarial-review regression: with a non-midnight `now`, a raw ms-span window
  // [now − 10d, now] straddles 11 distinct UTC calendar days, which (pre-fix) let
  // gapDays reach 11 against the literal windowDays of 10 → the impossible copy
  // "11 of the last 10 days". 11 consecutive treats-only calendar days (20–30), with
  // day-20 treats placed LATE (after the old ms-window start) so the old code would
  // have counted day 20 as an 11th gap day. The calendar-day window must exclude day 20.
  const now = at(30, 17, 30) // deliberately not midnight
  const mealEvents: MealEvent[] = [treatOn(20, 18), treatOn(20, 20)]
  for (let d = 21; d <= 30; d++) mealEvents.push(treatOn(d, 9), treatOn(d, 14))
  const c = findDiag(detectCoverage(input({ mealEvents, now })), 'meal_type_collapse')
  assert.ok(c, 'collapse present')
  assert.equal(c.windowDays, 10)
  assert.ok(c.gapDays <= c.windowDays, `gapDays ${c.gapDays} must not exceed windowDays ${c.windowDays}`)
  assert.equal(c.gapDays, 10, 'exactly the trailing 10 calendar days [21..30] count; day 20 is excluded')
  assert.equal(c.loggedDays, 10)
})

Deno.test('detectCoverage — diet_churn: a food with an unparseable timestamp row is NOT counted as novel', () => {
  // Adversarial-review regression: F0 was genuinely eaten earlier, but that earlier row
  // has a corrupt timestamp (dropped by the finite-ms filter), leaving only an in-window
  // row — which must NOT make F0 read as novel. Churn errs toward silence. With F0
  // excluded only NF1/NF2 remain (2 < 3 floor) → silent.
  const mealEvents = [
    meal({ occurredAt: 'not-a-date', foodType: 'meal', foodItemId: 'F0', primaryProtein: 'chicken' }),
    novelFood(20, 'F0'),
    novelFood(18, 'NF1'),
    novelFood(19, 'NF2'),
  ]
  const symptomEvents = [symptom('vomit', at(18, 9)), symptom('vomit', at(20, 9))]
  assert.equal(findDiag(detectCoverage(input({ mealEvents, symptomEvents })), 'diet_churn'), undefined)
})

// ── computeHumanFoodProvenance (B-102 PR 5 — off-commercial-diet covariate) ───
//
// NET-NEW clinical work (requirements §7): the engine reads `format` for the first time.
// These tests pin the covariate's HONESTY (denominator attached, numerator ≤ denominator,
// no re-log inflation), its INERTNESS to the live Signal surface (format changes nothing in
// detectSignals — no card), and the never-reassure-on-absence posture (zero is a fact over
// real coverage, returned as data, never as an all-clear).

/** A human_food-format feeding (B-102 PR 5). foodType defaults to 'treat' (people food is usually a treat). */
const humanFoodMeal = (day: number, hour = 13, over: Partial<MealEvent> = {}): MealEvent =>
  meal({ occurredAt: at(day, hour), format: HUMAN_FOOD_FORMAT, foodType: 'treat', ...over })

Deno.test('HUMAN_FOOD_FORMAT — the literal matches the migration-019 enum value', () => {
  assert.equal(HUMAN_FOOD_FORMAT, 'human_food')
})

Deno.test('computeHumanFoodProvenance — counts human-food DAYS over the logged-day denominator', () => {
  const mealEvents = [
    // human food on three distinct days, added OUT of order to prove ascending sort…
    humanFoodMeal(24),
    humanFoodMeal(20),
    humanFoodMeal(22),
    // …plus commercial meals on other days (the denominator, not the numerator).
    proteinMeal(21, 'chicken'),
    proteinMeal(23, 'chicken'),
    proteinMeal(25, 'chicken'),
  ]
  const prov = computeHumanFoodProvenance(input({ mealEvents })) as HumanFoodProvenance
  assert.notEqual(prov, null)
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-20', '2026-05-22', '2026-05-24'])
  assert.equal(prov.humanFoodFeedings, 3)
  assert.equal(prov.loggedFeedingDays, 6, 'six distinct logged days (3 human-food + 3 commercial)')
  assert.equal(prov.windowDays, DEFAULT_CONFIG.humanFood.windowDays)
  // The honesty invariant: the numerator can never exceed the denominator.
  assert.ok(prov.humanFoodDayKeys.length <= prov.loggedFeedingDays)
})

Deno.test('computeHumanFoodProvenance — re-logs collapse to ONE day; feedings counted raw (no inflation)', () => {
  // Three deli-meat treats on a single day must read as ONE human-food day, not three —
  // the same re-log-inflation guard the symptom episode collapsing applies.
  const mealEvents = [humanFoodMeal(20, 8), humanFoodMeal(20, 13), humanFoodMeal(20, 18)]
  const prov = computeHumanFoodProvenance(input({ mealEvents })) as HumanFoodProvenance
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-20'])
  assert.equal(prov.humanFoodFeedings, 3, 'raw feeding count is preserved as evidence')
  assert.equal(prov.loggedFeedingDays, 1)
})

Deno.test('computeHumanFoodProvenance — provenance is diet-wide (meal / treat / other all count)', () => {
  // Human food given as a meal, a treat, or other ALL count — provenance, not intake (D8).
  const mealEvents = [
    humanFoodMeal(20, 13, { foodType: 'meal' }),
    humanFoodMeal(21, 13, { foodType: 'treat' }),
    humanFoodMeal(22, 13, { foodType: 'other' }),
  ]
  const prov = computeHumanFoodProvenance(input({ mealEvents })) as HumanFoodProvenance
  assert.equal(prov.humanFoodDayKeys.length, 3)
  assert.equal(prov.humanFoodFeedings, 3)
})

Deno.test('computeHumanFoodProvenance — ABSENCE returns a covariate (NOT null), zero numerator over real coverage', () => {
  // No human food, but the pet is eating commercial meals. The covariate must be returned
  // (not null, not suppressed) with an EMPTY numerator and a real denominator — a logged
  // fact, never an all-clear. Reassurance-on-absence is structurally impossible (no copy).
  const mealEvents = [proteinMeal(20, 'chicken'), proteinMeal(21, 'chicken'), proteinMeal(22, 'beef')]
  const prov = computeHumanFoodProvenance(input({ mealEvents })) as HumanFoodProvenance
  assert.notEqual(prov, null)
  assert.deepEqual(prov.humanFoodDayKeys, [])
  assert.equal(prov.humanFoodFeedings, 0)
  assert.equal(prov.loggedFeedingDays, 3, 'denominator reflects real logging coverage, not 0')
})

Deno.test('computeHumanFoodProvenance — a feeding OUTSIDE the window is excluded', () => {
  // windowDays 5, now = May 30 12:00 → window floor = May 26. A human-food day on May 28 is
  // in; one on May 20 is out (and must not appear in the numerator OR the denominator).
  const cfg = { ...DEFAULT_CONFIG, humanFood: { windowDays: 5 } }
  const mealEvents = [humanFoodMeal(28), humanFoodMeal(20), proteinMeal(27, 'chicken')]
  const prov = computeHumanFoodProvenance(input({ mealEvents }), cfg) as HumanFoodProvenance
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-28'])
  assert.equal(prov.humanFoodFeedings, 1)
  assert.equal(prov.loggedFeedingDays, 2, 'only May 27 + May 28 are in-window; May 20 is excluded')
  assert.equal(prov.windowDays, 5)
})

Deno.test('computeHumanFoodProvenance — future-dated (clock-skew) and undateable rows are dropped', () => {
  const mealEvents = [
    humanFoodMeal(20), // in-window, past → counted
    humanFoodMeal(31), // May 31 > now (May 30) → future, dropped
    meal({ occurredAt: 'not-a-date', format: HUMAN_FOOD_FORMAT, foodType: 'treat' }), // undateable → dropped
  ]
  const prov = computeHumanFoodProvenance(input({ mealEvents })) as HumanFoodProvenance
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-20'])
  assert.equal(prov.humanFoodFeedings, 1)
  assert.equal(prov.loggedFeedingDays, 1, 'neither the future nor the undateable row joins the denominator')
})

Deno.test('computeHumanFoodProvenance — unparseable `now` returns null (cannot window)', () => {
  const prov = computeHumanFoodProvenance(input({ now: 'not-a-date', mealEvents: [humanFoodMeal(20)] }))
  assert.equal(prov, null)
})

Deno.test('computeHumanFoodProvenance — INERT to detectSignals: tagging meals human_food changes no finding', () => {
  // The composition-safety regression (requirements §7: "no insight card"). Hold foodType,
  // protein, timing, attribution constant and flip ONLY `format`. detectSignals must be
  // byte-identical — the covariate is read by computeHumanFoodProvenance and NOWHERE else.
  const stapleChicken = staple(1, 10, 'chicken', 9)
  const beefDays = [2, 4, 6]
  const beefNoFmt = beefDays.map((d) => pMeal(d, 'beef', 10))
  // Same meals, foodType still defaults to 'meal' — ONLY `format` differs.
  const beefHumanFmt = beefDays.map((d) => meal({ occurredAt: at(d, 10), primaryProtein: 'beef', format: HUMAN_FOOD_FORMAT }))
  const symptomEvents = [symptom('vomit', at(2, 11)), symptom('vomit', at(4, 11)), symptom('vomit', at(6, 11))]

  const withoutFmt = input({ mealEvents: [...stapleChicken, ...beefNoFmt], symptomEvents })
  const withFmt = input({ mealEvents: [...stapleChicken, ...beefHumanFmt], symptomEvents })

  const rankedWithout = detectSignals(withoutFmt)
  const rankedWith = detectSignals(withFmt)
  assert.ok(rankedWithout.length >= 1, 'fixture must produce at least one finding to make the test meaningful')
  assert.deepEqual(rankedWith, rankedWithout, 'format must be inert to every detector')

  // No finding type may ever be a human-food card (there is no such type — belt + braces).
  for (const r of rankedWith) {
    assert.ok(!String(r.finding.type).includes('human_food'), 'no human-food finding may reach the card surface')
  }

  // …yet the covariate DID read `format` on the very same input — available, just not a card.
  const prov = computeHumanFoodProvenance(withFmt) as HumanFoodProvenance
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-02', '2026-05-04', '2026-05-06'])
})

Deno.test('computeHumanFoodProvenance — non-midnight `now` + boundary feedings: numerator never exceeds denominator (the "11 of 10" guard, regression-locked)', () => {
  // Adversarial-review gap 2: the shipped suite asserted numerator ≤ denominator only on a
  // midnight-ish fixture. This pins the invariant on a NON-midnight `now` with feedings on the
  // window-boundary day and a sub-day future row — the exact shape the sibling
  // detectMealTypeCollapse "11 of the last 10 days" bug lived in.
  const cfg = { ...DEFAULT_CONFIG, humanFood: { windowDays: 5 } }
  // now = May 30 17:30 → window floor = May 26 (todayBucket - 4).
  const customNow = at(30, 17, 30)
  const mealEvents = [
    humanFoodMeal(26, 9), // boundary day, in-window → counted
    humanFoodMeal(25, 23), // May 25 23:00 — one bucket before the window → excluded
    humanFoodMeal(30, 9), // today, before `now` → counted
    humanFoodMeal(30, 20), // today but 20:00 > now 17:30 → sub-day future → excluded
    proteinMeal(27, 'chicken'),
    proteinMeal(29, 'chicken'),
  ]
  const prov = computeHumanFoodProvenance(input({ now: customNow, mealEvents }), cfg) as HumanFoodProvenance
  assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-26', '2026-05-30'])
  assert.equal(prov.humanFoodFeedings, 2)
  assert.equal(prov.loggedFeedingDays, 4, 'May 26, 27, 29, 30 in-window (May 25 excluded)')
  assert.equal(prov.windowDays, 5)
  // The "11 of 10"-class invariants, on a non-midnight now:
  assert.ok(prov.humanFoodDayKeys.length <= prov.loggedFeedingDays, 'numerator ≤ denominator')
  assert.ok(prov.humanFoodDayKeys.length <= prov.windowDays, 'numerator ≤ windowDays')
})

Deno.test('computeHumanFoodProvenance — degenerate windowDays (≤0, fractional) is clamped to a real window, never a silent empty', () => {
  // Adversarial-review gap 1: a window < 1 day is a misconfiguration. It must clamp to a 1-day
  // ("today") window — NOT silently report "no human food ever" over a 0-day span — and the
  // payload must echo the EFFECTIVE window, never the bad input. Unreachable today (config is the
  // hardcoded 60); this guards a FUTURE consumer that wires windowDays from data/UI.
  const mealEvents = [humanFoodMeal(30, 9), humanFoodMeal(20), proteinMeal(30, 'chicken')]
  for (const bad of [0, -5]) {
    const cfg = { ...DEFAULT_CONFIG, humanFood: { windowDays: bad } }
    const prov = computeHumanFoodProvenance(input({ mealEvents }), cfg) as HumanFoodProvenance
    assert.equal(prov.windowDays, 1, `windowDays ${bad} → clamped to 1 (honest, not echoed back)`)
    assert.deepEqual(prov.humanFoodDayKeys, ['2026-05-30'], 'today\'s human food still surfaces — not a silent empty')
    assert.equal(prov.humanFoodFeedings, 1)
    assert.equal(prov.loggedFeedingDays, 1)
  }
  // Fractional windows floor to whole days (5.9 → 5).
  const fracCfg = { ...DEFAULT_CONFIG, humanFood: { windowDays: 5.9 } }
  const frac = computeHumanFoodProvenance(input({ mealEvents: [humanFoodMeal(28), humanFoodMeal(20)] }), fracCfg) as HumanFoodProvenance
  assert.equal(frac.windowDays, 5)
  assert.deepEqual(frac.humanFoodDayKeys, ['2026-05-28'], 'May 28 in a floored-5-day window; May 20 out')
})
