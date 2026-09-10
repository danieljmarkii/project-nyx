// CUL-869 / N-3 — the look's RECORD screen: the words, the note editor, and the
// Remove confirm that names the note.
//
// Same harness shape as weightSection.test.tsx (the mocks are the whole module
// graph, so the test is about the section and not about the 1,300-line screen), with
// two additions this section needs: `lib/looks` for the note write, and a pet store
// carrying a species and a sex, because those are what the words resolve against.

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: jest.fn(), compressForUpload: jest.fn(),
  persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../../lib/attachments', () => ({ detachEventAttachment: jest.fn(), detachOtherEventAttachments: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingMeals: jest.fn(), syncPendingMedicationAdministrations: jest.fn(),
  syncPendingLooks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: jest.fn(() => ({ settle: jest.fn() })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
}));
const mockDestructiveConfirm = jest.fn();
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: () => mockDestructiveConfirm() }));
jest.mock('../../components/event/VomitAnalysisSection', () => ({ VomitAnalysisSection: () => null }));
jest.mock('../../components/event/StoolAnalysisSection', () => ({ StoolAnalysisSection: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'evt-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
  };
});

const mockGetEventById = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: jest.fn().mockResolvedValue(null),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
  updateMealIntake: jest.fn(), updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
}));

const mockUpdateLookNote = jest.fn().mockResolvedValue(true);
jest.mock('../../lib/looks', () => ({
  updateLookNote: (...a: unknown[]) => mockUpdateLookNote(...a),
}));

jest.mock('../../store/eventStore', () => {
  const state = { removeFromToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
// A DOG, male — so `subdued` reads the dog gloss and the opening chip reads
// *Not himself*. The screen must take both from the RECORD's pet (C-9).
jest.mock('../../store/petStore', () => {
  const pets = [{ id: 'pet-A', name: 'Mochi', species: 'dog', sex: 'male' }];
  const state = { pets, activePet: pets[0] };
  return {
    usePetStore: Object.assign(() => state, { getState: () => state }),
    resolveRecordPetName: () => 'Mochi',
  };
});

import { Alert } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import EventDetailScreen from './[id]';
import { wordsToLocalText } from '../../lib/lookWordsCodec';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { LOOK_NOTE_CUE, LOOK_ABSENCE_LINE, LOOK_UNRESOLVED_LINE } from '../../components/event/LookRecordSection';

const baseRow = {
  id: 'evt-1', pet_id: 'pet-A', occurred_at: new Date(2026, 5, 12, 7, 12).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null,
  created_at: '', updated_at: '', food_item_id: null, quantity: null, intake_rating: null,
  food_brand: null, food_product_name: null, food_type: null, food_format: null,
  weight_kg: null,
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null,
  drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null,
  look_outcome: null as string | null, look_words: null as string | null, look_note: null as string | null,
};

const observed = {
  ...baseRow,
  event_type: 'check_in',
  look_outcome: 'observed',
  look_words: wordsToLocalText(['subdued', 'walk_refused']),
};

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** Fire the nth button of the last Alert (0 = Cancel, 1 = the destructive one). */
function pressAlertButton(index: number) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { onPress?: () => void }[] | undefined;
  act(() => { buttons?.[index]?.onPress?.(); });
}
const alertBody = () => String(alertSpy.mock.calls.at(-1)?.[1] ?? '');

describe('the words', () => {
  it('renders each head word with its gloss, in the record pet’s own copy', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText } = render(<EventDetailScreen />);

    await waitFor(() => expect(getByText('Off')).toBeTruthy());
    // The DOG gloss, not the cat's — resolved against the record's pet.
    expect(getByText('not getting up for the things he usually does')).toBeTruthy();
    expect(getByText('Didn’t want the walk')).toBeTruthy();
    expect(getByText('hung back, lay down, turned for home')).toBeTruthy();
  });

  it('names whose record it is', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText("Mochi's record")).toBeTruthy());
  });

  it('an absence renders the owner’s claim — never a good day (§5.6)', async () => {
    mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'check_in', look_outcome: 'nothing_unusual' });
    const { getByText, queryByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText(LOOK_ABSENCE_LINE)).toBeTruthy());
    expect(queryByText(/good day|all good|doing well|healthy|fine/i)).toBeNull();
  });

  it('a check_in with no child says so, and never falls through to the absence', async () => {
    // Two claims. The safety one: a missing child must not produce "nothing unusual".
    // The Principle-5 one: a blank screen is indistinguishable from a failed save, so
    // the honest line is the designed state.
    mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'check_in' });
    const { getByText, queryByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText(LOOK_UNRESOLVED_LINE)).toBeTruthy());
    expect(queryByText(LOOK_ABSENCE_LINE)).toBeNull();
    // …and no note editor — there is no row to write one to, and a control that
    // writes nowhere is worse than none (C-7).
    expect(queryByText('Add a note')).toBeNull();
  });

  it('the absence is typeset QUIET — sans, secondary ink, a size down (T-15 / L-16)', async () => {
    // The safety-critical styling call. This screen is the artifact an owner turns
    // around to show a vet, and on an absence look this line is the only thing on it —
    // so the display face would give the feature's most reassuring string the app's
    // own headline register. History already renders it quiet; the record must agree.
    mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'check_in', look_outcome: 'nothing_unusual' });
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText(LOOK_ABSENCE_LINE)).toBeTruthy());

    const flat = StyleSheet.flatten(getByText(LOOK_ABSENCE_LINE).props.style);
    expect(flat.fontFamily).not.toBe('Newsreader');
    expect(flat.color).toBe(theme.colorTextSecondary);
    expect(flat.fontSize).toBeLessThan(theme.textLG);
  });

  it('…while an observed word KEEPS the serif — the contrast is the point', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('Off')).toBeTruthy());
    expect(StyleSheet.flatten(getByText('Off').props.style).fontFamily).toBe('Newsreader');
  });

  it('renders nothing of this on a non-look row', async () => {
    mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'vomit' });
    const { queryByText, findAllByText } = render(<EventDetailScreen />);
    expect((await findAllByText(/Jun/)).length).toBeGreaterThan(0);
    expect(queryByText('Add a note')).toBeNull();
    expect(queryByText(LOOK_NOTE_CUE)).toBeNull();
  });
});

