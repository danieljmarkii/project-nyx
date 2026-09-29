// EN-7's rule, its reads and its words, as pure units (CUL-1138; Engines v3 PR-26). The
// pipeline diff is pipeline.test.ts. Run with: deno test supabase/functions/analyze-stool/

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildContextualReadText,
  buildEn7StoolContext,
  buildEn7VomitReadText,
  computeContextualFlags,
  type En7VomitReason,
  en7ReadReason,
  en7StoolCopy,
  type StoolAnalysis,
  type StoolContextInput,
  stoolContextualRun,
} from './index.ts'
import { anyVomitMeetsRepeatRule, meetsVomitRepeatRuleAt } from '../_shared/vomitRepeat.ts'

const H = 3_600_000
const NOW = Date.parse('2026-09-29T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const STOOL_AT = iso(NOW - H)

const base: StoolContextInput = {
  recentLooseStoolTimes: [], thisEventOccurredAt: STOOL_AT, hasRecentVomiting: true, hasRecentLethargy: false,
}

// ── The rule ──────────────────────────────────────────────────────────────────────

Deno.test('EN-7 — a formed stool beside one vomit: no concurrent_vomiting (the pair adds nothing)', () => {
  assertEquals(computeContextualFlags({ ...base, en7: { loggedLoose: false, vomitingRepeats: false } }), [])
})

Deno.test('EN-7 — a loose stool beside a vomit, or repeating vomiting beside any stool: the flag fires', () => {
  assertEquals(computeContextualFlags({ ...base, en7: { loggedLoose: true, vomitingRepeats: false } }), ['concurrent_vomiting'])
  assertEquals(computeContextualFlags({ ...base, en7: { loggedLoose: false, vomitingRepeats: true } }), ['concurrent_vomiting'])
})

Deno.test('EN-7 — no vomit in the window, no flag, whatever else is true', () => {
  assertEquals(computeContextualFlags({ ...base, hasRecentVomiting: false, en7: { loggedLoose: true, vomitingRepeats: true } }), [])
})

Deno.test('EN-7 flag-off — without its facts the derivation is the shipped one (any vomit fires)', () => {
  assertEquals(computeContextualFlags(base), ['concurrent_vomiting'])
  // And the run is the flags alone: no copy, no hook, so the pipeline takes STOOL_COPY.
  assertEquals(stoolContextualRun(base), ['concurrent_vomiting'])
})

Deno.test('EN-7 — the other two flags are untouched by the key', () => {
  const ctx = { ...base, hasRecentVomiting: false, hasRecentLethargy: true, recentLooseStoolTimes: [STOOL_AT, iso(NOW - 3 * H)] }
  assertEquals(computeContextualFlags(ctx), computeContextualFlags({ ...ctx, en7: { loggedLoose: false, vomitingRepeats: false } }))
  assertEquals(computeContextualFlags(ctx), ['repeated_loose_stool', 'concurrent_lethargy'])
})

// ── The reads ─────────────────────────────────────────────────────────────────────

Deno.test('EN-7 — the concurrent window is 24 h back from the read; the repeat rule sees a day further', () => {
  const ctx = (vomitHours: number[], eventType = 'stool_normal') =>
    buildEn7StoolContext({
      looseTimes: [], vomitTimes: vomitHours.map((h) => iso(NOW - h * H)), hasRecentLethargy: false,
      thisEventOccurredAt: STOOL_AT, eventType, nowMs: NOW,
    })
  assertStrictEquals(ctx([25]).hasRecentVomiting, false) // outside the window: not "recent"
  assertStrictEquals(ctx([24]).hasRecentVomiting, true) // the boundary instant is inside
  assertStrictEquals(ctx([20, 30, 36]).en7?.vomitingRepeats, true) // the anchor counts older vomits
  assertStrictEquals(ctx([30, 36, 40]).en7?.vomitingRepeats, false) // none inside: nothing to anchor
  assertStrictEquals(ctx([2]).en7?.loggedLoose, false)
  assertStrictEquals(ctx([2], 'diarrhea').en7?.loggedLoose, true)
  // The shipped race guard: a Loose stool counts itself.
  assertEquals(ctx([], 'diarrhea').recentLooseStoolTimes, [STOOL_AT])
})

Deno.test('EN-7 — the repeat predicate is the vomit read\'s, at its thresholds', () => {
  const t = (h: number) => iso(NOW - h * H)
  assertStrictEquals(meetsVomitRepeatRuleAt([t(1), t(5)], t(1)), true) // 4 h apart: inclusive
  assertStrictEquals(meetsVomitRepeatRuleAt([t(1), t(5.1)], t(1)), false)
  assertStrictEquals(meetsVomitRepeatRuleAt([t(1), t(10), t(25)], t(1)), true) // 3 within 24 h
  assertStrictEquals(meetsVomitRepeatRuleAt([t(1), t(10), t(25.1)], t(1)), false)
  assertStrictEquals(anyVomitMeetsRepeatRule([t(1), t(10), t(25.1)], [t(1), t(10)]), true) // anchored at 10
  assertStrictEquals(anyVomitMeetsRepeatRule([t(1)], []), false)
  // Two spellings of one instant are one instant (C-40).
  const a = '2026-09-29T04:00:00.000Z'
  const b = '2026-09-29T04:00:00+00:00'
  assertStrictEquals(meetsVomitRepeatRuleAt([a, b], a), true)
})

// ── The post-read hook ───────────────────────────────────────────────────────────

const FORMED: StoolAnalysis = {
  appears_to_show_stool: true, consistency: 'type_4_smooth_soft', colour: 'brown', contents: null, blood_present: 'no',
  blood_type: null, mucus_present: 'no', foreign_material_present: 'no', foreign_material_note: null, description: null,
  visual_flags: [], recommendation: 'monitor', read_text: null, confidence: null,
}

Deno.test('EN-7 — only a read that shows stool, at type 1, 6 or 7, is evidence of an abnormal stool', () => {
  assertStrictEquals(en7ReadReason({ ...FORMED, consistency: 'type_7_watery' }), 'read_loose')
  assertStrictEquals(en7ReadReason({ ...FORMED, consistency: 'type_6_mushy' }), 'read_loose')
  assertStrictEquals(en7ReadReason({ ...FORMED, consistency: 'type_1_hard_lumps' }), 'read_hard')
  for (const c of ['type_2_lumpy', 'type_3_cracked', 'type_4_smooth_soft', 'type_5_soft_blobs', 'unsure', null]) {
    assertStrictEquals(en7ReadReason({ ...FORMED, consistency: c }), null, String(c))
  }
  assertStrictEquals(en7ReadReason({ ...FORMED, appears_to_show_stool: false, consistency: 'type_7_watery' }), null)
  assertStrictEquals(en7ReadReason(null), null)
})

Deno.test('EN-7 — the hook adds the flag for a read-loose stool beside a vomit, and nothing without one', () => {
  const run = stoolContextualRun({ ...base, en7: { loggedLoose: false, vomitingRepeats: false } })
  if (Array.isArray(run) || !run.afterRead) throw new Error('flag-on run has no hook')
  assertEquals(run.flags, [])
  assertEquals(run.afterRead({ ...FORMED, consistency: 'type_7_watery' }).flags, ['concurrent_vomiting'])
  assertEquals(run.afterRead(FORMED).flags, [])
  assertEquals(run.afterRead(null).flags, [])
  const noVomit = stoolContextualRun({ ...base, hasRecentVomiting: false, en7: { loggedLoose: false, vomitingRepeats: false } })
  if (Array.isArray(noVomit) || !noVomit.afterRead) throw new Error('flag-on run has no hook')
  assertEquals(noVomit.afterRead({ ...FORMED, consistency: 'type_7_watery' }).flags, [])
})

Deno.test('EN-7 — the words: the owner\'s Loose outranks the read; the read outranks "repeats"', () => {
  const words = (run: ReturnType<typeof stoolContextualRun>, a: StoolAnalysis | null) => {
    if (Array.isArray(run) || !run.afterRead) throw new Error('flag-on run has no hook')
    const after = run.afterRead(a)
    return after.copy.contextual('Cooper', after.flags)
  }
  const watery = { ...FORMED, consistency: 'type_7_watery' }
  assertStrictEquals(
    words(stoolContextualRun({ ...base, en7: { loggedLoose: true, vomitingRepeats: true } }), watery),
    buildEn7VomitReadText('Cooper', 'logged_loose'),
  )
  assertStrictEquals(
    words(stoolContextualRun({ ...base, en7: { loggedLoose: false, vomitingRepeats: true } }), watery),
    buildEn7VomitReadText('Cooper', 'read_loose'),
  )
  assertStrictEquals(
    words(stoolContextualRun({ ...base, en7: { loggedLoose: false, vomitingRepeats: true } }), FORMED),
    buildEn7VomitReadText('Cooper', 'repeats'),
  )
})

// ── The copy (Pattern 8; nyx-voice) ──────────────────────────────────────────────

const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i
const REASONS: En7VomitReason[] = ['logged_loose', 'read_loose', 'read_hard', 'repeats']

Deno.test('EN-7 copy — every sentence routes to the vet, never reassures, never shouts, and keeps no relative clock', () => {
  for (const reason of REASONS) {
    for (const pet of ['Cooper', '']) {
      const t = buildEn7VomitReadText(pet, reason)
      assertStrictEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
      assertStrictEquals(t.includes('!'), false)
      assertStrictEquals(/call your vet/.test(t), true, t)
      // Stored words must stay true when read later (GAP-1): no "today", no "in the last day".
      assertStrictEquals(/\b(today|tonight|yesterday|last day|recently)\b/i.test(t), false, t)
    }
  }
})

Deno.test('EN-7 copy — only a loose reason says loose; the shipped sentence still said it over a formed stool', () => {
  assertStrictEquals(buildEn7VomitReadText('Cooper', 'repeats').includes('loose'), false)
  assertStrictEquals(buildEn7VomitReadText('Cooper', 'read_hard').includes('loose'), false)
  assertStrictEquals(buildEn7VomitReadText('Cooper', 'logged_loose').includes('loose'), true)
  assertStrictEquals(buildContextualReadText('Cooper', ['concurrent_vomiting']).includes('loose stool'), true)
})

Deno.test('EN-7 copy — the other contextual sentences are the shipped ones under the key', () => {
  const copy = en7StoolCopy('repeats')
  assertStrictEquals(copy.contextual('Cooper', ['repeated_loose_stool']), buildContextualReadText('Cooper', ['repeated_loose_stool']))
  assertStrictEquals(copy.contextual('Cooper', ['concurrent_lethargy']), buildContextualReadText('Cooper', ['concurrent_lethargy']))
})
