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
import { deleteEventAttachmentLocal } from './db';

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
