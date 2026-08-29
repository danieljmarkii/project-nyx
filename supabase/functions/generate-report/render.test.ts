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
import { renderReport } from './render.ts'
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
  ConfounderExposure,
  IncidentPhoto,
  ProteinSetView,
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
    trialDaysElapsed:
      over.trialDaysElapsed ??
      (over.dayCounter ?? 45) +
        (over.trialDaysOutsideRange?.after ?? 0),
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
      outOfWindowBefore: 0,
      outOfWindowAfter: 0,
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
    },
    provenance: {
      ownerReported: true,
      totalSymptomIncidents: 0,
      estimatedOrWindowCount: 0,
      deletedExcluded: true,
      symptomLog: [],
      intakeLog: [],
      intakeLogHiddenOlder: 0,
      intakeLogScope: null,
      confounders: [],
      proteinExposureTally: {}, proteinUnknownCount: 0,
      conditions: [],
    },
    incidentPhotos: [],
    incidentPhotosAnalyzedNoRetained: 0,
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
    expectedDoses: 90,
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
        ownerReported: true, totalSymptomIncidents: 0, estimatedOrWindowCount: 0, deletedExcluded: true,
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
        mealCompletion: { ratedMeals: 28, finishedMeals: 3, rate: 0.107, intakeMode: 'some' },
        mealItems: [
          { foodLabel: 'Instinct Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), count: 18, firstDate: '2026-05-14', lastDate: '2026-07-03', intakeMode: 'some', intakeBreakdown: [{ rating: 'some', count: 18 }] },
          { foodLabel: 'Fancy Feast Salmon', primaryProtein: 'salmon', proteinSet: pset(['salmon']), count: 10, firstDate: '2026-05-20', lastDate: '2026-07-01', intakeMode: 'most', intakeBreakdown: [{ rating: 'most', count: 10 }] },
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
  assert.ok(/Also fed as meals:/.test(text) && /itemised in appendix&nbsp;E/.test(html), 'page-1 feeding line names foods + cites appendix E')
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
        mealCompletion: { ratedMeals: 28, finishedMeals: 3, rate: 0.1, intakeMode: 'some' },
        mealItems: [
          { foodLabel: 'Instinct Original Real Chicken', primaryProtein: 'chicken', proteinSet: pset(['chicken']), count: 18, firstDate: '2026-05-14', lastDate: '2026-07-03', intakeMode: 'some', intakeBreakdown: [{ rating: 'some', count: 18 }] },
          { foodLabel: 'Instinct Limited Ingredient Turkey', primaryProtein: 'turkey', proteinSet: pset(['turkey']), count: 10, firstDate: '2026-05-20', lastDate: '2026-07-01', intakeMode: 'some', intakeBreakdown: [{ rating: 'some', count: 10 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
  assert.ok(text.includes('82 of 90 doses'), 'given/expected denominators')
  assert.ok(text.includes('41 of 45 days'), 'day denominator')
  assert.ok(text.includes('8 unconfirmed'), 'unconfirmed kept distinct (not folded into given)')
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

// ── §5.8 no load-bearing colour + self-contained + print CSS ───────────────────────

Deno.test('print-color-adjust on fills + @page + zero third-party subresources', () => {
  const html = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  assert.ok(html.includes('print-color-adjust:exact'), 'fills survive a B&W clinic printer')
  assert.ok(html.includes('@page'), 'print page CSS present')
  assert.ok(!/https?:\/\//.test(html), 'no external subresource can leak the token in a Referer')
})

Deno.test('proportion bars use a grayscale ramp only (no load-bearing colour)', () => {
  const html = renderReport(base({ vomitPhenotype: emptyPhenotype() }))
  assert.ok(html.includes('#1a1c22'), 'darkest gray used for the leading segment')
  // No saturated wellness/alarm colours anywhere in the artifact.
  assert.ok(!/#[0-9a-f]*(00ff00|ff0000)/i.test(html))
  assert.ok(!/(green|crimson|tomato)\b/i.test(html))
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
        mealCompletion: { ratedMeals: 80, finishedMeals: 78, rate: 0.975, intakeMode: 'all' },
        mealItems: [],
        treats: { count: 7, distinctItems: 2 },
        humanFood: { count: 3, days: 3, items: [{ date: '2026-05-19', label: 'Roast chicken' }] },
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
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null },
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null },
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
        { kind: 'medication', label: 'Prednisolone', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: null },
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-08', bucketIndex: 1, ongoing: false, endInWindow: null },
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
        { kind: 'free_fed', label: 'Royal Canin Weight', startDate: null, bucketIndex: null, ongoing: true, endInWindow: null },
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
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-03-01', bucketIndex: null, ongoing: true, endInWindow: '2026-05-20' },
        // Standing arrangement, start unrecorded, still active → "ongoing, start not recorded".
        { kind: 'free_fed', label: 'Duck bowl', startDate: null, bucketIndex: null, ongoing: true, endInWindow: null },
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
  // Both carry the range tag — the artifact rendered these as bare precise-looking points.
  const rangeTags = html.match(/<span class="conf">range<\/span>/g) ?? []
  assert.ok(rangeTags.length >= 2, 'both one-sided windows are tagged range')
})

Deno.test('B-010 null confidence → explicit "unspecified" tag, and the legend defines it', () => {
  const legacy = logEntry({
    type: 'vomit',
    occurredAt: '2026-06-21T21:06:00Z',
    occurredAtConfidence: null,
  })
  const html = renderReport(
    base({
      provenance: { ...base().provenance, symptomLog: [legacy], totalSymptomIncidents: 1 },
    }),
  )
  assert.ok(html.includes('<span class="conf">unspecified</span>'), 'null confidence is tagged, not bare')
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
      mealCompletion: { ratedMeals: 50, finishedMeals: 48, rate: 0.96, intakeMode: 'all' },
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
      mealCompletion: { ratedMeals: 25, finishedMeals: 0, rate: 0, intakeMode: 'some' },
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
      mealCompletion: { ratedMeals: 25, finishedMeals: 5, rate: 0.2, intakeMode: 'some' },
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
  assert.ok(/Clinical summary: this page/.test(html), 'orientation line on page 1')
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
    concurrentChanges: [{ kind: 'medication', label: 'Metronidazole', startDate: '2026-04-20', bucketIndex: 2, ongoing: false, endInWindow: null }],
  })
  const html = renderReport(snap)
  assert.ok(!html.includes('▲'), 'no triangle spike glyph on the chart')
  assert.ok(/start &middot;/.test(html), 'neutral "start ·" marker label')
  assert.ok(/dashed vertical marks the <b>week<\/b> a diet, medication, or supplement started/i.test(html), 'chart legend line explains the marker is week-granular (B-496)')
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
  assert.ok(/except coverage &amp; off-diet, over the trial&rsquo;s own range/.test(html), 'the heading flags that coverage & off-diet depart from the window')
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
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-02', bucketIndex: 0, ongoing: false, endInWindow: null },
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-04', bucketIndex: 0, ongoing: false, endInWindow: null },
      ],
    }),
  )
  // The second start is no longer invisible: the collapsed marker carries a count + the earliest date.
  assert.ok(/2 starts &middot; May 2/.test(html), 'a two-start week is marked "2 starts · <earliest>", never silently one')
  // Exactly one dashed vertical for that week (both starts share it — the count says so).
  assert.equal((html.match(/class="mark"/g) ?? []).length, 1, 'one vertical for the shared week')
  // The legend now promises the WEEK, not the day (the mark is bucket-granular).
  assert.ok(/marks the <b>week<\/b> a diet, medication, or supplement started/.test(html), 'legend is honest about week granularity')
})

