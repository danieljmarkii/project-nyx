// The sort (retro 4's D1, ruled A 2026-10-11; CUL-1872): every finding a session files goes
// through one of four doors, and only what can hurt an owner or blocks the goal asks for
// the PM's attention now. `.claude/commands/dispatch.md` § The sort and step 1's "Issues
// with no row", as a function.
//
// WHY A SCRIPT. The rule existed as prose on 10/9 ("Wave 7 by default") and fired
// approximately never (retro 2's L2). Here the order is structural: the harm read runs on
// every finding BEFORE anything can cover, skip or park it, so a QUIET finding cannot be
// hidden by being named on the page, carrying `Waiting on PM` or having a `Skipped` comment.
//
// THE BURDEN OF PROOF IS ON DARK. Code is live until the production read proves it dark:
// a key is dark only when its production value is `false`, or `{"enabled": false}` with an
// allowlist that is present and empty. A failed read, a key missing from production, no key
// named at all, an applied (or on-main) migration, or any live surface the dispatcher names
// is live. Proof is the only thing that moves a finding quieter; judgment may only move one
// toward harm, with one exception the rule text allows (an untagged finding whose own text
// plainly is LOUD-only, polish or a process idea), which must come in QUOTED and prints.
//
// Pure: the reads (Linear, `select key, value from app_config` through the production-read
// hook, `list_migrations`) come in as data; nothing here reads the network or the clock.
//
// STATED BLIND SPOTS (C-38):
//   - The script trusts the filer's tag. A finding tagged LOUD that can in fact quiet a
//     warning parks; the source PR's adversarial pass is what checks the tag.
//   - Which keys, migrations and live surfaces a finding sits behind is the dispatcher's
//     reading of its code. A key it never names is invisible, so NO key named reads live.
//   - Which arm of a flag the code is in is the dispatcher's reading too. Only code read as
//     the ON arm can be dark: the off arm is what every account not on an allowlist runs,
//     so an unstated arm reads live.
//   - Which keys are read through the allowlist resolver comes from the code (cli.ts derives
//     it from `lib/appConfig.ts` ALLOWLIST_FLAG_KEYS and `_shared/engineFlags.ts`
//     ENGINE_KEYS). A key read through `resolveFlagValue` somewhere else as well would be on
//     under the object shape there; the object shape is honoured only for those lists.
//   - Once any Direction tag is present, "quiet" anywhere in the text makes it QUIET: a LOUD
//     finding that mentions a quiet arm reads QUIET and goes to door 1 (loud, by design).
//   - Only `Gate: clinical` and `Gate: privacy` are harm labels (the two door 2 writes); the
//     older `Gate: design` / `device` / `deploy` labels gate other things and are not read.
//   - A finding filed with a LOUD tag over a quieting effect parks unless it names a `harm`
//     kind or carries a harm label; a second `Direction:` line naming QUIET wins.
//   - An issue with no `Direction:` line, no `relatedTo`, no gate label and no findings
//     milestone, filed outside the project, is not in the population (the groomer's
//     *Misrouted* report is its only reader).
//   - "Covered" is a word-bounded match of the id in the page outside the Board.

import { normRow, type Page, type RowId } from './page.ts';

export const V12_START = '2026-10-03T00:00:00Z'; // the project window; it never moves
export const SORT_START = '2026-10-11T00:00:00Z'; // team-wide Direction / relatedTo reads
export const LIVE_HARM = 'Live harm';
export const WAITING_ON_PM = 'Waiting on PM';
export const FINDINGS_MILESTONE = /found along the way/i;
export const HARM_GATES = ['Gate: clinical', 'Gate: privacy'];
const DAY = 24 * 3600 * 1000;

export type Direction = 'QUIET' | 'LOUD' | 'neither';
export type HarmKind = 'quiet' | 'corruption' | 'exposure' | 'loss';
export type ParkKind = 'err loud' | 'polish' | 'other';

