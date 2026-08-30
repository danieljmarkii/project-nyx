// CUL-223 — the WEIGHT section on the event detail screen.
//
// This section is the DESTINATION of the whole tap-through: the cards' "N readings"
// now opens a list, and each row opens here. Before this, `/event/[id]` rendered a
// weight check with no weight on it — getEventById has always selected weight_kg (the
// History row renders it) and this screen simply never did. So an owner who tapped
// through to check or correct a fat-fingered reading landed on a screen showing the
// type, the date and the time, and not the number.
//
// The screen itself is a 1100-line surface over the image picker, the filesystem,
// storage, sync and two analysis pipelines, with no existing test file. Rather than
// stand all of that up for a three-line conditional, the mocks below are the whole
// module graph — which is what makes this test about the section and not about the
// screen.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: jest.fn(), compressForUpload: jest.fn(),
  persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../../lib/attachments', () => ({ detachEventAttachment: jest.fn(), detachOtherEventAttachments: jest.fn() }));
jest.mock('../../lib/sync', () => ({ syncPendingMeals: jest.fn(), syncPendingMedicationAdministrations: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/analysis', () => ({ triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn() }));
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
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
  updateMealIntake: jest.fn(), updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
}));
// Both are called WITHOUT a selector here (the screen destructures whole state), so
// these return the state object rather than applying one.
jest.mock('../../store/eventStore', () => {
  const state = { removeFromToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
jest.mock('../../store/petStore', () => {
  const state = { pets: [{ id: 'pet-A', name: 'Nyx' }], activePet: { id: 'pet-A', name: 'Nyx' } };
  return {
    usePetStore: Object.assign(() => state, { getState: () => state }),
    resolveRecordPetName: () => 'Nyx',
  };
});

import { render, waitFor } from '@testing-library/react-native';
import EventDetailScreen from './[id]';

const baseRow = {
  id: 'evt-1', pet_id: 'pet-A', occurred_at: new Date(2026, 5, 12, 15, 14).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null,
  created_at: '', updated_at: '', food_item_id: null, quantity: null, intake_rating: null,
  food_brand: null, food_product_name: null, food_type: null, food_format: null,
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null,
  drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null,
};

beforeEach(() => jest.clearAllMocks());

it('shows the measured weight on a weight check', async () => {
  mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'weight_check', weight_kg: 5.6 });
  const { getByText } = render(<EventDetailScreen />);
  // 5.6 kg through the one shared 0.1 lb rounding rule — the same number the card, the
  // History row and the edit pre-fill print for this reading.
  await waitFor(() => expect(getByText('12.3 lbs')).toBeTruthy());
});

it('shows NOTHING beside it — no delta, arrow, or comparison', async () => {
  // A weight trend never reassures, and a per-reading verdict is a different feature
  // with a mandatory adversarial pass (migration 024's guardrail).
  mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'weight_check', weight_kg: 5.6 });
  const { queryByText } = render(<EventDetailScreen />);
  await waitFor(() => expect(queryByText('12.3 lbs')).toBeTruthy());
  expect(queryByText(/up |down |steady|stable|improv|since/i)).toBeNull();
});

it('renders no weight on an event that is not a weight check', async () => {
  mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'vomit', weight_kg: null });
  const { queryByText, findAllByText } = render(<EventDetailScreen />);
  // The date renders in more than one place on this screen — wait on the row landing,
  // then assert the absence.
  expect((await findAllByText(/Jun/)).length).toBeGreaterThan(0);
  expect(queryByText(/lbs/)).toBeNull();
});

it('renders no weight when the child row has not hydrated', async () => {
  // A weight check whose weight_checks child has not arrived yet is an UNKNOWN value,
  // not a zero — printing "0 lbs" over it would be a fabricated reading.
  mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'weight_check', weight_kg: null });
  const { queryByText, findAllByText } = render(<EventDetailScreen />);
  // The date renders in more than one place on this screen — wait on the row landing,
  // then assert the absence.
  expect((await findAllByText(/Jun/)).length).toBeGreaterThan(0);
  expect(queryByText(/lbs/)).toBeNull();
});
