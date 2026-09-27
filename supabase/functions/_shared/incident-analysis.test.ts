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
  isRealAnalysis,
  selectDescription,
  analysisRowMatchesEvent,
  updateAnalysisRow,
  applyAnalysisWriteBack,
  fetchUsableImageBlob,
  getToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  type IncidentCopy,
  type AnalysisReadFields,
  type Recommendation,
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

Deno.test('write-back — humanEdited update carries EXACTLY the read-field keys and the cleared hide, nothing else', () => {
  const wb = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'anything',
    structuredValues: { colour: 'yellow', ai_raw_payload: { big: 'object' } },
    readFields: READ_FIELDS,
  })
  assertStrictEquals(wb.mode, 'update')
  // `dismissed_at` is the one non-read key, and it is presentation state, not a
  // clinical field (CUL-1323): the never-clobber guarantee is about the owner's
  // structured observations, which are all still absent.
  assertEquals(
    Object.keys(wb.values).sort(),
    ['contextual_flags', 'dismissed_at', 'error', 'read_text', 'recommendation', 'status', 'visual_flags'],
  )
})

// ── A new read clears the owner's hide (CUL-1323, PM-ruled 2026-09-27) ──────────
// A dismissal belongs to the words the owner read. Every read clears it, in BOTH
// write modes and whatever the verdict (the ruling is (a), always, not only on an
// escalation), even when a templated read repeats the words: clearing on a repeat
// only ever shows more. The failure write records no new read, so it never touches
// the hide.

Deno.test('CUL-1323 — a new read clears the hide in BOTH modes, on every verdict', () => {
  for (const humanEdited of [true, false]) {
    for (const recommendation of ['worth_a_call', 'monitor', 'not_enough_to_say'] as const) {
      const wb = buildAnalysisWriteBack({
        humanEdited,
        eventId: 'evt',
        petId: 'pet',
        incidentType: 'vomit',
        structuredValues: { colour: 'yellow' },
        readFields: { ...READ_FIELDS, recommendation },
      })
      assertStrictEquals(Object.prototype.hasOwnProperty.call(wb.values, 'dismissed_at'), true)
      assertStrictEquals(wb.values.dismissed_at, null)
    }
  }
})

Deno.test('CUL-1323 — no caller can carry an old hide forward through the builder', () => {
  // The clear lands AFTER both spreads, so a descriptor's structuredValues (or a
  // future read-field that grew a dismissed_at) cannot re-assert the old hide.
  const wb = buildAnalysisWriteBack({
    humanEdited: false,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'vomit',
    structuredValues: { dismissed_at: '2026-09-19T08:00:00.000Z', colour: 'yellow' },
    readFields: { ...READ_FIELDS, dismissed_at: '2026-09-19T08:00:00.000Z' } as unknown as AnalysisReadFields,
  })
  assertStrictEquals(wb.values.dismissed_at, null)
  const edited = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'evt',
    petId: 'pet',
    incidentType: 'vomit',
    structuredValues: {},
    readFields: { ...READ_FIELDS, dismissed_at: '2026-09-19T08:00:00.000Z' } as unknown as AnalysisReadFields,
  })
  assertStrictEquals(edited.values.dismissed_at, null)
})

