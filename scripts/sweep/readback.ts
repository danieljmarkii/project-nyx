// /sweep's step 0 (CUL-2700): read back the last batch before ranking a new one. Pure;
// the I/O shell is cli.ts.
//
// WHY. Sweep 1 (2026-11-09) kept its launching session alive as a dispatcher, and that
// session cost $20 relaying messages while two green PRs sat unseen. A sweep batch has no
// chain (no row waits on another), so v1.1 archives the sweep session after launch, and
// the NEXT sweep is the only reader of the last batch. This is that reader: what merged,
// what waits on the PM, what is still running, what died (and the claim to release), the
// files still held, and the metrics line, measured from GitHub rather than remembered.
//
// It reads the batch from the newest `**/dispatch run**` update that carries launch lines,
// in dispatch's grammar (status.ts parseLaunchLines), so a later `/dispatch Loose ends`
// reads the same memory.
//
// STATED BLIND SPOTS (C-38):
//   - A PR is matched to a row by its head branch only. A child that worked on another
//     branch (it supersedes the claim, per its prompt) reads as died until the PM matches it.
//   - Issues a merge closed that were not the row's are the child's read-back, not this.
//   - A running row with no PR holds only the files its build note names.
//   - Row numbers count from the updates it is given; pass every `**/dispatch run**`
//     update, or a pruned row's number can come back (page.ts reads two digits: 01 to 99).

import { parseLaunchLines } from '../dispatch/status.ts';
import { metricsLine, type InFlight } from './rank.ts';

export type Bucket = 'working' | 'blocked' | 'review_ready' | 'completed' | 'failed' | 'gone';

export type PrRead = {
  number: number;
  branch: string;
  open: boolean;
  merged: boolean;
  mergedAt?: string;
  files: string[];
  checksGreen?: boolean; // every check run on the head completed and passed
  production?: boolean; // merge-check printed `production:` (it deploys or edits the gate)
};

export type ReadbackInput = {
  now: string;
  updates: string[]; // the project's `**/dispatch run**` bodies, newest first
  page: string; // the Loose ends page description, tags stripped
  prs: PrRead[];
  sessions: Record<string, Bucket>; // get_session status_bucket by session id; absent = gone
  claims: Record<string, string>; // issue → its newest `**Claimed**` or `**Released**` comment
};

export type Outcome = 'merged' | 'waiting on you' | 'running' | 'died';

export type RowRead = { row: string; issue: string; session?: string; branch?: string; pr?: number; outcome: Outcome; detail: string };

export type Readback = {
  rows: RowRead[];
  needsYou: string[];
  releases: { issue: string; comment: string }[];
  inFlight: InFlight[];
  waitingOnPm: number;
  prune: string[];
  nextRow: number;
  metrics: string;
};

export const PRUNE_AFTER_DAYS = 7;
const HOUR = 3_600_000;

// The page's table rows (`| 07 | CUL-… | … |`) and each build note's `Files:` list.
function pageFacts(page: string): { rows: string[]; files: Record<string, string[]> } {
  const rows = [...page.matchAll(/^\|\s*(\d{2})\s*\|/gm)].map((m) => m[1]);
  const files: Record<string, string[]> = {};
  for (const m of page.matchAll(/\*\*PR-(\d{2}):\*\*.*?\bFiles: (.*?)\. Team:/g)) {
    files[m[1]] = m[2].startsWith('none') ? [] : m[2].split(',').map((f) => f.trim()).filter(Boolean);
  }
  return { rows, files };
}

