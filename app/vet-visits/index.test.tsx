import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import VetVisitsScreen from './index';
import type { VetVisitsHome } from '../../lib/vetVisits';

// CUL-900 VV-2 — the list screen's own wiring.
//
// The centrepiece is AC 11, and it is a claim about a BUG THAT SHIPPED: the
// existing `app/vet-visit.tsx` reads `activePet` at save time (`:117`), so the
// store moving between opening a screen and saving on it writes the row under the
// wrong pet. Spec §2 names that shape as the one this track must not inherit, and
// this file drives the store mid-flight to prove it did not.

// Typed by their real signatures so `mock.calls[0][0]` is the input object rather
// than an empty tuple — the assertions below are ABOUT that object's `petId`.
type BookArgs = { petId: string; scheduledAt: string };
type LogArgs = { petId: string; visitedAt: string };
const mockBook = jest.fn(async (_input: BookArgs) => 'new-appointment');
const mockLog = jest.fn(async (_input: LogArgs) => 'new-visit');
const mockCancel = jest.fn(async (_id: string) => undefined);
let mockHome: VetVisitsHome = { next: null, later: [], awaiting: [], visits: [] };
// The prep columns a remove confirm reads off the row at press time (CUL-987 D2).
let mockDetail: { questions: string | null; notes_draft: string | null } | null = null;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  // The screen reloads on focus; in the test environment the callback is run once
  // on mount, which is the lifecycle this file cares about.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => mockParams,
}));
let mockParams: { add?: string } = {};

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => true }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));
jest.mock('../../lib/sync', () => ({
  syncPendingVetAppointments: jest.fn(async () => undefined),
  syncPendingVetVisits: jest.fn(async () => undefined),
}));

jest.mock('../../lib/vetVisits', () => {
  // `resolveRecordPetName` and the formatters are PURE, and the screen's whole job
  // here is to route the right id into them — so the real module is used for
  // everything except the two writes and the two reads (C-34: a mock standing in
  // for a pure function uses requireActual; the READ is what needs stubbing).
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readVetVisitsHome: jest.fn(async () => mockHome),
    readVisitPrefill: jest.fn(async () => ({
      clinicName: 'Riverside Animal Hospital',
      vetName: 'Dr. Chen',
      suggestedDate: null,
    })),
    // Wrapped rather than passed directly: a `jest.mock` factory is hoisted above
    // the `const` declarations and runs on the first require of the mocked module,
    // which happens while `mockBook` is still in its temporal dead zone. The arrow
    // defers the reference to call time, which is the only time it is defined.
    bookVetAppointment: (input: BookArgs) => mockBook(input),
    logVetVisit: (input: LogArgs) => mockLog(input),
    cancelVetAppointment: (id: string) => mockCancel(id),
    readAppointmentById: jest.fn(async () => mockDetail),
  };
});

// A real store, so switching the active pet exercises the real mutator rather
// than a hand-rolled stand-in that cannot reproduce the hydration path.
const PET_A = { id: 'pet-a', name: 'Nyx' };
const PET_B = { id: 'pet-b', name: 'Juniper' };
let mockStoreState: { pets: Array<{ id: string; name: string }>; activePet: { id: string; name: string } | null };

jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel(mockStoreState),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

beforeEach(() => {
  jest.clearAllMocks();
  // `clearAllMocks` clears CALLS but not implementations, so a per-test
  // `mockImplementation` would leak into the next file-order-dependent test.
  mockBook.mockImplementation(async () => 'new-appointment');
  mockLog.mockImplementation(async () => 'new-visit');
  mockParams = {};
  mockHome = { next: null, later: [], awaiting: [], visits: [] };
  mockDetail = null;
  mockStoreState = { pets: [PET_A, PET_B], activePet: PET_A };
});

