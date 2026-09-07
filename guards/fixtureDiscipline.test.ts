// A guard may not write into the tree the guards scan (CUL-714, closing CUL-712).
//
// CUL-712 moved three guards' detector fixtures out of `app/` and `components/` and
// into `guards/fixtureRoot.ts`'s temp root, because jest runs suites in parallel: one
// guard's deliberately non-compliant fixture is live inside another guard's scan
// window, and the neighbour either dies on ENOENT mid-walk or reports the fixture as a
// real violation — an intermittent red on `main` naming a file that no longer exists,
// pointing at a rule nobody broke. That noise is not cosmetic: CLAUDE.md § Git Workflow
// forbids fixing a red run by weakening the check, so an unexplainable intermittent red
// is precisely the pressure that gets a guard weakened or a suite dropped.
//
// The helper makes that collision impossible FOR A GUARD THAT CALLS IT. It does not
// make it impossible. A future guard can still `fs.writeFileSync(path.join(ROOT,
// 'components', 'X.tsx'), …)` and reintroduce the defect, and CUL-712 explicitly
// rejected "a denylist the next guard has to remember" as the shape that caused this —
// so the residual is closed the other way round: not by asking authors to remember the
// helper, but by failing the build when a guard reaches past it.
//
// WHAT THIS SCANS FOR. A filesystem WRITE, in a file under `guards/`, whose
// destination is anchored to the repository root. Anchored means the destination
// expression names `REPO_ROOT` / `ROOT` / `__dirname` / `process.cwd()` — the four ways
// a path in this directory can come to point at the working tree. A destination built
// from `os.tmpdir()` or from a `createFixtureRoot` return is not anchored and does not
// match, which is the entire distinction being enforced.
//
// ONE LOCAL HOP, and it is load-bearing rather than a nicety. Every real in-repo write
// in this repo today is `fs.mkdirSync(probe, …)` — a bare identifier — with the repo
// anchoring one line up in `const probe = path.join(REPO_ROOT, …)`. A scan that read
// only the call site would find nothing to flag anywhere, and would have shipped green
// over the exact code it exists to notice. It is the same known limit the
// `ownerFacingCopy` guard carries: one hop is followed, a helper function is not.

import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const GUARDS_DIR = 'guards';

/** Calls that create or modify something on disk. A read is never the defect here. */
const WRITE_CALLS = [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'mkdirSync', 'mkdir', 'mkdtempSync', 'mkdtemp',
  'copyFileSync', 'copyFile', 'renameSync', 'rename',
  'rmSync', 'rm', 'rmdirSync', 'unlinkSync', 'unlink',
  'createWriteStream',
];

