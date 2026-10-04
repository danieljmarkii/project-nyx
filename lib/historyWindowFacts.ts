// What History v2 reads of the whole record (HV-9 / CUL-1166, CUL-1228; spec §3.8, §3.9,
// §5.2): the window table's facts, the record's numbers over All time, the pet's courses
// and the photos whose read has not landed. The list and the pinned row share this one read. Every read here is one another module already owns; this
// file only assembles them for one pet and one `today`.
//
// ── ONE `today` FOR THE WHOLE ASSEMBLY ──────────────────────────────────────────────
// `WindowFacts` must be derived for a single day (HV-3, `lib/historyWindows.ts`): the
// trial's belief is read for that day, the visit bound is strictly before it, and the
// window table resolves against it. So `readWindowFacts` takes ONE instant and derives
// the day from it, and the trial's predicate is read at that same instant, never at a
// second `Date.now()` that could fall across midnight.
//
// ── A FAILED READ IS NOT AN EMPTY RECORD (C-12) ─────────────────────────────────────
// The window facts and the record's numbers reject on a failed read, and the caller then
// draws no number anywhere, never a zero: `readLatestVisitBefore` and
// `loadTrialPredicateFacts` throw precisely so a failure never becomes "this pet has no
// visit" or "no trial". What the sheet does NOT yet do is say why. With no facts it offers
// the windows that need none (All time, Today, the three rolling ones), which is also its
// loading state, so a failure leaves the trial and visit rows off without a word: that gap
// is CUL-1238 (a notice and a retry on the sheet). The two extras degrade on their own
// terms: unreadable courses list no course sub-row (a course filter's pill then names
// Medication), and an unreadable read state prints no *N not read*, which it would not
// print at zero either.
//
// ── THE READ STATE COMES THROUGH THE ONE PREDICATE (§5.4) ───────────────────────────
// *N not read* counts the rows History's own page query lists under Photographed
// (`readDayPage`, so the rows are exactly the ones the list will show, on exactly their
// days), whose `readStateOf` is `unread`, over the phone's copy (`readCopies`). This file
// never reads the verdict itself (`guards/readState.test.ts`), so a change to the rule
// (HV-6's finished-but-unclear read, CUL-1107's "No") reaches this count the day it
// reaches the rows.

import { analysisChainOutstanding } from './analysisChain';
import { getDb } from './db';
import { loadTrialPredicateFacts, type DietTrialFactsPet } from './dietTrialFacts';
import type { DayFacts, DayRange, HistoryCourse } from './historyDays';
import { readDayPage, readHistoryCourses, readRecordFacts, readRecordStartDay, type RecordFacts } from './historyQueries';
import { ALL_TIME, resolveWindow, windowTrialOf, type WindowFacts } from './historyWindows';
import { readCopies } from './readCopy';
import { readStateOf } from './readState';
import { toLocalDayKey } from './utils';
import { readLatestVisitBefore } from './visitWindow';

/**
 * The window table's facts for one pet, all derived for the local day of `nowMs`
 * (the header). Rejects when any of the three reads fails.
 */
export async function readWindowFacts(pet: DietTrialFactsPet, nowMs: number = Date.now()): Promise<WindowFacts> {
  const today = toLocalDayKey(new Date(nowMs));
  // Taken before any read starts: a database that cannot be opened must fail this call
  // alone, never after two reads are already in flight with nothing left to catch them.
  const db = getDb();
  const [firstRecordDay, trialCore, sinceVisit] = await Promise.all([
    readRecordStartDay(pet.id),
    loadTrialPredicateFacts(pet, nowMs),
    readLatestVisitBefore(db, pet.id, today),
  ]);
  // A trial whose own record could not be computed (`facts: null`) has no evidence
  // window, so its window is not offered, which `windowTrialOf` decides from a null range.
  const trial = trialCore === null ? null : windowTrialOf(trialCore.trial, trialCore.facts ?? { exposureRange: null }, today);
  return { petId: pet.id, today, firstRecordDay, trial, sinceVisit };
}

/**
 * Photographed rows whose read is `unread`, per local day, over `range` (§3.8's *N not
 * read*). `readingOff` is the owner's consent (CUL-552): under it no row is `unread`, it
 * is `off`, and the sheet says so once instead (H-4b).
 */
export async function readNotReadDays(
  petId: string,
  range: DayRange,
  readingOff: boolean,
): Promise<Map<string, number>> {
  // Every photographed row the list would show, in one page: whole days, the list's own
  // filter, placed on the days the list places them.
  const page = await readDayPage(petId, { range, filter: { kind: 'photographed' }, search: null }, null, Number.POSITIVE_INFINITY);
  const rows = page.days.flatMap((d) => d.rows.map((row) => ({ day: d.day, row })));
  const copies = await readCopies(rows.map(({ row }) => row.id));
  const out = new Map<string, number>();
  for (const { day, row } of rows) {
    const state = readStateOf({
      eventType: row.event_type,
      hasPhoto: row.has_photo,
      copy: copies.get(row.id) ?? null,
      inFlight: analysisChainOutstanding(row.id),
      readingOff,
    });
    if (state === 'unread') out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

/** Everything History counts, for one pet, as of one instant: the pinned row's pills and
 *  sheets, and the list's facts for the window on screen (`historyListStore`). */
export interface HistoryRecordData {
  petId: string;
  /** The window table's facts (`today` is theirs). */
  windowFacts: WindowFacts;
  /** All time's days (`resolveWindow(ALL_TIME, windowFacts).bounds`). */
  range: DayRange;
  /** The record's facts over All time: the ONE read every number on the screen is a slice
   *  of (`historyFactsFor`), the list's count line, day headers and strip included (CUL-1228). */
  facts: RecordFacts;
  /** `facts.days`: each day's facts over All time, which the pills slice per window (`daysIn`). */
  recordDays: ReadonlyMap<string, DayFacts>;
  /** The pet's courses in the derivation's order, or null when they could not be read. */
  courses: readonly HistoryCourse[] | null;
  /** Unread photographed rows per local day over All time, or null when not known. */
  notReadDays: ReadonlyMap<string, number> | null;
}

/** What the pinned row's pills and sheets count from: the record less the population the
 *  list's duplicates are swept over, which the row never shows. */
export type PinnedRecordData = Omit<HistoryRecordData, 'facts'>;

/**
 * One read of the whole record for History's screen: the window facts, then the record's
 * facts over the All time window they give, the courses and the read states. The list store
 * reads it once per refresh and publishes it beside the window it slices, so the pinned row
 * and the count line never come from two reads (CUL-1228). Rejects when the window facts or
 * the record's facts cannot be read (the header).
 */
export async function readHistoryRecord(
  pet: DietTrialFactsPet,
  readingOff: boolean,
  nowMs: number = Date.now(),
): Promise<HistoryRecordData> {
  const windowFacts = await readWindowFacts(pet, nowMs);
  const allTime = resolveWindow(ALL_TIME, windowFacts).bounds;
  const [facts, courses, notReadDays] = await Promise.all([
    readRecordFacts(pet.id, allTime),
    readHistoryCourses(pet.id).catch((e: unknown) => {
      console.error('[historyWindowFacts] reading the courses failed:', e);
      return null;
    }),
    readNotReadDays(pet.id, allTime, readingOff).catch((e: unknown) => {
      console.error('[historyWindowFacts] reading the photos’ read state failed:', e);
      return null;
    }),
  ]);
  return { petId: pet.id, windowFacts, range: allTime, facts, recordDays: facts.days, courses, notReadDays };
}
