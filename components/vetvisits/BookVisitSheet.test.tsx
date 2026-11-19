import { Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
// The rendered node, typed off the query that returns one.
type ReactTestInstance = ReturnType<typeof screen.getByText>;
import { BookVisitSheet, type BookVisitSubmit } from './BookVisitSheet';
import {
  APPOINTMENT_WINDOW_DAYS,
  composeScheduledAt,
  localDateKey,
  type VisitPrefill,
} from '../../lib/vetVisits';

// CUL-900 VV-2 — the booking sheet (mock E3).
//
// This file exists because `code-reviewer` found a bug here that no test could
// have caught: the sheet had no test at all, and the screen-level tests never
// switched the mode chip after opening. The date/arm interaction below is the
// case that shipped unguarded.

// Vet contacts (CUL-2766): the allowlist AND the opt-in, as one switch the test flips.
let mockContactsOn = false;
jest.mock('../../hooks/useVetContacts', () => ({ useVetContactsOn: () => mockContactsOn }));
beforeEach(() => {
  mockContactsOn = false;
});

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
    // since-visit bound and the Vet Files picker all trust not to be one.
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

describe('the time picker’s 9:00 seed is a value on iOS (CUL-984)', () => {
  // iOS draws the time picker as an inline spinner, and a spinner fires `onChange`
  // only when its wheel MOVES. It opened on 9:00 with nothing committed, so an owner
  // who wanted 9:00 opened it, saved, and booked no time. Android's picker is a
  // dialog that answers on OK, so it keeps committing only what the dialog returns.
  const realOS = Platform.OS;
  afterEach(() => {
    Platform.OS = realOS;
  });

  /** Today at `h`:`m`, through the sheet's own composer (C-34: never re-derived). */
  function todayAt(h: number, m: number): string {
    const d = new Date();
    return composeScheduledAt(d, new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m));
  }
  const NO_TIME_TODAY = () => composeScheduledAt(new Date(), null);

  it('iOS: opening the wheel and saving without spinning books the 9:00 it shows', () => {
    Platform.OS = 'ios';
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByLabelText('Time, not set'));
    // The field reads what the wheel reads, before any save.
    expect(screen.getByText('9:00 am')).toBeTruthy();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].scheduledAt).toBe(todayAt(9, 0));
  });

  it('iOS: Clear takes the time AND closes the wheel, so no time is booked', () => {
    // Left open, the wheel would sit on a value over a field reading Optional: the
    // same disagreement, reached from the other side.
    Platform.OS = 'ios';
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByLabelText('Time, not set'));
    pick(new Date(2026, 8, 16, 15, 30));
    fireEvent.press(screen.getByLabelText('Clear the time'));
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.queryAllByTestId('picker')).toHaveLength(0);
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].scheduledAt).toBe(NO_TIME_TODAY());
  });

  it('iOS: switching the arm away and back does not reopen the wheel over Optional', () => {
    Platform.OS = 'ios';
    renderSheet();
    fireEvent.press(screen.getByLabelText('Time, not set'));
    fireEvent.press(screen.getByText('Already happened'));
    fireEvent.press(screen.getByText('Booked'));
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.queryAllByTestId('picker')).toHaveLength(0);
  });

  it('Android: opening the dialog commits nothing until the dialog answers', () => {
    Platform.OS = 'android';
    const onSubmit = renderSheet();
    fireEvent.press(screen.getByLabelText('Time, not set'));
    expect(screen.getByText('Optional')).toBeTruthy();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].scheduledAt).toBe(NO_TIME_TODAY());
  });
});

