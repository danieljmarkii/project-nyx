// Unit tests for extract-medication-from-photo pure helpers.
// Run with: deno test supabase/functions/extract-medication-from-photo/index.test.ts
//
// Covers the logic that turns raw Claude output into the medication_items write,
// plus the two safety invariants that make this NOT just "food for pills":
//   • B-122 — the tool schema exposes ONLY drug-product fields (no PII sink).
//   • §6.5  — a missing strength is preserved as null, never fabricated.
//   • B-123 — buildLabelPath pins to the caller uid and rejects path injection.
// Storage I/O, auth, and the HTTP handler are integration concerns tested manually.

import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  parseMedicationToolResult,
  normaliseConfidence,
  buildLabelPath,
  detectImageMediaType,
  MEDICATION_FORM_ENUM,
  MEDICATION_ROUTE_ENUM,
  EXTRACTION_TOOL,
  SYSTEM_PROMPT,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
  computeResetsAt,
  type MedicationExtraction,
  type FunctionCaps,
} from './index.ts'

// ── Cap + flag gate (T2-3) ────────────────────────────────────────────────────
// Med free caps are daily 10 / monthly 40 (§4.4).

const MED_CAPS: FunctionCaps = { daily: 10, monthly: 40 }

Deno.test('resolveGateState (med) — flag off → feature_disabled without an increment', () => {
  assertEquals(resolveGateState(false, null, MED_CAPS), { allow: false, reason: 'feature_disabled' })
})

Deno.test('resolveGateState (med) — 10th call proceeds, 11th blocked; monthly at 40/41', () => {
  assertEquals(resolveGateState(true, { dayCount: 10, monthCount: 12 }, MED_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 11, monthCount: 12 }, MED_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
  assertEquals(resolveGateState(true, { dayCount: 3, monthCount: 40 }, MED_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 3, monthCount: 41 }, MED_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'monthly',
  })
})

Deno.test('resolveGateState (med) — null counts (RPC fail-open) proceeds', () => {
  assertEquals(resolveGateState(true, null, MED_CAPS), { allow: true })
})

Deno.test('resolveFlagValue (med) — non-boolean falls back', () => {
  assertStrictEquals(resolveFlagValue(false, true), false)
  assertStrictEquals(resolveFlagValue(undefined, true), true)
  assertStrictEquals(resolveFlagValue('false', true), true)
})

Deno.test('resolveCaps (med) — partial override keeps the untouched default', () => {
  assertEquals(resolveCaps({ extract_medication: { monthly: 20 } }, 'extract_medication', MED_CAPS), {
    daily: 10, monthly: 20,
  })
  assertEquals(resolveCaps({}, 'extract_medication', MED_CAPS), MED_CAPS)
})

Deno.test('computeResetsAt (med) — UTC day / month boundaries', () => {
  const t = Date.parse('2026-02-14T09:00:00Z')
  assertStrictEquals(computeResetsAt('daily', t), '2026-02-15T00:00:00.000Z')
  assertStrictEquals(computeResetsAt('monthly', t), '2026-03-01T00:00:00.000Z')
})

const makeToolUseResponse = (input: Record<string, unknown>) => ({
  content: [
    { type: 'tool_use' as const, id: 'toolu_01med', name: 'extract_medication_data', input },
  ],
  stop_reason: 'tool_use',
})

// ── B-122: the schema cannot absorb owner/pet/clinic PII ──────────────────────

Deno.test('EXTRACTION_TOOL — property set is drug-product-only (no PII sink) [B-122]', () => {
  // The medication_items row is globally readable, so the schema must have NO
  // free-text field that could capture the pet name, owner name, clinic, address,
  // Rx number, or directions. Lock the exact property set; adding `notes`,
  // `directions`, `sig`, `raw_text`, `patient`, etc. fails here on purpose.
  const props = Object.keys(EXTRACTION_TOOL.input_schema.properties).sort()
  assertEquals(props, ['brand_name', 'confidence', 'form', 'generic_name', 'is_prescription', 'route', 'strength'])
})

