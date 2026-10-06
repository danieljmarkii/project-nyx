// /dispatch's deterministic half (CUL-1615, D4 of the CUL-1606 retro): which rows are
// ready and which held (with the reason in words), the repo-wide slot arithmetic and
// its three sub-limits, the reservation map, the gate predicate, the rank, and the holds
// on the PM. `.claude/commands/dispatch.md` steps 0–4 and 5's predicate, as a function.
//
// WHY A SCRIPT. The retro measured a dispatcher following the same rules as prose: merged
// rows back on the `Auto:` line, launches never recorded, 15 of 16 timestamps composed, a
// malformed Board row. Rules written as prose fire approximately never (law L2); a rule in
// a tested function fires every time. Judgment stays with the dispatcher and comes in as
// data: a comment's hold (`IssueFact.waits`), the Unblock lines that read text.
//
// Pure: every fact (the pages, GitHub, Linear, the sessions, the clock) is an argument.
// The I/O shell is cli.ts; nothing here reads the network or the clock.
//
// STATED BLIND SPOTS (C-38):
//   - A PR matches a row by `PR-NN` in a title that starts with the project's alias or
//     name, by a branch `claude/<slug>-pr<nn>-…`, by a `✓` title on the page, or by the
//     row's own issue id in its title when no other row shares that issue. Anything else
//     is unmatched, never guessed.
//   - Files are what the caller passes: a PR's files list (GitHub caps it), a row's
//     Hotspot line. A row that edits a shared file its note never names is invisible here.
//   - Other projects' rows count only through their launches and their open PRs; their
//     pages are read only to find a parked PR's gate.

import { aliasOf, normRow, parsePage, slugOf, type AfterItem, type Page, type PageRow, type RowId } from './page.ts';

export const CAP = 6;
export const SUB_LIMITS = { waitingOnPm: 3, writesProduction: 3, migrations: 1 } as const;
const DAY = 24 * 3600 * 1000;
const FORTNIGHT = 14 * DAY;

export type SessionBucket = 'working' | 'blocked' | 'review_ready' | 'completed' | 'failed' | 'gone';

export type PrFact = {
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
  headRef: string;
  createdAt: string;
  updatedAt?: string;
  mergedAt?: string;
  lastCommitAt?: string;
  files?: string[];
  mergeable?: boolean | null;
  draft?: boolean;
};

export type IssueFact = {
  id: string;
  state: string; // Linear's state name
  labels?: string[];
  parentId?: string | null;
  blockedBy?: { id: string; open: boolean; waitingOnPm?: boolean }[];
  // A hold the dispatcher read in a comment (judgment): quoted, and it can only hold.
  waits?: string;
};

export type ClaimFact = { issue: string; branch: string; at: string; released?: boolean; session?: string };

export type Launch = {
  project: string; // alias
  row: string; // '23c', or the issue id for a `--row` launch
  issue: string;
  session?: string;
  branch?: string;
  at: string;
  how?: 'picked' | 'queued' | 'auto' | 'adhoc';
};

export type ProjectInput = { name: string; description: string; firstDispatch?: boolean };

export type PlanInput = {
  now: string;
  project: ProjectInput; // the one being dispatched
  others?: ProjectInput[]; // every other live project, for parked PRs and their rows
  prs: PrFact[]; // every open PR in the repo, plus PRs merged since the project started
  issues: Record<string, IssueFact>;
  claims: ClaimFact[]; // the newest `**Claimed**`/`**Released**` per issue
  sessions: Record<string, SessionBucket>;
  launches: Launch[]; // every `/dispatch run` launch line, every project, last 14 days
  mainMigrations: string[]; // file names under supabase/migrations/ on main
  appliedMigrations?: string[]; // names applied to production (list_migrations)
  productionLib?: string[]; // the lib/ closure Edge Functions import (CLAUDE.md C-26)
  previousAuto?: string[]; // the newest status update's `Auto:` rows
  cap?: number;
};

export type Gate = {
  mode: 'BUILD' | 'DISCOVERY';
  planGated: string[]; // reasons, empty when routine
  copyBearing: string[];
  privileged: string[]; // the sentences that name a privileged verb
  migration: boolean;
};

export type RowState =
  | { kind: 'merged'; pr: number }
  | { kind: 'open'; pr: number }
  | { kind: 'parked'; pr: number }
  | { kind: 'running'; since: string; branch?: string }
  | { kind: 'none' };

