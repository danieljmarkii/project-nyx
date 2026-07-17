// Unit tests for the shared incident-analysis pipeline's FRAMEWORK invariants
// (B-247 PR 2, D2). Run with: deno test supabase/functions/_shared/
//
// Scope discipline: analyze-vomit's own suite (passing unmodified — the PR 2
// AC) already exercises every helper through the vomit wrappers, so these
// tests pin only what a per-type suite structurally cannot:
//   - the escalation-floor MECHANISM independent of any type's flag vocabulary,
//   - selectReadText's selection ORDER with a sentinel copy (model text
//     surfaces ONLY on the visual-flag escalation path — B-060),
//   - the write-back's exact update-branch key set and the framework-owned
//     identity keys beating a descriptor's structuredValues.
// Per-type copy content (reassurance-regex, Pattern 8) stays in each
// function's own suite — it is per-descriptor by design, never inherited.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyEscalationFloor,
  selectReadText,
  buildAnalysisWriteBack,
  getToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  type IncidentCopy,
  type AnalysisReadFields,
} from './incident-analysis.ts'

// ── applyEscalationFloor — the mechanism a descriptor cannot weaken ───────────

Deno.test('floor — a contextual flag forces worth_a_call even with no photo and no subject', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'not_enough_to_say',
    appearsToShowSubject: false,
    hasPhoto: false,
    visualFlags: [],
    contextualFlags: ['any_contextual_flag'],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('floor — a visual flag forces worth_a_call over a benign model read', () => {
  const rec = applyEscalationFloor({
    modelRecommendation: 'monitor',
    appearsToShowSubject: true,
    hasPhoto: true,
    visualFlags: ['any_visual_flag'],
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('floor — no flags: model can escalate but the quiet outcome is monitor, never anything reassuring', () => {
  const base = { appearsToShowSubject: true, hasPhoto: true, visualFlags: [], contextualFlags: [] }
  assertStrictEquals(applyEscalationFloor({ ...base, modelRecommendation: 'worth_a_call' }), 'worth_a_call')
  assertStrictEquals(applyEscalationFloor({ ...base, modelRecommendation: 'monitor' }), 'monitor')
})

Deno.test('floor — not-the-subject / no-photo collapse to not_enough_to_say', () => {
  assertStrictEquals(
    applyEscalationFloor({
      modelRecommendation: 'monitor',
      appearsToShowSubject: false,
      hasPhoto: true,
      visualFlags: [],
      contextualFlags: [],
    }),
    'not_enough_to_say',
  )
  assertStrictEquals(
    applyEscalationFloor({
      modelRecommendation: 'monitor',
      appearsToShowSubject: true,
      hasPhoto: false,
      visualFlags: [],
      contextualFlags: [],
    }),
    'not_enough_to_say',
  )
})

// ── selectReadText — the B-060 selection order, pinned with a sentinel copy ───
// Each template returns a distinct sentinel so the assertion is about WHICH
// branch ran, independent of any real copy.

const SENTINEL_COPY: IncidentCopy = {
  contextual: (pet, flags) => `CONTEXTUAL:${pet}:${flags.join(',')}`,
  photoUnreadable: (pet) => `UNREADABLE:${pet}`,
  monitor: (pet) => `MONITOR:${pet}`,
  visualFlagFallback: (pet, flags) => `VISUAL_FALLBACK:${pet}:${flags.join(',')}`,
  noFlag: (pet, hasPhoto) => `NO_FLAG:${pet}:${hasPhoto}`,
}

const MODEL_TEXT = 'MODEL_SAYS: everything is wonderful' // must only ever surface on escalation

const readBase = {
  petName: 'Pet',
  recommendation: 'monitor' as const,
  contextualFlags: [] as string[],
  visualFlags: [] as string[],
  modelReadText: MODEL_TEXT,
  photoUnreadable: false,
  hasPhoto: true,
}

Deno.test('selectReadText — monitor path NEVER surfaces the model text (reassurance-on-absence risk)', () => {
  const out = selectReadText(SENTINEL_COPY, { ...readBase, recommendation: 'monitor' })
  assertStrictEquals(out, 'MONITOR:Pet')
})

Deno.test('selectReadText — the ONLY path that surfaces model text is worth_a_call with no contextual flag', () => {
  const out = selectReadText(SENTINEL_COPY, {
    ...readBase,
    recommendation: 'worth_a_call',
    visualFlags: ['blood'],
  })
  assertStrictEquals(out, MODEL_TEXT)
})

Deno.test('selectReadText — a contextual flag overrides the model text even on worth_a_call', () => {
  const out = selectReadText(SENTINEL_COPY, {
    ...readBase,
    recommendation: 'worth_a_call',
    contextualFlags: ['ctx_flag'],
    visualFlags: ['blood'],
  })
  assertStrictEquals(out, 'CONTEXTUAL:Pet:ctx_flag')
})

Deno.test('selectReadText — an unreadable photo beats even an escalating recommendation (no model text)', () => {
  const out = selectReadText(SENTINEL_COPY, {
    ...readBase,
    recommendation: 'worth_a_call',
    photoUnreadable: true,
  })
  assertStrictEquals(out, 'UNREADABLE:Pet')
})

Deno.test('selectReadText — worth_a_call with a null model read falls back to the visual-flag template', () => {
  const out = selectReadText(SENTINEL_COPY, {
    ...readBase,
    recommendation: 'worth_a_call',
    visualFlags: ['flag_a', 'flag_b'],
    modelReadText: null,
  })
  assertStrictEquals(out, 'VISUAL_FALLBACK:Pet:flag_a,flag_b')
})

Deno.test('selectReadText — not_enough_to_say routes to the no-flag template with hasPhoto plumbed through', () => {
  assertStrictEquals(
    selectReadText(SENTINEL_COPY, { ...readBase, recommendation: 'not_enough_to_say', hasPhoto: false }),
    'NO_FLAG:Pet:false',
  )
  assertStrictEquals(
    selectReadText(SENTINEL_COPY, { ...readBase, recommendation: 'not_enough_to_say', hasPhoto: true }),
    'NO_FLAG:Pet:true',
  )
})

// ── buildAnalysisWriteBack — never-clobber + framework-owned identity ─────────

const READ_FIELDS: AnalysisReadFields = {
  recommendation: 'worth_a_call',
  read_text: 'read',
  visual_flags: [],
  contextual_flags: ['ctx'],
  status: 'completed',
  error: null,
}

Deno.test('write-back — humanEdited update carries EXACTLY the read-field keys, nothing else', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'anything',
    structuredValues: { colour: 'yellow', ai_raw_payload: { big: 'object' } },
    readFields: READ_FIELDS,
  })
  assertStrictEquals(wb.mode, 'update')
  assertEquals(
    Object.keys(wb.values).sort(),
    ['contextual_flags', 'error', 'read_text', 'recommendation', 'status', 'visual_flags'],
  )
})

Deno.test('write-back — un-edited upsert composes identity + structured + read fields', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'stool_normal',
    structuredValues: { stool_colour: 'brown', ai_raw_payload: null },
    readFields: READ_FIELDS,
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.event_id, 'evt')
  assertStrictEquals(wb.values.pet_id, 'pet')
  assertStrictEquals(wb.values.incident_type, 'stool_normal')
  assertStrictEquals(wb.values.stool_colour, 'brown')
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('write-back — identity keys are framework-owned: a descriptor structuredValues collision cannot override them', () => {
  // A buggy (or malicious) buildStructuredValues that tries to re-point the row
  // at another pet/event must lose to the pipeline's own identity values.
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'evt-real',
    petId: 'pet-real',
    incidentType: 'vomit',
    structuredValues: { event_id: 'evt-EVIL', pet_id: 'pet-EVIL', incident_type: 'other', colour: 'yellow' },
    readFields: READ_FIELDS,
  })
  assertStrictEquals(wb.values.event_id, 'evt-real')
  assertStrictEquals(wb.values.pet_id, 'pet-real')
  assertStrictEquals(wb.values.incident_type, 'vomit')
  assertStrictEquals(wb.values.colour, 'yellow') // non-identity keys still land
})

