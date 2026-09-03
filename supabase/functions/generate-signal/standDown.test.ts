// The labeled stand-down (CUL-786) — falsification fixtures for a sentence about absence.
// Run with: deno test -A supabase/functions/generate-signal/standDown.test.ts
//
// The four conditions are each a fixture that WITHHOLDS the marker when its half fails, and one
// golden fixture mints it when all four hold. The counterfactual predicate is proven against the
// live detector, never against a copy of the floors.

import { strict as assert } from 'node:assert'
import {
  detectChronicity,
  detectSignals,
  DEFAULT_CONFIG,
  type DetectionInput,
  type Finding,
  type MealEvent,
  type PetContext,
  type SymptomChronicityFinding,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'
import { hasBannedSignalVocabulary, type CachedFinding } from './phrasing.ts'
import {
  gapLoggingHeld,
  isStoodDownEntry,
  mergeStandDowns,
  readPriorEntries,
  resolveStandDowns,
  STOOD_DOWN_TTL_DAYS,
  templateStoodDown,
  withoutRecencyGate,
  type PriorEntry,
  type StoodDownMarker,
} from './standDown.ts'

// ── fixtures ────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const NOW = '2026-05-30T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
let idSeq = 0
const nextId = () => `id-${++idSeq}`

/** ISO for `days` before NOW at 11:00 UTC. */
const ago = (days: number, hour = 11): string => {
  const d = new Date(NOW_MS - days * DAY_MS)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
const symptomAgo = (type: SymptomType, days: number): SymptomEvent => ({ id: nextId(), type, occurredAt: ago(days) })
const mealAgo = (days: number): MealEvent => ({
  id: nextId(),
  occurredAt: ago(days, 8),
  foodItemId: null,
  primaryProtein: null,
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
})
/** One meal a day on every day in [from, to] days-ago, inclusive. */
const mealsDaily = (from: number, to: number): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = Math.min(from, to); d <= Math.max(from, to); d++) out.push(mealAgo(d))
  return out
}
/** A q2-day course of `type` from `newest` to `oldest` days ago. */
const courseQ2 = (type: SymptomType, newest: number, oldest: number): SymptomEvent[] => {
  const out: SymptomEvent[] = []
  for (let d = newest; d <= oldest; d += 2) out.push(symptomAgo(type, d))
  return out
}

const dog: PetContext = { name: 'Nyx', species: 'dog', dietTrialActive: false }
const input = (over: Partial<DetectionInput>): DetectionInput => ({
  pet: dog,
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  ...over,
})

/** The chronicity card as it was LAST emitted — a prior-payload entry. */
const priorChronicity = (
  symptomType: SymptomType,
  tier: 'firm' | 'standard',
  rank = 0,
): PriorEntry => ({
  rank,
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType,
    episodeCount: 21,
    spanDays: 42,
    activeWeeks: 6,
    symptomDays: 21,
    daysSinceLastEpisode: 14,
    firstOnsetIso: ago(56),
    tier,
    windowDays: 56,
    associationalOnly: true,
  },
})

const priorMarker = (symptomType: SymptomType, mintedDaysAgo: number, rank = 0): PriorEntry => ({
  rank,
  finding: {
    type: 'stood_down',
    priorityClass: 'insight',
    symptomType,
    recencyDays: 14,
    tier: 'firm',
    lastEpisodeIso: ago(15 + mintedDaysAgo),
    stoodDownAt: ago(mintedDaysAgo, 12),
    formerRank: rank,
    associationalOnly: true,
  },
})

/** The golden shape: a q2-day vomiting course whose last episode was 15 days ago (one past the
 *  14-day floor), meals logged every day since. Fires under the counterfactual, not under the
 *  real floors. */
const stoodDownInput = (over: Partial<DetectionInput> = {}): DetectionInput =>
  input({
    symptomEvents: courseQ2('vomit', 15, 55),
    mealEvents: mealsDaily(0, 15),
    ...over,
  })

const resolve = (
  prior: PriorEntry[],
  inp: DetectionInput,
  current: Finding[] = [],
  priorGeneratedAtMs: number | null = NOW_MS - DAY_MS,
): StoodDownMarker[] =>
  resolveStandDowns({ prior, priorGeneratedAtMs, current, input: inp, config: DEFAULT_CONFIG, nowMs: NOW_MS })

