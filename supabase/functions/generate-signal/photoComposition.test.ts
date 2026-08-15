// L3 photo-record composition (Signals v2 / B-755 / CUL-9, §2 L3) — offline-tested.
//
// Adversarial focus, the clinical-guardrails bar for this PR:
//   • PRESENT-ONLY (G4): a marker never seen is SILENCE, never "0 of N" — most pointedly hair.
//   • TRISTATE (§2 L3): only a `yes` read enters a numerator; `unsure`/illegible/absent are out of
//     the numerator AND the denominator; a legible `no` is in the denominator only.
//   • RETAINED FOOD is a LONG-band join: food in a long episode counts; food elsewhere does not; a
//     finding with no long band (⑤ / ⑥) never carries retainedFood.
//   • The decoration is strictly additive: it decorates only the vomit timing findings, never a
//     correlation / safety / reflection finding, and a null leaves the finding byte-identical.

import { strict as assert } from 'node:assert'
import {
  computePhotoComposition,
  type PhotoAnalysisInput,
} from './photoComposition.ts'
import { decorateFinding } from './medContext.ts'
import type {
  Finding,
  PhotoComposition,
  PostprandialTimingFinding,
  EmptyStomachTimingFinding,
  TimingStoryFinding,
  TimeOfDayClusteringFinding,
  CorrelationFinding,
  ReflectionFinding,
  IncidentRedFlagFinding,
} from './detection.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_MS = Date.parse('2026-05-30T12:00:00.000Z')
const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
/** ms of an instant `daysAgo` before NOW. */
const msAgo = (daysAgo: number): number => NOW_MS - daysAgo * MS_PER_DAY

/** A completed VOMIT read at `daysAgo`, everything else empty unless overridden. */
const read = (daysAgo: number, over: Partial<PhotoAnalysisInput> = {}): PhotoAnalysisInput => ({
  occurredMs: msAgo(daysAgo),
  status: 'completed',
  incidentType: 'vomit',
  contents: null,
  bilePresent: null,
  ...over,
})

const postprandial = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 4,
  eligibleCount: 12,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 18,
  feedingFormsInEvidence: [],
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

const emptyStomach = (over: Partial<EmptyStomachTimingFinding> = {}): EmptyStomachTimingFinding => ({
  type: 'empty_stomach_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  longCount: 4,
  eligibleCount: 8,
  bandCounts: { rapid: 1, mid: 3, long: 4 },
  totalEpisodes: 10,
  longGapHours: 6,
  lastTwoEligibleLong: true,
  medianHoursSinceFeeding: 9,
  feedingFormsInEvidence: [],
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

const timingStory = (over: Partial<TimingStoryFinding> = {}): TimingStoryFinding => ({
  type: 'timing_story',
  priorityClass: 'insight',
  symptomType: 'vomit',
  bandCounts: { rapid: 2, mid: 2, long: 4 },
  eligibleCount: 8,
  totalEpisodes: 10,
  rapidWindowMinutes: 30,
  longGapHours: 6,
  windowDays: 60,
  rapid: { count: 2, medianMinutesSinceFeeding: 15, lastTwoEligible: false, feedingFormsInEvidence: [] },
  long: { count: 4, medianHoursSinceFeeding: 9, lastTwoEligible: true, feedingFormsInEvidence: [] },
  associationalOnly: true,
  ...over,
})

const timeofday = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 4,
  clusterWindowHours: 4,
  clusterCount: 5,
  eligibleCount: 8,
  totalEpisodes: 8,
  timezone: 'America/New_York',
  associationalOnly: true,
  windowDays: 60,
  ...over,
})

const correlation: CorrelationFinding = {
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  proteins: ['chicken'],
  jointCandidate: false,
  jointGuidance: null,
  matchedPairs: 4,
  caseExposed: 4,
  controlExposed: 1,
  discordantCaseOnly: 3,
  discordantControlOnly: 0,
  riskDifference: 0.75,
  pValue: 0.06,
  correctedAlpha: 0.01,
  symptomEventCount: 4,
  correlationWindowHours: 12,
  attributionFloor: 'high',
  associationalOnly: true,
}

const redFlag: IncidentRedFlagFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: new Date(msAgo(2)).toISOString(),
  flaggedIncidentCount: 1,
  windowDays: 30,
}

