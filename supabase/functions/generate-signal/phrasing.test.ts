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
  phrasingPayload,
  templateIntakeDecline,
  templateReflection,
  templateWorsening,
  templateChronicity,
  templatePostprandialTiming,
  templateEmptyStomachTiming,
  templateTimingStory,
  templateTrialResponse,
  templateTimeOfDayClustering,
  templateIncidentRedFlag,
  clockHourLabel,
  localHourBand,
  templateForFinding,
  validatePhrasing,
  hasBannedSignalVocabulary,
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
  SymptomWorseningFinding,
  WorseningTier,
  WorseningTrigger,
  SymptomChronicityFinding,
  ChronicityTier,
  PostprandialTimingFinding,
  EmptyStomachTimingFinding,
  TimingStoryFinding,
  TrialResponseFinding,
  TimeOfDayClusteringFinding,
  IncidentRedFlagFinding,
  IncidentFlagKind,
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
  proteins: ['chicken'],
  jointCandidate: false,
  jointGuidance: null,
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
  lastFullMealIso: '2026-06-10T08:00:00Z',
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

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 2,
  currentDays: 2,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 7,
  ...over,
})

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 20,
  spanDays: 42,
  activeWeeks: 6,
  symptomDays: 18,
  daysSinceLastEpisode: 0,
  firstOnsetIso: '2026-05-15T08:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
  associationalOnly: true,
  ...over,
})

const postprandial = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
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

