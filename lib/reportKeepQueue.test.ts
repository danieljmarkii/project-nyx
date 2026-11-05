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
  drainPendingKeeps,
  keepReportCopy,
  pendingKeepMissNotice,
  type KeepAnswer,
} from './reportKeep';
import { keepsInFlight, sqliteKeepLedger, type KeepLedger, type LedgerDb, type PendingKeep } from './reportKeepLedger';

const PET = '11111111-2222-4333-8444-555555555555';
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const report = { html: '<html></html>', petId: PET, reportId: ID } as VetReport;
const T0 = Date.parse('2026-11-05T12:00:00.000Z');

function memoryLedger(seed: PendingKeep[] = []) {
  const rows = new Map(seed.map((r) => [r.reportId, r]));
  const ledger: KeepLedger = {
    record: async (e) => {
      const prior = rows.get(e.reportId);
      rows.set(e.reportId, prior ? { ...e, queuedAt: prior.queuedAt } : e);
    },
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
});

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

  it.each([
    ['kept', ok],
    ['failed', err(503)],
    ['failed', err(409)],
    ['expired', err(409, true)],
  ] as const)('a final %s in the session leaves no row (the screen already said it)', async (outcome, answer) => {
    const { ledger, rows } = memoryLedger();
    expect(await keepReportCopy(report, 'print', jest.fn(answer), KEEP_RETRY_DELAYS_MS, noWait, ledger, at(T0))).toBe(outcome);
    expect(rows.size).toBe(0);
  });

  it('the app closed mid-retry: the row stays, and the next open keeps it silently', async () => {
    const { ledger, rows } = memoryLedger();
    // The wait between tries never returns: the JS context is gone.
    void keepReportCopy(report, 'share', jest.fn(err(null)), KEEP_RETRY_DELAYS_MS, () => new Promise(() => undefined), ledger, at(T0));
    await new Promise((r) => setImmediate(r));
    expect([...rows.values()]).toEqual([{ reportId: ID, petId: PET, sharedVia: 'share', queuedAt: new Date(T0).toISOString() }]);
    keepsInFlight.clear(); // a fresh launch has no in-flight keeps
    const invoke = jest.fn(ok);
    expect(await drainPendingKeeps(invoke, ledger, at(T0 + 60_000))).toEqual([]);
    expect(invoke).toHaveBeenCalledWith({ mode: 'keep', petId: PET, reportId: ID, sharedVia: 'share' });
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

  it.each([
    ['offline', err(null)],
    ['a server error', err(503)],
    ['a session mid-refresh (401)', err(401)],
  ])('%s keeps the row for the next drain and says nothing', async (_label, answer) => {
    const { ledger, rows } = memoryLedger([row()]);
    expect(await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 1000))).toEqual([]);
    expect(rows.size).toBe(1);
  });

  it.each([
    ['a refusal (404: the draft is gone)', err(404)],
    ['a refusal (409: unavailable, or the AI summary was withdrawn)', err(409)],
    ['expired', err(409, true)],
  ])('%s is a miss, said once: the row is gone after', async (_label, answer) => {
    const { ledger, rows } = memoryLedger([row()]);
    expect(await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 1000))).toEqual([{ petId: PET, sharedVia: 'email' }]);
    expect(rows.size).toBe(0);
    expect(await drainPendingKeeps(jest.fn(answer), ledger, at(T0 + 2000))).toEqual([]);
  });

  it('past the keep window: a miss with no call; at the window edge it is still tried', async () => {
    const { ledger } = memoryLedger([row()]);
    const invoke = jest.fn(ok);
    expect(await drainPendingKeeps(invoke, ledger, at(T0 + KEEP_WINDOW_MS))).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
    const late = memoryLedger([row()]);
    const none = jest.fn(ok);
    expect(await drainPendingKeeps(none, late.ledger, at(T0 + KEEP_WINDOW_MS + 1))).toEqual([{ petId: PET, sharedVia: 'email' }]);
    expect(none).not.toHaveBeenCalled();
  });

  it('an unreadable queue time is a miss, never retried forever', async () => {
    const { ledger, rows } = memoryLedger([row({ queuedAt: 'garbage' })]);
    expect(await drainPendingKeeps(jest.fn(ok), ledger, at(T0))).toHaveLength(1);
    expect(rows.size).toBe(0);
  });

  it('skips a keep this session is still making', async () => {
    const { ledger, rows } = memoryLedger([row()]);
    keepsInFlight.add(ID);
    const invoke = jest.fn(err(404));
    expect(await drainPendingKeeps(invoke, ledger, at(T0))).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(rows.size).toBe(1);
  });

  it('one drain at a time: a second caller shares the first answer, each row is tried once', async () => {
    const { ledger } = memoryLedger([row(), row({ reportId: ID2 })]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const invoke = jest.fn(async () => {
      await gate;
      return { error: { message: 'x', status: 404, expired: false } };
    });
    const a = drainPendingKeeps(invoke, ledger, at(T0));
    const b = drainPendingKeeps(invoke, ledger, at(T0));
    expect(b).toBe(a);
    release();
    expect(await a).toHaveLength(2);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('an unreadable ledger is no drain, never a throw', async () => {
    const broken: KeepLedger = { record: async () => undefined, clear: async () => undefined, list: async () => { throw new Error('disk'); } };
    expect(await drainPendingKeeps(jest.fn(ok), broken, at(T0))).toEqual([]);
  });
});

describe('pendingKeepMissNotice', () => {
  const name = (id: string) => (id === PET ? 'Cooper' : id === 'p2' ? 'Juniper' : '');
  it('none is null; one names the pet and one action; no exclamation', () => {
    expect(pendingKeepMissNotice([], name)).toBeNull();
    const one = pendingKeepMissNotice([{ petId: PET, sharedVia: 'email' }], name);
    expect(one).toEqual({
      title: 'A report copy wasn’t saved',
      body: 'A copy of a vet report you sent wasn’t saved to Cooper’s vet reports. Preview the report again and send it to save one.',
    });
    expect(JSON.stringify(one)).not.toMatch(/!/);
  });
  it('several of one pet count; two pets, or an unknown one, say "your vet reports"', () => {
    expect(pendingKeepMissNotice([{ petId: PET, sharedVia: 'email' }, { petId: PET, sharedVia: 'print' }], name)?.body)
      .toBe('2 copies of vet reports you sent weren’t saved to Cooper’s vet reports. Preview the report again and send it to save one.');
    expect(pendingKeepMissNotice([{ petId: PET, sharedVia: 'email' }, { petId: 'p2', sharedVia: 'print' }], name)?.body).toMatch(/to your vet reports\./);
    expect(pendingKeepMissNotice([{ petId: 'gone', sharedVia: 'email' }], name)?.body).toMatch(/to your vet reports\./);
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

  it('records, lists oldest first, keeps the first queue time on a second send, clears', async () => {
    const ledger = sqliteKeepLedger(() => db);
    await ledger.record({ reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:00:00.000Z' });
    await ledger.record({ reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T13:00:00.000Z' });
    expect(await ledger.list()).toEqual([
      { reportId: ID, petId: PET, sharedVia: 'print', queuedAt: '2026-11-05T12:00:00.000Z' },
      { reportId: ID2, petId: PET, sharedVia: 'email', queuedAt: '2026-11-05T12:05:00.000Z' },
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
