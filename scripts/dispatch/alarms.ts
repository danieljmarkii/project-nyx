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
// files a `Live harm` stopgap issue: it does unless the output under the root is proven
// dark by the sort's own proof (`liveReasons`: keys, arm, migrations, live surfaces). No
// alarm holds a door-1 fix or a door-2 gate.
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
//   - A row under a forecast is never follow-up counted: its forecast counts it instead, so
//     with a generous forecast, three follow-ups under one of its rows raise nothing until
//     the root's count passes the forecast.
//   - A follow-up is an issue created in the window whose parent is one of the row's issues
//     (or a parent only that row names), or that `blocks` or is `relatedTo` one of them. One
//     that names the row only in prose is unseen.
//   - A `Forecast:` line the parser cannot read is treated as a forecast of zero, so it
//     alarms at once and asks the PM to restate it: loud, never silent.

import { normRow, type Page, type PageRow, type RowId } from './page.ts';
import type { LiveFacts } from './sort.ts';

export const FOLLOW_UP_LIMIT = 3;
export const FOLLOW_UP_WINDOW_DAYS = 7;
const DAY = 24 * 3600 * 1000;

export type Root = { id: string; description: string } & LiveFacts;
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
  door3: Door3[]; // door-3 offers and covered door-3 findings: never a door-1 fix or a door-2 gate
  rowState: (row: RowId) => 'merged' | 'unlaunched' | 'launched';
  liveHarm: Set<string>; // issues carrying `Live harm` or sorted to door 1 or 2: a row on one is never held
  liveOf: (facts: LiveFacts) => string[]; // the sort's proof (`liveReasons`): [] only when dark
  rowOutputs?: Record<string, LiveFacts>; // a row's issue → what its output sits behind
};

const ms = (iso: string) => new Date(iso).getTime();
const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = (t: string) => (/^\d+$/.test(t) ? Number(t) : WORDS[t.toLowerCase()]);

// `Forecast: 3 rows` in the shapes a brief writes: bold, `~3`, `two rows`, `3 PRs`, a range
// (`2-3 rows`, `2 to 3 rows`: the LOWER bound, so the alarm fires at the earlier count).
// A `Forecast:` line it cannot read is 'unreadable'; none at all is undefined.
export function forecastOf(description: string): number | 'unreadable' | undefined {
  if (!/\bForecast\b[*_\s]*:/i.test(description)) return undefined;
  const w = `\\d+|${Object.keys(WORDS).join('|')}`;
  const m = new RegExp(`\\bForecast\\b[*_\\s]*:[*_\\s]*~?\\s*(${w})(?:\\s*(?:-|–|to)\\s*(?:${w}))?\\s*(?:rows?|PRs?)\\b`, 'i').exec(description);
  return m ? num(m[1]) : 'unreadable';
}

export function rootOfRow(row: PageRow, roots: Root[]): Root | undefined {
  const text = `${row.note} ${row.issues.join(' ')} ${row.parents.join(' ')}`;
  return roots.find((r) => forecastOf(r.description) !== undefined && new RegExp(`\\b${r.id}\\b`).test(text));
}

function stopgapFor(facts: LiveFacts | undefined, liveOf: AlarmInput['liveOf']): { stopgap: boolean; why: string } {
  const why = liveOf(facts ?? {});
  return why.length ? { stopgap: true, why: `its output reads as on: ${why.join('; ')}` } : { stopgap: false, why: 'its output is proven dark in production' };
}

export function findAlarms(input: AlarmInput): Alarm[] {
  const now = ms(input.now);
  const rows = input.page.rows.filter((r) => r.id);
  const held = (r: PageRow) => input.rowState(r.id) === 'unlaunched' && !r.issues.some((i) => input.liveHarm.has(i));
  const alarms: Alarm[] = [];

  // ---- forecast + 1 -----------------------------------------------------------------
  const forecastRoot = new Map<RowId, Root>();
  for (const r of rows) {
    const root = rootOfRow(r, input.roots);
    if (root) forecastRoot.set(r.id, root);
  }
  for (const root of input.roots) {
    const read = forecastOf(root.description);
    if (read === undefined) continue;
    const forecast = read === 'unreadable' ? 0 : read;
    const under = rows.filter((r) => forecastRoot.get(r.id) === root);
    const cands = input.door3.filter((d) => {
      const r = rows.find((x) => normRow(x.id) === normRow(d.blocks));
      return r && forecastRoot.get(r.id) === root;
    });
    const count = under.length + cands.length;
    if (count < forecast + 1) continue;
    const s = stopgapFor(root, input.liveOf);
    const named = [...under.map((r) => `PR-${r.id}`), ...cands.map((c) => c.id)].join(', ');
    alarms.push({
      kind: 'forecast',
      root: root.id,
      forecast,
      count,
      under: [...under.map((r) => `PR-${r.id}`), ...cands.map((c) => c.id)],
      holdsRows: under.filter(held).map((r) => r.id),
      holdsCandidates: cands.map((c) => c.id),
      reason: read === 'unreadable' ? `${root.id}'s Forecast line is unreadable: back to the PM` : `forecast ${forecast}, now ${count}: back to the PM`,
      fork:
        read === 'unreadable'
          ? `${root.id} carries a Forecast line the script cannot read; there are ${count} rows under it (${named}). State it as "Forecast: <n> rows".`
          : `${root.id} forecast ${forecast} rows; there are now ${count} (${named}). Continue at this cost, or take the louder option?`,
      stopgap: s.stopgap,
      stopgapWhy: s.why,
    });
  }

  // ---- the third follow-up in seven days, for work with no forecast ------------------
  const window = FOLLOW_UP_WINDOW_DAYS * DAY;
  const parentCount = new Map<string, number>();
  for (const r of rows) for (const p of r.parents) parentCount.set(p, (parentCount.get(p) ?? 0) + 1);
  for (const r of rows) {
    if (forecastRoot.has(r.id)) continue; // a forecast root counts it instead
    if (!r.issues.length) continue;
    // The row's own issues, plus a parent no other row shares (a shared parent belongs to
    // the feature, not to one row).
    const own = new Set([...r.issues, ...r.parents.filter((p) => parentCount.get(p) === 1)]);
    const touches = (ids?: string[] | null) => (ids ?? []).some((i) => own.has(i));
    const ups = input.followUps.filter(
      (f) => !own.has(f.id) && now - ms(f.createdAt) <= window && ms(f.createdAt) <= now && (touches(f.parentId ? [f.parentId] : []) || touches(f.blocks) || touches(f.relatedTo)),
    );
    if (ups.length < FOLLOW_UP_LIMIT) continue;
    const upIds = new Set(ups.map((u) => u.id));
    const parentOf = new Map(input.followUps.map((f) => [f.id, f.parentId]));
    const underRows = rows.filter((x) => x !== r && x.issues.some((i) => upIds.has(i) || own.has(parentOf.get(i) ?? '')));
    const cands = input.door3.filter((d) => upIds.has(d.id) || normRow(d.blocks) === normRow(r.id));
    const s = stopgapFor(input.rowOutputs?.[r.issues[0]], input.liveOf);
    alarms.push({
      kind: 'follow-up',
      root: r.issues[0],
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
