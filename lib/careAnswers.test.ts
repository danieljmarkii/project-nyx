// Engines v3 PR-35 (CUL-1418): the owner's care answers, written against a REAL database
// (node:sqlite over the app's own schema constants, C-35), and the queue that pushes them.
//
// What is pinned here is what the server will accept (082): a visit source always names its
// visit, an Undo is a NEW row carrying the original's source and links, and the push names
// only the nine granted columns, never `created_at` or the local bookkeeping.

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
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
}));

// The server, stood in for at the one call the drain makes. Each insert answers from
// `mockServer`, and the payload is recorded so the columns can be asserted.
const mockInserts: Record<string, unknown>[] = [];
let mockServer: (row: Record<string, unknown>) => { data: { id: string }[] | null; error: { code: string; message: string } | null } =
  (row) => ({ data: [{ id: row.id as string }], error: null });
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: jest.fn(() => ({
      insert: (row: Record<string, unknown>) => {
        mockInserts.push(row);
        return { select: async () => mockServer(row) };
      },
    })),
  },
}));
const mockRegen = jest.fn();
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: (petId: string) => mockRegen(petId) }));
jest.mock('./dietTrialSetup', () => ({ getActiveTrialForPet: jest.fn(async () => null) }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { careAnswerLanded, pushCareAnswers, recordCareAnswer, retractCareAnswer } from './careAnswers';
import { notifySignedOut } from './sync';

const PET = 'pet-a';
let ids = 0;
const nextId = () => `ack-${++ids}`;

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockInserts.length = 0;
  mockServer = (row) => ({ data: [{ id: row.id as string }], error: null });
  mockRegen.mockClear();
  ids = 0;
});
afterEach(() => mockDb.close());

const row = (id: string) => mockDb.prepare('SELECT * FROM care_acknowledgements WHERE id = ?').get(id) as Record<string, unknown>;

describe('recordCareAnswer', () => {
  it('writes one sign, its source and its anchor, queued for the push', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    expect(row(id)).toEqual(expect.objectContaining({
      pet_id: PET, symptom_type: 'vomit', source: 'my_vet_knows', anchor_on: '2026-09-30',
      vet_visit_id: null, diet_trial_id: null, medication_id: null, retracts: null, synced: 0,
    }));
  });

  it('links exactly the parent its source names (082’s CHECKs tie each source to its link)', async () => {
    const trial = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'vet_started_trial', anchorOn: '2026-09-01', dietTrialId: 't1' }, nextId);
    const course = await recordCareAnswer({ petId: PET, sign: 'cough', source: 'vet_started_course', anchorOn: '2026-09-21', medicationId: 'm1' }, nextId);
    const visit = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'visit_answer', anchorOn: '2026-09-16', vetVisitId: 'v1' }, nextId);
    expect([row(trial).diet_trial_id, row(trial).medication_id, row(trial).vet_visit_id]).toEqual(['t1', null, null]);
    expect([row(course).diet_trial_id, row(course).medication_id, row(course).vet_visit_id]).toEqual([null, 'm1', null]);
    expect([row(visit).diet_trial_id, row(visit).medication_id, row(visit).vet_visit_id]).toEqual([null, null, 'v1']);
  });

  it('refuses a visit source with no visit, and a date that is not a local day, before anything is written', async () => {
    await expect(recordCareAnswer({ petId: PET, sign: 'vomit', source: 'visit_answer', anchorOn: '2026-09-16', vetVisitId: '' }, nextId)).rejects.toThrow();
    await expect(recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30T04:00:00Z' }, nextId)).rejects.toThrow();
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM care_acknowledgements').get()).toEqual({ n: 0 });
  });
});

describe('retractCareAnswer — an Undo is a new row, never an edit', () => {
  it('copies the original’s source and links and names it, leaving the original untouched', async () => {
    const original = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'visit_answer', anchorOn: '2026-09-16', vetVisitId: 'v1' }, nextId);
    const undo = await retractCareAnswer(original, nextId);
    expect(row(undo)).toEqual(expect.objectContaining({
      pet_id: PET, symptom_type: 'vomit', source: 'visit_answer', anchor_on: '2026-09-16', vet_visit_id: 'v1', retracts: original,
    }));
    expect(row(original).retracts).toBeNull();
  });

  it('refuses to retract a retraction, or an answer this phone does not hold', async () => {
    const original = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    const undo = await retractCareAnswer(original, nextId);
    await expect(retractCareAnswer(undo, nextId)).rejects.toThrow();
    await expect(retractCareAnswer('nowhere', nextId)).rejects.toThrow();
  });
});

