// CUL-1329 — ending a trial against a REAL engine.
//
// `lib/dietTrialSetup.test.ts` drives `endActiveTrial` through a recording mock and
// pins the statement's shape: the predicate is in the SQL, `{ changes: 0 }` becomes a
// refusal. It cannot show that the predicate MEANS what it says — that a row another
// device already ended is left byte-for-byte alone, and that a refused call leaves no
// trace in the sync columns for the push to carry. That is the whole defect: a stale
// card wrote its own `ended_at` / `outcome` / `stopped_reason` over the first ending,
// and last-write-wins took it to the server.
//
// node:sqlite, the production DDL, the production function (the `dietTrialWindow.test.ts`
// harness). The adapter returns `{ changes }` as expo-sqlite does — a mock narrower than
// the API would hide the branch under test (C-39).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

const mockDb = { current: null as InstanceType<typeof DatabaseSync> | null };

jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = mockDb.current!.prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockDb.current!.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));

const mockSyncTrials = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingDietTrials: () => mockSyncTrials(),
  syncPendingDietTrialFoods: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { endActiveTrial, TrialEndRefused } from './dietTrialSetup';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';

type Row = Record<string, unknown>;

/** The row as it stands on the stale device once the OTHER device's ending has
 *  hydrated: completed on Sep 20 with the owner's read, pushed and acknowledged. */
const ENDED_ELSEWHERE = {
  status: 'completed',
  ended_at: '2026-09-20',
  completed_at: '2026-09-20',
  stopped_reason: null,
  outcome: 'improved',
  outcome_notes: 'Scratching stopped in week three.',
  updated_at: '2026-09-20T18:00:00.000Z',
  synced: 1,
  sync_attempts: 0,
  sync_error: null,
};

function seed(overrides: Record<string, unknown> = {}): void {
  const row = {
    id: 't-1',
    pet_id: 'pet-1',
    started_at: '2026-07-26',
    target_duration_days: 56,
    status: 'active',
    updated_at: '2026-07-26T09:00:00.000Z',
    synced: 1,
    ...overrides,
  };
  const cols = Object.keys(row);
  mockDb.current!
    .prepare(`INSERT INTO diet_trials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...(Object.values(row) as never[]));
}

const read = (id = 't-1'): Row =>
  mockDb.current!.prepare('SELECT * FROM diet_trials WHERE id = ?').get(id) as Row;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSyncTrials.mockClear();
  mockDb.current = new DatabaseSync(':memory:');
  mockDb.current.exec(DIET_TRIAL_SCHEMA_SQL);
});
afterEach(() => {
  mockDb.current?.close();
  mockDb.current = null;
});

describe('endActiveTrial against real SQLite (CUL-1329)', () => {
  it('ends a running trial, as before', async () => {
    seed();
    await endActiveTrial({ trialId: 't-1', reason: 'vet_advised', endedOn: '2026-09-22' });
    const t = read();
    expect(t.status).toBe('abandoned');
    expect(t.ended_at).toBe('2026-09-22');
    expect(t.stopped_reason).toBe('vet_advised');
    expect(t.synced).toBe(0);
  });

  it.each([
    ['*Stopped early*', { reason: 'refused' }],
    ['*This trial is done*', { reason: 'completed', outcome: 'no_change' as const, outcomeNotes: 'x' }],
  ])('refuses %s over a trial another device already ended, and leaves every column as it was', async (_label, args) => {
    seed(ENDED_ELSEWHERE);
    const before = read();

    const e = await endActiveTrial({ trialId: 't-1', endedOn: '2026-09-27', ...args })
      .catch((err: unknown) => err);

    expect(e).toBeInstanceOf(TrialEndRefused);
    expect(e).toMatchObject({ reason: 'not_running', status: 'completed', endedOn: '2026-09-20' });
    // Byte-for-byte: the first ending's date, outcome and reason survive, and the sync
    // columns do not move — `updated_at` unbumped and `synced` still 1 means nothing is
    // queued for the push to carry over the other device's ending.
    expect(read()).toEqual(before);
    await flush();
    expect(mockSyncTrials).not.toHaveBeenCalled();
  });

  it('refuses a second ending on the SAME device — the double-tap / other-host case', async () => {
    seed();
    await endActiveTrial({ trialId: 't-1', reason: 'completed', endedOn: '2026-09-22', outcome: 'improved' });
    const first = read();
    await expect(endActiveTrial({ trialId: 't-1', reason: 'refused', endedOn: '2026-09-23' }))
      .rejects.toMatchObject({ reason: 'not_running', endedOn: '2026-09-22' });
    expect(read()).toEqual(first);
  });

  it('refuses a trial id that is not there, rather than resolving over nothing', async () => {
    seed();
    await expect(endActiveTrial({ trialId: 't-missing', reason: 'completed' }))
      .rejects.toMatchObject({ reason: 'not_found' });
    expect(read().status).toBe('active');
  });

  it('still ends the sync-artefact row (active, but carrying an ended_at) — it holds the one-active slot', async () => {
    // Deliberately NOT `changeTrialWindow`'s second half. This row is what the start
    // modal's pre-flight finds and offers to end; refusing it would leave the owner
    // unable to end it and unable to start another trial.
    seed({ ended_at: '2026-09-18' });
    await endActiveTrial({ trialId: 't-1', reason: 'other', endedOn: '2026-09-22' });
    expect(read().status).toBe('abandoned');
  });
});
