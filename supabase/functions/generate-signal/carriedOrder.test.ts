// CUL-2605: a carried safety card takes its place in the safety band by the band's own order.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/carriedOrder.test.ts
//
// The shape, through the real pipeline over rows shaped like PostgREST's (C-35): a cat that ate her
// usual food for twelve days refuses it twice yesterday, so yesterday's row leads with the call-today
// all-refused card, then "just turned down". This morning she eats a different food well, and part of
// the record does not load (the symptoms pull here; an unsent device row does the same). The
// all-refused card no longer fires and is CARRIED; "just turned down" is reproduced. Before this,
// the carried card was appended after the fresh one, so Home's lead and Ask's safety line said "if
// it carries on" over "a call to your vet". Proven by mutation: restoring the append reds the first
// test; dropping the strict `<` for `<=` in `placeCarried` reds the tie case.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { placeCarried, runSignalPipeline, templatePayload, type MealEventRow, type SignalRows } from './pipeline.ts'
import type { CachedFinding } from './phrasing.ts'
import { EMPTY_CARE_RECORD } from './careState.ts'
import { leadingSafetyText } from '../ask/answer.ts'

const DAY = 86_400_000
const NOW_MS = Date.parse('2026-09-10T12:00:00.000Z')
const at = (days: number, hour: number): string => {
  const d = new Date(NOW_MS - days * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
const food = (name: string) => ({ primary_protein: 'chicken', proteins: ['chicken'], food_type: 'meal', format: 'wet', brand: 'Acme', product_name: name })
let n = 0
const meal = (days: number, hour: number, rating: string, foodId: string): MealEventRow => ({
  id: `meal-${String(++n).padStart(4, '0')}`,
  occurred_at: at(days, hour),
  occurred_at_confidence: null,
  meals: { food_item_id: foodId, intake_rating: rating, food_items: food(foodId) },
})
const usualFortnight = (): MealEventRow[] => {
  const out: MealEventRow[] = []
  for (let d = 2; d <= 13; d++) out.push(meal(d, 8, 'all', 'usual'), meal(d, 18, 'all', 'usual'))
  return out
}
const rowsOf = (meals: MealEventRow[]): SignalRows => ({
  pet: { name: 'Miso', species: 'cat' },
  symptoms: [],
  meals,
  activeTrials: [],
  arrangements: [],
  timezone: 'UTC',
  regimens: [],
  doseEvents: [],
  incidentAnalyses: [],
})
const runAt = (nowMs: number, meals: MealEventRow[], incomplete: string[], prior: { findings: unknown; generatedAt: string } | null) =>
  runSignalPipeline({
    rows: rowsOf(meals),
    incompletePulls: incomplete,
    prior: prior ? { ...prior, engineFlags: { on: [], readOk: true } } : null,
    priorReadFailed: false,
    nowMs,
    engineFlags: { on: [], readOk: true },
    careRecord: EMPTY_CARE_RECORD,
    careContextFacts: null,
    weightFacts: null,
  })
type Entry = { finding: unknown }
const triggerOf = (f: Entry) => (f.finding as { trigger?: string }).trigger
const carriedOf = (f: Entry) => typeof (f.finding as { carriedFrom?: unknown }).carriedFrom === 'string'

function yesterdayAndToday() {
  const yesterdayEvening = Date.parse(at(1, 20))
  const yesterdayMeals = [...usualFortnight(), meal(1, 8, 'refused', 'usual'), meal(1, 13, 'refused', 'usual')]
  const yesterday = templatePayload(runAt(yesterdayEvening, yesterdayMeals, [], null))
  const todayMeals = [...yesterdayMeals, meal(0, 8, 'all', 'other')]
  const today = templatePayload(
    runAt(NOW_MS, todayMeals, ['symptoms'], { findings: yesterday.findings, generatedAt: new Date(yesterdayEvening).toISOString() }),
  )
  return { yesterday, today }
}

Deno.test('CUL-2605: the shape is real — yesterday led with the call today, today it is carried', () => {
  const { yesterday, today } = yesterdayAndToday()
  // Yesterday: the all-refused call today leads "just turned down" (CUL-2593's rank).
  assertEquals(yesterday.findings.map(triggerOf), ['consecutive_low', 'refused_normal_food'])
  assertStrictEquals((yesterday.findings[0].finding as { allRefused?: boolean }).allRefused, true)
  // Today: "just turned down" is reproduced; the all-refused card is carried, not recomputed.
  const carried = today.findings.filter(carriedOf)
  assertEquals(carried.map(triggerOf), ['consecutive_low'])
})

Deno.test('CUL-2605: a carried call today leads a fresh "just turned down", on Home and in Ask', () => {
  const { today } = yesterdayAndToday()
  assertEquals(today.findings.map(triggerOf), ['consecutive_low', 'refused_normal_food'])
  assertStrictEquals(carriedOf(today.findings[0]), true)
  assertEquals(today.findings.map((f) => f.rank), [0, 1])
  // Home's headline and Ask's safety line are the louder card's.
  assertStrictEquals(today.signalText, today.findings[0].text)
  assertStrictEquals(/call your vet today/.test(today.signalText), true)
  const ask = leadingSafetyText(
    today.findings.map((f) => ({ type: f.finding.type, priorityClass: (f.finding as { priorityClass?: unknown }).priorityClass, payload: { text: f.text, finding: f.finding } })),
    'Miso',
  )
  assertStrictEquals(ask !== null && /call your vet today/.test(ask), true, `Ask led with: ${ask}`)
})

// The merge on its own: it only inserts, the carried go in band order, and a tie leaves the fresh card first.
const card = (trigger: string, text: string, extra: Record<string, unknown> = {}): CachedFinding => ({
  rank: 0,
  text,
  finding: { type: 'intake_decline', priorityClass: 'safety', trigger, species: 'cat', ...extra } as unknown as CachedFinding['finding'],
})

Deno.test('CUL-2605: placeCarried never moves a fresh card, orders the carried by the band, and a tie stays behind', () => {
  const fresh = [card('refused_normal_food', 'fresh refusal'), card('refused_then_vomited', 'fresh i5')]
  const callToday = card('consecutive_low', 'carried call', { allRefused: true })
  const softLow = card('consecutive_low', 'carried soft', { allRefused: false })
  // A call today goes first; a soft consecutive-low (rank 2) goes between the two fresh cards.
  assertEquals(placeCarried(fresh, [callToday, softLow]).map((f) => f.text), ['carried call', 'fresh refusal', 'carried soft', 'fresh i5'])
  // A prior row holding them softest-first (written before a rank change) is put in band order.
  assertEquals(placeCarried(fresh, [softLow, callToday]).map((f) => f.text), ['carried call', 'fresh refusal', 'carried soft', 'fresh i5'])
  // A tie: the fresh card stays first.
  const carriedRefusal = card('refused_normal_food', 'carried refusal')
  assertEquals(placeCarried(fresh, [carriedRefusal]).map((f) => f.text), ['fresh refusal', 'carried refusal', 'fresh i5'])
  // Nothing to outrank: last.
  assertEquals(placeCarried([callToday], [softLow]).map((f) => f.text), ['carried call', 'carried soft'])
})
