// /dispatch's progress update (CUL-1624): five lines a PM reads cold, at the top of every
// round digest and once each weekday at 07:45 CT. How far along, what moved, what is next,
// what waits on the PM, and roughly how much running time is left.
//
// WHY. The digests say what just happened; nothing said how far along a project is or how
// fast it moves. The facts were all in hand (the plan's verdicts, the launch lines, GitHub's
// merge times), so the update is a function of them, and the estimate is measured, never
// guessed: launch-to-merge times this project's own children took.
//
// Pure: every fact is an argument; nothing here reads the network or the clock.
//
// STATED BLIND SPOTS (C-38):
//   - The estimate is RUNNING time, never a date: it cannot see nights, a PM who rules late,
//     or a review that sits. It counts only rows dispatch can run without the PM; rows
//     waiting on a ruling and issues with no row are named beside it, never estimated.
//   - A cycle is a launch line matched to a merged PR by branch. A row merged by hand, or a
//     launch whose branch the child superseded, is not a measured cycle.
//   - Rounds assume each round fills every usable slot; a strict chain on the page runs one
//     row per round, so a chained remainder finishes later than the range says.
//   - On a project with no run-order table, an issue's state is Linear's, and a parent whose
//     children are in the project is not counted (its children are).

import type { Launch, Plan, PrFact } from './plan.ts';
import type { Wake } from './stall.ts';

export type { Wake };

export const MIN_CYCLES = 3;
export const BAR_WIDTH = 10;
export const PROGRESS_HEAD = '**/dispatch progress**';
export const LABELS = ['Progress:', 'Moved since', 'Next:', 'On you:', 'Estimate:'] as const;
const PM_LABEL = 'Waiting on PM';
const ZONE = 'America/Chicago';

export type UnitState = 'merged' | 'running' | 'open' | 'parked' | 'ready' | 'held' | 'on-you' | 'unscheduled';
export type Unit = { id: string; wave: string; state: UnitState; pr?: number; mergedAt?: string };

export type Cycle = { id: string; pr: number; launchedAt: string; mergedAt: string; minutes: number };
export type NextItem = { id: string; on: string }; // on: 'now', 'PR-12 merging', 'your ruling: D4'
export type HoldLine = { text: string; frees?: number; holds?: number };

export type ProgressInput = {
  alias: string;
  now: string;
  since: string;
  units: Unit[];
  launches: Launch[]; // this project's
  wakes?: Wake[];
  cycles: Cycle[]; // this project's measured cycles
  repoCycles?: Cycle[]; // every project's, used only when this one has fewer than MIN_CYCLES
  next: NextItem[];
  holds: HoldLine[];
  index?: string;
  slots: number; // usable by this project: free slots plus its own rows in flight
};

const ms = (t: string) => new Date(t).getTime(); // parsed, never lexical (C-40)

export function localTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')} ${get('day')} ${get('hour')}:${get('minute')} CT`;
}

