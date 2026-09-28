// CUL-1086 — was THIS rated meal a free-fed bowl? The one predicate the intake-decline
// detectors on both surfaces use (`lib/analytics.ts` on the phone, `generate-signal/detection.ts`
// on the server, and the vet report through the latter), so the two can only agree.
//
// BY DATE, NEVER BY FOOD (PM ruling, 2026-09-28). The first cut excluded every rating of a food
// that is free-fed TODAY, which is how the phone had always done it. The adversarial pass broke
// it three ways, all from ignoring time:
//   • a cat refuses its meal-fed kibble three times; the owner reacts by leaving it down; the
//     refusals, observed and reliable, vanished and Home said nothing about intake;
//   • a past report window read June's meals against September's bowl;
//   • a bowl taken up yesterday counted again, and its "ate it all" became page 1's last full
//     meal, understating the gap inside the feline 48–72 h window.
//
// WHAT THE RECORD KNOWS, AND WHERE IT DOES NOT. The opening is an instant: every toggle-on writes
// a fresh row whose `created_at` is that moment (`startFreeChoice`; sync carries it verbatim and
// never rewrites it). The closing is NOT: `active_until` is the owner's LOCAL date
// (`localDateString`), and the one instant written with it, `updated_at`, is restamped by the
// server trigger on every push. So the take-up happened somewhere inside that local date, which
// in UTC is somewhere in [date 00:00Z − 14 h, date 24:00Z + 12 h): 50 hours, whatever the zone.
//
// Round 2 of the adversarial pass broke the obvious reading (parse the date as UTC, close at its
// end, the Patterns convention): refusals the owner watched on the take-up day vanished (every
// zone), a bowl's evening "ate it all" counted as a watched meal (behind UTC), and the report's
// detector and appendix disagreed at a window edge (ahead of UTC). Patterns' convention is right
// for Patterns' question ("could she have grazed near this onset?"); it is the wrong constant here.
//
// SO THE UNKNOWN HALF IS SPLIT BY THE n=1 ASYMMETRY, not by a guess at the zone. Inside a bowl's
// UNCERTAIN interval a rating of concern (`refused`, `picked`) is counted, because a sample may
// escalate on presence; any other rating is set aside, because an unobservable "ate it all" may
// never reassure. Outside it the answer is certain. No time zone is read, so the phone and the
// server cannot disagree about a zone, and no guess about one can point the wrong way.
//
// The opening falls back to `active_from` (also a local date) only when `created_at` is
// unreadable; that date gets the same uncertain treatment.
//
// Pure: no I/O, no RN imports. `supabase/functions` imports this file, so a change here
// redeploys `generate-signal` and `generate-report` on merge (C-26).

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** The earliest a local date can begin, relative to its UTC midnight (UTC+14). */
const EARLIEST_LOCAL_START_MS = -14 * MS_PER_HOUR;
/** The latest a local date can end, relative to its UTC midnight (UTC−12). */
const LATEST_LOCAL_END_MS = MS_PER_DAY + 12 * MS_PER_HOUR;

/** A `free_choice` arrangement row, reduced to what the intake question reads. Callers pass
 *  only non-soft-deleted `free_choice` rows, active or ended. */
export interface FreeFedIntakeArrangement {
  foodItemId: string | null;
  /** ISO instant the row was written (the toggle-on). */
  createdAt: string | null;
  /** The owner's local DATE 'YYYY-MM-DD' — the fallback opening when `createdAt` is unreadable. */
  activeFrom: string | null;
  /** The owner's local DATE 'YYYY-MM-DD', or null while the bowl is still down. */
  activeUntil: string | null;
}

/**
 * A parsed arrangement. Ratings of `foodItemId` logged in [bowlFromMs, bowlUntilMs) were
 * certainly a bowl; those in an `uncertain` interval may or may not have been.
 */
export interface FreeFedIntakeSpan {
  foodItemId: string;
  bowlFromMs: number;
  bowlUntilMs: number;
  uncertain: readonly { fromMs: number; untilMs: number }[];
}

/** The UTC instants a local date could span, whatever the owner's zone. */
function localDateBounds(date: string): { earliest: number; latest: number } | null {
  const midnightUtc = Date.parse(date);
  if (Number.isNaN(midnightUtc)) return null;
  return { earliest: midnightUtc + EARLIEST_LOCAL_START_MS, latest: midnightUtc + LATEST_LOCAL_END_MS };
}

/**
 * Parse arrangement rows to spans. Drops a row with no food (it names no ratings) or with no
 * readable opening at all. A row toggled off minutes after it went on keeps only an uncertain
 * interval: its concern ratings still count, and nothing it covers can reassure.
 */
export function parseFreeFedIntakeSpans(rows: readonly FreeFedIntakeArrangement[]): FreeFedIntakeSpan[] {
  const out: FreeFedIntakeSpan[] = [];
  for (const r of rows) {
    if (!r.foodItemId) continue;
    const uncertain: { fromMs: number; untilMs: number }[] = [];

    // The opening: an instant when the row has one; otherwise the whole of its local date is
    // uncertain and the bowl is certain only once that date has ended everywhere.
    const created = r.createdAt == null ? NaN : Date.parse(r.createdAt);
    let open: number;
    if (Number.isFinite(created)) {
      open = created;
    } else {
      const from = r.activeFrom == null ? null : localDateBounds(r.activeFrom);
      if (from === null) continue;
      uncertain.push({ fromMs: from.earliest, untilMs: from.latest });
      open = from.latest;
    }

    // The closing: never while the bowl is down; otherwise the take-up is somewhere inside the
    // local date, so the bowl is certain only until that date could have begun, and uncertain
    // from there until it has ended everywhere. Neither interval reaches back before the row.
    let close = Infinity;
    if (r.activeUntil != null) {
      const until = localDateBounds(r.activeUntil);
      if (until === null) continue;
      close = Math.max(open, until.earliest);
      const uncertainFrom = Number.isFinite(created) ? Math.max(created, until.earliest) : until.earliest;
      if (until.latest > uncertainFrom) uncertain.push({ fromMs: uncertainFrom, untilMs: until.latest });
    }

    out.push({ foodItemId: r.foodItemId, bowlFromMs: open, bowlUntilMs: close, uncertain });
  }
  return out;
}

/** A rating that may escalate on presence (n=1): the pet refused or only picked at it. */
function isConcernRating(rating: string | null): boolean {
  return rating === 'refused' || rating === 'picked';
}

/**
 * Was a rating of `foodItemId` logged at `ms` a free-fed bowl? Certain bowl time excludes it;
 * uncertain time excludes it unless it is a rating of concern; any other time counts it. A null
 * food, or a non-finite instant, never matches: the rating stays counted, the safe direction for
 * an escalation-only detector.
 */
export function isFreeFedIntakeMeal(
  foodItemId: string | null,
  ms: number,
  rating: string | null,
  spans: readonly FreeFedIntakeSpan[],
): boolean {
  if (foodItemId === null || !Number.isFinite(ms)) return false;
  let uncertain = false;
  for (const s of spans) {
    if (s.foodItemId !== foodItemId) continue;
    if (s.bowlFromMs <= ms && ms < s.bowlUntilMs) return true;
    if (s.uncertain.some((u) => u.fromMs <= ms && ms < u.untilMs)) uncertain = true;
  }
  return uncertain && !isConcernRating(rating);
}
