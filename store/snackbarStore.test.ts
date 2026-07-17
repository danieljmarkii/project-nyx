import { useSnackbarStore } from './snackbarStore';

// The store owns real timer logic (delayed reveal, auto-hide, runAction
// sequencing), so it gets a fake-timer test rather than a `tests: N/A` exemption.

function reset() {
  useSnackbarStore.getState().hide();
  useSnackbarStore.setState({ visible: false, payload: null });
}

describe('snackbarStore', () => {
  beforeEach(() => { jest.useFakeTimers(); reset(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('reveals immediately (no delay) and auto-hides after the duration, preserving the payload through the fade', () => {
    useSnackbarStore.getState().show({ message: 'Removed X from your library' }, { durationMs: 5000 });
    expect(useSnackbarStore.getState().visible).toBe(true);
    expect(useSnackbarStore.getState().payload?.message).toBe('Removed X from your library');

    jest.advanceTimersByTime(4999);
    expect(useSnackbarStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useSnackbarStore.getState().visible).toBe(false);
    // Payload stays mounted through the dismiss fade (component keeps rendering it).
    expect(useSnackbarStore.getState().payload?.message).toBe('Removed X from your library');
  });

  it('honors delayMs — stays hidden until the delay elapses, then reveals', () => {
    useSnackbarStore.getState().show({ message: 'later' }, { delayMs: 300 });
    expect(useSnackbarStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(299);
    expect(useSnackbarStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useSnackbarStore.getState().visible).toBe(true);
  });

  it('runAction dismisses first, then fires the action (so an action that re-arms the snackbar wins)', () => {
    const onAction = jest.fn();
    useSnackbarStore.getState().show({ message: 'Undo me', actionLabel: 'Undo', onAction });
    useSnackbarStore.getState().runAction();
    expect(useSnackbarStore.getState().visible).toBe(false);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('runAction is a no-op with no action set', () => {
    useSnackbarStore.getState().show({ message: 'no action' });
    expect(() => useSnackbarStore.getState().runAction()).not.toThrow();
    expect(useSnackbarStore.getState().visible).toBe(false);
  });

  it('a rapid second show cancels the prior auto-hide timer (no cross-race dismiss)', () => {
    useSnackbarStore.getState().show({ message: 'first' }, { durationMs: 5000 });
    jest.advanceTimersByTime(4000);
    useSnackbarStore.getState().show({ message: 'second' }, { durationMs: 5000 });
    // The first timer would have fired at +1000 from here; it must not.
    jest.advanceTimersByTime(1001);
    expect(useSnackbarStore.getState().visible).toBe(true);
    expect(useSnackbarStore.getState().payload?.message).toBe('second');
    // The second's own timer still fires.
    jest.advanceTimersByTime(4000);
    expect(useSnackbarStore.getState().visible).toBe(false);
  });
});
