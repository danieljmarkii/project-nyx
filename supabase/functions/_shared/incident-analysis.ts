// Supabase Edge Functions shared module — the per-incident AI analysis pipeline
// (B-247 PR 2; D2 ratified 2026-07-16 — docs/nyx-stool-analysis-requirements.md §2).
//
// ONE pipeline, parameterized by incident type — the function-level mirror of
// migration 013's rule for the event_ai_analysis table ("ONE feature,
// parameterized by incident_type — do NOT fork the table per type").
// runIncidentAnalysis(descriptor, req) owns the full flow:
//
//   auth → confused-deputy guard → cap/flag gate → context SQL →
//   image fetch/downscale → vision call → escalation floor →
//   never-clobber write-back → response
//
// Each incident type (analyze-vomit today, analyze-stool next) is a small
// DESCRIPTOR: enums + tool schema + system prompt + contextual-flag SQL +
// per-type floor rules (WHICH findings become flags) + copy builders + the
// Track-2 FUNCTION_KEY / FLAG_KEY / CAPS. A new photo-analysis type =
// descriptor file + schema migration + one monetization config row — no
// handler copy.
//
// SAFETY CONTRACT (clinical-guardrails — the framework half is owned HERE):
//   - The recommendation enum has NO reassuring value (Pattern 1).
//   - The deterministic escalation floor cannot be downgraded by the model:
//     contextual and visual flags force worth_a_call (Pattern 2).
//   - Contextual flags are server-computed SQL, never model-reasoned (Pattern 3).
//   - The model's free text reaches the owner ONLY on the worth_a_call
//     escalation path — a model-raised visual flag or the model's own
//     worth_a_call, either way a PRESENT-concern read; every other path is a
//     deterministic per-type template (B-060 — the guarantee is STRUCTURAL,
//     enforced by selectReadText).
//   - Re-analysis never clobbers a human-edited row (Pattern 7).
//   - Re-analysis never lowers a stored escalation; only the owner's own
//     correction does (CUL-1201 part 2, resolveReanalysisWrite).
//   - A run that fails keeps the escalation it had already computed (CUL-815,
//     buildRescueRead), and no write is decided on an unanswered read of the
//     STORED ROW (CUL-817). The context and attachment reads still fail open
//     (CUL-119, CUL-1327); this contract does not cover them yet.
//   - Unreadable input degrades honestly — never 500s, never reassures (Pattern 5).
// A descriptor cannot weaken any of the above: it controls which findings
// become flags, never what flags do. If a future incident type genuinely needs
// a different floor SHAPE, that is a deliberate framework change with its own
// adversarial review — not a descriptor override.
//
// Every NEW descriptor still triggers its own mandatory adversarial-reviewer
// pass + reassurance-word regex tests over its copy. That DoD line is NOT
// inherited from a sibling type's prior review (D2, non-negotiable).
//
// No runtime coupling: scripts/deploy-edge.sh esbuild-inlines this module into
// each function's self-contained bundle, so functions still deploy
// independently. The pipeline below is extracted VERBATIM from analyze-vomit
// (B-027/B-028/B-060 + the T2-3 gate); analyze-vomit's own test suite passing
// unmodified is the regression proof for the extraction (PR 2 AC).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithTimeout } from './http.ts'
// Engines v3 (PR-11a, CUL-1267): the rollout flag, read fail-closed for the record's owner,
// and the one writer of every stamp migration 075 added (the rule is on engineStamps.ts).
import type { EngineFlags } from './engineFlags.ts'
import { readEngineFlags } from './engineFlagsRead.ts'
import { buildIncidentStamps, stampIncidentWrite, type IncidentStamps } from './engineStamps.ts'
// The ONE quiet-verdict list, shared with the phone (CUL-1277). Every guard below that
// protects an escalation already in the RECORD reads it, so a verdict a later rule wrote
// (EN-3's tiers, a flag rolled back) is protected like `worth_a_call`. The free-text gates
// (Pattern 10) deliberately do NOT: see `selectReadText`.
import { isEscalationVerdict, isQuietVerdict } from '../../../lib/incidentVerdict.ts'

export type { SupabaseClient }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Recommendation enum (Pattern 1 — no reassuring value, by construction) ────
// Adding a value that asserts wellness ("looks_normal", "all_clear", …) is a
// clinical regression on EVERY incident type at once: flag and route to PM.
export const RECOMMENDATIONS = ['worth_a_call', 'monitor', 'not_enough_to_say'] as const
export type Recommendation = typeof RECOMMENDATIONS[number]

// ── Claude response + tool-result helpers ──────────────────────────────────────

export interface ClaudeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  stop_reason: string
}

// The tool_use input for the descriptor's tool, or null when the model returned
// no usable tool call. Per-type parsers sanitize from here.
export function getToolUseInput(response: ClaudeResponse, toolName: string): Record<string, unknown> | null {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
  if (!block || block.type !== 'tool_use') return null
  return block.input
}

// Bad/hallucinated enum values are dropped to null/filtered rather than tripping
// the DB enum on write — every per-type parser sanitizes through these.
export function sanitizeEnum(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

export function sanitizeEnumArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && allowed.includes(v))
}

export function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000
}

// ── The escalation floor (Pattern 2 — the mechanism, framework-owned) ─────────
// Contextual and visual flags both force worth_a_call; no-photo / not-the-subject
// collapses to not_enough_to_say; otherwise monitor. There is intentionally no
// path to a reassuring verdict. Per-type floor RULES enter as flags (the
// descriptor decides which findings become contextual/visual flags); the
// mechanism itself is not descriptor-overridable.
export function applyEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowSubject: boolean
  hasPhoto: boolean
  visualFlags: string[]
  contextualFlags: string[]
}): Recommendation {
  if (params.contextualFlags.length > 0) return 'worth_a_call'
  if (params.visualFlags.length > 0) return 'worth_a_call'
  if (!params.hasPhoto) return 'not_enough_to_say'
  if (!params.appearsToShowSubject) return 'not_enough_to_say'
  if (params.modelRecommendation === 'worth_a_call') return 'worth_a_call'
  return 'monitor'
}

// ── Partial-read honesty (B-203 / CUL-298 — a companion to the floor) ─────────
// A multi-photo event can end up read on only SOME of its photos: an oversized or
// undecodable frame the server-side downscale couldn't bring under Claude's cap, or
// attachments beyond MAX_PHOTOS_PER_ANALYSIS. `usable` is what actually reached the
// model; `total` is every photo on the event. When the model saw a NON-EMPTY PROPER
// SUBSET (0 < usable < total) AND what it saw did not escalate, the pipeline refuses
// to stand behind the benign result: an unseen frame could hold the red flag the
// readable ones lack, so a 'monitor' verdict — and its structured observations, e.g.
// "Blood: none visible" from a partial view — would be a reassurance-on-absence
// (clinical-guardrails Pattern 1). The caller then collapses to the fully-unread
// shape (not_enough_to_say + null structured fields). Any escalation already reached
// (worth_a_call — from a visual flag the photos surfaced, the model's own call, or a
// contextual flag computed from the record) is NEVER collapsed: presence always
// escalates (Pattern 2). The caller relies on the floor running FIRST, so every such
// escalation is already `worth_a_call` before this guard inspects the verdict.
// ONLY A QUIET VERDICT COLLAPSES (CUL-1277): the question is "is this benign enough that an
// unseen frame could hide the flag?", so it asks the quiet list rather than excusing the
// one literal escalation. A verdict the floor learns to emit later (EN-3) is never
// collapsed until someone decides it is quiet.
// usable === 0 is the fully-unreadable case (photoUnreadable), handled separately,
// not here. Pure + exported so this count boundary is unit-tested rather than
// asserted inline in the un-tested pipeline.
export function shouldCollapsePartialRead(params: {
  usableCount: number
  totalCount: number
  // Text, so the guard is testable (and safe) over a verdict this code cannot name.
  recommendation: string
}): boolean {
  const partial = params.usableCount > 0 && params.usableCount < params.totalCount
  return partial && isQuietVerdict(params.recommendation)
}

// ── Read-text selection (B-060 — the mechanism, framework-owned) ──────────────
// The per-type templates are the descriptor's; the selection ORDER — above all
// the guarantee that the model's free text reaches the owner ONLY on the
// worth_a_call escalation path (a model-raised visual flag or the model's own
// worth_a_call — either way it names a PRESENT concern, the safe direction) —
// is owned here. The monitor / no-flag path is the
// reassurance-on-absence risk and is ALWAYS a deterministic template. (A regex
// denylist was tried and rejected: it missed ~86% of plausible model
// reassurance phrasings — adversarial review 2026-06-24. The guarantee is
// structural, not lexical.)
//
// THE LITERAL STAYS HERE, ON PURPOSE (CUL-1277). The escalation guards in this file
// ask the shared quiet list (`isEscalationVerdict`), because they PROTECT a verdict
// already in the record and must fail toward keeping it. This gate and
// `selectDescription` below do the opposite job: they RELEASE the model's own words,
// so they must fail toward withholding them (Pattern 10). On "not quiet", a verdict
// nobody has defined yet would carry model prose. A new escalating value earns free
// text only when its own change (EN-3) says so, here, in words.

