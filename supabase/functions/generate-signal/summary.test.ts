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
//     claims, disease names, "!", and (CUL-1618) any safety summary that does not open with
//     every safety clause verbatim, or names the vet after them.
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
  shouldPhraseWithModel,
  SUMMARY_MODEL_PHRASING_ENABLED,
  summaryModelPayload,
  summaryTemplate,
  validateSummary,
  type SummaryFactPacket,
} from './summary.ts'
import { watchedSentenceLookup } from './pipeline.ts'
import type { Finding } from './detection.ts'

const NOW = '2026-06-14T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const DAY = 86_400_000
const daysAgoIso = (n: number) => new Date(NOW_MS - n * DAY).toISOString()
// EN-9 off, or no concern watched: every safety card still asks.
const NONE_WATCHED = (_f: Finding): string | null => null

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
    lastFullMealIso: null,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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

Deno.test('buildSummaryPacket — a hidden SECONDARY protein can win the clause (B-467, set membership)', () => {
  // No meal names chicken as its primary, but every meal's captured set carries it — the
  // textbook elimination-trial contaminant. Pre-B-467 the clause read primary_protein alone
  // and named duck; the card and the correlation engine already counted the set (B-351
  // slice 6), so the summary sat above a card it disagreed with. Chicken: 5 meals; duck: 3;
  // salmon: 2 — the secondary wins outright, no tie-break involved.
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [],
    mealEvents: [
      ...Array.from({ length: 3 }, (_, i) =>
        meal({ occurredAt: daysAgoIso(i + 1), primaryProtein: 'duck', proteins: ['duck', 'chicken'] }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        meal({ occurredAt: daysAgoIso(i + 4), primaryProtein: 'salmon', proteins: ['salmon', 'chicken'] }),
      ),
    ],
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.ok(packet!.clauses.some((c) => /Chicken was Pixel's most-logged meal protein/.test(c)))
  // The widened clause still passes the summary's own validator (Pattern 8).
  assert.equal(validateSummary(summaryTemplate(packet!), packet!), true)
})

Deno.test('buildSummaryPacket — a structural tie yields NO protein clause, never an alphabetical winner (B-467 adversarial)', () => {
  // The single-food multi-protein diet — post-B-467 the default tie case: every meal
  // contributes both duck and chicken, so their counts are equal by construction. The old
  // alphabetical tie-break would render "Chicken was the most-logged meal protein" on a
  // duck formula, decided by 'c' < 'd'. A tied superlative is false as stated → no clause.
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [],
    mealEvents: Array.from({ length: 6 }, (_, i) =>
      meal({ occurredAt: daysAgoIso(i + 1), primaryProtein: 'duck', proteins: ['duck', 'chicken'], intakeRating: 'all' }),
    ),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet) // the finished-rate clause still renders — only the superlative is withheld
  assert.equal(packet!.clauses.some((c) => /most-logged meal protein/.test(c)), false)
})

Deno.test('buildSummaryPacket — the protein-clause floor still counts MEALS, not protein instances (B-467)', () => {
  // 3 meals × 2 proteins each = 6 instances but 3 identified meals — below the 4-meal floor,
  // so no protein clause is invented off a thin record.
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [],
    mealEvents: Array.from({ length: 3 }, (_, i) =>
      meal({ occurredAt: daysAgoIso(i + 1), primaryProtein: 'duck', proteins: ['duck', 'chicken'] }),
    ),
    symptomEvents: [symptom()],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.clauses.some((c) => /most-logged meal protein/.test(c)), false)
})

Deno.test('buildSummaryPacket — reflection drives the lead when no safety finding', () => {
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [],
    mealEvents: [],
    symptomEvents: [symptom({ type: 'itch' }), symptom({ type: 'itch' })],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  // HR-7 (CUL-676): this clause counts RAW ROWS, so it states a count of LOGS and drops
  // the unit noun — "2 episodes" was a claim about bouts the count cannot support, and it
  // collided with the ⑦ card's chained-episode count in the same surface family.
  assert.match(packet!.clauses[0], /I've logged itching 2 times for Pixel this month/)
})

Deno.test('buildSummaryPacket — out-of-window meals/symptoms are excluded from the month', () => {
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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

Deno.test('summaryTemplate — every emittable shape (with a typical food label) passes its own validator and never reassures', () => {
  const scenarios: SummaryFactPacket[] = [
    buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [worseningFinding()], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [declineFinding({ trigger: 'consecutive_low', daysBelowBaseline: 3, refusedFoodLabel: null })], mealEvents: ratedChickenMeals(8), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [reflectionFinding({ direction: 'flat', currentCount: 3, priorCount: 3 })], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [], mealEvents: ratedChickenMeals(10), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
    buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [], mealEvents: [], symptomEvents: [symptom(), symptom()], freeFedFoodIds: new Set(), nowMs: NOW_MS })!,
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

Deno.test('summaryTemplate — a screened FOOD NAME in a safety clause no longer trips the validator (B-096, CUL-1618)', () => {
  // A real product name containing screened vocabulary ("Recovery") rides verbatim into the
  // decline clause. Until CUL-1618 validateSummary rejected it; now the safety clauses are
  // required verbatim and the screens read only the text after them, so the true template passes.
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [declineFinding({ trigger: 'refused_normal_food', refusedFoodLabel: 'Royal Canin Recovery' })],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
  const text = summaryTemplate(packet)
  assert.match(text, /Royal Canin Recovery/) // the food's own name renders correctly
  assert.match(text, /\bvet\b/i) // and the safety clause still routes to the vet
  assert.equal(validateSummary(text, packet), true)
  // The screens still read the model's own words after the lead.
  assert.equal(validateSummary(`${packet.safetyClauses.join(' ')} Pixel is on the road to recovery.`, packet), false)
})

Deno.test('summaryTemplate — a safety summary always routes to the vet', () => {
  for (const f of [worseningFinding(), declineFinding(), worseningFinding({ tier: 'soft', trigger: 'more_days' })]) {
    const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED, petName: 'Pixel', findings: [f], mealEvents: ratedChickenMeals(6), symptomEvents: [], freeFedFoodIds: new Set(), nowMs: NOW_MS })!
    assert.match(summaryTemplate(packet), /\bvet\b/i)
  }
})

// ── validateSummary: the model-drift screens ─────────────────────────────────────────────

function quietPacket(): SummaryFactPacket {
  return buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
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
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [worseningFinding()],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
}

// The worsening template safetyPacket() leads with (phrasing.ts), word for word.
const WORSENING_VOMIT = 'Pixel has had vomiting on 5 of the last 7 days, up from 2 the week before — worth booking a vet visit soon.'

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

Deno.test('validateSummary — rejects delegation and treatment attribution (CUL-1271)', () => {
  // Two sentences each (the summary's sentence floor) with "vet" present, so neither the
  // sentence count nor the vet-routing check is what rejects them — the shared arms must be.
  const q = quietPacket()
  const s = safetyPacket()
  for (const p of [q, s]) {
    assert.equal(validateSummary("Pixel's vomiting is in the vet's hands now. Keep logging for Pixel and the vet.", p), false)
    assert.equal(validateSummary('Your vet has it covered. Keep logging for Pixel and the vet.', p), false)
    assert.equal(validateSummary('There is nothing more to do for Pixel. Keep logging for the vet.', p), false)
    assert.equal(validateSummary("The prednisone is working for Pixel. Keep logging for the vet.", p), false)
    assert.equal(validateSummary("Pixel's cough has settled since the prednisone started. Keep logging for the vet.", p), false)
  }
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
  // The safety clause kept word for word, with a rephrased tail, passes.
  assert.equal(validateSummary(`${WORSENING_VOMIT} I'll keep watching the logs with you.`, p), true)
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

Deno.test('validateSummary — on a safety packet only the tail is the model\'s to rephrase (CUL-1618)', () => {
  const p = safetyPacket()
  // The safety clause verbatim, the protein clause smoothed: passes.
  assert.equal(validateSummary(`${WORSENING_VOMIT} Most of Pixel's logged meals this month were chicken.`, p), true)
  // A faithful-looking paraphrase of the safety clause itself (this test's old "accepts" case,
  // "worth booking a vet visit soon" → "worth a vet visit soon"): rejected, because a paraphrase
  // is exactly how an ask drifts off its sign or loses its urgency.
  const paraphrase =
    'Pixel has had vomiting on 5 of the last 7 days, up from 2 the week before — worth a vet visit soon. Chicken was Pixel\'s most-logged meal protein this month.'
  assert.equal(validateSummary(paraphrase, p), false)
})

// ── PR-4 adversarial-review regression vectors (the counterexamples that BROKE the first cut) ──

Deno.test('validateSummary — rejects the lay/warm reassurance the review found (Claim 1)', () => {
  const p = quietPacket()
  for (const t of [
    'It has been a quiet, settled month for Pixel. Nothing has stood out as a worry.',
    'Pixel has a strong appetite and is a great eater. Keep logging for Pixel.',
    'Pixel is eating beautifully and seems happy and content. Keep logging for Pixel.',
    'Nothing concerning this month for Pixel, and no news is good news. Keep logging for Pixel.',
    'Pixel got a clean bill this month with everything in order. Keep logging for Pixel.',
    'An encouraging month for Pixel with nothing to flag. Keep logging for Pixel.',
    'Pixel is looking good and doing well. Keep logging for Pixel.',
    'No vomiting at all this month, which is good to see. Keep logging for Pixel.',
  ]) {
    assert.equal(validateSummary(t, p), false, `must reject reassurance: "${t}"`)
  }
})

Deno.test('validateSummary — rejects causal paraphrases the review found (Claim 2)', () => {
  const p = safetyPacket() // allows 5, 7, 2
  for (const t of [
    'Pixel has had vomiting on 5 of the last 7 days, which may be linked to the food — see your vet.',
    'Pixel has had vomiting on 5 of the last 7 days, possibly from the new food — see your vet.',
    'Pixel has had vomiting on 5 of the last 7 days; it could be tied to the new treats — see your vet.',
    'Pixel seems sensitive to something, with vomiting on 5 of the last 7 days. See your vet.',
    "Pixel isn't tolerating the new diet, with vomiting on 5 of the last 7 days. See your vet.",
    'Vomiting on 5 of the last 7 days for Pixel, likely brought on by the switch. See your vet.',
  ]) {
    assert.equal(validateSummary(t, p), false, `must reject causal: "${t}"`)
  }
})

Deno.test('validateSummary — rejects lay disease/diagnosis terms the review found (Claim 2)', () => {
  const p = safetyPacket()
  for (const t of [
    'Pixel may have a tummy bug, with vomiting on 5 of the last 7 days. See your vet.',
    'Could be a sensitive stomach — vomiting on 5 of the last 7 days. See your vet.',
    'Looks like food poisoning; vomiting on 5 of the last 7 days. See your vet.',
    'Maybe something they ate, with vomiting on 5 of the last 7 days. See your vet.',
    'Possibly hairballs, with vomiting on 5 of the last 7 days. See your vet.',
    'Pixel seems unwell, with vomiting on 5 of the last 7 days. See your vet.',
  ]) {
    assert.equal(validateSummary(t, p), false, `must reject disease: "${t}"`)
  }
})

Deno.test('extractNumbers + validateSummary — spelled integers ≥ thirteen are caught (Claim 4a)', () => {
  assert.equal(extractNumbers('thirteen days').has(13), true)
  assert.equal(extractNumbers('about twenty meals').has(20), true)
  assert.equal(extractNumbers('roughly a hundred logs').has(100), true)
  const p = quietPacket() // allows {10}
  assert.equal(
    validateSummary('Pixel logged about thirteen meals this month. Keep logging for Pixel.', p),
    false,
  )
})

Deno.test('validateSummary — rejects preference evasions the review found (Claim 6)', () => {
  const p = quietPacket()
  for (const t of [
    'Pixel can be a bit choosy, but chicken led the month. Keep logging for Pixel.',
    'Pixel is a selective eater this month. Keep logging for Pixel.',
    'Pixel turns up their nose at most things. Keep logging for Pixel.',
    'Pixel really goes for chicken. Keep logging for Pixel.',
    'Pixel seems drawn to the new treats. Keep logging for Pixel.',
    'Pixel craves chicken lately. Keep logging for Pixel.',
  ]) {
    assert.equal(validateSummary(t, p), false, `must reject preference: "${t}"`)
  }
})

Deno.test('shouldPhraseWithModel — safety & quiet are template-only; only reflection is phrased (Claims 1/2/4b restraint)', () => {
  assert.equal(shouldPhraseWithModel(safetyPacket()), false)
  assert.equal(shouldPhraseWithModel(quietPacket()), false)
  const reflective = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [reflectionFinding()],
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
  assert.equal(shouldPhraseWithModel(reflective), true)
})

Deno.test('v1 ships TEMPLATE-ONLY — the model phrasing kill-switch is off (re-review #2 decision)', () => {
  // The summary is a descriptive count statement, phrased template-only like ③/④/⑤/⑥. The
  // model machinery + validateSummary are retained + tested but gated off behind this flag.
  assert.equal(SUMMARY_MODEL_PHRASING_ENABLED, false)
})

Deno.test('validateSummary — rejects the reflection-path leaks the re-review found (round 2)', () => {
  // These shipped on the (now template-only) reflection model path; broadened screens catch
  // them so the dormant guard is hardened for any future re-enable. allowedNumbers {1,4} from
  // an improving reflection packet, so the vocabulary screens (not numbers) must do the work.
  const p = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [reflectionFinding()], // "1 ... down from 4"
    mealEvents: ratedChickenMeals(6),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })!
  for (const t of [
    'Pixel has turned a corner this week, with 1 episode of vomiting down from 4. Chicken led the meals.',
    'Pixel is in a good place this week — 1 episode, down from 4. Chicken led the meals.',
    'There is no need to worry; vomiting was 1 this week, down from 4. Chicken led the meals.',
    'A brighter week for Pixel — 1 episode of vomiting, down from 4. Chicken led the meals.',
    'The diet is helping Pixel; vomiting fell to 1 this week from 4. Chicken led the meals.',
    'The new food agrees with Pixel; vomiting was 1 this week, down from 4. Chicken led the meals.',
    'Since switching foods, vomiting dropped to 1 this week from 4. Chicken led the meals.',
    'Pixel tucks into chicken; vomiting was 1 this week, down from 4 last week.',
    'Pixel wolfs down chicken; vomiting was 1 this week, down from 4 last week.',
    'Pixel happily eats chicken; vomiting was 1 this week, down from 4 last week.',
    'Pixel is doing better this week — 1 episode, down from 4. Chicken led the meals.',
  ]) {
    assert.equal(validateSummary(t, p), false, `must reject reflection-path leak: "${t}"`)
  }
})

Deno.test('buildSummaryPacket — never drops a safety clause to honour the cap (by construction)', () => {
  // Five safety findings (more than the 4-sentence cap can hold) — all must survive, an
  // over-long safety summary beats a dropped concern (Principle 3 > the layout cap).
  const packet = buildSummaryPacket({
    risingBelowCardFloor: false, watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [
      worseningFinding({ symptomType: 'vomit' }),
      worseningFinding({ symptomType: 'diarrhea' }),
      declineFinding({ trigger: 'refused_normal_food', refusedFoodLabel: 'Tiki Cat Tuna' }),
      declineFinding({ trigger: 'consecutive_low', daysBelowBaseline: 3, refusedFoodLabel: null }),
      declineFinding({ trigger: 'refused_normal_food', refusedFoodLabel: 'Wellness Pate' }),
    ],
    mealEvents: ratedChickenMeals(8),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
  })
  assert.ok(packet)
  assert.equal(packet!.clauses.length, 5) // all five safety clauses kept, cap notwithstanding
  assert.ok(packet!.clauses.some((c) => /loose stool/.test(c)))
  assert.ok(packet!.clauses.some((c) => /Wellness Pate/.test(c)))
})

Deno.test('number-swap inversion on a safety packet is caught by the verbatim lead and by RESTRAINT, never by grounding (Claim 4b, CUL-1618)', () => {
  // The grounding number-set is fact-blind: a 5<->2 swap stays inside allowedNumbers, so
  // validateSummary alone CANNOT detect that a worsening trend was inverted to "improvement".
  const p = safetyPacket() // worsening "5 of the last 7 days, up from 2"; allows {5,7,2}
  const inverted =
    'Pixel has had vomiting on just 2 of the last 7 days, down from 5 the week before — mention it to your vet.'
  assert.equal(extractNumbers(inverted).size, 3, 'premise: every number is inside allowedNumbers')
  // Grounding is swap-blind by design; since CUL-1618 the verbatim safety lead catches it...
  assert.equal(validateSummary(inverted, p), false)
  // ...and restraint still holds: a safety summary is never sent to the model at all.
  assert.equal(shouldPhraseWithModel(p), false)
})

// EN-11 (Engines v3 PR-32, adversarial pass D4): a sign rising below EN-11's card floor has no
// safety card, so `hasSafety` is false, and the finished-meal rate must still stay out.
Deno.test('buildSummaryPacket — finished-rate is OMITTED while a sign rises below the EN-11 card floor', () => {
  const args = {
    watchedSentenceFor: NONE_WATCHED,
    petName: 'Pixel',
    findings: [],
    mealEvents: ratedChickenMeals(8, 'all'),
    symptomEvents: [],
    freeFedFoodIds: new Set<string>(),
    nowMs: NOW_MS,
  }
  const rate = (p: ReturnType<typeof buildSummaryPacket>) => p?.clauses.some((c) => /finished most or all/.test(c)) ?? false
  assert.equal(rate(buildSummaryPacket({ ...args, risingBelowCardFloor: false })), true, 'premise: a quiet pet carries the rate')
  assert.equal(rate(buildSummaryPacket({ ...args, risingBelowCardFloor: true })), false)
})

// ── EN-9 (CUL-1538): a watched concern stops asking in the summary as it does on its card ─────

// The card's real shape: the head, the source, the since line (careState.ts). The summary says the head.
const WATCHED_CARD = "Pixel's vomiting, your vet knows. You said on Jun 2 Pixel's vet knows. Since Jun 2, 12 days: 1 episode, with something logged on 12 of 12."
const WATCHED_VOMIT = "Pixel's vomiting, your vet knows."
// A finding as the care-state step leaves it: the lane's finding plus its `careState`.
const withCare = (f: Finding, state: string, text: string | null): Finding =>
  ({ ...f, careState: { state, ackId: 'a', source: 'my_vet_knows', anchorOn: null, reference: null, reason: null, recheckOn: null, text, lapsed: [] } }) as unknown as Finding

function packetFor(findings: Finding[], decorated: Finding[]) {
  return buildSummaryPacket({
    petName: 'Pixel',
    findings,
    mealEvents: ratedChickenMeals(8, 'all'),
    symptomEvents: [],
    freeFedFoodIds: new Set(),
    nowMs: NOW_MS,
    risingBelowCardFloor: false,
    watchedSentenceFor: watchedSentenceLookup(decorated.map((finding) => ({ finding }))),
  })!
}

Deno.test('EN-9: the only safety card is watched → the summary says the card sentence, not "talk to your vet"', () => {
  const w = worseningFinding()
  const asking = summaryTemplate(packetFor([w], [w]))
  assert.match(asking, /vet/i, 'premise: the raised card routes to the vet')
  const p = packetFor([w], [withCare(w, 'with_vet', WATCHED_CARD)])
  assert.equal(p.clauses[0], WATCHED_VOMIT)
  assert.equal(p.clauses.includes(packetFor([w], [w]).clauses[0]), false, 'the lane sentence is gone')
  // Still a concern: the rate stays out, the model stays off, and the vet check holds.
  assert.equal(p.hasSafety, true)
  assert.equal(p.clauses.some((c) => /finished most or all/.test(c)), false)
  assert.equal(shouldPhraseWithModel(p), false)
  assert.equal(validateSummary(summaryTemplate(p), p), true)
})

Deno.test('EN-9: recheck_booked is watched too; raised and raised_again keep the lane sentence', () => {
  const w = worseningFinding()
  const lane = packetFor([w], [w]).clauses[0]
  assert.equal(packetFor([w], [withCare(w, 'recheck_booked', "Pixel's vomiting, your vet knows. Recheck booked for Jun 20.")]).clauses[0], WATCHED_VOMIT)
  // A text without the head is said whole: still the card's words, still not an ask.
  assert.equal(packetFor([w], [withCare(w, 'with_vet', 'Watched.')]).clauses[0], 'Watched.')
  assert.equal(packetFor([w], [withCare(w, 'raised', null)]).clauses[0], lane)
  assert.equal(packetFor([w], [withCare(w, 'raised_again', 'Back because it changed. ' + lane)]).clauses[0], lane)
})

Deno.test('EN-9: an escalation beside a watched concern still leads and still routes to the vet', () => {
  const d = declineFinding()
  const w = worseningFinding()
  const p = packetFor([w, d], [d, withCare(w, 'with_vet', WATCHED_CARD)])
  assert.equal(p.clauses[0], packetFor([d], [d]).clauses[0], 'the asking card leads, as on Home')
  assert.equal(p.clauses[1], WATCHED_VOMIT)
  assert.match(p.clauses[0], /vet/i)
})

Deno.test('EN-9: a watched sign never quiets a DIFFERENT sign that still asks', () => {
  const vomit = worseningFinding()
  const cough = worseningFinding({ symptomType: 'cough' })
  const p = packetFor([vomit, cough], [withCare(vomit, 'with_vet', WATCHED_CARD), cough])
  assert.deepEqual(p.clauses.slice(0, 2), [packetFor([cough], [cough]).clauses[0], WATCHED_VOMIT])
})

Deno.test('EN-9: chronicity and worsening for one watched sign say the sentence once', () => {
  const w = worseningFinding()
  const c = { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit' } as unknown as Finding
  const p = packetFor([c, w], [withCare(c, 'with_vet', WATCHED_CARD), withCare(w, 'with_vet', WATCHED_CARD)])
  assert.equal(p.clauses.filter((x) => x === WATCHED_VOMIT).length, 1)
  assert.equal(p.clauses.length, 2, 'the sentence once, then the protein clause')
})

Deno.test('EN-9: several watched signs stay inside the sentence cap (adversarial pass, CUL-1538)', () => {
  const signs = ['vomit', 'diarrhea', 'cough'] as const
  const fs = signs.map((symptomType) => worseningFinding({ symptomType }))
  const label = { vomit: 'vomiting', diarrhea: 'diarrhea', cough: 'coughing' }
  const decorated = fs.map((f, i) => withCare(f, 'with_vet', `Pixel's ${label[signs[i]]}, your vet knows. You said on Jun 2 Pixel's vet knows. Since Jun 2, 12 days: 1 episode, with something logged on 12 of 12.`))
  const p = packetFor(fs, decorated)
  assert.deepEqual(p.clauses.slice(0, 3), signs.map((x) => `Pixel's ${label[x]}, your vet knows.`))
  assert.equal(validateSummary(summaryTemplate(p), p), true, summaryTemplate(p))
})

// ── CUL-1618: every safety clause verbatim, first, in order ───────────────────────────────────
// (supersedes CUL-1608's lexical "an ask appears somewhere" check, which these counterexamples passed)

// The decline template the mixed packet leads with (phrasing.ts), word for word.
const DECLINE_3_DAYS = 'Pixel has eaten less than usual the last three days — worth keeping an eye on, and a word with your vet if it carries on.'

function mixedPacket() {
  const d = declineFinding({ trigger: 'consecutive_low', daysBelowBaseline: 3, refusedFoodLabel: null })
  const w = worseningFinding()
  return packetFor([d, w], [d, withCare(w, 'with_vet', WATCHED_CARD)])
}

Deno.test('CUL-1618: safetyClauses are the asking templates then the watched heads, and lead clauses', () => {
  const p = mixedPacket()
  assert.deepEqual(p.safetyClauses, [DECLINE_3_DAYS, WATCHED_VOMIT])
  assert.deepEqual(p.clauses.slice(0, 2), p.safetyClauses)
  assert.deepEqual(safetyPacket().safetyClauses, [WORSENING_VOMIT])
  assert.deepEqual(quietPacket().safetyClauses, [])
  // The model is handed them apart from the sentences it may smooth.
  const payload = summaryModelPayload(p)
  assert.deepEqual(payload.safety_sentences, p.safetyClauses)
  assert.deepEqual(payload.draft_sentences, p.clauses.slice(2))
})

Deno.test('CUL-1618: every template shape with a safety clause passes its own validator', () => {
  const findings: Finding[] = [
    worseningFinding(),
    worseningFinding({ tier: 'soft', trigger: 'more_days' }),
    declineFinding(),
    declineFinding({ trigger: 'consecutive_low', daysBelowBaseline: 3, refusedFoodLabel: 'Chicken Pate' }),
  ]
  for (const f of findings) {
    const p = packetFor([f], [f])
    assert.equal(validateSummary(summaryTemplate(p), p), true, summaryTemplate(p))
  }
  for (const p of [mixedPacket(), packetFor([worseningFinding()], [withCare(worseningFinding(), 'with_vet', WATCHED_CARD)])])
    assert.equal(validateSummary(summaryTemplate(p), p), true, summaryTemplate(p))
  // A line break between sentences is not a reworded clause.
  const p = mixedPacket()
  assert.equal(validateSummary(p.clauses.join('\n'), p), true)
  // Nor is a double space inside a food label the template carries (adversarial pass).
  const spaced = packetFor([declineFinding({ refusedFoodLabel: 'Royal Canin  Recovery' })], [declineFinding({ refusedFoodLabel: 'Royal Canin  Recovery' })])
  assert.equal(validateSummary(summaryTemplate(spaced), spaced), true, summaryTemplate(spaced))
})

Deno.test('CUL-1618: the adversarial pass\'s counterexamples on a mixed packet are all rejected', () => {
  const p = mixedPacket()
  const tail = " Chicken was Pixel's most-logged meal protein this month."
  for (const t of [
    // CUL-1608's case: the head kept, the decline's ask dropped.
    "Pixel has eaten less than usual the last three days. Pixel's vomiting, your vet knows.",
    // The care claim moves onto the decline, which loses its ask; the watched sign is nagged again.
    "Pixel has eaten less than usual the last three days, and your vet knows. Pixel's vomiting is worth a word with your vet.",
    // The decline is dropped (Principle 3).
    "Pixel's vomiting is worth a word with your vet." + tail,
    // The ask reworded ("a word with your vet if it carries on" → "a word with your vet"): the
    // same edit that turns the burden card's "a call to your vet today" into a softer ask.
    "Pixel has eaten less than usual the last three days — worth a word with your vet. Pixel's vomiting, your vet knows.",
    // Reordered: the watched head may not lead the asking card.
    `${WATCHED_VOMIT} ${DECLINE_3_DAYS}` + tail,
    // The lead kept verbatim, then a negated, past or extra vet claim in the tail.
    `${DECLINE_3_DAYS} ${WATCHED_VOMIT} No need for a call to your vet yet.`,
    `${DECLINE_3_DAYS} ${WATCHED_VOMIT} You already had a word with your vet.`,
    `${DECLINE_3_DAYS} ${WATCHED_VOMIT} Pixel had a vet visit last week.`,
    `${DECLINE_3_DAYS} ${WATCHED_VOMIT} The vet's aware of the eating too.`,
    `${DECLINE_3_DAYS} ${WATCHED_VOMIT} The doctor already checked Pixel.`,
  ]) assert.equal(validateSummary(t, p), false, t)
  // The lead verbatim with a rephrased, vet-free tail passes.
  assert.equal(validateSummary(`${DECLINE_3_DAYS} ${WATCHED_VOMIT} Most of Pixel's logged meals this month were chicken.`, p), true)
})

Deno.test('CUL-1618: a watched-only packet keeps the head verbatim, not just the word "vet"', () => {
  const w = worseningFinding()
  const p = packetFor([w], [withCare(w, 'with_vet', WATCHED_CARD)])
  assert.equal(validateSummary("Pixel's vomiting came up with the vet. Chicken was Pixel's most-logged meal protein this month.", p), false)
  assert.equal(validateSummary("The vet knows about Pixel's vomiting. Chicken was Pixel's most-logged meal protein this month.", p), false)
  assert.equal(validateSummary(`${WATCHED_VOMIT} Chicken was Pixel's most-logged meal protein this month.`, p), true)
})

Deno.test('CUL-1618: a non-safety summary may not name the vet either', () => {
  // No clause on a quiet or reflection packet mentions the vet, so the model's mention is unbacked.
  const p = quietPacket()
  assert.equal(validateSummary("Chicken was Pixel's most-logged meal protein this month. No need to see the vet.", p), false)
  assert.equal(validateSummary("Chicken was Pixel's most-logged meal protein this month. Pixel saw the vet last week.", p), false)
  assert.equal(validateSummary("Chicken was Pixel's most-logged meal protein this month. Keep logging for Pixel.", p), true)
})
