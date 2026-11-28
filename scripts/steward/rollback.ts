// Rollback in one step (CUL-2885): the pure rules. `rollback-cli.ts` beside it reads git
// and the deploy runs and calls these.
//
// WHY A REVERT NEEDS NO TYPED WORD. Wide self merge (CUL-2874) moves the protection from
// before a deploying merge to after it. A revert of one squash commit restores code `main`
// already held and that already deployed, so landing it is not a new production write.
// Two things break that, and both are refused here and go to the PM: a migration (the
// database does not revert with the code), and a later merge that touched the same lines
// (the revert would no longer restore a state main held).
//
// WHY THE CHECK IS THE DEPLOY RUN. The deploy workflow already calls every function it
// deploys: version bumped, ACTIVE, verify_jwt on, a 401 with no JWT, and the function's own
// 4xx with the anon key (scripts/edge-deploy/deploy.ts). That is the smallest check that a
// function still answers. A session cannot reach production itself, and a check that
// cannot run counts as a failure, so a session side call would roll back every deploy.
//
// Stated blind spots:
//  - A run that failed on ANOTHER merge's function reads as this merge failing, and rolls
//    this one back too. Loud, never quiet.
//  - A revert of an older commit, past later merges on OTHER lines, lands a tree main never
//    held. The rollback PR's own CI and the steward skill's `--verify` type check it, as
//    every merge; a later migration is refused outright.
//  - A deploy record left without a terminal status (a run killed mid upload) is not read
//    as a failure, so a revert would not redeploy over it (rare: timing).
//  - A function that answers but answers wrongly passes. The deploy checks see status
//    codes, not content (CUL-2874's 1.2.0 checkpoint exists for this).
//  - The issue writes after a protected rollback (CUL-2910) are printed, not made: a script
//    cannot reach Linear, so the session makes them before the rollback merges. The labels
//    are the session's reading of the named issues; none passed counts as protected.
//
// WHY A PROTECTED ROLLBACK REOPENS ITS ISSUE (CUL-2910, ruled (c) by the PM, 2026-11-28).
// The rollback stays automatic, since its trigger is an outage. But a revert of a PR the
// self merge deny list would hold (clinical, privacy, Live harm) takes a fix off main, and a
// fix that worked on content can trip the status check through another function's failure.
// So each issue the reverted PR named is reopened with Live harm and Waiting on PM and a
// comment naming the rollback: what must not happen is a reverted fix going unseen. And
// the rollback names none of those issues itself: a CUL token in its PR closes the issue on
// merge (CLAUDE.md, CUL-1397), which would undo the reopen.

import { selfMerge } from './selfMerge.ts';

// Any SQL is database facing (scripts/**/*.sql included), and the database does not revert.
export const MIGRATIONS = /^supabase\/migrations\/|\.sql$/;
export const LEDGER = 'scripts/steward/rollbacks.json';
// No deploy run for the merge this long after it counts as a failure: the push trigger
// starts one within seconds, and the job's own timeout is 60 minutes once it starts.
export const NO_RUN_MINUTES = 30;
export const TRAILER = 'Rollback-Of';

export type Commit = {
  sha: string;
  subject: string;
  body: string;
  parents: number;
  files: string[];
  // The revert, applied to today's main: null when it conflicts.
  revertTree: string | null;
  mainTree: string;
  // Database facing files any later commit on main's first parent line touched.
  laterMigrations: string[];
};

