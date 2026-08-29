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
// ── THE FAIL-SAFE IS UNTOUCHED ───────────────────────────────────────────────
// B-156 G1 stands: an unanswered medication card still lands `unconfirmed`,
// never `given`. Undo adds a REVERSAL, never a new path to an affirmative —
// there is no adherence write anywhere in this module, and removing a dose can
// only ever reduce what the record claims.

import { softDeleteEvent } from './db';
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
  syncPendingEvents().catch(console.error);
}
