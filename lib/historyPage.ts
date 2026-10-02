// One page of the shipped History list for a scope — the read `app/(tabs)/history.tsx`
// pages (CUL-1073; History v2 reads through its own day pages, HV-4). The rule lives in
// `lib/historyDateFilter.ts`; this is the one place it meets the table, so the screen and
// the tests drive the same read.
//
// The SQL compares `occurred_at` as TEXT, and a synced row spells an instant `…+00:00`
// where a local write spells it `…Z` (C-40), so the query gets `sqlPrefilter`'s wider
// bounds and `inRange` places what comes back on the parsed instant.
//
// Paging counts the QUERY's rows (`fetched`), not the list's: History pages by OFFSET,
// which is a position in the query's order, and a slack row dropped here still took a
// place there. A page made only of slack rows is not an answer — returned as one, the
// first page of a scope would draw the empty state over a record that has rows — so the
// read goes on until a page holds a row of the range or the query runs dry, and "has
// more" is the LAST query's answer, never a sum's.

import { getTimeline, type TimelineRow } from './db';
import { inRange, sqlPrefilter, type ScopeRange } from './historyDateFilter';

export async function readHistoryPage(
  petId: string,
  limit: number,
  offset: number,
  type: string | null,
  range: ScopeRange,
): Promise<{ rows: TimelineRow[]; fetched: number; hasMore: boolean }> {
  const pre = sqlPrefilter(range);
  let fetched = 0;
  for (;;) {
    const page = await getTimeline(petId, limit, offset + fetched, type, pre.after, pre.before);
    fetched += page.length;
    const rows = page.filter((r) => inRange(r.occurred_at, range));
    // A read that returned nothing has nothing more, whatever the limit (a `limit` of 0
    // must not loop).
    const hasMore = page.length > 0 && page.length === limit;
    if (rows.length > 0 || !hasMore) return { rows, fetched, hasMore };
  }
}
