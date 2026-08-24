// Foods tab loading state (CUL-575). Every other state on this tab is gated on the
// `loaded` flag, which left the first read rendering an empty ScrollView — a blank
// page that reflowed once the library landed. This pins the two ends of that: the
// skeleton while the read is in flight, and the designed states once it answers.
//
// Deliberately narrow. The library's grouping, favourites, archive and trial layers
// have their own unit tests in lib/; this file only asks which state the tab renders.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../hooks/useTrialAllowedSet', () => ({
  useTrialAllowedSet: () => ({ status: 'unknown' }),
}));
jest.mock('../../lib/db', () => ({
  getLibraryFoods: jest.fn(),
  getArchivedFoods: jest.fn(() => Promise.resolve([])),
  getFoodIntakeStats: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../lib/food', () => ({
  groupFoodsByType: () => ({ meals: [], treats: [], other: [] }),
  groupFoodsByBrand: () => [],
  foodIntakeKey: () => 'k',
  foodIntakeNote: () => null,
  indexIntakeStats: () => new Map(),
  foodFavoriteNote: () => null,
}));
jest.mock('../../lib/protein', () => ({ proteinsFromCacheText: () => [] }));
jest.mock('../../components/food/ProteinDisclosure', () => ({ proteinSummaryLine: () => null }));
jest.mock('../../lib/foodFavorites', () => ({ getReliableFavorites: () => [] }));
jest.mock('../../lib/storage', () => ({ getSignedUrls: jest.fn(() => Promise.resolve(new Map())) }));
jest.mock('../../lib/foodArchive', () => ({ restoreFood: jest.fn() }));
jest.mock('../../lib/trialLibraryChrome', () => ({
  buildFoodsTrialStrip: () => null,
  trialChipLabel: () => null,
}));
jest.mock('../../components/foods/FoodRow', () => ({ FoodRow: () => null }));
jest.mock('../../components/foods/ArchivedFoodRow', () => ({ ArchivedFoodRow: () => null }));
jest.mock('../../components/foods/FoodsTrialStrip', () => ({ FoodsTrialStrip: () => null }));
// One STABLE object per store read — a fresh literal per render re-fires the
// screen's useCallback-gated effects forever (see the History test's note).
jest.mock('../../store/petStore', () => {
  const activePet = { id: 'p1', name: 'Rex', species: 'dog' };
  const state = { activePet, pets: [activePet] };
  return { usePetStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
jest.mock('../../store/foodLibraryStore', () => {
  const state = { version: 0, notifyChanged: jest.fn() };
  return {
    useFoodLibraryStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

import { render, waitFor } from '@testing-library/react-native';
import FoodsScreen from './foods';
import { getLibraryFoods } from '../../lib/db';

const mockGetLibraryFoods = getLibraryFoods as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('Foods — the read states', () => {
  it('shows skeleton rows while the first read is in flight, never the empty state', () => {
    mockGetLibraryFoods.mockReturnValue(new Promise(() => {}));
    const { queryByTestId, queryByText } = render(<FoodsScreen />);

    // Hidden from assistive tech by design, so the query has to opt in.
    expect(queryByTestId('foods-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByText('Your food library starts here')).toBeNull();
  });

  it('hands over to the designed empty state once the read answers', async () => {
    mockGetLibraryFoods.mockResolvedValue([]);
    const { getByText, queryByTestId } = render(<FoodsScreen />);

    await waitFor(() => expect(getByText('Your food library starts here')).toBeTruthy());
    expect(queryByTestId('foods-skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('renders the error state, not the skeleton, when the read fails', async () => {
    mockGetLibraryFoods.mockRejectedValue(new Error('disk gone'));
    const { getByText, queryByText, queryByTestId } = render(<FoodsScreen />);

    await waitFor(() => expect(getByText("Couldn't load your foods")).toBeTruthy());
    expect(queryByTestId('foods-skeleton', { includeHiddenElements: true })).toBeNull();
    expect(queryByText('Your food library starts here')).toBeNull();
  });
});
