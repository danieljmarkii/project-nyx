// Unit tests for the Vet Report pure assembly layer (Build Step 9, PR 1).
//
// Run with:  deno test supabase/functions/generate-report/report.test.ts
//
// Uses Deno's built-in test runner + node:assert (bundled — no remote imports),
// so the suite runs in a network-restricted CI/dev container, exactly like
// generate-signal/detection.test.ts. The load-bearing target is the honesty
// invariants (spec §5), the scope cascade (§6), and the §7.1 real-data
// requirements — VALIDATED against a synthetic reconstruction of the live Nyx
// dry-run (the reference for "correct"): 23 vomits → food 12 / bile 5 / hairball 1;
// chronicity fires; no trial → 90-day fallback; empty weight; assessed denominators
// 18 completed / 2 uncertain / 2 failed / 1 pending; same-minute de-dup; free-fed
// B-040; present-only blood/foreign; severity blank.

import { strict as assert } from 'node:assert'
import {
  assembleReport,
  dedupeEvents,
  resolveScope,
  FALLBACK_DAYS,
  type ReportInput,
  type ReportEventInput,
  type ReportAiAnalysisInput,
  type ReportMedicationInput,
  type ReportDoseInput,
} from './report.ts'

// ── Fixture helpers ────────────────────────────────────────────────────────────

const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'

/** ISO instant at 14:00Z on a date (10am EDT — same local calendar day as UTC in July). */
function at(date: string, time = '14:00:00'): string {
  return `${date}T${time}Z`
}

let idSeq = 0
function nextId(prefix: string): string {
  idSeq++
  return `${prefix}-${String(idSeq).padStart(4, '0')}`
}

function makeEvent(partial: Partial<ReportEventInput> & { type: string; occurredAt: string }): ReportEventInput {
  return {
    id: partial.id ?? nextId(partial.type),
    type: partial.type,
    occurredAt: partial.occurredAt,
    occurredAtConfidence: partial.occurredAtConfidence ?? 'witnessed',
    occurredAtEarliest: partial.occurredAtEarliest ?? null,
    occurredAtLatest: partial.occurredAtLatest ?? null,
    severity: partial.severity ?? null,
    notes: partial.notes ?? null,
    loggedAt: partial.loggedAt ?? partial.occurredAt,
    meal: partial.meal ?? null,
  }
}

function mkAnalysis(eventId: string, o: Partial<ReportAiAnalysisInput> = {}): ReportAiAnalysisInput {
  return {
    eventId,
    status: o.status ?? 'completed',
    colour: o.colour ?? null,
    contents: o.contents ?? null,
    consistency: o.consistency ?? null,
    bloodPresent: o.bloodPresent ?? null,
    bilePresent: o.bilePresent ?? null,
    foreignMaterialPresent: o.foreignMaterialPresent ?? null,
    foreignMaterialNote: o.foreignMaterialNote ?? null,
    editedAt: o.editedAt ?? null,
  }
}

/** An empty-but-valid input skeleton; individual tests fill the arrays they need. */
function baseInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-nyx',
      name: 'Nyx',
      species: 'cat',
      breed: 'Domestic Shorthair',
      sex: 'female',
      dateOfBirth: '2019-04-01',
      weightKg: 4.6, // onboarding snapshot — must NOT surface as a weigh-in
    },
    ownerName: 'Daniel Mark',
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    dietTrials: [],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    ...overrides,
  }
}

// ── The Nyx dry-run reconstruction ─────────────────────────────────────────────
// 23 distinct vomit incidents over ~7 recent weeks + 3 same-minute duplicate logs
// (26 raw rows → 23 deduped). Phenotype: 12 food / 5 bile / 1 hairball (= 18
// completed) + 2 uncertain + 2 failed + 1 pending. Free-fed duck + RC Weight
// (chicken). Chicken-dominant discrete treats + a few tuna meals (staple washout).

const VOMIT_DAYS = [
  '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-19', '2026-05-21',
  '2026-05-23', '2026-05-26', '2026-05-28', '2026-05-30', '2026-06-02',
  '2026-06-04', '2026-06-06', '2026-06-09', '2026-06-11', '2026-06-13',
  '2026-06-16', '2026-06-18', '2026-06-21', '2026-06-23', '2026-06-25',
  '2026-06-27', '2026-06-29', '2026-06-30',
] // 23 distinct days

interface VomitSpec {
  status: 'completed' | 'uncertain' | 'failed' | 'pending'
  category?: 'food' | 'bile' | 'hairball'
  blood?: string // vomit_blood
  foreign?: string // vomit_tristate
  foreignNote?: string | null
  consistency?: string
  edited?: boolean
}

