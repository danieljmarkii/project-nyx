// The Pet tab's pet-switcher (CUL-618, ruling R1 = (a) / R2 = shape a2).
//
// The tab bar shows this pet's face, and everywhere else in the app that face opens
// the switcher — here it landed on a screen that had none, so on History and Foods
// the only visible pet control answered the wrong question. These tests pin the two
// halves of the ruling (the name is the switcher at 2+ pets; the one-pet household
// gets a stated "Add a pet" instead of a silent tap) and the two house rules the
// shape depends on: the 44pt floor by construction, and one Modal at a time.
//
// Deliberately narrow. Everything this screen renders below the header card has its
// own tests; this file only asks what the identity block is and does.

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
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

// Supabase: every read this screen fires resolves empty. The sections are not under
// test here — only the identity block above them.
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

import { render, fireEvent } from '@testing-library/react-native';
import { Modal, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import ProfileScreen from './profile';

/** The nearest ancestor of `node` that is actually a touch responder. */
function owningTouchable(node: any) {
  let n = node?.parent;
  while (n) {
    if (n.props?.onStartShouldSetResponder || n.props?.accessibilityRole === 'button') return n;
    n = n.parent;
  }
  return null;
}

function setHousehold(pets: (typeof MOCHI)[], active = pets[0]) {
  mockPetState.pets = pets;
  mockPetState.activePet = active;
}

beforeEach(() => {
  jest.clearAllMocks();
  setHousehold([MOCHI]);
});

describe('the pet name as the switcher (multi-pet)', () => {
  it('is a button, and says that it switches rather than reading as a heading', () => {
    setHousehold([MOCHI, LUNA]);
    const { getByText } = render(<ProfileScreen />);

    const owner = owningTouchable(getByText('Mochi'));
    expect(owner).not.toBeNull();
    // The name alone reads as a title — which is exactly what made the tab-bar
    // avatar misleading. The label has to carry the verb.
    expect(owner.props.accessibilityLabel).toBe('Switch pet — Mochi active');
  });

  it('opens the switcher, and the sheet lists the other pet', () => {
    setHousehold([MOCHI, LUNA]);
    const { getByText, queryByText } = render(<ProfileScreen />);

    expect(queryByText('Your pets')).toBeNull();
    fireEvent.press(getByText('Mochi'));
    expect(getByText('Your pets')).toBeTruthy();
    expect(getByText('Luna')).toBeTruthy();
  });

  it('presents exactly ONE Modal with the switcher open (CUL-662)', () => {
    setHousehold([MOCHI, LUNA]);
    const { getByText, UNSAFE_getAllByType } = render(<ProfileScreen />);
    fireEvent.press(getByText('Mochi'));

    const visible = UNSAFE_getAllByType(Modal).filter((m) => m.props.visible !== false);
    expect(visible).toHaveLength(1);
  });

  it('does not repeat "Add a pet" on the screen — it lives in the sheet', () => {
    setHousehold([MOCHI, LUNA]);
    const { queryByText } = render(<ProfileScreen />);
    expect(queryByText('Add a pet')).toBeNull();
  });
});

describe('the one-pet household (ruling (i))', () => {
  it('does not make the name a silent tap target', () => {
    const { getByText } = render(<ProfileScreen />);
    // Identity, not a synthetic press: fireEvent.press can reach a handler by
    // DESCENDING from an enclosing composite, so pressing an inert label can fire a
    // sibling's button and pass over the very defect the test is for (CUL-579).
    expect(owningTouchable(getByText('Mochi'))).toBeNull();
  });

  it('states the action instead — the tab is a door to a second pet', () => {
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('Add a pet'));
    expect(router.push).toHaveBeenCalledWith('/add-pet');
  });
});

describe('the tap geometry, pinned rather than eyeballed (CUL-579 / CUL-612)', () => {
  it('reaches the 44pt floor by an explicit box, and takes no slop from its neighbour', () => {
    setHousehold([MOCHI, LUNA]);
    const { getByText } = render(<ProfileScreen />);
    const owner = owningTouchable(getByText('Mochi'));

    const style = StyleSheet.flatten(owner.props.style);
    // By construction, not by a rendered line box — jest cannot compute the latter,
    // and a floor resting on one is a floor nobody is holding.
    expect(style.minHeight).toBe(44);
    // "Change photo" sits directly above with hitSlop={8}. Any slop here would have
    // the two expanded rects overlap, and an overlap resolves by z-order rather than
    // by intent — on a neighbour that opens the camera roll.
    expect(owner.props.hitSlop).toBeUndefined();
  });
});

describe('the identity block is derived, never mirrored', () => {
  it('names the newly-selected pet after an in-place switch', () => {
    setHousehold([MOCHI, LUNA]);
    const { getByText, queryByText, rerender } = render(<ProfileScreen />);
    expect(getByText('Mochi')).toBeTruthy();

    // The switch happens on THIS screen — the tab never blurs — so any identity
    // value mirrored into state would survive it and render the previous pet's
    // material under the new pet's name (CUL-574, arriving through a switch).
    setHousehold([MOCHI, LUNA], LUNA);
    rerender(<ProfileScreen />);

    expect(getByText('Luna')).toBeTruthy();
    expect(queryByText('Mochi')).toBeNull();
  });
});
