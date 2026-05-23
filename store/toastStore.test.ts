import { useToastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().hide();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes hidden with no payload', () => {
    const s = useToastStore.getState();
    expect(s.visible).toBe(false);
    expect(s.payload).toBeNull();
  });

  it('shows immediately when no delay is passed', () => {
    useToastStore.getState().show({ eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' });
    const s = useToastStore.getState();
    expect(s.visible).toBe(true);
    expect(s.payload?.eventId).toBe('e1');
  });

  it('auto-dismisses after the default 5s window', () => {
    useToastStore.getState().show({ eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' });
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(false);
  });

  it('defers reveal by delayMs (used to wait out the log modal\'s 1s checkmark)', () => {
    useToastStore.getState().show(
      { eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' },
      { delayMs: 1100 },
    );
    expect(useToastStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1099);
    expect(useToastStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(true);
  });

  it('replaces an in-flight toast with the new payload and resets its timer', () => {
    useToastStore.getState().show({ eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' });
    jest.advanceTimersByTime(4000);
    useToastStore.getState().show({ eventId: 'e2', occurredAt: '2026-05-23T15:00:00.000Z' });
    expect(useToastStore.getState().payload?.eventId).toBe('e2');
    // Old 5s timer should have been cancelled — 1s more would have expired it.
    jest.advanceTimersByTime(1001);
    expect(useToastStore.getState().visible).toBe(true);
  });

  it('hide() cancels both reveal and dismiss timers', () => {
    useToastStore.getState().show(
      { eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' },
      { delayMs: 1000 },
    );
    useToastStore.getState().hide();
    jest.advanceTimersByTime(10000);
    expect(useToastStore.getState().visible).toBe(false);
  });

  it('patchOccurredAt updates the in-flight toast\'s occurredAt', () => {
    useToastStore.getState().show({ eventId: 'e1', occurredAt: '2026-05-23T14:00:00.000Z' });
    useToastStore.getState().patchOccurredAt('2026-05-23T13:30:00.000Z');
    expect(useToastStore.getState().payload?.occurredAt).toBe('2026-05-23T13:30:00.000Z');
  });

  it('patchOccurredAt is a no-op when no payload is present', () => {
    useToastStore.getState().patchOccurredAt('2026-05-23T13:30:00.000Z');
    expect(useToastStore.getState().payload).toBeNull();
  });
});
