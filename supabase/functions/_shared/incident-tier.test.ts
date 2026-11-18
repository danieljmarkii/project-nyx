// EN-3's server half (CUL-1133; Engines v3 PR-26): the pure pieces of the tier's dual-write
// and the tier-aware hold. The pipeline wiring is pinned end to end in
// incident-analysis.pipeline.test.ts. Run with: deno test supabase/functions/_shared/

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { effectiveTierRank, TIER_RANK } from '../../../lib/incidentTier.ts'
import {
  type AnalysisReadFields,
  buildFailureWrite,
  buildRescueRead,
  holdsOver,
  type IncidentCopy,
  keepLouderTier,
  raiseOnlyValues,
  rescueOverStoredCall,
  isRealAnalysis,
  mergeAfterRead,
  type RescueRead,
  rescueRank,
  resolveReanalysisWrite,
  type StoredAnalysis,
  tieredReadFields,
  tierReasonOf,
  withRescueTier,
} from './incident-analysis.ts'

const COPY: IncidentCopy = {
  contextual: (p, f) => `CONTEXTUAL:${p}:${f.join(',')}`,
  photoUnreadable: (p) => `UNREADABLE:${p}`,
  monitor: (p) => `MONITOR:${p}`,
  visualFlagFallback: (p, f) => `VISUAL:${p}:${f.join(',')}`,
  noFlag: (p, h) => `NO_FLAG:${p}:${h}`,
}

const FIELDS: AnalysisReadFields = {
  recommendation: 'monitor', read_text: 'r', visual_flags: [], contextual_flags: [], status: 'completed', error: null,
}

const stored = (o: Partial<StoredAnalysis> = {}): StoredAnalysis => ({
  recommendation: 'worth_a_call', tier: null, status: 'completed', edited: false, presentFlags: [], hidden: false, errored: false, mayWait: null, ...o,
})

// ── tieredReadFields: the map, and nothing flag-off ─────────────────────────────────

Deno.test('EN-3 — flag-on read fields carry the mapped tier; flag-off carry no tier key at all', () => {
  assertStrictEquals(tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, true).tier, 'call_today')
  assertStrictEquals(tieredReadFields({ ...FIELDS, recommendation: 'monitor' }, true).tier, 'logged')
  assertStrictEquals(tieredReadFields({ ...FIELDS, recommendation: 'not_enough_to_say' }, true).tier, 'not_enough_to_say')
  // Absent, not undefined-valued: a flag-off write must not even name the column.
  assertStrictEquals('tier' in tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, false), false)
  assertEquals(tieredReadFields(FIELDS, false), FIELDS)
})

Deno.test('EN-3 — nothing in this PR writes call_now: every verdict maps at or below call today', () => {
  for (const recommendation of ['worth_a_call', 'monitor', 'not_enough_to_say'] as const) {
    assertStrictEquals(tieredReadFields({ ...FIELDS, recommendation }, true).tier === 'call_now', false)
  }
})

// ── tierReasonOf: the model's own escalation is told apart (GAP-31, T19) ──────────────

Deno.test('EN-3 GAP-31 — a call with no contextual and no visual flag is the model\'s own, at call today', () => {
  const modelOnly = tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, true)
  assertStrictEquals(modelOnly.tier, 'call_today')
  assertStrictEquals(tierReasonOf({ ...modelOnly, tier: modelOnly.tier! }), 'model_only')
  assertStrictEquals(tierReasonOf({ tier: 'call_today', contextual_flags: ['x'], visual_flags: ['blood'] }), 'contextual')
  assertStrictEquals(tierReasonOf({ tier: 'call_today', contextual_flags: [], visual_flags: ['blood'] }), 'visual')
  assertStrictEquals(tierReasonOf({ tier: 'logged', contextual_flags: [], visual_flags: [] }), 'logged')
  assertStrictEquals(tierReasonOf({ tier: 'not_enough_to_say', contextual_flags: [], visual_flags: [] }), 'not_enough_to_say')
})

// ── holdsOver: never lower, in ranks ──────────────────────────────────────────────────