Deno.test('CUL-1323 — the failure write NEVER touches the hide: a failed attempt is not a new read', () => {
  // Every shape the failure write can take — error-only over a Worth a call, the
  // failed upsert over anything else, and the skip — leaves `dismissed_at` out, so
  // the owner's hide stands until a read they have not seen actually lands.
  const base = {
    eventId: 'evt-1', petId: 'pet-1', incidentType: 'vomit',
    message: 'Claude API error 529', existingReadFailed: false,
  }
  for (const existing of [{ recommendation: 'worth_a_call' }, { recommendation: 'monitor' }, null]) {
    const write = buildFailureWrite({ ...base, existing })
    const values = write.mode === 'skip' ? {} : write.values
    assertStrictEquals(Object.prototype.hasOwnProperty.call(values, 'dismissed_at'), false)
  }
  assertStrictEquals(buildFailureWrite({ ...base, existing: null, petId: null }).mode, 'skip')
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

// ── A verdict this code does not know yet (CUL-1277) ──────────────────────────
// EN-3 (CUL-1133) will write verdicts the shipped code cannot name, and a flag rolled
// back leaves them in the record for THIS code to meet. Every guard that PROTECTS an
// escalation already in the record asks the shared quiet list (lib/incidentVerdict.ts),
// so the unknown value is protected exactly like worth_a_call. The two gates that
// RELEASE the model's own words stay on the literal (Pattern 10), and are pinned here
// too, so nobody moves them onto the list by symmetry. `call_now` is the fixture because
// it is the likeliest real name; `a_verdict_from_the_future` because it can never be one.

const UNKNOWN_VERDICTS = ['call_now', 'a_verdict_from_the_future'] as const

Deno.test('CUL-1277 buildFailureWrite — an unknown verdict in the record survives a failed re-read (the CUL-812 shape)', () => {
  for (const verdict of UNKNOWN_VERDICTS) {
    const write = buildFailureWrite({ ...FAILURE_BASE, existing: { recommendation: verdict, presentFlags: [] } })
    assertStrictEquals(write.mode, 'error-only', verdict)
    assertEquals(write.mode === 'error-only' ? Object.keys(write.values) : [], ['error'])
  }
})

Deno.test('CUL-1277 × CUL-1201 resolveReanalysisWrite — a stored unknown verdict is held over a calmer re-read', () => {
  // A rolled-back EN-3 tier left in the record must not come down to monitor: the hold asks
  // the quiet list, not the literal.
  for (const verdict of UNKNOWN_VERDICTS) {
    assertEquals(resolve(stored({ recommendation: verdict }), readOf('monitor')), { mode: 'hold', values: null }, verdict)
    assertEquals(resolve(stored({ recommendation: verdict }), readOf('not_enough_to_say')), { mode: 'hold', values: null }, verdict)
  }
})

Deno.test('CUL-1277 isRealAnalysis — a failed or pending row holding an unknown verdict is never buried by a cap', () => {
  for (const verdict of UNKNOWN_VERDICTS) {
    assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: verdict }), true, verdict)
    assertStrictEquals(isRealAnalysis({ status: 'pending', recommendation: verdict }), true, verdict)
  }
  // The shipped shape, unchanged: the literal escalation, and the status half.
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'worth_a_call' }), true)
  assertStrictEquals(isRealAnalysis({ status: 'completed', recommendation: 'monitor' }), true)
  assertStrictEquals(isRealAnalysis({ status: 'uncertain', recommendation: 'not_enough_to_say' }), true)
  // A quiet verdict on a failed or pending row is NOT protected: nothing a cap band buries.
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'monitor' }), false)
  assertStrictEquals(isRealAnalysis({ status: 'failed', recommendation: 'not_enough_to_say' }), false)
  assertStrictEquals(isRealAnalysis({ status: 'pending', recommendation: null }), false)
  assertStrictEquals(isRealAnalysis(null), false)
})

Deno.test('CUL-1277 shouldCollapsePartialRead — an unknown verdict on a partial read is never collapsed', () => {
  for (const verdict of UNKNOWN_VERDICTS) {
    assertStrictEquals(shouldCollapsePartialRead({ usableCount: 1, totalCount: 2, recommendation: verdict }), false, verdict)
  }
})

Deno.test('CUL-1277 the free-text gates stay on the literal: an unknown verdict never releases model words (Pattern 10)', () => {
  const copy: IncidentCopy = {
    contextual: () => 'CONTEXTUAL',
    photoUnreadable: () => 'UNREADABLE',
    monitor: () => 'MONITOR',
    visualFlagFallback: () => 'VISUAL',
    noFlag: () => 'NOFLAG',
  }
  for (const verdict of UNKNOWN_VERDICTS) {
    // The cast is the point: these gates are typed to the shipped three, and a value
    // outside them must still take a deterministic template, never the model's prose.
    const recommendation = verdict as unknown as Recommendation
    const readText = selectReadText(copy, {
      petName: 'Rex', recommendation, contextualFlags: [], visualFlags: [],
      modelReadText: 'MODEL PROSE', photoUnreadable: false, hasPhoto: true,
    })
    assertStrictEquals(readText === 'MODEL PROSE', false, verdict)
    assertStrictEquals(
      selectDescription({ modelDescription: 'MODEL PROSE', recommendation, contextualFlags: [], photoUnreadable: false }),
      null,
      verdict,
    )
  }
})

