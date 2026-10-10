// EN-5's answer on the phone (Engines v3 PR-30q, CUL-1724), against a REAL database
// (node:sqlite over the app's own schema constants, C-35).
//
// Pinned here: an answer and its EN-4 marker share a transaction (flag on), and flag off the
// answer is written alone; a Change is an UPDATE of the row that moves updated_at and re-queues
// it (C-23), and throws when it matched nothing (C-39); the read takes the newest live row per
// form under a live vomit of the same pet, on parsed instants (C-40); the push holds an answer
// until its vomit lands and never sends created_at (097 grants none).

const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

let mockDb: RawDb;
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...(params as never[]))),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[]))),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...(params as never[])) ?? null),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await fn();
        mockDb.exec('COMMIT');
      } catch (e) {
        mockDb.exec('ROLLBACK');
        throw e;
      }
    }),
  }),
  getWatermark: jest.fn(async () => null),
  setWatermark: jest.fn(),
}));

let mockFlags: Record<string, boolean> = {};
jest.mock('../hooks/useAppConfig', () => ({
  allowlistFlagNow: (key: string) => mockFlags[key] === true,
}));

const mockUpserts: { table: string; rows: Record<string, unknown>[] }[] = [];
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: jest.fn((table: string) => ({
      upsert: (rows: Record<string, unknown>[]) => {
        mockUpserts.push({ table, rows });
        return { select: async () => ({ data: rows.map((r) => ({ id: r.id })), error: null }) };
      },
    })),
    functions: { invoke: jest.fn(async () => ({ data: { success: true, refloored: 0, results: [] }, error: null })) },
  },
}));
jest.mock('./incidentFloorArrival', () => ({ onFloorLanded: jest.fn(async () => undefined) }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { newestPerForm, readIntakeChecks, readIntakeQuestionFacts, saveIntakeAnswer, type IntakeCheckRow } from './intakeChecks';
import { syncPendingIntakeChecks } from './sync';

const PET = 'pet-a';
const SINCE = '2026-10-07T18:00:00.000Z';

function seedEvent(id: string, type = 'vomit', opts: { synced?: number; deletedAt?: string | null; petId?: string } = {}): void {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced, deleted_at)
       VALUES (?, ?, ?, '2026-10-08T18:00:00.000Z', 'manual', 'manual', '2026-10-08T18:00:00.000Z', '2026-10-08T18:00:00.000Z', ?, ?)`,
    )
    .run(id, opts.petId ?? PET, type, opts.synced ?? 1, opts.deletedAt ?? null);
}
const rows = () => mockDb.prepare('SELECT * FROM intake_checks ORDER BY rowid').all();
const markers = () => mockDb.prepare('SELECT * FROM incident_floor_queue').all();

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockFlags = {};
  mockUpserts.length = 0;
});
afterEach(() => mockDb.close());

describe('saveIntakeAnswer', () => {
  it('a first answer is a queued row, and flag off it is written alone', async () => {
    seedEvent('v1');
    const row = await saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'no', since: SINCE, now: new Date('2026-10-08T19:00:00.000Z') });
    expect(rows()).toEqual([
      expect.objectContaining({ id: row.id, pet_id: PET, event_id: 'v1', since: SINCE, form: 'meal_fed', answer: 'no', answered_at: '2026-10-08T19:00:00.000Z', synced: 0, deleted_at: null }),
    ]);
    expect(markers()).toEqual([]);
  });

  it('with EN-4\'s keys on, the answer owes the vomit one re-check, in the same transaction', async () => {
    mockFlags = { engines_v3_en4: true, engines_v3_en3: true };
    seedEvent('v1');
    await saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'a_little', since: SINCE });
    expect(markers()).toEqual([expect.objectContaining({ event_id: 'v1', pet_id: PET, synced: 0 })]);
  });

  it('Change is an UPDATE of the row: it moves updated_at and re-queues, keeping since and form', async () => {
    seedEvent('v1');
    const first = await saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'not_observable', since: SINCE, now: new Date('2026-10-08T19:00:00.000Z') });
    mockDb.prepare('UPDATE intake_checks SET synced = 1').run();
    const changed = await saveIntakeAnswer({
      eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'no', since: 'ignored', existingId: first.id, now: new Date('2026-10-08T21:00:00.000Z'),
    });
    expect(changed).toEqual(expect.objectContaining({ id: first.id, answer: 'no', since: SINCE, answered_at: '2026-10-08T21:00:00.000Z' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toEqual(expect.objectContaining({ synced: 0, updated_at: '2026-10-08T21:00:00.000Z' }));
  });

  it('a Change over a row this phone no longer holds throws, never silently drops (C-39)', async () => {
    seedEvent('v1');
    await expect(
      saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'no', since: SINCE, existingId: 'gone' }),
    ).rejects.toThrow('not found');
  });

  it('"A little" off the meal question, or an answer outside the set, is refused before any write', async () => {
    seedEvent('v1');
    await expect(saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'free_fed', answer: 'a_little', since: SINCE })).rejects.toThrow();
    await expect(saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'maybe' as never, since: SINCE })).rejects.toThrow();
    expect(rows()).toEqual([]);
  });
});

describe('readIntakeChecks: the newest live answer per form, under a live vomit of the same pet', () => {
  const insert = (id: string, eventId: string, form: string, answer: string, at: string, extra: { deletedAt?: string; petId?: string } = {}) =>
    mockDb
      .prepare(
        `INSERT INTO intake_checks (id, pet_id, event_id, since, form, answer, answered_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, extra.petId ?? PET, eventId, SINCE, form, answer, at, extra.deletedAt ?? null);

  it('the newest by parsed instant wins, per form', async () => {
    seedEvent('v1');
    insert('a', 'v1', 'meal_fed', 'no', '2026-10-08T19:00:00.000Z');
    // The same vomit answered later on another phone, hydrated in the server's spelling.
    insert('b', 'v1', 'meal_fed', 'yes', '2026-10-08T20:00:00+00:00');
    insert('c', 'v1', 'other_food', 'not_observable', '2026-10-08T19:30:00.000Z');
    const read = await readIntakeChecks('v1');
    expect(read.meal_fed?.id).toBe('b');
    expect(read.other_food?.id).toBe('c');
  });

  it('a deleted answer, a deleted or re-typed vomit, or an answer naming another pet counts for nothing', async () => {
    seedEvent('v1');
    insert('a', 'v1', 'meal_fed', 'no', '2026-10-08T19:00:00.000Z', { deletedAt: '2026-10-08T19:05:00.000Z' });
    expect(await readIntakeChecks('v1')).toEqual({});
    seedEvent('v2', 'vomit', { deletedAt: '2026-10-08T20:00:00.000Z' });
    insert('b', 'v2', 'meal_fed', 'no', '2026-10-08T19:00:00.000Z');
    expect(await readIntakeChecks('v2')).toEqual({});
    seedEvent('l1', 'lethargy');
    insert('c', 'l1', 'meal_fed', 'no', '2026-10-08T19:00:00.000Z');
    expect(await readIntakeChecks('l1')).toEqual({});
    seedEvent('v3');
    insert('d', 'v3', 'meal_fed', 'no', '2026-10-08T19:00:00.000Z', { petId: 'pet-b' });
    expect(await readIntakeChecks('v3')).toEqual({});
  });

  it('newestPerForm: one instant in two spellings ties, and the higher id wins in either order (C-40)', () => {
    const a = { id: 'a', form: 'meal_fed', answer: 'yes', answered_at: '2026-10-08T04:00:00+00:00' } as IntakeCheckRow;
    const b = { id: 'b', form: 'meal_fed', answer: 'no', answered_at: '2026-10-08T04:00:00.000Z' } as IntakeCheckRow;
    expect(Date.parse(a.answered_at)).toBe(Date.parse(b.answered_at));
    expect(a.answered_at < b.answered_at).toBe(true); // as text, '+' sorts before '.'
    expect(newestPerForm([a, b]).meal_fed?.id).toBe('b');
    expect(newestPerForm([b, a]).meal_fed?.id).toBe('b');
  });
});

