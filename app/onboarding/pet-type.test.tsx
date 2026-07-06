import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PetTypeScreen from './pet-type';
import { useOnboardingDraftStore } from '../../store/onboardingDraftStore';

// Locks the two required behaviours of the pet-type step (B-251 PR 7): Continue
// is a wall until a type is explicitly chosen (no default selection), and once
// chosen it records the species in the shared onboarding draft and advances to
// the name step. Uses the real draft store (not a mock) so the selection wiring
// is exercised end-to-end.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const mockedPush = router.push as jest.Mock;

describe('PetTypeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingDraftStore.getState().reset();
  });

  it('does not advance until a type is selected (no default selection)', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    // Continue is disabled with nothing selected — pressing it is a no-op.
    fireEvent.press(getByTestId('pet-type-continue'));
    expect(mockedPush).not.toHaveBeenCalled();
    expect(useOnboardingDraftStore.getState().species).toBeNull();
  });

  it('records the chosen species in the draft and advances to the name step', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    fireEvent.press(getByTestId('pet-type-cat'));
    expect(useOnboardingDraftStore.getState().species).toBe('cat');
    fireEvent.press(getByTestId('pet-type-continue'));
    expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-name');
  });

  it('lets the owner change the chosen type before advancing', () => {
    const { getByTestId } = render(<PetTypeScreen />);
    fireEvent.press(getByTestId('pet-type-cat'));
    fireEvent.press(getByTestId('pet-type-dog'));
    expect(useOnboardingDraftStore.getState().species).toBe('dog');
  });
});
