// History v2's reads against the REAL schema on node:sqlite (CUL-1161 / HV-4; spec §7 AC 8,
// 9, 30, 39 and the query half of AC 1). A column or JOIN typo in a raw query passes tsc and
// every mocked test and surfaces only on a device, so these run the production SQL over the
// production DDL (`BASE_SCHEMA_SQL` + `MEDICATION_SCHEMA_SQL` + the column upgrades).
//
// Instants are built from LOCAL components (B-514) and written in BOTH spellings a device
// holds (a local write's `…Z`, a hydrated row's `…+00:00`, C-40), so the non-UTC CI job
// decides which UTC day each row falls on and the reads must place every row on its LOCAL
// day regardless.

jest.mock('expo-file-system', () => ({ File: class {} }));
// Reached at import through feedingArrangements / sync / rundown; nothing here calls out.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

let mockRaw: InstanceType<typeof DatabaseSync>;
/** Every read the code under test issues, counted: how far back a page reads is a cost. */
let mockReads = 0;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => {
      mockReads += 1;
      return mockRaw.prepare(sql).all(...(params as never[]));
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) => {
      mockReads += 1;
      return mockRaw.prepare(sql).get(...(params as never[])) ?? null;
    },
    runAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));

import { getTimeline, type TimelineRow } from './db';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { dayCountFor, dayFactsOn, notInFullOf, shiftDay, type DayRange, type HistoryFilter } from './historyDays';
import {
  DAY_PAGE_MIN_ROWS,
  SEARCHED_FIELDS,
  SEARCH_READS_NOTES,
  escapeLike,
  readDayPage,
  readHistoryCourses,
  readHistoryFacts,
  readRecordDays,
  readRecordStartDay,
  readWholeDays,
  searchCondition,
  type DayPage,
  type DayPageScope,
  type HistoryRow,
} from './historyQueries';
import { toLocalDayKey } from './utils';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try {
      mockRaw.exec(sql);
    } catch {
      /* a table another schema constant owns: not one these reads touch */
    }
  });
});

// ── Fixture writers ────────────────────────────────────────────────────────────

/** Local wall-clock on 2026-09-`day` (B-514: from components, never a UTC literal). */
const localAt = (day: number, h: number, m = 0, s = 0) => new Date(2026, 8, day, h, m, s);
/** An instant as a hydrated row spells it (PostgREST's `+00:00`, no millis). */
const hydrated = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
const localDay = (iso: string) => toLocalDayKey(new Date(Date.parse(iso)));

function insertEvent(id: string, occurredAt: string, type: string, opts: { pet?: string; notes?: string | null; deleted?: boolean } = {}) {
  mockRaw
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, notes,
                           source, created_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, 'witnessed', ?, 'manual', ?, ?, ?, 1)`,
    )
    .run(id, opts.pet ?? PET, type, occurredAt, opts.notes ?? null, occurredAt, occurredAt, opts.deleted ? occurredAt : null);
}

function insertFood(id: string, brand: string, product: string, foodType = 'meal', format = 'dry_kibble') {
  mockRaw
    .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, ?, ?, ?, ?)`)
    .run(id, brand, product, format, foodType);
}

function insertMeal(eventId: string, occurredAt: string, foodId: string | null, rating: string | null = null, opts: { notes?: string | null } = {}) {
  insertEvent(eventId, occurredAt, 'meal', opts);
  mockRaw
    .prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, ?, ?)`)
    .run(`meal-${eventId}`, eventId, PET, foodId, rating);
}

function insertItem(id: string, generic: string, brand: string | null = null) {
  mockRaw.prepare(`INSERT INTO medication_items_cache (id, generic_name, brand_name) VALUES (?, ?, ?)`).run(id, generic, brand);
}

function insertRegimen(id: string, itemId: string | null, drugName: string, startedAt: string, status = 'active', endedAt: string | null = null) {
  mockRaw
    .prepare(
      `INSERT INTO medications (id, pet_id, medication_item_id, drug_name, started_at, status, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, PET, itemId, drugName, startedAt, status, endedAt);
}

