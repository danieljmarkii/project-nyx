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
jest.mock('../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
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
  it('a read still pending: the blank chips write nothing', async () => {
    mockGetMealForEvent.mockReturnValue(new Promise(() => {}));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
  });

  it('a read that failed: the stored rating is left alone', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetMealForEvent.mockRejectedValue(new Error('database is locked'));
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).not.toHaveBeenCalled();
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

  it('a rating the owner picked still saves, read or no read', async () => {
    // Refactor safety for the fix's shape: "skip the write until the read answers with
    // a rating" would drop a deliberate pick silently.
    mockGetMealForEvent.mockReturnValue(new Promise(() => {}));
    const { getByText } = await open();
    fireEvent.press(getByText('Refused'));
    await act(async () => { fireEvent.press(getByText('Save')); });
    expect(mockRateMealIntake).toHaveBeenCalledWith('evt-1', 'refused');
  });
});
