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

/** The two halves of the strip's line, kept APART on purpose. The renderer lays them out
 *  as separate nodes so the count can be pinned against truncation while the named list
 *  shrinks — see `observationStripLine`'s note on which half yields. */
export interface ObservationStripLine {
  /** "Yellow, foamy, bile" — a partial enumeration by design. */
  named: string;
  /** "4 findings" — the whole population, and the reason the partial list is honest. */
  count: string;
}

/**
 * "Yellow, foamy, bile" + "4 findings".
 *
 * The first value keeps its case (it opens the line); the rest are lowered at the first
 * character so the line reads as one phrase rather than a list of headings. Returns
 * `null` for an empty list — a strip with nothing to name is never drawn, and the caller
 * only offers the fold when there is a grid to fold.
 *
 * WHICH HALF YIELDS WHEN THE LINE IS TOO LONG (C-8). Not the count. C-8 decides by how
 * many times the surface states each half, and on this strip everything is stated once —
 * so the tie goes to what the halves DO. The count is what makes naming three of four
 * rows honest rather than silently partial (C-3): clip it and the strip stops saying the
 * list is a summary, which is the one thing it must not stop saying. The named values are
 * a summary by construction and a tap restores them in full. So the caller pins the count
 * and the heading and lets the named list ellipse — which is why this returns two strings
 * and not one.
 */
export function observationStripLine(values: readonly string[]): ObservationStripLine | null {
  const clean = values.map((v) => v.trim()).filter((v) => v.length > 0);
  if (clean.length === 0) return null;
  const named = clean.slice(0, STRIP_NAMED_MAX).map((v, i) => (i === 0 ? v : lowerFirst(v)));
  return {
    named: named.join(', '),
    count: `${clean.length} finding${clean.length === 1 ? '' : 's'}`,
  };
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
