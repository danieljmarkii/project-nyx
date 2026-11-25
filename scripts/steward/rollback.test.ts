// The pure rules behind a rollback (CUL-2885). The I/O half is driven end to end against
// fixture repositories in guards/mergeCheck.test.ts § rollback.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { deployVerdict, digestLine, LEDGER, ledgerProblems, NO_RUN_MINUTES, refusal, type Commit, type Run } from './rollback.ts';

const SHA = 'a'.repeat(40);
const LATER = 'b'.repeat(40);

const commit = (over: Partial<Commit> = {}): Commit => ({
  sha: SHA,
  subject: 'Change (#41)',
  parents: 1,
  files: ['lib/shared.ts'],
  revertTree: 't1',
  mainTree: 't2',
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

  // The fixtures the self merge gate's tests read (CUL-2874): every rollback lands one.
  it("the repository's ledger is well formed", () => {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '../..', LEDGER), 'utf8'));
    expect(ledgerProblems(raw)).toEqual([]);
  });
});
