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
import { useSyncStore } from '../store/syncStore';
import { regenerateSignal, triggerSignalRegenDebounced } from './signal';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingMeals } from './sync';

type Body = { petId: string; unsentRows: unknown; refusedRows: unknown; reason: unknown };
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
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: false, reason: 'refresh' });
  });

  // CUL-2037, PM ruling (a): a vomit the server refused is off the server's record, so the
  // rebuild must not read the quiet stretch as whole. unsentRows rides with it, so a server that
  // ignores refusedRows still takes the incomplete read.
  it('a row the server refused, and nothing pending, sends refusedRows: true and unsentRows with it', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 1 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: true, reason: 'refresh' });
  });

  it('both kinds at once send both flags', async () => {
    mockedGaps.mockResolvedValue({ unsent: 2, refused: 3 });
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: true, reason: 'refresh' });
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
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: false, refusedRows: false, reason: 'refresh' });
  });

  it('a failed gaps read sends unsentRows: true (the louder error) and never claims a refusal', async () => {
    mockedGaps.mockRejectedValue(new Error('database is locked'));
    await regenerateSignal('pet-a');
    expect(sentBody()).toEqual({ petId: 'pet-a', unsentRows: true, refusedRows: false, reason: 'refresh' });
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

  // CUL-2037 (adversarial pass 1): a refused row holds every expiry at an hour, so the per-pet
  // cap is reachable. A capped reply writes nothing; bumping the tick would re-run useSignal and
  // the cross-pet banner over the same expired row, each regen refused and still counted, until
  // the monthly cap was spent.
  it('a capped reply does not bump the signal tick (no regen loop)', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 1 });
    mockedInvoke.mockResolvedValue({
      data: { cap_reached: true, cap: 'daily', function: 'generate_signal', resets_at: '2026-10-21T00:00:00.000Z' },
      error: null,
    });
    const before = useSyncStore.getState().signalTick;
    const res = await regenerateSignal('pet-a');
    expect(res.error).toBeNull();
    expect(useSyncStore.getState().signalTick).toBe(before);
  });

  it('a regen that wrote a Signal still bumps the tick', async () => {
    mockedGaps.mockResolvedValue({ unsent: 0, refused: 0 });
    mockedInvoke.mockResolvedValue({ data: { is_building: false, findings: [] }, error: null });
    const before = useSyncStore.getState().signalTick;
    await regenerateSignal('pet-a');
    expect(useSyncStore.getState().signalTick).toBe(before + 1);
  });

  // CUL-2059 (PM ruling (A)): a log's rebuild is never turned away by the cap, so the phone
  // must say which rebuilds are logs, and a log must not lose that behind a queued refresh.
  describe('CUL-2059 — the reason rides the regen', () => {
    beforeEach(() => mockedGaps.mockResolvedValue({ unsent: 0, refused: 0 }));
    afterEach(() => jest.useRealTimers());

    it('the debounced rebuild after a log sends reason: log', async () => {
      jest.useFakeTimers();
      triggerSignalRegenDebounced('pet-log', 5000);
      await jest.advanceTimersByTimeAsync(5000);
      expect(sentBody().reason).toBe('log');
    });

    it('a log that joins a queued refresh upgrades it, so the run goes as a log', async () => {
      let release: (v: { error: null }) => void = () => {};
      mockedInvoke
        .mockImplementationOnce(() => new Promise((r) => { release = r; }))
        .mockResolvedValue({ error: null });
      const first = regenerateSignal('pet-q');            // active, refresh
      await Promise.resolve();
      const trailing = regenerateSignal('pet-q');         // queues a trailing refresh
      const joined = regenerateSignal('pet-q', 'log');    // a log joins it
      expect(joined).toBe(trailing);
      await new Promise((r) => setImmediate(r));
      release({ error: null });
      await Promise.all([first, trailing]);
      const reasons = mockedInvoke.mock.calls.map((c) => (c[1] as { body: Body }).body.reason);
      expect(reasons).toEqual(['refresh', 'log']);
    });

    it('a refresh queued behind a log stays a refresh, and the flag does not leak to the next run', async () => {
      let release: (v: { error: null }) => void = () => {};
      mockedInvoke
        .mockImplementationOnce(() => new Promise((r) => { release = r; }))
        .mockResolvedValue({ error: null });
      const first = regenerateSignal('pet-r');
      await Promise.resolve();
      const trailing = regenerateSignal('pet-r', 'log');
      await new Promise((r) => setImmediate(r));
      release({ error: null });
      await Promise.all([first, trailing]);
      await regenerateSignal('pet-r');
      const reasons = mockedInvoke.mock.calls.map((c) => (c[1] as { body: Body }).body.reason);
      expect(reasons).toEqual(['refresh', 'log', 'refresh']);
    });
  });
});