const emptyStomach = (over: Partial<EmptyStomachTimingFinding> = {}): EmptyStomachTimingFinding => ({
  type: 'empty_stomach_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  longCount: 5,
  eligibleCount: 8,
  bandCounts: { rapid: 1, mid: 2, long: 5 },
  totalEpisodes: 9,
  longGapHours: 6,
  lastTwoEligibleLong: true,
  medianHoursSinceFeeding: 9.5,
  feedingFormsInEvidence: ['kibble'],
  clockBand: { startLocalHour: 4, windowHours: 4 },
  clockCount: 4,
  longEpisodeOnsets: [],
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

const timingStory = (over: Partial<TimingStoryFinding> = {}): TimingStoryFinding => ({
  type: 'timing_story',
  priorityClass: 'insight',
  symptomType: 'vomit',
  bandCounts: { rapid: 4, mid: 3, long: 5 },
  eligibleCount: 12,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  longGapHours: 6,
  windowDays: 60,
  rapid: { count: 4, medianMinutesSinceFeeding: 18, lastTwoEligible: true, feedingFormsInEvidence: ['dry treat'] },
  long: {
    count: 5,
    medianHoursSinceFeeding: 9.5,
    lastTwoEligible: false,
    feedingFormsInEvidence: ['kibble'],
    clockBand: { startLocalHour: 4, windowHours: 4 },
    clockCount: 4,
  },
  associationalOnly: true,
  ...over,
})

const trialResponse = (over: Partial<TrialResponseFinding> = {}): TrialResponseFinding => ({
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 29,
  targetDurationDays: 84,
  trialLoggedDays: 27,
  baselineLoggedDays: 44,
  baselineWindowDays: 49,
  pooledTrialCount: 1,
  pooledBaselineCount: 12,
  rapid: { trial: 0, baseline: 4 },
  long: { trial: 0, baseline: 5 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: 0.1, baseline: 0.3 },
  mealsPerDay: { trial: 1, baseline: 1 },
  comparisonDirection: 'fewer_during_trial',
  densityComparable: true,
  associationalOnly: true,
  trialWindowDays: 29,
  ...over,
})

const timeofday = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 4,
  clusterWindowHours: 4,
  clusterCount: 5,
  eligibleCount: 8,
  totalEpisodes: 8,
  timezone: 'America/New_York',
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

const incidentRedFlag = (over: Partial<IncidentRedFlagFinding> = {}): IncidentRedFlagFinding => ({
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['foreign_material'],
  mostRecentFlaggedIso: '2026-05-28T09:00:00.000Z',
  flaggedIncidentCount: 1,
  windowDays: 14,
  ...over,
})

// Mechanism / food vocabularies the ⑤ timing copy must never contain (§9.1/§9.2).
const MECHANISM = /\b(regurgitat|reflux|esophag|eating speed|eats? too fast|wolf|gulp|bilious)\b/i
const FOOD = /\b(chicken|beef|turkey|lamb|duck|salmon|tuna|kibble|treats?|protein)\b/i

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

// ── templateCorrelation — the JOINT candidate (B-351 slice 6, D5) ───────────────

const joint = (over: Partial<CorrelationFinding> = {}) =>
  correlation({
    protein: 'chicken and duck',
    proteins: ['chicken', 'duck'],
    jointCandidate: true,
    jointGuidance: 'feed_apart',
    ...over,
  })

Deno.test('templateCorrelation — a joint candidate names EVERY member of the cluster', () => {
  // The load-bearing property. Naming one member would credit it falsely AND exonerate the
  // other by omission — on the wedge's own surface, for the elimination-trial owner.
  for (const tier of ['early', 'established'] as const) {
    const t = templateCorrelation(joint({ tier }), 'Mochi')
    assert.ok(t.includes('chicken'), `${tier}: names chicken`)
    assert.ok(t.includes('duck'), `${tier}: names duck`)
  }
  const three = templateCorrelation(
    joint({ protein: 'beef, chicken and duck', proteins: ['beef', 'chicken', 'duck'] }),
    'Mochi',
  )
  for (const p of ['beef', 'chicken', 'duck']) assert.ok(three.includes(p), `names ${p}`)
})

Deno.test('templateCorrelation — the joint sentence ends on the ACTION, not the ambiguity (D5)', () => {
  // "We can't separate them" is a dead end for an owner; "feed one without the other" is
  // the one move that can break the collinearity.
  const t = templateCorrelation(joint(), 'Mochi')
  assert.ok(/always fed together/i.test(t), 'says why they cannot be separated')
  assert.ok(/feeding one without the other/i.test(t), 'gives the resolving action')
  assert.ok(t.trimEnd().endsWith('separate them.'), 'the action is the last thing the owner reads')
  // Deliberately "start to separate them", NOT "tell them apart": separation only registers
  // on a day the matcher picks as a case or control window, so an owner can feed them apart
  // once and see the card unchanged (adversarial review reproduced exactly that). The copy
  // must not promise a result the next regeneration may not deliver.
  assert.equal(/would tell them apart/i.test(t), false, 'no promise of an immediate result')
})

Deno.test('templateCorrelation — on an ACTIVE DIET TRIAL the joint card never says to feed them apart', () => {
  // The sharpest finding of the slice-6 adversarial pass. "Feed one without the other" is
  // an instruction to break a vet-directed elimination diet — and priorityBand PROMOTES a
  // correlation to the LEAD slot for trial pets, so the most dangerous version of this copy
  // reaches exactly the owner it can hurt most. detectStapleWashout already refuses to fire
  // on trial pets for the weaker version of this harm.
  const t = templateCorrelation(joint({ jointGuidance: 'ask_vet' }), 'Mochi')
  assert.equal(/feeding one without the other/i.test(t), false, 'never instructs a diet change')
  assert.equal(/apart/i.test(t), false, 'and not by a synonym either')
  assert.ok(/vet/i.test(t), 'routes to the person who can change a prescribed diet')
  assert.ok(t.includes('chicken') && t.includes('duck'), 'the finding itself is NOT suppressed')
})

Deno.test('templateCorrelation — an UNSET jointGuidance degrades to the safe branch, not the trial-breaking one', () => {
  // A finding cached before jointGuidance existed, or any future path that forgets to set
  // it, must not fall through to "feed them apart" for a pet that might be on a trial.
  const t = templateCorrelation(joint({ jointGuidance: null }), 'Mochi')
  assert.equal(/feeding one without the other/i.test(t), false)
  assert.ok(/vet/i.test(t))
})

Deno.test('templateCorrelation — the joint sentence is non-causal, non-reassuring, and self-validating', () => {
  for (const tier of ['early', 'established'] as const) {
    const f = joint({ tier })
    const t = templateCorrelation(f, 'Mochi')
    assert.equal(CAUSAL.test(t), false, `${tier}: never causal — and notably never "trigger"`)
    assert.equal(t.includes('!'), false)
    // It must never reassure about a member it did not blame — there is no such member.
    assert.equal(/\b(fine|okay|all clear|nothing to worry|no concern)\b/i.test(t), false)
    assert.ok(validatePhrasing(t, f), `${tier}: own template passes validation`)
  }
})

Deno.test('templateCorrelation — a single-protein finding is UNCHANGED by slice 6', () => {
  // Regression fence: the joint branch must be reachable only via jointCandidate.
  const single = correlation({ tier: 'early', protein: 'chicken', proteins: ['chicken'] })
  const t = templateCorrelation(single, 'Mochi')
  assert.equal(/always fed together/i.test(t), false)
  assert.ok(/an early pattern worth keeping an eye on/i.test(t), 'the shipped early copy, verbatim')
})

Deno.test('phrasingPayload — carries the whole cluster, so a member can never be lost in the payload', () => {
  const payload = phrasingPayload(joint(), 'Mochi') as Record<string, unknown>
  assert.deepEqual(payload.proteins, ['chicken', 'duck'])
  assert.equal(payload.protein, 'chicken and duck', 'even the scalar names both')
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

// ── templateWorsening (④ — safety frequency, tiered, never causal/reassure) ──────

Deno.test('templateWorsening — standard tier names the count rise and points to the vet', () => {
  const t = templateWorsening(worsening({ tier: 'standard', currentCount: 4, priorCount: 2 }), 'Nyx')
  assert.ok(t.includes('Nyx'))
  assert.ok(t.includes('4') && t.includes('2'), 'names both counts')
  assert.ok(t.includes('vomiting'), 'plain-language symptom, not the enum')
  assert.ok(/up from 2 last week/i.test(t))
  assert.ok(/word with your vet/i.test(t), 'routes toward the vet')
  assert.equal(CAUSAL.test(t), false, 'a frequency is not a cause')
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, worsening({ tier: 'standard' })), 'own template passes validation')
})

Deno.test('templateWorsening — standard tier with prior 0 reads "after none last week"', () => {
  const t = templateWorsening(worsening({ tier: 'standard', currentCount: 3, priorCount: 0 }), 'Nyx')
  assert.ok(/after none last week/i.test(t))
  assert.equal(REASSURE.test(t), false, '"none last week" then a rise is not reassurance')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, worsening({ tier: 'standard', priorCount: 0 })))
})

Deno.test('templateWorsening — firm tier leads with day density and the firmest calm ask', () => {
  const t = templateWorsening(
    worsening({ tier: 'firm', currentCount: 6, priorCount: 2, currentDays: 5, windowDays: 7 }),
    'Nyx',
  )
  assert.ok(/5 of the last 7 days/i.test(t), 'leads with density')
  assert.ok(/booking a vet visit soon/i.test(t), 'firmest, still-calm register')
  assert.equal(CAUSAL.test(t), false)
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, worsening({ tier: 'firm' })))
})