Deno.test('EN-3 never-lower — with no tier on the stored row, the hold is exactly today\'s rule', () => {
  // Every stored verdict × every next verdict, untiered: holdsOver === today's test.
  const verdicts = ['worth_a_call', 'monitor', 'not_enough_to_say', 'call_now', null] as const
  const quiet = (v: string | null) => v === 'monitor' || v === 'not_enough_to_say'
  for (const s of verdicts) {
    for (const n of ['worth_a_call', 'monitor', 'not_enough_to_say'] as const) {
      const today = s !== null && !quiet(s) && quiet(n)
      assertStrictEquals(holdsOver({ recommendation: s, tier: null }, { recommendation: n }), today, `${s} → ${n}`)
    }
  }
})

Deno.test('EN-3 never-lower — a call over a louder stored call writes, and keeps the louder tier (the PR-04b note, F3)', () => {
  const callToday = tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, true)
  // An escalation over an escalation is never held: its findings must land.
  assertStrictEquals(holdsOver({ recommendation: 'worth_a_call', tier: 'call_now' }, callToday), false)
  assertStrictEquals(keepLouderTier({ tier: 'call_now' }, callToday).tier, 'call_now')
  assertStrictEquals(keepLouderTier({ tier: 'call_today' }, callToday).tier, 'call_today')
  // Equal or louder: this run's tier.
  assertStrictEquals(keepLouderTier({ tier: null }, callToday).tier, 'call_today')
  // A verdict alone never mints a tier; an unknown tier value is not copied forward.
  assertStrictEquals(keepLouderTier({ tier: 'something_new' }, callToday).tier, 'call_today')
  // Flag-off writes carry no tier and are untouched.
  assertEquals(keepLouderTier({ tier: 'call_now' }, FIELDS), FIELDS)
})

Deno.test('EN-3 never-lower — only the calls bind: logged ↔ not_enough_to_say is free both ways', () => {
  const nets = tieredReadFields({ ...FIELDS, recommendation: 'not_enough_to_say' }, true)
  const logged = tieredReadFields({ ...FIELDS, recommendation: 'monitor' }, true)
  assertStrictEquals(holdsOver({ recommendation: 'monitor', tier: 'logged' }, nets), false)
  assertStrictEquals(keepLouderTier({ tier: 'logged' }, nets).tier, 'not_enough_to_say')
  assertStrictEquals(holdsOver({ recommendation: 'not_enough_to_say', tier: 'not_enough_to_say' }, logged), false)
})

Deno.test('EN-3 never-lower — a stored call tier beside a lowered verdict still holds, flag on or off', () => {
  // A client can lower `recommendation` (CUL-1321 M1); `tier` is frozen to clients (079).
  const lowered = { recommendation: 'monitor', tier: 'call_today' }
  assertStrictEquals(holdsOver(lowered, { recommendation: 'monitor' }), true)
  assertStrictEquals(holdsOver(lowered, { recommendation: 'not_enough_to_say' }), true)
})

Deno.test('EN-3 never-lower — resolveReanalysisWrite writes a call today over a stored call now, at call now', () => {
  const w = resolveReanalysisWrite({
    stored: stored({ tier: 'call_now' }), eventId: 'e', petId: 'p', incidentType: 'vomit', readComplete: true, holdLowersMayWaitTo: null, structuredValues: { blood_col: 'yes' },
    nextPresentFlags: ['blood'], readFields: tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, true),
  }) as { mode: string; values: Record<string, unknown> }
  assertStrictEquals(w.mode, 'upsert')
  assertStrictEquals(w.values.tier, 'call_now')
  assertStrictEquals(w.values.blood_col, 'yes') // the new finding lands
  // Flag-off: the column is left alone (the stored call now stays on the row).
  const off = resolveReanalysisWrite({
    stored: stored({ tier: 'call_now' }), eventId: 'e', petId: 'p', incidentType: 'vomit', readComplete: true, holdLowersMayWaitTo: null, structuredValues: {},
    nextPresentFlags: [], readFields: { ...FIELDS, recommendation: 'worth_a_call' },
  }) as { mode: string; values: Record<string, unknown> }
  assertStrictEquals(off.mode, 'upsert')
  assertStrictEquals('tier' in off.values, false)
})

// ── The failure path ───────────────────────────────────────────────────────────────────

