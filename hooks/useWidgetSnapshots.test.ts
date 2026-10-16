// The widget graduated at 1.2.0 (CUL-1842, D8): every signed-in account publishes
// its real per-pet data. Before, the publish was gated on the `widget_enabled`
// allowlist AND a local beta opt-in, and every other account's widget showed "No pet
// in this slot yet / Touch and hold the widget to pick a pet", a door picking a pet
// could not open. Pinned here:
//   • Part A — the seam `buildWidgetPublishProps` publishes the real snapshot and
//     never the neutral empty payload or the "Sign in" door;
//   • Part B — the hook, rendered for an account on NO allowlist with NO opt in
//     (the real opt-in store, default off), publishes real data from the first tick,
//     and stays real when the config read lands or a stale opt-in reads off.

// lib/supabase's env fail-fast trips on import of the real appConfig chain (Part B
// uses the real useAppConfig singleton), so stub the client like useAppConfig.test.
jest.mock('../lib/supabase', () => ({ supabase: {} }));

// The publisher's collaborators — bare jest.fns; Part B configures/asserts them.
// Part A never reaches these (it injects explicit deps); it exercises the REAL
// buildWidgetProps (widgetProps is deliberately NOT mocked).
jest.mock('../lib/widgetSnapshot', () => ({
  publishWidgetSnapshots: jest.fn(async () => ({ snapshots: [], index: null })),
  widgetPublishEpoch: jest.fn(() => 0),
}));
jest.mock('../lib/appGroup', () => ({ clearWidgetData: jest.fn() }));
jest.mock('../lib/widgetBridge', () => ({ publishWidgetPass: jest.fn() }));

// The three stores the hook only .subscribe()s / .getState()s — mocked so the test
// is isolated from their import graph (db, supabase). The hook never calls them as
// hooks, only .subscribe (all three) and .getState().pets (petStore).
jest.mock('../store/petStore', () => ({
  usePetStore: Object.assign(() => ({ pets: [] }), {
    getState: () => ({ pets: [] }),
    subscribe: () => () => {},
  }),
}));
jest.mock('../store/eventStore', () => ({
  useEventStore: Object.assign(() => ({}), { subscribe: () => () => {} }),
}));
jest.mock('../store/syncStore', () => ({
  useSyncStore: Object.assign(() => ({}), { subscribe: () => () => {} }),
}));

// authStore is read two ways by the code under test: `useAuthStore()` (no selector,
// destructured for `session`) in the hook, and `useAuthStore(s => s.user?.id)` (a
// selector) inside useAllowlistFlag — so the mock must serve both forms.
let mockSession: unknown = null;
let mockUserId: string | null = null;
jest.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { session: unknown; user: { id: string } | null }) => unknown) => {
    const state = { session: mockSession, user: mockUserId ? { id: mockUserId } : null };
    return selector ? selector(state) : state;
  },
}));

import { act, renderHook } from '@testing-library/react-native';
import {
  buildWidgetPublishProps,
  useWidgetSnapshots,
  WidgetPublishFenced,
  type WidgetPublishDeps,
} from './useWidgetSnapshots';
import { WIDGET_PROPS_SCHEMA_VERSION, type CulpritWidgetProps } from '../lib/widgetProps';
import type { WidgetSnapshot } from '../lib/widgetSnapshot';
import type { PetSlotIndex } from '../lib/widgetResolution';
import { publishWidgetSnapshots } from '../lib/widgetSnapshot';
import { clearWidgetData } from '../lib/appGroup';
import { publishWidgetPass } from '../lib/widgetBridge';
import { __resetAppConfigForTest } from './useAppConfig';
import { APP_CONFIG_DEFAULTS, ALLOWLIST_FLAGS_UNSET } from '../lib/appConfig';
import { useBetaOptInStore } from '../lib/betaFeatures';

const PET = '11111111-1111-4111-8111-111111111111';
const USER_ID = '2eeeaef5-753a-467c-8c17-2b9fed40ee34';

// ── Part A: the publish seam ──────────────────────────────────────────────

// A minimal, real WidgetSnapshot — the v2 blocks are optional and left absent, so
// buildPetPanel maps it to an active (empty) panel. Enough to prove the eligible
// publish threads real data through to a bound slot.
function snapshot(): WidgetSnapshot {
  return {
    schemaVersion: 1,
    petId: PET,
    petName: 'Biscuit',
    species: 'dog',
    generatedAt: '2026-08-06T12:00:00.000Z',
    dayKey: '2026-08-06',
    freeFed: false,
    bowlConfirmedAt: null,
    today: { mealCount: 0, treatCount: 0, lastMealAt: null, lastTreatAt: null },
    slots: [],
    trialDay: null,
    trialTargetDays: null,
  };
}

function index(): PetSlotIndex {
  return {
    schemaVersion: 1,
    assignments: [{ slot: 1, petId: PET, petName: 'Biscuit', active: true }],
  };
}

function fakeDeps(over: Partial<WidgetPublishDeps> = {}) {
  const calls: string[] = [];
  const deps: WidgetPublishDeps = {
    publishSnapshots: (async () => {
      calls.push('publishSnapshots');
      return { snapshots: [snapshot()], index: index() };
    }) as WidgetPublishDeps['publishSnapshots'],
    getPets: () => {
      calls.push('getPets');
      return [{ id: PET, name: 'Biscuit', species: 'dog' }];
    },
    currentEpoch: () => 0,
    ...over,
  };
  return { deps, calls };
}

