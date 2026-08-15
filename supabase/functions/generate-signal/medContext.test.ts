// SR-4 (B-721 §5.4 + §3.3) — the medication-on-board payload decoration, offline-tested.
// Adversarial focus: the context may name a drug ONLY from doses that were actually on
// board and actually nameable, the singular "{drug}" is the most-dosed course, and the
// decoration NEVER touches a safety finding or mutates the detector's output.

import { strict as assert } from 'node:assert'
import {
  computeMedOnBoard,
  resolveDrugLabel,
  decorateFinding,
  MED_CONTEXT_WINDOW_DAYS,
  type MedDoseFact,
} from './medContext.ts'
import type {
  CorrelationFinding,
  ReflectionFinding,
  PostprandialTimingFinding,
  TimeOfDayClusteringFinding,
  TrialResponseFinding,
  IntakeDeclineFinding,
  SymptomWorseningFinding,
  SymptomChronicityFinding,
  IncidentRedFlagFinding,
  ReflectionDensity,
  MedOnBoardContext,
} from './detection.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_MS = Date.parse('2026-05-30T12:00:00.000Z')
const MS_PER_DAY = 86_400_000
// An ISO instant `daysAgo` before NOW (fractional ok).
const ago = (daysAgo: number): string => new Date(NOW_MS - daysAgo * MS_PER_DAY).toISOString()
const dose = (drugLabel: string, daysAgo: number): MedDoseFact => ({ occurredAt: ago(daysAgo), drugLabel })

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

const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 5,
  direction: 'improving',
  windowDays: 7,
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
  mid: { trial: 0, baseline: 2 },
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
  lastFullMealIso: null,
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

// ── computeMedOnBoard ───────────────────────────────────────────────────────────

Deno.test('computeMedOnBoard — no facts → null (no line)', () => {
  assert.equal(computeMedOnBoard(NOW_MS, []), null)
})

Deno.test('computeMedOnBoard — a single drug returns its label + in-window dose count (≥1)', () => {
  const ctx = computeMedOnBoard(NOW_MS, [dose('Apoquel', 1), dose('Apoquel', 3), dose('Apoquel', 10)])
  assert.deepEqual(ctx, { drugLabel: 'Apoquel', doseCount: 3 })
})

Deno.test('computeMedOnBoard — the singular {drug} is the MOST-DOSED course', () => {
  const ctx = computeMedOnBoard(NOW_MS, [
    dose('Apoquel', 1), dose('Apoquel', 2), dose('Apoquel', 3),
    dose('Metronidazole', 4),
  ])
  assert.deepEqual(ctx, { drugLabel: 'Apoquel', doseCount: 3 })
})

Deno.test('computeMedOnBoard — a tie breaks toward the most-recently-dosed course', () => {
  const ctx = computeMedOnBoard(NOW_MS, [
    dose('Amoxicillin', 20), dose('Amoxicillin', 21), // 2 doses, oldest most-recent = 20d ago
    dose('Gabapentin', 2), dose('Gabapentin', 9), // 2 doses, most-recent = 2d ago
  ])
  assert.equal(ctx?.drugLabel, 'Gabapentin')
  assert.equal(ctx?.doseCount, 2)
})

Deno.test('computeMedOnBoard — case-insensitive grouping folds one drug onto one count', () => {
  const ctx = computeMedOnBoard(NOW_MS, [dose('Apoquel', 5), dose('apoquel', 1), dose('APOQUEL', 3)])
  assert.equal(ctx?.doseCount, 3, 'three casings of one drug = one count of 3, never split')
  assert.equal(ctx?.drugLabel, 'apoquel', 'display uses the most-recent dose casing (1d ago)')
})

Deno.test('computeMedOnBoard — only doses INSIDE the context window count', () => {
  // Two in-window, one just outside MED_CONTEXT_WINDOW_DAYS.
  const ctx = computeMedOnBoard(NOW_MS, [
    dose('Prednisolone', 1),
    dose('Prednisolone', MED_CONTEXT_WINDOW_DAYS - 1),
    dose('Prednisolone', MED_CONTEXT_WINDOW_DAYS + 1), // out of window
  ])
  assert.equal(ctx?.doseCount, 2)
})

Deno.test('computeMedOnBoard — all doses out of window → null', () => {
  assert.equal(computeMedOnBoard(NOW_MS, [dose('Apoquel', 90), dose('Apoquel', 120)]), null)
})

