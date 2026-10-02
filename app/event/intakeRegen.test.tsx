// CUL-1087 — rating a meal from its own screen refreshes the Signal.
//
// Same harness shape as `deleteConfirm.test.tsx`: the screen's module graph is mocked
// whole and this suite is about one chip row. `lib/meals` is REAL, so the path under
// test is the screen's own call through the shared write, down to the refresh edge.
// Before the fix the screen wrote the rating itself and nothing asked the Signal to
// rebuild, so a rating that turned breakfast into a decline stayed off Home.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class { exists = true; constructor(_u: string) {} } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue(null), compressForUpload: jest.fn(),
  persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../../lib/attachments', () => ({ detachEventAttachment: jest.fn(), detachOtherEventAttachments: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
  syncPendingMedicationAdministrations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: jest.fn(() => ({ settle: jest.fn() })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn() }));
jest.mock('../../lib/signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
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
const mockUpdateMealIntake = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
  // The record's pet: Biscuit, while the ACTIVE pet is Rex (C-9).
  getEventPetId: jest.fn().mockResolvedValue('pet-A'),
  updateMealIntake: (...a: unknown[]) => mockUpdateMealIntake(...a),
  updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
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

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import EventDetailScreen from './[id]';
import { triggerSignalRegenDebounced } from '../../lib/signal';

const mealRow = {
  id: 'evt-1', pet_id: 'pet-A', event_type: 'meal',
  occurred_at: new Date(2026, 8, 22, 7, 30).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null, weight_kg: null,
  created_at: '', updated_at: '', food_item_id: 'food-1', quantity: 'unknown', intake_rating: null,
  food_brand: 'Fancy Feast', food_product_name: 'Pate', food_type: 'meal', food_format: 'wet',
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null,
  drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null,
  look_outcome: null, look_words: null, look_note: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockGetEventById.mockResolvedValue(mealRow);
  mockUpdateMealIntake.mockResolvedValue(undefined);
});

afterEach(() => { (Alert.alert as unknown as jest.Mock).mockRestore?.(); });

async function tapIntake(label: string) {
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText(label)).toBeTruthy());
  await act(async () => { fireEvent.press(view.getByText(label)); });
  return view;
}

describe('rating a meal from its own screen (CUL-1087)', () => {
  it('asks the Signal to rebuild for the RECORD\'s pet, not the active one', async () => {
    await tapIntake('Picked');
    expect(mockUpdateMealIntake).toHaveBeenCalledWith('evt-1', 'picked');
    await waitFor(() => expect(triggerSignalRegenDebounced).toHaveBeenCalledWith('pet-A'));
    expect(triggerSignalRegenDebounced).not.toHaveBeenCalledWith('pet-B');
  });

  it('a failed write says so and refreshes nothing', async () => {
    mockUpdateMealIntake.mockRejectedValueOnce(new Error('No meal row for event evt-1'));
    await tapIntake('Picked');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Try again in a moment.');
    expect(triggerSignalRegenDebounced).not.toHaveBeenCalled();
  });
});
