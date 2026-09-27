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
// So the write matches the words the owner saw, verdict and read text, null-safe.
// A write that matches no row means the read changed underneath: the caller
// re-reads, shows the record, and says so. Show takes the same compare. It only
// ever reveals more, but on stale words it would put an old read on screen over
// a newer one without a word.
//
// The words, not `status` and not `updated_at`: a status move that keeps the
// words (a failed re-run over a calm read) leaves the owner hiding exactly what
// they read, and `updated_at` moves on an owner edit to the observations, which
// changes nothing the hide is about.
import { supabase } from './supabase';

export interface ShownRead {
  recommendation: string | null;
  read_text: string | null;
}

export type DismissalOutcome = 'written' | 'read_changed' | 'failed';

export function sameWords(a: ShownRead, b: ShownRead): boolean {
  return a.recommendation === b.recommendation && a.read_text === b.read_text;
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
  // `eq` never matches NULL in SQL, so a null half needs `is` or the compare
  // could never pass on a row whose read is still blank.
  query = shown.recommendation === null
    ? query.is('recommendation', null)
    : query.eq('recommendation', shown.recommendation);
  query = shown.read_text === null
    ? query.is('read_text', null)
    : query.eq('read_text', shown.read_text);
  const { data, error } = await query.select('event_id');
  if (error) return 'failed';
  return data && data.length > 0 ? 'written' : 'read_changed';
}

// Said when a Hide or Show found different words in the record than the ones on
// screen. Direction-neutral, because both controls can meet it.
export const READ_CHANGED_TITLE = 'This note changed';
export const READ_CHANGED_BODY = 'A newer read came in while this was open. This is the latest one.';
