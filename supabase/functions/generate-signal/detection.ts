// AI Signal — deterministic detection engine (B-045, Step 1).
//
// This is the "deterministic detection" half of the architecture decided in
// docs/nyx-ai-signal-requirements.md §2 (Option B: deterministic detection +
// LLM phrasing). It is a PURE module: it takes already-fetched, plain-shaped
// data and returns typed, ranked candidate findings. It performs no I/O, no DB
// access, and NO LLM call — the model (Step 2) only renders an already-true
// finding into a sentence; it never decides whether a pattern exists.
//
// Two v1 detectors live here (§4):
//   ① food/protein → symptom correlation  (the flagship wedge insight)
//   ② intake-decline calm safety flag      (MANDATORY never-reassure net)
//
// Both honour the §6/§7 evidence-tier floors and the clinical guardrails in §9
// and CLAUDE.md (associational-only correlation copy; intake decline routed as
// calm concern, never softened to "picky", never reassuring, and silent — not
// a false flag and not an all-clear — when intake-rating coverage is thin).
//
// Why it lives under supabase/functions/: it is server-side code the
// `generate-signal` Edge Function (Step 2) imports. It is written as portable
// TypeScript (no Deno-only or Node-only APIs) so it runs in the Edge runtime
// and is unit-testable in isolation.

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
  /** Reference "now" (ISO-8601 UTC), injected so detection is deterministic and testable. */
  now: string
}

// ── Finding types (§4/§5) ───────────────────────────────────────────────────

export type InsightType = 'food_symptom_correlation' | 'intake_decline'

/** Safety/concern always leads (§5); everything else is an insight. */
export type PriorityClass = 'safety' | 'insight'

/** Confidence tier for correlation findings (§6). Safety flags carry no tier. */
export type EvidenceTier = 'early' | 'established'

interface FindingBase {
  type: InsightType
  priorityClass: PriorityClass
}

/**
 * Food/protein → symptom association. ASSOCIATIONAL ONLY — there is deliberately
 * no causal field. The 2x2 counts power tap-to-expand evidence (§3.2) and let the
 * phrasing layer cite real sample sizes without inventing them.
 */
export interface CorrelationFinding extends FindingBase {
  type: 'food_symptom_correlation'
  priorityClass: 'insight'
  tier: EvidenceTier
  symptomType: SymptomType
  protein: string
  /**
   * Meals exposed to this protein that are the *nearest preceding meal* of ≥1 symptom
   * episode within the window. Counts MEALS (each ≤1), not symptoms — so a single
   * symptom can never inflate this across several meals (the pseudoreplication fix).
   */
  exposedWithSymptom: number
  /** All meals exposed to this protein (the "exposed arm"). */
  exposedTotal: number
  /** Unexposed meals that are the nearest preceding meal of ≥1 symptom episode. */
  unexposedWithSymptom: number
  /** All meals with a known, different protein (the "unexposed arm"). */
  unexposedTotal: number
  exposedRate: number
  unexposedRate: number
  /** exposedRate - unexposedRate; positive = symptom enriched after this protein. */
  riskDifference: number
  /** One-sided Fisher's exact p (enrichment). Established requires this to clear the corrected bar. */
  pValue: number
  /** Bonferroni-corrected significance threshold actually applied (alpha / family size). */
  correctedAlpha: number
  /**
   * Distinct symptom *episodes* of this type (rapid re-logs of one bout collapsed) —
   * the §7 "≥N symptom events" arm. Episode-collapsing prevents one bout logged five
   * times from clearing the floor as five independent confirmations.
   */
  symptomEventCount: number
  /** The symptom-class-specific window actually applied (GI ~8h, dermatological ~72h). */
  correlationWindowHours: number
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

export type Finding = CorrelationFinding | IntakeDeclineFinding

/** A finding plus its resolved sort position, returned by the engine in ranked order. */
export interface RankedFinding {
  finding: Finding
  rank: number
}

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
    /** §7 Early: ≥3 symptom events. */
    earlyMinSymptomEvents: number
    /** §7 Early: ≥3 exposures in BOTH arms. */
    earlyMinExposuresPerArm: number
    /** Guard against an n=1 coincidence printing an Early claim. */
    earlyMinExposedWithSymptom: number
    /** §7 Early "relaxed effect bar": minimum positive risk difference. */
    earlyMinRiskDifference: number
    /** §7 Established: ≥5 symptom events. */
    establishedMinSymptomEvents: number
    /** §7 Established: ≥5 exposures in BOTH arms. */
    establishedMinExposuresPerArm: number
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
}

