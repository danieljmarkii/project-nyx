// EN-7's rule, its reads and its words, as pure units (CUL-1138; Engines v3 PR-26). The
// pipeline diff is pipeline.test.ts. Run with: deno test supabase/functions/analyze-stool/

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildContextualReadText,
  buildEn7StoolContext,
  buildEn7VomitReadText,
  computeContextualFlags,
  ownerAgreesFormed,
  type En7VomitReason,
  en7ReadForm,
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

const QUIET = { loggedLoose: false, vomitingRepeats: false, intakeArm: false }
const base: StoolContextInput = {
  recentLooseStoolTimes: [], thisEventOccurredAt: STOOL_AT, hasRecentVomiting: true, hasRecentLethargy: false,
}

const FORMED: StoolAnalysis = {
  appears_to_show_stool: true, consistency: 'type_4_smooth_soft', colour: 'brown', contents: null, blood_present: 'no',
  blood_type: null, mucus_present: 'no', foreign_material_present: 'no', foreign_material_note: null, description: null,
  visual_flags: [], recommendation: 'monitor', read_text: null, confidence: null,
}
const at = (consistency: string | null, appears = true): StoolAnalysis => ({ ...FORMED, consistency, appears_to_show_stool: appears })

type Run = Exclude<ReturnType<typeof stoolContextualRun>, unknown[]>
function flagOnRun(ctx: StoolContextInput): Run {
  const run = stoolContextualRun(ctx)
  if (Array.isArray(run) || !run.afterRead) throw new Error('flag-on run has no hook')
  return run
}

// ── Before the read: exactly today ─────────────────────────────────────────────────

Deno.test('EN-7 — before the read, a vomit in the window fires the flag flag-on as flag-off (F2: unread keeps the call)', () => {
  assertEquals(computeContextualFlags(base), ['concurrent_vomiting'])
  assertEquals(computeContextualFlags({ ...base, en7: QUIET }), ['concurrent_vomiting'])
  assertEquals(flagOnRun({ ...base, en7: QUIET }).flags, ['concurrent_vomiting'])
  assertEquals(computeContextualFlags({ ...base, hasRecentVomiting: false, en7: { ...QUIET, loggedLoose: true } }), [])
})

Deno.test('EN-7 flag-off — the run is the flags alone: no copy, no hook, nothing withdrawable', () => {
  assertEquals(stoolContextualRun(base), ['concurrent_vomiting'])
})

Deno.test('EN-7 — the other two flags are untouched by the key', () => {
  const ctx = { ...base, hasRecentVomiting: false, hasRecentLethargy: true, recentLooseStoolTimes: [STOOL_AT, iso(NOW - 3 * H)] }
  assertEquals(computeContextualFlags(ctx), computeContextualFlags({ ...ctx, en7: QUIET }))
  assertEquals(computeContextualFlags(ctx), ['repeated_loose_stool', 'concurrent_lethargy'])
})

// ── What may be withdrawn, and when ─────────────────────────────────────────────────

Deno.test('EN-7 — the flag is withdrawable only when nothing else asks for it', () => {
  assertEquals(flagOnRun({ ...base, en7: QUIET }).withdrawable, ['concurrent_vomiting'])
  for (const standing of [{ loggedLoose: true }, { vomitingRepeats: true }, { intakeArm: true }]) {
    assertEquals(flagOnRun({ ...base, en7: { ...QUIET, ...standing } }).withdrawable, [], JSON.stringify(standing))
  }
})

