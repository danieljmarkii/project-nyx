// CUL-869 / N-3 — the editor's `check_in` branch.
//
// Three claims, and the first is the one E-7 is about: the editor's shipped Notes
// field is TYPE-BLIND — `isWeight` / `isMedication` gate the confidence control, not
// Notes, and Notes has always rendered for every type. A look's note has to land on
// `looks.notes`, because Ask's recall fetch selects `events.notes` with no type
// filter and the server's events_check_in_notes_null CHECK would refuse the row
// anyway. So the gate is new, and it is asserted here as well as scanned by
// `guards/lookNotes.test.ts` — the guard proves the branch EXISTS in the source, this
// proves it BEHAVES.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' } }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ upsert: jest.fn() }) } }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(), compressForUpload: jest.fn(), persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../lib/attachments', () => ({ detachOtherEventAttachments: jest.fn() }));
// A drivable picker: pressing it hands the screen a NEW point, which is the only
// way to exercise the "did the point actually move?" gate the way the owner does.
const mockMovedTo = { current: null as Date | null };
jest.mock('@react-native-community/datetimepicker', () => {
  const react = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: unknown, d?: Date) => void }) =>
      react.createElement(
        Pressable,
        { onPress: () => onChange({}, mockMovedTo.current ?? undefined) },
        react.createElement(Text, null, 'move-the-point'),
      ),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const mockSyncPendingLooks = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
  syncPendingWeightChecks: jest.fn().mockResolvedValue(undefined),
  syncPendingMedicationAdministrations: jest.fn().mockResolvedValue(undefined),
  syncPendingLooks: () => mockSyncPendingLooks(),
}));

const mockUpdateEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  updateEvent: (...a: unknown[]) => mockUpdateEvent(...a),
  updateMealFood: jest.fn(), updateMealIntake: jest.fn(),
  getMealForEvent: jest.fn().mockResolvedValue(null),
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

const mockGetLookForEvent = jest.fn();
const mockUpdateLookForEdit = jest.fn().mockResolvedValue(true);
jest.mock('../lib/looks', () => {
  const actual = jest.requireActual('../lib/looks');
  return {
    localDayForLook: actual.localDayForLook,   // the REAL day derivation
    getLookForEvent: (...a: unknown[]) => mockGetLookForEvent(...a),
    updateLookForEdit: (...a: unknown[]) => mockUpdateLookForEdit(...a),
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
  const pets = [
    { id: 'pet-dog', name: 'Mochi', species: 'dog', sex: 'male' },
    { id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' },
  ];
  const state = { pets, activePet: pets[1], updatePet: jest.fn() }; // the CAT is active
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { Alert } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import EditEventModal from './edit-event';
import { LOOK_NOTE_CUE } from '../components/event/LookRecordSection';
import { localDayForLook as realLocalDayForLook } from '../lib/looks';

const AT = '2026-03-15T09:58:00.000Z';

function look(over: Partial<{ words: string[]; notes: string | null; outcome: string }> = {}) {
  return {
    id: 'look-1',
    petId: 'pet-dog',
    outcome: over.outcome ?? 'observed',
    localDay: '2026-03-15',
    words: over.words ?? ['subdued'],
    notes: over.notes ?? null,
  };
}

let alertSpy: jest.SpyInstance;
afterEach(() => alertSpy?.mockRestore());

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockMovedTo.current = null;
  mockRouteParams = { id: 'evt-1', type: 'check_in', occurredAt: AT, notes: '' };
  mockGetLookForEvent.mockResolvedValue(look());
});

/** Rendered, with the async child load settled. */
async function open() {
  const utils = render(<EditEventModal />);
  await waitFor(() => expect(mockGetLookForEvent).toHaveBeenCalled());
  await act(async () => {});
  return utils;
}

describe('the parent Notes field is gated off for a look (E-7, T-22)', () => {
  it('renders no "Notes" section on a check_in', async () => {
    const { queryByText } = await open();
    expect(queryByText('Notes')).toBeNull();
    expect(queryByText('Add a note (optional)')).toBeNull();
  });

  it('still renders it for every other type — the gate is a branch, not a removal', async () => {
    mockRouteParams = { id: 'evt-1', type: 'vomit', occurredAt: AT, notes: '' };
    const { getByText } = render(<EditEventModal />);
    await waitFor(() => expect(getByText('Notes')).toBeTruthy());
  });

  it('writes NULL to the parent’s notes on save, whatever the route param says', async () => {
    // Belt to the server CHECK. The record screen passes `event.notes ?? ''`, which is
    // always '' for a look — but a route reached with a stale value must not be able
    // to push a row the server will reject forever.
    mockRouteParams = { id: 'evt-1', type: 'check_in', occurredAt: AT, notes: 'a stale parent note' };
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect(mockUpdateEvent).toHaveBeenCalledWith('evt-1', expect.objectContaining({ notes: null }));
  });
});

describe('the look’s own note goes to the child', () => {
  it('renders its own field, with the cue saying where it goes', async () => {
    const { getByText, getAllByLabelText } = await open();
    expect(getByText('Note')).toBeTruthy();
    expect(getByText(LOOK_NOTE_CUE)).toBeTruthy();
    expect(getAllByLabelText('Note').length).toBeGreaterThan(0);
  });

  it('saves it through updateLookForEdit, trimmed', async () => {
    const { getByText, getByLabelText } = await open();
    fireEvent.changeText(getByLabelText('Note'), '  he hung back at the corner  ');
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect(mockUpdateLookForEdit).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ notes: 'he hung back at the corner' }),
    );
  });
});

