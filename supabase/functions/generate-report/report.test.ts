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
  buildDetectionInput,
  dedupeEvents,
  resolveScope,
  FALLBACK_DAYS,
  INTAKE_LOG_CAP,
  type ReportInput,
  type ReportEventInput,
  type ReportAiAnalysisInput,
  type ReportMedicationInput,
  type ReportMedicationItemInput,
  type ReportDoseInput,
  type TimingFinding,
} from './report.ts'
import type { FoodFormat } from '../generate-signal/detection.ts'
// The Class-A key, imported so the parity assertion below compares against the REAL
// read-path keying rather than a string literal that could drift from it.
import { canonicalizeProtein as canonicalizeProteinForTest } from '../generate-signal/protein.ts'

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
    stoolConsistency: o.stoolConsistency ?? null,
    stoolColour: o.stoolColour ?? null,
    stoolBloodPresent: o.stoolBloodPresent ?? null,
    stoolBloodType: o.stoolBloodType ?? null,
    stoolMucusPresent: o.stoolMucusPresent ?? null,
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
      stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null,
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

Deno.test('B-213/B-500 — no intake flag ⇒ the log itemises the not-fully-eaten meals only, never a full dump', () => {
  // Nyx's real dry-run: free-fed + three rated tuna meals, one rated "most". No RELATIVE
  // decline fires, so this is the non-flag population — but the one "most" meal is the "1"
  // page 1 would count as not fully eaten, so it is dated here (B-500). The point B-213 pins
  // survives: the two "all" tuna meals and every treat are NOT dumped in — the log holds that
  // single not-fully-eaten meal and only it.
  const snap = assembleReport(buildNyxInput())
  assert.ok(!snap.safetyFlags.some((f) => f.kind === 'intake_decline'), 'no intake flag on the free-fed pet')
  assert.equal(snap.provenance.intakeLogScope, 'unfinished')
  assert.equal(snap.provenance.intakeLog.length, 1, 'only the one not-fully-eaten meal, never a dump of every rated meal')
  assert.equal(snap.provenance.intakeLog[0].intakeRating, 'most')
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

// ── B-422 — what the report does and does not gate ──────────────────────────

Deno.test('scope cascade — a stale-active trial still anchors the window (B-594)', () => {
  // DELIBERATELY UNCHANGED by B-422, and the test exists to say so. Gating rung 2
  // alone would make it rank differently from `selectReportTrial` — which had to
  // stay on `status`, because dropping an un-ended trial's block drops the
  // `trial_diet_refusal` safety flag with it — and a window anchored on one trial
  // while the block describes another is the round-1 divergence bug.
  //
  // The residual is real: a trial nobody ended anchors every future report on its
  // own start. Fixing it means moving BOTH functions together, with a cold read on
  // the re-rendered artifact → B-594, alongside B-538's grace windows.
  const stale = assembleReport(
    baseInput({
      dietTrials: [{ id: 't1', foodItemId: 'f', startedAt: '2024-05-01', targetDurationDays: 42, status: 'active', completedAt: null, vetName: null }],
    }),
  )
  assert.equal(stale.scope.basis, 'diet_trial')
  // And the pair agrees about WHICH trial, which is the property that must hold.
  assert.equal(stale.trial?.id, 't1')
})

Deno.test('B-422 — a stale-active trial no longer suppresses the diet-structure detectors', () => {
  // `dietTrialActive` fully mutes detectors ⑧ staple-washout, ⑨ meal-type-collapse
  // and ⑩ diet-churn, and promotes correlation to band 1. Off a trial that ended
  // in 2024 those are wrong in the same direction — a permanently MISSING
  // sentence rather than a wrong one, which is why it went unnoticed.
  const detInput = (startedAt: string, target: number) =>
    buildDetectionInput(
      baseInput({
        dietTrials: [{ id: 't1', foodItemId: 'f', startedAt, targetDurationDays: target, status: 'active', completedAt: null, vetName: null }],
      }),
      resolveScope(baseInput()),
      [],
      new Set(),
    )
  assert.equal(detInput('2024-05-01', 42).pet.dietTrialActive, false)
  assert.equal(detInput('2026-05-01', 42).pet.dietTrialActive, true) // inside the grace
  assert.equal(detInput('2024-05-01', 0).pet.dietTrialActive, true) // no target, no overrun
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

// ── §4.4 (D2) — the lifetime medication-history table ──────────────────────────
// The window-ignoring "what has she been on, ever?" table (mock §05), derived over the
// pet's WHOLE record through `lib/medicationHistory.ts`. These tests pin the FACTS
// (buildMedicationHistory); render.test.ts pins the clinical copy. now = 2026-08-04.

const MED_NOW = '2026-08-04T12:00:00Z'

// A UTC date-key walker for GENERATING sequential dose dates (not a local-day question —
// the derivation buckets each instant by tz; the fixtures keep doses at 08:00Z/20:00Z, so
// under both EST and EDT they fall on the UTC date, no local-midnight straddle — B-514).
function addDayKey(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}
function courseDoses(
  regimenId: string | null,
  itemId: string | null,
  startDate: string,
  days: number,
  perDay: number,
  adherence: string | null = 'given',
): ReportDoseInput[] {
  const out: ReportDoseInput[] = []
  for (let d = 0; d < days; d++) {
    const date = addDayKey(startDate, d)
    for (let k = 0; k < perDay; k++) {
      out.push({
        eventId: nextId('dose'),
        occurredAt: at(date, k === 0 ? '08:00:00' : '20:00:00'),
        medicationId: regimenId,
        medicationItemId: itemId,
        adherence,
        doseAmount: null,
        pairedEventId: null,
      })
    }
  }
  return out
}
function orphanDose(itemId: string, date: string, adherence: string | null = 'given'): ReportDoseInput {
  return { eventId: nextId('dose'), occurredAt: at(date, '13:00:00'), medicationId: null, medicationItemId: itemId, adherence, doseAmount: null, pairedEventId: null }
}
// A dose explicitly LINKED to a regimen (medication_id set — the B-153 authoritative path).
function orphanDoseLinked(regimenId: string, itemId: string | null, date: string, adherence: string | null = 'given'): ReportDoseInput {
  return { eventId: nextId('dose'), occurredAt: at(date, '10:00:00'), medicationId: regimenId, medicationItemId: itemId, adherence, doseAmount: null, pairedEventId: null }
}

// The mock §05 canonical record: an active dose-course, an ad-hoc antihistamine, an
// owner-ended antibiotic, and a single anti-emetic — spanning Feb→Aug, most of it OUTSIDE
// the 90-day report window (so it exercises "window-ignoring").
function mockMedRecord(): {
  medications: ReportMedicationInput[]
  lifetimeDoses: ReportDoseInput[]
  medicationItems: ReportMedicationItemInput[]
} {
  const medications: ReportMedicationInput[] = [
    {
      id: 'reg-motozol', medicationItemId: 'mi-motozol', drugName: 'Motozol', doseAmount: '50 mg', route: 'oral',
      dosesPerDay: 2, scheduleNotes: null, indication: null, prescribedBy: null,
      startedAt: '2026-07-22', targetDurationDays: null, targetDurationDoses: 28,
      status: 'active', endedAt: null, isPrescription: true, strength: '50 mg',
    },
    {
      id: 'reg-metro', medicationItemId: 'mi-metro', drugName: 'Metronidazole', doseAmount: '250 mg', route: 'oral',
      dosesPerDay: 2, scheduleNotes: null, indication: 'GI', prescribedBy: null,
      startedAt: '2026-03-03', targetDurationDays: 14, targetDurationDoses: null,
      status: 'completed', endedAt: '2026-03-16', isPrescription: true, strength: '250 mg',
    },
  ]
  const lifetimeDoses: ReportDoseInput[] = [
    ...courseDoses('reg-motozol', 'mi-motozol', '2026-07-22', 13, 2), // 26 given, active
    orphanDose('mi-zyrtec', '2026-06-02'),
    orphanDose('mi-zyrtec', '2026-06-05'),
    orphanDose('mi-zyrtec', '2026-06-09'),
    ...courseDoses('reg-metro', 'mi-metro', '2026-03-03', 13, 2), // 26 given (Mar 3–15)
    ...courseDoses('reg-metro', 'mi-metro', '2026-03-16', 1, 2, 'missed'), // 2 missed on the last day
    orphanDose('mi-cerenia', '2026-02-11'),
  ]
  const medicationItems: ReportMedicationItemInput[] = [
    { id: 'mi-zyrtec', genericName: 'Cetirizine HCl', brandName: 'Zyrtec', strength: '5 mg', route: 'oral', isPrescription: false },
    { id: 'mi-cerenia', genericName: 'Maropitant', brandName: 'Cerenia', strength: '16 mg', route: 'oral', isPrescription: true },
    { id: 'mi-motozol', genericName: 'Metronidazole', brandName: 'Motozol', strength: '50 mg', route: 'oral', isPrescription: true },
    { id: 'mi-metro', genericName: 'Metronidazole', brandName: null, strength: '250 mg', route: 'oral', isPrescription: true },
  ]
  return { medications, lifetimeDoses, medicationItems }
}

Deno.test('§4.4 lifetime table — the mock §05 record derives all four courses, active-first', () => {
  const rec = mockMedRecord()
  const snap = assembleReport(baseInput({ now: MED_NOW, ...rec, doses: rec.lifetimeDoses }))
  const mh = snap.medicationHistory
  assert.ok(mh, 'medicationHistory present')
  // Active first, then most-recent last dose first.
  assert.deepEqual(mh!.entries.map((e) => e.drugName), [
    'Motozol', 'Cetirizine HCl (Zyrtec)', 'Metronidazole', 'Maropitant (Cerenia)',
  ])

  const motozol = mh!.entries[0]
  assert.equal(motozol.isActive, true)
  assert.equal(motozol.ended, false)
  assert.equal(motozol.dosesLogged, 26)
  assert.equal(motozol.targetDurationDoses, 28)
  assert.equal(motozol.targetDurationDays, null)
  assert.equal(motozol.plannedDoses, 28)
  assert.equal(motozol.startedDay, '2026-07-22')

  const zyrtec = mh!.entries[1]
  assert.equal(zyrtec.source, 'doses')
  assert.equal(zyrtec.ended, false) // H1 — an ad-hoc course never ends
  assert.equal(zyrtec.dosesLogged, 3)
  assert.equal(zyrtec.firstDoseDay, '2026-06-02')
  assert.equal(zyrtec.lastDoseDay, '2026-06-09')
  assert.equal(zyrtec.singleDay, false)

  const metro = mh!.entries[2]
  assert.equal(metro.ended, true)
  assert.equal(metro.endStatus, 'completed')
  assert.equal(metro.endedDay, '2026-03-16')
  assert.equal(metro.dosesLogged, 26) // H4 — given only; the 2 missed are not delivered
  assert.equal(metro.plannedDoses, 28) // 14 days × 2/day
  assert.equal(metro.targetDurationDays, 14)
  assert.equal(metro.runDays, 14) // Mar 3 → Mar 16 inclusive

  const cerenia = mh!.entries[3]
  assert.equal(cerenia.source, 'doses')
  assert.equal(cerenia.singleDay, true)
  assert.equal(cerenia.dosesLogged, 1)
  assert.equal(cerenia.ended, false)

  assert.equal(mh!.sinceDay, '2026-02-11') // earliest dated point
})

Deno.test('§4.4 lifetime table — reads lifetimeDoses, not the windowed doses (window-ignoring)', () => {
  const rec = mockMedRecord()
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: rec.medications,
    medicationItems: rec.medicationItems,
    doses: [], // the windowed sections see nothing…
    lifetimeDoses: rec.lifetimeDoses, // …but the lifetime table sees the whole record
  }))
  const mh = snap.medicationHistory!
  assert.equal(mh.entries.length, 4)
  // The Feb/Mar courses — entirely outside the 90-day window — still appear with their counts.
  assert.ok(mh.entries.some((e) => e.drugName === 'Metronidazole' && e.dosesLogged === 26 && e.ended))
  assert.ok(mh.entries.some((e) => e.drugName === 'Maropitant (Cerenia)' && e.dosesLogged === 1))
  // The windowed orphan section reads `doses` (empty) — so it is empty, proving independence.
  assert.equal(snap.unlinkedMedications.length, 0)
})

Deno.test('§4.4 lifetime table — falls back to `doses` when `lifetimeDoses` is absent (older callers)', () => {
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    doses: [orphanDose('mi-z', '2026-07-20')],
    medicationItems: [{ id: 'mi-z', genericName: 'Cetirizine', brandName: null, strength: null, route: null, isPrescription: false }],
    // lifetimeDoses intentionally omitted
  }))
  assert.equal(snap.medicationHistory!.entries.length, 1)
  assert.equal(snap.medicationHistory!.entries[0].dosesLogged, 1)
})

