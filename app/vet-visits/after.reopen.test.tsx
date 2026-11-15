import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AfterVisitScreen from './after';
import { router } from 'expo-router';
import { AddMedicationModal } from '../../components/profile/AddMedicationModal';
import type { ActiveCourse, AppointmentDetail, LocalVetVisit, VisitConsequence, VisitLinkedCourse, VisitLinkedTrial } from '../../lib/vetVisits';

// CUL-2754 (After the visit PR-02, §4.4 R1/R3/R5, ACs 14 to 16 and 21): a SAVED visit
// reopens on How did it go? by its id.
//
// What is pinned here, each a way the reopen could quietly damage a record:
//   • It never writes a second `vet_visits` row (both create paths are spied, and neither
//     may run), with a booking behind the visit and without one.
//   • An old visit offers no chip on a course it did not start: *Keep* links first-wins, so
//     a chip there would let September's visit claim October's prescription (AC 15).
//   • A *Done* with nothing changed writes nothing, so `updated_at` cannot move and win an
//     LWW race over a real edit on another phone (AC 16). Leaving keeps what was typed.
//   • Every write is under the VISIT's pet, whatever the store's active pet is (AC 21).
//   • The report-window note asks the record about the date in the picker (moved here from
//     the retired edit screen's suite, which pinned the same four claims).

let mockParams: Record<string, string> = { visit: 'v-sep' };
jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => mockParams,
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
jest.mock('../../lib/storage', () => ({ getSignedUrls: jest.fn(async () => new Map()) }));
jest.mock('../../lib/haptics', () => ({ commitVisit: jest.fn(), destructiveConfirm: jest.fn() }));
jest.mock('../../lib/visitPaperwork', () => ({
  captureVisitPaperwork: jest.fn(async () => ({ groupId: null, skipped: null })),
  forgetPaperwork: jest.fn(async () => undefined),
  readPaperworkFor: jest.fn(async () => []),
}));
jest.mock('../../lib/vetDocumentLibrary', () => ({ linkVetDocumentVisit: jest.fn(async () => undefined) }));
jest.mock('../../lib/medicationSetup', () => ({ endRegimen: jest.fn(async () => undefined) }));
// The two setup sheets are stood in for: what is asserted is the props the screen hands
// them (the pet, the visit), and their own suites cover what they render.
jest.mock('../../components/profile/AddMedicationModal', () => ({ AddMedicationModal: () => null }));
jest.mock('../../components/profile/StartTrialModal', () => ({ StartTrialModal: () => null }));

let mockActiveTrial: { id: string; startedAt: string; targetDurationDays: number; foodLabel: string | null } | null = null;
jest.mock('../../lib/dietTrialSetup', () => {
  const actual = jest.requireActual('../../lib/dietTrialSetup');
  return { ...actual, getActiveTrialForPet: jest.fn(async () => mockActiveTrial), endActiveTrial: jest.fn(async () => undefined) };
});

let mockVisit: LocalVetVisit | null = null;
let mockBooking: AppointmentDetail | null = null;
let mockCourses: ActiveCourse[] = [];
let mockPlan: { courses: VisitLinkedCourse[]; trials: VisitLinkedTrial[] } = { courses: [], trials: [] };
let mockTrialLink: string | null = null;
let mockRecheckBooking: { id: string; scheduledAt: string; when: string; where: string } | null = null;
const mockReadRecheckBooking = jest.fn(async (_visit: unknown) => mockRecheckBooking);
let mockConsequence: VisitConsequence = { isLatest: false, dayRelation: 'before_today' };
let mockConsequenceThrows = false;
let mockDeferred: { promise: Promise<VisitConsequence>; settle: (c: VisitConsequence) => void } | null = null;
const mockReadConsequence = jest.fn();
const mockUpdateVisit = jest.fn(async (_id: string, _patch: Record<string, unknown>) => undefined);
const mockLinkCourse = jest.fn(async (_id: string, _visit: string) => false);
const mockLogVetVisit = jest.fn(async () => 'second-visit');
const mockLogFromAppointment = jest.fn(async () => 'second-visit');

