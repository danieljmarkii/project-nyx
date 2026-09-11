import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AtTheVetScreen from './at-the-vet';
import type { LocalVetAppointment, VisitQuestion } from '../../lib/vetVisits';

// CUL-902 VV-4 — "At the vet" (mock C1), §7 AC 6's client half.
//
// The model half — that the draft and the tick are on DISK — is
// `lib/vetVisitWrites.test.ts`. What is left here is the wiring an owner in an exam
// room actually depends on: that typing reaches the write at all, that it does so
// without one round trip per keystroke, and that leaving the screen does not strand
// whatever the debounce is still holding.

const mockSaveDraft = jest.fn(async (_id: string, _draft: string) => undefined);
const mockSetAsked = jest.fn(async (_id: string, _q: string, asked: boolean): Promise<VisitQuestion[]> => [
  { id: 'q1', text: 'The overnight pattern', source: 'record', source_ref: null, asked_at: asked ? 'T' : null },
]);
let mockAppointment: LocalVetAppointment | null = null;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => ({ appointment: 'appt-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => true }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));
jest.mock('../../lib/sync', () => ({
  syncPendingVetAppointments: jest.fn(async () => undefined),
}));
jest.mock('../../lib/visitPaperwork', () => ({
  captureVisitPaperwork: jest.fn(async () => ({ groupId: 'group-1', skipped: null })),
  readPaperworkFor: jest.fn(async () => []),
  rememberPaperwork: jest.fn(async () => undefined),
}));

jest.mock('../../lib/vetVisits', () => {
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readAppointment: jest.fn(async () => mockAppointment),
    saveNotesDraft: (id: string, draft: string) => mockSaveDraft(id, draft),
    setQuestionAsked: (id: string, q: string, asked: boolean) => mockSetAsked(id, q, asked),
  };
});

const PET = { id: 'pet-a', name: 'Nyx', species: 'dog' };
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: [PET], activePet: PET }),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

function appointment(over: Partial<LocalVetAppointment> = {}): LocalVetAppointment {
  return {
    id: 'appt-1',
    pet_id: 'pet-a',
    // Built from LOCAL components, never a UTC literal — the CI matrix runs this at
    // UTC+14, UTC+12:45 and UTC−10 (C-29).
    scheduled_at: new Date(2026, 8, 16, 15, 0).toISOString(),
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'recheck',
    notes_draft: null,
    questions: null,
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
    ...over,
  };
}

const QUESTIONS = JSON.stringify([
  { id: 'q1', text: 'The overnight pattern', source: 'record', asked_at: null },
]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSaveDraft.mockImplementation(async () => undefined);
  mockAppointment = appointment();
});

afterEach(() => {
  jest.useRealTimers();
});

const field = () => screen.getByLabelText('Notes from Nyx’s visit');

describe('the draft autosave (AC 6)', () => {
  it('writes what was typed, once the keystrokes settle', async () => {
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    fireEvent.changeText(field(), 'Likely still the food.');
    // Nothing yet: a write per keystroke is forty writes for one sentence.
    expect(mockSaveDraft).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockSaveDraft).toHaveBeenCalledWith('appt-1', 'Likely still the food.');
  });

  it('coalesces a burst into ONE write carrying the LATEST text', async () => {
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    fireEvent.changeText(field(), 'Like');
    fireEvent.changeText(field(), 'Likely');
    fireEvent.changeText(field(), 'Likely still the food.');
    await act(async () => { jest.advanceTimersByTime(1000); });

    // The timer must read the ref, not the text it closed over when it was
    // scheduled — otherwise the row ends up holding a prefix of the sentence.
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveDraft).toHaveBeenCalledWith('appt-1', 'Likely still the food.');
  });

  it('FLUSHES on the way out, so backing out mid-sentence costs nothing', async () => {
    const { unmount } = render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    fireEvent.changeText(field(), 'half a sentence');
    // No timer advance — the debounce is still holding it.
    expect(mockSaveDraft).not.toHaveBeenCalled();

    await act(async () => { unmount(); });
    expect(mockSaveDraft).toHaveBeenCalledWith('appt-1', 'half a sentence');
  });

  it('seeds from the row, and a re-focus never overwrites what has been typed since', async () => {
    mockAppointment = appointment({ notes_draft: 'from the room' });
    const { rerender } = render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(field().props.value).toBe('from the room');

    fireEvent.changeText(field(), 'from the room, plus more');
    await act(async () => {
      rerender(<AtTheVetScreen />);
      jest.advanceTimersByTime(0);
    });
    // The focus effect re-reads the row on every focus, and the row still holds the
    // pre-debounce text. Re-seeding from it would delete the owner's last sentence
    // in front of them.
    expect(field().props.value).toBe('from the room, plus more');
  });

  it('says plainly that the field is saving, rather than flashing a per-keystroke tick', async () => {
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(screen.getByText(/Saved as you type/)).toBeTruthy();
  });
});

describe('the question ticks (AC 6)', () => {
  it('ticks optimistically and reconciles from the write’s own return', async () => {
    mockAppointment = appointment({ questions: QUESTIONS });
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    const row = screen.getByLabelText('The overnight pattern');
    expect(row.props.accessibilityState.checked).toBe(false);

    await act(async () => { fireEvent.press(row); });
    await waitFor(() =>
      expect(screen.getByLabelText('The overnight pattern').props.accessibilityState.checked).toBe(true),
    );
    expect(mockSetAsked).toHaveBeenCalledWith('appt-1', 'q1', true);
  });

  it('ROLLS BACK when the write fails — an optimistic paint over a failed write is a record that lies', async () => {
    mockAppointment = appointment({ questions: QUESTIONS });
    mockSetAsked.mockRejectedValueOnce(new Error('no row'));
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    await act(async () => { fireEvent.press(screen.getByLabelText('The overnight pattern')); });
    await waitFor(() =>
      expect(screen.getByLabelText('The overnight pattern').props.accessibilityState.checked).toBe(false),
    );
  });

  it('renders no questions section at all when none were prepared', async () => {
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });
    // Not an empty list with a heading: a section that exists only to say it is empty
    // is chrome in a room where the owner is holding an animal.
    expect(screen.queryByText('Your questions')).toBeNull();
  });
});

describe('the paperwork door', () => {
  it('captures under the APPOINTMENT’s pet, and remembers the group for the save', async () => {
    render(<AtTheVetScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Photograph the paperwork for Nyx'));
    });

    const { captureVisitPaperwork, rememberPaperwork } = jest.requireMock('../../lib/visitPaperwork');
    await waitFor(() => expect(captureVisitPaperwork).toHaveBeenCalledWith('pet-a'));
    // The pointer is what lets the D1 save link a photo taken before the visit row
    // existed. Losing it costs the link, never the document.
    await waitFor(() => expect(rememberPaperwork).toHaveBeenCalledWith('appt-1', 'group-1'));
  });
});
