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
import { cancelPendingSignalRegens, triggerSignalRegenDebounced } from './signal';
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
    cancelPendingSignalRegens(); // module state is per-file, not per-test — reset it
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
    //
    // THE ORDER IS RECORDED ONLY FROM THE MOMENT THE TIMER FIRES, and that is the
    // whole test rather than a tidy-up. `reverseLoggedEvent` fires its OWN
    // fire-and-forget `syncPendingEvents()` at t≈0, so a naive `order` array collected
    // across the reversal already holds a 'push' before anything the regen does —
    // and the assertion then passes no matter what `regenerateSignal` does internally.
    // Verified: the first version of this test stayed green with the push and the
    // invoke swapped inside `regenerateSignal`, i.e. it was green over the exact
    // defect it names (code-reviewer, CUL-642). Slice the thing under test; never
    // assert across the whole flow.
    const order: string[] = [];
    await reverseLoggedEvent('ev-1');

    (syncPendingEvents as jest.Mock).mockImplementation(async () => { order.push('push'); });
    mockedInvoke.mockImplementation(async () => { order.push('invoke'); return { error: null }; });
    await jest.advanceTimersByTimeAsync(5000);

    expect(order).toEqual(['push', 'invoke']);
  });

  it('a reversal AFTER the log\'s regen already fired still settles last', async () => {
    // The general case, and the one the re-arm alone does NOT close: `clearTimeout`
    // can only cancel a timer that has not fired. A removal at t=5.001s — or any
    // History Remove, which is untethered from the card's dwell entirely — leaves the
    // log's regen already in flight over a server that still holds the row. Since
    // `generate-signal` writes the cache with a plain delete-then-insert and no
    // version guard, whichever invocation reaches the server LAST wins, and if that
    // is the stale one the removal has re-cached the finding it was meant to clear,
    // with a fresh 24h TTL (code-reviewer, CUL-642).
    //
    // The serializer makes the last settle the freshest by refusing to run two at
    // once for a pet. What this asserts is the ORDER OF SETTLEMENT, not the call
    // count: both regens legitimately run.
    const settled: string[] = [];
    let releaseStale!: () => void;
    mockedInvoke
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStale = () => { settled.push('stale'); resolve({ error: null }); };
          }),
      )
      .mockImplementation(async () => { settled.push('fresh'); return { error: null }; });

    triggerSignalRegenDebounced('pet-a');            // t=0, the log
    await jest.advanceTimersByTimeAsync(5000);       // the log's regen FIRES and hangs
    await reverseLoggedEvent('ev-1');                // t=5000+, nothing left to cancel
    await jest.advanceTimersByTimeAsync(5000);       // the reversal's regen comes due

    // It has not run: it is waiting behind the one already on the wire.
    expect(settled).toEqual([]);
    releaseStale();
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toEqual(['stale', 'fresh']);
  });

  it('does not wait forever on a hung regen — it degrades to the old behaviour', async () => {
    // The objection that makes serialising a network call safe at all (CUL-622):
    // supabase-js sets no request timeout, so an unbounded wait would mean a single
    // hung invoke stops a pet's Signal ever refreshing again. Past the ceiling the
    // waiting run goes anyway — back to exactly the concurrent behaviour this had
    // before the serializer, never to a new failure mode where a removal's regen
    // never runs.
    mockedInvoke.mockImplementationOnce(() => new Promise(() => {})); // never settles
    triggerSignalRegenDebounced('pet-a');
    await jest.advanceTimersByTimeAsync(5000);       // hangs, holding the slot
    await reverseLoggedEvent('ev-1');
    await jest.advanceTimersByTimeAsync(5000);       // due, and waits
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15_000);     // REGEN_WAIT_CEILING_MS
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
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

  it('KNOWN LIMIT (CUL-772): a failed tombstone push does not stop the recompute', async () => {
    // Characterization, not a guarantee — pinned so the residual is visible in the
    // suite rather than only in prose, and so the day CUL-772 is fixed this test is
    // what says the behaviour changed.
    //
    // `regenerateSignal` swallows the push's failure and invokes anyway, so the
    // function recomputes over a server that still holds the removed event and writes
    // a cache row with a fresh 24h TTL. Offline is safe (the invoke fails too); the
    // live case is a QUARANTINED tombstone, which leaves every queue for the life of
    // the install (lib/sync.ts). Not narrowed inside CUL-642 because the swallow is
    // shared with every write path and the queue is global — refusing to invoke on a
    // rejected push would let one unrelated queue error block every pet's refresh.
    (syncPendingEvents as jest.Mock).mockRejectedValue(new Error('quarantined'));
    await reverseLoggedEvent('ev-1');
    await jest.advanceTimersByTimeAsync(5000);
    expect(regenPets()).toEqual(['pet-a']); // ← runs anyway; CUL-772 is whether it should
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
