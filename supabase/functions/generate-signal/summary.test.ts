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
  shouldPhraseWithModel,
  SUMMARY_MODEL_PHRASING_ENABLED,
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

Deno.test('summaryTemplate — every emittable shape (with a typical food label) passes its own validator and never reassures', () => {
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

Deno.test('summaryTemplate — a screened FOOD NAME is inert in v1 but is a model re-enable gate (B-096)', () => {
  // A real product name containing screened vocabulary ("Recovery") rides verbatim into the
  // decline clause. The SHIPPED text is correct (it names the food the pet refused) and routes
  // to the vet — and it ships UNVALIDATED, so this is inert today. But validateSummary WOULD
  // reject it, so before model phrasing is ever re-enabled the food-name span must be exempted
  // (B-096). This test pins both halves of that reality so the limitation can't be forgotten.
  const packet = buildSummaryPacket({
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
  // The known limitation: validateSummary trips on "Recovery" — fine in v1 (template ships
  // unvalidated), gated for re-enable.
  assert.equal(validateSummary(text, packet), false)
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

Deno.test('number-swap inversion on a safety packet is prevented by RESTRAINT, not by grounding (Claim 4b)', () => {
  // The grounding number-set is fact-blind: a 5<->2 swap stays inside allowedNumbers, so
  // validateSummary alone CANNOT detect that a worsening trend was inverted to "improvement".
  const p = safetyPacket() // worsening "5 of the last 7 days, up from 2"; allows {5,7,2}
  const inverted =
    'Pixel has had vomiting on just 2 of the last 7 days, down from 5 the week before — mention it to your vet.'
  assert.equal(validateSummary(inverted, p), true) // grounding is swap-blind by design...
  // ...which is EXACTLY why a safety summary is NEVER sent to the model: it ships the
  // deterministic template, so the model can never produce this inversion.
  assert.equal(shouldPhraseWithModel(p), false)
})
