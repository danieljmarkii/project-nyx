// AI Signal — deterministic detection engine (B-045, Step 1).
//
// This is the "deterministic detection" half of the architecture decided in
// docs/nyx-ai-signal-requirements.md §2 (Option B: deterministic detection +
// LLM phrasing). It is a PURE module: it takes already-fetched, plain-shaped
// data and returns typed, ranked candidate findings. It performs no I/O, no DB
// access, and NO LLM call — the model (Step 2) only renders an already-true
// finding into a sentence; it never decides whether a pattern exists.
//
// Three v1 detectors live here (§4):
//   ① food/protein → symptom correlation  (the flagship wedge insight)
//   ② intake-decline calm safety flag      (MANDATORY never-reassure net)
//   ③ symptom-count reflection             (B-051 — the §7.1 rung-② "presence"
//      layer: "Nyx vomited 4 times this week — same as last." Counts/streaks,
//      NO causal claim. Renders only for a FLAT or IMPROVING (falling) trend; a
//      worsening trend is suppressed — never normalized as a neutral reflection
//      — and a zero-symptom week is never surfaced (absence ≠ wellness, §9).)
//
// All three honour the §6/§7 evidence-tier floors and the clinical guardrails in
// §9 and CLAUDE.md (associational-only correlation copy; intake decline routed as
// calm concern, never softened to "picky", never reassuring, and silent — not
// a false flag and not an all-clear — when intake-rating coverage is thin; a
// reflection is descriptive only, never reassures, and ranks below every safety
// finding).
//
// Why it lives under supabase/functions/: it is server-side code the
// `generate-signal` Edge Function (Step 2) imports. It is written as portable
// TypeScript (no Deno-only or Node-only APIs) so it runs in the Edge runtime
// and is unit-testable in isolation.

import { canonicalizeProtein } from './protein.ts'

// ── Domain types ──────────────────────────────────────────────────────────────

/** Symptom event types the correlation detector considers (schema reference query [2]). */
export const CORRELATION_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
] as const
export type SymptomType = (typeof CORRELATION_SYMPTOM_TYPES)[number]

/** WSAVA 5-point owner-reported intake scale (migration 011). */
export type IntakeRating = 'refused' | 'picked' | 'some' | 'most' | 'all'

export type Species = 'dog' | 'cat' | 'other'

/**
 * How confident we are that THIS pet actually ate a given food (B-040's attribution axis).
 * 'high' = directly attributable (hand-fed meal, a treat, witnessed eating). 'low' = a
 * shared / free-fed bowl in a multi-pet home where another pet could have eaten it.
 * The correlation detector models multi-cat as the GENERAL case: a 'low'-attribution
 * exposure is carried as a confounder and CAPS the finding at Early (it can never reach
 * Established, because we can't be sure this pet was the one exposed). Single-cat /
 * hand-fed = everything 'high' = the clean special case.
 */
export type AttributionConfidence = 'high' | 'low'

/** Numeric mapping of the ordinal intake scale, 0 (refused) .. 4 (all). */
const INTAKE_SCORE: Record<IntakeRating, number> = {
  refused: 0,
  picked: 1,
  some: 2,
  most: 3,
  all: 4,
}

export function intakeScore(rating: IntakeRating): number {
  return INTAKE_SCORE[rating]
}

export interface PetContext {
  name: string
  species: Species
  /** True when an elimination diet trial is active — drives context-lead ordering (§5, §8). */
  dietTrialActive: boolean
}

export interface SymptomEvent {
  id: string
  type: SymptomType
  /** ISO-8601 UTC. B-010 confidence-window weighting is a future refinement; v1 uses the point. */
  occurredAt: string
  severity?: number | null
}

export interface MealEvent {
  id: string
  /** ISO-8601 UTC. */
  occurredAt: string
  foodItemId: string | null
  /** Normalised primary protein, e.g. 'chicken'. Null when the meal's food is unidentified. */
  primaryProtein: string | null
  /** WSAVA intake rating; null for legacy/unrated rows or non-meal foods (treats/other). */
  intakeRating: IntakeRating | null
  /** food_items.food_type — only 'meal' contributes to the intake baseline (migration 010/011). */
  foodType: 'meal' | 'treat' | 'other' | null
  /** Optional display label for the food, used in evidence/phrasing payloads. */
  foodLabel?: string | null
  /**
   * Attribution confidence for THIS feeding (B-040). Absent/null defaults to 'high' —
   * matching today's per-pet logging semantics (a meal logged against a pet is an
   * assertion the pet ate it). B-040 supplies 'low' for shared / free-fed bowls; until
   * then every exposure is treated as attributable. See AttributionConfidence.
   */
  attributionConfidence?: AttributionConfidence | null
}

/**
 * A free-fed / always-available standing fact (B-040 R1, free-feeding-requirements
 * §3 / §8 PR 4). The pet has CONTINUOUS access to this food across its active
 * window — a standing BACKGROUND exposure, never a discrete point meal. This is the
 * engine-side capture of the free-feeding contract:
 *
 *   • It enters the correlation case-crossover as an in-window exposure, so a
 *     free-fed food is NEVER silently absent from the analysis.
 *   • A free-fed food is background context, never a clean correlate on its own (§3):
 *     while its arrangement is in-window, its protein is EXCLUDED from correlation
 *     candidacy. (Exclusion — not concordance-washout — because at an active-window
 *     boundary the matched control can land OUTSIDE the span, where the food is truly
 *     absent, which would otherwise manufacture a case-only discordant pair the
 *     discrete data cannot support. Adversarial review, PR 4.)
 *   • Its active-window BOUNDARIES remain analyzable: the exposure is in-window only
 *     within [activeFrom, activeUntil]; an ENDED arrangement touching none of the
 *     analysis windows does NOT exclude its protein (it was controlled then) — no
 *     blanket "always present forever".
 *   • While in-window it is a CONFOUNDER that caps any OTHER protein's correlation at
 *     Early — an uncontrolled standing exposure means we cannot certify a clean
 *     Established association for any protein in that window (§3 engine rule). This is
 *     separate from, and additive to, per-meal attribution (a shared bowl is ALSO 'low').
 *
 * Only `free_choice` arrangements are standing exposures; `meal_fed` arrangements
 * are vet-report metadata (their intake IS the discrete meal stream) and must NOT
 * be passed here. CONTRACT: the caller passes only active (deleted_at IS NULL)
 * free_choice rows; absent/empty → today's behavior is exactly unchanged.
 */
export interface FeedingArrangement {
  id: string
  /**
   * Raw primary protein of the free-fed food (canonicalized inside detection — the
   * SAME single source as meals, so a free-fed "Chicken By-Product Meal" pools with
   * a logged "chicken" meal). Null when the food's protein is unidentified — the
   * arrangement still acts as a generic standing confounder (it caps the tier) but
   * injects no named protein exposure.
   */
  primaryProtein: string | null
  /** Inclusive active-window start (ISO-8601, UTC). Null = unbounded (active since before lookback). */
  activeFrom: string | null
  /** Inclusive active-window end (ISO-8601, UTC). Null = still active (the bowl is still down). */
  activeUntil: string | null
  /**
   * Attribution that THIS pet is the one eating from the bowl (B-040 axis 1).
   * Single-pet free-fed = 'high' (no other pet could have); a multi-cat SHARED
   * bowl = 'low' (is_shared, deferred to the multi-pet sprint). Absent → 'high'.
   */
  attributionConfidence?: AttributionConfidence | null
}

export interface DetectionInput {
  pet: PetContext
  /**
   * Symptom events for this pet. CONTRACT: the caller (the `generate-signal` Edge
   * Function) MUST exclude soft-deleted rows (`deleted_at IS NULL`) before passing
   * them in — this pure module has no notion of deletion and would otherwise
   * correlate/flag against events the owner has removed.
   */
  symptomEvents: SymptomEvent[]
  /** Meal events for this pet. Same soft-delete contract as `symptomEvents`. */
  mealEvents: MealEvent[]
  /**
   * Active free-fed standing facts for this pet (B-040 R1). CONTRACT: the caller
   * passes only active, non-soft-deleted `free_choice` arrangements. Optional —
   * absent/empty means no free-feeding, and detection behaves exactly as before.
   * These are NOT point events: they enter the correlation engine as in-window
   * background exposures (matched-out constant, boundaries analyzable, tier-capping
   * confounder) per detectCorrelations. See FeedingArrangement.
   */
  feedingArrangements?: FeedingArrangement[]
  /** Reference "now" (ISO-8601 UTC), injected so detection is deterministic and testable. */
  now: string
}

