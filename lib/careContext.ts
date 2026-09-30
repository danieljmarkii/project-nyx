import type { CareContextLine, SignalFinding } from './signal';

// EN-10's context lines, as the client reads them (Engines v3 PR-38, CUL-1421;
// docs/nyx-care-state-requirements.md §5, mock `docs/culprit-engines-v3-mockups.html` §05).
//
// The ONE reader. The Signal screen's *Around this* and Get ready's Signal rows both take
// their lines from here, so the two can never disagree about which lines a finding carries.
//
// RELAYED, NEVER RECOMPOSED. The server (`generate-signal/careContext.ts`) composes each
// line's `text` and has already applied every §5.1 rule: no zero beside a drug that can
// mask the sign, no zero within 42 days of a visit, no zero over thin logging, the course
// above the trial. A client that rebuilt a sentence from `count` / `loggedDays` would be a
// second composer over one population (the CUL-746 shape), and the one place a withheld
// zero could come back. So this returns the server's strings, in the server's order.
//
// ALL OR NOTHING. `ai_signals.findings` is a cache, so each line's `kind` and `text` (the two
// fields a relay reads) are checked here; the numbers are never read, so never checked. The lines
// are a set composed together: the course line exists partly to sit ABOVE the trial line,
// so the diet is never the first explanation a reader meets (§5.1 Order). Dropping one
// malformed line and keeping its neighbours could print the trial alone beside a steroid,
// so one bad line drops them all. An absent field is the flag-off and old-cache case and
// returns nothing, which every surface renders as it did before EN-10.

// The five types the server decorates (`generate-signal/careContext.ts` LINE_BEARING). A line
// on any other type is not read, so Get ready's trial-response detail (the other trial's
// title) and these lines can never compete for one row.
const LINE_BEARING: ReadonlySet<SignalFinding['type']> = new Set<SignalFinding['type']>([
  'symptom_chronicity',
  'postprandial_timing',
  'empty_stomach_timing',
  'timing_story',
  'timeofday_clustering',
]);

const KINDS: ReadonlySet<string> = new Set<CareContextLine['kind']>(['course', 'trial', 'visit']);

function isLine(x: unknown): x is CareContextLine {
  if (typeof x !== 'object' || x === null) return false;
  const l = x as Record<string, unknown>;
  return typeof l.kind === 'string' && KINDS.has(l.kind) && typeof l.text === 'string' && l.text.trim().length > 0;
}

/** The finding's EN-10 lines as the server phrased them, in its order; empty when none. */
export function careContextLinesOf(finding: SignalFinding): string[] {
  if (!LINE_BEARING.has(finding.type)) return [];
  const raw = (finding as { careContext?: unknown }).careContext;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (!raw.every(isLine)) return [];
  return raw.map((l) => l.text.trim());
}

/** The section's title on the Signal screen (mock §05, 5a / 5b). */
export const CARE_CONTEXT_TITLE = 'Around this';
