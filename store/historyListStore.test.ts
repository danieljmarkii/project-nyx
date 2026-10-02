// History v2's list store (CUL-1164 / HV-7): one read behind every number, stale answers
// dropped, the depth a refresh keeps, the pages, the landing's reach, the pet it follows.
//
// Over the REAL reads on `node:sqlite` (the `lib/historyQueries.test.ts` harness): what the
// store holds is what the app would read from this record. Days are local keys anchored to
// today, rows built from local components (C-29, B-514). A gate holds reads in flight, so an
// ordering is asserted rather than hoped for.

jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/sync', () => ({
  syncPendingEvents: jest.fn(),
  syncPendingFeedingArrangements: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
  syncPendingVetVisits: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
let mockRaw: InstanceType<typeof DatabaseSync>;
let mockGate: Promise<void> | null = null;
let mockFail = false;
/** When set, a read of the verdict copy answers what it read NOW but only once released: an
 *  old answer that lands after a newer one. */
let mockHoldVerdicts = false;
const mockHeldVerdicts: (() => void)[] = [];
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => {
      if (mockGate) await mockGate;
      if (mockFail) throw new Error('disk I/O error');
      const rows = mockRaw.prepare(sql).all(...(params as never[]));
      if (mockHoldVerdicts && sql.includes('event_ai_verdicts')) await new Promise<void>((r) => mockHeldVerdicts.push(r));
      return rows;
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) => {
      if (mockGate) await mockGate;
      if (mockFail) throw new Error('disk I/O error');
      return mockRaw.prepare(sql).get(...(params as never[])) ?? null;
    },
    runAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));

// The page read, held on demand: a next-page read kept in flight while a load replaces its
// snapshot around it. Only `readDayPage` waits, so the load can land while the page cannot.
let mockHoldPages = false;
const mockHeldPages: (() => void)[] = [];
jest.mock('../lib/historyQueries', () => {
  const actual = jest.requireActual<typeof import('../lib/historyQueries')>('../lib/historyQueries');
  return {
    ...actual,
    readDayPage: async (...args: Parameters<typeof actual.readDayPage>) => {
      if (mockHoldPages) await new Promise<void>((r) => mockHeldPages.push(r));
      return actual.readDayPage(...args);
    },
  };
});

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from '../lib/localSchema';
import { MEDICATION_SCHEMA_SQL } from '../lib/medications';
import { DIET_TRIAL_SCHEMA_SQL } from '../lib/dietTrialMirror';
import { shiftDay } from '../lib/historyDays';
import { dayKeyToLocalDate, toLocalDayKey } from '../lib/utils';
import { usePetStore, type Pet } from './petStore';
import { defaultHistoryScope, type HistoryScope } from './historyScopeStore';
import { historyRequestKey, mergePages, snapshotForScope, useHistoryListStore } from './historyListStore';

