// CUL-1459, pinned at the WIRING: the provenance fill runs over every row the hydrate
// FETCHED, not only the rows last-write-wins chose to rewrite (code review of d8992fa,
// item 5).
//
// An upgraded phone gains a trial's window provenance and the course and trial visit
// links as NULL columns, and the re-pull after the upgrade returns each row at the SAME
// updated_at the phone already holds, which reconcileBatch rightly skips. So the fill in
// hydrateDietTrials / hydrateMedications is the only thing that writes those values, and
// what decides it is which collection its loop iterates. lib/trialProvenanceUpgrade.test.ts
// runs the fill STATEMENTS out of lib/sync.ts; it cannot see the loop, so iterating
// `toWrite` (the LWW-filtered rows) instead of `rows` brought the bug back with that file
// green. This drives the real hydrateFromCloud, with the real reconcileBatch, over the
// runtime schema in node:sqlite, against a server whose rows match the phone's at the
// same instant: every value below can only have come from the fill.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

// `mock`-prefixed so the factories below may read them; they are read at call time.
const mockLocal = {
  db: null as InstanceType<typeof DatabaseSync> | null,
  /** Every local write, in order. */
  writes: [] as string[],
};
const mockServerRows: Record<string, Row[]> = {};

/** A PostgREST query builder: every filter returns the builder, and awaiting it answers
 *  with the table's rows (the hydrate pulls fit in one page). */
function mockQuery(table: string): unknown {
  const rows = mockServerRows[table] ?? [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'in', 'not', 'or', 'lte', 'limit']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej);
  return q;
}

function mockAdapter() {
  const db = () => {
    if (!mockLocal.db) throw new Error('no local database');
    return mockLocal.db;
  };
  return {
    runAsync: async (sql: string, params: unknown[] = []) => {
      mockLocal.writes.push(sql);
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

jest.mock('./db', () => ({
  getDb: () => mockAdapter(),
  getWatermark: async () => null,
  setWatermark: async () => undefined,
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockQuery(table),
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'n/a' } }) }) },
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { hydrateFromCloud } from './sync';

/** The instant both copies were last written, as PostgREST spells it. */
const UPDATED_AT = '2026-09-20T08:15:00+00:00';

/** The window provenance (068) and the visit link (066): NULL on an upgraded phone. */
const TRIAL_PROVENANCE = [
  'target_duration_days_initial',
  'target_duration_set_at',
  'target_duration_vet_directed',
  'vet_visit_id',
] as const;

function serverTrial(id: string, provenance: {
  initial: number; setAt: string; vetDirected: boolean | null; visit: string;
}): Row {
  return {
    id, pet_id: 'pet-1', food_item_id: 'food-1', started_at: '2026-08-01', target_duration_days: 84,
    status: 'active', completed_at: null, vet_name: 'Dr. Okafor', notes: null, food_label: 'Hydrolyzed dry',
    indication: 'skin', phase: 'elimination', outcome: null, outcome_notes: null, stopped_reason: null,
    ended_at: null, transition_started_at: null, target_protein: null, target_protein_set_at: null,
    target_duration_days_initial: provenance.initial,
    target_duration_set_at: provenance.setAt,
    target_duration_vet_directed: provenance.vetDirected,
    vet_visit_id: provenance.visit,
    created_at: '2026-08-01T09:00:00+00:00', updated_at: UPDATED_AT,
  };
}

const SERVER_TRIALS = [
  serverTrial('t-vet-directed', { initial: 56, setAt: '2026-09-17T10:00:00+00:00', vetDirected: true, visit: 'visit-1' }),
  serverTrial('t-owner-choice', { initial: 42, setAt: '2026-09-18T11:00:00+00:00', vetDirected: false, visit: 'visit-2' }),
  serverTrial('t-unanswered', { initial: 70, setAt: '2026-09-19T12:00:00+00:00', vetDirected: null, visit: 'visit-3' }),
];

const SERVER_COURSE: Row = {
  id: 'm-cerenia', pet_id: 'pet-1', medication_item_id: null, drug_name: 'Cerenia', dose_amount: '16 mg',
  route: 'oral', doses_per_day: 1, schedule_notes: null, indication: 'vomiting', prescribed_by: 'Dr. Okafor',
  started_at: '2026-09-01', target_duration_days: 5, target_duration_doses: null, status: 'active',
  ended_at: null, notes: null, vet_visit_id: 'visit-1',
  created_at: '2026-09-01T09:00:00+00:00', updated_at: UPDATED_AT,
};

