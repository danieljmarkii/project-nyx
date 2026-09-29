// Unit tests for analyze-vomit pure helpers.
// Run with: deno test supabase/functions/analyze-vomit/index.test.ts
//
// Covers the logic that is clinically load-bearing and not exercised by the
// vision model itself: tool-result parsing/sanitising, the deterministic
// contextual-flag computation, the escalation floor (incl. the never-reassure
// invariant), and the contextual read-text override. Storage I/O, the Claude
// call, and the HTTP handler are integration concerns verified manually.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import {
  parseAnalysisToolResult,
  computeContextualFlags,
  applyEscalationFloor,
  buildContextualReadText,
  selectReadText,
  selectDescription,
  buildAnalysisWriteBack,
  STRUCTURED_FIELD_KEYS,
  RED_FLAG_COLUMNS,
  presentFlagsFromStructured,
  detectImageMediaType,
  bytesToBase64,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
  buildEn0ContextualReadText,
  buildEn0PhotoFirstReadText,
  en0VomitCopy,
  vomitContextualRun,
  type ContextInput,
  type VomitAnalysis,
  type FunctionCaps,
} from './index.ts'
import { deriveIncidentFlags } from '../generate-signal/detection.ts'
import { selectReadText as selectSharedReadText, shouldCollapsePartialRead } from '../_shared/incident-analysis.ts'
import type { IntakeRecord } from './context.ts'

// ── Cap + flag gate (T2-3) ────────────────────────────────────────────────────
// analyze-vomit free caps are daily 10 / monthly 200, identical across tiers (D-M2).

const VOMIT_CAPS: FunctionCaps = { daily: 10, monthly: 200 }

Deno.test('resolveGateState (vomit) — flag off → feature_disabled (no increment)', () => {
  assertEquals(resolveGateState(false, null, VOMIT_CAPS), { allow: false, reason: 'feature_disabled' })
})

Deno.test('resolveGateState (vomit) — 10th read proceeds, 11th capped; monthly at 200/201', () => {
  assertEquals(resolveGateState(true, { dayCount: 10, monthCount: 15 }, VOMIT_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 11, monthCount: 15 }, VOMIT_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 200 }, VOMIT_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 201 }, VOMIT_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'monthly',
  })
})

Deno.test('resolveGateState (vomit) — RPC error (null counts) fails open to allow', () => {
  assertEquals(resolveGateState(true, null, VOMIT_CAPS), { allow: true })
})

Deno.test('resolveFlagValue / resolveCaps (vomit) — fallbacks + partial override', () => {
  assertStrictEquals(resolveFlagValue(undefined, true), true)
  assertStrictEquals(resolveFlagValue(false, true), false)
  assertEquals(resolveCaps({ analyze_vomit: { daily: 3 } }, 'analyze_vomit', VOMIT_CAPS), { daily: 3, monthly: 200 })
})

// ── The reorder invariant: escalation SURVIVES the cap (§5.4, adversarial target) ──
// When capped/flagged-off the handler skips vision and runs the floor with NO
// visual flags. These pin, at the pure-helper level the handler composes, that a
// fired CONTEXTUAL flag still forces worth_a_call and that NO capped path can
// produce a reassuring verdict — the never-reassure guarantee under the cap.

Deno.test('capped path — a fired contextual flag still forces worth_a_call (no vision, no visual flags)', () => {
  // Exactly the call the capped branch makes: modelRecommendation=not_enough_to_say,
  // appearsToShowVomit=false, visualFlags=[], but a contextual flag is present.
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowVomit: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: ['repeated_vomiting'],
  })
  assertStrictEquals(rec, 'worth_a_call')
  // And the read names the contextual reason (never the model's words, never reassurance).
  const read = selectReadText({
    petName: 'Nyx',
    recommendation: rec,
    contextualFlags: ['repeated_vomiting'],
    visualFlags: [],
    modelReadText: 'this looks totally fine and healthy', // must NOT surface on this path
    photoUnreadable: false,
    hasPhoto: true,
  })
  assertStrictEquals(read.includes('fine'), false)
  assertStrictEquals(read.includes('healthy'), false)
  assertStrictEquals(read, buildContextualReadText('Nyx', ['repeated_vomiting']))
})

Deno.test('capped escalation over a prior real analysis — update mode, structured red flags PRESERVED (never-clobber)', () => {
  // The blocker adversarial + code review caught: a capped/flag-off contextual
  // escalation carries analysis=null (no model ran). If it took the full-upsert
  // path it would NULL blood_present/foreign_material_present, silently erasing a
  // prior model-detected red flag from the vet report. The fix routes a prior REAL
  // analysis (humanEdited OR completed/uncertain) through preserveStructured=true →
  // update-read-fields-only. This pins that shape: update mode, and NOT one
  // structured column is written (so the prior blood/foreign finding survives).
  const readFields = {
    recommendation: 'worth_a_call' as const,
    read_text: 'Nyx has thrown up more than once in a short window.',
    visual_flags: [] as string[],
    contextual_flags: ['repeated_vomiting' as const],
    status: 'completed',
    error: null,
  }
  const wb = buildAnalysisWriteBack({
    humanEdited: true, // preserveStructured (humanEdited || existingRealAnalysis)
    eventId: 'evt-1',
    petId: 'pet-1',
    analysis: null,
    readFields,
  })
  assertStrictEquals(wb.mode, 'update')
  for (const k of STRUCTURED_FIELD_KEYS) {
    assertStrictEquals(Object.prototype.hasOwnProperty.call(wb.values, k), false)
  }
  // And the escalation still refreshes: worth_a_call + the contextual read land.
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('capped path — no contextual flag → floor is NOT an escalation (state row, not worth_a_call)', () => {
  // The other capped branch: no flags. The floor with hasPhoto + no flags + not
  // appears-to-show-vomit collapses to not_enough_to_say — i.e. no escalation is
  // fabricated. The handler writes status=capped/read_disabled here (verified in
  // the reorder), never a reassuring recommendation.
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowVomit: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say')
})

// ── bytesToBase64 ─────────────────────────────────────────────────────────────
// The chunked encoder that replaced the rope-building encodeBase64 whose ~250 MB
// blowup on a 6.5 MB image hard-killed the worker with a 546. These pin that it
// is byte-correct — including ACROSS the 32 KB chunk boundary, the one place a
// chunked encoder can go wrong — using deno-std encodeBase64 as the oracle.

Deno.test('bytesToBase64 — empty input', () => {
  assertStrictEquals(bytesToBase64(new Uint8Array([])), '')
})

Deno.test('bytesToBase64 — known vectors incl. 1- and 2-byte padding', () => {
  const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s))
  assertStrictEquals(enc('Man'), 'TWFu')      // no padding
  assertStrictEquals(enc('Ma'), 'TWE=')       // one '='
  assertStrictEquals(enc('M'), 'TQ==')        // two '='
  assertStrictEquals(enc('hello world'), 'aGVsbG8gd29ybGQ=')
})