Deno.test('templateWorsening — FIRM via more_days on a falling count compares on DAYS, not episodes', () => {
  // The adversarial-review wart: firm reached via the more_days arm with currentCount <
  // priorCount must NOT render "(4 episodes) up from 6" (a miscount). Phrase the rise on
  // the days axis (the one that actually rose).
  const t = templateWorsening(
    worsening({ tier: 'firm', trigger: 'more_days', currentCount: 4, priorCount: 6, currentDays: 4, priorDays: 2 }),
    'Nyx',
  )
  assert.ok(/4 of the last 7 days/i.test(t), 'leads with density')
  assert.ok(/up from 2 the week before/i.test(t), 'compares on the days axis')
  assert.equal(/up from 6/.test(t), false, 'never implies an episode-count rise that did not happen')
  assert.equal(/\(4 episode/.test(t), false, 'no misleading episode parenthetical on the falling-count arm')
  assert.ok(/booking a vet visit soon/i.test(t))
  assert.equal(CAUSAL.test(t), false)
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, worsening({ tier: 'firm', trigger: 'more_days' })))
})

Deno.test('templateWorsening — soft (more_days) tier talks in days, gentlest ask', () => {
  const t = templateWorsening(
    worsening({ tier: 'soft', trigger: 'more_days', currentCount: 3, priorCount: 3, currentDays: 3, priorDays: 1 }),
    'Nyx',
  )
  assert.ok(/3 separate days/i.test(t) && /up from 1/i.test(t), 'talks in days, not episodes')
  assert.ok(/keeping an eye on/i.test(t), 'gentlest register')
  assert.equal(CAUSAL.test(t), false)
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, worsening({ tier: 'soft', trigger: 'more_days' })))
})

// clinical-guardrails Pattern 8: scan EVERY worsening string the function can emit —
// it is a safety finding, so never reassures, never dismissive, never causal, no "!".
Deno.test('every worsening template — never reassures/dismissive/causal, no "!"', () => {
  const tiers: WorseningTier[] = ['firm', 'standard', 'soft']
  const triggers: WorseningTrigger[] = ['more_episodes', 'more_days']
  const types: SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']
  for (const tier of tiers) {
    for (const trigger of triggers) {
      for (const symptomType of types) {
        for (const priorCount of [0, 2, 4]) {
          const t = templateWorsening(
            worsening({ tier, trigger, symptomType, currentCount: 5, priorCount, currentDays: 5, priorDays: 2 }),
            'Nyx',
          )
          assert.equal(REASSURE.test(t), false, `reassurance in: ${t}`)
          assert.equal(DISMISSIVE.test(t), false, `dismissive in: ${t}`)
          assert.equal(CAUSAL.test(t), false, `causal in: ${t}`)
          assert.equal(t.includes('!'), false, `exclamation in: ${t}`)
          assert.ok(validatePhrasing(t, worsening({ tier, trigger, symptomType, priorCount })), `validation failed: ${t}`)
        }
      }
    }
  }
})

Deno.test('validatePhrasing — rejects a causal claim on a worsening finding', () => {
  for (const bad of [
    'Nyx is vomiting more this week because of the chicken.',
    'The rise in vomiting is due to her new food.',
    'Nyx vomits more, likely an allergy to chicken.',
  ]) {
    assert.equal(validatePhrasing(bad, worsening()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — rejects reassurance on a worsening (safety) finding', () => {
  for (const bad of [
    'Nyx is vomiting more but is probably fine.',
    'More episodes this week, nothing to worry about.',
    'Nyx is on the mend despite the rise.',
  ]) {
    assert.equal(validatePhrasing(bad, worsening()), false, `should reject: ${bad}`)
  }
})

// ── templateChronicity (⑦ — safety duration/recurrence, tiered, never causal/reassure) ──

Deno.test('templateChronicity — the council case names duration, recurrence, count and the vet ask', () => {
  const t = templateChronicity(
    chronicity({ symptomType: 'vomit', episodeCount: 20, activeWeeks: 6, windowDays: 56, tier: 'firm' }),
    'Nyx',
  )
  assert.ok(t.includes('Nyx'))
  assert.ok(t.includes('vomiting'), 'plain-language symptom, not the enum')
  assert.ok(/6 of the last 8 weeks/i.test(t), 'honest active-weeks-over-lookback denominator')
  assert.ok(t.includes('20'), 'names the episode count')
  assert.ok(/keeps recurring over weeks/i.test(t), 'duration/recurrence framing')
  assert.ok(/booking a vet visit/i.test(t), 'firm register routes to the vet')
  assert.ok(/not a diagnosis/i.test(t), 'descriptive disclaimer')
  assert.equal(CAUSAL.test(t), false, 'a recurrence is not a cause')
  assert.equal(REASSURE.test(t), false, 'never reassures')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, chronicity()), 'own template passes validation')
})

Deno.test('templateChronicity — standard tier uses the gentler "a word with your vet" ask', () => {
  const t = templateChronicity(chronicity({ tier: 'standard', activeWeeks: 3, episodeCount: 6 }), 'Nyx')
  assert.ok(/word with your vet/i.test(t), 'standard register, still routes to the vet')
  assert.equal(/booking a vet visit/i.test(t), false, 'standard is not the firm ask')
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, chronicity({ tier: 'standard' })))
})

Deno.test('templateChronicity — anchors the first onset by month ("since {month}")', () => {
  const t = templateChronicity(chronicity({ firstOnsetIso: '2026-05-15T08:00:00.000Z' }), 'Nyx')
  assert.ok(/since May/i.test(t), 'concrete, non-clinical onset anchor')
})

// clinical-guardrails Pattern 8: scan EVERY chronicity string the function can emit — it is a
// safety finding, so never reassures, never dismissive, never causal/mechanism, no "!".
Deno.test('every chronicity template — never reassures/dismissive/causal/mechanism, no "!"', () => {
  const tiers: ChronicityTier[] = ['standard', 'firm']
  const types: SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']
  for (const tier of tiers) {
    for (const symptomType of types) {
      for (const daysSinceLastEpisode of [0, 1, 7]) {
        const t = templateChronicity(
          chronicity({ tier, symptomType, daysSinceLastEpisode, episodeCount: 8, activeWeeks: 4 }),
          'Nyx',
        )
        assert.equal(REASSURE.test(t), false, `reassurance in: ${t}`)
        assert.equal(DISMISSIVE.test(t), false, `dismissive in: ${t}`)
        assert.equal(CAUSAL.test(t), false, `causal in: ${t}`)
        assert.equal(MECHANISM.test(t), false, `mechanism in: ${t}`)
        assert.equal(FOOD.test(t), false, `food in: ${t}`)
        assert.equal(t.includes('!'), false, `exclamation in: ${t}`)
        assert.ok(validatePhrasing(t, chronicity({ tier, symptomType })), `validation failed: ${t}`)
      }
    }
  }
})

