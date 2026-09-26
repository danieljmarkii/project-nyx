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

import { assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyEscalationFloor,
  shouldCollapsePartialRead,
  selectReadText,
  buildAnalysisWriteBack,
  buildFailureWrite,
  buildRescueRead,
  existingRowOrThrow,
  snapshotStoredAnalysis,
  ownerCorrectedEscalation,
  resolveReanalysisWrite,
  type StoredAnalysis,
  type RescueRead,
  fetchUsableImageBlob,
  getToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  type IncidentCopy,
  type AnalysisReadFields,
} from './incident-analysis.ts'

// ── fetchUsableImageBlob — the transform-only opt-in (B-228 A8, §6.2.4 / AC-13) ─────
// A recording fake storage client: every download(path, opts?) is logged so a test can
// assert WHICH access paths were exercised. A small blob is under Claude's cap; a
// transform download returns a re-encoded (metadata-stripped) small blob.

function fakeStorage(opts: { rawSize: number; transformSize: number }) {
  const calls: { transform: boolean }[] = []
  const client = {
    storage: {
      from: (_bucket: string) => ({
        download: (_path: string, o?: { transform?: unknown }) => {
          const isTransform = !!o?.transform
          calls.push({ transform: isTransform })
          const size = isTransform ? opts.transformSize : opts.rawSize
          return Promise.resolve({ data: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), error: null })
        },
      }),
    },
  }
  // deno-lint-ignore no-explicit-any
  return { client: client as any, calls }
}

Deno.test('fetchUsableImageBlob — forceTransform: the ONLY storage access is the transform (no raw path — AC-13)', async () => {
  // A SMALL photo — the case the shipped path serves RAW. Under forceTransform it must still
  // never touch the raw download: the sole access is the EXIF/GPS-stripping transform.
  const { client, calls } = fakeStorage({ rawSize: 1024, transformSize: 1024 })
  const blob = await fetchUsableImageBlob(client, 'p/a.jpg', 'ask', true)
  assertEquals(calls.length, 1)
  assertStrictEquals(calls[0].transform, true) // the transform, never the raw original
  assertStrictEquals(blob !== null, true)
})

Deno.test('fetchUsableImageBlob — default (forceTransform off): a small photo is downloaded RAW (detail-screen path unchanged)', async () => {
  const { client, calls } = fakeStorage({ rawSize: 1024, transformSize: 1024 })
  const blob = await fetchUsableImageBlob(client, 'p/a.jpg', 'analyze-vomit')
  assertEquals(calls.length, 1)
  assertStrictEquals(calls[0].transform, false) // raw-for-small: byte-identical to the shipped fetch
  assertStrictEquals(blob !== null, true)
})

Deno.test('fetchUsableImageBlob — default: an OVERSIZED photo falls through raw → transform (unchanged)', async () => {
  const OVER = 6_000_000 // over MAX_CLAUDE_IMAGE_BYTES
  const { client, calls } = fakeStorage({ rawSize: OVER, transformSize: 1024 })
  const blob = await fetchUsableImageBlob(client, 'p/big.jpg', 'analyze-vomit')
  assertEquals(calls.map((c) => c.transform), [false, true]) // raw attempt, then the downscale
  assertStrictEquals(blob !== null, true)
})

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

// ── shouldCollapsePartialRead — the B-203 / CUL-298 partial-read guard ────────
// A benign read on only SOME of an event's photos must NOT stand: an unseen frame
// could hold the red flag, so a would-be monitor collapses to not_enough_to_say
// (dropping the analysis, so its "Blood: none visible" observations vanish too). An
// escalation the readable photos DID surface always survives — presence escalates.

Deno.test('shouldCollapsePartialRead — a benign partial read (some photos dropped) collapses', () => {
  // The exact bug: 2 photos, 1 readable + benign; the dropped one could have shown blood.
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 2, recommendation: 'monitor' }), true)
})

Deno.test('shouldCollapsePartialRead — a worth_a_call from the readable subset is NEVER collapsed', () => {
  // Presence escalates: a visual/model/contextual escalation survives a partial read.
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 2, recommendation: 'worth_a_call' }), false)
})

Deno.test('shouldCollapsePartialRead — a complete read (every photo seen) never collapses', () => {
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 2, totalCount: 2, recommendation: 'monitor' }), false)
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 1, recommendation: 'monitor' }), false)
})

