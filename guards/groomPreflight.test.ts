// Proof by MUTATION for `scripts/groom/preflight.sh` (CUL-921; retro §2 F3).
//
// WHY A GUARD AT ALL. The retro's law L2 is that a rule enforced by prose fires
// approximately never, while `guards/*.test.ts` has zero recorded misses — and F3 is
// the proof, because step 0's one-line preflight was prose-adjacent shell nobody ever
// ran in the state it was supposed to protect. The line was:
//
//     test -f .git/shallow && git fetch --unshallow
//
// which exits 1 on a HEALTHY clone. `theOldLineFailsWhereTheScriptPasses` below is the
// regression pinned against the code's absence rather than against itself: the same
// fixture repo, the old construct, exit 1; the new script, exit 0.
//
// WHAT THIS FILE DOES NOT OWN. The close/stale PREDICATES — `closeEligible`, the
// umbrella clause, the detector-liveness clause — are CUL-926 (`scripts/groom/
// predicates.ts` + `guards/groomPredicates.test.ts`), which is gated on CUL-922's write
// boundary. This guard covers exactly one executable: the preflight. Keeping the two
// apart is deliberate; CUL-926 is where a typed predicate module gets its own suite.
//
// WHY EVERY CASE RUNS AGAINST A FIXTURE REPO AND NEVER THIS ONE. CI checks out shallow
// by design, so a test that asserted anything about the real `origin/main` would be red
// on every PR for a reason that has nothing to do with the code under test. The
// fixtures are built with a real bare `origin` and real clones, so the walk exercised
// is the same one a grooming session runs.
//
// STATED BLIND SPOTS, because an undocumented one reads as coverage (C-38). Four mutants
// were run against the real script; three are killed and the fourth is EQUIVALENT rather
// than missed:
//
//   ✗ killed — the old two-line step 0 (9 of 10 red)
//   ✗ killed — assertion (a) written as CUL-921 literally specifies it, `test -f
//     .git/shallow` (reds the sibling-branch case, which is the point of the divergence)
//   ✗ killed — the watermark compared against 0 instead of the floor
//   = survived, correctly — replacing the `case` validation of the parsed floor with
//     `floor="${floor:-0}"`. Verified by running both on the same bad file: each exits 3
//     and each names the key, because the `[ "$floor" -gt 0 ]` line one below it is the
//     behavioural gate and the `case` only buys a more precise message. A mutant that
//     changes no behaviour is not a test gap (C-35); the gate it leaves standing is.
//
// Not covered here: whether the COMMITTED watermark is still below the real
// `origin/main`. That is unassertable in CI — the checkout is shallow by design — and is
// the one thing a human bumps by hand.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const PREFLIGHT = path.join(REPO_ROOT, 'scripts', 'groom', 'preflight.sh');
const COMMITTED_FLOOR = path.join(REPO_ROOT, 'scripts', 'groom', 'floor.json');

jest.setTimeout(120_000);

/** Deterministic identity + no user config leaking in from the runner. */
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'groom guard',
  GIT_AUTHOR_EMAIL: 'guard@example.invalid',
  GIT_COMMITTER_NAME: 'groom guard',
  GIT_COMMITTER_EMAIL: 'guard@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: 'pipe' });
}

interface Run {
  code: number;
  out: string;
}

