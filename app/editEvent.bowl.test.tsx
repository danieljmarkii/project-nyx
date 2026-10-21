// Mixed meals row 5 (CUL-2054; spec §7.1, D-M4) — a mixed bowl on the edit screen: each
// food has Change and Take out, both staged until Save, and Save writes the whole bowl once
// through `setMealComponents`. A bowl it cannot rewrite safely (a food gone from the
// library, or a read that failed) is shown and kept: no food write of any kind.
//
// Harness: `editEvent.intake.test.tsx`'s, with the bowl read and its writer stubbed.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' } }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: jest.fn() }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(), compressForUpload: jest.fn(), persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../lib/attachments', () => ({ detachOtherEventAttachments: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
  syncPendingWeightChecks: jest.fn().mockResolvedValue(undefined),
  syncPendingMedicationAdministrations: jest.fn().mockResolvedValue(undefined),
  syncPendingLooks: jest.fn().mockResolvedValue(undefined),
}));

const mockGetMealForEvent = jest.fn();
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue({ pet_id: 'pet-cat' });
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllAsync: (...a: unknown[]) => mockGetAllAsync(...a),
    getFirstAsync: (...a: unknown[]) => mockGetFirstAsync(...a),
    runAsync: jest.fn(),
  }),
  updateEvent: jest.fn().mockResolvedValue(undefined),
  updateMealFood: jest.fn().mockResolvedValue(undefined),
  getMealForEvent: (...a: unknown[]) => mockGetMealForEvent(...a),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getEventTimeFields: jest.fn().mockResolvedValue({ confidence: 'witnessed', earliest: null, latest: null }),
}));
jest.mock('../lib/weight', () => ({
  getWeightKgForEvent: jest.fn().mockResolvedValue(null), updateWeightCheck: jest.fn(),
  parseWeightLbsToKg: jest.fn(), kgToLbs: jest.fn(), MAX_WEIGHT_LBS: 300,
}));
jest.mock('../lib/looks', () => ({
  localDayForLook: jest.fn(), getLookForEvent: jest.fn(), updateLookForEdit: jest.fn(),
}));
const mockRateMealIntake = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/meals', () => ({
  rateMealIntake: (...a: unknown[]) => mockRateMealIntake(...a),
}));

const mockLoadMealBowls = jest.fn();
jest.mock('../lib/mealBowls', () => ({
  ...jest.requireActual('../lib/mealBowls'),
  loadMealBowls: (...a: unknown[]) => mockLoadMealBowls(...a),
}));
const mockSetMealComponents = jest.fn().mockResolvedValue({ food_item_id: null, component_count: 2 });
jest.mock('../lib/mealComponents', () => ({
  setMealComponents: (...a: unknown[]) => mockSetMealComponents(...a),
}));

