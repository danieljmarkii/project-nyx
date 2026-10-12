// The two alarms (retro 4's D3, ruled A 2026-10-11; CUL-1872): a forecast is a budget.
// `.claude/commands/dispatch.md` § The sort rule 5 and step 3's "The two alarms hold".
//
//   - A ruled feature passes its forecast: the rows under the decision issue whose brief
//     said `Forecast: <n> rows` reach n + 1.
//   - Work with no forecast collects its third follow-up created in seven days under one row.
//
// Either one holds every unlaunched row and door-3 candidate under its root and re-poses
// the fork with its real cost. While the fork is re-posed, the feature's quieter output is
// replaced by a stopgap wherever it is on, so the alarm also says whether the dispatcher
// files a `Live harm` stopgap issue: it does unless every key under the root is proven dark
// from production (the same proof the sort uses). No alarm holds a door-1 fix or a door-2
// gate.
//
// WHY. `may_wait` was briefed as two PRs plus the render and took nine rows and six
// migration files while the louder option stayed on the table (CUL-1611, CUL-1668); PR-23
// collected 23a to 23h before anyone asked whether the latch was right.
//
// Pure: every fact is an argument; nothing here reads the network or the clock.
//
// STATED BLIND SPOTS (C-38):
//   - A row's root is a forecast issue named in its build note, Issue(s) cell or `(of …)`
//     parent. A row that rides a ruled feature without naming its decision issue counts
//     under no forecast, and falls to the follow-up alarm.
//   - A follow-up is an issue created in the window whose parent is the row's issue, or
//     that `blocks` it or is `relatedTo` it. One that names the row only in prose is unseen.

import { normRow, type Page, type PageRow, type RowId } from './page.ts';
import { keyDark } from './sort.ts';

export const FOLLOW_UP_LIMIT = 3;
export const FOLLOW_UP_WINDOW_DAYS = 7;
const DAY = 24 * 3600 * 1000;

export type Root = { id: string; description: string; keys?: string[] };
export type FollowUpFact = { id: string; createdAt: string; parentId?: string | null; blocks?: string[]; relatedTo?: string[] };
export type Door3 = { id: string; blocks: RowId };

export type Alarm = {
  kind: 'forecast' | 'follow-up';
  root: string; // the decision issue, or the row's issue
  rootRow?: RowId; // follow-up alarms: the row
  forecast?: number;
  count: number;
  under: string[]; // what counted: PR-NN rows and CUL-NNN candidates
  holdsRows: RowId[];
  holdsCandidates: string[];
  reason: string; // the hold reason, in words
  fork: string; // the re-posed question
  stopgap: boolean; // file a `Live harm` stopgap issue
  stopgapWhy: string;
};

export type AlarmInput = {
  now: string;
  page: Page;
  roots: Root[];
  followUps: FollowUpFact[];
  door3: Door3[]; // door-3 offers only: a door-1 fix or a door-2 gate is never one, so never held
  rowState: (row: RowId) => 'merged' | 'unlaunched' | 'launched';
  liveHarm: Set<string>; // issues carrying `Live harm` or sorted to door 1 or 2: a row on one is never held
  appConfig?: Record<string, unknown> | null;
  keysOf?: Record<string, string[]>; // a row's issue → the keys its output sits behind
};

const ms = (iso: string) => new Date(iso).getTime();

// `Forecast: 3 rows` (bold or not). The first one on the issue counts.
export function forecastOf(description: string): number | undefined {
  const m = /Forecast:?\**\s*(\d+)\s*rows?\b/i.exec(description);
  return m ? Number(m[1]) : undefined;
}

export function rootOfRow(row: PageRow, roots: Root[]): Root | undefined {
  const text = `${row.note} ${row.issues.join(' ')} ${row.parents.join(' ')}`;
  return roots.find((r) => forecastOf(r.description) !== undefined && new RegExp(`\\b${r.id}\\b`).test(text));
}

