// The B-712 eligibility gate on the widget publisher (Beta features PR 2). CI does
// NOT exercise a flag's on-state unless a test sets it (spec §7), so both branches
// are pinned here:
//   • eligible → publish the real per-pet snapshot;
//   • not eligible → clear the snapshot files + publish a NEUTRAL signed-in-EMPTY
//     payload (`signedIn: true`, `pets: {}`) — the honest "No pet in this slot yet"
//     door, NEVER the `signedIn:false` "Sign in" door (a lie for a signed-in owner,
//     §4.1).
//
// Part A tests the extracted seam `buildWidgetPublishProps` directly with injected
// deps (deterministic, no device). Part B renders the hook to prove the resolved
// `widget_enabled` flag flows into that seam AND that flipping it re-publishes (it
// is in the effect deps) — the two wiring bugs the seam test can't see.

// lib/supabase's env fail-fast trips on import of the real appConfig chain (Part B
// uses the real useAppConfig singleton), so stub the client like useAppConfig.test.
jest.mock('../lib/supabase', () => ({ supabase: {} }));

// The publisher's collaborators — bare jest.fns; Part B configures/asserts them.
// Part A never reaches these (it injects explicit deps); it exercises the REAL
// buildWidgetProps (widgetProps is deliberately NOT mocked).
jest.mock('../lib/widgetSnapshot', () => ({
  publishWidgetSnapshots: jest.fn(async () => ({ snapshots: [], index: null })),
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

// Gate 2 (PR 3): the local widget opt-in. Mocked as a controllable module-level
// value so the eligible×opted-in matrix runs without the real Zustand/AsyncStorage
// store. Default TRUE so the eligible tests below reach the real-data path (the gate
// is `eligible && optedIn`); the opted-OUT branch flips it.
let mockWidgetOptedIn = true;
jest.mock('../lib/betaFeatures', () => ({
  useBetaOptIn: () => mockWidgetOptedIn,
}));

import { act, renderHook } from '@testing-library/react-native';
import { buildWidgetPublishProps, useWidgetSnapshots, type WidgetPublishDeps } from './useWidgetSnapshots';
import { WIDGET_PROPS_SCHEMA_VERSION, type CulpritWidgetProps } from '../lib/widgetProps';
import type { WidgetSnapshot } from '../lib/widgetSnapshot';
import type { PetSlotIndex } from '../lib/widgetResolution';
import { publishWidgetSnapshots } from '../lib/widgetSnapshot';
import { clearWidgetData } from '../lib/appGroup';
import { publishWidgetPass } from '../lib/widgetBridge';
import { __resetAppConfigForTest } from './useAppConfig';
import { APP_CONFIG_DEFAULTS, ALLOWLIST_FLAGS_UNSET, type AllowlistFlagValues } from '../lib/appConfig';

const PET = '11111111-1111-4111-8111-111111111111';
const USER_ID = '2eeeaef5-753a-467c-8c17-2b9fed40ee34';

// ── Part A: the eligibility seam ──────────────────────────────────────────────

// A minimal, real WidgetSnapshot — the v2 blocks are optional and left absent, so
// buildPetPanel maps it to an active (empty) panel. Enough to prove the eligible
// path threads real data through to a bound slot.
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
    clearData: () => {
      calls.push('clearData');
    },
    getPets: () => {
      calls.push('getPets');
      return [{ id: PET, name: 'Biscuit', species: 'dog' }];
    },
    ...over,
  };
  return { deps, calls };
}

describe('buildWidgetPublishProps — the B-712 widget gate (live = eligible && opted in, spec §2 / §4.1)', () => {
  it('live → publishes the real per-pet snapshot, never clears', async () => {
    const { deps, calls } = fakeDeps();
    const props = await buildWidgetPublishProps(true, deps);

    expect(calls).toContain('publishSnapshots');
    expect(calls).not.toContain('clearData');
    expect(props.signedIn).toBe(true);
    // The real snapshot flowed through buildWidgetProps to a bound slot — this is
    // NOT the empty payload the not-eligible branch returns.
    expect(Object.keys(props.pets)).toContain('slot1');
    expect(props.pets.slot1.petName).toBe('Biscuit');
    expect(props.pets.slot1.active).toBe(true);
  });

  it('not live → clears the snapshot files and publishes signed-in-EMPTY', async () => {
    const { deps, calls } = fakeDeps();
    const props = await buildWidgetPublishProps(false, deps);

    expect(calls).toContain('clearData');
    // The real-data path is never taken — no DB read, no snapshot files written.
    expect(calls).not.toContain('publishSnapshots');
    expect(calls).not.toContain('getPets');
    // The load-bearing §4.1 assertion: a signed-in owner is NEVER shown the
    // "Sign in" door. signedIn stays true; pets is empty → "No pet in this slot yet".
    expect(props.signedIn).toBe(true);
    expect(props.pets).toEqual({});
  });

  it('the not-eligible payload carries the CURRENT schema version (the neutral door, not the mismatch door)', async () => {
    // A wrong schemaVersion would render "Open Culprit to catch up" (§3) instead of
    // the intended neutral empty door — pin it so the two never drift.
    const { deps } = fakeDeps();
    const props = await buildWidgetPublishProps(false, deps);
    expect(props.schemaVersion).toBe(WIDGET_PROPS_SCHEMA_VERSION);
  });

  it('defaults are wired to the real publisher collaborators (no accidental self-reference)', async () => {
    // Called with no deps → uses defaultPublishDeps. On the not-eligible branch that
    // means the module-level clearWidgetData mock; assert it was invoked so a future
    // refactor can't silently drop the file-wipe.
    (clearWidgetData as jest.Mock).mockClear();
    const props = await buildWidgetPublishProps(false);
    expect(clearWidgetData).toHaveBeenCalledTimes(1);
    expect(props.signedIn).toBe(true);
    expect(props.pets).toEqual({});
  });
});

// ── Part B: the hook wiring (renderHook) ──────────────────────────────────────

const mockedPublishPass = publishWidgetPass as jest.Mock;
const mockedPublishSnapshots = publishWidgetSnapshots as jest.Mock;
const mockedClearData = clearWidgetData as jest.Mock;

// The last props the hook pushed to the timeline (captured off publishWidgetPass).
let captured: CulpritWidgetProps | null = null;

function allowlist(uids: string[]): AllowlistFlagValues {
  return { ...ALLOWLIST_FLAGS_UNSET, widget_enabled: { enabled: false, allowlist: uids } };
}

function setEligibility(uids: string[]): void {
  __resetAppConfigForTest({ values: APP_CONFIG_DEFAULTS, allowlist: allowlist(uids) });
}

describe('useWidgetSnapshots — the flag flows through and re-publishes on a flip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    captured = null;
    mockSession = { user: { id: USER_ID } }; // truthy → the effect runs
    mockUserId = USER_ID;
    mockWidgetOptedIn = true; // default opted-in; the opted-out test flips it
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

  it('eligible account publishes real data; flipping to not-eligible clears + neutralizes (never signedIn:false)', async () => {
    // Eligible: the account is in the allowlist.
    setEligibility([USER_ID]);
    renderHook(() => useWidgetSnapshots());
    await flushPublish();

    expect(mockedPublishSnapshots).toHaveBeenCalledTimes(1); // real-data path
    expect(mockedClearData).not.toHaveBeenCalled();
    expect(captured?.signedIn).toBe(true);

    // Flip: remove the account from the allowlist. widgetEligible is in the effect
    // deps, so the hook re-publishes — this is the assertion the seam test can't make.
    mockedPublishSnapshots.mockClear();
    mockedClearData.mockClear();
    await act(async () => {
      setEligibility([]); // notifies the app-config store → re-render → effect re-runs
    });
    await flushPublish();

    expect(mockedClearData).toHaveBeenCalled(); // dropped the snapshot files
    expect(mockedPublishSnapshots).not.toHaveBeenCalled(); // real data withheld
    expect(captured?.signedIn).toBe(true); // NEVER the "Sign in" door
    expect(captured?.pets).toEqual({}); // the neutral "No pet in this slot yet" door
  });

  it('a not-eligible account (empty allowlist) publishes the neutral empty state from the first tick', async () => {
    setEligibility([]);
    renderHook(() => useWidgetSnapshots());
    await flushPublish();

    expect(mockedClearData).toHaveBeenCalled();
    expect(mockedPublishSnapshots).not.toHaveBeenCalled();
    expect(captured?.signedIn).toBe(true);
    expect(captured?.pets).toEqual({});
  });

  it('ELIGIBLE but NOT opted in → neutral empty (the Phase-2 transition: opt-in defaults off)', async () => {
    // The account IS in the allowlist, but Gate 2 is off — the exact state a cohort
    // owner lands in when Phase 2 ships (their Phase-1 widget goes neutral until they
    // re-enable it once on the beta page). Real data must be withheld.
    mockWidgetOptedIn = false;
    setEligibility([USER_ID]);
    renderHook(() => useWidgetSnapshots());
    await flushPublish();

    expect(mockedPublishSnapshots).not.toHaveBeenCalled(); // real data withheld
    expect(mockedClearData).toHaveBeenCalled(); // snapshot files dropped
    expect(captured?.signedIn).toBe(true); // never the "Sign in" door
    expect(captured?.pets).toEqual({}); // the neutral "No pet in this slot yet" door
  });
});
