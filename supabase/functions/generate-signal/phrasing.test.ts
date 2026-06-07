// Unit tests for the generate-signal phrasing + curation layer (B-045, Step 2).
//
// Run with:  deno test supabase/functions/generate-signal/phrasing.test.ts
//
// The detection engine is tested in detection.test.ts. This suite covers the
// Step-2 PURE logic in ./phrasing.ts that the Edge Function wraps around it —
// the parts that are clinically/voice load-bearing and must not be left to the
// LLM:
//   - templated sentences (the deterministic fallback AND the validation floor)
//   - validatePhrasing (defense-in-depth — clinical-guardrails Pattern 8)
//   - curateFindings (§3.2 cap; safety NEVER dropped)
//   - building/stale copy
// The DB reads and the live Claude call are I/O and are not unit-tested here
// (tests: integration/manual — see the function header + Manual QA Script).

import { strict as assert } from 'node:assert'
import {
  templateCorrelation,
  templateIntakeDecline,
  templateReflection,
  templateForFinding,
  validatePhrasing,
  curateFindings,
  buildBuildingText,
  SYMPTOM_LABEL,
  VISIBLE_CARD_CAP,
} from './phrasing.ts'
import type {
  CorrelationFinding,
  IntakeDeclineFinding,
  ReflectionFinding,
  ReflectionDirection,
  Finding,
  RankedFinding,
  SymptomType,
  IntakeDeclineTrigger,
} from './detection.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const correlation = (over: Partial<CorrelationFinding> = {}): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
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
  ...over,
})

const intakeDecline = (over: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding => ({
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  baselineScore: 3.6,
  recentScore: 1.5,
  daysBelowBaseline: 2,
  refusedFoodLabel: null,
  ratedMealsConsidered: 8,
  ...over,
})

const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 4,
  direction: 'flat',
  windowDays: 7,
  ...over,
})

// Reassurance / dismissive / causal vocabularies the copy must never contain.
const REASSURE = /\b(fine|okay|healthy|all clear|nothing to worry|probably fine|no concern|all good|doing great)\b/i
const DISMISSIVE = /\b(picky|fussy|finicky)\b/i
const CAUSAL = /\b(cause[sd]?|causing|because|due to|trigger|responsible for|allerg|intoleran|reacts? to|leads? to|results? in)\b/i

// ── templateCorrelation ────────────────────────────────────────────────────────

Deno.test('templateCorrelation — early read is associational, named, calm', () => {
  const t = templateCorrelation(correlation({ tier: 'early', protein: 'chicken' }), 'Mochi')
  assert.ok(t.includes('Mochi'), 'names the pet')
  assert.ok(t.includes('chicken'), 'names the protein')
  assert.ok(t.includes('vomiting'), 'plain-language symptom, not the enum')
  assert.ok(/tend(s|ed)? to follow/i.test(t), 'associational phrasing')
  assert.equal(CAUSAL.test(t), false, 'no causal language')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, correlation({ tier: 'early' })), 'own template passes validation')
})

Deno.test('templateCorrelation — established cites the matched-days sample size', () => {
  const t = templateCorrelation(
    correlation({ tier: 'established', protein: 'salmon', symptomType: 'itch', matchedPairs: 7 }),
    'Pixel',
  )
  assert.ok(t.includes('7'), 'shows the sample size')
  assert.ok(t.includes('itching'), 'plain-language derm symptom')
  assert.equal(CAUSAL.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, correlation({ tier: 'established' })))
})

// ── templateIntakeDecline (safety — never reassure, never "picky") ──────────────

Deno.test('templateIntakeDecline — consecutive-low never reassures, points to the vet', () => {
  const t = templateIntakeDecline(intakeDecline({ trigger: 'consecutive_low', daysBelowBaseline: 2 }), 'Pixel')
  assert.ok(t.includes('Pixel'))
  assert.ok(/vet/i.test(t), 'routes toward the vet')
  assert.equal(REASSURE.test(t), false, 'never reassures')
  assert.equal(DISMISSIVE.test(t), false, 'never frames as picky')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, intakeDecline()))
})

Deno.test('templateIntakeDecline — single feline day reads "today"', () => {
  const t = templateIntakeDecline(intakeDecline({ daysBelowBaseline: 1 }), 'Pixel')
  assert.ok(/today/i.test(t))
  assert.equal(REASSURE.test(t), false)
})

Deno.test('templateIntakeDecline — refused-normal-food names the food, never reassures', () => {
  const t = templateIntakeDecline(
    intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'Royal Canin Recovery' }),
    'Pixel',
  )
  assert.ok(t.includes('Royal Canin Recovery'))
  assert.equal(REASSURE.test(t), false)
  assert.equal(DISMISSIVE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, intakeDecline({ trigger: 'refused_normal_food' })))
})

