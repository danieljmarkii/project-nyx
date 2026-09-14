// CUL-887 — the editor asks the LEAF CONTRACT, on every leaf.
//
// `app/edit-event.tsx` was the one door that ignored `constants/eventTypes.ts`:
// every capture surface and the record screen gate their photo and Saw-it/Found-it
// affordances on `hasPhoto` / `confidenceModel`, and the editor offered both on
// every type. So a cough could be stamped with a window claim the leaf declares
// unwritable, and a look could be handed a photo that the record screen would then
// render as its hero.
//
// WHY THIS WALKS THE WHOLE ENUM rather than sampling the four leaves the bug named:
// the defect WAS a hand-listed set of types that agreed with the contract until a
// wave added leaves it had never heard of. A test written the same way inherits the
// same failure mode — it would have been green on the day cough shipped. Driving
// every key of EVENT_TYPES means a future leaf lands on whichever side its own
// fields declare, or this suite goes red naming it.
//
// The walk is non-vacuous by construction: EVENT_TYPES holds leaves on BOTH sides of
// both predicates, so the positive cases (vomit offers the photo row; itch offers
// Saw it / Found it) fail loudly if a mock breaks rendering, and the absence
// assertions can never be the only thing measured. Both directions were also
// mutation-proved against the pre-fix predicates — see the PR.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' } }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: jest.fn() }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(), compressForUpload: jest.fn(), persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../lib/attachments', () => ({ detachOtherEventAttachments: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
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