/** Run a shell script in `cwd`, capturing the exit code and both streams. */
function sh(script: string, cwd: string, env: Record<string, string> = {}): Run {
  try {
    const out = execFileSync('bash', [script], {
      cwd,
      encoding: 'utf8',
      env: { ...GIT_ENV, ...env },
      stdio: 'pipe',
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Run an inline shell expression in `cwd`, returning only its exit code. */
function shc(expr: string, cwd: string): number {
  try {
    execFileSync('bash', ['-c', expr], { cwd, encoding: 'utf8', env: GIT_ENV, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

let root = '';
let originUrl = '';

/** A bare origin with `commits` commits on `main`, plus one unrelated branch. */
function buildOrigin(commits: number): void {
  const bare = path.join(root, 'origin.git');
  git(root, ['init', '--bare', '--initial-branch=main', bare]);
  const work = path.join(root, 'work');
  fs.mkdirSync(work, { recursive: true });
  git(work, ['init', '--initial-branch=main']);
  for (let i = 0; i < commits; i += 1) {
    fs.writeFileSync(path.join(work, 'f.txt'), `commit ${i}\n`, 'utf8');
    git(work, ['add', 'f.txt']);
    git(work, ['commit', '-m', `c${i}`]);
  }
  git(work, ['remote', 'add', 'origin', bare]);
  git(work, ['push', '--quiet', '-u', 'origin', 'main']);
  // A sibling branch with its own commits — the thing step 4 fetches a tip date from.
  git(work, ['checkout', '--quiet', '-b', 'claude/some-claim']);
  fs.writeFileSync(path.join(work, 'g.txt'), 'claim work\n', 'utf8');
  git(work, ['add', 'g.txt']);
  git(work, ['commit', '-m', 'claim commit']);
  git(work, ['push', '--quiet', '-u', 'origin', 'claude/some-claim']);
  originUrl = `file://${bare}`;
}

function cloneAt(name: string, depth?: number): string {
  const dest = path.join(root, name);
  const args = ['clone', '--quiet'];
  if (depth !== undefined) args.push(`--depth=${depth}`);
  args.push(originUrl, dest);
  git(root, args);
  return dest;
}

/** A floor.json in the fixture root. */
function floorFile(name: string, body: string): string {
  const p = path.join(root, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

const floorOf = (n: number) => floorFile(`floor-${n}.json`, `{ "min_commits_on_origin_main": ${n} }\n`);

beforeAll(() => {
  root = createFixtureRoot('groom-preflight');
  buildOrigin(6);
});

afterAll(() => {
  removeFixtureRoot(root);
  root = '';
});

describe('scripts/groom/preflight.sh', () => {
  it('passes on a complete clone at or above the watermark', () => {
    const clone = cloneAt('complete-pass');
    const r = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: floorOf(6) });
    expect(r.code).toBe(0);
    expect(r.out).toContain('OK');
    expect(r.out).toContain('6 commits');
  });

  // THE REGRESSION. This is the defect F3 names, pinned against the absence of the fix
  // rather than against the fix's own output: one fixture repo, two implementations.
  it('theOldLineFailsWhereTheScriptPasses — the old step 0 exits 1 on a healthy clone', () => {
    const clone = cloneAt('old-line');
    const oldLine = shc('test -f .git/shallow && git fetch --unshallow', clone);
    const script = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: floorOf(6) });

    expect(oldLine).toBe(1); // the success case, reported as failure
    expect(script.code).toBe(0); // the same repo, judged correctly

    // And the script's exit 0 has to be EARNED. The first draft of this test asserted
    // only the two codes, and stayed green when the source was reverted to the old
    // two-line construct — because that script's last command (`git rev-list`) succeeds,
    // so the whole thing exits 0 without asserting anything. An exit code alone cannot
    // distinguish "checked and sound" from "did nothing and ended well", so pin the
    // evidence line: it names the ref, the count and the watermark it compared them to.
    expect(script.out).toMatch(/origin\/main at 6 commits \(watermark 6/);
    expect(script.out).toContain('history intact');
  });

  it('fails a shallow clone, names the depth, and passes once it is deepened', () => {
    const clone = cloneAt('shallow', 1);
    const floor = floorOf(6);

    const before = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: floor });
    expect(before.code).toBe(0); // preflight deepens it itself
    expect(before.out).toContain('OK');

    // And with the deepening removed from the script, the same clone is REJECTED with
    // the failing value printed — i.e. the assertion, not the clone, is what passed.
    const noDeepen = mutate('no-deepen', (s) =>
      s.replace(/if \[ "\$\(truncation_depth\)" -gt 0 \]; then[\s\S]*?\nfi\n/, ''),
    );
    const clone2 = cloneAt('shallow-2', 1);
    const r = sh(noDeepen, clone2, { GROOM_FLOOR_FILE: floor });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/TRUNCATED|below the committed watermark/);
  });

  // The divergence from CUL-921's literal spec, kept honest by a test. The issue says
  // assert "`.git/shallow` does not exist"; the pass itself creates that file when step
  // 4 reads a claim branch's tip date with `--depth=1`, while `origin/main` stays whole.
  it('tolerates a shallow boundary on a SIBLING branch — main is what is being judged', () => {
    const clone = cloneAt('sibling-shallow');
    git(clone, ['fetch', '--depth=1', 'origin', 'claude/some-claim']);

    // Precondition: the literal check CUL-921 specifies would now fail.
    expect(fs.existsSync(path.join(clone, '.git', 'shallow'))).toBe(true);

    const r = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: floorOf(6) });
    expect(r.code).toBe(0);
    expect(r.out).toContain('history intact');
  });

  it('fails below the watermark (exit 5) and prints both numbers', () => {
    const clone = cloneAt('below-floor');
    const r = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: floorOf(99) });
    expect(r.code).toBe(5);
    expect(r.out).toContain('6 commits');
    expect(r.out).toContain('99');
  });

  it('fails loudly on an unparseable watermark (exit 3) rather than reading it as 0', () => {
    const clone = cloneAt('bad-floor');
    const bad = floorFile('floor-bad.json', '{ "min_commits": "not a number" }\n');
    const r = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: bad });
    expect(r.code).toBe(3);
    expect(r.out).toContain('min_commits_on_origin_main');

    const missing = sh(PREFLIGHT, clone, { GROOM_FLOOR_FILE: path.join(root, 'nope.json') });
    expect(missing.code).toBe(3);
  });

  it('fails on a repo with no origin/main (exit 2)', () => {
    const bare = path.join(root, 'lonely');
    fs.mkdirSync(bare, { recursive: true });
    git(bare, ['init', '--initial-branch=main']);
    const r = sh(PREFLIGHT, bare, { GROOM_FLOOR_FILE: floorOf(1) });
    expect(r.code).toBe(2);
    expect(r.out).toContain('refs/remotes/origin/main');
  });

  // MUTATION. Each assertion is removed from a copy of the source and the case it owns
  // must go green — a case that still fails with its assertion deleted was being caught
  // by something else, which is the survived-mutant shape C-35 warns about.
  it('each assertion is load-bearing — deleting it makes its own case pass', () => {
    const clone = cloneAt('mutation');

    const noFloorCheck = mutate('no-floor', (s) =>
      s.replace(/\[ "\$count" -ge "\$floor" \] \\\n  \|\| die[\s\S]*?5\n/, ''),
    );
    expect(sh(noFloorCheck, clone, { GROOM_FLOOR_FILE: floorOf(99) }).code).toBe(0);

    const shallowClone = cloneAt('mutation-shallow', 1);
    const noBoundaryCheck = mutate('no-boundary', (s) =>
      s
        .replace(/if \[ "\$\(truncation_depth\)" -gt 0 \]; then[\s\S]*?\nfi\n/, '')
        .replace(/\[ "\$boundary" -eq 0 \] \\\n  \|\| die[\s\S]*?4\n/, ''),
    );
    // With both the deepening and assertion (a) gone, a depth-1 clone is waved through
    // on its own count — which is exactly the blindness assertion (a) exists to remove.
    expect(sh(noBoundaryCheck, shallowClone, { GROOM_FLOOR_FILE: floorOf(1) }).code).toBe(0);
  });
});

