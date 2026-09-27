// TS-0 — with `trial_screen` off, the app renders as if the trial's own screen did not
// exist. (Diet trial — its own screen, TS-0 / CUL-1296; spec §2 S10, §7, §11 TS-0.)
//
// The screen ships dark behind its own flag (T-2, 2026-09-26), so the promise every
// later lane inherits is "flag-off is byte-identical" — the second sentence of the shelf
// card's blurb. This file is the mechanical form of that promise.
//
// ── THE SHAPE, INHERITED FROM THE HISTORY V2 GUARD (C-36) ────────────────────────
//
// This file is the sibling of guards/historyV2FlagOff.test.tsx and keeps its shape on
// purpose — and duplicates its harness rather than sharing it, the precedent that guard
// and guards/designV2FlagOff.test.tsx set. The two traps they document apply unchanged:
//   • A flag-on / flag-off DIFF is backwards in both directions — GREEN on the exact
//     defect (an ungated node is in both trees), RED on correct code.
//   • A GOLDEN `.snap` reds on every unrelated change and its repair is `jest -u`.
//
// What this file asserts instead is ABSENT-MODULE EQUIVALENCE:
//
//     the tree with the flag off  ===  the tree with components/trialScreen/ stubbed out
//
// It depends on one convention (spec §7 Namespace): the trial screen's drawing lives in
// `components/trialScreen/`. A route or a door holds the gate (`useTrialScreen()`) and
// delegates the drawing there; UI written inline in a screen is invisible to the equality
// half, and the consumer scans below red a reader of the gate that does not import from
// the namespace.
//
// ── THE SURFACES (C-32) ───────────────────────────────────────────────────────────
//
// TS-0 shipped the list ASSERTED empty, naming TS-4, so the first consumer red this file
// until it registered itself (a rule added after the first caller is a rule added after
// the bug). TS-4 (CUL-1300) registered the route, `app/trial/[pet].tsx`; TS-6 (CUL-1302)
// registered the Pet tab (`app/(tabs)/profile.tsx`) and the Day Summary (a sender, so also
// a decider); TS-5 (CUL-1301) registered Home, for the strip as the door. That is every
// surface spec §7 names; a later sender registers the same way, in the PR that adds it.
// The route/decider rule below is what forces each registration: a route under `app/`
// that reads the gate and is not a listed surface reds. STATED BLIND SPOT: a consumer
// under `components/` (Home's strip at TS-5 is one) is held to the delegation rule and the
// pinned consumer list, but nothing forces its HOST SCREEN into this list. The pinned list
// is what catches it: the PR that adds the consumer edits that list, and its reviewer
// checks that the host screen joined SURFACES in the same diff.
//
// ── THE LIMIT, STATED (C-38 / C-41: an undocumented blind spot reads as coverage) ─
//
// `treeFor` snapshots SYNCHRONOUSLY — a comparison sees the FIRST FRAME. A namespace node
// drawn straight from the tree (the mutation the AC names, and the one the proof at the
// foot drives) is caught. A node whose render waits on a read is NOT, and every surface
// this project gates renders its trial content after a read (`useDietTrial`,
// `useTrialFacts`). So each surface's async half is owed in the surface's OWN suite when
// it registers: flag-off, over a trial read that answers, no namespace node renders AND
// the screen-only reads are never issued — an absence proves a gate only when the thing
// gated was available to leak (spec §11 TS-4: "no namespace node and no read, proved in
// the screen's own suite over a fixture that would answer if called").
//
// ── WHY MOCKING HEAVY CHILDREN IS SAFE HERE ──────────────────────────────────────
//
// When surfaces register they will add the mocks their screens need to mount under jest.
// This is a DIFFERENTIAL over two renders of the same tree under the same mocks, so a
// mock can cost coverage (a stubbed child that would have drawn a namespace node), never
// a false pass — and the mocked-module closure test below asserts none of them reach the
// namespace.