Deno.test('§4.4/H1 — a stale-active regimen (long quiet) is never rendered as ended', () => {
  // B-422: nothing auto-completes a course, so stale-active is the steady state. A regimen last
  // dosed 200+ days ago but still `active` must stay ended:false — silence is not an ending.
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: [{
      id: 'reg-old', medicationItemId: 'mi-old', drugName: 'Gabapentin', doseAmount: null, route: 'oral',
      dosesPerDay: 1, scheduleNotes: null, indication: null, prescribedBy: null,
      startedAt: '2026-01-01', targetDurationDays: null, targetDurationDoses: null,
      status: 'active', endedAt: null, isPrescription: true, strength: null,
    }],
    doses: [],
    lifetimeDoses: [orphanDoseLinked('reg-old', 'mi-old', '2026-01-15')],
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.isActive, true)
  assert.equal(e.ended, false)
  assert.equal(e.endStatus, null)
  assert.equal(e.endedDay, null)
  assert.equal(e.lastDoseDay, '2026-01-15') // the honest "last dose", never an ending
  assert.equal(e.runDays, null) // no length until the owner ends it
})

Deno.test('§4.4/H1 — an owner-stopped regimen renders the stopped register, endedDay from the DATE column', () => {
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: [{
      id: 'reg-stop', medicationItemId: null, drugName: 'Apoquel', doseAmount: null, route: 'oral',
      dosesPerDay: 2, scheduleNotes: null, indication: 'allergy', prescribedBy: null,
      startedAt: '2026-06-01', targetDurationDays: 30, targetDurationDoses: null,
      status: 'stopped', endedAt: '2026-06-10', isPrescription: true, strength: null,
    }],
    doses: [],
    lifetimeDoses: [orphanDoseLinked('reg-stop', null, '2026-06-02')],
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.ended, true)
  assert.equal(e.endStatus, 'stopped')
  assert.equal(e.endedDay, '2026-06-10')
})

Deno.test('§4.4/H4 — dosesLogged is dosesTowardTarget (given + partial), never the raw event count', () => {
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: [{
      id: 'reg-mix', medicationItemId: 'mi-mix', drugName: 'Amoxicillin', doseAmount: null, route: 'oral',
      dosesPerDay: 2, scheduleNotes: null, indication: null, prescribedBy: null,
      startedAt: '2026-07-01', targetDurationDays: null, targetDurationDoses: 10,
      status: 'completed', endedAt: '2026-07-05', isPrescription: true, strength: null,
    }],
    doses: [],
    lifetimeDoses: [
      orphanDoseLinked('reg-mix', 'mi-mix', '2026-07-01', 'given'),
      orphanDoseLinked('reg-mix', 'mi-mix', '2026-07-01', 'partial'),
      orphanDoseLinked('reg-mix', 'mi-mix', '2026-07-02', 'missed'),
      orphanDoseLinked('reg-mix', 'mi-mix', '2026-07-02', 'refused'),
      orphanDoseLinked('reg-mix', 'mi-mix', '2026-07-03', null), // unconfirmed
    ],
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.dosesLogged, 2) // 1 given + 1 partial; missed/refused/unconfirmed excluded
  assert.equal(e.plannedDoses, 10) // target_duration_doses
})

Deno.test('§4.4 — a dose logged AFTER the recorded end still counts; endedDay/runDays stay the regimen dates', () => {
  // A dose carrying an explicit regimen link is attributed regardless of the regimen window
  // (B-153), so an owner who logged one more after marking a course complete adds a real dose past
  // ended_at. dosesLogged/lastDoseDay stay honest to it; endedDay/runDays are the DATE columns.
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: [{
      id: 'reg-post', medicationItemId: 'mi-post', drugName: 'Clavamox', doseAmount: null, route: 'oral',
      dosesPerDay: 1, scheduleNotes: null, indication: null, prescribedBy: null,
      startedAt: '2026-07-01', targetDurationDays: 5, targetDurationDoses: null,
      status: 'completed', endedAt: '2026-07-05', isPrescription: true, strength: null,
    }],
    doses: [],
    lifetimeDoses: [
      ...['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'].map((d) =>
        orphanDoseLinked('reg-post', 'mi-post', d)),
      orphanDoseLinked('reg-post', 'mi-post', '2026-07-08'), // logged after the recorded end
    ],
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.ended, true)
  assert.equal(e.endedDay, '2026-07-05') // the DATE column — unmoved by the late dose
  assert.equal(e.lastDoseDay, '2026-07-08') // the dose evidence is honest to the late dose
  assert.equal(e.dosesLogged, 6) // all six delivered doses counted
  assert.equal(e.runDays, 5) // start → ended_at, NOT to the late dose
})

Deno.test('§4.4 — an unresolved orphan drug reads "Unspecified medication" and never ends (H1)', () => {
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    doses: [],
    lifetimeDoses: [orphanDose('mi-nameless', '2026-07-10')],
    // medicationItems omitted → the name cannot be resolved
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.drugName, 'Unspecified medication')
  assert.equal(e.ended, false)
})

Deno.test('§4.4 — a pet with no regimen and no dose has a null medicationHistory (no empty table)', () => {
  const snap = assembleReport(baseInput({ now: MED_NOW }))
  assert.equal(snap.medicationHistory, null)
})

Deno.test('§4.4/H1 — a completed regimen with a NULL ended_at is ended-WITHOUT-a-date (adversarial: never a fabricated end)', () => {
  // `medications.ended_at` is nullable (migration 020) and the derivation models
  // `{ kind:'ended', endedAt:null }` — an owner marked the course complete but recorded no date. The
  // entry must carry endedDay=null so the renderer cannot synthesize an end from the last-dose day.
  const snap = assembleReport(baseInput({
    now: MED_NOW,
    medications: [{
      id: 'reg-nulldate', medicationItemId: 'mi-x', drugName: 'Metronidazole', doseAmount: null, route: 'oral',
      dosesPerDay: 2, scheduleNotes: null, indication: null, prescribedBy: null,
      startedAt: '2026-03-03', targetDurationDays: 14, targetDurationDoses: null,
      status: 'completed', endedAt: null, isPrescription: true, strength: null,
    }],
    doses: [],
    lifetimeDoses: [
      orphanDoseLinked('reg-nulldate', 'mi-x', '2026-03-03'),
      orphanDoseLinked('reg-nulldate', 'mi-x', '2026-06-09'), // a later dose the renderer must NOT read as the end
    ],
  }))
  const e = snap.medicationHistory!.entries[0]
  assert.equal(e.ended, true) // an owner action (completed)
  assert.equal(e.endStatus, 'completed')
  assert.equal(e.endedDay, null) // no end DATE — the renderer must not invent one from the last dose
  assert.equal(e.lastDoseDay, '2026-06-09') // the dose evidence stays honest
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
      stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null,
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
      stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null,
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

// ── B-568: the meal appendix names a food's FORM ─────────────────────────────
// Brand + product do not identify a food. A prescription line stocked in both wet and
// dry shares both fields, so before this the appendix rendered two genuinely different
// foods as one indistinguishable row — and under a diet trial the two forms are
// separately adherent, which is exactly what §7 exists to answer.

Deno.test('B-568 — wet and dry of ONE product are two named rows, not one collapsed row', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      events: [
        // Same brand AND same product name; only the form differs. Distinct foodItemIds,
        // because these are two real library rows (the live case: Royal Canin Selected
        // Protein PR, stocked wet and dry, both fed across the same days).
        mealEvent('2026-06-01', { label: 'dry-id', format: 'dry_kibble', rating: 'all' }),
        mealEvent('2026-06-02', { label: 'wet-id', format: 'wet_canned', rating: 'all' }),
      ],
    }),
  )
  const labels: (string | null)[] = snap.diet.mealItems.map((m) => m.foodLabel)
  assert.equal(snap.diet.mealItems.length, 2, 'two forms stay two rows')
  // Each row names its form, so a vet scanning the appendix can tell them apart.
  assert.ok(labels.some((l) => l?.includes('(Dry)')), `expected a (Dry) row, got ${JSON.stringify(labels)}`)
  assert.ok(labels.some((l) => l?.includes('(Wet)')), `expected a (Wet) row, got ${JSON.stringify(labels)}`)
  assert.equal(new Set(labels).size, 2, 'the two labels are distinguishable')
})

