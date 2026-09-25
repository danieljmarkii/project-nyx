// History v2's controls' reads against the REAL schema on node:sqlite (HV-9 / CUL-1166;
// spec §7 AC 1's pill half, AC 28's facts, the *N not read* count). A raw query's column or
// JOIN typo passes tsc and every mocked test and surfaces only on a device, so these run
// the production SQL over the production DDL.
//
// Instants come from LOCAL components (B-514) and are written in BOTH spellings a device
// holds (a local write's `…Z`, a hydrated row's `…+00:00`, C-40). The clock is never read:
// every read is handed one pinned instant, noon on the fixture's today.

jest.mock('expo-file-system', () => ({ File: class {} }));
// Reached at import through readCopy / feedingArrangements / sync; nothing here calls out.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

let mockRaw: InstanceType<typeof DatabaseSync>;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).get(...(params as never[])) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));

import { claimAnalysisChain } from './analysisChain';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { daysIn, typePillOf } from './historyControls';
import { countLineOf, windowTotalOf, type DayRange, type HistoryFilter, HISTORY_TYPE_KEYS } from './historyDays';
import { readHistoryFacts, readRecordStartDay } from './historyQueries';
import { readHistoryRecord, readNotReadDays, readWindowFacts } from './historyWindowFacts';
import { monthGroups, offeredWindows, resolveWindow, windowBounds, type HistoryWindowKey } from './historyWindows';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { historyDateFormatFor } from './historyDateFormat';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';
const THE_PET = { id: PET, name: 'Nyx', species: 'dog' as const, sex: 'female' as const };
const TODAY = '2026-09-25';
/** Noon on the fixture's today, from local components: the one instant every read gets. */
const NOW = new Date(2026, 8, 25, 12, 0, 0).getTime();

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  mockRaw.exec(DIET_TRIAL_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try {
      mockRaw.exec(sql);
    } catch {
      /* a column another schema constant already declares */
    }
  });
});

// ── Fixture writers ──────────────────────────────────────────────────────────────

/** Local wall-clock on 2026-`month`-`day`. */
const localAt = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m, 0);
/** An instant as a hydrated row spells it (PostgREST's `+00:00`, no millis). */
const hydrated = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

function insertEvent(id: string, at: string, type: string, opts: { pet?: string; deleted?: boolean; notes?: string } = {}) {
  mockRaw
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, notes, source, created_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, 1)`,
    )
    .run(id, opts.pet ?? PET, type, at, opts.notes ?? null, at, at, opts.deleted ? at : null);
}

function insertMeal(id: string, at: string, rating: string | null = null) {
  insertEvent(id, at, 'meal');
  mockRaw.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, NULL, ?)`).run(`meal-${id}`, id, PET, rating);
}

function insertPhoto(eventId: string, pet = PET) {
  mockRaw
    .prepare(`INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path) VALUES (?, ?, ?, 'file://x', 'p/x')`)
    .run(`att-${eventId}`, eventId, pet);
}

/** The phone's copy of a read (HV-5's four columns). */
function insertCopy(eventId: string, status: string, verdict: string | null) {
  mockRaw
    .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES (?, ?, ?, '2026-09-25T00:00:00Z')`)
    .run(eventId, status, verdict);
}

function insertLook(id: string, at: string, localDay: string) {
  insertEvent(id, at, 'check_in');
  mockRaw.prepare(`INSERT INTO looks (id, event_id, pet_id, outcome, local_day) VALUES (?, ?, ?, 'observed', ?)`).run(`look-${id}`, id, PET, localDay);
}

function insertVisit(id: string, visitedAt: string, opts: { deleted?: boolean; pet?: string } = {}) {
  mockRaw
    .prepare(`INSERT INTO vet_visits (id, pet_id, visited_at, deleted_at) VALUES (?, ?, ?, ?)`)
    .run(id, opts.pet ?? PET, visitedAt, opts.deleted ? '2026-09-21T00:00:00Z' : null);
}

function insertTrial(startedAt: string, days: number) {
  mockRaw
    .prepare(`INSERT INTO diet_trials (id, pet_id, started_at, target_duration_days, status) VALUES ('trial-1', ?, ?, ?, 'active')`)
    .run(PET, startedAt, days);
}

function insertRegimen(id: string, itemId: string, drugName: string, startedAt: string) {
  mockRaw.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run(itemId, drugName);
  mockRaw
    .prepare(`INSERT INTO medications (id, pet_id, medication_item_id, drug_name, started_at, status) VALUES (?, ?, ?, ?, ?, 'active')`)
    .run(id, PET, itemId, drugName, startedAt);
}

function insertDose(id: string, at: string, regimen: string, itemId: string, adherence: string | null) {
  insertEvent(id, at, 'medication');
  mockRaw
    .prepare(`INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, medication_item_id, adherence) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`dose-${id}`, id, PET, regimen, itemId, adherence);
}

