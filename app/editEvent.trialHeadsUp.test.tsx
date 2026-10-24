// CUL-2087 — Change on the edit screen gives a plain meal's trial heads-up back.
// CUL-2088 — and the food it changes TO gets the heads-up the card would have given, as a
// line waiting for the meal's own screen (the line itself: `TrialHeadsUpLine.test.tsx`).
//
// During a trial a food gets one heads-up, spent when the card shows it. The card's own
// heads-up is usually what tells the owner they tapped the wrong food, and the edit
// screen is one place they fix it. Before this, changing the food there left the old food
// spent on a meal that no longer holds it, so the pet's real feeding of that food later
// got no warning. Against the REAL ledger (AsyncStorage's jest mock).
//
// Harness: `editEvent.intake.test.tsx`'s.

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

const mockEvaluateMeal = jest.fn().mockResolvedValue(null);
jest.mock('../lib/trialContaminant', () => ({
  ...jest.requireActual('../lib/trialContaminant'),
  evaluateMealLogTimeFlag: (...a: unknown[]) => mockEvaluateMeal(...a),
}));

const mockTriggerRegen = jest.fn();
jest.mock('../lib/signal', () => ({ triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerRegen(...a) }));

// P3: the meal's food is picked on the log form's food step. Its tiles come from the same
// library read the old inline list used, so each case's food fixture still drives it.
jest.mock('../components/log/FoodPicker', () => {
  const react = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    FoodPicker: ({ onPickFood }: { onPickFood: (f: unknown) => void }) => {
      const [foods, setFoods] = react.useState([]);
      react.useEffect(() => {
        require('../lib/db').getDb().getAllAsync().then(setFoods);
      }, []);
      return foods.map((f: { id: string; product_name: string }) =>
        react.createElement(Pressable, { key: f.id, onPress: () => onPickFood({ ...f, food_type: 'meal', photo_path: null }) },
          react.createElement(Text, null, f.product_name)));
    },
  };
});

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
    // The real resolver's shape (C-9): the record's pet by id, never the active one.
    ANONYMOUS_PET_NAME: 'your pet',
    resolveRecordPetName: (ps: { id: string; name?: string }[], petId: string | null) =>
      ps.find((p) => p.id === petId)?.name?.trim() || 'your pet',
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EditEventModal from './edit-event';
import { clearTrialHeadsUpLedger, hasFlaggedFoodInTrial, noteTrialFlagShown, type LogTimeTrialFlag } from '../lib/trialContaminant';
import { useMealScreenFlagStore } from '../store/mealScreenFlagStore';

function meal(intake: string | null) {
  return {
    food_item_id: 'food-1', food_brand: 'Fancy Feast', food_product_name: 'Pate',
    food_format: 'wet', intake_rating: intake,
  };
}

let alertSpy: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  mockGetAllAsync.mockResolvedValue([]);
  mockGetFirstAsync.mockResolvedValue({ pet_id: 'pet-cat', occurred_at: '2026-09-22T07:30:00.000Z' });
  mockEvaluateMeal.mockResolvedValue(null);
  useMealScreenFlagStore.getState().reset();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await AsyncStorage.clear();
  await clearTrialHeadsUpLedger();
});
afterEach(() => alertSpy.mockRestore());

async function open() {
  const utils = render(<EditEventModal />);
  await waitFor(() => expect(mockGetMealForEvent).toHaveBeenCalledWith('evt-1'));
  await act(async () => {});
  return utils;
}

const TRIAL = 'trial-1';