export type Verdict = {
  row: RowId;
  issue?: string;
  what: string;
  state: RowState;
  ready: boolean;
  reasons: string[]; // held because… (empty when ready)
  holds: Hold[];
  flags: string[];
  gate: Gate;
  rank: number; // lower first; Infinity when on no critical path
  waitsOnPmIfLaunched: boolean;
  writesProduction: boolean;
};

export type Hold = { key: string; kind: 'ruling' | 'pm' | 'waits' | 'release' | 'ga'; text: string };

export type InFlight = {
  label: string;
  why: 'launch' | 'open-pr' | 'claim';
  issues: string[];
  branch?: string;
  waitsOnPm: boolean;
  writesProduction: boolean;
  migration: boolean;
};

export type Reservation = { file: string; holders: string[] };
export type MigrationClash = { number: string; keeps: string; renumbers: string[] };

export type Plan = {
  alias: string;
  slug: string;
  nameSlug: string; // branches written before the alias rule use the full name's slug
  page: Page;
  verdicts: Verdict[];
  inFlight: InFlight[];
  parked: { pr: number; label: string; files: string[] }[];
  slots: number;
  arithmetic: string;
  subLimits: { waitingOnPm: number; writesProduction: number; migrations: number };
  reservations: Reservation[];
  migrationNumbers: Record<string, string[]>; // number → holders (PRs and main)
  clashes: MigrationClash[];
  nextMigration: string;
  proposal: RowId[];
  overCap: RowId[];
  pmHolds: { key: string; text: string; rowsHeld: RowId[]; freesOutright: RowId[] }[];
  gateHolds: { key: string; text: string; rowsHeld: RowId[] }[];
  autoRows: RowId[]; // confirmed auto rows that have not merged
};

// ---------------------------------------------------------------------------------
// The gate predicate (dispatch.md step 5, D2 and F7). One reading, used at proposal
// and again at launch.

const PRIVILEGED = /\b(apply_migration|execute_sql|(?:re)?deploy\w*|merg(?:e|es|ed|ing)|create_session|send\w*|share\w*|secret\w*|token\w*)\b/i;
const COPY = /\b(nyx-voice|copy|wording|string|label|mock|frame)\b/i;

export function gateOf(row: Pick<PageRow, 'what' | 'note' | 'migration'>, issue?: Pick<IssueFact, 'labels'>): Gate {
  const text = `${row.what} ${row.note}`;
  const planGated: string[] = [];
  if (row.migration) planGated.push('migration');
  if (/\bRLS\b|\bpolic(y|ies)\b|\bStorage\b|\bdeletion\b|\bexport\b|rls-privacy-reviewer/.test(text)) planGated.push('RLS, Storage, deletion or export');
  if ((issue?.labels ?? []).includes('Gate: clinical') || /adversarial-reviewer/.test(text)) planGated.push('clinical');
  if (/\bTier-2\b|\bTier 2\b/.test(text) || /docs\/[\w./-]+\.md/.test(text)) planGated.push('Tier-2 spec edit');
  const copyBearing = [...new Set([...text.matchAll(new RegExp(COPY.source, 'gi'))].map((m) => m[0].toLowerCase()))];
  const privileged = text
    .split(/(?<=[.;])\s+/)
    .filter((s) => PRIVILEGED.test(s))
    .map((s) => s.trim());
  const mode = /\b(spec|mock|brief|research|discovery)\b/i.test(text) ? 'DISCOVERY' : 'BUILD';
  return { mode, planGated, copyBearing, privileged, migration: row.migration };
}

// A row may carry `auto` only when this holds (dispatch.md step 5).
export function autoEligible(g: Gate): boolean {
  return g.mode === 'BUILD' && !g.planGated.length && !g.copyBearing.length && !g.privileged.length && !g.migration;
}

// ---------------------------------------------------------------------------------

const ms = (iso: string) => new Date(iso).getTime();

function migrationsIn(files: string[] = []): { number: string; name: string; file: string }[] {
  return files
    .map((f) => /^supabase\/migrations\/(\d+)_(.+)\.sql$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ number: m[1], name: m[2], file: m[0] }));
}

function writesProduction(files: string[], productionLib: string[]): boolean {
  return files.some(
    (f) => f.startsWith('supabase/functions/') || f.startsWith('supabase/migrations/') || productionLib.includes(f) || /app_config/.test(f),
  );
}

