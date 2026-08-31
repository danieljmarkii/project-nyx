// CUL-612 — what a reversal actually writes. The store's contract around it (the
// latch, the staleness check, the removal dwell) is momentStore.test.ts's subject;
// this suite is about the write itself and the things it must NOT do.
//
// CUL-641 widened the subject: this is now the shared reversal behind Undo AND both
// Remove surfaces, so what it settles it settles for all three.
//
// CUL-642 widened it again: the reversal now also re-arms the Signal regen, so what
// this suite pins includes the cache following the record. The RACE that re-arming
// closes (an Undo at t=4.8s beside its own log's regen at t=5.0s) is not testable
// here — it is a property of two real modules composed — and lives in
// lib/signalRegenRace.test.ts against the real debounce.

jest.mock('./db', () => ({
  softDeleteEvent: jest.fn(async () => {}),
  getEventPetId: jest.fn(async () => 'pet-1'),
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(async () => {}) }));
jest.mock('./weight', () => ({ reconcileWeightSnapshotAfterDelete: jest.fn(async () => null) }));

import { getEventPetId, softDeleteEvent } from './db';
import { triggerSignalRegenDebounced } from './signal';
import { syncPendingEvents } from './sync';
import { reconcileWeightSnapshotAfterDelete } from './weight';
import { reverseLoggedEvent } from './undoLog';