describe('Change on the edit screen gives the old food its trial heads-up back (CUL-2087)', () => {
  it('a plain meal changed X to Z: X gets its heads-up back, another meal\'s spend stays', async () => {
    await noteTrialFlagShown({ trialId: TRIAL, foodId: 'food-1' }, 'evt-1');
    await noteTrialFlagShown({ trialId: TRIAL, foodId: 'food-9' }, 'evt-other');
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    mockGetAllAsync.mockResolvedValue([{ id: 'food-2', brand: 'Hill’s', product_name: 'Turkey', format: 'dry' }]);
    const { getByText, getByTestId } = await open();
    fireEvent.press(getByTestId('edit-food'));
    await waitFor(() => expect(getByText('Turkey')).toBeTruthy());
    fireEvent.press(getByText('Turkey'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(jest.requireMock('../lib/db').updateMealFood).toHaveBeenCalledWith('evt-1', 'food-2');
    expect(await hasFlaggedFoodInTrial(TRIAL, 'food-1')).toBe(false);
    expect(await hasFlaggedFoodInTrial(TRIAL, 'food-9')).toBe(true);
  });

  it('a save that leaves the food alone keeps its heads-up spent', async () => {
    await noteTrialFlagShown({ trialId: TRIAL, foodId: 'food-1' }, 'evt-1');
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'food-1')).toBe(true);
  });

  it('a failed food write gives nothing back: the meal still holds the food', async () => {
    await noteTrialFlagShown({ trialId: TRIAL, foodId: 'food-1' }, 'evt-1');
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.requireMock('../lib/db').updateMealFood.mockRejectedValueOnce(new Error('No meal row'));
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    mockGetAllAsync.mockResolvedValue([{ id: 'food-2', brand: 'Hill’s', product_name: 'Turkey', format: 'dry' }]);
    const { getByText, getByTestId } = await open();
    fireEvent.press(getByTestId('edit-food'));
    await waitFor(() => expect(getByText('Turkey')).toBeTruthy());
    fireEvent.press(getByText('Turkey'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(await hasFlaggedFoodInTrial(TRIAL, 'food-1')).toBe(true);
    quiet.mockRestore();
  });
});

const OFF_LIST: LogTimeTrialFlag = {
  kind: 'off_trial_list',
  trialId: TRIAL,
  foodId: 'food-2',
  trialStartedAt: '2026-09-10T07:00:00.000Z',
  trialTargetDurationDays: 56,
};

async function changeToTurkey() {
  mockGetMealForEvent.mockResolvedValue(meal('most'));
  mockGetAllAsync.mockResolvedValue([{ id: 'food-2', brand: 'Hill’s', product_name: 'Turkey', format: 'dry' }]);
  const { getByText, getByTestId } = await open();
  fireEvent.press(getByTestId('edit-food'));
  await waitFor(() => expect(getByText('Turkey')).toBeTruthy());
  fireEvent.press(getByText('Turkey'));
  await act(async () => { fireEvent.press(getByText('Save')); });
}

describe('the food changed in gets its trial heads-up on the meal\'s screen (CUL-2088)', () => {
  it('an off-trial food: the heads-up waits for the meal\'s screen, for the meal\'s own pet, spending nothing', async () => {
    mockEvaluateMeal.mockResolvedValue(OFF_LIST);
    await changeToTurkey();
    await waitFor(() => expect(useMealScreenFlagStore.getState().pending['evt-1']?.flag).toBe(OFF_LIST));
    expect(mockEvaluateMeal).toHaveBeenCalledWith({
      petId: 'pet-cat', foodId: 'food-2', occurredAt: '2026-09-22T07:30:00.000Z',
    });
    // Spent only by the line, once it shows.
    expect(await hasFlaggedFoodInTrial(TRIAL, 'food-2')).toBe(false);
  });

  it('a food with nothing to say clears a heads-up an earlier change left waiting', async () => {
    useMealScreenFlagStore.getState().put('evt-1', { flag: { ...OFF_LIST, foodId: 'food-1' }, food: null, origin: 'edit' });
    await changeToTurkey();
    await waitFor(() => expect(mockEvaluateMeal).toHaveBeenCalled());
    await waitFor(() => expect(useMealScreenFlagStore.getState().pending['evt-1']).toBeUndefined());
  });

  it('a save that leaves the food alone asks nothing', async () => {
    mockEvaluateMeal.mockResolvedValue(OFF_LIST);
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockEvaluateMeal).not.toHaveBeenCalled();
    expect(useMealScreenFlagStore.getState().pending['evt-1']).toBeUndefined();
  });
});