// clinical-guardrails Pattern 8: the never-reassure invariant is a TEST, scanning
// every templated safety string the function can emit — not a code comment.
Deno.test('every intake-decline template — never reassures, never dismissive, no "!"', () => {
  const triggers: IntakeDeclineTrigger[] = ['consecutive_low', 'refused_normal_food']
  for (const trigger of triggers) {
    for (const days of [1, 2, 3]) {
      for (const species of ['cat', 'dog'] as const) {
        const t = templateIntakeDecline(
          intakeDecline({ trigger, daysBelowBaseline: days, species, refusedFoodLabel: 'their usual food' }),
          'Pixel',
        )
        assert.equal(REASSURE.test(t), false, `reassurance in: ${t}`)
        assert.equal(DISMISSIVE.test(t), false, `dismissive in: ${t}`)
        assert.equal(t.includes('!'), false, `exclamation in: ${t}`)
      }
    }
  }
})

// ── templateReflection (B-051 — descriptive count, never causal, never reassure) ─

Deno.test('templateReflection — flat reads "about the same", names the count, no cause/reassure', () => {
  const t = templateReflection(reflection({ direction: 'flat', currentCount: 4, priorCount: 4 }), 'Nyx')
  assert.ok(t.includes('Nyx'))
  assert.ok(t.includes('4'), 'names the count')
  assert.ok(t.includes('vomiting'), 'plain-language symptom, not the enum')
  assert.ok(/about the same/i.test(t))
  assert.equal(CAUSAL.test(t), false, 'a count is not a cause')
  assert.equal(REASSURE.test(t), false, '"same as last week" is not an all-clear')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, reflection()), 'own template passes validation')
})

Deno.test('templateReflection — improving reads "down from N", still no reassurance', () => {
  const t = templateReflection(reflection({ direction: 'improving', currentCount: 2, priorCount: 5 }), 'Nyx')
  assert.ok(/down from 5/i.test(t))
  assert.equal(CAUSAL.test(t), false)
  assert.equal(REASSURE.test(t), false, 'a falling count is still not a wellness verdict (§9)')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, reflection({ direction: 'improving' })))
})

Deno.test('templateReflection — plain-language label for every symptom type, no jargon leak', () => {
  const types: SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']
  for (const symptomType of types) {
    const t = templateReflection(reflection({ symptomType }), 'Nyx')
    assert.ok(t.includes(SYMPTOM_LABEL[symptomType]), `uses the plain label for ${symptomType}`)
    assert.equal(t.includes('!'), false)
  }
})

// clinical-guardrails Pattern 8: the never-reassure invariant as a TEST, scanning
// every reflection string the function can emit — not a code comment.
Deno.test('every reflection template — never reassures, never causal, no "!"', () => {
  const directions: ReflectionDirection[] = ['flat', 'improving']
  const types: SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']
  for (const direction of directions) {
    for (const symptomType of types) {
      for (const [current, prior] of [[3, 3], [2, 6], [1, 4]]) {
        const t = templateReflection(reflection({ direction, symptomType, currentCount: current, priorCount: prior }), 'Nyx')
        assert.equal(REASSURE.test(t), false, `reassurance in: ${t}`)
        assert.equal(CAUSAL.test(t), false, `causal in: ${t}`)
        assert.equal(t.includes('!'), false, `exclamation in: ${t}`)
      }
    }
  }
})

// ── validatePhrasing (defense in depth against model drift) ─────────────────────

Deno.test('validatePhrasing — rejects exclamation marks', () => {
  assert.equal(validatePhrasing("Pixel's vomiting has tended to follow chicken!", correlation()), false)
})