describe('the words', () => {
  it('offers the record pet’s vocabulary — not the active pet’s (C-9)', async () => {
    // The CAT is active; the record is the DOG's. "Didn’t want the walk" is a dog word
    // and does not exist in the cat list, so its presence is the assertion.
    const { getByText } = await open();
    expect(getByText(/Didn’t want the walk, hung back/)).toBeTruthy();
  });

  it('shows the full label — head word AND gloss (§4.1 rule 12)', async () => {
    const { getByText } = await open();
    expect(getByText('Off, not getting up for the things he usually does')).toBeTruthy();
  });

  it('applies the energy poles: choosing Lively clears Off (T-14)', async () => {
    const { getByText } = await open();
    fireEvent.press(getByText('Lively, bouncy, more play than usual'));
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect(mockUpdateLookForEdit).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ words: ['lively'] }),
    );
  });

  it('an absence row draws no grid, and SAYS why (P5)', async () => {
    // T-14: something seen later is a second observation with its own hour, not a
    // correction of this row. Without the sentence the screen is Time / Note and
    // nothing else, which an owner reads as the app having lost her answer.
    mockGetLookForEvent.mockResolvedValue(look({ outcome: 'nothing_unusual', words: [] }));
    const { getByText, queryByText } = await open();
    expect(queryByText(/Lively, bouncy/)).toBeNull();
    expect(getByText(/Something you see later is its own entry/)).toBeTruthy();
  });

  it('groups the words under family labels in the owner’s words (§3.1a)', () => {
    // ~29 chips shaped "head word, gloss" with nothing naming the groups reads as an
    // unsorted wall whatever order it is in — the failure T-21 was written for.
    return open().then(({ getByText }) => {
      // The STRING, not the rendered case: `textTransform` is a style and the label
      // an assistive reader announces is the one written here.
      expect(getByText('Energy')).toBeTruthy();
      expect(getByText('With you')).toBeTruthy();     // never the 'Company' key
      expect(getByText('What he did')).toBeTruthy();  // follows the RECORD's pet
    });
  });

  it('refuses to save a look with no words left, and names the way out', async () => {
    // The create path already forbids this (`insertLook` throws). The edit path was
    // letting the words go to zero on a row whose outcome stays 'observed' — a day
    // still counted as ANSWERED, with nothing in it to show.
    const { getByText } = await open();
    fireEvent.press(getByText('Off, not getting up for the things he usually does'));
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect(mockUpdateLookForEdit).not.toHaveBeenCalled();
    expect(mockUpdateEvent).not.toHaveBeenCalled();   // and the TIME did not half-save
    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls.at(-1)?.[1])).toContain('use Remove');
  });
});

