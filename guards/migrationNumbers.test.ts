// Proof by MUTATION for `scripts/steward/migration-numbers.sh`, the `migration-numbers` CI
// job (CUL-1522).
//
// WHY A GUARD AT ALL. The job is a required check whose dangerous answer is "no clash":
// it reads every open PR's files from GitHub, and a read that quietly came back short (a
// page dropped, a status filtered wrong) prints exactly what a correct read of a clean
// repository prints. So every verdict is driven both ways, and every failed read is a
// case that must exit 3, never 0.
//
// HOW GITHUB IS FAKED. The script reads only through `gh api`. Each case writes the
// responses to a directory under the fixture root (CUL-712) and puts a stub `gh` first
// on PATH that serves the file named after the endpoint, and fails like a 404 when there
// is none. A response file holds one JSON array per line, one line per page, and the
// stub returns every page only when it is called with `--paginate`, so a dropped
// `--paginate` is visible. The stub never touches the network.
//
// MUTANTS, run against the real script 2026-10-06, every one killed:
//
//   ✗ the later PR named as the holder (the order inverted)
//   ✗ a clash with a later PR left green (the stale-green hole the code review found)
//   ✗ numbers compared as text (84_ against 084_)
//   ✗ a clash with the base branch not checked
//   ✗ a modified (not added) migration counted as holding its number
//   ✗ the same file NAME counted as a clash (a PR stacked on another)
//   ✗ a failed read of another PR's files read as no clash
//   ✗ an empty base listing read as no clash
//   ✗ this run's own PR left out when the open list raced its opening
//   ✗ the same number twice in one PR not checked
//   ✗ `--paginate` dropped from the open PR listing (a clash on page two)
//
// STATED BLIND SPOTS are in the script's header; the one this file adds: the workflow
// file itself (its trigger, its token's permissions) is exercised only by its runs on
// the PR that added it, not here.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, removeFixtureRoot } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'steward', 'migration-numbers.sh');
const REPO = 'acme/app';

let root = '';
let bin = '';
let seq = 0;

interface Run {
  code: number;
  out: string;
}

/** The endpoint as the stub turns it into a file name. */
const key = (endpoint: string): string => endpoint.replace(/[^A-Za-z0-9]/g, '_');

type Files = Array<{ filename: string; status: string }>;

interface Repo {
  /** Open PRs, as pages of PR numbers. */
  pages: number[][];
  /** Each PR's changed files. A PR missing here fails its read. */
  files: Record<number, Files>;
  /** The base branch's supabase/migrations listing. */
  base: string[];
}

function serve(repo: Repo): string {
  seq += 1;
  const dir = path.join(root, `gh-${seq}`);
  fs.mkdirSync(dir, { recursive: true });
  const put = (endpoint: string, pages: unknown[]): void =>
    fs.writeFileSync(path.join(dir, key(endpoint)), `${pages.map((p) => JSON.stringify(p)).join('\n')}\n`, 'utf8');
  put(
    `repos/${REPO}/pulls?state=open&per_page=100`,
    repo.pages.map((page) => page.map((number) => ({ number }))),
  );
  for (const [n, files] of Object.entries(repo.files)) put(`repos/${REPO}/pulls/${n}/files?per_page=100`, [files]);
  put(`repos/${REPO}/contents/supabase/migrations?ref=main`, [
    repo.base.map((name) => ({ name, type: 'file' })),
  ]);
  return dir;
}