describe('the prefill seed is clamped by arm', () => {
  // The adversarial pass's third finding, and the fixture shape that made it
  // invisible: `suggestedDate` was null in EVERY fixture in this file and in the
  // screen's, so 52 green tests said nothing about the seed at all.
  function futureKey(daysOut: number): string {
    const d = daysFromToday(daysOut);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('does NOT seed a future recheck onto the "already happened" arm', () => {
    // Zero taps, owner touches nothing: open on `happened` for a pet whose last
    // visit named a recheck four weeks out, press Save. This used to emit a
    // future `visited_at`. Unreachable from a shipped door today; reachable the
    // moment VV-4's edit flow or VV-5's "log the visit" ask opens this sheet for
    // a pet that has visits — which is exactly what both are for.
    const onSubmit = renderSheet({
      initialMode: 'happened',
      prefill: { ...PREFILL, suggestedDate: futureKey(28) },
    });
    fireEvent.press(screen.getByText(/Save .*’s visit/));
    expect(onSubmit.mock.calls[0][0].day).toBe(localDateKey(new Date()));
  });

  it('DOES seed that same recheck onto the booking arm, which is what it is for', () => {
    // The seed is not disabled — it is asked the right question. A future recheck
    // is exactly the date an owner opening "book the next visit" wants.
    const onSubmit = renderSheet({
      initialMode: 'booked',
      prefill: { ...PREFILL, suggestedDate: futureKey(28) },
    });
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].day).toBe(futureKey(28));
  });

  it('ignores a past recheck on the booking arm — a date already missed', () => {
    const onSubmit = renderSheet({
      initialMode: 'booked',
      prefill: { ...PREFILL, suggestedDate: futureKey(-14) },
    });
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].day).toBe(localDateKey(new Date()));
  });

  it('seeds a past visit date onto the "already happened" arm', () => {
    // The mirror of the first case, and the reason the predicate is two-sided
    // rather than "never seed on happened".
    const onSubmit = renderSheet({
      initialMode: 'happened',
      prefill: { ...PREFILL, suggestedDate: futureKey(-14) },
    });
    fireEvent.press(screen.getByText(/Save .*’s visit/));
    expect(onSubmit.mock.calls[0][0].day).toBe(futureKey(-14));
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

  it('promises the Home strip now that VV-5 has built it', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the inversion is the record of
    // why. The line was WITHHELD while the strip did not exist, because a booking
    // that says it will appear on Home for five days when nothing will reads to
    // the owner as a failed save. VV-5 shipped the strip; the copy did not follow,
    // which left the last thing an owner reads before booking describing only what
    // the app won't do (CUL-953 item 2).
    renderSheet();
    expect(screen.getByText(/Shows on Home five days before/)).toBeTruthy();
    // The other half left with CUL-2728: Remind me now says what a reminder will be.
    expect(screen.queryByText(/No reminder yet/)).toBeNull();
  });

  it('claims the window the strip actually carries', () => {
    // The copy spells "five" as a word, so nothing in the sentence moves when the
    // constant does. This is the tie: widen the strip's window and this reds,
    // naming the line to change, instead of leaving a promise the strip no longer
    // keeps. Bare equality is the assertion BECAUSE the string cannot compute it.
    expect(APPOINTMENT_WINDOW_DAYS).toBe(5);
  });

  it('never says the report starts "from today"', () => {
    // The report's rung 1 is strictly BEFORE today, so a report cut in the car
    // park still runs to yesterday (§4.1 D2, AC 9).
    renderSheet({ initialMode: 'happened' });
    expect(screen.getByText('Your next vet report starts from this visit.')).toBeTruthy();
    expect(screen.queryByText(/from today/)).toBeNull();
  });
});

// ── CUL-2728: Remind me (mock round 2 §4) ───────────────────────────────────────

