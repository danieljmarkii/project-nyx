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
  // The screen re-reads on FOCUS (CUL-952), so the mock has to provide the hook.
  // The registered callback is kept so a test can fire a re-focus explicitly —
  // without that, "it re-reads when you come back" is untestable and the stale-date
  // defect this replaced would be invisible again.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    focusCb.current = cb;
    useEffect(() => cb(), [cb]);
  },
}));
const focusCb: { current: null | (() => void | (() => void))} = { current: null };
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
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
// Controllable, so a test can hold ONE load open inside `buildForAppointment` while a
// newer one overtakes it.
//
// The gate is armed BEFORE the render and captured AT THE CALL, not read from a flag
// the test clears in between. The first cut did the latter — set a promise, render,
// then null the promise — and the call it meant to hold happens several awaits later,
// by which time the flag was already clear. It held nothing, and the test passed
// against the bug it was written for (proven by mutation, which is the only reason it
// was caught).
const mockTrialGate: { holdNext: boolean; release: null | (() => void) } = {
  holdNext: false,
  release: null,
};
// What the loader resolves to — null (no trial running) unless a test sets it.
const mockTrialInput: { current: unknown } = { current: null };
jest.mock('../lib/dietTrialFacts', () => ({
  loadDietTrialFacts: jest.fn(async () => {
    if (mockTrialGate.holdNext) {
      mockTrialGate.holdNext = false;
      await new Promise<void>((resolve) => {
        mockTrialGate.release = resolve;
      });
    }
    return mockTrialInput.current;
  }),
}));

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
const mockAppointments: Record<string, unknown> = {};
jest.mock('../lib/vetVisits', () => {
  const actual = jest.requireActual('../lib/vetVisits');
  return {
    // `requireActual` rather than a hand-written stub: `buildAppointmentView`,
    // `parseAppointmentQuestions` and the formatters are PURE, and a mock standing in
    // for a pure function is a rule re-derived in the test file (C-34). Only the two
    // functions that touch the database are replaced.
    ...actual,
    // `in`, not `??`: an override of `null` is how this fixture says "the read finds
    // nothing" (a cancelled or deleted row), and `null ?? mockAppointment` would
    // hand back the appointment instead — a removal test that silently asserted the
    // opposite of what it claimed. Caught by the test failing, which is the only
    // reason the distinction is written down here.
    readAppointmentById: jest.fn(async (id: string) =>
      id in mockAppointments ? mockAppointments[id] : mockAppointment,
    ),
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

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
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
  mockTrialGate.holdNext = false;
  mockTrialGate.release = null;
  mockTrialInput.current = null;
  for (const k of Object.keys(mockAppointments)) delete mockAppointments[k];
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

describe('the notes door (CUL-966)', () => {
  it('opens the notes for THIS appointment — the door §4.1 C1 always specified', async () => {
    // Get ready is where the questions are typed, and they become ticks on the notes
    // screen. Until this, Get ready could not reach that screen: the only route in
    // the app was the visits list, on the appointment's own day. So the page that
    // collects the questions could not open the page that answers them.
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    fireEvent.press(await r.findByText('Take notes'));
    expect(router.push).toHaveBeenCalledWith('/vet-visits/at-the-vet?appointment=appt-1');
  });

  it('is absent on the plain rundown, which has no appointment to take notes for', async () => {
    params.current = {};
    const r = render(<RundownScreen />);
    await r.findByText(/Share the rundown/);
    expect(r.queryByText('Take notes')).toBeNull();
  });

  it('leaves the report the single primary — the notes door is secondary (R-share)', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    expect(await r.findByText('Send the vet report')).toBeTruthy();
    expect(r.getByText('Take notes')).toBeTruthy();
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

describe('a slow load cannot commit over a newer one', () => {
  it('shows the appointment the screen was last asked for, not the one that resolved last', async () => {
    // Found by reading, not by a failure: the first cut put the `await` INSIDE the
    // object literal handed to `setGetReady`, which means the write happened after the
    // await and the staleness check sat one line BELOW the write it guarded. The rows
    // were safe (`buildForAppointment` bails on a stale id); the appointment and the
    // pet NAME were not.
    mockAppointments['old'] = { ...mockAppointment, id: 'old', clinic_name: 'Old Clinic' };
    mockAppointments['new'] = { ...mockAppointment, id: 'new', clinic_name: 'New Clinic' };

    // Arm the gate, then render: the FIRST call into `loadDietTrialFacts` parks.
    mockTrialGate.holdNext = true;
    params.current = { appointmentId: 'old' };
    const r = render(<RundownScreen />);

    // Wait until that first load has actually reached the gate — otherwise the newer
    // request below could overtake a load that never started, which is a different
    // (and trivially safe) situation.
    await waitFor(() => expect(mockTrialGate.release).not.toBeNull());

    // A newer request arrives while the first is parked inside its async work.
    params.current = { appointmentId: 'new' };
    r.rerender(<RundownScreen />);
    await r.findByText(/New Clinic/);

    // Now let the stale one finish. It must not overwrite what is on screen.
    await act(async () => {
      mockTrialGate.release?.();
    });
    expect(r.queryByText(/Old Clinic/)).toBeNull();
    expect(r.getByText(/New Clinic/)).toBeTruthy();
  });
});

describe('a Signal that has never been generated is not "nothing standing"', () => {
  it('names the gap when there is no ai_signals row at all', async () => {
    // The worst of the adversarial findings. `readSignalCache` returns null for NO ROW
    // and gets there WITHOUT THROWING — PostgREST's `maybeSingle()` answers zero rows
    // with `{data: null, error: null}` — so `row?.findings ?? []` turned "the engine has
    // never run for this pet" into "the engine found nothing": no gap line, quiet-record
    // treatment, on a record nobody has looked at. Reachable on a new pet booking a
    // first appointment.
    //
    // Note the default harness at the top of this file IS that case (`maybeSingle` is
    // stubbed to `{data: null, error: null}`), which is why the quiet-record tests above
    // now assert the gap line's ABSENCE only where the cache genuinely answered.
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    await waitFor(() =>
      expect(r.getByText(/Signal couldn’t be read on this device/)).toBeTruthy(),
    );
  });

  it('does NOT name a gap when the engine answered with no findings', async () => {
    // The genuinely quiet record: a cache row exists and its findings are empty. This is
    // the only state that earns mock B1b.
    const { supabase } = jest.requireMock('../lib/supabase') as {
      supabase: { from: jest.Mock };
    };
    const chain = supabase.from('ai_signals') as unknown as { maybeSingle: jest.Mock };
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        signal_text: null,
        is_building: false,
        findings: [],
        coverage: [],
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      error: null,
    });

    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    expect(r.getByText('Your questions')).toBeTruthy();
    expect(r.queryByText(/Signal couldn’t be read/)).toBeNull();
    expect(r.queryByText(/nothing to raise/i)).toBeNull();
  });
});

// ── CUL-952 — Get ready re-reads after the edit it now launches ────────────────
//
// This screen is the one ⋯ *Change the appointment* opens the editor FROM, and it
// stays mounted underneath while that screen is pushed. Its load was keyed
// `[petId, wantsGetReady, appointmentId]` — none of which change when the pushed
// screen pops — so before CUL-952 gave that menu item a destination the staleness
// was unreachable, and the moment it had one the headline path ended on the old
// date. Found by `pm-feature-review`, not by a failing test, which is why the test
// exists now.

describe('re-reading after the edit this screen launches (CUL-952)', () => {
  /** Re-enter the screen the way returning from a pushed route does. */
  async function refocus() {
    await act(async () => {
      focusCb.current?.();
    });
  }

  it('shows the MOVED day after the owner changes the appointment and comes back', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');

    const movedTo = new Date(Date.now() + 9 * 86_400_000);
    movedTo.setHours(9, 30, 0, 0);
    const before = r.getByText(/Get ready for/).parent;
    expect(before).toBeTruthy();

    // The clinic moved it. The edit screen wrote the row; this screen is underneath.
    mockAppointments['appt-1'] = {
      ...mockAppointment,
      scheduled_at: movedTo.toISOString(),
      clinic_name: 'Bayside Veterinary',
    };
    await refocus();

    // The eyebrow and the sub-line are the appointment's OWN composed strings, so
    // this asserts the screen re-read rather than that a formatter ran.
    await waitFor(() => expect(r.getByText(/Bayside Veterinary/)).toBeTruthy());
    expect(r.queryByText(/Riverside Animal Hospital/)).toBeNull();
    delete mockAppointments['appt-1'];
  });

  it('drops the Get-ready chrome once the appointment has been removed (G5)', async () => {
    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await waitFor(() => expect(r.getByText(/Get ready for/)).toBeTruthy());

    // `cancelVetAppointment` stamps `cancelled_at`, and `readAppointmentById`
    // filters cancelled rows — so this is what the real read returns afterwards.
    mockAppointments['appt-1'] = null;
    await refocus();

    // A screen never shows a row that is no longer in the record. Without the
    // re-read this page kept its title, its questions block and a ⋯ whose *Change
    // the appointment* pushed a screen reading "no longer on the record".
    await waitFor(() => expect(r.queryByText(/Get ready for/)).toBeNull());
    // It does not go blank: `load` resolves a missing appointment to the plain
    // rundown, which is the honest fallback rather than an error.
    expect(r.getByTestId('rundown-block')).toBeTruthy();
    delete mockAppointments['appt-1'];
  });
});

// ── CUL-950 — the device's declines reach Worth raising, every one of them ─────────
//
// `buildWorthRaising` is proven in `lib/getReady.test.ts`; this is the WIRING, the one
// line in this screen that carries the device's safety facts across. The adversarial
// pass found it unguarded: `intakeDecline: []` in its place left every test green,
// because the loader here was stubbed to "no trial" and nothing ever arrived to drop.
describe('CUL-950 — the device’s intake declines reach the list', () => {
  it('renders EVERY device decline, in the engine’s order, when the Signal cannot be read', async () => {
    // The shape `loadDietTrialFacts` returns for a cat twelve days into a trial whose
    // device holds two declines: the facts and the first one's sentence, from one read.
    const low = 'Mochi has eaten less than usual today.';
    const refusal = 'Mochi just turned down Purina Chicken Pâté, which Mochi normally eats.';
    const started = new Date(Date.now() - 12 * 86_400_000);
    mockTrialInput.current = {
      trial: {
        status: 'active',
        startedAt: `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`,
        targetDurationDays: 42,
        foodLabel: 'Hill’s z/d',
      },
      nowMs: Date.now(),
      petName: 'Mochi',
      species: 'cat',
      intakeDeclineHeadline: low,
      intakeDeclineFacts: [
        { trigger: 'consecutive_low', refusedFoodLabel: null, headline: low },
        { trigger: 'refused_normal_food', refusedFoodLabel: 'Purina Chicken Pâté', headline: refusal },
      ],
    };

    params.current = { appointmentId: 'appt-1' };
    const r = render(<RundownScreen />);
    await r.findByTestId('rundown-block');
    await waitFor(() => expect(r.getByText(low)).toBeTruthy());
    expect(r.getByText(refusal)).toBeTruthy();
    expect(r.getByText('Worth raising')).toBeTruthy();

    // The engine's order: the refusal is read to the vet before the low day.
    const order = [refusal, low].map((t) => JSON.stringify(r.toJSON()).indexOf(t));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
  });
});
