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
  SymptomLogEntry,
} from './report.ts'

// ── A complete, neutral base snapshot; each test overrides only what it exercises ──
function base(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
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
      ownerName: 'Daniel Mark',
      latestWeight: null,
    },
    clinicalQuestion: { question: 'symptom_monitoring', primarySymptom: null },
    safetyFlags: [],
    weight: { isEmpty: true, latest: null, trend: null },
    atAGlance: {
      primarySymptom: null,
      totalSymptomIncidents: 0,
      windowDays: 91,
      loggedDays: 0,
      trialDaysLogged: null,
      weightState: 'empty',
    },
    symptoms: [],
    vomitPhenotype: null,
    stool: null,
    diet: {
      activeTrial: null,
      freeFed: [],
      intakeNotDirectlyObserved: false,
      mealCompletion: null,
      treats: { count: 0, distinctItems: 0 },
      humanFood: { count: 0, days: 0, items: [] },
    },
    medications: [],
    correlation: { established: [], hasEstablished: false, noThreshold: true, stapleProtein: null, timing: [] },
    concurrentChanges: [],
    provenance: {
      ownerReported: true,
      totalSymptomIncidents: 0,
      estimatedOrWindowCount: 0,
      deletedExcluded: true,
      symptomLog: [],
      confounders: [],
      proteinExposureTally: {},
      conditions: [],
    },
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
  // The document still renders (letterhead + pet name).
  assert.ok(html.includes('>Nyx<'))
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
  assert.ok(html.includes('Vomiting has been ongoing'))
})

Deno.test('present_blood flag → "Possible blood" leads the safety band', () => {
  const flag: SafetyFlag = {
    kind: 'present_blood',
    incidents: [{ eventId: 'v1', occurredAt: '2026-06-18T18:00:00Z', kind: 'coffee_ground' }],
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(html.includes('class="safetyband"'))
  assert.ok(html.includes('Possible blood'))
  assert.ok(/not confirmed/i.test(html), 'owner-reviewable, not confirmed')
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
  }
  const html = renderReport(base({ safetyFlags: [flag] }))
  assert.ok(/health signal/i.test(html))
  assert.ok(/not &ldquo;picky/i.test(html), 'explicitly not picky')
  assert.ok(/hepatic-lipidosis/i.test(html), 'feline window note for a cat')
  // The refused-food trigger must NOT print a bogus "0 consecutive days".
  assert.ok(!/0 consecutive day/i.test(html))
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
        activeTrial: null,
        freeFed: [{ foodLabel: 'Royal Canin Weight', primaryProtein: 'chicken', activeFrom: '2026-05-01', activeUntil: null }],
        intakeNotDirectlyObserved: true,
        mealCompletion: null,
        treats: { count: 0, distinctItems: 0 },
        humanFood: { count: 0, days: 0, items: [] },
      },
    }),
  )
  assert.ok(html.includes('Intake not directly observed'), 'verbatim B-040 string')
})

// ── §5.5 severity blank, never averaged ────────────────────────────────────────────

Deno.test('unrated severity renders blank; a rated one renders x/5; nothing is averaged', () => {
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
        confounders: [],
        proteinExposureTally: {},
        conditions: [],
      },
    }),
  )
  assert.ok(html.includes('3/5'), 'a rated severity shows x/5')
  assert.ok(!/average sever/i.test(html), 'no averaged severity anywhere')
  assert.ok(/never\b.*averaged/i.test(html.replace(/<[^>]*>/g, ' ')), 'legend states severity is never averaged')
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
        confounders: [],
        proteinExposureTally: {},
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
      atAGlance: { primarySymptom: null, totalSymptomIncidents: 0, windowDays: 20, loggedDays: 16, trialDaysLogged: null, weightState: 'trend' },
    }),
  )
  assert.ok(html.includes('polyline'), 'sparkline drawn')
  assert.ok(/trajectory/i.test(html), 'descriptive trajectory framing')
  // No loss VERDICT: descriptive only. (The legend legitimately says "never … an alarm",
  // so match loss-as-a-finding phrasing rather than the bare word "alarm".)
  assert.ok(!/losing weight|weight loss|is (?:worrying|concerning)/i.test(html), 'no loss flag / verdict')
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

Deno.test('stool characteristics render normal vs loose + a present-only blood/mucus note', () => {
  const html = renderReport(base({ stool: { total: 6, normalCount: 4, looseCount: 2, windowDays: 52, loggedDays: 48 } }))
  assert.ok(/Stool characteristics/.test(html))
  assert.ok(/Blood &amp; mucus/.test(html) && /Not reported/.test(html), 'present-only blood/mucus limitation note')
  assert.ok(!/0 of \d/.test(html), 'never a "0 of N"')
})

// ── Coverage: full diet/meds — trial + human food + established association ─────────

Deno.test('diet/meds render an active trial, the human-food confounder line, and an association (never causal)', () => {
  const html = renderReport(
    base({
      clinicalQuestion: { question: 'diet_trial_working', primarySymptom: 'vomit' },
      diet: {
        activeTrial: {
          foodLabel: 'RC Hydrolyzed HP',
          primaryProtein: 'hydrolyzed',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          daysElapsed: 45,
          vetName: 'Dr. Chen',
        },
        freeFed: [],
        intakeNotDirectlyObserved: false,
        mealCompletion: { ratedMeals: 80, finishedMeals: 78, rate: 0.975 },
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
        { kind: 'diet_trial', label: 'RC HP', startDate: '2026-05-08', bucketIndex: 1 },
        { kind: 'medication', label: 'Metronidazole', startDate: '2026-05-08', bucketIndex: 1 },
      ],
    }),
  )
  assert.ok(html.includes('class="nub"'), 'a zero-count week draws a visible nub, not a blank')
  assert.ok(/Reading the trend/.test(html))
  assert.ok(/cannot be attributed/i.test(html), 'GP-0 co-attribution caution')
  assert.ok(html.includes('RC HP') && html.includes('Metronidazole'), 'every concurrent change is named')
})

// ── The document is a complete, standalone artifact ────────────────────────────────

Deno.test('renders a complete standalone HTML document with a titled head', () => {
  const html = renderReport(base())
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('<title>Owner-reported summary — Nyx'))
  assert.ok(html.includes('name="referrer" content="no-referrer"'), 'privacy meta present')
  assert.ok(html.trimEnd().endsWith('</html>'))
})
