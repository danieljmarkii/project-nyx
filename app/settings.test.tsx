import { act, render } from '@testing-library/react-native';
import SettingsScreen from './settings';
import { __resetAppConfigForTest } from '../hooks/useAppConfig';
import {
  ALLOWLIST_FLAGS_UNSET,
  APP_CONFIG_DEFAULTS,
  type AllowlistFlagValues,
} from '../lib/appConfig';
import { useBetaOptInStore } from '../lib/betaFeatures';
import { JS_UPDATE_ID, JS_CHANNEL, JS_IS_EMBEDDED } from '../lib/appInfo';
import { formatAppVersion, formatJsBundle } from '../lib/support';
import { APP_VERSION, APP_BUILD } from '../lib/appInfo';

// Pins the B-747 fix at its fix SITE — the "You" screen's Beta-features row:
//   • the row's visibility is an OR over the WHOLE registry (the shipped bug
//     gated it on widget_enabled alone, so an account allowlisted only for a
//     later beta could never reach the shelf);
//   • the "N on" trailing count counts every eligible+opted-in beta, not just
//     the widget (the same bug one line down, HR-10's "including
//     activeBetaCount").
// The pure derivation is contract-tested in lib/betaFeatures.test.ts; this test
// exists because the bug lived HERE, in the screen's own wiring — a green pure
// test would not catch this screen hard-coding a key again (the CUL-613 lesson:
// pin the tree the guard was written for).

jest.mock('../lib/supabase', () => ({ supabase: {} }));
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
// Rows with their own I/O (profile fetch, type-to-confirm delete) are not what
// this test pins — render them inert.
jest.mock('../components/profile/OwnerNameRow', () => ({ OwnerNameRow: () => null }));
jest.mock('../components/profile/DeleteAccountSheet', () => ({
  DeleteAccountSheet: () => null,
}));
// The sign-out drain machinery pulls the sync/SQLite graph — stubbed; never
// exercised here (no sign-out interaction in these cases).
jest.mock('../lib/session', () => ({
  flushForSignOut: jest.fn(),
  unsentSignOutWarning: jest.fn(() => null),
}));
// Native version/build reads — constants are all the screen needs.
jest.mock('../lib/appInfo', () => ({ APP_VERSION: '1.0.0', APP_BUILD: '42', PLATFORM: 'ios' }));
jest.mock('../store/petStore', () => ({
  usePetStore: (sel: (s: { pets: { id: string; name: string }[] }) => unknown) =>
    sel({ pets: [] }),
}));
jest.mock('../store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string; email: string } }) => unknown) =>
    sel({ user: { id: 'pm-uid', email: 'pm@example.com' } }),
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

describe('Settings — the Early-access row gate (B-747)', () => {
  it('shows the row for an account eligible ONLY for a non-widget beta', () => {
    // The B-747 regression case: a non-widget beta allowlisted, widget dark. (The
    // original case used the log-picker beta, retired with CUL-962; Noticed is the
    // same shape.) Pre-fix, this account had no row and therefore no path to the shelf.
    setAllowlist({ daily_look: gatedToPm });
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Early access')).toBeTruthy();
  });

  it('shows no row (and no hint the program exists) when no beta is eligible', () => {
    const { queryByText } = render(<SettingsScreen />);
    expect(queryByText('Early access')).toBeNull();
  });

  it('counts every eligible+opted-in beta in the "N on" note, not just the widget', () => {
    setAllowlist({ widget_enabled: gatedToPm, daily_look: gatedToPm });
    useBetaOptInStore.getState().setOptIn('daily_look', true);
    const { getByText, rerender, queryByText } = render(<SettingsScreen />);
    // Pre-fix, a non-widget opt-in was invisible to the count.
    expect(getByText('1 on')).toBeTruthy();

    // A store write after mount re-renders the subscribed screen — wrap it.
    act(() => useBetaOptInStore.getState().setOptIn('widget_enabled', true));
    rerender(<SettingsScreen />);
    expect(getByText('2 on')).toBeTruthy();
    expect(queryByText('1 on')).toBeNull();
  });

  it('says early access, never beta, in what it shows and speaks (CUL-70)', () => {
    // "Beta" reads as Guideline 2.2 ("demos, betas, and trial versions") in App
    // Review's skim, and a screen-reader user hears the label and hint, not the text.
    setAllowlist({ widget_enabled: gatedToPm });
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    const { getByText, getByLabelText, getByHintText, queryByText } = render(<SettingsScreen />);

    expect(getByText('Early access')).toBeTruthy();
    expect(getByText('Try new features early')).toBeTruthy();
    expect(getByLabelText('Early access, 1 on')).toBeTruthy();
    expect(getByHintText('Opens the early-access features you can switch on')).toBeTruthy();
    expect(queryByText(/\bbeta\b/i)).toBeNull();
  });

  it('hides the count at 0 on — an eligible owner sees a clean doorway', () => {
    setAllowlist({ widget_enabled: gatedToPm });
    const { getByText, queryByText } = render(<SettingsScreen />);
    expect(getByText('Early access')).toBeTruthy();
    expect(queryByText(/\d+ on/)).toBeNull();
  });
});

// CUL-690 — the version foot names the JS bundle as well as the binary.
//
// This pins that the LINE MOUNTS, which is the half a pure test cannot see: the
// screen previously rendered only the binary's version, so two devices on
// different JS bundles read identically. What the line SAYS across the three
// states (embedded / an update / unreadable) is pinned in lib/support.test.ts,
// where the update id is a parameter rather than whatever the test runner
// happens to report — including the abbreviation, which is invisible here
// because a runner with no update reads "unknown" in both forms.
describe('Settings — the version foot names the JS bundle (CUL-690)', () => {
  it('renders the binary version and the JS bundle as two separate lines', () => {
    const { getByText } = render(<SettingsScreen />);
    getByText(`Culprit v${formatAppVersion(APP_VERSION, APP_BUILD)}`);
    getByText(formatJsBundle(JS_UPDATE_ID, JS_IS_EMBEDDED, JS_CHANNEL, { abbreviate: true }));
  });
});