// TS-6: a chain that answers empty, so the Pet tab's remote reads resolve quietly.
jest.mock('../lib/supabase', () => {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'neq']) {
    chain[m] = jest.fn(() => chain);
  }
  Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
  return {
    supabase: {
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    },
  };
});
// TS-6 — the Pet tab's native leaves (the set `app/(tabs)/profile.widgetLink.test.tsx`
// stands up). None of them reaches the namespace; the closure test below walks them.
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  getPublicUrl: () => 'https://example.test/photo.jpg',
  getSignedUrls: jest.fn(async () => new Map()),
}));
// One local DB answering empty (the designV2 guard's shape): the Pet tab's local reads
// resolve quietly after the first frame, which is all this comparison reads.
jest.mock('../lib/db', () => {
  const db = {
    getAllAsync: jest.fn(async () => []),
    getAllSync: jest.fn(() => []),
    getFirstAsync: jest.fn(async () => null),
    getFirstSync: jest.fn(() => null),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    runSync: jest.fn(() => ({ changes: 0 })),
    execAsync: jest.fn(async () => undefined),
    execSync: jest.fn(() => undefined),
    withTransactionAsync: jest.fn(async (f: () => Promise<void>) => {
      await f();
    }),
  };
  return { ...jest.requireActual('../lib/db'), getDb: () => db };
});
// The weight card's chart library ships untranspiled ESM (the set designV2's guard mocks).
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null, BarChart: () => null }));
jest.mock('../lib/vetDocumentLibrary', () => ({
  readVetLibrary: jest.fn(async () => []),
  buildVetFilesCardModel: () => ({}),
  VET_DOCUMENT_SIGNED_URL_TTL_SEC: 60,
}));
// TS-6 — the Day Summary's read, answered as a single-pet day with a trial strip: the one
// state in which the recap links to the trial at all. The offer and its primer are stubbed
// off, as the screen's own suite does (they pull in expo-notifications).
jest.mock('../hooks/useDaySummary', () => ({
  useDaySummary: () => ({
    status: 'ready',
    anchorMs: Date.parse('2026-08-15T21:00:00Z'),
    model: {
      sections: [{ petId: 'pet-1', petName: 'Biscuit', species: 'dog', rows: [], isZeroLog: false }],
      isEmpty: false,
      petCount: 1,
      lead: null,
      chips: [],
      trialStrip: { title: 'Whitefish trial', fact: 'Day 12 of 28' },
      medStrips: [],
      forward: null,
    },
  }),
}));
jest.mock('../hooks/useDailyRecapOffer', () => ({
  useDailyRecapOffer: () => ({
    show: false, primerVisible: false, requesting: false, primerPetName: null,
    onTurnOn: jest.fn(), onNotNow: jest.fn(), onPrimerConfirm: jest.fn(), onPrimerDismiss: jest.fn(),
  }),
}));
jest.mock('../components/notifications/NotificationPrimer', () => ({ NotificationPrimer: () => null }));
// TS-4: the route mounts under jest with its own pet in the link.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ pet: 'pet-2' }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    require('react').useEffect(() => cb(), []);
  },
  // TS-5: Home listens for a tab re-tap.
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
}));

// TS-5 (CUL-1301): Home mounts with every zone but the trial strip replaced by a marker —
// the strip is the surface's only consumer of the gate, and the other zones' reads cannot
// mount under jest here. A marker costs coverage and never a false pass (the header
// below), and the mocked-closure check proves none of them reaches the namespace.
function mockMarker(name: string) {
  const { View } = require('react-native');
  const React = require('react');
  return () => React.createElement(View, { testID: `zone-${name}` });
}
jest.mock('../components/home/HomeHeader', () => ({ HomeHeader: mockMarker('header') }));
jest.mock('../components/home/PullToRefreshSky', () => ({ PullToRefreshSky: mockMarker('sky') }));
jest.mock('../components/home/CrossPetSafetyBanner', () => ({
  CrossPetSafetyBanner: mockMarker('cross-pet-safety'),
}));
jest.mock('../components/home/SignalZone', () => ({ SignalZone: mockMarker('signal') }));
jest.mock('../components/vetvisits/AppointmentStrip', () => ({ AppointmentStrip: mockMarker('appointment') }));
jest.mock('../components/home/MedStrip', () => ({ MedStrip: mockMarker('med') }));
jest.mock('../components/home/LookCard', () => ({ LookCard: mockMarker('look') }));
jest.mock('../components/home/LookExits', () => ({ LookExits: mockMarker('look-exits'), exitVisibility: () => ({}) }));
jest.mock('../components/home/TodayZone', () => ({ TodayZone: mockMarker('today') }));
jest.mock('../components/home/TrendZone', () => ({ TrendZone: mockMarker('trend') }));
jest.mock('../hooks/useEvents', () => ({ useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn() }) }));
jest.mock('../hooks/useMedStrips', () => ({ useMedStrips: () => ({ input: null }) }));
jest.mock('../lib/sync', () => ({ syncNow: jest.fn() }));
jest.mock('../lib/signal', () => ({ regenerateSignal: jest.fn() }));
// A running trial, loaded for the pet Home names: the strip DRAWS, so the comparison is
// over the thing the flag changes rather than over an empty slot. The same fixture for
// the route is harmless — flag-off the route issues no trial read.
jest.mock('../hooks/useDietTrial', () => ({
  useDietTrial: () => ({
    input: {
      trial: { status: 'active', startedAt: '2026-07-03', targetDurationDays: 56, foodLabel: 'Royal Canin Rabbit' },
      nowMs: new Date(2026, 6, 25, 12).getTime(),
      petName: 'Mochi',
      coverage: { daysLogged: 22, daysElapsed: 23 },
    },
    status: 'loaded',
    isLoading: false,
    reload: () => {},
    inputIsForPet: true,
    loadedPetId: 'pet-1',
  }),
}));
jest.mock('../store/authStore', () => {
  const state = { user: { id: 'u1' } };
  const hook = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  return { useAuthStore: Object.assign(hook, { getState: () => state }) };
});