Deno.test('B-568 — an unspecified form adds nothing rather than an empty parenthetical', () => {
  idSeq = 0
  const snap = assembleReport(
    // 'other' is the unspecified form: deliberately absent from FORMAT_LABEL, so it
    // must add nothing at all rather than an empty "()" — the same degradation a
    // future unmapped enum value gets.
    baseInput({ events: [mealEvent('2026-06-01', { label: 'Plain Food', format: 'other', rating: 'all' })] }),
  )
  const label = snap.diet.mealItems[0].foodLabel
  assert.equal(label, 'Plain Food')
  assert.ok(!label?.includes('('), 'no empty parenthetical on an unspecified form')
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
  // B-568 — the appendix names the FORM alongside brand + product. The fixture food is
  // wet_canned, so the row reads "(Wet)": brand + product alone do not identify a food,
  // and a vet reading the appendix must be able to tell the wet from the dry of one line.
  assert.equal(items[0].foodLabel, 'Instinct Chicken (Wet)')
  assert.equal(items[0].count, 3)
  assert.equal(items[0].primaryProtein, 'chicken')
  assert.equal(items[0].firstDate, '2026-05-14', 'date span start')
  assert.equal(items[0].lastDate, '2026-06-10', 'date span end')
  assert.equal(items[0].intakeMode, 'some', 'strict-plurality intake (2 some vs 1 all)')
  assert.equal(items[1].foodLabel, 'Instinct Turkey (Wet)') // B-568 — same rule on every appendix row
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

// ── B-247 PR 7 — stool AI-read aggregate on StoolCharacteristics.ai ───────────────

Deno.test('stool ai: null when stool events exist but none has an analysis', () => {
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ id: 's1', type: 'stool_normal', occurredAt: at('2026-06-11') })],
    }),
  )
  assert.ok(snap.stool)
  assert.equal(snap.stool!.total, 1)
  assert.equal(snap.stool!.ai, null, 'no analysis ⇒ ai layer is null, counts still render')
})

Deno.test('stool ai: Bristol/colour distributed over ASSESSED only; unsure + non-completed excluded', () => {
  const snap = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 's1', type: 'stool_normal', occurredAt: at('2026-06-11') }),
        makeEvent({ id: 's2', type: 'diarrhea', occurredAt: at('2026-06-12') }),
        makeEvent({ id: 's3', type: 'stool_normal', occurredAt: at('2026-06-13') }),
        makeEvent({ id: 's4', type: 'stool_normal', occurredAt: at('2026-06-14') }),
      ],
      aiAnalyses: [
        mkAnalysis('s1', { status: 'completed', stoolConsistency: 'type_4_smooth_soft', stoolColour: 'brown' }),
        mkAnalysis('s2', { status: 'completed', stoolConsistency: 'type_6_mushy', stoolColour: 'brown' }),
        // 'unsure' consistency must NOT enter the distribution (not a legible read).
        mkAnalysis('s3', { status: 'completed', stoolConsistency: 'unsure', stoolColour: 'unsure' }),
        // a non-completed read contributes to the four-state count but NOT the descriptive aggregate.
        mkAnalysis('s4', { status: 'uncertain', stoolConsistency: 'type_7_watery', stoolColour: 'green' }),
      ],
    }),
  )
  const ai = snap.stool!.ai!
  assert.equal(ai.totalIncidents, 4)
  assert.equal(ai.withAnalysis, 4)
  assert.deepEqual(ai.states, { completed: 3, uncertain: 1, failed: 0, pending: 0 })
  assert.equal(ai.assessedCount, 3)
  assert.deepEqual(ai.consistencyDistribution, { type_4_smooth_soft: 1, type_6_mushy: 1 })
  assert.deepEqual(ai.colourDistribution, { brown: 2 })
})

Deno.test('stool ai: present-only blood/mucus — never folds no/unsure into presence', () => {
  const snap = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 's1', type: 'diarrhea', occurredAt: at('2026-06-11') }),
        makeEvent({ id: 's2', type: 'diarrhea', occurredAt: at('2026-06-12') }),
      ],
      aiAnalyses: [
        mkAnalysis('s1', { status: 'completed', stoolBloodPresent: 'yes', stoolBloodType: 'dark_tarry', stoolMucusPresent: 'yes' }),
        mkAnalysis('s2', { status: 'completed', stoolBloodPresent: 'no', stoolMucusPresent: 'unsure' }),
      ],
    }),
  )
  const ai = snap.stool!.ai!
  assert.equal(ai.bloodPresent.length, 1, 'only the yes-blood incident')
  assert.equal(ai.bloodPresent[0].kind, 'dark_tarry', 'melena subtype carried')
  assert.equal(ai.mucusPresent.length, 1, 'no/unsure mucus never manufactured into presence')
  assert.equal(ai.mucusPresent[0].eventId, 's1')
})

Deno.test('stool blood ELEVATES to the page-1 safety band (source=stool), like vomit blood', () => {
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ id: 's1', type: 'diarrhea', occurredAt: at('2026-06-26') })],
      aiAnalyses: [mkAnalysis('s1', { status: 'completed', stoolBloodPresent: 'yes', stoolBloodType: 'dark_tarry' })],
    }),
  )
  const blood = snap.safetyFlags.filter((f) => f.kind === 'present_blood')
  assert.equal(blood.length, 1)
  assert.equal((blood[0] as { source: string }).source, 'stool')
  assert.equal((blood[0] as { incidents: unknown[] }).incidents.length, 1)
})

Deno.test('stool mucus does NOT elevate to the safety band (monitor-tier, D5)', () => {
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ id: 's1', type: 'diarrhea', occurredAt: at('2026-06-26') })],
      aiAnalyses: [mkAnalysis('s1', { status: 'completed', stoolBloodPresent: 'no', stoolMucusPresent: 'yes' })],
    }),
  )
  assert.equal(snap.safetyFlags.filter((f) => f.kind === 'present_blood').length, 0)
})

Deno.test('stool incident phenotype (Appendix A/E) carries Bristol + present blood; photo safety class = blood', () => {
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ id: 's1', type: 'diarrhea', occurredAt: at('2026-06-26') })],
      aiAnalyses: [mkAnalysis('s1', { status: 'completed', stoolConsistency: 'type_6_mushy', stoolColour: 'black_tarry', stoolBloodPresent: 'yes', stoolBloodType: 'dark_tarry', stoolMucusPresent: 'no' })],
      attachments: [mkAttachment('s1', 'p/s1.jpg')],
    }),
  )
  const ph = snap.provenance.symptomLog.find((e) => e.eventId === 's1')!.phenotype!
  assert.equal(ph.kind, 'stool')
  assert.equal(ph.bristol, 'type_6_mushy')
  assert.equal(ph.stoolBlood, 'dark_tarry')
  assert.equal(ph.bloodPresent, null) // vomit field stays null on a stool phenotype
  const photo = snap.incidentPhotos.find((p) => p.eventId === 's1')!
  assert.equal(photo.safety, 'blood') // a stool blood photo leads Appendix E + the band thumbnail
})

