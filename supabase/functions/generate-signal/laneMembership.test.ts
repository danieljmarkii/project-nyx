// Per-lane symptom membership — W1-PR-3b session 1 (CUL-676, HR-1; rulings R1/R2/R3, PM 2026-08-28).
//
// The split under test: SYMPTOM_TYPE_UNIVERSE (what the module can NAME) vs
// CORRELATION_SYMPTOM_TYPES (what index.ts FETCHES) vs LANE_SYMPTOM_TYPES (which
// fetched types each lane CONSUMES). Before it, adding one type to the fetch
// auto-enrolled it in ①③④⑦, L4 and the diagnostics floor at once — including the
// food↔cough attribution §9 forbids by name.
//
// FIXTURE DISCIPLINE (CUL-613 — the unfalsifiable-test class): the 2026-08-27 review
// caught the spec mandating a "⑤ must not fire for cough" fixture that was trivially
// green against ANY build (⑤ is a vomit-only constant and never read the list). So every
// negative fixture here is paired with a POSITIVE CONTROL: the identical event shape as
// vomit fires the lane, proving the shape is potent and the silence is membership, not
// accident. The membership consts themselves were also manually red-checked (a cell
// temporarily gained 'cough' and the paired fixtures went red) before being trusted.
//
// SESSION-2 NOTE: the ⑦ negatives below flip DELIBERATELY when cough joins
// LANE_SYMPTOM_TYPES.chronicity (with its own perType floors — Dr. Chen, B-755).
// The ① and diagnostics-floor negatives never flip (§9 / R2: a respiratory sign
// never gets a food-attribution window and never satisfies a food card's gate).