describe('reverseLoggedEvent', () => {
  beforeEach(() => {
    (softDeleteEvent as jest.Mock).mockClear().mockImplementation(async () => {});
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
    (reconcileWeightSnapshotAfterDelete as jest.Mock).mockClear().mockResolvedValue(null);
    (getEventPetId as jest.Mock).mockClear().mockResolvedValue('pet-1');
    (triggerSignalRegenDebounced as jest.Mock).mockClear();
  });

  it('soft-deletes the event and queues the tombstone', async () => {
    await reverseLoggedEvent('ev-1');
    expect(softDeleteEvent).toHaveBeenCalledWith('ev-1');
    expect(syncPendingEvents).toHaveBeenCalled();
  });

  // The two negative guarantees, checked against the module's EXECUTABLE body
  // rather than its prose. A regex over a file that documents its own rules would
  // pass on the comments alone, so both comment forms are stripped first.
  function body(): string {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'undoLog.ts'), 'utf8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }

  it('is a SOFT delete — the house rule, and the only reason children ride along', () => {
    // The guard that matters is negative: nothing here may reach for a hard delete,
    // and no child table may be touched by name. meals / weight_checks /
    // medication_administrations / event_attachments all disappear through the
    // parent's deleted_at, and every read path filters on it. A second delete path
    // that enumerated children would be a second definition of "gone" — and only
    // one of the two could stay right.
    expect(body()).not.toMatch(/\bDELETE\b/);
    expect(body()).not.toMatch(/medication_administrations|event_attachments|weight_checks|\bmeals\b/);
  });

  it('does not write an adherence — Undo is a reversal, never a path to an affirmative', () => {
    // B-156 G1: an unanswered dose card lands `unconfirmed`, never `given`. Undo
    // must be able to REMOVE a dose and nothing else; the moment this module can
    // also write adherence, "reversal only" stops being true by construction. The
    // import list is the real gate — a write needs something imported to do it.
    const imports = body().match(/^import[\s\S]*?;$/gm) ?? [];
    expect(imports.join('\n')).toBe(
      "import { getEventPetId, softDeleteEvent } from './db';\n" +
      "import { triggerSignalRegenDebounced } from './signal';\n" +
      "import { syncPendingEvents } from './sync';\n" +
      "import { reconcileWeightSnapshotAfterDelete } from './weight';",
    );
    expect(body()).not.toMatch(/adherence|updateEvent|updateMealIntake/);
  });

  it('the side-effects it settles re-point a snapshot or refresh a cache, never write a record', () => {
    // CUL-641 added the third import and CUL-642 the fourth (plus a second name on
    // the first), so the gate above has widened twice — and a widened gate is worth
    // exactly what the thing let through is. This pins that:
    //
    //   · the reconcile touches the DENORMALIZED pets.weight_kg convenience and
    //     nothing in `events` or any child table;
    //   · `getEventPetId` is a READ — it answers whose record this was and cannot
    //     write anywhere;
    //   · `triggerSignalRegenDebounced` schedules a recompute of a DERIVED cache
    //     (`ai_signals`) over rows that already exist. It adds nothing to the record
    //     and can only ever make the cache agree with it.
    //
    // So "reversal only" survives both additions, and this states the shape a FIFTH
    // import would have to have to belong here.
    expect(body()).not.toMatch(/insert|update[A-Z]|\bDELETE\b/);
    expect(body()).toMatch(/reconcileWeightSnapshotAfterDelete/);
    expect(body()).toMatch(/triggerSignalRegenDebounced/);
  });

  it('propagates a failed local write so the caller can keep the card honest', async () => {
    (softDeleteEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(reverseLoggedEvent('ev-2')).rejects.toThrow('disk full');
    // And never claims a reversal it did not perform by pushing anyway.
    expect(syncPendingEvents).not.toHaveBeenCalled();
  });

  it('resolves without waiting on the flush — an offline undo reverses immediately', async () => {
    // The tombstone is already durable in SQLite with synced = 0; the push is a
    // best-effort kick. Awaiting it would make Undo feel broken on a plane.
    let settled = false;
    (syncPendingEvents as jest.Mock).mockImplementation(() => new Promise(() => {}));
    await reverseLoggedEvent('ev-3').then(() => { settled = true; });
    expect(settled).toBe(true);
  });

  it('swallows a rejected flush — a failed push must not surface as a failed undo', async () => {
    (syncPendingEvents as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(reverseLoggedEvent('ev-4')).resolves.toBeUndefined();
  });

  // ── CUL-641: the weight-snapshot side-effect ───────────────────────────────
  describe('the weight snapshot (CUL-641)', () => {
    it('reconciles unconditionally — the helper, not this module, knows what was removed', async () => {
      // Called for EVERY event, not just weight checks. That is the whole design: a
      // delete site never has to know what it just removed, which is the ignorance
      // that let three delete paths each quietly skip this.
      await reverseLoggedEvent('ev-1');
      expect(reconcileWeightSnapshotAfterDelete).toHaveBeenCalledWith('ev-1', undefined);
    });

    it('reconciles AFTER the soft delete, never before', async () => {
      // Order is correctness, not tidiness: the helper's latest-reading read is
      // soft-delete filtered, so running it first would re-select the very row being
      // removed and reconcile the snapshot straight back onto it.
      const order: string[] = [];
      (softDeleteEvent as jest.Mock).mockImplementation(async () => { order.push('delete'); });
      (reconcileWeightSnapshotAfterDelete as jest.Mock).mockImplementation(async () => {
        order.push('reconcile');
        return null;
      });
      await reverseLoggedEvent('ev-1');
      expect(order).toEqual(['delete', 'reconcile']);
    });

    it('passes a caller-supplied restore value through', async () => {
      await reverseLoggedEvent('ev-1', { restoreWeightSnapshotToKg: 5.6 });
      expect(reconcileWeightSnapshotAfterDelete).toHaveBeenCalledWith('ev-1', { restoreToKg: 5.6 });
    });

    it('distinguishes a restore-to-null from no restore value at all', async () => {
      // The distinction the whole feature turns on. `null` is an INSTRUCTION — the pet
      // genuinely had no weight on file before this reading, so put it back to none.
      // Absent means "nobody knows", and the helper must then leave the snapshot alone
      // rather than destroy an onboarding weight. Collapsing the two would make an
      // ordinary History Remove wipe a profile weight it has no business touching.
      await reverseLoggedEvent('ev-1', { restoreWeightSnapshotToKg: null });
      expect(reconcileWeightSnapshotAfterDelete).toHaveBeenCalledWith('ev-1', { restoreToKg: null });

      (reconcileWeightSnapshotAfterDelete as jest.Mock).mockClear();
      await reverseLoggedEvent('ev-2');
      expect(reconcileWeightSnapshotAfterDelete).toHaveBeenCalledWith('ev-2', undefined);
    });

    it('does not reconcile when the local delete failed', async () => {
      // Nothing was removed, so nothing is owed a reconcile — and re-pointing the
      // snapshot here would move a number on the strength of a write that did not land.
      (softDeleteEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
      await expect(reverseLoggedEvent('ev-3')).rejects.toThrow('disk full');
      expect(reconcileWeightSnapshotAfterDelete).not.toHaveBeenCalled();
    });
  });

  // ── CUL-642: the Signal-cache side-effect ──────────────────────────────────
  // The write paths all kick a debounced regen and no delete path did, so a cached
  // `ai_signals` finding computed over a removed event stood until the next log or
  // the 24h TTL. Same shape as the weight snapshot above: a side-effect added to
  // the write path with no counterpart on the reversal.
  describe('the Signal cache (CUL-642)', () => {
    it('re-arms the regen for the RECORD\'s pet, not for whoever is selected', async () => {
      // The lookup answers from the row. A record screen is reached by id for ANY
      // pet (the day-summary spine pushes /event/[id] for every pet's rows), so
      // "the active pet" is a different question with a confidently-wrong answer —
      // it would refresh the healthy cat's Signal and leave the sick one's stale.
      (getEventPetId as jest.Mock).mockResolvedValue('pet-b');
      await reverseLoggedEvent('ev-1');
      expect(getEventPetId).toHaveBeenCalledWith('ev-1');
      expect(triggerSignalRegenDebounced).toHaveBeenCalledTimes(1);
      expect(triggerSignalRegenDebounced).toHaveBeenCalledWith('pet-b');
    });

    it('re-arms AFTER the soft delete, never before', async () => {
      // Order is the whole fix. Re-arming BEFORE the tombstone exists schedules a
      // regen whose own `syncPendingEvents` has nothing to push, so detection
      // recomputes over the row still on the server — which is precisely the stale
      // signal this issue is about, reproduced by its own fix.
      const order: string[] = [];
      (softDeleteEvent as jest.Mock).mockImplementation(async () => { order.push('delete'); });
      (triggerSignalRegenDebounced as jest.Mock).mockImplementation(() => { order.push('regen'); });
      await reverseLoggedEvent('ev-1');
      expect(order).toEqual(['delete', 'regen']);
    });

    it('does not re-arm when the local delete failed', async () => {
      // Nothing was removed, so the cache is not out of date — and a regen here
      // would spend an Edge Function call to recompute the same answer.
      (softDeleteEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
      await expect(reverseLoggedEvent('ev-5')).rejects.toThrow('disk full');
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
    });

    it('does not guess a pet when the row cannot be resolved', async () => {
      // An UNKNOWN pet is not a pet. Falling through to the active one here is the
      // CUL-574 class: it would silently refresh a cache that was never stale while
      // leaving the one that is.
      (getEventPetId as jest.Mock).mockResolvedValue(null);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(reverseLoggedEvent('ev-6')).resolves.toBeUndefined();
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
      // Said out loud: a skipped side-effect and a no-op look identical otherwise.
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('a failed lookup does not fail the reversal', async () => {
      // The removal is the owner's; the cache refresh is bookkeeping. A card that
      // reported "could not remove" over a row that IS removed is the one
      // unrecoverable lie this surface can tell (momentStore's undo catch).
      (getEventPetId as jest.Mock).mockRejectedValueOnce(new Error('db gone'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(reverseLoggedEvent('ev-7')).resolves.toBeUndefined();
      expect(softDeleteEvent).toHaveBeenCalledWith('ev-7');
      expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