// ── Finding types (§4/§5) ───────────────────────────────────────────────────

export type InsightType = 'food_symptom_correlation' | 'intake_decline' | 'reflection'

/** Safety/concern always leads (§5); everything else is an insight. */
export type PriorityClass = 'safety' | 'insight'

/** Confidence tier for correlation findings (§6). Safety flags carry no tier. */
export type EvidenceTier = 'early' | 'established'

interface FindingBase {
  type: InsightType
  priorityClass: PriorityClass
}

/**
 * Food/protein → symptom association, from a SYMPTOM-ANCHORED case-crossover (B-050):
 * the unit is the symptom episode ("case"), compared against a time-of-day-matched
 * control window from a symptom-free day for the same pet. ASSOCIATIONAL ONLY — there
 * is deliberately no causal field. The matched counts power tap-to-expand evidence
 * (§3.2) and let the phrasing layer cite real numbers without inventing them.
 */
export interface CorrelationFinding extends FindingBase {
  type: 'food_symptom_correlation'
  priorityClass: 'insight'
  tier: EvidenceTier
  symptomType: SymptomType
  protein: string
  /** Matched case/control pairs analysed (a symptom episode + its time-matched control window). */
  matchedPairs: number
  /** Of the matched pairs, how many had this protein in the CASE (pre-symptom) window. */
  caseExposed: number
  /** Of the matched pairs, how many had this protein in the matched CONTROL window. */
  controlExposed: number
  /** Discordant pairs: protein in the case window but NOT the control (the "b" cell of McNemar). */
  discordantCaseOnly: number
  /** Discordant pairs: protein in the control window but NOT the case (the "c" cell). */
  discordantControlOnly: number
  /** caseExposed/matchedPairs − controlExposed/matchedPairs; positive = enriched before symptoms. */
  riskDifference: number
  /** One-sided exact McNemar p on the discordant pairs. Established requires it to clear the corrected bar. */
  pValue: number
  /** Bonferroni-corrected significance threshold actually applied (alpha / family size). */
  correctedAlpha: number
  /**
   * Distinct symptom *episodes* of this type (rapid re-logs of one bout collapsed) —
   * the §7 "≥N episodes" arm. Episode-collapsing prevents one bout logged five times
   * from clearing the floor as five independent confirmations.
   */
  symptomEventCount: number
  /** The symptom-class-specific window actually applied (vomit ~12h, diarrhea ~24h, derm ~72h). */
  correlationWindowHours: number
  /**
   * Weakest attribution among this protein's case-window exposures. 'low' means a
   * shared / unattributed bowl was implicated → the finding is CAPPED at Early, never
   * Established (we can't be sure this pet ate it). Single-cat / hand-fed = 'high'.
   */
  attributionFloor: AttributionConfidence
  /** Hard marker for the phrasing layer + reviewers: never emit causal copy. */
  associationalOnly: true
}

export type IntakeDeclineTrigger = 'consecutive_low' | 'refused_normal_food'

/**
 * Calm intake-decline safety flag (②). NEVER softened into "picky", NEVER reassures,
 * and is only ever emitted on a genuine decline — its absence is silence, not wellness.
 */
export interface IntakeDeclineFinding extends FindingBase {
  type: 'intake_decline'
  priorityClass: 'safety'
  trigger: IntakeDeclineTrigger
  species: Species
  /** The pet's established baseline intake score (0..4) over the baseline window. */
  baselineScore: number
  /** Recent intake score that triggered the flag (mean of the recent low days, or the refusal). */
  recentScore: number
  /** Number of consecutive recent days below baseline (consecutive_low trigger). */
  daysBelowBaseline: number
  /** Food the pet normally eats but just refused (refused_normal_food trigger). */
  refusedFoodLabel: string | null
  /** How many rated meals informed the baseline — shown so an owner can gauge the read. */
  ratedMealsConsidered: number
}

/** A reflection only ever describes a FLAT ("same as last week") or IMPROVING (falling) trend. */
export type ReflectionDirection = 'flat' | 'improving'

/**
 * Symptom-count reflection (③, B-051) — the §7.1 rung-② "presence" layer. Purely
 * DESCRIPTIVE: a count of symptom episodes this week vs last, with NO causal claim
 * and NO wellness claim. It exists so a data-rich pet that produced no ①/② finding
 * still gets something honest on the Signal instead of the "keep logging" empty
 * state (the "silence churns" failure §7.1 names). Hard constraints, enforced in
 * detectReflections and re-asserted by phrasing/validatePhrasing:
 *   - renders ONLY for current ≤ prior (flat or falling). A rising trend is
 *     suppressed — worsening is owned by the safety lane (②/①) + per-incident
 *     analysis, NEVER framed as a neutral reflection (Dr. Chen, §7.1 amendment #5).
 *   - NEVER on a zero current count — "no vomiting this week" is reassurance-by-
 *     absence (§9), not a reflection.
 *   - ranks BELOW every safety finding AND below correlations (the gentlest layer).
 */
export interface ReflectionFinding extends FindingBase {
  type: 'reflection'
  priorityClass: 'insight'
  symptomType: SymptomType
  /** Distinct symptom episodes (re-logs collapsed) in the current window. ≥1 by construction. */
  currentCount: number
  /** Distinct symptom episodes in the prior (previous-period) window. ≥ currentCount by construction. */
  priorCount: number
  /** 'flat' = same count as last period; 'improving' = fewer than last. Never 'worsening' (suppressed). */
  direction: ReflectionDirection
  /** Length of each comparison window, in days (the period: 7 = week-over-week). */
  windowDays: number
}

export type Finding = CorrelationFinding | IntakeDeclineFinding | ReflectionFinding

/** A finding plus its resolved sort position, returned by the engine in ranked order. */
export interface RankedFinding {
  finding: Finding
  rank: number
}

// ── Coverage diagnostics (B-053) ────────────────────────────────────────────
//
// When NO finding clears its floor the engine still KNOWS why each detector
// stayed silent. B-053 surfaces the clinically-safe subset of those reasons on
// the no_pattern surface, so an owner who has logged for weeks gets an honest
// "here's why there's no signal yet" instead of the generic "no patterns" line
// (the §7.1 silence-churn risk). Same deterministic split as findings: the
// engine emits a structured, RANKED diagnostic set; copy is templated downstream
// (no LLM — like reflections ③).

/** The two v1 diagnostics. `add_protein` / below-floor / no-control-days are deliberately out (see detectCoverage). */
export type CoverageDiagnosticType = 'rate_meals' | 'staple_washout'

/** Whether the diagnostic carries a corrective ask (`action`) or is purely informative (`explanation`). */
export type CoverageActionability = 'action' | 'explanation'

interface CoverageDiagnosticBase {
  type: CoverageDiagnosticType
  actionability: CoverageActionability
}

/**
 * Detector ② (intake-decline) is dormant because too few meals are RATED to
 * establish an intake baseline — the line-710 coverage floor. Rating more wakes
 * the detector, so this is the ACTION diagnostic (safe, corrective, improves the
 * dataset). It never reads as wellness — it's about coverage, not health.
 */
export interface RateMealsDiagnostic extends CoverageDiagnosticBase {
  type: 'rate_meals'
  actionability: 'action'
  /** Rated meals seen (foodType 'meal' + a non-null intake rating). */
  ratedMeals: number
  /** The §7 floor that wakes detector ② (intakeDecline.minRatedMealsForBaseline). */
  ratedMealsNeeded: number
}

/**
 * Detector ① (correlation) can't run because a SINGLE protein is in (nearly)
 * every meal — the line-505 "no contrast" discard. EXPLANATION ONLY: never a
 * "vary the diet" ask (that sabotages a vet-directed elimination trial — our
 * primary wedge — and inverts Pets>$), and FULLY SUPPRESSED on diet-trial pets
 * (the constant staple IS the elimination diet). It is honest uncertainty
 * ("we can't tell yet whether it's linked"), never reassurance.
 */
export interface StapleWashoutDiagnostic extends CoverageDiagnosticBase {
  type: 'staple_washout'
  actionability: 'explanation'
  /** The staple protein present across (nearly) every classifiable meal, e.g. 'chicken'. */
  protein: string
  /** Distinct symptom episodes (any correlation type, re-logs collapsed) the owner is trying to understand. */
  symptomEpisodes: number
}