function noteWritesProduction(row: PageRow, productionLib: string[]): boolean {
  const t = `${row.what} ${row.note}`;
  return row.migration || /supabase\/functions\/|\bredeploys\b|\bapp_config\b|\bEdge Function\b|\bserver\b/i.test(t) || productionLib.some((f) => t.includes(f));
}

type ProjectCtx = { alias: string; name: string; slug: string; nameSlug: string; page: Page };

function ctxOf(p: ProjectInput): ProjectCtx {
  const page = parsePage(p.description);
  const alias = aliasOf(p.name, page);
  return { alias, name: p.name, slug: slugOf(alias), nameSlug: slugOf(p.name), page };
}

// Step 1's match, row → PRs (newest first).
function matchPrs(ctx: ProjectCtx, prs: PrFact[], issues: Record<string, IssueFact>): Map<RowId, PrFact[]> {
  const out = new Map<RowId, PrFact[]>();
  const add = (row: RowId, pr: PrFact) => {
    const l = out.get(row) ?? [];
    if (!l.includes(pr)) l.push(pr);
    out.set(row, l);
  };
  const rows = ctx.page.rows.filter((r) => r.id);
  const ids = new Set(rows.flatMap((r) => r.id.split(' + ').map(normRow)));
  const owner = new Map<RowId, RowId>(); // '03' → '03 + 04'
  for (const r of rows) for (const part of r.id.split(' + ')) owner.set(normRow(part), r.id);
  const matched = new Set<number>();
  for (const pr of prs) {
    const t = pr.title.toLowerCase();
    const ours =
      t.startsWith(ctx.alias.toLowerCase()) ||
      t.startsWith(ctx.name.toLowerCase()) ||
      pr.headRef.startsWith(`claude/${ctx.slug}-pr`) ||
      pr.headRef.startsWith(`claude/${ctx.nameSlug}-pr`);
    if (!ours) continue;
    const m = /\bPR-(\d{2}[a-z]?)\b/.exec(pr.title) ?? new RegExp(`^claude/(?:${ctx.slug}|${ctx.nameSlug})-pr(\\d{2}[a-z]?)-`).exec(pr.headRef);
    if (m && ids.has(normRow(m[1]))) {
      add(owner.get(normRow(m[1]))!, pr);
      matched.add(pr.number);
    }
  }
  for (const r of rows) {
    if (r.shippedNumber) {
      const pr = prs.find((p) => p.number === r.shippedNumber);
      if (pr) add(r.id, pr), matched.add(pr.number);
    }
    if (r.shippedTitle) {
      const pr = prs.find((p) => p.title.trim() === r.shippedTitle);
      if (pr) add(r.id, pr), matched.add(pr.number);
    }
  }
  // The issue id in a title: the row's own issue, or a sub-issue of it, when no other row
  // shares that issue (11a, 12 and 11b all name CUL-1267: no match by issue there).
  const share = new Map<string, number>();
  for (const r of rows) for (const i of r.issues) share.set(i, (share.get(i) ?? 0) + 1);
  for (const pr of prs) {
    if (matched.has(pr.number)) continue;
    const named = [...pr.title.matchAll(/CUL-\d+/g)].map((m) => m[0]);
    const lifted = named.map((i) => [i, issues[i]?.parentId ?? undefined]).flat().filter((x): x is string => !!x);
    const hit = rows.filter((r) => r.issues.some((i) => lifted.includes(i) && share.get(i) === 1));
    if (hit.length === 1) add(hit[0].id, pr), matched.add(pr.number);
  }
  for (const l of out.values()) l.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  return out;
}

function liveClaim(c: ClaimFact, now: number, prs: PrFact[]): boolean {
  if (c.released) return false;
  const merged = prs.some((p) => p.state === 'merged' && p.headRef === c.branch && p.title.includes(c.issue));
  if (merged) return false;
  const open = prs.some((p) => p.state === 'open' && p.headRef === c.branch);
  return now - ms(c.at) < DAY || open;
}

const isWaiting = (b?: SessionBucket) => b === 'blocked' || b === 'review_ready';