jest.mock('../../lib/vetVisits', () => {
  // Pure helpers stay REAL (`visitFieldsPatch`, the formatters, `clampVisitDate`): they
  // decide what the screen writes, and stubbing them would test the stub (C-34).
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readVetVisitDetail: jest.fn(async () =>
      mockVisit
        ? {
            visit: mockVisit,
            links: { medicationNames: [], trialCount: 0, documentCount: 1, hasNextVisit: false },
            questions: [],
            medications: [],
            trials: [],
            documents: [{ groupId: 'doc-1', title: null, kind: 'other', documentDate: null }],
          }
        : null,
    ),
    readAppointmentForVisit: jest.fn(async () => mockBooking),
    readAppointmentById: jest.fn(async () => null),
    readActiveCourses: jest.fn(async () => mockCourses),
    readVisitPlanRecord: jest.fn(async () => mockPlan),
    readTrialVisitLink: jest.fn(async () => mockTrialLink),
    readVisitPrefill: jest.fn(async () => ({ clinicName: null, vetName: null, suggestedDate: null })),
    readVisitConsequence: (...args: unknown[]) => {
      mockReadConsequence(...args);
      if (mockDeferred) return mockDeferred.promise;
      if (mockConsequenceThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve(mockConsequence);
    },
    repairRefusedVisitLinks: jest.fn(async () => 0),
    logVetVisit: () => mockLogVetVisit(),
    logVisitFromAppointment: () => mockLogFromAppointment(),
    linkCourseToVisit: (id: string, visit: string) => mockLinkCourse(id, visit),
    linkTrialToVisit: jest.fn(async () => false),
    updateVisitDetails: (id: string, patch: Record<string, unknown>) => mockUpdateVisit(id, patch),
    bookVetAppointment: jest.fn(async () => 'appt-new'),
    readRecheckBooking: (visit: unknown) => mockReadRecheckBooking(visit),
  };
});

let mockConcerns: Array<{ sign: string; title: string; state: string; answerableFrom: string | null }> = [];
let mockAnswered = new Set<string>();
const mockRecordCareAnswer = jest.fn(async (_input: Record<string, unknown>) => 'answer-1');
jest.mock('../../lib/careVisitConcerns', () => ({
  readHomeConcerns: jest.fn(async () => mockConcerns),
  readCareVisitTicks: jest.fn(async () => new Set<string>()),
  clearCareVisitTicksFor: jest.fn(async () => undefined),
}));
jest.mock('../../lib/careAnswers', () => ({
  recordCareAnswer: (input: Record<string, unknown>) => mockRecordCareAnswer(input),
  readVisitCareAnswers: jest.fn(async () => mockAnswered),
  pushCareAnswers: jest.fn(async () => undefined),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: unknown, d?: Date) => void }) => <View testID="picker" pickerPick={onChange} />,
  };
});

const PET_A = { id: 'pet-a', name: 'Nyx', species: 'cat' };
const PET_B = { id: 'pet-b', name: 'Juniper', species: 'cat' };
let mockStoreState: { pets: typeof PET_A[]; activePet: typeof PET_A | null };
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel(mockStoreState),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

