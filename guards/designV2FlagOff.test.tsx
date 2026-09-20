// D2-0 — with `design_v2` off, the app renders as if the redesign did not exist.
// (Design v2 — the whole day, D2-0 / CUL-1062; the round-4 ledger's beta row.)
//
// The whole project ships dark behind one flag (PM, 2026-09-19: "ensure this
// redesign is behind a beta toggle too"), so the promise every Design v2 lane
// inherits is "flag-off is byte-identical" — the second sentence of the shelf
// row's own blurb. This file is the mechanical form of that promise over the two
// surfaces the redesign reaches at step 1: Home and Patterns. The Signal's own
// screen joins the list when D2-3 lands it as a route.
//
// ── THE SHAPE, INHERITED FROM guards/vetVisitsFlagOff.test.tsx (C-36) ──────────
//
// This file is the vet-visits guard's sibling and deliberately keeps its shape,
// because the two traps that guard documents apply here unchanged:
//   • A flag-on / flag-off DIFF is backwards in both directions — GREEN on the
//     exact defect (an ungated node is in both trees), RED on correct code (a
//     gated node is present on one side).
//   • A GOLDEN `.snap` reds on every unrelated change to Home and its repair is
//     `jest -u` — a guard whose repair blesses the bug is not a guard.
//
// What this file asserts instead is ABSENT-MODULE EQUIVALENCE:
//
//     the tree with the flag off  ===  the tree with components/designV2/ stubbed out
//
// It is green today (the namespace is empty), it reds the instant a redesign node
// renders with the flag off, it stays green when that node is gated correctly,
// and it is immune to unrelated churn because both sides move together.
//
// The convention it depends on: the redesign's rendering lives in
// `components/designV2/`. A screen may hold the gate (`useDesignV2()`) but it
// delegates the drawing there — UI written inline in a screen is invisible to the
// equality half. `FIRST_CONSUMER_LANDS` below is the C-32 tripwire that makes that
// stick: it asserts EXACTLY ZERO consumers of the hook today and names the PR that
// will red it, because "every consumer is gated" proves nothing over an empty set.
//
// ── ONE HOOK, ONE CALL SHAPE ────────────────────────────────────────────────────
//
// Unlike vet_visits (read at each site as `useAllowlistFlag('vet_visits')` +
// `useBetaOptIn('vet_visits')`), Design v2 has ONE gate, `hooks/useDesignV2.ts`,
// and this file is the reason: a consumer is found by its call shape, and one
// name is one shape. So the scans below assert two things the vet-visits guard
// cannot: the KEY is read directly in exactly one file (the hook), and every
// other reader goes through `useDesignV2()`. A second direct read of the key
// anywhere is a second door, and it reds here.
//
// The bare key is a poor detector here for the mirror of the vet-visits reason:
// `design_v2` is the tail of the RETIRED `signal_design_v2` (the 2026-08 Signal
// uplift, GA'd and gone from the union), which still appears in `lib/appConfig.ts`
// and `lib/betaFeatures.ts`. Measured: both mentions are in COMMENTS, so the
// comment-blanked scan (`guards/blankComments.ts`, the single-pass walker C-18
// mandates) would not see them today — but a quoted `'design_v2'` regex is
// keyed on the quote and cannot match `'signal_design_v2'` either way, and the
// call-shape detectors below never look at the bare key at all. The collision is
// stated so the next reader does not "simplify" to a bare-key grep and inherit it.
//
// ── THE LIMIT, STATED (C-38 / C-41: an undocumented blind spot reads as coverage) ─
//
// `treeFor` renders and snapshots SYNCHRONOUSLY — what the comparisons see is the
// FIRST FRAME. A redesign node drawn straight from the tree (the mutation the AC
// names, and the one the proof at the foot of this file drives) is caught. A node
// whose render waits on an async read is NOT: CUL-904 removed History's vet-visit
// gate and the sibling guard stayed green, because the ungated read had not
// resolved when the tree was taken. Both surfaces here have that shape — Home's
// cards hydrate from local reads, and Patterns' first frame is its skeleton while
// `useFocusEffect` loads the cards — so this file proves the SYNCHRONOUS half for
// both, and each Design v2 lane that lands a data-dependent surface proves the
// async half in the screen's own suite: flag-off renders no redesign node AND
// issues no redesign read, over a fixture that would answer if called (an absence
// proves a gate only when the thing gated was available to leak). D2-4 owes that
// for Home, D2-5 for Patterns, D2-3 for the Signal route it adds here.
//
// ── WHY MOCKING HEAVY CHILDREN IS SAFE HERE ────────────────────────────────────
//
// The mocks below exist only to get two real screens to mount under jest. They
// cannot weaken the assertion: this is a DIFFERENTIAL over two renders of the same
// tree under the same mocks, so anything mocked away is mocked away identically on
// both sides. A mock can cost coverage (a stubbed child that would have rendered a
// redesign node), never a false pass — and the mocked-module closure test below
// asserts none of them reach the namespace, rather than leaving it to this comment.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    require('react').useEffect(() => cb(), []);
  },
}));
jest.mock('../lib/supabase', () => {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq']) {
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
// One local DB for both surfaces. Sync + async readers both answer empty, which is
// the quiet record — the state in which a leaked redesign node is most visible,
// because nothing else is competing for the surface.
jest.mock('../lib/db', () => {
  const rows: unknown[] = [];
  const db = {
    getAllAsync: jest.fn(async () => rows),
    getAllSync: jest.fn(() => rows),
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
  return {
    getDb: () => db,
    getRecentFoods: jest.fn(async () => []),
    getTimeline: jest.fn(async () => []),
  };
});
jest.mock('../lib/sync', () => ({ syncNow: jest.fn(), syncPendingVetVisits: jest.fn() }));
jest.mock('../lib/haptics', () => ({ destructiveConfirm: jest.fn(), pullThreshold: jest.fn() }));
jest.mock('../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn(async () => undefined) }));
jest.mock('../hooks/useWidgetPetLink', () => ({ useWidgetPetLink: () => {} }));
jest.mock('../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn(async () => []),
  getBoundaryMarkers: jest.fn(async () => []),
}));
jest.mock('../lib/signal', () => ({ regenerateSignal: jest.fn() }));
jest.mock('../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn(), prependEvent: jest.fn() }),
}));
// Patterns' leaf dependencies (the set app/insights/index.test.tsx stands up).
// react-native-gifted-charts ships untransformed ESM, so no chart can mount under
// jest at all; the analytics getters, the weight read, the summary hook and the two
// Signals-v2 panel loaders all reach the mocked DB / the network. Symmetric across
// both renders; none of them draws a redesign surface (asserted below).
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../lib/analytics', () => {
  const actual = jest.requireActual('../lib/analytics');
  return {
    ...actual,
    getSymptomCounts: jest.fn(async () => []),
    getSymptomFrequencyByDay: jest.fn(async () => []),
    getSymptomFrequencyByMonth: jest.fn(async () => []),
    getIntakeDeclineByMonth: jest.fn(async () => []),
    getEarliestEventMonth: jest.fn(async () => null),
    getIntakeRateWithPrior: jest.fn(async () => null),
    getTopFoods: jest.fn(async () => []),
    getTopProteins: jest.fn(async () => []),
    getMealTreatComposition: jest.fn(async () => ({ meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 })),
  };
});
jest.mock('../lib/weight', () => ({
  getWeightHistory: jest.fn(async () => []),
  getWeightReadingCount: jest.fn(async () => 0),
  computeWeightTrend: () => ({
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  }),
}));
jest.mock('../hooks/useSummary', () => ({
  useSummary: () => ({ summary: null, displayState: 'building', petName: 'Mochi', isLoading: false }),
}));
jest.mock('../lib/patternsTiming', () => {
  const actual = jest.requireActual('../lib/patternsTiming');
  return { ...actual, getTimingPanel: jest.fn(async () => null) };
});
jest.mock('../lib/patternsTrial', () => {
  const actual = jest.requireActual('../lib/patternsTrial');
  return { ...actual, getTrialPanel: jest.fn(async () => null) };
});
// The look modules keep their RULES real and stub only their READS (C-34: a mock
// standing in for a pure function uses `jest.requireActual`; the read is what
// needs stubbing, never the rule). Home's LookCard and Patterns' pairing both
// consume these, so a narrower mock (the Patterns suite's `lookWithheld`-only
// shape) leaves Home unable to mount.
jest.mock('../lib/looks', () => {
  const actual = jest.requireActual('../lib/looks');
  return {
    ...actual,
    loadLookDays: jest.fn(async () => []),
    loadVomitLocalDays: jest.fn(async () => []),
  };
});
jest.mock('../lib/lookWithheld', () => {
  const actual = jest.requireActual('../lib/lookWithheld');
  return { ...actual, loadLookWithheldFacts: jest.fn(async () => null) };
});
jest.mock('../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi', species: 'cat' };
  const state = { activePet: pet, pets: [pet] };
  const hook = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  return {
    usePetStore: Object.assign(hook, { getState: () => state }),
    resolveRecordPetName: () => 'Mochi',
  };
});
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