Deno.test('computeMedOnBoard — a dose exactly at now counts; the window is inclusive of now', () => {
  assert.equal(computeMedOnBoard(NOW_MS, [dose('Apoquel', 0)])?.doseCount, 1)
})

Deno.test('computeMedOnBoard — unparseable dose time is skipped; unparseable now → null', () => {
  const ctx = computeMedOnBoard(NOW_MS, [{ occurredAt: 'not-a-date', drugLabel: 'Apoquel' }, dose('Apoquel', 2)])
  assert.equal(ctx?.doseCount, 1)
  assert.equal(computeMedOnBoard(Number.NaN, [dose('Apoquel', 1)]), null)
})

Deno.test('computeMedOnBoard — a blank drug label is never surfaced', () => {
  assert.equal(computeMedOnBoard(NOW_MS, [{ occurredAt: ago(1), drugLabel: '   ' }]), null)
})

// ── resolveDrugLabel ─────────────────────────────────────────────────────────────

Deno.test('resolveDrugLabel — regimen drug_name wins, even when a library item is present', () => {
  assert.equal(resolveDrugLabel('Apoquel 16mg', 'oclacitinib', 'Apoquel'), 'Apoquel 16mg')
})

Deno.test('resolveDrugLabel — no regimen → the library brand name', () => {
  assert.equal(resolveDrugLabel(null, 'oclacitinib', 'Apoquel'), 'Apoquel')
})

Deno.test('resolveDrugLabel — no regimen, no brand → the generic name', () => {
  assert.equal(resolveDrugLabel(undefined, 'oclacitinib', null), 'oclacitinib')
})

Deno.test('resolveDrugLabel — nothing names it → null (excluded from the context, never blank)', () => {
  assert.equal(resolveDrugLabel(null, null, null), null)
  assert.equal(resolveDrugLabel('  ', '', undefined), null, 'whitespace-only is treated as absent')
})

// ── decorateFinding ──────────────────────────────────────────────────────────────

const DENSITY: ReflectionDensity = { comparable: false, currentLoggingDays: 3, priorLoggingDays: 6 }
const MED: MedOnBoardContext = { drugLabel: 'Apoquel', doseCount: 12 }

Deno.test('decorateFinding — a reflection gets density, never medContext', () => {
  const out = decorateFinding(reflection(), DENSITY, MED) as ReflectionFinding
  assert.deepEqual(out.density, DENSITY)
  assert.equal('medContext' in out, false)
})

Deno.test('decorateFinding — a reflection with null density is returned unchanged (no key added)', () => {
  const f = reflection()
  const out = decorateFinding(f, null, MED)
  assert.equal('density' in out, false, 'absent, not undefined — byte-identical to pre-SR-4')
})

Deno.test('decorateFinding — correlation + timing + trial-response findings get medContext, never density', () => {
  // CUL-8: the trial-response lane carries a med-on-board line too — a drug on board during the trial
  // is exactly the concurrent confound the three-things-changed honesty cares about (§5.4, context-as-fact).
  for (const f of [correlation(), postprandial(), timeofday(), trialResponse()]) {
    const out = decorateFinding(f, DENSITY, MED) as CorrelationFinding
    assert.deepEqual(out.medContext, MED, `${f.type} carries the med context`)
    assert.equal('density' in out, false, `${f.type} never carries density`)
  }
})

Deno.test('decorateFinding — a null medContext leaves the finding unchanged (no key added)', () => {
  const out = decorateFinding(correlation(), DENSITY, null)
  assert.equal('medContext' in out, false)
})

Deno.test('decorateFinding — SAFETY findings never receive medContext or density (§5.4: correlation + timing only)', () => {
  for (const f of [intakeDecline(), worsening(), chronicity(), incidentRedFlag()]) {
    const out = decorateFinding(f, DENSITY, MED)
    assert.equal('medContext' in out, false, `${f.type} must not get a med line`)
    assert.equal('density' in out, false, `${f.type} must not get density`)
  }
})

Deno.test('decorateFinding — never mutates the detector output (returns a new object)', () => {
  const f = correlation()
  const out = decorateFinding(f, DENSITY, MED)
  assert.equal('medContext' in f, false, 'the input finding is untouched')
  assert.notEqual(out, f, 'a new object is returned')
})
