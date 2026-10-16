// Q14 (CUL-772) — a rebuild over a device that still holds unsent rows tells generate-signal so,
// and the function treats the run as an incomplete read (the 1-hour expiry, no reassurance).
// These drive the real `regenerateSignal`, mocking only the edges (Supabase, the push, the
// queue count), and read what the invoke actually carried. What the count includes is driven
// over a real database in syncQueue.unsentForSignal.test.ts.
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./db', () => ({ countUnsentForSignal: jest.fn() }));

import { countUnsentForSignal } from './db';
import { regenerateSignal } from './signal';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingMeals } from './sync';

const mockedInvoke = supabase.functions.invoke as jest.Mock;
const mockedStatus = countUnsentForSignal as jest.Mock;

function sentBody(): { petId: string; unsentRows: unknown } {
  expect(mockedInvoke).toHaveBeenCalledTimes(1);
  return (mockedInvoke.mock.calls[0][1] as { body: { petId: string; unsentRows: unknown } }).body;
}

describe('Q14 (CUL-772) — the rebuild names unsent rows to generate-signal', () => {
  beforeEach(() => {
    mockedInvoke.mockReset().mockResolvedValue({ error: null });
    mockedStatus.mockReset();
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
    (syncPendingMeals as jest.Mock).mockClear().mockResolvedValue(undefined);
  });

  it('a row still unsent after the push sends unsentRows: true', async () => {
    mockedStatus.mockResolvedValue(1);
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true });
  });

  it('a failed push still rebuilds, and says the rows are unsent', async () => {
    // The swallow stays (one stuck queue must not block every pet's refresh); the flag is
    // what stops the rebuild claiming a full day.
    (syncPendingEvents as jest.Mock).mockRejectedValue(new Error('network'));
    mockedStatus.mockResolvedValue(3);
    await regenerateSignal('pet-a');
    expect(sentBody().unsentRows).toBe(true);
  });

  it('nothing unsent sends unsentRows: false, so the 24-hour expiry stands', async () => {
    mockedStatus.mockResolvedValue(0);
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: false });
  });

  it('a failed count read sends unsentRows: true (the louder error)', async () => {
    mockedStatus.mockRejectedValue(new Error('database is locked'));
    await regenerateSignal('pet-a');
    expect(sentBody().unsentRows).toBe(true);
  });

  it('the count is read after the push, never before it', async () => {
    const order: string[] = [];
    (syncPendingEvents as jest.Mock).mockImplementation(async () => { order.push('events'); });
    (syncPendingMeals as jest.Mock).mockImplementation(async () => { order.push('meals'); });
    mockedStatus.mockImplementation(async () => {
      order.push('count');
      return 0;
    });
    mockedInvoke.mockImplementation(async () => { order.push('invoke'); return { error: null }; });
    await regenerateSignal('pet-a');
    expect(order).toEqual(['events', 'meals', 'count', 'invoke']);
  });
});