const REPO_ROOT = path.resolve(__dirname, '..');

/** Repo-relative prefix of the namespace itself. */
const NAMESPACE_PREFIX = 'components/designV2/';

/**
 * Where the redesign's rendering lives. Everything the flag draws goes here, so
 * that stubbing this one directory is the same thing as "the redesign does not
 * exist". A screen may hold the gate; it delegates the drawing here.
 */
const DESIGN_V2_UI_DIR = path.join(REPO_ROOT, NAMESPACE_PREFIX);

/** The one file allowed to read the key directly — the gate every surface reads. */
const THE_HOOK = 'hooks/useDesignV2.ts';

/** Absolute paths of every module in the namespace. Only `index.ts` until D2-3. */
function designV2UiModules(dir: string = DESIGN_V2_UI_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...designV2UiModules(abs));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Whether the namespace is currently answering as ABSENT. */
let redesignAbsent = false;

/**
 * Register one namespace module as switchable: it keeps its real exports, and each
 * exported component renders null while `redesignAbsent` is set. Registered ONCE,
 * before anything requires a screen, and never reset — `jest.isolateModules` cannot
 * swap a module under a renderer (fresh React, dead hooks; requiring RTL inside it
 * re-runs its hook registration and jest rejects it), which is why this is a
 * mutable Proxy with the switch inside the wrapper's render (C-36). The switch
 * lives in the render, not the lookup, so a destructured or captured reference
 * still flips; the wrapper is memoised per export so identity is stable.
 *
 * Documented limit: a non-component export from the namespace would be wrapped
 * into a component. The namespace is UI by convention; a helper belongs in `lib/`.
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
            redesignAbsent ? null : React.createElement(Real, props);
          Switchable.displayName = `Switchable(${key})`;
          wrappers.set(key, Switchable);
        }
        return wrappers.get(key);
      },
    });
  });
}

/**
 * A rendered tree reduced to what an owner could actually see: element types,
 * their props, their children — key-sorted, with functions collapsed to a marker.
 *
 * The raw `toJSON()` cannot be compared: an element-valued prop (`ScrollView`'s
 * `refreshControl` on Home) carries an `_owner` fiber holding wall-clock render
 * timings, so a tree differs from itself. Handler identity is erased too — a fresh
 * closure per render is not a leak; a leak is a whole subtree.
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
  // A RENDERED node, checked FIRST and by shape: react-test-renderer's JSON nodes
  // carry a `$$typeof` of their own, and testing for the symbol first collapsed
  // every tree to its root in the sibling guard's first draft — eight green tests
  // measuring nothing (C-36). The discriminator is `children` as an own key.
  if ('type' in o && 'props' in o && 'children' in o) {
    return {
      type: o.type,
      props: normalize(o.props, seen),
      children: normalize(o.children, seen),
    };
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

/** Render one surface as it stands, normalized, then unmounted. FIRST FRAME ONLY —
 *  see the header's stated limit. */
