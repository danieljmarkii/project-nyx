// CUL-2797 — every booking change that lands rebuilds the Signal for its pet.
//
// The care state that quiets a concern card on "Visit booked" (and the escalation's "Visit
// booked for <date>" line) is computed server-side from `vet_appointments`, so it is only as
// fresh as the last Signal run. This file drives the two ways a booking change reaches the
// server's view and asserts the rebuild fires for the pet it moved, and only once the row has
// landed:
//
//   • the PUSH: the production write paths (`bookVetAppointment`, `cancelVetAppointment`,
//     `updateAppointmentDetails`) followed by the production drain (`syncPendingVetAppointments`),
//     over the runtime schema in node:sqlite, against an emulated server;
//   • the PULL: `hydrateFromCloud` bringing another device's change down.
//
// The regen itself is stubbed at its one entry point (`triggerSignalRegenDebounced`): what is
// under test is that the sync layer ARMS it, for the right pet, at the right moment.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;
type ServerError = { code?: string; message: string };
type ServerAnswer = { data: { id: string }[] | null; error: ServerError | null };

// `mock`-prefixed so the factories below may read them; they are read at call time.
const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

const mockServer = {
  rows: new Map<string, Map<string, Row>>(),
  /** A table named here answers every write with this (a dropped connection). */
  answers: new Map<string, ServerAnswer>(),
  /** A row named here (by id) is refused with this. */
  refuse: new Map<string, ServerError>(),
  /** A write to a table named here waits until the test opens it: a slow request. */
  slow: new Map<string, Promise<void>>(),
  /** Every server-stamped write, so a pushed row reads as newer on the next pull (migration 107). */
  clock: Date.parse('2026-11-15T12:00:00.000Z'),
};

const mockRegen = jest.fn<void, [string]>();

function mockServerTable(table: string): Map<string, Row> {
  if (!mockServer.rows.has(table)) mockServer.rows.set(table, new Map());
  return mockServer.rows.get(table)!;
}

/** One upsert statement: every row lands, or none does. */
function mockServerWrite(table: string, payload: Row[]): ServerAnswer {
  const forced = mockServer.answers.get(table);
  if (forced) return forced;
  for (const row of payload) {
    const refused = mockServer.refuse.get(String(row.id));
    if (refused) return { data: null, error: refused };
  }
  for (const row of payload) {
    mockServer.clock += 1000;
    mockServerTable(table).set(String(row.id), { ...row, updated_at: new Date(mockServer.clock).toISOString() });
  }
  return { data: payload.map((r) => ({ id: String(r.id) })), error: null };
}

/** A read: every chained filter is accepted and ignored; the table's rows come back once. */
function mockServerRead(table: string) {
  const rows = [...mockServerTable(table).values()];
  const answer = { data: rows, error: null };
  const query: Record<string, unknown> = {};
  for (const m of ['order', 'range', 'gte', 'eq', 'is', 'in', 'lte', 'lt', 'gt', 'not', 'limit', 'neq']) {
    query[m] = () => query;
  }
  query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(answer).then(resolve, reject);
  return query;
}

function mockServerFrom(table: string) {
  return {
    upsert: (payload: Row | Row[]) => ({
      select: async () => {
        await mockServer.slow.get(table);
        return mockServerWrite(table, Array.isArray(payload) ? payload : [payload]);
      },
    }),
    select: () => mockServerRead(table),
  };
}

/** The expo-sqlite surface over node:sqlite, returning `{ changes }` as expo-sqlite does (C-39). */
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
  },
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: (petId: string) => mockRegen(petId) }));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { hydrateFromCloud, notifySignedOut, syncPendingVetAppointments } from './sync';
import { bookVetAppointment, cancelVetAppointment, updateAppointmentDetails } from './vetVisits';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';
const WHEN = '2026-11-20T15:30:00.000Z';

const DROPPED: ServerAnswer = { data: null, error: { message: 'TypeError: Network request failed' } };
const REFUSED: ServerError = { code: '23514', message: 'vet_appointments refused' };

const localRow = (id: string) =>
  mockLocal.db!.prepare('SELECT * FROM vet_appointments WHERE id = ?').get(id) as Row;

