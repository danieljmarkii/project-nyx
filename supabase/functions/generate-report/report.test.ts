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
  INTAKE_LOG_CAP,
  type ReportInput,
  type ReportEventInput,
  type ReportAiAnalysisInput,
  type ReportMedicationInput,
  type ReportDoseInput,
} from './report.ts'
import type { FoodFormat } from '../generate-signal/detection.ts'

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

// ── B-213: intake-decline duration + recent-meals intake appendix ──────────────

/** A rated 'meal'-type meal event (B-213 intake fixtures). */
function ratedMealEvent(date: string, time: string, rating: 'all' | 'most' | 'some' | 'picked' | 'refused'): ReportEventInput {
  return makeEvent({
    type: 'meal',
    occurredAt: at(date, time),
    meal: {
      foodItemId: 'rc-chicken',
      intakeRating: rating,
      quantity: null,
      foodType: 'meal',
      format: null,
      primaryProtein: 'chicken',
      brand: 'Royal Canin',
      productName: 'Chicken',
    },
  })
}

Deno.test('B-213 — assembleReport threads lastFullMealIso + hoursSinceLastFullMeal + intakeLog on a decline', () => {
  idSeq = 0
  // A cat that ate fully through late June, then refused on Jul 2 (recent low day) → the
  // consecutive-low intake flag fires. Last full meal = Jun 30 08:00Z; now = Jul 2 12:00Z ⇒ 52 h.
  const events: ReportEventInput[] = [
    ratedMealEvent('2026-06-22', '08:00:00', 'all'),
    ratedMealEvent('2026-06-24', '08:00:00', 'all'),
    ratedMealEvent('2026-06-26', '08:00:00', 'all'),
    ratedMealEvent('2026-06-28', '08:00:00', 'all'),
    ratedMealEvent('2026-06-30', '08:00:00', 'all'), // the last FULL meal
    ratedMealEvent('2026-07-02', '08:00:00', 'refused'), // recent low day
  ]
  const snap = assembleReport(baseInput({ events }))

  const flag = snap.safetyFlags.find((f) => f.kind === 'intake_decline')
  assert.ok(flag && flag.kind === 'intake_decline', 'the intake-decline flag fires')
  assert.equal(flag.lastFullMealIso, '2026-06-30T08:00:00Z', 'the most recent fully-eaten meal')
  assert.equal(flag.hoursSinceLastFullMeal, 52, 'gap from the window end to the last full meal, whole hours')

  // The intake appendix log is populated (most-recent-first), so the page-1 figures trace.
  assert.equal(snap.provenance.intakeLog.length, 6, 'all six rated meals line-item')
  assert.equal(snap.provenance.intakeLog[0].intakeRating, 'refused', 'most recent first')
  assert.equal(snap.provenance.intakeLogHiddenOlder, 0)
  // The Jun 30 `all` meal is the tagged anchor and matches the page-1 lastFullMealIso (traceable).
  const anchor = snap.provenance.intakeLog.find((e) => e.isLastFullMeal)
  assert.ok(anchor && anchor.occurredAt === flag.lastFullMealIso, 'the tagged anchor IS the page-1 last full meal')
  assert.equal(anchor.pinned, false, 'in-cap anchor is not pinned')
  assert.equal(snap.provenance.intakeLog.filter((e) => e.isLastFullMeal).length, 1)
  // Every intake-log entry carries a real rating (no fabricated rows).
  for (const e of snap.provenance.intakeLog) assert.ok(e.occurredAt && e.intakeRating)
})

Deno.test('B-213 — no intake flag ⇒ an EMPTY intake log (no meal dump on a calm report)', () => {
  // Nyx's real dry-run: free-fed, no rated meals ⇒ no intake flag ⇒ no intake appendix.
  const snap = assembleReport(buildNyxInput())
  assert.ok(!snap.safetyFlags.some((f) => f.kind === 'intake_decline'), 'no intake flag on the free-fed pet')
  assert.equal(snap.provenance.intakeLog.length, 0, 'the intake log stays empty')
  assert.equal(snap.provenance.intakeLogHiddenOlder, 0)
})

Deno.test('B-213 — intake log is capped and discloses the hidden older count (no silent truncation)', () => {
  idSeq = 0
  // 43 rated meals, one per day back from now: the most recent is a refusal (cat single-day
  // flag fires), the rest are `all`. All fall in the 90-day report window, so the intake log
  // sees 43 but caps at INTAKE_LOG_CAP and DISCLOSES the remainder — never a silent drop.
  const TOTAL = 43
  const baseMs = Date.parse('2026-07-02T08:00:00Z')
  const events: ReportEventInput[] = []
  for (let i = 0; i < TOTAL; i++) {
    events.push(
      makeEvent({
        type: 'meal',
        occurredAt: new Date(baseMs - i * 86_400_000).toISOString(),
        meal: {
          foodItemId: 'rc-chicken',
          intakeRating: i === 0 ? 'refused' : 'all',
          quantity: null,
          foodType: 'meal',
          format: null,
          primaryProtein: 'chicken',
          brand: 'Royal Canin',
          productName: 'Chicken',
        },
      }),
    )
  }
  const snap = assembleReport(baseInput({ events }))
  assert.ok(snap.safetyFlags.some((f) => f.kind === 'intake_decline'), 'the decline fires')
  assert.equal(snap.provenance.intakeLog.length, INTAKE_LOG_CAP, 'log capped at INTAKE_LOG_CAP')
  assert.equal(snap.provenance.intakeLogHiddenOlder, TOTAL - INTAKE_LOG_CAP, 'the remainder is disclosed, not dropped')
  // The most-recent row (the refusal) is always shown — the flag's evidence is never cropped.
  assert.equal(snap.provenance.intakeLog[0].intakeRating, 'refused')
})