function treeFor(load: () => ComponentType): unknown {
  const Screen = load();
  const r = render(React.createElement(Screen));
  const tree = normalize(r.toJSON());
  r.unmount();
  return tree;
}

/** Run `fn` with every registered namespace module answering as absent. */
function withRedesignAbsent<T>(fn: () => T): T {
  redesignAbsent = true;
  try {
    return fn();
  } finally {
    redesignAbsent = false;
  }
}

// Registered at module scope, before any screen is loaded. Only `index.ts` at D2-0
// — which is exactly why the mutation proof at the foot of this file exists.
for (const abs of designV2UiModules()) registerSwitchable(abs);

/**
 * Every surface the redesign reaches, each loaded through `require` inside the
 * test rather than imported at the top of the file — a top-level import would bind
 * one cached instance and defeat the stubbed render.
 *
 * This list is the guard's SCOPE: a surface absent from it has its flag-off tree
 * checked by nothing (C-41). Home and Patterns are the two the redesign touches at
 * step 1; D2-3 adds the Signal's route in the same diff that creates it. The
 * `every app/ consumer is a listed surface` test below is what makes that a
 * build failure rather than a convention to remember.
 */
const SURFACES: ReadonlyArray<{ name: string; rel: string; load: () => ComponentType }> = [
  { name: 'Home', rel: 'app/(tabs)/index.tsx', load: () => require('../app/(tabs)/index').default },
  { name: 'Patterns', rel: 'app/insights/index.tsx', load: () => require('../app/insights/index').default },
];