/** Book one appointment and land it, then forget the regen that landing armed. */
async function landedBooking(petId: string = PET): Promise<string> {
  const id = await bookVetAppointment({ petId, scheduledAt: WHEN, clinicName: 'Oak Vets' });
  await syncPendingVetAppointments();
  expect(localRow(id)).toMatchObject({ synced: 1 });
  mockRegen.mockClear();
  return id;
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.rows.clear();
  mockServer.answers.clear();
  mockServer.refuse.clear();
  mockServer.slow.clear();
  mockRegen.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

describe('the push: a booking change that lands rebuilds its pet\'s Signal', () => {
  it('a new booking, once it lands', async () => {
    const id = await bookVetAppointment({ petId: PET, scheduledAt: WHEN });
    // Written locally, not yet pushed: the server would read no booking, so nothing is armed.
    expect(mockRegen).not.toHaveBeenCalled();
    await syncPendingVetAppointments();
    expect(mockServerTable('vet_appointments').has(id)).toBe(true);
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('a cancel, once it lands: the instance that leaves a quiet card standing', async () => {
    const id = await landedBooking();
    await cancelVetAppointment(id);
    expect(mockRegen).not.toHaveBeenCalled();
    await syncPendingVetAppointments();
    expect(mockServerTable('vet_appointments').get(id)?.cancelled_at).toEqual(expect.any(String));
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('a reschedule, once it lands', async () => {
    const id = await landedBooking();
    await updateAppointmentDetails(id, { scheduledAt: '2026-11-27T15:30:00.000Z' });
    await syncPendingVetAppointments();
    expect(mockServerTable('vet_appointments').get(id)?.scheduled_at).toBe('2026-11-27T15:30:00.000Z');
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('one rebuild per pet, however many of its rows land in the batch', async () => {
    await bookVetAppointment({ petId: PET, scheduledAt: WHEN });
    await bookVetAppointment({ petId: PET, scheduledAt: '2026-11-27T15:30:00.000Z' });
    await bookVetAppointment({ petId: OTHER_PET, scheduledAt: WHEN });
    await syncPendingVetAppointments();
    expect(mockRegen.mock.calls.map(([p]) => p).sort()).toEqual([PET, OTHER_PET]);
  });

  it('a row the server refuses arms nothing for its pet; the row beside it still rebuilds its own', async () => {
    const refused = await bookVetAppointment({ petId: OTHER_PET, scheduledAt: WHEN });
    await bookVetAppointment({ petId: PET, scheduledAt: WHEN });
    mockServer.refuse.set(refused, REFUSED);
    await syncPendingVetAppointments();
    expect(mockServerTable('vet_appointments').has(refused)).toBe(false);
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('a dropped connection arms nothing, and the retry that lands does', async () => {
    const id = await landedBooking();
    await cancelVetAppointment(id);
    mockServer.answers.set('vet_appointments', DROPPED);
    await syncPendingVetAppointments();
    expect(localRow(id)).toMatchObject({ synced: 0 });
    expect(mockRegen).not.toHaveBeenCalled();

    mockServer.answers.clear();
    await syncPendingVetAppointments();
    expect(localRow(id)).toMatchObject({ synced: 1 });
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('a sign-out while the push is in the air arms nothing for the previous account', async () => {
    const id = await landedBooking();
    await cancelVetAppointment(id);
    let open!: () => void;
    mockServer.slow.set('vet_appointments', new Promise<void>((r) => { open = r; }));
    const drain = syncPendingVetAppointments();
    await new Promise((r) => setTimeout(r, 0));
    notifySignedOut();
    open();
    await drain;
    expect(mockServerTable('vet_appointments').get(id)?.cancelled_at).toEqual(expect.any(String));
    expect(mockRegen).not.toHaveBeenCalled();
  });
});

describe('the pull: another device\'s booking change rebuilds this phone\'s Signal for its pet', () => {
  function serverBooking(id: string, petId: string, over: Row = {}): void {
    mockServerTable('vet_appointments').set(id, {
      id, pet_id: petId, scheduled_at: WHEN, clinic_name: null, vet_name: null, reason: null,
      questions: null, notes_draft: null, vet_visit_id: null, cancelled_at: null, deleted_at: null,
      created_at: '2026-11-10T09:00:00.000Z', updated_at: '2026-11-10T09:00:00.000Z', ...over,
    });
  }

  it('a booking this phone has never seen', async () => {
    serverBooking('appt-new', OTHER_PET);
    await hydrateFromCloud();
    expect(localRow('appt-new')).toMatchObject({ pet_id: OTHER_PET, synced: 1 });
    expect(mockRegen.mock.calls).toEqual([[OTHER_PET]]);
  });

  it('a cancel made on the other device, over a booking this phone already holds', async () => {
    serverBooking('appt-1', PET);
    await hydrateFromCloud();
    mockRegen.mockClear();

    serverBooking('appt-1', PET, {
      cancelled_at: '2026-11-12T08:00:00.000Z', updated_at: '2026-11-12T08:00:00.000Z',
    });
    await hydrateFromCloud();
    expect(localRow('appt-1')).toMatchObject({ cancelled_at: '2026-11-12T08:00:00.000Z' });
    expect(mockRegen.mock.calls).toEqual([[PET]]);
  });

  it('a row that changes nothing here arms nothing', async () => {
    serverBooking('appt-1', PET);
    await hydrateFromCloud();
    mockRegen.mockClear();
    // The same version again: LWW skips it, so the Signal has nothing new to read.
    await hydrateFromCloud();
    expect(mockRegen).not.toHaveBeenCalled();
  });

  it('a pull that loses to an unpushed local edit arms nothing', async () => {
    const id = await landedBooking();
    await cancelVetAppointment(id, new Date('2026-11-16T09:00:00.000Z'));
    // An older server version: the local cancel is newer and still queued.
    serverBooking(id, PET, { updated_at: '2026-11-15T09:00:00.000Z' });
    await hydrateFromCloud();
    expect(localRow(id)).toMatchObject({ synced: 0 });
    expect(mockRegen).not.toHaveBeenCalled();
  });
});
