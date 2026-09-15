import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditAppointmentScreen from './edit-appointment';
import { composeScheduledAt, type AppointmentDetail } from '../../lib/vetVisits';

// CUL-952 — the screen the ⋯ item has been pointing at nothing for.
//
// The centrepiece is the NO-TIME SENTINEL. A booking with no time given is stored
// as local midnight, and the obvious way to seed this screen's time picker — from
// the raw instant — hands it a real Date at 00:00. Save without touching it and
// `composeScheduledAt` takes its one-minute nudge branch and writes 00:01, so an
// owner who changed the clinic name finds the app has invented a clock time on
// three other surfaces. `decomposeScheduledAt` is what stops that, and the test
// below is the one that would have caught it.

const mockUpdate = jest.fn(async (_id: string, _patch: unknown) => undefined);
const mockCancel = jest.fn(async (_id: string) => undefined);
let mockRow: AppointmentDetail | null = null;
let mockReadThrows = false;

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

// The platform picker renders a native view with no text, so the min bound is read
// back off the node rather than through a spinner the test cannot see.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange, minimumDate }: {
      onChange: (e: unknown, d?: Date) => void;
      minimumDate?: Date;
    }) => <View testID="picker" pickerMin={minimumDate?.toISOString()} pickerPick={onChange} />,
  };
});

jest.mock('../../lib/vetVisits', () => {
  // The real module for everything pure — `decomposeScheduledAt`,
  // `composeScheduledAt` and `removeAppointmentCopy` are the behaviour under test
  // here, and stubbing a pure function would make this suite green over the rule
  // instead of over the code (C-34). Only the READS and WRITES are stubbed.
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    // The screen reads through the EDITABLE reader, whose SQL carries
    // LIVE_APPOINTMENT_SQL — so a row with `vet_visit_id` set resolves to null here
    // exactly as it would against the real database.
    readEditableAppointment: jest.fn(async () => {
      if (mockReadThrows) throw new Error('db down');
      return mockRow && mockRow.vet_visit_id === null ? mockRow : null;
    }),
    updateAppointmentDetails: (id: string, patch: unknown) => mockUpdate(id, patch),
    cancelVetAppointment: (id: string) => mockCancel(id),
  };
});

jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: [{ id: 'pet-a', name: 'Nyx' }] }),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

/** A day `n` days out, at local midnight — anchored to now, never a literal (C-29). */
function dayOut(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function row(over: Partial<AppointmentDetail> = {}): AppointmentDetail {
  const day = dayOut(42);
  return {
    id: 'appt-1',
    pet_id: 'pet-a',
    scheduled_at: composeScheduledAt(day, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0)),
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'recheck',
    questions: null,
    notes_draft: null,
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockImplementation(async () => undefined);
  mockCancel.mockImplementation(async () => undefined);
  mockReadThrows = false;
  mockRow = row();
});

describe('seeding from the record', () => {
  it('names the RECORD’s pet and fills every field from the row', async () => {
    render(<EditAppointmentScreen />);
    expect(await screen.findByText('Change this appointment')).toBeTruthy();
    // CUL-574: from `appt.pet_id`, never the store's active pet.
    expect(screen.getByText('Nyx')).toBeTruthy();
    expect(screen.getByDisplayValue('Riverside Animal Hospital')).toBeTruthy();
    expect(screen.getByDisplayValue('Dr. Chen')).toBeTruthy();
    expect(screen.getByDisplayValue('recheck')).toBeTruthy();
    expect(screen.getByText('3:00 pm')).toBeTruthy();
  });

  it('shows NO time for a booking that was given none', async () => {
    mockRow = row({ scheduled_at: composeScheduledAt(dayOut(42), null) });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    expect(screen.getByText('Optional')).toBeTruthy();
    // No time means nothing to clear, so the control that undoes nothing is absent
    // rather than disabled (C-7).
    expect(screen.queryByText('Clear')).toBeNull();
  });
});

describe('what survives the change', () => {
  it('says nothing at all when the row holds no prep', async () => {
    // A first-time rescheduler has never opened Get ready. Naming questions and
    // notes to her sends her looking for artifacts that do not exist.
    mockRow = row({ questions: null, notes_draft: null });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    expect(screen.queryByText(/stays? with it/)).toBeNull();
  });

  it('names what she actually prepared, above Save and away from Remove', async () => {
    mockRow = row({
      questions: JSON.stringify([
        { id: 'q1', text: 'The overnight pattern', source: 'owner' },
        { id: 'q2', text: 'The weight', source: 'owner' },
      ]),
      notes_draft: null,
    });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    expect(screen.getByText('Your 2 questions for this visit stay with it.')).toBeTruthy();
  });
});