/** A day `n` days back, as the DATE key the column holds, anchored to now (C-29). */
function dayKeyBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayBack(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function savedVisit(over: Partial<LocalVetVisit> = {}): LocalVetVisit {
  return {
    id: 'v-sep',
    pet_id: 'pet-a',
    visited_at: dayKeyBack(60),
    clinic_name: 'Completely Cat Clinic',
    vet_name: 'Dr Miller',
    reason: null,
    notes: 'Left ear has dirt in it.',
    next_visit_at: null,
    deleted_at: null,
    ...over,
  };
}

function course(over: Partial<ActiveCourse> = {}): ActiveCourse {
  return {
    id: 'motozol', petId: 'pet-a', medicationItemId: null, drugName: 'Motozol', doseAmount: 'left ear',
    route: null, dosesPerDay: 1, scheduleNotes: null, indication: null, prescribedBy: null,
    startedAt: dayKeyBack(60), targetDurationDays: null, targetDurationDoses: null, vetVisitId: 'v-sep',
    ...over,
  };
}

const NOTE = /Moving this date moves where/;

async function openReopen() {
  render(<AfterVisitScreen />);
  await screen.findByText('Done');
}

async function moveDateTo(day: Date) {
  fireEvent.press(screen.getByLabelText(/^Visit date,/));
  await act(async () => {
    fireEvent(screen.getByTestId('picker'), 'pickerPick', {}, day);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { visit: 'v-sep' };
  mockVisit = savedVisit();
  mockBooking = null;
  mockCourses = [];
  mockPlan = { courses: [], trials: [] };
  mockActiveTrial = null;
  mockTrialLink = null;
  mockRecheckBooking = null;
  mockConsequence = { isLatest: false, dayRelation: 'before_today' };
  mockConsequenceThrows = false;
  mockDeferred = null;
  mockConcerns = [];
  mockAnswered = new Set();
  mockStoreState = { pets: [PET_A, PET_B], activePet: PET_A };
});

describe('AC 14 — a saved visit reopens, and never makes a second row', () => {
  it('a visit logged with NO booking opens How did it go?, seeded from the record', async () => {
    await openReopen();
    expect(screen.getByText('How did it go?')).toBeTruthy();
    // Which visit this is, from the record (mock A3's eyebrow).
    expect(screen.getByText(/· Completely Cat Clinic$/)).toBeTruthy();
    expect(screen.getByDisplayValue('Left ear has dirt in it.')).toBeTruthy();
    expect(screen.getByDisplayValue('Completely Cat Clinic')).toBeTruthy();
    // Paperwork by VISIT: the document filed under it counts, with no booking to read from.
    expect(screen.getByText('1 document · in Vet Files')).toBeTruthy();

    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockLogVetVisit).not.toHaveBeenCalled();
    expect(mockLogFromAppointment).not.toHaveBeenCalled();
    // No saved moment on a reopen (R5): the moment's report line never renders.
    expect(screen.queryByText(/vet report starts from this visit/)).toBeNull();
  });

  it('a visit WITH a booking behind it reopens the same way, and a plan action reuses its id', async () => {
    mockBooking = {
      id: 'appt-1', pet_id: 'pet-a', scheduled_at: new Date(2026, 8, 16, 10, 30).toISOString(),
      clinic_name: 'Completely Cat Clinic', vet_name: 'Dr Miller', reason: null, notes_draft: null,
      questions: null, vet_visit_id: 'v-sep', cancelled_at: null, deleted_at: null,
    };
    await openReopen();

    // *Add* needs a visit id for the new course's own insert; on a reopen it is this one.
    fireEvent.press(screen.getByLabelText('Add — Started something new?'));
    await waitFor(() => expect(screen.UNSAFE_getByType(AddMedicationModal).props.vetVisitId).toBe('v-sep'));
    expect(mockLogVetVisit).not.toHaveBeenCalled();
    expect(mockLogFromAppointment).not.toHaveBeenCalled();
  });

  it('a recheck date read off the visit claims no booking', async () => {
    mockVisit = savedVisit({ next_visit_at: '2026-10-28' });
    await openReopen();
    expect(screen.getByText('Recheck around Oct 28')).toBeTruthy();
    expect(screen.getByText('Not booked yet')).toBeTruthy();
    expect(screen.queryByText(/booked/i, { exact: false })?.props.children).toBe('Not booked yet');
    expect(screen.getByLabelText('Book it — Recheck around Oct 28')).toBeTruthy();
  });

  it('a visit that is gone says so, in the visit’s words', async () => {
    mockVisit = null;
    render(<AfterVisitScreen />);
    expect(await screen.findByText('This visit is no longer on the record.')).toBeTruthy();
  });
});

describe('AC 15 — only this visit’s own items carry chips (R3)', () => {
  it('an old visit beside a newer, unlinked course offers that course nothing', async () => {
    mockCourses = [
      course(),
      course({ id: 'apoquel', drugName: 'Apoquel', vetVisitId: 'v-oct', startedAt: dayKeyBack(10) }),
      course({ id: 'fish-oil', drugName: 'Fish oil', vetVisitId: null }),
    ];
    await openReopen();

    expect(screen.getByText('Motozol')).toBeTruthy();
    expect(screen.queryByText('Apoquel')).toBeNull();
    expect(screen.queryByText('Fish oil')).toBeNull();
    // Its own course reads as linked here, with no answer lit (R3: no per-visit verdict).
    expect(screen.getByText(/^left ear · .* · linked to this visit$/)).toBeTruthy();
    expect(screen.getAllByRole('radio').every((r) => !r.props.accessibilityState?.selected)).toBe(true);

    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockLinkCourse).not.toHaveBeenCalled();
  });

  it('an ended course this visit started rebuilds as a settled row from the record', async () => {
    mockPlan = {
      courses: [{ ...course({ id: 'cerenia', drugName: 'Cerenia' }), status: 'completed', endedAt: '2026-09-30' }],
      trials: [],
    };
    await openReopen();
    expect(screen.getByLabelText(/^Cerenia, Ended /)).toBeTruthy();
  });

  it('a running trial this visit did not start gets no chips and no second-trial door', async () => {
    mockActiveTrial = { id: 't-now', startedAt: dayKeyBack(20), targetDurationDays: 56, foodLabel: 'Selected Protein' };
    mockTrialLink = 'v-oct';
    await openReopen();
    // Named, so it has not vanished, but with nothing to press.
    expect(screen.getByLabelText('Selected Protein, Trial running · not linked to this visit')).toBeTruthy();
    expect(screen.queryByText('Switched')).toBeNull();
    expect(screen.queryByLabelText('Start a trial — A new food to try?')).toBeNull();
    expect(screen.getByLabelText('Add the food — A new food to try?')).toBeTruthy();
  });

  it('a running trial linked to this visit keeps its chips, none lit', async () => {
    mockActiveTrial = { id: 't-sep', startedAt: dayKeyBack(60), targetDurationDays: 84, foodLabel: 'Selected Protein' };
    mockTrialLink = 'v-sep';
    await openReopen();
    expect(screen.getByText('Selected Protein')).toBeTruthy();
    expect(screen.getByText('Switched')).toBeTruthy();
  });
});