Deno.test('EN-3 — the rescue carries a tier only under the key, from the same map', () => {
  const rescue = buildRescueRead(COPY, { computed: null, contextualFlags: ['ctx'], petName: 'Mochi', hasPhoto: true })
  assertStrictEquals(withRescueTier(rescue, true)?.tier, 'call_today')
  assertStrictEquals(withRescueTier(rescue, false), rescue)
  assertStrictEquals(withRescueTier(null, true), null)
  const on = buildFailureWrite({
    existing: null, existingReadFailed: false, floorOnly: false, tiersOn: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'x',
    rescue: withRescueTier(rescue, true), stamps: null,
  })
  assertStrictEquals(on.mode, 'rescue')
  assertStrictEquals((on as { values: Record<string, unknown> }).values.tier, 'call_today')
  const off = buildFailureWrite({
    existing: null, existingReadFailed: false, floorOnly: false, tiersOn: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'x',
    rescue, stamps: null,
  })
  assertStrictEquals('tier' in (off as { values: Record<string, unknown> }).values, false)
})

Deno.test('EN-3 — a stored call tier survives a failed run even beside a lowered verdict', () => {
  const w = buildFailureWrite({
    existing: { recommendation: 'monitor', tier: 'call_today', presentFlags: [] },
    existingReadFailed: false, floorOnly: false, tiersOn: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom', rescue: null, stamps: null,
  })
  assertEquals(w, { mode: 'error-only', values: { error: 'boom' } })
  // Untiered, today's rule exactly: a calm stored row falls to the retry frame.
  const untiered = buildFailureWrite({
    existing: { recommendation: 'monitor', tier: null, presentFlags: [] },
    existingReadFailed: false, floorOnly: false, tiersOn: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom', rescue: null, stamps: null,
  })
  assertStrictEquals(untiered.mode, 'upsert')
})

// CUL-2811. THE RULE, over every pair: a failed run's rescue is written exactly when it is
// STRICTLY LOUDER than what the row says; an equal or quieter one keeps the error note over a
// stored call, and over a quiet row any rescue lands, as before. The expectation is read off
// the shared ranks, and the six pairs the issue is about are also spelled out by hand below,
// so the table cannot be green by agreeing with a wrong rank.
// `says` is the rank each row holds, written out by hand rather than asked of the code.
const STORED_STATES: Array<{ name: string; says: number; row: { recommendation: string | null; tier?: string | null; presentFlags: string[] } | null }> = [
  { name: 'no row', says: 0, row: null },
  { name: 'no verdict', says: 0, row: { recommendation: null, tier: null, presentFlags: [] } },
  { name: 'monitor', says: 0, row: { recommendation: 'monitor', tier: null, presentFlags: [] } },
  { name: 'monitor/logged', says: 0, row: { recommendation: 'monitor', tier: 'logged', presentFlags: [] } },
  { name: 'not_enough_to_say', says: 0, row: { recommendation: 'not_enough_to_say', tier: 'not_enough_to_say', presentFlags: [] } },
  { name: 'monitor over a stored red flag', says: 0, row: { recommendation: 'monitor', tier: 'logged', presentFlags: ['blood'] } },
  { name: 'worth_a_call, no tier', says: 1, row: { recommendation: 'worth_a_call', presentFlags: [] } },
  { name: 'call_today', says: 1, row: { recommendation: 'worth_a_call', tier: 'call_today', presentFlags: [] } },
  { name: 'call_today beside a lowered verdict', says: 1, row: { recommendation: 'monitor', tier: 'call_today', presentFlags: [] } },
  { name: 'call_now', says: 2, row: { recommendation: 'worth_a_call', tier: 'call_now', presentFlags: [] } },
  { name: 'call_now beside a lowered verdict', says: 2, row: { recommendation: 'monitor', tier: 'call_now', presentFlags: [] } },
  { name: 'an unknown verdict', says: 2, row: { recommendation: 'from_a_later_build', tier: null, presentFlags: [] } },
  { name: 'an unknown tier', says: 2, row: { recommendation: 'worth_a_call', tier: 'from_a_later_build', presentFlags: [] } },
]
const RESCUE_BASE = { recommendation: 'worth_a_call' as const, read_text: 'RESCUE', visual_flags: [], contextual_flags: ['ctx'] }
// `says` is the rank each run's call carries, written out here rather than asked of the code.
const FAILED_RUNS: Array<{ name: string; rescue: RescueRead | null; tiersOn: boolean; says: number }> = [
  { name: 'no rescue', rescue: null, tiersOn: true, says: TIER_RANK.quiet },
  { name: 'a flag-off rescue', rescue: RESCUE_BASE, tiersOn: false, says: TIER_RANK.call_today },
  { name: 'call_today', rescue: { ...RESCUE_BASE, tier: 'call_today' }, tiersOn: true, says: TIER_RANK.call_today },
  { name: 'call_now', rescue: { ...RESCUE_BASE, tier: 'call_now' }, tiersOn: true, says: TIER_RANK.call_now },
]
const failureWriteOver = (row: (typeof STORED_STATES)[number]['row'], run: (typeof FAILED_RUNS)[number]) =>
  buildFailureWrite({
    existing: row, existingReadFailed: false, floorOnly: false, tiersOn: run.tiersOn,
    eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom', rescue: run.rescue, stamps: null,
  })

