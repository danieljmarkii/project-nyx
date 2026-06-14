// Unit tests for the AI summary's PURE layer (B-023 PR 4).
//
// Run with:  deno test supabase/functions/generate-signal/summary.test.ts
//
// Covers the clinically/voice load-bearing logic in ./summary.ts that must NOT be left to
// the LLM (the §7 "LLM as Phraser, never Analyst" guarantee):
//   - buildSummaryPacket — clause priority (safety leads), grounding (allowedNumbers derived
//     from the clauses), the never-reassure-alongside-a-concern omission of finished-rate.
//   - summaryTemplate    — the deterministic fallback passes its own validator for EVERY
//     emittable shape (clinical-guardrails Pattern 8 — the invariant is a test, not a comment).
//   - validateSummary    — rejects fabricated numbers, reassurance, preference framing, causal
//     claims, disease names, "!", and the silent removal of vet-routing on a safety summary.
//   - extractNumbers     — the grounding primitive (digits + number-words, word-boundaried).
// The DB reads and the live Claude call are I/O and are exercised by the Manual QA Script.

import { strict as assert } from 'node:assert'
import type {
  IntakeDeclineFinding,
  MealEvent,
  ReflectionFinding,
  SymptomEvent,
  SymptomWorseningFinding,
} from './detection.ts'
import {
  buildSummaryPacket,
  extractNumbers,
  summaryTemplate,
  validateSummary,
  type SummaryFactPacket,
} from './summary.ts'

const NOW = '2026-06-14T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const DAY = 86_400_000
const daysAgoIso = (n: number) => new Date(NOW_MS - n * DAY).toISOString()

// ── Fixtures ───────────────────────────────────────────────────────────────────────────

function declineFinding(over: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding {
  return {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'refused_normal_food',
    species: 'cat',
    baselineScore: 3.5,
    recentScore: 0,
    daysBelowBaseline: 0,
    refusedFoodLabel: 'Tiki Cat Tuna',
    ratedMealsConsidered: 6,
    ...over,
  }
}

function worseningFinding(over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding {
  return {
    type: 'symptom_worsening',
    priorityClass: 'safety',
    symptomType: 'vomit',
    currentCount: 5,
    priorCount: 2,
    currentDays: 5,
    priorDays: 2,
    trigger: 'more_days',
    tier: 'firm',
    windowDays: 7,
    ...over,
  }
}

function reflectionFinding(over: Partial<ReflectionFinding> = {}): ReflectionFinding {
  return {
    type: 'reflection',
    priorityClass: 'insight',
    symptomType: 'vomit',
    currentCount: 1,
    priorCount: 4,
    direction: 'improving',
    windowDays: 7,
    ...over,
  }
}

let mealSeq = 0
function meal(over: Partial<MealEvent> = {}): MealEvent {
  return {
    id: `m${mealSeq++}`,
    occurredAt: daysAgoIso(3),
    foodItemId: 'food-chicken',
    primaryProtein: 'chicken',
    intakeRating: 'all',
    foodType: 'meal',
    foodLabel: 'Acme Chicken Dinner',
    ...over,
  }
}

let symptomSeq = 0
function symptom(over: Partial<SymptomEvent> = {}): SymptomEvent {
  return {
    id: `s${symptomSeq++}`,
    type: 'vomit',
    occurredAt: daysAgoIso(3),
    ...over,
  }
}

/** A meal set that clears both ranking floors (≥4 identified meals, ≥4 rated non-treat). */
function ratedChickenMeals(n: number, rating: MealEvent['intakeRating'] = 'all'): MealEvent[] {
  return Array.from({ length: n }, (_, i) =>
    meal({ occurredAt: daysAgoIso(i + 1), intakeRating: rating }),
  )
}

// ── extractNumbers ──────────────────────────────────────────────────────────────────────

Deno.test('extractNumbers — digits and number-words, word-boundaried', () => {
  assert.deepEqual([...extractNumbers('5 of the last 7 days, up from 2')].sort((a, b) => a - b), [2, 5, 7])
  assert.deepEqual([...extractNumbers('the last three days')], [3])
  // "someone"/"once"/"tone" must NOT register as one/ten.
  const none = extractNumbers('someone went, once, with a flat tone')
  assert.equal(none.has(1), false)
  assert.equal(none.has(10), false)
})

// ── buildSummaryPacket: clause priority + grounding ──────────────────────────────────────

Deno.test('buildSummaryPacket — safety finding leads and sets hasSafety', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [worseningFinding()],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.hasSafety, true)
  assert.match(packet!.clauses[0], /vomiting on 5 of the last 7 days/)
  assert.ok(packet!.evidence.includes('symptom'))
})

Deno.test('buildSummaryPacket — finished-rate is OMITTED alongside a safety concern', () => {
  // A healthy-looking month rate must never sit next to a current concern and read as
  // reassurance. Protein (neutral) may appear; the finished-rate clause must not.
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [declineFinding()],
    mealEvents: ratedChickenMeals(8, 'all'),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.hasSafety, true)
  assert.equal(
    packet!.clauses.some((c) => /finished most or all/.test(c)),
    false,
    'finished-rate clause must be omitted on a safety summary',
  )
})

