// CUL-2195 — the editor asks the leaf contract before it offers Saw it / Found it.
//
// `constants/eventTypes.ts` carries `confidenceModel` per leaf, and both capture surfaces
// gate on it; the editor listed four types instead and missed cough and sneeze, so a
// window claim could be stamped on a leaf that declares it cannot hold one. That claim
// prints in the vet report's confidence column and feeds detector ⑦'s span and onset.
//
// Ported from 6201a97 (CUL-887's confidence half, adversarially reviewed, PM-ruled A
// 2026-09-14) onto PR-19's editor. The photo half lives in `editEvent.photoGate.test.tsx`.
//
// Walks every key of EVENT_TYPES rather than the two the issue names, so a future leaf
// lands on the right side of the gate or reds here. "Saw it happen" is the control's
// segment; `time-when` is the plain point row, which the control also draws in its
// saw / unclassified modes and never in found mode.
//
// Harness: `editEvent.photoGate.test.tsx`'s, plus a stored-time fixture and a
// TimeEditSheet stand-in that commits a chosen point.

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: class { exists = false; } }));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: jest.fn() }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn().mockResolvedValue(undefined),
  compressForUpload: jest.fn(),
  persistCapture: jest.fn(),
  getSignedUrl: jest.fn().mockResolvedValue(null),
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

// What the row holds. Read on mount AND re-read by the save, as in production.
const mockStoredTime: { current: { confidence: string | null; earliest: string | null; latest: string | null } } = {
  current: { confidence: 'witnessed', earliest: null, latest: null },
};
const mockUpdateEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ pet_id: 'pet-cat' }),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  }),
  updateEvent: (...a: unknown[]) => mockUpdateEvent(...a),
  updateMealFood: jest.fn().mockResolvedValue(undefined),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getEventTimeFields: jest.fn(() => Promise.resolve({ ...mockStoredTime.current })),
}));
jest.mock('../lib/incidentFloorQueue', () => ({
  writeOwingFloorCheck: (_id: string, write: () => Promise<unknown>) => write(),
}));
jest.mock('../lib/weight', () => ({
  getWeightKgForEvent: jest.fn().mockResolvedValue(null), updateWeightCheck: jest.fn(),
  parseWeightLbsToKg: jest.fn(), kgToLbs: jest.fn(), MAX_WEIGHT_LBS: 300,
}));
jest.mock('../lib/looks', () => ({
  localDayForLook: jest.fn(), getLookForEvent: jest.fn().mockResolvedValue(null), updateLookForEdit: jest.fn(),
}));
jest.mock('../lib/meals', () => ({ rateMealIntake: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: jest.fn(), awaitAnalysisChain: jest.fn(),
}));

// The one time sheet, stood in by a button that commits `mockMovedTo`. Both the editor's
// plain point and the control's rows import this module, so one mock covers both doors.
const mockMovedTo: { current: Date | null } = { current: null };
jest.mock('../components/ui/TimeEditSheet', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    TimeEditSheet: ({ onSave }: { onSave: (d: Date) => void }) => (
      <TouchableOpacity onPress={() => mockMovedTo.current && onSave(mockMovedTo.current)}>
        <Text>move-the-point</Text>
      </TouchableOpacity>
    ),
  };
});

let mockRouteParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
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
import { EVENT_TYPES, type EventTypeKey } from '../constants/eventTypes';
import EditEventModal from './edit-event';

jest.setTimeout(30000);

const AT = '2026-03-15T09:58:00.000Z';
const WINDOWED = { confidence: 'window', earliest: '2026-03-15T02:00:00.000Z', latest: '2026-03-15T09:00:00.000Z' };

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockStoredTime.current = { confidence: 'witnessed', earliest: null, latest: null };
  mockMovedTo.current = null;
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** The editor opened on `type`, with the mount reads settled. */
async function open(type: string) {
  mockRouteParams = { id: 'evt-1', type, occurredAt: AT, notes: '' };
  const utils = render(<EditEventModal />);
  const db = jest.requireMock('../lib/db') as { getEventTimeFields: jest.Mock };
  await waitFor(() => expect(db.getEventTimeFields).toHaveBeenCalled());
  await act(async () => {});
  await act(async () => {});
  return utils;
}

async function save(utils: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(utils.getByText('Save')); });
  await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));
  return mockUpdateEvent.mock.calls[0][1] as Record<string, unknown>;
}

const LEAVES = Object.keys(EVENT_TYPES) as EventTypeKey[];

describe('Saw it / Found it follows confidenceModel on every leaf', () => {
  it('walks a real set, with both sides of the model in it', () => {
    // Non-vacuity: a walk over nothing, or over one side only, proves no gate.
    expect(LEAVES.length).toBeGreaterThan(10);
    expect(LEAVES.some((t) => EVENT_TYPES[t].confidenceModel !== 'witnessed')).toBe(true);
  });

  it('the witnessed leaves are the ones the contract names', () => {
    // Pinned so a leaf changing model is a decision this file is told about.
    expect(LEAVES.filter((t) => EVENT_TYPES[t].confidenceModel === 'witnessed').sort())
      .toEqual(['check_in', 'cough', 'meal', 'medication', 'sneeze', 'weight_check']);
  });

  // Every case here is a row whose stored confidence AGREES with its leaf, which is
  // every row production can now create; the rows that disagree are the exception below.
  it.each(LEAVES)('%s: the control shows exactly when the leaf is not witnessed by construction', async (type) => {
    const utils = await open(type);
    const witnessed = EVENT_TYPES[type].confidenceModel === 'witnessed';
    expect(utils.queryByText('Saw it happen') === null).toBe(witnessed);
    expect(utils.queryByText('Found it') === null).toBe(witnessed);
    // A witnessed leaf is not left without a time control: it gets the plain point.
    // An affordance that vanished entirely would pass the two lines above.
    expect(utils.getByTestId('time-when')).toBeTruthy();
  });

  it('an unknown leaf keeps the control (the §8 degradation posture)', async () => {
    const utils = await open('a_leaf_from_a_later_wave');
    expect(utils.getByText('Saw it happen')).toBeTruthy();
  });
});

