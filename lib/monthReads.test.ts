// Real-SQLite coverage for the month's read layer (D2-5 / CUL-1067). The pure model
// is `lib/monthModel.test.ts`; this suite runs the ACTUAL SQL against the PRODUCTION
// DDL (`BASE_SCHEMA_SQL` + `MEDICATION_SCHEMA_SQL`), because a column-name or JOIN typo
// in a raw query passes tsc and the mocked tests and surfaces only on device, where
// the screen's try/catch degrades it to "no month". node:sqlite, require()'d to stay
// off the babel/jest-expo import path (the patternsTimingReads precedent).
//
// Two of the read's promises are pinned here rather than in the model: an episode
// day is a LOGGED day by construction of the predicate (the burden DayMark's header
// puts on this caller), and a verdict the phone does not hold is `seen`, never a
// colour. Since HV-5 (CUL-1162) the verdicts are the phone's copy (`event_ai_verdicts`,
// in the same production DDL), and the server is stubbed to THROW: the month must draw
// its rose with the network off.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; get(...a: unknown[]): Record<string, unknown> | undefined; run(...a: unknown[]): unknown };
}

let mockDb: Db;
const mockGetTimeline = jest.fn();
const mockSqlLog: string[] = [];
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => {
      mockSqlLog.push(sql);
      return mockDb.prepare(sql).all(...params);
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...params) ?? null,
  }),
  getTimeline: (...a: unknown[]) => mockGetTimeline(...a),
}));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

// The server, OFF: any call throws, and none may be made (HV-5 — the month's verdicts
// are the phone's copy). The count proves the absence was asked about, not assumed.
const mockFrom = jest.fn(() => {
  throw new Error('offline: the month must not reach the server');
});
jest.mock('./supabase', () => ({ supabase: { from: () => mockFrom() } }));

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { readDayRows, readMonthFacts, readWorthACall } from './monthReads';
import { toLocalDayKey } from './utils';

function freshDb(): Db {
  const d = new DatabaseSync(':memory:') as Db;
  d.exec(BASE_SCHEMA_SQL);
  d.exec(MEDICATION_SCHEMA_SQL);
  // The columns a device gains by upgrade (`intake_rating`, `food_type`, …): the same
  // list `initDb` applies, so the DDL here is the DDL a device has.
  for (const c of COLUMN_UPGRADES) {
    const cols = d.prepare(`PRAGMA table_info(${c.table})`).all() as { name: string }[];
    // Tables from the other schema constants (diet_trials, …) are not built here;
    // a column on a table that does not exist is not one this read can touch.
    if (cols.length === 0 || cols.some((col) => col.name === c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`);
  }
  return d;
}

let seq = 0;
const PET = 'pet-1';

/** A local instant on `key` at `hour`, spelled the way the app writes it (`…Z`). */
function at(key: string, hour = 9, minute = 0): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

function ev(type: string, occurredAt: string, opts: { deleted?: boolean; pet?: string } = {}): string {
  const id = `e${++seq}`;
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'app', ?, ?, ?)`,
    )
    .run(id, opts.pet ?? PET, type, occurredAt, occurredAt, occurredAt, opts.deleted ? occurredAt : null);
  return id;
}
function meal(occurredAt: string, rating: string | null, foodId: string | null = 'food-1'): string {
  const id = ev('meal', occurredAt);
  mockDb.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, ?, ?)`).run(`m${id}`, id, PET, foodId, rating);
  return id;
}
function food(id: string, type: string) {
  mockDb
    .prepare(`INSERT INTO food_items_cache (id, brand, product_name, food_type, format) VALUES (?, 'B', 'P', ?, 'dry_kibble')`)
    .run(id, type);
}
function dose(occurredAt: string, adherence: string | null): string {
  const id = ev('medication', occurredAt);
  mockDb
    .prepare(`INSERT INTO medication_administrations (id, event_id, pet_id, adherence) VALUES (?, ?, ?, ?)`)
    .run(`a${id}`, id, PET, adherence);
  return id;
}
function photo(eventId: string) {
  mockDb
    .prepare(`INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path) VALUES (?, ?, ?, 'file://x', 'p/x')`)
    .run(`att${++seq}`, eventId, PET);
}
/** A row of the phone's copy of the read (HV-5), as the sync pull would have written it. */
function verdict(eventId: string, recommendation: string | null, status = 'completed') {
  mockDb
    .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES (?, ?, ?, ?)`)
    .run(eventId, status, recommendation, '2026-09-10T12:00:00+00:00');
}

