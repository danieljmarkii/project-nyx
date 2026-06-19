import { useMomentStore } from './momentStore';
import type { MealPayload, MedicationPayload } from './momentStore';

function mealPayload(over: Partial<Omit<MealPayload, 'kind'>> = {}): Omit<MealPayload, 'kind'> {
  return {
    eventId: 'e1',
    occurredAt: '2026-06-07T14:00:00.000Z',
    foodType: 'meal',
    foodBrand: 'Royal Canin',
    foodProductName: 'Recovery',
    intakeRating: null,
    ...over,
  };
}

function medicationPayload(over: Partial<Omit<MedicationPayload, 'kind'>> = {}): Omit<MedicationPayload, 'kind'> {
  return {
    eventId: 'm1',
    occurredAt: '2026-06-07T14:00:00.000Z',
    drugName: 'Prednisolone',
    adherence: 'given',
    ...over,
  };
}

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

  // ── Beat presentation (full-screen, non-meal logs) ─────────────────────────

  it('show() reveals a beat immediately and defaults the title to "Logged"', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    const s = useMomentStore.getState();
    expect(s.visible).toBe(true);
    expect(s.payload?.kind).toBe('beat');
    if (s.payload?.kind !== 'beat') throw new Error('expected beat payload');
    expect(s.payload.tone).toBe('celebrate');
    expect(s.payload.title).toBe('Logged');
  });

  it('carries the calm tone and an explicit title override', () => {
    useMomentStore.getState().show({ tone: 'calm', title: 'Saved' });
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'beat') throw new Error('expected beat payload');
    expect(payload.tone).toBe('calm');
    expect(payload.title).toBe('Saved');
  });

  it('a beat auto-dismisses after the default 1.4s dwell (under the 2s cap)', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1399);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('defers a beat reveal by delayMs (used to clear the dismissing /log modal)', () => {
    useMomentStore.getState().show({ tone: 'calm' }, { delayMs: 300 });
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(299);
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('honors a custom durationMs on a beat', () => {
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
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'beat') throw new Error('expected beat payload');
    expect(payload.tone).toBe('calm');
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

  // ── Meal presentation (warmed bottom card, B-064) ──────────────────────────

  it('showMeal() reveals a meal card immediately with the food payload', () => {
    useMomentStore.getState().showMeal(mealPayload());
    const { visible, payload } = useMomentStore.getState();
    expect(visible).toBe(true);
    expect(payload?.kind).toBe('meal');
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.eventId).toBe('e1');
    expect(payload.foodBrand).toBe('Royal Canin');
    expect(payload.intakeRating).toBeNull();
  });

  it('a meal card auto-dismisses after the default 5s window (longer, interactive)', () => {
    useMomentStore.getState().showMeal(mealPayload());
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('defers a meal card reveal by delayMs (clears the dismissing /log modal)', () => {
    useMomentStore.getState().showMeal(mealPayload(), { delayMs: 450 });
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(449);
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('patchOccurredAt updates the in-flight meal card', () => {
    useMomentStore.getState().showMeal(mealPayload());
    useMomentStore.getState().patchOccurredAt('2026-06-07T13:30:00.000Z');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.occurredAt).toBe('2026-06-07T13:30:00.000Z');
  });

  it('patchIntakeRating updates and can clear the in-flight meal card', () => {
    useMomentStore.getState().showMeal(mealPayload());
    useMomentStore.getState().patchIntakeRating('most');
    let payload = useMomentStore.getState().payload;
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.intakeRating).toBe('most');
    useMomentStore.getState().patchIntakeRating(null);
    payload = useMomentStore.getState().payload;
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.intakeRating).toBeNull();
  });

  it('patch* are no-ops when no payload is present', () => {
    useMomentStore.getState().patchOccurredAt('2026-06-07T13:30:00.000Z');
    useMomentStore.getState().patchIntakeRating('all');
    expect(useMomentStore.getState().payload).toBeNull();
  });

  it('patch* never mutate a beat payload (meal-only affordances)', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    useMomentStore.getState().patchIntakeRating('all');
    useMomentStore.getState().patchOccurredAt('2026-06-07T13:30:00.000Z');
    const { payload } = useMomentStore.getState();
    expect(payload?.kind).toBe('beat');
    // A beat carries no intake/occurredAt fields; the patch must leave it intact.
    expect(payload).not.toHaveProperty('intakeRating');
    expect(payload).not.toHaveProperty('occurredAt');
  });

  it('rescheduleHide holds the meal card open for the new window after a chip tap', () => {
    useMomentStore.getState().showMeal(mealPayload());
    jest.advanceTimersByTime(1000);
    // Owner taps a chip ~1s in; we want a 1.5s confirmation window after the
    // tap, not the original 4s remaining.
    useMomentStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(1499);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('rescheduleHide replaces a previously-rescheduled hide cleanly', () => {
    useMomentStore.getState().showMeal(mealPayload());
    useMomentStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(500);
    // Owner taps another chip mid-window — push the dismiss out again.
    useMomentStore.getState().rescheduleHide(1500);
    jest.advanceTimersByTime(1499);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('a meal card replaces an in-flight beat (and vice versa)', () => {
    useMomentStore.getState().show({ tone: 'celebrate' });
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e2' }));
    const { payload } = useMomentStore.getState();
    expect(payload?.kind).toBe('meal');
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.eventId).toBe('e2');
  });

  // ── Medication presentation (dose card, B-117 PR 3) ────────────────────────

  it('showMedication() reveals a medication card immediately, starting at given', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    const { visible, payload } = useMomentStore.getState();
    expect(visible).toBe(true);
    expect(payload?.kind).toBe('medication');
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.eventId).toBe('m1');
    expect(payload.drugName).toBe('Prednisolone');
    // The one-tap log starts 'given' (the affirmative tap), never null.
    expect(payload.adherence).toBe('given');
  });

  it('a medication card auto-dismisses after the default 5s window (interactive)', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('defers a medication card reveal by delayMs (clears the dismissing /log modal)', () => {
    useMomentStore.getState().showMedication(medicationPayload(), { delayMs: 450 });
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(449);
    expect(useMomentStore.getState().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('patchAdherence downgrades the in-flight medication card', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    useMomentStore.getState().patchAdherence('refused');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.adherence).toBe('refused');
  });

  it('patchAdherence is a no-op on a meal payload (medication-only affordance)', () => {
    useMomentStore.getState().showMeal(mealPayload());
    useMomentStore.getState().patchAdherence('missed');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload).not.toHaveProperty('adherence');
  });

  it('patchIntakeRating / patchOccurredAt never mutate a medication payload', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    useMomentStore.getState().patchIntakeRating('all');
    useMomentStore.getState().patchOccurredAt('2026-06-07T13:30:00.000Z');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    // The meal-only patches must leave the dose card's own time + adherence intact.
    expect(payload.adherence).toBe('given');
    expect(payload.occurredAt).toBe('2026-06-07T14:00:00.000Z');
    expect(payload).not.toHaveProperty('intakeRating');
  });

  it('a medication card replaces an in-flight meal', () => {
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e9' }));
    useMomentStore.getState().showMedication(medicationPayload({ eventId: 'm9' }));
    const { payload } = useMomentStore.getState();
    expect(payload?.kind).toBe('medication');
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.eventId).toBe('m9');
  });
});