Deno.test('bytesToBase64 — all 256 byte values match std', () => {
  const bytes = new Uint8Array(256)
  for (let i = 0; i < 256; i++) bytes[i] = i
  assertStrictEquals(bytesToBase64(bytes), encodeBase64(bytes))
})

Deno.test('bytesToBase64 — matches std across the 32 KB chunk boundary', () => {
  // ~100 KB of deterministic pseudo-random bytes spans several 32 KB windows, so
  // any off-by-one at a chunk seam (the classic chunked-encoder bug) shows up.
  const n = 100_003 // deliberately not a multiple of 3 or 0x8000
  const bytes = new Uint8Array(n)
  let x = 0x9e3779b9
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    bytes[i] = x & 0xff
  }
  assertStrictEquals(bytesToBase64(bytes), encodeBase64(bytes))
})

// ── detectImageMediaType ──────────────────────────────────────────────────────

Deno.test('detectImageMediaType — JPEG', () => {
  assertStrictEquals(detectImageMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
})

Deno.test('detectImageMediaType — PNG', () => {
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png')
})

Deno.test('detectImageMediaType — WebP (RIFF....WEBP) — the real-world bug', () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
  assertStrictEquals(detectImageMediaType(webp), 'image/webp')
})

Deno.test('detectImageMediaType — unknown bytes default to jpeg', () => {
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x00, 0x01, 0x02, 0x03])), 'image/jpeg')
})

// ── parseAnalysisToolResult ───────────────────────────────────────────────────

const makeToolUse = (input: Record<string, unknown>) => ({
  content: [{ type: 'tool_use' as const, id: 'toolu_t', name: 'analyze_vomit', input }],
  stop_reason: 'tool_use',
})

Deno.test('parseAnalysisToolResult — null when no tool_use block', () => {
  const res = { content: [{ type: 'text' as const, text: 'hi' }], stop_reason: 'end_turn' }
  assertEquals(parseAnalysisToolResult(res), null)
})

Deno.test('parseAnalysisToolResult — null when tool name mismatches', () => {
  const res = makeToolUse({})
  res.content[0].name = 'something_else'
  assertEquals(parseAnalysisToolResult(res), null)
})

Deno.test('parseAnalysisToolResult — full parse', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    colour: 'yellow',
    contents: ['bile', 'foam'],
    consistency: 'foamy',
    blood_present: 'none_visible',
    bile_present: 'yes',
    foreign_material_present: 'no',
    description: 'A small amount of yellow foam.',
    visual_flags: [],
    recommendation: 'monitor',
    read_text: 'This shows a small amount of yellow foam. Keep an eye on Mochi and call your vet if it keeps happening.',
    confidence: { colour: 0.9 },
  }))!
  assertStrictEquals(r.appears_to_show_vomit, true)
  assertStrictEquals(r.colour, 'yellow')
  assertEquals(r.contents, ['bile', 'foam'])
  assertStrictEquals(r.bile_present, 'yes')
  assertStrictEquals(r.recommendation, 'monitor')
})

Deno.test('parseAnalysisToolResult — drops hallucinated enum values to null', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    colour: 'chartreuse',          // not a valid vomit_colour
    contents: ['bile', 'lava'],    // 'lava' filtered out
    blood_present: 'maybe',        // invalid → null
    recommendation: 'all_clear',   // invalid → default not_enough_to_say
  }))!
  assertStrictEquals(r.colour, null)
  assertEquals(r.contents, ['bile'])
  assertStrictEquals(r.blood_present, null)
  assertStrictEquals(r.recommendation, 'not_enough_to_say')
})

Deno.test('parseAnalysisToolResult — appears_to_show_vomit defaults false', () => {
  const r = parseAnalysisToolResult(makeToolUse({ recommendation: 'not_enough_to_say' }))!
  assertStrictEquals(r.appears_to_show_vomit, false)
  assertStrictEquals(r.contents, null)
})

// ── CUL-152 / B-179: the model's TWO free-text fields (description + read_text) reach
// the owner ONLY on the model's OWN worth_a_call. On monitor / not_enough_to_say — and
// on a floor-forced escalation the model did not self-call — both are nulled at parse,
// so the n=1 reassurance-on-absence vector never reaches the detail screen / ask / the
// Step 9 report. The structured clinical rows carry the facts instead. ──

Deno.test('parseAnalysisToolResult — monitor: model description AND read_text suppressed at parse (CUL-152)', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    colour: 'yellow',
    contents: ['foam'],
    consistency: 'foamy',
    blood_present: 'none_visible',
    foreign_material_present: 'no',
    description: 'Looks like a totally normal hairball, nothing concerning.', // the description leak vector
    recommendation: 'monitor',
    read_text: 'Mochi looks fine — nothing to worry about here.',              // the B-060 read_text vector
  }))!
  assertStrictEquals(r.recommendation, 'monitor')
  assertStrictEquals(r.description, null) // free-text prose suppressed on a benign read
  assertStrictEquals(r.read_text, null)
  // The structured clinical facts still land — they, not the prose, carry the record.
  assertStrictEquals(r.colour, 'yellow')
  assertEquals(r.contents, ['foam'])
})

