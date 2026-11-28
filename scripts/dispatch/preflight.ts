// Project go (CUL-2888, PR-32 of Workflow v2): one approval of a run order launches every
// eligible row, with the kept rulings collected before kickoff.
//
// WHY. `auto` was granted per row, by a typed `fix` on an Unblock kind e line or a `go`
// on a marked row, and never on a project's first dispatch. Retro 4 traced a follow-up row
// at 3 to 7 typed inputs. The preflight moves the PM's effort to the front: one list of
// what only the PM can rule (the kept rows, the open After rulings), the migrations that
// will each ask an `apply`, and the rows not specified well enough to run alone. One typed
// `go project` on a preflight with nothing unruled confirms `auto` on every eligible row
// on the `Done means (rows):` path. The confirmation is the status update's `Auto:` line,
// exactly as before, so the launch check (dispatch.md step 6, step 7.1) does not change.
//
// WHAT A PROJECT GO NEVER DOES. It never confirms a kept row (ruled or not: ruling it up
// front saves the child a stop, the row still needs its own word), a migration row, a
// privileged row, an unready row, or a row off the path. A row added after the go is not
// on its `Auto:` line; a row that stops being eligible is caught by the fresh gate read
// every run and at launch. All of that errs toward an extra ask, never a silent launch.
//
// Pure: the plan's facts plus `ruled` (a ruling key → the PM's words, read from the
// `**Ruled before kickoff**` comment on the row's issue) come in; text comes out.
//
// STATED BLIND SPOTS (C-38):
//   - `Done when` and the verify line are read from the row's build note by their labels
//     (`Done when:`, `Verify with:` or `Verify:`). A note that says the same thing in other
//     words reads as unready. That is the loud direction.
//   - "Ordered against" is the After graph and the page's *Never at the same time* rules.
//     Two rows a human knows never overlap, with neither written, read as a clash.
//   - A design surface is a row the kept list calls taste. Its round counts as ratified
//     only when the note names one after the word `ratified` (`Ratified round: R-3`); the
//     script cannot check that the PM ratified it (kept.ts's same blind spot).

import { asksOf, autoEligible, planDispatch, type Plan, type PlanInput, type Verdict } from './plan.ts';
import { normRow, type PageRow, type RowId } from './page.ts';
import { keptOf, pathsIn } from '../kept/kept.ts';

export type Ruling = {
  key: string; // `PR-03` for a kept row; the hold's key for an After ruling
  row: RowId;
  issue?: string;
  needs: string; // the ruling it needs, one line
  brief: string[]; // the decision brief, ~4 lines
  ruled?: string; // the PM's ruling, when given
};

export type Unready = { row: RowId; why: string[] };
export type MigrationStep = { row: RowId; issue?: string; applies: string[] };
export type Withheld = { row: RowId; why: string };

export type Preflight = {
  alias: string;
  plan: Plan;
  rows: RowId[]; // unmerged rows, page order
  rulings: Ruling[];
  open: Ruling[]; // rulings not yet ruled
  migrations: MigrationStep[];
  unready: Unready[];
  eligible: RowId[]; // what a project go confirms
  withheld: Withheld[]; // on-path rows a project go does not confirm, with why
  forecast: { rows: number; inputs: number; perRow: Record<RowId, number> };
};

export type PreflightInput = PlanInput & { ruled?: Record<string, string> };