/** A record over May 14 → today in both spellings, with a trial, visits, doses and photos. */
function seedRecord(): void {
  insertLook('look-0510', localAt(5, 10, 9).toISOString(), '2026-05-10'); // before the record: never its start
  insertMeal('m-0514', hydrated(localAt(5, 14, 0, 0)), 'all'); // exactly local midnight, hydrated spelling
  insertEvent('v-0601', localAt(6, 1, 13).toISOString(), 'vomit');
  insertPhoto('v-0601');
  insertRegimen('reg-mot', 'item-mot', 'Motozol', '2026-07-16');
  insertDose('d-0716', hydrated(localAt(7, 16, 9)), 'reg-mot', 'item-mot', 'given');
  insertDose('d-0920', localAt(9, 20, 9).toISOString(), 'reg-mot', 'item-mot', 'refused');
  insertDose('d-0924', hydrated(localAt(9, 24, 9)), 'reg-mot', 'item-mot', null);
  insertTrial('2026-07-26', 90);
  insertVisit('visit-0916', '2026-09-16');
  insertVisit('visit-0920-deleted', '2026-09-20', { deleted: true });
  insertVisit('visit-today', TODAY);
  insertVisit('visit-future', '2026-10-01');
  insertVisit('visit-other-pet', '2026-09-22', { pet: OTHER_PET });
  insertEvent('v-0918', hydrated(localAt(9, 18, 7)), 'vomit');
  insertPhoto('v-0918');
  insertEvent('v-0923', localAt(9, 23, 23, 59).toISOString(), 'vomit');
  insertEvent('c-0922', localAt(9, 22, 20).toISOString(), 'cough');
  insertMeal('m-0922', localAt(9, 22, 8).toISOString(), 'refused');
  insertEvent('o-0924', localAt(9, 24, 19).toISOString(), 'other', { notes: 'ate grass' });
  insertEvent('w-0925', hydrated(localAt(9, 25, 8)), 'weight_check');
  insertPhoto('w-0925');
}

// ── The record's first day ───────────────────────────────────────────────────────

describe('readRecordStartDay: the window table’s floor', () => {
  it('is the population’s first local day: never a look, never a removed row, parsed in either spelling', async () => {
    seedRecord();
    insertEvent('gone', localAt(5, 1, 9).toISOString(), 'meal', { deleted: true });
    insertEvent('other-pet-first', localAt(4, 1, 9).toISOString(), 'meal', { pet: OTHER_PET });
    expect(await readRecordStartDay(PET)).toBe('2026-05-14');
  });

  it('is the same day readHistoryFacts reports as the record’s start', async () => {
    seedRecord();
    const facts = await readHistoryFacts(PET, { fromDay: '2026-05-01', toDay: TODAY });
    expect(await readRecordStartDay(PET)).toBe(facts.firsts.record);
  });

  it('is null for a pet with nothing logged, even with a look', async () => {
    insertLook('look-only', localAt(9, 1, 9).toISOString(), '2026-09-01');
    expect(await readRecordStartDay(PET)).toBeNull();
  });
});

// ── The window facts ─────────────────────────────────────────────────────────────