// The attachment the screen loads on mount. Null for the walk (the beg is only
// reachable on a photoless row); set for the evidence cases at the foot of the file.
const mockAttachment = { current: null as { local_uri: string } | null };
// What the row already holds, as the save re-reads it (getEventTimeFields).
const mockStoredTime = {
  current: { confidence: 'witnessed', earliest: null, latest: null } as {
    confidence: string | null; earliest: string | null; latest: string | null;
  },
};
const mockUpdateEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  updateEvent: (...a: unknown[]) => mockUpdateEvent(...a),
  updateMealFood: jest.fn(), updateMealIntake: jest.fn(),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
  getEventAttachment: () => Promise.resolve(mockAttachment.current),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getEventTimeFields: () => Promise.resolve(mockStoredTime.current),
}));
jest.mock('../lib/weight', () => ({
  getWeightKgForEvent: jest.fn().mockResolvedValue(null), updateWeightCheck: jest.fn(),
  parseWeightLbsToKg: jest.fn(), kgToLbs: jest.fn(), MAX_WEIGHT_LBS: 300,
}));
jest.mock('../lib/looks', () => {
  const actual = jest.requireActual('../lib/looks');
  return {
    localDayForLook: actual.localDayForLook,
    getLookForEvent: jest.fn().mockResolvedValue({
      id: 'look-1', petId: 'pet-dog', outcome: 'observed',
      localDay: '2026-03-15', words: ['subdued'], notes: null,
    }),
    updateLookForEdit: jest.fn().mockResolvedValue(true),
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
  const pets = [{ id: 'pet-dog', name: 'Mochi', species: 'dog', sex: 'male' }];
  const state = { pets, activePet: pets[0], updatePet: jest.fn() };
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { Alert } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import EditEventModal from './edit-event';
import { EVENT_TYPES, EventTypeKey } from '../constants/eventTypes';

const AT = '2026-03-15T09:58:00.000Z';
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockAttachment.current = null;
  mockStoredTime.current = { confidence: 'witnessed', earliest: null, latest: null };
});
afterEach(() => alertSpy?.mockRestore());

/** The editor opened on `type`, with the async child loads settled. */
async function openAs(type: string) {
  mockRouteParams = { id: 'evt-1', type, occurredAt: AT, notes: '' };
  const utils = render(<EditEventModal />);
  await act(async () => {});
  return utils;
}

const LEAVES = Object.keys(EVENT_TYPES) as EventTypeKey[];

describe('the photo affordance follows hasPhoto, on every leaf', () => {
  it.each(LEAVES)('%s', async (type) => {
    const { queryByText } = await openAs(type);
    const offered = queryByText('Attach a photo') !== null;
    expect(offered).toBe(EVENT_TYPES[type].hasPhoto);
    // The section label rides with it on a photoless row: a bare "Photo" heading
    // over nothing is the same beg with the control removed.
    expect(queryByText('Photo') !== null).toBe(EVENT_TYPES[type].hasPhoto);
  });

  it('the four false leaves are the ones the contract names', () => {
    // Pins the population the walk above is walking. The bug report said THREE
    // (cough, sneeze, check_in) and missed meal, which is why the fix is a
    // predicate and not a list — this asserts the set rather than trusting it.
    expect(LEAVES.filter((t) => !EVENT_TYPES[t].hasPhoto).sort())
      .toEqual(['check_in', 'cough', 'meal', 'sneeze']);
  });
});

describe('Saw it / Found it follows confidenceModel, on every leaf', () => {
  it.each(LEAVES)('%s', async (type) => {
    const { queryByText, queryAllByText } = await openAs(type);
    const witnessedByConstruction = EVENT_TYPES[type].confidenceModel === 'witnessed';
    expect(queryByText('Saw it happen') === null).toBe(witnessedByConstruction);
    expect(queryByText('Found it') === null).toBe(witnessedByConstruction);
    // The witnessed leaves are not left without a time control — they get the plain
    // point picker, whose "Change" covers late logging. An affordance that vanished
    // entirely would pass the assertions above and break the screen. queryAll, not
    // query: a meal carries a second "Change" on its food row.
    expect(queryAllByText('Change').length).toBeGreaterThan(0);
  });

  it('the witnessed leaves are the ones the contract names', () => {
    expect(LEAVES.filter((t) => EVENT_TYPES[t].confidenceModel === 'witnessed').sort())
      .toEqual(['check_in', 'cough', 'meal', 'medication', 'sneeze', 'weight_check']);
  });
});

describe('an unknown leaf keeps both offers (§8 degradation)', () => {
  // A future wave's leaf reaching this build has no EVENT_TYPES entry. The contract
  // is degrade-to-generic, never crash and never invent: `?? true` on the photo, and
  // the confidence comparison falling false on undefined.
  it('offers the photo row', async () => {
    const { queryByText } = await openAs('skin_reaction');
    expect(queryByText('Attach a photo')).not.toBeNull();
  });

  it('offers Saw it / Found it', async () => {
    const { queryByText } = await openAs('skin_reaction');
    expect(queryByText('Saw it happen')).not.toBeNull();
  });
});

describe('the gate suppresses the BEG, never the EVIDENCE', () => {
  // The half that is not just a hidden control. `resolveEventPhotoDisplay` renders an
  // EXISTING photo whatever the flag says, so the record screen shows it as the hero
  // — an editor that hid it would be the surface disagreeing with the record. Zero
  // such rows exist in production today (measured: attachments exist only on vomit);
  // this is the behaviour for the rows a future re-key can produce.
  it('a photo on a hasPhoto:false leaf still renders in the editor', async () => {
    mockAttachment.current = { local_uri: 'file:///cough.jpg' };
    const { queryByText } = await openAs('cough');
    expect(queryByText('Photo attached')).not.toBeNull();
    expect(queryByText('Attach a photo')).toBeNull();
  });

  it('but its viewer offers no Replace — seeing it is not a way back to attaching', async () => {
    // The second door: PhotoViewer's Replace reopens the picker. Gating the row and
    // leaving this would have closed the front door and left the side one open.
    mockAttachment.current = { local_uri: 'file:///cough.jpg' };
    const { getByText, queryByText } = await openAs('cough');
    await act(async () => { fireEvent.press(getByText('Photo attached')); });
    expect(queryByText('Replace')).toBeNull();
  });

  it('and a leaf that DOES offer photos keeps Replace', async () => {
    mockAttachment.current = { local_uri: 'file:///vomit.jpg' };
    const { getByText, queryByText } = await openAs('vomit');
    await act(async () => { fireEvent.press(getByText('Photo attached')); });
    expect(queryByText('Replace')).not.toBeNull();
  });
});

describe('closing the door does not rewrite what came through it', () => {
  // The one real hazard in widening the confidence gate retroactively: cough and
  // sneeze rows already exist, and hiding the control must not make the save assert
  // the leaf's new answer over what such a row actually holds. `confidenceTouched`
  // is only set by the control's own handlers, so with no control rendered the save
  // omits the field and `updateEvent` preserves it. Asserted here rather than
  // reasoned about, because the failure would be silent and would land on the vet
  // report as a `seen` on a time nobody claimed to have seen (the B-448 class,
  // arriving from the opposite direction).
  //
  // The fixture is a row production could actually produce: a cough stamped through
  // the editor's own pre-CUL-887 control, which is exactly the population this issue
  // exists because of. (Measured before shipping: zero such rows live. The test is
  // for the un-synced device and the household build behind this one.)
  it('a windowed cough survives a save made with no confidence control on screen', async () => {
    mockStoredTime.current = {
      confidence: 'window',
      earliest: '2026-03-15T02:00:00.000Z',
      latest: '2026-03-15T09:00:00.000Z',
    };
    const { getByText, queryByText } = await openAs('cough');
    expect(queryByText('Saw it happen')).toBeNull();   // the door is shut

    await act(async () => { fireEvent.press(getByText('Save')); });

    expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
    const fields = mockUpdateEvent.mock.calls[0][1] as Record<string, unknown>;
    // Omitted entirely, not passed as witnessed: `updateEvent` preserves on absence,
    // and the key's PRESENCE with any value would be the row being re-graded.
    expect('confidence' in fields).toBe(false);
  });

  it('and the leaf that still has the control can still assert one', async () => {
    // The mirror, so the test above cannot pass by the save being broken for
    // everyone: on an artifact leaf, touching the control does write the claim.
    const { getByText } = await openAs('itch');
    await act(async () => { fireEvent.press(getByText('Found it')); });
    await act(async () => { fireEvent.press(getByText('Save')); });

    const fields = mockUpdateEvent.mock.calls[0][1] as Record<string, unknown>;
    expect(fields.confidence).toMatchObject({ value: 'window' });
  });
});
