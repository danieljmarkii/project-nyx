// EN-3's server half (CUL-1133; Engines v3 PR-26): the pure pieces of the tier's dual-write
// and the tier-aware hold. The pipeline wiring is pinned end to end in
// incident-analysis.pipeline.test.ts. Run with: deno test supabase/functions/_shared/

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  type AnalysisReadFields,
  buildFailureWrite,
  buildRescueRead,
  holdsOver,
  type IncidentCopy,
  keepLouderTier,
  isRealAnalysis,
  mergeAfterRead,
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
  recommendation: 'worth_a_call', tier: null, status: 'completed', edited: false, presentFlags: [], hidden: false, ...o,
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
    stored: stored({ tier: 'call_now' }), eventId: 'e', petId: 'p', incidentType: 'vomit', structuredValues: { blood_col: 'yes' },
    nextPresentFlags: ['blood'], readFields: tieredReadFields({ ...FIELDS, recommendation: 'worth_a_call' }, true),
  }) as { mode: string; values: Record<string, unknown> }
  assertStrictEquals(w.mode, 'upsert')
  assertStrictEquals(w.values.tier, 'call_now')
  assertStrictEquals(w.values.blood_col, 'yes') // the new finding lands
  // Flag-off: the column is left alone (the stored call now stays on the row).
  const off = resolveReanalysisWrite({
    stored: stored({ tier: 'call_now' }), eventId: 'e', petId: 'p', incidentType: 'vomit', structuredValues: {},
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
    existing: null, existingReadFailed: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'x',
    rescue: withRescueTier(rescue, true), stamps: null,
  })
  assertStrictEquals(on.mode, 'rescue')
  assertStrictEquals((on as { values: Record<string, unknown> }).values.tier, 'call_today')
  const off = buildFailureWrite({
    existing: null, existingReadFailed: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'x',
    rescue, stamps: null,
  })
  assertStrictEquals('tier' in (off as { values: Record<string, unknown> }).values, false)
})

Deno.test('EN-3 — a stored call tier survives a failed run even beside a lowered verdict', () => {
  const w = buildFailureWrite({
    existing: { recommendation: 'monitor', tier: 'call_today', presentFlags: [] },
    existingReadFailed: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom', rescue: null, stamps: null,
  })
  assertEquals(w, { mode: 'error-only', values: { error: 'boom' } })
  // Untiered, today's rule exactly: a calm stored row falls to the retry frame.
  const untiered = buildFailureWrite({
    existing: { recommendation: 'monitor', tier: null, presentFlags: [] },
    existingReadFailed: false, eventId: 'e', petId: 'p', incidentType: 'vomit', message: 'boom', rescue: null, stamps: null,
  })
  assertStrictEquals(untiered.mode, 'upsert')
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

// ── Ask never sees the raw tier (spec §4; the PR-25 privacy note) ──────────────────────

Deno.test('EN-3 — Ask selects no `tier` column until the tier-word map reaches it (PR-27)', async () => {
  const src = await Deno.readTextFile(new URL('../ask/index.ts', import.meta.url))
  const cols = /const READ_COLS\s*=\s*\n?\s*'([^']*)'/.exec(src)
  assertStrictEquals(cols !== null, true, 'READ_COLS moved; re-anchor this guard')
  assertStrictEquals(cols![1].split(',').map((c) => c.trim()).includes('tier'), false)
  assertStrictEquals(cols![1].includes('recommendation'), true) // the anchor is the real column list
})
