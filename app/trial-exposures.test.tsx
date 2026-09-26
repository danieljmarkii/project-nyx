import { render } from '@testing-library/react-native';
import TrialExposuresScreen from './trial-exposures';
import type { TrialExposuresScreenModel } from '../lib/trialExposuresScreen';

// ── CUL-728, the third site — the sweep said two, and there were three ──────
//
// An exposure row the app cannot explain carries `reason: null`. The screen has
// always known that means "not a button" — the comment above the row says so in
// as many words — and expressed it as `disabled={row.reason === null}` with the
// role and label dropped in that branch. But RN copies `disabled` into
// `accessibilityState.disabled` (TouchableOpacity.js) and iOS maps that to
// UIAccessibilityTraitNotEnabled, which VoiceOver speaks as "dimmed". So the row
// announced its own text plus an unavailable control that was never there — on
// the surface that itemises the owner's record against a diet trial, where the
// rows without a reason are exactly the ones already carrying the least
// explanation.
//
// Asserted on the announcement, not through a press: `fireEvent.press` on a
// disabled touchable is silent either way and cannot tell "inert" from "inert
// and announced as unavailable" (CUL-579).

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/supabase', () => ({ supabase: {} }));
// Two pets, Biscuit active. `resolveRecordPetName` is the real one (C-9).
const PETS = [
  { id: 'p1', name: 'Biscuit' },
  { id: 'p2', name: 'Mochi' },
];
jest.mock('../store/petStore', () => ({
  ...jest.requireActual('../store/petStore'),
  usePetStore: (sel: (s: { activePet: { id: string; name: string }; pets: typeof PETS }) => unknown) =>
    sel({ activePet: PETS[0], pets: PETS }),
}));
// A trial exists and its facts read cleanly; the model below is what this test
// drives. The builder is contract-tested in lib/trialExposuresScreen.test.ts —
// what is pinned HERE is the screen's own wiring, which is where the bug lived
// (the CUL-613 lesson: pin the tree the guard was written for).
const mockUseTrialFacts = jest.fn((_petId: string | null) => ({ status: 'ready', facts: {} }));
jest.mock('../hooks/useTrialFacts', () => ({
  useTrialFacts: (petId: string | null) => mockUseTrialFacts(petId),
}));

const model: TrialExposuresScreenModel = {
  title: 'Outside the trial diet',
  subtitle: '2 of 68 logged feedings · 3 July – 25 July',
  groups: [
    {
      title: null,
      rows: [
        {
          key: 'explained',
          label: 'Dental chew',
          meta: '24 July, 6:40 PM · not recognised',
          reason: { title: 'Not on the trial list', body: 'It was never added.' },
        },
        {
          key: 'unexplained',
          label: 'Table scrap',
          meta: '22 July, 8:05 PM',
          reason: null,
        },
      ],
    },
  ],
  notes: [],
  footer: 'This is a floor, not a total.',
  empty: null,
};

jest.mock('../lib/trialExposuresScreen', () => ({
  ...jest.requireActual('../lib/trialExposuresScreen'),
  buildTrialExposuresScreen: jest.fn(() => model),
}));

describe('trial exposures rows', () => {
  const rows = () => render(<TrialExposuresScreen />).getAllByTestId('trial-exposure-row');

  it('a row with no reason carries no disabled state to announce', () => {
    const [, unexplained] = rows();
    expect(unexplained.props.accessibilityState?.disabled).toBeFalsy();
    // And is not a phantom control either — dropping only `disabled` would leave
    // a row that focuses and responds while doing nothing.
    expect(typeof unexplained.props.onStartShouldSetResponder).not.toBe('function');
  });

  // One stop, not two. The touchable branch is `accessible` by default, so the
  // View has to say so explicitly or the food and its timestamp split into two
  // unrelated announcements — the label sitting there looking like a fix while
  // doing nothing, which is the CUL-682 half that is easiest to drop.
  it('a row with no reason is one accessible node carrying both facts', () => {
    const [, unexplained] = rows();
    expect(unexplained.props.accessible).toBe(true);
    expect(unexplained.props.accessibilityLabel).toBe('Table scrap. 22 July, 8:05 PM');
  });

  // Nothing is hidden by any of this: the row still renders, because an exposure
  // the app cannot explain still happened. That is the screen's own rule (§6.3 —
  // the count must be checkable), and it is the half a "just drop the row"
  // reading of this fix would break.
  it('still renders the unexplained exposure, with its facts', () => {
    const view = render(<TrialExposuresScreen />);
    expect(view.getAllByTestId('trial-exposure-row')).toHaveLength(2);
    expect(view.getByText('Table scrap')).toBeTruthy();
    expect(view.getByText('22 July, 8:05 PM')).toBeTruthy();
  });

  // The explained row keeps every announcement it had. Pinned because the fix
  // touches this branch too, and a regression here is a reason an owner can no
  // longer reach — the whole point of the screen.
  it('a row with a reason still announces a real, enabled button', () => {
    const [explained] = rows();
    expect(explained.props.accessibilityRole).toBe('button');
    expect(explained.props.accessibilityState?.disabled).toBeFalsy();
    expect(explained.props.accessibilityLabel).toContain('Dental chew');
  });
});

// ── CUL-1297 — the pet comes from the route ─────────────────────────────────
describe('whose trial', () => {
  afterEach(() => {
    mockParams = {};
  });

  it('with no ?pet= it reads the active pet, as every current door expects', () => {
    render(<TrialExposuresScreen />);
    expect(mockUseTrialFacts).toHaveBeenLastCalledWith('p1');
  });

  // The two-pet fixture: Biscuit is active, the link names Mochi.
  it('with ?pet= it reads and names THAT pet, not the active one', () => {
    mockParams = { pet: 'p2' };
    const { buildTrialExposuresScreen } = jest.requireMock('../lib/trialExposuresScreen');
    render(<TrialExposuresScreen />);
    expect(mockUseTrialFacts).toHaveBeenLastCalledWith('p2');
    expect(buildTrialExposuresScreen).toHaveBeenLastCalledWith('Mochi', {});
  });

  // Never another pet's trial under a stale link, and never a spinner that waits
  // for a pet that is gone (C-12).
  it('a ?pet= the account does not hold reads nothing and says the pet is gone', () => {
    mockParams = { pet: 'p-archived' };
    const view = render(<TrialExposuresScreen />);
    expect(mockUseTrialFacts).toHaveBeenLastCalledWith(null);
    // (the mocked hook still answers `ready` — the pet-gone line must win regardless)
    expect(view.queryByTestId('trial-exposure-row')).toBeNull();
    expect(view.getByTestId('trial-exposures-pet-gone')).toBeTruthy();
  });
});