Deno.test('stool ai: §5.9 — a blood flag on a DROPPED same-minute duplicate still surfaces', () => {
  // Two stool logs 30s apart collapse to one incident; the fresh_red rides the dropped member.
  const snap = assembleReport(
    baseInput({
      events: [
        makeEvent({ id: 'a', type: 'diarrhea', occurredAt: at('2026-06-15', '10:00:00') }),
        makeEvent({ id: 'b', type: 'diarrhea', occurredAt: at('2026-06-15', '10:00:30') }),
      ],
      aiAnalyses: [
        mkAnalysis('a', { status: 'completed', stoolBloodPresent: 'no' }),
        mkAnalysis('b', { status: 'completed', stoolBloodPresent: 'yes', stoolBloodType: 'fresh_red' }),
      ],
    }),
  )
  const ai = snap.stool!.ai!
  assert.equal(ai.totalIncidents, 1, 'the two logs collapsed to one incident')
  assert.equal(ai.bloodPresent.length, 1, 'the flag on the dropped duplicate is unioned in')
  assert.equal(ai.bloodPresent[0].kind, 'fresh_red')
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

// ── B-351 slice 5 — the captured protein set on the vet report (§9, D10) ───────
//
// Two questions run through every test below, and they are NOT the same question:
//   (1) WHAT IS IN THIS FOOD?   — present-only, always safe to state, and the whole
//       sensitivity win: a hidden secondary protein is the textbook reason an
//       elimination trial silently fails, and until slice 1 we never stored it.
//   (2) IS THAT EVERYTHING?     — a claim about ABSENCE, licensed ONLY by D10's
//       completeness gate. `proteins: ['duck']` off a marketing-name-only read is
//       byte-identical to a duck food whose panel was genuinely read, and the report
//       is served under a provenance line saying the labels were read — so getting
//       this wrong tells a vet a contaminated elimination food is clean.

const PANEL_DUCK_CHICKEN = 'Duck, duck meal, chicken by-product meal, brewers rice, chicken fat.'

/** A meal-ish event carrying a food with an explicit protein set. */
function proteinMeal(opts: {
  occurredAt: string
  foodItemId?: string
  foodType?: 'meal' | 'treat' | 'other'
  format?: FoodFormat
  primaryProtein?: string | null
  proteins?: string[] | null
  ingredientsNotes?: string | null
  extractionConfidence?: unknown
  brand?: string
  productName?: string
  intakeRating?: 'all' | 'most' | 'some' | null
}): ReportEventInput {
  return makeEvent({
    type: 'meal',
    occurredAt: opts.occurredAt,
    meal: {
      foodItemId: opts.foodItemId ?? 'food-x',
      intakeRating: opts.intakeRating ?? null,
      quantity: null,
      foodType: opts.foodType ?? 'treat',
      format: opts.format ?? 'treat',
      primaryProtein: opts.primaryProtein ?? null,
      proteins: opts.proteins ?? null,
      ingredientsNotes: opts.ingredientsNotes ?? null,
      extractionConfidence: opts.extractionConfidence ?? null,
      brand: opts.brand ?? 'Brand',
      productName: opts.productName ?? 'Product',
    },
  })
}

Deno.test('B-351 §9 — an off-diet feeding counts for EVERY protein in its food, not just the primary', () => {
  // The sensitivity win, stated as a count: one duck-and-chicken treat is one duck
  // exposure AND one chicken exposure. Tallying only `primary_protein` is exactly what
  // made the contaminant invisible to every clinical surface.
  const snap = assembleReport(
    baseInput({
      events: [
        proteinMeal({
          occurredAt: at('2026-06-10'),
          primaryProtein: 'duck',
          proteins: ['duck', 'chicken'],
          ingredientsNotes: PANEL_DUCK_CHICKEN,
          extractionConfidence: { proteins: 0.92 },
        }),
      ],
    }),
  )
  assert.equal(snap.provenance.proteinExposureTally.duck, 1)
  assert.equal(snap.provenance.proteinExposureTally.chicken, 1, 'the hidden secondary is a real exposure')
  assert.equal(snap.proteinTimeline.totalFeedings, 1, 'still ONE feeding — exposures and feedings are different units')
  assert.equal(
    snap.proteinTimeline.feedingsByWeek.reduce((a, b) => a + b, 0),
    1,
    'the weekly feeding denominator counts the feeding once',
  )
  assert.equal(
    snap.proteinTimeline.bins.flat().reduce((a, b) => a + b, 0),
    2,
    'but the stack carries both bands — sum-over-bins is an exposure count',
  )
})

Deno.test('B-351 D10 — a set is COMPLETE only when the panel was captured AND legibly read', () => {
  const mk = (notes: string | null, conf: unknown) =>
    assembleReport(
      baseInput({
        events: [
          proteinMeal({
            occurredAt: at('2026-06-10'),
            primaryProtein: 'duck',
            proteins: ['duck'],
            ingredientsNotes: notes,
            extractionConfidence: conf,
          }),
        ],
      }),
    ).provenance.confounders[0].proteinSet

  assert.equal(mk(PANEL_DUCK_CHICKEN, { proteins: 0.92 }).complete, true, 'panel captured + read')
  assert.equal(mk(null, { proteins: 0.92 }).complete, false, 'no panel text — a marketing-name-only read')
  assert.equal(mk(PANEL_DUCK_CHICKEN, { proteins: 0.2 }).complete, false, 'panel present but not legibly read')
  assert.equal(mk(PANEL_DUCK_CHICKEN, null).complete, false, 'legacy row with no confidence is never assumed fine')
  // The routine partial tool call: a legible panel read at high confidence with the
  // `proteins` array simply omitted. An absent field is not an attested absence.
  const empty = assembleReport(
    baseInput({
      events: [
        proteinMeal({
          occurredAt: at('2026-06-10'),
          primaryProtein: null,
          proteins: [],
          ingredientsNotes: PANEL_DUCK_CHICKEN,
          extractionConfidence: { proteins: 0.95 },
        }),
      ],
    }),
  ).provenance.confounders[0].proteinSet
  assert.deepEqual(empty.proteins, [])
  assert.equal(empty.complete, false, 'an EMPTY set can never carry a completeness claim')
})

Deno.test('B-351 D10 — incompleteFeedings makes the tally a disclosed FLOOR, never a silent under-count', () => {
  const snap = assembleReport(
    baseInput({
      events: [
        // Read off a real panel.
        proteinMeal({
          occurredAt: at('2026-06-10'),
          foodItemId: 'f-read',
          primaryProtein: 'duck',
          proteins: ['duck', 'chicken'],
          ingredientsNotes: PANEL_DUCK_CHICKEN,
          extractionConfidence: { proteins: 0.92 },
        }),
        // Never read — its secondaries, whatever they are, are missing from the tally.
        proteinMeal({ occurredAt: at('2026-06-11'), foodItemId: 'f-unread', primaryProtein: 'beef', proteins: ['beef'] }),
        proteinMeal({ occurredAt: at('2026-06-12'), foodItemId: 'f-unread', primaryProtein: 'beef', proteins: ['beef'] }),
      ],
    }),
  )
  assert.equal(snap.proteinTimeline.totalFeedings, 3)
  assert.equal(snap.proteinTimeline.incompleteFeedings, 2, 'both unread feedings are disclosed')
})

Deno.test('B-351 §8 shape ① — the trial food carrying an off-trial protein is surfaced on the trial itself', () => {
  const snap = assembleReport(
    baseInput({
      dietTrials: [
        {
          id: 'dt1',
          foodItemId: 'f-trial',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          status: 'active',
          completedAt: null,
          vetName: 'Dr. Chen',
          foodLabel: 'Novel Duck',
          primaryProtein: 'duck',
          proteins: ['duck', 'chicken'],
          ingredientsNotes: PANEL_DUCK_CHICKEN,
          extractionConfidence: { proteins: 0.9 },
        },
      ],
    }),
  )
  assert.equal(snap.diet.trialTargetProtein, 'duck')
  assert.deepEqual(snap.diet.trial!.proteinSet.proteins, ['duck', 'chicken'])
  assert.deepEqual(
    snap.diet.trial!.proteinSet.offTrial,
    ['chicken'],
    'the duck trial diet lists chicken — the finding this whole spec exists for',
  )
})

Deno.test('B-351 §8 shape ② — an off-diet food fed during the trial carries its off-trial proteins', () => {
  const snap = assembleReport(
    baseInput({
      dietTrials: [
        {
          id: 'dt1',
          foodItemId: 'f-trial',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          status: 'active',
          completedAt: null,
          vetName: null,
          foodLabel: 'Novel Duck',
          primaryProtein: 'duck',
          proteins: ['duck'],
          ingredientsNotes: 'Duck, duck meal, brewers rice, sunflower oil.',
          extractionConfidence: { proteins: 0.9 },
        },
      ],
      events: [
        proteinMeal({
          occurredAt: at('2026-06-10'),
          primaryProtein: 'chicken',
          proteins: ['chicken', 'salmon'],
          ingredientsNotes: 'Chicken, chicken meal, salmon meal, rice.',
          extractionConfidence: { proteins: 0.88 },
        }),
      ],
    }),
  )
  assert.deepEqual(snap.provenance.confounders[0].proteinSet.offTrial, ['chicken', 'salmon'])
  assert.deepEqual(snap.diet.trial!.proteinSet.offTrial, [], 'the trial diet itself is clean here')
})

Deno.test('B-351 — no active trial means NO off-trial marking anywhere (silence, never an all-clear)', () => {
  const snap = assembleReport(
    baseInput({
      events: [proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'chicken', proteins: ['chicken', 'salmon'] })],
    }),
  )
  assert.equal(snap.diet.trialTargetProtein, null)
  assert.deepEqual(snap.provenance.confounders[0].proteinSet.offTrial, [])
  assert.deepEqual(snap.provenance.confounders[0].proteinSet.proteins, ['chicken', 'salmon'], 'the set is still captured')
})

Deno.test('B-351 — a trial food whose main protein was CLEARED disables the check rather than inverting it', () => {
  // Slice 3 demotes a cleared main into the tail and writes a NULL primary, so
  // `proteins[0]` is then a protein the owner explicitly un-designated. Keying the
  // target off proteins[0] would resurrect it AND invert the check — every OTHER
  // protein, including the real trial protein, would be reported as the contaminant.
  const snap = assembleReport(
    baseInput({
      dietTrials: [
        {
          id: 'dt1',
          foodItemId: 'f-trial',
          startedAt: '2026-05-08',
          targetDurationDays: 56,
          status: 'active',
          completedAt: null,
          vetName: null,
          foodLabel: 'Novel Duck',
          primaryProtein: null,
          proteins: ['duck', 'chicken'],
          ingredientsNotes: PANEL_DUCK_CHICKEN,
          extractionConfidence: { proteins: 0.9 },
        },
      ],
      events: [proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'duck', proteins: ['duck'] })],
    }),
  )
  assert.equal(snap.diet.trialTargetProtein, null, 'no designated target — the check is disabled')
  assert.deepEqual(snap.diet.trial!.proteinSet.offTrial, [])
  assert.deepEqual(snap.provenance.confounders[0].proteinSet.offTrial, [], 'the real trial protein is NOT blamed')
})

Deno.test('B-351 — a legacy row with only primary_protein still yields a one-element (incomplete) set', () => {
  // Migration 039 backfilled `proteins` from `primary_protein`, but a row written
  // through the pre-slice-3 window can still arrive with the array absent. It must
  // degrade to the primary, not drop out of the report's protein picture entirely.
  const snap = assembleReport(
    baseInput({ events: [proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'Chicken By-Product Meal', proteins: null })] }),
  )
  const set = snap.provenance.confounders[0].proteinSet
  assert.deepEqual(set.proteins, ['chicken'], 'canonicalized, so it pools with every other chicken exposure')
  assert.equal(set.complete, false)
  assert.equal(snap.provenance.proteinExposureTally.chicken, 1)
})

