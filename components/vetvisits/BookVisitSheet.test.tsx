import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BookVisitSheet, type BookVisitSubmit } from './BookVisitSheet';
import { localDateKey, type VisitPrefill } from '../../lib/vetVisits';

// CUL-900 VV-2 — the booking sheet (mock E3).
//
// This file exists because `code-reviewer` found a bug here that no test could
// have caught: the sheet had no test at all, and the screen-level tests never
// switched the mode chip after opening. The date/arm interaction below is the
// case that shipped unguarded.

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The platform picker renders a native view with no text; the tests below drive
// the sheet's own state through it rather than through a spinner they cannot see.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange, minimumDate, maximumDate }: {
      onChange: (e: unknown, d?: Date) => void;
      minimumDate?: Date;
      maximumDate?: Date;
    }) => (
      // Test-only props, read back off the rendered node by `pick` below. A `View`
      // takes arbitrary props here, so no suppression is needed.
      <View
        testID="picker"
        pickerMin={minimumDate?.toISOString()}
        pickerMax={maximumDate?.toISOString()}
        pickerPick={onChange}
      />
    ),
  };
});

const PREFILL: VisitPrefill = {
  clinicName: 'Riverside Animal Hospital',
  vetName: 'Dr. Chen',
  suggestedDate: null,
};

function renderSheet(over: Partial<Parameters<typeof BookVisitSheet>[0]> = {}) {
  const onSubmit = jest.fn<void, [BookVisitSubmit]>();
  render(
    <BookVisitSheet
      visible
      initialMode="booked"
      petName="Nyx"
      otherPets={[]}
      prefill={PREFILL}
      onClose={jest.fn()}
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return onSubmit;
}

/**
 * Drive the open picker to a value, the way the platform control would.
 *
 * Wrapped in `act` because this calls the handler directly rather than through
 * `fireEvent` — which is what RTL normally wraps for you. Without it the
 * `setDay` never commits, and the first version of these tests failed with the
 * PICKED date instead of the clamped one: a harness bug that looks exactly like
 * the production bug it was written to catch.
 */
function pick(d: Date) {
  const pickers = screen.getAllByTestId('picker');
  const handler = (pickers[pickers.length - 1].props as {
    pickerPick: (e: unknown, d: Date) => void;
  }).pickerPick;
  act(() => handler({}, d));
}

function daysFromToday(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

describe('switching the arm carries the date with it', () => {
  it('pulls a FUTURE date back to today when the visit already happened', () => {
    // The bug, driven: the two arms have opposite bounds, `minimumDate` and
    // `maximumDate` only constrain the PICKER, and a date already in state when
    // the arm flips was re-validated by nothing. Submitting here used to write a
    // future `visited_at` — the one date the report's window, the rundown's
    // MAX(visited_at) and the Vet Files picker all trust not to be one.
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByLabelText(/^Date, /));
    pick(daysFromToday(28));

    fireEvent.press(screen.getByText('Already happened'));
    fireEvent.press(screen.getByText(/Save .*’s visit/));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const { day, mode } = onSubmit.mock.calls[0][0];
    expect(mode).toBe('happened');
    expect(day).toBe(localDateKey(new Date()));
  });

  it('pushes a PAST date forward to today when the visit is being booked', () => {
    const onSubmit = renderSheet({ initialMode: 'happened' });
    fireEvent.press(screen.getByLabelText(/^Date, /));
    pick(daysFromToday(-21));

    fireEvent.press(screen.getByText('Booked'));
    fireEvent.press(screen.getByText('Add the appointment'));

    const { day, mode } = onSubmit.mock.calls[0][0];
    expect(mode).toBe('booked');
    expect(day).toBe(localDateKey(new Date()));
  });

  it('leaves a date alone when it is legal in the new arm', () => {
    // The common case must not be disturbed: today is valid on both sides.
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByText('Already happened'));
    fireEvent.press(screen.getByText(/Save .*’s visit/));
    expect(onSubmit.mock.calls[0][0].day).toBe(localDateKey(new Date()));
  });

  it('drops a time when the arm becomes one that cannot store it', () => {
    // A visit that happened is remembered as a DAY, so a time carried over from
    // the booked arm would be written nowhere and shown nowhere.
    //
    // Asserted on the way BACK, deliberately. The first version of this test
    // checked `scheduledAt === null` after switching to `happened` — which
    // `submit()` returns on that arm whatever the state holds, so it survived the
    // mutation that removed the clamp entirely and measured nothing. What the
    // clearing actually buys is that a stale 3:30 pm does not reappear, silently
    // attached to a different booking, when the owner switches back.
    renderSheet();
    fireEvent.press(screen.getByLabelText(/^Time, /));
    pick(new Date(2026, 8, 16, 15, 30));
    expect(screen.getByText('3:30 pm')).toBeTruthy();

    fireEvent.press(screen.getByText('Already happened'));
    fireEvent.press(screen.getByText('Booked'));

    expect(screen.queryByText('3:30 pm')).toBeNull();
    expect(screen.getByText('Optional')).toBeTruthy();
  });
});

describe('the sheet asks its question, and requires only a date', () => {
  it('asks happened-or-booked out loud, not only to a screen reader', () => {
    renderSheet();
    expect(screen.getByText('Has this visit happened?')).toBeTruthy();
  });

  it('submits with nothing typed, carrying the prefill', () => {
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      clinicName: 'Riverside Animal Hospital',
      vetName: 'Dr. Chen',
      reason: '',
    });
  });

  it('does not promise a Home surface that has not been built', () => {
    // VV-5 owns the Home strip. A booking that says it will appear there, five
    // days running, when nothing will, reads to the owner as a failed save.
    renderSheet();
    expect(screen.queryByText(/Shows on Home/)).toBeNull();
    expect(screen.getByText(/No reminder yet/)).toBeTruthy();
  });

  it('never says the report starts "from today"', () => {
    // The report's rung 1 is strictly BEFORE today, so a report cut in the car
    // park still runs to yesterday (§4.1 D2, AC 9).
    renderSheet({ initialMode: 'happened' });
    expect(screen.getByText('Your next vet report starts from this visit.')).toBeTruthy();
    expect(screen.queryByText(/from today/)).toBeNull();
  });
});