describe('AC 16 — nothing typed is lost, and nothing unchanged is written', () => {
  it('a Done with no change writes nothing', async () => {
    await openReopen();
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockUpdateVisit).not.toHaveBeenCalled();
  });

  it('a Done after typing writes only the field that moved', async () => {
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Notes from Nyx’s visit'), 'Left ear has dirt in it. Recheck in six weeks.');
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockUpdateVisit).toHaveBeenCalledTimes(1);
    expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { notes: 'Left ear has dirt in it. Recheck in six weeks.' });
  });

  it('a future-dated visit synced from another phone is not rewritten by a reopen that touched nothing', async () => {
    const ahead = new Date();
    ahead.setDate(ahead.getDate() + 20);
    mockVisit = savedVisit({
      visited_at: `${ahead.getFullYear()}-${String(ahead.getMonth() + 1).padStart(2, '0')}-${String(ahead.getDate()).padStart(2, '0')}`,
    });
    await openReopen();
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockUpdateVisit).not.toHaveBeenCalled();
  });

  it('header back writes before it leaves, so the visit it returns to reads the new text', async () => {
    let release!: () => void;
    mockUpdateVisit.mockImplementationOnce(() => new Promise<undefined>((r) => { release = () => r(undefined); }));
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Notes from Nyx’s visit'), 'Motozol once a day.');
    fireEvent.press(screen.getByLabelText('Back'));
    await waitFor(() => expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { notes: 'Motozol once a day.' }));
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('a failed save on the way out says the change was not kept, never "try again"', async () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpdateVisit.mockImplementationOnce(async () => { throw new Error('disk full'); });
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Clinic'), 'Elm St');
    screen.unmount();
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toMatch(/weren’t kept/);
    expect(alert.mock.calls[0][1]).not.toMatch(/again in a moment/);
  });

  it('leaving without Done keeps what was typed', async () => {
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Clinic'), 'Completely Cat Clinic (Elm St)');
    // The screen losing focus: back, a swipe, or a pushed route.
    screen.unmount();
    await waitFor(() =>
      expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { clinicName: 'Completely Cat Clinic (Elm St)' }),
    );
  });

  it('a care sign the visit already answered renders settled and is not written again', async () => {
    mockConcerns = [{ sign: 'vomit', title: 'Vomiting', state: 'raised', answerableFrom: null }];
    mockAnswered = new Set(['vomit']);
    await openReopen();
    expect(await screen.findByLabelText('Vomiting, Talked about it at this visit')).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockRecordCareAnswer).not.toHaveBeenCalled();
  });
});

