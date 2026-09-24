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

import { changeTrialWindow, setTrialTargetProtein, TrialWindowRefused } from './dietTrialSetup';
import { DIET_TRIAL_SCHEMA_SQL, dietTrialRowToRemote, type LocalDietTrial } from './dietTrialMirror';
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

  it('refuses a trial marked active that nevertheless carries an ended_at', async () => {
    // NOT a redundant half of the status gate. `lib/dietTrial.ts:391` treats an
    // `ended_at` on an `active` row as a sync artefact that is still an
    // OWNER-AUTHORED FACT and honours it as the trial's end — so a write path
    // reading only `status` would go on extending a trial every read surface
    // already considers over. Found by the adversarial pass: the mutant dropping
    // this half was green across all 8,422 tests, because the one "ended" fixture
    // set BOTH fields and the half that matters was never exercised.
    seed({ status: 'active', ended_at: dayKeyDaysAgo(2) });
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }))
      .rejects.toMatchObject({ reason: 'not_running' });
    expect(read().target_duration_days).toBe(56);
  });

  it('floors a fractional total rather than rounding it up past what was asked', async () => {
    // The `Math.floor` → `Math.round` mutant was also green. It is behaviour-
    // changing at the half-day: 56.9 floors to 56 and is refused as the no-op,
    // where rounding would write 57 — a day the owner never chose, on the column
    // the report prints as the prescribed window.
    seed();
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 56.9 }))
      .rejects.toMatchObject({ reason: 'not_forward' });
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84.7 });
    expect(read().target_duration_days).toBe(84);
  });

  it('refuses a total the column cannot hold, rather than bricking the row', async () => {
    // Above int4, PostgREST answers `22003`, which is NOT in
    // TERMINAL_SYNC_ERROR_CODES — so the row would never quarantine, would retry
    // forever, and everything that happened to that trial afterwards (its
    // completion, its outcome) would never reach the server. The cost of a
    // mistyped digit would be the whole row's sync, silently.
    seed();
    for (const tooBig of [2147483648, Number.MAX_SAFE_INTEGER]) {
      await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: tooBig }))
        .rejects.toMatchObject({ reason: 'out_of_range' });
    }
    expect(read().target_duration_days).toBe(56);
    // The bound is the column's, not a clinical one — 2147483647 itself writes.
    // PR 3's sheet owns the sane maximum (CUL-1040).
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 2147483647 });
    expect(read().target_duration_days).toBe(2147483647);
  });

  it('every refusal arm leaves the row explaining itself — the card is stale, not broken', async () => {
    // The property `handleExtendTrial` relies on: a refusal never means "try
    // again", it means the caller was rendered from a row that has moved. Asserted
    // here, at the layer that owns it, rather than through a screen that would test
    // its plumbing instead of the claim.
    seed();
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 30 }))
      .rejects.toMatchObject({ reason: 'not_forward' });
    expect(read().target_duration_days).toBeGreaterThanOrEqual(30);

    mockDb.current!.prepare(`UPDATE diet_trials SET status = 'completed' WHERE id = 't-1'`).run();
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }))
      .rejects.toMatchObject({ reason: 'not_running' });
    expect(read().status).toBe('completed');
  });
});

