import { supabase } from './supabase';
import { syncPendingEvents, ensureEventAttachmentsSynced, refreshReadCopy } from './sync';
import { analysisChainOutstanding, claimAnalysisChain, onAnalysisChainClaimed, type AnalysisChainClaim } from './analysisChain';
import { useSyncStore } from '../store/syncStore';

// ── A landed read is saved to the phone's copy (History v2 §5.3, HV-5 / CUL-1162) ──
//
// Every surface that shows a read's verdict (Home's spine, the Patterns month, the
// Signal screen, History) reads it from the phone's copy (`lib/readCopy.ts`), never
// from the server, so "Worth a call" survives offline. That makes the moment a read
// LANDS a moment the copy must hear about, and this module is where both of those
// moments live:
//   • the chain: each trigger saves the read BEFORE it settles its claim. Home rereads
//     the verdict when the chain settles and never through a watch, so a save after the
//     settle would find Home already read an empty copy (the PM's ruling on the plan,
//     2026-09-25);
//   • the watch: each tick saves before it runs the caller's check, for a read that
//     lands after the chain's own call returned. Before, not after: Home's check reads
//     the copy, so it can only see a landing the tick has already saved.
// Both go through `refreshReadCopy`, which never throws; `copyLandedRead` catches anyway,
// because a trigger that threw would break its own "never throws, returns { error }"
// contract with every caller that awaits it. Resolves true when the copy changed.
async function copyLandedRead(eventId: string): Promise<boolean> {
  try {
    return await refreshReadCopy(eventId);
  } catch (e) {
    console.warn('[analysis] landed read not copied:', e);
    return false;
  }
}

// ── Home hears about a read it did not start (the adversarial pass's F1 on #912) ──
// Home rereads the copy when `hydrationTick` moves, and nothing in `components/` may
// change in HV-5, so that tick is how it hears about two things it could not see:
//   • a chain claimed after it last looked. Every claim is made through this module
//     (its own triggers; the log path and the record screen import the claim from
//     here), so the listener registered below hears all of them. Home re-samples the
//     working fact, draws the read as pending, and awaits the settle like any chain it
//     sampled itself;
//   • a landing that changed the copy with no chain left to settle: one the WATCH saved
//     (a read that arrived after its chain had settled), or one a trigger saved while
//     holding no claim of its own, after the chain that did own it had settled (Re-run
//     or Try again tapped while another read ran; the second pass on #912). A landing
//     inside a chain someone still owns needs no tick: it lands before the settle Home
//     is already awaiting.
// Every other reader of the tick rereads local rows it already holds; a MedStrip dose
// confirm bumps the same tick for the same reason.
function tellHomeTheReadMoved(): void {
  useSyncStore.getState().bumpHydrationTick();
}
onAnalysisChainClaimed(tellHomeTheReadMoved);

/** A trigger's landing, saved to the copy before its claim (if it holds one) settles.
 *  With no claim and no chain outstanding, nothing will release Home to reread, so the
 *  landing tells Home itself. */
async function landChain(eventId: string, claim: AnalysisChainClaim | null, invoked: boolean): Promise<void> {
  const moved = await copyLandedRead(eventId);
  if (moved && claim === null && !analysisChainOutstanding(eventId)) tellHomeTheReadMoved();
  claim?.settle(invoked);
}

// The analysis-chain claim (CUL-801) lives in `lib/analysisChain.ts`, which imports
// nothing (HV-5 moved it there so a read-only surface can ask whether a read is in
// flight without this module's sync graph). Re-exported, so every caller keeps
// importing it from here.
export { claimAnalysisChain, awaitAnalysisChain, analysisChainOutstanding } from './analysisChain';
export type { AnalysisChainClaim } from './analysisChain';