describe('a row that already contradicts its leaf keeps the control that can fix it', () => {
  // Suppress the ability to MAKE the claim, never the ability to SEE and correct one the
  // record already holds. Without the exception the windowed row drops to the plain
  // point, which moves `occurred_at` without touching the bounds and leaves the point
  // outside its own window, with nothing in the schema or on any screen to say so.
  it.each(['cough', 'sneeze'])('a windowed %s gets Saw it / Found it back', async (type) => {
    mockStoredTime.current = WINDOWED;
    const utils = await open(type);
    expect(await utils.findByText('Found it')).toBeTruthy();
  });

  it('and therefore never sees the plain point', async () => {
    // The regression proper: the found panel draws no `time-when`, so the drift is
    // unreachable again.
    mockStoredTime.current = WINDOWED;
    const utils = await open('cough');
    await utils.findByText('The full range is kept for your vet.');
    expect(utils.queryByTestId('time-when')).toBeNull();
  });

  it('an estimated cough is a contradiction too', async () => {
    mockStoredTime.current = { confidence: 'estimated', earliest: null, latest: null };
    const utils = await open('cough');
    expect(await utils.findByText('Found it')).toBeTruthy();
  });

  it('a witnessed cough is untouched by the exception', async () => {
    // Without this, setting the flag unconditionally would pass the cases above and
    // undo the whole issue.
    const utils = await open('cough');
    expect(utils.queryByText('Found it')).toBeNull();
    expect(utils.getByTestId('time-when')).toBeTruthy();
  });

  it('a NULL confidence is an absence, not a contradiction', async () => {
    // Legacy rows carry NULL; 012's backfill is the PM's to make. Reading NULL as a
    // contradiction would hand the control to every un-backfilled row on the leaf.
    mockStoredTime.current = { confidence: null, earliest: null, latest: null };
    const utils = await open('cough');
    expect(utils.queryByText('Found it')).toBeNull();
    expect(utils.getByTestId('time-when')).toBeTruthy();
  });
});

describe('closing the door does not rewrite what came through it', () => {
  // `confidenceTouched` is only set by the control's own handlers, so with no control
  // the save omits the key and `updateEvent` preserves the row. The failure would be
  // silent and would land on the vet report as a `seen` nobody claimed (B-448).
  it('an untouched save on a witnessed cough writes no confidence', async () => {
    const utils = await open('cough');
    const fields = await save(utils);
    expect('confidence' in fields).toBe(false);
  });

  it('a windowed cough survives an untouched save with the control on screen', async () => {
    mockStoredTime.current = WINDOWED;
    const utils = await open('cough');
    await utils.findByText('Found it');
    const fields = await save(utils);
    // Omitted, not passed as witnessed: the key's PRESENCE would be a re-grade.
    expect('confidence' in fields).toBe(false);
    // And the point stays inside the window it keeps. Without this the case passes on a
    // witnessed fixture too (the adversarial pass on 6201a97 mutated it and watched).
    const at = Date.parse(fields.occurred_at as string);
    expect(at).toBeGreaterThanOrEqual(Date.parse(WINDOWED.earliest));
    expect(at).toBeLessThanOrEqual(Date.parse(WINDOWED.latest));
  });

  it('and a leaf that still has the control can still assert one', async () => {
    // The mirror, so the cases above cannot pass by the save being broken for everyone.
    const utils = await open('itch');
    await act(async () => { fireEvent.press(utils.getByText('Found it')); });
    const fields = await save(utils);
    expect(fields.confidence).toMatchObject({ value: 'window' });
  });
});

describe('moving the point is not a claim about how well the time is known', () => {
  // C-10, pinned on this leaf because the natural-looking repair for the drift is to
  // mark `handlePointChange` confidence-bearing, which converts it into the full B-448
  // leak (the save would assert witnessed and null the bounds). The adversarial pass on
  // 6201a97 applied exactly that mutation to a green suite; this case stops it.
  it.each([
    ['NULL', null],
    ['witnessed', 'witnessed'],
  ])('a point edit on a %s-confidence cough writes no confidence', async (_label, confidence) => {
    mockStoredTime.current = { confidence, earliest: null, latest: null };
    mockMovedTo.current = new Date('2026-03-15T21:30:00.000Z');
    const utils = await open('cough');
    fireEvent.press(utils.getByTestId('time-when'));
    await act(async () => { fireEvent.press(utils.getByText('move-the-point')); });
    const fields = await save(utils);
    expect(fields.occurred_at).toBe('2026-03-15T21:30:00.000Z'); // the edit landed
    expect('confidence' in fields).toBe(false);                  // and claimed nothing
    expect(fields.occurred_at_source).toBe('manual');            // the one thing it asserts
  });
});
