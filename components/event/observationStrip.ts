// The folded observation strip's line (CUL-803 · incident spec §5.3).
//
// Pure, so the one thing that could go wrong here is testable: the strip names SOME of
// the values and counts ALL of the rows, and those two halves must draw on the same
// population or the count becomes a claim about an enumeration it does not describe
// (CLAUDE.md C-3). One function, one population, one test.
//
// Why the first three and not "as many as fit": a strip is one line on a phone, and a
// rule keyed to measured width is a rule no test can pin. Three is what the round-2 mock
// draws, and the count immediately after it tells the reader the list is partial — which
// is the honest shape for a summary of something the tap re-opens in full.

/** How many values the strip names before deferring to the count. */
export const STRIP_NAMED_MAX = 3;

/**
 * "Yellow, foamy, bile · 4 findings".
 *
 * The first value keeps its case (it opens the line); the rest are lowered at the first
 * character so the line reads as one phrase rather than a list of headings. Returns
 * `null` for an empty list — a strip with nothing to name is never drawn, and the caller
 * only offers the fold when there is a grid to fold.
 */
export function observationStripLine(values: readonly string[]): string | null {
  const clean = values.map((v) => v.trim()).filter((v) => v.length > 0);
  if (clean.length === 0) return null;
  const named = clean.slice(0, STRIP_NAMED_MAX).map((v, i) => (i === 0 ? v : lowerFirst(v)));
  const count = `${clean.length} finding${clean.length === 1 ? '' : 's'}`;
  return `${named.join(', ')} · ${count}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