Deno.test('parseAnalysisToolResult — not_enough_to_say: free-text fields suppressed', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: false,
    description: 'Hard to tell, but nothing looks alarming.',
    recommendation: 'not_enough_to_say',
    read_text: 'Probably fine.',
  }))!
  assertStrictEquals(r.description, null)
  assertStrictEquals(r.read_text, null)
})

Deno.test("parseAnalysisToolResult — worth_a_call: the model's OWN escalation read + description are preserved (surface on presence)", () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    blood_present: 'fresh_red',
    visual_flags: ['blood'],
    description: 'There are streaks of what looks like fresh blood in the vomit.',
    recommendation: 'worth_a_call',
    read_text: 'I can see what looks like blood. That is worth a call to your vet.',
  }))!
  assertStrictEquals(r.description, 'There are streaks of what looks like fresh blood in the vomit.')
  assertStrictEquals(r.read_text, 'I can see what looks like blood. That is worth a call to your vet.')
})

Deno.test('parseAnalysisToolResult — model sets a visual flag but self-selects monitor: soft read + description suppressed, floor escalates deterministically (CUL-152)', () => {
  // The case selectReadText alone missed: a model flags blood in visual_flags yet
  // under-calls the recommendation with a soft, benign read + description. Both
  // free-text fields are nulled at parse, so the forced worth_a_call surfaces the
  // deterministic flag-named read — never the model's soft line.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    blood_present: 'coffee_ground',
    visual_flags: ['blood'],
    recommendation: 'monitor', // under-called
    description: 'Just a small amount of dark foam, looks normal for after a meal.',
    read_text: 'Nothing to worry about, this looks pretty typical.',
  }))!
  assertStrictEquals(r.description, null)
  assertStrictEquals(r.read_text, null)
  assertEquals(r.visual_flags, ['blood'])
  const rec = applyEscalationFloor({
    modelRecommendation: r.recommendation,
    appearsToShowVomit: r.appears_to_show_vomit,
    hasPhoto: true,
    visualFlags: r.visual_flags,
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'worth_a_call')
  const read = selectReadText({
    petName: 'Mochi', recommendation: rec, contextualFlags: [],
    visualFlags: r.visual_flags, modelReadText: r.read_text, photoUnreadable: false, hasPhoto: true,
  })
  assertEquals(read.toLowerCase().includes('blood'), true)     // names the present concern
  assertEquals(/\b(worry|normal|typical|fine)\b/i.test(read), false) // never the soft model line
})

// ── CUL-534: the floor escalates on the STRUCTURED red flag, not the model's
// (droppable) visual_flags array — analyze-stool's adversarial ① (2026-07-17), brought
// to vomit. A model that records blood / foreign material but omits the flag AND
// self-selects monitor must still escalate, and must surface the deterministic
// flag-named read, never the prose it wrote for a monitor read. ──

// The shared pipeline's steps 7–8b over one parse, so each case below asserts what the
// owner would actually see, not only the array.
function floorAndRead(r: VomitAnalysis) {
  const rec = applyEscalationFloor({
    modelRecommendation: r.recommendation,
    appearsToShowVomit: r.appears_to_show_vomit,
    hasPhoto: true,
    visualFlags: r.visual_flags,
    contextualFlags: [],
  })
  const read = selectReadText({
    petName: 'Mochi', recommendation: rec, contextualFlags: [],
    visualFlags: r.visual_flags, modelReadText: r.read_text, photoUnreadable: false, hasPhoto: true,
  })
  const description = selectDescription({
    modelDescription: r.description, recommendation: rec, contextualFlags: [], photoUnreadable: false,
  })
  return { rec, read, description }
}

Deno.test('parseAnalysisToolResult — derives "blood" from blood_present=coffee_ground when the model omits the flag and says monitor (CUL-534)', () => {
  // The Engines v3 critique's case (CUL-1268 MFU-9): pre-fix this read "Keep an eye out"
  // beside its own "Blood: Coffee-ground" row while Home's card, deriving from the
  // field, said to call.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    blood_present: 'coffee_ground',
    visual_flags: [],          // the model dropped the flag...
    recommendation: 'monitor', // ...and under-called the recommendation
    description: 'Some dark flecks in brown liquid, nothing unusual after a meal.', // must NOT surface
    read_text: 'Keep an eye out, this looks fairly typical.',                     // must NOT surface
  }))!
  assertEquals(r.visual_flags, ['blood']) // derived from the structured field
  assertStrictEquals(r.read_text, null)
  assertStrictEquals(r.description, null)
  const { rec, read, description } = floorAndRead(r)
  assertStrictEquals(rec, 'worth_a_call')
  assertEquals(read.toLowerCase().includes('blood'), true)
  assertEquals(/keep an eye|typical|unusual|fine|normal/i.test(read), false)
  assertStrictEquals(description, null)
})

Deno.test('parseAnalysisToolResult — derives "blood" from blood_present=fresh_red when the flag is omitted (CUL-534)', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true, blood_present: 'fresh_red', visual_flags: [], recommendation: 'monitor',
  }))!
  assertEquals(r.visual_flags, ['blood'])
  assertStrictEquals(floorAndRead(r).rec, 'worth_a_call')
})

Deno.test('parseAnalysisToolResult — derives "suspected_foreign_material" from foreign_material_present=yes when the flag is omitted (CUL-534)', () => {
  // The CUL-240 round-2 residual: a 'yes' + 'monitor' row put the model's raw note on a
  // monitor card through VomitAnalysisSection's 'yes' path. With the flag derived, a
  // 'yes' foreign read cannot leave the floor as anything but worth_a_call.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    foreign_material_present: 'yes',
    foreign_material_note: 'looks like a piece of string, usually passes',
    visual_flags: [],
    recommendation: 'monitor',
  }))!
  assertEquals(r.visual_flags, ['suspected_foreign_material'])
  const { rec, read } = floorAndRead(r)
  assertStrictEquals(rec, 'worth_a_call')
  assertEquals(read.includes("doesn't look like food"), true)
  assertEquals(read.includes('string'), false) // the note never reaches the read
})

