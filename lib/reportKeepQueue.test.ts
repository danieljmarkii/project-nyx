// CUL-2522: a sent report's keep survives the app closing, or the owner is told once on the next
// open. Drives the real keepReportCopy / drainPendingKeeps over an in-memory ledger, and the real
// sqlite ledger over BASE_SCHEMA_SQL on node:sqlite.

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
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
  keepReportCopy,
  pendingKeepMissNotice,
  type KeepAnswer,
} from './reportKeep';
import { keepsAnswered, keepsInFlight, missesAwaitingAck, sqliteKeepLedger, type KeepLedger, type LedgerDb, type PendingKeep } from './reportKeepLedger';

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
    expect([...rows.values()]).toEqual([{ reportId: ID, petId: PET, sharedVia: 'share', queuedAt: new Date(T0).toISOString() }]);
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
  const row = (over: Partial<PendingKeep> = {}): PendingKeep => ({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: new Date(T0).toISOString(), ...over });
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
    await ledger.record({ reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:00:00.000Z' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T13:00:00.000Z' });
    // The route and its time travel together, so a replay stamps the later departure (rls R1).
    expect(await ledger.list()).toEqual([
      { reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z' },
      { reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T13:00:00.000Z' },
    ]);
    await ledger.clear(ID);
    expect((await ledger.list()).map((r) => r.reportId)).toEqual([ID2]);
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