export type Candidate = {
  id: string;
  title: string;
  description: string;
  inProject: boolean; // in the project being dispatched
  project?: string | null; // its project's name, for the --row offer
  createdAt: string;
  open: boolean;
  labels: string[];
  parentId?: string | null;
  milestone?: string | null;
  blocks?: string[]; // open `blocks` relations, by issue id
  relatedTo?: string[];
  skipped?: boolean; // a `**Skipped for the run order**` comment
  // The live-or-dark reading of its code (the dispatcher's, from the code it names).
  keys?: string[]; // app_config keys the code sits behind
  migrations?: string[]; // migrations, triggers or policies it names or its code depends on
  liveSurfaces?: string[]; // a deployed function, data a live reader reads, unflagged code
  arm?: 'on' | 'off' | 'both'; // which arm of its flag the code is in; only 'on' can be dark
  // What it can do. Any value makes it harm whatever its tag: a `neither` or LOUD finding
  // that can expose, lose or corrupt data is door 1 or 2 (§ The sort, door 1's first cell).
  harm?: HarmKind;
  reading?: { kind: 'loud' | 'polish' | 'other'; quote: string }; // untagged only, quoted
  kind?: 'polish' | 'other'; // a `neither` finding's parked kind
};

export type Door = 1 | 2 | 3 | 4;

export type Sorted = {
  id: string;
  finding: boolean; // false: asked-for work
  direction: Direction | 'untagged';
  harm: boolean;
  door: Door | 'covered' | 'asked';
  why: string[]; // the read, in words
  park?: ParkKind;
  blocksRow?: RowId; // door 3: the on-path row it blocks
  goLives?: string[];
  unlink?: string[]; // a parked finding's parent and `blocks` targets
};

export type Write = { issue: string; write: string; why: string };

export type NoRowProposal = { id: string; title: string; pr: string; after: string; blocks: RowId; migration: boolean; outside: boolean };
export type LiveFix = { id: string; title: string; project: string; claimed: boolean; since: string; stopgap: string };

export type SortInput = {
  now: string;
  page: Page;
  candidates: Candidate[];
  appConfig?: Record<string, unknown> | null; // production; absent or null: the read failed
  appliedMigrations?: string[];
  mainMigrations: string[];
  unmergedMigrations?: string[]; // migration files only in open PRs
  allowlistKeys?: string[]; // keys the code reads through the allowlist resolver
  goLives?: Record<string, string>; // key → its go-live issue
  issueStates?: Record<string, string>; // Linear state names, for go-lives
  rowIssues: Map<string, RowId>; // issue id → unmerged row, this project
  rowState: (row: RowId) => 'merged' | 'unmerged';
  claimed: Set<string>; // issues with a live claim
  lastRun?: string; // the digest counts what was filed since
  index?: string; // the ruling index, never offered
};

export type SortResult = {
  sorted: Sorted[];
  writes: Write[];
  noRow: NoRowProposal[];
  liveFixes: LiveFix[];
  unlink: { id: string; targets: string[] }[];
  digest: string;
};

const ms = (iso: string) => new Date(iso).getTime(); // parsed, never lexical (C-40)
// Labels compare case- and space-insensitively: `gate: clinical`, `Gate:clinical` and
// `live harm` are the same label to a reader, so they are to the sort.
const labelKey = (l: string) => l.toLowerCase().replace(/\s+/g, '');
const hasLabel = (labels: string[], want: string) => labels.some((l) => labelKey(l) === labelKey(want));
const hasGate = (labels: string[]) => HARM_GATES.some((g) => hasLabel(labels, g));

// Step 1's population: the project's issues since 10-03, every open team-wide issue
// labelled `Live harm` or `Gate:` (no date window), and every open issue since 10-11
// carrying a `Direction:` line or a `relatedTo`.
export function inPopulation(c: Candidate): boolean {
  if (!c.open) return false;
  if (c.inProject && ms(c.createdAt) >= ms(V12_START)) return true;
  if (hasLabel(c.labels, LIVE_HARM) || hasGate(c.labels)) return true;
  return ms(c.createdAt) >= ms(SORT_START) && (hasDirectionLine(c.description) || !!c.relatedTo?.length);
}