// ── the counterfactual predicate, proven against the live detector ─────────────

Deno.test('withoutRecencyGate — opens the recency gate everywhere and moves nothing else', () => {
  const cf = withoutRecencyGate(DEFAULT_CONFIG)
  assert.equal(cf.chronicity.ongoingRecencyDays, Number.POSITIVE_INFINITY)
  assert.equal(cf.chronicity.perType?.cough?.ongoingRecencyDays, Number.POSITIVE_INFINITY)
  assert.equal(cf.chronicity.perType?.cough?.cat?.ongoingRecencyDays, Number.POSITIVE_INFINITY)
  // Every other floor is identical, globally and per type.
  assert.equal(cf.chronicity.minSpanDays, DEFAULT_CONFIG.chronicity.minSpanDays)
  assert.equal(cf.chronicity.minEpisodes, DEFAULT_CONFIG.chronicity.minEpisodes)
  assert.equal(cf.chronicity.minActiveWeeks, DEFAULT_CONFIG.chronicity.minActiveWeeks)
  assert.equal(cf.chronicity.firmSpanDays, DEFAULT_CONFIG.chronicity.firmSpanDays)
  assert.equal(cf.chronicity.windowDays, DEFAULT_CONFIG.chronicity.windowDays)
  assert.equal(cf.chronicity.perType?.cough?.minEpisodes, DEFAULT_CONFIG.chronicity.perType?.cough?.minEpisodes)
  assert.equal(cf.chronicity.perType?.cough?.cat?.minEpisodes, DEFAULT_CONFIG.chronicity.perType?.cough?.cat?.minEpisodes)
  // The real config is untouched (no mutation).
  assert.equal(DEFAULT_CONFIG.chronicity.ongoingRecencyDays, 14)
  assert.equal(DEFAULT_CONFIG.chronicity.perType?.cough?.ongoingRecencyDays, 28)
})

Deno.test('the golden shape — silent under the real floors, fires under the counterfactual', () => {
  const inp = stoodDownInput()
  assert.equal(detectChronicity(inp).length, 0, 'the real detector must be silent (15 > 14 days)')
  const cf = detectChronicity(inp, withoutRecencyGate(DEFAULT_CONFIG))
  assert.equal(cf.length, 1)
  assert.equal(cf[0].symptomType, 'vomit')
  assert.equal(cf[0].daysSinceLastEpisode, 15)
})

// ── mint: all four conditions hold ─────────────────────────────────────────────

Deno.test('mints ONE marker when the course stopped on recency and the gap was logged across', () => {
  const out = resolve([priorChronicity('vomit', 'firm')], stoodDownInput())
  assert.equal(out.length, 1)
  const m = out[0]
  assert.equal(m.type, 'stood_down')
  assert.equal(m.priorityClass, 'insight')
  assert.equal(m.symptomType, 'vomit')
  assert.equal(m.recencyDays, 14)
  assert.equal(m.tier, 'firm')
  assert.equal(m.lastEpisodeIso, ago(15))
  assert.equal(m.stoodDownAt, NOW)
  assert.equal(m.formerRank, 0)
  assert.equal(m.associationalOnly, true)
})

Deno.test('the tier is CARRIED from the last emission, never re-resolved over the slid window', () => {
  // By the time recency closes, the in-window span can no longer reach firmSpanDays (a course
  // that ends 15 days ago inside a 56-day window spans at most 41). The card the owner read was
  // firm; the surviving ask must be the one that was on the card.
  const inp = stoodDownInput()
  const cf = detectChronicity(inp, withoutRecencyGate(DEFAULT_CONFIG))
  assert.equal(cf[0].tier, 'standard', 'fixture premise: the counterfactual resolves standard')
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp)[0].tier, 'firm')
  assert.equal(resolve([priorChronicity('vomit', 'standard')], inp)[0].tier, 'standard')
})

Deno.test('the former rank is the prior entry rank, not zero', () => {
  const out = resolve([priorChronicity('vomit', 'firm', 2)], stoodDownInput())
  assert.equal(out[0].formerRank, 2)
})

