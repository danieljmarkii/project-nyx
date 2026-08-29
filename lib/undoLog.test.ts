// CUL-612 — what a reversal actually writes. The store's contract around it (the
// latch, the staleness check, the removal dwell) is momentStore.test.ts's subject;
// this suite is about the write itself and the things it must NOT do.
//
// CUL-641 widened the subject: this is now the shared reversal behind Undo AND both
// Remove surfaces, so what it settles it settles for all three.

jest.mock('./db', () => ({ softDeleteEvent: jest.fn(async () => {}) }));
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(async () => {}) }));
jest.mock('./weight', () => ({ reconcileWeightSnapshotAfterDelete: jest.fn(async () => null) }));

import { softDeleteEvent } from './db';
import { syncPendingEvents } from './sync';
import { reconcileWeightSnapshotAfterDelete } from './weight';
import { reverseLoggedEvent } from './undoLog';

describe('reverseLoggedEvent', () => {
  beforeEach(() => {
    (softDeleteEvent as jest.Mock).mockClear().mockImplementation(async () => {});
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
    (reconcileWeightSnapshotAfterDelete as jest.Mock).mockClear().mockResolvedValue(null);
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
      "import { softDeleteEvent } from './db';\n" +
      "import { syncPendingEvents } from './sync';\n" +
      "import { reconcileWeightSnapshotAfterDelete } from './weight';",
    );
    expect(body()).not.toMatch(/adherence|updateEvent|updateMealIntake/);
  });

  it('the one side-effect it settles can only re-point a snapshot, never write a record', () => {
    // CUL-641 added the third import, so the gate above had to widen — and a widened
    // gate is worth exactly what the thing let through is. This pins that: the
    // reconcile touches the DENORMALIZED pets.weight_kg convenience and nothing in
    // `events` or any child table, so "reversal only" survives the addition. It also
    // states the shape a FOURTH import would have to have to belong here.
    expect(body()).not.toMatch(/insert|update[A-Z]|\bDELETE\b/);
    expect(body()).toMatch(/reconcileWeightSnapshotAfterDelete/);
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
});
