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

import { canonicalizeProtein, readProteinSet } from './protein.ts'
// The ONE meal-relative timing predicate (Signals v2 / B-755 PR 1, CUL-6; G9). Detectors
// ⑤ (postprandial) and L1 (empty-stomach) BOTH classify their episode set through this
// module — there is exactly one implementation of "how long since she last ate", server
// and client alike (§3). PR 2 (CUL-7) is the lift-and-call the module was built for: ⑤'s
// former inline `classifyTimedFeedings` / `nearestPreceding` / `freeFedNear` / rapid-band
// test are all gone, replaced by `classifyEpisodeSet` here. A `.ts` extension is mandatory —
// Deno will not resolve an extensionless specifier (the esbuild bundler inlines it, per
// generate-signal/protein.ts's precedent).
import {
  classifyEpisodeSet,
  collapseEpisodes,
  timedEligibleFeedings,
  type FeedingInput,
  type FreeFedSpan,
  type MealTimingConfig,
} from '../../../lib/mealTiming.ts'
// The ONE diet-trial "is it running today" predicate (Signals v2 / CUL-8; L2 §2). Imported
// across the function boundary exactly as `index.ts` already imports it — the B-422 effective
// end lives in ONE module, and L2's gate is that predicate, never a re-derivation from dates
// (spec §2 L2, G9). `localDayIndex`/`localDayIndexOf` are the same day-boundary helpers the
// trial card counts "day N of M" with (B-421), so L2's day-count cannot drift from the card's.
import { isTrialRunning } from '../../../lib/dietTrial.ts'
// `trialDayCounter` is the ONE "day N of M" formula (B-449) — re-spelling `max(1, end - start + 1)`
// here is the drift the guard test forbids elsewhere. `localDayIndex*` are the tz-aware day-boundary
// helpers the trial card counts with (B-421); L2 windows in day-INDEX space (never `index * MS_PER_DAY`,
// which is UTC midnight of the date — the owner's local midnight only at UTC, the B-517 inversion).
import { localDayIndex, localDayIndexOf, trialDayCounter } from '../../../lib/utils.ts'
// The two-window rate-contrast render-gate (Signals v2 / CUL-6; §3). L2's comparison SENTENCE
// is licensed only when this C-test gate passes over the pooled counts (with logged-days
// exposure) — the "counts always render; a comparison sentence only when the gate passes"
// discipline (§2 L2). p-values never surface (§3); this returns a boolean gate + direction.
import { rateContrast } from '../../../lib/rateContrast.ts'

// The ONE symptom-episode collapse, shared with hooks/useTrend.ts (B-067/CUL-372).
import {
  collapseToEpisodeOnsets,
  SYMPTOM_EPISODE_GAP_HOURS,
} from '../../../lib/symptomEpisodes.ts'

// ── Domain types ──────────────────────────────────────────────────────────────

// ── Symptom membership (W1-PR-3b session 1, CUL-676 — HR-1) ───────────────────
//
// Three concerns that used to be ONE list, split so a leaf can be TYPED without
// being FETCHED, and fetched without enrolling in every lane:
//
//   • SYMPTOM_TYPE_UNIVERSE — every symptom leaf this module can NAME. Widening
//     it compile-forces the label map (phrasing.ts SYMPTOM_LABEL) and lets a
//     fixture exercise a leaf the lanes must ignore, without a cast.
//   • CORRELATION_SYMPTOM_TYPES — the FETCH union (index.ts pulls exactly these;
//     generate-report's CORRELATION_TYPE_SET reads it too). Still the five GI/derm
//     types: cough joins HERE in 3b session 2, and only alongside the lane cells
//     below saying where it may speak.
//   • LANE_SYMPTOM_TYPES — which fetched types each LANE consumes (§9's per-lane
//     membership, the ruled cells). Before this split, adding one type to the
//     fetch auto-enrolled it in ①③④⑦, L4 AND the diagnostics floor at once —
//     including the food↔cough attribution §9 forbids by name (HR-1).
//
// Deliberately NOT cells in this map — three categories, and a session-2 author
// should treat this inventory as the complete map of what ELSE moves when the
// fetch union widens:
//   • ⑤/⑥/L1/L2-timing are structurally single-type (POSTPRANDIAL_SYMPTOM_TYPE /
//     TIMEOFDAY_SYMPTOM_TYPE / EMPTY_STOMACH_SYMPTOM_TYPE / TRIAL_TIMING_SYMPTOM_TYPE
//     constants below) — the corrected HR-1 inventory (2026-08-27 review, finding 1):
//     they never iterated the shared list, so they are not membership cells.
//   • The logged-day/density DENOMINATORS (loggingDaysInWindow, chronicity's
//     logging-density count, trial_response's loggedDaysIn) read the whole fetched
//     input by construction — the denominator set == the fetch union. That is now
//     the RULED state, not an accident (R3, PM 2026-08-28: "a logged cough IS a
//     logged day" — cough joins these denominators when it joins the fetch, with
//     before/after fixtures and the client-mirror parity in the same PR).
//   • NAMING gates that key on SYMPTOM_LABEL / the universe rather than a lane cell
//     (adversarial finding, 2026-08-28): summary.ts's month summary keeps a symptom
//     line only if `s.type in SYMPTOM_LABEL` — widening the universe widened that
//     gate, so the moment the FETCH carries cough the month summary NAMES it (with
//     the finished-meals clause alongside) through no lane cell and no §9
//     arbitration. Latent until session 2 widens the fetch; session 2 decides
//     summary membership EXPLICITLY (the §13a walk carries the row), never inherits it.
//
// One lever this split created, named so nobody pulls it casually: REMOVING a type
// from the `correlation` cell shrinks ①'s Bonferroni family with none of the family
// floors (the suppression floors guard suppression, not membership) — the remaining
// candidates' bar loosens and an unrelated finding can promote Early→Established on
// identical statistics. The cell pins in laneMembership.test.ts make any shrink a
// visible, argued diff.

export const SYMPTOM_TYPE_UNIVERSE = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'cough',
  'sneeze',
] as const
export type SymptomType = (typeof SYMPTOM_TYPE_UNIVERSE)[number]

/** Symptom event types the engine FETCHES (schema reference query [2]). */
export const CORRELATION_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
] as const satisfies readonly SymptomType[]

/** The five pre-taxonomy types every list-driven lane consumed before the split.
 *  Each cell below starts as exactly this list — the split is behaviour-neutral
 *  by construction, and every later divergence is a visible per-cell diff. */
const PRE_TAXONOMY_LANE_TYPES: readonly SymptomType[] = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
]

/** Per-lane membership — the ruled §9 cells. A lane iterates ITS cell, never the
 *  fetch union; its tie-breaks order by ITS cell. Pinned by laneMembership.test.ts. */
export const LANE_SYMPTOM_TYPES = {
  /** ① food↔symptom correlation. cough: NEVER (§9 — a respiratory sign gets no food-attribution window). */
  correlation: PRE_TAXONOMY_LANE_TYPES,
  /** ③ reflection + ④ worsening (one shared stats loop feeds both). cough: no at W1 (§9 row). */
  symptomDelta: PRE_TAXONOMY_LANE_TYPES,
  /** ⑦ chronicity. cough joins HERE in 3b session 2 — ⑦-only, with its own perType floors (B-755, Dr. Chen). */
  chronicity: PRE_TAXONOMY_LANE_TYPES,
  /** L4 gap-shortening. cough: NO at W1 (R1, PM 2026-08-28 — acceleration is a future ④ question, not L4's). */
  gapShortening: PRE_TAXONOMY_LANE_TYPES,
  /** The staple-washout / diet-churn symptom-evidence floor. cough: NEVER (R2, PM 2026-08-28 —
   *  a respiratory sign must never satisfy a food-attribution card's symptom gate). */
  diagnosticsFloor: PRE_TAXONOMY_LANE_TYPES,
} as const satisfies Record<string, readonly SymptomType[]>

/** WSAVA 5-point owner-reported intake scale (migration 011). */
export type IntakeRating = 'refused' | 'picked' | 'some' | 'most' | 'all'

export type Species = 'dog' | 'cat' | 'other'

/**
 * food_items.format — the physical-form enum (migration 001 + 014 jerky + 019 human_food).
 * Detection ignored this axis entirely until B-102 PR 5 (it keys off `food_type` + protein —
 * requirements §5). The human-food provenance covariate (computeHumanFoodProvenance) is the
 * first and ONLY consumer, and it acts on exactly one value (HUMAN_FOOD_FORMAT). The full
 * union is mirrored here for documentation + house style (matches `foodType`'s explicit
 * union); a DB value not listed here is simply "not human_food" to the engine, so the engine
 * stays correct even if this union drifts behind a future enum addition.
 */
export type FoodFormat =
  | 'dry_kibble'
  | 'wet_canned'
  | 'raw'
  | 'freeze_dried'
  | 'jerky'
  | 'fresh_cooked'
  | 'human_food'
  | 'topper'
  | 'treat'
  | 'other'

/**
 * The one format value the engine recognizes (B-102 PR 5). People-food given to a pet —
 * deli meat, rotisserie chicken, a piece of cheese — carries format='human_food'
 * (requirements §1/§4). It is the "off-commercial-diet" provenance marker; the single
 * literal lives here so detection and its tests reference one source. See
 * computeHumanFoodProvenance.
 */
export const HUMAN_FOOD_FORMAT = 'human_food' as const

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
  /**
   * The food's FULL captured protein set (`food_items.proteins`, B-351 slice 1) — the
   * hidden secondary exposure that primary-only capture drops on the floor. The
   * "duck" novel-protein food that also lists chicken by-product meal is the textbook
   * elimination-trial contaminant, and until slice 6 it entered this engine as pure
   * duck.
   *
   * Read through `readProteinSet(proteins, primaryProtein)`, NEVER used raw: that
   * helper hoists the owner-designated primary to position 0 and keys every member
   * through `canonicalizeProtein` — the SAME Class-A-only read key the client's
   * disclosure and off-trial checks use (D3a). Absent/null/empty ⇒ the set degrades
   * to `[primaryProtein]`, i.e. byte-identical to pre-B-351 behavior, which is what
   * keeps every existing detection test green.
   */
  proteins?: string[] | null
  /** WSAVA intake rating; null for legacy/unrated rows or non-meal foods (treats/other). */
  intakeRating: IntakeRating | null
  /** food_items.food_type — only 'meal' contributes to the intake baseline (migration 010/011). */
  foodType: 'meal' | 'treat' | 'other' | null
  /**
   * food_items.format physical-form value (B-102 PR 5). Detectors ①–⑥ and the coverage
   * diagnostics IGNORE this field — populating it is byte-identical to today's behavior for
   * every existing detector. Its only consumer is the human-food provenance covariate
   * (computeHumanFoodProvenance), which reads format==='human_food' as an off-commercial-diet
   * day marker. Absent/null ⇒ unknown format, treated as NOT human-food — a faithful,
   * never-reassure default: the missing marker is never evidence the pet ate only commercial
   * food (absence ≠ wellness, §9).
   */
  format?: FoodFormat | null
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
  /**
   * This meal/treat was the VEHICLE for a co-logged medication dose (B-156 combo; the
   * caller sets it true when this event's id appears as `paired_event_id` on a non-
   * soft-deleted `medication_administrations` row). A pill hidden in a Delectable makes
   * the owner experience ONE act, but Nyx stores TWO events — a meal AND a dose — and the
   * food and the drug are then COLLINEAR by construction for that exposure: you cannot
   * statistically separate "the chicken did it" from "the Zyrtec in the chicken did it".
   *
   * So the engine attributes a vehicle exposure to the DRUG, not the food (B-156 PR C1):
   * detectCorrelations DROPS this meal's protein from the case/control exposure set (the
   * drug enters separately as a MedicationWindow), so a vehicle food never builds a
   * food→symptom case on the strength of an exposure it only had because it carried a pill.
   *
   * This is a PER-EXPOSURE drop, deliberately UNLIKE a free-fed protein (which is excluded
   * from candidacy WHOLESALE because it is ALWAYS present): the SAME food logged WITHOUT a
   * pill on another day is a clean, fully-creditable exposure. The flag lives on the
   * exposure, never on `food_items` — exactly the per-event shape B-156 §3 chose so a
   * Recent re-add of the bare treat carries no phantom drug.
   *
   * Absent/false ⇒ today's behavior is BYTE-IDENTICAL (detectors ②–⑥ and the coverage
   * diagnostics ignore it; only detectCorrelations' windowExposures reads it).
   */
  isMedicationVehicle?: boolean
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
  /**
   * The free-fed food's FULL captured protein set (B-351 slice 6). EVERY protein a
   * standing bowl carries is uncontrolled background, so every one of them is
   * excluded from candidacy — not just the one on the front of the pack. A bowl of
   * "duck" kibble that also lists chicken must exclude chicken too, or the engine
   * would happily build a chicken→symptom case out of an exposure that was standing
   * all along. Read through the same `readProteinSet` path as meals (ONE key).
   * Absent/null ⇒ degrades to `[primaryProtein]`, unchanged behavior.
   */
  proteins?: string[] | null
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

/**
 * A medication exposure window (B-117 PR 9, spec §8) — "was a drug plausibly ON BOARD
 * during this span?". Medications enter the correlation engine as CONTEXT/CONFOUNDERS,
 * never as correlates: the unit of analysis is still the food→symptom association; a drug
 * never becomes a finding. The point is to stop the §1 false attribution — a "chicken →
 * vomit" card that is really "antibiotic → nausea", which makes a diet trial "fail" for the
 * wrong reason.
 *
 * Like B-040 free-feeding, two physical shapes both reduce to this ONE span type, and the
 * caller (generate-signal/index.ts) resolves both:
 *   • a REGIMEN (a `medications` row) → a continuous span [started_at, ended_at] — the drug
 *     is on board for the whole course, BETWEEN doses, robust to un-logged doses (a missing
 *     dose log ≠ the drug was off — conservative-on-certainty). DATE columns: the caller
 *     passes started_at as the day's start and ended_at as END-OF-DAY-inclusive, so the
 *     engine sees precise instants and never has to guess DATE-vs-timestamp (this is why
 *     classifyMedicationWindows, unlike classifyArrangements, does NOT add a day itself).
 *   • a DOSE (an administered `medication_administrations` event) → a POINT [occurred_at,
 *     occurred_at]. A point behaves exactly like a meal exposure: it is "in window" iff the
 *     dose was given within the symptom's own correlation window before onset. This is the
 *     dominant signal TODAY, since logged doses are regimen-unlinked (B-135). Build it via
 *     doseToMedicationWindow, which DROPS missed/refused doses (the drug was NOT given — see
 *     that helper). ACCEPTED RESIDUAL (B-138, adversarial review): a once-daily LONG-ACTING,
 *     regimen-unlinked drug dosed > W hours before onset is invisible to the point model (it
 *     UNDER-detects the confounder → a false food correlation can slip through). Safe direction
 *     — never reassurance, degrades to today's no-medication behavior; the regimen SPAN is the
 *     robust fix once a regimen exists. A dose-persistence/tail is the alternative (a Dr. Chen
 *     window-shape call, composes with the B-135 revisit).
 *
 * `medicationItemId` is carried per the spec ("correlation keys on the stable
 * medication_item_id", which sidesteps the B-052 free-text canonicalization problem). v1
 * SUPPRESSION is deliberately IDENTITY-AGNOSTIC — ANY drug on board confounds, because we
 * have no curated drug→side-effect data to say a given drug is GI-irrelevant (a curated
 * catalog is an explicit future refactor, spec §10). The id is retained for a future
 * per-drug caveat ("the antibiotic may be a factor") and as the audit key; the v1 logic
 * never branches on it. CONTRACT: the caller passes non-soft-deleted events only; absent/
 * empty ⇒ detection behaves EXACTLY as before (byte-identical — detectors ②–⑥ ignore it,
 * and detectCorrelations short-circuits on an empty set).
 */
export interface MedicationWindow {
  /** Stable drug identity (medication_item_id), or null for an unlinked ad-hoc dose. Audit/future-caveat only — v1 suppression is identity-agnostic. */
  medicationItemId: string | null
  /** Inclusive span start (ISO-8601 UTC). Null = unbounded past (on board since before lookback). For a dose: the dose time. */
  activeFrom: string | null
  /** Inclusive span end (ISO-8601 UTC). Null = still on board (through now). For a dose: the same instant as activeFrom (a point). */
  activeUntil: string | null
}

/**
 * Per-incident AI-analysis projection for the red-flag lane (B-340) — the owner-editable
 * structured clinical fields from an `event_ai_analysis` row, one per analyzed incident.
 * detectIncidentRedFlags derives the escalating VISUAL flag (blood / foreign material) from
 * THESE fields — never the cached `visual_flags`/`recommendation` array, which the client edit
 * path deliberately does NOT refresh on an owner override (lib/analysis.ts / B-339). Deriving
 * from the structured fields is what makes an owner override that clears the fact clear the Home
 * card BY CONSTRUCTION — the same derivation generate-report already uses (unionPresentFlags),
 * so the two override-aware surfaces agree.
 *
 * CONTRACT: the caller passes only rows whose analyzed event is NON-soft-deleted and within the
 * lookback (the join is in generate-signal/index.ts). Values are the raw enum strings from the DB;
 * the pure derivation keeps the present-only asymmetry in one tested place (deriveIncidentFlags).
 * Scope is vomit (B-340) AND stool (B-364) — `incidentCategory()` maps the raw incident_type to a
 * family, and the derivation reads the family's OWN blood column (the seam: vomit blood is
 * `blood_present`, stool blood is `stool_blood_present` — a DIFFERENT column; reading the wrong one
 * silently drops a bleed). Any other family (itch/scratch/…) has no lane and is ignored.
 */
export interface IncidentAnalysisInput {
  /** The analyzed event's id (audit / future evidence expansion; the finding does not carry it in v1). */
  eventId: string
  /**
   * The raw `event_ai_analysis.incident_type`: 'vomit' | 'stool_normal' | 'diarrhea' | … . Mapped to
   * a coarse family by `incidentCategory()`; the derivation and detector key off the family, never
   * this raw string directly (so both stool event types are handled and mislabelling is impossible).
   */
  incidentType: string
  /** ISO-8601 UTC occurred_at of the incident (from the joined events row) — the recency anchor. */
  occurredAt: string
  /**
   * VOMIT blood — `event_ai_analysis.blood_present` (vomit_blood): 'none_visible'|'fresh_red'|
   * 'coffee_ground'|'unsure'|null. PRESENT-ONLY escalation — only 'fresh_red'/'coffee_ground' is a
   * red flag; every other value (incl. 'unsure' and null) is NOT (absence is never manufactured; §9).
   * Read ONLY for the 'vomit' family (stool blood lives in `stoolBloodPresent`).
   */
  bloodPresent: string | null
  /**
   * STOOL blood — `event_ai_analysis.stool_blood_present` (stool_tristate): 'yes'|'no'|'unsure'|null
   * (migration 034). PRESENT-ONLY escalation — only 'yes' is a red flag. Keyed on PRESENCE, not the
   * `stool_blood_type` subtype (fresh_red haematochezia vs dark_tarry melena only refines the vet
   * report's copy — a present-but-unread subtype is still blood), mirroring generate-report's
   * `stoolUnionPresentFlags`. Read ONLY for the 'stool' family.
   */
  stoolBloodPresent: string | null
  /**
   * `event_ai_analysis.foreign_material_present` (vomit_tristate): 'yes'|'no'|'unsure'|null. SHARED
   * across families — the 013 column is reused for stool (migration 034: "a sock is a sock"), so the
   * derivation reads it for both. PRESENT-ONLY — only 'yes' is a red flag; 'no'/'unsure'/null is NOT.
   */
  foreignMaterialPresent: string | null
}

/** A logged dose reduced to what doseToMedicationWindow needs (the caller's DB-row projection). */
export interface DoseEventInput {
  medicationItemId: string | null
  /** ISO-8601 UTC administration time (the parent event's occurred_at). */
  occurredAt: string
  /** dose_adherence value; null defaults to administered ('given', per the §5.1 capture default). */
  adherence: string | null
  /**
   * B-156 PR C1 / B-174 — the intake rating of this dose's paired VEHICLE meal/treat, when
   * the dose is a combo (rode inside a co-logged food). null/absent ⇒ a STANDALONE dose (no
   * vehicle) OR a vehicle whose intake we can't see (deleted / out-of-lookback) — both keep
   * today's §5.1 default. Only present for a combo whose vehicle is in the analysis set. It
   * reconciles the one place B3's `null` adherence and the §5.1 `null` default collide — see
   * doseToMedicationWindow.
   */
  pairedVehicleIntake?: IntakeRating | null
}

/**
 * Resolve a logged dose to a medication exposure POINT, or null when the dose was NOT
 * administered. This is the one clinically load-bearing transform in the medication
 * mapping, so it is a pure, exported, unit-tested function rather than inline I/O:
 *
 *   • given / partial / null  → the drug WAS on board → a point window at the dose time.
 *     (null defaults to administered: the capture UI defaults adherence to 'given', and a
 *     logged dose with no rating is a logged administration, not an absence.)
 *   • missed / refused        → the drug was NOT given → null, NEVER an exposure window.
 *     Modelling a non-administration as drug-presence would let a FORGOTTEN antibiotic
 *     suppress a real food finding — a false negative we would never see. (refused is also
 *     a disease signal handled elsewhere, §6.2; here it simply means "not on board".)
 *
 * B-156 PR C1 / B-174 — the in-doubt COMBO dose. B3 couples a combo dose's adherence to its
 * vehicle: when the owner marks the carrier food refused/picked and never explicitly confirms
 * the drug, the dose lands `null` ("unconfirmed", not "given"). But the §5.1 default above
 * reads a bare `null` as administered — so the two layers disagree on what `null` means (the
 * exact collision B-174 was filed to resolve at this gate). We resolve it HERE, where the
 * vehicle intake is in hand: a `null`-adherence dose whose paired vehicle was refused/picked
 * is NOT on board (the carrier wasn't eaten → the pill in it most likely wasn't delivered),
 * so it yields no window — exactly as a refused dose does. This is scoped as narrowly as the
 * collision: it requires a refused/picked VEHICLE (only a combo has one), so a STANDALONE
 * `null` dose is untouched (no pairedVehicleIntake ⇒ still administered), and an EXPLICIT
 * owner answer overrides it (adherence is then non-null — `given`/`partial` falls through to a
 * window, the "I pilled her directly after she spat the treat" case; `missed`/`refused` was
 * already dropped above). A `some`/`most`/`all` vehicle keeps the §5.1 default (on board),
 * matching B3's own adherence default and its documented `some`-edge known-limit (B-173).
 * ACCEPTED RESIDUAL (safe direction, sibling of B-138a): if the owner DID pill directly but
 * never answered the card, the dose stays `null` and we under-count the confounder — never a
 * false reassurance, only the risk of a spurious food card; the owner can mark it `given`.
 *
 * An unparseable time still yields a window (activeFrom/Until = the raw string);
 * classifyMedicationWindows drops it downstream, so the same Date.parse guard isn't
 * duplicated here.
 */
export function doseToMedicationWindow(dose: DoseEventInput): MedicationWindow | null {
  if (dose.adherence === 'missed' || dose.adherence === 'refused') return null
  // B-174: an UNCONFIRMED combo dose (adherence still null) whose vehicle the owner marked
  // refused/picked → the carrier wasn't eaten → the drug most likely wasn't delivered → not
  // on board. Requires both an unanswered (null) adherence AND a refused/picked vehicle, so
  // standalone null doses and explicitly-answered combo doses are untouched.
  if (
    dose.adherence == null &&
    (dose.pairedVehicleIntake === 'refused' || dose.pairedVehicleIntake === 'picked')
  ) {
    return null
  }
  return {
    medicationItemId: dose.medicationItemId,
    activeFrom: dose.occurredAt,
    activeUntil: dose.occurredAt,
  }
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
   * Medication exposure windows for this pet (B-117 PR 9, §8) — regimen spans + administered
   * dose points, see MedicationWindow. They are CONFOUNDERS on the food→symptom correlation,
   * not correlates: a drug case-enriched across a symptom's matched pairs SUPPRESSES that
   * symptom's food correlations (the §1 "antibiotic, not chicken" case); a drug merely PRESENT
   * but concordant (chronic steady-state) caps the tier at Early (§8 "caveated"). Optional —
   * absent/empty means no medication context and detectCorrelations behaves exactly as before.
   * Only detectCorrelations reads this; ②–⑥ ignore it (like feedingArrangements). CONTRACT: the
   * caller passes non-soft-deleted events and EXCLUDES missed/refused doses (doseToMedicationWindow).
   */
  medicationWindows?: MedicationWindow[]
  /**
   * Pet owner's IANA timezone (e.g. 'America/New_York'), from user_profiles.timezone —
   * Phase 2 (⑥ time-of-day clustering) ONLY. Timestamps are stored UTC; "4–7am" only means
   * something in the pet's local day, so ⑥ converts onset instants to local hour-of-day with
   * this zone. ABSENT/invalid ⇒ ⑥ is silent (never guess UTC — §4.2). Detectors ①–⑤ ignore
   * it, so omitting it is byte-identical to today's behavior.
   */
  timezone?: string
  /**
   * Per-incident AI-analysis red-flag inputs (B-340) — the owner-editable structured clinical
   * fields from event_ai_analysis for this pet's analyzed incidents. detectIncidentRedFlags
   * derives the escalating VISUAL flag (blood / foreign material) from these fields (NEVER the
   * cached visual_flags array — B-339 / clinical-guardrails), so an owner override that clears a
   * field clears the Home card by construction. Optional — absent/empty ⇒ the red-flag detector is
   * SILENT (byte-identical to pre-B-340; detectors ①–⑦ ignore this field entirely). CONTRACT: the
   * caller passes only rows whose analyzed event is non-soft-deleted and within the lookback.
   */
  incidentAnalyses?: IncidentAnalysisInput[]
  /**
   * The pet's ACTIVE diet trial (Signals v2 / CUL-8, L2) — the ONLY input the trial-response
   * lane reads beyond events/meals. Carries just what L2 needs to place its two windows and
   * count the day: the trial's `startedAt`, its `targetDurationDays` (the ONLY authority on
   * length — never derived, per the diet-trial spec), and optionally `status`/`endedAt` so the
   * one predicate `isTrialRunning` can withdraw the lane from a terminal trial. Optional —
   * absent ⇒ `detectTrialResponse` is SILENT (byte-identical to pre-CUL-8; detectors ①–⑧ ignore
   * this field entirely). CONTRACT: the caller passes the single active row (the same one it
   * derives `pet.dietTrialActive` from) or omits the field; L2 re-checks `isTrialRunning` itself.
   */
  dietTrial?: DietTrialInput
  /** Reference "now" (ISO-8601 UTC), injected so detection is deterministic and testable. */
  now: string
}

/**
 * The active diet trial as the trial-response lane (L2) sees it — a plain-data projection of the
 * `diet_trials` row, carrying only the window + day-count inputs. `isTrialRunning` (the one B-422
 * predicate) gates the lane on it, so a trial past its effective end withdraws the lane rather
 * than comparing a stale window. `targetDurationDays` is the ONLY authority on the trial's length
 * (the "day N of M" M); it is never derived from the elapsed days.
 */
export interface DietTrialInput {
  /** 'YYYY-MM-DD' (the DATE column) or ISO — day 1 of exclusive feeding (§5.1). */
  startedAt: string
  /** The trial's prescribed length (the "of M" in "day N of M"). Null/absent ⇒ no target shown. */
  targetDurationDays?: number | null
  /** Optional; a terminal status withdraws the lane. Absent ⇒ the caller's query established active. */
  status?: string | null
  /** Optional owner-authored early end; honoured by `isTrialRunning` (ends the lane earlier). */
  endedAt?: string | null
}

// ── Finding types (§4/§5) ───────────────────────────────────────────────────

export type InsightType =
  | 'food_symptom_correlation'
  | 'intake_decline'
  | 'reflection'
  | 'symptom_worsening'
  | 'symptom_chronicity'
  | 'postprandial_timing'
  // Signals v2 (B-755 / CUL-7): the empty-stomach ≥6h lane (L1, the ⑤ mirror) and the
  // composition-only `timing_story` that merges same-symptom ⑤ + L1 into one A2 card face.
  // `empty_stomach_timing` is a DETECTOR output (registered like ⑤); `timing_story` is emitted
  // ONLY by composeTimingStory (never a detector, never in DETECTOR_REGISTRY). Both are dark:
  // Signals v2 changes are inert until PR 10 redeploys (G10) behind the `signals_v2` client flag.
  | 'empty_stomach_timing'
  | 'timing_story'
  // Signals v2 (B-755 / CUL-8): the trial-response lane (L2, the wedge). A trial-era-vs-baseline
  // count comparison over logged-days denominators — pooled symptom burden + per-phenotype vomit
  // timing + diet-structure context. Emitted ONLY when the pooled contrast "changed materially"
  // (§8.5 trigger, adversarial-reviewed). Dark: inert until PR 10's gated redeploy (G10).
  | 'trial_response'
  // Signals v2 (B-755 / CUL-10): the L4 gap-shortening lane — inter-episode gaps per symptom type,
  // fired ONLY on a shortening run (escalate-only; lengthening renders nothing, G5). Surfaces as a
  // QUIET watching/insight row (the D2 frame), never a full card. Dark: inert until PR 10's gated
  // redeploy (G10) — the shipped client renders an unknown finding type as null (the PR-1 pin).
  | 'gap_shortening'
  | 'timeofday_clustering'
  | 'incident_red_flag'

/** Safety/concern always leads (§5); everything else is an insight. */
export type PriorityClass = 'safety' | 'insight'

/** Confidence tier for correlation findings (§6). Safety flags carry no tier. */
export type EvidenceTier = 'early' | 'established'

interface FindingBase {
  type: InsightType
  priorityClass: PriorityClass
}

/**
 * SR-4 additive payload (B-721, `docs/nyx-signal-home-requirements.md` §5.4) — the
 * medication-on-board CONTEXT for a correlation / timing card: "During an active {drug}
 * course — {n} doses logged." A CONTEXTUAL fact, never an explanation and never a
 * verdict (§5.4: "Stated as fact … no verdict adjacency"). Computed POST-detection in
 * the I/O shell (index.ts) from the same medication data the confounder pass already
 * reads (`computeMedOnBoard`, medContext.ts) and attached to the finding; it is NEVER
 * read by any detector and cannot change what fires or how it ranks. Optional: a finding
 * cached before SR-4, or one with no active course in-window, simply carries no field.
 */
export interface MedOnBoardContext {
  /** Owner-facing drug name — the regimen's `drug_name` (preferred), else the library brand/generic. */
  drugLabel: string
  /** Administered on-board doses of this drug in the context window (missed/refused/in-doubt excluded, matching the confounder pass). ≥1. */
  doseCount: number
}

/**
 * SR-4 additive payload (B-721 §3.3) — the week-over-week LOGGING-DENSITY comparison that
 * gates a FALLING reflection's comparison clause. "days-with-any-log" per window; the
 * asymmetric gate (§3.3) withholds a falling reflection's "down from N last week" when
 * density is NOT comparable (fail-toward-escalation: a quieter-looking week may just be a
 * less-logged one). A RISING safety comparison is never gated — reflection is flat/falling
 * only, and worsening (④) is a different finding this never touches. Computed post-detection
 * (`computeReflectionDensity`) and attached to the reflection finding; carries the raw day
 * counts so the client (SR-5) can render the expanded disclosure line. Optional: absent ⇒
 * the template renders exactly as before SR-4 (byte-identical), so old cached findings and
 * the flag-off path are unaffected.
 */
export interface ReflectionDensity {
  /** Whether the two weeks' logging density is comparable enough to trust a falling comparison (§3.3). */
  comparable: boolean
  /** Distinct UTC days carrying ANY logged event in the CURRENT window ("{a} this week"). */
  currentLoggingDays: number
  /** Distinct UTC days carrying ANY logged event in the PRIOR window ("{b} last"). */
  priorLoggingDays: number
}

