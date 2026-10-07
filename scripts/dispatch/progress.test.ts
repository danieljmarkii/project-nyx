// The progress update (CUL-1624), replayed on The workflow audit's facts of 2026-10-06 and
// on Engines v3's run order of 2026-10-05.

import * as E from './fixtures/facts-2026-10-05.ts';
import * as F from './fixtures/progress-workflow-audit-2026-10-06.ts';
import { planDispatch } from './plan.ts';
import {
  bar,
  cyclesFrom,
  estimateLine,
  holdsFromPlan,
  localTime,
  nextFromPlan,
  nextFromQueued,
  progressEmail,
  quantile,
  renderProgress,
  sinceOf,
  unitsFromIssues,
  unitsFromPlan,
  validateProgress,
  type ProgressInput,
  type Unit,
} from './progress.ts';

const SINCE = '2026-10-05T23:56:39.000Z'; // no progress update yet: the last day

function auditInput(over: Partial<ProgressInput> = {}): ProgressInput {
  const units = unitsFromIssues(F.ISSUES, F.LAUNCHES, F.PRS, F.QUEUED);
  const own = units.filter((u) => u.state === 'running' || u.state === 'open').length;
  return {
    alias: F.ALIAS,
    now: F.NOW,
    since: SINCE,
    units,
    launches: F.LAUNCHES,
    wakes: F.WAKES,
    cycles: cyclesFrom(F.LAUNCHES, F.PRS),
    next: [...nextFromQueued(F.QUEUED), ...F.MERGE_GATED],
    holds: [{ text: 'CUL-1616 (Waiting on PM)' }, { text: 'CUL-955 (Waiting on PM)' }],
    slots: F.FREE_SLOTS + own,
    ...over,
  };
}

const AUDIT_2356 = [
  'Progress: 25 of 38 merged (66%) ▓▓▓▓▓▓░░░░ · W-A 3/3 · W-B 1/2 · W-C 0/1 · W-D 0/1 · W-E 0/2 · no milestone 21/29 · 3 in flight',
  'Moved since Oct 5 18:56 CT: merged CUL-1613 (#1080), CUL-1522 (#1081), CUL-1617 (#1079), CUL-1614 (#1082), CUL-1615 (#1083), CUL-1621 (#1084), CUL-1622 (#1084) · stopped CUL-1616 (Auto mode blocks hook edits) · launched CUL-1522, CUL-1613, CUL-1616, CUL-1617, CUL-1614, CUL-1615, CUL-1621, CUL-1622, CUL-1623, CUL-1624, CUL-1517',
  'Next: on CUL-1623 merging (its merge gate): CUL-1624 · on CUL-1623 + CUL-1624 merging (its merge gate): CUL-1517',
  'On you: CUL-1616 (Waiting on PM); CUL-955 (Waiting on PM)',
  "Estimate: 3 rows to run ≈ 1 round of 4 slots ≈ 36–61 min of running time, not a date (basis: 6 merged launches here, launch to merge p25 36 min · median 52 · p75 61); not counted: 2 waiting on you or a gate, 8 not on dispatch's run (no row, or worked by hand)",
].join('\n');

describe('The workflow audit at 23:56Z on 10/6 (the dry run)', () => {
  it('prints the five lines, and they validate', () => {
    const text = renderProgress(auditInput());
    expect(text).toBe(AUDIT_2356);
    expect(validateProgress(text)).toEqual([]);
  });

  it('measures the six cycles launch to merge, one per PR (CUL-1621 and CUL-1622 share #1084)', () => {
    const c = cyclesFrom(F.LAUNCHES, F.PRS);
    expect(c.map((x) => [x.id, x.pr, Math.round(x.minutes)])).toEqual([
      ['CUL-1522', 1081, 49],
      ['CUL-1613', 1080, 24],
      ['CUL-1617', 1079, 63],
      ['CUL-1614', 1082, 32],
      ['CUL-1615', 1083, 55],
      ['CUL-1621', 1084, 92],
    ]);
  });

  it('counts children, never their parent; drops canceled and duplicate issues', () => {
    const ids = auditInput().units.map((u) => u.id);
    expect(ids).not.toContain('CUL-1612');
    expect(ids).not.toContain('CUL-1366');
    expect(ids).not.toContain('CUL-923');
    expect(ids).not.toContain('CUL-1453');
    expect(ids).toContain('CUL-1466');
  });
});

