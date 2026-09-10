// The look's word list, between SQLite and everywhere else (CUL-868 / N-2).
//
// SQLite has no array type, so `looks.words` is a JSON-array STRING locally while
// the Supabase column is `TEXT[]` — the `food_items_cache.proteins` precedent
// (B-351), including its rule: encode and decode ONLY here, so the one place that
// knows the encoding is the one place that reads it.
//
// A LEAF MODULE on purpose. `lib/looks.ts` writes the row and `lib/sync.ts` pushes
// and hydrates it, and `lib/looks.ts` imports `lib/sync.ts` for the queue push — so
// the codec cannot live in either without a cycle. Same shape as
// `lib/weightQueries.ts`, and the same reason.

/** A word list → the local column's text. Never null: the column is
 *  `NOT NULL DEFAULT '[]'`, and "no words" is a real, legal state — the
 *  observed-absence row (`outcome = 'nothing_unusual'`) has exactly none. */
export function wordsToLocalText(words: readonly string[]): string {
  return JSON.stringify([...words]);
}

/**
 * The local column's text → a word list.
 *
 * Total and lossy-toward-empty by contract: a row whose text is missing,
 * malformed, or not an array of strings reads as NO WORDS rather than throwing.
 * The alternative is a crash on a surface the owner is already looking at, and the
 * failure direction is the safe one for this column — an unreadable list under-
 * reports what she noticed, and every count over words is a count of DAYS a word
 * was marked, so an unreadable row simply does not vote. It never invents a word.
 */
export function wordsFromLocalText(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is string => typeof w === 'string');
  } catch {
    return [];
  }
}
