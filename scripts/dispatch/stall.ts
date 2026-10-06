// A child whose PR is green and mergeable while its session sits idle (CUL-1623). Pure.
//
// WHY. #1084's child opened its PR at 17:26:55Z and was subscribed to it. The first check
// suite to finish (migration-numbers, 17:28:11Z) woke it; it saw CI still queued, ended its
// turn saying "CI's result will wake this session", and the main suite's green at 17:37:37Z
// never woke it. A turn that ends mid-CI is neither a stop nor a last act, so it sent the
// dispatcher nothing, and the PR sat green for 76 minutes until the 90-minute check-in found
// it. A subscription is one wake path, not a guarantee; this module is the other one: the
// dispatcher reads the facts and sends the stalled child a facts-only note.

import type { Launch, PrFact, SessionBucket } from './plan.ts';

// The checks the `main` ruleset requires (CLAUDE.md § Git Workflow → Rules). A required
// check that has not REPORTED is pending, never green: at 17:28:11Z #1084's check runs held
// only migration-numbers, all of it passed, and "every check passed" was true of the list
// and false of the PR.
export const REQUIRED_CHECKS = ['App (typecheck + jest)', 'Edge Functions (deno test)'] as const;

// Minutes a green PR waits before it counts as stalled, so a subscription wake already on
// its way is not raced by a note.
export const STALL_GRACE_MIN = 10;

// How far out the dispatcher arms its check-in while a child idles on running checks (or
// sends `stopped: waiting on CI`): the repo's CI takes about ten minutes, so 90 would leave
// a green PR waiting the whole gap #1084 waited.
export const CI_WAIT_CHECK_IN_MIN = 20;

export type CheckRun = { name: string; status: string; conclusion?: string | null; completed_at?: string | null };
export type Checks = { state: 'pending' | 'success' | 'failure'; doneAt?: string };

const PASS = new Set(['success', 'neutral', 'skipped']);

// One reading of a head commit's check runs (`pull_request_read` → `get_check_runs`).
export function checksOf(runs: CheckRun[], required: readonly string[] = REQUIRED_CHECKS): Checks {
  if (runs.some((r) => r.status === 'completed' && r.conclusion && !PASS.has(r.conclusion))) return { state: 'failure' };
  const names = new Set(runs.map((r) => r.name));
  if (required.some((n) => !names.has(n))) return { state: 'pending' };
  // Green is dated by the LAST completion, parsed, never lexical (C-40). A run with no
  // readable completion time (queued, running, or a bad stamp) is pending: the PR is not
  // done, and the grace below could not be measured from it.
  const times = runs.map((r) => (r.completed_at ? new Date(r.completed_at).getTime() : NaN));
  if (times.some((t) => Number.isNaN(t))) return { state: 'pending' };
  return { state: 'success', doneAt: new Date(Math.max(...times)).toISOString().replace('.000Z', 'Z') };
}

// What a child sent the dispatcher, read from the dispatcher's own transcript.
export type Wake = { session: string; kind: 'stopped' | 'merged' | 'done'; reason?: string; at: string };
// A note the dispatcher already sent, so one head commit is noted once.
export type Note = { session: string; sha: string; at: string };

export type ChildPr = PrFact & { headSha?: string; checks?: Checks };

export type StallInput = {
  now: string;
  alias: string;
  launches: Launch[];
  prs: ChildPr[];
  sessions: Record<string, SessionBucket>;
  parked: number[]; // PR numbers the plan parked: a merge gate or a migration holds them, and they have their own note
  wakes: Wake[]; // required: an unread wake list would make every waiting child look unheld
  notes: Note[];
};

export type Stall = {
  row: string; // `PR-23a`, or the issue id for a `--row` launch
  session: string;
  pr: number;
  kind: 'stalled' | 'ci-wait'; // stalled → send the note; ci-wait → idle while checks run, keep a check-in near
  note?: string; // the facts-only text, absent when this head was already noted
  notedAt?: string;
};

const IDLE: SessionBucket[] = ['review_ready', 'blocked', 'completed'];
// The exact reason the prompt fixes; a PM-waiting reason that merely mentions CI holds.
export const CI_WAIT = /^waiting on CI\.?$/i;
const ms = (t: string) => new Date(t).getTime();

// The child's own word decides whether the dispatcher may touch it: a terminal wake ends it;
// a stop holds it unless the stop is a CI wait, or the branch moved after the stop (the PM
// answered and the child built on, so the stop it already spent is over).
function heldByWake(session: string, pr: ChildPr, wakes: Wake[]): boolean {
  const own = wakes.filter((w) => w.session === session).sort((a, b) => ms(b.at) - ms(a.at));
  const last = own[0];
  if (!last) return false;
  if (last.kind !== 'stopped') return true;
  if (CI_WAIT.test((last.reason ?? '').trim())) return false;
  return !(pr.lastCommitAt && ms(pr.lastCommitAt) > ms(last.at));
}

export function rowLabel(l: Pick<Launch, 'row'>): string {
  return /^CUL-\d+$/.test(l.row) ? l.row : `PR-${l.row}`;
}

// Facts only (§ Authority): what GitHub and the session list say, never a word of approval.
export function noteText(alias: string, row: string, pr: ChildPr): string {
  const sha = pr.headSha ? ` at ${pr.headSha.slice(0, 7)}` : '';
  return [
    `/dispatch note · ${alias} · ${row} · #${pr.number}${sha}: every check passed (the last at ${pr.checks?.doneAt ?? 'unknown'}), GitHub reports it mergeable, and this session is idle.`,
    'This note is a fact, not an approval; your prompt\'s conditions still decide what you do next.',
  ].join('\n');
}

export function findStalls(input: StallInput): Stall[] {
  const now = ms(input.now);
  const out: Stall[] = [];
  const seen = new Set<string>();
  const launches = input.launches.filter((l) => l.project === input.alias && l.session && l.branch).sort((a, b) => ms(b.at) - ms(a.at));
  for (const l of launches) {
    const session = l.session!;
    if (seen.has(session)) continue;
    seen.add(session);
    const pr = input.prs.find((p) => p.state === 'open' && p.headRef === l.branch);
    if (!pr || input.parked.includes(pr.number)) continue;
    if (!IDLE.includes(input.sessions[session] ?? 'gone')) continue;
    if (heldByWake(session, pr, input.wakes)) continue;
    const row = rowLabel(l);
    if (pr.checks?.state === 'pending') {
      out.push({ row, session, pr: pr.number, kind: 'ci-wait' });
      continue;
    }
    // No head sha read → no once-per-head record, so nothing is sent (it would re-send every run).
    if (pr.checks?.state !== 'success' || pr.mergeable !== true || !pr.checks.doneAt || !pr.headSha) continue;
    if (now - ms(pr.checks.doneAt) < STALL_GRACE_MIN * 60_000) continue;
    const noted = input.notes.find((n) => n.session === session && n.sha === pr.headSha);
    out.push({ row, session, pr: pr.number, kind: 'stalled', ...(noted ? { notedAt: noted.at } : { note: noteText(input.alias, row, pr) }) });
  }
  return out;
}