// `Direction: QUIET`, in any shape a filer writes it: bold, a list item, a heading, a table
// cell (`| Direction | QUIET |`) or a table column headed `Direction` (the `|` after it is
// a separator, and a column's first value is the `---` rule, which no tag reads), mid-line after a
// TL;DR, and with any separator or none (`Direction — QUIET`, `Direction = LOUD`,
// `**Direction** neither`). `Directions` and `Direction of travel` are prose, never a tag.
const DIRECTION = /\bDirection\b[*_`\s]*[:|][*_`|\s]*([^\n|]*)/gi;
const DIRECTION_LOOSE = /\bDirection\b[*_`\s]*(?:[—–=-]+[*_`\s]*)?(QUIET|LOUD|neither)\b/gi;
const hasDirectionLine = (d: string) =>
  new RegExp(DIRECTION.source, 'i').test(d) || new RegExp(DIRECTION_LOOSE.source, 'i').test(d);

// A class goes by its worst instance, and the burden is on LOUD: once any Direction tag is
// present, the word "quiet" (or "quieter", "quiets") ANYWHERE in the issue makes it QUIET,
// whatever order the lines come in; a tag value that names neither LOUD nor neither is no
// tag, which counts as QUIET. Only a description whose every tag value is LOUD or neither,
// and which never says quiet, is LOUD or neither.
export function directionOf(description: string): Direction | undefined {
  if (!hasDirectionLine(description)) return undefined;
  if (/\bquiet/i.test(description)) return 'QUIET';
  const values = [...description.matchAll(DIRECTION)].map((m) => m[1]).concat([...description.matchAll(DIRECTION_LOOSE)].map((m) => m[1]));
  let loud = false;
  for (const v of values) {
    const l = /\bloud\b/i.test(v);
    if (!l && !/\bneither\b/i.test(v)) return undefined;
    loud ||= l;
  }
  return loud ? 'LOUD' : 'neither';
}

export function isFinding(c: Candidate): boolean {
  return (
    hasDirectionLine(c.description) ||
    hasLabel(c.labels, LIVE_HARM) ||
    hasGate(c.labels) ||
    !!c.relatedTo?.length ||
    (!!c.milestone && FINDINGS_MILESTONE.test(c.milestone))
  );
}

// A key is dark only when its production value is `false`, or `{"enabled": false}` with an
// allowlist that is present and empty AND the code reads the key through the allowlist
// resolver. `{"enabled": true, "allowlist": []}` is on for everyone; an allowlist naming
// any account, the PM's included, is live. A kill switch read by `resolveFlagValue` (every
// non-boolean resolves to its fallback, `true` for the AI-read gates) is on for everyone
// under the object shape, so the object counts only for an allowlist-read key.
export function keyDark(value: unknown, allowlistRead = false): boolean {
  if (value === false) return true;
  if (!allowlistRead || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return o.enabled === false && Array.isArray(o.allowlist) && o.allowlist.length === 0;
}

const migrationKey = (m: string) =>
  m.replace(/^.*\//, '').replace(/\.sql$/, '').replace(/^\d+[a-z]?_/, '').replace(/-/g, '_').toLowerCase();

export type LiveFacts = Pick<Candidate, 'keys' | 'migrations' | 'liveSurfaces' | 'arm'>;
export type DarkContext = {
  appConfig?: Record<string, unknown> | null;
  appliedMigrations?: string[];
  mainMigrations: string[];
  unmergedMigrations?: string[];
  allowlistKeys?: string[];
};

// Why the code is live, or [] when the production read proves it dark. Every branch that
// cannot prove dark says live: the burden of proof is on dark.
export function liveReasons(c: LiveFacts, ctx: DarkContext): string[] {
  const why: string[] = [];
  for (const s of c.liveSurfaces ?? []) why.push(`live surface: ${s}`);
  if (c.arm === 'off' || c.arm === 'both') why.push("the code is in the flag's off arm, which every account not on an allowlist runs");
  else if (c.arm !== 'on') why.push('which arm of the flag the code is in is not stated (the off arm runs for every account)');
  const keys = c.keys ?? [];
  if (!keys.length) why.push('no app_config key identified');
  const allowlist = new Set(ctx.allowlistKeys ?? []);
  if (!ctx.appConfig) why.push('the production app_config read failed or was not taken');
  else
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(ctx.appConfig, k)) why.push(`${k} is missing from production app_config`);
      else if (!keyDark(ctx.appConfig[k], allowlist.has(k)))
        why.push(`${k} is ${JSON.stringify(ctx.appConfig[k])} in production${allowlist.has(k) ? '' : ' (not read through the allowlist resolver, so only false is dark)'}`);
    }
  // A named migration is dark only when it matches a migration file that is still only in
  // an open PR and is not applied. A trigger, a policy, or a name that matches no file reads
  // live: an applied trigger or policy is always live, and an unmatched name cannot be shown
  // unapplied.
  const onMain = new Set(ctx.mainMigrations.map(migrationKey));
  const unmerged = new Set((ctx.unmergedMigrations ?? []).map(migrationKey));
  const applied = ctx.appliedMigrations ? new Set(ctx.appliedMigrations.map(migrationKey)) : undefined;
  for (const m of c.migrations ?? []) {
    const k = migrationKey(m);
    if (!applied) why.push(`migration ${m}: the applied list was not read`);
    else if (applied.has(k)) why.push(`migration ${m} is applied`);
    else if (onMain.has(k)) why.push(`migration ${m} is on main`);
    else if (!unmerged.has(k)) why.push(`${m} matches no unmerged migration file, so it cannot be shown unapplied`);
  }
  return why;
}

