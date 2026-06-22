// Unit tests for analyze-vomit pure helpers.
// Run with: deno test supabase/functions/analyze-vomit/index.test.ts
//
// Covers the logic that is clinically load-bearing and not exercised by the
// vision model itself: tool-result parsing/sanitising, the deterministic
// contextual-flag computation, the escalation floor (incl. the never-reassure
// invariant), and the contextual read-text override. Storage I/O, the Claude
// call, and the HTTP handler are integration concerns verified manually.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  parseAnalysisToolResult,
  computeContextualFlags,
  applyEscalationFloor,
  buildContextualReadText,
  buildAnalysisWriteBack,
  STRUCTURED_FIELD_KEYS,
  detectImageMediaType,
  type ContextInput,
  type VomitAnalysis,
} from './index.ts'

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
    read_text: "This one doesn't show anything obviously concerning on its own.",
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

Deno.test('buildContextualReadText — never reassures', () => {
  for (const t of [
    buildContextualReadText('Mochi', ['feline_reduced_intake']),
    buildContextualReadText('Mochi', ['repeated_vomiting']),
    buildContextualReadText('Mochi', ['concurrent_lethargy']),
  ]) {
    assertEquals(/\b(fine|okay|ok|healthy|nothing to worry)\b/i.test(t), false)
    assertEquals(t.includes('!'), false)
  }
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
  read_text: "This one doesn't show anything obviously concerning on its own.",
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
