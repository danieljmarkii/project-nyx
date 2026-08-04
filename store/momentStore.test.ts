import { useMomentStore } from './momentStore';
import type { MealPayload, MedicationPayload } from './momentStore';

function mealPayload(over: Partial<Omit<MealPayload, 'kind'>> = {}): Omit<MealPayload, 'kind'> {
  return {
    eventId: 'e1',
    petId: 'p1',
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
    howGiven: null,
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

  it('carries the meal pet id so the "+ gave a med with this" combo binds the dose to the same pet (B-156 PR B2b)', () => {
    // The combo (PR B2b) reads payload.petId — the pet the meal was logged for,
    // captured at log time — to write the linked dose, NOT a re-read active pet that
    // could have been switched. The store must carry it through verbatim.
    useMomentStore.getState().showMeal(mealPayload({ petId: 'pet-meal-owner' }));
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.petId).toBe('pet-meal-owner');
  });

  it('a meal card auto-dismisses after the default 5s window (longer, interactive)', () => {
    useMomentStore.getState().showMeal(mealPayload());
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('holds a trial-flagged meal card open longer than an unflagged one (B-351 slice 4)', () => {
    // The heads-up is PASSIVE — there is no tap that brings it back, and its
    // durable home (the food's detail screen) is a navigation away. So a card
    // carrying two extra lines of prose the owner has never seen must not flash
    // past at the unflagged 5s. Applied in the store rather than at each call
    // site, so a future meal-entry path cannot ship a flagged card that does.
    useMomentStore.getState().showMeal(mealPayload({
      trialFlag: { kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1' },
    }));
    jest.advanceTimersByTime(5000);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('patchTrialFlag lands on the showing card and extends its dwell', () => {
    // B-351 slice 4 round 2: the card now shows IMMEDIATELY and the flag patches
    // in, so a cold trial-cache lookup never delays the owner's confirmation.
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e-flag' }));
    const landed = useMomentStore.getState().patchTrialFlag('e-flag', {
      kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1',
    });
    expect(landed).toBe(true);
    const p = useMomentStore.getState().payload;
    if (p?.kind !== 'meal') throw new Error('expected meal payload');
    if (p.trialFlag?.kind !== 'off_diet_protein') throw new Error('expected a contents flag');
    expect(p.trialFlag.proteins).toEqual(['chicken']);
  });

  it('patchTrialFlag lands a MEMBERSHIP flag (B-693) with its trial day-math intact', () => {
    // The rung-3 flag rides the same store path as the contents one; it carries the
    // trial's start/target so the card can build the shipped add sheet. The store
    // must pass the union through verbatim — it holds no opinion about the kind.
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e-mem' }));
    const landed = useMomentStore.getState().patchTrialFlag('e-mem', {
      kind: 'off_trial_list', trialId: 't1', foodId: 'f1',
      trialStartedAt: '2026-06-01', trialTargetDurationDays: 84,
    });
    expect(landed).toBe(true);
    const p = useMomentStore.getState().payload;
    if (p?.kind !== 'meal') throw new Error('expected meal payload');
    if (p.trialFlag?.kind !== 'off_trial_list') throw new Error('expected a membership flag');
    expect(p.trialFlag.trialStartedAt).toBe('2026-06-01');
    expect(p.trialFlag.trialTargetDurationDays).toBe(84);
  });

  it('holds a MEMBERSHIP-flagged card open the longer window too (B-693)', () => {
    // The dwell extension keys off the presence of ANY flag, not its kind — a
    // membership card carries the same two-plus unseen lines the owner cannot get
    // back, so it must not flash past at the unflagged 5s.
    useMomentStore.getState().showMeal(mealPayload({
      trialFlag: {
        kind: 'off_trial_list', trialId: 't1', foodId: 'f1',
        trialStartedAt: '2026-06-01', trialTargetDurationDays: 84,
      },
    }));
    jest.advanceTimersByTime(5000);
    expect(useMomentStore.getState().visible).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('patchTrialFlag REFUSES a late answer for a superseded meal', () => {
    // A second log during the wait replaces the payload. A late flag for the
    // PREVIOUS meal must not decorate the new one — and, because the caller only
    // spends rule 3's budget when the patch lands, refusing here also stops that
    // food's one heads-up being burned on a card nobody saw.
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e-first' }));
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e-second' }));
    expect(useMomentStore.getState().patchTrialFlag('e-first', {
      kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1',
    })).toBe(false);
  });

  it('patchTrialFlag REFUSES once the card has been dismissed', () => {
    useMomentStore.getState().showMeal(mealPayload({ eventId: 'e-gone' }));
    jest.advanceTimersByTime(5000);
    expect(useMomentStore.getState().visible).toBe(false);
    expect(useMomentStore.getState().patchTrialFlag('e-gone', {
      kind: 'off_diet_protein', proteins: ['chicken'], trialProteins: ['duck'], trialId: 't1', foodId: 'f1',
    })).toBe(false);
  });

  it('carries a null trial flag through untouched — absence is never an all-clear', () => {
    useMomentStore.getState().showMeal(mealPayload());
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload.trialFlag ?? null).toBeNull();
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
    // The vehicle (B-156) starts null — the one-tap path doesn't ask; it's optional.
    expect(payload.howGiven).toBeNull();
    // A standalone dose has no co-logged food — pairedFoodName is absent (renders the
    // normal "Logged · {drug}" header, not the combo "Logged together" framing).
    expect(payload.pairedFoodName ?? null).toBeNull();
  });

  it('carries pairedFoodName + the inferred vehicle for a COMBO dose (B-156 PR B2b)', () => {
    // A dose logged WITH a treat from the meal card: the store carries the food name
    // (→ the card's "Logged together · {drug} · with {food}" framing) and the vehicle
    // inferred from the food type, pre-selected on the card for the owner to confirm.
    useMomentStore.getState().showMedication(
      medicationPayload({ howGiven: 'in_treat', pairedFoodName: 'Delectable' }),
    );
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.pairedFoodName).toBe('Delectable');
    expect(payload.howGiven).toBe('in_treat');
    // Combo doesn't touch adherence — the dose still starts at the affirmative 'given'
    // (the intake→adherence coupling is the gated B3, deliberately not in B2b).
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

  it('patchHowGiven sets and clears the in-flight medication card vehicle (B-156)', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    useMomentStore.getState().patchHowGiven('in_treat');
    let payload = useMomentStore.getState().payload;
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.howGiven).toBe('in_treat');
    // Tapping the active chip clears it back to null (the optional-row behaviour).
    useMomentStore.getState().patchHowGiven(null);
    payload = useMomentStore.getState().payload;
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    expect(payload.howGiven).toBeNull();
    // The vehicle patch must not disturb adherence.
    expect(payload.adherence).toBe('given');
  });

  it('patchHowGiven is a no-op on a meal payload (medication-only affordance)', () => {
    useMomentStore.getState().showMeal(mealPayload());
    useMomentStore.getState().patchHowGiven('in_food');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'meal') throw new Error('expected meal payload');
    expect(payload).not.toHaveProperty('howGiven');
  });

  it('patchIntakeRating never mutates a medication payload (meal-only affordance)', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    useMomentStore.getState().patchIntakeRating('all');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    // The meal-only intake patch must leave the dose card's own state intact.
    expect(payload.adherence).toBe('given');
    expect(payload.occurredAt).toBe('2026-06-07T14:00:00.000Z');
    expect(payload).not.toHaveProperty('intakeRating');
  });

  it('patchOccurredAt updates the in-flight medication card ("Change time")', () => {
    useMomentStore.getState().showMedication(medicationPayload());
    useMomentStore.getState().patchOccurredAt('2026-06-07T13:30:00.000Z');
    const { payload } = useMomentStore.getState();
    if (payload?.kind !== 'medication') throw new Error('expected medication payload');
    // The dose card gained the meal card's "Change time" affordance — the time patch
    // now applies, leaving adherence untouched.
    expect(payload.occurredAt).toBe('2026-06-07T13:30:00.000Z');
    expect(payload.adherence).toBe('given');
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
