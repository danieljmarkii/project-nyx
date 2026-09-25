// HV-1 — with `history_v2` off, the app renders as if History v2 did not exist.
// (History v2 · the record you can read, HV-1 / CUL-1158; spec §5.1, §7 AC 35.)
//
// History v2 ships dark behind its own flag (H-8, PM 2026-09-24), so the promise every
// later lane inherits is "flag-off is byte-identical" — the second sentence of the
// shelf card's blurb. This file is the mechanical form of that promise over the
// surfaces the flag reaches: the History tab (the gate, HV-1) and Home, where HV-10
// adds the first paint and open-in-place under `design_v2` AND `history_v2`.
//
// ── THE SHAPE, INHERITED FROM THE DESIGN V2 GUARD (C-36) ─────────────────────────
//
// This file is the sibling of guards/designV2FlagOff.test.tsx and keeps its shape on
// purpose — and duplicates its harness rather than sharing it, the precedent that
// guard set with the retired vet-visits one. The two traps it documents apply here
// unchanged:
//   • A flag-on / flag-off DIFF is backwards in both directions — GREEN on the exact
//     defect (an ungated node is in both trees), RED on correct code.
//   • A GOLDEN `.snap` reds on every unrelated change and its repair is `jest -u`.
//
// What this file asserts instead is ABSENT-MODULE EQUIVALENCE:
//
//     the tree with the flag off  ===  the tree with components/historyV2/ stubbed out
//
// It depends on one convention: History v2's rendering lives in
// `components/historyV2/`. The History tab holds the gate (`useHistoryV2()`) and
// delegates the drawing there; UI written inline in a screen is invisible to the
// equality half, and the consumer scans below red a reader of the gate that does not
// import from the namespace.
//
// ── THE SURFACES, AND WHY HOME IS LISTED TWICE ─────────────────────────────────────
//
// History is where the flag lands at HV-1. Home does not read the flag yet, so its two
// comparisons are green by construction today; they are listed now so the day HV-10
// makes Home a consumer, its flag-off tree is already checked (C-41: a surface absent
// from the list is checked by nothing). Home is rendered in BOTH `design_v2` states
// because HV-10's Home change rides both flags (spec §5.1, §5.6): a leak that exists
// only on the redesigned Home would never reach a tree rendered with `design_v2` off.
// The `design_v2` state is arranged through the REAL stores, and each surface's floor
// proves the arrangement took (the redesigned Home carries `today-card`; the shipped
// one does not).
//
// ── THE LIMIT, STATED (C-38 / C-41: an undocumented blind spot reads as coverage) ─
//
// `treeFor` snapshots SYNCHRONOUSLY — the comparisons see the FIRST FRAME. A v2 node
// drawn straight from the tree (the mutation the AC names, and the one the proof at the
// foot drives) is caught. A node whose render waits on a read is NOT: History's rows
// arrive async, and so do Today's spine rows on the redesigned Home. History's half is
// proven in the screen's own suite (`app/(tabs)/history.historyV2.test.tsx`: flag-off,
// over a page read that answers, v1 draws its row and the v2 root never mounts; flag-on,
// v1's read is never issued). At HV-1 the v2 screen issues no read of its own, so that
// suite proves the MOUNT; HV-7 extends it to the real reads. Home's async half is
// HV-10's, in the redesigned Home's own suite, the day Home consumes the flag.
//
// ── WHY MOCKING HEAVY CHILDREN IS SAFE HERE ────────────────────────────────────
//
// The mocks exist only to get the two real screens to mount under jest. This is a
// DIFFERENTIAL over two renders of the same tree under the same mocks, so a mock can
// cost coverage (a stubbed child that would have drawn a v2 node), never a false pass
// — and the mocked-module closure test below asserts none of them reach the namespace.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
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
// One local DB for both surfaces. Every reader answers empty — the quiet record, where
// a leaked v2 node is most visible because nothing else competes for the surface.
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
    getEventAttachment: jest.fn(async () => null),
  };
});
jest.mock('../lib/sync', () => ({
  syncNow: jest.fn(),
  syncPendingEvents: jest.fn(),
  syncPendingVetVisits: jest.fn(),
  syncPendingMeals: jest.fn(),
  syncPendingMedicationAdministrations: jest.fn(),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
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
jest.mock('../hooks/useSummary', () => ({
  useSummary: () => ({ summary: null, displayState: 'building', petName: 'Mochi', isLoading: false }),
}));
// The look modules keep their RULES real and stub only their READS (C-34).
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
import { __resetAppConfigForTest } from '../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../lib/appConfig';
import { useBetaOptInStore } from '../lib/betaFeatures';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Repo-relative prefix of the namespace itself. */
const NAMESPACE_PREFIX = 'components/historyV2/';

/** Where History v2's rendering lives; stubbing it is "History v2 does not exist". */
const HISTORY_V2_UI_DIR = path.join(REPO_ROOT, NAMESPACE_PREFIX);

/** The one file allowed to read the key directly — the gate every surface reads. */
const THE_HOOK = 'hooks/useHistoryV2.ts';

/** Absolute paths of every module in the namespace. */
function historyV2UiModules(dir: string = HISTORY_V2_UI_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...historyV2UiModules(abs));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Whether the namespace is currently answering as ABSENT. */
let historyV2Absent = false;

/**
 * Register one namespace module as switchable: it keeps its real exports, and each
 * exported component renders null while `historyV2Absent` is set. Registered ONCE,
 * before anything requires a screen — `jest.isolateModules` cannot swap a module under
 * a renderer (C-36) — with the switch inside the wrapper's render, so a destructured or
 * captured reference still flips. The wrapper is memoised per export.
 *
 * Documented limit: a non-component function exported from the namespace would be
 * wrapped into a component. The namespace is UI by convention; a helper belongs in `lib/`.
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
            historyV2Absent ? null : React.createElement(Real, props);
          Switchable.displayName = `Switchable(${key})`;
          wrappers.set(key, Switchable);
        }
        return wrappers.get(key);
      },
    });
  });
}

/**
 * A rendered tree reduced to what an owner could see: element types, props, children
 * — key-sorted, functions collapsed to a marker. The raw `toJSON()` cannot be compared:
 * an element-valued prop carries an `_owner` fiber with wall-clock render timings, so a
 * tree differs from itself; a fresh handler closure per render is not a leak either.
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
function withHistoryV2Absent<T>(fn: () => T): T {
  historyV2Absent = true;
  try {
    return fn();
  } finally {
    historyV2Absent = false;
  }
}

// Registered at module scope, before any screen is loaded.
for (const abs of historyV2UiModules()) registerSwitchable(abs);

/** Arrange `design_v2` on or off through the REAL stores the screens read (the caller
 *  is `u1`, the mocked auth store's user). `history_v2` stays unset either way. */
function arrangeDesignV2(on: boolean): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, design_v2: { enabled: false, allowlist: on ? ['u1'] : [] } },
  });
  useBetaOptInStore.getState().reset();
  if (on) useBetaOptInStore.getState().setOptIn('design_v2', true);
}

