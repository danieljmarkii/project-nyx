// CUL-2522: a sent report's keep survives the app closing, or the owner is told once on the next
// open. Drives the real keepReportCopy / drainPendingKeeps over an in-memory ledger, and the real
// sqlite ledger over BASE_SCHEMA_SQL on node:sqlite.

// auth-js's session names the account a keep belongs to (CUL-2576); `mockUid` swaps it.
let mockUid: string | null = 'user-a';
jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { getSession: async () => ({ data: { session: mockUid === null ? null : { user: { id: mockUid } } } }) },
  },
}));
jest.mock('./db', () => ({ getDb: () => { throw new Error('no device db under test'); } }));

import * as fs from 'fs';
import * as path from 'path';
import type { VetReport } from './pdf';
import {
  KEEP_RETRY_DELAYS_MS,
  KEEP_WINDOW_MS,
  acknowledgeKeepMisses,
  drainPendingKeeps,
  pendingKeepsBeforeSignOut,
  pendingKeepCount,
  noteSignedOutKeepLoss,
  keepReportCopy,
  pendingKeepMissNotice,
  type KeepAnswer,
} from './reportKeep';
import { ACCEPT_WINDOW_MS, useKeepLossStore, keepLossNotice, mayHearKeepLoss } from '../store/keepLossStore';
import { clearKeepSessionState, keepsAnswered, keepsInFlight, missesAwaitingAck, sqliteKeepLedger, type KeepLedger, type LedgerDb, type PendingKeep } from './reportKeepLedger';

const PET = '11111111-2222-4333-8444-555555555555';
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const report = { html: '<html></html>', petId: PET, reportId: ID } as VetReport;
const T0 = Date.parse('2026-11-05T12:00:00.000Z');

function memoryLedger(seed: PendingKeep[] = []) {
  const rows = new Map(seed.map((r) => [r.reportId, r]));
  const ledger: KeepLedger = {
    record: async (e) => void rows.set(e.reportId, e),
    clear: async (id) => void rows.delete(id),
    list: async () => [...rows.values()],
  };
  return { ledger, rows };
}

const ok = async (): Promise<KeepAnswer> => ({ error: null });
const err = (status: number | null, expired = false) => async (): Promise<KeepAnswer> => ({ error: { message: 'x', status, expired } });
const noWait = async () => undefined;
const at = (ms: number) => () => ms;

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => {
  jest.restoreAllMocks();
  mockUid = 'user-a';
  keepsInFlight.clear();
  keepsAnswered.clear();
  missesAwaitingAck.clear();
});

/** A fresh launch: no keep of this JS session is running or answered. */
function relaunch() {
  keepsInFlight.clear();
  keepsAnswered.clear();
  missesAwaitingAck.clear();
}