/**
 * L3 photo-record composition (Signals v2 / B-755 / CUL-9) — ONE evidence field: a numerator
 * ("yes" reads) over its OWN "reads that answered this question" denominator (§2 L3). The
 * denominator is NEVER the raw episode count — it is the photographed-and-analyzed episodes
 * whose read gave a yes-or-no on THIS specific marker (tristate discipline: `unsure`/`no`/absent
 * are out of the numerator, and `unsure`/absent are out of the denominator too). Both counts ride
 * to the client (CUL-12 / PR 5), which renders "seen in {count} of {denominator} photographed
 * episodes"; the count and denominator travel together so no fraction is ever quoted over a
 * denominator that includes reads which could not answer.
 */
export interface PhotoCompositionField {
  /**
   * The numerator — photographed-and-analyzed episodes whose completed read AFFIRMS the marker
   * (`yes`). PRESENT-ONLY across the whole L3 payload: a field is attached ONLY when this is ≥1,
   * so a zero is SILENCE, never "0 of N" (G4 — photo facts never reassure; a hair count of zero is
   * unrepresentable by construction, the same structural guarantee incident_red_flag makes).
   */
  count: number
  /**
   * The "reads that answered this question" denominator — photographed-and-analyzed episodes whose
   * read returned a definite yes OR no on this marker (§2 L3). ALWAYS ≥ `count` (a `yes` is itself
   * an answered read), and ≥1 whenever the field is attached. `unsure`/illegible/absent reads are
   * excluded from BOTH, so the fraction is honest about what the camera could actually resolve.
   */
  denominator: number
}

/**
 * L3 photo-record composition context (Signals v2 / B-755 / CUL-9, §2 L3) — additive EVIDENCE on a
 * vomit timing finding, NOT a finding type and never a fire gate. Computed POST-detection in the I/O
 * shell (index.ts → computePhotoComposition, photoComposition.ts) from the SAME `event_ai_analysis`
 * rows the red-flag lane reads (status `completed` only), attached by `decorateFinding`; NEVER read
 * by any detector, so it cannot change what fires or how it ranks. Every field is PRESENT-ONLY
 * (attached only when its `count` ≥ 1), so an absent field is silence and the flag-off / pre-L3 /
 * no-photo paths are byte-identical. The vet interprets — descriptors travel, the label never does
 * (§2 L3): there is deliberately no "empty stomach" / "bilious" / "regurgitation" verdict here, only
 * counted, denominatored sightings.
 */
