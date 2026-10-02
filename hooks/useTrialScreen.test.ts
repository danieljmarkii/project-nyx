// The one gate every trial-screen surface reads (TS-0 / CUL-1296): live = eligible &&
// optedIn, proven over the four combinations — being eligible turns nothing on, and an
// opt-in without eligibility is a switch to nothing (the B-712 two-gate shape).
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { renderHook } from '@testing-library/react-native';
import { useTrialScreen } from './useTrialScreen';
import { __resetAppConfigForTest } from './useAppConfig';
import { useAuthStore } from '../store/authStore';
import { useBetaOptInStore } from '../lib/betaFeatures';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../lib/appConfig';

const PM = 'pm-uid';

function setEligible(eligible: boolean): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: {
      ...ALLOWLIST_FLAGS_UNSET,
      trial_screen: { enabled: false, allowlist: eligible ? [PM] : [] },
    },
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: PM } } as never);
  useBetaOptInStore.getState().reset();
});

afterAll(() => {
  __resetAppConfigForTest();
});

describe('useTrialScreen — live = eligible && optedIn', () => {
  it.each([
    [false, false, false],
    [true, false, false], // eligible turns nothing on (Gate 2 untouched)
    [false, true, false], // an opt-in with no eligibility is a switch to nothing
    [true, true, true],
  ])('eligible=%s optedIn=%s → %s', (eligible, optedIn, live) => {
    setEligible(eligible);
    if (optedIn) useBetaOptInStore.getState().setOptIn('trial_screen', true);
    const { result } = renderHook(() => useTrialScreen());
    expect(result.current).toBe(live);
  });

  it('fails closed on the unset baseline (no seed / config unreachable), even opted in', () => {
    __resetAppConfigForTest();
    useBetaOptInStore.getState().setOptIn('trial_screen', true);
    const { result } = renderHook(() => useTrialScreen());
    expect(result.current).toBe(false);
  });

  it('fails closed for a signed-out caller, even on an allowlist that would match', () => {
    setEligible(true);
    useAuthStore.setState({ user: null } as never);
    useBetaOptInStore.getState().setOptIn('trial_screen', true);
    const { result } = renderHook(() => useTrialScreen());
    expect(result.current).toBe(false);
  });

  it.each(['design_v2', 'history_v2'] as const)(
    'reads its own key, never %s’s: the other flag live leaves the trial screen off',
    (other) => {
      // T-2: the trial screen ships behind its OWN flag, never riding another beta.
      __resetAppConfigForTest({
        values: APP_CONFIG_DEFAULTS,
        allowlist: { ...ALLOWLIST_FLAGS_UNSET, [other]: { enabled: false, allowlist: [PM] } },
      });
      useBetaOptInStore.getState().setOptIn(other, true);
      const { result } = renderHook(() => useTrialScreen());
      expect(result.current).toBe(false);
    },
  );
});
