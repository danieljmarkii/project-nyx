// B-157 (CUL-284) — the §6.4 double-dose note, rendered on the medication completion
// card at log time.
//
// The detector is lib/medications.test.ts's job (detectDoubleDose, the window math,
// the copy string); the hand-off is store/momentStore.test.ts's (the eventId + visible
// guards, the dwell extension). What ONLY a rendered card can answer, and what this
// suite owns:
//   • the note actually DRAWS — the whole of CUL-284 is that a correct detector had no
//     surface here, so a card that quietly forgets to render it is the same bug back;
//   • it CLEARS when the owner downgrades off 'given' — a note left standing over a
//     dose the owner just marked missed is a false claim about the record;
//   • it never co-renders with the in-doubt prompt, and there is no all-clear state.

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMedicationAdministrations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockUpdateDoseAdherence = jest.fn().mockResolvedValue(undefined);
const mockGetDoubleDoseFlag = jest.fn();
jest.mock('../../lib/db', () => ({
  updateEvent: jest.fn().mockResolvedValue(undefined),
  updateDoseAdherence: (...a: unknown[]) => mockUpdateDoseAdherence(...a),
  updateDoseHowGiven: jest.fn().mockResolvedValue(undefined),
  getDoubleDoseFlag: (...a: unknown[]) => mockGetDoubleDoseFlag(...a),
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { MedicationCompletionCard } from './MedicationCompletionCard';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { useMomentStore } from '../../store/momentStore';
import { updateEvent } from '../../lib/db';
import { usePetStore } from '../../store/petStore';

const CONFLICT = { conflict: true, otherEventId: 'm0', gapMinutes: 95 };
const NO_CONFLICT = { conflict: false, otherEventId: null, gapMinutes: null };

// The exact string doubleDoseNote() builds for a 95-minute gap. Asserted verbatim so a
// copy drift on either surface has to be a deliberate edit: the whole point of CUL-284
// is that the card says the SAME thing the dose detail screen does.
const NOTE = "Logged within about 2 hours of another Prednisolone dose — worth double-checking it wasn't a repeat.";

type MedOver = Partial<Parameters<ReturnType<typeof useMomentStore.getState>['showMedication']>[0]>;

function seedDose(over: MedOver = {}) {
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Mochi' }] as never,
    activePet: { id: 'p1', name: 'Mochi' } as never,
  });
  act(() => {
    useMomentStore.getState().showMedication({
      eventId: 'm1',
      petId: 'p1',
      medicationItemId: 'drug-1',
      occurredAt: '2026-06-07T14:00:00.000Z',
      drugName: 'Prednisolone',
      adherence: 'given',
      howGiven: null,
      ...over,
    });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGetDoubleDoseFlag.mockResolvedValue(NO_CONFLICT);
  useMomentStore.getState().hide();
  useMomentStore.setState({ payload: null, removed: false });
  (reverseLoggedEvent as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MedicationCompletionCard — the log-time double-dose note (B-157)', () => {
  it('renders the note when the check found a conflict', () => {
    seedDose({ doubleDose: CONFLICT });
    const { getByText } = render(<MedicationCompletionCard />);
    getByText(NOTE);
  });

  it('names the drug the way the owner just tapped it (B-171 display name)', () => {
    // The dose detail screen passes the GENERIC name; the card has the display-ready
    // brand-preferred one, so the confirmation echoes the word on the tile.
    seedDose({ drugName: 'Clavamox', doubleDose: CONFLICT });
    const { getByText } = render(<MedicationCompletionCard />);
    getByText(/another Clavamox dose/);
  });

  it('renders NOTHING — never an all-clear — when the check found no conflict', () => {
    seedDose({ doubleDose: NO_CONFLICT });
    const { queryByText } = render(<MedicationCompletionCard />);
    expect(queryByText(/double-checking/)).toBeNull();
    // §6.1: absence of a flag is never reassurance. There is no copy to render here,
    // and this asserts none crept in — the detector deliberately under-fires, so a
    // "no repeat found" line would be a claim the record cannot back.
    expect(queryByText(/no repeat|only dose|all clear|looks fine/i)).toBeNull();
  });

  it('renders nothing while the check has not resolved (absent flag ≠ clean)', () => {
    seedDose();
    const { queryByText } = render(<MedicationCompletionCard />);
    expect(queryByText(/double-checking/)).toBeNull();
  });

  it('CLEARS the note when the owner downgrades the dose off "given"', async () => {
    // The staleness guarantee, end to end: the detector fires only on a 'given' focal
    // dose, so marking it missed must retire the note — leaving it up would state that
    // a dose the owner just said did not happen was a possible repeat.
    seedDose({ doubleDose: CONFLICT });
    const { getByText, queryByText } = render(<MedicationCompletionCard />);
    getByText(NOTE);

    mockGetDoubleDoseFlag.mockResolvedValue(NO_CONFLICT);
    await act(async () => {
      fireEvent.press(getByText('Missed'));
    });

    expect(mockUpdateDoseAdherence).toHaveBeenCalledWith('m1', 'missed');
    // The recheck runs against the NEW adherence, not the one the card was showing.
    expect(mockGetDoubleDoseFlag).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'm1', petId: 'p1', medicationItemId: 'drug-1', adherence: 'missed' }),
    );
    expect(queryByText(NOTE)).toBeNull();
  });

  it('SURFACES the note when an in-doubt combo dose is resolved up to "given"', async () => {
    // A not-finished-vehicle combo lands UNCONFIRMED (adherence null), where the
    // detector correctly declines — an unconfirmed dose is not an asserted repeat. The
    // owner's own "given" tap is what makes it one, and the card must then say so.
    seedDose({ adherence: null, pairedFoodName: 'chicken', vehicleIntake: 'refused' });
    const { getByText, queryByText } = render(<MedicationCompletionCard />);
    expect(queryByText(NOTE)).toBeNull();
    // The in-doubt prompt is up, and the note is not — they are mutually exclusive by
    // construction (inDoubt needs a null adherence, the detector needs 'given').
    getByText('Did Mochi still get it?');

    mockGetDoubleDoseFlag.mockResolvedValue(CONFLICT);
    await act(async () => {
      fireEvent.press(getByText('Given'));
    });

    getByText(NOTE);
    // Resolving the dose retires the in-doubt prompt, so the two still never co-render.
    expect(queryByText('Did Mochi still get it?')).toBeNull();
  });

  it('keeps the dose logged and KEEPS the note when the recheck itself fails', async () => {
    // A check failure is a display miss, never data loss: it must not revert the
    // adherence write or alarm the owner.
    //
    // It must also not CLEAR the note, and that is a decision rather than an accident.
    // When the recheck fails the app does not know the truth, so the choice is between
    // over-flagging (keep a note we already had evidence for) and under-flagging (make
    // it disappear). The clinical-guardrails asymmetry settles it: escalate on
    // presence, never reassure on absence. Retiring a standing flag because a read
    // threw would be manufacturing silence out of ignorance — and the note stays
    // honest anyway ("worth double-checking"), while the dose detail screen recomputes
    // it cleanly on the next focus.
    seedDose({ doubleDose: CONFLICT });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDoubleDoseFlag.mockRejectedValue(new Error('sqlite is having a day'));
    const { getByText } = render(<MedicationCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Partial'));
    });
    expect(mockUpdateDoseAdherence).toHaveBeenCalledWith('m1', 'partial');
    getByText(NOTE);
    warn.mockRestore();
  });
});