describe('the push (drainCareAcknowledgementsQueue)', () => {
  it('sends only 082’s nine granted columns, marks the row landed, and regenerates that pet’s Signal', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    await pushCareAnswers();
    expect(mockInserts).toHaveLength(1);
    expect(Object.keys(mockInserts[0]).sort()).toEqual(
      ['anchor_on', 'diet_trial_id', 'id', 'medication_id', 'pet_id', 'retracts', 'source', 'symptom_type', 'vet_visit_id'].sort(),
    );
    expect(await careAnswerLanded(id)).toBe(true);
    expect(mockRegen).toHaveBeenCalledWith(PET);
  });

  it('a 23505 on its own id means it already landed (a lost response): marked, never quarantined', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    mockServer = () => ({ data: null, error: { code: '23505', message: 'duplicate key' } });
    await pushCareAnswers();
    expect(row(id)).toEqual(expect.objectContaining({ synced: 1, sync_error: null }));
  });

  it('offline: stays queued, costs no attempt, and nothing regenerates', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    mockServer = () => ({ data: null, error: { code: '', message: 'Network request failed' } });
    await pushCareAnswers();
    expect(row(id)).toEqual(expect.objectContaining({ synced: 0, sync_attempts: 0 }));
    expect(await careAnswerLanded(id)).toBe(false);
    expect(mockRegen).not.toHaveBeenCalled();
  });

  it('holds an answer whose visit has not landed, and an Undo whose answer has not', async () => {
    mockDb.prepare("INSERT INTO vet_visits (id, pet_id, visited_at, synced) VALUES ('v1', ?, '2026-09-16', 0)").run(PET);
    const visitAnswer = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'visit_answer', anchorOn: '2026-09-16', vetVisitId: 'v1' }, nextId);
    const mine = await recordCareAnswer({ petId: PET, sign: 'cough', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    // `mine` is REFUSED (a 42501, which spends an attempt and lets the drain carry on), so
    // the drain does reach the Undo behind it, and only the gate keeps it back.
    mockServer = (r) => (r.id === mine ? { data: null, error: { code: '42501', message: 'refused' } } : { data: [{ id: r.id as string }], error: null });
    const undo = await retractCareAnswer(mine, nextId);
    await pushCareAnswers();
    // Only `mine` went out (and was refused); the visit answer and the Undo were held.
    expect(mockInserts.map((r) => r.id)).toEqual([mine]);
    expect(row(visitAnswer).synced).toBe(0);
    expect(row(undo).synced).toBe(0);
  });

  it('an offline answer and its Undo land in ONE drain, and the Signal regenerates once, after both (adversarial F2)', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    const undo = await retractCareAnswer(id, nextId);
    await pushCareAnswers();
    expect(mockInserts.map((r) => r.id)).toEqual([id, undo]);
    expect(row(undo).synced).toBe(1);
    expect(mockRegen).toHaveBeenCalledTimes(1);
  });

  it('a row that landed still regenerates when a later row stops the drain offline (code review)', async () => {
    const first = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    const second = await recordCareAnswer({ petId: 'pet-b', sign: 'cough', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    mockServer = (r) => (r.id === second ? { data: null, error: { code: '', message: 'offline' } } : { data: [{ id: r.id as string }], error: null });
    await pushCareAnswers();
    expect(row(first).synced).toBe(1);
    expect(mockRegen).toHaveBeenCalledWith(PET);
    expect(mockRegen).not.toHaveBeenCalledWith('pet-b');
  });

  it('a sign-out while an insert is in the air marks nothing and arms no regen for the old account (CUL-642 class)', async () => {
    const id = await recordCareAnswer({ petId: PET, sign: 'vomit', source: 'my_vet_knows', anchorOn: '2026-09-30' }, nextId);
    mockServer = (r) => {
      notifySignedOut();
      return { data: [{ id: r.id as string }], error: null };
    };
    await pushCareAnswers();
    expect(row(id).synced).toBe(0);
    expect(mockRegen).not.toHaveBeenCalled();
  });
});