Deno.test('CUL-2811 — every stored state by every failed run: a strictly louder rescue writes, an equal or quieter one keeps the note', () => {
  for (const stored of STORED_STATES) {
    const storedRank = stored.says
    if (stored.row) assertStrictEquals(effectiveTierRank(stored.row), stored.says, stored.name)
    for (const run of FAILED_RUNS) {
      const write = failureWriteOver(stored.row, run)
      const label = `${run.name} over ${stored.name}`
      const louder = !!run.rescue && run.says > storedRank
      if (run.rescue) assertStrictEquals(rescueRank(run.rescue), run.says, label)
      if (louder) {
        assertStrictEquals(write.mode, 'rescue', label)
        const values = (write as { values: Record<string, unknown> }).values
        assertStrictEquals(values.recommendation, 'worth_a_call', label)
        assertStrictEquals(values.tier, run.rescue?.tier, label)
        assertStrictEquals(values.read_text, 'RESCUE', label)
        assertStrictEquals(values.dismissed_at, null, label)
        // Over a quiet row the failed read is all the row has. Over a call the row's status
        // is left as it stands, and the error is noted beside it.
        assertStrictEquals(values.status, storedRank === TIER_RANK.quiet ? 'failed' : undefined, label)
        assertStrictEquals('status' in values, storedRank === TIER_RANK.quiet, label)
        assertStrictEquals(values.error, 'boom', label)
        // The written row is never quieter than the one it replaces.
        assertEquals(effectiveTierRank(values as { tier?: string; recommendation?: string }) > storedRank, true, label)
      } else if (storedRank !== TIER_RANK.quiet) {
        // A stored call, and nothing louder to say: the note, and the row keeps its words.
        assertStrictEquals(write.mode, 'error-only', label)
        assertEquals(Object.keys((write as { values: Record<string, unknown> }).values).filter((k) => k !== 'may_wait'), ['error'], label)
      } else {
        // A quiet row and no rescue: the retry frame, or the note over a stored red flag.
        assertStrictEquals(run.rescue, null, label)
        assertStrictEquals(write.mode, stored.row && stored.row.presentFlags.length > 0 ? 'error-only' : 'upsert', label)
      }
    }
  }
})

Deno.test('CUL-2811 — the pairs by hand: call now over call today writes; equal or quieter keeps the note', () => {
  const state = (name: string) => STORED_STATES.find((s) => s.name === name)!.row
  const run = (name: string) => FAILED_RUNS.find((r) => r.name === name)!
  // The defect: a stored call today, in either column, under a failed call now.
  for (const stored of ['call_today', 'call_today beside a lowered verdict', 'worth_a_call, no tier']) {
    const w = failureWriteOver(state(stored), run('call_now'))
    assertStrictEquals(w.mode, 'rescue', stored)
    assertStrictEquals((w as { values: Record<string, unknown> }).values.tier, 'call_now', stored)
  }
  // Equal: the stored words stand.
  assertStrictEquals(failureWriteOver(state('call_today'), run('call_today')).mode, 'error-only')
  assertStrictEquals(failureWriteOver(state('worth_a_call, no tier'), run('call_today')).mode, 'error-only')
  assertStrictEquals(failureWriteOver(state('call_now'), run('call_now')).mode, 'error-only')
  // Quieter: a stored call now is never replaced by a failed call today.
  assertStrictEquals(failureWriteOver(state('call_now'), run('call_today')).mode, 'error-only')
  assertStrictEquals(failureWriteOver(state('call_now beside a lowered verdict'), run('call_today')).mode, 'error-only')
  // A value this build does not know ranks as call now: nothing a failed run carries outranks it.
  assertStrictEquals(failureWriteOver(state('an unknown verdict'), run('call_now')).mode, 'error-only')
  assertStrictEquals(failureWriteOver(state('an unknown tier'), run('call_now')).mode, 'error-only')
  // The key off: no tier on the rescue, so it never outranks a stored call (flag-off is today).
  for (const stored of ['worth_a_call, no tier', 'call_today', 'call_now']) {
    assertStrictEquals(failureWriteOver(state(stored), run('a flag-off rescue')).mode, 'error-only', stored)
  }
})

