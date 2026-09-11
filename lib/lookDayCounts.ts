// The look's DAY COUNTS — the one place a look row is grouped by day (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §6.1–§6.2, T-14, T-19.
//
// ── WHY THIS IS ITS OWN FILE NOW ─────────────────────────────────────────────
// These were the second half of `lib/looks.ts`, put there at CUL-868 / N-2 "before there
// are two consumers, because the diet-trial §5.3 lesson says what happens otherwise: two
// surfaces re-derive the same count from the same rows and disagree by a denominator."
// That reasoning is unchanged and this file IS that one place. What changed at N-5 is who
// needs it.
//
// `lib/looks.ts` holds the WRITE path, so it imports `./sync` at module scope and
// `./supabase` from there. The Patterns card's model, its two-half comparison and its
// pairing are pure modules that need nothing but these counters — and a RENDER component
// that reaches the write path to count a set of days is one careless edit away from
// writing through it. Splitting the pure half out makes "this card never writes" a fact
// about the import graph rather than a promise in a comment.
//
// `lib/looks.ts` RE-EXPORTS every name below, so no existing caller moved and there is
// still exactly one definition of each: two import paths to one function object, never
// two functions.
//
// Nothing here reads the database, the clock, or a store. The soft-delete join that makes
// every count honest lives on the READER (`loadLookDays`, still in `lib/looks.ts`), which
// is the only thing that ever produces a `LookDayRow`.

import type { LookOutcome } from './looks';

/** One look row, reduced to what a COUNT needs. `localDay` is the stored key,
 *  never a re-derivation from `occurred_at` (T-19).
 *
 *  `eventId` and `createdAt` joined the shape at CUL-873 / N-4b, and they are here
 *  rather than in a second reader for the reason the header states: this is the only
 *  place a look row is grouped by day, so it is the only place a denominator can be got
 *  wrong — and the RECEIPTS need to say WHICH entry earned a line, not just how many
 *  days hold a word. T-18 attaches a receipt to the earliest look of the day carrying
 *  the word, ties broken by `created_at` then row id; without those two fields that rule
 *  could only be approximated at the render layer, which is where it would drift. */
export interface LookDayRow {
  /** The PARENT event's id — what a card's entry is keyed on and what its `›` opens.
   *  The child's own id is never needed outside the write path. */
  eventId: string;
  localDay: string;
  /** ISO, stamped at insert. The tie-break for "the earliest look of the day" — never a
   *  substitute for `occurred_at`, which is when the owner LOOKED; this is when the row
   *  was written, and only two rows on the same day are ever compared by it. */
  createdAt: string;
  outcome: LookOutcome;
  words: string[];
  /** The vocabulary the row was written against (`looks.vocab_version`).
   *
   *  Carried on the row rather than assumed, because §6.10 is a rule ABOUT this
   *  column and not about the words: rows compare only within one version, and a
   *  two-half comparison whose halves straddle a bump is withheld with the reason.
   *  A consumer that reads `LOOK_VOCAB_VERSION` instead would be asking what THIS
   *  BUILD thinks the words mean, not what the row was written under — the same
   *  class of error as re-deriving `local_day` from `occurred_at` (T-19). The
   *  fallback is the SHIPPED version rather than 0: a row this device wrote before
   *  the column existed cannot exist (064 created both together), so a null here is
   *  a corrupt read, and treating it as "some other version" would silently withhold
   *  every comparison on the account. */
  vocabVersion: number;
}

/** The set of days that hold at least one look. THE denominator: every "N of M"
 *  this feature prints has this on one side, and a skipped day is simply absent
 *  (counted as not answered, never as an answered day — §5.6). */
export function answeredDaySet(rows: readonly LookDayRow[]): Set<string> {
  return new Set(rows.map((r) => r.localDay));
}

/** How many days hold at least one look. Days, never looks: ten reflex taps in a
 *  day are one answered day (T-14, §3.3). */
export function answeredDays(rows: readonly LookDayRow[]): number {
  return answeredDaySet(rows).size;
}

/** How many days a word was marked. A word marked in two looks the same day counts
 *  ONCE for that day (T-14) — which is the whole reason this is a set of days and
 *  not a row count. */
export function wordDays(rows: readonly LookDayRow[], word: string): number {
  return wordDaySet(rows, word).size;
}

/** The days a word was marked, as their keys — for a pairing that must intersect
 *  two day sets rather than compare two numbers (§6.11). */
export function wordDaySet(rows: readonly LookDayRow[], word: string): Set<string> {
  const days = new Set<string>();
  for (const r of rows) if (r.words.includes(word)) days.add(r.localDay);
  return days;
}

/**
 * How many days are OBSERVED-ABSENCE days: days on which EVERY look was
 * `nothing_unusual` (T-14).
 *
 * The precedence is the honest one and it runs one way only (C-4): a *nothing
 * unusual* at 7 AM and an *off* at 6 PM is an OFF day, never an absence day. The
 * later look does not overwrite the earlier one — the DAY's classification does,
 * and the accusing branch wins. Inverting this would silently convert a day the
 * owner reported something on into a day the record calls clear.
 */
export function absenceDays(rows: readonly LookDayRow[]): number {
  return absenceDaySet(rows).size;
}

/** The observed-absence days, as their keys. */
export function absenceDaySet(rows: readonly LookDayRow[]): Set<string> {
  const observed = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(r.localDay);
    if (r.outcome === 'observed') observed.add(r.localDay);
  }
  for (const day of observed) seen.delete(day);
  return seen;
}

/**
 * How many days are BOTH answered and vomit days — the denominator of the same-day
 * pairing (§6.11), and the one number the third adversarial pass caught the spec
 * getting wrong.
 *
 * `vomitLocalDays` is the caller's set of days a vomit was logged, keyed the SAME
 * way (`local_day`, the owner's zone). Both sides of the pairing's margin must
 * count ANSWERED days: a left denominator over ALL vomit days and a right one over
 * answered days scores every unanswered bad day as "nothing seen" — the reassuring
 * direction, on the exact question a worried owner is asking.
 */
export function answeredVomitDays(
  rows: readonly LookDayRow[],
  vomitLocalDays: Iterable<string>,
): number {
  const answered = answeredDaySet(rows);
  let n = 0;
  for (const day of new Set(vomitLocalDays)) if (answered.has(day)) n += 1;
  return n;
}

