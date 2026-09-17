// CUL-1039 (trial-window PR 2) — the window write path against a REAL engine.
//
// WHY THIS FILE EXISTS BESIDE lib/dietTrialSetup.test.ts. That suite drives the
// same function through a RECORDING mock and asserts the statement's shape: which
// columns are named, which params are bound, that nothing INSERTs. It cannot
// assert what the statement MEANS, and this write leans on one piece of SQL
// semantics hard enough that "it reads correctly" is not good enough:
//
//     SET target_duration_days = ?,
//         target_duration_days_initial = COALESCE(target_duration_days_initial,
//                                                 target_duration_days)
//
// The COALESCE names a column the line above it has just assigned. Every SET
// expression in an UPDATE evaluates against the PRE-UPDATE row, so it sees the OLD
// target — which is the entire mechanism by which `initial` captures the ORIGINAL
// window. If that were not true, or stopped being true, `initial` would capture the
// NEW window on every change, the two columns would be permanently equal, and
// §5.1's report sentence would render "extended from 84 days" over a trial that was
// extended TO 84. The report would be confidently wrong in the one place TE-4 says
// the record must be right, and every shape assertion in the sibling suite would
// still be green.
//
// So: node:sqlite, the production DDL, and the production function running against
// it. A fixture here is a row the app could actually have written (C-35).
//
// The two mocks are the module's edges, not its behaviour: the push is
// fire-and-forget and the recap offer is AsyncStorage. `getDb` is NOT mocked in the
// usual sense — it is pointed at a real database.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

const mockDb = { current: null as InstanceType<typeof DatabaseSync> | null };

// An adapter AT LEAST AS WIDE AS THE REAL API (C-39). `runAsync` returns the
// `{ changes }` expo-sqlite returns, because the production path reads it — a mock
// that dropped it would make the zero-row branch unassertable, which is the exact
// shape of the defect C-39 was written for.
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