/** Rendered nodes in a normalized tree — the non-vacuity measure below. */
function nodeCount(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + nodeCount(c), 0);
  const o = node as Record<string, unknown>;
  const self = 'type' in o && 'children' in o ? 1 : 0;
  return self + nodeCount(o.children);
}

/**
 * A floor, not a pin. Both surfaces render an order of magnitude more than this, so
 * the number never needs revisiting as the screens change — it only has to be high
 * enough that a collapsed or empty tree cannot clear it.
 */
const MIN_SURFACE_NODES = 5;

describe('D2-0 — flag-off is byte-identical to an app without the redesign', () => {
  it('the gate really is OFF in this environment, through the hooks the screens call', () => {
    // A claim about the flag-OFF tree has to assert the premise through the hook
    // the SCREENS call, not a resolver invoked on a local object (which
    // lib/appConfig.test.ts already covers and says nothing about this
    // environment). Both doors are probed: the key's direct read and the one
    // gate every surface reads.
    const seen: boolean[] = [];
    const Probe = () => {
      const cfg = require('../hooks/useAppConfig') as typeof import('../hooks/useAppConfig');
      const gate = require('../hooks/useDesignV2') as typeof import('../hooks/useDesignV2');
      seen.push(cfg.useAllowlistFlag('design_v2'), gate.useDesignV2());
      return null;
    };
    render(React.createElement(Probe));
    expect(seen).toEqual([false, false]);
  });

  it('every listed surface exists on disk — the scope is checked against the repo, not read off this constant', () => {
    // C-38: a floor that iterates the list under test is green when an entry is
    // removed from it. The surface set is pinned by NAME here (the two the spec
    // names), and each name is checked against the repository.
    expect(SURFACES.map((s) => s.name)).toEqual(['Home', 'Patterns']);
    for (const s of SURFACES) expect(fs.existsSync(path.join(REPO_ROOT, s.rel))).toBe(true);
  });

  it.each(SURFACES)('$name renders identically with the redesign absent', ({ load }) => {
    const present = treeFor(load);
    const absent = withRedesignAbsent(() => treeFor(load));

    // NON-VACUITY, asserted before the equality rather than assumed by it: an
    // equality over two empty things is the failure mode of this whole file.
    expect(nodeCount(present)).toBeGreaterThan(MIN_SURFACE_NODES);

    expect(present).toEqual(absent);
  });
});