export function sortFindings(input: SortInput): SortResult {
  const now = ms(input.now);
  const pop = input.candidates.filter(inPopulation);
  const onPath = new Set((input.page.doneMeans ?? []).map(normRow));
  const pathRowOf = (issue: string): RowId | undefined => {
    const row = input.rowIssues.get(issue);
    if (!row || input.rowState(row) === 'merged') return undefined;
    return row.split(' + ').map(normRow).some((p) => onPath.has(p)) ? row : undefined;
  };
  // (c) Covered and skipped suppress only a door-3 offer, never the harm read above it.
  const offerSuppressed = (c: Candidate) =>
    new RegExp(`\\b${c.id}\\b`).test(input.page.plain) || !!c.skipped || hasLabel(c.labels, WAITING_ON_PM) || c.id === input.index;

  const sorted: Sorted[] = [];
  const writes: Write[] = [];
  for (const c of pop) {
    const finding = isFinding(c);
    const tag = directionOf(c.description);
    const direction: Sorted['direction'] = tag ?? 'untagged';
    const s: Sorted = { id: c.id, finding, direction, harm: false, door: 'asked', why: [] };
    sorted.push(s);

    if (finding) {
      // (a) The harm read, first, on every finding: nothing below can cover, skip or park it.
      const labelled = hasLabel(c.labels, LIVE_HARM) || hasGate(c.labels);
      // A reading applies only to an untagged finding: an explicit QUIET is harm above it.
      const readAway = !!c.reading && c.reading.quote.trim().length > 0;
      s.harm = labelled || tag === 'QUIET' || (!tag && !readAway) || c.harm !== undefined;
      if (labelled) s.why.push(`labelled ${c.labels.filter((l) => labelKey(l) === labelKey(LIVE_HARM) || HARM_GATES.some((g) => labelKey(g) === labelKey(l))).join(', ')}`);
      if (tag === 'QUIET') s.why.push('tagged QUIET');
      if (c.harm !== undefined) s.why.push(`it can ${c.harm === 'quiet' ? 'quiet a warning' : c.harm === 'corruption' ? 'corrupt what a live reader shows' : c.harm === 'exposure' ? 'expose data' : 'lose data'}`);
      if (!tag && !readAway) s.why.push('untagged, so QUIET');
      if (!tag && readAway) s.why.push(`untagged, read as ${c.reading!.kind}: "${c.reading!.quote.trim()}"`);

      if (s.harm) {
        const live = liveReasons(c, input);
        const goLives = [...new Set((c.keys ?? []).map((k) => input.goLives?.[k]))];
        const missingGoLive = (c.keys ?? []).filter((k) => !input.goLives?.[k]).map((k) => `${k} has no go-live issue`);
        const closed = goLives
          .filter((g): g is string => !!g)
          .filter((g) => {
            const st = input.issueStates?.[g];
            return !st || /^(Done|Canceled|Cancelled|Duplicate)$/i.test(st);
          })
          .map((g) => `go-live ${g} is ${input.issueStates?.[g] ?? 'unread'}`);
        const unblocked = goLives.filter((g): g is string => !!g && !(c.blocks ?? []).includes(g)).map((g) => `no blocks relation to go-live ${g}`);
        if (live.length) {
          s.door = 1;
          s.why.push(...live);
        } else if (missingGoLive.length || closed.length || unblocked.length) {
          s.door = 1;
          s.why.push('proven dark', ...missingGoLive, ...closed, ...unblocked);
        } else {
          s.door = 2;
          s.goLives = goLives as string[];
          s.why.push(`proven dark: ${(c.keys ?? []).map((k) => `${k} ${JSON.stringify(input.appConfig![k])}`).join(', ')}`);
        }

        if (s.door === 1) {
          if (!hasLabel(c.labels, LIVE_HARM)) writes.push({ issue: c.id, write: `add label ${LIVE_HARM}`, why: s.why.join('; ') });
          const unclaimed = !input.claimed.has(c.id) && now - ms(c.createdAt) >= DAY;
          if (unclaimed && !hasLabel(c.labels, WAITING_ON_PM)) writes.push({ issue: c.id, write: `add label ${WAITING_ON_PM}`, why: `${LIVE_HARM} with no live claim 24 hours after it was filed` });
        } else {
          if (hasLabel(c.labels, LIVE_HARM)) writes.push({ issue: c.id, write: `remove label ${LIVE_HARM}`, why: s.why.join('; ') });
          if (!hasGate(c.labels)) {
            const g = c.harm === 'exposure' || c.harm === 'loss' ? 'Gate: privacy' : 'Gate: clinical';
            writes.push({ issue: c.id, write: `add label ${g}`, why: 'a door-2 gate carries its Gate: label so no prune can close it' });
          }
        }
        continue;
      }

      // (b) Not harm. Only a `neither` finding can block the goal; LOUD-only always parks.
      const row = tag === 'neither' ? (c.blocks ?? []).map(pathRowOf).find(Boolean) : undefined;
      if (row) {
        s.blocksRow = row;
        s.door = offerSuppressed(c) ? 'covered' : 3;
        s.why.push(`tagged neither; blocks on-path PR-${row}`);
        continue;
      }
      s.door = 4;
      const k: ParkKind = tag === 'LOUD' || c.reading?.kind === 'loud' ? 'err loud' : tag === 'neither' ? c.kind ?? 'other' : c.reading?.kind ?? 'other';
      s.park = k;
      const targets = [...(c.parentId ? [c.parentId] : []), ...(c.blocks ?? [])];
      if (targets.length) s.unlink = targets;
      s.why.push(`parked (${s.park})`);
      continue;
    }

    // (c) Asked-for work: offered only when it blocks an on-path row and nothing covers it.
    const row = (c.blocks ?? []).map(pathRowOf).find(Boolean);
    if (row && c.inProject) {
      s.blocksRow = row;
      s.door = offerSuppressed(c) ? 'covered' : 3;
      s.why.push(`asked-for work; blocks on-path PR-${row}`);
    }
  }

  // Door-3 offers, in ascending id, each with its proposed PR number (step 1).
  const offers = sorted
    .filter((s) => s.door === 3)
    .map((s) => input.candidates.find((c) => c.id === s.id)!)
    .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')));
  const taken = new Set(input.page.rows.map((r) => r.id).filter(Boolean).flatMap((id) => id.split(' + ').map(normRow)));
  const noRow: NoRowProposal[] = [];
  for (const c of offers) {
    const s = sorted.find((x) => x.id === c.id)!;
    const source = sourceRow(c, input.page);
    let pr = '?';
    const own = /\bPR-(\d{2}[a-z]?)\b/.exec(c.title)?.[1];
    if (own && !taken.has(normRow(own))) pr = normRow(own);
    else if (source) {
      const base = normRow(source.split(' + ')[0]).replace(/[a-z]$/, '');
      for (const l of 'abcdefghijklmnopqrstuvwxyz')
        if (!taken.has(`${base}${l}`)) {
          pr = `${base}${l}`;
          break;
        }
    }
    if (pr !== '?') taken.add(pr);
    noRow.push({
      id: c.id,
      title: c.title.split('\n')[0].slice(0, 100),
      pr,
      after: source ? `PR-${source}` : '',
      blocks: s.blocksRow!,
      migration: /\bmigration\b|\bschema\b/i.test(`${c.title} ${c.description}`),
      outside: !c.inProject,
    });
  }

  const liveFixes: LiveFix[] = sorted
    .filter((s) => s.door === 1)
    .map((s) => {
      const c = input.candidates.find((x) => x.id === s.id)!;
      return {
        id: c.id,
        title: c.title.split('\n')[0].slice(0, 80),
        project: c.project ?? (c.inProject ? 'this project' : 'no project'),
        claimed: input.claimed.has(c.id),
        since: c.createdAt,
        stopgap: stopgapOf(c.harm),
      };
    });

  const unlink = sorted.filter((s) => s.unlink).map((s) => ({ id: s.id, targets: s.unlink! }));
  return { sorted, writes, noRow, liveFixes, unlink, digest: digestLine(sorted, input) };
}