/** The four ways a path inside `guards/` comes to point at the working tree. */
const REPO_ANCHOR = /\b(REPO_ROOT|ROOT|__dirname)\b|process\s*\.\s*cwd\s*\(/;

const EXEMPTION = /\/\/\s*fixture-root-ok:\s*\S+/;

/**
 * Blank out everything that is TEXT rather than code — comments and string literals —
 * while preserving line structure.
 *
 * Comments, for the `completionCard` guard's reason, in both directions: this file's own
 * header spells the offending line out as prose, and every guard that got this right
 * carries a comment about temp roots, so matching raw source would flag the first and
 * let a future author launder the second by pasting the second.
 *
 * Strings for a reason this file discovered about itself. A guard's detector fixtures ARE
 * source code held in a template literal — the fixtures below contain
 * `fs.writeFileSync(path.join(ROOT, …))` verbatim, because that is the shape being
 * detected. Left alone, this guard reports its own test data as a violation and no guard
 * can ever prove its detector without tripping this one. A write call inside a string is
 * data, not a call the file makes.
 *
 * Line-PRESERVING, and that is load-bearing rather than tidy: `lineOf` and the exemption
 * window both index the raw file by a number computed off this output. Collapsing a
 * twelve-line block comment to one space slides every line number below it, so the
 * exemption lookup reads ten unrelated lines and the failure message points at the wrong
 * code. The first draft did exactly that and its exemption test still passed — the
 * fixture had no block comments, so the two numbering schemes happened to agree.
 */
function blankNonCode(src: string): string {
  const keepLines = (text: string) => text.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/\/\/[^\n]*/g, keepLines)
    .replace(/`(?:\\.|[^`\\])*`/g, keepLines)
    .replace(/'(?:\\.|[^'\\\n])*'/g, keepLines)
    .replace(/"(?:\\.|[^"\\\n])*"/g, keepLines);
}

/**
 * The first argument of the call starting at `openParen`, as source text.
 *
 * Depth-tracked rather than split on the first comma, so `path.join(root, 'a')` is
 * returned whole instead of truncated at its own separator — the truncated form drops
 * exactly the part that names the anchor.
 */
function firstArgument(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen + 1, i);
    } else if (c === ',' && depth === 1) return src.slice(openParen + 1, i);
  }
  return src.slice(openParen + 1);
}

/** How far above a call site a declaration may sit and still be the LOCAL one. */
const HOP_WINDOW_LINES = 10;

/**
 * The destination expression, following one local `const` hop when the argument is a
 * bare identifier. Falls back to the identifier itself when nothing nearby declares it —
 * an unresolvable name is not evidence of an anchor, and guessing would flag every write
 * to a parameter.
 *
 * "Local" is a line window, not merely "somewhere in this file", and the difference is
 * not theoretical: `fixtureRoot.ts` has a `const root = realResolve(REPO_ROOT)` inside
 * `isInsideRepo` and, thirty lines later, `fs.rmSync(root, …)` inside
 * `removeFixtureRoot`, where `root` is a PARAMETER. A file-wide hop binds the second to
 * the first and reports the helper that makes all of this possible as the thing it
 * forbids. A window is a cheap stand-in for scope, and errs toward the false negative —
 * which for this guard is the right direction, since a false positive on a compliant
 * guard is the noise CUL-712 says gets guards weakened.
 */
function resolveDestination(src: string, arg: string, callIndex: number): string {
  const bare = arg.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return bare;
  const before = src.slice(0, callIndex);
  const decls = [...before.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${bare}\\s*=\\s*([^;\\n]+)`, 'g'))];
  const nearest = decls[decls.length - 1];
  if (!nearest) return bare;
  const gap = before.slice(nearest.index).split('\n').length - 1;
  return gap <= HOP_WINDOW_LINES ? `${bare} ${nearest[1]}` : bare;
}

/** Line number (1-based) of the character at `index`. */
function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/** True if an exemption marker sits within ten lines above `line`. */
function exemptedAt(rawLines: string[], line: number): boolean {
  const from = Math.max(0, line - 11);
  return rawLines.slice(from, line - 1).some((l) => EXEMPTION.test(l));
}

export interface Violation { file: string; line: number; call: string; dest: string }

/**
 * `root` is a REQUIRED parameter, threaded through rather than read from the module
 * constant, for the reason `fixtureRoot.ts` spells out: a default silently re-points a
 * forgetful self-test back at the real tree, which is the failure this whole family of
 * files exists to make impossible. This guard dogfooding that rule is not decoration —
 * it is the one guard for which getting it wrong would be self-refuting.
 */
export function scanGuardWrites(root: string): Violation[] {
  const dir = path.join(root, GUARDS_DIR);
  if (!fs.existsSync(dir)) return [];
  const out: Violation[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.ts')) continue;
    const rel = path.posix.join(GUARDS_DIR, name);
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    const rawLines = raw.split('\n');
    const code = blankNonCode(raw);
    for (const call of WRITE_CALLS) {
      const re = new RegExp(`\\b${call}\\s*\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const openParen = m.index + m[0].length - 1;
        const dest = resolveDestination(code, firstArgument(code, openParen), m.index);
        if (!REPO_ANCHOR.test(dest)) continue;
        const line = lineOf(code, m.index);
        if (exemptedAt(rawLines, line)) continue;
        out.push({ file: rel, line, call, dest: dest.trim().slice(0, 120) });
      }
    }
  }
  return out;
}

describe('no guard writes into the tree the guards scan (CUL-714)', () => {
  it('the live guards/ directory is clean', () => {
    const violations = scanGuardWrites(ROOT);
    const report = violations
      .map((v) => `  ${v.file}:${v.line} — ${v.call}(${v.dest})`)
      .join('\n');
    expect(
      violations.length === 0 ? '' : `A guard writes to a repo-anchored path:\n${report}\n\n` +
        `Use createFixtureRoot() from guards/fixtureRoot.ts — a fixture inside a scanned\n` +
        `directory is live in a PARALLEL guard's walk (CUL-712). If the write is genuinely\n` +
        `safe, mark the site with "// fixture-root-ok: <reason>" within ten lines above.`,
    ).toBe('');
  });
});

