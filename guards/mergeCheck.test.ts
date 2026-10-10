// Proof by MUTATION for `scripts/steward/merge-check.sh` (CUL-1497).
//
// WHY A GUARD AT ALL. The script is what `/wrap and merge` trusts to say a branch is safe
// to land, and its most important answer is the one a session would never notice going
// wrong: "lost lines: none". A detector that has only ever said "none" has not been tested
// (C-18), so every verdict here is driven both ways against a repository shaped like the
// failure it exists for, and the regression case pins the careless resolution against the
// careful one over the same history. The dangerous direction is a false CLEAN, so every
// way the first draft could print CLEAN without having looked (run from a subdirectory, a
// shallow clone, a warning on stderr) is a case here, found by the isolated code review.
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
// MUTANTS, run against the real script 2026-10-03, every one killed:
//
//   ✗ lost lines never printed
//   ✗ the fork version read from the base instead of the fork point
//   ✗ the fork walk by date instead of first parent
//   ✗ a line that only moved counted as lost
//   ✗ a line seen at the fork counted as lost
//   ✗ FILENAME == ARGV[1] written as NR == FNR (a file main added, then deleted by the branch)
//   ✗ every hunk tagged "replaced"
//   ✗ lost lines never moving the verdict
//   ✗ the no-letter-or-digit filter dropped (a lone `}`)
//   ✗ a conflict exit read as clean
//   ✗ duplicate migration numbers not netted against the base
//   ✗ conflict markers not counted
//   ✗ no `cd` to the repository root (run from a subdirectory)
//   ✗ no fork point treated as a pass instead of exit 3
//   ✗ stderr read as merge-tree's data (GIT_TRACE=1)
//   ✗ core.quotePath left on (a non-ASCII file name)
//   ✗ `status` without --no-optional-locks (the index rewritten)
//   ✗ the landing simulated as a two-parent merge instead of a squash (a stacked PR)
//   ✗ "new conflicts" judged against main instead of the simulated landing
//   ✗ this branch's files taken from the base instead of the merge base
//   ✗ the `+` dropped from the other PRs' refspec (a force-pushed PR)
//   ✗ the branch listed as one of the other PRs
//   ✗ --all ignored
//
// MUTANTS added with CUL-1522 (resurrected lines, migration numbers shared with an open
// PR, a red main), run against the real script 2026-10-06, every one killed:
//
//   ✗ resurrected lines never moving the verdict
//   ✗ the at-the-fork test dropped (any line landing adds that main lacks counts)
//   ✗ the not-on-main test dropped (a line main still has, moved by the session, counts)
//   ✗ the no-letter-or-digit filter dropped from resurrected lines (a lone `}`)
//   ✗ a shared migration number never moving the verdict
//   ✗ the same file NAME counted as a clash (a PR stacked on this one)
//   ✗ this branch's migrations read off the base instead of the landing
//   ✗ the other PR's migrations not netted against the base (a stale PR carrying main's)
//   ✗ an unreadable main CI read as green
//   ✗ a page of only cancelled runs read as green
//   ✗ cancelled runs not stepped over (the newest run decides, whatever it says)
//   ✗ a red main never moving the verdict
//   ✗ the fix exception granted without this branch's own CI passing
//   ✗ the suspect files taken from the red commit alone instead of since the last green
//   ✗ the fix exception granted to a branch cut before main went red
//   ✗ a named PR that could not be read leaving the verdict CLEAN
//   ✗ migration numbers compared as text (3_ against 003_)
//   ✗ an empty base migration listing read as no duplicates
//
// MUTANTS added with CUL-1654 (the production line), run against the real script and
// its helper 2026-10-10, every one killed:
//
//   ✗ a production line never moving the verdict
//   ✗ .claude/hooks/ dropped from the gate paths
//   ✗ .claude/settings*.json dropped from the gate paths
//   ✗ a helper that failed read as "deploys nothing"
//   ✗ an import the walk could not resolve ignored
//   ✗ holds ignored (a held function's change read as deploying)
//   ✗ a released hold not read as deploying
//   ✗ a new function not read as deploying
//   ✗ an unreadable manifest read as holding nothing
//   ✗ a helper that failed with no message read as "deploys nothing" (the code review's
//     false CLEAN: a signal or an OOM kill says nothing on stderr)
//   ✗ main's last deploy run that failed, was manual, or was unread ignored (three mutants)
//   ✗ a deploy-run finding never moving the verdict
//   ✗ wrap.md dropped from the gate paths
//
// HOW MAIN'S CI IS FAKED. The script reads it with `gh api`, and every case runs with a
// stub `gh` first on PATH (written under the fixture root) that serves a JSON file named
// by FAKE_GH_MAIN for main's runs and FAKE_GH_OWN for this branch's, and fails like a
// 404 when the variable is unset. The default is one green run, so the cases written
// before CUL-1522 read main as green. The stub never touches the network.
//
// STATED BLIND SPOTS are in the script's header; the ones this file adds: nothing here
// exercises a binary file, a rename, or a file name git still quotes (the script exits 3
// on one by inspection, not by test), nor a machine with no `gh` or `jq` on PATH (the
// script says so and returns REVIEW, by inspection).

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'steward', 'merge-check.sh');