Deno.test('parseAnalysisToolResult — derives both flags when both fields are present; the fallback names both (CUL-534)', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true, blood_present: 'fresh_red', foreign_material_present: 'yes',
    visual_flags: [], recommendation: 'not_enough_to_say',
  }))!
  assertEquals([...r.visual_flags].sort(), ['blood', 'suspected_foreign_material'])
  const { rec, read } = floorAndRead(r)
  assertStrictEquals(rec, 'worth_a_call')
  assertEquals(read.includes('blood') && read.includes("doesn't look like food"), true)
})

Deno.test('parseAnalysisToolResult — no double-count when the model sets both the field and the flag (CUL-534)', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true,
    blood_present: 'fresh_red',
    foreign_material_present: 'yes',
    visual_flags: ['blood', 'suspected_foreign_material', 'blood'], // a repeat is collapsed too
    recommendation: 'worth_a_call',
  }))!
  assertEquals(r.visual_flags, ['blood', 'suspected_foreign_material']) // union, exactly one each
})

Deno.test("parseAnalysisToolResult — a model-set flag with no supporting field is kept (the union only ADDS) (CUL-534)", () => {
  // The derivation never removes a flag the model raised: escalate on presence in
  // either signal, never the weaker of the two.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true, blood_present: 'unsure', visual_flags: ['blood'], recommendation: 'monitor',
  }))!
  assertEquals(r.visual_flags, ['blood'])
  assertStrictEquals(floorAndRead(r).rec, 'worth_a_call')
})

Deno.test('parseAnalysisToolResult — present-only: unsure / none_visible / no / a hallucinated value derive NO flag (CUL-534)', () => {
  // Pattern 9's derivation is present-only. An 'unsure' blood read is CUL-240's soft
  // trigger (a label on the card), never a floor-forcing flag; deriving one here would
  // put every hard-to-read photo on "Worth a call".
  for (const [blood, foreign] of [
    ['none_visible', 'no'],
    ['unsure', 'unsure'],
    ['none_visible', 'unsure'],
    ['unsure', 'no'],
    ['bright_red', 'maybe'], // invalid enums sanitize to null, then derive nothing
  ]) {
    const r = parseAnalysisToolResult(makeToolUse({
      appears_to_show_vomit: true, blood_present: blood, foreign_material_present: foreign,
      visual_flags: [], recommendation: 'monitor',
    }))!
    assertEquals(r.visual_flags, [], `${blood} / ${foreign}`)
    assertStrictEquals(floorAndRead(r).rec, 'monitor', `${blood} / ${foreign}`)
  }
})

Deno.test('parseAnalysisToolResult — derives even when appears_to_show_vomit is false: a recorded finding escalates over "not vomit" (CUL-534)', () => {
  // Deliberate, and pinned so a later "only derive on a vomit photo" gate cannot slip in:
  // every reader (deriveIncidentFlags, unionPresentFlags, derivePresentFlags) escalates on
  // these fields without checking appears, as stool's floor does. Gating here would bring
  // back the split this issue closes: "Not enough to say" on the card, "call" on Home.
  // Dr. Chen: a wrong call costs a phone call; a haematemesis misread as "not vomit" does not.
  for (const fields of [
    { blood_present: 'fresh_red' },
    { foreign_material_present: 'yes' },
  ]) {
    const r = parseAnalysisToolResult(makeToolUse({
      appears_to_show_vomit: false, ...fields, visual_flags: [], recommendation: 'not_enough_to_say',
    }))!
    assertEquals(r.visual_flags.length, 1, JSON.stringify(fields))
    assertStrictEquals(floorAndRead(r).rec, 'worth_a_call', JSON.stringify(fields))
  }
})

Deno.test('parseAnalysisToolResult — a partial read whose readable photo records blood escalates instead of collapsing (CUL-534)', () => {
  // Pipeline step 7b: a benign partial read collapses to not_enough_to_say and drops the
  // structured fields. Before CUL-534 a coffee_ground-with-no-flag partial read collapsed,
  // erasing the finding from the card AND from every reader of the fields. The derived flag
  // escalates at step 7, which runs first, so the collapse never fires.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: true, blood_present: 'coffee_ground', visual_flags: [], recommendation: 'monitor',
  }))!
  const { rec } = floorAndRead(r)
  assertStrictEquals(rec, 'worth_a_call')
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 2, recommendation: rec }), false)
})

// ── selectDescription: the POST-FLOOR gate that gives `description` the same
// guarantee read_text gets from selectReadText (CUL-152 / B-179). ──

Deno.test('selectDescription — surfaces the model description on a non-contextual, readable worth_a_call', () => {
  assertStrictEquals(
    selectDescription({ modelDescription: 'Streaks of what looks like blood.', recommendation: 'worth_a_call', contextualFlags: [], photoUnreadable: false }),
    'Streaks of what looks like blood.',
  )
})

Deno.test('selectDescription — null on monitor / not_enough_to_say (the reassurance-on-absence paths)', () => {
  const d = 'Looks like a totally normal hairball, nothing concerning.'
  assertStrictEquals(selectDescription({ modelDescription: d, recommendation: 'monitor', contextualFlags: [], photoUnreadable: false }), null)
  assertStrictEquals(selectDescription({ modelDescription: d, recommendation: 'not_enough_to_say', contextualFlags: [], photoUnreadable: false }), null)
})

Deno.test('selectDescription — null when a contextual flag drove the escalation (model prose is not the reason) or the photo was unreadable', () => {
  assertStrictEquals(selectDescription({ modelDescription: 'looks normal', recommendation: 'worth_a_call', contextualFlags: ['repeated_vomiting'], photoUnreadable: false }), null)
  assertStrictEquals(selectDescription({ modelDescription: 'anything', recommendation: 'worth_a_call', contextualFlags: [], photoUnreadable: true }), null)
})

