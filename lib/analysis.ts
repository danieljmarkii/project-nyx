import { supabase } from './supabase';
import { syncPendingEvents, syncPendingAttachments } from './sync';

// Kicks off per-incident AI analysis for a vomit event (B-027). The
// analyze-vomit Edge Function reads the event AND its photo from Supabase, so we
// flush pending events first (attachment rows FK to the event), then pending
// attachments — and we AWAIT the attachment flush so the photo's storage upload
// + row upsert have actually landed before the function runs. Without this, the
// function races the (fire-and-forget) foreground sync and sees no photo yet,
// reporting "not enough to say" on an event that clearly has one. Idempotent:
// the function upserts the event_ai_analysis row keyed by event_id, so calling
// this twice (auto-on-log and again on detail open / re-run) is safe.
export async function triggerVomitAnalysis(eventId: string): Promise<{ error: string | null }> {
  try {
    await syncPendingEvents().catch(() => {});
    await syncPendingAttachments().catch(() => {});
    const { error } = await supabase.functions.invoke('analyze-vomit', {
      body: { event_id: eventId },
    });
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