Deno.test('write-back — read-field keys are framework-owned too: a structuredValues collision cannot override the floor verdict', () => {
  // Same attack, aimed at the clinical outcome instead of row identity: a
  // descriptor emitting recommendation/status/read_text in structuredValues must
  // lose to the floor-computed readFields (spread last). Locks the spread order
  // against a future refactor that would let a descriptor downgrade an
  // escalation — the exact hole the escalation floor exists to close.
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'vomit',
    structuredValues: { recommendation: 'monitor', status: 'uncertain', read_text: 'MODEL SAYS ALL CLEAR', colour: 'yellow' },
    readFields: READ_FIELDS, // recommendation: worth_a_call, status: completed
  })
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
  assertStrictEquals(wb.values.status, 'completed')
  assertStrictEquals(wb.values.read_text, 'read')
  assertStrictEquals(wb.values.colour, 'yellow') // non-colliding structured keys still land
})

// ── getToolUseInput / sanitize helpers ─────────────────────────────────────────

Deno.test('getToolUseInput — finds the named tool block, null otherwise', () => {
  const input = { field: 'value' }
  const response = {
    content: [
      { type: 'text' as const, text: 'preamble' },
      { type: 'tool_use' as const, id: 't1', name: 'analyze_x', input },
    ],
    stop_reason: 'tool_use',
  }
  assertStrictEquals(getToolUseInput(response, 'analyze_x'), input)
  assertStrictEquals(getToolUseInput(response, 'analyze_y'), null)
  assertStrictEquals(getToolUseInput({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' }, 'analyze_x'), null)
})

Deno.test('sanitizeEnum / sanitizeEnumArray — drop hallucinated values, never pass them through', () => {
  const allowed = ['a', 'b'] as const
  assertStrictEquals(sanitizeEnum('a', allowed), 'a')
  assertStrictEquals(sanitizeEnum('z', allowed), null)
  assertStrictEquals(sanitizeEnum(42, allowed), null)
  assertEquals(sanitizeEnumArray(['a', 'z', 'b', 3], allowed), ['a', 'b'])
  assertEquals(sanitizeEnumArray('not-an-array', allowed), [])
})