Deno.test('EXTRACTION_TOOL — never advertises a free-text/PII field name [B-122]', () => {
  const forbidden = ['notes', 'directions', 'sig', 'raw_text', 'text', 'instructions', 'patient', 'owner', 'client', 'clinic', 'prescriber', 'rx_number', 'address']
  const props = Object.keys(EXTRACTION_TOOL.input_schema.properties)
  for (const f of forbidden) {
    assertEquals(props.includes(f), false, `schema must not expose "${f}"`)
  }
})

Deno.test('SYSTEM_PROMPT — forbids transcribing patient/owner/clinic identity [B-122]', () => {
  const p = SYSTEM_PROMPT.toLowerCase()
  assertEquals(p.includes('never transcribe') || p.includes('never transcribe or extract'), true)
  assertEquals(p.includes('owner'), true)
  assertEquals(p.includes('clinic'), true)
})

Deno.test('SYSTEM_PROMPT — flags strength as safety-critical / no-guess [§6.5]', () => {
  const p = SYSTEM_PROMPT.toLowerCase()
  assertEquals(p.includes('safety-critical') || p.includes('safety critical'), true)
  assertEquals(p.includes('never infer, round, convert, or guess') || p.includes('never infer'), true)
})

// ── parseMedicationToolResult ─────────────────────────────────────────────────

Deno.test('parseMedicationToolResult — returns null with no tool_use block', () => {
  const res = { content: [{ type: 'text' as const, text: 'no tool here' }], stop_reason: 'end_turn' }
  assertEquals(parseMedicationToolResult(res), null)
})

Deno.test('parseMedicationToolResult — returns null when tool name does not match', () => {
  const res = {
    content: [{ type: 'tool_use' as const, id: 'x', name: 'some_other_tool', input: {} }],
    stop_reason: 'tool_use',
  }
  assertEquals(parseMedicationToolResult(res), null)
})

Deno.test('parseMedicationToolResult — full extraction maps every field', () => {
  const result = parseMedicationToolResult(makeToolUseResponse({
    generic_name: 'prednisolone',
    brand_name: 'Pred',
    strength: '5 mg',
    form: 'tablet',
    route: 'oral',
    is_prescription: true,
    confidence: { generic_name: 0.98, brand_name: 0.8, strength: 0.95, form: 0.9, route: 0.85, is_prescription: 0.9 },
  })) as MedicationExtraction

  assertStrictEquals(result.generic_name, 'prednisolone')
  assertStrictEquals(result.brand_name, 'Pred')
  assertStrictEquals(result.strength, '5 mg')
  assertStrictEquals(result.form, 'tablet')
  assertStrictEquals(result.route, 'oral')
  assertStrictEquals(result.is_prescription, true)
  assertStrictEquals(result.confidence.strength, 0.95)
})

Deno.test('parseMedicationToolResult — optional fields absent default to null', () => {
  const result = parseMedicationToolResult(makeToolUseResponse({
    generic_name: 'gabapentin',
    confidence: { generic_name: 0.9 },
  })) as MedicationExtraction

  assertStrictEquals(result.brand_name, null)
  assertStrictEquals(result.strength, null)
  assertStrictEquals(result.form, null)
  assertStrictEquals(result.route, null)
  assertStrictEquals(result.is_prescription, null)
  // Confidence holes normalise to 0
  assertStrictEquals(result.confidence.strength, 0)
})

Deno.test('parseMedicationToolResult — strength is never fabricated [§6.5]', () => {
  // The dosing-hazard invariant: an empty/whitespace/non-string strength stays
  // null so the confirm screen treats it as "nothing to trust", never a
  // confirmed-blank dose.
  for (const bad of ['', '   ', null, undefined, 5, {}]) {
    const result = parseMedicationToolResult(makeToolUseResponse({
      generic_name: 'maropitant', strength: bad as unknown,
      confidence: { generic_name: 0.9 },
    })) as MedicationExtraction
    assertStrictEquals(result.strength, null)
  }
})