describe('keepReportCopy writes the ledger before its first try and clears it on its final answer', () => {
  it('the row exists while the first call is out', async () => {
    const { ledger, rows } = memoryLedger();
    const seen: number[] = [];
    const invoke = jest.fn(async () => {
      seen.push(rows.size);
      return { error: null };
    });
    expect(await keepReportCopy(report, 'email', invoke, KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe('kept');
    expect(seen).toEqual([1]);
    expect(rows.size).toBe(0);
  });

  it('a kept copy clears its row', async () => {
    const { ledger, rows } = memoryLedger();
    expect(await keepReportCopy(report, 'print', jest.fn(ok), KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe('kept');
    expect(rows.size).toBe(0);
  });

  it.each([
    ['failed', err(503), 'retried'],
    ['failed', err(409), 'said'],
    ['expired', err(409, true), 'said'],
  ] as const)('a %s answer leaves its row for the NEXT launch, which has it %s (the screen may be gone: adversarial 1, 2)', async (outcome, answer, next) => {
    const { ledger, rows } = memoryLedger();
    expect(await keepReportCopy(report, 'print', jest.fn(answer), KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe(outcome);
    expect(rows.size).toBe(1);
    // This launch's drain leaves it alone: the screen has its line.
    const sameLaunch = jest.fn(ok);
    expect(await drainPendingKeeps(sameLaunch, ledger, at(T0 + 1000))).toEqual([]);
    expect(sameLaunch).not.toHaveBeenCalled();
    relaunch();
    const misses = await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 2000));
    expect(misses).toHaveLength(next === 'said' ? 1 : 0);
    expect(rows.size).toBe(1);
  });

  it('the app closed mid-retry: the row stays, and the next open keeps it silently', async () => {
    const { ledger, rows } = memoryLedger();
    // The wait between tries never returns: the JS context is gone.
    void keepReportCopy(report, 'share', jest.fn(err(null)), KEEP_RETRY_DELAYS_MS, () => new Promise(() => undefined), ledger, at(T0));
    await new Promise((r) => setImmediate(r));
    expect([...rows.values()]).toEqual([{ reportId: ID, petId: PET, sharedVia: 'share', queuedAt: new Date(T0).toISOString(), userId: 'user-a' }]);
    relaunch();
    const invoke = jest.fn(ok);
    expect(await drainPendingKeeps(invoke, ledger, at(T0 + 60_000))).toEqual([]);
    // The retry names the send's own time, so the copy never says it left at this open (rls F3).
    expect(invoke).toHaveBeenCalledWith({ mode: 'keep', petId: PET, reportId: ID, sharedVia: 'share', sharedAt: new Date(T0).toISOString() });
    expect(rows.size).toBe(0);
  });

  it('an unsaved report writes nothing', async () => {
    const { ledger, rows } = memoryLedger();
    expect(await keepReportCopy({ ...report, reportId: null }, 'email', jest.fn(ok), KEEP_RETRY_DELAYS_MS, noWait, ledger)).toBe('not_saved');
    expect(rows.size).toBe(0);
  });

  it('a broken ledger never blocks the keep or changes its answer', async () => {
    const broken: KeepLedger = { record: async () => { throw new Error('disk'); }, clear: async () => { throw new Error('disk'); }, list: async () => [] };
    expect(await keepReportCopy(report, 'email', jest.fn(ok), KEEP_RETRY_DELAYS_MS, noWait, broken)).toBe('kept');
    expect(await keepReportCopy(report, 'email', jest.fn(err(409)), KEEP_RETRY_DELAYS_MS, noWait, broken)).toBe('failed');
  });
});

describe('drainPendingKeeps', () => {
  const row = (over: Partial<PendingKeep> = {}): PendingKeep => ({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: new Date(T0).toISOString(), userId: 'user-a', ...over });
  const missOf = (r: PendingKeep) => ({ reportId: r.reportId, petId: r.petId, sharedVia: r.sharedVia });

  it.each([
    ['offline', err(null)],
    ['a server error', err(503)],
    ['a session mid-refresh (401)', err(401)],
  ])('%s inside the window keeps the row for the next drain and says nothing', async (_label, answer) => {
    const { ledger, rows } = memoryLedger([row()]);
    expect(await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 1000))).toEqual([]);
    expect(rows.size).toBe(1);
  });

  it.each([
    ['a refusal (404: the draft is gone)', err(404)],
    ['a refusal (409: unavailable)', err(409)],
    ['expired, or a copy that needs a new preview', err(409, true)],
  ])('%s is a miss; its row goes only when the owner dismisses the notice', async (_label, answer) => {
    const { ledger, rows } = memoryLedger([row()]);
    const misses = await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 1000));
    expect(misses).toEqual([missOf(row())]);
    expect(rows.size).toBe(1);
    // A second drain while the notice is up says nothing more.
    expect(await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 2000))).toEqual([]);
    await acknowledgeKeepMisses(misses, ledger);
    expect(rows.size).toBe(0);
  });

  it('a notice that never showed is said again at the next launch (adversarial 3)', async () => {
    const { ledger } = memoryLedger([row()]);
    expect(await drainPendingKeeps(jest.fn(err(404)), ledger, at(T0))).toHaveLength(1);
    relaunch(); // killed before OK
    expect(await drainPendingKeeps(jest.fn(err(404)), ledger, at(T0))).toHaveLength(1);
  });

  it('past the window the server is still asked: a copy that was kept is never called unsaved (adversarial 6)', async () => {
    const kept = memoryLedger([row()]);
    const invoke = jest.fn(ok);
    expect(await drainPendingKeeps(invoke, kept.ledger, at(T0 + KEEP_WINDOW_MS + 1))).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(kept.rows.size).toBe(0);
    // A passing failure past the window is a miss, said once, never retried forever.
    const late = memoryLedger([row()]);
    expect(await drainPendingKeeps(jest.fn(err(null)), late.ledger, at(T0 + KEEP_WINDOW_MS + 1))).toEqual([missOf(row())]);
    relaunch();
    const bad = memoryLedger([row({ queuedAt: 'garbage' })]);
    expect(await drainPendingKeeps(jest.fn(err(503)), bad.ledger, at(T0))).toHaveLength(1);
  });

  it('skips a keep this session is still making', async () => {
    const { ledger, rows } = memoryLedger([row()]);
    keepsInFlight.add(ID);
    const invoke = jest.fn(err(404));
    expect(await drainPendingKeeps(invoke, ledger, at(T0))).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(rows.size).toBe(1);
  });

  it('one drain at a time: a second caller waits and says nothing, each row is tried once (adversarial 8)', async () => {
    const { ledger } = memoryLedger([row(), row({ reportId: ID2 })]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const invoke = jest.fn(async () => {
      await gate;
      return { error: { message: 'x', status: 404, expired: false } };
    });
    const a = drainPendingKeeps(invoke, ledger, at(T0));
    const b = drainPendingKeeps(invoke, ledger, at(T0));
    release();
    expect(await a).toHaveLength(2);
    expect(await b).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a sign-out mid-drain sends nothing more and says nothing (rls F1)', async () => {
    const epoch = jest.requireActual('./signOutEpoch') as { notifySignedOut?: () => void; bumpSignOutEpoch?: () => void };
    const bump = epoch.notifySignedOut ?? epoch.bumpSignOutEpoch;
    if (!bump) throw new Error('no sign-out epoch bump exported');
    const { ledger } = memoryLedger([row(), row({ reportId: ID2 })]);
    const invoke = jest.fn(async () => {
      bump();
      return { error: { message: 'x', status: 404, expired: false } };
    });
    expect(await drainPendingKeeps(invoke, ledger, at(T0))).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('an unreadable ledger is no drain, never a throw', async () => {
    const broken: KeepLedger = { record: async () => undefined, clear: async () => undefined, list: async () => { throw new Error('disk'); } };
    expect(await drainPendingKeeps(jest.fn(ok), broken, at(T0))).toEqual([]);
  });

  it('before sign-out: one drain, then what still waits is counted as unsent (rls F2)', async () => {
    const { ledger } = memoryLedger([row(), row({ reportId: ID2 })]);
    const invoke = jest.fn(async (body: Record<string, unknown>) => (body.reportId === ID ? { error: null } : { error: { message: 'x', status: null, expired: false } }));
    expect(await pendingKeepsBeforeSignOut(invoke, ledger, at(T0))).toBe(1);
    const broken: KeepLedger = { record: async () => undefined, clear: async () => undefined, list: async () => { throw new Error('disk'); } };
    expect(await pendingKeepsBeforeSignOut(jest.fn(ok), broken, at(T0))).toBe(1);
  });

  it('the sign-out drain is the last chance: it retries a row this launch already answered (adversarial pass 2, S1)', async () => {
    const { ledger, rows } = memoryLedger();
    expect(await keepReportCopy(report, 'email', jest.fn(err(null)), KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe('failed');
    const online = jest.fn(ok);
    expect(await pendingKeepsBeforeSignOut(online, ledger, at(T0 + 1000))).toBe(0);
    expect(online).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(0);
  });

  it('a miss found before sign-out is still said if the owner stays signed in (rls R3)', async () => {
    const { ledger } = memoryLedger([row()]);
    expect(await pendingKeepsBeforeSignOut(jest.fn(err(404)), ledger, at(T0))).toBe(1);
    expect(await drainPendingKeeps(jest.fn(err(404)), ledger, at(T0))).toEqual([missOf(row())]);
  });
});

describe('a ledger row belongs to its account (CUL-2576)', () => {
  const row = (over: Partial<PendingKeep> = {}): PendingKeep => ({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: new Date(T0).toISOString(), userId: 'user-a', ...over });

  it('a keep records the account whose token it carries', async () => {
    mockUid = 'user-b';
    const { ledger, rows } = memoryLedger();
    void keepReportCopy(report, 'email', jest.fn(err(null)), KEEP_RETRY_DELAYS_MS, () => new Promise(() => undefined), ledger, at(T0));
    await new Promise((r) => setImmediate(r));
    expect(rows.get(ID)?.userId).toBe('user-b');
  });

  it('auth-js reading no session (an expired token offline) still leaves a row, under the store account (adversarial pass 1, finding 1)', async () => {
    mockUid = null;
    const { useAuthStore } = jest.requireActual('../store/authStore') as typeof import('../store/authStore');
    useAuthStore.setState({ session: { user: { id: 'user-a' } } as never });
    try {
      const { ledger, rows } = memoryLedger();
      void keepReportCopy(report, 'shown', jest.fn(err(null)), KEEP_RETRY_DELAYS_MS, () => new Promise(() => undefined), ledger, at(T0));
      await new Promise((r) => setImmediate(r));
      expect(rows.get(ID)?.userId).toBe('user-a');
    } finally {
      useAuthStore.setState({ session: null });
    }
  });

  it('with no session anywhere a keep writes no row (no drain could send it) and still tries once', async () => {
    mockUid = null;
    const { ledger, rows } = memoryLedger();
    const invoke = jest.fn(err(401));
    expect(await keepReportCopy(report, 'email', invoke, KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe('failed');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(0);
  });

  it("another account's row is deleted unsent and never said", async () => {
    mockUid = 'user-b';
    const { ledger, rows } = memoryLedger([row()]);
    const invoke = jest.fn(err(404));
    expect(await drainPendingKeeps(invoke, ledger, at(T0 + 1000))).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });

  it('a row naming no account (the build before user_id) is never sent, said with no pet, and goes on OK (CUL-2602 stopgap)', async () => {
    const legacy = row({ reportId: ID2, userId: null });
    const { ledger, rows } = memoryLedger([legacy]);
    const invoke = jest.fn(ok);
    const misses = await drainPendingKeeps(invoke, ledger, at(T0 + 1000));
    expect(invoke).not.toHaveBeenCalled();
    expect(misses).toEqual([{ reportId: ID2, petId: '', sharedVia: 'email' }]);
    expect(pendingKeepMissNotice(misses, () => 'Cooper')?.body).toMatch(/to your vet reports\./);
    expect(rows.size).toBe(1);
    // Counted at a sign-out, never deleted unsaid.
    expect(await pendingKeepCount('user-a', ledger)).toBe(1);
    await acknowledgeKeepMisses(misses, ledger);
    expect(rows.size).toBe(0);
  });

  it("this account's row is still tried and said, beside another account's", async () => {
    const mine = row({ reportId: ID2 });
    const { ledger, rows } = memoryLedger([row({ userId: 'user-b' }), mine]);
    const invoke = jest.fn(err(404));
    expect(await drainPendingKeeps(invoke, ledger, at(T0 + 1000))).toEqual([{ reportId: ID2, petId: PET, sharedVia: 'email' }]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect([...rows.keys()]).toEqual([ID2]);
  });

  it('no session: no drain sends or says anything, and no row is touched', async () => {
    mockUid = null;
    const { ledger, rows } = memoryLedger([row()]);
    const invoke = jest.fn(err(404));
    expect(await drainPendingKeeps(invoke, ledger, at(T0))).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(rows.size).toBe(1);
  });

  it("the sign-out count is this account's rows only; with no account, any row counts as one", async () => {
    const { ledger } = memoryLedger([row(), row({ reportId: ID2, userId: 'user-b' })]);
    expect(await pendingKeepCount('user-a', ledger)).toBe(1);
    // No account: every row counts, never collapsed to one (adversarial pass 1, finding 2).
    expect(await pendingKeepCount(null, memoryLedger([row(), row({ reportId: ID2 }), row({ reportId: 'x', userId: 'user-b' })]).ledger)).toBe(3);
    expect(await pendingKeepCount(null, memoryLedger().ledger)).toBe(0);
    const broken: KeepLedger = { record: async () => undefined, clear: async () => undefined, list: async () => { throw new Error('disk'); } };
    expect(await pendingKeepCount('user-a', broken)).toBe(1);
  });

  it('the sign-out teardown empties the in-memory sets', () => {
    keepsInFlight.add(ID);
    keepsAnswered.add(ID);
    missesAwaitingAck.add(ID2);
    clearKeepSessionState();
    expect([keepsInFlight.size, keepsAnswered.size, missesAwaitingAck.size]).toEqual([0, 0, 0]);
  });
});

describe('a forced sign-out says what its wipe took (CUL-2573)', () => {
  const row = (over: Partial<PendingKeep> = {}): PendingKeep => ({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: new Date(T0).toISOString(), userId: 'user-a', ...over });
  beforeEach(() => useKeepLossStore.setState({ lost: null, accepted: null }));

  it("an unconfirmed SIGNED_OUT notes the account's waiting copies, and only its own", async () => {
    const { ledger } = memoryLedger([row(), row({ reportId: ID2 }), row({ reportId: 'x', userId: 'user-b' })]);
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: false }, ledger);
    expect(useKeepLossStore.getState().lost).toEqual({ userId: 'user-a', count: 2 });
  });

  it('the Settings sign-out that warned and was confirmed notes nothing, once', async () => {
    const { ledger } = memoryLedger([row()]);
    useKeepLossStore.getState().acceptNextSignOut();
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: false }, ledger);
    expect(useKeepLossStore.getState().lost).toBeNull();
    // The acceptance is one-shot: the next forced sign-out is said.
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: false }, ledger);
    expect(useKeepLossStore.getState().lost).toEqual({ userId: 'user-a', count: 1 });
  });

  it('an acceptance whose sign-out never came is spent after a minute: the next forced one is said', async () => {
    const { ledger } = memoryLedger([row()]);
    useKeepLossStore.getState().acceptNextSignOut(Date.now() - ACCEPT_WINDOW_MS - 1);
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: false }, ledger);
    expect(useKeepLossStore.getState().lost).toEqual({ userId: 'user-a', count: 1 });
  });

  it('a deleted account notes nothing: its reports went with it', async () => {
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: true }, memoryLedger([row()]).ledger);
    expect(useKeepLossStore.getState().lost).toBeNull();
  });

  it('an unreadable ledger is a loss said, never none', async () => {
    const broken: KeepLedger = { record: async () => undefined, clear: async () => undefined, list: async () => { throw new Error('disk'); } };
    await noteSignedOutKeepLoss({ userId: 'user-a', justDeletedAccount: false }, broken);
    expect(useKeepLossStore.getState().lost).toEqual({ userId: 'user-a', count: 1 });
  });

  it('one account adds up; another replaces it; who may hear it', () => {
    const s = useKeepLossStore.getState();
    s.note('user-a', 1);
    s.note('user-a', 2);
    expect(useKeepLossStore.getState().lost).toEqual({ userId: 'user-a', count: 3 });
    s.note('user-b', 1);
    expect(useKeepLossStore.getState().take()).toEqual({ userId: 'user-b', count: 1 });
    expect(useKeepLossStore.getState().lost).toBeNull();
    expect([mayHearKeepLoss('user-a', null), mayHearKeepLoss('user-a', 'user-a'), mayHearKeepLoss('user-a', 'user-b'), mayHearKeepLoss(null, 'user-a')])
      .toEqual([true, true, false, false]);
  });

  it('the line names the count, no pet, and no exclamation', () => {
    expect(keepLossNotice(0)).toBeNull();
    expect(keepLossNotice(1)?.body).toBe('You were signed out before a copy of a vet report you sent could be saved to your vet reports. Preview the report again and send it to save one.');
    expect(keepLossNotice(3)?.body).toMatch(/^You were signed out before 3 copies of vet reports you sent/);
    expect(JSON.stringify([keepLossNotice(1), keepLossNotice(3)])).not.toMatch(/!/);
  });
});