// A migration row's schema and SQL reasons are its `apply`, listed under migrations; any
// other kept reason on it (clinical, privacy, money) still needs a ruling.
const APPLY_COVERS = /^stakes: (schema\b|irreversible \(SQL\b)/;
const DONE_WHEN = /\bDone when:/i;
const VERIFY = /\bVerify(?: with)?:/i;
const RATIFIED = /\bratified\b[^.]*?\b(R-\d+|round\s*\d+)\b/i;
const MIGRATION_FILE = /supabase\/migrations\/(\d+[a-z]?)_/g;

const parts = (id: RowId) => id.split(' + ').map(normRow);

// Every pair the page orders: After edges and chain rules (transitively), and one-at-a-time sets.
function orderedPairs(plan: Plan): (a: RowId, b: RowId) => boolean {
  const rows = plan.page.rows.filter((r) => r.id);
  const owner = new Map<RowId, RowId>();
  for (const r of rows) for (const p of parts(r.id)) owner.set(p, r.id);
  const edges = new Map<RowId, Set<RowId>>();
  const edge = (from?: RowId, to?: RowId) => {
    if (!from || !to || from === to) return;
    edges.set(from, new Set([...(edges.get(from) ?? []), to]));
  };
  for (const r of rows) for (const a of r.after) if (a.kind === 'pr') edge(r.id, owner.get(a.row));
  const together: RowId[][] = [];
  for (const rule of plan.page.order) {
    const ids = rule.rows.map((x) => owner.get(x)).filter((x): x is RowId => !!x);
    if (rule.kind === 'chain') for (let i = 1; i < ids.length; i++) edge(ids[i], ids[i - 1]);
    if (rule.kind === 'one-at-a-time') together.push(ids);
  }
  const reach = (from: RowId, to: RowId) => {
    const seen = new Set<RowId>();
    const stack = [from];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(edges.get(x) ?? []));
    }
    return false;
  };
  return (a, b) => reach(a, b) || reach(b, a) || together.some((t) => t.includes(a) && t.includes(b));
}

function unreadyOf(plan: Plan, live: PageRow[]): Unready[] {
  const ordered = orderedPairs(plan);
  const out: Unready[] = [];
  for (const row of live) {
    const v = plan.verdicts.find((x) => x.row === row.id)!;
    const why: string[] = [];
    if (!DONE_WHEN.test(row.note)) why.push('no `Done when` line in its build note');
    if (!VERIFY.test(row.note)) why.push('no verify line in its build note');
    for (const h of row.hotspots) {
      const clash = live.filter((o) => o.id !== row.id && o.hotspots.includes(h) && !ordered(row.id, o.id));
      if (clash.length) why.push(`hotspot ${h} is shared with ${clash.map((o) => `PR-${o.id}`).join(', ')}, and neither is ordered after the other`);
    }
    const taste = v.gate.keptReasons.filter((r) => r.startsWith('taste:'));
    if (taste.length && !RATIFIED.test(row.note)) why.push(`a design surface (${taste.map((t) => t.slice(7)).join('; ')}) with no ratified mock round named`);
    if (why.length) out.push({ row: row.id, why });
  }
  return out;
}

// A migration row's own files (`supabase/migrations/…`) and its schema and SQL reasons are
// its `apply`, listed under migrations. Everything else on it is read as for any row, so a
// clinical, privacy or money call on a migration row still needs its ruling.
function rulingReasons(v: Verdict, row: PageRow, labels: string[]): string[] {
  if (!row.migration) return v.gate.kept === 'none' ? [] : v.gate.keptReasons;
  const text = `${row.what} ${row.note}`.replace(/\S*supabase\/migrations\/\S*/g, ' ');
  return keptOf({ labels, files: pathsIn(text), text, migration: true }).reasons.filter((r) => !APPLY_COVERS.test(r));
}

function keptRuling(v: Verdict, row: PageRow, labels: string[]): Ruling | undefined {
  const reasons = rulingReasons(v, row, labels);
  if (!reasons.length) return undefined;
  const needs = `PR-${row.id} is kept (${reasons.join('; ')})`;
  return {
    key: `PR-${row.id}`,
    row: row.id,
    issue: v.issue,
    needs,
    brief: [
      `Deciding: ${row.what}: the call the kept list holds for you (${reasons.join('; ')}).`,
      `Options: (a) rule it now, recorded on ${v.issue ?? 'its issue'} as "Ruled before kickoff" (recommended: the row's session then builds to your answer instead of stopping); (b) take the row off the run order.`,
      'Consequence: go project is refused until this is ruled. Ruled or not, this row is never confirmed auto: it launches on its own go.',
    ],
  };
}

