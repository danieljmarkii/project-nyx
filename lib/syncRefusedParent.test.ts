// CUL-1986 — a meal, weigh-in or look edit reaches the server even when its log's own edit
// was refused.
//
// The three drains used to wait on `e.synced = 1`, which a refused event never reaches, so
// a meal re-rated to refused (an intake signal) stayed on this phone for good even when the
// log's earlier version was on the server and the rating would land. They now hold a child
// only while its log is still waiting to land (`parentLandedSql`); behind a refused log the
// child goes up and takes its own answer. This file drives the production drains in
// lib/sync.ts over the runtime schema in node:sqlite, against an emulated server that
// refuses what the real one refuses:
//
//   • meals / weight_checks → events: a plain foreign key (001, 024), 23503, which is NOT
//     terminal on this client unless the child's log is refused here;
//   • looks → events: 064's trg_looks_same_pet, which needs the parent to be a check_in it
//     can see; 23514, terminal;
//   • an event named in `refuse` is refused outright, as a client ahead of its enum
//     migration is (22P02, terminal).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;
type ServerError = { code?: string; message: string };
type ServerAnswer = { data: { id: string }[] | null; error: ServerError | null };

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

const mockServer = {
  rows: new Map<string, Map<string, Row>>(),
  /** Every write request the server received, in order, with the ids it carried. */
  writes: [] as { table: string; ids: string[] }[],
  /** An event named here (by id) is refused with this. */
  refuse: new Map<string, ServerError>(),
  /** Runs once, after the server has answered a single-row write to the named table and
   *  before the client sees the answer: what happens on the phone in the network gap. */
  inGap: new Map<string, () => Promise<void>>(),
};

function mockServerTable(table: string): Map<string, Row> {
  if (!mockServer.rows.has(table)) mockServer.rows.set(table, new Map());
  return mockServer.rows.get(table)!;
}

function mockServerRefusal(table: string, row: Row): ServerError | null {
  const refused = mockServer.refuse.get(String(row.id));
  if (refused) return refused;
  const parent = row.event_id == null ? null : mockServerTable('events').get(String(row.event_id));
  if (table === 'meals' && row.food_item_id != null && !mockServerTable('food_items').has(String(row.food_item_id))) {
    return {
      code: '23503',
      message: 'insert or update on table "meals" violates foreign key constraint "meals_food_item_id_fkey"',
    };
  }
  if (table === 'meals' || table === 'weight_checks') {
    if (!parent) {
      return {
        code: '23503',
        message: `insert or update on table "${table}" violates foreign key constraint "${table}_event_id_fkey"`,
      };
    }
  }
  if (table === 'looks' && (!parent || parent.pet_id !== row.pet_id || parent.event_type !== 'check_in')) {
    return { code: '23514', message: 'looks: event_id must reference a check_in for the same pet' };
  }
  return null;
}

/** One upsert statement: every row lands, or none does. */
function mockServerWrite(table: string, payload: Row[]): ServerAnswer {
  mockServer.writes.push({ table, ids: payload.map((r) => String(r.id)) });
  for (const row of payload) {
    const refused = mockServerRefusal(table, row);
    if (refused) return { data: null, error: refused };
  }
  for (const row of payload) mockServerTable(table).set(String(row.id), { ...row });
  return { data: payload.map((r) => ({ id: String(r.id) })), error: null };
}

function mockServerFrom(table: string) {
  return {
    upsert: (payload: Row | Row[]) => ({
      select: async () => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const answer = mockServerWrite(table, rows);
        const gap = rows.length === 1 ? mockServer.inGap.get(table) : undefined;
        if (gap) {
          mockServer.inGap.delete(table);
          await gap();
        }
        return answer;
      },
    }),
    // The weigh-in drain's best-effort pets.weight_kg reconcile; nothing here reads it.
    update: () => ({ eq: async () => ({ error: null }) }),
  };
}

function mockAdapter() {
  const db = () => {
    if (!mockLocal.db) throw new Error('no local database');
    return mockLocal.db;
  };
  return {
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db().prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllAsync: async (sql: string, params: unknown[] = []) => db().prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      db().prepare(sql).get(...(params as never[])) ?? null,
    execAsync: async (sql: string) => {
      db().exec(sql);
    },
  };
}

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockAdapter() }));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockServerFrom(table),
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { quarantineCountSql, unsentForSignalSql } from './syncQueue';
import { syncPendingEvents, syncPendingLooks, syncPendingMeals, syncPendingWeightChecks } from './sync';

const PET = 'pet-1';
const T0 = '2026-10-18T08:00:00.000Z';
const T1 = '2026-10-18T09:00:00.000Z';
const T2 = '2026-10-18T10:00:00.000Z';
/** What a refused log carries: the server refused its latest edit for good. */
const REFUSED_EVENT: ServerError = { code: '22P02', message: 'invalid input value for enum event_type' };

