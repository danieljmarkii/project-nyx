// /dispatch's deterministic half, run by the dispatcher (CUL-1615). The I/O shell: it
// reads ONE facts file the dispatcher wrote from its tool reads (Linear, GitHub, the
// sessions, the routines, `date -u`), runs the pure modules beside it, and prints. It
// makes no network call and writes nothing, so every run is a zero-write dry run; the
// dispatcher does the writes dispatch.md lists, with the text this prints.
//
//   node --experimental-strip-types scripts/dispatch/cli.ts plan <facts.json> [--board digest|table] [--for-pr [CUL-NNN …]]
//   node --experimental-strip-types scripts/dispatch/cli.ts check-update <update.md> <facts.json>
//   node --experimental-strip-types scripts/dispatch/cli.ts check-board <board.md> <facts.json>
//   node --experimental-strip-types scripts/dispatch/cli.ts progress <facts.json> [--for-pr [CUL-NNN …]] [--email <owner>]
//
// facts.json: PlanInput (plan.ts) with each project's `description` given inline or as
// `descriptionFile` (a path), plus optional `updates` (the `**/dispatch run**` bodies,
// newest first) with `updatesSince` (the oldest one's time), `branches` (remote branch names), `triggers` (list_triggers), `unblock`
// (U lines), `index` (the ruling index id), `dispatcher` (this session's id), `teach`,
// `queued`.
//
// `--for-pr [CUL-NNN …]` breaks every issue id but the ones listed, so the output can be
// pasted into a PR body without its merge closing them (status.ts, prSafe).

import * as fs from 'node:fs';

import { renderBoard, validateBoard, type BoardShape } from './board.ts';
import { autoEligible, planDispatch, type PlanInput, type ProjectInput } from './plan.ts';
import { cyclesFrom, holdsFromPlan, nextFromPlan, nextFromQueued, progressEmail, renderProgress, sinceOf, unitsFromIssues, unitsFromPlan, type ProjectIssue, type Wake as ProgressWake } from './progress.ts';
import { checkInFrom, closingLines, memoryCheck, prSafe, validateStatusUpdate, type Trigger } from './status.ts';

type Facts = Omit<PlanInput, 'project' | 'others'> & {
  project: ProjectInput & { descriptionFile?: string };
  others?: (ProjectInput & { descriptionFile?: string })[];
  updates?: string[];
  updatesSince?: string; // the oldest update's time (default: 14 days back)
  branches?: string[];
  triggers?: Trigger[];
  unblock?: string[];
  index?: string;
  dispatcher?: string;
  teach?: string;
  queued?: string[];
};

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

function load(file: string): Facts {
  const f = JSON.parse(fs.readFileSync(file, 'utf8')) as Facts;
  const desc = (p: ProjectInput & { descriptionFile?: string }) => ({
    ...p,
    description: p.description ?? (p.descriptionFile ? fs.readFileSync(p.descriptionFile, 'utf8') : fail(`no description for ${p.name}`)),
  });
  return { ...f, project: desc(f.project), others: (f.others ?? []).map(desc) };
}

