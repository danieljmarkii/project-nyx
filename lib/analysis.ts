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
