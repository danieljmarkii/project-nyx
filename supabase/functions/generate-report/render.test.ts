// Unit tests for the Vet Report pure HTML render layer (Build Step 9, PR 2).
//
// Run with:  deno test supabase/functions/generate-report/render.test.ts
//
// Uses Deno's built-in test runner + node:assert (bundled — no remote imports), so
// the suite runs offline in the network-restricted container, exactly like
// report.test.ts / detection.test.ts. The load-bearing target is the honesty
// invariants AT THE RENDER LAYER (spec §5) — report.ts bakes them into the data;
// these tests prove render.ts does not reintroduce them: the empty safety band
// (§5.3), present-only blood/foreign never a "0 of N" (§5.9), assessed denominators
// distinct (§5.10), adherence-never-"compliant" (§4/B-117), the verbatim free-fed
// string (§4/B-040), B-010 time ranges, no load-bearing colour (§5.8), and HTML
// escaping of owner free text. Snapshots are hand-built so the assertions are
// deterministic and do not depend on detection thresholds.

import { strict as assert } from 'node:assert'
import { renderReport, SHIPPED_STYLE } from './render.ts'
// CUL-1041 — the window-move fixtures below are built by the PRODUCTION derivation,
// so this file cannot drift from `trial.ts` without going red.
import { deriveWindowChange } from './trial.ts'
import { expectedFailure } from './expectedFailure.testutil.ts'
import { LANE_SYMPTOM_TYPES } from '../generate-signal/detection.ts'
import { REPORT_SYMPTOM_TYPES } from './report.ts'
import type {
  ReportSnapshot,
  SafetyFlag,
  SymptomAggregate,
  VomitPhenotype,
  MedicationAdherence,
  UnlinkedMedicationGroup,
  MedicationHistoryEntry,
  MedicationHistoryTable,
  SymptomLogEntry,
  ConcurrentChange,
  ConfounderExposure,
  IncidentPhoto,
  ProteinSetView,
  DietSummary,
  IntakeLogEntry,
  IntakeRating,
} from './report.ts'

/**
 * Build a ProteinSetView for a fixture (B-351 slice 5).
 *
 * Defaults to INCOMPLETE — the conservative shape, and the one most legacy rows
 * actually have. A fixture that wants the report to make a claim about what is NOT
 * in a food has to say so explicitly, which is the same asymmetry the production
 * gate enforces.
 */
function pset(proteins: string[] = [], opts: { complete?: boolean; offTrial?: string[] } = {}): ProteinSetView {
  return { proteins, complete: opts.complete ?? false, offTrial: opts.offTrial ?? [] }
}

/** Rendered text with markup removed — numbers ship inside `<span class="num">`, so a
 *  sentence assertion has to read the prose the vet reads, not the tag soup. */
function text(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

/** Page 1 only — the report is a sequence of `<section class="page">`, and "does this
 *  lead?" is a question about the first one. (Slicing at the word "Appendix" does not
 *  work: it appears in a CSS comment in <head>, long before any content.) */
function pageOne(html: string): string {
  const parts = html.split('<section class="page"')
  return parts.length > 1 ? parts[1] : html
}

/**
 * A default `ReportSnapshot['trial']` for a fixture that set `diet.trial` but does
 * not care about the trial BLOCK (B-417 PR 7).
 *
 * `diet.trial` (the protein-set view) and `snapshot.trial` (the facts) are two views
 * of one selected trial, and the render treats a `diet.trial` with no `snapshot.trial`
 * as a contradiction. Rather than edit twenty pre-PR-7 fixtures that only ever cared
 * about the protein half, `base()` synthesises this one — deliberately in the state
 * that renders the LEAST: no allowed set, so no exposure claim is made at all. A
 * fixture that wants the trial facts passes `trial:` explicitly.
 */
export function trialBlockFixture(
  over: Partial<NonNullable<ReportSnapshot['trial']>> = {},
): NonNullable<ReportSnapshot['trial']> {
  const elapsed =
    over.trialDaysElapsed ?? (over.dayCounter ?? 45) + (over.trialDaysOutsideRange?.after ?? 0)
  const elapsedStart = Math.round(
    Date.parse(`${over.startedAt ?? '2026-05-08'}T00:00:00Z`) / 86_400_000,
  )
  return {
    id: 't1',
    status: 'active',
    startedAt: '2026-05-08',
    endedAt: null,
    targetDurationDays: 56,
    vetName: null,
    indication: null,
    // B-529/R7(c): empty is the ordinary case — every trial food designated, so
    // the antigen arm ran. A fixture exercising the paused disclosure overrides it.
    antigenAttributionPaused: [],
    antigenArmDark: false,
    species: 'dog',
    trialDietLabels: [],
    dayCounter: 45,
    daysPastTarget: 0,
    rangeStartDate: '2026-05-08',
    evidenceStartDate: '2026-05-08',
    evidenceEndDate: '2026-07-02',
    rangeEndDate: '2026-07-02',
    rangeClipped: false,
    // CUL-1038 — FALSE is the ordinary fixture: a trial inside its own window, so
    // there is no second window to distinguish and no disclosure to render. A
    // fixture exercising the overrun disclosure overrides it.
    coverageClosedByOverrun: false,
    // CUL-1038 R2 — null is the ordinary fixture (no trial facts synthesised
    // here). A fixture exercising the excluded-span sentence sets it to a reading
    // WIDER than `coverage`, which is the only shape that produces one.
    gateCoverage: null,
    untrackedDaysBeforeFirstLog: 0,
    // The default is the UNTRUNCATED trial — range and trial coincide, which is
    // every first report and every client surface. A fixture exercising B-600
    // passes this explicitly.
    trialDaysOutsideRange: { before: 0, after: 0 },
    // `trialDaysElapsed` is derived at the tail of this literal so it tracks
    // `dayCounter`, rather than sitting here as a constant a fixture can contradict.
    coverage: null,
    exposures: {
      totalFeedings: 0,
      offDiet: 0,
      byRung: { derived_protein: 0, unrecognised: 0 },
      fedBeforePermitted: 0,
      unclassifiable: 0,
      items: [],
    },
    antigenTally: [],
    permittedFoods: [],
    allowedSetChangedAfterStart: false,
    allowedSetUnavailable: true,
    interpretability: 'not_yet',
    interpretabilityStatement: null,
    belowCoverageFloor: false,
    mayClaimAllMatched: true,
    mayStateRecordClean: false,
    oralRoute: [],
    arrangementExposures: [],
    intakeNotDirectlyObserved: false,
    contamination: [],
    trialDietRefusal: null,
    rangeRefusal: null,
    rangeRefusalSpansEpisodes: false,
    stoppedReason: null,
    outcome: null,
    outcomeNotes: null,
    medicationOverlap: [],
    loggingDensity: null,
    challengeWindowDays: 14,
    challengeMarkerBaseRatePct: 0,
    ...over,
    // Untruncated ⇒ the trial's elapsed length IS the day counter. Derived here so a
    // fixture only has to set `dayCounter`, and so no fixture can silently carry a
    // `trialDaysElapsed` that contradicts it.
    trialDaysElapsed: elapsed,
    // B-613 — the elapsed SPAN, derived from `startedAt` + the length above for the same
    // reason: `elapsedEnd - elapsedStart + 1 === trialDaysElapsed` is an identity in the
    // production builder, so a fixture that could break it would be testing a shape the
    // report cannot produce.
    elapsedStartDayIndex: over.elapsedStartDayIndex ?? elapsedStart,
    elapsedEndDayIndex: over.elapsedEndDayIndex ?? elapsedStart + Math.max(0, elapsed - 1),
    // CUL-1041 — the default is a window that NEVER MOVED, so every pre-existing
    // assertion in this file keeps describing the report it described before. It is
    // taken after the spread for the same reason the two elapsed indices are: `over`
    // carries `windowChange?: TrialWindowChange | null`, and an explicit `null` in an
    // override must survive rather than be re-defaulted by a `??` on the left.
    windowChange: over.windowChange ?? null,
  }
}

// ── A complete, neutral base snapshot; each test overrides only what it exercises ──
function base(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  const snap = baseSnapshot(overrides)
  // Keep the two views of the trial in lockstep unless a test says otherwise.
  if (overrides.trial === undefined) {
    snap.trial = snap.diet.trial ? trialBlockFixture({ startedAt: snap.diet.trial.startedAt }) : null
  }
  return snap
}

function baseSnapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    // CUL-975 — the default is the COMPLETE record, so every existing assertion in this
    // file keeps describing a report with no truncation disclosure on it; the tests that
    // want the disclosure override it and say so.
    incompletePulls: [],
    generatedAt: '2026-07-02T12:00:00Z',
    timezone: 'America/New_York',
    scope: {
      basis: 'fallback_90d',
      startDate: '2026-04-03',
      endDate: '2026-07-02',
      startDayNum: 20546,
      endDayNum: 20636,
      windowDays: 91,
      detectionNowIso: '2026-07-02T12:00:00Z',
      lastVisitDate: null,
      trialStartDate: null,
      isCustomOverride: false,
      outOfWindowSymptomCount: 0,
      outOfWindowMostRecent: null,
      outOfWindowMostRecentType: null,
      outOfWindowBefore: 0,
      outOfWindowAfter: 0,
      trialCropSymptoms: null,
    },
    signalment: {
      name: 'Nyx',
      species: 'cat',
      breed: 'Domestic Shorthair',
      sex: 'female',
      neuterStatus: 'neutered',
      ageYears: 6,
      ageMonths: 2,
      dateOfBirth: '2020-04-01',
      dateOfBirthPrecision: 'exact',
      ownerName: 'Daniel Mark',
      latestWeight: null,
      // CUL-979 — null is "unknown", the shape of every pre-R-5 fixture; the household
      // cases set their own.
      household: null,
    },
    clinicalQuestion: { question: 'symptom_monitoring', primarySymptom: null },
    safetyFlags: [],
    weight: { isEmpty: true, latest: null, trend: null },
    atAGlance: {
      primarySymptom: null,
      totalSymptomIncidents: 0,
      anySymptomDays: 0,
      windowDays: 91,
      loggedDays: 0,
      trialDaysLogged: null,
      weightState: 'empty',
      sinceOnsetDays: null,
      daysSinceLastEpisode: null,
      loggedDaysSinceLastEpisode: null,
      firstHalfLoggedDays: 0,
      secondHalfLoggedDays: 0,
    },
    symptoms: [],
    vomitPhenotype: null,
    stool: null,
    trial: null,
    diet: {
      trialTargetProtein: null,
      trial: null,
      freeFed: [],
      intakeNotDirectlyObserved: false,
      mealCompletion: null,
      mealItems: [],
      treats: { count: 0, distinctItems: 0 },
      humanFood: { count: 0, days: 0, items: [] },
      previousDiet: null,
      medicationVehicles: null,
    },
    medications: [],
    unlinkedMedications: [],
    medicationHistory: null,
    correlation: { established: [], hasEstablished: false, noThreshold: true, stapleProtein: null, timing: [] },
    concurrentChanges: [],
    proteinTimeline: {
      weekStartDates: [],
      proteins: [],
      bins: [],
      unknownByWeek: [],
      mealDaysByBucket: [],
      feedingsByWeek: [],
      totalByProtein: {},
      hasUnknown: false,
      totalFeedings: 0,
      incompleteFeedings: 0,
      humanFoodFeedings: 0,
      incompleteHumanFoodFeedings: 0,
      packagedReadable: 0,
      packagedUnread: 0,
    },
    provenance: {
      ownerReported: true,
      totalSymptomIncidents: 0,
      estimatedOrWindowCount: 0,
      deletedExcluded: true,
      uncategorisedObservations: 0,
      symptomLog: [],
      intakeLog: [],
      intakeLogHiddenOlder: 0,
      intakeLogScope: null,
      confounders: [],
      proteinExposureTally: {}, proteinUnknownCount: 0,
      conditions: [],
    },
    incidentPhotos: [],
    incidentPhotosRemoved: [],
    // CUL-875 — null is the shape of "this account never answered", which is every
    // pre-N-6 fixture. The Noticed cases build their own block.
    noticed: null,
    ...overrides,
  }
}

function aggregate(over: Partial<SymptomAggregate> & { type: SymptomAggregate['type'] }): SymptomAggregate {
  return {
    type: over.type,
    count: over.count ?? 1,
    symptomDays: over.symptomDays ?? 1,
    windowDays: over.windowDays ?? 91,
    loggedDays: over.loggedDays ?? 30,
    firstOnset: over.firstOnset ?? '2026-05-01T14:00:00Z',
    lastOnset: over.lastOnset ?? '2026-06-01T14:00:00Z',
    weeklyBuckets: over.weeklyBuckets ?? [1],
    bucketStartDates: over.bucketStartDates ?? ['2026-04-03'],
    // Default: every bucket observed. A fixture exercising the unobserved-week rendering
    // (B-532) states its own zeros — the honest default is "the owner was logging", because
    // an accidental 0 here would silently turn every fixture's chart into a no-data chart.
    loggedDaysByBucket:
      over.loggedDaysByBucket ?? (over.weeklyBuckets ?? [1]).map(() => 7),
    // B-532 — the delta no longer derives itself from `weeklyBuckets`, so a fixture that
    // wants one states it. Default null (no delta), which is the honest default for a
    // hand-built aggregate: the halves are a window partition, not a property of the bars.
    trendHalves: over.trendHalves ?? null,
  }
}

function med(over: Partial<MedicationAdherence>): MedicationAdherence {
  return {
    regimenId: 'reg-1',
    drugName: 'Metronidazole',
    strength: '250 mg',
    doseAmount: '250 mg',
    route: 'mouth',
    dosesPerDay: 2,
    scheduleNotes: 'every 12 h',
    indication: 'GI signs',
    startedAt: '2026-05-08',
    endedAt: null,
    status: 'active',
    isSupplement: false,
    overlapsWindow: true,
    adherenceState: 'tracked',
    elapsedDaysInWindow: 45,
    daysWithDose: 41,
    doseDays: [],
    prescribedDoses: 90,
    lifetimeDosesLogged: 82,
    lifetimeFirstDoseDay: null,
    lifetimeLastDoseDay: null,
    lifetimeDoseDayCount: 0,
    windowDosesLogged: 82,
    windowDosesTotal: 90,
    courseEnded: false,
    givenDoses: 82,
    partialDoses: 0,
    missedDoses: 0,
    refusedDoses: 0,
    unconfirmedDoses: 8,
    ...over,
  }
}

function logEntry(over: Partial<SymptomLogEntry> & { type: string; occurredAt: string }): SymptomLogEntry {
  return {
    eventId: over.eventId ?? 'ev-1',
    type: over.type,
    occurredAt: over.occurredAt,
    occurredAtConfidence: over.occurredAtConfidence ?? 'witnessed',
    occurredAtEarliest: over.occurredAtEarliest ?? null,
    occurredAtLatest: over.occurredAtLatest ?? null,
    loggedAt: over.loggedAt ?? over.occurredAt,
    photoRemoved: over.photoRemoved ?? false,
    severity: over.severity ?? null,
    notes: over.notes ?? null,
    dupCount: over.dupCount ?? 1,
    phenotype: over.phenotype ?? null,
  }
}

const emptyPhenotype = (over: Partial<VomitPhenotype> = {}): VomitPhenotype => ({
  totalIncidents: 9,
  withAnalysis: 8,
  states: { completed: 8, uncertain: 0, failed: 1, pending: 0 },
  assessedCount: 8,
  contentsMix: { food: 2, bile: 6, hairball: 0, foam_liquid: 0, grass: 0, unsure: 0 },
  consistencyDistribution: { foamy: 6, chunky: 2 },
  colourDistribution: { tan: 5, green: 2, yellow: 1 },
  bloodPresent: [],
  foreignPresent: [],
  reviewedCount: 0,
  ...over,
})

// ── §5.3 Absence ≠ wellness — the safety band renders ONLY when a flag is present ──

Deno.test('empty safetyFlags → NO safety band (never a fabricated all-clear)', () => {
  const html = renderReport(base())
  assert.ok(!html.includes('class="safetyband"'), 'no safety band when no flags')
  // The document still renders — brand letterhead + the (dynamic) patient name.
  assert.ok(html.includes('>Culprit<'))
  assert.ok(/Patient: Nyx/.test(html), 'brand changed to Culprit; patient name still renders')
  assert.ok(html.includes('Owner-reported'))
})

Deno.test('chronicity flag → safety band leads, mono-prominent, escalates on presence', () => {
  const flag: SafetyFlag = {
    kind: 'chronicity',
    symptomType: 'vomit',
    episodeCount: 8,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 8,
    daysSinceLastEpisode: 2,
    firstOnsetIso: '2026-05-20T14:00:00Z',
    firstLoggedIso: '2026-05-20T14:00:00Z',
    tier: 'standard',
    windowDays: 56,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(html.includes('class="safetyband"'), 'safety band present')
  assert.ok(/ongoing/i.test(html), 'chronicity reads as ongoing')
  // "spans", not "has been ongoing" (CUL-687): the lead safety line stated a continuing
  // state in the same sentence that dated the most recent episode, and cough's widened
  // recency floor made that pairing reachable. Span and recency are each stated once now.
  assert.ok(html.includes('Vomiting spans'))
  assert.ok(!/has been ongoing/.test(html), 'the contradicting continuation claim is gone')
})

Deno.test('present_blood flag → "Possible blood" leads the safety band', () => {
  const flag: SafetyFlag = {
    kind: 'present_blood',
    source: 'vomit',
    incidents: [{ eventId: 'v1', occurredAt: '2026-06-18T18:00:00Z', kind: 'coffee_ground' }],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(html.includes('class="safetyband"'))
  assert.ok(html.includes('Possible blood'))
  // R2-4/R2-6 — the AI provenance collapses to the uniform badge, and the mechanism (not the brand
  // name "Nyx", which collides with the patient's) is what "flagged" it.
  assert.ok(/AI read &middot; unconfirmed/.test(html), 'uniform AI badge present')
  assert.ok(/automated photo analysis/i.test(html), 'attributed to the mechanism, not the app name')
  assert.ok(!/photo Nyx flagged/.test(html), 'no app-name/patient-name collision')
})

Deno.test('present_blood (source=stool, melena) → stool noun + upper-GI anatomy in the band', () => {
  const flag: SafetyFlag = {
    kind: 'present_blood',
    source: 'stool',
    incidents: [{ eventId: 's1', occurredAt: '2026-06-26T14:00:00Z', kind: 'dark_tarry' }],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(html.includes('class="safetyband"') && html.includes('Possible blood'))
  assert.ok(/stool incident/.test(html) && !/vomiting incident/.test(html), 'stool noun, not vomit')
  assert.ok(/melena/.test(html) && /upper-GI/.test(html), 'melena localised upper-GI')
})

Deno.test('present_blood (source=stool, haematochezia) → lower-GI anatomy; not melena', () => {
  const flag: SafetyFlag = {
    kind: 'present_blood',
    source: 'stool',
    incidents: [{ eventId: 's1', occurredAt: '2026-06-26T14:00:00Z', kind: 'fresh_red' }],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/haematochezia/.test(html) && /lower-GI/.test(html), 'fresh red localised lower-GI')
  assert.ok(!/melena/.test(html), 'haematochezia not mislabelled melena')
})

Deno.test('present_blood (source=stool, subtype unread) → present but no false anatomy', () => {
  const flag: SafetyFlag = {
    kind: 'present_blood',
    source: 'stool',
    incidents: [{ eventId: 's1', occurredAt: '2026-06-26T14:00:00Z', kind: null }],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/subtype unread/.test(html), 'present-but-unread blood surfaces without inventing a subtype')
  assert.ok(!/melena/.test(html) && !/haematochezia/.test(html), 'no anatomy claimed when subtype is unknown')
})

Deno.test('intake_decline renders as a health signal, never "picky"', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'refused_normal_food',
    species: 'cat',
    baselineScore: 3.5,
    recentScore: 0.5,
    daysBelowBaseline: 0,
    refusedFoodLabel: 'wet food',
    ratedMealsConsidered: 14,
    lastFullMealIso: '2026-06-30T08:00:00Z',
    hoursSinceLastFullMeal: 52,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/health signal/i.test(html))
  assert.ok(/not &ldquo;picky/i.test(html), 'explicitly not picky')
  assert.ok(/hepatic-lipidosis/i.test(html), 'feline window note for a cat')
  // The refused-food trigger must NOT print a bogus "0 consecutive days".
  assert.ok(!/0 consecutive day/i.test(html))
})

// ── B-213: intake-decline duration + recent-meals appendix ─────────────────────

Deno.test('B-213 — intake flag renders the "how long off food" gap (hours, feline window)', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3.6,
    recentScore: 1,
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 8,
    lastFullMealIso: '2026-06-30T08:00:00Z',
    hoursSinceLastFullMeal: 52,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.ok(/fully-eaten meal/i.test(text), 'names the last fully-eaten meal')
  assert.ok(/about 52 h without a full meal/.test(text), 'renders the sub-72h gap in hours for the feline window')
  // Still escalate-only — the gap never softens the flag. Scope the never-reassure check to
  // the flag body (the legend legitimately says the report never shows an "all clear").
  const flagBody = text.slice(text.indexOf('Reduced intake'), text.indexOf('Reduced intake') + 500)
  assert.ok(/health signal/i.test(flagBody))
  assert.ok(!/all clear|is fine|no concern|reassur|looks (good|fine)/i.test(flagBody))
})

Deno.test('B-213 — a >72h gap renders in days, not hours', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'dog',
    baselineScore: 3.6,
    recentScore: 1,
    daysBelowBaseline: 4,
    refusedFoodLabel: null,
    ratedMealsConsidered: 8,
    lastFullMealIso: '2026-06-26T08:00:00Z',
    hoursSinceLastFullMeal: 100,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.ok(/about 4\.2 days without a full meal/.test(text), '100 h renders as 4.2 days')
  assert.ok(!/\d+ h without a full meal/.test(text), 'a multi-day gap is not shown in hours')
})

Deno.test('B-213 — a whole-day gap drops the ".0" (no self-contradictory "about 3.0 days")', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline', trigger: 'consecutive_low', species: 'cat',
    baselineScore: 3.6, recentScore: 1, daysBelowBaseline: 3, refusedFoodLabel: null,
    ratedMealsConsidered: 8, lastFullMealIso: '2026-06-29T12:00:00Z', hoursSinceLastFullMeal: 72,
  }
  const text = renderReport(base({ safetyFlags: [flag] })).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.ok(/about 3 days without a full meal/.test(text), '72 h reads "3 days", not "3.0 days"')
  assert.ok(!/3\.0 days/.test(text))
})

Deno.test('B-213 — the flag shows the decline SLOPE so the gap is not misread as marked anorexia', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline', trigger: 'refused_normal_food', species: 'cat',
    baselineScore: 3.6, recentScore: 0, daysBelowBaseline: 0, refusedFoodLabel: 'Tiki Cat Tuna',
    ratedMealsConsidered: 9, lastFullMealIso: '2026-06-30T08:00:00Z', hoursSinceLastFullMeal: 72,
  }
  const text = renderReport(
    base({
      safetyFlags: [flag],
      provenance: {
        ownerReported: true, totalSymptomIncidents: 0, estimatedOrWindowCount: 0, deletedExcluded: true, uncategorisedObservations: 0,
        symptomLog: [],
        intakeLogScope: 'intake_flag',
        intakeLog: [
          { eventId: 'm3', occurredAt: '2026-07-02T18:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'refused', isLastFullMeal: false, pinned: false },
          { eventId: 'm2', occurredAt: '2026-07-01T08:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'picked', isLastFullMeal: false, pinned: false },
          { eventId: 'm1b', occurredAt: '2026-06-30T18:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'some', isLastFullMeal: false, pinned: false },
          { eventId: 'm1', occurredAt: '2026-06-30T08:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'all', isLastFullMeal: true, pinned: false },
        ],
        intakeLogHiddenOlder: 0,
        confounders: [], proteinExposureTally: {}, proteinUnknownCount: 0, conditions: [],
      },
    }),
  ).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  // The trajectory names the slope (oldest→newest), so "3 days since a full meal" can't be read
  // as 3 days of marked anorexia — the pet ate partially in between.
  assert.ok(/Recent rated meals declined: ate it all . ate some . picked at it . refused/i.test(text), text.slice(text.indexOf('Reduced intake'), text.indexOf('Reduced intake') + 400))
})

Deno.test('B-213 — no full meal in window renders honestly, never a false recent anchor', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 2.8,
    recentScore: 0,
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    lastFullMealIso: null,
    hoursSinceLastFullMeal: null,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/No fully-eaten meal is recorded/i.test(html))
  assert.ok(!/fully-eaten meal was/i.test(html), 'no fabricated date when none exists')
})

Deno.test('B-213 — recent-meals appendix line-items rated meals, tags the last full meal, never "picky"', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3.6,
    recentScore: 0.5,
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 8,
    lastFullMealIso: '2026-06-30T08:00:00Z',
    hoursSinceLastFullMeal: 52,
  }
  const html = renderReport(
    base({
      safetyFlags: [flag],
      provenance: {
        ownerReported: true,
        totalSymptomIncidents: 0,
        estimatedOrWindowCount: 0,
        deletedExcluded: true,
        uncategorisedObservations: 0,
        symptomLog: [],
        intakeLogScope: 'intake_flag',
        intakeLog: [
          { eventId: 'm3', occurredAt: '2026-07-02T18:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'refused', isLastFullMeal: false, pinned: false },
          { eventId: 'm2', occurredAt: '2026-07-01T08:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'some', isLastFullMeal: false, pinned: false },
          { eventId: 'm1', occurredAt: '2026-06-30T08:00:00Z', foodLabel: 'Tiki Cat Tuna', intakeRating: 'all', isLastFullMeal: true, pinned: false },
        ],
        intakeLogHiddenOlder: 5,
        confounders: [],
        proteinExposureTally: {}, proteinUnknownCount: 0,
        conditions: [],
      },
    }),
  )
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.ok(/Appendix E — Meals &amp; intake/i.test(html), 'the appendix renders')
  assert.ok(/last full meal/i.test(text), 'tags the last fully-eaten meal')
  assert.ok(/Refused/.test(text) && /Ate it all/.test(text), 'renders the raw ratings')
  assert.ok(/5 earlier rated meals/i.test(text), 'discloses the hidden older count — no silent cap')
  assert.ok(/not &ldquo;picky/i.test(html), 'never picky, even in the appendix')
})

Deno.test('B-213 — no meals appendix on a calm report (no meals logged, empty intakeLog)', () => {
  const html = renderReport(base({}))
  assert.ok(!/Appendix E/i.test(html), 'no meal dump when no meals were logged and there is no intake concern')
})

Deno.test('#7/#8 meals-only Appendix E — grouped meal foods render WITHOUT an intake flag (the wet-food fix)', () => {
  const html = renderReport(
    base({
      // Rated meals logged, NO intake-decline flag, empty intakeLog — the exact free-fed-grazer path
      // that previously left the wet food unnamed + cited a non-existent appendix.
      diet: {
        ...base().diet,
        freeFed: [{ foodLabel: 'RC Weight', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: null, activeUntil: null , isShared: false }],
        mealCompletion: { ratedMeals: 28, finishedMeals: 3, rate: 0.107, intakeBreakdown: [{ rating: 'all', count: 3 }, { rating: 'some', count: 25 }] },
        mealItems: [
          { foodLabel: 'Instinct Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: null, count: 18, firstDate: '2026-05-14', lastDate: '2026-07-03', intakeBreakdown: [{ rating: 'some', count: 18 }] },
          { foodLabel: 'Fancy Feast Salmon', primaryProtein: 'salmon', proteinSet: pset(['salmon']), format: null, count: 10, firstDate: '2026-05-20', lastDate: '2026-07-01', intakeBreakdown: [{ rating: 'most', count: 10 }] },
        ],
      },
    }),
  )
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/Appendix E — Meals &amp; intake/.test(html), 'the meals appendix renders on meals alone (no flag needed)')
  assert.ok(/Instinct Chicken/.test(text) && /Fancy Feast Salmon/.test(text), 'each meal food is named + itemised')
  assert.ok(/&times;<span class="num">18<\/span>/.test(html), 'per-food feeding count shown')
  assert.ok(/Ate some/.test(text) && /Ate most/.test(text), 'typical intake per food')
  // Page-1 feeding line names the foods + cites the RIGHT appendix (not the old "appendix A").
  // CUL-643 — the pointer no longer promises itemisation (appendix E groups by food); the
  // assertion's intent is unchanged, that page 1 names the foods AND cites the appendix.
  assert.ok(
    /Also fed as meals:/.test(text) && /grouped by food in appendix&nbsp;E/.test(html),
    'page-1 feeding line names foods + cites appendix E',
  )
  assert.ok(!/per-meal in appendix&nbsp;A/.test(html), 'the bogus appendix-A citation is gone')
})

Deno.test('#7/#8 — meals appendix E renders the grouped meal foods even with NO intake flag', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [{ foodLabel: 'Royal Canin Weight', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: '2026-05-01', activeUntil: null , isShared: false }],
        intakeNotDirectlyObserved: true,
        mealCompletion: { ratedMeals: 28, finishedMeals: 3, rate: 0.1, intakeBreakdown: [{ rating: 'all', count: 3 }, { rating: 'some', count: 25 }] },
        mealItems: [
          { foodLabel: 'Instinct Original Real Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: null, count: 18, firstDate: '2026-05-14', lastDate: '2026-07-03', intakeBreakdown: [{ rating: 'some', count: 18 }] },
          { foodLabel: 'Instinct Limited Ingredient Turkey', primaryProtein: 'turkey', proteinSet: pset(['turkey']), format: null, count: 10, firstDate: '2026-05-20', lastDate: '2026-07-01', intakeBreakdown: [{ rating: 'some', count: 10 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/Appendix E — Meals &amp; intake/.test(html), 'the meals appendix renders without an intake flag')
  assert.ok(html.includes('Instinct Original Real Chicken') && html.includes('Instinct Limited Ingredient Turkey'), 'names the wet foods')
  assert.ok(/28 logged meals across 2 foods/.test(text), 'grouped caption reconciles the meal count')
  // Page-1 feeding line names the foods + cites appendix E, not the old bogus appendix A.
  assert.ok(/Also fed as meals: Instinct/.test(text), 'the feeding line names the meal foods')
  assert.ok(!/per-meal in appendix/i.test(text), 'no dangling appendix-A meal citation')
})

Deno.test('symptom_worsening copy uses the window LENGTH (windowDays), not the symptom-day density', () => {
  // priorDays/currentDays are distinct symptom-DAYS within each window; windowDays is the
  // comparison-window length. The copy must trace to the window, never print "prior 2 days".
  const flag: SafetyFlag = {
    kind: 'symptom_worsening',
    symptomType: 'vomit',
    currentCount: 3,
    priorCount: 2,
    currentDays: 3,
    priorDays: 2,
    trigger: 'more_episodes',
    tier: 'standard',
    windowDays: 7,
  }
  const html = renderReport(base({ safetyFlags: [flag] })).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(html.includes('prior 7 days') && html.includes('recent 7 days'), 'window length = windowDays (7)')
  assert.ok(html.includes('from 2 episodes in the prior 7 days to 3'), 'counts trace to the appendix')
  assert.ok(!/prior 2 days|recent 3 days/.test(html), 'never conflate symptom-day density with the window length')
})

// ── §5.9 present-only — blood/foreign NEVER a "0 of N" ─────────────────────────────

Deno.test('vomit phenotype with NO blood/foreign → de-weighted limitation note, never "0 of N"', () => {
  const html = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  assert.ok(html.includes('Not seen'), 'de-weighted "not seen" note')
  assert.ok(/not\b.*clearance/i.test(html.replace(/<[^>]*>/g, ' ')), 'explicitly not a clearance')
  assert.ok(!/0 of \d/.test(html), 'never a "0 of N" clearance count')
  assert.ok(!html.includes('class="present"'), 'no present-findings box when nothing present')
})

Deno.test('vomit phenotype WITH blood present → present-findings box, still no "0 of N"', () => {
  const html = renderReport(
    base({
      vomitPhenotype: emptyPhenotype({
        bloodPresent: [{ eventId: 'v1', occurredAt: '2026-06-18T18:00:00Z', kind: 'coffee_ground' }],
      }),
    }),
  )
  assert.ok(html.includes('class="present"'), 'present-findings box')
  assert.ok(/Possible blood/.test(html))
  assert.ok(!/0 of \d/.test(html))
})

// ── §5.10 assessed denominators kept distinct ──────────────────────────────────────

Deno.test('phenotype discloses the four AI states distinctly (assessed denominator)', () => {
  const html = renderReport(
    base({
      vomitPhenotype: emptyPhenotype({
        totalIncidents: 12,
        withAnalysis: 10,
        states: { completed: 7, uncertain: 1, failed: 2, pending: 0 },
        assessedCount: 7,
      }),
    }),
  )
  const text = html.replace(/<[^>]*>/g, ' ')
  assert.ok(/7\s+have a legible AI read/.test(text), 'assessed denominator = completed')
  assert.ok(/uncertain/.test(text) && /not legible/.test(text), 'uncertain + failed disclosed distinctly')
})

Deno.test('phenotype consistency: a tie for the top type is disclosed, not asserted as a majority', () => {
  const tie = renderReport(
    base({ vomitPhenotype: emptyPhenotype({ consistencyDistribution: { foamy: 2, watery: 2, chunky: 1 } }) }),
  )
  assert.ok(/no single predominant reading/i.test(tie), 'a 2–2 tie is not called "most often foamy"')
  const clear = renderReport(
    base({ vomitPhenotype: emptyPhenotype({ consistencyDistribution: { foamy: 6, chunky: 2 } }) }),
  )
  assert.ok(/most often foamy/i.test(clear), 'a clear majority still reads "most often X"')
})

// ── §4 / B-117 adherence — never "compliant" on zero doses ─────────────────────────

Deno.test('medication with zero doses → "adherence not tracked", never compliant/given', () => {
  const html = renderReport(base({ medications: [med({ adherenceState: 'not_tracked', givenDoses: 0, daysWithDose: 0 })] }))
  assert.ok(/Adherence not tracked/i.test(html))
  assert.ok(!/compliant/i.test(html), 'never the word compliant')
})

Deno.test('tracked medication → adherence line with denominators + unconfirmed distinct', () => {
  const html = renderReport(base({ medications: [med({})] }))
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  // An ACTIVE course states the COUNT and names the plan without framing it as a ratio — "of N"
  // mid-course reads as a countdown (B-618 D7), and that ruling is now shared by page 1 and the
  // §4.4 cell through one predicate rather than being decided twice (CUL-976).
  // `8 unconfirmed` is asserted off the WINDOW clause, which is where every qualifier lives now:
  // the record-scoped parenthetical that once carried them was removed with CUL-994. Kept because
  // "unconfirmed is never folded into given" is the B-156 G1 fail-safe and must stay visible
  // somewhere on the line.
  assert.ok(
    text.includes('82 doses administered across the whole course; course under way, 90 prescribed'),
    'count + the scope it was counted over + the plan, and no mid-course ratio',
  )
  assert.ok(!/82 of 90/.test(text), 'no countdown framing on an active course')
  assert.ok(text.includes('41 of 45 days'), 'day denominator')
  assert.ok(text.includes('8 unconfirmed'), 'unconfirmed kept distinct (not folded into given)')
})

Deno.test('ENDED medication → the adherence ratio NAMES its basis (CUL-976)', () => {
  const html = renderReport(
    base({ medications: [med({ status: 'completed', endedAt: '2026-06-20', courseEnded: true })] }),
  )
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  // "of 90 prescribed", never a bare "of 90" the reader could take for the window's own
  // expectation — the v15 artifact's "9 of 30" was exactly that unlabelled proration.
  // The claim names BOTH its denominator's basis and its numerator's scope. The window-scoped
  // qualifiers stay in the window clause, where their prefix says which population they describe.
  assert.ok(
    text.includes('82 of 90 prescribed doses administered across the whole course'),
    'prescription-denominated claim, basis named, scope named',
  )
})

Deno.test('OVER-DELIVERED medication → the ratio is dropped, never "95 of 90" (CUL-976)', () => {
  const html = renderReport(
    base({
      medications: [
        med({ status: 'completed', endedAt: '2026-06-20', courseEnded: true, lifetimeDosesLogged: 95 }),
      ],
    }),
  )
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(!/95 of 90/.test(text), 'an over-delivered course never renders a >100% frame')
  assert.ok(
    text.includes('95 doses administered across the whole course; more than the 90 prescribed'),
    'the count is stated and the reason the frame is absent is named, not left to inference',
  )
})

// ── §4 / B-040 verbatim free-fed string ────────────────────────────────────────────

Deno.test('free-fed arrangement → verbatim "Intake not directly observed"', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [{ foodLabel: 'Royal Canin Weight', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: '2026-05-01', activeUntil: null , isShared: false }],
        intakeNotDirectlyObserved: true,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(html.includes('Intake not directly observed'), 'verbatim B-040 string')
})

// ── §5.5 severity is NOT rendered (PM round-3: unused column of blanks, removed) ──────

Deno.test('severity never reaches the report — no column, no x/5, no "Severity" heading, no legend entry', () => {
  const html = renderReport(
    base({
      provenance: {
        ownerReported: true,
        totalSymptomIncidents: 2,
        estimatedOrWindowCount: 0,
        deletedExcluded: true,
        uncategorisedObservations: 0,
        symptomLog: [
          logEntry({ type: 'vomit', occurredAt: '2026-06-01T14:00:00Z', severity: null }),
          logEntry({ type: 'diarrhea', occurredAt: '2026-06-02T12:00:00Z', severity: 3 }),
        ],
        intakeLog: [],
        intakeLogHiddenOlder: 0,
        intakeLogScope: null,
        confounders: [],
        proteinExposureTally: {}, proteinUnknownCount: 0,
        conditions: [],
      },
    }),
  )
  // A rated severity (3) is carried on the event but must not surface anywhere in the artifact.
  assert.ok(!html.includes('3/5'), 'a rated severity is not rendered as x/5')
  const text = html.replace(/<[^>]*>/g, ' ')
  assert.ok(!/\bseverity\b/i.test(text), 'the word "severity" appears nowhere in the report')
  assert.ok(!/average sever/i.test(html), 'no averaged severity anywhere')
})

// ── B-010 occurred-time rendering ──────────────────────────────────────────────────

Deno.test('B-010 — windowed event renders a time RANGE, estimated an ~time, never a false point', () => {
  const html = renderReport(
    base({
      provenance: {
        ownerReported: true,
        totalSymptomIncidents: 2,
        estimatedOrWindowCount: 2,
        deletedExcluded: true,
        uncategorisedObservations: 0,
        symptomLog: [
          logEntry({
            type: 'vomit',
            occurredAt: '2026-06-10T11:44:00Z',
            occurredAtConfidence: 'window',
            occurredAtEarliest: '2026-06-10T08:00:00Z',
            occurredAtLatest: '2026-06-10T11:44:00Z',
          }),
          logEntry({ type: 'diarrhea', occurredAt: '2026-06-02T12:00:00Z', occurredAtConfidence: 'estimated' }),
        ],
        intakeLog: [],
        intakeLogHiddenOlder: 0,
        intakeLogScope: null,
        confounders: [],
        proteinExposureTally: {}, proteinUnknownCount: 0,
        conditions: [],
      },
    }),
  )
  assert.ok(html.includes('range'), 'window confidence → range tag')
  assert.ok(html.includes('–') || html.includes('&ndash;') || /~\d\d:\d\d.\d\d:\d\d/.test(html), 'a time range, not a point')
  assert.ok(html.includes('est'), 'estimated tag')
})

// ── Weight (§3.3) empty state + trend ──────────────────────────────────────────────

Deno.test('empty weight → designed logging-nudge, never a fabricated value', () => {
  const html = renderReport(base())
  assert.ok(/No home weigh-ins recorded/i.test(html))
})

Deno.test('weight trend → sparkline + descriptive framing, never a loss flag', () => {
  const html = renderReport(
    base({
      weight: {
        isEmpty: false,
        latest: { kg: 3.8, lbs: 8.4, date: '2026-06-19' },
        trend: {
          readingCount: 3,
          seriesLbs: [9.3, 8.8, 8.4],
          seriesKg: [4.2, 4.0, 3.8],
          latestLbs: 8.4,
          latestKg: 3.8,
          earliestDate: '2026-06-02',
          latestDate: '2026-06-19',
          deltaLbs: -0.9,
          deltaKg: -0.4,
          direction: 'down',
        },
      },
      atAGlance: { primarySymptom: null, totalSymptomIncidents: 0, anySymptomDays: 0, windowDays: 20, loggedDays: 16, trialDaysLogged: null, weightState: 'trend', sinceOnsetDays: null, daysSinceLastEpisode: null, loggedDaysSinceLastEpisode: null, firstHalfLoggedDays: 8, secondHalfLoggedDays: 8 },
    }),
  )
  assert.ok(html.includes('polyline'), 'sparkline drawn')
  assert.ok(/trajectory/i.test(html), 'descriptive trajectory framing')
  // No loss VERDICT: descriptive only. (The legend legitimately says "never … an alarm",
  // so match loss-as-a-finding phrasing rather than the bare word "alarm".)
  assert.ok(!/losing weight|weight loss|is (?:worrying|concerning)/i.test(html), 'no loss flag / verdict')
})

// ── B-495 — the At-a-glance weight tile states % of body weight ──────────────────────
// A `base()` snapshot is a no-trial (symptom-monitoring) report, so `weightDuringTrial`
// never fires and the tile is the SOLE source of "% of body weight" — which is the point
// of B-495: on that shape the percentage appeared nowhere in the whole report.
function weightTileHtml(seriesKg: number[], deltaKg: number): string {
  const last = seriesKg[seriesKg.length - 1]
  return renderReport(
    base({
      weight: {
        isEmpty: false,
        latest: { kg: last, lbs: Math.round(last * 2.2046 * 10) / 10, date: '2026-06-19' },
        trend: {
          readingCount: seriesKg.length,
          seriesLbs: seriesKg.map((k) => Math.round(k * 2.2046 * 10) / 10),
          seriesKg,
          latestLbs: Math.round(last * 2.2046 * 10) / 10,
          latestKg: last,
          earliestDate: '2026-06-02',
          latestDate: '2026-06-19',
          deltaLbs: Math.round(deltaKg * 2.2046 * 10) / 10,
          deltaKg,
          direction: deltaKg < 0 ? 'down' : 'up',
        },
      },
    }),
  )
}

Deno.test('B-495 — the weight tile states % of body weight, against the earliest in-window reading', () => {
  // `-0.3 kg` renders identically for a cat and a Labrador; the percent is what makes it
  // legible. Same absolute, different body mass, different reading — species-blind no more.
  const cat = weightTileHtml([4.4, 4.1], -0.3)
  assert.ok(/-0\.3<small>&nbsp;kg<\/small>/.test(cat), 'the absolute stays the headline value')
  assert.ok(/&asymp;7% of body weight/.test(cat), '-0.3 kg on a 4.4 kg cat is ~7%')

  const dog = weightTileHtml([32.4, 32.1], -0.3)
  assert.ok(/&asymp;1% of body weight/.test(dog), 'the SAME -0.3 kg on a 32 kg dog is ~1%')
  // The single source on a no-trial report: exactly one "% of body weight" on the page.
  assert.equal(dog.match(/% of body weight/g)?.length, 1, 'stated once — the tile, not a caveat repeated')
})

Deno.test('B-495 — a one-tick weight wobble states NO percent (no manufactured precision)', () => {
  // A home scale resolves ~0.1 kg, so a 0.1 kg delta is one increment and supports no honest
  // percent; the tile falls back to the absolute-only label rather than inventing a figure.
  const t = weightTileHtml([4.4, 4.3], -0.1)
  assert.ok(!/% of body weight/.test(t), 'no percent for a sub-0.15 kg (one-tick) delta')
  assert.ok(/home-scale trajectory \(descriptive\)/.test(t), 'the tile keeps its absolute-only label')
})

// ── §6 cherry-pick guard ────────────────────────────────────────────────────────────

Deno.test('custom window with out-of-window events → cherry-pick disclosure', () => {
  const s = base()
  s.scope.basis = 'custom'
  s.scope.isCustomOverride = true
  s.scope.outOfWindowSymptomCount = 3
  s.scope.outOfWindowMostRecent = '2026-06-28T14:00:00Z'
  const html = renderReport(s)
  assert.ok(/fall outside this window/i.test(html))
  assert.ok(html.includes('Custom range'))
})

// ── B-613 — the guard names the SIGN, not just the date ─────────────────────────────

Deno.test('B-613 — the cherry-pick guard names the most recent excluded symptom TYPE', () => {
  // Two cold reads ranked this top of the non-blocking list: "5 symptom events fall
  // outside this window (most recent May 28)" reads as bookkeeping about a window, while
  // naming the sign reads as a fact about the patient. On a completed elimination whose
  // window closes eleven days early it is the difference between "the trial held to the
  // end" and "she relapsed in the final week".
  const s = base()
  s.scope.basis = 'custom'
  s.scope.isCustomOverride = true
  s.scope.outOfWindowSymptomCount = 5
  s.scope.outOfWindowMostRecent = '2026-05-28T14:00:00Z'
  s.scope.outOfWindowMostRecentType = 'diarrhea'
  const html = renderReport(s)
  assert.ok(/most recent: loose stool, May 28/.test(html), html.slice(html.indexOf('cherry')))
})

Deno.test('B-613 — a type-less most-recent still renders its date, never a dangling colon', () => {
  // The type is populated in the same branch as the instant, so this pairing is not
  // reachable from `assembleReport` — but ScopeInfo permits it and the renderer is public,
  // so it degrades to exactly the pre-B-613 sentence rather than to "most recent: , May 28".
  const s = base()
  s.scope.basis = 'custom'
  s.scope.isCustomOverride = true
  s.scope.outOfWindowSymptomCount = 2
  s.scope.outOfWindowMostRecent = '2026-05-28T14:00:00Z'
  s.scope.outOfWindowMostRecentType = null
  const html = renderReport(s)
  assert.ok(/most recent: May 28/.test(html))
  assert.ok(!/most recent: ,/.test(html))
})

Deno.test('B-613 — the legend scopes the trial-crop disclosure to SYMPTOM events', () => {
  // The other half of the adversarial pass's blocking finding. The legend read "the trial
  // section names WHAT WAS LOGGED in the trial days it leaves out" — an unrestricted
  // universal over a clause that names only REPORT_SYMPTOM_SET events. On the cat whose
  // cropped days hold 42 refusals of the prescribed diet and 42 off-diet feedings, all
  // invisible on this page, that sentence tells the reader the 5 vomits are the whole of
  // it. Same class as CUL-69's "a pointer to another section is not a licence to
  // generalise": say what the disclosure HOLDS, never what it covers.
  const s = base()
  s.scope.trialCropSymptoms = {
    count: 5,
    mostRecentIso: '2026-05-24T19:00:00Z',
    mostRecentType: 'vomit',
    byType: [{ type: 'vomit', count: 5 }],
    cropDays: 42,
    mealLoggedDaysInCrop: 42,
    countIsFloor: false,
  }
  const html = renderReport(s)
  assert.ok(/names the symptom events logged in the trial days it leaves out/.test(html))
  assert.ok(
    /is counted nowhere on this report/.test(html),
    'the legend must say what the disclosure does NOT reach',
  )
  assert.ok(!/section names what was logged/.test(html), 'no unrestricted universal')
  // AND IT MAY NOT DENY WHAT THE BLOCK NOW DOES. The re-attack caught this: the legend
  // said "neither reports an absence" twelve lines above "This report holds no meal log
  // for 42 of those 42 days", which IS one. The G2 rule the clause carries is about an
  // absence of SYMPTOMS, so that is what it now says — narrowing the denial to the thing
  // the rule actually protects, rather than dropping it.
  assert.ok(/Neither disclosure reports an absence of symptoms/.test(html))
  assert.ok(!/Neither disclosure reports an absence,/.test(html))

  // B-599 both ways: the gate follows what the block ACTUALLY renders, not the symptom
  // count. A crop with no symptoms but dark days still carries a line, so it is still
  // explained; a crop with neither carries none, so the legend stays silent.
  const quiet = base()
  quiet.scope.trialCropSymptoms = {
    count: 0, mostRecentIso: null, mostRecentType: null, byType: [],
    cropDays: 42, mealLoggedDaysInCrop: 8, countIsFloor: false,
  }
  assert.ok(/names the symptom events logged in the trial days it leaves out/.test(renderReport(quiet)))

  const nothing = base()
  nothing.scope.trialCropSymptoms = {
    count: 0, mostRecentIso: null, mostRecentType: null, byType: [],
    cropDays: 42, mealLoggedDaysInCrop: 42, countIsFloor: false,
  }
  assert.ok(!/names the symptom events logged/.test(renderReport(nothing)))
})

Deno.test('B-613 — an out-of-window date in ANOTHER year carries that year', () => {
  // CUL-69's rule where it now bites. This date is out-of-window BY DEFINITION and is
  // bounded only by the event pull, which reaches up to 400 days before the window start
  // when a trial needs it. Beside a range box that always prints a year, a bare "May 28"
  // is read as this May — and how recent the excluded event was is the entire point of
  // the sentence. Safe as a conditional stamp only because this clause holds ONE date.
  const s = base()
  s.scope.basis = 'custom'
  s.scope.isCustomOverride = true
  s.scope.outOfWindowSymptomCount = 1
  s.scope.outOfWindowMostRecent = '2025-05-28T14:00:00Z' // the year BEFORE the window
  s.scope.outOfWindowMostRecentType = 'vomit'
  assert.ok(/most recent: vomiting, May 28, 2025/.test(renderReport(s)))

  // Same-year stays bare, so an ordinary report is byte-identical to what shipped before
  // and a printed year always carries signal.
  const same = base()
  same.scope.basis = 'custom'
  same.scope.isCustomOverride = true
  same.scope.outOfWindowSymptomCount = 1
  same.scope.outOfWindowMostRecent = '2026-05-28T14:00:00Z'
  same.scope.outOfWindowMostRecentType = 'vomit'
  const html = renderReport(same)
  assert.ok(/most recent: vomiting, May 28\)/.test(html))
  assert.ok(!/May 28, 2026/.test(html))
})

// ── §5.8 no load-bearing colour + self-contained + print CSS ───────────────────────

Deno.test('print-color-adjust on fills + @page + zero third-party subresources', () => {
  const html = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  assert.ok(html.includes('print-color-adjust:exact'), 'fills survive a B&W clinic printer')
  assert.ok(html.includes('@page'), 'print page CSS present')
  // CUL-993 A.2 / CUL-855 — the paper the device produces: expo-print's page box is US Letter
  // and it never reads @page, so the declaration matches it rather than contradicting it.
  assert.ok(/@page\{size:letter portrait/.test(html), 'the print stylesheet declares Letter')
  assert.ok(!/size:A4/.test(html), 'no A4 declaration anywhere in the shipped document')
  assert.ok(!/https?:\/\//.test(html), 'no external subresource can leak the token in a Referer')
})

Deno.test('proportion bars use a grayscale ramp only (no load-bearing colour)', () => {
  const html = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  assert.ok(html.includes('#1a1c22'), 'darkest gray used for the leading segment')
  // SCOPED TO WHAT IS PAINTED (CUL-981). This scanned the whole document for colour words on the
  // reasoning that §5.8 forbids encoding a datum in colour — and then the vomit box started
  // PRINTING colour as data ("Colour, where legible: tan ×6 · green ×1"), which a document-wide
  // word scan reads as a fill. The rule is about the stylesheet and the inline `style` attributes
  // the bars are drawn with, so the assertion is sliced to those and anchored there (C-36: a
  // guard that matches the whole object is measuring something other than the rule).
  const painted = [
    ...(html.match(/<style[\s\S]*?<\/style>/g) ?? []),
    ...(html.match(/style="[^"]*"/g) ?? []),
  ].join('\n')
  assert.ok(painted.length > 0, 'the slice is non-empty — a scan over nothing passes everything')
  assert.ok(!/#[0-9a-f]*(00ff00|ff0000)/i.test(painted))
  assert.ok(!/(green|crimson|tomato)\b/i.test(painted))
  // And the words that ARE in the document are the owner's photo read, not a fill.
  assert.ok(/green/i.test(html), 'the colour tally still prints its words as data')
})

// ── Signalment age honesty (B-251 PR 9 — approximate DOB never a witnessed birthday) ──

Deno.test('signalment: an EXACT DOB prints the born-year "(b. YYYY)"', () => {
  const html = renderReport(base()) // exact, dob 2020-04-01, ageYears 6
  const text = html.replace(/&nbsp;/g, ' ')
  assert.ok(/6 yr \(b\. 2020\)/.test(text), 'exact DOB shows the witnessed birth year')
  assert.ok(!text.includes('~6'), 'no estimate hedge on an exact age')
})

Deno.test('signalment: an APPROXIMATE DOB renders "~N yr" and NEVER a birth year', () => {
  const s = base()
  s.signalment.dateOfBirthPrecision = 'approximate'
  const html = renderReport(s)
  const text = html.replace(/&nbsp;/g, ' ')
  assert.ok(text.includes('~6 yr'), 'estimated age is hedged with ~')
  assert.ok(!/\(b\./.test(text), 'no witnessed birth year for an approximate DOB')
  assert.ok(!/b\. 2020/.test(text), 'the anchor year is never surfaced as a birth year')
})

// ── CUL-979 (R-5) — the household. A second animal is the central compliance fact of an
//    elimination trial, and the report never fetched it ──────────────────────────────────

type Household = ReportSnapshot['signalment']['household']

/** The callout a vet reads for the bottom line — the only place the household caveat may live. */
function interpretingCallout(html: string): string {
  const m = html.match(/<div class="callout">[\s\S]*?<\/div>/)
  return m ? m[0] : ''
}

/**
 * A clean, well-logged trial whose block would otherwise print the AFFIRMATIVE sentence.
 * Every other caveat on that list suppresses it; the household one must too, or the block
 * opens with a claim its own paragraph then dismantles — and this fixture is what proves
 * there was an affirmative to suppress (a green test over a block that never printed it
 * would measure nothing).
 */
function cleanTrialSnap(household: Household, over: Partial<NonNullable<ReportSnapshot['trial']>> = {}): ReportSnapshot {
  const snap = base({
    clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
    diet: {
      trialTargetProtein: 'duck',
      trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
      freeFed: [],
      intakeNotDirectlyObserved: false,
      mealCompletion: null,
      mealItems: [],
      treats: { count: 0, distinctItems: 0 },
      humanFood: { count: 0, days: 0, items: [] },
      previousDiet: null,
      medicationVehicles: null,
    },
    trial: trialBlockFixture({
      startedAt: DUCK_TRIAL.startedAt,
      species: 'cat',
      allowedSetUnavailable: false,
      interpretability: 'supports',
      interpretabilityStatement:
        'This record covers 43 of 43 days of the trial — enough to read alongside the rest of the history and supports interpreting it.',
      ...over,
    }),
  })
  snap.signalment.household = household
  return snap
}

Deno.test('CUL-979 — the signalment names a second pet as a COUNT and a SPECIES, beside species and age', () => {
  const snap = base()
  snap.signalment.household = { others: [{ species: 'cat', count: 1 }], complete: true }
  const html = renderReport(snap)
  const sig = text(pageOne(html)).replace(/&nbsp;/g, ' ')
  // In the signalment line's own register — a lowercase fragment after the age, not a
  // sentence and not a box — because that is the line a clinician reads species and age off.
  assert.ok(/6 yr \(b\. 2020\) &middot; lives with 1 other cat/.test(sig), 'the housemate rides the signalment line')
  assert.ok(
    /<div class="sig">[^\n]*lives with <span class="num">1<\/span> other cat <span class="rnote">owner-recorded, as of this report<\/span><\/div>/.test(
      html,
    ),
    'it is the .sig line, not a new block, and it names its source and its tense',
  )
  // No trial on this snapshot ⇒ no trial block ⇒ the fact is stated exactly once.
  assert.equal((html.match(/lives with/g) ?? []).length, 1)
})

Deno.test('CUL-979 — a ONE-pet household renders NEITHER line (the common case gains no noise)', () => {
  for (const household of [null, { others: [], complete: true }] as Household[]) {
    const html = renderReport(cleanTrialSnap(household))
    assert.ok(!/lives with/.test(html), 'no signalment line')
    assert.ok(!/kept separate/.test(html), 'no trial caveat')
    // And nothing that says "single-pet" either: absence renders as absence, never as a claim.
    assert.ok(!/only pet|single pet|no other (pet|animal)/i.test(text(html)))
  }
})

Deno.test('CUL-979 — species and number: "other" only when it IS the same species, plurals, mixed households', () => {
  const cat = base()
  cat.signalment.household = {
    others: [{ species: 'cat', count: 2 }, { species: 'dog', count: 1 }, { species: 'other', count: 1 }],
    complete: true,
  }
  const catText = text(renderReport(cat))
  assert.ok(/lives with 2 other cats, 1 dog and 1 other animal/.test(catText), catText.match(/lives with[^<]{0,80}/)?.[0])

  const dog = base()
  dog.signalment.species = 'dog'
  dog.signalment.household = { others: [{ species: 'cat', count: 1 }], complete: true }
  assert.ok(/lives with 1 cat/.test(text(renderReport(dog))), 'a cat is not "another" cat to a dog')
  assert.ok(!/other cat/.test(text(renderReport(dog))))
})

Deno.test('CUL-979 — an INCOMPLETE household pull says "at least", and page 1 discloses the short read', () => {
  const snap = base({ incompletePulls: ['pets'] })
  snap.signalment.household = { others: [{ species: 'cat', count: 1 }], complete: false }
  const p1 = text(pageOne(renderReport(snap)))
  assert.ok(/lives with at least 1 other cat/.test(p1))
  assert.ok(/Partial record\.[^.]*household/.test(p1), 'the truncation disclosure names the household in a clinical noun')

  // Short pull, nothing read ⇒ no count to speak. The disclosure carries it; the line does not guess.
  const empty = base({ incompletePulls: ['pets'] })
  empty.signalment.household = { others: [], complete: false }
  assert.ok(!/lives with/.test(renderReport(empty)))
})

Deno.test('CUL-979 — the trial block names the housemate as a CONFOUNDER, in the existing register, without asserting intake', () => {
  const html = renderReport(cleanTrialSnap({ others: [{ species: 'cat', count: 1 }], complete: true }))
  const callout = text(interpretingCallout(html))
  assert.ok(callout.length > 0, 'the Interpreting-this-record callout rendered')
  assert.ok(
    /As of this report, Nyx lives with 1 other cat, so another animal&rsquo;s food may have been available during the trial \(intake not directly observed\) &mdash; this record does not say whether feeding was kept separate\./.test(
      callout,
    ),
    callout,
  )
  // Availability, never intake (render.ts's own distinction at trialProteinBreaches): no
  // sentence on this callout may say the pet ATE anything.
  assert.ok(!/\bate\b|eaten|consumed|reaching Nyx/i.test(callout), 'no consumption claim')
  // The list's own rule: an item on it suppresses the affirmative variant, because a
  // paragraph must not open with a sentence it then dismantles.
  assert.ok(!/supports interpreting it/.test(callout), 'the affirmative is withheld beside a stated confounder')
})

Deno.test('CUL-979 — the same trial with NO housemate keeps its affirmative (the suppression is not vacuous)', () => {
  const html = renderReport(cleanTrialSnap(null))
  const callout = text(interpretingCallout(html))
  assert.ok(/supports interpreting it/.test(callout), 'the affirmative was there to be suppressed')
  assert.ok(!/lives with/.test(callout))
})

Deno.test('CUL-979 — on the list, the housemate follows the RECORDED confounders and precedes the record GAP', () => {
  // Recorded facts first (a drug that overlapped), then the structural possibility (a
  // housemate), then the gap in the record (a dark antigen arm) — the order the block
  // already ranks its sentences in.
  const html = renderReport(
    cleanTrialSnap(
      { others: [{ species: 'cat', count: 1 }], complete: true },
      {
        antigenArmDark: true,
        medicationOverlap: [
          {
            drugName: 'Metronidazole',
            isSupplement: false,
            startedAt: '2026-05-10',
            endedAt: null,
            fromDate: '2026-05-10',
            toDate: '2026-07-02',
            daysOverlapping: 54,
            activeAtWindowEnd: true,
            overlapsLast7Days: true,
            antibacterialInGiTrial: true,
          },
        ],
      },
    ),
  )
  const callout = text(interpretingCallout(html))
  const drug = callout.indexOf('Metronidazole overlapped the trial')
  const house = callout.indexOf('lives with')
  const gap = callout.indexOf('no trial diet was recorded on the allowed list')
  assert.ok(drug >= 0 && house >= 0 && gap >= 0, callout)
  assert.ok(drug < house && house < gap, `order: drug@${drug} house@${house} gap@${gap}`)
})

// ── HTML escaping of owner free text ───────────────────────────────────────────────

Deno.test('owner free text is HTML-escaped (no injection through pet name / notes)', () => {
  const s = base()
  s.signalment.name = '<script>alert(1)</script>'
  s.signalment.ownerName = 'A & B "Co" \'x\''
  const html = renderReport(s)
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag never emitted')
  assert.ok(html.includes('&lt;script&gt;'), 'name is escaped')
  assert.ok(html.includes('&amp;') && html.includes('&quot;') && html.includes('&#39;'), 'ampersand/quote/apostrophe escaped')
})

// ── Regression: never fabricate a weight value (code-reviewer BUG) ─────────────────

Deno.test('isEmpty=false but no latest/trend → empty state, never a fabricated "0.0 kg"', () => {
  const html = renderReport(base({ weight: { isEmpty: false, latest: null, trend: null } }))
  assert.ok(/No home weigh-ins recorded/i.test(html), 'falls back to the honest empty state')
  assert.ok(!/0\.0&nbsp;kg|0\.0 kg/.test(html), 'no fabricated zero weight')
})

// ── Regression: a malformed date degrades to raw text, never "undefined" (BUG) ─────

Deno.test('an out-of-range date degrades to the raw string, never leaks "undefined"', () => {
  const s = base()
  s.scope.startDate = '2026-13-45' // month 13 / day 45 — impossible
  const html = renderReport(s)
  assert.ok(!/undefined/.test(html), 'no undefined leaked into the header')
})

// ── Coverage: stool characteristics (present-only for blood/mucus) ─────────────────

Deno.test('stool: no photo read → owner-described bar + the pre-AI limitation note', () => {
  const html = renderReport(base({ stool: { total: 6, normalCount: 4, looseCount: 2, windowDays: 52, loggedDays: 48, ai: null } }))
  assert.ok(/Stool characteristics/.test(html))
  assert.ok(/owner-described/.test(html))
  assert.ok(/No photos were read/.test(html), 'pre-AI limitation note stands when ai is null')
  assert.ok(!/0 of \d/.test(html), 'never a "0 of N"')
})

Deno.test('stool: AI read, nothing present → Bristol line + "not a clearance" (never "0 of N")', () => {
  const html = renderReport(base({
    stool: {
      total: 4, normalCount: 3, looseCount: 1, windowDays: 30, loggedDays: 28,
      ai: {
        totalIncidents: 4, withAnalysis: 3,
        states: { completed: 3, uncertain: 0, failed: 0, pending: 0 }, assessedCount: 3,
        consistencyDistribution: { type_4_smooth_soft: 2, type_6_mushy: 1 },
        colourDistribution: { brown: 3 },
        bloodPresent: [], mucusPresent: [], reviewedCount: 0,
      },
    },
  }))
  assert.ok(/Automated photo analysis/.test(html), 'aitag when a read exists')
  assert.ok(/Type 4 — smooth, soft/.test(html), 'Bristol most-common named with plain label')
  assert.ok(/most often brown/.test(html), 'colour predominant line')
  assert.ok(/Not seen/.test(html) && /not<\/b> a clearance/.test(html), 'present-only absence framed as non-clearance')
  assert.ok(/1 without a photo/.test(html), 'four-state denominator discloses the no-photo incident')
  assert.ok(!/0 of \d/.test(html), 'never a "0 of N"')
})

Deno.test('stool: melena blood + mucus present → present findings, melena named, mucus is monitor-tier', () => {
  const html = renderReport(base({
    stool: {
      total: 2, normalCount: 0, looseCount: 2, windowDays: 14, loggedDays: 10,
      ai: {
        totalIncidents: 2, withAnalysis: 2,
        states: { completed: 2, uncertain: 0, failed: 0, pending: 0 }, assessedCount: 2,
        consistencyDistribution: { type_7_watery: 2 },
        colourDistribution: { black_tarry: 1, brown: 1 },
        bloodPresent: [{ eventId: 'e1', occurredAt: '2026-06-15T12:00:00Z', kind: 'dark_tarry' }],
        mucusPresent: [{ eventId: 'e2', occurredAt: '2026-06-16T12:00:00Z' }],
        reviewedCount: 0,
      },
    },
  }))
  assert.ok(/Present findings/.test(html))
  assert.ok(/possible melena/.test(html), 'dark_tarry blood named as melena')
  assert.ok(/often upper-GI/.test(html), 'melena localised to upper-GI, not large-bowel')
  assert.ok(!/large-bowel/.test(html), 'never the inverted large-bowel claim for melena')
  assert.ok(/stool red flag/.test(html) && /leads the safety flags at the top/.test(html), 'blood framed as a red flag that leads the band')
  assert.ok(/Mucus (&mdash;|—)/.test(html), 'mucus surfaced')
  assert.ok(/often benign on its own/.test(html), 'mucus framed monitor-tier, never an escalation')
  assert.ok(!/0 of \d/.test(html), 'never a "0 of N"')
})

Deno.test('stool: haematochezia (fresh_red) blood named distinctly from melena', () => {
  const html = renderReport(base({
    stool: {
      total: 1, normalCount: 0, looseCount: 1, windowDays: 7, loggedDays: 7,
      ai: {
        totalIncidents: 1, withAnalysis: 1,
        states: { completed: 1, uncertain: 0, failed: 0, pending: 0 }, assessedCount: 1,
        consistencyDistribution: { type_6_mushy: 1 }, colourDistribution: { red_streaked: 1 },
        bloodPresent: [{ eventId: 'e1', occurredAt: '2026-06-15T12:00:00Z', kind: 'fresh_red' }],
        mucusPresent: [], reviewedCount: 0,
      },
    },
  }))
  assert.ok(/haematochezia/.test(html), 'fresh_red named as haematochezia')
  assert.ok(!/melena/.test(html.replace(/digested \(melena\)/g, '')), 'fresh_red not mislabelled melena')
})

// ── Coverage: full diet/meds — trial + human food + established association ─────────

Deno.test('diet/meds render an active trial, the human-food confounder line, and an association (never causal)', () => {
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'vomit' },
      diet: {
        trialTargetProtein: null,
        trial: {
          foodLabel: 'RC Hydrolyzed HP',
          primaryProtein: 'hydrolyzed',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          vetName: 'Dr. Chen',
          proteinSet: pset(['hydrolyzed']),
        },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: { ratedMeals: 80, finishedMeals: 78, rate: 0.975, intakeBreakdown: [{ rating: 'all', count: 78 }, { rating: 'some', count: 2 }] },
        mealItems: [],
        treats: { count: 7, distinctItems: 2 },
        humanFood: { count: 3, days: 3, items: [{ date: '2026-05-19', label: 'Roast chicken' }] },
        previousDiet: null,
        medicationVehicles: null,
      },
      correlation: {
        established: [
          {
            symptomType: 'vomit',
            protein: 'chicken',
            matchedPairs: 20,
            caseExposed: 8,
            controlExposed: 2,
            riskDifference: 0.3,
            pValue: 0.02,
            symptomEventCount: 12,
            correlationWindowHours: 24,
          },
        ],
        hasEstablished: true,
        noThreshold: false,
        stapleProtein: null,
        timing: [],
      },
    }),
  )
  assert.ok(html.includes('RC Hydrolyzed HP'), 'trial food named')
  assert.ok(/Human food/.test(html) && html.includes('Roast chicken'), 'human-food confounder line (B-102)')
  assert.ok(html.includes('chicken') && /not a proven cause/i.test(html), 'association, explicitly not causal')
})

// ── B-351 slice 6: a JOINT established correlation declares itself on the lead line ──

Deno.test('a joint established correlation says it cannot be attributed to either protein', () => {
  // Dr. Chen scans this line in seconds and acts on it. "Chicken and duck reached the
  // established association threshold" reads as two independently-implicated antigens —
  // and a vet who drops both from the diet has removed the one manipulation that would
  // have told them which it was. The engine refuses to credit a member; the report must
  // not un-refuse it by omission.
  const joint = (over: Record<string, unknown> = {}) =>
    base({
      correlation: {
        established: [
          {
            symptomType: 'vomit' as const,
            protein: 'chicken and duck',
            proteins: ['chicken', 'duck'],
            matchedPairs: 20,
            caseExposed: 8,
            controlExposed: 2,
            riskDifference: 0.3,
            pValue: 0.02,
            symptomEventCount: 12,
            correlationWindowHours: 24,
            ...over,
          },
        ],
        hasEstablished: true,
        noThreshold: false,
        stapleProtein: null,
        timing: [],
      },
    })

  const html = renderReport(joint())
  assert.ok(html.includes('chicken and duck'), 'both proteins are named on the lead line')
  assert.ok(/cannot be attributed to either one individually/i.test(html), 'the caveat is stated')
  assert.ok(/separating them would be informative/i.test(html), 'and the informative next step')
  assert.ok(/not a proven cause/i.test(html), 'the existing non-causal framing survives')

  // Regression fence: a single-protein established correlation is untouched.
  const single = renderReport(joint({ protein: 'chicken', proteins: ['chicken'] }))
  assert.equal(/cannot be attributed to either one individually/i.test(single), false)

  // And a correlation cached before slice 6 (no `proteins` at all) still renders.
  const legacy = renderReport(joint({ protein: 'chicken', proteins: undefined }))
  assert.ok(legacy.includes('chicken'))
  assert.equal(/cannot be attributed to either one individually/i.test(legacy), false)
})

// ── Coverage: reading-the-trend GP-0 note + a zero-count week renders a visible nub ─

Deno.test('a zero-count week renders a nub (never blank) + the GP-0 note names concurrent changes', () => {
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'vomit',
          count: 3,
          weeklyBuckets: [2, 0, 1], // a zero week in the middle
          bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15'],
          windowDays: 21,
        }),
      ],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  assert.ok(html.includes('class="nub"'), 'a zero-count week draws a visible nub, not a blank')
  assert.ok(/Reading the trend/.test(html))
  assert.ok(/cannot be attributed/i.test(html), 'GP-0 co-attribution caution')
  assert.ok(html.includes('RC HP') && html.includes('Metronidazole'), 'every concurrent change is named')
})

// ── A1: a standing (pre-window) confounder is named in the GP-0 note as "ongoing" ──────

Deno.test('a standing pre-window intervention is named "ongoing" in the Reading-the-trend note', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 3, weeklyBuckets: [1, 1, 1], windowDays: 21 })],
      concurrentChanges: [
        // A steroid begun before the window, running throughout — no chart marker, but MUST
        // be named or the diet silently takes its credit (spec §4/B-117).
        { kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  assert.ok(/Prednisolone/.test(html), 'the standing steroid is named')
  assert.ok(/ongoing since/i.test(html), 'a pre-window intervention reads "ongoing since", not "started"')
  assert.ok(/RC HP.*started/is.test(html), 'an in-window intervention still reads "started"')
  assert.ok(/cannot be attributed to any one of them alone/i.test(html), 'co-attribution caution holds')
})

Deno.test('B-233 — a lone standing free-fed diet renders as context ("Present during this window"), not a change', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 3, weeklyBuckets: [1, 1, 1], windowDays: 21 })],
      concurrentChanges: [
        // A free-fed maintenance diet, null start (its logged date is a first-food-log, not a
        // real diet start — B-233). Must read as standing context, never "One change overlaps".
        { kind: 'free_fed', label: 'Royal Canin Weight', startDate: null, bucketIndex: null, ongoing: true, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/Present during this window:/.test(text), 'a standing diet is framed as present context')
  assert.ok(!/change overlaps this window/i.test(text), 'a standing maintenance diet is NOT called a change')
  assert.ok(/free-fed Royal Canin Weight \(ongoing, start not recorded\)/.test(text), 'named with honest null-start timing')
  assert.ok(/cannot be attributed to it alone/i.test(text), 'the singular co-attribution caution still fires on one confounder')
  assert.ok(!/undefined/.test(html) && !/start &middot;/.test(html) && !/start · /.test(text), 'no false date or dashed chart marker leaks from a null start')
})

// ── The document is a complete, standalone artifact ────────────────────────────────

Deno.test('renders a complete standalone HTML document with a titled head', () => {
  const html = renderReport(base())
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('<title>Owner-reported summary — Nyx'))
  assert.ok(html.includes('name="referrer" content="no-referrer"'), 'privacy meta present')
  assert.ok(html.trimEnd().endsWith('</html>'))
})

// ── A2: a concurrent free-fed bowl appears in the WSAVA diet history + antigen tally ──────
// A competing-protein bowl left down during an elimination trial is the single thing most
// likely to break it; it must not be hidden from Appendix C or the Appendix B tally.

Deno.test('A2 — an active trial + a free-fed bowl: the bowl shows in Appendix C and the Appendix B tally', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: {
          foodLabel: 'RC Hydrolyzed HP',
          primaryProtein: 'hydrolyzed',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          vetName: null,
          proteinSet: pset(['hydrolyzed']),
        },
        freeFed: [{ foodLabel: 'Duck & pea kibble (bowl down)', primaryProtein: 'duck', proteinSet: pset(['duck']), activeFrom: '2026-01-01', activeUntil: null , isShared: false }],
        intakeNotDirectlyObserved: true,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  // Appendix C "Primary diet" now carries BOTH the trial food and the concurrent free-fed bowl.
  assert.ok(html.includes('RC Hydrolyzed HP'), 'trial food named')
  assert.ok(html.includes('Also free-fed alongside') && html.includes('Duck &amp; pea kibble (bowl down)'), 'the free-fed bowl is in the WSAVA diet history under an active trial')
  // Appendix B tally names the free-fed competing antigen (it has no discrete count).
  // B-351 slice 5: the clause now names the free-fed food's whole captured SET (an ad-lib
  // bowl's hidden secondary is the worst version of a trial breach) and title-cases each
  // key, matching the protein column and the chart legend.
  assert.ok(
    /Free-fed alongside the trial:<\/b> Duck \(continuously available/.test(html),
    'free-fed protein named as a trial-breaking antigen',
  )
})

// ── A4: no-trial (symptom-monitoring) report never asserts a diet trial ─────────────────

Deno.test('A4 — a no-trial report frames human food as a general confounder, not a "diet-trial" one', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 2, days: 2, items: [{ date: '2026-06-01', label: 'Toast' }, { date: '2026-06-05', label: 'Rotisserie chicken' }] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/a common dietary confounder/.test(html), 'monitoring-mode framing')
  assert.ok(!/#1 diet-trial confounder/.test(html), 'no "diet-trial confounder" claim without a trial')
  assert.ok(!/reads as .{0,3}not working/.test(html), 'Appendix B header does not assert a trial')
  assert.ok(!/break an elimination trial/.test(html), 'the tally does not assert an elimination trial')
})

// ── A6: human-food items are de-duplicated (no "Ground beef, Ground beef, ..." repeat) ──

Deno.test('A6 — repeated human-food items render distinct, not verbatim-repeated', () => {
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'vomit' },
      diet: {
        trialTargetProtein: null,
        trial: { foodLabel: 'HP', primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed']), startedAt: '2026-05-08', targetDurationDays: 56, vetName: null },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: {
          count: 4,
          days: 3,
          items: [
            { date: '2026-06-01', label: 'Ground beef' },
            { date: '2026-06-02', label: 'Ground beef' },
            { date: '2026-06-03', label: 'Ground beef' },
            { date: '2026-06-04', label: 'Rice' },
          ],
        },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  // The page-1 human-food line keeps the "4 feedings" count but lists each distinct item ONCE.
  const beefHits = (html.match(/Ground beef/g) ?? []).length
  assert.equal(beefHits, 2, 'Ground beef appears once on page 1 and once in Appendix C, never 4x per line')
  assert.ok(html.includes('Rice'), 'the other distinct item is still listed')
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  assert.ok(/4 feeding/.test(text), 'the feeding COUNT is preserved (only the item list is collapsed)')
})

// ── Adversarial re-verify (PR 4 round 2): honest confounder timing in "Reading the trend" ──

Deno.test('a confounder that ended mid-window reads "until <date>", never a false "ongoing since"', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 3, weeklyBuckets: [1, 1, 1], windowDays: 21 })],
      concurrentChanges: [
        // Pre-window start, stopped mid-window → must NOT read present-tense "ongoing since".
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-20', endBucketIndex: 2, endIsDeclared: true },
        // Standing arrangement, start unrecorded, still active → "ongoing, start not recorded".
        { kind: 'free_fed', label: 'Duck bowl', startDate: null, bucketIndex: null, ongoing: true, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  assert.ok(/until May 20/.test(html), 'a mid-window-stopped confounder is timed with its end date')
  assert.ok(!/Metronidazole \(medication\) \(ongoing since/.test(html), 'not falsely "ongoing since" after it stopped')
  assert.ok(/ongoing, start not recorded/.test(html), 'a null-start standing bowl reads honestly, not "since undefined"')
  assert.ok(!/undefined/.test(html), 'no undefined leaks from a null start date')
})

// ── Appendix B category label parity: a format='treat' exposure reads "Treat", not "Off-diet" ──

Deno.test('Appendix B labels a format=treat exposure "Treat" (label parity with the treat count)', () => {
  const html = renderReport(
    base({
      provenance: {
        ownerReported: true,
        totalSymptomIncidents: 0,
        estimatedOrWindowCount: 0,
        deletedExcluded: true,
        uncategorisedObservations: 0,
        symptomLog: [],
        intakeLog: [],
        intakeLogHiddenOlder: 0,
        intakeLogScope: null,
        confounders: [
          { eventId: 'e1', occurredAt: '2026-06-01T16:00:00Z', dayKey: '2026-06-01', foodLabel: 'Jerky', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'other', note: null },
        ],
        proteinExposureTally: { chicken: 1 }, proteinUnknownCount: 0,
        conditions: [],
      },
    }),
  )
  // The row is labelled "Treat" (format='treat'), not "Off-diet"; the protein is still tallied.
  assert.ok(/<td>Treat<\/td>/.test(html), 'a format=treat row reads "Treat"')
  assert.ok(!/<td>Off-diet<\/td>/.test(html), 'not mislabelled "Off-diet"')
  // Title-cased since B-351 slice 5 — the protein column, the tally and the chart legend
  // all render the canonical key the same way.
  assert.ok(/Chicken/.test(html), 'the antigen is retained')
})

// ── PM feedback round 1 (2026-07-03) — fixes from the first real on-device artifact ──

Deno.test('B-010 one-sided window → "before/after <bound>" + range tag, never a bare point', () => {
  const beforeOnly = logEntry({
    type: 'vomit',
    occurredAt: '2026-05-18T07:09:00Z',
    occurredAtConfidence: 'window',
    occurredAtLatest: '2026-05-18T07:09:00Z',
  })
  const afterOnly = logEntry({
    eventId: 'ev-2',
    type: 'vomit',
    occurredAt: '2026-05-19T12:00:00Z',
    occurredAtConfidence: 'window',
    occurredAtEarliest: '2026-05-19T09:00:00Z',
  })
  const html = renderReport(
    base({
      provenance: {
        ...base().provenance,
        symptomLog: [beforeOnly, afterOnly],
        totalSymptomIncidents: 2,
        estimatedOrWindowCount: 2,
      },
    }),
  )
  assert.ok(/before 03:09/.test(html), 'one-sided (latest) renders "before <time>"')
  assert.ok(/after 05:00/.test(html), 'one-sided (earliest) renders "after <time>"')
  // CUL-634 — the words ARE the tag: a `range` chip beside "before 03:09" restated the cell.
  // (The one-sided rows still count as non-witnessed in the preamble — asserted below.)
  assert.ok(!/before 03:09<\/span>\s*<span class="conf">range/.test(html), '"before" carries no range chip')
  assert.ok(!/after 05:00<\/span>\s*<span class="conf">range/.test(html), '"after" carries no range chip')
  assert.ok(/<span class="num">2<\/span> of the <span class="num">2<\/span> events below carry no witnessed time/.test(html), 'both one-sided rows are counted as non-witnessed, with the denominator adjacent')
})

Deno.test('B-010 null confidence → explicit "unspecified" tag, and the legend defines it', () => {
  // Built past `logEntry`'s `?? 'witnessed'` default, which had been turning this null into a
  // witnessed row — and the assertion below used to be satisfied by the LEGEND's own chip, so
  // the test was green while the fixture never exercised the branch (CUL-993, found while
  // adding the CUL-634 count). It now reads the table cell.
  const legacy = { ...logEntry({ type: 'vomit', occurredAt: '2026-06-21T21:06:00Z' }), occurredAtConfidence: null }
  const html = renderReport(
    base({
      provenance: { ...base().provenance, symptomLog: [legacy], totalSymptomIncidents: 1 },
    }),
  )
  assert.ok(/<td><span class="num">~17:06<\/span> <span class="conf">unspecified<\/span><\/td>/.test(html), 'null confidence is tagged in the ROW, drawn approximate, not bare')
  assert.ok(/logged without a time confidence/.test(html), 'legend explains the unspecified tag')
})

Deno.test('legend defines the "N logs" duplicate tag', () => {
  const html = renderReport(base())
  assert.ok(/Duplicate logs/.test(html), 'legend has a Duplicate logs entry')
  assert.ok(/counted once/i.test(html))
})

Deno.test('chronicity flag copy — no engine "across N weeks"; episodes-on-days phrasing traces to appendix A', () => {
  const flag: SafetyFlag = {
    kind: 'chronicity',
    symptomType: 'vomit',
    episodeCount: 22,
    spanDays: 46,
    activeWeeks: 5,
    symptomDays: 19,
    daysSinceLastEpisode: 4,
    firstOnsetIso: '2026-05-14T14:00:00Z',
    firstLoggedIso: '2026-05-14T14:00:00Z',
    tier: 'standard',
    windowDays: 56,
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(!/across 5 weeks/.test(html), 'the phase-stable activeWeeks measure is not rendered (contradicted the calendar chart)')
  assert.ok(/22<\/span> episodes on <span class="num">19<\/span> days/.test(html.replace(/\s+/g, ' ')) || /episodes on/.test(html), 'episodes-on-days phrasing')
})

Deno.test('foreign-material note keeps its own terminal punctuation — never ".."', () => {
  const flag: SafetyFlag = {
    kind: 'present_foreign',
    incidents: [
      { eventId: 'v1', occurredAt: '2026-05-18T07:09:00Z', note: 'A small blue object is visible near the vomit; their proximity is notable.' },
    ],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(!html.includes('notable..'), 'no double period')
  assert.ok(html.includes('notable.'), 'note still ends with a period')
})

Deno.test('at-a-glance weight tile never shows an out-of-window (stale) reading', () => {
  const html = renderReport(
    base({
      weight: {
        isEmpty: false,
        latest: { kg: 4.2, lbs: 9.3, date: '2025-11-01' }, // months before the window
        trend: null, // nothing in-window
      },
    }),
  )
  // The Weight block discloses the stale reading with its "(before this window)" caveat…
  assert.ok(/before this window/.test(html), 'weight block carries the caveat')
  // …and the SIDE is derived, not assumed (B-600, cold read round 11). This test
  // asserted the literal string, so it locked the bug in: the caveat was hardcoded on
  // the reasoning that a reading outside the window must predate it, which fails for a
  // hand-picked window that closes in the past. On a completed trial the patient's only
  // weight — taken after the window, at the end of the diet — read as a pre-trial
  // baseline, which is a different clinical question.
  const after = renderReport(
    base({
      scope: { ...base().scope, isCustomOverride: true, endDate: '2026-06-01', endDayNum: 20605 },
      weight: {
        isEmpty: false,
        latest: { kg: 4.2, lbs: 9.3, date: '2026-06-20' },
        trend: null,
      },
    }),
  )
  assert.ok(/after this window/.test(after), 'a reading past the window end says so')
  assert.ok(!/before this window/.test(after))
  // …but the bare tile must NOT carry the stale number (it cannot carry the caveat).
  assert.ok(!/4\.2<\/span><small>&nbsp;kg<\/small><\/div><div class="tl">Latest weigh-in/.test(html.replace(/\s+/g, '')), 'tile does not show the stale kg')
  assert.ok(/no reading in this window/.test(html), 'tile falls to the honest empty state')
})

Deno.test('appendix C supplements are window-scoped like every other medication view', () => {
  const stale = med({
    regimenId: 'supp-old',
    drugName: 'Ancient Probiotic',
    isSupplement: true,
    overlapsWindow: false,
    startedAt: '2023-01-01',
    endedAt: '2023-03-01',
  })
  const live = med({
    regimenId: 'supp-live',
    drugName: 'Current Fish Oil',
    isSupplement: true,
    overlapsWindow: true,
    startedAt: '2026-05-01',
  })
  const html = renderReport(base({ medications: [stale, live] }))
  assert.ok(!html.includes('Ancient Probiotic'), 'a supplement ended years before the window does not render')
  assert.ok(html.includes('Current Fish Oil'), 'an overlapping supplement renders')
})

Deno.test('appendix lettering — conditional recent-meals is E; the how-to-read page is unlettered (no D→F gap)', () => {
  // Without an intake log: A–D render, no "Appendix E", no "Appendix F" anywhere.
  const calm = renderReport(base())
  assert.ok(!calm.includes('Appendix E'), 'no appendix E without an intake flag')
  assert.ok(!calm.includes('Appendix F'), 'the how-to-read page carries no letter')
  assert.ok(calm.includes('How to read this report'))
  // With an intake log: the recent-meals appendix is lettered E.
  const withIntake = renderReport(
    base({
      provenance: {
        ...base().provenance,
        // A non-empty log with a null scope is a state the pipeline cannot produce (B-532).
        intakeLogScope: 'intake_flag',
        intakeLog: [
          { eventId: 'm1', occurredAt: '2026-06-30T12:00:00Z', foodLabel: 'Wet food', intakeRating: 'refused', isLastFullMeal: false, pinned: false },
        ],
      },
    }),
  )
  assert.ok(withIntake.includes('Appendix E — Meals'), 'the meals & intake appendix is lettered E')
})

Deno.test('legend intake entry never promises a suppressed appendix (dangling cross-reference)', () => {
  const calm = renderReport(base())
  assert.ok(
    /no meals were logged in this window/.test(calm),
    'with no meals and no flag the legend says the drill-down is conditional and absent',
  )
  assert.ok(!/in appendix&nbsp;E/.test(calm), 'no dangling reference to an absent appendix')
  const withIntake = renderReport(
    base({
      provenance: {
        ...base().provenance,
        // A non-empty log with a null scope is a state the pipeline cannot produce (B-532).
        intakeLogScope: 'intake_flag',
        intakeLog: [
          { eventId: 'm1', occurredAt: '2026-06-30T12:00:00Z', foodLabel: 'Wet food', intakeRating: 'refused', isLastFullMeal: false, pinned: false },
        ],
      },
    }),
  )
  assert.ok(/in appendix&nbsp;E/.test(withIntake), 'with the appendix present, the legend points at it')
})

Deno.test('appendix B — caption reconciles treats + human food; unknown-protein feedings disclosed; footer ampersand single-escaped', () => {
  const conf: ConfounderExposure[] = [
    { eventId: 'c1', occurredAt: '2026-06-01T12:00:00Z', dayKey: '2026-06-01', foodLabel: 'Treat A', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null },
    { eventId: 'c2', occurredAt: '2026-06-02T12:00:00Z', dayKey: '2026-06-02', foodLabel: 'Treat B', primaryProtein: null, proteinSet: pset(), format: 'treat', foodType: 'treat', note: null },
    { eventId: 'c3', occurredAt: '2026-06-03T12:00:00Z', dayKey: '2026-06-03', foodLabel: 'Rotisserie chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'human_food', foodType: 'meal', note: null },
  ]
  const html = renderReport(
    base({
      provenance: {
        ...base().provenance,
        confounders: conf,
        proteinExposureTally: { chicken: 2 },
        proteinUnknownCount: 1,
      },
    }),
  )
  const flat = html.replace(/\s+/g, ' ')
  // B-531/R2 — on a report with NO trial the caption names what the table lists (the
  // treat/human-food heuristic) rather than asserting an "off-diet exposure" count, which
  // is a verdict against a comparison that was never made: there is no diet to be off.
  assert.ok(/3<\/span> treat or table-food feedings \(/.test(flat), 'caption carries a breakdown parenthetical')
  assert.ok(!/off-diet exposures? \(/i.test(flat), 'the caption does not claim off-diet exposures with no trial')
  assert.ok(/2<\/span> treats/.test(flat) && /1<\/span> human-food feeding/.test(flat), 'treats + human food reconcile to the total')
  assert.ok(/with no recorded protein\)/.test(flat), 'unknown-protein feedings are disclosed in the tally')
  assert.ok(flat.includes('diet, exposures &amp; meds'), 'footer ampersand escaped exactly once')
  assert.ok(!flat.includes('&amp;amp;'), 'no double-escaped ampersand anywhere')
})

// ── Round-2 (B-221) render changes ───────────────────────────────────────────────

function monitoringSnap(over: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return base({
    symptoms: [
      aggregate({
        type: 'vomit',
        count: 22,
        symptomDays: 18,
        windowDays: 91,
        weeklyBuckets: [0, 1, 1, 2, 2, 4, 5, 7],
        bucketStartDates: ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24', '2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'],
        // A 91-day window always HAS halves, so a fixture without them was an impossible
        // state — and it is the page-1 trajectory tile that reads them (B-532).
        trendHalves: {
          days: 45,
          firstCount: 6,
          lastCount: 15,
          firstStartDate: '2026-04-03',
          firstEndDate: '2026-05-17',
          lastStartDate: '2026-05-19',
          lastEndDate: '2026-07-02',
          middleCount: 0,
          middleDate: null,
        },
      }),
    ],
    atAGlance: {
      primarySymptom: { type: 'vomit', count: 22 },
      totalSymptomIncidents: 22,
      anySymptomDays: 0,
      windowDays: 91,
      loggedDays: 40,
      trialDaysLogged: null,
      weightState: 'empty',
      sinceOnsetDays: 46,
      daysSinceLastEpisode: 9,
      loggedDaysSinceLastEpisode: 2,
      firstHalfLoggedDays: 3,
      secondHalfLoggedDays: 37,
    },
    diet: {
      trialTargetProtein: null,
      trial: null,
      freeFed: [],
      intakeNotDirectlyObserved: false,
      mealCompletion: null,
      mealItems: [],
      treats: { count: 340, distinctItems: 29 },
      humanFood: { count: 6, days: 4, items: [] },
      previousDiet: null,
      medicationVehicles: null,
    },
    ...over,
  })
}

Deno.test('R2-2 — no-trial At-a-glance: since-onset + trajectory + treats tiles; the old score tiles are gone', () => {
  const html = renderReport(monitoringSnap())
  assert.ok(/since onset/i.test(html), 'episodes-since-onset tile')
  assert.ok(/46&nbsp;d/.test(html), 'onset-scoped denominator (not the 91-day window)')
  assert.ok(/first &rarr; last half/i.test(html), 'trajectory tile')
  // B-531/R2 — the label names what the tile counts. It led "Off-diet load" on a report
  // with no trial, importing a verdict from a comparison that was never made.
  assert.ok(/Treats &amp; table food/.test(html) && html.includes('>340</span>') && /treats/.test(html) && /distinct/.test(html) && /table food/.test(html), 'the treats tile leads with the treat load')
  assert.ok(!/Off-diet load/.test(html), 'no off-diet verdict on a no-trial report')
  // The misleading pre-round-2 tiles do not appear on the no-trial shape.
  assert.ok(!/Meals fully eaten \(rated meals only\)/.test(html), 'no "meals fully eaten" score on the no-trial shape')
})

Deno.test('R2-2 ADVERSARIAL — the days-since-last-episode tile never reads as recovery; the caveat scales with the gap', () => {
  const html = renderReport(monitoringSnap())
  // HR-7 (CUL-676): "entry" — this tile's day count comes from the last deduped ROW, not a
  // chained episode, so it no longer borrows the chronicity flag's noun.
  assert.ok(/Since the most recent entry/.test(html), 'days-since tile present')
  // 9 days since, only 2 of them logged → the coverage is disclosed AND framed "not recovery".
  assert.ok(/2 of the last <span class="num">9<\/span> days logged/.test(html) || /of the last .*9.* days logged/.test(html), 'sparse-gap coverage disclosed')
  assert.ok(/not recovery/i.test(html), 'a gap is never allowed to read as recovery')
  // A short, well-logged gap still carries the neutral non-recovery framing (no coverage caveat).
  const dense = renderReport(monitoringSnap({ atAGlance: { ...monitoringSnap().atAGlance, daysSinceLastEpisode: 1, loggedDaysSinceLastEpisode: 1 } }))
  assert.ok(/not a measure of recovery/i.test(dense), 'short gap still framed as not-recovery')
  // A LONG, fully-logged gap gets the MOST emphatic caveat, never the thinnest (adversarial residual).
  const longGap = renderReport(monitoringSnap({ atAGlance: { ...monitoringSnap().atAGlance, daysSinceLastEpisode: 40, loggedDaysSinceLastEpisode: 40 } }))
  assert.ok(/a gap is not evidence the signs resolved/.test(longGap), 'a long well-logged gap gets the strongest non-recovery caveat')
})

Deno.test('R2-2 — a diet-trial report keeps the trial-oriented tiles', () => {
  const snap = base({
    symptoms: [aggregate({ type: 'vomit', count: 5 })],
    diet: {
      ...base().diet,
      trial: { foodLabel: 'Hydrolyzed', primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed']), startedAt: '2026-05-01', targetDurationDays: 56, vetName: null },
      mealCompletion: { ratedMeals: 50, finishedMeals: 48, rate: 0.96, intakeBreakdown: [{ rating: 'all', count: 48 }, { rating: 'some', count: 2 }] },
      mealItems: [],
    },
    atAGlance: { ...base().atAGlance, trialDaysLogged: 38, primarySymptom: { type: 'vomit', count: 5 }, totalSymptomIncidents: 5 },
    // B-417 PR 7: the tile now reads its BOTH numbers off the trial block's one
    // overlap range, rather than a window-scoped numerator over a trial-scoped
    // denominator. `atAGlance.trialDaysLogged` is the same number by construction.
    trial: trialBlockFixture({ startedAt: '2026-05-01', coverage: { daysLogged: 38, daysElapsed: 45 } }),
  })
  const html = renderReport(snap)
  assert.ok(/Days a meal was logged/.test(html), 'coverage tile on a trial report')
  assert.ok(/not intake, not a clean-elimination count/.test(html), 'coverage is about the RECORD, not what was eaten')
  assert.ok(/38/.test(html) && /45/.test(html), 'both sides of the coverage ratio render')
  // R2-2's point survives PR 7: a trial report still gets the trial tile set, not
  // the symptom-trajectory one.
  assert.ok(!/Episodes since onset/.test(html), 'not the monitoring tile set')
})

Deno.test('R2-3 — a free-fed grazer with NO decline flag gets a descriptive feeding line, not "0 of N fully eaten"', () => {
  const snap = base({
    diet: {
      ...base().diet,
      freeFed: [{ foodLabel: 'RC Weight', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: null, activeUntil: null , isShared: false }],
      intakeNotDirectlyObserved: true,
      mealCompletion: { ratedMeals: 25, finishedMeals: 0, rate: 0, intakeBreakdown: [{ rating: 'some', count: 25 }] },
      mealItems: [],
    },
    safetyFlags: [],
  })
  const html = renderReport(snap)
  assert.ok(/Primarily free-fed/.test(html), 'descriptive free-fed line')
  assert.ok(/Intake not directly observed/.test(html), 'verbatim B-040 string preserved')
  assert.ok(/typically/.test(html), 'descriptive intake-mode texture (not a score)')
  assert.ok(!/rated meals fully eaten/.test(html), 'not the scored completion FIGURE the else-branch renders')
  // B-532 — TWO COLD READS COLLIDE HERE, and both are honoured. R2-3 kept the descriptive
  // adverb off this branch's scored figure (a grazing cat's discrete meals routinely go
  // unfinished, and "0 of 25 meals fully eaten" reads as anorexia). Round 7 found the cost of
  // the adverb alone: it was the only page-1 intake statement with no numbers behind it, and
  // it showed up only on the report that read well. The count is now stated INSIDE the
  // descriptive sentence, where "Primarily free-fed … Intake not directly observed" leads it.
  assert.ok(/0 of 25 fully eaten/.test(text(html)), 'the denominator is on page 1, not only in appendix E')
  assert.ok(
    /Primarily free-fed[\s\S]{0,80}Intake not directly observed/.test(text(html)),
    'and the framing that protects the grazer still leads it',
  )
})

Deno.test('R2-3 — a free-fed pet WITH a decline flag keeps the scored figure (flag leads; the number matters)', () => {
  const flag: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3,
    recentScore: 1,
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 20,
    lastFullMealIso: '2026-06-28T18:00:00Z',
    hoursSinceLastFullMeal: 90,
  }
  const snap = base({
    diet: {
      ...base().diet,
      freeFed: [{ foodLabel: 'RC Weight', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: null, activeUntil: null , isShared: false }],
      intakeNotDirectlyObserved: true,
      mealCompletion: { ratedMeals: 25, finishedMeals: 5, rate: 0.2, intakeBreakdown: [{ rating: 'all', count: 5 }, { rating: 'some', count: 20 }] },
      mealItems: [],
    },
    safetyFlags: [flag],
    provenance: { ...base().provenance, intakeLogScope: 'intake_flag', intakeLog: [{ eventId: 'm1', occurredAt: '2026-06-28T18:00:00Z', foodLabel: 'RC', intakeRating: 'all', isLastFullMeal: true, pinned: false }] },
  })
  const html = renderReport(snap)
  assert.ok(/rated meals fully eaten/.test(html), 'the scored figure stays when a decline flag is present')
})

Deno.test('R2-1 — Appendix B groups repeated treats (count + span); human food stays itemised; the tally leads', () => {
  const conf: ConfounderExposure[] = [
    { eventId: 't1', occurredAt: '2026-06-15T13:00:00Z', dayKey: '2026-06-15', foodLabel: 'Temptations Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null },
    { eventId: 't2', occurredAt: '2026-06-20T13:00:00Z', dayKey: '2026-06-20', foodLabel: 'Temptations Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null },
    { eventId: 't3', occurredAt: '2026-07-03T13:00:00Z', dayKey: '2026-07-03', foodLabel: 'Temptations Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null },
    { eventId: 'h1', occurredAt: '2026-06-18T18:00:00Z', dayKey: '2026-06-18', foodLabel: 'Ground beef', primaryProtein: 'beef', proteinSet: pset(['beef']), format: 'human_food', foodType: 'meal', note: 'from my plate' },
  ]
  const snap = base({
    provenance: { ...base().provenance, confounders: conf, proteinExposureTally: { chicken: 3, beef: 1 }, proteinUnknownCount: 0 },
    diet: { ...base().diet, treats: { count: 3, distinctItems: 1 }, humanFood: { count: 1, days: 1, items: [] } },
  })
  const html = renderReport(snap)
  assert.ok(/Temptations Chicken/.test(html), 'the treat item')
  assert.ok(/&times;<span class="num">3<\/span>/.test(html), 'the three identical treats collapse to one row ×3')
  assert.ok(/Jun 15 &ndash; Jul 3/.test(html), 'the grouped row shows a date span')
  assert.ok(/Ground beef/.test(html) && /from my plate/.test(html), 'human food itemised, its note preserved')
  assert.ok(/Protein exposures \(off-diet\)/.test(html), 'the protein tally leads the appendix')
})

Deno.test('R2-5 — page 1 carries an orientation line; the appendices open with a divider', () => {
  const html = renderReport(base())
  // CUL-993 A.5 — the line says the summary comes FIRST; it never says "this page", because the
  // summary is two to three printed sheets on every fixture.
  assert.ok(/Clinical summary first; appendices A&ndash;[A-G] and a legend follow/.test(html), 'orientation line on page 1, true')
  assert.ok(!/Clinical summary: this page/.test(html), 'the false one-page promise is gone')
  assert.ok(/End of clinical summary/.test(html), 'divider before the appendices')
  assert.ok(/reference record behind every figure/.test(html), 'divider explains the appendices')
})

Deno.test('R2-4/R2-6 — one uniform AI badge; safety-band header hedge removed; footer labels the patient', () => {
  const flag: SafetyFlag = { kind: 'present_blood', source: 'vomit', incidents: [{ eventId: 'v1', occurredAt: '2026-06-18T18:00:00Z', kind: 'coffee_ground' }] }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/AI read &middot; unconfirmed/.test(html), 'the uniform AI badge')
  assert.ok(!/owner-reported · not a diagnosis<\/span>/.test(html), 'safety-band header no longer restates the masthead hedge')
  assert.ok(/Patient: Nyx/.test(html), 'footer labels the patient explicitly')
})

Deno.test('R2-6 — an intervention marker is a neutral "start ·" label (no ▲ spike) with a chart legend line', () => {
  const snap = base({
    symptoms: [
      aggregate({
        type: 'vomit',
        count: 5,
        weeklyBuckets: [1, 1, 1, 1, 1],
        bucketStartDates: ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24', '2026-05-01'],
      }),
    ],
    concurrentChanges: [{ kind: 'medication', label: 'Metronidazole', startDate: '2026-04-20', bucketIndex: 2, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true }],
  })
  const html = renderReport(snap)
  assert.ok(!html.includes('▲'), 'no triangle spike glyph on the chart')
  assert.ok(/med start &middot;/.test(html), 'neutral "start ·" marker label, naming its kind on the face')
  assert.ok(/dashed vertical marks the <b>week<\/b> a treatment or diet change started/i.test(html), 'chart legend line explains the marker is week-granular (B-496)')
})

// ── R-14 (CUL-291): the trend chart marks intervention STOPS as well as starts ──────────
//
// The legend promised the week something "started" and delivered exactly that, so a drug
// coming off mid-window was drawn by nothing while "Reading the trend" counted it as a
// change — the chart and the sentence beside it disagreed about how many changes there were.
// The clinical cost is the reading this makes possible: a steroid withdrawn as the flares
// fell is the strongest argument the record holds for a diet working, and it was invisible.

/** The chart SVG only — a page-wide `includes` cannot tell a chart glyph from a prose word. */
function firstChart(html: string): string {
  const m = /<svg viewBox="0 0 648 158".*?<\/svg>/s.exec(html)
  assert.ok(m, 'the fixture renders a symptom chart')
  return m[0]
}

/**
 * Every `<line>` on the chart, with its BASE class separated from the `on` (inverted-ink)
 * modifier. Matching `[a-z]+` was the first cut and it skipped every `class="mark on"` outright,
 * which would have made each of the absence assertions below green over a real leak.
 */
function chartLines(svg: string): { cls: string; on: boolean; x1: number; y1: number; x2: number; y2: number }[] {
  return [...svg.matchAll(/<line class="([a-z]+)( on)?" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)].map(
    (m) => ({ cls: m[1], on: m[2] !== undefined, x1: Number(m[3]), y1: Number(m[4]), x2: Number(m[5]), y2: Number(m[6]) }),
  )
}

const stopWeeks = (over: Partial<SymptomAggregate> = {}): SymptomAggregate =>
  aggregate({
    type: 'vomit',
    count: 6,
    weeklyBuckets: [4, 1, 1, 0],
    bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'],
    windowDays: 28,
    ...over,
  })

Deno.test('R-14 — a course that STOPPED mid-window draws its own glyph and a dated "stop ·" label', () => {
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          // The canonical case: a steroid begun BEFORE the window, withdrawn inside it. No
          // start marker is possible — its only in-window transition is the stop.
          {
            kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
            ongoing: true, endInWindow: '2026-05-12', endBucketIndex: 1, endIsDeclared: true,
          },
        ],
      }),
    ),
  )
  assert.ok(/med stop &middot; May 12/.test(svg), 'the stop is labelled with its own date, naming its kind on the face')
  const lines = chartLines(svg)
  assert.ok(lines.some((l) => l.cls === 'markend'), 'the stop draws a rule of its own class, distinct from a start')
  assert.ok(lines.some((l) => l.cls === 'markcap'), 'and a flat head — a second non-colour channel for a B&W photocopy (§5.8)')
  assert.ok(!lines.some((l) => l.cls === 'mark'), 'a stop is NOT drawn as a start')
  assert.ok(!svg.includes('▲'), 'still no triangle spike glyph (R2-6)')
})

Deno.test('R-14 — a starts-only window draws no stop glyph (the fixture that must stay clean)', () => {
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          {
            kind: 'medication', label: 'Metronidazole', startDate: '2026-05-12', bucketIndex: 1,
            ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
          },
        ],
      }),
    ),
  )
  const lines = chartLines(svg)
  assert.ok(lines.some((l) => l.cls === 'mark'), 'the start still draws')
  assert.equal(lines.filter((l) => l.cls === 'markend' || l.cls === 'markcap').length, 0, 'nothing stopped, so no stop glyph')
  assert.ok(!/stop/.test(svg), 'and no "stop" word anywhere on the chart')
})

Deno.test('R-14 — a course ending AFTER the window draws no stop (the window end is not a stop)', () => {
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          // Still running at the window end. `endInWindow` is null BY CONSTRUCTION for this
          // case (it is only set when the course stopped strictly before the end), and drawing
          // a stop here would tell a vet a drug was withdrawn when it is still on board — the
          // direction of error that ends a treatment.
          {
            kind: 'medication', label: 'Prednisolone', startDate: '2026-05-12', bucketIndex: 1,
            ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
          },
        ],
      }),
    ),
  )
  assert.equal(chartLines(svg).filter((l) => l.cls === 'markend' || l.cls === 'markcap').length, 0, 'no stop glyph for a course still running')
  assert.ok(/med start &middot; May 12/.test(svg), 'its start still marks')
})

Deno.test('R-14 — a start and a stop in ONE week draw both rules and print both labels, in date order', () => {
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          {
            kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-09', bucketIndex: 1,
            ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
          },
          {
            kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
            ongoing: true, endInWindow: '2026-05-13', endBucketIndex: 1, endIsDeclared: true,
          },
        ],
      }),
    ),
  )
  assert.ok(/diet start &middot; May 9; med stop &middot; May 13/.test(svg), 'both labels print — neither is dropped to make room')
  const lines = chartLines(svg)
  const start = lines.find((l) => l.cls === 'mark')
  const stop = lines.find((l) => l.cls === 'markend')
  assert.ok(start && stop, 'both rules are drawn')
  assert.notEqual(start.x1, stop.x1, 'they step apart rather than overprinting each other')
  // May 9 is before May 13, so the start sits LEFT. A position that contradicted the printed
  // dates would be a false claim for free; the step asserts order only, never a day.
  assert.ok(start.x1 < stop.x1, 'the earlier transition sits left of the later one')
  // Both rules must sit inside the bucket's own slot, or the pair reads as two weeks (B-496).
  const slot = (628 - 40) / 4
  assert.ok(Math.abs(start.x1 - stop.x1) < slot / 2, 'and close enough that the pair still reads as ONE week (B-496)')
})

Deno.test('R-14 — several stops in one week list their dates; past three, the count and the week', () => {
  const stopper = (label: string, day: string, bucket: number) => ({
    kind: 'medication' as const, label, startDate: '2026-03-01', bucketIndex: null,
    ongoing: true, endInWindow: day, endBucketIndex: bucket, endIsDeclared: true,
  })
  const two = firstChart(
    renderReport(base({ symptoms: [stopWeeks()], concurrentChanges: [stopper('A', '2026-05-09', 1), stopper('B', '2026-05-11', 1)] })),
  )
  assert.ok(/stops &middot; May 9, May 11/.test(two), 'two stops in a week name both dates (the CUL-982 rule, mirrored)')
  const same = firstChart(
    renderReport(base({ symptoms: [stopWeeks()], concurrentChanges: [stopper('A', '2026-05-09', 1), stopper('B', '2026-05-09', 1)] })),
  )
  assert.ok(/2 stops &middot; May 9/.test(same), 'two stops on ONE day say so once, with the count — never "May 9, May 9"')
  const four = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [9, 10, 11, 12].map((d) => stopper(`d${d}`, `2026-05-${d}`, 1)),
      }),
    ),
  )
  assert.ok(/4 stops this week/.test(four), 'past three, the label says the count and the week — never one date for four')
})

Deno.test('R-14 — the chart marks EXACTLY the changes "Reading the trend" counts (one predicate, C-4)', () => {
  // A mid-trial addition to the allowed list is a diet change by the legend's own definition,
  // and it was the case both surfaces got wrong in opposite directions: the chart drew nothing
  // and the sentence did not count it, so the report was quietly one change short of the truth.
  const html = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        {
          kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0,
          ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
        {
          kind: 'diet_allowed', label: 'Dentastix', startDate: '2026-05-09', bucketIndex: 1,
          ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
        {
          kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
          ongoing: true, endInWindow: '2026-05-16', endBucketIndex: 2, endIsDeclared: true,
        },
        // Standing context: present throughout, no dated transition. Counted by NEITHER surface.
        {
          kind: 'free_fed', label: 'Kibble', startDate: null, bucketIndex: null,
          ongoing: true, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
      ],
    }),
  )
  const svg = firstChart(html)
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/3 changes overlap this window/.test(text), 'the sentence counts the three dated transitions')
  // …and the chart carries a mark for each of those three, no more and no fewer.
  const drawn = [...svg.matchAll(/<text class="ann"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1])
    .filter((t) => !/nothing logged/.test(t))
  assert.deepEqual(
    drawn.sort(),
    ['diet start &middot; May 2', 'med stop &middot; May 16', 'permitted &middot; May 9'].sort(),
    'one mark per counted change — the allowed-list addition included, the standing bowl excluded',
  )
  assert.ok(/Present during this window: free-fed Kibble/.test(text), 'the standing bowl is context, not a change')
  assert.ok(!/Kibble/.test(svg), 'and it draws no mark')
})

Deno.test('R-14 — the legend names both glyphs and every marked date; absent when nothing is marked', () => {
  const html = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        {
          kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0,
          ongoing: false, endInWindow: '2026-05-20', endBucketIndex: 2, endIsDeclared: true,
        },
        {
          kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
          ongoing: true, endInWindow: '2026-05-16', endBucketIndex: 2, endIsDeclared: true,
        },
      ],
    }),
  )
  assert.ok(
    /a flat-headed vertical marks the <b>week<\/b> one stopped:/.test(html),
    'the legend teaches the stop glyph, not just the start',
  )
  assert.ok(/the trial diet RC HP from May 2 to May 20/.test(html), 'a change marked at both ends names both dates')
  // The pre-window start is NOT repeated here: there is no vertical for it, and a legend that
  // named it would send a reader hunting the chart for a line that is not on it (B-599).
  assert.ok(/the medication Prednisolone, stopped May 16/.test(html), 'a stop-only change names only its stop')
  assert.ok(!/Prednisolone from Mar 1/.test(html), 'its pre-window start belongs to the prose, not the marker legend')

  // The gate is the same predicate: a window whose only intervention is standing draws no
  // marks, so it carries no legend to explain them.
  const standingOnly = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        {
          kind: 'medication', label: 'Apoquel', startDate: '2026-03-01', bucketIndex: null,
          ongoing: true, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
      ],
    }),
  )
  assert.ok(!/class="chartlegend"/.test(standingOnly), 'no marks drawn ⇒ no legend explaining them')
  assert.equal(chartLines(firstChart(standingOnly)).filter((l) => /^mark/.test(l.cls)).length, 0, 'and no marks')
})

Deno.test('R-14 — the stop is never given a cause: no sentence attributes the fall to the withdrawal', () => {
  const html = renderReport(
    base({
      // Flares fall 4 → 1 → 1 → 0 across the window, and the steroid comes off in week 2. The
      // reading a vet can now DRAW from the chart is exactly the one the page must never WRITE.
      symptoms: [stopWeeks()],
      concurrentChanges: [
        {
          kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0,
          ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
        {
          kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
          ongoing: true, endInWindow: '2026-05-12', endBucketIndex: 1, endIsDeclared: true,
        },
      ],
    }),
  )
  // Scoped to the trend SECTION, not the page: "because" is legitimate prose elsewhere (the
  // allowed-list count explains itself with one), and a page-wide scan would be a test that
  // passes or fails on a section it is not about.
  const from = html.indexOf('Symptom frequency')
  assert.ok(from > 0, 'the trend section renders')
  const to = html.indexOf('<h2', from + 1)
  const text = html.slice(from, to > 0 ? to : undefined).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/Reading the trend/.test(text), 'the slice really is the trend section, note included')
  for (const causal of [
    /because/i, /due to/i, /caused/i, /as the steroid/i, /after stopping/i, /since stopping/i,
    /suggests the diet/i, /consistent with the diet working/i, /improv\w+ after/i, /response to/i,
  ]) {
    assert.ok(!causal.test(text), `no causal caption on the trend (${causal})`)
  }
  assert.ok(
    /cannot be attributed to any one of them alone/.test(text),
    'the associational caution is what the note says, unchanged',
  )
})

// ── R-14 round 2: what the adversarial pass and the cold read broke ─────────────────────

const adHoc = (label: string, from: string, to: string, endBucket: number): ConcurrentChange => ({
  kind: 'medication', label, startDate: from, bucketIndex: 0, ongoing: false,
  endInWindow: to, endBucketIndex: endBucket, endIsDeclared: false,
})

Deno.test('R-14 — an end the owner never DECLARED draws no stop glyph, and is never called "stopped"', () => {
  // The adversarial pass's highest-severity finding. An ad-hoc course has no regimen row, so its
  // span ends at the last dose IN THE RECORD — which an owner who keeps giving a drug and stops
  // logging it produces exactly as an owner who stopped it does. §4.4's lifetime table refuses to
  // let silence fill that field over the same dose rows; this is the surface that has to agree.
  const html = renderReport(
    base({ symptoms: [stopWeeks()], concurrentChanges: [adHoc('Apoquel', '2026-05-02', '2026-05-16', 2)] }),
  )
  const svg = firstChart(html)
  assert.equal(chartLines(svg).filter((l) => l.cls === 'markend' || l.cls === 'markcap').length, 0, 'no stop glyph, because a glyph cannot hedge')
  assert.ok(/med start &middot; May 2/.test(svg), 'its start still marks — the change is still a change')
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/last dose logged May 16/.test(text), 'the date is still reported, with the verb the record supports')
  assert.ok(!/Apoquel \(medication\) \(started May 2, stopped/.test(text), 'never "stopped" over logging silence')
  assert.ok(!/stopped May 16/.test(text), 'nor anywhere else in the note')
  assert.ok(!/Apoquel.*, stopped May 16/.test(html), 'and the legend does not name a stop the chart did not draw')
})

Deno.test('R-14 — a DECLARED end still draws and still reads "stopped" (the undeclared rule is not a blanket)', () => {
  const html = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [{ ...adHoc('Prednisolone', '2026-05-02', '2026-05-16', 2), endIsDeclared: true }],
    }),
  )
  assert.ok(chartLines(firstChart(html)).some((l) => l.cls === 'markend'), 'a declared end draws its stop')
  assert.ok(/started May 2, stopped May 16/.test(html.replace(/<[^>]*>/g, ' ')), 'and reads as a stop')
})

Deno.test('R-14 — a permission is never spoken as an exposure ("permitted", never "started")', () => {
  // A row on the allowed list records that a food became permitted, not that it was fed. Saying
  // "started" manufactures a food challenge with a negative result over zero trials, which a vet
  // can rationally read as "those were fine, keep them".
  const html = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        {
          kind: 'diet_allowed', label: 'Dentastix', startDate: '2026-05-09', bucketIndex: 1,
          ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
        },
      ],
    }),
  )
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/Dentastix \(an allowed food\) \(permitted from May 9\)/.test(text), 'the note says permitted')
  assert.ok(/the allowed food Dentastix, permitted from May 9/.test(text), 'and so does the legend, with the verb attached')
  assert.ok(!/Dentastix.* \(started/.test(text) && !/Dentastix on May 9/.test(text), 'never "started", never a bare date under a "started" sentence')
  assert.ok(/permitted &middot; May 9/.test(firstChart(html)), 'and the chart face says permitted, not "diet added"')
})

Deno.test('R-14 — a marker crossing a bar inverts its ink, and is painted AFTER the bar', () => {
  // The cold read measured the prednisolone stop as a ~3px stub: markers were emitted before the
  // bars and the bar fill is near-black, so every rule crossing a column was painted out. It is
  // worst exactly where it matters — an intervention starts in the week with the most events,
  // because that is why it was started.
  const svg = firstChart(
    renderReport(
      base({
        // bucket 0 is the axis maximum, so its bar runs the full plot height: no headroom at all.
        symptoms: [aggregate({
          type: 'vomit', count: 7, weeklyBuckets: [4, 2, 1, 0],
          bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'], windowDays: 28,
        })],
        concurrentChanges: [
          {
            kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null,
            ongoing: true, endInWindow: '2026-05-03', endBucketIndex: 0, endIsDeclared: true,
          },
        ],
      }),
    ),
  )
  const barTop = Number(/<rect class="bar" x="[\d.]+" y="([\d.]+)"/.exec(svg)?.[1])
  assert.ok(Number.isFinite(barTop), 'the fixture draws a bar')
  const over = chartLines(svg).filter((l) => l.cls === 'markend' && l.on)
  assert.ok(over.length > 0, 'the stretch crossing the bar is drawn paper-on-ink')
  const visible = over.reduce((n, l) => n + (l.y2 - l.y1), 0)
  assert.ok(visible > 40, `the rule stays legible down the bar (${visible}px, was a ~3px stub)`)
  assert.ok(over.every((l) => l.y1 >= barTop - 0.01), 'and only the stretch actually over the bar inverts')
  assert.ok(svg.indexOf('class="markend') > svg.indexOf('class="bar"'), 'markers paint after the bars, or the inversion is painted out in turn')
})

Deno.test('R-14 — marker labels never overprint; they shorten, and the row keeps every mark', () => {
  // On the real clean fixture two marks three days apart landed in adjacent buckets and their
  // labels ran together into "med start · Jundiet added · Jun 8" — garbled text on a clinical
  // figure, which costs the whole page its credibility.
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
          { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-09', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
          { kind: 'diet_allowed', label: 'Dentastix', startDate: '2026-05-16', bucketIndex: 2, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        ],
      }),
    ),
  )
  // Same advance model the emitter lays out with: if the two ever disagree the guard is measuring
  // a different page than the one that ships.
  const spans = [...svg.matchAll(/<text class="ann" x="([\d.]+)" y="11" text-anchor="(\w+)">([^<]*)<\/text>/g)].map((m) => {
    const plain = m[3].replace(/&middot;/g, '·').replace(/&ndash;/g, '–')
    const w = plain.length * 5.6 + 3
    const x = Number(m[1])
    return m[2] === 'end' ? { lo: x - w, hi: x } : { lo: x, hi: x + w }
  })
  assert.equal(spans.length, 3, 'all three marks keep a label — degrading beats dropping')
  const sorted = [...spans].sort((a, b) => a.lo - b.lo)
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].lo >= sorted[i - 1].hi, `label ${i} starts after label ${i - 1} ends (no overprint)`)
  }
})

Deno.test('R-14 — a week whose stop precedes its start reads in the drawn order, not starts-first', () => {
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [
          // Pred ends May 9; ciclosporin begins May 13. Same bucket, stop FIRST.
          { kind: 'medication', label: 'Pred', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-09', endBucketIndex: 1, endIsDeclared: true },
          { kind: 'medication', label: 'Ciclo', startDate: '2026-05-13', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        ],
      }),
    ),
  )
  assert.ok(/med stop &middot; May 9; med start &middot; May 13/.test(svg), 'the earlier transition is named first')
  const lines = chartLines(svg)
  const stop = lines.find((l) => l.cls === 'markend')
  const start = lines.find((l) => l.cls === 'mark')
  assert.ok(stop && start, 'both rules drawn')
  assert.ok(stop.x1 < start.x1, 'and the earlier transition is DRAWN first, so the label order matches the rule order')
})

Deno.test('R-14 — a label never states fewer marks than the week holds', () => {
  // Four stops across three distinct days rendered "stops · May 16, May 17, May 18" — three dates
  // for four marks, CUL-982 item 4's own defect reproduced on the new lane.
  const stopper = (label: string, day: string) => ({
    kind: 'medication' as const, label, startDate: '2026-03-01', bucketIndex: null,
    ongoing: true, endInWindow: day, endBucketIndex: 1, endIsDeclared: true,
  })
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [stopWeeks()],
        concurrentChanges: [stopper('A', '2026-05-09'), stopper('B', '2026-05-09'), stopper('C', '2026-05-10'), stopper('D', '2026-05-11')],
      }),
    ),
  )
  assert.ok(/4 stops &middot; May 9, May 10, May 11/.test(svg), 'the count rides whenever it exceeds the dates')
})

Deno.test('R-14 — a drawn stop earns the withdrawal caveat; a starts-only window does not', () => {
  // The stop marker carves out an apparently de-confounded stretch, and the caution's own
  // rationale ("they overlap in time") tells a sharp reader the prohibition lapses there.
  const withStop = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'medication', label: 'Pred', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-09', endBucketIndex: 1, endIsDeclared: true },
      ],
    }),
  ).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(/does not divide it: its effect can outlast its last day/.test(withStop), 'the caveat is stated where the marker is, and states its warrant')
  assert.ok(/cannot be attributed to any one of them alone/.test(withStop), 'and the original caution still stands')
  const startsOnly = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  ).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(!/outlast its last day/.test(startsOnly), 'and is absent when nothing was withdrawn — a caveat for an absent mark is noise')

  // A withdrawn PERMISSION is not an agent with an effect to outlast. Firing over one would be
  // the exposure reading this pass removed from every other surface.
  const permitOnly = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'diet_allowed', label: 'Dentastix', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-09', endBucketIndex: 1, endIsDeclared: true },
      ],
    }),
  )
  assert.ok(/markend/.test(firstChart(permitOnly)), 'the withdrawn permit still draws its stop')
  assert.ok(
    !/outlast its last day/.test(permitOnly.replace(/<[^>]*>/g, ' ')),
    'but does not earn the carryover caveat — a permit is not an intervention with an effect',
  )
})

Deno.test('R-14 — the legend DRAWS its two marks, not only describes them', () => {
  const html = renderReport(
    base({
      symptoms: [stopWeeks()],
      concurrentChanges: [
        { kind: 'medication', label: 'Pred', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-09', endBucketIndex: 1, endIsDeclared: true },
      ],
    }),
  )
  const legend = /<div class="chartlegend">(.*?)<\/div>/s.exec(html)?.[1] ?? ''
  const keys = [...legend.matchAll(/<svg [^>]*aria-hidden="true"[^>]*>(.*?)<\/svg>/gs)].map((m) => m[1])
  assert.equal(keys.length, 2, 'both marks are drawn in the key — a 60-second scan should not translate prose into a glyph')
  assert.ok(keys.every((k) => /stroke-dasharray/.test(k)), 'each key shows its rule')
  assert.ok(keys.filter((k) => /stroke-width="2.25"/.test(k)).length === 1, 'exactly one of them carries the flat head')
  assert.ok(/aria-hidden="true"/.test(legend), 'and the keys are hidden from assistive tech, which reads the words beside them')
})

Deno.test('R-14 — a paired rule that sits BESIDE a narrow bar is drawn in ink, never white on white', () => {
  // The round-2 break, and the reason it was invisible to every fixture: `PAIR_STEP` is sized
  // from the stop's head (10px), but `barW` SHRINKS with the window (`slot * 0.5`), so above ~14
  // buckets a paired rule leaves the bar horizontally while its y still reads "below the bar
  // top". Deciding the ink on y alone drew the whole rule body WHITE ON WHITE — round 1's
  // occluded stub in the opposite ink, and worse, because the head survived to point at nothing.
  //
  // The window is NOT decorative. `resolveScope`'s `since_visit` rung has no upper bound, so a
  // last visit fourteen weeks back is the ordinary annual-wellness case, and a start and a stop
  // in one week is exactly the drug switch or taper this chart exists to show.
  const WEEKS = 22 // a 151-day since-visit window
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [aggregate({
          type: 'vomit',
          count: 30,
          weeklyBuckets: Array.from({ length: WEEKS }, (_, i) => (i === 3 ? 6 : 1)),
          bucketStartDates: Array.from({ length: WEEKS }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`),
          windowDays: WEEKS * 7,
        })],
        concurrentChanges: [
          { kind: 'medication', label: 'Pred', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-01-23', endBucketIndex: 3, endIsDeclared: true },
          { kind: 'medication', label: 'Ciclo', startDate: '2026-01-25', bucketIndex: 3, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        ],
      }),
    ),
  )
  // The bar this pair straddles, and the rules themselves.
  const bars = [...svg.matchAll(/<rect class="bar" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/g)].map((m) => ({
    x: Number(m[1]), y: Number(m[2]), w: Number(m[3]),
  }))
  const tall = bars.reduce((a, b) => (b.y < a.y ? b : a))
  assert.ok(tall.w < 2 * 10, `the fixture really is narrow enough to expose this (barW ${tall.w} < 2 x PAIR_STEP)`)
  const lines = chartLines(svg).filter((l) => l.cls === 'mark' || l.cls === 'markend')
  assert.ok(lines.length > 0, 'both rules draw')
  for (const l of lines) {
    if (!l.on) continue
    assert.ok(
      l.x1 > tall.x && l.x1 < tall.x + tall.w,
      `a rule inverted to paper-ink must actually be over the bar (x=${l.x1}, bar ${tall.x}..${tall.x + tall.w})`,
    )
  }
  // And the load-bearing half: the rules beside the bar carry ink, so they are visible at all.
  const beside = lines.filter((l) => l.x1 <= tall.x || l.x1 >= tall.x + tall.w)
  assert.ok(beside.length > 0, 'the pair really does straddle out of the bar at this width')
  assert.ok(beside.every((l) => !l.on), 'every rule beside the bar is drawn in ink, over paper')
  const inked = beside.reduce((n, l) => n + (l.y2 - l.y1), 0)
  assert.ok(inked > 40, `and carries real length (${inked}px), not a stub over a floating head`)
})

Deno.test('R-14 — the stop head sits at the top of its stem, and is clipped at the bar edges', () => {
  // The cold read measured the head on a max-height bar rendering ~7px BELOW its own stem top,
  // so the stem poked through and the glyph read as a white "+" rather than the legend's ⊤ —
  // with a fleck of bar stranded above it. Same mark, two glyphs on one chart.
  const svg = firstChart(
    renderReport(
      base({
        symptoms: [aggregate({
          type: 'vomit', count: 7, weeklyBuckets: [4, 2, 1, 0],
          bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'], windowDays: 28,
        })],
        concurrentChanges: [
          { kind: 'medication', label: 'Pred', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-03', endBucketIndex: 0, endIsDeclared: true },
        ],
      }),
    ),
  )
  const lines = chartLines(svg)
  const cap = lines.find((l) => l.cls === 'markcap')
  const stem = lines.filter((l) => l.cls === 'markend').sort((a, b) => a.y1 - b.y1)[0]
  assert.ok(cap && stem, 'the stop draws a head and a stem')
  assert.ok(Math.abs(cap.y1 - stem.y1) < 0.6, `the head is AT the stem's top (head ${cap.y1}, stem ${stem.y1})`)
  // Every piece of the head takes the ink of the ground it is over — it is horizontal, so unlike
  // the stem it can straddle the bar's edge, and ~1px of white head over white paper turned a
  // symmetric head into a left-pointing notch.
  const bar = /<rect class="bar" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(svg)
  assert.ok(bar, 'the fixture draws a bar')
  const [bx, bw] = [Number(bar[1]), Number(bar[2])]
  for (const piece of lines.filter((l) => l.cls === 'markcap')) {
    const mid = (piece.x1 + piece.x2) / 2
    const overBar = mid > bx && mid < bx + bw
    assert.equal(piece.on, overBar && piece.y1 >= Number(/y="([\d.]+)"/.exec(bar[0])?.[1] ?? 0), `head piece at ${mid} takes the ink of its ground`)
  }
})

Deno.test('the symptom chart draws week-start date labels (May 11, May 18 …), not bare month ticks', () => {
  const snap = base({
    symptoms: [
      aggregate({
        type: 'vomit',
        count: 13,
        weeklyBuckets: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        bucketStartDates: ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24', '2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29', '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26'],
      }),
    ],
  })
  const html = renderReport(snap)
  // Per-week orientation: each week's start date is labelled (13 weeks ≤ 14 → every week shown).
  for (const d of ['Apr 3', 'May 1', 'May 8', 'Jun 5']) assert.ok(html.includes(`>${d}</text>`), `week-start label ${d}`)
  assert.ok(!/>Apr<\/text>/.test(html), 'no bare month-only tick label')
})

Deno.test('#9 protein-over-time section renders with a hue+texture legend when off-diet exposures exist; absent otherwise', () => {
  const withTimeline = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-04-03', '2026-04-10', '2026-04-17'],
        proteins: ['chicken', 'turkey'],
        bins: [[2, 0], [3, 1], [0, 0]],
        unknownByWeek: [0, 1, 0],
        mealDaysByBucket: [7, 7, 7],
        feedingsByWeek: [2, 5, 0],
        totalByProtein: { chicken: 5, turkey: 1 },
        hasUnknown: true,
        totalFeedings: 7,
        incompleteFeedings: 0,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 0,
        packagedUnread: 0,
      },
    }),
  )
  assert.ok(/Off-diet protein exposure over time/.test(withTimeline), 'the section renders')
  assert.ok(/Chicken/.test(withTimeline) && /Turkey/.test(withTimeline), 'proteins named in the legend')
  assert.ok(/no recorded protein/.test(withTimeline), 'the unknown band is disclosed, never dropped')
  assert.ok(/<pattern id="ptc-1"/.test(withTimeline), 'a texture pattern is defined (print-safe, not colour-only)')
  assert.ok(/reads in black &amp; white/.test(withTimeline), 'the print-safe note is present')
  // Absent when nothing off-diet — never an empty chart.
  assert.ok(!/Off-diet protein exposure over time/.test(renderReport(base())), 'no empty chart when nothing off-diet')
})

// ── B-444 / B-499 / B-503 — vet-report cold-read dead-ends (Step 9, PR 7) ────────────
// Four things a cold reader followed on the rendered artifact and found nothing behind:
// a chart that only separated in colour, a correlation and a treats cross-reference that
// pointed at content the appendix does not hold, and an at-a-glance heading that claimed
// one denominator for tiles counted over different ranges.

Deno.test('B-444 — every protein band carries a texture; solid fill is reserved for "no recorded protein"', () => {
  const html = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-04-03', '2026-04-10'],
        proteins: ['chicken', 'turkey'],
        bins: [[4, 1], [2, 0]],
        unknownByWeek: [1, 0],
        mealDaysByBucket: [7, 7],
        feedingsByWeek: [6, 2],
        totalByProtein: { chicken: 6, turkey: 1 },
        hasUnknown: true,
        totalFeedings: 9,
        incompleteFeedings: 0,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 0,
        packagedUnread: 0,
      },
    }),
  )
  // The caption promises the chart reads in black & white; it only does if the LARGEST
  // band (index 0, the dominant protein) is textured too, not a flat fill a photocopy or
  // fax cannot tell from the solid no-protein band.
  assert.ok(/reads in black &amp; white/.test(html), 'the B&W promise is present')
  const band = (id: string) => (html.match(new RegExp('<pattern id="' + id + '"[\\s\\S]*?</pattern>')) ?? [''])[0]
  assert.ok(/<circle|<path/.test(band('ptc-0')), 'the dominant protein band (ptc-0) carries a texture, not a bare solid')
  assert.ok(/<circle|<path/.test(band('ptc-1')), 'the second protein band carries a texture too')
  // No NUMBERED protein band is a bare solid; the one solid fill is the no-recorded-protein band.
  assert.equal((html.match(/<pattern id="ptc-\d+"[^>]*><rect[^>]*\/><\/pattern>/g) ?? []).length, 0, 'no numbered protein band is a bare solid fill')
  assert.ok(/<pattern id="ptc-u"[^>]*><rect[^>]*\/><\/pattern>/.test(html), 'the no-recorded-protein band (ptc-u) is the solid one')
})

Deno.test('B-499 — the correlation line never dead-ends at appendix C (no correlation content lives there)', () => {
  const established = renderReport(
    base({
      diet: { ...base().diet, trial: { foodLabel: 'RC HP', primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed']), startedAt: '2026-05-08', targetDurationDays: 56, vetName: null } },
      correlation: {
        established: [{ symptomType: 'vomit', protein: 'chicken', matchedPairs: 20, caseExposed: 8, controlExposed: 2, riskDifference: 0.3, pValue: 0.02, symptomEventCount: 12, correlationWindowHours: 24 }],
        hasEstablished: true, noThreshold: false, stapleProtein: null, timing: [],
      },
    }),
  )
  assert.ok(/established association threshold/.test(text(established)), 'the finding still renders, with its inline stats')
  assert.ok(!/Detail in appendix/.test(established), 'the established correlation line has no dead-end appendix-C pointer')
  const nullResult = renderReport(base({ correlation: { established: [], hasEstablished: false, noThreshold: true, stapleProtein: null, timing: [] } }))
  assert.ok(/No single food\/protein reached the established correlation threshold/.test(text(nullResult)), 'the null line renders')
  assert.ok(!/Detail in appendix/.test(nullResult), 'the null correlation line has no dead-end appendix-C pointer either')
})

// ── CUL-564: Signals v2 timing types on the report ─────────────────────────────
// The report adopted the v2 finding taxonomy (composeV2 removed): a lone empty-stomach lane (L1)
// and the merged ⑤+L1 timing_story now render on the associational timing line. The story is the
// card the pre-v2 report path silently dropped, taking the ⑤ with it. Both are band-named /
// associational only — never a syndrome name. (L2 trial_response + L4 gap_shortening are dropped in
// runDetection and are not TimingFinding kinds, so they cannot reach this line — see report.test.ts.)

Deno.test('CUL-564 — the empty-stomach timing lane (L1) renders as a band-named associational line', () => {
  const html = renderReport(
    base({
      correlation: {
        established: [],
        hasEstablished: false,
        noThreshold: true,
        stapleProtein: null,
        timing: [
          {
            kind: 'empty_stomach_timing',
            symptomType: 'vomit',
            windowDays: 30,
            detail: { longCount: 5, eligibleCount: 12, totalEpisodes: 18, longGapHours: 6, medianHoursSinceFeeding: 9 },
          },
        ],
      },
    }),
  )
  const t = text(html)
  assert.ok(/5 of 12 timed vomiting episodes came 6 h or more after eating/.test(t), 'the L1 band renders with counts + the 6h boundary')
  assert.ok(/co-occurrence, not cause/.test(t), 'it carries the associational framing')
  // Band-named only — the report states the timing, the vet makes the bilious/BVS inference; a
  // syndrome name is banned on this line (§9.1 / clinical-guardrails).
  assert.ok(!/bilious|empty stomach|BVS/i.test(t), 'no syndrome name — the report names the timing band only')
})

Deno.test('CUL-564 — the merged ⑤+L1 timing_story renders both bands over the shared denominator', () => {
  const html = renderReport(
    base({
      correlation: {
        established: [],
        hasEstablished: false,
        noThreshold: true,
        stapleProtein: null,
        timing: [
          {
            kind: 'timing_story',
            symptomType: 'vomit',
            windowDays: 30,
            detail: {
              rapidCount: 3,
              longCount: 5,
              eligibleCount: 12,
              totalEpisodes: 18,
              rapidWindowMinutes: 30,
              longGapHours: 6,
              medianMinutesSinceFeeding: 15,
              medianHoursSinceFeeding: 9,
            },
          },
        ],
      },
    }),
  )
  const t = text(html)
  // Both bands, one shared denominator (12) — the card the pre-v2 report path dropped with the ⑤.
  // Leads with the denominator so the two named bands read as subsets of a stated whole (Dr. Chen).
  assert.ok(
    /Of 12 timed vomiting episodes, 3 fell within ~30 min of eating and 5 came 6 h or more after/.test(t),
    'both bands render on one line, denominator-led, as subsets of the shared whole',
  )
  assert.ok(/co-occurrence, not cause/.test(t), 'associational framing')
})

Deno.test('B-499 — the diet-history treats line points at appendix C only where appendix C dates the treats', () => {
  // Trial-derived report: appendix C lists OFF-DIET exposures, so a permitted treat has no
  // dated row there — the pointer must not appear (it dead-ended for 64 of 65 on the artifact).
  const trialSnap = base({
    diet: {
      ...base().diet,
      trial: { foodLabel: 'RC HP', primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed']), startedAt: '2026-05-08', targetDurationDays: 56, vetName: null },
      treats: { count: 65, distinctItems: 2 },
    },
    trial: trialBlockFixture({ startedAt: '2026-05-08', allowedSetUnavailable: false }),
  })
  const trialFlat = text(renderReport(trialSnap)).replace(/\s+/g, ' ')
  assert.ok(/65 this window \(2 distinct\)\./.test(trialFlat), 'the treat count still renders on a trial report')
  assert.ok(!/65 this window \(2 distinct\)\. Dates in appendix/.test(trialFlat), 'no dead-end "Dates in appendix C" for permitted treats on a trial report')
  // No-trial report: appendix C IS the treats & table-food table, so the pointer resolves and stays.
  const noTrialSnap = base({
    provenance: { ...base().provenance, confounders: [{ eventId: 't1', occurredAt: '2026-06-15T13:00:00Z', dayKey: '2026-06-15', foodLabel: 'Temptations', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null }] },
    diet: { ...base().diet, treats: { count: 4, distinctItems: 1 } },
  })
  const noTrialFlat = text(renderReport(noTrialSnap)).replace(/\s+/g, ' ')
  assert.ok(/4 this window \(1 distinct\)\. Dates in appendix/.test(noTrialFlat), 'a no-trial report keeps the pointer (appendix C dates every treat)')
})

Deno.test('B-503 — the at-a-glance heading does not claim one window denominator for trial-range tiles', () => {
  const snap = base({
    symptoms: [aggregate({ type: 'vomit', count: 5 })],
    diet: {
      ...base().diet,
      trial: { foodLabel: 'Hydrolyzed', primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed']), startedAt: '2026-05-01', targetDurationDays: 56, vetName: null },
      mealCompletion: null,
      mealItems: [],
    },
    atAGlance: { ...base().atAGlance, windowDays: 46, trialDaysLogged: 43, primarySymptom: { type: 'vomit', count: 5 }, totalSymptomIncidents: 5 },
    trial: trialBlockFixture({ startedAt: '2026-05-01', coverage: { daysLogged: 43, daysElapsed: 43 } }),
  })
  const html = renderReport(snap)
  assert.ok(/Days a meal was logged/.test(html) && /43/.test(html), 'the coverage tile reads 43 / 43 (100% of its OWN range)')
  // The heading must NOT bare-claim "counts over the 46-day window" — coverage & off-diet
  // count over the trial's overlap (§5.1), not the window, so 43/43 is not 100% of 46.
  assert.ok(!/counts over the 46-day window/.test(html), 'the heading no longer bare-claims the window as the denominator')
  // Wording moved in CUL-746 and the ASSERTION is unchanged in intent: the heading must
  // flag that these two tiles depart from the window. It no longer says they share "the
  // trial's own range", because they do not — coverage counts over the trial's clipped
  // COVERAGE range and off-diet over its EVIDENCE range, and once the off-diet tile
  // started printing its own span a reader could see the two disagree under a heading
  // asserting they were one.
  assert.ok(
    /except coverage &amp; off-diet, which are not window counts/.test(html),
    'the heading flags that coverage & off-diet depart from the window',
  )
  // NEGATIVE FORM by necessity: four of the off-diet tile's six branches render a word
  // rather than a number and name no span at all, so any positive claim the heading
  // makes about them ("…which name their own spans") is false on those branches.
  assert.ok(!/which name their own spans/.test(html))
  assert.ok(!/over the trial&rsquo;s own range/.test(html), 'and does not claim they share ONE range')
})

// ── B-498: the mid gridline label matches its geometric position on ODD maxima ──────────
// The mid gridline is drawn at the plot's midpoint (value yMax/2). On an odd max the old code
// labelled it round(yMax/2) — a "2.5" line printed as "3", so a bar of 3 topped above its own line.

Deno.test('B-498 — an odd bucket max forces an EVEN axis, so the mid gridline label sits on its line', () => {
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'itch',
          count: 9,
          weeklyBuckets: [1, 3, 5], // raw max 5 (odd) → the old bug: mid line at 2.5 labelled "3"
          bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15'],
          windowDays: 21,
        }),
      ],
    }),
  )
  // The three y-axis labels (class "yl num", x=30) are the top, the mid, and 0.
  const ylabels = [...html.matchAll(/<text class="yl num" x="30"[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]))
  assert.ok(ylabels.length >= 3, 'three y-axis labels render')
  const [top, midLbl, zero] = ylabels
  assert.equal(top % 2, 0, 'the axis maximum is even, so its midpoint is a whole number')
  assert.ok(top >= 5, 'the axis still covers the tallest bar (value 5)')
  assert.equal(midLbl, top / 2, 'the mid label is EXACTLY half the max — it sits on the line it names')
  assert.equal(zero, 0, 'the baseline label is 0')
  // The old off-by-a-half: a "3" mid label under a "5" max (the 2.5 line mislabelled).
  assert.ok(!(top === 5 && midLbl === 3), 'never the 5-max / 3-mid mislabel (B-498)')
})

// ── B-496: two interventions in one week surface a COUNT, and the legend promises the week ──

Deno.test('B-496 — two starts in the same week render one marker with a count, not a silent collapse', () => {
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'vomit',
          count: 3,
          weeklyBuckets: [3, 0, 0],
          bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15'],
          windowDays: 21,
        }),
      ],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-04', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  // The second start is no longer invisible: the shared marker lists BOTH dates (CUL-982 item 4 —
  // "2 starts · May 2" labelled the bucket with one start's date and read as both starting then).
  assert.ok(/starts &middot; May 2, May 4/.test(html), 'a two-start week is marked with every start\'s date, never one date for two starts')
  assert.ok(!/2 starts &middot; May 2/.test(html), 'the bucket is never labelled with a single date')
  // Exactly one dashed vertical for that week (both starts share it — the dates say so). A vertical
  // is drawn as two segments around the count label's band (CUL-993 A.3), so count x positions.
  const markXs = new Set([...html.matchAll(/<line class="mark(?: on)?" x1="([\d.]+)"/g)].map((m) => m[1]))
  assert.equal(markXs.size, 1, 'one vertical for the shared week')
  // The legend now promises the WEEK, not the day (the mark is bucket-granular).
  assert.ok(/marks the <b>week<\/b> a treatment or diet change started/.test(html), 'legend is honest about week granularity')
})

Deno.test('B-496 — a lone start still reads "start · <date>" (single-marker behaviour unchanged)', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 2, weeklyBuckets: [1, 1], bucketStartDates: ['2026-05-01', '2026-05-08'], windowDays: 14 })],
      concurrentChanges: [{ kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-09', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true }],
    }),
  )
  assert.ok(/diet start &middot; May 9/.test(html), 'a single start keeps its exact-date label, kind first')
  assert.ok(!/\d+ starts &middot;/.test(html), 'no count prefix when the week carries one start')
})

// ── B-497: the off-diet chart tells a CLEAN week from an UNLOGGED one, never a measured 0 ──
// The symptom chart already draws a nub for an observed-zero week and a dash for an unlogged one
// (B-532). The off-diet chart used to draw NOTHING for both, so a clean week and a no-data week
// were pixel-identical — reassurance-on-absence on the chart a vet reads fastest.

Deno.test('B-497 — an off-diet week that was logged but clean draws a measured "0" nub', () => {
  const html = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-06-01', '2026-06-08', '2026-06-15'],
        proteins: ['chicken'],
        bins: [[2], [0], [1]],
        unknownByWeek: [0, 0, 0],
        mealDaysByBucket: [7, 7, 7], // a meal was logged every week; the middle week is a genuine clean week
        feedingsByWeek: [2, 0, 1],
        totalByProtein: { chicken: 3 },
        hasUnknown: false,
        totalFeedings: 3,
        incompleteFeedings: 0,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 0,
        packagedUnread: 0,
      },
    }),
  )
  assert.ok(/class="nub"/.test(html), 'the observed-zero off-diet week draws a baseline nub (a measured clean week)')
  assert.ok(!/class="nolog"/.test(html), 'a meal-observed clean week is never rendered as no-data')
  assert.ok(!/diet was not observed/.test(html), 'no no-data note when the diet was observed every week')
})

Deno.test('B-497 — an off-diet week with NO meal logged draws a dashed no-data marker + a dash, never a "0"', () => {
  const html = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-06-01', '2026-06-08', '2026-06-15'],
        proteins: ['chicken'],
        bins: [[2], [0], [1]],
        unknownByWeek: [0, 0, 0],
        mealDaysByBucket: [7, 0, 7], // the middle week had NO meal logged (diet not observed)
        feedingsByWeek: [2, 0, 1],
        totalByProtein: { chicken: 3 },
        hasUnknown: false,
        totalFeedings: 3,
        incompleteFeedings: 0,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 0,
        packagedUnread: 0,
      },
    }),
  )
  assert.ok(/class="nolog"/.test(html), 'the unobserved week draws its own hollow dashed marker')
  assert.equal((html.match(/class="nolog"/g) ?? []).length, 1, 'exactly the one week no meal was logged')
  // The alt text names it as unlogged — the screen-reader path never voices absence as a zero.
  assert.ok(/aria-label="Off-diet protein exposure per week: 2, not logged, 1\./.test(html), 'aria names the unobserved bucket, never a 0')
  // The dash is explained where it is drawn.
  assert.ok(/diet was not observed \(no meal logged\)/.test(html), 'the no-data marker is named as diet-not-observed, not left to read as a clean week')
})

Deno.test('cold-read coherence — a completed/stopped medication carries its end date on the meds line + Appendix D', () => {
  const snap = base({
    medications: [
      med({ drugName: 'Metronidazole', status: 'completed', endedAt: '2026-05-26', startedAt: '2026-05-12', adherenceState: 'not_tracked', givenDoses: 0, partialDoses: 0, daysWithDose: 0, unconfirmedDoses: 0, windowDosesLogged: 0, lifetimeDosesLogged: 0, prescribedDoses: null }),
    ],
    symptoms: [aggregate({ type: 'vomit', count: 3 })],
  })
  const html = renderReport(snap)
  // The end date appears (not a bare "since May 12" that reads as still-active), on BOTH surfaces.
  // CUL-982 item 1 — "end recorded by owner", never "course complete": the status is the End tap,
  // and not "ended by owner" either, which a vet reads as "the owner stopped the drug".
  assert.ok(/May 12 – May 26, 2026 \(end recorded by owner\)/.test(html), 'completed course shows its date span, year-stamped, + "end recorded by owner"')
  assert.ok(!/course complete/.test(html), '"course complete" is never printed — the status says nothing about doses')
  assert.ok(!/Metronidazole.*since <span class="num">May 12/.test(html), 'the ended course does not read "since May 12" as if still active')
})

// ── Incident photos — Appendix E/F render + safety-band lead (PR 7) ──────────────

// A tiny valid 1x1 PNG data URI (base64) — stands in for an embedded, EXIF-stripped photo.
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function photo(over: Partial<IncidentPhoto> & { eventId: string; occurredAt: string }): IncidentPhoto {
  return {
    eventId: over.eventId,
    storagePath: over.storagePath ?? `p/${over.eventId}.jpg`,
    type: over.type ?? 'vomit',
    occurredAt: over.occurredAt,
    occurredAtConfidence: over.occurredAtConfidence ?? 'witnessed',
    occurredAtEarliest: over.occurredAtEarliest ?? null,
    occurredAtLatest: over.occurredAtLatest ?? null,
    notes: over.notes ?? null,
    safety: over.safety ?? null,
    phenotype: over.phenotype ?? null,
    dataUri: over.dataUri ?? null,
  }
}

Deno.test('PR7 render — Appendix E renders when photos exist; letter is E with no meals appendix', () => {
  const html = renderReport(base({ incidentPhotos: [photo({ eventId: 'v1', occurredAt: '2026-06-20T14:00:00Z', dataUri: PNG_1PX })] }))
  assert.ok(html.includes('Appendix E — Incident photos'), 'photos appendix is lettered E (no meals appendix)')
  assert.ok(html.includes(PNG_1PX), 'the embedded photo bytes are baked into the artifact')
  assert.ok(/metadata \(location, device, capture time\) is removed/.test(html), 'the EXIF-strip is disclosed in the appendix')
})

Deno.test('PR7 render — no photos ⇒ no photos appendix, no dangling cross-reference', () => {
  const html = renderReport(base())
  assert.ok(!html.includes('Incident photos'), 'no photos appendix and no legend entry when there are no photos')
})

Deno.test('PR7 render — with a meals appendix present, photos take the NEXT letter (F)', () => {
  const html = renderReport(
    base({
      provenance: {
        ...base().provenance,
        intakeLogScope: 'intake_flag',
        intakeLog: [{ eventId: 'm1', occurredAt: '2026-06-30T12:00:00Z', foodLabel: 'Wet food', intakeRating: 'refused', isLastFullMeal: false, pinned: false }],
      },
      incidentPhotos: [photo({ eventId: 'v1', occurredAt: '2026-06-20T14:00:00Z', dataUri: PNG_1PX })],
    }),
  )
  assert.ok(html.includes('Appendix E — Meals'), 'the meals appendix keeps E')
  assert.ok(html.includes('Appendix F — Incident photos'), 'photos come after meals as F')
})

Deno.test('PR7 render — a safety-flagged photo also LEADS the safety band on page 1 (thumbnail)', () => {
  const bloodFlag: SafetyFlag = { kind: 'present_blood', source: 'vomit', incidents: [{ eventId: 'vb', occurredAt: '2026-06-20T14:00:00Z', kind: 'fresh_red' }] }
  const html = renderReport(
    base({
      safetyFlags: [bloodFlag],
      incidentPhotos: [photo({ eventId: 'vb', occurredAt: '2026-06-20T14:00:00Z', safety: 'blood', dataUri: PNG_1PX })],
    }),
  )
  const bandStart = html.indexOf('safetyband')
  const bandEnd = html.indexOf('</section>', bandStart)
  const band = html.slice(bandStart, bandEnd)
  assert.ok(band.includes('sbthumb'), 'the flagged photo thumbnail renders inside the safety band')
  assert.ok(band.includes(PNG_1PX), 'the actual flagged frame leads the band')
})

Deno.test('PR7 render — a photo that failed to embed shows an honest placeholder, never a raw fallback', () => {
  const html = renderReport(base({ incidentPhotos: [photo({ eventId: 'v1', occurredAt: '2026-06-20T14:00:00Z', dataUri: null })] }))
  assert.ok(html.includes('Photo could not be embedded'), 'a null-dataUri photo is a labelled placeholder')
  assert.ok(/could not be embedded and is shown as a labelled placeholder/.test(html), 'the omission is disclosed in the appendix preamble')
})

Deno.test('PR7 render — the owner-reviewable AI read shows present-only fields, never an n=1 verdict', () => {
  const html = renderReport(
    base({
      incidentPhotos: [
        photo({
          eventId: 'v1',
          occurredAt: '2026-06-20T14:00:00Z',
          dataUri: PNG_1PX,
          phenotype: { kind: 'vomit', status: 'completed', contentsCategory: 'bile', consistency: 'foamy', colour: 'yellow', bloodPresent: 'coffee_ground', foreignPresent: null, foreignNote: null, bristol: null, stoolColour: null, stoolBlood: null, mucusPresent: null, edited: false },
        }),
      ],
    }),
  )
  assert.ok(html.includes('AI read &middot; unconfirmed'), 'the uniform AI-read badge is present')
  assert.ok(html.includes('possible coffee-ground'), 'present blood renders as a possibility')
  // The IncidentPhoto phenotype has no recommendation field by construction; assert the analyze-vomit
  // n=1 verdict vocabulary (recommendation enum labels) never surfaces as a per-photo verdict.
  assert.ok(!/worth a call|not enough to say|worth_a_call/i.test(html), 'no single-incident recommendation leaks onto the report')
})

Deno.test('PR7 render — the removed-photo divergence is DISCLOSED in Appendix E (reconciles the read/photo count)', () => {
  const html = renderReport(
    base({
      incidentPhotos: [photo({ eventId: 'v1', occurredAt: '2026-06-20T14:00:00Z', dataUri: PNG_1PX })],
      incidentPhotosRemoved: [{ eventId: 'rm0', type: 'vomit', occurredAt: '2026-06-10T12:00:00Z' }, { eventId: 'rm1', type: 'vomit', occurredAt: '2026-06-11T12:00:00Z' }, { eventId: 'rm2', type: 'vomit', occurredAt: '2026-06-12T12:00:00Z' }],
    }),
  )
  assert.ok(html.includes('Appendix E — Incident photos'))
  assert.ok(/photo is no longer retained \(removed by the owner\)/.test(html), 'the divergence is disclosed, not silent')
  assert.ok(/read.{0,20}remain.{0,20}appendix/i.test(html), 'points the vet to the reads that remain in Appendix A')
  assert.ok(/with a retained photo/.test(html), 'the card lead is scoped to retained photos, not an absolute "every photographed"')
})

Deno.test('PR7 render — Appendix E STILL renders (disclosure only, no grid) when every photo was removed', () => {
  const html = renderReport(base({ incidentPhotos: [], incidentPhotosRemoved: [{ eventId: 'rm0', type: 'vomit', occurredAt: '2026-06-10T12:00:00Z' }, { eventId: 'rm1', type: 'vomit', occurredAt: '2026-06-11T12:00:00Z' }] }))
  assert.ok(html.includes('Appendix E — Incident photos'), 'the section renders to reconcile the phenotype counts')
  assert.ok(/No photographed incident in this window still has a retained photo/.test(html))
  assert.ok(!html.includes('<div class="phgrid">'), 'no empty photo grid element when there are no cards')
})

// ── Header revamp: Culprit brand mark + getculprit.app QR (Direction B) ───────────

Deno.test('letterhead — Culprit brand mark + getculprit.app QR render, monochrome (no data colour, §5.8)', () => {
  const html = renderReport(base())
  assert.ok(/aria-label="QR code linking to getculprit.app"/.test(html), 'the QR svg is present')
  assert.ok(/getculprit\.app/.test(html), 'the caption is a plain web address (letterhead furniture, not a CTA)')
  assert.ok(!/About Culprit/.test(html), 'no imperative "About Culprit" CTA in the clinical masthead')
  assert.ok(/class="cmark"/.test(html), 'the Moon & Signal brand mark is present')
  // The mark + QR must NOT reintroduce the app teal accent onto the clinical page (cold-read guard).
  assert.ok(!/#00C2A8/i.test(html), 'no teal accent leaks onto the clinical page')
  assert.ok(!/#13112E/i.test(html), 'no indigo brand ground on the page — stays lab-grade')
})

// ── §3.8 orphan-dose: ad-hoc / OTC doses with no regimen ──────────────────────────

function unlinkedMed(o: Partial<UnlinkedMedicationGroup> = {}): UnlinkedMedicationGroup {
  return {
    itemId: o.itemId ?? 'mi-zyrtec',
    drugName: o.drugName ?? 'Cetirizine HCl (Zyrtec)',
    isSupplement: o.isSupplement ?? true,
    strength: o.strength ?? '5 mg',
    route: o.route ?? 'oral',
    administeredDoses: o.administeredDoses ?? 3,
    partialDoses: o.partialDoses ?? 0,
    unconfirmedDoses: o.unconfirmedDoses ?? 0,
    refusedDoses: o.refusedDoses ?? 0,
    missedDoses: o.missedDoses ?? 0,
    totalDoses: o.totalDoses ?? 3,
    firstDate: o.firstDate ?? '2026-06-28',
    lastDate: o.lastDate ?? '2026-07-01',
    doseDays: o.doseDays ?? ['2026-06-28', '2026-06-30', '2026-07-01'],
  }
}

Deno.test('§3.8 orphan-dose — an unlinked OTC dose group renders on page 1 + Appendix D', () => {
  const html = renderReport(base({ unlinkedMedications: [unlinkedMed()] }))
  assert.ok(/Cetirizine HCl \(Zyrtec\)/.test(html), 'the drug is named')
  // num() wraps counts in <span class="num">, so match through it.
  assert.ok(
    />3<\/span> doses given in this window, Jun 28/.test(html),
    'the administered count + span render on page 1, with the window named (CUL-976)',
  )
  assert.ok(/no regimen configured/.test(html), 'page 1 states plainly there is no regimen')
  assert.ok(/owner-reported, OTC/.test(html), 'the OTC provenance is labelled')
  assert.ok(/No regimen configured/.test(html), 'Appendix D row states no regimen in the Regimen column')
})

Deno.test('§3.8 orphan-dose — an unconfirmed-only group is never read as "given"; the count is honest', () => {
  const html = renderReport(
    base({ unlinkedMedications: [unlinkedMed({ administeredDoses: 0, unconfirmedDoses: 2, totalDoses: 2 })] }),
  )
  // "doses given" is only ever produced by the unlinked line's administered head — absent at 0.
  assert.ok(!/doses given/.test(html), 'no "given" claim for a 0-administered group')
  assert.ok(/>2<\/span> doses logged/.test(html), 'reads "logged", not "given"')
  assert.ok(/>2<\/span> unconfirmed/.test(html), 'the unconfirmed count is disclosed')
})

// ── B-351 slice 5 — the protein set, rendered (§9, Dr. Chen's three conditions) ─
//
// The render is where D10 either holds or is quietly undone: report.ts can compute
// `complete: false` perfectly and the HTML can still print "nothing else on the
// label". These tests assert the STRINGS, because the string is what the vet acts on.

const DUCK_TRIAL = {
  foodLabel: 'Novel Duck',
  primaryProtein: 'duck',
  startedAt: '2026-05-08',
  targetDurationDays: 56,
  vetName: 'Dr. Chen',
}

Deno.test('B-351 §9 — the trial diet\'s OWN off-trial protein leads page 1, not an appendix', () => {
  // A "duck" elimination food that also lists chicken invalidates the trial. A vet who
  // misses it draws a wrong conclusion from every symptom figure on the page, so it
  // cannot wait for appendix B.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck', 'chicken'], { complete: true, offTrial: ['chicken'] }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  const page1 = pageOne(html)
  assert.ok(
    /The trial food&rsquo;s own label also lists Chicken\./.test(page1),
    'the self-contamination is stated on page 1',
  )
  // Present-only, never causal (§9 condition 3).
  assert.ok(!/caused|because of|responsible for|due to the chicken/i.test(page1), 'no causal claim')
})

Deno.test('B-351 §9 — a CLEAN trial diet gets no page-1 line at all (there is no honest all-clear)', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(!/own label also lists/.test(html), 'nothing claimed when the set is clean')
  assert.ok(!/no contaminants|no other proteins|clean/i.test(html.slice(0, html.indexOf('Appendix'))), 'and no reassuring inverse')
})

// ── B-704 — the trial block identity names the protein, with provenance (§7.4) ────

/** The diet half of a trial snapshot for the B-704 identity tests: a protein resolves,
 *  its provenance/mismatch are the free parameters. */
function proteinDiet(over: Partial<import('./report.ts').DietSummary>): import('./report.ts').DietSummary {
  return {
    trialTargetProtein: 'duck',
    trialProteinProvenance: { source: 'derived', confirmedDay: null },
    trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
    freeFed: [],
    intakeNotDirectlyObserved: false,
    mealCompletion: null,
    mealItems: [],
    treats: { count: 0, distinctItems: 0 },
    humanFood: { count: 0, days: 0, items: [] },
    previousDiet: null,
    medicationVehicles: null,
    ...over,
  }
}

Deno.test('B-704 §7.4 — the identity leads with "Elimination diet trial — {protein}" and the derived provenance', () => {
  const html = text(
    renderReport(
      base({
        trial: trialBlockFixture({ trialDietLabels: ['Novel Duck'], startedAt: '2026-05-08' }),
        diet: proteinDiet({ trialTargetProtein: 'duck', trialProteinProvenance: { source: 'derived', confirmedDay: null } }),
      }),
    ),
  )
  assert.ok(/Elimination diet trial/.test(html), 'the block leads with the elimination-trial framing')
  assert.ok(/Duck/.test(html), 'the protein is named')
  assert.ok(/read from the trial diet/.test(html), 'a derived target is disclosed as read off the label, not owner-stated')
  assert.ok(!/owner-confirmed/.test(html), 'a derived target is NOT presented as owner-confirmed')
})

Deno.test('B-704 §7.4 — an OWNER target reads "owner-confirmed protein"', () => {
  const html = text(
    renderReport(
      base({
        trial: trialBlockFixture({ trialDietLabels: ['Instinct Rabbit'], startedAt: '2026-05-08' }),
        diet: proteinDiet({ trialTargetProtein: 'rabbit', trialProteinProvenance: { source: 'owner', confirmedDay: null } }),
      }),
    ),
  )
  assert.ok(/Elimination diet trial/.test(html))
  assert.ok(/Rabbit/.test(html), 'the owner-stated protein names the trial')
  assert.ok(/owner-confirmed protein/.test(html))
})

Deno.test('B-704 §7.4 — an owner target set after day 1 discloses "recorded on day N"', () => {
  const html = text(
    renderReport(
      base({
        trial: trialBlockFixture({ trialDietLabels: ['Instinct Rabbit'], startedAt: '2026-05-08' }),
        diet: proteinDiet({ trialTargetProtein: 'rabbit', trialProteinProvenance: { source: 'owner', confirmedDay: 8 } }),
      }),
    ),
  )
  assert.ok(/owner-confirmed protein/.test(html))
  assert.ok(/recorded on day 8/.test(html), 'a mid-trial confirmation is dated')
})

Deno.test('B-704 §6/TG-3 — the mismatch LEADS the safety band, names the consequence, and stays trial-level', () => {
  // On a mismatch the exposure baseline is the FOOD (duck); the owner's rabbit is the
  // safety flag. The render receives the flag in `safetyFlags` (assembleReport builds it)
  // and an antigen tally to caveat.
  const html = renderReport(
    base({
      safetyFlags: [{ kind: 'protein_mismatch', recordedProtein: 'rabbit', foodProtein: 'duck', trialDietLabels: ['Novel Duck'] }],
      trial: trialBlockFixture({
        trialDietLabels: ['Novel Duck'],
        startedAt: '2026-05-08',
        antigenTally: [{ protein: 'chicken', feedings: 3, fromPermitted: 0 }],
      }),
      diet: proteinDiet({
        trialTargetProtein: 'duck', // the baseline is the food, coherent with the counts
        trialProteinProvenance: { source: 'derived', confirmedDay: null },
        trialProteinMismatch: { target: 'rabbit', foodProtein: 'duck', foodLabel: 'Novel Duck' },
      }),
    }),
  )
  const t = text(html)
  // The safety band carries the flag and the LOAD-BEARING consequence.
  assert.ok(/class="safetyband"/.test(html), 'the safety band renders')
  assert.ok(/recorded trial protein is not the protein on the trial food/.test(t), 'the flag states the discrepancy')
  assert.ok(/Rabbit/.test(t) && /Duck/.test(t), 'both proteins are named')
  assert.ok(/every feeding of the trial diet is itself off-target/.test(t), 'names the false-reassurance consequence (the cold-read blocker)')
  assert.ok(/elimination cannot be confirmed from this record/.test(t))
  // The identity names the FOOD protein (duck), not the owner belief — coherent baseline.
  assert.ok(/Elimination diet trial/.test(t) && /read from the trial diet/.test(t), 'identity names the label-read baseline (duck), not a false owner-confirmed')
  // The antigen count carries the baseline caveat inline, pointing at the flag.
  assert.ok(/Measured against the trial food&rsquo;s label/.test(html) || /Measured against the trial food's label/.test(t), 'the antigen count is caveated with its baseline')
  // TG-3 / §8: trial-level, once, and never the forbidden framing.
  assert.equal(t.split('recorded trial protein is not the protein').length - 1, 1, 'one trial-level line, never per feeding')
  const flagText = t.slice(t.indexOf('recorded trial protein'), t.indexOf('recorded trial protein') + 600)
  assert.ok(!/wrong food|\bmistake\b/i.test(flagText), 'never "wrong food" / "mistake" (§8)')
})

Deno.test('B-704 — no protein_mismatch flag or caveat when the target and the label agree', () => {
  const html = text(
    renderReport(
      base({
        trial: trialBlockFixture({ trialDietLabels: ['Novel Duck'], startedAt: '2026-05-08', antigenTally: [{ protein: 'chicken', feedings: 3, fromPermitted: 0 }] }),
        diet: proteinDiet({ trialTargetProtein: 'duck', trialProteinProvenance: { source: 'owner', confirmedDay: null }, trialProteinMismatch: null }),
      }),
    ),
  )
  assert.ok(!/recorded trial protein is not the protein/.test(html), 'no flag when there is no tension')
  assert.ok(!/Measured against the trial food/.test(html), 'no baseline caveat when there is no mismatch')
})

Deno.test('B-704 — on a mismatch the baseline caveat rides BOTH the page-1 tally AND the appendix-D antigen line', () => {
  // The adversarial residual: the appendix is where a vet is SENT to check the page-1
  // figure, so an un-annotated antigen count there is the last spot a mismatch count could
  // be lifted out of its baseline context. `allowedSetUnavailable: false` makes the
  // appendix-D antigen line render.
  const html = renderReport(
    base({
      safetyFlags: [{ kind: 'protein_mismatch', recordedProtein: 'rabbit', foodProtein: 'duck', trialDietLabels: ['Novel Duck'] }],
      trial: trialBlockFixture({
        trialDietLabels: ['Novel Duck'],
        startedAt: '2026-05-08',
        allowedSetUnavailable: false,
        antigenTally: [{ protein: 'chicken', feedings: 3, fromPermitted: 0 }],
      }),
      diet: proteinDiet({
        trialTargetProtein: 'duck',
        trialProteinProvenance: { source: 'derived', confirmedDay: null },
        trialProteinMismatch: { target: 'rabbit', foodProtein: 'duck', foodLabel: 'Novel Duck' },
      }),
    }),
  )
  // Two antigen counts on a mismatch (page-1 trial row + appendix D) → two caveats, so
  // neither figure can be read against the wrong baseline.
  const caveats = html.split('Measured against the trial food').length - 1
  assert.ok(caveats >= 2, `both antigen counts carry the baseline caveat (found ${caveats})`)
})

Deno.test('B-704 — NO protein resolved falls back to the food-label-led identity (no bare "Elimination diet trial —")', () => {
  const html = text(
    renderReport(
      base({
        trial: trialBlockFixture({ trialDietLabels: ['Hydrolyzed HP'], startedAt: '2026-05-08' }),
        diet: proteinDiet({ trialTargetProtein: null, trialProteinProvenance: null, trial: { ...DUCK_TRIAL, primaryProtein: 'hydrolyzed', proteinSet: pset(['hydrolyzed'], { complete: true }) } }),
      }),
    ),
  )
  assert.ok(!/Elimination diet trial/.test(html), 'no protein → no elimination-trial lead with an empty dash')
  assert.ok(/Hydrolyzed HP/.test(html), 'the food labels still lead the identity')
})

Deno.test('B-351 D10 — an unread ingredient list NEVER renders "nothing else on the label"', () => {
  // The single string this whole gate exists to prevent. `['duck']` from a
  // marketing-name-only read is byte-identical to a genuinely single-protein duck food.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: 'Marketing Duck', primaryProtein: 'duck', proteinSet: pset(['duck']), format: null, count: 12, firstDate: '2026-06-01', lastDate: '2026-06-20', intakeBreakdown: [{ rating: 'all', count: 12 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(!/nothing else on the label/.test(html), 'no completeness claim over an unread panel')
  assert.ok(/ingredient list not captured/.test(html), 'the honest qualifier renders instead')
  // Names the real provenance — an automated read of an owner's photo, not a human
  // transcription — and tells the reader to confirm against the bag.
  assert.ok(/automated read of the owner&rsquo;s photo/.test(html), 'provenance stated (§9 condition 1)')
  assert.ok(/label-derived, not lab-verified/.test(html))
})

Deno.test('B-351 D10 — a genuinely READ single-protein panel DOES earn the completeness line', () => {
  // The gate must not be a blanket refusal: a vet needs to know the difference between
  // "this really is duck only" and "nobody looked".
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: 'Real Duck', primaryProtein: 'duck', proteinSet: pset(['duck'], { complete: true }), format: null, count: 12, firstDate: '2026-06-01', lastDate: '2026-06-20', intakeBreakdown: [{ rating: 'all', count: 12 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/nothing else on the label/.test(html))
  assert.ok(!/ingredient list not captured/.test(html))
})

Deno.test('B-351 §9 condition 2 — the primary renders first and in bold, secondaries subordinate', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: 'Duck Dinner', primaryProtein: 'duck', proteinSet: pset(['duck', 'chicken', 'salmon'], { complete: true }), format: null, count: 4, firstDate: '2026-06-01', lastDate: '2026-06-04', intakeBreakdown: [{ rating: 'all', count: 4 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/<b>Duck<\/b>, also Chicken, Salmon/.test(html), 'headline protein is never something the eye hunts for')
})

Deno.test('B-351 — an empty set says the reading is missing, never that the food has no protein', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: 'Unknown Food', primaryProtein: null, proteinSet: pset([]), format: null, count: 3, firstDate: '2026-06-01', lastDate: '2026-06-03', intakeBreakdown: [{ rating: 'all', count: 3 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/no protein recorded/.test(html))
  assert.ok(
    !/no animal protein|protein-free|contains no protein|nothing else on the label/i.test(html),
    'never a claim about what the food does not contain',
  )
})

Deno.test('B-351 — the off-trial `*` is defined on the sheet where it appears, and absent when unused', () => {
  const withMark = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck', 'chicken'], { complete: true, offTrial: ['chicken'] }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/a protein other than the trial protein \(Duck\)/.test(withMark), 'the marker is explained')
  // "does not BY ITSELF mean it caused anything" conceded that it might in combination.
  assert.ok(/records exposure only; Culprit draws no link between it and any symptom/.test(withMark), 'explicitly non-causal')

  const noTrial = renderReport(base({}))
  assert.ok(!/a protein other than the trial protein/.test(noTrial), 'no legend for a symbol that never appears')
})

Deno.test('B-351 D10 — an under-counted protein tally is disclosed as a FLOOR', () => {
  const html = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-06-01'],
        proteins: ['chicken'],
        bins: [[3]],
        unknownByWeek: [0],
        mealDaysByBucket: [7],
        feedingsByWeek: [4],
        totalByProtein: { chicken: 3 },
        hasUnknown: false,
        totalFeedings: 4,
        incompleteFeedings: 2,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 4,
        packagedUnread: 2,
      },
      provenance: {
        ...base({}).provenance,
        proteinExposureTally: { chicken: 3 },
        confounders: [
          { eventId: 'c1', occurredAt: '2026-06-01T12:00:00Z', dayKey: '2026-06-01', foodLabel: 'Treat', primaryProtein: 'chicken', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat', note: null },
        ],
      },
    }),
  )
  assert.ok(/A floor, not a total:/.test(html), 'the under-count is named, not hidden behind a confident tally')
  assert.ok(
    /2 of 4 off-diet feedings involved a food whose ingredient panel was never captured/.test(text(html)),
  )
})

Deno.test('B-351 §9 — the exposure chart states that one feeding can fill several protein bands', () => {
  const html = renderReport(
    base({
      proteinTimeline: {
        weekStartDates: ['2026-06-01', '2026-06-08'],
        proteins: ['chicken', 'duck'],
        bins: [[2, 2], [1, 0]],
        unknownByWeek: [0, 0],
        mealDaysByBucket: [7, 7],
        feedingsByWeek: [2, 1],
        totalByProtein: { chicken: 3, duck: 2 },
        hasUnknown: false,
        totalFeedings: 3,
        incompleteFeedings: 0,
        humanFoodFeedings: 0,
        incompleteHumanFoodFeedings: 0,
        packagedReadable: 0,
        packagedUnread: 0,
      },
    }),
  )
  assert.ok(
    /counts once for each, so a week&rsquo;s stack can total more than its feedings/.test(html),
    'the reader is told why the stack exceeds the feeding count',
  )
})

Deno.test('B-351 §9 — appendix C\'s protein column carries the whole set, marked and qualified', () => {
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 1, distinctItems: 1 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
      provenance: {
        ...base({}).provenance,
        confounders: [
          { eventId: 'c1', occurredAt: '2026-06-01T12:00:00Z', dayKey: '2026-06-01', foodLabel: 'Jerky', primaryProtein: 'chicken', proteinSet: pset(['chicken', 'salmon'], { offTrial: ['chicken', 'salmon'] }), format: 'treat', foodType: 'treat', note: null },
        ],
      },
    }),
  )
  // Plain `*` in a table cell, and the incompleteness qualifier is WORDS: in a table
  // where nearly every protein is off-trial, a bold `*` is clutter while "nobody read
  // this label" is the highest-information mark on the sheet.
  assert.ok(/Chicken\*, Salmon\*/.test(html), 'both off-trial proteins marked in the column')
  assert.ok(/Salmon\* <span class="rnote">&middot; list not read<\/span>/.test(html), 'the unread-panel qualifier is spelled out')
})


// ── B-351 slice 5 — review follow-ups ─────────────────────────────────────────

Deno.test('B-351 — a food whose OWN PRIMARY is off-trial marks cleanly, without nested emphasis', () => {
  // The common case in the "Proteins in the diet" block: any non-trial food fed
  // alongside a trial has an off-trial primary. Wrapping the marked primary wholesale
  // in <b> produced nested <b>Chicken<b>*</b></b>; the marker belongs outside it.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [
          {
            foodLabel: 'Housemate kibble',
            primaryProtein: 'chicken',
            activeFrom: null,
            activeUntil: null,
            proteinSet: pset(['chicken', 'turkey'], { complete: true, offTrial: ['chicken', 'turkey'] }),
            isShared: false,
          },
        ],
        intakeNotDirectlyObserved: true,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/<b>Chicken<\/b><b>\*<\/b>, also Turkey<b>\*<\/b>/.test(html), 'primary bold, marker beside it')
  assert.ok(!/<b>Chicken<b>/.test(html), 'no nested emphasis')
})

Deno.test('B-351 — a continuously-available off-trial protein reaches PAGE 1, not just appendix C', () => {
  // The cold-read blocker: an ad-lib chicken bowl means the elimination diet was never
  // run. Reading page 1 alone, a vet concluded "contaminated trial food, fix the treats
  // and re-run" — the wrong plan — because that fact was three pages away.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [
          {
            foodLabel: 'Housemate kibble',
            primaryProtein: 'chicken',
            activeFrom: null,
            activeUntil: null,
            proteinSet: pset(['chicken', 'turkey'], { complete: true, offTrial: ['chicken', 'turkey'] }),
            isShared: false,
          },
        ],
        intakeNotDirectlyObserved: true,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  const p1 = text(pageOne(html))
  assert.ok(
    /Chicken and Turkey are also continuously available in a free-fed bowl/.test(p1),
    'the ad-lib competing antigen is named on page 1',
  )
  assert.ok(/intake not directly observed/.test(p1), 'and still carries the B-040 caveat')
})

Deno.test('B-351 D10 — page 1 distinguishes an UNREAD trial panel from a clean one', () => {
  // Silence used to mean both "this trial diet is single-protein" and "nobody has read
  // its label" — and today the second is the common state, so silence defaulted to the
  // reassuring reading on the report's most-scanned line.
  const unread = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck']) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/ingredient panel has not been captured/.test(text(pageOne(unread))))

  const read = renderReport(
    base({
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(!/ingredient panel has not been captured/.test(read), 'a genuinely read panel says nothing')
})

Deno.test('B-351 — duplicate library rows under one label do not inherit each other\'s completeness', () => {
  // Per-account duplicate food rows are a live condition (B-009/B-018). A label-only
  // dedupe rendered the photo-extracted row's implied-complete set over a label whose
  // other row nobody ever read.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: 'Acme Duck Formula', primaryProtein: 'duck', proteinSet: pset(['duck', 'chicken'], { complete: true }), format: null, count: 2, firstDate: '2026-06-01', lastDate: '2026-06-02', intakeBreakdown: [{ rating: 'all', count: 2 }] },
          { foodLabel: 'Acme Duck Formula', primaryProtein: 'duck', proteinSet: pset(['duck']), format: null, count: 1, firstDate: '2026-06-03', lastDate: '2026-06-03', intakeBreakdown: [{ rating: 'all', count: 1 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(/ingredient list not captured/.test(html), 'the unread duplicate keeps its own qualifier')
})

Deno.test('B-351 — owner-entered food labels and protein keys are HTML-escaped on every new surface', () => {
  // Food labels are owner free text and the picker's "Other" escape lets an owner type
  // a protein key, so both reach these new surfaces unsanitised.
  const evil = '<script>alert(1)</script>'
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [
          { foodLabel: evil, primaryProtein: evil, proteinSet: pset([evil, 'chicken']), format: null, count: 1, firstDate: '2026-06-01', lastDate: '2026-06-01', intakeBreakdown: [{ rating: 'all', count: 1 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
      provenance: {
        ...base({}).provenance,
        confounders: [
          { eventId: 'c1', occurredAt: '2026-06-01T12:00:00Z', dayKey: '2026-06-01', foodLabel: evil, primaryProtein: evil, proteinSet: pset([evil]), format: 'treat', foodType: 'treat', note: null },
        ],
      },
    }),
  )
  assert.ok(!/<script>/.test(html), 'no raw script tag anywhere in the rendered report')
  assert.ok(/&lt;script&gt;/.test(html), 'it renders escaped instead of being dropped')
})

// ── B-351 slice 5 — second-cold-read follow-ups (page-1 coherence) ────────────

/** A trial report with a contaminated trial food AND an ad-lib off-trial bowl. */
function breachedTrialSnap() {
  return base({
    // The headline only renders the trial framing for this clinical question.
    clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
    diet: {
      trialTargetProtein: 'duck',
      trial: { ...DUCK_TRIAL, proteinSet: pset(['duck', 'chicken'], { complete: true, offTrial: ['chicken'] }) },
      freeFed: [
        {
          foodLabel: 'Housemate kibble',
          primaryProtein: 'chicken',
          activeFrom: null,
          activeUntil: null,
          proteinSet: pset(['chicken', 'turkey'], { complete: true, offTrial: ['chicken', 'turkey'] }),
          isShared: false,
        },
      ],
      intakeNotDirectlyObserved: true,
      mealCompletion: null,
      mealItems: [],
      treats: { count: 0, distinctItems: 0 },
      humanFood: { count: 0, days: 0, items: [] },
      previousDiet: null,
      medicationVehicles: null,
    },
    proteinTimeline: {
      weekStartDates: ['2026-06-01'],
      proteins: ['chicken'],
      bins: [[7]],
      unknownByWeek: [0],
      mealDaysByBucket: [7],
      feedingsByWeek: [7],
      totalByProtein: { chicken: 7 },
      hasUnknown: false,
      totalFeedings: 7,
      incompleteFeedings: 0,
      humanFoodFeedings: 0,
      incompleteHumanFoodFeedings: 0,
      packagedReadable: 0,
      packagedUnread: 0,
    },
  })
}

Deno.test('B-351 — the HEADLINE qualifies "day N of M" when the record shows off-trial exposure', () => {
  // "Day 46 of 56" asserts a running trial. A cold read that scanned top-down and stopped
  // concluded "40 days of diarrhoea on a well-adhered duck trial → not food-responsive →
  // scope her"; the honest reading was that this was never an elimination trial. Opposite
  // plans, and the page invited the expensive one.
  const html = renderReport(breachedTrialSnap())
  const p1 = text(pageOne(html))
  // "reaching Nyx" asserted CONSUMPTION; a free-fed bowl is exactly the exposure we
  // cannot say that about, and its "intake not directly observed" caveat sits a block
  // below — on the line a scanner stops before. Promoting the fact promotes its qualifier.
  assert.ok(
    /The record shows Chicken and Turkey in Nyx&rsquo;s diet during the trial \(some of it free-fed; intake not directly observed\)/.test(
      p1,
    ),
    'the headline names the exposure without claiming it was eaten',
  )
  assert.ok(/before reading the trial as a result/.test(p1))
  // Present-only: it reports exposure, never a verdict on whether the trial failed.
  assert.ok(!/trial failed|not food-responsive|invalid/i.test(p1), 'no verdict on the trial itself')
})

Deno.test('B-351 — a CLEAN trial keeps the headline unqualified', () => {
  const html = renderReport(
    base({
      // Same clinical question as the breached case, so this cannot pass vacuously by
      // simply not rendering a trial headline at all.
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
      diet: {
        trialTargetProtein: 'duck',
        trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(!/The record shows .* reaching/.test(html))
})

Deno.test('B-351 — the promoted page-1 protein claim carries its provenance with it', () => {
  // The full provenance note lives in appendix B. Promoting the claim to page 1 without a
  // qualifier invites a vet to change a prescription diet on an unverified automated read.
  const p1 = text(pageOne(renderReport(breachedTrialSnap())))
  assert.ok(/Read automatically from the owner&rsquo;s photo of the label/.test(p1))
  assert.ok(/worth confirming against the bag/.test(p1))
})

Deno.test('B-351 — the exposure chart does not contradict the diet line about a standing exposure', () => {
  // The chart counts DISCRETE feedings; an ad-lib bowl is not a feeding event, so chicken
  // read as 7 sporadic exposures directly beneath a line saying it was always available.
  const html = renderReport(breachedTrialSnap())
  assert.ok(
    /Chicken and Turkey are also continuously available in a free-fed bowl and cannot be counted as feedings at all/.test(
      text(html),
    ),
    'the chart states what its own bars structurally cannot show',
  )
})

Deno.test('B-351 — the trial-diet parenthetical stops asserting composition when the label contradicts it', () => {
  // "(duck)" reads as what is IN the food, and the next clause said chicken was too.
  const breached = text(pageOne(renderReport(breachedTrialSnap())))
  assert.ok(/\(labelled duck\)/.test(breached), 'names how the food is SOLD when the set disagrees')

  const clean = text(
    pageOne(
      renderReport(
        base({
          clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
          diet: {
            trialTargetProtein: 'duck',
            trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) },
            freeFed: [],
            intakeNotDirectlyObserved: false,
            mealCompletion: null,
            mealItems: [],
            treats: { count: 0, distinctItems: 0 },
            humanFood: { count: 0, days: 0, items: [] },
            previousDiet: null,
            medicationVehicles: null,
          },
        }),
      ),
    ),
  )
  assert.ok(/\(duck\)/.test(clean) && !/\(labelled duck\)/.test(clean), 'unchanged when there is no contradiction')
})

Deno.test('B-351 — a SHARED bowl is named as shared, not as something the pet was shown to eat', () => {
  // `isShared` reaches detection as a low attribution confidence but was dropped entirely
  // on the render path, so a communal multi-cat bowl produced a bold consumption claim.
  const snap = breachedTrialSnap()
  snap.diet.freeFed[0].isShared = true
  const p1 = text(pageOne(renderReport(snap)))
  assert.ok(/in a bowl shared with another pet; intake not directly observed/.test(p1))
  assert.ok(!/reaching Nyx/.test(p1), 'no consumption claim about a shared bowl')
})

Deno.test('B-351 — a trial food with NO designated main protein says the check could not run', () => {
  // The THIRD meaning of page-1 silence. The owner clearing the main is a supported
  // action, and it leaves a fully-READ multi-protein trial food with no target to compare
  // against — so `complete` is true, the unread escape hatch never fires, and page 1 went
  // completely quiet on a self-contaminated trial diet.
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
      diet: {
        trialTargetProtein: null,
        trial: { ...DUCK_TRIAL, primaryProtein: null, proteinSet: pset(['duck', 'chicken'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  const p1 = text(pageOne(html))
  assert.ok(
    /No main protein is recorded for the trial food, so its other proteins cannot be checked against the trial/.test(p1),
    'the un-runnable check is stated, not silent',
  )
  // Still present-only: it says the check could not run, never that the food is clean.
  assert.ok(!/nothing else|no other proteins|clean/i.test(p1))
})

Deno.test('B-351 — a SINGLE-protein trial food with no main protein stays silent (nothing to say)', () => {
  // The un-runnable-check line earns its place only when there is actually an unchecked
  // set. A one-protein food has no "other proteins", so the line would be noise.
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'diarrhea' },
      diet: {
        trialTargetProtein: null,
        trial: { ...DUCK_TRIAL, primaryProtein: null, proteinSet: pset(['duck'], { complete: true }) },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: null,
        mealItems: [],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  assert.ok(!/cannot be checked against the trial/.test(html))
})

// ── B-532 — the render-honesty pass (the cold-read blockers) ──────────────────────
//
// `plain()` decodes the entities `text()` deliberately leaves alone, so these assertions
// read like the sentence a vet sees rather than like tag soup.
function plain(html: string): string {
  return text(html)
    .replace(/&times;/g, '\u00d7')
    .replace(/&rarr;/g, '\u2192')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&middot;/g, '\u00b7')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

//
// Every test below was written from a defect REPRODUCED against `main` on the two real-
// pipeline artifacts before it was fixed, so each one fails on the pre-B-532 render.

Deno.test('B-532 — "completed" never claims a full course over a short one', () => {
  const short = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
      trial: trialBlockFixture({
        status: 'completed',
        endedAt: '2026-06-25',
        stoppedReason: 'completed',
        dayCounter: 49,
        targetDurationDays: 56,
      }),
    }),
  )
  const shortText = plain(short)
  assert.ok(
    /Marked complete at day 49 — 7 days short of the 56-day window\./.test(shortText),
    'the shortfall is named, in the same units the day phrase uses',
  )
  assert.ok(!/Ran its course/.test(shortText), 'and the full-course claim is not made')

  // The affirmative form survives — it is TRUE here, and deleting it would be its own
  // dishonesty (a completed 56-of-56 trial reading as though something went wrong).
  const full = plain(
    renderReport(
      base({
        clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
        trial: trialBlockFixture({
          status: 'completed',
          endedAt: '2026-07-02',
          stoppedReason: 'completed',
          dayCounter: 56,
          targetDurationDays: 56,
        }),
      }),
    ),
  )
  assert.ok(/Ran its course — the full window was completed\./.test(full))
  assert.ok(!/short of the/.test(full))
})

// ════════════════════════════════════════════════════════════════════════════════
// §5.2 — the laundering path a BACKWARD window move opens (CUL-1036, PR 0)
// ════════════════════════════════════════════════════════════════════════════════
//
// docs/nyx-trial-extension-requirements.md §5.2, §5.1, D3 · track home CUL-156.
//
// B-532 (directly above) fixed the half of this sentence that the report can see:
// a trial that stopped SHORT of its stored window no longer claims a full course.
// What it cannot see is the window MOVING. `target_duration_days` is overwritten in
// place, so a trial shortened to fit what actually happened is byte-identical, on
// this page and everywhere else, to one that was always that length (TE-4) — and
// `short` computes to 0, and the emphasised sentence says the course was completed.
//
// AN EIGHT-WEEK ELIMINATION TRIAL ABANDONED AT FOUR WEEKS IS RENDERED TO THE
// CLINICIAN AS ONE THAT RAN ITS COURSE, and nothing on the document contradicts it.
// On skin, 56 days IS the >90% band; on GI, ACVIM says continue ≥12 weeks. This is
// the sentence a 60-second scan takes.
//
// ── WHY THIS IS A TEST AND NOT A FIX ────────────────────────────────────────────
// D3a (ruled 2026-09-17) makes the window FORWARD-ONLY, so the app ships no control
// that can reach this state: `nextTargetDays`' clamp cannot write a target at or
// below the current day, and shortening routes to `Replace the trial`, which ends
// the trial honestly and records a `stopped_reason`. The defect is therefore held
// UN-SHIPPABLE rather than repaired, and this test is the trip-wire on that
// decision — a future spec that re-opens backward movement owes §5.2 a render rule
// FIRST, not a UI control, and it will find out here rather than on a vet's desk.
//
// So unlike an ordinary expected failure, this one is not waiting on an issue. It is
// waiting on a decision that currently says "never". It goes green only when the
// render learns to say what the window used to be (§5.1) — which is what a
// re-opening spec has to build before the control.

// The wrapper lives in `./expectedFailure.testutil.ts` — `trial.test.ts` needs it too
// for §5.4's report path, and a helper copied into each file is how a subtle bug
// propagates (`guards/blankComments.ts`'s own argument).

/** The worked case: a 56-day trial the owner shortened to 28 on day 28 and then
 *  marked complete. What the row HOLDS after that move is a 28-day window reached
 *  on day 28 — there is no column anywhere that remembers the 56. */
function shortenedToFit() {
  return base({
    clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
    trial: trialBlockFixture({
      status: 'completed',
      endedAt: '2026-06-04',
      stoppedReason: 'completed',
      dayCounter: 28,
      // ⚠️ THE MOVED VALUE. The trial was prescribed for 56 days. This is the only
      // thing the shortening changed, and it is the whole defect.
      targetDurationDays: 28,
    }),
  })
}

/** The control: the same trial, same day, with the record telling the truth about
 *  the window it was designed against. */
function windowUnmoved() {
  return base({
    clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
    trial: trialBlockFixture({
      status: 'completed',
      endedAt: '2026-06-04',
      stoppedReason: 'completed',
      dayCounter: 28,
      targetDurationDays: 56,
    }),
  })
}

Deno.test('§5.2 — the page CAN name a short trial, when the record still holds the window', () => {
  // The non-vacuity floor for the expected failure below. Without it, "the sentence
  // is wrong" would be indistinguishable from "the fixture never reached the
  // sentence" — and B-532's repair is what this proves is present and working.
  const honest = plain(renderReport(windowUnmoved()))
  assert.match(honest, /Marked complete at day 28 — 28 days short of the 56-day window\./)
  assert.ok(!/Ran its course/.test(honest), 'and it makes no full-course claim')
})

Deno.test('§5.2 — a window shortened to fit renders as a completed course (the defect)', () => {
  // EXECUTED, not transcribed. This is what the clinician reads today over a trial
  // abandoned at half its prescribed length.
  const laundered = plain(renderReport(shortenedToFit()))
  assert.match(laundered, /Ran its course — the full window was completed\./)
  assert.ok(!/short of the/.test(laundered), 'nothing on the page contradicts it')
  // And the original window is nowhere on the document — the finding TE-4 says the
  // record owes is not withheld, it is DELETED.
  assert.ok(!/56-day window/.test(laundered))
  assert.ok(!/\b56 days\b/.test(laundered))
})

expectedFailure(
  'EXPECTED FAILURE · §5.2 — a shortened window may never render as a completed course [D3 / CUL-156]',
  () => {
    const laundered = plain(renderReport(shortenedToFit()))
    // The requirement, in the two forms a repair could take: refuse the claim, or
    // name the window the trial was designed against (§5.1). Either satisfies this.
    //
    // The second clause is anchored to WINDOW VOCABULARY, not to the bare number.
    // A loose `/56/` was the first draft and it reported the requirement already
    // satisfied — "56" occurs on its own all over a rendered report (a count, a
    // percentage, a date). A guard whose second disjunct is always true is a guard
    // that only ever tests the first one.
    const namesTheOriginalWindow =
      /\b56[\s-]day window\b/.test(laundered) ||
      /\bfrom 56 days\b/.test(laundered) ||
      /\bwindow (?:was |is )?(?:extended|shortened|changed) from 56\b/.test(laundered)
    assert.ok(
      !/Ran its course — the full window was completed\./.test(laundered) ||
        namesTheOriginalWindow,
      'a trial shortened to fit what happened must not be rendered as one that ran ' +
        'its course, and the report owes the window it was designed against (§5.1)',
    )
  },
)

Deno.test('B-532 — Appendix E states EVERY intake rating, never the mode alone', () => {
  // The canonical artifact: 38 feedings of a prescribed diet, 34 refused and 4 partly
  // eaten. The mode column printed the single word "Refused" and the four meals that
  // were the only intake this cat took in nineteen days had no cell on the page.
  const html = renderReport(
    base({
      diet: {
        trialTargetProtein: null,
        trial: null,
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: { ratedMeals: 38, finishedMeals: 0, rate: 0, intakeBreakdown: [{ rating: 'refused', count: 38 }] },
        mealItems: [
          {
            foodLabel: "Hill's z/d",
            primaryProtein: 'chicken',
            proteinSet: pset(['chicken']),
            format: null,
            count: 38,
            firstDate: '2026-06-01',
            lastDate: '2026-06-19',
            intakeBreakdown: [
              { rating: 'some', count: 4 },
              { rating: 'refused', count: 34 },
            ],
          },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
        previousDiet: null,
        medicationVehicles: null,
      },
    }),
  )
  const t = plain(html)
  assert.ok(/Ate some ×4/.test(t), 'the non-modal rating is rendered with its count')
  assert.ok(/Refused ×34/.test(t), 'and so is the modal one — as a count, not a word')
  assert.ok(!/Typical intake/.test(html), 'the column no longer claims to be a "typical"')
})

Deno.test('B-532 — the unfinished meals are itemised with NO reduced-intake flag', () => {
  // `detectIntakeDecline` is a RELATIVE detector, so a diet refused from day 1 never fires
  // it — and the itemisation used to be gated on exactly that flag while three strings on
  // page 1 pointed the reader at it for the ratings. A circular dead end.
  const html = renderReport(
    base({
      provenance: {
        ...base().provenance,
        intakeLogScope: 'unfinished',
        intakeLog: [
          { eventId: 'm2', occurredAt: '2026-06-19T18:00:00Z', foodLabel: "Hill's z/d", intakeRating: 'refused', isLastFullMeal: false, pinned: false },
          { eventId: 'm1', occurredAt: '2026-06-03T18:00:00Z', foodLabel: "Hill's z/d", intakeRating: 'some', isLastFullMeal: false, pinned: false },
        ],
      },
    }),
  )
  const t = plain(html)
  assert.ok(/Meals not fully eaten/.test(t), 'the list renders and is captioned for its own population')
  assert.ok(/2 not-fully-eaten meals shown/.test(t), 'and counted as not-fully-eaten meals, not "rated meals"')
  assert.ok(
    !/no fully-eaten meal was recorded in this window/.test(t),
    'NEVER the anchor absence claim — the fully-eaten meals are precisely what this list filters out',
  )
  assert.ok(
    /did not fire here; that is not a reading of whether intake was adequate/.test(t),
    'and the absence is stated as detector silence, never as an all-clear',
  )
  assert.ok(
    !/No reduced-intake flag fired/.test(t),
    'never the bare phrase — page 1 can carry a diet-not-eaten flag while this detector is silent',
  )
})

Deno.test('B-532 — the trend delta compares EQUAL-length halves', () => {
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'itch',
          count: 16,
          symptomDays: 16,
          windowDays: 46,
          loggedDays: 43,
          weeklyBuckets: [4, 4, 3, 2, 2, 1, 0],
          bucketStartDates: ['2026-05-18'],
          trendHalves: {
            days: 23,
            firstCount: 11,
            lastCount: 5,
            firstStartDate: '2026-05-18',
            firstEndDate: '2026-06-09',
            lastStartDate: '2026-06-10',
            lastEndDate: '2026-07-02',
            middleCount: 0,
            middleDate: null,
          },
        }),
      ],
    }),
  )
  const t = plain(html)
  assert.ok(/first 23 d 11 → last 23 d 5/.test(t.replace(/ \d+ logged/g, '')), 'both halves are the same length')
  // Round 7: the delta carries its own observed-day count, so an unobserved stretch cannot be
  // absorbed into the headline number by a threshold that (correctly) does not fire.
  assert.ok(/first 23 d 0 logged/.test(t), 'and each half states how much of it was observed')
  assert.ok(
    /trend halves: May 18 – Jun 9, 2026 \(0 of 23 d logged\) vs Jun 10 – Jul 2, 2026 \(0 of 23 d logged\)/.test(t),
    'the partition is dated (so it is not confused with the bars or the window) AND its exposure is stated',
  )
})

Deno.test('B-532 — a snapshot with no halves renders no delta at all (never a fabricated one)', () => {
  const html = renderReport(base({ symptoms: [aggregate({ type: 'itch', count: 3, weeklyBuckets: [2, 1] })] }))
  assert.ok(!/class="delta"/.test(html), 'no halves ⇒ no comparison invented from the bars')
  assert.ok(!/trend halves:/.test(plain(html)), 'and no partition is named for a comparison that is not there')
})

Deno.test('B-532 — Appendix D carries dose DATES and the unlogged-medication caveat', () => {
  const html = renderReport(
    base({
      medications: [med({ doseDays: ['2026-06-05', '2026-07-02'], givenDoses: 2, windowDosesLogged: 2, lifetimeDosesLogged: 2, daysWithDose: 2, prescribedDoses: null, unconfirmedDoses: 0 })],
    }),
  )
  const t = plain(html)
  assert.ok(/Dose dates/.test(t), 'the column exists')
  assert.ok(/Jun 5, Jul 2/.test(t), 'and lists the days, so "2 doses over 28 d" cannot read as continuous cover')
  assert.ok(
    /A medication prescribed elsewhere and never logged does not appear here/.test(t),
    'the absence of a drug from this table is not evidence it was not given',
  )
  assert.ok(/antipruritics/.test(t), 'named for the derm trial, where the confound is decisive')
})

Deno.test('B-532 — the unlogged-medication caveat also rides the EMPTY medication table', () => {
  // The empty state is where the silence is loudest: "No prescription medications overlap
  // this window" reads as a fact about the animal unless the page says whose log it is.
  const t = plain(renderReport(base()))
  assert.ok(/No prescription medication is recorded in this window/.test(t))
  assert.ok(/This lists only what the owner entered in Culprit/.test(t))
})

// ── §4.4 (D2) — the lifetime medication-history table render ────────────────────
function mhEntry(over: Partial<MedicationHistoryEntry> & { drugName: string }): MedicationHistoryEntry {
  return {
    key: over.key ?? over.drugName,
    source: over.source ?? 'regimen',
    drugName: over.drugName,
    isActive: over.isActive ?? false,
    ended: over.ended ?? false,
    endStatus: over.endStatus ?? null,
    endedDay: over.endedDay ?? null,
    startedDay: over.startedDay ?? null,
    firstDoseDay: over.firstDoseDay ?? null,
    lastDoseDay: over.lastDoseDay ?? null,
    singleDay: over.singleDay ?? false,
    targetDurationDays: over.targetDurationDays ?? null,
    targetDurationDoses: over.targetDurationDoses ?? null,
    dosesPerDay: over.dosesPerDay ?? null,
    scheduleNotes: over.scheduleNotes ?? null,
    runDays: over.runDays ?? null,
    plannedDoses: over.plannedDoses ?? null,
    dosesLogged: over.dosesLogged ?? 0,
  }
}
function mhTable(entries: MedicationHistoryEntry[], sinceDay: string | null = null): MedicationHistoryTable {
  return { entries, sinceDay }
}

Deno.test('§4.4 render — the table renders its title, coverage note and the H1 disclosure UP FRONT', () => {
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Motozol', isActive: true, startedDay: '2026-07-22', targetDurationDoses: 28, dosesPerDay: 2, plannedDoses: 28, dosesLogged: 26, firstDoseDay: '2026-07-22', lastDoseDay: '2026-08-03' }),
    ], '2026-02-11'),
  })))
  assert.ok(/Medication history/.test(t))
  assert.ok(/Lifetime of the record \(since Feb 2026\)/.test(t))
  assert.ok(/the medications logged in Culprit/.test(t))
  // Dates are described accurately for BOTH registers (regimen span vs dose span).
  assert.ok(/Dates are each course.s span/.test(t))
  // The H1 disclosure, stated BEFORE the table (B-494 — a load-bearing disclosure a skimmer must apply).
  assert.ok(/no end date is one whose end the owner never recorded/.test(t))
  // The COMPLETENESS caveat lives ON the lifetime table (cold-read blocker #2): the lifetime
  // overview is the surface that invites "is this everything she's ever had?", so "absence is
  // not evidence it was not given" must sit here, not only under Appendix D.
  assert.ok(/its absence is not evidence it was not given/.test(t))
})

Deno.test('§4.4 render — an ACTIVE dose-course: "– present", "N doses planned", a BARE count (no countdown)', () => {
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Motozol', isActive: true, startedDay: '2026-07-22', targetDurationDoses: 28, dosesPerDay: 2, plannedDoses: 28, dosesLogged: 26, firstDoseDay: '2026-07-22', lastDoseDay: '2026-08-03' }),
    ], '2026-07-22'),
  })))
  assert.ok(/Jul 22, 2026 – present/.test(t))
  assert.ok(/28 doses planned, 2×\/day/.test(t))
  // Active → the bare count, never "26 of 28": a mid-course "of N" reads as a countdown (B-618 D7).
  assert.ok(!/26 of 28/.test(t))
})

Deno.test('§4.4 render — an ENDED regimen: a closed range, "ended by owner", and "of N" delivered/planned', () => {
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Metronidazole', source: 'regimen', ended: true, endStatus: 'completed', startedDay: '2026-03-03', endedDay: '2026-03-16', targetDurationDays: 14, dosesPerDay: 2, plannedDoses: 28, dosesLogged: 26, runDays: 14, firstDoseDay: '2026-03-03', lastDoseDay: '2026-03-16' }),
    ], '2026-03-03'),
  })))
  assert.ok(/Mar 3 – Mar 16, 2026/.test(t))
  assert.ok(/14 days, 2×\/day · ended by owner/.test(t))
  assert.ok(/26 of 28/.test(t))
})

Deno.test('§4.4 render/H1 — a dose-derived course NEVER reads as ended, and shows its dose span', () => {
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Cetirizine HCl (Zyrtec)', source: 'doses', dosesLogged: 3, firstDoseDay: '2026-06-02', lastDoseDay: '2026-06-09' }),
      mhEntry({ drugName: 'Maropitant (Cerenia)', source: 'doses', singleDay: true, dosesLogged: 1, firstDoseDay: '2026-02-11', lastDoseDay: '2026-02-11' }),
    ], '2026-02-11'),
  })))
  // The orphan tell — never "ended by owner".
  assert.ok(/No regimen recorded/.test(t))
  assert.ok(/Single logged dose/.test(t))
  assert.ok(!/ended by owner/.test(t))
  // A dose span for the multi-dose orphan; a bare date for the single dose.
  assert.ok(/Jun 2 – Jun 9, 2026/.test(t))
  assert.ok(/Feb 11, 2026/.test(t))
})

Deno.test('§4.4 render — nothing renders when there is no medication history (a null section, not an empty table)', () => {
  const t = plain(renderReport(base({ medicationHistory: null })))
  assert.ok(!/Medication history/.test(t))
})

Deno.test('§4.4 render — an over-delivered ended course drops the "of N" frame (never "30 of 28")', () => {
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Clavamox', source: 'regimen', ended: true, endStatus: 'completed', startedDay: '2026-07-01', endedDay: '2026-07-05', targetDurationDays: 5, dosesPerDay: 1, plannedDoses: 5, dosesLogged: 6, runDays: 5, firstDoseDay: '2026-07-01', lastDoseDay: '2026-07-08' }),
    ], '2026-07-01'),
  })))
  assert.ok(/Clavamox/.test(t))
  assert.ok(!/6 of 5/.test(t)) // the frame is dropped; the bare honest count stays
})

Deno.test('§4.4 render/H1 — an owner-ended course with NO recorded end date never fabricates one (adversarial)', () => {
  // ended_at is nullable and the derivation models { ended, endedAt: null }. The Dates cell must NOT
  // synthesize a closed range ending at the stray last-dose day — that is a fabricated recorded end.
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Metronidazole', source: 'regimen', ended: true, endStatus: 'completed', endedDay: null, startedDay: '2026-03-03', targetDurationDays: 14, dosesPerDay: 2, plannedDoses: 28, dosesLogged: 2, firstDoseDay: '2026-03-03', lastDoseDay: '2026-06-09' }),
    ], '2026-03-03'),
  })))
  assert.ok(/started Mar 3, 2026/.test(t)) // the start, stated plainly
  assert.ok(/ended by owner/.test(t)) // the ending is still disclosed — in the Course cell
  assert.ok(!/Mar 3 – Jun 9, 2026/.test(t)) // NEVER the fabricated closed range the adversarial pass caught
})

Deno.test('§4.4 render/H1 — a regimen neither active nor owner-ended shows only its start, never a finished-looking range (adversarial)', () => {
  // A paused / unknown-status regimen (end.kind === "none", isActive false) with logged doses. Its
  // Course cell shows a real regimen spec, so a closed "start – lastDose" range would read as finished.
  const t = plain(renderReport(base({
    medicationHistory: mhTable([
      mhEntry({ drugName: 'Gabapentin', source: 'regimen', isActive: false, ended: false, startedDay: '2026-01-01', targetDurationDays: 14, dosesPerDay: 2, plannedDoses: 28, dosesLogged: 2, firstDoseDay: '2026-01-05', lastDoseDay: '2026-02-20' }),
    ], '2026-01-01'),
  })))
  assert.ok(/started Jan 1, 2026/.test(t))
  assert.ok(!/Jan 1 – Feb 20, 2026/.test(t)) // never a finished-looking closed range
  assert.ok(!/ended by owner/.test(t)) // not ended → no ending marker
})

Deno.test('B-599 — page 1 never points at an "Also during the trial" row that will not render', () => {
  // A free-fed bowl OF THE TRIAL DIET: `intakeNotDirectlyObserved` withholds the clean
  // claim, but `arrangementExposures` is empty (nothing off-list), so the referenced row
  // is never emitted and the phrase occurred exactly once in the whole document.
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
      trial: trialBlockFixture({
        allowedSetUnavailable: false,
        mayClaimAllMatched: false,
        mayStateRecordClean: false,
        intakeNotDirectlyObserved: true,
        interpretability: 'supports',
        interpretabilityStatement: 'This record covers the trial well enough to support interpreting it.',
        exposures: { totalFeedings: 32, offDiet: 0, byRung: { derived_protein: 0, unrecognised: 0 }, fedBeforePermitted: 0, unclassifiable: 0, items: [] },
      }),
    }),
  )
  const t = plain(html)
  assert.ok(!/Also during the trial/.test(t), 'the row does not render on this record…')
  assert.ok(!/see "Also during the trial" below/.test(t), '…so nothing points at it')
  assert.ok(
    /Food was continuously available in a bowl during the trial/.test(t),
    'the reason is named where the pointer used to be',
  )
  assert.ok(/No clean-elimination statement is made for this record/.test(t))
})

// ── CUL-746 — the breakdown partitions the total it names ───────────────────
//
// `exposureSentences` used to print the rung tally and then APPEND the
// dated-membership count as a trailing "also", so the same rows were reported
// twice under two reasons and the numbers did not add up to the `offDiet` the
// same sentence had just stated. This asserts the arithmetic over a fuzz of
// exposure shapes, by PARSING THE RENDERED NUMBERS BACK OUT — a test that
// re-states the counts it passed in would pass over any grouping bug at all.

/** One off-diet exposure row, in the shape the snapshot carries. */
function exposureItem(
  rung: 'derived_protein' | 'unrecognised',
  permittedLaterFrom: string | null,
): NonNullable<ReportSnapshot['trial']>['exposures']['items'][number] {
  return {
    eventId: `e-${rung}-${permittedLaterFrom ?? 'none'}-${Math.random()}`,
    occurredAt: '2026-06-02T13:00:00Z',
    dayIndex: 20606,
    label: 'A food',
    classification: {
      // The real verdict for each rung — a fabricated one would type-check only behind
      // a cast, and would stop documenting what a live row looks like.
      verdict: rung === 'derived_protein' ? 'off_diet_protein' : 'off_diet_unrecognised',
      rung,
      offDiet: true,
      countsAsFeeding: true,
      antigens: [],
      role: null,
      matchedBy: null,
      permittedBy: null,
      attributionChecked: true,
    },
    symptomInChallengeWindow: false,
    panelWasRead: false,
    attributionChecked: true,
    permittedLaterFrom,
  }
}

Deno.test('CUL-746 — the "Of those N" breakdown always sums to N', () => {
  // Every shape the partition has to survive: no dated rows, all dated, dated rows
  // split across both rungs, a single row (which takes the singular), and a
  // snapshot whose `items` DISAGREE with its own `byRung` in both directions —
  // the state the caps exist for, where a naive subtraction goes negative or the
  // clauses over-run the total the reader has just been given.
  const shapes: { name: string; dp: number; un: number; offDiet?: number; items: ReturnType<typeof exposureItem>[] }[] = [
    { name: 'no dated rows', dp: 3, un: 2, items: [] },
    { name: 'all dated, one rung', dp: 0, un: 7, items: Array.from({ length: 7 }, () => exposureItem('unrecognised', '2026-06-01')) },
    { name: 'one dated among four protein rows', dp: 4, un: 0, items: [exposureItem('derived_protein', '2026-06-08')] },
    { name: 'dated rows across both rungs', dp: 3, un: 4, items: [exposureItem('derived_protein', '2026-06-08'), exposureItem('unrecognised', '2026-06-08')] },
    { name: 'a single dated row', dp: 0, un: 1, items: [exposureItem('unrecognised', '2026-06-01')] },
    { name: 'items claim MORE dated rows than byRung has', dp: 1, un: 0, items: Array.from({ length: 5 }, () => exposureItem('derived_protein', '2026-06-01')) },
    // A snapshot that counts an exposure no rung claims. Unreachable from the module
    // (only rungs 2 and 3 set `offDiet`), and the point is that the sentence still
    // partitions rather than rendering "Of those 3:" with nothing after the colon.
    { name: 'byRung is empty while offDiet is not', dp: 0, un: 0, offDiet: 3, items: [exposureItem('unrecognised', '2026-06-01')] },
    // …and the mirror, which exercises the CEILING caps rather than the non-negativity
    // floor: a `byRung` summing to MORE than `offDiet`. Code review mutation-proved that
    // without a shape like this, deleting either `Math.min` ceiling left every test
    // green — a defensive cap nothing was holding.
    { name: 'byRung sums to more than offDiet, dated rows included', dp: 4, un: 4, offDiet: 3, items: Array.from({ length: 4 }, () => exposureItem('derived_protein', '2026-06-01')) },
    { name: 'byRung sums to more than offDiet, no dated rows', dp: 5, un: 5, offDiet: 2, items: [] },
    { name: 'mixed roles degrade to the general noun', dp: 1, un: 1, items: [exposureItem('derived_protein', '2026-06-08'), exposureItem('unrecognised', '2026-06-08')] },
    { name: 'dated rows with DIFFERENT permission dates name none of them', dp: 0, un: 2, items: [exposureItem('unrecognised', '2026-06-01'), exposureItem('unrecognised', '2026-06-08')] },
  ]
  for (const shape of shapes) {
    const offDiet = shape.offDiet ?? shape.dp + shape.un
    const html = renderReport(
      base({
        clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
        trial: trialBlockFixture({
          allowedSetUnavailable: false,
          mayClaimAllMatched: false,
          mayStateRecordClean: false,
          exposures: {
            totalFeedings: offDiet + 10,
            offDiet,
            byRung: { derived_protein: shape.dp, unrecognised: shape.un },
            fedBeforePermitted: shape.items.length,
            unclassifiable: 0,
            items: shape.items,
          },
        }),
      }),
    )
    const t = plain(html)
    const m = /Of those (\d+): ([^.]*(?:\.\d|[^.])*)\. Dates in appendix/.exec(t)
    assert.ok(m, `${shape.name}: no breakdown sentence rendered`)
    const stated = Number(m![1])
    assert.equal(stated, offDiet, `${shape.name}: the sentence names the wrong total`)
    // Read the clause counts back out of the prose, never out of the fixture.
    const counts = [...m![2].matchAll(/(?:^|; )(\d+) /g)].map((x) => Number(x[1]))
    assert.ok(counts.length > 0, `${shape.name}: "Of those ${stated}:" with no clauses — ${m![2]}`)
    assert.equal(
      counts.reduce((a, b) => a + b, 0),
      stated,
      `${shape.name}: clauses ${counts.join('+')} do not sum to the ${stated} named beside them — ${m![2]}`,
    )
    assert.ok(!counts.some((c) => c <= 0), `${shape.name}: a clause rendered a non-positive count — ${m![2]}`)
    // The additive framing this replaced, in either of its two shapes.
    assert.ok(!/also fed before/.test(t), `${shape.name}: the date is the reason, never a trailing "also"`)
  }
})

Deno.test('B-599 — the pointer SURVIVES where the row really does render', () => {
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
      trial: trialBlockFixture({
        allowedSetUnavailable: false,
        mayClaimAllMatched: false,
        mayStateRecordClean: false,
        exposures: { totalFeedings: 32, offDiet: 0, byRung: { derived_protein: 0, unrecognised: 0 }, fedBeforePermitted: 0, unclassifiable: 2, items: [] },
      }),
    }),
  )
  const t = plain(html)
  assert.ok(/see "Also during the trial" below/.test(t), 'the cross-reference is kept…')
  assert.ok(/Also during the trial/.test(t.replace(/see "Also during the trial" below/, '')), '…and it resolves')
})

Deno.test('B-532 — a chronicity span that starts at the window edge is stated as a floor', () => {
  const censored = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'itch',
            episodeCount: 16,
            spanDays: 35,
            activeWeeks: 5,
            symptomDays: 16,
            daysSinceLastEpisode: 7,
            firstOnsetIso: '2026-04-06T14:00:00Z', // 3 days into a window opening Apr 3
            firstLoggedIso: '2026-04-06T14:00:00Z',
            tier: 'standard',
            windowDays: 91,
          },
        ],
      }),
    ),
  )
  assert.ok(/first logged Apr 6/.test(censored), 'the date is stated as a LOG event, not as an onset')
  assert.ok(!/first noted/.test(censored), 'and never as "first noted", which is a claim about the animal')
  assert.ok(/35 days is a floor/.test(censored), 'the span is a floor when the window truncates it')

  const observed = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'itch',
            episodeCount: 16,
            spanDays: 35,
            activeWeeks: 5,
            symptomDays: 16,
            daysSinceLastEpisode: 7,
            firstOnsetIso: '2026-05-20T14:00:00Z', // seven weeks into the window — genuinely observed
            firstLoggedIso: '2026-05-20T14:00:00Z',
            tier: 'standard',
            windowDays: 91,
          },
        ],
      }),
    ),
  )
  assert.ok(!/is a floor/.test(observed), 'and NOT a floor when the record actually saw the start')
})

Deno.test('CUL-69 — the flag dates the record\'s first log, not the detector\'s lookback edge', () => {
  // The 90-day report window strictly CONTAINS the 56-day chronicity lookback, so on the
  // default report the detector's first onset is pinned to the lookback edge for any course
  // that predates it — while appendix A, one page later, prints the earlier entries.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 14,
            spanDays: 53,
            activeWeeks: 6,
            symptomDays: 11,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z', // the lookback edge: 56d before Jul 2
            firstLoggedIso: '2026-04-10T09:00:00Z', // the record's own first entry, 28d earlier
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/first logged Apr 10/.test(t), 'the date is the record\'s first entry')
  assert.ok(!/first logged May 8/.test(t), 'never the lookback edge, which is a fact about the window')
})

Deno.test('CUL-69 — the SPAN stays the engine\'s; a stale entry never lengthens a course', () => {
  // The adversarial pass (2026-08-30) broke the first draft here, and this is the guard for it.
  // Extending the span by the record that precedes the lookback re-opens §10 #4 — the "two
  // distant data points" break the engine closes with `loggingEligible`, `countDistributionWeeks`
  // and the minSpan/minEpisodes conjunction. One stale vomit before a real weekly course printed
  // "spans 335 days · 7 episodes": the duration ran toward alarm and was false, and the DENSITY
  // a vet triages on ran toward reassurance. A record-anchored DATE is free; a DURATION is not.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 7,
            spanDays: 42,
            activeWeeks: 7,
            symptomDays: 7,
            daysSinceLastEpisode: 14,
            firstOnsetIso: '2026-05-08T14:00:00Z', // the real course
            firstLoggedIso: '2026-04-04T14:00:00Z', // one stale entry, 34 days earlier
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/spans 42 days/.test(t), 'the engine\'s guarded span, unmodified')
  assert.ok(!/spans 76 days/.test(t), 'the stale entry never manufactures a longer course')
  // …and the span must not read as running from the record's first entry, which is what the
  // "(first logged X)" parenthetical asserts when glued to it.
  assert.ok(!/spans 42 days \(first logged/.test(t), 'the parenthetical drops rather than dating the span')
  assert.ok(/was first logged Apr 4/.test(t), 'the record date is still stated, in its own sentence')
  assert.ok(/these counts begin at May 8/.test(t), 'and the counts name where they actually start')
})

Deno.test('CUL-69 — the disclosure names a DATE, never a day count that can exceed the span', () => {
  // Adversarial finding 3: the first draft printed "counts cover the most recent 56 days of that
  // span" over a 43-day span. 56 > 43 reads as "nothing is missing" — the exact inverse of the
  // warning. The lookback runs back from the window END, so it is never a portion of the span.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 7,
            spanDays: 42,
            activeWeeks: 7,
            symptomDays: 7,
            daysSinceLastEpisode: 14,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-05-07T14:00:00Z', // one day before the lookback edge
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(!/56 days of that span/.test(t), 'no scope claim wider than the span it modifies')
  assert.ok(!/most recent 56 days/.test(t), 'the lookback length is not a portion of the span')
  assert.ok(/these counts begin at May 8/.test(t), 'the counts state their start date instead')
})

Deno.test('CUL-69 — the disclosure gate is instant-granular, and never names one date twice', () => {
  // Adversarial finding 4 (pass 1): the lookback cuts at an INSTANT, so entries earlier on the
  // same local day as the first counted onset are excluded from the counts too. A local-day gate
  // said "nothing is missing" while 3 of 10 episodes sat outside the counts.
  //
  // Adversarial finding 3 (pass 2): fixing that with an instant gate, while both DATES render as
  // local days, made this very fixture print "was first logged May 7; these counts begin at
  // May 7" — a sentence promising earlier entries and naming nothing they are earlier than. The
  // first version of this test asserted only that the disclosure fired, so it was green over the
  // defect it created; it now asserts the sentence is coherent.
  const t = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 7,
            spanDays: 42,
            activeWeeks: 7,
            symptomDays: 7,
            daysSinceLastEpisode: 14,
            firstOnsetIso: '2026-05-08T16:00:00Z', // 12:00 local
            firstLoggedIso: '2026-05-08T09:00:00Z', // 05:00 local — SAME local day, still uncounted
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  assert.ok(/first logged May 8/.test(t), 'a same-local-day truncation is still disclosed')
  assert.ok(/these counts begin later that day/.test(t), 'and says WHERE they begin without re-naming the date')
  assert.ok(!/these counts begin at May 8/.test(t), 'never "first logged May 8 … begin at May 8"')
})

Deno.test('CUL-69 — a span the lookback fully covers is unchanged, and states no disclosure', () => {
  // Refactor-safety direction: this must hold BEFORE and AFTER. When the lookback reaches the
  // record's first entry there is nothing bounded and nothing to disclose, so the sentence keeps
  // exactly the shape CUL-687 settled — parenthetical included.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 8,
            spanDays: 40,
            activeWeeks: 5,
            symptomDays: 8,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-20T14:00:00Z',
            firstLoggedIso: '2026-05-20T14:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/spans 40 days \(first logged May 20\)/.test(t), 'CUL-687\'s wording is untouched')
  assert.ok(!/these counts begin at/.test(t), 'no disclosure where there is nothing to disclose')
  assert.ok(!/was first logged/.test(t), 'and no second date sentence')
})

Deno.test('CUL-69 — the left-censor fires on the RECORD anchor, and states no floor it cannot defend', () => {
  // Two disjoint cases, because two different boundaries can bind.
  //
  // BOTH bind (the record starts at the window edge AND the counts start later still): no single
  // number is the floor. `spanDays` counts the course and understates — measured at a median 32
  // days short over dense chronic records, in the reassuring direction B-494 forbids — while the
  // record's own extent is two logged rows, so stating THAT as a duration is the §10 #4 break the
  // first adversarial pass caught. The window fact is stated with no duration attached.
  const both = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'itch',
            episodeCount: 16,
            spanDays: 35,
            activeWeeks: 5,
            symptomDays: 16,
            daysSinceLastEpisode: 7,
            firstOnsetIso: '2026-05-08T14:00:00Z', // the lookback edge, mid-window
            firstLoggedIso: '2026-04-06T14:00:00Z', // 3 days into a window opening Apr 3
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  assert.ok(/was first logged Apr 6/.test(both), 'the record anchor is stated')
  assert.ok(
    /This window opens Apr 3, 2026, so the record cannot show how long the sign predates it/.test(both),
    'the window fact still lands, and its date carries the year the rest of the row does',
  )
  assert.ok(!/This window opens Apr 3, so/.test(both), 'never the single bare date on a year-stamped row')
  assert.ok(!/35 days is a floor/.test(both), 'no floor understated by the record the same paragraph cites')
  assert.ok(!/67 days is a floor/.test(both), 'and no record extent restated as a measured duration')
  assert.ok(!/is a floor/.test(both), 'no floor number at all where none is defensible')

  // ONLY the window binds (the lookback covers the whole record, so the counts start where the
  // record does): `spanDays` is both the course and the record's extent, and B-532's sentence is
  // exactly right. Unchanged from before CUL-69.
  const windowOnly = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'itch',
            episodeCount: 16,
            spanDays: 35,
            activeWeeks: 5,
            symptomDays: 16,
            daysSinceLastEpisode: 7,
            firstOnsetIso: '2026-04-06T14:00:00Z',
            firstLoggedIso: '2026-04-06T14:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  assert.ok(/35 days is a floor/.test(windowOnly), "B-532's floor is untouched where it is defensible")
  assert.ok(/first logged Apr 6/.test(windowOnly))
  assert.ok(/This window opens Apr 3, so/.test(windowOnly), 'and its dates stay bare, exactly as B-532 shipped them')
  assert.ok(!/Apr 3, 2026/.test(windowOnly), 'no year appears where the row never leaves the window')
})

Deno.test('CUL-69 — a record anchor outside the window\'s year carries its year', () => {
  // Year-less rendering ("Mon D") was safe BY CONSTRUCTION while the only date printed here was
  // the detector's onset, structurally within the lookback of the window end. Repointing it at the
  // record anchor removed that construction: `since_visit` and stale-active `diet_trial` windows
  // have no clamp, so the anchor can be years old. Rendered year-less it read as this year — a
  // 27-month-old sign as a two-month-old one, toward reassurance (adversarial pass 3).
  const snap = base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-10T14:00:00Z',
            firstLoggedIso: '2024-03-10T14:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })
  snap.scope = { ...snap.scope, basis: 'since_visit', startDate: '2024-03-01', startDayNum: 19783, windowDays: 854 }
  const t = plain(renderReport(snap))
  assert.ok(/first logged Mar 10, 2024/.test(t), 'an out-of-year anchor names its year')
  assert.ok(!/first logged Mar 10;/.test(t), 'never bare, which reads as the window\'s own year')
  // ALL-OR-NOTHING. The conditional version stamped only the out-of-year date — structurally
  // always the FIRST of the pair, since firstLogged <= firstOnset — and a bare date following a
  // stamped one inherits its year in ordinary English, which reversed the pair on 236/236 of them.
  assert.ok(/these counts begin at May 10, 2026/.test(t), 'the second date is stamped too, never left to inherit')
  assert.ok(!/begin at May 10 /.test(t), 'no bare date beside a stamped one')
})

Deno.test('CUL-69 — a cross-year pair never renders the counts beginning before the first log', () => {
  // The loud half of the same defect: on a window straddling New Year, both dates year-less
  // rendered "first logged Nov 23; these counts begin at Jan 1" — the counts appearing to start ten
  // months BEFORE the first log, immediately followed by a clause asserting record "before then".
  // 11% of generation days on a plain 90-day fallback.
  const snap = base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2025-11-23T14:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })
  snap.scope = { ...snap.scope, startDate: '2025-11-01', startDayNum: 20393, windowDays: 244 }
  const t = plain(renderReport(snap))
  // ASSERTED ON THE DATES, NOT ON DOCUMENT ORDER. The first version of this compared indexOf()
  // offsets of the two clauses, which is trivially true for two halves of one sentence — it
  // asserted the sentence's word order and shipped an instance of the defect as its expected
  // output (adversarial pass 4). Read the two rendered dates back and compare them as dates.
  const pair = /first logged ([A-Z][a-z]{2} \d{1,2}, \d{4}); these counts begin at ([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(t)
  assert.ok(pair, `both dates render fully qualified; got: ${t.slice(t.indexOf('was first logged'), t.indexOf('was first logged') + 120)}`)
  const [, loggedDay, beginDay] = pair as RegExpExecArray
  assert.equal(loggedDay, 'Nov 23, 2025')
  assert.equal(beginDay, 'May 8, 2026')
  assert.ok(
    Date.parse(loggedDay) < Date.parse(beginDay),
    `the counts must not begin before the first log (${loggedDay} → ${beginDay})`,
  )
})

Deno.test('CUL-69 — the counts-begin date carries its year too when it falls outside the window\'s', () => {
  // The counts-begin date is structurally within the lookback of the window end, so it is only
  // ever one year boundary away — but a report generated in January reaches back into the previous
  // year, and both dates in this sentence are read together. A year on one and not the other, on a
  // record whose anchor is older still, is the same ambiguity one clause over.
  const snap = base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2025-12-05T14:00:00Z', // inside the lookback, previous year
            firstLoggedIso: '2024-03-10T14:00:00Z', // older still
            tier: 'standard',
            windowDays: 56,
          },
  ] })
  snap.scope = { ...snap.scope, basis: 'since_visit', startDate: '2024-03-01', endDate: '2026-01-15', startDayNum: 19783, endDayNum: 20468, windowDays: 686 }
  const t = plain(renderReport(snap))
  assert.ok(/first logged Mar 10, 2024/.test(t), 'the record anchor names its year')
  assert.ok(/these counts begin at Dec 5, 2025/.test(t), 'and so does the counts-begin date')
  assert.ok(!/begin at Dec 5 /.test(t), 'never bare beside a stamped anchor')
})

Deno.test('CUL-69 — the censor claims nothing about WHERE the first entry sits', () => {
  // CHRONICITY_LEFT_CENSOR_DAYS is a 7-day tolerance, so "the record's first entry sits at that
  // edge" asserted an exactness it does not have and contradicted the date in the sentence before
  // it by up to a week — on 29 of 156 disclosed flags (adversarial pass 3). B-532's original clause
  // claimed nothing of the kind.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-04-09T14:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/first logged Apr 9/.test(t), 'the entry is six days inside the window')
  assert.ok(/This window opens Apr 3, 2026, so the record cannot show how long the sign predates it/.test(t))
  assert.ok(!/sits at that edge/.test(t), 'no exactness claim the tolerance cannot support')
})

Deno.test('CUL-69 — the disclosure tail never pluralises over a count this layer does not hold', () => {
  // Both branches are number-agnostic: the stale-singleton case really is one entry, and the
  // render layer is not told how many there are.
  const sameDay = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T16:00:00Z',
            firstLoggedIso: '2026-05-08T09:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/begin later that day — appendix A lists this window/.test(sameDay), 'same-day branch takes the shared tail')
  assert.ok(!/the earlier entries are in/.test(sameDay), 'never a plural over a possible single entry')
  // NOT an unrestricted universal: appendix A holds in-window rows only, and on the default
  // cascade there is no out-of-window disclosure at all, so "anything logged before then is in
  // appendix A" was false for any record older than the window — and contradicted the censor
  // sentence outright wherever both fire (adversarial pass 4).
  assert.ok(!/anything logged before then is in appendix/.test(sameDay), 'no claim about records outside the window')

  const otherDay = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-04-10T09:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
  ] })))
  assert.ok(/appendix A lists this window's entries, including those before then/.test(otherDay), 'and the same tail')
  assert.ok(!/the record before then is in appendix/.test(otherDay), 'the differing-day branch drops the universal too')
})

Deno.test('CUL-69 — the §9 adjacency caveat leads the window mechanics, not the other way round', () => {
  // Principle 6: the flag row grew by up to two sentences, and the cough↔vomit caveat ("either
  // count may be understated as readily as overstated") is clinically load-bearing while the
  // window-mechanics sentences are not. It reads first.
  const t = plain(renderReport(base({ safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-04-10T09:00:00Z',
            tier: 'standard',
            windowDays: 56,
            coughVomitAdjacent: true,
          },
  ] })))
  const caveat = t.indexOf('understated as readily as overstated')
  const mechanics = t.indexOf('these counts begin at')
  assert.ok(caveat >= 0 && mechanics >= 0, 'both render')
  assert.ok(caveat < mechanics, 'the clinical caveat is not demoted behind the window mechanics')
})

Deno.test('CUL-69 — every chronicity symptom really is in appendix A, as the copy promises', () => {
  // The flag now tells a vet the earlier entries "are in appendix A". That was prose in the §13a
  // membership walk and is now owner-facing copy, so it is asserted: appendix A is built from
  // REPORT_SYMPTOM_TYPES, the chronicity lane is its own list, and a leaf joining one and not the
  // other would make the report point at a table that does not carry the rows.
  for (const t of LANE_SYMPTOM_TYPES.chronicity) {
    assert.ok(
      (REPORT_SYMPTOM_TYPES as readonly string[]).includes(t),
      `chronicity lane member ${t} is missing from REPORT_SYMPTOM_TYPES, so appendix A would not list it`,
    )
  }
})

Deno.test('CUL-69 — one safety band renders the window-open date exactly one way', () => {
  // A band carrying two chronic courses — one reaching back past its counts, one not — decided the
  // year PER ROW and so printed the same window-open date two ways, two lines apart. That is the
  // B-532/HR-7 "one page, two renders of one fact" class (adversarial pass 5, reachable at a ~57–64
  // day window). The switch is band-scoped: a row gaining a year it did not need is merely more
  // explicit, while a page disagreeing with itself about a date is the defect.
  const t = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 48,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-04-05T14:00:00Z', // reaches back past its counts
            tier: 'standard',
            windowDays: 56,
          },
          {
            kind: 'chronicity',
            symptomType: 'cough',
            episodeCount: 12,
            spanDays: 48,
            activeWeeks: 6,
            symptomDays: 12,
            daysSinceLastEpisode: 3,
            firstOnsetIso: '2026-04-06T14:00:00Z',
            firstLoggedIso: '2026-04-06T14:00:00Z', // does not
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  const renders = [...t.matchAll(/This window opens ([A-Z][a-z]{2} \d{1,2}(?:, \d{4})?)/g)].map((m) => m[1])
  assert.ok(renders.length >= 2, `both censor sentences render; got ${renders.length}`)
  assert.equal(new Set(renders).size, 1, `one date, one rendering; got ${JSON.stringify(renders)}`)
})

Deno.test('CUL-69 — the year is decided once for the row, never per date', () => {
  // The `/^\d{4}$/` guard was evaluated per date, so a key Intl does not zero-pad could pass for
  // one date and fail for the other — splitting exactly the pair the switch exists to keep
  // together ("Mar 10" beside "May 20, 2026"). Unreachable from a timestamptz, but the comment
  // claimed an invariant the code did not enforce, which is the shape that cost this arm four
  // review rounds (adversarial pass 5).
  const t = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-20T14:00:00Z',
            firstLoggedIso: '0001-03-10T14:00:00Z', // Intl renders the year unpadded
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  const stamped = /first logged [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(t)
  const beginStamped = /these counts begin at [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(t)
  assert.equal(stamped, beginStamped, 'both dates carry a year or neither does — never one of the two')
})

Deno.test('CUL-69 — the band states the exclusion without needing the legend', () => {
  // B-494: the safety band must stand on its own. When the unrestricted universal was removed, the
  // "not in the numbers above" contrast rode out with it, leaving the sentence ending on
  // "including" where the fact is exclusion (adversarial pass 5 nit).
  const t = plain(
    renderReport(
      base({
        safetyFlags: [
          {
            kind: 'chronicity',
            symptomType: 'vomit',
            episodeCount: 18,
            spanDays: 51,
            activeWeeks: 7,
            symptomDays: 18,
            daysSinceLastEpisode: 2,
            firstOnsetIso: '2026-05-08T14:00:00Z',
            firstLoggedIso: '2026-04-10T09:00:00Z',
            tier: 'standard',
            windowDays: 56,
          },
        ],
      }),
    ),
  )
  const band = t.slice(t.indexOf('Vomiting spans'), t.indexOf('Vomiting spans') + 400)
  assert.ok(/they are not in the numbers above/.test(band), 'the exclusion is stated in the band itself')
  assert.ok(/appendix A lists this window's entries/.test(band), 'and the pointer survives beside it')
})

Deno.test('CUL-69 — the legend explains the second window, and only when one is on the report', () => {
  // The HR-7 "Entries vs episodes" precedent: where two measures diverge on purpose, the report
  // says so. Without it the available inference — that the engine judged the earlier entries
  // unrelated — runs toward reassurance. Gated like the incident-photos entry, for B-599's
  // reason: a legend entry describing a line the report does not carry is a dangling reference.
  const flag = (firstLoggedIso: string): SafetyFlag => ({
    kind: 'chronicity',
    symptomType: 'vomit',
    episodeCount: 7,
    spanDays: 42,
    activeWeeks: 7,
    symptomDays: 7,
    daysSinceLastEpisode: 14,
    firstOnsetIso: '2026-05-08T14:00:00Z',
    firstLoggedIso,
    tier: 'standard',
    windowDays: 56,
  })
  const withGap = plain(renderReport(base({ safetyFlags: [flag('2026-04-10T09:00:00Z')] })))
  assert.ok(/Where the chronicity counts begin/.test(withGap), 'explained when the flag carries a second window')
  assert.ok(/not.{0,3} judged unrelated/.test(withGap), 'and the reassuring inference is closed off explicitly')

  const noGap = plain(renderReport(base({ safetyFlags: [flag('2026-05-08T14:00:00Z')] })))
  assert.ok(!/Where the chronicity counts begin/.test(noGap), 'and absent when there is no second window')
})

Deno.test('B-532/B-502 — with no photographed incident, the block collapses to a line and the caveat survives', () => {
  const html = renderReport(
    base({
      vomitPhenotype: {
        totalIncidents: 5,
        withAnalysis: 0,
        states: { completed: 0, uncertain: 0, failed: 0, pending: 0 },
        assessedCount: 0,
        contentsMix: { food: 0, bile: 0, hairball: 0, foam_liquid: 0, grass: 0, unsure: 0 },
        consistencyDistribution: {},
        colourDistribution: {},
        bloodPresent: [],
        foreignPresent: [],
        reviewedCount: 0,
      },
    }),
  )
  const t = plain(html)
  assert.ok(!/no legible read yet/.test(t), 'no chart furniture standing in for data that does not exist (B-532)')
  assert.ok(/5 without a photo/.test(t), 'the denominator disclosure survives (§5.10)')
  // B-502 — the empty block collapses to ONE line: the section said "no photo" three ways (a
  // photo-read lead, a repeated body, and the blood block), ~100 words for one fact. The lead
  // that described a read that never happened is gone, the repeated body with it, and the
  // "Automated photo analysis" tag no longer sits over a section that analysed nothing.
  assert.ok(!/Colour, contents, and consistency are read automatically/i.test(t), 'the photo-read lead is gone')
  assert.ok(!/No incident in this window has a photo/.test(t), 'and the repeated no-photo body with it')
  assert.ok(!/Automated photo analysis/.test(t), 'and the analysis tag over a section that analysed nothing')
  // B-494 — the not-a-clearance caveat is the load-bearing half: absence of a photo is not
  // absence of blood, so the section's silence never reads as a negative result. It stays.
  assert.ok(/Not a clearance:/.test(t), 'the not-a-clearance caveat survives the collapse')
  assert.ok(/a photo cannot exclude bleeding/.test(t), 'with its substance intact')
})

Deno.test('B-532 — the weight sparkline states the range it is drawn over', () => {
  const html = renderReport(
    base({
      weight: {
        isEmpty: false,
        latest: { kg: 31.8, lbs: 70.1, date: '2026-06-29' },
        trend: {
          readingCount: 3,
          seriesLbs: [71.4, 70.8, 70.1],
          seriesKg: [32.4, 32.1, 31.8],
          latestLbs: 70.1,
          latestKg: 31.8,
          earliestDate: '2026-05-18',
          latestDate: '2026-06-29',
          deltaLbs: -1.3,
          deltaKg: -0.6,
          direction: 'down',
        },
      },
    }),
  )
  assert.ok(
    /chart spans 31.8–32.4 kg/.test(plain(html)),
    'a 0.6 kg fall and a 6 kg fall draw the identical cliff, so the vertical is named',
  )
})

Deno.test('B-532 — the legend describes the page-1 intake line only when that line exists', () => {
  // The un-gating made `intakeLog.length > 0` stop implying "a reduced-intake flag fired",
  // and the legend was still keyed on it — so it would have described a page-1 line the
  // report does not carry. The same dangling-reference defect as B-599, one layer out.
  const unfinished = plain(
    renderReport(
      base({
        provenance: {
          ...base().provenance,
          intakeLogScope: 'unfinished',
          intakeLog: [
            { eventId: 'm1', occurredAt: '2026-06-19T18:00:00Z', foodLabel: 'z/d', intakeRating: 'refused', isLastFullMeal: false, pinned: false },
          ],
        },
      }),
    ),
  )
  assert.ok(!/When intake drops, page 1 shows/.test(unfinished), 'no flag fired ⇒ no claim that the line is there')
  assert.ok(/appears only when a reduced-intake flag fired/.test(unfinished))
  assert.ok(/not that intake was normal/.test(unfinished), 'and the silence is never an all-clear')
  assert.ok(!/When intake drops, page 1 shows/.test(unfinished))

  const flagged = plain(
    renderReport(
      base({
        provenance: {
          ...base().provenance,
          intakeLogScope: 'intake_flag',
          intakeLog: [
            { eventId: 'm1', occurredAt: '2026-06-19T18:00:00Z', foodLabel: 'z/d', intakeRating: 'all', isLastFullMeal: true, pinned: false },
          ],
        },
      }),
    ),
  )
  assert.ok(/When intake drops, page 1 shows/.test(flagged), 'and it IS described when the flag population is listed')
})

Deno.test('B-532 ADV① — page 1 and the symptom panel never disagree about direction', () => {
  // THE COUNTEREXAMPLE THE ADVERSARIAL PASS EXECUTED, pinned. B-532's first cut migrated the
  // symptom panel to `trendHalves` and left `monitoringTiles`' trajectory tile on the old
  // `mid * 7` bucket split, so on a fully-logged 36-day `since_visit` window — the DEFAULT basis
  // for the monitoring wedge this tile exists for — page 1 printed "3 → 3" while the panel two
  // inches below printed "first 18 d 1 → last 18 d 5". A swept comparison put the two partitions
  // in disagreement on 337 of 393 window lengths, with page 1 the more reassuring number on 169.
  // The bias had not been removed; it had been relocated to the more prominent surface.
  const halves = {
    days: 18,
    firstCount: 1,
    lastCount: 5,
    firstStartDate: '2026-05-01',
    firstEndDate: '2026-05-18',
    lastStartDate: '2026-05-19',
    lastEndDate: '2026-06-05',
    // 36 is even, so there is no middle day to exclude.
    middleCount: 0,
    middleDate: null,
  }
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 6, symptomDays: 6, windowDays: 36, loggedDays: 36, weeklyBuckets: [1, 0, 0, 2, 2, 1], trendHalves: halves })],
      atAGlance: {
        ...base().atAGlance,
        primarySymptom: { type: 'vomit', count: 6 },
        totalSymptomIncidents: 6,
        windowDays: 36,
        loggedDays: 36,
        sinceOnsetDays: 36,
        daysSinceLastEpisode: 1,
        loggedDaysSinceLastEpisode: 1,
        firstHalfLoggedDays: 18,
        secondHalfLoggedDays: 18,
      },
    }),
  )
  const t = plain(html)
  // The tile and the panel are the same comparison, so they carry the same two numbers.
  assert.ok(/1 → 5/.test(t), 'the page-1 tile shows the rise')
  assert.ok(/first 18 d 1 → last 18 d 5/.test(t), 'and so does the panel')
  assert.ok(!/3 → 3/.test(t), 'never the old bucket split, which read this record as flat')
  assert.ok(!/first 21 d|last 15 d/.test(t), 'and never its unequal day labels')
})

Deno.test('B-532 ADV② — the tile’s sparse caveat counts over the window it names', () => {
  // Executed: the tile compared a NEW-partition numerator (`firstHalfLoggedDays`) against an
  // OLD-partition floor (`ceil(mid*7/3)`), which BOTH lost a caveat at 90 days and printed a
  // false "6 of 21 d" at 36 — a fabricated logging-coverage figure on page 1 of a clinical
  // artifact. One derivation, so numerator and denominator cannot come from different windows.
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'vomit',
          count: 7,
          symptomDays: 7,
          windowDays: 36,
          loggedDays: 9,
          weeklyBuckets: [1, 0, 0, 2, 2, 2],
          trendHalves: { days: 18, firstCount: 1, lastCount: 6, firstStartDate: '2026-05-01', firstEndDate: '2026-05-18', lastStartDate: '2026-05-19', lastEndDate: '2026-06-05', middleCount: 0, middleDate: null },
        }),
      ],
      atAGlance: {
        ...base().atAGlance,
        primarySymptom: { type: 'vomit', count: 7 },
        totalSymptomIncidents: 7,
        windowDays: 36,
        loggedDays: 9,
        sinceOnsetDays: 36,
        daysSinceLastEpisode: 1,
        loggedDaysSinceLastEpisode: 1,
        firstHalfLoggedDays: 6,
        secondHalfLoggedDays: 3,
      },
    }),
  )
  const t = plain(html)
  assert.ok(/early window sparsely logged \(6 of 18 d\)/.test(t), 'the denominator is the half it counted over')
  assert.ok(!/6 of 21 d/.test(t), 'never a figure counted over one window and labelled with another')
})

Deno.test('B-532 ADV③ — the artefactual-improvement caveat is not lost at the floor boundary', () => {
  // Executed against `main`: a 90-day record with 15 of 45 late logged days and a 3× apparent
  // improvement caveated before the change (old floor `ceil(48/3) = 16`) and stopped caveating
  // after it (`15 < ceil(45/3) = 15` is false). A guard whose entire purpose is the reassuring
  // direction may not get quieter as a side effect of fixing the arithmetic beside it, so the
  // floor is stated as "a third or less of the half was logged".
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'vomit',
          count: 8,
          symptomDays: 8,
          windowDays: 90,
          loggedDays: 57,
          weeklyBuckets: [2, 2, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
          trendHalves: { days: 45, firstCount: 6, lastCount: 2, firstStartDate: '2026-04-04', firstEndDate: '2026-05-18', lastStartDate: '2026-05-19', lastEndDate: '2026-07-02', middleCount: 0, middleDate: null },
        }),
      ],
      atAGlance: { ...base().atAGlance, windowDays: 90, loggedDays: 57, firstHalfLoggedDays: 42, secondHalfLoggedDays: 15 },
    }),
  )
  assert.ok(
    /later window sparsely logged \(15 of 45 d\)/.test(plain(html)),
    'exactly a third logged is sparse — the boundary belongs inside the caveat, not outside it',
  )
})

Deno.test('B-532 COLD⑦ — an unobserved week is never drawn as a zero week', () => {
  // COLD-READ BLOCKING, and the most dangerous of the set: logging stopped a week before the
  // window closed, so the final bucket held zero logged days — and it rendered as the same
  // flat "0" nub a genuinely quiet week gets, at the visual terminus of a descending curve.
  // It reads as "resolved". No delta-caveat fires (7 unlogged of 28 clears that threshold
  // comfortably) and on a completed trial there is no safety flag pulling the other way.
  const html = renderReport(
    base({
      symptoms: [
        aggregate({
          type: 'itch',
          count: 12,
          symptomDays: 12,
          windowDays: 56,
          loggedDays: 49,
          weeklyBuckets: [4, 2, 2, 1, 1, 1, 1, 0],
          bucketStartDates: ['2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29', '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26'],
          loggedDaysByBucket: [7, 7, 7, 7, 7, 7, 7, 0],
        }),
      ],
    }),
  )
  assert.ok(/class="nolog"/.test(html), 'the unobserved week gets its own hollow marker')
  assert.equal((html.match(/class="nolog"/g) ?? []).length, 1, 'exactly the one week nobody logged')
  assert.ok(!/class="nub"/.test(html), 'and no measured-zero nub, because no week here was a measured zero')
  assert.ok(
    // HR-7 (CUL-676): "entries" — this marker annotates the §3.5 weekly buckets, which
    // count minute-deduped entries, not chained episodes.
    /nothing logged that week \(not a week without entries\)/.test(plain(html)),
    'the marker is defined on the same sheet it appears on',
  )
  assert.ok(/not logged/.test(html), 'and the alt text draws the same distinction the bars do')
})

Deno.test('B-532 COLD⑦ — a genuinely quiet, well-logged week keeps its measured zero', () => {
  const html = renderReport(
    base({
      symptoms: [
        aggregate({ type: 'itch', count: 3, windowDays: 21, loggedDays: 21, weeklyBuckets: [2, 0, 1], bucketStartDates: ['2026-06-12', '2026-06-19', '2026-06-26'], loggedDaysByBucket: [7, 7, 7] }),
      ],
    }),
  )
  assert.ok(/class="nub"/.test(html), 'a week the owner logged with no episodes is still a zero')
  assert.ok(!/class="nolog"/.test(html), 'and never the no-data marker')
  assert.ok(!/nothing logged that week/.test(plain(html)), 'nor its legend')
})

Deno.test('B-532 COLD⑦ — the active problem list reaches page 1', () => {
  // COLD-READ BLOCKING. "Atopic dermatitis (active)" sat in an Appendix B table row while
  // page 1 presented a completed trial with a falling itch curve — the competing explanation
  // for the whole trend, three pages from the numbers it reframes.
  const html = renderReport(
    base({
      provenance: {
        ...base().provenance,
        conditions: [
          { name: 'Atopic dermatitis', status: 'active', diagnosedAt: '2025-11-14' },
          { name: 'Old cruciate repair', status: 'resolved', diagnosedAt: '2024-02-01' },
        ],
      },
    }),
  )
  const p1 = plain(pageOne(html))
  assert.ok(/Recorded conditions:/.test(p1), 'named on page 1')
  assert.ok(/Atopic dermatitis/.test(p1), 'the active one')
  assert.ok(/since Nov 14, 2025/.test(p1), 'with the date that shows it predates this window')
  assert.ok(!/Old cruciate repair/.test(p1), 'resolved history does not crowd the signalment')
  assert.ok(
    /owner-recorded history, not a finding in this window/.test(p1),
    'and it is never rendered as something this report computed',
  )
})

Deno.test('B-532 COLD⑦ — the off-diet tile never reads as a fact about the document', () => {
  // "Not stated · see the diet-trial block below" scans as "nothing to report" in a row where
  // every other tile is a number — on the report where a clean-looking page is the hazard.
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'itch' },
      // `diet.trial` is what selects the trial tile row; `snapshot.trial` carries the facts.
      diet: { ...base().diet, trial: { ...DUCK_TRIAL, proteinSet: pset(['duck'], { complete: true }) } },
      trial: trialBlockFixture({
        allowedSetUnavailable: false,
        mayClaimAllMatched: false,
        mayStateRecordClean: false,
        intakeNotDirectlyObserved: true,
        exposures: { totalFeedings: 98, offDiet: 0, byRung: { derived_protein: 0, unrecognised: 0 }, fedBeforePermitted: 0, unclassifiable: 0, items: [] },
      }),
    }),
  )
  const t = plain(html)
  assert.ok(!/Not stated/.test(t), 'never a statement about the document')
  assert.ok(/Not countable/.test(t), 'a statement about the world')
  assert.ok(/intake not directly observed/i.test(t), 'and it names why')
})

Deno.test('B-532 COLD⑦ — "None recorded" in the diet history says whose log it is', () => {
  const t = plain(renderReport(base()))
  assert.ok(
    /nothing of this kind was logged in this window, which is not evidence none was fed/.test(t),
    'the absence caveat rides the diet-history rows an elimination trial rests on',
  )
})

// ═══════════════════════════════════════════════════════════════════════════════════
// CUL-993 — R-11, the vet-report design quick-win pass (carries CUL-982's four items,
// CUL-857, CUL-855's corrected premise, CUL-634's three render rows, and CUL-994 Part 2).
// ═══════════════════════════════════════════════════════════════════════════════════

/** Every conditional section ON, so a guard over "the document" sees every sheet it can grow. */
function everythingOnSnap(): ReportSnapshot {
  return monitoringSnap({
    medications: [med({ drugName: 'Metronidazole' })],
    unlinkedMedications: [unlinkedMed()],
    medicationHistory: mhTable(
      [mhEntry({ drugName: 'Metronidazole', startedDay: '2026-05-08', isActive: true, dosesLogged: 82, plannedDoses: 90, dosesPerDay: 2 })],
      '2026-05-08',
    ),
    stool: { total: 4, normalCount: 3, looseCount: 1, windowDays: 91, loggedDays: 30, ai: null },
    vomitPhenotype: emptyPhenotype(),
    incidentPhotos: [photo({ eventId: 'ev-p1', occurredAt: '2026-06-01T10:00:00Z', dataUri: PNG_1PX })],
    concurrentChanges: [
      { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 4, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-08', bucketIndex: 5, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
    ],
    provenance: {
      ...base().provenance,
      symptomLog: [
        logEntry({ eventId: 'ev-1', type: 'vomit', occurredAt: '2026-05-01T14:00:00Z' }),
        logEntry({ eventId: 'ev-2', type: 'vomit', occurredAt: '2026-05-02T14:00:00Z', occurredAtConfidence: 'window', occurredAtLatest: '2026-05-02T14:00:00Z' }),
        { ...logEntry({ eventId: 'ev-3', type: 'vomit', occurredAt: '2026-05-03T14:00:00Z' }), occurredAtConfidence: null },
      ],
      totalSymptomIncidents: 3,
    },
  })
}

// ── CUL-982 item 2: no internal identifier reaches the rendered document ──
const INTERNAL_ID = /\b(?:HR|CUL|B)-\d+\b|§/

Deno.test('CUL-982 item 2 — no internal identifier (HR-, CUL-, B-NNN, §) anywhere in the rendered HTML', () => {
  const fixtures: Array<[string, ReportSnapshot]> = [
    ['base', base()],
    ['monitoring', monitoringSnap()],
    ['everything on', everythingOnSnap()],
  ]
  for (const [name, snap] of fixtures) {
    const html = renderReport(snap)
    const m = INTERNAL_ID.exec(html)
    assert.equal(
      m,
      null,
      `${name}: "${m?.[0]}" reached the document near …${html.slice(Math.max(0, (m?.index ?? 0) - 80), (m?.index ?? 0) + 40)}…`,
    )
  }
})

Deno.test('CUL-982 item 2 — the shipped stylesheet carries no comments, and its rules survive the strip', () => {
  const html = renderReport(base())
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]
  assert.ok(!/\/\*/.test(css), 'no CSS comment ships (they carried §5.8, B-532, CUL-875 …)')
  assert.ok(/\.tail\{page-break-inside:avoid/.test(css), 'the tail rule survives')
  assert.ok(/@page\{size:letter portrait;margin:11mm;\}/.test(css), 'the page rule survives')
  assert.ok(/print-color-adjust:exact/.test(css), 'print-color-adjust survives')
  assert.ok(/\.page \+ \.page\{page-break-before:always;\}/.test(css), 'the section break survives')
})

// ── A.1: the orphaned footer ──
Deno.test('CUL-993 A.1 — every running footer sits inside a section tail with a real anchor, and the tail is unbreakable in print', () => {
  const html = renderReport(everythingOnSnap())
  const foots = [...html.matchAll(/<div class="foot">/g)].map((m) => m.index!)
  // page 1 · A · B–D · incident photos · the legend (no meals, no Noticed on this fixture).
  assert.equal(foots.length, 5, 'one footer per section')
  for (const i of foots) {
    const before = html.slice(0, i)
    const tailAt = before.lastIndexOf('<div class="tail">')
    const sectionAt = before.lastIndexOf('<section class="page">')
    assert.ok(tailAt > sectionAt, 'a tail opened in this section before its footer')
    assert.ok(!before.slice(tailAt).includes('<div class="foot">'), 'one tail per footer')
    assert.ok(/\S/.test(before.slice(tailAt + '<div class="tail">'.length)), 'the tail holds an anchor before the footer, never an empty wrapper')
  }
  assert.ok(/\.tail\{page-break-inside:avoid;break-inside:avoid;\}/.test(html), 'the tail is atomic in print')
  assert.ok(/\.foot\{page-break-before:avoid;break-before:avoid;\}/.test(html), 'the footer avoids a break before it (belt)')
})

// The Noticed appendix's footer is asserted on the rendered tree in noticed.test.ts (CUL-993 A.1).

Deno.test('CUL-993 A.1 — the photo grid keeps only its last row with the footer; the rest still breaks between cards', () => {
  const photos = [1, 2, 3].map((n) => photo({ eventId: `ev-p${n}`, occurredAt: `2026-06-0${n}T10:00:00Z`, dataUri: PNG_1PX }))
  const html = renderReport(base({ incidentPhotos: photos }))
  assert.deepEqual(
    html.match(/<div class="phgrid( phgrid-tail)?">/g),
    ['<div class="phgrid">', '<div class="phgrid phgrid-tail">'],
    'two grids: the head and the last row',
  )
  const tail = html.slice(html.indexOf('<div class="tail"><div class="phgrid phgrid-tail">'))
  assert.equal((tail.match(/class="phcard"/g) ?? []).length, 1, 'an odd count leaves ONE card in the tail row')
  const two = renderReport(base({ incidentPhotos: photos.slice(0, 2) }))
  assert.ok(!/<div class="phgrid">/.test(two) && /<div class="tail"><div class="phgrid phgrid-tail">/.test(two), 'two cards are one row, all of it in the tail')
  assert.ok(/\.phgrid \+ \.tail > \.phgrid-tail\{margin-top:13px;\}/.test(html), 'the split keeps the grid\'s own row gap')
})

// ── A.3: the count label paints over the marker ──
Deno.test('CUL-993 A.3 — count labels carry a white halo so a marker line never runs through the number', () => {
  const html = renderReport(base())
  // The halo is the paper colour, written as the token (CUL-999 item 4 — no hex outside
  // :root), and text.z's FILL came up off --faint to --muted with the no-data mark it
  // labels (CUL-999 items 1 + 2). The halo itself is unchanged in effect: white on white
  // paper, so it still survives a B&W print.
  assert.ok(/svg text\.cap\{font-size:11px;fill:var\(--muted\);paint-order:stroke;stroke:var\(--surface\);stroke-width:3px;stroke-linejoin:round;\}/.test(html))
  assert.ok(/svg text\.z\{font-size:11px;fill:var\(--muted\);paint-order:stroke;stroke:var\(--surface\);stroke-width:3px;stroke-linejoin:round;\}/.test(html))
})

// ── The stylesheet the guards measure is the stylesheet that ships ──
Deno.test('CUL-999 / CUL-1000 — style.test.ts guards the bytes the document actually carries', () => {
  // `style.test.ts` measures contrast, the type scale, the hex rule and the container rules
  // against the exported SHIPPED_STYLE. That is only worth anything while SHIPPED_STYLE is
  // what `renderReport` interpolates: detached, every guard over there would keep passing
  // over a constant no document contains. This is the one assertion joining them, and it
  // lives here because this is where the snapshot builders are.
  const html = renderReport(base())
  assert.ok(html.includes(`<style>${SHIPPED_STYLE}</style>`), 'the guarded stylesheet is the rendered one, verbatim')
  assert.ok(SHIPPED_STYLE.length > 5000, 'and it is the whole sheet, not an empty string that trivially "includes"')
})

// ── A.4: "1 entry" ──
Deno.test('CUL-993 A.4 — a single entry reads "1 entry", never "1 entries"', () => {
  const one = renderReport(base({ symptoms: [aggregate({ type: 'vomit', count: 1 })] }))
  assert.ok(/1<small>&nbsp;entry&nbsp;\/&nbsp;91&nbsp;d<\/small>/.test(one), '"1 entry"')
  assert.ok(!/1 entries|1&nbsp;entries/.test(one))
  const two = renderReport(base({ symptoms: [aggregate({ type: 'vomit', count: 2 })] }))
  assert.ok(/2<small>&nbsp;entries&nbsp;\//.test(two), '"2 entries"')
})

// ── A.6: a proportion bar of one category is a number ──
Deno.test('CUL-993 A.6 — a one-category stool distribution is a count line, not a full-width bar', () => {
  const one = renderReport(base({ stool: { total: 1, normalCount: 0, looseCount: 1, windowDays: 91, loggedDays: 30, ai: null } }))
  const sec = one.slice(one.indexOf('<h2>Stool characteristics'), one.indexOf('<h2>Diet, feeding'))
  assert.ok(!/class="barmix"/.test(sec), 'no proportion bar for one category')
  assert.ok(!/class="sw"/.test(sec), 'no swatch without a bar to key')
  assert.ok(/Normal \/ formed &times;0&nbsp;&middot;&nbsp; Loose \/ watery &times;1/.test(sec), 'BOTH counts stand — one loose of one, never one loose of an unstated many')
  const two = renderReport(base({ stool: { total: 4, normalCount: 3, looseCount: 1, windowDays: 91, loggedDays: 30, ai: null } }))
  const sec2 = two.slice(two.indexOf('<h2>Stool characteristics'), two.indexOf('<h2>Diet, feeding'))
  assert.equal((sec2.match(/class="seg"/g) ?? []).length, 2, 'two categories draw the bar')
  assert.equal((sec2.match(/class="sw"/g) ?? []).length, 2, 'and key it')
})

Deno.test('CUL-993 A.6 — the vomit contents bar follows the same rule', () => {
  const one = renderReport(
    base({ vomitPhenotype: emptyPhenotype({ contentsMix: { food: 0, bile: 6, hairball: 0, foam_liquid: 0, grass: 0, unsure: 0 } }) }),
  )
  const sec = one.slice(one.indexOf('<h2>Vomit characteristics'), one.indexOf('<h2>Diet, feeding'))
  assert.ok(!/class="barmix"/.test(sec), 'no bar for one category')
  assert.ok(!/class="sw"/.test(sec), 'no swatch without a bar')
  assert.ok(/&times;6/.test(sec), 'the count stands')
  const two = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  const sec2 = two.slice(two.indexOf('<h2>Vomit characteristics'), two.indexOf('<h2>Diet, feeding'))
  assert.ok(/class="barmix"/.test(sec2), 'two categories draw the bar')
})

// ── CUL-982 item 4: the marker legend ──
Deno.test('CUL-982 item 4 — the marker legend precedes the first chart and names each start with its own date', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 3, weeklyBuckets: [3, 0, 0], bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15'], windowDays: 21 })],
      concurrentChanges: [
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-04', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  const legendAt = html.indexOf('class="chartlegend"')
  const chartAt = html.indexOf('<svg viewBox="0 0 648 158"')
  assert.ok(legendAt > 0 && chartAt > 0 && legendAt < chartAt, 'the legend sits above the first chart that uses it')
  assert.ok(
    /one stopped: the trial diet RC HP on May 2; the medication Metronidazole on May 4\. Timing and overlap are in &ldquo;Reading the trend&rdquo; below\./.test(html),
    'each start is named with its own date, in date order, kind first (no double parenthetical)',
  )
  // R-14 extends this line rather than re-placing it: the start half of the sentence is still
  // the start half, and the marks a reader meets on the chart below are still what it explains.
  assert.ok(
    /A dashed vertical marks the <b>week<\/b> a treatment or diet change started; .*a flat-headed vertical marks the <b>week<\/b> one stopped:/.test(html),
    'the legend names BOTH glyphs (R-14), the dashed start and the flat-headed stop',
  )
  // 11px is R-17/R-18's type pass from main, not R-14's; the assertion R-14 cares about is the
  // colour token beside it.
  assert.ok(/\.chartlegend\{font-size:11px;color:var\(--muted\);margin:0 0 9px/.test(html), 'the legend is --muted, not the lightest grey on the page')
})

Deno.test('CUL-982 item 4 — a week with more than three starts says the count and the week, never one date', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 3, weeklyBuckets: [3, 0], bucketStartDates: ['2026-05-01', '2026-05-08'], windowDays: 14 })],
      concurrentChanges: ['a', 'b', 'c', 'd'].map((label, i) => ({
        kind: 'supplement' as const, label, startDate: `2026-05-0${i + 1}`, bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true,
      })),
    }),
  )
  assert.ok(/4 starts this week/.test(html), 'count + week')
  assert.ok(!/starts &middot; May/.test(html), 'no date list past three starts')
  assert.ok(/the supplement a on May 1; the supplement b on May 2; the supplement c on May 3; the supplement d on May 4/.test(html), 'the legend still carries every date')
})

// ── CUL-857: the weigh-in nudge ──
Deno.test('CUL-857 — the empty weight strip states the fact and never addresses the owner', () => {
  const html = renderReport(base())
  assert.ok(/No home weigh-ins recorded\./.test(html))
  assert.ok(/No weight trend can be shown; body condition not assessed\./.test(html))
  assert.ok(!/weigh-ins in Culprit/.test(html) && !/the owner can log/.test(html), 'no owner nudge on the vet page')
})

// ── CUL-634: the three render rows ──
Deno.test('CUL-634 — Appendix A counts every row without a witnessed time, including unspecified and one-sided rows, and glosses the tags', () => {
  const rows = [
    logEntry({ eventId: 'a', type: 'vomit', occurredAt: '2026-05-01T14:00:00Z' }),
    logEntry({ eventId: 'b', type: 'vomit', occurredAt: '2026-05-02T14:00:00Z', occurredAtConfidence: 'estimated' }),
    logEntry({ eventId: 'c', type: 'vomit', occurredAt: '2026-05-03T14:00:00Z', occurredAtConfidence: 'window', occurredAtEarliest: '2026-05-03T10:00:00Z', occurredAtLatest: '2026-05-03T14:00:00Z' }),
    logEntry({ eventId: 'd', type: 'vomit', occurredAt: '2026-05-04T14:00:00Z', occurredAtConfidence: 'window', occurredAtLatest: '2026-05-04T14:00:00Z' }),
    // `logEntry`'s `?? 'witnessed'` default swallows an explicit null, so the legacy row is
    // built past the helper — a fixture the production shape can actually produce (C-35).
    { ...logEntry({ eventId: 'e', type: 'vomit', occurredAt: '2026-05-05T14:00:00Z' }), occurredAtConfidence: null },
  ]
  // The snapshot's own count says 3 (estimated + window); the preamble no longer reads it.
  const html = renderReport(base({ provenance: { ...base().provenance, symptomLog: rows, totalSymptomIncidents: 5, estimatedOrWindowCount: 3 } }))
  // RED PRE-FIX: "3 of them have an estimated or windowed time" left out the unspecified row.
  assert.ok(
    /<span class="num">4<\/span> of the <span class="num">5<\/span> events below carry no witnessed time \(an estimate, a window, or none recorded\); treat those as approximate\./.test(html),
    'four of five rows carry no witnessed time — with the denominator adjacent, never a bare numerator',
  )
  assert.ok(!/estimated or windowed time/.test(html), 'the old undercounting sentence is gone')
  assert.ok(
    /Time tags: <span class="conf">seen<\/span> witnessed &middot; <span class="conf">est<\/span> estimated &middot; <span class="conf">range<\/span> found later, the window it occurred in &middot; a bare &ldquo;before&rdquo; or &ldquo;after&rdquo; time is one known bound and carries no tag &middot; <span class="conf">unspecified<\/span> no confidence recorded\./.test(html),
    'the tags are glossed where they are first used — all five classes, because all five render',
  )
  assert.ok(/<td><span class="num">before 10:00<\/span><\/td>/.test(html), 'a one-sided bound prints its words and no chip')
  assert.ok(/<span class="num">~10:00–10:00<\/span> <span class="conf">range<\/span>/.test(html) || /<span class="conf">range<\/span>/.test(html.slice(html.indexOf('<tbody>'))), 'a two-sided window keeps its chip')
  const single = renderReport(base({ provenance: { ...base().provenance, symptomLog: [rows[0], rows[4]], totalSymptomIncidents: 2 } }))
  assert.ok(/<span class="num">1<\/span> of the <span class="num">2<\/span> events below carries no witnessed time[^.]*; treat it as approximate\./.test(single), 'singular agreement')
  assert.ok(/<td><span class="num">~10:00<\/span> <span class="conf">unspecified<\/span><\/td>/.test(single), 'the unspecified row is tagged in the table and drawn approximate, not only defined in the legend')
  const clean = renderReport(base({ provenance: { ...base().provenance, symptomLog: [rows[0]], totalSymptomIncidents: 1 } }))
  assert.ok(!/events below carr/.test(clean), 'an all-witnessed log carries no count')
  // The gloss is gated on the classes the rows USE. R-11 took that from five definitions to
  // one over an all-witnessed column; R-13 item 9 takes it to none, because a column with a
  // single value is decoration and the chips go too — so the gloss that defined them would be
  // a legend for a mark the sheet no longer prints. The FACT is kept as a sentence, which is
  // what makes the bare times safe to read as exact. See `allTimesWitnessed` for why this is
  // scoped to `seen` and to no other uniform class.
  assert.ok(!/Time tags:/.test(clean), 'an all-witnessed column glosses no tag, because it prints none')
  assert.ok(/Every time below was witnessed by the owner\./.test(clean), 'it states the fact once instead')
  // Scoped to appendix A's own table: the closing "How to read" legend still DEFINES the tag
  // vocabulary for the report as a whole, which is correct — it is the document's glossary,
  // not a claim about this column.
  const cleanBody = clean.slice(clean.indexOf('<tbody>', clean.indexOf('Appendix A — Symptom event log')))
  assert.ok(
    !/class="conf">seen</.test(cleanBody.slice(0, cleanBody.indexOf('</tbody>'))),
    'and no row carries the chip',
  )
  assert.ok(!/unspecified<\/span> no confidence recorded/.test(clean.slice(0, clean.indexOf('How to read this report'))), 'no definition of a tag the column never shows')
  const empty = renderReport(base())
  assert.ok(!/Time tags:/.test(empty), 'no gloss over an empty log')
  // The legend says the one-sided form carries no tag.
  assert.ok(/prints as &ldquo;before&rdquo; or &ldquo;after&rdquo; its one known bound, with no tag beside it/.test(html))
})

// ── CUL-982 item 1: the status verb ──
Deno.test('CUL-982 item 1 — a stopped course reads "stopped by owner"; neither status ever reads "complete"', () => {
  const html = renderReport(base({ medications: [med({ status: 'stopped', endedAt: '2026-05-26', startedAt: '2026-05-12', courseEnded: true, lifetimeFirstDoseDay: '2026-05-12', lifetimeLastDoseDay: '2026-05-26', lifetimeDoseDayCount: 15 })] }))
  assert.ok(/May 12 – May 26, 2026 \(stopped by owner\)/.test(html))
  assert.ok(!/complete/.test(html.slice(html.indexOf('Metronidazole'), html.indexOf('Metronidazole') + 600)), 'no "complete" beside the course')
})

// ── CUL-994 Part 2: the dosing span ──
/** CUL-976's record: a 28-dose otic course at 2×/day, dosed Jul 17–30 on 14 days, end recorded Aug 9. */
function endedCourse(over: Partial<MedicationAdherence> = {}): MedicationAdherence {
  return med({
    drugName: 'Motozol', route: 'otic', strength: null, doseAmount: '1 drop', indication: 'ear infection', scheduleNotes: null,
    startedAt: '2026-07-16', endedAt: '2026-08-09', status: 'completed', courseEnded: true,
    dosesPerDay: 2, prescribedDoses: 28, lifetimeDosesLogged: 28,
    lifetimeFirstDoseDay: '2026-07-17', lifetimeLastDoseDay: '2026-07-30', lifetimeDoseDayCount: 14,
    elapsedDaysInWindow: 25, daysWithDose: 14, windowDosesLogged: 28, windowDosesTotal: 28,
    givenDoses: 28, partialDoses: 0, missedDoses: 0, refusedDoses: 0, unconfirmedDoses: 0,
    ...over,
  })
}
/** The span sentence as plain text, or null when the line carries none. */
function spanSentence(html: string): string | null {
  const m = /(?:The <span class="num">\d+<\/span> administered doses(?: all)? fell on|That dose was administered on)[\s\S]*?\)\./.exec(html)
  return m ? m[0].replace(/<[^>]+>/g, '').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’') : null
}

Deno.test('CUL-994 Part 2 — CUL-976\'s reference record states the positive fact instead of going silent: contiguous dosing reads "on all 14 days", never a self-referential "14 of the 14" (adversarial round 4)', () => {
  const html = renderReport(base({ medications: [endedCourse()] }))
  assert.equal(
    spanSentence(html),
    'The 28 administered doses fell on all 14 days, Jul 17 – Jul 30, 2026 (28 prescribed doses at 2×/day take 14 days).',
  )
  assert.ok(/Jul 16 – Aug 9, 2026 \(end recorded by owner\)/.test(html), 'the status verb says the END was RECORDED, year-stamped')
  assert.ok(/Adherence: <span class="num">28<\/span> of <span class="num">28<\/span> prescribed doses administered across the whole course\./.test(html))
  // Placed beside the status verb, after the one adherence claim, before the window clause.
  const line = html.slice(html.indexOf('Motozol'), html.indexOf('In this window'))
  assert.ok(/\(end recorded by owner\)\. Adherence: .*? The <span class="num">28<\/span> administered doses fell on/.test(line), 'the span follows the adherence claim on the same line, naming its population')
})

Deno.test('CUL-994 Part 2 — a DAYS-denominated plan dosed in half its days: 14 dosing days beside the 28 days 28 doses at 1×/day take (RED under the count-only suppression)', () => {
  const html = renderReport(base({ medications: [endedCourse({ dosesPerDay: 1, endedAt: '2026-08-14' })] }))
  const sentence = spanSentence(html)
  assert.equal(sentence, 'The 28 administered doses fell on all 14 days, Jul 17 – Jul 30, 2026 (28 prescribed doses at 1×/day take 28 days).')
  assert.ok(!/logged/.test(sentence!), '"logged" never appears in the span sentence — it says "administered"')
})

Deno.test('CUL-994 Part 2 — over-delivered at a faster pace: the need is computed from the doses that EXIST (row 3\'s delivered divisor)', () => {
  // 40 logged vs 28 planned at 2×/day, on 15 days Jul 17–31. ceil(28 / 2) would have said 14 and let
  // the crammed course read as at pace; 40 doses at 2×/day take 20 days, which is the arithmetic.
  const html = renderReport(base({ medications: [endedCourse({ lifetimeDosesLogged: 40, lifetimeLastDoseDay: '2026-07-31', lifetimeDoseDayCount: 15, givenDoses: 40, windowDosesLogged: 40, windowDosesTotal: 40, daysWithDose: 15 })] }))
  assert.equal(spanSentence(html), 'The 40 administered doses fell on all 15 days, Jul 17 – Jul 31, 2026 (40 doses at 2×/day take 20 days; 28 were prescribed).')
  assert.ok(/more than the <span class="num">28<\/span> prescribed/.test(html), 'the over-delivery itself is still stated by the adherence claim')
})

Deno.test('CUL-994 Part 2 — adversarial round 3, break 3: a ONE-dose shortfall over the full prescribed length is no cliff', () => {
  // 27 of 28 at 2×/day on all 14 days, End tapped Aug 9: the old predicate re-armed on any shortfall and
  // read as a ten-day abandonment. The need is the PLAN's (28 doses take 14 days) and the record shows 14.
  const html = renderReport(base({ medications: [endedCourse({ lifetimeDosesLogged: 27, givenDoses: 27, windowDosesLogged: 27, windowDosesTotal: 27 })] }))
  assert.equal(spanSentence(html), 'The 27 administered doses fell on all 14 days, Jul 17 – Jul 30, 2026 (28 prescribed doses at 2×/day take 14 days).')
})

Deno.test('CUL-994 Part 2 — adversarial round 3, break 1: one linked dose logged AFTER the End tap cannot hide a fifteen-day hole', () => {
  // 28 doses front-loaded Jul 17–25 (9 days) + one linked dose Aug 12 → last endpoint past the end. The
  // old early return ("dosing reached the end") deleted the sentence; the day count carries the hole.
  const html = renderReport(base({ medications: [endedCourse({ lifetimeDosesLogged: 29, lifetimeLastDoseDay: '2026-08-12', lifetimeDoseDayCount: 10, givenDoses: 29, windowDosesLogged: 29, windowDosesTotal: 29, daysWithDose: 10 })] }))
  assert.equal(spanSentence(html), 'The 29 administered doses fell on 10 of the 27 days from Jul 17 to Aug 12, 2026 (29 doses at 2×/day take 15 days; 28 were prescribed).')
})

Deno.test('CUL-994 Part 2 — adversarial round 3, break 2 + cold read round 2: an interior hole is visible as a ratio over the span, never hidden inside a first–last range', () => {
  // 1×/day, 28 planned; 10 doses Jul 1–5, nothing Jul 6–24, 10 doses Jul 25–29; End Aug 9. Ten dosing
  // days over a 29-day span used to print as "Doses administered Jul 1 – Jul 29".
  const html = renderReport(base({ medications: [endedCourse({ dosesPerDay: 1, lifetimeDosesLogged: 20, lifetimeFirstDoseDay: '2026-07-01', lifetimeLastDoseDay: '2026-07-29', lifetimeDoseDayCount: 10, givenDoses: 20, windowDosesLogged: 20, windowDosesTotal: 20, daysWithDose: 10 })] }))
  assert.equal(spanSentence(html), 'The 20 administered doses fell on 10 of the 29 days from Jul 1 to Jul 29, 2026 (28 prescribed doses at 1×/day take 28 days).')
})

Deno.test('CUL-994 Part 2 — the need is exact on a fractional pace: every-other-day dosing is not a false gap', () => {
  // 0.5×/day × 20 days = 10 planned, given Jul 1, 3, …, 19 (10 days over a 19-day span). ceil(10 / 0.5)
  // = 20 would have demanded a day the pace never uses; floor((10 − 1) / 0.5) + 1 = 19.
  const html = renderReport(base({ medications: [endedCourse({ dosesPerDay: 0.5, prescribedDoses: 10, lifetimeDosesLogged: 10, lifetimeFirstDoseDay: '2026-07-01', lifetimeLastDoseDay: '2026-07-19', lifetimeDoseDayCount: 10, endedAt: '2026-07-20', givenDoses: 10, windowDosesLogged: 10, windowDosesTotal: 10, daysWithDose: 10 })] }))
  assert.equal(spanSentence(html), 'The 10 administered doses fell on 10 of the 19 days from Jul 1 to Jul 19, 2026 (10 prescribed doses at 0.5×/day take 19 days).')
})

Deno.test('CUL-994 Part 2 — both endpoints come from the ADMINISTERED population: one dose then twenty refusals prints one day, never a span to the last refusal', () => {
  const html = renderReport(
    base({
      medications: [endedCourse({
        lifetimeDosesLogged: 1, lifetimeFirstDoseDay: '2026-07-17', lifetimeLastDoseDay: '2026-07-17', lifetimeDoseDayCount: 1,
        givenDoses: 1, refusedDoses: 20, windowDosesLogged: 1, windowDosesTotal: 21, daysWithDose: 1,
      })],
    }),
  )
  assert.equal(spanSentence(html), 'That dose was administered on Jul 17, 2026 (28 prescribed doses at 2×/day take 14 days).')
  assert.ok(!/no dose logged after/.test(html), 'the removed version\'s false clause never returns (refusals WERE logged after)')
  assert.ok(/20 refused/.test(html), 'the refusals are still stated in the window clause')
  // Several doses on ONE day.
  const oneDay = renderReport(base({ medications: [endedCourse({ lifetimeDosesLogged: 3, lifetimeLastDoseDay: '2026-07-17', lifetimeDoseDayCount: 1, givenDoses: 3, windowDosesLogged: 3, windowDosesTotal: 3, daysWithDose: 1 })] }))
  assert.equal(spanSentence(oneDay), 'The 3 administered doses all fell on Jul 17, 2026 (28 prescribed doses at 2×/day take 14 days).')
})

Deno.test('CUL-994 Part 2 — no plan, no sentence: the record cannot tell an early stop from a late End tap', () => {
  const html = renderReport(base({ medications: [endedCourse({ prescribedDoses: null, lifetimeDosesLogged: 10, dosesPerDay: 2 })] }))
  assert.equal(spanSentence(html), null)
  assert.ok(/no planned total recorded for this course/.test(html), 'the claim still says why no ratio is stated')
})

Deno.test('CUL-994 Part 2 — no owner-recorded end, no sentence (H1: silence never becomes an ending)', () => {
  assert.equal(spanSentence(renderReport(base({ medications: [endedCourse({ courseEnded: false, status: 'active', endedAt: null, lifetimeDosesLogged: 10 })] }))), null)
  // An ended flag with no date is not an end either.
  assert.equal(spanSentence(renderReport(base({ medications: [endedCourse({ endedAt: null, lifetimeDosesLogged: 10 })] }))), null)
  // A paused regimen can carry `ended_at`; H1 says an ending reads SOLELY from the status.
  assert.equal(
    spanSentence(renderReport(base({ medications: [endedCourse({ courseEnded: false, status: 'paused', endedAt: '2026-08-09', lifetimeDosesLogged: 10 })] }))),
    null,
    'a recorded date without an owner End is not an end (H1)',
  )
})

Deno.test('CUL-994 Part 2 — PRN never carries the sentence: with no pace there is no need to print beside the dates, and an as-needed course is not measured against a schedule', () => {
  assert.equal(spanSentence(renderReport(base({ medications: [endedCourse({ dosesPerDay: null, prescribedDoses: 10, lifetimeDosesLogged: 10, lifetimeLastDoseDay: '2026-07-20', lifetimeDoseDayCount: 4 })] }))), null, 'plan met')
  assert.equal(spanSentence(renderReport(base({ medications: [endedCourse({ dosesPerDay: null, prescribedDoses: 10, lifetimeDosesLogged: 6, lifetimeLastDoseDay: '2026-07-20', lifetimeDoseDayCount: 4 })] }))), null, 'plan short')
  // A zero or negative pace is no pace.
  assert.equal(spanSentence(renderReport(base({ medications: [endedCourse({ dosesPerDay: 0 })] }))), null, 'dosesPerDay 0')
})

Deno.test('CUL-994 Part 2 — nothing administered, no sentence: "0 of N" already says it', () => {
  const html = renderReport(base({ medications: [endedCourse({ lifetimeDosesLogged: 0, lifetimeFirstDoseDay: null, lifetimeLastDoseDay: null, lifetimeDoseDayCount: 0, givenDoses: 0, windowDosesLogged: 0, windowDosesTotal: 28, refusedDoses: 28 })] }))
  assert.equal(spanSentence(html), null)
  assert.ok(/<span class="num">0<\/span> of <span class="num">28<\/span> prescribed doses administered/.test(html))
})

Deno.test('CUL-994 Part 2 — dosing that reaches or passes the recorded end still states its density (the old "not a gap" early return is gone)', () => {
  const onEnd = renderReport(base({ medications: [endedCourse({ dosesPerDay: 1, lifetimeDosesLogged: 5, lifetimeLastDoseDay: '2026-08-09', lifetimeDoseDayCount: 5, givenDoses: 5, windowDosesLogged: 5, windowDosesTotal: 5, daysWithDose: 5 })] }))
  assert.equal(spanSentence(onEnd), 'The 5 administered doses fell on 5 of the 24 days from Jul 17 to Aug 9, 2026 (28 prescribed doses at 1×/day take 28 days).')
})

// ── The other R-11 cold-read items in this pass's regions ──
Deno.test('CUL-993 A.3 — the marker line is drawn in two segments that leave the count label\'s band open', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 4, weeklyBuckets: [3, 1, 0, 0], loggedDaysByBucket: [7, 7, 7, 0], bucketStartDates: ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'], windowDays: 28 })],
      concurrentChanges: [
        { kind: 'medication', label: 'A', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'supplement', label: 'B', startDate: '2026-05-16', bucketIndex: 2, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'diet_trial', label: 'C', startDate: '2026-05-23', bucketIndex: 3, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  // The chart's own closing tag, not the letterhead brand mark's (the first </svg> in the document).
  const chartAt = html.indexOf('<svg viewBox="0 0 648 158"')
  const svg = html.slice(chartAt, html.indexOf('</svg>', chartAt))
  const marks = [...svg.matchAll(/<line class="mark" x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"\/>/g)].map((m) => ({ x: m[1], y1: Number(m[2]), y2: Number(m[3]) }))
  const caps = [...svg.matchAll(/<text class="(?:cap|z) num" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => ({ x: m[1], y: Number(m[2]) }))
  assert.equal(marks.length, 6, 'three marked weeks, two segments each')
  for (const cap of caps) {
    for (const mk of marks.filter((k) => k.x === cap.x)) {
      // The band is (baseline − 11, baseline + 3), open at both ends: a segment may END at its top
      // edge or START at its bottom edge without entering it.
      const crosses = mk.y2 > cap.y - 11 && mk.y1 < cap.y + 3
      assert.ok(!crosses, `a marker segment (${mk.y1}–${mk.y2}) runs through the label band at y=${cap.y}`)
    }
  }
  // The bar with the label (count 3 at bucket 0) has its band open; the unobserved week's dash too.
  assert.ok(marks.some((k) => k.y1 === 18), 'the upper segment still starts at the plot top')
  assert.ok(marks.some((k) => k.y2 === 116), 'the lower segment still reaches the baseline')
})

Deno.test('R-11 cold read — the stool strip\'s coverage is the un-logged days only, never a ratio that reads as a stool denominator (C-3)', () => {
  const partial = renderReport(base({ stool: { total: 1, normalCount: 0, looseCount: 1, windowDays: 46, loggedDays: 43, ai: null } }))
  assert.ok(/Owner-described; nothing of any kind was logged on <span class="num">3<\/span> of <span class="num">46<\/span> days, so a stool on those days is not in this count\. Loose-stool events/.test(partial))
  assert.ok(!/Owner-described over/.test(partial), 'the "over 43 of 46 days logged" ratio is gone')
  const full = renderReport(base({ stool: { total: 4, normalCount: 3, looseCount: 1, windowDays: 46, loggedDays: 46, ai: null } }))
  assert.ok(/Owner-described\. Loose-stool events/.test(full), 'nothing when fully covered')
})

Deno.test('R-11 cold read — "Across the 1 vomiting incident; none has a legible AI read" agrees at one and at zero', () => {
  const one = renderReport(base({ vomitPhenotype: emptyPhenotype({ totalIncidents: 1, withAnalysis: 1, assessedCount: 0, states: { completed: 0, uncertain: 1, failed: 0, pending: 0 } }) }))
  assert.ok(/Across the <span class="num">1<\/span> vomiting incident; none has a legible AI read/.test(one))
  assert.ok(!/Across all <span class="num">1<\/span>/.test(one) && !/0<\/span> have/.test(one))
})

Deno.test('R-11 cold read — a route prints as a clinician writes it', () => {
  const html = renderReport(base({ medications: [med({ route: 'oral' }), med({ regimenId: 'r2', drugName: 'Otomax', route: 'otic' }), med({ regimenId: 'r3', drugName: 'Custom', route: 'sublingual' })] }))
  assert.ok(/Metronidazole<\/span><span>.*?by mouth/.test(html), 'oral → by mouth')
  assert.ok(/Otomax<\/span><span>.*?in the ear/.test(html), 'otic → in the ear')
  assert.ok(/Custom<\/span><span>.*?by sublingual/.test(html), 'an unknown route prints as entered')
  assert.ok(!/by oral|by otic/.test(html))
})

Deno.test('R-11 cold read round 2 — a marker face names its kind, so "diet or drug?" is answered on the chart', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 2, weeklyBuckets: [1, 1], bucketStartDates: ['2026-05-01', '2026-05-08'], windowDays: 14 })],
      concurrentChanges: [
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
        { kind: 'supplement', label: 'Omega', startDate: '2026-05-09', bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null, endIsDeclared: true },
      ],
    }),
  )
  assert.ok(/>diet start &middot; May 2</.test(html))
  assert.ok(/>supplement start &middot; May 9</.test(html))
})

Deno.test('R-11 cold read round 2 — Appendix D prints the route the way page 1 does', () => {
  const html = renderReport(base({ medications: [med({ route: 'otic', drugName: 'Otomax' })] }))
  assert.ok(!/>otic,/.test(html) && !/by otic/.test(html), 'no raw "otic" anywhere')
  assert.ok((html.match(/in the ear/g) ?? []).length >= 2, 'page 1 and Appendix D agree')
})

Deno.test('CUL-994 Part 2 — adversarial round 4: record-scoped dates carry their year, so a 2025 course never reads as inside this year\'s window and a year-long course never runs backwards', () => {
  const html = renderReport(base({ medications: [endedCourse({ startedAt: '2025-05-01', endedAt: '2026-04-10', lifetimeFirstDoseDay: '2025-05-10', lifetimeLastDoseDay: '2025-05-23', lifetimeDoseDayCount: 14, windowDosesLogged: 0, windowDosesTotal: 0, daysWithDose: 0, elapsedDaysInWindow: 8 })] }))
  assert.equal(spanSentence(html), 'The 28 administered doses fell on all 14 days, May 10 – May 23, 2025 (28 prescribed doses at 2×/day take 14 days).')
  assert.ok(/May 1, 2025 – Apr 10, 2026 \(end recorded by owner\)/.test(html), 'the regimen dates stamp both years')
  const yearLong = renderReport(base({ medications: [endedCourse({ dosesPerDay: 1, prescribedDoses: 365, lifetimeDosesLogged: 305, startedAt: '2025-06-20', endedAt: '2026-06-25', lifetimeFirstDoseDay: '2025-06-21', lifetimeLastDoseDay: '2026-06-20', lifetimeDoseDayCount: 305, elapsedDaysInWindow: 84, windowDosesLogged: 79, windowDosesTotal: 79, daysWithDose: 79, givenDoses: 79 })] }))
  assert.equal(spanSentence(yearLong), 'The 305 administered doses fell on 305 of the 365 days from Jun 21, 2025 to Jun 20, 2026 (365 prescribed doses at 1×/day take 365 days).')
  assert.ok(/Jun 20, 2025 – Jun 25, 2026 \(end recorded by owner\)/.test(yearLong))
  // An ACTIVE regimen's start is record-scoped too (the meds pull is unbounded), so "since" carries its year.
  const active = renderReport(base({ medications: [med({ startedAt: '2025-11-14', endedAt: null, status: 'active', courseEnded: false })] }))
  assert.ok(/Metronidazole<\/span><span>[^]*?since Nov 14, 2025\. Adherence:/.test(active), 'an active course started last year says so')
})

Deno.test('CUL-994 Part 2 — adversarial round 4: the need is exact on every two-decimal pace (7 / 0.14 is 50 in the record, not 49.999…)', () => {
  // 8 doses at 0.14×/day occupy floor(700 / 14) + 1 = 51 days; IEEE floor(7 / 0.14) + 1 said 50.
  const html = renderReport(base({ medications: [endedCourse({ dosesPerDay: 0.14, prescribedDoses: 8, lifetimeDosesLogged: 8, startedAt: '2026-04-30', endedAt: '2026-06-21', lifetimeFirstDoseDay: '2026-05-01', lifetimeLastDoseDay: '2026-06-20', lifetimeDoseDayCount: 8, elapsedDaysInWindow: 53, windowDosesLogged: 8, windowDosesTotal: 8, daysWithDose: 8, givenDoses: 8 })] }))
  assert.equal(
    spanSentence(html),
    'The 8 administered doses fell on 8 of the 51 days from May 1 to Jun 20, 2026 (8 prescribed doses at 0.14×/day take 51 days).',
    'exact rational arithmetic',
  )
})

Deno.test('CUL-994 Part 2 — adversarial round 4: the sentence never restates the recorded end, and its nouns name their populations', () => {
  const html = renderReport(base({ medications: [endedCourse()] }))
  const line = html.slice(html.indexOf('Motozol'), html.indexOf('In this window'))
  assert.equal((line.match(/Aug 9/g) ?? []).length, 1, 'the end date prints once, in the regimen clause')
  assert.ok(!/Those doses/.test(line), 'no bare demonstrative that could bind to the prescribed set')
  assert.ok(/administered doses fell on/.test(line) && /prescribed doses at/.test(line), 'both populations named')
})


// ── R-3 (CUL-977) — Appendix A's LOGGED column carries a date across a day boundary ────
//
// The column exists to show the LOGGING DELAY, and it rendered a bare `HH:MM`. On the real
// v15 artifact that printed `Aug 19 · ~07:02–17:40 range · logged 09:04` for a row logged
// on Aug 21, so the window appeared to close eight and a half hours after the row was
// created. The cold read filed it as a blocking data-integrity finding against the RANGE
// convention, which is one of the best things the document does.

const CHI = 'America/Chicago'

/**
 * A local wall-clock time in a named zone → the UTC instant it names (B-514 / C-29).
 *
 * "Is the logged day the same local day as the occurred day?" is a LOCAL-day question, and
 * a bare UTC literal cannot state one: `2026-08-20T02:00:00Z` is Aug 19 in Chicago and
 * Aug 20 in London. Written as local components the fixture says what it means, and the
 * render is handed the zone explicitly, so neither depends on the host's TZ.
 *
 * Two passes, because the first correction can itself cross a DST transition.
 */
function atLocal(tz: string, day: string, hhmm: string): string {
  const [y, mo, d] = day.split('-').map(Number)
  const [hh, mi] = hhmm.split(':').map(Number)
  const target = Date.UTC(y, mo - 1, d, hh, mi)
  let ms = target
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const g = (t: string): number => Number(parts.find((p) => p.type === t)!.value)
    ms += target - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  }
  return new Date(ms).toISOString()
}

/** Appendix A's rows as cell text: [date, type, occurred, logged, note]. */
function appendixARows(html: string): string[][] {
  const start = html.indexOf('Appendix A — Symptom event log')
  assert.ok(start > -1, 'appendix A renders')
  const body = html.slice(html.indexOf('<tbody>', start), html.indexOf('</tbody>', start))
  return [...body.matchAll(/<tr>([^]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((c) => text(c[1]).replace(/\s+/g, ' ').trim()),
  )
}

/** An August-window report in Chicago, so the local-day question has a stated zone. */
function chicagoReport(rows: SymptomLogEntry[], scopeOver: Record<string, unknown> = {}): string {
  const b = base()
  return renderReport(
    base({
      timezone: CHI,
      scope: { ...b.scope, startDate: '2026-07-20', endDate: '2026-08-31', ...scopeOver },
      provenance: { ...b.provenance, symptomLog: rows, totalSymptomIncidents: rows.length },
    }),
  )
}

Deno.test('R-3 — a row logged on a DIFFERENT local day prints that day in the LOGGED cell', () => {
  const rows = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: atLocal(CHI, '2026-08-19', '17:40'),
        loggedAt: atLocal(CHI, '2026-08-21', '09:04'),
      }),
    ]),
  )
  assert.equal(rows[0][0], 'Aug 19', 'the Date column is the event day')
  assert.equal(rows[0][3], 'Aug 21, 09:04', 'the LOGGED cell names the day it was recorded')
})

Deno.test('R-3 — a row logged the SAME local day stays a bare time, so the common row gains no noise', () => {
  const rows = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: atLocal(CHI, '2026-08-19', '19:54'),
        loggedAt: atLocal(CHI, '2026-08-19', '20:11'),
      }),
    ]),
  )
  assert.equal(rows[0][3], '20:11', 'no date on a same-day row')
})

Deno.test('R-3 — the local day is judged in the OWNER\'s zone, not UTC', () => {
  // 23:30 Chicago on Aug 19 is 04:30 UTC on Aug 20: same local day, different UTC day. A
  // UTC comparison would print a date here and claim a delay the record does not hold.
  const sameLocal = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: atLocal(CHI, '2026-08-19', '21:00'),
        loggedAt: atLocal(CHI, '2026-08-19', '23:30'),
      }),
    ]),
  )
  assert.equal(sameLocal[0][3], '23:30', 'one Chicago day that straddles UTC midnight is still one day')
  // And the mirror: 00:20 Chicago on Aug 20 is 05:20 UTC the same day, a DIFFERENT local day
  // from an event at 21:00 on Aug 19 — so the date must print.
  const crossLocal = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: atLocal(CHI, '2026-08-19', '21:00'),
        loggedAt: atLocal(CHI, '2026-08-20', '00:20'),
      }),
    ]),
  )
  assert.equal(crossLocal[0][3], 'Aug 20, 00:20', 'twenty minutes later is a new local day and says so')
})

Deno.test('R-3 — the Aug 19 row from the v15 artifact, verbatim: the window no longer closes after it was logged', () => {
  // The record, exactly as production holds it (CUL-977's table). These are the stored UTC
  // instants; the LOCAL-day question they pose is answered by the zone handed to the render.
  const rows = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: '2026-08-19T22:40:00Z',
        occurredAtConfidence: 'window',
        occurredAtEarliest: '2026-08-19T12:02:00Z',
        occurredAtLatest: '2026-08-19T22:40:00Z',
        loggedAt: '2026-08-21T14:04:00Z',
      }),
    ]),
  )
  assert.equal(rows[0][0], 'Aug 19')
  assert.equal(rows[0][2], '~07:02–17:40 range', 'the window renders unchanged')
  assert.equal(rows[0][3], 'Aug 21, 09:04', 'two days later, and the page now says so')
})

Deno.test('R-3 — a logged day outside the window\'s YEAR carries the year (C-19)', () => {
  // Logging can postdate the window end, so this cell is one of the few whose date is not
  // bounded by the letterhead range. `fmtLocalDayScoped` stamps the year when it differs.
  const rows = appendixARows(
    chicagoReport([
      logEntry({
        type: 'vomit',
        occurredAt: atLocal(CHI, '2026-12-30', '18:00'),
        loggedAt: atLocal(CHI, '2027-01-02', '08:15'),
      }),
    ], { startDate: '2026-11-01', endDate: '2026-12-31' }),
  )
  assert.equal(rows[0][3], 'Jan 2, 2027, 08:15', 'a cross-year log day is never bare')
})

Deno.test('R-3 — Appendix A\'s preamble says what LOGGED means and that a gap is information', () => {
  const html = chicagoReport([
    logEntry({ type: 'vomit', occurredAt: atLocal(CHI, '2026-08-19', '17:40'), loggedAt: atLocal(CHI, '2026-08-21', '09:04') }),
  ])
  const sub = text(html.slice(html.indexOf('Appendix A — Symptom event log'), html.indexOf('<table>', html.indexOf('Appendix A — Symptom event log'))))
  assert.ok(/when the owner recorded/i.test(sub), 'the column is defined')
  assert.ok(/different day/i.test(sub), 'the date rule is stated')
  assert.ok(/is itself information|is information/i.test(sub), 'the gap is named as signal, not error')
})

// ── R-4 (CUL-978) — a negative may not render while the same document says its opposite ──
//
// Two sites, one shape: a negative assertion printed from an empty table, with no check
// against facts the report already renders elsewhere. On the v15 artifact p9 said "Active
// conditions: None recorded" over a patient whose own p5 medication row read "for Ear
// infection", and "Supplements: None recorded" over three other pages calling her
// antihistamine a supplement. Both lines were true of the table they read and false of the
// document they sat in.

/** The `<td>` of the Appendix B row whose `<th>` is `label`. */
function appendixBRow(html: string, label: string): string {
  const start = html.indexOf('Appendix B — Diet history')
  assert.ok(start > -1, 'appendix B renders')
  const body = html.slice(start, html.indexOf('</table>', start))
  const m = new RegExp(`<tr><th[^>]*>${label}</th><td>([^]*?)</td></tr>`).exec(body)
  assert.ok(m, `appendix B has a "${label}" row`)
  return m![1]
}

Deno.test('R-4 site 1 — an empty conditions table beside a medication that names an indication says so', () => {
  const html = renderReport(
    base({ medications: [med({ drugName: 'Motozol', indication: 'Ear infection', isSupplement: false })] }),
  )
  const cell = text(appendixBRow(html, 'Active conditions'))
  assert.ok(!/^None recorded\.$/.test(cell.trim()), 'not the bare negative')
  assert.ok(/Ear infection/.test(cell), 'the indication the medication record names is quoted')
  assert.ok(/Motozol/.test(cell), 'and the drug it came from, so the vet can find it')
  // NEVER SYNTHESISED: an indication is what the owner typed against a drug, not a
  // diagnosis, so it is never promoted into the conditions list as if entered there.
  assert.ok(!/^Ear infection/.test(cell.trim()), 'the indication is not printed as a condition row')
})

Deno.test('R-4 site 1 — a genuinely quiet record still gets a clean, calm negative', () => {
  const html = renderReport(base({ medications: [med({ indication: null })], unlinkedMedications: [] }))
  const cell = text(appendixBRow(html, 'Active conditions')).trim()
  assert.ok(/^None entered/.test(cell), 'the quiet record is not made noisy')
  assert.ok(!/indication/i.test(cell), 'no tension is invented where there is none')
  // The claim is about the RECORD, not about the world.
  assert.ok(/not evidence/.test(cell), 'and it says what its own silence does not prove')
})

Deno.test('R-4 site 2 — a supplement carried only as an UNLINKED dose group reaches the supplements row', () => {
  // The real mechanism behind the v15 contradiction: `supps` read `snap.medications` only,
  // so an OTC supplement dosed with no configured regimen — which is what an owner-bought
  // antihistamine is — rendered on three other pages and never here.
  const html = renderReport(base({ medications: [], unlinkedMedications: [unlinkedMed()] }))
  const cell = text(appendixBRow(html, 'Supplements'))
  assert.ok(/Cetirizine HCl \(Zyrtec\)/.test(cell), 'the supplement the rest of the report names is named here')
  assert.ok(!/None recorded/.test(cell), 'and the negative does not render over it')
})

Deno.test('R-4 site 2 — a supplement named only in the concurrent-change list still blocks the negative', () => {
  const html = renderReport(
    base({
      medications: [],
      unlinkedMedications: [],
      concurrentChanges: [
        // R-14 widened this type under the branch: no end at all, so no end bucket, and
        // `endIsDeclared` is false because there is nothing for the record to have declared.
        // Irrelevant to what this test asserts (the supplement's NAME blocking the negative),
        // which is why it is the neutral pair rather than the drawing one.
        {
          kind: 'supplement', label: 'Cetirizine HCl (Zyrtec)', startDate: '2026-05-09',
          bucketIndex: 1, ongoing: false, endInWindow: null, endBucketIndex: null,
          endIsDeclared: false,
        },
      ],
    }),
  )
  const cell = text(appendixBRow(html, 'Supplements'))
  assert.ok(!/^None recorded/.test(cell.trim()), 'a supplement the document names anywhere blocks the bare negative')
  assert.ok(/Cetirizine HCl \(Zyrtec\)/.test(cell), 'and the row points at it')
})

Deno.test('R-4 site 2 — the reconciliation sits WITH the negative, not a page later in appendix D', () => {
  const html = renderReport(base({ medications: [], unlinkedMedications: [], concurrentChanges: [] }))
  const cell = text(appendixBRow(html, 'Supplements')).trim()
  assert.ok(/^None recorded/.test(cell), 'a truly quiet record still gets the calm negative')
  assert.ok(/taken as food|with a meal/i.test(cell), 'the appendix D reconciliation is inlined at the claim')
  assert.ok(/not evidence/.test(cell), 'the claim is about the record')
  // And it is genuinely EARLIER than appendix D's copy of it, which is what the cold read
  // had to read twice.
  const dIdx = html.indexOf('Appendix D — Medication log')
  const bIdx = html.indexOf('Appendix B — Diet history')
  assert.ok(bIdx > -1 && dIdx > bIdx, 'appendix B precedes appendix D on the sheet')
})

// ── R-4 item 3 — the class sweep, and the one site it leaves pinned ──────────────────
//
// Every negative in `render.ts` was walked against the question "is there any other surface
// on this document that could contradict it?" (37 sites). The two CUL-978 names were the
// only ones that could, and the rest fall into three groups: a field absence nothing else
// on the page states (sex / neuter / breed / owner / a bowl with no recorded start); a
// negative already cross-checked by an earlier pass (`medicationOverlapLine` names the scope
// it examined, after adversarial pass 5); and a negative computed from the SAME set as the
// surface that could contradict it (page 1's "No fully-eaten meal" and appendix E's intake
// breakdown both read the window's rated meals; appendix B's treat count is a superset of
// appendix C's treat rows, so a zero there forces a zero here).
//
// NO GUARD FILE. The blunt detector for this class — "a negative string needs a cross-check"
// — would need an exemption at 35 of 37 sites, and an exemption applied thirty-five times is
// a scope error rather than an exemption (C-33). C-32's rule bites the same way: a registry
// entry has to be earned, and thirty-five entries recording that someone thought about a
// string is not a guard. The behaviour is pinned where it is load-bearing instead.

Deno.test('R-4 sweep — page 1\'s medication negative already reads ALL THREE sources, and stays that way', () => {
  // This is the site appendix B's supplements row should have looked like: it checks
  // regimen meds, regimen supplements AND unlinked dose groups before claiming none. Pinned
  // because dropping any one of the three reproduces the CUL-978 bug one page earlier.
  const quiet = renderReport(base({ medications: [], unlinkedMedications: [], concurrentChanges: [] }))
  assert.ok(/None logged in this window/.test(quiet), 'a truly quiet record still gets the negative')

  const cases: Array<{ label: string; over: Partial<ReportSnapshot> }> = [
    { label: 'a regimen medication', over: { medications: [med({ drugName: 'Metronidazole', isSupplement: false })] } },
    { label: 'a regimen supplement', over: { medications: [med({ drugName: 'Omega-3', isSupplement: true })] } },
    { label: 'an unlinked OTC group', over: { unlinkedMedications: [unlinkedMed()] } },
  ]
  for (const { label, over } of cases) {
    const html = renderReport(base({ medications: [], unlinkedMedications: [], concurrentChanges: [], ...over }))
    assert.ok(
      !/None logged in this window/.test(html),
      `${label} must suppress page 1's medication negative`,
    )
  }
})

// ── R-13 item 1 (CUL-643) — appendix E's pointers describe what appendix E holds ───────
//
// Page 1 and appendix B said "itemised in appendix E" at five sites, four of which render
// on any one report. Appendix E itemises nothing: it prints a grouped row per FOOD, and
// only when a reduced-intake flag fired does a second table list individual meals — a
// capped, filtered subset, never the whole log. R-15 brief 5 was unruled at build time, so
// this takes its stated fallback (option b, the honest direction): the word goes, the
// pointer says what is actually there, and the per-meal times are named as living in the
// app. Provisional; option (a), a real per-meal table, is still open on CUL-643.

/** A grouped meal-item row for a diet fixture. */
function mealItem(o: Partial<DietSummary['mealItems'][number]> = {}): DietSummary['mealItems'][number] {
  return {
    foodLabel: o.foodLabel ?? 'Tiki Cat Tuna',
    primaryProtein: o.primaryProtein ?? 'tuna',
    proteinSet: o.proteinSet ?? pset(['tuna']),
    format: o.format ?? null,
    count: o.count ?? 12,
    firstDate: o.firstDate ?? '2026-06-01',
    lastDate: o.lastDate ?? '2026-07-01',
    intakeBreakdown: o.intakeBreakdown ?? [{ rating: 'all', count: 12 }],
  }
}

const intakeRow = (over: Partial<IntakeLogEntry> = {}): IntakeLogEntry => ({
  eventId: over.eventId ?? 'm1',
  occurredAt: over.occurredAt ?? '2026-07-01T12:00:00Z',
  foodLabel: over.foodLabel ?? 'Tiki Cat Tuna',
  intakeRating: over.intakeRating ?? 'some',
  isLastFullMeal: over.isLastFullMeal ?? false,
  pinned: over.pinned ?? false,
})

/** Every clause on the report that points the reader at appendix E. */
function appendixEPointers(html: string): string[] {
  // `&nbsp;` survives tag-stripping and its own semicolon would end a clause, so the
  // entities come out before the sentence split.
  const t = text(html).replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '-').replace(/&[a-z]+;/g, ' ')
  return [...t.matchAll(/[^.;)]*appendix E[^.;)]*/g)].map((m) => m[0].trim())
}

/** Does appendix E actually list individual meals with a Time column? */
function appendixEHasPerMealTable(html: string): boolean {
  const i = html.indexOf('Appendix E — Meals &amp; intake')
  if (i < 0) return false
  return /<th style="width:58px">Time<\/th>/.test(html.slice(i))
}

Deno.test('R-13 item 1 — no pointer promises itemisation, and every one matches the appendix it points at', () => {
  const b = base()
  const grouped = base({
    diet: { ...b.diet, mealItems: [mealItem()], mealCompletion: { ratedMeals: 12, finishedMeals: 10, rate: 10 / 12, intakeBreakdown: [{ rating: 'all', count: 10 }, { rating: 'some', count: 2 }] } },
    provenance: { ...b.provenance, intakeLog: [], intakeLogScope: null, intakeLogHiddenOlder: 0 },
  })
  const unfinished = base({
    diet: { ...b.diet, mealItems: [mealItem()], mealCompletion: { ratedMeals: 12, finishedMeals: 10, rate: 10 / 12, intakeBreakdown: [{ rating: 'all', count: 10 }, { rating: 'some', count: 2 }] } },
    provenance: {
      ...b.provenance,
      intakeLog: [intakeRow({ intakeRating: 'picked' })],
      intakeLogScope: 'unfinished',
      intakeLogHiddenOlder: 0,
    },
  })
  const flagged = base({
    diet: { ...b.diet, mealItems: [mealItem()], mealCompletion: { ratedMeals: 12, finishedMeals: 10, rate: 10 / 12, intakeBreakdown: [{ rating: 'all', count: 10 }, { rating: 'some', count: 2 }] } },
    provenance: {
      ...b.provenance,
      intakeLog: [intakeRow({ intakeRating: 'all', isLastFullMeal: true })],
      intakeLogScope: 'intake_flag',
      intakeLogHiddenOlder: 0,
    },
  })

  for (const [name, snap] of [['grouped only', grouped], ['not-fully-eaten list', unfinished], ['intake-flag list', flagged]] as Array<[string, ReportSnapshot]>) {
    const html = renderReport(snap)
    const pointers = appendixEPointers(html)
    assert.ok(pointers.length > 0, `${name}: the report points at appendix E`)
    assert.ok(!/itemised in appendix/i.test(text(html)), `${name}: nothing claims itemisation`)

    const hasPerMeal = appendixEHasPerMealTable(html)
    for (const p of pointers) {
      // A pointer may only promise dates and times where the per-meal table renders.
      if (/by date and time/.test(p)) {
        assert.ok(hasPerMeal, `${name}: "${p}" promises times the appendix does not print`)
      }
    }
    if (!hasPerMeal) {
      assert.ok(
        pointers.every((p) => !/by date and time/.test(p)),
        `${name}: a grouped-only appendix promises no per-meal times`,
      )
    }
    // And the appendix says where the individual meal times DO live, since the promise no
    // longer implies they are on the page.
    assert.ok(/in the Culprit app/.test(text(html)), `${name}: the report says where per-meal times live`)
  }
})

Deno.test('R-13 item 1 — the pointer is ONE string, so the promises cannot drift apart', () => {
  const b = base()
  const html = renderReport(
    base({
      diet: { ...b.diet, mealItems: [mealItem()], mealCompletion: { ratedMeals: 12, finishedMeals: 10, rate: 10 / 12, intakeBreakdown: [{ rating: 'all', count: 10 }, { rating: 'some', count: 2 }] } },
      provenance: { ...b.provenance, intakeLog: [intakeRow()], intakeLogScope: 'unfinished', intakeLogHiddenOlder: 0 },
    }),
  )
  // Every clause pointing at appendix E for the MEAL record carries the same description of
  // it. (The legend's separate note about the page-1 fully-eaten line is not a meal pointer.)
  const described = appendixEPointers(html).filter((p) => /grouped by food/.test(p))
  assert.ok(described.length >= 3, `at least three sites describe the appendix (got ${described.length})`)
  // Cut the legend's trailing "(meals & intake)" label, which is the sheet name rather
  // than part of the description.
  const shapes = new Set(described.map((p) => p.slice(p.indexOf('grouped by food')).split(' (')[0].trim()))
  assert.equal(shapes.size, 1, `one description, reused: ${[...shapes].join(' || ')}`)
  // And no site anywhere claims the capped second table is complete.
  const t = text(html).replace(/&nbsp;/g, ' ')
  assert.ok(!/lists each meal/.test(t), 'no pointer claims the capped list is exhaustive')
})

// ── R-13 item 2 (CUL-851) — appendix B's Previous-diet row renders the derivation ──────

Deno.test('R-13 item 2 — the Previous diet row states its derivation and its span', () => {
  const b = base()
  const html = renderReport(
    base({
      diet: {
        ...b.diet,
        previousDiet: { labels: ['Tiki Cat Tuna', 'Fancy Feast Salmon'], feedings: 38, firstDay: '2026-05-02', lastDay: '2026-05-11' },
      },
    }),
  )
  const cell = text(appendixBRow(html, 'Previous diet'))
  assert.ok(!/^Not recorded\.$/.test(cell.trim()), 'not the hardcoded negative')
  assert.ok(/Tiki Cat Tuna/.test(cell) && /Fancy Feast Salmon/.test(cell), 'the foods are named')
  assert.ok(/meal log/i.test(cell), 'the row says where the answer came from')
  assert.ok(/May 11/.test(cell) && /May 2/.test(cell), 'and the span it read')
  assert.ok(/2026/.test(cell), 'the pair carries its year once (C-19) — these dates precede the window')
  // NOT presented as an entered field: the appendix sub-head promises that uncaptured
  // fields are marked rather than guessed, so a derived value has to say it is derived.
  assert.ok(/not an entered|Not entered/i.test(cell), 'the derivation is not passed off as a captured field')
})

Deno.test('R-13 item 2 — with nothing derivable the row keeps its honest negative', () => {
  const b = base()
  const html = renderReport(base({ diet: { ...b.diet, previousDiet: null } }))
  assert.equal(text(appendixBRow(html, 'Previous diet')).trim(), 'Not recorded.')
})

// ── R-13 item 3 (CUL-852) — the WSAVA "Food used to give medication" row ───────────────

Deno.test('R-13 item 3 — the vehicle is named, and the row says whether the tally counts it', () => {
  const b = base()
  const counted = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: { labels: ['Greenies Pill Pocket'], feedings: 12, countedInTally: 12 } } }),
  )
  const c = text(appendixBRow(counted, 'Food used to give medication'))
  assert.ok(/Greenies Pill Pocket/.test(c), 'the vehicle is named')
  assert.ok(/12 feedings carried a dose/.test(c), 'and how often it was used')
  assert.ok(/Counted among the off-diet exposures/.test(c), 'the tally question is answered')

  const uncounted = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: { labels: ['Tiki Cat Tuna'], feedings: 4, countedInTally: 0 } } }),
  )
  const u = text(appendixBRow(uncounted, 'Food used to give medication'))
  assert.ok(/Not counted among the off-diet exposures/.test(u), 'and answered the other way when it is not')
  assert.ok(/does not describe them/.test(u), 'with what that means for the tally')

  const mixed = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: { labels: ['Pill Pocket', 'Tiki Cat Tuna'], feedings: 10, countedInTally: 3 } } }),
  )
  const m = text(appendixBRow(mixed, 'Food used to give medication'))
  assert.ok(/3 of these are counted/.test(m), 'a split population states its split (C-4)')
  // …and agrees with itself at one.
  const single = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: { labels: ['Pill Pocket', 'Tiki Cat Tuna'], feedings: 4, countedInTally: 1 } } }),
  )
  assert.ok(/1 of these is counted/.test(text(appendixBRow(single, 'Food used to give medication'))), 'singular agreement')
})

Deno.test('R-13 item 3 — an absence distinguishes "no dose in food" from "no medication"', () => {
  const b = base()
  const withMeds = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: null }, medications: [med({})], unlinkedMedications: [] }),
  )
  assert.ok(
    /no dose in this window was logged as given in food/.test(text(appendixBRow(withMeds, 'Food used to give medication'))),
    'a medicated pet with no vehicle says which absence this is',
  )
  const noMeds = renderReport(
    base({ diet: { ...b.diet, medicationVehicles: null }, medications: [], unlinkedMedications: [] }),
  )
  assert.equal(text(appendixBRow(noMeds, 'Food used to give medication')).trim(), 'Not recorded.')
})

// ── R-13 item 4 (CUL-292) — "list not read" is the wrong claim about home food ─────────
//
// Home-prepared food has no ingredient panel to read, so marking it "list not read" reports
// a capture failure where none occurred, and counting it in the floor disclosure's numerator
// inflates a figure that exists to say how much of the PACKAGED record went unread.

const conf = (o: Partial<ConfounderExposure> & { eventId: string }): ConfounderExposure => ({
  occurredAt: '2026-06-01T12:00:00Z',
  dayKey: '2026-06-01',
  foodLabel: 'Treat A',
  primaryProtein: 'chicken',
  proteinSet: pset(['chicken']),
  format: 'treat',
  foodType: 'treat',
  note: null,
  ...o,
})

/** Appendix C's rendered rows, as cell text. */
function appendixCRows(html: string): string[][] {
  const start = html.indexOf('Appendix C —')
  assert.ok(start > -1, 'appendix C renders')
  const body = html.slice(html.indexOf('<tbody>', start), html.indexOf('</tbody>', start))
  return [...body.matchAll(/<tr>([^]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((c) => text(c[1]).replace(/\s+/g, ' ').trim()),
  )
}

Deno.test('R-13 item 4 — a home-food row says its ingredients were not recorded, not that a list went unread', () => {
  const b = base()
  const html = renderReport(
    base({
      provenance: {
        ...b.provenance,
        confounders: [
          conf({ eventId: 'h1', foodLabel: 'Ground beef', primaryProtein: 'beef', proteinSet: pset(['beef']), format: 'human_food', foodType: 'meal' }),
          conf({ eventId: 't1', foodLabel: 'Jerky Treat', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat' }),
        ],
      },
    }),
  )
  const rows = appendixCRows(html)
  const home = rows.find((r) => r.some((c) => /Ground beef/.test(c)))
  const packaged = rows.find((r) => r.some((c) => /Jerky Treat/.test(c)))
  assert.ok(home && packaged, 'both rows render')
  assert.ok(!home.some((c) => /list not read/.test(c)), 'home food is not marked as an unread panel')
  assert.ok(home.some((c) => /ingredients not recorded/i.test(c)), 'it says what is actually missing')
  // And the packaged row is untouched — the wording is category-specific, not a blanket
  // softening of the incompleteness marker.
  assert.ok(packaged.some((c) => /list not read/.test(c)), 'a packaged food still says its panel went unread')
})

Deno.test('R-13 item 4 — the floor disclosure counts packaged feedings, and states home food separately', () => {
  const b = base()
  const html = renderReport(
    base({
      provenance: {
        ...b.provenance,
        confounders: [
          conf({ eventId: 'h1', foodLabel: 'Ground beef', primaryProtein: 'beef', proteinSet: pset(['beef']), format: 'human_food', foodType: 'meal' }),
          conf({ eventId: 'h2', foodLabel: 'Rice', primaryProtein: 'rice', proteinSet: pset(['rice']), format: 'human_food', foodType: 'meal' }),
          conf({ eventId: 't1', foodLabel: 'Jerky', proteinSet: pset(['chicken']), format: 'treat', foodType: 'treat' }),
          conf({ eventId: 't2', foodLabel: 'Biscuit', proteinSet: pset(['wheat'], { complete: true }), format: 'treat', foodType: 'treat' }),
        ],
        proteinExposureTally: { chicken: 1, beef: 1, rice: 1, wheat: 1 },
      },
      proteinTimeline: {
        ...b.proteinTimeline,
        proteins: ['chicken'],
        totalFeedings: 4,
        incompleteFeedings: 3,
        humanFoodFeedings: 2,
        incompleteHumanFoodFeedings: 2,
        packagedReadable: 2,
        packagedUnread: 1,
      },
    }),
  )
  const t = text(html).replace(/&nbsp;/g, ' ')
  // 1 of the 2 PACKAGED feedings went unread — never 3 of 4, which reads as a record three
  // quarters unverified when two of those rows never had a panel to verify.
  assert.ok(/1 of 2 packaged off-diet feeding/.test(t), `packaged ratio; got: ${t.slice(t.indexOf('A floor, not a total'), t.indexOf('A floor, not a total') + 400)}`)
  assert.ok(!/3 of 4 off-diet feeding/.test(t), 'home food is out of the numerator and the denominator')
  assert.ok(/2 home-prepared feeding/.test(t), 'and is stated separately rather than dropped')
})

Deno.test('R-13 item 4 — an all-home-food record makes no packaged claim at all', () => {
  const b = base()
  const html = renderReport(
    base({
      provenance: {
        ...b.provenance,
        confounders: [conf({ eventId: 'h1', foodLabel: 'Ground beef', primaryProtein: 'beef', proteinSet: pset(['beef']), format: 'human_food', foodType: 'meal' })],
        proteinExposureTally: { beef: 1 },
      },
      proteinTimeline: { ...b.proteinTimeline, proteins: ['beef'], totalFeedings: 1, incompleteFeedings: 1, humanFoodFeedings: 1, incompleteHumanFoodFeedings: 1, packagedReadable: 0, packagedUnread: 0 },
    }),
  )
  const t = text(html).replace(/&nbsp;/g, ' ')
  assert.ok(!/packaged off-diet feeding/.test(t), 'no packaged ratio over a record with no packaged food')
  assert.ok(/1 home-prepared feeding/.test(t), 'the home-food limitation still stands')
})

// ── R-13 item 5 (CUL-497) — a tie is not a dash, and the dash is reserved for no data ──
//
// STATE OF THE DEFECT ON MAIN, MEASURED RATHER THAN INHERITED. CUL-497 describes two
// mechanisms and B-532 has since fixed one: appendix E's cell renders the full
// `intakeBreakdown`, not the mode, so ninety rated meals can no longer collapse to one
// em-dash — that dash now fires only on an empty breakdown, which IS no data. Round 7
// likewise restored the "N of M fully eaten" figure to the free-fed branch. What remains is
// the third: on a TIE the page-1 adverb is silently dropped, so a reader cannot tell "the
// record is evenly split" from "nobody computed one", and the two surfaces describe the same
// rating multiset at different densities with nothing tying them together.

const intakeSet = (b: Array<{ rating: IntakeRating; count: number }>) => b


Deno.test('R-13 item 5 — a tie renders the SPLIT, and never picks the calmer side', () => {
  const b = base()
  const html = renderReport(
    base({
      diet: {
        ...b.diet,
        freeFed: [{ foodLabel: 'Dry bowl', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: '2026-04-03', activeUntil: null, isShared: false }],
        mealItems: [mealItem({ count: 12, intakeBreakdown: intakeSet([{ rating: 'all', count: 6 }, { rating: 'refused', count: 6 }]) })],
        mealCompletion: { ratedMeals: 12, finishedMeals: 6, rate: 0.5, intakeBreakdown: intakeSet([{ rating: 'all', count: 6 }, { rating: 'refused', count: 6 }]) },
      },
    }),
  )
  const t = plain(html)
  assert.ok(/ratings:/.test(t), 'the tie is itemised rather than summarised')
  assert.ok(/Ate it all/i.test(t) && /Refused/i.test(t), 'both ratings are shown')
  assert.ok(!/typically/.test(t), 'no side is picked')
  assert.ok(/6 of 12 fully eaten/.test(t), 'and the count still prints')
})

Deno.test('R-13 item 5 — a strict plurality still reads "typically", unchanged', () => {
  const b = base()
  const html = renderReport(
    base({
      diet: {
        ...b.diet,
        freeFed: [{ foodLabel: 'Dry bowl', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: '2026-04-03', activeUntil: null, isShared: false }],
        mealItems: [mealItem({ count: 12, intakeBreakdown: intakeSet([{ rating: 'all', count: 9 }, { rating: 'some', count: 3 }]) })],
        mealCompletion: { ratedMeals: 12, finishedMeals: 9, rate: 0.75, intakeBreakdown: intakeSet([{ rating: 'all', count: 9 }, { rating: 'some', count: 3 }]) },
      },
    }),
  )
  const t = plain(html)
  assert.ok(/typically "ate it all"/i.test(t), 'a real plurality keeps the adverb')
  assert.ok(!/ratings:/.test(t), 'and is not itemised')
})

Deno.test('R-13 item 5 — the dash is reserved for genuinely no data, on both surfaces', () => {
  const b = base()
  // A food with meals logged but NONE rated: the one state that honestly has no intake.
  const noData = renderReport(
    base({ diet: { ...b.diet, mealItems: [mealItem({ count: 4, intakeBreakdown: [] })], mealCompletion: null } }),
  )
  const cells = appendixEMealRows(noData)
  assert.equal(cells[0][4], '—', 'an unrated food renders the dash')

  // A tie over the SAME surface must not.
  const tie = renderReport(
    base({
      diet: {
        ...b.diet,
        mealItems: [mealItem({ count: 12, intakeBreakdown: intakeSet([{ rating: 'all', count: 6 }, { rating: 'refused', count: 6 }]) })],
        mealCompletion: { ratedMeals: 12, finishedMeals: 6, rate: 0.5, intakeBreakdown: intakeSet([{ rating: 'all', count: 6 }, { rating: 'refused', count: 6 }]) },
      },
    }),
  )
  const tieCell = appendixEMealRows(tie)[0][4]
  assert.ok(tieCell !== '—', 'a tie is never the dash')
  assert.ok(/Ate it all ×6/.test(tieCell) && /Refused ×6/.test(tieCell), 'it shows every rating')
})

Deno.test('R-13 item 5 — ONE predicate: the two surfaces never disagree about the same ratings', () => {
  const b = base()
  const cases: Array<{ breakdown: Array<{ rating: IntakeRating; count: number }>; finished: number }> = [
    { breakdown: [{ rating: 'all', count: 9 }, { rating: 'some', count: 3 }], finished: 9 },
    { breakdown: [{ rating: 'all', count: 6 }, { rating: 'refused', count: 6 }], finished: 6 },
    { breakdown: [{ rating: 'some', count: 4 }, { rating: 'picked', count: 4 }, { rating: 'refused', count: 4 }], finished: 0 },
    { breakdown: [{ rating: 'refused', count: 12 }], finished: 0 },
  ]
  for (const { breakdown, finished } of cases) {
    const total = breakdown.reduce((a, x) => a + x.count, 0)
    const html = renderReport(
      base({
        diet: {
          ...b.diet,
          freeFed: [{ foodLabel: 'Dry bowl', primaryProtein: 'chicken', proteinSet: pset(['chicken']), activeFrom: '2026-04-03', activeUntil: null, isShared: false }],
          mealItems: [mealItem({ count: total, intakeBreakdown: breakdown })],
          mealCompletion: { ratedMeals: total, finishedMeals: finished, rate: finished / total, intakeBreakdown: breakdown },
        },
      }),
    )
    const t = plain(html)
    const top = Math.max(...breakdown.map((x) => x.count))
    const tied = breakdown.filter((x) => x.count === top)
    if (tied.length > 1 || top < 2) {
      assert.ok(/ratings:/.test(t), `a tie of ${tied.length} (top ${top}) should itemise`)
      assert.ok(!/typically/.test(t), 'and pick no side')
      // AND ACCOUNT FOR EVERY MEAL — the itemised clause is the whole breakdown, not the
      // tied subset, so a rating can never be dropped from the sentence that summarises it.
      for (const x of breakdown) {
        assert.ok(
          new RegExp(`${intakeLabelFor(x.rating)}" ×${x.count}`, 'i').test(t),
          `page 1 names ${x.rating} ×${x.count}`,
        )
      }
    } else {
      assert.ok(
        new RegExp(`typically "${intakeLabelFor(tied[0].rating)}"`, 'i').test(t),
        `a plurality should name ${tied[0].rating}`,
      )
    }
    // Appendix E shows every rating whatever page 1 said, so the two can be reconciled.
    const cell = appendixEMealRows(html)[0][4]
    for (const x of breakdown) {
      assert.ok(cell.includes(`×${x.count}`), `appendix E carries the ${x.rating} count`)
    }
  }
})

/** Appendix E's grouped meal rows, as cell text. */
function appendixEMealRows(html: string): string[][] {
  const start = html.indexOf('Appendix E — Meals &amp; intake')
  assert.ok(start > -1, 'appendix E renders')
  const body = html.slice(html.indexOf('<tbody>', start), html.indexOf('</tbody>', start))
  return [...body.matchAll(/<tr>([^]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((c) => plain(c[1]).replace(/\s+/g, ' ').trim()),
  )
}

/** The owner-facing label for a rating, as the report prints it. */
function intakeLabelFor(r: IntakeRating): string {
  return { all: 'Ate it all', most: 'Ate most', some: 'Ate some', picked: 'Picked at it', refused: 'Refused' }[r]
}

// ── R-13 item 6 (CUL-634) — the owner-removed photo is named, not just counted ─────────
//
// The photos appendix disclosed "1 further incident was photographed and read but its photo
// is no longer retained" without saying WHICH, while that incident's appendix A row showed a
// full photo read with no marker at all. A vet cross-checking "N reads but fewer photos" had
// a count on one sheet, an unmarked row on another, and no way to join them.

Deno.test('R-13 item 6 — the appendix A row whose photo was removed says so', () => {
  const b = base()
  const html = renderReport(
    base({
      provenance: {
        ...b.provenance,
        totalSymptomIncidents: 2,
        symptomLog: [
          logEntry({
            eventId: 'gone',
            type: 'vomit',
            occurredAt: '2026-06-20T14:00:00Z',
            photoRemoved: true,
            phenotype: { kind: 'vomit', status: 'completed', colour: 'yellow', contentsCategory: 'bile', consistency: 'foamy', bloodPresent: null, foreignPresent: null, foreignNote: null, bristol: null, stoolColour: null, stoolBlood: null, mucusPresent: null, edited: false },
          }),
          logEntry({
            eventId: 'kept',
            type: 'vomit',
            occurredAt: '2026-06-21T14:00:00Z',
            phenotype: { kind: 'vomit', status: 'completed', colour: 'yellow', contentsCategory: 'bile', consistency: 'foamy', bloodPresent: null, foreignPresent: null, foreignNote: null, bristol: null, stoolColour: null, stoolBlood: null, mucusPresent: null, edited: false },
          }),
        ],
      },
      incidentPhotosRemoved: [{ eventId: 'gone', type: 'vomit', occurredAt: '2026-06-20T14:00:00Z' }],
    }),
  )
  const rows = appendixARows(html)
  const gone = rows.find((r) => r[0] === 'Jun 20')
  const kept = rows.find((r) => r[0] === 'Jun 21')
  assert.ok(gone && kept, 'both rows render')
  assert.ok(/no longer retained/i.test(gone.join(' ')), 'the removed-photo row is marked')
  assert.ok(!/no longer retained/i.test(kept.join(' ')), 'a retained photo adds no marker')
})

Deno.test('R-13 item 6 — the photos appendix NAMES the removed incidents, and its count is their count', () => {
  const b = base()
  const html = renderReport(
    base({
      incidentPhotos: [
        {
          eventId: 'kept', type: 'vomit', occurredAt: '2026-06-21T14:00:00Z', dataUri: 'data:image/jpeg;base64,AAAA',
          storagePath: 'pet/kept/1.jpg', occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null,
          notes: null, safety: null,
          phenotype: { kind: 'vomit', status: 'completed', colour: 'yellow', contentsCategory: 'bile', consistency: 'foamy', bloodPresent: null, foreignPresent: null, foreignNote: null, bristol: null, stoolColour: null, stoolBlood: null, mucusPresent: null, edited: false },
        },
      ],
      incidentPhotosRemoved: [
        { eventId: 'g1', type: 'vomit', occurredAt: '2026-06-20T14:00:00Z' },
        { eventId: 'g2', type: 'diarrhea', occurredAt: '2026-06-12T09:00:00Z' },
      ],
    }),
  )
  const t = plain(html)
  assert.ok(/2 further incidents/.test(t), 'the count still leads')
  assert.ok(/Jun 20/.test(t) && /Jun 12/.test(t), 'and each one is dated, so a vet can join it to appendix A')
  // The types use the report's own clinical labels, so the disclosure reads in the same
  // vocabulary as the appendix A rows a vet is about to join it to.
  assert.ok(/Vomiting Jun 20/.test(t), 'the vomiting incident, by its report label')
  assert.ok(/Loose stool Jun 12/.test(t), 'and the loose stool by its own')
})

Deno.test('R-13 item 6 — no removed photo, no disclosure and no marker', () => {
  const b = base()
  const html = renderReport(
    base({
      provenance: { ...b.provenance, totalSymptomIncidents: 1, symptomLog: [logEntry({ type: 'vomit', occurredAt: '2026-06-21T14:00:00Z' })] },
      incidentPhotosRemoved: [],
    }),
  )
  assert.ok(!/no longer retained/i.test(plain(html)), 'a quiet record gains nothing')
})

// ── R-13 items 7 + 8 — the empty appendix D, and the un-lettered table's address ───────

Deno.test('R-13 item 7 — an empty appendix D is the sentence, with no table around it', () => {
  const html = renderReport(base({ medications: [], unlinkedMedications: [] }))
  const start = html.indexOf('Appendix D — Medication log')
  assert.ok(start > -1, 'appendix D still renders')
  const section = html.slice(start, html.indexOf('</section>', start))
  assert.ok(!/<table>/.test(section), 'no five-column header over an empty body')
  assert.ok(!/colspan="5"/.test(section), 'and no placeholder row')
  // The sentence and its caveat survive: the absence is what a vet needs told, and the
  // B-494 rule is that a zone the report teaches a reader to scan may not let its own
  // silence stand as a finding.
  const t = plain(section)
  assert.ok(/No prescription medication is recorded in this window/.test(t))
  assert.ok(/This lists only what the owner entered in Culprit/.test(t))
  // Said ONCE — the sub-head and the placeholder row used to carry the same sentence.
  assert.equal((t.match(/No prescription medication is recorded in this window/g) ?? []).length, 1)
})

Deno.test('R-13 item 7 — a populated appendix D still gets its table', () => {
  const html = renderReport(base({ medications: [med({})] }))
  const start = html.indexOf('Appendix D — Medication log')
  const section = html.slice(start, html.indexOf('</section>', start))
  assert.ok(/<table>/.test(section) && /Doses logged/.test(section), 'the table is untouched where there is data')
})

Deno.test('R-13 item 8 — the divider says where the un-lettered lifetime table sits', () => {
  const html = renderReport(
    base({
      medicationHistory: { entries: [mhEntry({ drugName: 'Metronidazole' })], sinceDay: '2026-04-01' },
    }),
  )
  const divider = plain(html.slice(html.indexOf('End of clinical summary'), html.indexOf('Appendix A —')))
  assert.ok(/medication history \(lifetime\)/.test(divider), 'the table is still named in the contents line')
  assert.ok(/un-lettered/.test(divider), 'and the reader is told it carries no letter')
  assert.ok(/before D|with D|D's sheet/.test(divider), 'and where to find it')
})

// ── R-13 item 9 (Dr. Chen) — a uniform confidence column, collapsed only where it is SAFE ──
//
// On the clean fixture appendix A prints `seen` seventeen times: a column with one value
// carries no information, and principle 6 calls that decoration on the document's most
// scanned sheet. But the issue's default — "when every row shares one tag, say it once and
// drop the per-row tag" — is unsafe as stated, because a BARE time reads as an exact one.
// That default reading is true of a uniform `seen` column and false of every other: a record
// logged entirely before B-010 is uniformly `unspecified`, and dropping its tags would turn a
// column of times nobody vouched for into a column of witnessed minutes. So the collapse is
// scoped to `seen`, the one class whose fallback reading is correct.

function appendixASection(html: string): string {
  const i = html.indexOf('Appendix A — Symptom event log')
  return html.slice(i, html.indexOf('</table>', i))
}

const seenRow = (day: string) => logEntry({ eventId: `e${day}`, type: 'vomit', occurredAt: `2026-06-${day}T14:00:00Z`, occurredAtConfidence: 'witnessed' })

Deno.test('R-13 item 9 — an all-witnessed column says it once and drops seventeen chips', () => {
  const b = base()
  const rows = ['10', '11', '12'].map(seenRow)
  const html = renderReport(
    base({ provenance: { ...b.provenance, symptomLog: rows, totalSymptomIncidents: rows.length } }),
  )
  const section = appendixASection(html)
  const body = section.slice(section.indexOf('<tbody>'))
  assert.equal((body.match(/class="conf">seen</g) ?? []).length, 0, 'no per-row chip')
  const pre = plain(section.slice(0, section.indexOf('<table>')))
  assert.ok(/every time below was witnessed/i.test(pre), 'the preamble states it once instead')
  // And the tag gloss goes with the tags — a legend for a chip the sheet no longer prints is
  // the dangling reference this document keeps paying for.
  assert.ok(!/Time tags:/.test(pre), 'no vocabulary note for a vocabulary with nothing in it')
})

Deno.test('R-13 item 9 — a uniformly UNSPECIFIED column keeps every chip', () => {
  // The falsification that scoped this: these times were never vouched for, and a bare
  // column of them reads as witnessed. Silence here is the reassuring direction.
  const b = base()
  // `logEntry` defaults the confidence with `??`, so a null has to be applied after it —
  // which is the shape a pre-B-010 row actually has.
  const rows = ['10', '11', '12'].map((d) => ({
    ...logEntry({ eventId: `u${d}`, type: 'vomit', occurredAt: `2026-06-${d}T14:00:00Z` }),
    occurredAtConfidence: null,
  }))
  const html = renderReport(
    base({ provenance: { ...b.provenance, symptomLog: rows, totalSymptomIncidents: rows.length } }),
  )
  const section = appendixASection(html)
  const body = section.slice(section.indexOf('<tbody>'))
  assert.equal((body.match(/class="conf">unspecified</g) ?? []).length, 3, 'every row keeps its tag')
  assert.ok(/Time tags:/.test(plain(section)), 'and the gloss that defines it')
})

Deno.test('R-13 item 9 — a MIXED column keeps every chip, including the witnessed ones', () => {
  const b = base()
  const rows = [
    seenRow('10'),
    logEntry({ eventId: 'est', type: 'vomit', occurredAt: '2026-06-11T14:00:00Z', occurredAtConfidence: 'estimated' }),
    seenRow('12'),
  ]
  const html = renderReport(
    base({ provenance: { ...b.provenance, symptomLog: rows, totalSymptomIncidents: rows.length } }),
  )
  const body = appendixASection(html).slice(appendixASection(html).indexOf('<tbody>'))
  assert.equal((body.match(/class="conf">seen</g) ?? []).length, 2, 'the witnessed rows keep their tag')
  assert.equal((body.match(/class="conf">est</g) ?? []).length, 1, 'so the estimated one is visible BY CONTRAST')
})

Deno.test('R-13 item 1 — no report points at appendix E when appendix E does not render', () => {
  // The dangling-reference class this document keeps paying for, asserted as an EMPTY SET
  // (C-32): every call site of `mealsAppendixPointer` is gated today, and this is what reds
  // if a future one is not. The helper itself cannot refuse — a caller would print "Meals
  // are ." — so the guard lives here, over the rendered document.
  const b = base()
  const html = renderReport(
    base({
      diet: { ...b.diet, mealItems: [], mealCompletion: null },
      provenance: { ...b.provenance, intakeLog: [], intakeLogScope: null, intakeLogHiddenOlder: 0 },
    }),
  )
  assert.ok(!/Appendix E — Meals/.test(html), 'the appendix is genuinely absent on this record')
  assert.ok(!/grouped by food in appendix/.test(plain(html)), 'and nothing points a reader at it')
  // The letterhead's own range must not advertise an E either.
  assert.ok(!/appendices A&ndash;E/.test(html), 'the orient line stops at the last appendix that renders')
})

Deno.test('R-3 — across a window that spans New Year, the row\'s two dates agree about the year', () => {
  // THE PAIRING HAZARD `fmtLocalDayScoped`'s own header warns about: it stamps against the
  // WINDOW's year, and appendix A's Date column is always bare. On a 90-day window opened in
  // November — which the fallback cascade produces every winter — an event in the earlier
  // year got a bare "Dec 15" beside a stamped "Dec 17, 2025", and the bare one inherits the
  // window's 2026. Read literally that is again a row logged before it happened.
  const rows = appendixARows(
    chicagoReport(
      [
        logEntry({
          type: 'vomit',
          occurredAt: atLocal(CHI, '2025-12-15', '19:00'),
          loggedAt: atLocal(CHI, '2025-12-17', '08:30'),
        }),
      ],
      { startDate: '2025-11-20', endDate: '2026-02-18' },
    ),
  )
  assert.equal(rows[0][0], 'Dec 15', 'the Date column is bare, as it always has been')
  assert.equal(rows[0][3], 'Dec 17, 08:30', 'so its partner must not stamp a year the pair does not need')
})

Deno.test('R-3 — a log that crosses into the next year still stamps it', () => {
  // The case CUL-977 point 3 actually raises: logging postdates the window end. Here the two
  // dates genuinely disagree about the year, so the year is what disambiguates them — and the
  // stamped later date implies the bare earlier one, correctly.
  const rows = appendixARows(
    chicagoReport(
      [
        logEntry({
          type: 'vomit',
          occurredAt: atLocal(CHI, '2026-12-30', '18:00'),
          loggedAt: atLocal(CHI, '2027-01-02', '08:15'),
        }),
      ],
      { startDate: '2026-11-01', endDate: '2026-12-31' },
    ),
  )
  assert.equal(rows[0][0], 'Dec 30')
  assert.equal(rows[0][3], 'Jan 2, 2027, 08:15')
})

// ── Adversarial review, findings 2 + 9 — the home-food marker's other two branches ──────

Deno.test('CUL-292 — a home food NEVER gets the "nothing else on the label" all-clear', () => {
  // `kind` reached only the incomplete branch, so a home food whose panel text the owner DID
  // capture printed the D10 all-clear on appendix B while appendix C, on the next sheet, said
  // the same feedings have "no ingredient panel at all". One document, two opposite claims
  // about one food, and appendix B took the reassuring side — which render.ts's own rule
  // ("no negative form except the one D10 licenses") exists to forbid.
  const b = base()
  const html = renderReport(
    base({
      diet: {
        ...b.diet,
        mealItems: [
          mealItem({
            foodLabel: 'Deli chicken breast',
            primaryProtein: 'chicken',
            proteinSet: pset(['chicken'], { complete: true }),
            format: 'human_food',
            count: 3,
          }),
        ],
      },
    }),
  )
  const row = text(appendixBRow(html, 'Proteins in the diet'))
  assert.ok(/Deli chicken breast/.test(row), 'the food is named')
  assert.ok(!/nothing else on the label/.test(row), 'no label claim over a food that has no label')
  assert.ok(/nothing else recorded/.test(row), 'the true claim is about the record instead')
})

Deno.test('CUL-292 — a packaged food with a read panel keeps the label claim', () => {
  const b = base()
  const html = renderReport(
    base({
      diet: {
        ...b.diet,
        mealItems: [mealItem({ foodLabel: 'Acme Duck', proteinSet: pset(['duck'], { complete: true }), format: 'dry_kibble' })],
      },
    }),
  )
  assert.ok(/nothing else on the label/.test(text(appendixBRow(html, 'Proteins in the diet'))))
})

Deno.test('CUL-292 — the home-food legend does not render over rows that show no marker', () => {
  // The gate asked for `!complete`, but `proteinSetCell` returns an EMPTY cell when no protein
  // was captured at all — so a bare table-scrap log produced the legend defining a marker the
  // sheet never printed. That is the dangling reference the gate's own comment cites.
  const b = base()
  const html = renderReport(
    base({
      provenance: {
        ...b.provenance,
        confounders: [
          conf({ eventId: 'h1', foodLabel: 'Chicken off my plate', primaryProtein: null, proteinSet: pset([]), format: 'human_food', foodType: 'other' }),
        ],
      },
    }),
  )
  const i = html.indexOf('Appendix C —')
  const sub = text(html.slice(i, html.indexOf('</p>', html.indexOf('appx-sub', i))))
  assert.ok(!/Home-prepared food has no panel/.test(sub), 'no legend for a marker no row carries')
})

// ── CUL-981 — the vomit colour tally ──────────────────────────────────────────
//
// Each test below reproduces a finding the v15 cold read made on the real artifact, and each was
// RED against the render that shipped it.

/**
 * The rendered document sliced to one region, because a no-reassurance scan over a WHOLE report
 * measures the wrong thing (C-36). The glossary says "a clear photo is never an all-clear" and the
 * vomit caveat says "This is not a clearance" — both are the rule, and a document-wide word scan
 * reads them as violations of it. The assertion belongs where the new copy is.
 */
function sliceSection(html: string, heading: string): string {
  const i = html.indexOf(heading)
  assert.ok(i >= 0, `section not found: ${heading}`)
  const rest = html.slice(i)
  const end = rest.indexOf('<h2', 1)
  const out = end > 0 ? rest.slice(0, end) : rest
  assert.ok(out.length > 40, 'the slice is non-empty — a scan over nothing passes everything')
  return plain(out)
}


Deno.test('CUL-981 — the vomit box tallies colour beside the blood caveat, over LEGIBLE READS', () => {
  const t = plain(
    renderReport(
      base({
        vomitPhenotype: emptyPhenotype({
          totalIncidents: 9, withAnalysis: 8, states: { completed: 6, uncertain: 1, failed: 1, pending: 0 },
          assessedCount: 6, colourDistribution: { tan: 4, green: 1, yellow: 1 },
        }),
      }),
    ),
  )
  assert.ok(
    /Colour, from the 6 reads where it was legible: tan ×4 · green ×1 · yellow ×1\./.test(t),
    'a tally, with counts AND its own denominator — never one the reader has to reconstruct by summing',
  )
  // THE DENOMINATOR IS THE NEIGHBOURING SENTENCE'S, and it is reads, not incidents.
  assert.ok(/Across all 9 vomiting incidents; 6 have a legible AI read/.test(t))
  assert.ok(!/Colour[^.]*9 (reads|incidents)/.test(t), 'the tally is never spoken over the incident count')
  // NOT A RANKING. `predominantBit`'s "was most often" is a claim about which reading dominates,
  // and this field is explicitly forbidden from ranking, interpreting or flagging.
  assert.ok(!/Colour, from the.*was most often/.test(t))
  assert.ok(!/bile present in/i.test(t), 'green is not re-read as a bile finding')
  // The blood caveat is untouched and still refuses to clear.
  assert.ok(/This is not a clearance/.test(t))
})

Deno.test('CUL-981 — a page of one colour is a tally and never an all-clear', () => {
  const t = sliceSection(
    renderReport(
      base({
        vomitPhenotype: emptyPhenotype({
          totalIncidents: 6, withAnalysis: 6, states: { completed: 6, uncertain: 0, failed: 0, pending: 0 },
          assessedCount: 6, colourDistribution: { tan: 6 }, bloodPresent: [], foreignPresent: [],
        }),
      }),
    ),
    'Vomit characteristics',
  )
  assert.ok(/Colour, from the 6 reads where it was legible: tan ×6\./.test(t), 'the tally renders')
  for (const reassurance of [/normal colour/i, /unremarkable/i, /reassuring/i, /no concern/i, /all clear/i, /\bnothing to worry\b/i]) {
    assert.ok(!reassurance.test(t), `a page of tan is not an all-clear: ${reassurance}`)
  }
  assert.ok(/This is not a clearance/.test(t), 'and the caveat beside it still says so')
})

Deno.test('CUL-981 — no legible read means no colour line at all', () => {
  const some = plain(renderReport(base({ vomitPhenotype: emptyPhenotype({ colourDistribution: { tan: 2 } }) })))
  assert.ok(/Colour, from the 2 reads where it was legible: tan ×2\./.test(some), 'the line renders when there is something to tally')
  // PER-FIELD LEGIBILITY, NOT PER-READ: eight assessed reads, two with a legible colour. The
  // tally's denominator is its own, so the counts still sum to it and nothing goes silent.
  assert.ok(/8 have a legible AI read/.test(some), 'and it does not borrow the assessed denominator')
  const one = plain(renderReport(base({ vomitPhenotype: emptyPhenotype({ colourDistribution: { tan: 1 } }) })))
  assert.ok(/Colour, from the one read where it was legible: tan ×1\./.test(one), 'never "the 1 reads"')
  const none = plain(renderReport(base({ vomitPhenotype: emptyPhenotype({ colourDistribution: {} }) })))
  assert.ok(!/Colour, from the/.test(none), 'and is absent rather than empty when there is not')
})

Deno.test('CUL-981 — the edited-read rule is stated once, in the wording the box already uses', () => {
  const t = plain(renderReport(base({ vomitPhenotype: emptyPhenotype() })))
  assert.ok(
    /a read the owner has corrected counts the same as one they have not/.test(t),
    'an owner-corrected read counts the same — the rule contents and consistency already follow',
  )
  assert.equal(t.split('owner has corrected').length - 1, 1, 'said once, not restated in different words')
  assert.ok(/owner-reviewable/.test(t), 'and the existing framing is unchanged')
})

Deno.test('CUL-981 — a black read is a colour, never the blood caveat’s own word', () => {
  const t = sliceSection(
    renderReport(
      base({
        vomitPhenotype: emptyPhenotype({
          totalIncidents: 4, withAnalysis: 4, states: { completed: 4, uncertain: 0, failed: 0, pending: 0 },
          assessedCount: 4, colourDistribution: { tan: 3, black_coffee_ground: 1 },
        }),
      }),
    ),
    'Vomit characteristics',
  )
  assert.ok(/Colour, from the 4 reads where it was legible: tan ×3 · black ×1\./.test(t), 'the value renders as a colour')
  // THE CAVEAT OWNS THAT TERM. "Coffee-ground" is not a colour word in veterinary usage, it is THE
  // descriptor for digested blood — and the box on the same line of sight uses it while asserting
  // "Not seen". A vet reading both in one pass gets a contradiction and resolves it as either
  // missed blood or two untrustworthy fields. The authoritative blood field stays the sole route.
  assert.equal(t.split('coffee-ground').length - 1, 1, 'the term appears once, in the blood caveat')
  assert.ok(/digested \(coffee-ground\) blood photographs poorly/.test(t), 'and that once is the caveat')
  assert.ok(/Not seen/.test(t), 'which still refuses to clear')
})

// ── CUL-1041 §5.1 — the window-move clause, branch by branch ─────────────────
//
// The end-to-end guard lives in `trial.test.ts`, where a real `targetDurationDays`
// mutation drives `assembleReport` → `renderReport`. These cover what an end-to-end
// fixture cannot reach without writing a corrupt row: the degenerate shapes of the
// three columns, and where on the page the sentence lands.
//
// THE FIXTURE IS BUILT BY THE PRODUCTION DERIVATION, never by hand. A hand-written
// `windowChange` would let this file and `trial.ts` drift apart silently, and the
// assertion would then be about a shape production never produces (C-35) — which is
// exactly how the transcribed-not-executed pass that preceded this feature went wrong.
//
// ⚠️ AND THE FIXTURE'S OWN SPAN IS LOAD-BEARING (`adversarial-reviewer`, 2026-09-17).
// The first cut of this block stamped every move on 2026-07-02 against a block whose
// `dayCounter` is 45 and whose trial therefore ends 2026-06-21 — so four of the five
// tests rendered "day 45 of 84 … (day 56)", a trial day eleven days past the page's own
// stated position, and one asserted that string as CORRECT. A fixture that hands the
// derivation a move outside the trial it belongs to is not a stricter test; it is a test
// of a shape production cannot make (C-35). `TRIAL_*` below are derived from
// `trialBlockFixture`'s own defaults so they cannot drift from it.

/** `trialBlockFixture`'s defaults, named once so a stamp can be placed INSIDE the span. */
const TRIAL_START = '2026-05-08'
const TRIAL_ELAPSED = 45
const startIdxOf = (key: string): number => Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000)
/** A stamp on trial day N, as an instant inside that local day. */
const onTrialDay = (n: number): string =>
  `${new Date((startIdxOf(TRIAL_START) + n - 1) * 86_400_000).toISOString().slice(0, 10)}T14:00:00Z`

function windowSnap(
  wcOver: {
    targetDurationDays: number
    targetDurationDaysInitial?: number | null
    targetDurationSetAt?: string | null
    targetDurationVetDirected?: boolean | null
  },
  trialDaysElapsed = TRIAL_ELAPSED,
): ReportSnapshot {
  const snap = base()
  const wc = deriveWindowChange(
    {
      targetDurationDays: wcOver.targetDurationDays,
      targetDurationDaysInitial: wcOver.targetDurationDaysInitial ?? null,
      targetDurationSetAt: wcOver.targetDurationSetAt ?? null,
      targetDurationVetDirected: wcOver.targetDurationVetDirected ?? null,
    },
    startIdxOf(TRIAL_START),
    trialDaysElapsed,
    'America/New_York',
  )
  snap.trial = trialBlockFixture({
    targetDurationDays: wcOver.targetDurationDays,
    windowChange: wc,
  })
  return snap
}

Deno.test('CUL-1041 — the window change is its OWN row, and it comes after the trial\u2019s own', () => {
  // The fourth cold read's finding, and the first structural one: three rounds of copy
  // repair fought a LAYOUT problem. `identity.join(' ')` put the change and
  // `Trial directed by <name>` in one unbroken paragraph nine words apart, disclaimer
  // first, so the name arrived last and back-filled the slot the disclaimer opened.
  const page = plain(renderReport(windowSnap({
    targetDurationDays: 84,
    targetDurationDaysInitial: 56,
    targetDurationSetAt: onTrialDay(26),
  })))
  const dayPhrase = page.indexOf('day 45 of 84')
  const started = page.indexOf('Started May 8')
  const clause = page.indexOf('Window extended from 56 days')

  // It still follows the number it qualifies \u2014 but now as a labelled row of its own,
  // AFTER the identity row has finished, so the record's limit is the reader's last
  // state on attribution rather than the vet's name.
  assert.ok(dayPhrase >= 0 && clause > dayPhrase, 'the clause follows the number it qualifies')
  assert.ok(started > 0 && clause > started, 'the identity row completes first')
  assert.match(page, /Window change/, 'and the change carries its own label')

  // Day 26 of a 45-day span: a real position, and the trial has not passed its 56-day
  // original window, so no overrun sentence.
  assert.match(page, /Window extended from 56 days; last moved Jun 2 \(day 26\)\./)
  assert.ok(!/past that original window/.test(page))
})

Deno.test('CUL-1041 — a stamp that predates the trial names the date and NO trial day', () => {
  // `trialDayCounter` floors at 1, so taking it unconditionally would print "day 1"
  // for a move made before the trial began — a confident wrong number where the honest
  // output is silence about that half.
  const page = plain(renderReport(windowSnap({
    targetDurationDays: 84,
    targetDurationDaysInitial: 56,
    targetDurationSetAt: '2026-05-01T11:00:00Z', // a week before started_at
  })))
  assert.match(page, /Window extended from 56 days; last moved May 1\./)
  assert.ok(!/\(day 1\)/.test(page), 'never floors a pre-trial stamp to day 1')
})

Deno.test('CUL-1041 — a stamp PAST the trial\u2019s own span names no trial day either', () => {
  // THE OTHER END, which the first cut left unguarded (`adversarial-reviewer`): a stamp
  // outside the trial has no trial day to name, and printing one produced "day 390" on a
  // trial whose counter is 56 and a move dated a week into the future on a device whose
  // clock runs fast. C-37's tell — if you reach outside the window, check you reach for
  // the accusing number too.
  for (const [label, stamp] of [
    ['just past the span', onTrialDay(TRIAL_ELAPSED + 1)],
    ['far past it', '2027-06-01T14:00:00Z'],
  ] as const) {
    const page = plain(renderReport(windowSnap({
      targetDurationDays: 84,
      targetDurationDaysInitial: 56,
      targetDurationSetAt: stamp,
    })))
    assert.match(page, /Window extended from 56 days; last moved [A-Z][a-z]+ \d+(, \d{4})?\./, label)
    assert.ok(!/\(day \d+\)/.test(page), `${label}: no trial day is invented`)
  }
  // And the LAST day of the span is still inside it — the bound is not off by one.
  const edge = plain(renderReport(windowSnap({
    targetDurationDays: 84,
    targetDurationDaysInitial: 56,
    targetDurationSetAt: onTrialDay(TRIAL_ELAPSED),
  })))
  assert.match(edge, new RegExp(`\\(day ${TRIAL_ELAPSED}\\)`))
})

Deno.test('CUL-1041 — an unparseable stamp still discloses the move', () => {
  // A corruption, not a state any write path produces. The clause degrades rather
  // than disappearing: hiding the move is the defect the sentence exists to close,
  // and a floor may only ever move toward disclosing more.
  const page = plain(renderReport(windowSnap({
    targetDurationDays: 84,
    targetDurationDaysInitial: 56,
    targetDurationSetAt: 'not-a-timestamp',
  })))
  assert.match(page, /Window extended from 56 days; last moved on a date the record does not hold\./)
})

Deno.test('CUL-1041 — a prior window that is not a whole positive number is "not recorded"', () => {
  // `target_duration_days_initial` is nullable with no CHECK and is backfilled from a
  // sibling column, so the render must not be the first thing that assumes its range.
  //
  // 0.5 IS IN THIS LIST BECAUSE IT WAS THE HOLE (`adversarial-reviewer`, 2026-09-17):
  // the guard range-checked the raw value and truncated afterwards, so a half-day passed
  // `> 0` and printed "extended from 0 days" — the exact output the guard exists to
  // prevent. The fix is order, and this row is what keeps the order.
  for (const bad of [0, -14, 0.5]) {
    const page = plain(renderReport(windowSnap({
      targetDurationDays: 84,
      targetDurationDaysInitial: bad,
      targetDurationSetAt: onTrialDay(26),
    })))
    assert.match(page, /Window changed; last moved Jun 2 \(day 26\)\./, `initial=${bad}`)
    assert.ok(!/from 0 days|from -14 days|from 0\.5 days/.test(page), `initial=${bad} is not printed`)
  }
})

Deno.test('CUL-1041 — no provenance means no sentence, and the page is otherwise identical', () => {
  // The absence-equivalence shape (C-36): a trial whose window never moved must render
  // byte-for-byte what it rendered before this feature existed. `windowChange: null` is
  // the only state every pre-068 row and every unextended trial can be in.
  const withNull = renderReport(windowSnap({ targetDurationDays: 84 }))
  const snapNoField = base()
  snapNoField.trial = trialBlockFixture({ targetDurationDays: 84 })
  assert.equal(withNull, renderReport(snapNoField))
  assert.ok(!/Window (extended|shortened|changed)/.test(plain(withNull)))
})
