// Unit tests for the shared incident-analysis FRAMEWORK mechanisms (B-247 PR 2).
// Run with: deno test supabase/functions/_shared/incident-analysis.test.ts
//
// These pin the mechanisms every descriptor inherits — deliberately with DUMMY
// templates/inputs, not vomit's, so the guarantees are proven to hold for ANY
// incident type (stool next, PR 3), independent of any one descriptor's copy:
//   - the Recommendation vocabulary has no reassuring value (Pattern 1);
//   - the escalation floor forces worth_a_call on contextual flags and on the
//     per-type visual escalation, and the model can escalate but never
//     downgrade (Pattern 2);
//   - the read-text selection surfaces the model's free text ONLY on the
//     visual-escalation path — every other path is a template (B-060);
//   - the write-back's update mode carries not one column beyond the read
//     fields (Pattern 7, the never-clobber guard).
//
// Per-type behavior (vomit's thresholds, copy, columns, gate keys) stays pinned
// where it lives: supabase/functions/analyze-vomit/index.test.ts — which also
// exercises the shared gate helpers (resolveGateState & co.) through its
// re-exports. Every NEW descriptor still gets its own adversarial-reviewer pass
// + Pattern-8 reassurance tests; nothing here inherits that DoD line for it.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  RECOMMENDATIONS,
  applyIncidentEscalationFloor,
  selectIncidentReadText,
  buildIncidentWriteBack,
  findToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  type AnalysisReadFields,
  type IncidentReadTemplates,
  type Recommendation,
} from './incident-analysis.ts'

// ── Pattern 1: the recommendation vocabulary itself ───────────────────────────
// The framework owns the enum; a fourth, wellness-asserting value is a clinical
// regression that must fail a test, not just a review.

Deno.test('RECOMMENDATIONS — exactly the three non-reassuring verdicts, nothing else', () => {
  assertEquals([...RECOMMENDATIONS], ['worth_a_call', 'monitor', 'not_enough_to_say'])
  const reassuring = /\b(fine|okay|ok|healthy|normal|clear|well|good)\b/i
  for (const r of RECOMMENDATIONS) {
    assertStrictEquals(reassuring.test(r.replace(/_/g, ' ')), false, `reassuring verdict value: ${r}`)
  }
})

// ── Pattern 2: the escalation floor mechanism ──────────────────────────────────

const FLOOR_BOOLS = [true, false] as const

// Every combination of the non-contextual inputs, for exhaustive sweeps.
function allFloorInputs() {
  const combos: {
    modelRecommendation: Recommendation
    appearsToShowIncident: boolean
    hasPhoto: boolean
    visualEscalation: boolean
  }[] = []
  for (const modelRecommendation of RECOMMENDATIONS) {
    for (const appearsToShowIncident of FLOOR_BOOLS) {
      for (const hasPhoto of FLOOR_BOOLS) {
        for (const visualEscalation of FLOOR_BOOLS) {
          combos.push({ modelRecommendation, appearsToShowIncident, hasPhoto, visualEscalation })
        }
      }
    }
  }
  return combos
}

Deno.test('floor — a contextual flag forces worth_a_call over EVERY other input combination', () => {
  for (const combo of allFloorInputs()) {
    const rec = applyIncidentEscalationFloor({ ...combo, contextualFlags: ['any_contextual_flag'] })
    assertStrictEquals(rec, 'worth_a_call', JSON.stringify(combo))
  }
})

Deno.test('floor — the per-type visual escalation forces worth_a_call regardless of the model', () => {
  for (const modelRecommendation of RECOMMENDATIONS) {
    const rec = applyIncidentEscalationFloor({
      modelRecommendation,
      appearsToShowIncident: true,
      hasPhoto: true,
      visualEscalation: true,
      contextualFlags: [],
    })
    assertStrictEquals(rec, 'worth_a_call')
  }
})

Deno.test('floor — the model can escalate (worth_a_call honored on a clean photo)', () => {
  const rec = applyIncidentEscalationFloor({
    modelRecommendation: 'worth_a_call',
    appearsToShowIncident: true,
    hasPhoto: true,
    visualEscalation: false,
    contextualFlags: [],
  })
  assertStrictEquals(rec, 'worth_a_call')
})