export interface IncidentCopy<TFlag extends string = string> {
  // Floor escalated on CONTEXT — names the contextual reason (highest-acuity
  // flag wins); the model's photo-only read may contradict it and never surfaces.
  contextual(petName: string, flags: TFlag[]): string
  // Photo present but unreadable — honest about the failure, never reassures.
  photoUnreadable(petName: string): string
  // monitor — a clear photo, no flag. Forward-looking; never comments on the
  // absence of concern (absence ≠ wellness).
  monitor(petName: string): string
  // worth_a_call on a visual flag when the model wrote no read of its own —
  // names the present concern plainly and routes to the vet.
  visualFlagFallback(petName: string, visualFlags: string[]): string
  // not_enough_to_say — unclear photo, not the subject, or no photo at all.
  noFlag(petName: string, hasPhoto: boolean): string
}

export function selectReadText<TFlag extends string>(
  copy: IncidentCopy<TFlag>,
  params: {
    petName: string
    recommendation: Recommendation
    contextualFlags: TFlag[]
    visualFlags: string[]
    modelReadText: string | null
    photoUnreadable: boolean
    hasPhoto: boolean
  },
): string {
  const { petName, recommendation, contextualFlags, visualFlags, modelReadText, photoUnreadable, hasPhoto } = params
  // 1. Floor escalated on CONTEXT — the model's photo-only read may contradict it.
  if (contextualFlags.length > 0) return copy.contextual(petName, contextualFlags)
  // 2. Unreadable photo — honest failure, never reassures, never the model's words.
  if (photoUnreadable) return copy.photoUnreadable(petName)
  // 3. Escalation — the ONLY path that surfaces the model's free text (a model-
  //    raised visual flag, or the model's own worth_a_call; a present-concern read).
  if (recommendation === 'worth_a_call') return modelReadText ?? copy.visualFlagFallback(petName, visualFlags)
  // 4. monitor — a clear photo, no flag. NEVER the model's read (the reassurance-
  //    on-absence risk); a deterministic forward-looking template instead.
  if (recommendation === 'monitor') return copy.monitor(petName)
  // 5. not_enough_to_say — unclear photo, not the subject, or no photo.
  return copy.noFlag(petName, hasPhoto)
}

// ── Description selection (CUL-152 / B-179 — the SECOND owner-facing free-text field) ──
// The model emits two free-text strings: read_text (selected above) and `description`.
// read_text is gated TWICE — the descriptor's parse nulls it unless the model itself
// self-escalated, and selectReadText above only surfaces it on a non-contextual, readable
// FINAL worth_a_call. `description` is a structured column written straight from the parse,
// so it bypasses selectReadText and needs its own POST-FLOOR gate to get the same guarantee.
// This is that gate: the model's description surfaces ONLY under the same condition
// selectReadText surfaces read_text (a non-contextual, readable, final worth_a_call), else
// null. The caller passes the PARSE-gated description (already null unless the model itself
// self-escalated), so the combined guarantee matches read_text exactly: description surfaces
// iff (the model self-escalated) AND (the final read is a non-contextual, readable
// worth_a_call). Pure + exported so the never-reassure guarantee on description is
// unit-tested, not asserted by a comment. Without this second gate a model that returns
// worth_a_call on a photo it also says is not the subject (floor DOWNGRADES to
// not_enough_to_say) would surface a reassuring description on a "Not enough to say" card —
// reassurance-on-a-non-escalation, the exact Pattern-1 miss (adversarial review, this PR).
export function selectDescription(params: {
  modelDescription: string | null
  recommendation: Recommendation
  contextualFlags: string[]
  photoUnreadable: boolean
}): string | null {
  const maySurface =
    params.contextualFlags.length === 0 &&
    !params.photoUnreadable &&
    params.recommendation === 'worth_a_call'
  return maySurface ? params.modelDescription : null
}

// ── Write-back decision (Pattern 7 — the never-clobber guard, B-028) ──────────
// The n=1 read + flags always refresh (so the deterministic floor can
// re-escalate on worsening context); the structured CLINICAL fields are the
// owner's once edited and must survive a re-analysis untouched.

export interface AnalysisReadFields<TFlag extends string = string> {
  recommendation: Recommendation
  read_text: string | null
  visual_flags: string[]
  contextual_flags: TFlag[]
  status: string
  error: null
}

export type AnalysisWriteBack =
  | { mode: 'update'; values: Record<string, unknown> }
  | { mode: 'upsert'; values: Record<string, unknown> }

// When the owner has edited any structured field (edited_at set), refresh ONLY
// the read + flags and leave every structured field + the cached ai_raw_payload
// untouched. Otherwise (first analysis, or an un-edited row) write the full
// payload: the descriptor's structured column values + the framework-owned
// identity keys. Identity (event_id / pet_id / incident_type) is spread AFTER
// structuredValues so a descriptor bug can never override row identity; the
// read fields land last, matching the shipped vomit semantics.
//
// A NEW READ CLEARS THE OWNER'S "HIDE" (CUL-1323, PM-ruled 2026-09-27). A
// dismissal is a statement about the words the owner read, and this write puts a
// read there they have not seen. The words can repeat (the templated reads do),
// and clearing on a repeat only ever shows the owner more, so the rule does not
// ask whether they changed. Before this, `dismissed_at` belonged to the INCIDENT:
// an owner who hid a calm read and later asked for a new one (Try again, a
// replaced photo, Ask's live read) got a Worth a call rendered as "AI note
// hidden", with the escalation on the record and off the screen. It is set here,
// in the one builder every read goes through (both modes, and the capped path's
// contextual escalation), and AFTER the read fields so no caller can carry an old
// dismissal forward. It is a presentation state, not a clinical field, so the
// never-clobber guarantee below is untouched.
//
// The other writes, each pinned end to end in incident-analysis.pipeline.test.ts:
//   · the failure write (`buildFailureWrite`) records no new read and leaves the
//     hide alone, EXCEPT its rescue, which writes an escalation's words and clears
//     it for the same reason this builder does;
//   · a HOLD (`resolveReanalysisWrite`) keeps the stored escalation's words and
//     clears the hide too: it is a new read, and a hide on file may predate the client
//     that asks which words it was made on (see ReanalysisWrite).
// The sink scan in incident-analysis.test.ts fails the build on a write of read
// words that comes from none of these. The ORDER half is the client's: a Hide
// writes only over the read on screen (lib/analysisDismissal.ts), so on that client
// a read landing first is never hidden unseen. A build already on a phone hides
// unconditionally, and nothing here can refuse it; that residual, and the rows the
// old bug left hidden, are CUL-1357.
export function buildAnalysisWriteBack<TFlag extends string>(params: {
  humanEdited: boolean
  eventId: string
  petId: string
  incidentType: string
  structuredValues: Record<string, unknown>
  readFields: AnalysisReadFields<TFlag>
}): AnalysisWriteBack {
  if (params.humanEdited) {
    // ONLY the read columns (and the hide they supersede). No structured field,
    // no ai_raw_payload — that's the never-clobber guarantee, by construction.
    return { mode: 'update', values: { ...params.readFields, dismissed_at: null } }
  }
  return {
    mode: 'upsert',
    values: {
      ...params.structuredValues,
      event_id: params.eventId,
      pet_id: params.petId,
      incident_type: params.incidentType,
      ...params.readFields,
      dismissed_at: null,
    },
  }
}

// ── The stored row, as a re-analysis must read it (CUL-817, CUL-1201, CUL-532) ──

// A read that has not answered is never an empty record (the CUL-575 rule, applied
// server-side). Step 3b used to drop this error, so an unreachable table read as "no
// row" and every guard below took its permissive branch: an owner's edits upserted
// over, a completed read capped over. Throwing lands in the catch, which re-reads and
// fails closed on its own (CUL-812), and it throws before the gate, so no usage unit
// is spent on a run that could not have written safely.
export function existingRowOrThrow<T>(
  result: { data: T | null; error: { message: string } | null },
): T | null {
  if (result.error) throw new Error(`Existing analysis read failed: ${result.error.message}`)
  return result.data ?? null
}

// The stored row as the pipeline selects it (readStoredRow): the typed columns every
// decision reads, plus the descriptor's red-flag columns by name.
export type StoredRow = Record<string, unknown> & {
  pet_id?: string | null
  edited_at?: string | null
  status?: string | null
  recommendation?: string | null
}

// What a re-analysis learns about the row already on file: every field a write
// decision below switches on, and nothing else.
export interface StoredAnalysis {
  recommendation: string | null
  status: string | null
  // edited_at is set: the owner has corrected a structured field (Pattern 7).
  edited: boolean
  // The red flags the stored structured columns assert now: the owner's word once
  // edited. The descriptor's present-only derivation (Pattern 9), never the cached
  // visual_flags, which an owner edit deliberately leaves stale.
  presentFlags: string[]
  // dismissed_at is set: the owner's hide is on the row (CUL-1323). A hold clears it.
  hidden: boolean
}

export function snapshotStoredAnalysis<TAnalysis extends IncidentAnalysisBase, TFlag extends string>(
  descriptor: Pick<IncidentDescriptor<TAnalysis, TFlag>, 'presentFlagsFromStructured'>,
  row: Record<string, unknown> | null,
): StoredAnalysis | null {
  if (!row) return null
  return {
    recommendation: typeof row.recommendation === 'string' ? row.recommendation : null,
    status: typeof row.status === 'string' ? row.status : null,
    edited: !!row.edited_at,
    presentFlags: descriptor.presentFlagsFromStructured(row),
    hidden: !!row.dismissed_at,
  }
}

