// The Home appointment strip (CUL-903 VV-5; spec §4.1 A2 / A2b, §7 AC 3).
//
// The subject is the four things AC 3 makes the strip answerable for: it renders only
// inside the window, it disappears when the visit is logged or the appointment is
// cancelled, it asks exactly once after the day passes, and it is dark off the flag.
// Plus the one the PM ruled on 2026-09-11: Home gains a CONFIRMATION and no form.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    require('react').useEffect(() => cb(), [cb]);
  },
}));

const flags = { eligible: true, optedIn: true };
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => flags.eligible }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => flags.optedIn }));
const activePet: { current: { id: string; name: string; species: string } } = {
  current: { id: 'p1', name: 'Mochi', species: 'cat' },
};
jest.mock('../../store/petStore', () => {
  const read = () => ({ activePet: activePet.current, pets: [activePet.current] });
  return {
    usePetStore: Object.assign(
      (selector?: (s: ReturnType<typeof read>) => unknown) =>
        selector ? selector(read()) : read(),
      { getState: read },
    ),
  };
});
jest.mock('../../lib/sync', () => ({ syncPendingVetAppointments: jest.fn(async () => undefined) }));

const mockHome = { current: null as unknown };
// Per-pet answers plus a controllable hold, so a test can park ONE read open while a
// newer one for a different pet overtakes it.
const mockByPet: Record<string, unknown> = {};
const mockGate: { holdNext: boolean; release: null | (() => void) } = {
  holdNext: false,
  release: null,
};
const mockAsked = { value: false };
jest.mock('../../lib/vetVisits', () => {
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    // The formatters and `resolveStripPhase` are PURE and stay real — a mock standing
    // in for a pure function makes the test re-derive the rule it is checking (C-34).
    ...actual,
    readHomeAppointment: jest.fn(async (petId: string) => {
      if (mockGate.holdNext) {
        mockGate.holdNext = false;
        await new Promise<void>((resolve) => {
          mockGate.release = resolve;
        });
      }
      return petId in mockByPet ? mockByPet[petId] : mockHome.current;
    }),
    cancelVetAppointment: jest.fn(async () => undefined),
  };
});
jest.mock('../../lib/appointmentAsked', () => ({
  hasAskedAboutAppointment: jest.fn(async () => mockAsked.value),
  markAppointmentAsked: jest.fn(async () => undefined),
}));

import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppointmentStrip } from './AppointmentStrip';
import { cancelVetAppointment, readHomeAppointment, type HomeAppointment } from '../../lib/vetVisits';
import { markAppointmentAsked } from '../../lib/appointmentAsked';

function homeAppointment(phase: 'upcoming' | 'after'): HomeAppointment {
  return {
    id: 'appt-1',
    petId: 'p1',
    phase,
    view: {
      id: 'appt-1',
      petId: 'p1',
      stamp: { day: '16', month: 'Sep' },
      when: 'Tuesday · 3:00 pm',
      day: 'Tuesday',
      // VV-4's gate on the visit's own doors; the strip has its own five-day window
      // (`resolveStripPhase`) and never reads this.
      isToday: true,
      where: 'Riverside Animal Hospital · recheck',
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  flags.eligible = true;
  flags.optedIn = true;
  mockHome.current = null;
  mockAsked.value = false;
  mockGate.holdNext = false;
  mockGate.release = null;
  for (const k of Object.keys(mockByPet)) delete mockByPet[k];
  activePet.current = { id: 'p1', name: 'Mochi', species: 'cat' };
});

describe('the flag gates the strip AND the read', () => {
  it('renders nothing and reads nothing when the account is not allowlisted', async () => {
    flags.eligible = false;
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    await act(async () => {});
    expect(r.toJSON()).toBeNull();
    // A dark feature reads nothing either: the gate is not only about pixels.
    expect(readHomeAppointment).not.toHaveBeenCalled();
  });

  it('renders nothing when the owner has not opted in', async () => {
    flags.optedIn = false;
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    await act(async () => {});
    expect(r.toJSON()).toBeNull();
    expect(readHomeAppointment).not.toHaveBeenCalled();
  });

  it('renders nothing when there is no booking in the window', async () => {
    const r = render(<AppointmentStrip />);
    await act(async () => {});
    expect(r.toJSON()).toBeNull();
  });
});

describe('inside the window — two doors, and neither is a form', () => {
  it('shows the appointment and its two doors', async () => {
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    expect(await r.findByText('Tuesday · 3:00 pm')).toBeTruthy();
    expect(r.getByText('Get ready')).toBeTruthy();
    expect(r.getByText('Add a question')).toBeTruthy();
  });

  it('Get ready opens the rundown for THIS appointment', async () => {
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('Get ready'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/rundown',
      params: { appointmentId: 'appt-1' },
    });
  });

  it('*Add a question* NAVIGATES — Home carries no form (the 2026-09-11 ruling)', async () => {
    // D1's second-door clause: a control that opens a form on Home is forbidden. The
    // typing happens in Get ready, beside the questions already there.
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('Add a question'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/rundown',
      params: { appointmentId: 'appt-1', ask: '1' },
    });
    // And nothing was written by the tap.
    expect(cancelVetAppointment).not.toHaveBeenCalled();
  });

  it('never carries urgency copy', async () => {
    // §4.1 A2: an appointment is context. The strip states the fact and offers two
    // doors; it does not tell the owner anything is wrong.
    mockHome.current = homeAppointment('upcoming');
    const r = render(<AppointmentStrip />);
    await r.findByText('Tuesday · 3:00 pm');
    const text = JSON.stringify(r.toJSON());
    // Word-bounded: a bare /now/ would also match "know" and red on a future,
    // perfectly calm string.
    expect(text).not.toMatch(/\b(urgent|urgently|overdue|don.t forget|hurry|asap)\b|!/i);
  });
});