Deno.test('shouldCollapsePartialRead — fully-unreadable (zero usable) is NOT this guard (photoUnreadable handles it)', () => {
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 0, totalCount: 2, recommendation: 'monitor' }), false)
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 0, totalCount: 0, recommendation: 'not_enough_to_say' }), false)
})

Deno.test('shouldCollapsePartialRead — the MAX_PHOTOS overflow (>3 photos, 3 read) is a partial read too', () => {
  // 5 attachments, only 3 ever sent to the model; a benign 3 can't clear the other 2.
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 3, totalCount: 5, recommendation: 'monitor' }), true)
  // ...but an escalation among the 3 still stands.
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 3, totalCount: 5, recommendation: 'worth_a_call' }), false)
})

Deno.test('shouldCollapsePartialRead — a partial read already at not_enough_to_say still collapses (drops its structured fields)', () => {
  // e.g. the readable subset didn't appear to show the subject. The verdict is
  // already the target, but the collapse still nulls the analysis so no partial-view
  // observation is written.
  assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 2, recommendation: 'not_enough_to_say' }), true)
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

// ── buildFailureWrite — an escalation survives a failed re-analysis (CUL-812) ──
// The rule under test is asymmetric on purpose: presence is preserved, absence is
// not. Each case below is one half of that, and the two `monitor`/`not_enough`
// cases are what stop the fix from becoming the stale-benign-read defect it would
// be if the guard were widened to "any real analysis".

const FAILURE_BASE = {
  eventId: 'evt-1',
  petId: 'pet-1',
  incidentType: 'vomit',
  message: 'Claude API error 529',
  existingReadFailed: false,
  rescue: null,
}

Deno.test('buildFailureWrite — a worth_a_call already in the record is NEVER overwritten by a failure', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'worth_a_call' } })
  assertStrictEquals(write.mode, 'error-only')
  // Exactly one key: the error. Nothing that could move the verdict off the card.
  assertEquals(write.mode === 'error-only' ? Object.keys(write.values) : [], ['error'])
  assertEquals(write.mode === 'error-only' ? write.values.error : null, 'Claude API error 529')
})

Deno.test('buildFailureWrite — a benign monitor read does NOT survive (it may describe a replaced photo)', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor' } })
  assertStrictEquals(write.mode, 'upsert')
  assertEquals(write.mode === 'upsert' ? write.values.status : null, 'failed')
})

Deno.test('buildFailureWrite — not_enough_to_say does not survive either (retry is the honest state)', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'not_enough_to_say' } })
  assertStrictEquals(write.mode, 'upsert')
})

Deno.test('buildFailureWrite — no prior row: the plain failure upsert, identity keys intact', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: null })
  assertStrictEquals(write.mode, 'upsert')
  assertEquals(write.mode === 'upsert' ? write.values : {}, {
    event_id: 'evt-1',
    pet_id: 'pet-1',
    incident_type: 'vomit',
    status: 'failed',
    error: 'Claude API error 529',
  })
})

Deno.test('buildFailureWrite — a prior row with a null recommendation (pending/failed) takes the upsert', () => {
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: null } }).mode, 'upsert')
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, existing: {} }).mode, 'upsert')
})

Deno.test('buildFailureWrite — failing before the event loads writes NOTHING (pet_id/incident_type NOT NULL)', () => {
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: null }).mode, 'skip')
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, incidentType: null, existing: null }).mode, 'skip')
  // And an escalation still short-circuits to skip rather than a bogus write.
  assertStrictEquals(
    buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: { recommendation: 'worth_a_call' } }).mode,
    'skip',
  )
})

Deno.test('buildFailureWrite — an UNREADABLE row fails closed: write nothing rather than blind', () => {
  // The caller cannot tell "no row" from "could not reach the table". Writing
  // 'failed' on that ambiguity is the original bug with a different cause, so the
  // row keeps whatever it holds — including an escalation we could not see.
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: null, existingReadFailed: true })
  assertStrictEquals(write.mode, 'skip')
  // Even when the read came back with a benign row alongside the error.
  assertStrictEquals(
    buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor' }, existingReadFailed: true }).mode,
    'skip',
  )
})

// ── existingRowOrThrow — a read that has not answered is never an empty record (CUL-817) ──
// Step 3b used to drop the error half, so an unreachable table read as "no row" and
// every never-clobber guard derived from it failed OPEN. Each case is one half of
// "the error decides, the data never does".

