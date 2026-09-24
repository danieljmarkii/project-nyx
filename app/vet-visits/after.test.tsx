import { Alert, Modal, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AfterVisitScreen from './after';
import { router } from 'expo-router';
import { StartTrialModal } from '../../components/profile/StartTrialModal';
import type { ActiveCourse, AppointmentDetail } from '../../lib/vetVisits';

// CUL-902 VV-4 — the after-visit screen's own wiring (§7 AC 7 and AC 11).
//
// Two claims, and both are about bugs that have actually shipped in this repo:
//
//   • AC 7's CUL-662 pin. A component already inside an RN `Modal` cannot reliably
//     present another one on iOS — it wedged the log sheet for every multi-pet
//     account. This screen hosts the medication setup AND the trial setup, so the
//     count of `Modal` nodes in its tree is asserted, open and closed.
//   • AC 11. The retired `app/vet-visit.tsx` read `activePet` at SAVE time, so the
//     store moving between opening the screen and saving wrote the row under the
//     wrong pet. Here the pet comes from the appointment, and the store is driven
//     mid-flight to prove it.

type LogArgs = { appointment: Pick<AppointmentDetail, 'id' | 'pet_id'>; visitedAt: string };

const mockLogFromAppointment = jest.fn(async (_input: LogArgs) => 'new-visit');
const mockLinkCourse = jest.fn(async (_id: string, _visit: string) => true);
const mockUpdateVisit = jest.fn(async () => undefined);
const mockRepair = jest.fn(async (_petId: string) => 0);
let mockAppointment: AppointmentDetail | null = null;
let mockCourses: ActiveCourse[] = [];

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

jest.mock('../../lib/sync', () => ({
  syncPendingMedications: jest.fn(async () => undefined),
  syncPendingVetAppointments: jest.fn(async () => undefined),
  syncPendingVetVisits: jest.fn(async () => undefined),
  syncPendingVetDocuments: jest.fn(async () => undefined),
}));
jest.mock('../../lib/haptics', () => ({ commitVisit: jest.fn(), destructiveConfirm: jest.fn() }));
jest.mock('../../lib/visitPaperwork', () => ({
  captureVisitPaperwork: jest.fn(async () => ({ groupId: null, skipped: null })),
  forgetPaperwork: jest.fn(async () => undefined),
  readPaperworkFor: jest.fn(async () => []),
}));
jest.mock('../../lib/vetDocumentLibrary', () => ({
  linkVetDocumentVisit: jest.fn(async () => undefined),
}));
jest.mock('../../lib/medicationSetup', () => ({ endRegimen: jest.fn(async () => undefined) }));
jest.mock('../../lib/dietTrialSetup', () => {
  // requireActual, and the reason is C-34 rather than convenience: `StartTrialModal`
  // pulls ~20 PURE helpers out of this module (`canStartTrial`, `defaultDurationDays`,
  // `startSheetIntro`, the copy…), and a hand-written stand-in that listed only the
  // three READS left every one of them `undefined` — so the sheet threw on mount and
  // the Modal count this file exists to pin measured zero. The read is what needs
  // stubbing; the rule never is.
  const actual = jest.requireActual('../../lib/dietTrialSetup');
  return {
    ...actual,
    getActiveTrialForPet: jest.fn(async () => null),
    endActiveTrial: jest.fn(async () => undefined),
  };
});

jest.mock('../../lib/vetVisits', () => {
  // The formatters and `describeVisitSave`'s inputs are PURE; only the reads and the
  // writes are stood in for (C-34 — the read is what needs stubbing, never the rule).
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readAppointmentById: jest.fn(async () => mockAppointment),
    readActiveCourses: jest.fn(async () => mockCourses),
    readVisitPrefill: jest.fn(async () => ({ clinicName: null, vetName: null, suggestedDate: null })),
    readVisitConsequence: jest.fn(async () => ({ isLatest: true, isBeforeToday: false })),
    readTrialVisitLink: jest.fn(async () => null),
    repairRefusedVisitLinks: (petId: string) => mockRepair(petId),
    // Wrapped rather than passed directly: a `jest.mock` factory is hoisted above the
    // `const` declarations and runs on the first require of the mocked module, while
    // these are still in their temporal dead zone.
    logVisitFromAppointment: (input: LogArgs) => mockLogFromAppointment(input),
    logVetVisit: jest.fn(async () => 'cold-visit'),
    linkCourseToVisit: (id: string, visit: string) => mockLinkCourse(id, visit),
    linkTrialToVisit: jest.fn(async () => true),
    updateVisitDetails: () => mockUpdateVisit(),
    bookVetAppointment: jest.fn(async () => 'new-appointment'),
  };
});