// Kicks off per-incident AI analysis for a vomit event (B-027). The
// analyze-vomit Edge Function reads the event AND its photo from Supabase, so we
// flush the event first (attachment rows FK to it), then force THIS event's
// attachment rows up — ignoring the local `synced` flag, which recovers photos
// wrongly marked synced before the upsert-error fix (their files are already in
// storage, only the row is missing). We AWAIT both so they've landed before the
// function runs, otherwise it races the sync and reports "not enough to say" on
// an event that clearly has a photo. Idempotent in the sense that the function
// upserts by event_id, so a second call CORRUPTS nothing — but it is not free
// (CUL-801: a second call burns a second cap unit and races the first one's
// write-back), so the claim above is what keeps it to one read per photo.
export async function triggerVomitAnalysis(eventId: string): Promise<{ error: string | null }> {
  // Claim the chain if nobody owns it yet (CUL-801), so a concurrent mount awaits
  // this invoke instead of making a second one. A null claim means SOMEONE ELSE
  // owns the chain and will settle it around this call — the log path, another
  // section's mount, or the photo-add path. Note this does NOT gate the invoke:
  // a direct call always invokes, which is what keeps the owner's explicit
  // "Try analysis" working. Gating is the CALLER's job, by awaiting the chain
  // first — and a caller that takes a null claim and then invokes anyway without
  // awaiting is the double-invoke this whole module exists to stop.
  const claim = claimAnalysisChain(eventId);
  let invoked = false;
  try {
    await syncPendingEvents().catch(() => {});
    await ensureEventAttachmentsSynced(eventId).catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-vomit', {
      body: { event_id: eventId },
    });
    // A refused invoke is NOT a read: settle false so a waiter retries rather
    // than watching for a row nothing is going to write.
    invoked = !error;
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    // The copy hears about this read before anyone waiting on the chain does (HV-5):
    // Home rereads the verdict on the settle, from the copy.
    await landChain(eventId, claim, invoked);
  }
}

// Kicks off per-incident AI analysis for a stool event (B-247). Structurally
// identical to triggerVomitAnalysis — flush pending sync so the event row lands,
// force THIS event's attachment rows up (ignoring the local `synced` flag, same
// recovery reasoning as vomit), then fire-and-forget invoke analyze-stool with
// { event_id }. On log, app/log.tsx only invokes this for a PHOTOGRAPHED stool;
// but StoolAnalysisSection ALSO triggers on detail-screen mount regardless of
// photo, so a photoless stool IS round-tripped there — deliberately, because the
// server computes contextual escalation flags (repeated loose stool, concurrent
// vomiting/lethargy) with no photo needed, and that escalation must run. A
// photoless-and-no-flag read collapses to not_enough_to_say; the detail section
// suppresses that dead result (B-363). Same idempotence caveat as vomit: a second
// call corrupts nothing but costs a cap unit and races the first (CUL-801).
export async function triggerStoolAnalysis(eventId: string): Promise<{ error: string | null }> {
  // Claim the chain if nobody owns it yet (CUL-801), so a concurrent mount awaits
  // this invoke instead of making a second one. A null claim means SOMEONE ELSE
  // owns the chain and will settle it around this call — the log path, another
  // section's mount, or the photo-add path. Note this does NOT gate the invoke:
  // a direct call always invokes, which is what keeps the owner's explicit
  // "Try analysis" working. Gating is the CALLER's job, by awaiting the chain
  // first — and a caller that takes a null claim and then invokes anyway without
  // awaiting is the double-invoke this whole module exists to stop.
  const claim = claimAnalysisChain(eventId);
  let invoked = false;
  try {
    await syncPendingEvents().catch(() => {});
    await ensureEventAttachmentsSynced(eventId).catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-stool', {
      body: { event_id: eventId },
    });
    // A refused invoke is NOT a read: settle false so a waiter retries rather
    // than watching for a row nothing is going to write.
    invoked = !error;
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    // The copy hears about this read before anyone waiting on the chain does (HV-5):
    // Home rereads the verdict on the settle, from the copy.
    await landChain(eventId, claim, invoked);
  }
}

