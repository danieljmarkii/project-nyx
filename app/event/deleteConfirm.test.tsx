// CUL-825 — the record screen's Remove confirm, and whether it names the photo.
//
// Same harness shape as `incidentScreen.test.tsx` / `weightSection.test.tsx`: the screen
// is a 1100-line surface over the picker, the filesystem, storage, sync and two analysis
// pipelines, so the module graph is mocked whole and the test is about one dialog.
//
// What this suite owns is a COMPREHENSION contract, not a mechanical one. CUL-645's rule
// is that a destructive action carries exactly one safety net, and for a photo-bearing
// record the net is the confirm SAYING the photo goes too — a fact the owner has no other
// way to know, since the photo is of the thing itself and cannot be retaken. So the
// assertions read the dialog's BODY text, which is the entire deliverable; asserting only
// that a dialog appeared would pass over the defect unchanged.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class { exists = true; constructor(_u: string) {} } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue(null), compressForUpload: jest.fn(),
  persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
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
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'evt-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
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
// The RECORD's pet is Biscuit; the ACTIVE pet is Rex. Every name this screen prints must
// come from the first (C-9) — on a multi-pet account the tap-through from a cross-pet
// surface lands here on a pet who is not the active one.
const mockResolveRecordPetName = jest.fn();
jest.mock('../../store/petStore', () => {
  const state = {
    pets: [{ id: 'pet-A', name: 'Biscuit' }, { id: 'pet-B', name: 'Rex' }],
    activePet: { id: 'pet-B', name: 'Rex' },
  };
  return {
    usePetStore: Object.assign(() => state, { getState: () => state }),
    resolveRecordPetName: (...a: unknown[]) => mockResolveRecordPetName(...a),
  };
});

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

const withPhoto = { id: 'att-1', local_uri: 'file:///tmp/incident.jpg', storage_path: 'pet-A/evt-1.jpg' };

/** The body (second argument) of the most recent Alert.alert. */
function alertBody(): string {
  const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as string;
}

async function pressRemove() {
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText('Remove')).toBeTruthy());
  fireEvent.press(view.getByText('Remove'));
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockResolveRecordPetName.mockReturnValue('Biscuit');
  mockGetEventById.mockResolvedValue(baseRow);
});

afterEach(() => { (Alert.alert as unknown as jest.Mock).mockRestore?.(); });

describe('the Remove confirm names the photo (CUL-825, CUL-645 parity)', () => {
  it('says the photo goes too when the record carries one', async () => {
    mockGetEventAttachment.mockResolvedValue(withPhoto);
    await pressRemove();
    expect(alertBody()).toContain('The photo you attached will be removed with it.');
  });

  it('still names what is being removed', async () => {
    mockGetEventAttachment.mockResolvedValue(withPhoto);
    await pressRemove();
    // The photo sentence is ADDED to the existing one, never a replacement for it:
    // the owner needs both what goes and that the photo goes with it.
    expect(alertBody()).toContain('will remove the Vomit from history');
  });

  // The other direction, and the one a copy change is most likely to break: never
  // warn about a photo that is not there. A confirm that mentions a photo on a
  // photoless record is its own defect — it describes a loss that will not happen.
  it('stays silent about a photo on a record with none', async () => {
    mockGetEventAttachment.mockResolvedValue(null);
    await pressRemove();
    expect(alertBody()).toBe('This will remove the Vomit from history.');
    expect(alertBody()).not.toContain('photo');
  });
});