Deno.test('existingRowOrThrow — a read error THROWS, even when data came back alongside it', () => {
  assertThrows(() => existingRowOrThrow({ data: null, error: { message: 'connection reset' } }), Error, 'connection reset')
  // A stale or partial row next to an error is still an unanswered read.
  assertThrows(() => existingRowOrThrow({ data: { edited_at: null }, error: { message: 'timeout' } }))
})

Deno.test('existingRowOrThrow — an answered read with no row is null; a row is the row', () => {
  assertStrictEquals(existingRowOrThrow({ data: null, error: null }), null)
  const row = { edited_at: '2026-09-01T00:00:00Z' }
  assertStrictEquals(existingRowOrThrow({ data: row, error: null }), row)
})

// ── buildRescueRead — the escalation a failing run keeps (CUL-815) ───────────────

const RESCUE_BASE = { petName: 'Pet', hasPhoto: true }

Deno.test('buildRescueRead — a computed escalation (the CUL-815 variant) is kept exactly as computed', () => {
  const computed: RescueRead = {
    recommendation: 'worth_a_call',
    read_text: 'I can see what looks like blood.',
    visual_flags: ['blood'],
    contextual_flags: [],
  }
  assertStrictEquals(
    buildRescueRead(SENTINEL_COPY, { ...RESCUE_BASE, computed, contextualFlags: [] }),
    computed,
  )
})

Deno.test('buildRescueRead — contextual flags alone rescue as the contextual escalation (the canonical case)', () => {
  // The run failed before the floor (a storage error, a 529): only step 3's flags exist.
  const rescue = buildRescueRead(SENTINEL_COPY, { ...RESCUE_BASE, computed: null, contextualFlags: ['feline_reduced_intake'] })
  assertEquals(rescue, {
    recommendation: 'worth_a_call',
    read_text: 'CONTEXTUAL:Pet:feline_reduced_intake',
    visual_flags: [],
    contextual_flags: ['feline_reduced_intake'],
  })
})

Deno.test('buildRescueRead — nothing escalated: no rescue (absence is never carried into the record)', () => {
  assertStrictEquals(buildRescueRead(SENTINEL_COPY, { ...RESCUE_BASE, computed: null, contextualFlags: [] }), null)
  const calm: RescueRead = { recommendation: 'monitor', read_text: 'MONITOR:Pet', visual_flags: [], contextual_flags: [] }
  assertStrictEquals(buildRescueRead(SENTINEL_COPY, { ...RESCUE_BASE, computed: calm, contextualFlags: [] }), null)
})

// ── buildFailureWrite + a rescue ──────────────────────────────────────────────────

const RESCUE: RescueRead = {
  recommendation: 'worth_a_call',
  read_text: 'CONTEXTUAL:Pet:repeated_vomiting',
  visual_flags: [],
  contextual_flags: ['repeated_vomiting'],
}

Deno.test('buildFailureWrite — rescue over no row: the escalation lands as failed, read fields ONLY', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: null, rescue: RESCUE })
  assertStrictEquals(write.mode, 'rescue')
  assertEquals(write.mode === 'rescue' ? write.values : {}, {
    event_id: 'evt-1',
    pet_id: 'pet-1',
    incident_type: 'vomit',
    recommendation: 'worth_a_call',
    read_text: 'CONTEXTUAL:Pet:repeated_vomiting',
    visual_flags: [],
    contextual_flags: ['repeated_vomiting'],
    // True: the photo read did not finish. The client renders a failed escalation as the escalation.
    status: 'failed',
    error: 'Claude API error 529',
  })
})

Deno.test('buildFailureWrite — rescue over a stored benign read replaces the retry frame with the warning', () => {
  // The CUL-815 variant: the previous read was monitor, this run found an escalation, the write failed.
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor' }, rescue: RESCUE })
  assertStrictEquals(write.mode, 'rescue')
})

Deno.test('buildFailureWrite — a stored escalation outranks a rescue: error-only, the record keeps its words', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'worth_a_call' }, rescue: RESCUE })
  assertStrictEquals(write.mode, 'error-only')
})

Deno.test('buildFailureWrite — a rescue never overrides failing closed or the NOT NULL skip', () => {
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, existing: null, existingReadFailed: true, rescue: RESCUE }).mode, 'skip')
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: null, rescue: RESCUE }).mode, 'skip')
})

// ── snapshotStoredAnalysis — what a re-analysis reads off the stored row ──────────
// A fake descriptor whose payload key differs from its column (stool's shape:
// ai_raw_payload.blood_present → stool_blood_present), so the test proves the model's
// flags are read THROUGH buildStructuredValues, not off the payload's own keys.