Deno.test('EN-7 — the hook withdraws the flag on a formed stool only (types 2, 3, 4)', () => {
  const run = flagOnRun({ ...base, en7: QUIET })
  for (const c of ['type_2_lumpy', 'type_3_cracked', 'type_4_smooth_soft']) {
    assertEquals(run.afterRead!(at(c), null).flags, [], c)
  }
  // Loose, hard, "trending loose", unsure, no consistency, or not stool: the call stands.
  for (const [c, appears] of [['type_1_hard_lumps', true], ['type_5_soft_blobs', true], ['type_6_mushy', true],
    ['type_7_watery', true], ['unsure', true], [null, true], ['type_4_smooth_soft', false]] as const) {
    assertEquals(run.afterRead!(at(c, appears), null).flags, ['concurrent_vomiting'], `${c} ${appears}`)
  }
  assertEquals(run.afterRead!(null, null).flags, ['concurrent_vomiting'])
})

Deno.test('EN-7 F1 — a formed stool keeps the call when the cat intake arm holds', () => {
  const run = flagOnRun({ ...base, en7: { ...QUIET, intakeArm: true } })
  assertEquals(run.afterRead!(FORMED, null).flags, ['concurrent_vomiting'])
  assertStrictEquals(run.afterRead!(FORMED, null).copy.contextual('Mochi', ['concurrent_vomiting']), buildEn7VomitReadText('Mochi', 'intake'))
})

// ── The reads ─────────────────────────────────────────────────────────────────────────

const EN0_ON = { on: ['engines_v3_en0', 'engines_v3_en3'] as ('engines_v3_en0' | 'engines_v3_en3')[], readOk: true }
const EN0_OFF = { on: ['engines_v3_en3'] as ('engines_v3_en0' | 'engines_v3_en3')[], readOk: true }
const ctx = (vomitHours: number[], o: { eventType?: string; species?: string; meals?: { h: number; rating: string | null }[]; en0?: boolean } = {}) =>
  buildEn7StoolContext({
    engineFlags: o.en0 ? EN0_ON : EN0_OFF,
    species: o.species ?? 'dog',
    meals: (o.meals ?? []).map((m) => ({ occurred_at: iso(NOW - m.h * H), meals: { intake_rating: m.rating } })),
    looseTimes: [], vomitTimes: vomitHours.map((h) => iso(NOW - h * H)), hasRecentLethargy: false,
    thisEventOccurredAt: STOOL_AT, eventType: o.eventType ?? 'stool_normal', nowMs: NOW,
  })

Deno.test('EN-7 — the concurrent window is 24 h back from the read; the repeat rule sees a day further', () => {
  assertStrictEquals(ctx([25.5]).hasRecentVomiting, false) // 25.5 h from the read, 24.5 h from the stool: neither window
  assertStrictEquals(ctx([24]).hasRecentVomiting, true) // the boundary instant is inside
  assertStrictEquals(ctx([20, 30, 36]).en7?.vomitingRepeats, true) // the anchor counts older vomits
  assertStrictEquals(ctx([30, 36, 40]).en7?.vomitingRepeats, false) // none inside: nothing to anchor
  assertStrictEquals(ctx([2]).en7?.loggedLoose, false)
  assertStrictEquals(ctx([2], { eventType: 'diarrhea' }).en7?.loggedLoose, true)
  assertEquals(ctx([], { eventType: 'diarrhea' }).recentLooseStoolTimes, [STOOL_AT]) // the shipped race guard
})

Deno.test('EN-7 F1 — the intake arm is the vomit read\'s feline_reduced_intake, cats only, tracking-guarded', () => {
  // A cat whose owner rates meals, none Most or All in the 24 h before the read.
  assertStrictEquals(ctx([2], { species: 'cat', meals: [{ h: 5, rating: 'some' }, { h: 60, rating: 'all' }] }).en7?.intakeArm, true)
  // A Most or All meal in the window: no arm.
  assertStrictEquals(ctx([2], { species: 'cat', meals: [{ h: 5, rating: 'all' }] }).en7?.intakeArm, false)
  // An owner who never rates meals: the absence is not evidence (Pattern 6).
  assertStrictEquals(ctx([2], { species: 'cat', meals: [{ h: 5, rating: null }] }).en7?.intakeArm, false)
  // A dog: the arm is feline.
  assertStrictEquals(ctx([2], { species: 'dog', meals: [{ h: 5, rating: 'some' }] }).en7?.intakeArm, false)
})