describe('buildWidgetPublishProps — every account gets the widget (CUL-1842)', () => {
  it('publishes the real per-pet snapshot, signed in, at the current schema', async () => {
    const { deps, calls } = fakeDeps();
    const props = await buildWidgetPublishProps(deps);

    expect(calls).toEqual(['getPets', 'publishSnapshots']);
    // Never the "Sign in" door for a signed-in owner (§4.1), never the mismatch door.
    expect(props.signedIn).toBe(true);
    expect(props.schemaVersion).toBe(WIDGET_PROPS_SCHEMA_VERSION);
    // The real snapshot flowed through buildWidgetProps to a bound slot: not the
    // neutral empty payload ("No pet in this slot yet") the retired gate returned.
    expect(Object.keys(props.pets)).toContain('slot1');
    expect(props.pets.slot1.petName).toBe('Biscuit');
    expect(props.pets.slot1.active).toBe(true);
  });

  // CUL-1952: the timeline push follows `buildProps` on the same tick, so a pass whose
  // epoch moved (sign-out's wipe) must refuse to resolve here, or the previous owner's
  // signed-in props land over the "Sign in" timeline. The full chain, through the real
  // `publishWidgetPass` and the real fence, is useWidgetSnapshots.signOut.test.ts.
  it('refuses to hand props on when sign-out moved the epoch mid-publish', async () => {
    let epoch = 7;
    const passed: number[] = [];
    const { deps } = fakeDeps({
      currentEpoch: () => epoch,
      publishSnapshots: (async (_pets: unknown, e?: number) => {
        passed.push(e ?? -1);
        epoch += 1; // the wipe lands while the snapshot read is pending
        return { snapshots: [snapshot()], index: index() };
      }) as WidgetPublishDeps['publishSnapshots'],
    });
    await expect(buildWidgetPublishProps(deps, 7)).rejects.toBeInstanceOf(WidgetPublishFenced);
    // The epoch the pass STARTED under reaches the file writer, which fences its own writes.
    expect(passed).toEqual([7]);
  });

  it('a pass whose epoch held hands its props on', async () => {
    const { deps } = fakeDeps({ currentEpoch: () => 7 });
    await expect(buildWidgetPublishProps(deps, 7)).resolves.toMatchObject({ signedIn: true });
  });

  it('defaults are wired to the real publisher, and never wipe the snapshot files', async () => {
    (clearWidgetData as jest.Mock).mockClear();
    (publishWidgetSnapshots as jest.Mock).mockClear();
    const props = await buildWidgetPublishProps();
    expect(publishWidgetSnapshots).toHaveBeenCalledTimes(1);
    expect(clearWidgetData).not.toHaveBeenCalled();
    expect(props.signedIn).toBe(true);
  });
});

// ── Part B: the hook wiring (renderHook) ──────────────────────────────────────

const mockedPublishPass = publishWidgetPass as jest.Mock;
const mockedPublishSnapshots = publishWidgetSnapshots as jest.Mock;
const mockedClearData = clearWidgetData as jest.Mock;

// The last props the hook pushed to the timeline (captured off publishWidgetPass).
let captured: CulpritWidgetProps | null = null;

describe('useWidgetSnapshots — every account gets the widget without the opt in (CUL-1842)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    captured = null;
    mockSession = { user: { id: USER_ID } }; // truthy → the effect runs
    mockUserId = USER_ID;
    // The real opt-in store at its default: nothing opted in.
    useBetaOptInStore.getState().reset();
    mockedPublishSnapshots.mockClear();
    mockedClearData.mockClear();
    mockedPublishPass.mockReset().mockImplementation(
      async (buildProps: () => Promise<CulpritWidgetProps>) => {
        captured = await buildProps();
        return { drainComplete: true };
      },
    );
    __resetAppConfigForTest();
  });

  afterEach(() => {
    // No __resetAppConfigForTest() here: this afterEach runs (LIFO) BEFORE RNTL's
    // auto-unmount, so notifying the still-mounted hook's store subscription would
    // re-render outside act(). The next test's beforeEach resets the config once the
    // prior hook is already unmounted.
    jest.useRealTimers();
    mockSession = null;
    mockUserId = null;
  });

  // Fire the debounced publish and flush the async chain it kicks off.
  async function flushPublish() {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  }

  function expectRealPublish() {
    expect(mockedPublishSnapshots).toHaveBeenCalled();
    expect(mockedClearData).not.toHaveBeenCalled();
    expect(captured?.signedIn).toBe(true);
  }

  it('an account on no allowlist, never opted in, publishes real data from the first tick', async () => {
    // The config read has not answered (unset baseline) and the opt-in store is at
    // its default — the two inputs the retired gate failed closed on.
    expect(useBetaOptInStore.getState().optIns).toEqual({});
    renderHook(() => useWidgetSnapshots());
    await flushPublish();

    expect(mockedPublishPass).toHaveBeenCalledTimes(1);
    expectRealPublish();
  });

  it('a config read landing with a dark widget_enabled row changes nothing', async () => {
    // The production row stays until the PM retires it; a build reading it would have
    // withheld the widget. This client ignores it (and never re-publishes on it).
    renderHook(() => useWidgetSnapshots());
    await flushPublish();
    mockedPublishSnapshots.mockClear();
    mockedPublishPass.mockClear();

    await act(async () => {
      __resetAppConfigForTest({
        values: APP_CONFIG_DEFAULTS,
        allowlist: { ...ALLOWLIST_FLAGS_UNSET, widget_enabled: { enabled: false, allowlist: [] } } as typeof ALLOWLIST_FLAGS_UNSET,
      });
    });
    await flushPublish();

    expect(mockedPublishPass).not.toHaveBeenCalled();
    expect(mockedClearData).not.toHaveBeenCalled();
  });

  it('a signed-out caller publishes nothing (sign-out’s wipe owns that door)', async () => {
    mockSession = null;
    mockUserId = null;
    renderHook(() => useWidgetSnapshots());
    await flushPublish();

    expect(mockedPublishPass).not.toHaveBeenCalled();
  });
});
