// The record's edits to a look — words, note, and the day key when the point moves
// (CUL-869 / N-3).
//
// Same harness as lib/looks.test.ts and for the same reason: a real node:sqlite
// database built from the production DDL constant, so the UPDATE under test has to
// match the schema it ships beside. The claims worth proving here are all about
// WHEN a write happens, not what it says — a no-op save must leave `updated_at`
// alone (C-23: moving it is what re-queues the row), and a "Change time" across
// local midnight must move `local_day` and the answered-day count with it (C-29).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

jest.mock('./sync', () => ({
  syncPendingEvents: async () => {},
  syncPendingLooks: async () => {},
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

let mockDb: InstanceType<typeof DatabaseSync>;

jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params: unknown[] = []) => {
      mockDb.prepare(sql).run(...(params as never[]));
    },
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      mockDb.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockDb.prepare(sql).get(...(params as never[])) ?? null,
    withTransactionAsync: async (cb: () => Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await cb();
        mockDb.exec('COMMIT');
      } catch (e) {
        mockDb.exec('ROLLBACK');
        throw e;
      }
    },
  }),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import {
  insertLook,
  getLookForEvent,
  updateLookForEdit,
  updateLookNote,
  localDayForLook,
  loadLookDays,
  answeredDaySet,
} from './looks';

const PET = 'pet-1';

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('PRAGMA foreign_keys = ON');
  mockDb.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockDb.exec(sql); } catch { /* a column this schema does not have */ }
  });
});

const row = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): T =>
  mockDb.prepare(sql).get(...(params as never[])) as T;

async function seedLook(over: { words?: string[]; occurredAt?: Date; timeZone?: string } = {}) {
  return insertLook({
    petId: PET,
    species: 'dog',
    outcome: 'observed',
    words: over.words ?? ['subdued', 'walk_refused'],
    occurredAt: over.occurredAt ?? new Date('2026-03-15T09:58:00.000Z'),
    occurredAtSource: 'now',
    timeZone: over.timeZone,
  });
}

/** The child's sync state, which is what every "did this re-queue?" claim is about. */
function syncState(eventId: string) {
  return row<{ synced: number; updated_at: string }>(
    'SELECT synced, updated_at FROM looks WHERE event_id = ?', [eventId],
  );
}

/** Mark the child pushed and BACKDATE it, so a later re-queue is observable as a
 *  real transition on both columns.
 *
 *  The backdate is not decoration. `updateLookForEdit` stamps `new Date()` and the
 *  insert did too, so on a fast machine the two ISO strings can be equal to the
 *  millisecond and a strict `>` comparison flakes — which is exactly what happened
 *  the first time this suite ran on a warm cache. Pinning the "before" to a known
 *  past instant makes "did `updated_at` move?" a deterministic question. */
function markPushed(eventId: string) {
  mockDb.prepare('UPDATE looks SET synced = 1, updated_at = ? WHERE event_id = ?')
    .run('2026-01-01T00:00:00.000Z', eventId);
}

