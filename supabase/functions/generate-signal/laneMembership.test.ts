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
  computeReflectionDensity,
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

Deno.test('membership: the universe names the W1 pair; the fetch carries cough, NOT sneeze', () => {
  assert.deepEqual(
    [...SYMPTOM_TYPE_UNIVERSE],
    ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze'],
  )
  // Session 2 (CUL-676): cough joins the FETCH — which buys it the DB read and the
  // logged-day denominators (R3), and nothing else. `sneeze` stays out: it is typed and
  // labelled everywhere, and deliberately never read by the engine at W1 (§9).
  assert.deepEqual([...CORRELATION_SYMPTOM_TYPES], [...FIVE, 'cough'])
  // Widened deliberately: the `as const` tuple already makes this a COMPILE error, which is
  // the stronger guarantee — the cast is what lets the runtime assertion exist beside it.
  assert.ok(!(CORRELATION_SYMPTOM_TYPES as readonly SymptomType[]).includes('sneeze'))
})

Deno.test('membership: cough is in EXACTLY ONE lane cell — ⑦ — and no other cell moved', () => {
  // The whole point of the HR-1 split, pinned as one assertion: widening the fetch must
  // move exactly one cell. If a future edit adds cough to a second lane, this fails here
  // rather than surfacing as a food↔cough card in production.
  for (const [lane, cell] of Object.entries(LANE_SYMPTOM_TYPES)) {
    const expected = lane === 'chronicity' ? [...FIVE, 'cough'] : [...FIVE]
    assert.deepEqual([...cell], expected, `lane ${lane} cell`)
  }
  const lanesWithCough = Object.entries(LANE_SYMPTOM_TYPES)
    .filter(([, cell]) => (cell as readonly SymptomType[]).includes('cough'))
    .map(([lane]) => lane)
  assert.deepEqual(lanesWithCough, ['chronicity'])
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

Deno.test('⑦ FLIPPED (session 2): the identical 6-week course as cough now fires FIRM', () => {
  // The one cell that moves in session 2. Same event shape as the vomit positive control
  // above — so this pair proves the enrolment, not a difference in the fixture.
  const findings = detectChronicity(input({ symptomEvents: councilShape('cough') }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].symptomType, 'cough')
  assert.equal(findings[0].tier, 'firm')
})

Deno.test('⑦ sneeze stays silent on the identical course — the fetch, not the lane, excludes it', () => {
  assert.deepEqual(detectChronicity(input({ symptomEvents: councilShape('sneeze') })), [])
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

Deno.test('perType: a type with no entry resolves to the globals — identity, not a copy', () => {
  const cfg = DEFAULT_CONFIG.chronicity
  assert.equal(chronicityFloorsFor('vomit', 'dog', cfg), cfg)
  assert.equal(chronicityFloorsFor('diarrhea', 'dog', cfg), cfg)
})

Deno.test('perType: the Dr. Chen ruling — cough floors, and the species split', () => {
  const cfg = DEFAULT_CONFIG.chronicity
  const dog = chronicityFloorsFor('cough', 'dog', cfg)
  const cat = chronicityFloorsFor('cough', 'cat', cfg)

  // Q2 — the split. Dogs need 5 because the cough BUTTON also collects reverse sneezing,
  // which is paroxysmal, recurrent, owner-named "coughing", and clinically nothing; cats
  // have no equivalent benign phenotype at this cadence.
  assert.equal(dog.minEpisodes, 5)
  assert.equal(cat.minEpisodes, 4)
  // Q4 — the reversal. A fortnight of silence answers nothing about a relapsing-remitting
  // airway disease, so this is 28 for BOTH species (not a cat-only override).
  assert.equal(dog.ongoingRecencyDays, 28)
  assert.equal(cat.ongoingRecencyDays, 28)
  assert.notEqual(cfg.ongoingRecencyDays, 28, 'and it genuinely diverges from the global')
  // Q3 — kept, and 42 rejected for both species.
  assert.equal(dog.firmSpanDays, 28)
  assert.equal(cat.firmSpanDays, 28)

  // Unchanged floors, pinned so "calibrating cough" cannot quietly become "loosening cough".
  for (const f of [dog, cat]) {
    assert.equal(f.minSpanDays, cfg.minSpanDays)
    assert.equal(f.minActiveWeeks, cfg.minActiveWeeks)
    assert.equal(f.windowDays, cfg.windowDays, 'never per-type by construction')
  }

  // The nested `cat` key must never leak through as a floor — spreading it would put an
  // object where a number belongs and make every comparison against it false, silencing
  // the lane exactly like the explicit-undefined defect the resolver already hardens against.
  assert.equal((dog as Record<string, unknown>).cat, undefined)
  assert.equal((cat as Record<string, unknown>).cat, undefined)
})

Deno.test('perType: a non-cat, non-dog species resolves to the base floors, never the cat ones', () => {
  // `other` is a real Species value. It must land on the general value (5), not silently
  // inherit the more sensitive feline one.
  assert.equal(chronicityFloorsFor('cough', 'other', DEFAULT_CONFIG.chronicity).minEpisodes, 5)
})

Deno.test('the species split is REACHABLE end-to-end — the same course, two species', () => {
  // The pin that matters: a resolver split nothing consumes is decoration. This is a
  // 4-episode cough course over 24 days — above the cat floor, below the dog floor.
  const course = [1, 9, 17, 24].map((d) => ago('cough', d))
  // Meals across the window so ⑦'s span-halves logging guard is satisfied and the ONLY
  // thing separating the two runs is the species floor (the fixture-discipline this file
  // exists for — a silence that comes from the wrong floor proves nothing).
  const meals: MealEvent[] = []
  for (let d = 0; d <= 30; d++) meals.push(meal({ occurredAt: new Date(NOW_MS - d * DAY).toISOString() }))
  const cat: PetContext = { name: 'Pixel', species: 'cat', dietTrialActive: false }
  assert.equal(
    detectChronicity(input({ pet: cat, symptomEvents: course, mealEvents: meals })).length,
    1,
    'cat: fires at 4',
  )
  assert.equal(
    detectChronicity(input({ symptomEvents: course, mealEvents: meals })).length,
    0,
    'dog: silent below 5',
  )
})

Deno.test('perType: an explicit-undefined floor resolves to the GLOBAL, never silences the lane (adversarial 2026-08-28)', () => {
  // Partial<{…}> admits { minEpisodes: undefined }; a bare spread would overwrite the
  // global and `episodeCount >= undefined` is false — a 6-week q2-day course going
  // SILENT is reassurance-by-absence on a safety lane, minted by exactly the config
  // shape a spread-from-partial assembly produces.
  const cfg = chronCfg({ perType: { vomit: { minEpisodes: undefined } } }).chronicity
  assert.equal(chronicityFloorsFor('vomit', 'dog', cfg).minEpisodes, DEFAULT_CONFIG.chronicity.minEpisodes)
  const findings = detectChronicity(
    input({ symptomEvents: councilShape('vomit') }),
    chronCfg({ perType: { vomit: { minEpisodes: undefined, firmSpanDays: undefined } } }),
  )
  assert.equal(findings.length, 1, 'the safety lane must still fire')
  assert.equal(findings[0].tier, 'firm', 'the tier resolver must also survive an undefined override')
})

Deno.test('perType: an override moves ONLY its own type', () => {
  const cfg = chronCfg({ perType: { vomit: { minEpisodes: 99 } } }).chronicity
  assert.equal(chronicityFloorsFor('vomit', 'dog', cfg).minEpisodes, 99)
  assert.equal(chronicityFloorsFor('itch', 'dog', cfg).minEpisodes, DEFAULT_CONFIG.chronicity.minEpisodes)
  // Un-overridden floors ride along unchanged.
  assert.equal(chronicityFloorsFor('vomit', 'dog', cfg).minSpanDays, DEFAULT_CONFIG.chronicity.minSpanDays)
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
//
// One potent shape per RUN — mixing them destroys the shapes (the adversarial pass
// caught the first draft doing exactly that: councilShape + gapShape interleaved
// breaks the L4 monotone run, so the sweep silently stopped exercising L4). Each
// entry is the SAME shape its lane's positive control proves fires for vomit.
// Cough logs DO count as logged days in the density denominators (R3 — ruled,
// deliberate); the sweep asserts no LANE speaks cough's name before session 2.

const SWEEP_INPUTS: Record<string, Partial<DetectionInput>> = {
  'correlation shape (①)': { ...CORRELATION_SHAPE, symptomEvents: correlationSymptoms('cough') },
  'worsening rise (④)': worseningShape('cough'),
  'flat fortnight (③)': { symptomEvents: flatShape('cough') },
  'council chronic course (⑦)': { symptomEvents: councilShape('cough') },
  'monotone shortening run (L4)': { symptomEvents: gapShape('cough', [20, 12, 6, 3]) },
}

Deno.test('sweep: ⑦ is the ONLY lane that may ever name cough end-to-end', () => {
  // NARROWED, not weakened, in session 2. It used to assert that NO finding names cough;
  // now exactly one lane legitimately does, so the assertion becomes the sharper one: run
  // every lane's own potent shape as cough through the whole composed pipeline, and the
  // only finding type allowed to carry the name is symptom_chronicity. The four "never"
  // cells are still proven by the same fixtures they were before — a cell quietly gaining
  // cough still fails here, which is the property that had to survive the flip.
  let sawChronicity = false
  for (const [name, over] of Object.entries(SWEEP_INPUTS)) {
    for (const { finding } of detectSignals(input(over))) {
      const named = (finding as { symptomType?: string }).symptomType
      if (named === 'cough') {
        assert.equal(finding.type, 'symptom_chronicity', `${name}: lane ${finding.type} must not name cough`)
        sawChronicity = true
      }
      assert.notEqual(named, 'sneeze', `${name}: lane ${finding.type} must not name sneeze`)
    }
  }
  // Anti-vacuity: the sweep must actually have reached the one lane it now permits, or a
  // future silencing bug would leave this test green over a cough the engine stopped
  // seeing entirely (the unfalsifiable-fixture class this file exists to avoid).
  assert.ok(sawChronicity, 'the ⑦ shape must still produce a cough chronicity finding')
})

Deno.test('sweep: the staple-washout shape as cough mints no diagnostic naming the symptoms (floor half)', () => {
  const diags = detectCoverage(input({ pet: dog, mealEvents: STAPLE_MEALS, symptomEvents: stapleSymptoms('cough') }))
  assert.equal(findDiag(diags, 'staple_washout'), undefined)
  assert.equal(findDiag(diags, 'diet_churn'), undefined)
})

// ── 9 · The structural guard: no detector may iterate the raw lists directly ──
// The detectionSoftDelete.test.ts shape (source is the only place this contract
// lives): a lane loop reaching past its cell for CORRELATION_SYMPTOM_TYPES or the
// universe re-creates the HR-1 auto-enrolment this whole split removes. The fetch
// (index.ts) and report set-membership reads are the sanctioned consumers.
Deno.test('no detector loop iterates CORRELATION_SYMPTOM_TYPES or SYMPTOM_TYPE_UNIVERSE directly', () => {
  const src = Deno.readTextFileSync(new URL('./detection.ts', import.meta.url))
  // The loop form specifically — `typeof SYMPTOM_TYPE_UNIVERSE` (the type derivation)
  // contains `of SYMPTOM_TYPE_UNIVERSE` as a substring and is sanctioned.
  assert.equal(
    src.match(/for \(const \w+ of CORRELATION_SYMPTOM_TYPES/g),
    null,
    'a lane loop must iterate its LANE_SYMPTOM_TYPES cell, never the fetch union',
  )
  assert.equal(
    src.match(/for \(const \w+ of SYMPTOM_TYPE_UNIVERSE/g),
    null,
    'no lane may iterate the type universe — it exists so a leaf can be NAMED without being consumed',
  )
})

// ── 10 · R4 "both stated" — the displacement acceptance test ──────────────────
//
// THE ACCEPTANCE TEST FOR THIS PR (PM ruling R4, 2026-08-28; shape contributed by the
// session-1 adversarial pass). ⑦ used to `return [chronic[0]]`, and the sort's first key
// is SPAN — so the LONGEST course won, which is not the same as the WORST one. With cough
// enrolled, a long mild cough could silently delete a shorter, denser, more urgent
// vomiting course from Home AND from the vet report, and cough's lower per-type episode
// floor makes that strictly more likely.
//
// The shape is deliberately adversarial rather than merely "two chronic symptoms":
//   • cough    — 52-day span, 10 episodes  (wins on span; the MILDER course)
//   • vomiting — 24-day span,  8 episodes  (loses on span; the DENSER, more urgent one)
// A fixture where the urgent course also happened to be the longest would pass against
// the un-fixed engine, and prove nothing.

/** `count` episodes spread evenly across `spanDays`, ending 1 day before NOW (inside the
 *  14-day recency floor) — so span, episode count and active weeks are all controlled. */
const courseOf = (type: SymptomType, spanDays: number, count: number): SymptomEvent[] => {
  const step = spanDays / (count - 1)
  const out: SymptomEvent[] = []
  for (let i = 0; i < count; i++) out.push(ago(type, Math.round(spanDays - i * step) + 1))
  return out
}

const DISPLACEMENT = [...courseOf('cough', 52, 10), ...courseOf('vomit', 24, 8)]

Deno.test('R4 ACCEPTANCE: a longer MILD cough does not delete a denser vomiting course', () => {
  const findings = detectChronicity(input({ symptomEvents: DISPLACEMENT }))
  const named = findings.map((f) => f.symptomType)
  assert.deepEqual(named, ['cough', 'vomit'], 'BOTH courses are stated, longest span leading')

  // Anti-vacuity: each course must independently clear its own floors, or "both stated"
  // would be trivially satisfiable by a fixture where neither is really chronic.
  const vomit = findings.find((f) => f.symptomType === 'vomit')!
  const cough = findings.find((f) => f.symptomType === 'cough')!
  assert.ok(cough.spanDays > vomit.spanDays, 'the cough is the LONGER course (it would have won the cap)')
  assert.ok(vomit.episodeCount >= DEFAULT_CONFIG.chronicity.minEpisodes, 'the vomiting course clears the GI floor on its own')
})

Deno.test('R4: the vomiting course survives the WHOLE pipeline, not just the detector', () => {
  // The displacement was a surface defect, so the proof has to run past composition,
  // ranking and curation — the layers that could each drop a second safety card.
  const ranked = detectSignals(input({ symptomEvents: DISPLACEMENT }))
  const chronic = ranked
    .map((r) => r.finding)
    .filter((f): f is Extract<typeof f, { type: 'symptom_chronicity' }> => f.type === 'symptom_chronicity')
  assert.deepEqual(chronic.map((f) => f.symptomType), ['cough', 'vomit'])
  // Both are safety-class, so curateFindings' cap can never reach them (§3 / Principle 3).
  assert.ok(chronic.every((f) => f.priorityClass === 'safety'))
})

Deno.test('R4: a single chronic course still returns exactly one card (no regression)', () => {
  const findings = detectChronicity(input({ symptomEvents: councilShape('vomit') }))
  assert.equal(findings.length, 1)
})

// ── 11 · §9 cough↔vomit adjacency disclosure ─────────────────────────────────

Deno.test('adjacency: co-firing cough + vomit marks the LEADING card only', () => {
  const findings = detectSignals(input({ symptomEvents: DISPLACEMENT }))
    .map((r) => r.finding)
    .filter((f): f is Extract<typeof f, { type: 'symptom_chronicity' }> => f.type === 'symptom_chronicity')
  assert.equal(findings[0].coughVomitAdjacent, true, 'the leader carries the note')
  assert.equal(findings[1].coughVomitAdjacent, undefined, 'and it is not repeated on every card')
})

Deno.test('adjacency: a chronic cough with NO chronic vomiting is not marked', () => {
  const findings = detectChronicity(input({ symptomEvents: councilShape('cough') }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].coughVomitAdjacent, undefined)
})

Deno.test('adjacency: two chronic GI courses are not marked (the rule is cough↔vomit)', () => {
  const findings = detectChronicity(
    input({ symptomEvents: [...courseOf('vomit', 52, 10), ...courseOf('diarrhea', 24, 8)] }),
  )
  assert.equal(findings.length, 2)
  assert.ok(findings.every((f) => f.coughVomitAdjacent === undefined))
})

// ── 12 · R3 — cough days count in the logged-day / density denominators ───────
//
// PM ruling R3 (2026-08-28): (b) INCLUDE — "activity is activity; logging a cough is
// logging." The engine needs no edit for this: every denominator reads the FETCHED input
// wholesale, so cough joined them the moment it joined CORRELATION_SYMPTOM_TYPES. That is
// precisely why it needs a test — "by construction" is the kind of correctness that
// silently stops being true, and this is the ONE consequence of the fetch widening that no
// lane cell governs.
//
// BEFORE/AFTER is expressed as a controlled pair on the same window rather than by pinning
// the old engine: identical vomit logs, once with cough days added and once without. The
// delta IS the before/after, and it cannot rot the way a hard-coded prior number can.

Deno.test('R3 GATE: a cough-only day does NOT move the comparability denominator', () => {
  // The re-ruling (2026-08-28, after the adversarial pass). R3's "activity is activity"
  // stands for COVERAGE; this denominator is not coverage, it is the gate deciding whether a
  // falling VOMITING comparison may be published — and `densityDisclosureLine` renders these
  // very numbers to the owner as the evidence backing that comparison. A cough day cannot
  // vouch for vomit observation, so it must not appear in the receipt for a vomit claim.
  const vomitOnly: SymptomEvent[] = []
  for (const d of [1, 2, 3, 8, 9, 10]) vomitOnly.push(ago('vomit', d))
  const withCough = [...vomitOnly, ago('cough', 11), ago('cough', 12), ago('cough', 13)]

  const before = computeReflectionDensity(input({ symptomEvents: vomitOnly }), DEFAULT_CONFIG)!
  const after = computeReflectionDensity(input({ symptomEvents: withCough }), DEFAULT_CONFIG)!
  assert.equal(after.currentLoggingDays, before.currentLoggingDays)
  assert.equal(after.priorLoggingDays, before.priorLoggingDays, 'cough-only days must not inflate the gate')
})

Deno.test('R3 GATE: the published-reassurance break stays closed', () => {
  // The adversarial pass's exact shape, as a regression test. Prior week well logged, current
  // week sparse — so a falling comparison is correctly WITHHELD. Adding cough-only days to
  // the current week must not buy back comparability: that is what published a "down from 5
  // last week" over a pet whose only new signal was a cough the engine could not yet name.
  const vomits: SymptomEvent[] = []
  for (const d of [8, 9, 10, 11, 12, 13]) vomits.push(ago('vomit', d))
  vomits.push(ago('vomit', 1))
  const withCough = [...vomits, ago('cough', 2), ago('cough', 3), ago('cough', 4), ago('cough', 5)]

  const withheld = computeReflectionDensity(input({ symptomEvents: vomits }), DEFAULT_CONFIG)!
  assert.equal(withheld.comparable, false, 'the fixture must start from a correctly WITHHELD state')
  const after = computeReflectionDensity(input({ symptomEvents: withCough }), DEFAULT_CONFIG)!
  assert.equal(after.comparable, false, 'cough logs must not flip the gate open')
})

Deno.test('R3 COVERAGE: a cough day still counts where coverage is the question (⑦)', () => {
  // The other half of the rule, and the half that keeps the PM ruling intact: nothing is
  // excluded from the record. ⑦'s span-halves guard asks "was the owner logging at all?" —
  // a genuine coverage question whose failure direction is ESCALATION — so cough days count
  // there. This fixture would fail if the re-ruling had been implemented as a blanket
  // exclusion instead of a gate-scoped one.
  // A course that clears every OTHER floor — span 49, 7 episodes, 3 active weeks, recency 0 —
  // so the dark first half is the unique blocker and this fixture measures only that.
  const sparse = [49, 35, 4, 3, 2, 1, 0].map((d) => ago('vomit', d))
  assert.deepEqual(
    detectChronicity(input({ symptomEvents: sparse })),
    [],
    'a dark first half fails ⑦ logging-eligibility (the unique blocker here)',
  )
  const lit = [...sparse]
  for (let d = 26; d <= 48; d += 2) lit.push(ago('cough', d))
  assert.equal(
    detectChronicity(input({ symptomEvents: lit })).some((f) => f.symptomType === 'vomit'),
    true,
    'cough logs in the dark half ARE coverage — the vomiting course becomes eligible',
  )
})

Deno.test('R3: sneeze counts nowhere — it is not fetched at W1', () => {
  const vomitOnly: SymptomEvent[] = []
  for (const d of [1, 2, 3, 8, 9, 10]) vomitOnly.push(ago('vomit', d))
  const withSneeze = [...vomitOnly, ago('sneeze', 11), ago('sneeze', 12), ago('sneeze', 13)]
  const before = computeReflectionDensity(input({ symptomEvents: vomitOnly }), DEFAULT_CONFIG)!
  const after = computeReflectionDensity(input({ symptomEvents: withSneeze }), DEFAULT_CONFIG)!
  assert.equal(after.priorLoggingDays, before.priorLoggingDays)
})

Deno.test('R3 GATE INVARIANT: exactly the ③/④ lane cell moves the comparability denominator', () => {
  // The generalisation, so a W2 leaf inherits the rule instead of re-deriving it: a type moves
  // this denominator iff it is in the symptomDelta cell — NOT iff it is fetched.
  for (const type of SYMPTOM_TYPE_UNIVERSE) {
    const base = computeReflectionDensity(input({ symptomEvents: [ago('vomit', 1)] }), DEFAULT_CONFIG)!
    const plus = computeReflectionDensity(
      input({ symptomEvents: [ago('vomit', 1), symptom(type, new Date(NOW_MS - 3 * DAY).toISOString())] }),
      DEFAULT_CONFIG,
    )!
    const shouldCount = (LANE_SYMPTOM_TYPES.symptomDelta as readonly SymptomType[]).includes(type)
    assert.equal(
      plus.currentLoggingDays,
      base.currentLoggingDays + (shouldCount ? 1 : 0),
      `${type} must ${shouldCount ? '' : 'NOT '}count toward the comparability gate`,
    )
  }
})

// ── 13 · The floor resolver's own hazards (adversarial pass, 2026-08-28) ──────

Deno.test('resolver: an override may set ONLY the five floors — windowDays cannot leak', () => {
  // Two comments claimed windowDays was "not overridable by construction". It was not:
  // `apply` was a denylist skipping one key, so only the TypeScript type stopped it — which
  // is not construction, because a config assembled at runtime never meets the type. Now an
  // allowlist. The cast is the point: it models exactly the untyped shape that got through.
  const cfg = {
    ...DEFAULT_CONFIG.chronicity,
    perType: { cough: { windowDays: 7, minEpisodes: 5 } },
  } as unknown as DetectionConfig['chronicity']
  const resolved = chronicityFloorsFor('cough', 'dog', cfg)
  assert.equal(resolved.windowDays, DEFAULT_CONFIG.chronicity.windowDays, 'windowDays must not be overridable')
  assert.equal(resolved.minEpisodes, 5, 'and a real floor still applies')
})

Deno.test('resolver: a partial per-type replacement cannot silently drop the cat override', () => {
  // LATENT TODAY (DEFAULT_CONFIG is the only config assembled in production) and pinned
  // anyway, because its failure direction is silencing the MORE SENSITIVE feline floor —
  // a config that replaces `cough` wholesale without carrying `cat` forward would raise
  // cats from 4 to whatever the base says, invisibly.
  const cfg = {
    ...DEFAULT_CONFIG.chronicity,
    perType: { cough: { minEpisodes: 6 } },
  } as unknown as DetectionConfig['chronicity']
  assert.equal(
    chronicityFloorsFor('cough', 'cat', cfg).minEpisodes,
    6,
    'documented consequence: dropping `cat` from a replacement drops the feline floor with it',
  )
  // The shipped config must never be in that state — this is the assertion that matters.
  assert.equal(chronicityFloorsFor('cough', 'cat', DEFAULT_CONFIG.chronicity).minEpisodes, 4)
})

Deno.test('resolver: a nested cat-inside-cat never reaches a floor slot', () => {
  const cfg = {
    ...DEFAULT_CONFIG.chronicity,
    perType: { cough: { minEpisodes: 5, cat: { minEpisodes: 4, cat: { minEpisodes: 1 } } } },
  } as unknown as DetectionConfig['chronicity']
  const resolved = chronicityFloorsFor('cough', 'cat', cfg)
  assert.equal(resolved.minEpisodes, 4)
  assert.equal((resolved as Record<string, unknown>).cat, undefined)
})

// ── 14 · ⑦ fires ⟺ ③ blanked, ACROSS THE SPECIES SPLIT ───────────────────────

Deno.test('valve: the ③ suppression tracks ⑦ in every species × count × recency cell', () => {
  // The guard the species split newly needs. `isChronic` is shared by ⑦ and the ③-valve, so
  // "③ goes silent ⟺ ⑦ speaks" is meant to hold by construction — but threading species into
  // one and forgetting the other is exactly the mistake the split makes possible, and the
  // existing valve pin only covers dog/vomit. A desync either renders a calm reflection card
  // over a pet with a chronic course, or blanks the reflection layer with no card explaining
  // why. Sweeping the cells is cheap; the failure is silent.
  const meals: MealEvent[] = []
  for (let d = 0; d <= 56; d++) meals.push(meal({ occurredAt: new Date(NOW_MS - d * DAY).toISOString() }))
  // A flat, reflection-eligible vomit course so ③ has something to say whenever it may speak.
  const vomits: SymptomEvent[] = []
  for (const d of [1, 3, 5, 8, 10, 12]) vomits.push(ago('vomit', d))

  let cells = 0
  for (const species of ['dog', 'cat', 'other'] as const) {
    for (const episodes of [3, 4, 5, 6, 7]) {
      for (const sinceLast of [0, 5, 13, 14, 15, 20, 27, 28, 29, 35]) {
        const coughs: SymptomEvent[] = []
        for (let i = 0; i < episodes; i++) coughs.push(ago('cough', sinceLast + i * 8))
        const inp = input({
          pet: { name: 'T', species, dietTrialActive: false },
          symptomEvents: [...vomits, ...coughs],
          mealEvents: meals,
        })
        const chronic = detectChronicity(inp).length > 0
        const reflectionsSilent = detectReflections(inp).length === 0
        assert.equal(
          chronic,
          reflectionsSilent && chronic,
          `desync at ${species}/${episodes}ep/${sinceLast}d: ⑦=${chronic} ③silent=${reflectionsSilent}`,
        )
        if (chronic) assert.ok(reflectionsSilent, `${species}/${episodes}ep/${sinceLast}d: ⑦ fired but ③ still spoke`)
        cells++
      }
    }
  }
  assert.equal(cells, 150, 'the sweep must actually cover every cell')
})
