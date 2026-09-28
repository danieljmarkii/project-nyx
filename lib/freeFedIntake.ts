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
// A rating is excluded only when its food's bowl was down at the moment it was logged.
//
// THE SPAN, AND WHY IT IS NOT PATTERNS' SPAN. `parseFreeFedSpans` (`lib/patternsTiming.ts`) and
// detection's `classifyArrangements` open a bowl at `active_from` midnight. That answers "could
// she have grazed near this onset?", where generous is safe. This asks "is this rating a bowl or
// a watched meal?", where the safe error is to COUNT the rating: an owner who rated a meal before
// telling the app the bowl was down was rating a meal. So a span opens at the arrangement row's
// `created_at` (every toggle-on writes a fresh row; `startFreeChoice`), falling back to
// `active_from` midnight only when `created_at` is unreadable. It closes at the end of the
// `active_until` DATE (the house convention; a DATE is a whole day), or never while the bowl is
// down. Same value on one side, different question: two constants, each derived here (C-34).
//
// Pure: no I/O, no RN imports. `supabase/functions` imports this file, so a change here
// redeploys `generate-signal` and `generate-report` on merge (C-26).

const MS_PER_DAY = 86_400_000;

/** A `free_choice` arrangement row, reduced to what the intake question reads. Callers pass
 *  only non-soft-deleted `free_choice` rows, active or ended. */
export interface FreeFedIntakeArrangement {
  foodItemId: string | null;
  /** ISO instant the row was written (the toggle-on). */
  createdAt: string | null;
  /** DATE 'YYYY-MM-DD' — the fallback opening when `createdAt` is unreadable. */
  activeFrom: string | null;
  /** DATE 'YYYY-MM-DD', or null while the bowl is still down. */
  activeUntil: string | null;
}

/** A parsed span: ratings of `foodItemId` logged in [fromMs, untilMs) were a bowl. */
export interface FreeFedIntakeSpan {
  foodItemId: string;
  fromMs: number;
  untilMs: number;
}

/**
 * Parse arrangement rows to spans. Drops a row with no food (it names no ratings), no
 * readable opening, or an empty / inverted span (an owner who toggled on and off on the
 * same day before any meal exposes nothing).
 */
export function parseFreeFedIntakeSpans(rows: readonly FreeFedIntakeArrangement[]): FreeFedIntakeSpan[] {
  const out: FreeFedIntakeSpan[] = [];
  for (const r of rows) {
    if (!r.foodItemId) continue;
    const created = r.createdAt == null ? NaN : Date.parse(r.createdAt);
    const from = Number.isFinite(created) ? created : r.activeFrom == null ? NaN : Date.parse(r.activeFrom);
    if (!Number.isFinite(from)) continue;
    let until: number;
    if (r.activeUntil == null) {
      until = Infinity;
    } else {
      const parsed = Date.parse(r.activeUntil);
      if (Number.isNaN(parsed)) continue;
      until = parsed + MS_PER_DAY;
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
