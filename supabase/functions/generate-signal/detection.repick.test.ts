// CUL-2022 (PM ruling (a), 2026-10-19): the one getting-worse card goes to the steepest rise among
// the signs no other card already speaks for.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/detection.repick.test.ts
//
// ④ emits one card, the steepest rise. When that sign's card is folded into an ongoing card (⑦,
// in the engine) or dropped under the burden card (Home), a second sign rising behind it used to
// be flagged nowhere. The counterexample from the adversarial pass on CUL-1995: a dog with
// ongoing, rising vomiting and loose stool going from 0 to 3 this week.

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  detectBurden,
  detectSignals,
  detectWorsening,
  repickWorseningPastChronic,
  type DetectionInput,
  type Finding,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'
import { suppressWorseningUnderBurden } from './pipeline.ts'

const DAY = 86_400_000
const NOW = '2026-07-02T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)

let seq = 0
const ago = (days: number, utcHour = 9): string => {
  const d = new Date(NOW_MS - days * DAY)
  d.setUTCHours(utcHour, 0, 0, 0)
  return d.toISOString()
}
const sign = (type: SymptomType, days: number, utcHour = 9): SymptomEvent => ({ id: `s-${++seq}`, type, occurredAt: ago(days, utcHour) })
const meal = (days: number): MealEvent => ({
  id: `m-${++seq}`,
  occurredAt: ago(days, 7),
  foodItemId: 'food-1',
  primaryProtein: 'chicken',
  intakeRating: 'all',
  foodType: 'meal',
  foodLabel: 'Acme Chicken',
})
const input = (symptomEvents: SymptomEvent[]): DetectionInput => ({
  pet: { name: 'Cooper', species: 'dog', dietTrialActive: false },
  symptomEvents,
  mealEvents: Array.from({ length: 90 }, (_, d) => meal(d)),
  timezone: 'UTC',
  now: NOW,
})

// Ongoing vomiting, weekly for five weeks, then 4 this week against 1 the week before.
const ONGOING_RISING_VOMIT = [43, 36, 29, 22, 15, 6, 4, 2, 1].map((d) => sign('vomit', d))
// Loose stool, 0 the week before, 3 this week.
const DIARRHEA_0_TO_3 = [5, 3, 1].map((d) => sign('diarrhea', d, 20))

const cards = (findings: readonly Finding[], type: Finding['type']) =>
  findings.filter((f) => f.type === type).map((f) => (f as { symptomType: SymptomType }).symptomType)

Deno.test('the counterexample: the loose-stool rise is flagged, and the ongoing vomiting card keeps its firm tier', () => {
  const inp = input([...ONGOING_RISING_VOMIT, ...DIARRHEA_0_TO_3])
  // The precondition the bug needs: the bare pick is vomiting, the sign the ongoing card absorbs.
  assert.deepEqual(cards(detectWorsening(inp), 'symptom_worsening'), ['vomit'])
  const out = detectSignals(inp).map((r) => r.finding)
  assert.deepEqual(cards(out, 'symptom_chronicity'), ['vomit'])
  assert.deepEqual(cards(out, 'symptom_worsening'), ['diarrhea'], 'one getting-worse card, the next-steepest')
  const chronic = out.find((f) => f.type === 'symptom_chronicity')
  assert.equal(chronic && chronic.type === 'symptom_chronicity' && chronic.tier, 'firm', 'inheritance unchanged')
})

Deno.test('the steepest rise among the non-ongoing signs wins, and only one card is raised', () => {
  const itchZeroToTwo = [4, 2].map((d) => sign('itch', d, 14))
  const out = detectSignals(input([...ONGOING_RISING_VOMIT, ...itchZeroToTwo, ...DIARRHEA_0_TO_3])).map((r) => r.finding)
  assert.deepEqual(cards(out, 'symptom_worsening'), ['diarrhea'])
  // Mirror: the steeper sign wins whichever it is.
  const itchZeroToFour = [5, 4, 3, 2].map((d) => sign('itch', d, 14))
  const out2 = detectSignals(input([...ONGOING_RISING_VOMIT, ...itchZeroToFour, ...DIARRHEA_0_TO_3])).map((r) => r.finding)
  assert.deepEqual(cards(out2, 'symptom_worsening'), ['itch'])
})

