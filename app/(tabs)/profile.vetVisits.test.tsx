// CUL-1097 — WHEN the Pet tab renders the Vet visits card.
//
// The card's zero state is two doors saying "you have nothing booked and nothing
// logged", so the tab holds it back until the read has answered FOR THE PET ON SCREEN
// (`vetVisitsLoadedFor === activePet.id`): C-12 (a read that has not answered is never
// an empty record) plus the multi-pet half (a plain `loaded` flag would keep showing
// the previous pet's booking under the new pet's name). `VetVisitsCard.test.tsx` covers
// what the card draws; this file only asks when the tab lets it draw.
//
// Harness: `profile.test.tsx`'s, with two differences that are the point. The read is
// a controllable promise, and `useFocusEffect` re-runs when its callback changes, as
// the real one does while the tab is focused, so a pet switch issues the new pet's
// read. Every hook the focus callback closes over returns a STABLE function, or that
// re-run would loop.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('../../lib/supabase', () => {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq']) {
    chain[m] = jest.fn(() => chain);
  }
  Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
  return { supabase: { from: jest.fn(() => chain), auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } } };
});
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  getPublicUrl: () => 'https://example.test/photo.jpg',
  getSignedUrls: jest.fn(() => Promise.resolve(new Map())),
}));

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

// The card under test is stood in by one line that says whose name it carries and whose
// data it was handed (the visit count differs per pet), which is the whole question.
jest.mock('../../components/vetvisits/VetVisitsCard', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    VetVisitsCard: ({ petName, model }: { petName: string; model: { countLabel: string | null } }) =>
      createElement(Text, { testID: 'vet-visits-card' }, `${petName} · ${model.countLabel ?? 'no visits'}`),
  };
});
const mockReadVetVisitsHome = jest.fn();
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVetVisitsHome: (...a: unknown[]) => mockReadVetVisitsHome(...a),
}));

const mockReloadTrial = jest.fn();
jest.mock('../../hooks/useDietTrial', () => ({ useDietTrial: () => ({ trial: null, reload: mockReloadTrial }) }));
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

// ONE stable state object, mutated between renders rather than replaced (see
// `profile.test.tsx`): a fresh literal per render re-fires the screen's effects forever.
const MOCHI = { id: 'p1', name: 'Mochi', species: 'cat', photo_path: 'a.jpg', weight_kg: 4.1 };
const LUNA = { id: 'p2', name: 'Luna', species: 'cat', photo_path: 'b.jpg', weight_kg: 3.4 };
const mockPetState: { activePet: typeof MOCHI; pets: (typeof MOCHI)[]; updatePet: jest.Mock } = {
  activePet: MOCHI,
  pets: [MOCHI, LUNA],
  updatePet: jest.fn(),
};
jest.mock('../../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { render, act } from '@testing-library/react-native';
import ProfileScreen from './profile';
import { EMPTY_VET_VISITS_HOME, type VetVisitsHome, type VisitListRow } from '../../lib/vetVisits';

function visit(id: string, petId: string): VisitListRow {
  return { id, petId, visitedAt: '2026-07-30', stamp: null, title: 'Recheck', where: '', tags: [] };
}
const MOCHI_HOME: VetVisitsHome = { ...EMPTY_VET_VISITS_HOME, visits: [visit('v1', 'p1'), visit('v2', 'p1')] };
const LUNA_HOME: VetVisitsHome = { ...EMPTY_VET_VISITS_HOME, visits: [visit('v3', 'p2')] };

/** One pending read per pet, resolved or rejected by the test, in any order. */
const pending = new Map<string, { resolve: (h: VetVisitsHome) => void; reject: (e: Error) => void }>();

beforeEach(() => {
  jest.clearAllMocks();
  pending.clear();
  mockPetState.activePet = MOCHI;
  mockReadVetVisitsHome.mockImplementation((petId: string) =>
    new Promise<VetVisitsHome>((resolve, reject) => { pending.set(petId, { resolve, reject }); }));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

async function answer(petId: string, home: VetVisitsHome) {
  const read = pending.get(petId);
  if (!read) throw new Error(`no pending vet-visits read for ${petId}`);
  await act(async () => { read.resolve(home); });
}

describe('the Pet tab holds the Vet visits card until its read answers (CUL-1097)', () => {
  it('renders no card while the read is in flight, then the card once it answers', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});

    expect(mockReadVetVisitsHome).toHaveBeenCalledWith('p1');
    // In flight: the empty model must not stand in for a record nobody has read yet.
    expect(view.queryByTestId('vet-visits-card')).toBeNull();

    await answer('p1', MOCHI_HOME);
    expect(view.getByTestId('vet-visits-card').props.children).toBe('Mochi · 2 visits');
  });

  it('renders no card when the read fails, never the empty "nothing booked" state', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    await act(async () => { pending.get('p1')?.reject(new Error('db closed')); });

    expect(view.queryByTestId('vet-visits-card')).toBeNull();
  });

  it('a pet switch hides the previous pet\'s card until the new pet\'s read answers', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    await answer('p1', MOCHI_HOME);
    expect(view.getByTestId('vet-visits-card').props.children).toBe('Mochi · 2 visits');

    mockPetState.activePet = LUNA;
    view.rerender(<ProfileScreen />);
    await act(async () => {});

    expect(mockReadVetVisitsHome).toHaveBeenLastCalledWith('p2');
    // Mochi's two visits under Luna's name is the CUL-574 class arriving by staleness.
    expect(view.queryByTestId('vet-visits-card')).toBeNull();

    await answer('p2', LUNA_HOME);
    expect(view.getByTestId('vet-visits-card').props.children).toBe('Luna · 1 visit');
  });

  it('a read for the previous pet that lands after the switch never renders under the new pet', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});

    // Switch while Mochi's read is still out, then let it land first.
    mockPetState.activePet = LUNA;
    view.rerender(<ProfileScreen />);
    await act(async () => {});
    await answer('p1', MOCHI_HOME);

    expect(view.queryByTestId('vet-visits-card')).toBeNull();
  });
});