describe('pendingKeepMissNotice', () => {
  const m = (petId: string, sharedVia = 'email') => ({ reportId: `r-${petId}-${sharedVia}`, petId, sharedVia });
  const name = (id: string) => (id === PET ? 'Cooper' : id === 'p2' ? 'Juniper' : '');
  it('none is null; one names the pet and one action; no exclamation', () => {
    expect(pendingKeepMissNotice([], name)).toBeNull();
    const one = pendingKeepMissNotice([m(PET)], name);
    expect(one).toEqual({
      title: 'A report copy wasn’t saved',
      body: 'A copy of a vet report you sent wasn’t saved to Cooper’s vet reports. Preview the report again and send it to save one.',
    });
    expect(JSON.stringify(one)).not.toMatch(/!/);
  });
  it('several of one pet count; two pets, or an unknown one, say "your vet reports"', () => {
    expect(pendingKeepMissNotice([m(PET), m(PET, 'print')], name)?.body)
      .toBe('2 copies of vet reports you sent weren’t saved to Cooper’s vet reports. Preview the report again and send it to save one.');
    expect(pendingKeepMissNotice([m(PET), m('p2', 'print')], name)?.body).toMatch(/to your vet reports\./);
    expect(pendingKeepMissNotice([m('gone')], name)?.body).toMatch(/to your vet reports\./);
  });
});

