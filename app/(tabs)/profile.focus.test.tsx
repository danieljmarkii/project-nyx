// The Pet tab as a DESTINATION — CUL-170.
//
// The Home strips and the Daily Recap's mirrors of them are doors: "Amoxicillin ·
// day 5 of 14" is meant to open that med. All of them pushed the bare
// `/(tabs)/profile`, so the tap arrived at the top of this screen — photo,
// conditions, trial card, every other med — and the owner scrolled to find the
// thing they had just tapped.
//
// `lib/profileFocus.test.ts` owns every answer this screen computes (which row a
// key resolves to, how the two coordinate spaces compose). What is only assertable
// HERE is the wiring: that the anchors are attached to the right nodes, that the
// scroll waits for the content it is measuring, and that a request is consumed
// exactly once. Deliberately separate from `profile.test.tsx`, which is narrow by
// its own stated design and mocks the sections away.

const mockParams: { focus?: string; med?: string; ts?: string } = {};

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockParams,
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

// Table-aware, unlike `profile.test.tsx`'s single empty chain: this suite needs
// real regimen rows, because row-level targeting is the whole point of the fix.
const mockTables: Record<string, unknown[]> = {};
jest.mock('../../lib/supabase', () => {
  const make = (table: string) => {
    const result = Promise.resolve({ data: mockTables[table] ?? [], error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'neq']) {
      chain[m] = jest.fn(() => chain);
    }
    Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
    return chain;
  };
  return {
    supabase: {
      from: jest.fn((table: string) => make(table)),
      auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    },
  };
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
jest.mock('../../components/profile/TrialCompletionSheet', () => ({ TrialCompletionSheet: () => null }));
jest.mock('../../components/profile/PastMedicationsSection', () => ({ PastMedicationsSection: () => null }));

// A stub that FORWARDS the anchor, so this file asserts the screen's wiring while
// `DietTrialCard.test.tsx` asserts that the real card lands it on its own Card.
jest.mock('../../components/profile/DietTrialCard', () => {
  const { View } = require('react-native');
  return {
    DietTrialCard: ({ onLayout }: { onLayout?: (e: unknown) => void }) => (
      <View testID="trial-anchor" onLayout={onLayout} />
    ),
  };
});
jest.mock('../../lib/dietTrialCard', () => ({ resolveTrialCard: () => ({ kicker: 'Diet trial' }) }));

let mockTrialLoading = false;
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: { trial: null }, isLoading: mockTrialLoading, reload: jest.fn() }),
}));
jest.mock('../../hooks/useTrialAllowedSet', () => ({ useTrialAllowedSet: () => ({ status: 'unknown' }) }));
jest.mock('../../hooks/useWidgetSlotLabel', () => ({ useWidgetSlotLabel: () => null }));

