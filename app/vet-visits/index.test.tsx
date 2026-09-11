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
let mockHome: VetVisitsHome = { next: null, awaiting: [], visits: [] };

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
  mockHome = { next: null, awaiting: [], visits: [] };
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

describe('the appointment’s two doors belong to its own day', () => {
  function nextAppt(isToday: boolean) {
    return {
      id: 'a-next',
      petId: 'pet-a',
      stamp: { day: '28', month: 'Oct' },
      when: 'Wed, Oct 28',
      day: 'Wed, Oct 28',
      where: 'Riverside Animal Hospital · recheck',
      isToday,
    };
  }

  it('offers both doors on the day', async () => {
    mockHome = { next: nextAppt(true), awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    expect(await screen.findByText('At the vet')).toBeTruthy();
    expect(screen.getByText('How did it go?')).toBeTruthy();
  });

  it('offers NEITHER on a booking weeks out — the mis-tap consumed the booking', async () => {
    // "How did it go?" on a recheck six weeks away is a question about a thing that
    // has not happened, and answering it marks the appointment attended: it leaves
    // Home and *Next* with no way back before VV-6's delete (CUL-939). A future
    // appointment's door is *Get ready*, which is VV-5's; until then the block states
    // and does not act.
    mockHome = { next: nextAppt(false), awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    await screen.findByText('Wed, Oct 28');
    expect(screen.queryByText('At the vet')).toBeNull();
    expect(screen.queryByText('How did it go?')).toBeNull();
  });

  it('still renders the appointment itself — the gate is on the actions, not the row', async () => {
    mockHome = { next: nextAppt(false), awaiting: [], visits: [] };
    render(<VetVisitsScreen />);
    expect(await screen.findByText('Wed, Oct 28')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });
});

describe('a booking whose day has passed', () => {
  it('is rendered, not hidden — with the day it needs and what to do about it', async () => {
    mockHome = {
      next: null,
      awaiting: [
        {
          id: 'a-past',
          petId: 'pet-a',
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
      awaiting: [
        { id: 'a-past', petId: 'pet-a', stamp: null, when: 'Mon, Sep 8', day: 'Mon, Sep 8', where: '', isToday: false },
      ],
      visits: [],
    };
    render(<VetVisitsScreen />);
    await screen.findByText('Mon, Sep 8');
    expect(screen.queryByText('Nyx’s visits, in one place')).toBeNull();
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

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save', expect.any(String)));
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
