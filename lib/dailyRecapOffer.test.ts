import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DAILY_RECAP_OFFER_COPY,
  OFFER_QUIET_MS,
  isNotificationArrival,
  shouldOfferDailyRecap,
  coerceOfferState,
  readOfferState,
  quietDailyRecapOffer,
  surfaceOfferForValueMoment,
  clearDailyRecapOffer,
} from './dailyRecapOffer';

// The in-context Daily Recap offer (DR-3 / CUL-26, spec §4). The load-bearing logic:
// the arrival classifier (in-app vs notification tap), the eligibility decision (the
// off/not-denied/not-quieted gates), and the AsyncStorage markers (the 30-day quiet +
// the two once-ever value-moment flags). The screen/consent wiring is pinned in
// app/day-summary.offer.test.tsx.

const STORAGE_KEY = 'nyx.dailyRecapOffer';
const NOW = 1_700_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('isNotificationArrival — the offer is IN-APP only', () => {
  it('source=notification is a tap arrival, however firedAt reads', () => {
    expect(isNotificationArrival({ source: 'notification' })).toBe(true);
    expect(isNotificationArrival({ source: 'notification', firedAt: undefined })).toBe(true);
  });

  it('a positive firedAt alone is a tap arrival (belt-and-braces when source is lost)', () => {
    expect(isNotificationArrival({ firedAt: String(NOW) })).toBe(true);
  });

  it('no params = an in-app visit', () => {
    expect(isNotificationArrival({})).toBe(false);
  });

  it('an empty / zero / garbage firedAt is NOT a tap — never silences the offer on an in-app visit', () => {
    expect(isNotificationArrival({ firedAt: '' })).toBe(false);
    expect(isNotificationArrival({ firedAt: '0' })).toBe(false);
    expect(isNotificationArrival({ firedAt: 'abc' })).toBe(false);
  });

  it('reads the first element of an array param (expo-router can hand back string[])', () => {
    expect(isNotificationArrival({ source: ['notification'] })).toBe(true);
    expect(isNotificationArrival({ firedAt: [String(NOW)] })).toBe(true);
  });
});

describe('shouldOfferDailyRecap — the eligibility gates (§4)', () => {
  const base = {
    arrival: 'in_app' as const,
    categoryEnabled: false,
    permission: 'undetermined' as const,
    quietUntilMs: null,
    nowMs: NOW,
  };

  it('shows on an in-app visit while off, not denied, not quieted', () => {
    expect(shouldOfferDailyRecap(base)).toBe(true);
  });

  it('NEVER shows on a notification-tap arrival', () => {
    expect(shouldOfferDailyRecap({ ...base, arrival: 'notification' })).toBe(false);
  });

  it('does not show once the recap is already on', () => {
    expect(shouldOfferDailyRecap({ ...base, categoryEnabled: true })).toBe(false);
  });

  it('NEVER shows to an OS-denied account (Settings owns that recovery)', () => {
    expect(shouldOfferDailyRecap({ ...base, permission: 'denied' })).toBe(false);
  });

  it('shows when permission is granted-but-pref-off (the primer no-ops the prompt)', () => {
    expect(shouldOfferDailyRecap({ ...base, permission: 'granted' })).toBe(true);
  });

  it('is suppressed inside a live quiet window, and returns after it lapses', () => {
    const quietUntilMs = NOW + OFFER_QUIET_MS;
    expect(shouldOfferDailyRecap({ ...base, quietUntilMs })).toBe(false);
    // one ms past the window → eligible again
    expect(shouldOfferDailyRecap({ ...base, quietUntilMs, nowMs: quietUntilMs })).toBe(true);
  });
});

describe('coerceOfferState — a corrupt blob is the empty default (fail toward eligible)', () => {
  it('keeps well-formed fields', () => {
    expect(
      coerceOfferState({ quietUntilMs: 123, trialMomentUsed: true, medMomentUsed: true }),
    ).toEqual({ quietUntilMs: 123, trialMomentUsed: true, medMomentUsed: true });
  });

  it('drops junk types and non-true flags', () => {
    expect(
      coerceOfferState({ quietUntilMs: 'soon', trialMomentUsed: 'yes', medMomentUsed: 1 }),
    ).toEqual({});
    expect(coerceOfferState(null)).toEqual({});
    expect(coerceOfferState('nope')).toEqual({});
  });
});

