// AC 0 — with `vet_visits` off, the app renders as if the companion did not exist.
// (Vet visits — the appointment companion, VV-0 / CUL-898; spec §5.5 + §7 AC 0.)
//
// The whole track ships dark behind one flag (G0), so the promise every companion
// PR inherits is "flag-off is byte-identical". This file is the mechanical form of
// that promise over the four surfaces the spec names: Home, the Pet tab, /rundown
// and app/vet-visit.tsx.
//
// ── WHY IT IS SHAPED THIS WAY (three designs were tried; two are traps) ─────────
//
// The obvious reading of "a snapshot test toggles the flag and diffs" is an A/B
// DIFF — render flag-off, render flag-on, assert the trees are equal. It is
// backwards in both directions and must never be reintroduced:
//   • It stays GREEN on the exact defect it exists to catch. The mutation the AC
//     names is VV-2 rendering its card with the flag OFF (i.e. ungated). Ungated,
//     BOTH renders carry the card, the trees match, and the diff passes over the
//     leak.
//   • It goes RED on CORRECT code. A properly gated card is present flag-on and
//     absent flag-off — which is the feature working — so the first correct
//     consumer would force this test to be deleted.
//
// A GOLDEN `.snap` per surface bites the leak, but reds on every unrelated change
// to Home (which moves most weeks here) and its repair is `jest -u` — a guard
// whose repair silently blesses the bug is not a guard.
//
// What this file asserts instead is ABSENT-MODULE EQUIVALENCE:
//
//     the tree with the flag off  ===  the tree with components/vetvisits/ stubbed out
//
// That is "byte-identical to an app without the companion" stated mechanically,
// with no golden file and no testID convention to remember. It is green today
// (the namespace is empty, so the two renders are the same require), it reds the
// instant a companion node renders with the flag off, it stays green when that
// node is gated correctly, and it is immune to unrelated churn because both sides
// of the comparison move together.
//
// ── THE CONVENTION IT DEPENDS ON, AND THE TRIPWIRE THAT ENFORCES IT ────────────
//
// Equivalence can only see what it can stub, so the companion's rendering lives in
// `components/vetvisits/`. A screen may hold the gate, but it delegates the
// drawing to that namespace — UI written inline in a screen is invisible to this
// guard. `firstConsumerLands` below is the C-32 shape that makes that stick: it
// asserts EXACTLY ZERO consumers of the flag today and names the PR that will red
// it, because "every consumer is gated" proves nothing over an empty set, and a
// guard completed after the first consumer is a guard completed after the bug.
//
// ── WHY MOCKING HEAVY CHILDREN IS SAFE HERE ────────────────────────────────────
//
// The mocks below exist only to get four real screens to mount under jest. They
// cannot weaken the assertion: this is a DIFFERENTIAL over two renders of the same
// tree under the same mocks, so anything mocked away is mocked away identically on
// both sides. A mock can cost coverage (a stubbed child that would have rendered a
// companion node), never a false pass on the trees actually compared — and the
// stubbed children are the ones with no companion surface in them.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    require('react').useEffect(() => cb(), []);
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
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
// One local DB for every surface. Sync + async readers both answer empty, which is
// the quiet record — the state in which a leaked companion node is most visible,
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
  return { getDb: () => db, getRecentFoods: jest.fn(async () => []) };
});
jest.mock('../lib/sync', () => ({ syncNow: jest.fn(), syncPendingVetVisits: jest.fn() }));
jest.mock('../lib/signal', () => ({ regenerateSignal: jest.fn() }));
jest.mock('../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn(), prependEvent: jest.fn() }),
}));
// react-native-gifted-charts ships untransformed ESM, so the Pet tab's weight chart
// cannot mount under jest at all. Symmetric across both renders; it draws no
// companion surface.
jest.mock('../components/profile/WeightTrendCard', () => ({ WeightTrendCard: () => null }));
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
import { createFixtureRoot, writeFixture, removeFixtureRoot } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Where the companion's rendering lives. Everything the flag draws goes here, so
 * that stubbing this one directory is the same thing as "the companion does not
 * exist". A screen may hold the gate; it delegates the drawing here.
 */