Deno.test('CUL-2811 — a call now written over a stored call today never carries its leave to wait, and keeps a stored refusal', () => {
  const over = (mayWait: boolean | null) => (buildFailureWrite({
    existing: { recommendation: 'worth_a_call', tier: 'call_today', presentFlags: [], mayWait },
    existingReadFailed: false, floorOnly: false, tiersOn: true, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom',
    rescue: { ...RESCUE_BASE, tier: 'call_now' }, stamps: null,
  }) as { values: Record<string, unknown> }).values.may_wait
  assertStrictEquals(over(true), null)
  assertStrictEquals(over(null), null)
  assertStrictEquals(over(false), false)
})

Deno.test('CUL-2811 — a floor-only run that fails still writes its louder call, and still notes nothing over an equal one', () => {
  const floorOnly = (tier: 'call_today' | 'call_now') => buildFailureWrite({
    existing: { recommendation: 'worth_a_call', tier: 'call_today', presentFlags: [] },
    existingReadFailed: false, floorOnly: true, tiersOn: true, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom',
    rescue: { ...RESCUE_BASE, tier }, stamps: null,
  })
  const louder = floorOnly('call_now')
  assertStrictEquals(louder.mode, 'rescue')
  // It read no photo, so it says nothing about a read failing (CUL-1509): no status, no error.
  const values = (louder as { values: Record<string, unknown> }).values
  assertStrictEquals('status' in values, false)
  assertStrictEquals('error' in values, false)
  assertStrictEquals(values.tier, 'call_now')
  assertStrictEquals(floorOnly('call_today').mode, 'skip')
})

// rescueOverStoredCall: a record-only rescue written over a stored call keeps what the photo
// read on that row found, by the same rules as the floor-only writer (storedPhotoFinding).
const FINDING_COPY: IncidentCopy = { ...COPY, contextualWithPhotoFinding: (p, f, v) => `PHOTO_CTX:${p}:${f.join(',')}:${v.join(',')}` }
const BLOOD_DESCRIPTOR = { presentFlagsFromStructured: (row: Record<string, unknown>) => (row.blood_col === 'yes' ? ['blood'] : []) }
const RECORD_RESCUE: RescueRead = { ...RESCUE_BASE, tier: 'call_now', read_text: 'CONTEXTUAL:Mochi:ctx' }
const rebuilt = (row: Record<string, unknown>, rescue: RescueRead = RECORD_RESCUE) =>
  rescueOverStoredCall(BLOOD_DESCRIPTOR, FINDING_COPY, rescue, row, { petName: 'Mochi', hasPhoto: true })

Deno.test('CUL-2811 — a record-only rescue over a stored call keeps the cached flags and leads with the photo finding', () => {
  const r = rebuilt({ recommendation: 'worth_a_call', visual_flags: ['blood'], contextual_flags: ['old'], edited_at: null })
  assertEquals(r.visual_flags, ['blood'])
  assertEquals(r.contextual_flags, ['old', 'ctx'])
  assertStrictEquals(r.read_text, 'PHOTO_CTX:Mochi:old,ctx:blood')
  assertStrictEquals(r.tier, 'call_now')
})

Deno.test('CUL-2811 — over an edited row the words lead with the owner\'s columns, not the stale cache', () => {
  // The owner corrected the read to blood; the cached visual_flags are left stale on purpose (Pattern 7).
  const r = rebuilt({ recommendation: 'worth_a_call', visual_flags: [], contextual_flags: [], blood_col: 'yes', edited_at: '2026-09-26T08:30:00Z' })
  assertStrictEquals(r.read_text, 'PHOTO_CTX:Mochi:ctx:blood')
  assertEquals(r.visual_flags, [])
  // And an owner who cleared the finding is not told about it again.
  const cleared = rebuilt({ recommendation: 'worth_a_call', visual_flags: ['blood'], contextual_flags: [], blood_col: 'no', edited_at: '2026-09-26T08:30:00Z' })
  assertStrictEquals(cleared.read_text, 'CONTEXTUAL:Mochi:ctx')
})

