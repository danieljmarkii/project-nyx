// The workflow audit on 2026-10-06, read at 23:56:39Z (`date -u`) from Linear (the project's
// issues and its `/dispatch run` updates) and GitHub (#1079 to #1085). Every id, branch,
// session and time below was read, not composed; the one exception says so.
//
// The project has no run-order table: its dispatch runs are `--row` launches, so the
// progress update counts its issues (progress.ts, unitsFromIssues).

import type { Launch, PrFact } from '../plan.ts';
import type { ProjectIssue, Wake } from '../progress.ts';

export const NOW = '2026-10-06T23:56:39Z';
export const ALIAS = 'The workflow audit';
// Free repo-wide slots, from the dispatcher's 23:53:45Z update: "these three plus the two
// hand-launched claims (Engines v3 PR-23c, Out of beta CUL-1560) = 5" under the cap of 6.
export const FREE_SLOTS = 1;
export const INDEX = undefined; // the project has no `/dispatch:` index issue

const B = 'claude/the-workflow-audit-adhoc-';
const launch = (row: string, session: string, branch: string, at: string, how: Launch['how']): Launch => ({ project: ALIAS, row, issue: row, session, branch: B + branch, at, how });

export const LAUNCHES: Launch[] = [
  launch('CUL-1522', 'session_01DamPwaDyj9U4eTRUTUeMqb', '10061235-a1', '2026-10-06T12:36:26Z', 'adhoc'),
  launch('CUL-1613', 'session_01MYpBycCC4e8rTTcb4TkpCo', '10061235-a2', '2026-10-06T12:37:35Z', 'adhoc'),
  launch('CUL-1616', 'session_016DX44CxMbeQaTVgzdTPSrv', '10061235-d', '2026-10-06T12:37:36Z', 'adhoc'),
  launch('CUL-1617', 'session_01S8zV6aHPd2uib6R6MBmnja', '10061235-e', '2026-10-06T12:37:38Z', 'adhoc'),
  launch('CUL-1614', 'session_016saJL1UczYq8nKJVyHyqXt', '10061327-b', '2026-10-06T13:28:32Z', 'adhoc'),
  launch('CUL-1615', 'session_019iMnj4XN8aBhkC4v8okX5w', '10061403-c', '2026-10-06T14:04:17Z', 'queued'),
  // One launch line for both issues ("CUL-1621 + CUL-1622"); split here so each finds its PR.
  launch('CUL-1621', 'session_015zVuzkVGS4bC3b5aSjBQi8', '10061721', '2026-10-06T17:21:44Z', 'picked'),
  launch('CUL-1622', 'session_015zVuzkVGS4bC3b5aSjBQi8', '10061721', '2026-10-06T17:21:44Z', 'picked'),
  launch('CUL-1623', 'session_012CaymrVAbf77NShbkxq3Go', '10062332', '2026-10-06T23:32:48Z', 'picked'),
  launch('CUL-1624', 'session_018v3bUXvmBr1sJCJ4UDmdV3', '10062351', '2026-10-06T23:52:23Z', 'picked'),
  launch('CUL-1517', 'session_014d1N9nfkkJ8tLaJWfaVuzw', '10062353', '2026-10-06T23:53:36Z', 'picked'),
];

const merged = (number: number, branch: string, createdAt: string, mergedAt: string): PrFact => ({ number, title: '', state: 'merged', headRef: B + branch, createdAt, mergedAt });
export const PRS: PrFact[] = [
  merged(1079, '10061235-e', '2026-10-06T12:46:00Z', '2026-10-06T13:41:01Z'),
  merged(1080, '10061235-a2', '2026-10-06T12:47:47Z', '2026-10-06T13:01:19Z'),
  merged(1081, '10061235-a1', '2026-10-06T13:00:23Z', '2026-10-06T13:25:37Z'),
  merged(1082, '10061327-b', '2026-10-06T13:36:32Z', '2026-10-06T14:00:30Z'),
  merged(1083, '10061403-c', '2026-10-06T14:47:00Z', '2026-10-06T14:59:12Z'),
  merged(1084, '10061721', '2026-10-06T17:26:55Z', '2026-10-06T18:54:11Z'),
  { number: 1085, title: 'The workflow audit: a dispatched child wakes when its CI finishes', state: 'open', headRef: B + '10062332', createdAt: '2026-10-06T23:43:06Z', draft: true },
];