interface Surface {
  name: string;
  rel: string;
  load: () => ComponentType;
  /** State the surface is rendered in, applied before both renders. */
  arrange: () => void;
  /** A string the flag-off tree must carry — the floor that proves the arrangement. */
  mustContain?: string;
  /** A string it must NOT carry — so two arrangements of one screen stay two states. */
  mustNotContain?: string;
}

/**
 * The guard's SCOPE: a surface absent from this list has its flag-off tree checked by
 * nothing (C-41). Each is loaded through `require` inside the test, never imported at
 * the top — a top-level import would bind one cached instance.
 */
const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'History',
    rel: 'app/(tabs)/history.tsx',
    load: () => require('../app/(tabs)/history').default,
    arrange: () => arrangeDesignV2(false),
    mustContain: '"History"',
  },
  {
    name: 'Home',
    rel: 'app/(tabs)/index.tsx',
    load: () => require('../app/(tabs)/index').default,
    arrange: () => arrangeDesignV2(false),
    mustNotContain: 'today-card',
  },
  {
    name: 'Home under design_v2',
    rel: 'app/(tabs)/index.tsx',
    load: () => require('../app/(tabs)/index').default,
    arrange: () => arrangeDesignV2(true),
    mustContain: 'today-card',
  },
];

/** Rendered nodes in a normalized tree — the non-vacuity measure below. */
function nodeCount(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + nodeCount(c), 0);
  const o = node as Record<string, unknown>;
  const self = 'type' in o && 'children' in o ? 1 : 0;
  return self + nodeCount(o.children);
}