Deno.test('CUL-152 pipeline gate — model self-escalates but the floor DOWNGRADES: description nulled (the adversarial break, closed)', () => {
  // Model returns worth_a_call on a photo it ALSO says is not the subject, with a
  // reassuring description. Parse preserves the description (the model self-escalated) —
  // so the parse gate alone is NOT enough — but the floor downgrades to not_enough_to_say
  // (appears=false, no flags), so the post-floor selectDescription must null it, or the
  // reassuring prose renders on a "Not enough to say yet" card.
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_vomit: false,
    recommendation: 'worth_a_call',
    visual_flags: [],
    description: 'This looks like a perfectly normal, healthy hairball — nothing at all to worry about.',
    read_text: 'Nothing at all to worry about.',
  }))!
  assertStrictEquals(r.description, 'This looks like a perfectly normal, healthy hairball — nothing at all to worry about.') // parse kept it
  const rec = applyEscalationFloor({
    modelRecommendation: r.recommendation,
    appearsToShowVomit: r.appears_to_show_vomit,
    hasPhoto: true,
    visualFlags: r.visual_flags,
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say') // the floor downgraded it
  assertStrictEquals(
    selectDescription({ modelDescription: r.description, recommendation: rec, contextualFlags: [], photoUnreadable: false }),
    null, // the post-floor gate nulls the reassuring description
  )
  // read_text is separately safe on this path — selectReadText re-gates on the post-floor rec.
  const read = selectReadText({ petName: 'Mochi', recommendation: rec, contextualFlags: [], visualFlags: [], modelReadText: r.read_text, photoUnreadable: false, hasPhoto: true })
  assertEquals(read.includes('not much I can read'), true)
})

// ── computeContextualFlags ────────────────────────────────────────────────────

const baseCtx = (over: Partial<ContextInput>): ContextInput => ({
  species: 'dog',
  recentVomitTimes: ['2026-05-24T12:00:00Z'],
  thisEventOccurredAt: '2026-05-24T12:00:00Z',
  hasRecentPositiveIntake: true,
  tracksIntake: true,
  hasRecentLethargy: false,
  ...over,
})

Deno.test('computeContextualFlags — repeated vomiting: 2 within 4h', () => {
  const flags = computeContextualFlags(baseCtx({
    recentVomitTimes: ['2026-05-24T12:00:00Z', '2026-05-24T09:30:00Z'],
  }))
  assertEquals(flags, ['repeated_vomiting'])
})

Deno.test('computeContextualFlags — repeated vomiting: 3 within 24h but spread out', () => {
  const flags = computeContextualFlags(baseCtx({
    recentVomitTimes: ['2026-05-24T12:00:00Z', '2026-05-24T02:00:00Z', '2026-05-23T16:00:00Z'],
  }))
  assertEquals(flags, ['repeated_vomiting'])
})

Deno.test('computeContextualFlags — single vomit does not flag repeat', () => {
  const flags = computeContextualFlags(baseCtx({ recentVomitTimes: ['2026-05-24T12:00:00Z'] }))
  assertEquals(flags, [])
})

Deno.test('computeContextualFlags — feline reduced intake (the foam-cat case)', () => {
  // Cat, tracks intake, no full/most meal in the window: must flag even though
  // the photo (handled elsewhere) looked benign.
  const flags = computeContextualFlags(baseCtx({
    species: 'cat',
    tracksIntake: true,
    hasRecentPositiveIntake: false,
  }))
  assertEquals(flags, ['feline_reduced_intake'])
})

Deno.test('computeContextualFlags — feline flag suppressed when owner does not track intake', () => {
  // Absence-of-log must not masquerade as anorexia (B-027 data caveat).
  const flags = computeContextualFlags(baseCtx({
    species: 'cat',
    tracksIntake: false,
    hasRecentPositiveIntake: false,
  }))
  assertEquals(flags, [])
})

Deno.test('computeContextualFlags — reduced intake does not flag for dogs', () => {
  const flags = computeContextualFlags(baseCtx({
    species: 'dog',
    tracksIntake: true,
    hasRecentPositiveIntake: false,
  }))
  assertEquals(flags, [])
})

Deno.test('computeContextualFlags — concurrent lethargy', () => {
  const flags = computeContextualFlags(baseCtx({ hasRecentLethargy: true }))
  assertEquals(flags, ['concurrent_lethargy'])
})

// ── applyEscalationFloor ──────────────────────────────────────────────────────

Deno.test('applyEscalationFloor — contextual flag forces worth_a_call over a benign photo read', () => {
  // The foam-cat: model saw clear foam and said monitor; the floor escalates.
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowVomit: true,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: ['feline_reduced_intake'],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — visual flag forces worth_a_call', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowVomit: true,
    hasPhoto: true,
    visualFlags: ['blood'],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — no photo, no contextual flag → not_enough_to_say', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowVomit: false,
    hasPhoto: false,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say')
})

Deno.test('applyEscalationFloor — no photo but contextual flag still escalates', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowVomit: false,
    hasPhoto: false,
    visualFlags: [],
    contextualFlags: ['repeated_vomiting'],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — photo not vomit → not_enough_to_say', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowVomit: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say')
})

Deno.test('applyEscalationFloor — clean photo, no flags → monitor (never reassuring)', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowVomit: true,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'monitor')
})

// ── buildContextualReadText ───────────────────────────────────────────────────

Deno.test('buildContextualReadText — feline intake takes priority', () => {
  const t = buildContextualReadText('Pixel', ['repeated_vomiting', 'feline_reduced_intake'])
  assertEquals(t.includes('Pixel'), true)
  assertEquals(t.toLowerCase().includes("hasn't eaten"), true)
})

Deno.test('buildContextualReadText — repeated vomiting', () => {
  const t = buildContextualReadText('Mochi', ['repeated_vomiting'])
  assertEquals(t.includes('Mochi'), true)
  assertEquals(t.toLowerCase().includes('more than once'), true)
})

// A test-only vocabulary check for Pattern 8 — applied ONLY to OUR deterministic
// templates (strings we control), to assert none of them reassure. This is NOT a
// runtime guard on the model's open-vocabulary output: B-060's runtime guarantee is
// STRUCTURAL (selectReadText only surfaces the model's words on the escalation path).
const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i

Deno.test('buildContextualReadText — never reassures', () => {
  for (const t of [
    buildContextualReadText('Mochi', ['feline_reduced_intake']),
    buildContextualReadText('Mochi', ['repeated_vomiting']),
    buildContextualReadText('Mochi', ['concurrent_lethargy']),
  ]) {
    assertEquals(REASSURE_VOCAB.test(t), false)
    assertEquals(t.includes('!'), false)
  }
})

