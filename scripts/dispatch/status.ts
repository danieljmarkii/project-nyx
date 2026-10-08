// The dispatcher's memory: its `**/dispatch run**` status updates (CUL-1615, scope items
// 1, 3, 4 and 5). Writes the closing lines from facts, refuses an update that would lie,
// and compares what the updates remember with what GitHub says. Pure.
//
// WHY. The retro (CUL-1606 F2) found the memory drifting in a dispatcher that never
// compacted: merged rows carried on `Auto:` (Out of beta's carried five merged rows for a
// day), six launches recorded with no session id, 49 composed timestamps in the future.
// Each of those is a line this module either writes from a fact or refuses.

import { normRow } from './page.ts';
import type { Launch, PrFact } from './plan.ts';

// 150K, not 400K: every wake re-reads the whole context, and a check-in often lands past
// the cache window, so the late wakes cost the most. The status updates are the memory, so
// an earlier hand-off loses nothing (PM, 2026-10-08).
export const HANDOFF_TOKENS = 150_000;

export type LaunchLine = { row: string; issue?: string; session?: string; branch?: string; at?: string; how?: string; raw: string };

const ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z\b/g;
const strip = (s: string) => s.replace(/`/g, '').replace(/^\s*[*-]\s+/, '').trim();

// `PR-23a · CUL-1538 · session session_… · branch claude/… · 2026-10-05T23:27:10Z · picked`
// (`adhoc` or a `CUL-NNN` stands in for `PR-NN` on a `--row` launch).
export function parseLaunchLines(text: string): LaunchLine[] {
  const out: LaunchLine[] = [];
  for (const raw of text.split('\n')) {
    const l = strip(raw);
    const m = /^(PR-[\w]+|adhoc|CUL-\d+) · (CUL-\d+)\b(.*)$/.exec(l);
    if (!m) continue;
    const rest = m[3];
    out.push({
      row: m[1].startsWith('PR-') ? normRow(m[1].slice(3)) : m[1],
      issue: m[2],
      session: /\bsession (session_\w+)/.exec(rest)?.[1],
      branch: /\bbranch (claude\/\S+?)(?=\s|$| ·)/.exec(rest)?.[1],
      at: rest.match(ISO)?.[0],
      how: /\b(picked|queued|auto|adhoc)\s*$/.exec(rest)?.[1],
      raw,
    });
  }
  return out;
}

export function closingLine(text: string, key: string): string | undefined {
  return new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(text)?.[1]?.trim();
}

export function rowsOf(line?: string): string[] {
  if (!line || /^none\b/i.test(line)) return [];
  return [...line.matchAll(/\bPR-(\d{2}[a-z]?)\b/g)].map((m) => normRow(m[1]));
}

// The `Check-in:` time, read from the routines list, never remembered: the earliest
// future routine whose message is this project's check-in wake.
export type Trigger = { prompt?: string; message?: string; nextRunAt?: string | null; enabled?: boolean };
export function checkInFrom(triggers: Trigger[], alias: string, now: string): string | undefined {
  const t = triggers
    .filter((x) => x.enabled !== false && x.nextRunAt && new Date(x.nextRunAt).getTime() > new Date(now).getTime())
    .filter((x) => (x.prompt ?? x.message ?? '').startsWith(`/dispatch wake · ${alias} · check-in`))
    .map((x) => x.nextRunAt!)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime()); // never lexical (C-40)
  return t[0];
}

export type Closing = {
  dispatcher: string;
  teach?: string; // a row id, or none
  checkIn?: string; // from checkInFrom
  auto: string[]; // confirmed rows, merged ones already dropped
  queued: string[];
  successor?: string; // hand-off: the fresh dispatcher's session id
};

export function closingLines(c: Closing): string[] {
  const rows = (xs: string[]) => (xs.length ? xs.map((r) => `PR-${r}`).join(', ') : 'none');
  return [
    `Dispatcher: ${c.dispatcher}`,
    ...(c.successor ? [`Successor: ${c.successor}`] : []),
    `Teach: ${c.teach ? `PR-${c.teach}` : 'none'}`,
    `Check-in: ${c.checkIn ?? 'none'}`,
    `Auto: ${rows(c.auto)}`,
    `Queued: ${rows(c.queued)}`,
  ];
}

export function launchLine(l: Launch): string {
  const head = /^CUL-\d+$/.test(l.row) ? 'adhoc' : `PR-${l.row}`;
  return `* ${head} · ${l.issue} · session ${l.session} · branch ${l.branch} · ${l.at} · ${l.how ?? 'picked'}`;
}

// Scope item 3: the update is refused, whole, when any of these fails.
export function validateStatusUpdate(text: string, facts: { now: string; mergedRows: Set<string> }): string[] {
  const errors: string[] = [];
  if (!/^\*\*\/dispatch run\*\*/.test(text.trim())) errors.push('the first line is not **/dispatch run**');
  for (const l of parseLaunchLines(text)) {
    if (!l.session) errors.push(`a launch line with no session id: "${strip(l.raw)}"`);
    if (!l.branch) errors.push(`a launch line with no branch: "${strip(l.raw)}"`);
    if (!l.at) errors.push(`a launch line with no UTC time: "${strip(l.raw)}"`);
  }
  const now = new Date(facts.now).getTime();
  for (const line of text.split('\n')) {
    if (/^(Check-in|Successor):/.test(line.trim())) continue; // a check-in is in the future by design
    for (const t of line.match(ISO) ?? [])
      if (new Date(t).getTime() > now + 60_000) errors.push(`${t} is ahead of the clock (${facts.now})`);
  }
  for (const key of ['Dispatcher', 'Teach', 'Check-in', 'Auto', 'Queued'])
    if (closingLine(text, key) === undefined) errors.push(`no ${key}: line`);
  for (const r of rowsOf(closingLine(text, 'Auto'))) if (facts.mergedRows.has(r)) errors.push(`Auto: names PR-${r}, which has merged`);
  for (const r of rowsOf(closingLine(text, 'Queued'))) if (facts.mergedRows.has(r)) errors.push(`Queued: names PR-${r}, which has merged`);
  const checkIn = closingLine(text, 'Check-in');
  if (checkIn && !/^none\b/i.test(checkIn) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(checkIn))
    errors.push(`Check-in: is neither a UTC time nor none: "${checkIn}"`);
  return errors;
}

// Scope item 4: what the updates remember, against GitHub. Every disagreement is a
// line in the digest; none of them is fixed silently.
export type MemoryInput = {
  slugs: string[]; // the alias's slug, and the full name's for pages whose branches predate the alias
  updates: string[]; // the `**/dispatch run**` bodies, newest first
  branches: string[]; // remote branches, `claude/<slug>-pr*` and `claude/<slug>-adhoc-*`
  prs: PrFact[];
  mergedRows: Map<string, number>; // row → merged PR number
  now: string;
  since: string; // the oldest update read: a closed PR opened before it has no line to check against
};

export function memoryCheck(input: MemoryInput): string[] {
  const out: string[] = [];
  const launches = input.updates.flatMap(parseLaunchLines);
  const known = new Set(launches.map((l) => l.branch).filter(Boolean));
  const own = new RegExp(`^claude/(?:${input.slugs.join('|')})-(?:pr(\\d{2}[a-z]?)|adhoc)-\\d{8}[a-z0-9]*$`);
  const seen = new Set<string>();
  const since = new Date(input.since).getTime();
  const heads = [...input.branches, ...input.prs.filter((p) => p.state === 'open' || new Date(p.createdAt).getTime() >= since).map((p) => p.headRef)];
  for (const b of heads) {
    if (seen.has(b) || !own.test(b)) continue;
    seen.add(b);
    if (!known.has(b)) {
      const pr = input.prs.find((p) => p.headRef === b);
      out.push(`${b}${pr ? ` (#${pr.number}, ${pr.state})` : ''} has no launch line: a launch never recorded`);
    }
  }
  for (const l of launches) {
    if (!l.session) out.push(`the launch of PR-${l.row} (${l.at ?? 'no time'}) names no session`);
    const b = l.branch && own.exec(l.branch);
    if (b && b[1] && normRow(b[1]) !== l.row) out.push(`the launch line says PR-${l.row}, its branch ${l.branch} says PR-${b[1]}`);
    if (l.branch && l.at && !heads.includes(l.branch) && new Date(input.now).getTime() - new Date(l.at).getTime() > 2 * 3600_000)
      out.push(`PR-${l.row}'s branch ${l.branch} is not on the remote, ${Math.floor((new Date(input.now).getTime() - new Date(l.at).getTime()) / 3600_000)}h after its launch`);
  }
  const newest = input.updates[0] ?? '';
  for (const r of rowsOf(closingLine(newest, 'Auto'))) {
    const n = input.mergedRows.get(r);
    if (n) out.push(`Auto: still names PR-${r}, merged as #${n}`);
  }
  for (const r of rowsOf(closingLine(newest, 'Queued'))) {
    const n = input.mergedRows.get(r);
    if (n) out.push(`Queued: still names PR-${r}, merged as #${n}`);
  }
  const checkIn = closingLine(newest, 'Check-in');
  if (checkIn && /^\d{4}-/.test(checkIn) && new Date(checkIn).getTime() > new Date(input.now).getTime() + 26 * 3600_000)
    out.push(`Check-in: ${checkIn} is more than a day ahead, so it was composed, not read`);
  return out;
}

// Scope item 5: the hand-off is due when the dispatcher's context passes ~150K tokens.
export function handoffDue(contextTokens: number): boolean {
  return contextTokens >= HANDOFF_TOKENS;
}

// An issue id in a PR's title or body closes that issue when the PR merges (CLAUDE.md,
// CUL-1397, measured), and a closing word makes no difference: #1082's pasted dry run said
// "close CUL-1247" and its merge closed CUL-1247. Text bound for a PR body therefore breaks
// every id except the ones the PR finishes (`keep`) with a non-breaking hyphen, so no parser
// reads it as a reference and a reader still does.
const ISSUE_ID = /\b(CUL)-(\d+)\b/gi;
export function prSafe(text: string, keep: string[] = []): string {
  return text.replace(ISSUE_ID, (m: string, k: string, n: string) => (keep.includes(m.toUpperCase()) ? m : `${k}\u2011${n}`));
}
export function issueIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(ISSUE_ID)].map((m) => m[0]))];
}