/** The row as the phone holds it: the server's own row, pulled by a build that predated
 *  the provenance columns, so they are NULL here; synced, at the same updated_at. */
function insertLocal(table: string, serverRow: Row, nulled: readonly string[]): void {
  const row: Row = { ...serverRow, synced: 1 };
  for (const c of nulled) row[c] = null;
  const cols = Object.keys(row);
  mockLocal.db!
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => row[c] as never));
}

const localRow = (table: string, id: string) =>
  mockLocal.db!.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row;

/** A row with the named columns left out, to compare everything the fill must not touch. */
const without = (row: Row, cols: readonly string[]) =>
  Object.fromEntries(Object.entries(row).filter(([c]) => !cols.includes(c)));

let warn: jest.SpyInstance;

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockLocal.writes.length = 0;
  for (const t of Object.keys(mockServerRows)) delete mockServerRows[t];
  mockServerRows.diet_trials = SERVER_TRIALS;
  mockServerRows.medications = [SERVER_COURSE];
  for (const t of SERVER_TRIALS) insertLocal('diet_trials', t, TRIAL_PROVENANCE);
  insertLocal('medications', SERVER_COURSE, ['vet_visit_id']);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  mockLocal.db?.close();
  mockLocal.db = null;
});

describe('hydrate fills provenance on rows last-write-wins skips (CUL-1459, the wiring)', () => {
  it("fills a trial's window provenance and visit link from the server, moving nothing else", async () => {
    const before = Object.fromEntries(SERVER_TRIALS.map((t) => [t.id, localRow('diet_trials', String(t.id))]));

    await hydrateFromCloud();

    // Non-vacuity: the step ran clean, and last-write-wins wrote none of these rows, so
    // every value below came from the fill.
    expect(warn.mock.calls.some((c) => String(c[0]).includes('diet_trials step failed'))).toBe(false);
    expect(mockLocal.writes.some((sql) => /INSERT INTO diet_trials/.test(sql))).toBe(false);

    expect(localRow('diet_trials', 't-vet-directed')).toMatchObject({
      target_duration_days_initial: 56, target_duration_set_at: '2026-09-17T10:00:00+00:00',
      target_duration_vet_directed: 1, vet_visit_id: 'visit-1',
    });
    expect(localRow('diet_trials', 't-owner-choice')).toMatchObject({
      target_duration_days_initial: 42, target_duration_set_at: '2026-09-18T11:00:00+00:00',
      target_duration_vet_directed: 0, vet_visit_id: 'visit-2',
    });
    // An unanswered box stays NULL: the pull never turns silence into "no".
    expect(localRow('diet_trials', 't-unanswered')).toMatchObject({
      target_duration_days_initial: 70, target_duration_set_at: '2026-09-19T12:00:00+00:00',
      target_duration_vet_directed: null, vet_visit_id: 'visit-3',
    });
    // Everything else, `updated_at` and `synced` included, is exactly as it was: the fill
    // records what the server already holds, and queues nothing.
    for (const t of SERVER_TRIALS) {
      const after = localRow('diet_trials', String(t.id));
      expect(without(after, TRIAL_PROVENANCE)).toEqual(without(before[String(t.id)], TRIAL_PROVENANCE));
      expect(after).toMatchObject({ updated_at: UPDATED_AT, synced: 1 });
    }
  });

  it("fills a course's visit link from the server, moving nothing else", async () => {
    const before = localRow('medications', 'm-cerenia');

    await hydrateFromCloud();

    expect(warn.mock.calls.some((c) => String(c[0]).includes('medications step failed'))).toBe(false);
    expect(mockLocal.writes.some((sql) => /INSERT INTO medications/.test(sql))).toBe(false);

    const after = localRow('medications', 'm-cerenia');
    expect(after.vet_visit_id).toBe('visit-1');
    expect(without(after, ['vet_visit_id'])).toEqual(without(before, ['vet_visit_id']));
    expect(after).toMatchObject({ updated_at: UPDATED_AT, synced: 1 });
  });
});