import type { ComponentType } from 'react';
import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react-native';
import { blankComments } from './blankComments';
import { createFixtureRoot, writeFixture, removeFixtureRoot } from './fixtureRoot';
import { __resetAppConfigForTest } from '../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS, type AllowlistFlagKey } from '../lib/appConfig';
import { useBetaOptInStore } from '../lib/betaFeatures';
import { usePetStore, type Pet } from '../store/petStore';

/** TS-6: the Pet tab needs a pet on screen to draw anything past its empty state. */
const PET_ONE: Pet = {
  id: 'pet-1', name: 'Biscuit', species: 'dog', breed: null, date_of_birth: null,
  date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
};

const REPO_ROOT = path.resolve(__dirname, '..');

/** Repo-relative prefix of the namespace itself. */
const NAMESPACE_PREFIX = 'components/trialScreen/';

/** The one file allowed to read the key directly — the gate every surface reads. */
const THE_HOOK = 'hooks/useTrialScreen.ts';

/**
 * Absolute paths of every module in the namespace. The directory may not exist yet (TS-2
 * creates it in parallel with this PR), and an absent namespace is an empty one.
 */
function trialScreenUiModules(dir: string = path.join(REPO_ROOT, NAMESPACE_PREFIX)): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...trialScreenUiModules(abs));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Whether the namespace is currently answering as ABSENT. */
let trialScreenAbsent = false;

/**
 * Register one namespace module as switchable: it keeps its real exports, and each
 * exported component renders null while `trialScreenAbsent` is set. Registered ONCE,
 * before anything requires a screen — `jest.isolateModules` cannot swap a module under a
 * renderer (C-36) — with the switch inside the wrapper's render, so a destructured or
 * captured reference still flips. The wrapper is memoised per export.
 *
 * Documented limit: a non-component function exported from the namespace would be
 * wrapped into a component. The namespace is UI by convention; a helper belongs in `lib/`
 * (TS-2's projection is `lib/trialLedger.ts` for exactly this reason).
 */
function registerSwitchable(abs: string): void {
  jest.doMock(abs, () => {
    const actual = jest.requireActual(abs) as Record<string, unknown>;
    const wrappers = new Map<string, unknown>();
    return new Proxy(actual, {
      get(target, key: string | symbol) {
        const real = target[key as string];
        if (typeof key === 'symbol') return real;
        if (key === '__esModule' || typeof real !== 'function') return real;
        if (!wrappers.has(key)) {
          const Real = real as React.ComponentType<Record<string, unknown>>;
          const Switchable = (props: Record<string, unknown>) =>
            trialScreenAbsent ? null : React.createElement(Real, props);
          Switchable.displayName = `Switchable(${key})`;
          wrappers.set(key, Switchable);
        }
        return wrappers.get(key);
      },
    });
  });
}

/**
 * A rendered tree reduced to what an owner could see: element types, props, children —
 * key-sorted, functions collapsed to a marker. The raw `toJSON()` cannot be compared: an
 * element-valued prop carries an `_owner` fiber with wall-clock render timings, so a tree
 * differs from itself; a fresh handler closure per render is not a leak either.
 */
function normalize(node: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (node === null || typeof node !== 'object') {
    return typeof node === 'function' ? '[fn]' : node;
  }
  // `seen` tracks the ANCESTOR PATH, not everything visited: RN reuses one registered
  // style object across many elements, and a visited-set would collapse every later
  // appearance to '[circular]' and take its content out of the comparison (C-36).
  if (seen.has(node)) return '[circular]';
  seen.add(node);
  try {
    return normalizeEntered(node, seen);
  } finally {
    seen.delete(node);
  }
}

function normalizeEntered(node: object, seen: WeakSet<object>): unknown {
  if (Array.isArray(node)) return node.map((n) => normalize(n, seen));
  const o = node as Record<string, unknown>;
  // A RENDERED node, checked FIRST and by shape (`children` as an own key): the test
  // renderer's JSON nodes carry a `$$typeof` of their own (C-36).
  if ('type' in o && 'props' in o && 'children' in o) {
    return { type: o.type, props: normalize(o.props, seen), children: normalize(o.children, seen) };
  }
  if ('$$typeof' in o) {
    const t = o.type as { displayName?: string; name?: string } | string | undefined;
    const name = typeof t === 'string' ? t : (t?.displayName ?? t?.name ?? 'Unknown');
    return { element: name, props: normalize(o.props, seen) };
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    if (k === '_owner' || k === '_store' || k === '_self' || k === '_source') continue;
    out[k] = normalize(o[k], seen);
  }
  return out;
}