describe('quietDailyRecapOffer — the banner "Not now"', () => {
  it('writes a 30-day quiet-until and preserves the value-moment flags', async () => {
    await surfaceOfferForValueMoment('trial'); // sets trialMomentUsed (+ clears quiet)
    await quietDailyRecapOffer(NOW);
    const state = await readOfferState();
    expect(state.quietUntilMs).toBe(NOW + OFFER_QUIET_MS);
    expect(state.trialMomentUsed).toBe(true); // not clobbered
  });

  it('makes shouldOfferDailyRecap suppress the banner right after', async () => {
    await quietDailyRecapOffer(NOW);
    const { quietUntilMs } = await readOfferState();
    expect(
      shouldOfferDailyRecap({
        arrival: 'in_app',
        categoryEnabled: false,
        permission: 'undetermined',
        quietUntilMs,
        nowMs: NOW + 1000,
      }),
    ).toBe(false);
  });
});

describe('surfaceOfferForValueMoment — re-surface once, ever, per moment (§4)', () => {
  it('lifts a live quiet so the next in-app visit re-offers', async () => {
    await quietDailyRecapOffer(NOW); // 30-day quiet armed
    await surfaceOfferForValueMoment('trial');
    const state = await readOfferState();
    expect(state.quietUntilMs).toBeUndefined(); // quiet lifted
    expect(state.trialMomentUsed).toBe(true);
  });

  it('is a NO-OP the second time for the same moment — a later trial never re-nags', async () => {
    await surfaceOfferForValueMoment('trial'); // first: marks used, lifts quiet
    await quietDailyRecapOffer(NOW); // owner dismisses again
    await surfaceOfferForValueMoment('trial'); // second trial start
    const state = await readOfferState();
    // The second call must NOT lift the quiet — the moment is already spent.
    expect(state.quietUntilMs).toBe(NOW + OFFER_QUIET_MS);
    expect(state.trialMomentUsed).toBe(true);
  });

  it('trial and med-course are independent markers — each re-surfaces once', async () => {
    await surfaceOfferForValueMoment('trial'); // spends the trial moment
    await quietDailyRecapOffer(NOW); // dismiss
    await surfaceOfferForValueMoment('med_course'); // the med moment still fires
    const afterMed = await readOfferState();
    expect(afterMed.quietUntilMs).toBeUndefined(); // med moment lifted the quiet
    expect(afterMed.trialMomentUsed).toBe(true);
    expect(afterMed.medMomentUsed).toBe(true);

    // …and now BOTH are spent: a later dismiss + either moment leaves the quiet.
    await quietDailyRecapOffer(NOW);
    await surfaceOfferForValueMoment('med_course');
    expect((await readOfferState()).quietUntilMs).toBe(NOW + OFFER_QUIET_MS);
  });
});

describe('clearDailyRecapOffer — the sign-out wipe (§4 / FR-9 parity)', () => {
  it('removes every marker so the next account on a shared device starts fresh', async () => {
    await quietDailyRecapOffer(NOW);
    await surfaceOfferForValueMoment('med_course');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
    await clearDailyRecapOffer();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await readOfferState()).toEqual({});
  });
});

describe('the locked copy (nyx-voice — §4 / R-6, the mock verbatim)', () => {
  it('is the spec body, with no exclamation marks', () => {
    expect(DAILY_RECAP_OFFER_COPY.body).toBe(
      'Culprit can let you know each evening when the day’s record is ready.',
    );
    expect(DAILY_RECAP_OFFER_COPY.turnOn).toBe('Turn on');
    expect(DAILY_RECAP_OFFER_COPY.notNow).toBe('Not now');
    const all = Object.values(DAILY_RECAP_OFFER_COPY).join(' ');
    expect(all).not.toMatch(/!/);
  });
});