const PET_A = { id: 'pet-a', name: 'Nyx', species: 'dog' };
const PET_B = { id: 'pet-b', name: 'Juniper', species: 'cat' };
let mockStoreState: { pets: typeof PET_A[]; activePet: typeof PET_A | null };

jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel(mockStoreState),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

function appointment(over: Partial<AppointmentDetail> = {}): AppointmentDetail {
  return {
    id: 'appt-1',
    // THE APPOINTMENT IS PET A'S, and every AC 11 assertion below turns on this one
    // field travelling with the row rather than being looked up at save time.
    pet_id: 'pet-a',
    // A LOCAL-components instant, not a UTC literal: the CI matrix runs this suite at
    // UTC+14, UTC+12:45 and UTC−10, and a `…Z` literal is a different calendar day in
    // two of them (C-29).
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

/**
 * Answers the next `Alert.alert` by pressing the button with this label, and returns
 * the spy. RN's Alert is a native call with no tree to press into, so the button's
 * own `onPress` is what a tap would run.
 */
function answerAlertWith(label: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === label)?.onPress?.();
  });
}

/** Today's LOCAL day key, built from components (C-29) — what the screen writes. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function course(over: Partial<ActiveCourse> = {}): ActiveCourse {
  return {
    id: 'med-1',
    petId: 'pet-a',
    medicationItemId: null,
    drugName: 'Cerenia',
    doseAmount: '16 mg',
    route: 'oral',
    dosesPerDay: null,
    scheduleNotes: null,
    indication: null,
    prescribedBy: null,
    startedAt: '2026-07-30',
    targetDurationDays: null,
    targetDurationDoses: null,
    vetVisitId: null,
    ...over,
  };
}

/** Every RN `Modal` currently in the rendered tree. */
const modals = () => screen.UNSAFE_queryAllByType(Modal);

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockLogFromAppointment.mockImplementation(async () => 'new-visit');
  mockLinkCourse.mockImplementation(async () => true);
  mockUpdateVisit.mockImplementation(async () => undefined);
  mockRepair.mockImplementation(async () => 0);
  mockAppointment = appointment();
  mockCourses = [];
  mockStoreState = { pets: [PET_A, PET_B], activePet: PET_A };
  // Reset, not just cleared: the CUL-951 trial suite swaps this read's implementation,
  // and `clearAllMocks` keeps implementations.
  jest.requireMock('../../lib/dietTrialSetup').getActiveTrialForPet.mockImplementation(async () => null);
});

describe('AC 11 — the screen writes under the appointment’s pet', () => {
  it('saves under pet A even after the store’s active pet moves to B', async () => {
    const { rerender } = render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');

    // The store moves under the open screen — a hydration pull landing mid-capture,
    // which is exactly what `setPets` does.
    await act(async () => {
      mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
      rerender(<AfterVisitScreen />);
    });

    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    expect(mockLogFromAppointment.mock.calls[0][0].appointment.pet_id).toBe('pet-a');
  });

  it('keeps naming pet A after the switch, rather than following the store', async () => {
    const { rerender } = render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');

    await act(async () => {
      mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
      rerender(<AfterVisitScreen />);
    });

    // A screen that renamed itself here would be telling the owner this visit belongs
    // to a pet it does not.
    expect(screen.getByText('Save Nyx’s visit')).toBeTruthy();
  });
});

describe('a visit that HAPPENED cannot be dated in the future', () => {
  it('clamps an appointment booked weeks out to today, with no tap on the picker', async () => {
    // The adversarial path, in two taps: an owner books a six-week recheck, then taps
    // *How did it go?* under **Next** — which `app/vet-visits/index.tsx` renders with
    // no date gate — and just saves. `maximumDate` on the picker constrains a PICK,
    // never a seed, so the unclamped version wrote `visited_at` 42 days out. The
    // report then skipped the row for 42 days while the rundown's unbounded
    // MAX(visited_at) adopted it and rendered an absence over an impossible window.
    const weeksOut = new Date();
    weeksOut.setDate(weeksOut.getDate() + 42);
    mockAppointment = appointment({ scheduled_at: weeksOut.toISOString() });

    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    fireEvent.press(screen.getByText('Save Nyx’s visit'));

    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    const written = mockLogFromAppointment.mock.calls[0][0].visitedAt;
    const now = new Date();
    const todayKey =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // Anchored to the clock rather than to a literal date, so this cannot fail on a
    // calendar boundary instead of on a change (C-29's time-axis half).
    expect(written).toBe(todayKey);
  });

  it('leaves a PAST appointment’s own day alone — the clamp is a ceiling, not a default', async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    mockAppointment = appointment({ scheduled_at: lastWeek.toISOString() });

    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    fireEvent.press(screen.getByText('Save Nyx’s visit'));

    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    const expected =
      `${lastWeek.getFullYear()}-${String(lastWeek.getMonth() + 1).padStart(2, '0')}-${String(lastWeek.getDate()).padStart(2, '0')}`;
    expect(mockLogFromAppointment.mock.calls[0][0].visitedAt).toBe(expected);
  });
});