describe('AC 11 — the screen writes under the pet it was opened for', () => {
  it('books under pet A even after the store\'s active pet moves to B', async () => {
    const { rerender } = render(<VetVisitsScreen />);
    await screen.findByText('Add the next visit');

    fireEvent.press(screen.getByText('Add the next visit'));
    await screen.findByText('Add the appointment');

    // The store moves under the open sheet — a pull landing mid-booking, which is
    // exactly what `setPets` does on hydration.
    await act(async () => {
      mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
      rerender(<VetVisitsScreen />);
    });

    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(mockBook).toHaveBeenCalledTimes(1));
    expect(mockBook.mock.calls[0][0]).toMatchObject({ petId: 'pet-a' });
  });

  it('logs a past visit under pet A on the same switch', async () => {
    const { rerender } = render(<VetVisitsScreen />);
    await screen.findByText('Log a visit that already happened');
    fireEvent.press(screen.getByText('Log a visit that already happened'));
    await screen.findByText(/Save .*’s visit/);

    await act(async () => {
      mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
      rerender(<VetVisitsScreen />);
    });

    fireEvent.press(screen.getByText(/Save .*’s visit/));
    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    expect(mockLog.mock.calls[0][0]).toMatchObject({ petId: 'pet-a' });
  });

  it('keeps naming pet A after the switch, rather than following the store', async () => {
    const { rerender } = render(<VetVisitsScreen />);
    await screen.findByText('Nyx’s visits, in one place');

    await act(async () => {
      mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
      rerender(<VetVisitsScreen />);
    });

    // Still Nyx. A screen that renamed itself here would be telling the owner the
    // rows belong to a pet they do not.
    expect(screen.getByText('Nyx’s visits, in one place')).toBeTruthy();
    expect(screen.queryByText('Juniper’s visits, in one place')).toBeNull();
  });
});

describe('AC 2 — booking', () => {
  it('offers "Also for" only for the OTHER pets, and books a row for each chosen one', async () => {
    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));

    expect(screen.getByText('Also for Juniper')).toBeTruthy();
    // Never the pet whose sheet this is.
    expect(screen.queryByText('Also for Nyx')).toBeNull();

    fireEvent(screen.getByLabelText('Also book this appointment for Juniper'), 'valueChange', true);
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(mockBook).toHaveBeenCalledTimes(2));
    // A row EACH (the Vet Files D13 duplicate-on-add shape), not one shared row.
    expect(mockBook.mock.calls.map((c) => c[0].petId)).toEqual(['pet-a', 'pet-b']);
  });

  it('does not offer "Also for" in a one-pet account', async () => {
    mockStoreState = { pets: [PET_A], activePet: PET_A };
    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    expect(screen.queryByText(/Also for/)).toBeNull();
  });

  it('needs only a date: submitting straight away books with the clinic prefilled', async () => {
    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(mockBook).toHaveBeenCalledTimes(1));
    expect(mockBook.mock.calls[0][0]).toMatchObject({
      clinicName: 'Riverside Animal Hospital',
      vetName: 'Dr. Chen',
    });
  });

  it('books no second row for a pet whose toggle was switched back off', async () => {
    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    const toggle = screen.getByLabelText('Also book this appointment for Juniper');
    fireEvent(toggle, 'valueChange', true);
    fireEvent(toggle, 'valueChange', false);
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(mockBook).toHaveBeenCalledTimes(1));
  });
});