export function bar(done: number, total: number, width = BAR_WIDTH): string {
  const filled = total ? Math.floor((done / total) * width) : 0;
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

// Linear-interpolated quantile over minutes sorted ascending (so an even count's median is
// the mean of the middle two, as a reader computing it by hand would get).
export function quantile(sorted: number[], q: number): number {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
}

// A cycle is a launch whose branch is the head of a merged PR: launch to merge, in minutes.
export function cyclesFrom(launches: Launch[], prs: PrFact[]): Cycle[] {
  const out: Cycle[] = [];
  const seen = new Set<number>();
  for (const l of launches) {
    const pr = prs.find((p) => p.state === 'merged' && p.mergedAt && p.headRef === l.branch);
    if (!pr || seen.has(pr.number)) continue;
    const minutes = (ms(pr.mergedAt!) - ms(l.at)) / 60_000;
    if (!(minutes > 0)) continue;
    seen.add(pr.number);
    out.push({ id: l.row, pr: pr.number, launchedAt: l.at, mergedAt: pr.mergedAt!, minutes });
  }
  return out;
}

// The window "moved since" covers: the newest progress update, else the last day.
export function sinceOf(updates: { body: string; createdAt: string }[], now: string): string {
  const last = updates.filter((u) => u.body.trimStart().startsWith(PROGRESS_HEAD)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0];
  return last ? last.createdAt : new Date(ms(now) - 24 * 3600_000).toISOString();
}

// ---------------------------------------------------------------------------------
// Units: one per row of the run order, or one per issue when the project has no table.

export function unitsFromPlan(plan: Plan, prs: PrFact[]): Unit[] {
  const out: Unit[] = [];
  for (const v of plan.verdicts) {
    if (!v.row) continue;
    const wave = plan.page.rows.find((r) => r.id === v.row)?.wave ?? '';
    const id = `PR-${v.row}`;
    const s = v.state;
    if (s.kind === 'merged') out.push({ id, wave, state: 'merged', pr: s.pr, mergedAt: prs.find((p) => p.number === s.pr)?.mergedAt });
    else if (s.kind === 'open' || s.kind === 'parked') out.push({ id, wave, state: s.kind, pr: s.pr });
    else if (s.kind === 'running') out.push({ id, wave, state: 'running' });
    else if (!v.reasons.length || plan.overCap.includes(v.row)) out.push({ id, wave, state: 'ready' });
    else if (v.holds.some((h) => h.kind === 'pm' || h.kind === 'ruling' || h.kind === 'waits')) out.push({ id, wave, state: 'on-you' });
    else out.push({ id, wave, state: 'held' });
  }
  return out;
}

export function nextFromPlan(plan: Plan): NextItem[] {
  const out: NextItem[] = [...plan.proposal, ...plan.overCap].map((r) => ({ id: `PR-${r}`, on: 'now' }));
  for (const v of plan.verdicts) {
    if (!v.row || v.state.kind !== 'none' || !v.reasons.length) continue;
    const deps = v.reasons.map((r) => /^after PR-(\w+), not merged$/.exec(r)?.[1]);
    if (deps.every(Boolean)) out.push({ id: `PR-${v.row}`, on: `${deps.map((d) => `PR-${d}`).join(' + ')} merging` });
  }
  for (const h of plan.pmHolds) for (const r of h.freesOutright) out.push({ id: `PR-${r}`, on: `your ruling: ${h.key}` });
  return out;
}

export const holdsFromPlan = (plan: Plan): HoldLine[] =>
  plan.pmHolds.map((h) => ({ text: h.text, frees: h.freesOutright.length, holds: h.rowsHeld.length }));

export type ProjectIssue = { id: string; stateType: string; milestone?: string | null; labels?: string[]; parentId?: string | null };

export function unitsFromIssues(issues: ProjectIssue[], launches: Launch[], prs: PrFact[], queued: string[] = []): Unit[] {
  const parents = new Set(issues.map((i) => i.parentId).filter(Boolean));
  const out: Unit[] = [];
  for (const i of issues) {
    if (i.stateType === 'canceled' || i.stateType === 'duplicate' || parents.has(i.id)) continue;
    const wave = i.milestone ?? 'no milestone';
    const branches = launches.filter((l) => l.issue === i.id || l.row === i.id).map((l) => l.branch);
    const mine = prs.filter((p) => branches.includes(p.headRef));
    const merged = mine.find((p) => p.state === 'merged');
    const open = mine.find((p) => p.state === 'open');
    // Order matters: a merged PR beats every label, the PM's label beats a launch it stopped
    // on, and an issue someone works by hand (started, never launched) is not dispatch's.
    if (i.stateType === 'completed') out.push({ id: i.id, wave, state: 'merged', pr: merged?.number, mergedAt: merged?.mergedAt });
    else if (open) out.push({ id: i.id, wave, state: 'open', pr: open.number });
    else if (i.labels?.includes(PM_LABEL)) out.push({ id: i.id, wave, state: 'on-you' });
    else if (branches.length) out.push({ id: i.id, wave, state: 'running' });
    else if (queued.some((q) => q.split(' ')[0] === i.id)) out.push({ id: i.id, wave, state: 'ready' });
    else out.push({ id: i.id, wave, state: 'unscheduled' });
  }
  return out;
}

// `CUL-1517 (after CUL-1624)` → on CUL-1624 merging; a bare queued id starts on a free slot.
export function nextFromQueued(queued: string[]): NextItem[] {
  return queued
    .map((q) => /^(\S+)(?: \(after (.+)\))?$/.exec(q.trim()))
    .filter((m): m is RegExpExecArray => !!m && m[1] !== 'none')
    .map((m) => ({ id: m[1], on: m[2] ? `${m[2]} merging` : 'now' }));
}

// ---------------------------------------------------------------------------------
// The five lines.

function progressLine(units: Unit[]): string {
  const done = units.filter((u) => u.state === 'merged').length;
  const total = units.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const waves: string[] = [];
  for (const u of units) if (!waves.includes(u.wave)) waves.push(u.wave);
  const byWave = waves.map((w) => {
    const in_ = units.filter((u) => u.wave === w);
    // A milestone's short name: `W-A · The free wins` would read as two items on this line.
    return `${w.split(' · ')[0] || 'no wave'} ${in_.filter((u) => u.state === 'merged').length}/${in_.length}`;
  });
  const flying = units.filter((u) => u.state === 'running' || u.state === 'open').length;
  return `Progress: ${done} of ${total} merged (${pct}%) ${bar(done, total)} · ${byWave.join(' · ')}${flying ? ` · ${flying} in flight` : ''}`;
}

function movedLine(input: ProgressInput): string {
  const since = ms(input.since);
  const now = ms(input.now);
  const inWindow = (t?: string) => !!t && ms(t) >= since && ms(t) <= now;
  const rowOf = (session: string) => input.launches.find((l) => l.session === session)?.row ?? session;
  const merged = input.units.filter((u) => u.state === 'merged' && inWindow(u.mergedAt)).sort((a, b) => ms(a.mergedAt!) - ms(b.mergedAt!));
  const stopped = (input.wakes ?? []).filter((w) => w.kind === 'stopped' && inWindow(w.at));
  const short = (input.wakes ?? []).filter((w) => w.kind === 'done' && inWindow(w.at));
  const launched = input.launches.filter((l) => inWindow(l.at)).sort((a, b) => ms(a.at) - ms(b.at));
  const parts: string[] = [];
  if (merged.length) parts.push(`merged ${merged.map((u) => `${u.id}${u.pr ? ` (#${u.pr})` : ''}`).join(', ')}`);
  if (stopped.length) parts.push(`stopped ${stopped.map((w) => `${rowOf(w.session)}${w.reason ? ` (${w.reason})` : ''}`).join(', ')}`);
  if (short.length) parts.push(`done short ${short.map((w) => `${rowOf(w.session)}${w.reason ? ` (${w.reason})` : ''}`).join(', ')}`);
  if (launched.length) parts.push(`launched ${[...new Set(launched.map((l) => l.row))].join(', ')}`);
  return `Moved since ${localTime(input.since)}: ${parts.join(' · ') || 'nothing'}`;
}

function nextLine(next: NextItem[]): string {
  const groups = new Map<string, string[]>();
  for (const n of next) {
    const g = groups.get(n.on) ?? [];
    if (!g.includes(n.id)) g.push(n.id);
    groups.set(n.on, g);
  }
  const text = [...groups].map(([on, ids]) => `${on === 'now' ? 'ready now' : `on ${on}`}: ${ids.join(', ')}`);
  return `Next: ${text.join(' · ') || 'nothing queued; the next ruling or added row starts the next round'}`;
}

function onYouLine(holds: HoldLine[], index?: string): string {
  if (!holds.length) return 'On you: nothing';
  const top = holds.slice(0, 3).map((h) => {
    const n = [h.frees !== undefined ? `frees ${h.frees}` : '', h.holds !== undefined ? `holds ${h.holds}` : ''].filter(Boolean).join(', ');
    return n ? `${h.text} (${n})` : h.text;
  });
  return `On you: ${top.join('; ')}${holds.length > 3 ? ` and ${holds.length - 3} more` : ''}${index ? ` → ${index}` : ''}`;
}

function duration(lo: number, hi: number): string {
  if (hi < 120) return `${Math.round(lo)}–${Math.round(hi)} min`;
  const h = (m: number) => (Math.round((m / 60) * 2) / 2).toString();
  return `${h(lo)}–${h(hi)} h`;
}

export function estimateLine(input: ProgressInput): string {
  const runnable = input.units.filter((u) => ['running', 'open', 'ready', 'held'].includes(u.state)).length;
  const onYou = input.units.filter((u) => u.state === 'on-you' || u.state === 'parked').length;
  const unscheduled = input.units.filter((u) => u.state === 'unscheduled').length;
  const aside = [onYou ? `${onYou} waiting on you or a gate` : '', unscheduled ? `${unscheduled} not on dispatch's run (no row, or worked by hand)` : ''].filter(Boolean);
  const notCounted = aside.length ? `; not counted: ${aside.join(', ')}` : '';
  if (!runnable) return `Estimate: ${onYou + unscheduled ? `none to run without you${notCounted}` : 'nothing left to run'}`;
  let pool = input.cycles;
  let where = 'here';
  if (pool.length < MIN_CYCLES && (input.repoCycles ?? []).length >= MIN_CYCLES) {
    pool = input.repoCycles!;
    where = `repo-wide (only ${input.cycles.length} here)`;
  }
  if (pool.length < MIN_CYCLES) return `Estimate: none yet: ${pool.length} measured launch-to-merge cycles, ${MIN_CYCLES} needed${notCounted}`;
  const sorted = pool.map((c) => c.minutes).sort((a, b) => a - b);
  const [p25, med, p75] = [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
  const slots = Math.max(1, input.slots);
  const rounds = Math.ceil(runnable / slots);
  return (
    `Estimate: ${runnable} rows to run ≈ ${rounds} round${rounds === 1 ? '' : 's'} of ${slots} slot${slots === 1 ? '' : 's'} ≈ ${duration(rounds * p25, rounds * p75)} of running time, not a date ` +
    `(basis: ${pool.length} merged launches ${where}, launch to merge p25 ${Math.round(p25)} min · median ${Math.round(med)} · p75 ${Math.round(p75)})${notCounted}`
  );
}

export function renderProgress(input: ProgressInput): string {
  return [progressLine(input.units), movedLine(input), nextLine(input.next), onYouLine(input.holds, input.index), estimateLine(input)].join('\n');
}

// The update is five lines, in order, plain ids: anything else is not the update.
export function validateProgress(text: string): string[] {
  const lines = text.split('\n');
  const errors: string[] = [];
  if (lines.length !== LABELS.length) errors.push(`${lines.length} lines, not ${LABELS.length}`);
  LABELS.forEach((label, i) => {
    if (!lines[i]?.startsWith(label)) errors.push(`line ${i + 1} does not start "${label}"`);
  });
  if (/<\/?(issue|pull-request)\b/.test(text)) errors.push('a link tag; write plain ids');
  return errors;
}

// The email exception (CUL-1624, § Authority): one recipient, the PM's own address read
// from the dispatcher's session context; the body is the five lines and nothing else.
export type ProgressEmail = { to: string; subject: string; body: string };
const ADDRESS = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export function progressEmail(text: string, alias: string, now: string, owner?: string): ProgressEmail | { skipped: string } {
  if (!owner || !ADDRESS.test(owner.trim())) return { skipped: 'no owner address in the session context' };
  const errors = validateProgress(text);
  if (errors.length) return { skipped: `not the five-line update (${errors.join('; ')})` };
  return { to: owner.trim(), subject: `/dispatch progress · ${alias} · ${localTime(now)}`, body: text };
}