Deno.test('B-351 — a feeding with no usable protein is counted as unknown, never tallied as a protein', () => {
  // The §5.1 guarantee, re-checked under set-membership: the junk sentinel path must
  // still route to proteinUnknownCount rather than producing a "null ×N" tally line.
  const snap = assembleReport(
    baseInput({
      events: [
        proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'null', proteins: null }),
        proteinMeal({ occurredAt: at('2026-06-11'), primaryProtein: null, proteins: [] }),
      ],
    }),
  )
  assert.equal(snap.provenance.proteinUnknownCount, 2)
  assert.deepEqual(Object.keys(snap.provenance.proteinExposureTally), [])
  assert.equal(snap.proteinTimeline.unknownByWeek.reduce((a, b) => a + b, 0), 2)
})

Deno.test('B-351 — §5.6 reconciles in FEEDINGS: appendix rows, totalFeedings and feedingsByWeek agree', () => {
  // Set-membership broke the old "sum-over-bins === feeding count" identity on purpose
  // (a feeding can now contribute several bands). The reconciliation that must survive
  // is the one the render actually cites: feedings.
  const snap = assembleReport(
    baseInput({
      events: [
        proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'duck', proteins: ['duck', 'chicken'] }),
        proteinMeal({ occurredAt: at('2026-06-17'), primaryProtein: 'beef', proteins: ['beef'] }),
        proteinMeal({ occurredAt: at('2026-06-24'), primaryProtein: null, proteins: [] }),
      ],
    }),
  )
  assert.equal(snap.provenance.confounders.length, snap.proteinTimeline.totalFeedings)
  assert.equal(
    snap.proteinTimeline.feedingsByWeek.reduce((a, b) => a + b, 0),
    snap.proteinTimeline.totalFeedings,
  )
})

Deno.test('B-497 — mealDaysByBucket counts MEALS, not any log: a logged symptom is not diet observation', () => {
  // The adversarial-reviewer's counterexample. Week 0: an off-diet treat (so the timeline renders)
  // — a meal-type log, so the diet was observed. Week 1: a logged VOMIT and NO meal — the canonical
  // diet-trial owner who records symptoms but not meals. The off-diet chart's "was the diet
  // observed?" signal (`mealDaysByBucket`) must NOT fire on the vomit, or week 1 renders a clean
  // "0" over a diet nobody watched — reassurance-on-absence. This is why it counts meals, not
  // `loggedDayNums` (the symptom chart's any-log signal, which DOES fire on the vomit).
  const snap = assembleReport(
    baseInput({
      requestedWindow: { startDate: '2026-06-01', endDate: '2026-06-14' }, // 14 d → 2 weekly buckets
      events: [
        proteinMeal({ occurredAt: at('2026-06-02'), foodType: 'treat', primaryProtein: 'chicken', proteins: ['chicken'] }),
        makeEvent({ type: 'vomit', occurredAt: at('2026-06-10') }),
      ],
    }),
  )
  const pt = snap.proteinTimeline
  assert.equal(pt.mealDaysByBucket.length, 2, 'two weekly buckets')
  assert.ok(pt.mealDaysByBucket[0] > 0, 'week 0 had a meal-type log — the diet was observed')
  assert.equal(pt.mealDaysByBucket[1], 0, 'week 1 had only a vomit — a symptom is NOT diet observation')
  assert.equal(pt.feedingsByWeek[1], 0, 'and no off-diet feeding fell in week 1')
  // The contrast that proves the fix: the any-log signal (what the chart used to gate on) DOES fire
  // on the vomit week, so gating the clean "0" on it would have asserted a clean diet nobody watched.
  const vomit = snap.symptoms.find((s) => s.type === 'vomit')
  assert.ok(vomit, 'the vomit aggregate exists')
  assert.ok(vomit!.loggedDaysByBucket[1] > 0, 'any-log fires on the vomit week — the OLD, wrong signal')
})

// ── B-351 slice 5 — END-TO-END, from STORED COLUMN SHAPES to rendered HTML ─────
//
// The adversarial pass named a structural blind spot in the tests above: report.test
// exercises derivation with no HTML, and render.test hand-builds `ProteinSetView`s and
// never runs `proteinView`. So the seam BETWEEN them — how a stored row becomes a set,
// and whether that set is keyed the same way as the trial target — was covered by
// nothing, which is exactly where the worst bug lived. These run the whole pipe.

Deno.test('B-351 — a Class-B-mappable protein does NOT report itself as its own contaminant', () => {
  // THE REGRESSION. `deriveProteinSet` (write path) applies D3a's Class-B rules —
  // aliases, tissue and descriptor strips — while the trial target resolves through
  // `canonicalizeProtein` (Class A). Keying the two sides differently made an
  // `ocean whitefish` trial food announce, in bold on page 1, that its own label also
  // listed whitefish. Spec §11 records three such rows live; `Buffalo`, `Deer`,
  // `Deboned Chicken` and `Chicken Liver` all reproduce it.
  for (const stored of ['ocean whitefish', 'Buffalo', 'Deer', 'Deboned Chicken', 'Chicken Liver', 'Egg Whites']) {
    const snap = assembleReport(
      baseInput({
        dietTrials: [
          {
            id: 'dt1',
            foodItemId: 'f-trial',
            startedAt: '2026-05-08',
            targetDurationDays: 56,
            status: 'active',
            completedAt: null,
            vetName: null,
            foodLabel: 'Novel Diet',
            primaryProtein: stored,
            proteins: [stored],
            ingredientsNotes: `${stored}, brewers rice, sunflower oil, dried beet pulp.`,
            extractionConfidence: { proteins: 0.93 },
          },
        ],
      }),
    )
    assert.deepEqual(
      snap.diet.trial!.proteinSet.offTrial,
      [],
      `"${stored}" must not be off-trial against itself`,
    )
    // And the set must key IDENTICALLY to the target, so the two can be compared at all.
    assert.deepEqual(
      snap.diet.trial!.proteinSet.proteins,
      [snap.diet.trialTargetProtein],
      `"${stored}" keys the same on both sides of the off-trial comparison`,
    )
  }
})

Deno.test('B-351 — a stored row keys the same on the read path as the client does', () => {
  // The client (lib/trialContaminant + ProteinDisclosure) reads stored values through
  // canonicalizeProtein. If the report normalized further, the app would tell the owner
  // a trial is clean while the report told the vet it was contaminated — the split
  // lib/trialProtein.ts exists to prevent, one layer down.
  const snap = assembleReport(
    baseInput({
      events: [proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: 'Ocean Whitefish', proteins: ['Ocean Whitefish', 'Chicken Meal'] })],
    }),
  )
  assert.deepEqual(
    snap.provenance.confounders[0].proteinSet.proteins,
    [canonicalizeProteinForTest('Ocean Whitefish'), canonicalizeProteinForTest('Chicken Meal')],
  )
})

Deno.test('B-351 — a feeding with no food at all is "no protein recorded", not "panel not captured"', () => {
  // The floor line counts foods whose ingredient panel was never READ. A bare
  // human-food log has no food row to have a panel, and is already disclosed as
  // unknown — counting it twice made the sentence say something untrue.
  const snap = assembleReport(
    baseInput({
      events: [
        proteinMeal({ occurredAt: at('2026-06-10'), primaryProtein: null, proteins: [] }),
        proteinMeal({ occurredAt: at('2026-06-11'), primaryProtein: null, proteins: [] }),
        proteinMeal({ occurredAt: at('2026-06-12'), primaryProtein: 'beef', proteins: ['beef'] }),
      ],
    }),
  )
  assert.equal(snap.proteinTimeline.totalFeedings, 3)
  assert.equal(snap.provenance.proteinUnknownCount, 2)
  assert.equal(snap.proteinTimeline.incompleteFeedings, 1, 'only the food that HAS a protein but no read panel')
})

Deno.test('B-351 — PROPERTY: a trial food is never off-trial against itself, over a dirty cross-product', () => {
  // The example-list version of this test above pins six known-bad values. The adversarial
  // re-check pointed out that this is the exact coverage shape `lib/protein.ts`'s own header
  // says is NOT sufficient — an example list is what let B-414 ship a `chicken -` key under a
  // docstring claiming idempotence. So the durable form is the PROPERTY: for any stored
  // primary P, `canonicalizeProtein(P)` is in the derived set and is never reported as
  // off-trial against a target resolved from the same P. That is the invariant whose failure
  // put "The trial food's own label also lists Whitefish" on page 1 of a whitefish trial.
  const PRIMARIES = [
    'Ocean Whitefish', 'ocean whitefish', 'Buffalo', 'Deer', 'Chicken Liver', 'Deboned Chicken',
    'Egg Whites', 'chicken - meal', 'Chicken By-Product Meal', 'CHICKEN', '  salmon  ', 'green tripe',
    'hydrolyzed soy protein', 'lamb meal', 'Turkey Giblets', 'whitefish', 'bison', 'venison',
  ]
  const WRAPPERS = [(x: string) => x, (x: string) => x.toUpperCase(), (x: string) => `  ${x}  `, (x: string) => `${x} meal`]
  const ARRAY_SHAPES: unknown[] = [null, [], ['chicken'], ['duck', 'salmon'], 'not-an-array', [null, 5, {}], undefined]

  let checked = 0
  for (const base of PRIMARIES) {
    for (const wrap of WRAPPERS) {
      const primary = wrap(base)
      const target = canonicalizeProteinForTest(primary)
      if (target == null) continue // protein-unknown disables the check entirely — nothing to assert
      for (const arr of ARRAY_SHAPES) {
        const snap = assembleReport(
          baseInput({
            dietTrials: [
              {
                id: 'dt1', foodItemId: 'f-trial', startedAt: '2026-05-08', targetDurationDays: 56,
                status: 'active', completedAt: null, vetName: null, foodLabel: 'Trial',
                primaryProtein: primary,
                proteins: arr as string[] | null,
                ingredientsNotes: 'A captured panel, long enough to clear the floor.',
                extractionConfidence: { proteins: 0.9 },
              },
            ],
          }),
        )
        const view = snap.diet.trial!.proteinSet
        assert.equal(snap.diet.trialTargetProtein, target, `target keys from the stored primary (${primary})`)
        assert.ok(view.proteins.includes(target), `the target is IN its own set (${primary} / ${JSON.stringify(arr)})`)
        assert.ok(
          !view.offTrial.includes(target),
          `the trial protein is never its own contaminant (${primary} / ${JSON.stringify(arr)})`,
        )
        checked++
      }
    }
  }
  assert.ok(checked > 300, `the cross-product actually ran (${checked} cases)`)
})