Deno.test('EN-7 R2d — the window also counts vomits within 24 h of the stool, so a later re-read asks the same question', () => {
  // A stool logged 30 h before the read, a vomit 20 h before the stool (50 h before the read).
  const late = buildEn7StoolContext({
    engineFlags: EN0_OFF, species: 'dog', meals: [], looseTimes: [], vomitTimes: [iso(NOW - 50 * H)],
    hasRecentLethargy: false, thisEventOccurredAt: iso(NOW - 30 * H), eventType: 'stool_normal', nowMs: NOW,
  })
  assertStrictEquals(late.hasRecentVomiting, true)
  // A vomit 25 h from the stool and 25 h+ from the read counts in neither window.
  const far = buildEn7StoolContext({
    engineFlags: EN0_OFF, species: 'dog', meals: [], looseTimes: [], vomitTimes: [iso(NOW - 55.5 * H)],
    hasRecentLethargy: false, thisEventOccurredAt: iso(NOW - 30 * H), eventType: 'stool_normal', nowMs: NOW,
  })
  assertStrictEquals(far.hasRecentVomiting, false)
  // A vomit AFTER the stool, within a day of it, counts too (the anchored window looks both ways).
  const after = buildEn7StoolContext({
    engineFlags: EN0_OFF, species: 'dog', meals: [], looseTimes: [], vomitTimes: [iso(NOW - 26 * H)],
    hasRecentLethargy: false, thisEventOccurredAt: iso(NOW - 40 * H), eventType: 'stool_normal', nowMs: NOW,
  })
  assertStrictEquals(after.hasRecentVomiting, true)
})

Deno.test('EN-7 R1 — with EN-0 on, the arm asks the vomit\'s anchored half too (eating after never cancels refusals before)', () => {
  // Refusals before a vomit 20 h ago, then an 'all' meal after it.
  const meals = [{ h: 100, rating: 'all' }, { h: 30, rating: 'none' }, { h: 22, rating: 'none' }, { h: 2, rating: 'all' }]
  assertStrictEquals(ctx([20], { species: 'cat', meals, en0: true }).en7?.intakeArm, true)
  // EN-0 off: the shipped read-time half only, which the 'all' at 2 h satisfies.
  assertStrictEquals(ctx([20], { species: 'cat', meals, en0: false }).en7?.intakeArm, false)
})

Deno.test('EN-7 R2 — an owner-edited consistency must agree the stool is formed before the flag can go', () => {
  assertStrictEquals(ownerAgreesFormed(null), true)
  assertStrictEquals(ownerAgreesFormed({ edited_at: null, stool_consistency: 'type_7_watery' }), true) // unedited: the read decides
  assertStrictEquals(ownerAgreesFormed({ edited_at: '2026-09-29T00:00:00Z', stool_consistency: 'type_7_watery' }), false)
  assertStrictEquals(ownerAgreesFormed({ edited_at: '2026-09-29T00:00:00Z', stool_consistency: null }), false)
  assertStrictEquals(ownerAgreesFormed({ edited_at: '2026-09-29T00:00:00Z', stool_consistency: 'type_3_cracked' }), true)
  const run = flagOnRun({ ...base, en7: QUIET })
  assertEquals(run.afterRead!(FORMED, { edited_at: '2026-09-29T00:00:00Z', stool_consistency: 'type_7_watery' }).flags, ['concurrent_vomiting'])
  assertEquals(run.afterRead!(FORMED, null).flags, [])
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
  assertStrictEquals(meetsVomitRepeatRuleAt(['2026-09-29T04:00:00.000Z', '2026-09-29T04:00:00+00:00'], '2026-09-29T04:00:00.000Z'), true)
})

