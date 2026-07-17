// Unit tests for analyze-stool pure helpers.
// Run with: deno test supabase/functions/analyze-stool/index.test.ts
//
// Covers the logic that is clinically load-bearing and not exercised by the
// vision model itself: tool-result parsing/sanitising, the deterministic
// contextual-flag computation (repeated_loose_stool / concurrent_vomiting /
// concurrent_lethargy), the escalation floor (incl. the never-reassure
// invariant), the contextual read-text override, and — MANDATORY per D2, NOT
// inherited from vomit — the reassurance-word / exclamation-mark regex over
// every stool template. Storage I/O, the Claude call, and the HTTP handler are
// integration concerns verified manually + by the boot smoke test at deploy.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import {
  parseAnalysisToolResult,
  computeContextualFlags,
  applyEscalationFloor,
  buildContextualReadText,
  selectReadText,
  buildAnalysisWriteBack,
  STRUCTURED_FIELD_KEYS,
  detectImageMediaType,
  bytesToBase64,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
  type StoolContextInput,
  type StoolAnalysis,
  type FunctionCaps,
} from './index.ts'

// ── Cap + flag gate (T2-3) ────────────────────────────────────────────────────
// analyze-stool free caps mirror vomit: daily 10 / monthly 200, identical across
// tiers (D-M2 — the cap gates the descriptive read only, never the escalation).

const STOOL_CAPS: FunctionCaps = { daily: 10, monthly: 200 }

Deno.test('resolveGateState (stool) — flag off → feature_disabled (no increment)', () => {
  assertEquals(resolveGateState(false, null, STOOL_CAPS), { allow: false, reason: 'feature_disabled' })
})

Deno.test('resolveGateState (stool) — 10th read proceeds, 11th capped; monthly at 200/201', () => {
  assertEquals(resolveGateState(true, { dayCount: 10, monthCount: 15 }, STOOL_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 11, monthCount: 15 }, STOOL_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 200 }, STOOL_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 201 }, STOOL_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'monthly',
  })
})

Deno.test('resolveGateState (stool) — RPC error (null counts) fails open to allow', () => {
  assertEquals(resolveGateState(true, null, STOOL_CAPS), { allow: true })
})

Deno.test('resolveFlagValue / resolveCaps (stool) — fallbacks + partial override', () => {
  assertStrictEquals(resolveFlagValue(undefined, true), true)
  assertStrictEquals(resolveFlagValue(false, true), false)
  assertEquals(resolveCaps({ analyze_stool: { daily: 3 } }, 'analyze_stool', STOOL_CAPS), { daily: 3, monthly: 200 })
})

// ── The reorder invariant: escalation SURVIVES the cap (§5.4, adversarial target) ──
// When capped/flagged-off the handler skips vision and runs the floor with NO
// visual flags. These pin, at the pure-helper level the handler composes, that a
// fired CONTEXTUAL flag still forces worth_a_call and that NO capped path can
// produce a reassuring verdict — the never-reassure guarantee under the cap. The
// stool repeat flag is pre-vision + owner-classified, so it fires here too.

Deno.test('capped path — a fired contextual flag still forces worth_a_call (no vision, no visual flags)', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowStool: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: ['repeated_loose_stool'],
  })
  assertStrictEquals(rec, 'worth_a_call')
  const read = selectReadText({
    petName: 'Nyx',
    recommendation: rec,
    contextualFlags: ['repeated_loose_stool'],
    visualFlags: [],
    modelReadText: 'this looks totally fine and healthy', // must NOT surface on this path
    photoUnreadable: false,
    hasPhoto: true,
  })
  assertStrictEquals(read.includes('fine'), false)
  assertStrictEquals(read.includes('healthy'), false)
  assertStrictEquals(read, buildContextualReadText('Nyx', ['repeated_loose_stool']))
})

Deno.test('capped escalation over a prior real analysis — update mode, structured red flags PRESERVED (never-clobber)', () => {
  // A capped/flag-off contextual escalation carries analysis=null (no model ran).
  // A prior REAL analysis (humanEdited OR completed/uncertain) must route through
  // preserveStructured=true → update-read-fields-only, so a prior model-detected
  // blood/foreign finding is never nulled out of the vet report.
  const readFields = {
    recommendation: 'worth_a_call' as const,
    read_text: 'Nyx has had more than one loose stool in a short window.',
    visual_flags: [] as string[],
    contextual_flags: ['repeated_loose_stool' as const],
    status: 'completed',
    error: null,
  }
  const wb = buildAnalysisWriteBack({
    humanEdited: true, // preserveStructured (humanEdited || existingRealAnalysis)
    eventId: 'evt-1',
    petId: 'pet-1',
    incidentType: 'diarrhea',
    analysis: null,
    readFields,
  })
  assertStrictEquals(wb.mode, 'update')
  for (const k of STRUCTURED_FIELD_KEYS) {
    assertStrictEquals(Object.prototype.hasOwnProperty.call(wb.values, k), false)
  }
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('capped path — no contextual flag → floor is NOT an escalation (state row, not worth_a_call)', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowStool: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say')
})

// ── bytesToBase64 / detectImageMediaType (shared, ship inlined into this bundle) ──

Deno.test('bytesToBase64 — known vectors incl. padding', () => {
  const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s))
  assertStrictEquals(enc('Man'), 'TWFu')
  assertStrictEquals(enc('Ma'), 'TWE=')
  assertStrictEquals(enc('M'), 'TQ==')
  assertStrictEquals(bytesToBase64(new Uint8Array([])), '')
})

