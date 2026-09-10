// The look's write path and its day counts (CUL-868 / N-2).
//
// Run against a REAL node:sqlite database built from the production DDL constant,
// not a mocked `runAsync`: the two things most worth proving here are that
// `insertLook`'s SQL actually matches the schema it ships beside, and that the
// counts group by the STORED `local_day` — neither of which a string assertion over
// a mock can see. `node:sqlite` is Node ≥ 22 core, and `require()` keeps it off the
// babel/jest-expo transform path (the precedent set by medications.test.ts).
//
// The one thing that IS mocked is `./sync`, because importing it pulls in supabase
// and the whole push machinery. The parent-gated drain is still tested against the
// real database — by reading the REAL SELECT out of lib/sync.ts and running it, so
// the test cannot pass against a statement the app does not execute.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockPushOrder: string[] = [];
const mockSyncPendingEvents = jest.fn(async () => { mockPushOrder.push('events'); });
const mockSyncPendingLooks = jest.fn(async () => { mockPushOrder.push('looks'); });
jest.mock('./sync', () => ({
  syncPendingEvents: () => mockSyncPendingEvents(),
  syncPendingLooks: () => mockSyncPendingLooks(),
}));

// A look must NEVER trigger a Signal regen (T-5). lib/looks.ts does not import this
// module at all, so this mock exists to catch the day someone adds the import "for
// consistency with insertMeal" — the exact shape of edit that quietly re-opens a
// boundary. The source scan at the foot of this file is the other half.
const mockTriggerSignalRegenDebounced = jest.fn();
jest.mock('./signal', () => ({
  triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerSignalRegenDebounced(...a),
}));

let mockDb: InstanceType<typeof DatabaseSync>;

// The adapter lib/looks.ts's `getDb()` sees: expo-sqlite's async surface over
// node:sqlite's synchronous one. withTransactionAsync really does BEGIN/COMMIT, so
// the atomicity claim in insertLook is exercised rather than assumed.
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params: unknown[] = []) => {
      mockDb.prepare(sql).run(...(params as never[]));
    },
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      mockDb.prepare(sql).all(...(params as never[])),
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

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES, applyColumnUpgrades } from './localSchema';
import { NOT_QUARANTINED_SQL } from './syncQueue';
import { localDayIndex, dayKeyFromIndex } from './utils';

const MS_PER_DAY = 86_400_000;
import {
  insertLook,
  localDayForLook,
  loadLookDays,
  answeredDays,
  wordDays,
  wordDaySet,
  absenceDays,
  answeredVomitDays,
  type LookDayRow,
} from './looks';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('PRAGMA foreign_keys = ON');
  mockDb.exec(BASE_SCHEMA_SQL);
  // The REAL runtime schema is the DDL constant PLUS initDb's column-upgrade path:
  // occurred_at_source / occurred_at_confidence are ALTER-added columns that exist on
  // every real device and in none of the constants (the syncQueue.test.ts rule).
  await applyColumnUpgrades(async (sql: string) => {
    try { mockDb.exec(sql); } catch { /* a column this schema does not have — the upgrade is per-table */ }
  });
  mockPushOrder.length = 0;
  mockSyncPendingEvents.mockClear();
  mockSyncPendingLooks.mockClear();
  mockTriggerSignalRegenDebounced.mockClear();
});

/** Lets insertLook's fire-and-forget `syncPendingEvents().then(syncPendingLooks)`
 *  chain settle. A bare Promise.resolve() is insufficient — the `.then` callback is
 *  a microtask queued after the first promise resolves (the meals.test.ts note). */
const flush = () => new Promise((r) => setTimeout(r, 0));

const rows = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] =>
  mockDb.prepare(sql).all(...(params as never[])) as T[];