describe('after the day — one ask, then gone', () => {
  it('asks once, naming the visit', async () => {
    mockHome.current = homeAppointment('after');
    const r = render(<AppointmentStrip />);
    // The DAY half, not the joined `when` — "Did Tuesday · 3:00 pm's visit happen?"
    // was what the first cut rendered.
    expect(await r.findByText('Did Tuesday’s visit happen?')).toBeTruthy();
    expect(r.getByText('Yes — how did it go?')).toBeTruthy();
    expect(r.getByText('It didn’t')).toBeTruthy();
  });

  it('does NOT ask again once this device has asked', async () => {
    mockHome.current = homeAppointment('after');
    mockAsked.value = true;
    const r = render(<AppointmentStrip />);
    await act(async () => {});
    expect(r.toJSON()).toBeNull();
  });

  it('*Yes* spends the ask and opens the capture screen', async () => {
    mockHome.current = homeAppointment('after');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('Yes — how did it go?'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/vet-visit'));
    // Spent either way: if the owner backs out of the capture screen without saving,
    // Home has already asked once.
    expect(markAppointmentAsked).toHaveBeenCalledWith('appt-1', expect.any(String));
  });
});

describe('*It didn’t* — Home’s one write, and it is confirmed first', () => {
  it('confirms before removing, and names what changes and what does not', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockHome.current = homeAppointment('after');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('It didn’t'));

    expect(spy).toHaveBeenCalled();
    const [, body] = spy.mock.calls[0];
    // C-21: exactly one safety net, and for a write with no undo it is the confirm.
    // It says what leaves the record AND what stays — an owner who rescheduled rather
    // than skipped needs to know the old row is going away.
    expect(body).toMatch(/upcoming visits/);
    expect(body).toMatch(/Nothing else in the record changes/);
    // Nothing written yet.
    expect(cancelVetAppointment).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('cancels and leaves Home once the confirm is taken', async () => {
    const spy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => {
        const remove = (buttons ?? []).find((b) => b.text === 'Remove it');
        remove?.onPress?.();
      });
    mockHome.current = homeAppointment('after');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('It didn’t'));

    await waitFor(() => expect(cancelVetAppointment).toHaveBeenCalledWith('appt-1'));
    await waitFor(() => expect(r.toJSON()).toBeNull());
    // The ask is spent too, so a stale read cannot bring it back before the next load.
    expect(markAppointmentAsked).toHaveBeenCalledWith('appt-1', expect.any(String));
    spy.mockRestore();
  });

  it('says a failed cancel rather than leaving the strip looking handled', async () => {
    (cancelVetAppointment as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    const alerts: string[] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((title, _m, buttons) => {
      alerts.push(String(title));
      (buttons ?? []).find((b) => b.text === 'Remove it')?.onPress?.();
    });
    mockHome.current = homeAppointment('after');
    const r = render(<AppointmentStrip />);
    fireEvent.press(await r.findByText('It didn’t'));

    await waitFor(() => expect(alerts).toContain('Couldn’t remove it'));
    // And the strip stays put, so the owner can see the appointment is still there.
    expect(r.queryByText(/Did Tuesday/)).toBeTruthy();
    spy.mockRestore();
  });
});

describe('a slow read for the previous pet cannot hide the current pet’s strip', () => {
  it('keeps pet B’s appointment when pet A’s read resolves late', async () => {
    // `loadedFor` alone stops the strip ever SHOWING A's row under B's name — the render
    // check does that. What it does not stop is the out-of-order WRITE: A's late read
    // sets `loadedFor` back to A, and the strip B had correctly rendered disappears
    // until the next focus. A real upcoming appointment silently missing after a routine
    // pet switch, on the surface whose whole job is to surface it.
    mockByPet['p1'] = homeAppointment('upcoming');
    mockByPet['p2'] = {
      ...(homeAppointment('upcoming') as HomeAppointment),
      id: 'appt-2',
      petId: 'p2',
      view: { ...(homeAppointment('upcoming') as HomeAppointment).view, where: 'Second Clinic' },
    };

    mockGate.holdNext = true;
    const r = render(<AppointmentStrip />);
    await waitFor(() => expect(mockGate.release).not.toBeNull());

    // The owner switches pets; B's read is fast and renders.
    activePet.current = { id: 'p2', name: 'Biscuit', species: 'dog' };
    r.rerender(<AppointmentStrip />);
    await r.findByText('Second Clinic');

    // A's stale read lands. B must still be on screen.
    await act(async () => {
      mockGate.release?.();
    });
    expect(r.queryByText('Second Clinic')).toBeTruthy();
  });
});
