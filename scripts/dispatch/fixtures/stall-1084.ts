// #1084's stall on 2026-10-06, read back from GitHub (check runs, commits, the PR), the
// workflow audit's `/dispatch run` updates and the child's transcript
// (session_015zVuzkVGS4bC3b5aSjBQi8). Every time below was read, not composed.
//
//   17:21:44Z  launched (adhoc, CUL-1621 + CUL-1622)
//   17:26:55Z  #1084 opened; 17:27:21Z the second commit (443a08b) cancels the first's CI
//   17:28:11Z  migration-numbers passes: the only check run on the PR; it wakes the child
//   17:28:37Z  the child ends its turn: "CI's result will wake this session" (no stop sent)
//   17:37:37Z  the last required check passes; nothing wakes the child
//   18:53Z     the dispatcher's 90-minute check-in finds it; a /dispatch note wakes it
//   18:54:11Z  merged

import type { Launch } from '../plan.ts';
import type { CheckRun, ChildPr } from '../stall.ts';

export const ALIAS = 'The workflow audit';
export const SESSION = 'session_015zVuzkVGS4bC3b5aSjBQi8';
export const HEAD = '443a08b8d13a7330a7957786ef0aa85c9766be11';

export const LAUNCH: Launch = {
  project: ALIAS,
  row: 'CUL-1621',
  issue: 'CUL-1621',
  session: SESSION,
  branch: 'claude/the-workflow-audit-adhoc-10061721',
  at: '2026-10-06T17:21:44Z',
  how: 'picked',
};

const run = (name: string, completed_at: string | null): CheckRun => ({
  name,
  status: completed_at ? 'completed' : 'queued',
  conclusion: completed_at ? 'success' : null,
  completed_at,
});

// What the child saw when it ended its turn: one check run, passed.
export const RUNS_AT_1728: CheckRun[] = [run('migration-numbers', '2026-10-06T17:28:11Z')];

// The head's four check runs as GitHub holds them now.
export const RUNS_FINAL: CheckRun[] = [
  run('App (typecheck + jest)', '2026-10-06T17:32:05Z'),
  run('App (jest, non-UTC timezones)', '2026-10-06T17:37:37Z'),
  run('Edge Functions (deno test)', '2026-10-06T17:30:39Z'),
  run('migration-numbers', '2026-10-06T17:28:11Z'),
];

export const pr1084 = (checks: ChildPr['checks']): ChildPr => ({
  number: 1084,
  title: 'The workflow audit: a gate is a relation in the issue contract, and the digest Board by default (CUL-1621, CUL-1622)',
  state: 'open',
  headRef: LAUNCH.branch!,
  headSha: HEAD,
  createdAt: '2026-10-06T17:26:55Z',
  lastCommitAt: '2026-10-06T17:27:21Z',
  mergeable: true,
  draft: false,
  checks,
});
