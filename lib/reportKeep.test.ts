// The owner's kept copy (Vet report v2 PR-20, CUL-2300): which platform answers keep a copy,
// what the keep call names, and that it never throws into the send flow.

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';
import { keepAfterSend, keepReportCopy, keepViaFor, type KeepVia } from './reportKeep';

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
  ];
  it.each(table)('%s · %s → %s', (via, result, expected) => {
    expect(keepViaFor(via, result)).toBe(expected);
  });
});

describe('keepReportCopy', () => {
  it('names the draft by pet and id, with the route', async () => {
    const invoke = jest.fn(async () => ({ error: null }));
    expect(await keepReportCopy(report, 'print', invoke)).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ mode: 'keep', petId: PET, reportId: ID, sharedVia: 'print' });
  });

  it('an unsaved report (no id, or no pet) calls nothing', async () => {
    const invoke = jest.fn(async () => ({ error: null }));
    expect(await keepReportCopy({ ...report, reportId: null }, 'email', invoke)).toBe(false);
    expect(await keepReportCopy({ ...report, reportId: undefined }, 'email', invoke)).toBe(false);
    expect(await keepReportCopy({ ...report, petId: undefined }, 'email', invoke)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a server error or a throw is logged and returns false, never throws', async () => {
    expect(await keepReportCopy(report, 'email', async () => ({ error: { message: 'Saved copy unavailable' } }))).toBe(false);
    expect(
      await keepReportCopy(report, 'email', async () => {
        throw new Error('offline');
      }),
    ).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('keepAfterSend', () => {
  it('keeps on a send that left and does nothing on one that did not', () => {
    const keep = jest.fn(async () => true);
    keepAfterSend(report, 'email', 'sent', keep);
    keepAfterSend(report, 'email', 'saved', keep);
    keepAfterSend(report, 'share', 'failed', keep);
    expect(keep).toHaveBeenCalledTimes(1);
    expect(keep).toHaveBeenCalledWith(report, 'email');
  });

  it('returns before the keep settles: the confirmation never waits on it', () => {
    let settled = false;
    const keep = jest.fn(
      () =>
        new Promise<boolean>((r) =>
          setTimeout(() => {
            settled = true;
            r(true);
          }, 50),
        ),
    );
    keepAfterSend(report, 'print', 'done', keep);
    expect(keep).toHaveBeenCalled();
    expect(settled).toBe(false);
  });
});