describe('the push', () => {
  it('holds an answer until its vomit lands, then sends it without created_at', async () => {
    seedEvent('v1', 'vomit', { synced: 0 });
    await saveIntakeAnswer({ eventId: 'v1', petId: PET, form: 'meal_fed', answer: 'no', since: SINCE });
    await syncPendingIntakeChecks();
    expect(mockUpserts.filter((u) => u.table === 'intake_checks')).toEqual([]);
    mockDb.prepare(`UPDATE events SET synced = 1 WHERE id = 'v1'`).run();
    await syncPendingIntakeChecks();
    const sent = mockUpserts.filter((u) => u.table === 'intake_checks');
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].rows[0]).sort()).toEqual(
      ['answer', 'answered_at', 'deleted_at', 'event_id', 'form', 'id', 'pet_id', 'since', 'updated_at'].sort(),
    );
    expect(rows()[0]).toEqual(expect.objectContaining({ synced: 1 }));
  });
});

describe('readIntakeQuestionFacts', () => {
  it('a free-fed bowl, and the active trial with its protein (stored first)', async () => {
    expect(await readIntakeQuestionFacts(PET)).toEqual({ freeFed: false, trial: null });
    mockDb
      .prepare(
        `INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, active_from, created_at, updated_at)
         VALUES ('fa1', ?, 'food-1', 'free_choice', '2026-10-01', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
      )
      .run(PET);
    mockDb
      .prepare(
        `INSERT INTO diet_trials (id, pet_id, started_at, target_duration_days, status, target_protein, created_at, updated_at)
         VALUES ('t1', ?, '2026-10-01', 56, 'active', 'rabbit', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
      )
      .run(PET);
    const facts = await readIntakeQuestionFacts(PET);
    expect(facts.freeFed).toBe(true);
    expect(facts.trial).toEqual(expect.objectContaining({ startedAt: '2026-10-01', targetDurationDays: 56, status: 'active', protein: 'rabbit' }));
  });
});