function run(dir: string, pr: number): Run {
  try {
    const out = execFileSync('bash', [SCRIPT, REPO, String(pr), 'main'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, FAKE_GH_DIR: dir },
      stdio: 'pipe',
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const added = (...names: string[]): Files => names.map((filename) => ({ filename, status: 'added' }));
const mig = (name: string): string => `supabase/migrations/${name}`;
const BASE = ['001_init.sql', '082_care_record.sql', '083_looks_guard_caller_check.sql'];

beforeAll(() => {
  root = createFixtureRoot('migration-numbers');
  bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      '# A stand-in for `gh api`: the response file named after the endpoint.',
      'paginate=0',
      'for a in "$@"; do case "$a" in --paginate) paginate=1 ;; repos/*) endpoint=$a ;; esac; done',
      'file="$FAKE_GH_DIR/$(printf "%s" "${endpoint:-}" | sed "s/[^A-Za-z0-9]/_/g")"',
      'if [ ! -f "$file" ]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi',
      'if [ "$paginate" -eq 1 ]; then cat "$file"; else head -n 1 "$file"; fi',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 },
  );
});

afterAll(() => {
  removeFixtureRoot(root);
  root = '';
});

describe('scripts/steward/migration-numbers.sh', () => {
  // The 10/5 pair: #1064 opened first with 084, #1074 opened a day later with its own 084.
  // Both sides fail: the job re-runs only on its own PR's pushes, so a green left standing
  // on either side could merge a duplicate once the other appeared (the code review's
  // stale-green sequence). The message names the later PR as the one that renumbers.
  it('a number two open PRs add fails both, naming the later PR to renumber; a renumber clears it', () => {
    const repo: Repo = {
      pages: [[1064, 1074, 1078]],
      files: {
        1064: added(mig('084_retire_log_picker_event_types_vet_visits_flags.sql'), 'app/x.tsx'),
        1074: added(mig('084_vet_call_cover.sql')),
        1078: added('lib/y.ts'),
      },
      base: BASE,
    };
    const later = run(serve(repo), 1074);
    expect(later.out).toContain(
      '::error::migration 084 is held by #1064 (084_retire_log_picker_event_types_vet_visits_flags.sql), opened before this PR; renumber 084_vet_call_cover.sql',
    );
    expect(later.code).toBe(1);

    const earlier = run(serve(repo), 1064);
    expect(earlier.out).toContain(
      '::error::migration 084 is also added by #1074 (084_vet_call_cover.sql), opened after this PR; #1074 renumbers, then re-run this check here',
    );
    expect(earlier.code).toBe(1);

    const none = run(serve(repo), 1078);
    expect(none.out).toContain('#1078 adds no migration');
    expect(none.code).toBe(0);

    const after = { ...repo, files: { ...repo.files, 1074: added(mig('085_vet_call_cover.sql')) } };
    const renumbered = run(serve(after), 1074);
    expect(renumbered.out).toContain('migration-numbers: no clash');
    expect(renumbered.code).toBe(0);
    // The earlier PR's re-run is green again.
    expect(run(serve(after), 1064).code).toBe(0);
  });

  it('a number the base branch already has in another file fails, after the PR that held it merged', () => {
    const r = run(serve({ pages: [[1064]], files: { 1064: added(mig('083_retire.sql')) }, base: BASE }), 1064);
    expect(r.out).toContain('::error::migration 083 is already on main as 083_looks_guard_caller_check.sql; renumber 083_retire.sql');
    expect(r.code).toBe(1);
  });

  it('the same file in two PRs, an edited migration, a non-migration file and a different number are no clash', () => {
    const repo: Repo = {
      pages: [[9, 10, 11, 13]],
      files: {
        10: added(mig('084_part1.sql')),
        // Stacked on #10: carries #10's file, adds nothing of its own.
        11: [...added(mig('084_part1.sql')), ...added('app/z.tsx')],
        // Opened before #11: an edit, a note and a nested file hold no number over it.
        9: [
          { filename: mig('084_edited.sql'), status: 'modified' },
          ...added(mig('084_notes.md'), mig('nested/084_x.sql')),
        ],
        13: added(mig('085_other.sql')),
      },
      base: BASE,
    };
    const r = run(serve(repo), 11);
    expect(r.out).toContain('#11 adds 084_part1.sql');
    expect(r.out).toContain('migration-numbers: no clash');
    expect(r.out).not.toContain('::error::');
    expect(r.code).toBe(0);
  });

  it('a clash with a PR listed on the second page of open PRs fails', () => {
    const r = run(
      serve({
        pages: [[5, 6], [7]],
        files: { 5: added('a.ts'), 6: added('b.ts'), 7: added(mig('084_seven.sql')), 9: added(mig('084_nine.sql')) },
        base: BASE,
      }),
      9,
    );
    // #9 is missing from the listing too (it raced its own opening), and is still checked.
    expect(r.out).toContain('::error::migration 084 is held by #7 (084_seven.sql)');
    expect(r.code).toBe(1);
  });

  it('numbers compare as numbers: 84_ and 084_ are one slot, on the base and between PRs', () => {
    const r = run(
      serve({ pages: [[4, 5]], files: { 4: added(mig('084_four.sql')), 5: added(mig('84_five.sql'), mig('83_five.sql')) }, base: BASE }),
      5,
    );
    expect(r.out).toContain('::error::migration 084 is held by #4 (084_four.sql)');
    expect(r.out).toContain('::error::migration 083 is already on main as 083_looks_guard_caller_check.sql; renumber 83_five.sql');
    expect(r.code).toBe(1);
  });

  it('one PR adding the same number twice fails', () => {
    const r = run(serve({ pages: [[3]], files: { 3: added(mig('084_a.sql'), mig('084_b.sql')) }, base: BASE }), 3);
    expect(r.out).toContain('::error::this PR adds migration 084 twice: 084_a.sql and 084_b.sql');
    expect(r.code).toBe(1);
  });

  it('exits 3, never 0, when a read fails or the base listing is empty', () => {
    const missing = run(serve({ pages: [[1, 2]], files: { 2: added(mig('084_two.sql')) }, base: BASE }), 2);
    expect(missing.out).toContain('could not list the files of #1: gh: Not Found (HTTP 404)');
    expect(missing.code).toBe(3);

    const empty = run(serve({ pages: [[2]], files: { 2: added(mig('084_two.sql')) }, base: [] }), 2);
    expect(empty.out).toContain('no migrations listed on main');
    expect(empty.code).toBe(3);

    const bad = run(serve({ pages: [[2]], files: { 2: added(mig('084_two.sql')) }, base: BASE }), 'x' as unknown as number);
    expect(bad.code).toBe(3);
  });
});