describe('readWindowFacts: one pet, one today', () => {
  it('reads the record’s start, the running trial and the latest visit strictly before today', async () => {
    seedRecord();
    const facts = await readWindowFacts(THE_PET, NOW);
    expect(facts).toMatchObject({ petId: PET, today: TODAY, firstRecordDay: '2026-05-14', sinceVisit: '2026-09-16' });
    expect(facts.trial?.running).toBe(true);
    expect(resolveWindow({ kind: 'trial' }, facts)).toMatchObject({
      key: { kind: 'trial' },
      bounds: { fromDay: '2026-07-26', toDay: TODAY },
      label: { short: 'Since Jul 26' },
    });
    expect(resolveWindow({ kind: 'visit' }, facts).bounds).toEqual({ fromDay: '2026-09-16', toDay: TODAY });
    // The sheet's rows come from the same facts: both anchored windows offered, months May → Sep.
    expect(offeredWindows(facts).map((k) => k.kind)).toEqual(['all', 'today', 'last', 'last', 'last', 'trial', 'visit']);
    expect(monthGroups(facts).flatMap((g) => g.months.map((m) => (m as { month: string }).month))).toEqual([
      '2026-09', '2026-08', '2026-07', '2026-06', '2026-05',
    ]);
  });

  it('a pet with no trial and no visit before today offers neither window', async () => {
    insertMeal('m-1', localAt(9, 1, 8).toISOString());
    insertVisit('visit-today', TODAY);
    const facts = await readWindowFacts(THE_PET, NOW);
    expect(facts.trial).toBeNull();
    expect(facts.sinceVisit).toBeNull();
    expect(offeredWindows(facts).map((k) => k.kind)).toEqual(['all', 'today', 'last', 'last', 'last']);
  });

  it('rejects when a read fails, rather than reading as a pet with no visit', async () => {
    seedRecord();
    mockRaw.exec('DROP TABLE vet_visits');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readWindowFacts(THE_PET, NOW)).rejects.toThrow();
    errors.mockRestore();
  });

  it('rejects an instant that names no day (instantOnDay\'s NaN), rather than reading some day', async () => {
    seedRecord();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readWindowFacts(THE_PET, Number.NaN)).rejects.toThrow();
    errors.mockRestore();
  });
});

// ── *N not read* ─────────────────────────────────────────────────────────────────

describe('readNotReadDays: photographed rows whose read never landed (§5.4, H-4b)', () => {
  const RANGE: DayRange = { fromDay: '2026-09-01', toDay: TODAY };

  function seedPhotos(): void {
    // Unread: a vomit photo with no copy on the phone, and a stool whose read failed.
    insertEvent('v-nocopy', hydrated(localAt(9, 10, 7)), 'vomit');
    insertPhoto('v-nocopy');
    insertEvent('dia-failed', localAt(9, 10, 18).toISOString(), 'diarrhea');
    insertPhoto('dia-failed');
    insertCopy('dia-failed', 'failed', null);
    // Read: a calm finished read and a worth-a-call one (the rose is not "not read").
    insertEvent('v-calm', localAt(9, 11, 7).toISOString(), 'vomit');
    insertPhoto('v-calm');
    insertCopy('v-calm', 'completed', 'monitor');
    insertEvent('v-rose', localAt(9, 12, 7).toISOString(), 'vomit');
    insertPhoto('v-rose');
    insertCopy('v-rose', 'failed', 'worth_a_call');
    // No read expected: a photographed meal, and a vomit with no photo at all.
    insertMeal('m-photo', localAt(9, 12, 8).toISOString());
    insertPhoto('m-photo');
    insertEvent('v-nophoto', localAt(9, 13, 7).toISOString(), 'vomit');
    // Outside the count: removed, another pet's, and one being read right now.
    insertEvent('v-deleted', localAt(9, 14, 7).toISOString(), 'vomit', { deleted: true });
    insertPhoto('v-deleted');
    insertEvent('v-other', localAt(9, 14, 8).toISOString(), 'vomit', { pet: OTHER_PET });
    insertPhoto('v-other', OTHER_PET);
    insertEvent('v-reading', localAt(9, 15, 7).toISOString(), 'vomit');
    insertPhoto('v-reading');
  }

  it('counts exactly the unread ones, on their local days, through the one predicate', async () => {
    seedPhotos();
    const claim = claimAnalysisChain('v-reading');
    try {
      const days = await readNotReadDays(PET, RANGE, false);
      expect([...days.entries()]).toEqual([['2026-09-10', 2]]);
    } finally {
      claim?.settle(false);
    }
    // Once nothing is reading it, a photo with no copy is not read either.
    const after = await readNotReadDays(PET, RANGE, false);
    expect(after.get('2026-09-15')).toBe(1);
  });

  it('counts nothing when the owner turned photo reading off: those rows are off, not unread', async () => {
    seedPhotos();
    expect([...(await readNotReadDays(PET, RANGE, true)).entries()]).toEqual([]);
  });

  it('never counts more than the day’s photographed rows', async () => {
    seedPhotos();
    const facts = await readHistoryFacts(PET, RANGE);
    for (const [day, n] of await readNotReadDays(PET, RANGE, false)) {
      expect(n).toBeLessThanOrEqual(facts.days.get(day)?.photographed ?? 0);
    }
  });
});

