// Single owner of the "simple event" write side-effects (B-745 PR 3).
//
// A simple event is any logged event that is NOT a meal / medication / weight —
// i.e. the symptom types (vomit, loose stool, formed stool, lethargy, itch) and
// Other. These share one write shape: a single `events` row (B-010 time fields),
// an optional photo attachment (which, for vomit/stool, TRIGGERS the per-incident
// AI read — B-027/B-247, unchanged here), the sync push, and the AI-Signal regen.
//
// This helper exists for the same reason lib/meals.ts's insertMeal does: the write
// was hand-inlined in app/log.tsx's handleConfirm, and B-745 PR 3 adds a SECOND
// entry point — the in-sheet confirm (components/log/SimpleEventConfirm, reached
// from the More-events bottom sheet when log_picker_v2 is live). Two hand-written
// copies of the same INSERT + photo-trigger + sync + regen would drift, so both
// callers route through here. The event-INSERT SQL and the photo→AI-read trigger
// are identical to what handleConfirm did — this only relocates them so a new
// entry point physically cannot forget one (the insertMeal rationale).
//
// Scope (mirrors insertMeal): the durable event write + the optional attachment +
// the two fire-and-forget freshness side-effects (sync, regen). The in-memory
// store update (prependEvent) and the completion moment stay with the caller —
// they are UI concerns that legitimately differ per surface (the full-screen /log
// plays a root beat after router.back(); the sheet plays its beat in place), and
// keeping them out keeps lib/ free of a store/router dependency. Each caller calls
// prependEvent with the ids this helper returns.

import { getDb } from './db';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingMeals } from './sync';
import { triggerSignalRegenDebounced } from './signal';
import { triggerVomitAnalysis, triggerStoolAnalysis, claimAnalysisChain } from './analysis';
import { uploadPhoto, compressForUpload, persistCapture } from './storage';
import { uuid, OccurredConfidence } from './utils';
import { isStoolEvent } from '../constants/eventTypes';

// A photo the owner attached in the confirm. `takenAt` is the trusted EXIF ISO (or
// null); width/height are the source pixel dims kept only so compressForUpload can
// cap the true longest edge (B-352) — undefined falls back to measuring the image.
export interface SimpleEventAttachment {
  uri: string;
  takenAt: string | null;
  width?: number;
  height?: number;
}

export interface InsertSimpleEventParams {
  petId: string;
  // A non-meal/med/weight events.event_type: 'vomit' | 'diarrhea' | 'stool_normal'
  // | 'lethargy' | 'itch' | 'other'. Typed as string because the enum lives in
  // constants/eventTypes and the DB is the authority; the caller passes a validated key.
  eventType: string;
  // B-010 time fields — the caller derives these from the Saw-it/Found-it control
  // via buildTimeFields (lib/eventTimeEdit), so occurred_at, confidence and window
  // bounds always agree. occurred_at is the single derived point every existing
  // reader keys off; the window bounds carry the uncertainty.
  confidence: OccurredConfidence;
  occurredAt: Date;
  earliest: Date | null;
  latest: Date | null;
  source: 'manual' | 'exif' | 'now';
  notes: string | null;
  // Severity left the MVP (constants/eventTypes: hasSeverity is false for every
  // type), so this is always null today — kept as an explicit param so the write
  // shape matches the historical column and a future re-introduction has a seam.
  severity?: number | null;
  attachment?: SimpleEventAttachment | null;
}

export interface InsertSimpleEventResult {
  eventId: string;
  // ISO occurred_at written to the row — use this for prependEvent so the store
  // mirrors the DB exactly.
  occurredAtIso: string;
  // ISO created_at/updated_at written to the row.
  now: string;
}

// Write a simple event, attach its optional photo (firing the AI read for
// vomit/stool), push it to Supabase, and refresh the AI Signal. Throws only if the
// event row write fails — nothing is durably written in that case, so the caller's
// double-submit guard can release and a retry is safe. The photo, sync push and
// regen are best-effort and never throw into the caller: once the event row lands,
// the log has succeeded and a photo/sync hiccup must not read back as a failed log
// (which would send the owner to re-log and duplicate the record).
export async function insertSimpleEvent(
  params: InsertSimpleEventParams,
): Promise<InsertSimpleEventResult> {
  const db = getDb();
  const now = new Date().toISOString();
  const occurredAtIso = params.occurredAt.toISOString();
  const eventId = uuid();

  // The event row. Same columns/shape as app/log.tsx's non-meal branch wrote
  // inline (B-010: occurred_at is the derived point, the window bounds carry the
  // uncertainty, synced=0 queues it). Throws on failure → caller alerts + keeps
  // the tiles live; nothing is written, so a retry is clean.
  await db.runAsync(
    `INSERT INTO events
       (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
        occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
        created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, 0)`,
    [
      eventId, params.petId, params.eventType, occurredAtIso,
      params.severity ?? null, params.notes, params.source,
      params.confidence,
      params.earliest ? params.earliest.toISOString() : null,
      params.latest ? params.latest.toISOString() : null,
      now, now,
    ],
  );

  // Photo attachment (optional). Deliberately AFTER the event is committed and
  // best-effort: the event IS the record, the photo an enrichment — so a photo
  // failure never fails a committed log (and so can never send the owner to re-log
  // and write a duplicate event). insertMeal draws the same line around its
  // last_used_at touch.
  if (params.attachment) {
    await attachPhotoBestEffort(db, eventId, params.petId, params.eventType, params.attachment, now);
  }

  // Push immediately (events before meals — meals FK → events.id) so the event
  // reaches Supabase without waiting for the next foreground/reconnect.
  // Fire-and-forget, mirroring app/log.tsx's non-meal tail.
  syncPendingEvents()
    .then(() => syncPendingMeals())
    .catch((e) => console.error('[insertSimpleEvent] sync push failed:', e));

  // Freshness (§2): a new symptom can change the cached insight set, so refresh
  // the AI Signal. Debounced so several logs in one sitting collapse into one
  // regen. Fire-and-forget — home re-reads cache on focus.
  triggerSignalRegenDebounced(params.petId);

  return { eventId, occurredAtIso, now };
}