Deno.test('cough stands down on ITS floor (28) — a 20-day-quiet cough is still ongoing, a 30-day one stands down', () => {
  const cough = (newest: number): SymptomEvent[] => {
    const out: SymptomEvent[] = []
    for (let d = newest; d <= newest + 24; d += 4) out.push(symptomAgo('cough', d)) // 7 episodes, span 24, 4 weeks
    return out
  }
  const ongoing = input({ symptomEvents: cough(20), mealEvents: mealsDaily(0, 20) })
  const live = detectChronicity(ongoing)
  assert.equal(live.length, 1, 'premise: 20 days quiet is inside the 28-day cough floor')
  // With the course still in the current set, nothing is minted.
  assert.equal(resolve([priorChronicity('cough', 'standard')], ongoing, live).length, 0)

  const quiet = input({ symptomEvents: cough(30), mealEvents: mealsDaily(0, 30) })
  assert.equal(detectChronicity(quiet).length, 0, 'premise: 30 days quiet is past the cough floor')
  const out = resolve([priorChronicity('cough', 'standard')], quiet)
  assert.equal(out.length, 1)
  assert.equal(out[0].recencyDays, 28)
  assert.equal(out[0].symptomType, 'cough')
})

Deno.test('two courses stand down independently, in former-rank order', () => {
  const inp = input({
    symptomEvents: [...courseQ2('vomit', 15, 55), ...courseQ2('diarrhea', 16, 54)],
    mealEvents: mealsDaily(0, 16),
  })
  assert.equal(detectChronicity(inp).length, 0)
  const out = resolve([priorChronicity('diarrhea', 'standard', 1), priorChronicity('vomit', 'firm', 0)], inp)
  assert.deepEqual(out.map((m) => [m.symptomType, m.formerRank]), [['vomit', 0], ['diarrhea', 1]])
})

// ── withheld: each condition failing on its own ────────────────────────────────

Deno.test('WITHHELD — the course stopped on COVERAGE (a dark half of its span), not on recency', () => {
  // Episodes 45–55 days ago, then two isolated ones at 15 and 17: the span's second half holds
  // only two logged days, so ⑦'s span-halves guard fails under BOTH configs.
  const symptomEvents = [...courseQ2('vomit', 45, 55), symptomAgo('vomit', 15), symptomAgo('vomit', 17)]
  const inp = input({ symptomEvents, mealEvents: mealsDaily(0, 14) })
  assert.equal(detectChronicity(inp).length, 0)
  assert.equal(detectChronicity(inp, withoutRecencyGate(DEFAULT_CONFIG)).length, 0, 'premise: the counterfactual fails too')
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
})

Deno.test('WITHHELD — the episodes aged out of the window (below the episode/span floors), not recency', () => {
  const inp = input({ symptomEvents: courseQ2('vomit', 40, 80), mealEvents: mealsDaily(0, 40) })
  assert.equal(detectChronicity(inp).length, 0)
  assert.equal(detectChronicity(inp, withoutRecencyGate(DEFAULT_CONFIG)).length, 0, 'premise')
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
})

Deno.test("WITHHELD — the gap was DARK (Dr. Chen's 4th condition): no logging since the last episode", () => {
  const inp = stoodDownInput({ mealEvents: [] })
  assert.equal(detectChronicity(inp, withoutRecencyGate(DEFAULT_CONFIG)).length, 1, 'premise: only the gap fails')
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
})

Deno.test('WITHHELD — the gap went dark HALFWAY (logged for a week after the last episode, then nothing)', () => {
  const inp = stoodDownInput({ mealEvents: mealsDaily(9, 15) })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
  // …and the mirror: nothing logged for the first week, then daily — also withheld.
  const late = stoodDownInput({ mealEvents: mealsDaily(0, 6) })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], late).length, 0)
})

Deno.test('the gap is logged across by ANY event type — a cough log inside a vomiting gap counts', () => {
  const inp = stoodDownInput({
    mealEvents: [],
    symptomEvents: [
      ...courseQ2('vomit', 15, 55),
      ...[1, 3, 5, 9, 11, 13].map((d) => symptomAgo('cough', d)),
    ],
  })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 1)
})

Deno.test('WITHHELD — the prior row is older than the TTL (the card did not vanish this week)', () => {
  const stale = NOW_MS - (STOOD_DOWN_TTL_DAYS + 1) * DAY_MS
  assert.equal(resolve([priorChronicity('vomit', 'firm')], stoodDownInput(), [], stale).length, 0)
  assert.equal(resolve([priorChronicity('vomit', 'firm')], stoodDownInput(), [], null).length, 0)
})