describe('AC 7 — exactly one Modal (the CUL-662 pin)', () => {
  it('mounts NO Modal while both sheets are closed', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    // A resident `<Modal visible={false}>` is still a Modal in the tree, so two
    // sheets kept mounted would be two even while both are shut. They are mounted
    // conditionally for exactly this reason.
    expect(modals()).toHaveLength(0);
  });

  it('presents exactly ONE Modal when the medication setup opens', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Started something new?');

    fireEvent.press(screen.getByLabelText('Add — Started something new?'));
    await waitFor(() => expect(modals()).toHaveLength(1));
  });

  it('presents exactly ONE Modal when the trial setup opens', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('A new food to try?');

    fireEvent.press(screen.getByLabelText('Start a trial — A new food to try?'));
    await waitFor(() => expect(modals()).toHaveLength(1));
  });

  it('the visit exists BEFORE a sheet opens, so a new course can carry its link', async () => {
    // §5.1: a NEW course carries the visit link in its OWN insert, "never a follow-up
    // UPDATE a crash can lose". That is only possible if the visit id exists at the
    // moment `startRegimen` writes — which is why the row is created on the first
    // plan action rather than at Save.
    render(<AfterVisitScreen />);
    await screen.findByText('Started something new?');

    fireEvent.press(screen.getByLabelText('Add — Started something new?'));
    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(modals()).toHaveLength(1));
  });
});

describe('CUL-503 — the trial sheet’s “Log a meal” lands on the meal logger', () => {
  // The button inside `StartTrialModal` reads "Log a meal for {pet}", so its door is the
  // meal logger — the same target its twin on the Pet tab has always had
  // (app/(tabs)/profile.tsx). This screen pushed the bare /log type picker instead, so an
  // owner who asked to log a meal met a grid of every event type (PM-ruled 2026-09-23).
  //
  // The prop is called directly rather than reached through the modal: the button sits
  // past a completed trial start, and what this screen owns is the WIRING it hands in.
  // The modal's own button → prop path is StartTrialModal's to pin.
  it('closes the trial sheet and pushes /log?type=meal, never the bare picker', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('A new food to try?');
    fireEvent.press(screen.getByLabelText('Start a trial — A new food to try?'));
    await waitFor(() => expect(modals()).toHaveLength(1));

    await act(async () => {
      screen.UNSAFE_getByType(StartTrialModal).props.onLogFirstMeal();
    });

    expect(router.push).toHaveBeenCalledWith('/log?type=meal');
    expect(router.push).not.toHaveBeenCalledWith('/log');
    expect(screen.UNSAFE_queryAllByType(StartTrialModal)).toHaveLength(0);
  });
});

