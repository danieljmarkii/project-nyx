// The one place an event photo is detached — locally, in Storage, and remotely.
//
// B-105. Every "replace the photo" path in the app minted a fresh attachment id
// and INSERTed it, and nothing ever removed the row it replaced. Three things
// went wrong at once, and only the third is visible to the owner:
//
//   • the event ends up with ≥2 event_attachments rows (live: 3 events in
//     production already carry duplicates);
//   • the prior Storage object and the prior document-directory file are
//     orphaned — a detached clinical photo that no row names, which the
//     sign-out wipe walks local_uri to find and therefore cannot see;
//   • getEventAttachment reads `ORDER BY sort_order ASC LIMIT 1` with every
//     sort_order = 0, so which row wins is rowid-ambiguous — the replace can
//     appear not to have taken at all.
//
// The removal already existed, correct, in the event-detail "Remove photo"
// handler. It was simply never reached from the replace paths. Rather than
// write it a second time, it moved here so the detach has ONE implementation:
// two copies of a rule is how a rule starts disagreeing with itself.
//
// Note there is no soft delete here, and that is deliberate rather than an
// oversight of the events convention: `event_attachments` has no `deleted_at`
// column on either side (migration 003 / lib/localSchema.ts), and the shipped
// remove path has always been a hard delete. The soft-delete rule governs
// `events` — the clinical record — not the file pointer hanging off one.
import { supabase } from './supabase';
import { deleteEventAttachmentLocal, getDb } from './db';

export const EVENT_ATTACHMENT_BUCKET = 'nyx-event-attachments';

export interface DetachableAttachment {
  id: string;
  storage_path: string;
}

/**
 * Detach one attachment: local row + on-device file, then the Storage object and
 * the remote row.
 *
 * The LOCAL half is awaited and throws on failure — callers that show the owner
 * an optimistic empty state need to know to put the photo back. The REMOTE half
 * is deliberately best-effort and never throws: it is cleanup, it must work
 * offline, and a replace that failed because the network was down would be a
 * far worse bug than an orphan.
 *
 * The cost of that best-effort is one residual worth naming, because it is the
 * reason the read below had to be made deterministic rather than merely
 * de-duplicated: hydrateEventAttachments is insert-if-absent keyed on `id`, so a
 * remote row that survives a failed delete is re-inserted on the next pull. The
 * same window exists for an in-flight upload of the row being replaced, whose
 * `.then(upsert)` can land after this delete. Neither can be closed from the
 * client; both are harmless precisely because getEventAttachment now resolves
 * ties toward the newest row, so a resurrected predecessor never displaces the
 * photo that replaced it.
 */
export async function detachEventAttachment(att: DetachableAttachment): Promise<void> {
  // Local first, and awaited: this is the half that owns the bytes on this
  // device, and it is the half whose failure the owner must see.
  await deleteEventAttachmentLocal(att.id);

  // Storage before the row, so a crash in between leaves a row pointing at a
  // missing object (renders the empty state) rather than an object no row names
  // (invisible to the sign-out wipe). Orphaned bytes are the worse of the two.
  try {
    await supabase.storage.from(EVENT_ATTACHMENT_BUCKET).remove([att.storage_path]);
  } catch {
    // Offline, or the object was never uploaded (an attachment replaced before
    // its first sync). Nothing to report — see the best-effort note above.
  }
  try {
    await supabase.from('event_attachments').delete().eq('id', att.id);
  } catch {
    // Same.
  }
}

/**
 * Remove every attachment on an event except `keepId` — the replace step.
 *
 * Called AFTER the replacement row is inserted, never before. Deleting first
 * would open a window where a failed insert leaves the event with no photo at
 * all, turning a duplicate-row bug into actual data loss; inserting first leaves
 * a window with two rows, which the deterministic read already tolerates.
 *
 * It sweeps ALL prior rows rather than just the one the screen had loaded, so an
 * event that already accumulated duplicates under the old behaviour is repaired
 * the next time its photo is replaced.
 *
 * Never throws: the replacement is already safely stored by the time this runs,
 * so a failure here costs an orphan, not the owner's photo.
 */
export async function detachOtherEventAttachments(
  priors: DetachableAttachment[],
  keepId: string,
): Promise<void> {
  for (const prior of priors) {
    if (prior.id === keepId) continue;
    try {
      await detachEventAttachment(prior);
    } catch (e) {
      console.warn('[attachments] could not detach replaced photo', prior.id, e);
    }
  }
}