// A hold keeps the stored verdict, read text, flags and structured columns exactly as
// they are. The one thing it may write is the STATUS, when the stored row is not a
// finished read (a CUL-812 or CUL-815 rescue left it 'failed'): this run did finish,
// so the row takes this run's status ('completed', or 'uncertain' for a read that
// could not say) and drops the stale error. Left 'failed', the row would disable Edit,
// and Ask's A8 would re-run a live read, and spend a unit, on every question about it.
//
// And it clears the owner's hide (CUL-1323): a hold is a new read, and the ruling is
// that every new read clears it. "Those are the words the owner hid" is true only of a
// hide made through the compare-and-set client (lib/analysisDismissal.ts). Builds
// already on phones send an unconditional Hide, so a stale screen can hide a Worth a
// call that landed unseen, and rows the pre-CUL-1323 bug left hidden are on file now.
// Kept, that hide would stand over the escalation across every calmer read after it
// (adversarial round 2). Cleared, the escalation shows, and the owner can hide it again.
// This repairs such a row only when another read runs, and a hidden row offers no
// Re-run, so it is a mitigation, not the fix: CUL-1357 carries the server-side one.
export type ReanalysisWrite =
  | AnalysisWriteBack
  | { mode: 'hold'; values: { status?: string; error?: null; dismissed_at?: null } | null }

// The step-9 write decision. Two rules on top of Pattern 7's never-clobber:
//
// 1. NEVER LOWER A STORED ESCALATION (CUL-1201 part 2, ruled 2026-09-26). A second
//    run of one incident that sees less is absence, and absence is not wellness. The
//    escalation stands across re-reads and photo swaps, contextual ones included:
//    both descriptors count their context windows back from Date.now() (CUL-131), so
//    a context that lapsed because a day passed cannot be told from one the owner
//    corrected by deleting a duplicate. An escalation replacing an escalation is not a
//    lowering and writes as before.
//
//    There is deliberately NO owner-correction exception here yet. The obvious one
//    ("an edited row whose red-flag columns the owner cleared") was built and broken
//    by the adversarial pass: ai_raw_payload is frozen at the read the owner edited
//    (Pattern 7), so it cannot say whether the STORED verdict came from that read or
//    from a later re-escalation the owner never saw (owner clears a false flag on
//    photo 1, photo 2 re-escalates on real blood, photo 3 reads clean: the exception
//    fired and lowered photo 2's escalation). An owner-lowers path needs a read-time
//    stamp to compare edited_at against (CUL-1201 part 1, PR-10) or an explicit
//    owner act on the verdict itself (CUL-1107 / CUL-409). Until then the verdict
//    errs loud; Home and the vet report already honour the owner's cleared field,
//    because they derive from the structured columns (Pattern 9).
//
// 2. A STORED RED FLAG CARRIES; A STORED ABSENCE DOES NOT (CUL-532). When the stored
//    structured columns assert a red flag this run's columns don't, the write refreshes
//    the read fields only, so a re-read that could not see (a fully unreadable photo, a
//    collapsed partial read) or saw less no longer nulls "fresh red blood" off the
//    record Home and the vet report derive from. The issue's literal fix (preserve on
//    any prior real analysis) was rejected: it would also stop a replaced photo's NEW
//    findings reaching Home and the report on every row (CUL-1110's defect, widened),
//    and keep a stale "Blood: none visible" under a read that saw nothing.
//
// Known residual, owned by CUL-1110: a run that re-asserts none of a stored flag but
// finds a different one keeps the stored columns, so the new finding reaches the card
// (the verdict and read escalate) but not the structured fields. The per-field union
// needs per-field provenance for ai_raw_payload, which is CUL-1110's design.
export function resolveReanalysisWrite<TFlag extends string>(params: {
  stored: StoredAnalysis | null
  eventId: string
  petId: string
  incidentType: string
  structuredValues: Record<string, unknown>
  nextPresentFlags: string[]
  readFields: AnalysisReadFields<TFlag>
}): ReanalysisWrite {
  const { stored, readFields } = params
  // The allowlist (CUL-1277): a stored verdict this build does not know is an escalation
  // too, and is held.
  if (stored && isEscalationVerdict(stored.recommendation) && !isEscalationVerdict(readFields.recommendation)) {
    const settle = stored.status !== 'completed' && stored.status !== 'uncertain'
    if (!settle && !stored.hidden) return { mode: 'hold', values: null }
    return {
      mode: 'hold',
      values: {
        ...(settle ? { status: readFields.status, error: null } : {}),
        ...(stored.hidden ? { dismissed_at: null } : {}),
      },
    }
  }
  const dropsStoredFlag = !!stored &&
    stored.presentFlags.some((flag) => !params.nextPresentFlags.includes(flag))
  return buildAnalysisWriteBack({
    humanEdited: (stored?.edited ?? false) || dropsStoredFlag,
    eventId: params.eventId,
    petId: params.petId,
    incidentType: params.incidentType,
    structuredValues: params.structuredValues,
    readFields,
  })
}

// ── Whose row is it (CUL-1203) ────────────────────────────────────────────────
//
// The analysis row is looked up by event_id, and before CUL-1203 nothing tied a
// row's event_id to its pet_id: RLS checked only that the pet was the writer's,
// and the events(id) FK is checked without RLS. So any signed-in account holding
// another account's event id could plant a row {victim's event, own pet,
// edited_at}, and the humanEdited branch's update — keyed on event_id alone —
// wrote the victim pet's read (its name in read_text) into the attacker's row.
// Migration 074 makes that row unwritable (same-pet on insert, both columns
// frozen on update, no client INSERT). This half makes the write-back unable to
// reach a row that is not the event's, whatever the database lets in:
//
//   · analysisRowMatchesEvent — the row read at step 3b must carry the EVENT's
//     pet. A row that does not is refused before any write, the usage counter
//     included. 074 makes such a row unmakeable and its apply refuses if one
//     already exists, so the one live source is an event moved between an
//     owner's own pets by hand (CUL-882). For a row mismatched at rest this is
//     the fix, not a tripwire: without it a re-read's upsert or an unkeyed
//     update would still write into that row.
//   · updateAnalysisRow — every UPDATE keys on event_id AND the event's pet_id.
//     Adding a filter that can match nothing turns a wrong row into a silent
//     no-op, so the zero-row case is an error here (C-39: a write that matches
//     nothing is said, never swallowed).
//
// The upserts need neither: they already carry the event's pet_id as a value,
// and 074 refuses the conflict update that would move a row's pet_id.

// Fails CLOSED: a row whose pet_id did not come back (a select that forgot the
// column) is treated as another pet's, never as a match.
export function analysisRowMatchesEvent(
  existing: { pet_id?: string | null } | null,
  eventPetId: string,
): boolean {
  if (!existing) return true
  return existing.pet_id === eventPetId
}

export async function updateAnalysisRow(
  client: SupabaseClient,
  key: { eventId: string; petId: string },
  values: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { data, error } = await client
    .from('event_ai_analysis')
    .update(values)
    .eq('event_id', key.eventId)
    .eq('pet_id', key.petId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'no event_ai_analysis row for this event and pet' }
  }
  return { error: null }
}

// The one place an AnalysisWriteBack reaches the table, both modes. Two other
// writes keep their own shapes — the cap / disabled state upsert and the
// failure write — and each carries the event's pet_id as a value (the upsert)
// or goes through updateAnalysisRow (the error-only update).
//
// And the one place a builder's words meet their stamps (Engines v3 PR-11a): every
// write-back carries read words, so every one is stamped here, after the builder has
// decided the values (engineStamps.ts owns which stamps a write carries). `stamps` is
// required and nullable, never defaulted (C-37): only a test that is not about stamps
// passes null, and it has to say so.
export async function applyAnalysisWriteBack(
  client: SupabaseClient,
  key: { eventId: string; petId: string },
  unstamped: AnalysisWriteBack,
  stamps: IncidentStamps | null,
): Promise<{ error: string | null }> {
  const writeBack = stamps ? stampIncidentWrite(unstamped, stamps) : unstamped
  if (writeBack.mode === 'update') return updateAnalysisRow(client, key, writeBack.values)
  const { error } = await client
    .from('event_ai_analysis')
    .upsert(writeBack.values, { onConflict: 'event_id' })
  return { error: error ? error.message : null }
}

// ── The failure write (CUL-812 / CUL-539) ────────────────────────────────────
//
// THE RULE, stated once: an ESCALATION already in the record survives a failed
// re-analysis. A benign or uncertain read does not.
//
// The outer catch's best-effort failure write exists so the detail screen can
// offer a retry CTA. It upserts on event_id, so before this guard it overwrote
// whatever was already there — including a `worth_a_call` a previous read had
// earned. The client renders `status === 'failed'` ahead of the recommendation,
// so the owner then saw "Couldn't finish reading this one." where an escalation
// belonged: to them, that reads as NOTHING WAS FOUND. On a never-reassure
// surface that is the one failure mode the whole module is built to prevent.
//
// WHY THE ASYMMETRY, and not the blanket `existingRealAnalysis || humanEdited`
// guard the rest of the function uses. One of the ways a second analysis is
// reached is a PHOTO REPLACEMENT. Preserving a benign prior read across a failed
// re-read would leave a `monitor` — "keep an eye out" — standing in for a read of
// a photo it never saw. That is reassurance-on-absence dressed as a completed
// read, which is exactly the n=1 invariant (escalate on presence, never reassure
// on absence). So presence is preserved and absence is not: an escalation is a
// fact the record already holds, a benign verdict is a claim about a photo we may
// no longer be looking at. Falling to `failed` + retry is the honest outcome there
// and is what shipped before this guard.
//
// `humanEdited` deliberately does NOT widen this. The failure write touches only
// status + error, never a structured column, so an owner's edits are never lost —
// only hidden behind the retry frame until the read succeeds. Widening on
// edited_at would re-admit the stale-benign-read hazard above for no data gain.
//
// The client half of this rule is `escalationSurvivesFailure` in
// lib/incidentReadState.ts — defence in depth, and the half that can repair rows
// already flipped. The two must move together, and since CUL-1277 they cannot drift:
// both ask `isEscalationVerdict` (lib/incidentVerdict.ts), so ANY verdict off the quiet
// list survives, not only the literal. A row holding a verdict a later rule wrote
// (EN-3's `call_now`, then a flag rollback to this code) is an escalation the record
// already earned; this function must not flip it to 'failed' because it cannot name it.