/** §7 table, adopted as the v1 starting defaults (PM 2026-05-30); tune on real data, not a re-decision. */
export const DEFAULT_CONFIG: DetectionConfig = {
  correlationWindowHours: 8,
  correlationWindowHoursByType: {
    vomit: 8,
    diarrhea: 8,
    itch: 72,
    scratch: 72,
    skin_reaction: 72,
  },
  symptomEpisodeGapHours: 3,
  correlation: {
    earlyMinSymptomEvents: 3,
    earlyMinExposuresPerArm: 3,
    earlyMinExposedWithSymptom: 2,
    earlyMinRiskDifference: 0.2,
    establishedMinSymptomEvents: 5,
    establishedMinExposuresPerArm: 5,
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

// ── Detector ①: food/protein → symptom correlation ─────────────────────────
//
// KNOWN LIMITATION — TODO(B-050): this detector is still MEAL-ANCHORED and attributes
// each symptom episode to its single nearest-preceding meal. That is a deliberate
// placeholder that the team has already rejected as incorrect: it can blame the wrong
// food (winner-take-all) and exonerate a daily staple. The agreed replacement is a
// SYMPTOM-ANCHORED case-crossover (multi-implication of all in-window proteins, matched
// control windows with a logging-eligibility guard, McNemar test, attribution-confidence
// gating for multi-cat). Tests pass against the placeholder's behaviour, NOT against a
// correct correlation — do not wire this into the Edge Function (Step 2) or present its
// output as a real finding until B-050 lands. See docs/backlog.md B-050.

const MS_PER_HOUR = 3_600_000

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

export function detectCorrelations(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): CorrelationFinding[] {
  const cfg = config.correlation

  // Meals usable for correlation must carry a known protein. Sorted ascending so the
  // nearest-preceding-meal lookup can pick the latest meal at or before a symptom onset.
  const classifiableMeals = input.mealEvents
    .filter((m) => m.primaryProtein && m.primaryProtein.trim().length > 0)
    .map((m) => ({ ms: Date.parse(m.occurredAt), protein: m.primaryProtein!.trim().toLowerCase() }))
    .filter((m) => Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)

  const proteins = Array.from(new Set(classifiableMeals.map((m) => m.protein)))
  if (proteins.length < 2 || classifiableMeals.length === 0) {
    // Need at least an exposed and an unexposed arm to make any associational claim.
    return []
  }

  // First pass: build the 2x2 table for every (protein × symptom) pair that clears
  // the Early sample floor. These are the hypotheses we actually "look at", so the
  // multiple-comparison family size is their count (§6 multiple-comparison correction).
  interface Candidate {
    protein: string
    symptomType: SymptomType
    windowHours: number
    a: number
    b: number
    c: number
    d: number
    symptomEventCount: number
  }
  const candidates: Candidate[] = []

  for (const symptomType of CORRELATION_SYMPTOM_TYPES) {
    const windowHours = config.correlationWindowHoursByType[symptomType] ?? config.correlationWindowHours
    const windowMs = windowHours * MS_PER_HOUR

    const rawMsList = input.symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    // Pseudoreplication fix, part 1: collapse re-logged bouts into distinct episodes.
    const onsets = toEpisodeOnsets(rawMsList, config.symptomEpisodeGapHours)
    const symptomEventCount = onsets.length
    if (symptomEventCount < cfg.earlyMinSymptomEvents) continue

    // Pseudoreplication fix, part 2: attribute each episode to its SINGLE nearest
    // preceding meal within the window. A meal is "symptom-positive" if it is the
    // proximate meal for ≥1 episode — so one symptom can never light up several meals,
    // and the protein nearest in time (not every protein in the window) carries it.
    const attributedMealIdx = new Set<number>()
    for (const onset of onsets) {
      let bestIdx = -1
      // classifiableMeals is sorted ascending; scan back for the latest meal <= onset.
      for (let i = classifiableMeals.length - 1; i >= 0; i--) {
        if (classifiableMeals[i].ms <= onset) {
          if (onset - classifiableMeals[i].ms <= windowMs) bestIdx = i
          break
        }
      }
      if (bestIdx >= 0) attributedMealIdx.add(bestIdx)
    }

    for (const protein of proteins) {
      let a = 0
      let b = 0
      let c = 0
      let d = 0
      classifiableMeals.forEach((m, i) => {
        const exposed = m.protein === protein
        const hit = attributedMealIdx.has(i)
        if (exposed && hit) a++
        else if (exposed && !hit) b++
        else if (!exposed && hit) c++
        else d++
      })

      const exposedTotal = a + b
      const unexposedTotal = c + d
      if (
        exposedTotal < cfg.earlyMinExposuresPerArm ||
        unexposedTotal < cfg.earlyMinExposuresPerArm
      ) {
        continue
      }
      candidates.push({ protein, symptomType, windowHours, a, b, c, d, symptomEventCount })
    }
  }

  if (candidates.length === 0) return []

  // Multiple-comparison correction: Bonferroni over the family of looked-at pairs.
  const correctedAlpha = cfg.familywiseAlpha / candidates.length

  const findings: CorrelationFinding[] = []
  for (const cand of candidates) {
    const { a, b, c, d, protein, symptomType, symptomEventCount, windowHours } = cand
    const exposedTotal = a + b
    const unexposedTotal = c + d
    const exposedRate = exposedTotal === 0 ? 0 : a / exposedTotal
    const unexposedRate = unexposedTotal === 0 ? 0 : c / unexposedTotal
    const riskDifference = exposedRate - unexposedRate

    // Only positive associations (symptom enriched AFTER the protein) are findings.
    if (riskDifference < cfg.earlyMinRiskDifference) continue
    if (a < cfg.earlyMinExposedWithSymptom) continue

    const pValue = fisherExactRightTail(a, b, c, d)

    const meetsEstablishedSamples =
      symptomEventCount >= cfg.establishedMinSymptomEvents &&
      exposedTotal >= cfg.establishedMinExposuresPerArm &&
      unexposedTotal >= cfg.establishedMinExposuresPerArm
    const tier: EvidenceTier =
      meetsEstablishedSamples && pValue <= correctedAlpha ? 'established' : 'early'

    findings.push({
      type: 'food_symptom_correlation',
      priorityClass: 'insight',
      tier,
      symptomType,
      protein,
      exposedWithSymptom: a,
      exposedTotal,
      unexposedWithSymptom: c,
      unexposedTotal,
      exposedRate,
      unexposedRate,
      riskDifference,
      pValue,
      correctedAlpha,
      symptomEventCount,
      correlationWindowHours: windowHours,
      associationalOnly: true,
    })
  }

  return findings
}

// ── Detector ②: intake-decline calm safety flag ────────────────────────────

const MS_PER_DAY = 86_400_000

/** UTC calendar-date key (YYYY-MM-DD). Timezone-correct day boundaries are a caller concern. */
function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function detectIntakeDecline(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): IntakeDeclineFinding[] {
  const cfg = config.intakeDecline
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []

  // Only 'meal'-type foods with a real rating contribute. Treats/other and unrated
  // rows are excluded so a logging gap can never masquerade as a decline.
  const ratedMeals = input.mealEvents
    .filter((m) => m.foodType === 'meal' && m.intakeRating != null)
    .map((m) => ({
      ms: Date.parse(m.occurredAt),
      score: intakeScore(m.intakeRating as IntakeRating),
      foodItemId: m.foodItemId,
      foodLabel: m.foodLabel ?? null,
    }))
    .filter((m) => Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)

  // Coverage floor: too few rated meals → SILENT. Silence is not an all-clear (§9);
  // the composition layer renders the building/stale state, never "intake is fine".
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
]

// ── Composition & ranking (§5) ──────────────────────────────────────────────

// Priority bands, lowest number ranks first.
//   0  safety / concern — always leads, always visible (§5.1)
//   1  context-lead insight for this pet (§5.2, §8)
//   2  remaining qualifying insights (§5.3)
function priorityBand(finding: Finding, ctx: PetContext): number {
  if (finding.priorityClass === 'safety') return 0
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