// A stopgap fails toward the louder output, or switches the leaking path off; it never
// removes a warning surface with nothing as loud in its place (§ The sort).
export function stopgapOf(harm?: HarmKind): string {
  return harm === 'exposure' || harm === 'loss'
    ? 'if the fix needs a ruling, ship the stopgap first: switch the leaking path off'
    : 'if the fix needs a ruling, ship the stopgap first: force the louder output on where the quieter one shows; never remove a warning with nothing as loud in its place';
}

// The source row of a door-3 offer: the row whose issue is its parent, else the one row
// whose issue or PR number its description names. Two at the same rung, or none: none.
function sourceRow(c: Candidate, page: Page): RowId | undefined {
  const rows = page.rows.filter((r) => r.id);
  if (c.parentId) {
    const hit = rows.filter((r) => r.issues.includes(c.parentId!));
    if (hit.length === 1) return hit[0].id;
    if (hit.length > 1) return undefined;
  }
  const named = rows.filter((r) => r.issues.some((i) => new RegExp(`\\b${i}\\b`).test(c.description)) || r.id.split(' + ').some((p) => new RegExp(`\\bPR-${p}\\b`, 'i').test(c.description)));
  return named.length === 1 ? named[0].id : undefined;
}

function digestLine(sorted: Sorted[], input: SortInput): string {
  const since = input.lastRun ? ms(input.lastRun) : -Infinity;
  const created = new Map(input.candidates.map((c) => [c.id, ms(c.createdAt)]));
  const fresh = sorted.filter((s) => s.finding && (created.get(s.id) ?? 0) > since);
  const live = fresh.filter((s) => s.door === 1);
  const door3 = fresh.filter((s) => s.door === 3);
  const gates = fresh.filter((s) => s.door === 2);
  const parked = fresh.filter((s) => s.door === 4);
  const title = (id: string) => (input.candidates.find((c) => c.id === id)?.title ?? '').split('\n')[0].slice(0, 40);
  const parts = [`${fresh.length}`];
  if (live.length) parts.push(`${live.length} live fix (${live.map((s) => `${s.id}, ${title(s.id)}`).join('; ')})`);
  const byRow = new Map<RowId, number>();
  for (const s of door3) byRow.set(s.blocksRow!, (byRow.get(s.blocksRow!) ?? 0) + 1);
  for (const [row, n] of byRow) parts.push(`${n} blocks PR-${row} (proposed below)`);
  const byGate = new Map<string, number>();
  for (const s of gates) for (const g of s.goLives ?? []) byGate.set(g, (byGate.get(g) ?? 0) + 1);
  for (const [g, n] of byGate) parts.push(`${n} gate on ${g}`);
  const k = (p: ParkKind) => parked.filter((s) => s.park === p).length;
  parts.push(`${parked.length} parked (${k('err loud')} err loud, ${k('polish')} polish, ${k('other')} other)`);
  return `Found since last run: ${parts.join(' · ')}`;
}