export function preflight(input: PreflightInput): Preflight {
  const plan = planDispatch(input);
  const ruled = input.ruled ?? {};
  const live = plan.page.rows.filter((r) => r.id && plan.verdicts.find((v) => v.row === r.id)?.state.kind !== 'merged');
  const verdictOf = (id: RowId) => plan.verdicts.find((v) => v.row === id)!;

  const rulings: Ruling[] = [];
  const seen = new Set<string>();
  const add = (r: Ruling) => {
    if (seen.has(r.key)) return;
    seen.add(r.key);
    const said = ruled[r.key];
    rulings.push(said ? { ...r, ruled: said } : r);
  };
  for (const row of live) {
    const v = verdictOf(row.id);
    const k = keptRuling(v, row, [...new Set(row.issues.flatMap((i) => input.issues[i]?.labels ?? []))]);
    if (k) add(k);
    // An After item that waits on a ruling or a PM action is a ruling the run would meet.
    // (`CUL-NNN merged` is a dependency, not a ruling: its hold is kind pm too, so the After
    // item's own kind decides.)
    const asks = new Set(row.after.filter((a) => a.kind === 'ruling' || a.kind === 'pm').map((a) => (a as { key: string }).key));
    for (const h of v.holds.filter((x) => x.kind === 'waits' || ((x.kind === 'ruling' || x.kind === 'pm') && asks.has(x.key))))
      add({
        key: h.key,
        row: row.id,
        issue: v.issue,
        needs: `PR-${row.id} waits on ${h.text}`,
        brief: [`Deciding: ${h.text} (holds PR-${row.id}).`, 'Options: (a) rule it now (recommended: the row can then run in order); (b) leave the row held, off this go.', 'Consequence: go project is refused until this is ruled.'],
      });
  }
  const open = rulings.filter((r) => !r.ruled);

  const migrations: MigrationStep[] = live
    .filter((r) => r.migration)
    .sort((a, b) => verdictOf(a.id).rank - verdictOf(b.id).rank || live.indexOf(a) - live.indexOf(b))
    .map((r) => {
      const files = [...new Set([...`${r.what} ${r.note}`.matchAll(MIGRATION_FILE)].map((m) => m[1]))];
      return { row: r.id, issue: verdictOf(r.id).issue, applies: files.length ? files.map((n) => `apply ${n}`) : ['apply <NNN> (numbered at build)'] };
    });

  const unready = unreadyOf(plan, live);
  const unreadyRows = new Set(unready.map((u) => u.row));

  const eligible: RowId[] = [];
  const withheld: Withheld[] = [];
  for (const row of live) {
    const v = verdictOf(row.id);
    if (!v.onPath) continue;
    const why: string[] = [];
    if (v.gate.kept !== 'none') why.push(`kept: ${v.gate.kept}`);
    if (v.gate.migration) why.push('a migration');
    if (v.gate.privileged.length) why.push('a privileged verb in its note');
    if (v.gate.mode !== 'BUILD') why.push('a DISCOVERY row');
    if (unreadyRows.has(row.id)) why.push('not agent ready');
    if (!why.length && autoEligible(v.gate)) eligible.push(row.id);
    else withheld.push({ row: row.id, why: why.join(', ') || 'not auto-eligible' });
  }

  const perRow: Record<RowId, number> = {};
  for (const row of live) {
    const v = verdictOf(row.id);
    perRow[row.id] = asksOf(row, v.gate, { autoConfirmed: eligible.includes(row.id), rulings: 0, productionLib: input.productionLib }).n;
  }
  // `go project` itself, each open ruling, then what every row asks on its own.
  const inputs = 1 + open.length + Object.values(perRow).reduce((a, b) => a + b, 0);

  return { alias: plan.alias, plan, rows: live.map((r) => r.id), rulings, open, migrations, unready, eligible, withheld, forecast: { rows: live.length, inputs, perRow } };
}

export type GoProject =
  | { ok: false; refused: string[] }
  | { ok: true; auto: RowId[]; marks: RowId[]; withheld: Withheld[] };

