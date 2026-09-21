// D2-7 — behind `design_v2`, the breathing tick is the app's ONLY looping motion
// (Design v2 — the whole day, CUL-1068; round 4 §07, the Principle 9 carve-out: "chrome
// never moves on its own — except the one tick, while the app is working on the pet's
// behalf. No other loop exists").
//
// Two walks, because a loop can reach the flag-on tree two ways:
//
//   1. WRITTEN in the namespace. Every source under `components/designV2/` is read
//      (comments blanked, the C-18 single-pass walker) for `Animated.loop(` and for an
//      `iterations: -1` (the other spelling of "forever", on `Animated.timing`'s config
//      or a Reanimated `withRepeat`). Exactly one file may match: the tick.
//   2. IMPORTED into it. The namespace's transitive LOCAL import closure is walked the
//      same way, excluding the namespace itself: the shipped `Skeleton` shimmer, the
//      `WhorlSpinner` and the `CulpritMark` each carry a loop, and a silhouette that
//      "reused Skeleton for its blocks" would put a second loop on screen flag-on with
//      the first walk green. Nothing outside the namespace that the namespace reaches
//      may loop.
//
// STATED BLIND SPOTS (C-38: undocumented ones read as coverage). A loop composed by
// hand — a `timing` whose completion callback restarts it, a `setInterval` driving
// `setValue` — has no spelling this scan reads; and a loop reached through a HOST's
// import (the report screen's `PrimaryButton` spinner, say) is on the flag-on tree and
// outside both walks, because the host is not the namespace. The first is refused by
// review; the second is D2-8's sweep, and the CLAUDE.md § Loading indicators rewrite
// that lands with it.
//
// THE REGISTRY IS AN EXEMPTION (C-32), and it exists because step 2's four lanes were
// built in parallel: lanes 1–3 landed the same day as this guard, each drawing its
// sub-second waits with the shipped `Skeleton` (a shimmer, one `Animated.loop`) or the
// `WhorlSpinner`, and D2-4 breathing its node's tick through the arrival's own value
// (`TICK_BREATH` in `components/motion/arrivalMotion.ts` — the same 1400ms / 0.35, so
// the tick's component reads its numbers from there). Each entry below names what
// loops, who reaches it, and the issue that removes it; the staleness test reds an
// entry the moment it stops looping or stops being reached, so the list can only
// shrink. A new looping import is a new entry with a new owner, never a silent
// addition — and the goal state is the empty registry.
//
// Proven by mutation at the foot: a fixture namespace holding a planted loop outside
// the tick, and a fixture module importing a looping helper, each red the walk.
import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const NAMESPACE_REL = 'components/designV2';
/** The one file allowed to loop. */
const THE_TICK = 'components/designV2/waits/Tick.tsx';

/**
 * Modules OUTSIDE the namespace that loop and that the namespace reaches today. An
 * exemption, each with its owner (C-32). Removed by CUL-1075 (the step-2 waits pass),
 * except the arrival's breath, which is the tick's second spelling and is unified there.
 */
const KNOWN_LOOP_IMPORTS: Readonly<Record<string, string>> = {
  'components/motion/arrivalMotion.ts':
    "D2-4's node breathes its tick through the arrival's own value so it can become the rail; the one carve-out, spelled twice — unified by CUL-1075",
  'components/ui/Skeleton.tsx':
    'the shimmer under the sub-second waits of SignalLeadCard, LookHeader, TodayCard and MonthInstrument (lanes 1–3) — swapped for waits/Silhouette by CUL-1075',
  'components/brand/WhorlSpinner.tsx':
    "SignalScreen's loading state (lane 1) — the screen's own silhouette by CUL-1075",
};

