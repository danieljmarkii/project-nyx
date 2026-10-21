// Mixed meals row 5 (CUL-2054; spec §7.1, §11) — the event detail's mixing surfaces: the
// after-the-fact "+ Mixed with another food" on a plain meal, and the MIXED BOWL section on
// a mix. Same harness as `comboInDoubt.test.tsx`; the bowl read is stubbed at its module.

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

const mockLoadMealBowls = jest.fn();
jest.mock('../../lib/mealBowls', () => ({
  ...jest.requireActual('../../lib/mealBowls'),
  loadMealBowls: (...a: unknown[]) => mockLoadMealBowls(...a),
}));

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

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import EventDetailScreen from './[id]';
import { bowlFromRows } from '../../lib/mealBowls';
import { mintGenerationId } from '../../lib/mealComposition';

const row = (over: object = {}) => ({
  id: 'evt-1', pet_id: 'pet-A', event_type: 'meal',
  occurred_at: new Date(2026, 9, 21, 7, 30).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null, weight_kg: null,
  created_at: '', updated_at: '', food_item_id: 'food-1', quantity: 'unknown', intake_rating: null,
  food_brand: 'Weruva', food_product_name: 'Rabbit Pâté', food_type: 'meal', food_format: 'wet',
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null, drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null, paired_dose_unrated_count: 0,
  look_outcome: null, look_words: null, look_note: null,
  ...over,
});

const BOWL = bowlFromRows(
  { food_item_id: null, component_count: 2 },
  [['Chicken Pâté', 0.25, 0.25], ['Rabbit Pâté', 0.5, 0.5]].map(([name, share, amount], i) => ({
    id: mintGenerationId(1_700_000_000_000, 3, () => (i + 1) / 10),
    position: i,
    food_item_id: `f${i}`,
    food_label: `Weruva ${name}`,
    share: share as number,
    share_source: 'amounts',
    amount_value: amount as number,
    amount_unit: 'can',
    updated_at: '',
    deleted_at: null,
    food: { brand: 'Weruva', productName: name as string, foodType: 'meal', format: 'wet', primaryProtein: null, proteins: [] },
  })),
)!;

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadMealBowls.mockResolvedValue(new Map());
});

it('a plain meal offers the after-the-fact mix, bound to this meal and its pet', async () => {
  mockGetEventById.mockResolvedValue(row());
  mockGetMealForEvent.mockResolvedValue({
    food_item_id: 'food-1', food_brand: 'Weruva', food_product_name: 'Rabbit Pâté', food_format: 'wet', food_type: 'meal', intake_rating: null,
  });
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText('+ Mixed with another food')).toBeTruthy());
  fireEvent.press(view.getByText('+ Mixed with another food'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/mix', params: { event: 'evt-1', pet: 'pet-A', from: 'detail' } });
  expect(mockLoadMealBowls).not.toHaveBeenCalled();
});

it('a treat offers no mix line (R1)', async () => {
  mockGetEventById.mockResolvedValue(row({ food_type: 'treat' }));
  mockGetMealForEvent.mockResolvedValue({
    food_item_id: 'food-1', food_brand: 'Greenies', food_product_name: 'Dental', food_format: 'treat', food_type: 'treat', intake_rating: null,
  });
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText('+ Add a med given with this')).toBeTruthy());
  expect(view.queryByText('+ Mixed with another food')).toBeNull();
});

it('a mix shows its foods as measured, and no mix line', async () => {
  mockGetEventById.mockResolvedValue(row({ food_item_id: null, food_brand: null, food_product_name: null }));
  mockGetMealForEvent.mockResolvedValue({
    food_item_id: null, food_brand: null, food_product_name: null, food_format: null, food_type: null, intake_rating: 'some',
  });
  mockLoadMealBowls.mockResolvedValue(new Map([['evt-1', BOWL]]));
  const view = render(<EventDetailScreen />);
  await waitFor(() => expect(view.getByText('MIXED BOWL')).toBeTruthy());
  view.getByText('¼ can Chicken Pâté, ½ can Rabbit Pâté (about ⅓ and ⅔)');
  expect(view.queryByText('+ Mixed with another food')).toBeNull();
  // The bowl is a meal: the retroactive med line still offers itself.
  view.getByText('+ Add a med given with this');
});