const VET_VISITS_UI_DIR = path.join(REPO_ROOT, 'components/vetvisits');

/** Absolute paths of every module in the namespace. Empty until VV-2 (VV-0 state). */
function vetVisitsUiModules(dir: string = VET_VISITS_UI_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vetVisitsUiModules(abs));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/**
 * Whether the companion namespace is currently answering as ABSENT. Flipped by
 * `withCompanionAbsent` around the second of the two renders.
 */
let companionAbsent = false;

/**
 * Register one namespace module as switchable: it keeps its real exports, and each
 * exported component renders null while `companionAbsent` is set.
 *
 * Registered ONCE, before anything requires a screen, and never reset — which is
 * the whole reason this shape was chosen over `jest.isolateModules`. Two earlier
 * attempts are worth not repeating:
 *   • Rendering inside `isolateModules` gives the screen a FRESH React while the
 *     top-level renderer holds the original, so every hook died on `Cannot read
 *     properties of null (reading 'useCallback')`.
 *   • Requiring the renderer inside the isolated registry too fixes the identity
 *     but re-runs RTL's module-scope hook registration, which jest rejects
 *     outright ("Hooks cannot be defined inside tests") — and took 162 s for one
 *     surface before it got there.
 *
 * The switch lives INSIDE the wrapper's render rather than in the module lookup,
 * so it does not depend on how the importing screen bound the symbol — a
 * destructured or otherwise captured reference still flips. The wrapper is
 * memoised per export so component identity is stable across the two renders.
 *
 * Documented limit: a non-component export from this namespace would be wrapped
 * into a component. The namespace is UI by convention (that is what makes
 * stubbing it equivalent to "the companion does not exist"); a helper belongs in
 * `lib/`, and if one ever lands here this is the line that widens.
 */
