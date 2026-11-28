// The pure rules behind a rollback (CUL-2885). The I/O half is driven end to end against
// fixture repositories in guards/mergeCheck.test.ts § rollback.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { deployVerdict, digestLine, issueWrites, LEDGER, ledgerAddsOne, ledgerProblems, namedIssues, NO_RUN_MINUTES, protection, refusal, withoutIssues, writeLines, type Commit, type Run } from './rollback.ts';

const SHA = 'a'.repeat(40);
const LATER = 'b'.repeat(40);

const commit = (over: Partial<Commit> = {}): Commit => ({
  sha: SHA,
  subject: 'Change (#41)',
  body: '',
  parents: 1,
  files: ['lib/shared.ts'],
  revertTree: 't1',
  mainTree: 't2',
  laterMigrations: [],
  ...over,
});

describe('refusal', () => {
  it('a clean revert of a squash commit with no migration may roll back', () => {
    expect(refusal(commit())).toBeNull();
  });

  it('a migration, a conflicting later merge, a merge commit or nothing left to revert goes to the PM', () => {
    expect(refusal(commit({ files: ['lib/a.ts', 'supabase/migrations/090_x.sql'] }))).toMatch(/carried a migration \(supabase\/migrations\/090_x\.sql\)/);
    expect(refusal(commit({ revertTree: null }))).toMatch(/a later merge touched the same lines/);
    expect(refusal(commit({ parents: 2 }))).toMatch(/not a squash commit/);
    expect(refusal(commit({ revertTree: 't2' }))).toMatch(/already rolled back/);
  });

  it('any SQL file counts as a migration, its own or a later merge\'s', () => {
    expect(refusal(commit({ files: ['scripts/backfill/fix.sql'] }))).toMatch(/carried a migration/);
    expect(refusal(commit({ laterMigrations: ['supabase/migrations/091_drop.sql'] }))).toMatch(/a later merge carried a migration \(supabase\/migrations\/091_drop\.sql\)/);
  });

  it('a rollback or a revert is never undone without the PM', () => {
    expect(refusal(commit({ subject: 'Rollback #41: Change (#41) (#50)' }))).toMatch(/itself a rollback or a revert/);
    expect(refusal(commit({ subject: 'Revert "Change (#41)" (#50)' }))).toMatch(/itself a rollback or a revert/);
    expect(refusal(commit({ subject: 'Undo it (#50)', body: `x\n\nRollback-Of: ${SHA}` }))).toMatch(/itself a rollback or a revert/);
  });
});

describe('deployVerdict', () => {
  const at = new Date('2026-11-24T10:00:00Z');
  const mins = (n: number) => new Date(at.getTime() + n * 60_000);
  const run = (over: Run): Run => ({ head_sha: SHA, event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-11-24T10:01:00Z', html_url: 'u', ...over });
  const v = (runs: Run[], now = mins(5), contains = (s: string) => s === LATER) => deployVerdict(runs, SHA, contains, at, now).verdict;

  it("the merge's own run decides: passed, failed or still going", () => {
    expect(v([run({})])).toBe('PASS');
    expect(v([run({ conclusion: 'failure' })])).toBe('FAIL');
    expect(v([run({ conclusion: 'timed_out' })])).toBe('FAIL');
    expect(v([run({ status: 'in_progress', conclusion: null })])).toBe('WAIT');
  });

  it('a run replaced while queued is covered by the later run that holds the merge, never by an unrelated one', () => {
    const cancelled = run({ conclusion: 'cancelled' });
    expect(v([cancelled, run({ head_sha: LATER })])).toBe('PASS');
    expect(v([cancelled, run({ head_sha: LATER, conclusion: 'failure' })])).toBe('FAIL');
    expect(v([cancelled, run({ head_sha: 'c'.repeat(40) })])).toBe('WAIT');
  });

  it('only push runs count: a manual run is someone else deploying', () => {
    expect(v([run({ event: 'workflow_dispatch' })])).toBe('WAIT');
  });

  it('a check that cannot run counts as a failure once the window has passed', () => {
    expect(v([], mins(NO_RUN_MINUTES - 1))).toBe('WAIT');
    expect(v([], mins(NO_RUN_MINUTES))).toBe('FAIL');
    expect(v([run({ conclusion: 'cancelled' })], mins(NO_RUN_MINUTES))).toBe('FAIL');
  });
});

describe('the ledger', () => {
  const entry = { pr: 41, sha: SHA, subject: 'Change (#41)', files: ['lib/shared.ts'], why: 'deploy check failed', date: '2026-11-24' };

  it('accepts a full entry and prints the digest line', () => {
    expect(ledgerProblems({ rollbacks: [entry] })).toEqual([]);
    expect(digestLine(entry)).toBe('rollback · #41 Change (#41) · deploy check failed · 2026-11-24');
  });

  it('refuses a missing list or an entry without a reason', () => {
    expect(ledgerProblems({})).toHaveLength(1);
    expect(ledgerProblems({ rollbacks: [{ ...entry, why: ' ' }] })).toHaveLength(1);
    expect(ledgerProblems({ rollbacks: [{ ...entry, sha: 'abc' }] })).toHaveLength(1);
  });

  it("a landing adds exactly one entry, for its own rollback, and keeps main's", () => {
    const base = { rollbacks: [{ ...entry, pr: 7, sha: LATER }] };
    expect(ledgerAddsOne(base, { rollbacks: [...base.rollbacks, entry] }, SHA)).toBeNull();
    expect(ledgerAddsOne(base, base, SHA)).toMatch(/gains 0 entries/);
    expect(ledgerAddsOne(base, { rollbacks: [...base.rollbacks, entry, entry] }, SHA)).toMatch(/gains 2 entries/);
    expect(ledgerAddsOne(base, { rollbacks: [{ ...entry, pr: 8, sha: LATER }, entry] }, SHA)).toMatch(/rewrites main's entries/);
    expect(ledgerAddsOne(base, { rollbacks: [...base.rollbacks, { ...entry, sha: LATER }] }, SHA)).toMatch(/new entry names/);
    expect(ledgerAddsOne(base, undefined, SHA)).toMatch(/no `rollbacks` array/);
  });

  // The fixtures the self merge gate's tests read (CUL-2874): every rollback lands one.
  it("the repository's ledger is well formed", () => {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '../..', LEDGER), 'utf8'));
    expect(ledgerProblems(raw)).toEqual([]);
  });
});

