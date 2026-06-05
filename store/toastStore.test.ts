import { useToastStore } from './toastStore';
import type { MealToastPayload } from './toastStore';

function payload(over: Partial<MealToastPayload> = {}): MealToastPayload {
  return {
    eventId: 'e1',
    occurredAt: '2026-05-23T14:00:00.000Z',
    foodType: 'meal',
    intakeRating: null,
    ...over,
  };
}

describe('toastStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // hide() clears the timers + visible flag but intentionally preserves
    // `payload` so the dismiss fade-out can still render the toast's content.
    // For a clean per-test reset we also null the payload explicitly — without
    // this, a payload set by one test leaks into the next.
    useToastStore.getState().hide();
    useToastStore.setState({ payload: null });
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
    useToastStore.getState().show(payload());
    const s = useToastStore.getState();
    expect(s.visible).toBe(true);
    expect(s.payload?.eventId).toBe('e1');
  });

  it('auto-dismisses after the default 5s window', () => {
    useToastStore.getState().show(payload());
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(false);
  });

  it('defers reveal by delayMs (used to wait out the log modal\'s 1s checkmark)', () => {
    useToastStore.getState().show(payload(), { delayMs: 1100 });
    expect(useToastStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1099);
    expect(useToastStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(true);
  });

  it('replaces an in-flight toast with the new payload and resets its timer', () => {
    useToastStore.getState().show(payload({ eventId: 'e1' }));
    jest.advanceTimersByTime(4000);
    useToastStore.getState().show(payload({ eventId: 'e2', occurredAt: '2026-05-23T15:00:00.000Z' }));
    expect(useToastStore.getState().payload?.eventId).toBe('e2');
    // Old 5s timer should have been cancelled — 1s more would have expired it.
    jest.advanceTimersByTime(1001);
    expect(useToastStore.getState().visible).toBe(true);
  });

  it('hide() cancels both reveal and dismiss timers', () => {
    useToastStore.getState().show(payload(), { delayMs: 1000 });
    useToastStore.getState().hide();
    jest.advanceTimersByTime(10000);
    expect(useToastStore.getState().visible).toBe(false);
  });

  it('patchOccurredAt updates the in-flight toast\'s occurredAt', () => {
    useToastStore.getState().show(payload());
    useToastStore.getState().patchOccurredAt('2026-05-23T13:30:00.000Z');
    expect(useToastStore.getState().payload?.occurredAt).toBe('2026-05-23T13:30:00.000Z');
  });

  it('patchOccurredAt is a no-op when no payload is present', () => {
    useToastStore.getState().patchOccurredAt('2026-05-23T13:30:00.000Z');
    expect(useToastStore.getState().payload).toBeNull();
  });

  it('patchIntakeRating updates the in-flight toast\'s intakeRating', () => {
    useToastStore.getState().show(payload());
    useToastStore.getState().patchIntakeRating('most');
    expect(useToastStore.getState().payload?.intakeRating).toBe('most');
  });

  it('patchIntakeRating can clear back to null', () => {
    useToastStore.getState().show(payload({ intakeRating: 'all' }));
    useToastStore.getState().patchIntakeRating(null);
    expect(useToastStore.getState().payload?.intakeRating).toBeNull();
  });

  it('rescheduleHide cancels the original 5s timer and dismisses after the new duration', () => {
    useToastStore.getState().show(payload());
    jest.advanceTimersByTime(1000);
    // Owner taps a chip ~1s in; we want a 1.5s confirmation window after the tap,
    // not the original 4s remaining.
    useToastStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(1499);
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(false);
  });

  it('rescheduleHide replaces a previously-rescheduled hide cleanly', () => {
    useToastStore.getState().show(payload());
    useToastStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(500);
    // Owner taps another chip mid-confirmation window — push the dismiss out again.
    useToastStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(1499);
    expect(useToastStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().visible).toBe(false);
  });
});
