import { useMomentStore } from './momentStore';

describe('momentStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // hide() clears the timers + visible flag but preserves `payload` so the
    // dismiss fade can still render content; null it explicitly so a payload
    // from one test can't leak into the next.
    useMomentStore.getState().hide();
    useMomentStore.setState({ payload: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes hidden with no payload', () => {
    const s = useMomentStore.getState();
    expect(s.visible).toBe(false);
    expect(s.payload).toBeNull();
  });

  it('shows immediately when no delay is passed and defaults the title to "Logged"', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    const s = useMomentStore.getState();
    expect(s.visible).toBe(true);
    expect(s.payload?.tone).toBe('celebrate');
    expect(s.payload?.title).toBe('Logged');
  });

  it('carries the calm tone and an explicit title override', () => {
    useMomentStore.getState().show({ tone: 'calm', title: 'Saved' });
    const s = useMomentStore.getState();
    expect(s.payload?.tone).toBe('calm');
    expect(s.payload?.title).toBe('Saved');
  });

  it('auto-dismisses after the default 1.4s dwell (under the 2s earned-moment cap)', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1399);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('defers reveal by delayMs (used to clear the dismissing /log modal first)', () => {
    useMomentStore.getState().show({ tone: 'calm' }, { delayMs: 300 });
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(299);
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('honors a custom durationMs', () => {
    useMomentStore.getState().show({ tone: 'celebrate' }, { durationMs: 800 });
    jest.advanceTimersByTime(799);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('replaces an in-flight moment with the new payload and resets its timer', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    jest.advanceTimersByTime(1000);
    useMomentStore.getState().show({ tone: 'calm' });
    expect(useMomentStore.getState().payload?.tone).toBe('calm');
    // Old timer should have been cancelled — the first one would have expired
    // 400ms after the second show; the moment must still be visible then.
    jest.advanceTimersByTime(401);
    expect(useMomentStore.getState().visible).toBe(true);
    // ...and the replacement's own 1400ms timer fires on schedule from show #2.
    jest.advanceTimersByTime(998);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('hide() cancels both the pending reveal and the dismiss timer', () => {
    useMomentStore.getState().show({ tone: 'celebrate' }, { delayMs: 300 });
    useMomentStore.getState().hide();
    jest.advanceTimersByTime(10000);
    expect(useMomentStore.getState().visible).toBe(false);
  });
});
