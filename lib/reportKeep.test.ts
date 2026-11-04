// The owner's kept copy (Vet report v2 PR-20, CUL-2300): which platform answers keep a copy,
// what the keep call names, and that it never throws into the send flow.

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';
import { KEEP_RETRY_DELAYS_MS, keepAfterSend, keepMissLine, keepReportCopy, keepViaFor, type KeepAnswer, type KeepVia } from './reportKeep';

const PET = '11111111-2222-4333-8444-555555555555';
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const report = { html: '<html></html>', petId: PET, reportId: ID } as VetReport;

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('keepViaFor: a copy is kept only when the report probably left', () => {
  const table: Array<[KeepVia, SendResult, KeepVia | null]> = [
    ['email', 'sent', 'email'],
    ['email', 'undetermined', 'email'],
    ['email', 'saved', null],
    ['email', 'cancelled', null],
    ['email', 'failed', null],
    ['email', 'done', null],
    ['print', 'done', 'print'],
    ['print', 'cancelled', null],
    ['print', 'failed', null],
    ['share', 'done', 'share'],
    ['share', 'failed', null],
    ['share', 'sent', null],
    ['shown', 'done', 'shown'],
    ['shown', 'cancelled', null],
    ['shown', 'sent', null],
  ];
  it.each(table)('%s · %s → %s', (via, result, expected) => {
    expect(keepViaFor(via, result)).toBe(expected);
  });
});

describe('keepReportCopy', () => {
  const ok = async (): Promise<KeepAnswer> => ({ error: null });
  const err = (status: number | null, expired = false) => async (): Promise<KeepAnswer> => ({ error: { message: 'x', status, expired } });
  const noWait = jest.fn(async () => undefined);
  beforeEach(() => noWait.mockClear());

  it('names the draft by pet and id, with the route', async () => {
    const invoke = jest.fn(ok);
    expect(await keepReportCopy(report, 'print', invoke)).toBe('kept');
    expect(invoke).toHaveBeenCalledWith({ mode: 'keep', petId: PET, reportId: ID, sharedVia: 'print' });
  });

  it('an unsaved report (the Preview save failed) calls nothing and says not saved', async () => {
    const invoke = jest.fn(ok);
    expect(await keepReportCopy({ ...report, reportId: null }, 'email', invoke)).toBe('not_saved');
    expect(await keepReportCopy({ ...report, reportId: undefined }, 'email', invoke)).toBe('not_saved');
    expect(await keepReportCopy({ ...report, petId: undefined }, 'email', invoke)).toBe('not_saved');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offline or a server error is tried three times in all, then reads as failed, never throws', async () => {
    const offline = jest.fn(async (): Promise<KeepAnswer> => {
      throw new Error('offline');
    });
    expect(await keepReportCopy(report, 'email', offline, KEEP_RETRY_DELAYS_MS, noWait)).toBe('failed');
    expect(offline).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls).toEqual([[2_000], [8_000]]);
    const down = jest.fn(err(503));
    expect(await keepReportCopy(report, 'email', down, KEEP_RETRY_DELAYS_MS, noWait)).toBe('failed');
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('a retry that gets through is kept', async () => {
    const invoke = jest.fn(err(null)).mockImplementationOnce(err(null)).mockImplementationOnce(ok);
    expect(await keepReportCopy(report, 'share', invoke, KEEP_RETRY_DELAYS_MS, noWait)).toBe('kept');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a refusal is never retried; a Preview past the keep window reads as expired', async () => {
    const refused = jest.fn(err(409));
    expect(await keepReportCopy(report, 'email', refused, KEEP_RETRY_DELAYS_MS, noWait)).toBe('failed');
    expect(refused).toHaveBeenCalledTimes(1);
    const expired = jest.fn(err(409, true));
    expect(await keepReportCopy(report, 'email', expired, KEEP_RETRY_DELAYS_MS, noWait)).toBe('expired');
    expect(expired).toHaveBeenCalledTimes(1);
    expect(noWait).not.toHaveBeenCalled();
  });

  it('reads the status and the expired refusal off the real client error shape', async () => {
    const { supabase } = jest.requireMock('./supabase') as { supabase: { functions: { invoke: jest.Mock } } };
    supabase.functions.invoke.mockResolvedValueOnce({
      error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 409, json: async () => ({ error: 'Saved copy expired' }) } },
    });
    expect(await keepReportCopy(report, 'print', undefined, KEEP_RETRY_DELAYS_MS, noWait)).toBe('expired');
    supabase.functions.invoke.mockResolvedValueOnce({
      error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 409, json: async () => ({ error: 'Saved copy unavailable' }) } },
    });
    expect(await keepReportCopy(report, 'print', undefined, KEEP_RETRY_DELAYS_MS, noWait)).toBe('failed');
    expect(noWait).not.toHaveBeenCalled();
  });
});

describe('keepMissLine: a copy that left unkept is said, in the pet’s name', () => {
  it('kept says nothing; every miss names the library and one action', () => {
    expect(keepMissLine('kept', 'Cooper', 'email')).toBeNull();
    expect(keepMissLine('failed', 'Cooper', 'email')).toBe('This copy wasn’t saved to Cooper’s vet reports. Send it again to save one.');
    expect(keepMissLine('failed', 'Cooper', 'shown')).toBe('This copy wasn’t saved to Cooper’s vet reports. Show it on this phone again to save one.');
    for (const outcome of ['not_saved', 'expired'] as const) {
      expect(keepMissLine(outcome, 'Cooper', 'print')).toBe('This copy wasn’t saved to Cooper’s vet reports. Preview the report again and send it to save one.');
    }
    expect(keepMissLine('failed', '', 'share')).toBe('This copy wasn’t saved to your vet reports. Send it again to save one.');
    for (const o of ['failed', 'not_saved', 'expired'] as const) expect(keepMissLine(o, 'Cooper', 'email')).not.toMatch(/!/);
  });
});

describe('keepAfterSend', () => {
  it('keeps on a send that left and does nothing on one that did not', () => {
    const keep = jest.fn(async () => 'kept' as const);
    expect(keepAfterSend(report, 'email', 'sent', keep)).not.toBeNull();
    expect(keepAfterSend(report, 'email', 'saved', keep)).toBeNull();
    expect(keepAfterSend(report, 'share', 'failed', keep)).toBeNull();
    expect(keep).toHaveBeenCalledTimes(1);
    expect(keep).toHaveBeenCalledWith(report, 'email');
  });

  it('returns before the keep settles: the confirmation never waits on it', () => {
    let settled = false;
    const keep = jest.fn(
      () =>
        new Promise<'kept'>((r) =>
          setTimeout(() => {
            settled = true;
            r('kept');
          }, 50),
        ),
    );
    keepAfterSend(report, 'print', 'done', keep);
    expect(keep).toHaveBeenCalled();
    expect(settled).toBe(false);
  });
});
