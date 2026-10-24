// CUL-887 — the editor asks the leaf contract before it offers a photo.
//
// `constants/eventTypes.ts` carries `hasPhoto` per leaf, and every capture surface gates
// on it; the editor's Photo section did not, so a cough, a sneeze, a meal and a look could
// be given a photo here that the record screen then shows as its hero. The gate suppresses
// the OFFER, never the evidence: an existing photo on such a record still shows, and is
// never deleted or hidden to satisfy the flag (zero such rows in production, the issue's
// row checks; the evidence branch is for the rows a future re-key can produce).
//
// Walks every key of EVENT_TYPES rather than the four the issue names, so a future leaf
// lands on the right side of the gate or reds here.
//
// Harness: `editEvent.syncedPhoto.test.tsx`'s.

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

import { Alert } from 'react-native';
import { EVENT_TYPES } from '../constants/eventTypes';
import { PhotoViewer } from '../components/ui';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import EditEventModal from './edit-event';

jest.setTimeout(30000);

const LOCAL = { id: 'att-old', local_uri: 'file:///docs/att-old.jpg', storage_path: 'pet-cat/evt-1/att-old.jpg', mime_type: 'image/jpeg' };

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockLiveFiles.clear();
  mockGetEventAttachments.mockResolvedValue([]);
  // A look's child read answers nothing: the parent reached this phone first (a real state).
  (jest.requireMock('../lib/looks') as { getLookForEvent: jest.Mock }).getLookForEvent.mockResolvedValue(null);
  mockGetSignedUrl.mockResolvedValue('https://signed/att-old');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function open(type: string) {
  mockRouteParams = { id: 'evt-1', type, occurredAt: '2026-10-08T07:30:00.000Z', notes: '' };
  const utils = render(<EditEventModal />);
  await act(async () => {});
  await waitFor(() => expect(mockGetEventAttachments).toHaveBeenCalled());
  await act(async () => {});
  return utils;
}

const LEAVES = Object.entries(EVENT_TYPES).map(([key, cfg]) => [key, cfg.hasPhoto] as const);

describe('the photo offer follows hasPhoto on every leaf (CUL-887)', () => {
  it('walks a real set, with both sides of the flag in it', () => {
    // Non-vacuity: a walk over nothing, or over one side only, proves no gate.
    expect(LEAVES.length).toBeGreaterThan(10);
    expect(LEAVES.filter(([, p]) => !p).map(([k]) => k).sort()).toEqual(
      expect.arrayContaining(['check_in', 'cough', 'meal', 'sneeze']),
    );
    expect(LEAVES.some(([, p]) => p)).toBe(true);
  });

  it.each(LEAVES)('%s (hasPhoto %s): the offer shows exactly when the leaf declares one', async (type, hasPhoto) => {
    const utils = await open(type);
    expect(utils.queryByTestId('edit-photo-offer') !== null).toBe(hasPhoto);
    expect(utils.queryByTestId('edit-photo-attached')).toBeNull();
  });

  it('an unknown leaf keeps the offer (the §8 degradation posture)', async () => {
    const utils = await open('a_leaf_from_a_later_wave');
    expect(utils.getByTestId('edit-photo-offer')).toBeTruthy();
  });
});

describe('an existing photo on a leaf that offers none is the evidence, kept (CUL-887)', () => {
  it.each(['cough', 'sneeze', 'meal', 'check_in'])('%s: shows the photo and offers no way to add another', async (type) => {
    mockLiveFiles.add(LOCAL.local_uri);
    mockGetEventAttachments.mockResolvedValue([LOCAL]);
    const utils = await open(type);
    expect(utils.getByTestId('edit-photo-attached')).toBeTruthy();
    expect(utils.queryByTestId('edit-photo-offer')).toBeNull();
    // The viewer's Replace is the same door as the offer, so it takes the same gate.
    expect(utils.UNSAFE_getByType(PhotoViewer).props.onReplace).toBeUndefined();
  });

  it('a vomit with a photo keeps its Replace', async () => {
    mockLiveFiles.add(LOCAL.local_uri);
    mockGetEventAttachments.mockResolvedValue([LOCAL]);
    const utils = await open('vomit');
    expect(utils.UNSAFE_getByType(PhotoViewer).props.onReplace).toEqual(expect.any(Function));
  });
});
