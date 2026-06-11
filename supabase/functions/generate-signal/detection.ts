// AI Signal — deterministic detection engine (B-045, Step 1).
//
// This is the "deterministic detection" half of the architecture decided in
// docs/nyx-ai-signal-requirements.md §2 (Option B: deterministic detection +
// LLM phrasing). It is a PURE module: it takes already-fetched, plain-shaped
// data and returns typed, ranked candidate findings. It performs no I/O, no DB
// access, and NO LLM call — the model (Step 2) only renders an already-true
// finding into a sentence; it never decides whether a pattern exists.
//
// Detectors live here (§4). Five today (①–④ + ⑤):
//   ① food/protein → symptom correlation  (the flagship wedge insight)
//   ② intake-decline calm safety flag      (MANDATORY never-reassure net)
//   ③ symptom-count reflection             (B-051 — the §7.1 rung-② "presence"
//      layer: "Nyx vomited 4 times this week — same as last." Counts/streaks,
//      NO causal claim. Renders only for a FLAT or IMPROVING (falling) trend; a
//      worsening trend is suppressed — never normalized as a neutral reflection
//      — and a zero-symptom week is never surfaced (absence ≠ wellness, §9).)
//   ④ symptom-frequency worsening          (the deterministic worsening lane — the
//      SAFETY-class counterpart to ③. ③'s worsening gate suppresses a rising trend
//      and, until now, nothing fired in its place — a one-way valve into silence
//      that opened exactly when the pet was getting worse (2026-06 re-run brief §3,
//      §6.1, observed live 2026-06-10). ④ OWNS that suppressed case: it fires on the
//      EXACT predicate ③'s gate suppresses on (shared `isWorsening`, so the valve is
//      provably closed — they can never drift), as a never-reassure safety finding.
//      Descriptive frequency only, NO causal claim (that's ①/⑤). Copy urgency tiers
//      on current-week symptom-DAY density, not raw count. Template-only phrasing,
//      like ③. By §7.1 amendment #5 — "direction determines the rung" — symptom
//      worsening is the front edge of a safety flag, the symptom-axis mirror of the
//      declining-intake routing detector ② already does for the intake axis.)
//   ⑤ postprandial timing                   (B-078 — the deterministic DESCRIPTIVE lane,
//      Phase 1. A count of how many timed vomiting episodes happened ≤30 min after eating,
//      over an explicit eligible denominator. Pure observed facts: witnessed onset +
//      nearest-preceding feeding minutes; no model. ASSOCIATIONAL/anamnesis only — names
//      timing, never a food/cause/mechanism (§9.1/§9.2). Template-only phrasing, like ③/④.
//      Three load-bearing gates: witnessed-confidence (B-010), free-feeding exclusion
//      (B-040), and the grazing guard — see detectPostprandialTiming.)
//   ⑥ time-of-day clustering                 (B-079 — the descriptive lane Phase 2. A count
//      of how many witnessed vomiting episodes fall in one band of the pet's LOCAL day
//      (e.g. "5 of 8 between 4 and 8 in the morning" — the classic empty-stomach early-AM
//      case). Deterministic sliding-window scan over local hour-of-day; the only new input
//      is DetectionInput.timezone (IANA, from user_profiles) — absent/invalid ⇒ SILENT,
//      never guess UTC (§4.2). ASSOCIATIONAL only — names a clock band, never a cause or a
//      mechanism word ('bilious'/'empty stomach' — §4.5). Template-only phrasing, like ③/④/⑤.
//      MUTUALLY EXCLUSIVE with ⑤, ⑤ wins (§4.4): a schedule-fed post-prandial vomiter
//      clusters by clock trivially, so ⑤'s firing suppresses ⑥ for that symptom in the
//      composition layer — see suppressTimeOfDayWhenPostprandial.)
//
// All honour the §6/§7 evidence-tier floors and the clinical guardrails in
// §9 and CLAUDE.md (associational-only correlation copy; intake decline routed as
// calm concern, never softened to "picky", never reassuring, and silent — not
// a false flag and not an all-clear — when intake-rating coverage is thin; a
// reflection is descriptive only, never reassures, and ranks below every safety
// finding; worsening is descriptive frequency, never causal, never reassures, and
// leads as a safety finding below intake-decline).
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

/**
 * How confident we are about WHEN an event actually occurred (B-010, migration #45).
 * 'witnessed' = the owner saw it happen (a real, precise instant). 'estimated'/'window'
 * = a discovered event whose time is a guess or a range — the stored `occurred_at` is the
 * LATEST edge of that range, never an observation. Legacy/absent = NULL = unknown (no
 * blanket backfill, per the B-010 resolution). This axis is load-bearing for the
 * descriptive-timing lane (B-078/B-079): a "12 minutes after eating" claim is only honest
 * for a witnessed onset — a discovered vomit can never be timed against a meal.
 */
export type OccurredAtConfidence = 'witnessed' | 'estimated' | 'window'

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
  /**
   * B-010 timestamp confidence (B-078). Absent/null ⇒ today's behavior is unchanged
   * (detectors ①–④ ignore this field). The descriptive-timing lane (⑤/⑥) treats only a
   * 'witnessed' onset as timed-eligible — `estimated`/`window`/NULL are excluded, since a
   * windowed `occurred_at` is the latest EDGE, not an observation.
   */
  occurredAtConfidence?: OccurredAtConfidence | null
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
  /**
   * B-010 timestamp confidence (B-078). A feeding is timed-eligible when its confidence
   * is 'witnessed' OR null/absent: meals are inherently witnessed and every entry point
   * now writes 'witnessed' (lib/meals.ts); legacy NULL meal rows carry the same semantics
   * (mirrors the `attributionConfidence` absent→'high' precedent). 'estimated'/'window'
   * are excluded from the descriptive-timing lane. Absent ⇒ today's behavior unchanged.
   */
  occurredAtConfidence?: OccurredAtConfidence | null
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
  /**
   * Pet owner's IANA timezone (e.g. 'America/New_York'), from user_profiles.timezone —
   * Phase 2 (⑥ time-of-day clustering) ONLY. Timestamps are stored UTC; "4–7am" only means
   * something in the pet's local day, so ⑥ converts onset instants to local hour-of-day with
   * this zone. ABSENT/invalid ⇒ ⑥ is silent (never guess UTC — §4.2). Detectors ①–⑤ ignore
   * it, so omitting it is byte-identical to today's behavior.
   */
  timezone?: string
  /** Reference "now" (ISO-8601 UTC), injected so detection is deterministic and testable. */
  now: string
}

// ── Finding types (§4/§5) ───────────────────────────────────────────────────

export type InsightType =
  | 'food_symptom_correlation'
  | 'intake_decline'
  | 'reflection'
  | 'symptom_worsening'
  | 'postprandial_timing'
  | 'timeofday_clustering'

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

/** Which arm of the worsening predicate fired — drives copy (§ B-045 / detector ④). */
export type WorseningTrigger = 'more_episodes' | 'more_days'

/**
 * Copy-urgency tier for a worsening finding (decided B-reshaped, PM 2026-06-11).
 * Urgency rides current-week symptom-DAY DENSITY, not raw episode count or the
 * (noisy, small-N) week-over-week delta — "vomiting on most days this week" is a
 * clinically defensible escalation marker on its own, and is stable under the
 * episode/day-collapsing the engine already does. The week-over-week rise gates
 * WHETHER we speak (isWorsening); density gates HOW firmly:
 *   - 'firm'     — current window is dense (≥ worseningDenseDayFloor symptom-days):
 *                  "...on N of the last 7 days — worth booking a vet visit soon."
 *   - 'standard' — an episode-count rise, not dense: "...up from M last week — worth
 *                  a word with your vet."
 *   - 'soft'     — the more_days-only arm (same episode count, more spread), not
 *                  dense: the gentlest "...worth keeping an eye on..." register.
 * The tier is resolved in the deterministic engine (where it is adversarially
 * reviewed), NOT in phrasing — copy only renders the already-decided tier.
 */
export type WorseningTier = 'firm' | 'standard' | 'soft'

/**
 * Symptom-frequency worsening (④) — the SAFETY-class owner of the case ③'s worsening
 * gate suppresses. Purely DESCRIPTIVE frequency (episode/day counts this period vs
 * last), with NO causal claim (that is ①/⑤) and NO severity verdict — it never says
 * the pet is "worse", only that the symptom is happening more often / on more days.
 * NEVER reassures (it is a safety finding); its ABSENCE is silence, not wellness.
 * Fires on the EXACT predicate detectReflections suppresses on (shared `isWorsening`),
 * so the valve between "③ goes silent" and "④ speaks" is closed by construction.
 */
