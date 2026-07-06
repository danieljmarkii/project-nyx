import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PetGenderScreen from './pet-gender';

// Locks the gender step (B-251 PR 8): the escape hatch when no pet exists, Skip
// advancing to Home leaving sex='unknown' (its insert default, no write), and
// Continue writing the picked sex before advancing.

const mockUpdatePet = jest.fn();
let mockActivePet: unknown = { id: 'pet-1', name: 'Luna', species: 'cat', sex: 'unknown' };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../store/petStore', () => ({
  usePetStore: jest.fn(() => ({ activePet: mockActivePet, updatePet: mockUpdatePet })),
}));

const mockedFrom = supabase.from as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

// pets update chain: .update(...).eq(...) → { error }.
function mockUpdate() {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  mockedFrom.mockReturnValue({ update });
  return { update, eq };
}

describe('PetGenderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePet = { id: 'pet-1', name: 'Luna', species: 'cat', sex: 'unknown' };
  });

  it('bounces to the type step when there is no active pet (stray entry)', () => {
    mockActivePet = null;
    render(<PetGenderScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });

  it('Skip advances to Home leaving sex unwritten', () => {
    mockUpdate();
    const { getByTestId } = render(<PetGenderScreen />);
    fireEvent.press(getByTestId('onboarding-skip'));
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockedFrom).not.toHaveBeenCalled(); // sex stays 'unknown' — no write
  });

  it('Continue writes the picked sex then advances to Home', async () => {
    const { update, eq } = mockUpdate();
    const { getByText, getByTestId } = render(<PetGenderScreen />);
    fireEvent.press(getByText('Female'));
    fireEvent.press(getByTestId('pet-gender-continue'));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(update).toHaveBeenCalledWith({ sex: 'female' });
    expect(eq).toHaveBeenCalledWith('id', 'pet-1');
    expect(mockUpdatePet).toHaveBeenCalledWith({ sex: 'female' });
  });
});