describe('the note (T-22)', () => {
  it('offers the field on a look with no note, and says where it goes', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('Add a note')).toBeTruthy());
    expect(getByText(LOOK_NOTE_CUE)).toBeTruthy();
  });

  it('writes a typed note to the CHILD', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText, getByLabelText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('Add a note')).toBeTruthy());

    fireEvent.press(getByText('Add a note'));
    fireEvent.changeText(getByLabelText('Note'), '  he hung back at the corner  ');
    await act(async () => { fireEvent.press(getByText('Save')); });

    // Trimmed, and through the one note-writing helper.
    expect(mockUpdateLookNote).toHaveBeenCalledWith('evt-1', 'he hung back at the corner');
  });

  it('shows an existing note IN QUOTES, with Edit and Remove (T-22)', async () => {
    mockGetEventById.mockResolvedValue({ ...observed, look_note: 'he hung back at the corner' });
    const { getByText, getAllByText } = render(<EventDetailScreen />);
    // Quoted: the marks are what say the words are HERS rather than the app's — the
    // same job the ❞ does on the collapsed row and the report's Appendix G.
    await waitFor(() => expect(getByText('“he hung back at the corner”')).toBeTruthy());
    // Two of each on screen: the note's pair, and the screen footer's. The note's
    // are the EXTRA ones — a note-less look shows one of each — which is the claim.
    expect(getAllByText('Edit')).toHaveLength(2);
    expect(getAllByText('Remove')).toHaveLength(2);
  });

  it('removing the note CONFIRMS, and says what survives (C-21)', async () => {
    mockGetEventById.mockResolvedValue({ ...observed, look_note: 'he hung back at the corner' });
    const { getByText, getAllByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('“he hung back at the corner”')).toBeTruthy());

    // The note's own Remove is the first of the two on screen (the screen's footer
    // Remove is the other); both open a confirm, so identify by the body.
    fireEvent.press(getAllByText('Remove')[0]);
    expect(alertSpy).toHaveBeenCalled();
    expect(alertBody()).toContain('What you noticed stays.');

    expect(mockUpdateLookNote).not.toHaveBeenCalled(); // nothing written until confirmed
    expect(mockDestructiveConfirm).not.toHaveBeenCalled(); // and no haptic yet either
    await act(async () => { pressAlertButton(1); });
    expect(mockUpdateLookNote).toHaveBeenCalledWith('evt-1', null);
    // CUL-604 §5.6 — the rigid tap lands on the CONFIRM, not on the control that
    // opened the dialog: a haptic beside a live Cancel would say something was
    // destroyed while the owner could still back out.
    expect(mockDestructiveConfirm).toHaveBeenCalledTimes(1);
  });

  it('an in-flight save says WHY its controls are unavailable (C-7)', async () => {
    // `disabled` is an accessibility CLAIM: RN copies it into accessibilityState and
    // VoiceOver announces "dimmed". A dimmed control with no reason tells a
    // screen-reader user the app is broken rather than busy.
    let release: (v: boolean) => void = () => {};
    mockUpdateLookNote.mockReturnValueOnce(new Promise<boolean>((r) => { release = r; }));

    mockGetEventById.mockResolvedValue(observed);
    const { getByText, getByLabelText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('Add a note')).toBeTruthy());
    fireEvent.press(getByText('Add a note'));
    fireEvent.changeText(getByLabelText('Note'), 'he hung back');

    await act(async () => { fireEvent.press(getByText('Save')); });
    const busy = getByLabelText('Saving your note');
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true });
    expect(getByLabelText('Cancel — saving your note')).toBeTruthy();

    await act(async () => { release(true); });
  });

  it('cancelling the note removal writes nothing', async () => {
    mockGetEventById.mockResolvedValue({ ...observed, look_note: 'he hung back at the corner' });
    const { getByText, getAllByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('“he hung back at the corner”')).toBeTruthy());
    fireEvent.press(getAllByText('Remove')[0]);
    await act(async () => { pressAlertButton(0); });
    expect(mockUpdateLookNote).not.toHaveBeenCalled();
    expect(mockDestructiveConfirm).not.toHaveBeenCalled();
  });
});