Deno.test('B-213 — the last full meal is PINNED into the appendix when it predates the cap (adversarial traceability finding)', () => {
  idSeq = 0
  // The chronic-inappetence case: the last fully-eaten meal is 44 days ago, then 44 non-full
  // rated meals since. The page-1 anchor must still point at a VISIBLE, tagged appendix row —
  // never cited-but-invisible past the most-recent cap.
  const TOTAL = 45
  const baseMs = Date.parse('2026-07-02T08:00:00Z')
  const events: ReportEventInput[] = []
  for (let i = 0; i < TOTAL; i++) {
    events.push(
      makeEvent({
        type: 'meal',
        occurredAt: new Date(baseMs - i * 86_400_000).toISOString(),
        meal: {
          foodItemId: 'rc-chicken',
          intakeRating: i === 0 ? 'refused' : i === TOTAL - 1 ? 'all' : 'some',
          quantity: null,
          foodType: 'meal',
          format: null,
          primaryProtein: 'chicken',
          brand: 'Royal Canin',
          productName: 'Chicken',
        },
      }),
    )
  }
  const snap = assembleReport(baseInput({ events }))
  const flag = snap.safetyFlags.find((f) => f.kind === 'intake_decline')
  assert.ok(flag && flag.kind === 'intake_decline', 'the decline fires')
  const log = snap.provenance.intakeLog
  // The anchor is pinned back in as a trailing row, so the shown set is cap + 1.
  assert.equal(log.length, INTAKE_LOG_CAP + 1, 'the anchor is pinned past the cap')
  const anchor = log[log.length - 1]
  assert.equal(anchor.pinned, true, 'the trailing row is the pinned anchor')
  assert.equal(anchor.isLastFullMeal, true, 'the pinned row is tagged the last full meal')
  assert.equal(anchor.intakeRating, 'all')
  assert.equal(anchor.occurredAt, flag.lastFullMealIso, 'the pinned row IS the page-1 anchor — traceable')
  assert.equal(log.filter((e) => e.isLastFullMeal).length, 1, 'exactly one anchor row')
  // The omitted meals between the recent run and the pinned anchor are disclosed, not dropped.
  assert.equal(snap.provenance.intakeLogHiddenOlder, TOTAL - (INTAKE_LOG_CAP + 1))
  // No recent row is mis-tagged (only the pinned anchor is the full meal).
  assert.equal(log[0].isLastFullMeal, false)
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

Deno.test('§3.8 orphan-dose — ad-hoc/OTC doses with no regimen surface as an unlinkedMedications group', () => {
  // A real owner dosed an OTC antihistamine 3× via the one-tap path but never configured a regimen,
  // so `medicationId` is null on every dose and the regimen table is empty — the doses vanished from
  // the report. They must now surface, named, grouped, with counts.
  const doses: ReportDoseInput[] = [
    { eventId: nextId('dose'), occurredAt: at('2026-06-28', '13:00:00'), medicationId: null, medicationItemId: 'mi-zyrtec', adherence: 'given', doseAmount: null, pairedEventId: null },
    { eventId: nextId('dose'), occurredAt: at('2026-06-30', '13:00:00'), medicationId: null, medicationItemId: 'mi-zyrtec', adherence: 'given', doseAmount: null, pairedEventId: null },
    { eventId: nextId('dose'), occurredAt: at('2026-07-01', '13:00:00'), medicationId: null, medicationItemId: 'mi-zyrtec', adherence: 'given', doseAmount: null, pairedEventId: null },
  ]
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-29') })],
      doses,
      medicationItems: [
        { id: 'mi-zyrtec', genericName: 'Cetirizine HCl', brandName: 'Zyrtec', strength: '5 mg', route: 'oral', isPrescription: false },
      ],
    }),
  )
  assert.equal(snap.unlinkedMedications.length, 1)
  const u = snap.unlinkedMedications[0]
  assert.equal(u.drugName, 'Cetirizine HCl (Zyrtec)') // generic leads, brand in parens
  assert.equal(u.isSupplement, true) // is_prescription false ⇒ OTC
  assert.equal(u.administeredDoses, 3)
  assert.equal(u.totalDoses, 3)
  assert.equal(u.firstDate, '2026-06-28')
  assert.equal(u.lastDate, '2026-07-01')
  assert.equal(snap.medications.length, 0) // never double-surfaced as a regimen
})

Deno.test('§3.8 orphan-dose — linked doses stay under their regimen; an unconfirmed orphan is never counted as given', () => {
  const meds: ReportMedicationInput[] = [
    {
      id: 'reg-pred', medicationItemId: 'mi-pred', drugName: 'Prednisolone', doseAmount: '5 mg', route: 'oral',
      dosesPerDay: 1, scheduleNotes: null, indication: 'allergy', prescribedBy: null,
      startedAt: '2026-06-20', targetDurationDays: null, status: 'active', endedAt: null,
      isPrescription: true, strength: '5 mg',
    },
  ]
  const doses: ReportDoseInput[] = [
    { eventId: nextId('dose'), occurredAt: at('2026-06-28', '13:00:00'), medicationId: 'reg-pred', medicationItemId: 'mi-pred', adherence: 'given', doseAmount: null, pairedEventId: null }, // linked → excluded from unlinked
    { eventId: nextId('dose'), occurredAt: at('2026-06-29', '13:00:00'), medicationId: null, medicationItemId: 'mi-zyrtec', adherence: null, doseAmount: null, pairedEventId: null }, // orphan, unconfirmed
    { eventId: nextId('dose'), occurredAt: at('2026-06-30', '13:00:00'), medicationId: null, medicationItemId: 'mi-zyrtec', adherence: 'given', doseAmount: null, pairedEventId: null }, // orphan, given
  ]
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-29') })],
      medications: meds,
      doses,
      medicationItems: [
        { id: 'mi-zyrtec', genericName: 'Cetirizine HCl', brandName: 'Zyrtec', strength: '5 mg', route: 'oral', isPrescription: false },
      ],
    }),
  )
  assert.equal(snap.unlinkedMedications.length, 1)
  const u = snap.unlinkedMedications[0]
  assert.equal(u.totalDoses, 2)
  assert.equal(u.administeredDoses, 1) // the unconfirmed dose is NOT bundled as given (compliance-over-read trap)
  assert.equal(u.unconfirmedDoses, 1)
  const reg = snap.medications.find((m) => m.regimenId === 'reg-pred')!
  assert.equal(reg.givenDoses, 1) // the linked dose stays here, not double-counted
})