// Fixture 15 (§7) — validatePhrasing rejects causal / reassurance / mechanism / food drift on a
// chronicity sentence; the template output passes.
Deno.test('validatePhrasing — rejects causal/reassurance/mechanism drift on a chronicity finding', () => {
  for (const bad of [
    "Nyx's recurring vomiting is caused by the chicken.",
    'The chronic vomiting is due to a food intolerance.',
    "Nyx keeps vomiting but is probably fine.",
    'Weeks of vomiting — nothing to worry about.',
    'The recurring vomiting is reflux from eating too fast.',
    "Nyx's vomiting keeps following meals with salmon.",
  ]) {
    assert.equal(validatePhrasing(bad, chronicity()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — accepts the plain descriptive chronicity template', () => {
  assert.ok(validatePhrasing(templateChronicity(chronicity(), 'Nyx'), chronicity()))
})

// ── templatePostprandialTiming (⑤ — descriptive timing, B-078) ───────────────────

Deno.test('templatePostprandialTiming — states the honest denominator, names timing only, points to the vet', () => {
  const t = templatePostprandialTiming(postprandial({ rapidCount: 4, eligibleCount: 12 }), 'Nyx')
  // "4 of the 12 … we could time" — the eligible denominator, never the raw episode count.
  assert.ok(/4 of the 12/.test(t), 'cites rapid over the eligible denominator')
  assert.ok(/we could time/.test(t), 'honest "we could time" framing')
  assert.ok(/within 30 minutes of eating/.test(t))
  assert.ok(/including the last two/.test(t), 'recency salience when lastTwoEligibleRapid')
  assert.ok(/vet/i.test(t))
  // Guardrail-clean by construction: no cause, no mechanism, no food, no reassurance, no "!".
  assert.equal(MECHANISM.test(t), false, 'no mechanism word')
  assert.equal(FOOD.test(t), false, 'names no food/protein/form')
  assert.equal(CAUSAL.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, postprandial()), 'own template passes validation')
})

Deno.test('templatePostprandialTiming — drops "the last two" when they were not both rapid', () => {
  const t = templatePostprandialTiming(postprandial({ lastTwoEligibleRapid: false }), 'Nyx')
  assert.equal(/including the last two/.test(t), false)
  assert.ok(validatePhrasing(t, postprandial({ lastTwoEligibleRapid: false })))
})

Deno.test('validatePhrasing — rejects MECHANISM language on a postprandial finding (§9.2)', () => {
  for (const bad of [
    'Nyx vomited within minutes of eating, likely regurgitation.',
    'This timing points to reflux soon after meals.',
    "It looks like Nyx's eating speed is the issue.",
    'Nyx wolfs down food and brings it back up.',
  ]) {
    assert.equal(validatePhrasing(bad, postprandial()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — rejects food-naming and causal claims on a postprandial finding (§9.1)', () => {
  for (const bad of [
    '4 of 12 episodes happened soon after eating chicken.',
    'Vomiting tends to follow her dry treats within 30 minutes.',
    'The rapid episodes are caused by eating too soon.',
  ]) {
    assert.equal(validatePhrasing(bad, postprandial()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — accepts a plain timing-only postprandial sentence', () => {
  assert.ok(
    validatePhrasing(
      '4 of the 12 vomiting episodes we could time for Nyx happened within 30 minutes of eating — worth mentioning to your vet.',
      postprandial(),
    ),
  )
})

// ── templateEmptyStomachTiming + templateTimingStory (L1 / merge — Signals v2 / CUL-7) ─────

Deno.test('templateEmptyStomachTiming — states the honest denominator, names the TIMING BAND (never "empty stomach"), points to the vet', () => {
  const t = templateEmptyStomachTiming(emptyStomach({ longCount: 5, eligibleCount: 8, longGapHours: 6 }), 'Nyx')
  assert.ok(/\b5 of the 8\b/.test(t), 'honest N-of-M denominator')
  assert.ok(/6 or more hours after eating/.test(t), 'names the timing band by the gap')
  assert.ok(/vet/.test(t), 'points to the vet')
  assert.equal(MECHANISM.test(t), false, 'never "empty stomach" / "bilious" — MECHANISM_RE would trip the template')
  assert.equal(FOOD.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, emptyStomach()), 'own template passes its own validation')
})

Deno.test('templateEmptyStomachTiming — drops "the last two" when they were not both long', () => {
  const t = templateEmptyStomachTiming(emptyStomach({ lastTwoEligibleLong: false }), 'Nyx')
  assert.equal(/including the last two/.test(t), false)
  assert.ok(validatePhrasing(t, emptyStomach({ lastTwoEligibleLong: false })))
})

Deno.test('templateTimingStory — carries BOTH phenotypes count-anchored over one denominator', () => {
  const t = templateTimingStory(
    timingStory({ eligibleCount: 12, rapid: { count: 4, medianMinutesSinceFeeding: 18, lastTwoEligible: true, feedingFormsInEvidence: [] }, long: { count: 5, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [] } }),
    'Nyx',
  )
  assert.ok(/4 happened within 30 minutes of eating/.test(t), 'the rapid clause')
  assert.ok(/5 happened 6 or more hours after/.test(t), 'the long clause')
  assert.ok(/\b12\b/.test(t), 'one shared eligible denominator')
  assert.equal(MECHANISM.test(t), false)
  assert.ok(validatePhrasing(t, timingStory()))
})

Deno.test('validatePhrasing — rejects the SYNDROME name on an empty-stomach / timing_story finding (names the band, not the diagnosis)', () => {
  // The whole point of the 6h band is that it is the vet's job to call it "bilious"/"empty stomach";
  // owner copy names the timing only. These must be rejected on both L1 and the merged card.
  for (const f of [emptyStomach(), timingStory()]) {
    for (const bad of [
      'These look like classic empty stomach vomiting episodes.',
      "This is bilious vomiting from an empty stomach overnight.",
      'The long gap is caused by feeding her only once a day.',
      '5 of 8 happened long after eating her kibble.',
    ]) {
      assert.equal(validatePhrasing(bad, f), false, `${f.type} should reject: ${bad}`)
    }
  }
})

// ── templateTrialResponse (L2 — the trial-response wedge, Signals v2 / CUL-8) ─────
//
// The phrasing contract Dr. Chen ratifies: COUNT-ANCHORED, TIME-ORDERED, NEVER VERDICTED. The one-line
// server sentence states both pooled counts in time order and routes to the vet — no "working"/
// "helping"/"improvement"/"ruled out"/"clean", no cause, no food name, no assessment-point verdict.

Deno.test('templateTrialResponse — count-anchored + time-ordered, verdict-free, points to the vet', () => {
  const t = templateTrialResponse(
    trialResponse({ pooledTrialCount: 1, pooledBaselineCount: 12, trialDayNumber: 29, baselineWindowDays: 49 }),
    'Nyx',
  )
  assert.ok(/\b1 symptom episode\b/.test(t), 'the trial-era count, singular')
  assert.ok(/\b12\b/.test(t), 'the baseline count')
  assert.ok(/29 days since the trial began/.test(t), 'time-ordered on the trial day-count')
  assert.ok(/before it/.test(t), 'the baseline sits earlier in time')
  assert.ok(/vet/.test(t), 'points to the vet')
  assert.equal(t.includes('!'), false)
  // NEVER a verdict: none of the banned vocabulary, in either direction.
  assert.equal(/\b(working|helping|improvement|improving|better|worse|ruled out|clean|resolved|effective)\b/i.test(t), false)
  assert.equal(REASSURE.test(t), false)
  assert.equal(CAUSAL.test(t), false)
  assert.equal(FOOD.test(t), false)
  assert.ok(validatePhrasing(t, trialResponse()), 'own template passes its own validation')
})

Deno.test('templateTrialResponse — pluralizes the trial-era count + never says "day 1 days"', () => {
  const many = templateTrialResponse(trialResponse({ pooledTrialCount: 5 }), 'Nyx')
  assert.ok(/\b5 symptom episodes\b/.test(many), 'plural for >1')
  // A zero-count trial (the wedge's cleanest case) still reads grammatically.
  const zero = templateTrialResponse(trialResponse({ pooledTrialCount: 0 }), 'Nyx')
  assert.ok(/\b0 symptom episodes\b/.test(zero))
  assert.ok(validatePhrasing(zero, trialResponse({ pooledTrialCount: 0 })))
})

Deno.test('templateTrialResponse — the MORE direction is still verdict-free (no "worse"/"worsening")', () => {
  const t = templateTrialResponse(
    trialResponse({ comparisonDirection: 'more_during_trial', pooledTrialCount: 12, pooledBaselineCount: 1, densityComparable: false }),
    'Nyx',
  )
  // Direction-neutral copy: the reader sees 12 > 1; the sentence never labels it.
  assert.equal(/\b(worse|worsening|worsened|deteriorat)/i.test(t), false)
  assert.ok(validatePhrasing(t, trialResponse({ comparisonDirection: 'more_during_trial' })))
})

Deno.test('validatePhrasing — rejects a VERDICT on the trial (the model may not say the trial is "working"/"clean"/"ruled out")', () => {
  const f = trialResponse()
  for (const bad of [
    'The trial is clearly working — far fewer episodes now.',
    'This elimination diet is helping and things are improving.',
    "We've ruled out a food sensitivity based on the drop.",
    'Her record looks clean during the trial.',
    'She is much better and on the mend since the diet started.',
    'The new food caused the improvement.', // cause + verdict
    'Chicken is clearly the culprit that resolved on the trial diet.', // food + verdict
    'She seems fine now that the trial started.', // reassurance
  ]) {
    assert.equal(validatePhrasing(bad, f), false, `trial_response should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — a bare, honest count comparison PASSES on a trial_response finding', () => {
  const f = trialResponse()
  assert.ok(
    validatePhrasing(
      "We've logged 1 symptom episode for Nyx in the 29 days since the trial began, compared with 12 across the 7 weeks before it — worth reviewing with your vet.",
      f,
    ),
  )
})

// ── templateTimeOfDayClustering (⑥ — descriptive clock clustering, B-079) ─────────

Deno.test('clockHourLabel — plain 12-hour labels across the day, incl. midnight/noon and wrap', () => {
  assert.equal(clockHourLabel(0), '12am')
  assert.equal(clockHourLabel(4), '4am')
  assert.equal(clockHourLabel(11), '11am')
  assert.equal(clockHourLabel(12), '12pm')
  assert.equal(clockHourLabel(13), '1pm')
  assert.equal(clockHourLabel(23), '11pm')
  assert.equal(clockHourLabel(24), '12am', 'wraps')
})

Deno.test('localHourBand — renders the band, including a wrap-around window', () => {
  assert.equal(localHourBand(4, 4), 'between 4am and 8am')
  assert.equal(localHourBand(23, 4), 'between 11pm and 3am', 'wrap-around reads naturally')
  assert.equal(localHourBand(0, 4), 'between 12am and 4am')
})

Deno.test('templateTimeOfDayClustering — states the honest denominator, names the clock band only, points to the vet', () => {
  const t = templateTimeOfDayClustering(timeofday({ clusterCount: 5, eligibleCount: 8 }), 'Nyx')
  assert.ok(/5 of Nyx's 8 timed/.test(t), 'cites clustered over the timed denominator')
  assert.ok(/between 4am and 8am/.test(t), 'names the local clock band')
  assert.ok(/vet/i.test(t))
  // Guardrail-clean by construction: no cause, no mechanism, no reassurance, no "!".
  assert.equal(MECHANISM.test(t), false, 'no mechanism word (never "bilious"/"empty stomach")')
  assert.equal(CAUSAL.test(t), false)
  assert.equal(REASSURE.test(t), false)
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, timeofday()), 'own template passes validation')
})

Deno.test('templateTimeOfDayClustering — a wrap-around band renders in the sentence', () => {
  const t = templateTimeOfDayClustering(timeofday({ clusterStartLocalHour: 23 }), 'Nyx')
  assert.ok(/between 11pm and 3am/.test(t))
  assert.ok(validatePhrasing(t, timeofday({ clusterStartLocalHour: 23 })))
})

Deno.test('validatePhrasing — rejects MECHANISM / causal / reassurance on a timeofday finding (§4.5)', () => {
  for (const bad of [
    'Nyx vomits in the early morning, likely bilious empty-stomach reflux.',
    'The early-morning cluster is caused by an empty stomach overnight.',
    'These morning episodes are nothing to worry about.',
  ]) {
    assert.equal(validatePhrasing(bad, timeofday()), false, `should reject: ${bad}`)
  }
})

Deno.test('validatePhrasing — accepts a plain clock-band timeofday sentence', () => {
  assert.ok(
    validatePhrasing(
      "5 of Nyx's 8 timed vomiting episodes happened between 4am and 8am — a timing pattern worth mentioning to your vet.",
      timeofday(),
    ),
  )
})

// ── templateForFinding dispatch ─────────────────────────────────────────────────

// ── templateIncidentRedFlag (B-340 — safety; escalate-on-presence, never reassure/causal) ─────

Deno.test('templateIncidentRedFlag — names the visible flag, routes to the vet, disclaims diagnosis', () => {
  const t = templateIncidentRedFlag(incidentRedFlag({ flags: ['foreign_material'] }), 'Nyx')
  assert.ok(t.includes('Nyx'))
  assert.ok(t.includes('vomiting'), 'plain-language incident word, not the enum')
  assert.ok(/possible foreign material/i.test(t), 'names what the photo showed')
  assert.ok(/A photo you logged/i.test(t), 'attributes it to the owner-logged photo, singular')
  assert.ok(/call to your vet/i.test(t), 'escalates — routes to the vet')
  assert.ok(/not a diagnosis/i.test(t), 'descriptive disclaimer')
  assert.equal(CAUSAL.test(t), false, 'a visible finding is not a cause')
  assert.equal(REASSURE.test(t), false, 'never reassures')
  assert.equal(t.includes('!'), false)
  assert.ok(validatePhrasing(t, incidentRedFlag()), 'own template passes validation')
})

Deno.test('templateIncidentRedFlag — blood and both-flags variants, and plural (multiple incidents)', () => {
  assert.ok(/possible blood/i.test(templateIncidentRedFlag(incidentRedFlag({ flags: ['blood'] }), 'Nyx')))
  const both = templateIncidentRedFlag(incidentRedFlag({ flags: ['blood', 'foreign_material'] }), 'Nyx')
  assert.ok(/possible blood and possible foreign material/i.test(both), 'both flags, stable order')
  const plural = templateIncidentRedFlag(incidentRedFlag({ flaggedIncidentCount: 2 }), 'Nyx')
  assert.ok(/Photos you logged/i.test(plural), 'plural lead when >1 incident is flagged')
  assert.ok(/most recently on/i.test(plural), 'anchors the most-recent flagged incident')
})

Deno.test('templateIncidentRedFlag — B-364: a STOOL flag reads the NEUTRAL "stool", never "loose stool"', () => {
  const t = templateIncidentRedFlag(incidentRedFlag({ incidentType: 'stool', flags: ['blood'] }), 'Mochi')
  assert.ok(/Mochi's stool/i.test(t), 'neutral stool noun')
  assert.equal(/loose stool/i.test(t), false, 'never asserts consistency on a safety card (formed stool can bleed)')
  assert.ok(/possible blood/i.test(t))
  assert.ok(/call to your vet/i.test(t), 'escalates')
  assert.ok(/not a diagnosis/i.test(t))
  assert.ok(validatePhrasing(t, incidentRedFlag({ incidentType: 'stool', flags: ['blood'] })))
})

Deno.test('every incident-red-flag STOOL template — never reassures/dismissive/causal, no "!" (B-364)', () => {
  const flagSets: IncidentFlagKind[][] = [['blood'], ['foreign_material'], ['blood', 'foreign_material']]
  for (const flags of flagSets) {
    for (const flaggedIncidentCount of [1, 2, 5]) {
      const f = incidentRedFlag({ incidentType: 'stool', flags, flaggedIncidentCount })
      const t = templateIncidentRedFlag(f, 'Mochi')
      assert.equal(REASSURE.test(t), false, `no reassurance: ${t}`)
      assert.equal(DISMISSIVE.test(t), false, `no dismissive: ${t}`)
      assert.equal(CAUSAL.test(t), false, `no causal: ${t}`)
      assert.equal(/loose stool/i.test(t), false, `neutral noun: ${t}`)
      assert.equal(t.includes('!'), false)
      assert.ok(validatePhrasing(t, f), `validates: ${t}`)
    }
  }
})

// clinical-guardrails Pattern 8: scan EVERY red-flag string the function can emit — safety
// finding, so never reassures, never dismissive, never causal, no "!".
Deno.test('every incident-red-flag template — never reassures/dismissive/causal, no "!"', () => {
  const flagSets: IncidentFlagKind[][] = [['blood'], ['foreign_material'], ['blood', 'foreign_material']]
  for (const flags of flagSets) {
    for (const flaggedIncidentCount of [1, 2, 5]) {
      const t = templateIncidentRedFlag(incidentRedFlag({ flags, flaggedIncidentCount }), 'Mochi')
      assert.equal(REASSURE.test(t), false, `no reassurance: ${t}`)
      assert.equal(DISMISSIVE.test(t), false, `no dismissive: ${t}`)
      assert.equal(CAUSAL.test(t), false, `no causal: ${t}`)
      assert.equal(t.includes('!'), false)
      assert.ok(validatePhrasing(t, incidentRedFlag({ flags, flaggedIncidentCount })), `validates: ${t}`)
    }
  }
})

Deno.test('validatePhrasing — an incident-red-flag sentence that reassures or asserts cause is REJECTED', () => {
  // Defense-in-depth even though this path is template-only: a hypothetical model drift is caught.
  assert.equal(validatePhrasing("Nyx's vomiting is fine, nothing to worry about.", incidentRedFlag()), false)
  assert.equal(validatePhrasing('The chicken caused blood in the vomit.', incidentRedFlag()), false)
  assert.ok(
    validatePhrasing('A photo you logged of Nyx’s vomiting showed possible blood, on May 28 — worth a call to your vet.', incidentRedFlag()),
  )
})

Deno.test('templateForFinding — dispatches by type', () => {
  assert.ok(templateForFinding(correlation(), 'Mochi').includes('tended to follow'))
  assert.ok(/vet/i.test(templateForFinding(intakeDecline(), 'Pixel')))
  assert.ok(/about the same as last week/i.test(templateForFinding(reflection(), 'Nyx')))
  assert.ok(/word with your vet/i.test(templateForFinding(worsening(), 'Nyx')))
  assert.ok(/keeps recurring over weeks/i.test(templateForFinding(chronicity(), 'Nyx')))
  assert.ok(/we could time/.test(templateForFinding(postprandial(), 'Nyx')))
  assert.ok(/since the trial began/.test(templateForFinding(trialResponse(), 'Nyx')))
  assert.ok(/between 4am and 8am/.test(templateForFinding(timeofday(), 'Nyx')))
  assert.ok(/call to your vet/i.test(templateForFinding(incidentRedFlag(), 'Nyx')))
})

// ── SR-4 (B-721 §3.3): the falling-comparison density gate in templateReflection ──
// The card-face half of the gate. A FALLING reflection states "down from N last week"
// ONLY when density is comparable; when it fell, the comparison is WITHHELD (the client
// discloses why). The gate can only ever REMOVE a comparison — an ABSENT density renders
// exactly as before SR-4, so it is safe flag-on and flag-off.

Deno.test('templateReflection — falling + density comparable STILL reads "down from N"', () => {
  const t = templateReflection(
    reflection({ direction: 'improving', currentCount: 2, priorCount: 5, density: { comparable: true, currentLoggingDays: 6, priorLoggingDays: 6 } }),
    'Nyx',
  )
  assert.ok(/down from 5 last week/i.test(t))
  assert.ok(validatePhrasing(t, reflection({ direction: 'improving' })))
})

Deno.test('templateReflection — falling + density NOT comparable WITHHOLDS the comparison', () => {
  const t = templateReflection(
    reflection({ direction: 'improving', currentCount: 2, priorCount: 5, density: { comparable: false, currentLoggingDays: 3, priorLoggingDays: 6 } }),
    'Nyx',
  )
  assert.equal(/down from/i.test(t), false, 'the reassuring fall is withheld')
  assert.equal(/last week|week before/i.test(t), false, 'no week-pair comparison at all')
  assert.ok(t.includes('2'), 'this week\'s count is still stated')
  assert.ok(t.includes('vomiting'))
  assert.equal(REASSURE.test(t), false)
  assert.equal(CAUSAL.test(t), false)
  assert.ok(validatePhrasing(t, reflection({ direction: 'improving' })), 'the withheld sentence still validates')
})

Deno.test('templateReflection — ABSENT density renders the comparison byte-identically to pre-SR-4', () => {
  const before = "We've logged 2 episodes of vomiting for Nyx this week, down from 5 last week."
  const t = templateReflection(reflection({ direction: 'improving', currentCount: 2, priorCount: 5 }), 'Nyx')
  assert.equal(t, before, 'no density field ⇒ the shipped sentence, unchanged')
})

Deno.test('templateReflection — the density gate NEVER touches a flat reflection (§3.2 falling only)', () => {
  const t = templateReflection(
    reflection({ direction: 'flat', currentCount: 4, priorCount: 4, density: { comparable: false, currentLoggingDays: 3, priorLoggingDays: 7 } }),
    'Nyx',
  )
  assert.ok(/about the same as last week/i.test(t), 'a flat reflection is not a reassuring fall — never gated')
})

// ── SR-4 (§3.1): the change-clause template audit ────────────────────────────────
// Every CHANGE-CAPABLE template carries its change as a count-anchored, time-ordered
// clause (never a glyph, never a verdict word), test-pinned per template.

Deno.test('change-clause audit — a falling reflection is count-anchored and time-ordered (this week → last week)', () => {
  const t = templateReflection(reflection({ direction: 'improving', currentCount: 2, priorCount: 5 }), 'Nyx')
  assert.ok(t.includes('2') && t.includes('5'), 'both counts present')
  assert.ok(t.indexOf('this week') < t.indexOf('last week'), 'time-ordered: current before prior')
  assert.equal(hasBannedSignalVocabulary(t), false)
})

Deno.test('change-clause audit — a flat reflection carries the comparison in words', () => {
  const t = templateReflection(reflection({ direction: 'flat', currentCount: 4, priorCount: 4 }), 'Nyx')
  assert.ok(t.includes('4') && /about the same as last week/i.test(t))
  assert.equal(hasBannedSignalVocabulary(t), false)
})

Deno.test('change-clause audit — every worsening (tier × trigger) carries a counted, time-ordered prior clause', () => {
  const tiers: WorseningTier[] = ['firm', 'standard', 'soft']
  const triggers: WorseningTrigger[] = ['more_episodes', 'more_days']
  const priorClause = /up from \d+ (last week|the week before)|after none last week|up from \d+ last week/i
  for (const tier of tiers) {
    for (const trigger of triggers) {
      for (const priorCount of [0, 2]) {
        const t = templateWorsening(
          worsening({ tier, trigger, currentCount: 4, priorCount, currentDays: tier === 'firm' ? 5 : 2, priorDays: 1, windowDays: 7 }),
          'Nyx',
        )
        assert.ok(priorClause.test(t), `[${tier}/${trigger}/prior=${priorCount}] carries a prior clause: ${t}`)
        assert.equal(hasBannedSignalVocabulary(t), false, `no banned vocab: ${t}`)
        assert.equal(t.includes('!'), false)
      }
    }
  }
})

Deno.test('change-clause audit — intake-decline carries its duration ("the last N days"), its change form', () => {
  const t = templateIntakeDecline(intakeDecline({ trigger: 'consecutive_low', daysBelowBaseline: 3 }), 'Nyx')
  assert.ok(/the last three days/i.test(t))
  assert.equal(hasBannedSignalVocabulary(t), false)
})

Deno.test('change-clause audit — chronicity carries span + count, NEVER a week-pair framing (§3.2)', () => {
  const t = templateChronicity(chronicity(), 'Nyx')
  assert.ok(/of the last \d+ weeks/i.test(t), 'active-weeks-of-window denominator')
  assert.ok(/since \w+/i.test(t), 'a "since {month}" onset anchor')
  assert.equal(/last week|the week before|up from/i.test(t), false, 'never a week-over-week pair')
  assert.equal(hasBannedSignalVocabulary(t), false)
})

// ── SR-4 (§3.5): guardrail regex coverage — glyphs, percentages, on every type ────

Deno.test('hasBannedSignalVocabulary — catches direction glyphs, arrows, "slope" and percentages', () => {
  for (const bad of ['vomiting ↑ this week', 'itching ↓', 'a → b', 'up 40%', '40 percent more', 'a rising slope', 'trend -> worse']) {
    assert.equal(hasBannedSignalVocabulary(bad), true, `should flag: ${bad}`)
  }
  for (const ok of [
    "We've logged 2 episodes of vomiting for Nyx this week, down from 5 last week.",
    'During an active Apoquel course — 12 doses logged.',
    "Nyx has had vomiting on 5 of the last 7 days, up from 2 the week before — worth booking a vet visit soon.",
  ]) {
    assert.equal(hasBannedSignalVocabulary(ok), false, `should pass: ${ok}`)
  }
})

Deno.test('validatePhrasing — rejects a direction glyph or a percentage on EVERY finding type', () => {
  const findings: Finding[] = [
    correlation(), intakeDecline(), reflection(), worsening(), chronicity(), postprandial(), emptyStomach(), timingStory(), timeofday(), incidentRedFlag(),
  ]
  for (const f of findings) {
    assert.equal(validatePhrasing('Symptoms are ↑ this week for the pet.', f), false, `${f.type}: glyph rejected`)
    assert.equal(validatePhrasing('Episodes rose 25% versus the prior week for the pet.', f), false, `${f.type}: percent rejected`)
  }
})

// ── SR-4 (§3.5 / §9): the NEW owner-facing copy passes every guardrail screen ─────

Deno.test('guardrail coverage — the med-on-board line (§9) is clean of every banned screen', () => {
  // Client-rendered (SR-5) from SR-4's facts; pinned here as a forward guarantee.
  const line = 'During an active Apoquel course — 12 doses logged.'
  assert.equal(hasBannedSignalVocabulary(line), false, 'no glyph, no percentage')
  assert.equal(line.includes('!'), false)
  assert.equal(REASSURE.test(line), false, 'context, never reassurance')
  assert.equal(DISMISSIVE.test(line), false)
  assert.equal(CAUSAL.test(line), false, 'stated as fact, never as explanation (§5.4)')
})

Deno.test('guardrail coverage — the density-withheld reflection sentence is a valid, clean reflection', () => {
  const t = templateReflection(
    reflection({ direction: 'improving', currentCount: 2, priorCount: 5, density: { comparable: false, currentLoggingDays: 3, priorLoggingDays: 7 } }),
    'Nyx',
  )
  assert.ok(validatePhrasing(t, reflection({ direction: 'improving' })))
  assert.equal(hasBannedSignalVocabulary(t), false)
})

Deno.test('every template — no banned glyph/percentage vocabulary, any type (full sweep)', () => {
  const findings: Finding[] = [
    correlation(), correlation({ tier: 'established', matchedPairs: 6 }),
    correlation({ jointCandidate: true, proteins: ['chicken', 'duck'], protein: 'chicken and duck', jointGuidance: 'feed_apart' }),
    intakeDecline(), intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'the turkey' }),
    reflection({ direction: 'flat' }), reflection({ direction: 'improving' }),
    worsening({ tier: 'firm', trigger: 'more_days' }), chronicity(),
    postprandial(), emptyStomach(), emptyStomach({ lastTwoEligibleLong: false }),
    timingStory(), timeofday(), incidentRedFlag(), incidentRedFlag({ flags: ['blood', 'foreign_material'] }),
  ]
  for (const f of findings) {
    const t = templateForFinding(f, 'Nyx')
    assert.equal(hasBannedSignalVocabulary(t), false, `banned vocab in ${f.type}: ${t}`)
    assert.ok(validatePhrasing(t, f), `${f.type} template must pass its own validation: ${t}`)
  }
})