export type CoverageDiagnostic = RateMealsDiagnostic | StapleWashoutDiagnostic

// ── Configuration (§7 thresholds = v1 defaults) ─────────────────────────────

export interface DetectionConfig {
  /** Default meal-before-symptom window, in hours (schema reference query [2] uses 8 for GI). */
  correlationWindowHours: number
  /**
   * Per-symptom-class window override. GI symptoms (vomit/diarrhea) react within hours;
   * dermatological symptoms (itch/scratch/skin_reaction) have a multi-day latency, so an
   * 8h window would systematically miss true food→skin associations. Falls back to
   * `correlationWindowHours` for any type not listed.
   */
  correlationWindowHoursByType: Partial<Record<SymptomType, number>>
  /** Symptoms of one type within this many hours collapse into a single episode (re-log guard). */
  symptomEpisodeGapHours: number
  correlation: {
    /** §7 Early: minimum matched case/control pairs (symptom episodes that found a usable control). */
    earlyMinMatchedPairs: number
    /** Guard against an n=1 coincidence: minimum discordant case-exposed pairs before an Early claim. */
    earlyMinDiscordantCaseOnly: number
    /** §7 Early "relaxed effect bar": minimum positive case−control exposure-rate difference. */
    earlyMinRiskDifference: number
    /** §7 Established: minimum matched pairs. */
    establishedMinMatchedPairs: number
    /** Familywise alpha before multiple-comparison correction. */
    familywiseAlpha: number
  }
  intakeDecline: {
    /** Coverage floor — below this many rated meals the detector stays SILENT (never a false flag). */
    minRatedMealsForBaseline: number
    /** §7: number of consecutive recent days below baseline that trips the flag (default/dog). */
    consecutiveDaysBelowBaseline: number
    /** Lookback window (days) used to establish the baseline. */
    baselineWindowDays: number
    /** Minimum baseline - recent gap (on the 0..4 scale) for the consecutive-low trigger to be material. */
    minDeclineDelta: number
    /** A food whose historical mean intake ≥ this is "normally eaten" (refused_normal_food trigger). */
    normallyEatenScoreFloor: number
    /** Minimum prior ratings of a food before "normally eaten then refused" is trustworthy. */
    normallyEatenMinSamples: number
    /** Recency window (days) within which a refusal counts as "just refused". */
    refusalRecencyDays: number
    /**
     * Cat-specific sensitivity override (Dr. Chen — P0). The feline 48hr hepatic-lipidosis
     * window makes waiting for 2 consecutive low days too slow, so a cat fires on a SINGLE
     * below-baseline day. To avoid crying wolf on a one-day dip from "all" to "most", the
     * single-day path additionally requires that day's mean to sit at/below
     * `singleDayConcernCeiling` (i.e. genuinely low, not merely a notch down). The coverage
     * floor and logging-gap guards are unchanged — sensitivity is raised on the day count
     * only, never by treating absent data as a decline.
     */
    cat: {
      consecutiveDaysBelowBaseline: number
      singleDayConcernCeiling: number
    }
  }
  reflection: {
    /** Length of each comparison period, in days (week-over-week = 7). */
    windowDays: number
    /**
     * Honesty floor: the larger of the two windows' episode counts must reach this
     * before a trend is worth stating (mirrors §7's ≥3 correlation episode floor).
     * Below it, a "same as last week" on 1–2 episodes is noise, not a reflection.
     */
    minEpisodesEitherWindow: number
    /**
     * Logging-eligibility floor: each window must contain at least this many distinct
     * days with ANY logged event. A coarse "was the app used at all" floor — the
     * symptom-day spread guard in detectReflections is what actually protects against
     * a symptom-logging gap reading as "improving".
     */
    minLoggingDaysPerWindow: number
    /**
     * Global worsening gate floor (adversarial review fix): the whole reflection layer
     * stays silent if ANY tracked symptom has at least this many current-window episodes
     * AND is rising (more episodes OR more symptom-days than the prior window). Set BELOW
     * minEpisodesEitherWindow on purpose — we are more eager to stay silent on a worsening
     * pet than to make a reflection claim (sensitivity over specificity for worsening,
     * mirroring detector ②). A lone single log (count 1) never blanks the surface.
     */
    worseningMinEpisodes: number
  }
  coverage: {
    /**
     * Min classifiable meals before "eats X in nearly every meal" is an honest
     * staple-washout claim. Below it, the single protein could just be a couple of
     * early logs, not an established staple.
     */
    stapleMinMeals: number
    /**
     * Min distinct symptom episodes (any correlation type) for staple-washout to
     * fire. Set to the correlation Early floor (correlation.earlyMinMatchedPairs),
     * NOT 1, and this alignment is load-bearing (adversarial review, B-053):
     *  - It must be ≥ 1 so "we can't tell whether it's linked to the symptoms you're
     *    tracking" is TRUE — there are symptoms to explain (else reassurance-by-
     *    implication: implying symptoms that don't exist).
     *  - It must MATCH ①'s episode floor so staple-washout only claims "the staple is
     *    why we can't assess linkage" when ① COULD have surfaced something given
     *    protein contrast. Below that, the staple is NOT the sole blocker — too-few-
     *    symptoms (the deliberately out-of-v1 "below-floor" reason) is co-present, and
     *    the honest surface is the generic building/no_pattern line, not a staple
     *    explanation that papers over the second blocker. Keeping them aligned closes
     *    the below-floor masquerade.
     * (The rate_meals floor likewise reuses intakeDecline.minRatedMealsForBaseline —
     * no separate knob; a diagnostic should mirror the floor of the detector it explains.)
     */
    stapleMinSymptomEpisodes: number
  }
}

/** §7 table, adopted as the v1 starting defaults (PM 2026-05-30); tune on real data, not a re-decision. */
export const DEFAULT_CONFIG: DetectionConfig = {
  correlationWindowHours: 12,
  correlationWindowHoursByType: {
    // Split GI by latency (Dr. Chen): acute vomiting is hours; dietary-indiscretion
    // diarrhea is longer; dermatological reactions are multi-day.
    vomit: 12,
    diarrhea: 24,
    itch: 72,
    scratch: 72,
    skin_reaction: 72,
  },
  symptomEpisodeGapHours: 3,
  correlation: {
    earlyMinMatchedPairs: 3,
    earlyMinDiscordantCaseOnly: 2,
    earlyMinRiskDifference: 0.2,
    establishedMinMatchedPairs: 5,
    familywiseAlpha: 0.05,
  },
  intakeDecline: {
    minRatedMealsForBaseline: 4,
    consecutiveDaysBelowBaseline: 2,
    baselineWindowDays: 14,
    minDeclineDelta: 1,
    normallyEatenScoreFloor: 3,
    normallyEatenMinSamples: 3,
    refusalRecencyDays: 2,
    cat: {
      consecutiveDaysBelowBaseline: 1,
      singleDayConcernCeiling: 2,
    },
  },
  // B-051 reflection floor — Conservative-but-useful (product-team call 2026-06-07,
  // PM deferred the exact values). Week-over-week; needs ≥3 episodes in the busier
  // window to bother stating a trend, and ≥3 actively-logged days in BOTH windows so
  // a logging gap can't masquerade as improvement. Tunable on real dogfood data per
  // the §7 philosophy — not a re-decision. (Known: week-over-week is jittery on small
  // counts; B-047 instrumentation watches whether that matters.)
  reflection: {
    windowDays: 7,
    minEpisodesEitherWindow: 3,
    minLoggingDaysPerWindow: 3,
    worseningMinEpisodes: 2,
  },
  // B-053 coverage-diagnostic floors. stapleMinMeals keeps "eats X in nearly every
  // meal" honest; stapleMinSymptomEpisodes mirrors the correlation Early episode
  // floor (correlation.earlyMinMatchedPairs = 3) so staple-washout only fires when
  // the staple is the SOLE blocker — closing the below-floor masquerade (see the
  // field doc + adversarial review, B-053). Tune on real data, not a re-decision.
  coverage: {
    stapleMinMeals: 4,
    stapleMinSymptomEpisodes: 3,
  },
}

// ── Statistics: one-sided Fisher's exact test ───────────────────────────────

