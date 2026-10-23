// The Pet profile hero loads its photo through a signed link (CUL-1856).
//
// The hero is the second of the two renderers of a pet photo (the avatar disc is
// the first, components/pet/PetAvatar.test.tsx). These tests pin what an owner
// sees for each answer the signing gives: the signed photo, the initials when the
// link fails, and a photo button that still names the pet's photo for a pet that has one.
// A guard (guards/petPhotoSignedOnly.test.ts) keeps public URLs out entirely.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    // No doorway params in this suite — the CUL-170 focus path is exercised in
    // `profile.focus.test.tsx`, which owns the mocks that drive it.
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ uri: 'file:///pick.jpg' }] })),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

// Supabase: every read this screen fires resolves empty. The sections are not under
// test here — only the identity block above them.
let mockPhotoUpdateFails = false;
jest.mock('../../lib/supabase', () => {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq']) {
    chain[m] = jest.fn(() => chain);
  }
  Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
  // The photo's row link can be made to fail, to prove the re-sign does not wait on it.
  chain.update = jest.fn(() => ({
    eq: () => Promise.resolve(
      mockPhotoUpdateFails ? { data: null, error: { message: 'update failed' } } : { data: [], error: null },
    ),
  }));
  return { supabase: { from: jest.fn(() => chain), auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } } };
});
// The hero's link comes from these three: the REAL hook (components/pet/PetAvatar)
// drives them, so this suite proves what the screen does with each answer.
const mockGetPetPhotoUrl = jest.fn();
const mockPeekPetPhotoUrl = jest.fn((_path: string): string | null => null);
const mockMarkPetPhotoChanged = jest.fn();
const mockUploadPhoto = jest.fn(() => Promise.resolve());
jest.mock('../../lib/storage', () => ({
  uploadPhoto: (...a: unknown[]) => mockUploadPhoto(...(a as [])),
  compressForUpload: jest.fn((uri: string) => Promise.resolve(uri)),
  getPetPhotoUrl: (path: string) => mockGetPetPhotoUrl(path),
  peekPetPhotoUrl: (path: string) => mockPeekPetPhotoUrl(path),
  evictPetPhotoUrl: () => {},
  petPhotoVersion: () => 0,
  subscribePetPhotoVersions: () => () => {},
  markPetPhotoChanged: (path: string) => mockMarkPetPhotoChanged(path),
  PET_PHOTOS_BUCKET: 'nyx-pet-photos',
  getSignedUrls: jest.fn(() => Promise.resolve(new Map())),
}));

// Heavy children — each has its own suite; here they only need to not render.
jest.mock('../../components/vetfiles/VetFilesCard', () => ({ VetFilesCard: () => null }));
jest.mock('../../components/profile/WeightTrendCard', () => ({ WeightTrendCard: () => null }));
jest.mock('../../components/profile/EditPetModal', () => ({ EditPetModal: () => null }));
jest.mock('../../components/profile/AddConditionModal', () => ({ AddConditionModal: () => null }));
jest.mock('../../components/profile/AddMedicationModal', () => ({ AddMedicationModal: () => null }));
jest.mock('../../components/profile/StartTrialModal', () => ({ StartTrialModal: () => null }));
jest.mock('../../components/profile/ArchivePetSheet', () => ({ ArchivePetSheet: () => null }));
jest.mock('../../components/profile/DietTrialCard', () => ({ DietTrialCard: () => null }));
jest.mock('../../components/profile/TrialCompletionSheet', () => ({ TrialCompletionSheet: () => null }));
jest.mock('../../components/profile/PastMedicationsSection', () => ({ PastMedicationsSection: () => null }));