Deno.test('B-496 — a lone start still reads "start · <date>" (single-marker behaviour unchanged)', () => {
  const html = renderReport(
    base({
      symptoms: [aggregate({ type: 'vomit', count: 2, weeklyBuckets: [1, 1], bucketStartDates: ['2026-05-01', '2026-05-08'], windowDays: 14 })],
      concurrentChanges: [{ kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-09', bucketIndex: 1, ongoing: false, endInWindow: null }],
    }),
  )
  assert.ok(/start &middot; May 9/.test(html), 'a single start keeps its exact-date label')
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
      med({ drugName: 'Metronidazole', status: 'completed', endedAt: '2026-05-26', startedAt: '2026-05-12', adherenceState: 'not_tracked', givenDoses: 0, partialDoses: 0, daysWithDose: 0, unconfirmedDoses: 0, expectedDoses: null }),
    ],
    symptoms: [aggregate({ type: 'vomit', count: 3 })],
  })
  const html = renderReport(snap)
  // The end date appears (not a bare "since May 12" that reads as still-active), on BOTH surfaces.
  assert.ok(/May 12 &ndash; May 26 \(course complete\)/.test(html), 'completed course shows its date span + "course complete"')
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
      incidentPhotosAnalyzedNoRetained: 3,
    }),
  )
  assert.ok(html.includes('Appendix E — Incident photos'))
  assert.ok(/photo is no longer retained \(removed by the owner\)/.test(html), 'the divergence is disclosed, not silent')
  assert.ok(/read.{0,20}remain.{0,20}appendix/i.test(html), 'points the vet to the reads that remain in Appendix A')
  assert.ok(/with a retained photo/.test(html), 'the card lead is scoped to retained photos, not an absolute "every photographed"')
})