// ── Realtime watch for a per-incident analysis row (CUL-171 / B-030) ──────────
//
// The detail-screen sections (VomitAnalysisSection / StoolAnalysisSection) show
// the analyze-* Edge Function's result the moment it lands. The function writes
// asynchronously, so the client must wait for the row to move off 'pending'.
// This replaces a fixed 3s×12 (~36s) poll.
//
// Primary mechanism: a Supabase realtime postgres_changes subscription filtered
// to THIS event's row. It delivers the instant the function writes — no poll
// loop, and no fixed give-up cliff (a vision call that finishes at 45s still
// resolves instantly). event_ai_analysis is RLS-scoped by pet_id (migration
// 013) and realtime enforces that policy per subscriber and fails closed, so the
// stream carries only the owner's own rows (migration 059 adds the table to the
// supabase_realtime publication).
//
// Two robustness details realtime alone doesn't cover:
//   1. postgres_changes only carries changes that happen AFTER the socket is
//      live, so a row the function writes during the mount→subscribe gap would
//      be missed. We reconcile with one authoritative re-read the moment the
//      channel reports SUBSCRIBED (and on every change thereafter).
//   2. Realtime on mobile is best-effort (backgrounding, dropped sockets, an
//      RLS check that fails closed). A SMALL, widening schedule of fallback
//      re-reads sits behind it — NOT a tight poll — so a missed push still
//      resolves, and an unreachable socket degrades to the same "give up →
//      manual retry" floor the old poll had (last fallback ~40s ≈ old ~36s).
//
// `check` performs the caller's typed re-read and returns true once the row has
// resolved (moved off 'pending'); returning true tears the watch down.
// `onGiveUp` fires once if the fallback schedule is exhausted still unresolved.
// Returns a teardown to call on unmount / before re-triggering. Idempotent:
// calling the teardown more than once is safe.
export const ANALYSIS_WATCH_FALLBACK_DELAYS_MS = [8000, 20000, 40000];

