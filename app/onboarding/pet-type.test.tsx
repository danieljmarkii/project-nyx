import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PetTypeScreen from './pet-type';

// Locks the two required behaviours of the pet-type step (B-251 PR 7): Continue
// is a wall until a type is explicitly chosen (no default selection), and once
// chosen it advances to the name step carrying the species param.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockedPush = router.push as jest.Mock;

describe('PetTypeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not advance until a type is selected (no default selection)', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    // Continue is disabled with nothing selected — pressing it is a no-op.
    fireEvent.press(getByTestId('pet-type-continue'));
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it('advances to the name step with the chosen species once a tile is tapped', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    fireEvent.press(getByTestId('pet-type-cat'));
    fireEvent.press(getByTestId('pet-type-continue'));
    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/onboarding/pet-name',
      params: { species: 'cat' },
    });
  });

  it('carries the dog species when the dog tile is chosen', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    fireEvent.press(getByTestId('pet-type-dog'));
    fireEvent.press(getByTestId('pet-type-continue'));
    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/onboarding/pet-name',
      params: { species: 'dog' },
    });
  });
});
