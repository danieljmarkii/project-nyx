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
// RE-ARMING the shared debounce rather than minting a separate invalidation is
// what also closes the race CUL-612 made routine. The completion card's dwell and
// `REGEN_DEBOUNCE_MS` are both 5000ms by coincidence, so an Undo at t≈4.8s used to
// land beside its own log's regen at t=5.0s — the removed row still on the server,
// the regen computing over it, and nothing scheduled to run again. Re-arming
// CANCELS that pending timer and re-schedules 5s after the reversal, so the only
// regen that runs is the one over the corrected record. It collapses in the other
// direction too: clearing several rows out of History in one sitting is one regen,
// not one per row.
//
// ORDERING. `regenerateSignal` awaits `syncPendingEvents()` before it invokes the
// function, so the tombstone is pushed before detection re-reads the server. Not an
// absolute guarantee — CUL-622's wait ceiling lets a pathologically stalled queue
// run unserialized — but it is the same ordering every write path already relies on,
// not a weaker one. Offline it degrades the way the write path does: the invoke
// fails, the previous cached signal stands, and the next successful regen corrects
// it. Detection lives in Supabase, so there is no on-device recompute to fall back
// to, and blanking the cache locally would trade a stale signal for a false empty
// one — which on this surface is the worse direction.
//
// ── THE FAIL-SAFE IS UNTOUCHED ───────────────────────────────────────────────
// B-156 G1 stands: an unanswered medication card still lands `unconfirmed`,
// never `given`. Undo adds a REVERSAL, never a new path to an affirmative —
// there is no adherence write anywhere in this module, and removing a dose can
// only ever reduce what the record claims.

import { getEventPetId, softDeleteEvent } from './db';
import { triggerSignalRegenDebounced } from './signal';
import { syncPendingEvents } from './sync';
import { reconcileWeightSnapshotAfterDelete } from './weight';

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
 */
export async function reverseLoggedEvent(
  eventId: string,
  opts?: { restoreWeightSnapshotToKg: number | null },
): Promise<void> {
  await softDeleteEvent(eventId);
  // CUL-641 — unconditional: the helper decides for itself whether this event was
  // a weigh-in. Awaited, but only its local half is (the server write inside is
  // fired and not waited on), so a reversal still resolves at local-write speed.
  await reconcileWeightSnapshotAfterDelete(
    eventId,
    opts ? { restoreToKg: opts.restoreWeightSnapshotToKg } : undefined,
  );
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
}