export interface SymptomWorseningFinding extends FindingBase {
  type: 'symptom_worsening'
  priorityClass: 'safety'
  symptomType: SymptomType
  /** Distinct symptom episodes (re-logs collapsed) in the current window. ≥ worseningMinEpisodes. */
  currentCount: number
  /** Distinct symptom episodes in the prior window. May be 0 (a rise from a logged zero). */
  priorCount: number
  /** Distinct symptom-DAYS in the current window (density signal; re-logs on one day = 1 day). */
  currentDays: number
  /** Distinct symptom-DAYS in the prior window. */
  priorDays: number
  /** 'more_episodes' = the count rose; 'more_days' = same count, spread over more days. */
  trigger: WorseningTrigger
  /** Resolved copy-urgency tier (density-anchored — see WorseningTier). */
  tier: WorseningTier
  /** Length of each comparison window, in days (7 = week-over-week). */
  windowDays: number
}

/**
 * Rapid post-prandial timing (⑤, B-078 — descriptive lane Phase 1). A purely
 * DESCRIPTIVE count: of the vomiting episodes we could TIME (witnessed onset, a
 * timed-eligible feeding logged in the preceding window, not under a free-fed bowl),
 * how many happened within `rapidWindowMinutes` of eating. ASSOCIATIONAL ONLY — there
 * is deliberately no causal field, and the OWNER-FACING claim names timing only, never
 * a food/protein/form (PM-RATIFIED §9.1: forms ride `feedingFormsInEvidence` for the
 * tap-to-expand evidence + the Step-9 vet report, never the card). The claim's clinical
 * rationale is ANAMNESIS — "a timing pattern the vet will want to know" — never mechanism
 * (§9.2 / Clinician's Brief: timing is NOT a regurgitation-vs-vomiting differentiator);
 * copy implying 'regurgitation'/'eating speed' is a validatePhrasing failure. Never
 * inverted: a below-floor result is SILENCE, never "episodes don't seem meal-related"
 * (§3.5). `rapidWindowMinutes` is a descriptive BUCKET (no clinical cutoff exists), so the
 * payload always carries `medianMinutesSinceFeeding` — the actual observed timings, for
 * the evidence expansion and the vet report.
 */
export interface PostprandialTimingFinding extends FindingBase {
  type: 'postprandial_timing'
  priorityClass: 'insight'
  symptomType: SymptomType
  /** Eligible episodes whose nearest preceding timed-eligible feeding was ≤ rapidWindowMinutes before onset. */
  rapidCount: number
  /** The honest denominator: timed-eligible episodes (witnessed, not free-fed, with a feeding in the preceding window). */
  eligibleCount: number
  /** All in-window vomit episodes (any confidence) — so evidence can say "of N total, M could be timed". */
  totalEpisodes: number
  /** The descriptive timing bucket actually applied (default 30; science-anchored, §9.2). */
  rapidWindowMinutes: number
  /** The two most-recent eligible episodes are BOTH rapid — powers "including the last two" recency salience. */
  lastTwoEligibleRapid: boolean
  /** Median minutes-since-feeding across the rapid episodes — the actual observed timing (evidence + vet report). */
  medianMinutesSinceFeeding: number
  /** Forms of the feedings before the rapid episodes (e.g. ['dry treat']) — EVIDENCE/vet-report ONLY, never the claim (§9.1). */
  feedingFormsInEvidence: string[]
  /** Hard marker for the phrasing layer + reviewers: timing/association only, never causal, never mechanism. */
  associationalOnly: true
  /** The analysis window in days (bounds the denominator to the current era of the pet's life). */
  windowDays: number
}

/**
 * Time-of-day clustering (⑥, B-079 — descriptive lane Phase 2). A purely DESCRIPTIVE
 * count: of the witnessed vomiting episodes we can place on the clock, how many fall in
 * one `clusterWindowHours` band of the pet's LOCAL day. No model — each onset's local
 * hour-of-day is an observed fact (converted from the stored UTC instant via the pet's
 * IANA timezone), and the aggregate is a count over an explicit witnessed denominator.
 * ASSOCIATIONAL ONLY: there is deliberately no causal field, and the claim names a CLOCK
 * BAND only — never a mechanism ('bilious'/'empty stomach' is the vet's inference, not the
 * card's — §4.5). Its clinical value is the NOT-meal-adjacent case (early-morning
 * empty-stomach vomiting → a feeding-schedule conversation), which is exactly why ⑤
 * (post-prandial) suppresses it when ⑤ fires for the same symptom (§4.4 — a
 * schedule-fed post-prandial vomiter clusters by clock trivially). Never inverted: a
 * below-floor result is SILENCE, never "no particular time of day".
 *
 * Local time is the WHOLE point and a new dependency: timestamps are stored UTC (hard
 * constraint), and "4–7am" only means something in the pet's local day. An absent or
 * invalid timezone ⇒ the detector is SILENT (never guess UTC — §4.2). DST is absorbed by
 * per-instant conversion (Intl.DateTimeFormat), so two same-local-hour onsets on opposite
 * sides of a clock change bucket together.
 */
export interface TimeOfDayClusteringFinding extends FindingBase {
  type: 'timeofday_clustering'
  priorityClass: 'insight'
  symptomType: SymptomType
  /** Local hour-of-day (0–23, pet-local) the winning cluster window STARTS at. */
  clusterStartLocalHour: number
  /** Width of the cluster window in hours (the band is [start, start + width) on the clock). */
  clusterWindowHours: number
  /** Episodes whose local hour falls in the winning band — the numerator. */
  clusterCount: number
  /** The honest denominator: witnessed, in-window episodes we could place on the clock. */
  eligibleCount: number
  /** All in-window vomit episodes (any confidence) — so evidence can say "of N total, M timeable". */
  totalEpisodes: number
  /** The IANA zone the local-hour conversion was computed in (carried for the vet report). */
  timezone: string
  /** Hard marker for the phrasing layer + reviewers: timing/association only, never causal. */
  associationalOnly: true
  /** The analysis window in days (bounds the denominator to the current era of the pet's life). */
  windowDays: number
}

export type Finding =
  | CorrelationFinding
  | IntakeDeclineFinding
  | ReflectionFinding
  | SymptomWorseningFinding
  | PostprandialTimingFinding
  | TimeOfDayClusteringFinding

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

/**
 * Coverage diagnostics. `rate_meals` / `staple_washout` are the B-053 v1 pair;
 * `meal_type_collapse` / `diet_churn` are the B-080 diet-structure pair (descriptive
 * lane Phase 3, placed in the coverage lane per the §9.3 PM decision — they describe
 * the owner's feeding/logging STRUCTURE, which is honestly framed as "here's why
 * there's no signal yet", never a pet-state verdict). `add_protein` / below-floor /
 * no-control-days remain deliberately out (see detectCoverage).
 */
export type CoverageDiagnosticType =
  | 'rate_meals'
  | 'staple_washout'
  | 'meal_type_collapse'
  | 'diet_churn'

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

/**
 * Diet-structure observation (a): on most recent days only treats were logged, no
 * meals (B-080, spec §5.2a). A descriptive count of the owner's LOGGED diet shape —
 * never a judgment, never a wellness claim. Dark days (no logging at all) are NOT
 * gap days (the ④ fake-rise guard's sibling: "didn't log" must never masquerade as
 * "fed only treats"). EXPLANATION ONLY and FULLY SUPPRESSED on diet-trial pets (the
 * trial dictates the diet's structure — same rationale as staple_washout). The copy
 * (lib/signalCopy) carries the non-negotiable log-only acknowledgement ("if that's
 * the full picture") — the engine sees only the log and must not imply it knows what
 * was eaten (Dr. Chen + Trust, §5.1).
 */
export interface MealTypeCollapseDiagnostic extends CoverageDiagnosticBase {
  type: 'meal_type_collapse'
  actionability: 'explanation'
  /** Days in-window with ≥minTreatsPerGapDay treats AND zero meals (the numerator). */
  gapDays: number
  /** Honest denominator context: days in-window with ANY logged feeding (NOT the window size). */
  loggedDays: number
  /** Median treats/day across the gap days — evidence/vet-report detail, not the claim. */
  treatsPerDayMedian: number
  /** The fixed observation window (days) the claim is stated over ("N of the last W days"). */
  windowDays: number
}

/**
 * Diet-structure observation (b): several brand-new foods appeared while symptoms are
 * active (B-080, spec §5.2b — the productization of brief §6.5). The owner's most
 * natural sick-pet response (try new foods) structurally reduces what the engine can
 * ever conclude, and nothing else in the product says so. A coverage observation, not
 * a finding: it explains REDUCED ENGINE POWER. EXPLANATION ONLY; FULLY SUPPRESSED on
 * diet-trial pets (a vet-directed novel-protein switch IS new food — the card must
 * never contradict a vet's elimination trial). Requires active symptoms in-window
 * (without them "hold the diet steady" is unsolicited diet advice).
 */