// Index → phenotype spec. 0–11 food, 12–16 bile, 17 hairball, 18–19 uncertain, 20–21 failed, 22 pending.
function vomitSpecFor(i: number): VomitSpec {
  if (i <= 11) {
    return {
      status: 'completed',
      category: 'food',
      blood: 'none_visible',
      // index 5 carries a possible-foreign flag (the real Nyx "possible-foreign photo");
      // index 4 carries an `unsure` foreign that must NEVER be folded into a present count.
      foreign: i === 5 ? 'yes' : i === 4 ? 'unsure' : 'no',
      foreignNote: i === 5 ? 'possible plastic fragment' : null,
      consistency: 'chunky',
      edited: i === 0, // one owner-reviewed field
    }
  }
  if (i <= 16) {
    // bile: `unsure` blood on two of them — the exact values §5.9 forbids folding into "0 of N".
    return { status: 'completed', category: 'bile', blood: i <= 14 ? 'unsure' : 'none_visible', foreign: 'no', consistency: 'foamy' }
  }
  if (i === 17) return { status: 'completed', category: 'hairball', blood: 'none_visible', foreign: 'no', consistency: 'soft_formed' }
  if (i <= 19) return { status: 'uncertain' }
  if (i <= 21) return { status: 'failed' }
  return { status: 'pending' }
}

function contentsForCategory(cat: 'food' | 'bile' | 'hairball'): string[] {
  if (cat === 'food') return ['partially_digested_food']
  if (cat === 'bile') return ['bile']
  return ['hair']
}

