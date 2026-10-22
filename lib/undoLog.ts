// The one reversal behind EVERY soft delete an owner can perform — the completion
// card's Undo (CUL-612, `docs/nyx-app-polish-requirements.md` §5), History's
// "Remove", and the event detail screen's "Remove".
//
// It started as Undo's alone, and the header below already argued that Undo and
// Remove are the SAME reversal reached from different surfaces. CUL-641 is what
// happened while that stayed an argument rather than a call: the weight-snapshot
// side-effect was added to the write path and to none of the three delete paths,
// and the three then diverged in a way nobody could see from any one of them. So
// the shared reversal is now literally shared, and `softDeleteEvent` is the raw
// primitive underneath it rather than something a screen reaches for directly
// (`guards/reversePath.test.ts` fails the build on a screen that does).
//
// ── WHY THIS IS ONE CALL ─────────────────────────────────────────────────────
// Undo is a SOFT DELETE of the just-written event and nothing else, because the
// house rule (`deleted_at`, never `DELETE`) already makes every child of that
// event disappear with it:
//
//   · meals / weight_checks / medication_administrations are 1:1 children keyed
//     `event_id … REFERENCES events(id)` and carry NO deleted_at of their own —
//     a dose's deletedness is read through its parent (lib/medications.ts:39).
//   · event_attachments hang off the event and are only ever reached through it.
//   · every read path — getTimeline, the Today feed, the trend queries, the
//     detection engine, generate-report — filters `events.deleted_at IS NULL`.
//
// So this is the SAME reversal History's "Remove" and the detail screen's
// "Remove" already perform, reached from a different surface. It is deliberately
// not a second delete path with its own semantics: a divergence here would mean
// a row removed from the card and a row removed from History were different
// kinds of gone, and only one of them would be right.
//
// ── WHAT SURVIVES, ON PURPOSE ────────────────────────────────────────────────
// A PAIRED DOSE keeps its own row. If the owner used the meal card's "+ Add a
// med given with this", the dose is its own event with its own
// `paired_event_id`, and undoing the MEAL does not touch it — the timeline join
// routes the link through `events pe … AND pe.deleted_at IS NULL`, so the dose
// simply renders standalone (B-156 B4's cross-link semantics, unchanged). That
// is the right outcome: the owner is reversing "I logged the wrong food", not
// "no medication was given." It is also why the card's removal line makes no
// claim about anything beyond the row it removed.
//
// ── THE SIGNAL CACHE IS RE-ARMED, NOT LEFT TO EXPIRE ─────────────────────────
// CUL-642. The Home Signal is not recomputed on device — `generate-signal` runs
// detection in Supabase and writes a cached `ai_signals` row with a 24h TTL. The
// write paths (`insertMeal`, `insertSimpleEvent`, the capture-inbox ingest) all
// kick a debounced regen so the cache follows the record; not one delete path did,
// so a finding computed over an event the owner has since removed simply stood
// until the next log or the TTL. Exactly the CUL-641 shape again — a side-effect
// on the write path with no counterpart on the reversal — which is why it goes
// HERE, at the one shared reversal, rather than on the surface that noticed it.
//
// RE-ARMING the shared debounce rather than minting a separate invalidation is what
// also addresses the race CUL-612 made routine. The completion card's dwell and
// `REGEN_DEBOUNCE_MS` are both 5000ms by coincidence, so an Undo at t≈4.8s lands
// beside its own log's regen at t=5.0s — the removed row still on the server, the
// regen computing over it, and nothing scheduled to run again. Re-arming cancels
// that pending timer and re-schedules 5s after the reversal. It collapses in the
// other direction too: clearing several rows out of History in one sitting is one
// regen, not one per row.
//
// RE-ARMING ALONE IS NOT ENOUGH, and the reason is worth stating because the first
// draft of this comment claimed it was. `clearTimeout` can only cancel a timer that
// has not FIRED. An Undo at t=5.001s — or any History/detail Remove, which is
// untethered from the card's dwell entirely — leaves the log's regen already in
// flight, and the re-arm then schedules a SECOND one beside it rather than replacing
// it. `generate-signal` writes the cache with a plain delete-then-insert and no
// version guard, so whichever invocation reaches the server last wins; if that is the
// stale one, the removal has re-cached the very finding it was meant to clear and
// renewed its 24h TTL. So the ordering is enforced where it can actually be enforced,
// in `lib/signal.ts`'s per-pet regen serializer (`serializeRegen`) — the last regen to
// settle is made the freshest one. This header names only the debounce; that module
// owns the rest.
//
// ORDERING WITHIN ONE REGEN. `regenerateSignal` awaits `syncPendingEvents()` before
// it invokes the function, so the tombstone push is ATTEMPTED first — which is a
// weaker claim than "the deletion reached the server", and deliberately written as
// the weaker one. The push's failure is swallowed there and the invoke proceeds
// regardless, so a tombstone that cannot be pushed (an offline device is safe, since
// the invoke fails too; a QUARANTINED row, `sync_error` set, is the live case) lets
// the regen recompute over a server that still holds the event and renew the TTL over
// it. That swallow is shared with every write path and predates this change; narrowing
// it here would let one unrelated queue rejection block every pet's refresh, so it is
// tracked rather than patched in passing — CUL-772. Offline it degrades the way the
// write path does: the invoke fails, the previous cached signal stands, and the next
// successful regen corrects it. Detection lives in Supabase, so there is no on-device
// recompute to fall back to, and blanking the cache locally would trade a stale signal
// for a false empty one — which on this surface is the worse direction.
//
// ── THE FAIL-SAFE IS UNTOUCHED ───────────────────────────────────────────────
// B-156 G1 stands: an unanswered medication card still lands `unconfirmed`,
// never `given`. Undo adds a REVERSAL, never a new path to an affirmative —
// there is no adherence write anywhere in this module, and removing a dose can
// only ever reduce what the record claims.

