// Analytics aggregate layer — the "Patterns" dashboard fact substrate (B-023 PR 1).
//
// This module computes every dashboard metric DETERMINISTICALLY from local SQLite,
// per active pet, over a trailing calendar window. It is the fact substrate that
// PRs 2–4 render and phrase — the dashboard's equivalent of detection.ts for the
// Signal: code computes the truth here; the LLM (PR 4) only ever phrases it. No UI,
// no colors, no copy live in this file (those are PR 2/3 concerns); a number here is
// either honest or it is the typed `notEnoughData` sentinel — never invented.
//
// ── Structure: pure cores + thin DB wrappers ────────────────────────────────────
// Each metric is split into:
//   • a PURE `compute*` / `detect*` / `get*` function (no I/O) that takes plain
//     rows + a window/now and returns the result — this is where ALL the load-bearing
//     logic lives, and it is what the jest fixtures and the adversarial review hit
//     (mirrors detection.ts and the deriveBoundaryMarkers/getBoundaryMarkers split); and
//   • an async `get*` wrapper that reads from getDb() and delegates to the pure core.
// The wrappers carry the names PR 2/3 call; the pure cores carry the logic the DoD
// requires tests for.
//
// ── Non-negotiable invariants (analytics requirements §11) ──────────────────────
//   #1 Intake is NOT preference. detectIntakeDecline routes a declining-intake trend
//      to a HEALTH WATCH — nothing in this module may emit "picky"/"preference".
//      Finished-rate is MEALS ONLY: treats are excluded from the denominator (their
//      ceiling finish-rate masks a real meal refusal). Treats are counted SEPARATELY
//      by getMealTreatComposition, never folded into intake quality.
//   #5 Minimum-sample floors on every ranking/rate — below floor returns the
//      notEnoughData sentinel, never a fabricated rank/rate. (Raw COUNTS are always
//      honest and are NOT floored — a count of 1 vomit is a true fact, not noise.)
//   #6 Free-feeding honesty. A free-fed food's intake is not directly observed, so
//      free-fed foods are excluded from intake-rate denominators (and from the
//      decline detector's rated set) and the rate carries an "intake not directly
//      observed" marker — a free-fed absence is never read as "didn't eat".
//
// ── The B-084 window lesson (load-bearing) ──────────────────────────────────────
// Windows are TRAILING CALENDAR windows (day-aligned), NOT raw millisecond spans. A
// raw `[now − N·day, now]` span straddles N+1 calendar days at a non-midnight `now`,
// which silently skews every per-day bucket and prior-period delta. calendarWindow()
// aligns to UTC day boundaries so a "week" is exactly 7 calendar days and the prior
// period is the 7 before it — see its doc. UTC day bucketing matches both the Signal
// engine (detection.ts) and the existing Trend zone (hooks/useTrend.ts), so the three
// intelligence-ladder tiers agree on "this week's count" (owner-local-day bucketing
// is a future refinement — B-084 family — deliberately not introduced here as a third
// day convention).

import { getDb } from './db';
import { getActiveArrangementsForPet } from './feedingArrangements';
import { canonicalizeProtein } from './protein';

// ── Shared constants ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Adverse/health symptom event types surfaced by the dashboard. Mirrors the app's
 *  existing Trend-zone set (hooks/useTrend.ts) for cross-surface consistency:
 *  vomit, diarrhea (the abnormal-stool symptom — `stool_normal` is NOT adverse and
 *  is excluded), itch, scratch, skin_reaction, lethargy. */
export const SYMPTOM_EVENT_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'lethargy',
] as const;
export type SymptomEventType = (typeof SYMPTOM_EVENT_TYPES)[number];
const SYMPTOM_SET: ReadonlySet<string> = new Set(SYMPTOM_EVENT_TYPES);

export type Species = 'dog' | 'cat' | 'other';

/** WSAVA 5-point intake scale → ordinal score (0 refused .. 4 all). "Finished" a
 *  meal = rated `most` or `all` (score ≥ FINISHED_SCORE). */
const INTAKE_SCORE: Record<string, number> = {
  refused: 0,
  picked: 1,
  some: 2,
  most: 3,
  all: 4,
};
const FINISHED_SCORE = 3; // most | all

/**
 * Minimum-sample floors (§11 #5). Reuses the Signal's intake-baseline bar
 * (detection.ts DEFAULT_CONFIG.intakeDecline.minRatedMealsForBaseline = 4) so every
 * meal-derived ranking/rate shares ONE floor with the engine — "top protein off 3
 * meals is noise". Below a floor the function returns `notEnoughData`, never a rank
 * or rate. Tune on real data, not a re-decision (the §7 detection philosophy).
 */
export const ANALYTICS_FLOORS = {
  /** Min rated, non-treat, non-free-fed meals before a finished-rate is honest. */
  minRatedMealsForIntakeRate: 4,
  /** Min identifiable samples (foods / proteins) before a ranking is non-noise. */
  minMealsForRanking: 4,
} as const;

/** Decline-detector config — MIRRORS detection.ts DEFAULT_CONFIG.intakeDecline so the
 *  client health-watch and the server Signal apply the same clinical floors and can
 *  never drift. Clinically set (incl. the feline single-day hepatic-lipidosis path),
 *  NOT a UI-selectable range — see detectIntakeDecline. */
const DECLINE = {
  minRatedMealsForBaseline: 4,
  consecutiveDaysBelowBaseline: 2,
  baselineWindowDays: 14,
  minDeclineDelta: 1,
  normallyEatenScoreFloor: 3,
  normallyEatenMinSamples: 3,
  refusalRecencyDays: 2,
  cat: { consecutiveDaysBelowBaseline: 1, singleDayConcernCeiling: 2 },
} as const;

// ── The notEnoughData sentinel (§11 #5) ─────────────────────────────────────────

/**
 * A typed "below the minimum-sample floor" result. Returned in place of a rank/rate
 * so a thin dataset can NEVER masquerade as a real finding — the card renders the
 * "still learning the baseline — N more samples" calibration state (§10) from it.
 * `samples` = qualifying samples found; `needed` = the floor that wasn't met.
 */
export interface NotEnoughData {
  status: 'not_enough_data';
  samples: number;
  needed: number;
}

export function notEnoughData(samples: number, needed: number): NotEnoughData {
  return { status: 'not_enough_data', samples, needed };
}

/** Narrowing guard so callers (and tests) can branch on the sentinel. False for the
 *  array-typed results (rankings) and the plain-object results that carry no status. */
export function isNotEnoughData(x: unknown): x is NotEnoughData {
  return (
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    (x as { status?: unknown }).status === 'not_enough_data'
  );
}