// Log-factorial via a running sum of logs. Sample sizes here are small (tens of
// meals), so this is exact enough and avoids BigInt/overflow in the binomials.
const LOG_FACTORIAL_CACHE: number[] = [0, 0]
function logFactorial(n: number): number {
  if (n < 0) throw new RangeError('logFactorial: n must be >= 0')
  for (let i = LOG_FACTORIAL_CACHE.length; i <= n; i++) {
    LOG_FACTORIAL_CACHE[i] = LOG_FACTORIAL_CACHE[i - 1] + Math.log(i)
  }
  return LOG_FACTORIAL_CACHE[n]
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

/**
 * One-sided (right-tail) Fisher's exact test on a 2x2 table:
 *
 *                 symptom   no-symptom
 *   exposed          a           b
 *   unexposed        c           d
 *
 * Returns P(observing ≥ a symptom-following meals in the exposed arm | margins fixed) —
 * i.e. the probability of an association at least this strong by chance. Degenerate
 * tables (an empty arm or no symptoms) carry no evidence → p = 1.
 */
export function fisherExactRightTail(a: number, b: number, c: number, d: number): number {
  const row1 = a + b
  const row2 = c + d
  const col1 = a + c
  const n = a + b + c + d
  if (row1 === 0 || row2 === 0 || col1 === 0 || col1 === n) return 1

  const logDenom = logChoose(n, col1)
  const kMax = Math.min(row1, col1)
  let p = 0
  for (let k = a; k <= kMax; k++) {
    const logProb = logChoose(row1, k) + logChoose(row2, col1 - k) - logDenom
    p += Math.exp(logProb)
  }
  // Clamp tiny floating-point overshoot.
  return Math.min(1, p)
}

/**
 * One-sided exact McNemar test for matched pairs. Among the b+c DISCORDANT pairs (where
 * case and control disagree on exposure), each is equally likely to favour the case or
 * the control under the null, so b ~ Binomial(b+c, 0.5). Returns P(≥ b case-favouring
 * pairs) — the chance the case-side enrichment is at least this strong by luck. This is
 * the correct test for the case-crossover's matched design; a pooled/unmatched Fisher
 * would be biased (Biostatistician, B-050). No discordant pairs → no evidence → p = 1.
 */
export function mcNemarExactRightTail(b: number, c: number): number {
  const n = b + c
  if (n === 0) return 1
  const logHalfPow = n * Math.log(0.5)
  let p = 0
  for (let k = b; k <= n; k++) p += Math.exp(logChoose(n, k) + logHalfPow)
  return Math.min(1, p)
}

// ── Detector ①: food/protein → symptom correlation (symptom-anchored case-crossover) ──
//
// Each symptom EPISODE is a "case"; its pre-symptom window is compared against a
// time-of-day-matched CONTROL window drawn from a symptom-free day for the same pet.
// This (a) implicates EVERY protein in the case window, not just the nearest meal
// (no winner-take-all — the nearest-preceding placeholder, B-050, is gone); (b) counts
// each symptom once (no pseudoreplication); (c) lets a constant daily staple correctly
// wash out (present in both case and control windows → concordant → no signal); and
// (d) honours attribution confidence so multi-cat shared bowls degrade instead of
// false-firing. Matched comparison via the exact McNemar test (not pooled Fisher).
//
// B-040 (free-feeding R1, PR 4): active free_choice feeding_arrangements enter here as
// in-window STANDING exposures (input.feedingArrangements → classifyArrangements). A
// free-fed food is background context, never a clean correlate on its own (§3): any
// protein under an active free-fed arrangement that is in-window for a matched pair is
// EXCLUDED from candidacy (so it can never surface — and its active-window boundary can
// never manufacture a discordant pair, the bug the adversarial review caught). Any
// standing exposure in-window separately CAPS every still-evaluated protein at Early as
// a confounder. The capture side of the §3 contract.

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/**
 * Collapse a list of same-type symptom timestamps into episode ONSET times: any two
 * within `gapHours` of each other belong to one episode, represented by the earliest
 * (the onset, which is what the meal→symptom window should anchor on). This is half of
 * the pseudoreplication fix — a single bout re-logged several times is one episode, not
 * several independent confirmations.
 */
function toEpisodeOnsets(symptomMsList: number[], gapHours: number): number[] {
  if (symptomMsList.length === 0) return []
  const gapMs = gapHours * MS_PER_HOUR
  const sorted = [...symptomMsList].sort((a, b) => a - b)
  const onsets: number[] = [sorted[0]]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > gapMs) onsets.push(sorted[i])
    prev = sorted[i]
  }
  return onsets
}

/** A meal reduced to the fields the correlation/coverage logic needs. */
interface ClassifiedMeal {
  ms: number
  protein: string
  attribution: AttributionConfidence
}

/**
 * Classifiable meals: a known (canonicalized) protein + valid time, carrying
 * attribution confidence (absent → 'high', per today's per-pet logging semantics).
 * Sorted ascending. B-052: the protein key is canonicalized (lowercase/trim +
 * by-product/meal qualifier strip + junk-sentinel drop) so one real protein doesn't
 * fracture across `chicken` / `Chicken By-Product Meal` / the `"null"` string and
 * starve the matched-pair counts. A meal that canonicalizes to null carries no usable
 * protein and is excluded — this is the detection.ts line-498 discard, shared by
 * detectCorrelations AND the B-053 staple-washout coverage diagnostic so the
 * "classifiable meal" definition has ONE source and cannot drift.
 */
function classifyMeals(mealEvents: MealEvent[]): ClassifiedMeal[] {
  return mealEvents
    .map((m) => ({
      ms: Date.parse(m.occurredAt),
      protein: canonicalizeProtein(m.primaryProtein),
      attribution: (m.attributionConfidence ?? 'high') as AttributionConfidence,
    }))
    .filter((m): m is ClassifiedMeal => m.protein !== null && Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)
}

/** A free-fed standing fact reduced to the fields the correlation logic needs (B-040). */
interface StandingExposure {
  /** Canonicalized protein, or null when unidentified (still a generic standing confounder). */
  protein: string | null
  /** Active-window start in ms (-Infinity = unbounded past — active since before lookback). */
  fromMs: number
  /** Active-window end in ms, end-of-day-INCLUSIVE (+Infinity = still active / bowl still down). */
  untilMs: number
  /** Single-pet free-fed = 'high'; multi-cat shared bowl = 'low' (deferred). Absent → 'high'. */
  attribution: AttributionConfidence
}

/**
 * Reduce free-fed arrangements to standing exposures with parsed, end-of-day-
 * inclusive active windows (B-040). The protein is canonicalized through the SAME
 * canonicalizeProtein path as meals (ONE source — a free-fed "Chicken By-Product
 * Meal" and a logged "chicken" meal must resolve to the same key, or the exclusion
 * would miss the discrete logs of the free-fed food). `active_from`/`active_until`
 * are DATE columns, so
 * activeUntil is treated as inclusive of its whole day (the bowl is down all of that
 * day). A row with an unparseable or inverted/empty window is dropped — a garbage
 * span must never silently confound (cap) every finding.
 */
function classifyArrangements(arrangements: FeedingArrangement[]): StandingExposure[] {
  const out: StandingExposure[] = []
  for (const a of arrangements) {
    const fromMs = a.activeFrom == null ? -Infinity : Date.parse(a.activeFrom)
    if (Number.isNaN(fromMs)) continue
    let untilMs: number
    if (a.activeUntil == null) {
      untilMs = Infinity
    } else {
      const parsed = Date.parse(a.activeUntil)
      if (Number.isNaN(parsed)) continue
      untilMs = parsed + MS_PER_DAY // DATE = a whole day; the bowl is down through end of activeUntil
    }
    if (untilMs <= fromMs) continue // an empty / inverted window exposes nothing
    out.push({
      protein: canonicalizeProtein(a.primaryProtein),
      fromMs,
      untilMs,
      attribution: (a.attributionConfidence ?? 'high') as AttributionConfidence,
    })
  }
  return out
}