// Insert the attachment row and kick off the compress → upload → AI-read chain.
// Wrapped so a failure NEVER throws past the already-committed event (see the
// caller's rationale). The upload/analysis chain is the exact sequence app/log.tsx
// ran inline: persist the capture off the OS cache (B-104), insert the local row
// synced=0, then async compress (B-352) + upload + upsert + mark synced, and only
// then trigger the per-incident read (B-027 vomit / B-247 stool) — the read is
// gated on the row actually landing in Supabase so the function can read it.
async function attachPhotoBestEffort(
  db: ReturnType<typeof getDb>,
  eventId: string,
  petId: string,
  eventType: string,
  attachment: SimpleEventAttachment,
  now: string,
): Promise<void> {
  try {
    const attId = uuid();
    const storagePath = `${petId}/${eventId}/${attId}.jpg`;
    const localUri = persistCapture(attachment.uri, `${attId}.jpg`);
    await db.runAsync(
      `INSERT INTO event_attachments
         (id, event_id, pet_id, local_uri, storage_path, mime_type, taken_at, synced, created_at)
       VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
      [attId, eventId, petId, localUri, storagePath, attachment.takenAt ?? null, now],
    );
    const isVomit = eventType === 'vomit';
    // Both stool event_type values (formed + loose) carry a photographed read.
    // The shared predicate (CUL-802) is the same one the log surfaces route on and
    // the detail screen renders on, so "which logs get a read" cannot mean one
    // thing here and another at the door.
    const isStool = isStoolEvent(eventType);
    // CUL-801 — claim this event's first read BEFORE the compress/upload starts.
    // The claim is taken SYNCHRONOUSLY, inside the await this function's caller
    // is already holding, so it is in place before insertSimpleEvent resolves and
    // the incident screen (CUL-800) can never mount into a gap ahead of it. A
    // screen that mounts mid-upload then awaits this chain instead of starting a
    // second read. Photo events with no per-incident read hold no claim.
    const readClaim = isVomit || isStool ? claimAnalysisChain(eventId) : null;
    // Async so it doesn't delay the caller's completion beat. Self-contained: a
    // failure here is logged and dropped (the local row stays synced=0 and the
    // queue retries; the lazy detail-open trigger analyzes once the row is up).
    void (async () => {
      let invoked = false;
      try {
        const uploadUri = await compressForUpload(attachment.uri, attachment.width, attachment.height);
        await uploadPhoto('nyx-event-attachments', storagePath, uploadUri);
        const { error: attErr } = await supabase.from('event_attachments').upsert(
          {
            id: attId, event_id: eventId, pet_id: petId,
            storage_path: storagePath, mime_type: 'image/jpeg', taken_at: attachment.takenAt ?? null,
          },
          { onConflict: 'id' },
        );
        // Only mark synced + analyze if the row actually landed (supabase-js
        // returns errors rather than throwing) — the trap B-027 documented.
        if (attErr) { console.warn('[insertSimpleEvent] event_attachment upsert failed:', attErr.message); return; }
        await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
        // AWAITED, where this was fire-and-forget: the claim has to settle on the
        // invoke's real outcome, because that is what releases a waiting incident
        // screen — at the right moment, and with a truthful flag. The trigger
        // itself never throws (it returns { error }), and nothing downstream of
        // here waits on this IIFE, so the await costs the owner nothing.
        if (isVomit || isStool) {
          const { error: readErr } = isVomit
            ? await triggerVomitAnalysis(eventId)
            : await triggerStoolAnalysis(eventId);
          if (readErr) console.warn('[insertSimpleEvent] per-incident read trigger failed:', readErr);
          invoked = !readErr;
        }
      } catch (e) {
        console.error('[insertSimpleEvent] photo upload failed:', e);
      } finally {
        // Every exit settles — including the attErr early return and the catch.
        // A chain that died before its read settles FALSE, which is what lets a
        // waiting screen trigger its own rather than watch for a row nothing is
        // going to write.
        readClaim?.settle(invoked);
      }
    })();
  } catch (e) {
    // The attachment ROW insert failed — the event is already committed, so keep
    // the log and drop the photo rather than surface a false "log failed".
    console.error('[insertSimpleEvent] attachment row insert failed (event still saved):', e);
  }
}
