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
// BY INSTANT, BECAUSE THE DATE COULD NOT SAY (PM ruling, same day, CUL-1396). A bowl is down
// from the toggle-on to the toggle-off: `created_at` (every toggle-on writes a fresh row; sync
// carries it verbatim) until `ended_at` (migration 076, written beside `active_until`). Before
// 076 the only record of the toggle-off was `active_until`, the owner's LOCAL DATE, some 50 hours
// of UTC wide; two more adversarial rounds broke every rule that inferred the instant inside it
// (the end of the UTC date hid refusals the owner watched on the take-up day; counting only
// concern ratings there lowered the baseline and masked a later drop).
//
// WHERE AN INSTANT IS MISSING, THE RATING COUNTS. That is the safe error for an escalation-only
// detector: a rating wrongly counted can at worst fire a flag; a rating wrongly set aside can
// hide one. So:
//   • no `ended_at` on an ended row (a row ended by a build predating 076): the bowl is down
//     only until the local date could have begun anywhere (UTC+14), and everything after counts;
//   • no `created_at` (never true of a synced row: NOT NULL DEFAULT NOW() server-side): the bowl
//     is down only from when the local date `active_from` has ended everywhere (UTC−12);
//   • `ended_at` on a row with no `active_until` is IGNORED: a stale push from an old build can
//     re-open a row another device ended, and the row, not a leftover instant, is the truth
//     (rls-privacy-reviewer condition on 076).
//
// Pure: no I/O, no RN imports. `supabase/functions` imports this file, so a change here
// redeploys `generate-signal` and `generate-report` on merge (C-26).

const MS_PER_HOUR = 3_600_000;
/** The earliest a local date can begin, relative to its UTC midnight (UTC+14). */
const EARLIEST_LOCAL_START_MS = -14 * MS_PER_HOUR;
/** The latest a local date can end, relative to its UTC midnight (UTC−12). */
const LATEST_LOCAL_END_MS = 36 * MS_PER_HOUR;

/** A `free_choice` arrangement row, reduced to what the intake question reads. Callers pass
 *  only non-soft-deleted `free_choice` rows, active or ended. */
export interface FreeFedIntakeArrangement {
  foodItemId: string | null;
  /** ISO instant the row was written (the toggle-on). */
  createdAt: string | null;
  /** The owner's local DATE 'YYYY-MM-DD' the bowl went down (fallback only). */
  activeFrom: string | null;
  /** The owner's local DATE 'YYYY-MM-DD' the bowl came up, or null while it is down. */
  activeUntil: string | null;
  /** ISO instant of the toggle-off (migration 076); null while down or on a pre-076 end. */
  endedAt: string | null;
}

/** A parsed span: ratings of `foodItemId` logged in [fromMs, untilMs) were a bowl. */
export interface FreeFedIntakeSpan {
  foodItemId: string;
  fromMs: number;
  untilMs: number;
}

function parseInstant(iso: string | null): number {
  return iso == null ? NaN : Date.parse(iso);
}

/**
 * Parse arrangement rows to spans. Drops a row with no food (it names no ratings), no readable
 * opening, or an empty / inverted span (a toggle off before any meal exposes nothing).
 */
export function parseFreeFedIntakeSpans(rows: readonly FreeFedIntakeArrangement[]): FreeFedIntakeSpan[] {
  const out: FreeFedIntakeSpan[] = [];
  for (const r of rows) {
    if (!r.foodItemId) continue;

    let from = parseInstant(r.createdAt);
    if (!Number.isFinite(from)) {
      const day = parseInstant(r.activeFrom);
      if (!Number.isFinite(day)) continue;
      from = day + LATEST_LOCAL_END_MS;
    }

    let until = Infinity;
    if (r.activeUntil != null) {
      const ended = parseInstant(r.endedAt);
      if (Number.isFinite(ended)) {
        until = ended;
      } else {
        const day = parseInstant(r.activeUntil);
        if (!Number.isFinite(day)) continue;
        until = day + EARLIEST_LOCAL_START_MS;
      }
    }

    if (until <= from) continue;
    out.push({ foodItemId: r.foodItemId, fromMs: from, untilMs: until });
  }
  return out;
}

/**
 * Was a rating of `foodItemId` logged at `ms` a free-fed bowl? A null food, or a non-finite
 * instant, never matches: the rating stays counted, the safe direction for an escalation-only
 * detector.
 */
export function isFreeFedIntakeMeal(
  foodItemId: string | null,
  ms: number,
  spans: readonly FreeFedIntakeSpan[],
): boolean {
  if (foodItemId === null || !Number.isFinite(ms)) return false;
  return spans.some((s) => s.foodItemId === foodItemId && s.fromMs <= ms && ms < s.untilMs);
}