jest.setTimeout(180_000);

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

let ghBin = '';
let greenMain = '';
let greenDeploy = '';

interface CiRun {
  id: number;
  conclusion: string;
  sha: string;
  status?: string;
  event?: string;
}

/** A page of ci.yml runs as the Actions API returns it, newest first; returns its path. */
function runsFile(name: string, runs: CiRun[]): string {
  const file = path.join(root, `${name}-${(seq += 1)}.json`);
  const workflow_runs = runs.map((r) => ({
    id: r.id,
    status: r.status ?? 'completed',
    conclusion: r.conclusion,
    head_sha: r.sha,
    event: r.event ?? 'push',
    html_url: `https://ci.example.invalid/runs/${r.id}`,
  }));
  fs.writeFileSync(file, JSON.stringify({ total_count: runs.length, workflow_runs }), 'utf8');
  return file;
}

function check(cwd: string, args: string[] = [], extra: Record<string, string> = {}): Run {
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      env: gitEnv({ PATH: `${ghBin}:${process.env.PATH ?? ''}`, FAKE_GH_MAIN: greenMain, FAKE_GH_DEPLOY: greenDeploy, ...extra }),
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

/** Bring main into a session branch; returns git merge's exit code. */
function mergeMain(dir: string): number {
  git(dir, ['fetch', '--quiet', 'origin', 'main']);
  return gitStatus(dir, ['merge', '--quiet', '--no-edit', 'origin/main']);
}

const sha = (file: string): string => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

beforeAll(() => {
  // Every case needs `merge-tree --write-tree`; say so once instead of nine bare exit 3s.
  const [major, minor] = (execFileSync('git', ['version'], { encoding: 'utf8' }).match(/(\d+)\.(\d+)/) ?? [])
    .slice(1)
    .map(Number);
  if (!(major > 2 || (major === 2 && minor >= 38))) {
    throw new Error(`merge-check needs git 2.38 or newer; this runner has ${major}.${minor}`);
  }
  root = createFixtureRoot('merge-check');
  ghBin = path.join(root, 'bin');
  fs.mkdirSync(ghBin, { recursive: true });
  fs.writeFileSync(
    path.join(ghBin, 'gh'),
    [
      '#!/usr/bin/env bash',
      '# A stand-in for `gh api`: main\'s runs or this branch\'s, from files the case names.',
      'for a in "$@"; do case "$a" in repos/*) endpoint=$a ;; esac; done',
      'case "${endpoint:-}" in',
      '  *edge-deploy.yml*) src=${FAKE_GH_DEPLOY:-} ;;',
      '  *head_sha=*) src=${FAKE_GH_OWN:-} ;;',
      '  *branch=*) src=${FAKE_GH_MAIN:-} ;;',
      '  *) src= ;;',
      'esac',
      'if [ -z "$src" ]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi',
      'cat "$src"',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 },
  );
  greenMain = runsFile('green', [{ id: 11, conclusion: 'success', sha: 'a'.repeat(40) }]);
  greenDeploy = runsFile('deploy-green', [{ id: 21, conclusion: 'success', sha: 'a'.repeat(40) }]);
});

afterAll(() => {
  removeFixtureRoot(root);
  root = '';
});

describe('scripts/steward/merge-check.sh', () => {
  it('a branch that adds a file and deletes a line it saw lands CLEAN while main moves elsewhere, and touches nothing', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'feature.txt': 'new\n' });
    write(s, 'list.txt', lines('alpha', 'bravo', 'charlie', 'echo')); // `delta` was there at the fork
    commitAll(s, 'a second commit');
    landOnMain(fx, { 'app.txt': lines('one', 'two', 'three', 'four') }, 'another PR lands');

    // A stale stat on a tracked file is what makes a plain `git status` rewrite the index.
    fs.utimesSync(path.join(s, 'app.txt'), new Date(2001, 0, 1), new Date(2001, 0, 1));
    const index = sha(path.join(s, '.git', 'index'));
    const headBefore = git(s, ['rev-parse', 'HEAD']);

    const r = check(s);
    expect(r.code).toBe(0);
    expect(r.out).toContain('(2 ahead, 1 behind)');
    expect(r.out).toContain('main: clean (lands 2 files)');
    // A deletion of a line the session saw at its fork point is its own edit, not a loss.
    expect(r.out).toContain('lost lines: none');
    expect(r.out).toContain('migration numbers: no new duplicates');
    expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');
    expect(sha(path.join(s, '.git', 'index'))).toBe(index);
    expect(git(s, ['rev-parse', 'HEAD'])).toBe(headBefore);
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
  // `bravo`; main inserted its own there and appended `foxtrot-m` and a lone `}` further
  // down. Taking the branch side of the file wholesale (`git checkout --ours`) is the
  // careless resolution: it reverts main's entry AND drops the append that never conflicted
  // at all. Keeping both entries is the careful one. The script must tell them apart, name
  // what the careless one dropped (outright deletions first), and say the same thing from
  // a subdirectory and with a warning on stderr: the three ways its first draft said CLEAN.
  it('a resolution that takes its own side wholesale is REVIEW and names each line it dropped; keeping both is CLEAN', () => {
    const fx = fixture();
    const branchSide = lines('alpha', 'bravo', 'bravo-b', 'charlie', 'delta', 'echo');
    const careless = session(fx, 'claude/careless', { 'list.txt': branchSide });
    const careful = session(fx, 'claude/careful', { 'list.txt': branchSide });
    landOnMain(
      fx,
      { 'list.txt': lines('alpha', 'bravo', 'bravo-m', 'charlie', 'delta', 'echo', 'foxtrot-m', '}') },
      'another PR lands',
    );

    expect(mergeMain(careless)).not.toBe(0);
    expect(mergeMain(careful)).not.toBe(0);
    git(careless, ['checkout', '--ours', '--', 'list.txt']);
    commitAll(careless, 'merge main, take ours');
    write(careful, 'list.txt', lines('alpha', 'bravo', 'bravo-b', 'bravo-m', 'charlie', 'delta', 'echo', 'foxtrot-m', '}'));
    commitAll(careful, 'merge main, keep both');

    const a = check(careless);
    expect(a.code).toBe(2);
    expect(a.out).toContain('main: clean (lands 1 files)');
    // Two, not three: the lone `}` carries no letter or digit (a stated blind spot).
    expect(a.out).toContain('lost lines: 2 in 1 file(s) (list.txt 2)');
    expect(a.out).toContain('1 deleted outright, 1 replaced in their hunk');
    expect(a.out).toMatch(/\n {2}deleted {3}list\.txt: foxtrot-m\n {2}replaced {2}list\.txt: bravo-m\n/);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const fromSubdir = check(path.join(careless, 'supabase'));
    expect(fromSubdir.code).toBe(2);
    expect(fromSubdir.out).toContain('lost lines: 2 in 1 file(s) (list.txt 2)');

    const traced = check(careless, [], { GIT_TRACE: '1' });
    expect(traced.code).toBe(2);
    expect(traced.out).toContain('lost lines: 2 in 1 file(s) (list.txt 2)');

    const b = check(careful);
    expect(b.code).toBe(0);
    expect(b.out).toContain('lost lines: none');
    expect(lastLine(b.out)).toBe('MERGE CHECK: CLEAN');
  });

  it('a resolution committed with its conflict markers in is REVIEW, though it loses nothing', () => {
    const fx = fixture();
    const s = session(fx, 'claude/markers', { 'list.txt': lines('alpha', 'bravo', 'charlie (branch)', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha', 'bravo', 'charlie (main)', 'delta', 'echo') }, 'another PR lands');
    expect(mergeMain(s)).not.toBe(0);
    commitAll(s, 'merge main, markers and all');

    const r = check(s);
    expect(r.code).toBe(2);
    expect(r.out).toContain('lost lines: none');
    expect(r.out).toContain('conflict markers: landing adds 2 line(s) opening or closing a conflict');
    expect(lastLine(r.out)).toBe('MERGE CHECK: REVIEW');
  });

  it("a line of main's that the session only MOVED within its file is kept, not lost", () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'list.txt': lines('alpha (b)', 'bravo', 'charlie', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo', 'golf-m') }, 'another PR lands');
    expect(mergeMain(s)).toBe(0);
    write(s, 'list.txt', lines('golf-m', 'alpha (b)', 'bravo', 'charlie', 'delta', 'echo'));
    commitAll(s, 'move golf-m to the top');

    const r = check(s);
    expect(r.out).toContain('lost lines: none');
    expect(r.code).toBe(0);
  });

  // A file main added after the fork, deleted by the branch: the fork side and the landed
  // side are both empty, which is exactly the input NR==FNR mistakes for its first set. The
  // non-ASCII name is the case core.quotePath would otherwise hide, and 25 lines is past
  // the default list of 20.
  it('a file main added and the branch deleted is lost line by line, named raw, and --all lists every line', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'feature.txt': 'new\n' });
    const added = Array.from({ length: 25 }, (_, i) => `entry ${i + 1}`);
    landOnMain(fx, { 'notes/café.txt': lines(...added) }, 'another PR adds a file');
    expect(mergeMain(s)).toBe(0);
    git(s, ['rm', '--quiet', 'notes/café.txt']);
    commitAll(s, 'drop it');

    const r = check(s);
    expect(r.code).toBe(2);
    expect(r.out).toContain('lost lines: 25 in 1 file(s) (notes/café.txt 25)');
    expect(r.out).toContain('25 deleted outright, 0 replaced in their hunk');
    expect(r.out).toContain('  deleted   notes/café.txt: entry 1\n');
    expect(r.out).toContain('(+5 more; --all lists them)');
    expect(r.out).not.toContain('entry 25\n');

    const all = check(s, ['--all']);
    expect(all.out).toContain('  deleted   notes/café.txt: entry 25\n');
    expect(all.out).not.toContain('more; --all lists them');
  });

  it('a new duplicate migration number is REVIEW; the duplicate main already carries is not', () => {
    const fx = fixture();
    const dup = session(fx, 'claude/dup', { 'supabase/migrations/003_branch.sql': 'create table d ();\n' });
    const ok = session(fx, 'claude/ok', { 'supabase/migrations/004_branch.sql': 'create table e ();\n' });
    landOnMain(fx, { 'supabase/migrations/003_main.sql': 'create table f ();\n' }, 'another PR lands');
    // Cut after 003_main landed, so it carries main's file: that is main's number, not its.
    session(fx, 'claude/later', { 'feature.txt': 'later\n' });

    const a = check(dup, ['claude/later']);
    expect(a.code).toBe(2);
    expect(a.out).toContain('migration numbers: landing adds a duplicate 003');
    expect(a.out).not.toMatch(/duplicate .*002/);
    expect(a.out).not.toContain('shared with another open PR');

    // Numbers compare as numbers: 3_ is slot 003, beside main's 003_main and o1's 003.
    const short = session(fx, 'claude/short', { 'supabase/migrations/3_short.sql': 'create table g ();\n' });
    const c = check(short, ['claude/dup']);
    expect(c.out).toContain('migration numbers: landing adds a duplicate 003');
    expect(c.out).toContain('migration 003: this branch adds 3_short.sql and claude/dup adds 003_branch.sql');
    expect(c.code).toBe(2);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const b = check(ok);
    expect(b.code).toBe(0);
    expect(b.out).toContain('migration numbers: no new duplicates');
  });

  it('reports shared files and the conflicts landing would cause, as a squash, and other PRs never move the verdict', () => {
    const fx = fixture();
    const o1 = session(fx, 'claude/o1', { 'list.txt': lines('alpha (o1)', 'bravo', 'charlie', 'delta', 'echo') });
    session(fx, 'claude/o2', { 'app.txt': lines('one', 'two', 'three (o2)') });
    session(fx, 'claude/o3', { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo (o3)') });
    // Cut before main moves, so the landing is simulated rather than read off a ref.
    const s = session(fx, 'claude/s', { 'list.txt': lines('alpha (s)', 'bravo', 'charlie', 'delta', 'echo') });
    // A PR stacked on this one, editing the same line again: harmless while the two share
    // commits, a conflict once this one is squashed onto main under a new id.
    const part2 = cloneOf(fx, 'part2');
    git(part2, ['checkout', '--quiet', 'claude/s']);
    git(part2, ['checkout', '--quiet', '-b', 'claude/part2']);
    write(part2, 'list.txt', lines('alpha (part2)', 'bravo', 'charlie', 'delta', 'echo'));
    commitAll(part2, 'part 2');
    git(part2, ['push', '--quiet', '-u', 'origin', 'claude/part2']);
    // Main also touches app.txt, a file only o2 edits: it must not read as shared with s.
    landOnMain(
      fx,
      { 'list.txt': lines('alpha', 'bravo', 'charlie', 'delta', 'echo (main)'), 'app.txt': lines('one (main)', 'two', 'three') },
      'another PR lands',
    );

    const others = ['claude/o1', 'claude/o2', 'origin/claude/o3', 'claude/part2', 'claude/s'];
    const r = check(s, others);
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
    expect(r.out).toContain(
      '  claude/part2: shares 1 file(s) (list.txt); conflicts with main now: none; new conflicts if you land: list.txt',
    );
    expect(r.out).not.toMatch(/ {2}claude\/s:/); // the branch itself is skipped
    expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');

    // A PR the session named and the check could not read is REVIEW: its migrations went
    // unchecked (the code review's false CLEAN).
    const gone = check(s, [...others, 'claude/gone']);
    expect(gone.out).toContain('  claude/gone: not found on origin');
    expect(gone.out).toContain('note: could not fetch claude/gone');
    expect(gone.out).toContain('other open PRs not read: claude/gone; their migration numbers went unchecked');
    expect(gone.code).toBe(2);

    // o1 is rewritten and force-pushed; the next run must see the new tip, not the old one.
    // `charlie` is two lines from `alpha (s)` and two from `echo (main)`: no conflict either way.
    write(o1, 'list.txt', lines('alpha', 'bravo', 'charlie (o1)', 'delta', 'echo'));
    git(o1, ['add', '-A']);
    git(o1, ['commit', '--quiet', '--amend', '-m', 'claude/o1 work, rewritten']);
    git(o1, ['push', '--quiet', '--force', 'origin', 'claude/o1']);
    const again = check(s, others);
    expect(again.out).not.toContain('could not fetch claude/o1');
    expect(again.out).toContain('  claude/o1: shares 1 file(s) (list.txt); conflicts with main now: none; new conflicts if you land: none');
  });

  it('after a merge, --head origin/main reports which open PRs now conflict with main', () => {
    const fx = fixture();
    session(fx, 'claude/o1', { 'list.txt': lines('alpha (o1)', 'bravo', 'charlie', 'delta', 'echo') });
    landOnMain(fx, { 'list.txt': lines('alpha (s)', 'bravo', 'charlie', 'delta', 'echo') }, 'the session PR, squash-merged');
    const any = cloneOf(fx, 'post-merge');

    const r = check(any, ['--head', 'origin/main', 'claude/o1']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('main: clean (lands 0 files)');
    expect(r.out).toContain('  claude/o1: conflicts with main now: list.txt\n');
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

  // A check that could not run is never a pass. A branch whose first-parent history never
  // reaches main's is what a clone too shallow to hold the fork looks like (the merge base
  // is still found through the merge of main); an orphan branch builds it deterministically.
  it('exits 3, never CLEAN, when it cannot find a merge base or a fork point', () => {
    const fx = fixture();
    const orphan = cloneOf(fx, 'orphan');
    git(orphan, ['checkout', '--quiet', '--orphan', 'claude/orphan']);
    git(orphan, ['rm', '-r', '--quiet', '-f', '.']);
    write(orphan, 'other.txt', 'unrelated\n');
    git(orphan, ['add', 'other.txt']);
    git(orphan, ['commit', '--quiet', '-m', 'an unrelated root']);

    const noBase = check(orphan, ['--no-fetch']);
    expect(noBase.code).toBe(3);
    expect(noBase.out).toContain('no merge base');

    git(orphan, ['merge', '--quiet', '--no-edit', '--allow-unrelated-histories', 'origin/main']);
    const noFork = check(orphan, ['--no-fetch']);
    expect(noFork.code).toBe(3);
    expect(noFork.out).toContain('no fork point');
    expect(noFork.out).not.toContain('MERGE CHECK: CLEAN');
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

    // A base with no migration listing would read as "no duplicates": refused instead.
    git(fx.mainClone, ['pull', '--quiet', '--ff-only', 'origin', 'main']);
    git(fx.mainClone, ['rm', '-r', '--quiet', 'supabase/migrations']);
    commitAll(fx.mainClone, 'no migrations');
    git(fx.mainClone, ['push', '--quiet', 'origin', 'main']);
    const d = check(s);
    expect(d.code).toBe(3);
    expect(d.out).toContain('no migrations listed under supabase/migrations/');
  });
  // RESURRECTED LINES (CUL-1522). Main deletes `delta` and a lone `}`; the branch rewrote
  // `charlie`, the line beside them, so the two conflict. Taking the branch's side
  // wholesale brings `delta` back, a line main deleted after this branch forked that no
  // clean merge would keep, and loses nothing, so the resurrection is the ONLY finding
  // (the `}` has no letter or digit and is not reported). The careful resolution keeps
  // main's deletions and moves `echo`, a line main still has, to the top.
  it('a resolution that brings back a line main deleted after the fork is REVIEW and names it; combining is CLEAN', () => {
    const fx = fixture();
    landOnMain(fx, { 'res.txt': lines('alpha', 'bravo', 'charlie', 'delta', '}', 'echo') }, 'a file to fork from');
    const branchSide = lines('alpha', 'bravo', 'charlie (b)', 'delta', '}', 'echo');
    const careless = session(fx, 'claude/careless', { 'res.txt': branchSide });
    const careful = session(fx, 'claude/careful', { 'res.txt': branchSide });
    landOnMain(fx, { 'res.txt': lines('alpha', 'bravo', 'charlie', 'echo') }, 'main deletes delta');

    expect(mergeMain(careless)).not.toBe(0);
    expect(mergeMain(careful)).not.toBe(0);
    git(careless, ['checkout', '--ours', '--', 'res.txt']);
    commitAll(careless, 'merge main, take ours');
    write(careful, 'res.txt', lines('echo', 'alpha', 'bravo', 'charlie (b)'));
    commitAll(careful, 'merge main, keep its deletions');

    const a = check(careless);
    expect(a.out).toContain('resurrected lines: 1 in 1 file(s) (res.txt 1), deleted on main after this branch forked');
    expect(a.out).toContain('\n  back      res.txt: delta\n');
    expect(a.out).toContain('lost lines: none');
    expect(a.out).not.toMatch(/back {6}res\.txt: \}/);
    expect(a.code).toBe(2);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const b = check(careful);
    expect(b.out).toContain('resurrected lines: none');
    expect(b.code).toBe(0);
    expect(lastLine(b.out)).toBe('MERGE CHECK: CLEAN');
  });

  // THE 10/5 PAIR, in miniature (CUL-1522): two open PRs each add the next migration, in
  // different files. Git sees nothing; the check names both. A PR stacked on this one
  // carries the SAME file and is no clash, another PR's different number is none either,
  // and a stale PR that still carries a migration main already has is not holding it.
  // Renumbering clears it.
  it('a migration number another open PR adds is REVIEW naming both; the same file, another number or main\'s own file is not', () => {
    const fx = fixture();
    session(fx, 'claude/o1', { 'supabase/migrations/003_o1.sql': 'create table o1 ();\n' });
    session(fx, 'claude/o2', { 'supabase/migrations/004_o2.sql': 'create table o2 ();\n' });
    session(fx, 'claude/stale', { 'supabase/migrations/005_main.sql': 'create table m ();\n' });
    const s = session(fx, 'claude/s', { 'supabase/migrations/003_s.sql': 'create table s ();\n' });
    const part2 = cloneOf(fx, 'part2');
    git(part2, ['checkout', '--quiet', 'claude/s']);
    git(part2, ['checkout', '--quiet', '-b', 'claude/part2']);
    write(part2, 'feature.txt', 'part 2\n');
    commitAll(part2, 'part 2');
    git(part2, ['push', '--quiet', '-u', 'origin', 'claude/part2']);
    landOnMain(fx, { 'supabase/migrations/005_main.sql': 'create table m ();\n' }, 'the stale PR\'s migration lands');

    const others = ['claude/o1', 'claude/o2', 'claude/stale', 'claude/part2'];
    const a = check(s, others);
    expect(a.out).toContain('migration numbers: no new duplicates');
    expect(a.out).toContain('migration numbers shared with another open PR:\n  migration 003: this branch adds 003_s.sql and claude/o1 adds 003_o1.sql\n');
    expect(a.out).not.toMatch(/migration 00[45]:/);
    expect(a.out).not.toContain('claude/part2 adds');
    expect(a.code).toBe(2);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    git(s, ['mv', 'supabase/migrations/003_s.sql', 'supabase/migrations/006_s.sql']);
    commitAll(s, 'renumber 003 -> 006');
    const b = check(s, others);
    expect(b.out).not.toContain('migration numbers shared with another open PR');
    expect(b.code).toBe(0);
    expect(lastLine(b.out)).toBe('MERGE CHECK: CLEAN');
  });

  // A RED MAIN (CUL-1522). Main went red when a PR changed app.txt, and one more PR
  // (more.txt) landed on top of the red. Its CI is read through `gh api`, newest run
  // first, with a cancelled run (main's concurrency cancels superseded pushes) on top.
  it('a red main is REVIEW naming the run and the files changed since it was green, unless this branch is the fix and its CI passed', () => {
    const fx = fixture();
    const unrelated = session(fx, 'claude/unrelated', { 'feature.txt': 'new\n' });
    const green = git(fx.mainClone, ['rev-parse', 'HEAD']).trim();
    landOnMain(fx, { 'app.txt': lines('one', 'two', 'three (broken)') }, 'the PR that turned main red');
    landOnMain(fx, { 'more.txt': 'more\n' }, 'one more PR lands on the red');
    const red = git(fx.mainClone, ['rev-parse', 'HEAD']).trim();
    // Cut from the red main, so the fix replaces a line it saw: nothing is lost.
    const fix = session(fx, 'claude/fix', { 'app.txt': lines('one', 'two', 'three (fixed)') });
    const fixHead = git(fix, ['rev-parse', 'HEAD']).trim();

    const redMain = runsFile('red', [
      { id: 23, conclusion: 'cancelled', sha: red },
      { id: 22, conclusion: 'failure', sha: red },
      { id: 21, conclusion: 'success', sha: green },
    ]);
    const ownGreen = runsFile('own-green', [{ id: 31, conclusion: 'success', sha: fixHead }]);
    const ownRed = runsFile('own-red', [{ id: 32, conclusion: 'failure', sha: fixHead }]);

    const a = check(unrelated, [], { FAKE_GH_MAIN: redMain });
    expect(a.out).toContain(`main's CI: RED (run https://ci.example.invalid/runs/22 on ${red.slice(0, 7)}, failure)`);
    expect(a.out).toContain('changed since main was last green: app.txt, more.txt');
    expect(a.code).toBe(2);
    expect(lastLine(a.out)).toBe('MERGE CHECK: REVIEW');

    const b = check(fix, [], { FAKE_GH_MAIN: redMain, FAKE_GH_OWN: ownGreen });
    expect(b.out).toContain('this branch touches app.txt and its own CI passed (run 31): treated as the fix');
    expect(b.code).toBe(0);
    expect(lastLine(b.out)).toBe('MERGE CHECK: CLEAN');

    const c = check(fix, [], { FAKE_GH_MAIN: redMain, FAKE_GH_OWN: ownRed });
    expect(c.out).toContain("main's CI: RED");
    expect(c.code).toBe(2);

    // Touches the file and its CI passed, but it was cut BEFORE main went red: its green
    // run never met the breakage, so it is not the fix (the code review's wrong grant).
    const stale = cloneOf(fx, 'stale-fix');
    git(stale, ['checkout', '--quiet', '-b', 'claude/stale-fix', green]);
    write(stale, 'app.txt', lines('one', 'two', 'three (stale)'));
    commitAll(stale, 'touch app.txt before main went red');
    const staleHead = git(stale, ['rev-parse', 'HEAD']).trim();
    const staleGreen = runsFile('stale-green', [{ id: 33, conclusion: 'success', sha: staleHead }]);
    const e = check(stale, ['--no-fetch'], { FAKE_GH_MAIN: redMain, FAKE_GH_OWN: staleGreen });
    expect(e.out).toContain("main's CI: RED");
    expect(e.out).not.toContain('treated as the fix');
    expect(e.code).not.toBe(0);

    // Cancelled on top of a green run is green: the cancelled run says nothing.
    const cancelledThenGreen = runsFile('cancelled-green', [
      { id: 42, conclusion: 'cancelled', sha: red },
      { id: 41, conclusion: 'success', sha: red },
    ]);
    const d = check(unrelated, [], { FAKE_GH_MAIN: cancelledThenGreen });
    expect(d.out).toContain(`main's CI: green (run 41 on ${red.slice(0, 7)})`);
    expect(d.code).toBe(0);
  });

  // Never read silence as green: a failed read, and a page with no run that passed or
  // failed, are both REVIEW.
  it('main\'s CI that cannot be read is REVIEW, never CLEAN', () => {
    const fx = fixture();
    const s = session(fx, 'claude/feature', { 'feature.txt': 'new\n' });

    const unread = check(s, [], { FAKE_GH_MAIN: '' });
    expect(unread.out).toContain("main's CI: could not read (gh: Not Found (HTTP 404)");
    expect(unread.code).toBe(2);
    expect(lastLine(unread.out)).toBe('MERGE CHECK: REVIEW');

    const onlyCancelled = runsFile('cancelled', [
      { id: 51, conclusion: 'cancelled', sha: 'b'.repeat(40) },
      { id: 50, conclusion: '', status: 'in_progress', sha: 'c'.repeat(40) },
    ]);
    const silent = check(s, [], { FAKE_GH_MAIN: onlyCancelled });
    expect(silent.out).toContain('silence is not green');
    expect(silent.code).toBe(2);
  });

  // CUL-1654: merging to main deploys every Edge Function whose shipping code changed, so
  // a landing that deploys, or that edits the gate's own files, is REVIEW and never
  // clears in writing. The fixture's functions import `lib/` the way the real ones do, so
  // the closure walk exercised is the deploy workflow's own.
  describe('production writes (CUL-1654)', () => {
    const FUNCTIONS: Record<string, string> = {
      'supabase/functions/fn-a/index.ts': "import { shared } from '../../../lib/shared.ts';\nexport const a = shared;\n",
      'supabase/functions/fn-held/index.ts': "export const held = 1;\n",
      'supabase/functions/deploy-manifest.json': JSON.stringify({ holds: { 'fn-held': { ref: 'CUL-1' } } }),
      'lib/shared.ts': 'export const shared = 1;\n',
      'lib/unused.ts': 'export const unused = 1;\n',
    };

    /** A fixture whose main already carries the functions above. */
    function withFunctions(): Fixture {
      const fx = fixture();
      landOnMain(fx, FUNCTIONS, 'functions');
      return fx;
    }

    it('a landing that changes no function and no gate file says so and stays CLEAN', () => {
      const fx = withFunctions();
      const s = session(fx, 'claude/feature', { 'lib/unused.ts': 'export const unused = 2;\n', 'feature.txt': 'x\n' });
      const r = check(s);
      expect(r.out).toContain('production: landing deploys no Edge Function and edits no gate file');
      expect(lastLine(r.out)).toBe('MERGE CHECK: CLEAN');
      expect(r.code).toBe(0);
    });

    it('a change inside a function\'s closure (a shared lib file) is REVIEW naming the function', () => {
      const fx = withFunctions();
      const s = session(fx, 'claude/feature', { 'lib/shared.ts': 'export const shared = 2;\n' });
      const r = check(s);
      expect(r.out).toContain("production: landing it is a production write; a self-merge waits for the PM's typed merge");
      expect(r.out).toContain('  deploys   fn-a (shipping code changed)\n');
      expect(r.out).toContain('never cleared in writing');
      expect(lastLine(r.out)).toBe('MERGE CHECK: REVIEW');
      expect(r.code).toBe(2);
    });

    it('a held function\'s change does not deploy; releasing the hold does', () => {
      const fx = withFunctions();
      const held = session(fx, 'claude/held', { 'supabase/functions/fn-held/index.ts': 'export const held = 2;\n' });
      const r = check(held);
      expect(r.out).toContain('production: landing deploys no Edge Function');
      expect(r.code).toBe(0);

      const release = session(fx, 'claude/release', { 'supabase/functions/deploy-manifest.json': JSON.stringify({ holds: {} }) });
      const q = check(release);
      expect(q.out).toContain('  deploys   fn-held (hold released)\n');
      expect(q.code).toBe(2);
    });

    it('a new function deploys on the merge that adds it', () => {
      const fx = withFunctions();
      const s = session(fx, 'claude/new', { 'supabase/functions/fn-new/index.ts': 'export const n = 1;\n' });
      const r = check(s);
      expect(r.out).toContain('  deploys   fn-new (new function)\n');
      expect(r.code).toBe(2);
    });

    it('an import the walk cannot resolve is treated as deploying, never as none', () => {
      const fx = withFunctions();
      const s = session(fx, 'claude/far', {
        'supabase/functions/fn-a/index.ts': "import { far } from '../../../types/far.ts';\nexport const a = far;\n",
        'types/far.ts': 'export const far = 1;\n',
      });
      const r = check(s);
      expect(r.out).toContain('  deploys   could not tell, treated as deploying: deploys: fn-a imports ../../../types/far.ts');
      expect(r.code).toBe(2);
    });

    it.each([
      ['.claude/hooks/productionGate.ts'],
      ['.claude/settings.json'],
      ['.claude/settings.local.json'],
      ['.github/workflows/edge-deploy.yml'],
      ['scripts/deploy-edge.sh'],
      ['scripts/edge-deploy/plan.ts'],
      ['scripts/steward/merge-check.sh'],
      ['scripts/steward/deploys.ts'],
      ['.claude/skills/steward/SKILL.md'],
      ['.claude/commands/dispatch.md'],
      ['.claude/commands/wrap.md'],
    ])('an edit to %s is REVIEW naming the file', (rel) => {
      const fx = fixture();
      const s = session(fx, 'claude/gate', { [rel]: 'changed\n' });
      const r = check(s);
      expect(r.out).toContain(`  edits     ${rel}\n`);
      expect(lastLine(r.out)).toBe('MERGE CHECK: REVIEW');
      expect(r.code).toBe(2);
    });

    it.each([['.claude/skills/other/SKILL.md'], ['.claude/commands/kickoff.md'], ['.github/workflows/ci.yml'], ['scripts/steward/migration-numbers.sh']])(
      'an edit to %s is not a gate file',
      (rel) => {
        const fx = fixture();
        const s = session(fx, 'claude/not-gate', { [rel]: 'changed\n' });
        const r = check(s);
        expect(r.out).toContain('production: landing deploys no Edge Function and edits no gate file');
        expect(r.code).toBe(0);
      },
    );

    // The review's false CLEAN: a helper killed by a signal prints nothing on stderr, and
    // silence must never read as "deploys nothing".
    it('a helper that fails without a word is treated as deploying', () => {
      const fx = withFunctions();
      const s = session(fx, 'claude/feature', { 'feature.txt': 'x\n' });
      const bin = path.join(root, `silent-node-${(seq += 1)}`);
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, 'node'), '#!/usr/bin/env bash\nexit 137\n', { encoding: 'utf8', mode: 0o755 });
      const r = check(s, [], { PATH: `${bin}:${ghBin}:${process.env.PATH ?? ''}` });
      expect(r.out).toContain('  deploys   could not tell, treated as deploying: the helper exited 137 with no message');
      expect(r.code).toBe(2);
    });

    // The workflow deploys what main changed since its last RECORDED deploy, so a failed
    // or manual run leaves functions a docs-only merge would still deploy.
    it('main\'s last deploy run that failed, was manual, or cannot be read is REVIEW on any landing', () => {
      const fx = fixture();
      const s = session(fx, 'claude/docs', { 'feature.txt': 'x\n' });

      const failed = runsFile('deploy-red', [
        { id: 62, conclusion: 'cancelled', sha: 'b'.repeat(40) },
        { id: 61, conclusion: 'failure', sha: 'b'.repeat(40) },
      ]);
      const f = check(s, [], { FAKE_GH_DEPLOY: failed });
      expect(f.out).toContain("  deploys   main's last deploy run did not pass (https://ci.example.invalid/runs/61, failure)");
      expect(f.code).toBe(2);

      const manual = runsFile('deploy-manual', [{ id: 71, conclusion: 'success', sha: 'b'.repeat(40), event: 'workflow_dispatch' }]);
      const m = check(s, [], { FAKE_GH_DEPLOY: manual });
      expect(m.out).toContain("  deploys   main's last deploy run was a manual one (https://ci.example.invalid/runs/71)");
      expect(m.code).toBe(2);

      const unread = check(s, [], { FAKE_GH_DEPLOY: '' });
      expect(unread.out).toContain("  deploys   main's last deploy run could not be read (gh: Not Found (HTTP 404)");
      expect(unread.code).toBe(2);

      const pushed = check(s);
      expect(pushed.out).toContain('production: landing deploys no Edge Function and edits no gate file');
      expect(pushed.code).toBe(0);
    });

    it('after the merge (--head origin/main) there is nothing left to land, so no production line', () => {
      const fx = withFunctions();
      const r = check(fx.mainClone, ['--head', 'origin/main']);
      expect(r.out).not.toContain('production:');
      expect(r.code).toBe(0);
    });
  });
});