// ── The whole record, and the pill against the count line (AC 1) ────────────────

describe('readHistoryRecord', () => {
  const EVERY_FILTER: HistoryFilter[] = [
    { kind: 'all' },
    { kind: 'symptoms' },
    ...HISTORY_TYPE_KEYS.map((type): HistoryFilter => ({ kind: 'type', type })),
    { kind: 'course', courseKey: 'reg-mot' },
    { kind: 'photographed' },
    { kind: 'noted' },
  ];

  it('reads the record over All time, the courses and the read states, for the one today', async () => {
    seedRecord();
    const data = await readHistoryRecord(THE_PET, false, NOW);
    expect(data.petId).toBe(PET);
    expect(data.windowFacts.today).toBe(TODAY);
    expect(data.range).toEqual({ fromDay: '2026-05-14', toDay: TODAY });
    expect(data.courses?.map((c) => [c.key, c.name])).toEqual([['reg-mot', 'Motozol']]);
    // Two photographed vomits with no copy (Jun 1, Sep 18); the photographed weight expects no read.
    expect(data.notReadDays && [...data.notReadDays.entries()].sort()).toEqual([
      ['2026-06-01', 1],
      ['2026-09-18', 1],
    ]);
  });

  it('the pill counts what the count line counts, for every window and every filter (the real reads)', async () => {
    seedRecord();
    const data = await readHistoryRecord(THE_PET, false, NOW);
    const windows: HistoryWindowKey[] = [
      ...offeredWindows(data.windowFacts),
      ...monthGroups(data.windowFacts).flatMap((g) => g.months),
    ];
    expect(windows.length).toBeGreaterThan(8);
    const dates = historyDateFormatFor(TODAY);
    let named = 0;
    for (const key of windows) {
      const bounds = windowBounds(key, data.windowFacts) as DayRange;
      // The count line's own read: its facts over the window, not a slice of the record.
      const windowed = await readHistoryFacts(PET, bounds);
      for (const filter of EVERY_FILTER) {
        const pill = typePillOf({ filter, courses: data.courses ?? [], windowDays: daysIn(data.recordDays, bounds), showCounts: true });
        const lineTotal = windowTotalOf(windowed.days, filter);
        expect([key, filter, pill.count]).toEqual([key, filter, filter.kind === 'all' ? null : String(lineTotal?.count)]);
        const line = countLineOf({
          filter,
          search: null,
          window: { longName: 'window', anchorDay: null, isAllTime: false, isTrial: false, range: bounds, recordFrom: null, pastPlannedEnd: false },
          facts: windowed,
          course: filter.kind === 'course' ? { name: 'Motozol', days: (data.courses ?? [])[0].days } : null,
          trialRange: null,
          today: TODAY,
          dates,
        });
        // The count line names the same number the pill carries (or its absence, at 0).
        if (pill.count !== null && pill.count !== '0' && line.kind === 'count') {
          expect([key, filter, line.line1.strong.startsWith(pill.count)]).toEqual([key, filter, true]);
          named += 1;
        }
      }
    }
    // Non-vacuity: the comparison above ran over real, nonzero counts many times.
    expect(named).toBeGreaterThan(30);
  });

  it('unreadable courses and read states degrade to none; the numbers still answer', async () => {
    seedRecord();
    // The course names and the page's row read both join the drug library; the population does not.
    mockRaw.exec('DROP TABLE medication_items_cache');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const data = await readHistoryRecord(THE_PET, false, NOW);
    errors.mockRestore();
    expect(data.courses).toBeNull();
    expect(data.notReadDays).toBeNull();
    expect(windowTotalOf(data.recordDays, { kind: 'type', type: 'vomit' })?.count).toBe(3);
  });

  it('rejects when the record itself cannot be read', async () => {
    seedRecord();
    mockRaw.exec('DROP TABLE vet_visits');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readHistoryRecord(THE_PET, false, NOW)).rejects.toThrow();
    errors.mockRestore();
  });
});
