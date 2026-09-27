// Hide / Show on the per-incident AI read, written as a statement about the
// words on screen (CUL-1323).
//
// The ruling is that a dismissal belongs to the words the owner read, not to the
// incident. The server holds one half: every real read writes `dismissed_at:
// null` (`buildAnalysisWriteBack`), so a hide never carries over onto words the
// owner has not seen. This is the other half, the ORDER. Hide used to be
// `update({ dismissed_at }).eq('event_id')`, so a new read landing where this
// screen was not looking (a replaced photo, Ask's live read, a second device)
// followed by a Hide tapped on the stale calm card hid a Worth a call the owner
// never saw: "AI note hidden" on the incident, the escalation off the screen.
//
// So the write matches what the owner saw, null-safe. A write that matches no row
// means the read changed underneath: the caller re-reads, shows the record, and
// says so. Show takes the same compare. It only ever reveals more, but on stale
// words it would put an old read on screen over a newer one without a word.
//
// What the owner saw is the verdict, the read text AND the red-flag observations:
// Hide takes the observation grid off the screen too, and the read text leads with
// the contextual template, so a replaced photo can add fresh red blood under
// byte-identical words (adversarial round 2). The red-flag columns mirror each
// descriptor's RED_FLAG_COLUMNS (supabase/functions/analyze-*/index.ts): the same
// question, "which columns carry a red flag", so lib/analysisDismissal.test.ts reads
// both files and fails on drift (C-34).
//
// Not `status` and not `updated_at`: a status move that keeps the words (a failed
// re-run over a calm read) leaves the owner hiding exactly what they read, and
// `updated_at` moves on an owner edit on this screen, which the local row already
// carries.
//
// A stated residual: a failed re-read after 'read_changed' puts back the card the
// owner was looking at, with "Could not update". The row itself is not hidden, and a
// null read cannot tell a network error from a row this account can no longer see.
import { supabase } from './supabase';

export const VOMIT_DISMISSAL_COLUMNS = ['recommendation', 'read_text', 'blood_present', 'foreign_material_present'] as const;
export const STOOL_DISMISSAL_COLUMNS = ['recommendation', 'read_text', 'stool_blood_present', 'foreign_material_present'] as const;

/** The columns a Hide or Show was made on, as the screen held them. */
export type ShownRead = Record<string, string | null>;

export type DismissalOutcome = 'written' | 'read_changed' | 'failed';

function columnValue(row: object, column: string): string | null {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'string' ? value : null;
}

export function shownRead<T extends object, K extends keyof T & string>(row: T, columns: readonly K[]): ShownRead {
  const shown: ShownRead = {};
  for (const column of columns) shown[column] = columnValue(row, column);
  return shown;
}

export function sameShown(row: object, shown: ShownRead): boolean {
  return Object.entries(shown).every(([column, value]) => columnValue(row, column) === value);
}

export async function writeAnalysisDismissal(
  eventId: string,
  shown: ShownRead,
  dismissedAt: string | null,
): Promise<DismissalOutcome> {
  let query = supabase
    .from('event_ai_analysis')
    .update({ dismissed_at: dismissedAt })
    .eq('event_id', eventId);
  // `eq` never matches NULL in SQL, so a null column needs `is` or the compare
  // could never pass on a row whose read is still blank.
  for (const [column, value] of Object.entries(shown)) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data, error } = await query.select('event_id');
  if (error) return 'failed';
  return data && data.length > 0 ? 'written' : 'read_changed';
}

// Said when a Hide or Show found a different read in the record than the one on
// screen. Direction-neutral, because both controls can meet it, and true whether the
// newer read is shown or was itself hidden on another device.
export const READ_CHANGED_TITLE = 'This note changed';
export const READ_CHANGED_BODY = 'A newer read came in while this was open. Nothing was changed.';
