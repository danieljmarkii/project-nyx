import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditVisitScreen from './edit';
import type { LocalVetVisit, VisitConsequence } from '../../lib/vetVisits';

// CUL-953 item 1, at the SCREEN level.
//
// `components/vetvisits/VisitEditBody.test.tsx` proves the gate renders correctly
// for a given answer. This file proves the screen asks the right QUESTION and
// handles not getting one — two claims the component test cannot make, because the
// component is handed a boolean and never learns where it came from.
//
// The case that matters most here is the ERROR path, and it is not decoration: the
// answer is per-DATE, so retaining a previous answer when a read fails puts the
// note back on screen for a date it is wrong about. That is the original defect
// arriving through the catch block.

let mockVisit: LocalVetVisit | null = null;
let mockConsequence: VisitConsequence = { isLatest: true, dayRelation: 'before_today' };
let mockConsequenceThrows = false;
/** When set, the next read hangs until the test resolves it — see the C-12 case. */
let mockDeferred: { promise: Promise<VisitConsequence>; settle: (c: VisitConsequence) => void } | null = null;
const mockReadConsequence = jest.fn();

function defer() {
  let settle!: (c: VisitConsequence) => void;
  const promise = new Promise<VisitConsequence>((r) => {
    settle = r;
  });
  mockDeferred = { promise, settle };
  return mockDeferred;
}

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => ({ visit: 'visit-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../../lib/sync', () => ({ syncPendingVetVisits: jest.fn(async () => undefined) }));

// The platform picker renders a native view with no text, so the handler is hung
// off a renamed prop the test can reach and call — the sibling screen's pattern.
// Driving the picker is not optional here: with the field left at its seeded value
// the candidate date EQUALS the stored one, and every assertion about "which date
// did we ask about" is true under both the right implementation and the wrong one.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: unknown, d?: Date) => void }) => (
      <View testID="picker" pickerPick={onChange} />
    ),
  };
});

jest.mock('../../lib/vetVisits', () => {
  // Everything pure stays REAL — `localDateKey`, `clampVisitDate` and
  // `formatVisitDate` are part of what decides the question this screen asks, and
  // stubbing a pure function makes the suite green over the rule rather than over
  // the code (C-34). Only the two reads are stubbed.
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readVetVisitDetail: jest.fn(async () => (mockVisit ? { visit: mockVisit, plan: [] } : null)),
    readVisitConsequence: (...args: unknown[]) => {
      mockReadConsequence(...args);
      if (mockDeferred) return mockDeferred.promise;
      if (mockConsequenceThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve(mockConsequence);
    },
    updateVisitDetails: jest.fn(async () => undefined),
  };
});

jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: [{ id: 'pet-a', name: 'Nyx' }] }),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

/** A day `n` days back, as the DATE key the column holds — anchored to now (C-29). */
function dayKeyBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function visit(over: Partial<LocalVetVisit> = {}): LocalVetVisit {
  return {
    id: 'visit-1',
    pet_id: 'pet-a',
    visited_at: dayKeyBack(180),
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'Recheck',
    notes: '',
    ...over,
  } as LocalVetVisit;
}

const NOTE = /Moving this date moves where/;