// The PM's typed `go project`, checked against the preflight it answers.
export function goProject(pre: Preflight): GoProject {
  if (pre.open.length) return { ok: false, refused: pre.open.map((r) => `${r.key}: ${r.needs}`) };
  const auto = [...new Set([...pre.plan.autoRows, ...pre.eligible])];
  // The launch check reads the PR cell's ` auto` too: the go writes it where it is missing.
  const marks = pre.eligible.filter((r) => !pre.plan.page.rows.find((x) => x.id === r)?.auto);
  return { ok: true, auto, marks, withheld: pre.withheld };
}

export function renderPreflight(pre: Preflight): string {
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const rows = (xs: RowId[]) => (xs.length ? xs.map((r) => `PR-${r}`).join(', ') : 'none');
  say(`/dispatch preflight · ${pre.alias} · ${pre.plan.page.doneMeans ? 'on the Done means path' : 'no Done means (rows): line, so nothing is eligible'}`);
  say(`Rulings before kickoff: ${pre.open.length} open of ${pre.rulings.length}`);
  for (const r of pre.rulings) {
    say(` ${r.key}${r.ruled ? ` ✓ ruled: ${r.ruled}` : ''}`);
    if (!r.ruled) for (const l of r.brief) say(`    ${l}`);
  }
  say(`Migrations, in order: ${pre.migrations.length ? '' : 'none'}`);
  for (const m of pre.migrations) say(` PR-${m.row}: ${m.applies.join(', ')} to come`);
  say(`Not agent ready: ${pre.unready.length ? '' : 'none'}`);
  for (const u of pre.unready) say(` PR-${u.row} — ${u.why.join('; ')}`);
  say(`Forecast: ${pre.forecast.rows} rows · ${pre.forecast.inputs} typed inputs (go project, ${pre.open.length} open ruling${pre.open.length === 1 ? "" : "s"}, then ${Object.entries(pre.forecast.perRow).map(([r, n]) => `PR-${r} ${n}`).join(' · ')})`);
  say(`go project confirms auto on: ${rows(pre.eligible)}`);
  for (const w of pre.withheld) say(`    withheld PR-${w.row}: ${w.why}`);
  say(pre.open.length ? `Reply with each ruling ("rule PR-NN: <your words>"); go project is refused until every one is ruled.` : 'Reply "go project" to confirm them.');
  return out.join('\n');
}

// ---- the readout at the end of a run (build note item 4) -------------------------------

export type RunInput = { at: string; text: string; row?: RowId }; // a typed PM input; no row = the run's own
export type RunFacts = {
  inputs: RunInput[];
  rollbacks?: { row: RowId; pr: number }[];
  parked?: { row: RowId; text: string }[];
  stops?: { row: RowId; reason: string }[];
};

export function readout(plan: Plan, run: RunFacts): string {
  const merged = plan.verdicts.filter((v) => v.row && v.state.kind === 'merged').map((v) => v.row);
  const asked = new Set(run.inputs.filter((i) => i.row).map((i) => normRow(i.row!)));
  const quiet = merged.filter((r) => !asked.has(r));
  const per = new Map<string, number>();
  for (const i of run.inputs) per.set(i.row ? `PR-${normRow(i.row)}` : 'the run', (per.get(i.row ? `PR-${normRow(i.row)}` : 'the run') ?? 0) + 1);
  const list = <T>(xs: T[] | undefined, f: (x: T) => string) => (xs?.length ? xs.map(f).join('; ') : 'none');
  return [
    `Readout · ${plan.alias}`,
    `Merged with no input: ${quiet.length ? quiet.map((r) => `PR-${r}`).join(', ') : 'none'} (${quiet.length} of ${merged.length} merged)`,
    `Typed inputs: ${run.inputs.length} in total${per.size ? ` · ${[...per].map(([k, n]) => `${k} ${n}`).join(' · ')}` : ''}`,
    `Rollbacks: ${list(run.rollbacks, (r) => `PR-${r.row} (#${r.pr})`)}`,
    `Parked decisions: ${list(run.parked, (p) => `PR-${p.row}: ${p.text}`)}`,
    `What stopped: ${list(run.stops, (s) => `PR-${s.row}: ${s.reason}`)}`,
  ].join('\n');
}