Deno.test('§3.8 orphan-dose — an unresolved item name reads "Unspecified medication", never dropped', () => {
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-29') })],
      doses: [
        { eventId: nextId('dose'), occurredAt: at('2026-06-30', '13:00:00'), medicationId: null, medicationItemId: 'mi-unknown', adherence: 'given', doseAmount: null, pairedEventId: null },
      ],
      // medicationItems intentionally omitted — the name can't be resolved.
    }),
  )
  assert.equal(snap.unlinkedMedications.length, 1)
  assert.equal(snap.unlinkedMedications[0].drugName, 'Unspecified medication')
  assert.equal(snap.unlinkedMedications[0].isSupplement, false) // unknown ⇒ never asserted OTC
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

// ── A1: a pre-window medication overlapping the window enters the concurrent-change note ──
// The highest-consequence misread (spec §4/B-117): a standing steroid begun before the report
// range but active throughout must be a confounder, or the diet silently takes its credit.

function mealEvent(
  date: string,
  o: { foodType?: 'meal' | 'treat' | 'other'; format?: FoodFormat | null; protein?: string | null; label?: string; rating?: 'refused' | 'picked' | 'some' | 'most' | 'all' | null } = {},
): ReportEventInput {
  return makeEvent({
    type: 'meal',
    occurredAt: at(date, '12:00:00'),
    meal: {
      foodItemId: o.label ?? 'fi',
      intakeRating: o.rating ?? null,
      quantity: null,
      foodType: o.foodType ?? 'meal',
      format: o.format ?? 'dry_kibble',
      primaryProtein: o.protein ?? null,
      brand: null,
      productName: o.label ?? null,
    },
  })
}

Deno.test('A1 — a pre-window drug active through the window is a "ongoing" concurrent change, not dropped', () => {
  idSeq = 0
  const input = baseInput({
    now: '2026-07-02T12:00:00Z',
    dietTrials: [
      { id: 'dt', foodItemId: 'fi-t', startedAt: '2026-05-12', targetDurationDays: 56, status: 'active', completedAt: null, vetName: null, foodLabel: 'Hydro HP', primaryProtein: 'hydrolyzed' },
    ],
    medications: [
      {
        id: 'm-pred', medicationItemId: null, drugName: 'Prednisolone', doseAmount: '5 mg', route: 'mouth',
        dosesPerDay: 1, scheduleNotes: null, indication: 'derm', prescribedBy: null,
        startedAt: '2026-04-01', targetDurationDays: null, status: 'active', endedAt: null, isPrescription: true, strength: '5 mg',
      },
      {
        id: 'm-old', medicationItemId: null, drugName: 'OldAntibiotic', doseAmount: null, route: 'mouth',
        dosesPerDay: 2, scheduleNotes: null, indication: null, prescribedBy: null,
        // Ended BEFORE the diet-trial window (May 12) → NOT a concurrent confounder → dropped.
        startedAt: '2026-04-01', targetDurationDays: 7, status: 'completed', endedAt: '2026-04-10', isPrescription: true, strength: null,
      },
    ],
  })
  const snap = assembleReport(input)
  const pred = snap.concurrentChanges.find((c) => c.label === 'Prednisolone')
  assert.ok(pred, 'the standing pre-window steroid is a concurrent change')
  assert.equal(pred.ongoing, true, 'flagged ongoing (started before the window)')
  assert.equal(pred.bucketIndex, null, 'no chart marker — there is no in-window start point')
  const trial = snap.concurrentChanges.find((c) => c.kind === 'diet_trial')
  assert.equal(trial?.ongoing, false, 'the in-window trial start is NOT ongoing')
  assert.ok(!snap.concurrentChanges.some((c) => c.label === 'OldAntibiotic'), 'a drug that ended before the window is not a confounder')
})

// ── A3: a treat that is ALSO human food counts ONCE (human_food wins), never on both lines ──

Deno.test('A3 — a treat×human_food feeding is counted once as human food, never double-counted', () => {
  idSeq = 0
  const input = baseInput({
    events: [
      mealEvent('2026-06-01', { foodType: 'treat', format: 'human_food', protein: 'dairy', label: 'Cheddar cube' }),
      mealEvent('2026-06-02', { foodType: 'treat', format: 'treat', protein: 'chicken', label: 'Biscuit' }),
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.diet.humanFood.count, 1, 'the cheese cube is human food')
  assert.equal(snap.diet.treats.count, 1, 'ONLY the real treat is a treat (cheese excluded)')
  // Appendix B (confounders) still lists BOTH exposures, once each.
  assert.equal(snap.provenance.confounders.length, 2, 'two distinct off-diet exposures, no duplication')
})

// ── A5: a double-logged (near-simultaneous) weigh-in is collapsed, keeping the later ──────

Deno.test('A5 — near-simultaneous duplicate weigh-ins collapse (readingCount not inflated)', () => {
  const input = baseInput({
    weightChecks: [
      { eventId: 'w1', weightKg: 4.60, occurredAt: '2026-06-01T09:00:00Z' },
      { eventId: 'w2', weightKg: 4.55, occurredAt: '2026-06-01T09:00:04Z' }, // a 4-second retry/correction
      { eventId: 'w3', weightKg: 4.40, occurredAt: '2026-06-20T09:00:00Z' },
    ],
  })
  const snap = assembleReport(input)
  assert.ok(snap.weight.trend, 'a trend renders')
  assert.equal(snap.weight.trend.readingCount, 2, 'the 4-second retry collapsed — 2 readings, not 3')
  // Last-write-wins on the collapsed pair → the later 4.55 value is kept for that instant.
  assert.equal(snap.weight.trend.seriesKg[0], 4.55, 'the later reading of the collapsed pair wins (LWW)')
  assert.equal(snap.weight.latest?.kg, 4.40, 'the genuine later weigh-in is untouched')
})

// ── Adversarial re-verify follow-ups (PR 4 round 2) ──────────────────────────────────

Deno.test('A3b — a format=treat item (non-treat foodType) is counted in Appendix B + the antigen tally', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      // A chicken jerky logged with format='treat' but foodType='other' — the classic poultry
      // trial-breaker. It must NOT be counted on page 1 (treats) yet vanish from the antigen
      // reconciliation (adversarial finding: confounder predicate omitted format==='treat').
      events: [mealEvent('2026-06-01', { foodType: 'other', format: 'treat', protein: 'chicken', label: 'Jerky' })],
    }),
  )
  assert.equal(snap.diet.treats.count, 1, 'counted as a treat on page 1')
  assert.equal(snap.provenance.confounders.length, 1, 'ALSO in Appendix B — not dropped')
  assert.equal(snap.provenance.proteinExposureTally.chicken, 1, 'chicken is in the antigen tally, not invisible')
})

