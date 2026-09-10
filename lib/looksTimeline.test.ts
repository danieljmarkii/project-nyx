// The look reaches the record surfaces through the timeline join (CUL-869 / N-3).
//
// Run against the REAL `getTimeline` / `getEventById` SQL — not a wrapper that
// mirrors it — because the claim under test is precisely that the shipped statement
// carries the child. A test over a copy of the query would stay green against a
// production SELECT that had lost the join, which is the failure it exists to catch.
//
// The soft-delete half is the one worth stating. `looks` has no `deleted_at` of its
// own; deletedness reads through the parent (§9 rule 2). These two queries filter
// `e.deleted_at IS NULL` on the parent itself, so a reversed look cannot come back
// through them at all — the rule is inherited here rather than restated, and that is
// what the last two cases prove.

jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

let mockRaw: InstanceType<typeof DatabaseSync>;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).get(...(params as never[])) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));

import { getTimeline, getEventById } from './db';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { wordsToLocalText } from './lookWordsCodec';
import { describeLook, lookSummary } from './lookDisplay';

const PET = 'pet-1';
const AT = '2026-03-15T09:58:00.000Z';

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockRaw.exec(sql); } catch { /* per-table upgrade */ }
  });
});

function seedLook(opts: {
  eventId: string;
  outcome?: string;
  words?: string[];
  note?: string | null;
  deletedAt?: string | null;
  withChild?: boolean;
}) {
  const { eventId, withChild = true } = opts;
  mockRaw.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence,
                         source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, 'check_in', ?, 'witnessed', 'manual', ?, ?, ?, 1)`,
  ).run(eventId, PET, AT, AT, AT, opts.deletedAt ?? null);
  if (!withChild) return;
  mockRaw.prepare(
    `INSERT INTO looks (id, event_id, pet_id, outcome, local_day, words, vocab_version,
                        notes, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, '2026-03-15', ?, 1, ?, ?, ?, 1)`,
  ).run(
    `look-${eventId}`,
    eventId,
    PET,
    opts.outcome ?? 'observed',
    wordsToLocalText(opts.words ?? ['subdued', 'walk_refused']),
    opts.note ?? null,
    AT,
    AT,
  );
}

describe('getTimeline carries the look’s child', () => {
  it('an observed look arrives with its words and reads as a sentence', async () => {
    seedLook({ eventId: 'e1' });
    const [row] = await getTimeline(PET, 20, 0, null, null);

    expect(row.look_outcome).toBe('observed');
    expect(row.look_words).toBe(wordsToLocalText(['subdued', 'walk_refused']));
    expect(row.look_note).toBeNull();
    // End to end, through the resolver every surface uses.
    expect(lookSummary(describeLook(row, { species: 'dog', sex: 'male' })))
      .toBe('off, didn’t want the walk');
  });

  it('an absence look arrives as the absence', async () => {
    seedLook({ eventId: 'e1', outcome: 'nothing_unusual', words: [] });
    const [row] = await getTimeline(PET, 20, 0, null, null);
    expect(lookSummary(describeLook(row))).toBe('nothing unusual');
  });

  it('a note-bearing look arrives with its note', async () => {
    seedLook({ eventId: 'e1', note: 'he hung back at the corner' });
    const [row] = await getTimeline(PET, 20, 0, null, null);
    expect(row.look_note).toBe('he hung back at the corner');
  });

  it('a check_in with no child row reads as unknown, never as the absence', async () => {
    seedLook({ eventId: 'e1', withChild: false });
    const [row] = await getTimeline(PET, 20, 0, null, null);
    expect(row.look_outcome).toBeNull();
    expect(describeLook(row).kind).toBe('unknown');
    expect(lookSummary(describeLook(row))).toBeNull();
  });

  it('every OTHER row still reads null on all three columns — the join adds no rows', async () => {
    mockRaw.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, created_at, updated_at, synced)
       VALUES ('v1', ?, 'vomit', ?, 'manual', ?, ?, 1)`,
    ).run(PET, AT, AT, AT);
    seedLook({ eventId: 'e1' });

    const rows = await getTimeline(PET, 20, 0, null, null);
    expect(rows).toHaveLength(2); // a LEFT JOIN on a UNIQUE event_id cannot multiply
    const vomit = rows.find((r) => r.id === 'v1');
    expect(vomit).toMatchObject({ look_outcome: null, look_words: null, look_note: null });
  });
});

describe('getEventById carries it too — the record screen’s read', () => {
  it('resolves the child for the one row', async () => {
    seedLook({ eventId: 'e1', note: 'twice before lunch' });
    const row = await getEventById('e1');
    expect(row?.look_outcome).toBe('observed');
    expect(row?.look_note).toBe('twice before lunch');
  });
});

describe('the soft-delete drop is inherited from the parent (§9 rule 2)', () => {
  it('a reversed look leaves the timeline while its child row survives', async () => {
    seedLook({ eventId: 'e1', deletedAt: '2026-03-16T00:00:00.000Z', note: 'still here' });

    // The child is untouched — which is exactly why the read has to filter the parent.
    expect(mockRaw.prepare('SELECT notes FROM looks WHERE event_id = ?').get('e1'))
      .toMatchObject({ notes: 'still here' });

    expect(await getTimeline(PET, 20, 0, null, null)).toEqual([]);
    expect(await getEventById('e1')).toBeNull();
  });
});