Deno.test('bytesToBase64 — matches std across the 32 KB chunk boundary', () => {
  const n = 100_003
  const bytes = new Uint8Array(n)
  let x = 0x9e3779b9
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    bytes[i] = x & 0xff
  }
  assertStrictEquals(bytesToBase64(bytes), encodeBase64(bytes))
})

Deno.test('detectImageMediaType — JPEG / PNG / WebP / unknown', () => {
  assertStrictEquals(detectImageMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png')
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  assertStrictEquals(detectImageMediaType(webp), 'image/webp')
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x00, 0x01, 0x02, 0x03])), 'image/jpeg')
})

// ── parseAnalysisToolResult ───────────────────────────────────────────────────

const makeToolUse = (input: Record<string, unknown>) => ({
  content: [{ type: 'tool_use' as const, id: 'toolu_t', name: 'analyze_stool', input }],
  stop_reason: 'tool_use',
})

Deno.test('parseAnalysisToolResult — null when no tool_use / name mismatch', () => {
  assertEquals(parseAnalysisToolResult({ content: [{ type: 'text' as const, text: 'hi' }], stop_reason: 'end_turn' }), null)
  const res = makeToolUse({})
  res.content[0].name = 'analyze_vomit'
  assertEquals(parseAnalysisToolResult(res), null)
})

Deno.test('parseAnalysisToolResult — full parse', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_stool: true,
    consistency: 'type_6_mushy',
    colour: 'brown',
    contents: ['undigested_food', 'hair'],
    blood_present: 'no',
    mucus_present: 'yes',
    foreign_material_present: 'no',
    description: 'Soft, mushy stool with a little undigested food.',
    visual_flags: [],
    recommendation: 'monitor',
    read_text: 'Soft and unformed. Keep an eye on Cooper and call your vet if it keeps happening.',
    confidence: { consistency: 0.9 },
  }))!
  assertStrictEquals(r.appears_to_show_stool, true)
  assertStrictEquals(r.consistency, 'type_6_mushy')
  assertStrictEquals(r.colour, 'brown')
  assertEquals(r.contents, ['undigested_food', 'hair'])
  assertStrictEquals(r.mucus_present, 'yes')
  assertStrictEquals(r.recommendation, 'monitor')
})

Deno.test('parseAnalysisToolResult — blood_type kept only when blood_present=yes', () => {
  const withBlood = parseAnalysisToolResult(makeToolUse({
    appears_to_show_stool: true, blood_present: 'yes', blood_type: 'dark_tarry', recommendation: 'worth_a_call',
  }))!
  assertStrictEquals(withBlood.blood_present, 'yes')
  assertStrictEquals(withBlood.blood_type, 'dark_tarry')
  // blood_type is meaningless (and dropped) when blood is not present — stops the
  // colour/blood fields drifting apart.
  const noBlood = parseAnalysisToolResult(makeToolUse({
    appears_to_show_stool: true, blood_present: 'no', blood_type: 'fresh_red', recommendation: 'monitor',
  }))!
  assertStrictEquals(noBlood.blood_present, 'no')
  assertStrictEquals(noBlood.blood_type, null)
})

Deno.test('parseAnalysisToolResult — drops hallucinated enum values, incl. a bogus "mucus" visual flag', () => {
  const r = parseAnalysisToolResult(makeToolUse({
    appears_to_show_stool: true,
    consistency: 'type_9_liquid_plus', // not a Bristol value
    colour: 'chartreuse',              // not a valid colour
    contents: ['hair', 'lava'],        // 'lava' filtered
    blood_present: 'maybe',            // invalid → null
    visual_flags: ['mucus', 'blood'],  // 'mucus' is NOT an escalating flag → filtered
    recommendation: 'all_clear',       // invalid → default not_enough_to_say
  }))!
  assertStrictEquals(r.consistency, null)
  assertStrictEquals(r.colour, null)
  assertEquals(r.contents, ['hair'])
  assertStrictEquals(r.blood_present, null)
  assertEquals(r.visual_flags, ['blood']) // mucus dropped — it can never force escalation
  assertStrictEquals(r.recommendation, 'not_enough_to_say')
})