Deno.test('EN-7 — a read\'s form: loose 6-7, hard 1, formed 2-4, anything else unread', () => {
  assertStrictEquals(en7ReadForm(at('type_7_watery')), 'loose')
  assertStrictEquals(en7ReadForm(at('type_6_mushy')), 'loose')
  assertStrictEquals(en7ReadForm(at('type_1_hard_lumps')), 'hard')
  assertStrictEquals(en7ReadForm(at('type_3_cracked')), 'formed')
  assertStrictEquals(en7ReadForm(at('type_5_soft_blobs')), null)
  assertStrictEquals(en7ReadForm(at('unsure')), null)
  assertStrictEquals(en7ReadForm(at('type_4_smooth_soft', false)), null)
  assertStrictEquals(en7ReadForm(null), null)
})

// ── The words ─────────────────────────────────────────────────────────────────────────

Deno.test('EN-7 — the words: the owner\'s Loose leads, then the read, then the reason the vomiting asks', () => {
  const words = (en7: typeof QUIET, a: StoolAnalysis | null) => {
    const run = flagOnRun({ ...base, en7 })
    const after = run.afterRead!(a, null)
    return after.copy.contextual('Cooper', after.flags)
  }
  const watery = at('type_7_watery')
  assertStrictEquals(words({ ...QUIET, loggedLoose: true, vomitingRepeats: true }, watery), buildEn7VomitReadText('Cooper', 'logged_loose'))
  assertStrictEquals(words({ ...QUIET, vomitingRepeats: true }, watery), buildEn7VomitReadText('Cooper', 'read_loose'))
  assertStrictEquals(words({ ...QUIET, vomitingRepeats: true }, FORMED), buildEn7VomitReadText('Cooper', 'repeats'))
  assertStrictEquals(words(QUIET, at('type_1_hard_lumps')), buildEn7VomitReadText('Cooper', 'read_hard'))
  assertStrictEquals(words(QUIET, at('type_5_soft_blobs')), buildEn7VomitReadText('Cooper', 'unread'))
  // Before any read (the cap branch and the rescue take these words).
  assertStrictEquals(flagOnRun({ ...base, en7: QUIET }).copy.contextual('Cooper', ['concurrent_vomiting']), buildEn7VomitReadText('Cooper', 'unread'))
})

const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i
const REASONS: En7VomitReason[] = ['logged_loose', 'read_loose', 'read_hard', 'intake', 'repeats', 'unread']

Deno.test('EN-7 copy — every sentence routes to the vet, never reassures, never shouts, and keeps no relative clock', () => {
  for (const reason of REASONS) {
    for (const pet of ['Cooper', '']) {
      const t = buildEn7VomitReadText(pet, reason)
      assertStrictEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
      assertStrictEquals(t.includes('!'), false)
      assertStrictEquals(/call your vet/.test(t), true, t)
      assertStrictEquals(/worth a call/i.test(t), false, t)
      // Stored words must stay true when read later (GAP-1).
      assertStrictEquals(/\b(today|tonight|yesterday|last day|recently)\b/i.test(t), false, t)
    }
  }
})

Deno.test('EN-7 copy — only a loose reason says loose; the shipped sentence said it over any stool', () => {
  for (const reason of ['read_hard', 'intake', 'repeats', 'unread'] as const) {
    assertStrictEquals(buildEn7VomitReadText('Cooper', reason).includes('loose'), false, reason)
  }
  assertStrictEquals(buildEn7VomitReadText('Cooper', 'logged_loose').includes('loose'), true)
  assertStrictEquals(buildContextualReadText('Cooper', ['concurrent_vomiting']).includes('loose stool'), true)
})

Deno.test('EN-7 copy — the other contextual sentences are the shipped ones under the key', () => {
  const copy = en7StoolCopy('repeats')
  assertStrictEquals(copy.contextual('Cooper', ['repeated_loose_stool']), buildContextualReadText('Cooper', ['repeated_loose_stool']))
  assertStrictEquals(copy.contextual('Cooper', ['concurrent_lethargy']), buildContextualReadText('Cooper', ['concurrent_lethargy']))
})