export interface DietChurnDiagnostic extends CoverageDiagnosticBase {
  type: 'diet_churn'
  actionability: 'explanation'
  /** Distinct food_item_ids whose FIRST-EVER appearance (in available history) falls in-window. */
  novelFoodCount: number
  /** Distinct symptom episodes (any correlation type, re-logs collapsed) in the same window. */
  symptomEpisodesInWindow: number
  /** The churn observation window (days). */
  windowDays: number
}

export type CoverageDiagnostic =
  | RateMealsDiagnostic
  | StapleWashoutDiagnostic
  | MealTypeCollapseDiagnostic
  | DietChurnDiagnostic

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
     *
     * SHARED with detector ④ (the worsening lane) via `isWorsening`: this is the single
     * trigger floor for BOTH ③'s suppression AND ④'s firing, so the valve cannot drift.
     */
    worseningMinEpisodes: number
    /**
     * Detector ④ copy-urgency density floor: a worsening finding whose current window
     * carries at least this many distinct symptom-DAYS gets the 'firm' ("book a vet
     * visit soon") register; below it, the count-rise arm is 'standard' and the
     * spread-only arm is 'soft'. Density (symptom-days), not raw episode count, anchors
     * urgency — "vomiting on most days this week" is a defensible escalation marker and
     * is stable under episode/day collapsing. Default 4 of a 7-day window = "more days
     * than not". Tune on real data, not a re-decision.
     */
    worseningDenseDayFloor: number
  }
  postprandial: {
    /** §3.3: minimum rapid episodes before a pattern is worth stating (2 is an anecdote). */
    minRapidEpisodes: number
    /**
     * Minimum timed-eligible episodes (the DENOMINATOR) before "N of M" is a real
     * fraction (adversarial-review fix, B-078 / B-081). The grazing guard scales
     * `expectedRapid` with `eligibleCount`, so at a tiny denominator it collapses to the
     * `minRapidEpisodes` floor and a grazer whose few witnessed vomits all land near a
     * graze fires on a ~7% base-rate coincidence (the reviewer's break). This floor
     * suppresses those smallest-N cases; the residual above it is an accepted, tuned-on-
     * real-data limitation (PM 2026-06-11; the golden "4 of 12" is itself only a ~6%
     * pattern, so the guard cannot separate it from a same-strength grazer — §3.3). Set to
     * 6 to match detector ⑥'s `minEligibleEpisodes` ("below this any cluster is a coin run").
     */
    minEligibleEpisodes: number
    /** §3.3: minimum rapid/eligible fraction — a few rapid out of many timed is noise. */
    minRapidFraction: number
    /** §3.3: ≥1 rapid episode must fall within this many days, so a stale cluster doesn't lead. */
    recencyDays: number
    /**
     * §3.3 — the GRAZING GUARD ratio. A frequently-fed pet is "within 30 min of eating"
     * much of the day by chance; observed rapid must clear this multiple of the
     * chance-expected rapid count (expectedRapid = eligible × min(1, feedingRate ×
     * rapidWindowMinutes / 1440)) before the detector fires. Calibrated so an ~8-feeding/day
     * pet fires at the bar and a 20-treat/day grazer cannot trip it by base rate.
     */
    minObservedToExpectedRatio: number
    /**
     * §3.3 / §9.2 — the rapid bucket, in minutes. SCIENCE-ANCHORED not data-anchored (PM
     * directive): no canonical clinical cutoff exists, so 30 operationalizes the literature's
     * "soon/shortly after eating" band (minutes to ~1h); it is a descriptive bucket, which is
     * why the payload always carries the actual median minutes.
     */
    rapidWindowMinutes: number
    /** §3.2: a feeding must fall within this many hours before onset for "time since feeding" to be defined. */
    feedingLookbackHours: number
    /** §3.3: analysis window in days, bounding the denominator to the current era. */
    windowDays: number
  }
  timeofday: {
    /** §4.3: below this many witnessed/timeable episodes, any "cluster" is a coin run. Matches ⑤. */
    minEligibleEpisodes: number
    /** §4.3: the winning band itself needs real mass — fewer than this is not a cluster. */
    minClusterEpisodes: number
    /**
     * §4.3: minimum fraction of eligible episodes in the winning band. 0.5 of a 4h window ≈
     * 3× the 16.7% uniform base rate — the chance guard. The 24 sliding window positions are
     * an implicit multiple-comparison, so this floor is deliberately conservative (and the
     * §7 property test is a REQUIRED part of the build, not optional).
     */
    minClusterFraction: number
    /**
     * §4.3: width of the sliding cluster window, in hours. Wide enough to be robust to ±1h
     * logging slop, narrow enough that "this band" still means something. The scan slides it
     * around the 24h clock in 1h steps (24 wrap-around positions) and takes the max-count band.
     */
    clusterWindowHours: number
    /** §4.3: analysis window in days, bounding the denominator to the current era (same as ⑤). */
    windowDays: number
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
  // B-080 diet-structure observations (§5.2). Counts over LOGGED feedings only; the
  // copy carries the log-only caveat. Tune on real data, not a re-decision.
  dietStructure: {
    /** (a) collapse: the fixed observation window, in days ("N of the last W days"). */
    collapseWindowDays: number
    /** (a) collapse: a gap day needs at least this many treat-type feedings (so a single stray treat isn't a "treats-only day"). */
    minTreatsPerGapDay: number
    /** (a) collapse: fire at ≥ this many gap days in-window. */
    minGapDays: number
    /**
     * (a) collapse: classification floor — at least this fraction of in-window feedings must carry
     * a non-null foodType, else the meal/treat split itself is unreliable and the count is fiction
     * (composes with B-070's treats-vs-meals modeling).
     */
    minClassifiedFraction: number
    /** (b) churn: the observation window, in days. */
    churnWindowDays: number
    /** (b) churn: fire at ≥ this many first-ever food appearances in-window. */
    minNovelFoods: number
    /** (b) churn: require at least this many symptom episodes in-window (else it's unsolicited diet advice). */
    minSymptomEpisodes: number
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
    // B-reshaped (PM 2026-06-11): firm "book a vet visit soon" copy when the current
    // week shows symptoms on ≥4 of 7 days. Anchored to density, not a raw count cutoff,
    // so the one new escalation boundary is clinically defensible (see WorseningTier).
    worseningDenseDayFloor: 4,
  },
  // B-078 detector ⑤ (postprandial timing) floors. The window is science-anchored
  // (§9.2: no canonical clinical cutoff; 30 min operationalizes the literature's
  // "soon after eating" band), NOT tuned to the dogfood cat's observed ≤15-min episodes.
  // The grazing-guard ratio is the load-bearing piece: observed rapid must clear 2× the
  // chance-expected count, so a frequently-fed pet can't trip the detector by base rate.
  // Tune on real data, not a re-decision (parent-doc §7 / decision (b)).
  postprandial: {
    minRapidEpisodes: 3,
    minEligibleEpisodes: 6,
    minRapidFraction: 0.25,
    recencyDays: 14,
    minObservedToExpectedRatio: 2,
    rapidWindowMinutes: 30,
    feedingLookbackHours: 24,
    windowDays: 60,
  },
  // B-079 detector ⑥ (time-of-day clustering) floors (§4.3).
  //
  // CALIBRATION NOTE (B-079 build, flagged for PM ratification of the §4.3 doc table): the
  // §4.3 listed defaults (minClusterEpisodes 4, minClusterFraction 0.5) FAIL the §7 property
  // test that the same section mandates as a "required, not optional" build gate — on
  // uniform-random onsets (n=6..10) they fire at ~21.6%, not ≪5%. §4.3 itself names the
  // cause: "the 24 window positions are an implicit multiple-comparison" — the naive
  // "3× the 16.7% base rate" reasoning ignores the scan over 24 overlapping windows. The
  // property test is the binding acceptance check, so the floors are calibrated UP to pass
  // it while preserving the §4.1 / §7 golden ("5 of 8" = fraction 0.625): minClusterEpisodes
  // 5 + minClusterFraction 0.6 → measured ~3.3% uniform-random fire rate (deno sweep, 20k
  // trials). The change is conservative (errs toward silence — the safe direction for a
  // never-reassure descriptive insight) and is the spec-sanctioned lever (§7 / tier-2 footer:
  // tune the config defaults). Proposed §4.3 doc edit flagged in the session summary.
  //
  // ACCEPTED RESIDUAL (B-079 adversarial review, B-083): the ~3.3% is the POOLED n=6..10 rate;
  // the n=8 slice ALONE fires at ~7.4% on uniform-random onsets, because "5 of 8" (the exact
  // §4.1/§7 golden, fraction 0.625) is the combinatorial sweet spot that clears both floors.
  // This residual is INTRINSIC and cannot be tuned out without raising minClusterFraction above
  // 0.625, which would kill the very golden the detector exists to fire — the same accepted
  // tension as ⑤'s grazing guard (B-081). It is accepted for v1 because the card is descriptive
  // ("worth mentioning to your vet"), never reassures, and never claims a cause — its worst case
  // is a mildly-noisy clock card routed to a vet, never a false all-clear. The §7 property test
  // makes the per-n=8 rate VISIBLE (asserts it, not just the pooled rate) so it is tracked, not
  // hidden. Tune on real data per B-047/B-083, not a re-decision.
  timeofday: {
    minEligibleEpisodes: 6,
    minClusterEpisodes: 5,
    minClusterFraction: 0.6,
    clusterWindowHours: 4,
    windowDays: 60,
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
  // B-080 diet-structure floors (§5.2). collapse: 5 treats-only days out of the last
  // 10, ≥2 treats/gap-day, ≥80% of feedings classified. churn: 3 brand-new foods +
  // ≥2 symptom episodes within 14 days. Conservative by design — these describe owner
  // behavior, so they err toward silence. Tune on real data, not a re-decision.
  dietStructure: {
    collapseWindowDays: 10,
    minTreatsPerGapDay: 2,
    minGapDays: 5,
    minClassifiedFraction: 0.8,
    churnWindowDays: 14,
    minNovelFoods: 3,
    minSymptomEpisodes: 2,
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

/**
 * Per-symptom episode AND symptom-DAY counts for the current vs prior window —
 * the shared substrate of BOTH detector ③ (reflection) and detector ④ (worsening).
 * Tracking symptom-DAYS as well as episodes closes the meal-padding gap (adversarial
 * review, B-051): a prior week with one acute multi-bout day was a single low-activity
 * symptom-day, so a spread-out current week reads as an INCREASE in days, not "same".
 */
interface SymptomStat {
  symptomType: SymptomType
  currentCount: number
  priorCount: number
  currentDays: number
  priorDays: number
}

interface WindowedStats {
  stats: SymptomStat[]
  /** Both windows clear minLoggingDaysPerWindow — the coarse "was the app used" floor. */
  loggingEligible: boolean
}

/**
 * Compute the week-over-week per-symptom stats + logging-eligibility used by ③ and ④.
 * ONE source for the windowing and the logging floor, so the reflection gate and the
 * worsening detector can never disagree about which window an event falls in or whether
 * a window was logged. Returns null only when `now` is unparseable.
 *
 * Logging-eligibility is the coarse "distinct UTC days carrying ANY event (symptom or
 * meal) in each window" floor. NOTE: it does NOT by itself prove symptoms were being
 * tracked (an owner can log meals but not symptoms). For ③ the symptom-DAY spread guard
 * is the real protection against a symptom-logging gap reading as "improving"; for ④ a
 * prior symptom-logging gap can only INFLATE an apparent rise — i.e. it errs toward
 * escalation, the safe direction under §9 (a false vet nudge, never a false all-clear),
 * so this same coarse floor is sufficient there (it just blocks a rise manufactured from
 * a wholly-dark prior week).
 */
function computeWindowedStats(input: DetectionInput, config: DetectionConfig): WindowedStats | null {
  const cfg = config.reflection
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null

  const windowMs = cfg.windowDays * MS_PER_DAY
  const currentStart = nowMs - windowMs
  const priorStart = nowMs - 2 * windowMs

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
  const loggingEligible =
    loggingDays(currentStart, nowMs) >= cfg.minLoggingDaysPerWindow &&
    loggingDays(priorStart, currentStart) >= cfg.minLoggingDaysPerWindow

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
  return { stats, loggingEligible }
}

/**
 * The single worsening predicate (the load-bearing clinical fix — adversarial review,
 * B-051 / Dr. Chen §7.1 amendment #5). A symptom is materially worsening when it has at
 * least `worseningMinEpisodes` current-window episodes AND is rising — more episodes OR
 * spread across more days than the prior window. The materiality floor is deliberately
 * LOWER than the reflection render floor (sensitivity over specificity for worsening,
 * like detector ②): a lone single log (count 1) never trips it, but a real repeated rise
 * does. Absence (currentCount 0) is never "worsening".
 *
 * THIS IS THE VALVE. Detector ③ SUPPRESSES when any symptom satisfies it; detector ④
 * FIRES on exactly the symptoms that satisfy it. One predicate, two consumers — so "③
 * goes silent ⟺ ④ speaks" holds by construction and the one-way-valve-into-silence
 * (re-run brief §3/§6.1) cannot reopen via drift.
 */
function isWorsening(s: SymptomStat, cfg: DetectionConfig['reflection']): boolean {
  return (
    s.currentCount >= cfg.worseningMinEpisodes &&
    (s.currentCount > s.priorCount || s.currentDays > s.priorDays)
  )
}

export function detectReflections(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): ReflectionFinding[] {
  const cfg = config.reflection
  const windowed = computeWindowedStats(input, config)
  if (!windowed || !windowed.loggingEligible) return []
  const { stats } = windowed

  // GLOBAL worsening gate: if ANY tracked symptom is worsening, the WHOLE reflection
  // layer stays silent and yields to the safety lane — detector ④ owns that case now
  // (shared `isWorsening`, so the valve is closed). The per-symptom direction guard
  // alone is defeated across symptoms (rising vomit + falling itch would surface a
  // soothing "itch is down" card while the rising vomit is dropped).
  if (stats.some((s) => isWorsening(s, cfg))) return []

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

// ── Detector ④: symptom-frequency worsening (the deterministic worsening lane) ──
//
// The SAFETY-class owner of the case detector ③'s worsening gate suppresses. Before
// this detector existed, a rising symptom trend made ③ go silent with NOTHING firing
// in its place — a one-way valve into silence that opened exactly when the pet was
// getting worse (re-run brief §3/§6.1; observed live 2026-06-10, where the Signal
// regressed to the onboarding empty state one minute after the 15th vomit). ④ closes
// the valve by firing on the EXACT predicate ③ suppresses on (shared `isWorsening`).
//
// It is DESCRIPTIVE FREQUENCY, never a causal claim (that is ①/⑤) and never a severity
// verdict — it states that a symptom is happening more often / on more days, not that
// the pet is "worse". It is a safety finding: it NEVER reassures, and its ABSENCE is
// silence, not wellness.
//
// Thresholds (PM-ratified 2026-06-11):
//   • Trigger — coupled to ③'s gate at worseningMinEpisodes (no higher floor; a higher
//     floor would reopen a silent band, the very bug being fixed). Both arms: an
//     episode-count rise OR a symptom-day spread rise. The prior count MAY be 0 (a rise
//     from a logged zero is at least as clinically real as 2→4).
//   • Logging-eligibility — BOTH windows must clear the coarse logging floor. This is
//     the fake-rise guard: a wholly-dark prior week cannot manufacture a rise. A prior
//     window that was logged but UNDER-logged for symptoms can still inflate the rise,
//     but that errs toward escalation (a false vet nudge), the safe direction under §9 —
//     never toward a false all-clear. Documented, accepted residual.
//   • Copy urgency — tiered on current-week symptom-DAY DENSITY, not raw count (see
//     WorseningTier / resolveWorseningTier). Density is a defensible escalation marker
//     on its own and stable under episode/day collapsing.
//
// Out of scope (owned elsewhere / deferred): the ABSOLUTE-burden case with no prior
// window at all (week-1 acute illness) — owned by per-incident analysis (analyze-vomit)
// and the separate absolute-burden open question; ④ is the WORSENING lane only.
// Surfaces at most ONE card (the most-worsening symptom) so the safety surface stays
// calm; co-firing with an intake-decline flag is intentional (both kept by curation —
// that two-signal gestalt is exactly what the re-run brief found MISSING).

/**
 * Resolve the copy-urgency tier for a worsening symptom. Density first (a dense current
 * week is 'firm' regardless of which arm fired — persistent daily symptoms are the
 * concerning case Dr. Chen named); otherwise the count-rise arm is 'standard' and the
 * spread-only arm is the gentlest 'soft'.
 */
function resolveWorseningTier(
  s: SymptomStat,
  trigger: WorseningTrigger,
  cfg: DetectionConfig['reflection'],
): WorseningTier {
  if (s.currentDays >= cfg.worseningDenseDayFloor) return 'firm'
  return trigger === 'more_episodes' ? 'standard' : 'soft'
}

export function detectWorsening(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): SymptomWorseningFinding[] {
  const cfg = config.reflection
  const windowed = computeWindowedStats(input, config)
  // Both windows must be logging-eligible — same floor as ③. For ④ specifically this is
  // the fake-rise guard: a rise measured against a dark prior week is not trustworthy.
  if (!windowed || !windowed.loggingEligible) return []

  const worsening = windowed.stats.filter((s) => isWorsening(s, cfg))
  if (worsening.length === 0) return []

  // One card only — the most-worsening symptom: largest episode rise, then larger
  // current count, then symptom-type order. Calm safety surface over completeness.
  worsening.sort((a, b) => {
    const riseDiff = b.currentCount - b.priorCount - (a.currentCount - a.priorCount)
    if (riseDiff !== 0) return riseDiff
    if (b.currentCount !== a.currentCount) return b.currentCount - a.currentCount
    return (
      CORRELATION_SYMPTOM_TYPES.indexOf(a.symptomType) -
      CORRELATION_SYMPTOM_TYPES.indexOf(b.symptomType)
    )
  })

  const s = worsening[0]
  // By isWorsening, at least one arm is true. A strict count rise → 'more_episodes';
  // otherwise the counts are flat and the day-spread arm carried it → 'more_days'.
  const trigger: WorseningTrigger = s.currentCount > s.priorCount ? 'more_episodes' : 'more_days'
  return [
    {
      type: 'symptom_worsening',
      priorityClass: 'safety',
      symptomType: s.symptomType,
      currentCount: s.currentCount,
      priorCount: s.priorCount,
      currentDays: s.currentDays,
      priorDays: s.priorDays,
      trigger,
      tier: resolveWorseningTier(s, trigger, cfg),
      windowDays: cfg.windowDays,
    },
  ]
}

// ── Detector ⑤: postprandial timing (B-078 — descriptive lane Phase 1) ──────
//
// A purely DESCRIPTIVE, deterministic count: of the vomiting episodes we could TIME,
// how many happened within `rapidWindowMinutes` of eating. No model, no inference —
// each episode's minutes-since-last-feeding is an observed fact, and the aggregate is
// a count over an explicit eligible denominator ("4 of 12 we could time", never the raw
// episode count). It enriches the vet conversation as anamnesis (a standard GI-history
// item) — NEVER mechanism, NEVER cause, NEVER diagnosis (§9.2 / Clinician's Brief:
// timing is not a regurgitation-vs-vomiting differentiator). Owner copy names TIMING
// ONLY (§9.1); food form rides `feedingFormsInEvidence` into the evidence + vet report.
//
// SCOPE (PM-ratified 2026-06-11): runs on VOMIT episodes only. The entire spec —
// §1 origin, §3.1 claim, §7 fixtures, §9.2 literature anchor — is vomiting; a
// post-prandial-timing card on a dermatological symptom would imply a food-allergy
// MECHANISM (the exact thing §1/§3.5 forbid), and for diarrhea a 30-min window isn't
// physiologically meal-linked. Generalizing to other symptom types is purely additive
// and is a later PM decision; restricting now is the safe, spec-aligned default.
//
// The three load-bearing gates (all from §2/§3), each with a falsification fixture:
//   • witnessed-confidence eligibility (B-010): only a 'witnessed' onset is timed —
//     a discovered vomit ('estimated'/'window'/NULL) can never be "12 min after eating",
//     so it is excluded from numerator AND denominator. Feedings are NULL-tolerant
//     (witnessed semantics), mirroring attributionConfidence absent→'high'.
//   • free-feeding exclusion (B-040): while a free_choice bowl was available in the
//     preceding window, "minutes since last LOGGED feeding" is fiction — the episode is
//     ineligible (out of numerator AND denominator).
//   • the GRAZING GUARD (§3.3, Data Scientist, load-bearing): a frequently-fed pet is
//     "within 30 min of eating" much of the day by chance. Observed rapid must clear 2×
//     the chance-expected count (deterministic correction, no hypothesis test). PAIRED
//     with a minimum-eligible DENOMINATOR floor (minEligibleEpisodes): the 2× guard
//     scales with eligibleCount, so at a tiny denominator it collapses to the count floor
//     and a grazer's few coincidental rapid vomits slip through (adversarial-review
//     break, B-078). The denominator floor suppresses those smallest-N cases; the residual
//     above it is an accepted limitation tuned on real data (PM 2026-06-11; B-081).
//
// Nearest-preceding is the CORRECT semantics for a timing claim — the May
// "nearest-preceding meal" attribution bug was about blaming a food IDENTITY, which this
// claim deliberately does not do (§9 decision 1). Episode collapsing reuses the engine's
// 3h gap (toEpisodes…), so a re-logged bout is one episode, never an inflated count.

/** A feeding reduced to the fields ⑤ needs: time + an evidence-only form label. */
interface TimedFeeding {
  ms: number
  /** foodLabel ?? foodType — EVIDENCE/vet-report only (§9.1), never the owner claim. */
  form: string | null
}

/**
 * Timed-eligible feedings (§2): confidence 'witnessed' OR null/absent (meals are
 * inherently witnessed; legacy NULL carries the same semantics). 'estimated'/'window'
 * are excluded — a feeding whose time is a guess can't anchor a minutes-since claim.
 * ANY foodType (treats are exactly the relevant feedings — §3.2). Sorted ascending.
 */
function classifyTimedFeedings(mealEvents: MealEvent[]): TimedFeeding[] {
  return mealEvents
    .filter((m) => {
      const c = m.occurredAtConfidence ?? null
      return c === null || c === 'witnessed'
    })
    .map((m) => ({ ms: Date.parse(m.occurredAt), form: m.foodLabel ?? m.foodType ?? null }))
    .filter((f) => Number.isFinite(f.ms))
    .sort((a, b) => a.ms - b.ms)
}

/** A symptom episode reduced to its onset time + the onset event's timestamp confidence. */
interface ConfidenceEpisode {
  onsetMs: number
  confidence: OccurredAtConfidence | null
}

/**
 * Collapse same-type symptom events into episodes carrying the ONSET event's confidence
 * (§2: "the onset event's confidence is the episode's confidence"). Same 3h-gap collapsing
 * as toEpisodeOnsets — a re-logged bout is one episode — but we need each episode's
 * confidence, which the ms-only toEpisodeOnsets throws away.
 */
function toConfidenceEpisodes(
  events: { ms: number; confidence: OccurredAtConfidence | null }[],
  gapHours: number,
): ConfidenceEpisode[] {
  if (events.length === 0) return []
  const gapMs = gapHours * MS_PER_HOUR
  const sorted = [...events].sort((a, b) => a.ms - b.ms)
  const episodes: ConfidenceEpisode[] = [{ onsetMs: sorted[0].ms, confidence: sorted[0].confidence }]
  let prev = sorted[0].ms
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ms - prev > gapMs) {
      episodes.push({ onsetMs: sorted[i].ms, confidence: sorted[i].confidence })
    }
    prev = sorted[i].ms
  }
  return episodes
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** ⑤ runs on vomit only — see the SCOPE note above. */
const POSTPRANDIAL_SYMPTOM_TYPE: SymptomType = 'vomit'
const MS_PER_MINUTE = 60_000

export function detectPostprandialTiming(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): PostprandialTimingFinding[] {
  const cfg = config.postprandial
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []

  const windowMs = cfg.windowDays * MS_PER_DAY
  const windowStart = nowMs - windowMs
  const feedingLookbackMs = cfg.feedingLookbackHours * MS_PER_HOUR
  const recencyMs = cfg.recencyDays * MS_PER_DAY

  const feedings = classifyTimedFeedings(input.mealEvents)
  // Free-fed standing facts (B-040): if a bowl was available any time in the preceding
  // window, time-since-feeding is fiction → the episode is ineligible. classifyArrangements
  // parses + drops garbage spans; the protein is irrelevant here (any active bowl excludes).
  const standing = classifyArrangements(input.feedingArrangements ?? [])

  const vomitEvents = input.symptomEvents
    .filter((s) => s.type === POSTPRANDIAL_SYMPTOM_TYPE)
    .map((s) => ({ ms: Date.parse(s.occurredAt), confidence: s.occurredAtConfidence ?? null }))
    .filter((e) => Number.isFinite(e.ms))
  const episodes = toConfidenceEpisodes(vomitEvents, config.symptomEpisodeGapHours)

  // totalEpisodes = ALL in-window vomit episodes (any confidence) — the honesty context
  // "of N total, M could be timed". Eligibility narrows from here.
  const inWindow = episodes.filter((e) => e.onsetMs >= windowStart && e.onsetMs <= nowMs)
  const totalEpisodes = inWindow.length

  // The nearest preceding timed-eligible feeding within the lookback window (or null).
  // Feedings are sorted ascending, so the last one at/under the anchor and inside the
  // lookback is the nearest preceding.
  const nearestPreceding = (onsetMs: number): TimedFeeding | null => {
    let best: TimedFeeding | null = null
    for (const f of feedings) {
      if (f.ms > onsetMs) break
      if (onsetMs - f.ms > feedingLookbackMs) continue
      best = f
    }
    return best
  }

  // A free_choice bowl active any time in [onset - lookback, onset] makes "minutes since
  // last logged feeding" untrustworthy → the episode is ineligible.
  const freeFedNear = (onsetMs: number): boolean => {
    const lookbackStart = onsetMs - feedingLookbackMs
    return standing.some((s) => s.fromMs <= onsetMs && lookbackStart < s.untilMs)
  }

  interface EligibleEpisode {
    onsetMs: number
    minutesSince: number
    rapid: boolean
    form: string | null
  }
  const eligible: EligibleEpisode[] = []
  for (const e of inWindow) {
    if (e.confidence !== 'witnessed') continue // strict witnessed gate (B-010, §2)
    if (freeFedNear(e.onsetMs)) continue // free-feeding exclusion (B-040, §2)
    const feeding = nearestPreceding(e.onsetMs)
    if (!feeding) continue // no timed feeding in the preceding window → time-since undefined
    const minutesSince = (e.onsetMs - feeding.ms) / MS_PER_MINUTE
    eligible.push({
      onsetMs: e.onsetMs,
      minutesSince,
      rapid: minutesSince <= cfg.rapidWindowMinutes,
      form: feeding.form,
    })
  }

  const eligibleCount = eligible.length
  // Denominator floor (adversarial-review fix, B-078/B-081): "N of M" needs a real M.
  // Also guards the fraction division below (minEligibleEpisodes ≥ 1).
  if (eligibleCount < cfg.minEligibleEpisodes) return []
  const rapidEpisodes = eligible.filter((e) => e.rapid)
  const rapidCount = rapidEpisodes.length

  // Floors (§3.3) — ALL must pass. Below-floor is SILENCE, never an inverted "not
  // meal-related" claim (§3.5).
  if (rapidCount < cfg.minRapidEpisodes) return []
  if (rapidCount / eligibleCount < cfg.minRapidFraction) return []
  // Recency: a stale cluster must not lead today's surface.
  if (!rapidEpisodes.some((e) => nowMs - e.onsetMs <= recencyMs)) return []

  // The GRAZING GUARD (§3.3) — observed rapid must clear 2× the chance-expected count.
  // feedingRatePerDay = timed-eligible feedings ÷ distinct days carrying one (in-window).
  const inWindowFeedings = feedings.filter((f) => f.ms >= windowStart && f.ms <= nowMs)
  const feedingDays = new Set(inWindowFeedings.map((f) => Math.floor(f.ms / MS_PER_DAY))).size
  const feedingRatePerDay = feedingDays > 0 ? inWindowFeedings.length / feedingDays : 0
  const expectedRapid =
    eligibleCount * Math.min(1, (feedingRatePerDay * cfg.rapidWindowMinutes) / 1440)
  if (rapidCount < Math.max(cfg.minRapidEpisodes, cfg.minObservedToExpectedRatio * expectedRapid)) {
    return []
  }

  // Payload. "Including the last two" = the two most-recent ELIGIBLE episodes are both rapid.
  const byOnsetDesc = [...eligible].sort((a, b) => b.onsetMs - a.onsetMs)
  const lastTwoEligibleRapid =
    byOnsetDesc.length >= 2 && byOnsetDesc[0].rapid && byOnsetDesc[1].rapid
  const medianMinutesSinceFeeding = Math.round(median(rapidEpisodes.map((e) => e.minutesSince)))
  const feedingFormsInEvidence = Array.from(
    new Set(rapidEpisodes.map((e) => e.form).filter((f): f is string => f != null)),
  )

  return [
    {
      type: 'postprandial_timing',
      priorityClass: 'insight',
      symptomType: POSTPRANDIAL_SYMPTOM_TYPE,
      rapidCount,
      eligibleCount,
      totalEpisodes,
      rapidWindowMinutes: cfg.rapidWindowMinutes,
      lastTwoEligibleRapid,
      medianMinutesSinceFeeding,
      feedingFormsInEvidence,
      associationalOnly: true,
      windowDays: cfg.windowDays,
    },
  ]
}

// ── Detector ⑥: time-of-day clustering (B-079 — descriptive lane Phase 2) ────
//
// A purely DESCRIPTIVE, deterministic count: of the witnessed vomiting episodes we can
// place on the clock, how many fall in one band of the pet's LOCAL day. No model — each
// onset's local hour-of-day is an observed fact, and the aggregate is a count over an
// explicit witnessed denominator ("5 of 8", never the raw episode count). It enriches the
// vet conversation as anamnesis (the classic empty-stomach early-morning case is a
// feeding-schedule conversation) — NEVER mechanism, NEVER cause (§4.5 / §1.1).
//
// SCOPE: VOMIT episodes only, mirroring ⑤ (B-078). The entire spec §4 (§4.1 claim, §7
// fixtures, §1's early-morning-bilious framing) is vomiting; a clock-cluster card on a
// dermatological symptom would invite a mechanism reading the descriptive lane forbids,
// and the ⑤-suppresses-⑥ mutual exclusion (§4.4) is only defined where both run. Both
// detectors vomit-only keeps that interaction clean. Generalizing to other symptom types
// is purely additive and a later PM decision; restricting now is the safe, spec-aligned
// default (the same call ⑤ made).
//
// LOCAL TIME is the whole point and a NEW dependency (§4.2): timestamps are stored UTC
// (hard constraint), and "4–8am" only means something in the pet's local day. The onset
// instant is converted to local hour-of-day via Intl.DateTimeFormat with the pet's IANA
// timezone (DetectionInput.timezone, from user_profiles). Intl is built into both the Deno
// Edge runtime and the Node test runner, so no new runtime dependency. An ABSENT or INVALID
// timezone ⇒ the detector is SILENT — we never guess UTC, because a wrong day-boundary
// would manufacture a false cluster. DST is absorbed by per-instant conversion (two
// same-local-hour onsets on opposite sides of a clock change bucket together).
//
// METHOD (§4.3): bucket witnessed-eligible onsets by local hour (0–23), then slide a
// `clusterWindowHours`-wide window around the 24h circle in 1h steps (24 wrap-around
// positions) and take the max-count band. Fire only when ALL floors pass (denominator,
// cluster mass, cluster fraction). Episode collapsing reuses the engine's 3h gap, so a
// re-logged bout is one episode. Witnessed-confidence is the same B-010 gate as ⑤: a
// discovered onset's time is a guess and can't be placed on the clock. (No free-feeding
// gate — ⑥ is about the symptom clock, not feeding, so a free-fed bowl is irrelevant here.)

/** ⑥ runs on vomit only — see the SCOPE note above. */
const TIMEOFDAY_SYMPTOM_TYPE: SymptomType = 'vomit'

/**
 * Convert a UTC instant to the pet's local hour-of-day (0–23) via the IANA `timezone`.
 * Returns null when the zone is invalid (Intl throws) or the hour can't be parsed — the
 * caller treats null as "silent", never a guessed UTC hour (§4.2). Built on Intl (portable:
 * Deno Edge + Node test runner, no new dependency); DST is handled per-instant by Intl.
 */
function localHourOfDay(ms: number, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(ms))
    const hourStr = parts.find((p) => p.type === 'hour')?.value
    if (hourStr == null) return null
    let h = Number.parseInt(hourStr, 10)
    if (!Number.isInteger(h)) return null
    if (h === 24) h = 0 // hour12:false can emit '24' at local midnight in some Intl builds
    return h >= 0 && h <= 23 ? h : null
  } catch {
    return null // invalid IANA zone → Intl.DateTimeFormat throws → silent
  }
}

export function detectTimeOfDayClustering(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): TimeOfDayClusteringFinding[] {
  const cfg = config.timeofday
  const tz = input.timezone
  if (!tz) return [] // §4.2 — no timezone, never guess UTC

  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  // Probe the zone once: an invalid IANA string makes every conversion null → silent. This
  // distinguishes "bad zone" (silent) from "good zone, no cluster" (also silent, but honest).
  if (localHourOfDay(nowMs, tz) === null) return []

  const windowMs = cfg.windowDays * MS_PER_DAY
  const windowStart = nowMs - windowMs

  const vomitEvents = input.symptomEvents
    .filter((s) => s.type === TIMEOFDAY_SYMPTOM_TYPE)
    .map((s) => ({ ms: Date.parse(s.occurredAt), confidence: s.occurredAtConfidence ?? null }))
    .filter((e) => Number.isFinite(e.ms))
  const episodes = toConfidenceEpisodes(vomitEvents, config.symptomEpisodeGapHours)

  // totalEpisodes = ALL in-window vomit episodes (any confidence) — the honesty context
  // "of N total, M could be placed on the clock". Eligibility narrows from here.
  const inWindow = episodes.filter((e) => e.onsetMs >= windowStart && e.onsetMs <= nowMs)
  const totalEpisodes = inWindow.length

  // Witnessed-eligible only (§2): a discovered onset's time is a guess; it can't be placed
  // on the clock. (estimated/window/NULL excluded from numerator AND denominator.)
  const localHours: number[] = []
  for (const e of inWindow) {
    if (e.confidence !== 'witnessed') continue
    const h = localHourOfDay(e.onsetMs, tz)
    if (h === null) continue // a single un-convertible instant is dropped, not guessed
    localHours.push(h)
  }

  const eligibleCount = localHours.length
  // Denominator floor (§4.3): below this, any "cluster" is a coin run. Also guards the
  // fraction division below (minEligibleEpisodes ≥ 1).
  if (eligibleCount < cfg.minEligibleEpisodes) return []

  // Bucket by local hour, then slide a clusterWindowHours-wide window over the 24h clock
  // (24 wrap-around positions) and take the max-count band. Tie-break (adversarial review,
  // B-079): among equal-count windows, prefer one whose START hour is OCCUPIED, then the
  // earliest such start. Without this, an all-at-7am cluster would report "between 4am and
  // 8am" (the earliest window containing hour 7) — honest but loose; the occupied-start rule
  // tightens the band's leading edge onto where episodes actually begin ("7am" / "5am"),
  // which reads truer in the vet conversation. Fully deterministic; the fire DECISION is
  // unaffected (only the reported band start moves), so the property-test fire rate is identical.
  const counts = new Array<number>(24).fill(0)
  for (const h of localHours) counts[h]++
  let bestStart = 0
  let bestCount = -1
  let bestStartOccupied = false
  for (let start = 0; start < 24; start++) {
    let c = 0
    for (let k = 0; k < cfg.clusterWindowHours; k++) c += counts[(start + k) % 24]
    const startOccupied = counts[start] > 0
    if (c > bestCount || (c === bestCount && startOccupied && !bestStartOccupied)) {
      bestCount = c
      bestStart = start
      bestStartOccupied = startOccupied
    }
  }

  // Floors (§4.3) — ALL must pass. Below-floor is SILENCE, never an inverted "no particular
  // time of day" claim (the §3.5 never-inverted rule, inherited).
  if (bestCount < cfg.minClusterEpisodes) return []
  if (bestCount / eligibleCount < cfg.minClusterFraction) return []

  return [
    {
      type: 'timeofday_clustering',
      priorityClass: 'insight',
      symptomType: TIMEOFDAY_SYMPTOM_TYPE,
      clusterStartLocalHour: bestStart,
      clusterWindowHours: cfg.clusterWindowHours,
      clusterCount: bestCount,
      eligibleCount,
      totalEpisodes,
      timezone: tz,
      associationalOnly: true,
      windowDays: cfg.windowDays,
    },
  ]
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
//   • meal_type_collapse / diet_churn (EXPLANATION) — the B-080 diet-structure pair
//     (descriptive lane Phase 3). Placed HERE, not in the live findings stack, per
//     the §9.3 PM decision: they describe the owner's feeding/logging STRUCTURE, so
//     framing them as "here's why there's no signal yet" is honest where a band-2
//     card beside a clinical finding would read as a verdict on the pet. Both are
//     suppressed on diet-trial pets; §5.2 curation (suppressDietStructure): collapse
//     suppresses churn and is never co-rendered with staple_washout.
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

/**
 * Diet-structure observation (a) — meal-type collapse (B-080 §5.2a). Counts days
 * in-window that logged ≥minTreatsPerGapDay treats and ZERO meals. The load-bearing
 * honesty rule: a day with NO logging at all is NOT a gap day (it never enters the
 * per-day map), so "didn't log" can never masquerade as "fed only treats" — the
 * sibling of the ④ fake-rise guard. Suppressed on diet-trial pets (the trial sets
 * the structure). The claim is stated over the fixed window ("N of the last W days").
 */
function detectMealTypeCollapse(
  input: DetectionInput,
  config: DetectionConfig,
): MealTypeCollapseDiagnostic | null {
  if (input.pet.dietTrialActive) return null
  const cfg = config.dietStructure
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null

  // The window is the trailing `collapseWindowDays` UTC CALENDAR days ending today
  // (inclusive) — NOT a raw ms span. A raw `nowMs - W*MS_PER_DAY` span starting at a
  // non-midnight instant straddles W+1 distinct calendar-day buckets, which would let
  // gapDays exceed windowDays and render the impossible "11 of the last 10 days"
  // (adversarial review, B-080). Bucketing the window into exactly W calendar days
  // keeps the numerator ≤ the denominator the copy states.
  const todayBucket = Math.floor(nowMs / MS_PER_DAY)
  const earliestBucket = todayBucket - (cfg.collapseWindowDays - 1)

  const feedings = input.mealEvents
    .map((m) => ({ ms: Date.parse(m.occurredAt), foodType: m.foodType }))
    // f.ms ≤ nowMs drops clock-skew future rows; the bucket floor bounds us to exactly
    // collapseWindowDays calendar days (bucket ≤ todayBucket is implied by ms ≤ nowMs).
    .filter((f) => Number.isFinite(f.ms) && f.ms <= nowMs && Math.floor(f.ms / MS_PER_DAY) >= earliestBucket)
  if (feedings.length === 0) return null

  // Classification floor: if too few feedings carry a non-null foodType, the meal/treat
  // split is unreliable and any "treats-only day" count is fiction → stay silent.
  const classified = feedings.filter((f) => f.foodType != null).length
  if (classified / feedings.length < cfg.minClassifiedFraction) return null

  // Per-UTC-day buckets (mirrors the reflection day-spread approach). Only days with ≥1
  // logged feeding exist here — dark days are absent by construction and so can never be
  // counted as gap days. KNOWN RESIDUAL (B-084): a "day" here is a UTC calendar day, not
  // the owner's local day, so near a window edge a negative-UTC-offset owner's evening
  // meal can land on the next UTC day and shift one boundary day's classification. The
  // effect is ≤1 day at the edges (a regular feeding schedule self-corrects — each UTC
  // day inherits the prior evening's meal in its early hours); local-day bucketing via
  // the ⑥ timezone plumbing is the principled fix, flagged for a PM call.
  const byDay = new Map<number, { meals: number; treats: number }>()
  for (const f of feedings) {
    const day = Math.floor(f.ms / MS_PER_DAY)
    const e = byDay.get(day) ?? { meals: 0, treats: 0 }
    if (f.foodType === 'meal') e.meals++
    else if (f.foodType === 'treat') e.treats++
    byDay.set(day, e)
  }

  const treatsOnGapDays: number[] = []
  for (const e of byDay.values()) {
    if (e.meals === 0 && e.treats >= cfg.minTreatsPerGapDay) treatsOnGapDays.push(e.treats)
  }
  const gapDays = treatsOnGapDays.length
  if (gapDays < cfg.minGapDays) return null

  return {
    type: 'meal_type_collapse',
    actionability: 'explanation',
    gapDays,
    loggedDays: byDay.size,
    treatsPerDayMedian: Math.round(median(treatsOnGapDays)),
    windowDays: cfg.collapseWindowDays,
  }
}

/**
 * Diet-structure observation (b) — diet churn (B-080 §5.2b). Counts distinct foods
 * whose FIRST-EVER appearance (across all available history — index.ts pulls 180d)
 * falls within the churn window, gated on active symptoms in the same window. A food
 * with no `foodItemId` cannot be tracked for novelty and is skipped. Suppressed on
 * diet-trial pets (a vet-directed switch IS new food). Limitation: a food whose true
 * first-ever exposure predates the 180d lookback and reappears in-window reads as
 * novel — an accepted edge (a months-dormant food returning is arguably a
 * reintroduction worth noting); tune on real data.
 */
function detectDietChurn(
  input: DetectionInput,
  config: DetectionConfig,
): DietChurnDiagnostic | null {
  if (input.pet.dietTrialActive) return null
  const cfg = config.dietStructure
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null
  const windowStart = nowMs - cfg.churnWindowDays * MS_PER_DAY

  const firstSeen = new Map<string, number>()
  // A food with ANY unparseable-timestamp row has an unknowable first-seen, so we cannot
  // certify it as novel — exclude it entirely rather than treat its earliest PARSEABLE
  // row as the first exposure (which would let a genuinely-old food read as new off a
  // single corrupt earlier timestamp). Churn errs toward silence (adversarial review).
  const unknowableFirstSeen = new Set<string>()
  for (const m of input.mealEvents) {
    if (!m.foodItemId) continue
    const ms = Date.parse(m.occurredAt)
    if (!Number.isFinite(ms)) {
      unknowableFirstSeen.add(m.foodItemId)
      continue
    }
    const prev = firstSeen.get(m.foodItemId)
    if (prev === undefined || ms < prev) firstSeen.set(m.foodItemId, ms)
  }
  let novelFoodCount = 0
  for (const [foodItemId, ms] of firstSeen) {
    if (unknowableFirstSeen.has(foodItemId)) continue
    if (ms >= windowStart && ms <= nowMs) novelFoodCount++
  }
  if (novelFoodCount < cfg.minNovelFoods) return null

  const inWindowSymptoms = input.symptomEvents.filter((s) => {
    const ms = Date.parse(s.occurredAt)
    return Number.isFinite(ms) && ms >= windowStart && ms <= nowMs
  })
  const symptomEpisodesInWindow = countSymptomEpisodes(inWindowSymptoms, config)
  if (symptomEpisodesInWindow < cfg.minSymptomEpisodes) return null

  return {
    type: 'diet_churn',
    actionability: 'explanation',
    novelFoodCount,
    symptomEpisodesInWindow,
    windowDays: cfg.churnWindowDays,
  }
}

/**
 * §5.2 mutual-exclusion curation, applied before ranking. Collapse outranks the other
 * two diet-shaped messages and suppresses them so the surface never nags with
 * overlapping diet observations:
 *   - collapse SUPPRESSES churn (spec §5.2b — "collapse outranks churn").
 *   - collapse is NEVER co-rendered with staple_washout (spec §5.2a). Collapse wins:
 *     it is the more fundamental, more recent diet-coverage gap ("we're barely seeing
 *     meals" undercuts any "you feed one protein every meal" claim).
 */
function suppressDietStructure(diagnostics: CoverageDiagnostic[]): CoverageDiagnostic[] {
  const hasCollapse = diagnostics.some((d) => d.type === 'meal_type_collapse')
  if (!hasCollapse) return diagnostics
  return diagnostics.filter((d) => d.type !== 'diet_churn' && d.type !== 'staple_washout')
}

// Single-slot priority for the no_pattern surface. The ACTION diagnostic (rate_meals —
// both actionable AND it activates safety detector ②) always leads (B-053). The
// diet-structure observations rank above the standing staple explanation: collapse
// (most fundamental/recent diet-coverage gap) → churn → staple_washout. Deterministic
// and total, so the single rendered diagnostic never depends on detector push order.
const COVERAGE_TYPE_ORDER: Record<CoverageDiagnosticType, number> = {
  rate_meals: 0,
  meal_type_collapse: 1,
  diet_churn: 2,
  staple_washout: 3,
}

export function rankCoverageDiagnostics(diagnostics: CoverageDiagnostic[]): CoverageDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) => COVERAGE_TYPE_ORDER[a.type] - COVERAGE_TYPE_ORDER[b.type],
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
  const collapse = detectMealTypeCollapse(input, config)
  if (collapse) diagnostics.push(collapse)
  const churn = detectDietChurn(input, config)
  if (churn) diagnostics.push(churn)
  return rankCoverageDiagnostics(suppressDietStructure(diagnostics))
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
  { type: 'symptom_worsening', detect: detectWorsening },
  { type: 'postprandial_timing', detect: detectPostprandialTiming },
  { type: 'timeofday_clustering', detect: detectTimeOfDayClustering },
  { type: 'reflection', detect: detectReflections },
]

