// B-448 — the occurred_at_confidence write invariant.
//
// The claim being pinned: NO write path may leave a row asserting 'witnessed'
// unless something actually witnessed it. The reverse matters just as much — an
// edit that isn't about the time must not downgrade a stored 'estimated' or
// 'window' either. Both directions are the same defect: an event's time is
// re-described by code that was never told anything about the time.
//
// This is the class the vet report's confidence legend exists to prevent. A bare
// 'seen' in a column of tagged rows reads as MORE certain than an estimate, and
// migration 012 is explicit that NULL is "NOT a claim either way" — the report
// renders it 'unspecified' on purpose. The bug this suite locks out: updateEvent
// used to write the three B-010 columns on EVERY update, `?? null`, so a caller
// editing a note restated the confidence with whatever its form state happened
// to hold. app/edit-event.tsx's form state starts at 'saw', so opening a legacy
// row to fix a note promoted NULL → 'witnessed', silently, on a time nobody ever
// claimed to have seen. **149 live production rows** carry a NULL confidence
// today (220 including soft-deleted), so this was reachable, not theoretical.
//
// node:sqlite (Node >= 22) gives a real engine; a thin adapter wraps it in the
// async surface updateEvent declares, and the events DDL comes from the real
// BASE_SCHEMA_SQL plus the same ALTERs initDb applies — so the function under
// test is the real one, against the real column set (the cacheFlush.test.ts
// pattern).
//
// db.ts imports expo-sqlite / expo-file-system at module load; those native
// modules don't resolve under jest-expo's node runner, and updateEvent writes
// through the injected adapter rather than the real handle, so stubbing them to
// satisfy the import graph is sufficient.
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { updateEvent } from './db';
import { BASE_SCHEMA_SQL } from './localSchema';

type RawDb = InstanceType<typeof DatabaseSync>;

interface StoredEvent {
  occurred_at: string;
  notes: string | null;
  occurred_at_source: string;
  occurred_at_confidence: string | null;
  occurred_at_earliest: string | null;
  occurred_at_latest: string | null;
  synced: number;
  updated_at: string;
}

// updateEvent only ever calls runAsync; Pick<> keeps the injected surface to
// exactly that, so this adapter is the whole contract.
function adapter(db: RawDb) {
  return {
    async runAsync(sql: string, params: (string | number | null)[]) {
      return db.prepare(sql).run(...params) as never;
    },
  } as unknown as Parameters<typeof updateEvent>[2];
}

function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  // The B-010 columns arrive as ALTERs in initDb (they postdate the base
  // schema), so apply them here the same way rather than forking the DDL.
  db.exec(`ALTER TABLE events ADD COLUMN occurred_at_source TEXT NOT NULL DEFAULT 'manual'`);
  db.exec(`ALTER TABLE events ADD COLUMN occurred_at_confidence TEXT`);
  db.exec(`ALTER TABLE events ADD COLUMN occurred_at_earliest TEXT`);
  db.exec(`ALTER TABLE events ADD COLUMN occurred_at_latest TEXT`);
  return db;
}

function seed(
  db: RawDb,
  confidence: string | null,
  earliest: string | null = null,
  latest: string | null = null,
) {
  db.prepare(
    `INSERT INTO events
       (id, pet_id, event_type, occurred_at, notes, source, occurred_at_source,
        occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
        created_at, updated_at, synced)
     VALUES ('e1', 'p1', 'vomit', ?, 'original note', 'manual', 'now', ?, ?, ?,
             '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 1)`,
  ).run('2026-07-01T04:00:00.000Z', confidence, earliest, latest);
}

function read(db: RawDb): StoredEvent {
  return db.prepare('SELECT * FROM events WHERE id = ?').get('e1') as unknown as StoredEvent;
}

// The fields every caller sends — a plain note/time edit, saying nothing about
// how well the time is known.
const NOTE_EDIT = {
  occurred_at: '2026-07-01T04:00:00.000Z',
  severity: null,
  notes: 'edited note',
  occurred_at_source: 'manual' as const,
};