const RANGE = { fromKey: '2026-09-01', toKey: '2026-09-30' };

beforeEach(() => {
  mockDb = freshDb();
  seq = 0;
  mockFrom.mockClear();
  mockSqlLog.length = 0;
  food('food-1', 'meal');
  food('treat-1', 'treat');
});

describe('readMonthFacts against the production DDL', () => {
  it('episodes are vomit rows through the re-log collapse; every episode day is a logged day', async () => {
    ev('vomit', at('2026-09-02', 7, 0));
    ev('vomit', at('2026-09-02', 7, 20)); // twenty minutes later: the same bout
    ev('vomit', at('2026-09-02', 19, 0)); // a second bout that day
    ev('vomit', at('2026-09-11', 8, 0));
    ev('vomit', at('2026-09-12', 8, 0), { deleted: true });
    ev('vomit', at('2026-09-13', 8, 0), { pet: 'pet-2' });
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.episodeDays).toEqual(['2026-09-02', '2026-09-02', '2026-09-11']);
    // The predicate that decides "logged" includes vomit, so no episode day can be grey.
    for (const k of facts.episodeDays) expect(facts.loggedDays).toContain(k);
  });

  it('logged is any day the owner logged anything — a cough, a stool, a dose, a weigh-in — and never a look', async () => {
    // The COVERAGE question (PM R3: "a logged cough IS a logged day"), not the engine's
    // comparison-gate set the first draft borrowed — under which a stool-, cough-,
    // lethargy- or dose-only day drew grey with its own rows one tap away.
    meal(at('2026-09-03'), 'all');
    ev('diarrhea', at('2026-09-04'));
    ev('itch', at('2026-09-05'));
    ev('cough', at('2026-09-06'));
    dose(at('2026-09-07'), 'given');
    ev('check_in', at('2026-09-08')); // a look is never coverage
    ev('weight_check', at('2026-09-09'));
    ev('stool_normal', at('2026-09-10'));
    ev('lethargy', at('2026-09-11'));
    ev('sneeze', at('2026-09-12'));
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.loggedDays).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
    expect(facts.loggedDays).not.toContain('2026-09-08');
    expect(facts.dosedDays).toEqual(['2026-09-07']);
    // And none of those is an EPISODE: the month counts vomiting alone (mutant R20).
    expect(facts.episodeDays).toEqual([]);
  });

  it('left-some is an unfinished QUALIFYING meal: rated, non-treat, non-free-fed', async () => {
    meal(at('2026-09-03'), 'some');
    meal(at('2026-09-04'), 'all');
    meal(at('2026-09-05'), 'most'); // finished
    meal(at('2026-09-06'), null); // unrated: not qualifying
    meal(at('2026-09-07'), 'picked', 'treat-1'); // a treat: not qualifying
    meal(at('2026-09-08'), 'refused', 'free-1'); // free-fed below: not qualifying
    food('free-1', 'meal');
    mockDb
      .prepare(`INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, active_from) VALUES ('fa1', ?, 'free-1', 'free_choice', '2026-01-01')`)
      .run(PET);
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.leftSomeDays).toEqual(['2026-09-03']);
    // Every one of those meals is still a LOGGED day: the hairline's paleness is a
    // second fact on top of coverage, never instead of it.
    expect(facts.loggedDays).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
  });

  it('a dosed day is a DELIVERED dose — missed and refused never draw the dot', async () => {
    dose(at('2026-09-03'), 'given');
    dose(at('2026-09-04'), 'partial');
    dose(at('2026-09-05'), 'missed');
    dose(at('2026-09-06'), 'refused');
    dose(at('2026-09-07'), null);
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.dosedDays).toEqual(['2026-09-03', '2026-09-04']);
  });

  it('photographed days carry the verdict the PHONE holds, with the network off (HV-5)', async () => {
    const a = ev('vomit', at('2026-09-02'));
    const b = ev('vomit', at('2026-09-05'));
    const c = ev('stool', at('2026-09-09'));
    photo(a);
    photo(b);
    photo(c);
    verdict(a, 'worth_a_call');
    verdict(b, 'monitor');
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.photoDays).toEqual([
      { day: '2026-09-02', verdict: 'worth_a_call' },
      { day: '2026-09-05', verdict: 'seen' },
      { day: '2026-09-09', verdict: 'seen' },
    ]);
    // The rose drew with the server throwing on any call, because no call was made.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a day holding one seen photo and one worth-a-call photo answers the escalation FIRST (mutant R14)', async () => {
    const a = ev('vomit', at('2026-09-02', 7));
    const b = ev('stool', at('2026-09-02', 19));
    photo(a);
    photo(b);
    verdict(b, 'worth_a_call');
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.photoDays).toEqual([
      { day: '2026-09-02', verdict: 'worth_a_call' },
      { day: '2026-09-02', verdict: 'seen' },
    ]);
  });

  it('a verdict the phone does not hold, or cannot read, is `seen`, never a colour', async () => {
    const a = ev('vomit', at('2026-09-02'));
    photo(a);
    // No copy row: the read never landed on this phone.
    expect((await readMonthFacts(PET, RANGE)).photoDays).toEqual([{ day: '2026-09-02', verdict: 'seen' }]);
    // A copy that cannot be read at all degrades the same way, and says so.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockDb.exec('DROP TABLE event_ai_verdicts');
      expect((await readMonthFacts(PET, RANGE)).photoDays).toEqual([{ day: '2026-09-02', verdict: 'seen' }]);
      // node:sqlite's error comes from another realm, so match its message, not its class.
      expect(warn).toHaveBeenCalledWith('[month] read copy failed:', expect.objectContaining({ message: expect.stringMatching(/event_ai_verdicts/) }));
    } finally {
      warn.mockRestore();
    }
    // And a month with no photos asks the copy nothing at all.
    mockDb = freshDb();
    mockSqlLog.length = 0;
    await readMonthFacts(PET, RANGE);
    expect(mockSqlLog.filter((q) => /event_ai_verdicts/.test(q))).toEqual([]);
  });

  it('the rose is the one predicate’s: a failed re-read keeps it (CUL-812), an unknown verdict takes it, a calm one never does', async () => {
    expect(await readWorthACall([])).toEqual(new Set());
    verdict('failed-rose', 'worth_a_call', 'failed');
    verdict('unknown', 'looks_fine_to_me');
    verdict('failed-calm', 'monitor', 'failed');
    verdict('calm', 'monitor');
    verdict('unsure', 'not_enough_to_say', 'uncertain');
    verdict('capped', null, 'capped');
    expect(await readWorthACall(['failed-rose', 'unknown', 'failed-calm', 'calm', 'unsure', 'capped', 'absent'])).toEqual(
      new Set(['failed-rose', 'unknown']),
    );
  });

  it('the record start is the earliest surviving event of any type, as a local day', async () => {
    ev('weight_check', at('2026-06-14'));
    ev('vomit', at('2026-05-01'), { deleted: true });
    ev('meal', at('2026-09-03'));
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.recordStart).toBe('2026-06-14');
    mockDb = freshDb();
    expect((await readMonthFacts(PET, RANGE)).recordStart).toBeNull();
  });

  it('bounds are parsed, never compared as text: both spellings of a boundary instant land on their day (C-40)', async () => {
    // The same instant — the first second of the range's first local day — spelled the
    // two ways the table holds it. A text bound would keep one and drop the other.
    const firstLocalMidnight = new Date(2026, 8, 1, 0, 0, 0);
    const z = firstLocalMidnight.toISOString();
    const plus = z.replace(/\.000Z$/, '+00:00');
    expect(Date.parse(z)).toBe(Date.parse(plus));
    expect(z).not.toBe(plus);
    ev('vomit', z);
    ev('vomit', plus); // the same instant, spelled the other way
    const facts = await readMonthFacts(PET, RANGE);
    // Two rows at one instant collapse to ONE episode (the re-log gap), on the range's
    // first day — neither was dropped by the bound.
    expect(facts.episodeDays).toEqual(['2026-09-01']);
    expect(facts.loggedDays).toEqual(['2026-09-01']);
    // And the last second of the range's last day, spelled `+00:00`, is inside too.
    const lastLocalSecond = new Date(2026, 8, 30, 23, 59, 59).toISOString().replace(/\.000Z$/, '+00:00');
    mockDb = freshDb();
    ev('meal', lastLocalSecond);
    expect((await readMonthFacts(PET, RANGE)).loggedDays).toEqual(['2026-09-30']);
    // While a row one second past the range is OUT, whatever its spelling.
    mockDb = freshDb();
    ev('meal', new Date(2026, 9, 1, 0, 0, 0).toISOString().replace(/\.000Z$/, '+00:00'));
    expect((await readMonthFacts(PET, RANGE)).loggedDays).toEqual([]);
  });

  it('the day a row belongs to is the LOCAL day — the same fixture reads the same under every CI zone', async () => {
    // 23:30 local on Sep 30, built from local components: it is Sep 30 in Honolulu, in
    // Kiritimati and in Chatham, because the key is derived the way the read derives it.
    const late = new Date(2026, 8, 30, 23, 30);
    ev('meal', late.toISOString());
    const facts = await readMonthFacts(PET, RANGE);
    expect(facts.loggedDays).toEqual([toLocalDayKey(late)]);
    expect(facts.loggedDays).toEqual(['2026-09-30']);
  });

  it('refuses a malformed range', async () => {
    await expect(readMonthFacts(PET, { fromKey: 'sept', toKey: '2026-09-30' })).rejects.toThrow(/day range/);
  });
});

