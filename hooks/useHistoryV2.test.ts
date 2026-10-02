// The one gate every History v2 surface reads (HV-1 / CUL-1158): live = eligible &&
// optedIn, proven over the four combinations — being eligible turns nothing on, and an
// opt-in without eligibility is a switch to nothing (the B-712 two-gate shape).
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { renderHook } from '@testing-library/react-native';
import { useHistoryV2 } from './useHistoryV2';
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
      history_v2: { enabled: false, allowlist: eligible ? [PM] : [] },
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

describe('useHistoryV2 — live = eligible && optedIn', () => {
  it.each([
    [false, false, false],
    [true, false, false], // eligible turns nothing on (Gate 2 untouched)
    [false, true, false], // an opt-in with no eligibility is a switch to nothing
    [true, true, true],
  ])('eligible=%s optedIn=%s → %s', (eligible, optedIn, live) => {
    setEligible(eligible);
    if (optedIn) useBetaOptInStore.getState().setOptIn('history_v2', true);
    const { result } = renderHook(() => useHistoryV2());
    expect(result.current).toBe(live);
  });

  it('fails closed on the unset baseline (no seed / config unreachable), even opted in', () => {
    __resetAppConfigForTest();
    useBetaOptInStore.getState().setOptIn('history_v2', true);
    const { result } = renderHook(() => useHistoryV2());
    expect(result.current).toBe(false);
  });

  it('reads its own key, never design_v2’s: the other flag live leaves History v1', () => {
    // The two betas are independent switches (H-8: History ships behind its OWN flag).
    __resetAppConfigForTest({
      values: APP_CONFIG_DEFAULTS,
      allowlist: { ...ALLOWLIST_FLAGS_UNSET, design_v2: { enabled: false, allowlist: [PM] } },
    });
    useBetaOptInStore.getState().setOptIn('design_v2', true);
    const { result } = renderHook(() => useHistoryV2());
    expect(result.current).toBe(false);
  });
});
