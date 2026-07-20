// FoodPicker's search-results mode. While a query is typed, the add CTA, the
// rotation shelf, and "Always available" must all step aside so the filtered
// library renders directly under the pinned search bar. Regression guard for the
// below-the-fold bug: the B-346 rotation shelf (up to ~6 wrapped grid rows) kept
// rendering above the filtered results, so on smaller phones typing a search
// visibly changed nothing — the matches were correct but off-screen.
jest.mock('../../lib/db', () => ({
  getRecentFoods: jest.fn(),
  getLibraryFoods: jest.fn(),
}));
// Mock the arrangements module whole (its module graph reaches expo-sqlite /
// supabase, which can't import under jest) — this test seeds zero arrangements
// and only asserts the section's presence/absence.
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPets: jest.fn().mockResolvedValue([]),
  groupArrangementsByFood: jest.fn(() => []),
  confirmArrangementFresh: jest.fn(),
  endFreeChoice: jest.fn(),
  arrangementPetsLine: jest.fn(() => ''),
  petNameList: jest.fn(() => ''),
  formatCalendarDate: jest.fn(() => null),
  isArrangementStale: jest.fn(() => false),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    // Fire the focus callback once on mount — the picker's data load.
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});

import { render, fireEvent } from '@testing-library/react-native';
import { FoodPicker } from './FoodPicker';
import { usePetStore } from '../../store/petStore';
import * as db from '../../lib/db';
import type { PickerFood } from '../../lib/db';

const DB = db as jest.Mocked<typeof db>;

const food = (id: string, brand: string, product: string): PickerFood => ({
  id,
  brand,
  product_name: product,
  format: 'dry',
  food_type: 'meal',
  photo_path: null,
});

// Duck + Fish are in the 30-day rotation window; Chicken is library-only — the
// food the owner searches for.
const ROTATION = [food('r1', 'Acana', 'Duck'), food('r2', 'Orijen', 'Fish')];
const LIBRARY = [...ROTATION, food('l1', 'Tiki Cat', 'Chicken')];

beforeEach(() => {
  jest.clearAllMocks();
  usePetStore.setState({
    pets: [{
      id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null,
      date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
    }],
  });
  DB.getRecentFoods.mockResolvedValue(ROTATION);
  DB.getLibraryFoods.mockResolvedValue(LIBRARY);
});

function renderPicker() {
  return render(
    <FoodPicker
      petId="p1"
      petName="Nyx"
      onPickFood={jest.fn()}
      onAddNew={jest.fn()}
    />,
  );
}

describe('FoodPicker search-results mode', () => {
  it('browse mode shows the add CTA, rotation shelf, and Always available', async () => {
    const { findByText, getByText } = renderPicker();
    expect(await findByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
  });

  it('typing a query collapses the picker to just the matches', async () => {
    const { findByText, getByPlaceholderText, getByText, queryByText, queryAllByText } =
      renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), 'chick');

    // The three non-result zones step aside…
    expect(queryByText("Nyx's rotation")).toBeNull();
    expect(queryByText('Snap a new food')).toBeNull();
    expect(queryByText('Always available')).toBeNull();
    // …and only the match renders, directly under the pinned bar.
    expect(getByText('Chicken')).toBeTruthy();
    expect(queryAllByText('Duck')).toHaveLength(0);
  });

  it('a no-match query shows the empty state with its own add CTA', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), 'zzz');

    expect(getByText('No matches.')).toBeTruthy();
    // The top CTA is hidden in results mode, so the dead-end carries its own
    // forward path — the food that isn't in the library yet is the one to snap.
    expect(getByText('Snap a new food')).toBeTruthy();
  });

  it('clearing the query restores the browse layout', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");
    const input = getByPlaceholderText('Search brand or product');

    fireEvent.changeText(input, 'chick');
    fireEvent.changeText(input, '');

    expect(getByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
  });

  it('a whitespace-only query stays in browse mode', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), '   ');

    expect(getByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
  });
});
