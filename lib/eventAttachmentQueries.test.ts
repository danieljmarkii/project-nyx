// B-105 — the read half: which attachment row wins when an event has more than
// one.
//
// This is exercised against a REAL database built from the production DDL rather
// than asserted as a string, because the bug being fixed was invisible to string
// review: `ORDER BY sort_order ASC LIMIT 1` looks deterministic, and is not, once
// every row carries the same sort_order. Only executing it shows that.
//
// node:sqlite is Node >= 22 core; require() keeps it off the babel/jest-expo
// transform path (the precedent set by medications.test.ts / hydration.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { BASE_SCHEMA_SQL } from './localSchema';
import {
  EVENT_ATTACHMENT_QUERY,
  EVENT_ATTACHMENTS_QUERY,
  EVENT_ATTACHMENT_ORDER,
} from './eventAttachmentQueries';

const EVENT = 'e1';
const PET = 'p1';

interface Row { id: string; local_uri: string; storage_path: string; mime_type: string }

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  db.exec(
    `INSERT INTO events (id, pet_id, event_type, occurred_at)
     VALUES ('${EVENT}', '${PET}', 'vomit', '2026-07-01T00:00:00.000Z'),
            ('e2', '${PET}', 'vomit', '2026-07-01T00:00:00.000Z')`,
  );
  return db;
}

/** Insert an attachment. `sortOrder` defaults to 0 — what the app actually writes. */
function addAttachment(
  db: ReturnType<typeof freshDb>,
  id: string,
  createdAt: string,
  opts: { eventId?: string; sortOrder?: number } = {},
) {
  db.prepare(
    `INSERT INTO event_attachments
       (id, event_id, pet_id, local_uri, storage_path, mime_type, sort_order, synced, created_at)
     VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
  ).run(
    id,
    opts.eventId ?? EVENT,
    PET,
    `file:///docs/${id}.jpg`,
    `${PET}/${opts.eventId ?? EVENT}/${id}.jpg`,
    opts.sortOrder ?? 0,
    createdAt,
  );
}

const first = (db: ReturnType<typeof freshDb>, eventId = EVENT): Row | undefined =>
  db.prepare(EVENT_ATTACHMENT_QUERY).get(eventId) as Row | undefined;
const all = (db: ReturnType<typeof freshDb>, eventId = EVENT): Row[] =>
  db.prepare(EVENT_ATTACHMENTS_QUERY).all(eventId) as Row[];

describe('event attachment ordering (B-105)', () => {
  it('returns the NEWEST row when an event carries duplicates', () => {
    const db = freshDb();
    // Insertion order deliberately puts the newest row FIRST, so a read that
    // fell through to rowid would return the old photo. This is the shape three
    // production events are already in.
    addAttachment(db, 'new', '2026-07-20T12:00:00.000Z');
    addAttachment(db, 'old', '2026-07-01T09:00:00.000Z');
    expect(first(db)?.id).toBe('new');
    db.close();
  });

  it('returns the newest regardless of the order rows were inserted', () => {
    // The property that matters: the answer is a function of the DATA, never of
    // how the rows happened to land. Every permutation of three timestamps must
    // agree, which is exactly what the old query could not promise.
    const stamps: Array<[string, string]> = [
      ['a', '2026-07-01T00:00:00.000Z'],
      ['b', '2026-07-10T00:00:00.000Z'],
      ['c', '2026-07-20T00:00:00.000Z'],
    ];
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    for (const order of permutations) {
      const db = freshDb();
      for (const i of order) addAttachment(db, stamps[i][0], stamps[i][1]);
      expect(first(db)?.id).toBe('c');
      expect(all(db).map((r) => r.id)).toEqual(['c', 'b', 'a']);
      db.close();
    }
  });

  it('is TOTAL — identical timestamps still resolve to one stable row', () => {
    const same = '2026-07-20T12:00:00.000Z';
    const db = freshDb();
    addAttachment(db, 'aaa', same);
    addAttachment(db, 'zzz', same);
    // id DESC is the last tiebreak; the value it picks matters less than that it
    // picks the SAME one every read, which is what stops the hero flickering.
    expect(first(db)?.id).toBe('zzz');
    expect(first(db)?.id).toBe('zzz');
    db.close();
  });

  it('sort_order still outranks recency, so a multi-photo sequence survives', () => {
    const db = freshDb();
    addAttachment(db, 'newer-but-second', '2026-07-20T00:00:00.000Z', { sortOrder: 1 });
    addAttachment(db, 'older-but-first', '2026-07-01T00:00:00.000Z', { sortOrder: 0 });
    expect(first(db)?.id).toBe('older-but-first');
    expect(all(db).map((r) => r.id)).toEqual(['older-but-first', 'newer-but-second']);
    db.close();
  });

  it('scopes to the event asked for', () => {
    const db = freshDb();
    addAttachment(db, 'mine', '2026-07-01T00:00:00.000Z');
    addAttachment(db, 'theirs', '2026-07-20T00:00:00.000Z', { eventId: 'e2' });
    expect(first(db)?.id).toBe('mine');
    expect(all(db)).toHaveLength(1);
    db.close();
  });

  it('an event with no photo reads as absent, not as an error', () => {
    const db = freshDb();
    expect(first(db)).toBeUndefined();
    expect(all(db)).toEqual([]);
    db.close();
  });

  it('projects the columns the screens read', () => {
    const db = freshDb();
    addAttachment(db, 'only', '2026-07-01T00:00:00.000Z');
    expect(first(db)).toEqual({
      id: 'only',
      local_uri: 'file:///docs/only.jpg',
      storage_path: `${PET}/${EVENT}/only.jpg`,
      mime_type: 'image/jpeg',
    });
    db.close();
  });

  it('REGRESSION — the pre-fix ordering really was ambiguous', () => {
    // Guards against someone "simplifying" the ORDER BY back. If this ever
    // starts failing because the bare sort_order query became deterministic by
    // accident of SQLite internals, the tiebreakers are still what we want —
    // but the claim in the header would need rewording, so it should be noticed.
    const db = freshDb();
    addAttachment(db, 'new', '2026-07-20T12:00:00.000Z');
    addAttachment(db, 'old', '2026-07-01T09:00:00.000Z');
    const bare = db
      .prepare(
        `SELECT id FROM event_attachments WHERE event_id = ? ORDER BY sort_order ASC LIMIT 1`,
      )
      .get(EVENT) as { id: string };
    expect(bare.id).toBe('new'); // insertion/rowid order — NOT the newest by data
    expect(first(db)?.id).toBe('new');

    // Same data, opposite insertion order: the old query flips, the new one does not.
    const db2 = freshDb();
    addAttachment(db2, 'old', '2026-07-01T09:00:00.000Z');
    addAttachment(db2, 'new', '2026-07-20T12:00:00.000Z');
    const bare2 = db2
      .prepare(
        `SELECT id FROM event_attachments WHERE event_id = ? ORDER BY sort_order ASC LIMIT 1`,
      )
      .get(EVENT) as { id: string };
    expect(bare2.id).toBe('old'); // <- the bug: the replaced photo wins
    expect(first(db2)?.id).toBe('new');
    db.close();
    db2.close();
  });

  it('both reads share ONE ordering clause', () => {
    // The single-implementation rule, asserted rather than trusted: a divergence
    // between "which photo renders" and "which photos the replace sweeps" would
    // silently detach the row being displayed.
    expect(EVENT_ATTACHMENT_QUERY).toContain(EVENT_ATTACHMENT_ORDER);
    expect(EVENT_ATTACHMENTS_QUERY).toContain(EVENT_ATTACHMENT_ORDER);
  });
});
