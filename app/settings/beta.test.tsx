import { act, render } from '@testing-library/react-native';
import BetaFeaturesScreen from './beta';
import { __resetAppConfigForTest } from '../../hooks/useAppConfig';
import {
  ALLOWLIST_FLAGS_UNSET,
  APP_CONFIG_DEFAULTS,
  type AllowlistFlagValues,
} from '../../lib/appConfig';
import { useBetaOptInStore } from '../../lib/betaFeatures';

// Pins the shelf's two body states (B-729, W1-PR-0):
//   • zero eligible betas → the DESIGNED empty state, and the intro ("switch one
//     on") + honesty note are gone — the intro must never promise an action with
//     no card to act on (the B-729 bug shape);
//   • ≥1 eligible → cards render (in registry order via BETA_REGISTRY), no empty
//     state, and a non-eligible beta's card still self-gates away.
// Eligibility is driven through the real appConfig observable
// (__resetAppConfigForTest) + the real resolver, so this exercises the same
// derivation app/settings.tsx gates its row on (hooks/useBetaShelf).

// appConfig's supabase import fail-fasts on unset env in the jest runner — stub
// the client (the appConfig/betaFeatures test convention).
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
// The signed-in caller the allowlists resolve against (useBetaShelf + each
// card's useAllowlistFlag read the uid through the auth store).
jest.mock('../../store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) =>
    sel({ user: { id: 'pm-uid' } }),
}));

const gatedToPm = { enabled: false, allowlist: ['pm-uid'] };

function setAllowlist(over: Partial<AllowlistFlagValues>): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, ...over },
  });
}

beforeEach(() => {
  useBetaOptInStore.getState().reset();
  setAllowlist({});
});

afterEach(() => {
  __resetAppConfigForTest();
});

describe('BetaFeaturesScreen — zero eligible betas (B-729)', () => {
  it('renders the designed empty state, never the intro over no cards', () => {
    const { getByText, queryByText, queryAllByRole } = render(<BetaFeaturesScreen />);

    expect(getByText('Nothing to try right now')).toBeTruthy();
    expect(getByText(/Beta features come and go while we build/)).toBeTruthy();

    // The action-promising intro and the honesty note are gone with the cards —
    // there is nothing to switch on and nothing "on" to be honest about.
    expect(queryByText(/Switch one on to try it early/)).toBeNull();
    expect(queryByText(/may change or be pulled/)).toBeNull();
    expect(queryAllByRole('switch')).toHaveLength(0);
  });
});

describe('BetaFeaturesScreen — eligible account', () => {
  it('renders a card per eligible beta and no empty state', () => {
    setAllowlist({ widget_enabled: gatedToPm, event_types_v2: gatedToPm });
    const { getByText, queryByText } = render(<BetaFeaturesScreen />);

    expect(getByText('Home screen widget')).toBeTruthy();
    expect(getByText('More event types')).toBeTruthy();
    expect(getByText(/Switch one on to try it early/)).toBeTruthy();
    expect(queryByText('Nothing to try right now')).toBeNull();
  });

  it('swaps the cards for the empty state when eligibility is revoked while mounted', () => {
    // The mid-session eligibility-loss race B-729 exists for — and the one
    // behavior useAllowlistFlagsRaw exists to provide: a config fetch landing
    // AFTER mount re-renders the subscribed shelf on its own, no remount, no
    // manual rerender (code-review follow-up on W1-PR-0).
    setAllowlist({ widget_enabled: gatedToPm });
    const { getByText, queryByText } = render(<BetaFeaturesScreen />);
    expect(getByText('Home screen widget')).toBeTruthy();
    expect(queryByText('Nothing to try right now')).toBeNull();

    act(() => setAllowlist({})); // the next fetch lands with the account removed

    expect(getByText('Nothing to try right now')).toBeTruthy();
    expect(queryByText('Home screen widget')).toBeNull();
    expect(queryByText(/Switch one on to try it early/)).toBeNull();
  });

  it('a non-eligible beta’s card still self-gates away while others render', () => {
    setAllowlist({ event_types_v2: gatedToPm });
    const { getByText, queryByText } = render(<BetaFeaturesScreen />);

    expect(getByText('More event types')).toBeTruthy();
    expect(queryByText('Home screen widget')).toBeNull();
    expect(queryByText('Log screen redesign')).toBeNull();
  });
});