describe('getLookForEvent', () => {
  it('reads the stored row, including the pet it belongs to', async () => {
    const { eventId, lookId, localDay } = await seedLook();
    expect(await getLookForEvent(eventId)).toEqual({
      id: lookId,
      petId: PET,
      outcome: 'observed',
      localDay,
      words: ['subdued', 'walk_refused'],
      notes: null,
    });
  });

  it('is null when the child has not reached this device', async () => {
    // A real state, not an error: the parent pushes first and the child's drain gates
    // on it, so a device can hold the event before its look. Callers render the bare
    // act rather than inventing an outcome.
    mockDb.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, synced)
       VALUES ('orphan', ?, 'check_in', '2026-03-15T09:58:00.000Z',
               '2026-03-15T09:58:00.000Z', '2026-03-15T09:58:00.000Z', 1)`,
    ).run(PET);
    expect(await getLookForEvent('orphan')).toBeNull();
  });
});

describe('updateLookForEdit — the no-op gate (C-23)', () => {
  it('writes nothing and re-queues nothing when the save changed nothing', async () => {
    const { eventId } = await seedLook();
    markPushed(eventId);
    const before = syncState(eventId);

    const wrote = await updateLookForEdit(eventId, {
      words: ['subdued', 'walk_refused'],
      notes: null,
    });

    expect(wrote).toBe(false);
    // `updated_at` is the queue's `pendingSince` column, so moving it IS the
    // re-queue. A peek-and-save that moved it would push an identical row on every
    // visit to the editor — and on a shared account would win a last-write-wins race
    // against a caregiver's real edit with a copy of the value they just replaced.
    expect(syncState(eventId)).toEqual(before);
  });

  it('treats a RE-ORDER of the same words as no change', async () => {
    const { eventId } = await seedLook({ words: ['subdued', 'walk_refused'] });
    markPushed(eventId);
    expect(await updateLookForEdit(eventId, { words: ['walk_refused', 'subdued'] })).toBe(false);
    expect(syncState(eventId).synced).toBe(1);
  });

  it('re-queues when a word is actually added', async () => {
    const { eventId } = await seedLook();
    markPushed(eventId);
    const before = syncState(eventId);

    expect(await updateLookForEdit(eventId, { words: ['subdued', 'walk_refused', 'lip_licking'] })).toBe(true);
    const after = syncState(eventId);
    expect(after.synced).toBe(0);
    expect(after.updated_at > before.updated_at).toBe(true);
    expect((await getLookForEvent(eventId))?.words).toEqual(['subdued', 'walk_refused', 'lip_licking']);
  });

  it('de-duplicates on the way in, as the insert does', async () => {
    const { eventId } = await seedLook({ words: ['subdued'] });
    await updateLookForEdit(eventId, { words: ['subdued', 'lip_licking', 'lip_licking'] });
    expect((await getLookForEvent(eventId))?.words).toEqual(['subdued', 'lip_licking']);
  });

  it('is a no-op on an event with no child, and says so', async () => {
    expect(await updateLookForEdit('no-such-event', { notes: 'x' })).toBe(false);
  });

  it('an omitted field is left alone — silence is not a write', async () => {
    const { eventId } = await seedLook();
    await updateLookNote(eventId, 'he hung back at the corner');
    // Now edit only the words. The note must survive.
    await updateLookForEdit(eventId, { words: ['subdued'] });
    const stored = await getLookForEvent(eventId);
    expect(stored?.notes).toBe('he hung back at the corner');
    expect(stored?.words).toEqual(['subdued']);
  });
});

describe('updateLookNote — the note, and only ever on the child', () => {
  it('writes it, trims it, and never leaves an empty string', async () => {
    const { eventId } = await seedLook();
    await updateLookNote(eventId, '  he hung back at the corner  ');
    expect((await getLookForEvent(eventId))?.notes).toBe('he hung back at the corner');

    // '' would wedge the row's push permanently — migration 064's CHECK refuses it.
    await updateLookNote(eventId, '   ');
    expect((await getLookForEvent(eventId))?.notes).toBeNull();
  });

  it('never touches the PARENT’s notes column (T-22)', async () => {
    const { eventId } = await seedLook();
    await updateLookNote(eventId, 'she was under the bed all afternoon');
    // Ask's recall fetch selects events.notes with NO type filter, so a note that
    // landed here would reach a model before D10 is ruled.
    expect(row<{ notes: string | null }>('SELECT notes FROM events WHERE id = ?', [eventId]).notes)
      .toBeNull();
  });

  it('removing a note re-queues the row, so the removal actually reaches the server', async () => {
    const { eventId } = await seedLook();
    await updateLookNote(eventId, 'something');
    markPushed(eventId);

    expect(await updateLookNote(eventId, null)).toBe(true);
    expect(syncState(eventId).synced).toBe(0);
  });
});

describe('"Change time" across local midnight moves the day with the row (C-29)', () => {
  // Timezone-honest: the boundary is LOCAL midnight, so the fixture names its zone
  // rather than trusting the runner's. Both zones below cross midnight on the SAME
  // five-minute move, which is what makes the pair a test of the rule and not of one
  // offset. (CI runs this suite at UTC+14 / +12:45 / −10.)
  const BEFORE = new Date('2026-03-15T09:58:00.000Z');
  const AFTER = new Date('2026-03-15T10:03:00.000Z');

  it.each([
    ['Pacific/Kiritimati', '2026-03-15', '2026-03-16'], // UTC+14 — 23:58 → 00:03
    ['Pacific/Honolulu', '2026-03-14', '2026-03-15'],   // UTC−10 — 23:58 → 00:03
  ])('%s: %s → %s', async (zone, dayBefore, dayAfter) => {
    const { eventId, localDay } = await seedLook({ occurredAt: BEFORE, timeZone: zone });
    expect(localDay).toBe(dayBefore);

    // What the editor does on a save whose point actually moved.
    const wrote = await updateLookForEdit(eventId, { localDay: localDayForLook(AFTER, zone) });
    expect(wrote).toBe(true);
    expect((await getLookForEvent(eventId))?.localDay).toBe(dayAfter);

    // …and the ANSWERED DAY moves with it. This is the half that matters: every
    // count this feature prints is keyed on the stored `local_day` (T-19), so a day
    // key that did not follow its row would leave the coverage footer counting a day
    // the record no longer places anything on.
    const days = answeredDaySet(await loadLookDays(PET));
    expect([...days]).toEqual([dayAfter]);
    expect(days.has(dayBefore)).toBe(false);
  });

  it('a point that moves WITHIN the local day leaves the key and the row alone', async () => {
    const zone = 'Pacific/Kiritimati';
    const { eventId } = await seedLook({ occurredAt: BEFORE, timeZone: zone });
    markPushed(eventId);
    const before = syncState(eventId);

    // 09:58Z → 09:20Z is 23:58 → 23:20 local: a real correction, same day.
    const sameDay = localDayForLook(new Date('2026-03-15T09:20:00.000Z'), zone);
    expect(await updateLookForEdit(eventId, { localDay: sameDay })).toBe(false);
    expect(syncState(eventId)).toEqual(before);
  });

  it('an Undone look leaves the answered day even though its child row survives', async () => {
    // `looks` has no deleted_at of its own, so this is the join doing its job — the
    // one place a reversed look could otherwise keep voting in a denominator.
    const { eventId, localDay } = await seedLook();
    expect([...answeredDaySet(await loadLookDays(PET))]).toEqual([localDay]);

    mockDb.prepare('UPDATE events SET deleted_at = ? WHERE id = ?')
      .run('2026-03-16T00:00:00.000Z', eventId);

    expect(await getLookForEvent(eventId)).not.toBeNull(); // the child is still there
    expect([...answeredDaySet(await loadLookDays(PET))]).toEqual([]);
  });
});