import { useRecordChangeStore } from '../store/recordChangeStore';
import { useSyncStore } from '../store/syncStore';
import { getEventPetId, softDeleteEvent } from './db';
import { noteRemoval } from './removalNotice';
import { triggerSignalRegenDebounced } from './signal';
import { syncPendingAttachments, syncPendingEvents } from './sync';
import { queueRemovedLogPhotosForPurge } from './attachments';
import { writeOwingFloorCheck } from './incidentFloorQueue';
import { reconcileWeightSnapshotAfterDelete } from './weight';
import { forgetFlagsSpentByEvent } from './trialContaminant';

/**
 * Soft-delete `eventId`, settle the side-effects that removal implies, and queue
 * the tombstone.
 *
 * Throws if the LOCAL write fails — the caller is expected to keep its surface as
 * it was and tell the owner, rather than showing a reversal that did not happen.
 * The sync flush is fire-and-forget by design: the tombstone is already durable
 * in SQLite with `synced = 0`, so an offline reversal takes effect immediately on
 * device and pushes on the next foreground/reconnect, exactly like any other edit.
 * It never touches sync ORDERING — it queues like the edit it is.
 *
 * `restoreWeightSnapshotToKg` is for the ONE caller that knows something this
 * function cannot re-derive: the completion card, reversing a weigh-in it just
 * watched being written, knows the `pets.weight_kg` value that write displaced.
 * With no reading left to fall back on, that is the only correct answer — see
 * lib/weight.ts's delete-side header for why the alternative (nulling) loses data.
 * Omitted by every other caller, and omission is not the same as `null`.
 *
 * `purgePhotos` is the completion card's too (CUL-639, PM ruling (a)): an undone
 * log's photo is deleted from the server even if its upload already landed. Every
 * other removal leaves an uploaded photo where it is, so a later restore (CUL-707)
 * can bring it back; a photo still uploading is deleted on every path, by the
 * upload itself and the queue (lib/attachments.ts).
 */