// ── Trailing calendar windows (the B-084 lesson) ────────────────────────────────

export type AnalyticsWindow = 'week' | 'month' | '3month';

/** Window length in trailing calendar days. Month/3-month are trailing 30/90 days
 *  (day-aligned), the honest reading of "trailing calendar window" — not fixed
 *  Jun-1..Jun-30 boundaries. */
export const WINDOW_DAYS: Record<AnalyticsWindow, number> = {
  week: 7,
  month: 30,
  '3month': 90,
};

export interface WindowRange {
  windowDays: number;
  /** Inclusive start of the current window (UTC-day-aligned ms). */
  currentStartMs: number;
  /** Exclusive end of the current window = end of today (UTC-day-aligned ms). */
  currentEndMs: number;
  /** Inclusive start of the immediately-preceding equal-length window. */
  priorStartMs: number;
  /** Exclusive end of the prior window (== currentStartMs). */
  priorEndMs: number;
  /** UTC day index (floor(ms/day)) of `now`'s day — the last bucket of the window. */
  todayIndex: number;
}

/**
 * Trailing calendar window for `window`, ending on `now`'s UTC day. The current
 * window is the last `windowDays` calendar days INCLUDING today; the prior window is
 * the `windowDays` days immediately before it. Day-aligned on both edges so the
 * window is exactly `windowDays` days wide regardless of the time-of-day of `now`
 * (the B-084 fix — a raw ms span would straddle one extra calendar day).
 *
 *   week, now=2026-06-14T15:00Z →
 *     current = [06-08 .. 06-14]  (7 days),  prior = [06-01 .. 06-07]  (7 days)
 */
export function calendarWindow(window: AnalyticsWindow, nowMs: number): WindowRange {
  const windowDays = WINDOW_DAYS[window];
  const todayIndex = Math.floor(nowMs / MS_PER_DAY);
  const currentStartMs = (todayIndex - (windowDays - 1)) * MS_PER_DAY;
  const currentEndMs = (todayIndex + 1) * MS_PER_DAY;
  const priorStartMs = (todayIndex - (2 * windowDays - 1)) * MS_PER_DAY;
  const priorEndMs = currentStartMs;
  return { windowDays, currentStartMs, currentEndMs, priorStartMs, priorEndMs, todayIndex };
}

/** UTC 'YYYY-MM-DD' for a ms instant — the day-bucket key. Matches detection.ts's
 *  utcDateKey so per-day grouping is identical across surfaces. */
function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Plain row shapes (what the DB wrappers read, what the cores consume) ─────────

/** A symptom event reduced to what the count/frequency cores need. */
export interface AnalyticsSymptom {
  type: string;
  ms: number;
}

/** A meal reduced to what the food/protein/intake cores need. One shape feeds them
 *  all so the wrapper does the SQLite read + parse once. */
export interface AnalyticsMeal {
  ms: number;
  foodItemId: string | null;
  /** Display label "Brand Product", or null when the food isn't in the local cache. */
  foodLabel: string | null;
  /** food_items.food_type: 'meal' | 'treat' | 'other' | null (unclassified/legacy). */
  foodType: string | null;
  /** Raw primary_protein — canonicalized inside the protein core, never before. */
  primaryProtein: string | null;
  /** WSAVA rating string, or null when unrated. */
  intakeRating: string | null;
}

// ── A. Symptom counts + prior-period delta (the count card) ─────────────────────

export interface SymptomCount {
  symptomType: string;
  /** Raw event count in the current window. NOT episode-collapsed: a count card
   *  answers "how many times did I log this" and must match the History timeline
   *  the owner can scroll. (Episode-collapsing is a statistical refinement for the
   *  correlation engine, not a descriptive count.) */
  current: number;
  /** Raw event count in the prior equal-length window. */
  prior: number;
  /** current − prior. Positive = MORE symptoms (the card inverts color for adverse;
   *  no color is applied here). */
  delta: number;
}

/** Pure: per-symptom current/prior counts + delta over the window. Only symptom
 *  types with activity in either window are returned, ranked by current desc. No
 *  floor — counts are always honest. */
export function computeSymptomCounts(rows: AnalyticsSymptom[], range: WindowRange): SymptomCount[] {
  const current: Record<string, number> = {};
  const prior: Record<string, number> = {};
  for (const r of rows) {
    if (!SYMPTOM_SET.has(r.type) || !Number.isFinite(r.ms)) continue;
    if (r.ms >= range.currentStartMs && r.ms < range.currentEndMs) {
      current[r.type] = (current[r.type] ?? 0) + 1;
    } else if (r.ms >= range.priorStartMs && r.ms < range.priorEndMs) {
      prior[r.type] = (prior[r.type] ?? 0) + 1;
    }
  }
  const types = new Set([...Object.keys(current), ...Object.keys(prior)]);
  const out: SymptomCount[] = [];
  for (const t of types) {
    const c = current[t] ?? 0;
    const p = prior[t] ?? 0;
    out.push({ symptomType: t, current: c, prior: p, delta: c - p });
  }
  out.sort((a, b) => b.current - a.current || b.prior - a.prior || a.symptomType.localeCompare(b.symptomType));
  return out;
}

// ── A. Symptom frequency by day (the month heat-grid) ────────────────────────────

export interface DayFrequencyBucket {
  /** UTC 'YYYY-MM-DD'. */
  date: string;
  /** Total adverse-symptom events that day. */
  total: number;
  /** Per-type breakdown so a per-symptom grid can pick one type. */
  byType: Record<string, number>;
}

/** Pure: one bucket per calendar day in the CURRENT window (oldest first, exactly
 *  windowDays buckets), so the heat-grid has an honest cell for every day including
 *  zero-event days. No floor — frequency is always honest. */
export function computeSymptomFrequencyByDay(
  rows: AnalyticsSymptom[],
  range: WindowRange,
): DayFrequencyBucket[] {
  const startIndex = Math.floor(range.currentStartMs / MS_PER_DAY);
  const buckets: DayFrequencyBucket[] = [];
  const byIndex = new Map<number, DayFrequencyBucket>();
  for (let idx = startIndex; idx <= range.todayIndex; idx++) {
    const bucket: DayFrequencyBucket = { date: utcDateKey(idx * MS_PER_DAY), total: 0, byType: {} };
    buckets.push(bucket);
    byIndex.set(idx, bucket);
  }
  for (const r of rows) {
    if (!SYMPTOM_SET.has(r.type) || !Number.isFinite(r.ms)) continue;
    if (r.ms < range.currentStartMs || r.ms >= range.currentEndMs) continue;
    const bucket = byIndex.get(Math.floor(r.ms / MS_PER_DAY));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.byType[r.type] = (bucket.byType[r.type] ?? 0) + 1;
  }
  return buckets;
}