/** Assert the numerator ⊆ denominator invariant + present-only (both ≥1) on every emitted field. */
function assertFieldInvariants(pc: PhotoComposition | null): void {
  if (!pc) return
  for (const key of ['retainedFood', 'hair', 'bile'] as const) {
    const f = pc[key]
    if (f === undefined) continue
    assert.ok(f.count >= 1, `${key}.count is present-only (≥1)`)
    assert.ok(f.denominator >= f.count, `${key}: denominator ≥ count (numerator ⊆ denominator)`)
  }
}

// ── Present-only / G4 — hair never reassures ────────────────────────────────────

Deno.test('L3 present-only — reads that answer "no" to everything produce NO composition (never "0 of N")', () => {
  // Completed vomit reads that legibly show NO hair, NO bile, NO food: every denominator is non-zero,
  // every numerator is zero → present-only → the whole payload is null (silence, never a 0-of-N line).
  const analyses = [
    read(5, { contents: ['foam', 'liquid_only'], bilePresent: 'no' }),
    read(7, { contents: ['foam'], bilePresent: 'no' }),
  ]
  const pc = computePhotoComposition(emptyStomach(), analyses, NOW_MS)
  assert.equal(pc, null, 'all-absent markers → null, not a set of zero-count fields')
})

Deno.test('L3 present-only — hair is emitted ONLY when seen; a clean record shows no hair field', () => {
  // No hair anywhere. Even though every read is legible (so the hair question is "answered no"), the
  // field is present-only: absent, never { count: 0, denominator: N } — G4, hair never reassures.
  const pc = computePhotoComposition(
    timeofday(),
    [read(3, { contents: ['bile'], bilePresent: 'yes' }), read(6, { contents: ['foam'] })],
    NOW_MS,
  )
  assert.ok(pc, 'bile is present, so a payload exists')
  assert.equal(pc!.hair, undefined, 'no hair seen → no hair field (not a reassuring zero)')
})

// ── Tristate discipline ─────────────────────────────────────────────────────────

