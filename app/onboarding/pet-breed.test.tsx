import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PetBreedScreen from './pet-breed';

// Locks the breed step (B-251 PR 8): the escape hatch when no pet exists, Skip
// advancing without a write, Continue writing the picked breed, and the
// Skip-vs-Continue save guard — a Skip tap must not race an in-flight Continue
// into a double navigation (the code-review finding this test regression-guards).

const mockUpdatePet = jest.fn();
let mockActivePet: unknown = { id: 'pet-1', name: 'Luna', species: 'cat', breed: null };

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
const mockedPush = router.push as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

// pets update chain: .update(...).eq(...) → { error }. resolveNow=false keeps the
// save pending until release() is called, to exercise the mid-save Skip race.
function mockUpdate(resolveNow = true) {
  let release: (() => void) | undefined;
  const eq = jest.fn(() =>
    resolveNow
      ? Promise.resolve({ error: null })
      : new Promise((res) => { release = () => res({ error: null }); }),
  );
  const update = jest.fn(() => ({ eq }));
  mockedFrom.mockReturnValue({ update });
  return { update, eq, release: () => release?.() };
}

describe('PetBreedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePet = { id: 'pet-1', name: 'Luna', species: 'cat', breed: null };
  });

  it('bounces to the type step when there is no active pet (stray entry)', () => {
    mockActivePet = null;
    render(<PetBreedScreen />);
    expect(mockedReplace).toHaveBeenCalledWith('/onboarding/pet-type');
  });

  it('Skip advances to gender without writing a breed', () => {
    mockUpdate();
    const { getByTestId } = render(<PetBreedScreen />);
    fireEvent.press(getByTestId('onboarding-skip'));
    expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-gender');
    expect(mockedFrom).not.toHaveBeenCalled(); // no breed write on Skip
  });

  it('Continue writes the picked breed then advances', async () => {
    const { update, eq } = mockUpdate();
    const { getByText, getByTestId } = render(<PetBreedScreen />);
    // Pick a pinned cat breed (renders without scrolling).
    fireEvent.press(getByText('Domestic Shorthair'));
    fireEvent.press(getByTestId('pet-breed-continue'));
    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-gender'));
    expect(update).toHaveBeenCalledWith({ breed: 'Domestic Shorthair' });
    expect(eq).toHaveBeenCalledWith('id', 'pet-1');
    expect(mockUpdatePet).toHaveBeenCalledWith({ breed: 'Domestic Shorthair' });
  });

  it('does not double-navigate when Skip is tapped during an in-flight Continue save', async () => {
    const { release } = mockUpdate(false); // save stays pending
    const { getByText, getByTestId } = render(<PetBreedScreen />);
    fireEvent.press(getByText('Domestic Shorthair'));
    fireEvent.press(getByTestId('pet-breed-continue')); // saving = true, update pending
    fireEvent.press(getByTestId('onboarding-skip'));    // must be ignored (guard + disabled)
    expect(mockedPush).not.toHaveBeenCalled();          // neither path has navigated yet
    release();                                          // let the Continue save resolve
    await waitFor(() => expect(mockedPush).toHaveBeenCalledTimes(1));
    expect(mockedPush).toHaveBeenCalledWith('/onboarding/pet-gender');
  });
});
