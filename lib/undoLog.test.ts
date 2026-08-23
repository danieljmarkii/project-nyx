// CUL-612 — what Undo actually writes. The store's contract around the reversal
// (the latch, the staleness check, the removal dwell) is momentStore.test.ts's
// subject; this suite is about the write itself and the two things it must NOT do.

jest.mock('./db', () => ({ softDeleteEvent: jest.fn(async () => {}) }));
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(async () => {}) }));

import { softDeleteEvent } from './db';
import { syncPendingEvents } from './sync';
import { reverseLoggedEvent } from './undoLog';

describe('reverseLoggedEvent', () => {
  beforeEach(() => {
    (softDeleteEvent as jest.Mock).mockClear().mockImplementation(async () => {});
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
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
      "import { softDeleteEvent } from './db';\nimport { syncPendingEvents } from './sync';",
    );
    expect(body()).not.toMatch(/adherence|updateEvent|updateMealIntake/);
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
});