describe('the visit is created ONCE, however fast the taps land', () => {
  it('two plan actions in one tick create ONE visit, not two', async () => {
    mockCourses = [course()];
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    // `busyRow` is STATE, so two presses in the same tick both read `null` and both
    // proceed past it. Two `vet_visits` rows for one visit is the worst outcome on
    // this screen: the appointment points at one, the plan links split across both,
    // and the report window anchors on whichever sorts first.
    await act(async () => {
      fireEvent.press(screen.getByText('Keep'));
      fireEvent.press(screen.getByLabelText('Add — Started something new?'));
    });

    await waitFor(() => expect(mockLinkCourse).toHaveBeenCalled());
    expect(mockLogFromAppointment).toHaveBeenCalledTimes(1);
  });

  it('Save is INERT while a plan row is writing — one mutex, not two', async () => {
    // `handleSave` checked only `saving`, so a Save landing while a row's write was in
    // flight ran concurrently with it. The in-flight promise means they can no longer
    // create two visits — but the moment's `linked` list is built from the row
    // handlers' own `note()` calls, and one that had not fired yet would simply be
    // missing from the list the owner is shown.
    //
    // WHAT THIS MEASURES, stated because the mutation result is surprising: the
    // BEHAVIOUR, not either layer. Two layers now hold it — the button's
    // `disabled={!!busyRow}` and `handleSave`'s own guard — and removing EITHER alone
    // leaves this green, because each is sufficient on its own. Removing BOTH reds it
    // (measured). That is the right shape for a test of "the control is inert": a
    // test that pinned one layer would go red on a refactor that moved the gate.
    mockCourses = [course()];
    // Hold the link write open so `busyRow` stays set across the Save press.
    let releaseLink: () => void = () => {};
    mockLinkCourse.mockImplementation(
      () => new Promise<boolean>((resolve) => { releaseLink = () => resolve(true); }),
    );
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    await act(async () => { fireEvent.press(screen.getByText('Keep')); });
    await waitFor(() => expect(mockLinkCourse).toHaveBeenCalled());

    // Save, mid-write. It must not run.
    await act(async () => { fireEvent.press(screen.getByText('Save Nyx’s visit')); });
    expect(screen.queryByText('Saved to Nyx’s visits')).toBeNull();

    await act(async () => { releaseLink(); });
    // And it works again the moment the row is done.
    await waitFor(() => expect(screen.getByText('Save Nyx’s visit')).toBeTruthy());
    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    await screen.findByText('Saved to Nyx’s visits');
  });

  it('a FAILED create can be retried — the in-flight slot is cleared either way', async () => {
    mockCourses = [course()];
    mockLogFromAppointment.mockRejectedValueOnce(new Error('disk full'));
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    await act(async () => { fireEvent.press(screen.getByText('Keep')); });
    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    expect(mockLinkCourse).not.toHaveBeenCalled();

    // A retry must be a retry, not a re-await of a promise that already rejected.
    await act(async () => { fireEvent.press(screen.getByText('Keep')); });
    await waitFor(() => expect(mockLinkCourse).toHaveBeenCalledTimes(1));
    expect(mockLogFromAppointment).toHaveBeenCalledTimes(2);
  });
});

describe('AC 7 — the plan rows read the record before they ask', () => {
  it('renders an ACTIVE course as a confirmation, not a blank form', async () => {
    mockCourses = [course()];
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');
    // *Keep · Changed · Stopped* — the row asks what the vet decided about a course
    // the record already holds (R-D1).
    expect(screen.getByText('Keep')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getByText('Stopped')).toBeTruthy();
  });

  it('*Keep* writes ONLY the link — the visit is created and the course is linked', async () => {
    mockCourses = [course()];
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Keep'));
    await waitFor(() => expect(mockLinkCourse).toHaveBeenCalledTimes(1));
    expect(mockLinkCourse.mock.calls[0]).toEqual(['med-1', 'new-visit']);
    // `endRegimen` is what would change `COUNT(*) WHERE status = 'active'`, and
    // *Keep* must leave it exactly where it was.
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    expect(endRegimen).not.toHaveBeenCalled();
  });

  it('*Keep* on an ALREADY-linked course says "still on it", never "linked to this visit"', async () => {
    // First provenance wins, so the write returns false — and the moment's line must
    // follow the record rather than the verdict (CUL-825). The line is what an owner
    // reads to know what the save did; claiming a link it did not make would be the
    // moment lying about where a prescription came from.
    mockCourses = [course({ vetVisitId: 'visit-march' })];
    mockLinkCourse.mockResolvedValue(false);
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Keep'));
    await waitFor(() => expect(mockLinkCourse).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    await screen.findByText('Saved to Nyx’s visits');
    expect(screen.getByText('still on it')).toBeTruthy();
    expect(screen.queryByText('linked to this visit')).toBeNull();
  });

  it('*Stopped* ends the course once confirmed, and does NOT link it', async () => {
    mockCourses = [course()];
    const alert = answerAlertWith('Stop it');
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Stopped'));
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    await waitFor(() => expect(endRegimen).toHaveBeenCalledTimes(1));
    expect(alert).toHaveBeenCalledTimes(1);
    // `vet_visit_id` is where a course CAME FROM, and a course stopped at this visit
    // started somewhere else. Linking it would put it in the visit's plan tags as
    // something the vet prescribed here.
    expect(mockLinkCourse).not.toHaveBeenCalled();
  });

  it('saving with nothing typed is allowed', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
  });

  it('*Later* is the resting state — every row saves untouched, with no control for it', async () => {
    mockCourses = [course()];
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    // Principle 1: a button for "do nothing" would add a decision to a screen whose
    // whole argument is that it asks for none.
    expect(screen.queryByText('Later')).toBeNull();

    fireEvent.press(screen.getByText('Save Nyx’s visit'));
    await waitFor(() => expect(mockLogFromAppointment).toHaveBeenCalledTimes(1));
    expect(mockLinkCourse).not.toHaveBeenCalled();
  });
});