Deno.test('buildSummaryPacket — quiet pet: descriptive intake + finished-rate, no reassurance', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: ratedChickenMeals(10, 'all'),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.hasSafety, false)
  assert.equal(packet!.quiet, true)
  assert.ok(packet!.clauses.some((c) => /most-logged meal protein/.test(c)))
  assert.ok(packet!.clauses.some((c) => /finished most or all of 10 of 10/.test(c)))
  // The template the quiet packet produces must itself be clean (Pattern 8).
  assert.equal(validateSummary(summaryTemplate(packet!), packet!), true)
})

Deno.test('buildSummaryPacket — reflection drives the lead when no safety finding', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [reflectionFinding()],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.hasSafety, false)
  assert.equal(packet!.quiet, false)
  assert.match(packet!.clauses[0], /down from 4 last week/)
})

Deno.test('buildSummaryPacket — descriptive symptom fallback when symptoms logged but no finding', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: [],
    symptomEvents: [symptom({ type: 'itch' }), symptom({ type: 'itch' })],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.match(packet!.clauses[0], /I've logged 2 episodes of itching for Pixel this month/)
})

Deno.test('buildSummaryPacket — out-of-window meals/symptoms are excluded from the month', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: ratedChickenMeals(6).map((m) => ({ ...m, occurredAt: daysAgoIso(45) })),
    symptomEvents: [symptom({ occurredAt: daysAgoIso(45) })],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  // Nothing in the trailing 30 days → nothing substantive → null (client owns building state).
  assert.equal(packet, null)
})

Deno.test('buildSummaryPacket — below-floor intake never invents a ranking', () => {
  // 3 meals < MIN_MEALS_FOR_RANKING(4): no protein clause, no finished-rate clause.
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: ratedChickenMeals(3),
    symptomEvents: [symptom()],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.clauses.some((c) => /most-logged meal protein/.test(c)), false)
  assert.equal(packet!.clauses.some((c) => /finished most or all/.test(c)), false)
})

Deno.test('buildSummaryPacket — free-fed meals excluded from finished-rate (§11 #6)', () => {
  // 5 meals all free-fed → denominator below floor → no finished-rate clause.
  const meals = ratedChickenMeals(5).map((m) => ({ ...m, foodItemId: 'free-bowl' }))
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: meals,
    symptomEvents: [],
    freeFedFoodIds: new Set(['free-bowl']),
    nowMs: NOW_MS,
  })
  // Protein ranking still counts them (top protein includes free-fed), but the finished-rate
  // must be suppressed because intake wasn't directly observed.
  if (packet) {
    assert.equal(packet.clauses.some((c) => /finished most or all/.test(c)), false)
  }
})

Deno.test('buildSummaryPacket — treats excluded from finished-rate denominator (§11 #1)', () => {
  // 5 rated TREATS + 2 rated meals → only 2 meals in the denominator → below floor → no rate.
  const meals = [
    ...ratedChickenMeals(5).map((m) => ({ ...m, foodType: 'treat' as const, foodItemId: 'treat-x' })),
    ...ratedChickenMeals(2),
  ]
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: meals,
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  if (packet) {
    assert.equal(packet.clauses.some((c) => /finished most or all/.test(c)), false)
  }
})

Deno.test('buildSummaryPacket — allowedNumbers covers every number in the template', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [worseningFinding({ trigger: 'more_episodes', currentCount: 6, currentDays: 4, priorCount: 2 })],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  const allowed = new Set(packet!.allowedNumbers)
  for (const n of extractNumbers(summaryTemplate(packet!))) {
    assert.equal(allowed.has(n), true, `template number ${n} must be in allowedNumbers`)
  }
})