function insertDose(eventId: string, occurredAt: string, opts: { regimen?: string | null; item?: string | null; adherence?: string | null } = {}) {
  insertEvent(eventId, occurredAt, 'medication');
  mockRaw
    .prepare(
      `INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, medication_item_id, adherence)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`dose-${eventId}`, eventId, PET, opts.regimen ?? null, opts.item ?? null, opts.adherence ?? null);
}

function insertPhoto(eventId: string, n = 1) {
  for (let i = 0; i < n; i++) {
    mockRaw
      .prepare(`INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path) VALUES (?, ?, ?, 'file://x', 'p/x')`)
      .run(`att-${eventId}-${i}`, eventId, PET);
  }
}

function insertLook(eventId: string, occurredAt: string, localDayKey: string, notes: string | null = null) {
  insertEvent(eventId, occurredAt, 'check_in');
  mockRaw
    .prepare(`INSERT INTO looks (id, event_id, pet_id, outcome, local_day, notes) VALUES (?, ?, ?, 'observed', ?, ?)`)
    .run(`look-${eventId}`, eventId, PET, localDayKey, notes);
}

const softDelete = (id: string) => mockRaw.prepare(`UPDATE events SET deleted_at = '2026-09-22T00:00:00.000Z' WHERE id = ?`).run(id);

const ALL: HistoryFilter = { kind: 'all' };
const scopeOf = (range: DayRange, filter: HistoryFilter = ALL, search: string | null = null): DayPageScope => ({ range, filter, search });

async function allPages(scope: DayPageScope): Promise<DayPage[]> {
  const pages: DayPage[] = [];
  let page = await readDayPage(PET, scope, null);
  pages.push(page);
  for (let guard = 0; page.next !== null && guard < 100; guard++) {
    page = await readDayPage(PET, scope, page.next);
    pages.push(page);
  }
  return pages;
}

const idsOf = (pages: readonly DayPage[]) => pages.flatMap((p) => p.days.flatMap((d) => d.rows.map((r) => r.id)));

// ── AC 8 — whole local days on a total order ────────────────────────────────────

describe('AC 8 — pages are whole local days; a seam loses nothing and repeats nothing', () => {
  const WINDOW: DayRange = { fromDay: '2026-09-01', toDay: '2026-09-21' };

  /** Ten rows a day on Sep 17–21 (page one ends on the 17th at exactly 50), then a sparse
   *  tail. Times rotate through both spellings; the seam carries a same-minute pair. */
  function seedDense(): { ids: Map<string, string> } {
    const ids = new Map<string, string>(); // id → local day
    const add = (id: string, at: Date, type = 'meal', spelled: 'z' | 'h' = 'z') => {
      const iso = spelled === 'z' ? at.toISOString() : hydrated(at);
      insertEvent(id, iso, type);
      ids.set(id, localDay(iso));
    };
    for (const day of [21, 20, 19, 18, 17]) {
      for (let i = 0; i < 10; i++) {
        // The 17th's first row is the late half of the seam pair.
        if (day === 17 && i === 0) add('seam-late', localAt(17, 0, 0, 10), 'vomit', 'h');
        else add(`r-${day}-${i}`, localAt(day, 1 + i * 2, 15), i % 3 === 0 ? 'vomit' : 'meal', i % 2 === 0 ? 'h' : 'z');
      }
    }
    add('seam-early', localAt(16, 23, 59, 50), 'vomit', 'z');
    add('r-16-1', localAt(16, 9), 'meal', 'h');
    add('r-16-2', localAt(16, 12), 'cough', 'z');
    for (let i = 0; i < 5; i++) add(`r-15-${i}`, localAt(15, 8 + i), 'meal', i % 2 === 0 ? 'z' : 'h');
    for (let i = 0; i < 4; i++) add(`r-13-${i}`, localAt(13, 8 + i), 'meal', 'h');
    add('r-11-0', localAt(11, 0, 0, 0), 'meal', 'h'); // exactly local midnight, hydrated spelling
    add('r-11-1', localAt(11, 23, 59, 59), 'meal', 'z');
    add('r-10-0', localAt(10, 7), 'vomit', 'h');
    // Outside the pet, and outside the population: never on a page.
    insertEvent('other-pet', localAt(18, 9).toISOString(), 'meal', { pet: OTHER_PET });
    insertEvent('deleted', localAt(18, 10).toISOString(), 'meal', { deleted: true });
    insertLook('look-18', localAt(18, 11).toISOString(), '2026-09-18');
    return { ids };
  }

  it('page one is whole days, newest first, and ends on the first day that brings it to 50', async () => {
    seedDense();
    const page = await readDayPage(PET, scopeOf(WINDOW), null);
    expect(page.days.map((d) => d.day)).toEqual(['2026-09-21', '2026-09-20', '2026-09-19', '2026-09-18', '2026-09-17']);
    expect(page.days.every((d) => d.rows.length === 10)).toBe(true);
    expect(page.days.reduce((n, d) => n + d.rows.length, 0)).toBe(DAY_PAGE_MIN_ROWS);
    expect(page.span).toEqual({ fromDay: '2026-09-17', toDay: '2026-09-21' });
    expect(page.next).toEqual({ beforeDay: '2026-09-17' });
  });

  it('every row lands on its LOCAL day, in both spellings, at both edges of a day (C-40)', async () => {
    const { ids } = seedDense();
    const pages = await allPages(scopeOf(WINDOW));
    for (const p of pages) for (const d of p.days) for (const r of d.rows) expect(ids.get(r.id)).toBe(d.day);
    const onEleven = pages.flatMap((p) => p.days).find((d) => d.day === '2026-09-11')!;
    expect(onEleven.rows.map((r) => r.id)).toEqual(['r-11-0', 'r-11-1']);
  });

  it('walking every page returns every row exactly once, day by day, the spans contiguous', async () => {
    const { ids } = seedDense();
    const pages = await allPages(scopeOf(WINDOW));
    const seen = idsOf(pages);
    expect(new Set(seen).size).toBe(seen.length); // nothing repeated
    expect([...seen].sort()).toEqual([...ids.keys()].sort()); // nothing lost, nothing extra
    // No day on two pages; days strictly newest first across the walk.
    const days = pages.flatMap((p) => p.days.map((d) => d.day));
    expect(days).toEqual([...days].sort().reverse());
    expect(new Set(days).size).toBe(days.length);
    // Each page accounts for the days down to where the next one starts.
    for (let i = 0; i + 1 < pages.length; i++) {
      expect(pages[i + 1].span!.toDay).toBe(shiftDay(pages[i].span!.fromDay, -1));
    }
    expect(pages[pages.length - 1].span!.fromDay).toBe(WINDOW.fromDay);
    expect(pages[pages.length - 1].next).toBeNull();
  });

  it('a same-minute pair across the seam: one row on each page, neither lost nor repeated', async () => {
    seedDense();
    const pages = await allPages(scopeOf(WINDOW));
    const pageOf = (id: string) => pages.findIndex((p) => p.days.some((d) => d.rows.some((r) => r.id === id)));
    expect(pageOf('seam-late')).toBe(0);
    expect(pageOf('seam-early')).toBe(1);
    expect(idsOf(pages).filter((id) => id.startsWith('seam-'))).toHaveLength(2);
    // And the count line counts the pair once, whatever the paging: the facts do not page.
    const facts = await readHistoryFacts(PET, WINDOW);
    expect(facts.duplicates.byType.vomit).toBe(1);
    // The facts name the pet they were read for, so a consumer can tell one pet's facts
    // from another's that share a window's dates (CUL-1165).
    expect(facts.petId).toBe(PET);
  });

  it('rows in a day run morning to night on (occurred_at, id): a same-instant pair never swaps', async () => {
    insertEvent('tie-b', localAt(12, 9).toISOString(), 'meal');
    insertEvent('tie-a', hydrated(localAt(12, 9)), 'meal');
    insertEvent('later', localAt(12, 10).toISOString(), 'meal');
    insertEvent('earlier', hydrated(localAt(12, 8)), 'meal');
    const page = await readDayPage(PET, scopeOf(WINDOW), null);
    expect(page.days[0].rows.map((r) => r.id)).toEqual(['earlier', 'tie-a', 'tie-b', 'later']);
  });

  it('a removal between two page loads never shifts a later page', async () => {
    seedDense();
    const scope = scopeOf(WINDOW);
    const first = await readDayPage(PET, scope, null);
    const secondBefore = await readDayPage(PET, scope, first.next);
    // One row gone from the page already read, one from the page about to be read.
    softDelete('r-19-3');
    softDelete('r-15-2');
    const secondAfter = await readDayPage(PET, scope, first.next);
    expect(secondAfter.days.map((d) => d.day)).toEqual(secondBefore.days.map((d) => d.day));
    expect(idsOf([secondAfter])).toEqual(idsOf([secondBefore]).filter((id) => id !== 'r-15-2'));
    expect(secondAfter.span).toEqual(secondBefore.span);
  });

  it('a row written between loads onto a day already shown never reappears on a later page', async () => {
    seedDense();
    const scope = scopeOf(WINDOW);
    const first = await readDayPage(PET, scope, null);
    // Back-dated onto the 17th, before the page's own first row that day.
    insertEvent('late-write', localAt(17, 0, 0, 1).toISOString(), 'meal');
    const second = await readDayPage(PET, scope, first.next);
    expect(idsOf([second])).not.toContain('late-write');
    expect(second.days.every((d) => d.day < '2026-09-17')).toBe(true);
  });

  it('a page never reaches outside the window, and a cursor past its start ends the list', async () => {
    seedDense();
    const page = await readDayPage(PET, scopeOf({ fromDay: '2026-09-18', toDay: '2026-09-19' }), null);
    expect(page.days.map((d) => d.day)).toEqual(['2026-09-19', '2026-09-18']);
    expect(page.next).toBeNull();
    const past = await readDayPage(PET, scopeOf({ fromDay: '2026-09-18', toDay: '2026-09-19' }), { beforeDay: '2026-09-18' });
    expect(past).toEqual({ days: [], span: null, next: null });
  });

  it('an empty scope accounts for its whole window in one page', async () => {
    const page = await readDayPage(PET, scopeOf(WINDOW), null);
    expect(page).toEqual({ days: [], span: WINDOW, next: null });
  });

  it('a sparse record reaches back past the first chunk and still returns whole days', async () => {
    insertEvent('recent', localAt(21, 9).toISOString(), 'meal');
    insertEvent('month-ago', new Date(2026, 7, 20, 9).toISOString(), 'meal');
    insertEvent('long-ago', new Date(2026, 1, 3, 9).toISOString(), 'meal');
    const page = await readDayPage(PET, scopeOf({ fromDay: '2026-01-01', toDay: '2026-09-21' }), null);
    expect(page.days.map((d) => d.day)).toEqual(['2026-09-21', '2026-08-20', '2026-02-03']);
    expect(page.next).toBeNull();
    expect(page.span).toEqual({ fromDay: '2026-01-01', toDay: '2026-09-21' });
  });

  it('rejects a malformed range rather than reading nothing (C-12)', async () => {
    await expect(readDayPage(PET, scopeOf({ fromDay: '2026-9-1', toDay: '2026-09-21' }), null)).rejects.toThrow(/not a day range/);
  });
});

// ── The richer record: filters, search, facts, courses ──────────────────────────

const RANGE: DayRange = { fromDay: '2026-09-01', toDay: '2026-09-21' };

function seedRich() {
  insertFood('rc', 'Royal Canin', 'Selected Protein PR', 'meal', 'dry_kibble');
  insertFood('rabbit', 'Natural Balance', 'L.I.D. Rabbit', 'meal', 'wet_canned');
  insertFood('pct', 'Pro Plan', 'Savory 50% Protein', 'meal', 'dry_kibble');
  insertFood('p50', 'Pro Plan', 'Savory 50 Protein', 'meal', 'dry_kibble');
  insertFood('bits', 'Temptations', 'Salmon_Bits', 'treat', 'treat');
  insertFood('bits2', 'Temptations', 'Salmon Bits', 'treat', 'treat');
  insertFood('slash', 'Odd', 'Back\\slash', 'treat', 'treat');
  insertItem('item-pred', 'prednisolone', 'Prednis-Tab');
  insertItem('item-cet', 'cetirizine HCl', null);
  insertRegimen('reg-pred', 'item-pred', 'Prednisone', '2026-09-04');
  insertRegimen('reg-free', null, 'Metronidazole (compounded)', '2026-09-06', 'completed', '2026-09-08');

  insertMeal('m1', localAt(2, 8).toISOString(), 'rc', 'all');
  insertMeal('m2', hydrated(localAt(2, 18)), 'rabbit', 'some', { notes: 'ate half, then left it' });
  insertEvent('v1', hydrated(localAt(3, 7, 10)), 'vomit', { notes: 'rabbit came back up' });
  insertPhoto('v1', 2);
  insertEvent('v2', localAt(3, 7, 10, 30).toISOString(), 'vomit');
  insertMeal('m3', localAt(4, 8).toISOString(), 'pct', 'refused');
  insertMeal('m4', localAt(4, 12).toISOString(), 'p50', 'most');
  insertMeal('t1', localAt(4, 15).toISOString(), 'bits', 'refused');
  insertMeal('t2', localAt(4, 16).toISOString(), 'bits2', 'all');
  insertMeal('t3', localAt(4, 17).toISOString(), 'slash', 'all');
  insertDose('d1', localAt(5, 9).toISOString(), { regimen: 'reg-pred', item: 'item-pred', adherence: 'given' });
  insertDose('d2', localAt(6, 9).toISOString(), { regimen: 'reg-pred', item: 'item-pred', adherence: 'refused' });
  insertDose('d3', localAt(7, 9).toISOString(), { regimen: 'reg-free', item: null, adherence: 'partial' });
  insertDose('d4', localAt(9, 9).toISOString(), { item: 'item-cet', adherence: null });
  insertEvent('dia', localAt(9, 13).toISOString(), 'diarrhea');
  insertPhoto('dia');
  insertEvent('other1', localAt(10, 13).toISOString(), 'other', { notes: '   ' }); // whitespace is not a note
  insertEvent('w1', localAt(10, 14).toISOString(), 'weight_check', { notes: 'after the walk' });
  insertLook('look-10', localAt(10, 21).toISOString(), '2026-09-10', 'rabbit mention in a look note');
  insertLook('look-12', localAt(12, 21).toISOString(), '2026-09-12');
  insertEvent('gone', localAt(12, 9).toISOString(), 'vomit', { deleted: true });
}

const FILTERS: HistoryFilter[] = [
  { kind: 'all' },
  { kind: 'symptoms' },
  { kind: 'type', type: 'vomit' },
  { kind: 'type', type: 'meal' },
  { kind: 'type', type: 'medication' },
  { kind: 'type', type: 'other' },
  { kind: 'course', courseKey: 'reg-pred' },
  { kind: 'course', courseKey: 'reg-free' },
  { kind: 'course', courseKey: 'item:item-cet' },
  { kind: 'photographed' },
  { kind: 'noted' },
  { kind: 'noticed' },
];

describe('AC 1 + AC 9, the query halves — one population behind the list and the numbers', () => {
  it.each(FILTERS.map((f) => [JSON.stringify(f), f] as const))('%s: each day\'s rows = the facts\' day count', async (_label, filter) => {
    seedRich();
    const [pages, facts] = await Promise.all([allPages(scopeOf(RANGE, filter)), readHistoryFacts(PET, RANGE)]);
    const rowsByDay = new Map(pages.flatMap((p) => p.days).map((d) => [d.day, d.rows.length]));
    if (filter.kind === 'noticed') {
      // Noticed counts nothing; its rows sit on exactly the days the facts mark as looked.
      expect([...rowsByDay.keys()].sort()).toEqual([...facts.days.values()].filter((f) => f.looked).map((f) => f.day).sort());
      return;
    }
    for (const f of facts.days.values()) expect(rowsByDay.get(f.day) ?? 0).toBe(dayCountFor(f, filter));
    for (const [day, n] of rowsByDay) expect(dayCountFor(dayFactsOn(facts.days, day), filter)).toBe(n);
  });

  it('a filter only hides rows: every row it shows is the same row All types shows', async () => {
    seedRich();
    const everything = new Map<string, HistoryRow>(
      (await allPages(scopeOf(RANGE))).flatMap((p) => p.days.flatMap((d) => d.rows)).map((r) => [r.id, r]),
    );
    for (const filter of FILTERS.filter((f) => f.kind !== 'noticed')) {
      for (const r of (await allPages(scopeOf(RANGE, filter))).flatMap((p) => p.days.flatMap((d) => d.rows))) {
        expect(r).toEqual(everything.get(r.id));
      }
    }
    for (const r of (await allPages(scopeOf(RANGE, ALL, 'rabbit'))).flatMap((p) => p.days.flatMap((d) => d.rows))) {
      expect(r).toEqual(everything.get(r.id));
    }
  });

  it('a row says what getTimeline says, column for column (v1 and v2 agree)', async () => {
    seedRich();
    const v1 = new Map((await getTimeline(PET, 500, 0, null, null)).map((r) => [r.id, r]));
    const rows = (await allPages(scopeOf(RANGE))).flatMap((p) => p.days.flatMap((d) => d.rows));
    expect(rows.length).toBeGreaterThan(15);
    for (const r of rows) {
      const old = v1.get(r.id)!;
      for (const key of Object.keys(old) as (keyof TimelineRow)[]) expect(r[key]).toEqual(old[key]);
    }
  });

  it('the population leaves out looks, other pets\' rows and removed rows', async () => {
    seedRich();
    insertEvent('elsewhere', localAt(3, 9).toISOString(), 'vomit', { pet: OTHER_PET });
    const ids = idsOf(await allPages(scopeOf(RANGE)));
    expect(ids).not.toContain('look-10');
    expect(ids).not.toContain('gone');
    expect(ids).not.toContain('elsewhere');
    const facts = await readHistoryFacts(PET, RANGE);
    expect([...facts.days.values()].reduce((n, f) => n + f.total, 0)).toBe(ids.length);
  });
});

describe('HV-7 — the whole day behind a filtered page, and the record\'s first day', () => {
  it('readWholeDays: every row of each asked day, the same rows All types pages hold, nothing from another day', async () => {
    seedRich();
    const everything = (await allPages(scopeOf(RANGE))).flatMap((p) => p.days);
    const byDay = new Map(everything.map((d) => [d.day, d.rows]));
    // A vomit filter shows Sep 3 only; its whole day is the two vomits, and Sep 4 (scattered,
    // not consecutive) comes back whole too: a run of one.
    const days = [localDay(localAt(3, 7, 10).toISOString()), localDay(localAt(9, 9).toISOString())];
    const whole = await readWholeDays(PET, days);
    expect([...whole.keys()].sort()).toEqual([...days].sort());
    for (const day of days) expect(whole.get(day)).toEqual(byDay.get(day));
  });

  it('readWholeDays: runs of consecutive days read once per run, and a day with nothing is simply absent', async () => {
    seedRich();
    mockReads = 0;
    const whole = await readWholeDays(PET, ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-10', '2026-09-15']);
    // The regimens, then one read per run: Sep 4 – 6, Sep 10, Sep 15.
    expect(mockReads).toBe(4);
    expect(whole.has('2026-09-15')).toBe(false);
    expect(whole.get('2026-09-04')?.map((r) => r.id)).toEqual(['m3', 'm4', 't1', 't2', 't3']);
    // The look on Sep 10 is not in the population: the Noticed filter draws its own rows.
    expect(whole.get('2026-09-10')?.map((r) => r.id)).toEqual(['other1', 'w1']);
    expect(await readWholeDays(PET, [])).toEqual(new Map());
  });

  it('readRecordStartDay: the facts\' own record start, over both spellings of an instant; a look never starts it', async () => {
    seedRich();
    // An earlier look must not move the record's start (§5.6).
    insertLook('look-early', localAt(1, 7).toISOString(), '2026-09-01');
    const facts = await readHistoryFacts(PET, RANGE);
    expect(await readRecordStartDay(PET)).toBe(facts.firsts.record);
    expect(await readRecordStartDay(PET)).toBe('2026-09-02');
    // A hydrated row at exactly local midnight is on its own day, never the day before.
    insertEvent('midnight', hydrated(localAt(1, 0, 0, 0)), 'cough');
    expect(await readRecordStartDay(PET)).toBe('2026-09-01');
  });

  it('readRecordStartDay: null for a pet with nothing logged, and removed rows never start a record', async () => {
    insertEvent('gone-early', localAt(1, 9).toISOString(), 'vomit', { deleted: true });
    expect(await readRecordStartDay(PET)).toBeNull();
  });
});

describe('the facts — flags, looks, firsts, duplicates', () => {
  it('photos, notes and doses read as the page reads them', async () => {
    seedRich();
    const facts = await readHistoryFacts(PET, RANGE);
    expect(dayFactsOn(facts.days, '2026-09-03')).toMatchObject({ total: 2, photographed: 1, noted: 1, byType: { vomit: 2 } });
    // Whitespace is not a note; a weight's note is.
    expect(dayFactsOn(facts.days, '2026-09-10')).toMatchObject({ total: 2, noted: 1, looked: true });
    expect(dayFactsOn(facts.days, '2026-09-05').doses).toEqual({ 'reg-pred': { logged: 1, notInFull: 0 } });
    expect(dayFactsOn(facts.days, '2026-09-06').doses).toEqual({ 'reg-pred': { logged: 1, notInFull: 1 } });
    expect(dayFactsOn(facts.days, '2026-09-07').doses).toEqual({ 'reg-free': { logged: 1, notInFull: 1 } });
    expect(dayFactsOn(facts.days, '2026-09-09').doses).toEqual({ 'item:item-cet': { logged: 1, notInFull: 0 } });
  });

  it('the doses not given in full are rows the dose filters list: Partial, Missed or Refused, never unrated (CUL-1193)', async () => {
    seedRich();
    const facts = await readHistoryFacts(PET, RANGE);
    const listed = async (filter: HistoryFilter) =>
      (await allPages(scopeOf(RANGE, filter))).flatMap((p) => p.days.flatMap((d) => d.rows));
    const shortOf = (rows: readonly HistoryRow[]) =>
      rows.filter((r) => r.adherence === 'partial' || r.adherence === 'missed' || r.adherence === 'refused').length;
    const medication: HistoryFilter = { kind: 'type', type: 'medication' };
    // d2 refused and d3 partial; d1 given and d4 unrated are counted and never named.
    expect(notInFullOf(facts.days, medication)).toBe(2);
    expect(shortOf(await listed(medication))).toBe(2);
    for (const courseKey of ['reg-pred', 'reg-free', 'item:item-cet']) {
      const course: HistoryFilter = { kind: 'course', courseKey };
      expect(notInFullOf(facts.days, course)).toBe(shortOf(await listed(course)));
    }
    expect(notInFullOf(facts.days, { kind: 'course', courseKey: 'item:item-cet' })).toBe(0);
  });

  it('meals not finished: the intake lens\'s own (Some and Refused count; a treat never does)', async () => {
    seedRich();
    const facts = await readHistoryFacts(PET, RANGE);
    expect(dayFactsOn(facts.days, '2026-09-02').mealsNotFinished).toBe(1);
    expect(dayFactsOn(facts.days, '2026-09-04').mealsNotFinished).toBe(1);
  });

  it('a free-fed food\'s meal is never "not finished" (the intake lens\'s exclusion)', async () => {
    seedRich();
    mockRaw
      .prepare(`INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, active_from) VALUES ('fa', ?, 'rabbit', 'free_choice', '2026-09-01')`)
      .run(PET);
    // getActiveArrangementsForPet joins the food cache; the rabbit food is cached above.
    const facts = await readHistoryFacts(PET, RANGE);
    expect(dayFactsOn(facts.days, '2026-09-02').mealsNotFinished).toBe(0);
  });

  it('the record\'s first days are parsed instants, both spellings, at the exact local midnight', async () => {
    insertEvent('first', hydrated(localAt(2, 0, 0, 0)), 'meal');
    insertEvent('first-photo', localAt(3, 0, 0, 0).toISOString(), 'vomit');
    insertPhoto('first-photo');
    insertEvent('first-note', hydrated(localAt(4, 0, 0, 0)), 'cough', { notes: 'dry, honking' });
    insertLook('first-look', localAt(1, 20).toISOString(), '2026-09-01');
    const { firsts } = await readHistoryFacts(PET, RANGE);
    expect(firsts).toEqual({
      record: '2026-09-02',
      look: '2026-09-01',
      byType: { meal: '2026-09-02', vomit: '2026-09-03', cough: '2026-09-04' },
      symptoms: '2026-09-03',
      photographed: '2026-09-03',
      noted: '2026-09-04',
    });
  });

  it('a look never starts the record, and a removed row never does either', async () => {
    insertLook('look-first', localAt(1, 20).toISOString(), '2026-09-01');
    insertEvent('removed-first', localAt(1, 21).toISOString(), 'meal', { deleted: true });
    insertEvent('real-first', localAt(5, 9).toISOString(), 'meal');
    const { firsts } = await readHistoryFacts(PET, RANGE);
    expect(firsts.record).toBe('2026-09-05');
  });

  it('duplicates read the slack: a pair straddling the window\'s start counts nothing inside it', async () => {
    insertEvent('before', localAt(9, 23, 59, 50).toISOString(), 'cough');
    insertEvent('in-1', hydrated(localAt(10, 0, 0, 40)), 'cough');
    insertEvent('in-2', localAt(10, 0, 1, 0).toISOString(), 'cough');
    const facts = await readHistoryFacts(PET, { fromDay: '2026-09-10', toDay: '2026-09-21' });
    expect(facts.duplicates.total).toBe(0);
    expect(dayFactsOn(facts.days, '2026-09-10').total).toBe(2);
    expect(facts.days.has('2026-09-09')).toBe(false);
  });
});

// HV-9's pinned row reads only the days (CUL-1228: the duplicates pass is most of the
// whole-record read's cost, and the row never shows them). The two reads must never
// disagree about a day, or the pill and the count line would print two numbers.
describe('readRecordDays — the facts\' days, and nothing else', () => {
  it('reads exactly the days readHistoryFacts reads, over any window', async () => {
    seedRich();
    insertEvent('before', localAt(9, 23, 59, 50).toISOString(), 'cough');
    insertEvent('seam', hydrated(localAt(10, 0, 0, 40)), 'cough');
    const windows: DayRange[] = [RANGE, { fromDay: '2026-09-10', toDay: '2026-09-21' }, { fromDay: '2026-09-05', toDay: '2026-09-05' }];
    for (const range of windows) {
      const [days, facts] = await Promise.all([readRecordDays(PET, range), readHistoryFacts(PET, range)]);
      expect(days.size).toBeGreaterThan(0);
      expect([range, days]).toEqual([range, facts.days]);
    }
  });

  it('the record\'s first day is the facts\' first day (the window table\'s All time)', async () => {
    seedRich();
    expect(await readRecordStartDay(PET)).toBe((await readHistoryFacts(PET, RANGE)).firsts.record);
    expect(await readRecordStartDay(OTHER_PET)).toBeNull();
  });
});

// ── Search (§3.7) ───────────────────────────────────────────────────────────────

describe('search — named fields, wildcards escaped, never a note (AC 39)', () => {
  const found = async (term: string, filter: HistoryFilter = ALL) =>
    idsOf(await allPages(scopeOf(RANGE, filter, term))).sort();

  it('finds a food by brand or product, any case', async () => {
    seedRich();
    expect(await found('royal')).toEqual(['m1']);
    expect(await found('L.I.D. RABBIT')).toEqual(['m2']);
  });

  it('escapes %, _ and the escape character: each finds only itself', async () => {
    seedRich();
    expect(await found('50%')).toEqual(['m3']);
    expect(await found('n_B')).toEqual(['t1']);
    expect(await found('k\\s')).toEqual(['t3']);
    expect(escapeLike('50%_\\')).toBe('50\\%\\_\\\\');
  });

  it('finds a dose by the drug\'s generic or brand name, and by its regimen\'s name when it has no item', async () => {
    seedRich();
    expect(await found('prednisolone')).toEqual(['d1', 'd2']);
    expect(await found('prednis-tab')).toEqual(['d1', 'd2']);
    expect(await found('compounded')).toEqual(['d3']);
    expect(await found('cetirizine')).toEqual(['d4']);
  });

  it('finds rows by their type\'s label', async () => {
    seedRich();
    expect(await found('loose')).toEqual(['dia']);
    expect(await found('weight')).toEqual(['w1']);
  });

  it('is one more condition on the filter\'s query: search and filter both hold', async () => {
    seedRich();
    expect(await found('pro plan', { kind: 'type', type: 'meal' })).toEqual(['m3', 'm4']);
    expect(await found('pro plan', { kind: 'type', type: 'vomit' })).toEqual([]);
  });

  it('never reads a note: a row whose only mention is its note is not found (AC 39)', async () => {
    seedRich();
    // v1's note says "rabbit came back up", m2's "ate half"; a look's note says "rabbit".
    expect(await found('rabbit')).toEqual(['m2']);
    expect(await found('came back up')).toEqual([]);
    expect(await found('walk')).toEqual([]);
    expect(await found('rabbit', { kind: 'noticed' })).toEqual([]);
  });

  it('never borrows another pet\'s course name: not on the row, not in a search (CUL-1124)', async () => {
    seedRich();
    mockRaw
      .prepare(`INSERT INTO medications (id, pet_id, medication_item_id, drug_name, started_at, status) VALUES ('reg-theirs', ?, NULL, 'Gabapentin compound', '2026-09-01', 'active')`)
      .run(OTHER_PET);
    insertDose('d-cross', localAt(11, 9).toISOString(), { regimen: 'reg-theirs', item: null, adherence: 'given' });
    const rows = (await allPages(scopeOf(RANGE))).flatMap((p) => p.days.flatMap((d) => d.rows));
    expect(rows.find((r) => r.id === 'd-cross')).toMatchObject({ regimen_drug_name: null, course_key: 'item:unspecified' });
    expect(await found('gabapentin')).toEqual([]);
  });

  it('SEARCH_READS_NOTES is false and no searched field is a note, until CUL-848 (HV-16 flips both)', () => {
    expect(SEARCH_READS_NOTES).toBe(false);
    expect(SEARCHED_FIELDS.some((f) => /note/i.test(f))).toBe(false);
    expect(searchCondition('x')!.sql).not.toMatch(/note/i);
  });

  it('an empty or blank search is no condition at all', () => {
    expect(searchCondition('')).toBeNull();
    expect(searchCondition('   ')).toBeNull();
    expect(searchCondition(null)).toBeNull();
  });
});

// ── Courses ─────────────────────────────────────────────────────────────────────

describe('readHistoryCourses — the vet report\'s course grain, named and bounded', () => {
  it('names a regimen by its own name, a course of doses by its drug, and bounds each', async () => {
    seedRich();
    const courses = await readHistoryCourses(PET);
    const byKey = new Map(courses.map((c) => [c.key, c]));
    expect(byKey.get('reg-pred')).toMatchObject({
      name: 'Prednisone', source: 'regimen', isActive: true, startedDay: '2026-09-04', days: { fromDay: '2026-09-04', toDay: null },
    });
    expect(byKey.get('reg-free')).toMatchObject({
      name: 'Metronidazole (compounded)', isActive: false, days: { fromDay: '2026-09-06', toDay: '2026-09-08' },
    });
    expect(byKey.get('item:item-cet')).toMatchObject({
      name: 'cetirizine HCl', source: 'doses', startedDay: null, days: { fromDay: '2026-09-09', toDay: '2026-09-09' },
    });
  });

  it('a recent course pages from its own first dose, not back through older courses\' years', async () => {
    insertItem('item-old', 'metronidazole', 'Flagyl');
    insertItem('item-new', 'maropitant', 'Cerenia');
    insertRegimen('reg-old', 'item-old', 'Flagyl', '2025-03-01', 'completed', '2025-03-20');
    insertRegimen('reg-new', 'item-new', 'Cerenia', '2026-09-18');
    for (let d = 1; d <= 20; d++) insertDose(`old-${d}`, new Date(2025, 2, d, 9).toISOString(), { regimen: 'reg-old', item: 'item-old', adherence: 'given' });
    for (let d = 18; d <= 21; d++) insertDose(`new-${d}`, localAt(d, 9).toISOString(), { regimen: 'reg-new', item: 'item-new', adherence: 'given' });
    const scope = scopeOf({ fromDay: '2025-01-01', toDay: '2026-09-21' }, { kind: 'course', courseKey: 'reg-new' });
    mockReads = 0;
    const page = await readDayPage(PET, scope, null);
    expect(page.days.map((d) => d.day)).toEqual(['2026-09-21', '2026-09-20', '2026-09-19', '2026-09-18']);
    expect(page.span).toEqual({ fromDay: '2025-01-01', toDay: '2026-09-21' });
    expect(page.next).toBeNull();
    // The regimens, the course's own first dose, one week's rows. Floored at the earliest dose
    // of ANY course, the same page walked back through a year and a half of empty chunks.
    expect(mockReads).toBeLessThanOrEqual(3);
  });

  it('every dose row on a page carries the key its course carries', async () => {
    seedRich();
    const keys = new Set((await readHistoryCourses(PET)).map((c) => c.key));
    const doses = (await allPages(scopeOf(RANGE))).flatMap((p) => p.days.flatMap((d) => d.rows)).filter((r) => r.event_type === 'medication');
    expect(doses.map((r) => r.course_key).sort()).toEqual(['item:item-cet', 'reg-free', 'reg-pred', 'reg-pred']);
    for (const r of doses) expect(keys.has(r.course_key!)).toBe(true);
    // A dose with no library item still names its course (GAP-25).
    expect(doses.find((r) => r.id === 'd3')).toMatchObject({ drug_generic_name: null, regimen_drug_name: 'Metronidazole (compounded)' });
  });
});
