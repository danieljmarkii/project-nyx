// CUL-1909 — the event editor as the record in edit mode (the round's S1 B, P1 to P9).
//
// The ruled frames: whose record it is, named off the record's own pet (P2); the type's
// facts in the record's order (P1, P9); Remove at the foot through the one confirm and
// the one reversal (P4, P5); a new photo's read said before Save (P7); a failed save
// said in the form with the values kept, and offline saying nothing but a waiting photo
// (P8). P6 (Save waits on the reads) is pinned in `editEvent.intake.test.tsx`.
//
// Harness: `editEvent.photoGate.test.tsx`'s, with the reversal, the haptic and the
// network flag stubbed.

const mockRemoveFromToday = jest.fn();
const mockReverse = jest.fn();
jest.mock('../lib/undoLog', () => ({ reverseLoggedEvent: (...a: unknown[]) => mockReverse(...a) }));
const mockDestructiveConfirm = jest.fn();
jest.mock('../lib/haptics', () => ({ destructiveConfirm: () => mockDestructiveConfirm() }));
let mockOnline = true;
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => mockOnline }));
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
const mockDismiss = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), dismiss: (...a: unknown[]) => mockDismiss(...a) },
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('../store/eventStore', () => {
  const state = { patchInToday: jest.fn(), removeFromToday: (...a: unknown[]) => mockRemoveFromToday(...a) };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
jest.mock('../store/petStore', () => {
  // Two pets: the record is Pixel's (the db stub's pet_id), and Biscuit is the active one.
  const pets = [{ id: 'pet-dog', name: 'Biscuit', species: 'dog', sex: 'male' }, { id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' }];
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
import { EVENT_TYPES } from '../constants/eventTypes';
import { PhotoViewer } from '../components/ui';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import EditEventModal from './edit-event';

jest.setTimeout(30000);

const AT = '2026-10-08T07:30:00.000Z';
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockLiveFiles.clear();
  mockGetEventAttachments.mockResolvedValue([]);
  mockReverse.mockResolvedValue(undefined);
  (jest.requireMock('../lib/looks') as { getLookForEvent: jest.Mock }).getLookForEvent.mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function open(type: string, notes = '') {
  mockRouteParams = { id: 'evt-1', type, occurredAt: AT, notes };
  const utils = render(<EditEventModal />);
  await waitFor(() => expect(utils.queryByTestId('edit-remove')).not.toBeNull());
  return utils;
}

/** The cards, top to bottom, by their testIDs. */
function cardOrder(utils: ReturnType<typeof render>): string[] {
  type Node = { props: { testID?: unknown }; type: unknown };
  const ids = utils.UNSAFE_root
    .findAll((n: Node) => typeof n.props.testID === 'string' && n.props.testID.startsWith('edit-card-') && typeof n.type !== 'string')
    .map((n: Node) => n.props.testID as string);
  return ids.filter((t: string, i: number) => ids.indexOf(t) === i);
}

describe('whose record, and its name (P2)', () => {
  it('names the RECORD’s pet, not the active one, and the type in lower case', async () => {
    const utils = await open('diarrhea');
    expect(utils.getByText('Pixel’s record')).toBeTruthy();
    expect(utils.queryByText('Biscuit’s record')).toBeNull();
    expect(utils.getByText('Edit loose stool')).toBeTruthy();
  });

  it('a look reads as what you noticed', async () => {
    const utils = await open('check_in');
    expect(utils.getByText('Edit what you noticed')).toBeTruthy();
    expect(utils.getByText('Remove what you noticed')).toBeTruthy();
  });
});

describe('the type, as a word an owner would say', () => {
  it.each([['other', 'Edit entry', 'Remove this entry'], ['itch', 'Edit itch', 'Remove this itch'], ['diarrhea', 'Edit loose stool', 'Remove this loose stool']])(
    '%s reads as "%s"', async (type, title, remove) => {
      const utils = await open(type);
      expect(utils.getByText(title)).toBeTruthy();
      expect(utils.getByText(remove)).toBeTruthy();
    },
  );
});

describe('Remove never races a save', () => {
  it('is held while Save is writing', async () => {
    const db = jest.requireMock('../lib/db') as { updateEvent: jest.Mock };
    let finish: () => void = () => {};
    db.updateEvent.mockReturnValueOnce(new Promise<void>((r) => { finish = r; }));
    const utils = await open('vomit');
    await act(async () => { fireEvent.press(utils.getByText('Save')); });
    await act(async () => { fireEvent.press(utils.getByTestId('edit-remove')); });
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => { finish(); });
  });
});

describe('the record’s order (P1, P9)', () => {
  it('a symptom: time, photo, note', async () => {
    expect(cardOrder(await open('vomit'))).toEqual(['edit-card-time', 'edit-card-photo', 'edit-card-note']);
  });

  it('a cough: no photo (CUL-887), so time then note', async () => {
    expect(cardOrder(await open('cough'))).toEqual(['edit-card-time', 'edit-card-note']);
  });

  it('a weigh-in leads with its value', async () => {
    expect(cardOrder(await open('weight_check'))).toEqual(['edit-card-facts', 'edit-card-time', 'edit-card-photo', 'edit-card-note']);
  });

  it('Other leads with its note, under the log form’s question, then photo, then time', async () => {
    const utils = await open('other');
    expect(cardOrder(utils)).toEqual(['edit-card-note', 'edit-card-photo', 'edit-card-time']);
    expect(utils.getByText('What did you notice?')).toBeTruthy();
  });
});

describe('a new photo’s read, said before Save (P7)', () => {
  it.each(['vomit', 'diarrhea', 'stool_normal'])('%s says it', async (type) => {
    expect((await open(type)).getByText('A new photo gets a new read.')).toBeTruthy();
  });

  it.each(['other', 'lethargy', 'medication'])('%s, which takes no read, does not', async (type) => {
    expect((await open(type)).queryByText('A new photo gets a new read.')).toBeNull();
  });
});

describe('Remove at the foot (P4, P5)', () => {
  async function pressRemove(utils: ReturnType<typeof render>) {
    await act(async () => { fireEvent.press(utils.getByTestId('edit-remove')); });
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    return alertSpy.mock.calls[0] as [string, string, { text: string; onPress?: () => Promise<void> }[]];
  }

  it('asks once, naming the record’s pet, its type, its time and what goes with it', async () => {
    mockLiveFiles.add('file:///docs/att.jpg');
    mockGetEventAttachments.mockResolvedValue([{ id: 'att', local_uri: 'file:///docs/att.jpg', storage_path: 'p/e/att.jpg', mime_type: 'image/jpeg' }]);
    const utils = await open('vomit', 'Grass first');
    expect(utils.getByText('Remove this vomit')).toBeTruthy();
    const [title, body] = await pressRemove(utils);
    expect(title).toBe('Remove this vomit?');
    expect(body).toMatch(/^Pixel’s vomit from .+ leaves the history\. The photo you attached and the note you wrote go with it\.$/);
    // Nothing is removed by the row itself; the confirm is the act (C-21).
    expect(mockReverse).not.toHaveBeenCalled();
    expect(mockDestructiveConfirm).not.toHaveBeenCalled();
  });

  it('asks the record for its photo at the tap, not the state (CUL-825)', async () => {
    mockGetEventAttachments.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'late', local_uri: '', storage_path: 'p/e/late.jpg', mime_type: 'image/jpeg' }]);
    const utils = await open('vomit');
    const [, body] = await pressRemove(utils);
    expect(body).toContain('The photo you attached goes with it.');
  });

  it('a photo that could not be checked is said, hedged, never left out', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetEventAttachments.mockRejectedValue(new Error('db closed'));
    const utils = await open('vomit');
    const [, body] = await pressRemove(utils);
    expect(body).toMatch(/leaves the history\. Any photo on it goes with it\.$/);
    quiet.mockRestore();
    warn.mockRestore();
  });

  it('the confirm soft deletes through the one reversal, and closes the editor and the record together', async () => {
    const utils = await open('vomit');
    const [, , buttons] = await pressRemove(utils);
    await act(async () => { await buttons.find((b) => b.text === 'Remove')?.onPress?.(); });
    expect(mockDestructiveConfirm).toHaveBeenCalledTimes(1);
    expect(mockReverse).toHaveBeenCalledWith('evt-1');
    expect(mockRemoveFromToday).toHaveBeenCalledWith('evt-1');
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  it('a failed removal says so and leaves the screen up', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReverse.mockRejectedValue(new Error('db closed'));
    const utils = await open('vomit');
    const [, , buttons] = await pressRemove(utils);
    await act(async () => { await buttons.find((b) => b.text === 'Remove')?.onPress?.(); });
    expect(alertSpy).toHaveBeenLastCalledWith('Could not remove', 'Try again.');
    expect(mockDismiss).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});

describe('a failed save, and offline (P8)', () => {
  it('a failed save is a quiet band in the form, the values kept, no alert', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const db = jest.requireMock('../lib/db') as { updateEvent: jest.Mock };
    db.updateEvent.mockRejectedValueOnce(new Error('disk full'));
    const utils = await open('vomit');
    fireEvent.changeText(utils.getByLabelText('Note'), 'Brought up breakfast');
    await act(async () => { fireEvent.press(utils.getByText('Save')); });
    expect(utils.getByText('Couldn’t save. Your changes are still here.')).toBeTruthy();
    expect(utils.getByDisplayValue('Brought up breakfast')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('offline says nothing, until a new photo is waiting to upload', async () => {
    mockOnline = false;
    alertSpy.mockImplementation((title, _m, buttons) => {
      if (title === 'Attach photo') buttons?.find((b: { text?: string }) => b.text === 'Choose from library')?.onPress?.();
    });
    const utils = await open('vomit');
    const WAIT = 'The photo uploads when you’re back online. Everything else saves now.';
    expect(utils.queryByText(WAIT)).toBeNull();
    await act(async () => { fireEvent.press(utils.getByTestId('edit-photo-offer')); });
    await waitFor(() => expect(utils.getByText(WAIT)).toBeTruthy());
  });
});
