// B-071 — the soft-delete input contract, tested against a "more-deleted-than-live" pet.
//
// Run with:  deno test --allow-read supabase/functions/generate-signal/detectionSoftDelete.test.ts
//
// WHY THIS EXISTS. `detection.ts` is a pure module with NO notion of deletion —
// `SymptomEvent` has no `deleted_at` field, deliberately. Excluding soft-deleted
// rows is a CONTRACT the caller owns (`DetectionInput.symptomEvents`: "the caller
// MUST exclude soft-deleted rows"), upheld by five `.is('deleted_at', null)`
// clauses in the Edge Function's query — and, until this file, by nothing else.
// One dropped clause is a one-line diff that no type-check and no existing test
// would catch.
//
// The stakes are not hypothetical, and they are not a tidiness concern. On the
// real dogfood pet the live log is the MINORITY of what was ever logged: 43
// deleted vomits against 21 live, with the diarrhea and lethargy co-signs deleted
// outright. The 2026-06-25 vet-council deep-dive (Finding 4) reframed this from a
// contract test to a clinically load-bearing one: the surviving log is an
// owner-curated subset biased toward UNDER-calling, so the deleted rows are not
// noise the engine could harmlessly average over — they are a different pet.
//
// This file guards the contract from both ends:
//
//   1. STATICALLY, over index.ts — every query feeding the engine carries its
//      soft-delete filter. That is the mechanism, and it is what actually breaks.
//   2. DIFFERENTIALLY, over detectSignals — the same fixture is run twice, once
//      correctly filtered and once not, and the unfiltered run is asserted to do
//      SPECIFIC, NAMED harm. The second half is the point: it converts "the
//      filter is there" into "here is exactly what the owner sees when it isn't",
//      so the guard fails loudly rather than drifting into decoration.
//
// The unfiltered run is NOT a bug report against detection.ts. The engine is
// behaving correctly on the input it was handed. It is a measurement of the
// blast radius of the caller's contract, which is why it is asserted here rather
// than fixed there.

