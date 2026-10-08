// Engines v3 PR-28b (CUL-1436): EN-4's durable re-check marker and its drain, against a
// REAL database (node:sqlite over the app's own schema constants, C-35). Spec §8.3, §8.4.
//
// Pinned here: the marker shares the write's transaction (a write that throws leaves no
// marker, and a marker never outlives its write); flag-off writes nothing new; the drain
// holds a marker until its event and a meal's row have landed, sends ONE `refloor` per
// event, marks what landed, waits on a transient failure for free, spends an attempt on a
// refusal, and hands the re-floored reads to the arrival rule.

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
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
}));

let mockFlags: Record<string, boolean> = {};
jest.mock('../hooks/useAppConfig', () => ({
  allowlistFlagNow: (key: string) => mockFlags[key] === true,
}));

// The server, at the one call the drain makes. Every invoke is recorded.
const mockInvokes: { name: string; body: Record<string, unknown> }[] = [];
let mockAnswer: (body: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({
  data: { success: true, refloored: 0, results: [] },
  error: null,
});
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    // The events / meals pushes the re-check asks for first. Offline, so a row that has
    // not landed stays unlanded and the marker behind it is held.
    from: jest.fn(() => ({
      upsert: () => ({ select: async () => ({ data: null, error: { code: '', message: 'Network request failed' } }) }),
    })),
    functions: {
      invoke: jest.fn(async (name: string, opts: { body: Record<string, unknown> }) => {
        mockInvokes.push({ name, body: opts.body });
        return mockAnswer(opts.body);
      }),
    },
  },
}));
const mockLanded = jest.fn(async (_l: unknown) => undefined);
jest.mock('./incidentFloorArrival', () => ({ onFloorLanded: (l: unknown) => mockLanded(l) }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { floorOnNow, owesFloorCheck, writeOwingFloorCheck, insertFloorMarker } from './incidentFloorQueue';
import { syncPendingIncidentFloors, notifySignedOut } from './sync';
import { MAX_SYNC_ATTEMPTS } from './syncQueue';

const PET = 'pet-a';
const ON = { engines_v3_en4: true, engines_v3_en3: true };

function seedEvent(id: string, type: string, synced = 1): void {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
       VALUES (?, ?, ?, '2026-10-08T12:00:00.000Z', 'manual', 'manual', '2026-10-08T12:00:00.000Z', '2026-10-08T12:00:00.000Z', ?)`,
    )
    .run(id, PET, type, synced);
}
const RUN = { runAsync: async (sql: string, params: (string | number | null)[]) => mockDb.prepare(sql).run(...(params as never[])) };
const markers = () => mockDb.prepare('SELECT * FROM incident_floor_queue ORDER BY created_at, rowid').all();

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockFlags = {};
  mockInvokes.length = 0;
  mockLanded.mockClear();
  mockAnswer = () => ({ data: { success: true, refloored: 0, results: [] }, error: null });
});
afterEach(() => mockDb.close());

describe('the floor keys (spec §8.10)', () => {
  it('needs BOTH keys, as the server does', () => {
    expect(floorOnNow()).toBe(false);
    mockFlags = { engines_v3_en4: true };
    expect(floorOnNow()).toBe(false);
    mockFlags = { engines_v3_en3: true };
    expect(floorOnNow()).toBe(false);
    mockFlags = ON;
    expect(floorOnNow()).toBe(true);
  });

  it('owes a check on the server’s three trigger types only', () => {
    expect(['vomit', 'lethargy', 'meal'].every(owesFloorCheck)).toBe(true);
    expect(['diarrhea', 'stool_normal', 'check_in', 'medication', null].some(owesFloorCheck)).toBe(false);
  });
});

describe('writeOwingFloorCheck — the marker shares the write’s transaction (§8.4)', () => {
  const softDelete = (id: string) => async () => {
    mockDb.prepare('UPDATE events SET deleted_at = ?, synced = 0 WHERE id = ?').run('2026-10-08T13:00:00.000Z', id);
  };

  it('flag off: the write runs, and nothing else is written', async () => {
    seedEvent('v1', 'vomit');
    await writeOwingFloorCheck('v1', softDelete('v1'));
    expect(markers()).toEqual([]);
    expect(mockDb.prepare('SELECT deleted_at FROM events WHERE id = ?').get('v1')).toEqual({ deleted_at: '2026-10-08T13:00:00.000Z' });
  });

  it('flag on, a trigger type: one marker, for that event and its pet', async () => {
    mockFlags = ON;
    seedEvent('l1', 'lethargy');
    await writeOwingFloorCheck('l1', softDelete('l1'));
    expect(markers()).toEqual([expect.objectContaining({ event_id: 'l1', pet_id: PET, synced: 0, sync_error: null })]);
  });

  it('flag on, another type: no marker', async () => {
    mockFlags = ON;
    seedEvent('d1', 'diarrhea');
    await writeOwingFloorCheck('d1', softDelete('d1'));
    expect(markers()).toEqual([]);
  });

  it('a write that throws leaves no marker behind (rolled back together)', async () => {
    mockFlags = ON;
    seedEvent('v1', 'vomit');
    await expect(
      writeOwingFloorCheck('v1', async () => {
        throw new Error('disk full');
      }),
    ).rejects.toThrow('disk full');
    expect(markers()).toEqual([]);
  });
});

describe('the drain (drainIncidentFloorQueue)', () => {
  beforeEach(() => {
    mockFlags = ON;
  });

  it('sends one refloor per event, however many markers wait on it, and marks them all', async () => {
    seedEvent('v1', 'vomit');
    seedEvent('l1', 'lethargy');
    for (const e of ['v1', 'v1', 'l1']) await insertFloorMarker(RUN, e, PET);
    await syncPendingIncidentFloors();
    expect(mockInvokes).toEqual([
      { name: 'analyze-vomit', body: { event_id: 'v1', mode: 'refloor' } },
      { name: 'analyze-vomit', body: { event_id: 'l1', mode: 'refloor' } },
    ]);
    expect(markers().every((m) => m.synced === 1)).toBe(true);
  });

  it('holds a marker until its event has landed', async () => {
    seedEvent('v1', 'vomit', 0);
    await insertFloorMarker(RUN, 'v1', PET);
    await syncPendingIncidentFloors();
    expect(mockInvokes).toEqual([]);
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 0, sync_attempts: 0 }));
  });

  it('holds a meal’s marker until the meal row (its rating) has landed', async () => {
    seedEvent('m1', 'meal');
    mockDb
      .prepare(`INSERT INTO meals (id, event_id, pet_id, quantity, intake_rating, created_at, updated_at, synced)
                VALUES ('meal-1', 'm1', ?, 'unknown', 'refused', '2026-10-08T12:00:00.000Z', '2026-10-08T12:00:00.000Z', 0)`)
      .run(PET);
    await insertFloorMarker(RUN, 'm1', PET);
    await syncPendingIncidentFloors();
    expect(mockInvokes).toEqual([]);
    mockDb.prepare(`UPDATE meals SET synced = 1 WHERE id = 'meal-1'`).run();
    await syncPendingIncidentFloors();
    expect(mockInvokes).toEqual([{ name: 'analyze-vomit', body: { event_id: 'm1', mode: 'refloor' } }]);
  });

  it('a skipped answer (flags off on the server) has landed: re-sending cannot change it', async () => {
    seedEvent('v1', 'vomit');
    await insertFloorMarker(RUN, 'v1', PET);
    mockAnswer = () => ({ data: { success: true, skipped: 'floor_off' }, error: null });
    await syncPendingIncidentFloors();
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 1 }));
    expect(mockLanded).not.toHaveBeenCalled();
  });

  it('offline (no status): stays queued and costs nothing', async () => {
    seedEvent('v1', 'vomit');
    await insertFloorMarker(RUN, 'v1', PET);
    mockAnswer = () => ({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    await syncPendingIncidentFloors();
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 0, sync_attempts: 0, sync_error: null }));
  });

  it('a refusal spends an attempt, and parks after the budget rather than re-sending forever', async () => {
    seedEvent('v1', 'vomit');
    await insertFloorMarker(RUN, 'v1', PET);
    mockAnswer = () => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 404 } }) });
    await syncPendingIncidentFloors();
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 0, sync_attempts: 1, sync_error: null }));
    for (let i = 1; i < MAX_SYNC_ATTEMPTS; i++) await syncPendingIncidentFloors();
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 0, sync_attempts: MAX_SYNC_ATTEMPTS }));
    expect(String(markers()[0].sync_error)).toMatch(/^refloor-404/);
  });

  it('hands the re-floored reads to the arrival rule, with the trigger that raised them', async () => {
    seedEvent('l1', 'lethargy');
    await insertFloorMarker(RUN, 'l1', PET);
    mockAnswer = () => ({
      data: { success: true, refloored: 2, results: [{ event_id: 'v1', status: 200 }, { event_id: 'v2', status: 200 }] },
      error: null,
    });
    await syncPendingIncidentFloors();
    expect(mockLanded).toHaveBeenCalledWith(expect.objectContaining({ triggerEventId: 'l1', petId: PET, eventIds: ['v1', 'v2'] }));
  });

  it('carries the newest device claim waiting on the event (§8.5)', async () => {
    seedEvent('v1', 'vomit');
    await insertFloorMarker(RUN, 'v1', PET);
    mockDb.prepare(`UPDATE incident_floor_queue SET device_claim = ? WHERE event_id = 'v1'`).run(JSON.stringify({ rule: 'vomit3', reads: [] }));
    await syncPendingIncidentFloors();
    expect(mockInvokes[0].body).toEqual({ event_id: 'v1', mode: 'refloor', device_claim: { rule: 'vomit3', reads: [] } });
  });

  it('a sign-out mid-request marks and says nothing', async () => {
    seedEvent('v1', 'vomit');
    await insertFloorMarker(RUN, 'v1', PET);
    mockAnswer = () => {
      notifySignedOut();
      return { data: { success: true, results: [{ event_id: 'v1', status: 200 }] }, error: null };
    };
    await syncPendingIncidentFloors();
    expect(markers()[0]).toEqual(expect.objectContaining({ synced: 0 }));
    expect(mockLanded).not.toHaveBeenCalled();
  });
});