Deno.test('PR7 render — Appendix E STILL renders (disclosure only, no grid) when every photo was removed', () => {
  const html = renderReport(base({ incidentPhotos: [], incidentPhotosAnalyzedNoRetained: 2 }))
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
  assert.ok(/>3<\/span> doses given Jun 28/.test(html), 'the administered count + span render on page 1')
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
          { foodLabel: 'Marketing Duck', primaryProtein: 'duck', proteinSet: pset(['duck']), count: 12, firstDate: '2026-06-01', lastDate: '2026-06-20', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 12 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
          { foodLabel: 'Real Duck', primaryProtein: 'duck', proteinSet: pset(['duck'], { complete: true }), count: 12, firstDate: '2026-06-01', lastDate: '2026-06-20', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 12 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
          { foodLabel: 'Duck Dinner', primaryProtein: 'duck', proteinSet: pset(['duck', 'chicken', 'salmon'], { complete: true }), count: 4, firstDate: '2026-06-01', lastDate: '2026-06-04', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 4 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
          { foodLabel: 'Unknown Food', primaryProtein: null, proteinSet: pset([]), count: 3, firstDate: '2026-06-01', lastDate: '2026-06-03', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 3 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
          { foodLabel: 'Acme Duck Formula', primaryProtein: 'duck', proteinSet: pset(['duck', 'chicken'], { complete: true }), count: 2, firstDate: '2026-06-01', lastDate: '2026-06-02', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 2 }] },
          { foodLabel: 'Acme Duck Formula', primaryProtein: 'duck', proteinSet: pset(['duck']), count: 1, firstDate: '2026-06-03', lastDate: '2026-06-03', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 1 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
          { foodLabel: evil, primaryProtein: evil, proteinSet: pset([evil, 'chicken']), count: 1, firstDate: '2026-06-01', lastDate: '2026-06-01', intakeMode: 'all', intakeBreakdown: [{ rating: 'all', count: 1 }] },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
        mealCompletion: { ratedMeals: 38, finishedMeals: 0, rate: 0, intakeMode: 'refused' },
        mealItems: [
          {
            foodLabel: "Hill's z/d",
            primaryProtein: 'chicken',
            proteinSet: pset(['chicken']),
            count: 38,
            firstDate: '2026-06-01',
            lastDate: '2026-06-19',
            intakeMode: 'refused',
            intakeBreakdown: [
              { rating: 'some', count: 4 },
              { rating: 'refused', count: 34 },
            ],
          },
        ],
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
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
      medications: [med({ doseDays: ['2026-06-05', '2026-07-02'], givenDoses: 2, daysWithDose: 2, expectedDoses: null, unconfirmedDoses: 0 })],
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
            tier: 'standard',
            windowDays: 91,
          },
        ],
      }),
    ),
  )
  assert.ok(!/is a floor/.test(observed), 'and NOT a floor when the record actually saw the start')
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
