// CUL-302 — the record screen's hero across a REFOCUS of the same event.
//
// Same mocked-module-graph harness as `deleteConfirm.test.tsx` / `incidentScreen.test.tsx`:
// the screen is a ~1100-line surface over the picker, the filesystem, storage, sync and two
// analysis pipelines, so the graph is stubbed whole and this suite is about one thing —
// whether a remote-only photo survives the screen regaining focus.
//
// The discriminating case needs a photo with NO usable local file (the local path is the
// hero's first choice, and it never goes away, so a photo backed by one would hide the
// defect entirely) and a `getSignedUrl` held PENDING on the second load. That pairing is
// the whole test: pre-fix, `loadAll`'s up-front reset nulled both signed URLs on every
// focus, so the beat between the reset and the round-trip rendered no hero at all.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
// No local file on this device — this is what makes the photo remote-only.
jest.mock('expo-file-system', () => ({ File: class { exists = false; constructor(_u: string) {} } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockGetSignedUrl = jest.fn();
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a),
  compressForUpload: jest.fn(), persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../../lib/attachments', () => ({ detachEventAttachment: jest.fn(), detachOtherEventAttachments: jest.fn() }));
jest.mock('../../lib/sync', () => ({ syncPendingMeals: jest.fn(), syncPendingMedicationAdministrations: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: jest.fn(() => ({ settle: jest.fn() })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn() }));
jest.mock('../../components/event/VomitAnalysisSection', () => ({ VomitAnalysisSection: () => null }));
jest.mock('../../components/event/StoolAnalysisSection', () => ({ StoolAnalysisSection: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

// The focus callback is captured so the test can re-fire it. A refocus is exactly that:
// the same mounted screen running its focus effect again, with no remount and no id change.
let refocus: () => void = () => {};
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'evt-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      refocus = cb as () => void;
      react.useEffect(() => { cb(); }, [cb]);
    },
  };
});

const mockGetEventById = jest.fn();
const mockGetEventAttachment = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: (...a: unknown[]) => mockGetEventAttachment(...a),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
  updateMealIntake: jest.fn(), updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
}));
jest.mock('../../store/eventStore', () => {
  const state = { removeFromToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
jest.mock('../../store/petStore', () => {
  const state = {
    pets: [{ id: 'pet-A', name: 'Biscuit' }, { id: 'pet-B', name: 'Rex' }],
    activePet: { id: 'pet-B', name: 'Rex' },
  };
  return {
    usePetStore: Object.assign(() => state, { getState: () => state }),
    resolveRecordPetName: () => 'Biscuit',
  };
});

import { render, waitFor, act } from '@testing-library/react-native';
import EventDetailScreen from './[id]';

const baseRow = {
  id: 'evt-1', pet_id: 'pet-A', event_type: 'vomit',
  occurred_at: new Date(2026, 8, 5, 2, 14).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null, weight_kg: null,
  created_at: '', updated_at: '', food_item_id: null, quantity: null, intake_rating: null,
  food_brand: null, food_product_name: null, food_type: null, food_format: null,
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null,
  drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null,
};

// local_uri is set but `File.exists` is false above, so the screen blanks it as a stale
// path and routes to the signed URL — the "remote-only" state, reached the way the app
// actually reaches it (a cache eviction), not by faking an empty column.
const remoteOnlyPhoto = { id: 'att-1', local_uri: 'file:///evicted/incident.jpg', storage_path: 'pet-A/evt-1.jpg' };

/** The uri the hero is currently rendering, or null if there is no hero at all. */
function heroUri(view: ReturnType<typeof render>): string | null {
  const hero = view.queryByTestId('event-hero-photo');
  if (!hero) return null;
  const image = hero.findAllByType(require('react-native').Image as never)
    .find((n: { props: { source?: { uri?: string } } }) => n.props.source?.uri != null);
  return (image?.props.source?.uri as string) ?? null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEventById.mockResolvedValue(baseRow);
  mockGetEventAttachment.mockResolvedValue(remoteOnlyPhoto);
});

describe('event detail — a remote-only photo survives a refocus of the same event', () => {
  it('keeps the hero up while the re-signed URL is still in flight', async () => {
    mockGetSignedUrl.mockResolvedValue('https://signed/transform.jpg');
    const view = render(<EventDetailScreen />);
    await waitFor(() => expect(heroUri(view)).toBe('https://signed/transform.jpg'));

    // Re-sign is held open. This is the beat the owner sees coming back from Edit,
    // and holding it is what makes the assertion deterministic rather than a race.
    mockGetSignedUrl.mockImplementation(() => new Promise(() => {}));
    await act(async () => { refocus(); });

    // Pre-fix: null. The photo is of the thing the owner logged — a vomit they may be
    // about to show a vet — and it blinked out for the width of two round-trips.
    expect(heroUri(view)).toBe('https://signed/transform.jpg');
  });

  it('still clears the previous event’s URL when the id actually changes', async () => {
    // The regression guard, and the reason the reset is gated rather than deleted: the
    // whole point of the up-front reset is that event A's material must never render
    // under event B. Remounting is how this screen sees a different event, and the ref
    // starts null on a fresh mount, so the reset must fire.
    mockGetSignedUrl.mockResolvedValue('https://signed/A.jpg');
    const first = render(<EventDetailScreen />);
    await waitFor(() => expect(heroUri(first)).toBe('https://signed/A.jpg'));
    first.unmount();

    mockGetSignedUrl.mockImplementation(() => new Promise(() => {}));
    const second = render(<EventDetailScreen />);
    await act(async () => {});
    // No hero at all, rather than A's photo under B's record.
    expect(heroUri(second)).toBeNull();
  });
});
