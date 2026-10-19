// CUL-2004: what Ask's request says about the phone's record, over the REAL local schema and
// the REAL write paths an owner fixes a stuck entry with. lib/ask.test.ts pins the request's
// shape over mocked counts; this pins that the counts answer the right question: a refused row
// closes Ask with `refused_rows`, a pending one keeps `unsent_rows` (today's behaviour), and a
// fix or a removal reopens it (the row moves to pending, then lands).
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

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
jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
// Ask never pushes; the drains are stubbed only so lib/signal.ts resolves.
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingMeals: jest.fn() }));
jest.mock('./profile', () => ({ getDeviceTimezone: jest.fn(() => 'America/Chicago') }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { softDeleteEvent, updateEvent, updateMealIntake } from './db';
import { askQuestion } from './ask';
import { supabase } from './supabase';

const mockedInvoke = supabase.functions.invoke as jest.Mock;
const PET = 'pet-1';
const T0 = '2026-10-18T08:00:00.000Z';
const REFUSAL = '22P02: invalid input value for enum event_type';

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

/** The drain landing every pending row: what the next cycle does once nothing is refused. */
function landAll(): void {
  for (const t of ['events', 'meals']) mockLocal.db!.prepare(`UPDATE ${t} SET synced = 1 WHERE sync_error IS NULL`).run();
}

async function sentFlags(): Promise<{ unsent_rows: unknown; refused_rows: unknown }> {
  mockedInvoke.mockClear();
  mockedInvoke.mockResolvedValue({ data: { outcome: 'llm_unavailable', headline: 'h', detail: '', followups: [] }, error: null });
  await askQuestion({ petId: PET, question: 'did she vomit today?', conversation: [] });
  expect(mockedInvoke).toHaveBeenCalledTimes(1);
  const body = (mockedInvoke.mock.calls[0][1] as { body: { unsent_rows: unknown; refused_rows: unknown } }).body;
  return { unsent_rows: body.unsent_rows, refused_rows: body.refused_rows };
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
});

afterEach(() => {
  mockLocal.db?.close();
  mockLocal.db = null;
});

it('a whole record sends neither flag', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 1, sync_error: null });
  expect(await sentFlags()).toEqual({ unsent_rows: false, refused_rows: false });
});

it('a vomit the server refused sends refused_rows (and is not counted as about to send)', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 0, sync_error: REFUSAL });
  expect(await sentFlags()).toEqual({ unsent_rows: false, refused_rows: true });
});

it('a refused meal (the intake case) sends refused_rows', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'meal', synced: 1, sync_error: null });
  insert('meals', { id: 'm1', event_id: 'e1', pet_id: PET, synced: 0, sync_error: '23503: meals_food_item_id_fkey' });
  expect(await sentFlags()).toEqual({ unsent_rows: false, refused_rows: true });
});

it('pending rows alone keep today: unsent_rows only', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 0, sync_error: null });
  expect(await sentFlags()).toEqual({ unsent_rows: true, refused_rows: false });
});

it('saving the refused vomit again reopens Ask: pending until it lands, then nothing', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 0, sync_error: REFUSAL });
  await updateEvent('e1', { occurred_at: T0, occurred_at_source: 'manual' });
  expect(await sentFlags()).toEqual({ unsent_rows: true, refused_rows: false });
  landAll();
  expect(await sentFlags()).toEqual({ unsent_rows: false, refused_rows: false });
});

it('fixing the refused meal reopens Ask', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'meal', synced: 1, sync_error: null });
  insert('meals', { id: 'm1', event_id: 'e1', pet_id: PET, synced: 0, sync_error: '23503: meals_food_item_id_fkey' });
  await updateMealIntake('e1', 'some');
  expect(await sentFlags()).toEqual({ unsent_rows: true, refused_rows: false });
});

it('removing the refused vomit reopens Ask once the removal lands', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 0, sync_error: REFUSAL });
  await softDeleteEvent('e1');
  expect(await sentFlags()).toEqual({ unsent_rows: true, refused_rows: false });
  landAll();
  expect(await sentFlags()).toEqual({ unsent_rows: false, refused_rows: false });
});

it('a refused row and a pending one send both flags (the server lets refused lead)', async () => {
  insert('events', { id: 'e1', pet_id: PET, event_type: 'vomit', synced: 0, sync_error: REFUSAL });
  insert('events', { id: 'e2', pet_id: PET, event_type: 'stool', synced: 0, sync_error: null });
  expect(await sentFlags()).toEqual({ unsent_rows: true, refused_rows: true });
});
