// The intake door's host + its store slice (CUL-870 / N-3b).
//
// Tested directly because the DoD's bar for a Zustand change is a test of the new logic,
// and neither of the two suites either side reaches this: `LookCard.test.tsx` asserts the
// store state after the chip tap and never mounts the host, and
// `IntakeFirstMealSheet.test.tsx` renders the PANEL, bypassing the store and the wrapper
// entirely. What is only true here is the LIFECYCLE — that a second open is a second
// sheet, which is the assumption the panel's one-shot pre-fill read rests on.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/meals', () => ({ insertMeal: jest.fn() }));

const mockLoadDoor = jest.fn();
jest.mock('../../lib/intakeFirstMeal', () => ({
  loadIntakeDoor: (...a: unknown[]) => mockLoadDoor(...a),
  pickedFoodSource: () => 'picked',
}));

jest.mock('./FoodPicker', () => {
  const { View } = require('react-native');
  return { FoodPicker: () => <View testID="food-picker" /> };
});

import { act, render, waitFor } from '@testing-library/react-native';
import { IntakeDoorHost } from './IntakeDoorHost';
import { useUiStore } from '../../store/uiStore';

const REQUEST = {
  petId: 'p1',
  petName: 'Mochi',
  sex: 'male' as const,
  cardHasSelections: false,
};

const DIET = {
  id: 'f1',
  brand: 'Royal Canin',
  product_name: 'HP',
  format: 'dry',
  food_type: 'meal' as const,
  photo_path: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadDoor.mockResolvedValue({
    prefill: { food: DIET, source: 'recent_meal' },
    trial: { status: 'no_trial' },
  });
  act(() => {
    useUiStore.setState({ intakeDoor: null });
  });
});

describe('the host', () => {
  it('renders nothing until the card asks', () => {
    const { queryByTestId } = render(<IntakeDoorHost />);
    expect(queryByTestId('intake-sheet-title')).toBeNull();
    expect(mockLoadDoor).not.toHaveBeenCalled();
  });

  it('opens the sheet for the request’s pet, and reads for THAT pet', async () => {
    // C-9 / T-11: the door was tapped on one animal's card, and the request carries the
    // subject rather than the sheet re-reading whoever is active by the time it mounts.
    const { findByTestId } = render(<IntakeDoorHost />);
    act(() => {
      useUiStore.getState().openIntakeDoor({ ...REQUEST, petId: 'p2', petName: 'Juniper' });
    });
    await findByTestId('intake-sheet-title');
    expect(mockLoadDoor).toHaveBeenCalledWith('p2');
  });

  it('closes on a dismiss, and clears the request rather than hiding a live one', async () => {
    const { findByTestId, queryByTestId } = render(<IntakeDoorHost />);
    act(() => {
      useUiStore.getState().openIntakeDoor(REQUEST);
    });
    await findByTestId('intake-sheet-close');
    act(() => {
      useUiStore.getState().closeIntakeDoor();
    });
    await waitFor(() => expect(queryByTestId('intake-sheet-title')).toBeNull());
    expect(useUiStore.getState().intakeDoor).toBeNull();
  });

  it('a SECOND open for the SAME pet is a fresh sheet, not the last one revived', async () => {
    // The panel resolves its pre-fill once, on mount — which is only correct if "mount"
    // and "open" are the same event. If a reopen reused the mounted sheet, it would show
    // the food (and the `nowPoint`) from the previous open, which on a sheet whose title
    // is a timestamp is a stale promise (C-10).
    const { findByTestId } = render(<IntakeDoorHost />);
    act(() => {
      useUiStore.getState().openIntakeDoor(REQUEST);
    });
    await findByTestId('intake-sheet-title');
    expect(mockLoadDoor).toHaveBeenCalledTimes(1);

    act(() => {
      useUiStore.getState().closeIntakeDoor();
    });
    act(() => {
      useUiStore.getState().openIntakeDoor(REQUEST);
    });
    await findByTestId('intake-sheet-title');
    expect(mockLoadDoor).toHaveBeenCalledTimes(2);
  });
});
