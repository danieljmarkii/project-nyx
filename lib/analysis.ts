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