Deno.test('parseAnalysisToolResult — appears_to_show_stool defaults false', () => {
  const r = parseAnalysisToolResult(makeToolUse({ recommendation: 'not_enough_to_say' }))!
  assertStrictEquals(r.appears_to_show_stool, false)
  assertStrictEquals(r.contents, null)
})

// ── computeContextualFlags ────────────────────────────────────────────────────

const baseCtx = (over: Partial<StoolContextInput>): StoolContextInput => ({
  recentLooseStoolTimes: ['2026-07-17T12:00:00Z'],
  thisEventOccurredAt: '2026-07-17T12:00:00Z',
  hasRecentVomiting: false,
  hasRecentLethargy: false,
  ...over,
})

Deno.test('computeContextualFlags — repeated loose stool: 2 within 24h fires', () => {
  const flags = computeContextualFlags(baseCtx({
    recentLooseStoolTimes: ['2026-07-17T12:00:00Z', '2026-07-17T02:00:00Z'],
  }))
  assertEquals(flags, ['repeated_loose_stool'])
})

Deno.test('computeContextualFlags — a single loose stool does NOT escalate (single Type-7 is monitor-tier)', () => {
  const flags = computeContextualFlags(baseCtx({ recentLooseStoolTimes: ['2026-07-17T12:00:00Z'] }))
  assertEquals(flags, [])
})

Deno.test('computeContextualFlags — two loose stools but >24h apart do not fire', () => {
  const flags = computeContextualFlags(baseCtx({
    recentLooseStoolTimes: ['2026-07-17T12:00:00Z', '2026-07-16T06:00:00Z'], // 30h earlier
  }))
  assertEquals(flags, [])
})

Deno.test('computeContextualFlags — concurrent vomiting', () => {
  const flags = computeContextualFlags(baseCtx({ hasRecentVomiting: true }))
  assertEquals(flags, ['concurrent_vomiting'])
})

Deno.test('computeContextualFlags — concurrent lethargy', () => {
  const flags = computeContextualFlags(baseCtx({ hasRecentLethargy: true }))
  assertEquals(flags, ['concurrent_lethargy'])
})

Deno.test('computeContextualFlags — all three compose (order: repeat, vomiting, lethargy)', () => {
  const flags = computeContextualFlags(baseCtx({
    recentLooseStoolTimes: ['2026-07-17T12:00:00Z', '2026-07-17T03:00:00Z'],
    hasRecentVomiting: true,
    hasRecentLethargy: true,
  }))
  assertEquals(flags, ['repeated_loose_stool', 'concurrent_vomiting', 'concurrent_lethargy'])
})

// ── applyEscalationFloor ──────────────────────────────────────────────────────

Deno.test('applyEscalationFloor — contextual flag forces worth_a_call over a benign photo read', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowStool: true,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: ['concurrent_vomiting'],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — visual flag (blood) forces worth_a_call', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowStool: true,
    hasPhoto: true,
    visualFlags: ['blood'],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — a single watery stool with mucus but no flags → monitor (never reassuring)', () => {
  // The seam ruling in floor terms: a Type-7 photo with mucus_present=yes but no
  // blood/foreign (empty visualFlags) and no repeat (empty contextualFlags) is
  // monitor — NOT an escalation on its own, and NOT an all-clear.
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowStool: true,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'monitor')
})

Deno.test('applyEscalationFloor — no photo but contextual flag still escalates', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowStool: false,
    hasPhoto: false,
    visualFlags: [],
    contextualFlags: ['repeated_loose_stool'],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('applyEscalationFloor — photo not stool → not_enough_to_say', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowStool: false,
    hasPhoto: true,
    visualFlags: [],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'not_enough_to_say')
})

// ── buildContextualReadText — priority + never-reassure ───────────────────────

Deno.test('buildContextualReadText — concurrent vomiting takes priority (fluid-loss lead)', () => {
  const t = buildContextualReadText('Pixel', ['repeated_loose_stool', 'concurrent_vomiting', 'concurrent_lethargy'])
  assertEquals(t.includes('Pixel'), true)
  assertEquals(t.toLowerCase().includes('vomiting'), true)
})

Deno.test('buildContextualReadText — repeated loose stool when no vomiting', () => {
  const t = buildContextualReadText('Cooper', ['repeated_loose_stool', 'concurrent_lethargy'])
  assertEquals(t.toLowerCase().includes('more than one loose stool'), true)
})

// The reassurance / exclamation vocabulary gate — applied to OUR deterministic
// templates only (strings we control), MANDATORY for this new descriptor (D2 —
// NOT inherited from vomit). It is not a runtime guard on the model's
// open-vocabulary output; that guarantee is STRUCTURAL (selectReadText surfaces
// the model's words only on the escalation path).
const REASSURE_VOCAB =
  /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i

