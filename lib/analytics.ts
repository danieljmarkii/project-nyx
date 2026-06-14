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

// ── B. Top foods (ranking card) ─────────────────────────────────────────────────

export interface RankedFood {
  foodItemId: string;
  label: string;
  /** food_type so the card can tag a treat topping the list (reads honestly). */
  foodType: string | null;
  count: number;
}

export interface RankOptions {
  /** Max entries returned (default 5). The floor is independent of the cap. */
  limit?: number;
}

/** Pure: most-LOGGED foods, ranked by meal count desc. Descriptive "what's logged
 *  most" — treats are included (and tagged via foodType) so a frequently-given treat
 *  reads honestly; the meal/treat split lives in getMealTreatComposition. Floored on
 *  the number of identifiable foods (§11 #5). */
export function computeTopFoods(rows: AnalyticsMeal[], opts: RankOptions = {}): RankedFood[] | NotEnoughData {
  const limit = opts.limit ?? 5;
  const candidates = rows.filter((m) => m.foodItemId !== null && !!m.foodLabel);
  if (candidates.length < ANALYTICS_FLOORS.minMealsForRanking) {
    return notEnoughData(candidates.length, ANALYTICS_FLOORS.minMealsForRanking);
  }
  const byFood = new Map<string, RankedFood>();
  for (const m of candidates) {
    const id = m.foodItemId as string;
    const entry = byFood.get(id);
    if (entry) entry.count += 1;
    else byFood.set(id, { foodItemId: id, label: m.foodLabel as string, foodType: m.foodType, count: 1 });
  }
  return [...byFood.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// ── B. Top proteins (ranking card) ──────────────────────────────────────────────

export interface RankedProtein {
  protein: string;
  count: number;
}

/** Pure: most-consumed primary protein, CANONICALIZED before ranking (so chicken /
 *  Chicken / "Chicken By-Product Meal" pool into one key, not three). Meals whose
 *  protein canonicalizes to null (junk/unknown/unidentified) are dropped. Floored on
 *  the number of protein-identified meals (§11 #5). */
export function computeTopProteins(rows: AnalyticsMeal[], opts: RankOptions = {}): RankedProtein[] | NotEnoughData {
  const limit = opts.limit ?? 5;
  const byProtein = new Map<string, number>();
  let identified = 0;
  for (const m of rows) {
    const key = canonicalizeProtein(m.primaryProtein);
    if (key === null) continue;
    identified += 1;
    byProtein.set(key, (byProtein.get(key) ?? 0) + 1);
  }
  if (identified < ANALYTICS_FLOORS.minMealsForRanking) {
    return notEnoughData(identified, ANALYTICS_FLOORS.minMealsForRanking);
  }
  return [...byProtein.entries()]
    .map(([protein, count]) => ({ protein, count }))
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

/**
 * Pure: share of MEALS the pet finished (`most`/`all`). The denominator is rated
 * meals with `food_type != 'treat'` (§11 #1 — treats finish at a ceiling rate and
 * would mask a meal refusal) and is NOT free-fed (§11 #6 — a free-fed food's intake
 * isn't directly observed). Below the rated-meal floor → notEnoughData. Treats are
 * never folded in here; they are counted separately by getMealTreatComposition.
 */
export function computeIntakeRate(rows: AnalyticsMeal[], opts: IntakeRateOptions): IntakeRate | NotEnoughData {
  const ratedNonTreat = rows.filter((m) => m.foodType !== 'treat' && m.intakeRating != null);
  const isFreeFed = (m: AnalyticsMeal): boolean => m.foodItemId !== null && opts.freeFedFoodIds.has(m.foodItemId);
  const freeFedExcluded = ratedNonTreat.filter(isFreeFed).length;
  const denominator = ratedNonTreat.filter((m) => !isFreeFed(m));

  if (denominator.length < ANALYTICS_FLOORS.minRatedMealsForIntakeRate) {
    return notEnoughData(denominator.length, ANALYTICS_FLOORS.minRatedMealsForIntakeRate);
  }
  const finished = denominator.filter((m) => (INTAKE_SCORE[m.intakeRating as string] ?? 0) >= FINISHED_SCORE).length;
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
    const prior = sorted.slice(0, -1);
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
     WHERE m.pet_id = ? AND e.deleted_at IS NULL
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
  const rows = await readMealRows(petId, range.currentStartMs, range.currentEndMs);
  return computeTopFoods(rows, opts);
}

export async function getTopProteins(
  petId: string,
  window: AnalyticsWindow,
  nowMs: number = Date.now(),
  opts: RankOptions = {},
): Promise<RankedProtein[] | NotEnoughData> {
  const range = calendarWindow(window, nowMs);
  const rows = await readMealRows(petId, range.currentStartMs, range.currentEndMs);
  return computeTopProteins(rows, opts);
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
  const startMs = nowMs - DECLINE.baselineWindowDays * MS_PER_DAY;
  const endMs = (Math.floor(nowMs / MS_PER_DAY) + 1) * MS_PER_DAY;
  const [meals, freeFedFoodIds] = await Promise.all([
    readMealRows(petId, startMs, endMs),
    readFreeFedFoodIds(petId),
  ]);
  return detectIntakeDecline({ species, nowMs, meals, freeFedFoodIds });
}
