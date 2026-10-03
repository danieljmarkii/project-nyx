// Proof by MUTATION for `scripts/steward/merge-check.sh` (CUL-1497).
//
// WHY A GUARD AT ALL. The script is what `/wrap and merge` trusts to say a branch is safe
// to land, and its most important answer is the one a session would never notice going
// wrong: "lost lines: none". A detector that has only ever said "none" has not been tested
// (C-18), so every verdict here is driven both ways against a repository shaped like the
// failure it exists for, and the regression case pins the careless resolution against the
// careful one over the same history.
//
// WHY EVERY CASE RUNS AGAINST A FIXTURE REPO AND NEVER THIS ONE. The real `origin/main`
// moves under every PR and CI checks out shallow, so nothing about this repository's
// branches is assertable. Each case builds a real bare `origin` and real clones under a
// fixture root outside the tree (CUL-712), so the fetch, the merge and the walk exercised
// are the ones a session runs.
//
// Commit dates come from a fake clock that only moves forward: the fork-point walk must
// step over a merge of main by PARENT order, and a mutant that walks by DATE is only
// killed reliably when the dates say which commit came last.
//
// MUTANTS, run against the real script 2026-10-03, every one killed (failing tests in
// brackets):
//
//   ✗ lost lines never printed [the regression]
//   ✗ the fork version read from the base instead of the fork point [the regression]
//   ✗ a conflict exit read as clean [the conflict case]
//   ✗ duplicate migration numbers not netted against the base [7, every case on the tree]
//   ✗ "new conflicts" judged against main instead of the simulated landing [other PRs]
//   ✗ the fork walk by date instead of first parent [the regression]
//   ✗ a line that only moved counted as lost [the moved line]
//   ✗ a line seen at the fork counted as lost [3: the clean case, the moved line, other PRs]
//   ✗ every hunk tagged "replaced" [the regression]
//   ✗ lost lines never moving the verdict [the regression]
//   ✗ the branch listed as one of the other PRs [other PRs]
//
// STATED BLIND SPOTS are in the script's header; the ones this file adds: the fixtures
// are text files, so nothing here exercises a binary file, a rename, or a shallow clone
// (the script refuses a missing merge base with exit 3, which is the case asserted
// nearest to it).

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'steward', 'merge-check.sh');

jest.setTimeout(120_000);

let clock = 1_790_000_000;

/**
 * Deterministic identity and dates, no user config, and no REPOSITORY leaking in: git
 * exports GIT_DIR to every hook it runs, so under the pre-push hook a fixture command would
 * act on the host repository (measured on the groom guard, 2026-10-02). Every inherited
 * GIT_* variable is dropped.
 */
function gitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const inherited: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (key.startsWith('GIT_')) delete inherited[key];
  }
  clock += 60;
  return {
    ...inherited,
    GIT_AUTHOR_NAME: 'merge-check guard',
    GIT_AUTHOR_EMAIL: 'guard@example.invalid',
    GIT_COMMITTER_NAME: 'merge-check guard',
    GIT_COMMITTER_EMAIL: 'guard@example.invalid',
    GIT_AUTHOR_DATE: `${clock} +0000`,
    GIT_COMMITTER_DATE: `${clock} +0000`,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...extra,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(), stdio: 'pipe' });
}