// ── Composition & ranking (§5) ──────────────────────────────────────────────

// Priority bands, lowest number ranks first.
//   0  safety / concern — always leads, always visible (§5.1)
//   1  context-lead insight for this pet (§5.2, §8)
//   2  remaining qualifying insights (§5.3) — correlations + the descriptive-lane
//      detectors (⑤ postprandial timing, B-078; ⑥ time-of-day clustering, B-079);
//      ordered WITHIN the band by INSIGHT_TYPE_ORDER (correlations lead, then ⑤, then
//      ⑥ — §6 of the descriptive-signals spec).
//   3  reflection (③, B-051) — the gentlest "presence" layer; ALWAYS below every
//      safety finding AND below every correlation, never the lead of a data-rich
//      pet that has a real correlation to show.
function priorityBand(finding: Finding, ctx: PetContext): number {
  if (finding.priorityClass === 'safety') return 0 // intake_decline AND symptom_worsening
  if (finding.type === 'reflection') return 3
  // Correlation is the context-lead insight for a diet-trial pet (Jordan's stack, §8).
  if (finding.type === 'food_symptom_correlation' && ctx.dietTrialActive) return 1
  return 2 // correlations (non-trial) + postprandial_timing (⑤) + timeofday_clustering (⑥)
}

const TIER_ORDER: Record<EvidenceTier, number> = { established: 0, early: 1 }