// ── B-704 — the owner's stored trial protein: naming + provenance + mismatch ──────
//
// PR 5 threads `diet_trials.target_protein` into the report's stored-first naming.
// These tests pin the DATA the render reads (identity provenance, the mismatch fact,
// attribution surviving thin food data) and re-assert TG-5 against the report builder:
// a protein edit moves the NAMING and never a number.

/** A duck elimination trial, with the owner's stored protein a free parameter. One
 *  primary-diet allowed food so coverage/exposure numbers are non-trivial. */
function proteinTrialInput(over: { targetProtein?: string | null; targetProteinSetAt?: string | null; primaryProtein?: string | null } = {}): Partial<ReportInput> {
  return {
    dietTrials: [
      {
        id: 'dt-p', foodItemId: 'f-trial', startedAt: '2026-05-08', targetDurationDays: 56,
        status: 'active', completedAt: null, vetName: 'Dr. Chen', foodLabel: 'Novel Duck',
        primaryProtein: over.primaryProtein === undefined ? 'duck' : over.primaryProtein,
        proteins: over.primaryProtein === undefined ? ['duck', 'chicken'] : (over.primaryProtein ? [over.primaryProtein] : ['duck', 'chicken']),
        ingredientsNotes: PANEL_DUCK_CHICKEN,
        extractionConfidence: { proteins: 0.9 },
        targetProtein: over.targetProtein ?? null,
        targetProteinSetAt: over.targetProteinSetAt ?? null,
        allowedFoods: [
          {
            foodItemId: 'f-trial', foodLabel: 'Novel Duck', role: 'primary_diet',
            allowedFrom: '2026-05-08', allowedUntil: null, primaryProtein: 'duck',
            brand: 'Brand', productName: 'Novel Duck', proteins: ['duck'],
            ingredientsNotes: 'Duck, duck meal, brewers rice.', extractionConfidence: { proteins: 0.9 },
          },
        ],
      },
    ],
    events: [
      // The prescribed diet, fed and finished (on-diet).
      proteinMeal({ occurredAt: at('2026-06-01'), foodItemId: 'f-trial', foodType: 'meal', format: 'dry_kibble', primaryProtein: 'duck', proteins: ['duck'], intakeRating: 'all', ingredientsNotes: 'Duck, duck meal, brewers rice.', extractionConfidence: { proteins: 0.9 } }),
      // Off-diet chicken treat — a poultry exposure regardless of the target.
      proteinMeal({ occurredAt: at('2026-06-05'), foodItemId: 'chick-treat', foodType: 'treat', format: 'treat', primaryProtein: 'chicken', proteins: ['chicken'], ingredientsNotes: 'Chicken, chicken meal.', extractionConfidence: { proteins: 0.9 } }),
      // Off-diet DUCK treat — its off-target naming is EXACTLY what a target edit moves
      // (duck is on-target for a duck trial, off-target for a rabbit one).
      proteinMeal({ occurredAt: at('2026-06-07'), foodItemId: 'duck-treat', foodType: 'treat', format: 'treat', primaryProtein: 'duck', proteins: ['duck'], ingredientsNotes: 'Duck, duck meal.', extractionConfidence: { proteins: 0.9 } }),
      // A human-food scrap — the #1 confounder line.
      proteinMeal({ occurredAt: at('2026-06-09'), foodItemId: 'scrap', foodType: 'treat', format: 'human_food', primaryProtein: 'beef', proteins: ['beef'] }),
    ],
  }
}

Deno.test('B-704 — a DERIVED target carries source "derived", no confirmed-day', () => {
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: null })))
  assert.equal(snap.diet.trialTargetProtein, 'duck', 'derives the trial food primary, exactly as before PR 5')
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'derived', confirmedDay: null })
  assert.equal(snap.diet.trialProteinMismatch, null, 'a derived target came FROM the label — it cannot disagree with it')
})

Deno.test('B-704 — an OWNER target that AGREES with the label carries source "owner", no mismatch', () => {
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'duck' })))
  assert.equal(snap.diet.trialTargetProtein, 'duck')
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'owner', confirmedDay: null })
  assert.equal(snap.diet.trialProteinMismatch, null, 'owner and label agree — no tension')
})

Deno.test('B-704 — an OWNER target set AFTER day 1 discloses the confirmed day', () => {
  // Trial started 2026-05-08; the owner named the protein on 2026-05-15 → day 8.
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'duck', targetProteinSetAt: '2026-05-15T14:00:00Z' })))
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'owner', confirmedDay: 8 })
})

Deno.test('B-704 — an OWNER target set on day 1 discloses NO day (setup, not a mid-trial change)', () => {
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'duck', targetProteinSetAt: '2026-05-08T09:00:00Z' })))
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'owner', confirmedDay: null }, 'day 1 is setup — no "confirmed day" disclosure')
})

Deno.test('B-704 §6/TG-3 — an owner target that DISAGREES with the label: baseline stays the food, the owner word is a safety flag', () => {
  // The wrong-primary trial food, structurally undetectable before this: the owner
  // recorded RABBIT, the trial diet's label says DUCK.
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'rabbit' })))
  // The EXPOSURE BASELINE stays the food's own primary (duck) — coherent with the
  // TG-1-locked counts. Marking against the owner's rabbit here is what made the report
  // self-contradict (antigen tally against duck, `*` markings against rabbit). The owner's
  // word does not re-base the exposure section; it becomes a safety flag instead.
  assert.equal(snap.diet.trialTargetProtein, 'duck', 'the baseline is the food, not the owner word')
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'derived', confirmedDay: null }, 'baseline is label-read, never a false owner-confirmed over the food protein')
  assert.deepEqual(snap.diet.trialProteinMismatch, { target: 'rabbit', foodProtein: 'duck', foodLabel: 'Novel Duck' })
  // The mismatch leads the SAFETY BAND (B-494 rule; the cold-read gate).
  const flag = snap.safetyFlags.find((f) => f.kind === 'protein_mismatch')
  assert.ok(flag, 'a protein_mismatch safety flag fires')
  assert.equal(flag!.kind === 'protein_mismatch' && flag.recordedProtein, 'rabbit')
  assert.equal(flag!.kind === 'protein_mismatch' && flag.foodProtein, 'duck')
  // The trial food's OWN duck primary is NOT a contaminant against the duck baseline; its
  // genuine self-listing (chicken) still surfaces.
  assert.deepEqual(snap.diet.trial!.proteinSet.offTrial, ['chicken'], 'chicken is a real self-contaminant; the duck primary is the diet')
})

Deno.test('B-704 — a stored target keeps attribution alive when the trial food primary is THIN (derivation goes dark)', () => {
  // The trial food carries no designated primary (thin data), so derivation returns
  // null and every off-target naming would go dark. The owner's stored "rabbit" keeps
  // it alive: a chicken confounder is still named as an off-target exposure.
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'rabbit', primaryProtein: null })))
  assert.equal(snap.diet.trialTargetProtein, 'rabbit', 'the stored target survives the thin food record')
  assert.deepEqual(snap.diet.trialProteinProvenance, { source: 'owner', confirmedDay: null })
  // The chicken treat is named as off-target — "poultry exposure", not a bare "off-diet feeding".
  const chick = snap.provenance.confounders.find((c) => c.proteinSet.proteins.includes('chicken'))
  assert.ok(chick, 'the chicken confounder is present')
  assert.deepEqual(chick!.proteinSet.offTrial, ['chicken'], 'named off-target against the stored rabbit, not dark')
  // No mismatch — the thin food has no designated primary to disagree with (silence, not a manufactured tension).
  assert.equal(snap.diet.trialProteinMismatch, null)
})

Deno.test('B-704 — with NO stored target and a thin food, attribution IS dark — silence, never an all-clear (TG-2)', () => {
  const snap = assembleReport(baseInput(proteinTrialInput({ targetProtein: null, primaryProtein: null })))
  assert.equal(snap.diet.trialTargetProtein, null, 'nothing stored, nothing derivable — no target')
  assert.equal(snap.diet.trialProteinProvenance, null, 'provenance travels with the protein — both null')
  const chick = snap.provenance.confounders.find((c) => c.proteinSet.proteins.includes('chicken'))
  assert.deepEqual(chick!.proteinSet.offTrial, [], 'nothing compared — [] is silence, not "clean"')
})

