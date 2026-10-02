// CUL-382 — the meal's side of an unconfirmed combo dose.
//
// A pill hidden in food is two linked records, and the dose's own screen already says when
// it may not have gone down. Before this the meal's screen showed only a plain link to the
// dose, so an owner reviewing the meal could not tell. Same harness as
// `intakeRegen.test.tsx`; `lib/medications` is REAL, so the tag is decided by the shared
// predicate, not by this test.

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
const mockGetMealForEvent = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: (...a: unknown[]) => mockGetMealForEvent(...a),
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
import EventDetailScreen from './[id]';

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
  paired_dose_count: 1, paired_dose_event_id: 'dose-1', paired_dose_drug_name: 'Gabapentin',
  paired_dose_unrated_count: 1,
  look_outcome: null, look_words: null, look_note: null,
};

function meal(intake: string | null) {
  return {
    food_brand: 'Fancy Feast', food_product_name: 'Pate', food_format: 'wet', food_type: 'meal',
    intake_rating: intake,
  };
}

async function open(row: object, intake: string | null) {
  mockGetEventById.mockResolvedValue(row);
  mockGetMealForEvent.mockResolvedValue(meal(intake));
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText('Given with a Gabapentin dose')).toBeTruthy());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateMealIntake.mockResolvedValue(undefined);
});

describe('the meal → dose link says when the dose is unconfirmed (CUL-382)', () => {
  it('tags the link, and says so to a screen reader, when the meal was refused and the dose is unanswered', async () => {
    const view = await open(mealRow, 'refused');
    expect(view.getByText('Unconfirmed')).toBeTruthy();
    expect(view.getByLabelText('Given with a Gabapentin dose, Unconfirmed')).toBeTruthy();
  });

  it('leaves the link plain when the meal was finished', async () => {
    const view = await open(mealRow, 'all');
    expect(view.queryByText('Unconfirmed')).toBeNull();
    expect(view.getByLabelText('Given with a Gabapentin dose')).toBeTruthy();
  });

  it('leaves the link plain when every paired dose has an answer', async () => {
    const view = await open({ ...mealRow, paired_dose_unrated_count: 0 }, 'refused');
    expect(view.queryByText('Unconfirmed')).toBeNull();
  });

  it('follows the meal\'s intake as the owner changes it on this screen', async () => {
    const view = await open(mealRow, 'refused');
    expect(view.getByText('Unconfirmed')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByText('All')); });
    expect(view.queryByText('Unconfirmed')).toBeNull();
    await act(async () => { fireEvent.press(view.getByText('Picked')); });
    expect(view.getByText('Unconfirmed')).toBeTruthy();
  });
});
