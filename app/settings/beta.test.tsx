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
    expect(getByText(/Early-access features come and go while we build/)).toBeTruthy();

    // The action-promising intro and the honesty note are gone with the cards —
    // there is nothing to switch on and nothing "on" to be honest about.
    expect(queryByText(/Switch one on to try it early/)).toBeNull();
    expect(queryByText(/may change or be pulled/)).toBeNull();
    expect(queryAllByRole('switch')).toHaveLength(0);
  });
});

describe('BetaFeaturesScreen — eligible account', () => {
  it('renders a card per eligible beta and no empty state', () => {
    setAllowlist({ widget_enabled: gatedToPm });
    const { getByText, queryByText } = render(<BetaFeaturesScreen />);

    expect(getByText('Home screen widget')).toBeTruthy();
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

  it('scopes the honesty note to what is ALREADY in the record — never a blanket promise (CUL-224)', () => {
    // The page-level "won’t affect your records" was true only while the one beta
    // (the widget) read and never wrote. The shelf now carries betas an owner records
    // THROUGH (the case first used the log picker, retired with CUL-962, then Noticed,
    // retired with CUL-876) — so the note may promise only what holds for every beta:
    // switching one on rewrites nothing already logged.
    setAllowlist({ widget_enabled: gatedToPm });
    const { getByText, queryByText } = render(<BetaFeaturesScreen />);

    expect(getByText('Home screen widget')).toBeTruthy();
    expect(getByText(/Turning one on doesn’t change anything already in your records\./)).toBeTruthy();
    expect(queryByText(/won’t affect your records/)).toBeNull();
  });

  it('shows no card for a graduated beta: Noticed (CUL-876), History v2 (CUL-1175) and Design v2 (CUL-1071)', () => {
    // Every remaining beta allowlisted, so a graduated card would have every chance to
    // render; its absence is the registry row's removal, not a gate. An allowlist row for
    // a graduated key is ignored by the client union (`lib/appConfig.test.ts`).
    setAllowlist({ widget_enabled: gatedToPm });
    const { getByText, queryByText, getAllByRole } = render(<BetaFeaturesScreen />);

    expect(getByText('Home screen widget')).toBeTruthy();
    expect(getAllByRole('switch')).toHaveLength(1);
    expect(queryByText('Noticed')).toBeNull();
    expect(queryByText('History v2')).toBeNull();
    expect(queryByText('Design v2')).toBeNull();
    expect(queryByText(/Switch it off and the app is exactly as it was/)).toBeNull();
  });
});

// CUL-70 (D8, ruled 2026-08-20): owner-facing, the shelf is "Early access". "Beta"
// pattern-matches App Review Guideline 2.2 in a reviewer's skim, and a screen-reader
// user hears the accessibility props, so the word is checked in what the screen
// SHOWS and in what it SPEAKS. The code keeps its names; only rendered strings count.

// Every string the rendered host tree shows (text children) or speaks (label, hint).
function shownOrSpoken(tree: unknown): string[] {
  if (typeof tree === 'string') return [tree];
  if (tree === null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(shownOrSpoken);
  const node = tree as { props?: Record<string, unknown>; children?: unknown };
  const spoken = [node.props?.accessibilityLabel, node.props?.accessibilityHint].filter(
    (v): v is string => typeof v === 'string',
  );
  return [...spoken, ...shownOrSpoken(node.children ?? null)];
}

const BETA_WORD = /\bbetas?\b/i;

describe('BetaFeaturesScreen — says early access, never beta (CUL-70)', () => {
  it('shows and speaks no "beta" with every card up and a hint open', () => {
    setAllowlist({ widget_enabled: gatedToPm });
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    const { toJSON } = render(<BetaFeaturesScreen />);
    const strings = shownOrSpoken(toJSON());

    // Non-vacuity: the walk reached the title, the cards, the on-state hint and the
    // footer note, so an empty list cannot pass for a clean one.
    expect(strings).toContain('Early access');
    expect(strings).toContain('Home screen widget');
    expect(strings.some((t) => t.startsWith('It’s on. If it isn’t on your home screen'))).toBe(true);
    expect(strings.some((t) => t.includes('Early-access features may change'))).toBe(true);

    expect(strings.filter((t) => BETA_WORD.test(t))).toEqual([]);
  });

  it('shows and speaks no "beta" in the empty state either', () => {
    const { toJSON } = render(<BetaFeaturesScreen />);
    const strings = shownOrSpoken(toJSON());

    expect(strings).toContain('Nothing to try right now');
    expect(strings.filter((t) => BETA_WORD.test(t))).toEqual([]);
  });

  it('labels each switch with its feature’s title and nothing else', () => {
    // The pill is gone, so the label no longer carries a ", beta" to stand in for it:
    // VoiceOver says the title the owner reads, then "switch", then its state.
    setAllowlist({ widget_enabled: gatedToPm });
    const { getAllByRole } = render(<BetaFeaturesScreen />);

    expect(getAllByRole('switch').map((sw) => sw.props.accessibilityLabel)).toEqual(['Home screen widget']);
  });
});