Deno.test('buildSummaryPacket — capped at four sentences, safety kept first', () => {
  const packet = buildSummaryPacket({
    petName: 'Pixel',
    findings: [declineFinding(), worseningFinding()],
    mealEvents: ratedChickenMeals(8),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.ok(packet!.clauses.length <= 4)
  // Both safety clauses survive the cap.
  assert.ok(packet!.clauses.some((c) => /turned down/.test(c)))
  assert.ok(packet!.clauses.some((c) => /the last 7 days/.test(c)))
})

// ── summaryTemplate passes validateSummary for EVERY shape (Pattern 8) ────────────────────

Deno.test('summaryTemplate — every emittable shape passes its own validator and never reassures', () => {
  const scenarios: SummaryFactPacket[] = [
    buildSummaryPacket({ petName: 'Pixel', findings: [worseningFinding()], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({ petName: 'Pixel', findings: [declineFinding({ trigger: 'consecutive_low', daysBelowBaseline: 3, refusedFoodLabel: null })], mealEvents: ratedChickenMeals(8), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({ petName: 'Pixel', findings: [reflectionFinding({ direction: 'flat', currentCount: 3, priorCount: 3 })], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({ petName: 'Pixel', findings: [], mealEvents: ratedChickenMeals(10), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({ petName: 'Pixel', findings: [], mealEvents: [], symptomEvents: [symptom(), symptom()], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
  ]
  for (const packet of scenarios) {
    assert.ok(packet, 'scenario should produce a packet')
    const text = summaryTemplate(packet)
    assert.equal(validateSummary(text, packet), true, `template must validate: "${text}"`)
    assert.equal(/\b(fine|okay|healthy|all clear|doing well|on the mend)\b/i.test(text), false, `must not reassure: "${text}"`)
    assert.equal(/\b(picky|fussy|favou?rite|prefers?)\b/i.test(text), false, `must not frame as preference: "${text}"`)
    assert.equal(/\b(because|caused?|due to)\b/i.test(text), false, `must not assert cause: "${text}"`)
    assert.equal(text.includes('!'), false, `no exclamation: "${text}"`)
  }
})

Deno.test('summaryTemplate — a safety summary always routes to the vet', () => {
  for (const f of [worseningFinding(), declineFinding(), worseningFinding({ tier: 'soft', trigger: 'more_days' })]) {
    const packet = buildSummaryPacket({ petName: 'Pixel', findings: [f], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!
    assert.match(summaryTemplate(packet), /\bvet\b/i)
  }
})

// ── validateSummary: the model-drift screens ─────────────────────────────────────────────

function quietPacket(): SummaryFactPacket {
  return buildSummaryPacket({
    petName: 'Pixel',
    findings: [],
    mealEvents: ratedChickenMeals(10),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
}

function safetyPacket(): SummaryFactPacket {
  return buildSummaryPacket({
    petName: 'Pixel',
    findings: [worseningFinding()],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
}

Deno.test('validateSummary — rejects a fabricated number not in the packet', () => {
  const p = quietPacket() // allows 10
  assert.equal(validateSummary('Chicken was Pixel\'s most-logged meal protein this month. Pixel finished most or all of 10 of 10 logged meals this month.', p), true)
  // 9 is not in the allowed set → reject.
  assert.equal(validateSummary('Chicken was Pixel\'s top protein. Pixel finished 9 of 10 meals this month.', p), false)
})

Deno.test('validateSummary — rejects reassurance (incl. on absence)', () => {
  const p = quietPacket()
  assert.equal(validateSummary('Pixel is doing well this month, eating plenty. Keep logging for Pixel.', p), false)
  assert.equal(validateSummary('Everything looks fine for Pixel. Keep logging for Pixel.', p), false)
})

Deno.test('validateSummary — rejects preference framing', () => {
  const p = quietPacket()
  assert.equal(validateSummary('Chicken is clearly Pixel\'s favourite this month. Keep logging for Pixel.', p), false)
  assert.equal(validateSummary('Pixel seems a little picky this month. Keep logging for Pixel.', p), false)
})

Deno.test('validateSummary — rejects causal claims', () => {
  const p = safetyPacket()
  assert.equal(validateSummary('Pixel had vomiting on 5 of the last 7 days because of the new food — see your vet.', p), false)
})

Deno.test('validateSummary — rejects disease / diagnosis names', () => {
  const p = safetyPacket()
  assert.equal(validateSummary('Pixel had vomiting on 5 of the last 7 days, which may be pancreatitis — see your vet.', p), false)
  assert.equal(validateSummary('Pixel had vomiting on 5 of the last 7 days, possibly an allergy — see your vet.', p), false)
})

Deno.test('validateSummary — a safety summary that drops the vet routing is rejected', () => {
  const p = safetyPacket()
  // Plausible, number-clean, but the model smoothed away the vet guidance.
  assert.equal(validateSummary('Pixel has had vomiting on 5 of the last 7 days, up from 2 the week before. I\'ll keep watching the logs with you.', p), false)
  // The same content WITH the vet routing kept passes.
  assert.equal(validateSummary('Pixel has had vomiting on 5 of the last 7 days, up from 2 the week before, which is worth a vet visit soon. I\'ll keep watching the logs.', p), true)
})

Deno.test('validateSummary — structural: "!", length, sentence count', () => {
  const p = quietPacket()
  // Exclamation mark — banned.
  assert.equal(validateSummary('Chicken was Pixel\'s most-logged meal protein this month! Keep logging.', p), false)
  // Below the minimum length.
  assert.equal(validateSummary('Too short.', p), false)
  // Five sentences exceeds the four-sentence cap (number-word-free so this tests count only).
  assert.equal(
    validateSummary('Alpha note for Pixel. Beta note here. Gamma note here. Delta note here. Epsilon note about logging.', p),
    false,
  )
})

Deno.test('validateSummary — accepts a faithful model paraphrase that preserves numbers + vet', () => {
  const p = safetyPacket()
  const good =
    'Pixel has had vomiting on 5 of the last 7 days, up from 2 the week before — worth a vet visit soon. Chicken was Pixel\'s most-logged meal protein this month.'
  assert.equal(validateSummary(good, p), true)
})
