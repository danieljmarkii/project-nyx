// The launch-through-`inactive` race (Design v2 — the whole day, D2-7 / CUL-1068; the
// Engineer's assert on the issue). iOS reports `inactive` for the first frames of a
// cold launch and only then `active`. This hook seeds its state from
// `AppState.currentState` at RENDER and subscribes to `change` in an EFFECT — and an
// effect runs a commit later. If the OS reaches `active` in the gap, the subscription
// lands after the transition, never hears it, and every loop the hook gates (the
// Whorl, the shimmer, now the tick) stays paused for the rest of the session. The
// fix re-reads the state once the subscription is in place. This test stages exactly
// that gap: the transition lands inside `addEventListener`, before the listener exists.
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAppActive } from './useAppActive';

type Listener = (next: string) => void;

function stageAppState(initial: string) {
  const listeners = new Set<Listener>();
  const state = AppState as unknown as { currentState: string };
  state.currentState = initial;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: Listener) => {
    listeners.add(cb);
    return { remove: () => listeners.delete(cb) };
  }) as never);
  return {
    listeners,
    emit(next: string) {
      state.currentState = next;
      listeners.forEach((l) => l(next));
    },
    set(next: string) {
      state.currentState = next;
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  (AppState as unknown as { currentState: string }).currentState = 'active';
});

describe('useAppActive', () => {
  it('reads active at mount when the app is already active', () => {
    stageAppState('active');
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(true);
  });

  it('a launch that passes through inactive: false at render, true once the OS says active', () => {
    const stage = stageAppState('inactive');
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(false);
    act(() => stage.emit('active'));
    expect(result.current).toBe(true);
    act(() => stage.emit('background'));
    expect(result.current).toBe(false);
  });

  it('a transition that lands BETWEEN the render and the subscription is not missed', () => {
    // The gap: the hook reads `inactive` at render; the OS moves to `active` before the
    // effect subscribes, so the `change` event has already fired into nobody. Staged by
    // flipping the state the moment `addEventListener` is called, before the listener
    // is registered — the subscription is then strictly after the transition.
    const stage = stageAppState('inactive');
    const spy = AppState.addEventListener as unknown as jest.Mock;
    spy.mockImplementationOnce(((_type: string, cb: Listener) => {
      stage.set('active');
      stage.listeners.add(cb);
      return { remove: () => stage.listeners.delete(cb) };
    }) as never);
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const stage = stageAppState('active');
    const { unmount } = renderHook(() => useAppActive());
    expect(stage.listeners.size).toBe(1);
    unmount();
    expect(stage.listeners.size).toBe(0);
  });
});