jest.mock('../../hooks/useDietTrial', () => ({ useDietTrial: () => ({ trial: null, reload: jest.fn() }) }));
jest.mock('../../hooks/useTrialAllowedSet', () => ({ useTrialAllowedSet: () => ({ status: 'unknown' }) }));
jest.mock('../../hooks/useWidgetSlotLabel', () => ({ useWidgetSlotLabel: () => null }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
jest.mock('../../lib/vetDocumentLibrary', () => ({
  readVetLibrary: jest.fn(() => Promise.resolve([])),
  buildVetFilesCardModel: () => ({}),
  VET_DOCUMENT_SIGNED_URL_TTL_SEC: 60,
}));
jest.mock('../../lib/dietTrialCard', () => ({ resolveTrialCard: () => null }));
jest.mock('../../store/momentStore', () => {
  const state = { removedEventId: null, showMedication: jest.fn() };
  return {
    useMomentStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../../store/authStore', () => {
  const state = { user: { id: 'u1', email: 'd@example.test' } };
  return {
    useAuthStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

// ONE stable state object, mutated between renders rather than replaced — a fresh
// literal per render re-fires this screen's useCallback-gated effects forever.
const MOCHI = { id: 'p1', name: 'Mochi', species: 'cat', photo_path: 'a.jpg', weight_kg: 4.1 };
const LUNA = { id: 'p2', name: 'Luna', species: 'cat', photo_path: 'b.jpg', weight_kg: 3.4 };
const mockPetState: { activePet: typeof MOCHI; pets: (typeof MOCHI)[]; updatePet: jest.Mock } = {
  activePet: MOCHI,
  pets: [MOCHI],
  updatePet: jest.fn(),
};
jest.mock('../../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Image } from 'react-native';
import ProfileScreen from './profile';

const SIGNED = 'https://signed.test/object/sign/nyx-pet-photos/a.jpg?token=1';
const heroImages = () =>
  screen.UNSAFE_queryAllByType(Image).filter((n) => Boolean((n.props as { source?: { uri?: string } }).source?.uri));

beforeEach(() => {
  jest.clearAllMocks();
  mockPeekPetPhotoUrl.mockImplementation(() => null);
  mockPetState.activePet = MOCHI;
  mockPetState.pets = [MOCHI];
});

describe('the Pet profile hero reads a signed link', () => {
  it('renders the signed link for the pet photo', async () => {
    mockGetPetPhotoUrl.mockResolvedValue(SIGNED);
    render(<ProfileScreen />);
    await waitFor(() => expect(heroImages()).toHaveLength(1));
    expect(heroImages()[0].props.source.uri).toBe(SIGNED);
    expect(mockGetPetPhotoUrl).toHaveBeenCalledWith('a.jpg');
  });

  it('shows the initials, never a broken image, when signing fails', async () => {
    mockGetPetPhotoUrl.mockResolvedValue(null);
    render(<ProfileScreen />);
    await act(async () => {});
    expect(heroImages()).toHaveLength(0);
    expect(screen.getByText('MO')).toBeTruthy();
    // The pet still has a photo on record, so the photo's button still says it is
    // the pet's photo, never "Add a photo" (round P1: the photo is the button).
    expect(screen.getByLabelText('Mochi’s photo')).toBeTruthy();
    expect(screen.queryByText('Add photo')).toBeNull();
  });

  it('re-signs once when the link fails to load, then falls back to the initials', async () => {
    mockGetPetPhotoUrl
      .mockResolvedValueOnce(SIGNED)
      .mockResolvedValueOnce('https://signed.test/object/sign/nyx-pet-photos/a.jpg?token=2');
    render(<ProfileScreen />);
    await waitFor(() => expect(heroImages()).toHaveLength(1));
    fireEvent(heroImages()[0], 'error');
    await waitFor(() => expect(heroImages()[0]?.props.source.uri).toMatch(/token=2$/));
    expect(mockGetPetPhotoUrl).toHaveBeenCalledTimes(2);

    fireEvent(heroImages()[0], 'error');
    await act(async () => {});
    expect(heroImages()).toHaveLength(0);
    expect(screen.getByText('MO')).toBeTruthy();
  });

  it('says "Add photo" only for a pet with no photo on record', async () => {
    mockPetState.activePet = { ...MOCHI, photo_path: null as unknown as string };
    mockPetState.pets = [mockPetState.activePet];
    render(<ProfileScreen />);
    await act(async () => {});
    expect(screen.getByText('Add photo')).toBeTruthy();
    expect(screen.getByLabelText('Add a photo of Mochi')).toBeTruthy();
    expect(mockGetPetPhotoUrl).not.toHaveBeenCalled();
  });

  it('a new upload tells every disc to sign again', async () => {
    mockGetPetPhotoUrl.mockResolvedValue(SIGNED);
    render(<ProfileScreen />);
    await waitFor(() => expect(heroImages()).toHaveLength(1));
    // The source choice is a system alert; take its library button.
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(screen.getByLabelText('Mochi’s photo'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => unknown }[];
    await act(async () => { await buttons.find((b) => b.text === 'Choose from library')?.onPress?.(); });
    await waitFor(() => expect(mockMarkPetPhotoChanged).toHaveBeenCalledWith('p1/profile.jpg'));
    expect(mockUploadPhoto).toHaveBeenCalledWith('nyx-pet-photos', 'p1/profile.jpg', 'file:///pick.jpg');
  });

  it('a failed row update after the upload still re-signs, since the object changed', async () => {
    mockGetPetPhotoUrl.mockResolvedValue(SIGNED);
    mockUploadPhoto.mockImplementationOnce(() => Promise.resolve());
    render(<ProfileScreen />);
    await waitFor(() => expect(heroImages()).toHaveLength(1));
    const alert = jest.spyOn(Alert, 'alert');
    mockPhotoUpdateFails = true;
    fireEvent.press(screen.getByLabelText('Mochi’s photo'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => unknown }[];
    await act(async () => { await buttons.find((b) => b.text === 'Choose from library')?.onPress?.(); });
    await waitFor(() => expect(mockMarkPetPhotoChanged).toHaveBeenCalledWith('p1/profile.jpg'));
    await act(async () => {});
    mockPhotoUpdateFails = false;
  });
});