Deno.test('#9 protein timeline — off-diet bins reconcile to the protein tally; unknowns disclosed, never dropped', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      // Distinct items/days so no same-timestamp treat-relog collapse muddies the absolute counts.
      events: [
        mealEvent('2026-05-12', { foodType: 'treat', format: 'treat', protein: 'chicken', label: 'Temptations' }),
        mealEvent('2026-05-13', { foodType: 'treat', format: 'treat', protein: 'chicken', label: 'Delectables' }),
        mealEvent('2026-05-14', { foodType: 'treat', format: 'treat', protein: 'turkey', label: 'Fussie' }),
        mealEvent('2026-06-02', { foodType: 'treat', format: 'treat', protein: 'chicken', label: 'Greenies' }),
        mealEvent('2026-06-02', { foodType: 'treat', format: 'treat', protein: null, label: 'Catnip' }),
      ],
    }),
  )
  const t = snap.proteinTimeline
  assert.equal(t.bins.length, t.weekStartDates.length, 'one bin row per week')
  assert.ok(t.weekStartDates.length >= 12, 'weekly buckets span the ~90-day window')
  // §5.6: sum over bins for each protein === its tally === the provenance tally (Appendix C).
  t.proteins.forEach((p, j) => {
    const summed = t.bins.reduce((s, wk) => s + wk[j], 0)
    assert.equal(summed, t.totalByProtein[p], `bins for ${p} reconcile to its tally`)
    assert.equal(t.totalByProtein[p], snap.provenance.proteinExposureTally[p], `${p} matches the provenance tally`)
  })
  assert.equal(t.totalByProtein.chicken, 3, 'chicken exposures counted')
  assert.equal(t.totalByProtein.turkey, 1, 'turkey counted')
  // The null-protein treat is disclosed per-week, never tallied as a protein nor dropped (§5.1).
  assert.equal(t.unknownByWeek.reduce((a, b) => a + b, 0), 1, 'the no-protein treat is in unknownByWeek')
  assert.equal(t.hasUnknown, true)
  assert.equal(t.totalFeedings, snap.provenance.confounders.length, 'total === off-diet confounder count')
  assert.equal(t.totalFeedings, 5)
})

Deno.test('#7/#8 mealItems — rated meals grouped by food (label · protein · count · span · typical intake)', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      events: [
        mealEvent('2026-05-14', { foodType: 'meal', format: 'wet_canned', protein: 'chicken', label: 'Instinct Chicken', rating: 'some' }),
        mealEvent('2026-05-20', { foodType: 'meal', format: 'wet_canned', protein: 'chicken', label: 'Instinct Chicken', rating: 'some' }),
        mealEvent('2026-06-10', { foodType: 'meal', format: 'wet_canned', protein: 'chicken', label: 'Instinct Chicken', rating: 'all' }),
        mealEvent('2026-05-22', { foodType: 'meal', format: 'wet_canned', protein: 'turkey', label: 'Instinct Turkey', rating: 'some' }),
      ],
    }),
  )
  const items = snap.diet.mealItems
  assert.equal(items.length, 2, 'two distinct meal foods, grouped (not one row per feeding)')
  // Largest first (chicken ×3 on the stack baseline, then turkey ×1).
  assert.equal(items[0].foodLabel, 'Instinct Chicken')
  assert.equal(items[0].count, 3)
  assert.equal(items[0].primaryProtein, 'chicken')
  assert.equal(items[0].firstDate, '2026-05-14', 'date span start')
  assert.equal(items[0].lastDate, '2026-06-10', 'date span end')
  assert.equal(items[0].intakeMode, 'some', 'strict-plurality intake (2 some vs 1 all)')
  assert.equal(items[1].foodLabel, 'Instinct Turkey')
  assert.equal(items[1].count, 1)
  // The grouped total reconciles with mealCompletion (same ratedMeals set).
  const grouped = items.reduce((s, i) => s + i.count, 0)
  assert.equal(grouped, snap.diet.mealCompletion?.ratedMeals, 'grouped meal count === ratedMeals')
  assert.equal(grouped, 4)
})

Deno.test('A1b — a free-fed bowl with a NULL start date still reaches the concurrent-change note', () => {
  const snap = assembleReport(
    baseInput({
      feedingArrangements: [
        // "Bowl always down" — start never recorded. Was dropped by the old `&& a.activeFrom` guard.
        { id: 'fa', foodItemId: 'fi-duck', method: 'free_choice', activeFrom: null, activeUntil: null, isShared: false, primaryProtein: 'duck', foodLabel: 'Duck bowl' },
      ],
    }),
  )
  const ff = snap.concurrentChanges.find((c) => c.kind === 'free_fed')
  assert.ok(ff, 'the null-start free-fed bowl is a concurrent confounder')
  assert.equal(ff.ongoing, true, 'treated as standing/ongoing')
  assert.equal(ff.startDate, null, 'start date preserved as null (unrecorded)')
  assert.equal(ff.bucketIndex, null, 'no chart marker without a start point')
})

