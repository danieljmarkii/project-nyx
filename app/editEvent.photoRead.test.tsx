// CUL-1680 — a photo added or swapped on the edit screen gets its per-incident read.
//
// The edit screen uploaded the new photo and refreshed only the Signal, so a vomit /
// stool read kept describing the photo it saw. A stored "can wait until morning" then
// stood over a photo nobody looked at, on the event and on the incidents beside it
// (the server takes those back only when a new read lands). The detail screen's
// photo-add already reads (`app/event/[id].tsx`); these pin the same chain here:
// claim before the screen closes, read only once the photo's row has landed, settle
// the claim on every exit, and refresh the Signal after the read rather than before.
//
// Harness: `editEvent.intake.test.tsx`'s, with the upload and the read stubbed.

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///cache/new.jpg', width: 3000, height: 4000 }],
  }),
}));
jest.mock('expo-file-system', () => ({ File: class {} }));
const mockUpsert = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn().mockResolvedValue(undefined),
  compressForUpload: jest.fn().mockResolvedValue('file:///cache/compressed.jpg'),
  persistCapture: jest.fn().mockReturnValue('file:///docs/new.jpg'),
  MAX_EDGE_PX: 1600,
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

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ pet_id: 'pet-cat' }),
    runAsync: (...a: unknown[]) => mockRunAsync(...a),
  }),
  updateEvent: jest.fn().mockResolvedValue(undefined),
  updateMealFood: jest.fn().mockResolvedValue(undefined),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getEventTimeFields: jest.fn().mockResolvedValue({ confidence: 'witnessed', earliest: null, latest: null }),
}));
jest.mock('../lib/incidentFloorQueue', () => ({
  writeOwingFloorCheck: (_id: string, write: () => Promise<unknown>) => write(),
}));
jest.mock('../lib/weight', () => ({
  getWeightKgForEvent: jest.fn().mockResolvedValue(null), updateWeightCheck: jest.fn(),
  parseWeightLbsToKg: jest.fn(), kgToLbs: jest.fn(), MAX_WEIGHT_LBS: 300,
}));
jest.mock('../lib/looks', () => ({
  localDayForLook: jest.fn(), getLookForEvent: jest.fn(), updateLookForEdit: jest.fn(),
}));
jest.mock('../lib/meals', () => ({ rateMealIntake: jest.fn().mockResolvedValue(undefined) }));

const mockTriggerRegen = jest.fn();
jest.mock('../lib/signal', () => ({ triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerRegen(...a) }));

// The read and its chain: the real claim module would be fine, but a stub lets each case
// say who already owns the chain and observe the settle.
const mockVomit = jest.fn();
const mockStool = jest.fn();
const mockSettle = jest.fn();
const mockClaim = jest.fn();
const mockAwait = jest.fn();
jest.mock('../lib/analysis', () => ({
  triggerVomitAnalysis: (...a: unknown[]) => mockVomit(...a),
  triggerStoolAnalysis: (...a: unknown[]) => mockStool(...a),
  claimAnalysisChain: (...a: unknown[]) => mockClaim(...a),
  awaitAnalysisChain: (...a: unknown[]) => mockAwait(...a),
}));

let mockRouteParams: Record<string, string> = {};
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a) },
  useLocalSearchParams: () => mockRouteParams,
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

const OCCURRED = '2026-10-08T07:30:00.000Z';

// The first render pays the screen's module load.
jest.setTimeout(20000);

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
  mockVomit.mockResolvedValue({ error: null });
  mockStool.mockResolvedValue({ error: null });
  mockClaim.mockReturnValue({ settle: mockSettle });
  mockAwait.mockResolvedValue(false);
  // The source sheet: choose the library, which the picker stub answers with a photo.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, _msg, buttons) => {
    if (title === 'Attach photo') buttons?.find((b) => b.text === 'Choose from library')?.onPress?.();
  });
});
afterEach(() => alertSpy.mockRestore());

async function open(type: string) {
  mockRouteParams = { id: 'evt-1', type, occurredAt: OCCURRED, notes: '' };
  const utils = render(<EditEventModal />);
  await act(async () => {});
  return utils;
}