describe('readDayRows — one LOCAL day, bounds parsed', () => {
  it('keeps both spellings of a boundary instant, drops the next day, orders oldest first', async () => {
    const midnight = new Date(2026, 8, 2, 0, 0, 0);
    const lastSecond = new Date(2026, 8, 2, 23, 59, 59);
    const nextDay = new Date(2026, 8, 3, 0, 0, 0);
    const row = (id: string, occurredAt: string) => ({ id, occurred_at: occurredAt, event_type: 'meal' });
    mockGetTimeline.mockResolvedValue([
      row('c', lastSecond.toISOString().replace(/\.000Z$/, '+00:00')),
      row('d', nextDay.toISOString()),
      row('a', midnight.toISOString()),
      row('b', midnight.toISOString().replace(/\.000Z$/, '+00:00')),
      row('z', new Date(2026, 8, 1, 23, 59, 59).toISOString()),
    ]);
    const rows = await readDayRows('pet-1', '2026-09-02');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    // The SQL prefilter asked for a day of slack on each side, never the exact bound.
    const [, , , , after, before] = mockGetTimeline.mock.calls[0];
    expect(Date.parse(after as string)).toBeLessThan(midnight.getTime());
    expect(Date.parse(before as string)).toBeGreaterThan(nextDay.getTime());
  });

  it('refuses a malformed key', async () => {
    await expect(readDayRows('pet-1', 'yesterday')).rejects.toThrow(/day key/);
  });
});