Deno.test('B-233 — a free-fed arrangement with an in-window activeFrom is STANDING, not a dated diet change', () => {
  // activeFrom is the first-food-LOG date, not when the diet started (PM-confirmed); it must never
  // render as a mid-window diet-change marker / "started <date>". Treated as standing context.
  const snap = assembleReport(
    baseInput({
      feedingArrangements: [
        { id: 'fa', foodItemId: 'fi-rc', method: 'free_choice', activeFrom: '2026-05-16', activeUntil: null, isShared: false, primaryProtein: 'chicken', foodLabel: 'Royal Canin Weight' },
      ],
    }),
  )
  const ff = snap.concurrentChanges.find((c) => c.kind === 'free_fed')
  assert.ok(ff, 'the free-fed diet is a concurrent confounder')
  assert.equal(ff.startDate, null, 'the log-date activeFrom is NOT used as a diet start (B-233)')
  assert.equal(ff.bucketIndex, null, 'no dashed chart marker for a standing maintenance diet')
  assert.equal(ff.ongoing, true, 'standing context, present across the window')
})

Deno.test('A1c — a pre-window intervention that ENDED mid-window carries endInWindow (not false "ongoing")', () => {
  const snap = assembleReport(
    baseInput({
      // A vet visit anchors a since-visit window starting 04-20; a trial ran 04-01 → 05-15,
      // i.e. it started BEFORE the window and stopped mid-window.
      vetVisits: [{ visitedAt: '2026-04-20', clinicName: null, vetName: null, reason: null }],
      dietTrials: [
        { id: 'dt', foodItemId: 'fi', startedAt: '2026-04-01', targetDurationDays: 44, status: 'completed', completedAt: '2026-05-15', vetName: null, foodLabel: 'OldTrial', primaryProtein: 'venison' },
      ],
    }),
  )
  const t = snap.concurrentChanges.find((c) => c.kind === 'diet_trial')
  assert.ok(t, 'the completed trial overlaps the window and is a concurrent change')
  assert.equal(t.ongoing, true, 'started before the window')
  assert.equal(t.endInWindow, '2026-05-15', 'its mid-window end is carried, so the note says "until" not "ongoing"')
})

// ── PM feedback round 1 (2026-07-03) — fixes from the first real on-device artifact ──

Deno.test('appendix B tally — canonical protein keys (B-052); junk sentinel counted as unknown, never a "null" protein', () => {
  const mkTreat = (day: string, protein: string | null, time: string) =>
    makeEvent({
      type: 'meal',
      occurredAt: at(day, time),
      meal: {
        foodItemId: nextId('f'),
        intakeRating: null,
        quantity: null,
        foodType: 'treat',
        format: 'treat',
        primaryProtein: protein,
        brand: 'B',
        productName: 'p',
      },
    })
  const snap = assembleReport(
    baseInput({
      events: [
        mkTreat('2026-06-01', 'chicken', '09:00:00'),
        mkTreat('2026-06-02', 'Chicken', '09:10:00'),
        mkTreat('2026-06-03', 'Chicken By-Product Meal', '09:20:00'),
        mkTreat('2026-06-04', 'null', '09:30:00'), // the literal junk sentinel from the live DB
        mkTreat('2026-06-05', null, '09:40:00'),
      ],
    }),
  )
  // One real antigen, three variants → ONE tally key ("chicken ×238 / Chicken ×11 /
  // Chicken By-Product Meal ×15" fragmented the first real artifact's tally).
  assert.deepEqual(snap.provenance.proteinExposureTally, { chicken: 3 })
  // The sentinel + the genuinely-absent protein are disclosed, never a "null ×N" line.
  assert.equal(snap.provenance.proteinUnknownCount, 2)
  // The row-level protein is nulled for junk too, so NO consumer can print "null".
  const rowProteins = snap.provenance.confounders.map((c) => c.primaryProtein)
  assert.ok(!rowProteins.includes('null'), 'junk sentinel never survives onto a row')
  assert.ok(rowProteins.includes('Chicken By-Product Meal'), 'real proteins keep their stored casing on rows')
})

Deno.test('chronicity flag — symptomDays recounted in LOCAL days (the 18-vs-19 artifact bug)', () => {
  // The engine buckets symptomDays by UTC day (deliberate — detection.ts §2). A
  // late-evening EDT episode lands on the NEXT UTC day: 2026-07-01T01:00Z is Jun 30
  // 21:00 local. Added to the dry-run's 23 local days (all at 14:00Z = same local/UTC
  // day), the engine counts 24 UTC days but a vet tallying appendix A sees 23 local
  // days — the report must carry the local count.
  const input = buildNyxInput()
  input.events.push(
    makeEvent({ type: 'vomit', occurredAt: '2026-07-01T01:00:00Z' }),
  )
  const snap = assembleReport(input)
  const chron = snap.safetyFlags.find((f) => f.kind === 'chronicity')
  assert.ok(chron && chron.kind === 'chronicity', 'chronicity still fires')
  assert.equal(chron.episodeCount, 24, 'episode count includes the added late-evening episode')
  assert.equal(chron.symptomDays, 23, 'days are LOCAL days (24 UTC days would over-count vs appendix A)')
})

Deno.test('chronicity under a narrow custom window — no partial-set fabrication; cropped episodes disclosed', () => {
  // Detection runs over the report window (its sub-windows nest inside it), so a
  // custom 10-day window means chronicity evaluates only the in-window slice — it
  // goes silent rather than firing off a partial set (the recount's episode-count
  // fallback guard is defense-in-depth for a mismatch this architecture does not
  // produce; the match path is regression-locked by the local-day test above). The
  // §6 cherry-pick guard must still disclose the cropped-out episodes.
  const input = buildNyxInput()
  input.requestedWindow = { startDate: '2026-06-22', endDate: '2026-07-02' }
  const snap = assembleReport(input)
  const chron = snap.safetyFlags.find((f) => f.kind === 'chronicity')
  if (chron && chron.kind === 'chronicity') {
    // If a future architecture change makes it fire here, the flag must never carry
    // a day count smaller than the window slice it is derived from.
    const windowVomitDays = new Set(snap.provenance.symptomLog.map((e) => e.occurredAt.slice(0, 10))).size
    assert.ok(chron.symptomDays >= windowVomitDays, 'never shrunk below the window slice')
  }
  assert.ok(snap.scope.isCustomOverride)
  assert.ok(snap.scope.outOfWindowSymptomCount > 0, 'cropped episodes are disclosed (§6 cherry-pick guard)')
})