const FAKE_DESCRIPTOR = {
  presentFlagsFromStructured: (row: Record<string, unknown>) => (row.blood_col === 'yes' ? ['blood'] : []),
  // deno-lint-ignore no-explicit-any
  buildStructuredValues: (a: any) => ({ blood_col: a?.model_blood ?? null }),
}

Deno.test('snapshotStoredAnalysis — no row is null', () => {
  assertStrictEquals(snapshotStoredAnalysis(FAKE_DESCRIPTOR, null), null)
})

Deno.test('snapshotStoredAnalysis — an edited row: the owner cleared what the model saw', () => {
  const s = snapshotStoredAnalysis(FAKE_DESCRIPTOR, {
    recommendation: 'worth_a_call',
    status: 'completed',
    edited_at: '2026-09-20T10:00:00Z',
    contextual_flags: ['repeated_vomiting', 7],
    blood_col: 'no',
    ai_raw_payload: { model_blood: 'yes' },
  })
  assertEquals(s, {
    recommendation: 'worth_a_call',
    status: 'completed',
    edited: true,
    contextualFlags: ['repeated_vomiting'],
    presentFlags: [],
    modelPresentFlags: ['blood'],
  })
})

Deno.test('snapshotStoredAnalysis — a null or non-object payload asserts no model flag', () => {
  for (const payload of [null, 'garbled', 3]) {
    const s = snapshotStoredAnalysis(FAKE_DESCRIPTOR, { recommendation: null, status: 'capped', blood_col: 'yes', ai_raw_payload: payload })
    assertEquals(s?.modelPresentFlags, [])
    assertEquals(s?.presentFlags, ['blood'])
    assertStrictEquals(s?.edited, false)
  }
})

// ── resolveReanalysisWrite — never lower a stored escalation; a stored red flag carries ──

const stored = (o: Partial<StoredAnalysis> = {}): StoredAnalysis => ({
  recommendation: 'worth_a_call',
  status: 'completed',
  edited: false,
  contextualFlags: [],
  presentFlags: [],
  modelPresentFlags: [],
  ...o,
})

const readOf = (recommendation: 'worth_a_call' | 'monitor' | 'not_enough_to_say'): AnalysisReadFields => ({
  recommendation,
  read_text: recommendation,
  visual_flags: recommendation === 'worth_a_call' ? ['blood'] : [],
  contextual_flags: [],
  status: recommendation === 'not_enough_to_say' ? 'uncertain' : 'completed',
  error: null,
})

const resolve = (s: StoredAnalysis | null, next: AnalysisReadFields, nextPresentFlags: string[] = []) =>
  resolveReanalysisWrite({
    stored: s,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'vomit',
    structuredValues: { blood_present: 'none_visible', ai_raw_payload: { new: 'read' } },
    nextPresentFlags,
    readFields: next,
  })

Deno.test('resolveReanalysisWrite — a photo escalation is HELD over a calmer re-read (Dr. Chen\'s confirmed case)', () => {
  // A row-read error on the incident screen re-triggers the read; the second run sees less.
  const w = resolve(stored({ presentFlags: ['blood'], modelPresentFlags: ['blood'] }), readOf('monitor'))
  assertEquals(w, { mode: 'hold', values: null })
})

Deno.test('resolveReanalysisWrite — the model\'s own call, with no flag behind it, is held too', () => {
  assertStrictEquals(resolve(stored(), readOf('monitor')).mode, 'hold')
  assertStrictEquals(resolve(stored(), readOf('not_enough_to_say')).mode, 'hold')
})

Deno.test('resolveReanalysisWrite — a CONTEXTUAL escalation is held: a lapsed window is the clock, not the owner', () => {
  // Both descriptors count their windows back from Date.now(), so a re-read two days
  // later loses the context by time alone. Lowering on that is lowering automatically.
  const w = resolve(stored({ status: 'failed', contextualFlags: ['repeated_vomiting'] }), readOf('monitor'))
  assertStrictEquals(w.mode, 'hold')
})

Deno.test('resolveReanalysisWrite — a held rescue whose new read completed settles to completed; nothing else moves', () => {
  const w = resolve(stored({ status: 'failed', contextualFlags: ['feline_reduced_intake'] }), readOf('monitor'))
  // Only status + error: the verdict, the words and the flags are not in the write.
  assertEquals(w, { mode: 'hold', values: { status: 'completed', error: null } })
  // A re-read that could not see (uncertain) did not finish either: the row stays as it is.
  assertEquals(resolve(stored({ status: 'failed' }), readOf('not_enough_to_say')), { mode: 'hold', values: null })
})