// ── selectReadText — the load-bearing read selection (B-060) ───────────────────
// The model's free text reaches the owner ONLY when the recommendation escalates on a
// visual flag (it names a PRESENT concern — the safe direction). The monitor / no-flag
// path is the reassurance-on-absence risk and MUST be deterministic. This replaced a
// regex denylist that an adversarial pass proved too leaky to be the net (it missed
// ~86% of plausible model reassurance and nuked legitimate concern reads).

const base = {
  petName: 'Mochi',
  recommendation: 'monitor' as const,
  contextualFlags: [] as ('repeated_vomiting' | 'feline_reduced_intake' | 'concurrent_lethargy')[],
  visualFlags: [] as string[],
  modelReadText: null as string | null,
  photoUnreadable: false,
  hasPhoto: true,
}

Deno.test('selectReadText — monitor NEVER surfaces the model read, even a floridly reassuring one (the B-060 invariant)', () => {
  // The exact failure the denylist could not stop: a clean-photo monitor read where
  // the model asserts wellness. selectReadText discards it for the deterministic
  // template, BY CONSTRUCTION — no vocabulary matching involved.
  const out = selectReadText({
    ...base,
    recommendation: 'monitor',
    modelReadText: 'Mochi is totally fine — this is a typical hairball, nothing to worry about, looks completely benign and settled.',
  })
  assertEquals(out.includes('fine'), false)
  assertEquals(out.includes('benign'), false)
  assertEquals(out.toLowerCase().includes('hairball'), false)
  assertEquals(REASSURE_VOCAB.test(out), false)
  assertEquals(out.includes('Mochi'), true) // it's the forward-looking template
})

Deno.test('selectReadText — worth_a_call surfaces the model read (escalate on presence is the safe direction)', () => {
  const out = selectReadText({
    ...base,
    recommendation: 'worth_a_call',
    visualFlags: ['blood'],
    modelReadText: 'I can see what looks like fresh red blood. That is worth a call to your vet.',
  })
  assertEquals(out.includes('blood'), true)
})

Deno.test('selectReadText — worth_a_call with NO model read falls back to a flag-named template (still escalates)', () => {
  const out = selectReadText({
    ...base,
    recommendation: 'worth_a_call',
    visualFlags: ['suspected_foreign_material'],
    modelReadText: null,
  })
  assertEquals(out.toLowerCase().includes("doesn't look like food"), true)
  assertEquals(out.toLowerCase().includes('vet'), true)
})

Deno.test('selectReadText — a contextual flag overrides any model read', () => {
  const out = selectReadText({
    ...base,
    recommendation: 'worth_a_call',
    contextualFlags: ['feline_reduced_intake'],
    modelReadText: 'looks fine',
  })
  assertEquals(out.toLowerCase().includes("hasn't eaten"), true)
})

Deno.test('selectReadText — an unreadable photo never surfaces the model read', () => {
  const out = selectReadText({
    ...base,
    recommendation: 'not_enough_to_say',
    modelReadText: 'everything looks normal',
    photoUnreadable: true,
  })
  assertEquals(out.includes("couldn't read"), true)
})

Deno.test('selectReadText — not_enough_to_say (no photo) → the no-flag template', () => {
  const out = selectReadText({ ...base, recommendation: 'not_enough_to_say', hasPhoto: false })
  assertEquals(out.toLowerCase().includes('without a photo'), true)
})

Deno.test('selectReadText — every deterministic template it emits never reassures (Pattern 8)', () => {
  const templates = [
    selectReadText({ ...base, recommendation: 'monitor' }),
    selectReadText({ ...base, recommendation: 'worth_a_call', visualFlags: ['blood'], modelReadText: null }),
    selectReadText({ ...base, recommendation: 'worth_a_call', visualFlags: ['suspected_foreign_material'], modelReadText: null }),
    selectReadText({ ...base, recommendation: 'worth_a_call', visualFlags: ['blood', 'suspected_foreign_material'], modelReadText: null }),
    selectReadText({ ...base, recommendation: 'not_enough_to_say' }),
    selectReadText({ ...base, recommendation: 'not_enough_to_say', hasPhoto: false }),
    selectReadText({ ...base, recommendation: 'not_enough_to_say', photoUnreadable: true }),
    buildContextualReadText('Mochi', ['feline_reduced_intake']),
    buildContextualReadText('Mochi', ['repeated_vomiting']),
    buildContextualReadText('Mochi', ['concurrent_lethargy']),
  ]
  for (const t of templates) {
    assertEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
    assertEquals(t.includes('!'), false)
  }
})

// ── EN-0 (CUL-1130): the read states the record, and names the photo finding first ──────
// Flag-on only (vomitContextualRun). Pattern 8 over every string the EN-0 copy can build,
// Pattern 10 unchanged (the model's words never ride a contextual read), and the two reads
// the issue names, word for word.

type VFlag = 'repeated_vomiting' | 'feline_reduced_intake' | 'concurrent_lethargy'
const EN0_RECORDS: (IntakeRecord | undefined)[] = [
  undefined,
  ...(['before_vomit', 'before_read'] as const).flatMap((window) => [0, 1, 2, 6].map((mealsLogged) => ({ window, mealsLogged }))),
]
const FLAG_SETS: VFlag[][] = [
  ['feline_reduced_intake'], ['repeated_vomiting'], ['concurrent_lethargy'],
  ['repeated_vomiting', 'feline_reduced_intake', 'concurrent_lethargy'],
]
const VISUAL_SETS = [[], ['blood'], ['suspected_foreign_material'], ['blood', 'suspected_foreign_material']]

function en0Strings(): string[] {
  const out: string[] = []
  for (const pet of ['Mochi', '']) {
    for (const record of EN0_RECORDS) {
      for (const flags of FLAG_SETS) {
        out.push(buildEn0ContextualReadText(pet, flags, record))
        for (const visual of VISUAL_SETS) out.push(buildEn0PhotoFirstReadText(pet, flags, visual, record))
      }
    }
  }
  return out
}