export function detectCorrelations(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): CorrelationFinding[] {
  const cfg = config.correlation

  const meals = classifyMeals(input.mealEvents)
  // Free-fed standing exposures (B-040). A free-fed food is BACKGROUND context, never
  // a correlate candidate on its own (§3). It does two things here, and ONLY these:
  //   (a) any protein under an active free-fed arrangement that is in-window for a
  //       matched pair is EXCLUDED from candidacy (freeFedProteins below). This is the
  //       direct encoding of "never a clean correlate on its own" and the fix for the
  //       active-window-boundary manufacture the adversarial review caught (PR 4): when
  //       contiguous symptom days force the matched control onto a day OUTSIDE the
  //       arrangement's span, the food is case-present / control-absent purely by the
  //       boundary, fabricating discordant pairs the discrete data cannot support.
  //   (b) ANY standing exposure in-window flags `standingConfounder`, capping every
  //       OTHER (still-evaluated) protein at Early.
  // A free-fed-only protein (never logged as a discrete meal) is never in `proteins` to
  // begin with; a free-fed protein that ALSO has discrete logs is removed by (a).
  const standing = classifyArrangements(input.feedingArrangements ?? [])

  const proteins = Array.from(new Set(meals.map((m) => m.protein)))
  // Need contrast: a single constant diet can't be correlated against anything.
  // The < 2 case is exactly what the B-053 staple-washout diagnostic explains
  // (proteins.length === 1 → a namable constant staple); see detectStapleWashout.
  if (proteins.length < 2) return []

  // Proteins present in [anchor - windowMs, anchor], keyed to the WEAKEST attribution
  // seen for each (one 'low' exposure caps the protein). mealCount === 0 means the window
  // is NOT logging-eligible — we can't claim a protein was "absent" when nothing was
  // logged, so such windows are excluded (this is the guard that stops the detector-②
  // logging-gap bug from reappearing on the control arm — Biostatistician, B-050).
  //
  // Free-fed standing exposures (B-040) are detected per window but DELIBERATELY NOT
  // merged into `exposures` (the discrete-meal exposure set). Two separate signals are
  // returned instead: `standingProteins` (named free-fed proteins in-window → excluded
  // from candidacy) and `standingInWindow` (ANY free-fed exposure in-window, incl. an
  // unidentified one → caps the tier). They are kept OUT of `exposures` so a standing
  // exposure can never add a discordant case-only pair for its own protein (the
  // boundary-manufacture bug); washout-by-exclusion replaces washout-by-injection. A
  // standing exposure also does NOT count toward mealCount — it tells us the free-fed
  // food was PRESENT, never that other foods were ABSENT, so it must not manufacture
  // logging-eligibility for an absence claim (the B-027/B-050 logging-gap guard).
  const windowExposures = (anchorMs: number, windowMs: number) => {
    const exposures = new Map<string, AttributionConfidence>()
    let mealCount = 0
    for (const m of meals) {
      if (m.ms > anchorMs) break // sorted ascending — nothing later precedes the anchor
      if (anchorMs - m.ms > windowMs) continue // earlier than the window
      mealCount++
      if (m.attribution === 'low' || !exposures.has(m.protein)) {
        exposures.set(m.protein, m.attribution)
      }
    }
    const windowStart = anchorMs - windowMs
    let standingInWindow = false
    const standingProteins = new Set<string>()
    for (const s of standing) {
      // Interval overlap of the standing active span [fromMs, untilMs) with the
      // exposure window [windowStart, anchorMs].
      if (s.fromMs <= anchorMs && windowStart < s.untilMs) {
        standingInWindow = true
        if (s.protein !== null) standingProteins.add(s.protein)
      }
    }
    return { exposures, mealCount, standingInWindow, standingProteins }
  }

  interface Candidate {
    protein: string
    symptomType: SymptomType
    windowHours: number
    matchedPairs: number
    caseExposed: number
    controlExposed: number
    b: number
    c: number
    attributionFloor: AttributionConfidence
    /**
     * A free-fed standing exposure was in-window for ≥1 of this symptom's matched
     * pairs (B-040). An uncontrolled standing exposure confounds the whole matched
     * set, so it caps the finding at Early regardless of this protein's own
     * attribution (§3 engine rule). Distinct from attributionFloor: that is about
     * whether THIS protein was attributable; this is about an uncontrolled OTHER
     * exposure being present at all.
     */
    standingConfounder: boolean
    symptomEventCount: number
  }
  const candidates: Candidate[] = []

  for (const symptomType of CORRELATION_SYMPTOM_TYPES) {
    const windowHours =
      config.correlationWindowHoursByType[symptomType] ?? config.correlationWindowHours
    const windowMs = windowHours * MS_PER_HOUR

    const rawMsList = input.symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    // Collapse re-logged bouts into distinct episodes; each episode is one "case".
    const onsets = toEpisodeOnsets(rawMsList, config.symptomEpisodeGapHours)
    if (onsets.length < cfg.earlyMinMatchedPairs) continue
    const symptomEventCount = onsets.length

    // Days carrying a symptom episode of this type are ineligible as control days.
    const symptomDays = new Set(onsets.map((o) => Math.floor(o / MS_PER_DAY)))
    const mealDays = Array.from(new Set(meals.map((m) => Math.floor(m.ms / MS_PER_DAY)))).sort(
      (a, b) => a - b,
    )

    // Build time-of-day-matched case/control pairs (1:1). Time-of-day matching is what
    // lets a daily staple wash out (present in both windows → concordant) instead of
    // manufacturing signal. 1:M conditional matching is a future refinement (B-049).
    const pairs: {
      caseExp: Map<string, AttributionConfidence>
      ctrlExp: Map<string, AttributionConfidence>
      /** A free-fed standing exposure was in the case OR control window (B-040 confounder). */
      standing: boolean
    }[] = []
    // Proteins under an active free-fed arrangement that was in-window for ≥1 matched
    // pair (case OR control) of this symptom. These are excluded from candidacy — a
    // free-fed food is background context, never a clean correlate on its own (§3).
    // Scoped to actual overlap: an ENDED arrangement whose span touches none of these
    // windows leaves its protein evaluable on the discrete data it WAS controlled for.
    const freeFedProteins = new Set<string>()
    for (const onset of onsets) {
      const caseWin = windowExposures(onset, windowMs)
      // Case window must be logging-eligible too — only compare windows where we know
      // what was (and wasn't) eaten.
      if (caseWin.mealCount === 0) continue
      const caseDay = Math.floor(onset / MS_PER_DAY)
      const timeOfDay = onset - caseDay * MS_PER_DAY

      let bestCtrl: {
        exposures: Map<string, AttributionConfidence>
        standingInWindow: boolean
        standingProteins: Set<string>
      } | null = null
      let bestDist = Infinity
      for (const d of mealDays) {
        if (d === caseDay || symptomDays.has(d)) continue
        const dist = Math.abs(d - caseDay)
        // The control window must NOT overlap the case window, or the same exposure leaks
        // into both and washes itself out. For a long (derm, 72h) window the adjacent day
        // is inside the case window, so the control has to sit ≥ windowHours away. (For a
        // 12h vomit window any different day already qualifies.)
        if (dist * MS_PER_DAY <= windowMs) continue
        if (dist >= bestDist) continue // never skips a strictly-closer day; ties → earliest
        const ctrlWin = windowExposures(d * MS_PER_DAY + timeOfDay, windowMs)
        if (ctrlWin.mealCount === 0) continue // control window not logging-eligible
        bestCtrl = ctrlWin
        bestDist = dist
      }
      if (!bestCtrl) continue // no eligible control → this case can't be matched
      for (const p of caseWin.standingProteins) freeFedProteins.add(p)
      for (const p of bestCtrl.standingProteins) freeFedProteins.add(p)
      pairs.push({
        caseExp: caseWin.exposures,
        ctrlExp: bestCtrl.exposures,
        standing: caseWin.standingInWindow || bestCtrl.standingInWindow,
      })
    }

    if (pairs.length < cfg.earlyMinMatchedPairs) continue

    // If a free-fed standing exposure sat in-window for ANY matched pair, the whole
    // matched set for this symptom is confounded → cap every candidate at Early
    // (§3 engine rule). One uncontrolled standing exposure is enough; we are
    // conservative-on-certainty, matching the rest of the engine.
    const standingConfounder = pairs.some((p) => p.standing)

    for (const protein of proteins) {
      // A free-fed protein is background context, never a clean correlate on its own
      // (§3) — exclude it so its active-window boundary cannot manufacture discordant
      // pairs (adversarial review, B-040 PR 4).
      if (freeFedProteins.has(protein)) continue
      let caseExposed = 0
      let controlExposed = 0
      let b = 0
      let c = 0
      let attributionFloor: AttributionConfidence = 'high'
      for (const p of pairs) {
        const inCase = p.caseExp.has(protein)
        const inCtrl = p.ctrlExp.has(protein)
        if (inCase) {
          caseExposed++
          if (p.caseExp.get(protein) === 'low') attributionFloor = 'low'
        }
        if (inCtrl) controlExposed++
        if (inCase && !inCtrl) b++
        else if (!inCase && inCtrl) c++
      }
      candidates.push({
        protein,
        symptomType,
        windowHours,
        matchedPairs: pairs.length,
        caseExposed,
        controlExposed,
        b,
        c,
        attributionFloor,
        standingConfounder,
        symptomEventCount,
      })
    }
  }

  if (candidates.length === 0) return []

  // Multiple-comparison correction: Bonferroni over the family of (protein × symptom)
  // pairs we evaluated — every protein with a built matched set counts (conservative).
  const correctedAlpha = cfg.familywiseAlpha / candidates.length

  const findings: CorrelationFinding[] = []
  for (const cand of candidates) {
    const { matchedPairs, caseExposed, controlExposed, b, c, attributionFloor, standingConfounder } =
      cand
    const riskDifference = caseExposed / matchedPairs - controlExposed / matchedPairs

    // Positive, case-direction enrichment only, with a coincidence guard on discordants.
    if (riskDifference < cfg.earlyMinRiskDifference) continue
    if (b < cfg.earlyMinDiscordantCaseOnly) continue
    if (b <= c) continue

    const pValue = mcNemarExactRightTail(b, c)

    // Established requires the higher sample floor AND corrected significance AND clean
    // attribution AND no uncontrolled standing exposure in-window. A 'low' (shared-bowl)
    // attribution OR a free-fed standing confounder (B-040) caps the finding at Early.
    const tier: EvidenceTier =
      attributionFloor === 'high' &&
      !standingConfounder &&
      matchedPairs >= cfg.establishedMinMatchedPairs &&
      pValue <= correctedAlpha
        ? 'established'
        : 'early'

    findings.push({
      type: 'food_symptom_correlation',
      priorityClass: 'insight',
      tier,
      symptomType: cand.symptomType,
      protein: cand.protein,
      matchedPairs,
      caseExposed,
      controlExposed,
      discordantCaseOnly: b,
      discordantControlOnly: c,
      riskDifference,
      pValue,
      correctedAlpha,
      symptomEventCount: cand.symptomEventCount,
      correlationWindowHours: cand.windowHours,
      attributionFloor,
      associationalOnly: true,
    })
  }

  return findings
}

