import { fireEvent, render } from '@testing-library/react-native';
import TrialFoodsScreen from './trial-foods';
import type { TrialAllowedSet } from '../lib/trialAllowedSet';
import { buildTrialContext } from '../lib/dietTrial';

// ── CUL-400 and CUL-1297 — the allowed-set screen's states, and whose trial ──
//
// CUL-400: a read that THREW used to fold into `unknown`, and `unknown` is the
// spinner — so a failing read spun forever with no cause and no way forward. It
// is its own state now, and it says so; the spinner is kept for the one state
// that resolves on its own.
//
// CUL-1297: the pet comes from `?pet=`, falling back to the active pet. Pinned on
// the screen's own wiring (which hook got which pet, which name the header reads,
// where the exposures door goes) — the builders are contract-tested in
// `lib/trialFoodsScreen.test.ts`.

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
jest.mock('../components/brand/WhorlSpinner', () => {
  const { View } = require('react-native');
  return { WhorlSpinner: () => <View testID="whorl-spinner" /> };
});
// The editing surfaces are not under test here; stubbed so the screen's own
// branches are what renders.
jest.mock('../components/log/FoodPicker', () => ({ FoodPicker: () => null }));
jest.mock('../components/profile/AddTrialFoodSheet', () => ({ AddTrialFoodSheet: () => null }));
jest.mock('../components/profile/TrialProteinPicker', () => ({ TrialProteinPicker: () => null }));
jest.mock('../components/profile/TrialProteinCorrectionSheet', () => ({
  TrialProteinCorrectionSheet: () => null,
}));
jest.mock('../lib/dietTrialSetup', () => ({
  ...jest.requireActual('../lib/dietTrialSetup'),
  addTrialFood: jest.fn(),
  setTrialTargetProtein: jest.fn(),
}));

let mockSet: TrialAllowedSet = { status: 'unknown' };
const mockUseTrialAllowedSet = jest.fn((_petId: string | null) => mockSet);
jest.mock('../hooks/useTrialAllowedSet', () => ({
  useTrialAllowedSet: (petId: string | null) => mockUseTrialAllowedSet(petId),
}));
const mockUseDietTrial = jest.fn((_petId: string | null) => ({
  input: null,
  status: 'loading',
  isLoading: true,
  reload: jest.fn(),
  inputIsForPet: false,
}));
jest.mock('../hooks/useDietTrial', () => ({
  useDietTrial: (petId: string | null) => mockUseDietTrial(petId),
}));

// A minimal running trial: one primary food, no extras.
const FOODS = [
  {
    foodItemId: 'f-1',
    foodKey: null,
    label: 'Hydrolyzed HP',
    role: 'primary_diet',
    allowedFrom: '2026-09-01',
    allowedUntil: null,
    primaryProtein: null,
    proteins: [],
  },
];
const SPEC = {
  id: 't-1',
  startedAt: '2026-09-01T12:00:00.000Z',
  endedAt: null,
  targetDurationDays: 56,
};
const READY: TrialAllowedSet = {
  status: 'ready',
  trial: {
    id: 't-1',
    startedAt: '2026-09-01T12:00:00.000Z',
    targetDurationDays: 56,
    endedAt: null,
    targetProtein: null,
  },
  ctx: buildTrialContext(SPEC, FOODS as never),
  foods: FOODS,
} as unknown as TrialAllowedSet;

afterEach(() => {
  mockParams = {};
  mockSet = { status: 'unknown' };
  jest.clearAllMocks();
});

describe('trial foods — the read states (CUL-400)', () => {
  it('a read that threw says so, and never spins', () => {
    mockSet = { status: 'unreadable' };
    const view = render(<TrialFoodsScreen />);
    expect(view.getByTestId('trial-foods-unreadable')).toBeTruthy();
    expect(view.queryByTestId('whorl-spinner')).toBeNull();
    // …and is never drawn as the "no trial" fact, or as an empty list.
    expect(view.queryByTestId('trial-foods-no-trial')).toBeNull();
    expect(view.queryByTestId('trial-foods-row')).toBeNull();
  });

  it('a read still in flight spins, and only then', () => {
    mockSet = { status: 'unknown' };
    const view = render(<TrialFoodsScreen />);
    expect(view.getByTestId('whorl-spinner')).toBeTruthy();
    expect(view.queryByTestId('trial-foods-unreadable')).toBeNull();
  });

  it('no trial is its own plain fact', () => {
    mockSet = { status: 'no_trial' };
    const view = render(<TrialFoodsScreen />);
    expect(view.getByTestId('trial-foods-no-trial')).toBeTruthy();
    expect(view.queryByTestId('whorl-spinner')).toBeNull();
  });
});

describe('trial foods — whose trial (CUL-1297)', () => {
  it('with no ?pet= it reads the active pet, as every current door expects', () => {
    render(<TrialFoodsScreen />);
    expect(mockUseTrialAllowedSet).toHaveBeenLastCalledWith('p1');
    expect(mockUseDietTrial).toHaveBeenLastCalledWith('p1');
  });

  // The two-pet fixture: Biscuit is active, the link names Mochi.
  it('with ?pet= it reads, names and routes onward for THAT pet', () => {
    mockParams = { pet: 'p2' };
    mockSet = READY;
    const view = render(<TrialFoodsScreen />);
    expect(mockUseTrialAllowedSet).toHaveBeenLastCalledWith('p2');
    expect(mockUseDietTrial).toHaveBeenLastCalledWith('p2');
    expect(view.getByText('What Mochi can eat')).toBeTruthy();
    expect(view.getByText('Hydrolyzed HP')).toBeTruthy();

    const { router } = jest.requireMock('expo-router');
    fireEvent.press(view.getByTestId('trial-foods-exposures-door'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/trial-exposures', params: { pet: 'p2' } });
  });

  it('a ?pet= the account does not hold reads nothing and says the pet is gone', () => {
    mockParams = { pet: 'p-archived' };
    // Even a hook that answered must not draw a list under a pet that is gone.
    mockSet = READY;
    const view = render(<TrialFoodsScreen />);
    expect(mockUseTrialAllowedSet).toHaveBeenLastCalledWith(null);
    expect(mockUseDietTrial).toHaveBeenLastCalledWith(null);
    expect(view.getByTestId('trial-foods-pet-gone')).toBeTruthy();
    expect(view.queryByTestId('trial-foods-row')).toBeNull();
    expect(view.queryByTestId('whorl-spinner')).toBeNull();
  });
});