export async function reverseLoggedEvent(
  eventId: string,
  opts?: { restoreWeightSnapshotToKg?: number | null; purgePhotos?: boolean },
): Promise<void> {
  // Engines v3 PR-28b (CUL-1436, §8.3): deleting a vomit, lethargy or meal log re-checks
  // the reads around it, and the marker shares the soft delete's transaction. The server's
  // re-floor is raise-only, so the delete lowers nothing it showed (§8.8).
  try {
    await writeOwingFloorCheck(eventId, () => softDeleteEvent(eventId));
  } catch (e) {
    // CUL-1947 (adversarial pass 2) — the soft delete can land and its floor marker then
    // throw, skipping the regen trigger below that re-reads Home's gap warning. Re-read
    // anyway before the failure propagates: after a delete that never landed it is only
    // an extra read of unchanged rows.
    useSyncStore.getState().bumpRecordTick();
    throw e;
  }
  // HV-10 (CUL-1167) — the list the owner returns to folds this row away rather than
  // letting it vanish (History v2 §4). Noted only once the local write has landed: a
  // reversal that failed must never fold a row that is still in the record.
  noteRemoval(eventId);
  // CUL-1665 — tell the surfaces that read a derived list on their own schedule that
  // a row left the record (the FAB's recent foods: a past-day meal is in no list
  // `todayEvents` drives). Same rule as the line above: only after the write landed.
  useRecordChangeStore.getState().notifyChanged();
  // CUL-2087 — give back every trial heads-up THIS feeding spent: it never happened, or
  // never happened as logged, so the food's real feeding later must still be warned about.
  // Here, not on the card, so History's and the record screen's Remove give it back too
  // (the card's own Undo also forgets its shown flag, which covers a spend made before the
  // ledger recorded which meal spent it). Any event reaches this; one that spent nothing
  // owns no entry. Best-effort, after the write landed, like the reconcile below.
  try {
    await forgetFlagsSpentByEvent(eventId, []);
  } catch (e) {
    console.warn('[undo] trial heads-up give-back failed:', e);
  }
  // CUL-641 — unconditional: the helper decides for itself whether this event was
  // a weigh-in. Awaited, but only its local half is (the server write inside is
  // fired and not waited on), so a reversal still resolves at local-write speed.
  await reconcileWeightSnapshotAfterDelete(
    eventId,
    opts?.restoreWeightSnapshotToKg !== undefined
      ? { restoreToKg: opts.restoreWeightSnapshotToKg }
      : undefined,
  );
  // CUL-639 — after the soft delete, never before: the queue purges an unsynced
  // photo only once its event reads as deleted. Best-effort, because the removal
  // has already happened and a reversal that threw now would tell the owner their
  // log is still there when it is not. A failure here leaves the uploaded photo
  // where an event-screen Remove would; it is said out loud, not swallowed.
  let photosQueued = false;
  if (opts?.purgePhotos) {
    try {
      await queueRemovedLogPhotosForPurge(eventId);
      photosQueued = true;
    } catch (e) {
      console.warn('[undo] could not queue the undone log\'s photo for deletion:', e);
    }
  }
  // CUL-642 — re-arm the Signal regen for THIS RECORD's pet (header above). Read
  // from the row, never from `activePet`: the day-summary spine and every deep link
  // push `/event/[id]` for any pet's rows, so the current selection is not an answer
  // to "whose event was this?" (CUL-574). Best-effort like the reconcile beside it —
  // a reversal must not fail on a cosmetic refresh — and the trigger itself is
  // fire-and-forget, so nothing here waits on a network call.
  try {
    const petId = await getEventPetId(eventId);
    if (petId) triggerSignalRegenDebounced(petId);
    else {
      // An UNRESOLVABLE pet, not a pet with nothing to refresh. Said out loud for the
      // same reason the weight reconcile says its own unevaluable case out loud: the
      // alternative is a missing side-effect that looks exactly like a no-op.
      console.warn('[undo] no local row for event %s — Signal regen not re-armed', eventId);
    }
  } catch (e) {
    console.warn('[undo] Signal regen re-arm failed:', e);
  }
  syncPendingEvents().catch(console.error);
  if (photosQueued) syncPendingAttachments().catch(console.error);
}