describe('the two doors are gated SEPARATELY (CUL-966)', () => {
  function nextAppt(isToday: boolean) {
    return {
      id: 'a-next',
      petId: 'pet-a',
      // A REAL instant, and one the caller could actually hand over: the confirm
      // copy re-derives "has this day passed" from it, so a fixture carrying a
      // placeholder would be green over a branch production never takes (C-35).
      // Anchored to `Date.now()` rather than pinned to a literal date, because a
      // fixture judged against a rolling window fails on a calendar boundary
      // instead of on a change (C-29).
      scheduledAt: instantDaysOut(isToday ? 0 : 42),
      stamp: { day: '28', month: 'Oct' },
      when: 'Wed, Oct 28',
      day: 'Wed, Oct 28',
      where: 'Riverside Animal Hospital · recheck',
      isToday,
    };
  }

  it('offers both doors on the day', async () => {
    mockHome = { next: nextAppt(true), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    expect(await screen.findByText('Take notes')).toBeTruthy();
    expect(screen.getByText('How did it go?')).toBeTruthy();
  });

  it('offers the NOTES on a booking weeks out — that is the whole of CUL-966', async () => {
    // The PM's device report: "Notes needs to open WHEN THE VISIT IS SCHEDULED."
    // Before this, a visit booked six weeks out had no notes field anywhere in the
    // app until the morning of — which is the moment people have stopped preparing,
    // not started.
    mockHome = { next: nextAppt(false), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');
    expect(screen.getByText('Take notes')).toBeTruthy();
  });

  it('withholds "How did it go?" on a booking weeks out — the mis-tap consumes the booking', async () => {
    // THE HALF OF THE OLD GATE THAT MUST SURVIVE, and the reason the gate split
    // rather than went. "How did it go?" on a recheck six weeks away is a question
    // about a thing that has not happened, and answering it writes a `vet_visits`
    // row, marks the appointment attended and moves the vet report's window — with
    // no way back before VV-6's delete (CUL-939). Proven by mutation: drop the
    // `isToday` condition on `onHowDidItGo` in index.tsx and this reds while the
    // notes test above stays green, which is the asymmetry in one line.
    mockHome = { next: nextAppt(false), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');
    expect(screen.queryByText('How did it go?')).toBeNull();
  });

  it('still renders the appointment itself — the gate is on the actions, not the row', async () => {
    mockHome = { next: nextAppt(false), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    expect(await screen.findByText('Wed, Oct 28')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });
});

// ── CUL-952 — the appointment can be changed, and a passed one answered ────────

describe('changing a booked appointment (CUL-952)', () => {
  function nextIn(days: number) {
    return {
      id: 'a-next',
      petId: 'pet-a',
      scheduledAt: instantDaysOut(days),
      stamp: { day: '28', month: 'Oct' },
      when: 'Wed, Oct 28',
      day: 'Wed, Oct 28',
      where: 'Riverside Animal Hospital · recheck',
      isToday: days === 0,
    };
  }

  it('offers Change under Next, pointed at the APPOINTMENT and not the list', async () => {
    const { router } = require('expo-router');
    mockHome = { next: nextIn(42), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);

    fireEvent.press(await screen.findByText('Change'));
    // The whole defect in one assertion: this used to reach `/vet-visits`, where
    // the only control is *Add*, so following the app's own instruction booked a
    // SECOND appointment beside the one the owner meant to move.
    expect(router.push).toHaveBeenCalledWith('/vet-visits/edit-appointment?appointment=a-next');
  });

  it('does NOT offer "It didn’t happen" on a booking still ahead', async () => {
    mockHome = { next: nextIn(42), later: [], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');
    // The app has not asked anything yet, so there is no question to answer. The
    // door for a future booking is *Change*.
    expect(screen.queryByText('It didn’t happen')).toBeNull();
  });

  it('offers BOTH answers on a booking whose day has passed', async () => {
    mockHome = { next: null, later: [], awaiting: [nextIn(-7)], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');

    // The section asked a two-answer question and offered one answer; the other
    // lived on Home, and only for five days.
    expect(screen.getByText('How did it go?')).toBeTruthy();
    expect(screen.getByText('It didn’t happen')).toBeTruthy();
    // And a way to correct it, because the commonest reason a booking lands here
    // is that the visit MOVED and nobody told the app.
    expect(screen.getByText('Change')).toBeTruthy();
  });

  it('says so in the note under the bucket, not only in the buttons', async () => {
    mockHome = { next: null, later: [], awaiting: [nextIn(-7)], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');
    expect(screen.getByText(/or\s+say it didn’t happen/)).toBeTruthy();
  });

  it('confirms before removing, and writes nothing until the confirm is taken', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockHome = { next: null, later: [], awaiting: [nextIn(-7)], visits: [] };
    render(<VetVisitsScreen />);

    fireEvent.press(await screen.findByText('It didn’t happen'));

    // Awaited: the confirm asks the record for the row's prep first (CUL-987 D2).
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [title, body] = spy.mock.calls[0];
    expect(title).toBe('Remove this appointment?');
    // The day has passed, so the copy must not call it "upcoming".
    expect(body).not.toMatch(/upcoming/);
    expect(body).toMatch(/Nothing else in the record changes/);
    // C-21: exactly one safety net, and for a write with no undo it is the confirm.
    expect(mockCancel).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('cancels the appointment once the confirm is taken', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons ?? []).find((b) => b.text === 'Remove it')?.onPress?.();
    });
    mockHome = { next: null, later: [], awaiting: [nextIn(-7)], visits: [] };
    render(<VetVisitsScreen />);

    fireEvent.press(await screen.findByText('It didn’t happen'));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('a-next'));
    spy.mockRestore();
  });

  it('says it plainly when the remove fails, and leaves the row on screen', async () => {
    mockCancel.mockRejectedValueOnce(new Error('offline'));
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons ?? []).find((b) => b.text === 'Remove it')?.onPress?.();
    });
    mockHome = { next: null, later: [], awaiting: [nextIn(-7)], visits: [] };
    render(<VetVisitsScreen />);

    fireEvent.press(await screen.findByText('It didn’t happen'));

    // Never a silent failure: the second Alert is the one that says so, and it
    // carries no string lifted off the exception (the owner-facing copy guard).
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    const [failTitle, failBody] = spy.mock.calls[1];
    expect(failTitle).toBe('Couldn’t remove it');
    expect(failBody).not.toMatch(/offline/);
    expect(screen.getByText('Wed, Oct 28')).toBeTruthy();
    spy.mockRestore();
  });
});

/**
 * An instant `days` from now at 3pm local, for a fixture that needs a real
 * `scheduled_at`. Local components, never a UTC literal (C-29).
 */
function instantDaysOut(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

describe('a booking whose day has passed', () => {
  it('is rendered, not hidden — with the day it needs and what to do about it', async () => {
    mockHome = {
      next: null,
      later: [],
      awaiting: [
        {
          id: 'a-past',
          petId: 'pet-a',
          scheduledAt: instantDaysOut(-7),
          stamp: { day: '8', month: 'Sep' },
          when: 'Mon, Sep 8',
          day: 'Mon, Sep 8',
          where: 'Riverside Animal Hospital · recheck',
          isToday: false,
        },
      ],
      visits: [],
    };
    render(<VetVisitsScreen />);

    // The row the owner created is on screen. Hiding it was the first draft's
    // answer, and it made re-typing the only recovery — which mints a SECOND row
    // and orphans the original, since nothing can cancel an appointment yet.
    expect(await screen.findByText('Mon, Sep 8')).toBeTruthy();
    expect(screen.getByText('Waiting on you')).toBeTruthy();
    expect(screen.getByText(/This day has passed/)).toBeTruthy();
  });

  it('does not count as the empty state, so the two doors do not replace it', async () => {
    mockHome = {
      next: null,
      later: [],
      awaiting: [
        { id: 'a-past', petId: 'pet-a', scheduledAt: instantDaysOut(-7), stamp: null, when: 'Mon, Sep 8', day: 'Mon, Sep 8', where: '', isToday: false },
      ],
      visits: [],
    };
    render(<VetVisitsScreen />);
    await screen.findByText('Mon, Sep 8');
    expect(screen.queryByText('Nyx’s visits, in one place')).toBeNull();
  });
});

describe('an "Also for" success (CUL-953 item 4)', () => {
  it('confirms the second pet BY NAME — the list it returns to cannot show it', async () => {
    // The asymmetry this closes: the failure path named the pet, the success path
    // said nothing at all. And nothing is the one outcome the owner cannot verify
    // for themselves here — the sheet closes onto a list scoped to the OTHER pet,
    // where the new appointment is invisible by definition. An owner who flipped a
    // switch promising a second booking was shown no evidence it happened.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBook.mockImplementation(async () => 'new-appointment');

    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    fireEvent(screen.getByLabelText('Also book this appointment for Juniper'), 'valueChange', true);
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('Saved');
    // The NAME, not a count: in a two-pet household it is the only cue that says
    // which booking this was.
    expect(String(alert.mock.calls[0][1])).toContain('Juniper');
    alert.mockRestore();
  });

  it('stays silent when no second pet was asked for', async () => {
    // The other direction, and it matters as much: a confirmation on every ordinary
    // single-pet booking would be a dialog between the owner and the thing they
    // just did. The alert exists for the invisible half only.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBook.mockImplementation(async () => 'new-appointment');

    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(screen.queryByText('Add the appointment')).toBeNull());
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('a partial "Also for" failure', () => {
  it('reports what did NOT save, and does not re-offer the row that did', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // The second pet's write fails; the first has already committed.
    mockBook.mockImplementation(async (input) => {
      if (input.petId === 'pet-b') throw new Error('offline');
      return 'new-appointment';
    });

    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    fireEvent(screen.getByLabelText('Also book this appointment for Juniper'), 'valueChange', true);
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    // Named, and honest that the rest of the save stood.
    expect(alert.mock.calls[0][0]).toBe('Saved, apart from one');
    expect(String(alert.mock.calls[0][1])).toContain('Juniper');

    // The sheet is CLOSED. Leaving it open is what turned the obvious retry into a
    // duplicate of the appointment that had already been written.
    await waitFor(() => expect(screen.queryByText('Add the appointment')).toBeNull());
    expect(mockBook.mock.calls.filter((c) => c[0].petId === 'pet-a')).toHaveLength(1);
    alert.mockRestore();
  });

  it('keeps the sheet open when the owner\'s OWN pet failed — nothing was written', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBook.mockImplementation(async () => {
      throw new Error('offline');
    });

    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('Add the next visit'));
    fireEvent.press(screen.getByText('Add the appointment'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('That didn’t save', expect.any(String)));
    // Still open, with the owner's input — retrying is safe because nothing landed.
    expect(screen.getByText('Add the appointment')).toBeTruthy();
    alert.mockRestore();
  });
});

describe('the three states below "has rows" (C-12)', () => {
  it('does not flash the designed empty state before the read answers', async () => {
    render(<VetVisitsScreen />);
    // First frame: `visits=[]` is true and means nothing yet. An owner with twelve
    // visits must not see "Nyx's visits, in one place" on the way in.
    expect(screen.queryByText('Nyx’s visits, in one place')).toBeNull();
    // Let the read land before the test ends, so the state update it causes is not
    // reported as an un-acted update by whichever test happens to run next.
    await screen.findByText('Nyx’s visits, in one place');
  });

  it('renders the empty state once the read has answered with nothing', async () => {
    render(<VetVisitsScreen />);
    expect(await screen.findByText('Nyx’s visits, in one place')).toBeTruthy();
  });
});

// ── CUL-970 — a second upcoming booking is on screen ────────────────────────────

describe('every upcoming booking renders under Next (CUL-970)', () => {
  // Built through the REAL view builder from rows shaped like the local table, so
  // the labels are the ones production composes rather than hand-typed stand-ins
  // (C-35). Anchored to `Date.now()` so the fixture never ages into the past (C-29).
  const { buildAppointmentView } = jest.requireActual('../../lib/vetVisits');
  function booking(id: string, days: number, reason: string) {
    return buildAppointmentView({
      id,
      pet_id: 'pet-a',
      scheduled_at: instantDaysOut(days),
      clinic_name: 'Riverside Animal Hospital',
      vet_name: null,
      reason,
      vet_visit_id: null,
      cancelled_at: null,
      deleted_at: null,
    });
  }

  it('shows the recheck AND the annual — the second is no longer on no screen at all', async () => {
    mockHome = {
      next: booking('recheck', 21, 'recheck'),
      later: [booking('annual', 180, 'annual exam')],
      awaiting: [],
      visits: [],
    };
    render(<VetVisitsScreen />);

    expect(await screen.findByText('Riverside Animal Hospital · recheck')).toBeTruthy();
    expect(screen.getByText('Riverside Animal Hospital · annual exam')).toBeTruthy();
    // Under ONE Next label — "what else is booked" is part of "what is next", not a
    // section of its own.
    expect(screen.getAllByText('Next')).toHaveLength(1);
  });

  it('gives the later booking its own notes door and its own Change, pointed at ITS id', async () => {
    const { router } = require('expo-router');
    mockHome = {
      next: booking('recheck', 21, 'recheck'),
      later: [booking('annual', 180, 'annual exam')],
      awaiting: [],
      visits: [],
    };
    render(<VetVisitsScreen />);
    await screen.findByText('Riverside Animal Hospital · annual exam');

    const notes = screen.getAllByText('Take notes');
    const change = screen.getAllByText('Change');
    expect(notes).toHaveLength(2);
    expect(change).toHaveLength(2);

    fireEvent.press(notes[1]);
    expect(router.push).toHaveBeenLastCalledWith('/vet-visits/at-the-vet?appointment=annual');
    fireEvent.press(change[1]);
    expect(router.push).toHaveBeenLastCalledWith('/vet-visits/edit-appointment?appointment=annual');
  });

  it('gives each booking’s doors a label a screen reader can tell apart (the date)', async () => {
    // With more than one booking under Next, "Take notes for Nyx’s visit" read out
    // identically per row (pm-feature-review) — the label now carries the booking's
    // own `when`, the same string the block beside it shows.
    const lead = booking('recheck', 21, 'recheck');
    const later = booking('annual', 180, 'annual exam');
    mockHome = { next: lead, later: [later], awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Riverside Animal Hospital · annual exam');

    expect(screen.getByLabelText(`Take notes for Nyx’s visit, ${lead.when}`)).toBeTruthy();
    expect(screen.getByLabelText(`Take notes for Nyx’s visit, ${later.when}`)).toBeTruthy();
    expect(screen.getByLabelText(`Change Nyx’s appointment, ${later.when}`)).toBeTruthy();
    expect(lead.when).not.toBe(later.when);
  });

  it('keeps *How did it go?* off a later booking that is not today', async () => {
    mockHome = {
      next: booking('recheck', 21, 'recheck'),
      later: [booking('annual', 180, 'annual exam')],
      awaiting: [],
      visits: [],
    };
    render(<VetVisitsScreen />);
    await screen.findByText('Riverside Animal Hospital · annual exam');
    expect(screen.queryByText('How did it go?')).toBeNull();
  });
});

// ── CUL-987 — the block is a door, and the remove confirm names the prep ─────────

describe('the appointment block opens Get ready, in every bucket (CUL-987 D1)', () => {
  const { buildAppointmentView } = jest.requireActual('../../lib/vetVisits');
  function booking(id: string, days: number, reason: string) {
    return buildAppointmentView({
      id,
      pet_id: 'pet-a',
      scheduled_at: instantDaysOut(days),
      clinic_name: 'Riverside Animal Hospital',
      vet_name: null,
      reason,
      vet_visit_id: null,
      cancelled_at: null,
      deleted_at: null,
    });
  }

  it.each([
    ['the lead under Next', 'recheck', 'Riverside Animal Hospital · recheck'],
    ['a later booking', 'annual', 'Riverside Animal Hospital · annual exam'],
    ['a passed day waiting on an answer', 'passed', 'Riverside Animal Hospital · dental'],
  ])('%s', async (_label, id, where) => {
    const { router } = require('expo-router');
    mockHome = {
      next: booking('recheck', 21, 'recheck'),
      later: [booking('annual', 180, 'annual exam')],
      awaiting: [booking('passed', -7, 'dental')],
      visits: [],
    };
    render(<VetVisitsScreen />);
    await screen.findByText(where);

    fireEvent.press(screen.getByLabelText(new RegExp(`${where}$`)));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/rundown', params: { appointmentId: id } });
  });
});

describe('the list’s remove confirm names what goes with the row (CUL-987 D2)', () => {
  it('names the notes typed for this visit', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockHome = {
      next: null,
      later: [],
      awaiting: [{
        id: 'a-past', petId: 'pet-a', scheduledAt: instantDaysOut(-7), stamp: { day: '15', month: 'Sep' },
        when: 'Tue, Sep 15', day: 'Tue, Sep 15', where: 'Riverside Animal Hospital', isToday: false,
      }],
      visits: [],
    };
    mockDetail = { questions: null, notes_draft: 'Ask about the limp' };
    render(<VetVisitsScreen />);
    fireEvent.press(await screen.findByText('It didn’t happen'));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][1]).toMatch(/Your notes for this visit go with it\. Nothing else in the record changes\.$/);
    spy.mockRestore();
  });
});
