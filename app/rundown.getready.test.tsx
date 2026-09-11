// Get ready — AC 4 (CUL-903 VV-5; vet-visits spec §7).
//
// Two claims, and they are the two the PM's "promote, don't rebuild" rests on:
//
//   1. the rundown Get ready renders is BYTE-IDENTICAL to the one `/rundown`
//      renders — `toJSON()` deep-equal over the block, from one fixture;
//   2. it makes ZERO MODEL CALLS, through mount and every tap.
//
// The second is not hypothetical hygiene. The obvious way to read the Signal's
// findings on this screen is `useSignal()`, and that hook refreshes a stale cache:
// `readSignalsAndRefresh` → `regenerateSignal` → `functions.invoke('generate-signal')`
// → the Haiku phrasing call. Opening Get ready on a day-old cache would have spent a
// model call. The spy below is what keeps the screen honest about that.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

const params: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => params.current,
}));
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => true }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));
jest.mock('../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi', species: 'cat', sex: 'female' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
    resolveRecordPetName: () => 'Mochi',
  };
});

// THE SPY. `functions.invoke` is the door every Edge Function — and therefore every
// model call — goes through; `from(...)` is a plain data read and is deliberately
// allowed, because quoting findings the engine ALREADY computed is not asking for a
// judgment. The distinction is the whole design of this screen.
jest.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  return {
    // The spy is created INSIDE the factory and reached through `requireMock` below.
    // A `jest.fn()` declared beside the other consts would be hoisted past — jest
    // rejects that outright here, and VV-2 hit the silent form of the same trap one
    // PR ago: spies passed into a factory wire `undefined` rather than throwing, and
    // three assertions went green-to-zero-calls.
    supabase: {
      from: jest.fn(() => chain),
      functions: { invoke: jest.fn() },
    },
  };
});
jest.mock('../lib/sync', () => ({ syncPendingVetAppointments: jest.fn() }));
// The trial facts are a heavy local read with its own suite; null here means "no
// trial running", which is the quiet case the block comparison wants.
jest.mock('../lib/dietTrialFacts', () => ({ loadDietTrialFacts: jest.fn(async () => null) }));

// `mock`-prefixed because a factory below reads it, and jest only permits an
// out-of-scope reference under that name. Mutable so a test can change the questions.
const mockAppointment = {
  id: 'appt-1',
  pet_id: 'p1',
  scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  clinic_name: 'Riverside Animal Hospital',
  vet_name: 'Dr. Chen',
  reason: 'recheck',
  questions: null as string | null,
  vet_visit_id: null,
  cancelled_at: null,
  deleted_at: null,
};
jest.mock('../lib/vetVisits', () => {
  const actual = jest.requireActual('../lib/vetVisits');
  return {
    // `requireActual` rather than a hand-written stub: `buildAppointmentView`,
    // `parseAppointmentQuestions` and the formatters are PURE, and a mock standing in
    // for a pure function is a rule re-derived in the test file (C-34). Only the two
    // functions that touch the database are replaced.
    ...actual,
    readAppointmentById: jest.fn(async () => mockAppointment),
    saveAppointmentQuestions: jest.fn(async () => undefined),
  };
});

// One fixture, rendered by both modes. Mocked at `buildRundown` rather than at the
// database because the subject is the BLOCK's identity across the two modes, and a
// fixed input is what makes "identical" mean "the screen did not touch it".
jest.mock('../lib/rundown', () => {
  const actual = jest.requireActual('../lib/rundown');
  return { ...actual, buildRundown: jest.fn() };
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildRundown } from '../lib/rundown';
import { supabase } from '../lib/supabase';
import RundownScreen from './rundown';

/** The Edge-Function door, i.e. every model call. */
const invoke = supabase.functions.invoke as unknown as jest.Mock;

const FIXTURE = {
  petName: 'Mochi',
  generatedAtMs: 0,
  tiles: [
    { key: 'symptoms', label: 'Vomiting', value: '7 in 30 days · 3 this week', tap: { kind: 'history' } },
    { key: 'appetite', label: 'Appetite', value: '41 of 48 meals finished', detail: 'meals logged on 27 of 30 days', tap: { kind: 'patterns' } },
    { key: 'weight', label: 'Weight', value: '4.0–4.2 kg', detail: '3 weigh-ins', tap: { kind: 'weight' } },
  ],
  pastMedications: [
    { key: 'meds_past', label: 'Cerenia', value: '9 doses · Jul 30 – Sep 4', detail: 'No end recorded', tap: null },
  ],
  facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  mockAppointment.questions = null;
  (buildRundown as jest.Mock).mockResolvedValue(FIXTURE);
});