/** A Date `n` days back at local noon — what the picker hands the screen. */
function dayBack(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** The DATE key that Date is stored and asked about as. */
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Open the day picker and commit `day` through it, as the owner would.
 *
 * Wrapped in `act` because the commit kicks off the consequence read, whose
 * resolution lands a `setAnchors` outside any act scope otherwise — a warning that
 * is really telling you an assertion could run between the two.
 */
async function moveDateTo(day: Date) {
  // The press and the pick cannot share one `act`: the picker only mounts on the
  // re-render the press causes, so querying it inside the same callback looks for a
  // node that does not exist yet. RTL wraps the press itself, so the split is enough.
  fireEvent.press(screen.getByLabelText(/^Visit date,/));
  await act(async () => {
    fireEvent(screen.getByTestId('picker'), 'pickerPick', {}, day);
  });
}

beforeEach(() => {
  mockVisit = visit();
  mockConsequence = { isLatest: true, dayRelation: 'before_today' };
  mockConsequenceThrows = false;
  mockDeferred = null;
  mockReadConsequence.mockClear();
});

describe('EditVisitScreen — the report-window note asks the record', () => {
  it('re-asks about the date IN THE PICKER once the owner moves it', async () => {
    // THE PICKER IS DRIVEN ON PURPOSE. Left at its seeded value the candidate date
    // EQUALS the stored one, so "which date did we ask about" is true under both the
    // right implementation and the wrong one — a first version of this test asserted
    // exactly that and a mutant keying the read on `visit.visited_at` sailed through
    // it. The question only becomes answerable once the two dates differ.
    render(<EditVisitScreen />);
    await waitFor(() => expect(mockReadConsequence).toHaveBeenCalled());

    const moved = dayBack(2);
    await moveDateTo(moved);
    await waitFor(() =>
      expect(
        (mockReadConsequence.mock.calls.at(-1)?.[0] as Record<string, string>).visited_at,
      ).toBe(keyOf(moved)),
    );

    // And it is still the same visit being asked about, not a new one.
    const last = mockReadConsequence.mock.calls.at(-1)?.[0] as Record<string, string>;
    expect(last.id).toBe('visit-1');
    expect(last.pet_id).toBe('pet-a');
    // The stored date is NOT what was asked — the assertion the first version missed.
    expect(last.visited_at).not.toBe(mockVisit?.visited_at);
  });

  it('shows the note when the record says this visit anchors the window', async () => {
    mockConsequence = { isLatest: true, dayRelation: 'before_today' };
    render(<EditVisitScreen />);
    expect(await screen.findByText(NOTE)).toBeTruthy();
  });

  it('withholds it for a visit logged behind one already on record', async () => {
    mockConsequence = { isLatest: false, dayRelation: 'before_today' };
    render(<EditVisitScreen />);
    await waitFor(() => expect(mockReadConsequence).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(NOTE)).toBeNull());
  });

  it('DROPS a previous answer when a later read fails, rather than keeping it', async () => {
    // The error path, and the case that makes it worth its own test: the answer is
    // per-DATE. A first version of this test failed the read on the FIRST load, where
    // there is no previous answer to retain — so deleting the clear-on-error left it
    // green over nothing (C-35: a fixture that cannot reach the state it names).
    //
    // The real shape is a `true` that is ALREADY on screen, a date moved away from
    // it, and the confirming read failing. Retaining `true` there puts the note back
    // for a date it is wrong about — the original defect, through the catch block.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<EditVisitScreen />);
    expect(await screen.findByText(NOTE)).toBeTruthy(); // the answer we must not keep

    mockConsequenceThrows = true;
    await moveDateTo(dayBack(2));

    await waitFor(() => expect(warn).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(NOTE)).toBeNull());
    warn.mockRestore();
  });

  it('never renders the note before the record has answered', async () => {
    // C-12. Asserted once the BODY is on screen — the first frame is the spinner, so
    // checking before that measures the loading state and is green whatever the gate
    // does. The date row is the body's own landmark, so its presence is what says
    // the gate had its chance and declined to guess.
    //
    // The read is DEFERRED rather than merely fast, because "not answered yet" is
    // the state under test and a resolved promise does not stay in it. Note this
    // also makes the initial `useState` seed unobservable — the effect clears it
    // before the body ever renders — so a mutant flipping that seed to `true`
    // correctly changes nothing, and the deferred read is what holds this rule.
    const pending = defer();

    render(<EditVisitScreen />);
    // Body rendered, read outstanding: the gate has been asked and has not answered.
    expect(await screen.findByLabelText(/^Visit date,/)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();

    await act(async () => {
      pending.settle({ isLatest: true, dayRelation: 'before_today' });
    });
    expect(await screen.findByText(NOTE)).toBeTruthy();
  });
});
