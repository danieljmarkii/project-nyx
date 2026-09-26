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
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'worth_a_call', presentFlags: [] } })
  assertStrictEquals(write.mode, 'error-only')
  // Exactly one key: the error. Nothing that could move the verdict off the card.
  assertEquals(write.mode === 'error-only' ? Object.keys(write.values) : [], ['error'])
  assertEquals(write.mode === 'error-only' ? write.values.error : null, 'Claude API error 529')
})

Deno.test('buildFailureWrite — a benign monitor read does NOT survive (it may describe a replaced photo)', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor', presentFlags: [] } })
  assertStrictEquals(write.mode, 'upsert')
  assertEquals(write.mode === 'upsert' ? write.values.status : null, 'failed')
})

Deno.test('buildFailureWrite — not_enough_to_say does not survive either (retry is the honest state)', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'not_enough_to_say', presentFlags: [] } })
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
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: null, presentFlags: [] } }).mode, 'upsert')
})

Deno.test('buildFailureWrite — failing before the event loads writes NOTHING (pet_id/incident_type NOT NULL)', () => {
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: null }).mode, 'skip')
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, incidentType: null, existing: null }).mode, 'skip')
  // And an escalation still short-circuits to skip rather than a bogus write.
  assertStrictEquals(
    buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: { recommendation: 'worth_a_call', presentFlags: [] } }).mode,
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
    buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor', presentFlags: [] }, existingReadFailed: true }).mode,
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
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor', presentFlags: [] }, rescue: RESCUE })
  assertStrictEquals(write.mode, 'rescue')
})

Deno.test('buildFailureWrite — a stored escalation outranks a rescue: error-only, the record keeps its words', () => {
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'worth_a_call', presentFlags: [] }, rescue: RESCUE })
  assertStrictEquals(write.mode, 'error-only')
})

Deno.test('buildFailureWrite — a rescue never overrides failing closed or the NOT NULL skip', () => {
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, existing: null, existingReadFailed: true, rescue: RESCUE }).mode, 'skip')
  assertStrictEquals(buildFailureWrite({ ...FAILURE_BASE, petId: null, existing: null, rescue: RESCUE }).mode, 'skip')
})

Deno.test('buildFailureWrite — a stored red flag under a calm verdict is kept visible: error-only (CUL-532\'s class)', () => {
  // monitor + fresh red blood (a vomit row whose model left visual_flags empty, CUL-534). The
  // failure frame renders ahead of the card and hides the grid, so writing 'failed' here puts
  // "Couldn't finish reading this one" over "Blood: fresh red".
  const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor', presentFlags: ['blood'] } })
  assertStrictEquals(write.mode, 'error-only')
  // A rescue still wins over it: an escalation on the card beats keeping the calm verdict.
  assertStrictEquals(
    buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: 'monitor', presentFlags: ['blood'] }, rescue: RESCUE }).mode,
    'rescue',
  )
})

// ── snapshotStoredAnalysis — what a re-analysis reads off the stored row ──────────

const FAKE_DESCRIPTOR = {
  presentFlagsFromStructured: (row: Record<string, unknown>) => (row.blood_col === 'yes' ? ['blood'] : []),
}

Deno.test('snapshotStoredAnalysis — no row is null', () => {
  assertStrictEquals(snapshotStoredAnalysis(FAKE_DESCRIPTOR, null), null)
})

Deno.test('snapshotStoredAnalysis — reads the verdict, the status, the edit and the present red flags', () => {
  assertEquals(
    snapshotStoredAnalysis(FAKE_DESCRIPTOR, {
      recommendation: 'monitor',
      status: 'failed',
      edited_at: '2026-09-20T10:00:00Z',
      blood_col: 'yes',
    }),
    { recommendation: 'monitor', status: 'failed', edited: true, presentFlags: ['blood'] },
  )
  // Garbage in the typed columns reads as absent, never as a verdict.
  assertEquals(
    snapshotStoredAnalysis(FAKE_DESCRIPTOR, { recommendation: 7, status: null, edited_at: null, blood_col: 'no' }),
    { recommendation: null, status: null, edited: false, presentFlags: [] },
  )
})

