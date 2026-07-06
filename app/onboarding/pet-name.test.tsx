import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PetNameScreen from './pet-name';
import { useOnboardingDraftStore } from '../../store/onboardingDraftStore';

// Locks the pet-name step (B-251 PR 7, extended PR 8): Continue is gated on a
// non-empty name; a valid submit inserts the pet row ({user_id, name, species})
// with the species carried in the shared onboarding draft and PUSHES on to the
// (skippable) breed step; re-entering this screen via back-navigation UPDATEs the
// already-created row rather than inserting a second pet (the idempotency that
// makes the pushed optional tail single-pet-safe); and an entry with no species
// (a stray deep link) is bounced back to the type step. Uses the real draft store
// so the field↔draft wiring is exercised.

const mockAddPet = jest.fn();
const mockSetOnboarded = jest.fn();
const mockUpdatePet = jest.fn();
// Drives the insert-vs-update branch: null → fresh insert; a pet → update.
const mockGetState = jest.fn(() => ({ activePet: null as unknown }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ user: { id: 'user-1' } })),
}));
jest.mock('../../store/petStore', () => {
  const usePetStore = jest.fn(() => ({
    addPet: mockAddPet,
    setOnboarded: mockSetOnboarded,
    updatePet: mockUpdatePet,
  }));
  // The screen reads the created pet via usePetStore.getState().activePet.
  // Wrapped in an arrow so mockGetState is resolved at call time, not at this
  // factory's (pre-initialization) invocation.
  (usePetStore as unknown as { getState: () => unknown }).getState = () => mockGetState();
  return { usePetStore };
});

const mockedFrom = supabase.from as jest.Mock;
const mockedReplace = router.replace as jest.Mock;
const mockedPush = router.push as jest.Mock;

const PET = { id: 'pet-1', name: 'Luna', species: 'cat' };

// pets insert chain: .insert(...).select().single() → { data, error }.
function mockInsert() {
  const single = jest.fn().mockResolvedValue({ data: PET, error: null });
  const insert = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  mockedFrom.mockReturnValue({ insert });
  return { insert };
}

// pets update chain: .update(...).eq(...) → { error }.
function mockUpdate() {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  mockedFrom.mockReturnValue({ update });
  return { update, eq };
}

describe('PetNameScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Fresh account: no pet created yet (the normal first pass).
    mockGetState.mockReturnValue({ activePet: null });
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

  it('inserts the pet with the carried species and pushes to the breed step', async () => {
    const { insert } = mockInsert();
    const { getByTestId } = render(<PetNameScreen />);

    fireEvent.changeText(getByTestId('pet-name-input'), '  Luna  ');
    fireEvent.press(getByTestId('pet-name-continue'));

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-breed'));
    expect(mockedFrom).toHaveBeenCalledWith('pets');
    // Name is trimmed; species comes from the draft (cat).
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', name: 'Luna', species: 'cat' });
    expect(mockAddPet).toHaveBeenCalledWith(PET, { select: true });
    expect(mockSetOnboarded).toHaveBeenCalledWith(true);
    // First pass never routes to Home directly — the optional steps sit between.
    expect(mockedReplace).not.toHaveBeenCalledWith('/(tabs)');
    expect(mockUpdatePet).not.toHaveBeenCalled();
  });

  it('updates the existing pet instead of inserting a second on re-entry', async () => {
    // Back-navigated here after the pet was already created this session.
    mockGetState.mockReturnValue({ activePet: PET });
    const { update, eq } = mockUpdate();
    const { getByTestId } = render(<PetNameScreen />);

    fireEvent.changeText(getByTestId('pet-name-input'), 'Lunar');
    fireEvent.press(getByTestId('pet-name-continue'));

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-breed'));
    // Updates the created row — no second insert, no re-onboard.
    expect(update).toHaveBeenCalledWith({ name: 'Lunar', species: 'cat' });
    expect(eq).toHaveBeenCalledWith('id', 'pet-1');
    expect(mockUpdatePet).toHaveBeenCalledWith({ name: 'Lunar', species: 'cat' });
    expect(mockAddPet).not.toHaveBeenCalled();
    expect(mockSetOnboarded).not.toHaveBeenCalled();
  });

  it('bounces back to the type step when no species was chosen (stray entry)', () => {
    useOnboardingDraftStore.setState({ species: null, name: '' });
    render(<PetNameScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });
});