// CUL-1616's stop. The dispatcher's update of 12:54:20Z reports it; the wake's own time is
// not on record, so this is the update's time (an upper bound, the one composed-from-a-read
// time in this file).
export const WAKES: Wake[] = [{ session: 'session_016DX44CxMbeQaTVgzdTPSrv', kind: 'stopped', reason: 'Auto mode blocks hook edits', at: '2026-10-06T12:54:20Z' }];

const W = (id: string, stateType: string, milestone: string | null, extra: Partial<ProjectIssue> = {}): ProjectIssue => ({ id, stateType, milestone, ...extra });
const PM = { labels: ['Waiting on PM'] };
export const ISSUES: ProjectIssue[] = [
  W('CUL-919', 'completed', 'W-A · The free wins'),
  W('CUL-920', 'completed', 'W-A · The free wins'),
  W('CUL-921', 'completed', 'W-A · The free wins'),
  W('CUL-922', 'completed', 'W-B · The boundary'),
  W('CUL-926', 'unstarted', 'W-B · The boundary'),
  W('CUL-923', 'canceled', 'W-C · The queue'),
  W('CUL-924', 'started', 'W-C · The queue'),
  W('CUL-925', 'unstarted', 'W-D · What always runs'),
  W('CUL-928', 'unstarted', 'W-E · Automation'),
  W('CUL-927', 'unstarted', 'W-E · Automation'),
  W('CUL-1623', 'started', null),
  W('CUL-1517', 'backlog', null, { parentId: 'CUL-1612' }),
  W('CUL-1624', 'started', null),
  W('CUL-1397', 'completed', null),
  W('CUL-1616', 'started', null, { ...PM, parentId: 'CUL-1612' }),
  W('CUL-1366', 'unstarted', null),
  W('CUL-1606', 'completed', null),
  W('CUL-1615', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1546', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1621', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1622', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1612', 'started', null),
  W('CUL-1614', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1617', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1620', 'unstarted', null),
  W('CUL-1522', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1619', 'unstarted', null),
  W('CUL-1613', 'completed', null, { parentId: 'CUL-1612' }),
  W('CUL-1409', 'completed', null),
  W('CUL-1503', 'completed', null),
  W('CUL-1504', 'completed', null),
  W('CUL-1507', 'completed', null),
  W('CUL-1505', 'completed', null),
  W('CUL-1506', 'completed', null),
  W('CUL-1497', 'completed', null),
  W('CUL-1466', 'completed', null, { parentId: 'CUL-1366' }),
  W('CUL-1453', 'duplicate', null),
  W('CUL-1448', 'completed', null),
  W('CUL-973', 'completed', null),
  W('CUL-1053', 'unstarted', null),
  W('CUL-1284', 'completed', null),
  W('CUL-955', 'unstarted', null, PM),
];

// The newest update's Queued line (23:53:45Z): "Queued: none".
export const QUEUED: string[] = [];
// What the next merges free, from the launch updates (23:52:30Z, 23:53:45Z): CUL-1624 may
// merge once #1085 (CUL-1623) has; CUL-1517 once CUL-1623 and CUL-1624 have.
export const MERGE_GATED = [
  { id: 'CUL-1624', on: 'CUL-1623 merging (its merge gate)' },
  { id: 'CUL-1517', on: 'CUL-1623 + CUL-1624 merging (its merge gate)' },
];