// ── B. Per-item finished-rate (the ranking-card bar's intake signal — §11 #1/#5/#6) ──
//
// For a SINGLE food or protein: the share of ITS rated, non-free-fed meals that were
// finished (most/all). Treats are NOT excluded here (unlike the overall meals-only rate)
// — this rates the item itself; a treat's rate is a ceiling, so the CARD shows the treat
// tag instead of the number (never "treats 100% finished" → "loved", §11 #1). Floored at
// minRatedMealsForIntakeRate: below it the rate is null (the card shows a "needs a few
// more" hint, never a confident rate off 1–2 meals — a food a pet is starting to refuse
// must not read as a low "preference"). A food whose every logged meal is free-fed has no
// observed intake → null (§11 #6). A LOW rate is descriptive + neutral; a real "started
// refusing" is the floored decline detector's job, not this card.

export interface ItemFinishedRate {
  /** finished/rated in [0,1], or null below the floor / when intake isn't observed. */
  rate: number | null;
  /** Rated, non-free-fed meals behind the rate (the floor denominator). */
  ratedMeals: number;
}

function itemFinishedRate(meals: AnalyticsMeal[], freeFed: ReadonlySet<string>): ItemFinishedRate {
  const rated = meals.filter((m) => m.intakeRating != null && !isFreeFedMeal(m, freeFed));
  if (rated.length < ANALYTICS_FLOORS.minRatedMealsForIntakeRate) {
    return { rate: null, ratedMeals: rated.length };
  }
  return { rate: rated.filter(isFinishedMeal).length / rated.length, ratedMeals: rated.length };
}

// ── B-115: exact-timestamp same-food TREAT re-log collapse ───────────────────────
//
/**
 * Collapse exact-timestamp re-logs of the SAME treat food into ONE exposure, BEFORE the
 * ranking cores count. A "multi-piece handful logged per-piece" — one treat-giving entered
 * as N rows that share an identical (foodItemId, occurred_at) — over-counts that treat's
 * protein/food EXPOSURE (count → share → rank → ranking floor). Bounded on the descriptive
 * dashboard, but Top-Protein / Top-Food bridge to the vet report's diet-confounder line,
 * where overstating a confounder's prevalence is the wrong headline for a diet-trial owner
 * (vet-report spec §8.6 / §11) — so the artifact is removed here, once, for both cards.
 *
 * SCOPE — the narrowest SAFE collapse (the Data-Scientist settlement for B-115):
 *   • TREATS ONLY (`food_type='treat'`). Meals are never touched, so the meals-only
 *     finished-rate and the decline detector (§11 #1) cannot regress — this stays entirely
 *     off the clinical intake lane. (A meal can't be eaten twice in one instant either, but
 *     the B-115 concern is treat exposure over-count; treat-scoping bounds the blast radius
 *     to the two ranking cards and keeps the change un-entangled from intake quality.)
 *   • EXACT timestamp, NOT a fuzzy window. Two treat rows at the literal same ms for one
 *     food cannot be two real givings, so collapsing them never erases a genuine exposure.
 *     A time-WINDOW merge could fold two genuinely-separate givings into one and UNDER-count
 *     a confounder the vet needs to SEE — the worse error here (under-count can hide a
 *     diet-trial saboteur; over-count merely inflates a rank). Never-over-collapse dominates,
 *     so we take only the provable duplicate.
 *   • NON-NULL `foodItemId` — a null id can't identify "the same food re-logged," so those
 *     rows pass through (preserve exposure).
 *
 * This is an exact-duplicate ARTIFACT removal (one giving recorded N times), NOT the general
 * symptom episode-collapse the count cards decline (see computeSymptomCounts) — it does not
 * merge distinct feedings into clinical episodes. KNOWN RESIDUAL (flagged for B-115 / real
 * data): every meal entry point today stamps a full-precision `new Date()` (FAB quick-log,
 * the `now`-sourced picker), so a rapid per-tap handful lands on DISTINCT ms and is NOT
 * caught by the exact-ms key — i.e. for the vet-report confounder line this guards the
 * EXIF-collision + future-batch cases, not yet the per-tap handful (the canonical B-115 case).
 * The one stamp-identical trigger reachable today is two EXIF-stamped photos sharing a
 * same-second capture time (second precision, `.000` ms): collapsing ONE giving photographed
 * twice is the desired behavior, while two genuinely-distinct same-second givings merging is a
 * rare over-collapse that errs SAFELY — it under-states, never over-states, treat prevalence.
 * Widening to a small same-food near-window is a Data-Scientist/PM call gated on real-data
 * prevalence (it reintroduces that under-count risk more broadly); exact-ms is the safe floor
 * that ships the precondition now and self-applies to any future batch/quantity log path that
 * writes one timestamp.
 *
 * Pure + order-independent: non-collapsible rows pass through unchanged; the first-seen row of
 * a collapsed group is kept (its protein/label/food_type are identical across the group by
 * construction — one `foodItemId` joins one `food_items` row — so the choice is immaterial).
 */
function collapseTreatRelogs(rows: AnalyticsMeal[]): AnalyticsMeal[] {
  const seen = new Set<string>();
  const out: AnalyticsMeal[] = [];
  for (const m of rows) {
    if (m.foodType === 'treat' && m.foodItemId !== null && Number.isFinite(m.ms)) {
      const key = `${m.foodItemId}\u0000${m.ms}`; // \u0000 separator: cannot occur in a UUID or a number
      if (seen.has(key)) continue; // an exact-timestamp re-log of this treat → already counted
      seen.add(key);
    }
    out.push(m);
  }
  return out;
}

// ── B. Top foods (ranking card) ─────────────────────────────────────────────────

export interface RankedFood {
  foodItemId: string;
  label: string;
  /** food_type so the card can tag a treat topping the list (reads honestly). */
  foodType: string | null;
  count: number;
  /** count / total logged identifiable foods, [0,1] — "share of diet" (drives the bar). */
  shareOfDiet: number;
  /** This food's finished-rate (itemFinishedRate): null below the floor, fully free-fed,
   *  OR a classified treat — a treat's ceiling rate is nulled AT THE SOURCE so no consumer
   *  can render "treats 100% finished → loved" (§11 #1). */
  finishedRate: number | null;
  /** Rated, non-free-fed meals behind finishedRate. */
  ratedMeals: number;
  /** Any logged row classified `food_type='treat'` — finishedRate is null (ceiling, §11 #1). */
  isTreat: boolean;
}

