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
import { EventTimeMovedError, pointLeavesStoredWindow, timeWriteForEdit } from './eventTimeEdit';
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
  // The row's stored provenance. Defaults to 'now' — the app's own clock
  // assumption (CUL-576) — because that is the value every fresh log carries and
  // the one a wrong default would overwrite.
  source: 'manual' | 'exif' | 'now' = 'now',
) {
  db.prepare(
    `INSERT INTO events
       (id, pet_id, event_type, occurred_at, notes, source, occurred_at_source,
        occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
        created_at, updated_at, synced)
     VALUES ('e1', 'p1', 'vomit', ?, 'original note', 'manual', ?, ?, ?, ?,
             '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 1)`,
  ).run('2026-07-01T04:00:00.000Z', source, confidence, earliest, latest);
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

// ── CUL-708 — occurred_at_source is REQUIRED, and deliberately not like its
// neighbours ────────────────────────────────────────────────────────────────
//
// `severity`, `notes` and `confidence` are optional-by-omission (CUL-606, B-448
// above): silence preserves, because none of them describes the field this call
// always writes. `occurred_at_source` does. It describes WHO produced the
// `occurred_at` that every updateEvent call overwrites — so on omission there is
// no safe thing for it to mean, in either direction:
//
//   • defaulting to 'manual' (the pre-CUL-708 `?? 'manual'`) asserts the OWNER
//     chose this timestamp on a save that may have changed nothing — CUL-701,
//     which is that defect arriving via a literal instead of via silence.
//   • preserving the stored value is worse, not better: a caller that omits the
//     key while MOVING the time leaves a clock-stamped row still claiming 'now'
//     over an owner-chosen point. That is B-525, and it is not hypothetical —
//     sourceAfterPointEdit's docstring cites the live row it was found on.
//
// So the field is required. Every caller writes `occurred_at`, so every caller
// has an answer by construction, and the compiler asks for it. That matters
// because the alternative on offer was a comment, and CUL-613 and CUL-701 are
// both records of a comment not holding.
describe('updateEvent — occurred_at_source is required, not defaulted (CUL-708)', () => {
  const TIME_ONLY = { occurred_at: '2026-07-01T09:30:00.000Z' };

  // THE GUARD, half one: the type. Pre-fix this directive is UNUSED — omitting
  // the key type-checked fine — so `tsc --noEmit` fails with TS2578 and the CI
  // `App (typecheck + jest)` job goes red. That is the whole enforcement
  // mechanism, and it is why this is written as a @ts-expect-error rather than
  // asserted in prose.
  //
  // THE GUARD, half two: no silent runtime fallback stands behind the type. A
  // caller that evades it (JS, a cast) must fail loudly rather than quietly
  // stamp a provenance nobody claimed — the write is refused and the stored
  // value is left exactly as it was.
  it('cannot reach the column by omission — no type escape, no runtime default', async () => {
    const db = freshDb();
    seed(db, 'witnessed', null, null, 'exif');

    await expect(
      // @ts-expect-error — omitting occurred_at_source is the defect under test.
      updateEvent('e1', TIME_ONLY, adapter(db)),
    ).rejects.toThrow();

    const row = read(db);
    // Nothing was written: not the provenance, and not the time either.
    expect(row.occurred_at_source).toBe('exif');
    expect(row.occurred_at).toBe('2026-07-01T04:00:00.000Z');
  });

  // Refactor-safety, not a guard: these pass on BOTH sides of the change. They
  // pin the behaviour being preserved — a stated source still lands verbatim —
  // so a later "simplification" that re-introduces a default has something to
  // break other than the two assertions above.
  it('writes a stated exif provenance verbatim — a peek does not become a claim', async () => {
    const db = freshDb();
    seed(db, 'witnessed', null, null, 'exif');

    // The named card's peek-and-save: sourceAfterPointEdit returned the stored
    // value because nothing moved, and updateEvent must not second-guess it.
    // Stamping 'manual' here drops a photo's EXIF attribution off the record.
    await updateEvent(
      'e1',
      { occurred_at: '2026-07-01T04:00:00.000Z', occurred_at_source: 'exif' },
      adapter(db),
    );

    expect(read(db).occurred_at_source).toBe('exif');
  });

  it('writes a stated manual provenance over a clock-stamped row', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    // The other direction: the owner actually moved the point, so the app's
    // 'now' assumption is superseded by the owner's choice (B-525).
    await updateEvent('e1', { ...TIME_ONLY, occurred_at_source: 'manual' }, adapter(db));

    const row = read(db);
    expect(row.occurred_at_source).toBe('manual');
    expect(row.occurred_at).toBe('2026-07-01T09:30:00.000Z');
  });

  it('leaves a stated "now" alone — the app may keep its own assumption', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    await updateEvent(
      'e1',
      { occurred_at: '2026-07-01T04:00:00.000Z', occurred_at_source: 'now' },
      adapter(db),
    );

    expect(read(db).occurred_at_source).toBe('now');
  });
});