// ── The detector, proven on fixtures that live OUTSIDE the scanned tree ──────────
//
// Written through `createFixtureRoot` rather than into `guards/` — which is not merely
// consistent, it is required: a fixture dropped in `guards/` would be picked up by THIS
// guard's own live scan above, and by every parallel guard's walk. The bug this file
// exists to prevent is one this file could most easily commit.
describe('the detector itself', () => {
  let root = '';
  beforeEach(() => { root = createFixtureRoot('fixture-discipline', [GUARDS_DIR]); });
  afterEach(() => { removeFixtureRoot(root); });

  const write = (src: string) => writeFixture(root, path.join(GUARDS_DIR, 'probe.test.ts'), src);

  it('catches the shape CUL-712 was filed for — a write straight into a scanned dir', () => {
    write(`fs.writeFileSync(path.join(ROOT, 'components', 'X.tsx'), 'x');`);
    expect(scanGuardWrites(root)).toHaveLength(1);
  });

  it('follows one local hop, which is the only form that occurs in practice', () => {
    // Every real in-repo write in this repo is exactly this: a bare identifier at the
    // call site, anchored one line up. A call-site-only scan reports zero here.
    write(`const probe = path.join(REPO_ROOT, '.x');\nfs.mkdirSync(probe, { recursive: true });`);
    expect(scanGuardWrites(root)).toHaveLength(1);
  });

  it('leaves a temp-rooted write alone, which is every compliant guard', () => {
    write(`const root = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\nfs.writeFileSync(path.join(root, 'a.ts'), 'x');`);
    expect(scanGuardWrites(root)).toEqual([]);
  });

  it('does not flag a READ anchored to the repo — that is what a guard is for', () => {
    write(`const src = fs.readFileSync(path.join(ROOT, 'components', 'X.tsx'), 'utf8');`);
    expect(scanGuardWrites(root)).toEqual([]);
  });

  it('reads the whole first argument, not the text up to its own comma', () => {
    // `path.join(ROOT, 'components', …)` splits on a comma INSIDE the destination.
    // Truncating there drops the anchor and the violation reports clean — a false
    // negative that looks exactly like a pass.
    write(`fs.writeFileSync(path.join(ROOT, 'components', 'X.tsx'), 'x');`);
    const [v] = scanGuardWrites(root);
    expect(v.dest).toContain('ROOT');
  });

  it('honours an exemption marker within ten lines, and not one further up', () => {
    write(`// fixture-root-ok: disposable probe at the repo root, which no guard walks\nfs.mkdirSync(path.join(ROOT, '.probe'), { recursive: true });`);
    expect(scanGuardWrites(root)).toEqual([]);

    write(`// fixture-root-ok: too far above to govern this call\n${'\n'.repeat(12)}fs.mkdirSync(path.join(ROOT, '.probe'), { recursive: true });`);
    expect(scanGuardWrites(root)).toHaveLength(1);
  });

  it('is not satisfied by a COMMENT describing the anti-pattern', () => {
    // This file's own header contains the offending line as prose, and every compliant
    // guard carries a comment about temp roots. Matching raw source would flag the
    // first and let a future author launder the second.
    write(`// fs.writeFileSync(path.join(ROOT, 'components', 'X.tsx'), 'x');`);
    expect(scanGuardWrites(root)).toEqual([]);
  });
});