function stopgapFor(keys: string[] | undefined, appConfig: AlarmInput['appConfig']): { stopgap: boolean; why: string } {
  if (!keys?.length) return { stopgap: true, why: 'no key named for its output, so it reads as on' };
  if (!appConfig) return { stopgap: true, why: 'the production app_config read failed, so its output reads as on' };
  const on = keys.filter((k) => !Object.prototype.hasOwnProperty.call(appConfig, k) || !keyDark(appConfig[k]));
  return on.length
    ? { stopgap: true, why: `its output is on: ${on.map((k) => `${k} ${JSON.stringify(appConfig[k] ?? 'missing')}`).join(', ')}` }
    : { stopgap: false, why: `every key is dark in production (${keys.join(', ')})` };
}

export function findAlarms(input: AlarmInput): Alarm[] {
  const now = ms(input.now);
  const rows = input.page.rows.filter((r) => r.id);
  const rowOfIssue = new Map<string, PageRow>();
  for (const r of rows) for (const i of r.issues) rowOfIssue.set(i, r);
  const held = (r: PageRow) => input.rowState(r.id) === 'unlaunched' && !r.issues.some((i) => input.liveHarm.has(i));
  const alarms: Alarm[] = [];

  // ---- forecast + 1 -----------------------------------------------------------------
  const forecastRoot = new Map<RowId, Root>();
  for (const r of rows) {
    const root = rootOfRow(r, input.roots);
    if (root) forecastRoot.set(r.id, root);
  }
  for (const root of input.roots) {
    const forecast = forecastOf(root.description);
    if (forecast === undefined) continue;
    const under = rows.filter((r) => forecastRoot.get(r.id) === root);
    const cands = input.door3.filter((d) => {
      const r = rows.find((x) => normRow(x.id) === normRow(d.blocks));
      return r && forecastRoot.get(r.id) === root;
    });
    const count = under.length + cands.length;
    if (count < forecast + 1) continue;
    const s = stopgapFor(root.keys, input.appConfig);
    alarms.push({
      kind: 'forecast',
      root: root.id,
      forecast,
      count,
      under: [...under.map((r) => `PR-${r.id}`), ...cands.map((c) => c.id)],
      holdsRows: under.filter(held).map((r) => r.id),
      holdsCandidates: cands.map((c) => c.id),
      reason: `forecast ${forecast}, now ${count}: back to the PM`,
      fork: `${root.id} forecast ${forecast} rows; there are now ${count} (${[...under.map((r) => `PR-${r.id}`), ...cands.map((c) => c.id)].join(', ')}). Continue at this cost, or take the louder option?`,
      stopgap: s.stopgap,
      stopgapWhy: s.why,
    });
  }

  // ---- the third follow-up in seven days, for work with no forecast ------------------
  const window = FOLLOW_UP_WINDOW_DAYS * DAY;
  const seen = new Map<string, FollowUpFact>();
  for (const f of input.followUps) seen.set(f.id, f);
  for (const r of rows) {
    if (forecastRoot.has(r.id)) continue; // a forecast root counts it instead
    const issue = r.issues[0];
    if (!issue) continue;
    const ups = [...seen.values()].filter(
      (f) =>
        f.id !== issue &&
        now - ms(f.createdAt) <= window &&
        ms(f.createdAt) <= now &&
        (f.parentId === issue || (f.blocks ?? []).includes(issue) || (f.relatedTo ?? []).includes(issue)),
    );
    if (ups.length < FOLLOW_UP_LIMIT) continue;
    const upIds = new Set(ups.map((u) => u.id));
    const underRows = rows.filter((x) => x !== r && x.issues.some((i) => upIds.has(i) || seen.get(i)?.parentId === issue));
    const cands = input.door3.filter((d) => upIds.has(d.id) || normRow(d.blocks) === normRow(r.id));
    const s = stopgapFor(input.keysOf?.[issue], input.appConfig);
    alarms.push({
      kind: 'follow-up',
      root: issue,
      rootRow: r.id,
      count: ups.length,
      under: ups.map((u) => u.id),
      holdsRows: underRows.filter(held).map((x) => x.id),
      holdsCandidates: cands.map((c) => c.id),
      reason: `third follow-up in ${FOLLOW_UP_WINDOW_DAYS} days under PR-${r.id}`,
      fork: `PR-${r.id} has ${ups.length} follow-ups in ${FOLLOW_UP_WINDOW_DAYS} days (${ups.map((u) => u.id).join(', ')}). Is its design right before another?`,
      stopgap: s.stopgap,
      stopgapWhy: s.why,
    });
  }
  return alarms;
}
