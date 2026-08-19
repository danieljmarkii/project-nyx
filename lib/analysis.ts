import { supabase } from './supabase';
import { syncPendingEvents, ensureEventAttachmentsSynced } from './sync';

// Kicks off per-incident AI analysis for a vomit event (B-027). The
// analyze-vomit Edge Function reads the event AND its photo from Supabase, so we
// flush the event first (attachment rows FK to it), then force THIS event's
// attachment rows up — ignoring the local `synced` flag, which recovers photos
// wrongly marked synced before the upsert-error fix (their files are already in
// storage, only the row is missing). We AWAIT both so they've landed before the
// function runs, otherwise it races the sync and reports "not enough to say" on
// an event that clearly has a photo. Idempotent: the function upserts the
// event_ai_analysis row keyed by event_id, so calling this twice (auto-on-log
// and again on detail open / re-run) is safe.
export async function triggerVomitAnalysis(eventId: string): Promise<{ error: string | null }> {
  try {
    await syncPendingEvents().catch(() => {});
    await ensureEventAttachmentsSynced(eventId).catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-vomit', {
      body: { event_id: eventId },
    });
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
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
// suppresses that dead result (B-363). Idempotent: the function upserts
// event_ai_analysis keyed by event_id, so auto-on-log and a later detail-open
// re-run are both safe.
export async function triggerStoolAnalysis(eventId: string): Promise<{ error: string | null }> {
  try {
    await syncPendingEvents().catch(() => {});
    await ensureEventAttachmentsSynced(eventId).catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-stool', {
      body: { event_id: eventId },
    });
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
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
// local-first sync queue, since event_ai_analysis is server-owned and read
// straight from Supabase, never mirrored into SQLite.
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