Deno.test('parseMedicationToolResult — strength is trimmed but otherwise verbatim', () => {
  const result = parseMedicationToolResult(makeToolUseResponse({
    generic_name: 'insulin', strength: '  40 IU/mL ',
    confidence: { generic_name: 0.9 },
  })) as MedicationExtraction
  assertStrictEquals(result.strength, '40 IU/mL')
})

Deno.test('parseMedicationToolResult — hallucinated form/route drop to null', () => {
  const result = parseMedicationToolResult(makeToolUseResponse({
    generic_name: 'apoquel', form: 'gummy', route: 'telepathic',
    confidence: { generic_name: 0.9 },
  })) as MedicationExtraction
  assertStrictEquals(result.form, null)
  assertStrictEquals(result.route, null)
})

Deno.test('parseMedicationToolResult — every valid form/route value survives', () => {
  for (const form of MEDICATION_FORM_ENUM) {
    const r = parseMedicationToolResult(makeToolUseResponse({ generic_name: 'x', form })) as MedicationExtraction
    assertStrictEquals(r.form, form)
  }
  for (const route of MEDICATION_ROUTE_ENUM) {
    const r = parseMedicationToolResult(makeToolUseResponse({ generic_name: 'x', route })) as MedicationExtraction
    assertStrictEquals(r.route, route)
  }
})

Deno.test('parseMedicationToolResult — non-boolean is_prescription drops to null (keeps table default)', () => {
  // The table default is TRUE; the handler only writes is_prescription when this
  // is a real boolean, so a string/"null" must parse to null, not false.
  for (const bad of ['true', 'null', 1, 0]) {
    const r = parseMedicationToolResult(makeToolUseResponse({
      generic_name: 'x', is_prescription: bad as unknown,
    })) as MedicationExtraction
    assertStrictEquals(r.is_prescription, null)
  }
})

// ── normaliseConfidence ───────────────────────────────────────────────────────

Deno.test('normaliseConfidence — fills missing fields with 0', () => {
  assertEquals(normaliseConfidence({}), {
    generic_name: 0, brand_name: 0, strength: 0, form: 0, route: 0, is_prescription: 0,
  })
})

Deno.test('normaliseConfidence — clamps out-of-range and non-finite values', () => {
  const r = normaliseConfidence({ generic_name: 1.5, strength: -0.2, form: NaN as unknown as number })
  assertStrictEquals(r.generic_name, 1)
  assertStrictEquals(r.strength, 0)
  assertStrictEquals(r.form, 0)
})

// ── buildLabelPath (B-123 path-injection guard) ───────────────────────────────

Deno.test('buildLabelPath — pins the caller uid as the first segment', () => {
  assertStrictEquals(buildLabelPath('user-1', 'item-9'), 'user-1/item-9/0-label.jpg')
})

Deno.test('buildLabelPath — rejects empty uid / item id', () => {
  assertThrows(() => buildLabelPath('', 'item-9'))
  assertThrows(() => buildLabelPath('user-1', ''))
})

Deno.test('buildLabelPath — rejects slash / backslash / traversal in any segment [B-123]', () => {
  // A path segment that smuggles a '/' could shift what foldername[1] returns and
  // break the RLS prefix; '..' is traversal. All must throw.
  assertThrows(() => buildLabelPath('../victim', 'item-9'))
  assertThrows(() => buildLabelPath('user-1', 'a/b'))
  assertThrows(() => buildLabelPath('user-1', 'item-9', 'a/../b'))
  assertThrows(() => buildLabelPath('user-1', 'item-9', 'x\\y'))
})

// ── detectImageMediaType ──────────────────────────────────────────────────────

Deno.test('detectImageMediaType — sniffs jpeg and png magic bytes', () => {
  assertStrictEquals(detectImageMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png')
  // Unknown defaults to jpeg (Claude surfaces a clear 400 if truly unreadable).
  assertStrictEquals(detectImageMediaType(new Uint8Array([0x00, 0x01])), 'image/jpeg')
})
