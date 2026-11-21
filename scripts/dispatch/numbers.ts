// The numbers, recorded automatically (CUL-2862). One window's readout of the PM's
// attention and the pipeline's waits, from facts the dispatcher read. Pure.
//
// WHY. Retro 5 had to dig through transcripts to learn what a row costs and how long
// finished work waits: of 73 November session records, 2 mention cost and none a
// permission prompt. Every claim it made about human minutes was an estimate. This module
// turns the reads the dispatcher already makes (Linear's queue, GitHub's merges and check
// runs, the children's transcripts) into one short readout, led by the number the next
// round of changes is judged on: typed inputs per merged row.
//
// It reads facts, never the network, like cli.ts: the dispatcher's tools are the only
// path to Linear and GitHub from a session, so a script that fetched would run nowhere
// it is needed. A fact the dispatcher could not read is left out, never written as zero:
// the readout then says how many rows a number stands on (`n=`), so an untraced row can
// never pass for a row that needed no word.

export const TYPED_KINDS = ['pick', 'go', 'apply', 'merge', 'ruling'] as const;
export type TypedKind = (typeof TYPED_KINDS)[number];

// Retro 5's baselines (docs/workflow-retro-2026-11.md), printed beside each number.
// Rates are per their own period and scaled to the window's length when printed.
export const BASELINE = {
  greenHoursPer30Days: 474,
  queueArrivalsPerWeek: [8, 9] as const,
  findingsPerPr: 1.4,
  medianCostPerChild: 13.66,
  typedPerRowToday: [3, 7] as const, // a traced follow-up row, 2026-11-21
  typedPerRowTarget: 1, // under 1, off the kept list
};

export type MergedPr = {
  number: number;
  row?: string; // the issue the PR finishes, when one row maps to it
  mergedAt: string;
  greenAt?: string; // the last required check's completion on the merged head (stall.ts checksOf)
  mergedBy?: 'self' | 'pm'; // who said merge: the session under its gate, or the PM's typed word
  costUsd?: number; // the child's reported cost, where the session reports one
  typed?: { kind: TypedKind; at: string }[]; // undefined: not traced; []: traced, none typed
};

export type QueueSpan = { id: string; arrivedAt: string; leftAt?: string | null };

export type NumbersInput = {
  from: string; // window start, inclusive
  to: string; // window end, exclusive
  merged: MergedPr[];
  queue: QueueSpan[]; // every `Waiting on PM` membership that touches the window
  filed: { id: string; createdAt: string }[]; // issues filed in the team
  rollbacks?: { pr: number; at: string }[];
  teamCalls?: { issue: string; cls: string; at: string }[];
};

const t = (iso: string): number => {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`not a time: ${iso}`);
  return ms;
};

export function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Numbers = {
  days: number;
  mergedCount: number;
  typed: { traced: number; total: number; perRow?: number; byKind: Record<TypedKind, number> };
  queue: { arrivals: number; departures: number; openAtEnd: number; medianOpenAgeDays?: number };
  green: { n: number; totalHours: number; medianMinutes?: number; overHour: number };
  merges: { known: number; pm: number; self: number; pmShare?: number };
  filed: { count: number; perMergedPr?: number };
  cost: { n: number; medianUsd?: number };
  rollbacks: number;
  teamCalls: Record<string, number>;
};