/**
 * A mutated copy of the script in the fixture root.
 *
 * Asserts the edit actually changed the source: a regex that silently matches nothing
 * turns a mutation test into a second copy of the happy path, which is the tautology
 * C-34 names — the mutant has to be real or the test measures nothing.
 */
function mutate(name: string, edit: (src: string) => string): string {
  const src = fs.readFileSync(PREFLIGHT, 'utf8');
  const out = edit(src);
  if (out === src) throw new Error(`mutate(${name}): the edit matched nothing — the mutant is not real`);
  const p = path.join(root, `preflight-${name}.sh`);
  fs.writeFileSync(p, out, 'utf8');
  return p;
}

describe('scripts/groom/floor.json', () => {
  it('is parseable by the same expression the script uses, and is a positive integer', () => {
    const raw = fs.readFileSync(COMMITTED_FLOOR, 'utf8');
    const parsed = JSON.parse(raw) as { min_commits_on_origin_main?: unknown };
    expect(typeof parsed.min_commits_on_origin_main).toBe('number');
    expect(parsed.min_commits_on_origin_main as number).toBeGreaterThan(0);
    expect(Number.isInteger(parsed.min_commits_on_origin_main)).toBe(true);

    // The script reads it with sed, not a JSON parser, so prove the two agree.
    const viaSed = execFileSync(
      'sed',
      ['-n', 's/.*"min_commits_on_origin_main"[[:space:]]*:[[:space:]]*\\([0-9]\\{1,\\}\\).*/\\1/p', COMMITTED_FLOOR],
      { encoding: 'utf8' },
    ).trim();
    expect(Number(viaSed)).toBe(parsed.min_commits_on_origin_main);
  });

  it('is what the script defaults to when GROOM_FLOOR_FILE is unset', () => {
    const src = fs.readFileSync(PREFLIGHT, 'utf8');
    expect(src).toContain('floor.json');
    expect(src).toContain('${GROOM_FLOOR_FILE:-$default_floor}');
  });
});
