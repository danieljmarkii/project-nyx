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
// place there. STATED BLIND SPOT (C-41): a page whose every row is slack comes back
// empty with `fetched === limit`, and the screen would show the page as blank until the
// next one loads. It needs `limit` rows inside one prefilter minute past a bound.

import { getTimeline, type TimelineRow } from './db';
import { inRange, sqlPrefilter, type ScopeRange } from './historyDateFilter';

export async function readHistoryPage(
  petId: string,
  limit: number,
  offset: number,
  type: string | null,
  range: ScopeRange,
): Promise<{ rows: TimelineRow[]; fetched: number }> {
  const pre = sqlPrefilter(range);
  const fetched = await getTimeline(petId, limit, offset, type, pre.after, pre.before);
  return {
    rows: fetched.filter((r) => inRange(r.occurred_at, range)),
    fetched: fetched.length,
  };
}