// CUL-2772 — the check and the write are one statement.
//
// The editor reads the row, judges the point against it in JS, then writes. A
// hydrate upsert already queued on the connection lands between the two. These
// tests play that order on a real engine: read, judge, LAND THE SYNC, write. The
// hydrate statement is the production one's shape (a whole-row replace of a row
// still marked synced, in PostgREST's `+00:00` spelling).
describe('updateEvent — ifTimeStill refuses a row that moved after it was judged (CUL-2772)', () => {
  /** `getEventTimeFields`'s read, against this database. */
  function readTime(db: RawDb) {
    const r = db
      .prepare('SELECT occurred_at, occurred_at_source, occurred_at_confidence, occurred_at_earliest, occurred_at_latest FROM events WHERE id = ?')
      .get('e1') as Record<string, string | null>;
    const c = r.occurred_at_confidence;
    return {
      confidence: (c === 'witnessed' || c === 'estimated' || c === 'window' ? c : null) as 'witnessed' | 'estimated' | 'window' | null,
      earliest: r.occurred_at_earliest,
      latest: r.occurred_at_latest,
      occurredAt: r.occurred_at,
      source: (r.occurred_at_source === 'exif' || r.occurred_at_source === 'now' ? r.occurred_at_source : 'manual') as 'manual' | 'exif' | 'now',
    };
  }

  /** A hydrate landing another device's save on a row this device has not edited. */
  function hydrate(db: RawDb, row: { occurredAt: string; confidence: string | null; earliest: string | null; latest: string | null }) {
    db.prepare(
      `UPDATE events SET occurred_at = ?, occurred_at_confidence = ?, occurred_at_earliest = ?,
              occurred_at_latest = ?, occurred_at_source = 'manual', updated_at = ?, synced = 1
        WHERE id = 'e1' AND synced = 1`,
    ).run(row.occurredAt, row.confidence, row.earliest, row.latest, '2026-07-01T06:00:00+00:00');
  }

  const REMOTE_WINDOW = {
    occurredAt: '2026-07-01T03:00:00+00:00',
    confidence: 'window',
    earliest: '2026-07-01T01:00:00+00:00',
    latest: '2026-07-01T03:00:00+00:00',
  };
  // The owner moved the plain point to 09:30 and touched nothing else.
  const MOVED = { occurredAt: new Date('2026-07-01T09:30:00.000Z'), source: 'manual' as const };

  it('the issue\'s race: a window lands between the check and the write, and zero rows change', async () => {
    const db = freshDb();
    seed(db, 'witnessed');

    const stored = readTime(db);
    const write = timeWriteForEdit({ ownerAsserted: false, pointMoved: true, form: MOVED, stored });
    // The JS check passes: the row it read is a witnessed point.
    expect(pointLeavesStoredWindow({ ownerAsserted: false, stored, point: new Date(write.occurredAt) })).toBe(false);

    hydrate(db, REMOTE_WINDOW); // the gap

    await expect(
      updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'n', ifTimeStill: write.guard! }, adapter(db)),
    ).rejects.toBeInstanceOf(EventTimeMovedError);

    // The row is exactly what the sync left: the point inside its window, still
    // synced, the note untouched. Nothing half-landed.
    const row = read(db);
    expect(row.occurred_at).toBe(REMOTE_WINDOW.occurredAt);
    expect(row.occurred_at_confidence).toBe('window');
    expect(row.notes).toBe('original note');
    expect(row.synced).toBe(1);

    // And the re-read is refused by the one rule, in JS, as CUL-2199 refuses it.
    const again = readTime(db);
    const rewrite = timeWriteForEdit({ ownerAsserted: false, pointMoved: true, form: MOVED, stored: again });
    expect(pointLeavesStoredWindow({ ownerAsserted: false, stored: again, point: new Date(rewrite.occurredAt) })).toBe(true);
  });

  it('non-vacuity: without the guard the same order leaves the point outside the window', async () => {
    const db = freshDb();
    seed(db, 'witnessed');
    const write = timeWriteForEdit({ ownerAsserted: false, pointMoved: true, form: MOVED, stored: readTime(db) });
    hydrate(db, REMOTE_WINDOW);

    await updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source }, adapter(db));

    const row = read(db);
    expect(row.occurred_at_confidence).toBe('window');
    expect(Date.parse(row.occurred_at)).toBeGreaterThan(Date.parse(row.occurred_at_latest!));
  });

  // One column at a time (the adversarial pass, M10 to M12): the race above moves the
  // point, the confidence and the bounds together, so each clause was covered only
  // by the other two. Each row here moves exactly one, and each must refuse alone.
  it.each([
    [
      'only a bound: the window narrows under a point moved inside the old one',
      ['window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z'] as const,
      { occurredAt: '2026-07-01T04:00:00.000Z', confidence: 'window', earliest: '2026-07-01T03:00:00.000Z', latest: '2026-07-01T04:00:00.000Z' },
      { occurredAt: new Date('2026-07-01T02:30:00.000Z'), source: 'manual' as const },
      true,
    ],
    [
      'only the point: a witnessed time re-timed elsewhere, on a note save',
      ['witnessed', null, null] as const,
      { occurredAt: '2026-07-01T05:00:00.000Z', confidence: 'witnessed', earliest: null, latest: null },
      MOVED,
      false,
    ],
    [
      'only the confidence: witnessed re-graded to estimated at the same instant',
      ['witnessed', null, null] as const,
      { occurredAt: '2026-07-01T04:00:00.000Z', confidence: 'estimated', earliest: null, latest: null },
      MOVED,
      false,
    ],
    [
      'only the lower bound appearing: an open window closes on a point before it',
      ['window', null, '2026-07-01T04:00:00.000Z'] as const,
      { occurredAt: '2026-07-01T04:00:00.000Z', confidence: 'window', earliest: '2026-07-01T03:00:00.000Z', latest: '2026-07-01T04:00:00.000Z' },
      { occurredAt: new Date('2026-07-01T02:30:00.000Z'), source: 'manual' as const },
      true,
    ],
  ])('refuses when a sync moved %s', async (_name, seeded, landed, form, pointMoved) => {
    const db = freshDb();
    seed(db, seeded[0], seeded[1], seeded[2]);
    const stored = readTime(db);
    const write = timeWriteForEdit({ ownerAsserted: false, pointMoved, form, stored });
    expect(pointLeavesStoredWindow({ ownerAsserted: false, stored, point: new Date(write.occurredAt) })).toBe(false);

    hydrate(db, landed);

    await expect(
      updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'n', ifTimeStill: write.guard! }, adapter(db)),
    ).rejects.toBeInstanceOf(EventTimeMovedError);
    const row = read(db);
    expect(row.occurred_at).toBe(landed.occurredAt);
    expect(row.notes).toBe('original note');
    expect(row.synced).toBe(1);
  });

  it('a row nothing touched saves through the guard, bounds NULL and all', async () => {
    for (const [confidence, earliest, latest] of [
      [null, null, null],
      ['witnessed', null, null],
      ['window', null, '2026-07-01T04:00:00.000Z'],
      ['window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z'],
    ] as const) {
      const db = freshDb();
      seed(db, confidence, earliest, latest);
      const write = timeWriteForEdit({ ownerAsserted: false, pointMoved: false, form: MOVED, stored: readTime(db) });
      await updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'edited', ifTimeStill: write.guard! }, adapter(db));
      const row = read(db);
      expect(row.notes).toBe('edited');
      expect(row.synced).toBe(0);
      // An untouched, unmoved save hands the row its own time and provenance back.
      expect(row.occurred_at).toBe('2026-07-01T04:00:00.000Z');
      expect(row.occurred_at_source).toBe('now');
    }
  });

  it('a note edit keeps a window a sync replaced, point on its new edge (the comment\'s first instance)', async () => {
    const db = freshDb();
    seed(db, 'window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z');
    // The screen opened on [02:00, 04:00]. A sync replaces it with [03:00, 06:00]:
    // the old edge 04:00 sits inside the new window, so no window rule objects.
    hydrate(db, { occurredAt: '2026-07-01T06:00:00+00:00', confidence: 'window', earliest: '2026-07-01T03:00:00+00:00', latest: '2026-07-01T06:00:00+00:00' });

    const write = timeWriteForEdit({
      ownerAsserted: false, pointMoved: false,
      form: { occurredAt: new Date('2026-07-01T04:00:00.000Z'), source: 'now' },
      stored: readTime(db),
    });
    await updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'edited', ifTimeStill: write.guard! }, adapter(db));

    const row = read(db);
    expect(row.occurred_at).toBe('2026-07-01T06:00:00+00:00');
    expect(row.occurred_at).toBe(row.occurred_at_latest);
    expect(row.notes).toBe('edited');
  });

  it('a note edit keeps the point a re-grade to witnessed put there (the second instance)', async () => {
    const db = freshDb();
    seed(db, 'window', '2026-07-01T02:00:00.000Z', '2026-07-01T04:00:00.000Z');
    hydrate(db, { occurredAt: '2026-07-01T02:40:00+00:00', confidence: 'witnessed', earliest: null, latest: null });

    const write = timeWriteForEdit({
      ownerAsserted: false, pointMoved: false,
      form: { occurredAt: new Date('2026-07-01T04:00:00.000Z'), source: 'now' },
      stored: readTime(db),
    });
    await updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'edited', ifTimeStill: write.guard! }, adapter(db));

    const row = read(db);
    // Not 'witnessed' at the old window's edge, a time nobody saw.
    expect(row.occurred_at_confidence).toBe('witnessed');
    expect(row.occurred_at).toBe('2026-07-01T02:40:00+00:00');
    expect(row.occurred_at_source).toBe('manual');
  });

  it('a confidence outside the three values reads as null and still matches itself', async () => {
    const db = freshDb();
    seed(db, 'approximate');
    const write = timeWriteForEdit({ ownerAsserted: false, pointMoved: false, form: MOVED, stored: readTime(db) });
    await updateEvent('e1', { occurred_at: write.occurredAt, occurred_at_source: write.source, notes: 'edited', ifTimeStill: write.guard! }, adapter(db));
    expect(read(db).notes).toBe('edited');
  });
});