import { strict as assert } from 'node:assert'
import {
  detectSignals,
  type DetectionInput,
  type IncidentAnalysisInput,
  type MealEvent,
  type PetContext,
  type RankedFinding,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'

// ── The soft-delete-aware fixture layer ───────────────────────────────────────
//
// `deletedAt` lives HERE, in the fixture, never in detection's own types — that
// asymmetry is the contract this file exists to protect. `activeOnly` is the
// test's stand-in for the Edge Function's `.is('deleted_at', null)`.

type Deletable<T> = T & { deletedAt: string | null }

const activeOnly = <T>(rows: Deletable<T>[]): Deletable<T>[] => rows.filter((r) => r.deletedAt === null)

const stripSymptom = ({ id, type, occurredAt }: Deletable<SymptomEvent>): SymptomEvent => ({ id, type, occurredAt })

const stripAnalysis = (a: Deletable<IncidentAnalysisInput>): IncidentAnalysisInput => ({
  eventId: a.eventId,
  incidentType: a.incidentType,
  occurredAt: a.occurredAt,
  bloodPresent: a.bloodPresent,
  stoolBloodPresent: a.stoolBloodPresent,
  foreignMaterialPresent: a.foreignMaterialPresent,
})

const pet: PetContext = { name: 'Pixel', species: 'cat', dietTrialActive: false }
const NOW = '2026-05-30T12:00:00.000Z'
const DELETED_AT = '2026-05-29T00:00:00.000Z'

const iso = (day: number, hour = 9): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`

let idSeq = 0
/** Ids are prefixed live-/del- so a single string scan can prove no deleted row reached a finding. */
const sym = (
  type: SymptomType,
  day: number,
  hour: number,
  deletedAt: string | null,
): Deletable<SymptomEvent> => ({
  id: `${deletedAt === null ? 'live' : 'del'}-${type}-${++idSeq}`,
  type,
  occurredAt: iso(day, hour),
  deletedAt,
})

/**
 * The dogfood pet, to shape: MOST of what was ever logged has been soft-deleted.
 *  • vomit    — 21 live, 43 deleted (the real 2026-06 ratio)
 *  • diarrhea — 0 live, 10 deleted  (the co-sign, deleted outright)
 *  • itch     — 0 live, 8 deleted
 */
function buildSymptomLog(): Deletable<SymptomEvent>[] {
  const rows: Deletable<SymptomEvent>[] = []
  // 21 LIVE vomits: 8 in the current week (24th–30th), 13 across the two before.
  for (const [day, hour] of [[24, 9], [25, 9], [26, 9], [27, 9], [28, 9], [28, 14], [29, 9], [30, 8]] as const) {
    rows.push(sym('vomit', day, hour, null))
  }
  for (let d = 10; d <= 22; d++) rows.push(sym('vomit', d, 10, null))

  // 43 DELETED vomits — mis-logs, duplicates, and re-logs the owner cleaned up.
  for (let d = 2; d <= 23; d++) rows.push(sym('vomit', d, 15, DELETED_AT))
  for (let d = 2; d <= 22; d++) rows.push(sym('vomit', d, 18, DELETED_AT))

  // Two symptom families with ZERO surviving rows. Nothing the engine says about
  // either of these can be true of this pet's record.
  for (const d of [18, 20, 22, 24, 25, 26, 27, 28, 29, 30]) rows.push(sym('diarrhea', d, 11, DELETED_AT))
  for (let d = 20; d <= 27; d++) rows.push(sym('itch', d, 13, DELETED_AT))
  return rows
}

const SYMPTOM_LOG = buildSymptomLog()
const LIVE_SYMPTOMS = activeOnly(SYMPTOM_LOG)

/** A steady twice-daily staple — present in both runs, so it can never explain a difference. */
const MEALS: MealEvent[] = Array.from({ length: 30 }, (_, i) => i + 1).flatMap((d) =>
  [8, 17].map((hour) => ({
    id: `meal-${d}-${hour}`,
    occurredAt: iso(d, hour),
    foodItemId: 'food-1',
    primaryProtein: 'chicken',
    intakeRating: 'all' as const,
    foodType: 'meal' as const,
    foodLabel: 'Kibble',
  })),
)

/**
 * Per-incident AI reads (B-340). The ONLY incident carrying blood is attached to a
 * DELETED vomit — the owner logged it, the photo read flagged it, then the owner
 * removed the event. The live incident is clean.
 */
const INCIDENT_ANALYSES: Deletable<IncidentAnalysisInput>[] = [
  {
    eventId: 'live-vomit-8', // the 30th, 08:00 — the most recent surviving vomit
    incidentType: 'vomit',
    occurredAt: iso(30, 8),
    bloodPresent: 'none_visible',
    stoolBloodPresent: null,
    foreignMaterialPresent: 'no',
    deletedAt: null,
  },
  {
    eventId: 'del-vomit-43', // the deleted vomit of the 23rd, 15:00 (see buildSymptomLog)
    incidentType: 'vomit',
    occurredAt: iso(23, 15),
    bloodPresent: 'fresh_red',
    stoolBloodPresent: null,
    foreignMaterialPresent: 'no',
    deletedAt: DELETED_AT,
  },
]

const baseInput = (
  symptoms: Deletable<SymptomEvent>[],
  analyses: Deletable<IncidentAnalysisInput>[],
): DetectionInput => ({
  pet,
  symptomEvents: symptoms.map(stripSymptom),
  mealEvents: MEALS,
  incidentAnalyses: analyses.map(stripAnalysis),
  now: NOW,
})

/** What the Edge Function is contracted to pass. */
const CONTRACT_HONOURED = detectSignals(baseInput(LIVE_SYMPTOMS, activeOnly(INCIDENT_ANALYSES)))
/** What it would pass if ONE `.is('deleted_at', null)` were dropped. */
const CONTRACT_BROKEN = detectSignals(baseInput(SYMPTOM_LOG, INCIDENT_ANALYSES))

const typesIn = (ranked: RankedFinding[]) => ranked.map((r) => r.finding.type)
const symptomTypesIn = (ranked: RankedFinding[]) =>
  ranked.map((r) => (r.finding as { symptomType?: string }).symptomType).filter(Boolean)

// ── 1. The fixture really is more-deleted-than-live ───────────────────────────

Deno.test('fixture — the surviving log is the MINORITY of what was logged', () => {
  const live = LIVE_SYMPTOMS.length
  const deleted = SYMPTOM_LOG.length - live
  assert.equal(live, 21, 'live symptom rows')
  assert.equal(deleted, 61, 'soft-deleted symptom rows')
  assert.ok(deleted > live, 'the whole point of the fixture: more deleted than live')

  const liveVomits = LIVE_SYMPTOMS.filter((r) => r.type === 'vomit').length
  const deletedVomits = SYMPTOM_LOG.filter((r) => r.type === 'vomit' && r.deletedAt !== null).length
  assert.equal(liveVomits, 21)
  assert.equal(deletedVomits, 43) // the real 2026-06 dogfood ratio

  // Two families where every single row is deleted. Nothing the engine says about
  // these can be true — which is what makes them the sharpest probe.
  for (const t of ['diarrhea', 'itch'] as const) {
    assert.equal(LIVE_SYMPTOMS.filter((r) => r.type === t).length, 0, `${t} must have zero live rows`)
    assert.ok(SYMPTOM_LOG.some((r) => r.type === t), `${t} must have deleted rows`)
  }
})

// ── 2. The contract honoured: no deleted row reaches any detector ─────────────

Deno.test('contract honoured — findings describe ONLY the surviving record', () => {
  // Exactly one thing is true of this pet's live log: vomiting rose week over week.
  assert.deepEqual(typesIn(CONTRACT_HONOURED), ['symptom_worsening'])

  const f = CONTRACT_HONOURED[0].finding as { symptomType: string; currentCount: number; priorCount: number }
  assert.equal(f.symptomType, 'vomit')
  // 8 live episodes this week against 6 the week before — countable by hand off the
  // fixture above, and bounded by the 21 live rows.
  assert.equal(f.currentCount, 8)
  assert.equal(f.priorCount, 6)
  assert.ok(
    f.currentCount + f.priorCount <= LIVE_SYMPTOMS.length,
    'no finding may count more episodes than the pet actually has live',
  )
})

Deno.test('contract honoured — no finding names a symptom whose every row was deleted', () => {
  for (const phantom of ['diarrhea', 'itch']) {
    assert.ok(
      !symptomTypesIn(CONTRACT_HONOURED).includes(phantom),
      `engine spoke about ${phantom}, which this pet has zero live rows of`,
    )
  }
})

Deno.test('contract honoured — a red flag on a DELETED incident never fires', () => {
  // The only blood read in the record belongs to an event the owner removed.
  // Surfacing it would put a safety card on Home about an incident that, as far as
  // the owner's record is concerned, does not exist.
  assert.ok(!typesIn(CONTRACT_HONOURED).includes('incident_red_flag'))
})

Deno.test('contract honoured — no deleted row id appears anywhere in the output', () => {
  // A broad net over the whole serialized result, not just the fields we happen to
  // assert on above: it keeps holding as findings grow new evidence fields.
  const serialized = JSON.stringify(CONTRACT_HONOURED)
  assert.ok(!serialized.includes('del-'), `deleted row id leaked into a finding: ${serialized}`)
})

// ── 3. The contract broken: the specific, named harm ──────────────────────────
//
// These assertions pin the COST of a dropped filter. If a future change makes the
// engine robust to unfiltered input, these fail — and that is the correct signal
// to come back here and re-derive the guarantee, not to delete the file.

Deno.test('contract broken — a phantom safety card about an entirely-deleted symptom', () => {
  const phantoms = symptomTypesIn(CONTRACT_BROKEN).filter((t) =>
    LIVE_SYMPTOMS.every((r) => r.type !== t),
  )
  assert.deepEqual(phantoms, ['diarrhea'])
  // And it is safety-class — it LEADS Home (Principle 3), about a symptom the pet
  // has no surviving record of at all.
  const phantom = CONTRACT_BROKEN.find((r) => (r.finding as { symptomType?: string }).symptomType === 'diarrhea')!
  assert.equal(phantom.finding.priorityClass, 'safety')
})

Deno.test('contract broken — episode counts inflate to the deleted total (21 → 43)', () => {
  const chronicity = CONTRACT_BROKEN.find((r) => r.finding.type === 'symptom_chronicity')
  assert.ok(chronicity, 'unfiltered input manufactures a chronicity finding')
  const { episodeCount, symptomDays } = chronicity.finding as { episodeCount: number; symptomDays: number }
  // 43 is the DELETED count. The pet's live record holds 21.
  assert.equal(episodeCount, 43)
  assert.ok(
    episodeCount > LIVE_SYMPTOMS.length,
    'the count exceeds every live row the pet has — it is reporting deleted data',
  )
  assert.ok(symptomDays > 21)
})

Deno.test('contract broken — the CORRECT finding is lost, not merely joined', () => {
  // The subtlest harm, and the reason "it only over-counts" is the wrong mental
  // model: the manufactured chronicity finding SUPPRESSES same-symptom worsening
  // (§4.5 valve). So the true statement about the live record — vomiting rose this
  // week — disappears from Home, replaced by one built from deleted rows.
  const vomitFindings = CONTRACT_BROKEN.filter(
    (r) => (r.finding as { symptomType?: string }).symptomType === 'vomit',
  ).map((r) => r.finding.type)
  assert.ok(!vomitFindings.includes('symptom_worsening'))
  assert.deepEqual(typesIn(CONTRACT_HONOURED), ['symptom_worsening'])
})

Deno.test('contract broken — a blood red flag fires from a deleted incident', () => {
  const flag = CONTRACT_BROKEN.find((r) => r.finding.type === 'incident_red_flag')
  assert.ok(flag, 'unfiltered analyses surface the deleted incident')
  const { flags, mostRecentFlaggedIso } = flag.finding as { flags: string[]; mostRecentFlaggedIso: string }
  assert.deepEqual(flags, ['blood'])
  // Anchored on the DELETED incident's timestamp — the copy would name a date the
  // owner can no longer find anywhere in their own timeline.
  assert.equal(mostRecentFlaggedIso, iso(23, 15))
})

Deno.test('contract broken — the two runs disagree on everything that matters', () => {
  // The summary assertion: same pet, same meals, same clock. The ONLY difference is
  // the filter, and it changes how many cards fire, which detectors speak, and what
  // they say. That is the measure of how load-bearing this one clause is.
  assert.equal(CONTRACT_HONOURED.length, 1)
  assert.equal(CONTRACT_BROKEN.length, 3)
  assert.notDeepEqual(typesIn(CONTRACT_HONOURED), typesIn(CONTRACT_BROKEN))
  assert.ok(
    CONTRACT_BROKEN.every((r) => r.finding.priorityClass === 'safety'),
    'every manufactured card is safety-class — they all lead Home',
  )
})

// ── 4. The mechanism: the Edge Function's queries actually carry the filter ────

Deno.test('index.ts — every query feeding the engine excludes soft-deleted rows', async () => {
  // The static half. The differential tests above measure what a dropped filter
  // COSTS; this one is what notices it was dropped. detection.ts cannot check this
  // for itself — by design it never sees a `deleted_at` — so it is checked here,
  // next to the evidence of why it matters.
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))

  // Tables whose rows are soft-deleted and which feed a detector. `medications` is
  // deliberately absent: a regimen ENDS (status/ended_at), it is not soft-deleted —
  // see the comment on that query in index.ts.
  const GUARDED_TABLES = ['events', 'event_ai_analysis', 'feeding_arrangements']

  const chains = [...src.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)]
    .filter((m) => GUARDED_TABLES.includes(m[1]))
    .map((m) => {
      // The chain runs from `.from(...)` to the start of the next query in the
      // Promise.all array (or the end of file for the last one).
      const start = m.index!
      const next = src.indexOf('supabase', start + 1)
      return { table: m[1], text: src.slice(start, next < 0 ? src.length : next) }
    })

  // Floor, so a refactor that stops matching can't make this pass vacuously.
  assert.ok(chains.length >= 5, `expected ≥5 guarded queries, found ${chains.length}`)

  for (const { table, text } of chains) {
    const guarded = /\.is\(\s*'(?:[a-z_]+\.)?deleted_at'\s*,\s*null\s*\)/.test(text)
    assert.ok(guarded, `the '${table}' query feeding detection has no .is('deleted_at', null) filter`)
  }
})

Deno.test('detection.ts — still has no notion of deletion (the contract is the caller\'s)', () => {
  // If a `deletedAt` ever appears on detection's own input types, the division of
  // responsibility this file guards has changed, and the tests above are describing
  // a contract that no longer exists. Fail here rather than silently pass.
  const sample: SymptomEvent = LIVE_SYMPTOMS.map(stripSymptom)[0]
  assert.deepEqual(Object.keys(sample).sort(), ['id', 'occurredAt', 'type'])
})