/** Insert a row, filling every required column the caller did not name. */
function insert(table: string, values: Row): void {
  const db = mockLocal.db!;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string; type: string; notnull: number; dflt_value: unknown;
  }[];
  const row: Row = {};
  for (const c of cols) {
    if (c.notnull && c.dflt_value === null) row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : `${c.name}-x`;
  }
  for (const c of cols) if (c.name === 'created_at' || c.name === 'updated_at') row[c.name] = T0;
  Object.assign(row, values);
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(
    ...keys.map((k) => row[k] as never),
  );
}

const localRow = (table: string, id: string) =>
  mockLocal.db!.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row;
const writesTo = (table: string) => mockServer.writes.filter((w) => w.table === table).map((w) => w.ids);
const unsent = () => (mockLocal.db!.prepare(unsentForSignalSql()).get() as { count: number }).count;
const quarantined = () => (mockLocal.db!.prepare(quarantineCountSql()).get() as { count: number }).count;

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.rows.clear();
  mockServer.writes.length = 0;
  mockServer.refuse.clear();
  mockServer.inGap.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

const CHILDREN = [
  { table: 'meals', eventType: 'meal', drain: syncPendingMeals, refusal: '23503' },
  { table: 'weight_checks', eventType: 'weight_check', drain: syncPendingWeightChecks, refusal: '23503' },
  { table: 'looks', eventType: 'check_in', drain: syncPendingLooks, refusal: '23514' },
] as const;