// Within-band ordering for the band-2 insight stack (§6, descriptive-signals spec):
// correlations lead, then the descriptive lane (⑤ → ⑥ → diet-structure as they land).
// Reflection (③) is band 3, so it never reaches this comparator. Unlisted types tie.
const INSIGHT_TYPE_ORDER: Record<string, number> = {
  food_symptom_correlation: 0,
  postprandial_timing: 1,
  timeofday_clustering: 2,
}

// Within the safety band (band 0): intake-decline leads symptom-frequency worsening.
// Anorexia (esp. the feline 48h hepatic-lipidosis window) is a faster-killing emergency
// than a week-over-week symptom-count rise; both still lead every insight, and both are
// kept by curation (a pet eating less AND vomiting more shows two safety cards — the
// two-signal gestalt the re-run brief found MISSING).
const SAFETY_TYPE_ORDER: Record<string, number> = { intake_decline: 0, symptom_worsening: 1 }

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

    // Among safety findings: intake-decline leads worsening; within intake-decline,
    // an outright refusal of a normally-eaten food leads.
    if (x.priorityClass === 'safety' && y.priorityClass === 'safety') {
      const safetyDiff = (SAFETY_TYPE_ORDER[x.type] ?? 9) - (SAFETY_TYPE_ORDER[y.type] ?? 9)
      if (safetyDiff !== 0) return safetyDiff
      if (x.type === 'intake_decline' && y.type === 'intake_decline') {
        const order: Record<IntakeDeclineTrigger, number> = {
          refused_normal_food: 0,
          consecutive_low: 1,
        }
        return order[x.trigger] - order[y.trigger]
      }
    }

    // Same-band, different insight types (e.g. a correlation + a postprandial-timing
    // card both in band 2): correlations lead the descriptive lane (§6).
    const typeDiff = (INSIGHT_TYPE_ORDER[x.type] ?? 9) - (INSIGHT_TYPE_ORDER[y.type] ?? 9)
    if (typeDiff !== 0) return typeDiff

    return 0
  })

  return sorted.map((finding, i) => ({ finding, rank: i }))
}