/** Why a commit may not be rolled back without the PM, or null when it may. */
export function refusal(c: Commit): string | null {
  if (c.parents !== 1) return `${c.sha.slice(0, 7)} is not a squash commit (${c.parents} parents); a rollback reverts one squash merge`;
  const migrations = c.files.filter((f) => MIGRATIONS.test(f));
  if (migrations.length) return `it carried a migration (${migrations.join(', ')}); the database does not roll back with the code, so this goes to the PM`;
  if (/^(Rollback #|Revert ")/.test(c.subject) || new RegExp(`^${TRAILER}:`, 'm').test(c.body)) {
    return 'it is itself a rollback or a revert; undoing it re-lands code that was taken out, so this goes to the PM';
  }
  if (c.laterMigrations.length) return `a later merge carried a migration (${c.laterMigrations.join(', ')}); old code over a newer schema goes to the PM`;
  if (c.revertTree === null) return 'a later merge touched the same lines, so the revert no longer restores a state main held; this goes to the PM';
  if (c.revertTree === c.mainTree) return 'main no longer holds any of its change (already rolled back?)';
  return null;
}

export type Run = {
  head_sha?: unknown;
  event?: unknown;
  status?: unknown;
  conclusion?: unknown;
  created_at?: unknown;
  html_url?: unknown;
};
export type Verdict = { verdict: 'PASS' | 'WAIT' | 'FAIL'; why: string };

/**
 * Did the deploy run for a merge pass? `contains(sha)` says whether a commit holds the
 * merge (a later run deploys everything owed at its commit, so it covers a queued run it
 * replaced). Anything that is neither a pass nor still running is a failure.
 */
export function deployVerdict(
  runs: Run[],
  mergeSha: string,
  contains: (sha: string) => boolean,
  mergedAt: Date,
  now: Date,
): Verdict {
  const pushes = runs.filter((r) => r.event === 'push' && typeof r.head_sha === 'string');
  const own = pushes.filter((r) => r.head_sha === mergeSha);
  const later = pushes.filter((r) => r.head_sha !== mergeSha && contains(r.head_sha as string));
  const url = (r: Run) => (typeof r.html_url === 'string' ? r.html_url : 'the run');
  const settled = (r: Run) => r.status === 'completed' && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped';
  const byAge = (a: Run, b: Run) => String(a.created_at).localeCompare(String(b.created_at));

  for (const group of [own, later]) {
    const done = group.filter(settled).sort(byAge)[0];
    if (done) {
      return done.conclusion === 'success'
        ? { verdict: 'PASS', why: `the deploy run passed its checks (${url(done)})` }
        : { verdict: 'FAIL', why: `the deploy run ended ${String(done.conclusion)} (${url(done)})` };
    }
    if (group.some((r) => r.status !== 'completed')) return { verdict: 'WAIT', why: 'the deploy run is still going' };
  }
  const minutes = (now.getTime() - mergedAt.getTime()) / 60_000;
  if (minutes >= NO_RUN_MINUTES) {
    return { verdict: 'FAIL', why: `no deploy run settled for ${mergeSha.slice(0, 7)} within ${NO_RUN_MINUTES} minutes; a check that cannot run counts as a failure` };
  }
  return { verdict: 'WAIT', why: 'no settled deploy run yet' };
}

export type LedgerEntry = { pr: number; sha: string; subject: string; files: string[]; why: string; date: string };

/** The one line for the weekly digest. */
export const digestLine = (e: LedgerEntry) => `rollback · #${e.pr} ${e.subject} · ${e.why} · ${e.date}`;

/** Ledger problems; the ledger is the fixture list the self merge gate's tests read (CUL-2874). */
export function ledgerProblems(raw: unknown): string[] {
  const list = (raw as { rollbacks?: unknown })?.rollbacks;
  if (!Array.isArray(list)) return ['rollbacks.json has no `rollbacks` array'];
  return list.flatMap((e: Partial<LedgerEntry>, i) => {
    const bad =
      !Number.isInteger(e.pr) ||
      typeof e.sha !== 'string' ||
      !/^[0-9a-f]{40}$/.test(e.sha) ||
      typeof e.subject !== 'string' ||
      !Array.isArray(e.files) ||
      typeof e.why !== 'string' ||
      !e.why.trim() ||
      typeof e.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date);
    return bad ? [`rollbacks[${i}] is malformed: ${JSON.stringify(e)}`] : [];
  });
}