describe('Remind me', () => {
  it('is off by default, and a booking saved without it carries no reminder intent', () => {
    const onSubmit = renderSheet({ reminderStatus: 'off' });
    const row = screen.getByRole('checkbox');
    expect(row.props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].remindMe).toBe(false);
  });

  it('a tap picks it, the sub line names the times, and Save carries the choice', () => {
    const onSubmit = renderSheet({ reminderStatus: 'off' });
    fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox').props.accessibilityState).toEqual({ checked: true });
    // Booked for today with no time: the 8:00 am day-of may already be past, so the line
    // is whichever the planner still holds: its times and that the switch is account-wide,
    // or (CUL-2729 D3) that this visit is too soon for one.
    expect(screen.getByText(/for every pet’s visits|for every visit you book|Too soon for this visit/)).toBeTruthy();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].remindMe).toBe(true);
  });

  it('already on: no control, and no intent is carried', () => {
    const onSubmit = renderSheet({ reminderStatus: 'on' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0].remindMe).toBe(false);
  });

  it('denied: inert with one door out, never a control marked disabled (C-7)', () => {
    renderSheet({ reminderStatus: 'denied' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Notifications are off for Culprit in Settings.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeTruthy();
  });

  it('is not offered on a visit that already happened', () => {
    renderSheet({ reminderStatus: 'off', initialMode: 'happened' });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

// ── Vet contacts PR-04 (CUL-2766): the past contact (spec §4.2; mock §B) ─────────────

describe('the past contact, flag on', () => {
  beforeEach(() => {
    mockContactsOn = true;
  });

  it('AC 2: the logging door opens on a past contact with no "Has this visit happened?"', () => {
    renderSheet({ initialMode: 'happened' });
    expect(screen.queryByText('Has this visit happened?')).toBeNull();
    expect(screen.queryByText('Booked')).toBeNull();
    expect(screen.getByText('How did you hear from the vet?')).toBeTruthy();
    // Default At the clinic: the shipped title, Save and footnote.
    expect(screen.getByText('A visit that happened')).toBeTruthy();
    expect(screen.getByText('Save Nyx’s visit')).toBeTruthy();
    expect(screen.getByText('Your next vet report starts from this visit.')).toBeTruthy();
    // Day defaults to Today; Time is optional.
    expect(screen.getByLabelText('Day, Today')).toBeTruthy();
    expect(screen.getByLabelText('Time, not set')).toBeTruthy();
  });

  it.each([
    ['Phone', 'A call with the vet', 'Save Nyx’s call', 'Goes on Nyx’s vet report as a phone call. No exam.', 'phone'],
    ['Text', 'Texts from the vet', 'Save Nyx’s texts', 'Goes on Nyx’s vet report as texts with the vet. No exam.', 'text'],
    ['Email', 'An email from the vet', 'Save Nyx’s email', 'Goes on Nyx’s vet report as an email. No exam.', 'email'],
    ['At the clinic', 'A visit that happened', 'Save Nyx’s visit', 'Your next vet report starts from this visit.', 'in_clinic'],
  ])('%s: the title, Save and footnote follow the chip, and Save writes the channel', (chip, title, save, footnote, channel) => {
    const onSubmit = renderSheet({ initialMode: 'happened' });
    // Start elsewhere so the At the clinic row is a real tap too.
    fireEvent.press(screen.getByText(chip === 'Phone' ? 'Email' : 'Phone'));
    fireEvent.press(screen.getByText(chip));
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(footnote)).toBeTruthy();
    fireEvent.press(screen.getByText(save));
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ mode: 'happened', channel, contactedAt: null, scheduledAt: null, remindMe: false });
    expect(sent.day).toBe(localDateKey(new Date()));
  });

  it('Text is spoken "Text or clinic app"', () => {
    renderSheet({ initialMode: 'happened' });
    expect(screen.getByLabelText('Text or clinic app')).toBeTruthy();
  });

  it('a remote contact leads with what it was about, then Where; At the clinic keeps Where first', () => {
    renderSheet({ initialMode: 'happened' });
    const order = () => {
      const about = screen.getByText('What it was about');
      const where = screen.getByText('Where');
      const all = screen.UNSAFE_root.findAll((n: ReactTestInstance) => n === about || n === where);
      return all.map((n: ReactTestInstance) => (n === about ? 'about' : 'where'));
    };
    expect(order()).toEqual(['where', 'about']);
    fireEvent.press(screen.getByText('Phone'));
    expect(order()).toEqual(['about', 'where']);
    // The shipped prefill and its hint on a remote contact too.
    expect(screen.getByDisplayValue('Riverside Animal Hospital')).toBeTruthy();
    expect(screen.getByText('From the last visit — change it if it moved.')).toBeTruthy();
  });

  it('AC 3: a time set writes contacted_at as a UTC instant; no time writes none', () => {
    const onSubmit = renderSheet({ initialMode: 'happened' });
    fireEvent.press(screen.getByText('Phone'));
    fireEvent.press(screen.getByLabelText('Time, not set'));
    pick(new Date(2026, 0, 1, 16, 10));
    fireEvent.press(screen.getByText('Save Nyx’s call'));
    const at = onSubmit.mock.calls[0][0].contactedAt;
    expect(at).not.toBeNull();
    const back = new Date(at!);
    expect([back.getHours(), back.getMinutes()]).toEqual([16, 10]);
    expect(localDateKey(back)).toBe(localDateKey(new Date()));
  });

  it('Day never seeds the last visit’s recheck date: a past contact opens on Today', () => {
    renderSheet({ initialMode: 'happened', prefill: { ...PREFILL, suggestedDate: localDateKey(daysFromToday(-3)) } });
    expect(screen.getByLabelText('Day, Today')).toBeTruthy();
  });
});

describe('Also about (spec §4.2; mock B2)', () => {
  const PETS = [
    { id: 'p2', name: 'Juniper' },
    { id: 'p3', name: 'Moss' },
  ];
  beforeEach(() => {
    mockContactsOn = true;
  });

  it('AC 4: one lit writes two rows’ worth (the record’s pet plus Juniper)', () => {
    const onSubmit = renderSheet({ initialMode: 'happened', petName: 'Pixel', otherPets: PETS });
    fireEvent.press(screen.getByText('Email'));
    expect(screen.getByText('Save Pixel’s email')).toBeTruthy();
    fireEvent.press(screen.getByText('Juniper'));
    fireEvent.press(screen.getByText('Save for Pixel and Juniper'));
    expect(onSubmit.mock.calls[0][0].alsoForPetIds).toEqual(['p2']);
  });

  it('the Save label for one, two and three pets', () => {
    renderSheet({ initialMode: 'happened', petName: 'Pixel', otherPets: PETS });
    fireEvent.press(screen.getByText('Phone'));
    expect(screen.getByText('Save Pixel’s call')).toBeTruthy();
    fireEvent.press(screen.getByText('Juniper'));
    expect(screen.getByText('Save for Pixel and Juniper')).toBeTruthy();
    fireEvent.press(screen.getByText('Moss'));
    expect(screen.getByText('Save for Pixel and 2 others')).toBeTruthy();
    // Each chip is a checkbox, and says whether it is lit.
    expect(screen.getByLabelText('Also about')).toBeTruthy();
  });

  it('renders only in a multi-pet home', () => {
    renderSheet({ initialMode: 'happened', otherPets: [] });
    fireEvent.press(screen.getByText('Phone'));
    expect(screen.queryByText('Also about')).toBeNull();
  });

  it('never on At the clinic: an exam is one animal’s, and a lit pet is not written', () => {
    const onSubmit = renderSheet({ initialMode: 'happened', petName: 'Pixel', otherPets: PETS });
    fireEvent.press(screen.getByText('Phone'));
    fireEvent.press(screen.getByText('Juniper'));
    fireEvent.press(screen.getByText('At the clinic'));
    expect(screen.queryByText('Also about')).toBeNull();
    fireEvent.press(screen.getByText('Save Pixel’s visit'));
    expect(onSubmit.mock.calls[0][0].alsoForPetIds).toEqual([]);
  });
});

describe('the booking door is unchanged with the flag on', () => {
  beforeEach(() => {
    mockContactsOn = true;
  });

  it('keeps its question, its switches and "Also for", and shows no channel chips', () => {
    const onSubmit = renderSheet({ otherPets: [{ id: 'p2', name: 'Juniper' }] });
    expect(screen.getByText('Has this visit happened?')).toBeTruthy();
    expect(screen.getByText('Next visit')).toBeTruthy();
    expect(screen.queryByText('How did you hear from the vet?')).toBeNull();
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.getByText('Also for Juniper')).toBeTruthy();
    fireEvent.press(screen.getByText('Add the appointment'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ mode: 'booked', channel: 'in_clinic', contactedAt: null });
  });
});