// ── Detector ②: intake-decline calm safety flag ────────────────────────────

/** UTC calendar-date key (YYYY-MM-DD). Timezone-correct day boundaries are a caller concern. */
function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** A rated meal reduced to the fields the intake-decline / coverage logic needs. */
interface RatedMeal {
  ms: number
  score: number
  foodItemId: string | null
  foodLabel: string | null
}

/**
 * Rated meals only: 'meal'-type foods with a real intake rating, sorted ascending.
 * Treats/other and unrated rows are excluded so a logging gap can never masquerade
 * as a decline. Shared by detectIntakeDecline AND the B-053 rate_meals coverage
 * diagnostic so the "rated meal" definition (the line-710 coverage floor) has ONE
 * source and cannot drift.
 */
function classifyRatedMeals(mealEvents: MealEvent[]): RatedMeal[] {
  return mealEvents
    .filter((m) => m.foodType === 'meal' && m.intakeRating != null)
    .map((m) => ({
      ms: Date.parse(m.occurredAt),
      score: intakeScore(m.intakeRating as IntakeRating),
      foodItemId: m.foodItemId,
      foodLabel: m.foodLabel ?? null,
    }))
    .filter((m) => Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)
}

export function detectIntakeDecline(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): IntakeDeclineFinding[] {
  const cfg = config.intakeDecline
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []

  const ratedMeals = classifyRatedMeals(input.mealEvents)

  // Coverage floor: too few rated meals → SILENT. Silence is not an all-clear (§9);
  // the composition layer renders the building/stale state, never "intake is fine".
  // This line-710 discard is exactly what the B-053 rate_meals diagnostic explains
  // (rating more meals wakes this detector); see detectRateMeals.
  if (ratedMeals.length < cfg.minRatedMealsForBaseline) return []

  const baselineWindowStart = nowMs - cfg.baselineWindowDays * MS_PER_DAY
  const windowMeals = ratedMeals.filter((m) => m.ms >= baselineWindowStart)
  if (windowMeals.length < cfg.minRatedMealsForBaseline) return []

  const findings: IntakeDeclineFinding[] = []

  // ── Trigger A: consecutive recent days below baseline ──────────────────────
  // The baseline is the pet's established normal, so it must EXCLUDE the recent
  // days under scrutiny — otherwise a sharp drop dilutes its own baseline and the
  // decline hides itself. Baseline = rated meals older than the recent window.
  //
  // P0 feline sensitivity (Dr. Chen): a cat fires on a SINGLE below-baseline day
  // (the 48hr hepatic-lipidosis window), where a dog waits for 2 consecutive days.
  // The coverage floor and logging-gap guards below are UNCHANGED — we raise
  // sensitivity on the day count only, never by reading absent data as a decline.
  const isCat = input.pet.species === 'cat'
  const consecutiveDays = isCat ? cfg.cat.consecutiveDaysBelowBaseline : cfg.consecutiveDaysBelowBaseline
  const recentCutoffMs = nowMs - consecutiveDays * MS_PER_DAY
  const baselineMeals = windowMeals.filter((m) => m.ms < recentCutoffMs)

  if (baselineMeals.length >= cfg.minRatedMealsForBaseline) {
    const baselineScore =
      baselineMeals.reduce((sum, m) => sum + m.score, 0) / baselineMeals.length

    // Per-day means for the last N calendar days that actually have a rated meal.
    // A day with no rated meal is skipped, never treated as a decline — a logging
    // gap must not masquerade as anorexia (§9 / B-027 data caveat).
    const recentDays: { mean: number }[] = []
    for (let i = 0; i < consecutiveDays; i++) {
      const key = utcDateKey(nowMs - i * MS_PER_DAY)
      const dayMeals = windowMeals.filter((m) => utcDateKey(m.ms) === key)
      if (dayMeals.length === 0) continue
      const mean = dayMeals.reduce((sum, m) => sum + m.score, 0) / dayMeals.length
      recentDays.push({ mean })
    }

    if (recentDays.length >= consecutiveDays) {
      const allBelow = recentDays.every((d) => d.mean < baselineScore)
      const recentMean = recentDays.reduce((sum, d) => sum + d.mean, 0) / recentDays.length
      const material = baselineScore - recentMean >= cfg.minDeclineDelta
      // On the single-day (cat) path, also require the day to be genuinely low — not
      // merely one notch down (e.g. "all"→"most") — so we stay sensitive without crying
      // wolf. The multi-day path doesn't need this (a sustained dip is itself the signal).
      const meetsConcernFloor = consecutiveDays > 1 || recentMean <= cfg.cat.singleDayConcernCeiling
      if (allBelow && material && meetsConcernFloor) {
        findings.push({
          type: 'intake_decline',
          priorityClass: 'safety',
          trigger: 'consecutive_low',
          species: input.pet.species,
          baselineScore,
          recentScore: recentMean,
          daysBelowBaseline: recentDays.length,
          refusedFoodLabel: null,
          ratedMealsConsidered: baselineMeals.length,
        })
      }
    }
  }

  // ── Trigger B: refusal of a normally-eaten food ────────────────────────────
  // Per food: if it has a solid history of being eaten well and was just refused,
  // that is a clinically meaningful signal even when overall daily means look ok.
  const byFood = new Map<string, typeof windowMeals>()
  for (const m of windowMeals) {
    if (!m.foodItemId) continue
    const arr = byFood.get(m.foodItemId) ?? []
    arr.push(m)
    byFood.set(m.foodItemId, arr)
  }

  const refusalRecencyStart = nowMs - cfg.refusalRecencyDays * MS_PER_DAY
  let refusalFinding: IntakeDeclineFinding | null = null
  for (const [, meals] of byFood) {
    const sorted = [...meals].sort((x, y) => x.ms - y.ms)
    const latest = sorted[sorted.length - 1]
    if (latest.ms < refusalRecencyStart) continue
    if (latest.score > intakeScore('refused')) continue // only an outright refusal trips this

    const prior = sorted.slice(0, -1)
    if (prior.length < cfg.normallyEatenMinSamples) continue
    const priorMean = prior.reduce((sum, m) => sum + m.score, 0) / prior.length
    if (priorMean < cfg.normallyEatenScoreFloor) continue

    const candidate: IntakeDeclineFinding = {
      type: 'intake_decline',
      priorityClass: 'safety',
      trigger: 'refused_normal_food',
      species: input.pet.species,
      baselineScore: priorMean,
      recentScore: latest.score,
      daysBelowBaseline: 0,
      refusedFoodLabel: latest.foodLabel,
      ratedMealsConsidered: meals.length,
    }
    // Surface the most-eaten-then-refused food (largest drop) if several qualify.
    if (!refusalFinding || candidate.baselineScore > refusalFinding.baselineScore) {
      refusalFinding = candidate
    }
  }
  if (refusalFinding) findings.push(refusalFinding)

  return findings
}