// ── A PHOTO WHOSE LOG WAS REMOVED (CUL-639) ──────────────────────────────────
// A photo's upload runs on its own after the log is saved, and the completion
// card's Undo (CUL-612) sits inside that upload's normal runtime. So "log a photo,
// undo at once" used to finish uploading AFTER the owner removed the log, and
// nothing ever deleted it: a health photo the owner was told was gone, kept on the
// server indefinitely. The PM's ruling (CUL-1825 via CUL-639, 2026-10-12, option
// (a)): such a photo is DELETED, not orphaned, in two cases and only these —
//
//   · the log was removed while its photo was still uploading or queued (any
//     removal surface): the upload notices and finishes the removal itself;
//   · the log was removed by the completion card's Undo, even if the upload had
//     already landed: the reversal re-queues the photo (`synced = 0`), and the
//     queue's purge below takes it off the server.
//
// A photo that reached the server long before its log was removed from the event
// screen is deliberately NOT deleted: CUL-707 (Recently deleted) may restore that
// log, and a restore should bring its photo back.
//
// The one predicate both cases share is "an UNSYNCED photo whose parent event is
// deleted", which is why Undo re-queues rather than writing a marker of its own:
// the queue already holds exactly the rows the server and this device disagree on.

type Db = ReturnType<typeof getDb>;

/**
 * Does this photo still belong on the server? False when its local row is gone
 * (removed or purged mid-upload) or its parent event has been removed.
 *
 * A read that THROWS answers true. False is what makes a caller delete the photo,
 * so it is only ever said when the removal is known: answering false on a
 * transient SQLite error would purge a live log's photo, a far worse failure than
 * one more step of an upload. Nothing is lost by it either, because the step that
 * decides is `markAttachmentSyncedIfLive`, one statement that reads the parent
 * itself and cannot be answered by a guess.
 */
export async function attachmentStillWanted(attachmentId: string): Promise<boolean> {
  try {
    const row = await getDb().getFirstAsync<{ deleted_at: string | null }>(
      `SELECT e.deleted_at AS deleted_at
         FROM event_attachments a JOIN events e ON e.id = a.event_id
        WHERE a.id = ?`,
      [attachmentId],
    );
    return row != null && row.deleted_at == null;
  } catch (e) {
    console.warn('[attachments] could not read whether photo is still wanted', attachmentId, e);
    return true;
  }
}

/**
 * Mark a pushed photo synced ONLY while its parent event is live, in one
 * statement. One statement is the point: a check in JS followed by a separate
 * UPDATE leaves an await between them in which an Undo can soft-delete the event
 * and re-queue the photo, and the UPDATE would then strand it at `synced = 1` on
 * the server for good. Returns whether the row was marked; false means the log
 * was removed (or the row purged) while the push was in flight.
 */
export async function markAttachmentSyncedIfLive(db: Db, attachmentId: string): Promise<boolean> {
  const res = await db.runAsync(
    `UPDATE event_attachments SET synced = 1, sync_attempts = 0, sync_error = NULL
      WHERE id = ?
        AND EXISTS (SELECT 1 FROM events e
                     WHERE e.id = event_attachments.event_id AND e.deleted_at IS NULL)`,
    [attachmentId],
  );
  return (res?.changes ?? 0) > 0;
}

/**
 * Finish removing a photo whose log was removed: the Storage object, then the
 * remote row, then (only once both have succeeded) the local row and file.
 *
 * The reverse of `detachEventAttachment`'s order on purpose. That one serves an
 * owner looking at the photo, so the local half goes first and the remote half is
 * best-effort. This one runs from the upload chain and the sync queue, where the
 * local row IS the retry: dropping it before the server confirms would turn an
 * offline moment into a permanent orphan, which is the bug this exists to close.
 * Never throws; returns whether the photo is fully gone.
 */
export async function purgeRemovedAttachment(att: DetachableAttachment): Promise<boolean> {
  try {
    const { error: objErr } = await supabase.storage.from(EVENT_ATTACHMENT_BUCKET).remove([att.storage_path]);
    if (objErr) {
      console.warn('[attachments] purge: Storage remove failed, will retry', att.id, objErr.message);
      return false;
    }
    const { error: rowErr } = await supabase.from('event_attachments').delete().eq('id', att.id);
    if (rowErr) {
      console.warn('[attachments] purge: remote row delete failed, will retry', att.id, rowErr.message);
      return false;
    }
    await deleteEventAttachmentLocal(att.id);
    return true;
  } catch (e) {
    console.warn('[attachments] purge failed, will retry', att.id, e);
    return false;
  }
}

/**
 * The completion card's Undo: put every photo on the removed log back in the
 * queue, so the queue's purge deletes it from the server whether or not its
 * upload had already landed. The caller has already soft-deleted the event.
 */
export async function queueRemovedLogPhotosForPurge(eventId: string): Promise<void> {
  await getDb().runAsync(
    'UPDATE event_attachments SET synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?',
    [eventId],
  );
}