// ── Undo (CUL-612 · §5) ──────────────────────────────────────────────────────
//
// The reversal's mechanics are momentStore.test.ts's. What only this card can
// answer is the safety half: the adherence chips are the B-156 G1 fail-safe
// surface, so they must not survive the removal of the dose they describe — and
// Undo must stay a reversal, never a second route to an affirmative.
describe('MedicationCompletionCard — Undo', () => {
  async function pressUndo(view: ReturnType<typeof render>) {
    await act(async () => { fireEvent.press(view.getByLabelText('Undo — remove this dose')); });
  }

  it('removes the dose and swaps the card to its removal line', async () => {
    seedDose();
    const view = render(<MedicationCompletionCard />);
    await pressUndo(view);
    expect(reverseLoggedEvent).toHaveBeenCalledWith('m1', undefined);
    view.getByText('Removed');
    view.getByText('Taken out of Mochi’s record');
  });

  it('takes the adherence chips with it — no adherence write against a removed dose', async () => {
    seedDose();
    const view = render(<MedicationCompletionCard />);
    await pressUndo(view);
    expect(view.queryByText('Given')).toBeNull();
    expect(view.queryByText('Refused')).toBeNull();
    expect(view.queryByText('How was it given? (optional)')).toBeNull();
    // Belt-and-braces on the invariant itself: nothing wrote an adherence.
    expect(mockUpdateDoseAdherence).not.toHaveBeenCalled();
  });

  it('takes a standing double-dose note with it', async () => {
    // Removing the dose IS the correct response to a double — so the note has
    // nothing left to warn about, and leaving it up would describe a row that is
    // no longer in the record.
    seedDose({ doubleDose: CONFLICT });
    const view = render(<MedicationCompletionCard />);
    view.getByText(/another Prednisolone dose/);
    await pressUndo(view);
    expect(view.queryByText(/another Prednisolone dose/)).toBeNull();
  });

  it('renders on a COMBO dose, where Change time deliberately does not', () => {
    // The combo is the densest, most error-prone path onto this card — logged from
    // another card, against a meal — so it is exactly where a reversal is most
    // likely needed, and it is the one place the time picker withholds itself.
    seedDose({ pairedFoodName: 'Delectables', howGiven: 'in_treat' });
    const view = render(<MedicationCompletionCard />);
    view.getByLabelText('Undo — remove this dose');
    expect(view.queryByLabelText('Change time of this dose')).toBeNull();
  });

  it('on a FAILED write, keeps the card and its chips intact', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (reverseLoggedEvent as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    seedDose();
    const view = render(<MedicationCompletionCard />);
    await pressUndo(view);
    expect(view.queryByText('Removed')).toBeNull();
    view.getByLabelText('Undo — remove this dose');
    expect(alert.mock.calls[0][0]).toBe('Could not remove that dose');
    alert.mockRestore();
  });
});

