import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PetNameScreen from './pet-name';
import { useOnboardingDraftStore } from '../../store/onboardingDraftStore';

// Locks the pet-name step (B-251 PR 7): Continue is gated on a non-empty name,
// a valid submit inserts the pet row ({user_id, name, species}) with the species
// carried in the shared onboarding draft and routes on to Home, and an entry with
// no species (a stray deep link) is bounced back to the type step rather than
// trapped. Uses the real draft store so the field↔draft wiring is exercised.

const mockAddPet = jest.fn();
const mockSetOnboarded = jest.fn();

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../store/petStore', () => ({
  usePetStore: jest.fn(() => ({ addPet: mockAddPet, setOnboarded: mockSetOnboarded })),
}));

const mockedFrom = supabase.from as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

const PET = { id: 'pet-1', name: 'Luna', species: 'cat' };

// pets insert chain: .insert(...).select().single() → { data, error }.
function mockInsert() {
  const single = jest.fn().mockResolvedValue({ data: PET, error: null });
  const insert = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  mockedFrom.mockReturnValue({ insert });
  return { insert };
}

describe('PetNameScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Arrive with a species chosen on the type step (the normal entry).
    useOnboardingDraftStore.setState({ species: 'cat', name: '' });
  });

  it('does not submit until a non-empty name is entered', () => {
    mockInsert();
    const { getByTestId } = render(<PetNameScreen />);
    // Continue disabled while the field is empty — pressing it inserts nothing.
    fireEvent.press(getByTestId('pet-name-continue'));
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('inserts the pet with the carried species and routes to Home', async () => {
    const { insert } = mockInsert();
    const { getByTestId } = render(<PetNameScreen />);

    fireEvent.changeText(getByTestId('pet-name-input'), '  Luna  ');
    fireEvent.press(getByTestId('pet-name-continue'));

    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockedFrom).toHaveBeenCalledWith('pets');
    // Name is trimmed; species comes from the draft (cat).
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', name: 'Luna', species: 'cat' });
    expect(mockAddPet).toHaveBeenCalledWith(PET, { select: true });
    expect(mockSetOnboarded).toHaveBeenCalledWith(true);
  });

  it('bounces back to the type step when no species was chosen (stray entry)', () => {
    useOnboardingDraftStore.setState({ species: null, name: '' });
    render(<PetNameScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });
});