export type FailureWrite =
  | { mode: 'upsert'; values: Record<string, unknown> }
  | { mode: 'rescue'; values: Record<string, unknown> }
  | { mode: 'error-only'; values: { error: string } }
  | { mode: 'skip' }

// ── The rescue (CUL-815) — an escalation THIS run computed survives the run failing ──
//
// CUL-812 protects an escalation already IN the record. This is the other half: an
// escalation the failing run had already worked out and never wrote. Step 3 computes
// the contextual flags from the record alone, before the photo is fetched, precisely so
// they survive a capped or flagged-off read (§5.4); a storage error, a 529 from the
// model or a failed write-back used to throw them away with the rest of the run, and
// the owner saw "Couldn't finish reading this one" where a warning belonged
// (clinical-guardrails Pattern 5: the failure path runs the contextual floor anyway).
//
// The rescue carries the READ fields only (never a structured column), so it cannot
// null a prior finding or an owner's edit. Its status is 'failed' because that is true:
// the photo read did not finish. The client already renders a failed row carrying an
// escalation as the escalation (`escalationSurvivesFailure`), and CUL-819's disclosure
// needs the fact that the latest read didn't finish.
export interface RescueRead<TFlag extends string = string> {
  recommendation: Recommendation
  read_text: string
  visual_flags: string[]
  contextual_flags: TFlag[]
}

// The escalation the catch should keep, or null. `computed` is the run's own post-floor
// read when it got that far (a visual escalation whose write-back then failed is the
// CUL-815 variant); otherwise the contextual flags alone decide, read through the same
// selectReadText as the cap branch, so the words are the ones a capped run would show.
// A computed read that did not escalate is never rescued: absence is not carried.
export function buildRescueRead<TFlag extends string>(
  copy: IncidentCopy<TFlag>,
  params: {
    computed: RescueRead<TFlag> | null
    contextualFlags: TFlag[]
    petName: string
    hasPhoto: boolean
  },
): RescueRead<TFlag> | null {
  if (params.computed && isEscalationVerdict(params.computed.recommendation)) return params.computed
  if (params.contextualFlags.length === 0) return null
  return {
    recommendation: 'worth_a_call',
    read_text: selectReadText(copy, {
      petName: params.petName,
      recommendation: 'worth_a_call',
      contextualFlags: params.contextualFlags,
      visualFlags: [],
      modelReadText: null,
      photoUnreadable: false,
      hasPhoto: params.hasPhoto,
    }),
    visual_flags: [],
    contextual_flags: params.contextualFlags,
  }
}

// `existing` is the row read AT THE MOMENT OF THIS DECISION, not at step 3b — see
// the call site for why the difference matters. `existingReadFailed` says that read
// itself errored, which is NOT the same as "no row": the caller cannot tell an empty
// table from an unreachable one, and on this surface an unproven write is worse than
// a missing retry button, so it fails CLOSED. `rescue` is required, not defaulted: a
// default on a safety decision is that decision (C-37), and "no rescue" must be said.
export function buildFailureWrite(params: {
  existing: Pick<StoredAnalysis, 'recommendation' | 'presentFlags'> | null
  existingReadFailed: boolean
  eventId: string
  petId: string | null
  incidentType: string | null
  message: string
  rescue: RescueRead | null
  // The stamps the rescue's words carry (engineStamps.ts). Only the rescue writes words,
  // so only the rescue is stamped; the error-only and plain failure shapes leave the
  // row's stamps describing the read it still holds. Required for the same reason as
  // `rescue` (C-37); null only where a caller has none (a test not about stamps).
  stamps: IncidentStamps | null
}): FailureWrite {
  // The table requires pet_id + incident_type NOT NULL: if we failed before the
  // event loaded we have nothing valid to write at all.
  if (!params.petId || !params.incidentType) return { mode: 'skip' }

  // We could not read what is there. Writing 'failed' blind is exactly the bug this
  // guard exists to stop, so write nothing: the row keeps whatever it holds. A rescue
  // is not attempted either: the table just refused a read, and a skip is the one
  // outcome that is safe whatever the row holds.
  if (params.existingReadFailed) return { mode: 'skip' }

  if (isEscalationVerdict(params.existing?.recommendation)) {
    // Record the error alongside for observability; leave status, recommendation
    // and read_text exactly as the record earned them. A later successful read
    // clears `error` via readFields (error: null). A rescue would only swap one
    // escalation's words for another's, so the stored one stands.
    return { mode: 'error-only', values: { error: params.message } }
  }

  if (params.rescue) {
    // Identity + read fields only. PostgREST's upsert updates exactly the columns it
    // is sent, so an existing row's structured fields and edited_at are untouched and
    // a fresh row's are null, which is right for a read that never finished.
    //
    // And the owner's hide goes (CUL-1323). This is the one failure shape that writes
    // WORDS: an escalation over a row that held none, so words the owner has not seen.
    // A hide they made on the calm read before it would otherwise stand over them, and
    // "AI note hidden" would sit where the warning belongs.
    const rescue: FailureWrite & { mode: 'rescue' } = {
      mode: 'rescue',
      values: {
        event_id: params.eventId,
        pet_id: params.petId,
        incident_type: params.incidentType,
        recommendation: params.rescue.recommendation,
        read_text: params.rescue.read_text,
        visual_flags: params.rescue.visual_flags,
        contextual_flags: params.rescue.contextual_flags,
        status: 'failed',
        error: params.message,
        dismissed_at: null,
      },
    }
    return params.stamps ? stampIncidentWrite(rescue, params.stamps) : rescue
  }

  if (params.existing && params.existing.presentFlags.length > 0) {
    // A stored red flag with a calm verdict beside it (vomit rows whose model left
    // visual_flags empty, CUL-534). The failure frame renders ahead of the card and
    // hides the observation grid, so "Couldn't finish reading this one" would stand
    // over "Blood: fresh red" on the record. Presence carries: keep the row, note the
    // error (CUL-532's class, on this write path).
    return { mode: 'error-only', values: { error: params.message } }
  }

  return {
    mode: 'upsert',
    values: {
      event_id: params.eventId,
      pet_id: params.petId,
      incident_type: params.incidentType,
      status: 'failed',
      error: params.message,
    },
  }
}

// ── Is the existing row a real analysis? (the cap path's never-bury guard) ─────
// A row holding an escalation is a real analysis whatever its STATUS says (CUL-812):
// the pre-guard failure write flipped only status + error, so a 'failed' row can still
// carry the escalation a previous read earned, and the client renders it as one. The
// cap / disabled branch of runIncidentAnalysis reads this to decide whether a cap STATE
// may be written; without the escalation clause it would write 'capped' over a live
// "Worth a call". ANY escalation, not the literal (CUL-1277): a verdict a later rule wrote
// (EN-3's tiers, then a flag rollback) is protected the same way. Pure + exported so the
// clause is tested rather than asserted inline in the untested pipeline.
export function isRealAnalysis(
  existing: { status?: string | null; recommendation?: string | null } | null | undefined,
): boolean {
  if (!existing) return false
  if (existing.status !== 'pending' && existing.status !== 'failed') return true
  return isEscalationVerdict(existing.recommendation)
}

// ── Cap + flag gate (Monetization Track 2, T2-3 / B-329 + B-001) ──────────────
// docs/monetization-and-throttling-requirements.md §4–§5. Consolidated here from
// the per-function copies (the S6 "no _shared yet" era ended with D2). Incident
// analyses are ROW-BASED (§4.5): flag-off / cap write a STATE into
// event_ai_analysis.status ('read_disabled' / 'capped'), not an HTTP typed body.
// The per-type FUNCTION_KEY / FLAG_KEY / CAPS live in each descriptor.
// (extract-food-from-photo / extract-medication-from-photo carry the
// HTTP-typed-response variant of this gate and still hold their local copies —
// consolidating those is a separate, future refactor, not this module's job.)

export interface FunctionCaps { daily: number; monthly: number }

export type GateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }

// The pure gate decision. `flagEnabled` is the resolved app_config flag (the
// reader fails OPEN on a config read error — §4.2). `counts` are the
// POST-INCREMENT day/month counters from record_ai_usage; pass null ONLY when the
// flag is off (the caller skips the increment then — §5.4). Over-cap is
// strictly-greater because record_ai_usage increments-then-returns: the cap-th
// call returns count === cap and proceeds; the (cap+1)-th returns cap+1 and is
// blocked — exactly `caps.daily` model reads per UTC day.
export function resolveGateState(
  flagEnabled: boolean,
  counts: { dayCount: number; monthCount: number } | null,
  caps: FunctionCaps,
): GateState {
  if (!flagEnabled) return { allow: false, reason: 'feature_disabled' }
  if (!counts) return { allow: true }
  if (counts.dayCount > caps.daily) return { allow: false, reason: 'cap_reached', cap: 'daily' }
  if (counts.monthCount > caps.monthly) return { allow: false, reason: 'cap_reached', cap: 'monthly' }
  return { allow: true }
}