Deno.test('only the ongoing sign rose: no getting-worse card, as before', () => {
  const flatDiarrhea = [sign('diarrhea', 10, 20), sign('diarrhea', 3, 20)]
  const out = detectSignals(input([...ONGOING_RISING_VOMIT, ...flatDiarrhea])).map((r) => r.finding)
  assert.deepEqual(cards(out, 'symptom_worsening'), [])
  assert.deepEqual(cards(out, 'symptom_chronicity'), ['vomit'])
})

Deno.test('repickWorseningPastChronic is the identity when no card was folded, and the default exclude is the bare pick', () => {
  const inp = input(DIARRHEA_0_TO_3)
  const bare = detectWorsening(inp)
  assert.deepEqual(detectWorsening(inp, DEFAULT_CONFIG, new Set()), bare)
  const findings: Finding[] = [...bare]
  assert.equal(repickWorseningPastChronic(findings, inp), findings)
})

// ── Home: the burden card's fold ───────────────────────────────────────────────

// Vomiting on four days running this week (the burden card), none the week before; loose stool 0
// to 2 behind it. Not ongoing: the vomiting is all this week.
const BURDEN_VOMIT = [4, 3, 2, 1].map((d) => sign('vomit', d))
const DIARRHEA_0_TO_2 = [3, 1].map((d) => sign('diarrhea', d, 20))

Deno.test('Home: a ④ dropped under the burden card hands its slot to the next-steepest rise', () => {
  const inp = input([...BURDEN_VOMIT, ...DIARRHEA_0_TO_2])
  assert.equal(detectBurden(inp).length, 1, 'the burden card fires')
  const ranked = detectSignals(inp)
  assert.deepEqual(cards(ranked.map((r) => r.finding), 'symptom_worsening'), ['vomit'], 'precondition: the engine picks vomiting')
  const out = suppressWorseningUnderBurden(ranked, (exclude) => detectWorsening(inp, DEFAULT_CONFIG, exclude))
  assert.deepEqual(cards(out.map((r) => r.finding), 'symptom_worsening'), ['diarrhea'])
  const slot = ranked.findIndex((r) => r.finding.type === 'symptom_worsening')
  assert.equal(out[slot].finding.type, 'symptom_worsening', 'in the dropped card\'s place')
  assert.deepEqual(out.map((r) => r.rank), out.map((_, i) => i))
  // Without a repick the drop is what it was.
  assert.deepEqual(cards(suppressWorseningUnderBurden(ranked).map((r) => r.finding), 'symptom_worsening'), [])
})

Deno.test('Home: nothing else rising, the drop leaves no card, and an ongoing sign is never re-picked', () => {
  const inp = input(BURDEN_VOMIT)
  const repick = (exclude: ReadonlySet<SymptomType>) => detectWorsening(inp, DEFAULT_CONFIG, exclude)
  assert.deepEqual(cards(suppressWorseningUnderBurden(detectSignals(inp), repick).map((r) => r.finding), 'symptom_worsening'), [])
  // A chronicity card on a sign excludes it from the repick, even when its ④ was not the one dropped.
  const seen: SymptomType[][] = []
  const ranked = [
    { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit' },
    { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'itch' },
    { type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'vomit' },
  ].map((f, rank) => ({ rank, finding: f as unknown as Finding }))
  suppressWorseningUnderBurden(ranked, (exclude) => {
    seen.push([...exclude].sort())
    return []
  })
  assert.deepEqual(seen, [['itch', 'vomit']])
})