/** Render one surface as it stands, normalized, then unmounted. FIRST FRAME ONLY. */
function treeFor(load: () => ComponentType): unknown {
  const Screen = load();
  const r = render(React.createElement(Screen));
  const tree = normalize(r.toJSON());
  r.unmount();
  return tree;
}

/** Run `fn` with every registered namespace module answering as absent. */
function withTrialScreenAbsent<T>(fn: () => T): T {
  trialScreenAbsent = true;
  try {
    return fn();
  } finally {
    trialScreenAbsent = false;
  }
}

// Registered at module scope, before any screen is loaded.
for (const abs of trialScreenUiModules()) registerSwitchable(abs);

/** Rendered nodes in a normalized tree — the non-vacuity measure below. */
function nodeCount(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + nodeCount(c), 0);
  const o = node as Record<string, unknown>;
  const self = 'type' in o && 'children' in o ? 1 : 0;
  return self + nodeCount(o.children);
}

/** A floor, not a pin: every real surface renders an order of magnitude more. */
const MIN_SURFACE_NODES = 5;

interface Surface {
  name: string;
  rel: string;
  load: () => ComponentType;
  /** State the surface is rendered in, applied before both renders. */
  arrange: () => void;
  /** A string the flag-off tree must carry — the floor that proves the arrangement. */
  mustContain?: string;
}

/**
 * The guard's SCOPE: a surface absent from this list has its flag-off tree checked by
 * nothing (C-41). Each is loaded through `require` inside the test, never imported at
 * the top — a top-level import would bind one cached instance. PINNED below: every surface spec §7
 * names is registered; a new one edits the pinned line in the PR that makes it a consumer.
 *
 * The route (TS-4, CUL-1300): flag-off it draws its small screen and NO trial read. The
 * async half (no read issued over reads that would answer) is proven in the screen's own
 * suite, `components/trialScreen/TrialScreen.test.tsx` (the limit stated above).
 */
const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'the trial screen route',
    rel: 'app/trial/[pet].tsx',
    load: () => require('../app/trial/[pet]').default,
    arrange: () => arrangeOthers([]),
    mustContain: '"Nothing to show here"',
  },
  // TS-6 (CUL-1302). The Pet tab draws the door (`TrialDoorRow`) in the trial card's slot.
  // FIRST FRAME ONLY: the door waits on the trial read, so this equality catches a door drawn
  // ungated straight from the tree; the async half (flag off, a trial read that answers, no
  // door and the door's model never built) is proven in `app/(tabs)/profile.widgetLink.test.tsx`.
  {
    name: 'the Pet tab',
    rel: 'app/(tabs)/profile.tsx',
    load: () => require('../app/(tabs)/profile').default,
    arrange: () => {
      arrangeOthers([]);
      usePetStore.setState({ pets: [PET_ONE], activePet: PET_ONE });
    },
    mustContain: '"Biscuit"',
  },
  // TS-6. A decider (it changes where the trial strip links and draws nothing), registered
  // here as well because it is a route under `app/` that reads the gate: its flag-off tree
  // must still equal the namespace-absent one, and its flag-off LINK is pinned in its own
  // suite (the `DRAWS_ELSEWHERE_OK` entry below).
  {
    name: 'the Day Summary',
    rel: 'app/day-summary.tsx',
    load: () => require('../app/day-summary').default,
    arrange: () => arrangeOthers([]),
    mustContain: '"Whitefish trial"',
  },
  // TS-5 (CUL-1301): Home, for the strip as the door. The strip draws from the mocked
  // trial read above; its async half (flag-off issues no ledger read over a read that
  // would answer) is proven in `components/home/TrialStrip.test.tsx`.
  {
    name: 'Home',
    rel: 'app/(tabs)/index.tsx',
    load: () => require('../app/(tabs)/index').default,
    arrange: () => arrangeOthers([]),
    mustContain: '"Diet trial · day 23 of 56"',
  },
];

/** The surfaces this PR registers, in order — pinned so a new one edits this line. */
const PINNED_SURFACES = ['the trial screen route', 'the Pet tab', 'the Day Summary', 'Home'];

/** Arrange the OTHER betas through the real stores; `trial_screen` stays unset. */
function arrangeOthers(keys: readonly AllowlistFlagKey[]): void {
  const allowlist = { ...ALLOWLIST_FLAGS_UNSET };
  for (const k of keys) allowlist[k] = { enabled: false, allowlist: ['u1'] };
  __resetAppConfigForTest({ values: APP_CONFIG_DEFAULTS, allowlist });
  useBetaOptInStore.getState().reset();
  for (const k of keys) useBetaOptInStore.getState().setOptIn(k, true);
}