describe('the sqlite ledger, over the shipped DDL', () => {
  const { DatabaseSync } = require('node:sqlite');
  let raw: InstanceType<typeof DatabaseSync>;
  let db: LedgerDb;
  beforeEach(() => {
    const { BASE_SCHEMA_SQL } = jest.requireActual('./localSchema');
    raw = new DatabaseSync(':memory:');
    raw.exec(BASE_SCHEMA_SQL);
    db = {
      runAsync: async (sql, ...p) => raw.prepare(sql).run(...p),
      getAllAsync: async <T,>(sql: string, ...p: Array<string | number | null>) => raw.prepare(sql).all(...p) as T[],
    };
  });

  it('records, lists oldest first, takes the latest send of a report, clears', async () => {
    const ledger = sqliteKeepLedger(() => db);
    await ledger.record({ reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z', userId: 'user-a' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:00:00.000Z', userId: 'user-a' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T13:00:00.000Z', userId: 'user-b' });
    // The route, its time and its account travel together, so a replay stamps the later
    // departure (rls R1) under the account that made it (CUL-2576).
    expect(await ledger.list()).toEqual([
      { reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z', userId: 'user-a' },
      { reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T13:00:00.000Z', userId: 'user-b' },
    ]);
    await ledger.clear(ID);
    expect((await ledger.list()).map((r) => r.reportId)).toEqual([ID2]);
  });

  it('a device upgrading from before user_id gets the column, and its old rows read as no account', async () => {
    const { COLUMN_UPGRADES } = jest.requireActual('./localSchema');
    const old = new DatabaseSync(':memory:');
    old.exec('CREATE TABLE pending_report_keeps (report_id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, shared_via TEXT NOT NULL, queued_at TEXT NOT NULL)');
    old.prepare('INSERT INTO pending_report_keeps VALUES (?, ?, ?, ?)').run(ID, PET, 'email', '2026-11-05T12:00:00.000Z');
    for (const u of COLUMN_UPGRADES.filter((c: { table: string }) => c.table === 'pending_report_keeps')) {
      old.exec(`ALTER TABLE ${u.table} ADD COLUMN ${u.column} ${u.type}`);
    }
    const ledger = sqliteKeepLedger(() => ({
      runAsync: async (sql, ...p) => old.prepare(sql).run(...p),
      getAllAsync: async <T,>(sql: string, ...p: Array<string | number | null>) => old.prepare(sql).all(...p) as T[],
    }));
    expect((await ledger.list())[0].userId).toBeNull();
  });
});

describe('KEEP_WINDOW_MS mirrors the server (same question: how long a draft stays keepable)', () => {
  it('equals savedCopy.ts DRAFT_TTL_MS less an hour', () => {
    const src = fs.readFileSync(path.join(__dirname, '../supabase/functions/generate-report/savedCopy.ts'), 'utf8');
    expect(src).toMatch(/export const DRAFT_TTL_MS = 24 \* 60 \* 60 \* 1000\n/);
    expect(src).toMatch(/export const KEEP_WINDOW_MS = DRAFT_TTL_MS - 60 \* 60 \* 1000\n/);
    expect(KEEP_WINDOW_MS).toBe(24 * 60 * 60 * 1000 - 60 * 60 * 1000);
  });
});