function buildNyxInput(): ReportInput {
  idSeq = 0
  const events: ReportEventInput[] = []
  const aiAnalyses: ReportAiAnalysisInput[] = []

  VOMIT_DAYS.forEach((day, i) => {
    const spec = vomitSpecFor(i)
    const id = `vomit-${String(i).padStart(2, '0')}`
    events.push(makeEvent({ id, type: 'vomit', occurredAt: at(day), severity: null }))
    aiAnalyses.push({
      eventId: id,
      status: spec.status,
      colour: spec.status === 'completed' ? 'yellow' : null,
      contents: spec.category ? contentsForCategory(spec.category) : null,
      consistency: spec.consistency ?? null,
      bloodPresent: spec.blood ?? null,
      bilePresent: spec.category === 'bile' ? 'yes' : spec.category === 'food' ? 'no' : null,
      foreignMaterialPresent: spec.foreign ?? null,
      foreignMaterialNote: spec.foreignNote ?? null,
      editedAt: spec.edited ? at(day, '15:00:00') : null,
    })
  })

  // 3 same-minute duplicate logs (May 15, May 30, Jun 21) — +30s, no analysis.
  for (const day of ['2026-05-15', '2026-05-30', '2026-06-21']) {
    events.push(makeEvent({ id: nextId('vomit-dup'), type: 'vomit', occurredAt: at(day, '14:00:30'), severity: null }))
  }

  // Chicken-dominant discrete treats (Temptations chicken) across the window.
  const treatDays = [
    '2026-05-15', '2026-05-18', '2026-05-20', '2026-05-22', '2026-05-25',
    '2026-05-27', '2026-05-29', '2026-06-01', '2026-06-03', '2026-06-05',
    '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-15', '2026-06-17',
    '2026-06-19', '2026-06-22', '2026-06-24', '2026-06-26', '2026-06-28',
  ]
  for (const day of treatDays) {
    events.push(
      makeEvent({
        type: 'meal',
        occurredAt: at(day, '09:00:00'),
        meal: {
          foodItemId: 'food-chicken-treat',
          intakeRating: null,
          quantity: null,
          foodType: 'treat',
          format: 'treat',
          primaryProtein: 'chicken',
          brand: 'Temptations',
          productName: 'Chicken',
        },
      }),
    )
  }
  // A few tuna meals (rated) — provides correlation contrast; chicken still ≥80% of discrete feedings.
  ;[
    ['2026-05-18', 'all'],
    ['2026-06-05', 'most'],
    ['2026-06-20', 'all'],
  ].forEach(([day, rating]) => {
    events.push(
      makeEvent({
        type: 'meal',
        occurredAt: at(day, '18:00:00'),
        meal: {
          foodItemId: 'food-tuna',
          intakeRating: rating as 'all' | 'most',
          quantity: 'normal',
          foodType: 'meal',
          format: 'wet_canned',
          primaryProtein: 'tuna',
          brand: 'Fancy Feast',
          productName: 'Tuna',
        },
      }),
    )
  })

  return baseInput({
    events,
    aiAnalyses,
    feedingArrangements: [
      {
        id: 'arr-duck',
        foodItemId: 'food-duck',
        method: 'free_choice',
        activeFrom: '2026-03-01',
        activeUntil: null,
        isShared: false,
        primaryProtein: 'duck',
        foodLabel: "Nature's Variety Duck",
      },
      {
        id: 'arr-rc',
        foodItemId: 'food-rc-weight',
        method: 'free_choice',
        activeFrom: '2026-03-01',
        activeUntil: null,
        isShared: false,
        primaryProtein: 'chicken',
        foodLabel: 'Royal Canin Weight Care',
      },
    ],
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────────

Deno.test('Nyx dry-run — scope falls to the 90-day fallback (no trial, no visit)', () => {
  const snap = assembleReport(buildNyxInput())
  assert.equal(snap.scope.basis, 'fallback_90d')
  assert.equal(snap.scope.windowDays, FALLBACK_DAYS)
  assert.equal(snap.scope.endDate, '2026-07-02')
  assert.equal(snap.clinicalQuestion.question, 'symptom_monitoring')
  assert.equal(snap.scope.isCustomOverride, false)
  assert.equal(snap.scope.outOfWindowSymptomCount, 0) // guard silent on the principled default
})

Deno.test('Nyx dry-run — signalment: owner name present, neuter NOT recorded, no onboarding weight', () => {
  const snap = assembleReport(buildNyxInput())
  assert.equal(snap.signalment.ownerName, 'Daniel Mark')
  assert.equal(snap.signalment.neuterStatus, 'not_recorded') // §7.1: not stored → never guessed
  // §7.1: pets.weight_kg (4.6) must NOT surface as a weigh-in — no weight_checks exist.
  assert.equal(snap.signalment.latestWeight, null)
  assert.equal(snap.weight.isEmpty, true)
  assert.equal(snap.weight.trend, null)
  assert.equal(snap.atAGlance.weightState, 'empty')
})

Deno.test('Nyx dry-run — de-dup collapses the 3 same-minute duplicate vomit logs (26 raw → 23)', () => {
  const snap = assembleReport(buildNyxInput())
  const vomit = snap.symptoms.find((s) => s.type === 'vomit')
  assert.ok(vomit)
  assert.equal(vomit!.count, 23) // 26 raw rows, 3 collapsed
  // The three collapsed incidents carry dupCount 2; every other vomit carries 1.
  const dupEntries = snap.provenance.symptomLog.filter((e) => e.type === 'vomit' && e.dupCount === 2)
  assert.equal(dupEntries.length, 3)
  assert.equal(snap.provenance.symptomLog.filter((e) => e.type === 'vomit').length, 23)
})

Deno.test('Nyx dry-run — vomit phenotype: 12 food / 5 bile / 1 hairball over the ASSESSED (completed) set', () => {
  const snap = assembleReport(buildNyxInput())
  const p = snap.vomitPhenotype
  assert.ok(p)
  assert.equal(p!.totalIncidents, 23)
  assert.equal(p!.withAnalysis, 23)
  assert.deepEqual(p!.states, { completed: 18, uncertain: 2, failed: 2, pending: 1 }) // §5.10 four distinct states
  assert.equal(p!.assessedCount, 18) // the assessed denominator
  assert.equal(p!.contentsMix.food, 12)
  assert.equal(p!.contentsMix.bile, 5)
  assert.equal(p!.contentsMix.hairball, 1)
  // Contents mix sums to the ASSESSED count, never the raw 23 (§5.10).
  const mixSum = Object.values(p!.contentsMix).reduce((a, b) => a + b, 0)
  assert.equal(mixSum, 18)
  assert.equal(p!.reviewedCount, 1) // one edited/owner-reviewed field
})

Deno.test('§5.9 present-only — a possible-foreign flag is present; `unsure` blood/foreign are NEVER folded into a count', () => {
  const snap = assembleReport(buildNyxInput())
  const p = snap.vomitPhenotype!
  // One real foreign-present incident; the `unsure` foreign (index 4) is excluded.
  assert.equal(p.foreignPresent.length, 1)
  assert.equal(p.foreignPresent[0].note, 'possible plastic fragment')
  // NO blood present: every value is none_visible or unsure — never fresh_red/coffee_ground.
  assert.equal(p.bloodPresent.length, 0)
  // The present-only structure exposes ONLY present incidents — a "0 of N" is unrepresentable.
  assert.ok(Array.isArray(p.bloodPresent))
})

Deno.test('Nyx dry-run — chronicity fires (safety-leads slot), foreign leads it, no false all-clear', () => {
  const snap = assembleReport(buildNyxInput())
  const kinds = snap.safetyFlags.map((f) => f.kind)
  assert.ok(kinds.includes('chronicity'), `expected chronicity, got ${kinds.join(',')}`)
  assert.ok(kinds.includes('present_foreign'))
  // Present-foreign LEADS the safety band (§2 present-only decision).
  assert.equal(snap.safetyFlags[0].kind, 'present_foreign')
  const chron = snap.safetyFlags.find((f) => f.kind === 'chronicity')
  assert.equal(chron?.kind === 'chronicity' && chron.symptomType, 'vomit')
  // Same-symptom worsening is suppressed by chronicity (never two redundant vomit safety cards).
  assert.equal(kinds.filter((k) => k === 'symptom_worsening').length, 0)
})

Deno.test('Nyx dry-run — correlation reuse: chicken staple washes out → no established threshold', () => {
  const snap = assembleReport(buildNyxInput())
  assert.equal(snap.correlation.hasEstablished, false)
  assert.equal(snap.correlation.noThreshold, true)
  assert.equal(snap.correlation.established.length, 0)
  // The reused staple-washout diagnostic names the staple for the honest render.
  assert.equal(snap.correlation.stapleProtein, 'chicken')
})

Deno.test('Nyx dry-run — free-fed B-040: intake not directly observed; severity always blank', () => {
  const snap = assembleReport(buildNyxInput())
  assert.equal(snap.diet.freeFed.length, 2)
  assert.equal(snap.diet.intakeNotDirectlyObserved, true)
  // Every vomit severity is unrated → blank in the log, and NO average field exists anywhere.
  const vomitLog = snap.provenance.symptomLog.filter((e) => e.type === 'vomit')
  assert.ok(vomitLog.every((e) => e.severity === null))
  // Confounders (appendix B) surface the treats + human food; here 20 chicken treats.
  assert.ok(snap.provenance.proteinExposureTally['chicken'] >= 20)
})

Deno.test('§5.1 denominators — every symptom aggregate carries windowDays + loggedDays', () => {
  const snap = assembleReport(buildNyxInput())
  assert.ok(snap.symptoms.length > 0)
  for (const s of snap.symptoms) {
    assert.equal(s.windowDays, snap.scope.windowDays)
    assert.ok(s.loggedDays > 0)
    assert.ok(s.loggedDays <= s.windowDays)
    // Weekly buckets sum to the incident count (bar heights partition the window).
    assert.equal(s.weeklyBuckets.reduce((a, b) => a + b, 0), s.count)
    assert.equal(s.weeklyBuckets.length, s.bucketStartDates.length)
  }
})

Deno.test('de-dup — a bout logged twice keeps the COMPLETED analysis, not the empty duplicate', () => {
  idSeq = 0
  const completedId = 'v-completed'
  const dupId = 'v-dup'
  const events: ReportEventInput[] = [
    makeEvent({ id: completedId, type: 'vomit', occurredAt: at('2026-06-01', '08:00:00') }),
    makeEvent({ id: dupId, type: 'vomit', occurredAt: at('2026-06-01', '08:00:20') }),
  ]
  const completed = new Set([completedId])
  const { events: survivors, droppedEventIds } = dedupeEvents(events, completed)
  assert.equal(survivors.length, 1)
  assert.equal(survivors[0].id, completedId) // representative = the completed-AI event
  assert.equal(survivors[0].dupCount, 2)
  assert.ok(droppedEventIds.has(dupId))
})

Deno.test('de-dup — two DIFFERENT medication events at the same minute are NOT collapsed (B-156 combo data-loss guard)', () => {
  // A pill and a probiotic given together are two real doses; the event row alone can't
  // tell them apart (drug identity is on the joined child), so a type-and-minute collapse
  // would silently drop a real administered dose. Only observation events (vomit/stool/…)
  // and meals (by food id) cluster — medication/weight/other pass through untouched.
  const events: ReportEventInput[] = [
    makeEvent({ id: 'dose-a', type: 'medication', occurredAt: at('2026-06-01', '08:00:00') }),
    makeEvent({ id: 'dose-b', type: 'medication', occurredAt: at('2026-06-01', '08:00:10') }),
    makeEvent({ id: 'weigh-a', type: 'weight_check', occurredAt: at('2026-06-01', '09:00:00') }),
    makeEvent({ id: 'weigh-b', type: 'weight_check', occurredAt: at('2026-06-01', '09:00:15') }),
  ]
  const { events: survivors, droppedEventIds } = dedupeEvents(events, new Set())
  assert.equal(survivors.length, 4) // nothing collapsed
  assert.equal(droppedEventIds.size, 0)
})

Deno.test('de-dup — a duplicate keeps the losing member’s owner severity/note (loses no information)', () => {
  // The representative is chosen for its completed AI analysis, but must not drop an
  // owner-entered severity or note that only the dropped duplicate carried.
  const events: ReportEventInput[] = [
    makeEvent({ id: 'v-rep', type: 'vomit', occurredAt: at('2026-06-01', '08:00:00'), severity: null, notes: null }),
    makeEvent({ id: 'v-dup', type: 'vomit', occurredAt: at('2026-06-01', '08:00:20'), severity: 4, notes: 'lots of foam' }),
  ]
  const { events: survivors } = dedupeEvents(events, new Set(['v-rep'])) // rep = the completed one
  assert.equal(survivors.length, 1)
  assert.equal(survivors[0].id, 'v-rep')
  assert.equal(survivors[0].severity, 4) // max severity across the cluster, never understated
  assert.equal(survivors[0].notes, 'lots of foam') // the surviving note, not lost
})

Deno.test('de-dup — two DIFFERENT foods seconds apart are two real feedings, not a duplicate', () => {
  const events: ReportEventInput[] = [
    makeEvent({
      id: 'm1',
      type: 'meal',
      occurredAt: at('2026-06-01', '08:00:00'),
      meal: { foodItemId: 'chicken', intakeRating: null, quantity: null, foodType: 'treat', format: 'treat', primaryProtein: 'chicken', brand: 'A', productName: 'x' },
    }),
    makeEvent({
      id: 'm2',
      type: 'meal',
      occurredAt: at('2026-06-01', '08:00:10'),
      meal: { foodItemId: 'salmon', intakeRating: null, quantity: null, foodType: 'treat', format: 'treat', primaryProtein: 'salmon', brand: 'B', productName: 'y' },
    }),
  ]
  const { events: survivors } = dedupeEvents(events, new Set())
  assert.equal(survivors.length, 2) // different food_item_id ⇒ not collapsed
})

Deno.test('scope cascade — since-visit beats trial beats fallback', () => {
  // Rung 1: a vet visit takes precedence even with an active trial present.
  const withVisit = assembleReport(
    baseInput({
      vetVisits: [{ visitedAt: '2026-06-20', clinicName: 'X', vetName: 'Dr Y', reason: 'GI' }],
      dietTrials: [{ id: 't1', foodItemId: 'f', startedAt: '2026-05-01', targetDurationDays: 42, status: 'active', completedAt: null, vetName: null }],
    }),
  )
  assert.equal(withVisit.scope.basis, 'since_visit')
  assert.equal(withVisit.scope.startDate, '2026-06-20')
  assert.equal(withVisit.scope.lastVisitDate, '2026-06-20')

  // Rung 2: no visit → the active trial window.
  const withTrial = assembleReport(
    baseInput({
      dietTrials: [{ id: 't1', foodItemId: 'f', startedAt: '2026-05-01', targetDurationDays: 42, status: 'active', completedAt: null, vetName: 'Dr Z' }],
    }),
  )
  assert.equal(withTrial.scope.basis, 'diet_trial')
  assert.equal(withTrial.scope.startDate, '2026-05-01')
  assert.equal(withTrial.clinicalQuestion.question, 'diet_trial_working')

  // Rung 3: neither → 90-day fallback.
  const bare = assembleReport(baseInput())
  assert.equal(bare.scope.basis, 'fallback_90d')

  // A future-dated visit is ignored (must be strictly before today).
  const futureVisit = assembleReport(
    baseInput({ vetVisits: [{ visitedAt: '2026-08-01', clinicName: null, vetName: null, reason: null }] }),
  )
  assert.equal(futureVisit.scope.basis, 'fallback_90d')
})

Deno.test('§6 cherry-pick guard — a custom window discloses out-of-window symptom incidents', () => {
  const events: ReportEventInput[] = [
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-10') }), // inside
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-12') }), // inside
    makeEvent({ type: 'vomit', occurredAt: at('2026-05-01') }), // BEFORE the custom window
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-28') }), // AFTER the custom window
  ]
  const snap = assembleReport(
    baseInput({ events, requestedWindow: { startDate: '2026-06-05', endDate: '2026-06-20' } }),
  )
  assert.equal(snap.scope.basis, 'custom')
  assert.equal(snap.scope.isCustomOverride, true)
  assert.equal(snap.scope.outOfWindowSymptomCount, 2) // the May 1 + Jun 28 events
  assert.equal(snap.scope.outOfWindowMostRecent, at('2026-06-28'))
  const vomit = snap.symptoms.find((s) => s.type === 'vomit')
  assert.equal(vomit!.count, 2) // only the in-window incidents counted
})

Deno.test('medication adherence — a co-started drug is a concurrent change; a zero-dose regimen is NOT "compliant"', () => {
  // The Data Scientist's named counterexample (spec §15): a metronidazole regimen
  // co-started inside the symptom window must surface as a concurrent change so the
  // diet can never silently take credit — AND a regimen with no logged doses reads
  // "not tracked", never compliant.
  const meds: ReportMedicationInput[] = [
    {
      id: 'reg-metro',
      medicationItemId: 'mi-metro',
      drugName: 'Metronidazole',
      doseAmount: '50 mg',
      route: 'oral',
      dosesPerDay: 2,
      scheduleNotes: '8am & 8pm',
      indication: 'diarrhea',
      prescribedBy: 'Dr Y',
      startedAt: '2026-06-10',
      targetDurationDays: 7,
      status: 'completed',
      endedAt: '2026-06-17',
      isPrescription: true,
      strength: '250 mg',
    },
    {
      id: 'reg-probiotic',
      medicationItemId: 'mi-pro',
      drugName: 'Proviable',
      doseAmount: '1 capsule',
      route: 'oral',
      dosesPerDay: 1,
      scheduleNotes: null,
      indication: null,
      prescribedBy: null,
      startedAt: '2026-06-10',
      targetDurationDays: null,
      status: 'active',
      endedAt: null,
      isPrescription: false, // ⇒ supplement / concurrent intervention
      strength: null,
    },
  ]
  // Metronidazole: 5 given doses + 1 missed + 1 unconfirmed over the course.
  const doses: ReportDoseInput[] = [
    ...['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'].map(
      (d): ReportDoseInput => ({ eventId: nextId('dose'), occurredAt: at(d, '08:00:00'), medicationId: 'reg-metro', medicationItemId: 'mi-metro', adherence: 'given', doseAmount: '50 mg', pairedEventId: null }),
    ),
    { eventId: nextId('dose'), occurredAt: at('2026-06-15', '08:00:00'), medicationId: 'reg-metro', medicationItemId: 'mi-metro', adherence: 'missed', doseAmount: null, pairedEventId: null },
    { eventId: nextId('dose'), occurredAt: at('2026-06-16', '08:00:00'), medicationId: 'reg-metro', medicationItemId: 'mi-metro', adherence: null, doseAmount: null, pairedEventId: null },
  ]
  const snap = assembleReport(
    baseInput({
      events: [
        makeEvent({ type: 'diarrhea', occurredAt: at('2026-06-11') }),
        makeEvent({ type: 'diarrhea', occurredAt: at('2026-06-13') }),
        // the dose events also exist as `events` rows in reality, but detection reads the doses[] projection
      ],
      medications: meds,
      doses,
    }),
  )

  // Concurrent-change note (GP-0): both the drug and the supplement start in-window.
  const changeLabels = snap.concurrentChanges.map((c) => c.label)
  assert.ok(changeLabels.includes('Metronidazole'))
  assert.ok(changeLabels.includes('Proviable'))
  assert.ok(snap.concurrentChanges.some((c) => c.kind === 'medication'))
  assert.ok(snap.concurrentChanges.some((c) => c.kind === 'supplement'))

  const metro = snap.medications.find((m) => m.regimenId === 'reg-metro')!
  assert.equal(metro.adherenceState, 'tracked')
  assert.equal(metro.givenDoses, 5)
  assert.equal(metro.missedDoses, 1)
  assert.equal(metro.unconfirmedDoses, 1) // unconfirmed ≠ missed ≠ refused, kept distinct
  assert.equal(metro.refusedDoses, 0)
  assert.equal(metro.daysWithDose, 5) // given (5) ONLY — unconfirmed/missed are NOT administered days (never overstate compliance)

  // The supplement regimen has ZERO logged doses → "not tracked", NEVER compliant.
  const pro = snap.medications.find((m) => m.regimenId === 'reg-probiotic')!
  assert.equal(pro.adherenceState, 'not_tracked')
  assert.equal(pro.isSupplement, true)
  assert.equal(pro.givenDoses, 0)
})

Deno.test('§5.11/§7 boundary-straddle — a duplicate across local midnight keeps the in-window bout + its phenotype', () => {
  // Adversarial finding 1: a near-simultaneous duplicate straddling the window boundary
  // at local midnight must NOT drop the genuine in-window bout (nor its completed phenotype),
  // and must NOT be mislabeled out-of-window. tz = America/New_York (EDT, UTC-4).
  const events: ReportEventInput[] = [
    makeEvent({ id: 'v-out', type: 'vomit', occurredAt: at('2026-06-21', '03:59:45') }), // local 06-20 → OUT
    makeEvent({ id: 'v-in', type: 'vomit', occurredAt: at('2026-06-21', '04:00:15') }), // local 06-21 → IN
  ]
  const aiAnalyses: ReportAiAnalysisInput[] = [
    {
      eventId: 'v-out', // the completed read rides the OUT-of-window duplicate
      status: 'completed',
      colour: 'yellow',
      contents: ['partially_digested_food'],
      consistency: 'chunky',
      bloodPresent: 'none_visible',
      bilePresent: 'no',
      foreignMaterialPresent: 'no',
      foreignMaterialNote: null,
      editedAt: null,
    },
  ]
  const snap = assembleReport(
    baseInput({ events, aiAnalyses, requestedWindow: { startDate: '2026-06-21', endDate: '2026-07-02' } }),
  )
  const vomit = snap.symptoms.find((s) => s.type === 'vomit')
  assert.equal(vomit!.count, 1) // the in-window bout is kept, not dropped
  assert.ok(snap.vomitPhenotype)
  assert.equal(snap.vomitPhenotype!.assessedCount, 1) // phenotype preserved despite the OUT-of-window analysis carrier
  assert.equal(snap.scope.outOfWindowSymptomCount, 0) // one incident, in-window — never mislabeled
})

Deno.test('§5.9 escalate-on-presence — a blood/foreign flag on a DROPPED duplicate still fires the safety flag', () => {
  // F1-b: two completed twins 30s apart; the later carries fresh_red, the earlier none_visible.
  // Present-only must union across the collapsed bout — the fresh_red must not vanish with the
  // dropped duplicate just because it wasn't the representative.
  const b = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 'b0', type: 'vomit', occurredAt: at('2026-06-20', '10:00:00') }),
        makeEvent({ id: 'b1', type: 'vomit', occurredAt: at('2026-06-20', '10:00:30') }),
      ],
      aiAnalyses: [
        mkAnalysis('b0', { status: 'completed', bloodPresent: 'none_visible' }),
        mkAnalysis('b1', { status: 'completed', bloodPresent: 'fresh_red' }),
      ],
    }),
  )
  assert.equal(b.symptoms.find((s) => s.type === 'vomit')!.count, 1) // one incident
  assert.equal(b.vomitPhenotype!.bloodPresent.length, 1) // fresh_red on the dropped twin not lost
  assert.ok(b.safetyFlags.some((f) => f.kind === 'present_blood'))

  // F1-c: the representative has NO analysis; the dropped twin has a FAILED read with fresh_red.
  // A photographed possible-blood bout must still escalate even with no completed read.
  const c = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 'c0', type: 'vomit', occurredAt: at('2026-06-20', '10:00:00') }),
        makeEvent({ id: 'c1', type: 'vomit', occurredAt: at('2026-06-20', '10:00:30') }),
      ],
      aiAnalyses: [mkAnalysis('c1', { status: 'failed', bloodPresent: 'fresh_red' })],
    }),
  )
  assert.equal(c.vomitPhenotype!.bloodPresent.length, 1)
  assert.ok(c.safetyFlags.some((f) => f.kind === 'present_blood'))
  assert.equal(c.vomitPhenotype!.states.failed, 1) // the incident's best (only) read is the failed one

  // F1-c2: representative completed with foreign 'no'; dropped twin uncertain with foreign 'yes'.
  const c2 = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 'd0', type: 'vomit', occurredAt: at('2026-06-20', '10:00:00') }),
        makeEvent({ id: 'd1', type: 'vomit', occurredAt: at('2026-06-20', '10:00:30') }),
      ],
      aiAnalyses: [
        mkAnalysis('d0', { status: 'completed', foreignMaterialPresent: 'no', contents: ['partially_digested_food'] }),
        mkAnalysis('d1', { status: 'uncertain', foreignMaterialPresent: 'yes', foreignMaterialNote: 'plastic' }),
      ],
    }),
  )
  assert.equal(c2.vomitPhenotype!.foreignPresent.length, 1)
  assert.ok(c2.safetyFlags.some((f) => f.kind === 'present_foreign'))
  assert.equal(c2.vomitPhenotype!.states.completed, 1) // best-status member drives the four-state count
})