// ── Round-2 (B-221) — At-a-glance no-trial tile inputs + intake mode ─────────────

Deno.test('R2-2 — AtAGlance derives since-onset, days-since-last-episode, and its logged-day coverage', () => {
  // Primary symptom onset Jun 1, last episode Jun 25 (window ends Jul 2 local). A treat on Jun 30
  // is a LOGGED day after the last episode but NOT an episode — the guard must count it as coverage,
  // never shorten the days-since gap.
  const input = baseInput({
    events: [
      makeEvent({ type: 'vomit', occurredAt: at('2026-06-01') }),
      makeEvent({ type: 'vomit', occurredAt: at('2026-06-10') }),
      makeEvent({ type: 'vomit', occurredAt: at('2026-06-20') }),
      makeEvent({ type: 'vomit', occurredAt: at('2026-06-25') }),
      makeEvent({
        type: 'meal',
        occurredAt: at('2026-06-30', '09:00:00'),
        meal: { foodItemId: 'ft', intakeRating: null, quantity: null, foodType: 'treat', format: 'treat', primaryProtein: 'chicken', brand: 'T', productName: 'C' },
      }),
    ],
  })
  const ag = assembleReport(input).atAGlance
  assert.equal(ag.primarySymptom?.type, 'vomit')
  assert.equal(ag.sinceOnsetDays, 32, 'Jun 1 → Jul 2 inclusive = 32 days')
  assert.equal(ag.daysSinceLastEpisode, 7, 'Jun 25 → Jul 2 = 7 days (the treat does not shorten it)')
  assert.equal(ag.loggedDaysSinceLastEpisode, 1, 'the Jun 30 treat is the one logged day since the last episode')
})

Deno.test('R2-2 — daysSinceLastEpisode is 0 when the most recent episode is the window-end day', () => {
  const input = baseInput({
    events: [
      makeEvent({ type: 'vomit', occurredAt: at('2026-06-01') }),
      makeEvent({ type: 'vomit', occurredAt: at('2026-07-02') }), // window end (local)
    ],
  })
  const ag = assembleReport(input).atAGlance
  assert.equal(ag.daysSinceLastEpisode, 0, 'an episode today reads 0 days since — never negative')
})

Deno.test('R2-3 — mealCompletion.intakeMode is the strict plurality; a tie yields null', () => {
  const mealAt = (date: string, rating: 'all' | 'most' | 'some' | 'picked' | 'refused') =>
    makeEvent({
      type: 'meal',
      occurredAt: at(date, '18:00:00'),
      meal: { foodItemId: 'fm', intakeRating: rating, quantity: 'n', foodType: 'meal', format: 'wet_canned', primaryProtein: 'tuna', brand: 'F', productName: 'T' },
    })
  const plurality = assembleReport(
    baseInput({ events: [mealAt('2026-06-10', 'some'), mealAt('2026-06-11', 'some'), mealAt('2026-06-12', 'some'), mealAt('2026-06-13', 'all')] }),
  )
  assert.equal(plurality.diet.mealCompletion?.intakeMode, 'some', 'the most common rating wins')
  const tied = assembleReport(
    baseInput({ events: [mealAt('2026-06-10', 'all'), mealAt('2026-06-11', 'all'), mealAt('2026-06-12', 'some'), mealAt('2026-06-13', 'some')] }),
  )
  assert.equal(tied.diet.mealCompletion?.intakeMode, null, 'a tie has no honest "typical" — null, never a picked side')
})

Deno.test('#7/#8 — mealItems groups rated meals by food (label · protein · count · span · typical intake)', () => {
  const meal = (date: string, food: string, protein: string, rating: 'all' | 'most' | 'some' | 'picked' | 'refused') =>
    makeEvent({
      type: 'meal',
      occurredAt: at(date, '18:00:00'),
      meal: { foodItemId: food, intakeRating: rating, quantity: 'n', foodType: 'meal', format: 'wet_canned', primaryProtein: protein, brand: food, productName: 'x' },
    })
  const snap = assembleReport(
    baseInput({
      events: [
        meal('2026-06-10', 'instinct-chicken', 'chicken', 'some'),
        meal('2026-06-12', 'instinct-chicken', 'chicken', 'some'),
        meal('2026-06-14', 'instinct-chicken', 'chicken', 'all'),
        meal('2026-06-11', 'instinct-turkey', 'turkey', 'picked'),
      ],
    }),
  )
  const items = snap.diet.mealItems
  assert.equal(items.length, 2, 'one row per food item')
  // Sorted by count desc → chicken (3) then turkey (1).
  assert.equal(items[0].count, 3)
  assert.equal(items[0].primaryProtein, 'chicken')
  assert.equal(items[0].intakeMode, 'some', 'strict-plurality typical intake across the grouped food (some 2 vs all 1)')
  assert.equal(items[0].firstDate, '2026-06-10')
  assert.equal(items[0].lastDate, '2026-06-14')
  assert.equal(items[1].count, 1)
  assert.equal(items[1].primaryProtein, 'turkey')
  assert.equal(items[1].intakeMode, 'picked')
  // Reconciles with mealCompletion.ratedMeals — the SAME underlying set, never a double count.
  assert.equal(items.reduce((a, i) => a + i.count, 0), snap.diet.mealCompletion?.ratedMeals)
})

