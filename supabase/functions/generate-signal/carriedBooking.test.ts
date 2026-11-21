// CUL-2794: a carried safety card never carries a booked-visit date.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/carriedBooking.test.ts
//
// Over an incomplete read, `carryPriorSafety` brings back yesterday's safety cards. It already drops
// their care state and care carry (EN-9 D1, CUL-2662); the top-level `bookedVisit` that
// `withBookedVisit` puts on an escalation rode along, so Home kept "Visit booked for <date>" beside
// the ask for up to CARRY_MAX_DAYS, on a booking no fresh read confirmed (cancelled, or a phantom).
// Through the real pipeline: yesterday's call-today card is stamped with a booking, today's read
// misses the symptoms pull, and the carried card must come back exactly as the unstamped one does:
// same text, same rank, same finding, so the ask the client derives from it is untouched.
// Proven by mutation: removing `bookedVisit` from carryPriorSafety's destructure reds both tests.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runSignalPipeline, templatePayload, type MealEventRow, type SignalRows } from './pipeline.ts'
import { EMPTY_CARE_RECORD } from './careState.ts'

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
type Entry = { rank: number; text: string; finding: unknown }
const carriedOf = (f: Entry) => typeof (f.finding as { carriedFrom?: unknown }).carriedFrom === 'string'

const BOOKED = { on: '2026-09-14', appointmentId: 'cancelled-since', passed: false }

/** Yesterday's row (its call-today card optionally stamped as the care step stamps an escalation), then today's incomplete read. */
function today(stamp: boolean): Entry[] {
  const usual: MealEventRow[] = []
  for (let d = 2; d <= 13; d++) usual.push(meal(d, 8, 'all', 'usual'), meal(d, 18, 'all', 'usual'))
  const yesterdayEvening = Date.parse(at(1, 20))
  const yesterdayMeals = [...usual, meal(1, 8, 'refused', 'usual'), meal(1, 13, 'refused', 'usual')]
  const yesterday = templatePayload(runAt(yesterdayEvening, yesterdayMeals, [], null))
  const priorFindings = stamp
    ? yesterday.findings.map((f, i) =>
      i === 0
        ? {
          ...f,
          finding: {
            ...(f.finding as unknown as Record<string, unknown>),
            bookedVisit: BOOKED,
            careState: { state: 'visit_booked', bookedVisit: BOOKED, text: 'Visit booked for Monday.' },
            careCarry: { state: 'visit_booked', ackId: 'a1' },
          },
        }
        : f
    )
    : yesterday.findings
  const todayMeals = [...yesterdayMeals, meal(0, 8, 'all', 'other')]
  return templatePayload(
    runAt(NOW_MS, todayMeals, ['symptoms'], { findings: priorFindings, generatedAt: new Date(yesterdayEvening).toISOString() }),
  ).findings as Entry[]
}

Deno.test('CUL-2794: a carried escalation carries no booked visit, care state or care carry', () => {
  const carried = today(true).filter(carriedOf)
  assertStrictEquals(carried.length, 1, 'the call-today card is carried')
  const f = carried[0].finding as Record<string, unknown>
  assertStrictEquals((f as { priorityClass?: unknown }).priorityClass, 'safety')
  assertStrictEquals('bookedVisit' in f, false, 'a carried card names no booking a fresh read did not confirm')
  assertStrictEquals('careState' in f, false)
  assertStrictEquals('careCarry' in f, false)
})

const withoutAskSince = (rows: Entry[]) =>
  rows.map((r) => {
    const { askSinceIso: _drop, ...finding } = r.finding as Record<string, unknown>
    return { ...r, finding }
  })

Deno.test('CUL-2794: the carried card and its ask are exactly the unstamped one', () => {
  const stamped = today(true)
  const plain = today(false)
  // Same cards, same order, same words, same finding: the ask the client reads off it is untouched.
  // CUL-2834's stamp aside, which the next test pins.
  assertEquals(withoutAskSince(stamped), withoutAskSince(plain))
  assertStrictEquals(/call your vet today/.test(stamped[0].text), true, `led with: ${stamped[0].text}`)
})

// CUL-2834 (adversarial pass 1, B1): the carry drops yesterday's quiet care state, so the card asks
// again, and its ask starts again with it: a contact from before that is not set under it. A card
// that was asking all along keeps yesterday's stamp. Proven by mutation: carrying the prior card
// unstamped (no `stampAskSince` on `carried`) reds the first assertion.
Deno.test('CUL-2834: a carried card that lost a quiet care state is stamped now; one that kept its ask keeps its stamp', () => {
  const askOf = (rows: Entry[]) => (rows.filter(carriedOf)[0].finding as { askSinceIso?: string }).askSinceIso
  assertStrictEquals(askOf(today(true)), new Date(NOW_MS).toISOString())
  assertStrictEquals(askOf(today(false)), new Date(Date.parse(at(1, 20))).toISOString())
})