import { strict as assert } from 'node:assert'
import {
  detectCorrelations,
  detectWorsening,
  detectReflections,
  detectChronicity,
  detectGapShortening,
  detectCoverage,
  detectSignals,
  chronicityFloorsFor,
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
  LANE_SYMPTOM_TYPES,
  SYMPTOM_TYPE_UNIVERSE,
  type CoverageDiagnostic,
  type DetectionConfig,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type PetContext,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

// ── Fixture helpers (the detection.test.ts idiom) ─────────────────────────────

const DAY = 86_400_000
let idSeq = 0
const nextId = () => `lm-${++idSeq}`

/** ISO-8601 UTC for a day/hour in May 2026 (same clock as detection.test.ts). */
const at = (day: number, hour = 8, min = 0): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`

const NOW = at(30, 12)
const NOW_MS = Date.parse(NOW)

const dog: PetContext = { name: 'Mochi', species: 'dog', dietTrialActive: false }

const symptom = (type: SymptomType, occurredAt: string): SymptomEvent => ({
  id: nextId(),
  type,
  occurredAt,
})

/** A symptom `d` days (and one hour — the window is [start, now), so d=0 must not
 *  land exactly ON `now` and fall out of it) before NOW. */
const ago = (type: SymptomType, d: number): SymptomEvent =>
  symptom(type, new Date(NOW_MS - d * DAY - 3_600_000).toISOString())

const meal = (over: Partial<MealEvent>): MealEvent => ({
  id: nextId(),
  occurredAt: at(20, 8),
  foodItemId: null,
  primaryProtein: null,
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
  ...over,
})

const pMeal = (day: number, protein: string, hour = 8): MealEvent =>
  meal({ occurredAt: at(day, hour), primaryProtein: protein })

const ratedProteinMeal = (day: number, protein: string, rating: IntakeRating): MealEvent =>
  meal({ occurredAt: at(day, 8), primaryProtein: protein, intakeRating: rating })

const staple = (from: number, to: number, protein: string, hour: number): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = from; d <= to; d++) out.push(pMeal(d, protein, hour))
  return out
}

const input = (over: Partial<DetectionInput>): DetectionInput => ({
  pet: dog,
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  ...over,
})

const chronCfg = (over: Partial<DetectionConfig['chronicity']>): DetectionConfig => ({
  ...DEFAULT_CONFIG,
  chronicity: { ...DEFAULT_CONFIG.chronicity, ...over },
})

const findDiag = <T extends CoverageDiagnostic['type']>(
  diags: CoverageDiagnostic[],
  type: T,
): Extract<CoverageDiagnostic, { type: T }> | undefined =>
  diags.find((d): d is Extract<CoverageDiagnostic, { type: T }> => d.type === type)

// ── 1 · The decision table, pinned ────────────────────────────────────────────

const FIVE: readonly SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']

Deno.test('membership: the universe names the W1 pair; the fetch does NOT (cough joins in session 2)', () => {
  assert.deepEqual(
    [...SYMPTOM_TYPE_UNIVERSE],
    ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze'],
  )
  assert.deepEqual([...CORRELATION_SYMPTOM_TYPES], [...FIVE])
})

Deno.test('membership: every lane cell is exactly the pre-taxonomy five (behaviour-neutral split)', () => {
  for (const [lane, cell] of Object.entries(LANE_SYMPTOM_TYPES)) {
    assert.deepEqual([...cell], [...FIVE], `lane ${lane} must carry exactly the five`)
  }
})

Deno.test('membership: the two NEVER-cells carry no respiratory type (§9 / R2 — these never flip)', () => {
  for (const t of ['cough', 'sneeze'] as const) {
    assert.ok(!LANE_SYMPTOM_TYPES.correlation.includes(t), `① must never consume ${t}`)
    assert.ok(!LANE_SYMPTOM_TYPES.diagnosticsFloor.includes(t), `the food-diagnostics floor must never count ${t}`)
  }
})

// ── 2 · Lane ① — a respiratory sign gets no food-attribution window ───────────

const CORRELATION_SHAPE = {
  mealEvents: [
    ...staple(1, 10, 'chicken', 9),
    pMeal(2, 'beef', 10),
    pMeal(4, 'beef', 10),
    pMeal(6, 'beef', 10),
  ],
}
const correlationSymptoms = (type: SymptomType): SymptomEvent[] => [
  symptom(type, at(2, 11)),
  symptom(type, at(4, 11)),
  symptom(type, at(6, 11)),
]

Deno.test('① positive control: the shape fires for vomit (beef Early candidate)', () => {
  const findings = detectCorrelations(
    input({ ...CORRELATION_SHAPE, symptomEvents: correlationSymptoms('vomit') }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].protein, 'beef')
  assert.equal(findings[0].symptomType, 'vomit')
})

Deno.test('① negative: the identical shape as cough yields NOTHING — the food↔cough card §9 forbids by name', () => {
  const findings = detectCorrelations(
    input({ ...CORRELATION_SHAPE, symptomEvents: correlationSymptoms('cough') }),
  )
  assert.deepEqual(findings, [])
})

// ── 3 · Lanes ③/④ — no delta cards for a respiratory sign at W1 ───────────────

const worseningShape = (type: SymptomType): Partial<DetectionInput> => ({
  symptomEvents: [
    symptom(type, at(24, 8)), symptom(type, at(24, 12)),
    symptom(type, at(26, 8)), symptom(type, at(26, 12)),
    symptom(type, at(17, 8)), symptom(type, at(19, 8)),
  ],
  mealEvents: [meal({ occurredAt: at(28, 8) }), meal({ occurredAt: at(21, 8) })],
})

Deno.test('④ positive control: the rise shape fires for vomit', () => {
  const findings = detectWorsening(input(worseningShape('vomit')))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'vomit')
})

Deno.test('④ negative: the identical rise as cough is silent (symptomDelta cell — no at W1)', () => {
  assert.deepEqual(detectWorsening(input(worseningShape('cough'))), [])
})

const flatShape = (type: SymptomType): SymptomEvent[] => [
  symptom(type, at(24, 8)), symptom(type, at(26, 8)), symptom(type, at(28, 8)),
  symptom(type, at(17, 8)), symptom(type, at(19, 8)), symptom(type, at(21, 8)),
]

Deno.test('③ positive control: a flat vomit fortnight reflects', () => {
  const findings = detectReflections(input({ symptomEvents: flatShape('vomit') }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'vomit')
})

Deno.test('③ negative: the identical flat fortnight as cough is silent', () => {
  assert.deepEqual(detectReflections(input({ symptomEvents: flatShape('cough') })), [])
})

// ── 4 · Lane ⑦ — cough is not chronic-eligible until session 2 flips its cell ─

/** The council case: q2-day episodes across 42 days — fires FIRM for vomit. */
const councilShape = (type: SymptomType): SymptomEvent[] => {
  const out: SymptomEvent[] = []
  for (let d = 0; d <= 42; d += 2) out.push(ago(type, d))
  return out
}

Deno.test('⑦ positive control: the council case fires FIRM for vomit', () => {
  const findings = detectChronicity(input({ symptomEvents: councilShape('vomit') }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'vomit')
  assert.equal(findings[0].tier, 'firm')
})

Deno.test('⑦ negative (flips in session 2): the identical 6-week course as cough is silent today', () => {
  assert.deepEqual(detectChronicity(input({ symptomEvents: councilShape('cough') })), [])
})

// ── 5 · Lane L4 — no accelerating-cadence card for cough (R1: no at W1) ───────

/** Onsets walking backward from ~now by the given gaps — the L4 suite's firing shape. */
const gapShape = (type: SymptomType, gapsDays: readonly number[]): SymptomEvent[] => {
  const onsets = [NOW_MS - 3_600_000]
  for (let i = gapsDays.length - 1; i >= 0; i--) onsets.unshift(onsets[0] - gapsDays[i] * DAY)
  return onsets.map((ms) => symptom(type, new Date(ms).toISOString()))
}

Deno.test('L4 positive control: the monotone-4 shortening run fires for vomit', () => {
  const findings = detectGapShortening(input({ symptomEvents: gapShape('vomit', [20, 12, 6, 3]) }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'vomit')
})

Deno.test('L4 negative: the identical shortening run as cough is silent (R1, PM 2026-08-28)', () => {
  assert.deepEqual(detectGapShortening(input({ symptomEvents: gapShape('cough', [20, 12, 6, 3]) })), [])
})

// ── 6 · The diagnostics floor — cough never satisfies a food-attribution gate ─

const STAPLE_MEALS = [
  ratedProteinMeal(18, 'chicken', 'all'),
  ratedProteinMeal(20, 'chicken', 'all'),
  ratedProteinMeal(22, 'chicken', 'all'),
  ratedProteinMeal(24, 'chicken', 'all'),
  ratedProteinMeal(26, 'chicken', 'all'),
]
const stapleSymptoms = (type: SymptomType): SymptomEvent[] => [
  symptom(type, at(19, 8)),
  symptom(type, at(21, 8)),
  symptom(type, at(25, 8)),
]

Deno.test('floor positive control: staple_washout fires on three vomit episodes', () => {
  const diags = detectCoverage(input({ mealEvents: STAPLE_MEALS, symptomEvents: stapleSymptoms('vomit') }))
  assert.ok(findDiag(diags, 'staple_washout'), 'staple_washout present for vomit')
})

Deno.test('floor negative: three cough episodes never open the staple_washout door (R2, PM 2026-08-28)', () => {
  // The exact reachability the review named: with cough satisfying this floor, a
  // protein↔cough implication ("…can't yet tell whether it's linked to the symptoms
  // you're tracking") was reachable without ① ever firing.
  const diags = detectCoverage(input({ mealEvents: STAPLE_MEALS, symptomEvents: stapleSymptoms('cough') }))
  assert.equal(findDiag(diags, 'staple_washout'), undefined)
})

// ── 7 · The per-type chronicity floor slot (the B-755 seam, empty today) ──────

Deno.test('perType: absent map resolves to the globals — byte-identical engine', () => {
  const cfg = DEFAULT_CONFIG.chronicity
  assert.equal(chronicityFloorsFor('vomit', cfg), cfg)
  assert.equal(chronicityFloorsFor('cough', cfg), cfg)
})

Deno.test('perType: an override moves ONLY its own type', () => {
  const cfg = chronCfg({ perType: { vomit: { minEpisodes: 99 } } }).chronicity
  assert.equal(chronicityFloorsFor('vomit', cfg).minEpisodes, 99)
  assert.equal(chronicityFloorsFor('itch', cfg).minEpisodes, DEFAULT_CONFIG.chronicity.minEpisodes)
  // Un-overridden floors ride along unchanged.
  assert.equal(chronicityFloorsFor('vomit', cfg).minSpanDays, DEFAULT_CONFIG.chronicity.minSpanDays)
})

Deno.test('perType: ⑦ respects a raised floor — the council case goes silent under minEpisodes 99', () => {
  const findings = detectChronicity(
    input({ symptomEvents: councilShape('vomit') }),
    chronCfg({ perType: { vomit: { minEpisodes: 99 } } }),
  )
  assert.deepEqual(findings, [])
})

Deno.test('perType: the tier resolver reads per-type firmSpanDays (council case drops firm → standard)', () => {
  const findings = detectChronicity(
    input({ symptomEvents: councilShape('vomit') }),
    chronCfg({ perType: { vomit: { firmSpanDays: 100 } } }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].tier, 'standard')
})

Deno.test('perType: the ③-valve shares the resolved floors by construction (one predicate, §5.3)', () => {
  // A flat itch fortnight that reflects on its own, plus a chronic vomit course whose
  // week-over-week cadence is FLAT (3 current / 3 prior) — the council q2-day shape reads
  // 4-vs-3 across the two windows and trips the layer's WORSENING gate, which blanks
  // reflections regardless of chronicity and would mask exactly what this test measures.
  const flatChronicVomit = [1, 3, 5, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 43].map((d) =>
    ago('vomit', d),
  )
  const both = { symptomEvents: [...flatShape('itch'), ...flatChronicVomit] }
  // Valve closed: the chronic course blanks the whole reflection layer.
  assert.deepEqual(detectReflections(input(both)), [])
  // Raise vomit's per-type floor so the course is no longer chronic — the SAME input
  // un-blanks and the layer reflects again. If the valve read the global floors
  // instead of the resolver, this stays [] and the test goes red.
  const findings = detectReflections(input(both), chronCfg({ perType: { vomit: { minEpisodes: 99 } } }))
  assert.ok(findings.length > 0, 'valve must reopen under the per-type floor')
})

// ── 8 · The sweep: nothing in the composed output ever names cough today ──────

Deno.test('sweep: a cough-saturated record produces NO finding naming cough (fetch still guards prod; this guards the seams)', () => {
  // Every potent shape at once, all as cough, over a real meal record. Cough logs DO
  // count as logged days in the density denominators (R3 — ruled, deliberate); this
  // sweep asserts no LANE ever speaks cough's name before session 2.
  const findings = detectSignals(
    input({
      mealEvents: [...staple(1, 28, 'chicken', 9), pMeal(2, 'beef', 10), pMeal(4, 'beef', 10)],
      symptomEvents: [...councilShape('cough'), ...gapShape('cough', [20, 12, 6, 3])],
    }),
  )
  for (const { finding } of findings) {
    const named = (finding as { symptomType?: string }).symptomType
    assert.notEqual(named, 'cough', `lane ${finding.type} must not name cough`)
    assert.notEqual(named, 'sneeze', `lane ${finding.type} must not name sneeze`)
  }
})
