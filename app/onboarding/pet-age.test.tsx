import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PetAgeScreen from './pet-age';

// Locks the age step (B-251 PR 9): the escape hatch when no pet exists, Skip
// advancing to Home with no write, Age mode writing an APPROXIMATE DOB, and
// Birthday mode writing an EXACT DOB. The date math itself is covered exhaustively
// in lib/age.test.ts — here we only assert the write carries the right precision.

const mockUpdatePet = jest.fn();
let mockActivePet: unknown = { id: 'pet-1', name: 'Luna', species: 'cat', date_of_birth: null, date_of_birth_precision: 'exact' };

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
// A concrete calendar pick, deterministic: the mocked picker fires onChange with a
// fixed date the moment it's rendered-and-tapped.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: { onChange: (e: unknown, d?: Date) => void }) =>
      React.createElement(
        Pressable,
        { testID: 'mock-datepicker', onPress: () => props.onChange({}, new Date(2020, 0, 15)) },
        React.createElement(Text, null, 'picker'),
      ),
  };
});

const mockedFrom = supabase.from as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

// pets update chain: .update(...).eq(...) → { error }.
function mockUpdate() {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  mockedFrom.mockReturnValue({ update });
  return { update, eq };
}

describe('PetAgeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePet = { id: 'pet-1', name: 'Luna', species: 'cat', date_of_birth: null, date_of_birth_precision: 'exact' };
  });

  it('bounces to the type step when there is no active pet (stray entry)', () => {
    mockActivePet = null;
    render(<PetAgeScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });

  it('Skip advances to Home with no write (date_of_birth stays null)', () => {
    mockUpdate();
    const { getByTestId } = render(<PetAgeScreen />);
    fireEvent.press(getByTestId('onboarding-skip'));
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('Continue is disabled until an age is entered', () => {
    mockUpdate();
    const { getByTestId } = render(<PetAgeScreen />);
    fireEvent.press(getByTestId('pet-age-continue'));
    // No age entered → the write never fires.
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('Age mode writes an APPROXIMATE date_of_birth', async () => {
    const { update } = mockUpdate();
    const { getByTestId } = render(<PetAgeScreen />);
    fireEvent.changeText(getByTestId('pet-age-years'), '2');
    fireEvent.press(getByTestId('pet-age-continue'));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          date_of_birth: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          date_of_birth_precision: 'approximate',
        }),
      ),
    );
    expect(mockUpdatePet).toHaveBeenCalledWith(
      expect.objectContaining({ date_of_birth_precision: 'approximate' }),
    );
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('Birthday mode writes an EXACT date_of_birth from the picked date', async () => {
    const { update } = mockUpdate();
    const { getByText, getByTestId } = render(<PetAgeScreen />);
    fireEvent.press(getByText('Birthday'));
    fireEvent.press(getByTestId('pet-age-birthday')); // reveal the picker
    fireEvent.press(getByTestId('mock-datepicker')); // pick 2020-01-15
    fireEvent.press(getByTestId('pet-age-continue'));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        date_of_birth: '2020-01-15',
        date_of_birth_precision: 'exact',
      }),
    );
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