Deno.test('B-704 TG-5 — editing the stored target never moves a report NUMBER (naming only)', () => {
  // The tally every trial surface is built on. Snapshot it, edit the target from derived
  // 'duck' to owner 'rabbit' (the largest possible naming change — a full mismatch), and
  // re-snapshot: byte-identical. The antigen tally / coverage / exposures come from
  // computeTrialFacts, which never sees the target; the confounder counts and protein
  // tallies are target-independent by construction. This re-asserts PR 2's TG-5 one layer
  // out, against the whole report builder.
  const numbers = (targetProtein: string | null) => {
    idSeq = 0 // deterministic event ids, so the two builds' exposure items compare cleanly
    const s = assembleReport(baseInput(proteinTrialInput({ targetProtein })))
    return {
      coverage: s.trial!.coverage,
      exposures: s.trial!.exposures,
      antigenTally: s.trial!.antigenTally,
      mealCompletion: s.diet.mealCompletion,
      treats: s.diet.treats,
      humanFood: { count: s.diet.humanFood.count, days: s.diet.humanFood.days },
      proteinExposureTally: s.provenance.proteinExposureTally,
      proteinTimelineTotal: s.proteinTimeline.totalFeedings,
      totalByProtein: s.proteinTimeline.totalByProtein,
    }
  }
  const before = numbers(null) // derived 'duck'
  const after = numbers('rabbit') // owner overrides to a DIFFERENT protein
  assert.deepEqual(after, before, 'every count / denominator / coverage figure is byte-identical across the edit')

  // NOT a vacuous test: the same edit genuinely MOVES a rendered fact — but it is the
  // MISMATCH FLAG, not the exposure markings. The markings stay on the derived baseline
  // (duck) in BOTH snapshots — that stability IS the coherence fix (the stored value never
  // re-bases the exposure section on a non-thin food; it only names a discrepancy).
  idSeq = 0
  const dSnap = assembleReport(baseInput(proteinTrialInput({ targetProtein: null })))
  idSeq = 0
  const rSnap = assembleReport(baseInput(proteinTrialInput({ targetProtein: 'rabbit' })))
  assert.equal(dSnap.diet.trialTargetProtein, 'duck', 'baseline is the food primary')
  assert.equal(rSnap.diet.trialTargetProtein, 'duck', 'and the stored rabbit does NOT re-base it (coherence with the counts)')
  const duckConfd = (s: typeof dSnap) => s.provenance.confounders.find((c) => c.proteinSet.proteins.length === 1 && c.proteinSet.proteins[0] === 'duck')!.proteinSet.offTrial
  assert.deepEqual(duckConfd(dSnap), [], 'duck is on-target (the diet) in both')
  assert.deepEqual(duckConfd(rSnap), [], 'still on-target under the stored rabbit — the markings did not move')
  // What DID move: the mismatch surfaced (null → the discrepancy), as a safety flag.
  assert.equal(dSnap.diet.trialProteinMismatch, null)
  assert.deepEqual(rSnap.diet.trialProteinMismatch, { target: 'rabbit', foodProtein: 'duck', foodLabel: 'Novel Duck' })
  assert.ok(!dSnap.safetyFlags.some((f) => f.kind === 'protein_mismatch'), 'no flag without a mismatch')
  assert.ok(rSnap.safetyFlags.some((f) => f.kind === 'protein_mismatch'), 'the mismatch flag is the visible effect of the edit')
})

// ── B-532 — the data layer behind the render-honesty pass ────────────────────────

Deno.test('B-532 — trendHalves are EQUAL over an even window', () => {
  idSeq = 0
  const events = [
    makeEvent({ type: 'vomit', occurredAt: at('2026-04-10') }), // first half
    makeEvent({ type: 'vomit', occurredAt: at('2026-05-18') }), // first half (its last day)
    makeEvent({ type: 'vomit', occurredAt: at('2026-05-19') }), // last half (its first day)
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-30') }), // last half
  ]
  const snap = assembleReport(baseInput({ events }))
  const v = snap.symptoms.find((s) => s.type === 'vomit')!
  assert.equal(v.windowDays, 90)
  assert.deepEqual(v.trendHalves, {
    days: 45,
    firstCount: 2,
    lastCount: 2,
    firstStartDate: '2026-04-04',
    firstEndDate: '2026-05-18',
    lastStartDate: '2026-05-19',
    lastEndDate: '2026-07-02',
    // An even window has no middle day to exclude, so nothing to disclose (B-600).
    middleCount: 0,
    middleDate: null,
  })
})

Deno.test('B-532 — an ODD window puts the middle day in neither half, and loses it from nothing else', () => {
  idSeq = 0
  // 13 days (Jun 20 – Jul 2): six each side, with Jun 26 — the exact middle — in neither.
  // Handing the spare day to one side is how the unequal-window bias got in, in miniature.
  const events = [
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-21') }),
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-26') }), // THE MIDDLE DAY
    makeEvent({ type: 'vomit', occurredAt: at('2026-07-01') }),
  ]
  const snap = assembleReport(
    baseInput({ events, vetVisits: [{ visitedAt: '2026-06-20', clinicName: null, vetName: null, reason: null }] }),
  )
  const v = snap.symptoms.find((s) => s.type === 'vomit')!
  assert.equal(v.windowDays, 13)
  assert.equal(v.trendHalves!.days, 6)
  assert.equal(v.trendHalves!.firstEndDate, '2026-06-25')
  assert.equal(v.trendHalves!.lastStartDate, '2026-06-27')
  assert.equal(v.trendHalves!.firstCount, 1)
  assert.equal(v.trendHalves!.lastCount, 1)
  assert.equal(v.count, 3, 'the middle day is not deleted from the record — only from the comparison')
  assert.equal(v.weeklyBuckets.reduce((a, b) => a + b, 0), 3, 'and it is still on the chart')
  // …AND IT IS DISCLOSED BESIDE THE COMPARISON (B-600, cold read round 13). "Not
  // deleted from the record" was true and not sufficient: the render printed only the
  // two halves, so on a 31-day window whose ONE event fell on the median day the page
  // read "first 15 d 0 → last 15 d 0" three centimetres under "1 / 31 d". Two zeroes
  // scan as no episodes, and that one day was 100% of the evidence.
  assert.equal(v.trendHalves!.middleCount, 1)
  assert.equal(v.trendHalves!.middleDate, '2026-06-26')
})

Deno.test('B-532 — the 9-day window no longer compares 7 days against 2', () => {
  idSeq = 0
  // The worst case of the old bucket split, and it rendered: `mid = floor(2/2) = 1`, so the
  // first half was a full week and the last half was whatever remained.
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-25') })],
      vetVisits: [{ visitedAt: '2026-06-24', clinicName: null, vetName: null, reason: null }],
    }),
  )
  const v = snap.symptoms.find((s) => s.type === 'vomit')!
  assert.equal(v.windowDays, 9)
  assert.equal(v.trendHalves!.days, 4, 'four against four, not seven against two')
})

Deno.test('B-532 — a window too short to halve gets NO delta rather than a lopsided one', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      events: [makeEvent({ type: 'vomit', occurredAt: at('2026-06-30') })],
      vetVisits: [{ visitedAt: '2026-06-28', clinicName: null, vetName: null, reason: null }],
    }),
  )
  assert.equal(snap.atAGlance.windowDays, 5)
  assert.equal(snap.symptoms.find((s) => s.type === 'vomit')!.trendHalves, null)
})

Deno.test('B-532 — the half logged-day counts use the SAME partition as the delta', () => {
  idSeq = 0
  const events = [
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-21') }),
    makeEvent({ type: 'vomit', occurredAt: at('2026-06-26') }), // middle day of a 13-day window
    makeEvent({ type: 'vomit', occurredAt: at('2026-07-01') }),
  ]
  const snap = assembleReport(
    baseInput({ events, vetVisits: [{ visitedAt: '2026-06-20', clinicName: null, vetName: null, reason: null }] }),
  )
  assert.equal(snap.atAGlance.firstHalfLoggedDays, 1)
  assert.equal(snap.atAGlance.secondHalfLoggedDays, 1)
  assert.equal(snap.atAGlance.loggedDays, 3, 'the middle logged day still counts in the window total')
})

Deno.test('B-532 — the intake log itemises unfinished meals with no intake flag at all', () => {
  idSeq = 0
  // The canonical B-494 shape reduced to its essentials: a diet unfinished from day one,
  // so `detectIntakeDecline` (a RELATIVE detector) never fires and the old gate left the
  // appendix empty while page 1 pointed at it.
  const events = [
    ratedMealEvent('2026-06-10', '08:00:00', 'refused'),
    ratedMealEvent('2026-06-11', '08:00:00', 'some'),
    ratedMealEvent('2026-06-12', '08:00:00', 'refused'),
    ratedMealEvent('2026-06-13', '08:00:00', 'all'),
  ]
  const snap = assembleReport(baseInput({ events }))
  assert.ok(!snap.safetyFlags.some((f) => f.kind === 'intake_decline'), 'no relative decline fires')
  assert.equal(snap.provenance.intakeLogScope, 'unfinished')
  assert.equal(snap.provenance.intakeLog.length, 3, 'the three unfinished meals, and only those')
  assert.ok(
    snap.provenance.intakeLog.every((e) => e.intakeRating !== 'all'),
    'a fully-eaten meal never enters a list captioned as the meals that were not finished',
  )
  assert.ok(!snap.provenance.intakeLog.some((e) => e.isLastFullMeal), 'and no anchor is tagged in this population')
})

Deno.test('B-500 — an "ate most" meal is NOT fully eaten, so it is itemised with its date (never only grouped)', () => {
  idSeq = 0
  // Page 1 counts "fully eaten" as `=== 'all'`, so an "ate most" meal is the "1" in "N of M
  // fully eaten", and this list's own copy says "meals … the owner did not record as fully
  // eaten". B-532 filtered the list on `feedingWasFinished` (`most`/`all`) instead, so that one
  // meal had no dated row anywhere while page 1 singled it out and the caption promised it
  // (`vet-report-cold-read`, B-500). It is now itemised with its date — plain, not bolded, since
  // `most` is a possible signal but not an alarm — AND still counted in the grouped breakdown.
  const snap = assembleReport(
    baseInput({
      events: [ratedMealEvent('2026-06-10', '08:00:00', 'all'), ratedMealEvent('2026-06-11', '08:00:00', 'most')],
    }),
  )
  assert.ok(!snap.safetyFlags.some((f) => f.kind === 'intake_decline'), 'no relative decline fires on a calm record')
  assert.equal(snap.provenance.intakeLogScope, 'unfinished')
  assert.equal(snap.provenance.intakeLog.length, 1, 'the one not-fully-eaten meal is itemised, and only it')
  assert.equal(snap.provenance.intakeLog[0].intakeRating, 'most')
  assert.ok(snap.provenance.intakeLog[0].occurredAt.includes('2026-06-11'), 'and carries its own date, not a food-wide span')
  assert.ok(!snap.provenance.intakeLog.some((e) => e.isLastFullMeal), 'no anchor is tagged in this population')
  // …and it is NOT moved out of the grouped breakdown: it appears in both places.
  const item = snap.diet.mealItems.find((i) => i.count === 2)!
  assert.deepEqual(item.intakeBreakdown, [
    { rating: 'all', count: 1 },
    { rating: 'most', count: 1 },
  ])
})