Deno.test('L3 tristate — hair: yes numerator; legible-no denominator; unsure + illegible excluded from both', () => {
  const analyses = [
    read(3, { contents: ['hair'] }), //            yes  → numerator + denominator
    read(6, { contents: ['bile', 'foam'] }), //    no   → denominator only (legible, no unsure)
    read(9, { contents: ['unsure'] }), //          unsure → neither
    read(12, { contents: null }), //               illegible (null) → neither
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.ok(pc)
  assert.deepEqual(pc!.hair, { count: 1, denominator: 2 }, 'hair seen in 1 of the 2 reads that answered')
  assertFieldInvariants(pc)
})

Deno.test('L3 tristate — bile keys on the AUTHORITATIVE bile_present; contents-bile is a present-wins yes', () => {
  const analyses = [
    read(2, { bilePresent: 'yes' }), //                          yes  → num + denom
    read(4, { bilePresent: 'no' }), //                           no   → denom only
    read(6, { bilePresent: 'unsure' }), //                       unsure → neither
    read(8, { bilePresent: null, contents: ['undigested_food'] }), // bile field abstained (null) + legible non-bile
    //                                                              → NOT a bile answer (authoritative-field design) → neither
    read(10, { bilePresent: null, contents: ['bile'] }), //      contents-bile → present-wins yes → num + denom
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.ok(pc)
  assert.deepEqual(pc!.bile, { count: 2, denominator: 3 }, 'bile in 2 (yes + contents-bile) of 3 answered')
  assertFieldInvariants(pc)
})

// ── Retained food — the long-band join ──────────────────────────────────────────

Deno.test('L3 retained food — counts food ONLY in the finding\'s long-band episodes', () => {
  const longMs = [msAgo(5), msAgo(6)]
  const analyses = [
    read(5, { contents: ['partially_digested_food'] }), // LONG (onset ∈ longMs), food → numerator
    read(6, { contents: ['bile'] }), //                    LONG (onset ∈ longMs), no food, legible → denominator only
    read(7, { contents: ['undigested_food'] }), //         NOT long (ago 7 ∉ longMs) — food here must NOT count
  ]
  const pc = computePhotoComposition(emptyStomach({ longEpisodeOnsets: longMs }), analyses, NOW_MS)
  assert.ok(pc)
  assert.deepEqual(pc!.retainedFood, { count: 1, denominator: 2 }, 'food in 1 of the 2 photographed long episodes')
  assertFieldInvariants(pc)
})

Deno.test('L3 retained food — a finding with NO long band (⑤ / ⑥) never carries retainedFood, even with food logged', () => {
  const analyses = [
    read(4, { contents: ['undigested_food'] }),
    read(8, { contents: ['partially_digested_food'] }),
  ]
  const pp = computePhotoComposition(postprandial(), analyses, NOW_MS) // ⑤: longOnsets = []
  assert.equal(pp?.retainedFood, undefined, '⑤ has no long band → no retainedFood')
  const tod = computePhotoComposition(timeofday(), analyses, NOW_MS) // ⑥: longOnsets = []
  assert.equal(tod?.retainedFood, undefined, '⑥ has no long band → no retainedFood')
})

Deno.test('L3 retained food — reads through timing_story.long.longEpisodeOnsets', () => {
  const longMs = [msAgo(5), msAgo(6)]
  const analyses = [
    read(5, { contents: ['undigested_food'] }),
    read(6, { contents: ['undigested_food'] }),
  ]
  const story = timingStory({
    long: { count: 4, medianHoursSinceFeeding: 9, lastTwoEligible: true, feedingFormsInEvidence: [], longEpisodeOnsets: longMs },
  })
  const pc = computePhotoComposition(story, analyses, NOW_MS)
  assert.ok(pc)
  assert.deepEqual(pc!.retainedFood, { count: 2, denominator: 2 }, 'both long episodes show food')
})

// ── Collapse present-wins ───────────────────────────────────────────────────────

Deno.test('L3 collapse — two reads of ONE bout (within 3h) count as one episode; a marker in EITHER counts', () => {
  const base = msAgo(4)
  const analyses = [
    { ...read(4), occurredMs: base, contents: ['hair'] }, // hair in the first read of the bout
    { ...read(4), occurredMs: base + 1 * MS_PER_HOUR, contents: ['bile'], bilePresent: 'yes' }, // bile in the second
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.ok(pc)
  assert.deepEqual(pc!.hair, { count: 1, denominator: 1 }, 'one collapsed episode; hair present-wins')
  assert.deepEqual(pc!.bile, { count: 1, denominator: 1 }, 'same episode; bile present-wins')
})

Deno.test('L3 collapse — a legible read does NOT drop a hair sighting from an illegible sibling (present-wins, safe direction)', () => {
  const base = msAgo(4)
  const analyses = [
    { ...read(4), occurredMs: base, contents: ['hair'] }, // hair seen
    { ...read(4), occurredMs: base + 30 * 60_000, contents: null }, // illegible sibling of the SAME bout
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.deepEqual(pc?.hair, { count: 1, denominator: 1 }, 'the illegible sibling never buries the hair sighting')
})

Deno.test('L3 collapse — two GENUINELY distinct bouts (>3h apart) count as two episodes', () => {
  const analyses = [
    read(4, { contents: ['hair'] }),
    read(5, { contents: ['foam'] }), // legible, no hair → answered no
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.deepEqual(pc?.hair, { count: 1, denominator: 2 }, 'two distinct episodes: hair in 1 of 2')
})

// ── Window + source filters ─────────────────────────────────────────────────────

Deno.test('L3 window — reads older than the finding\'s window (60d) are excluded from the denominator', () => {
  const analyses = [
    read(5, { contents: ['hair'] }), //  inside 60d
    read(70, { contents: ['hair'] }), // outside 60d — the 180d analyses pull reaches it; L3 must not
  ]
  const pc = computePhotoComposition(emptyStomach({ windowDays: 60 }), analyses, NOW_MS)
  assert.deepEqual(pc?.hair, { count: 1, denominator: 1 }, 'only the in-window read counts')
})

Deno.test('L3 source — only COMPLETED VOMIT reads enter; pending/failed/uncertain + stool are dropped', () => {
  const analyses = [
    read(3, { contents: ['hair'], status: 'pending' }), //  not completed
    read(4, { contents: ['hair'], status: 'failed' }), //   not completed
    read(5, { contents: ['hair'], status: 'uncertain' }), // not completed
    read(6, { contents: ['hair'], incidentType: 'stool_normal' }), // not vomit
    read(7, { contents: ['hair'], incidentType: 'diarrhea' }), //    not vomit
    read(8, { contents: ['hair'] }), //                     the one completed vomit
  ]
  const pc = computePhotoComposition(timeofday(), analyses, NOW_MS)
  assert.deepEqual(pc?.hair, { count: 1, denominator: 1 }, 'only the single completed vomit read counts')
})

Deno.test('L3 — no analyses (or none completed) → null (byte-identical to the pre-L3 / no-photo path)', () => {
  assert.equal(computePhotoComposition(emptyStomach(), [], NOW_MS), null)
  assert.equal(
    computePhotoComposition(emptyStomach(), [read(5, { status: 'pending' })], NOW_MS),
    null,
    'a lone pending read yields nothing',
  )
})

// ── Only timing findings are decorated ──────────────────────────────────────────

Deno.test('L3 target — non-timing findings (correlation / safety / reflection) carry no composition', () => {
  const analyses = [read(3, { contents: ['hair', 'bile'], bilePresent: 'yes' })]
  assert.equal(computePhotoComposition(correlation, analyses, NOW_MS), null, 'correlation → null')
  assert.equal(computePhotoComposition(redFlag, analyses, NOW_MS), null, 'safety red-flag → null')
  const reflection: ReflectionFinding = {
    type: 'reflection', priorityClass: 'insight', symptomType: 'vomit',
    currentCount: 2, priorCount: 5, direction: 'improving', windowDays: 7,
  }
  assert.equal(computePhotoComposition(reflection, analyses, NOW_MS), null, 'reflection → null')
})

Deno.test('L3 — a non-finite now is handled defensively (null, never a garbage window)', () => {
  assert.equal(computePhotoComposition(emptyStomach(), [read(3, { contents: ['hair'] })], NaN), null)
})

// ── decorateFinding wiring ──────────────────────────────────────────────────────

Deno.test('L3 decorateFinding — attaches photoComposition to a timing finding; null leaves it byte-identical', () => {
  const pc: PhotoComposition = { hair: { count: 1, denominator: 3 } }
  const decorated = decorateFinding(emptyStomach(), null, null, pc)
  assert.equal(decorated.type, 'empty_stomach_timing')
  assert.deepEqual((decorated as EmptyStomachTimingFinding).photoComposition, pc)

  const bare = decorateFinding(emptyStomach(), null, null, null)
  assert.equal('photoComposition' in bare, false, 'a null composition leaves NO field (byte-identical)')

  const defaulted = decorateFinding(emptyStomach(), null, null)
  assert.equal('photoComposition' in defaulted, false, 'the param defaults to null → no field')
})

Deno.test('L3 decorateFinding — the correlation card never receives photoComposition', () => {
  const pc: PhotoComposition = { hair: { count: 2, denominator: 4 } }
  const decorated = decorateFinding(correlation, null, null, pc)
  assert.equal('photoComposition' in decorated, false, 'photo contents are not a food↔symptom association')
})

Deno.test('L3 decorateFinding — all four vomit timing types accept the composition', () => {
  const pc: PhotoComposition = { bile: { count: 1, denominator: 2 } }
  const targets: Finding[] = [postprandial(), emptyStomach(), timingStory(), timeofday()]
  for (const t of targets) {
    const d = decorateFinding(t, null, null, pc) as { photoComposition?: PhotoComposition }
    assert.deepEqual(d.photoComposition, pc, `${t.type} carries photoComposition`)
  }
})

// ── End-to-end shape on a realistic empty-stomach card ──────────────────────────

Deno.test('L3 — realistic empty-stomach card: retained food (long band) + hair + bile together', () => {
  const longMs = [msAgo(3), msAgo(6)]
  const analyses = [
    read(3, { contents: ['partially_digested_food', 'hair'], bilePresent: 'no' }), // LONG: food + hair
    read(6, { contents: ['bile'], bilePresent: 'yes' }), //                           LONG: bile, no food (legible)
    read(9, { contents: ['foam'], bilePresent: 'no' }), //                            not long: legible clean read
  ]
  const pc = computePhotoComposition(emptyStomach({ longEpisodeOnsets: longMs, windowDays: 60 }), analyses, NOW_MS)
  assert.ok(pc)
  // retained food over the 2 long episodes; hair/bile over all 3 photographed episodes.
  assert.deepEqual(pc!.retainedFood, { count: 1, denominator: 2 }, 'food in 1 of 2 long episodes')
  assert.deepEqual(pc!.hair, { count: 1, denominator: 3 }, 'hair in 1 of 3 photographed episodes')
  assert.deepEqual(pc!.bile, { count: 1, denominator: 3 }, 'bile in 1 of 3 photographed episodes')
  assertFieldInvariants(pc)
})