describe('editing a saved contact (R12)', () => {
  const EDIT = {
    channel: 'phone' as const,
    day: '2026-11-09',
    contactedAt: new Date(2026, 10, 9, 16, 40).toISOString(),
    clinicName: 'Completely Cat Clinic',
    vetName: null,
    reason: 'Ear, still shaking her head',
  };

  it('opens on the record, all four chips, and the words follow the chip', () => {
    // The flag is the host's question (the page opens Edit this way only while it is on);
    // the edit seed alone opens the contact sheet.
    const onSubmit = renderSheet({ initialMode: 'happened', edit: EDIT, otherPets: [{ id: 'p2', name: 'Juniper' }] });
    expect(screen.getByText('A call with the vet')).toBeTruthy();
    expect(screen.getByLabelText('Day, Monday, Nov 9')).toBeTruthy();
    expect(screen.getByLabelText('Time, 4:40 pm')).toBeTruthy();
    expect(screen.getByDisplayValue('Ear, still shaking her head')).toBeTruthy();
    for (const chip of ['At the clinic', 'Phone', 'Text', 'Email']) expect(screen.getByText(chip)).toBeTruthy();
    // No Also about on an edit: it is one pet's row.
    expect(screen.queryByText('Also about')).toBeNull();

    fireEvent.press(screen.getByText('At the clinic'));
    expect(screen.getByText('A visit that happened')).toBeTruthy();
    expect(screen.getByText('Your next vet report starts from this visit.')).toBeTruthy();
    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      channel: 'in_clinic',
      day: '2026-11-09',
      contactedAt: EDIT.contactedAt,
      alsoForPetIds: [],
    });
  });
});