function registerSwitchable(abs: string): void {
  jest.doMock(abs, () => {
    const actual = jest.requireActual(abs) as Record<string, unknown>;
    const wrappers = new Map<string, unknown>();
    return new Proxy(actual, {
      get(target, key: string | symbol) {
        const real = target[key as string];
        // Symbol keys pass straight through. A UI module is unlikely to export a
        // symbol-keyed function, but the Proxy sees every lookup the runtime makes
        // (Symbol.toStringTag, Symbol.iterator, jest's own probes), and wrapping
        // one of those into a React component would be a quiet way to break a
        // module the guard is only supposed to observe.
        if (typeof key === 'symbol') return real;
        if (key === '__esModule' || typeof real !== 'function') return real;
        if (!wrappers.has(key)) {
          const Real = real as React.ComponentType<Record<string, unknown>>;
          const Switchable = (props: Record<string, unknown>) =>
            companionAbsent ? null : React.createElement(Real, props);
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
 * Comparing the raw `toJSON()` does not work, and the way it fails is quiet. The
 * tree itself is clean (`{type, props, children}`), but a prop holding a React
 * ELEMENT — `ScrollView`'s `refreshControl` is the one on Home — carries that
 * element's `_owner` fiber, and a fiber holds `actualStartTime`, `actualDuration`,
 * `treeBaseDuration`. Those are wall-clock render timings, so they differ between
 * any two renders of anything. Left in, all four surfaces failed against
 * THEMSELVES, and jest spent minutes printing a 260 KB diff of numbers that mean
 * nothing. Left in AND papered over with a tolerance, the guard would be junk.
 *
 * Handler identity is deliberately erased too: a fresh closure per render is not a
 * companion leak, and a leak is a whole subtree, never a changed callback.
 */
function normalize(node: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (node === null || typeof node !== 'object') {
    return typeof node === 'function' ? '[fn]' : node;
  }
  // `seen` tracks the ANCESTOR PATH, not everything visited: entered on the way
  // down and released on the way out. A visited-set is the easier thing to write
  // and it is wrong here — RN reuses one registered style object across many
  // elements, so the second and later appearances of a perfectly acyclic shared
  // object would collapse to '[circular]' and take whatever they contain out of
  // the comparison. Only a real cycle should be cut.
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
  // A RENDERED node, checked FIRST and by shape. react-test-renderer's JSON nodes
  // carry a `$$typeof` of their own (`Symbol.for('react.test.json')`), so testing
  // for that symbol before this collapsed every tree to its root element and made
  // all four comparisons vacuously green — passing for a reason that had nothing
  // to do with the companion. The mutation proof at the foot of this file is what
  // caught it, which is the entire argument for having one (C-18).
  // The discriminator is `children`: a rendered node has it as its own key, a
  // React element only ever inside `props`.
  if ('type' in o && 'props' in o && 'children' in o) {
    return {
      type: o.type,
      props: normalize(o.props, seen),
      children: normalize(o.children, seen),
    };
  }
  // A React element sitting in a prop. Keep what it would draw; drop the fiber
  // links (`_owner` is the one carrying the timings) that make it unstable.
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

/** Render one surface as it stands, normalized. Unmounted so the next render of
 *  the same screen starts from a clean tree rather than beside a live one. */
function treeFor(load: () => ComponentType): unknown {
  const Screen = load();
  const r = render(React.createElement(Screen));
  const tree = normalize(r.toJSON());
  r.unmount();
  return tree;
}

/** Run `fn` with every registered namespace module answering as absent. */
function withCompanionAbsent<T>(fn: () => T): T {
  companionAbsent = true;
  try {
    return fn();
  } finally {
    companionAbsent = false;
  }
}

// Registered at module scope, before any screen is loaded. Empty at VV-0 — which is
// exactly why the mutation proof at the foot of this file exists.
for (const abs of vetVisitsUiModules()) registerSwitchable(abs);

/**
 * The four surfaces §7 AC 0 names, each loaded through `require` inside
 * `isolateModules` rather than imported at the top of the file — a top-level
 * import would bind one cached instance and defeat the stubbed render.
 */
const SURFACES: ReadonlyArray<{ name: string; load: () => ComponentType }> = [
  { name: 'Home', load: () => require('../app/(tabs)/index').default },
  { name: 'the Pet tab', load: () => require('../app/(tabs)/profile').default },
  { name: '/rundown', load: () => require('../app/rundown').default },
  { name: 'app/vet-visit.tsx', load: () => require('../app/vet-visit').default },
];

// The shipped seed (065). Every surface below renders under it: the flag is OFF for
// this caller, which is the state the whole assertion is about.
const DARK_SEED = { enabled: false, allowlist: [] as string[] };

/** Rendered nodes in a normalized tree — the non-vacuity measure below. */
function nodeCount(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + nodeCount(c), 0);
  const o = node as Record<string, unknown>;
  const self = 'type' in o && 'children' in o ? 1 : 0;
  return self + nodeCount(o.children);
}

/**
 * A floor, not a pin. Every one of the four surfaces renders far more than this
 * (the smallest, app/vet-visit.tsx, is an order of magnitude above it), so the
 * number never needs revisiting as the screens change — it only has to be high
 * enough that a collapsed or empty tree cannot clear it.
 */
const MIN_SURFACE_NODES = 5;

describe('AC 0 — flag-off is byte-identical to an app without the companion', () => {
  it('the seed this runs under is off for the caller (the premise, not an assumption)', () => {
    // Cheap, but it is the premise every case below rests on: if the dark seed ever
    // resolved ON, all four comparisons would be vacuous and still green.
    const {
      resolveAllowlistFlag,
    } = require('../lib/appConfig') as typeof import('../lib/appConfig');
    expect(resolveAllowlistFlag(DARK_SEED, 'u1', false)).toBe(false);
    expect(resolveAllowlistFlag(DARK_SEED, null, false)).toBe(false);
  });

  it.each(SURFACES)('$name renders identically with the companion absent', ({ load }) => {
    const present = treeFor(load);
    const absent = withCompanionAbsent(() => treeFor(load));

    // NON-VACUITY, and it is not ceremony: the first working version of
    // `normalize` collapsed every tree to its root element, so all four of these
    // compared `{element:'View'}` against itself and passed green. An equality
    // over two empty things is the failure mode of this whole file, so the floor
    // is asserted before the equality rather than assumed by it.
    expect(nodeCount(present)).toBeGreaterThan(MIN_SURFACE_NODES);

    expect(present).toEqual(absent);
  });
});

// ── The C-32 tripwire ───────────────────────────────────────────────────────────
// Deleted by the PR that invalidates it, exactly as `firstCallerLands` was in
// guards/completionCard.test.ts.
const FIRST_CONSUMER_LANDS = 'CUL-900 (VV-2 — the Pet-tab home)';
/**
 * Two detectors, because one blunt one does not work here — and the reason is
 * worth keeping, since it is a consequence of the key name this PR chose.
 *
 * The obvious hardening is to match the bare key `['"]vet_visits['"]`, which is
 * immune to the bypass C-33 had to close in `guards/homeWrites.test.ts`: an
 * ALIASED import (`import { useAllowlistFlag as useFlag }`) walks straight past a
 * call-shape regex. Measured before adopting it (C-33 again: scope a detector by
 * running it), it flags **`lib/sync.ts`, `lib/hydration.ts` and
 * `lib/syncQueue.ts`** — none of them flag reads. `vet_visits` is also the name of
 * a TABLE that has existed since long before this flag, which is precisely why
 * the key was named to match it. So the bare key cannot separate "reads the flag"
 * from "pushes the table", and exempting the sync fabric would blind the scan to
 * a consumer added there later.
 *
 * So: (a) the call shape, which is what a consumer actually looks like, and
 * (b) a separate, key-independent assertion that nobody aliases the hook —
 * currently true everywhere in the repo, so it costs nothing and closes (a)'s one
 * hole. A future alias reds (b) and lands the job of teaching (a) about it on the
 * PR that introduces it.
 */
const CONSUMER_RE = /useAllowlistFlag\(\s*['"]vet_visits['"]\s*\)/;
const ALIASED_HOOK_RE = /\buseAllowlistFlag\s+as\s+\w+/;

/** Every non-test source file in the app tree, so the scan cannot miss a consumer. */
function appSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) appSources(abs, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Every scanned source file in the app tree, both detectors over the same set. */
function allAppSources(): string[] {
  return ['app', 'components', 'hooks', 'lib', 'store']
    .map((d) => path.join(REPO_ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((root) => appSources(root));
}

function flagConsumers(): string[] {
  const hits: string[] = [];
  {
    for (const abs of allAppSources()) {
      if (CONSUMER_RE.test(fs.readFileSync(abs, 'utf8'))) hits.push(path.relative(REPO_ROOT, abs));
    }
  }
  return hits.sort();
}

describe('the companion has no consumer yet (VV-0)', () => {
  it(`exactly zero files read the flag — ${FIRST_CONSUMER_LANDS} is the PR that reds this`, () => {
    // The empty set made an assertion (C-32). When this goes red, that PR owes two
    // things in the SAME change, which is the whole point of failing here first:
    //   1. its companion UI under components/vetvisits/, so the equivalence half
    //      above can stub it — UI written inline in a screen is invisible to it;
    //   2. the deletion of this case, replaced by the permanent rule below.
    expect(flagConsumers()).toEqual([]);
  });

  it('nobody aliases useAllowlistFlag, so the call-shape scan above has no blind spot', () => {
    // Key-independent and permanent: it outlives the tripwire and keeps the
    // consumer scan honest for every later companion PR. True across the whole
    // repo today, so it costs nothing until someone makes it cost something —
    // at which point teaching CONSUMER_RE about the alias is their job.
    const aliased = allAppSources().filter((abs) =>
      ALIASED_HOOK_RE.test(fs.readFileSync(abs, 'utf8')),
    );
    expect(aliased.map((abs) => path.relative(REPO_ROOT, abs))).toEqual([]);
  });

  it('once a consumer exists, the namespace the equivalence half stubs is non-empty', () => {
    // The permanent half, and it survives this file's tripwire. Written now, while
    // both sides are empty, so the rule lands with the guard rather than after the
    // first PR that could have broken it. A consumer with an empty namespace means
    // the companion is being drawn somewhere `treeFor` cannot stub, which makes
    // every comparison above vacuously green.
    if (flagConsumers().length === 0) {
      expect(vetVisitsUiModules()).toEqual([]);
      return;
    }
    expect(vetVisitsUiModules().length).toBeGreaterThan(0);
  });
});

// ── The mutation proof (C-18: a guard that has only ever been green is untested) ─
// The equivalence half is green today for a trivial reason — the namespace is
// empty — so on its own it demonstrates nothing. This drives the SAME `treeFor`
// against a synthetic surface that renders a namespace module ungated, which is
// precisely the VV-2 mutation the AC names, and requires it to come apart.
//
// The fixture lives outside the repo (CUL-712 / guards/fixtureRoot.ts) so a
// parallel guard's directory walk cannot pick it up. It is plain CommonJS with no
// JSX, and reaches react/react-native by absolute path, because a file in the OS
// temp directory has neither this repo's babel transform nor its node_modules on
// its resolution path.
describe('the equivalence half bites (proven by mutation, not by reading)', () => {
  let root = '';
  let load: () => ComponentType;

  beforeAll(() => {
    root = createFixtureRoot('vet-visits-flag-off');

    // The fixture reaches React and the RN primitives through this shim rather
    // than by `require('react')`. It has to: a file in the OS temp directory has
    // neither this repo's resolution path nor its babel transform, and requiring
    // react by absolute path yields a DIFFERENT module instance from the one the
    // renderer holds — which produced an unrendered element rather than a tree,
    // silently, on the first attempt. Handing over the test's own objects makes
    // instance identity a non-question.
    (globalThis as Record<string, unknown>).__NYX_VET_VISITS_FIXTURE_DEPS__ = {
      React,
      Text: require('react-native').Text,
      View: require('react-native').View,
    };
    writeFixture(
      root,
      'deps.js',
      `module.exports = globalThis.__NYX_VET_VISITS_FIXTURE_DEPS__;\n`,
    );

    // A namespace module that renders an owner-visible companion node. `.tsx` so
    // the real discovery walk finds it, and it USES A HOOK on purpose: a hookless
    // component renders fine even under a mismatched React, so it could not catch
    // the identity bug that sank two earlier designs of this file.
    writeFixture(
      root,
      'vetvisits/LeakedCard.tsx',
      `const { React, Text } = require('../deps');\n` +
        `exports.__esModule = true;\n` +
        `exports.LeakedCard = function LeakedCard() {\n` +
        `  const label = React.useMemo(() => 'Vet visits', []);\n` +
        `  return React.createElement(Text, null, label);\n` +
        `};\n`,
    );
    // The surface, in the shape babel emits for `import { LeakedCard } from …`:
    // the module object read at the use site.
    writeFixture(
      root,
      'LeakySurface.tsx',
      `const { React, View } = require('./deps');\n` +
        `const _card = require('./vetvisits/LeakedCard');\n` +
        `exports.__esModule = true;\n` +
        // Ungated on purpose: this is the VV-2 mutation the AC names — a
        // companion card rendering with the flag off.
        `exports.default = function LeakySurface() {\n` +
        `  return React.createElement(View, null, React.createElement(_card.LeakedCard, null));\n` +
        `};\n`,
    );

    const discovered = vetVisitsUiModules(path.join(root, 'vetvisits'));
    // The discovery walk can see the fixture namespace at all — otherwise "the
    // trees differ" below could be true for some entirely unrelated reason.
    expect(discovered).toHaveLength(1);
    for (const abs of discovered) registerSwitchable(abs);
    load = () => require(path.join(root, 'LeakySurface.tsx')).default;
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).__NYX_VET_VISITS_FIXTURE_DEPS__;
    removeFixtureRoot(root);
  });

  it('a companion node rendered ungated makes the two trees differ', () => {
    const present = treeFor(load);
    const absent = withCompanionAbsent(() => treeFor(load));

    expect(JSON.stringify(present)).toContain('Vet visits');
    expect(JSON.stringify(absent)).not.toContain('Vet visits');
    expect(present).not.toEqual(absent);
  });
});