/** A landing's ledger must be main's plus exactly one well formed entry for this rollback. */
export function ledgerAddsOne(base: unknown, landed: unknown, sha: string): string | null {
  const problems = ledgerProblems(landed);
  if (problems.length) return problems.join('; ');
  const before = ((base as { rollbacks?: unknown[] })?.rollbacks ?? []) as unknown[];
  const after = (landed as { rollbacks: LedgerEntry[] }).rollbacks;
  if (after.length !== before.length + 1) return `the ledger gains ${after.length - before.length} entries, not one`;
  if (JSON.stringify(after.slice(0, before.length)) !== JSON.stringify(before)) return "the ledger rewrites main's entries";
  if (after[after.length - 1].sha !== sha) return `the ledger's new entry names ${after[after.length - 1].sha.slice(0, 7)}, not ${sha.slice(0, 7)}`;
  return null;
}

// ---- a protected rollback reopens its issues (CUL-2910) ------------------------------
const ISSUE = /\bCUL-\d+\b/gi;

/** Every issue the reverted squash commit names: its title and body are its PR's. */
export function namedIssues(subject: string, body: string): string[] {
  const ids = new Set(`${subject}\n${body}`.match(ISSUE)?.map((t) => t.toUpperCase()) ?? []);
  return [...ids].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

/** Text with no issue token left in it, for the rollback's own commit, ledger and PR. */
export function withoutIssues(text: string): string {
  return text
    .replace(/\s*\((?:[\s,;&]|and|CUL-\d+)*\)/gi, (m) => (/CUL-\d+/i.test(m) ? '' : m))
    .replace(ISSUE, 'its issue');
}

/** Why the deny list would hold the reverted PR, or [] when it is unprotected. */
export function protection(c: Commit, labels: string[] | null, changedLines: { file: string; line: string }[] = []): string[] {
  return selfMerge({ files: c.files, deploys: [], changedLines, labels }).reasons;
}

export const REOPEN_STATE = 'Todo';
export const REOPEN_LABELS = ['Live harm', 'Waiting on PM'];
export type IssueWrite = { issue: string | null; state: string; addLabels: string[]; comment: string };

/** The Linear writes a protected rollback owes, one per named issue (a new issue if none). */
export function issueWrites(r: { pr: number; sha: string; subject: string; why: string; date: string; issues: string[]; reasons: string[] }): IssueWrite[] {
  if (!r.reasons.length) return [];
  const shown = r.reasons.slice(0, 3).join('; ') + (r.reasons.length > 3 ? `; and ${r.reasons.length - 3} more` : '');
  const comment =
    `**Reopened by a rollback** of #${r.pr} (\`${r.sha.slice(0, 7)}\`, ${withoutIssues(r.subject)}) on ${r.date}: ${withoutIssues(r.why)}. ` +
    `The fix this issue names is off main until a new PR lands it again. Protected because: ${shown}. (CUL-2910)`;
  const issues = r.issues.length ? r.issues : [null];
  return issues.map((issue) => ({ issue, state: REOPEN_STATE, addLabels: [...REOPEN_LABELS], comment }));
}

/** The lines `apply` prints: the required step, or that there is none. */
export function writeLines(writes: IssueWrite[], pr: number): string[] {
  if (!writes.length) return ['unprotected: the deny list would not hold the reverted PR; no issue writes'];
  return [
    'REQUIRED before the rollback merges: make these Linear writes with your Linear tools (CUL-2910)',
    ...writes.flatMap((w) =>
      w.issue
        ? [`  save_issue ${w.issue}: state ${w.state}, addLabels ${JSON.stringify(w.addLabels)}`, `  save_comment ${w.issue}: ${w.comment}`]
        : [`  save_issue new (team Culprit, #${pr} named no issue): title "A rollback took a protected fix off main (#${pr})", state ${w.state}, labels ${JSON.stringify(w.addLabels)}, description: ${w.comment}`],
    ),
    "  the rollback's PR title and body name none of these issues: a CUL token there closes them on merge",
  ];
}
