// Vet contacts PR-03 (CUL-2765): the local mirror, the sync and the exam-only readers, driven
// for real over node:sqlite built from the app's own schema constants and column upgrades,
// with the production write path, push and hydrate (C-39: no mock narrower than the API).
//
// What it pins (spec AC 3, 4, 5, 6 and §5.1):
//   • a phone contact is written, pushed and hydrated WITH its channel and time: a push
//     that dropped the column would land the row as the server's default, an EXAM;
//   • the rehydrate fill corrects a synced row an older build stored as 'in_clinic';
//   • *Also about* writes one independent row per pet;
//   • every exam reader on the phone answers Sep 18 for a Sep 18 visit plus a Nov 9 phone
//     contact, on Nov 14;
//   • the flag-off differential (C-36): over the rows a flag-off build can write (every row
//     'in_clinic'), each filtered reader answers exactly what the unfiltered query does, so
//     the filter is invisible until a contact exists.
//
// Day keys are local calendar days and every `now` is built from LOCAL components (C-29), so
// each case means the same under the non-UTC CI clocks.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };
const mockServer = {
  /** Every row the server holds, by table and id. */
  rows: new Map<string, Map<string, Row>>(),
  /** Every upsert payload the server received, in order. */
  upserts: [] as { table: string; rows: Row[] }[],
  /** Tables whose READ answers an error (CUL-2842's prior read failing). */
  readFails: new Set<string>(),
  /** Tables whose upsert answers a network error, so nothing lands. */
  upsertFails: new Set<string>(),
  /** Tables whose upsert COMMITS and then loses its response (a timeout after the write). */
  upsertLosesResponse: new Set<string>(),
};

function mockServerTable(table: string): Map<string, Row> {
  if (!mockServer.rows.has(table)) mockServer.rows.set(table, new Map());
  return mockServer.rows.get(table)!;
}

/** A PostgREST builder: `upsert().select()` lands rows; a read chain answers the table. */
function mockServerFrom(table: string) {
  const read: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'in', 'not', 'lte', 'lt', 'limit', 'neq']) {
    read[m] = () => read;
  }
  read.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(
      mockServer.readFails.has(table)
        ? { data: null, error: { message: 'network' } }
        : { data: [...mockServerTable(table).values()], error: null },
    ).then(res, rej);
  read.maybeSingle = async () => ({ data: null, error: null });
  read.upsert = (payload: Row | Row[]) => {
    const rows = Array.isArray(payload) ? payload : [payload];
    const land = () => {
      if (mockServer.upsertFails.has(table)) return { data: null, error: { message: 'network' } };
      mockServer.upserts.push({ table, rows });
      for (const r of rows) {
        const prior = mockServerTable(table).get(String(r.id));
        // A column absent from the payload keeps its value, or the server default for a new
        // row: exactly what migration 122's DEFAULT 'in_clinic' does to a push that omits it.
        mockServerTable(table).set(String(r.id), {
          ...(table === 'vet_visits' ? { channel: 'in_clinic', contacted_at: null } : {}),
          ...prior,
          ...r,
        });
      }
      if (mockServer.upsertLosesResponse.has(table)) return { data: null, error: { message: 'timeout' } };
      return { data: rows.map((r) => ({ id: String(r.id) })), error: null };
    };
    return { select: async () => land(), then: (res: (v: unknown) => unknown) => Promise.resolve(land()).then(res) };
  };
  return read;
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
    getFirstAsync: async (sql: string, params: unknown[] = []) => db().prepare(sql).get(...(params as never[])) ?? null,
    execAsync: async (sql: string) => {
      db().exec(sql);
    },
    withTransactionAsync: async (cb: () => Promise<void>) => {
      db().exec('BEGIN');
      try {
        await cb();
        db().exec('COMMIT');
      } catch (e) {
        db().exec('ROLLBACK');
        throw e;
      }
    },
  };
}

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockAdapter() }));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockServerFrom(table),
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'n/a' } }) }) },
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
// CUL-2842: the Signal rebuild is the observable. Everything else in the module stays real.
const mockRegen = jest.fn();
jest.mock('./signal', () => ({
  ...jest.requireActual('./signal'),
  triggerSignalRegenDebounced: (petId: string) => mockRegen(petId),
}));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { getDb } from './db';
import { hydrateFromCloud, syncPendingVetVisits } from './sync';
import { logVetVisit, readVisitConsequence, readVisitPrefill, updateVisitDetails, visitMovedNearBuild } from './vetVisits';
import { latestVisitBefore, readLatestVisitBefore, readVisitDaysBefore } from './visitWindow';
import { readCareQuestionRecord } from './careAnswers';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';
/** Nov 14, midday, built from LOCAL components (C-29). */
const NOV_14 = new Date(2026, 10, 14, 12, 0, 0);
const TODAY = '2026-11-14';