// ── Whose row is it (CUL-1203) ────────────────────────────────────────────────
// An in-memory event_ai_analysis that APPLIES the .eq filters, so a planted row is
// driven through real filtering rather than a recorded call list: the assertion is
// on what the row holds afterwards, which is what an attacker would read.

type Row = Record<string, unknown>

function memoryTable(rows: Row[], opts: { failWith?: string } = {}) {
  const log: string[] = []
  const client = {
    from(table: string) {
      log.push(`from:${table}`)
      let pending: { kind: 'update' | 'upsert'; values: Row } | null = null
      const filters: [string, unknown][] = []
      let selecting = false
      const run = () => {
        if (opts.failWith) return { data: null, error: { message: opts.failWith } }
        if (!pending) return { data: null, error: { message: 'no operation' } }
        if (pending.kind === 'upsert') {
          const hit = rows.find((r) => r.event_id === pending!.values.event_id)
          if (hit) Object.assign(hit, pending.values)
          else rows.push({ ...pending.values })
          return { data: null, error: null }
        }
        const matched = rows.filter((r) => filters.every(([c, v]) => r[c] === v))
        for (const r of matched) Object.assign(r, pending.values)
        return { data: selecting ? matched.map((r) => ({ id: r.id })) : null, error: null }
      }
      const builder = {
        update(values: Row) { pending = { kind: 'update', values }; log.push('update'); return builder },
        upsert(values: Row, o: unknown) { pending = { kind: 'upsert', values }; log.push(`upsert:${JSON.stringify(o)}`); return builder },
        eq(c: string, v: unknown) { filters.push([c, v]); log.push(`eq:${c}`); return builder },
        select(_cols: string) { selecting = true; log.push('select'); return builder },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject)
        },
      }
      return builder
    },
  }
  // deno-lint-ignore no-explicit-any
  return { client: client as any, rows, log }
}

const VICTIM_READ: AnalysisReadFields<'blood'> = {
  recommendation: 'worth_a_call',
  read_text: 'Mochi threw up twice today. Worth a call to your vet.',
  visual_flags: [],
  contextual_flags: [],
  status: 'completed',
  error: null,
}

Deno.test('CUL-1203 — the plant: a humanEdited write-back cannot reach a row filed under another pet', async () => {
  // The attack as it ran before 074: a row on the victim's event, filed under the
  // attacker's pet, with edited_at set so the read takes the update branch.
  const planted: Row = { id: 'r1', event_id: 'E', pet_id: 'attacker-pet', edited_at: 't', read_text: null, recommendation: null }
  const { client } = memoryTable([planted])
  const writeBack = buildAnalysisWriteBack({
    humanEdited: true,
    eventId: 'E',
    petId: 'victim-pet',
    incidentType: 'vomit',
    structuredValues: {},
    readFields: VICTIM_READ,
  })
  const { error } = await applyAnalysisWriteBack(client, { eventId: 'E', petId: 'victim-pet' }, writeBack)
  // Nothing of the victim's read reached the attacker's row, and the miss is SAID.
  assertStrictEquals(planted.read_text, null)
  assertStrictEquals(planted.recommendation, null)
  assertStrictEquals(error, 'no event_ai_analysis row for this event and pet')
})

Deno.test('CUL-1203 — the owner\'s own edited row still takes the read', async () => {
  const own: Row = { id: 'r1', event_id: 'E', pet_id: 'victim-pet', edited_at: 't', description: 'owner edit', read_text: null }
  const { client, log } = memoryTable([own])
  const writeBack = buildAnalysisWriteBack({
    humanEdited: true, eventId: 'E', petId: 'victim-pet', incidentType: 'vomit', structuredValues: {}, readFields: VICTIM_READ,
  })
  const { error } = await applyAnalysisWriteBack(client, { eventId: 'E', petId: 'victim-pet' }, writeBack)
  assertStrictEquals(error, null)
  assertStrictEquals(own.read_text, VICTIM_READ.read_text)
  assertStrictEquals(own.description, 'owner edit') // never-clobber, unchanged
  assertEquals(log, ['from:event_ai_analysis', 'update', 'eq:event_id', 'eq:pet_id', 'select'])
})

