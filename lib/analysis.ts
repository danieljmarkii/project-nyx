import { supabase } from './supabase';
import { syncPendingEvents } from './sync';

// Kicks off per-incident AI analysis for a vomit event (B-027). The
// analyze-vomit Edge Function reads the event + its photo from Supabase, so we
// flush pending events first to make sure the row (and any just-attached photo)
// has synced up before the function tries to read it. Idempotent: the function
// upserts the event_ai_analysis row keyed by event_id, so calling this twice
// (e.g. auto-on-log and again lazily on detail open) is safe.
export async function triggerVomitAnalysis(eventId: string): Promise<{ error: string | null }> {
  try {
    await syncPendingEvents().catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-vomit', {
      body: { event_id: eventId },
    });
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