Deno.test('CUL-2811 — a stored call that was the model\'s own, with no flag behind it, still leads as a photo finding', () => {
  const r = rebuilt({ recommendation: 'worth_a_call', visual_flags: [], contextual_flags: [], edited_at: null })
  assertStrictEquals(r.read_text, 'PHOTO_CTX:Mochi:ctx:')
  // A stored call with a contextual flag behind it was the record's: no photo finding is claimed.
  assertStrictEquals(rebuilt({ recommendation: 'worth_a_call', visual_flags: [], contextual_flags: ['old'], edited_at: null }).read_text, 'CONTEXTUAL:Mochi:old,ctx')
})

Deno.test('CUL-2811 — a rescue with a photo finding of its own is written as it is', () => {
  const own: RescueRead = { ...RECORD_RESCUE, visual_flags: ['foreign_material'], read_text: 'THIS RUN' }
  assertStrictEquals(rebuilt({ recommendation: 'worth_a_call', visual_flags: ['blood'], contextual_flags: ['old'], edited_at: null }, own), own)
})

Deno.test('CUL-2811 — the last try over a call names the call and nothing a newer version could make stale', () => {
  const full = {
    event_id: 'e', pet_id: 'p', incident_type: 'vomit', recommendation: 'worth_a_call', tier: 'call_now', may_wait: null,
    read_text: 'COPIED', visual_flags: ['blood'], contextual_flags: ['ctx'], error: 'boom', dismissed_at: null, rule_version: 'r1',
  }
  assertEquals(raiseOnlyValues(full), { recommendation: 'worth_a_call', tier: 'call_now', may_wait: null, dismissed_at: null, error: 'boom' })
  // A floor-only rescue notes no error, and the raise names none.
  const { error: _e, ...floorOnly } = full
  assertStrictEquals('error' in raiseOnlyValues(floorOnly), false)
})

Deno.test('EN-3 — isRealAnalysis: a failed row holding a call tier is real (the cap never buries it)', () => {
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'monitor', tier: 'call_today' }), true)
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'monitor', tier: 'logged' }), false)
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'worth_a_call' }), true)
})

// ── mergeAfterRead: the post-read hook can only add ────────────────────────────────────

Deno.test('EN-7 — the post-read hook can take away only a flag named withdrawable', () => {
  const other: IncidentCopy = { ...COPY, monitor: () => 'OTHER' }
  const merged = mergeAfterRead({ flags: ['a', 'b'], copy: COPY }, { flags: [], copy: other })
  assertEquals(merged.flags, ['a', 'b'])
  assertStrictEquals(merged.copy, other)
  assertEquals(mergeAfterRead({ flags: ['a'], copy: COPY }, { flags: ['c', 'a'], copy: COPY }).flags, ['a', 'c'])
  assertEquals(mergeAfterRead({ flags: ['a', 'b'], copy: COPY, withdrawable: ['b'] }, { flags: [], copy: COPY }).flags, ['a'])
  assertEquals(mergeAfterRead({ flags: ['a', 'b'], copy: COPY, withdrawable: ['b'] }, { flags: ['b'], copy: COPY }).flags, ['a', 'b'])
})

// ── Ask reads the tier to quote the map's words (spec §4; CUL-1512, PR-27m) ─────────────
// Until PR-27m this guard held `tier` OUT of Ask's select, because nothing turned it into
// words. Now `projectCachedRead` resolves the record's words through the one map, so Ask
// reads the two columns the resolver needs. The raw values never reach the model; that half
// is pinned in ask/tools.test.ts and ask/answer.test.ts.

Deno.test('EN-3 — Ask selects `tier` and `engine_flags`, the resolver\'s inputs (PR-27m)', async () => {
  const src = await Deno.readTextFile(new URL('../ask/index.ts', import.meta.url))
  const cols = /const READ_COLS\s*=\s*\n?\s*'([^']*)'/.exec(src)
  assertStrictEquals(cols !== null, true, 'READ_COLS moved; re-anchor this guard')
  const list = cols![1].split(',').map((c) => c.trim())
  assertStrictEquals(list.includes('tier'), true)
  assertStrictEquals(list.includes('engine_flags'), true)
  assertStrictEquals(list.includes('recommendation'), true) // the louder column still counts
})