Deno.test('CUL-1203 — updateAnalysisRow: zero rows is an error, never a silent success (C-39)', async () => {
  const { client } = memoryTable([])
  const { error } = await updateAnalysisRow(client, { eventId: 'E', petId: 'P' }, { error: 'boom' })
  assertStrictEquals(error, 'no event_ai_analysis row for this event and pet')
})

Deno.test('CUL-1203 — updateAnalysisRow: a database error passes through', async () => {
  const { client } = memoryTable([{ id: 'r1', event_id: 'E', pet_id: 'P' }], { failWith: 'permission denied' })
  const { error } = await updateAnalysisRow(client, { eventId: 'E', petId: 'P' }, { error: 'boom' })
  assertStrictEquals(error, 'permission denied')
})

Deno.test('CUL-1203 — the upsert branch is unchanged: onConflict event_id, the event\'s pet as a value', async () => {
  const { client, rows, log } = memoryTable([])
  const writeBack = buildAnalysisWriteBack({
    humanEdited: false, eventId: 'E', petId: 'victim-pet', incidentType: 'vomit', structuredValues: {}, readFields: VICTIM_READ,
  })
  const { error } = await applyAnalysisWriteBack(client, { eventId: 'E', petId: 'victim-pet' }, writeBack)
  assertStrictEquals(error, null)
  assertEquals(log, ['from:event_ai_analysis', 'upsert:{"onConflict":"event_id"}'])
  assertStrictEquals(rows[0].pet_id, 'victim-pet')
})

Deno.test('CUL-1203 — analysisRowMatchesEvent: no row, or the event\'s own pet; anything else is refused', () => {
  assertStrictEquals(analysisRowMatchesEvent(null, 'P'), true)
  assertStrictEquals(analysisRowMatchesEvent({ pet_id: 'P' }, 'P'), true)
  assertStrictEquals(analysisRowMatchesEvent({ pet_id: 'Q' }, 'P'), false)
  // Fails closed: a select that forgot pet_id, or a NULL, is never a match.
  assertStrictEquals(analysisRowMatchesEvent({}, 'P'), false)
  assertStrictEquals(analysisRowMatchesEvent({ pet_id: null }, 'P'), false)
})

// ── The static half: every UPDATE on the table keys on pet_id ─────────────────
// Engines v3 queues more writers on this table (EN-2, EN-3, EN-4 — CUL-1268
// BRK-1). The unit tests above prove the helper; this proves nobody routes around
// it. It reads every non-test .ts under supabase/functions and, for each
// `.from('event_ai_analysis')` chain that calls `.update(`, requires an
// `.eq('pet_id', …)` in the same chain.
//
// BLIND SPOTS, stated so a green run is not read as more (C-38): a chain split
// across variables (`const t = c.from('event_ai_analysis'); t.update(…)`), a raw
// SQL or RPC writer, and a table name built at runtime are all invisible; and the
// chain's END is a text heuristic (see analysisChains), so a `.eq('pet_id', …)`
// that follows an unkeyed update on the same line or inside an expression the
// heuristic does not split can still launder it; and the comment blanker does
// not parse regex literals, so a `//` inside one reads as a comment start. The invariant itself is
// migration 074's trigger; this pins the write-back's keying.

async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir)
    if (entry.isDirectory) yield* sourceFiles(child)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('_test.ts')) yield child
  }
}

// The chain runs from `.from('event_ai_analysis')` to the statement's end. The
// house style omits semicolons, so the end is the FIRST of: a `;`, a blank line,
// the next `.from(` (the next query, e.g. inside a Promise.all array), or a line
// opening a new statement. Without the last two, an unkeyed update followed on
// the very next line by an unrelated query's `.eq('pet_id', …)` read as keyed
// (rls-privacy-reviewer H3, measured as a surviving mutant).
const NEXT_STATEMENT = /\n\s*(?:await|const|let|return|if|for|throw|try)\b/