/** A floor, not a pin: every surface renders an order of magnitude more. */
const MIN_SURFACE_NODES = 5;

afterEach(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

describe('HV-1 — flag-off is byte-identical to an app without History v2', () => {
  it('the gate really is OFF in this environment, through the hooks the screens call — in both design_v2 states', () => {
    // The premise, asserted through the hook the SCREENS call rather than a resolver
    // on a local object. Probed in both arrangements: switching design_v2 on must not
    // switch history_v2 on (H-8: its own flag).
    const cfg = require('../hooks/useAppConfig') as typeof import('../hooks/useAppConfig');
    const gate = require('../hooks/useHistoryV2') as typeof import('../hooks/useHistoryV2');
    const dv2 = require('../hooks/useDesignV2') as typeof import('../hooks/useDesignV2');
    for (const on of [false, true]) {
      arrangeDesignV2(on);
      const seen: boolean[] = [];
      const Probe = () => {
        seen.push(cfg.useAllowlistFlag('history_v2'), gate.useHistoryV2(), dv2.useDesignV2());
        return null;
      };
      render(React.createElement(Probe)).unmount();
      expect(seen).toEqual([false, false, on]);
    }
  });

  it('every listed surface exists on disk — the scope is checked against the repo, not read off this constant', () => {
    // C-38: a floor that iterates the list under test is green when an entry is
    // removed. The set is pinned by NAME, and each file is checked against the repo.
    expect(SURFACES.map((s) => s.name)).toEqual(['History', 'Home', 'Home under design_v2']);
    for (const s of SURFACES) expect(fs.existsSync(path.join(REPO_ROOT, s.rel))).toBe(true);
  });

  it.each(SURFACES)('$name renders identically with History v2 absent', ({ load, arrange, mustContain, mustNotContain }) => {
    arrange();
    const present = treeFor(load);
    arrange();
    const absent = withHistoryV2Absent(() => treeFor(load));

    // NON-VACUITY, asserted before the equality rather than assumed by it: an equality
    // over two empty things is the failure mode of this whole file.
    expect(nodeCount(present)).toBeGreaterThan(MIN_SURFACE_NODES);
    if (mustContain != null) expect(JSON.stringify(present)).toContain(mustContain);
    if (mustNotContain != null) expect(JSON.stringify(present)).not.toContain(mustNotContain);

    expect(present).toEqual(absent);
  });
});

// ── The consumer scans ──────────────────────────────────────────────────────────

/**
 * Detector (a): the gate's call shape. A consumer is any file calling `useHistoryV2()`.
 * The hook's own declaration matches the same shape, so the hook is excluded by name
 * here and is the one file the direct-read scans must find.
 */
const CONSUMER_RE = /\buseHistoryV2\(\s*\)/;
/** Detector (b): the key read directly — allowed in exactly one file, the hook. */
const DIRECT_FLAG_READ_RE = /useAllowlistFlag\(\s*['"]history_v2['"]\s*\)/;
const DIRECT_OPT_IN_READ_RE = /useBetaOptIn\(\s*['"]history_v2['"]\s*\)/;
/**
 * Key-independent and permanent: an ALIASED import walks past a call-shape regex, so
 * nobody aliases any of the three hooks. A future alias reds this and lands the job of
 * teaching the detectors about it on the PR that introduces it.
 */
const ALIASED_HOOK_RE = /\b(?:useHistoryV2|useAllowlistFlag|useBetaOptIn)\s+as\s+\w+/;
/**
 * A VALUE import from the namespace, at any relative depth, keyed on the PATH SEGMENT
 * `historyV2/` and refusing a `lib/historyV2/` (a helper directory is not the
 * namespace). `import type` is excluded: a type renders nothing.
 *
 * STATED BLIND SPOT: an import that is present is not an import that is RENDERED. This
 * raises the cost of the leak from "forget the convention" to "write a line that does
 * nothing"; the equality half remains the backstop for anything that renders.
 */
const IMPORTS_NAMESPACE_RE =
  /(?:^|\n)\s*import\s+(?!type\s)[^;\n]*from\s+['"](?:[^'"]*\/)?historyV2\/(?<!lib\/historyV2\/)/;

/**
 * Collapse a braced import's specifier list (dropping per-specifier `type` entries), so
 * a wrapped multi-line import reads as the single-line form does and an inline
 * type-only list normalises to the statement form the pattern already rejects.
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
function drawsThroughNamespace(rel: string, src: string): boolean {
  if (rel.startsWith(NAMESPACE_PREFIX)) return true;
  return IMPORTS_NAMESPACE_RE.test(collapseBracedImports(src));
}

/**
 * Consumers excused from the draws-through-the-namespace rule: a file that reads the
 * gate to DECIDE something without drawing. Declared empty rather than left implicit
 * (C-32); the staleness check keeps it honest.
 */
const DRAWS_ELSEWHERE_OK: Record<string, string> = {};

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

function rel(abs: string): string {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

function allAppSources(): string[] {
  return SCAN_DIRS.map((d) => path.join(REPO_ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((root) => sourcesUnder(root));
}

/** Every file calling `useHistoryV2()`, the hook's own declaration excluded. */
function gateConsumers(): string[] {
  return allAppSources()
    .map(rel)
    .filter((r) => r !== THE_HOOK)
    .filter((r) => CONSUMER_RE.test(readCode(path.join(REPO_ROOT, r))))
    .sort();
}

function filesMatching(re: RegExp): string[] {
  return allAppSources().map(rel).filter((r) => re.test(readCode(path.join(REPO_ROOT, r)))).sort();
}

/**
 * The repo-local modules this file mocks away, plus everything they import,
 * transitively — the set the comparison is structurally blind to. Derived by reading
 * this file's own `jest.mock(...)` calls, so a new mock cannot widen the blind spot
 * without widening this check with it.
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
  const selfPath = path.join(REPO_ROOT, 'guards/historyV2FlagOff.test.tsx');
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
  return [...seen].map(rel).sort();
}

describe('History v2 has one gate, and its consumers stay inside the namespace', () => {
  it('the History tab is the one consumer of the gate (HV-1), and every consumer is a known one', () => {
    // PINNED, not floored: a new consumer is a new surface, and it joins this list —
    // with its flag-off proof — in the diff that adds it (HV-10 adds Home).
    expect(gateConsumers()).toEqual(['app/(tabs)/history.tsx']);
  });

  it('the key is read directly in exactly one file — the hook — for both gates', () => {
    expect(filesMatching(DIRECT_FLAG_READ_RE)).toEqual([THE_HOOK]);
    expect(filesMatching(DIRECT_OPT_IN_READ_RE)).toEqual([THE_HOOK]);
  });

  it('nobody aliases useHistoryV2 / useAllowlistFlag / useBetaOptIn, so the call-shape scans have no blind spot', () => {
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

  it('no module this file mocks away can hide a History v2 node from the comparison', () => {
    // A leak inside a MOCKED child is invisible to the differential (both sides replace
    // it before its body runs), so the mocked set is walked to its transitive local
    // imports and none may reach the namespace (C-36).
    const closure = mockedModuleClosure();
    expect(closure.length).toBeGreaterThan(0);
    expect(closure.filter((r) => r.startsWith(NAMESPACE_PREFIX))).toEqual([]);
  });

  it('once a consumer exists, the namespace the equivalence half stubs holds a component', () => {
    // A consumer with an empty namespace means v2 is drawn somewhere `treeFor` cannot
    // stub — every comparison above vacuously green.
    expect(gateConsumers().length).toBeGreaterThan(0);
    expect(historyV2UiModules().map(rel)).toContain('components/historyV2/HistoryScreen.tsx');
  });

  it('every consumer draws through the namespace', () => {
    const drawsElsewhere = gateConsumers()
      .filter((r) => !(r in DRAWS_ELSEWHERE_OK))
      .filter((r) => !drawsThroughNamespace(r, readCode(path.join(REPO_ROOT, r))));
    expect(drawsElsewhere).toEqual([]);
  });

  it('every route under app/ that consumes the gate is a listed surface', () => {
    const listed = new Set(SURFACES.map((s) => s.rel));
    const unlisted = gateConsumers().filter((r) => r.startsWith('app/') && !listed.has(r));
    expect(unlisted).toEqual([]);
  });

  it('the delegation detector reads both import shapes, and still refuses type-only ones', () => {
    const single = `import { A } from '../../components/historyV2/A';`;
    const multi = `import {\n  A,\n  type B,\n} from '../../components/historyV2/A';`;
    const typeOnly = `import type { A } from '../../components/historyV2/A';`;
    const inlineTypeOnly = `import {\n  type A,\n} from '../../components/historyV2/A';`;
    const none = `import { View } from 'react-native';\nimport { x } from '../../lib/historyV2';`;
    const sibling = `import { Strip } from '../historyV2/WeekStrip';`;
    const helperDir = `import { x } from '../../lib/historyV2/helper';`;
    const otherNamespace = `import { TodayCard } from '../../components/designV2/home/TodayCard';`;

    expect(drawsThroughNamespace('app/s.tsx', single)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', multi)).toBe(true);
    expect(drawsThroughNamespace('components/home/Card.tsx', sibling)).toBe(true);
    expect(drawsThroughNamespace('app/s.tsx', helperDir)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', typeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', inlineTypeOnly)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', none)).toBe(false);
    expect(drawsThroughNamespace('app/s.tsx', otherNamespace)).toBe(false);
    expect(drawsThroughNamespace('components/historyV2/Card.tsx', none)).toBe(true);
  });

  it('the draws-through-the-namespace exemption has no stale entries', () => {
    const consumers = new Set(gateConsumers());
    expect(Object.keys(DRAWS_ELSEWHERE_OK).filter((k) => !consumers.has(k))).toEqual([]);
  });
});

// ── The mutation proof (C-18: a guard that has only ever been green is untested) ─
// The equivalence half is green today for a reason that proves nothing on its own: the
// gate holds. This drives the SAME `treeFor` against a synthetic surface that renders a
// namespace module ungated — the mutation the AC names — and requires it to come apart.
// (The real mutation, the History tab's gate removed, was run by hand on this PR and
// is recorded in its body.)
//
// The fixture lives outside the repo (guards/fixtureRoot.ts) so a parallel guard's walk
// cannot pick it up. It is plain CommonJS with no JSX and reaches react/react-native
// through the test's own objects: a file in the OS temp directory has neither this
// repo's babel transform nor its resolution path, and a second React instance yields
// an unrendered element rather than a tree, silently.
describe('the equivalence half bites (proven by mutation, not by reading)', () => {
  let root = '';
  let load: () => ComponentType;

  beforeAll(() => {
    root = createFixtureRoot('history-v2-flag-off');
    (globalThis as Record<string, unknown>).__NYX_HISTORY_V2_FIXTURE_DEPS__ = {
      React,
      Text: require('react-native').Text,
      View: require('react-native').View,
    };
    writeFixture(root, 'deps.js', `module.exports = globalThis.__NYX_HISTORY_V2_FIXTURE_DEPS__;\n`);
    // A namespace module that renders an owner-visible v2 node. It USES A HOOK on
    // purpose: a hookless component renders fine under a mismatched React.
    writeFixture(
      root,
      'historyV2/LeakedList.tsx',
      `const { React, Text } = require('../deps');\n` +
        `exports.__esModule = true;\n` +
        `exports.LeakedList = function LeakedList() {\n` +
        `  const label = React.useMemo(() => 'History v2', []);\n` +
        `  return React.createElement(Text, null, label);\n` +
        `};\n`,
    );
    writeFixture(
      root,
      'LeakySurface.tsx',
      `const { React, View } = require('./deps');\n` +
        `const _list = require('./historyV2/LeakedList');\n` +
        `exports.__esModule = true;\n` +
        `exports.default = function LeakySurface() {\n` +
        `  return React.createElement(View, null, React.createElement(_list.LeakedList, null));\n` +
        `};\n`,
    );

    const discovered = historyV2UiModules(path.join(root, 'historyV2'));
    expect(discovered).toHaveLength(1);
    for (const abs of discovered) registerSwitchable(abs);
    load = () => require(path.join(root, 'LeakySurface.tsx')).default;
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).__NYX_HISTORY_V2_FIXTURE_DEPS__;
    removeFixtureRoot(root);
  });

  it('a History v2 node rendered ungated makes the two trees differ', () => {
    const present = treeFor(load);
    const absent = withHistoryV2Absent(() => treeFor(load));

    expect(JSON.stringify(present)).toContain('History v2');
    expect(JSON.stringify(absent)).not.toContain('History v2');
    expect(present).not.toEqual(absent);
  });
});