function plan(f: Facts, shape: BoardShape): string {
  const p = planDispatch(f);
  const merged = new Map(
    p.verdicts.filter((v) => v.state.kind === 'merged').map((v) => [v.row, (v.state as { pr: number }).pr] as [string, number]),
  );
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  say(`/dispatch · ${p.alias} · facts as of ${f.now} (dry run: nothing is written)`);
  say(`Slots: ${p.arithmetic}`);
  say(`       waiting on the PM ${p.subLimits.waitingOnPm} of 3 · writes production ${p.subLimits.writesProduction} of 3 · migrations ${p.subLimits.migrations} of 1`);
  say(`       parked (no slot, files reserved): ${p.parked.map((x) => x.label).join('; ') || 'nothing'}`);
  if (!f.appliedMigrations) say('       (no applied-migrations list given: every PR migration reads as unapplied, so an idle one parks)');
  say(`Migrations: next free number ${p.nextMigration}${p.clashes.map((c) => `; ${c.number} held by ${c.keeps} and ${c.renumbers.join(', ')} (the later renumbers)`).join('')}`);
  const shared = p.reservations.filter((r) => r.holders.length > 1);
  if (shared.length) say(`Files held twice: ${shared.map((r) => `${r.file} (${r.holders.join(', ')})`).join('; ')}`);
  say(`Holding rows on you: ${p.pmHolds.slice(0, 3).map((h) => `${h.text} (frees ${h.freesOutright.length}, holds ${h.rowsHeld.length})`).join('; ') || 'nothing'}`);
  if (p.gateHolds.length) say(`Release and GA gates: ${p.gateHolds.map((h) => `${h.text} (holds ${h.rowsHeld.map((r) => `PR-${r}`).join(', ')})`).join('; ')}`);
  say();
  say(`Proposed (rank order): ${p.proposal.map((r) => `PR-${r}`).join(', ') || 'none'}`);
  for (const r of p.proposal) {
    const v = p.verdicts.find((x) => x.row === r)!;
    const g = v.gate;
    say(` PR-${r}  ${v.what}  · ${g.mode.toLowerCase()}`);
    say(`    ${g.planGated.length ? `plan-gated: ${g.planGated.join(', ')}` : 'routine'}${g.copyBearing.length ? ` · copy-bearing (${g.copyBearing.join(', ')})` : ''} · auto-eligible: ${autoEligible(g) ? 'yes' : 'no'}${v.flags.length ? ` · ⚠ ${v.flags.join(' · ')}` : ''}`);
  }
  say(`Ready but over the cap: ${p.overCap.map((r) => `PR-${r}`).join(', ') || 'none'}`);
  say('Held:');
  for (const v of p.verdicts.filter((x) => x.row && !x.ready && x.state.kind !== 'merged')) say(` PR-${v.row} — ${v.reasons.join('; ')}`);
  say(`Auto (confirmed, unmerged): ${p.autoRows.map((r) => `PR-${r}`).join(', ') || 'none'}`);
  if (f.updates || f.branches) {
    const d = memoryCheck({ slugs: [...new Set([p.slug, p.nameSlug])], updates: f.updates ?? [], branches: f.branches ?? [], prs: f.prs, mergedRows: merged, now: f.now, since: f.updatesSince ?? new Date(new Date(f.now).getTime() - 14 * 86_400_000).toISOString() });
    say();
    say(`Memory against GitHub: ${d.length ? '' : 'agrees'}`);
    for (const x of d) say(` - ${x}`);
  }
  say();
  say('Closing lines for this run\'s status update:');
  for (const l of closingLines({
    dispatcher: f.dispatcher ?? '<this session>',
    teach: f.teach,
    checkIn: checkInFrom(f.triggers ?? [], p.alias, f.now),
    auto: p.autoRows,
    queued: (f.queued ?? []).filter((r) => !merged.has(r)),
  }))
    say(`  ${l}`);
  say();
  const board = renderBoard({ plan: p, now: f.now, shape, unblock: f.unblock, index: f.index });
  const errs = validateBoard(board, { now: f.now, merged: new Set(merged.keys()), rows: new Set(p.verdicts.map((v) => v.row)) });
  say(`Board (${shape}; ${errs.length ? `REFUSED: ${errs.join('; ')}` : 'parses'}):`);
  say(board);
  return out.join('\n');
}

// The progress update (CUL-1624). Extra facts: `wakes` (the children's wakes this session
// received), `progressSince` (the newest `**/dispatch progress**` update's time) and, for a
// project with no run-order table, `projectIssues` (every issue: id, state type, milestone,
// labels, parent). The owner's address is an argument read from the session context, never
// a fact in a file.
type ProgressFacts = Facts & { wakes?: ProgressWake[]; progressSince?: string; projectIssues?: ProjectIssue[] };