describe('an issue\'s state, when the project has no run-order table', () => {
  const state = (id: string, units = auditInput().units) => units.find((u) => u.id === id)?.state;
  it('a merged PR beats every label', () => expect(state('CUL-1621')).toBe('merged'));
  it('an open PR is open', () => expect(state('CUL-1623')).toBe('open'));
  it('the PM\'s label beats the launch it stopped on', () => expect(state('CUL-1616')).toBe('on-you'));
  it('launched with no PR yet is running, whatever Linear\'s state says', () => expect(state('CUL-1517')).toBe('running'));
  it('started by hand, never launched, is not dispatch\'s', () => expect(state('CUL-924')).toBe('unscheduled'));
  it('queued is ready', () => {
    const units = unitsFromIssues(F.ISSUES, F.LAUNCHES, F.PRS, ['CUL-926 (after CUL-1624)']);
    expect(state('CUL-926', units)).toBe('ready');
    expect(state('CUL-925', units)).toBe('unscheduled');
  });
  it('a queued line reads its gate', () => {
    expect(nextFromQueued(['CUL-1517 (after CUL-1624)', 'CUL-926', 'none'])).toEqual([
      { id: 'CUL-1517', on: 'CUL-1624 merging' },
      { id: 'CUL-926', on: 'now' },
    ]);
  });
});

describe('a run order (Engines v3 at 21:10Z on 10/5)', () => {
  const plan = planDispatch({
    now: '2026-10-05T21:10:19Z',
    project: E.ENGINES_V3,
    others: [E.OUT_OF_BETA],
    prs: [...E.MERGED, E.PR_1064, E.PR_1072_AT_2110, E.PR_1074_AT_2110],
    issues: E.ISSUES,
    claims: E.CLAIMS_AT_2110,
    sessions: E.SESSIONS_AT_2110,
    launches: E.LAUNCHES,
    mainMigrations: E.MAIN_MIGRATIONS_THROUGH_083,
    appliedMigrations: ['vet_call_cover'],
    productionLib: E.PRODUCTION_LIB,
  });
  const units = unitsFromPlan(plan, E.MERGED);
  const state = (id: string) => units.find((u) => u.id === id)?.state;

  it('one unit per numbered row, in the page\'s waves', () => {
    expect(units.length).toBe(plan.verdicts.filter((v) => v.row).length);
    expect(units.every((u) => u.wave === plan.page.rows.find((r) => `PR-${r.id}` === u.id)?.wave)).toBe(true);
  });

  it('reads each row\'s state from its verdict', () => {
    expect(state('PR-36')).toBe('open');
    expect(state('PR-23c')).toBe('held'); // a live claim, not a PM hold
    expect(state('PR-23a')).toBe('ready');
    expect(state('PR-27b')).toBe('ready');
    expect(state('PR-33')).toBe('held');
    expect(units.filter((u) => u.state === 'merged').length).toBe(plan.verdicts.filter((v) => v.state.kind === 'merged').length);
  });

  it('a merged row carries its merge time, so "moved since" can see it', () => {
    expect(units.filter((u) => u.state === 'merged').every((u) => !!u.mergedAt)).toBe(true);
  });

  it('a row held on a ruling or a PM action is on you', () => {
    const pmRow = plan.verdicts.find((v) => v.row && v.state.kind === 'none' && v.holds.some((h) => h.kind === 'ruling' || h.kind === 'pm'));
    expect(pmRow).toBeDefined();
    expect(state(`PR-${pmRow!.row}`)).toBe('on-you');
  });

  it('next: the ready rows now, then a row waiting only on unmerged PRs, on their merge', () => {
    const next = nextFromPlan(plan);
    expect(next.filter((n) => n.on === 'now').map((n) => n.id)).toEqual(['PR-23a', 'PR-27b']);
    expect(next).toContainEqual({ id: 'PR-33', on: 'PR-31 merging' });
    for (const h of plan.pmHolds) for (const r of h.freesOutright) expect(next).toContainEqual({ id: `PR-${r}`, on: `your ruling: ${h.key}` });
  });

  it('on you: the holds in the index\'s order, with what each frees', () => {
    expect(holdsFromPlan(plan)).toEqual(plan.pmHolds.map((h) => ({ text: h.text, frees: h.freesOutright.length, holds: h.rowsHeld.length })));
  });
});

