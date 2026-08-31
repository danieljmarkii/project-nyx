// CUL-642 — the race, tested where it actually lives: across two real modules.
//
// THE COINCIDENCE THAT MADE IT THE DEFAULT TIMING. `REGEN_DEBOUNCE_MS` (lib/signal)
// and the completion card's dwell (`docs/nyx-app-polish-requirements.md` §5) are
// both 5000ms, and neither knows about the other. So the ordinary flow — log an
// event, read the card, tap Undo in the last moment of its life — put the log's own
// regen at t=5.0s and the reversal at t≈4.8s. Before this fix the regen fired over a
// server that still held the row, wrote a cached `ai_signals` finding computed over
// it, and nothing was scheduled to run again: the stale signal stood for up to 24h.
//
// The fix is to RE-ARM the same per-pet debounce from the reversal, which cancels the
// pending timer rather than racing it. That property cannot be shown with a mocked
// `triggerSignalRegenDebounced` — the mock IS the thing under test — so this suite
// runs the real debounce and the real `reverseLoggedEvent` together, mocking only the
// edges (Supabase, the sync queue, SQLite, the weight reconcile).
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./db', () => ({
  softDeleteEvent: jest.fn(async () => {}),
  getEventPetId: jest.fn(async () => 'pet-a'),
}));
jest.mock('./weight', () => ({ reconcileWeightSnapshotAfterDelete: jest.fn(async () => null) }));

import { getEventPetId } from './db';
import { triggerSignalRegenDebounced } from './signal';
import { supabase } from './supabase';
import { syncPendingEvents } from './sync';
import { reverseLoggedEvent } from './undoLog';
import { useSyncStore } from '../store/syncStore';

const mockedInvoke = supabase.functions.invoke as jest.Mock;

/** The generate-signal calls made so far, by pet. */
function regenPets(): string[] {
  return mockedInvoke.mock.calls.map((c) => (c[1] as { body: { petId: string } }).body.petId);
}

describe('CUL-642 — a reversal re-arms the Signal regen instead of racing it', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedInvoke.mockReset().mockResolvedValue({ error: null });
    (getEventPetId as jest.Mock).mockClear().mockResolvedValue('pet-a');
    (syncPendingEvents as jest.Mock).mockClear().mockResolvedValue(undefined);
    useSyncStore.setState({ signalAcknowledging: {}, signalTick: 0 });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('an Undo inside the dwell cancels the log\'s regen and runs one over the corrected record', async () => {
    // t=0 — the log. This is what insertSimpleEvent / insertMeal do on every write.
    triggerSignalRegenDebounced('pet-a');

    // t=4800 — the owner taps Undo with 200ms of the card left. The reversal is
    // awaited, exactly as momentStore does.
    await jest.advanceTimersByTimeAsync(4800);
    expect(regenPets()).toEqual([]); // nothing has run yet
    await reverseLoggedEvent('ev-1');

    // t=5000 — where the log's regen WAS scheduled. Before the fix it fired here,
    // over a server that still held the row.
    await jest.advanceTimersByTimeAsync(200);
    expect(regenPets()).toEqual([]);

    // t=9800 — 5s after the reversal. Exactly one regen, and it is the one that
    // sees the tombstone.
    await jest.advanceTimersByTimeAsync(4800);
    expect(regenPets()).toEqual(['pet-a']);
  });

  it('pushes the tombstone before asking the server to recompute', async () => {
    // The ordering the whole fix rests on: regenerateSignal awaits syncPendingEvents
    // before invoking generate-signal, so detection re-reads a server that has the
    // deletion. A regen that invoked first would recompute the same stale answer and
    // then cache it for 24h — worse than not running, because it renews the TTL.
    const order: string[] = [];
    (syncPendingEvents as jest.Mock).mockImplementation(async () => { order.push('push'); });
    mockedInvoke.mockImplementation(async () => { order.push('invoke'); return { error: null }; });

    await reverseLoggedEvent('ev-1');
    await jest.advanceTimersByTimeAsync(5000);

    expect(order.indexOf('push')).toBeGreaterThan(-1);
    expect(order.indexOf('invoke')).toBeGreaterThan(order.indexOf('push'));
  });

  it('collapses a burst of removals into one regen per pet', async () => {
    // Clearing several rows out of History in one sitting is one recompute, not one
    // per row — the same collapse the write path relies on, inherited rather than
    // reimplemented. Without it a tidy-up session fans out Edge Function calls.
    await reverseLoggedEvent('ev-1');
    await jest.advanceTimersByTimeAsync(1000);
    await reverseLoggedEvent('ev-2');
    await jest.advanceTimersByTimeAsync(1000);
    await reverseLoggedEvent('ev-3');
    await jest.advanceTimersByTimeAsync(5000);
    expect(regenPets()).toEqual(['pet-a']);
  });

  it('removals on two pets each get their own regen — the debounce is per-pet', async () => {
    // A multi-pet tidy-up must not let one pet's removal stand in for another's: the
    // timer map is keyed by pet, and the pet comes from each RECORD (CUL-574).
    (getEventPetId as jest.Mock).mockResolvedValueOnce('pet-a').mockResolvedValueOnce('pet-b');
    await reverseLoggedEvent('ev-1');
    await reverseLoggedEvent('ev-2');
    await jest.advanceTimersByTimeAsync(5000);
    expect(regenPets().sort()).toEqual(['pet-a', 'pet-b']);
  });

  it('offline, the regen fails quiet and the reversal still stands', async () => {
    // Detection runs in Supabase, so there is no on-device recompute to fall back to
    // and the previous cached signal stands until the next successful regen. What
    // must NOT happen is the failure surfacing as a failed removal, or the "Noted —
    // updating …" line stranding on Home over a regen that will never land.
    mockedInvoke.mockResolvedValue({ error: { message: 'Network request failed' } });
    await expect(reverseLoggedEvent('ev-1')).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(5000);
    expect(useSyncStore.getState().signalAcknowledging['pet-a']).toBe(false);
    // And the cache is not bumped, so nothing re-reads a row that was never written.
    expect(useSyncStore.getState().signalTick).toBe(0);
  });
});
