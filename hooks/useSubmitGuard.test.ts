// B-336 — the double-submit guard. These tests pin the behaviour the bug was:
// a rapid double-tap on a picker tile ran the write handler twice and landed two
// events for one meal/pill. The guard's whole job is that the SECOND call never
// reaches the write, and the sharp edge is the release rule — latch after a
// committed write (the screen is dismissing), release after one that wrote
// nothing (the owner is still on the picker and must be able to retry).

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSubmitGuard } from './useSubmitGuard';

// A write that resolves only when the test says so — this is what makes the
// double-tap real rather than sequential: the second call lands while the first
// is still in flight, exactly as two taps 80ms apart do against a SQLite write.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useSubmitGuard', () => {
  it('drops a second call that arrives while the first write is in flight', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const gate = deferred<boolean>();
    const write = jest.fn(() => gate.promise);

    await act(async () => {
      // Both "taps" fire before the write settles.
      void result.current(write);
      void result.current(write);
      gate.resolve(true);
    });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('drops every extra tap in a burst, not just the second', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const gate = deferred<boolean>();
    const write = jest.fn(() => gate.promise);

    await act(async () => {
      void result.current(write);
      void result.current(write);
      void result.current(write);
      void result.current(write);
      gate.resolve(true);
    });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('stays latched after a committed write — a later tap on the same visit writes nothing', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const write = jest.fn(async () => true);

    await act(async () => { await result.current(write); });
    // The screen is dismissing at this point; a tap that lands in that window
    // must not produce a second event.
    await act(async () => { await result.current(write); });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('releases after a write that committed nothing, so the owner can retry', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    // Mirrors handleConfirm returning null / the dose insert throwing and alerting:
    // nothing was written and the picker is still on screen.
    const write = jest.fn(async () => false);

    await act(async () => { await result.current(write); });
    await act(async () => { await result.current(write); });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('releases when the write throws, and lets the throw surface', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const boom = jest.fn(async () => { throw new Error('write failed'); });

    await act(async () => {
      await expect(result.current(boom)).rejects.toThrow('write failed');
    });
    // An unexpected failure must never leave the picker permanently dead.
    await act(async () => {
      await expect(result.current(boom)).rejects.toThrow('write failed');
    });

    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('guards the shared write path, not one tile — a second tap on a DIFFERENT item is dropped too', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const gate = deferred<boolean>();
    const writeFood = jest.fn(() => gate.promise);
    const writeOtherFood = jest.fn(async () => true);

    await act(async () => {
      void result.current(writeFood);
      // A fat-fingered second tap usually lands on the neighbouring tile, so a
      // per-tile guard would miss it. The guard is on the write, not the tile.
      void result.current(writeOtherFood);
      gate.resolve(true);
    });

    expect(writeFood).toHaveBeenCalledTimes(1);
    expect(writeOtherFood).not.toHaveBeenCalled();
  });

  it('keeps one latch across re-renders — the guard is not reset by a state update', async () => {
    const { result, rerender } = renderHook(() => useSubmitGuard());
    const gate = deferred<boolean>();
    const write = jest.fn(() => gate.promise);

    await act(async () => {
      void result.current(write);
      // handlePickFood sets several pieces of state before awaiting the write, so
      // the component re-renders mid-flight; a guard held in state (rather than a
      // ref) would be re-read stale here and let the second tap through.
      rerender({});
      void result.current(write);
      gate.resolve(true);
    });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('returns a stable callback identity across renders', async () => {
    const { result, rerender } = renderHook(() => useSubmitGuard());
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
    await waitFor(() => expect(typeof result.current).toBe('function'));
  });
});