export function resolveFlagValue(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

export function resolveCaps(aiCaps: unknown, functionKey: string, defaults: FunctionCaps): FunctionCaps {
  if (!aiCaps || typeof aiCaps !== 'object') return defaults
  const entry = (aiCaps as Record<string, unknown>)[functionKey]
  if (!entry || typeof entry !== 'object') return defaults
  const e = entry as Record<string, unknown>
  return {
    daily: typeof e.daily === 'number' && Number.isFinite(e.daily) ? e.daily : defaults.daily,
    monthly: typeof e.monthly === 'number' && Number.isFinite(e.monthly) ? e.monthly : defaults.monthly,
  }
}

async function readGateConfig(
  client: SupabaseClient,
  gate: { flagKey: string; functionKey: string; caps: FunctionCaps },
): Promise<{ flagEnabled: boolean; caps: FunctionCaps }> {
  try {
    const { data, error } = await client
      .from('app_config')
      .select('key, value')
      .in('key', [gate.flagKey, 'ai_caps'])
    if (error || !data) return { flagEnabled: true, caps: gate.caps }
    const byKey = new Map(data.map((r) => [(r as { key: string }).key, (r as { value: unknown }).value]))
    return {
      flagEnabled: resolveFlagValue(byKey.get(gate.flagKey), true),
      caps: resolveCaps(byKey.get('ai_caps'), gate.functionKey, gate.caps),
    }
  } catch {
    return { flagEnabled: true, caps: gate.caps }
  }
}

// Increment + read the caller's usage counters (§4.3). Null on RPC error →
// treated as under-cap (fail-open). uid derived inside the RPC (B-252).
async function recordUsage(
  client: SupabaseClient,
  functionKey: string,
): Promise<{ dayCount: number; monthCount: number } | null> {
  const { data, error } = await client.rpc('record_ai_usage', { p_function: functionKey, p_scope_id: null })
  if (error) {
    console.warn(`record_ai_usage(${functionKey}) failed — proceeding under cap:`, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { day_count?: number; month_count?: number } | null
  if (!row || typeof row.day_count !== 'number' || typeof row.month_count !== 'number') return null
  return { dayCount: row.day_count, monthCount: row.month_count }
}

// ── Image handling ──────────────────────────────────────────────────────────────

// Claude rejects any single image whose base64 payload exceeds 5 MB. Full-res
// photos can exceed it (an uncompressed original — see the sync-path clobber this
// shipped with). We guard on the RAW byte size (blob.size) BEFORE base64-encoding:
// the encode itself is what OOM'd the worker (a 546 memory kill that hard-terminates
// the isolate, so no analysis row was ever written) — the old post-encode size
// filter ran too late to prevent it.
const MAX_CLAUDE_IMAGE_BASE64 = 5_242_880
// base64 inflates bytes by 4/3, so the raw ceiling that stays within the base64
// cap is floor(cap / 4) * 3 ≈ 3.93 MB. floor-then-×3 is provably ≤ cap for ANY
// cap (4·floor(cap/4) ≤ cap), so a future edit to the base64 cap can't quietly
// let an over-cap image through — unlike floor(cap * 3 / 4), which overshoots
// when cap mod 4 == 2.
const MAX_CLAUDE_IMAGE_BYTES = Math.floor(MAX_CLAUDE_IMAGE_BASE64 / 4) * 3

// Oversized photos are re-fetched through Supabase Storage image transformations
// (imgproxy — resizes server-side, so zero isolate memory and no base64 of the
// original) scaled to fit this longest edge. 1568px is the size Claude downsamples
// to internally, so this costs no clinical detail vs. what the model would see
// anyway. Requires the Pro plan's transformation add-on; if it's unavailable or
// errors, we degrade to photoUnreadable (never crash, never reassure).
const DOWNSCALE_EDGE_PX = 1568

// At most this many of the event's photos ride into one vision call.
const MAX_PHOTOS_PER_ANALYSIS = 3

const VISION_MAX_TOKENS = 1024

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
export interface ImagePart { data: string; mediaType: ClaudeMediaType }

// Claude rejects a request whose declared media_type doesn't match the actual
// bytes. Photos are uploaded with a hardcoded .jpg name + image/jpeg
// content-type, but the underlying bytes can be WebP/PNG/etc (e.g. iOS image
// picker output). Sniff the magic bytes so we declare the real type.
export function detectImageMediaType(bytes: Uint8Array): ClaudeMediaType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50    // "WEBP"
  ) return 'image/webp'
  // Unknown (incl. HEIC, which Claude does not accept): default to jpeg. If it's
  // genuinely something Claude can't read, the API surfaces a clear 400.
  return 'image/jpeg'
}

// Chunked base64 encoder. Both prior encoders built the output one character at a
// time — btoa(Array.from(bytes,…).join('')) materialised one JS string per byte,
// and deno-std encodeBase64 concatenates per 3 bytes — so for a multi-MB image the
// output grew as a "rope" of millions of cons-string nodes (~250 MB for a 6.5 MB
// photo), blowing the isolate's 250 MB memory limit and returning a 546
// (WORKER_RESOURCE_LIMIT) that HARD-KILLS the worker before it can write a row.
// Encoding in fixed byte windows and letting native btoa do the work keeps peak
// memory roughly linear in the image size. Pure + exported so correctness is
// unit-tested. Callers only ever pass a size-guarded (≤~3.93 MB) blob, so the
// window count is small and bounded.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000 // 32 KB — safe to spread into String.fromCharCode
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function blobToImagePart(blob: Blob): Promise<ImagePart> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mediaType = detectImageMediaType(bytes)
  return { data: bytesToBase64(bytes), mediaType }
}