describe('saving', () => {
  it('writes the four columns it owns, through the composer', async () => {
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.changeText(screen.getByDisplayValue('Riverside Animal Hospital'), 'Bayside Veterinary');
    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const [id, patch] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('appt-1');
    expect(patch.clinicName).toBe('Bayside Veterinary');
    expect(patch.vetName).toBe('Dr. Chen');
    expect(patch.reason).toBe('recheck');
    expect(patch.scheduledAt).toBe(mockRow!.scheduled_at);
  });

  it('does NOT invent a clock time on a no-time booking saved untouched', async () => {
    // THE REGRESSION THIS SCREEN COULD MOST EASILY HAVE SHIPPED. Seeding the time
    // picker from the raw instant would round-trip local midnight through
    // `composeScheduledAt`'s nudge branch and write 00:01 — an owner correcting a
    // typo in the clinic name would start seeing "12:01 am" on Home, the Pet-tab
    // card and Get ready, on an appointment they never gave a time for.
    const untouched = composeScheduledAt(dayOut(42), null);
    mockRow = row({ scheduled_at: untouched });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.changeText(screen.getByDisplayValue('recheck'), 'rescheduled recheck');
    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const [, patch] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.scheduledAt).toBe(untouched);
  });

  it('says it plainly when the save fails, with no string off the exception', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('PostgREST 42501 permission denied'));
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [title, body] = spy.mock.calls[0];
    expect(title).toBe('That didn’t save');
    // The owner-facing copy guard: a display sink never reads a string off an error.
    expect(`${title} ${body}`).not.toMatch(/42501|PostgREST|permission/);
    spy.mockRestore();
  });
});

describe('the date bound', () => {
  it('floors a live booking at today, so it cannot move into the past', async () => {
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText(/^\w+day,/));

    const min = new Date(screen.getByTestId('picker').props.pickerMin as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(min.getTime()).toBe(today.getTime());
  });

  it('does not RATCHET the floor as the owner picks — the row’s day, not the last pick', async () => {
    // Derived from `fields.day`, the floor moves to whatever was just chosen: on a
    // booking from 7 days ago, picking 3 days ago makes the picker refuse 5 days
    // ago — a legitimate correction, blocked with no explanation, recoverable only
    // by leaving the screen. Found by `code-reviewer`, not by a failing test.
    const original = dayOut(-7);
    mockRow = row({ scheduled_at: composeScheduledAt(original, null) });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText(/^\w+day,/));

    // The owner picks a date that is still in the past, then reconsiders.
    const firstPick = dayOut(-3);
    fireEvent(screen.getByTestId('picker'), 'pickerPick', {}, firstPick);

    const min = new Date(screen.getByTestId('picker').props.pickerMin as string);
    // Still the ROW's day. Ratcheted, this would be `firstPick` and the earlier
    // correction would be unreachable.
    expect(min.getTime()).toBe(original.getTime());
  });

  it('floors a PASSED booking at its own day, so the row can still be corrected', async () => {
    // A floor of "today" would refuse to render this row's own current value — and
    // this is the row most likely to be edited, because it sits in *Waiting on you*
    // precisely when the visit moved and nobody told the app.
    const passed = dayOut(-7);
    mockRow = row({ scheduled_at: composeScheduledAt(passed, null) });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText(/^\w+day,/));

    const min = new Date(screen.getByTestId('picker').props.pickerMin as string);
    expect(min.getTime()).toBe(passed.getTime());
  });
});

describe('removing', () => {
  it('confirms first, and writes nothing until the confirm is taken', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText('Remove this appointment'));

    const [title, body] = spy.mock.calls[0];
    expect(title).toBe('Remove this appointment?');
    // Ahead of its day, so "upcoming" is the true word here.
    expect(body).toMatch(/Nyx’s upcoming visits/);
    // C-21: a destructive action carries confirm XOR reversal, and there is no
    // un-cancel.
    expect(mockCancel).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('cancels once the confirm is taken', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons ?? []).find((b) => b.text === 'Remove it')?.onPress?.();
    });
    render(<EditAppointmentScreen />);
    await screen.findByText('Change this appointment');
    fireEvent.press(screen.getByText('Remove this appointment'));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('appt-1'));
    spy.mockRestore();
  });
});

describe('the three states below "has a row"', () => {
  it('refuses to edit a booking whose visit has already been logged', async () => {
    // `readAppointmentById` filters deleted and cancelled but NOT `vet_visit_id` —
    // "Take notes" needs a logged booking to keep working. `updateAppointmentDetails`
    // refuses it, so before this the screen rendered a normal editable form whose
    // every Save threw behind "That didn't save · Try that again in a moment": a dead
    // end that reads as transient and never resolves.
    mockRow = row({ vet_visit_id: 'v-logged' });
    render(<EditAppointmentScreen />);
    expect(await screen.findByText('This appointment is no longer on the record.')).toBeTruthy();
    expect(screen.queryByText('Save changes')).toBeNull();
    expect(screen.queryByText('Remove this appointment')).toBeNull();
  });

  it('says so when the row is gone, rather than showing an empty form', async () => {
    // G5 — a screen never shows a row that is no longer in the record.
    // `readAppointmentById` filters cancelled and deleted, so this is what an owner
    // lands in when the booking was resolved on another device.
    mockRow = null;
    render(<EditAppointmentScreen />);
    expect(await screen.findByText('This appointment is no longer on the record.')).toBeTruthy();
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('offers a retry when the read FAILED, which is not the same as empty', async () => {
    mockReadThrows = true;
    render(<EditAppointmentScreen />);
    expect(await screen.findByText('This appointment could not be read just now.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    // C-12: a read that has not answered is never an empty record, and a failed one
    // must never be dressed as "no longer on the record".
    expect(screen.queryByText('This appointment is no longer on the record.')).toBeNull();
  });
});