const TODAY = toLocalDayKey(new Date());
const dayAgo = (n: number) => shiftDay(TODAY, -n);
function at(n: number, h: number, m = 0): string {
  const d = dayKeyToLocalDate(dayAgo(n)) as Date;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const PET_A: Pet = {
  id: 'pa', name: 'Nyx', species: 'dog', breed: null, date_of_birth: null, date_of_birth_precision: 'exact',
  sex: 'female', weight_kg: null, photo_path: null,
};
const PET_B: Pet = { ...PET_A, id: 'pb', name: 'Mochi', species: 'cat' };

function insertEvent(id: string, occurredAt: string, type: string, pet = PET_A.id) {
  mockRaw
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, source, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, 'witnessed', 'manual', ?, ?, 1)`,
    )
    .run(id, pet, type, occurredAt, occurredAt, occurredAt);
}

/** `perDay` coughs a day for `days` days back from today: enough rows for several pages. */
function seedDays(days: number, perDay: number, pet = PET_A.id) {
  for (let n = 0; n < days; n++) {
    for (let i = 0; i < perDay; i++) insertEvent(`${pet}-${n}-${i}`, at(n, 0, i + 1), 'cough', pet);
  }
}

const scopeFor = (petId: string, over: Partial<HistoryScope> = {}): HistoryScope => ({ ...defaultHistoryScope(petId), ...over });
const store = () => useHistoryListStore.getState();

beforeEach(async () => {
  mockGate = null;
  mockFail = false;
  mockHoldPages = false;
  mockHeldPages.splice(0).forEach((release) => release());
  mockHoldVerdicts = false;
  mockHeldVerdicts.splice(0).forEach((release) => release());
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  mockRaw.exec(DIET_TRIAL_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try {
      mockRaw.exec(sql);
    } catch {
      /* a column another constant already carries */
    }
  });
  usePetStore.setState({ pets: [PET_A, PET_B], activePet: PET_A });
  store().reset();
});

describe('a load: one snapshot, every read together', () => {
  it('draws the window, the facts, the first page and the whole days behind it', async () => {
    seedDays(3, 2);
    expect(await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY })).toBe('drawn');
    const snap = store().snapshot!;
    expect(snap.petId).toBe(PET_A.id);
    expect(snap.resolved.bounds).toEqual({ fromDay: dayAgo(2), toDay: TODAY });
    expect([...snap.facts.days.values()].reduce((n, f) => n + f.total, 0)).toBe(6);
    expect(snap.pages.days.map((d) => d.day)).toEqual([TODAY, dayAgo(1), dayAgo(2)]);
    // Under All types the page IS the whole day: the same rows, no second read.
    for (const d of snap.pages.days) expect(snap.wholeDays.get(d.day)).toBe(d.rows);
    expect(snapshotForScope(snap, scopeFor(PET_A.id), TODAY)).toBe(snap);
  });

  it('the window facts belong to the request\'s day while the real clock is past midnight (HV-9\'s assembly)', async () => {
    // A visit today anchors nothing today; tomorrow it is "the last vet visit". Facts read
    // for the real clock's day would carry today's visit under today's key.
    seedDays(1, 1);
    const visit = mockRaw.prepare('INSERT INTO vet_visits (id, pet_id, visited_at) VALUES (?, ?, ?)');
    visit.run('vv-old', PET_A.id, dayAgo(10));
    visit.run('vv-today', PET_A.id, TODAY);
    const tomorrow = dayKeyToLocalDate(shiftDay(TODAY, 1)) as Date;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(tomorrow.getTime() + 30_000);
    try {
      expect(await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY })).toBe('drawn');
    } finally {
      clock.mockRestore();
    }
    const { windowFacts } = store().snapshot!;
    expect(windowFacts.today).toBe(TODAY);
    expect(windowFacts.sinceVisit).toBe(dayAgo(10));
  });

  it('under a filter, every shown day\'s WHOLE day is read too (R-2)', async () => {
    seedDays(2, 2);
    insertEvent('v1', at(1, 9), 'vomit');
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id, { filter: { kind: 'type', type: 'vomit' } }), today: TODAY });
    const snap = store().snapshot!;
    expect(snap.pages.days.map((d) => d.rows.map((r) => r.id))).toEqual([['v1']]);
    expect(snap.wholeDays.get(dayAgo(1))?.map((r) => r.id)).toEqual(['pa-1-0', 'pa-1-1', 'v1']);
  });

  it('the reads: asked for every row the pipeline can draw one on, a formed stool included', async () => {
    // The one gate is the pipeline's (`mayCarryRead`, HV-6): a formed stool tints "other",
    // never a symptom, and analyze-stool still writes a Worth-a-call read for one.
    insertEvent('st', at(1, 8), 'stool_normal');
    insertEvent('vo', at(1, 9), 'vomit');
    insertEvent('co', at(1, 10), 'cough');
    insertEvent('me', at(1, 11), 'meal');
    const verdict = mockRaw.prepare(
      `INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES (?, 'completed', 'worth_a_call', ?)`,
    );
    verdict.run('st', at(1, 8, 30));
    verdict.run('vo', at(1, 9, 30));
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const { analysis, answered } = store().snapshot!;
    expect(analysis.get('st')?.recommendation).toBe('worth_a_call');
    expect(analysis.get('vo')?.recommendation).toBe('worth_a_call');
    expect(analysis.has('co')).toBe(false);
    // Answered for every readable row, a row with no read included; never asked for a meal.
    expect([...answered].sort()).toEqual(['co', 'st', 'vo']);
  });

  it('a look that fails answers nothing: the last answer stands, and a row it never answered claims no photo', async () => {
    // HV-6's contract (TodayCard the template): "no read on this phone" and "could not look"
    // are two answers, and a failed look must never draw a photo nobody read.
    insertEvent('vo', at(1, 9), 'vomit');
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('vo', 'completed', 'worth_a_call', ?)`)
      .run(at(1, 9, 30));
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('worth_a_call');
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRaw.exec('ALTER TABLE event_ai_verdicts RENAME TO event_ai_verdicts_gone');
    insertEvent('v2', at(1, 12), 'vomit');
    await store().load(req);
    expect(warned).toHaveBeenCalled();
    // The rose already drawn stays drawn (CUL-1198); the new vomit was never answered.
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('worth_a_call');
    expect(store().snapshot!.answered.has('vo')).toBe(true);
    expect(store().snapshot!.answered.has('v2')).toBe(false);
    // The same through a read landing.
    await store().refreshReads();
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('worth_a_call');
    warned.mockRestore();
  });

  it('a fresh answer always wins, a calm over a rose included', async () => {
    insertEvent('vo', at(1, 9), 'vomit');
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('vo', 'completed', 'worth_a_call', ?)`)
      .run(at(1, 9, 30));
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    mockRaw.prepare(`UPDATE event_ai_verdicts SET recommendation = 'monitor' WHERE event_id = 'vo'`).run();
    await store().refreshReads();
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('monitor');
  });

  it('an older look that lands after a newer one never overwrites it (TodayCard\'s order)', async () => {
    insertEvent('vo', at(1, 9), 'vomit');
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('vo', 'completed', 'monitor', ?)`)
      .run(at(1, 9, 30));
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    // An older look reads the calm and is held; the copy then flips to a rose, and a newer
    // look reads and lands it.
    mockHoldVerdicts = true;
    const older = store().refreshReads();
    for (let i = 0; i < 50 && mockHeldVerdicts.length < 1; i++) await new Promise((r) => setTimeout(r, 0));
    mockHoldVerdicts = false;
    mockRaw.prepare(`UPDATE event_ai_verdicts SET recommendation = 'worth_a_call' WHERE event_id = 'vo'`).run();
    await store().refreshReads();
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('worth_a_call');
    mockHeldVerdicts.splice(0).forEach((release) => release());
    await older;
    expect(store().snapshot!.analysis.get('vo')?.recommendation).toBe('worth_a_call');
  });

  it('a removed row\'s read leaves with it on the next reload', async () => {
    insertEvent('vo', at(1, 9), 'vomit');
    insertEvent('co', at(1, 10), 'cough');
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('vo', 'completed', 'worth_a_call', ?)`)
      .run(at(1, 9, 30));
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    expect(store().snapshot!.analysis.has('vo')).toBe(true);
    mockRaw.prepare(`UPDATE events SET deleted_at = ? WHERE id = 'vo'`).run(new Date().toISOString());
    await store().load(req);
    expect(store().snapshot!.analysis.has('vo')).toBe(false);
  });

  it('a failed read is a state for its request, and a retry that succeeds takes it down', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    seedDays(1, 1);
    mockFail = true;
    const scope = scopeFor(PET_A.id);
    expect(await store().load({ pet: PET_A, scope, today: TODAY })).toBe('failed');
    expect(store().failedRequest).toBe(historyRequestKey(TODAY, scope));
    expect(store().snapshot).toBeNull();
    expect(logged).toHaveBeenCalledWith('[history] load failed:', expect.any(Error));
    mockFail = false;
    expect(await store().load({ pet: PET_A, scope, today: TODAY })).toBe('drawn');
    expect(store().failedRequest).toBeNull();
    logged.mockRestore();
  });
});

describe('a read that answers for another scope or pet is dropped (CUL-1120, AC 12)', () => {
  it('an older load that answers last never overwrites a newer one', async () => {
    seedDays(3, 1);
    let release: () => void = () => {};
    mockGate = new Promise<void>((r) => {
      release = r;
    });
    const older = store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const newer = store().load({ pet: PET_A, scope: scopeFor(PET_A.id, { filter: { kind: 'type', type: 'cough' } }), today: TODAY });
    mockGate = null;
    release();
    expect(await older).toBe('superseded');
    expect(await newer).toBe('drawn');
    expect(store().snapshot?.filter).toEqual({ kind: 'type', type: 'cough' });
  });

  it('a switch drops the snapshot at once, and a load still in flight for the old pet lands nowhere', async () => {
    seedDays(2, 1);
    seedDays(1, 1, PET_B.id);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    expect(store().snapshot?.petId).toBe(PET_A.id);
    let release: () => void = () => {};
    mockGate = new Promise<void>((r) => {
      release = r;
    });
    const inFlight = store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    usePetStore.setState({ activePet: PET_B });
    // Inside the pet store's own update: no frame can see A's rows under B.
    expect(store().snapshot).toBeNull();
    mockGate = null;
    release();
    expect(await inFlight).toBe('superseded');
    expect(store().snapshot).toBeNull();
  });

  it('a load made for a pet that is no longer the active one lands nowhere, even with no newer load', async () => {
    seedDays(1, 1);
    usePetStore.setState({ activePet: PET_B });
    // A caller holding the old pet and its old scope (a stale closure): no load follows it,
    // so only the fresh active-pet check at commit can refuse it.
    expect(await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY })).toBe('superseded');
    expect(store().snapshot).toBeNull();
  });

  it('sign-out (the active pet cleared) drops the record from memory', async () => {
    seedDays(1, 1);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    usePetStore.setState({ activePet: null });
    expect(store().snapshot).toBeNull();
  });

  it('snapshotForScope: another pet, day, window, filter or search is not this snapshot', async () => {
    seedDays(2, 1);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const snap = store().snapshot;
    expect(snapshotForScope(snap, scopeFor(PET_A.id), TODAY)).toBe(snap);
    expect(snapshotForScope(snap, scopeFor(PET_B.id), TODAY)).toBeNull();
    expect(snapshotForScope(snap, scopeFor(PET_A.id), dayAgo(-1))).toBeNull();
    expect(snapshotForScope(snap, scopeFor(PET_A.id, { window: { kind: 'last', days: 7 } }), TODAY)).toBeNull();
    expect(snapshotForScope(snap, scopeFor(PET_A.id, { filter: { kind: 'symptoms' } }), TODAY)).toBeNull();
    expect(snapshotForScope(snap, scopeFor(PET_A.id, { searchOpen: true, searchText: 'x' }), TODAY)).toBeNull();
    // The landed day and the strip's week change no row: the snapshot still answers.
    expect(snapshotForScope(snap, scopeFor(PET_A.id, { landedDay: dayAgo(1), stripWeek: dayAgo(3) }), TODAY)).toBe(snap);
  });
});

describe('pages: whole days, the depth a refresh keeps, the landing\'s reach', () => {
  it('the next page appends whole days and extends the span', async () => {
    seedDays(12, 10);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const first = store().snapshot!;
    expect(first.pages.next).not.toBeNull();
    await store().loadMore();
    const second = store().snapshot!;
    expect(second.pages.days.length).toBeGreaterThan(first.pages.days.length);
    expect(second.pages.span!.fromDay < first.pages.span!.fromDay).toBe(true);
    expect(second.pages.span!.toDay).toBe(first.pages.span!.toDay);
    // No day twice, newest first.
    const days = second.pages.days.map((d) => d.day);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort().reverse()).toEqual(days);
  });

  it('a re-read keeps the depth the list reached WHILE it read: a landing never loses the day it jumped to', async () => {
    seedDays(20, 10);
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    const first = store().snapshot!.pages.span!.fromDay;
    // A reload (a focus, a sync tick) starts and holds its first page read...
    mockHoldPages = true;
    const reload = store().load(req);
    for (let i = 0; i < 50 && mockHeldPages.length < 1; i++) await new Promise((r) => setTimeout(r, 0));
    const reloadPage = mockHeldPages.shift()!;
    mockHoldPages = false;
    // ...while a landing pages the list on screen past the depth the reload set out to keep.
    const day = shiftDay(first, -2);
    expect(await store().ensureDay(day)).toBe(true);
    reloadPage();
    expect(await reload).toBe('drawn');
    expect(store().snapshot!.pages.span!.fromDay <= day).toBe(true);
    // Every loaded day still has its whole day behind it.
    for (const d of store().snapshot!.pages.days) expect(store().snapshot!.wholeDays.has(d.day)).toBe(true);
  });

  it('a re-read of the same scope keeps the depth the owner scrolled to', async () => {
    seedDays(12, 10);
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    await store().loadMore();
    const deep = store().snapshot!.pages.span!.fromDay;
    await store().load(req);
    expect(store().snapshot!.pages.span!.fromDay <= deep).toBe(true);
  });

  it('two calls for the next page share one read', async () => {
    seedDays(12, 10);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const a = store().loadMore();
    const b = store().loadMore();
    expect(a).toBe(b);
    await a;
  });

  it('a page call for a newer snapshot never joins a read made for an older one', async () => {
    seedDays(12, 10);
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    mockHoldPages = true;
    const stale = store().loadMore();
    mockHoldPages = false;
    // A refresh replaces the snapshot while that page is still reading.
    await store().load(req);
    const fresh = store().loadMore();
    expect(fresh).not.toBe(stale);
    // So a landing across the refresh pages the snapshot on screen and reaches its day.
    expect(await store().ensureDay(dayAgo(11))).toBe(true);
    mockHeldPages.splice(0).forEach((release) => release());
    await Promise.all([stale, fresh]);
  });

  it('the page slot is released by identity: an older read finishing never frees a newer one (C-24)', async () => {
    seedDays(12, 10);
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    mockHoldPages = true;
    const stale = store().loadMore();
    mockHoldPages = false;
    await store().load(req);
    const before = store().snapshot!.pages.span!.fromDay;
    mockHoldPages = true;
    const fresh = store().loadMore();
    mockHoldPages = false;
    mockHeldPages.shift()!();
    await stale;
    // The newer read still holds the slot, so a second call joins it rather than reading twice.
    expect(store().loadMore()).toBe(fresh);
    mockHeldPages.shift()!();
    await fresh;
    expect(store().snapshot!.pages.span!.fromDay < before).toBe(true);
  });

  it('a landing asked for one pet ends at a switch: the next pet\'s list is never paged for it', async () => {
    seedDays(12, 10);
    seedDays(12, 10, PET_B.id);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    mockHoldPages = true;
    const landing = store().ensureDay(dayAgo(11));
    mockHoldPages = false;
    usePetStore.setState({ activePet: PET_B });
    await store().load({ pet: PET_B, scope: scopeFor(PET_B.id), today: TODAY });
    const first = store().snapshot!.pages.span!.fromDay;
    mockHeldPages.splice(0).forEach((release) => release());
    expect(await landing).toBe(false);
    expect(store().snapshot!.petId).toBe(PET_B.id);
    expect(store().snapshot!.pages.span!.fromDay).toBe(first);
  });

  it('a read landing mid-page keeps the page: it lands on the snapshot the read replaced', async () => {
    seedDays(12, 10);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const before = store().snapshot!.pages.span!.fromDay;
    mockHoldPages = true;
    const page = store().loadMore();
    mockHoldPages = false;
    await store().refreshReads();
    mockHeldPages.splice(0).forEach((release) => release());
    await page;
    expect(store().snapshot!.pages.span!.fromDay < before).toBe(true);
    expect(store().more).toBeNull();
  });

  it('a page read for a snapshot a load replaced lands nowhere', async () => {
    seedDays(12, 10);
    const req = { pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY };
    await store().load(req);
    let release: () => void = () => {};
    mockGate = new Promise<void>((r) => {
      release = r;
    });
    const page = store().loadMore();
    const reload = store().load({ ...req, scope: scopeFor(PET_A.id, { filter: { kind: 'type', type: 'cough' } }) });
    mockGate = null;
    release();
    await Promise.all([page, reload]);
    expect(store().snapshot!.filter).toEqual({ kind: 'type', type: 'cough' });
    expect(store().more).toBeNull();
  });

  it('a failed page is said at the foot of the snapshot it was for', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    seedDays(12, 10);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    const snap = store().snapshot;
    mockFail = true;
    await store().loadMore();
    expect(store().more).toEqual({ of: snap!.pages, state: 'failed' });
    expect(logged).toHaveBeenCalledWith('[history] next page failed:', expect.any(Error));
    logged.mockRestore();
  });

  it('ensureDay pages back until the day is loaded, and says when it cannot be', async () => {
    seedDays(12, 10);
    await store().load({ pet: PET_A, scope: scopeFor(PET_A.id), today: TODAY });
    expect(await store().ensureDay(dayAgo(11))).toBe(true);
    expect(store().snapshot!.pages.span!.fromDay <= dayAgo(11)).toBe(true);
    // Before the record: every page is read and the day is still not in the list.
    expect(await store().ensureDay(dayAgo(40))).toBe(false);
  });

  it('mergePages: contiguous pages, the later one\'s days after the earlier\'s', () => {
    const merged = mergePages(
      { days: [{ day: '2026-09-21', rows: [] }], span: { fromDay: '2026-09-20', toDay: '2026-09-21' }, next: { beforeDay: '2026-09-20' } },
      { days: [{ day: '2026-09-18', rows: [] }], span: { fromDay: '2026-09-15', toDay: '2026-09-19' }, next: null },
    );
    expect(merged).toEqual({
      days: [{ day: '2026-09-21', rows: [] }, { day: '2026-09-18', rows: [] }],
      span: { fromDay: '2026-09-15', toDay: '2026-09-21' },
      next: null,
    });
  });
});

describe('the shared day', () => {
  it('setToday writes only a change', () => {
    const before = store();
    store().setToday(TODAY);
    store().setToday(TODAY);
    expect(store().today).toBe(TODAY);
    expect(before.snapshot).toBe(store().snapshot);
  });
});