const localRow = (id: string) => mockLocal.db!.prepare('SELECT * FROM vet_visits WHERE id = ?').get(id) as Row;
const localRows = () =>
  mockLocal.db!.prepare('SELECT * FROM vet_visits ORDER BY pet_id, visited_at').all() as Row[];

/** Insert a synced visit row directly, as a hydrate from an earlier day would have left it. */
function seedVisit(over: Row): void {
  const r: Row = {
    id: 'v', pet_id: PET, visited_at: '2026-09-18', clinic_name: 'Riverside', vet_name: 'Dr. Chen',
    reason: 'GI', notes: null, next_visit_at: '2026-12-01', deleted_at: null, channel: 'in_clinic',
    contacted_at: null, created_at: '2026-09-18T15:00:00.000Z', updated_at: '2026-09-18T15:00:00.000Z',
    synced: 1, ...over,
  };
  const cols = Object.keys(r);
  mockLocal.db!.prepare(`INSERT INTO vet_visits (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...(cols.map((c) => r[c]) as never[]));
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.rows.clear();
  mockServer.upserts.length = 0;
  mockServer.readFails.clear();
  mockServer.upsertFails.clear();
  mockServer.upsertLosesResponse.clear();
  mockRegen.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

describe('the local mirror (§5.1)', () => {
  it('a fresh install carries channel (nullable, NO default: unknown is never an exam) and contacted_at', () => {
    const cols = (mockLocal.db!.prepare('PRAGMA table_info(vet_visits)').all() as { name: string; dflt_value: string | null; notnull: number }[]);
    const channel = cols.find((c) => c.name === 'channel');
    expect(channel).toMatchObject({ notnull: 0, dflt_value: null });
    expect(cols.some((c) => c.name === 'contacted_at')).toBe(true);
  });

  it('AC 5 on an upgrading phone: a row written before the column reads UNKNOWN until the re-pull', async () => {
    // An upgrading phone: the table as an earlier build made it, holding a visit, then the
    // upgrade path adds the column.
    const old = new DatabaseSync(':memory:');
    old.exec(`CREATE TABLE vet_visits (id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, visited_at TEXT NOT NULL,
      clinic_name TEXT, vet_name TEXT, reason TEXT, notes TEXT, next_visit_at TEXT, deleted_at TEXT,
      created_at TEXT, updated_at TEXT, synced INTEGER NOT NULL DEFAULT 0, sync_attempts INTEGER NOT NULL DEFAULT 0, sync_error TEXT)`);
    old.prepare(`INSERT INTO vet_visits (id, pet_id, visited_at) VALUES ('old', ?, '2026-03-02')`).run(PET);
    const added = await applyColumnUpgrades(async (sql) => {
      if (/vet_visits/.test(sql)) old.exec(sql);
    });
    expect(added.filter((u) => u.table === 'vet_visits').map((u) => [u.column, u.rehydrate])).toEqual(
      expect.arrayContaining([['channel', true], ['contacted_at', true]]),
    );
    // Not 'in_clinic': the phone has not learned it. The server row reads in_clinic (migration
    // 122's default), and the rehydrate this upgrade re-arms writes that back (below).
    expect(old.prepare(`SELECT channel, contacted_at FROM vet_visits WHERE id = 'old'`).get()).toEqual({
      channel: null, contacted_at: null,
    });
    old.close();
  });
});

describe('the write (logVetVisit)', () => {
  it('names the channel on every write: no channel given is in_clinic, no time', async () => {
    const id = await logVetVisit({ petId: PET, visitedAt: '2026-09-18', now: NOV_14 });
    expect(localRow(id)).toMatchObject({ channel: 'in_clinic', contacted_at: null, synced: 0 });
  });

  it('AC 3: a phone contact writes its channel and the time as a UTC instant', async () => {
    const at = new Date(2026, 10, 9, 16, 40, 0); // 4:40pm local on Nov 9
    const id = await logVetVisit({
      petId: PET, visitedAt: '2026-11-09', channel: 'phone', contactedAt: at.toISOString(), now: NOV_14,
    });
    expect(localRow(id)).toMatchObject({ channel: 'phone', contacted_at: at.toISOString(), visited_at: '2026-11-09' });
  });

  it('refuses a channel the server would refuse, and a time that is not an instant', async () => {
    await expect(
      logVetVisit({ petId: PET, visitedAt: '2026-11-09', channel: 'fax' as never }),
    ).rejects.toThrow(/unknown channel/);
    await expect(
      logVetVisit({ petId: PET, visitedAt: '2026-11-09', channel: 'phone', contactedAt: 'teatime' }),
    ).rejects.toThrow(/not an instant/);
    expect(localRows()).toEqual([]);
  });

  it('AC 4: *Also about* writes one independent row per pet, and an edit to one leaves the other', async () => {
    const id = await logVetVisit({
      petId: PET, visitedAt: '2026-11-09', channel: 'email', reason: 'Both cats scratching',
      alsoForPetIds: [OTHER_PET, PET, OTHER_PET], now: NOV_14,
    });
    const rows = localRows();
    expect(rows.map((r) => [r.pet_id, r.channel, r.reason])).toEqual([
      [PET, 'email', 'Both cats scratching'],
      [OTHER_PET, 'email', 'Both cats scratching'],
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(rows.find((r) => r.pet_id === PET)!.id).toBe(id);
    const other = rows.find((r) => r.pet_id === OTHER_PET)!;
    mockLocal.db!.prepare(`UPDATE vet_visits SET notes = 'Juniper is fine' WHERE id = ?`).run(other.id);
    expect(localRow(id).notes).toBeNull();
  });

  it('writes every pet’s row or none: a failed second insert leaves no first', async () => {
    let n = 0;
    await expect(
      logVetVisit({
        petId: PET, visitedAt: '2026-11-09', channel: 'phone', alsoForPetIds: [OTHER_PET],
        // The second id collides with the first: the primary key refuses the second insert.
        newId: () => (n++ === 0 ? 'same' : 'same'),
      }),
    ).rejects.toThrow();
    expect(localRows()).toEqual([]);
  });
});

describe('the sync (§5.1: the push enumerates columns)', () => {
  it('AC 3: the push carries channel and contacted_at, so the server row reads phone', async () => {
    const at = new Date(2026, 10, 9, 16, 40, 0).toISOString();
    const id = await logVetVisit({ petId: PET, visitedAt: '2026-11-09', channel: 'phone', contactedAt: at });
    await syncPendingVetVisits();
    const sent = mockServer.upserts.filter((u) => u.table === 'vet_visits').flatMap((u) => u.rows);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id, channel: 'phone', contacted_at: at });
    expect(mockServerTable('vet_visits').get(id)).toMatchObject({ channel: 'phone', contacted_at: at });
    expect(localRow(id).synced).toBe(1);
  });

  it('hydration maps both columns back onto a fresh phone', async () => {
    mockServerTable('vet_visits').set('srv-call', {
      id: 'srv-call', pet_id: PET, visited_at: '2026-11-09', clinic_name: null, vet_name: 'Dr. Chen',
      reason: 'Ear drops', notes: null, next_visit_at: null, deleted_at: null, channel: 'text',
      contacted_at: '2026-11-09T21:40:00+00:00',
      created_at: '2026-11-09T21:41:00+00:00', updated_at: '2026-11-09T21:41:00+00:00',
    });
    await hydrateFromCloud();
    expect(localRow('srv-call')).toMatchObject({
      channel: 'text', contacted_at: '2026-11-09T21:40:00+00:00', synced: 1,
    });
  });

  it('the rehydrate fill corrects a SYNCED row an older build stored as an exam, never an unpushed edit', async () => {
    // Both rows were pulled by a build without the column: the local default says exam.
    const same = '2026-11-09T21:41:00.000Z';
    seedVisit({ id: 'pulled', visited_at: '2026-11-09', updated_at: same, synced: 1 });
    seedVisit({ id: 'edited', visited_at: '2026-11-10', updated_at: same, synced: 0, notes: 'my edit' });
    for (const id of ['pulled', 'edited']) {
      mockServerTable('vet_visits').set(id, {
        ...localRow(id), channel: 'phone', contacted_at: '2026-11-09T21:40:00.000Z', updated_at: same,
      });
    }
    await hydrateFromCloud();
    expect(localRow('pulled')).toMatchObject({ channel: 'phone', contacted_at: '2026-11-09T21:40:00.000Z' });
    // The unpushed edit is the owner's newer word on this phone: untouched, still queued.
    expect(localRow('edited')).toMatchObject({ channel: 'in_clinic', synced: 0, notes: 'my edit' });
  });

  it('unknown-channel rows travel in their own batch, never beside a row that names its channel', async () => {
    seedVisit({ id: 'known', visited_at: '2026-11-01', channel: 'email', synced: 0 });
    seedVisit({ id: 'unknown', visited_at: '2026-11-02', channel: null, synced: 0 });
    await syncPendingVetVisits();
    const batches = mockServer.upserts.filter((u) => u.table === 'vet_visits').map((u) => u.rows.map((r) => r.id));
    expect(batches).toEqual([['known'], ['unknown']]);
  });

  it('an unknown-channel edit never re-stamps a phone contact as an exam (the adversarial pass)', async () => {
    // An older build pulled another device's phone contact without the column, the owner edited
    // it offline, and the phone upgraded: the row is unsynced and its channel is UNKNOWN (NULL).
    mockServerTable('vet_visits').set('pulled-call', {
      id: 'pulled-call', pet_id: PET, visited_at: '2026-11-09', clinic_name: null, vet_name: 'Dr. Chen',
      reason: 'Ear drops', notes: null, next_visit_at: null, deleted_at: null, channel: 'phone',
      contacted_at: '2026-11-09T21:40:00.000Z',
      created_at: '2026-11-09T21:41:00.000Z', updated_at: '2026-11-09T21:41:00.000Z',
    });
    seedVisit({
      id: 'pulled-call', visited_at: '2026-11-09', channel: null, clinic_name: null, next_visit_at: null,
      notes: 'my edit', updated_at: '2026-11-12T08:00:00.000Z', synced: 0,
    });
    mockLocal.db!.prepare(`INSERT INTO sync_watermarks (table_name, watermark) VALUES ('vet_visits', '2026-11-13T00:00:00.000Z')`).run();
    // Unknown is not an exam: it anchors nothing on this phone meanwhile.
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBeNull();

    await syncPendingVetVisits();
    const sent = mockServer.upserts.filter((u) => u.table === 'vet_visits').flatMap((u) => u.rows);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty('channel');
    expect(sent[0]).not.toHaveProperty('contacted_at');
    expect(sent[0]).toMatchObject({ notes: 'my edit' });
    // The server keeps what it knew: still a phone contact, with the owner's edit.
    expect(mockServerTable('vet_visits').get('pulled-call')).toMatchObject({ channel: 'phone', notes: 'my edit' });
    // The re-pull is re-armed, and the next hydrate teaches this phone the channel.
    expect(mockLocal.db!.prepare(`SELECT * FROM sync_watermarks WHERE table_name = 'vet_visits'`).get()).toBeUndefined();
    await hydrateFromCloud();
    expect(localRow('pulled-call')).toMatchObject({ channel: 'phone', synced: 1, notes: 'my edit' });
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBeNull();
  });
});

describe('AC 6: the exam readers on the phone, a Sep 18 visit and a Nov 9 phone contact', () => {
  beforeEach(() => {
    seedVisit({ id: 'exam', visited_at: '2026-09-18' });
    seedVisit({
      id: 'call', visited_at: '2026-11-09', channel: 'phone', clinic_name: null, next_visit_at: null,
      contacted_at: '2026-11-09T21:40:00.000Z', created_at: '2026-11-09T21:41:00.000Z',
      updated_at: '2026-11-09T21:41:00.000Z',
    });
  });

  it('the report window and Rundown’s "since the last visit" start Sep 18 on Nov 14', async () => {
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe('2026-09-18');
  });

  it('every remote channel is skipped; a contact alone anchors nothing', async () => {
    mockLocal.db!.prepare(`DELETE FROM vet_visits WHERE id = 'exam'`).run();
    for (const channel of ['phone', 'text', 'email']) {
      mockLocal.db!.prepare(`UPDATE vet_visits SET channel = ? WHERE id = 'call'`).run(channel);
      expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBeNull();
    }
    // Non-vacuity: the same row as an exam anchors the window, so the filter is what skipped it.
    mockLocal.db!.prepare(`UPDATE vet_visits SET channel = 'in_clinic' WHERE id = 'call'`).run();
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe('2026-11-09');
  });

  it('masking reads every CONTACT (R5): the call withholds zeros near it like an exam', async () => {
    expect(await readVisitDaysBefore(getDb(), PET, TODAY)).toEqual(['2026-09-18', '2026-11-09']);
    // Unknown counts for masking too: the louder side.
    mockLocal.db!.prepare(`UPDATE vet_visits SET channel = NULL WHERE id = 'call'`).run();
    expect(await readVisitDaysBefore(getDb(), PET, TODAY)).toEqual(['2026-09-18', '2026-11-09']);
  });

  it('the care questions’ latest visit is the exam', async () => {
    const rec = await readCareQuestionRecord(PET);
    expect(rec.latestVisit).toEqual({ id: 'exam', visitedAt: '2026-09-18' });
  });

  it('a later phone contact does not make the exam stop being the latest visit', async () => {
    const c = await readVisitConsequence({ id: 'exam', pet_id: PET, visited_at: '2026-09-18' }, NOV_14);
    expect(c.isLatest).toBe(true);
  });

  it('a contact is never "the latest visit": reopening it claims no window (adversarial pass 2)', async () => {
    const c = await readVisitConsequence({ id: 'call', pet_id: PET, visited_at: '2026-11-09' }, NOV_14);
    expect(c.isLatest).toBe(false);
    // Unknown is not an exam either.
    mockLocal.db!.prepare(`UPDATE vet_visits SET channel = NULL WHERE id = 'call'`).run();
    expect((await readVisitConsequence({ id: 'call', pet_id: PET, visited_at: '2026-11-09' }, NOV_14)).isLatest).toBe(false);
    // Non-vacuity: the same row as an exam is the latest.
    mockLocal.db!.prepare(`UPDATE vet_visits SET channel = 'in_clinic' WHERE id = 'call'`).run();
    expect((await readVisitConsequence({ id: 'call', pet_id: PET, visited_at: '2026-11-09' }, NOV_14)).isLatest).toBe(true);
  });

  it('a booking prefills from the exam, never from the call', async () => {
    expect(await readVisitPrefill(PET)).toEqual({
      clinicName: 'Riverside', vetName: 'Dr. Chen', suggestedDate: '2026-12-01',
    });
  });
});

describe('the flag-off differential (C-36): over exam-only rows, the filter is invisible', () => {
  // A flag-off build writes only 'in_clinic' (logVetVisit's default; no surface passes a
  // channel). So over such a record each filtered reader must answer EXACTLY what its query
  // answered before this PR, which is the same query without the filter, run here against the
  // same database. The fixtures are varied on purpose: two visits on a day, a deleted one, a
  // future one, another pet's.
  beforeEach(() => {
    seedVisit({ id: 'a', visited_at: '2026-06-02', next_visit_at: null });
    seedVisit({ id: 'b', visited_at: '2026-09-18', created_at: '2026-09-18T15:00:00.000Z' });
    seedVisit({ id: 'c', visited_at: '2026-09-18', created_at: '2026-09-18T18:00:00.000Z', clinic_name: 'Second' });
    seedVisit({ id: 'd', visited_at: '2026-10-30', deleted_at: '2026-10-31T00:00:00.000Z' });
    seedVisit({ id: 'e', visited_at: '2026-12-05' });
    seedVisit({ id: 'f', pet_id: OTHER_PET, visited_at: '2026-11-12' });
  });

  const unfiltered = (sql: string, ...params: unknown[]) =>
    mockLocal.db!.prepare(sql).all(...(params as never[])) as Row[];

  it('the window', async () => {
    const days = unfiltered('SELECT visited_at FROM vet_visits WHERE pet_id = ? AND deleted_at IS NULL', PET)
      .map((r) => String(r.visited_at));
    const before = latestVisitBefore(days, TODAY);
    expect(before).toBe('2026-09-18'); // non-vacuity: the fixture has an answer
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe(before);
  });

  it('the care questions’ latest visit', async () => {
    const [top] = unfiltered(
      `SELECT id, visited_at FROM vet_visits WHERE pet_id = ? AND deleted_at IS NULL
        ORDER BY visited_at DESC, created_at DESC LIMIT 1`, PET,
    );
    expect((await readCareQuestionRecord(PET)).latestVisit).toEqual({ id: top.id, visitedAt: top.visited_at });
  });

  it('the consequence and the prefill', async () => {
    for (const v of ['a', 'b', 'c', 'e']) {
      const row = localRow(v);
      const [{ later }] = unfiltered(
        `SELECT COUNT(*) AS later FROM vet_visits
          WHERE pet_id = ? AND id != ? AND deleted_at IS NULL AND visited_at >= ?`,
        PET, v, row.visited_at,
      ) as { later: number }[];
      const c = await readVisitConsequence({ id: v, pet_id: PET, visited_at: String(row.visited_at) }, NOV_14);
      expect(c.isLatest).toBe(later === 0);
    }
    const [last] = unfiltered(
      `SELECT clinic_name, vet_name, next_visit_at FROM vet_visits WHERE pet_id = ? AND deleted_at IS NULL
        ORDER BY visited_at DESC, created_at DESC LIMIT 1`, PET,
    );
    expect(await readVisitPrefill(PET)).toEqual({
      clinicName: last.clinic_name, vetName: last.vet_name, suggestedDate: last.next_visit_at,
    });
  });
});

// PR-04 (CUL-2766), spec AC 19 / R12: editing a saved contact's channel. The exam readers
// filter when they READ, so the window follows the corrected record both ways, and the push
// carries the corrected channel so the server's composer reads the same row.
describe('AC 19: an edited channel moves the report window both ways', () => {
  beforeEach(() => {
    seedVisit({ id: 'exam', visited_at: '2026-09-18' });
    seedVisit({ id: 'call', visited_at: '2026-11-09', channel: 'phone', next_visit_at: null });
  });

  it('Phone to At the clinic starts the window Nov 9; back to Phone returns it to Sep 18', async () => {
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe('2026-09-18');

    await updateVisitDetails('call', { channel: 'in_clinic' });
    expect(localRow('call').channel).toBe('in_clinic');
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe('2026-11-09');

    await updateVisitDetails('call', { channel: 'phone' });
    expect(await readLatestVisitBefore(getDb(), PET, TODAY)).toBe('2026-09-18');
  });

  it('the edit re-queues the row and the push carries the corrected channel and time', async () => {
    const at = new Date(2026, 10, 9, 9, 30, 0).toISOString();
    await updateVisitDetails('call', { channel: 'in_clinic', contactedAt: at });
    expect(localRow('call').synced).toBe(0);
    await syncPendingVetVisits();
    expect(mockServerTable('vet_visits').get('call')).toMatchObject({ channel: 'in_clinic', contacted_at: at });
  });

  it('refuses a channel the server would refuse and a time that is not an instant, writing nothing', async () => {
    await expect(updateVisitDetails('call', { channel: 'fax' as never })).rejects.toThrow();
    await expect(updateVisitDetails('call', { contactedAt: 'teatime' })).rejects.toThrow();
    expect(localRow('call')).toMatchObject({ channel: 'phone', synced: 1 });
  });

  it('clearing the time writes NULL: the record holds the day only', async () => {
    mockLocal.db!.prepare(`UPDATE vet_visits SET contacted_at = '2026-11-09T21:40:00.000Z' WHERE id = 'call'`).run();
    await updateVisitDetails('call', { contactedAt: null });
    expect(localRow('call').contacted_at).toBeNull();
  });
});

// CUL-2842: Home's warnings rebuild when a visit's channel or deletion LANDS. Since PR-09 the
// server refuses a "Talked about it" answer on a visit that is not an exam or is deleted, but only
// a Signal rebuild carries that refusal to Home. Judged against the server's prior row, so the
// case PR-09 exists for (the answer written on another phone, none of it held here) still rebuilds.
describe('a corrected visit rebuilds its pet\'s warnings when it lands (CUL-2842)', () => {
  /** The server's row for a visit this phone pulled synced, and the answer only the server holds. */
  function seedSyncedExam(id: string, petId = PET): void {
    seedVisit({ id, pet_id: petId, visited_at: '2026-11-09', synced: 1 });
    mockServerTable('vet_visits').set(id, { ...localRow(id) });
  }
  const regenPets = () => mockRegen.mock.calls.map((c) => c[0]);

  it('the far phone: an exam corrected to a call, with no answers on this phone, rebuilds that pet', async () => {
    seedSyncedExam('far');
    // The answer that keeps Home quiet lives on the server only: this phone holds none.
    expect(mockLocal.db!.prepare('SELECT COUNT(*) AS n FROM care_acknowledgements').get()).toEqual({ n: 0 });
    await updateVisitDetails('far', { channel: 'phone' });
    await syncPendingVetVisits();
    expect(mockServerTable('vet_visits').get('far')).toMatchObject({ channel: 'phone' });
    expect(regenPets()).toEqual([PET]);
  });

  it('a deleted visit rebuilds its pet', async () => {
    seedSyncedExam('gone');
    mockLocal.db!.prepare(
      `UPDATE vet_visits SET deleted_at = '2026-11-14T12:00:00.000Z', updated_at = '2026-11-14T12:00:00.000Z', synced = 0 WHERE id = 'gone'`,
    ).run();
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([PET]);
  });

  it('a call corrected back to an exam rebuilds too: the answer on it counts again', async () => {
    seedVisit({ id: 'back', visited_at: '2026-11-09', channel: 'phone', synced: 1 });
    mockServerTable('vet_visits').set('back', { ...localRow('back') });
    await updateVisitDetails('back', { channel: 'in_clinic' });
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([PET]);
  });

  it('only the pet whose visit moved: a notes edit on another pet\'s visit beside it spends nothing', async () => {
    seedSyncedExam('moved', PET);
    seedSyncedExam('notes', OTHER_PET);
    await updateVisitDetails('moved', { channel: 'text' });
    await updateVisitDetails('notes', { notes: 'ears look better' });
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([PET]);
  });

  it('the same deletion spelled two ways is not a move (C-40): presence, never the text', async () => {
    seedVisit({ id: 'tomb', visited_at: '2026-11-09', deleted_at: '2026-11-14T12:00:00.000Z', synced: 0, notes: 'x' });
    mockServerTable('vet_visits').set('tomb', { ...localRow('tomb'), deleted_at: '2026-11-14T12:00:00+00:00' });
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([]);
  });

  it('a new visit arms nothing: no answer can name it on the server until it lands', async () => {
    await logVetVisit({ petId: PET, visitedAt: '2026-11-09', channel: 'phone', contactedAt: new Date(2026, 10, 9, 9, 0).toISOString() });
    await syncPendingVetVisits();
    expect(mockServer.upserts).toHaveLength(1);
    expect(regenPets()).toEqual([]);
  });

  it('when the prior read fails, every pet whose visit landed rebuilds (the louder of the two)', async () => {
    seedSyncedExam('notes-only');
    await updateVisitDetails('notes-only', { notes: 'fine' });
    mockServer.readFails.add('vet_visits');
    await syncPendingVetVisits();
    expect(mockServerTable('vet_visits').get('notes-only')).toMatchObject({ notes: 'fine' });
    expect(regenPets()).toEqual([PET]);
  });

  it('a call corrected to a text moves nothing the care read asks (exam-ness), so it spends nothing', async () => {
    seedVisit({ id: 'call', visited_at: '2026-11-09', channel: 'phone', synced: 1 });
    mockServerTable('vet_visits').set('call', { ...localRow('call') });
    await updateVisitDetails('call', { channel: 'text' });
    await syncPendingVetVisits();
    expect(mockServerTable('vet_visits').get('call')).toMatchObject({ channel: 'text' });
    expect(regenPets()).toEqual([]);
  });

  // Adversarial pass 1: the push commits and its response is lost, so the drain arms nothing and
  // the next cycle's prior read already shows the call. The drain can never rebuild it again;
  // the Signal's own backstop (`visitMovedNearBuild`, asked by landedReadRebuildKey) does.
  it('committed but the response lost: the drain cannot rebuild, and the backstop finds the visit', async () => {
    seedSyncedExam('lost');
    const builtBefore = new Date(Date.now() - 60 * 60_000).toISOString();
    await updateVisitDetails('lost', { channel: 'phone' });
    mockServer.upsertLosesResponse.add('vet_visits');
    await syncPendingVetVisits();
    expect(mockServerTable('vet_visits').get('lost')).toMatchObject({ channel: 'phone' });
    mockServer.upsertLosesResponse.clear();
    await syncPendingVetVisits(); // the retry lands; the server already said phone
    expect(regenPets()).toEqual([]);
    // A Signal built an hour ago never saw the call: the backstop names it.
    expect(await visitMovedNearBuild(PET, builtBefore, 120_000)).toMatchObject({ afterBuild: true });
  });

  it('the backstop: only a visit that stopped being an exam or was deleted, never an exam, never one long before the build', async () => {
    const built = '2026-11-14T12:00:00.000Z';
    seedVisit({ id: 'exam', visited_at: '2026-11-13', updated_at: '2026-11-14T13:00:00.000Z' });
    expect(await visitMovedNearBuild(PET, built, 120_000)).toBeNull();
    seedVisit({ id: 'old-call', visited_at: '2026-11-01', channel: 'phone', updated_at: '2026-11-02T13:00:00.000Z' });
    expect(await visitMovedNearBuild(PET, built, 120_000)).toBeNull();
    // Inside the margin before the build, spelled the server's way (C-40): counted, not after.
    seedVisit({ id: 'race', visited_at: '2026-11-14', channel: 'text', updated_at: '2026-11-14T11:59:30+00:00' });
    expect(await visitMovedNearBuild(PET, built, 120_000)).toEqual({ updatedAt: '2026-11-14T11:59:30+00:00', afterBuild: false });
    seedVisit({ id: 'gone', visited_at: '2026-11-10', deleted_at: '2026-11-14T12:30:00.000Z', updated_at: '2026-11-14T12:30:00.000Z' });
    expect(await visitMovedNearBuild(PET, built, 120_000)).toEqual({ updatedAt: '2026-11-14T12:30:00.000Z', afterBuild: true });
    expect(await visitMovedNearBuild(OTHER_PET, built, 120_000)).toBeNull();
  });

  // CUL-2844: a build slower than the margin. The row carries the instant generate-signal took
  // before its first read, so a correction landing early in the build is after it. Against the old
  // end-of-build stamp the same correction sat more than the margin before it and was never rebuilt.
  it('a visit corrected early in a build slower than LANDED_READ_RACE_MS is after the start stamp (CUL-2844)', async () => {
    const { LANDED_READ_RACE_MS } = jest.requireActual('./signal') as typeof import('./signal');
    const startMs = Date.parse('2026-11-14T12:00:00.000Z');
    const buildMs = LANDED_READ_RACE_MS + 180_000;
    const landedMs = startMs + 30_000;
    seedVisit({ id: 'slow', visited_at: '2026-11-14', channel: 'phone', updated_at: new Date(landedMs).toISOString() });
    expect(await visitMovedNearBuild(PET, new Date(startMs).toISOString(), LANDED_READ_RACE_MS)).toEqual({
      updatedAt: '2026-11-14T12:00:30.000Z',
      afterBuild: true,
    });
    expect(buildMs - (landedMs - startMs)).toBeGreaterThan(LANDED_READ_RACE_MS);
    expect(await visitMovedNearBuild(PET, new Date(startMs + buildMs).toISOString(), LANDED_READ_RACE_MS)).toBeNull();
  });

  it('pass 2 (B4): pulling a visit corrected elsewhere nudges Home to re-check; an exam pulled does not', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useSyncStore } = require('../store/syncStore') as typeof import('../store/syncStore');
    const tick = () => useSyncStore.getState().signalTick;
    const remote = (id: string, channel: string) => ({
      id, pet_id: PET, visited_at: '2026-11-09', clinic_name: null, vet_name: null, reason: null, notes: null,
      next_visit_at: null, deleted_at: null, channel, contacted_at: null,
      created_at: '2026-11-09T21:41:00+00:00', updated_at: '2026-11-15T09:00:00+00:00',
    });
    mockServerTable('vet_visits').set('exam-only', remote('exam-only', 'in_clinic'));
    let before = tick();
    await hydrateFromCloud();
    expect(tick()).toBe(before);
    mockServerTable('vet_visits').set('far-call', { ...remote('far-call', 'phone'), updated_at: '2026-11-15T10:00:00+00:00' });
    before = tick();
    await hydrateFromCloud();
    expect(tick()).toBeGreaterThan(before);
  });

  it('a correction that did not land arms nothing, and rebuilds on the retry that lands', async () => {
    seedSyncedExam('retry');
    await updateVisitDetails('retry', { channel: 'email' });
    mockServer.upsertFails.add('vet_visits');
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([]);
    mockServer.upsertFails.clear();
    await syncPendingVetVisits();
    expect(regenPets()).toEqual([PET]);
  });
});