Deno.test('resolveReanalysisWrite — the OWNER\'S correction lowers: every model flag cleared, no context', () => {
  const corrected = stored({ edited: true, presentFlags: [], modelPresentFlags: ['blood'] })
  assertStrictEquals(ownerCorrectedEscalation(corrected), true)
  const w = resolve(corrected, readOf('monitor'))
  // Pattern 7 still applies: an edited row refreshes the read fields only.
  assertStrictEquals(w.mode, 'update')
  assertStrictEquals(w.mode === 'update' ? w.values.recommendation : null, 'monitor')
})

Deno.test('resolveReanalysisWrite — a partial correction, or a correction under a live context, is still held', () => {
  // The owner cleared blood but foreign material still stands on their record.
  assertStrictEquals(resolve(stored({ edited: true, presentFlags: ['foreign_material'], modelPresentFlags: ['blood', 'foreign_material'] }), readOf('monitor')).mode, 'hold')
  // The owner cleared blood, but the record also escalated this incident.
  assertStrictEquals(resolve(stored({ edited: true, contextualFlags: ['repeated_vomiting'], modelPresentFlags: ['blood'] }), readOf('monitor')).mode, 'hold')
  // An edit (a colour fix) on a row whose escalation had no structured flag to clear.
  assertStrictEquals(resolve(stored({ edited: true }), readOf('monitor')).mode, 'hold')
})

Deno.test('resolveReanalysisWrite — an escalation replacing an escalation is not a lowering: it writes', () => {
  const w = resolve(stored({ presentFlags: ['blood'], modelPresentFlags: ['blood'] }), readOf('worth_a_call'), ['blood'])
  assertStrictEquals(w.mode, 'upsert')
})

Deno.test('resolveReanalysisWrite — CUL-532: a re-read that cannot see keeps a stored red flag (read fields only)', () => {
  // A vomit row read 'monitor' beside fresh red blood (the model left visual_flags empty,
  // CUL-534); the photo then reads fully unreadable, so this run's columns are all null.
  const w = resolve(stored({ recommendation: 'monitor', presentFlags: ['blood'], modelPresentFlags: ['blood'] }), readOf('not_enough_to_say'), [])
  assertStrictEquals(w.mode, 'update')
  assertEquals(w.mode === 'update' ? Object.keys(w.values).sort() : [], ['contextual_flags', 'error', 'read_text', 'recommendation', 'status', 'visual_flags'])
})

Deno.test('resolveReanalysisWrite — a stored ABSENCE does not carry: the full write lands (no stale "none visible")', () => {
  const w = resolve(stored({ recommendation: 'monitor' }), readOf('not_enough_to_say'), [])
  assertStrictEquals(w.mode, 'upsert')
})

Deno.test('resolveReanalysisWrite — new findings that re-assert every stored flag land in full (CUL-1110 not widened)', () => {
  const w = resolve(stored({ recommendation: 'monitor', presentFlags: ['blood'] }), readOf('worth_a_call'), ['blood', 'foreign_material'])
  assertStrictEquals(w.mode, 'upsert')
  assertStrictEquals(w.mode === 'upsert' ? w.values.blood_present : null, 'none_visible') // this run's columns
})

Deno.test('resolveReanalysisWrite — the stated residual: a different new flag keeps the stored columns (CUL-1110)', () => {
  // Stored blood, new read sees only foreign material. The card escalates on the new read;
  // the columns keep the stored blood, and the new flag waits on CUL-1110's per-field union.
  const w = resolve(stored({ presentFlags: ['blood'] }), readOf('worth_a_call'), ['foreign_material'])
  assertStrictEquals(w.mode, 'update')
  assertStrictEquals(w.mode === 'update' ? w.values.recommendation : null, 'worth_a_call')
})

Deno.test('resolveReanalysisWrite — Pattern 7 unchanged: no row upserts in full, an edited row updates read fields', () => {
  assertStrictEquals(resolve(null, readOf('monitor')).mode, 'upsert')
  assertStrictEquals(resolve(stored({ recommendation: 'monitor', edited: true }), readOf('monitor')).mode, 'update')
  // A capped / pending row (no verdict, no flags) takes the full write.
  assertStrictEquals(resolve(stored({ recommendation: null, status: 'capped' }), readOf('monitor')).mode, 'upsert')
})

