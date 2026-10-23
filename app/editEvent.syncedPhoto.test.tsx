// CUL-2176 — the editor shows a synced photo before it can replace it.
//
// A photo that reached this phone by sync is a row with an empty local_uri (the FR-10
// sentinel). The editor used to draw "Attach a photo" over it, and Save with a new
// photo then swept it off the server unseen. These drive the real screen: the hydrated
// row and the local row both read as attached, the source sheet says Replace, and Save
// removes only the rows the editor showed.
//
// Harness: `editEvent.photoRead.test.tsx`'s, with the attachment read, the file check
// and the signer driven per case.

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///cache/new.jpg', width: 3000, height: 4000 }],
  }),
}));
// The on-device file check: a path in `mockLiveFiles` exists, any other does not.
const mockLiveFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  File: class { exists: boolean; constructor(uri: string) { this.exists = mockLiveFiles.has(uri); } },
}));
const mockUpsert = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn().mockResolvedValue(undefined),
  compressForUpload: jest.fn().mockResolvedValue('file:///cache/compressed.jpg'),
  persistCapture: jest.fn().mockReturnValue('file:///docs/new.jpg'),
  getSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a),
  MAX_EDGE_PX: 1600,
}));
const mockDetach = jest.fn();
const mockGetSignedUrl = jest.fn();
jest.mock('../lib/attachments', () => ({ detachOtherEventAttachments: (...a: unknown[]) => mockDetach(...a) }));
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

const mockGetEventAttachments = jest.fn();
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
  getEventAttachments: (...a: unknown[]) => mockGetEventAttachments(...a),
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

import { Alert, Image } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import EditEventModal from './edit-event';

jest.setTimeout(20000);

const HYDRATED = { id: 'att-old', local_uri: '', storage_path: 'pet-cat/evt-1/att-old.jpg', mime_type: 'image/jpeg' };
const LOCAL = { id: 'att-old', local_uri: 'file:///docs/att-old.jpg', storage_path: 'pet-cat/evt-1/att-old.jpg', mime_type: 'image/jpeg' };
const LATE = { id: 'att-late', local_uri: '', storage_path: 'pet-cat/evt-1/att-late.jpg', mime_type: 'image/jpeg' };

let alertSpy: jest.SpyInstance;
const alertTitles: string[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockLiveFiles.clear();
  alertTitles.length = 0;
  mockUpsert.mockResolvedValue({ error: null });
  mockClaim.mockReturnValue({ settle: mockSettle });
  mockVomit.mockResolvedValue({ error: null });
  mockGetSignedUrl.mockResolvedValue('https://signed/att-old');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, _msg, buttons) => {
    alertTitles.push(String(title));
    buttons?.find((b) => b.text === 'Choose from library')?.onPress?.();
  });
});
afterEach(() => alertSpy.mockRestore());

async function open() {
  mockRouteParams = { id: 'evt-1', type: 'vomit', occurredAt: '2026-10-08T07:30:00.000Z', notes: '' };
  const utils = render(<EditEventModal />);
  await act(async () => {});
  return utils;
}

function thumbUris(utils: ReturnType<typeof render>): string[] {
  return utils.UNSAFE_queryAllByType(Image).map((i) => (i.props.source as { uri?: string })?.uri ?? '');
}

async function replaceAndSave(utils: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(utils.getByText('Photo attached')); });
  await act(async () => { fireEvent.press(utils.getByText('Replace')); });
  await act(async () => { fireEvent.press(utils.getByText('Save')); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('a photo that arrived by sync (CUL-2176)', () => {
  it('reads as attached, never Attach, and draws the signed URL', async () => {
    mockGetEventAttachments.mockResolvedValue([HYDRATED]);
    const utils = await open();
    await waitFor(() => expect(utils.getByText('Photo attached')).toBeTruthy());
    expect(utils.queryByText('Attach a photo')).toBeNull();
    expect(mockGetSignedUrl).toHaveBeenCalledWith('nyx-event-attachments', HYDRATED.storage_path, expect.any(Number));
    await waitFor(() => expect(thumbUris(utils)).toContain('https://signed/att-old'));
  });

  it('still reads as attached when the signed URL cannot resolve (offline)', async () => {
    mockGetEventAttachments.mockResolvedValue([HYDRATED]);
    mockGetSignedUrl.mockRejectedValue(new Error('offline'));
    const utils = await open();
    await waitFor(() => expect(utils.getByText('Photo attached')).toBeTruthy());
    expect(utils.queryByText('Attach a photo')).toBeNull();
  });

  it('the source sheet says Replace, and Save removes the shown row', async () => {
    mockGetEventAttachments.mockResolvedValue([HYDRATED]);
    const utils = await open();
    await replaceAndSave(utils);
    expect(alertTitles).toEqual(['Replace photo']);
    expect(mockDetach).toHaveBeenCalledTimes(1);
    expect(mockDetach.mock.calls[0][0].map((r: { id: string }) => r.id)).toEqual(['att-old']);
  });

  it('a row that reached this phone after the editor opened is never removed', async () => {
    mockGetEventAttachments.mockResolvedValueOnce([HYDRATED]).mockResolvedValue([LATE, HYDRATED]);
    const utils = await open();
    await replaceAndSave(utils);
    const removed = mockDetach.mock.calls[0][0].map((r: { id: string }) => r.id);
    expect(removed).toEqual(['att-old']);
    expect(removed).not.toContain('att-late');
  });
});

describe('a photo taken on this phone (CUL-2176)', () => {
  it('reads as attached with its on-device file and asks for no signed URL', async () => {
    mockGetEventAttachments.mockResolvedValue([LOCAL]);
    mockLiveFiles.add(LOCAL.local_uri);
    const utils = await open();
    await waitFor(() => expect(utils.getByText('Photo attached')).toBeTruthy());
    expect(thumbUris(utils)).toContain(LOCAL.local_uri);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('a record with no photo offers Attach, and Save removes nothing it did not show', async () => {
    mockGetEventAttachments.mockResolvedValueOnce([]).mockResolvedValue([LATE]);
    const utils = await open();
    await act(async () => { fireEvent.press(utils.getByText('Attach a photo')); });
    expect(alertTitles).toEqual(['Attach photo']);
    await act(async () => { fireEvent.press(utils.getByText('Save')); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockDetach.mock.calls[0][0]).toEqual([]);
  });
});