describe.each(CHILDREN)('the $table drain behind its log', ({ table, eventType, drain, refusal }) => {
  /** A log on this phone; `server` puts a version of it on the emulated server too. */
  function log(id: string, local: { synced: number; sync_error?: string | null }, server: boolean): void {
    insert('events', { id, pet_id: PET, event_type: eventType, sync_error: null, ...local });
    if (server) mockServerTable('events').set(id, { id, pet_id: PET, event_type: eventType });
  }
  const child = (id: string, eventId: string, values: Row = {}) =>
    insert(table, { id, event_id: eventId, pet_id: PET, synced: 0, sync_error: null, ...values });

  it('sends the edit behind a refused log whose earlier version is on the server, and it lands', async () => {
    log('e-refused', { synced: 0, sync_error: formatRefusal() }, true);
    child('c1', 'e-refused');
    expect(unsent()).toBe(1); // it can still send, so the Signal waits on it
    await drain();
    expect(writesTo(table)).toEqual([['c1']]);
    expect(localRow(table, 'c1')).toMatchObject({ synced: 1, sync_error: null });
    expect(unsent()).toBe(0);
  });

  it(`behind a refused log the server never saw, takes its own ${refusal} on the first try, counted as stuck`, async () => {
    log('e-refused', { synced: 0, sync_error: formatRefusal() }, false);
    log('e-landed', { synced: 1 }, true);
    child('c-orphaned', 'e-refused');
    child('c-good', 'e-landed');
    await drain();
    // The refusal is isolated: the sibling behind a landed log lands in the same cycle.
    expect(localRow(table, 'c-good')).toMatchObject({ synced: 1 });
    const row = localRow(table, 'c-orphaned');
    expect(row).toMatchObject({ synced: 0 });
    expect(String(row.sync_error)).toMatch(new RegExp(`^${refusal}`));
    // Out of the Signal's unsent flag and into the stuck count: no retry is coming.
    expect(unsent()).toBe(0);
    expect(quarantined()).toBe(2); // the log and its child
    // And it is not re-sent: the next cycle asks the server nothing.
    mockServer.writes.length = 0;
    await drain();
    expect(writesTo(table)).toEqual([]);
  });

  it('holds the child of a log still waiting to land: no request at all', async () => {
    log('e-waiting', { synced: 0 }, false);
    child('c1', 'e-waiting');
    await drain();
    expect(writesTo(table)).toEqual([]);
    expect(localRow(table, 'c1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    expect(unsent()).toBe(2);
  });

  it('sends the held child once its log lands', async () => {
    log('e-waiting', { synced: 0 }, false);
    child('c1', 'e-waiting');
    await syncPendingEvents();
    await drain();
    expect(localRow(table, 'c1')).toMatchObject({ synced: 1 });
  });

  if (refusal === '23503') {
    it('keeps the ordinary budget for a 23503 behind a log that is not refused here', async () => {
      // A log this phone holds as landed but the server lacks: the wait may still end (a
      // hydration, another device), so the 23503 costs one attempt, never a quarantine.
      log('e-missing', { synced: 1 }, false);
      child('c1', 'e-missing');
      await drain();
      expect(localRow(table, 'c1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 1 });
    });
  }

  if (table === 'meals') {
    it("keeps the ordinary budget for a 23503 on the meal's FOOD, even behind a refused log", async () => {
      // The food pre-sync may land next cycle; parking the meal on it would strand a rating
      // that could reach the server. The log's earlier version is there, so only the food is
      // missing. (The pre-sync itself is not exercised: the food cache is empty.)
      log('e-refused', { synced: 0, sync_error: formatRefusal() }, true);
      child('c1', 'e-refused', { food_item_id: 'food-not-yet-on-server' });
      await drain();
      expect(localRow(table, 'c1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 1 });
    });
  }

  it('does not park the child when its log is fixed and lands while the refusal is in flight', async () => {
    // Adversarial review, this PR: the re-arm runs when the log lands, and this child was
    // not parked yet, so parking it on the stale answer would strand it for good.
    log('e-refused', { synced: 0, sync_error: formatRefusal() }, false);
    log('e-landed', { synced: 1 }, true);
    child('c1', 'e-refused');
    child('c-good', 'e-landed'); // makes the batch fail and isolate, so c1 goes alone
    mockServer.inGap.set(table, async () => {
      mockLocal.db!.prepare(
        `UPDATE events SET updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE id = 'e-refused'`,
      ).run(T2);
      await syncPendingEvents();
    });
    await drain();
    expect(localRow('events', 'e-refused')).toMatchObject({ synced: 1 });
    // Not parked: the ordinary budget, and the next drain sends it after its log.
    expect(localRow(table, 'c1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 1 });
    await drain();
    expect(localRow(table, 'c1')).toMatchObject({ synced: 1 });
  });

  describe('when the refused log is fixed and lands', () => {
    beforeEach(async () => {
      log('e-fixed', { synced: 0, sync_error: formatRefusal() }, false);
      log('e-other', { synced: 0, sync_error: formatRefusal() }, false);
      child('c-fixed', 'e-fixed', { updated_at: T1 });
      child('c-other', 'e-other', { updated_at: T1 });
      await drain();
      expect(localRow(table, 'c-fixed').sync_error).not.toBeNull();
      // The owner edits the log: the write-path contract re-arms it.
      mockLocal.db!.prepare(
        `UPDATE events SET updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE id = 'e-fixed'`,
      ).run(T2);
      await syncPendingEvents();
    });

    it('gives its child a fresh try, and the child lands', async () => {
      expect(localRow('events', 'e-fixed')).toMatchObject({ synced: 1 });
      // Re-armed, not rewritten: the version markSynced compares and the server's LWW
      // reads is still the owner's.
      expect(localRow(table, 'c-fixed')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0, updated_at: T1 });
      await drain();
      expect(localRow(table, 'c-fixed')).toMatchObject({ synced: 1 });
    });

    it('leaves a child parked for a fault of its own', async () => {
      log('e-own', { synced: 0, sync_error: formatRefusal() }, true);
      child('c-own', 'e-own', { sync_error: '42501: new row violates row-level security policy', sync_attempts: 25 });
      mockLocal.db!.prepare(
        `UPDATE events SET updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE id = 'e-own'`,
      ).run(T2);
      await syncPendingEvents();
      expect(localRow('events', 'e-own')).toMatchObject({ synced: 1 });
      expect(localRow(table, 'c-own')).toMatchObject({ sync_attempts: 25 });
      expect(String(localRow(table, 'c-own').sync_error)).toMatch(/^42501/);
    });

    it("leaves another log's stuck child alone", async () => {
      expect(String(localRow(table, 'c-other').sync_error)).toMatch(new RegExp(`^${refusal}`));
    });
  });
});

function formatRefusal(): string {
  return `${REFUSED_EVENT.code}: ${REFUSED_EVENT.message}`;
}

it('a meal and its floor marker behind a refused log stop pinning the Signal within one cycle', async () => {
  // EN-4's re-check marker waits on its event's meal (floorTriggerLandedSql). Before CUL-1986
  // that meal was held for good, and so was the marker; now the meal is answered at once.
  insert('events', { id: 'e1', pet_id: PET, event_type: 'meal', synced: 0, sync_error: formatRefusal() });
  insert('meals', { id: 'm1', event_id: 'e1', pet_id: PET, synced: 0, sync_error: null });
  insert('incident_floor_queue', { id: 'f1', event_id: 'e1', pet_id: PET, synced: 0, sync_error: null });
  expect(unsent()).toBe(2);
  await syncPendingMeals();
  expect(String(localRow('meals', 'm1').sync_error)).toMatch(/^23503/);
  // The marker is released (its own drain may now send it) and still counts until it goes.
  expect(unsent()).toBe(1);
});