describe('the saved moment (AC 8)', () => {
  it('replaces the form, names the pet, and never says "from today"', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    fireEvent.press(screen.getByText('Save Nyx’s visit'));

    await screen.findByText('Saved to Nyx’s visits');
    // The form is gone — the moment is the screen, not a banner over a live form
    // whose Save would fire a second time.
    expect(screen.queryByText('Save Nyx’s visit')).toBeNull();
    expect(screen.getByText(/On this phone now/)).toBeTruthy();
    expect(screen.queryByText(/from today/i)).toBeNull();
  });

  it('fires a soft commit haptic, never a success chime', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    fireEvent.press(screen.getByText('Save Nyx’s visit'));

    await screen.findByText('Saved to Nyx’s visits');
    // `commitVisit`, not `commitRoutine` — the verb a meal uses plays the system
    // SUCCESS notification, and the issue rules that out for a visit.
    const { commitVisit } = jest.requireMock('../../lib/haptics');
    expect(commitVisit).toHaveBeenCalledTimes(1);
  });
});

describe('CUL-945 — the quarantine repair runs where the owner already is', () => {
  it('repairs this pet’s refused links on load', async () => {
    render(<AfterVisitScreen />);
    await screen.findByText('Save Nyx’s visit');
    await waitFor(() => expect(mockRepair).toHaveBeenCalledWith('pet-a'));
  });
});

// CUL-951 — the one safety net on *Stopped* / *Ended* (C-21), and the row that says
// what happened instead of vanishing. PM ruling 2026-09-22: a confirm BEFORE, naming
// the course or trial and the day it ends.
describe('CUL-951 — *Stopped* confirms first, then the row settles in place', () => {
  it('asks before anything is written, naming the course, the pet and the day', async () => {
    mockCourses = [course()];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Stopped'));
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alert.mock.calls[0];
    expect(title).toBe('Stop Cerenia?');
    expect(body).toMatch(/^Nyx’s Cerenia course ends today, [A-Z][a-z]{2} \d{1,2}\./);
    expect((buttons ?? []).map((b) => b.text)).toEqual(['Keep it', 'Stop it']);
    expect(buttons?.[0].style).toBe('cancel');
    expect(buttons?.[1].style).toBe('destructive');

    // Nothing is written while the dialog is up — not the course, and not the visit
    // row the first plan action would mint.
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    expect(endRegimen).not.toHaveBeenCalled();
    expect(mockLogFromAppointment).not.toHaveBeenCalled();
  });

  it('*Keep it* writes nothing, mints no visit, and leaves the row unanswered', async () => {
    mockCourses = [course()];
    answerAlertWith('Keep it');
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    await act(async () => { fireEvent.press(screen.getByText('Stopped')); });
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    const { destructiveConfirm } = jest.requireMock('../../lib/haptics');
    expect(endRegimen).not.toHaveBeenCalled();
    expect(mockLogFromAppointment).not.toHaveBeenCalled();
    expect(destructiveConfirm).not.toHaveBeenCalled();
    // The chips are still there to answer.
    expect(screen.getByText('Keep')).toBeTruthy();
    expect(screen.getByText('Stopped')).toBeTruthy();
  });

  it('writes the SAME day the confirm named, with the rigid haptic on the confirm', async () => {
    mockCourses = [course()];
    answerAlertWith('Stop it');
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Stopped'));
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    await waitFor(() => expect(endRegimen).toHaveBeenCalledTimes(1));
    expect(endRegimen).toHaveBeenCalledWith('med-1', localToday());
    const { destructiveConfirm } = jest.requireMock('../../lib/haptics');
    expect(destructiveConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps the stopped course on screen, saying so, after the active read drops it', async () => {
    // The two courses the record holds; stopping Cerenia makes the ACTIVE read return
    // only Apoquel, which is what dropped the row before this fix.
    mockCourses = [course(), course({ id: 'med-2', drugName: 'Apoquel' })];
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    endRegimen.mockImplementationOnce(async () => {
      mockCourses = [course({ id: 'med-2', drugName: 'Apoquel' })];
    });
    answerAlertWith('Stop it');
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getAllByText('Stopped')[0]);
    await screen.findByText('Stopped today');
    expect(screen.getByText('Cerenia')).toBeTruthy();
    // Settled means answered: Cerenia has no chips left, Apoquel still has its three.
    expect(screen.getAllByText('Stopped')).toHaveLength(1);
    expect(screen.getAllByText('Keep')).toHaveLength(1);
    // In the place it held — above Apoquel, not re-sorted to the bottom.
    const order = screen.getAllByText(/^(Cerenia|Apoquel)$/).map((n) => n.props.children);
    expect(order).toEqual(['Cerenia', 'Apoquel']);
  });
});