// ── The consumer scans ──────────────────────────────────────────────────────────
/** The PR that lands the first consumer and deletes this file's D2-0 tripwire. */
const FIRST_CONSUMER_LANDS = 'CUL-1065 (D2-3 — the Signal card and its route)';

/**
 * Detector (a): the gate's call shape. A consumer is any file that calls
 * `useDesignV2()`. The hook's own declaration (`export function useDesignV2()`)
 * matches the same shape, so the hook file is excluded by name from THIS scan and
 * is instead the one file the direct-read scans below must find.
 */
const CONSUMER_RE = /\buseDesignV2\(\s*\)/;
/** Detector (b): the key read directly — allowed in exactly one file, the hook. */
const DIRECT_FLAG_READ_RE = /useAllowlistFlag\(\s*['"]design_v2['"]\s*\)/;
const DIRECT_OPT_IN_READ_RE = /useBetaOptIn\(\s*['"]design_v2['"]\s*\)/;
/**
 * Key-independent and permanent: an ALIASED import (`import { useDesignV2 as gate }`)
 * walks straight past a call-shape regex, so nobody aliases any of the three hooks.
 * True across the repo today; a future alias reds this and lands the job of teaching
 * the detectors about it on the PR that introduces it.
 */
const ALIASED_HOOK_RE = /\b(?:useDesignV2|useAllowlistFlag|useBetaOptIn)\s+as\s+\w+/;
/**
 * A VALUE import from the namespace, at any relative depth. `import type` is
 * excluded: a type is erased and renders nothing, so a type-only import would
 * satisfy the rule while the file drew its redesign UI inline.
 *
 * STATED BLIND SPOT: a regex over import statements cannot tell a namespace import
 * that is RENDERED from one that is merely present. It raises the cost of the leak
 * from "forget the convention" to "write a line that does nothing"; the equality
 * half remains the real backstop for anything that renders.
 */
const IMPORTS_NAMESPACE_RE = /(?:^|\n)\s*import\s+(?!type\s)[^;\n]*from\s+['"][^'"]*components\/designV2\//;

/**
 * Collapse the whitespace inside a braced import's specifier list, dropping
 * per-specifier `type` entries, so a prettier-wrapped multi-line import reads to
 * `IMPORTS_NAMESPACE_RE` exactly as the single-line form does — and an inline
 * type-only list (`import { type X }`) is normalised to the statement form the
 * pattern already rejects, rather than handed a match (the sibling guard's
 * measured hole, CUL-952).
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

/**
 * Does this consumer draw through something the equivalence half can stub? Two
 * ways, and the second is STRICTLY STRONGER: a screen holds the gate and imports
 * the namespace (the drawing it delegates is stubbed while the screen renders); or
 * the file IS IN the namespace, so the whole file answers as absent.
 */
function drawsThroughNamespace(rel: string, src: string): boolean {
  if (rel.startsWith(NAMESPACE_PREFIX)) return true;
  return IMPORTS_NAMESPACE_RE.test(collapseBracedImports(src));
}

/**
 * Consumers excused from the draws-through-the-namespace rule: a file that reads
 * the gate to DECIDE something without drawing anything. Declared with no members
 * rather than left implicit (C-32); the staleness check below keeps it honest.
 */
const DRAWS_ELSEWHERE_OK: Record<string, string> = {};

/** The directories both detectors read. Checked against the repository below. */
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

function rel(abs: string): string {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

function allAppSources(): string[] {
  return SCAN_DIRS.map((d) => path.join(REPO_ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((root) => sourcesUnder(root));
}

/** Every file calling `useDesignV2()`, the hook's own declaration excluded. */
function gateConsumers(): string[] {
  return allAppSources()
    .map(rel)
    .filter((r) => r !== THE_HOOK)
    .filter((r) => CONSUMER_RE.test(readCode(path.join(REPO_ROOT, r))))
    .sort();
}

function filesMatching(re: RegExp, roots: string[] = allAppSources()): string[] {
  return roots.map(rel).filter((r) => re.test(readCode(path.join(REPO_ROOT, r)))).sort();
}

/**
 * The repo-local modules this file mocks away, plus everything they import,
 * transitively — the set the comparison above is structurally blind to. Derived by
 * reading this file's own `jest.mock(...)` calls, so adding a mock at the top cannot
 * silently widen the blind spot without widening this check with it.
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
  const selfPath = path.join(REPO_ROOT, 'guards/designV2FlagOff.test.tsx');
  const self = readCode(selfPath);
  const stack: string[] = [];
  for (const m of self.matchAll(MOCK_CALL_RE)) {
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
  return [...seen].map(rel).sort();
}

describe('the redesign has one gate, and its consumers stay inside the namespace', () => {
  it(`D2-0 tripwire: nothing consumes useDesignV2() yet — deleted by ${FIRST_CONSUMER_LANDS}`, () => {
    // C-32: an empty set is an assertion, and it is deleted by the PR that
    // invalidates it rather than edited into a list of what happens to be true.
    // Three debts go with it: the namespace's first module, the beta shelf's
    // on-state hint for `design_v2` (app/settings/beta.tsx, which today says
    // nothing because nothing renders), and the Signal route joining SURFACES.
    expect(gateConsumers()).toEqual([]);
  });

  it('the key is read directly in exactly one file — the hook — for both gates', () => {
    // One hook, one call shape (see the header). A second direct read of the key
    // is a second door the call-shape scan cannot see, so it is refused outright.
    expect(filesMatching(DIRECT_FLAG_READ_RE)).toEqual([THE_HOOK]);
    expect(filesMatching(DIRECT_OPT_IN_READ_RE)).toEqual([THE_HOOK]);
  });

  it('nobody aliases useDesignV2 / useAllowlistFlag / useBetaOptIn, so the call-shape scans have no blind spot', () => {
    expect(filesMatching(ALIASED_HOOK_RE)).toEqual([]);
  });

  it('the scan set covers every directory in the repository that reads the gate', () => {
    // C-38: a detector's directory list is a constant, and a constant that is
    // also the floor is green when a directory is removed from it. So the expected
    // set is derived from the REPOSITORY: every top-level directory holding a
    // source file that reads the gate or the key must be one this file scans.
    // `guards/` is excluded because this file is in it and quotes every shape.
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

  it('no module this file mocks away can hide a redesign node from the comparison', () => {
    // A leak inside a MOCKED child is invisible to the differential (both sides
    // replace it before its body runs), so the mocked set is walked to its
    // transitive local imports and none may reach the namespace (C-36).
    const offenders = mockedModuleClosure().filter((r) => r.startsWith(NAMESPACE_PREFIX));
    expect(offenders).toEqual([]);
  });

  it('once a consumer exists, the namespace the equivalence half stubs holds a component', () => {
    // A consumer with an empty namespace means the redesign is being drawn
    // somewhere `treeFor` cannot stub — every comparison above vacuously green.
    // `index.ts` alone does not count: it exports nothing.
    const drawing = designV2UiModules().filter((abs) => path.basename(abs) !== 'index.ts');
    if (gateConsumers().length === 0) {
      expect(drawing).toEqual([]);
      return;
    }
    expect(drawing.length).toBeGreaterThan(0);
  });

  it('every consumer draws through the namespace', () => {
    const drawsElsewhere = gateConsumers()
      .filter((r) => !(r in DRAWS_ELSEWHERE_OK))
      .filter((r) => !drawsThroughNamespace(r, readCode(path.join(REPO_ROOT, r))));
    expect(drawsElsewhere).toEqual([]);
  });

  it('every route under app/ that consumes the gate is a listed surface', () => {
    // C-41: a surface absent from SURFACES has its flag-off tree checked by
    // nothing. A screen that reads the gate is, by definition, a surface the
    // redesign reaches — so it joins the list in the same diff.
    const listed = new Set(SURFACES.map((s) => s.rel));
    const unlisted = gateConsumers().filter((r) => r.startsWith('app/') && !listed.has(r));
    expect(unlisted).toEqual([]);
  });

  it('the delegation detector reads both import shapes, and still refuses type-only ones', () => {
    const single = `import { A } from '../../components/designV2/A';`;
    const multi = `import {\n  A,\n  type B,\n} from '../../components/designV2/A';`;
    const typeOnly = `import type { A } from '../../components/designV2/A';`;
    const inlineTypeOnly = `import {\n  type A,\n} from '../../components/designV2/A';`;
    const none = `import { View } from 'react-native';\nimport { x } from '../../lib/designV2';`;

    expect(drawsThroughNamespace('app/s.tsx', single)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', multi)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', typeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', inlineTypeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', none)).toBe(false);
    expect(drawsThroughNamespace('components/designV2/Card.tsx', none)).toBe(true);
  });

  it('the draws-through-the-namespace exemption has no stale entries', () => {
    const consumers = new Set(gateConsumers());
    expect(Object.keys(DRAWS_ELSEWHERE_OK).filter((k) => !consumers.has(k))).toEqual([]);
  });
});

// ── The mutation proof (C-18: a guard that has only ever been green is untested) ─
// The equivalence half is green today for a trivial reason — the namespace holds
// nothing that renders — so on its own it demonstrates nothing. This drives the
// SAME `treeFor` against a synthetic surface that renders a namespace module
// ungated, which is precisely the D2-3 mutation the AC names, and requires it to
// come apart. (The real mutation — a namespace card rendered ungated in Home — was
// run once by hand on this PR and is recorded in its body.)
//
// The fixture lives outside the repo (guards/fixtureRoot.ts) so a parallel guard's
// directory walk cannot pick it up. It is plain CommonJS with no JSX and reaches
// react/react-native through the test's own objects, because a file in the OS temp
// directory has neither this repo's babel transform nor its resolution path — and a
// second React instance yields an unrendered element rather than a tree, silently.
describe('the equivalence half bites (proven by mutation, not by reading)', () => {
  let root = '';
  let load: () => ComponentType;

  beforeAll(() => {
    root = createFixtureRoot('design-v2-flag-off');
    (globalThis as Record<string, unknown>).__NYX_DESIGN_V2_FIXTURE_DEPS__ = {
      React,
      Text: require('react-native').Text,
      View: require('react-native').View,
    };
    writeFixture(root, 'deps.js', `module.exports = globalThis.__NYX_DESIGN_V2_FIXTURE_DEPS__;\n`);
    // A namespace module that renders an owner-visible redesign node. It USES A
    // HOOK on purpose: a hookless component renders fine under a mismatched React.
    writeFixture(
      root,
      'designV2/LeakedSignal.tsx',
      `const { React, Text } = require('../deps');\n` +
        `exports.__esModule = true;\n` +
        `exports.LeakedSignal = function LeakedSignal() {\n` +
        `  const label = React.useMemo(() => 'Design v2', []);\n` +
        `  return React.createElement(Text, null, label);\n` +
        `};\n`,
    );
    writeFixture(
      root,
      'LeakySurface.tsx',
      `const { React, View } = require('./deps');\n` +
        `const _card = require('./designV2/LeakedSignal');\n` +
        `exports.__esModule = true;\n` +
        `exports.default = function LeakySurface() {\n` +
        `  return React.createElement(View, null, React.createElement(_card.LeakedSignal, null));\n` +
        `};\n`,
    );

    const discovered = designV2UiModules(path.join(root, 'designV2'));
    expect(discovered).toHaveLength(1);
    for (const abs of discovered) registerSwitchable(abs);
    load = () => require(path.join(root, 'LeakySurface.tsx')).default;
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).__NYX_DESIGN_V2_FIXTURE_DEPS__;
    removeFixtureRoot(root);
  });

  it('a redesign node rendered ungated makes the two trees differ', () => {
    const present = treeFor(load);
    const absent = withRedesignAbsent(() => treeFor(load));

    expect(JSON.stringify(present)).toContain('Design v2');
    expect(JSON.stringify(absent)).not.toContain('Design v2');
    expect(present).not.toEqual(absent);
  });
});