// Fetch a photo as a blob within Claude's size cap. An already-small object is
// used as-is (exact bytes, no transform quota). An oversized object is re-fetched
// through Supabase Storage image transformations (imgproxy resizes server-side —
// no isolate memory, no base64 of the multi-MB original) scaled to
// DOWNSCALE_EDGE_PX, so an oversized photo still gets a real read instead of being
// skipped. Returns null when the object can't be brought under the cap (transform
// unavailable/errored — e.g. a format imgproxy can't read, or still too big) so the
// caller degrades to photoUnreadable. A raw-download failure throws (a real,
// retryable error), matching the prior behaviour. The worst case of the transform
// is "degrades exactly like before"; it introduces no new failure mode.
//
// `forceTransform` (B-228 A8 — the Ask transform-only condition, §6.2.4 / AC-13): when
// true, the raw download is SKIPPED entirely and every photo — small ones included —
// is fetched only through the imgproxy transform, which strips EXIF/GPS and re-encodes.
// This is the vet-report PR-7 "never raw originals" posture, and it is the mechanism
// T&S's D2 sign-off was conditioned on: a live read triggered by Ask must never send an
// un-stripped original across the Anthropic boundary. It is OPT-IN (default false) so
// the detail-screen read path is byte-identical — a deliberate owner action on one event
// keeps its shipped raw-for-small fetch (no transform-quota, no availability dependency);
// only the conversational Ask surface pays the transform tax + gains the stripping
// guarantee. On the forced path a storage/transform error degrades to photoUnreadable
// (null) rather than throwing — honest "couldn't read the photo", never raw bytes, never
// reassurance; the owner can re-run from the detail screen (the raw path) if it was
// transient.
// Exported for the AC-13 test (B-228 A8): a fixture asserts that with forceTransform the
// ONLY storage access is the stripping transform — no raw-original download path exists.
export async function fetchUsableImageBlob(
  adminClient: SupabaseClient,
  path: string,
  functionName: string,
  forceTransform = false,
): Promise<Blob | null> {
  const bucket = adminClient.storage.from('nyx-event-attachments')
  if (!forceTransform) {
    const { data, error } = await bucket.download(path)
    if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`)
    if (data.size > 0 && data.size <= MAX_CLAUDE_IMAGE_BYTES) return data
    // Oversized (or zero-byte): fall through to the server-side downscale below.
  }

  // Transform-only fetch — the ONLY download when forceTransform is set (so there is no
  // raw-original access path at all; AC-13), and the oversized fallback otherwise.
  const { data: resized, error: resizeErr } = await bucket.download(path, {
    transform: { width: DOWNSCALE_EDGE_PX, height: DOWNSCALE_EDGE_PX, resize: 'contain' },
  })
  if (resizeErr || !resized) {
    console.warn(`${functionName}: downscale unavailable for ${path}: ${resizeErr?.message ?? 'no data'}`)
    return null
  }
  if (resized.size > 0 && resized.size <= MAX_CLAUDE_IMAGE_BYTES) return resized
  console.warn(`${functionName}: downscaled image still over cap for ${path} (${resized.size} bytes)`)
  return null
}

// ── The descriptor ──────────────────────────────────────────────────────────────

// What the pipeline needs to read off a parsed per-type analysis. The full
// per-type object (with its incident-named fields, e.g. appears_to_show_vomit)
// is preserved verbatim as ai_raw_payload via the descriptor's
// buildStructuredValues — the pipeline only touches these generic fields.
export interface IncidentAnalysisBase {
  // ESCALATING flags ONLY — any entry here forces worth_a_call (Pattern 2).
  // A monitor-tier observation (e.g. stool's mucus-without-blood, D5) must NOT
  // be emitted here; surface it via the per-type structured fields instead.
  visual_flags: string[]
  recommendation: Recommendation
  read_text: string | null
  // The model's OTHER owner-facing free-text field. The pipeline post-floor-gates it
  // (selectDescription) exactly as read_text is gated, so both live in the base (CUL-152).
  description: string | null
}

export interface IncidentDescriptor<TAnalysis extends IncidentAnalysisBase, TFlag extends string> {
  // Function name exactly as deployed (e.g. 'analyze-vomit') — log prefixes only.
  functionName: string
  // events.event_type values this analysis accepts. The row's incident_type
  // reuses the event's event_type (migration 013), so multi-value types
  // (stool_normal/diarrhea) need no extra mapping.
  eventTypes: readonly string[]
  // 400 body when the event exists but is the wrong type — per-type so the
  // shipped copy of each function is preserved exactly.
  wrongEventTypeMessage: string
  // Track-2 monetization identity (docs/monetization-and-throttling-requirements.md §4).
  functionKey: string
  flagKey: string
  caps: FunctionCaps
  // Vision call parameters. The system prompt is guardrail layer 1 (Pattern 4)
  // and is per-type; the enum (layer 2) and floor (layer 3) are shared.
  model: string
  systemPrompt: string
  tool: Record<string, unknown>
  userMessageText: string
  // This descriptor's half of the row's rule_version stamp (the framework's half is
  // FRAMEWORK_RULE_VERSION in engineStamps.ts). Bump it with any change to which
  // findings become flags or to the contextual flags' derivation: a row must say which
  // rules made it (critique R-1). Shape: [a-z0-9]+, e.g. 'vomit1'.
  ruleVersion: string
  // Parse + sanitize the tool_use result into the per-type analysis; null when
  // the model returned no usable tool call.
  parseToolResult(response: ClaudeResponse): TAnalysis | null
  // The per-type "does the photo actually show the subject?" read — the floor's
  // not_enough_to_say predicate.
  appearsToShowSubject(analysis: TAnalysis): boolean
  // Per-type contextual flags, computed deterministically from SQL over the
  // owner's RLS-scoped data (Pattern 3 — never model-reasoned). Any flag that
  // keys off ABSENCE of a logged signal must carry its own tracking guard
  // (Pattern 6) inside this computation. `eventType` is the analysed event's own
  // events.event_type (= the row's incident_type), passed so a per-type
  // repeat-count can include THIS event when it is itself a countable event
  // (stool's repeated_loose_stool needs to know if this event is 'diarrhea' —
  // B-247 PR 3). It is PRE-vision context, so it neither reaches the model nor
  // depends on the vision result: escalation still survives the cap.
  // `engineFlags` is the Engines v3 flag state resolved for the record's owner
  // (engineFlags.ts); a descriptor that gates a rule on a key reads it here, and one
  // that gates nothing ignores it.
  computeContextualFlags(
    userClient: SupabaseClient,
    event: { petId: string; occurredAt: string; species: string; eventType: string; engineFlags: EngineFlags },
  ): Promise<TFlag[]>
  // Per-type owner-facing read templates. Every new descriptor's strings need
  // their own reassurance-word regex test (Pattern 8) — not inherited.
  copy: IncidentCopy<TFlag>
  // Per-type structured column values for the full-upsert write path (incl.
  // ai_raw_payload + ai_confidence). Called with null when no model result stands —
  // either no model ran (no photo / fully-unreadable) OR a real result was discarded
  // by the B-203 partial-read collapse — in which case all per-type columns must be
  // null (nothing to preserve, and nothing partial-view to carry onto the report).
  buildStructuredValues(analysis: TAnalysis | null): Record<string, unknown>
  // The structured columns a red flag lives in (Pattern 9): step 3b selects exactly
  // these, so presentFlagsFromStructured must read nothing else (each descriptor's
  // suite pins that).
  redFlagColumns: readonly string[]
  // The PRESENT red flags a row of structured column values asserts, present-only:
  // never a flag on 'unsure', 'no', 'none_visible' or null. Run on the stored row, on
  // the stored ai_raw_payload mapped through buildStructuredValues, and on this run's
  // columns, so a re-analysis can tell what it would take off the record
  // (resolveReanalysisWrite). Mirrors generate-signal's deriveIncidentFlags for the
  // type's family; each descriptor's suite pins the parity (C-34: same question).
  presentFlagsFromStructured(row: Record<string, unknown>): string[]
}

// ── Vision call ────────────────────────────────────────────────────────────────

async function runVisionCall<TAnalysis extends IncidentAnalysisBase, TFlag extends string>(
  descriptor: IncidentDescriptor<TAnalysis, TFlag>,
  images: ImagePart[],
): Promise<TAnalysis | null> {
  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
  }))

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: descriptor.model,
      max_tokens: VISION_MAX_TOKENS,
      system: descriptor.systemPrompt,
      tools: [descriptor.tool],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: descriptor.userMessageText }],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`)
  }
  return descriptor.parseToolResult(await res.json() as ClaudeResponse)
}

// ── The pipeline ────────────────────────────────────────────────────────────────

interface RequestBody {
  event_id: string
  // B-228 A8: when true, photos are fetched transform-only (EXIF/GPS-stripped, never raw
  // originals — §6.2.4 / AC-13). Set by the `ask` Edge Function on a live read; absent /
  // false on the detail-screen path (byte-identical to the shipped fetch). Optional and
  // default-off, so analyze-vomit/analyze-stool behaviour is unchanged for every existing
  // caller — the regression proof (each function's index.test.ts passing unmodified) holds.
  transform_only?: boolean
}

// The pipeline's three outside dependencies, injectable so a test can drive the REAL
// pipeline (every branch, every write, in order) through a fake database and a fake
// model: the pure helpers above are only as good as the wiring that calls them, and a
// source scan of that wiring was shown to pass five realistic broken rebases
// (adversarial pass, PR-04b). The two deployed functions pass nothing and get
// LIVE_PIPELINE_DEPS; nothing else is swapped, so the auth, RLS and service-role
// boundaries are the production ones.
export interface PipelineDeps {
  // User-scoped client: RLS enforces that the caller owns the event's pet.
  userClient(authHeader: string): SupabaseClient
  // Service-role client: storage download + trusted write-back.
  adminClient(): SupabaseClient
  vision<TAnalysis extends IncidentAnalysisBase, TFlag extends string>(
    descriptor: IncidentDescriptor<TAnalysis, TFlag>,
    images: ImagePart[],
  ): Promise<TAnalysis | null>
}

export const LIVE_PIPELINE_DEPS: PipelineDeps = {
  userClient: (authHeader) =>
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ),
  adminClient: () =>
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    ),
  vision: runVisionCall,
}