let mockReducedMotion = false;
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock('../../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
jest.mock('../../lib/vetDocumentLibrary', () => ({
  readVetLibrary: jest.fn(() => Promise.resolve([])),
  buildVetFilesCardModel: () => ({}),
  VET_DOCUMENT_SIGNED_URL_TTL_SEC: 60,
}));
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
const MOCHI = { id: 'p1', name: 'Mochi', species: 'cat', photo_path: 'a.jpg', weight_kg: 4.1 };
const mockPetState = { activePet: MOCHI, pets: [MOCHI], updatePet: jest.fn() };
jest.mock('../../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import ProfileScreen from './profile';
import { PROFILE_FOCUS_INSET } from '../../lib/profileFocus';

const AMOX = {
  id: 'reg-amox', pet_id: 'p1', medication_item_id: 'item-amox', drug_name: 'Amoxicillin',
  dose_amount: '250 mg', route: 'oral', doses_per_day: 2, schedule_notes: null,
  indication: null, prescribed_by: null, started_at: '2026-07-27',
  target_duration_days: 14, target_duration_doses: null, status: 'active', ended_at: null,
};
const PRED = { ...AMOX, id: 'reg-pred', medication_item_id: 'item-pred', drug_name: 'Prednisone', started_at: '2026-07-01' };
const FREE = { ...AMOX, id: 'reg-free', medication_item_id: null, drug_name: 'Compounded thing', started_at: '2026-06-01' };

function setParams(next: { focus?: string; med?: string; ts?: string }) {
  for (const k of Object.keys(mockParams)) delete (mockParams as Record<string, unknown>)[k];
  Object.assign(mockParams, next);
}

/** Drive the layout pass the device would: the card first, then its rows — the
 *  order RN does NOT guarantee, which is exactly why the screen stores a row's
 *  offset relative to its card instead of summing it in the callback. */
function layout(node: unknown, y: number) {
  fireEvent(node as never, 'layout', { nativeEvent: { layout: { x: 0, y, width: 320, height: 80 } } });
}

async function mount() {
  const scrollTo = jest.fn();
  const tree = render(<ProfileScreen />);
  // Let the loaders resolve. The medications card always renders (it is the only
  // way to add a regimen), so it is the honest "the screen has settled" signal —
  // the trial card is gated on its own loader, which one test below holds open.
  await waitFor(() => expect(tree.queryByTestId('med-section')).not.toBeNull());
  await act(async () => {});
  const scroll = tree.UNSAFE_getByType(ScrollView);
  scroll.instance.scrollTo = scrollTo;
  return { ...tree, scrollTo };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTrialLoading = false;
  mockReducedMotion = false;
  mockTables.medications = [];
  mockTables.medication_administrations = [];
  mockTables.conditions = [];
  setParams({});
});

describe('no doorway params', () => {
  it('does not scroll — an ordinary tab visit is left exactly where it was', async () => {
    mockTables.medications = [AMOX];
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('ignores a focus it has no anchor for, rather than scrolling somewhere', async () => {
    setParams({ focus: 'conditions', ts: '1' });
    mockTables.medications = [AMOX];
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('the trial doorway', () => {
  it('lands on the trial card', async () => {
    setParams({ focus: 'trial', ts: '1' });
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).toHaveBeenCalledWith({ y: 900 - PROFILE_FOCUS_INSET, animated: true });
  });

  it('fires once, then leaves the owner alone', async () => {
    // A later re-layout — a section above finishing, a hydration tick — must never
    // yank the screen back to a doorway the owner has already arrived at and
    // scrolled away from.
    setParams({ focus: 'trial', ts: '1' });
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    act(() => layout(getByTestId('trial-anchor'), 950));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('honours reduced motion', async () => {
    mockReducedMotion = true;
    setParams({ focus: 'trial', ts: '1' });
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).toHaveBeenCalledWith({ y: 900 - PROFILE_FOCUS_INSET, animated: false });
  });
});

describe('the medication doorway', () => {
  it('lands on the tapped med’s own row, not the top of the section', async () => {
    // Three courses, the LAST one tapped: the failure this pins is arriving at the
    // section and scrolling — the defect, moved one card down instead of fixed.
    mockTables.medications = [AMOX, PRED, FREE];
    setParams({ focus: 'medications', med: 'regimen:reg-free', ts: '1' });
    const { scrollTo, getByTestId } = await mount();

    act(() => layout(getByTestId('med-row-reg-amox'), 40));
    act(() => layout(getByTestId('med-row-reg-pred'), 300));
    act(() => layout(getByTestId('med-row-reg-free'), 560));
    expect(scrollTo).not.toHaveBeenCalled(); // the section has not laid out yet

    act(() => layout(getByTestId('med-section'), 600));
    // 600 (section, in scroll content) + 560 (row, inside the card) — the two
    // coordinate spaces composed, in the order RN does not guarantee.
    expect(scrollTo).toHaveBeenCalledWith({ y: 1160 - PROFILE_FOCUS_INSET, animated: true });
  });

  it('keeps the section header for a FIRST row, which needs no scroll past it', async () => {
    mockTables.medications = [AMOX, PRED];
    setParams({ focus: 'medications', med: 'item-amox', ts: '1' });
    const { scrollTo, getByTestId } = await mount();

    act(() => layout(getByTestId('med-section'), 600));
    act(() => layout(getByTestId('med-row-reg-amox'), 40));
    expect(scrollTo).toHaveBeenCalledWith({ y: 600 - PROFILE_FOCUS_INSET, animated: true });
  });

  it('falls back to the section for an ad-hoc course with no row to land on', async () => {
    mockTables.medications = [AMOX];
    setParams({ focus: 'medications', med: 'item-gabapentin', ts: '1' });
    const { scrollTo, getByTestId } = await mount();

    act(() => layout(getByTestId('med-section'), 600));
    act(() => layout(getByTestId('med-row-reg-amox'), 40));
    expect(scrollTo).toHaveBeenCalledWith({ y: 600 - PROFILE_FOCUS_INSET, animated: true });
  });

  it('waits for a row that exists but has not laid out, instead of taking the section', async () => {
    // Without this the fix quietly degrades to section-level on every cold arrival
    // — the original defect, reintroduced by a race rather than by the route.
    mockTables.medications = [AMOX, PRED];
    setParams({ focus: 'medications', med: 'item-pred', ts: '1' });
    const { scrollTo, getByTestId } = await mount();

    act(() => layout(getByTestId('med-section'), 600));
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => layout(getByTestId('med-row-reg-pred'), 300));
    expect(scrollTo).toHaveBeenCalledWith({ y: 900 - PROFILE_FOCUS_INSET, animated: true });
  });
});

describe('the nonce', () => {
  it('re-fires on a second tap of the same strip, on an already-mounted tab', async () => {
    // The tab persists across switches, so a repeat tap re-pushes identical params.
    // Without the nonce the door would work exactly once per session.
    setParams({ focus: 'trial', ts: '1' });
    const { scrollTo, getByTestId, rerender } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    setParams({ focus: 'trial', ts: '2' });
    rerender(<ProfileScreen />);
    // No new layout pass — the tab was already mounted and measured.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2));
  });

  it('still lands a link that carries no nonce at all', async () => {
    // `profileFocusHref` always stamps one, so this is the hand-written/legacy link.
    // The "already applied" marker starts as `undefined` for exactly this case:
    // seeded to `null` it would compare equal to a missing nonce on the very first
    // arrival and the link would silently do nothing.
    setParams({ focus: 'trial' });
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('treats the nonce as the tap’s identity — a param change alone is not a new tap', async () => {
    // Written after the mutation pass caught the first version of this test passing
    // over a deleted guard: re-rendering does not re-run the params effect at all,
    // so it was pinning the dependency array rather than the "already applied"
    // marker. Changing a param the effect DOES watch is what reaches the marker.
    setParams({ focus: 'trial', ts: '1' });
    const { scrollTo, getByTestId, rerender } = await mount();
    act(() => layout(getByTestId('trial-anchor'), 900));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    setParams({ focus: 'trial', med: 'item-amox', ts: '1' });
    rerender(<ProfileScreen />);
    await act(async () => {});
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  // A "does not re-fire on a plain re-render" case sat here and was deleted: the
  // mutation pass showed it green against BOTH a deleted nonce guard and a deleted
  // dependency array, so it was strictly weaker than the case above and could only
  // ever have read as coverage it did not provide.
});

describe('a read that has not answered', () => {
  it('does not scroll to a position the screen is about to move', async () => {
    // Every section above an anchor loads asynchronously (CUL-575's shape, applied
    // to layout rather than to copy): a y measured mid-load is one this screen is
    // about to invalidate, so the arrival would land near where the card used to be.
    setParams({ focus: 'medications', med: 'item-amox', ts: '1' });
    mockTables.medications = [AMOX];
    mockTrialLoading = true; // the trial card is still reading — everything shifts when it lands
    const { scrollTo, getByTestId } = await mount();
    act(() => layout(getByTestId('med-section'), 600));
    act(() => layout(getByTestId('med-row-reg-amox'), 40));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