// ── Detector ③: symptom-count reflection (B-051) ────────────────────────────
//
// The §7.1 rung-② "presence" layer. A purely DESCRIPTIVE count of symptom episodes
// this period vs last — "Nyx vomited 4 times this week, same as last." NO causal
// claim (that's rung ⑤ / detector ①), NO wellness claim (§9). Its whole job is to
// keep a data-rich pet from falling to the "keep logging" empty state when neither
// ① nor ② fired (the dogfooding case that opened B-051: a constant-staple diet
// washes ① out and steady intake keeps ② silent, yet the owner has logged heavily).
//
// Three guardrails, all enforced here and re-asserted by the phrasing layer:
//   (1) DIRECTION — render only for current ≤ prior (flat or falling). A rising
//       trend is SUPPRESSED, never reframed as a neutral reflection (Dr. Chen's
//       §7.1 amendment #5 — worsening is the safety lane's job, not ③'s).
//   (2) ABSENCE — never render on a zero current count; "no vomiting this week"
//       is reassurance-by-absence (§9), the exact thing the layer must not do.
//   (3) LOGGING-ELIGIBILITY — both windows must be actively logged, so a logging
//       gap can't read as "improving" (the recurring §9 / B-027 / B-050 trap).
//
// Surfaces at most ONE reflection (the symptom most present right now) so the
// Signal stays calm — never a wall of count cards.

export function detectReflections(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): ReflectionFinding[] {
  const cfg = config.reflection
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []

  const windowMs = cfg.windowDays * MS_PER_DAY
  const currentStart = nowMs - windowMs
  const priorStart = nowMs - 2 * windowMs

  // Logging-eligibility floor: distinct UTC days carrying ANY event the detector
  // can see (symptom or meal) in each window. A window that wasn't actively logged
  // at all cannot anchor an honest trend. NOTE: this is a coarse "was the app used"
  // floor only — it does NOT by itself prove symptoms were being tracked (an owner
  // can log meals but not symptoms). The symptom-DAY spread guard below is what
  // actually protects against a symptom-logging gap reading as flat/improving.
  const allEventMs = [
    ...input.symptomEvents.map((s) => Date.parse(s.occurredAt)),
    ...input.mealEvents.map((m) => Date.parse(m.occurredAt)),
  ].filter((ms) => Number.isFinite(ms))

  const loggingDays = (start: number, end: number): number => {
    const days = new Set<number>()
    for (const ms of allEventMs) {
      if (ms >= start && ms < end) days.add(Math.floor(ms / MS_PER_DAY))
    }
    return days.size
  }
  if (loggingDays(currentStart, nowMs) < cfg.minLoggingDaysPerWindow) return []
  if (loggingDays(priorStart, currentStart) < cfg.minLoggingDaysPerWindow) return []

  // Per symptom type: episode counts AND distinct symptom-DAYS in each window
  // (re-logs collapsed, consistent with detector ①). Tracking symptom-days as well
  // as episodes is what closes the meal-padding gap (adversarial review, B-051): a
  // prior week with one acute multi-bout day looks like the low-activity period it
  // was (1 symptom-day), so a spread-out current week reads as an INCREASE in days,
  // not a flat "same as last week".
  interface SymptomStat {
    symptomType: SymptomType
    currentCount: number
    priorCount: number
    currentDays: number
    priorDays: number
  }
  const stats: SymptomStat[] = []
  for (const symptomType of CORRELATION_SYMPTOM_TYPES) {
    const msList = input.symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    const onsets = toEpisodeOnsets(msList, config.symptomEpisodeGapHours)
    const cur = onsets.filter((ms) => ms >= currentStart && ms < nowMs)
    const pri = onsets.filter((ms) => ms >= priorStart && ms < currentStart)
    stats.push({
      symptomType,
      currentCount: cur.length,
      priorCount: pri.length,
      currentDays: new Set(cur.map((ms) => Math.floor(ms / MS_PER_DAY))).size,
      priorDays: new Set(pri.map((ms) => Math.floor(ms / MS_PER_DAY))).size,
    })
  }

  // GLOBAL worsening gate (the load-bearing clinical fix — adversarial review,
  // B-051 / Dr. Chen §7.1 amendment #5). A reflection must NEVER read as a calm
  // "improving" card while the pet is worsening on ANY axis — the per-symptom
  // direction guard alone is defeated across symptoms (rising vomit + falling itch
  // would surface a soothing "itch is down" card while the rising vomit is dropped).
  // So if ANY tracked symptom is MATERIALLY worsening — more episodes OR spread
  // across more days than last period — the WHOLE reflection layer stays silent and
  // yields to the safety lane (②/①) + per-incident analysis. The materiality floor
  // is deliberately LOWER than the render floor (sensitivity over specificity for
  // worsening, like detector ②): a single stray log won't blank the surface, but a
  // real repeated rise will. Absence (currentCount 0) is never "worsening".
  const anyWorsening = stats.some(
    (s) =>
      s.currentCount >= cfg.worseningMinEpisodes &&
      (s.currentCount > s.priorCount || s.currentDays > s.priorDays),
  )
  if (anyWorsening) return []

  // Candidates: flat-or-improving on BOTH episode count AND symptom-day spread, on a
  // real current count, with enough history in the busier window to state a trend.
  const candidates: ReflectionFinding[] = stats
    .filter(
      (s) =>
        s.currentCount >= 1 && // never a zero-symptom (absence) reflection (§9)
        s.currentCount <= s.priorCount && // flat or falling episode count
        s.currentDays <= s.priorDays && // flat or falling spread (closes the meal-padding gap)
        Math.max(s.currentCount, s.priorCount) >= cfg.minEpisodesEitherWindow,
    )
    .map((s) => ({
      type: 'reflection' as const,
      priorityClass: 'insight' as const,
      symptomType: s.symptomType,
      currentCount: s.currentCount,
      priorCount: s.priorCount,
      direction: (s.currentCount === s.priorCount ? 'flat' : 'improving') as ReflectionDirection,
      windowDays: cfg.windowDays,
    }))

  if (candidates.length === 0) return []

  // One reflection only — the symptom most present in the pet's life right now
  // (highest current count; tie → larger fall, then symptom-type order). Calm
  // surface over completeness.
  candidates.sort((a, b) => {
    if (b.currentCount !== a.currentCount) return b.currentCount - a.currentCount
    return b.priorCount - b.currentCount - (a.priorCount - a.currentCount)
  })
  return [candidates[0]]
}

// ── Coverage diagnostics (B-053) ────────────────────────────────────────────
//
// "Why is there still no signal?" — the structured, ranked subset of silent-
// detector reasons that are clinically SAFE to surface on the no_pattern surface.
// Direction resolved by the product team 2026-06-07 (docs/backlog.md B-053): the
// original five-reason corrective list was narrowed on Dr. Chen + Data Scientist
// review to TWO, with three reframed or suppressed:
//   • rate_meals (ACTION) — detector ② dormant for lack of rated meals; rating
//     a few wakes it. Reads from the line-710 floor (via classifyRatedMeals).
//   • staple_washout (EXPLANATION) — detector ① has no protein contrast because
//     one staple is in nearly every meal. Reads from the line-505 discard (via
//     classifyMeals). EXPLANATION ONLY (never a "vary the diet" ask — that
//     sabotages a vet-directed elimination trial) and FULLY SUPPRESSED on
//     diet-trial pets.
// Deliberately OUT of v1 (re-stated so a future self doesn't "restore" them
// without re-reading the clinical rationale in B-053):
//   • below-floor (too few symptom episodes, the line-551 discard) — overlaps the
//     building state and is reassurance-adjacent. Dropped.
//   • no-control-days (the line-595 discard) — a pet with no symptom-free days
//     belongs at the vet, not nudged with a logging tip. Suppressed (the safety
//     lane owns this case).
//   • add-protein / sparse protein data (the line-498 discard) — deferred to a
//     B-053 follow-up gated on B-052 write-time normalization.
// Same deterministic-engine + templated-copy split as findings; NO LLM in this
// loop (like reflections ③). Copy lives on the no_pattern surface (lib/signalCopy)
// because that surface is client-rendered; this module emits structure only.

