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
import { standDownMintAllowed } from '../_shared/engineStamps.ts'
import { SIGNAL_ENGINE_KEYS, type EngineFlags } from '../_shared/engineFlags.ts'
import {
  gapLoggingHeld,
  isStoodDownEntry,
  mergeStandDowns,
  priorForStandDowns,
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
    // Anchored to the record's last episode (the golden shape's day-15 onset), as a real mint
    // would be; the carry compares the record against this.
    lastEpisodeIso: ago(15),
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

Deno.test("WITHHELD — the episode's own day does not count as watching afterwards (meals at 14/10/5/3/1)", () => {
  // Two owner actions in the first half (days 14 and 10) plus the day-15 episode itself: the
  // adversarial pass found the episode's log was being counted as a logged day in the half it
  // bounds, which put this record over the floor. The gap starts the day AFTER the episode.
  const inp = stoodDownInput({ mealEvents: [14, 10, 5, 3, 1].map((d) => mealAgo(d)) })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
  // One more logged day in the first half and it holds.
  const held = stoodDownInput({ mealEvents: [14, 12, 10, 5, 3, 1].map((d) => mealAgo(d)) })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], held).length, 1)
})

Deno.test('the gap counts only the fetch union — a sneeze log (not fetched by the engine) is not watching', () => {
  const inp = stoodDownInput({
    mealEvents: [],
    symptomEvents: [...courseQ2('vomit', 15, 55), ...[1, 3, 5, 9, 11, 13].map((d) => symptomAgo('sneeze', d))],
  })
  assert.equal(resolve([priorChronicity('vomit', 'firm')], inp).length, 0)
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

Deno.test('CARRY ENDS ON A RELAPSE ⑦ CANNOT SEE — a newer episode kills the line even though the course does not re-fire', () => {
  // The adversarial break (2026-09-03): the window slid two old onsets out, so the residual
  // in-window count sits UNDER the episode floor and ⑦ stays silent — yet the dog vomited
  // three hours ago. A carry gated only on "did the course come back" would say "No vomiting
  // logged in 14 days" on the day the owner logged one.
  const relapsed = input({
    symptomEvents: [...[17, 24, 31, 38].map((d) => symptomAgo('vomit', d)), symptomAgo('vomit', 0)],
    mealEvents: mealsDaily(0, 40),
  })
  assert.equal(detectChronicity(relapsed).length, 0, 'premise: 5 in-window episodes < the floor of 6 — ⑦ silent')
  assert.equal(resolve([priorMarker('vomit', 2)], relapsed).length, 0)

  // The cough form — the MODAL case for a relapsing-remitting airway sign: a cough two hours
  // ago under cough's floor of 5.
  const cough = input({
    symptomEvents: [...[30, 37, 44].map((d) => symptomAgo('cough', d)), symptomAgo('cough', 0)],
    mealEvents: mealsDaily(0, 45),
  })
  assert.equal(detectChronicity(cough).length, 0, 'premise: 4 < 5 — ⑦ silent on cough')
  const coughMarker: PriorEntry = {
    rank: 0,
    finding: { ...priorMarker('cough', 2).finding, recencyDays: 28, lastEpisodeIso: ago(30) },
  }
  assert.equal(resolve([coughMarker], cough).length, 0)

  // And the control: the same marker with NO newer episode is carried.
  const quiet = input({ symptomEvents: [17, 24, 31, 38].map((d) => symptomAgo('vomit', d)), mealEvents: mealsDaily(0, 40) })
  const carried = resolve([{ rank: 0, finding: { ...priorMarker('vomit', 2).finding, lastEpisodeIso: ago(17) } }], quiet)
  assert.equal(carried.length, 1)
})

Deno.test('CARRY ENDS when the record no longer holds any episode to anchor to', () => {
  const wiped = input({ mealEvents: mealsDaily(0, 20) })
  assert.equal(resolve([priorMarker('vomit', 2)], wiped).length, 0)
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
/** A benign (insight-class) cached card — the postprandial shape, minimal. */
const cachedBenign = (rank: number, text = 'a benign card'): CachedFinding => ({
  rank,
  text,
  finding: {
    type: 'postprandial_timing',
    priorityClass: 'insight',
    symptomType: 'vomit',
    rapidCount: 4,
    eligibleCount: 12,
    totalEpisodes: 20,
    rapidWindowMinutes: 30,
    medianMinutesSinceFeeding: 14,
    windowDays: 60,
    lastTwoEligibleRapid: false,
    feedingFormsInEvidence: [],
    eligibleMinutes: [],
    associationalOnly: true,
  } as unknown as CachedFinding['finding'],
})

Deno.test('mergeStandDowns — the line takes the former slot and the benign cards below move down one', () => {
  const findings = [cachedBenign(0, 'a'), cachedBenign(1, 'b')]
  const merged = mergeStandDowns(findings, [marker({ formerRank: 0 })], 'Nyx')
  assert.deepEqual(merged.map((e) => [e.rank, e.finding.type, e.text]), [
    [0, 'stood_down', templateStoodDown(marker(), 'Nyx')],
    [1, 'postprandial_timing', 'a'],
    [2, 'postprandial_timing', 'b'],
  ])
  assert.ok(isStoodDownEntry(merged[0]))
})

Deno.test('mergeStandDowns — NEVER above a live safety card: the cat that stops vomiting because it stopped eating', () => {
  // The adversarial break (2026-09-03): chronicity stands down the same regen intake_decline
  // fires. The marker's former rank was 0; the concern must still lead.
  const intake: CachedFinding = {
    rank: 0,
    text: 'intake',
    finding: {
      type: 'intake_decline',
      priorityClass: 'safety',
      trigger: 'consecutive_low',
      species: 'cat',
      daysBelowBaseline: 2,
      refusedFoodLabel: null,
      ratedMealsConsidered: 9,
    } as unknown as CachedFinding['finding'],
  }
  const merged = mergeStandDowns([intake, cachedBenign(1)], [marker({ formerRank: 0 })], 'Nyx')
  assert.deepEqual(merged.map((e) => [e.rank, e.finding.type]), [
    [0, 'intake_decline'],
    [1, 'stood_down'],
    [2, 'postprandial_timing'],
  ])
  // Two safety cards ⇒ below both, even with formerRank 1.
  const two = mergeStandDowns([intake, { ...cachedChronicity(1) }], [marker({ formerRank: 1 })], 'Nyx')
  assert.deepEqual(two.map((e) => e.finding.type), ['intake_decline', 'symptom_chronicity', 'stood_down'])
})

Deno.test('mergeStandDowns — a former rank past the end appends; an empty set yields the line alone', () => {
  const merged = mergeStandDowns([cachedBenign(0)], [marker({ formerRank: 5 })], 'Nyx')
  assert.deepEqual(merged.map((e) => [e.rank, e.finding.type]), [[0, 'postprandial_timing'], [1, 'stood_down']])
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
  // The episode's own day never counts, however many events land on it.
  const sameDay = stoodDownInput({ mealEvents: [mealAgo(15), mealAgo(15), mealAgo(15), ...mealsDaily(0, 7)] })
  assert.equal(gapLoggingHeld(sameDay, last, NOW_MS, 3), false)
})

// ── EN-F (Engines v3 PR-11a; 075 §4): no stand-down is minted across a change in a key the
// Signal engine reads. A stand-down tells the owner a finding went away; across such a
// change the finding may be missing because the ENGINE changed. The gate is the one
// index.ts applies to the prior payload. Since PR-32 the Signal reads one key,
// engines_v3_en11 (SIGNAL_ENGINE_KEYS); READ_BY_SIGNAL below stands in for any such key.

const FLAGS_OFF: EngineFlags = { on: [], readOk: true }
const FLAGS_ON: EngineFlags = { on: ['engines_v3_en0'], readOk: true }
const READ_BY_SIGNAL = ['engines_v3_en0']
const gated = (prior: PriorEntry[], priorFlags: unknown, current: EngineFlags, signalKeys: readonly string[]) =>
  resolve(priorForStandDowns(prior, standDownMintAllowed(priorFlags, current, signalKeys)), stoodDownInput())

Deno.test('EN-F — the real key set: a flip of a key the Signal never reads mints as shipped; EN-11\'s does not', () => {
  const prior = [priorChronicity('vomit', 'firm')]
  const shipped = resolve(prior, stoodDownInput())
  assert.equal(shipped.length, 1, 'fixture premise: the golden shape mints')
  assert.deepEqual([...SIGNAL_ENGINE_KEYS], ['engines_v3_en11'], 'a Signal key was added or removed: restate this test')
  // engines_v3_en0 changes the vomit read, never the Signal, so its flip still mints.
  for (const [priorFlags, current] of [
    [[], FLAGS_OFF], [null, FLAGS_OFF], [[], FLAGS_ON], [['engines_v3_en0'], FLAGS_OFF],
    [['engines_v3_en11'], { on: ['engines_v3_en11'], readOk: true }],
  ] as [unknown, EngineFlags][]) {
    assert.deepEqual(gated(prior, priorFlags, current, SIGNAL_ENGINE_KEYS), shipped, JSON.stringify([priorFlags, current]))
  }
  // EN-11 on, or rolled back, or a read that did not answer: the vanished card is not announced.
  for (const [priorFlags, current] of [
    [[], { on: ['engines_v3_en11'], readOk: true }], [null, { on: ['engines_v3_en11'], readOk: true }],
    [['engines_v3_en11'], FLAGS_OFF], [[], { on: [], readOk: false }],
  ] as [unknown, EngineFlags][]) {
    assert.deepEqual(gated(prior, priorFlags, current, SIGNAL_ENGINE_KEYS), [], JSON.stringify([priorFlags, current]))
  }
})

Deno.test('EN-F — same Signal keys, or a pre-stamp prior under flag-off: mints exactly as it shipped', () => {
  const prior = [priorChronicity('vomit', 'firm')]
  const shipped = resolve(prior, stoodDownInput())
  assert.deepEqual(gated(prior, [], FLAGS_OFF, READ_BY_SIGNAL), shipped)
  assert.deepEqual(gated(prior, null, FLAGS_OFF, READ_BY_SIGNAL), shipped, 'a pre-stamp row was the flag-off engine')
  assert.deepEqual(gated(prior, ['engines_v3_en0'], FLAGS_ON, READ_BY_SIGNAL), shipped)
})

Deno.test('EN-F — a Signal key turned on, or rolled back: the vanished card is NOT announced as stood down', () => {
  const prior = [priorChronicity('vomit', 'firm')]
  assert.deepEqual(gated(prior, [], FLAGS_ON, READ_BY_SIGNAL), [])
  assert.deepEqual(gated(prior, null, FLAGS_ON, READ_BY_SIGNAL), [])
  assert.deepEqual(gated(prior, ['engines_v3_en0'], FLAGS_OFF, READ_BY_SIGNAL), [])
})

Deno.test('EN-F — with a Signal key, a flag read that did not answer mints nothing', () => {
  assert.deepEqual(gated([priorChronicity('vomit', 'firm')], [], { on: [], readOk: false }, READ_BY_SIGNAL), [])
})

Deno.test('EN-F — a marker minted before the change still CARRIES (a past fact, re-anchored to the record)', () => {
  const prior = [priorMarker('vomit', 3, 1)]
  const carried = gated(prior, [], FLAGS_ON, READ_BY_SIGNAL)
  assert.equal(carried.length, 1)
  assert.deepEqual(carried, resolve(prior, stoodDownInput()))
})

Deno.test('EN-F — priorForStandDowns: allowed returns the prior untouched; gated keeps only markers', () => {
  const prior = [priorChronicity('vomit', 'firm', 0), priorMarker('cough', 2, 1)]
  assert.equal(priorForStandDowns(prior, true), prior)
  assert.deepEqual(priorForStandDowns(prior, false).map((e) => e.finding.type), ['stood_down'])
})

// ── A carried marker is rebuilt, never spread (rls-privacy-reviewer, Engines v3 PR-11a) ──
// The prior row is client-writable (CUL-1378) and a carried marker now reaches the
// service-role shown log, so a marker no mint could have made is dropped, and a real one
// keeps only the fields a mint writes.

const forged = (over: Record<string, unknown>): PriorEntry => {
  const real = priorMarker('vomit', 3, 1)
  return { rank: real.rank, finding: { ...real.finding, ...over } as PriorEntry['finding'] }
}

Deno.test('CARRY hardening — a real marker is carried exactly as before', () => {
  const out = resolve([priorMarker('vomit', 3, 1)], stoodDownInput())
  assert.deepEqual(out, [{ ...(priorMarker('vomit', 3, 1).finding as unknown as StoodDownMarker), formerRank: 1 }])
})

Deno.test('CARRY hardening — a marker no mint could make is dropped', () => {
  const inp = stoodDownInput()
  assert.deepEqual(resolve([forged({ tier: 'secret_payload_abc123' })], inp), [], 'an unknown tier')
  assert.deepEqual(resolve([forged({ recencyDays: '<script>' })], inp), [], 'a non-integer floor')
  assert.deepEqual(resolve([forged({ recencyDays: 0 })], inp), [], 'a zero floor')
  assert.deepEqual(resolve([forged({ recencyDays: 400 })], inp), [], 'a floor the engine does not use')
  assert.deepEqual(resolve([forged({ recencyDays: 28 })], inp), [], "cough's floor on a vomiting marker")
  assert.deepEqual(resolve([forged({ stoodDownAt: new Date(NOW_MS + 30 * DAY_MS).toISOString() })], inp), [], 'a future mint')
})

Deno.test('CARRY hardening — only the minted fields survive; priorityClass is always insight', () => {
  const [out] = resolve([forged({ priorityClass: 'safety', smuggle: 'x'.repeat(50) })], stoodDownInput())
  assert.equal(out.priorityClass, 'insight')
  assert.deepEqual(Object.keys(out).sort(), [
    'associationalOnly', 'formerRank', 'lastEpisodeIso', 'priorityClass', 'recencyDays', 'stoodDownAt', 'symptomType', 'tier', 'type',
  ])
})
