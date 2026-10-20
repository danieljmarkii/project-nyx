// Q14 (CUL-772) / CUL-2037 — a rebuild over a device that still holds rows the server lacks,
// pending or refused, tells generate-signal so, and the function treats the run as an incomplete
// read (the 1-hour expiry, no reassurance). These drive the real `regenerateSignal`, mocking only
// the edges (Supabase, the push, the gaps read), and read what the invoke actually carried. What
// the gaps count is driven over a real database in askRecordGaps.test.ts.
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./db', () => ({ countRecordGaps: jest.fn() }));

import { countRecordGaps } from './db';
import { regenerateSignal } from './signal';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingMeals } from './sync';

type Body = { petId: string; unsentRows: unknown; refusedRows: unknown };
const mockedInvoke = supabase.functions.invoke as jest.Mock;
const mockedGaps = countRecordGaps as jest.Mock;

function sentBody(): Body {
  expect(mockedInvoke).toHaveBeenCalledTimes(1);
  return (mockedInvoke.mock.calls[0][1] as { body: Body }).body;
}

describe('Q14 (CUL-772) / CUL-2037 — the rebuild names unsent and refused rows to generate-signal', () => {
  beforeEach(() => {
    mockedInvoke.mockReset().mockResolvedValue({ error: null });
    mockedGaps.mockReset();
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
    (syncPendingMeals as jest.Mock).mockClear().mockResolvedValue(undefined);
  });

  it('a row still unsent after the push sends unsentRows: true, refusedRows: false', async () => {
    mockedGaps.mockResolvedValue({ unsent: 1, refused: 0 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: false });
  });

  // CUL-2037, PM ruling (a): a vomit the server refused is off the server's record, so the
  // rebuild must not read the quiet stretch as whole. unsentRows rides with it, so a server that
  // ignores refusedRows still takes the incomplete read.
  it('a row the server refused, and nothing pending, sends refusedRows: true and unsentRows with it', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 1 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: true });
  });

  it('both kinds at once send both flags', async () => {
    mockedGaps.mockResolvedValue({ unsent: 2, refused: 3 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: true });
  });

  it('a failed push still rebuilds, and says the rows are unsent', async () => {
    // The swallow stays (one stuck queue must not block every pet's refresh); the flag is
    // what stops the rebuild claiming a full day.
    (syncPendingEvents as jest.Mock).mockRejectedValue(new Error('network'));
    mockedGaps.mockResolvedValue({ unsent: 3, refused: 0 });
    await regenerateSignal('pet-a');
    expect(sentBody().unsentRows).toBe(true);
  });

  it('nothing unsent or refused sends both false, so the 24-hour expiry stands', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 0 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: false, refusedRows: false });
  });

  it('a failed gaps read sends unsentRows: true (the louder error) and never claims a refusal', async () => {
    mockedGaps.mockRejectedValue(new Error('database is locked'));
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: false });
  });

  it('both flags come from ONE read (a drain can re-arm a refused row between two)', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 1 });
    await regenerateSignal('pet-a');
    expect(mockedGaps).toHaveBeenCalledTimes(1);
  });

  it('the gaps are read after the push, never before it', async () => {
    const order: string[] = [];
    (syncPendingEvents as jest.Mock).mockImplementation(async () => { order.push('events'); });
    (syncPendingMeals as jest.Mock).mockImplementation(async () => { order.push('meals'); });
    mockedGaps.mockImplementation(async () => {
      order.push('gaps');
      return { unsent: 0, refused: 0 };
    });
    mockedInvoke.mockImplementation(async () => { order.push('invoke'); return { error: null }; });
    await regenerateSignal('pet-a');
    expect(order).toEqual(['events', 'meals', 'gaps', 'invoke']);
  });
});