/** Run a git command that may fail (a merge that conflicts), returning its exit code. */
function gitStatus(cwd: string, args: string[]): number {
  try {
    git(cwd, args);
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

interface Run {
  code: number;
  out: string;
}

function check(cwd: string, args: string[] = [], extra: Record<string, string> = {}): Run {
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      env: gitEnv(extra),
      stdio: 'pipe',
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const lastLine = (out: string): string => out.trimEnd().split('\n').pop() ?? '';

const LIST = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
const lines = (...xs: string[]): string => `${xs.join('\n')}\n`;

const BASE_FILES: Record<string, string> = {
  'list.txt': lines(...LIST),
  'app.txt': lines('one', 'two', 'three'),
  'supabase/migrations/001_init.sql': 'create table a ();\n',
  // A duplicate number main already carries, as the real tree carries 018.
  'supabase/migrations/002_first.sql': 'create table b ();\n',
  'supabase/migrations/002_second.sql': 'create table c ();\n',
};

let root = '';
let seq = 0;

function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
}

function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', message]);
}

interface Fixture {
  url: string;
  /** A clone on `main` that plays every other session landing its PR. */
  mainClone: string;
}

/** A bare origin whose `main` holds BASE_FILES. */
function fixture(): Fixture {
  seq += 1;
  const bare = path.join(root, `origin-${seq}.git`);
  git(root, ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
  const mainClone = path.join(root, `main-${seq}`);
  fs.mkdirSync(mainClone, { recursive: true });
  git(mainClone, ['init', '--quiet', '--initial-branch=main']);
  for (const [rel, body] of Object.entries(BASE_FILES)) write(mainClone, rel, body);
  commitAll(mainClone, 'base');
  git(mainClone, ['remote', 'add', 'origin', bare]);
  git(mainClone, ['push', '--quiet', '-u', 'origin', 'main']);
  return { url: `file://${bare}`, mainClone };
}

function cloneOf(fx: Fixture, name: string): string {
  const dir = path.join(root, `${name}-${seq}`);
  git(root, ['clone', '--quiet', fx.url, dir]);
  return dir;
}

/** Another session's PR lands on main. */
function landOnMain(fx: Fixture, files: Record<string, string>, message: string): void {
  git(fx.mainClone, ['pull', '--quiet', '--ff-only', 'origin', 'main']);
  for (const [rel, body] of Object.entries(files)) write(fx.mainClone, rel, body);
  commitAll(fx.mainClone, message);
  git(fx.mainClone, ['push', '--quiet', 'origin', 'main']);
}

/** A session: a clone on its own branch, one commit, pushed. */
function session(fx: Fixture, branch: string, files: Record<string, string>): string {
  const dir = cloneOf(fx, branch.replace(/\W+/g, '-'));
  git(dir, ['checkout', '--quiet', '-b', branch]);
  for (const [rel, body] of Object.entries(files)) write(dir, rel, body);
  commitAll(dir, `${branch} work`);
  git(dir, ['push', '--quiet', '-u', 'origin', branch]);
  return dir;
}

beforeAll(() => {
  root = createFixtureRoot('merge-check');
});

afterAll(() => {
  removeFixtureRoot(root);
  root = '';
});

describe('scripts/steward/merge-check.sh', () => {
  it('a branch that adds a file and deletes a line it saw lands CLEAN while main moves elsewhere', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', {
      'feature.txt': 'new\n',
      'list.txt': lines('alpha', 'bravo', 'charlie', 'echo'), // `delta` was there at the fork
    });
    landOnMain(fx, { 'app.txt': lines('one', 'two', 'three', 'four') }, 'another PR lands');

    const r = check(s);
    expect(r.code).toBe(0);
    expect(r.out).toContain('(1 ahead, 1 behind)');
    expect(r.out).toContain('main: clean (lands 2 files)');
    // A deletion of a line the session saw at its fork point is its own edit, not a loss.
    expect(r.out).toContain('lost lines: none');
    expect(r.out).toContain('migration numbers: no new duplicates');
    expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');
  });

  it('both sides editing one line is a CONFLICT that names the file, exit 1', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'list.txt': lines('alpha', 'bravo', 'charlie (branch)', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha', 'bravo', 'charlie (main)', 'delta', 'echo') }, 'another PR lands');

    const r = check(s);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/main: CONFLICT in 1 files\n {2}list\.txt\n/);
    expect(r.out).toContain('lost lines: skipped until the conflict is resolved');
    expect(lastLine(r.out)).toBe('MERGE CHECK: CONFLICT');
  });

  // THE REGRESSION. One history, two resolutions. Both sessions inserted an entry after
  // `bravo`; main inserted its own there and appended `foxtrot-m` further down. Taking the
  // branch side of the file wholesale (`git checkout --ours`) is the careless resolution:
  // it reverts main's entry AND drops the append that never conflicted at all. Keeping both
  // entries is the careful one. The script must tell them apart, and must name what the
  // careless one dropped, outright deletions first.
  it('a resolution that takes its own side wholesale is REVIEW and names each line it dropped; keeping both is CLEAN', () => {
    const fx = fixture();
    const careless = session(fx, 'claude/careless', { 'list.txt': lines('alpha', 'bravo', 'bravo-b', 'charlie', 'delta', 'echo') });
    const careful = session(fx, 'claude/careful', { 'list.txt': lines('alpha', 'bravo', 'bravo-b', 'charlie', 'delta', 'echo') });
    landOnMain(
      fx,
      { 'list.txt': lines('alpha', 'bravo', 'bravo-m', 'charlie', 'delta', 'echo', 'foxtrot-m') },
      'another PR lands',
    );

    for (const dir of [careless, careful]) {
      git(dir, ['fetch', '--quiet', 'origin', 'main']);
      expect(gitStatus(dir, ['merge', '--quiet', '--no-edit', 'origin/main'])).not.toBe(0);
    }
    git(careless, ['checkout', '--ours', '--', 'list.txt']);
    commitAll(careless, 'merge main, take ours');
    write(careful, 'list.txt', lines('alpha', 'bravo', 'bravo-b', 'bravo-m', 'charlie', 'delta', 'echo', 'foxtrot-m'));
    commitAll(careful, 'merge main, keep both');

    const a = check(careless);
    expect(a.code).toBe(2);
    expect(a.out).toContain('main: clean (lands 1 files)');
    expect(a.out).toContain('lost lines: 2 in 1 file(s) (list.txt 2)');
    expect(a.out).toContain('1 deleted outright, 1 replaced in their hunk');
    // The outright deletion is listed first: nothing stands in its place.
    expect(a.out).toMatch(/\n {2}deleted {3}list\.txt: foxtrot-m\n {2}replaced {2}list\.txt: bravo-m\n/);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const b = check(careful);
    expect(b.code).toBe(0);
    expect(b.out).toContain('lost lines: none');
    expect(lastLine(b.out)).toBe('MERGE CHECK: CLEAN');
  });

  it("a line of main's that the session only MOVED within its file is kept, not lost", () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'list.txt': lines('alpha (b)', 'bravo', 'charlie', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo', 'golf-m') }, 'another PR lands');
    git(s, ['fetch', '--quiet', 'origin', 'main']);
    expect(gitStatus(s, ['merge', '--quiet', '--no-edit', 'origin/main'])).toBe(0);
    write(s, 'list.txt', lines('golf-m', 'alpha (b)', 'bravo', 'charlie', 'delta', 'echo'));
    commitAll(s, 'move golf-m to the top');

    const r = check(s);
    expect(r.out).toContain('lost lines: none');
    expect(r.code).toBe(0);
  });

  it('a new duplicate migration number is REVIEW; the duplicate main already carries is not', () => {
    const fx = fixture();
    const dup = session(fx, 'claude/dup', { 'supabase/migrations/003_branch.sql': 'create table d ();\n' });
    const ok = session(fx, 'claude/ok', { 'supabase/migrations/004_branch.sql': 'create table e ();\n' });
    landOnMain(fx, { 'supabase/migrations/003_main.sql': 'create table f ();\n' }, 'another PR lands');

    const a = check(dup);
    expect(a.code).toBe(2);
    expect(a.out).toContain('migration numbers: landing adds a duplicate 003');
    expect(a.out).not.toMatch(/duplicate .*002/);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const b = check(ok);
    expect(b.code).toBe(0);
    expect(b.out).toContain('migration numbers: no new duplicates');
  });

  it('reports shared files and the conflicts landing would cause, and other PRs never move the verdict', () => {
    const fx = fixture();
    session(fx, 'claude/o1', { 'list.txt': lines('alpha (o1)', 'bravo', 'charlie', 'delta', 'echo') });
    session(fx, 'claude/o2', { 'app.txt': lines('one', 'two (o2)', 'three') });
    session(fx, 'claude/o3', { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo (o3)') });
    // Cut before main moves, so the landing is simulated rather than read off a ref.
    const s = session(fx, 'claude/s', { 'list.txt': lines('alpha (s)', 'bravo', 'charlie', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo (main)') }, 'another PR lands');

    const r = check(s, ['claude/o1', 'claude/o2', 'origin/claude/o3', 'claude/gone', 'claude/s']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('(1 ahead, 1 behind)');
    expect(r.out).toContain(
      '  claude/o1: shares 1 file(s) (list.txt); conflicts with main now: none; new conflicts if you land: list.txt',
    );
    expect(r.out).toContain('  claude/o2: shares nothing; conflicts with main now: none; new conflicts if you land: none');
    // o3 already conflicts with main on its own; landing this branch adds nothing to that.
    expect(r.out).toContain(
      '  claude/o3: shares 1 file(s) (list.txt); conflicts with main now: list.txt; new conflicts if you land: none',
    );
    expect(r.out).toContain('  claude/gone: not found on origin');
    expect(r.out).not.toMatch(/ {2}claude\/s:/); // the branch itself is skipped
    expect(r.out).toContain('note: could not fetch claude/gone');
    expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');
  });

  it('after a merge, --head origin/main reports which open PRs now conflict with main', () => {
    const fx = fixture();
    session(fx, 'claude/o1', { 'list.txt': lines('alpha (o1)', 'bravo', 'charlie', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha (s)', 'bravo', 'charlie', 'delta', 'echo') }, 'the session PR, squash-merged');
    const any = cloneOf(fx, 'post-merge');

    const r = check(any, ['--head', 'origin/main', 'claude/o1']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('main: clean (lands 0 files)');
    expect(r.out).toContain('  claude/o1: shares nothing; conflicts with main now: list.txt');
    expect(r.out).not.toContain('new conflicts if you land');
    expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');
  });

  it('says so when uncommitted work is not part of the check', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'feature.txt': 'new\n' });
    write(s, 'scratch.txt', 'not committed\n');

    const r = check(s);
    expect(r.out).toContain('note: uncommitted changes are not checked');
    expect(r.code).toBe(0);
  });

  it('exits 3 outside a repository, on an unknown option, and on a ref that does not exist', () => {
    const outside = path.join(root, 'not-a-repo');
    fs.mkdirSync(outside, { recursive: true });
    const a = check(outside, [], { GIT_CEILING_DIRECTORIES: root });
    expect(a.code).toBe(3);
    expect(a.out).toContain('not inside a git work tree');

    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'feature.txt': 'new\n' });
    const b = check(s, ['--bogus']);
    expect(b.code).toBe(3);
    expect(b.out).toContain('unknown option --bogus');

    const c = check(s, ['--no-fetch', '--base', 'origin/nope']);
    expect(c.code).toBe(3);
    expect(c.out).toContain('no such ref: origin/nope');
  });
});
