// The one "is she eating" vocabulary, import-free (Engines v3 PR-30, CUL-1722; GAP-28).
//
// WHY THIS FILE EXISTS. Before it, the app's intake predicate lived in `lib/analytics.ts` and
// `lib/lookWithheld.ts`, both of which reach the local database, so the vomit read
// (`supabase/functions/analyze-vomit`) could not import it and carried its own rule: "no
// meal rated Most or All in 24 hours". The critique (GAP-28) named the cost: a third "is she
// eating" rule beside the shipped one, and EN-5 about to write a fourth. This module holds
// the parts both sides need and imports nothing but `freeFedIntake.ts` (itself import-free),
// so an Edge Function can take it without pulling client code or copy (C-26).
//
// WHAT IT HOLDS.
//   · The WSAVA scale's scores and the two readings every consumer uses: a POSITIVE rating
//     (Most or All, "ate well") and a REFUSAL-CLASS rating (Refused or Picked, never Some).
//   · The qualifying meal: rated, not a treat, not a free-fed bowl (analytics §11 #1, #6).
//   · The Noticed predicate: two of the last three qualifying meals refused or picked,
//     inside a three-day recency bound (the daily look's arm 3, CUL-873; ruled sound there).
//
// THE RULE EVERY READER HERE OBEYS: AN UNRATED MEAL IS UNKNOWN. It is never a refusal and
// never a meal eaten well (EN-5; D2 ruled b, 2026-10-09). Each predicate asks the table for a
// KNOWN score rather than defaulting a missing one.

import { isFreeFedIntakeMeal, type FreeFedIntakeSpan } from './freeFedIntake.ts';

const MS_PER_DAY = 86_400_000;

/** WSAVA 5-point intake scale → ordinal score (0 refused .. 4 all). */
export const INTAKE_SCORE: Readonly<Record<string, number>> = {
  refused: 0,
  picked: 1,
  some: 2,
  most: 3,
  all: 4,
};
/** "Finished" / "ate well": Most or All. */
export const FINISHED_SCORE = 3;
/** The refusal class: Refused or Picked. */
export const PICKED_SCORE = 1;

/** Most or All. An unrated (null) or unknown rating is never positive. */
export function isPositiveIntakeRating(rating: string | null | undefined): boolean {
  const score = rating == null ? undefined : INTAKE_SCORE[rating];
  return score !== undefined && score >= FINISHED_SCORE;
}

/** Refused or Picked, never Some. An unrated (null) or unknown rating is never a refusal. */
export function isRefusedOrPickedRating(rating: string | null | undefined): boolean {
  const score = rating == null ? undefined : INTAKE_SCORE[rating];
  return score !== undefined && score <= PICKED_SCORE;
}

/** True when the rating is one of the scale's five words. */
export function isKnownIntakeRating(rating: string | null | undefined): boolean {
  return rating != null && INTAKE_SCORE[rating] !== undefined;
}

/** A meal as the intake predicates read it. */
export interface IntakeEvidenceMeal {
  ms: number;
  foodItemId: string | null;
  /** food_items.food_type: 'meal' | 'treat' | 'other' | null. */
  foodType: string | null;
  intakeRating: string | null;
}

/**
 * Rated, not a treat, not a free-fed bowl: the ONE qualifying meal (analytics §11 #1, #6).
 * A treat finishes at a ceiling and would mask a refusal (the pill pocket); a free-fed
 * bowl's intake is not directly observed.
 */
export function isQualifyingIntakeMeal(m: IntakeEvidenceMeal, freeFed: readonly FreeFedIntakeSpan[]): boolean {
  // Any non-null rating qualifies, as it always has (`qualifyingIntakeMeals.parity.test.ts`
  // pins it): a value outside the scale is neither a refusal nor a meal eaten well, so it can
  // take a slot in the last three without speaking either way.
  return m.foodType !== 'treat' && m.intakeRating != null && !isFreeFedIntakeMeal(m.foodItemId, m.ms, freeFed);
}

/** The Noticed predicate's recency bound, in days (the daily look's arm 3; see
 *  `lib/lookWithheld.ts` for why it is three and not the detector's two). */
export const NOTICED_REFUSAL_RECENCY_DAYS = 3;
/** How many of the last few qualifying meals must be refused or picked. */
export const NOTICED_REFUSAL_MIN = 2;
/** How many recent qualifying meals the predicate looks back over. */
export const NOTICED_REFUSAL_LOOKBACK = 3;

/**
 * The Noticed predicate over rows already bounded and qualified by the caller: two of the
 * newest three refused or picked. Re-sorts rather than trusting the caller's order.
 */
export function noticedRefusalPattern(qualifying: readonly IntakeEvidenceMeal[]): boolean {
  const recent = [...qualifying].sort((a, b) => b.ms - a.ms).slice(0, NOTICED_REFUSAL_LOOKBACK);
  return recent.filter((m) => isRefusedOrPickedRating(m.intakeRating)).length >= NOTICED_REFUSAL_MIN;
}

/**
 * The Noticed predicate as of one instant, over any rows: the rows inside
 * [atMs − 3 days, atMs] are qualified, then the newest three are read. A row after `atMs`
 * is not evidence about that instant, so the vomit read can ask it twice (at the vomit and
 * at the read) without a later meal speaking for an earlier moment.
 */
export function noticedRefusalAt(
  rows: readonly IntakeEvidenceMeal[],
  freeFed: readonly FreeFedIntakeSpan[],
  atMs: number,
): boolean {
  if (!Number.isFinite(atMs)) return false;
  const fromMs = atMs - NOTICED_REFUSAL_RECENCY_DAYS * MS_PER_DAY;
  return noticedRefusalPattern(
    rows.filter((m) => Number.isFinite(m.ms) && m.ms >= fromMs && m.ms <= atMs && isQualifyingIntakeMeal(m, freeFed)),
  );
}