Deno.test('validatePhrasing — rejects causal claims on a correlation', () => {
  for (const bad of [
    'Chicken is causing Mochi to vomit.',
    'Mochi vomits because of the chicken.',
    "Mochi's vomiting is due to chicken.",
    'Chicken triggers Mochi\'s vomiting.',
    'Mochi may be allergic to chicken.',
    'Mochi reacts to chicken.',
  ]) {
    assert.equal(validatePhrasing(bad, correlation()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — accepts associational correlation copy', () => {
  assert.ok(validatePhrasing("Pixel's vomiting has tended to follow meals with chicken.", correlation()))
})

Deno.test('validatePhrasing — rejects reassurance / "picky" on a safety finding', () => {
  for (const bad of [
    'Pixel ate less but is probably fine.',
    'Nothing to worry about — Pixel is healthy.',
    'Pixel is just being picky this week.',
    'All clear on the eating front.',
  ]) {
    assert.equal(validatePhrasing(bad, intakeDecline()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — rejects reassurance OR a causal claim on a reflection', () => {
  for (const bad of [
    "Nyx vomited 4 times this week — about the same, so she's probably fine.", // reassurance
    'Four episodes this week, all clear otherwise.', // reassurance
    'Nyx vomited 4 times this week, likely because of the chicken.', // causal
    'Vomiting is the same as last week and due to her food.', // causal
  ]) {
    assert.equal(validatePhrasing(bad, reflection()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — accepts a plain descriptive reflection sentence', () => {
  assert.ok(
    validatePhrasing("We've logged 4 episodes of vomiting for Nyx this week — about the same as last week.", reflection()),
  )
})

// Broadened reassurance vocabulary (B-051 adversarial review): the model slipped
// wellness SYNONYMS past the original keyword list. These must now be rejected on a
// safety finding AND a reflection. (Reflections are additionally phrased template-only
// in index.ts, so the model never produces them in prod — this is defense in depth.)
Deno.test('validatePhrasing — rejects reassurance synonyms ("on the mend", "thriving", …)', () => {
  for (const bad of [
    'Pixel is on the mend this week.',
    'Pixel seems to be thriving lately.',
    'Pixel is recovering nicely.',
    'Pixel is doing well overall.',
    'Pixel looks much better than last week.',
    'Pixel is back to normal.',
  ]) {
    assert.equal(validatePhrasing(bad, intakeDecline()), false, `safety should reject: ${bad}`)
    assert.equal(validatePhrasing(bad, reflection()), false, `reflection should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — rejects too-short and too-long', () => {
  assert.equal(validatePhrasing('ok', intakeDecline()), false)
  assert.equal(validatePhrasing('x '.repeat(200), correlation()), false)
})

// A safety finding may legitimately mention "vet" and "eye on" — make sure the
// reassurance screen does not over-block a valid calm safety sentence.
Deno.test('validatePhrasing — accepts a valid calm safety sentence', () => {
  assert.ok(
    validatePhrasing(
      'Pixel has eaten less than usual the last two days — worth keeping an eye on, and a word with your vet if it carries on.',
      intakeDecline(),
    ),
  )
})

// ── curateFindings (§3.2 cap; safety never dropped) ─────────────────────────────

const ranked = (findings: Finding[]): RankedFinding[] => findings.map((finding, rank) => ({ finding, rank }))

Deno.test('curateFindings — caps the insight tail at the visible cap', () => {
  const many = ranked(
    Array.from({ length: VISIBLE_CARD_CAP + 3 }, (_, i) =>
      correlation({ protein: `protein-${i}` }),
    ),
  )
  const out = curateFindings(many)
  assert.equal(out.length, VISIBLE_CARD_CAP, 'insight set is capped')
  out.forEach((r, i) => assert.equal(r.rank, i, 'ranks are contiguous after curation'))
})

Deno.test('curateFindings — safety findings are NEVER dropped to honor the cap', () => {
  // cap+3 insights PLUS 2 safety findings. All safety must survive; insights capped.
  const findings: Finding[] = [
    intakeDecline({ trigger: 'refused_normal_food' }),
    intakeDecline({ trigger: 'consecutive_low' }),
    ...Array.from({ length: VISIBLE_CARD_CAP + 3 }, (_, i) => correlation({ protein: `p-${i}` })),
  ]
  const out = curateFindings(ranked(findings))
  const safetyKept = out.filter((r) => r.finding.priorityClass === 'safety').length
  const insightsKept = out.filter((r) => r.finding.priorityClass !== 'safety').length
  assert.equal(safetyKept, 2, 'both safety findings survive the cap')
  assert.equal(insightsKept, VISIBLE_CARD_CAP, 'insight tail still capped')
})

Deno.test('curateFindings — preserves ranked order', () => {
  const a = correlation({ protein: 'a' })
  const b = correlation({ protein: 'b' })
  const out = curateFindings(ranked([a, b]))
  assert.equal((out[0].finding as CorrelationFinding).protein, 'a')
  assert.equal((out[1].finding as CorrelationFinding).protein, 'b')
})

// ── buildBuildingText (empty findings = building/stale, never an all-clear) ─────

Deno.test('buildBuildingText — building vs stale, in voice, never an all-clear', () => {
  const building = buildBuildingText('Pixel', true)
  const stale = buildBuildingText('Pixel', false)
  for (const t of [building, stale]) {
    assert.ok(t.includes('Pixel'))
    assert.equal(t.includes('!'), false)
    assert.equal(REASSURE.test(t), false, `building copy must not reassure: ${t}`)
  }
  assert.notEqual(building, stale, 'building and stale are distinct')
  assert.ok(/recent/i.test(stale), 'stale names the recency gap')
})

// ── SYMPTOM_LABEL (plain language, never the raw clinical enum) ──────────────────

Deno.test('SYMPTOM_LABEL — every symptom has a plain-language label', () => {
  const types: SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']
  for (const t of types) {
    assert.ok(SYMPTOM_LABEL[t] && SYMPTOM_LABEL[t].length > 0, `missing label for ${t}`)
  }
  assert.equal(SYMPTOM_LABEL.diarrhea, 'loose stool', 'no clinical jargon leaks to the owner')
})

// ── templateForFinding dispatch ─────────────────────────────────────────────────

Deno.test('templateForFinding — dispatches by type', () => {
  assert.ok(templateForFinding(correlation(), 'Mochi').includes('tended to follow'))
  assert.ok(/vet/i.test(templateForFinding(intakeDecline(), 'Pixel')))
  assert.ok(/about the same as last week/i.test(templateForFinding(reflection(), 'Nyx')))
})