describe('updateEvent — occurred_at_confidence is written only when asserted (B-448)', () => {
  describe('an edit that omits confidence leaves the stored claim alone', () => {
    it('does NOT promote an unclassified (NULL) row to witnessed — the B-448 regression', async () => {
      const db = freshDb();
      seed(db, null);

      await updateEvent('e1', NOTE_EDIT, adapter(db));

      const row = read(db);
      // The whole point: NULL survives, so the vet report keeps rendering
      // 'unspecified' rather than the falsely-certain 'seen'.
      expect(row.occurred_at_confidence).toBeNull();
      expect(row.notes).toBe('edited note');
    });

    it('does not flatten a stored estimate to witnessed', async () => {
      const db = freshDb();
      seed(db, 'estimated');

      await updateEvent('e1', NOTE_EDIT, adapter(db));

      expect(read(db).occurred_at_confidence).toBe('estimated');
    });

    it('keeps a window and BOTH its bounds intact', async () => {
      const db = freshDb();
      seed(db, 'window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z');

      await updateEvent('e1', NOTE_EDIT, adapter(db));

      const row = read(db);
      expect(row.occurred_at_confidence).toBe('window');
      // Bounds are the window's content — dropping them while keeping the tag
      // would leave a 'window' row with nothing to render as a range.
      expect(row.occurred_at_earliest).toBe('2026-07-01T02:00:00.000Z');
      expect(row.occurred_at_latest).toBe('2026-07-01T04:00:00.000Z');
    });

    it('still writes the fields the edit IS about, and re-queues the row', async () => {
      const db = freshDb();
      seed(db, null);

      await updateEvent(
        'e1',
        { ...NOTE_EDIT, occurred_at: '2026-07-01T06:30:00.000Z' },
        adapter(db),
      );

      const row = read(db);
      expect(row.occurred_at).toBe('2026-07-01T06:30:00.000Z');
      expect(row.occurred_at_source).toBe('manual');
      // Correcting WHEN it happened is not a claim about how well the time is
      // known — the point moves, the confidence does not.
      expect(row.occurred_at_confidence).toBeNull();
      expect(row.synced).toBe(0);
      expect(row.updated_at).not.toBe('2026-07-01T00:00:00.000Z');
    });
  });

  describe('an edit that asserts confidence writes all three columns together', () => {
    it('classifies an unclassified row when the owner says they saw it', async () => {
      const db = freshDb();
      seed(db, null);

      await updateEvent(
        'e1',
        { ...NOTE_EDIT, confidence: { value: 'witnessed', earliest: null, latest: null } },
        adapter(db),
      );

      expect(read(db).occurred_at_confidence).toBe('witnessed');
    });

    it('reclassifies witnessed → window and carries the bounds', async () => {
      const db = freshDb();
      seed(db, 'witnessed');

      await updateEvent(
        'e1',
        {
          ...NOTE_EDIT,
          confidence: {
            value: 'window',
            earliest: '2026-07-01T01:00:00.000Z',
            latest: '2026-07-01T04:00:00.000Z',
          },
        },
        adapter(db),
      );

      const row = read(db);
      expect(row.occurred_at_confidence).toBe('window');
      expect(row.occurred_at_earliest).toBe('2026-07-01T01:00:00.000Z');
      expect(row.occurred_at_latest).toBe('2026-07-01T04:00:00.000Z');
    });

    it('clears stale bounds when a window is reclassified back to a point', async () => {
      const db = freshDb();
      seed(db, 'window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z');

      await updateEvent(
        'e1',
        { ...NOTE_EDIT, confidence: { value: 'estimated', earliest: null, latest: null } },
        adapter(db),
      );

      const row = read(db);
      expect(row.occurred_at_confidence).toBe('estimated');
      // Leaving these behind would violate migration 012's
      // chk_occurred_window_fields on the server (bounds are legal only on
      // 'window') and reject the sync push.
      expect(row.occurred_at_earliest).toBeNull();
      expect(row.occurred_at_latest).toBeNull();
    });
  });
});

// CUL-606 — `severity` and `notes` became optional-by-omission, for the same
// reason `confidence` already was, and the same failure mode in the other
// direction: a caller that knows only the new time was forced to send values for
// two columns it had never been told about, and `notes: null` is not "leave it
// alone" — it is "delete what the owner wrote".
//
// The named completion card's "Change time" is exactly that caller, and both of
// its paths (the /log simple-event step and the weight step) write an
// owner-typed note. So the tap that corrected a timestamp would have silently
// erased the note typed thirty seconds earlier, with no error and nothing on
// screen to notice — the worst shape a data-loss bug can take.
describe('updateEvent — severity and notes are written only when named (CUL-606)', () => {
  const TIME_ONLY = {
    occurred_at: '2026-07-01T09:30:00.000Z',
    occurred_at_source: 'manual' as const,
  };

  it('preserves a stored note when the edit does not mention notes', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    await updateEvent('e1', TIME_ONLY, adapter(db));

    const row = read(db);
    expect(row.notes).toBe('original note');
    // ...and the field the edit IS about still lands.
    expect(row.occurred_at).toBe('2026-07-01T09:30:00.000Z');
    expect(row.synced).toBe(0);
  });

  // Presence is tested with `in`, not truthiness, so clearing a note stays
  // possible — the edit screen relies on it.
  it('still clears a note when null is passed EXPLICITLY', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    await updateEvent('e1', { ...TIME_ONLY, notes: null }, adapter(db));

    expect(read(db).notes).toBeNull();
  });

  // The hole the adversarial-reviewer found in the first cut of this change.
  // `exactOptionalPropertyTypes` is off, so `{ notes: undefined }` type-checks
  // against `notes?: string | null` — and an `in` test would have read it as
  // "clear the note". A caller writing `notes: draft.notes` (draft.notes
  // optional) would then delete the owner's note with no compiler error: the
  // exact failure this change exists to prevent, resurrected in a shape
  // TypeScript used to reject outright.
  it('treats an explicit undefined as "not named", not as "clear"', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    await updateEvent('e1', { ...TIME_ONLY, notes: undefined, severity: undefined }, adapter(db));

    expect(read(db).notes).toBe('original note');
  });

  it('leaves the confidence columns alone on a time-only edit too', async () => {
    const db = freshDb();
    seed(db, 'window', null, '2026-07-01T04:00:00.000Z');

    await updateEvent('e1', TIME_ONLY, adapter(db));

    const row = read(db);
    expect(row.occurred_at_confidence).toBe('window');
    expect(row.occurred_at_latest).toBe('2026-07-01T04:00:00.000Z');
  });
});