Deno.test('§5.9 per-event — an `unsure` foreign read renders as null, never a positive "no foreign material"', () => {
  // Adversarial finding 2: the appendix per-event foreign flag must be null on absence /
  // uncertainty (mirroring blood), never a boolean false that reads as a cleared "no".
  const events: ReportEventInput[] = [makeEvent({ id: 'v1', type: 'vomit', occurredAt: at('2026-06-15') })]
  const aiAnalyses: ReportAiAnalysisInput[] = [
    {
      eventId: 'v1',
      status: 'completed',
      colour: 'yellow',
      contents: ['partially_digested_food'],
      consistency: 'chunky',
      bloodPresent: 'unsure',
      bilePresent: 'no',
      foreignMaterialPresent: 'unsure',
      foreignMaterialNote: null,
      editedAt: null,
    },
  ]
  const snap = assembleReport(baseInput({ events, aiAnalyses }))
  const entry = snap.provenance.symptomLog.find((e) => e.eventId === 'v1')!
  assert.equal(entry.phenotype!.foreignPresent, null) // NOT false
  assert.equal(entry.phenotype!.bloodPresent, null) // unsure blood also null
})

Deno.test('§5.11 de-dup is span-bounded — a chained >60s run does NOT collapse to one incident', () => {
  // Adversarial finding 3: anchoring each cluster to its FIRST member caps a cluster's
  // span at one window, so four vomits ~59s apart (span ~3min) form 2 incidents, not 1.
  const events: ReportEventInput[] = [
    makeEvent({ id: 'c0', type: 'vomit', occurredAt: at('2026-06-15', '10:00:00') }),
    makeEvent({ id: 'c1', type: 'vomit', occurredAt: at('2026-06-15', '10:00:59') }),
    makeEvent({ id: 'c2', type: 'vomit', occurredAt: at('2026-06-15', '10:01:58') }),
    makeEvent({ id: 'c3', type: 'vomit', occurredAt: at('2026-06-15', '10:02:57') }),
  ]
  const { events: survivors } = dedupeEvents(events, new Set())
  assert.equal(survivors.length, 2)
  assert.ok(survivors.every((s) => s.dupCount === 2))
})