export function planDispatch(input: PlanInput): Plan {
  const now = ms(input.now);
  const cap = input.cap ?? CAP;
  const lib = input.productionLib ?? [];
  const applied = new Set(input.appliedMigrations ?? []);
  const me = ctxOf(input.project);
  const others = (input.others ?? []).map(ctxOf);
  const all = [me, ...others];
  const prsOf = new Map(all.map((c) => [c.alias, matchPrs(c, input.prs, input.issues)]));
  const rowOfPr = new Map<number, { ctx: ProjectCtx; row: PageRow }>();
  for (const c of all)
    for (const [rid, prs] of prsOf.get(c.alias)!)
      for (const pr of prs) rowOfPr.set(pr.number, { ctx: c, row: c.page.rows.find((r) => r.id === rid)! });

  const claims = input.claims.filter((c) => liveClaim(c, now, input.prs));
  const claimByIssue = new Map(claims.map((c) => [c.issue, c]));
  const launchFor = (alias: string, row: RowId) =>
    input.launches.filter((l) => l.project === alias && normRow(l.row) === row).sort((a, b) => ms(b.at) - ms(a.at))[0];

  // ---- parked PRs (step 0 / step 1) --------------------------------------------------
  const parkedPrs = new Map<number, { pr: PrFact; label: string }>();
  for (const pr of input.prs.filter((p) => p.state === 'open')) {
    const hit = rowOfPr.get(pr.number);
    if (!hit) continue;
    const migs = migrationsIn(pr.files);
    const gated = !!hit.row.mergeGate || migs.some((m) => !applied.has(m.name));
    if (!gated) continue;
    const launch = launchFor(hit.ctx.alias, hit.row.id);
    const bucket = launch?.session ? input.sessions[launch.session] ?? 'gone' : undefined;
    const idle = bucket
      ? bucket !== 'working'
      : now - ms(pr.lastCommitAt ?? pr.createdAt) >= DAY && !hit.row.issues.some((i) => claimByIssue.has(i));
    if (idle) parkedPrs.set(pr.number, { pr, label: `${labelRow(hit.ctx, me, hit.row.id)} (#${pr.number}, parked)` });
  }

  // ---- in flight (step 4) -------------------------------------------------------------
  const inFlight: InFlight[] = [];
  const seenIssue = new Set<string>();
  const seenBranch = new Set<string>();
  // Dedup keys are each item's OWN issue and its branch, never a parent or a row's shared
  // issue: two sub-issues of one parent are two sessions (one sub-issue per PR, CUL-1397).
  const push = (f: InFlight) => {
    if (f.issues.some((i) => seenIssue.has(i)) || (f.branch && seenBranch.has(f.branch))) return;
    f.issues.forEach((i) => seenIssue.add(i));
    if (f.branch) seenBranch.add(f.branch);
    inFlight.push(f);
  };
  const prFacts = (pr?: PrFact) => ({
    writesProduction: !!pr && writesProduction(pr.files ?? [], lib),
    migration: !!pr && migrationsIn(pr.files).length > 0,
  });

  // (a) launched rows, every project, that are running or waiting on you
  for (const l of [...input.launches].sort((a, b) => ms(a.at) - ms(b.at))) {
    const ctx = all.find((c) => c.alias === l.project);
    const row = ctx?.page.rows.find((r) => r.id === normRow(l.row));
    const prs = (row && ctx ? prsOf.get(ctx.alias)!.get(row.id) : undefined) ?? input.prs.filter((p) => p.headRef === l.branch);
    const pr = prs.find((p) => p.state === 'open') ?? prs.find((p) => p.state === 'merged');
    if (pr?.state === 'merged') continue;
    if (pr && parkedPrs.has(pr.number)) continue;
    const bucket = l.session ? input.sessions[l.session] ?? 'gone' : 'gone';
    const waiting = !!pr || isWaiting(bucket);
    const running = bucket === 'working';
    if (!waiting && !running) continue; // died
    const label = `${ctx ? labelRow(ctx, me, normRow(l.row)) : `${l.project} ${l.row}`}${pr ? ` (#${pr.number})` : running ? ' (running)' : ''}`;
    const pf = prFacts(pr);
    push({
      label,
      why: 'launch',
      issues: [l.issue],
      branch: pr?.headRef ?? l.branch,
      waitsOnPm: waiting && !running,
      writesProduction: pf.writesProduction || (!!row && noteWritesProduction(row, lib)),
      migration: pf.migration || !!row?.migration,
    });
  }
  // (b) open PRs from claude/* branches with a commit in the last 24 hours, not parked
  for (const pr of input.prs.filter((p) => p.state === 'open' && p.headRef.startsWith('claude/'))) {
    if (parkedPrs.has(pr.number)) continue;
    if (now - ms(pr.lastCommitAt ?? pr.updatedAt ?? pr.createdAt) >= DAY) continue;
    const hit = rowOfPr.get(pr.number);
    const named = [...pr.title.matchAll(/CUL-\d+/g)].map((m) => m[0]);
    const pf = prFacts(pr);
    push({
      label: hit ? `${labelRow(hit.ctx, me, hit.row.id)} (#${pr.number})` : `#${pr.number} (${pr.headRef}, ${ageOf(now, pr.lastCommitAt ?? pr.createdAt)})`,
      why: 'open-pr',
      issues: named,
      branch: pr.headRef,
      waitsOnPm: true,
      ...pf,
    });
  }
  // (c) live claims, this project's or any other
  for (const c of claims) {
    const hit = all.flatMap((ctx) => ctx.page.rows.filter((r) => r.issues.includes(c.issue)).map((row) => ({ ctx, row })))[0];
    const bucket = c.session ? input.sessions[c.session] : undefined;
    push({
      label: hit ? `${labelRow(hit.ctx, me, hit.row.id)} (claim, ${c.branch})` : `${c.issue} (claim, ${c.branch})`,
      why: 'claim',
      issues: [c.issue],
      branch: c.branch,
      waitsOnPm: bucket ? bucket !== 'working' : false,
      writesProduction: !!hit && noteWritesProduction(hit.row, lib),
      migration: !!hit?.row.migration,
    });
  }

  // ---- reservations (step 3) ---------------------------------------------------------
  const reserving = input.prs.filter(
    (p) => p.state === 'open' && (parkedPrs.has(p.number) || now - ms(p.updatedAt ?? p.lastCommitAt ?? p.createdAt) < FORTNIGHT),
  );
  const holderOf = (pr: PrFact) => {
    const hit = rowOfPr.get(pr.number);
    return `#${pr.number}${hit ? ` (${labelRow(hit.ctx, me, hit.row.id)}${parkedPrs.has(pr.number) ? ', parked' : ''})` : ''}`;
  };
  const fileHolders = new Map<string, string[]>();
  for (const pr of reserving) for (const f of pr.files ?? []) fileHolders.set(f, [...(fileHolders.get(f) ?? []), holderOf(pr)]);
  const migrationNumbers: Record<string, string[]> = {};
  for (const f of input.mainMigrations) {
    const m = /^(\d+)_/.exec(f.replace(/^supabase\/migrations\//, ''));
    if (m) migrationNumbers[m[1]] = [...(migrationNumbers[m[1]] ?? []), 'main'];
  }
  const prMigrations = reserving
    .flatMap((pr) => migrationsIn(pr.files).map((m) => ({ pr, ...m })))
    .sort((a, b) => a.pr.number - b.pr.number);
  for (const m of prMigrations) migrationNumbers[m.number] = [...(migrationNumbers[m.number] ?? []), holderOf(m.pr)];
  // The lower PR keeps a number; main outranks every PR (the migration-numbers CI job's rule).
  const clashes: MigrationClash[] = Object.entries(migrationNumbers)
    .filter(([, h]) => h.length > 1)
    .map(([number, h]) => ({ number, keeps: h[0], renumbers: h.slice(1) }));
  const top = Math.max(0, ...Object.keys(migrationNumbers).map(Number));
  const nextMigration = String(top + 1).padStart(3, '0');

  // ---- slots and sub-limits (step 4) -------------------------------------------------
  const parked = [...parkedPrs.values()].map(({ pr, label }) => ({ pr: pr.number, label, files: pr.files ?? [] }));
  const subLimits = {
    waitingOnPm: inFlight.filter((f) => f.waitsOnPm).length,
    writesProduction: inFlight.filter((f) => f.writesProduction).length + parked.filter((p) => writesProduction(p.files, lib)).length,
    migrations: inFlight.filter((f) => f.migration).length,
  };
  const firstDispatch = !!input.project.firstDispatch;
  const rawSlots = cap - inFlight.length;
  const slots = Math.max(0, firstDispatch ? Math.min(1, rawSlots) : rawSlots);
  const arithmetic = `${cap}${inFlight.length ? inFlight.map((f) => ` − ${f.label}`).join('') : ' − nothing in flight'} = ${rawSlots}${firstDispatch ? ' (first dispatch: 1 slot at most)' : ''}`;

  // ---- verdicts (step 3) -------------------------------------------------------------
  const myPrs = prsOf.get(me.alias)!;
  const stateOf = (row: PageRow): RowState => {
    const prs = myPrs.get(row.id) ?? [];
    const open = prs.find((p) => p.state === 'open');
    if (open) return parkedPrs.has(open.number) ? { kind: 'parked', pr: open.number } : { kind: 'open', pr: open.number };
    const merged = prs.find((p) => p.state === 'merged');
    if (merged) return { kind: 'merged', pr: merged.number };
    const l = launchFor(me.alias, row.id);
    if (l?.session && input.sessions[l.session] === 'working') return { kind: 'running', since: l.at, branch: l.branch };
    return { kind: 'none' };
  };
  const states = new Map(me.page.rows.filter((r) => r.id).map((r) => [r.id, stateOf(r)]));
  // `03 + 04` ships as one row: an order rule or a path names its parts.
  const partsOf = (id: RowId) => id.split(' + ').map(normRow);
  const rowOfPart = (part: RowId) => [...states.keys()].find((k) => k === part || partsOf(k).includes(part));
  const mergedRow = (id: RowId) => {
    const own = [...states.entries()].find(([k]) => k === id || k.split(' + ').map(normRow).includes(id));
    return own?.[1].kind === 'merged';
  };
  const busy = (part: RowId) => {
    const id = rowOfPart(part);
    const s = id ? states.get(id)?.kind : undefined;
    return s === 'open' || s === 'running' || s === 'parked' || !!me.page.rows.find((r) => r.id === id)?.issues.some((i) => claimByIssue.has(i));
  };

  // Files held by in-flight rows (not yet a PR): their Hotspot names.
  const rowHotspotHolders = new Map<string, string[]>();
  for (const c of all)
    for (const r of c.page.rows) {
      if (!r.id) continue;
      const l = launchFor(c.alias, r.id);
      const working = l?.session && input.sessions[l.session] === 'working';
      const claimed = r.issues.some((i) => claimByIssue.has(i));
      const hasOpen = (prsOf.get(c.alias)!.get(r.id) ?? []).some((p) => p.state === 'open');
      if ((working || claimed) && !hasOpen)
        for (const h of r.hotspots) rowHotspotHolders.set(h, [...(rowHotspotHolders.get(h) ?? []), labelRow(c, me, r.id)]);
    }

  const rankOf = (id: RowId) => {
    let best = Infinity;
    me.page.paths.forEach((p, i) => {
      for (const part of partsOf(id)) {
        const at = p.steps.indexOf(part);
        if (at >= 0) best = Math.min(best, i * 1000 + at);
      }
    });
    return best;
  };

  const verdicts: Verdict[] = [];
  const issueRows = new Map<string, RowId[]>();
  for (const r of me.page.rows.filter((r) => r.id && states.get(r.id)?.kind !== 'merged'))
    for (const i of r.issues) issueRows.set(i, [...(issueRows.get(i) ?? []), r.id]);

  for (const row of me.page.rows) {
    const issue = row.issues[0];
    const gate = gateOf(row, issue ? input.issues[issue] : undefined);
    const state = row.id ? states.get(row.id)! : ({ kind: 'none' } as RowState);
    const v: Verdict = {
      row: row.id,
      issue,
      what: row.what,
      state,
      ready: false,
      reasons: [],
      holds: [],
      flags: [],
      gate,
      rank: row.id ? rankOf(row.id) : Infinity,
      waitsOnPmIfLaunched: gate.planGated.length > 0 || !!row.mergeGate || row.migration,
      writesProduction: noteWritesProduction(row, lib),
    };
    verdicts.push(v);
    if (!row.id) {
      v.reasons.push(row.unreadable ?? `no PR number (${row.cell || '—'})`);
      continue;
    }
    if (state.kind === 'merged') continue;
    if (state.kind === 'open' || state.kind === 'parked') v.reasons.push(`an open PR: #${state.pr}${state.kind === 'parked' ? ' (parked)' : ''}`);
    if (state.kind === 'running') v.reasons.push(`running since ${state.since}`);
    if (row.shippedTitle && !(myPrs.get(row.id) ?? []).length) v.reasons.push(`unmatched: the page says shipped ("${row.shippedTitle}") and no PR has that title`);

    for (const a of row.after) holdFor(a, v, mergedRow, input.issues);

    for (const rule of me.page.order) {
      const mine = partsOf(row.id).filter((x) => rule.rows.includes(x));
      if (!mine.length) continue;
      if (rule.kind === 'chain') {
        const first = Math.min(...mine.map((x) => rule.rows.indexOf(x)));
        const before = rule.rows.slice(0, first).filter((x) => !mergedRow(x));
        if (before.length) v.reasons.push(`after ${before.map((b) => `PR-${b}`).join(', ')} in "${firstWords(rule.text)}" (strictly in order)`);
      } else if (rule.kind === 'one-at-a-time') {
        const live = rule.rows.filter((x) => !mine.includes(x) && busy(x));
        if (live.length) v.reasons.push(`one at a time with ${live.map((b) => `PR-${b}`).join(', ')}, which is in flight`);
      }
    }

    for (const i of row.issues) {
      const c = claimByIssue.get(i);
      if (c && state.kind !== 'open') v.reasons.push(`a live claim on ${i} (${c.branch}, ${c.at})`);
      const f = input.issues[i];
      for (const b of f?.blockedBy ?? [])
        if (b.open) {
          v.reasons.push(`its issue waits: ${i} is blocked by ${b.id}`);
          if (b.waitingOnPm) v.holds.push({ key: b.id, kind: 'waits', text: `${b.id} (blocks ${i})` });
        }
      if (f?.waits) v.reasons.push(`its issue says it waits: "${f.waits}"`);
    }

    // Hotspots and migration numbers, repo-wide.
    const ownPrs = new Set((myPrs.get(row.id) ?? []).map((p) => `#${p.number}`));
    for (const h of row.hotspots) {
      const holders = [
        ...[...fileHolders.entries()].filter(([f]) => f === h || (h.endsWith('/') && f.startsWith(h))).flatMap(([, hs]) => hs),
        ...(rowHotspotHolders.get(h) ?? []).filter((x) => x !== labelRow(me, me, row.id)),
      ].filter((x) => !ownPrs.has(x.split(' ')[0]));
      if (holders.length) v.reasons.push(`hotspot ${h} is held by ${[...new Set(holders)].join(', ')}`);
    }
    if (state.kind === 'open' || state.kind === 'parked') {
      for (const c of clashes)
        for (const r of c.renumbers)
          if (r.startsWith(`#${state.pr} `) || r === `#${state.pr}`) v.reasons.push(`migration ${c.number} clashes with ${c.keeps}; #${state.pr} renumbers to ${nextMigration}`);
    }

    // Sub-issue need: the issue is also another unmerged row's issue.
    if (row.issues.some((i) => (issueRows.get(i) ?? []).some((x) => x !== row.id))) v.flags.push('needs a sub-issue');
    if (row.migration) v.flags.push('migration');
    if (row.mergeGate) v.flags.push(`merge gate: ${row.mergeGate}`);
    if (gate.privileged.length) v.flags.push(...gate.privileged.map((s) => `privileged verb in excerpt ("${s}")`));
  }

  // Sub-limits hold an otherwise ready row; a row that will wait on the PM, write
  // production or add a migration is checked against what is already in flight plus the
  // rows proposed ahead of it.
  const candidates = verdicts.filter((v) => v.row && v.state.kind !== 'merged' && !v.reasons.length).sort((a, b) => a.rank - b.rank || order(me, a.row) - order(me, b.row));
  const used = { ...subLimits };
  const proposal: RowId[] = [];
  const overCap: RowId[] = [];
  for (const v of candidates) {
    const row = me.page.rows.find((r) => r.id === v.row)!;
    if (v.waitsOnPmIfLaunched && used.waitingOnPm >= SUB_LIMITS.waitingOnPm) v.reasons.push(`waiting on the PM: ${used.waitingOnPm} of ${SUB_LIMITS.waitingOnPm}`);
    if (v.writesProduction && used.writesProduction >= SUB_LIMITS.writesProduction) v.reasons.push(`writes production: ${used.writesProduction} of ${SUB_LIMITS.writesProduction}`);
    if (row.migration && used.migrations >= SUB_LIMITS.migrations) v.reasons.push(`migrations: ${used.migrations} of ${SUB_LIMITS.migrations}`);
    if (v.reasons.length) continue;
    v.ready = true;
    if (proposal.length < slots) {
      proposal.push(v.row);
      if (v.waitsOnPmIfLaunched) used.waitingOnPm++;
      if (v.writesProduction) used.writesProduction++;
      if (row.migration) used.migrations++;
    } else overCap.push(v.row);
  }

  // ---- holds on the PM (step 3) ------------------------------------------------------
  type Tally = { key: string; text: string; rowsHeld: RowId[]; freesOutright: RowId[] };
  const pmMap = new Map<string, Tally>();
  const gateMap = new Map<string, Tally>();
  for (const v of verdicts.filter((x) => x.row && !x.ready && x.state.kind !== 'merged')) {
    for (const h of v.holds) {
      const target = h.kind === 'release' || h.kind === 'ga' ? gateMap : pmMap;
      const e = target.get(h.key) ?? { key: h.key, text: h.text, rowsHeld: [], freesOutright: [] };
      e.rowsHeld.push(v.row);
      // Frees outright: this hold is the row's only remaining reason.
      if (v.reasons.length === 1 && v.holds.length === 1) e.freesOutright.push(v.row);
      target.set(h.key, e);
    }
  }
  const bestRank = (rows: RowId[]) => Math.min(...rows.map((r) => verdicts.find((v) => v.row === r)!.rank));
  const pmHolds = [...pmMap.values()].sort(
    (a, b) => b.freesOutright.length - a.freesOutright.length || b.rowsHeld.length - a.rowsHeld.length || bestRank(a.rowsHeld) - bestRank(b.rowsHeld),
  );

  const autoRows = (input.previousAuto ?? []).map(normRow).filter((r) => !mergedRow(r));

  return {
    alias: me.alias,
    slug: me.slug,
    nameSlug: me.nameSlug,
    page: me.page,
    verdicts,
    inFlight,
    parked,
    slots,
    arithmetic,
    subLimits,
    reservations: [...fileHolders.entries()].map(([file, holders]) => ({ file, holders })).sort((a, b) => a.file.localeCompare(b.file)),
    migrationNumbers,
    clashes,
    nextMigration,
    proposal,
    overCap,
    pmHolds,
    gateHolds: [...gateMap.values()].map(({ key, text, rowsHeld }) => ({ key, text, rowsHeld })),
    autoRows,
  };
}

function holdFor(a: AfterItem, v: Verdict, merged: (id: RowId) => boolean, issues: Record<string, IssueFact>) {
  switch (a.kind) {
    case 'pr':
      if (!merged(a.row)) v.reasons.push(`after PR-${a.row}, not merged`);
      return;
    case 'satisfied':
      return;
    case 'issue-merged':
      if (issues[a.issue]?.state !== 'Done') {
        v.reasons.push(`after ${a.issue}, not done`);
        v.holds.push({ key: a.issue, kind: 'pm', text: a.text });
      }
      return;
    case 'release':
      v.reasons.push(`a release gate in After: "${a.text}" (move it to a Merge gate)`);
      v.holds.push({ key: a.text, kind: 'release', text: a.text });
      return;
    case 'ga':
      v.reasons.push(`a GA gate in After: "${a.text}" (move it to the build note)`);
      v.holds.push({ key: a.text, kind: 'ga', text: a.text });
      return;
    case 'ruling':
      v.reasons.push(`a ruling: "${a.text}"`);
      v.holds.push({ key: a.key, kind: 'ruling', text: a.text });
      return;
    case 'pm': {
      if (/^CUL-\d+$/.test(a.key) && issues[a.key]?.state === 'Done') return;
      v.reasons.push(`a PM action: "${a.text}"`);
      v.holds.push({ key: a.key, kind: 'pm', text: a.text });
      return;
    }
    case 'partial':
      v.reasons.push(`a partial or conditional After: "${a.text}"`);
      return;
    case 'group':
      v.reasons.push(`a lane or group, not a PR: "${a.text}"`);
      return;
    case 'unknown':
      v.reasons.push(`could not read After item "${a.text}"`);
  }
}

function labelRow(ctx: ProjectCtx, me: ProjectCtx, row: RowId): string {
  return ctx === me ? `PR-${row}` : `${ctx.alias} PR-${row}`;
}

function order(ctx: ProjectCtx, row: RowId): number {
  return ctx.page.rows.findIndex((r) => r.id === row);
}

function firstWords(text: string): string {
  return text.replace(/[`*]/g, '').split(/[.:(]/)[0].trim().slice(0, 40);
}

export function ageOf(now: number, iso: string): string {
  const h = Math.floor((now - ms(iso)) / 3600000);
  return h < 1 ? `${Math.max(0, Math.floor((now - ms(iso)) / 60000))}m` : `${h}h`;
}