jest.mock('./sync', () => ({
  syncPendingDietTrials: jest.fn().mockResolvedValue(undefined),
  syncPendingDietTrialFoods: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { changeTrialWindow, TrialWindowRefused } from './dietTrialSetup';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { toLocalDayKey } from './utils';

type Row = Record<string, unknown>;

/** Anchored to `Date.now()`, never a literal date — the floor under test is judged
 *  against a real-clock day counter (C-29). */
const dayKeyDaysAgo = (n: number): string =>
  toLocalDayKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

function seed(overrides: Record<string, unknown> = {}): void {
  const row = {
    id: 't-1',
    pet_id: 'pet-1',
    started_at: dayKeyDaysAgo(52), // day 53
    target_duration_days: 56,
    status: 'active',
    // The state migration 068's backfill CANNOT reach: a trial created between the
    // apply and this write path shipping. NULL means NOT RECORDED, never a number.
    target_duration_days_initial: null,
    target_duration_set_at: null,
    target_duration_vet_directed: null,
    ...overrides,
  };
  const cols = Object.keys(row);
  mockDb.current!
    .prepare(
      `INSERT INTO diet_trials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(',')})`,
    )
    .run(...(Object.values(row) as never[]));
}

const read = (id = 't-1'): Row =>
  mockDb.current!.prepare('SELECT * FROM diet_trials WHERE id = ?').get(id) as Row;

const countForPet = (petId = 'pet-1'): number =>
  (mockDb.current!
    .prepare('SELECT COUNT(*) AS n FROM diet_trials WHERE pet_id = ?')
    .get(petId) as { n: number }).n;

beforeEach(() => {
  mockDb.current = new DatabaseSync(':memory:');
  mockDb.current.exec(DIET_TRIAL_SCHEMA_SQL);
});
afterEach(() => {
  mockDb.current?.close();
  mockDb.current = null;
});

describe('changeTrialWindow against real SQLite (CUL-1039)', () => {
  it('captures the ORIGINAL window, reading the pre-update value the same statement overwrites', async () => {
    seed();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, vetDirected: true });
    const t = read();
    expect(t.target_duration_days).toBe(84);
    // 56, not 84. This is the assertion the whole file exists for.
    expect(t.target_duration_days_initial).toBe(56);
    expect(t.target_duration_vet_directed).toBe(1);
    expect(typeof t.target_duration_set_at).toBe('string');
  });

  it('a SECOND change moves the window and NOT the original', async () => {
    // "It is the ORIGINAL, and a second extension must not move it." An `initial`
    // that crept forward would make §5.1 say the window moved from wherever it last
    // was, which is a smaller and less clinically useful claim than the truth: the
    // signs had not resolved at EIGHT weeks.
    seed();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, now: new Date('2026-09-19T10:00:00.000Z') });
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 112, now: new Date('2026-10-10T10:00:00.000Z') });
    const t = read();
    expect(t.target_duration_days).toBe(112);
    expect(t.target_duration_days_initial).toBe(56);
    // The stamp is the LAST move, not the first — it is re-stamped every time.
    expect(t.target_duration_set_at).toBe('2026-10-10T10:00:00.000Z');
  });

  it('leaves an already-recorded original alone, even when 068 backfilled it', async () => {
    // The backfilled row: `initial` already equals the current target. COALESCE must
    // keep it rather than re-capture, and the two must be free to diverge from here.
    seed({ target_duration_days_initial: 56 });
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    expect(read().target_duration_days_initial).toBe(56);
  });

  it('is ONE row before and after — an episode is never split (TE-1)', async () => {
    seed();
    seed({ id: 't-old', status: 'completed', ended_at: dayKeyDaysAgo(200), started_at: dayKeyDaysAgo(260) });
    const before = countForPet();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    expect(countForPet()).toBe(before);
    expect(before).toBe(2);
  });

  it('stores the vet flag as 1 / 0 / NULL, and NULL is not 0', async () => {
    seed();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 70, vetDirected: false });
    expect(read().target_duration_vet_directed).toBe(0);
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    expect(read().target_duration_vet_directed).toBeNull();
  });

  it('re-arms a quarantined row and moves updated_at (the mirror contract + C-23)', async () => {
    // A row parked on a terminal error is skipped by the push queue, so an
    // owner-visible edit clearing sync_error is the ONLY way back in. And
    // markSynced matches on `updated_at`, so the write has to move it or an edit
    // made inside the network gap is stranded at synced = 1.
    seed();
    mockDb.current!
      .prepare(
        `UPDATE diet_trials SET synced = 1, sync_attempts = 4, sync_error = '23505: dup',
                                updated_at = '2026-08-01T00:00:00.000Z' WHERE id = 't-1'`,
      )
      .run();
    await changeTrialWindow({
      trialId: 't-1', targetDurationDays: 84, now: new Date('2026-09-19T10:00:00.000Z'),
    });
    const t = read();
    expect(t.synced).toBe(0);
    expect(t.sync_attempts).toBe(0);
    expect(t.sync_error).toBeNull();
    expect(t.updated_at).toBe('2026-09-19T10:00:00.000Z');
  });

  it('writes NOTHING at all when the window would move backward', async () => {
    // The shape assertions in the sibling suite prove `runAsync` was not called.
    // This proves the row is untouched — including the provenance columns, whose
    // presence is what every downstream reader switches on.
    seed();
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 28 }))
      .rejects.toBeInstanceOf(TrialWindowRefused);
    const t = read();
    expect(t.target_duration_days).toBe(56);
    expect(t.target_duration_set_at).toBeNull();
    expect(t.target_duration_days_initial).toBeNull();
  });

  it('refuses a trial id that is not there, rather than silently changing nothing', async () => {
    // C-39: a by-id UPDATE matching no row resolves { changes: 0 } and says nothing.
    // Driven end to end — the SELECT refuses first, and the zero-row branch behind
    // it is the belt for a row that vanishes between the two.
    seed();
    await expect(changeTrialWindow({ trialId: 't-missing', targetDurationDays: 84 }))
      .rejects.toMatchObject({ reason: 'not_found' });
    expect(read().target_duration_days).toBe(56);
  });
});