export function watchAnalysisRow(
  eventId: string,
  check: () => Promise<boolean>,
  onGiveUp: () => void,
): () => void {
  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let channel: ReturnType<typeof supabase.channel> | undefined;

  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    if (channel) supabase.removeChannel(channel);
  };

  // A single reconcile attempt: re-read, and resolve or (on the last fallback)
  // give up. `isLast` marks the final scheduled fallback so the give-up fires
  // exactly once, only when realtime never delivered.
  const tick = async (isLast: boolean) => {
    if (done) return;
    // Save this event's verdict to the phone's copy FIRST (HV-5): Home's check reads
    // the copy, so it can only see a landing this tick has already saved. A save that
    // changed the copy is told to Home whether or not this watch is still wanted: the
    // copy moved either way.
    if (await copyLandedRead(eventId)) tellHomeTheReadMoved();
    if (done) return; // torn down mid-save
    let resolved = false;
    try {
      resolved = await check();
    } catch (e) {
      // A transient read failure is not a give-up — the next tick (realtime or
      // the next fallback) retries. But don't fail silently: log it, matching
      // the components' `[vomit-analysis]`/`[stool-analysis]` console tags.
      console.warn('[analysis-watch] check failed:', e);
      resolved = false;
    }
    if (done) return; // torn down mid-read
    if (resolved) {
      finish();
    } else if (isLast) {
      finish();
      onGiveUp();
    }
  };

  channel = supabase
    .channel(`event_ai_analysis:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_ai_analysis',
        filter: `event_id=eq.${eventId}`,
      },
      () => {
        void tick(false);
      },
    )
    .subscribe((status) => {
      // Reconcile once the socket is live — closes the mount→subscribe race.
      if (status === 'SUBSCRIBED') void tick(false);
    });

  const lastIdx = ANALYSIS_WATCH_FALLBACK_DELAYS_MS.length - 1;
  ANALYSIS_WATCH_FALLBACK_DELAYS_MS.forEach((delay, i) => {
    timers.push(setTimeout(() => void tick(i === lastIdx), delay));
  });

  return finish;
}

// The owner-editable structured fields for a stool read (B-247, mirrors
// EDITABLE_VOMIT_FIELDS). These are the descriptive/clinical columns on
// event_ai_analysis that feed the vet report — an owner edit is human-reviewed
// and so more-trusted than the raw AI value (raw AI < human). The n=1 read
// columns (recommendation / read_text / visual_flags / contextual_flags /
// status) are deliberately NOT here: an owner edit can never alter the read,
// only the owner-reviewed facts. Values are the stool-prefixed DB column names
// (the stool payload keys are un-prefixed — the PR 6 detail screen owns the
// payload↔column mapping and the diff/save machinery; this constant just names
// the editable set). `stool_blood_type` rides with `stool_blood_present` since
// the fresh-vs-tarry discriminator is part of the same owner-editable finding.
export const EDITABLE_STOOL_FIELDS = [
  'stool_consistency',
  'stool_colour',
  'stool_content',
  'stool_blood_present',
  'stool_blood_type',
  'stool_mucus_present',
  'foreign_material_present',
  'foreign_material_note',
  'description',
] as const;

export type EditableStoolField = (typeof EDITABLE_STOOL_FIELDS)[number];

// ── Owner edits to the structured fields (B-028) ──────────────────────────────
// The n=1 read (recommendation / read_text) is DISMISSIBLE, never editable; only
// these descriptive/clinical fields are owner-editable. They feed the vet report
// — an owner-edited field is human-reviewed and so the more-trusted value (raw
// AI < human). `bile_present` is captured but deliberately not surfaced in the
// read view, so it stays out of the editable set here (edit only what's shown);
// revisit if it's ever displayed. Enum values mirror migration 013 and the
// analyze-vomit tool schema. See docs/backlog.md B-013/B-027/B-028.
export const EDITABLE_VOMIT_FIELDS = [
  'colour',
  'consistency',
  'contents',
  'blood_present',
  'foreign_material_present',
  'foreign_material_note',
  'description',
] as const;

export type EditableVomitField = (typeof EDITABLE_VOMIT_FIELDS)[number];

export interface VomitEditableFields {
  colour: string | null;
  consistency: string | null;
  contents: string[] | null;
  blood_present: string | null;
  foreign_material_present: string | null;
  foreign_material_note: string | null;
  description: string | null;
}

function normText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

// Order-preserving de-dup: `contents` is semantically a SET (a multi-select of
// distinct observations), so a duplicate is meaningless. Deduping here — on both
// the write and both sides of the diff — keeps a model-emitted ['bile','bile']
// from mis-firing the "edited" marker against an owner's de-duplicated ['bile'].
function normArray(v: string[] | null | undefined): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

// Canonical form for write + compare: empty strings and empty arrays collapse to
// the `null` the AI payload already uses for "absent". This is what makes a blank
// edit indistinguishable from a never-set field, and a no-op edit register as
// "no change" (not a spurious owner override).
export function normalizeVomitEdits(edits: VomitEditableFields): VomitEditableFields {
  const contents = normArray(edits.contents);
  return {
    colour: edits.colour ?? null,
    consistency: edits.consistency ?? null,
    contents: contents.length > 0 ? contents : null,
    blood_present: edits.blood_present ?? null,
    foreign_material_present: edits.foreign_material_present ?? null,
    foreign_material_note: normText(edits.foreign_material_note),
    description: normText(edits.description),
  };
}

// Pull the editable fields out of the cached raw AI payload (ai_raw_payload, a
// JSONB blob of the original VomitAnalysis). Returns null when there's no usable
// payload — the "no baseline to compare against" case for deriveEditedFields.
export function extractEditableFromPayload(
  payload: Record<string, unknown> | null | undefined,
): VomitEditableFields | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const str = (k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const arr = (k: string): string[] | null =>
    Array.isArray(p[k]) ? (p[k] as unknown[]).filter((x): x is string => typeof x === 'string') : null;
  return normalizeVomitEdits({
    colour: str('colour'),
    consistency: str('consistency'),
    contents: arr('contents'),
    blood_present: str('blood_present'),
    foreign_material_present: str('foreign_material_present'),
    foreign_material_note: str('foreign_material_note'),
    description: str('description'),
  });
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

// Which editable fields differ from the original AI read (ai_raw_payload). This
// is the single derivation behind BOTH the per-field "edited" marker and the vet
// report's "owner-confirmed fields only" rule (B-028 / requirements §8.7): a
// field listed here is the owner's, not the AI's. Returns [] when there's no AI
// baseline — an edit can't be attributed without an original to diff against.
//
// NOTE for the Step 9 PR-7 (report) author: in the no-baseline case (analysis
// failed/pending, ai_raw_payload null) this safely UNDER-claims — an owner who
// filled a field still gets []. So "owner-confirmed" for the report must key off
// a non-null edited VALUE (with edited_at set), NOT the presence of a marker here,
// or those fields would be wrongly excluded. (adversarial-reviewer, B-028.)
export function deriveEditedFields(
  current: VomitEditableFields,
  original: VomitEditableFields | null,
): EditableVomitField[] {
  if (!original) return [];
  const cur = normalizeVomitEdits(current);
  const orig = normalizeVomitEdits(original);
  return EDITABLE_VOMIT_FIELDS.filter((f) => {
    if (f === 'contents') return !sameSet(cur.contents ?? [], orig.contents ?? []);
    return cur[f] !== orig[f];
  });
}

export interface VomitEditWrite extends VomitEditableFields {
  edited_at: string;
}

// The exact column set a client edit writes: the editable fields plus the single
// `edited_at` provenance stamp. Critically it contains NONE of the n=1 read
// columns (recommendation / read_text / visual_flags / contextual_flags / status)
// — a client edit can never alter the read, only the owner-reviewed facts. And
// `edited_at` being set is what ARMS the Edge Function's never-clobber guard on
// the next re-analysis. Pure (takes `nowIso`) so the write shape is unit-testable.
export function buildVomitEditWrite(edits: VomitEditableFields, nowIso: string): VomitEditWrite {
  return { ...normalizeVomitEdits(edits), edited_at: nowIso };
}

// Persist an owner's edits to the structured fields. Direct Supabase write (RLS
// scopes it to the owner via pet_id), mirroring the dismiss toggle — NOT the
// local-first sync queue, since event_ai_analysis is server-owned and its structured
// fields are read straight from Supabase. The one part mirrored into SQLite is the
// four-column verdict copy (HV-5, `lib/readCopy.ts`), which an owner edit never
// changes: it touches none of the read's columns (see buildVomitEditWrite).
export async function saveVomitFieldEdits(
  eventId: string,
  edits: VomitEditableFields,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('event_ai_analysis')
      .update(buildVomitEditWrite(edits, new Date().toISOString()))
      .eq('event_id', eventId);
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Owner edits to the STOOL structured fields (B-247 PR 6, B-028) ─────────────
// The stool twin of the vomit edit machinery above — same never-clobber contract:
// the n=1 read (recommendation / read_text) is DISMISSIBLE, never editable; only
// the descriptive/clinical facts that feed the vet report are owner-editable, and
// an owner-edited field is the more-trusted value (raw AI < human).
//
// Key shape difference from vomit: the DB columns are stool-PREFIXED
// (stool_consistency, …) — so this interface is keyed on the column names in
// EDITABLE_STOOL_FIELDS, and extractStoolEditableFromPayload maps the UN-prefixed
// keys of the cached ai_raw_payload (StoolAnalysis: consistency, colour, …) onto
// them. foreign_material_present/_note + description reuse migration 013's columns
// (not stool-prefixed), matching the analyze-stool write-back.
export interface StoolEditableFields {
  stool_consistency: string | null;
  stool_colour: string | null;
  stool_content: string[] | null;
  stool_blood_present: string | null;
  stool_blood_type: string | null;
  stool_mucus_present: string | null;
  foreign_material_present: string | null;
  foreign_material_note: string | null;
  description: string | null;
}

// Canonical form for write + compare. Mirrors normalizeVomitEdits, plus one
// stool-specific rule: stool_blood_type is meaningful ONLY when blood is present,
// so a stray type is cleared when blood_present ≠ 'yes' (matches the analyze-stool
// server rule — keeps colour/blood corroboration from drifting, and stops a
// blood→"None" correction leaving an orphan "Dark / tarry" behind).
export function normalizeStoolEdits(edits: StoolEditableFields): StoolEditableFields {
  const content = normArray(edits.stool_content);
  const bloodPresent = edits.stool_blood_present ?? null;
  const bloodType = bloodPresent === 'yes' ? (edits.stool_blood_type ?? null) : null;
  return {
    stool_consistency: edits.stool_consistency ?? null,
    stool_colour: edits.stool_colour ?? null,
    stool_content: content.length > 0 ? content : null,
    stool_blood_present: bloodPresent,
    stool_blood_type: bloodType,
    stool_mucus_present: edits.stool_mucus_present ?? null,
    foreign_material_present: edits.foreign_material_present ?? null,
    foreign_material_note: normText(edits.foreign_material_note),
    description: normText(edits.description),
  };
}

// Pull the editable fields out of the cached raw AI payload (ai_raw_payload, a
// JSONB blob of the original StoolAnalysis with UN-prefixed keys). Returns null
// when there's no usable payload — the "no baseline to compare against" case.
export function extractStoolEditableFromPayload(
  payload: Record<string, unknown> | null | undefined,
): StoolEditableFields | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const str = (k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const arr = (k: string): string[] | null =>
    Array.isArray(p[k]) ? (p[k] as unknown[]).filter((x): x is string => typeof x === 'string') : null;
  return normalizeStoolEdits({
    stool_consistency: str('consistency'),
    stool_colour: str('colour'),
    stool_content: arr('contents'),
    stool_blood_present: str('blood_present'),
    stool_blood_type: str('blood_type'),
    stool_mucus_present: str('mucus_present'),
    foreign_material_present: str('foreign_material_present'),
    foreign_material_note: str('foreign_material_note'),
    description: str('description'),
  });
}

// Which editable fields differ from the original AI read. Single derivation behind
// BOTH the per-field "edited" marker and the vet report's "owner-confirmed fields
// only" rule (§8.7). Returns [] with no AI baseline — an edit can't be attributed
// without an original to diff against (see the deriveEditedFields note above; the
// same under-claim safety applies to the stool report author).
export function deriveEditedStoolFields(
  current: StoolEditableFields,
  original: StoolEditableFields | null,
): EditableStoolField[] {
  if (!original) return [];
  const cur = normalizeStoolEdits(current);
  const orig = normalizeStoolEdits(original);
  return EDITABLE_STOOL_FIELDS.filter((f) => {
    if (f === 'stool_content') return !sameSet(cur.stool_content ?? [], orig.stool_content ?? []);
    return cur[f] !== orig[f];
  });
}

export interface StoolEditWrite extends StoolEditableFields {
  edited_at: string;
}

// The exact column set a stool client edit writes: the editable fields plus the
// single `edited_at` provenance stamp — and NONE of the n=1 read/pipeline columns.
// `edited_at` being set is what ARMS the Edge Function's never-clobber guard on the
// next re-analysis. Pure (takes `nowIso`) so the write shape is unit-testable.
export function buildStoolEditWrite(edits: StoolEditableFields, nowIso: string): StoolEditWrite {
  return { ...normalizeStoolEdits(edits), edited_at: nowIso };
}

// Persist an owner's edits to the stool structured fields. Direct Supabase write
// (RLS scopes it to the owner via pet_id), mirroring saveVomitFieldEdits.
export async function saveStoolFieldEdits(
  eventId: string,
  edits: StoolEditableFields,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('event_ai_analysis')
      .update(buildStoolEditWrite(edits, new Date().toISOString()))
      .eq('event_id', eventId);
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