Deno.test('§5.3 absence ≠ wellness — a quiet pet renders an EMPTY safety slot, never a false all-clear', () => {
  // A pet with a couple of old, isolated symptoms and no safety pattern.
  const snap = assembleReport(
    baseInput({
      events: [
        makeEvent({ type: 'vomit', occurredAt: at('2026-06-15') }),
        makeEvent({ type: 'meal', occurredAt: at('2026-06-15', '09:00:00'), meal: { foodItemId: 'f', intakeRating: 'all', quantity: 'normal', foodType: 'meal', format: 'dry_kibble', primaryProtein: 'chicken', brand: 'A', productName: 'x' } }),
      ],
    }),
  )
  assert.equal(snap.safetyFlags.length, 0) // empty — no fabricated "all clear"
  assert.equal(snap.correlation.noThreshold, true)
})

Deno.test('weight — an in-window series yields a descriptive delta + direction, no verdict', () => {
  const snap = assembleReport(
    baseInput({
      weightChecks: [
        { eventId: 'w1', weightKg: 4.8, occurredAt: at('2026-06-01') },
        { eventId: 'w2', weightKg: 4.6, occurredAt: at('2026-06-15') },
        { eventId: 'w3', weightKg: 4.4, occurredAt: at('2026-06-29') },
      ],
    }),
  )
  assert.equal(snap.weight.isEmpty, false)
  assert.ok(snap.weight.trend)
  assert.equal(snap.weight.trend!.readingCount, 3)
  assert.equal(snap.weight.trend!.direction, 'down') // 4.8 → 4.4 lbs-rounded
  assert.ok(snap.weight.trend!.deltaLbs! < 0)
  // Signalment shows the latest weigh-in with its date (not the onboarding snapshot).
  assert.ok(snap.signalment.latestWeight)
  assert.equal(snap.signalment.latestWeight!.date, '2026-06-29')
  assert.equal(snap.atAGlance.weightState, 'trend')
})

Deno.test('empty pet — designed empty states throughout, never a crash or a fabricated value', () => {
  const snap = assembleReport(baseInput())
  assert.equal(snap.symptoms.length, 0)
  assert.equal(snap.vomitPhenotype, null)
  assert.equal(snap.stool, null)
  assert.equal(snap.safetyFlags.length, 0)
  assert.equal(snap.weight.isEmpty, true)
  assert.equal(snap.correlation.noThreshold, true)
  assert.equal(snap.provenance.totalSymptomIncidents, 0)
  assert.equal(snap.atAGlance.primarySymptom, null)
})

Deno.test('resolveScope is a pure re-derivable function (no hidden Date.now / determinism)', () => {
  const input = buildNyxInput()
  const a = resolveScope(input)
  const b = resolveScope(input)
  assert.deepEqual(a, b)
})