// ── resolveReanalysisWrite — never lower a stored escalation; a stored red flag carries ──

const stored = (o: Partial<StoredAnalysis> = {}): StoredAnalysis => ({
  recommendation: 'worth_a_call',
  status: 'completed',
  edited: false,
  presentFlags: [],
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
  assertEquals(resolve(stored({ presentFlags: ['blood'] }), readOf('monitor')), { mode: 'hold', values: null })
  assertEquals(resolve(stored({ presentFlags: ['blood'] }), readOf('not_enough_to_say')), { mode: 'hold', values: null })
})

Deno.test('resolveReanalysisWrite — the model\'s own call and a contextual escalation are held too', () => {
  // No flag of any kind behind the stored verdict: still held.
  assertStrictEquals(resolve(stored(), readOf('monitor')).mode, 'hold')
  // A contextual escalation: both descriptors count their windows back from Date.now(), so a
  // re-read two days later loses the context by time alone. Lowering on that is automatic.
  assertStrictEquals(resolve(stored({ status: 'failed' }), readOf('monitor')).mode, 'hold')
})

Deno.test('resolveReanalysisWrite — NO owner-correction exception yet: the frozen-payload chain is held', () => {
  // The adversarial pass's counterexample to the exception this PR first carried. The owner
  // cleared a FALSE blood flag on photo 1 (edited, columns now absent); photo 2 then
  // re-escalated on REAL blood through read fields only (Pattern 7), so the stored verdict
  // is photo 2's and the columns still say what the owner set for photo 1. A clean photo 3
  // must not lower it: nothing on the row can tell the two reads apart (CUL-1201 part 1).
  assertEquals(resolve(stored({ edited: true, presentFlags: [] }), readOf('monitor')), { mode: 'hold', values: null })
})

Deno.test('resolveReanalysisWrite — a held row the last run left failed settles to THIS run\'s status', () => {
  // A rescue row (CUL-815) or a CUL-812 row. The verdict, words and flags are not in the write.
  assertEquals(resolve(stored({ status: 'failed' }), readOf('monitor')), { mode: 'hold', values: { status: 'completed', error: null } })
  // A re-read that could not say finished too: it settles to uncertain, so Ask's A8 stops
  // re-running a live read (and spending a unit) on every question about the row.
  assertEquals(resolve(stored({ status: 'failed' }), readOf('not_enough_to_say')), { mode: 'hold', values: { status: 'uncertain', error: null } })
  // An already-finished row is left exactly as it is.
  assertEquals(resolve(stored({ status: 'uncertain' }), readOf('monitor')), { mode: 'hold', values: null })
})

Deno.test('resolveReanalysisWrite — an escalation replacing an escalation is not a lowering: it writes', () => {
  assertStrictEquals(resolve(stored({ presentFlags: ['blood'] }), readOf('worth_a_call'), ['blood']).mode, 'upsert')
})

Deno.test('resolveReanalysisWrite — CUL-532: a re-read that cannot see keeps a stored red flag (read fields only)', () => {
  // A vomit row read 'monitor' beside fresh red blood (the model left visual_flags empty,
  // CUL-534); the photo then reads fully unreadable, so this run's columns are all null.
  const w = resolve(stored({ recommendation: 'monitor', presentFlags: ['blood'] }), readOf('not_enough_to_say'), [])
  assertStrictEquals(w.mode, 'update')
  assertEquals(w.mode === 'update' ? Object.keys(w.values).sort() : [], ['contextual_flags', 'error', 'read_text', 'recommendation', 'status', 'visual_flags'])
})

Deno.test('resolveReanalysisWrite — a stored ABSENCE does not carry: the full write lands (no stale "none visible")', () => {
  assertStrictEquals(resolve(stored({ recommendation: 'monitor' }), readOf('not_enough_to_say'), []).mode, 'upsert')
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