describe('AC 21 — the record’s pet, whatever is active', () => {
  it('names and writes under the visit’s pet after the active pet moves', async () => {
    mockStoreState = { pets: [PET_A, PET_B], activePet: PET_B };
    await openReopen();
    expect(screen.getByLabelText('Notes from Nyx’s visit')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add — Started something new?'));
    await waitFor(() => expect(screen.UNSAFE_getByType(AddMedicationModal).props.petId).toBe('pet-a'));
  });
});

describe('the report-window note asks the record (moved from the retired edit screen)', () => {
  it('shows the note when the record says this visit anchors the window', async () => {
    mockConsequence = { isLatest: true, dayRelation: 'before_today' };
    await openReopen();
    expect(await screen.findByText(NOTE)).toBeTruthy();
  });

  it('withholds it for a visit logged behind one already on record', async () => {
    await openReopen();
    await waitFor(() => expect(mockReadConsequence).toHaveBeenCalled());
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('re-asks about the date IN THE PICKER once the owner moves it', async () => {
    // Driven on purpose: left at its seed the candidate equals the stored date, and the
    // assertion would hold for a mutant that asks about the stored one.
    await openReopen();
    await waitFor(() => expect(mockReadConsequence).toHaveBeenCalled());
    const moved = dayBack(2);
    await moveDateTo(moved);
    const last = () => mockReadConsequence.mock.calls.at(-1)?.[0] as Record<string, string>;
    await waitFor(() => expect(last().visited_at).toBe(dayKeyBack(2)));
    expect(last().id).toBe('v-sep');
    expect(last().pet_id).toBe('pet-a');
    expect(last().visited_at).not.toBe(mockVisit?.visited_at);
  });

  it('drops a previous answer when a later read fails, rather than keeping it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsequence = { isLatest: true, dayRelation: 'before_today' };
    await openReopen();
    expect(await screen.findByText(NOTE)).toBeTruthy();
    mockConsequenceThrows = true;
    await moveDateTo(dayBack(2));
    await waitFor(() => expect(screen.queryByText(NOTE)).toBeNull());
    warn.mockRestore();
  });

  it('never renders the note before the record has answered', async () => {
    let settle!: (c: VisitConsequence) => void;
    mockDeferred = { promise: new Promise<VisitConsequence>((r) => { settle = r; }), settle: (c) => settle(c) };
    await openReopen();
    expect(screen.queryByText(NOTE)).toBeNull();
    await act(async () => {
      mockDeferred?.settle({ isLatest: true, dayRelation: 'before_today' });
    });
    expect(await screen.findByText(NOTE)).toBeTruthy();
  });
});

// ── §4.4 R5: nothing typed is lost (AC 16) ──────────────────────────────────────
// The app's lifecycle, captured: `AppState` is the one exit no focus cleanup sees (R5).
let mockAppStateListeners: Array<(s: string) => void> = [];
beforeEach(() => {
  mockAppStateListeners = [];
  const { AppState } = require('react-native');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((...args: unknown[]) => {
    mockAppStateListeners.push(args[1] as (s: string) => void);
    return { remove: jest.fn() };
  });
});

describe('R5 — the fields save as they are typed', () => {
  it('typing writes after the debounce, with the owner still on the screen', async () => {
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Notes from Nyx’s visit'), 'Motozol once a day.');
    // Not per keystroke: nothing is written inside the debounce.
    expect(mockUpdateVisit).not.toHaveBeenCalled();
    await waitFor(() => expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { notes: 'Motozol once a day.' }), { timeout: 2000 });
    expect(mockUpdateVisit).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText('Saved as you type')).toBeTruthy();
  });

  it('a burst of typing is one write of the last text', async () => {
    await openReopen();
    const field = screen.getByLabelText('Notes from Nyx’s visit');
    fireEvent.changeText(field, 'M');
    fireEvent.changeText(field, 'Mo');
    fireEvent.changeText(field, 'Motozol');
    await waitFor(() => expect(mockUpdateVisit).toHaveBeenCalled(), { timeout: 2000 });
    expect(mockUpdateVisit).toHaveBeenCalledTimes(1);
    expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { notes: 'Motozol' });
  });

  it('the app going to the background writes the pending text at once (an app kill keeps it)', async () => {
    await openReopen();
    fireEvent.changeText(screen.getByLabelText('Clinic'), 'Elm St Clinic');
    await act(async () => {
      for (const l of mockAppStateListeners) l('background');
    });
    // Before the debounce would have fired.
    expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { clinicName: 'Elm St Clinic' });
  });

  it('backgrounding with nothing typed writes nothing', async () => {
    await openReopen();
    await act(async () => {
      for (const l of mockAppStateListeners) l('background');
    });
    expect(mockUpdateVisit).not.toHaveBeenCalled();
  });
});