Deno.test('B-532 — the intake breakdown counts every rating, along the intake scale', () => {
  idSeq = 0
  const events = [
    ratedMealEvent('2026-06-10', '08:00:00', 'refused'),
    ratedMealEvent('2026-06-10', '18:00:00', 'refused'),
    ratedMealEvent('2026-06-11', '08:00:00', 'some'),
    ratedMealEvent('2026-06-12', '08:00:00', 'all'),
  ]
  const snap = assembleReport(baseInput({ events }))
  const item = snap.diet.mealItems[0]
  assert.deepEqual(
    item.intakeBreakdown,
    [
      { rating: 'all', count: 1 },
      { rating: 'some', count: 1 },
      { rating: 'refused', count: 2 },
    ],
    'scale order (most eaten first), never count order — a count sort re-creates the mode impression',
  )
  assert.equal(item.count, 4, 'and the counts still sum to the group')
})

Deno.test('B-532 — Appendix D carries the days an administered dose was logged', () => {
  idSeq = 0
  const snap = assembleReport(
    baseInput({
      medications: [
        {
          id: 'reg-apo',
          medicationItemId: 'mi-apo',
          drugName: 'Apoquel',
          doseAmount: '16 mg',
          route: 'oral',
          dosesPerDay: 1,
          scheduleNotes: null,
          indication: 'pruritus',
          prescribedBy: null,
          startedAt: '2026-06-01',
          targetDurationDays: null,
          status: 'active',
          endedAt: null,
          isPrescription: true,
          strength: '16 mg',
        },
      ],
      medicationItems: [
        { id: 'mi-apo', genericName: 'oclacitinib', brandName: 'Apoquel', strength: '16 mg', route: 'oral', isPrescription: true, form: 'tablet' },
      ],
      doses: [
        { eventId: 'd1', occurredAt: at('2026-06-05', '09:00:00'), medicationId: 'reg-apo', medicationItemId: 'mi-apo', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
        { eventId: 'd2', occurredAt: at('2026-06-05', '21:00:00'), medicationId: 'reg-apo', medicationItemId: 'mi-apo', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
        { eventId: 'd3', occurredAt: at('2026-06-20', '09:00:00'), medicationId: 'reg-apo', medicationItemId: 'mi-apo', adherence: 'partial', doseAmount: '8 mg', pairedEventId: null },
        // Unconfirmed is not administered — it must not put a date on the page (adversarial finding 4).
        { eventId: 'd4', occurredAt: at('2026-06-25', '09:00:00'), medicationId: 'reg-apo', medicationItemId: 'mi-apo', adherence: null, doseAmount: null, pairedEventId: null },
      ],
    }),
  )
  const m = snap.medications.find((x) => x.drugName === 'Apoquel')!
  assert.deepEqual(m.doseDays, ['2026-06-05', '2026-06-20'], 'distinct days, ascending, administered only')
  assert.equal(m.daysWithDose, m.doseDays.length, 'the date list and the day count are the same population')
})

Deno.test('B-532 — two library rows under one label with DIFFERENT sets do not fold', () => {
  idSeq = 0
  // B-009/B-018 duplicates, or a re-photographed bag: a label-only group key made the FIRST
  // member's set stand for both, so an implied-complete set could be printed over feedings
  // that came from a row nobody read. Appendix B's `pushFood` already keyed on the set.
  const mk = (date: string, proteins: string[], notes: string | null): ReportEventInput =>
    makeEvent({
      type: 'meal',
      occurredAt: at(date, '08:00:00'),
      meal: {
        foodItemId: null,
        intakeRating: 'all',
        quantity: null,
        foodType: 'meal',
        format: null,
        primaryProtein: proteins[0] ?? null,
        proteins,
        ingredientsNotes: notes,
        brand: 'Acme',
        productName: 'Duck Formula',
      },
    })
  const snap = assembleReport(
    baseInput({
      events: [mk('2026-06-10', ['duck', 'chicken'], 'Duck, rice, chicken fat'), mk('2026-06-11', ['duck'], null)],
    }),
  )
  const rows = snap.diet.mealItems.filter((i) => i.foodLabel === 'Acme Duck Formula')
  assert.equal(rows.length, 2, 'one row per captured set — never the first member speaking for both')
  assert.ok(rows.some((r) => r.proteinSet.proteins.includes('chicken')))
  assert.ok(rows.some((r) => !r.proteinSet.proteins.includes('chicken')))
})

// ── CUL-564: Signals v2 timing types reach the report ──────────────────────────
// The report path runs the full v2 composition now (detectSignals' composeV2 arg was removed).
// runDetection must EXTRACT the v2 timing types it renders — empty_stomach_timing (L1) and the
// merged timing_story — instead of dropping them on the switch's `default`, the pre-v2 behaviour.
// The end-to-end render of those lines is pinned in render.test.ts; this proves the extraction
// (that flipping the composition actually surfaces the new type through assembleReport).

Deno.test('CUL-564 — assembleReport extracts the empty-stomach timing lane (L1) into correlation.timing', () => {
  // A run of empty-stomach vomits: a single 8am-ET meal each day, with the vomit at 5am ET (~21h
  // after the prior day's meal → timed-eligible + long band). 8am ET = 12:00Z, 5am ET = 09:00Z in
  // June (EDT). L1 fires and suppresses the co-clustered ⑥; pre-v2 the report dropped it entirely.
  const events: ReportEventInput[] = []
  for (let d = 12; d <= 27; d++) {
    const date = `2026-06-${String(d).padStart(2, '0')}`
    events.push(ratedMealEvent(date, '12:00:00', 'all'))
    if (d >= 16) events.push(makeEvent({ type: 'vomit', occurredAt: at(date, '09:00:00') }))
  }
  const snap = assembleReport(baseInput({ events }))

  const l1 = snap.correlation.timing.find((t) => t.kind === 'empty_stomach_timing')
  assert.ok(l1, 'L1 (empty_stomach_timing) is extracted into the report timing set, not dropped')
  assert.equal(l1!.symptomType, 'vomit')

  // The report timing set only ever carries the four kinds it renders/handles. L2 trial_response and
  // L4 gap_shortening are not `TimingFinding` kinds and are dropped by runDetection's explicit cases,
  // so the TYPE makes it impossible for them to appear here (the CUL-564 exclusion). This asserts the
  // invariant, not the drop path itself — the drop is a `break` the type already guarantees.
  const REPORT_TIMING_KINDS = ['postprandial_timing', 'timeofday_clustering', 'empty_stomach_timing', 'timing_story']
  assert.ok(
    snap.correlation.timing.every((t) => REPORT_TIMING_KINDS.includes(t.kind)),
    'only the four report timing kinds appear — no trial_response / gap_shortening leak',
  )
})

Deno.test('CUL-564 — assembleReport extracts a merged ⑤+L1 timing_story (both bands, one denominator)', () => {
  // A same-symptom co-fire: rapid vomits (⑤, ≤30 min after a feeding) AND long vomits (L1, ≥6h after)
  // for vomiting, which compose into ONE timing_story. This exercises runDetection's timing_story
  // EXTRACTION end-to-end — the `f.rapid.count` / `f.long.count` field mapping the render then reads
  // (a field-swap there would silently mis-report the merged card, the class of bug CUL-564 fixes).
  // Feedings at 01/09/17 UTC daily; rapid vomits at 09:20Z (20 min after the 09:00 feeding), long at
  // 08:00Z (7h after the 01:00 feeding), one mid at 04:00Z. UTC instants — ⑤/L1 read raw gaps.
  const events: ReportEventInput[] = []
  for (let d = 5; d <= 27; d++) {
    const date = `2026-05-${String(d).padStart(2, '0')}`
    events.push(ratedMealEvent(date, '01:00:00', 'all'))
    events.push(ratedMealEvent(date, '09:00:00', 'all'))
    events.push(ratedMealEvent(date, '17:00:00', 'all'))
  }
  for (const d of [15, 16, 17]) events.push(makeEvent({ type: 'vomit', occurredAt: at(`2026-05-${d}`, '09:20:00') }))
  for (const d of [18, 19, 20, 21, 22, 23]) events.push(makeEvent({ type: 'vomit', occurredAt: at(`2026-05-${d}`, '08:00:00') }))
  events.push(makeEvent({ type: 'vomit', occurredAt: at('2026-05-24', '04:00:00') }))

  const snap = assembleReport(baseInput({ now: '2026-05-30T12:00:00Z', events }))

  const story = snap.correlation.timing.find(
    (t): t is Extract<TimingFinding, { kind: 'timing_story' }> => t.kind === 'timing_story',
  )
  assert.ok(story, 'a merged ⑤+L1 timing_story is extracted (not dropped, not left as two separate cards)')
  assert.ok(story!.detail.rapidCount >= 1, 'the post-prandial band is populated')
  assert.ok(story!.detail.longCount >= 1, 'the empty-stomach band is populated')
  // The cold-read invariant (CUL-564): the two bands are subsets of ONE shared eligible denominator,
  // which never exceeds the logged episode count — a rendered "N of M" can never claim M > the events.
  assert.ok(
    story!.detail.rapidCount + story!.detail.longCount <= story!.detail.eligibleCount,
    'rapid + long are subsets of the shared eligible denominator',
  )
  assert.ok(story!.detail.eligibleCount <= story!.detail.totalEpisodes, 'eligible never exceeds total episodes')
  const loggedVomits = events.filter((e) => e.type === 'vomit').length
  assert.ok(story!.detail.totalEpisodes <= loggedVomits, 'total episodes never exceeds the logged vomit count')

  // composeTimingStory consumed both originals — the lone ⑤/L1 cards must NOT also appear for the same
  // symptom, or timingLine would double-render it.
  assert.ok(
    !snap.correlation.timing.some((t) => t.kind === 'postprandial_timing' || t.kind === 'empty_stomach_timing'),
    'the lone ⑤/L1 cards are consumed by the merge — no double-render',
  )
})