// ── §5.6's untested half: concurrent change from two devices (CUL-1039) ──────
//
// The spec put this in PR 2's test plan and it had no test. It cannot be run
// against a real PostgREST from here, so the harness is two real SQLite mirrors and
// a stand-in server that applies exactly what `supabase.upsert({onConflict:'id'})`
// applies — the pushed payload wins wholesale, last push first — and hands rows
// back the way `hydrateDietTrials` writes them.
//
// WHAT IT PINS, and the distinction is the point: the FIRST case is the design
// working (D1a), the SECOND is a KNOWN residual filed as CUL-1044. Asserting the
// residual's current behaviour is deliberate — it is a hazard the local predicate
// provably cannot see, and an undocumented one gets rediscovered as a new bug.
//
// STATED BLIND SPOT: this models the merge, it does not execute PostgREST. The
// server's own `set_updated_at()` trigger and its ordering under real concurrency
// are not exercised, and no test here can close that.
describe('two devices, one window (§5.6, CUL-1044)', () => {
  const deviceA = { db: null as InstanceType<typeof DatabaseSync> | null };
  const deviceB = { db: null as InstanceType<typeof DatabaseSync> | null };

  const on = <T,>(device: { db: InstanceType<typeof DatabaseSync> | null }, run: () => Promise<T>) => {
    mockDb.current = device.db;
    return run();
  };

  const rowOf = (device: { db: InstanceType<typeof DatabaseSync> | null }): Row =>
    device.db!.prepare('SELECT * FROM diet_trials WHERE id = ?').get('t-1') as Row;

  /** The server's view after a push, LWW by arrival. */
  let server: Record<string, unknown>;
  const push = (device: { db: InstanceType<typeof DatabaseSync> | null }): void => {
    const local = rowOf(device);
    server = {
      ...dietTrialRowToRemote(local as unknown as LocalDietTrial),
      // The server rewrites updated_at on the conflict branch (the mapper's note).
      updated_at: new Date().toISOString(),
    };
  };

  beforeEach(() => {
    // The outer beforeEach already made one database and pointed `mockDb` at it;
    // this suite needs two, so that one is closed rather than orphaned.
    mockDb.current?.close();
    for (const d of [deviceA, deviceB]) {
      d.db = new DatabaseSync(':memory:');
      d.db.exec(DIET_TRIAL_SCHEMA_SQL);
      mockDb.current = d.db;
      seed();
    }
  });
  afterEach(() => {
    deviceA.db?.close(); deviceB.db?.close();
    deviceA.db = null; deviceB.db = null;
    // Cleared LAST, so the outer afterEach does not try to close a database this
    // one just closed — jest runs the inner hook first, the outer second.
    mockDb.current = null;
  });

  it('TOTALS CONVERGE — two caregivers told "twelve weeks" agree, which is D1a working', async () => {
    // The reason last-write-wins is accepted here. Both owners state the same
    // TOTAL, both writes land 84, and the collapse is the right answer rather than
    // a lost update. Two DELTAS would each have added their own fortnight and
    // collapsed to one, with both believing theirs landed.
    await on(deviceA, () => changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }));
    await on(deviceB, () => changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }));
    push(deviceA);
    push(deviceB);
    expect(server.target_duration_days).toBe(84);
    expect(rowOf(deviceA).target_duration_days).toBe(84);
    expect(rowOf(deviceB).target_duration_days).toBe(84);
    // And the provenance agrees on the fact, whatever the timestamps: the window moved.
    expect(rowOf(deviceA).target_duration_set_at).not.toBeNull();
    expect(server.target_duration_days_initial).toBe(56);
  });

  it('A STALE DEVICE CAN LAND A BACKWARD WINDOW — the residual the local floor cannot see (CUL-1044)', async () => {
    // Device A extends to 84 and pushes. Device B has not hydrated it, so B's floor
    // is its own stored 56 — against which 70 is genuinely forward, and the
    // predicate accepts it CORRECTLY on the evidence B holds. B pushes last and the
    // server keeps 70: a window backward of one the owner already set, through the
    // one door TE-3 closes locally.
    //
    // This is asserted as CURRENT BEHAVIOUR, not as desired behaviour. Nothing on
    // the device can close it — B cannot distinguish "the owner wants 70" from "the
    // owner wants 70 and someone already said 84" — so the fix is a monotonic guard
    // at the server, which is CUL-1044's own migration and its own pass.
    await on(deviceA, () => changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }));
    push(deviceA);
    expect(server.target_duration_days).toBe(84);

    await on(deviceB, () => changeTrialWindow({ trialId: 't-1', targetDurationDays: 70 }));
    push(deviceB);
    expect(server.target_duration_days).toBe(70);
    // The fingerprint that makes this CUL-1044 and not a broken predicate: B's own
    // floor was honoured, and the loss happened entirely at the merge.
    expect(rowOf(deviceB).target_duration_days_initial).toBe(56);
  });

  it('AN UNRELATED WRITE ON A STALE DEVICE UN-RECORDS THE PROVENANCE (CUL-1044, widened)', async () => {
    // A stale device's owner does something else entirely — confirms the trial's
    // protein — and its payload carries the provenance columns as EXPLICIT NULLs,
    // because the push sends the whole row. TE-4 says the record must keep the fact
    // that the window moved; a sibling device erases it without touching a window.
    //
    // This is the repo's last-write-wins hard constraint ("no merge logic",
    // CLAUDE.md § Engineering hard constraints) meeting a column whose value is
    // PROVENANCE, and it is why CUL-1044 is not only about shortening.
    await on(deviceA, () => changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, vetDirected: true }));
    push(deviceA);
    expect(server.target_duration_set_at).not.toBeNull();
    expect(server.target_duration_vet_directed).toBe(true);

    await on(deviceB, () => setTrialTargetProtein({ trialId: 't-1', protein: 'duck' }));
    push(deviceB);
    // The keys are PRESENT and null — not absent, so the upsert writes them.
    expect(Object.keys(server)).toContain('target_duration_set_at');
    expect(server.target_duration_set_at).toBeNull();
    expect(server.target_duration_vet_directed).toBeNull();
    expect(server.target_duration_days).toBe(56);
  });
});