Deno.test('EN-0 copy — every string it can build never reassures, never shouts, never concludes (Pattern 8)', () => {
  const all = en0Strings()
  assertEquals(all.length > 300, true)
  for (const t of all) {
    assertEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
    assertEquals(t.includes('!'), false, t)
    // The shipped conclusion, and any clause relative to the day the owner reads it (GAP-1).
    assertEquals(/hasn't eaten|\brecently\b|\byesterday\b|\btoday\b|\blast night\b/i.test(t), false, `concluded or dated: "${t}"`)
    assertEquals(/vet/.test(t), true, `no route to the vet: "${t}"`)
  }
})

Deno.test('EN-0 copy — the 8/19 read states the six unrated meals before the vomit', () => {
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', ['feline_reduced_intake'], { window: 'before_vomit', mealsLogged: 6 }),
    "6 meals are logged for Nyx in the 24 hours before this vomit, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('EN-0 copy — ate, vomited, then refused, read late: the record before the READ, said so', () => {
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', ['feline_reduced_intake'], { window: 'before_read', mealsLogged: 2 }),
    "2 meals are logged for Nyx in the 24 hours before I read this, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
  assertStrictEquals(
    buildEn0ContextualReadText('Nyx', ['feline_reduced_intake'], { window: 'before_vomit', mealsLogged: 0 }),
    "No meals are logged for Nyx in the 24 hours before this vomit. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('EN-0 copy — the 9/22 read names the possible foreign material first, then the meals', () => {
  assertStrictEquals(
    buildEn0PhotoFirstReadText('Nyx', ['feline_reduced_intake'], ['suspected_foreign_material'], { window: 'before_vomit', mealsLogged: 6 }),
    "I can see something that doesn't look like food in this photo. 6 meals are logged for Nyx in the 24 hours before this vomit, and none is marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later.",
  )
})

Deno.test('EN-0 copy — repeated vomiting and lethargy keep their shipped words', () => {
  for (const flags of [['repeated_vomiting'], ['concurrent_lethargy'], ['repeated_vomiting', 'concurrent_lethargy']] as VFlag[][]) {
    assertStrictEquals(buildEn0ContextualReadText('Mochi', flags), buildContextualReadText('Mochi', flags))
  }
})

const en0Ctx: ContextInput = {
  species: 'cat', recentVomitTimes: [], thisEventOccurredAt: '2026-09-22T01:30:00Z',
  hasRecentPositiveIntake: false, tracksIntake: true, hasRecentLethargy: false,
  intakeRecord: { window: 'before_vomit', mealsLogged: 6 },
}
const en0Base = { ...base, recommendation: 'worth_a_call' as const, contextualFlags: ['feline_reduced_intake'] as VFlag[] }
const MODEL_WORDS = 'MODEL WORDS: a totally normal hairball, nothing to worry about.'

Deno.test('EN-0 selection — a visual flag leads; the model\'s words never ride a contextual read (Pattern 10)', () => {
  const out = selectSharedReadText(en0VomitCopy(en0Ctx), { ...en0Base, visualFlags: ['blood'], modelReadText: MODEL_WORDS, modelEscalated: true })
  assertEquals(out.startsWith('I can see what looks like blood in this photo. 6 meals are logged'), true, out)
  assertEquals(out.includes('MODEL WORDS'), false)
})

Deno.test('EN-0 selection — the model\'s own call with no visual flag leads from a template ("the model\'s own call included")', () => {
  const out = selectSharedReadText(en0VomitCopy(en0Ctx), { ...en0Base, modelReadText: MODEL_WORDS, modelEscalated: true })
  assertEquals(out.startsWith('I can see something worth a closer look in this photo.'), true, out)
  assertEquals(out.includes('MODEL WORDS'), false)
})

Deno.test('EN-0 selection — no photo finding, no lead: a calm model read, an unreadable photo, no photo', () => {
  const plain = buildEn0ContextualReadText('Mochi', ['feline_reduced_intake'], en0Ctx.intakeRecord)
  const copy = en0VomitCopy(en0Ctx)
  assertStrictEquals(selectSharedReadText(copy, { ...en0Base, modelEscalated: false }), plain)
  assertStrictEquals(selectSharedReadText(copy, { ...en0Base, visualFlags: ['blood'], photoUnreadable: true, modelEscalated: true }), plain)
  assertStrictEquals(selectSharedReadText(copy, { ...en0Base, visualFlags: ['blood'], hasPhoto: false, modelEscalated: true }), plain)
})

Deno.test('EN-0 selection — every non-contextual path is VOMIT_COPY\'s, word for word', () => {
  const copy = en0VomitCopy(en0Ctx)
  for (const p of [
    { ...base, recommendation: 'monitor' as const },
    { ...base, recommendation: 'worth_a_call' as const, visualFlags: ['blood'], modelReadText: null },
    { ...base, recommendation: 'worth_a_call' as const, visualFlags: ['blood'], modelReadText: MODEL_WORDS },
    { ...base, recommendation: 'not_enough_to_say' as const },
    { ...base, recommendation: 'not_enough_to_say' as const, hasPhoto: false },
    { ...base, recommendation: 'not_enough_to_say' as const, photoUnreadable: true },
  ]) {
    assertStrictEquals(selectSharedReadText(copy, p), selectReadText(p))
  }
})

Deno.test('EN-0 gate — flag-off hands the pipeline the flags alone (VOMIT_COPY stands); flag-on, the EN-0 copy', () => {
  const off = vomitContextualRun(en0Ctx, { on: [], readOk: true })
  const failed = vomitContextualRun(en0Ctx, { on: [], readOk: false })
  assertEquals(off, ['feline_reduced_intake'])
  assertEquals(failed, ['feline_reduced_intake'])
  const on = vomitContextualRun(en0Ctx, { on: ['engines_v3_en0'], readOk: true })
  assertEquals(Array.isArray(on), false)
  if (Array.isArray(on)) return
  assertEquals(on.flags, ['feline_reduced_intake'])
  assertStrictEquals(on.copy.contextual('Nyx', on.flags), buildEn0ContextualReadText('Nyx', on.flags, en0Ctx.intakeRecord))
})

Deno.test('flag-off selection — a contextual read over a visual finding keeps the shipped contextual words', () => {
  // VOMIT_COPY has no photo-first template, so step 1 is unchanged for flag-off vomit.
  const out = selectReadText({ ...en0Base, visualFlags: ['blood'], modelReadText: MODEL_WORDS })
  assertStrictEquals(out, buildContextualReadText('Mochi', ['feline_reduced_intake']))
})

// ── buildAnalysisWriteBack — the never-clobber guard (B-028) ───────────────────
// The bit that was untested until this PR: a re-analysis of a row the owner has
// edited must refresh ONLY the read, never the structured clinical fields the vet
// report relies on. A regression here silently overwrites a human-corrected
// "Blood: fresh_red" back to the AI's "none_visible".

const sampleAnalysis: VomitAnalysis = {
  appears_to_show_vomit: true,
  colour: 'yellow',
  contents: ['bile', 'foam'],
  consistency: 'foamy',
  blood_present: 'none_visible',
  bile_present: 'yes',
  foreign_material_present: 'no',
  foreign_material_note: null,
  description: 'A small amount of yellow foam.',
  visual_flags: [],
  recommendation: 'monitor',
  read_text: 'This shows a small amount of yellow foam. Keep an eye on Mochi and call your vet if it keeps happening.',
  confidence: { colour: 0.9 },
}

const freshReadFields = {
  recommendation: 'worth_a_call' as const,
  read_text: 'Repeated vomiting — worth a call.',
  visual_flags: [],
  contextual_flags: ['repeated_vomiting' as const],
  status: 'completed',
  error: null,
}

Deno.test('buildAnalysisWriteBack — edited row: update mode, NO structured column touched', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'e1',
    petId: 'p1',
    analysis: sampleAnalysis,
    readFields: freshReadFields,
  })
  assertStrictEquals(wb.mode, 'update')
  // The never-clobber assertion: not a single structured field (or the cached
  // original) appears in the write — the owner's facts survive untouched.
  for (const key of STRUCTURED_FIELD_KEYS) {
    assertEquals(Object.prototype.hasOwnProperty.call(wb.values, key), false)
  }
  // But the read DID refresh — the floor can still re-escalate on worse context.
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
  assertEquals(wb.values.contextual_flags, ['repeated_vomiting'])
})