Deno.test('R2-2 ADVERSARIAL — days-since is the most recent episode of ANY symptom, never just the primary', () => {
  // Primary symptom = vomiting (8, last on Jun 2 = 30 d before the Jul 2 window end); a lower-count
  // SECONDARY symptom (diarrhea, 2) has an episode on the window-end day. The generic "most recent
  // episode" tile must read 0 days — NOT 30 — or it advertises a false symptom-free streak and hides
  // a same-day sign (the blocking adversarial counterexample this fix closes).
  const vomits = ['2026-04-10', '2026-04-20', '2026-05-01', '2026-05-10', '2026-05-20', '2026-05-28', '2026-06-01', '2026-06-02'].map((d) =>
    makeEvent({ type: 'vomit', occurredAt: at(d) }),
  )
  const diarrhea = ['2026-06-15', '2026-07-02'].map((d) => makeEvent({ type: 'diarrhea', occurredAt: at(d) }))
  const ag = assembleReport(baseInput({ events: [...vomits, ...diarrhea] })).atAGlance
  assert.equal(ag.primarySymptom?.type, 'vomit', 'vomiting is the higher-count primary symptom')
  assert.equal(ag.daysSinceLastEpisode, 0, 'diarrhea today is the most recent episode of ANY symptom — the gap is 0, not 30')
})

// ── Incident photos — Appendix E manifest (PR 7) ────────────────────────────────

function mkAttachment(
  eventId: string,
  storagePath: string,
  o: { sortOrder?: number; mimeType?: string | null } = {},
): import('./report.ts').ReportAttachmentInput {
  return { eventId, storagePath, mimeType: o.mimeType ?? 'image/jpeg', sortOrder: o.sortOrder ?? 0 }
}

Deno.test('PR7 photos — one entry per attachment, most-recent-first, dataUri null in pure assembly', () => {
  const v1 = makeEvent({ id: 'v1', type: 'vomit', occurredAt: at('2026-06-10') })
  const v2 = makeEvent({ id: 'v2', type: 'vomit', occurredAt: at('2026-06-20') })
  const snap = assembleReport(
    baseInput({
      events: [v1, v2],
      attachments: [
        mkAttachment('v1', 'pet/v1-a.jpg', { sortOrder: 0 }),
        mkAttachment('v2', 'pet/v2-a.jpg', { sortOrder: 0 }),
        mkAttachment('v2', 'pet/v2-b.jpg', { sortOrder: 1 }),
      ],
    }),
  )
  assert.equal(snap.incidentPhotos.length, 3, 'one entry per attachment')
  // Most-recent-first: both v2 photos (Jun 20) precede the v1 photo (Jun 10).
  assert.deepEqual(
    snap.incidentPhotos.map((p) => p.storagePath),
    ['pet/v2-a.jpg', 'pet/v2-b.jpg', 'pet/v1-a.jpg'],
  )
  assert.ok(snap.incidentPhotos.every((p) => p.dataUri === null), 'no image bytes in the pure layer')
})

Deno.test('PR7 photos — ONLY observation incidents; meal/med/weight photos are never incident photos', () => {
  const vomit = makeEvent({ id: 'v', type: 'vomit', occurredAt: at('2026-06-10') })
  const stool = makeEvent({ id: 's', type: 'stool_normal', occurredAt: at('2026-06-11') })
  const meal = makeEvent({
    id: 'm',
    type: 'meal',
    occurredAt: at('2026-06-12'),
    meal: { foodItemId: 'f1', intakeRating: 'all', quantity: null, foodType: 'meal', format: 'wet_canned', primaryProtein: 'duck', brand: 'B', productName: 'P' },
  })
  const weight = makeEvent({ id: 'w', type: 'weight_check', occurredAt: at('2026-06-13') })
  const snap = assembleReport(
    baseInput({
      events: [vomit, stool, meal, weight],
      attachments: [
        mkAttachment('v', 'p/v.jpg'),
        mkAttachment('s', 'p/s.jpg'),
        mkAttachment('m', 'p/m.jpg'), // a food photo — must NOT be an incident photo
        mkAttachment('w', 'p/w.jpg'),
      ],
    }),
  )
  assert.deepEqual(
    snap.incidentPhotos.map((p) => p.type).sort(),
    ['stool_normal', 'vomit'],
    'only the vomit + normal-stool photos are incidents; the meal + weight photos are excluded',
  )
})

Deno.test('PR7 photos — present blood/foreign sets the safety class; matches the safety band exactly', () => {
  const bloody = makeEvent({ id: 'vb', type: 'vomit', occurredAt: at('2026-06-20') })
  const foreign = makeEvent({ id: 'vf', type: 'vomit', occurredAt: at('2026-06-18') })
  const plain = makeEvent({ id: 'vp', type: 'vomit', occurredAt: at('2026-06-16') })
  const snap = assembleReport(
    baseInput({
      events: [bloody, foreign, plain],
      aiAnalyses: [
        mkAnalysis('vb', { status: 'completed', bloodPresent: 'fresh_red', contents: ['bile'], consistency: 'foamy' }),
        mkAnalysis('vf', { status: 'completed', foreignMaterialPresent: 'yes', foreignMaterialNote: 'string', contents: ['partially_digested_food'], consistency: 'chunky' }),
        mkAnalysis('vp', { status: 'completed', bloodPresent: 'none_visible', foreignMaterialPresent: 'no', contents: ['partially_digested_food'], consistency: 'chunky' }),
      ],
      attachments: [mkAttachment('vb', 'p/vb.jpg'), mkAttachment('vf', 'p/vf.jpg'), mkAttachment('vp', 'p/vp.jpg')],
    }),
  )
  const byEvent = new Map(snap.incidentPhotos.map((p) => [p.eventId, p]))
  assert.equal(byEvent.get('vb')!.safety, 'blood')
  assert.equal(byEvent.get('vf')!.safety, 'foreign')
  assert.equal(byEvent.get('vp')!.safety, null, 'none_visible/no NEVER sets a safety class')
  // The flagged photos are exactly the incidents that lead the safety band.
  const bandBloodIds = snap.safetyFlags.filter((f) => f.kind === 'present_blood').flatMap((f: any) => f.incidents.map((i: any) => i.eventId))
  const bandForeignIds = snap.safetyFlags.filter((f) => f.kind === 'present_foreign').flatMap((f: any) => f.incidents.map((i: any) => i.eventId))
  assert.deepEqual(bandBloodIds, ['vb'])
  assert.deepEqual(bandForeignIds, ['vf'])
})

