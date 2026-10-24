// CUL-1087 — the edit screen writes a meal's intake rating only when the owner changed it.
//
// Every rating write now asks the Signal to rebuild (`rateMealIntake`), and a rebuild
// counts toward generate-signal's 12-a-day cap, past which detection is skipped and a
// safety card can freeze (CUL-1109). The screen used to write the rating on every save
// of a meal, changed or not, so a time or notes edit would have spent a rebuild on
// nothing. It also re-stamped a rating nobody touched, which under last-write-wins can
// overwrite a newer one from another device: the dose fields below it already compare
// against the as-loaded value for that reason.
//
// Harness: `editEvent.look.test.tsx`'s, with the rating's write path stubbed.

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
import EditEventModal from './edit-event';

function meal(intake: string | null) {
  return {
    food_item_id: 'food-1', food_brand: 'Fancy Feast', food_product_name: 'Pate',
    food_format: 'wet', intake_rating: intake,
  };
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAsync.mockResolvedValue([]);
  mockGetFirstAsync.mockResolvedValue({ pet_id: 'pet-cat' });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** Rendered, with the meal child's load settled. */
async function open() {
  const utils = render(<EditEventModal />);
  await waitFor(() => expect(mockGetMealForEvent).toHaveBeenCalledWith('evt-1'));
  await act(async () => {});
  return utils;
}

describe('the meal rating on the edit screen (CUL-1087)', () => {
  it('a save that leaves the rating alone writes no rating and asks for no rebuild', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
  });

  it('a changed rating goes through the shared write, which rebuilds', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    fireEvent.press(getByText('Picked'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).toHaveBeenCalledWith('evt-1', 'picked');
  });

  it('a cleared rating is a change too', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    fireEvent.press(getByText('Most'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).toHaveBeenCalledWith('evt-1', null);
  });

});

// Until the meal's read answers, the chips are blank over whatever is stored, so their
// null is not the record (C-12). The first cut seeded the as-loaded rating `undefined`
// and so wrote that null on an untouched Save: over a stored refusal, it erased the
// refusal and its rebuild took the decline off Home (adversarial-reviewer, at the wrap).
describe('a Save before the meal read answers (CUL-1087)', () => {
  // Since CUL-1909 P6 the form does not paint until the record's reads answer, so there
  // are no blank chips to save over a stored rating: Save waits, disabled with its reason.
  const updateEvent = () => (jest.requireMock('../lib/db') as { updateEvent: jest.Mock }).updateEvent;

  it('a read still pending: Save waits, and writes nothing', async () => {
    mockGetMealForEvent.mockReturnValue(new Promise(() => {}));
    const { getByText, getByLabelText, queryByText } = await open();
    expect(queryByText('Refused')).toBeNull();
    expect(getByLabelText('Save, loading the record').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
    expect(updateEvent()).not.toHaveBeenCalled();
  });

  it('a read that failed: the form says so, offers Try again, and Save writes nothing', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetMealForEvent.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue(meal('most'));
    const { getByText, findByText } = await open();
    expect(await findByText(/This record didn’t load/)).toBeTruthy();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
    expect(updateEvent()).not.toHaveBeenCalled();
    // Try again reads the record afresh, and the form arrives.
    await act(async () => { fireEvent.press(getByText('Try again')); });
    expect(await findByText('Most')).toBeTruthy();
    quiet.mockRestore();
  });

  it('no meal row: an untouched Save writes no rating, so the rest of the edit is not failed by it', async () => {
    // The food and dose writes already skip a child that did not load; the rating now
    // matches them. A rating the owner PICKS on a rowless meal still writes and still
    // fails loudly on the zero-row guard, which the case below covers.
    mockGetMealForEvent.mockResolvedValue(null);
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
  });

  it('a rating the owner picked on a rowless meal still saves', async () => {
    // Refactor safety for the fix's shape: "skip the write until the read answers with
    // a rating" would drop a deliberate pick silently.
    mockGetMealForEvent.mockResolvedValue(null);
    const { getByText } = await open();
    fireEvent.press(getByText('Refused'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).toHaveBeenCalledWith('evt-1', 'refused');
  });
});

// CUL-1219 (BRK-44): an edit that moves what the engine counted refreshes the Signal; a
// peek-and-save spends no rebuild against the daily cap (CUL-1087's reason, above).
describe('the Signal refresh on an edit (CUL-1219)', () => {
  it('an untouched save asks for no rebuild', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockTriggerRegen).not.toHaveBeenCalled();
  });

  it('a changed food rebuilds the record’s pet’s Signal', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    mockGetAllAsync.mockResolvedValue([{ id: 'food-2', brand: 'Hill’s', product_name: 'Turkey', format: 'dry' }]);
    const { getByText, getByTestId } = await open();
    // The food row's own "Change" (the time row carries one too): the one beside the food.
    fireEvent.press(getByTestId('edit-food'));
    await waitFor(() => expect(getByText('Turkey')).toBeTruthy());
    fireEvent.press(getByText('Turkey'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockTriggerRegen).toHaveBeenCalledWith('pet-cat');
  });

  it('a failed pet lookup skips the refresh and never fails a save that already landed', async () => {
    mockGetMealForEvent.mockResolvedValue(meal('most'));
    mockGetAllAsync.mockResolvedValue([{ id: 'food-2', brand: 'Hill’s', product_name: 'Turkey', format: 'dry' }]);
    // The record's pet answers at load (it opens the food step); the save's own lookups fail.
    mockGetFirstAsync.mockResolvedValueOnce({ pet_id: 'pet-cat' }).mockRejectedValue(new Error('sqlite busy'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByText, getByTestId } = await open();
    fireEvent.press(getByTestId('edit-food'));
    await waitFor(() => expect(getByText('Turkey')).toBeTruthy());
    fireEvent.press(getByText('Turkey'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockTriggerRegen).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled();
    warn.mockRestore();
  });
});
