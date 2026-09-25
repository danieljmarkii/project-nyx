// "Since the last vet visit" — the one visit bound (H-11, CUL-1160; spec §3.9, AC 29).
//
// Two halves. The pure rule, table-tested over the cases the Data Scientist lens named
// (a same-day visit, a future date, a year boundary). And the local read, driven for
// real over `node:sqlite` built from the app's own schema constant, so the SQL is proven
// against the table the phone actually holds rather than a mock shaped like it (C-39).
//
// `today` is always a LOCAL day key built from local components (C-29), so every case
// means the same thing under each clock the non-UTC CI job runs. The report's copy of
// the rule is pinned in `lib/visitWindow.guard.test.ts`.

import { BASE_SCHEMA_SQL } from './localSchema';
import { toLocalDayKey } from './utils';
import { latestVisitBefore, readLatestVisitBefore, type VisitDaysDb } from './visitWindow';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type RawDb = InstanceType<typeof DatabaseSync>;

const TODAY = '2026-09-21';

describe('latestVisitBefore — the latest visit strictly before today, including its day', () => {
  it.each<[string, string[], string | null]>([
    ['no visit at all', [], null],
    ['a visit yesterday starts the window yesterday', ['2026-09-20'], '2026-09-20'],
    ['the latest of several, in any order', ['2026-07-02', '2026-09-16', '2026-03-11'], '2026-09-16'],
    ['a visit saved TODAY anchors nothing until tomorrow', ['2026-09-21'], null],
    ['today’s visit is skipped, the one before it anchors', ['2026-09-16', '2026-09-21'], '2026-09-16'],
    ['a future-dated visit anchors nothing', ['2026-10-02'], null],
    ['a future date never outranks a past visit', ['2026-10-02', '2026-09-01'], '2026-09-01'],
    ['two visits on one day are one anchor', ['2026-09-16', '2026-09-16'], '2026-09-16'],
    ['a visit years ago still anchors', ['2024-02-29'], '2024-02-29'],
  ])('%s', (_case, visits, expected) => {
    expect(latestVisitBefore(visits, TODAY)).toBe(expected);
  });

  it('a visit saved today becomes the anchor the next day', () => {
    // The whole of H-11's difference from Home, over two consecutive days.
    const visits = ['2026-09-02', '2026-09-21'];
    expect(latestVisitBefore(visits, '2026-09-21')).toBe('2026-09-02');
    expect(latestVisitBefore(visits, '2026-09-22')).toBe('2026-09-21');
  });

  it('crosses a new year as days, not text', () => {
    expect(latestVisitBefore(['2026-12-31'], '2027-01-01')).toBe('2026-12-31');
    expect(latestVisitBefore(['2026-12-31', '2027-01-01'], '2027-01-01')).toBe('2026-12-31');
  });

  it('skips a value that is not a real calendar day rather than guessing one', () => {
    const visits = [
      '2026-02-30', // Date would roll it to Mar 2
      '2026-09-19T23:00:00.000Z', // an instant is not a DATE
      '2026-9-18', // not the shape a DATE column produces
      '',
      '2026-09-10',
    ];
    expect(latestVisitBefore(visits, TODAY)).toBe('2026-09-10');
    expect(latestVisitBefore(['2026-02-30'], TODAY)).toBeNull();
  });

  it('throws on an unreadable today, never reading as "no visit before today"', () => {
    // Null is a FACT here, and the report falls to its next rung on it (HV-15), so a
    // caller's bug must not be able to produce it (the adversarial pass's finding 5).
    expect(() => latestVisitBefore(['2026-09-16'], 'today')).toThrow(RangeError);
    expect(() => latestVisitBefore(['2026-09-16'], '2026-02-30')).toThrow(RangeError);
    expect(() => latestVisitBefore([], '')).toThrow(RangeError);
  });

  it('holds on the device clock at both edges of a local day (C-29)', () => {
    // `today` exactly as the phone derives it, from an instant built from LOCAL
    // components, so each CI zone decides nothing: one minute after local midnight the
    // visit of the day before anchors; one minute before it, the same visit is today's.
    const visit = '2026-09-16';
    const justAfterMidnight = toLocalDayKey(new Date(2026, 8, 17, 0, 1));
    const justBeforeMidnight = toLocalDayKey(new Date(2026, 8, 16, 23, 59));
    expect(latestVisitBefore([visit], justAfterMidnight)).toBe(visit);
    expect(latestVisitBefore([visit], justBeforeMidnight)).toBeNull();
  });
});

// ── The read, over the real local schema ───────────────────────────────────────

const PET = 'pet-a';
const OTHER_PET = 'pet-b';

function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  return db;
}

function insertVisit(db: RawDb, id: string, petId: string, visitedAt: string, deletedAt: string | null = null) {
  db.prepare(
    `INSERT INTO vet_visits (id, pet_id, visited_at, deleted_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(id, petId, visitedAt, deletedAt, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
}

/** node:sqlite's sync API behind the async surface the production read declares. */
function adapter(db: RawDb): VisitDaysDb {
  return {
    async getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

describe('readLatestVisitBefore — the local read', () => {
  it('reads the latest live visit before today for this pet only', async () => {
    const db = freshDb();
    insertVisit(db, 'v1', PET, '2026-07-02');
    insertVisit(db, 'v2', PET, '2026-09-16');
    insertVisit(db, 'v3', OTHER_PET, '2026-09-20'); // another pet's visit never anchors this one
    expect(await readLatestVisitBefore(adapter(db), PET, TODAY)).toBe('2026-09-16');
  });

  it('a removed visit stops anchoring the window it started', async () => {
    const db = freshDb();
    insertVisit(db, 'v1', PET, '2026-07-02');
    insertVisit(db, 'v2', PET, '2026-09-16', '2026-09-18T10:00:00.000Z');
    expect(await readLatestVisitBefore(adapter(db), PET, TODAY)).toBe('2026-07-02');
  });

  it('a visit saved today is read and still anchors nothing', async () => {
    const db = freshDb();
    insertVisit(db, 'v1', PET, TODAY);
    expect(await readLatestVisitBefore(adapter(db), PET, TODAY)).toBeNull();
  });

  it('a pet with no visit has no window, which is a fact and not a failure', async () => {
    expect(await readLatestVisitBefore(adapter(freshDb()), PET, TODAY)).toBeNull();
  });

  it('an unreadable today throws before the read is made', async () => {
    const getAllAsync = jest.fn();
    await expect(readLatestVisitBefore({ getAllAsync }, PET, 'today')).rejects.toThrow(RangeError);
    expect(getAllAsync).not.toHaveBeenCalled();
  });

  it('a failed read throws instead of reading as "no visit"', async () => {
    const failure = new Error('database is locked');
    const broken: VisitDaysDb = {
      getAllAsync: () => Promise.reject(failure),
    };
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(readLatestVisitBefore(broken, PET, TODAY)).rejects.toBe(failure);
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });
});
