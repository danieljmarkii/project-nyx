// Detector fixtures live OUTSIDE the tree the guards scan (CUL-712).
//
// WHY THIS FILE EXISTS. Three guards prove themselves by writing a deliberately
// non-compliant fixture and requiring their detector to go red on it (the CUL-613
// rule: a guard that has only ever been green has not been tested). All three used
// to write that fixture INSIDE the directory they scan — `components/` or `app/` —
// and remove it in `afterEach`. Jest runs suites in parallel workers, so one guard's
// fixture is live in another guard's scan window, and the guards fail each other two
// ways:
//
//   1. CRASH. The fixture is unlinked between the directory walk and the
//      `readFileSync`, so the foreign guard dies on ENOENT. Observed once for real
//      during CUL-654 — a full-suite run red at `readFileSync (geistRollout:170)`,
//      the identical re-run green.
//   2. SPURIOUS FLAG, the worse one. The fixture is alive during the scan, so a
//      deliberately non-compliant file is reported as a real violation — an
//      intermittent red on `main` naming a file that no longer exists by the time
//      anyone looks, pointing at a rule that was never broken. And an exemption
//      marker is no protection: markers are per-guard (`geist-ok:` means nothing to
//      the haptics scan), so a fixture deliberately exempted for its OWNER is fully
//      exposed to its neighbour.
//
// Why that matters more than an ordinary flake: CLAUDE.md § Git Workflow forbids
// "fixing" a red CI run by weakening the check. An intermittent red whose named file
// has vanished is precisely the pressure that gets a guard weakened or a suite
// dropped — so the guards' own noise floor is load-bearing for the guards' authority.
//
// WHY A HELPER RATHER THAN AN EXCLUSION. The obvious fix is one line per scanner
// ignoring `__*_guard_fixture__*`. That is a denylist the NEXT guard has to remember,
// which is the shape that produced this in the first place — every one of the three
// authors knew about `afterEach` and none of them knew about the neighbour. A shared
// temp-root helper is the positive affordance instead: the next guard reaches for the
// thing that already exists, and its fixture cannot land in a scanned tree even if
// nobody ever reads this comment. `guards/edgeFunctionDeploy.test.ts` is the in-repo
// precedent — it has never had this problem, because a scanner that can be pointed at
// a root never has to trust its own working tree.
//
// The corollary for a guard using this: the scanner has to TAKE that root. Thread it
// as a required parameter rather than a defaulted one — a default silently re-points
// a forgetful self-test back at the real tree, which is the failure this file exists
// to make impossible.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Every root this module has handed out.
 *
 * `removeFixtureRoot` is an `fs.rmSync(recursive)`, which is the most destructive call
 * in the test tree, and a containment predicate is a thin thing to hang it on: get
 * `isInsideRepo` wrong once — or hand the function a path it never produced — and it
 * deletes source. So provenance is checked as well as containment. The function will
 * only ever delete a directory it created itself, which makes "can a caller reach a
 * path it should not delete?" answerable as NO structurally, rather than as "no, so
 * long as one predicate holds". (Entries are never removed, so a second remove of the
 * same root stays a no-op via `force: true` rather than becoming an error.)
 */
const CREATED = new Set<string>();

/**
 * True if `abs` lies inside the repository working tree — i.e. somewhere a guard's
 * directory walk could reach it.
 *
 * Compares resolved absolute paths, and requires a separator after the prefix so a
 * sibling directory (`/home/user/project-nyx-scratch`) is not mistaken for a child.
 */
export function isInsideRepo(abs: string): boolean {
  const resolved = path.resolve(abs);
  return resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep);
}

/**
 * A private temp directory to write detector fixtures into, with `subdirs` created
 * inside it.
 *
 * Pass the scan directories the guard actually walks (`['components']`,
 * `['app', 'components']`) so a fixture keeps its real SHAPE — the self-test then
 * exercises the same walk → filter → read path as the live scan, rather than
 * side-stepping it by handing the scanner a single loose file.
 *
 * Throws if the resulting root is inside the repo. That check is the whole point:
 * it makes the collision structurally impossible rather than filtered, so it holds
 * for a future guard whose author never reads any of this. `realpathSync` first
 * because macOS resolves `os.tmpdir()` through a symlink (`/var` → `/private/var`),
 * and an unresolved path would make the containment test answer about the wrong path.
 *
 * `baseDir` is where the temp root is created; it defaults to the OS temp directory,
 * which is the only value any guard should pass. It is a parameter so this file's own
 * proof can drive the rejection branch with a REAL in-repo base rather than mocking
 * `os.tmpdir()` — the check that makes every other guard safe is not one to leave
 * green-by-inspection.
 */
export function createFixtureRoot(
  prefix: string,
  subdirs: string[] = [],
  baseDir: string = os.tmpdir(),
): string {
  const base = fs.realpathSync(baseDir);
  const root = fs.mkdtempSync(path.join(base, `nyx-guard-${prefix}-`));
  if (isInsideRepo(root)) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(
      `createFixtureRoot: refusing to hand back ${root} — it is inside the repository, ` +
        `where a parallel guard's directory walk would pick the fixture up (CUL-712). ` +
        `Create it somewhere outside ${REPO_ROOT}.`,
    );
  }
  for (const d of subdirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  CREATED.add(root);
  return root;
}

/** Write one fixture at `rel` under `root`, creating any missing directories. */
export function writeFixture(root: string, rel: string, src: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, src, 'utf8');
  return abs;
}

/**
 * Remove a fixture root. Safe to call twice.
 *
 * Two independent refusals, deliberately not one: the path must be outside the repo
 * AND must be one this module handed out. Containment alone is a single predicate in
 * front of a recursive delete; provenance is the structural half, and it holds even
 * if `isInsideRepo` is ever wrong.
 *
 * An empty string is the `let root = ''` sentinel a guard declares before its
 * `beforeEach` runs, so it means "never created" and is a no-op. Without that, a
 * `createFixtureRoot` failure in `beforeEach` would be followed by an `afterEach`
 * throw (`''` resolves to the cwd, which IS the repo) — a second, louder error
 * standing in front of the real one.
 */
export function removeFixtureRoot(root: string): void {
  if (root === '') return;
  if (isInsideRepo(root)) {
    throw new Error(`removeFixtureRoot: ${root} is inside the repository — refusing to delete it.`);
  }
  if (!CREATED.has(root)) {
    throw new Error(
      `removeFixtureRoot: ${root} was not handed out by createFixtureRoot — refusing to delete it. ` +
        `This function only ever removes a directory it created itself.`,
    );
  }
  fs.rmSync(root, { recursive: true, force: true });
}