function progress(f: ProgressFacts): { alias: string; text: string } {
  const p = planDispatch(f);
  const own = f.launches.filter((l) => l.project === p.alias);
  const table = p.verdicts.some((v) => v.row);
  const units = table ? unitsFromPlan(p, f.prs) : unitsFromIssues(f.projectIssues ?? [], own, f.prs, f.queued ?? []);
  const flying = units.filter((u) => u.state === 'running' || u.state === 'open').length;
  const text = renderProgress({
    alias: p.alias,
    now: f.now,
    since: f.progressSince ?? sinceOf([], f.now),
    units,
    launches: own,
    wakes: f.wakes,
    cycles: cyclesFrom(own, f.prs),
    repoCycles: cyclesFrom(f.launches, f.prs),
    next: table ? nextFromPlan(p) : nextFromQueued(f.queued ?? []),
    holds: table
      ? holdsFromPlan(p)
      : (f.projectIssues ?? []).filter((i) => i.labels?.includes('Waiting on PM') && !['completed', 'canceled', 'duplicate'].includes(i.stateType)).map((i) => ({ text: `${i.id} (Waiting on PM)` })),
    index: f.index,
    slots: p.slots + flying,
  });
  return { alias: p.alias, text };
}

const [cmd, a, b, ...rest] = process.argv.slice(2);
const flags = [a, b, ...rest];
// The digest is the default Board (D4, CUL-1622): the PM reads the digests, not a table.
const shape: BoardShape = flags.includes('--board') ? (flags[flags.indexOf('--board') + 1] as BoardShape) || 'digest' : 'digest';
if (cmd === 'plan' && a) {
  const text = plan(load(a), shape);
  const keep = flags.includes('--for-pr') ? flags.slice(flags.indexOf('--for-pr') + 1).filter((x) => /^CUL-\d+$/.test(x)) : [];
  console.log(flags.includes('--for-pr') ? prSafe(text, keep) : text);
} else if (cmd === 'check-update' && a && b) {
  const f = load(b);
  const p = planDispatch(f);
  const merged = new Set(p.verdicts.filter((v) => v.state.kind === 'merged').map((v) => v.row));
  const errs = validateStatusUpdate(fs.readFileSync(a, 'utf8'), { now: f.now, mergedRows: merged });
  console.log(errs.length ? `REFUSED:\n${errs.map((e) => ` - ${e}`).join('\n')}` : 'OK');
  process.exit(errs.length ? 1 : 0);
} else if (cmd === 'check-board' && a && b) {
  const f = load(b);
  const p = planDispatch(f);
  const merged = new Set(p.verdicts.filter((v) => v.state.kind === 'merged').map((v) => v.row));
  const errs = validateBoard(fs.readFileSync(a, 'utf8'), { now: f.now, merged, rows: new Set(p.verdicts.map((v) => v.row)) });
  console.log(errs.length ? `REFUSED:\n${errs.map((e) => ` - ${e}`).join('\n')}` : 'OK');
  process.exit(errs.length ? 1 : 0);
} else if (cmd === 'progress' && a) {
  const f = load(a) as ProgressFacts;
  const { alias, text } = progress(f);
  if (flags.includes('--email')) console.log(JSON.stringify(progressEmail(text, alias, f.now, flags[flags.indexOf('--email') + 1]), null, 2));
  else {
    const keep = flags.includes('--for-pr') ? flags.slice(flags.indexOf('--for-pr') + 1).filter((x) => /^CUL-\d+$/.test(x)) : [];
    console.log(flags.includes('--for-pr') ? prSafe(text, keep) : text);
  }
} else {
  fail('usage: cli.ts plan <facts.json> [--board digest|table] [--for-pr] | check-update <update.md> <facts.json> | check-board <board.md> <facts.json> | progress <facts.json> [--for-pr] [--email <owner>]');
}