export function readBack(input: ReadbackInput): Readback {
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) throw new Error('readback refused: `now` is not a time (take it from date -u)');
  const body = input.updates.find((u) => parseLaunchLines(u).length > 0);
  const launches = body ? parseLaunchLines(body) : [];
  const { rows: pageRowIds, files: noteFiles } = pageFacts(input.page);

  const rows: RowRead[] = [];
  const needsYou: string[] = [];
  const releases: Readback['releases'] = [];
  const inFlight: InFlight[] = [];
  const hours: number[] = [];

  for (const l of launches) {
    const row = l.row;
    const issue = l.issue ?? '?';
    const pr = l.branch ? input.prs.find((p) => p.branch === l.branch) : undefined;
    const bucket: Bucket = (l.session && input.sessions[l.session]) || 'gone';
    const base = { row, issue, session: l.session, branch: l.branch, pr: pr?.number };

    if (pr?.merged) {
      rows.push({ ...base, outcome: 'merged', detail: `#${pr.number}` });
      if (pr.mergedAt && l.at) hours.push((Date.parse(pr.mergedAt) - Date.parse(l.at)) / HOUR);
      continue;
    }
    if (pr?.open) {
      inFlight.push({ holder: `#${pr.number} (PR-${row})`, files: pr.files });
      if (bucket === 'working') { rows.push({ ...base, outcome: 'running', detail: `#${pr.number} open, session working` }); continue; }
      const what = pr.checksGreen
        ? `merge #${pr.number}${pr.production ? ' (it deploys: type merge in its session)' : ' (green; its session stopped short of merging)'}`
        : `#${pr.number} is not green: open its session`;
      rows.push({ ...base, outcome: 'waiting on you', detail: what });
      needsYou.push(`PR-${row} · ${issue} · ${what}`);
      continue;
    }
    // No PR (or a closed, unmerged one).
    if (bucket === 'working') {
      inFlight.push({ holder: `PR-${row} (running)`, files: noteFiles[row] ?? [] });
      rows.push({ ...base, outcome: 'running', detail: 'no PR yet, session working' });
      continue;
    }
    if (bucket === 'blocked' || bucket === 'review_ready') {
      inFlight.push({ holder: `PR-${row} (waiting)`, files: noteFiles[row] ?? [] });
      rows.push({ ...base, outcome: 'waiting on you', detail: 'no PR: its plan or brief waits for your go in its session' });
      needsYou.push(`PR-${row} · ${issue} · your go, typed in its session`);
      continue;
    }
    rows.push({ ...base, outcome: 'died', detail: `session ${bucket}, no PR${pr ? ` (#${pr.number} closed unmerged)` : ''}` });
    // Release only this launch's own claim, and only once (dispatch step 0's rule).
    const claim = input.claims[issue] ?? '';
    if (l.branch && claim.startsWith('**Claimed**') && claim.includes(l.branch)) {
      releases.push({ issue, comment: `**Released** — sweep session ${l.session ?? '?'} ended without a PR, ${input.now}` });
    }
  }

  // Merged rows leave the page a week after their merge, so the table stays a working list.
  const prune = launches
    .filter((l) => {
      const pr = l.branch ? input.prs.find((p) => p.branch === l.branch) : undefined;
      return pr?.merged && pr.mergedAt && nowMs - Date.parse(pr.mergedAt) > PRUNE_AFTER_DAYS * 24 * HOUR && pageRowIds.includes(l.row);
    })
    .map((l) => l.row);

  // A row number is never reused: dispatch matches a PR to a row by the `PR-NN` in its
  // title, so a new PR-01 would read as the old, merged one. Count every row any update
  // launched, not only the rows still on the page.
  const everRow = [...pageRowIds, ...input.updates.flatMap((u) => parseLaunchLines(u).map((x) => x.row))]
    .map(Number)
    .filter((x) => Number.isInteger(x));
  const nextRow = everRow.length ? Math.max(...everRow) + 1 : 1;

  return {
    rows,
    needsYou,
    releases,
    inFlight,
    waitingOnPm: rows.filter((r) => r.outcome === 'waiting on you').length,
    prune,
    nextRow,
    metrics: metricsLine({
      launched: launches.length,
      merged: rows.filter((r) => r.outcome === 'merged').length,
      abandoned: rows.filter((r) => r.outcome === 'died').length,
      launchToMergeHours: hours,
    }),
  };
}