// ── The pipeline's wiring (CUL-815 / CUL-817 / CUL-1201) — a source guard ─────────
// runIncidentAnalysis builds its own Supabase clients, so no unit test drives it; the
// rules above are pure and tested, and this guard pins that the pipeline still CALLS
// them. It exists for the rebase onto CUL-1203 part 2, which rewrites these same call
// sites: a merge that keeps the helpers and drops a call leaves every test above green.
// Comments are blanked first, in one left-to-right pass that steps over strings so a
// `//` inside a URL is not read as a comment (C-18), and a comment naming a helper can
// never satisfy the guard. Strings are kept: the table names are what the guard reads.

function blankComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++ }
      out += '  '
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      out += c
      i++
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue }
        out += src[i]
        i++
      }
      out += c
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

async function pipelineSource(): Promise<{ preamble: string; tryBody: string; catchBody: string; step9: string }> {
  const raw = await Deno.readTextFile(new URL('./incident-analysis.ts', import.meta.url))
  const start = raw.indexOf('export async function runIncidentAnalysis')
  assertStrictEquals(start > 0, true, 'runIncidentAnalysis not found')
  // Anchored on the raw text (the anchors are comments), then blanked.
  const fn = raw.slice(start)
  // The pipeline's own try (the body-parse try above it is not it).
  const tryAt = fn.indexOf('\n  try {\n    // 0. Verify the caller uid')
  const catchAt = fn.indexOf('\n  } catch (err) {\n')
  const step9At = fn.indexOf('// 9. Write-back.')
  for (const [name, at] of [['try', tryAt], ['catch', catchAt], ['step 9', step9At]] as const) {
    assertStrictEquals(at > 0, true, `anchor "${name}" not found: the guard must be re-anchored, never deleted`)
  }
  const code = blankComments(fn)
  return {
    preamble: code.slice(0, tryAt),
    tryBody: code.slice(tryAt, catchAt),
    catchBody: code.slice(catchAt),
    step9: code.slice(step9At, catchAt),
  }
}

Deno.test('pipeline wiring — the stored row is only ever read through existingRowOrThrow (CUL-817)', async () => {
  const { preamble, tryBody } = await pipelineSource()
  assertStrictEquals(/existingRowOrThrow\(/.test(preamble), true, 'readStoredRow must route through existingRowOrThrow')
  // No direct event_ai_analysis select inside the try: a `{ data }` destructure there is
  // the swallowed-error shape this issue removed.
  const directSelects = tryBody.match(/\.from\('event_ai_analysis'\)\s*\.select\(/g) ?? []
  assertEquals(directSelects, [], 'a select inside the try bypasses the fail-closed read')
  // Step 3b and step 9 both read through it.
  assertStrictEquals((tryBody.match(/await readStoredRow\(\)/g) ?? []).length, 2)
})

Deno.test('pipeline wiring — step 9 decides through resolveReanalysisWrite and honours a hold (CUL-1201, CUL-532)', async () => {
  const { step9 } = await pipelineSource()
  assertStrictEquals(/resolveReanalysisWrite\(/.test(step9), true)
  assertStrictEquals(/snapshotStoredAnalysis\(descriptor,\s*await readStoredRow\(\)\)/.test(step9), true, 'the decision must use a FRESH read')
  assertStrictEquals(/buildAnalysisWriteBack\(/.test(step9), false, 'step 9 must not bypass the resolver')
  assertStrictEquals(/writeBack\.mode === 'hold'/.test(step9), true)
  assertStrictEquals(/nextPresentFlags:\s*descriptor\.presentFlagsFromStructured\(structuredValues\)/.test(step9), true)
})

Deno.test('pipeline wiring — the catch passes a rescue and writes it (CUL-815)', async () => {
  const { tryBody, catchBody } = await pipelineSource()
  assertStrictEquals(/rescue:\s*buildRescueRead\(descriptor\.copy,/.test(catchBody), true)
  assertStrictEquals(/computed:\s*computedRead/.test(catchBody), true)
  assertStrictEquals(/contextualFlags:\s*contextualFlagsForFailure/.test(catchBody), true)
  // The try must actually populate what the catch reads.
  assertStrictEquals(/contextualFlagsForFailure = contextualFlags/.test(tryBody), true)
  assertStrictEquals(/computedRead = \{/.test(tryBody), true)
  // Both upsert-shaped modes reach the upsert.
  assertStrictEquals(/failureWrite\.mode === 'upsert' \|\| failureWrite\.mode === 'rescue'/.test(catchBody), true)
})
