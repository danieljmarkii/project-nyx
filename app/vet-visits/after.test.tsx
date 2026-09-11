import { Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AfterVisitScreen from './after';
import type { ActiveCourse, AppointmentDetail } from '../../lib/vetVisits';

// CUL-902 VV-4 — the after-visit screen's own wiring (§7 AC 7 and AC 11).
//
// Two claims, and both are about bugs that have actually shipped in this repo:
//
//   • AC 7's CUL-662 pin. A component already inside an RN `Modal` cannot reliably
//     present another one on iOS — it wedged the log sheet for every multi-pet
//     account. This screen hosts the medication setup AND the trial setup, so the
//     count of `Modal` nodes in its tree is asserted, open and closed.
//   • AC 11. `app/vet-visit.tsx:117` reads `activePet` at SAVE time, so the store
//     moving between opening the screen and saving writes the row under the wrong
//     pet. Here the pet comes from the appointment, and the store is driven
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

jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => true }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));
jest.mock('../../lib/sync', () => ({
  syncPendingMedications: jest.fn(async () => undefined),
  syncPendingVetAppointments: jest.fn(async () => undefined),
  syncPendingVetVisits: jest.fn(async () => undefined),
  syncPendingVetDocuments: jest.fn(async () => undefined),
}));
jest.mock('../../lib/haptics', () => ({ commitVisit: jest.fn() }));
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
  jest.clearAllMocks();
  mockLogFromAppointment.mockImplementation(async () => 'new-visit');
  mockLinkCourse.mockImplementation(async () => true);
  mockUpdateVisit.mockImplementation(async () => undefined);
  mockRepair.mockImplementation(async () => 0);
  mockAppointment = appointment();
  mockCourses = [];
  mockStoreState = { pets: [PET_A, PET_B], activePet: PET_A };
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

  it('*Stopped* ends the course, and does NOT link it', async () => {
    mockCourses = [course()];
    render(<AfterVisitScreen />);
    await screen.findByText('Cerenia');

    fireEvent.press(screen.getByText('Stopped'));
    const { endRegimen } = jest.requireMock('../../lib/medicationSetup');
    await waitFor(() => expect(endRegimen).toHaveBeenCalledTimes(1));
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
