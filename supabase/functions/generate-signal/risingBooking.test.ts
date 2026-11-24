// CUL-2898: a booked visit never quiets an ongoing card whose own sign is rising (Ruling A).
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/risingBooking.test.ts
//
// Through the real pipeline, EN-9 on: a cat vomiting about weekly for ten weeks (firm on span) with
// a vet visit booked five days out. Steady, the ongoing card goes quiet and names the visit. When the
// vomiting doubles in the last week, ④'s card folds into the ongoing card, and the booking must not
// quiet it: the card stays raised, its ask intact, with the visit's date beside it.
// Proven by mutation both ways: dropping the pipeline's `risingOnSign` wiring reds the steady test
// (no read counts as not measured, so it stays loud); dropping the chronicity arm in careState reds
// the rising test.

import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runSignalPipeline, type MealEventRow, type SignalRows, type SymptomRow } from './pipeline.ts'
import { careStateOf, EMPTY_CARE_RECORD, type CareRecord } from './careState.ts'
import type { Finding } from './detection.ts'
import type { EngineFlags } from '../_shared/engineFlags.ts'

const DAY = 86_400_000
const NOW_MS = Date.parse('2026-09-10T12:00:00.000Z')
const at = (days: number, hour: number): string => {
  const d = new Date(NOW_MS - days * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
const food = { primary_protein: 'chicken', proteins: ['chicken'], food_type: 'meal', format: 'wet', brand: 'Acme', product_name: 'usual' }
const meals: MealEventRow[] = []
for (let d = 0; d <= 90; d++) {
  for (const h of [8, 18]) {
    meals.push({ id: `meal-${d}-${h}`, occurred_at: at(d, h), occurred_at_confidence: null, meals: { food_item_id: 'usual', intake_rating: 'all', food_items: food } })
  }
}
const vomit = (days: number): SymptomRow => ({ id: `v-${days}`, event_type: 'vomit', occurred_at: at(days, 14), occurred_at_confidence: null, severity: null })
// One episode a week for ten weeks: chronic, firm on its span alone, flat week over week.
const WEEKLY = [3, 10, 17, 24, 31, 38, 45, 52, 59, 66].map(vomit)
// The same course, doubled and more in its last week (1 → 4 days): ④ fires and folds into ⑦.
const RISING = [...WEEKLY, vomit(1), vomit(2), vomit(5)]

const BOOKING: CareRecord['appointments'][number] = {
  id: 'appt-5', scheduledAt: at(-5, 15), cancelledAt: null, deletedAt: null, possibleRecheckPhantom: false, attendance: 'unlinked',
}

function run(symptoms: SymptomRow[], appointments: CareRecord['appointments']) {
  const rows: SignalRows = {
    pet: { name: 'Miso', species: 'cat' },
    symptoms,
    meals,
    activeTrials: [],
    arrangements: [],
    timezone: 'UTC',
    regimens: [],
    doseEvents: [],
    incidentAnalyses: [],
  }
  const flags: EngineFlags = { on: ['engines_v3_en9'], readOk: true }
  return runSignalPipeline({
    rows,
    incompletePulls: [],
    prior: null,
    priorReadFailed: false,
    nowMs: NOW_MS,
    engineFlags: flags,
    careRecord: { ...EMPTY_CARE_RECORD, appointments },
    careContextFacts: {
      lastVisitOn: null,
      lastContactOn: null,
      loggedAt: [...meals.map((m) => m.occurred_at), ...symptoms.map((s) => s.occurred_at)],
      readSinceIso: new Date(NOW_MS - 180 * DAY).toISOString(),
    },
    weightFacts: null,
  })
}

const chronicVomit = (findings: { finding: Finding }[]) => {
  const f = findings.find((r) => r.finding.type === 'symptom_chronicity' && r.finding.symptomType === 'vomit')
  assert(f, `no ongoing vomiting card in: ${findings.map((r) => r.finding.type).join(', ')}`)
  return f.finding
}

Deno.test('CUL-2898: a steady ongoing card goes quiet for a booked visit (the differential)', () => {
  const s = careStateOf(chronicVomit(run(WEEKLY, [BOOKING]).findings))!
  assertStrictEquals(s.state, 'visit_booked')
})

Deno.test('CUL-2898: an ongoing card that absorbed a getting-worse card keeps its ask past a booking', () => {
  const findings = run(RISING, [BOOKING]).findings
  assertStrictEquals(findings.some((r) => r.finding.type === 'symptom_worsening' && r.finding.symptomType === 'vomit'), false, 'the getting-worse card is folded in')
  const card = chronicVomit(findings)
  assertStrictEquals((card as { tier?: string }).tier, 'firm')
  const s = careStateOf(card)!
  assertStrictEquals(s.state, 'raised')
  assertStrictEquals(s.text, null, "the lane's own ask stands")
  assertEquals(s.bookedVisit, { on: '2026-09-15', appointmentId: 'appt-5', passed: false })
})

Deno.test('CUL-2898: a passed visit does not quiet it either, and names no date', () => {
  const passed = { ...BOOKING, id: 'appt-past', scheduledAt: at(2, 9) }
  const steady = careStateOf(chronicVomit(run(WEEKLY, [passed]).findings))!
  assertStrictEquals(steady.state, 'visit_booked', 'the differential: a steady course quiets in the week after')
  const s = careStateOf(chronicVomit(run(RISING, [passed]).findings))!
  assertStrictEquals(s.state, 'raised')
  assertStrictEquals('bookedVisit' in s, false)
})

// Adversarial pass 1, Q12: every 14 days, then weekly. Under two a week, so ④'s own test never
// reads a rise, while the card's four-week halves say 4 against 2. The stopgap keeps the ask.
const DOUBLING_SLOWLY = [3, 10, 17, 24, 38, 52, 66, 80].map(vomit)

Deno.test('CUL-2898 stopgap: a low-rate course that doubles keeps its ask past a booking', () => {
  const card = chronicVomit(run(DOUBLING_SLOWLY, [BOOKING]).findings)
  const compare = (card as { compare?: { recentCount: number; priorCount: number } }).compare
  assertEquals([compare?.recentCount, compare?.priorCount], [4, 2], 'the card itself shows the doubling')
  const s = careStateOf(card)!
  assertStrictEquals(s.state, 'raised')
  assertEquals(s.bookedVisit, { on: '2026-09-15', appointmentId: 'appt-5', passed: false })
})
