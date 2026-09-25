// "Since the last vet visit": the one visit bound (H-11, CUL-1160;
// docs/nyx-history-v2-requirements.md §3.9, §5.2).
//
// THE RULE. The window starts on the day of the latest visit STRICTLY BEFORE TODAY, and
// includes that day. It is the vet report's rung 1, `resolveScope` in
// `supabase/functions/generate-report/report.ts` ("ignore today/future-dated visits"),
// and History, the rundown (CUL-1127) and the report (HV-15) all take it from here, so
// a vet reading "since your visit" on the phone and on the report sees one window.
//
//   • Including the visit's day answers the Data Scientist's dissent (§0.2): an event on
//     the visit's day cannot be placed before or after a visit that has no time, so the
//     window keeps it. A vet reading "since your visit" sees more, never less.
//   • Strictly before today means a visit saved today anchors nothing until tomorrow.
//     Home's "since last visit" restarts the day a visit is saved; that difference is
//     deliberate and written down in the spec, not an oversight here.
//   • A future-dated visit is ignored like today's: a date that has not happened cannot
//     start a window that ends today.
//
// ── PARSED, NEVER COMPARED AS TEXT (C-40) ──────────────────────────────────────
//
// `visited_at` is a calendar DATE ('YYYY-MM-DD') and `today` is the owner's local day
// key. Both become whole-day indices before any comparison, which is what the report
// does with its `dayNumber`, and the read below applies the rule in code rather than as
// a SQL `visited_at < ?` (the `readVisitsForHistory` precedent): CUL-1127 is a text
// comparison of this very bound against ISO instants, and the row it loses sits on the
// boundary. A value that is not a real calendar day is skipped rather than guessed.
//
// ── ONE FUNCTION, ENFORCED BY THE COMPILER ─────────────────────────────────────
//
// The answer is a branded `SinceVisitDay`, and `lib/historyWindows.ts` accepts only
// that type for its visit window, so no caller can hand the window table a bare
// `MAX(visited_at)` (the rundown's CUL-1127 shape) without a cast a review would see.
//
// ── DENO-COMPATIBLE ────────────────────────────────────────────────────────────
//
// No React Native import, and every intra-lib import spells its `.ts` extension
// (tsconfig's `allowImportingTsExtensions` note), so HV-15 can import this module into
// `generate-report` unchanged. The local read takes its database as a parameter for the
// same reason: importing `./db` would pull `expo-sqlite` into the Edge Function graph.
// `lib/visitWindow.guard.test.ts` pins both halves: this module's imports, and the
// report's copy of the rule, until HV-15 retires that copy.
//
// ── A BOUNDARY, NEVER A COUNT ──────────────────────────────────────────────────
//
// Registered in `guards/visitReaders.test.ts`: the read returns ONE day, the start of a
// window. A visit contributes no row and no number to anything that uses it.

import { recordDayIndex } from './recordDates.ts';
import { dayKeyFromIndex } from './utils.ts';

/**
 * The first day of "since the last vet visit": a local day key, 'YYYY-MM-DD'.
 *
 * Branded so that only this module mints one (see the header). It is still a string, so
 * every consumer can format it, key on it, or print it without unwrapping.
 */
export type SinceVisitDay = string & { readonly __brand: 'SinceVisitDay' };

/** Today as a day index, or a thrown error: an unreadable `today` is a caller's bug,
 *  and answering null would read as the FACT "no visit before today" (the report would
 *  quietly fall to its next rung). */
function todayIndexOf(today: string): number {
  const index = recordDayIndex(today);
  if (index === null) throw new RangeError(`visitWindow: today is not a day key: "${today}"`);
  return index;
}

/**
 * The latest visit strictly before `today`, as the window's first day, or null when the
 * pet has none (so the window is not offered at all, PMD-17).
 *
 * `visitDays` are `visited_at` values in any order; `today` is the owner's local day key
 * (`toLocalDayKey(new Date())` on the phone, the owner's zone on the server). A visit
 * value that is not a real calendar day is skipped, never guessed: `visited_at` is a
 * DATE, so an instant or a rolled-over date is not one (`recordDayIndex`). Throws on an
 * unreadable `today`.
 */
export function latestVisitBefore(
  visitDays: readonly string[],
  today: string,
): SinceVisitDay | null {
  const todayIndex = todayIndexOf(today);
  let latest: number | null = null;
  for (const visited of visitDays) {
    const index = recordDayIndex(visited);
    // Today's visit and a future-dated one anchor nothing: the report's rung 1, verbatim.
    if (index === null || index >= todayIndex) continue;
    if (latest === null || index > latest) latest = index;
  }
  return latest === null ? null : (dayKeyFromIndex(latest) as SinceVisitDay);
}

/**
 * The narrow database surface the read needs. `expo-sqlite`'s `SQLiteDatabase` satisfies
 * it (`getDb()`), and so does a `node:sqlite` adapter in the tests: the `CacheFlushDb`
 * precedent in `lib/db.ts`, which lets the real function run against a real engine.
 */
export interface VisitDaysDb {
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
}

/**
 * Every live visit day for one pet. UNBOUNDED by design, and filtered in code by
 * `latestVisitBefore`, because a bound in SQL would be a text comparison (the header).
 * A pet holds a handful of visits over years, so there is nothing to win by bounding it.
 * `deleted_at IS NULL`: a removed visit must stop anchoring the window it started.
 */
const VISIT_DAYS_SQL = `SELECT visited_at FROM vet_visits
  WHERE pet_id = ? AND deleted_at IS NULL`;

/**
 * "Since the last vet visit" for one pet, read from the phone's copy of the record.
 *
 * THROWS on a failed read rather than returning null, because null here is a FACT (this
 * pet has no visit before today) and a failed read is not that fact: collapsing the two
 * would quietly drop the window from the sheet. The `loadTrialPredicateFacts` precedent.
 * An unreadable `today` throws before the read, for the same reason.
 */
export async function readLatestVisitBefore(
  db: VisitDaysDb,
  petId: string,
  today: string,
): Promise<SinceVisitDay | null> {
  todayIndexOf(today);
  let rows: { visited_at: string | null }[];
  try {
    rows = await db.getAllAsync<{ visited_at: string | null }>(VISIT_DAYS_SQL, [petId]);
  } catch (e) {
    console.error('[visitWindow] reading the visit days failed:', e);
    throw e;
  }
  const days: string[] = [];
  for (const row of rows) {
    if (typeof row.visited_at === 'string') days.push(row.visited_at);
  }
  return latestVisitBefore(days, today);
}
