// A green, mergeable PR whose child sits idle (CUL-1623), replayed on #1084's facts.

import * as F from './fixtures/stall-1084.ts';
import { checksOf, findStalls, noteText, STALL_GRACE_MIN, type StallInput } from './stall.ts';

const base = (over: Partial<StallInput>): StallInput => ({
  now: '2026-10-06T18:53:00Z',
  alias: F.ALIAS,
  launches: [F.LAUNCH],
  prs: [F.pr1084(checksOf(F.RUNS_FINAL))],
  sessions: { [F.SESSION]: 'review_ready' },
  parked: [],
  wakes: [],
  notes: [],
  ...over,
});

describe('reading a head commit\'s checks', () => {
  it('migration-numbers alone is not green: the required checks have not reported (#1084 at 17:28Z)', () => {
    expect(checksOf(F.RUNS_AT_1728)).toEqual({ state: 'pending' });
  });

  it('a queued run is pending', () => {
    const runs = [...F.RUNS_FINAL.slice(1), { name: 'App (typecheck + jest)', status: 'queued', conclusion: null, completed_at: null }];
    expect(checksOf(runs).state).toBe('pending');
  });

  it('green once every required check reports, done at the LAST completion', () => {
    expect(checksOf(F.RUNS_FINAL)).toEqual({ state: 'success', doneAt: '2026-10-06T17:37:37Z' });
  });

  it('a completed run with no readable completion time leaves the green undated, so pending', () => {
    expect(checksOf([...F.RUNS_FINAL.slice(1), { ...F.RUNS_FINAL[0], completed_at: null }]).state).toBe('pending');
    expect(checksOf([...F.RUNS_FINAL.slice(1), { ...F.RUNS_FINAL[0], completed_at: 'not a time' }]).state).toBe('pending');
  });

  it('one failure is red, whatever else is pending', () => {
    const runs = [...F.RUNS_AT_1728, { name: 'App (typecheck + jest)', status: 'completed', conclusion: 'failure', completed_at: '2026-10-06T17:31:00Z' }];
    expect(checksOf(runs).state).toBe('failure');
  });
});

describe('#1084, replayed', () => {
  it('17:30Z: idle with CI running is a ci-wait, not a stall', () => {
    const out = findStalls(base({ now: '2026-10-06T17:30:00Z', prs: [F.pr1084(checksOf(F.RUNS_AT_1728))] }));
    expect(out).toEqual([{ row: 'CUL-1621', session: F.SESSION, pr: 1084, kind: 'ci-wait' }]);
  });

  it(`17:40Z: green but inside the ${STALL_GRACE_MIN}-minute grace, so a subscription wake is not raced`, () => {
    expect(findStalls(base({ now: '2026-10-06T17:40:00Z' }))).toEqual([]);
  });

  it('17:48Z: green, mergeable, idle, no stop sent → stalled, with the facts-only note', () => {
    const [s] = findStalls(base({ now: '2026-10-06T17:48:00Z' }));
    expect(s).toMatchObject({ row: 'CUL-1621', session: F.SESSION, pr: 1084, kind: 'stalled' });
    expect(s.note).toBe(noteText(F.ALIAS, 'CUL-1621', F.pr1084(checksOf(F.RUNS_FINAL))));
    expect(s.note!.split('\n')[0]).toBe(
      '/dispatch note · The workflow audit · CUL-1621 · #1084 at 443a08b: every check passed (the last at 2026-10-06T17:37:37Z), GitHub reports it mergeable, and this session is idle.',
    );
  });

  it('the note carries no word of approval (§ Authority)', () => {
    const [s] = findStalls(base({}));
    expect(s.note).not.toMatch(/\b(go|approved|yes|merge|apply|ship it)\b/i);
  });

  it('a head already noted is not noted twice; a new head is', () => {
    const notes = [{ session: F.SESSION, sha: F.HEAD, at: '2026-10-06T18:53:00Z' }];
    expect(findStalls(base({ notes }))).toEqual([{ row: 'CUL-1621', session: F.SESSION, pr: 1084, kind: 'stalled', notedAt: '2026-10-06T18:53:00Z' }]);
    const moved = { ...F.pr1084(checksOf(F.RUNS_FINAL)), headSha: 'abc1234' };
    expect(findStalls(base({ notes, prs: [moved] }))[0].note).toBeDefined();
  });
});

describe('what is not a stall', () => {
  it('a head with no sha read: nothing to note it once by, so nothing is sent', () => {
    expect(findStalls(base({ prs: [{ ...F.pr1084(checksOf(F.RUNS_FINAL)), headSha: undefined }] }))).toEqual([]);
  });

  it('a PM-waiting stop whose reason only mentions CI still holds', () => {
    const wakes = [{ session: F.SESSION, kind: 'stopped' as const, reason: 'waiting on CI config ruling', at: '2026-10-06T17:28:37Z' }];
    expect(findStalls(base({ wakes }))).toEqual([]);
  });

  it('a working session', () => {
    expect(findStalls(base({ sessions: { [F.SESSION]: 'working' } }))).toEqual([]);
  });

  it('a dead session (gone or failed) is step 0\'s died row, not a stall', () => {
    expect(findStalls(base({ sessions: {} }))).toEqual([]);
    expect(findStalls(base({ sessions: { [F.SESSION]: 'failed' } }))).toEqual([]);
  });

  it('a parked PR (merge gate or migration) gets its own note, not this one', () => {
    expect(findStalls(base({ parked: [1084] }))).toEqual([]);
  });

  it('not mergeable, or red', () => {
    expect(findStalls(base({ prs: [{ ...F.pr1084(checksOf(F.RUNS_FINAL)), mergeable: false }] }))).toEqual([]);
    expect(findStalls(base({ prs: [F.pr1084({ state: 'failure' })] }))).toEqual([]);
  });

  it('another project\'s launch', () => {
    expect(findStalls(base({ alias: 'Engines v3' }))).toEqual([]);
  });

  it('a terminal wake ends it: the PR was left for the PM', () => {
    const wakes = [{ session: F.SESSION, kind: 'done' as const, reason: 'PR left for the PM', at: '2026-10-06T17:45:00Z' }];
    expect(findStalls(base({ wakes }))).toEqual([]);
  });

  it('a stop waiting on the PM holds it, until the branch moves after the stop', () => {
    const wakes = [{ session: F.SESSION, kind: 'stopped' as const, reason: 'plan go', at: '2026-10-06T17:27:30Z' }];
    expect(findStalls(base({ wakes }))).toEqual([]);
    // The stop came before the last push: the child was answered and built on.
    const early = [{ ...wakes[0], at: '2026-10-06T17:00:00Z' }];
    expect(findStalls(base({ wakes: early }))[0].kind).toBe('stalled');
  });

  it('a stop that is a CI wait never holds it', () => {
    const wakes = [{ session: F.SESSION, kind: 'stopped' as const, reason: 'waiting on CI', at: '2026-10-06T17:28:37Z' }];
    expect(findStalls(base({ wakes }))[0].kind).toBe('stalled');
  });
});