// ── CUL-614 · §5 "Dwell" — the WIRING ────────────────────────────────────────
// The state machine itself is proven in store/momentStore.test.ts. What that suite
// cannot see is this file's two lines of JSX: an edit that swapped onTouchStart for
// onTouchEnd, or dropped onTouchCancel, would leave every store test green while the
// card either dismissed under the owner's finger or never dismissed at all. So these
// assert the end-to-end path — a touch on the rendered card reaching the store — and
// exercise it through the real store rather than a spy, which is what makes them a
// statement about behaviour instead of about the props object.
describe('MedicationCompletionCard — the dwell pause is actually wired (CUL-614)', () => {
  it('a finger on the card holds it open past its dwell', () => {
    seedDose();
    const { getByTestId } = render(<MedicationCompletionCard />);
    fireEvent(getByTestId('medication-card-surface'), 'touchStart');
    act(() => { jest.advanceTimersByTime(15_000); });
    expect(useMomentStore.getState().visible).toBe(true);
  });

  it('lifting the finger restores a window, so the card still dismisses', () => {
    // The other half, and the one a swapped-handler edit would break: a pause with no
    // working resume is a card that never leaves.
    seedDose();
    const { getByTestId } = render(<MedicationCompletionCard />);
    const card = getByTestId('medication-card-surface');
    fireEvent(card, 'touchStart');
    fireEvent(card, 'touchEnd');
    act(() => { jest.advanceTimersByTime(4999); });
    expect(useMomentStore.getState().visible).toBe(true);
    act(() => { jest.advanceTimersByTime(2); });
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('a CANCELLED gesture resumes too — the responder can end a touch elsewhere', () => {
    // onTouchCancel is not belt-and-braces: a scroll claiming the responder, or a Modal
    // mounting over the card, ends the gesture there and no touchEnd ever fires.
    seedDose();
    const { getByTestId } = render(<MedicationCompletionCard />);
    const card = getByTestId('medication-card-surface');
    fireEvent(card, 'touchStart');
    fireEvent(card, 'touchCancel');
    act(() => { jest.advanceTimersByTime(5001); });
    expect(useMomentStore.getState().visible).toBe(false);
  });
});

// ── The "Change time" sheet (CUL-621) ────────────────────────────────────────
// Same rationale as the meal card's block: this card carried its own inline copy
// of the picker modal with no coverage of it, so adopting the shared
// <TimeEditSheet/> would have been a blind swap. Pins the question asked, the
// three fields written, cancel writing nothing, and the button role the inline
// copy never declared. The combo path's WITHHOLDING is covered above.
describe('MedicationCompletionCard — Change time', () => {
  function openPicker(view: ReturnType<typeof render>) {
    fireEvent.press(view.getByLabelText('Change time of this dose'));
  }

  it('asks about the DOSE, not a generic "when did this happen"', () => {
    // The sheet's title names the field being written (CUL-606's required-title
    // rule). A dose is a witnessed point in time, so the question is about it.
    seedDose();
    const view = render(<MedicationCompletionCard />);
    openPicker(view);
    view.getByText('When was this dose given?');
    expect(view.queryByText('When did this happen?')).toBeNull();
  });

  it('writes the moved time, stamps manual, and re-asserts witnessed', async () => {
    seedDose();
    const view = render(<MedicationCompletionCard />);
    openPicker(view);
    // The picker opens on THIS record's time. Asserted before any change event,
    // because a `change` overrides the seed — so every assertion downstream of one
    // passes just as happily when the card seeds the sheet from the wrong value
    // (a stale closure, the wrong field, another pet's payload). The write path is
    // covered by the eventId check below; this covers the read path.
    expect(view.UNSAFE_getByType('DateTimePicker' as never).props.value)
      .toEqual(new Date('2026-06-07T14:00:00.000Z'));
    const moved = new Date(2026, 5, 7, 9, 30);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, moved);
    });
    await act(async () => { fireEvent.press(view.getByText('Save')); });

    const [id, fields] = (updateEvent as jest.Mock).mock.calls[0];
    expect(id).toBe('m1');
    expect(fields.occurred_at).toBe(moved.toISOString());
    expect(fields.occurred_at_source).toBe('manual');
    expect(fields.confidence).toEqual({ value: 'witnessed', earliest: null, latest: null });
    expect(useMomentStore.getState().visible).toBe(false);
  });

  it('Cancel writes nothing and leaves the card standing', async () => {
    seedDose();
    const view = render(<MedicationCompletionCard />);
    openPicker(view);
    await act(async () => {
      fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, new Date(2026, 5, 7, 9, 30));
    });
    await act(async () => { fireEvent.press(view.getByText('Cancel')); });

    expect(updateEvent as jest.Mock).not.toHaveBeenCalled();
    expect(useMomentStore.getState().visible).toBe(true);
    // …and the sheet is GONE. Without this line the test passes with `onCancel`
    // wired to a no-op — Cancel becomes a dead button, the sheet sticks open over
    // the card, and "writes nothing / card still standing" are both still true.
    // Found by the code-reviewer's mutation pass on this very suite.
    expect(view.queryByText('When was this dose given?')).toBeNull();
  });

  it('announces its two actions as buttons', () => {
    seedDose();
    const view = render(<MedicationCompletionCard />);
    openPicker(view);
    view.getByRole('button', { name: 'Cancel' });
    view.getByRole('button', { name: 'Save' });
  });
});