/** Distinct symptom episodes across ALL correlation types (re-logs collapsed, like detector ①). */
function countSymptomEpisodes(symptomEvents: SymptomEvent[], config: DetectionConfig): number {
  let total = 0
  for (const symptomType of CORRELATION_SYMPTOM_TYPES) {
    const msList = symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    total += toEpisodeOnsets(msList, config.symptomEpisodeGapHours).length
  }
  return total
}

function detectRateMeals(
  input: DetectionInput,
  config: DetectionConfig,
): RateMealsDiagnostic | null {
  // Only meaningful when the owner IS logging meals — otherwise "rate a few meals"
  // is a non-sequitur (that's the building/empty case, not a coverage gap). We gate
  // on raw meal-type events, NOT rated ones, since the whole point is unrated meals.
  const mealsLogged = input.mealEvents.filter((m) => m.foodType === 'meal').length
  if (mealsLogged === 0) return null

  // The line-710 floor: too few RATED meals to establish an intake baseline → ②
  // stays silent. If the floor is already met, ②'s silence is NOT a coverage gap
  // (intake is simply steady) — no diagnostic. This is what gives a healthy,
  // well-rated pet (Nyx) staple_washout instead of a spurious rate-meals nudge.
  const ratedMeals = classifyRatedMeals(input.mealEvents).length
  const needed = config.intakeDecline.minRatedMealsForBaseline
  if (ratedMeals >= needed) return null

  return { type: 'rate_meals', actionability: 'action', ratedMeals, ratedMealsNeeded: needed }
}

function detectStapleWashout(
  input: DetectionInput,
  config: DetectionConfig,
): StapleWashoutDiagnostic | null {
  // FULLY SUPPRESSED on diet-trial pets: the constant staple IS the elimination
  // diet. Explaining "you feed chicken every meal, so we can't tell if it's linked"
  // implies the owner should vary it — sabotaging the trial and inverting Pets>$.
  if (input.pet.dietTrialActive) return null

  const meals = classifyMeals(input.mealEvents)
  const proteins = Array.from(new Set(meals.map((m) => m.protein)))
  // The line-505 discard, narrowed to the NAMABLE single staple: exactly one
  // protein. (0 proteins is the deferred sparse-protein case; ≥2 with a dominant
  // staple is a future refinement — v1 is the clean constant-staple case.)
  if (proteins.length !== 1) return null
  // "...eats X in nearly every meal" must be honest — needs real meal volume.
  if (meals.length < config.coverage.stapleMinMeals) return null

  // "...linked to the symptoms you're tracking" must be TRUE — there must be
  // symptoms to explain, or the copy falsely implies symptoms (reassurance-by-
  // implication). No symptoms → no diagnostic (falls back to the generic line).
  const symptomEpisodes = countSymptomEpisodes(input.symptomEvents, config)
  if (symptomEpisodes < config.coverage.stapleMinSymptomEpisodes) return null

  return { type: 'staple_washout', actionability: 'explanation', protein: proteins[0], symptomEpisodes }
}

// Rank by corrective leverage (B-053): the ACTION diagnostic (rate_meals — both
// actionable AND it activates detector ②) leads the EXPLANATION (staple_washout —
// no ask). The no_pattern surface shows the top one.
const COVERAGE_ACTIONABILITY_ORDER: Record<CoverageActionability, number> = {
  action: 0,
  explanation: 1,
}

export function rankCoverageDiagnostics(diagnostics: CoverageDiagnostic[]): CoverageDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      COVERAGE_ACTIONABILITY_ORDER[a.actionability] - COVERAGE_ACTIONABILITY_ORDER[b.actionability],
  )
}

/**
 * Coverage-diagnostic entry point — the "why no signal yet?" companion to
 * detectSignals. Returns the ranked, clinically-safe diagnostics (action before
 * explanation). The caller surfaces these ONLY on the no_pattern state (substantial
 * history, no finding cleared a floor); they are never an all-clear (§9).
 */
export function detectCoverage(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): CoverageDiagnostic[] {
  const diagnostics: CoverageDiagnostic[] = []
  const rateMeals = detectRateMeals(input, config)
  if (rateMeals) diagnostics.push(rateMeals)
  const staple = detectStapleWashout(input, config)
  if (staple) diagnostics.push(staple)
  return rankCoverageDiagnostics(diagnostics)
}

// ── Detector registry (§4) ──────────────────────────────────────────────────

export interface Detector {
  type: InsightType
  detect(input: DetectionInput, config: DetectionConfig): Finding[]
}

/**
 * Pluggable detector registry — the extensibility spine (§4). New insight types
 * (trend, preference, weight, …) register here; the engine and ranking need no
 * change. Order here does NOT determine output order — ranking does (§5).
 */
export const DETECTOR_REGISTRY: Detector[] = [
  { type: 'food_symptom_correlation', detect: detectCorrelations },
  { type: 'intake_decline', detect: detectIntakeDecline },
  { type: 'reflection', detect: detectReflections },
]

// ── Composition & ranking (§5) ──────────────────────────────────────────────

// Priority bands, lowest number ranks first.
//   0  safety / concern — always leads, always visible (§5.1)
//   1  context-lead insight for this pet (§5.2, §8)
//   2  remaining qualifying insights (§5.3)
//   3  reflection (③, B-051) — the gentlest "presence" layer; ALWAYS below every
//      safety finding AND below every correlation, never the lead of a data-rich
//      pet that has a real correlation to show.
function priorityBand(finding: Finding, ctx: PetContext): number {
  if (finding.priorityClass === 'safety') return 0
  if (finding.type === 'reflection') return 3
  // Correlation is the context-lead insight for a diet-trial pet (Jordan's stack, §8).
  if (finding.type === 'food_symptom_correlation' && ctx.dietTrialActive) return 1
  return 2
}

const TIER_ORDER: Record<EvidenceTier, number> = { established: 0, early: 1 }

/**
 * Orders findings per §5: safety first, then the context-lead insight, then the
 * rest by evidence tier (Established before Early) and effect strength. Returns
 * findings tagged with their resolved rank.
 */
export function rankFindings(findings: Finding[], ctx: PetContext): RankedFinding[] {
  const sorted = [...findings].sort((x, y) => {
    const bandDiff = priorityBand(x, ctx) - priorityBand(y, ctx)
    if (bandDiff !== 0) return bandDiff

    // Within correlations, Established outranks Early, then stronger association.
    if (x.type === 'food_symptom_correlation' && y.type === 'food_symptom_correlation') {
      const tierDiff = TIER_ORDER[x.tier] - TIER_ORDER[y.tier]
      if (tierDiff !== 0) return tierDiff
      if (y.riskDifference !== x.riskDifference) return y.riskDifference - x.riskDifference
      return x.pValue - y.pValue
    }

    // Among safety findings, an outright refusal of a normally-eaten food leads.
    if (x.type === 'intake_decline' && y.type === 'intake_decline') {
      const order: Record<IntakeDeclineTrigger, number> = {
        refused_normal_food: 0,
        consecutive_low: 1,
      }
      return order[x.trigger] - order[y.trigger]
    }

    return 0
  })

  return sorted.map((finding, i) => ({ finding, rank: i }))
}

/**
 * Top-level entry point. Runs every registered detector, composes and ranks the
 * results (§5). An empty array means no finding cleared its floor — the caller
 * renders the building/stale state (§3.3); it is NOT an all-clear (§9).
 */
export function detectSignals(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): RankedFinding[] {
  const findings: Finding[] = []
  for (const detector of DETECTOR_REGISTRY) {
    findings.push(...detector.detect(input, config))
  }
  return rankFindings(findings, input.pet)
}