describe('the estimate', () => {
  const u = (state: Unit['state'], n = 1): Unit[] => Array.from({ length: n }, (_, i) => ({ id: `PR-${state}${i}`, wave: '', state }));
  const cyc = (...minutes: number[]) => minutes.map((m, i) => ({ id: `c${i}`, pr: i, launchedAt: '', mergedAt: '', minutes: m }));
  const est = (over: Partial<ProgressInput>) => estimateLine(auditInput(over));

  it('rounds are rows over usable slots, the range p25 to p75 of measured cycles', () => {
    expect(est({ units: u('ready', 7), slots: 3, cycles: cyc(30, 40, 50, 60, 70) })).toBe(
      'Estimate: 7 rows to run ≈ 3 rounds of 3 slots ≈ 2–3 h of running time, not a date (basis: 5 merged launches here, launch to merge p25 40 min · median 50 · p75 60)',
    );
  });

  it('switches to hours past two', () => {
    expect(est({ units: u('ready', 7), slots: 3, cycles: cyc(40, 50, 60, 70, 80) })).toContain('≈ 2.5–3.5 h of running time');
  });

  it('counts running, open, ready and held rows; names the rest beside it', () => {
    const units = [...u('running'), ...u('open'), ...u('ready'), ...u('held'), ...u('on-you'), ...u('parked'), ...u('unscheduled'), ...u('merged')];
    const line = est({ units, slots: 4, cycles: cyc(10, 20, 30) });
    expect(line).toMatch(/^Estimate: 4 rows to run ≈ 1 round of 4 slots/);
    expect(line).toMatch(/not counted: 2 waiting on you or a gate, 1 not on dispatch's run/);
  });

  it('no free slot still counts as one, never a division by zero', () => {
    expect(est({ units: u('ready', 2), slots: 0, cycles: cyc(10, 20, 30) })).toContain('2 rounds of 1 slot ');
  });

  it('too few cycles here falls back to the repo, and says so', () => {
    expect(est({ units: u('ready'), cycles: cyc(10), repoCycles: cyc(10, 20, 30) })).toContain('3 merged launches repo-wide (only 1 here)');
  });

  it('too few anywhere is no estimate, never a guess', () => {
    expect(est({ units: u('ready'), cycles: cyc(10, 20), repoCycles: cyc(10, 20) })).toBe('Estimate: none yet: 2 measured launch-to-merge cycles, 3 needed');
  });

  it('everything left waits on the PM: none to run, never a duration', () => {
    expect(est({ units: [...u('on-you', 2), ...u('merged')] })).toBe('Estimate: none to run without you; not counted: 2 waiting on you or a gate');
  });

  it('nothing left', () => {
    expect(est({ units: u('merged', 3) })).toBe('Estimate: nothing left to run');
  });
});

describe('moved since', () => {
  const moved = (over: Partial<ProgressInput>) => renderProgress(auditInput(over)).split('\n')[1];

  it('only what happened inside the window', () => {
    expect(moved({ since: '2026-10-06T17:00:00Z' })).toBe(
      'Moved since Oct 6 12:00 CT: merged CUL-1621 (#1084), CUL-1622 (#1084) · launched CUL-1621, CUL-1622, CUL-1623, CUL-1624, CUL-1517',
    );
    expect(moved({ since: '2026-10-06T17:00:00Z', now: '2026-10-06T18:30:00Z' })).toBe('Moved since Oct 6 12:00 CT: launched CUL-1621, CUL-1622');
  });

  it('a done-short wake is named with its reason', () => {
    const wakes = [{ session: 'session_015zVuzkVGS4bC3b5aSjBQi8', kind: 'done' as const, reason: 'PR left for the PM', at: '2026-10-06T19:00:00Z' }];
    expect(moved({ since: '2026-10-06T18:58:00Z', wakes })).toBe('Moved since Oct 6 13:58 CT: done short CUL-1621 (PR left for the PM) · launched CUL-1623, CUL-1624, CUL-1517');
  });

  it('nothing is "nothing"', () => {
    expect(moved({ since: F.NOW })).toBe('Moved since Oct 6 18:56 CT: nothing');
  });

  it('the window starts at the newest progress update, else a day back', () => {
    const updates = [
      { body: '**/dispatch run**\n\nLaunched …', createdAt: '2026-10-06T23:53:45Z' },
      { body: '**/dispatch progress**\n\nProgress: …', createdAt: '2026-10-06T12:45:00Z' },
      { body: '**/dispatch progress**\n\nProgress: …', createdAt: '2026-10-05T12:45:00Z' },
    ];
    expect(sinceOf(updates, F.NOW)).toBe('2026-10-06T12:45:00Z');
    expect(sinceOf(updates.slice(0, 1), F.NOW)).toBe(SINCE);
  });
});

describe('the lines', () => {
  it('a bar of ten', () => {
    expect(bar(25, 38)).toBe('▓▓▓▓▓▓░░░░');
    expect(bar(0, 0)).toBe('░░░░░░░░░░');
    expect(bar(3, 3)).toBe('▓▓▓▓▓▓▓▓▓▓');
  });

  it('quantiles interpolate, so an even median is the mean of the middle two', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10], 0.75)).toBe(10);
  });

  it('times print in the PM\'s zone, whatever the machine\'s', () => {
    expect(localTime('2026-10-07T12:45:00Z')).toBe('Oct 7 07:45 CT');
    expect(localTime('2026-12-07T13:45:00Z')).toBe('Dec 7 07:45 CT');
  });

  it('on you: the top three, then a count, then the index', () => {
    const holds = ['a', 'b', 'c', 'd'].map((t, i) => ({ text: t, frees: i, holds: i + 1 }));
    expect(renderProgress(auditInput({ holds, index: 'CUL-9' })).split('\n')[3]).toBe('On you: a (frees 0, holds 1); b (frees 1, holds 2); c (frees 2, holds 3) and 1 more → CUL-9');
    expect(renderProgress(auditInput({ holds: [] })).split('\n')[3]).toBe('On you: nothing');
  });

  it('next, when nothing waits to start', () => {
    expect(renderProgress(auditInput({ next: [] })).split('\n')[2]).toBe('Next: nothing queued; the next ruling or added row starts the next round');
  });

  it('a validator refuses anything but the five lines, in order, with plain ids', () => {
    expect(validateProgress(AUDIT_2356 + '\nPR body: …')).toContain('6 lines, not 5');
    expect(validateProgress(AUDIT_2356.split('\n').reverse().join('\n'))).toContain('line 1 does not start "Progress:"');
    expect(validateProgress(AUDIT_2356.replace('CUL-1616', '<issue id="x">CUL-1616</issue>'))).toContain('a link tag; write plain ids');
  });
});

