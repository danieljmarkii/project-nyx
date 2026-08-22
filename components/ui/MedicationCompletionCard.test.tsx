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
import { MedicationCompletionCard } from './MedicationCompletionCard';
import { useMomentStore } from '../../store/momentStore';
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
  useMomentStore.setState({ payload: null });
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

  it('keeps the dose logged and the card calm when the recheck itself fails', async () => {
    // A check failure is a display miss, never data loss: it must not revert the
    // adherence write or alarm the owner.
    seedDose({ doubleDose: CONFLICT });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDoubleDoseFlag.mockRejectedValue(new Error('sqlite is having a day'));
    const { getByText } = render(<MedicationCompletionCard />);
    await act(async () => {
      fireEvent.press(getByText('Partial'));
    });
    expect(mockUpdateDoseAdherence).toHaveBeenCalledWith('m1', 'partial');
    warn.mockRestore();
  });
});