const LOOP_RE = /\bAnimated\.loop\s*\(/;
const FOREVER_RE = /\biterations\s*:\s*-1\b/;
const LOCAL_SPEC_RE = /(?:from\s*|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g;

function sourcesUnder(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) sourcesUnder(abs, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

function readCode(abs: string): string {
  return blankComments(fs.readFileSync(abs, 'utf8'));
}

function loops(abs: string): boolean {
  const code = readCode(abs);
  return LOOP_RE.test(code) || FOREVER_RE.test(code);
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = /\.(ts|tsx)$/.test(spec)
    ? [base]
    : [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

/** Every local module the given files reach, transitively, the seeds excluded. */
function importClosure(seeds: string[]): string[] {
  const seedSet = new Set(seeds);
  const seen = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const m of readCode(cur).matchAll(LOCAL_SPEC_RE)) {
      const resolved = resolveSpec(cur, m[1]);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen].filter((abs) => !seedSet.has(abs)).sort();
}

/** The two walks over one namespace root, as repo-relative lists of offenders. */
function walk(root: string, namespaceRel: string) {
  const rel = (abs: string) => path.relative(root, abs).split(path.sep).join('/');
  const inside = sourcesUnder(path.join(root, namespaceRel));
  const written = inside.filter(loops).map(rel).sort();
  const imported = importClosure(inside).filter(loops).map(rel).sort();
  return { inside: inside.map(rel).sort(), written, imported };
}

describe('D2-7 — the tick is the only loop behind design_v2', () => {
  it('the namespace holds sources, and the tick is among them (the walk reads something)', () => {
    const { inside } = walk(REPO_ROOT, NAMESPACE_REL);
    expect(inside.length).toBeGreaterThan(1);
    expect(inside).toContain(THE_TICK);
  });

  it('exactly one file in the namespace loops: the tick', () => {
    const { written } = walk(REPO_ROOT, NAMESPACE_REL);
    // Non-vacuous by construction: the tick MUST be found, or the detector reads nothing.
    expect(written).toEqual([THE_TICK]);
  });

  it('nothing the namespace imports from outside itself loops, beyond the registered exemptions', () => {
    const { imported } = walk(REPO_ROOT, NAMESPACE_REL);
    expect(imported.filter((r) => !(r in KNOWN_LOOP_IMPORTS))).toEqual([]);
  });

  it('every registered exemption still loops and is still reached — a stale entry is deleted, never kept', () => {
    // C-32: a registry entry that no longer describes a live hole reads as coverage
    // for a hole that has moved. Each entry must still be found by the walk it exempts.
    const { imported } = walk(REPO_ROOT, NAMESPACE_REL);
    for (const rel of Object.keys(KNOWN_LOOP_IMPORTS)) expect(imported).toContain(rel);
  });

  it('the detectors read both spellings of forever, and only those', () => {
    expect(LOOP_RE.test('const l = Animated.loop(Animated.timing(v, cfg));')).toBe(true);
    expect(LOOP_RE.test('Animated.loop (seq)')).toBe(true);
    expect(FOREVER_RE.test('withRepeat(anim, -1)')).toBe(false); // a positional -1 has no key
    expect(FOREVER_RE.test('{ iterations: -1 }')).toBe(true);
    expect(LOOP_RE.test('Animated.timing(v, { iterations: 3 })')).toBe(false);
    expect(FOREVER_RE.test('{ iterations: 3 }')).toBe(false);
    expect(LOOP_RE.test('myAnimated.loop(')).toBe(false);
  });
});

// ── The mutation proof (C-18: a guard that has only ever been green is untested) ──
describe('the walk bites (proven by mutation, not by reading)', () => {
  let root = '';

  beforeAll(() => {
    root = createFixtureRoot('design-v2-one-loop');
    // A fixture namespace: its own tick (allowed), a silhouette that loops in place
    // (the first walk's mutation), and a silhouette importing a looping helper from
    // outside the namespace (the second walk's mutation) — plus a comment that spells
    // the loop, which must NOT count.
    writeFixture(root, 'components/designV2/waits/Tick.tsx', `import { Animated } from 'react-native';\nexport const l = Animated.loop(null as never);\n`);
    writeFixture(root, 'components/designV2/waits/Shimmer.tsx', `import { Animated } from 'react-native';\n// Animated.loop( in a comment is not a loop\nexport const l = Animated.loop(null as never);\n`);
    writeFixture(root, 'components/designV2/waits/Reuser.tsx', `import { Skeleton } from '../../ui/Skeleton';\nexport const s = Skeleton;\n`);
    writeFixture(root, 'components/ui/Skeleton.tsx', `import { Animated } from 'react-native';\nexport const Skeleton = Animated.timing(null as never, { iterations: -1 } as never);\n`);
    writeFixture(root, 'components/ui/Quiet.tsx', `export const q = 1;\n`);
  });

  afterAll(() => removeFixtureRoot(root));

  it('a planted loop in a second namespace file, and a looping import, are both found', () => {
    const { written, imported } = walk(root, NAMESPACE_REL);
    expect(written).toEqual(['components/designV2/waits/Shimmer.tsx', 'components/designV2/waits/Tick.tsx']);
    expect(imported).toEqual(['components/ui/Skeleton.tsx']);
  });

  it('a comment spelling the loop does not count, and a quiet import does not either', () => {
    writeFixture(root, 'components/designV2/waits/Shimmer.tsx', `import { Animated } from 'react-native';\n// Animated.loop( in a comment is not a loop\nexport const l = 1;\n`);
    writeFixture(root, 'components/designV2/waits/Reuser.tsx', `import { q } from '../../ui/Quiet';\nexport const s = q;\n`);
    const { written, imported } = walk(root, NAMESPACE_REL);
    expect(written).toEqual(['components/designV2/waits/Tick.tsx']);
    expect(imported).toEqual([]);
  });
});