Deno.test('WITHHELD — the record no longer holds an episode to anchor to (events deleted)', () => {
  // The prior card says vomit; the current record has no vomit rows at all. The counterfactual is
  // silent, so nothing is minted — and even if it were, there is no episode to anchor a line to.
  const inp = input({ mealEvents: mealsDaily(0, 20) })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
})

Deno.test('no prior row ⇒ nothing, and no counterfactual pass is needed', () => {
  assert.equal(resolve([], stoodDownInput()).length, 0)
})

// ── re-fire and carry-forward ──────────────────────────────────────────────────

Deno.test('a RE-FIRE drops the marker — the course back in the set renders as a full card', () => {
  const live = input({ symptomEvents: courseQ2('vomit', 0, 42), mealEvents: mealsDaily(0, 42) })
  const current = detectChronicity(live)
  assert.equal(current.length, 1, 'premise: the course fires again')
  assert.equal(resolve([priorMarker('vomit', 3)], live, current).length, 0)
  assert.equal(resolve([priorChronicity('vomit', 'firm')], live, current).length, 0)
})

Deno.test('CARRY — a prior marker inside its TTL is re-emitted unchanged, at its slot', () => {
  const inp = stoodDownInput()
  const out = resolve([priorMarker('vomit', 3, 1)], inp)
  assert.equal(out.length, 1)
  assert.equal(out[0].stoodDownAt, ago(3, 12), 'the mint time is preserved — the TTL never restarts')
  assert.equal(out[0].formerRank, 1)
  assert.equal(out[0].recencyDays, 14)
})

Deno.test('CARRY — is not re-gated on coverage: a marker survives a dark week after it was minted', () => {
  const inp = stoodDownInput({ mealEvents: [] })
  assert.equal(resolve([priorMarker('vomit', 3)], inp).length, 1)
})

Deno.test('EXPIRY — a marker at or past the TTL is dropped; the day before, it is carried', () => {
  assert.equal(resolve([priorMarker('vomit', STOOD_DOWN_TTL_DAYS)], stoodDownInput()).length, 0)
  assert.equal(resolve([priorMarker('vomit', STOOD_DOWN_TTL_DAYS - 1)], stoodDownInput()).length, 1)
})

Deno.test('a prior marker and a prior chronicity for the SAME symptom never yield two markers', () => {
  const out = resolve([priorMarker('vomit', 2, 0), priorChronicity('vomit', 'firm', 1)], stoodDownInput())
  assert.equal(out.length, 1)
})

// ── the template ───────────────────────────────────────────────────────────────

const marker = (over: Partial<StoodDownMarker> = {}): StoodDownMarker => ({
  type: 'stood_down',
  priorityClass: 'insight',
  symptomType: 'vomit',
  recencyDays: 14,
  tier: 'firm',
  lastEpisodeIso: ago(15),
  stoodDownAt: NOW,
  formerRank: 0,
  associationalOnly: true,
  ...over,
})

Deno.test("templateStoodDown — Dr. Chen's line, verbatim, firm and standard", () => {
  assert.equal(
    templateStoodDown(marker(), 'Nyx'),
    "No vomiting logged for Nyx in 14 days — this card has stood down. That isn't an all-clear. If you haven't been, the visit is still worth booking.",
  )
  assert.equal(
    templateStoodDown(marker({ tier: 'standard' }), 'Nyx'),
    "No vomiting logged for Nyx in 14 days — this card has stood down. That isn't an all-clear. If you haven't yet, it's still worth a word with your vet.",
  )
  assert.equal(
    templateStoodDown(marker({ symptomType: 'cough', recencyDays: 28, tier: 'standard' }), 'Mochi'),
    "No coughing logged for Mochi in 28 days — this card has stood down. That isn't an all-clear. If you haven't yet, it's still worth a word with your vet.",
  )
})

Deno.test('templateStoodDown — says LOGGED, never happened; keeps the all-clear clause; no exclamation', () => {
  for (const tier of ['firm', 'standard'] as const) {
    for (const symptomType of ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough'] as const) {
      const t = templateStoodDown(marker({ tier, symptomType }), 'Nyx')
      assert.ok(t.includes(' logged for Nyx '), t)
      assert.ok(t.includes("That isn't an all-clear."), t)
      assert.ok(!t.includes('!'), t)
      assert.ok(!/\b(resolved|cleared|all clear|settled|better|improving|quieter)\b/i.test(t), t)
      assert.ok(!hasBannedSignalVocabulary(t), t)
    }
  }
})

