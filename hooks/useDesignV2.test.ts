// The one gate every Design v2 surface reads (D2-0 / CUL-1062): live = eligible &&
// optedIn, proven over the four combinations — because the whole point of the
// two-gate shape (docs/nyx-beta-features-requirements.md §2) is that being eligible
// turns nothing on, and an opt-in without eligibility is a switch to nothing.
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { renderHook } from '@testing-library/react-native';
import { useDesignV2 } from './useDesignV2';
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
      design_v2: { enabled: false, allowlist: eligible ? [PM] : [] },
    },
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: PM } } as never);
  useBetaOptInStore.getState().reset();
});

describe('useDesignV2 — live = eligible && optedIn', () => {
  it.each([
    [false, false, false],
    [true, false, false], // eligible turns nothing on (Gate 2 untouched)
    [false, true, false], // an opt-in with no eligibility is a switch to nothing
    [true, true, true],
  ])('eligible=%s optedIn=%s → %s', (eligible, optedIn, live) => {
    setEligible(eligible);
    if (optedIn) useBetaOptInStore.getState().setOptIn('design_v2', true);
    const { result } = renderHook(() => useDesignV2());
    expect(result.current).toBe(live);
  });

  it('fails closed on the unset baseline (no seed / config unreachable), even opted in', () => {
    __resetAppConfigForTest();
    useBetaOptInStore.getState().setOptIn('design_v2', true);
    const { result } = renderHook(() => useDesignV2());
    expect(result.current).toBe(false);
  });
});