export function computeNumbers(f: NumbersInput): Numbers {
  const from = t(f.from);
  const to = t(f.to);
  if (to <= from) throw new Error(`window ends before it starts: ${f.from} → ${f.to}`);
  const inWin = (iso: string) => {
    const x = t(iso);
    return x >= from && x < to;
  };

  const merged = f.merged.filter((p) => inWin(p.mergedAt));

  const traced = merged.filter((p) => p.typed !== undefined);
  const byKind = Object.fromEntries(TYPED_KINDS.map((k) => [k, 0])) as Record<TypedKind, number>;
  for (const p of traced) for (const x of p.typed ?? []) byKind[x.kind] += 1;
  const typedTotal = TYPED_KINDS.reduce((s, k) => s + byKind[k], 0);

  // A span is open at the window's end when it arrived before `to` and had not left by then.
  const open = f.queue.filter((q) => t(q.arrivedAt) < to && (!q.leftAt || t(q.leftAt) >= to));
  const ages = open.map((q) => (to - t(q.arrivedAt)) / 86_400_000);

  const greens = merged.filter((p) => p.greenAt).map((p) => Math.max(0, t(p.mergedAt) - t(p.greenAt as string)) / 60_000);

  const known = merged.filter((p) => p.mergedBy);
  const pm = known.filter((p) => p.mergedBy === 'pm').length;

  const filed = f.filed.filter((i) => inWin(i.createdAt)).length;
  const costs = merged.filter((p) => typeof p.costUsd === 'number').map((p) => p.costUsd as number);

  const teamCalls: Record<string, number> = {};
  for (const c of f.teamCalls ?? []) if (inWin(c.at)) teamCalls[c.cls] = (teamCalls[c.cls] ?? 0) + 1;

  return {
    days: (to - from) / 86_400_000,
    mergedCount: merged.length,
    typed: { traced: traced.length, total: typedTotal, perRow: traced.length ? typedTotal / traced.length : undefined, byKind },
    queue: {
      arrivals: f.queue.filter((q) => inWin(q.arrivedAt)).length,
      departures: f.queue.filter((q) => q.leftAt && inWin(q.leftAt)).length,
      openAtEnd: open.length,
      medianOpenAgeDays: median(ages),
    },
    green: {
      n: greens.length,
      totalHours: greens.reduce((s, m) => s + m, 0) / 60,
      medianMinutes: median(greens),
      overHour: greens.filter((m) => m > 60).length,
    },
    merges: { known: known.length, pm, self: known.length - pm, pmShare: known.length ? pm / known.length : undefined },
    filed: { count: filed, perMergedPr: merged.length ? filed / merged.length : undefined },
    cost: { n: costs.length, medianUsd: median(costs) },
    rollbacks: (f.rollbacks ?? []).filter((r) => inWin(r.at)).length,
    teamCalls,
  };
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
const pct = (x: number) => `${Math.round(x * 100)}%`;
const NR = 'not recorded';

// The readout: one line per number, its baseline beside it, its `n` where it stands on
// fewer rows than merged. The first line is the number the round is judged on.
export function renderReadout(f: NumbersInput): string {
  const n = computeNumbers(f);
  const B = BASELINE;
  const weeks = n.days / 7;
  const span = `${f.from.slice(0, 10)} to ${f.to.slice(0, 10)} (${r1(n.days)} days)`;
  const ofMerged = (k: number) => (k < n.mergedCount ? ` (n=${k} of ${n.mergedCount} merged)` : '');
  const kinds = TYPED_KINDS.map((k) => `${k} ${n.typed.byKind[k]}`).join(', ');
  const calls = Object.entries(n.teamCalls).sort(([a], [b]) => a.localeCompare(b));

  return [
    `**The numbers · ${span}**`,
    '',
    `- **Typed inputs per merged row: ${n.typed.perRow === undefined ? NR : r1(n.typed.perRow)}**${ofMerged(n.typed.traced)} · ${kinds} · baseline ${B.typedPerRowToday[0]} to ${B.typedPerRowToday[1]} on a traced row, target under ${B.typedPerRowTarget}`,
    `- Queue: ${n.queue.arrivals} arrived, ${n.queue.departures} left, ${n.queue.openAtEnd} open at the end · baseline ${r1(B.queueArrivalsPerWeek[0] * weeks)} to ${r1(B.queueArrivalsPerWeek[1] * weeks)} arrivals`,
    `- Median age of an open ruling: ${n.queue.medianOpenAgeDays === undefined ? 'none open' : `${r1(n.queue.medianOpenAgeDays)} days`}`,
    `- Green to merged: ${r1(n.green.totalHours)} hours in all, median ${n.green.medianMinutes === undefined ? NR : `${Math.round(n.green.medianMinutes)} min`}, ${n.green.overHour} over an hour${ofMerged(n.green.n)} · baseline ${r1((B.greenHoursPer30Days * n.days) / 30)} hours`,
    `- Merges that needed a typed word: ${n.merges.pmShare === undefined ? NR : `${pct(n.merges.pmShare)} (${n.merges.pm} PM, ${n.merges.self} self merged)`}${ofMerged(n.merges.known)}`,
    `- Issues filed per merged PR: ${n.filed.perMergedPr === undefined ? 'no merges' : `${r1(n.filed.perMergedPr)} (${n.filed.count} filed, ${n.mergedCount} merged)`} · baseline ${B.findingsPerPr} findings per PR`,
    `- Cost per merged PR: ${n.cost.medianUsd === undefined ? NR : `median $${n.cost.medianUsd.toFixed(2)}`}${ofMerged(n.cost.n)} · baseline $${B.medianCostPerChild.toFixed(2)} median per child`,
    `- Rollbacks: ${n.rollbacks} · team calls by class: ${calls.length ? calls.map(([c, k]) => `${c} ${k}`).join(', ') : 'none logged'}`,
  ].join('\n');
}

// The per-row line the dispatcher's status update carries for a merged row.
export function rowLine(label: string, p: MergedPr): string {
  const green = p.greenAt ? `${Math.round(Math.max(0, t(p.mergedAt) - t(p.greenAt)) / 60_000)} min green to merged` : `green ${NR}`;
  const typed = p.typed === undefined ? `typed ${NR}` : `${p.typed.length} typed`;
  const cost = typeof p.costUsd === 'number' ? `$${p.costUsd.toFixed(2)}` : `cost ${NR}`;
  const by = p.mergedBy === 'self' ? 'self merged' : p.mergedBy === 'pm' ? 'PM merged' : `merge word ${NR}`;
  return `${label} · #${p.number} · ${typed} · ${green} · ${by} · ${cost}`;
}
