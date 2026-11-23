// The filing precheck (Workflow v2 PR-15, D3 on CUL-2854). Before a session files a
// reviewer's finding (or its own), it asks one question here: should this be a new issue,
// or a comment on an issue that already holds it? Pure: the caller reads Linear and `main`
// and hands the facts in; precheckCli.ts is the I/O shell.
//
// THE ONE RULE ABOVE THE OTHERS. A finding that could drop, soften or delay a warning to an
// owner or a vet is never rerouted: it is filed and goes through the sort (dispatch.md § The
// sort) exactly as before. `protectedReasons` decides that first, and every reason it knows
// errs toward filing: QUIET, an untagged finding (no tag counts as QUIET), the word "quiet"
// anywhere in its title or text (the sort's own rule), a bundle with an untagged or QUIET item,
// harm or an untagged Harm field, a `Live harm` or any `Gate:` label. For a protected finding a duplicate or an already-fixed hit is only a NOTE
// on the filing, never a reason to skip it.
//
// Everything else routes by its fields, first match wins:
//   duplicate  an open issue already holds it (same cited file and a shared title, or a
//              near-identical title)                       → comment on that issue
//   fixed      a defect on `main` whose every cited line is gone → comment on its source PR
//   standing   already on `main` (not caused by this diff), or rare to trigger (2+ devices,
//              a race or clock skew, an abnormal precondition) → comment on the one standing
//              issue for its surface (filed once, the first time a surface needs it)
//   comment    its category's action rate is under the PM's bar → comment only
//   file       otherwise.
// The category bar is unset until the PM sets it at a PR-03 readout; unset switches no
// category off (FILING_BAR below).

import { directionOf } from './sort.ts';

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
  /** From the field line. Missing means untagged, which shields like harm. */
  harm?: 'none' | Harm;
  /** The finding as the reviewer wrote it, field line included. Read for a QUIET the fields missed. */
  text?: string;
  labels?: string[];
  /** The surface a standing issue is kept for: `vet report`, `Home`, `sync`, `tests`... */
  surface: string;
  /** Reviewer and kind, e.g. `adversarial-reviewer:guard`; what the action rate is kept by. */
  category: string;
  cites?: { file: string; snippet: string }[];
  /** A bundle: each item carries its own direction; an untagged item counts as QUIET. */
  items?: { text: string; direction?: Direction }[];
};

export type OpenIssue = { id: string; title: string; cites?: string[]; surface?: string; state?: string };

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
  if (f.harm === undefined) why.push('harm untagged (counts as harm)');
  else if (f.harm !== 'none') why.push(`can ${f.harm === 'exposure' ? 'expose' : f.harm === 'loss' ? 'lose' : 'corrupt'} data`);
  for (const l of f.labels ?? []) if (PROTECTED_LABEL.test(l)) why.push(`label ${l}`);
  // The words outrank the fields: the sort reads "quiet" anywhere as QUIET (sort.ts
  // directionOf), so the precheck does too, and a field line in the text that names QUIET
  // or harm shields whatever the hand-built fields say.
  const text = `${f.title}\n${f.text ?? ''}`;
  if (/\bquiet/i.test(text) || (f.text && directionOf(f.text) === 'QUIET')) why.push('its words say quiet');
  const fl = parseFieldLine(f.text ?? '');
  if (fl.harm && fl.harm !== 'none') why.push(`its field line names ${fl.harm}`);
  return why;
}

/** The reviewer's field line, as far as it can be read; a field it cannot read is left out. */
export function parseFieldLine(text: string): Partial<Pick<ProposedFinding, 'direction' | 'origin' | 'harm'>> {
  const out: Partial<Pick<ProposedFinding, 'direction' | 'origin' | 'harm'>> = {};
  const d = /Direction:\s*(QUIET|LOUD|neither)\b/i.exec(text)?.[1];
  if (d) out.direction = (d.toUpperCase() === 'NEITHER' ? 'neither' : d.toUpperCase()) as Direction;
  const o = /Origin:\s*(diff|main)\b/i.exec(text)?.[1];
  if (o) out.origin = o.toLowerCase() as 'diff' | 'main';
  const h = /Harm:\s*(none|exposure|loss|corruption)\b/i.exec(text)?.[1];
  if (h) out.harm = h.toLowerCase() as ProposedFinding['harm'];
  return out;
}

const CLASS = /\b(instances?|class)\b/i;
const CLOSED = /done|cancel|closed|duplicate/i;

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
    if (o.state && CLOSED.test(o.state)) continue;
    const sameFile = (o.cites ?? []).some((c) => files.has(c));
    const otherSurface = !!o.surface && o.surface !== f.surface;
    const t = titleOverlap(f.title, o.title);
    if ((sameFile && t >= 0.4) || (!otherSurface && t >= 0.8)) return o.id;
  }
  return undefined;
}

// A class is never rare: one instance a normal owner hits makes the class (the sort's rule 1b).
const isClass = (f: ProposedFinding) => CLASS.test(`${f.title}\n${f.text ?? ''}`);
export const isRare = (f: ProposedFinding) => !isClass(f) && (f.devices > 1 || f.timing !== 'any' || f.precondition === 'abnormal');

/** The sort's own `Trigger: rare (...)` line (CUL-2123), when a cause maps onto its four. */
// Never for a bundle (the fields are the finding's, the shield may be one item's), a class,
// or anything that can expose, lose or corrupt data: the sort never parks those.
export function triggerLine(f: ProposedFinding): string | undefined {
  const textHarm = parseFieldLine(f.text ?? '').harm;
  if (f.items?.length || isClass(f) || f.harm !== 'none' || (textHarm && textHarm !== 'none')) return undefined;
  const cause =
    f.devices > 1 ? 'two phones' : f.timing === 'race' ? 'timing' : f.timing === 'clock' ? 'clock skew' : f.preconditionCause === 'storage failure' ? 'storage failure' : undefined;
  return cause ? `Trigger: rare (${cause})` : undefined;
}

export function precheck(f: ProposedFinding, ctx: PrecheckContext): Route {
  const dup = duplicateOf(f, ctx.open);
  const cites = f.cites ?? [];
  // Only a defect already on main can be fixed there: a line this diff adds is never on main
  // before merge, so reading it as "fixed" would drop every diff-caused finding.
  const fixed = f.origin === 'main' && !!ctx.mainHas && cites.length > 0 && cites.every((c) => c.snippet !== '' && !ctx.mainHas!(c.file, c.snippet));

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
