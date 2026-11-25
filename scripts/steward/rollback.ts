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
//  - A function that answers but answers wrongly passes. The deploy checks see status
//    codes, not content (CUL-2874's 1.2.0 checkpoint exists for this).

export const MIGRATIONS = /^supabase\/migrations\//;
export const LEDGER = 'scripts/steward/rollbacks.json';
// No deploy run for the merge this long after it counts as a failure: the push trigger
// starts one within seconds, and the job's own timeout is 60 minutes once it starts.
export const NO_RUN_MINUTES = 30;
export const TRAILER = 'Rollback-Of';

export type Commit = {
  sha: string;
  subject: string;
  parents: number;
  files: string[];
  // The revert, applied to today's main: null when it conflicts.
  revertTree: string | null;
  mainTree: string;
};

/** Why a commit may not be rolled back without the PM, or null when it may. */
export function refusal(c: Commit): string | null {
  if (c.parents !== 1) return `${c.sha.slice(0, 7)} is not a squash commit (${c.parents} parents); a rollback reverts one squash merge`;
  const migrations = c.files.filter((f) => MIGRATIONS.test(f));
  if (migrations.length) return `it carried a migration (${migrations.join(', ')}); the database does not roll back with the code, so this goes to the PM`;
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
