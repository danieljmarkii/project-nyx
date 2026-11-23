// The filing precheck (Workflow v2 PR-15, D3 on CUL-2854). Before a session files a
// reviewer's finding (or its own), it asks one question here: should this be a new issue,
// or a comment on an issue that already holds it? Pure: the caller reads Linear and `main`
// and hands the facts in; precheckCli.ts is the I/O shell.
//
// THE ONE RULE ABOVE THE OTHERS. A finding that could drop, soften or delay a warning to an
// owner or a vet is never rerouted: it is filed and goes through the sort (dispatch.md § The
// sort) exactly as before. `protectedReasons` decides that first, and every reason it knows
// errs toward filing: QUIET, an untagged finding (no tag counts as QUIET), a bundle with an
// untagged or QUIET item, harm (it can expose, lose or corrupt data), a `Live harm` or any
// `Gate:` label. For a protected finding a duplicate or an already-fixed hit is only a NOTE
// on the filing, never a reason to skip it.
//
// Everything else routes by its fields, first match wins:
//   duplicate  an open issue already holds it (same cited file and a shared title, or a
//              near-identical title)                       → comment on that issue
//   fixed      every line it cites is gone from `main`        → comment on its source PR
//   standing   already on `main` (not caused by this diff), or rare to trigger (2+ devices,
//              a race or clock skew, an abnormal precondition) → comment on the one standing
//              issue for its surface (filed once, the first time a surface needs it)
//   comment    its category's action rate is under the PM's bar → comment only
//   file       otherwise.
// The category bar is unset until the PM sets it at a PR-03 readout; unset switches no
// category off (FILING_BAR below).

export type Direction = 'QUIET' | 'LOUD' | 'neither';
export type Harm = 'exposure' | 'loss' | 'corruption';

export type ProposedFinding = {
  title: string;
  /** From the reviewer's field line. Missing means untagged, which counts as QUIET. */
  direction?: Direction;
  /** `main`: the defect is there without the diff under review. */
  origin: 'diff' | 'main';
  devices: 1 | 2;
  timing: 'any' | 'race' | 'clock';
  /** `abnormal`: needs a storage failure, corrupt data, an old build, a future change... */
  precondition: 'none' | 'abnormal';
  /** A short cause for an abnormal precondition, mapped onto the sort's Trigger line. */
  preconditionCause?: 'storage failure' | 'other';
  harm?: Harm;
  labels?: string[];
  /** The surface a standing issue is kept for: `vet report`, `Home`, `sync`, `tests`... */
  surface: string;
  /** Reviewer and kind, e.g. `adversarial-reviewer:guard`; what the action rate is kept by. */
  category: string;
  cites?: { file: string; snippet: string }[];
  /** A bundle: each item carries its own direction; an untagged item counts as QUIET. */
  items?: { text: string; direction?: Direction }[];
};

export type OpenIssue = { id: string; title: string; cites?: string[] };

export type PrecheckContext = {
  open: OpenIssue[];
  /** surface → its standing issue id, for the surfaces that have one. */
  standing: Record<string, string>;
  /** Whether `main` still holds this snippet in this file. Omit to skip the fixed check. */
  mainHas?: (file: string, snippet: string) => boolean;
  /** Share of a category's findings that changed merged code (PR-03's readout). */
  rates?: Record<string, number>;
  /** The PM's bar. Undefined uses FILING_BAR. */
  bar?: number | null;
};

export type Route =
  | { route: 'file'; notes: string[]; trigger?: string }
  | { route: 'duplicate'; issue: string }
  | { route: 'fixed' }
  | { route: 'standing'; surface: string; issue?: string; why: 'on main' | 'rare' }
  | { route: 'comment'; category: string; rate: number; bar: number };

/** Unset until the PM rules a bar at a PR-03 readout. While null no category stops filing. */
export const FILING_BAR: number | null = null;

export const PROTECTED_LABEL = /^(Live harm|Gate:)/i;

export function protectedReasons(f: ProposedFinding): string[] {
  const why: string[] = [];
  if (f.direction === undefined) why.push('untagged (counts as QUIET)');
  else if (f.direction === 'QUIET') why.push('QUIET');
  for (const it of f.items ?? []) {
    if (it.direction === undefined) why.push(`bundle item untagged: ${it.text}`);
    else if (it.direction === 'QUIET') why.push(`bundle item QUIET: ${it.text}`);
  }
  if (f.harm) why.push(`can ${f.harm === 'exposure' ? 'expose' : f.harm === 'loss' ? 'lose' : 'corrupt'} data`);
  for (const l of f.labels ?? []) if (PROTECTED_LABEL.test(l)) why.push(`label ${l}`);
  return why;
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'it', 'its', 'is', 'not', 'only', 'for', 'with', 'by', 'as', 'at', 'from', 'vet', 'report', 'v2']);
const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** Overlap coefficient of two titles' significant words. */
export function titleOverlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size);
}

export function duplicateOf(f: ProposedFinding, open: OpenIssue[]): string | undefined {
  const files = new Set((f.cites ?? []).map((c) => c.file));
  for (const o of open) {
    const sameFile = (o.cites ?? []).some((c) => files.has(c));
    const t = titleOverlap(f.title, o.title);
    if ((sameFile && t >= 0.4) || t >= 0.8) return o.id;
  }
  return undefined;
}

export const isRare = (f: ProposedFinding) => f.devices > 1 || f.timing !== 'any' || f.precondition === 'abnormal';

/** The sort's own `Trigger: rare (...)` line (CUL-2123), when a cause maps onto its four. */
export function triggerLine(f: ProposedFinding): string | undefined {
  const cause =
    f.devices > 1 ? 'two phones' : f.timing === 'race' ? 'timing' : f.timing === 'clock' ? 'clock skew' : f.preconditionCause === 'storage failure' ? 'storage failure' : undefined;
  return cause ? `Trigger: rare (${cause})` : undefined;
}

export function precheck(f: ProposedFinding, ctx: PrecheckContext): Route {
  const dup = duplicateOf(f, ctx.open);
  const cites = f.cites ?? [];
  const fixed = !!ctx.mainHas && cites.length > 0 && cites.every((c) => !ctx.mainHas!(c.file, c.snippet));

  const shield = protectedReasons(f);
  if (shield.length) {
    const notes = [`protected: ${shield.join('; ')}`];
    if (dup) notes.push(`possible duplicate of ${dup}: say so in the filing, file it anyway`);
    if (fixed) notes.push('every cited line is gone from main: say so in the filing, file it anyway');
    return { route: 'file', notes, trigger: triggerLine(f) };
  }
  if (dup) return { route: 'duplicate', issue: dup };
  if (fixed) return { route: 'fixed' };
  if (f.origin === 'main' || isRare(f)) {
    return { route: 'standing', surface: f.surface, issue: ctx.standing[f.surface], why: f.origin === 'main' ? 'on main' : 'rare' };
  }
  const bar = ctx.bar === undefined ? FILING_BAR : ctx.bar;
  const rate = ctx.rates?.[f.category];
  if (bar !== null && rate !== undefined && rate < bar) return { route: 'comment', category: f.category, rate, bar };
  return { route: 'file', notes: [], trigger: triggerLine(f) };
}

/** A route counts as rerouted when the finding does not become its own issue. */
export const rerouted = (r: Route) => r.route !== 'file';