Deno.test('templateStoodDown — fits the phrasing length cap with a long pet name and a 2-digit floor', () => {
  const longName = 'Bartholomew Fitzgerald III' // 26 chars
  const t = templateStoodDown(marker({ tier: 'standard', symptomType: 'skin_reaction', recencyDays: 28 }), longName)
  assert.ok(t.length <= 320, `${t.length} chars`)
  // validatePhrasing takes a Finding; the marker is not one, so screen its universal half directly.
  assert.ok(!hasBannedSignalVocabulary(t))
})

// ── merge into the former slot ─────────────────────────────────────────────────

const cachedChronicity = (rank: number): CachedFinding => ({
  rank,
  text: 'a card',
  finding: priorChronicity('diarrhea', 'standard', rank).finding as unknown as SymptomChronicityFinding,
})

Deno.test('mergeStandDowns — the line takes the former slot and the cards below move down one', () => {
  const findings = [cachedChronicity(0), { ...cachedChronicity(1), text: 'b' }]
  const merged = mergeStandDowns(findings, [marker({ formerRank: 0 })], 'Nyx')
  assert.deepEqual(merged.map((e) => [e.rank, e.finding.type]), [
    [0, 'stood_down'],
    [1, 'symptom_chronicity'],
    [2, 'symptom_chronicity'],
  ])
  assert.ok(isStoodDownEntry(merged[0]))
  assert.equal(merged[0].text, templateStoodDown(marker(), 'Nyx'))
})

Deno.test('mergeStandDowns — a former rank past the end appends; an empty set yields the line alone', () => {
  const merged = mergeStandDowns([cachedChronicity(0)], [marker({ formerRank: 5 })], 'Nyx')
  assert.deepEqual(merged.map((e) => [e.rank, e.finding.type]), [[0, 'symptom_chronicity'], [1, 'stood_down']])
  const alone = mergeStandDowns([], [marker()], 'Nyx')
  assert.equal(alone.length, 1)
  assert.equal(alone[0].rank, 0)
})

Deno.test('mergeStandDowns — no markers ⇒ the findings array byte-identical (ranks and order)', () => {
  const findings = [cachedChronicity(0), { ...cachedChronicity(1), text: 'b' }]
  assert.deepEqual(mergeStandDowns(findings, [], 'Nyx'), findings)
})

// ── never on the report ────────────────────────────────────────────────────────

Deno.test('detectSignals never emits a stood_down — the marker is a shell fact the report cannot see', () => {
  const ranked = detectSignals(stoodDownInput())
  assert.ok(ranked.every((r) => (r.finding.type as string) !== 'stood_down'))
  const live = detectSignals(input({ symptomEvents: courseQ2('vomit', 0, 42), mealEvents: mealsDaily(0, 42) }))
  assert.ok(live.every((r) => (r.finding.type as string) !== 'stood_down'))
})

// ── tolerant read-back ─────────────────────────────────────────────────────────

Deno.test('readPriorEntries — keeps well-formed entries, drops junk, falls back to index for rank', () => {
  const raw = [
    { rank: 1, text: 'x', finding: { type: 'symptom_chronicity', symptomType: 'vomit' } },
    null,
    'nope',
    { finding: null },
    { finding: { type: 7 } },
    { text: 'y', finding: { type: 'stood_down', symptomType: 'vomit' } },
  ]
  const out = readPriorEntries(raw)
  assert.deepEqual(out.map((e) => [e.rank, e.finding.type]), [[1, 'symptom_chronicity'], [5, 'stood_down']])
  assert.deepEqual(readPriorEntries(undefined), [])
  assert.deepEqual(readPriorEntries({}), [])
})

Deno.test('gapLoggingHeld — the two halves are judged separately, inclusive of the episode day', () => {
  const inp = stoodDownInput({ mealEvents: [] })
  const last = Date.parse(ago(15))
  assert.equal(gapLoggingHeld(inp, last, NOW_MS, 3), false)
  assert.equal(gapLoggingHeld(stoodDownInput(), last, NOW_MS, 3), true)
  assert.equal(gapLoggingHeld(stoodDownInput(), NOW_MS, NOW_MS, 3), false, 'an empty interval never holds')
})