describe('the email (dispatcher only, self only, the five lines only)', () => {
  const OWNER = 'pm@example.test';

  it('one recipient, the owner given; the body is the update, unchanged', () => {
    const e = progressEmail(AUDIT_2356, F.ALIAS, F.NOW, OWNER);
    expect(e).toEqual({ to: OWNER, subject: '/dispatch progress · The workflow audit · Oct 6 18:56 CT', body: AUDIT_2356 });
  });

  it('no address in the session context: skipped, and it says why', () => {
    expect(progressEmail(AUDIT_2356, F.ALIAS, F.NOW)).toEqual({ skipped: 'no owner address in the session context' });
    expect(progressEmail(AUDIT_2356, F.ALIAS, F.NOW, '  ')).toEqual({ skipped: 'no owner address in the session context' });
  });

  it('never a list of recipients', () => {
    expect(progressEmail(AUDIT_2356, F.ALIAS, F.NOW, `${OWNER}, other@example.test`)).toHaveProperty('skipped');
    expect(progressEmail(AUDIT_2356, F.ALIAS, F.NOW, `${OWNER};other@example.test`)).toHaveProperty('skipped');
  });

  it('anything beyond the five lines is not sent', () => {
    const e = progressEmail(`${AUDIT_2356}\nFrom the children: …`, F.ALIAS, F.NOW, OWNER);
    expect(e).toEqual({ skipped: 'not the five-line update (6 lines, not 5)' });
  });
});