// Comments are blanked first (newlines kept), so a `;` or a blank line inside
// prose cannot end a chain early — which would drop an unkeyed update from the
// scan entirely (code-reviewer finding on this PR; this file's house style is
// semicolon-rich prose). One left-to-right pass that tracks string literals, so
// a `//` inside a string is not a comment (C-18's single-pass rule). Strings are
// KEPT: the table name the scan looks for is one.
function blankComments(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    if (quote) {
      out += c
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' '
      continue
    }
    out += c
    i++
  }
  return out
}

function analysisChains(raw: string): string[] {
  const src = blankComments(raw)
  const out: string[] = []
  for (const m of src.matchAll(/\.from\(\s*['"]event_ai_analysis['"]\s*\)/g)) {
    const rest = src.slice(m.index!)
    const ends = [
      rest.indexOf(';'),
      rest.indexOf('\n\n'),
      rest.indexOf('.from(', m[0].length),
      rest.search(NEXT_STATEMENT),
    ].filter((i) => i > 0)
    out.push(rest.slice(0, ends.length ? Math.min(...ends) : rest.length))
  }
  return out
}

Deno.test('CUL-1203 — every event_ai_analysis UPDATE under supabase/functions keys on pet_id', async () => {
  const root = new URL('../', import.meta.url)
  const updates: { file: string; chain: string }[] = []
  for await (const file of sourceFiles(root)) {
    const src = await Deno.readTextFile(file)
    for (const chain of analysisChains(src)) {
      if (/\.update\(/.test(chain)) updates.push({ file: file.pathname, chain })
    }
  }
  // Floor: the helper's OWN chain must be among them, keyed — not merely "some
  // update was found", which a scan dropping every other chain would still pass.
  const helper = updates.filter((u) =>
    u.file.endsWith('/_shared/incident-analysis.ts') && /\.update\(values\)/.test(u.chain))
  assertStrictEquals(helper.length, 1, 'the scan did not find updateAnalysisRow\'s own chain')
  for (const { file, chain } of updates) {
    assertStrictEquals(
      /\.eq\(\s*['"]pet_id['"]/.test(chain), true,
      `${file}: an event_ai_analysis update without .eq('pet_id', …) — route it through updateAnalysisRow (CUL-1203)`,
    )
  }
})

Deno.test('CUL-1203 — the scan sees an unkeyed update when there is one (the guard, proven)', () => {
  const unkeyed = "await adminClient\n  .from('event_ai_analysis')\n  .update(values)\n  .eq('event_id', eventId)\n\nconst x = 1"
  const keyed = "await c.from('event_ai_analysis').update(v).eq('event_id', e).eq('pet_id', p).select('id')\n"
  const [u] = analysisChains(unkeyed)
  const [k] = analysisChains(keyed)
  assertStrictEquals(/\.update\(/.test(u) && !/\.eq\(\s*['"]pet_id['"]/.test(u), true)
  assertStrictEquals(/\.eq\(\s*['"]pet_id['"]/.test(k), true)
  // And the chain stops at the statement: a later pet_id filter on ANOTHER query
  // must not launder this one — after a blank line, on the very next line
  // (H3's surviving mutant), or as the next element of a Promise.all array.
  const [laundered] = analysisChains(unkeyed + "\nawait c.from('events').select('id').eq('pet_id', p)")
  assertStrictEquals(/\.eq\(\s*['"]pet_id['"]/.test(laundered), false)
  const adjacent =
    "await adminClient\n  .from('event_ai_analysis')\n  .update(values)\n  .eq('event_id', eventId)\n" +
    "await adminClient.from('events').select('id').eq('pet_id', petId)\n"
  const [nextLine] = analysisChains(adjacent)
  assertStrictEquals(/\.update\(/.test(nextLine) && !/\.eq\(\s*['"]pet_id['"]/.test(nextLine), true)
  const inArray =
    "await Promise.all([\n  c.from('event_ai_analysis').update(v).eq('event_id', e),\n  c.from('events').select('id').eq('pet_id', p),\n])"
  const [arrayElem] = analysisChains(inArray)
  assertStrictEquals(/\.update\(/.test(arrayElem) && !/\.eq\(\s*['"]pet_id['"]/.test(arrayElem), true)
  // A `;` inside a comment between .from and .update must not end the chain
  // before the update (which would drop it from the scan unseen), nor may a
  // block comment spanning lines.
  const commented =
    "await c\n  .from('event_ai_analysis')\n  // the owner's row; never another pet's\n  /* see CUL-1203;\n     074 */\n  .update(v)\n  .eq('event_id', e)\n"
  const [throughComment] = analysisChains(commented)
  assertStrictEquals(/\.update\(/.test(throughComment), true)
  // And a `//` inside a string is not a comment.
  assertStrictEquals(blankComments("const u = 'https://x'; // gone"), "const u = 'https://x';        ")
})

Deno.test('CUL-1203 — step 3b reads pet_id and refuses on it before any write (wiring, static)', async () => {
  // runIncidentAnalysis has no end-to-end harness, so its two load-bearing lines
  // are pinned as text. Dropping pet_id from the select would refuse EVERY
  // re-analysis (the helper fails closed); dropping the call would leave the
  // decision to the database alone.
  const src = await Deno.readTextFile(new URL('./incident-analysis.ts', import.meta.url))
  const handler = src.slice(src.indexOf('export async function runIncidentAnalysis'))
  // Since PR-04b every read of the stored row selects `storedColumns` (readStoredRow,
  // which also throws on a read error, CUL-817); the behaviour half of this guard is in
  // incident-analysis.pipeline.test.ts ("a row filed under another pet is refused").
  const columns = /const storedColumns = \[([^\]]*)\]/.exec(handler)
  assertStrictEquals(columns !== null, true, 'storedColumns moved: re-anchor this guard, never delete it')
  assertStrictEquals(columns![1].split(',').map((c) => c.trim()).includes("'pet_id'"), true)
  assertStrictEquals(/const existing = await readStoredRow\(\)/.test(handler), true, 'the step-3b read moved')
  const refuse = handler.indexOf('if (!analysisRowMatchesEvent(existing, petId))')
  const firstWrite = handler.search(/applyAnalysisWriteBack\(|\.upsert\(|recordUsage\(/)
  assertStrictEquals(refuse > 0 && refuse < firstWrite, true, 'the refusal must run before the usage counter and every write')
  // And the branch must LEAVE: an `if` that only logs would fall through to the
  // writes (rls-privacy-reviewer H2 — a log-only mutant survived the check above).
  const branch = handler.slice(refuse, handler.indexOf('\n    }\n', refuse))
  assertStrictEquals(/\n\s*return Response\.json\(/.test(branch), true, 'the refusal branch must return')
  assertStrictEquals(/status:\s*409/.test(branch), true, 'the refusal must answer 409')
  // The catch's re-read decides the failure write off a row, so it asks the same
  // question of that row (code-reviewer finding on this PR).
  const catchRead = handler.slice(handler.indexOf('let latestReadFailed'))
  assertStrictEquals(/\.select\(storedColumns\)/.test(catchRead), true)
  assertStrictEquals(/analysisRowMatchesEvent\(latestRow \?\? null, petIdForFailure\)/.test(catchRead), true)
})

// ── Read words reach the table only through the builder (CUL-1323) ────────────
// The clear lives in buildAnalysisWriteBack, so "a new read clears the hide" is only
// as true as "every write of a verdict or read text goes through it". The capped
// path's escalation is the write no test can drive (runIncidentAnalysis has no
// end-to-end harness), and bypassing the builder there left every test in this
// directory green (adversarial pass on #952). So the sinks are scanned instead:
//   1. every event_ai_analysis write under supabase/functions takes the generic
//      helper's own parameter, the failure write's values, or a literal naming
//      neither `read_text` nor `recommendation` and spreading nothing;
//   2. every applyAnalysisWriteBack call is handed a value bound to
//      buildAnalysisWriteBack(…);
//   3. every other updateAnalysisRow call is handed `.values` of a builder's
//      result (the failure write's, or the analysis builder's).
// Blind spots, stated: the binding is read off the nearest `const|let` of that name
// before the call, so a reassignment between them is not followed; a helper that
// wraps the table write under another name is caught by rule 1 only if its
// argument is not one of the three sanctioned names.

type Sink = { kind: string; at: number }

// The argument list of the call whose `(` is at `open`, balanced over () [] {},
// strings skipped, split at top-level commas.
function callArgs(src: string, open: number): string[] {
  const args: string[] = []
  let depth = 0
  let start = open + 1
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) {
        args.push(src.slice(start, i).trim())
        return args.filter((a) => a.length > 0)
      }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i).trim())
      start = i + 1
    }
  }
  return args
}

function enclosingFunction(src: string, at: number): string | null {
  const all = [...src.slice(0, at).matchAll(/\bfunction\s+(\w+)/g)]
  return all.length ? all[all.length - 1][1] : null
}

// What `name` was last bound to before `at` (the rest of that line).
function boundTo(src: string, name: string, at: number): string {
  const all = [...src.slice(0, at).matchAll(new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*([^\\n]*)`, 'g'))]
  return all.length ? all[all.length - 1][1].trim() : ''
}

const BUILT = /^(buildAnalysisWriteBack|buildFailureWrite)\(/

function readWordSinks(raw: string): { sanctioned: Sink[]; violations: string[] } {
  const src = blankComments(raw)
  const sanctioned: Sink[] = []
  const violations: string[] = []
  const lineOf = (i: number) => src.slice(0, i).split('\n').length

  // 1. Direct writes to the table.
  for (const m of src.matchAll(/\.from\(\s*['"]event_ai_analysis['"]\s*\)/g)) {
    const chain = analysisChains(src.slice(m.index!))[0] ?? ''
    const w = /\.(update|upsert|insert)\(/.exec(chain)
    if (!w) continue
    const open = m.index! + w.index + w[0].length - 1
    const arg = callArgs(src, open)[0] ?? ''
    const fn = enclosingFunction(src, m.index!)
    const owner = /^(\w+)\.values$/.exec(arg)
    if (arg === 'values' && fn === 'updateAnalysisRow') sanctioned.push({ kind: 'updateAnalysisRow', at: open })
    else if (arg === 'writeBack.values' && fn === 'applyAnalysisWriteBack') sanctioned.push({ kind: 'applyAnalysisWriteBack', at: open })
    else if (owner && /^buildFailureWrite\(/.test(boundTo(src, owner[1], open))) sanctioned.push({ kind: 'failure write', at: open })
    else if (arg.startsWith('{') && !/\b(?:read_text|recommendation)\b|\.\.\./.test(arg)) sanctioned.push({ kind: 'state literal', at: open })
    else violations.push(`line ${lineOf(open)} (${fn}): event_ai_analysis .${w[1]}(${arg.slice(0, 60)})`)
  }

  // 2. applyAnalysisWriteBack is handed a builder's result.
  for (const m of src.matchAll(/(?<!function\s)\bapplyAnalysisWriteBack\(/g)) {
    const open = m.index! + m[0].length - 1
    const arg = callArgs(src, open)[2] ?? ''
    if (/^\w+$/.test(arg) && /^buildAnalysisWriteBack\(/.test(boundTo(src, arg, open))) {
      sanctioned.push({ kind: 'builder → apply', at: open })
    } else violations.push(`line ${lineOf(open)}: applyAnalysisWriteBack(…, ${arg.slice(0, 60)})`)
  }

  // 3. updateAnalysisRow is handed a builder's `.values`.
  for (const m of src.matchAll(/(?<!function\s)\bupdateAnalysisRow\(/g)) {
    const open = m.index! + m[0].length - 1
    const arg = callArgs(src, open)[2] ?? ''
    const owner = /^(\w+)\.values$/.exec(arg)
    if (enclosingFunction(src, open) === 'applyAnalysisWriteBack' && arg === 'writeBack.values') continue
    if (owner && BUILT.test(boundTo(src, owner[1], open))) sanctioned.push({ kind: 'builder → update', at: open })
    else violations.push(`line ${lineOf(open)}: updateAnalysisRow(…, ${arg.slice(0, 60)})`)
  }
  return { sanctioned, violations }
}

Deno.test('CUL-1323 — every write of read words under supabase/functions goes through buildAnalysisWriteBack', async () => {
  const root = new URL('../', import.meta.url)
  const violations: string[] = []
  for await (const file of sourceFiles(root)) {
    const { violations: v } = readWordSinks(await Deno.readTextFile(file))
    violations.push(...v.map((x) => `${file.pathname}: ${x}`))
  }
  assertEquals(violations, [])

  // Floor, from the pipeline's own text: each sanctioned shape was actually SEEN,
  // and the capped branch's escalation is one of the builder → apply calls.
  const raw = await Deno.readTextFile(new URL('./incident-analysis.ts', import.meta.url))
  const { sanctioned } = readWordSinks(raw)
  const kinds = new Set(sanctioned.map((s) => s.kind))
  for (const k of ['updateAnalysisRow', 'applyAnalysisWriteBack', 'failure write', 'state literal', 'builder → apply', 'builder → update']) {
    assertStrictEquals(kinds.has(k), true, `the scan never saw a "${k}" sink`)
  }
  const src = blankComments(raw)
  const capStart = src.indexOf('if (!gate.allow) {')
  const capEnd = src.indexOf('Response.json(', capStart)
  assertStrictEquals(capStart > 0 && capEnd > capStart, true, 'the capped branch moved; re-anchor this floor')
  assertStrictEquals(
    sanctioned.some((s) => s.kind === 'builder → apply' && s.at > capStart && s.at < capEnd),
    true,
    'the capped escalation no longer writes through buildAnalysisWriteBack',
  )
})

Deno.test('CUL-1323 — the builder scan sees a bypass when there is one (the guard, proven)', () => {
  const bypasses = [
    // The adversarial pass's mutant: the capped escalation straight to the helper.
    'async function runIncidentAnalysis() {\n  const { error } = await updateAnalysisRow(adminClient, { eventId, petId }, readFields)\n}',
    // A hand-built write-back, inline and bound.
    "async function runIncidentAnalysis() {\n  await applyAnalysisWriteBack(adminClient, { eventId, petId }, { mode: 'update', values: readFields })\n}",
    "async function runIncidentAnalysis() {\n  const writeBack = { mode: 'update' as const, values: { ...readFields } }\n  await applyAnalysisWriteBack(adminClient, { eventId, petId }, writeBack)\n}",
    // Direct table writes carrying words.
    "async function runIncidentAnalysis() {\n  await c.from('event_ai_analysis').update({ ...readFields }).eq('event_id', e).eq('pet_id', p)\n}",
    "async function runIncidentAnalysis() {\n  await c.from('event_ai_analysis').upsert({ event_id: e, pet_id: p, read_text: t }, { onConflict: 'event_id' })\n}",
    "async function runIncidentAnalysis() {\n  await c.from('event_ai_analysis').upsert(readFields, { onConflict: 'event_id' })\n}",
    // `values` outside the generic helper is not the helper's parameter.
    "async function runIncidentAnalysis() {\n  await c.from('event_ai_analysis').update(values).eq('event_id', e).eq('pet_id', p)\n}",
  ]
  for (const src of bypasses) {
    assertStrictEquals(readWordSinks(src).violations.length, 1, src)
  }
  // And the shapes it must let through are not flagged.
  const allowed =
    "async function runIncidentAnalysis() {\n" +
    '  const writeBack = buildAnalysisWriteBack({ humanEdited, eventId, petId, incidentType, structuredValues, readFields })\n' +
    '  await applyAnalysisWriteBack(adminClient, { eventId, petId }, writeBack)\n' +
    "  await adminClient.from('event_ai_analysis').upsert({ event_id: eventId, pet_id: petId, incident_type: incidentType, status, error: null }, { onConflict: 'event_id' })\n" +
    '  const failureWrite = buildFailureWrite({ existing, eventId, petId, incidentType, message })\n' +
    '  await updateAnalysisRow(adminClient, { eventId, petId }, failureWrite.values)\n' +
    '}'
  assertEquals(readWordSinks(allowed).violations, [])
})