describe('CUL-951 — *Ended* confirms first, and never turns into *Start a trial*', () => {
  const TRIAL = { id: 'trial-1', startedAt: '2026-09-01', targetDurationDays: 56, foodLabel: 'Hill’s z/d' };

  beforeEach(() => {
    const { getActiveTrialForPet } = jest.requireMock('../../lib/dietTrialSetup');
    getActiveTrialForPet.mockImplementation(async () => TRIAL);
  });

  it('asks before ending, naming the trial and the day', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<AfterVisitScreen />);
    await screen.findByText('Hill’s z/d');

    fireEvent.press(screen.getByText('Ended'));
    const [title, body, buttons] = alert.mock.calls[0];
    expect(title).toBe('End the Hill’s z/d trial?');
    expect(body).toMatch(/^Nyx’s trial ends today, [A-Z][a-z]{2} \d{1,2}\./);
    expect((buttons ?? []).map((b) => b.text)).toEqual(['Keep it', 'End it']);
    const { endActiveTrial } = jest.requireMock('../../lib/dietTrialSetup');
    expect(endActiveTrial).not.toHaveBeenCalled();
  });

  it('*Keep it* leaves the trial running and unanswered', async () => {
    answerAlertWith('Keep it');
    render(<AfterVisitScreen />);
    await screen.findByText('Hill’s z/d');

    await act(async () => { fireEvent.press(screen.getByText('Ended')); });
    const { endActiveTrial } = jest.requireMock('../../lib/dietTrialSetup');
    expect(endActiveTrial).not.toHaveBeenCalled();
    expect(screen.getByText('Switched')).toBeTruthy();
  });

  it('once confirmed, the row says the trial ended — and *Start a trial* does not appear', async () => {
    const { endActiveTrial, getActiveTrialForPet } = jest.requireMock('../../lib/dietTrialSetup');
    endActiveTrial.mockImplementationOnce(async () => {
      // The record after the end: no running trial, which is what rendered the
      // *Start a trial* door in the ended trial's place.
      getActiveTrialForPet.mockImplementation(async () => null);
    });
    answerAlertWith('End it');
    render(<AfterVisitScreen />);
    await screen.findByText('Hill’s z/d');

    fireEvent.press(screen.getByText('Ended'));
    await screen.findByText('Ended today');
    expect(endActiveTrial).toHaveBeenCalledTimes(1);
    // The day the confirm named is the day handed to the write — one value, as on
    // the course path (code-review finding: computed twice, they can straddle midnight).
    expect(endActiveTrial.mock.calls[0][0]).toMatchObject({ trialId: 'trial-1', endedOn: localToday() });
    expect(screen.getByText('Hill’s z/d')).toBeTruthy();
    expect(screen.queryByText('Start a trial')).toBeNull();
    expect(screen.queryByText('A new food to try?')).toBeNull();
    const { destructiveConfirm } = jest.requireMock('../../lib/haptics');
    expect(destructiveConfirm).toHaveBeenCalledTimes(1);
  });

  it('*Keep* and *Switched* open no confirm — only the irreversible chip asks', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<AfterVisitScreen />);
    await screen.findByText('Hill’s z/d');

    await act(async () => { fireEvent.press(screen.getByText('Keep')); });
    // *Switched* opens the trial sheet, whose own blocked step owns the end-and-start.
    await act(async () => { fireEvent.press(screen.getByText('Switched')); });
    expect(alert).not.toHaveBeenCalled();
    const { endActiveTrial } = jest.requireMock('../../lib/dietTrialSetup');
    expect(endActiveTrial).not.toHaveBeenCalled();
  });
});