describe('"Change time" and the day key (C-10, T-19)', () => {
  it('does NOT re-derive local_day when the point never moved', async () => {
    // A peek-and-save is a real gesture that changed nothing. Re-deriving on every
    // save would move an owner's answered day the first time she opened a record in
    // another timezone — silently, on the column every count is keyed to.
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });

    const edit = mockUpdateLookForEdit.mock.calls[0][1] as Record<string, unknown>;
    expect('localDay' in edit).toBe(false);
  });

  it('re-derives it when the point DID move — and the new day is the one it lands on', async () => {
    // 09:58Z on the 15th → 10:03Z, which is the SAME UTC day. The device zone decides
    // the key, so what this asserts is only that the screen re-derives through
    // `localDayForLook` (the real one, unmocked here) rather than reusing the stored
    // key or inventing a UTC date. The cross-midnight arithmetic itself is pinned
    // against explicit zones in lib/looks.edit.test.ts (C-29).
    const moved = new Date('2026-03-15T10:03:00.000Z');
    mockMovedTo.current = moved;

    const { getByText } = await open();
    fireEvent.press(getByText('Change'));           // opens the picker
    await act(async () => { fireEvent.press(getByText('move-the-point')); });
    await act(async () => { fireEvent.press(getByText('Save')); });

    const edit = mockUpdateLookForEdit.mock.calls[0][1] as { localDay?: string };
    expect(edit.localDay).toBe(realLocalDayForLook(moved));
    // …and the parent got the moved point, so the two halves of the record agree.
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ occurred_at: moved.toISOString() }),
    );
  });

  it('a SYNCED row’s param spelling is not a change — instants, never strings', async () => {
    // The regression this test exists for. `occurredAtParam` is `events.occurred_at`
    // verbatim out of local SQLite, and a row that has been through one sync
    // round-trip holds whatever PostgREST serialised — `…+00:00`, not `…000Z`
    // (lib/sync.ts writes the server value with no normalisation). Same instant,
    // different string.
    //
    // Compared with `!==`, this reports "the point moved" on EVERY save of any
    // previously-synced look, re-deriving `local_day` against whatever zone the
    // device is in now — the exact silent day-move the gate exists to prevent, on
    // the one column every count in this feature is keyed to (T-19).
    mockRouteParams = {
      id: 'evt-1',
      type: 'check_in',
      occurredAt: '2026-03-15T09:58:00+00:00',   // the shape a pulled row carries
      notes: '',
    };
    // The form seeds its point from the param, so a save with no picker interaction
    // writes the same INSTANT back in canonical spelling.
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect('localDay' in (mockUpdateLookForEdit.mock.calls[0][1] as object)).toBe(false);
  });

  it('a picker OPENED and dismissed without a change re-derives nothing', async () => {
    // C-10's peek-and-save, exactly: the owner taps Change, looks, and saves. The
    // day key must not move, and the row must not re-queue.
    mockMovedTo.current = new Date('2026-03-15T09:58:00.000Z'); // the SAME instant
    const { getByText } = await open();
    fireEvent.press(getByText('Change'));
    await act(async () => { fireEvent.press(getByText('move-the-point')); });
    await act(async () => { fireEvent.press(getByText('Save')); });

    expect('localDay' in (mockUpdateLookForEdit.mock.calls[0][1] as object)).toBe(false);
  });
});

describe('the photo row', () => {
  it('is not offered on a look — `check_in` is hasPhoto: false (§5.2)', async () => {
    // A photo attached here would render as the record's hero regardless of the flag,
    // so the door has to be closed rather than the render gated.
    const { queryByText } = await open();
    expect(queryByText('Photo')).toBeNull();
    expect(queryByText('Attach a photo')).toBeNull();
  });

  it('is still offered on a symptom — the gate is a branch, not a removal', async () => {
    mockRouteParams = { id: 'evt-1', type: 'vomit', occurredAt: AT, notes: '' };
    const { findByText } = render(<EditEventModal />);
    expect(await findByText('Attach a photo')).toBeTruthy();
  });
});

describe('the time control', () => {
  it('offers no Saw it / Found it on a look — witnessed by construction (§5.4)', async () => {
    const { queryByText } = await open();
    expect(queryByText('Saw it happen')).toBeNull();
    expect(queryByText('Found it')).toBeNull();
  });

  it('still offers it on a symptom — the gate is a branch, not a removal', async () => {
    mockRouteParams = { id: 'evt-1', type: 'vomit', occurredAt: AT, notes: '' };
    const { findByText } = render(<EditEventModal />);
    expect(await findByText('Saw it happen')).toBeTruthy();
  });
});

describe('the ordered push', () => {
  it('pushes the look AFTER the parent event', async () => {
    const { getByText } = await open();
    await act(async () => { fireEvent.press(getByText('Save')); });
    await act(async () => {});
    expect(mockSyncPendingLooks).toHaveBeenCalled();
  });
});

describe('a child that has not loaded', () => {
  it('never hands the helper the empty form — the words are not erased (the B-448 shape)', async () => {
    // A Save that beats the async load must not write `words: []` over a real row.
    mockGetLookForEvent.mockReturnValue(new Promise(() => {})); // never resolves
    const { getByText } = render(<EditEventModal />);
    await act(async () => { fireEvent.press(getByText('Save')); });

    const edit = mockUpdateLookForEdit.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(edit && 'words' in edit).toBeFalsy();
    expect(edit && 'notes' in edit).toBeFalsy();
  });

  it('renders no note field either — a control that writes nowhere is worse than none', async () => {
    mockGetLookForEvent.mockReturnValue(new Promise(() => {}));
    const { queryByText } = render(<EditEventModal />);
    expect(queryByText(LOOK_NOTE_CUE)).toBeNull();
  });
});