describe('insertLook — the one durable write', () => {
  it('writes the parent as a check_in and the child beside it, in one transaction', async () => {
    const result = await insertLook({
      petId: PET,
      species: 'dog',
      outcome: 'observed',
      words: ['subdued', 'walk_refused'],
      occurredAt: new Date(Date.now() - 60_000),
      occurredAtSource: 'now',
    });

    const [event] = rows<{ event_type: string; notes: string | null; occurred_at_confidence: string; occurred_at_source: string; synced: number }>(
      'SELECT * FROM events WHERE id = ?', [result.eventId],
    );
    expect(event.event_type).toBe('check_in');
    expect(event.occurred_at_confidence).toBe('witnessed');
    expect(event.occurred_at_source).toBe('now');
    expect(event.synced).toBe(0);

    const [look] = rows<{ event_id: string; pet_id: string; outcome: string; local_day: string; words: string; vocab_version: number; notes: string | null; synced: number }>(
      'SELECT * FROM looks WHERE id = ?', [result.lookId],
    );
    expect(look.event_id).toBe(result.eventId);
    expect(look.pet_id).toBe(PET);
    expect(look.outcome).toBe('observed');
    expect(look.local_day).toBe(result.localDay);
    expect(JSON.parse(look.words)).toEqual(['subdued', 'walk_refused']);
    expect(look.vocab_version).toBe(1);
    expect(look.synced).toBe(0);
  });

  // T-22 / §9 rule 1 / migration 064's events_check_in_notes_null. The parent's notes
  // column is read by Ask's recall fetch with NO type filter, so a note there reaches
  // a model. NULL, never '' — the server CHECK refuses the empty string, and that
  // row's push would then wedge permanently (064's write-path rule 2).
  it('leaves events.notes NULL — never a note, never an empty string', async () => {
    const { eventId, lookId } = await insertLook({
      petId: PET,
      species: 'cat',
      outcome: 'nothing_unusual',
      words: [],
      occurredAt: new Date(),
      occurredAtSource: 'now',
    });
    const [event] = rows<{ notes: string | null }>('SELECT notes FROM events WHERE id = ?', [eventId]);
    expect(event.notes).toBeNull();
    expect(event.notes).not.toBe('');
    // The child's note is also NULL on the way in: the note comes AFTER the save
    // (T-22), from the record screen, never from this write.
    const [look] = rows<{ notes: string | null }>('SELECT notes FROM looks WHERE id = ?', [lookId]);
    expect(look.notes).toBeNull();
  });

  it('triggers NO Signal regen — a look never enters the engine (T-5)', async () => {
    await insertLook({
      petId: PET,
      species: 'cat',
      outcome: 'observed',
      words: ['hiding'],
      occurredAt: new Date(),
      occurredAtSource: 'now',
    });
    await flush();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  // The ORDER, not just the two calls: the child's push is chained off the parent's
  // resolution, and the server's trg_looks_same_pet is why — a child that reaches
  // Supabase before its parent is refused 23514, which is terminal. Asserted as a
  // sequence rather than as "looks has not been called yet", because the mock
  // resolves instantly and that phrasing would pass on a bare `Promise.all`.
  it('pushes the parent BEFORE the child', async () => {
    await insertLook({
      petId: PET,
      species: 'cat',
      outcome: 'observed',
      words: ['lively'],
      occurredAt: new Date(),
      occurredAtSource: 'now',
    });
    await flush();
    expect(mockPushOrder).toEqual(['events', 'looks']);
  });

  it('an observed look with no words, and an absence look with words, are both refused', async () => {
    const base = { petId: PET, species: 'dog' as const, occurredAt: new Date(), occurredAtSource: 'now' as const };
    await expect(insertLook({ ...base, outcome: 'observed', words: [] })).rejects.toThrow(/at least one word/);
    await expect(insertLook({ ...base, outcome: 'nothing_unusual', words: ['subdued'] })).rejects.toThrow(/carries no words/);
    // Refused BEFORE the transaction: nothing at all is written.
    expect(rows('SELECT id FROM events')).toHaveLength(0);
    expect(rows('SELECT id FROM looks')).toHaveLength(0);
  });

  it('a word outside the species list is refused (the closed set, client-side)', async () => {
    await expect(
      insertLook({
        petId: PET, species: 'cat', outcome: 'observed',
        // A real DOG word. The DB would take it — there is no CHECK on `words` (the
        // 032 precedent) — so this write is the only thing standing between a cat's
        // record and "full walk".
        words: ['full_walk'],
        occurredAt: new Date(), occurredAtSource: 'now',
      }),
    ).rejects.toThrow(/not a cat look word/);
    expect(rows('SELECT id FROM looks')).toHaveLength(0);
  });

  it('duplicate word taps collapse to one stored key', async () => {
    const { lookId } = await insertLook({
      petId: PET, species: 'dog', outcome: 'observed',
      words: ['subdued', 'subdued', 'lively'],
      occurredAt: new Date(), occurredAtSource: 'now',
    });
    const [look] = rows<{ words: string }>('SELECT words FROM looks WHERE id = ?', [lookId]);
    expect(JSON.parse(look.words)).toEqual(['subdued', 'lively']);
  });
});

// ── The day key, at the boundary it exists for (T-19; C-29) ──────────────────
//
// Anchored to Date.now(), never to a calendar literal: a fixture pinned to an
// absolute date and judged against a real clock fails on a calendar boundary rather
// than on a change (CUL-831). The boundary instant is FOUND by search rather than
// constructed, so the test is correct across a DST transition too.

/** The first instant after `fromMs` at which the zone's local day increments. */
function nextMidnight(fromMs: number, zone: string): number {
  const day = localDayIndex(fromMs, zone);
  let lo = fromMs;
  let hi = fromMs + 25 * 60 * 60 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDayIndex(mid, zone) > day) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe.each(['Pacific/Kiritimati', 'Pacific/Honolulu'])('local_day in %s', (zone) => {
  it('a look two minutes before midnight belongs to the day that is ending', async () => {
    const midnight = nextMidnight(Date.now(), zone);
    const at1158 = new Date(midnight - 2 * 60 * 1000);
    const { localDay } = await insertLook({
      petId: PET, species: 'cat', outcome: 'observed', words: ['subdued'],
      occurredAt: at1158, occurredAtSource: 'now', timeZone: zone,
    });
    expect(localDay).toBe(dayKeyFromIndex(localDayIndex(at1158.getTime(), zone)));
    // And it is NOT tomorrow's key — the assertion that fails if the derivation ever
    // falls back to UTC (which at +14 and −10 is a different day at this hour).
    expect(localDay).not.toBe(dayKeyFromIndex(localDayIndex(midnight, zone)));
  });

  it('"Change time" across midnight moves the day key WITH the point (C-10)', () => {
    const midnight = nextMidnight(Date.now(), zone);
    const before = new Date(midnight - 2 * 60 * 1000);
    const after = new Date(midnight + 60 * 1000);
    const dayBefore = localDayForLook(before, zone);
    const dayAfter = localDayForLook(after, zone);
    expect(dayAfter).not.toBe(dayBefore);
    // Exactly one day apart, in the right direction.
    expect(Date.parse(`${dayAfter}T00:00:00Z`) - Date.parse(`${dayBefore}T00:00:00Z`)).toBe(MS_PER_DAY);
  });
});

// ── The parent gate, against the REAL statement ──────────────────────────────

describe('drainLooksQueue — the parent gate', () => {
  /** The drain's row-selection SQL, read out of lib/sync.ts. Reading it rather than
   *  re-typing it is the point (the CUL-691 lesson): a test that replays its own
   *  approximation of a statement proves nothing about the one that ships. */
  function drainSelect(): string {
    const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
    const start = src.indexOf('`SELECT l.* FROM looks l');
    const end = src.indexOf('LIMIT 100`', start);
    if (start === -1 || end === -1) throw new Error('drainLooksQueue SELECT not found — did it move?');
    return src
      .slice(start + 1, end + 'LIMIT 100'.length)
      .replace('${NOT_QUARANTINED_SQL}', NOT_QUARANTINED_SQL);
  }

  function seed(eventId: string, lookId: string, parentSynced: 0 | 1) {
    mockDb.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, created_at, updated_at, synced)
       VALUES (?, ?, 'check_in', ?, 'manual', ?, ?, ?)`,
    ).run(eventId, PET, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), parentSynced);
    mockDb.prepare(
      `INSERT INTO looks (id, event_id, pet_id, outcome, local_day, words, created_at, updated_at, synced)
       VALUES (?, ?, ?, 'observed', '2026-09-10', '["subdued"]', ?, ?, 0)`,
    ).run(lookId, eventId, PET, new Date().toISOString(), new Date().toISOString());
  }

  it('a child whose parent has not landed is NOT pushed; once it lands, it is', () => {
    seed('e-unsynced', 'l-waiting', 0);
    seed('e-synced', 'l-ready', 1);
    const picked = rows<{ id: string }>(drainSelect()).map((r) => r.id);
    expect(picked).toEqual(['l-ready']);

    // The parent lands on the next cycle; the child follows, never before.
    mockDb.prepare('UPDATE events SET synced = 1 WHERE id = ?').run('e-unsynced');
    expect(rows<{ id: string }>(drainSelect()).map((r) => r.id).sort()).toEqual(['l-ready', 'l-waiting']);
  });

  it('a quarantined child is skipped even with its parent landed', () => {
    seed('e-1', 'l-1', 1);
    mockDb.prepare("UPDATE looks SET sync_error = '23514: refused' WHERE id = 'l-1'").run();
    expect(rows(drainSelect())).toHaveLength(0);
  });
});

// ── The day counts ───────────────────────────────────────────────────────────

describe('the day counts — the day is the unit, local_day is the key', () => {
  /** A look row straight into the mirror, so a count can be tested over a shaped
   *  record without driving twenty writes through insertLook. */
  function look(
    day: string,
    outcome: 'observed' | 'nothing_unusual',
    words: string[],
    opts: { petId?: string; deleted?: boolean } = {},
  ) {
    const id = `${day}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    mockDb.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, deleted_at, created_at, updated_at, synced)
       VALUES (?, ?, 'check_in', ?, 'manual', ?, ?, ?, 1)`,
    ).run(`e-${id}`, opts.petId ?? PET, `${day}T12:00:00.000Z`, opts.deleted ? now : null, now, now);
    mockDb.prepare(
      `INSERT INTO looks (id, event_id, pet_id, outcome, local_day, words, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(`l-${id}`, `e-${id}`, opts.petId ?? PET, outcome, day, JSON.stringify(words), now, now);
  }

  it('ten looks in a day are ONE answered day (T-14)', async () => {
    for (let i = 0; i < 10; i += 1) look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-02', 'nothing_unusual', []);
    const record = await loadLookDays(PET);
    expect(answeredDays(record)).toBe(2);
  });

  it('a word marked twice in one day counts once for that day', async () => {
    look('2026-09-01', 'observed', ['subdued', 'lively']);
    look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-03', 'observed', ['subdued']);
    const record = await loadLookDays(PET);
    expect(wordDays(record, 'subdued')).toBe(2);
    expect(wordDays(record, 'lively')).toBe(1);
    expect(wordDays(record, 'hiding')).toBe(0);
    expect([...wordDaySet(record, 'subdued')].sort()).toEqual(['2026-09-01', '2026-09-03']);
  });

  // T-14's precedence, and the one direction it may run in (C-4). Inverting this
  // turns a day the owner reported something on into a day the record calls clear.
  it('a nothing-unusual at 7am and an off at 6pm is an OFF day, never an absence day', async () => {
    look('2026-09-01', 'nothing_unusual', []);
    look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-02', 'nothing_unusual', []);
    look('2026-09-02', 'nothing_unusual', []);
    const record = await loadLookDays(PET);
    expect(answeredDays(record)).toBe(2);
    expect(absenceDays(record)).toBe(1);
  });

  // §9 rule 2 / the privacy review's fixture: after Undo the `looks` row SURVIVES,
  // live-looking, words and note intact. Only the parent's deleted_at says it is
  // gone, so a reader that forgets the join renders a taken-back look forever.
  it('an undone look is invisible to every count — the soft delete reads through the parent', async () => {
    look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-02', 'observed', ['subdued'], { deleted: true });
    // The child row is still there — this is the trap, stated as an assertion.
    expect(rows('SELECT id FROM looks')).toHaveLength(2);
    const record = await loadLookDays(PET);
    expect(answeredDays(record)).toBe(1);
    expect(wordDays(record, 'subdued')).toBe(1);
  });

  it('another pet’s looks never reach this pet’s counts', async () => {
    look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-01', 'observed', ['subdued'], { petId: OTHER_PET });
    look('2026-09-02', 'observed', ['subdued'], { petId: OTHER_PET });
    expect(answeredDays(await loadLookDays(PET))).toBe(1);
    expect(answeredDays(await loadLookDays(OTHER_PET))).toBe(2);
  });

  it('sinceDay bounds the READ, inclusively', async () => {
    look('2026-08-20', 'observed', ['subdued']);
    look('2026-09-01', 'observed', ['subdued']);
    look('2026-09-02', 'observed', ['subdued']);
    expect(answeredDays(await loadLookDays(PET, '2026-09-01'))).toBe(2);
  });

  // §6.11, and the third adversarial pass's blocker: BOTH sides of the pairing's
  // margin must count ANSWERED days. A left denominator over all vomit days and a
  // right one over answered days scores every unanswered bad day as "nothing seen".
  it('answeredVomitDays counts only the vomit days the owner actually answered', async () => {
    look('2026-09-01', 'observed', ['lip_licking']);
    look('2026-09-03', 'observed', []);
    const record = await loadLookDays(PET);
    // Three vomit days on the record; only two of them were answered.
    expect(answeredVomitDays(record, ['2026-09-01', '2026-09-02', '2026-09-03'])).toBe(2);
    // A repeated day is still one day.
    expect(answeredVomitDays(record, ['2026-09-01', '2026-09-01'])).toBe(1);
  });

  it('the counts are pure over the rows they are given', () => {
    const record: LookDayRow[] = [
      { localDay: '2026-09-01', outcome: 'observed', words: ['subdued'] },
      { localDay: '2026-09-01', outcome: 'nothing_unusual', words: [] },
    ];
    const before = JSON.stringify(record);
    answeredDays(record);
    wordDays(record, 'subdued');
    absenceDays(record);
    answeredVomitDays(record, ['2026-09-01']);
    expect(JSON.stringify(record)).toBe(before);
  });
});

// ── The absence, guarded ─────────────────────────────────────────────────────

describe('T-5, in the source', () => {
  // The mock above catches a regen CALL. This catches the import, which is what a
  // "make insertLook look like insertMeal" refactor actually adds — and which the
  // mock would only catch if the new call happened to run in a test.
  it('lib/looks.ts names no Signal-regen path at all', () => {
    const src = readFileSync(join(__dirname, 'looks.ts'), 'utf8');
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/triggerSignalRegen/);
    expect(code).not.toMatch(/from '\.\/signal'/);
  });
});