/** Rendered nodes in a `toJSON()` subtree — the non-vacuity measure below. */
function nodeCount(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + nodeCount(c), 0);
  const o = node as Record<string, unknown>;
  return ('type' in o && 'children' in o ? 1 : 0) + nodeCount(o.children);
}

/** The rundown block's own subtree out of a rendered screen's JSON. */
function findBlock(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findBlock(child);
      if (hit) return hit;
    }
    return null;
  }
  const o = node as { props?: Record<string, unknown>; children?: unknown };
  if (o.props?.testID === 'rundown-block') return o;
  return findBlock(o.children);
}

async function blockFor(paramsForRun: Record<string, string>): Promise<unknown> {
  params.current = paramsForRun;
  const r = render(<RundownScreen />);
  await r.findByTestId('rundown-block');
  // Serialised out of the SCREEN's tree rather than off the element handle: a
  // `ReactTestInstance` has no `toJSON`, and the block has to be located the way a
  // reader would — by the id the component gives itself.
  const block = findBlock(r.toJSON());
  r.unmount();
  expect(block).not.toBeNull();
  return JSON.parse(JSON.stringify(block));
}

describe('AC 4 — the rundown is byte-identical in both modes', () => {
  it('renders the same block with and without an appointment', async () => {
    const plain = await blockFor({});
    const getReady = await blockFor({ appointmentId: 'appt-1' });

    // NON-VACUITY FIRST. An equality over two collapsed or empty trees is the failure
    // mode of a comparison like this one — the flag-off guard shipped exactly that bug
    // and eight green tests measured nothing until a mutation caught it. The floor is
    // asserted before the equality rather than assumed by it.
    expect(nodeCount(plain)).toBeGreaterThan(10);

    expect(getReady).toEqual(plain);
  });

  it('the two modes really are different screens — otherwise the equality is trivial', async () => {
    // The other half of non-vacuity: prove Get ready DID render its own chrome, so
    // "the block is identical" is a statement about the block and not about the two
    // renders being the same thing.
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    expect(await r.findByText(/Get ready for Mochi’s visit/)).toBeTruthy();
    expect(r.queryByText(/Share the rundown/)).toBeNull();
    expect(r.getByText('Send the vet report')).toBeTruthy();
    r.unmount();

    params.current = {};
    const plain = render(<RundownScreen />);
    expect(await plain.findByText(/Share the rundown/)).toBeTruthy();
    expect(plain.queryByText(/Get ready for/)).toBeNull();
  });
});

describe('AC 4 — zero model calls, through mount and every tap', () => {
  it('invokes no Edge Function on mount', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes no Edge Function when every control on the page is pressed', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');

    // Every touchable in the tree, not a hand-listed few: a control added later is
    // covered without anyone remembering to add it here.
    const pressables = r.UNSAFE_root.findAll(
      (n: { type: unknown; props: Record<string, unknown> }) =>
        typeof n.type !== 'string' && !!n.props?.onPress,
    );
    expect(pressables.length).toBeGreaterThan(3);
    for (const node of pressables) {
      fireEvent.press(node);
    }
    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
  });

  it('reads the Signal CACHE rather than refreshing it', async () => {
    // The distinction the screen is built on: `readSignalCache` selects findings the
    // engine already computed; `readSignalsAndRefresh` would re-invoke the engine.
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    await waitFor(() => expect(supabase.from as unknown as jest.Mock).toHaveBeenCalledWith('ai_signals'));
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('the questions block', () => {
  it('heads the list *Your questions* on a quiet record, and never says "nothing to raise"', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    // Mock B1b: no *Worth raising* section at all, and no row announcing an absence.
    expect(r.getByText('Your questions')).toBeTruthy();
    expect(r.queryByText('Worth raising')).toBeNull();
    expect(r.queryByText(/nothing to raise/i)).toBeNull();
  });

  it('renders a saved question with its source named', async () => {
    mockAppointment.questions = JSON.stringify([
      { id: 'q1', text: 'Should I be worried about the weight?', source: 'owner' },
    ]);
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    expect(r.getByText('Should I be worried about the weight?')).toBeTruthy();
    expect(r.getByText('added by you')).toBeTruthy();
  });
});