export interface PhotoComposition {
  /**
   * Recognizable/partially-digested food in the LONG band — episodes ≥ `longGapHours` post-meal
   * (the finding's own long-episode set) whose completed read shows `undigested_food` or
   * `partially_digested_food`. Food still recognizable long after eating is the notable fact; the
   * denominator is the photographed long-band episodes that answered the food question. Present only
   * on findings that HAVE a long band (empty_stomach_timing / timing_story) — ⑤'s rapid-only card
   * carries no long onsets, so this is absent there.
   */
  retainedFood?: PhotoCompositionField
  /**
   * Hair in the completed vomit reads. HAIR NEVER REASSURES (G4 — Cannon: frequent hairballs are
   * themselves a disease marker, his "regularly" = ≥2/year), which is exactly why the whole L3
   * payload is present-only: a hair field appears only when hair was actually seen, so nothing here
   * can ever read as "no hairballs, all clear". Owner-facing copy (client, CUL-12) is regex-screened.
   */
  hair?: PhotoCompositionField
  /**
   * Bile in the completed vomit reads, keyed on the AUTHORITATIVE `bile_present` tristate (migration
   * 013 keeps bile out of the bulk `contents` matrix precisely so the two can't drift), with a
   * `contents`-listed bile sighting folded in as a present-wins yes. An empty-stomach marker carried
   * as a descriptor, never the "bilious" label (that is the vet's inference — MECHANISM_RE bars it).
   */
  bile?: PhotoCompositionField
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
  /**
   * OWNER-FACING LABEL for the candidate — a single protein (`chicken`) or, for a
   * JOINT candidate, the whole cluster named together (`chicken and duck`).
   *
   * This field is a LABEL, never a key. Making it the joint label rather than a
   * representative member is the deliberate safe-degradation choice (B-351 slice 6):
   * every reader that predates the cluster — the shipped client's evidence text, the
   * vet report's `timingLine`, any cached row — renders it verbatim, so the WORST an
   * un-updated surface can do is name both proteins without the can't-separate
   * caveat. Had `protein` stayed a representative member, those same surfaces would
   * have silently credited ONE collinear protein and exonerated its twin by omission
   * — the exact false attribution §7 #2 exists to prevent, leaking through a field
   * nobody thought to update.
   */
  protein: string
  /**
   * The candidate's protein CLUSTER — canonical keys, ascending. Length 1 for an
   * ordinary finding; length ≥2 for a JOINT candidate (see `jointCandidate`). This
   * is the machine-readable form of `protein`; consumers that need keys read this.
   */
  proteins: string[]
  /**
   * `proteins.length > 1` — these proteins are statistically INSEPARABLE in this
   * pet's logged diet, so the engine reports them together and credits none of them
   * individually. See `clusterCollinearProteins` for what "inseparable" means
   * exactly (identical exposure vectors ⇒ identical test statistic).
   */
  jointCandidate: boolean
  /**
   * For a JOINT candidate: which resolving action the copy is allowed to offer. Resolved
   * HERE, in the deterministic engine, exactly as `WorseningTier` and `StapleSource` are —
   * copy renders the decision, it never makes it. `null` when the candidate is not joint.
   *
   * `'feed_apart'` — the normal case. Separating the proteins is the one manipulation that
   * can break the collinearity, so the card says so.
   *
   * `'ask_vet'` — the pet is on an ACTIVE diet trial. "Feed one without the other" is then
   * an instruction to break a vet-directed elimination diet, on a card that
   * `priorityBand` deliberately promotes to the LEAD slot for trial pets — so the most
   * dangerous version of this copy would reach precisely the owner it can hurt most, and
   * §7 #6 predicts joint candidates are MOST likely for a strict single-food trial dog.
   * `detectStapleWashout` already refuses to fire on trial pets for the weaker version of
   * this harm ("implies the owner should vary it — sabotaging the trial and inverting
   * Pets > $"); the joint card does not imply it, it instructs it. The finding is NOT
   * suppressed — a correlation is the wedge insight for a trial pet, and dropping it would
   * hide a real signal — only its action clause is replaced by routing to the vet, who is
   * the one person who can change a prescribed diet.
   */
  jointGuidance: 'feed_apart' | 'ask_vet' | null
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
   * Weakest attribution among this candidate's exposures, across BOTH arms and (for a
   * joint candidate) across every cluster member. 'low' means a
   * shared / unattributed bowl was implicated → the finding is CAPPED at Early, never
   * Established (we can't be sure this pet ate it). Single-cat / hand-fed = 'high'.
   */
  attributionFloor: AttributionConfidence
  /** Hard marker for the phrasing layer + reviewers: never emit causal copy. */
  associationalOnly: true
  /**
   * SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read
   * by the engine). Present only when a nameable drug had ≥1 administered dose in the
   * context window; absent otherwise. See MedOnBoardContext.
   */
  medContext?: MedOnBoardContext
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
  /**
   * B-213 — occurred_at (ISO) of the most recent FULLY-eaten meal (intake `all`), or null
   * when none exists in the window. The conservative "last full meal" anchor for "how long
   * off food?" — the number that sets urgency, esp. inside the feline hepatic-lipidosis
   * window. Deliberately the strictest rating (never a nibble): counting a partial meal as
   * "full" would UNDER-state time-since-a-real-meal, the ONE error direction a never-reassure
   * intake lane must avoid. Trigger-independent (computed once over the rated meals), so a
   * refusal and a consecutive-low both carry the same honest anchor. A null here is itself an
   * escalating fact ("no full meal recorded"), never softened. The report layer derives the
   * span; this stays a raw structured fact (no Date.now-relative arithmetic in the finding).
   */
  lastFullMealIso: string | null
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
  /**
   * SR-4 (B-721 §3.3) — week-over-week logging-density comparison, attached POST-detection
   * (never read by the engine). Gates the FALLING comparison clause in templateReflection.
   * Absent ⇒ the template renders exactly as before SR-4. See ReflectionDensity.
   */
  density?: ReflectionDensity
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
 * Copy-urgency tier for a chronicity finding (detector ⑦, B-182). Anchored on DURATION
 * (chronicity's natural urgency axis), NOT the week-over-week delta (that is ④'s axis):
 *   - 'firm'     — a long course (`spanDays ≥ firmSpanDays`, ≥6 weeks): "...worth booking
 *                  a vet visit." Also inherited (PR 2) when the same symptom is ALSO worsening
 *                  week-over-week — the §4.5 valve coupling, applied in the composition layer
 *                  (suppressWorseningWhenChronic), NOT in resolveChronicityTier (which stays
 *                  pure/span-only and has no view of the worsening findings).
 *   - 'standard' — a present-and-recurring course (span in [minSpanDays, firmSpanDays)):
 *                  "...worth a word with your vet."
 * There is deliberately NO 'soft' register (one fewer than ④): a symptom recurring for
 * ≥3 weeks always points at the vet — the gentlest chronicity register still does (§4.6).
 * Resolved in the deterministic engine (where it is adversarially reviewed), never in copy.
 */
export type ChronicityTier = 'standard' | 'firm'

/**
 * Symptom-chronicity / persistence (⑦, B-182) — the SAFETY-class lane that fires on
 * DURATION + SUSTAINED BURDEN + STILL-ONGOING, orthogonal to ④'s week-over-week DELTA
 * axis. It is the symptom-axis statement "this is not a passing thing": six weeks of
 * roughly-every-other-day vomiting reaches the owner today as ④'s "up from 2 last week"
 * (a bump) or ③'s calm "same as last week" (a flat reflection) — neither says the true,
 * important sentence "this has been going on for weeks and is not resolving" (re-run
 * council deep-dive §9 #1, Finding 2/3). ⑦ says it.
 *
 * Purely DESCRIPTIVE duration/frequency — NO causal claim (that is ①/⑤), NO mechanism,
 * NO severity verdict, NO diagnosis. It NEVER reassures (it is a safety finding) and its
 * ABSENCE is silence, not wellness — the cardinal requirement is that a flat or
 * improving-looking chronic course must never read as reassurance (§4.7). The recency
 * floor (`daysSinceLastEpisode ≤ ongoingRecencyDays`) makes the word "ongoing" honest:
 * a settled course falls SILENT and emits NO resolution copy (never "seems to have
 * settled"), the §4.7 mirror of ④'s "absence is silence". Template-only phrasing, like
 * ③/④/⑤/⑥ — the model never phrases it (itself a structural never-reassure guarantee).
 *
 * Fires on the §4.3 conjunction (span AND episodes AND active-weeks AND recency floors,
 * plus the coarse logging-eligibility guard) — the same episode-collapsing and honesty-
 * floor philosophy ④ obeys, but a long-span persistence test, not a two-window delta.
 * Runs on LANE_SYMPTOM_TYPES.chronicity (chronic diarrhea / pruritus are as real as
 * chronic vomiting — differs from ⑤'s vomit-only scope, matches ③/④; cough joins this
 * cell, and only this cell, in 3b session 2). Surfaces at most ONE card (the
 * most-chronic symptom) so the safety surface stays calm.
 */
export interface SymptomChronicityFinding extends FindingBase {
  type: 'symptom_chronicity'
  priorityClass: 'safety'
  symptomType: SymptomType
  /** Collapsed episodes in the lookback. ≥ chronicity.minEpisodes. */
  episodeCount: number
  /** First→last onset span, in whole days. ≥ chronicity.minSpanDays. */
  spanDays: number
  /** Phase-stable distribution count: distinct ~weekly periods carrying an episode (not two endpoints, not `now`-dependent — B-188). ≥ minActiveWeeks. */
  activeWeeks: number
  /** Distinct UTC symptom-days (density/evidence detail). */
  symptomDays: number
  /** Days since the most-recent episode. ≤ ongoingRecencyDays (the "still ongoing" gate). */
  daysSinceLastEpisode: number
  /** ISO-8601 UTC of the first logged onset in the lookback — powers "since {month}" copy. */
  firstOnsetIso: string
  /** Resolved urgency tier (duration-anchored — see ChronicityTier). */
  tier: ChronicityTier
  /** The lookback in days (the "{windowWeeks} weeks" denominator). */
  windowDays: number
  /** Hard marker for the phrasing layer + reviewers: duration/frequency only, never causal. */
  associationalOnly: true
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
  /**
   * Signals v2 (B-755 / CUL-7) — the onset instants (ms) of the RAPID episodes ⑤ fired on.
   * Read ONLY by the composition layer's episode-set-aware ⑤-suppresses-⑥ rule
   * (suppressTimeOfDayWhenPostprandial): ⑤ suppresses a clock finding only when ⑥'s cluster
   * episodes ARE these meal-adjacent ones (deep-dive F1). Optional so a pre-v2 finding (or a
   * synthetic test finding) without it falls back to the shipped unconditional suppression.
   */
  rapidEpisodeOnsets?: number[]
  /**
   * SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read
   * by the engine). Present only when a nameable drug had ≥1 administered dose in the
   * context window; absent otherwise. See MedOnBoardContext.
   */
  medContext?: MedOnBoardContext
  /**
   * L3 (Signals v2 / B-755 / CUL-9 §2 L3) — photo-record composition EVIDENCE, attached
   * POST-detection (never read by the engine). Present-only; on ⑤ it carries hair/bile over the
   * window's photographed vomits (no `retainedFood`: the rapid card has no long band). See PhotoComposition.
   */
  photoComposition?: PhotoComposition
}

/**
 * Empty-stomach timing (L1, Signals v2 / B-755 / CUL-7 — the ⑤ mirror). The COMPLEMENT of ⑤:
 * of the vomiting episodes we could TIME (the identical eligibility ladder — witnessed onset,
 * a timed-eligible feeding in the 24h lookback, not free-fed), how many happened ≥ `longGapHours`
 * (6h — §0 D10, feline gastric-emptying anchor) AFTER the last feeding. Where ⑤ isolates the
 * mechanical post-prandial band (≤30 min), L1 isolates the long-fast band — the phenotype behind
 * early-morning bile/foam vomiting. Same denominator as ⑤ (`classifyEpisodeSet`, G9), so the two
 * lanes are two readings of ONE timing distribution and merge cleanly into `timing_story`.
 *
 * ASSOCIATIONAL / anamnesis ONLY, exactly like ⑤: owner copy names the TIMING BAND, never the
 * syndrome ('BVS'/'bilious'/'empty stomach' are the vet's inference — banned by MECHANISM_RE),
 * never a food/form (§9.1 — forms ride `feedingFormsInEvidence`), never a bedtime-snack /
 * feeding-schedule SUGGESTION (G3 — the lane reports, the vet manages). Never inverted: a
 * below-floor result is SILENCE, never "her vomiting isn't empty-stomach".
 *
 * The base-rate defense is the ⑤ grazing-guard's MIRROR (see detectEmptyStomachTiming): a cat fed
 * twice daily is ≥6h post-meal ~half the day, a once-daily cat ~three-quarters — so a fixed
 * fraction floor cannot separate a real pattern from the schedule's chance rate. The empty-stomach
 * guard gives each episode its OWN local long base rate and asks the Poisson-binomial upper tail
 * whether the observed long count exceeds what those per-episode schedules would produce by chance,
 * so a once/twice-daily feeder whose vomits merely match its schedule stays silent (the property
 * sweep at 6h locks the fraction floor and this guard — CUL-7).
 */
export interface EmptyStomachTimingFinding extends FindingBase {
  type: 'empty_stomach_timing'
  priorityClass: 'insight'
  symptomType: SymptomType
  /** Eligible episodes whose nearest preceding feeding was ≥ longGapHours before onset (the numerator). */
  longCount: number
  /** The honest denominator: timed-eligible episodes — the SAME set ⑤ counts (shared `minEligibleEpisodes`). */
  eligibleCount: number
  /** The full three-band split over the eligible denominator (rapid ≤30m / mid / long ≥6h) — the A2 face. */
  bandCounts: { rapid: number; mid: number; long: number }
  /** All in-window vomit episodes (any confidence) — so evidence can say "of N total, M could be timed". */
  totalEpisodes: number
  /** The empty-stomach band boundary in HOURS (6; feline gastric-emptying anchor, §0 D10). */
  longGapHours: number
  /** The two most-recent eligible episodes are BOTH long — powers recency salience, ⑤'s `lastTwoEligibleRapid` mirror. */
  lastTwoEligibleLong: boolean
  /** Median HOURS-since-feeding across the long episodes — the actual observed timing (evidence + vet report). */
  medianHoursSinceFeeding: number
  /** Forms of the feedings before the long episodes — EVIDENCE/vet-report ONLY, never the claim (§9.1). */
  feedingFormsInEvidence: string[]
  /**
   * Clock concentration of the LONG episodes, computed as EVIDENCE (§2 L1: "no separate clock
   * card" — the 2–8am fact renders in the A2 expand). Reuses ⑥'s circular scan over the long
   * episodes' local hours. Absent when no valid timezone is available (never guess UTC — §4.2);
   * NEVER a fire gate (L1 fires on the fraction regardless of the clock).
   */
  clockBand?: { startLocalHour: number; windowHours: number }
  /** Count of long episodes in `clockBand` (of `longCount`); paired with clockBand or both absent. */
  clockCount?: number
  /** The onset instants (ms) of the LONG episodes — the composition/evidence counterpart of ⑤'s rapidEpisodeOnsets. */
  longEpisodeOnsets?: number[]
  /** Hard marker for the phrasing layer + reviewers: timing/association only, never causal, never mechanism. */
  associationalOnly: true
  /** The analysis window in days (bounds the denominator to the current era of the pet's life). */
  windowDays: number
  /** SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read by the engine). */
  medContext?: MedOnBoardContext
  /**
   * L3 (Signals v2 / B-755 / CUL-9 §2 L3) — photo-record composition EVIDENCE, attached
   * POST-detection (never read by the engine). Present-only; `retainedFood` joins over
   * `longEpisodeOnsets` (this finding's long band), plus hair/bile over the window's photographed
   * vomits. See PhotoComposition.
   */
  photoComposition?: PhotoComposition
}

/**
 * The combined timing card (Signals v2 / B-755 / CUL-7 — D1/A2). A COMPOSITION-ONLY finding:
 * emitted by composeTimingStory when BOTH ⑤ (postprandial) AND L1 (empty-stomach) fire for the
 * SAME symptom — the two phenotypes are two readings of one timing distribution, so one card face
 * carries both rather than two cards saying overlapping things (D1: "duplicate cards… duplicate
 * information"). A lone ⑤ stays `postprandial_timing`; a lone L1 stays `empty_stomach_timing`;
 * only the co-firing pair merges. Detectors stay separate and separately tested — ONLY the
 * presentation payload merges (§2 L1).
 *
 * Carries the shared three-band counts (the A2 Shape-C compare: ≤30 min / in between / 6h+) plus a
 * per-phenotype evidence block for each lane that fired. Same guardrail class as its parts:
 * associational/timing only, no syndrome name, no food-naming, no management advice.
 */
export interface TimingStoryFinding extends FindingBase {
  type: 'timing_story'
  priorityClass: 'insight'
  symptomType: SymptomType
  /** The three-band split over the shared eligible denominator (the A2 Shape-C compare face). */
  bandCounts: { rapid: number; mid: number; long: number }
  /** The honest shared denominator: timed-eligible episodes (⑤ and L1 measure the identical set). */
  eligibleCount: number
  /** All in-window vomit episodes (any confidence) — "of N total, M could be timed". */
  totalEpisodes: number
  /** The rapid bucket boundary in minutes (30; from ⑤'s config). */
  rapidWindowMinutes: number
  /** The empty-stomach band boundary in hours (6; from L1's config). */
  longGapHours: number
  /** The analysis window in days (⑤ and L1 share it, so the merged card has one window). */
  windowDays: number
  /** ⑤'s phenotype evidence — always present in a timing_story (the merge only fires when ⑤ did). */
  rapid: {
    count: number
    medianMinutesSinceFeeding: number
    lastTwoEligible: boolean
    feedingFormsInEvidence: string[]
  }
  /** L1's phenotype evidence — always present in a timing_story (the merge only fires when L1 did). */
  long: {
    count: number
    medianHoursSinceFeeding: number
    lastTwoEligible: boolean
    feedingFormsInEvidence: string[]
    clockBand?: { startLocalHour: number; windowHours: number }
    clockCount?: number
    /**
     * L3 (Signals v2 / B-755 / CUL-9) — the long episodes' onset instants (ms), copied verbatim from
     * the merged L1 finding's `longEpisodeOnsets`. The retained-food join key: computePhotoComposition
     * matches these onsets to completed vomit reads to count recognizable food in the long band. Optional
     * so a pre-L3 / synthetic story finding without it simply yields no `retainedFood`.
     */
    longEpisodeOnsets?: number[]
  }
  /** Hard marker for the phrasing layer + reviewers: timing/association only, never causal, never mechanism. */
  associationalOnly: true
  /** SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read by the engine). */
  medContext?: MedOnBoardContext
  /**
   * L3 (Signals v2 / B-755 / CUL-9 §2 L3) — photo-record composition EVIDENCE, attached POST-detection
   * (never read by the engine). Present-only; `retainedFood` joins over `long.longEpisodeOnsets`, plus
   * hair/bile over the window's photographed vomits. See PhotoComposition.
   */
  photoComposition?: PhotoComposition
}

/**
 * The trial-response lane (Signals v2 / B-755 / CUL-8 — L2, the wedge). The reactive owner sent
 * home with an elimination diet is the highest-intent user, and this lane is the record answering
 * "what has the trial done to the symptoms?" — but ONLY ever as COUNTS the vet interprets, never a
 * verdict (G1). Gated on `isTrialRunning` (the one B-422 predicate, never a re-derivation) and
 * emitted ONLY when the pooled contrast "changed materially" (see `detectTrialResponse` — the §8.5
 * trigger the client's event-driven Signal card keys off; the standing trial-card line, PR 6, shows
 * counts regardless and reads local data).
 *
 * EVERYTHING is count-anchored over LOGGED-DAYS denominators (C5): a bowl refused is a day the owner
 * kept the record, so a rate is per logged day, never per calendar day. Two windows: the trial era
 * [start, now] and a `baselineDays` window immediately before it (candidate 49d, capped at available
 * history by the logged-days denominator itself). NEVER verdicted: no "working"/"helping"/
 * "improvement"/"ruled out"/"clean" — the diet-response-≠-proof rule (Guilford 2001's
 * improved-without-relapse arm) and the three-things-changed-at-once confound (RTM) are the vet's to
 * weigh, disclosed verbatim in the client expand (PR 6). Indication-blind: the engine cannot know GI
 * vs dermatologic intent, so there is NEVER an assessment-point verdict — the day-count sits beside
 * the counts and says nothing about whether it is "time to judge".
 */
export interface TrialResponseFinding extends FindingBase {
  type: 'trial_response'
  priorityClass: 'insight'
  /**
   * Day N of the trial (1-based; day 1 = start day, §5.1). Clamped ≥1. Rendered "day N" or, with a
   * target, "day N of M". Computed from the SAME local-day helpers the trial card counts with
   * (`localDayIndex`/`localDayIndexOf`, B-421), so the Signal card and the Pet-tab card can't drift.
   */
  trialDayNumber: number
  /** The trial's prescribed length M ("day N of M") — `target_duration_days`, the ONLY length
   *  authority (never the elapsed days). Null when unset ⇒ the card renders "day N", no "of M". */
  targetDurationDays: number | null
  /** Distinct logged days in the trial-era window (the C5 denominator for its rates). */
  trialLoggedDays: number
  /** Distinct logged days in the baseline window (the C5 denominator for its rates). */
  baselineLoggedDays: number
  /** The baseline window's requested span in days (the config `baselineDays`) — evidence/vet copy. */
  baselineWindowDays: number
  /** VOMIT-episode burden (re-logs collapsed) in the trial era. Vomit-only — the round-2 cross-symptom
   *  masking fix; a derm/diarrhoea trial yields no L2 card in v1 (silence, the safe direction). */
  pooledTrialCount: number
  /** VOMIT-episode burden (re-logs collapsed) in the baseline window. */
  pooledBaselineCount: number
  /**
   * Per-phenotype VOMIT-TIMING counts (via `lib/mealTiming`, G9), trial-era vs baseline — the A2
   * "count rows" (D2: "Empty-stomach 0 · was 7" — count-form, always safe). `rapid` = ≤30 min after
   * eating (post-prandial), `mid` = the 30 min–`longGapHours` middle band, `long` = ≥`longGapHours`
   * after eating (empty-stomach). These are CONTEXT rows shown when the card fires; they do NOT
   * independently trigger it (see `detectTrialResponse`).
   *
   * B-766 — the three bands PARTITION the timed-eligible episodes (rapid + mid + long = the episodes
   * we could place against a recent meal), exactly as the A2 timing card's `bandCounts` do. The client
   * reconciles them to the pooled lead: `pooled − (rapid + mid + long)` per window is the un-timeable
   * remainder (no recent meal to place the episode against), disclosed so the face FOOTS with the
   * pooled count in the lead (before this field the card showed only rapid + long, so the two rows
   * could not sum to the pooled lead — "the numbers didn't add up" on the wedge's trust surface).
   */
  rapid: { trial: number; baseline: number }
  mid: { trial: number; baseline: number }
  long: { trial: number; baseline: number }
  /** The post-prandial band boundary in minutes (30) — the `rapid` row label. */
  rapidWindowMinutes: number
  /** The empty-stomach band boundary in hours (6) — the `long` row label. */
  longGapHours: number
  /**
   * Diet-structure deltas (§2 L2 — "context rows"), the observable half of the three-things-changed
   * confound (RTM): `treatShare` = treat-type feedings ÷ classifiable (meal+treat) feedings; null
   * when nothing is classifiable. `mealsPerDay` = meal-type feedings ÷ logged days; null when the
   * window has no logged days. Never a verdict — the vet weighs whether structure or diet mattered.
   */
  treatShare: { trial: number | null; baseline: number | null }
  mealsPerDay: { trial: number | null; baseline: number | null }
  /**
   * The pooled comparison direction, present because the card only fires on a material pooled change:
   * `more_during_trial` (the trial-era rate is higher — the escalation direction, always surfaced) or
   * `fewer_during_trial` (lower — surfaced ONLY when logging density is comparable, see below). The
   * server sentence is direction-NEUTRAL (it states both counts in time order, never "more"/"fewer" —
   * a verdict-free form); this field is structured context for the client (PR 6).
   */
  comparisonDirection: 'more_during_trial' | 'fewer_during_trial'
  /**
   * Whether the two windows were logged with comparable INTENSITY (§3.3, the B-721 rule reused, made
   * SYMMETRIC over logging FRACTIONS — logged days ÷ window span, not raw counts, since the windows are
   * unequal length; see `detectTrialResponse`). It gates the fewer-during-trial direction only (a
   * quieter-looking trial may just be a less-logged one — OR the baseline was the sparse one, which
   * inflates its rate and mints a false fewer, the adversarial round-1 break); the more-during-trial
   * direction is never gated (fail toward escalation). Carried so the client can disclose "we logged
   * less often this stretch" (PR 6). Absent from any finding cached before the symmetric-gate fix.
   */
  densityComparable: boolean
  /** Hard marker for the phrasing layer + reviewers: association/counts only, never causal, never a verdict. */
  associationalOnly: true
  /** The analysis window used for the pooled/phenotype counts, in days (trial-era span) — evidence. */
  trialWindowDays: number
  /** SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read by the engine). */
  medContext?: MedOnBoardContext
}

/**
 * The gap-shortening lane (Signals v2 / B-755 / CUL-10 — L4, the sub-floor lane). Of the tools in the
 * signals deep-dive (§3), the g-chart on inter-event gaps is the ONLY one that speaks at the
 * 4-episodes-in-2-weeks scale (§2 F4) — where ⑤/⑥/⑦/④/③/① are all correctly silent by their own
 * floors — so this is the lane for the sub-floor state that is every new account's first weeks by
 * construction. It monitors the GAPS BETWEEN a symptom's episodes (3h-collapsed) and fires ONLY when
 * they are SHORTENING (a rising episode rate): the plain, escalation-shaped statistic "the gaps between
 * vomiting episodes have been 6 days, then 3, then 2" (the D2 mock).
 *
 * ESCALATE-ONLY BY CONSTRUCTION (G5): a LENGTHENING or flat sequence renders NOTHING, EVER — absence is
 * not wellness and a widening gap is never reassurance (a pet can stop logging, or a disease can wax and
 * wane; RTM). There is deliberately no "gaps are lengthening / settling" finding, the same structural
 * never-reassure guarantee ⑦'s silence-on-a-settled-course makes.
 *
 * A QUIET WATCHING ROW, not a full card (§2 L4, D5): it surfaces as the D2 quiet insight row while
 * real-world behavior is still being observed, ranked at the engine's LOWEST band so it only leads when
 * nothing louder exists (which is exactly the sub-floor state it is built for). Counts always travel
 * (`recentGapsHours` + the median) so the owner reads the actual gaps and judges — the row shows a TRUE
 * fact about the record, never a verdict. NO attribution, NO cause, NO management advice (G1/G3).
 */
export interface GapShorteningFinding extends FindingBase {
  type: 'gap_shortening'
  priorityClass: 'insight'
  /** Which symptom's inter-episode gaps shortened. One finding per run; at most one emitted (the
   *  strongest shortening — see detectGapShortening), so the quiet surface stays calm. */
  symptomType: SymptomType
  /**
   * The monotone-decreasing run that fired, oldest→newest, in HOURS (the raw gaps between consecutive
   * collapsed episode onsets). Length === `runLength` (config; 4). The phrasing renders it as the D2
   * sentence, choosing days/hours per gap ("6 days, then 3, then 2"); hours are carried (not pre-
   * rounded to days) so a sub-day gap never renders as a dishonest "0 days".
   */
  recentGapsHours: number[]
  /** The record's MEDIAN inter-episode gap (all in-window gaps of this type), in hours — the baseline
   *  the ratio test measured against, carried as evidence for the expand ("typical gap ≈ N days"). */
  medianGapHours: number
  /** The latest (shortest) gap, in hours — `recentGapsHours[last]`, surfaced explicitly for the ratio
   *  transparency (`latestGapHours ≤ gapShorteningRatio × medianGapHours` is why the lane fired). */
  latestGapHours: number
  /** Total inter-episode gaps in the record window (≥ runLength) — the "how much history" denominator. */
  gapCount: number
  /** Collapsed episodes of this symptom in the window (=== gapCount + 1) — the D2 sample denominator. */
  episodeCount: number
  /** ISO-8601 UTC of the most-recent episode onset (the end of the run) — powers "as recently as …"
   *  evidence and lets a consumer see the run is current (the recency guard already enforced it). */
  lastOnsetIso: string
  /** Hard marker for the phrasing layer + reviewers: a descriptive count of gaps, never causal, never a verdict. */
  associationalOnly: true
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
  /**
   * Signals v2 (B-755 / CUL-7) — the onset instants (ms) of the episodes in the winning clock
   * band. Read ONLY by the episode-set-aware ⑤-suppresses-⑥ rule: ⑥ is suppressed only when this
   * cluster is (mostly) ⑤'s meal-adjacent episode set (deep-dive F1 — the shipped rule wrongly
   * assumed every clock cluster restates meal-adjacency). Optional so a pre-v2 / synthetic finding
   * without it falls back to the shipped unconditional suppression.
   */
  clusterEpisodeOnsets?: number[]
  /**
   * SR-4 (B-721 §5.4) — medication-on-board context, attached POST-detection (never read
   * by the engine). Present only when a nameable drug had ≥1 administered dose in the
   * context window; absent otherwise. See MedOnBoardContext.
   */
  medContext?: MedOnBoardContext
  /**
   * L3 (Signals v2 / B-755 / CUL-9 §2 L3) — photo-record composition EVIDENCE, attached
   * POST-detection (never read by the engine). Present-only; carries hair/bile over the window's
   * photographed vomits (no `retainedFood`: ⑥ is a clock finding with no long band). Its clinical
   * value is the early-morning bilious case, exactly where a bile descriptor helps. See PhotoComposition.
   */
  photoComposition?: PhotoComposition
}

/** Which visible red flag a per-incident analysis carries (B-340). Present-only, derived from the
 * owner-editable structured clinical fields — never the cached visual_flags array. */
export type IncidentFlagKind = 'blood' | 'foreign_material'

/**
 * The clinical INCIDENT FAMILY a per-incident red flag belongs to (B-340 vomit, B-364 stool).
 * This is a COARSE category, deliberately NOT event_ai_analysis.incident_type: stool is logged as
 * two raw event types ('stool_normal' | 'diarrhea', migration 034) and blood is a red flag in
 * EITHER (haematochezia in a formed stool is as real as in diarrhoea), so both collapse to 'stool'
 * here — and the owner-facing noun stays the neutral "stool", never "loose stool", so a blood flag
 * on a FORMED stool never mis-states consistency on a safety card. The finding carries the category,
 * not the raw type; `incidentCategory()` maps raw → category (null for non-analysed families).
 */
export type IncidentCategory = 'vomit' | 'stool'

/**
 * Fixed display/rank order for the per-incident red-flag families: vomit leads stool. The SINGLE
 * source of truth for BOTH the detector's emission order (detectIncidentRedFlags) and the ranker's
 * incident_red_flag/incident_red_flag tie-break (rankFindings) — so a future family (e.g. skin) is
 * ordered in exactly one place, not two hand-kept-in-sync lists.
 */
export const INCIDENT_CATEGORY_ORDER: readonly IncidentCategory[] = ['vomit', 'stool']

/**
 * The raw `event_ai_analysis.incident_type` values that carry a per-incident red-flag lane — exactly
 * the values `incidentCategory()` maps to a non-null family. The generate-signal query filters on
 * this; keep it in sync with `incidentCategory` below (a future stool-schema consolidation — see the
 * CLAUDE.md open question — would touch both).
 */
export const RED_FLAG_INCIDENT_TYPES = ['vomit', 'stool_normal', 'diarrhea'] as const

/**
 * Map a raw `event_ai_analysis.incident_type` to its coarse red-flag category. 'vomit' → vomit;
 * 'stool_normal' / 'diarrhea' → stool (migration 034 keeps the two stool event types split — D1 —
 * so both must map here); anything else (itch/scratch/skin_reaction, or an unknown future value)
 * → null, i.e. it carries no per-incident visual red-flag lane. Pure; the single source of truth
 * for "which incidents feed this lane", used by both the derivation and the detector.
 */
export function incidentCategory(incidentType: string): IncidentCategory | null {
  if (incidentType === 'vomit') return 'vomit'
  if (incidentType === 'stool_normal' || incidentType === 'diarrhea') return 'stool'
  return null
}

/**
 * Per-incident visual red flag (B-340) — the SAFETY-class lane that elevates a blood /
 * foreign-material flag from a photo the owner logged onto the Home Signal, where "safety
 * insights always lead" (Principle 3). Today that flag lives ONLY on the event detail screen
 * (`analyze-vomit` writes it; `generate-signal` never read `event_ai_analysis`), so a genuine
 * red flag an owner photographed never reaches Home. This lane closes that gap.
 *
 * ESCALATE-ON-PRESENCE, NEVER REASSURE (clinical-guardrails, the n=1 asymmetry): it fires on the
 * PRESENCE of a visible flag and routes to the vet; it makes NO diagnosis, NO causal claim, and
 * its ABSENCE is silence, not wellness (a cleared/absent flag emits nothing — never an all-clear).
 * Single-incident fires — there is deliberately no corroboration gate, because a false positive is
 * cheap for the owner to clear (editing the structured field, B-028, clears the card by
 * construction — the flag is DERIVED from those fields, mirroring generate-report). Template-only
 * phrasing (like ③–⑦), itself a structural never-reassure guarantee.
 *
 * SCOPE: vomit (B-340) and stool (B-364), each surfaced as its OWN finding — the detector emits up
 * to one per family, because the two are distinct clinical findings with distinct owner-facing nouns
 * ("vomiting" vs "stool") and must not be conflated into one card (a pet with a bloody vomit AND a
 * bloody stool shows two safety cards, neither dropped — Principle 3). Both reuse this single type +
 * the same client renderer (no new InsightType); the `incidentType` category picks the noun.
 */
export interface IncidentRedFlagFinding extends FindingBase {
  type: 'incident_red_flag'
  priorityClass: 'safety'
  /** The incident family carrying the flag ('vomit' | 'stool') — picks the owner-facing noun. */
  incidentType: IncidentCategory
  /** The distinct visible red flags present across the in-window incidents (blood before foreign, stable order). ≥1. */
  flags: IncidentFlagKind[]
  /** ISO-8601 UTC occurred_at of the MOST RECENT in-window incident carrying a red flag — the recency anchor for copy. */
  mostRecentFlaggedIso: string
  /**
   * How many distinct in-window incidents carry a red flag (drives singular/plural copy + evidence). ≥1.
   * B-368: NEAR-DUPLICATE re-logs collapsed — the same vomit double-tapped / sync-replayed into N events
   * with N analyses counts as ONE, matching generate-report's §5.11 collapse (a 60s window anchored to
   * the cluster's first member, dedup over ALL in-window vomit incidents, count clusters carrying ≥1 flag
   * — countFlaggedClusters). Two GENUINELY distinct bouts (e.g. 30 min apart) count as 2 on BOTH surfaces
   * — never understated to 1 on a safety card. It never changes WHETHER the card fires (≥1 flagged
   * incident ⇒ count ≥1) — only the count/plural copy. Known residual (B-376): a photoless vomit has no
   * analysis row so can't reach this detector, so a rare 3-vomits-in-~90s arrangement can still under-count
   * by one vs the report — always the understating direction, card still fires + routes to the vet.
   */
  flaggedIncidentCount: number
  /** The recency window in days actually applied (a flag older than this no longer leads Home). */
  windowDays: number
}

export type Finding =
  | CorrelationFinding
  | IntakeDeclineFinding
  | ReflectionFinding
  | SymptomWorseningFinding
  | SymptomChronicityFinding
  | PostprandialTimingFinding
  | EmptyStomachTimingFinding
  | TimingStoryFinding
  | TrialResponseFinding
  | GapShorteningFinding
  | TimeOfDayClusteringFinding
  | IncidentRedFlagFinding

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
 * Where the dominant staple shows up, so the copy can be HONEST about its structure
 * (B-070). The original copy said "in nearly every meal" unconditionally — false for the
 * real wedge case (Nyx: her chicken comes via ~83 treats; her meals are tuna-led), and a
 * false premise can misdirect an elimination-diet conversation (the owner switches the
 * meal protein while the chicken keeps arriving as treats). The register is resolved in
 * this deterministic, adversarially-reviewed engine (like WorseningTier), never in copy:
 *   - 'meals'  — the staple's exposures are overwhelmingly meals → "in most meals".
 *   - 'treats' — overwhelmingly treats → "most days, usually as treats rather than meals".
 *   - 'mixed'  — genuinely both (or unclassifiable food_type) → the day-based "most days".
 */
export type StapleSource = 'meals' | 'treats' | 'mixed'

/**
 * Detector ① (correlation) can't usefully assess a protein because that ONE protein
 * DOMINATES the pet's exposures — it is in (nearly) every case AND control window, so it
 * is concordant and washes out (or, as a sole protein, leaves ① no contrast at all). B-070
 * widened this from the v1 EXACTLY-ONE-protein test to DOMINANCE (≥ stapleDominanceFraction
 * of exposures), measured over the SAME classifiable set the case-crossover keys off
 * (classifyMeals — meals AND treats), because that is exactly what ① sees and washes out;
 * meals-only would miss the real wedge case entirely. EXPLANATION ONLY: never a "vary the
 * diet" ask (that sabotages a vet-directed elimination trial — our primary wedge — and
 * inverts Pets>$), and FULLY SUPPRESSED on diet-trial pets (the constant staple IS the
 * elimination diet). It is honest uncertainty ("we can't tell yet whether it's linked"),
 * never reassurance — an omnipresent exposure is genuinely unassessable, not "safe".
 */
export interface StapleWashoutDiagnostic extends CoverageDiagnosticBase {
  type: 'staple_washout'
  actionability: 'explanation'
  /** The dominant staple protein — present in ≥ stapleDominanceFraction of all exposures, e.g. 'chicken'. */
  protein: string
  /** Distinct symptom episodes (any correlation type, re-logs collapsed) the owner is trying to understand. */
  symptomEpisodes: number
  /** Where the staple shows up (meals vs treats), so the copy never falsely claims "every meal" (B-070). */
  stapleSource: StapleSource
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
  chronicity: {
    /**
     * Lookback in days (detector ⑦, B-182 §6). 56 = exactly 8 now-anchored weekly buckets;
     * covers the council's 6-week case + headroom. The "{windowWeeks} weeks" denominator.
     */
    windowDays: number
    /**
     * First→last span floor — the clinical "chronic" threshold for GI signs (≥3 weeks, Dr.
     * Chen). Closes the one-bad-week cluster (Break 5 / §10 #5). All §4.3 floors must pass.
     */
    minSpanDays: number
    /** Sustained-burden floor — a real recurrence, not two endpoints (Break 5 / §10 #6). */
    minEpisodes: number
    /**
     * Distribution floor — distinct now-anchored weekly buckets carrying an episode. The
     * anti-cluster / anti-gap guard (the chronicity analog of ④'s fake-rise guard): closes
     * a log-gap that leaves two endpoints reading as "ongoing for N weeks" (Break 3 / §10 #4).
     */
    minActiveWeeks: number
    /**
     * "Still ongoing" floor — the most-recent episode must be within this many days, else
     * the course may have resolved and ⑦ is SILENT (never "resolved" — §4.7 #1). Makes the
     * word "ongoing" honest and closes nagging about a settled problem (§10 #3).
     */
    ongoingRecencyDays: number
    /** Duration-anchored 'firm' register floor (≥6 weeks → "book a vet visit"). */
    firmSpanDays: number
    /**
     * Per-type floor overrides (W1-PR-3b session 1, CUL-676). The global floors above
     * were calibrated on GI/derm signs; a leaf joining the lane brings ITS OWN floors
     * (the B-755 contract — cough's numbers are Dr. Chen's to set when it joins in
     * session 2). An absent type — or an absent OR UNDEFINED floor within an entry —
     * resolves to the global floors, so an empty/omitted map is byte-identical to
     * the pre-slot engine and a spread-from-partial config cannot silence the lane. `windowDays` is deliberately NOT
     * overridable: the card's "{N} weeks" denominator and the weekly distribution
     * buckets are one shared window — a per-type window would be a different lane,
     * not a different floor. Every consumer resolves through chronicityFloorsFor —
     * ⑦'s fire predicate, its tier resolver AND the ③-valve share the resolved
     * floors by construction (the one-predicate rule, §5.3).
     */
    perType?: Partial<
      Record<
        SymptomType,
        Partial<{
          minSpanDays: number
          minEpisodes: number
          minActiveWeeks: number
          ongoingRecencyDays: number
          firmSpanDays: number
        }>
      >
    >
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
  // Signals v2 (B-755 / CUL-7) — detector L1 (empty-stomach timing) floors. L1 is the ⑤ MIRROR:
  // it shares ⑤'s eligibility ladder + denominator (minEligibleEpisodes) and reads the SAME timing
  // distribution (`classifyEpisodeSet`, G9), so it carries only the long-band-specific floors here.
  // `longGapHours` (the phenotype boundary) is science-anchored (§0 D10 / CUL-16); the fraction floor
  // and the empty-stomach guard ratio are locked by the seeded property sweep at 6h (uniform / Poisson
  // / grazing null models). See DEFAULT_CONFIG.emptyStomach for the anchors.
  emptyStomach: {
    /** Minimum LONG episodes (≥ longGapHours since eating) before a pattern is worth stating (⑤'s minRapidEpisodes mirror). */
    minLongGapEpisodes: number
    /** Minimum timed-eligible episodes (the DENOMINATOR); shared value with ⑤'s minEligibleEpisodes. */
    minEligibleEpisodes: number
    /** Minimum long/eligible fraction — a crude schedule-independent backstop, below the Poisson-binomial gate. */
    minLongGapFraction: number
    /**
     * The empty-stomach GUARD's significance level (the base-rate defense). The ≥ longGapHours bucket
     * has a large SCHEDULE-DEPENDENT chance base rate — a twice-daily feeder is empty-stomach ~half the
     * day, once-daily ~three-quarters — so a fixed fraction floor cannot separate signal from a meal-fed
     * null (unlike ⑤, where the grazer is the confound). L1 gives each eligible episode its OWN local
     * long base rate (the long fraction of the actual feeding interval it sits in) and fires only when
     * the observed long count exceeds what those per-episode schedules would produce by chance: a
     * POISSON-BINOMIAL upper-tail test P(X ≥ longCount | ⨁ Bernoulli(pᵢ)) < baseRateAlpha. Per-episode
     * rates make the null robust to a chronic vomiter's multi-regime history — a single base rate over
     * any window is dragged off the recent regime by one old outlier episode and fires on noise (the
     * round-2 review break). The exact test self-calibrates the null fire rate to ≤ this alpha at ANY mix
     * of schedules (so no per-schedule tuning), still fires at a high base rate given enough
     * disproportionate evidence, and reduces exactly to the one-sample binomial when every pᵢ is equal.
     * Locked by the property sweep at 6h (null false-positive AND true-positive recall). See
     * DEFAULT_CONFIG.emptyStomach for the anchor + measured rates.
     */
    baseRateAlpha: number
    /** ≥1 long episode must fall within this many days, so a stale cluster doesn't lead (⑤'s recencyDays mirror). */
    recencyDays: number
    /** The empty-stomach band boundary in HOURS — the phenotype definition (§0 D10 / CUL-16). */
    longGapHours: number
  }
  // Signals v2 (B-755 / CUL-8) — the trial-response lane (L2). All counts are over LOGGED-DAYS
  // denominators (C5); the comparison SENTENCE rides `lib/rateContrast`'s C-test gate (p never
  // surfaces) with the shared density-comparability rule (`DENSITY_COMPARABLE_MIN_RATIO`).
  trialResponse: {
    /**
     * The baseline window length in days — the pre-trial stretch L2 compares the trial era against.
     * 49d (7 weeks): long enough to cover both timing phenotypes' cadence, short enough to be the
     * same season of the pet's life (§2 L2). Anchored to that reasoning, NOT to any record (G6); the
     * logged-days denominator caps it at available history on its own, so a pet with a short
     * pre-trial history simply gets a shorter comparable baseline (or, below the floor, no card).
     */
    baselineDays: number
    /**
     * Each window must carry at least this many DISTINCT LOGGED DAYS before a rate comparison is
     * honest — the guard against a garbage baseline (3 vomits on the one pre-trial day the app was
     * opened would otherwise out-rate a fully-logged trial and manufacture a "fewer during the
     * trial" contrast). A trial too new, or with too little pre-history, simply shows no card yet
     * (the §4.4 watching state owns that "needs N logged days" framing). Load-bearing, adversarial-gated.
     */
    minLoggingDaysPerWindow: number
    /**
     * The `lib/rateContrast` render-gate significance level for the pooled comparison. The C-test is
     * small-n-quiet BY CONSTRUCTION (0-vs-2 never gates), so this is the only knob and it is the
     * conventional two-sided 0.05; the property sweep asserts a NULL trial (same underlying rate both
     * windows) fires below the ceiling. The p-value never surfaces (§3) — only the boolean gate.
     */
    contrastAlpha: number
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
    /**
     * Signals v2 (B-755 / CUL-7) — the episode-set-aware ⑤-suppresses-⑥ threshold. ⑤ suppresses a
     * same-symptom ⑥ clock finding ONLY when this fraction of ⑥'s cluster episodes are also ⑤'s
     * meal-adjacent (rapid) episodes — i.e. ⑥ is genuinely restating ⑤ (deep-dive F1). Below it, the
     * clock cluster is a DIFFERENT (broader / empty-stomach) pattern and ⑥ survives — the whole point
     * of the fix. Owned + adversarial-gated. Absent onset sets on either finding ⇒ the shipped
     * unconditional suppression (behaviour-parity for pre-v2 findings).
     */
    suppressionOverlapFraction: number
  }
  incidentRedFlag: {
    /**
     * Recency window in days (detector — B-340). A per-incident visual red flag (blood /
     * foreign material) leads the Home safety surface only while it is recent enough to still
     * be actionable; a flag older than this no longer leads (the vet report, unlike Home, still
     * carries the full history). 14 = "the last two weeks" — recent enough to prompt a call, not
     * so long a resolved incident keeps alarming. The sanctioned clear before this window elapses
     * is the owner editing the structured field (which clears the card by construction). Tune on
     * real data, not a re-decision; the exact value is a Dr. Chen recency call (flagged for PR-1
     * adversarial ratification).
     */
    windowDays: number
  }
  coverage: {
    /**
     * Min classifiable exposures (meals + treats) before "X is in most of what the pet
     * eats" is an honest staple-washout claim. Below it, the dominant protein could just
     * be a couple of early logs, not an established staple.
     */
    stapleMinMeals: number
    /**
     * B-070: the share of all classifiable exposures (meals + treats) a single protein
     * must reach to be the DOMINANT staple. Measured over the SAME set detector ① keys
     * off, because that is exactly what gets concordant-and-washed-out in the case-
     * crossover; meals-only would miss the real wedge case (a treat-borne staple). 0.8 =
     * "in most of what the pet eats". v1 fired only on a SOLE protein (an implicit 1.0);
     * dominance generalizes that. Tune on real data, not a re-decision.
     */
    stapleDominanceFraction: number
    /**
     * B-070: of the dominant staple's classified (meal|treat) exposures, the share that
     * must be one kind to pin the copy register to 'meals' or 'treats' (else 'mixed').
     * Keeps the copy from over-claiming "every meal" when the staple is treat-borne — the
     * false premise that could misdirect an elimination-diet talk. 0.8 mirrors the
     * dominance floor. Tune on real data, not a re-decision.
     */
    stapleSourceMajorityFraction: number
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
  // B-102 PR 5 — human-food provenance covariate (off-commercial-diet days). Descriptive
  // only; no floor (this is a covariate, not a card — a future consumer owns any threshold).
  humanFood: {
    /** Analysis window in days (trailing UTC calendar days from `now`), matching ⑤/⑥. */
    windowDays: number
  }
  // Signals v2 (B-755 / CUL-10) — the L4 gap-shortening lane (§2 L4). Inter-episode gaps per
  // symptom type (3h-collapsed); the sub-floor lane that speaks where every other lane is silent
  // (deep-dive §2 F4, §3 — the g-chart method on inter-event gaps). Escalate-only BY CONSTRUCTION:
  // it fires only on SHORTENING; a lengthening (or flat) sequence renders NOTHING, ever (G5 —
  // absence ≠ wellness; RTM). Every constant is a null-model sweep result or a g-chart anchor,
  // NEVER tuned to Nyx's record (G6).
  gapShortening: {
    /**
     * Absolute floor: the lane is inert below this many inter-episode gaps (this many + 1 collapsed
     * episodes). 3 gaps / 4 episodes is the g-chart anchor (deep-dive §3 — the method is "informative
     * from ~3–5 gaps") and the LOWEST data floor in the engine, which is the whole point: L4 exists to
     * speak in the sub-floor state (§2 F4) where ⑤/⑥ (6 eligible), ⑦ (6 episodes) and ④/③ (3-in-7d)
     * are all silent. It is the WATCHING-row floor (§4.4, PR 7's client row "watching N gaps"); the
     * FIRING quiet-insight row additionally needs a `runLength` monotone run, which the sweep set
     * ABOVE this (see `runLength`) — so a 3-gap record is watched, not claimed-over. NEVER Nyx's record.
     */
    minGaps: number
    /**
     * The number of most-recent gaps that must be STRICTLY monotonically decreasing for the lane to
     * fire — the "shortening run". THE SWEEP SET THIS, NOT INTUITION (§9, the ⑥ calibration lesson):
     * the spec's provisional `3` fires ~16.7% by CHANCE on any null (3 i.i.d. gaps are strictly
     * decreasing 1/3! = 1/6 of the time — the monotone-runs-by-chance trap the ticket names), the same
     * class of miss as ⑥'s naive floors firing ~21.6% on uniform noise. A run of `4` drops the
     * by-chance rate to 1/4! = 1/24 ≈ 4.2%, and with the ratio gate the measured null fire rate lands
     * ~2% on CONSTANT-RATE nulls, matching ⑥'s calibrated-up standard. Cost, taken knowingly: the
     * FIRING floor is effectively 4 gaps / 5 episodes; a 3-gap record is WATCHED (the §4.4 row) but
     * never fired on — the honest reading of "the sweep sets the floor" over the g-chart anchor. NEVER
     * chosen to make Nyx's record fire (G6): it is the smallest run whose by-chance rate clears the
     * property test. DISCLOSED RESIDUAL (adversarial, CUL-10): on an AUTOCORRELATED waxing/waning rate
     * the residual is ~5–6% (not ≪5%) — the §PROPERTY SWEEP carries that null and asserts it as an
     * ⑥-style accepted cost; runLength=5 drops it under 2% at a 6-episode floor (the Dr. Chen 4-vs-5 brief).
     */
    runLength: number
    /**
     * The latest gap must be ≤ this × the record's MEDIAN gap to fire — "meaningfully shorter than the
     * pet's typical gap", the g-chart lower-control-limit analog. 0.5 = "at most half the typical gap".
     * Anchored to the g-chart "a gap in the lower tail signals a rate increase" concept and kept loose
     * enough to catch a moderate real shortening, NOT to any record (G6); the null false-positive rate
     * is held by `runLength` (the monotone run), not by squeezing this — a ratio strict enough to hold
     * the FPR alone (~0.17) would miss every moderate acceleration. The §PROPERTY SWEEP measures the
     * joint (monotone-run ∧ this-ratio) null rate; the §RECALL test asserts real shortening runs clear it.
     */
    gapShorteningRatio: number
    /**
     * Staleness / reversal guard: the OPEN interval (now − last onset) must be ≤ this × the latest
     * (shortest) gap, else the accelerating run has not CONTINUED and the quiet row would misrepresent
     * the present as if the pattern were live. Catches both a run that happened long ago (open interval
     * ≫ latest) and a run immediately followed by a long quiet stretch (the trend reversed) — the
     * g-chart's own logic (an in-progress gap longer than the recent short gaps is the rate dropping).
     * 2× gives stochastic headroom while still filtering a clear reversal. ESCALATE-SAFE: it only ever
     * SUPPRESSES a fire (never mints one, never reassures), so it cannot manufacture a signal — it
     * keeps the lane honest about currency. Not an FPR knob (the sweep places nulls at `now`, so this
     * never fires them); a §RECALL case pins that a stale/reversed run does NOT fire.
     */
    recencyGraceFactor: number
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
  // Sourced from the shared predicate's constant so the engine's default and the
  // client's config-free path cannot drift apart (B-067/CUL-372). Still 3.
  symptomEpisodeGapHours: SYMPTOM_EPISODE_GAP_HOURS,
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
  // B-182 detector ⑦ (symptom chronicity) floors (§6). Clinically-anchored v1 defaults
  // (PM/Dr. Chen D2 — recommend-and-proceed, pending ratification): a course is "chronic"
  // when it has genuine DURATION (≥3 weeks span — the small-animal GI chronic threshold),
  // SUSTAINED BURDEN (≥6 collapsed episodes — see calibration below), DISTRIBUTION (≥3
  // distinct now-anchored weekly buckets, the anti-cluster/anti-gap guard) AND is STILL
  // ONGOING (an episode within 14 days). ALL must pass — each floor closes a distinct break
  // in §10. firmSpanDays 42 (≥6 weeks) lifts the copy to "book a vet visit". Logging-
  // eligibility reuses reflection.minLoggingDaysPerWindow (§6 — a diagnostic mirrors the
  // floor of the layer it couples to; no second knob). Tune on real data, not a re-decision.
  //
  // CALIBRATION NOTE (build, flagged for D2 ratification — mirrors the ⑥ lesson exactly): the
  // §6 spec table set minEpisodes 4, but the §7 #14 noise property test — the REQUIRED gate —
  // FAILS at 4. With realistic daily meal logging (so the span-halves logging floor is
  // trivially met and minEpisodes is the binding floor), an "occasional vomiter" (~2 unrelated
  // vomits / 8 weeks) trips ⑦ ~9.9% of the time at minEpisodes 4, because the binomial tail of
  // even sparse vomiting reaches 4 scattered episodes that clear span/active-weeks/recency.
  // minEpisodes 6 drops that to ~1.3% (20k-trial deno sweep) while preserving every clinical
  // fixture (the classic once-a-week-for-6-weeks course = 6 episodes still fires). minActiveWeeks
  // stays 3 — raising it to 4 barely moves the rate (~1.26%) and would kill the §7 #4 intermittent-
  // across-3-weeks case. The change errs toward specificity, keeping the safety surface credible
  // (Principle 3: a chronicity card must not fire on a pet that vomited twice in two months).
  //
  // ACCEPTED RESIDUAL (intrinsic, sibling of ⑤'s grazing guard / ⑥'s n=8): a DENSER pattern (≥6
  // genuine episodes over 8 weeks, distributed, recent) still fires even when the underlying
  // vomits are coincidental/unrelated — the engine sees only count/span/distribution and cannot
  // tell "six vomits of one chronic course" from "six unrelated vomits". For a SAFETY lane this
  // is the SAFE error: a conservative "worth a word with your vet" on a pet that genuinely
  // vomited 6× in 8 weeks, never a false all-clear. The 6-vs-5 minEpisodes choice (specificity
  // vs sensitivity, given that safe error direction) is the D2 clinical ratification — Dr. Chen.
  chronicity: {
    windowDays: 56,
    minSpanDays: 21,
    minEpisodes: 6,
    minActiveWeeks: 3,
    ongoingRecencyDays: 14,
    firmSpanDays: 42,
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
  // Signals v2 (B-755 / CUL-7) — detector L1 (empty-stomach timing) floors. The boundary is set
  // by physiology; the floors are set by the seeded property sweep AT that boundary (G6: nothing
  // is tuned to make any record fire or not fire).
  emptyStomach: {
    // ── Floors LOCKED by the seeded property sweep at 6h (detection.test.ts "L1 §PROPERTY SWEEP"),
    // which asserts BOTH null-model false-positive rates AND true-positive recall. The empty-stomach
    // ≥6h bucket has a large, SCHEDULE-DEPENDENT chance base rate — ~0.5 of the day for a twice-daily
    // feeder, ~0.75 for a once-daily one (a solid meal clears in <6h, so most of a long inter-meal gap
    // is "empty stomach" by the clock). A fixed fraction floor cannot separate signal from schedule
    // here, and THREE CUL-7 reviews broke earlier guards, each teaching the next:
    //   (1) a multiplicative `longCount ≥ ratio × eligible × wholeWindowBaseRate` — fired ~81% on a
    //       NON-STATIONARY schedule (base read off the dense historical regime, applied to recent
    //       episodes) AND was UNSATISFIABLE above base ~0.588 (a once-daily-fed cat, the classic
    //       empty-stomach case, could not fire even at 100% long);
    //   (2) a single base rate over the window the EPISODES occupy + a one-sample exact binomial —
    //       fired 24–40% once a SINGLE OLD OUTLIER episode dragged the span-start across a regime
    //       change, so the one pooled base rate was estimated off the wrong (dense) history again.
    // The lesson both taught: a chronic vomiter's episodes span multiple feeding regimes, so NO single
    // base rate over ANY window survives. The guard is now PER-EPISODE: each eligible episode gets its
    // OWN local long-gap base rate `localLongBaseRate` (the fraction of its own actual inter-feeding
    // gap — nearest preceding→following feed, capped at the 24h lookback — that lies beyond 6h), and
    // the test is a POISSON-BINOMIAL upper tail `P(X ≥ longCount | ⨁ Bernoulli(pᵢ)) < baseRateAlpha`
    // over those heterogeneous pᵢ. This self-calibrates the null to ≤ alpha under ANY mix of schedules
    // in the history (an old dense-regime episode carries its own high pᵢ and cannot deflate a recent
    // sparse one), still fires at a high base rate given enough disproportionate evidence, and reduces
    // EXACTLY to the one-sample binomial when every pᵢ is equal. Measured pooled n=6..9 fire rates
    // (deno seeded sweep, detection.test.ts §PROPERTY SWEEP, 4k trials/n): stationary nulls once 0.0% /
    // twice ~1.7% / thrice ~1.6% / grazing 0.0% / Poisson ~0.8%; the round-2 break — a MIXED-HISTORY
    // null (recent noise cluster + ≥1 old outlier episode, once-daily-recent/thrice-daily-old) — drops
    // from 24–40% to ~2% at EVERY outlier position (day 25/30/40/50/58), and regime-change +
    // logging-fatigue with an outlier hold at ~1.8%; the §RECALL goldens (once-daily 12/12, thrice-
    // daily 7/10, twice-daily 7/8) all FIRE, including the once-daily case the (1) guard never could.
    // Tune on real data, not a re-decision.
    minLongGapEpisodes: 3, // the numerator floor — never fire on 2 episodes even if significant under the tail test.
    minEligibleEpisodes: 6, // SHARED with ⑤ (postprandial.minEligibleEpisodes) — the same denominator floor.
    minLongGapFraction: 0.6, // a crude schedule-independent BACKSTOP below the Poisson-binomial gate (low-base-rate cats).
    baseRateAlpha: 0.05, // sweep-locked — the Poisson-binomial upper-tail significance level (recall fires, nulls ≪5%).
    recencyDays: 14,
    // The empty-stomach BAND BOUNDARY: minimum hours since the last eligible feeding for a symptom
    // episode to count as "empty stomach" (the L1 numerator; the A2 card's "6h+" band; the reference
    // gap for L3's retained-food join).
    // ANCHOR (G6 — feline gastric-emptying literature, NOT tuned to any record): solid-phase
    // half-emptying median ~5.5h (range 3.5–12.8h; PubMed 10791934), 75% emptied ~4.8h (PubMed
    // 9563617); baseline motility variable, some healthy cats >5h (JAVMA 2022). At 4h a solid
    // meal is still ≳half in the stomach, so "empty" is not defensible; 6h is past half-emptying
    // for nearly all cats and clears the slow-motility baseline, while staying conservative vs.
    // the canonical 12h+ empty-stomach (bile/foam) fast. Ruled 6h by Dr. Chen (CUL-16) for
    // SPECIFICITY: this label asserts physiology (unlike ⑥'s neutral clock band), so a
    // contaminated numerator mislabels a still-full stomach as empty and fights the L3 photo
    // join; the specificity cost is a BOUNDED miss (borderline episodes render in the "in
    // between" band, never dropped). Change only via a re-sweep — a phenotype definition, not a
    // tuning knob. The property sweep locks the FLOORS at this boundary; it never moves it.
    longGapHours: 6,
  },
  // Signals v2 (B-755 / CUL-8) — the trial-response lane (L2). The baseline span is a product/
  // clinical judgment (a season of the pet's life, both phenotypes' cadence — §2 L2), NOT tuned to
  // any record (G6). The logged-days floor is the garbage-baseline guard, and `contrastAlpha` is the
  // one statistical knob; the property sweep locks the null false-positive rate at these values.
  trialResponse: {
    // 49 days = 7 weeks. Covers both the ~daily post-prandial and the ~few-times-a-week empty-stomach
    // cadence, while staying inside the pet's current era. Capped at history by the logged-days
    // denominator — a pet with 12 days of pre-trial logs gets a 12-logged-day baseline, no more.
    baselineDays: 49,
    // 7 logged days per window: enough that a per-logged-day rate means something, and enough that a
    // one-or-two-day baseline can't out-rate the trial and mint a false contrast. Below it → no card;
    // the trial-so-far counts still show on the standing Pet-tab line (PR 6), which reads local data.
    minLoggingDaysPerWindow: 7,
    // Conventional two-sided 0.05; the exact test is small-n-quiet by construction, so this is the
    // only sensitivity knob. The §PROPERTY SWEEP asserts a stationary null trial fires ≪ this.
    contrastAlpha: 0.05,
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
    // Signals v2 (B-755 / CUL-7) — ⑤ suppresses a same-symptom ⑥ ONLY when ≥ this fraction of ⑥'s
    // cluster episodes are also ⑤'s meal-adjacent (rapid) ones. 0.5 = "a majority of the clock
    // cluster IS the post-prandial episode set" — i.e. ⑥ is genuinely restating ⑤, not describing a
    // different (empty-stomach / broader) clock pattern. Owned + adversarial-gated. Safe direction is
    // toward KEEPING ⑥ (the fix exists to stop the shipped rule hiding an empty-stomach clock finding
    // whenever any ⑤ fires — deep-dive F1), so the threshold is a majority, not a small overlap.
    suppressionOverlapFraction: 0.5,
  },
  // B-340 per-incident visual red-flag lane. windowDays 14 = "the last two weeks": recent
  // enough that a photographed blood / foreign-material flag still warrants leading Home, short
  // enough that a resolved incident stops alarming (the owner's edit-the-field clear works within
  // it too). The exact recency is a Dr. Chen call — flagged for PR-1 adversarial ratification.
  incidentRedFlag: {
    windowDays: 14,
  },
  // B-053 coverage-diagnostic floors. stapleMinMeals keeps "X is in most of what the pet
  // eats" honest; stapleMinSymptomEpisodes mirrors the correlation Early episode floor
  // (correlation.earlyMinMatchedPairs = 3) so staple-washout only fires when the staple is
  // the SOLE blocker — closing the below-floor masquerade (see the field doc + adversarial
  // review, B-053). B-070: stapleDominanceFraction widens the v1 sole-protein test to ≥80%
  // dominance over exposures (meals + treats); stapleSourceMajorityFraction pins the copy's
  // meal/treat register. Tune on real data, not a re-decision.
  coverage: {
    stapleMinMeals: 4,
    stapleMinSymptomEpisodes: 3,
    stapleDominanceFraction: 0.8,
    stapleSourceMajorityFraction: 0.8,
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
  // B-102 PR 5 — human-food provenance covariate window. 60 days matches the descriptive
  // lane (⑤/⑥) so "off-commercial-diet days" are bounded to the pet's current era. Tune on
  // real data, not a re-decision.
  humanFood: {
    windowDays: 60,
  },
  // Signals v2 (B-755 / CUL-10) — the L4 gap-shortening lane. `runLength` is a SWEEP RESULT, not a
  // preference (§9 / the ⑥ CALIBRATION NOTE above is the precedent): the spec's provisional monotone-3
  // fires ~16.7% by chance on any null, so it was calibrated UP to a 4-gap run — measured null FPR ~2%
  // on constant-rate nulls, an ⑥-style DISCLOSED ~5–6% on autocorrelated waxing/waning nulls (§PROPERTY
  // SWEEP; the adversarial-review residual, named not hidden). Every value is a null-model result or a
  // g-chart anchor, never Nyx's record (G6).
  gapShortening: {
    // 3 gaps / 4 episodes — the g-chart anchor (deep-dive §3) and the lowest data floor in the engine;
    // the WATCHING-row floor. A 3-gap record is watched (§4.4), not fired on (firing needs runLength).
    minGaps: 3,
    // 4, the SWEEP's answer to the monotone-runs-by-chance trap (monotone-3 ≈ 16.7% by luck → 4.2% at
    // a 4-run; ~2% with the ratio gate on constant-rate nulls, a disclosed ~5–6% on autocorrelated ones).
    // The firing floor is therefore 4 gaps / 5 episodes — still the engine's lowest, and squarely in the
    // g-chart's "informative from 3–5 gaps" band. (runLength=5 would drop the autocorrelated residual
    // under 2% at a 6-episode floor — the Dr. Chen 4-vs-5 decision brief; kept at 4 for the sub-floor mission.)
    runLength: 4,
    // At most half the record's median gap — "meaningfully shorter than typical", the g-chart
    // lower-limit analog. Loose by design (the FPR is held by runLength, not this); the §RECALL test
    // asserts a real shortening clears it and the §PROPERTY SWEEP measures the joint null rate.
    gapShorteningRatio: 0.5,
    // 2× the latest (shortest) gap — the open interval past which the accelerating run has not
    // continued and the row would misstate the present. Escalate-safe (only ever suppresses a fire).
    recencyGraceFactor: 2,
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
  // B-067/CUL-372 — re-based onto the ONE shared predicate. The body that used to
  // live here now lives in `lib/symptomEpisodes.ts` verbatim, because the Home Trend
  // chart needs the SAME collapse and a second implementation is how two surfaces end
  // up printing different counts for the same week (the defect B-067 recorded). This
  // wrapper stays so the engine's per-call `config.symptomEpisodeGapHours` remains the
  // engine's own knob. Behaviour-preserving: no redeploy is required for correctness.
  return collapseToEpisodeOnsets(symptomMsList, gapHours)
}

/** A meal reduced to the fields the correlation/coverage logic needs. */
interface ClassifiedMeal {
  ms: number
  /**
   * The feeding's FULL canonical protein set (B-351 slice 6), never empty — a
   * feeding whose food carries no usable protein is dropped by classifyMeals, exactly
   * as the single-protein version dropped a null canonicalization. Ordered with the
   * owner-designated primary first (readProteinSet's hoist), though nothing in
   * detector ① depends on the order: an exposure is set MEMBERSHIP.
   */
  proteins: string[]
  attribution: AttributionConfidence
  /**
   * food_items.food_type for this exposure (B-070). Detector ① IGNORES it (an exposure is
   * an exposure — a chicken treat is a chicken exposure exactly like a chicken meal, which
   * is why an omnipresent treat protein correctly washes out). Its only consumer is the
   * staple-washout meal/treat split (resolveStapleSource), which keeps the copy honest.
   */
  foodType: 'meal' | 'treat' | 'other' | null
  /**
   * This exposure was a co-logged medication VEHICLE (B-156 PR C1). Carried so
   * windowExposures can attribute it to the drug instead of crediting it as a food
   * correlate — see MealEvent.isMedicationVehicle. Defaults false (no pairing).
   */
  isMedicationVehicle: boolean
}

/**
 * Classifiable meals: at least one known (canonicalized) protein + valid time, carrying
 * attribution confidence (absent → 'high', per today's per-pet logging semantics).
 * Sorted ascending. B-052: each protein key is canonicalized (lowercase/trim +
 * by-product/meal qualifier strip + junk-sentinel drop) so one real protein doesn't
 * fracture across `chicken` / `Chicken By-Product Meal` / the `"null"` string and
 * starve the matched-pair counts. A meal whose whole set canonicalizes away carries no
 * usable protein and is excluded — this is the detection.ts line-498 discard, shared by
 * detectCorrelations AND the B-053 staple-washout coverage diagnostic so the
 * "classifiable meal" definition has ONE source and cannot drift.
 *
 * B-351 slice 6: the unit is now the food's whole protein SET, not `primary_protein`
 * alone. This is the sensitivity half of §2 — you cannot detect a contaminant you never
 * recorded — and it is a pure widening: a food whose set is `['duck']` behaves exactly
 * as it did, and a row with no `proteins` degrades to `[primaryProtein]`.
 */
function classifyMeals(mealEvents: MealEvent[]): ClassifiedMeal[] {
  return mealEvents
    .map((m) => ({
      ms: Date.parse(m.occurredAt),
      proteins: readProteinSet(m.proteins, m.primaryProtein),
      attribution: (m.attributionConfidence ?? 'high') as AttributionConfidence,
      foodType: m.foodType ?? null,
      isMedicationVehicle: m.isMedicationVehicle === true, // B-156 PR C1; absent ⇒ false
    }))
    .filter((m): m is ClassifiedMeal => m.proteins.length > 0 && Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)
}

/** A free-fed standing fact reduced to the fields the correlation logic needs (B-040). */
interface StandingExposure {
  /**
   * The bowl's canonical protein SET (B-351 slice 6). EMPTY when the food is
   * unidentified — the arrangement is still a generic standing confounder (it caps
   * the tier) but names no protein to exclude, exactly as the old `null` did.
   */
  proteins: string[]
  /**
   * The bowl's canonicalized PRIMARY protein alone, or null. Used ONLY by the Bonferroni
   * family floor (see `familyFloorPadding`) to reconstruct which proteins a primary-only
   * engine would have excluded. Never used for candidacy — that reads the whole set.
   */
  primary: string | null
  /** Active-window start in ms (-Infinity = unbounded past — active since before lookback). */
  fromMs: number
  /** Active-window end in ms, end-of-day-INCLUSIVE (+Infinity = still active / bowl still down). */
  untilMs: number
  /** Single-pet free-fed = 'high'; multi-cat shared bowl = 'low' (deferred). Absent → 'high'. */
  attribution: AttributionConfidence
}

/**
 * Reduce free-fed arrangements to standing exposures with parsed, end-of-day-
 * inclusive active windows (B-040). The protein SET is read through the SAME
 * readProteinSet/canonicalizeProtein path as meals (ONE source — a free-fed "Chicken
 * By-Product Meal" and a logged "chicken" meal must resolve to the same key, or the
 * exclusion would miss the discrete logs of the free-fed food). `active_from`/`active_until`
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
      proteins: readProteinSet(a.proteins, a.primaryProtein),
      primary: canonicalizeProtein(a.primaryProtein),
      fromMs,
      untilMs,
      attribution: (a.attributionConfidence ?? 'high') as AttributionConfidence,
    })
  }
  return out
}

/** A medication exposure window reduced to a parsed [fromMs, untilMs] span (B-117 PR 9). */
interface MedSpan {
  fromMs: number
  untilMs: number
}

/**
 * Reduce medication windows (regimen spans + dose points) to parsed ms spans (B-117 PR 9).
 * Unlike classifyArrangements, this does NOT add a day to `untilMs`: the caller already
 * normalizes regimen DATE ends to end-of-day instants, and a dose window is a precise POINT
 * (untilMs === fromMs) that must stay a point. A span with an unparseable edge is dropped (a
 * garbage window must never silently confound every finding); an INVERTED span (until < from)
 * is dropped, but an equal-edge POINT is kept — that IS a dose. Null from → -Infinity
 * (on board since before lookback); null until → +Infinity (still on board / through now).
 */
function classifyMedicationWindows(windows: MedicationWindow[]): MedSpan[] {
  const out: MedSpan[] = []
  for (const w of windows) {
    const fromMs = w.activeFrom == null ? -Infinity : Date.parse(w.activeFrom)
    if (Number.isNaN(fromMs)) continue
    let untilMs: number
    if (w.activeUntil == null) {
      untilMs = Infinity
    } else {
      const parsed = Date.parse(w.activeUntil)
      if (Number.isNaN(parsed)) continue
      untilMs = parsed
    }
    if (untilMs < fromMs) continue // inverted span exposes nothing; a point (==) is a valid dose
    out.push({ fromMs, untilMs })
  }
  return out
}

/** One matched case/control pair, reduced to what clustering reads. */
interface ExposurePair {
  caseExp: Map<string, AttributionConfidence>
  ctrlExp: Map<string, AttributionConfidence>
}

/**
 * Collinearity clustering — the Data Scientist's guardrail, made exact (B-351 §7 #2).
 *
 * THE PROBLEM. Set-membership capture is an unambiguous win for EXPOSURE (§2 Job 1)
 * and a real risk for ATTRIBUTION (Job 2): once a "duck" food also declares chicken,
 * chicken and duck may appear in exactly the same windows, and the engine has no basis
 * whatsoever for blaming one of them. Crediting duck there is a false attribution; and
 * because a card names one protein, it also exonerates the other BY OMISSION — on the
 * flagship wedge surface, for the elimination-trial owner, which is the single worst
 * place in this product to be quietly wrong.
 *
 * THE DEFINITION — and why it needs no threshold. Two proteins are clustered iff their
 * exposure INDICATOR VECTORS over this symptom's matched set (case and control window of
 * every pair) are IDENTICAL. That is not a heuristic. Every statistic detector ① computes
 * — caseExposed, controlExposed, b, c, and therefore riskDifference and the exact McNemar
 * p — is a pure function of that vector. Identical vectors produce a bit-identical test
 * result, so the data does not merely make separation *hard*, it makes it IMPOSSIBLE:
 * splitting them would emit two cards asserting different things about indistinguishable
 * evidence. Clustering them is recognising a degeneracy, not applying a tolerance.
 *
 * This answers the spec's open "how collinear is collinear enough — 100% or a fraction?"
 * with EXACT IDENTITY, deliberately. A fraction would merge proteins the matched set CAN
 * separate — throwing away real attribution, and adding a tunable parameter whose only
 * defensible value is the one that changes nothing. The floors already govern how much
 * separation is *enough* to speak: a protein that differs in one window still has to
 * clear earlyMinDiscordantCaseOnly / earlyMinRiskDifference on its own, and a protein
 * that falls short simply produces no card — which is silence, never an all-clear
 * (§9). So the near-collinear case degrades into the engine's existing conservatism
 * rather than into a false exoneration.
 *
 * It resolves as the diet varies, with nothing to re-tune — but the honest statement of
 * that is narrower than it first looks, and the adversarial pass falsified the loose one.
 * The vector is defined over the MATCHED SET, and matching is 1:1 nearest-eligible-control,
 * so most days never enter the analysis at all. Feeding the two apart on a day that is
 * never selected as a case or control window changes NOTHING — reproduced: the same
 * separation on day 0 left the cluster intact and on day 1 split it. So the true claim is
 * "the first time they differ inside a window the matcher selects", the owner-facing copy
 * says "would START to separate them" rather than promising a result, and B-469 records the
 * coverage limitation (whose real fix is B-049's 1:M matching, not anything here).
 *
 * Note this does NOT weaken the case for exact identity above — that rests on the test
 * statistic being a pure function of the vector, which is true regardless of how many days
 * reach the matched set. It only removes a convenience argument that was doing no work.
 *
 * WHY IT IS PER-SYMPTOM. The vector is defined over a symptom type's matched set, and
 * those sets differ (each symptom carries its own window length and its own control
 * days). Chicken and duck can be inseparable for the 12h vomit windows and separable
 * for the 72h derm ones. Clustering globally would import one symptom's degeneracy into
 * another's evidence.
 *
 * ZERO-VECTOR PROTEINS ARE NOT CLUSTERED. A protein exposed in no analysed window has
 * an all-zero vector; every such protein would otherwise merge into one nonsense cluster
 * ("chicken and lamb"). They cannot produce a finding (riskDifference is 0 by
 * construction), but they DO sit in the Bonferroni family, so merging them would shrink
 * the family and LOOSEN the corrected alpha for unrelated real findings. They stay
 * singletons — exactly as they are today.
 *
 * Members are returned ascending; clusters in ascending order of their first member, so
 * the whole pass is deterministic.
 */
function clusterCollinearProteins(candidates: string[], pairs: ExposurePair[]): string[][] {
  const byVector = new Map<string, string[]>()
  const singletons: string[][] = []
  for (const protein of candidates) {
    let vector = ''
    let exposed = false
    for (const pair of pairs) {
      const inCase = pair.caseExp.has(protein)
      const inCtrl = pair.ctrlExp.has(protein)
      if (inCase || inCtrl) exposed = true
      vector += (inCase ? '1' : '0') + (inCtrl ? '1' : '0')
    }
    // Never-exposed → its own candidate; see ZERO-VECTOR note above.
    if (!exposed) {
      singletons.push([protein])
      continue
    }
    const bucket = byVector.get(vector)
    if (bucket) bucket.push(protein)
    else byVector.set(vector, [protein])
  }
  return [...byVector.values(), ...singletons]
    .map((members) => [...members].sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
}

/**
 * Owner-facing name for a candidate: one protein, or a cluster named jointly. Never
 * abbreviates to a representative — the whole point of a joint candidate is that no
 * single member may stand for it (see CorrelationFinding.protein).
 */
export function jointProteinLabel(members: string[]): string {
  if (members.length <= 1) return members[0] ?? ''
  if (members.length === 2) return `${members[0]} and ${members[1]}`
  return `${members.slice(0, -1).join(', ')} and ${members[members.length - 1]}`
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
  // Medication exposure spans (B-117 PR 9, §8). A drug ON BOARD in a symptom window is a
  // CONFOUNDER — it never becomes a finding. Two effects, applied per symptom type below:
  //   • CASE-ENRICHED (the drug clears the SAME case-crossover bar a protein must to be an
  //     Early correlate — present in materially more case windows than control) → SUPPRESS
  //     that symptom's food correlations. This is the §1 antibiotic-not-chicken case.
  //   • PRESENT but CONCORDANT (chronic steady-state, in both arms equally → the self-matching
  //     controls for it) → does NOT suppress, but caps the tier at Early (§8 "caveated"; mirrors
  //     a free-fed standing exposure capping Established).
  // Empty ⇒ medActive is always false ⇒ byte-identical to pre-B-117 behavior.
  const medSpans = classifyMedicationWindows(input.medicationWindows ?? [])

  // Every protein the pet was exposed to, from every feeding's WHOLE set (B-351 slice 6).
  // Sorted so candidate emission order — and therefore the pre-rank order of equal-strength
  // findings — is a function of the data, not of Map/insertion order.
  const proteins = Array.from(new Set(meals.flatMap((m) => m.proteins))).sort()
  // The protein set a PRIMARY-ONLY engine would have seen — the pre-slice-6 candidate pool.
  // Its only consumer is the Bonferroni family floor below; nothing about candidacy,
  // exposure or attribution reads it.
  const primaryOnlyProteins = new Set(
    input.mealEvents
      .map((m) => canonicalizeProtein(m.primaryProtein))
      .filter((p): p is string => p !== null),
  )
  // Need contrast: a single constant diet can't be correlated against anything. This
  // sole-protein case is one end of what the B-053 staple-washout diagnostic explains
  // (B-070 widened it to ≥80% DOMINANCE — a dominant staple that has contrast still
  // reaches here, washes out as concordant, and is explained the same way); see
  // detectStapleWashout.
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
      mealCount++ // a logged feeding — the window IS logging-eligible (even a vehicle-only one)
      // B-156 PR C1: a medication VEHICLE (a meal/treat that carried a co-logged dose) is
      // the drug's carrier, not an independent food exposure. Its protein and the drug are
      // collinear by construction for THIS exposure, so we attribute it to the drug (which
      // enters separately as a MedicationWindow) and credit NO food exposure here. It still
      // counted toward mealCount above — the owner logged a feeding, so the window is
      // logging-eligible for OTHER proteins' absence; we just don't let the vehicle food
      // build its own food→symptom case. PER-EXPOSURE (not candidacy-wide like free-fed):
      // the same food without a pill on another day still credits its protein normally.
      if (m.isMedicationVehicle) continue
      // B-351 slice 6 — the feeding contributes its WHOLE set. A protein is exposed in
      // this window iff it is in ANY in-window feeding's set, and each member inherits
      // THIS feeding's attribution (one 'low' exposure caps that protein, unchanged).
      for (const protein of m.proteins) {
        if (m.attribution === 'low' || !exposures.has(protein)) {
          exposures.set(protein, m.attribution)
        }
      }
    }
    const windowStart = anchorMs - windowMs
    let standingInWindow = false
    const standingProteins = new Set<string>()
    const standingPrimaries = new Set<string>()
    for (const s of standing) {
      // Interval overlap of the standing active span [fromMs, untilMs) with the
      // exposure window [windowStart, anchorMs].
      if (s.fromMs <= anchorMs && windowStart < s.untilMs) {
        standingInWindow = true
        // EVERY protein the standing bowl carries is uncontrolled background, not just
        // the one on the front of the pack (B-351 slice 6). An unidentified food
        // contributes an empty set — a generic confounder that names nothing.
        for (const protein of s.proteins) standingProteins.add(protein)
        if (s.primary !== null) standingPrimaries.add(s.primary)
      }
    }
    // Was ANY medication on board in this window (B-117 PR 9)? Inclusive interval overlap of
    // the med span [fromMs, untilMs] with the exposure window [windowStart, anchorMs] — `<=`
    // on both edges so a dose POINT (fromMs === untilMs) at exactly windowStart/anchorMs counts,
    // matching the meal exposure boundary. Identity-agnostic: any drug present sets the flag.
    let medActive = false
    for (const m of medSpans) {
      if (m.fromMs <= anchorMs && windowStart <= m.untilMs) {
        medActive = true
        break
      }
    }
    return { exposures, mealCount, standingInWindow, standingProteins, standingPrimaries, medActive }
  }

  interface Candidate {
    /** The collinearity cluster this candidate represents — ascending, length ≥1. */
    proteins: string[]
    /** `proteins.length > 1`. Read by the tier gate: collinearity caps at Early (§7 #4). */
    jointCandidate: boolean
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
    /**
     * A medication was on board for ≥1 of this symptom's matched pairs but is NOT
     * case-enriched (B-117 PR 9, §8). A present-but-concordant drug is controlled by the
     * self-matching, so it does NOT suppress the finding, but — like a free-fed standing
     * exposure — it is an uncontrolled variable that caps the tier at Early ("caveated").
     * The CASE-ENRICHED case never reaches here: it suppresses the whole symptom type
     * before candidates are built.
     */
    medicationPresent: boolean
    symptomEventCount: number
  }
  const candidates: Candidate[] = []
  // ── The Bonferroni family FLOOR (adversarial review, slice 6) ──────────────────────
  //
  // `correctedAlpha` divides by the family size, so anything that SHRINKS the family
  // LOOSENS the bar — and the adversarial pass reproduced two ways slice 6 shrinks it,
  // each promoting an UNRELATED finding Early → Established with byte-identical statistics:
  //
  //   (a) a MERGE — two previously-separate proteins become collinear once secondaries are
  //       declared, so 4 clusters become 3;
  //   (b) a WIDER FREE-FED EXCLUSION — a standing bowl used to remove ONE protein from
  //       candidacy and now removes every protein it declares (up to MAX_CAPTURED_PROTEINS).
  //       This one is the sharper of the two, because a bowl overlapping only ONE symptom
  //       lane still shrinks the family shared by ALL lanes, while the `standingConfounder`
  //       tier cap does NOT travel across lanes.
  //
  // In both, the NEW number is arguably the more honest count of comparisons actually
  // made — but the consequence is that a finding's tier becomes a function of capture
  // events about *other foods*, moving toward MORE confidence, and `established` is the
  // tier §8.5 uses to decide what reaches a vet at all. That is the exact class of defect
  // `suppressedFamilyCount` was added to prevent ("suppression can never promote an
  // unrelated finding's tier"), so the same stance applies: the family may never be
  // smaller than a primary-only engine would have made it.
  //
  // PROVISIONAL (flagged for PM / Data ratification, spec §7 #2): this deliberately
  // forgoes a real loosening that better capture arguably earns, in exchange for the
  // guarantee that photographing one bag can never strengthen a claim about a different
  // protein. It does NOT re-introduce the "4–5 proteins bloat the family" objection §7 #2
  // rules out — the floor is a floor, so a 4-protein bag still costs ONE comparison, and
  // the bar against a real single-protein correlate is unchanged.
  let familyFloorPadding = 0
  // Would-be candidates withdrawn by the medication confounder pass (B-117 PR 9). These
  // were FULLY tested (a real matched set was built, the pseudo-exposure test ran) and then
  // withdrawn for a confound — so they still consumed a comparison and must still count
  // toward the Bonferroni family below. Without this, suppressing one symptom type shrinks
  // `candidates.length` and inflates an UNRELATED symptom's finding Early→Established
  // (adversarial review, B-117 PR 9 — a real tier wart, though never a false reassurance).
  let suppressedFamilyCount = 0

  for (const symptomType of LANE_SYMPTOM_TYPES.correlation) {
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
      /** A medication was on board in the CASE window (B-117 PR 9 confounder analysis). */
      medInCase: boolean
      /** A medication was on board in the matched CONTROL window (B-117 PR 9). */
      medInControl: boolean
    }[] = []
    // Proteins under an active free-fed arrangement that was in-window for ≥1 matched
    // pair (case OR control) of this symptom. These are excluded from candidacy — a
    // free-fed food is background context, never a clean correlate on its own (§3).
    // Scoped to actual overlap: an ENDED arrangement whose span touches none of these
    // windows leaves its protein evaluable on the discrete data it WAS controlled for.
    const freeFedProteins = new Set<string>()
    // The primary-only subset of the above, for the family floor. A bowl declaring a SECOND
    // protein excludes that protein from candidacy — correct, but it also removes a
    // comparison from the family, which is a tier-LOOSENING move driven by a capture event
    // about a different food. This set records what a primary-only engine would have
    // excluded, so the floor can hold the family where it was.
    const freeFedPrimaries = new Set<string>()
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
        standingPrimaries: Set<string>
        medActive: boolean
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
      for (const p of caseWin.standingPrimaries) freeFedPrimaries.add(p)
      for (const p of bestCtrl.standingPrimaries) freeFedPrimaries.add(p)
      pairs.push({
        caseExp: caseWin.exposures,
        ctrlExp: bestCtrl.exposures,
        standing: caseWin.standingInWindow || bestCtrl.standingInWindow,
        medInCase: caseWin.medActive,
        medInControl: bestCtrl.medActive,
      })
    }

    if (pairs.length < cfg.earlyMinMatchedPairs) continue

    // Candidacy is resolved in TWO steps, and the order is load-bearing:
    //   1. drop free-fed proteins (background context, never a clean correlate — §3);
    //   2. cluster what remains by exposure vector (§7 #2).
    // Free-fed FIRST, because a standing bowl is present in nearly every window: were it
    // clustered in, its all-ones vector would drag any genuinely-omnipresent discrete
    // protein into a joint candidate with a protein that is not a candidate at all —
    // manufacturing a "chicken and duck" card out of an exclusion.
    const clusters = clusterCollinearProteins(
      proteins.filter((p) => !freeFedProteins.has(p)),
      pairs,
    )

    // How many comparisons a primary-only engine would have made for this symptom. See
    // `familyFloorPadding`. Uses `freeFedPrimaries`, not `freeFedProteins`, precisely so a
    // bowl's newly-declared secondaries cannot shrink the floor along with the family.
    const primaryOnlyFamilyFloor = Array.from(primaryOnlyProteins).filter(
      (p) => !freeFedPrimaries.has(p),
    ).length
    familyFloorPadding += Math.max(0, primaryOnlyFamilyFloor - clusters.length)

    // If a free-fed standing exposure sat in-window for ANY matched pair, the whole
    // matched set for this symptom is confounded → cap every candidate at Early
    // (§3 engine rule). One uncontrolled standing exposure is enough; we are
    // conservative-on-certainty, matching the rest of the engine.
    const standingConfounder = pairs.some((p) => p.standing)

    // ── Medication confounder analysis (B-117 PR 9, §8) ──────────────────────────────
    // Treat "a drug was on board" as a PSEUDO-EXPOSURE and run it through the SAME
    // case-crossover arithmetic a protein faces. The drug confounds this symptom's food
    // correlations when it is CASE-ENRICHED — present in materially more case windows than
    // control windows, clearing the EXACT bar (earlyMinDiscordantCaseOnly, earlyMinRiskDifference,
    // b>c) a protein must clear to be an Early correlate. When it does, we cannot statistically
    // separate "drug causes the symptom" from "food causes the symptom" (they are collinear in
    // the matched set), and a systemic drug plausibly shifts the response to ALL foods — so the
    // honest, never-false-attribution output is to SUPPRESS every food→symptom correlation for
    // this symptom type. This is the §1 "antibiotic, not chicken" harm.
    //
    // Why case-enrichment, not mere presence: a CHRONIC steady-state drug is on board in BOTH
    // arms of every pair → medB ≈ medC ≈ 0 → not case-enriched → it does NOT suppress (the
    // self-matching already controls for it — otherwise we'd gut the flagship wedge for exactly
    // the chronically-ill pets who need it most). Only a drug whose on/off TRANSITION falls
    // inside the analysis window (an acute course overlapping the symptom cluster, whose
    // symptom-free controls are systematically off-drug) becomes case-enriched. The few
    // boundary pairs a recently-started chronic drug produces are diluted by the riskDifference
    // floor across the matched set, so they do not trip suppression.
    //
    // SUPPRESSION NEVER REASSURES: it removes cards; the symptom stays tracked, the intake-
    // decline (②) and worsening (④) SAFETY detectors fire independently, the ③ reflection still
    // counts episodes, and an empty correlation set renders building/no_pattern — never "all
    // clear" (§9). A present-but-concordant drug instead caps the tier at Early (medicationPresent
    // below; §8 "caveated") rather than certifying an Established association under an
    // uncontrolled variable — exactly how a free-fed standing exposure caps.
    let medCaseExposed = 0
    let medControlExposed = 0
    let medB = 0
    let medC = 0
    for (const p of pairs) {
      if (p.medInCase) medCaseExposed++
      if (p.medInControl) medControlExposed++
      if (p.medInCase && !p.medInControl) medB++
      else if (!p.medInCase && p.medInControl) medC++
    }
    const medicationPresent = medCaseExposed > 0 || medControlExposed > 0
    const medRiskDifference = (medCaseExposed - medControlExposed) / pairs.length
    const medicationConfounds =
      medB >= cfg.earlyMinDiscordantCaseOnly &&
      medB > medC &&
      medRiskDifference >= cfg.earlyMinRiskDifference
    if (medicationConfounds) {
      // Suppress this symptom type's food correlations entirely — but FIRST record the
      // candidates we are withdrawing so they still count toward the multiple-comparison
      // family (they exactly match the cluster loop below — one comparison per CLUSTER,
      // not per raw protein, or a suppressed symptom would over-count the family).
      // Keeps correctedAlpha STABLE so suppression can never promote an unrelated finding's tier.
      suppressedFamilyCount += Math.max(clusters.length, primaryOnlyFamilyFloor)
      continue
    }

    // ONE candidate per cluster — which is what keeps the Bonferroni family sized by
    // DISCRIMINATING clusters rather than raw protein count (§7 #2, the Data Scientist's
    // "4–5 proteins bloat the family" objection). Free-fed proteins were already removed
    // above, so every cluster here is genuinely evaluable.
    for (const cluster of clusters) {
      // The members share one exposure vector by construction, so the matched-pair
      // arithmetic can read any of them — but the ATTRIBUTION floor cannot: two proteins
      // can be co-exposed in identical windows while one of them also rode a low-confidence
      // shared bowl inside one of those windows. We take the WEAKEST floor across the
      // cluster, because we cannot separate the members: claiming the clean one drove it
      // is the same false credit the cluster exists to prevent.
      const representative = cluster[0]
      let caseExposed = 0
      let controlExposed = 0
      let b = 0
      let c = 0
      let attributionFloor: AttributionConfidence = 'high'
      for (const p of pairs) {
        const inCase = p.caseExp.has(representative)
        const inCtrl = p.ctrlExp.has(representative)
        if (inCase) {
          caseExposed++
          for (const member of cluster) {
            if (p.caseExp.get(member) === 'low') attributionFloor = 'low'
          }
        }
        if (inCtrl) {
          controlExposed++
          // The CONTROL arm counts toward the floor too. The pre-slice-6 code scanned only
          // the case window, so a member attributable only through a shared bowl on control
          // days left the floor at 'high' and the finding could be certified Established —
          // while the docstring said "weakest attribution among this protein's exposures".
          // A discordant pair is built from BOTH windows, so an unattributable control
          // exposure undermines the comparison just as much as a case one.
          for (const member of cluster) {
            if (p.ctrlExp.get(member) === 'low') attributionFloor = 'low'
          }
        }
        if (inCase && !inCtrl) b++
        else if (!inCase && inCtrl) c++
      }
      candidates.push({
        proteins: cluster,
        jointCandidate: cluster.length > 1,
        symptomType,
        windowHours,
        matchedPairs: pairs.length,
        caseExposed,
        controlExposed,
        b,
        c,
        attributionFloor,
        standingConfounder,
        medicationPresent,
        symptomEventCount,
      })
    }
  }

  if (candidates.length === 0) return []

  // Multiple-comparison correction: Bonferroni over the family of (protein × symptom)
  // pairs we evaluated — every protein with a built matched set counts (conservative).
  // `suppressedFamilyCount` keeps medication-withdrawn candidates in the family (B-117 PR 9):
  // they were tested then withheld for a confound, so they still consumed a comparison —
  // otherwise suppression would silently inflate an unrelated finding's tier.
  const correctedAlpha =
    cfg.familywiseAlpha / (candidates.length + suppressedFamilyCount + familyFloorPadding)

  const findings: CorrelationFinding[] = []
  for (const cand of candidates) {
    const {
      matchedPairs,
      caseExposed,
      controlExposed,
      b,
      c,
      attributionFloor,
      standingConfounder,
      medicationPresent,
    } = cand
    const riskDifference = caseExposed / matchedPairs - controlExposed / matchedPairs

    // Positive, case-direction enrichment only, with a coincidence guard on discordants.
    if (riskDifference < cfg.earlyMinRiskDifference) continue
    if (b < cfg.earlyMinDiscordantCaseOnly) continue
    if (b <= c) continue

    const pValue = mcNemarExactRightTail(b, c)

    // Established requires the higher sample floor AND corrected significance AND clean
    // attribution AND no uncontrolled confounder in-window. A 'low' (shared-bowl)
    // attribution, a free-fed standing confounder (B-040), OR a present-but-concordant
    // medication on board (B-117 PR 9, §8 "caveated") each cap the finding at Early — an
    // uncontrolled variable means we cannot certify a clean Established association. (A
    // CASE-ENRICHED medication never reaches here; it suppressed the symptom type above.)
    // A JOINT candidate is capped at Early, unconditionally (§7 #4: "a cluster with only
    // collinear/low-confidence exposures caps at Early"). The build originally capped on
    // attribution confidence alone, which is a DIFFERENT guarantee — a perfectly collinear
    // {chicken, duck} cluster with clean attribution and 6 matched pairs reached
    // Established and printed "chicken and duck reached the established association
    // threshold" on the vet report. Established is the tier §8.5 uses to decide what a vet
    // sees at all, and certifying an association we cannot even attribute to a specific
    // antigen is precisely the claim that tier is supposed to withhold. Collinearity is
    // itself an uncontrolled variable, so it caps exactly as a standing confounder or an
    // on-board medication does. (Caught by the adversarial pass; the spec had said this and
    // the build had not.)
    const tier: EvidenceTier =
      !cand.jointCandidate &&
      attributionFloor === 'high' &&
      !standingConfounder &&
      !medicationPresent &&
      matchedPairs >= cfg.establishedMinMatchedPairs &&
      pValue <= correctedAlpha
        ? 'established'
        : 'early'

    findings.push({
      type: 'food_symptom_correlation',
      priorityClass: 'insight',
      tier,
      symptomType: cand.symptomType,
      // The LABEL names the whole cluster (see CorrelationFinding.protein) — a joint
      // candidate must never be narrowed to a representative on any surface.
      protein: jointProteinLabel(cand.proteins),
      proteins: cand.proteins,
      jointCandidate: cand.jointCandidate,
      // Resolved in the engine, never in the copy layer — see CorrelationFinding.jointGuidance.
      jointGuidance: cand.jointCandidate
        ? input.pet.dietTrialActive
          ? 'ask_vet'
          : 'feed_apart'
        : null,
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
  /** Original ISO occurred_at (B-213 — the `lastFullMealIso` anchor needs the exact instant, not just `ms`). */
  occurredAt: string
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
      occurredAt: m.occurredAt,
      score: intakeScore(m.intakeRating as IntakeRating),
      foodItemId: m.foodItemId,
      foodLabel: m.foodLabel ?? null,
    }))
    .filter((m) => Number.isFinite(m.ms))
    .sort((x, y) => x.ms - y.ms)
}

/**
 * B-213 — the ISO of the most recent FULLY-eaten meal (`all`), or null when none. `meals`
 * is sorted ascending, so the last `all`-scored entry is the most recent. `>= FULL_MEAL_SCORE`
 * is `=== 4` today (the max), written as a floor so it can't silently invert if the enum grows.
 */
const FULL_MEAL_SCORE = intakeScore('all')
function lastFullMeal(meals: RatedMeal[]): string | null {
  for (let i = meals.length - 1; i >= 0; i--) {
    if (meals[i].score >= FULL_MEAL_SCORE) return meals[i].occurredAt
  }
  return null
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

  // B-213 — the conservative "last full meal" anchor, computed ONCE over the rated meals
  // and shared by whichever finding(s) fire. `ratedMeals` is sorted ascending, so the last
  // element scoring `all` is the most recent fully-eaten meal. Uses the full rated set (not
  // just windowMeals) so a decline running longer than the baseline window still traces to a
  // real "last full meal" instead of silently clamping the gap shorter (never-reassure).
  const lastFullMealIso = lastFullMeal(ratedMeals)

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
          lastFullMealIso,
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

    // `prior` = this food's history on days BEFORE the latest meal's day. We exclude
    // the WHOLE latest calendar day (not a naive slice(0,-1)), so several re-logged
    // refusals of one food on one day read as ONE refusal, not a history of refusals.
    // Without this, the earlier same-day refusals fall into `prior`, drag priorMean
    // below normallyEatenScoreFloor, and SILENTLY suppress the watch the HARDER the pet
    // refuses — an inverse-pseudoreplication false-negative (a dog refusing its usual
    // food 3× in one day went silent; 1× correctly fired). This is a never-reassure
    // safety failure (§9 / §11 #1). Ported from lib/analytics.ts detectIntakeDecline
    // (B-090): the client health-watch led with this fix; porting it here re-converges
    // the two decline surfaces so they can never disagree on a refusal.
    const latestDayKey = utcDateKey(latest.ms)
    const prior = sorted.filter((m) => utcDateKey(m.ms) !== latestDayKey)
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
      lastFullMealIso,
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
 * Distinct UTC calendar days carrying ANY logged event (symptom or meal) whose instant
 * falls in [startMs, endMs). The coarse "was the app used at all" density measure — ONE
 * source, shared by ③/④'s logging-eligibility floor (computeWindowedStats) and the SR-4
 * density-comparability gate (computeReflectionDensity, B-721 §3.3), so the two can never
 * drift on what "a logged day" means. UTC day-bucketing matches the rest of this module.
 */
function loggingDaysInWindow(input: DetectionInput, startMs: number, endMs: number): number {
  const days = new Set<number>()
  for (const s of input.symptomEvents) {
    const ms = Date.parse(s.occurredAt)
    if (Number.isFinite(ms) && ms >= startMs && ms < endMs) days.add(Math.floor(ms / MS_PER_DAY))
  }
  for (const m of input.mealEvents) {
    const ms = Date.parse(m.occurredAt)
    if (Number.isFinite(ms) && ms >= startMs && ms < endMs) days.add(Math.floor(ms / MS_PER_DAY))
  }
  return days.size
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

  const loggingEligible =
    loggingDaysInWindow(input, currentStart, nowMs) >= cfg.minLoggingDaysPerWindow &&
    loggingDaysInWindow(input, priorStart, currentStart) >= cfg.minLoggingDaysPerWindow

  const stats: SymptomStat[] = []
  for (const symptomType of LANE_SYMPTOM_TYPES.symptomDelta) {
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

  // GLOBAL chronicity gate (§4.4, detector ⑦ — THE VALVE): the reflection layer also stays
  // silent if ANY tracked symptom is chronic. This is the never-reassure heart of the
  // chronicity lane — without it, the IMPROVING TAIL of a chronic course (4→3→1 episodes/wk,
  // still recent) renders ③'s soothing "improving — down from 4" on a pet that has been sick
  // for weeks and is still symptomatic, the single biggest mis-action risk the vet council
  // named. The gate is GLOBAL (any chronic symptom blanks the WHOLE layer, exactly like the
  // worsening gate) so a chronic vomiting course can't let a calm "itch is improving" surface
  // alongside it (§4.7 #4). It shares the EXACT predicate detector ⑦ fires on —
  // `isChronic(s) && s.loggingEligible` (computeChronicityStats carries the per-symptom
  // logging-eligibility guard; detectChronicity gates on the same conjunction) — so "③ goes
  // silent ⟺ ⑦ speaks" holds by construction and the valve cannot drift, the same provably-
  // closed architecture as ④'s shared `isWorsening`.
  const chronicityStats = computeChronicityStats(input, config)
  if (chronicityStats?.some((s) => isChronic(s, config.chronicity) && s.loggingEligible)) {
    return []
  }

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

/**
 * SR-4 (B-721 §3.3) — the falling-comparison density threshold. A FALLING reflection's
 * week-over-week comparison ("down from N last week") is trustworthy only when this week
 * was logged with COMPARABLE density to last week — otherwise a quieter-looking week may
 * just be a less-logged one. `comparable` is true when the current window's logged-days
 * count is at least this fraction of the prior window's. Asymmetric on purpose (§3.3):
 *   • density ROSE or held (current ≥ prior)  → always comparable (the fall is real).
 *   • density FELL below this fraction         → NOT comparable → the comparison is
 *     WITHHELD (templateReflection drops the clause; the client discloses why). That is
 *     the fail-toward-escalation direction: we never manufacture a reassuring "down from
 *     N" out of a week we simply logged less. It never touches a RISING safety comparison
 *     (worsening ④ is a different finding), and never adds a comparison — it only removes
 *     one, so it is safe flag-on AND flag-off (§7).
 *
 * 0.7 chosen against the small [3,7] logged-days range a reflection can occupy (both
 * windows clear `minLoggingDaysPerWindow=3`): a single-day drop (7→6, 6→5, 5→4, 4→3 …)
 * stays comparable, while a proportional drop of ≳30% (7→4, 6→4, 6→3, 5→3 …) withholds.
 * A named, adversarial-review-gated constant, tunable on real data — not a re-decision.
 */
export const DENSITY_COMPARABLE_MIN_RATIO = 0.7

/**
 * SR-4 (B-721 §3.3) — compute the week-over-week logging-density comparison for the
 * reflection surface. PURE and side-effect-free; reuses the EXACT window boundaries and
 * logged-day definition ③/④ use (`config.reflection.windowDays`, `loggingDaysInWindow`),
 * so "this week / last week" means the same thing here as in the detector. It reads only
 * the events already in `input` — no new data — and is attached to the reflection finding
 * POST-detection (index.ts), so it changes nothing about what fires or how it ranks.
 * Returns null only when `input.now` is unparseable (mirrors computeWindowedStats).
 *
 * The measure is "days-with-any-log" (§3.3's chosen definition), inheriting the same
 * meals-can-mask-a-symptom-gap residual computeWindowedStats documents; this gate is an
 * ADDITIONAL protection on the falling comparison, layered on top of the detector's own
 * symptom-day-spread guard, never a replacement for it.
 */
export function computeReflectionDensity(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): ReflectionDensity | null {
  const cfg = config.reflection
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null
  const windowMs = cfg.windowDays * MS_PER_DAY
  const currentStart = nowMs - windowMs
  const priorStart = nowMs - 2 * windowMs
  const currentLoggingDays = loggingDaysInWindow(input, currentStart, nowMs)
  const priorLoggingDays = loggingDaysInWindow(input, priorStart, currentStart)
  // priorLoggingDays === 0 ⇒ density did not FALL (it could only have risen), so the
  // comparison is not an artifact of less logging → comparable, and no divide-by-zero.
  const comparable =
    priorLoggingDays === 0
      ? true
      : currentLoggingDays >= priorLoggingDays * DENSITY_COMPARABLE_MIN_RATIO
  return { comparable, currentLoggingDays, priorLoggingDays }
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
      LANE_SYMPTOM_TYPES.symptomDelta.indexOf(a.symptomType) -
      LANE_SYMPTOM_TYPES.symptomDelta.indexOf(b.symptomType)
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

// ── Detector ⑦: symptom chronicity / persistence (B-182 — the safety chronicity lane) ──
//
// The single strongest TRUE signal in the data that the engine never stated (vet-council
// deep-dive §9 #1): chronicity. ④ fires on a week-over-week RISE and is silent on a
// flat-but-relentless six-week course; ③ renders that same course CALM ("same as last
// week"). ⑦ owns the orthogonal DURATION axis — "this has been going on for weeks and is
// not resolving" — escalating toward a vet, never causal, and (the cardinal requirement)
// never letting a flat or improving-looking chronic course read as reassurance (§4.7).
//
// It is a long-span PERSISTENCE test, not a two-window delta: it couples to ④'s episode-
// collapsing + honesty-floor philosophy (toEpisodeOnsets, a coarse logging floor) but has
// its own windowing helper (computeChronicityStats) and its own floors (§4.3). Fires on
// the §4.3 CONJUNCTION — DURATION (span) AND BURDEN (episodes) AND DISTRIBUTION (active
// weeks) AND RECENCY (still ongoing) — each floor closing a distinct §10 break that any
// single floor alone is fooled by (two distant endpoints fool span; one acute multi-bout
// day fools episodes; sparse single-vomit weeks fool active-weeks). Runs on ALL correlation
// symptoms. Template-only phrasing, like ③/④/⑤/⑥.
//
// SILENCE IS NEVER WELLNESS (§4.7, the never-reassure asymmetry made concrete):
//   • A recently-SETTLED course (last episode older than ongoingRecencyDays) → SILENT, and
//     emits NO resolution copy. The pet falls to the honest no_pattern/building state, NOT
//     an all-clear (the mirror of ④'s "absence is silence, not wellness").
//   • A below-floor result (short / sparse / few episodes) → SILENT, never "the {symptom}
//     doesn't seem to be a lasting problem" (never inverted).
//
// SCOPE SPLIT (B-182 build plan §8): PR 1 was the PURE, ADDITIVE detector + payload + config +
// registry entry. PR 2 (this change) adds the COMPOSITION-LAYER couplings: the ③-suppression
// VALVE (§4.4 — the shared `isChronic` gate in detectReflections that blanks the reflection
// layer so the "improving tail" can't reassure), same-symptom ④-suppression with firm-tier
// INHERITANCE (§4.5, D1 — suppressWorseningWhenChronic), the within-safety-band ranking
// (SAFETY_TYPE_ORDER: chronicity above worsening), and the B-188 phase-stable activeWeeks fix
// (countDistributionWeeks). resolveChronicityTier stays span-only/pure — the worsening
// inheritance is a fact about the COMPOSED set, so it lives with the suppression in the
// composition layer, not in the detector.

/** Per-symptom chronicity measures over the §6 lookback — the substrate of detector ⑦. */
interface ChronicityStat {
  symptomType: SymptomType
  episodeCount: number
  spanDays: number
  /** Phase-stable distribution count (countDistributionWeeks); the B-188 replacement for now-anchored buckets. */
  activeWeeks: number
  symptomDays: number
  daysSinceLastEpisode: number
  /** Epoch ms of the first lookback onset — carried for the firstOnsetIso "since {month}" copy. */
  firstOnsetMs: number
  /**
   * Both HALVES of THIS symptom's onset span clear the coarse logging-days floor (reuse of
   * reflection.minLoggingDaysPerWindow "over the span" — §4.3 / §6). The §4.3 logging-
   * eligibility guard: a course can't be "ongoing across the span" if the owner logged
   * nothing across half of it — that span is MANUFACTURED from two distant data points
   * (a recent cluster + a couple of stale singles), not a sustained course. Counts DISTINCT
   * days with ANY logged event (symptom of any type OR meal), the same coarse "was the app
   * used" floor ④ uses. Defense-in-depth alongside the activeWeeks distribution floor (§10 #4).
   */
  loggingEligible: boolean
}

/**
 * Phase-stable distribution count (B-188 fix) — the number of distinct ~weekly periods in
 * which the symptom recurred, computed from the onset DATA ALONE (never `now`). A greedy
 * minimum-7-day-gap packing: walk onsets oldest→newest and count an onset as a new
 * "distribution week" only when it is ≥7 days after the last counted one.
 *
 * This REPLACES the original now-anchored bucket measure (`floor((now − onset)/7d)`), which
 * had two faults the PR-1 adversarial review surfaced (B-188): (a) it was NON-DETERMINISTIC —
 * identical data flipped fire↔silent across calendar days as the bucket grid slid under `now`;
 * and (b) a tight consecutive-day CLUSTER could STRADDLE a bucket edge, so a two-cluster
 * "barbell" (3 stale + 3 recent, a long quiet gap between) could reach activeWeeks 3 — the
 * exact two-endpoint/one-cluster shape §4.3 claims the floor EXCLUDES. Greedy packing fixes
 * both: it depends only on the sorted onsets (phase-stable), and a cluster of episodes within
 * any 7-day reach counts ONCE (a barbell → 2, never 3), while a genuinely distributed course
 * (steady q2-day, or intermittent alternating weeks) still counts one week per ~7-day step —
 * so every clinical fixture's activeWeeks is unchanged. `>=` (not `>`) so an exactly-7-day
 * cadence (one episode per calendar week) counts each week, matching the steady-course intent.
 */
function countDistributionWeeks(onsetsMs: number[]): number {
  if (onsetsMs.length === 0) return 0
  const weekMs = 7 * MS_PER_DAY
  const sorted = [...onsetsMs].sort((a, b) => a - b)
  let count = 1
  let anchor = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - anchor >= weekMs) {
      count++
      anchor = sorted[i]
    }
  }
  return count
}

/**
 * Compute per-symptom chronicity stats over the §6 lookback. Pure; returns null only when
 * `now` is unparseable. Symptoms with NO onset in the lookback are omitted (their span/
 * recency are undefined — and a zero-episode symptom is never chronic).
 *
 * Episode counting reuses toEpisodeOnsets (the SAME 3h re-log collapse as ③/④/⑤ — a bout
 * logged five times is one episode, not five). activeWeeks is the PHASE-STABLE distribution
 * count (countDistributionWeeks) — a DISTRIBUTION measure (across weeks), not two endpoints
 * and not one cluster, and not dependent on `now` (the B-188 fix; the old now-anchored bucket
 * measure let a tight cluster straddle a bucket edge). Day-bucketing for symptomDays is UTC,
 * exactly as ③/④ do; chronicity is a duration/recency measure and is timezone-independent (no
 * `timezone` input — §2, unlike ⑥).
 *
 * loggingEligible is checked PER SYMPTOM over that symptom's own onset span (§4.3 "over the
 * span") — NOT over the fixed 56-day window, which would wrongly silence a legitimate recent
 * 3-week course whose older weeks are simply before the owner started logging.
 */
function computeChronicityStats(
  input: DetectionInput,
  config: DetectionConfig,
): ChronicityStat[] | null {
  const cfg = config.chronicity
  const floor = config.reflection.minLoggingDaysPerWindow
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null

  const windowStart = nowMs - cfg.windowDays * MS_PER_DAY

  const allEventMs = [
    ...input.symptomEvents.map((s) => Date.parse(s.occurredAt)),
    ...input.mealEvents.map((m) => Date.parse(m.occurredAt)),
  ].filter((ms) => Number.isFinite(ms))

  /** Distinct UTC days with ANY logged event in [start, end] (inclusive end). */
  const loggingDaysIn = (start: number, end: number): number => {
    const days = new Set<number>()
    for (const ms of allEventMs) {
      if (ms >= start && ms <= end) days.add(Math.floor(ms / MS_PER_DAY))
    }
    return days.size
  }

  const stats: ChronicityStat[] = []
  for (const symptomType of LANE_SYMPTOM_TYPES.chronicity) {
    const msList = input.symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    const onsets = toEpisodeOnsets(msList, config.symptomEpisodeGapHours).filter(
      (ms) => ms >= windowStart && ms < nowMs,
    )
    if (onsets.length === 0) continue

    const firstOnsetMs = Math.min(...onsets)
    const lastOnsetMs = Math.max(...onsets)
    // Split the onset span in half; each half must clear the coarse logging floor. A
    // single-instant span (acute multi-bout one day) degenerates to an empty first half
    // and is rejected here too (it also fails the span floor — defense in depth).
    const spanMidMs = (firstOnsetMs + lastOnsetMs) / 2
    const loggingEligible =
      loggingDaysIn(firstOnsetMs, spanMidMs) >= floor &&
      loggingDaysIn(spanMidMs, lastOnsetMs) >= floor

    stats.push({
      symptomType,
      episodeCount: onsets.length,
      spanDays: Math.floor((lastOnsetMs - firstOnsetMs) / MS_PER_DAY),
      activeWeeks: countDistributionWeeks(onsets),
      symptomDays: new Set(onsets.map((ms) => Math.floor(ms / MS_PER_DAY))).size,
      daysSinceLastEpisode: Math.floor((nowMs - lastOnsetMs) / MS_PER_DAY),
      firstOnsetMs,
      loggingEligible,
    })
  }
  return stats
}

/**
 * The §4.3 chronicity predicate — ALL four floors must pass: genuine DURATION (span),
 * SUSTAINED BURDEN (episodes), DISTRIBUTION across weeks (activeWeeks) AND STILL-ONGOING
 * (recency). The conjunction is the point: each floor alone is fooled by a distinct shape
 * (§4.3 / §10), together they require sustained-distributed-durable-recent presence.
 *
 * This is the predicate the PR-2 ③-suppression valve (§4.4) will share — one predicate,
 * two consumers, so "③ goes silent ⟺ ⑦ speaks" holds by construction (the same provably-
 * closed architecture as ④'s `isWorsening`). Exported for that PR-2 reuse. NOTE: the
 * per-symptom logging-eligibility guard lives on the ChronicityStat (computeChronicityStats);
 * detectChronicity gates on `isChronic(s) && s.loggingEligible`, and PR 2's valve must too.
 */
export function isChronic(s: ChronicityStat, cfg: DetectionConfig['chronicity']): boolean {
  const floors = chronicityFloorsFor(s.symptomType, cfg)
  return (
    s.spanDays >= floors.minSpanDays &&
    s.episodeCount >= floors.minEpisodes &&
    s.activeWeeks >= floors.minActiveWeeks &&
    s.daysSinceLastEpisode <= floors.ongoingRecencyDays
  )
}

/**
 * The per-type floor resolver — the ONLY way a chronicity floor is read (W1-PR-3b
 * session 1). Global floors overlaid with the type's `perType` entry; no entry ⇒ the
 * globals unchanged. Resolving INSIDE isChronic / resolveChronicityTier (rather than
 * at each call site) is what makes ⑦, its tier and the ③-valve share the per-type
 * floors by construction — a consumer cannot forget to resolve.
 *
 * UNDEFINED-HARDENED (adversarial finding, 2026-08-28): `Partial<{…}>` admits a
 * present-but-undefined value, and a bare spread would overwrite a global floor with
 * `undefined` — after which `episodeCount >= undefined` is false and the SAFETY lane
 * goes silent on a 6-week q2-day course. That is reassurance-by-absence, minted by a
 * config shape a programmatically-assembled override produces naturally. So an
 * undefined floor is treated exactly like an absent one, and the pin lives in
 * laneMembership.test.ts.
 */
export function chronicityFloorsFor(
  symptomType: SymptomType,
  cfg: DetectionConfig['chronicity'],
): DetectionConfig['chronicity'] {
  const over = cfg.perType?.[symptomType]
  if (!over) return cfg
  const resolved = { ...cfg }
  for (const [k, v] of Object.entries(over)) {
    if (v !== undefined) (resolved as Record<string, unknown>)[k] = v
  }
  return resolved
}

/**
 * Resolve the duration-anchored copy-urgency tier (§4.6). Span-only: 'firm' (≥6 weeks →
 * "book a vet visit") iff the course is long enough on its own, else 'standard' ("a word
 * with your vet"). The §4.5 firm INHERITANCE arm (firm when the same symptom is also
 * worsening week-over-week) is applied in suppressWorseningWhenChronic — see the note below.
 */
function resolveChronicityTier(
  s: ChronicityStat,
  cfg: DetectionConfig['chronicity'],
): ChronicityTier {
  return s.spanDays >= chronicityFloorsFor(s.symptomType, cfg).firmSpanDays ? 'firm' : 'standard'
}
// NOTE: the §4.6 firm-tier INHERITANCE arm (firm when the same symptom is also worsening
// week-over-week) is applied downstream in suppressWorseningWhenChronic, not here — that fact
// is only knowable from the COMPOSED finding set, and keeping this resolver pure/span-only is
// what let PR 1 ship it with no untested clinical path.

export function detectChronicity(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): SymptomChronicityFinding[] {
  const cfg = config.chronicity
  const stats = computeChronicityStats(input, config)
  if (!stats) return []

  // Fire only on the §4.3 conjunction AND the per-symptom logging-eligibility guard (a
  // dark half of the span means a manufactured, not sustained, course — §10 #4).
  const chronic = stats.filter((s) => isChronic(s, cfg) && s.loggingEligible)
  if (chronic.length === 0) return []

  // One card only — the MOST chronic symptom: longest span, then most episodes, then
  // symptom-type order. Calm safety surface over completeness (§4.5 tie-break, §5).
  chronic.sort((a, b) => {
    if (b.spanDays !== a.spanDays) return b.spanDays - a.spanDays
    if (b.episodeCount !== a.episodeCount) return b.episodeCount - a.episodeCount
    return (
      LANE_SYMPTOM_TYPES.chronicity.indexOf(a.symptomType) -
      LANE_SYMPTOM_TYPES.chronicity.indexOf(b.symptomType)
    )
  })

  const s = chronic[0]
  return [
    {
      type: 'symptom_chronicity',
      priorityClass: 'safety',
      symptomType: s.symptomType,
      episodeCount: s.episodeCount,
      spanDays: s.spanDays,
      activeWeeks: s.activeWeeks,
      symptomDays: s.symptomDays,
      daysSinceLastEpisode: s.daysSinceLastEpisode,
      firstOnsetIso: new Date(s.firstOnsetMs).toISOString(),
      tier: resolveChronicityTier(s, cfg),
      windowDays: cfg.windowDays,
      associationalOnly: true,
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

// NOTE (Signals v2 / CUL-7): ⑤'s former inline `TimedFeeding` + `classifyTimedFeedings` +
// `nearestPreceding` + `freeFedNear` + the rapid-band test are GONE — they moved to
// `lib/mealTiming.ts` (the one meal-relative timing predicate, G9) in PR 1 and are called via
// `classifyEpisodeSet` in `scanVomitTiming` below. ⑤ and L1 (empty-stomach) both read that ONE
// distribution, so their bands, denominators and eligibility can never drift (§3, the §5.3
// diet-trial lesson pre-empted). The rewrite is behaviour-preserving IN EVERY OWNER-FACING FIELD —
// the gate order, boundary inclusivity and NULL-tolerant-feeding / strict-witnessed-onset asymmetry
// match ⑤ as shipped — with ONE audited exception (B-788): the equal-ms nearest-feeding TIE-BREAK
// flipped. v27's inline `nearestPreceding` overwrote on every qualifier (LAST of two same-ms feedings
// won); `lib/mealTiming.ts:nearestPrecedingFeeding` uses strict `f.ms > best.ms` (FIRST wins). This
// changes ONLY `feedingFormsInEvidence` under same-timestamp feedings — no band, count, rank, or
// firing decision moves, and the ⑤ card template omits the form — but the label rides into the vet
// report, so it is NOT strictly byte-identical there. Ungated (⑤ is a shipped detector, not a v2
// lane), so B-777's flag-off gate does not touch it; the fix (align the shared predicate ↔ client +
// report) is the B-788 Data/T&S call.

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
  const sorted = [...events].sort((a, b) => a.ms - b.ms)
  // B-067/CUL-372 — re-based onto the ONE shared collapse. This used to re-spell the
  // chaining loop verbatim so it could carry each episode's confidence through, which
  // made it a SECOND implementation inside the very file that owns the first. It now
  // asks the shared predicate for the onset instants and maps each back to its onset
  // EVENT (§2: "the onset event's confidence is the episode's confidence").
  //
  // `Array.prototype.sort` is stable, so the first event at an onset instant is the
  // same element the old loop selected — behaviour-preserving, including for two
  // events sharing a millisecond.
  const onsetMsList = collapseToEpisodeOnsets(sorted.map((e) => e.ms), gapHours)
  const episodes: ConfidenceEpisode[] = []
  let cursor = 0
  for (const onsetMs of onsetMsList) {
    while (cursor < sorted.length && sorted[cursor].ms !== onsetMs) cursor++
    if (cursor >= sorted.length) break
    episodes.push({ onsetMs, confidence: sorted[cursor].confidence })
  }
  return episodes
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** ⑤ and L1 run on vomit only — see the SCOPE note above (and L1's mirror below). */
const POSTPRANDIAL_SYMPTOM_TYPE: SymptomType = 'vomit'

/**
 * The ONE `MealTimingConfig` both ⑤ (rapid) and L1 (long) classify with, so their band splits
 * are coherent and `timing_story` can merge them (§3, G9). The rapid boundary + lookback come
 * from ⑤'s config (`postprandial`, the origin lane); the long boundary comes from L1's config
 * (`emptyStomach`). `episodeGapHours` is carried for completeness — `classifyEpisodeSet` does no
 * collapse itself (the caller collapses first, per the module's window-then-classify contract).
 */
function timingConfigFor(config: DetectionConfig): MealTimingConfig {
  return {
    rapidWindowMinutes: config.postprandial.rapidWindowMinutes,
    longGapHours: config.emptyStomach.longGapHours,
    feedingLookbackHours: config.postprandial.feedingLookbackHours,
    episodeGapHours: config.symptomEpisodeGapHours,
  }
}

/** The shared vomit-timing scan ⑤ and L1 both read — ONE distribution over ONE eligible set. */
interface TimingScan {
  /** The banded eligible episodes + bandCounts (rapid/mid/long) over the eligible denominator. */
  dist: ReturnType<typeof classifyEpisodeSet>
  /** All in-window vomit episodes (any confidence) — the "of N total, M could be timed" context. */
  totalEpisodes: number
  /** Time-eligible feeding instants (ms) in-window — the feeding RATE base for ⑤'s grazing guard. */
  inWindowFeedings: number[]
  /** ALL time-eligible feeding instants (ms), sorted — for L1's PER-EPISODE local base rate (an episode
   *  near the window start may have its nearest feed just before windowStart). */
  allFeedings: number[]
  nowMs: number
}

/**
 * Run the shared eligibility ladder over the pet's vomit episodes (Signals v2 / CUL-7). Collapses
 * on the FULL vomit list, THEN windows (the `lib/mealTiming.ts` contract — collapse-then-window,
 * never the reverse), then classifies every in-window episode through `classifyEpisodeSet` (the
 * one predicate, G9). Returns null only when `now` is unparseable. ⑤ reads `dist.bandCounts.rapid`,
 * L1 reads `dist.bandCounts.long`; both share `dist.eligibleCount` and `totalEpisodes`, so the
 * denominators can never disagree.
 */
function scanVomitTiming(input: DetectionInput, config: DetectionConfig): TimingScan | null {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null
  // ⑤ and L1 share the analysis window (⑤'s `windowDays`), so the merged card has one window.
  const windowStart = nowMs - config.postprandial.windowDays * MS_PER_DAY
  const timingConfig = timingConfigFor(config)

  // Feedings: DB rows → FeedingInput (parse the instant; carry the evidence-only form). The
  // NULL-tolerant witnessed filter + sort live in `lib/mealTiming.ts` (`classifyEpisodeSet`
  // prepares them once), so a caller can't forget it and anchor a claim on an estimated feeding.
  const feedings: FeedingInput[] = input.mealEvents.map((m) => ({
    ms: Date.parse(m.occurredAt),
    confidence: m.occurredAtConfidence ?? null,
    form: m.foodLabel ?? m.foodType ?? null,
  }))
  // Free-fed standing facts (B-040): a bowl available in the preceding window makes
  // "minutes since last logged feeding" fiction. classifyArrangements parses + drops garbage/
  // inverted spans (untilMs > fromMs), satisfying isFreeFedNear's valid-span precondition.
  const freeFedSpans: FreeFedSpan[] = classifyArrangements(input.feedingArrangements ?? []).map(
    (s) => ({ fromMs: s.fromMs, untilMs: s.untilMs }),
  )

  const vomitEvents = input.symptomEvents
    .filter((s) => s.type === POSTPRANDIAL_SYMPTOM_TYPE)
    .map((s) => ({ ms: Date.parse(s.occurredAt), confidence: s.occurredAtConfidence ?? null }))
    .filter((e) => Number.isFinite(e.ms))
  const collapsed = collapseEpisodes(vomitEvents, config.symptomEpisodeGapHours)
  const inWindowEpisodes = collapsed.filter((e) => e.ms >= windowStart && e.ms <= nowMs)

  const dist = classifyEpisodeSet(
    inWindowEpisodes.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    feedings,
    freeFedSpans,
    timingConfig,
  )

  const allFeedings = timedEligibleFeedings(feedings).map((f) => f.ms) // sorted ascending
  const inWindowFeedings = allFeedings.filter((ms) => ms >= windowStart && ms <= nowMs)

  return { dist, totalEpisodes: inWindowEpisodes.length, inWindowFeedings, allFeedings, nowMs }
}

export function detectPostprandialTiming(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): PostprandialTimingFinding[] {
  const cfg = config.postprandial
  const scan = scanVomitTiming(input, config)
  if (!scan) return []
  const { dist, totalEpisodes, inWindowFeedings, nowMs } = scan
  const recencyMs = cfg.recencyDays * MS_PER_DAY

  const eligibleCount = dist.eligibleCount
  // Denominator floor (adversarial-review fix, B-078/B-081): "N of M" needs a real M.
  // Also guards the fraction division below (minEligibleEpisodes ≥ 1).
  if (eligibleCount < cfg.minEligibleEpisodes) return []
  const rapidEpisodes = dist.eligible.filter((e) => e.band === 'rapid')
  const rapidCount = rapidEpisodes.length

  // Floors (§3.3) — ALL must pass. Below-floor is SILENCE, never an inverted "not
  // meal-related" claim (§3.5).
  if (rapidCount < cfg.minRapidEpisodes) return []
  if (rapidCount / eligibleCount < cfg.minRapidFraction) return []
  // Recency: a stale cluster must not lead today's surface.
  if (!rapidEpisodes.some((e) => nowMs - e.onsetMs <= recencyMs)) return []

  // The GRAZING GUARD (§3.3) — observed rapid must clear 2× the chance-expected count.
  // feedingRatePerDay = timed-eligible feedings ÷ distinct days carrying one (in-window).
  const feedingDays = new Set(inWindowFeedings.map((ms) => Math.floor(ms / MS_PER_DAY))).size
  const feedingRatePerDay = feedingDays > 0 ? inWindowFeedings.length / feedingDays : 0
  const expectedRapid =
    eligibleCount * Math.min(1, (feedingRatePerDay * cfg.rapidWindowMinutes) / 1440)
  if (rapidCount < Math.max(cfg.minRapidEpisodes, cfg.minObservedToExpectedRatio * expectedRapid)) {
    return []
  }

  // Payload. "Including the last two" = the two most-recent ELIGIBLE episodes are both rapid.
  const byOnsetDesc = [...dist.eligible].sort((a, b) => b.onsetMs - a.onsetMs)
  const lastTwoEligibleRapid =
    byOnsetDesc.length >= 2 && byOnsetDesc[0].band === 'rapid' && byOnsetDesc[1].band === 'rapid'
  const medianMinutesSinceFeeding = Math.round(
    median(rapidEpisodes.map((e) => e.minutesSinceFeeding)),
  )
  const feedingFormsInEvidence = Array.from(
    new Set(rapidEpisodes.map((e) => e.feedingForm).filter((f): f is string => f != null)),
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
      // Signals v2 (CUL-7) — the rapid onset instants feed the episode-set-aware ⑤-suppresses-⑥ rule.
      rapidEpisodeOnsets: rapidEpisodes.map((e) => e.onsetMs),
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

/** The winning clock band over a set of pet-local hours (0–23) — ⑥'s max-count sliding-window
 *  scan, extracted so BOTH ⑥ and L1's clock-composition evidence use the ONE scan (Signals v2 /
 *  CUL-7). Slides a `windowHours`-wide window over the 24h circle in 1h steps (24 wrap-around
 *  positions), takes the max-count band, and — among equal-count windows — prefers one whose START
 *  hour is OCCUPIED, then the earliest such start (the B-079 tie-break: tightens the band's leading
 *  edge onto where episodes actually begin). Returns null for an empty input. Deterministic; the
 *  fire DECISION depends only on `count`, so the tie-break never changes whether ⑥ fires. */
function clockConcentration(
  localHours: readonly number[],
  windowHours: number,
): { startLocalHour: number; count: number } | null {
  if (localHours.length === 0) return null
  const counts = new Array<number>(24).fill(0)
  for (const h of localHours) counts[h]++
  let bestStart = 0
  let bestCount = -1
  let bestStartOccupied = false
  for (let start = 0; start < 24; start++) {
    let c = 0
    for (let k = 0; k < windowHours; k++) c += counts[(start + k) % 24]
    const startOccupied = counts[start] > 0
    if (c > bestCount || (c === bestCount && startOccupied && !bestStartOccupied)) {
      bestCount = c
      bestStart = start
      bestStartOccupied = startOccupied
    }
  }
  return { startLocalHour: bestStart, count: bestCount }
}

/** Is a local hour inside the wrap-around band [startLocalHour, startLocalHour + windowHours)? */
function isInClockBand(localHour: number, startLocalHour: number, windowHours: number): boolean {
  return ((localHour - startLocalHour + 24) % 24) < windowHours
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
  // on the clock. (estimated/window/NULL excluded from numerator AND denominator.) Signals v2
  // (CUL-7): keep each onset paired with its local hour so the winning band's episode SET can be
  // emitted for the episode-set-aware ⑤-suppresses-⑥ rule.
  const timed: { onsetMs: number; localHour: number }[] = []
  for (const e of inWindow) {
    if (e.confidence !== 'witnessed') continue
    const h = localHourOfDay(e.onsetMs, tz)
    if (h === null) continue // a single un-convertible instant is dropped, not guessed
    timed.push({ onsetMs: e.onsetMs, localHour: h })
  }

  const eligibleCount = timed.length
  // Denominator floor (§4.3): below this, any "cluster" is a coin run. Also guards the
  // fraction division below (minEligibleEpisodes ≥ 1).
  if (eligibleCount < cfg.minEligibleEpisodes) return []

  // Slide a clusterWindowHours-wide window over the 24h clock and take the max-count band (the
  // shared `clockConcentration` scan — same B-079 occupied-start tie-break as before; the fire
  // decision depends only on `count`, so the extraction is byte-identical). Non-null here because
  // eligibleCount ≥ minEligibleEpisodes ≥ 1.
  const scan = clockConcentration(
    timed.map((t) => t.localHour),
    cfg.clusterWindowHours,
  )!
  const bestStart = scan.startLocalHour
  const bestCount = scan.count

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
      // Signals v2 (CUL-7) — the onsets in the winning band, for the episode-set-aware suppression.
      clusterEpisodeOnsets: timed
        .filter((t) => isInClockBand(t.localHour, bestStart, cfg.clusterWindowHours))
        .map((t) => t.onsetMs),
    },
  ]
}

// ── Detector L1: empty-stomach timing (Signals v2 / B-755 / CUL-7 — the ⑤ mirror) ────
//
// The COMPLEMENT of ⑤. Same eligibility ladder, same denominator, same ONE timing distribution
// (`scanVomitTiming`, G9); where ⑤ counts the RAPID band (≤30 min after eating), L1 counts the LONG
// band (≥ longGapHours = 6h after eating) — the timing phenotype behind early-morning bile/foam
// vomiting. Purely DESCRIPTIVE / anamnesis, exactly like ⑤: owner copy names the TIMING BAND, never
// the syndrome ('BVS'/'bilious'/'empty stomach' are the vet's inference — banned by MECHANISM_RE),
// never a food/form (§9.1), never a bedtime-snack / feeding-schedule SUGGESTION (G3). Below-floor is
// SILENCE, never an inverted "not empty-stomach". VOMIT only, exactly like ⑤ and ⑥.
//
// THE BASE-RATE PROBLEM, and why the guard is not optional (the ⑤ grazing-guard's MIRROR):
// the empty-stomach ≥6h bucket has a large, SCHEDULE-DEPENDENT chance base rate. A cat fed twice
// daily is ≥6h post-meal ~half the day; once daily, ~three-quarters. So a fixed fraction floor
// cannot separate a real empty-stomach pattern from a meal-fed cat whose vomits are merely random
// (the CUL-7 brief's ⑥ analogy — "raise the fraction floor" — is necessary but not sufficient: no
// fixed floor beats the once-daily 0.75 null without also killing every realistic golden). This is
// the OPPOSITE confound to ⑤ (there the grazer inflates the rapid band; here the sparse feeder
// inflates the long band). The empty-stomach GUARD gives each eligible episode its OWN local long
// base rate (`localLongBaseRate` — the long fraction of the actual feeding interval that episode sits
// in) and asks the Poisson-binomial upper tail whether the observed long count exceeds what those
// per-episode schedules would produce by chance. A once/twice-daily feeder whose vomits just match its
// schedule stays silent; a cat whose vomits are DISPROPORTIONATELY empty-stomach fires. Per-episode is
// load-bearing, not incidental: a chronic vomiter's episodes span multiple feeding regimes, so a
// SINGLE base rate over any window is dragged off the recent regime by one old outlier episode and
// fires on noise (the round-2 review break). The seeded property sweep at 6h locks the floors AND this
// guard against uniform-random / Poisson / grazing AND mixed-history-with-outlier null models.
//
// WHAT THE GUARD PROVES, AND WHAT IT DOES NOT (adversarial review round 3 — PASS, ~250k seeded trials +
// a by-hand proof that `localLongBaseRate` is the EXACT per-episode P(long | onset uniform in its
// eligible interval), so no uniform-null false positive above α is constructible). The guard rules out
// exactly ONE confound: the feeding-schedule base rate under uniform-time vomiting. Three named limits
// ride ABOVE this module and are NOT guard-math bugs — do not try to "fix" them here:
//   1. CIRCADIAN vs SCHEDULE (the headline — a Dr. Chen card-copy gate, tracked for CUL-12/PR 5). A cat
//      whose vomiting clusters at a clock hour deep in the long band (a 6pm vomit is 10h past an 8am
//      feed) fires — correctly, because those vomits genuinely ARE ≥6h post-meal. The guard proves
//      "clustered in the long band beyond schedule chance", NOT "caused by an empty stomach". The card
//      must never read as "feed her more often will fix it" — this template already names TIMING ONLY
//      ("a timing pattern worth mentioning to your vet"), carries the clock band as EVIDENCE, and sets
//      `associationalOnly: true`; the CARD renderer must preserve that and add no causal framing.
//   2. LOGGING-GAP INVERSION (a general meal-timing limit, shared with ⑤; a vet-report framing note).
//      An UNLOGGED discrete meal turns genuinely post-prandial vomits into "empty-stomach". Only
//      declared free-fed bowls are excluded; an unlogged meal is invisible to ANY schedule-base-rate
//      guard ("didn't log ≠ didn't eat"). Not fixable inside the guard.
//   3. ONCE-DAILY SENSITIVITY FLOOR (safe direction — silence, never false reassurance). At base ~0.75
//      the exact test needs ~11 all-long episodes to speak, so the phenotype L1 is named for is HARDEST
//      to confirm on a once-daily schedule; the typical once-daily bilious case is really ⑥'s clock lane,
//      which the episode-set-aware suppression now keeps. A real limit, in the safe direction.

/** L1 runs on vomit only, exactly like ⑤ (the empty-stomach phenotype is a vomiting phenotype). */
const EMPTY_STOMACH_SYMPTOM_TYPE: SymptomType = 'vomit'

/**
 * The PER-EPISODE local long base rate — for a symptom episode at `onsetMs`, the fraction of its OWN
 * feeding interval [nearest preceding feed, nearest following feed] (capped at the lookback) that is
 * ≥ longGapHours since the preceding feed. This is the chance a randomly-timed vomit in the feeding
 * regime THIS episode experienced lands in the empty-stomach band: ~0.5 inside a twice-daily (12h)
 * interval, ~0.75 inside a once-daily (24h) one, ~0.25 inside a thrice-daily (8h) one, ~0 inside a
 * grazing (short) one.
 *
 * WHY PER-EPISODE, not one base rate over a window (the round-2 review break): a chronic vomiter's
 * eligible episodes can span MULTIPLE feeding regimes (a schedule that got sparser, or logging that
 * did), and a single global base rate — however the window is chosen — is dragged off the recent
 * regime by a single old outlier episode, firing on noise. Giving each episode the base rate of the
 * interval IT sits in makes the null robust to any number of outliers by construction: an old
 * thrice-daily episode carries ~0.25, a recent once-daily one ~0.75, and the Poisson-binomial test
 * below combines them exactly — no single p is imposed on a two-regime process.
 *
 * `sortedFeedings` are ALL time-eligible feeding instants (ascending). An open trailing interval (no
 * following feed) is treated as a full lookback window — the conservative high base rate. Returns 0
 * only when no preceding feed exists (an episode that could not have been classified long anyway). PURE.
 */
function localLongBaseRate(
  onsetMs: number,
  sortedFeedings: readonly number[],
  longGapHours: number,
  lookbackHours: number,
): number {
  const longMs = longGapHours * MS_PER_HOUR
  const lookbackMs = lookbackHours * MS_PER_HOUR
  let prev = -Infinity
  let next = Infinity
  for (const f of sortedFeedings) {
    if (f <= onsetMs) prev = f
    else {
      next = f
      break
    }
  }
  if (!Number.isFinite(prev)) return 0 // no preceding feed → this episode can't be "long"
  const intervalLen = Math.min(next - prev, lookbackMs) // open trailing interval → the lookback cap
  return intervalLen > 0 ? Math.max(0, intervalLen - longMs) / intervalLen : 0
}

/**
 * Poisson-binomial UPPER-TAIL probability: P(X ≥ k) where X = Σ Bernoulli(pᵢ), the pᵢ independent but
 * NOT identical (Signals v2 / CUL-7). This is L1's base-rate gate — "is the observed long count MORE
 * than the per-episode feeding schedules would produce by chance?" — and the exact generalization of
 * a one-sample binomial to heterogeneous per-trial probabilities (identical pᵢ reduce it to the
 * binomial). It replaced, in turn, a multiplicative ratio guard (unsatisfiable for once-daily cats)
 * and a single-p exact binomial against a windowed base rate (defeated by an old outlier episode
 * dragging the one base rate off the recent regime — round 2). With each episode carrying its OWN
 * local base rate, no outlier can distort the others, and the test self-calibrates the null to ≤ alpha
 * at any mix of regimes.
 *
 * Computed with the exact DP convolution pmf ← pmf ⊛ Bernoulli(pᵢ): pmf'[j] = pmf[j]·(1−pᵢ) +
 * pmf[j−1]·pᵢ. O(n²) at the episode counts a 60-day record produces (n ≤ a few dozen); every pmf entry
 * ∈ [0,1] so there is no overflow. pᵢ are clamped to [0,1] defensively. PURE.
 */
export function poissonBinomialUpperTailProbability(probs: readonly number[], k: number): number {
  const n = probs.length
  if (!Number.isFinite(k)) return 1
  if (k <= 0) return 1 // P(X ≥ 0) = 1
  if (k > n) return 0 // impossible outcome
  let pmf = [1] // P(X = 0) = 1 over zero episodes
  for (const raw of probs) {
    // A non-finite pᵢ maps to 1, NOT 0 — the CONSERVATIVE direction for a false-positive-averse guard.
    // A garbage rate that deflated the expected count (→0) would INFLATE the surprise and could
    // manufacture a fire; mapping it to 1 (this episode is certainly long by chance) maximally raises
    // E[X], so it can only ever make the guard HARDER to fire. Unreachable today — `localLongBaseRate`
    // provably returns a finite value in [0, 0.75] — but the default must fail safe, not surprising.
    const p = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 1))
    const next = new Array<number>(pmf.length + 1).fill(0)
    for (let j = 0; j < pmf.length; j++) {
      next[j] += pmf[j] * (1 - p)
      next[j + 1] += pmf[j] * p
    }
    pmf = next
  }
  let tail = 0
  for (let j = k; j <= n; j++) tail += pmf[j]
  return Math.min(1, tail)
}

export function detectEmptyStomachTiming(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): EmptyStomachTimingFinding[] {
  const cfg = config.emptyStomach
  const scan = scanVomitTiming(input, config)
  if (!scan) return []
  const { dist, totalEpisodes, allFeedings, nowMs } = scan
  const recencyMs = cfg.recencyDays * MS_PER_DAY

  const eligibleCount = dist.eligibleCount
  // Denominator floor — shared with ⑤; "N of M" needs a real M, and it guards the fraction below.
  if (eligibleCount < cfg.minEligibleEpisodes) return []
  const longEpisodes = dist.eligible.filter((e) => e.band === 'long')
  const longCount = longEpisodes.length

  // Floors — ALL must pass. Below-floor is SILENCE, never an inverted "not empty-stomach".
  if (longCount < cfg.minLongGapEpisodes) return []
  if (longCount / eligibleCount < cfg.minLongGapFraction) return []
  // Recency: a stale cluster must not lead today's surface.
  if (!longEpisodes.some((e) => nowMs - e.onsetMs <= recencyMs)) return []

  // The EMPTY-STOMACH GUARD — the observed long count must be MORE than the feeding schedule would
  // produce by chance (a once/twice-daily feeder is ≥6h post-meal much of the day, so a fixed fraction
  // floor cannot separate signal from schedule). Each eligible episode carries its OWN local long base
  // rate (the long fraction of the feeding interval IT sits in), and the Poisson-binomial upper tail
  // tests whether `longCount` exceeds what those per-episode rates predict. This is the round-2 fix: a
  // single base rate over ANY window is dragged off the recent regime by one old outlier episode
  // (which a chronic vomiter always has), firing on noise; per-episode rates are robust to any number
  // of outliers by construction, and the exact test still fires at a high base rate given enough
  // disproportionate evidence (a once-daily cat needs more all-long episodes than a thrice-daily one).
  const nullProbs = dist.eligible.map((e) =>
    localLongBaseRate(
      e.onsetMs,
      allFeedings,
      cfg.longGapHours,
      config.postprandial.feedingLookbackHours,
    ),
  )
  if (poissonBinomialUpperTailProbability(nullProbs, longCount) >= cfg.baseRateAlpha) {
    return []
  }

  // Payload. lastTwoEligibleLong = the two most-recent ELIGIBLE episodes are both long (⑤ mirror).
  const byOnsetDesc = [...dist.eligible].sort((a, b) => b.onsetMs - a.onsetMs)
  const lastTwoEligibleLong =
    byOnsetDesc.length >= 2 && byOnsetDesc[0].band === 'long' && byOnsetDesc[1].band === 'long'
  const medianHoursSinceFeeding =
    Math.round((median(longEpisodes.map((e) => e.minutesSinceFeeding)) / 60) * 10) / 10
  const feedingFormsInEvidence = Array.from(
    new Set(longEpisodes.map((e) => e.feedingForm).filter((f): f is string => f != null)),
  )

  // Clock composition (§2 L1) — the clock concentration of the LONG episodes, carried as EVIDENCE
  // (no separate clock card; the 2–8am fact renders in the A2 expand). NEVER a fire gate: L1 fires on
  // the long fraction regardless of the clock, and the band is absent when no valid timezone is
  // available (never guess UTC — §4.2), so a pet with no zone still gets a full L1 card, minus this
  // one evidence row.
  let clockBand: { startLocalHour: number; windowHours: number } | undefined
  let clockCount: number | undefined
  const tz = input.timezone
  if (tz && localHourOfDay(nowMs, tz) !== null) {
    const longLocalHours = longEpisodes
      .map((e) => localHourOfDay(e.onsetMs, tz))
      .filter((h): h is number => h !== null)
    const clock = clockConcentration(longLocalHours, config.timeofday.clusterWindowHours)
    if (clock) {
      clockBand = {
        startLocalHour: clock.startLocalHour,
        windowHours: config.timeofday.clusterWindowHours,
      }
      clockCount = clock.count
    }
  }

  return [
    {
      type: 'empty_stomach_timing',
      priorityClass: 'insight',
      symptomType: EMPTY_STOMACH_SYMPTOM_TYPE,
      longCount,
      eligibleCount,
      bandCounts: dist.bandCounts,
      totalEpisodes,
      longGapHours: cfg.longGapHours,
      lastTwoEligibleLong,
      medianHoursSinceFeeding,
      feedingFormsInEvidence,
      clockBand,
      clockCount,
      // Signals v2 (CUL-7) — the long onset instants, the composition/evidence counterpart of ⑤'s.
      longEpisodeOnsets: longEpisodes.map((e) => e.onsetMs),
      associationalOnly: true,
      windowDays: config.postprandial.windowDays,
    },
  ]
}

// ── Detector L2: trial-response (Signals v2 / B-755 / CUL-8 — the wedge) ──────
//
// The reactive owner on a vet-directed elimination diet is the highest-intent user, and this lane
// is the record answering "what has the trial done to the symptoms?" — but ONLY as COUNTS the vet
// interprets (G1: no attribution, ever, not to the diet, not to a food, not to a med). It compares
// two windows over LOGGED-DAYS denominators (C5): the trial era [start, now] and a `baselineDays`
// window immediately before it. It emits at most ONE finding, and does so ONLY when the pooled
// comparison "changed materially" — the §8.5 trigger below.
//
// ── THE "CHANGED MATERIALLY" TRIGGER (§8.5 — the definition this PR owns) ─────
//
// The Signal trial card is EVENT-DRIVEN (D3): it surfaces on Home when something changed, while the
// standing Pet-tab trial-card line (PR 6, local data) shows the trial-so-far counts regardless. So
// this detector's EMISSION IS the trigger — a `trial_response` finding exists exactly when the card
// should surface. The definition, adversarial-reviewed here:
//
//   changedMaterially = pooledContrast.gate AND (moreDuringTrial OR (fewerDuringTrial AND densityComparable))
//
//   • `pooledContrast.gate` — the `lib/rateContrast` C-test over the VOMIT-episode counts (re-logs
//     collapsed) with logged-days exposure clears alpha. The exact test is small-n-quiet BY
//     CONSTRUCTION (0-vs-2 never gates), which is the noise defense; the §PROPERTY SWEEP asserts a
//     stationary null trial (identical underlying rate in both windows) fires ≪ alpha. The burden is
//     VOMIT-ONLY, not all tracked types — the adversarial round-2 FAIL: pooling every symptom type let
//     a falling one MASK a rising one (itch 40→0 hiding vomit 1→4), and a per-type "did anything rise"
//     guard could not close a low-count rise (below its own C-test; ④/⑦ have floors leaving a
//     3–5-episode dead zone). Vomit-only removes the cross-symptom subtraction by construction and
//     matches the phenotype rows + the D2 mock. Cost, FLAGGED for PM/Dr. Chen: L2 is silent on a derm-
//     or diarrhoea-led trial in v1 (silence, the safe direction; multi-indication = registered follow-up).
//   • the MORE-during-trial rate (escalation) always surfaces once the pooled gate clears. The
//     FEWER-during-trial rate carries the never-reassure `densityComparable` guard (§3.3, the B-721
//     rule reused but made SYMMETRIC over logging FRACTIONS): a quieter-looking trial may just be a
//     less-logged one. The round-1 break was a one-directional gate that only caught a trial logged
//     LESS than its baseline, while the wedge user's real pattern is the MIRROR — sporadic pre-trial
//     logging, diligent trial logging — which inflates the baseline rate (a symptom-only day IS a
//     logged day) and minted a false fewer 24–94% of the time. Requiring the two windows' logging
//     fractions within-ratio in BOTH directions closes it (measured: that regime's false-fewer → ~0).
//     Withholding the fewer is always the safe direction; the raw counts still show on the standing line.
//
// NAMED LIMITS (documented; the second is FLAGGED for PM/Dr. Chen — a viability call, not a code defect):
//   • a PHENOTYPE-ONLY shift with a flat vomit burden (empty-stomach 7→0 while post-prandial 1→8) does
//     not clear the pooled gate, so L2 stays quiet — but that emergent phenotype is exactly what ⑤/L1
//     fire on separately, so it is re-homed, not lost. Silence, the safe direction.
//   • SYMPTOM-LOGGING ATTRITION behind sustained meal-logging is the deep limit of the FEWER direction,
//     and it is NOT near alpha: if an owner logs vomits diligently early in the trial and tapers later
//     while still confirming meals, the trial vomit count under-counts and a false fewer renders
//     ~14–35% of the time at realistic attrition (adversarial round 2). The density gate is blind to it
//     (meals keep the any-log fraction high), and no detector can distinguish "stopped logging vomits"
//     from "vomits stopped" — the app-wide "didn't log ≠ didn't happen" limit, here on the reassuring
//     side. The structural mitigations are the never-verdict/count-anchored copy, the RTM expand, and
//     the standing raw counts; whether that is enough to ship the FEWER direction (vs. escalate-only in
//     v1) is a Dr. Chen/PM call — the decision brief rides this PR, and the lane stays dark (G10) until.
//
// ── WHAT IT NEVER DOES ───────────────────────────────────────────────────────
//
// No verdict, ever: the phrasing contract bans "working"/"helping"/"improvement"/"ruled out"/"clean"
// (Guilford 2001 — diet response alone is not proof of food sensitivity; RTM — a calm stretch happens
// on its own). Indication-blind: the engine cannot know GI vs dermatologic intent, so the day-count
// sits beside the counts and NEVER implies an assessment point. The trial diet is never named; the
// three-things-changed confound (diet, treats, meals) is DISCLOSED as structure counts, never
// resolved. Below floor / no material change ⇒ SILENCE (never "the trial isn't doing anything").

// The symptom L2 measures — VOMIT, for BOTH the pooled burden and the timing phenotypes (rapid/long),
// mirroring ⑤/L1. "Minutes since eating" is a vomiting question, and pooling only vomit is what closes
// the round-2 cross-symptom masking (see the trigger header). A multi-indication lane is follow-up.
const TRIAL_TIMING_SYMPTOM_TYPE: SymptomType = 'vomit'

/** `target_duration_days` → the "of M" length, or null. The ONLY authority on trial length: the
 *  elapsed days never stand in for it (a trial reads "day 40" whether the target is 42 or unset). A
 *  0/negative/non-finite target has no M — the card renders "day N" with no "of M". */
function normalizeTrialTarget(raw: number | null | undefined): number | null {
  const n = Math.floor(Number(raw ?? 0))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function detectTrialResponse(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): TrialResponseFinding[] {
  const cfg = config.trialResponse
  const trial = input.dietTrial
  const nowMs = Date.parse(input.now)
  if (!trial || !Number.isFinite(nowMs)) return []

  // GATE — the one B-422 predicate, never a re-derivation (§2 L2, G9). A trial past its effective
  // end (or terminal / owner-ended) withdraws the lane rather than comparing a stale window.
  if (
    !isTrialRunning(
      {
        startedAt: trial.startedAt,
        targetDurationDays: trial.targetDurationDays,
        status: trial.status,
        endedAt: trial.endedAt,
      },
      nowMs,
      input.timezone,
    )
  ) {
    return []
  }

  // Windows in LOCAL-DAY-INDEX space (B-514/B-517) — the ONE correct frame, and the same one the trial
  // card counts "day N of M" in. Every event is placed by `localDayIndex(ms, tz)` and compared
  // index-to-index; the boundary is NEVER reconstituted as `startIndex * MS_PER_DAY`, which is UTC
  // midnight of the start DATE and equals the owner's local midnight only at UTC — for any other zone it
  // drifts the trial/baseline boundary by the offset (±14h), misfiling a boundary-morning event into the
  // wrong window (the exact inversion `lib/utils.dayKeyFromIndex` warns about, and the adversarial + code
  // reviews both flagged on round 1). An unparseable start means we cannot place the trial — silence.
  const startIndex = localDayIndexOf(trial.startedAt, input.timezone)
  if (startIndex === null) return []
  const todayIndex = localDayIndex(nowMs, input.timezone)
  const baselineStartIndex = startIndex - cfg.baselineDays
  // day 1 = start day (§5.1), via the ONE shared counter (B-449) — never re-spelled here.
  const trialDayNumber = trialDayCounter(startIndex, todayIndex)

  // Local-day index of an instant on the owner's clock (memoized — `localDayIndex` runs Intl per call
  // when a zone is set, and every event is placed several times below). Null only for a non-finite ms.
  const dayIdxCache = new Map<number, number | null>()
  const dayIndexOf = (ms: number): number | null => {
    if (!Number.isFinite(ms)) return null
    const hit = dayIdxCache.get(ms)
    if (hit !== undefined) return hit
    const di = localDayIndex(ms, input.timezone)
    dayIdxCache.set(ms, di)
    return di
  }
  const inTrialEra = (di: number | null): boolean =>
    di !== null && di >= startIndex && di <= todayIndex
  const inBaseline = (di: number | null): boolean =>
    di !== null && di >= baselineStartIndex && di < startIndex

  // C5 denominators — distinct LOGGED local days per window (a refused bowl is a logged day). The
  // baseline is capped at available history HERE, by the denominator itself: no logs before the pet's
  // earliest event ⇒ those days simply don't count.
  const loggedDaysIn = (pred: (di: number | null) => boolean): number => {
    const days = new Set<number>()
    for (const s of input.symptomEvents) {
      const di = dayIndexOf(Date.parse(s.occurredAt))
      if (pred(di)) days.add(di as number)
    }
    for (const m of input.mealEvents) {
      const di = dayIndexOf(Date.parse(m.occurredAt))
      if (pred(di)) days.add(di as number)
    }
    return days.size
  }
  const trialLoggedDays = loggedDaysIn(inTrialEra)
  const baselineLoggedDays = loggedDaysIn(inBaseline)
  // The garbage-baseline / too-new-trial guard: below the floor a per-logged-day rate is not honest
  // (3 vomits on the one pre-trial day the app was opened must never out-rate a fully-logged trial).
  // Silence, not a card — the §4.4 watching state owns the "needs N logged days" framing (PR 6/7).
  if (trialLoggedDays < cfg.minLoggingDaysPerWindow) return []
  if (baselineLoggedDays < cfg.minLoggingDaysPerWindow) return []

  // The pooled burden is VOMIT episodes only (collapse-then-window: collapse the full vomit list ONCE
  // with the re-log guard, then place each onset by local day index).
  //
  // ⚠️ VOMIT-ONLY, and it is a safety decision, not a scope shortcut — the adversarial round-2 FAIL.
  // Pooling every tracked symptom type into one burden number lets a FALLING type MASK a RISING one: an
  // itch that resolved (40→0) hiding a vomiting that rose (1→4) rendered a reassuring "fewer" over a
  // patient getting sicker, and a per-type "did anything rise" guard could not close it (a low-count
  // rise is below its own C-test, and ④/⑦ have floors that leave a 3–5-episode dead zone). Vomit-only
  // removes the cross-symptom subtraction BY CONSTRUCTION and matches the surface's own scope — the
  // phenotype rows below and the D2 mock ("Empty-stomach 0 · was 7") are already vomiting. The cost,
  // taken knowingly and FLAGGED for PM/Dr. Chen (a decision brief rides this PR): L2 says nothing about a
  // derm- or diarrhoea-led trial in v1 — which is SILENCE, the safe direction, never a false read. A
  // multi-indication trial-response (per-axis, never cross-axis subtraction) is registered follow-up.
  const vomitOnsets = toEpisodeOnsets(
    input.symptomEvents
      .filter((s) => s.type === TRIAL_TIMING_SYMPTOM_TYPE)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms)),
    config.symptomEpisodeGapHours,
  )
  let pooledTrialCount = 0
  let pooledBaselineCount = 0
  for (const ms of vomitOnsets) {
    const di = dayIndexOf(ms)
    if (inTrialEra(di)) pooledTrialCount++
    else if (inBaseline(di)) pooledBaselineCount++
  }

  // The pooled render-gate — `lib/rateContrast` (the C-test; p never surfaces, §3). a = trial,
  // b = baseline, so `a_higher` = a higher per-logged-day rate DURING the trial (escalation).
  const pooledContrast = rateContrast(
    { count: pooledTrialCount, exposure: trialLoggedDays },
    { count: pooledBaselineCount, exposure: baselineLoggedDays },
    { alpha: cfg.contrastAlpha },
  )
  const moreDuringTrial = pooledContrast.direction === 'a_higher'
  const fewerDuringTrial = pooledContrast.direction === 'b_higher'

  // Density comparability (§3.3, "both directions fail toward escalation") — SYMMETRIC, over LOGGING
  // FRACTIONS (logged days ÷ window span), not raw counts.
  //
  // Two reasons it is neither a raw-count ratio nor one-directional. (a) The windows are DIFFERENT
  // LENGTHS (the trial era grows; the baseline is a fixed 49d span), so a raw-count `trialLoggedDays ≥
  // baselineLoggedDays × 0.7` would fail every young trial purely for being shorter — the fraction
  // normalizes that. (b) The adversarial ROUND-1 BREAK: a one-directional gate (withhold only when the
  // TRIAL is under-logged) misses the wedge user's actual pattern, which is the MIRROR — sporadic,
  // symptom-concentrated logging BEFORE the trial, diligent daily logging DURING it. A symptom-only day
  // IS a logged day, so a sparse baseline's per-logged-day rate inflates toward 1.0, and a false "fewer
  // during the trial" is minted from a logging artifact (measured 24–94% of the time in that regime).
  // Requiring the two fractions to be within `DENSITY_COMPARABLE_MIN_RATIO` of EACH OTHER — in BOTH
  // directions — withholds the fewer comparison whenever EITHER window was logged less intensely, the
  // never-reassure direction; the raw counts still show on the standing line. (This coarse "was the app
  // used comparably" backstop still carries the days-with-any-log residual `computeReflectionDensity`
  // documents — a meal-only day can mask a symptom-logging gap when the two fractions happen to match —
  // so it layers on the C-test, never replaces it.)
  const trialWindowDays = Math.max(1, trialDayNumber)
  const trialLoggingFraction = trialLoggedDays / trialWindowDays
  const baselineLoggingFraction = baselineLoggedDays / cfg.baselineDays
  const loFraction = Math.min(trialLoggingFraction, baselineLoggingFraction)
  const hiFraction = Math.max(trialLoggingFraction, baselineLoggingFraction)
  const densityComparable = hiFraction <= 0 ? true : loFraction >= hiFraction * DENSITY_COMPARABLE_MIN_RATIO

  // THE §8.5 TRIGGER. See the header: a material vomit-burden change that fails toward escalation. The
  // MORE direction (escalation) surfaces once the pooled gate clears; the FEWER direction additionally
  // requires comparable logging density (the never-reassure guard — a quieter-looking trial may just be
  // a less-logged one). Cross-symptom masking is closed BY CONSTRUCTION (vomit-only, above), so there is
  // no per-type guard here.
  const changedMaterially =
    pooledContrast.gate && (moreDuringTrial || (fewerDuringTrial && densityComparable))
  if (!changedMaterially) return []

  // Per-phenotype VOMIT-TIMING counts (via `lib/mealTiming`, G9) — the A2 count rows (context, not a
  // trigger). Collapse vomit episodes on the FULL list, classify each through the ONE predicate,
  // then split the eligible episodes by window + band (collapse-then-window).
  const feedings: FeedingInput[] = input.mealEvents.map((m) => ({
    ms: Date.parse(m.occurredAt),
    confidence: m.occurredAtConfidence ?? null,
    form: m.foodLabel ?? m.foodType ?? null,
  }))
  const freeFedSpans: FreeFedSpan[] = classifyArrangements(input.feedingArrangements ?? []).map(
    (s) => ({ fromMs: s.fromMs, untilMs: s.untilMs }),
  )
  const vomitEvents = input.symptomEvents
    .filter((s) => s.type === TRIAL_TIMING_SYMPTOM_TYPE)
    .map((s) => ({ ms: Date.parse(s.occurredAt), confidence: s.occurredAtConfidence ?? null }))
    .filter((e) => Number.isFinite(e.ms))
  const collapsedVomit = collapseEpisodes(vomitEvents, config.symptomEpisodeGapHours)
  const dist = classifyEpisodeSet(
    collapsedVomit.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    feedings,
    freeFedSpans,
    timingConfigFor(config),
  )
  const bandInWindow = (
    band: 'rapid' | 'mid' | 'long',
    pred: (di: number | null) => boolean,
  ): number => dist.eligible.filter((e) => e.band === band && pred(dayIndexOf(e.onsetMs))).length

  // Diet-structure deltas (§2 L2 — context rows, the observable half of the RTM confound). Never a
  // verdict: `treatShare` over classifiable feedings, `mealsPerDay` over logged days. Placed by the
  // SAME local-day predicates as everything else (B-517).
  const dietStructureInWindow = (
    pred: (di: number | null) => boolean,
    loggedDays: number,
  ): { treatShare: number | null; mealsPerDay: number | null } => {
    let meals = 0
    let treats = 0
    for (const m of input.mealEvents) {
      if (!pred(dayIndexOf(Date.parse(m.occurredAt)))) continue
      if (m.foodType === 'meal') meals++
      else if (m.foodType === 'treat') treats++
    }
    const classifiable = meals + treats
    return {
      treatShare: classifiable > 0 ? treats / classifiable : null,
      mealsPerDay: loggedDays > 0 ? meals / loggedDays : null,
    }
  }
  const trialStruct = dietStructureInWindow(inTrialEra, trialLoggedDays)
  const baselineStruct = dietStructureInWindow(inBaseline, baselineLoggedDays)

  return [
    {
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber,
      targetDurationDays: normalizeTrialTarget(trial.targetDurationDays),
      trialLoggedDays,
      baselineLoggedDays,
      baselineWindowDays: cfg.baselineDays,
      pooledTrialCount,
      pooledBaselineCount,
      rapid: {
        trial: bandInWindow('rapid', inTrialEra),
        baseline: bandInWindow('rapid', inBaseline),
      },
      mid: {
        trial: bandInWindow('mid', inTrialEra),
        baseline: bandInWindow('mid', inBaseline),
      },
      long: {
        trial: bandInWindow('long', inTrialEra),
        baseline: bandInWindow('long', inBaseline),
      },
      rapidWindowMinutes: config.postprandial.rapidWindowMinutes,
      longGapHours: config.emptyStomach.longGapHours,
      treatShare: { trial: trialStruct.treatShare, baseline: baselineStruct.treatShare },
      mealsPerDay: { trial: trialStruct.mealsPerDay, baseline: baselineStruct.mealsPerDay },
      // moreDuringTrial || fewerDuringTrial is guaranteed here: changedMaterially excludes the
      // 'equal' direction (gate ⇒ a rate difference; the direction gate requires one of the two).
      comparisonDirection: moreDuringTrial ? 'more_during_trial' : 'fewer_during_trial',
      densityComparable,
      associationalOnly: true,
      trialWindowDays,
    },
  ]
}

// ── Detector L4: gap-shortening (Signals v2 / B-755 / CUL-10 — the sub-floor lane) ──────
//
// The g-chart on inter-event gaps (deep-dive §3) is the ONE tool in the signals sweep that speaks at
// the 4-episodes-in-2-weeks scale (§2 F4) — the sub-floor state that is every new account's first weeks
// by construction. This lane monitors the GAPS BETWEEN a symptom's 3h-collapsed episodes and fires ONLY
// on a SHORTENING run (a rising episode rate), rendered as the plain D2 sentence "the gaps between
// vomiting episodes have been 6 days, then 3, then 2."
//
// ── ESCALATE-ONLY BY CONSTRUCTION (G5) ───────────────────────────────────────
//
// A LENGTHENING or flat run is not strictly decreasing, so it falls through to SILENCE — there is no
// "gaps are widening / settling" finding, EVER. Absence is not wellness (a widening gap can be a pet
// that stopped logging or a disease waxing and waning; RTM), so the never-reassure direction is closed
// structurally, the same guarantee ⑦ makes by going silent on a settled course rather than saying so.
//
// ── THE MONOTONE-RUNS-BY-CHANCE TRAP, AND WHY runLength IS A SWEEP RESULT (§9) ─
//
// The spec's PROVISIONAL fire condition was "the last 3 gaps monotonically decreasing AND latest ≤
// ratio × median". But 3 i.i.d. gaps are strictly decreasing 1/3! = 1/6 ≈ 16.7% of the time BY LUCK, so
// monotone-3 alone fires ~1-in-6 on ANY null — the exact class of miss ⑥ hit (its naive floors fired
// ~21.6% on uniform noise; see the DEFAULT_CONFIG ⑥ CALIBRATION NOTE). Per the ticket ("the sweep sets
// the floor, not intuition; the ⑥ calibration lesson"), the §PROPERTY SWEEP calibrated the run UP: a
// run of `runLength` = 4 drops the by-chance rate to 1/4! ≈ 4.2%, and with the ratio gate the measured
// null fire rate lands ~2% on CONSTANT-RATE nulls. The cost, taken knowingly: the FIRING floor is
// effectively 4 gaps / 5 episodes; a 3-gap record (the `minGaps` g-chart anchor) is WATCHED (the §4.4
// client row, PR 7) but never fired on — the honest reading of the floor. The ratio is held LOOSE (0.5,
// "half the typical gap") because the FPR is controlled by the run length, not by a strict ratio that
// would miss every moderate real acceleration; none of these is tuned to Nyx (G6).
//
// THE DISCLOSED RESIDUAL (adversarial review, CUL-10): on an AUTOCORRELATED, waxing/waning rate (a rate
// that wanders WITHOUT a trend — the hazard this lane's own G5 comment names), the last-4-monotone rate
// exceeds the iid 1/24, because a wandering rate spends real time drifting down (RTM) and that down-wander
// reads as "accelerating". At runLength=4 the null fire rate there is ~4.5–5.8% (worst at an extreme ~80×
// rate swing), NOT ≪5% — the §PROPERTY SWEEP now carries an autocorrelated null and asserts this as an
// ⑥-STYLE ACCEPTED RESIDUAL rather than omitting the null that produces it. It is accepted, not hidden,
// because L4 is a quiet band-4 escalate-only row whose counts always show and whose output — a TRUE "the
// gaps shortened", never a verdict, never a cause — is, on a genuinely waxing/waning disease, a flare
// worth a quiet note. runLength=5 pulls this residual under 2% but raises the firing floor to 6 episodes
// (⑦-chronicity's own floor), eroding the sub-floor mission — the 4-vs-5 call is a Dr. Chen decision brief.
//
// ── WHAT IT NEVER DOES ───────────────────────────────────────────────────────
//
// No attribution (G1), no syndrome name, no management advice (G3) — it states the gaps and routes
// nothing. It emits at most ONE quiet row (the strongest shortening), ranked at the engine's LOWEST
// band, so it only leads when nothing louder exists — which is the sub-floor state it is built for.

/** Strictly monotonically DECREASING? (each element < its predecessor). The escalate-only test: a flat
 *  step (equal gaps) is NOT shortening, so `<` (not `<=`) is load-bearing. Caller guarantees length ≥ 2. */
function isStrictlyDecreasing(xs: readonly number[]): boolean {
  for (let i = 1; i < xs.length; i++) {
    if (!(xs[i] < xs[i - 1])) return false
  }
  return true
}

/** One symptom type's gap-shortening evidence, pre-selection. */
interface GapShorteningStat {
  symptomType: SymptomType
  recentGapsHours: number[]
  medianGapHours: number
  latestGapHours: number
  gapCount: number
  episodeCount: number
  lastOnsetMs: number
}

export function detectGapShortening(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): GapShorteningFinding[] {
  const cfg = config.gapShortening
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  // A run needs ≥2 gaps to "decrease"; guard a mis-set config so we never read past the array.
  const runLength = Math.max(2, Math.floor(cfg.runLength))

  const candidates: GapShorteningStat[] = []
  for (const symptomType of LANE_SYMPTOM_TYPES.gapShortening) {
    const msList = input.symptomEvents
      .filter((s) => s.type === symptomType)
      .map((s) => Date.parse(s.occurredAt))
      .filter((ms) => Number.isFinite(ms))
    // 3h episode collapse (the shared re-log guard, G9) → onset times sorted ascending. The input is
    // already LOOKBACK-windowed by the caller (index.ts, 180d), so "the record" = the current era.
    const onsets = toEpisodeOnsets(msList, config.symptomEpisodeGapHours)
    const gapCount = onsets.length - 1
    // Both floors: the g-chart data floor (minGaps) AND enough gaps to check the run (runLength). By
    // config minGaps ≤ runLength, so runLength binds; both are asserted so neither can be skipped.
    if (gapCount < cfg.minGaps || gapCount < runLength) continue

    // Inter-episode gaps in HOURS. onsets are strictly ascending and the collapse guarantees each pair
    // is > symptomEpisodeGapHours apart, so every gap > 0 and the median is never 0.
    const gapsHours: number[] = []
    for (let i = 1; i < onsets.length; i++) {
      gapsHours.push((onsets[i] - onsets[i - 1]) / MS_PER_HOUR)
    }

    // (1) SHORTENING — the last `runLength` gaps STRICTLY decreasing. A flat/lengthening run fails here
    // and falls through to SILENCE (G5, escalate-only).
    const recent = gapsHours.slice(-runLength)
    if (!isStrictlyDecreasing(recent)) continue

    // (2) MEANINGFULLY SHORTER — the latest (shortest) gap ≤ ratio × the record's MEDIAN gap. Reuses
    // the shared `median` helper (G9-in-spirit — one median implementation; the collapse guarantees a
    // non-empty gaps list here, so its empty→0 return is unreachable).
    const latestGapHours = gapsHours[gapsHours.length - 1]
    const medianGapHours = median(gapsHours)
    if (!(medianGapHours > 0)) continue // defensive; unreachable given the collapse guarantee
    if (!(latestGapHours <= cfg.gapShorteningRatio * medianGapHours)) continue

    // (3) STILL CURRENT — escalate-safe staleness/reversal guard: the OPEN interval since the last
    // episode has not already outrun the latest short gap (× the grace factor). A run that happened
    // long ago, or one immediately followed by a long quiet stretch (the trend reversed), is suppressed
    // — the accelerating claim would misstate the present. This only ever SUPPRESSES; it never mints a
    // fire and never reassures, so it cannot manufacture a signal.
    const lastOnsetMs = onsets[onsets.length - 1]
    const openIntervalHours = (nowMs - lastOnsetMs) / MS_PER_HOUR
    if (openIntervalHours > cfg.recencyGraceFactor * latestGapHours) continue

    candidates.push({
      symptomType,
      recentGapsHours: recent,
      medianGapHours,
      latestGapHours,
      gapCount,
      episodeCount: onsets.length,
      lastOnsetMs,
    })
  }
  if (candidates.length === 0) return []

  // At most ONE quiet row — the STRONGEST shortening (smallest latest/median ratio = most accelerated),
  // then the most RECENT episode, then symptom-type order. Calm surface over completeness (⑦'s "one card
  // only"), and this lane is the quietest of all — deterministic so a re-run never reorders.
  candidates.sort((a, b) => {
    const ra = a.latestGapHours / a.medianGapHours
    const rb = b.latestGapHours / b.medianGapHours
    if (ra !== rb) return ra - rb
    if (a.lastOnsetMs !== b.lastOnsetMs) return b.lastOnsetMs - a.lastOnsetMs
    return (
      LANE_SYMPTOM_TYPES.gapShortening.indexOf(a.symptomType) -
      LANE_SYMPTOM_TYPES.gapShortening.indexOf(b.symptomType)
    )
  })

  const s = candidates[0]
  return [
    {
      type: 'gap_shortening',
      priorityClass: 'insight',
      symptomType: s.symptomType,
      recentGapsHours: s.recentGapsHours,
      medianGapHours: s.medianGapHours,
      latestGapHours: s.latestGapHours,
      gapCount: s.gapCount,
      episodeCount: s.episodeCount,
      lastOnsetIso: new Date(s.lastOnsetMs).toISOString(),
      associationalOnly: true,
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
//   • staple_washout (EXPLANATION) — one protein DOMINATES the pet's exposures
//     (≥80%, B-070), so it is in nearly every case AND control window → washes out
//     (or, as a sole protein, leaves ① no contrast at all). Reads the dominant
//     protein over meals+treats (via classifyMeals — the same set ① uses). The copy
//     carries an engine-resolved meal/treat register so it never falsely says "every
//     meal" on a treat-borne staple. EXPLANATION ONLY (never a "vary the diet" ask —
//     that sabotages a vet-directed elimination trial) and FULLY SUPPRESSED on
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
  for (const symptomType of LANE_SYMPTOM_TYPES.diagnosticsFloor) {
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

/**
 * Resolve the copy register for a dominant staple from WHERE it shows up (B-070). Looks
 * only at the staple protein's own classified (meal|treat) exposures: 'meals' / 'treats'
 * when one kind is the clear (≥ stapleSourceMajorityFraction) majority, else 'mixed'. Food
 * with a null/'other' food_type is neither and is excluded from the split — when the
 * staple is mostly unclassifiable we cannot claim "every meal", so we fall to the safe
 * day-based 'mixed' register. The danger this exists to prevent is a FALSE "every meal"
 * claim on a treat-borne staple, so the default always errs to the weaker, true claim.
 */
function resolveStapleSource(
  meals: ClassifiedMeal[],
  // Every protein that cleared the dominance floor, not just one — see detectStapleWashout.
  dominant: readonly string[],
  config: DetectionConfig,
): StapleSource {
  let mealCount = 0
  let treatCount = 0
  for (const m of meals) {
    // Set membership (B-351 slice 6): a feeding counts for the staple if ANY dominant
    // protein is ANYWHERE in its protein set — the same rule the dominance count uses.
    if (!m.proteins.some((p) => dominant.includes(p))) continue
    if (m.foodType === 'meal') mealCount++
    else if (m.foodType === 'treat') treatCount++
  }
  const classified = mealCount + treatCount
  if (classified === 0) return 'mixed' // all 'other'/null food_type → can't claim meal vs treat
  const frac = config.coverage.stapleSourceMajorityFraction
  if (mealCount / classified >= frac) return 'meals'
  if (treatCount / classified >= frac) return 'treats'
  return 'mixed'
}

function detectStapleWashout(
  input: DetectionInput,
  config: DetectionConfig,
): StapleWashoutDiagnostic | null {
  // FULLY SUPPRESSED on diet-trial pets: the constant staple IS the elimination
  // diet. Explaining "you feed chicken every meal, so we can't tell if it's linked"
  // implies the owner should vary it — sabotaging the trial and inverting Pets>$.
  if (input.pet.dietTrialActive) return null

  // Classifiable EXPOSURES — meals AND treats, the exact set detector ① keys off. A
  // chicken treat is a chicken exposure (① counts it identically to a meal — see
  // ClassifiedMeal.foodType), which is why a 3×/day chicken treat washes out in the
  // case-crossover; the diagnostic that EXPLAINS that washout must use the same set.
  const meals = classifyMeals(input.mealEvents)
  // "...X is in most of what the pet eats" must be honest — needs real exposure volume.
  if (meals.length < config.coverage.stapleMinMeals) return null

  // B-070: fire on DOMINANCE, not sole-protein. Find the most-exposed protein; it is the
  // staple only if it reaches ≥ stapleDominanceFraction of all exposures — present in
  // nearly every case AND control window → concordant → washed out (or, at 1.0, ① has no
  // contrast at all). The v1 "exactly one protein" test was the special case of this at a
  // 1.0 floor; ≥80% catches the real wedge (Nyx: chicken via treats, tuna-led meals).
  //
  // B-351 slice 6: a feeding contributes its WHOLE set, so "in most of what the pet eats"
  // now correctly catches a staple that hides as a SECONDARY protein — the chicken in
  // every "duck" bowl, which is the exact thing this product exists to surface. That also
  // RETIRES the old "a tie for the top is impossible at ≥80%" argument: with set
  // membership two proteins genuinely can both be in 100% of feedings, so the top is
  // picked with an explicit deterministic tiebreak (count desc, then key ascending)
  // rather than relying on a uniqueness that no longer holds. The dominance denominator
  // stays the FEEDING count, so each share is "the fraction of feedings containing X" and
  // stays in [0,1]; shares across proteins no longer sum to 1, which is correct for a set.
  const counts = new Map<string, number>()
  for (const m of meals) {
    for (const protein of m.proteins) counts.set(protein, (counts.get(protein) ?? 0) + 1)
  }
  let topCount = 0
  for (const c of counts.values()) if (c > topCount) topCount = c
  if (topCount / meals.length < config.coverage.stapleDominanceFraction) return null

  // NAME EVERY DOMINANT PROTEIN, not just the top one (adversarial review, slice 6).
  // Under set membership several proteins can clear the dominance floor at once — the
  // reviewer's fixture had two at 100% — and this diagnostic's whole job is to explain
  // why the engine CANNOT assess something. Naming one of them makes both strings
  // ("antelope is in most of what Nyx eats, so it can't be isolated" on the report;
  // "…there's nothing to compare it against" on Home) literally true of the named protein
  // while inviting the inference that the unnamed one WAS assessed and came back clean.
  // That is reassurance-by-omission on the surface built to say the opposite, and on a
  // beef/chicken tie the alphabet would pick the clinically uninteresting one. The joint
  // label is the same discipline detector ① uses for a cluster, applied to the diagnostic
  // that explains ①'s silence.
  const dominant = Array.from(counts.entries())
    .filter(([, c]) => c / meals.length >= config.coverage.stapleDominanceFraction)
    .map(([p]) => p)
    .sort((a, b) => a.localeCompare(b))
  const topProtein = jointProteinLabel(dominant)

  // "...linked to the symptoms you're tracking" must be TRUE — there must be symptoms to
  // explain, or the copy falsely implies symptoms (reassurance-by-implication). The floor
  // also mirrors ①'s Early episode floor so the staple is the SOLE blocker (no below-floor
  // masquerade — B-053). No / too-few symptoms → no diagnostic (falls back to generic).
  const symptomEpisodes = countSymptomEpisodes(input.symptomEvents, config)
  if (symptomEpisodes < config.coverage.stapleMinSymptomEpisodes) return null

  // Resolve the copy register from the staple's meal/treat split so the copy never claims
  // "nearly every meal" when it is treat-borne (B-070). Decided here in the deterministic,
  // adversarially-reviewed engine (like WorseningTier); copy only renders the result.
  const stapleSource = resolveStapleSource(meals, dominant, config)

  return { type: 'staple_washout', actionability: 'explanation', protein: topProtein, symptomEpisodes, stapleSource }
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

// ── Human-food provenance covariate (B-102 PR 5 — off-commercial-diet signal) ──
//
// NET-NEW. Detection has, until now, ignored food `format` entirely (it keys off `food_type`
// + protein — requirements §5). This is the one piece of B-102 that teaches the engine to
// read `format` at all. It computes a DESCRIPTIVE covariate — "on how many of the logged days
// did the pet eat off-commercial-diet (human) food?" — the substrate a FUTURE detector or the
// Step-9 vet report can use to ask "did human-food days track with symptoms / weight?"
// (requirements §7, D7).
//
// Deliberate scope (requirements §7 / B-102 PR 5 — read before extending):
//   • NOT a Finding. It emits no card, is NOT in DETECTOR_REGISTRY, and never reaches
//     detectSignals / rankFindings / the curated set. Surfacing a human-food card is a
//     SEPARATE, later detection-spec decision — do not wire this into a card here.
//   • NOT causal, NOT a verdict. It counts logged days; it never says human food made the pet
//     sick. A human-food day can later CONTRIBUTE to a correlation but never SIGN one on its
//     own (§7) — and that wiring is explicitly out of this PR.
//   • NEVER a wellness / absence claim. Zero human-food days is a logged FACT, not an
//     all-clear (absence ≠ wellness, §9). This function renders no copy, so it cannot
//     reassure; and it ATTACHES THE HONEST DENOMINATOR (loggedFeedingDays) so the eventual
//     consumer cannot state "N human-food days" without "of M logged days", and cannot read a
//     low/zero count as good news.
//
// Provenance is diet-wide: a human_food feeding counts whether it was logged as a meal, a
// treat, or other ("almost always a treat" — requirements D8; the WSAVA intake chip still
// gates on food_type='meal', unchanged). DAYS are de-duplicated (three deli-meat treats on one
// day = one human-food day); the raw feeding COUNT rides separately as evidence.
//
// Windowing mirrors detectMealTypeCollapse EXACTLY: the trailing `humanFood.windowDays` UTC
// CALENDAR days (a bucket floor, NOT a raw ms span). This guarantees the numerator (human-food
// days) can never exceed the denominator (logged days) the copy would state — the "11 of the
// last 10 days" class of bug the B-080 adversarial review caught. KNOWN RESIDUAL (B-084,
// engine-wide): a "day" is a UTC calendar day, not the owner's local day, so a feeding near a
// window/day edge can shift ≤1 day. It is BENIGN here — this function makes no
// fire/suppress/reassure decision; that judgment (and its never-reassure guardrail) belongs to
// the future consumer. SOFT-DELETES are excluded upstream by the DetectionInput contract, like
// every other detector.

export interface HumanFoodProvenance {
  /**
   * In-window UTC calendar day-keys (YYYY-MM-DD, ascending) on which ≥1 human_food feeding was
   * logged — THE covariate. A future consumer intersects these with symptom days to ask "did
   * human-food days track with symptoms?". De-duplicated per day; `.length` is the
   * human-food-day count.
   */
  humanFoodDayKeys: string[]
  /**
   * Total human_food feedings logged in-window (re-logs NOT collapsed) — evidence detail that
   * separates "1 day, 5 feedings" from "5 days, 1 each". Never the claim on its own.
   */
  humanFoodFeedings: number
  /**
   * Distinct in-window UTC days carrying ANY logged feeding — the HONEST DENOMINATOR. Present
   * so a consumer can never state "N human-food days" without "of M logged days", and so a low
   * or zero numerator reads as a fact over real coverage, never as a wellness/all-clear claim.
   */
  loggedFeedingDays: number
  /** The analysis window in days (trailing UTC calendar days from `now`). */
  windowDays: number
}

/**
 * Compute the human-food provenance covariate (B-102 PR 5). Pure, descriptive, and
 * deliberately NOT a detector — see the section header for the scope guardrails. Returns null
 * only when `input.now` is unparseable (the engine's "can't window" convention, matching
 * computeWindowedStats); otherwise returns the covariate, which may legitimately be all-zero
 * (a logged fact, never reassurance).
 */
export function computeHumanFoodProvenance(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): HumanFoodProvenance | null {
  const cfg = config.humanFood
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return null

  // Misconfiguration guard (adversarial review): a window < 1 day is meaningless. Clamp to a
  // 1-day ("today") window rather than throw — detection degrades gracefully, never blanks the
  // Signal (the engine convention) — and floor a fractional value to a whole number of days.
  // Today the config is the hardcoded 60, so this is a no-op; it exists so a FUTURE consumer
  // that wires `windowDays` from data/UI can't get a SILENT all-empty covariate from a 0/negative
  // value (which a careless caller could mis-frame as "no human food ever"). The clamped value is
  // echoed in `windowDays` below so the payload never claims a window it didn't apply.
  const windowDays = Math.max(1, Math.floor(cfg.windowDays))

  // Trailing W UTC CALENDAR days, inclusive of today (bucket floor, not a raw ms span) —
  // identical to detectMealTypeCollapse, so the numerator can never exceed the denominator.
  const todayBucket = Math.floor(nowMs / MS_PER_DAY)
  const earliestBucket = todayBucket - (windowDays - 1)

  const loggedDayBuckets = new Set<number>()
  const humanFoodDayBuckets = new Set<number>()
  let humanFoodFeedings = 0
  for (const m of input.mealEvents) {
    const ms = Date.parse(m.occurredAt)
    if (!Number.isFinite(ms)) continue // an un-dateable row can't be placed on a day
    if (ms > nowMs) continue // drop clock-skew future rows (mirrors detectMealTypeCollapse)
    const bucket = Math.floor(ms / MS_PER_DAY)
    if (bucket < earliestBucket) continue // earlier than the window
    loggedDayBuckets.add(bucket)
    if (m.format === HUMAN_FOOD_FORMAT) {
      humanFoodFeedings++
      humanFoodDayBuckets.add(bucket) // a Set → one human-food day no matter how many feedings
    }
  }

  const humanFoodDayKeys = Array.from(humanFoodDayBuckets)
    .sort((a, b) => a - b)
    .map((bucket) => utcDateKey(bucket * MS_PER_DAY))

  return {
    humanFoodDayKeys,
    humanFoodFeedings,
    loggedFeedingDays: loggedDayBuckets.size,
    windowDays, // the effective (clamped/floored) window actually applied
  }
}

// ── Detector: per-incident visual red flag (B-340) ───────────────────────────

/**
 * Derive the PRESENT visible red flags on ONE analyzed incident from its owner-editable
 * structured clinical fields — never the cached `visual_flags` array (the client edit path does
 * NOT refresh that on an override, so it lies after an edit; B-339 / clinical-guardrails). This is
 * the single place the present-only asymmetry lives, mirroring generate-report's unionPresentFlags:
 *   • blood escalates ONLY on 'fresh_red' / 'coffee_ground' — never 'none_visible', 'unsure', null.
 *   • foreign material escalates ONLY on 'yes' — never 'no', 'unsure', null.
 * An 'unsure'/absent value is NEVER folded into a flag: that would manufacture presence the data
 * doesn't support (the inverse of the §9 never-reassure-on-absence rule — we also never alarm on
 * absence). Pure + exported so the derivation is directly unit-testable.
 */
export function deriveIncidentFlags(a: IncidentAnalysisInput): IncidentFlagKind[] {
  const flags: IncidentFlagKind[] = []
  const cat = incidentCategory(a.incidentType)
  // The seam (B-364): each family's blood lives in its OWN column. Stool blood is present iff
  // stool_blood_present==='yes' (present-only, subtype-agnostic — matches generate-report's
  // stoolUnionPresentFlags); vomit blood is 'fresh_red'/'coffee_ground'. A non-lane family (cat=null)
  // contributes no blood flag. Reading the vomit column for a stool row would ALWAYS be null → a
  // silently dropped bleed, so the branch is load-bearing, not cosmetic.
  const bloodPresent =
    cat === 'stool'
      ? a.stoolBloodPresent === 'yes'
      : cat === 'vomit'
        ? a.bloodPresent === 'fresh_red' || a.bloodPresent === 'coffee_ground'
        : false
  if (bloodPresent) flags.push('blood')
  // Foreign material is the shared 013 column for both families (a sock is a sock) — but only for a
  // lane family; a non-lane incident_type never contributes a flag.
  if (cat !== null && a.foreignMaterialPresent === 'yes') flags.push('foreign_material')
  return flags
}

// B-368 — the near-duplicate re-log window for collapsing flagged incidents, kept EQUAL to
// generate-report's DEDUP_WINDOW_MS (report.ts §5.11) so the Home red-flag count and the vet
// report agree on how many distinct flagged incidents occurred. The two edge functions ship as
// separate bundles and can't share a module, so this is a KEPT-IN-SYNC mirror — change both.
const INCIDENT_RELOG_DEDUP_MS = 60_000

/**
 * Count distinct flagged incidents, collapsing NEAR-DUPLICATE re-logs of one incident (B-368).
 * Mirrors generate-report's §5.11 dedup: ALL in-window vomit incidents are swept in occurred_at
 * order and a member within INCIDENT_RELOG_DEDUP_MS of the cluster's FIRST member (anchor-fixed, NOT
 * the running previous) joins that cluster — which bounds each cluster's span to one window, so a
 * slow chain of sub-window gaps can never fold an arbitrarily long run of genuinely distinct
 * incidents into one (the same adversarial guard generate-report applies). Then, matching the
 * report's per-cluster present-flag union, a cluster COUNTS iff it carries ≥1 flagged member — so an
 * unflagged vomit anchoring the cluster can't shift the count off the report's. Pure +
 * list-order-independent (sorts internally). Returns 0 if no cluster carries a flag.
 */
function countFlaggedClusters(items: { ms: number; flagged: boolean }[]): number {
  if (items.length === 0) return 0
  const sorted = [...items].sort((a, b) => a.ms - b.ms)
  let count = 0
  let clusterAnchor = -Infinity
  let clusterHasFlag = false
  for (const it of sorted) {
    if (it.ms - clusterAnchor > INCIDENT_RELOG_DEDUP_MS) {
      if (clusterHasFlag) count++ // close the previous cluster before opening a new one
      clusterAnchor = it.ms // a new cluster starts; the anchor stays fixed to its first member
      clusterHasFlag = it.flagged
    } else {
      clusterHasFlag = clusterHasFlag || it.flagged
    }
  }
  if (clusterHasFlag) count++ // close the final cluster
  return count
}

/**
 * Detector — per-incident visual red flag (B-340). Elevates a blood / foreign-material flag from
 * a photo the owner logged onto the Home safety surface, where "safety insights always lead"
 * (Principle 3). SAFETY class. ESCALATE-ON-PRESENCE, NEVER REASSURE: it fires on the PRESENCE of a
 * flag on a RECENT incident and never speaks on absence (an incident with no present flag, or none
 * in-window, emits nothing — silence, never an all-clear). Single-incident fires — no corroboration
 * gate (a false positive is cheap for the owner to clear by editing the structured field, which
 * clears the card by construction because the flag is DERIVED from those fields).
 *
 * SCOPE: vomit (B-340) + stool (B-364). Each analysed family (`incidentCategory()`) is handled
 * independently and emits AT MOST ONE finding — so the surface is calm (one card per family, like
 * ⑦), unioning present flags across that family's in-window flagged incidents and anchoring copy to
 * the family's MOST RECENT one. A pet with two flagged vomits shows one vomit card; a pet with a
 * flagged vomit AND a flagged stool shows two (distinct clinical findings, distinct nouns — neither
 * dropped, Principle 3). Any non-lane incident_type (itch/scratch/…) is IGNORED.
 *
 * CONTRACT (from the caller): incidentAnalyses are already non-soft-deleted + RLS-scoped; this
 * detector additionally applies the recency window (config.incidentRedFlag.windowDays) so a stale
 * flag doesn't keep leading Home. Absent/empty incidentAnalyses ⇒ [] (byte-identical to pre-B-340).
 */
export function detectIncidentRedFlags(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): IncidentRedFlagFinding[] {
  const analyses = input.incidentAnalyses ?? []
  if (analyses.length === 0) return []
  const nowMs = Date.parse(input.now)
  if (Number.isNaN(nowMs)) return []
  const windowMs = config.incidentRedFlag.windowDays * MS_PER_DAY

  // Accumulate PER FAMILY (vomit / stool) — each family surfaces as its own card (§ finding doc),
  // so a bloody vomit and a bloody stool never conflate into one. Per family we track: the union of
  // present flag kinds, the most-recent FLAGGED incident (copy anchor), and EVERY in-window incident
  // (flagged or not) so the count can dedup re-logs over the same universe generate-report does
  // (B-368) — the family's whole event population, not just the flagged subset.
  interface FamilyAcc {
    flagKinds: Set<IncidentFlagKind>
    mostRecentMs: number
    mostRecentIso: string
    inWindow: { ms: number; flagged: boolean }[]
  }
  const byFamily = new Map<IncidentCategory, FamilyAcc>()
  const familyAcc = (cat: IncidentCategory): FamilyAcc => {
    let acc = byFamily.get(cat)
    if (!acc) {
      acc = { flagKinds: new Set(), mostRecentMs: -Infinity, mostRecentIso: '', inWindow: [] }
      byFamily.set(cat, acc)
    }
    return acc
  }

  for (const a of analyses) {
    const cat = incidentCategory(a.incidentType)
    if (cat === null) continue // itch/scratch/… — no per-incident visual red-flag lane
    const ms = Date.parse(a.occurredAt)
    if (Number.isNaN(ms)) continue
    // Recency: only a flag on an incident within the window leads Home. A future-dated occurred_at
    // (nowMs - ms < 0) still passes the ≤ windowMs test, which is correct — it is trivially recent.
    // KNOWN LIMIT (B-361 inheritance): recency anchors on occurred_at, so a red flag the owner logs
    // TODAY but back-dates > windowDays ago (B-010 estimated/window edge) never leads Home. Safe
    // direction (silence, never reassurance), shared by vomit AND stool; the B-361 fix (anchor on
    // max(occurred_at, created_at)) would fix this lane too. Not addressed here.
    if (nowMs - ms > windowMs) continue
    const flags = deriveIncidentFlags(a)
    const flagged = flags.length > 0 // no PRESENT flag ⇒ silence, never a "clear"; but it still
    const acc = familyAcc(cat)
    acc.inWindow.push({ ms, flagged }) // participates in clustering as a possible re-log anchor
    if (flagged) {
      for (const f of flags) acc.flagKinds.add(f)
      if (ms > acc.mostRecentMs) {
        acc.mostRecentMs = ms
        acc.mostRecentIso = a.occurredAt // copy anchors on the most-recent FLAGGED incident
      }
    }
  }

  // Emit one finding per family with ≥1 flagged in-window incident, in a DETERMINISTIC family order
  // (vomit before stool) — the ranker also breaks the incident_red_flag/incident_red_flag tie this
  // way, so the two agree. A family with no flagged incident emits nothing (silence, never a "clear").
  const out: IncidentRedFlagFinding[] = []
  for (const cat of INCIDENT_CATEGORY_ORDER) {
    const acc = byFamily.get(cat)
    if (!acc || acc.flagKinds.size === 0) continue

    // B-368 — collapse NEAR-DUPLICATE re-logs of one incident so the count (and its singular/plural
    // "logged photo(s)" copy) describes distinct flagged incidents, not raw analysis rows: the same
    // incident double-tapped / sync-replayed into N events with N analyses is ONE flagged incident.
    // Mirrors generate-report's §5.11 collapse (countFlaggedClusters): a 60s window anchored to each
    // cluster's FIRST member, dedup over ALL in-window incidents of this family, then count clusters
    // carrying ≥1 flag — so the two surfaces agree even when an UNFLAGGED incident anchors the
    // cluster. Two GENUINELY distinct bloody bouts 30 min apart count as 2 on both (never understated
    // to 1 on a safety card); a seconds-apart re-log collapses to 1. NOT the 3h symptomEpisodeGapHours
    // the frequency lanes use (that would fold distinct bouts together and understate presence). Never
    // changes WHETHER the card fires (≥1 flagged incident ⇒ count ≥1) — only the count/plural copy.
    // Residual bound (B-376): a PHOTOLESS incident has no event_ai_analysis row and so never reaches
    // this detector, so a rare 3-in-~90s arrangement can under-count by one vs the report — always the
    // understating direction (card still fires + routes to the vet), never a never-reassure violation.
    const flaggedIncidentCount = countFlaggedClusters(acc.inWindow)

    // Stable flag order (blood before foreign material) so copy reads deterministically.
    const flags: IncidentFlagKind[] = []
    if (acc.flagKinds.has('blood')) flags.push('blood')
    if (acc.flagKinds.has('foreign_material')) flags.push('foreign_material')

    out.push({
      type: 'incident_red_flag',
      priorityClass: 'safety',
      incidentType: cat,
      flags,
      mostRecentFlaggedIso: acc.mostRecentIso,
      flaggedIncidentCount,
      windowDays: config.incidentRedFlag.windowDays,
    })
  }
  return out
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
 *
 * NOTE: the human-food provenance covariate (computeHumanFoodProvenance, B-102 PR 5) is
 * deliberately NOT registered here. It is a descriptive covariate, not a Finding, and must
 * never reach the card surface ("make it available, no insight card" — requirements §7).
 */
export const DETECTOR_REGISTRY: Detector[] = [
  { type: 'food_symptom_correlation', detect: detectCorrelations },
  { type: 'intake_decline', detect: detectIntakeDecline },
  { type: 'symptom_worsening', detect: detectWorsening },
  // Detector ⑦ (B-182). Live in detectSignals (PR 1), with its within-safety-band RANKING
  // (SAFETY_TYPE_ORDER: chronicity above worsening) and composition couplings — the
  // ③-suppression valve (§4.4) and same-symptom ④-suppression with firm-tier inheritance
  // (§4.5, suppressWorseningWhenChronic) — now landed (PR 2): a same-symptom chronic+worsening
  // pet shows ONE card (⑦, firm-inherited), never two. The PR 3 copy layer and client renderers
  // shipped long ago (⑦ live end-to-end since v32) — the old deploy-gate note here was deleted
  // as stale, 2026-08-28 (HR-30, CUL-676).
  { type: 'symptom_chronicity', detect: detectChronicity },
  { type: 'postprandial_timing', detect: detectPostprandialTiming },
  // Detector L1 (Signals v2 / B-755 / CUL-7 — the empty-stomach ≥6h mirror of ⑤). A same-symptom
  // ⑤ + L1 pair is merged into ONE `timing_story` card at the composition layer (composeTimingStory);
  // detectors stay separate and separately tested. DARK: Signals v2 output is inert until PR 10's
  // gated redeploy (G10) — the shipped client renders an unknown finding type as null (PR-1 pin).
  { type: 'empty_stomach_timing', detect: detectEmptyStomachTiming },
  // Detector L2 (Signals v2 / B-755 / CUL-8 — the trial-response wedge). Emits at most ONE
  // `trial_response` finding, and ONLY when the pooled trial-era-vs-baseline contrast changed
  // materially (the §8.5 trigger, in detectTrialResponse). Silent for any pet not on a running
  // trial (the `isTrialRunning` gate). DARK: inert until PR 10's gated redeploy (G10) — the shipped
  // client renders an unknown finding type as null (the PR-1 pin).
  { type: 'trial_response', detect: detectTrialResponse },
  // Detector L4 (Signals v2 / B-755 / CUL-10 — the sub-floor gap-shortening lane). Emits at most ONE
  // `gap_shortening` finding, and ONLY on a strictly-shortening inter-episode run (escalate-only, G5 —
  // a lengthening/flat sequence is silent). The quietest lane, ranked last. DARK: inert until PR 10's
  // gated redeploy (G10) — the shipped client renders an unknown finding type as null (the PR-1 pin).
  { type: 'gap_shortening', detect: detectGapShortening },
  { type: 'timeofday_clustering', detect: detectTimeOfDayClustering },
  { type: 'reflection', detect: detectReflections },
  // Detector — per-incident visual red flag (B-340). SAFETY class; reads the NEW
  // incidentAnalyses source (derived from event_ai_analysis structured fields, override-aware by
  // construction). Live in detectSignals + ranked at the TOP of the safety band (SAFETY_TYPE_ORDER
  // below). The client renderer (lib/signal.ts InsightType, InsightCard + signalCopy) landed in PR 2
  // (B-340), so the B-182 deploy gate LIFTS: generate-signal may be redeployed once the PR-2 client
  // is on devices and the PM has smoke-tested the new event_ai_analysis !inner query.
  { type: 'incident_red_flag', detect: detectIncidentRedFlags },
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
//   4  gap_shortening (L4, CUL-10) — the sub-floor watching/quiet row; the engine's
//      quietest, ranked below even reflection so it leads only when nothing else exists.
function priorityBand(finding: Finding, ctx: PetContext): number {
  if (finding.priorityClass === 'safety') return 0 // incident_red_flag, intake_decline, symptom_chronicity, symptom_worsening
  // The gap-shortening lane (L4, CUL-10) is the QUIETEST insight — a sub-floor watching row shown while
  // real-world behavior is still being observed (§2 L4, D5). It ranks BELOW even reflection so it only
  // ever leads when nothing louder exists, which is exactly the sub-floor state it is built for. Band 4
  // is the engine's lowest; nothing is dropped for it (§3 only protects safety), and in a data-rich pet
  // a louder card outranks it by construction.
  if (finding.type === 'gap_shortening') return 4
  if (finding.type === 'reflection') return 3
  // The trial-response lane (L2, CUL-8) is the CONTEXT-LEAD insight for a diet-trial pet — it is the
  // wedge feedback, and it only ever EXISTS for a running trial (the isTrialRunning gate), so band 1
  // is correct by construction (never reached for a non-trial pet). It leads correlation within the
  // band via INSIGHT_TYPE_ORDER: the trial's own answer sits above the mechanism that might explain it.
  if (finding.type === 'trial_response') return 1
  // Correlation is the context-lead insight for a diet-trial pet (Jordan's stack, §8).
  if (finding.type === 'food_symptom_correlation' && ctx.dietTrialActive) return 1
  return 2 // correlations (non-trial) + postprandial_timing (⑤) + timeofday_clustering (⑥)
}

const TIER_ORDER: Record<EvidenceTier, number> = { established: 0, early: 1 }

// Within-band ordering for the band-2 insight stack (§6, descriptive-signals spec):
// correlations lead, then the timing lane (⑤ / L1 / the merged timing_story — all rank the same,
// since they are mutually exclusive per symptom after composition), then ⑥, then diet-structure.
// Reflection (③) is band 3, so it never reaches this comparator. Unlisted types tie.
const INSIGHT_TYPE_ORDER: Record<string, number> = {
  // trial_response (L2, CUL-8) leads its band: on a diet-trial pet it and correlation are both band
  // 1, and the trial's own answer ("what has the trial done?") sits above the mechanism that might
  // explain it (correlation). Non-trial bands never see it (the isTrialRunning gate).
  trial_response: -1,
  food_symptom_correlation: 0,
  postprandial_timing: 1,
  empty_stomach_timing: 1,
  timing_story: 1,
  timeofday_clustering: 2,
}

// Within the safety band (band 0): a per-incident VISUAL red flag leads, then intake-decline,
// then chronicity, then symptom-frequency worsening. All lead every insight, and co-firing across
// DIFFERENT symptoms/axes is kept by curation (a pet with a blood-flagged vomit AND eating less
// AND one chronic symptom shows all — the multi-signal gestalt the re-run brief found MISSING);
// none is ever dropped, so this ordering only decides which leads when several safety findings
// co-fire. Same-symptom ④ is de-duplicated upstream by suppressWorseningWhenChronic.
//   • incident_red_flag (B-340) at the TOP: a directly-OBSERVED acute finding the owner
//     photographed — blood (hematemesis) or a foreign body (obstruction risk). The feature exists
//     precisely so this concrete red flag LEADS Home (Open Q resolution 2026-07-13: "led at top").
//     NOTE — this places it ABOVE intake_decline, overriding that lane's "fastest-killing
//     emergency, unchanged at the top" note: a photographed blood/foreign-body is an equally
//     emergency-grade, more concrete finding, and both still show when they co-fire. The
//     red-flag-vs-anorexia lead order is a genuine clinical call → FLAGGED for Dr. Chen
//     ratification (PR-1 adversarial pass); a bare provisional decision, surfaced not hidden.
//   • intake-decline next: anorexia (esp. the feline 48h hepatic-lipidosis window) is the
//     fastest-killing CONTEXTUAL emergency; within it, an outright refusal leads a consecutive-low.
//   • chronicity (⑦, B-182) outranks the week-over-week worsening bump — the vet council ranked
//     sustained chronicity ABOVE the bump as the more clinically established concern (Consensus
//     #3): "this has gone on for weeks" is a more complete statement than "up 2 this week".
const SAFETY_TYPE_ORDER: Record<string, number> = {
  incident_red_flag: 0,
  intake_decline: 1,
  symptom_chronicity: 2,
  symptom_worsening: 3,
}

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

    // Among safety findings: intake-decline leads chronicity leads worsening
    // (SAFETY_TYPE_ORDER); within intake-decline, an outright refusal of a normally-eaten
    // food leads.
    if (x.priorityClass === 'safety' && y.priorityClass === 'safety') {
      const safetyDiff = (SAFETY_TYPE_ORDER[x.type] ?? 9) - (SAFETY_TYPE_ORDER[y.type] ?? 9)
      if (safetyDiff !== 0) return safetyDiff
      // Two per-incident red-flag cards (a bloody vomit AND a bloody stool, B-364): both lead every
      // other safety lane; between the two, vomit leads stool — a fixed, deterministic order (also
      // the detector's emission order), so the surface never reorders on re-run. Neither is dropped.
      if (x.type === 'incident_red_flag' && y.type === 'incident_red_flag') {
        return (
          INCIDENT_CATEGORY_ORDER.indexOf(x.incidentType) -
          INCIDENT_CATEGORY_ORDER.indexOf(y.incidentType)
        )
      }
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
 * §4.4 / §6 curation — ⑤ (postprandial timing) suppresses same-symptom ⑥ (time-of-day clustering).
 *
 * SIGNALS v2 (B-755 / CUL-7) — now EPISODE-SET-AWARE, over the WHOLE TIMING LANE (⑤ + L1). The shipped
 * rule dropped ⑥ whenever ANY ⑤ fired for the symptom, on the assumption that a clock cluster merely
 * RESTATES ⑤'s meal-adjacency. The deep-dive F1 mechanism showed that assumption is false when the
 * clusters are DIFFERENT episodes: a cat that vomits rapid-after-dinner (⑤) AND, separately,
 * empty-stomach at 5am (⑥ clusters at 5am) had its empty-stomach clock finding HIDDEN by the blanket
 * rule — the exact pattern ⑥ exists to surface. So ⑥ is now suppressed only when ≥
 * `suppressionOverlapFraction` of its CLUSTER episodes are also in the timing lane's episode set —
 * ⑤'s meal-adjacent (rapid) episodes OR L1's empty-stomach (long) episodes. Both belong: ⑤ already
 * states the meal-adjacency, and L1 (and the merged timing_story) already carries the long episodes'
 * clock band (`clockBand`), so a ⑥ on those same long episodes duplicates it (the CUL-7 review's
 * finding ③, a D1 "duplicate cards" gap). Below the threshold, ⑥'s cluster is a DIFFERENT pattern
 * (mid-band or otherwise un-surfaced episodes) and ⑥ survives. Onsets match by exact ms because ⑤/⑥
 * collapse the SAME vomit list with the SAME 3h gap (one collapse algorithm). Owned + adversarial-gated.
 *
 * FALLBACK — a ⑤ finding without its onset set (a pre-v2 cached finding, or a synthetic test finding)
 * reverts that symptom to the shipped UNCONDITIONAL suppression, so behaviour never changes silently
 * for an un-instrumented finding. Lives in the composition layer (each detector stays pure); runs
 * BEFORE composeTimingStory (which consumes ⑤ + L1) so their onsets are still present here.
 */
function suppressTimeOfDayWhenPostprandial(
  findings: Finding[],
  config: DetectionConfig,
): Finding[] {
  // Per symptom: the union of the TIMING LANE's episode instants — ⑤'s rapid (meal-adjacent) onsets
  // AND L1's long (empty-stomach) onsets. `null` marks a symptom whose ⑤ lacks its onset set (→ the
  // un-instrumented fallback: unconditional suppression).
  const laneOnsetsBySymptom = new Map<SymptomType, Set<number> | null>()
  const addOnsets = (sym: SymptomType, onsets: number[] | undefined) => {
    if (laneOnsetsBySymptom.get(sym) === null) return // already un-instrumented — stays that way
    if (!onsets) {
      laneOnsetsBySymptom.set(sym, null)
      return
    }
    const set = laneOnsetsBySymptom.get(sym) ?? new Set<number>()
    for (const ms of onsets) set.add(ms)
    laneOnsetsBySymptom.set(sym, set)
  }
  for (const f of findings) {
    if (f.type === 'postprandial_timing') addOnsets(f.symptomType, f.rapidEpisodeOnsets)
    else if (f.type === 'empty_stomach_timing') addOnsets(f.symptomType, f.longEpisodeOnsets)
  }
  if (laneOnsetsBySymptom.size === 0) return findings

  const threshold = config.timeofday.suppressionOverlapFraction
  return findings.filter((f) => {
    if (f.type !== 'timeofday_clustering') return true
    if (!laneOnsetsBySymptom.has(f.symptomType)) return true // no timing-lane finding → keep ⑥
    const laneSet = laneOnsetsBySymptom.get(f.symptomType)!
    // Un-instrumented ⑤, or a ⑥ with no cluster onsets → the shipped unconditional suppression.
    if (laneSet === null || !f.clusterEpisodeOnsets || f.clusterEpisodeOnsets.length === 0) {
      return false
    }
    let overlap = 0
    for (const ms of f.clusterEpisodeOnsets) if (laneSet.has(ms)) overlap++
    // Suppress ⑥ only when its cluster IS (mostly) the timing lane's episode set — else it is a
    // different (mid-band / un-surfaced) clock pattern and survives.
    return overlap / f.clusterEpisodeOnsets.length < threshold
  })
}

/**
 * Signals v2 (B-755 / CUL-7 — D1/A2) — merge a same-symptom ⑤ (postprandial) + L1 (empty-stomach)
 * pair into ONE `timing_story` card. The two phenotypes are two readings of the SAME timing
 * distribution (`scanVomitTiming`), so one card carries both bands rather than two cards saying
 * overlapping things. ONLY the co-firing pair merges: a lone ⑤ stays `postprandial_timing`, a lone L1
 * stays `empty_stomach_timing`. Detectors stay separate and separately tested — only the presentation
 * payload merges. L1 carries the shared three-band split (`bandCounts`) and shares ⑤'s eligible
 * denominator by construction (both read `dist`), so the merged face is internally consistent. Runs
 * in the composition layer AFTER the suppression (which reads ⑤), BEFORE ranking.
 */
function composeTimingStory(findings: Finding[]): Finding[] {
  const ppBySymptom = new Map<SymptomType, PostprandialTimingFinding>()
  const esBySymptom = new Map<SymptomType, EmptyStomachTimingFinding>()
  for (const f of findings) {
    if (f.type === 'postprandial_timing') ppBySymptom.set(f.symptomType, f)
    else if (f.type === 'empty_stomach_timing') esBySymptom.set(f.symptomType, f)
  }
  const merged = new Set<SymptomType>()
  const stories: TimingStoryFinding[] = []
  for (const [symptom, pp] of ppBySymptom) {
    const es = esBySymptom.get(symptom)
    if (!es) continue // lone ⑤ — no merge
    merged.add(symptom)
    stories.push({
      type: 'timing_story',
      priorityClass: 'insight',
      symptomType: symptom,
      // ⑤ and L1 measure the identical distribution; L1 carries the full three-band split and the
      // shared eligible denominator, so the merged face reads them from one place (no re-derivation).
      bandCounts: es.bandCounts,
      eligibleCount: es.eligibleCount,
      totalEpisodes: es.totalEpisodes,
      rapidWindowMinutes: pp.rapidWindowMinutes,
      longGapHours: es.longGapHours,
      windowDays: es.windowDays,
      rapid: {
        count: pp.rapidCount,
        medianMinutesSinceFeeding: pp.medianMinutesSinceFeeding,
        lastTwoEligible: pp.lastTwoEligibleRapid,
        feedingFormsInEvidence: pp.feedingFormsInEvidence,
      },
      long: {
        count: es.longCount,
        medianHoursSinceFeeding: es.medianHoursSinceFeeding,
        lastTwoEligible: es.lastTwoEligibleLong,
        feedingFormsInEvidence: es.feedingFormsInEvidence,
        clockBand: es.clockBand,
        clockCount: es.clockCount,
        // L3 (CUL-9): carry L1's long onsets into the merged story so photo composition can join
        // retained food to the long band on the timing_story card exactly as it does on a lone L1.
        longEpisodeOnsets: es.longEpisodeOnsets,
      },
      associationalOnly: true,
    })
  }
  if (merged.size === 0) return findings
  const kept = findings.filter(
    (f) =>
      !(
        (f.type === 'postprandial_timing' || f.type === 'empty_stomach_timing') &&
        merged.has(f.symptomType)
      ),
  )
  return [...kept, ...stories]
}

/**
 * §4.5 / §5 curation (D1, the recommended option — adopted) — detector ⑦ (chronicity) and ④
 * (worsening) are MUTUALLY EXCLUSIVE per symptom type, and ⑦ wins. A pet that is BOTH chronic
 * AND worsening for the SAME symptom would otherwise show two redundant safety cards —
 * "ongoing for 6 weeks" + "3 up from 2" — which dilutes the calm surface (Principle 3).
 * Chronicity is the MORE COMPLETE clinical statement and the council ranked it ABOVE the
 * week-over-week bump (Consensus #3), so the ⑦ card is kept and the same-symptom ④ is dropped.
 *
 * To never LOSE the urgency the dropped ④ carried, ⑦ INHERITS the 'firm' tier for any symptom
 * that was also worsening (the §4.6 inheritance arm). This is built HERE, in the composition
 * layer, not in resolveChronicityTier — the tier resolver is pure (span-only) and has no view
 * of the worsening findings; the inheritance is a fact about the COMPOSED set, so it lives with
 * the suppression that activates it (PR 1 deliberately shipped resolveChronicityTier span-only
 * so no untested clinical path existed before this). DIFFERENT symptoms both survive — a chronic
 * vomiting + worsening itch pet keeps BOTH cards (the two-signal gestalt the brief found
 * missing). Lives in the COMPOSITION layer (like suppressTimeOfDayWhenPostprandial) so each
 * detector stays pure and independently unit-testable; runs before ranking.
 */
function suppressWorseningWhenChronic(findings: Finding[]): Finding[] {
  const chronicTypes = new Set(
    findings
      .filter((f): f is SymptomChronicityFinding => f.type === 'symptom_chronicity')
      .map((f) => f.symptomType),
  )
  if (chronicTypes.size === 0) return findings
  // The symptom types that are BOTH chronic AND worsening — these drive the firm-tier
  // inheritance (captured BEFORE the ④ findings are dropped, since the drop erases them).
  const alsoWorseningTypes = new Set(
    findings
      .filter(
        (f): f is SymptomWorseningFinding =>
          f.type === 'symptom_worsening' && chronicTypes.has(f.symptomType),
      )
      .map((f) => f.symptomType),
  )
  return findings
    .filter((f) => !(f.type === 'symptom_worsening' && chronicTypes.has(f.symptomType)))
    .map((f) =>
      f.type === 'symptom_chronicity' && alsoWorseningTypes.has(f.symptomType)
        ? { ...f, tier: 'firm' as ChronicityTier }
        : f,
    )
}

/**
 * Signals v2 (CUL-7 review finding ②; extended by CUL-9) — the internal onset arrays
 * (`rapidEpisodeOnsets` / `longEpisodeOnsets` / `clusterEpisodeOnsets`, and the copy L1's onsets ride
 * on inside a merged `timing_story` at `long.longEpisodeOnsets`) exist ONLY to feed two post-detection
 * consumers: the episode-set-aware suppression (inside `detectSignals`) and L3's retained-food join
 * (`computePhotoComposition`, in the I/O shell). Strip them once BOTH have run, so they never reach
 * the phrasing / cache / HTTP layer — a live card must not carry raw per-episode timestamps the client
 * ignores. Because L3 runs in the shell AFTER `detectSignals` returns, this strip is now the shell's
 * final decoration step (index.ts), not `detectSignals`'s — see the note there. Returns new findings
 * (never mutates), so the strip of `timing_story` also clones its nested `long` object.
 */
export function stripInternalOnsets(findings: Finding[]): Finding[] {
  return findings.map((f) => {
    if (f.type === 'postprandial_timing' && f.rapidEpisodeOnsets !== undefined) {
      const copy = { ...f }
      delete copy.rapidEpisodeOnsets
      return copy
    }
    if (f.type === 'empty_stomach_timing' && f.longEpisodeOnsets !== undefined) {
      const copy = { ...f }
      delete copy.longEpisodeOnsets
      return copy
    }
    if (f.type === 'timeofday_clustering' && f.clusterEpisodeOnsets !== undefined) {
      const copy = { ...f }
      delete copy.clusterEpisodeOnsets
      return copy
    }
    // CUL-9: composeTimingStory copies L1's onsets onto the merged card's `long` block for L3's join —
    // strip them too (the base-type branches above never see a timing_story). Clone `long` so the
    // returned finding shares no mutable state with the input.
    if (f.type === 'timing_story' && f.long.longEpisodeOnsets !== undefined) {
      const long = { ...f.long }
      delete long.longEpisodeOnsets
      return { ...f, long }
    }
    return f
  })
}

/**
 * Top-level entry point. Runs every registered detector, composes and ranks the
 * results (§5). An empty array means no finding cleared its floor — the caller
 * renders the building/stale state (§3.3); it is NOT an all-clear (§9).
 *
 * Runs the full Signals v2 composition for every caller: the L1/L2/L4 lanes emit, the ⑤+L1
 * `timing_story` merge runs, and the ⑤/L1→⑥ suppression is episode-set-aware. Both consumers take
 * this ONE path — the Signal surface (generate-signal, GA since CUL-546, its former per-account
 * `signals_v2` gate removed) and the vet report (generate-report, which adopted the v2 finding types
 * in CUL-564). The report's pre-v2 `composeV2:false` fork — the lane-emission skip and the
 * unconditional legacy suppression — is gone: `report.ts`'s `runDetection` now renders `timing_story`
 * + `empty_stomach_timing` and deliberately drops L2/L4, so the composition no longer needs to differ.
 */
export function detectSignals(
  input: DetectionInput,
  config: DetectionConfig = DEFAULT_CONFIG,
): RankedFinding[] {
  const findings: Finding[] = []
  for (const detector of DETECTOR_REGISTRY) {
    findings.push(...detector.detect(input, config))
  }
  // Composition before ranking. ORDER MATTERS for the timing lane (Signals v2 / CUL-7):
  //   1. suppressTimeOfDayWhenPostprandial — ⑤/L1 suppress a redundant same-symptom ⑥ (§4.4/§6),
  //      episode-set-aware; it READS the ⑤/L1 onset sets, so it must run BEFORE the merge.
  //   2. composeTimingStory — merge a same-symptom ⑤ + L1 pair into one timing_story card, copying
  //      L1's long onsets onto the merged card's `long` block for L3's retained-food join.
  //   3. suppressWorseningWhenChronic — ⑦ suppresses same-symptom ④ with firm-tier inheritance
  //      (§4.5/§5); disjoint type pair from the timing lane, so its position is free.
  //
  // The internal onset arrays are NOT stripped here (CUL-9). They must survive `detectSignals`'s
  // return so the I/O shell's L3 decoration (computePhotoComposition) can join retained food to the
  // long band — a second post-detection consumer beyond the suppression above. `index.ts` calls
  // `stripInternalOnsets` as its final decoration step, once BOTH consumers have run, so they still
  // never reach the phrasing / cache / HTTP layer (finding ②). Keeping the strip inside here would
  // delete the onsets before the shell ever sees them — the exact bug that left retained food dead on
  // the lone empty_stomach card. suppressWorseningWhenChronic (⑦→④, B-182) is a disjoint type pair
  // from the timing lane, so its position is free.
  const composed = composeTimingStory(suppressTimeOfDayWhenPostprandial(findings, config))
  return rankFindings(suppressWorseningWhenChronic(composed), input.pet)
}