// CUL-2910, ruled (c): a rollback of a PR the deny list would hold reopens its issues.
describe('a protected rollback reopens its issues (CUL-2910)', () => {
  it('reads every issue the reverted squash commit names, once each', () => {
    expect(namedIssues('Fix the read (CUL-77) (#41)', '* part one (CUL-77)\n* part two (cul-9)\n\nCo-Authored-By: x')).toEqual(['CUL-9', 'CUL-77']);
    expect(namedIssues('Docs (#42)', '')).toEqual([]);
  });

  it('leaves no issue token in what the rollback carries, so its merge closes nothing', () => {
    expect(withoutIssues('Fix the read (CUL-77) (#41)')).toBe('Fix the read (#41)');
    expect(withoutIssues('Two (CUL-77, CUL-78) (#41)')).toBe('Two (#41)');
    expect(withoutIssues('see CUL-77 and [CUL-78](https://linear.app/x/issue/CUL-78)')).not.toMatch(/CUL-\d/i);
    expect(withoutIssues('Keep (#41) and (a note)')).toBe('Keep (#41) and (a note)');
  });

  it('is protected exactly when the deny list would hold the reverted PR', () => {
    expect(protection(commit({ files: ['docs/notes.md'] }), [])).toEqual([]);
    expect(protection(commit({ files: ['lib/shared.ts'] }), []).join()).toMatch(/lib\/shared\.ts/);
    expect(protection(commit({ files: ['docs/notes.md'] }), ['Live harm']).join()).toMatch(/Live harm/);
    expect(protection(commit({ files: ['docs/notes.md'] }), ['Gate: clinical']).join()).toMatch(/Gate: clinical/);
    expect(protection(commit({ files: ['docs/notes.md'] }), ['Gate: privacy']).join()).toMatch(/Gate: privacy/);
    // Labels not read count as protected: unsure holds.
    expect(protection(commit({ files: ['docs/notes.md'] }), null).join()).toMatch(/labels were not passed/);
  });

  const base = { pr: 41, sha: SHA, subject: 'Fix the read (CUL-77) (#41)', why: 'deploy check failed', date: '2026-11-28' };

  it('reopens each named issue with Live harm and Waiting on PM and a comment naming the rollback', () => {
    const w = issueWrites({ ...base, issues: ['CUL-77', 'CUL-78'], reasons: ['a named issue is labelled Live harm'] });
    expect(w.map((x) => x.issue)).toEqual(['CUL-77', 'CUL-78']);
    for (const x of w) {
      expect(x.state).toBe('Todo');
      expect(x.addLabels).toEqual(['Live harm', 'Waiting on PM']);
      expect(x.comment).toMatch(/^\*\*Reopened by a rollback\*\* of #41 \(`aaaaaaa`, Fix the read \(#41\)\) on 2026-11-28: deploy check failed\./);
      expect(x.comment).toContain('Protected because: a named issue is labelled Live harm');
    }
  });

  it('a protected PR that names no issue files a new one, so nothing reverts unseen', () => {
    const w = issueWrites({ ...base, issues: [], reasons: ['lib/shared.ts: product code'] });
    expect(w).toHaveLength(1);
    expect(w[0].issue).toBeNull();
    expect(writeLines(w, 41).join('\n')).toMatch(/save_issue new .*labels \["Live harm","Waiting on PM"\]/);
  });

  it('an unprotected rollback owes no writes', () => {
    expect(issueWrites({ ...base, issues: ['CUL-77'], reasons: [] })).toEqual([]);
    expect(writeLines([], 41)).toEqual(['unprotected: the deny list would not hold the reverted PR; no issue writes']);
  });

  // The Done-when fixture: `apply` end to end against a throwaway repository with an origin.
  describe('apply against a fixture repository', () => {
    const CLI = path.join(__dirname, 'rollback-cli.ts');
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    const g = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
    const put = (dir: string, files: Record<string, string>) => {
      for (const [f, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), body);
      }
    };
    let work = '';
    let tmp = '';

    beforeAll(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-2910-'));
      const origin = path.join(tmp, 'origin.git');
      const main = path.join(tmp, 'main');
      g(tmp, ['init', '--quiet', '--bare', '-b', 'main', origin]);
      g(tmp, ['clone', '--quiet', origin, main]);
      const land = (files: Record<string, string>, msg: string) => {
        put(main, files);
        g(main, ['add', '-A']);
        g(main, ['commit', '--quiet', '-m', msg]);
      };
      land({ 'lib/shared.ts': 'export const a = 1;\n', 'docs/notes.md': 'one\n', [LEDGER]: '{\n  "rollbacks": []\n}\n' }, 'Start (#40)');
      land({ 'lib/shared.ts': 'export const a = 2;\n' }, 'Fix the read (CUL-77) (#41)\n\n* Fix the read (CUL-77)');
      land({ 'docs/notes.md': 'two\n' }, 'Notes (CUL-78) (#42)');
      g(main, ['push', '--quiet', 'origin', 'main']);
      work = path.join(tmp, 'work');
      g(tmp, ['clone', '--quiet', origin, work]);
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const apply = (pr: number, labels: string) => {
      g(work, ['checkout', '--quiet', '-B', `rb-${pr}`, 'origin/main']);
      return execFileSync('node', ['--experimental-strip-types', '--no-warnings', CLI, 'apply', String(pr), '--why', 'deploy check failed (CUL-90)', '--labels', labels], { cwd: work, env, encoding: 'utf8' });
    };

    it('a rollback of a protected PR prints the reopen of its issue, and names no issue itself', () => {
      const out = apply(41, 'Gate: clinical');
      expect(out).toContain('REQUIRED before the rollback merges');
      expect(out).toContain('save_issue CUL-77: state Todo, addLabels ["Live harm","Waiting on PM"]');
      expect(out).toMatch(/save_comment CUL-77: \*\*Reopened by a rollback\*\* of #41 .*Protected because: lib\/shared\.ts: .*a named issue is labelled Gate: clinical/);
      expect(out).toMatch(/^digest: rollback · #41 Fix the read \(#41\) · deploy check failed · /m);
      expect(g(work, ['log', '-1', '--format=%B'])).not.toMatch(/CUL-\d/i);
      expect(fs.readFileSync(path.join(work, LEDGER), 'utf8')).not.toMatch(/CUL-\d/i);
    });

    it('a rollback of an unprotected PR prints no writes', () => {
      const out = apply(42, 'none');
      expect(out).toContain('unprotected: the deny list would not hold the reverted PR; no issue writes');
      expect(out).not.toContain('save_issue');
      expect(out).not.toContain('REQUIRED');
    });

    it('the same unprotected PR with a Live harm issue, or labels unread, is protected', () => {
      expect(apply(42, 'Live harm')).toContain('save_issue CUL-78: state Todo, addLabels ["Live harm","Waiting on PM"]');
      g(work, ['checkout', '--quiet', '-B', 'rb-42b', 'origin/main']);
      const unread = execFileSync('node', ['--experimental-strip-types', '--no-warnings', CLI, 'apply', '42', '--why', 'x'], { cwd: work, env, encoding: 'utf8' });
      expect(unread).toContain('save_issue CUL-78');
    });
  });
});
