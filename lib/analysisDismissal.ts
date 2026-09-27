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
// What the owner saw is everything Hide takes off the screen: the verdict, the read
// text, the description AND every observation the grid draws. The read text leads with
// the contextual template, so a replaced photo can add fresh red blood under
// byte-identical words (adversarial round 2), turn "Fresh red" into "Dark / tarry"
// through a column that is not a red flag on its own (stool_blood_type, round 3), or
// change only the description or the contents (round 4). So the lists are every column
// the section reads, not the descriptors' RED_FLAG_COLUMNS: the section suites render
// each section over a row that records what it reads and fail on a column that is
// neither here nor excluded with a reason (C-34: the question is "what did the owner
// see", which is wider than "which columns carry a red flag"). An array compares
// through the Postgres array literal, every element quoted.
//
// Not `status` and not `updated_at`: a status move that keeps the words (a failed
// re-run over a calm read) leaves the owner hiding exactly what they read, and
// `updated_at` moves on an owner edit on this screen, which the local row already
// carries.
//
// Stated residuals:
//   · A failed re-read after 'read_changed' puts back the card the owner was looking
//     at, with "Could not update". The row itself is not hidden, and a null read cannot
//     tell a network error from a row this account can no longer see.
//   · This protects hides made by THIS client. A build already on a phone still sends
//     `update({ dismissed_at }).eq('event_id')`, so on that build a stale screen can
//     still hide a Worth a call that landed unseen, until a later read clears it (the
//     server clears on every read, a hold included). A hidden row offers no Re-run, so
//     that later read may never come; the server-side answer is CUL-1357.
import { supabase } from './supabase';

export const VOMIT_DISMISSAL_COLUMNS = [
  'recommendation', 'read_text', 'description',
  'colour', 'consistency', 'contents', 'blood_present', 'foreign_material_present', 'foreign_material_note',
] as const;
export const STOOL_DISMISSAL_COLUMNS = [
  'recommendation', 'read_text', 'description',
  'stool_consistency', 'stool_colour', 'stool_content', 'stool_blood_present', 'stool_blood_type',
  'stool_mucus_present', 'foreign_material_present', 'foreign_material_note',
] as const;

type ShownValue = string | null | readonly string[];

/** The columns a Hide or Show was made on, as the screen held them. */
export type ShownRead = Record<string, ShownValue>;

export type DismissalOutcome = 'written' | 'read_changed' | 'failed';

function columnValue(row: object, column: string): ShownValue {
  const value = (row as Record<string, unknown>)[column];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value as string[];
  return null;
}

function sameValue(a: ShownValue, b: ShownValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

// A Postgres text[] literal with every element quoted, so a comma, a brace, a quote or
// a space inside a value can never split the array or end it.
export function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/[\\"]/g, (c) => `\\${c}`)}"`).join(',')}}`;
}

export function shownRead<T extends object, K extends keyof T & string>(row: T, columns: readonly K[]): ShownRead {
  const shown: ShownRead = {};
  for (const column of columns) shown[column] = columnValue(row, column);
  return shown;
}

export function sameShown(row: object, shown: ShownRead): boolean {
  return Object.entries(shown).every(([column, value]) => sameValue(columnValue(row, column), value));
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
    if (value === null) query = query.is(column, null);
    else if (typeof value === 'string') query = query.eq(column, value);
    else query = query.filter(column, 'eq', pgTextArray(value));
  }
  const { data, error } = await query.select('event_id');
  if (error) return 'failed';
  return data && data.length > 0 ? 'written' : 'read_changed';
}

// Said when a Hide or Show found a different read in the record than the one on
// screen. Direction-neutral, because both controls can meet it, and true whether the
// change was a new read or an edit on another device, and whether it is now shown or
// hidden.
export const READ_CHANGED_TITLE = 'This note changed';
export const READ_CHANGED_BODY = 'It was updated while this was open. Have a look, then try again.';