const mockTriggerRegen = jest.fn();
jest.mock('../lib/signal', () => ({ triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerRegen(...a) }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'evt-1', type: 'meal', occurredAt: '2026-09-22T07:30:00.000Z', notes: '' }),
}));
jest.mock('../store/eventStore', () => {
  const state = { patchInToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
jest.mock('../store/petStore', () => {
  const pets = [{ id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' }];
  const state = { pets, activePet: pets[0], updatePet: jest.fn() };
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import EditEventModal from './edit-event';
import { updateMealFood } from '../lib/db';
import { bowlFromRows } from '../lib/mealBowls';
import { mintGenerationId } from '../lib/mealComposition';

function bowlOf(parts: [string | null, string, number][]) {
  return bowlFromRows(
    { food_item_id: null, component_count: parts.length },
    parts.map(([id, name, share], i) => ({
      id: mintGenerationId(1_700_000_000_000, 9, () => (i + 1) / 10),
      position: i,
      food_item_id: id,
      food_label: `Weruva ${name}`,
      share,
      share_source: 'preset',
      amount_value: null,
      amount_unit: null,
      updated_at: '',
      deleted_at: null,
      food: id ? { brand: 'Weruva', productName: name, foodType: 'meal', format: 'wet', primaryProtein: null, proteins: [] } : null,
    })),
  )!;
}
const MIX = bowlOf([['chicken', 'Chicken Pâté', 0.333], ['rabbit', 'Rabbit Pâté', 0.667]]);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFirstAsync.mockResolvedValue({ pet_id: 'pet-cat' });
  mockGetAllAsync.mockResolvedValue([{ id: 'duck', brand: 'Weruva', product_name: 'Duck Stew', format: 'wet' }]);
  mockGetMealForEvent.mockResolvedValue({
    food_item_id: null, food_brand: null, food_product_name: null, food_format: null, intake_rating: null,
  });
  mockLoadMealBowls.mockResolvedValue(new Map([['evt-1', MIX]]));
});

async function open() {
  const utils = render(<EditEventModal />);
  await waitFor(() => expect(mockLoadMealBowls).toHaveBeenCalledWith(['evt-1']));
  await act(async () => {});
  return utils;
}

it('lists each food with Change and Take out, and an untouched save writes no food', async () => {
  const view = await open();
  view.getByText('Foods in this bowl');
  view.getByText('Take Chicken Pâté out of this bowl');
  view.getByText('Take Rabbit Pâté out of this bowl');
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  expect(mockSetMealComponents).not.toHaveBeenCalled();
  expect(updateMealFood).not.toHaveBeenCalled();
});

it('Take out is staged until Save, then writes the bowl as a plain meal of the food left', async () => {
  const view = await open();
  await act(async () => { fireEvent.press(view.getByText('Take Rabbit Pâté out of this bowl')); });
  await waitFor(() => expect(view.queryByText('Take Chicken Pâté out of this bowl')).toBeNull());
  expect(mockSetMealComponents).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  expect(mockSetMealComponents).toHaveBeenCalledWith('evt-1', [
    expect.objectContaining({ foodItemId: 'chicken', foodLabel: 'Weruva Chicken Pâté', share: 0.333 }),
  ]);
  expect(updateMealFood).not.toHaveBeenCalled();
  expect(mockTriggerRegen).toHaveBeenCalled();
});

it('Change swaps one food for a meal food not in the bowl, keeping its share', async () => {
  const view = await open();
  await act(async () => { fireEvent.press(view.getByLabelText('Change Rabbit Pâté')); });
  await act(async () => { fireEvent.press(view.getByLabelText('Weruva Duck Stew')); });
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  expect(mockSetMealComponents).toHaveBeenCalledWith('evt-1', [
    expect.objectContaining({ foodItemId: 'chicken', share: 0.333 }),
    expect.objectContaining({ foodItemId: 'duck', foodLabel: 'Weruva Duck Stew', share: 0.667 }),
  ]);
});

it('a bowl holding a food gone from the library is shown and kept: no food write', async () => {
  mockLoadMealBowls.mockResolvedValue(new Map([['evt-1', bowlOf([['chicken', 'Chicken Pâté', 0.5], [null, 'Old Food', 0.5]])]]));
  const view = await open();
  view.getByText(/isn’t on this phone/);
  expect(view.queryByText(/out of this bowl/)).toBeNull();
  expect(view.queryByText('No food selected')).toBeNull();
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  expect(mockSetMealComponents).not.toHaveBeenCalled();
  expect(updateMealFood).not.toHaveBeenCalled();
});

it('a bowl whose read failed is kept too, never overwritten with one food', async () => {
  mockLoadMealBowls.mockRejectedValue(new Error('db'));
  const view = await open();
  view.getByText(/didn’t load/);
  await act(async () => { fireEvent.press(view.getByText('Save')); });
  expect(mockSetMealComponents).not.toHaveBeenCalled();
  expect(updateMealFood).not.toHaveBeenCalled();
});
