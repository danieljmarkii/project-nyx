// The dispatcher's memory (CUL-1615): validation on write, memory against GitHub, the
// check-in read from the routines, and the closing-keyword guard.

import * as F from './fixtures/facts-2026-10-05.ts';
import {
  checkInFrom,
  closingLines,
  HANDOFF_TOKENS,
  handoffDue,
  issueIdsIn,
  launchLine,
  memoryCheck,
  parseLaunchLines,
  prSafe,
  validateStatusUpdate,
} from './status.ts';

// Out of beta's update of 2026-10-05T12:33Z, verbatim (c5fd863e), trimmed to its lines.
const OOB_1233 = `**/dispatch run**

**Merged: PR-53 (#1070)**, squash c63fa2d at 2026-10-05T12:24Z.

Dispatcher: session_01KnnV8nzUjoUeJcPNus9FFX
Teach: none in flight (PR-53 delivered)
Check-in: none armed (nothing in flight)
Auto: PR-27b, PR-27c, PR-28, PR-39b, PR-39c
Dismissed: e · PR-23 · e · PR-26`;

// Engines v3's of 2026-10-05T23:27Z (6dc48e5c): a well-formed launch line.
const EV3_2327 = `**/dispatch run**

Launched (picked by the PM, "go D"):
* PR-23a · CUL-1538 · session \`session_01CWitFkFQJxcGLkLSLicDW2\` · branch \`claude/engines-v3-pr23a-10052327\` · 2026-10-05T23:27:10Z · picked

Dispatcher: session_01N9FibkqxecwHsngMkwkxaZ
Teach: PR-27b
Check-in: 2026-10-06T00:13:00Z
Auto: none
Queued: none`;

const OOB_MERGED = new Set(['27b', '27c', '28', '39b', '39c', '53']);

describe('validation on write', () => {
  it('passes a well-formed update', () => {
    expect(validateStatusUpdate(EV3_2327, { now: '2026-10-05T23:27:41Z', mergedRows: new Set() })).toEqual([]);
  });

  it('refuses an Auto: row that has merged (Out of beta carried five)', () => {
    const errs = validateStatusUpdate(OOB_1233, { now: '2026-10-05T12:33:18Z', mergedRows: OOB_MERGED });
    expect(errs).toEqual([
      'no Queued: line',
      'Auto: names PR-27b, which has merged',
      'Auto: names PR-27c, which has merged',
      'Auto: names PR-28, which has merged',
      'Auto: names PR-39b, which has merged',
      'Auto: names PR-39c, which has merged',
    ]);
  });

  it('refuses a launch line with no session id or branch', () => {
    const bad = EV3_2327.replace(' · session `session_01CWitFkFQJxcGLkLSLicDW2`', '').replace(' · branch `claude/engines-v3-pr23a-10052327`', '');
    expect(validateStatusUpdate(bad, { now: '2026-10-05T23:27:41Z', mergedRows: new Set() })).toEqual([
      'a launch line with no session id: "PR-23a · CUL-1538 · 2026-10-05T23:27:10Z · picked"',
      'a launch line with no branch: "PR-23a · CUL-1538 · 2026-10-05T23:27:10Z · picked"',
    ]);
  });

  it('refuses a timestamp ahead of the clock, but not the check-in', () => {
    expect(validateStatusUpdate(EV3_2327, { now: '2026-10-05T23:20:00Z', mergedRows: new Set() })).toEqual([
      '2026-10-05T23:27:10Z is ahead of the clock (2026-10-05T23:20:00Z)',
    ]);
  });
});

describe('closing lines, written from facts', () => {
  it('reads the check-in from the routines, never from memory', () => {
    const triggers = [
      { prompt: '/dispatch wake · Engines v3 · check-in', nextRunAt: '2026-10-06T00:13:00Z' },
      { prompt: '/dispatch wake · Out of beta · check-in', nextRunAt: '2026-10-05T23:50:00Z' },
      { prompt: '/dispatch wake · Engines v3 · check-in', nextRunAt: '2026-10-05T22:00:00Z' }, // already fired
    ];
    expect(checkInFrom(triggers, 'Engines v3', '2026-10-05T23:27:41Z')).toBe('2026-10-06T00:13:00Z');
    expect(checkInFrom([], 'Engines v3', '2026-10-05T23:27:41Z')).toBeUndefined();
  });

  it('writes all five lines, and a launch line that parses back whole', () => {
    expect(closingLines({ dispatcher: 's1', auto: [], queued: ['31'] })).toEqual([
      'Dispatcher: s1', 'Teach: none', 'Check-in: none', 'Auto: none', 'Queued: PR-31',
    ]);
    const l = { project: 'Engines v3', row: '23a', issue: 'CUL-1538', session: 'session_1', branch: 'claude/engines-v3-pr23a-10052327', at: '2026-10-05T23:27:10Z', how: 'picked' as const };
    expect(parseLaunchLines(launchLine(l))[0]).toMatchObject({ row: '23a', issue: 'CUL-1538', session: 'session_1', branch: l.branch, at: l.at, how: 'picked' });
  });
});

describe('memory against GitHub', () => {
  it('names a launch never recorded and an Auto row that merged', () => {
    const out = memoryCheck({
      slugs: ['out-of-beta', 'out-of-beta-noticed-design-v2-history-v2-the-trial-screen'],
      updates: [OOB_1233],
      branches: [],
      prs: [F.PR_1064],
      mergedRows: new Map([['27b', 1053], ['28', 1054]]),
      now: '2026-10-05T12:35:00Z',
      since: '2026-10-05T12:33:18Z',
    });
    expect(out).toEqual([
      'claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr60-10042110 (#1064, open) has no launch line: a launch never recorded',
      'Auto: still names PR-27b, merged as #1053',
      'Auto: still names PR-28, merged as #1054',
    ]);
  });

  it('agrees when the record and GitHub agree', () => {
    expect(
      memoryCheck({ slugs: ['engines-v3'], updates: [EV3_2327], branches: ['claude/engines-v3-pr23a-10052327'], prs: [], mergedRows: new Map(), now: '2026-10-05T23:40:00Z', since: '2026-10-05T23:27:41Z' }),
    ).toEqual([]);
  });

  it('a launch whose branch never reached the remote is named after two hours', () => {
    const out = memoryCheck({ slugs: ['engines-v3'], updates: [EV3_2327], branches: [], prs: [], mergedRows: new Map(), now: '2026-10-06T02:00:00Z', since: '2026-10-05T23:27:41Z' });
    expect(out).toEqual(['PR-23a\'s branch claude/engines-v3-pr23a-10052327 is not on the remote, 2h after its launch']);
  });
});

describe('the PR-body guard', () => {
  it('breaks every issue id but the ones the PR finishes', () => {
    const text = 'Reply "close CUL-1247" or "add CUL-1608". Ships CUL-1615.';
    expect(issueIdsIn(text)).toEqual(['CUL-1247', 'CUL-1608', 'CUL-1615']);
    const safe = prSafe(text, ['CUL-1615']);
    expect(issueIdsIn(safe)).toEqual(['CUL-1615']);
    expect(safe).toContain('close CUL\u20111247');
  });
});

it('the hand-off is due at ~150K tokens', () => {
  expect(HANDOFF_TOKENS).toBe(150_000);
  expect(handoffDue(HANDOFF_TOKENS - 1)).toBe(false);
  expect(handoffDue(HANDOFF_TOKENS)).toBe(true);
});