Deno.test('floor — no photo / not-the-incident collapse to not_enough_to_say (never reassurance)', () => {
  assertStrictEquals(
    applyIncidentEscalationFloor({
      modelRecommendation: 'monitor',
      appearsToShowIncident: false,
      hasPhoto: false,
      visualEscalation: false,
      contextualFlags: [],
    }),
    'not_enough_to_say',
  )
  assertStrictEquals(
    applyIncidentEscalationFloor({
      modelRecommendation: 'monitor',
      appearsToShowIncident: false,
      hasPhoto: true,
      visualEscalation: false,
      contextualFlags: [],
    }),
    'not_enough_to_say',
  )
})

Deno.test('floor — exhaustive sweep: output is always a valid, non-reassuring verdict', () => {
  // There is no input — any model recommendation, any flag state — that yields a
  // value outside the three-verdict vocabulary. No path to a reassuring verdict,
  // by construction.
  for (const combo of allFloorInputs()) {
    for (const contextualFlags of [[], ['flag_a'], ['flag_a', 'flag_b']]) {
      const rec = applyIncidentEscalationFloor({ ...combo, contextualFlags })
      assertStrictEquals(RECOMMENDATIONS.includes(rec), true, JSON.stringify({ ...combo, contextualFlags }))
    }
  }
})

// ── B-060: the read-text selection ORDER ───────────────────────────────────────
// Dummy templates that tag which path ran, so these tests prove the ORDER —
// independent of any real descriptor's copy.

const SPY_TEMPLATES: IncidentReadTemplates = {
  contextual: (petName, flags) => `[contextual:${petName}:${flags.join('+')}]`,
  photoUnreadable: (petName) => `[unreadable:${petName}]`,
  visualEscalationFallback: (petName, visualFlags) => `[visual-fallback:${petName}:${visualFlags.join('+')}]`,
  monitor: (petName) => `[monitor:${petName}]`,
  noFlag: (petName, hasPhoto) => `[no-flag:${petName}:${hasPhoto}]`,
}

const REASSURING_MODEL_TEXT = 'Pip is totally fine — nothing to worry about, looks completely healthy.'

const baseSelect = {
  petName: 'Pip',
  recommendation: 'monitor' as Recommendation,
  contextualFlags: [] as string[],
  visualFlags: [] as string[],
  modelReadText: REASSURING_MODEL_TEXT,
  photoUnreadable: false,
  hasPhoto: true,
}

Deno.test('read selection — the model text surfaces ONLY on the visual worth_a_call path', () => {
  // The one sanctioned surface: escalation names a PRESENT concern.
  const out = selectIncidentReadText(
    { ...baseSelect, recommendation: 'worth_a_call', visualFlags: ['blood'], modelReadText: 'I can see blood — worth a call.' },
    SPY_TEMPLATES,
  )
  assertStrictEquals(out, 'I can see blood — worth a call.')
})

Deno.test('read selection — every non-escalation path discards the model text for a template', () => {
  // monitor (the reassurance-on-absence risk), not_enough_to_say (photo and
  // no-photo), unreadable photo, and contextual escalation: the model's words —
  // here maximally reassuring — must never reach the owner.
  const cases: [Parameters<typeof selectIncidentReadText>[0], string][] = [
    [{ ...baseSelect, recommendation: 'monitor' }, '[monitor:Pip]'],
    [{ ...baseSelect, recommendation: 'not_enough_to_say' }, '[no-flag:Pip:true]'],
    [{ ...baseSelect, recommendation: 'not_enough_to_say', hasPhoto: false }, '[no-flag:Pip:false]'],
    [{ ...baseSelect, recommendation: 'not_enough_to_say', photoUnreadable: true }, '[unreadable:Pip]'],
    [{ ...baseSelect, recommendation: 'worth_a_call', contextualFlags: ['ctx_flag'] }, '[contextual:Pip:ctx_flag]'],
  ]
  for (const [params, expected] of cases) {
    assertStrictEquals(selectIncidentReadText(params, SPY_TEMPLATES), expected)
  }
})

Deno.test('read selection — contextual outranks unreadable outranks visual (the escalation read names the context)', () => {
  // A contextual flag wins even when the photo was unreadable AND the model wrote
  // a read: the forced worth_a_call must be explained by its contextual reason.
  const out = selectIncidentReadText(
    { ...baseSelect, recommendation: 'worth_a_call', contextualFlags: ['ctx_flag'], photoUnreadable: true },
    SPY_TEMPLATES,
  )
  assertStrictEquals(out, '[contextual:Pip:ctx_flag]')
  // Unreadable photo beats the model text even on worth_a_call (no photo read exists).
  const out2 = selectIncidentReadText(
    { ...baseSelect, recommendation: 'worth_a_call', photoUnreadable: true },
    SPY_TEMPLATES,
  )
  assertStrictEquals(out2, '[unreadable:Pip]')
})