async function attachAndSave(utils: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(utils.getByText('Attach a photo')); });
  await waitFor(() => expect(utils.getByText('Photo attached')).toBeTruthy());
  await act(async () => { fireEvent.press(utils.getByText('Save')); });
  // Let the fire-and-forget upload chain run to its settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('a photo changed on the edit screen gets its read (CUL-1680)', () => {
  it('a vomit: claims before the screen closes, reads once the row lands, then refreshes the Signal', async () => {
    const utils = await open('vomit');
    await attachAndSave(utils);
    expect(mockClaim).toHaveBeenCalledWith('evt-1');
    // Taken before the screen closes, so the detail screen's section finds it held (CUL-801).
    expect(mockClaim.mock.invocationCallOrder[0]).toBeLessThan(mockBack.mock.invocationCallOrder[0]);
    expect(mockVomit).toHaveBeenCalledTimes(1);
    expect(mockVomit).toHaveBeenCalledWith('evt-1');
    expect(mockStool).not.toHaveBeenCalled();
    // The read runs after the photo's row reached the server, not before.
    expect(mockUpsert.mock.invocationCallOrder[0]).toBeLessThan(mockVomit.mock.invocationCallOrder[0]);
    expect(mockSettle).toHaveBeenCalledWith(true);
    // One refresh, after the read: the immediate one no longer counts this photo.
    expect(mockTriggerRegen).toHaveBeenCalledTimes(1);
    expect(mockTriggerRegen.mock.invocationCallOrder[0]).toBeGreaterThan(mockVomit.mock.invocationCallOrder[0]);
  });

  it('a stool takes the stool read', async () => {
    const utils = await open('diarrhea');
    await attachAndSave(utils);
    expect(mockStool).toHaveBeenCalledWith('evt-1');
    expect(mockVomit).not.toHaveBeenCalled();
  });

  it('a held chain is awaited, then the new photo is read anyway', async () => {
    mockClaim.mockReturnValue(null);
    const utils = await open('vomit');
    await attachAndSave(utils);
    expect(mockAwait).toHaveBeenCalledWith('evt-1');
    expect(mockAwait.mock.invocationCallOrder[0]).toBeLessThan(mockVomit.mock.invocationCallOrder[0]);
    expect(mockVomit).toHaveBeenCalledTimes(1);
  });

  it('a row that did not land asks for no read and settles the claim false', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'offline' } });
    const utils = await open('vomit');
    await attachAndSave(utils);
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(false);
    expect(mockTriggerRegen).not.toHaveBeenCalled();
  });

  // A cap is a 200 `gated` answer, not an error; an error is the invoke failing (a 500, a
  // dropped connection), which leaves nothing new for the Signal to count.
  it('a failed read invoke settles the claim false and refreshes nothing', async () => {
    mockVomit.mockResolvedValue({ error: 'FunctionsHttpError: 500' });
    const utils = await open('vomit');
    await attachAndSave(utils);
    expect(mockSettle).toHaveBeenCalledWith(false);
    expect(mockTriggerRegen).not.toHaveBeenCalled();
  });

  it('an upload that rejects asks for no read and settles the claim false', async () => {
    const { uploadPhoto } = jest.requireMock('../lib/storage') as { uploadPhoto: jest.Mock };
    uploadPhoto.mockRejectedValueOnce(new Error('Network request failed'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const utils = await open('vomit');
    await attachAndSave(utils);
    errSpy.mockRestore();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('a meal photo takes no read and keeps the immediate Signal refresh', async () => {
    const utils = await open('meal');
    await attachAndSave(utils);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockVomit).not.toHaveBeenCalled();
    expect(mockStool).not.toHaveBeenCalled();
    expect(mockTriggerRegen).toHaveBeenCalledWith('pet-cat');
  });

  it('a vomit saved with no new photo asks for no read', async () => {
    const utils = await open('vomit');
    await act(async () => { fireEvent.press(utils.getByText('Save')); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockVomit).not.toHaveBeenCalled();
  });
});
