import { act, render } from '@testing-library/react-native';
import SettingsScreen from './settings';
import { __resetAppConfigForTest } from '../hooks/useAppConfig';
import {
  ALLOWLIST_FLAGS_UNSET,
  APP_CONFIG_DEFAULTS,
  type AllowlistFlagValues,
} from '../lib/appConfig';
import { BETA_REGISTRY, useBetaOptInStore, type BetaFeature } from '../lib/betaFeatures';
import { JS_UPDATE_ID, JS_CHANNEL, JS_IS_EMBEDDED } from '../lib/appInfo';
import { formatAppVersion, formatJsBundle } from '../lib/support';
import { APP_VERSION, APP_BUILD } from '../lib/appInfo';
import { router } from 'expo-router';
import { fireEvent } from '@testing-library/react-native';
import { useAiConsentStore, loadAiConsent } from '../store/aiConsentStore';

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
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));
// CUL-1834: the AI reading row reads the consent cache; the read is stubbed so the
// row's three values can be set directly.
jest.mock('../store/aiConsentStore', () => ({
  ...jest.requireActual('../store/aiConsentStore'),
  loadAiConsent: jest.fn(async () => ({ status: 'error' })),
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

// The shipped shelf is empty at 1.2.0: the widget, its last beta, graduated
// (CUL-1842). The shelf's machinery stays for the next beta, so its gates are pinned
// over a fixture beta seeded into the real registry for the cases that need one.
const FIXTURE_BETA: BetaFeature = {
  key: 'ask_enabled',
  title: 'Fixture feature',
  blurb: 'A fixture feature for the shelf tests.',
  owner: 'Test',
  addedDate: '2026-10-01',
  reviewBy: '2027-01-01',
  serverCost: false,
  careSurface: false,
};
function seedFixtureBeta(): void {
  beforeEach(() => {
    BETA_REGISTRY.push(FIXTURE_BETA);
  });
  afterEach(() => {
    BETA_REGISTRY.splice(BETA_REGISTRY.indexOf(FIXTURE_BETA), 1);
  });
}

function setAllowlist(over: Partial<AllowlistFlagValues>): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, ...over },
  });
}

beforeEach(() => {
  useBetaOptInStore.getState().reset();
  useAiConsentStore.getState().reset();
  setAllowlist({});
});

afterEach(() => {
  __resetAppConfigForTest();
});

describe('Settings — the Early-access row gate (B-747)', () => {
  seedFixtureBeta();

  it('shows the row for an account eligible for a beta', () => {
    // The B-747 regression was a beta allowlisted with another dark; the row is shown
    // by the same OR over the registry (`lib/betaFeatures.test.ts`).
    setAllowlist({ ask_enabled: gatedToPm });
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Early access')).toBeTruthy();
  });

  it('shows no row (and no hint the program exists) when no beta is eligible', () => {
    const { queryByText } = render(<SettingsScreen />);
    expect(queryByText('Early access')).toBeNull();
  });

  it('counts every eligible+opted-in beta in the "N on" note', () => {
    setAllowlist({ ask_enabled: gatedToPm });
    const { getByText, rerender, queryByText } = render(<SettingsScreen />);
    expect(queryByText('1 on')).toBeNull();

    // A store write after mount re-renders the subscribed screen — wrap it.
    act(() => useBetaOptInStore.getState().setOptIn('ask_enabled', true));
    rerender(<SettingsScreen />);
    expect(getByText('1 on')).toBeTruthy();
  });

  it('says early access, never beta, in what it shows and speaks (CUL-70)', () => {
    // "Beta" reads as Guideline 2.2 ("demos, betas, and trial versions") in App
    // Review's skim, and a screen-reader user hears the label and hint, not the text.
    setAllowlist({ ask_enabled: gatedToPm });
    useBetaOptInStore.getState().setOptIn('ask_enabled', true);
    const { getByText, getByLabelText, getByHintText, queryByText } = render(<SettingsScreen />);

    expect(getByText('Early access')).toBeTruthy();
    expect(getByText('Try new features early')).toBeTruthy();
    expect(getByLabelText('Early access, 1 on')).toBeTruthy();
    expect(getByHintText('Opens the early-access features you can switch on')).toBeTruthy();
    expect(queryByText(/\bbeta\b/i)).toBeNull();
  });

  it('hides the count at 0 on — an eligible owner sees a clean doorway', () => {
    setAllowlist({ ask_enabled: gatedToPm });
    const { getByText, queryByText } = render(<SettingsScreen />);
    expect(getByText('Early access')).toBeTruthy();
    expect(queryByText(/\d+ on/)).toBeNull();
  });
});