/**
 * §4.4 / §6 curation — ⑤ (postprandial timing) and ⑥ (time-of-day clustering) are
 * MUTUALLY EXCLUSIVE per symptom type, and ⑤ wins. A schedule-fed post-prandial vomiter
 * clusters by clock trivially, so ⑥ would merely re-state ⑤'s pattern as a clock pattern;
 * ⑥'s clinical value is highest exactly when episodes are NOT meal-adjacent (the
 * empty-stomach early-morning case). So drop any ⑥ finding whose symptom type already has
 * a ⑤ finding. This lives in the COMPOSITION layer (not inside the detector) so each
 * detector stays pure and independently unit-testable, matching §6's "curation" framing.
 * It runs before ranking; a symptom with no ⑤ finding keeps its ⑥ card untouched.
 */
function suppressTimeOfDayWhenPostprandial(findings: Finding[]): Finding[] {
  const postprandialTypes = new Set(
    findings
      .filter((f): f is PostprandialTimingFinding => f.type === 'postprandial_timing')
      .map((f) => f.symptomType),
  )
  if (postprandialTypes.size === 0) return findings
  return findings.filter(
    (f) => !(f.type === 'timeofday_clustering' && postprandialTypes.has(f.symptomType)),
  )
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
  // §4.4/§6 mutual exclusion (⑤ suppresses ⑥ per symptom) before ranking.
  return rankFindings(suppressTimeOfDayWhenPostprandial(findings), input.pet)
}
