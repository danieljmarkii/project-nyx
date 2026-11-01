// CUL-2289 (vet report v2, VR2-9) — the two exports the report's R-11 exemption reads:
// `foldedWorsening` (condition 3) and `chronicitySpanTier` (condition 4). Neither changes what the
// engine fires; these tests pin what each answers, against the shipped composition.
//
// Run with:  deno test supabase/functions/generate-signal/detection.v2Exports.test.ts
import { strict as assert } from 'node:assert'
import {
  chronicityFloorsFor,
  chronicitySpanTier,
  detectChronicity,
  detectSignals,
  foldedWorsening,
  DEFAULT_CONFIG,
  type DetectionInput,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

const HOUR = 3_600_000
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 16, 20)
let seq = 0
const iso = (ms: number): string => new Date(ms).toISOString()
const ago = (days: number, hour = 9): number => Math.floor((NOW - days * DAY) / DAY) * DAY + hour * HOUR

const signs = (type: SymptomType, days: readonly number[]): SymptomEvent[] =>
  days.map((d) => ({ id: `s-${++seq}`, type, occurredAt: iso(ago(d)) }))

function meals(from: number, to: number): MealEvent[] {
  const out: MealEvent[] = []
  for (let d = from; d >= to; d--) {
    out.push({ id: `m-${++seq}`, occurredAt: iso(ago(d, 18)), foodItemId: null, primaryProtein: null, intakeRating: null, foodType: 'meal', foodLabel: null })
  }
  return out
}

const input = (symptomEvents: SymptomEvent[], mealEvents = meals(56, 0)): DetectionInput => ({
  pet: { name: 'Cooper', species: 'dog', dietTrialActive: true },
  symptomEvents,
  mealEvents,
  now: iso(NOW),
})

/** Itching about every five days for seven weeks. */
const steadyItch = (): SymptomEvent[] => signs('itch', [50, 45, 40, 35, 30, 25, 20, 15, 10, 3])

Deno.test('foldedWorsening — a steady course reads not_rising; a jump to 5 in 7 days reads rising', () => {
  assert.equal(foldedWorsening(input(steadyItch()), DEFAULT_CONFIG, 'itch'), 'not_rising')
  const jump = input([...steadyItch().filter((e) => Date.parse(e.occurredAt) < ago(7)), ...signs('itch', [6, 5, 4, 2, 1])])
  assert.equal(foldedWorsening(jump, DEFAULT_CONFIG, 'itch'), 'rising')
  // The rise the export sees is the one the composition folded away: no ④ card survives.
  const composed = detectSignals(jump, DEFAULT_CONFIG).map((r) => r.finding)
  assert.equal(composed.some((f) => f.type === 'symptom_chronicity' && f.symptomType === 'itch'), true)
  assert.equal(composed.some((f) => f.type === 'symptom_worsening' && f.symptomType === 'itch'), false)
})

Deno.test('foldedWorsening — judged on the sign alone: a steeper rise elsewhere does not hide this one', () => {
  // Itch rises 1 → 5; vomiting rises 0 → 8. ④'s single card goes to vomiting, never itch.
  const events = [
    ...steadyItch().filter((e) => Date.parse(e.occurredAt) < ago(7)),
    ...signs('itch', [6, 5, 4, 2, 1]),
    ...signs('vomit', [6, 6, 5, 4, 4, 3, 2, 1]).map((e, i) => ({ ...e, occurredAt: iso(Date.parse(e.occurredAt) + (i % 2) * 6 * HOUR) })),
  ]
  assert.equal(foldedWorsening(input(events), DEFAULT_CONFIG, 'itch'), 'rising')
})

Deno.test('foldedWorsening — a dark prior week, or a sign outside ④’s lane, is not_measured', () => {
  const darkPrior = input(
    [...steadyItch().filter((e) => Date.parse(e.occurredAt) < ago(14)), ...signs('itch', [6, 5, 4, 2, 1])],
    [...meals(56, 15), ...meals(6, 0)],
  )
  assert.equal(foldedWorsening(darkPrior, DEFAULT_CONFIG, 'itch'), 'not_measured')
  assert.equal(foldedWorsening(input(signs('cough', [20, 14, 9, 5, 2, 1])), DEFAULT_CONFIG, 'cough'), 'not_measured')
})

Deno.test('chronicitySpanTier — the span-only rule the tier resolver applies', () => {
  const floor = chronicityFloorsFor('itch', 'dog', DEFAULT_CONFIG.chronicity).firmSpanDays
  assert.equal(chronicitySpanTier('itch', floor, 'dog', DEFAULT_CONFIG.chronicity), 'firm')
  assert.equal(chronicitySpanTier('itch', floor - 1, 'dog', DEFAULT_CONFIG.chronicity), 'standard')
  // Equal to the detector's own tier on a course nothing lends a tier to.
  const f = detectChronicity(input(steadyItch()), DEFAULT_CONFIG).find((x) => x.symptomType === 'itch')
  assert.ok(f)
  assert.equal(chronicitySpanTier('itch', f.spanDays, 'dog', DEFAULT_CONFIG.chronicity), f.tier)
})