describe('Settings — the shipped registry: the widget graduated (CUL-1842), the report flow joined (CUL-2288)', () => {
  it('shows the Early access row only through the report flow, and never the widget', () => {
    // Every allowlist key opened to everyone: a graduated card would have every chance
    // to render. The one shipped row is the report flow.
    const open = { enabled: true, allowlist: [] };
    setAllowlist(
      Object.fromEntries(Object.keys(ALLOWLIST_FLAGS_UNSET).map((k) => [k, open])) as Partial<AllowlistFlagValues>,
    );
    const { getByText, queryByText } = render(<SettingsScreen />);
    expect(BETA_REGISTRY.map((b) => b.key)).toEqual(['report_composer_v2']);
    expect(getByText('Early access')).toBeTruthy();
    expect(queryByText('Home screen widget')).toBeNull();
  });

  it('shows no Early access row under the dark seed (migration 111), whatever else is open', () => {
    const open = { enabled: true, allowlist: [] };
    setAllowlist({
      ...(Object.fromEntries(Object.keys(ALLOWLIST_FLAGS_UNSET).map((k) => [k, open])) as Partial<AllowlistFlagValues>),
      report_composer_v2: { enabled: false, allowlist: [] },
    });
    const { queryByText } = render(<SettingsScreen />);
    expect(queryByText('Early access')).toBeNull();
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

// CUL-1834 (frame I): the AI reading row is always present (the App Review notes name
// this path), and its value says On, Off or Not set only once a read has answered for
// THIS account.
describe('Settings — the AI reading row (CUL-1834)', () => {
  const row = { copyVersion: '2026-10-12', source: 'settings', decidedAt: '2026-10-14T09:00:00+00:00' };

  it('is always present, reads on focus, and opens the AI reading screen', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('AI reading')).toBeTruthy();
    expect(getByText('Photos, labels and patterns')).toBeTruthy();
    expect(loadAiConsent).toHaveBeenCalledWith('pm-uid');
    fireEvent.press(getByText('AI reading'));
    expect(router.push).toHaveBeenCalledWith('/settings/ai-reading');
  });

  it('shows no value before a read answers: Not set is a claim, never a loading state', () => {
    const { queryByText } = render(<SettingsScreen />);
    expect(queryByText('Not set')).toBeNull();
    expect(queryByText('On')).toBeNull();
    expect(queryByText('Off')).toBeNull();
  });

  it('says Not set, On or Off from the cached answer', () => {
    useAiConsentStore.getState().setRow('pm-uid', null);
    const first = render(<SettingsScreen />);
    expect(first.getByText('Not set')).toBeTruthy();
    first.unmount();

    useAiConsentStore.getState().setRow('pm-uid', { ...row, granted: true });
    const second = render(<SettingsScreen />);
    expect(second.getByText('On')).toBeTruthy();
    expect(second.getByLabelText('AI reading, On')).toBeTruthy();
    second.unmount();

    useAiConsentStore.getState().setRow('pm-uid', { ...row, granted: false });
    const third = render(<SettingsScreen />);
    expect(third.getByText('Off')).toBeTruthy();
  });

  it("never shows another account's cached answer", () => {
    useAiConsentStore.getState().setRow('someone-else', { ...row, granted: true });
    const { queryByText } = render(<SettingsScreen />);
    expect(queryByText('On')).toBeNull();
  });
});