Deno.test('read selection — worth_a_call with no model read falls back to the visual template (still escalates)', () => {
  const out = selectIncidentReadText(
    { ...baseSelect, recommendation: 'worth_a_call', visualFlags: ['flag_x'], modelReadText: null },
    SPY_TEMPLATES,
  )
  assertStrictEquals(out, '[visual-fallback:Pip:flag_x]')
})

// ── Pattern 7: the write-back core ─────────────────────────────────────────────

const READ_FIELD_KEYS = ['recommendation', 'read_text', 'visual_flags', 'contextual_flags', 'status', 'error'] as const

const sampleReadFields: AnalysisReadFields = {
  recommendation: 'worth_a_call',
  read_text: 'Worth a call.',
  visual_flags: ['flag_x'],
  contextual_flags: ['ctx_flag'],
  status: 'completed',
  error: null,
}

Deno.test('write-back — humanEdited: update mode carries the read fields and NOT ONE other column', () => {
  const payload = { some: 'analysis' }
  const wb = buildIncidentWriteBack({
    humanEdited: true,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 'anything',
    analysisPayload: payload,
    confidence: { a: 0.9 },
    structuredValues: { some_structured_column: 'value', another: 1 },
    readFields: sampleReadFields,
  })
  assertStrictEquals(wb.mode, 'update')
  // Exactly the read-field keys — no structured column, no cached payload, no
  // identity column can ride an update of a human-edited row.
  assertEquals(Object.keys(wb.values).sort(), [...READ_FIELD_KEYS].sort())
})

Deno.test('write-back — un-edited: full upsert carries identity + payload + structured + read fields', () => {
  const payload = { some: 'analysis' }
  const wb = buildIncidentWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 'stool_normal',
    analysisPayload: payload,
    confidence: { a: 0.9 },
    structuredValues: { stool_consistency: 'type_6_mushy' },
    readFields: sampleReadFields,
  })
  assertStrictEquals(wb.mode, 'upsert')
  assertStrictEquals(wb.values.event_id, 'e1')
  assertStrictEquals(wb.values.pet_id, 'p1')
  assertStrictEquals(wb.values.incident_type, 'stool_normal')
  assertStrictEquals(wb.values.ai_raw_payload, payload) // reference-preserved
  assertEquals(wb.values.ai_confidence, { a: 0.9 })
  assertStrictEquals(wb.values.stool_consistency, 'type_6_mushy')
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

Deno.test('write-back — read fields win over a colliding structured key (floor output is authoritative)', () => {
  // A descriptor bug that emits a read-field key from structuredColumns must not
  // be able to overwrite the floor's recommendation in the merged upsert.
  const wb = buildIncidentWriteBack({
    humanEdited: false,
    eventId: 'e1',
    petId: 'p1',
    incidentType: 't',
    analysisPayload: null,
    confidence: null,
    structuredValues: { recommendation: 'monitor' },
    readFields: sampleReadFields,
  })
  assertStrictEquals(wb.values.recommendation, 'worth_a_call')
})

// ── Tool-result plumbing ───────────────────────────────────────────────────────

Deno.test('findToolUseInput — returns the matching tool block input, null otherwise', () => {
  const input = { field: 'value' }
  const response = {
    content: [
      { type: 'text' as const, text: 'preamble' },
      { type: 'tool_use' as const, id: 't1', name: 'analyze_thing', input },
    ],
    stop_reason: 'tool_use',
  }
  assertStrictEquals(findToolUseInput(response, 'analyze_thing'), input)
  assertStrictEquals(findToolUseInput(response, 'other_tool'), null)
  assertStrictEquals(findToolUseInput({ content: [], stop_reason: 'end_turn' }, 'analyze_thing'), null)
})

Deno.test('sanitizeEnum / sanitizeEnumArray — hallucinated values drop, valid values pass', () => {
  const allowed = ['a', 'b'] as const
  assertStrictEquals(sanitizeEnum('a', allowed), 'a')
  assertStrictEquals(sanitizeEnum('z', allowed), null)
  assertStrictEquals(sanitizeEnum(42, allowed), null)
  assertEquals(sanitizeEnumArray(['a', 'z', 'b', 3], allowed), ['a', 'b'])
  assertEquals(sanitizeEnumArray('not-an-array', allowed), [])
})