Deno.test('PR7 photos — an `unsure` foreign read NEVER sets a safety class (present-only, §5.9)', () => {
  const v = makeEvent({ id: 'vu', type: 'vomit', occurredAt: at('2026-06-20') })
  const snap = assembleReport(
    baseInput({
      events: [v],
      aiAnalyses: [mkAnalysis('vu', { status: 'completed', bloodPresent: 'unsure', foreignMaterialPresent: 'unsure', contents: ['bile'], consistency: 'foamy' })],
      attachments: [mkAttachment('vu', 'p/vu.jpg')],
    }),
  )
  assert.equal(snap.incidentPhotos[0].safety, null, 'unsure is not presence — never leads the band')
  assert.equal(snap.incidentPhotos[0].phenotype?.foreignPresent, null, 'unsure renders as null, never a positive "no"')
})

Deno.test('PR7 photos — a photo on a DROPPED same-minute duplicate still belongs to the surviving incident (§5.11)', () => {
  // Two same-minute vomit logs collapse to one incident; the photo + completed read live on the
  // log that loses the representative race. The manifest must still carry that photo + its flag.
  const rep = makeEvent({ id: 'dup-rep', type: 'vomit', occurredAt: at('2026-06-20', '10:00:00') })
  const twin = makeEvent({ id: 'dup-twin', type: 'vomit', occurredAt: at('2026-06-20', '10:00:20') })
  const snap = assembleReport(
    baseInput({
      events: [rep, twin],
      aiAnalyses: [mkAnalysis('dup-twin', { status: 'completed', bloodPresent: 'coffee_ground', contents: ['bile'], consistency: 'foamy' })],
      attachments: [mkAttachment('dup-twin', 'p/twin.jpg')],
    }),
  )
  assert.equal(snap.incidentPhotos.length, 1, 'the collapsed bout carries its one photo')
  assert.equal(snap.incidentPhotos[0].safety, 'blood', 'the flag on the dropped twin still fires')
})

Deno.test('PR7 photos — out-of-window incident photos are excluded (window-scoped like Appendix A)', () => {
  const inWin = makeEvent({ id: 'in', type: 'vomit', occurredAt: at('2026-06-20') })
  const outWin = makeEvent({ id: 'out', type: 'vomit', occurredAt: at('2026-01-05') }) // before the 90d fallback
  const snap = assembleReport(
    baseInput({ events: [inWin, outWin], attachments: [mkAttachment('in', 'p/in.jpg'), mkAttachment('out', 'p/out.jpg')] }),
  )
  assert.deepEqual(snap.incidentPhotos.map((p) => p.eventId), ['in'], 'only the in-window incident photo is carried')
})

Deno.test('PR7 photos — no attachments ⇒ an EMPTY manifest (Appendix E simply will not render)', () => {
  const snap = assembleReport(baseInput({ events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-20') })] }))
  assert.deepEqual(snap.incidentPhotos, [])
})

Deno.test('PR7 photos — an analyzed vomit whose photo was REMOVED is disclosed, not silently dropped', () => {
  // Owner removed the photo after it was analysed (attachment gone, event_ai_analysis persists).
  const kept = makeEvent({ id: 'kept', type: 'vomit', occurredAt: at('2026-06-20') })
  const removed = makeEvent({ id: 'removed', type: 'vomit', occurredAt: at('2026-06-18') })
  const snap = assembleReport(
    baseInput({
      events: [kept, removed],
      aiAnalyses: [
        mkAnalysis('kept', { status: 'completed', contents: ['bile'], consistency: 'foamy' }),
        mkAnalysis('removed', { status: 'completed', contents: ['partially_digested_food'], consistency: 'chunky' }),
      ],
      attachments: [mkAttachment('kept', 'p/kept.jpg')], // only the kept one has a retained photo
    }),
  )
  assert.equal(snap.incidentPhotos.length, 1, 'only the retained photo is a card')
  assert.equal(snap.incidentPhotos[0].eventId, 'kept')
  assert.equal(snap.incidentPhotosAnalyzedNoRetained, 1, 'the removed-photo incident is counted for disclosure')
})

Deno.test('PR7 photos — a vomit with NO analysis and no photo is NOT counted as removed (never photographed)', () => {
  const noPhoto = makeEvent({ id: 'np', type: 'vomit', occurredAt: at('2026-06-20') })
  const snap = assembleReport(baseInput({ events: [noPhoto] })) // no analysis, no attachment
  assert.equal(snap.incidentPhotos.length, 0)
  assert.equal(snap.incidentPhotosAnalyzedNoRetained, 0, 'an unphotographed incident is not a removed photo')
})

Deno.test('PR7/B-246 slice — chronicity flag daysSinceLastEpisode agrees with the At-a-glance tile (local-day, no UTC drift)', () => {
  // The flag's "days since the most recent episode" and the tile's are the SAME quantity for a
  // single-symptom chronic course; a UTC-vs-local off-by-one on the LEAD safety line was the
  // cold-read blocker (flag "4" vs tile "5"). Both must now read the report's local-day value.
  const days = ['2026-05-15', '2026-05-19', '2026-05-23', '2026-05-27', '2026-05-31', '2026-06-04', '2026-06-09', '2026-06-14', '2026-06-19', '2026-06-23', '2026-06-27']
  const events = days.map((d) => makeEvent({ type: 'vomit', occurredAt: at(d) }))
  const snap = assembleReport(baseInput({ events }))
  const chron = snap.safetyFlags.find((f) => f.kind === 'chronicity')
  assert.ok(chron && chron.kind === 'chronicity', 'chronicity fires on this course')
  assert.equal(
    (chron as { daysSinceLastEpisode: number }).daysSinceLastEpisode,
    snap.atAGlance.daysSinceLastEpisode,
    'the lead safety flag and the At-a-glance tile show the same local-day gap',
  )
})