// ── §4.4 R2: the recheck is a date until the owner books it (AC 17, CUL-1150) ───
describe('R2 — the recheck row', () => {
  it('offers the three choices and writes nothing until Set', async () => {
    await openReopen();
    expect(screen.getByText('When does the vet want to see Nyx?')).toBeTruthy();
    fireEvent.press(screen.getByText('6 weeks'));
    fireEvent.press(screen.getByText('2 weeks'));
    expect(mockUpdateVisit).not.toHaveBeenCalled();
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(screen.getByText(new RegExp(`^Around .*${label.split(' ')[1]}`))).toBeTruthy();
  });

  it('the wheel only moves the candidate; its first stop books nothing (CUL-1150)', async () => {
    await openReopen();
    fireEvent.press(screen.getByText('Pick a date'));
    const target = new Date();
    target.setDate(target.getDate() + 40);
    await act(async () => {
      fireEvent(screen.getByTestId('picker'), 'pickerPick', {}, target);
    });
    // Still open, nothing written, and the candidate is the wheel's.
    expect(screen.getByTestId('picker')).toBeTruthy();
    expect(mockUpdateVisit).not.toHaveBeenCalled();
    const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    fireEvent.press(screen.getByText('Set'));
    await waitFor(() => expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { nextVisitAt: key }));
  });

  it('Set writes next_visit_at only, and never books an appointment', async () => {
    const { bookVetAppointment } = require('../../lib/vetVisits');
    await openReopen();
    fireEvent.press(screen.getByText('6 weeks'));
    fireEvent.press(screen.getByText('Set'));
    await waitFor(() => expect(screen.getByText('Not booked yet')).toBeTruthy());
    expect(mockUpdateVisit).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockUpdateVisit.mock.calls[0][1] as object)).toEqual(['nextVisitAt']);
    expect(bookVetAppointment).not.toHaveBeenCalled();
    expect(screen.getByText(/^Recheck around /)).toBeTruthy();
  });

  it('Book it opens the booking sheet for this pet, seeded with the date', async () => {
    mockVisit = savedVisit({ next_visit_at: '2026-10-28' });
    await openReopen();
    fireEvent.press(screen.getByLabelText('Book it — Recheck around Oct 28'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/vet-visits',
        params: { pet: 'pet-a', add: 'booked', reason: 'recheck', on: '2026-10-28' },
      }),
    );
  });

  it('once a booking answers it, the row reads the booking, never "not booked"', async () => {
    mockVisit = savedVisit({ next_visit_at: '2026-10-28' });
    mockRecheckBooking = { id: 'appt-2', scheduledAt: '2026-10-29T13:30:00.000Z', when: 'Thu, Oct 29 · 9:30 am', where: 'Completely Cat Clinic' };
    await openReopen();
    await waitFor(() => expect(screen.getByLabelText('Next visit, Thu, Oct 29 · 9:30 am · Booked · Completely Cat Clinic')).toBeTruthy());
    expect(screen.queryByText('Not booked yet')).toBeNull();
    expect(screen.queryByText('Book it')).toBeNull();
    expect(mockReadRecheckBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 'v-sep', pet_id: 'pet-a' }));
  });

  it('a later booking never stands in for a recheck the visit does not name (adversarial, QUIET)', async () => {
    // The vet said "recheck in two weeks"; the pet already has an annual booked for later.
    mockVisit = savedVisit({ next_visit_at: null });
    mockRecheckBooking = { id: 'appt-annual', scheduledAt: '2027-02-15T14:00:00.000Z', when: 'Mon, Feb 15 · 9:00 am', where: 'Completely Cat Clinic' };
    await openReopen();
    expect(screen.getByText('2 weeks')).toBeTruthy();
    expect(screen.queryByText(/· Booked/)).toBeNull();
    expect(mockReadRecheckBooking).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('2 weeks'));
    fireEvent.press(screen.getByText('Set'));
    await waitFor(() => expect(mockUpdateVisit).toHaveBeenCalledWith('v-sep', { nextVisitAt: expect.any(String) }));
  });

  it('Book it pushes one booking screen however fast it is tapped', async () => {
    mockVisit = savedVisit({ next_visit_at: '2026-10-28' });
    await openReopen();
    const book = screen.getByLabelText('Book it — Recheck around Oct 28');
    fireEvent.press(book);
    fireEvent.press(book);
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('a recheck with no booking found never says booked', async () => {
    mockVisit = savedVisit({ next_visit_at: '2026-10-28' });
    await openReopen();
    await waitFor(() => expect(mockReadRecheckBooking).toHaveBeenCalled());
    expect(screen.queryByText(/· Booked/)).toBeNull();
  });
});