export async function runIncidentAnalysis<TAnalysis extends IncidentAnalysisBase, TFlag extends string>(
  descriptor: IncidentDescriptor<TAnalysis, TFlag>,
  req: Request,
  deps: PipelineDeps = LIVE_PIPELINE_DEPS,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!body.event_id || typeof body.event_id !== 'string') {
    return Response.json({ error: 'event_id required' }, { status: 400, headers: CORS_HEADERS })
  }
  const eventId = body.event_id
  // Transform-only opt-in (B-228 A8). Any non-`true` value keeps the shipped raw-for-small
  // fetch — so an untrusted/garbled body can only ever tighten the fetch, never loosen it.
  const forceTransform = body.transform_only === true

  const userClient = deps.userClient(authHeader)
  const adminClient = deps.adminClient()

  // Known once the event loads; needed to write a valid failure row (the
  // table requires pet_id + incident_type NOT NULL).
  let petIdForFailure: string | null = null
  let incidentTypeForFailure: string | null = null
  // What the catch needs to keep an escalation this run already computed (CUL-815).
  // Declared out here because a `const` inside the try is out of scope in the catch,
  // which is how the contextual flags used to be lost.
  let petNameForFailure = 'your pet'
  let hasPhotoForFailure = false
  let contextualFlagsForFailure: TFlag[] = []
  let computedRead: RescueRead<TFlag> | null = null
  // The stamps this run's words carry (engineStamps.ts). Out here for the same reason as
  // the rescue's inputs: the catch's rescue writes words, so it writes their stamps.
  let stampsForFailure: IncidentStamps | null = null

  // The stored row, read with every column a write decision switches on. Read twice:
  // at step 3b for the cap branch, and again at step 9, because the vision call
  // between them takes 10-60s and a sibling run (Ask's A8 read holds no analysis-
  // chain claim) or an owner edit can land inside it. A read error throws (CUL-817).
  // pet_id: every decision on the row first checks it is this event's (CUL-1203).
  // dismissed_at: a hold clears the owner's hide, so it has to know one is there (CUL-1323).
  const storedColumns = ['id', 'pet_id', 'edited_at', 'status', 'recommendation', 'dismissed_at', ...descriptor.redFlagColumns].join(', ')
  const readStoredRow = async (): Promise<StoredRow | null> =>
    existingRowOrThrow(
      await adminClient
        .from('event_ai_analysis')
        .select(storedColumns)
        .eq('event_id', eventId)
        .maybeSingle<StoredRow>(),
    )

  try {
    // 0. Verify the caller uid from the JWT (§4.6). record_ai_usage derives the
    //    uid inside its SECURITY DEFINER body, so this is defense-in-depth + a
    //    clean 401 (rather than an RPC RAISE surfacing as a 500) when the token is
    //    absent/expired. The reads below are already RLS-scoped by this same JWT.
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    // 1. Load the event (ownership-scoped) and confirm it is an active event of
    //    this descriptor's type.
    const { data: event } = await userClient
      .from('events')
      .select('id, pet_id, event_type, occurred_at, deleted_at, pets(name, species, user_id)')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404, headers: CORS_HEADERS })
    }
    if (!descriptor.eventTypes.includes(event.event_type as string)) {
      return Response.json({ error: descriptor.wrongEventTypeMessage }, { status: 400, headers: CORS_HEADERS })
    }

    const pet = (Array.isArray(event.pets) ? event.pets[0] : event.pets) as
      | { name: string; species: string; user_id?: string | null }
      | null
    const petName = pet?.name ?? 'your pet'
    const species = pet?.species ?? 'unknown'
    const petId = event.pet_id as string
    const occurredAt = event.occurred_at as string
    // The row's incident_type reuses events.event_type (migration 013's
    // parameterization rule): 'vomit' for vomit; 'stool_normal'/'diarrhea' for stool.
    const incidentType = event.event_type as string
    petIdForFailure = petId
    incidentTypeForFailure = incidentType
    petNameForFailure = petName

    // 1b. The Engines v3 flag, for the record's OWNER (pets.user_id off the RLS-scoped
    //     read above), failing closed: a missing, malformed or unreadable row is off
    //     (engineFlags.ts). A failed read runs the flag-off engine and says so in the
    //     stamp (engine_flags '{}'), which is the truth about the run.
    const engineFlags = await readEngineFlags(userClient, typeof pet?.user_id === 'string' ? pet.user_id : null)

    // 2. Photo(s) for this event (ordered). May be empty (logged without a photo).
    const { data: attachments } = await userClient
      .from('event_attachments')
      .select('id, storage_path')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })

    const photoPaths = (attachments ?? []).map((a) => a.storage_path as string)
    const hasPhoto = photoPaths.length > 0
    hasPhotoForFailure = hasPhoto

    // 2b. The stamps every write of read words below carries (engineStamps.ts).
    const stamps = await buildIncidentStamps({
      attachmentIds: (attachments ?? []).map((a) => a.id),
      descriptorRuleVersion: descriptor.ruleVersion,
      engineFlags,
      model: descriptor.model,
      systemPrompt: descriptor.systemPrompt,
      tool: descriptor.tool,
      userMessageText: descriptor.userMessageText,
    })
    stampsForFailure = stamps

    // 3. Deterministic contextual flags FIRST (§5.4 step 2 — the reorder). These
    //    are DB reads, fully independent of the vision result (they already run
    //    for photo-less logs), so they compute BEFORE the model call and
    //    therefore SURVIVE the cap. This is what guarantees a capped /
    //    flagged-off incident still escalates when the context warrants it — the
    //    invariant the adversarial review must try to break.
    const contextualFlags = await descriptor.computeContextualFlags(userClient, {
      petId,
      occurredAt,
      species,
      eventType: incidentType,
      engineFlags,
    })
    contextualFlagsForFailure = contextualFlags

    // 3b. Existing analysis row — honors the never-clobber guard (B-028) in every
    //     write path below, and decides whether a cap/disabled STATE may be written
    //     (it must never bury an already-completed or owner-edited read). An
    //     unanswered read throws here, before the gate spends a unit (CUL-817); the
    //     catch then keeps the contextual flags just computed (CUL-815).
    const existing = await readStoredRow()
    // CUL-1203: a row filed under another pet is not this event's read, and every
    // decision below (humanEdited, existingRealAnalysis) would otherwise be taken
    // on a stranger's row. Refused here, before the usage counter and before any
    // write — a direct return, so the catch's failure write never runs over it.
    // The client maps any non-2xx to its calm retry line; nothing new is shown.
    if (!analysisRowMatchesEvent(existing, petId)) {
      console.error(`${descriptor.functionName}: analysis row for event ${eventId} is filed under another pet; refusing to write`)
      return Response.json(
        { error: 'Analysis row does not belong to this event' },
        { status: 409, headers: CORS_HEADERS },
      )
    }
    const humanEdited = !!existing?.edited_at
    // A row holding an escalation is a real analysis whatever its STATUS says
    // (CUL-812; any escalation since CUL-1277) — `isRealAnalysis` carries the why.
    const existingRealAnalysis = isRealAnalysis(existing)

    // 4. Flag + cap gate (§5.4 step 3) — immediately before the vision call, AFTER
    //    the escalation-flag computation above. The cap/flag gate the MODEL CALL, so
    //    the gate only runs when there IS a photo to read: a photo-less log makes no
    //    vision call, so it burns no counter unit and takes the byte-identical
    //    pre-diff path (its contextual escalation still fires below via the "under
    //    cap" branch, and the descriptive-read flag is moot with no read to disable).
    //    Flag off ⇒ NO increment (a flagged-off call burns no unit). Flag on ⇒
    //    increment-then-check.
    let gate: GateState = { allow: true }
    if (hasPhoto) {
      const { flagEnabled, caps } = await readGateConfig(userClient, descriptor)
      const counts = flagEnabled ? await recordUsage(userClient, descriptor.functionKey) : null
      gate = resolveGateState(flagEnabled, counts, caps)
    }

    // 5. Capped or flagged off (§5.4 step 4): SKIP the vision call. The escalation
    //    floor still runs with NO visual flags (no model ran); a fired contextual
    //    flag STILL forces worth_a_call — never-reassure survives the cap BY
    //    CONSTRUCTION: there is no code path from "capped" to a reassuring verdict.
    if (!gate.allow) {
      const cappedRec = applyEscalationFloor({
        modelRecommendation: 'not_enough_to_say',
        appearsToShowSubject: false,
        hasPhoto,
        visualFlags: [],
        contextualFlags,
      })
      if (contextualFlags.length > 0) {
        // Escalation survives the cap → write a COMPLETED escalation row. CRITICAL
        // never-clobber guard (B-028; caught by adversarial + code review 2026-07-14):
        // this write carries analysis=null (no model ran), so a FULL upsert would null
        // the per-type structured clinical fields. A prior REAL analysis's facts must
        // survive untouched — so we route through update-read-fields-only whenever the
        // row is already a real analysis (humanEdited OR completed/uncertain), exactly
        // the protection the no-flags branch below gives via existingRealAnalysis.
        // Only a truly-fresh row (no prior real analysis) takes the full upsert, where
        // null structured fields are correct (there is nothing to preserve — same as a
        // photo-less escalation).
        // Widened to ANY existing row (CUL-532's class, adversarial pass on PR-04b): a
        // 'failed' or 'pending' row is not a "real analysis" but can still hold a prior
        // read's fresh red blood (a 529 flips status and nothing else). This write has
        // no structured data of its own to contribute, so an existing row has nothing
        // for it to overwrite and everything for it to lose.
        const preserveStructured = humanEdited || existingRealAnalysis || existing !== null
        const readText = selectReadText(descriptor.copy, {
          petName,
          recommendation: cappedRec, // worth_a_call
          contextualFlags,
          visualFlags: [],
          modelReadText: null,
          photoUnreadable: false,
          hasPhoto,
        })
        const readFields: AnalysisReadFields<TFlag> = {
          recommendation: cappedRec,
          read_text: readText,
          visual_flags: [],
          contextual_flags: contextualFlags,
          status: 'completed',
          error: null,
        }
        const writeBack = buildAnalysisWriteBack({
          humanEdited: preserveStructured,
          eventId,
          petId,
          incidentType,
          structuredValues: descriptor.buildStructuredValues(null),
          readFields,
        })
        const { error: writeError } = await applyAnalysisWriteBack(adminClient, { eventId, petId }, writeBack, stamps)
        if (writeError) throw new Error(`DB write failed: ${writeError}`)
      } else if (!existingRealAnalysis) {
        // No escalation AND no prior real analysis to protect → record the cap /
        // disabled STATE (§4.5) so the client renders its designed state (T2-4).
        // No recommendation, no read, no flags — nothing reassuring is written. A
        // pre-existing completed/edited analysis is left UNTOUCHED (the cap must
        // never downgrade a real read).
        const status = gate.reason === 'feature_disabled' ? 'read_disabled' : 'capped'
        const { error: writeError } = await adminClient
          .from('event_ai_analysis')
          .upsert(
            { event_id: eventId, pet_id: petId, incident_type: incidentType, status, error: null },
            { onConflict: 'event_id' },
          )
        if (writeError) throw new Error(`DB write failed: ${writeError.message}`)
      }
      // else: capped/disabled, no new flags, but a real analysis already exists →
      // leave it exactly as-is (success, no write).
      return Response.json(
        {
          success: true,
          gated: gate.reason,
          recommendation: contextualFlags.length > 0 ? cappedRec : null,
          contextual_flags: contextualFlags,
          visual_flags: [],
        },
        { headers: CORS_HEADERS },
      )
    }

    // 6. Under cap + enabled — the vision path. Only runs a usable photo through
    //    the model; an oversized/undecodable photo degrades to photoUnreadable.
    let analysis: TAnalysis | null = null
    let photoUnreadable = false
    // Photos actually sent to the model this run (≤ the event's attachment count).
    // Compared against photoPaths.length in step 7b to detect a PARTIAL read (B-203).
    let usableReadCount = 0
    if (hasPhoto) {
      // Fetch each photo at a size Claude can accept. An already-small object is
      // used as-is; an oversized one is re-fetched via server-side downscaling
      // (imgproxy) so we never base64-encode a multi-MB image (the 546 OOM) AND an
      // oversized photo still gets a real read instead of being skipped. Anything
      // we can't get under the cap becomes null → photoUnreadable (honest degrade,
      // never a crash). The raw-size guard lives in fetchUsableImageBlob, BEFORE
      // any encoding.
      const fetched = await Promise.all(
        photoPaths.slice(0, MAX_PHOTOS_PER_ANALYSIS).map((path) =>
          fetchUsableImageBlob(adminClient, path, descriptor.functionName, forceTransform)
        ),
      )
      const usableBlobs = fetched.filter((b): b is Blob => b !== null)
      usableReadCount = usableBlobs.length
      if (usableBlobs.length === 0) {
        photoUnreadable = true // no photo we could get within Claude's size limit
      } else {
        const imageParts = await Promise.all(usableBlobs.map(blobToImagePart))
        try {
          analysis = await deps.vision(descriptor, imageParts)
          if (!analysis) throw new Error('Vision model did not return an analysis')
        } catch (visionErr) {
          const msg = visionErr instanceof Error ? visionErr.message : String(visionErr)
          // A Claude 400 means the image itself is unusable — undecodable format
          // (e.g. HEIC, which Claude can't read), corrupt, or a partial upload.
          // Degrade gracefully to the contextual floor with an honest "couldn't
          // read the photo" read rather than 500. Re-throw anything else
          // (transient Claude/network errors) so it's a real, retryable failure.
          if (msg.includes('Claude API error 400')) {
            console.warn(`${descriptor.functionName}: image unreadable, degrading:`, msg)
            photoUnreadable = true
          } else {
            throw visionErr
          }
        }
      }
    }

    // 7. Escalation floor (contextual flags from step 3 + the model's visual flags).
    let visualFlags = analysis?.visual_flags ?? []
    let recommendation = applyEscalationFloor({
      modelRecommendation: analysis?.recommendation ?? 'not_enough_to_say',
      appearsToShowSubject: analysis ? descriptor.appearsToShowSubject(analysis) : false,
      hasPhoto,
      visualFlags,
      contextualFlags,
    })

    // 7b. Partial-read honesty (B-203 / CUL-298). If we could not read EVERY photo on
    //     the event and the photos we DID read did not escalate, we refuse to stand
    //     behind the benign result: an unseen frame could hold the red flag the
    //     readable ones lack, so a 'monitor' here would be a reassurance-on-absence,
    //     and its structured fields ("Blood: none visible", from a partial view) would
    //     carry that onto the card and the vet report. Collapse to the fully-unread
    //     shape — drop the analysis so the structured observations vanish (step 9's
    //     buildStructuredValues(null)) and the verdict + read become the honest
    //     not_enough_to_say. Any escalation already reached (worth_a_call — a visual
    //     flag the photos surfaced, the model's own call, or a contextual flag
    //     computed from the record) is always kept: the floor at step 7 runs FIRST, so
    //     presence has already escalated before this guard inspects the verdict.
    if (shouldCollapsePartialRead({ usableCount: usableReadCount, totalCount: photoPaths.length, recommendation })) {
      analysis = null
      visualFlags = []
      recommendation = 'not_enough_to_say'
    }

    // 8. Read text — the load-bearing never-reassure selection (B-060), pure + tested.
    // The model's free text reaches the owner ONLY on the worth_a_call (visual-flag)
    // escalation path; the monitor / no-flag path is a deterministic template, so a
    // single sample can never assert an all-clear (the n=1 invariant, made structural
    // after a denylist proved too leaky to be the net — adversarial review 2026-06-24).
    const readText = selectReadText(descriptor.copy, {
      petName,
      recommendation,
      contextualFlags,
      visualFlags,
      modelReadText: analysis?.read_text ?? null,
      photoUnreadable,
      hasPhoto,
    })

    // 8b. Post-floor gate on the model's free-text `description` (CUL-152 / B-179 — see
    // selectDescription). read_text is re-gated post-floor by selectReadText above;
    // `description` is a structured column written straight from the parse, so it needs
    // this second gate to inherit the same never-reassure guarantee. Mutating analysis
    // nulls BOTH the description column AND ai_raw_payload (= analysis) together, so the
    // owner-edit diff baseline (extract*EditableFromPayload) stays consistent (Pattern 7).
    // Closes the model-self-escalated-but-floor-downgraded leak the parse gate alone missed.
    if (analysis) {
      analysis.description = selectDescription({
        modelDescription: analysis.description,
        recommendation,
        contextualFlags,
        photoUnreadable,
      })
    }

    const status = recommendation === 'not_enough_to_say' ? 'uncertain' : 'completed'

    // From here the run has a verdict of its own; if the write below fails, the catch
    // keeps it when it escalates (CUL-815's variant: a visual escalation this run found
    // over a stored 'monitor', lost to a failed write-back).
    computedRead = { recommendation, read_text: readText, visual_flags: visualFlags, contextual_flags: contextualFlags }

    // 9. Write-back. Never clobbers a human-edited row (Pattern 7), never lowers a
    // stored escalation, never takes a stored red flag off the record
    // (resolveReanalysisWrite). Decided on a FRESH read of the row, not step 3b's: see
    // readStoredRow for why that window matters.
    const readFields: AnalysisReadFields<TFlag> = {
      recommendation,
      read_text: readText,
      visual_flags: visualFlags,
      contextual_flags: contextualFlags,
      status,
      error: null,
    }

    const structuredValues = descriptor.buildStructuredValues(analysis)
    const freshRow = await readStoredRow()
    // CUL-1203 again, on the fresh read: a row that is not this event's must not steer
    // a hold or a write. It can only appear mid-run if the event moved between one
    // owner's pets (CUL-882); throwing lands in the catch, which folds the mismatch into
    // "could not read" and writes nothing.
    if (!analysisRowMatchesEvent(freshRow, petId)) {
      throw new Error('Analysis row does not belong to this event')
    }
    const stored = snapshotStoredAnalysis(descriptor, freshRow)
    const writeBack = resolveReanalysisWrite({
      stored,
      eventId,
      petId,
      incidentType,
      structuredValues,
      nextPresentFlags: descriptor.presentFlagsFromStructured(structuredValues),
      readFields,
    })

    // A hold writes no stamp: the words it keeps are an earlier run's (engineStamps.ts).
    if (writeBack.mode === 'hold') {
      console.info(`${descriptor.functionName}: held a stored escalation over a calmer read (CUL-1201)`)
      if (writeBack.values) {
        const { error: settleError } = await updateAnalysisRow(adminClient, { eventId, petId }, writeBack.values)
        if (settleError) throw new Error(`DB write failed: ${settleError}`)
      }
      // No flags in the body: this run's are what it saw, not what the row holds, and
      // every caller re-reads the row rather than trusting a response (lib/analysis.ts,
      // ask/index.ts runLivePhotoRead).
      return Response.json(
        { success: true, held: true, recommendation: stored?.recommendation ?? null },
        { headers: CORS_HEADERS },
      )
    }

    const { error: writeError } = await applyAnalysisWriteBack(adminClient, { eventId, petId }, writeBack, stamps)
    if (writeError) throw new Error(`DB write failed: ${writeError}`)

    return Response.json(
      { success: true, recommendation, contextual_flags: contextualFlags, visual_flags: visualFlags },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${descriptor.functionName} error:`, message)

    // Best-effort failure write so the detail screen can surface a retry CTA —
    // EXCEPT over an escalation the record already earned, which is preserved and
    // only annotated with the error. The rule, and why it is asymmetric, is on
    // buildFailureWrite.
    // Re-read the row HERE rather than reusing step 3b's copy. Step 3b runs before
    // the vision call, so by the time we reach this catch its answer is 10-60s old,
    // and two things can have happened inside that window: this run's own later
    // write-backs, and a SIBLING invocation's (Ask's A8 live read runs in a separate
    // process and holds no analysis-chain claim, so CUL-801's in-memory claim cannot
    // serialize it). Reading at the moment of the write decision is the only version
    // of this check whose window is worth nothing. A read error is not "no row" — it
    // fails closed in buildFailureWrite.
    // It reads the red-flag columns too, so a stored red flag under a calm verdict is
    // kept visible rather than hidden behind the retry frame (buildFailureWrite).
    let latest: StoredAnalysis | null = null
    let latestReadFailed = false
    if (petIdForFailure && incidentTypeForFailure) {
      const { data: latestRow, error: latestErr } = await adminClient
        .from('event_ai_analysis')
        .select(storedColumns)
        .eq('event_id', eventId)
        .maybeSingle<StoredRow>()
      latest = snapshotStoredAnalysis(descriptor, latestRow ?? null)
      // CUL-1203, the same rule as step 3b: a row filed under another pet is not
      // this event's, so its recommendation must not steer the failure write. It
      // folds into "could not read" on purpose — buildFailureWrite then writes
      // nothing, which is the fail-closed answer for a row we will not touch.
      latestReadFailed = !!latestErr || !analysisRowMatchesEvent(latestRow ?? null, petIdForFailure)
    }

    const failureWrite = buildFailureWrite({
      existing: latest,
      existingReadFailed: latestReadFailed,
      eventId,
      petId: petIdForFailure,
      incidentType: incidentTypeForFailure,
      message,
      rescue: buildRescueRead(descriptor.copy, {
        computed: computedRead,
        contextualFlags: contextualFlagsForFailure,
        petName: petNameForFailure,
        hasPhoto: hasPhotoForFailure,
      }),
      stamps: stampsForFailure,
    })
    // Best-effort, as before: a failure write that fails is not re-reported. It is
    // keyed on the event's pet like every other update (CUL-1203); buildFailureWrite
    // returns 'skip' whenever petIdForFailure is null, so the guard below is a
    // narrowing for the type checker, never a second decision.
    if (failureWrite.mode === 'error-only' && petIdForFailure) {
      await updateAnalysisRow(adminClient, { eventId, petId: petIdForFailure }, failureWrite.values)
    } else if (failureWrite.mode === 'upsert' || failureWrite.mode === 'rescue') {
      await adminClient
        .from('event_ai_analysis')
        .upsert(failureWrite.values, { onConflict: 'event_id' })
        .then(() => undefined)
    }

    return Response.json(
      { error: 'Analysis failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