afterEach(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

describe('TS-0 — flag-off is byte-identical to an app without the trial screen', () => {
  it('the gate really is OFF in this environment, through the hook surfaces will call — even with every other beta live', () => {
    // The premise, asserted through the hooks rather than a resolver on a local object.
    // Probed with the other rollout betas off and on: T-2 gives this screen its OWN flag,
    // so switching design_v2 or history_v2 on must not switch it on.
    const cfg = require('../hooks/useAppConfig') as typeof import('../hooks/useAppConfig');
    const gate = require('../hooks/useTrialScreen') as typeof import('../hooks/useTrialScreen');
    for (const others of [[], ['design_v2', 'history_v2']] as const) {
      arrangeOthers(others);
      const seen: boolean[] = [];
      const Probe = () => {
        seen.push(cfg.useAllowlistFlag('trial_screen'), gate.useTrialScreen());
        return null;
      };
      render(React.createElement(Probe)).unmount();
      expect(seen).toEqual([false, false]);
    }
  });

  it('the surface list is pinned, and every listed surface exists (C-32, C-38)', () => {
    // Pinned, not floored: a new surface edits this line, and the route rule below reds a
    // consumer that forgets to. Every listed surface must exist on disk (C-38: the scope
    // is checked against the repo, not read off this constant).
    expect(SURFACES.map((s) => s.name)).toEqual(PINNED_SURFACES);
    for (const s of SURFACES) expect(fs.existsSync(path.join(REPO_ROOT, s.rel))).toBe(true);
  });

  // A loop, not `it.each`: jest refuses an empty table, and empty is the TS-0 state.
  for (const { name, load, arrange, mustContain } of SURFACES) {
    it(`${name} renders identically with the trial screen absent`, () => {
      arrange();
      const present = treeFor(load);
      arrange();
      const absent = withTrialScreenAbsent(() => treeFor(load));

      // NON-VACUITY, asserted before the equality rather than assumed by it: an equality
      // over two empty things is the failure mode of this whole file.
      expect(nodeCount(present)).toBeGreaterThan(MIN_SURFACE_NODES);
      if (mustContain != null) expect(JSON.stringify(present)).toContain(mustContain);

      expect(present).toEqual(absent);
    });
  }
});

// ── The consumer scans ──────────────────────────────────────────────────────────

/**
 * Detector (a): the gate's call shape. A consumer is any file calling `useTrialScreen()`.
 * The hook's own declaration matches the same shape, so the hook is excluded by name and
 * is the one file the direct-read scans must find.
 */
const CONSUMER_RE = /\buseTrialScreen\(\s*\)/;
/** Detector (b): the key read directly — allowed in exactly one file, the hook. */
const DIRECT_FLAG_READ_RE = /useAllowlistFlag\(\s*['"]trial_screen['"]\s*\)/;
const DIRECT_OPT_IN_READ_RE = /useBetaOptIn\(\s*['"]trial_screen['"]\s*\)/;
/**
 * Key-independent and permanent: an ALIASED import walks past a call-shape regex, so
 * nobody aliases any of the three hooks. A future alias reds this and lands the job of
 * teaching the detectors about it on the PR that introduces it.
 */
const ALIASED_HOOK_RE = /\b(?:useTrialScreen|useAllowlistFlag|useBetaOptIn)\s+as\s+\w+/;
/**
 * A VALUE import from the namespace, at any relative depth, keyed on the PATH SEGMENT
 * `trialScreen/` and refusing a `lib/trialScreen/` (a helper directory is not the
 * namespace). `import type` is excluded: a type renders nothing.
 *
 * STATED BLIND SPOT: an import that is present is not an import that is RENDERED. This
 * raises the cost of the leak from "forget the convention" to "write a line that does
 * nothing"; the equality half remains the backstop for anything that renders.
 */
const IMPORTS_NAMESPACE_RE =
  /(?:^|\n)\s*import\s+(?!type\s)[^;\n]*from\s+['"](?:[^'"]*\/)?trialScreen\/(?<!lib\/trialScreen\/)/;

/**
 * Collapse a braced import's specifier list (dropping per-specifier `type` entries), so a
 * wrapped multi-line import reads as the single-line form does and an inline type-only
 * list normalises to the statement form the pattern already rejects.
 */
function collapseBracedImports(src: string): string {
  return src.replace(/import\s+\{([^}]*)\}\s*from/g, (_m, inner: string) => {
    const values = inner
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !/^type\s/.test(t));
    return values.length === 0 ? 'import type {} from' : `import { ${values.join(', ')} } from`;
  });
}

/** Does this consumer draw through something the equivalence half can stub? */
function drawsThroughNamespace(relPath: string, src: string): boolean {
  if (relPath.startsWith(NAMESPACE_PREFIX)) return true;
  return IMPORTS_NAMESPACE_RE.test(collapseBracedImports(src));
}

/**
 * Consumers excused from the draws-through-the-namespace rule: a file that reads the gate
 * to DECIDE something without drawing (a sender choosing where a link lands, spec §5.3).
 * Empty at TS-0. An entry names a behaviour proof that flag off it links exactly as it did
 * before; the checks below require the proof to exist and the entry to have a consumer.
 */
const DRAWS_ELSEWHERE_OK: Record<string, { reason: string; proof: string; mentions: string }> = {
  // TS-6 (CUL-1302, spec §5.3): the recap's trial strip opens `/trial/{pet}` under the flag
  // and the Pet tab's trial card without it. It draws nothing of the feature.
  'app/day-summary.tsx': {
    reason: 'a sender: the gate picks the trial strip’s href, and nothing is drawn',
    proof: 'app/day-summary.test.tsx',
    mentions: "expect(href.params.focus).toBe('trial');",
  },
};

/** The directories every detector reads. Checked against the repository below. */
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) sourcesUnder(abs, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Source with every comment blanked — what every detector below actually reads. */
function readCode(abs: string): string {
  return blankComments(fs.readFileSync(abs, 'utf8'));
}

function relTo(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * Every scanned source under `root`, repo-relative. Parameterised by root so the
 * mutation proof at the foot drives the SAME scan over a fixture tree.
 */
function allAppSources(root: string): string[] {
  return SCAN_DIRS.map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((dir) => sourcesUnder(dir))
    .map((abs) => relTo(root, abs));
}

/** Every file calling `useTrialScreen()`, the hook's own declaration excluded. */
function gateConsumers(root: string = REPO_ROOT): string[] {
  return allAppSources(root)
    .filter((r) => r !== THE_HOOK)
    .filter((r) => CONSUMER_RE.test(readCode(path.join(root, r))))
    .sort();
}

function filesMatching(re: RegExp, root: string = REPO_ROOT): string[] {
  return allAppSources(root).filter((r) => re.test(readCode(path.join(root, r)))).sort();
}

/** Consumers that neither draw through the namespace nor hold a decider exemption. */
function consumersDrawingElsewhere(root: string = REPO_ROOT): string[] {
  return gateConsumers(root)
    .filter((r) => !(r in DRAWS_ELSEWHERE_OK))
    .filter((r) => !drawsThroughNamespace(r, readCode(path.join(root, r))));
}

/** Routes under `app/` that read the gate and are neither a listed surface nor a decider. */
function unlistedRoutes(root: string = REPO_ROOT): string[] {
  const listed = new Set(SURFACES.map((s) => s.rel));
  return gateConsumers(root).filter(
    (r) => r.startsWith('app/') && !listed.has(r) && !(r in DRAWS_ELSEWHERE_OK),
  );
}

/**
 * The repo-local modules this file mocks away, plus everything they import, transitively
 * — the set the comparison is structurally blind to. Derived by reading this file's own
 * `jest.mock(...)` calls, so a new mock cannot widen the blind spot without widening this
 * check with it.
 */
const MOCK_CALL_RE = /jest\.mock\(\s*['"](\.[^'"]+)['"]/g;
const LOCAL_SPEC_RE = /(?:from\s*|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g;

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = /\.(ts|tsx)$/.test(spec)
    ? [base]
    : [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

function mockedModuleClosure(): string[] {
  const selfPath = path.join(REPO_ROOT, 'guards/trialScreenFlagOff.test.tsx');
  const stack: string[] = [];
  for (const m of readCode(selfPath).matchAll(MOCK_CALL_RE)) {
    const resolved = resolveSpec(selfPath, m[1]);
    if (resolved) stack.push(resolved);
  }
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const m of readCode(cur).matchAll(LOCAL_SPEC_RE)) {
      const resolved = resolveSpec(cur, m[1]);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen].map((abs) => relTo(REPO_ROOT, abs)).sort();
}

describe('the trial screen has one gate, and its consumers stay inside the namespace', () => {
  it('the consumers of the gate are pinned: the route, the Pet tab, the Day Summary and Home strip', () => {
    // PINNED, not floored: a new consumer is a new surface, and it joins this list —
    // with its SURFACES entry and its async flag-off proof — in the diff that adds it.
    // TS-5: the strip is a consumer under `components/`, so its HOST (Home) joined
    // SURFACES in the same diff (the blind spot the header states).
    expect(gateConsumers()).toEqual([
      'app/(tabs)/profile.tsx',
      'app/day-summary.tsx',
      'app/trial/[pet].tsx',
      'components/home/TrialStrip.tsx',
    ]);
  });

  it('the key is read directly in exactly one file — the hook — for both gates', () => {
    expect(filesMatching(DIRECT_FLAG_READ_RE)).toEqual([THE_HOOK]);
    expect(filesMatching(DIRECT_OPT_IN_READ_RE)).toEqual([THE_HOOK]);
  });

  it('nobody aliases useTrialScreen / useAllowlistFlag / useBetaOptIn, so the call-shape scans have no blind spot', () => {
    expect(filesMatching(ALIASED_HOOK_RE)).toEqual([]);
  });

  it('the scan set covers every directory in the repository that reads the gate', () => {
    // C-38: the expected set is derived from the REPOSITORY, never from the constant
    // under test. `guards/` is excluded because this file is in it and quotes every shape.
    const skip = new Set(['node_modules', 'guards', 'docs', 'supabase', 'scripts']);
    const readers = new Set<string>();
    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || skip.has(entry.name)) continue;
      for (const abs of sourcesUnder(path.join(REPO_ROOT, entry.name))) {
        const code = readCode(abs);
        if (CONSUMER_RE.test(code) || DIRECT_FLAG_READ_RE.test(code)) readers.add(entry.name);
      }
    }
    // Non-vacuous: the hook itself is a reader, so the derived set is never empty.
    expect(readers.has('hooks')).toBe(true);
    for (const dir of readers) expect(SCAN_DIRS).toContain(dir);
  });

  it('no module this file mocks away can hide a trial-screen node from the comparison', () => {
    // A leak inside a MOCKED child is invisible to the differential (both sides replace
    // it before its body runs), so the mocked set is walked to its transitive local
    // imports and none may reach the namespace (C-36).
    const closure = mockedModuleClosure();
    expect(closure.length).toBeGreaterThan(0);
    expect(closure.filter((r) => r.startsWith(NAMESPACE_PREFIX))).toEqual([]);
  });

  it('once a consumer exists, the namespace the equivalence half stubs holds a component', () => {
    // A consumer with an empty namespace means the screen is drawn somewhere `treeFor`
    // cannot stub — every comparison vacuously green. Vacuous itself at TS-0 (no
    // consumer), and live from the first one.
    if (gateConsumers().length > 0) expect(trialScreenUiModules().length).toBeGreaterThan(0);
  });

  it('every consumer draws through the namespace', () => {
    expect(consumersDrawingElsewhere()).toEqual([]);
  });

  it('every route under app/ that consumes the gate is a listed surface, or a decider with a flag-off proof', () => {
    expect(unlistedRoutes()).toEqual([]);
  });

  it('each decider names a proof that exists and still pins its flag-off link', () => {
    for (const [consumer, { proof, mentions }] of Object.entries(DRAWS_ELSEWHERE_OK)) {
      const abs = path.join(REPO_ROOT, proof);
      expect({ consumer, exists: fs.existsSync(abs) }).toEqual({ consumer, exists: true });
      expect(fs.readFileSync(abs, 'utf8')).toContain(mentions);
    }
  });

  it('the draws-through-the-namespace exemption has no stale entries', () => {
    const consumers = new Set(gateConsumers());
    expect(Object.keys(DRAWS_ELSEWHERE_OK).filter((k) => !consumers.has(k))).toEqual([]);
  });

  it('the delegation detector reads both import shapes, and still refuses type-only ones', () => {
    const single = `import { A } from '../../components/trialScreen/A';`;
    const multi = `import {\n  A,\n  type B,\n} from '../../components/trialScreen/A';`;
    const typeOnly = `import type { A } from '../../components/trialScreen/A';`;
    const inlineTypeOnly = `import {\n  type A,\n} from '../../components/trialScreen/A';`;
    const none = `import { View } from 'react-native';\nimport { x } from '../../lib/trialLedger';`;
    const sibling = `import { Lane } from '../trialScreen/ThisWeekLane';`;
    const helperDir = `import { x } from '../../lib/trialScreen/helper';`;
    const otherNamespace = `import { HistoryScreen } from '../../components/historyV2/HistoryScreen';`;
    const oldTrialDir = `import { TrialLifecycleSheets } from '../../components/trial/TrialLifecycleSheets';`;

    expect(drawsThroughNamespace('app/s.tsx', single)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', multi)).toBe(true);
    expect(drawsThroughNamespace('components/home/Card.tsx', sibling)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', helperDir)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', typeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', inlineTypeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', none)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', otherNamespace)).toBe(false);
    // `components/trial/` is TS-3's lifecycle host, mounted flag-off too — not the namespace.
    expect(drawsThroughNamespace('app/s.tsx', oldTrialDir)).toBe(false);
    expect(drawsThroughNamespace('components/trialScreen/Card.tsx', none)).toBe(true);
  });
});

// ── The mutation proofs (C-18: a guard that has only ever been green is untested) ──
// Both fixtures live outside the repo (guards/fixtureRoot.ts), so a parallel guard's walk
// cannot pick them up.

// (1) The consumer scan. The AC: "the guard reds on a surface that reads the hook outside
// the namespace". Drives the SAME scan functions the live tests call, over a fixture tree
// that holds the hook and one route reading it with no namespace import, and requires
// every detector the leak should trip to trip. The fixture is never evaluated, only read.
describe('the consumer scans bite (proven by mutation, not by reading)', () => {
  let root = '';

  beforeAll(() => {
    root = createFixtureRoot('trial-screen-consumers');
    writeFixture(root, THE_HOOK, fs.readFileSync(path.join(REPO_ROOT, THE_HOOK), 'utf8'));
    // A route that reads the gate and draws its own UI inline: the leak the rule forbids.
    writeFixture(
      root,
      'app/trial-rogue.tsx',
      `import { Text } from 'react-native';\n` +
        `import { useTrialScreen } from '../../hooks/useTrialScreen';\n` +
        `export default function TrialRoute() {\n` +
        `  const live = useTrialScreen();\n` +
        `  return live ? <Text>What Mochi can eat</Text> : null;\n` +
        `}\n`,
    );
    // A component outside the namespace reading the key directly, around the hook.
    writeFixture(
      root,
      'components/home/TrialStripDoor.tsx',
      `import { useAllowlistFlag } from '../../hooks/useAppConfig';\n` +
        `export function TrialStripDoor() {\n` +
        `  return useAllowlistFlag('trial_screen') ? null : null;\n` +
        `}\n`,
    );
    // A well-behaved door: reads the gate AND draws through the namespace.
    writeFixture(
      root,
      'components/pet/TrialDoorRow.tsx',
      `import { useTrialScreen } from '../../hooks/useTrialScreen';\n` +
        `import { TrialDoor } from '../trialScreen/TrialDoor';\n` +
        `export function TrialDoorRow() {\n` +
        `  return useTrialScreen() ? <TrialDoor /> : null;\n` +
        `}\n`,
    );
  });

  afterAll(() => {
    removeFixtureRoot(root);
  });

  it('a route reading the gate outside the namespace reds the delegation rule and the route rule', () => {
    expect(gateConsumers(root)).toEqual(['app/trial-rogue.tsx', 'components/pet/TrialDoorRow.tsx']);
    expect(consumersDrawingElsewhere(root)).toEqual(['app/trial-rogue.tsx']);
    expect(unlistedRoutes(root)).toEqual(['app/trial-rogue.tsx']);
  });

  it('a second direct read of the key reds the one-reader rule', () => {
    expect(filesMatching(DIRECT_FLAG_READ_RE, root)).toEqual([
      'components/home/TrialStripDoor.tsx',
      THE_HOOK,
    ]);
  });
});

// (2) The equivalence half. Green on the real tree for a reason that proves nothing on its
// own (at TS-0, there is no surface). This drives the SAME `treeFor` against a synthetic
// surface that renders a namespace module ungated and requires it to come apart.
//
// The fixture is plain CommonJS with no JSX and reaches react/react-native through the
// test's own objects: a file in the OS temp directory has neither this repo's babel
// transform nor its resolution path, and a second React instance yields an unrendered
// element rather than a tree, silently.
describe('the equivalence half bites (proven by mutation, not by reading)', () => {
  let root = '';
  let load: () => ComponentType;

  beforeAll(() => {
    root = createFixtureRoot('trial-screen-flag-off');
    (globalThis as Record<string, unknown>).__NYX_TRIAL_SCREEN_FIXTURE_DEPS__ = {
      React,
      Text: require('react-native').Text,
      View: require('react-native').View,
    };
    writeFixture(root, 'deps.js', `module.exports = globalThis.__NYX_TRIAL_SCREEN_FIXTURE_DEPS__;\n`);
    // A namespace module that renders an owner-visible node. It USES A HOOK on purpose:
    // a hookless component renders fine under a mismatched React.
    writeFixture(
      root,
      'trialScreen/LeakedLedger.tsx',
      `const { React, Text } = require('../deps');\n` +
        `exports.__esModule = true;\n` +
        `exports.LeakedLedger = function LeakedLedger() {\n` +
        `  const label = React.useMemo(() => 'Week 1 · 5 of 7 days', []);\n` +
        `  return React.createElement(Text, null, label);\n` +
        `};\n`,
    );
    writeFixture(
      root,
      'LeakySurface.tsx',
      `const { React, View } = require('./deps');\n` +
        `const _ledger = require('./trialScreen/LeakedLedger');\n` +
        `exports.__esModule = true;\n` +
        `exports.default = function LeakySurface() {\n` +
        `  return React.createElement(View, null, React.createElement(_ledger.LeakedLedger, null));\n` +
        `};\n`,
    );

    const discovered = trialScreenUiModules(path.join(root, 'trialScreen'));
    expect(discovered).toHaveLength(1);
    for (const abs of discovered) registerSwitchable(abs);
    load = () => require(path.join(root, 'LeakySurface.tsx')).default;
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).__NYX_TRIAL_SCREEN_FIXTURE_DEPS__;
    removeFixtureRoot(root);
  });

  it('a trial-screen node rendered ungated makes the two trees differ', () => {
    const present = treeFor(load);
    const absent = withTrialScreenAbsent(() => treeFor(load));

    expect(JSON.stringify(present)).toContain('Week 1');
    expect(JSON.stringify(absent)).not.toContain('Week 1');
    expect(present).not.toEqual(absent);
  });
});