export interface RankOptions {
  /** Max entries returned (default 5). The floor is independent of the cap. */
  limit?: number;
  /** Foods currently free-fed for this pet — excluded from each item's finished-rate
   *  denominator (§11 #6). Absent ⇒ none free-fed (pure-core tests pass it explicitly). */
  freeFedFoodIds?: ReadonlySet<string>;
}

/** Pure: most-LOGGED foods, ranked by meal count desc. Descriptive "what's logged most"
 *  — treats are included (and flagged via isTreat) so a frequently-given treat reads
 *  honestly; the meal/treat split lives in getMealTreatComposition. Floored on the number
 *  of identifiable foods (§11 #5). Each entry carries its share of the diet (the bar) and
 *  its own finished-rate (§11 #1 — intake, never "preference"; floored; treat = ceiling).
 *  Exact-timestamp same-treat re-logs are collapsed first (B-115; see collapseTreatRelogs)
 *  so a multi-piece handful entered per-piece is ONE exposure, not N — count/share/floor. */
export function computeTopFoods(rows: AnalyticsMeal[], opts: RankOptions = {}): RankedFood[] | NotEnoughData {
  const limit = opts.limit ?? 5;
  const freeFed = opts.freeFedFoodIds ?? new Set<string>();
  // B-115: collapse exact-timestamp same-treat re-logs BEFORE counting so a per-piece
  // handful can't inflate a treat's count/share/floor (meals untouched → finished-rate
  // and the decline lane are unaffected). See collapseTreatRelogs for the exact-ms scope.
  const candidates = collapseTreatRelogs(rows).filter((m) => m.foodItemId !== null && !!m.foodLabel);
  if (candidates.length < ANALYTICS_FLOORS.minMealsForRanking) {
    return notEnoughData(candidates.length, ANALYTICS_FLOORS.minMealsForRanking);
  }
  const byFood = new Map<string, AnalyticsMeal[]>();
  for (const m of candidates) {
    const id = m.foodItemId as string;
    const arr = byFood.get(id);
    if (arr) arr.push(m);
    else byFood.set(id, [m]);
  }
  const total = candidates.length;
  const ranked: RankedFood[] = [];
  for (const [id, meals] of byFood) {
    // treat-if-ANY row (order-independent) so a mixed/legacy classification errs toward
    // the ceiling-safe direction, not whichever row the DB returned first (adversarial
    // review LOW #2). NOTE: an entirely UNclassified treat (food_type null on every row)
    // still can't be known as a treat — that's a food-classification limit, not B-098.
    const isTreat = meals.some((m) => m.foodType === 'treat');
    const fr = itemFinishedRate(meals, freeFed);
    ranked.push({
      foodItemId: id,
      label: meals[0].foodLabel as string,
      foodType: meals[0].foodType,
      count: meals.length,
      shareOfDiet: meals.length / total,
      // A classified treat carries NO finish-rate AT THE SOURCE (not merely hidden by the
      // card): a treat's ceiling rate must never be able to render as "100% finished →
      // loved", even via a consumer that ignores isTreat (adversarial review LOW #1, §11 #1).
      finishedRate: isTreat ? null : fr.rate,
      ratedMeals: fr.ratedMeals,
      isTreat,
    });
  }
  return ranked
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// ── B. Top proteins (ranking card) ──────────────────────────────────────────────

export interface RankedProtein {
  protein: string;
  /** Total protein-EXPOSURE feedings (meals + treats) carrying this protein in the window.
   *  Treats ARE counted (B-111): a chicken treat is real chicken exposure, not noise. */
  count: number;
  /** count / total protein-identified feedings, [0,1] — "share of servings" (drives the bar). */
  shareOfDiet: number;
  /** Meal INTAKE quality: finished-rate over this protein's NON-TREAT meals only (§11 #1 —
   *  a treat's ceiling finish-rate must never inflate it / mask a meal refusal). null below
   *  the per-item floor, fully free-fed, OR a treat-sourced protein (no meal to rate). */
  finishedRate: number | null;
  /** Rated, non-free-fed, NON-TREAT meals behind finishedRate. */
  ratedMeals: number;
  /** This protein reaches the pet ONLY via treats (treat-sourced) — finishedRate is null and
   *  the card shows a "treat" tag instead of a rate (mirrors RankedFood.isTreat). The #1
   *  diet-trial confounder made visible (B-111): a novel-protein elimination trial sabotaged
   *  by an old-protein treat now surfaces here, flagged, instead of vanishing. */
  isTreat: boolean;
}

/** Pure: most-consumed primary protein by EXPOSURE, CANONICALIZED before ranking (so chicken /
 *  Chicken / "Chicken By-Product Meal" pool into one key, not three). Feedings whose protein
 *  canonicalizes to null (junk/unknown/unidentified) are dropped. Floored on the number of
 *  protein-identified feedings (§11 #5).
 *
 *  TREATS ARE INCLUDED, FLAGGED isTreat (B-111, 2026-06-18 — reverses the prior treats-out
 *  rule for THIS card). The §11 #1 "treats out" rule exists for the finished-RATE (treats
 *  finish at a ceiling, masking a meal refusal) — but this card ranks by COUNT = protein
 *  EXPOSURE, where a treat's protein is a genuine, clinically load-bearing exposure: a chicken
 *  treat is the #1 diet-trial confounder (a novel-protein elimination trial sabotaged by an
 *  old-protein treat is exactly what the vet needs to see), and dropping it made that exposure
 *  invisible. So EXPOSURE (count / share / floor) includes treats; INTAKE (finishedRate) stays
 *  meals-only, preserving §11 #1. Mirrors computeTopFoods' include-and-flag stance.
 *
 *  isTreat predicate DELIBERATELY DIFFERS from computeTopFoods' treat-if-ANY: a food_item has
 *  ONE food_type (a mixed row-set is a misclassification, so treat-if-any errs ceiling-safe),
 *  but a PROTEIN legitimately aggregates several foods — "chicken" from kibble + treats is a
 *  MEAL protein, not a treat. So a protein is treat-sourced only when EVERY exposure is a treat
 *  (no meal to rate). A real meal protein therefore keeps its honest finish-rate; only
 *  purely-treat exposure flags. Each entry carries its share of servings (the bar) + its meal
 *  finished-rate (§11 #1).
 *
 *  EXPOSURE IS A RAW FEEDING COUNT — genuinely-separate feedings are never episode-collapsed
 *  (the SAME descriptive stance as computeSymptomCounts: the card answers "how many were logged"
 *  and tracks the History timeline the owner can scroll; episode-collapse is a correlation-engine
 *  refinement, not a descriptive count). The ONE exception is B-115: an exact-timestamp same-food
 *  TREAT re-log (a multi-piece handful entered per-piece) is collapsed to a single exposure by
 *  collapseTreatRelogs BEFORE counting — that is an exact-duplicate ARTIFACT (one giving recorded
 *  N times), not a merge of distinct feedings, and it keeps a treat from inflating its
 *  count/share/rank on the vet-report-bound diet-confounder line (resolves the B-111 adversarial
 *  review CE-H caveat; see collapseTreatRelogs for the exact-ms-only scope + the rapid-per-tap
 *  residual). Meals are never collapsed, so the meals-only finished-rate (§11 #1) is untouched. */
export function computeTopProteins(rows: AnalyticsMeal[], opts: RankOptions = {}): RankedProtein[] | NotEnoughData {
  const limit = opts.limit ?? 5;
  const freeFed = opts.freeFedFoodIds ?? new Set<string>();
  const byProtein = new Map<string, AnalyticsMeal[]>();
  let identified = 0;
  // B-115: collapse exact-timestamp same-treat re-logs BEFORE ranking exposure, so a
  // per-piece handful can't inflate a treat protein's count/share/rank/floor (the
  // diet-confounder line bridges to the vet report). Meals untouched → §11 #1 holds.
  for (const m of collapseTreatRelogs(rows)) {
    const key = canonicalizeProtein(m.primaryProtein);
    if (key === null) continue;
    identified += 1; // treats count as protein EXPOSURE (B-111) — no longer dropped
    const arr = byProtein.get(key);
    if (arr) arr.push(m);
    else byProtein.set(key, [m]);
  }
  if (identified < ANALYTICS_FLOORS.minMealsForRanking) {
    return notEnoughData(identified, ANALYTICS_FLOORS.minMealsForRanking);
  }
  const ranked: RankedProtein[] = [];
  for (const [protein, feedings] of byProtein) {
    // Treat-sourced ⟺ NO non-treat meal carries this protein (see doc — differs from
    // computeTopFoods' treat-if-any: a protein is a legitimate multi-food aggregation).
    const mealRows = feedings.filter((m) => m.foodType !== 'treat');
    const isTreat = mealRows.length === 0;
    // Finished-rate over NON-TREAT meals only (§11 #1): a treat's ceiling rate never inflates
    // it; a treat-only protein has no meal to rate → null AT THE SOURCE (mirrors computeTopFoods,
    // so no consumer can render "treats 100% finished → loved").
    const fr = itemFinishedRate(mealRows, freeFed);
    ranked.push({
      protein,
      count: feedings.length,
      shareOfDiet: feedings.length / identified,
      finishedRate: isTreat ? null : fr.rate,
      ratedMeals: fr.ratedMeals,
      isTreat,
    });
  }
  return ranked
    .sort((a, b) => b.count - a.count || a.protein.localeCompare(b.protein))
    .slice(0, limit);
}

// ── B. Intake / finished-rate (MEALS ONLY — §11 #1) ─────────────────────────────

export interface IntakeRate {
  /** finishedMeals / ratedMeals, in [0, 1]. */
  rate: number;
  /** Meals rated `most`/`all` (the numerator). */
  finishedMeals: number;
  /** Rated, non-treat, non-free-fed meals (the denominator). */
  ratedMeals: number;
  /** How many rated non-treat meals were excluded because the food is free-fed. */
  freeFedExcluded: number;
  /** §11 #6 — set when ≥1 free-fed meal was excluded: intake wasn't directly observed. */
  intakeNotDirectlyObserved: boolean;
}

export interface IntakeRateOptions {
  /** Food IDs currently free-fed for this pet — excluded from the denominator. */
  freeFedFoodIds: ReadonlySet<string>;
}

/** True when a meal's food is currently free-fed for this pet — its intake isn't
 *  directly observed, so it is excluded from every intake-rate denominator (§11 #6). */
function isFreeFedMeal(m: AnalyticsMeal, freeFed: ReadonlySet<string>): boolean {
  return m.foodItemId !== null && freeFed.has(m.foodItemId);
}

/** A meal counts as "finished" at most/all (score ≥ FINISHED_SCORE). ONE definition,
 *  shared by the rate, its sparkline series, and the decline detector's good-meal idea. */
function isFinishedMeal(m: AnalyticsMeal): boolean {
  return (INTAKE_SCORE[m.intakeRating as string] ?? 0) >= FINISHED_SCORE;
}

/** Rated, non-treat, non-free-fed meals — the ONE definition of an intake-rate
 *  "qualifying meal" (§11 #1 treats-out, §11 #6 free-fed-out), shared by BOTH the
 *  finished-rate big number (computeIntakeRate) and its sparkline shape
 *  (computeIntakeRateSeries) so the two can never apply different rules and tell
 *  different stories. */
function qualifyingIntakeMeals(rows: AnalyticsMeal[], freeFed: ReadonlySet<string>): AnalyticsMeal[] {
  return rows.filter(
    (m) => m.foodType !== 'treat' && m.intakeRating != null && !isFreeFedMeal(m, freeFed),
  );
}

/**
 * Pure: share of MEALS the pet finished (`most`/`all`). The denominator is rated
 * meals with `food_type != 'treat'` (§11 #1 — treats finish at a ceiling rate and
 * would mask a meal refusal) and is NOT free-fed (§11 #6 — a free-fed food's intake
 * isn't directly observed). Below the rated-meal floor → notEnoughData. Treats are
 * never folded in here; they are counted separately by getMealTreatComposition.
 */
export function computeIntakeRate(rows: AnalyticsMeal[], opts: IntakeRateOptions): IntakeRate | NotEnoughData {
  const ratedNonTreat = rows.filter((m) => m.foodType !== 'treat' && m.intakeRating != null);
  const freeFedExcluded = ratedNonTreat.filter((m) => isFreeFedMeal(m, opts.freeFedFoodIds)).length;
  const denominator = qualifyingIntakeMeals(rows, opts.freeFedFoodIds);

  if (denominator.length < ANALYTICS_FLOORS.minRatedMealsForIntakeRate) {
    return notEnoughData(denominator.length, ANALYTICS_FLOORS.minRatedMealsForIntakeRate);
  }
  const finished = denominator.filter(isFinishedMeal).length;
  return {
    rate: finished / denominator.length,
    finishedMeals: finished,
    ratedMeals: denominator.length,
    freeFedExcluded,
    intakeNotDirectlyObserved: freeFedExcluded > 0,
  };
}

// ── B. Meal vs treat composition (composition card — §11 #1) ─────────────────────

export interface MealTreatComposition {
  meal: number;
  treat: number;
  other: number;
  /** food_type null/unrecognised (legacy, not yet classified). */
  unclassified: number;
  total: number;
}

/** Pure: counts logged feedings by food_type. Treats are counted SEPARATELY here —
 *  never folded into intake quality (§11 #1). Descriptive (what was logged), never a
 *  judgment on the owner's feeding choices. No floor: an empty split is just the
 *  empty state the card owns. */
export function computeMealTreatComposition(rows: AnalyticsMeal[]): MealTreatComposition {
  const out: MealTreatComposition = { meal: 0, treat: 0, other: 0, unclassified: 0, total: rows.length };
  for (const m of rows) {
    if (m.foodType === 'meal') out.meal += 1;
    else if (m.foodType === 'treat') out.treat += 1;
    else if (m.foodType === 'other') out.other += 1;
    else out.unclassified += 1;
  }
  return out;
}

// ── A. Diet-trial progress ──────────────────────────────────────────────────────
//
// PURE by necessity: `diet_trials` lives in Supabase, NOT local SQLite (it is read in
// hooks/useTrend.ts via supabase.from('diet_trials')). PR 1 adds no schema/sync, so
// there is no local mirror to read. The PR 3 screen fetches the active trial (as
// useTrend already does) and passes it here; this function does the day math. The
// counter is anchored on the trial's `started_at` (a DATE), day-aligned (B-084).

export interface DietTrial {
  /** 'YYYY-MM-DD' (DATE) or ISO — the trial's start. */
  startedAt: string;
  targetDurationDays: number;
  status?: string;
}

export interface DietTrialProgress {
  /** Day 1 = the start day; inclusive elapsed days, clamped ≥ 1. */
  dayCounter: number;
  targetDays: number;
  daysRemaining: number;
  /** dayCounter / targetDays, clamped to [0, 1]. */
  fraction: number;
  /** dayCounter has reached the target (the milestone). */
  complete: boolean;
}

/** Pure: progress toward a diet trial's target, from its start date and `now`.
 *  Returns null only when `startedAt` is unparseable. */
export function getDietTrialProgress(trial: DietTrial, nowMs: number): DietTrialProgress | null {
  const startMs = Date.parse(trial.startedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return null;
  const startIndex = Math.floor(startMs / MS_PER_DAY);
  const todayIndex = Math.floor(nowMs / MS_PER_DAY);
  const dayCounter = Math.max(1, todayIndex - startIndex + 1);
  const targetDays = Math.max(0, Math.floor(trial.targetDurationDays));
  const daysRemaining = Math.max(0, targetDays - dayCounter);
  const fraction = targetDays > 0 ? Math.min(1, dayCounter / targetDays) : 0;
  const complete = targetDays > 0 && dayCounter >= targetDays;
  return { dayCounter, targetDays, daysRemaining, fraction, complete };
}

// ── A. Intake-decline → HEALTH WATCH (§11 #1; mirrors detection.ts detector ②) ──
//
// The clinically load-bearing one. A declining-intake trend is a non-specific
// DISEASE signal (anorexia; the feline 48h hepatic-lipidosis window) — it routes to
// a HEALTH WATCH and is NEVER softened to "picky"/"preference". The result type
// carries no such field BY CONSTRUCTION, and every flag is `class: 'health_watch'`.
//
// This mirrors detection.ts detector ② exactly (same classification, same floors via
// DECLINE) so the dashboard's client-side watch and the server Signal can never
// disagree. It deliberately does NOT take the dashboard's week/month/3-month window:
// a clinical safety net must use its clinically-validated baseline (14d) and recency
// windows, never a UI-selected range that could dilute "recent" (a 3-month view) or
// be too short to see a baseline (a 1-week view). Sensitivity over specificity, like
// detector ②. Free-fed meals are excluded — a free-fed bowl's rating is unreliable
// and its absence is not a refusal (§11 #6).

/** A single decline trigger, structured for the card to phrase downstream. Carries
 *  NO "picky"/"preference" framing — `class` is always the health-watch route. */
export interface IntakeDeclineFlag {
  trigger: 'consecutive_low' | 'refused_normal_food';
  /** Routing marker: a decline is a health concern, never a preference. */
  class: 'health_watch';
  species: Species;
  baselineScore: number;
  recentScore: number;
  daysBelowBaseline: number;
  refusedFoodLabel: string | null;
  ratedMealsConsidered: number;
}

export type IntakeDeclineResult =
  | { status: 'watch'; flags: IntakeDeclineFlag[] }
  | { status: 'none' }
  | NotEnoughData;

export interface IntakeDeclineInput {
  species: Species;
  nowMs: number;
  /** All meals in the clinical baseline lookback (any food_type/rating). */
  meals: AnalyticsMeal[];
  /** Foods currently free-fed for this pet — their meals are excluded (§11 #6). */
  freeFedFoodIds: ReadonlySet<string>;
}

interface RatedMeal {
  ms: number;
  score: number;
  foodItemId: string | null;
  foodLabel: string | null;
}

/** Rated 'meal'-type foods only, free-fed excluded, sorted ascending — the exact
 *  classification detection.ts uses (foodType === 'meal' && rating != null), so a
 *  logging gap or a treat can never masquerade as a decline, plus the §11 #6
 *  free-fed exclusion. */
function classifyRatedMeals(meals: AnalyticsMeal[], freeFed: ReadonlySet<string>): RatedMeal[] {
  return meals
    .filter((m) => m.foodType === 'meal' && m.intakeRating != null)
    .filter((m) => !(m.foodItemId !== null && freeFed.has(m.foodItemId)))
    .map((m) => ({
      ms: m.ms,
      score: INTAKE_SCORE[m.intakeRating as string] ?? 0,
      foodItemId: m.foodItemId,
      foodLabel: m.foodLabel,
    }))
    .filter((m) => Number.isFinite(m.ms))
    .sort((a, b) => a.ms - b.ms);
}

export function detectIntakeDecline(input: IntakeDeclineInput): IntakeDeclineResult {
  const nowMs = input.nowMs;
  if (!Number.isFinite(nowMs)) return notEnoughData(0, DECLINE.minRatedMealsForBaseline);

  const ratedMeals = classifyRatedMeals(input.meals, input.freeFedFoodIds);

  // Coverage floor: too few rated meals → not enough data (NOT an all-clear — §11 #2).
  if (ratedMeals.length < DECLINE.minRatedMealsForBaseline) {
    return notEnoughData(ratedMeals.length, DECLINE.minRatedMealsForBaseline);
  }
  const baselineWindowStart = nowMs - DECLINE.baselineWindowDays * MS_PER_DAY;
  const windowMeals = ratedMeals.filter((m) => m.ms >= baselineWindowStart);
  if (windowMeals.length < DECLINE.minRatedMealsForBaseline) {
    return notEnoughData(windowMeals.length, DECLINE.minRatedMealsForBaseline);
  }

  const flags: IntakeDeclineFlag[] = [];

  // ── Trigger A: consecutive recent days below baseline ──────────────────────
  // Baseline EXCLUDES the recent days under scrutiny, else a sharp drop dilutes its
  // own baseline and hides itself. Cats fire on a SINGLE below-baseline day (the
  // 48h hepatic-lipidosis window); dogs wait for 2. A day with no rated meal is
  // SKIPPED, never read as a decline — a logging gap is not anorexia.
  const isCat = input.species === 'cat';
  const consecutiveDays = isCat ? DECLINE.cat.consecutiveDaysBelowBaseline : DECLINE.consecutiveDaysBelowBaseline;
  // Raw ms offset (not calendar-aligned) ON PURPOSE — this and the utcDateKey day
  // loop below are a faithful mirror of detection.ts detector ②, and they are
  // mutually consistent (a meal can't be both in baseline and a recent-day bucket).
  // Don't "fix" this to a calendar window in isolation without doing the same on the
  // server, or the two surfaces' baseline/recent split would drift.
  const recentCutoffMs = nowMs - consecutiveDays * MS_PER_DAY;
  const baselineMeals = windowMeals.filter((m) => m.ms < recentCutoffMs);

  if (baselineMeals.length >= DECLINE.minRatedMealsForBaseline) {
    const baselineScore = baselineMeals.reduce((s, m) => s + m.score, 0) / baselineMeals.length;
    const recentDays: { mean: number }[] = [];
    for (let i = 0; i < consecutiveDays; i++) {
      const key = utcDateKey(nowMs - i * MS_PER_DAY);
      const dayMeals = windowMeals.filter((m) => utcDateKey(m.ms) === key);
      if (dayMeals.length === 0) continue;
      recentDays.push({ mean: dayMeals.reduce((s, m) => s + m.score, 0) / dayMeals.length });
    }
    if (recentDays.length >= consecutiveDays) {
      const allBelow = recentDays.every((d) => d.mean < baselineScore);
      const recentMean = recentDays.reduce((s, d) => s + d.mean, 0) / recentDays.length;
      const material = baselineScore - recentMean >= DECLINE.minDeclineDelta;
      // Single-day (cat) path also requires the day to be genuinely low, not one notch.
      const meetsConcernFloor = consecutiveDays > 1 || recentMean <= DECLINE.cat.singleDayConcernCeiling;
      if (allBelow && material && meetsConcernFloor) {
        flags.push({
          trigger: 'consecutive_low',
          class: 'health_watch',
          species: input.species,
          baselineScore,
          recentScore: recentMean,
          daysBelowBaseline: recentDays.length,
          refusedFoodLabel: null,
          ratedMealsConsidered: baselineMeals.length,
        });
      }
    }
  }

  // ── Trigger B: refusal of a normally-eaten food ────────────────────────────
  // A food with a solid history of being eaten well, just refused, is meaningful
  // even when overall daily means look ok.
  const byFood = new Map<string, RatedMeal[]>();
  for (const m of windowMeals) {
    if (!m.foodItemId) continue;
    const arr = byFood.get(m.foodItemId) ?? [];
    arr.push(m);
    byFood.set(m.foodItemId, arr);
  }
  const refusalRecencyStart = nowMs - DECLINE.refusalRecencyDays * MS_PER_DAY;
  let refusalFlag: IntakeDeclineFlag | null = null;
  for (const meals of byFood.values()) {
    const sorted = [...meals].sort((x, y) => x.ms - y.ms);
    const latest = sorted[sorted.length - 1];
    if (latest.ms < refusalRecencyStart) continue;
    if (latest.score > INTAKE_SCORE.refused) continue; // only an outright refusal trips this
    // `prior` = this food's history on days BEFORE the latest meal's day. We exclude
    // the WHOLE latest calendar day (not a naive slice(0,-1)), so re-logged refusals
    // of one food on one day read as ONE refusal, not a history of refusals. Without
    // this, the earlier same-day refusals fall into `prior`, drag priorMean below
    // normallyEatenScoreFloor, and SILENTLY SUPPRESS the watch the HARDER the pet
    // refuses — an inverse-pseudoreplication false-negative caught by the adversarial
    // review (a dog refusing its food 3× in a day went silent; 1× correctly fired).
    // This client surface led with the fix; detection.ts detector ② now MIRRORS it
    // (B-090, ported + redeployed) — the two decline surfaces have re-converged and
    // can no longer disagree on a same-day re-logged refusal. The DECLINE constants
    // stay a byte-exact mirror of detection.ts DEFAULT_CONFIG.intakeDecline; keep the
    // refusal-arm logic in lock-step too: change one surface, change both.
    const latestDayKey = utcDateKey(latest.ms);
    const prior = sorted.filter((m) => utcDateKey(m.ms) !== latestDayKey);
    if (prior.length < DECLINE.normallyEatenMinSamples) continue;
    const priorMean = prior.reduce((s, m) => s + m.score, 0) / prior.length;
    if (priorMean < DECLINE.normallyEatenScoreFloor) continue;
    const candidate: IntakeDeclineFlag = {
      trigger: 'refused_normal_food',
      class: 'health_watch',
      species: input.species,
      baselineScore: priorMean,
      recentScore: latest.score,
      daysBelowBaseline: 0,
      refusedFoodLabel: latest.foodLabel,
      ratedMealsConsidered: meals.length,
    };
    // Surface the most-eaten-then-refused food (largest baseline) if several qualify.
    if (!refusalFlag || candidate.baselineScore > refusalFlag.baselineScore) refusalFlag = candidate;
  }
  if (refusalFlag) flags.push(refusalFlag);

  return flags.length > 0 ? { status: 'watch', flags } : { status: 'none' };
}

// ── DB read layer (thin wrappers — read SQLite, delegate to the pure cores) ──────

/** Symptom-event rows in [startMs, endMs), soft-deletes excluded. */
async function readSymptomRows(petId: string, startMs: number, endMs: number): Promise<AnalyticsSymptom[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ event_type: string; occurred_at: string }>(
    `SELECT event_type, occurred_at FROM events
     WHERE pet_id = ? AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?`,
    [petId, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return rows
    .map((r) => ({ type: r.event_type, ms: Date.parse(r.occurred_at) }))
    .filter((r) => Number.isFinite(r.ms));
}

/** Meal rows in [startMs, endMs) joined to the food cache, soft-deletes excluded. */
async function readMealRows(petId: string, startMs: number, endMs: number): Promise<AnalyticsMeal[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    food_item_id: string | null;
    intake_rating: string | null;
    occurred_at: string;
    food_type: string | null;
    primary_protein: string | null;
    brand: string | null;
    product_name: string | null;
  }>(
    `SELECT m.food_item_id, m.intake_rating, e.occurred_at,
            f.food_type, f.primary_protein, f.brand, f.product_name
     FROM meals m
     JOIN events e ON e.id = m.event_id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     -- Scope + soft-delete + time all on the events table so this uses the
     -- idx_events_pet_time partial index (matches getTimeline; meals.pet_id has no
     -- local index). The meals→events FK guarantees the meal belongs to this pet.
     WHERE e.pet_id = ? AND e.deleted_at IS NULL
       AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [petId, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return rows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      foodItemId: r.food_item_id,
      foodLabel: foodLabelOf(r.brand, r.product_name),
      foodType: r.food_type,
      primaryProtein: r.primary_protein,
      intakeRating: r.intake_rating,
    }))
    .filter((r) => Number.isFinite(r.ms));
}

function foodLabelOf(brand: string | null, product: string | null): string | null {
  const label = [brand, product].filter((s) => !!s && s.trim().length > 0).join(' ').trim();
  return label.length > 0 ? label : null;
}

/** Foods currently free-fed for this pet (§11 #6 exclusion set). */
async function readFreeFedFoodIds(petId: string): Promise<Set<string>> {
  const arrangements = await getActiveArrangementsForPet(petId);
  return new Set(arrangements.map((a) => a.food_item_id));
}

// ── Public DB-backed metrics (the names PR 2/3 call) ─────────────────────────────
//
// Error contract: these read-only wrappers PROPAGATE a local-DB error to the caller
// (they do not swallow it — matching lib/db.ts's read functions). The PR 2/3 screen
// owns the try/catch → empty/error state. This is deliberate fail-CLOSED for §11 #6:
// if the free-fed set can't be resolved, getIntakeRate throws rather than show a rate
// computed without the free-fed exclusion.

export async function getSymptomCounts(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
): Promise<SymptomCount[]> {
  const range = calendarWindow(window, nowMs);
  const rows = await readSymptomRows(petId, range.priorStartMs, range.currentEndMs);
  return computeSymptomCounts(rows, range);
}

export async function getSymptomFrequencyByDay(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
): Promise<DayFrequencyBucket[]> {
  const range = calendarWindow(window, nowMs);
  const rows = await readSymptomRows(petId, range.currentStartMs, range.currentEndMs);
  return computeSymptomFrequencyByDay(rows, range);
}

export async function getTopFoods(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
  opts: RankOptions = {},
): Promise<RankedFood[] | NotEnoughData> {
  const range = calendarWindow(window, nowMs);
  const [rows, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, range.currentStartMs, range.currentEndMs),
    readFreeFedFoodIds(petId),
  ]);
  return computeTopFoods(rows, { ...opts, freeFedFoodIds: opts.freeFedFoodIds ?? freeFedFoodIds });
}

export async function getTopProteins(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
  opts: RankOptions = {},
): Promise<RankedProtein[] | NotEnoughData> {
  const range = calendarWindow(window, nowMs);
  const [rows, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, range.currentStartMs, range.currentEndMs),
    readFreeFedFoodIds(petId),
  ]);
  return computeTopProteins(rows, { ...opts, freeFedFoodIds: opts.freeFedFoodIds ?? freeFedFoodIds });
}

export async function getIntakeRate(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
): Promise<IntakeRate | NotEnoughData> {
  const range = calendarWindow(window, nowMs);
  const [rows, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, range.currentStartMs, range.currentEndMs),
    readFreeFedFoodIds(petId),
  ]);
  return computeIntakeRate(rows, { freeFedFoodIds });
}

/** Current + prior finished-rate, for the intake card's "vs last {window}" read (B-098). */
export interface IntakeRateComparison {
  current: IntakeRate | NotEnoughData;
  prior: IntakeRate | NotEnoughData;
}

/**
 * The finished-rate for the current window AND the prior comparable window, so the card
 * can show "down from 41% last month" (B-098; closes the B-093 prior-rate gap). ONE
 * free-fed read is applied to BOTH windows: we don't store historical free-fed state,
 * and a food free-fed now was almost certainly free-fed last month — applying the
 * current exclusion to both keeps the two rates comparable (a small, documented
 * approximation that errs toward consistency, never toward a fabricated rate). Each side
 * floors independently, so a thin prior simply yields no comparison (the card omits the
 * delta line), never a made-up baseline.
 */
export async function getIntakeRateWithPrior(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
): Promise<IntakeRateComparison> {
  const range = calendarWindow(window, nowMs);
  const [currentRows, priorRows, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, range.currentStartMs, range.currentEndMs),
    readMealRows(petId, range.priorStartMs, range.priorEndMs),
    readFreeFedFoodIds(petId),
  ]);
  return {
    current: computeIntakeRate(currentRows, { freeFedFoodIds }),
    prior: computeIntakeRate(priorRows, { freeFedFoodIds }),
  };
}

export async function getMealTreatComposition(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
): Promise<MealTreatComposition> {
  const range = calendarWindow(window, nowMs);
  const rows = await readMealRows(petId, range.currentStartMs, range.currentEndMs);
  return computeMealTreatComposition(rows);
}

/**
 * DB wrapper for the clinical decline detector. Reads the trailing clinical baseline
 * (DECLINE.baselineWindowDays) of meals + the free-fed set, then runs the pure
 * detector. Window-INDEPENDENT by design — see detectIntakeDecline. `species` is
 * passed by the caller (lib/ stays free of the pet store).
 */
export async function getIntakeDecline(
  petId: string,
  species: Species,
  nowMs: number = Date.now(),
): Promise<IntakeDeclineResult> {
  // Day-align the read window (the B-084 lesson) so it is a SUPERSET of what the
  // detector's internal baseline filter uses. detectIntakeDecline keeps the raw
  // `nowMs - baselineWindowDays*MS_PER_DAY` filter (a faithful detection.ts mirror);
  // reading from the start of the earliest calendar day guarantees we never
  // under-fetch the meals that filter then selects.
  const todayIndex = Math.floor(nowMs / MS_PER_DAY);
  const startMs = (todayIndex - DECLINE.baselineWindowDays) * MS_PER_DAY;
  const endMs = (todayIndex + 1) * MS_PER_DAY;
  const [meals, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, startMs, endMs),
    readFreeFedFoodIds(petId),
  ]);
  return detectIntakeDecline({ species, nowMs, meals, freeFedFoodIds });
}
