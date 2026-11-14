// CUL-2754 (After the visit PR-02): what a REOPENED visit is built from, against a REAL
// database (node:sqlite over the app's own schema constants, C-35), and the field diff that
// keeps a no-change reopen from moving `updated_at`.

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
  }),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { readVisitPlanRecord, updateVisitDetails, visitFieldsPatch } from './vetVisits';

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
});
afterEach(() => mockDb.close());

function med(id: string, over: Record<string, unknown>) {
  const row = {
    id, pet_id: 'pet-a', drug_name: id, started_at: '2026-09-16', status: 'active',
    ended_at: null, vet_visit_id: null, created_at: '2026-09-16T10:00:00.000Z', updated_at: '2026-09-16T10:00:00.000Z',
    ...over,
  };
  const cols = Object.keys(row);
  mockDb.prepare(`INSERT INTO medications (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...(Object.values(row) as never[]));
}

function trial(id: string, over: Record<string, unknown>) {
  const row = {
    id, pet_id: 'pet-a', started_at: '2026-07-22', target_duration_days: 56, status: 'active',
    ended_at: null, vet_visit_id: null, food_label: 'Selected Protein',
    created_at: '2026-07-22T10:00:00.000Z', updated_at: '2026-07-22T10:00:00.000Z',
    ...over,
  };
  const cols = Object.keys(row);
  mockDb.prepare(`INSERT INTO diet_trials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...(Object.values(row) as never[]));
}

describe('readVisitPlanRecord — only this visit’s own items (§4.4 R3)', () => {
  it('returns the courses and trials linked here, active or ended, and nothing else the pet is on', async () => {
    med('motozol', { vet_visit_id: 'v-sep' });
    med('cerenia', { vet_visit_id: 'v-sep', status: 'completed', ended_at: '2026-09-30' });
    // A NEWER course from another visit, and one with no provenance at all: the pet is on
    // both, and a reopened September visit must offer neither (R3, AC 15).
    med('apoquel', { vet_visit_id: 'v-oct', started_at: '2026-10-20' });
    med('fish-oil', {});
    trial('t-sep', { vet_visit_id: 'v-sep', status: 'abandoned', ended_at: '2026-10-01T00:00:00+00:00' });
    trial('t-now', {});

    const plan = await readVisitPlanRecord('v-sep');
    expect(plan.courses.map((c) => [c.id, c.status, c.endedAt])).toEqual(
      expect.arrayContaining([['motozol', 'active', null], ['cerenia', 'completed', '2026-09-30']]),
    );
    expect(plan.courses).toHaveLength(2);
    // A hydrated DATE can come back as a timestamp; the day is what the row says.
    expect(plan.trials).toEqual([{ id: 't-sep', label: 'Selected Protein', status: 'abandoned', endedAt: '2026-10-01' }]);
  });

  it('is empty for a visit nothing links to', async () => {
    med('apoquel', { vet_visit_id: 'v-oct' });
    expect(await readVisitPlanRecord('v-sep')).toEqual({ courses: [], trials: [] });
  });
});

describe('visitFieldsPatch — a reopen writes only what changed (AC 16)', () => {
  const record = {
    visited_at: '2026-09-16', clinic_name: 'Completely Cat Clinic', vet_name: 'Dr Miller', reason: null, notes: 'Left ear.',
  };
  const same = {
    visitedAt: new Date(2026, 8, 16), clinicName: 'Completely Cat Clinic', vetName: 'Dr Miller', reason: '', notes: 'Left ear.',
  };

  it('is empty when nothing moved, padding and empty-for-null included', () => {
    expect(visitFieldsPatch(record, same)).toEqual({});
    expect(visitFieldsPatch(record, { ...same, clinicName: '  Completely Cat Clinic ', reason: '   ' })).toEqual({});
  });

  it('carries exactly the fields that moved', () => {
    expect(visitFieldsPatch(record, { ...same, notes: 'Left ear. Recheck in six weeks.', visitedAt: new Date(2026, 8, 15) }))
      .toEqual({ notes: 'Left ear. Recheck in six weeks.', visitedAt: '2026-09-15' });
  });

  it('a no-change patch leaves updated_at where it was, on the real row', async () => {
    mockDb.prepare(
      `INSERT INTO vet_visits (id, pet_id, visited_at, clinic_name, vet_name, notes, created_at, updated_at, synced)
       VALUES ('v1', 'pet-a', '2026-09-16', 'Completely Cat Clinic', 'Dr Miller', 'Left ear.', 'x', '2026-09-16T12:00:00.000Z', 1)`,
    ).run();
    await updateVisitDetails('v1', visitFieldsPatch(record, same));
    expect(mockDb.prepare(`SELECT updated_at, synced FROM vet_visits WHERE id = 'v1'`).get())
      .toEqual({ updated_at: '2026-09-16T12:00:00.000Z', synced: 1 });
  });
});