Deno.test('buildContextualReadText — never reassures', () => {
  for (const t of [
    buildContextualReadText('Cooper', ['concurrent_vomiting']),
    buildContextualReadText('Cooper', ['repeated_loose_stool']),
    buildContextualReadText('Cooper', ['concurrent_lethargy']),
  ]) {
    assertEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
    assertEquals(t.includes('!'), false)
  }
})

// ── selectReadText — the load-bearing read selection (B-060) ───────────────────

const base = {
  petName: 'Cooper',
  recommendation: 'monitor' as const,
  contextualFlags: [] as ('repeated_loose_stool' | 'concurrent_vomiting' | 'concurrent_lethargy')[],
  visualFlags: [] as string[],
  modelReadText: null as string | null,
  photoUnreadable: false,
  hasPhoto: true,
}

Deno.test('selectReadText — monitor NEVER surfaces the model read, even a floridly reassuring one (B-060)', () => {
  const out = selectReadText({
    ...base,
    recommendation: 'monitor',
    modelReadText: 'Cooper is totally fine — this is a normal healthy stool, nothing to worry about at all.',
  })
  assertEquals(out.includes('fine'), false)
  assertEquals(out.toLowerCase().includes('healthy'), false)
  assertEquals(REASSURE_VOCAB.test(out), false)
  assertEquals(out.includes('Cooper'), true)
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

Deno.test('selectReadText — worth_a_call with NO model read falls back to a flag-named template', () => {
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
    contextualFlags: ['concurrent_vomiting'],
    modelReadText: 'looks fine',
  })
  assertEquals(out.toLowerCase().includes('vomiting'), true)
  assertEquals(out.includes('fine'), false)
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
    buildContextualReadText('Cooper', ['concurrent_vomiting']),
    buildContextualReadText('Cooper', ['repeated_loose_stool']),
    buildContextualReadText('Cooper', ['concurrent_lethargy']),
  ]
  for (const t of templates) {
    assertEquals(REASSURE_VOCAB.test(t), false, `reassured: "${t}"`)
    assertEquals(t.includes('!'), false)
  }
})

// ── buildAnalysisWriteBack — the never-clobber guard (B-028) ───────────────────

const sampleAnalysis: StoolAnalysis = {
  appears_to_show_stool: true,
  consistency: 'type_6_mushy',
  colour: 'brown',
  contents: ['undigested_food'],
  blood_present: 'no',
  blood_type: null,
  mucus_present: 'yes',
  foreign_material_present: 'no',
  foreign_material_note: null,
  description: 'Soft, mushy stool with a little undigested food.',
  visual_flags: [],
  recommendation: 'monitor',
  read_text: 'Soft and unformed. Keep an eye on Cooper and call your vet if it keeps happening.',
  confidence: { consistency: 0.9 },
}

const freshReadFields = {
  recommendation: 'worth_a_call' as const,
  read_text: 'Repeated loose stool — worth a call.',
  visual_flags: [],
  contextual_flags: ['repeated_loose_stool' as const],
  status: 'completed',
  error: null,
}

Deno.test('buildAnalysisWriteBack — edited row: update mode, NO structured column touched', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 'diarrhea',
    analysis: sampleAnalysis,
    readFields: freshReadFields,
  })
  assertStrictEquals(wb.mode, 'update')
  for (const key of STRUCTURED_FIELD_KEYS) {
    assertEquals(Object.prototype.hasOwnProperty.call(wb.values, key), false)
  }
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
  assertEquals(wb.values.contextual_flags, ['repeated_loose_stool'])
})

Deno.test('buildAnalysisWriteBack — un-edited row: full upsert with stool fields + incident_type', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 'stool_normal',
    analysis: sampleAnalysis,
    readFields: freshReadFields,
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.stool_consistency, 'type_6_mushy')
  assertStrictEquals(wb.values.stool_colour, 'brown')
  assertStrictEquals(wb.values.stool_mucus_present, 'yes')
  assertStrictEquals(wb.values.ai_raw_payload, sampleAnalysis)
  assertStrictEquals(wb.values.incident_type, 'stool_normal')
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('buildAnalysisWriteBack — un-edited row with a failed vision call still writes null fields', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 'diarrhea',
    analysis: null,
    readFields: { ...freshReadFields, recommendation: 'not_enough_to_say', status: 'uncertain', contextual_flags: [] },
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.ai_raw_payload, null)
  assertStrictEquals(wb.values.stool_consistency, null)
  assertStrictEquals(wb.values.stool_blood_present, null)
  assertStrictEquals(wb.values.recommendation, 'not_enough_to_say')
})