describe('Remove — the whole look', () => {
  it('names the note when the look carries one', async () => {
    mockGetEventById.mockResolvedValue({ ...observed, look_note: 'he hung back at the corner' });
    const { getByText, getAllByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('“he hung back at the corner”')).toBeTruthy());

    // The footer's Remove is the LAST one on screen.
    const removes = getAllByText('Remove');
    await act(async () => { fireEvent.press(removes[removes.length - 1]); });
    expect(alertBody()).toContain('The note you wrote will be removed with it.');
  });

  it('says nothing about a note when there is none — never warn about one that is not there', async () => {
    mockGetEventById.mockResolvedValue(observed);
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText('Off')).toBeTruthy());

    await act(async () => { fireEvent.press(getByText('Remove')); });
    // "the Noticed" — the template was written for noun labels and `check_in` is the
    // first type without one. Fixed by naming the SUBJECT per type, not by rewording
    // the sentence, so every other type's confirm is byte-identical.
    expect(alertBody()).toBe('This will remove what you noticed from history.');
  });

  it('every other type keeps the sentence it has always had', async () => {
    mockGetEventById.mockResolvedValue({ ...baseRow, event_type: 'vomit' });
    const { findAllByText, getByText } = render(<EventDetailScreen />);
    expect((await findAllByText(/Jun/)).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.press(getByText('Remove')); });
    expect(alertBody()).toBe('This will remove the Vomit from history.');
  });
});