Deno.test('buildAnalysisWriteBack — un-edited row: full upsert with structured fields + cached payload', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    analysis: sampleAnalysis,
    readFields: freshReadFields,
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.blood_present, 'none_visible')
  assertStrictEquals(wb.values.colour, 'yellow')
  assertStrictEquals(wb.values.ai_raw_payload, sampleAnalysis)
  assertStrictEquals(wb.values.incident_type, 'vomit')
  // Read still refreshes on a first/un-edited write.
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('buildAnalysisWriteBack — un-edited row with a failed vision call still writes null fields', () => {
  // analysis === null (photo unreadable / no photo): the upsert must not throw and
  // must null the structured fields rather than carry stale ones.
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    analysis: null,
    readFields: { ...freshReadFields, recommendation: 'not_enough_to_say', status: 'uncertain', contextual_flags: [] },
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.ai_raw_payload, null)
  assertStrictEquals(wb.values.blood_present, null)
  assertStrictEquals(wb.values.recommendation, 'not_enough_to_say')
})

// ── presentFlagsFromStructured — the stored red flags a re-read may not take off (CUL-532, CUL-1201) ──

Deno.test('presentFlagsFromStructured (vomit) — the same answer as generate-signal\'s deriveIncidentFlags, every value', () => {
  // C-34: a mirrored rule must answer the same question. Home derives the red-flag card from
  // these columns; the re-read guard must see exactly the flags Home would show, or it
  // protects a flag Home never raised, or lets one Home did raise be erased.
  const bloods = ['none_visible', 'fresh_red', 'coffee_ground', 'unsure', null, 'not_an_enum_value']
  const tristates = ['yes', 'no', 'unsure', null]
  let checked = 0
  for (const blood of bloods) {
    for (const foreign of tristates) {
      const ours = presentFlagsFromStructured({ blood_present: blood, foreign_material_present: foreign })
      const home = deriveIncidentFlags({
        eventId: 'evt',
        incidentType: 'vomit',
        occurredAt: '2026-09-01T12:00:00Z',
        bloodPresent: blood,
        stoolBloodPresent: 'yes', // stool's column: must never count for a vomit row
        foreignMaterialPresent: foreign,
      })
      assertEquals(ours, home, `blood=${blood} foreign=${foreign}`)
      checked++
    }
  }
  assertStrictEquals(checked, 24)
})

Deno.test('presentFlagsFromStructured (vomit) — reads ONLY the columns step 3b selects (RED_FLAG_COLUMNS)', () => {
  // Non-vacuity: the selected columns alone produce every flag.
  assertEquals(presentFlagsFromStructured({ blood_present: 'fresh_red', foreign_material_present: 'yes' }), ['blood', 'foreign_material'])
  // Every other structured column set to a present-looking value, the red-flag columns
  // absent: nothing. A derivation that read an unselected column would see it here and
  // never on a real stored row, where only RED_FLAG_COLUMNS are fetched.
  const decoy: Record<string, unknown> = { stool_blood_present: 'yes' }
  for (const key of STRUCTURED_FIELD_KEYS) {
    if (!(RED_FLAG_COLUMNS as readonly string[]).includes(key)) decoy[key] = 'yes'
  }
  assertEquals(presentFlagsFromStructured(decoy), [])
})

Deno.test('presentFlagsFromStructured (vomit) — a stored ai_raw_payload maps through the column set to the same flags', () => {
  // The pipeline reads the model's original flags by running the stored payload through
  // buildStructuredValues; the full-upsert values are exactly that mapping.
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'evt',
    petId: 'pet',
    analysis: { ...sampleAnalysis, blood_present: 'coffee_ground', foreign_material_present: 'yes' },
    readFields: freshReadFields,
  })
  assertEquals(presentFlagsFromStructured(wb.values), ['blood', 'foreign_material'])
})
