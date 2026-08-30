// Vet Report (Build Step 9) — pure data / assembly layer.
//
// This is the report's analog of generate-signal/detection.ts: a PURE module
// (no I/O, no DB access, no LLM, no rendering) that takes already-fetched, plain-
// shaped rows plus a report window and returns the structured report SNAPSHOT.
// The I/O shell (generate-report/index.ts, PR 5) pulls the rows and calls this;
// render.ts (PR 2) turns the snapshot into HTML. Splitting the load-bearing
// assembly out here is what makes it offline `deno test`-able and keeps every
// honesty invariant in one auditable place — see docs/nyx-vet-report-requirements.md
// (hereafter "the spec"): §7 (architecture), §7.1 (the real-data data-layer
// requirements the Nyx dry-run surfaced), §5 (the honesty rules), §6 (scope).
//
// THE HONESTY INVARIANTS (spec §5) ARE BAKED IN HERE, DETERMINISTICALLY — there
// is NO generative phrasing on clinical content (the report's `validatePhrasing`
// analog is "assemble only already-true structured facts"). Enforced by construction:
//   §5.1  Denominators + window on every count — every symptom aggregate carries
//         windowDays + loggedDays; a bare count is never emitted alone.
//   §5.3  Absence ≠ wellness — the safety-leads slot is EMPTY when no flag is
//         present (never a fabricated "all clear"); an empty section is a designed
//         empty state, never a reassuring blank.
//   §5.5  Frequency over severity — trend is read from frequency; severity is
//         carried ONLY per-event in the appendix log, NEVER averaged (there is no
//         severity-average field anywhere in the snapshot, by design).
//   §5.9  Present-only for blood / foreign / mucus — these render only when
//         PRESENT in an incident; the snapshot exposes them as arrays of the
//         present incidents ONLY, so a "0 of N" is structurally unrepresentable
//         (the enum emits `unsure`, which a shared "0 of N" would fold into a
//         reassuring zero).
//   §5.10 Assessed denominators for AI reads — the vomit phenotype aggregates over
//         the `completed` set; completed / uncertain / failed / pending stay
//         distinct and are disclosed, never collapsed into the denominator.
//   §5.11 De-duplicate before counting — near-simultaneous duplicate logs of the
//         same event type collapse to one incident before ANY count (pseudo-
//         replication makes a frequency look worse and a "0 of N" look safer).
//
// THE CORRELATION / SAFETY line reuses generate-signal's engine over the report
// window (spec §7): ONE statistical METHOD (detection.ts) computes both surfaces, so
// they can never disagree on HOW a finding is derived. They can differ at the margin on
// WHAT is derived, and by design: the report additionally de-dups its input (§5.11) —
// the more-correct input — before calling the engine, whereas the rolling Signal feeds
// raw rows and leans on the engine's own 3-hour episode-collapse (which already subsumes
// same-minute symptom duplicates for the correlation/chronicity/worsening EPISODE counts,
// and meal exposures are protein-keyed sets, so the divergence is bounded and, where it
// exists, the report's de-duped version is the intended clinical truth). The report reads
// ONLY `Established`-tier correlations (spec §8.5 — `Early` implies rigor the data lacks)
// and the safety-class findings (chronicity / intake-decline / worsening) for the
// safety-leads slot; it NEVER reads the rolling Signal cache (the windows differ).
// Window-consistency is load-bearing (Data Scientist sign-off, spec §7): see
// buildDetectionInput for the exact windowing contract (windowed events, now = window end).

import {
  detectSignals,
  detectCoverage,
  doseToMedicationWindow,
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
  type Species,
  type IntakeRating,
  type FoodFormat,
  type OccurredAtConfidence,
  type SymptomType,
  type SymptomEvent,
  type MealEvent,
  type FeedingArrangement,
  type MedicationWindow,
  type DetectionInput,
  type CorrelationFinding,
  type IntakeDeclineFinding,
  type SymptomChronicityFinding,
  type SymptomWorseningFinding,
  type PostprandialTimingFinding,
  type TimeOfDayClusteringFinding,
  type EmptyStomachTimingFinding,
  type TimingStoryFinding,
  type StapleWashoutDiagnostic,
} from '../generate-signal/detection.ts'
// The SHARED protein canonicalizer (lib/protein.ts via the generate-signal re-export —
// same path detection.ts uses, so esbuild inlines one copy). The appendix-B tally MUST
// key off the canonical protein, or one real protein fragments across case/qualifier
// variants and junk sentinels print as proteins ("chicken ×238, null ×24, Chicken ×11,
// Chicken By-Product Meal ×15" on the first real artifact — B-052's exact bug class).
import {
  canonicalizeProtein,
  readProteinSet,
  mayClaimCompleteProteinSet,
} from '../generate-signal/protein.ts'
// The SAME off-trial predicate the client's contaminant flag runs (B-351 slice 4).
// Re-deriving "which proteins here aren't the trial protein?" locally is the exact
// failure B-417 §5.3 documents — three contradictory off-diet predicates, one of
// them already shipped in this file. One implementation, imported.
import {
  offTrialProteins,
  offTrialProteinsInTrialFood,
  trialTargetProtein,
  trialFoodProteinMismatches,
  type TrialProteinSource,
} from '../../../lib/trialProtein.ts'
// B-568 — the SAME format-label map the app renders from (lib/foodFormat.ts is
// dependency-free precisely so both runtimes share one copy; a second map here is the
// B-103 drift class, where a new enum value reaches one surface and not the other).
import { foodFormatWord } from '../../../lib/foodFormat.ts'
import { collapseToEpisodeOnsets } from '../../../lib/symptomEpisodes.ts'
// CUL-226 — the SHARED vomit-contents presence leaves: the SAME food/hair/bile atoms L3's
// photoComposition reads (same dependency-free, both-runtimes rationale as foodFormat above), so
// the report's contents descriptor and the Signal card can't drift on a future token edit. Only the
// LEAVES are shared — classifyVomitContents keeps its own mutually-exclusive priority aggregation.
import { hasBile, hasFood, hasHair } from '../../../lib/vomitContents.ts'
// B-140 PR 5 — the ONE shared medication-course derivation, read (never re-derived) by
// the report's lifetime "Medication history" table (§4.4). `lib/medicationHistory.ts` is
// React-Native-free by construction precisely so `generate-report` imports it directly,
// the way this file already imports `lib/dietTrial.ts` — so the report's course counts and
// end registers can never contradict the profile / med-detail / rundown surfaces (H4/H1,
// the diet-trial §5.3 one-predicate lesson applied to medications). It pulls in only
// `lib/medications.ts` + `lib/utils.ts`, both already in this bundle.
import {
  deriveMedicationCourses,
  type MedicationHistoryRegimen,
  type CourseSource,
} from '../../../lib/medicationHistory.ts'
import type { AttributableDose } from '../../../lib/medications.ts'
// The diet-trial answer (B-417 PR 7). `trial.ts` is the seam onto `lib/dietTrial.ts`
// — the one shared predicate — and imports NOTHING from this file, so the two are a
// tree rather than a cycle.
import {
  buildTrialBlock,
  halfPartition,
  selectReportTrial,
  trialEndValue,
  trialLastDayNum,
  type TrialBlock,
} from './trial.ts'
// B-494's flag carries the refusal fact verbatim rather than flattening it, so the
// band and the trial block on the same page cannot state different numbers.
import type { TrialDietRefusal, TrialSpecies } from '../../../lib/dietTrial.ts'
export type {
  TrialBlock,
  TrialExposure,
  TrialLoggingDensity,
  TrialMedicationOverlap,
  TrialPermittedFood,
} from './trial.ts'

// ── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const WEEK_DAYS = 7

/**
 * §6 default scope cascade, rung 3: the 90-day fallback (bumped from discovery's
 * 30d by the synthetic GP — "a snapshot, not the full year"). Ship 90; the exact
 * number is a real-vet-confirmable input (spec §14 S3). Inclusive calendar days.
 */
export const FALLBACK_DAYS = 90

/**
 * §6 rung-2 floor (B-423, B-417 §7). The shortest window a diet-trial-anchored
 * report may cover, extending BACKWARDS from today.
 *
 * A trial started today would otherwise anchor a one-day report at the moment the
 * owner is most likely to send one — the clinic car park. 28 days is the ACVIM
 * ≥2-weeks-exclusive-feeding bar doubled, so a floored window always carries at
 * least a fortnight of pre-trial baseline for the vet to read the trial against.
 * It never widens what counts AS the trial: §5.1's overlap range still opens at
 * `max(scope start, trial start)`.
 */
export const MIN_TRIAL_SCOPE_DAYS = 28

/**
 * How long after a trial ENDS it still anchors the window (§7 AC: "a report
 * generated the day after completion still renders the trial section").
 *
 * NINETY DAYS — R5 (PM, 2026-07-27; B-538). The first cut was 14, argued as
 * "the report that matters is the one sent in the days after the milestone" —
 * and the recheck-slip case showed that sizes the grace off the wrong clock.
 * Vet appointments book three-plus weeks out, so at day 15 the most valuable
 * report the feature produces — the full trial report, for the recheck the
 * trial was run FOR — silently degraded to symptom monitoring before the owner
 * could be in the room to hand it over. 90 matches `FALLBACK_DAYS`: any recheck
 * within three months still produces the full trial report.
 *
 * DELIBERATELY NOT the card's number. `ENDED_TRIAL_GRACE_DAYS`
 * (`lib/dietTrialFacts.ts`) is 30 — report availability is the clinical need,
 * the card is a UI presence, and the report screen stays reachable after the
 * card retires. `selectReportTrial`'s default must still match THIS constant,
 * or the window anchors on a trial the block refuses to render.
 */
export const TRIAL_ANCHOR_GRACE_DAYS = 90

/**
 * §5.11 de-dup window. Two events of the SAME type whose derived occurred_at points
 * fall within this delta collapse to ONE incident — a duplicate-log guard (an
 * offline-sync retry, a double-tap), NOT clinical episode-collapsing (that lives in
 * the detection engine's `symptomEpisodeGapHours` and stays there). The spec names
 * "same minute"; 60s is that, robust to a minute-boundary straddle (10:00:59 vs
 * 10:01:01 are 2s apart but different minute buckets). Meals additionally require the
 * SAME food_item_id to collapse (two different foods a few seconds apart are two real
 * feedings). Tunable; the reference dry-run (Nyx: same-minute vomit re-logs on May 15
 * / May 30 / Jun 21) is what it must catch.
 */
export const DEDUP_WINDOW_MS = 60_000

/**
 * B-213 — cap on the recent-meals intake appendix (most-recent-first). The intake flag's
 * evidence is always recent (a decline is measured over days), so the most-recent N rows
 * carry it; older rated meals beyond the cap are COUNTED and disclosed (intakeLogHiddenOlder),
 * never silently dropped (the "no silent caps" house rule). 40 rows ≈ 20 days of twice-daily
 * feeding — ample to show the baseline-then-decline the flag rests on.
 */
export const INTAKE_LOG_CAP = 40

/** ms per hour — the "hours since last full meal" unit (B-213). */
const MS_PER_HOUR = 3_600_000

/**
 * B-532 — the shortest window that gets a first-vs-last-half delta at all.
 *
 * 8 is not a new judgement: it is exactly where the old bucket-derived delta started
 * rendering (`weeklyBuckets.length >= 2` ⟺ `windowDays >= 8`), preserved so this change
 * fixes the arithmetic without silently adding or removing a delta from any report. Below
 * it the two halves are three days each, which is noise, and the chart plus the per-day
 * counts already carry everything a reader can honestly take from a week.
 */
const TREND_HALF_MIN_WINDOW_DAYS = 8

/**
 * The symptom types the report's frequency section covers. Superset of the engine's
 * CORRELATION_SYMPTOM_TYPES (which drives the reused correlation line) by `lethargy`
 * — a real symptom an owner logs and a vet wants counted, but one the correlation
 * engine deliberately does not correlate. Detection reuse is scoped to
 * CORRELATION_SYMPTOM_TYPES only; the frequency aggregation covers all of these.
 *
 * `cough` + `sneeze` join in W1-PR-3b session 2 (CUL-676), and the two arrive for
 * DIFFERENT reasons — which is the point of this list being separate from the engine's:
 *
 *   • `cough` MUST be here, because it joined the engine's fetch union in the same PR
 *     (§10.5 / HR-3 — "a lane-membership change is report work"). `buildDetectionInput`
 *     filters this report's detection input on CORRELATION_SYMPTOM_TYPES, so the report
 *     now runs ⑦ over cough and can render an "ongoing 52 days" chronicity flag. Had this
 *     list not moved with it, the report would print a safety flag about a sign its own
 *     §3.5 frequency table never counts — a zone that advertises itself and then cannot
 *     show its evidence. That is squarely the B-494 class, and it is why "add the leaf
 *     here OR exclude it from detection, never neither" is a rule rather than a
 *     preference.
 *   • `sneeze` is here on §10.2's plain reason instead — a real symptom an owner logs and
 *     a vet wants counted — exactly the ground `lethargy` stands on. It is NOT in the
 *     engine's fetch union (data-only at W1, §9), and nothing here changes that: this
 *     list feeds counting, not detection.
 */
export const REPORT_SYMPTOM_TYPES = [
  'vomit',
  'diarrhea',
  'itch',
  'scratch',
  'skin_reaction',
  'cough',
  'sneeze',
  'lethargy',
] as const
export type ReportSymptomType = (typeof REPORT_SYMPTOM_TYPES)[number]

/** Stool event types feeding the stool-characteristics strip (§3.7). */
const STOOL_NORMAL_TYPE = 'stool_normal'
const DIARRHEA_TYPE = 'diarrhea'

const CORRELATION_TYPE_SET = new Set<string>(CORRELATION_SYMPTOM_TYPES)
const REPORT_SYMPTOM_SET = new Set<string>(REPORT_SYMPTOM_TYPES)

/**
 * Event types where "same type, same minute" genuinely means a DUPLICATE LOG (§5.11) —
 * the observation events: an owner logs the SAME vomit/diarrhea/stool bout twice and the
 * two rows are indistinguishable, so they collapse. This is DELIBERATELY narrow: a
 * `medication` event or a `weight_check` carries a distinguishing identity (which drug,
 * which reading) that is NOT on the event row (it lives on the joined child), so collapsing
 * two of them by type-and-minute would DESTROY real data — two different drugs given
 * together (the B-156 combo) or two genuine weigh-ins are NOT duplicates. Meals are handled
 * separately (keyed by food_item_id). Every other type passes through un-clustered.
 */
const DEDUP_OBSERVATION_TYPES = new Set<string>([...REPORT_SYMPTOM_TYPES, STOOL_NORMAL_TYPE])

// ── Input row types (plain, DB-projected; the PR-5 I/O shell maps supabase → these) ──

/** Pet signalment. `neuterStatus` is NOT stored today (spec §7.1 gap) → undefined/null ⇒ "not recorded". */
export interface ReportPetInput {
  id: string
  name: string
  species: Species
  breed: string | null
  sex: 'male' | 'female' | 'unknown'
  dateOfBirth: string | null // DATE 'YYYY-MM-DD'
  /** 'approximate' ⇒ DOB is a computed anchor from an entered age, not a witnessed birthday (B-251). Absent ⇒ 'exact'. */
  dateOfBirthPrecision?: 'exact' | 'approximate'
  neuterStatus?: 'neutered' | 'intact' | null
  /** pets.weight_kg onboarding snapshot. NOT a weigh-in — never rendered as the weight trend (spec §7.1). */
  weightKg: number | null
}

/**
 * The three stored facts every protein-set decision needs (B-351 slice 5, D10).
 *
 * Carried RAW through the input layer and derived here in the pure module, so the
 * completeness gate is exercised by `deno test` rather than only in production.
 * OPTIONAL on purpose: every one of these interfaces is a public input shape with
 * existing callers (and a large fixture corpus), and a food whose columns are
 * absent must degrade to "nothing captured" — which is exactly what the gate
 * already does with a null. A missing field is never read as "assume it was fine".
 */
export interface ReportFoodProteinInput {
  /** `food_items.proteins` — prominence-ordered canonical keys (migration 039). */
  proteins?: string[] | null
  /** `food_items.ingredients_notes` — the verbatim panel, if it was ever captured. */
  ingredientsNotes?: string | null
  /** `food_items.ai_extraction_confidence` — untyped jsonb; the gate is tolerant. */
  extractionConfidence?: unknown
}

/** Meal detail (events⋈meals⋈food_items). Present only on a type==='meal' event. */
export interface ReportMealDetail extends ReportFoodProteinInput {
  foodItemId: string | null
  intakeRating: IntakeRating | null
  quantity: string | null
  foodType: 'meal' | 'treat' | 'other' | null
  format: FoodFormat | null
  primaryProtein: string | null
  brand: string | null
  productName: string | null
}

/** One event row from reference query [4] (caller pre-filters deleted_at IS NULL). */
export interface ReportEventInput {
  id: string
  type: string // event_type
  occurredAt: string // ISO — the derived point (events.occurred_at)
  occurredAtConfidence: OccurredAtConfidence | null
  occurredAtEarliest: string | null // window lower edge (confidence='window')
  occurredAtLatest: string | null // window upper edge
  severity: number | null // owner-reported 1–5; NULL = unrated (never invented, never averaged)
  notes: string | null
  loggedAt: string // events.created_at — the "logged" column of appendix A (occurred-vs-logged)
  meal: ReportMealDetail | null
}

/** event_ai_analysis row (migration 013), keyed by eventId — the vomit phenotype source. */
export interface ReportAiAnalysisInput {
  eventId: string
  status: string // 'pending' | 'completed' | 'failed' | 'uncertain'
  colour: string | null // vomit_colour
  contents: string[] | null // vomit_content[]
  consistency: string | null // vomit_consistency
  bloodPresent: string | null // vomit_blood: 'none_visible'|'fresh_red'|'coffee_ground'|'unsure'
  bilePresent: string | null // vomit_tristate
  foreignMaterialPresent: string | null // vomit_tristate
  foreignMaterialNote: string | null
  // Stool AI-read fields (migration 034 / analyze-stool). Present only on stool rows; null on
  // vomit rows. The event_ai_analysis table is incident-agnostic, so these ride the same input.
  stoolConsistency: string | null // stool_consistency: Bristol 'type_1_hard_lumps'…'type_7_watery'|'unsure'
  stoolColour: string | null // stool_colour: 'brown'…'black_tarry'|'grey_pale'|'red_streaked'|'unsure'
  stoolBloodPresent: string | null // stool_tristate: 'yes'|'no'|'unsure'
  stoolBloodType: string | null // 'fresh_red' (haematochezia) | 'dark_tarry' (melena) | null
  stoolMucusPresent: string | null // stool_tristate: 'yes'|'no'|'unsure'
  editedAt: string | null // owner-edited ⇒ "owner-reviewed"; else raw AI ("owner-reviewable")
}

/** weight_checks row (migration 024) joined to its parent event's occurred_at. */
export interface ReportWeightCheckInput {
  eventId: string
  weightKg: number
  occurredAt: string // ISO, from the parent event
}

/** medication_administrations row (migration 020/023) joined to its parent event. */
export interface ReportDoseInput {
  eventId: string
  occurredAt: string // parent event occurred_at
  medicationId: string | null // the regimen (medications.id); NULL = ad-hoc dose
  medicationItemId: string | null
  adherence: string | null // dose_adherence: 'given'|'partial'|'missed'|'refused'|null(unconfirmed)
  doseAmount: string | null
  pairedEventId: string | null // B-156 combo: the meal/treat this dose rode inside
}

/**
 * medication_items row (global catalog, migration 019) — the drug IDENTITY behind a dose. A dose
 * carries only `medicationItemId`; a REGIMEN carries the human-readable `drugName`. So an ad-hoc dose
 * logged with NO regimen (`medicationId` null) has no name until we resolve it through this lookup —
 * the gap that made a real owner's daily OTC antihistamine invisible on the report (it had doses but
 * no regimen). index.ts fetches these for the item ids referenced by doses; report.ts names the
 * unlinked-dose groups from them.
 */
export interface ReportMedicationItemInput {
  id: string
  genericName: string | null
  brandName: string | null
  strength: string | null
  route: string | null
  isPrescription: boolean | null
  /**
   * `medication_items.form`. §5.3 rung 4 (C3): 'chewable' is the ruled trigger for
   * an oral-route trial exposure — chewables are flavoured with something, and eight
   * guideline sources call them trial-invalidating. Optional so every pre-existing
   * fixture compiles; absent ⇒ rung 4 fires only on a B-156 food vehicle.
   */
  form?: string | null
}

/** medications regimen row (migration 020). `isPrescription`/`strength` come from the joined item. */
export interface ReportMedicationInput {
  id: string
  medicationItemId: string | null
  drugName: string
  doseAmount: string | null
  route: string | null
  dosesPerDay: number | null // NULL = PRN/as-needed
  scheduleNotes: string | null
  indication: string | null
  prescribedBy: string | null
  startedAt: string // DATE 'YYYY-MM-DD'
  targetDurationDays: number | null
  /**
   * B-618 (migration 049) — a DOSE-denominated fixed course ("#28, until gone"). The
   * CHECK constraint makes this mutually exclusive with `targetDurationDays`, so a regimen
   * is days- XOR dose-denominated. Read by the §4.4 lifetime table to say "28 doses
   * planned" vs "14 days". Optional so every pre-B-140-PR-5 fixture keeps compiling; absent
   * ⇒ treated as null (ongoing / days-denominated), exactly as an unset column would be.
   */
  targetDurationDoses?: number | null
  status: string // 'active'|'completed'|'stopped'
  endedAt: string | null // DATE
  isPrescription?: boolean | null // false ⇒ treated as a supplement (concurrent intervention)
  strength?: string | null
}

/**
 * One `diet_trial_foods` row (migration 040 §3.2) + the food's protein evidence —
 * the ALLOWED SET, which is rung 1 of §5.3 and the only permit path there is.
 *
 * Without it the report has no representation of "the vet said this one treat is
 * fine", so `classifyFeeding` cannot run and the off-diet computation falls back
 * to the treat-or-human-food heuristic. Optional on `ReportDietTrialInput` for the
 * same reason every protein field is: an absent set degrades to "no allowed set
 * captured" (the heuristic), never to "nothing was allowed" (every meal off-diet).
 */
export interface ReportDietTrialFoodInput extends ReportFoodProteinInput {
  foodItemId: string
  /** `diet_trial_foods.food_label`, captured at write time — it outlives the food. */
  foodLabel: string
  role: string // diet_trial_food_role: 'primary_diet'|'permitted_treat'|'permitted_other'|'supplement'
  allowedFrom: string // DATE — membership is DATED (§3.2)
  allowedUntil: string | null
  primaryProtein: string | null
  /** The food's own brand/product, for the §5.4 case-folded identity key. Null when
   *  the food row was archived out from under the trial (`ON DELETE CASCADE` keeps
   *  the row, the join can still be thin) — membership then falls back to the id. */
  brand: string | null
  productName: string | null
}

/** diet_trials row (schema migration 001 + migration 040) + optional joined food label/protein. */
export interface ReportDietTrialInput extends ReportFoodProteinInput {
  id: string
  foodItemId: string | null
  startedAt: string // DATE
  targetDurationDays: number
  status: string // 'active'|'completed'|'abandoned'
  completedAt: string | null
  /**
   * `diet_trials.ended_at` (migration 040) — written on BOTH `completed` and
   * `abandoned` (§3.1). B-455: this reader never selected it, so an abandoned trial
   * reached `buildConcurrentChanges` with a NULL end and rendered to the vet as
   * "the trial diet (X) — ongoing since <start>". A cat pulled off the diet at day
   * 19 read as an intervention still under way.
   */
  endedAt?: string | null
  vetName: string | null
  foodLabel?: string | null
  primaryProtein?: string | null
  /**
   * `diet_trials.target_protein` (migration 053, B-704) — the owner's STORED trial
   * protein, or null (never set / cleared / "no single protein (hydrolyzed)"). A
   * canonical key (TG-4). Read STORED-FIRST through `trialTargetProtein`; null falls to
   * the derivation arm, byte-identical to the pre-PR-5 report. NEVER a permit (TG-1).
   */
  targetProtein?: string | null
  /** `diet_trials.target_protein_set_at` (migration 053) — when the protein was set or
   *  last changed, or null when `targetProtein` is null. Dates the provenance
   *  disclosure ("protein confirmed day N" when it falls after day 1, §7.4); it never
   *  versions the value (TP-3: one value, whole-trial, disclosed not versioned). */
  targetProteinSetAt?: string | null
  /** What the trial is FOR (migration 040). Renders verbatim to a clinician and
   *  decides whether an antibiotic course is worth naming (§7). */
  indication?: 'skin' | 'gi' | 'other' | null
  /** Owner-reported at completion (D6). Rendered AS the owner's, never as a finding. */
  outcome?: 'improved' | 'no_change' | 'worse' | 'unsure' | null
  outcomeNotes?: string | null
  /** PR 3's structured token: 'completed'|'vet_advised'|'refused'|'other'. `refused`
   *  is load-bearing — §4.3 routes it to the intake-decline health lane and forbids
   *  rendering it as a compliance outcome. */
  stoppedReason?: string | null
  /** The allowed set (§3.2). Absent ⇒ no §5.3 classification; see the interface note. */
  allowedFoods?: ReportDietTrialFoodInput[]
}

/** vet_visits row (schema migration 001) — feeds the scope cascade rung 1. */
export interface ReportVetVisitInput {
  visitedAt: string // DATE
  clinicName: string | null
  vetName: string | null
  reason: string | null
}

/** feeding_arrangements row (migration 018) + joined food label/protein — B-040. */
export interface ReportFeedingArrangementInput extends ReportFoodProteinInput {
  id: string
  foodItemId: string
  method: string // 'free_choice'|'meal_fed'
  activeFrom: string | null // DATE
  activeUntil: string | null // DATE; NULL = still active (bowl still down)
  isShared: boolean
  primaryProtein: string | null
  foodLabel: string | null
}

/** conditions row (schema migration 001) — WSAVA appendix context. */
export interface ReportConditionInput {
  conditionName: string
  status: string // 'active'|'monitoring'|'resolved'
  diagnosedAt: string | null // DATE
}

/**
 * event_attachments row (migration 003), keyed by eventId — the Appendix E incident-photo
 * source (PR 7). The pure layer only needs the storage PATH + ordering; the actual image
 * bytes are fetched, EXIF-stripped, downscaled and base64-embedded by the index.ts I/O shell
 * (never here — report.ts stays pure). mimeType is the stored declared type (advisory only;
 * index.ts re-sniffs the transform output).
 */
export interface ReportAttachmentInput {
  eventId: string
  storagePath: string
  mimeType: string | null
  sortOrder: number
}

/**
 * The full pure-assembly input. The caller pulls a GENEROUS lookback (≥ the
 * report window; the live Signal pulls 180d) so the detection reuse has enough
 * history for its natural sub-windows; report.ts scopes everything to the resolved
 * window itself. `requestedWindow` present ⇒ owner override (custom scope + the
 * cherry-pick guard, §6); absent ⇒ the default cascade.
 */
export interface ReportInput {
  now: string // ISO — injected reference "now" (determinism; no Date.now() in this module)
  timezone: string | null // owner IANA tz (user_profiles.timezone) — day-boundary + local-week math
  pet: ReportPetInput
  ownerName: string | null // profile/auth display name — PIMS filing (spec §7.1); NULL ⇒ "not recorded"
  requestedWindow?: { startDate: string; endDate: string } | null // owner override (DATE strings)
  events: ReportEventInput[]
  aiAnalyses: ReportAiAnalysisInput[]
  weightChecks: ReportWeightCheckInput[]
  doses: ReportDoseInput[]
  /**
   * B-140 PR 5 — the pet's ENTIRE live dose history, UNTRIMMED by the lookback, for the
   * window-ignoring lifetime "Medication history" table (§4.4). The DB already pulls every
   * `medication_administrations` row (index.ts sets no `.gte` — a dose's instant lives on
   * its parent event, so the lookback is an in-memory trim of `doses` for the windowed
   * sections); this field carries the un-trimmed set so a course that ended before the
   * ~180-day window still appears (the vet's "has she ever been on steroids?" question).
   * Absent ⇒ the table derives over `doses` (older fixtures / callers) — correct but
   * lookback-bounded, never wrong, just narrower.
   */
  lifetimeDoses?: ReportDoseInput[]
  medications: ReportMedicationInput[]
  /**
   * Names/metadata for the medication_items referenced by `doses` — so an ad-hoc dose with no
   * regimen can still be reported by drug name (§3.8, the orphan-dose gap). Optional so every
   * pre-existing fixture keeps compiling; absent ⇒ unlinked doses render as "Unspecified medication".
   */
  medicationItems?: ReportMedicationItemInput[]
  dietTrials: ReportDietTrialInput[]
  vetVisits: ReportVetVisitInput[]
  feedingArrangements: ReportFeedingArrangementInput[]
  conditions: ReportConditionInput[]
  /**
   * PR 7 — event_attachments for the pet (photo incident source). Optional so every
   * pre-PR-7 test fixture + the resolveScope() pre-pull in index.ts keep compiling;
   * absent ⇒ no incident photos (an empty Appendix E, which simply does not render).
   */
  attachments?: ReportAttachmentInput[]
  /**
   * B-613 — the instant `events` was pulled from (`index.ts`'s `computeLookbackIso`).
   *
   * Assembly needs it for exactly one question: is the trial-crop symptom count a total
   * or a floor? The pull floor is the only reason that count can be short, and this module
   * otherwise has no way to tell "no symptoms were logged in the cropped days" apart from
   * "the cropped days were never fetched" — the CUL-575 class, in a clinical count.
   *
   * Optional so every pre-B-613 fixture keeps compiling; ABSENT ⇒ the extent is unknown ⇒
   * the count is treated as a floor. That is the direction that cannot mislead: an "at
   * least N" over a complete count understates a disclosure, while a total over an
   * incomplete one is a false negative on the axis the guard exists for.
   */
  eventsSinceIso?: string | null
}

// ── Date / window helpers (tz-aware calendar-day math) ───────────────────────
// Timestamps are stored UTC (hard constraint); day boundaries and week buckets
// are the OWNER's local calendar days (schema note: "convert at the app layer").
// tz absent/invalid ⇒ fall back to UTC day-keys so the report STILL RENDERS (a
// missing tz never blanks a clinical count — unlike detector ⑥, which goes silent).

/** Milliseconds since epoch, or null when the ISO is unparseable. */
function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Local calendar day 'YYYY-MM-DD' for an instant, in the owner's tz (UTC fallback). */
function localDayKey(iso: string, tz: string | null): string | null {
  const ms = parseMs(iso)
  if (ms === null) return null
  if (tz) {
    try {
      // en-CA renders as YYYY-MM-DD; timeZone converts the UTC instant to the local day.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ms))
    } catch {
      // Invalid IANA zone — fall through to UTC.
    }
  }
  return new Date(ms).toISOString().slice(0, 10)
}

/** A calendar-day key ('YYYY-MM-DD', already a local day OR a DATE column) → an integer day index. */
function dayNumber(dayKey: string): number | null {
  const ms = Date.parse(`${dayKey}T00:00:00Z`)
  return Number.isNaN(ms) ? null : Math.round(ms / MS_PER_DAY)
}

/** Inverse of dayNumber — an integer day index → 'YYYY-MM-DD'. */
function dayKeyFromNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** The local-day index of an event instant (null when unparseable). */
function eventDayNumber(iso: string, tz: string | null): number | null {
  const key = localDayKey(iso, tz)
  return key === null ? null : dayNumber(key)
}

// ── §6 scope cascade ─────────────────────────────────────────────────────────

export type ScopeBasis = 'since_visit' | 'diet_trial' | 'fallback_90d' | 'custom'

export interface ReportScope {
  basis: ScopeBasis
  /** Inclusive local calendar-day bounds of the window. */
  startDate: string
  endDate: string
  startDayNum: number
  endDayNum: number
  /** Inclusive calendar-day count of the window (the "N of D days" denominator). */
  windowDays: number
  /** The instant handed to the detection engine as `now` (window end, ≤ input.now). */
  detectionNowIso: string
  /** Rung-1 anchor: the most-recent vet visit before today, when basis==='since_visit'. */
  lastVisitDate: string | null
  /** Rung-2 anchor: the active diet trial's start, when basis==='diet_trial'. */
  trialStartDate: string | null
  /** True when basis==='custom' — triggers the §6 cherry-pick disclosure. */
  isCustomOverride: boolean
}

/**
 * Resolve the report window (spec §6). Default cascade:
 *   (1) since the most-recent vet visit strictly before today  → basis 'since_visit'
 *   (2) else the most-recent active diet trial's start          → basis 'diet_trial'
 *   (3) else a 90-day fallback                                   → basis 'fallback_90d'
 * A `requestedWindow` overrides all three → basis 'custom' (the cherry-pick guard fires).
 * All bounds are inclusive local calendar days; detectionNow is the window end instant.
 */
export function resolveScope(input: ReportInput): ReportScope {
  const tz = input.timezone
  const nowMs = parseMs(input.now) ?? 0
  const todayKey = localDayKey(input.now, tz) ?? new Date(nowMs).toISOString().slice(0, 10)
  const todayNum = dayNumber(todayKey) ?? Math.round(nowMs / MS_PER_DAY)

  // Owner override — a hand-picked window. Clamp the end to today (a report never
  // covers the future) and take the window verbatim; the cherry-pick disclosure is
  // computed by the caller against the full symptom set.
  if (input.requestedWindow) {
    const reqStart = input.requestedWindow.startDate
    const reqEndNum = Math.min(dayNumber(input.requestedWindow.endDate) ?? todayNum, todayNum)
    const startNum = dayNumber(reqStart) ?? todayNum
    const endNum = Math.max(startNum, reqEndNum)
    return {
      basis: 'custom',
      startDate: dayKeyFromNumber(startNum),
      endDate: dayKeyFromNumber(endNum),
      startDayNum: startNum,
      endDayNum: endNum,
      windowDays: endNum - startNum + 1,
      detectionNowIso: detectionNowFor(endNum, todayNum, input.now),
      lastVisitDate: null,
      trialStartDate: null,
      isCustomOverride: true,
    }
  }

  // Rung 1 — since the most-recent vet visit strictly before today.
  let lastVisit: string | null = null
  for (const v of input.vetVisits) {
    const vNum = dayNumber(v.visitedAt)
    if (vNum === null || vNum >= todayNum) continue // ignore today/future-dated visits
    if (lastVisit === null || vNum > (dayNumber(lastVisit) ?? -Infinity)) lastVisit = v.visitedAt
  }
  if (lastVisit !== null) {
    const startNum = dayNumber(lastVisit) as number
    return scopeFromRange('since_visit', startNum, todayNum, input.now, {
      lastVisitDate: lastVisit,
      trialStartDate: null,
    })
  }

  // Rung 2 — the diet trial this report is about. Reachable for the first time in
  // production as of B-417 (before PR 1–3 nothing could write a `diet_trials` row).
  //
  // TWO CHANGES FROM THE ORIGINAL `status === 'active'` TEST, both from §7's ACs:
  //
  //  (a) A RECENTLY-ENDED TRIAL STILL ANCHORS THE WINDOW. §11: "completing a trial
  //      currently deletes it from the report — the day after the owner taps
  //      Complete the trial section, coverage, off-diet list and clinical framing
  //      all vanish and the window falls to the 90-day fallback. The most valuable
  //      report this feature produces would be the one it destroys." The report an
  //      owner sends the morning after finishing an 8-week elimination is the whole
  //      point of the feature. The grace window is deliberately short — a trial
  //      that ended two months ago is history, not the report's subject.
  //
  //  (b) A MINIMUM WINDOW (B-423). A trial started today otherwise collapses the
  //      report to a ONE-DAY window at the highest-intent moment in the product:
  //      the owner walks out of the clinic, starts the trial, and taps Share. Every
  //      denominator on the page would then be 1, the symptom chart would hold a
  //      single bucket, and the vet would receive a report that says nothing about
  //      the animal. Floored at MIN_TRIAL_SCOPE_DAYS, which extends BACKWARDS —
  //      pre-trial days are baseline, which is exactly what "is this trial working?"
  //      needs. The trial's own facts are unaffected: §5.1's overlap range opens at
  //      `max(scope start, trial start)`, so nothing before day 1 is ever counted
  //      as trial coverage or as an exposure.
  // RANK EXACTLY AS `selectReportTrial` DOES. The two used different orders — this
  // one max-start-only, that one active-first-then-max-start — and the adversarial
  // pass produced the divergence from a real input: an abandoned trial that ran
  // 20–28 Jun alongside an ACTIVE trial started 29 Jun but back-dated to 1 Jun (the
  // car-park case PR 3 supports) anchored the window on the abandoned one while the
  // block described the active one, so the abandoned trial's feedings were scored
  // against the active trial's allowed list. Ties break on `id`, because the query
  // carries no ORDER BY and array order is not a decision (the B-188 shape).
  let best: { startedAt: string; rank: number; startNum: number; id: string } | null = null
  for (const t of input.dietTrials) {
    const tNum = dayNumber(t.startedAt)
    if (tNum === null) continue
    // B-422 DELIBERATELY DOES NOT REACH THIS TEST EITHER, and the reason is the
    // one round-1 finding that has survived every revision: this picks the WINDOW
    // and `selectReportTrial` picks the BLOCK, and THE TWO MUST RANK IDENTICALLY.
    // An adversarial pass produced the divergence from a real input once already
    // — an abandoned trial anchoring the window while an active one described the
    // block, so the abandoned trial's feedings were scored against the active
    // trial's allowed list.
    //
    // `selectReportTrial` had to keep ranking on `status` (dropping an un-ended
    // trial drops the `trial_diet_refusal` SAFETY FLAG with it — see the long note
    // there), so this must too. Gating only this one is how the pair silently
    // diverges again.
    //
    // The consequence is a real and separate problem: a trial nobody ended still
    // anchors every future report on its own start, so an owner who ran a trial in
    // 2024 and never tapped Complete gets a two-year window with every denominator
    // on the page scaled to it. That is NOT one of the three harms B-422 was filed
    // for, it needs `selectReportTrial` moved in the same PR, and it wants a
    // `vet-report-cold-read` on the re-rendered artifact — so it is filed rather
    // than smuggled in here → B-594, alongside B-538's grace windows.
    if (t.status !== 'active') {
      const endNum = dayNumber(t.endedAt ?? t.completedAt ?? '')
      // No end date on a non-active trial means we cannot place it in time (B-455
      // is exactly this column going unread) — leave the window to rung 3 rather
      // than anchor on a trial that may have finished a year ago.
      if (endNum === null || todayNum - endNum > TRIAL_ANCHOR_GRACE_DAYS) continue
    }
    const cand = { startedAt: t.startedAt, rank: t.status === 'active' ? 1 : 0, startNum: tNum, id: t.id }
    if (
      best === null ||
      cand.rank > best.rank ||
      (cand.rank === best.rank && cand.startNum > best.startNum) ||
      (cand.rank === best.rank && cand.startNum === best.startNum && cand.id > best.id)
    ) {
      best = cand
    }
  }
  const trialStart: string | null = best?.startedAt ?? null
  if (trialStart !== null) {
    const anchored = Math.min(dayNumber(trialStart) as number, todayNum)
    const startNum = Math.min(anchored, todayNum - (MIN_TRIAL_SCOPE_DAYS - 1))
    return scopeFromRange('diet_trial', startNum, todayNum, input.now, {
      lastVisitDate: null,
      trialStartDate: trialStart,
    })
  }

  // Rung 3 — the 90-day fallback (inclusive calendar days).
  const startNum = todayNum - (FALLBACK_DAYS - 1)
  return scopeFromRange('fallback_90d', startNum, todayNum, input.now, {
    lastVisitDate: null,
    trialStartDate: null,
  })
}

function scopeFromRange(
  basis: ScopeBasis,
  startNum: number,
  endNum: number,
  nowIso: string,
  anchors: { lastVisitDate: string | null; trialStartDate: string | null },
): ReportScope {
  const s = Math.min(startNum, endNum)
  return {
    basis,
    startDate: dayKeyFromNumber(s),
    endDate: dayKeyFromNumber(endNum),
    startDayNum: s,
    endDayNum: endNum,
    windowDays: endNum - s + 1,
    detectionNowIso: nowIso,
    lastVisitDate: anchors.lastVisitDate,
    trialStartDate: anchors.trialStartDate,
    isCustomOverride: false,
  }
}

/**
 * The instant handed to detection as `now`. For the default cascade the window
 * ends today, so it is input.now (the live reference). For a custom window ending
 * in the PAST, it is the end of that last day (UTC end-of-day) so the report reads
 * "as of the window end" — chronicity's "still ongoing" recency floor and its
 * lookback are then measured from the window end, not real-now.
 */
function detectionNowFor(endNum: number, todayNum: number, nowIso: string): string {
  if (endNum >= todayNum) return nowIso
  return `${dayKeyFromNumber(endNum)}T23:59:59.999Z`
}

// ── §5.11 de-duplication ─────────────────────────────────────────────────────

/**
 * Collapse near-simultaneous duplicate logs of the same event type to ONE incident
 * (spec §5.11). Deterministic: events are grouped (§DEDUP_OBSERVATION_TYPES by type,
 * meals by food_item_id, everything else never clusters) then swept in occurred_at
 * order; an event within DEDUP_WINDOW_MS **of the cluster's FIRST member** joins it —
 * anchoring to the first (not the running previous) bounds a cluster's total span to
 * one DEDUP_WINDOW_MS, so a slow chain of sub-window gaps can never collapse an
 * arbitrarily long run of distinct incidents (adversarial finding 3).
 *
 * The REPRESENTATIVE (which anchors the incident's id + timing) is chosen WINDOW-FIRST:
 * an in-window member is preferred over an out-of-window one, so a duplicate that
 * straddles the window boundary at local midnight can NEVER pull a genuine in-window
 * bout out of the window (adversarial finding 1). Then completed-AI, then earliest,
 * then id — a total, input-order-independent order. The clinical read is NOT tied to
 * the representative: the survivor carries `memberEventIds` (every raw member of the
 * collapsed bout), and assembleReport reads the phenotype across ALL of them — the
 * four-state/assessed aggregate from the best-status member, and present blood/foreign
 * escalating on a flag in ANY member (§5.9 escalate-on-presence), so a photographed
 * flag on a dropped duplicate is never lost regardless of which member represents.
 *
 * Owner-entered severity/notes on a dropped duplicate are merged onto the survivor
 * (severity = MAX across the cluster — never understate; note = first non-null), so
 * the collapse loses no clinically-relevant owner input.
 *
 * Returns the surviving events (each tagged with dupCount + memberEventIds) AND the
 * set of dropped event ids (so every downstream join — AI analyses, doses, weight —
 * excludes the collapsed duplicates too).
 */
export interface DedupResult {
  events: Array<ReportEventInput & { dupCount: number; memberEventIds: string[] }>
  droppedEventIds: Set<string>
}

export function dedupeEvents(
  events: ReportEventInput[],
  completedAnalysisEventIds: Set<string>,
  // Window predicate — makes the representative window-aware (default: everything
  // in-window, so the pure-dedup unit tests behave identically). See finding 1.
  isInWindow: (e: ReportEventInput) => boolean = () => true,
): DedupResult {
  // Group key. Meals cluster by food_item_id (two DIFFERENT foods seconds apart are two
  // real feedings). Observation events (vomit/diarrhea/stool/…) cluster by type (a bout
  // logged twice). EVERYTHING ELSE (medication, weight_check, other) gets a UNIQUE key so
  // it never clusters — its distinguishing identity is on the joined child, not the event
  // row, so a type-and-minute collapse would silently drop a real dose/reading (the B-156
  // "two drugs together" data-loss bug this narrow scope closes).
  const groupKey = (e: ReportEventInput): string => {
    if (e.type === 'meal') return `meal|${e.meal?.foodItemId ?? 'null'}`
    if (DEDUP_OBSERVATION_TYPES.has(e.type)) return e.type
    return `keep|${e.id}`
  }

  // A stable, total order for picking the representative: in-window first (never let a
  // duplicate pull the incident out of the window), then completed-AI, then earliest, then id.
  const rank = (e: ReportEventInput): [number, number, number, string] => [
    isInWindow(e) ? 0 : 1,
    completedAnalysisEventIds.has(e.id) ? 0 : 1,
    parseMs(e.occurredAt) ?? Number.POSITIVE_INFINITY,
    e.id,
  ]
  const rankLess = (a: ReportEventInput, b: ReportEventInput): boolean => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < 4; i++) {
      if (ra[i] !== rb[i]) return ra[i] < rb[i]
    }
    return false
  }

  const byGroup = new Map<string, ReportEventInput[]>()
  for (const e of events) {
    const k = groupKey(e)
    const arr = byGroup.get(k)
    if (arr) arr.push(e)
    else byGroup.set(k, [e])
  }

  const survivors: Array<ReportEventInput & { dupCount: number; memberEventIds: string[] }> = []
  const droppedEventIds = new Set<string>()

  for (const arr of byGroup.values()) {
    // Sweep in occurred_at order so "near-simultaneous" is a local comparison.
    const sorted = [...arr].sort((a, b) => {
      const am = parseMs(a.occurredAt) ?? Number.POSITIVE_INFINITY
      const bm = parseMs(b.occurredAt) ?? Number.POSITIVE_INFINITY
      if (am !== bm) return am - bm
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    let cluster: ReportEventInput[] = []
    const flush = () => {
      if (cluster.length === 0) return
      let rep = cluster[0]
      for (const e of cluster) if (rankLess(e, rep)) rep = e
      for (const e of cluster) if (e.id !== rep.id) droppedEventIds.add(e.id)
      // Merge owner-entered severity/notes so the collapse loses no clinical input.
      let severity = rep.severity
      for (const e of cluster) {
        if (e.severity != null && (severity == null || e.severity > severity)) severity = e.severity
      }
      const note = rep.notes ?? cluster.find((e) => e.notes != null)?.notes ?? null
      // Every raw member id (sorted, deterministic). assembleReport reads the phenotype
      // across ALL of them — best-status member for the four-state/assessed aggregate, and
      // present blood/foreign unioned over any member (§5.9 escalate-on-presence).
      const memberEventIds = cluster.map((e) => e.id).sort()
      survivors.push({ ...rep, severity, notes: note, dupCount: cluster.length, memberEventIds })
      cluster = []
    }
    let clusterAnchorMs: number | null = null
    for (const e of sorted) {
      const ms = parseMs(e.occurredAt)
      if (cluster.length === 0) {
        cluster = [e]
        clusterAnchorMs = ms
        continue
      }
      // Join iff within DEDUP_WINDOW_MS of the cluster's FIRST member (the anchor stays
      // fixed for the cluster's life), bounding total span to one window. An unparseable
      // time never absorbs into a cluster (it can't be "near" anything).
      if (ms !== null && clusterAnchorMs !== null && ms - clusterAnchorMs <= DEDUP_WINDOW_MS) {
        cluster.push(e)
      } else {
        flush()
        cluster = [e]
        clusterAnchorMs = ms
      }
    }
    flush()
  }

  // Restore chronological order for the appendix log + weekly bucketing.
  survivors.sort((a, b) => {
    const am = parseMs(a.occurredAt) ?? Number.POSITIVE_INFINITY
    const bm = parseMs(b.occurredAt) ?? Number.POSITIVE_INFINITY
    if (am !== bm) return am - bm
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return { events: survivors, droppedEventIds }
}

// ── Output snapshot types ─────────────────────────────────────────────────────

export interface Signalment {
  name: string
  species: Species
  breed: string | null
  sex: 'male' | 'female' | 'unknown'
  /** NOT stored today (spec §7.1) → 'not_recorded', rendered honestly, never guessed. */
  neuterStatus: 'neutered' | 'intact' | 'not_recorded'
  ageYears: number | null
  ageMonths: number | null
  dateOfBirth: string | null
  /** 'approximate' ⇒ age was estimated, not born-on a witnessed date → the renderer omits the birth year (B-251 honesty rule). */
  dateOfBirthPrecision: 'exact' | 'approximate'
  ownerName: string | null
  /** Latest weigh-in overall (weight_checks), NEVER the pets.weight_kg onboarding snapshot (spec §7.1). */
  latestWeight: { kg: number; lbs: number; date: string } | null
}

export interface ScopeInfo extends ReportScope {
  /**
   * §6 cherry-pick guard: on a CUSTOM window only, the count of this pet's in-record
   * symptom incidents that fall OUTSIDE the chosen window (so a vet can see the owner
   * did not crop to a good week). 0 on the principled default cascade (guard not shown).
   */
  outOfWindowSymptomCount: number
  outOfWindowMostRecent: string | null
  /**
   * B-613 — WHAT THE MOST RECENT EXCLUDED EVENT WAS, not just when.
   *
   * The type is read one line above in the counting loop and used to be dropped there.
   * Two cold reads (rounds 14 + 15) ranked its absence the top non-blocking item both
   * times, on the same reasoning: "5 symptom events fall outside this window (most
   * recent May 28)" over a completed trial is read as bookkeeping, while "most recent:
   * loose stool, May 28" is read as a relapse in the final week. The count says the
   * window is incomplete; the type says whether the incompleteness matters.
   *
   * Scoped to the MOST RECENT excluded event only, deliberately — not a per-type
   * breakdown. The guard is a pointer to appendix A, not a second symptom table, and
   * the recent tail is the part a cropped window hides that the reader cannot infer.
   */
  outOfWindowMostRecentType: ReportSymptomType | null
  /**
   * The cherry-pick count, SPLIT (B-600, cold read round 11).
   *
   * A one-ended crop is adequately served by a scalar — everything excluded is on the
   * side the reader can infer. A BOTH-ENDS crop is not, and the hand-picked window is
   * the only basis that produces one: a completed 56-day trial reported through a
   * window closing eleven days early rendered "5 symptom events fall outside (most
   * recent May 28)" over a page whose visible trend ends on a zero week. The most
   * recent excluded event was eight days past the window edge and three days before
   * the trial ended, and nothing said which side any of them fell.
   *
   * The report advertises this guard by name — "shown so nothing is cropped to a good
   * week" — and B-494's rule binds an advertised guard: a zone the report teaches the
   * reader to scan may not be left under-specified, because an advertised guard reads
   * as a complete one. The rows are in hand at the counting loop; the split is free.
   */
  outOfWindowBefore: number
  outOfWindowAfter: number
  /**
   * B-613 — THE TRIAL-CROP HALF OF THE GUARD, which the fields above cannot reach.
   *
   * Everything above is gated on `isCustomOverride`, because the question it answers is
   * "did the owner crop to a good week?" — an owner's question about an owner's choice.
   * But `since_visit` truncates a long trial BY CONSTRUCTION (it is the second report of
   * any trial, the one sent at or after a recheck), and there the app picked the window,
   * so no cherry-pick reading applies and none was offered: the trial block said "42
   * trial days fall before it, outside this report's window" and nothing anywhere said
   * what was logged in those 42 days.
   *
   * That is B-494's rule arriving one section down. The block ADVERTISES the crop, and an
   * advertised guard reads as a complete one — a reader told exactly how much of the trial
   * is missing, and never told the missing part holds six vomits, has been handed the
   * shape of a disclosure with the disclosure taken out.
   *
   * `null` ⇒ there is no trial, or this window covers all of it (the first report of any
   * trial, and every client surface). Non-null ⇒ the block's truncation sentence carries
   * this clause. Counted over the TRIAL's elapsed span minus this report's window, never
   * over all history: outside the trial is outside this block's subject.
   */
  trialCropSymptoms: {
    count: number
    mostRecentIso: string | null
    mostRecentType: ReportSymptomType | null
    /**
     * THE MIX, not just the most recent (cold read round 16). On a GI-indication trial,
     * "5 vomits" and "3 vomits and 2 itch" are different patients, and the loop holds
     * every type already — naming one and dropping four was the same withholding this
     * field exists to end, one notch smaller. Descending by count, then by type name so
     * the same record always renders in the same order.
     */
    byType: Array<{ type: ReportSymptomType; count: number }>
    /**
     * THE DENOMINATOR (cold read round 16, BLOCKING). "5 symptom events over 42 days" is
     * a rate if those days were logged and an unknown if they were not, and nothing said
     * which — while the report's own legend promises "a count is never read without
     * knowing how long and how completely it was tracked". An advertised rule the page
     * then breaks for the one count a reader most needs it on is worse than no rule,
     * because it stops them looking for the qualifier.
     *
     * MEAL-logged days, not any-logged days, on the C5 precedent: "days with any log" on a
     * real record IS largely the symptom series, so it would circle back on the very count
     * it is qualifying and inflate toward "well tracked" exactly when symptoms are dense.
     */
    cropDays: number
    mealLoggedDaysInCrop: number
    /**
     * The count is a FLOOR — the event pull did not reach back to the trial's start, so
     * cropped days exist that nothing counted. Rendered as "at least N", never as a total.
     *
     * It is not decoration: `computeLookbackIso` floors the pull at
     * `min(windowStart - 90d, now - 180d)`, and a `since_visit` report on a long-running
     * elimination can crop more than that off the trial's head. Printing the short count
     * as a total would be the same failure this field exists to close, one layer further
     * in — an incomplete answer wearing a complete one's clothes.
     *
     * TRUE WHEN THE PULL EXTENT IS UNKNOWN (`ReportInput.eventsSinceIso` absent). Silence
     * about the floor is not evidence of completeness, and this report may not claim a
     * total it cannot support (CUL-708's shape: where a value describes what the call
     * unconditionally writes, absence has no safe reading).
     */
    countIsFloor: boolean
  } | null
}

export type ClinicalQuestionType = 'diet_trial_working' | 'symptom_monitoring'

export interface ClinicalQuestion {
  question: ClinicalQuestionType
  primarySymptom: ReportSymptomType | null
}

export type SafetyFlag =
  | {
      kind: 'present_blood'
      /** Which incident family this blood was seen in — selects the anatomy framing + noun in the band row. */
      source: 'vomit' | 'stool'
      /**
       * PRESENT-only (§5.9): the incidents where blood was actually seen; never a "0 of N". Vomit uses
       * fresh_red/coffee_ground; stool uses fresh_red (haematochezia) / dark_tarry (melena), or `null`
       * when present but the subtype was unread.
       */
      incidents: Array<{ eventId: string; occurredAt: string; kind: 'fresh_red' | 'coffee_ground' | 'dark_tarry' | null }>
    }
  | {
      kind: 'present_foreign'
      incidents: Array<{ eventId: string; occurredAt: string; note: string | null }>
    }
  | {
      kind: 'intake_decline'
      trigger: IntakeDeclineFinding['trigger']
      species: Species
      baselineScore: number
      recentScore: number
      daysBelowBaseline: number
      refusedFoodLabel: string | null
      ratedMealsConsidered: number
      /** B-213 — occurred_at of the most recent fully-eaten meal, or null when none in the window. */
      lastFullMealIso: string | null
      /**
       * B-213 — whole hours from the report's `now` (the window end, = scope.detectionNowIso, the
       * SAME instant the detector used) to the last full meal; null when there is no full meal. The
       * "how long off food?" number that sets urgency inside the feline hepatic-lipidosis window.
       * Computed here (not in the finding) so the finding stays a raw fact and the report owns the
       * window-relative arithmetic. Never negative (clamped).
       */
      hoursSinceLastFullMeal: number | null
    }
  | {
      /**
       * B-494 — THE REFUSED PRESCRIBED DIET, AS A SAFETY FLAG.
       *
       * The cold read that produced this: an 8-year-old cat, 38 of 38 rated feedings of the
       * prescribed diet logged as refused across 19 days, ~7% of body weight lost, active
       * chronic vomiting — and an EMPTY safety band. `detectIntakeDecline` is a RELATIVE-decline
       * detector, so a diet refused from day 1 is uniformly low rather than falling and returns
       * `{status:'none'}`; the trial's own `trialDietRefusal` existed for exactly that patient and
       * was not a `SafetyFlag`, so it never reached the band.
       *
       * The ruling (2026-07-26): the report TEACHES the reader to scan the flag zone, and the
       * legend then states affirmatively that no reduced-intake flag fired — so an empty band on
       * this patient reads as a NEGATIVE RESULT rather than as silence. That is
       * reassurance-on-absence at the report layer, which `clinical-guardrails` forbids, and
       * *intake is not preference* routes refusal toward a health flag by invariant.
       *
       * PRESENCE-ONLY, like every other flag here: it fires on logged evidence (the ratified
       * `REFUSAL_*` floors, or the owner's own "wouldn't eat it" at completion) and its absence is
       * never an all-clear. It does NOT replace `intake_decline` — both can fire, and they answer
       * different questions (a fall from baseline vs. a diet that was never eaten).
       */
      kind: 'trial_diet_refusal'
      /**
       * The counts, or null when the ONLY evidence is the owner's stopped-reason. Null is not
       * "no refusal": it is a refusal the owner reported and the intake log cannot corroborate,
       * which is a real and common shape (the owner who stops rating once she gives up).
       */
      refusal: TrialDietRefusal | null
      /** The trial was ENDED because the pet would not eat the diet (`stopped_reason`). */
      stoppedForRefusal: boolean
      species: TrialSpecies
      /** Every `primary_diet` label in force — the food to name. Never rendered under a
       *  `meal_record` population, where the app has admitted it cannot identify the diet. */
      trialDietLabels: string[]
      /** The EVIDENCE span the refusal counts were taken over — named for what the
       *  value IS (round 4's finding ③): round 3 fixed the VALUE here (evidence,
       *  not the clipped coverage range) but kept the `range*` name, leaving one
       *  snapshot where `trial.rangeEndDate` and this field disagreed by 145 days
       *  under the same name. The branch's own rule is that `range*` may only ever
       *  appear next to the word "coverage" — so the name follows the value. */
      evidenceStartDate: string
      evidenceEndDate: string
    }
  | {
      kind: 'chronicity'
      symptomType: SymptomType
      episodeCount: number
      spanDays: number
      activeWeeks: number
      symptomDays: number
      daysSinceLastEpisode: number
      /** BELIEF anchor: the first onset the DETECTOR saw, bounded by its own `windowDays`
       *  lookback. Kept because every count beside it is measured from here. Never rendered
       *  as the record's start — see `firstLoggedIso` (CUL-69). */
      firstOnsetIso: string
      /**
       * EVIDENCE anchor: the earliest logged entry of this symptom in the REPORT window —
       * the same rows appendix A prints. Separate from `firstOnsetIso` for the reason
       * `TrialFacts.exposureRange` is separate from `range`: one bounds what the engine
       * counted, the other bounds what the record holds, and rendering the first as the
       * second understates a course by the gap between the two windows (CUL-69).
       *
       * REQUIRED, not optional-by-omission: it describes the very value the flag always
       * states, so silence here would be a claim about the record (the CUL-708 rule). The
       * one producer answers it; a fixture that omits it fails to compile rather than
       * quietly re-inheriting the lookback edge.
       */
      firstLoggedIso: string
      tier: SymptomChronicityFinding['tier']
      windowDays: number
      /** §9 cough↔vomit adjacency — set on the leading flag when both courses are chronic
       *  (CUL-676). The report states it in the vet register; the Signal card states it in
       *  the owner's. Both read off the same engine fact, so they cannot disagree. */
      coughVomitAdjacent?: true
    }
  | {
      kind: 'symptom_worsening'
      symptomType: SymptomType
      currentCount: number
      priorCount: number
      currentDays: number
      priorDays: number
      trigger: SymptomWorseningFinding['trigger']
      tier: SymptomWorseningFinding['tier']
      windowDays: number
    }
  | {
      /**
       * B-704 §6 — THE TARGET-VS-LABEL MISMATCH, AS A SAFETY FLAG.
       *
       * The owner recorded one trial protein and the trial food's own label names another
       * (a wrong-primary trial food). Made a flag, not just a disclosure line, for the
       * B-494 reason its sibling was: the report TEACHES the reader to scan the flag zone,
       * and the legend advertises "a prescribed diet going uneaten" as a trigger — so a
       * trial where the pet may have eaten the WRONG protein for the whole window, left out
       * of the band, reads as a negative result on a fast scan. `vet-report-cold-read`
       * (2026-08-05) ruled the disclosure-line-only treatment a false-reassurance trap: the
       * exposure counts (measured against the food's label) look "nearly clean" while, if
       * the recorded protein is the true antigen, every trial-diet feeding is itself
       * off-target and the elimination never happened.
       *
       * TRIAL-LEVEL, never per-feeding (TG-3) — like chronicity, it is an aggregate standing
       * fact, not an alarm on any one meal. It NEVER moves a count or a feeding's
       * classification (TG-1): it names a discrepancy the record cannot resolve and states
       * which baseline the exposure figures use, so a vet is not misled by them.
       */
      kind: 'protein_mismatch'
      /** The owner's recorded protein (what they believe the trial tests). */
      recordedProtein: string
      /** The trial food's own designated primary — what the exposure figures measure against. */
      foodProtein: string
      /** Every `primary_diet` label in force — the bag to name. */
      trialDietLabels: string[]
    }

export interface SymptomAggregate {
  type: ReportSymptomType
  /** Deduped incidents of this type in the window (§5.11). */
  count: number
  /** Distinct local-days carrying an incident of this type (density). */
  symptomDays: number
  /** §5.1 denominators, on every aggregate. */
  windowDays: number
  loggedDays: number
  firstOnset: string | null
  lastOnset: string | null
  /** Bar heights: incident count per 7-day bucket from the window start (§3.5). */
  weeklyBuckets: number[]
  /** The local start date of each bucket (the date anchors under the chart). */
  bucketStartDates: string[]
  /**
   * Days with ANY logged event in each bucket — the chart's own denominator (B-532).
   *
   * A zero bar answered two completely different questions with one glyph: "the owner logged
   * this week and there were no episodes" and "nobody logged anything". The cold read caught
   * the second reading at the worst possible place — the terminus of a descending curve on a
   * trial the owner had stopped logging a week early — where a flat `0` nub is the visual
   * conclusion of the trend and reads as *resolved*. Absence of a log is not evidence a
   * symptom did not occur, and the chart is the element a 60-second scan actually takes.
   *
   * Window-scoped and symptom-agnostic (any event counts, not just this type), which is the
   * right denominator for "was this week observed at all".
   */
  loggedDaysByBucket: number[]
  /**
   * The first-vs-last-half comparison, over EQUAL-LENGTH halves (B-532).
   *
   * THE RENDER USED TO DERIVE THIS FROM THE WEEKLY BUCKETS, and weekly buckets do not
   * halve a window: with `mid = floor(nBuckets/2)` the first half was `mid × 7` days and
   * the last half was everything else, so the LAST window was systematically the LONGER
   * one — by up to 6 days on a normal report, and by 7-vs-1 on a nine-day one. Two raw
   * counts over unequal exposures are not a comparison, and the error has a direction: a
   * longer late window inflates the late count, which understates a real fall. The cold
   * read caught it hiding a 44% improvement in episode RATE behind a flat-looking pair
   * of numbers — and on a diet trial, "no improvement" is the reading that ends the diet.
   *
   * So the split is day-exact and symmetric: `days` from each END of the window. When
   * `windowDays` is odd the middle day is in NEITHER half — deliberately, because the
   * alternative is to give the spare day to one side and reintroduce the same bias in
   * miniature. That day is not deleted from anything: it is in `count`, in the chart, and
   * in appendix A. It is excluded only from this comparison, and the render prints the
   * two date spans so the partition is legible rather than assumed.
   *
   * Null when the window is too short to halve meaningfully (< 8 days) — the same floor
   * the bucket-derived delta had, so no report gains or loses a delta from this change.
   */
  trendHalves: {
    /** The length of EACH half, identical by construction. */
    days: number
    firstCount: number
    lastCount: number
    /** Local day keys bounding each half — rendered, so the reader can see the partition. */
    firstStartDate: string
    firstEndDate: string
    lastStartDate: string
    lastEndDate: string
    /**
     * Events on the excluded middle day of an ODD window (B-600, cold read round 13).
     *
     * The exclusion is right — handing the spare day to one side reintroduces the bias
     * the equal halves exist to remove — but it is only right while the page does not
     * let the comparison contradict the total. Rendered: a 31-day window whose ONE
     * symptom event fell on the median day printed "first 15 d 0 → last 15 d 0" three
     * centimetres under "1 / 31 d". The delta had swallowed 100% of the evidence, and
     * a 60-second scan reads two zeroes as no episodes.
     *
     * So the day is DISCLOSED beside the comparison rather than given to a half or
     * hidden — C5's disclose-don't-adjudicate, applied to a denominator instead of a
     * rate. Zero on an even window, where there is no middle day.
     */
    middleCount: number
    /** The excluded day, when the window is odd; null when it is even. */
    middleDate: string | null
  } | null
}

export type VomitContentCategory = 'food' | 'bile' | 'hairball' | 'foam_liquid' | 'grass' | 'unsure'

export interface VomitPhenotype {
  totalIncidents: number
  withAnalysis: number
  /** The four AI-pipeline states, kept DISTINCT (§5.10). Sum === withAnalysis. */
  states: { completed: number; uncertain: number; failed: number; pending: number }
  /** The assessed denominator = states.completed (a legible AI read). */
  assessedCount: number
  /** Primary contents category per assessed incident; the counts sum to assessedCount. */
  contentsMix: Record<VomitContentCategory, number>
  consistencyDistribution: Record<string, number>
  /** PRESENT-only (§5.9) — arrays of the incidents where it was actually seen. Empty ⇒ render a de-weighted limitation note, NEVER "0 of N". */
  bloodPresent: Array<{ eventId: string; occurredAt: string; kind: 'fresh_red' | 'coffee_ground' }>
  foreignPresent: Array<{ eventId: string; occurredAt: string; note: string | null }>
  /** Assessed analyses the owner has edited (owner-reviewed); the rest are raw AI ("owner-reviewable", §5.10). */
  reviewedCount: number
}

export interface StoolCharacteristics {
  total: number
  normalCount: number
  looseCount: number
  windowDays: number
  loggedDays: number
  /**
   * AI photo-read enrichment (migration 034 / analyze-stool). Null when NO stool incident has a
   * photo the AI could read — the section then renders the owner-described counts + an honest "not
   * an exam finding" limitation, exactly as before this data source existed (§3.7 gating). The
   * counts above are always owner-described; this sub-object is the automated photo read layered on.
   */
  ai: StoolAiReads | null
}

/**
 * The automated stool photo-read aggregate — the stool sibling of VomitPhenotype, scoped to the
 * two AI-read dimensions the vet report carries (Bristol consistency + colour descriptively;
 * blood + mucus present-only). Same §5.9/§5.10 discipline as vomit: descriptive aggregates are
 * over the ASSESSED (completed) set only; blood/mucus are PRESENT-only (never "0 of N"), unioned
 * across every member of a collapsed incident so a flag on a dropped duplicate still surfaces.
 */
export interface StoolAiReads {
  totalIncidents: number // stool incidents in window (normal + loose), = StoolCharacteristics.total
  withAnalysis: number
  /** The four AI-pipeline states, kept DISTINCT (§5.10). Sum === withAnalysis. */
  states: { completed: number; uncertain: number; failed: number; pending: number }
  /** The assessed denominator = states.completed (a legible AI read). */
  assessedCount: number
  /** Bristol type distribution over ASSESSED incidents; 'unsure' excluded (no legible type). */
  consistencyDistribution: Record<string, number>
  /** Colour distribution over ASSESSED incidents; 'unsure' excluded. */
  colourDistribution: Record<string, number>
  /**
   * PRESENT-only (§5.9) — the incidents where blood was actually seen. `kind` distinguishes
   * haematochezia (fresh_red) from melena (dark_tarry); null when present but the subtype is
   * unread. Empty ⇒ render a de-weighted limitation note, NEVER "0 of N".
   */
  bloodPresent: Array<{ eventId: string; occurredAt: string; kind: 'fresh_red' | 'dark_tarry' | null }>
  /** PRESENT-only — incidents where mucus was seen. Monitor-tier (D5): surfaced, never dropped, never an escalation on its own. */
  mucusPresent: Array<{ eventId: string; occurredAt: string }>
  /** Assessed analyses the owner has edited (owner-reviewed); the rest are raw AI. */
  reviewedCount: number
}

/** Present-only safety class carried by a photographed incident — also LEADS the safety band. */
export type IncidentPhotoSafety = 'blood' | 'foreign'

/**
 * One photographed incident, for Appendix E (PR 7). Built PURELY here (which incidents, order,
 * per-photo metadata + the present-only safety class); the actual image bytes are fetched,
 * EXIF/GPS-stripped, downscaled and base64-embedded by the index.ts I/O shell into `dataUri`
 * AFTER assembly, so report.ts stays I/O-free and unit-testable. One entry per attachment (an
 * incident with two photos yields two entries sharing the incident's date/type/phenotype/safety).
 */
export interface IncidentPhoto {
  eventId: string
  /** Storage object path (nyx-event-attachments). Consumed only by index.ts for the signed fetch — NEVER rendered. */
  storagePath: string
  /** event_type of the incident (drives the caption label). */
  type: string
  occurredAt: string
  occurredAtConfidence: OccurredAtConfidence | null
  occurredAtEarliest: string | null
  occurredAtLatest: string | null
  /** Owner note on the incident (may be null). */
  notes: string | null
  /**
   * Present-only safety class (§5.9) on THIS incident — a photo the render also surfaces IN the
   * safety band on page 1 (prominence is orthogonal to inclusion, §2). Null = no safety flag.
   */
  safety: IncidentPhotoSafety | null
  /**
   * Owner-reviewable AI phenotype for the incident (vomit only; present-only fields). NEVER an
   * n=1 verdict/recommendation — the single-incident read stays in the app, off the report (§4).
   * Null for a non-vomit photo or a vomit with no analysis.
   */
  phenotype: SymptomLogPhenotype | null
  /**
   * The EXIF/GPS-stripped, downscaled image as a `data:` URI — populated by index.ts (I/O) after
   * pure assembly. NULL in pure assembly, and NULL when the server-side transform fetch failed: a
   * null-dataUri photo renders as an honest "photo could not be embedded" placeholder (metadata +
   * AI read still shown), and the raw original (which may carry GPS) is NEVER embedded as a fallback.
   */
  dataUri: string | null
}

export interface WeightTrendView {
  readingCount: number
  seriesLbs: number[]
  seriesKg: number[]
  latestLbs: number | null
  latestKg: number | null
  earliestDate: string | null
  latestDate: string | null
  deltaLbs: number | null
  deltaKg: number | null
  /** Descriptive direction only — NEVER a verdict/colour/reassurance (guardrail travels from migration 024). */
  direction: 'up' | 'down' | 'flat' | null
}

export interface WeightSection {
  /** No weigh-ins anywhere ⇒ a designed logging-nudge empty state (spec §7.1), never a fabricated value. */
  isEmpty: boolean
  latest: { kg: number; lbs: number; date: string } | null
  /** Trajectory over IN-WINDOW readings; null when the window has none. */
  trend: WeightTrendView | null
}

/**
 * One food's captured protein exposure, as every render surface consumes it
 * (B-351 slice 5 — spec §9, gated by D10).
 *
 * THE WHOLE POINT OF `complete` IS THAT THE ARRAY CANNOT SPEAK FOR ITSELF.
 * `proteins: ['duck']` read off a real ingredient panel and `['duck']` typed from
 * the front of the bag are byte-identical, and the report is served under a
 * provenance line saying "as read from product labels" — so rendering the second
 * as a clean single-protein diet tells a vet a possibly-contaminated elimination
 * food is clean. That is reassurance-on-absence (`clinical-guardrails`) on the
 * surface with the highest consequence. `complete` is the ONLY licence to say
 * anything about what is NOT in a food; every other claim here is present-only.
 *
 * `offTrial` is likewise PRESENT-ONLY and never causal (Dr. Chen's §9 condition
 * 3): it names proteins that are in the food and are not the trial protein. It
 * asserts nothing about whether they caused anything, and an EMPTY `offTrial` is
 * never an all-clear — under `complete: false` it mostly means nobody read the
 * label.
 */
export interface ProteinSetView {
  /** Canonical, prominence-ordered, deduped. `[0]` is the primary (§9 condition 2). */
  proteins: string[]
  /** D10's gate. FALSE ⇒ no surface may claim this set is everything in the food. */
  complete: boolean
  /** Off-trial proteins present in THIS food, prominence-ordered. Empty when there
   *  is no active trial, no resolvable target protein, or none are present. */
  offTrial: string[]
}

export interface DietSummary {
  /**
   * The active trial's canonical target protein — the one key every `offTrial` on this
   * snapshot was computed against, resolved once (B-351 slice 5).
   *
   * NULL whenever the off-trial check is disabled: no active trial, or a trial food
   * whose main protein the owner never designated (or cleared). Null means SILENCE,
   * never an all-clear — a render must not conclude anything from an empty `offTrial`
   * when this is null, because nothing was compared.
   */
  trialTargetProtein: string | null
  /**
   * How `trialTargetProtein` was resolved (B-704 §7.4), so the report renders the
   * provenance a vet needs to weigh it: an OWNER's stated antigen ("owner-confirmed")
   * reads differently from the app's best guess off the label ("from the trial diet"),
   * and a mid-trial confirmation is disclosed ("protein confirmed day N").
   *
   * NULL exactly when `trialTargetProtein` is null (no protein resolved) — the two
   * travel together, so a null here is the same silence, never an all-clear (TG-2).
   * `confirmedDay` is the 1-based trial day the owner set/changed the protein when
   * `target_protein_set_at` falls AFTER day 1; null for a derived target, an owner set
   * at/before day 1, or a missing/unparseable set-at.
   *
   * OPTIONAL, unlike `trialTargetProtein` above: this is display-only provenance metadata
   * (no code path keys a decision off it), so it is additive. `buildSnapshot` always sets
   * it; an older fixture that omits it renders the identity without a provenance word —
   * the same graceful degradation as a null. `trialTargetProtein` stays required because
   * the off-trial naming is built on it.
   */
  trialProteinProvenance?: { source: TrialProteinSource; confirmedDay: number | null } | null
  /**
   * The target-vs-label tension (B-704 §6 / TG-3), when live: the owner stored a
   * protein and the trial food's own designated primary names a DIFFERENT one. A
   * TRIAL-LEVEL standing fact, rendered as one disclosure line — NEVER a per-feeding
   * flag, and it never changes a count or a feeding's classification (TG-1). Null/absent
   * when there is no tension (derived target, no stored value, or they agree). Optional
   * for the same reason as `trialProteinProvenance` — additive display metadata.
   */
  trialProteinMismatch?: { target: string; foodProtein: string; foodLabel: string | null } | null
  /**
   * The PROTEIN-SET VIEW of the trial this report describes — the half B-351's
   * off-trial marking is built on. Non-null exactly when `ReportSnapshot.trial` is:
   * they are two views of one selected trial and can never disagree about whether
   * there is one.
   *
   * NOT "the active trial" any more, despite what every reader used to assume: a
   * trial that ended inside the window still describes the report (§7's "a report
   * generated the day after completion still renders the trial section"). Read
   * `snapshot.trial.status` before writing anything present-tense about it.
   *
   * NO DAY MATH LIVES HERE. `daysElapsed` used to, and it was a second, unclamped
   * implementation of the counter — the exact shape B-421 spent a PR deleting from
   * the client. Day N, the target and the overrun all come from `snapshot.trial`.
   */
  trial: {
    foodLabel: string | null
    primaryProtein: string | null
    startedAt: string
    targetDurationDays: number
    vetName: string | null
    /** The trial food's OWN set — shape ① (§8): the "duck" trial diet that also
     *  lists chicken. `offTrial` here is the trial diet contaminating itself. */
    proteinSet: ProteinSetView
  } | null
  /** Active free_choice arrangements → "Intake not directly observed" (B-040, verbatim in render). */
  freeFed: Array<{
    foodLabel: string | null
    primaryProtein: string | null
    activeFrom: string | null
    activeUntil: string | null
    proteinSet: ProteinSetView
    /** B-040: the bowl is shared with another pet, so a protein in it is available to
     *  this pet but not evidence this pet ate it. Reaches detection as a low
     *  attribution confidence; carried here so the RENDER can qualify a promoted
     *  claim too — an adversarial pass found the page-1 line asserting consumption
     *  from a communal bowl with its "intake not directly observed" caveat left a
     *  block below, on the very line a scanner stops before. */
    isShared: boolean
  }>
  intakeNotDirectlyObserved: boolean
  /**
   * MEALS-ONLY completion (treats + free-fed excluded, B-040). Null when no rated meals.
   * `intakeMode` is the strict-plurality intake rating across the rated meals (null on a tie or
   * when there are none) — used ONLY by the render's descriptive free-fed feeding line (R2-3), so
   * a grazing cat's discrete meals read "typically partly eaten" instead of a scary "0 of N fully
   * eaten." Descriptive texture, never a scored completion figure and never reassurance.
   */
  mealCompletion: { ratedMeals: number; finishedMeals: number; rate: number; intakeMode: IntakeRating | null } | null
  /**
   * Grouped rated-meal items (#7/#8) — the actual foods eaten AS MEALS (e.g. a wet diet),
   * grouped by food item like Appendix B treats: label · protein · feeding count · date span ·
   * typical intake. Previously the rated meals were reduced to a bare count and their food
   * identity discarded before render, so a substantial wet diet was invisible in the diet picture
   * and the feeding line cited a non-existent appendix. Named in the diet history + itemised in
   * the meals appendix (E). Descriptive only — this does NOT touch the intake-decline engine.
   */
  mealItems: Array<{
    foodLabel: string | null
    primaryProtein: string | null
    count: number
    firstDate: string | null
    lastDate: string | null
    intakeMode: IntakeRating | null
    /**
     * EVERY rating this food was given, with its count — not the mode (B-532).
     *
     * `intakeMode` is a strict plurality, so it can stand for as little as 51% of the
     * feedings and it SILENTLY DELETES the rest: the cold read hit a cat whose 38
     * feedings of a prescribed diet rendered one word, "Refused", while four "ate some"
     * meals — the only intake this animal took in nineteen days — had no cell on the
     * page. The report points three separate readers at this appendix "for the intake
     * ratings", so a column that can hide 49% of them is a circular dead end, not a
     * summary.
     *
     * Ordered along the intake scale (all → most → some → picked → refused), which is
     * how a clinician reads it, never by count — a count sort puts the modal rating
     * first and re-creates the impression the mode column gave.
     */
    intakeBreakdown: Array<{ rating: IntakeRating; count: number }>
    proteinSet: ProteinSetView
  }>
  treats: { count: number; distinctItems: number }
  /** The #1 diet-trial confounder, on its own line (B-102). */
  humanFood: { count: number; days: number; items: Array<{ date: string; label: string | null }> }
}

export interface MedicationAdherence {
  regimenId: string
  drugName: string
  strength: string | null
  doseAmount: string | null
  route: string | null
  dosesPerDay: number | null
  scheduleNotes: string | null
  indication: string | null
  startedAt: string
  endedAt: string | null
  status: string
  isSupplement: boolean
  overlapsWindow: boolean
  /** 'not_tracked' when ZERO dose events fell in the window — NEVER read as "compliant" (spec §4 trap). */
  adherenceState: 'tracked' | 'not_tracked'
  elapsedDaysInWindow: number
  daysWithDose: number
  /**
   * The local days an ADMINISTERED dose (given | partial) was logged, ascending (B-532).
   *
   * Appendix D had a dose COUNT and no dose DATES, which on a derm trial is the difference
   * between an answerable question and an unanswerable one: two doses of an antipruritic in
   * the first week and two in the last week produce the same "4" against a symptom curve
   * they explain completely differently. The count told a vet how much; nothing on the page
   * told them when. Same population as `daysWithDose` — an unconfirmed dose is not an
   * administered one and does not put a date here (adversarial finding 4).
   */
  doseDays: string[]
  expectedDoses: number | null
  givenDoses: number
  partialDoses: number
  missedDoses: number
  refusedDoses: number
  /** Unconfirmed ≠ missed ≠ refused (adherence null) — kept distinct (spec §4). */
  unconfirmedDoses: number
}

export interface EstablishedCorrelation {
  symptomType: SymptomType
  /** Owner/vet-facing LABEL — one protein, or a joint cluster named together
   *  ("chicken and duck"). Never a representative member (B-351 slice 6). */
  protein: string
  /** The candidate's protein cluster, ascending. Length ≥2 ⟺ the engine could not
   *  separate the members; the report must say so rather than let a vet read a joint
   *  candidate as two independently-implicated antigens. Optional so a signal row
   *  cached before slice 6 still renders. */
  proteins?: string[]
  matchedPairs: number
  caseExposed: number
  controlExposed: number
  riskDifference: number
  pValue: number
  symptomEventCount: number
  correlationWindowHours: number
}

/**
 * The §3.8 associational vomit-timing finding(s), extracted from the shared detection engine. A
 * discriminated union on `kind` so each variant's `detail` narrows by the tag (the lanes carry
 * different evidence). ⑤ `postprandial_timing` (≤30 min after eating) and its Signals v2 mirror
 * `empty_stomach_timing` (L1 — ≥`longGapHours` after eating) both render; a same-symptom ⑤+L1 pair
 * arrives already merged as `timing_story` (CUL-564 — the merged card the report would otherwise
 * silently drop). ⑥ `timeofday_clustering` is extracted but NOT rendered (see `timingLine`); L2
 * `trial_response` + L4 `gap_shortening` are deliberately not surfaced on the report (see
 * `runDetection`). All four are associational/band-named only — never a syndrome name, never cause.
 */
export type TimingFinding =
  | {
      kind: 'postprandial_timing'
      symptomType: SymptomType
      windowDays: number
      detail: { rapidCount: number; eligibleCount: number; totalEpisodes: number; rapidWindowMinutes: number; medianMinutesSinceFeeding: number }
    }
  | {
      kind: 'timeofday_clustering'
      symptomType: SymptomType
      windowDays: number
      detail: { clusterStartLocalHour: number; clusterWindowHours: number; clusterCount: number; eligibleCount: number; totalEpisodes: number; timezone: string }
    }
  | {
      kind: 'empty_stomach_timing'
      symptomType: SymptomType
      windowDays: number
      detail: { longCount: number; eligibleCount: number; totalEpisodes: number; longGapHours: number; medianHoursSinceFeeding: number }
    }
  | {
      kind: 'timing_story'
      symptomType: SymptomType
      windowDays: number
      detail: {
        rapidCount: number
        longCount: number
        eligibleCount: number
        totalEpisodes: number
        rapidWindowMinutes: number
        longGapHours: number
        medianMinutesSinceFeeding: number
        medianHoursSinceFeeding: number
      }
    }

export interface CorrelationSummary {
  /** ONLY `Established`-tier (spec §8.5); `Early` never reaches the report. */
  established: EstablishedCorrelation[]
  hasEstablished: boolean
  /** Honest "no established threshold over this window" state when established is empty. */
  noThreshold: boolean
  /** The dominant staple that washes out (from the reused staple-washout diagnostic) — for the honest "X is in most of what the pet eats". */
  stapleProtein: string | null
  /** The §3.8 "associational timing finding" (descriptive lanes ⑤/⑥). */
  timing: TimingFinding[]
}

export type InterventionKind = 'diet_trial' | 'medication' | 'supplement' | 'free_fed'

export interface ConcurrentChange {
  kind: InterventionKind
  label: string
  /** The intervention's start date; NULL when a standing arrangement's start was never recorded (a free-fed bowl "always down") — rendered "ongoing (start not recorded)". */
  startDate: string | null
  /** The 7-day bucket index where this intervention started (the dashed marker, §3.5); null if it started outside the window (a standing confounder gets no marker). */
  bucketIndex: number | null
  /**
   * True when the intervention STARTED before the window but is active within it — a
   * STANDING confounder (e.g. a steroid begun before the report range, running throughout).
   * It carries no chart marker (there is no start point in-window) but MUST still be named in
   * the "Reading the trend" note; otherwise a drug that suppresses the very signs the trial
   * measures is invisible and the diet silently takes its credit — spec §4/B-117, the
   * single highest-consequence misread. false ⇒ the intervention started inside the window.
   */
  ongoing: boolean
  /**
   * The end date IF the intervention STOPPED strictly before the window end (a trial completed
   * mid-window, a course that ended). NULL ⇒ still active at the window end. Without it a
   * pre-window drug that stopped mid-window rendered a false present-tense "ongoing since …"
   * (adversarial finding) — the note must say "until <date>" instead.
   */
  endInWindow: string | null
}

export interface SymptomLogPhenotype {
  /** Which analyzed incident type this phenotype describes — selects the field subset the renderer shows. */
  kind: 'vomit' | 'stool'
  status: string
  contentsCategory: VomitContentCategory | null
  consistency: string | null
  colour: string | null
  bloodPresent: 'fresh_red' | 'coffee_ground' | null // vomit blood, PRESENT-only; null when not present or not assessed
  /** PRESENT-only: true when foreign material was seen; null on absence/uncertainty (never a positive "no", §5.9). */
  foreignPresent: boolean | null
  foreignNote: string | null
  // Stool fields (migration 034); null on a vomit phenotype. Same present-only discipline.
  /** Bristol Stool Scale type key (stool_consistency); null when not a legible read. */
  bristol: string | null
  /** stool_colour enum; null when not a legible read. */
  stoolColour: string | null
  /** PRESENT-only stool blood: 'fresh_red' (haematochezia) / 'dark_tarry' (melena) / 'unread' (present, subtype unread); null on absence/uncertainty. */
  stoolBlood: 'fresh_red' | 'dark_tarry' | 'unread' | null
  /** PRESENT-only: true when mucus was seen; null on absence/uncertainty. Monitor-tier (D5), never an escalation. */
  mucusPresent: boolean | null
  /** edited_at present ⇒ owner-reviewed; else raw AI (owner-reviewable). */
  edited: boolean
}

export interface SymptomLogEntry {
  eventId: string
  type: string
  occurredAt: string
  occurredAtConfidence: OccurredAtConfidence | null
  occurredAtEarliest: string | null
  occurredAtLatest: string | null
  loggedAt: string
  /** Owner-reported 1–5; NULL renders BLANK — never invented, never averaged (§5.5). */
  severity: number | null
  notes: string | null
  /** How many raw logs collapsed into this incident (§5.11 transparency; 1 = no duplicate). */
  dupCount: number
  phenotype: SymptomLogPhenotype | null
}

export interface ConfounderExposure {
  eventId: string
  occurredAt: string
  dayKey: string | null
  foodLabel: string | null
  primaryProtein: string | null
  format: FoodFormat | null
  foodType: 'meal' | 'treat' | 'other' | null
  note: string | null
  /** The full captured set for this feeding's food (B-351 slice 5). `primaryProtein`
   *  above is unchanged and still `proteinSet.proteins[0]`'s stored spelling. */
  proteinSet: ProteinSetView
  /**
   * Which §5.3 rung classified this feeding off-diet, when the set is TRIAL-DERIVED.
   * Null on a heuristic (no-trial) report, where "off-diet" means treat-or-human-food
   * and there is no rung to name.
   *
   * `unrecognised` is the MODAL case on a real library, not the edge case: most foods
   * carry no captured protein panel, so "not recognised as trial food" is what a vet
   * will read most often — and it must never render as a contaminant assertion.
   *
   * OPTIONAL, like every other field added to a public input/snapshot shape here: an
   * absent value degrades to "heuristic report", which is the pre-PR-7 behaviour and
   * the safe direction — it can only ever withhold a trial-specific claim, never
   * invent one.
   */
  rung?: 'derived_protein' | 'unrecognised' | null
  /** D-B — the unsanctioned proteins this feeding carried. Empty is NOT an all-clear:
   *  a dark protein arm records the feeding and loses only the attribution. */
  antigens?: string[]
  /** A symptom was logged inside the species' forward challenge window after this
   *  feeding. TIMING ONLY — never a cause, never an attribution (see `TrialExposure`). */
  symptomInChallengeWindow?: boolean
  /** The food's ingredient panel WAS captured, so a rung-3 verdict means "read, and
   *  nothing in it is outside the trial diet" rather than "we never looked". */
  panelWasRead?: boolean
  /** B-529/R7(c) — the antigen arm was consulted for this feeding. Absent on a
   *  heuristic (non-trial) report, where there is no arm to be dark. */
  attributionChecked?: boolean
  /** This same food became permitted on a LATER date, so the row is here because the
   *  feeding predates permission — the reason that outranks the rung. */
  permittedLaterFrom?: string | null
}

/**
 * B-213 — one rated meal, for the recent-meals intake appendix. Populated ONLY when an
 * intake-decline flag is present (the traceability the cold-read asked for: the page-1
 * intake figures — "declined N of last M", the last full meal — must trace to real meal
 * rows). Raw ratings only; no derived "below baseline" verdict (two co-firing findings can
 * carry different baselines, and the vet reads the decline directly from the ratings).
 */
export interface IntakeLogEntry {
  eventId: string
  occurredAt: string
  foodLabel: string | null
  intakeRating: IntakeRating
  /**
   * True for the page-1 anchor — the most recent fully-eaten meal (the same meal detection.ts
   * anchors `lastFullMealIso` on). Render tags this row "last full meal" so the page-1 "how long
   * off food" number always points at a VISIBLE row (adversarial finding: the anchor can predate
   * the 40 most-recent meals in a chronic-inappetence case).
   */
  isLastFullMeal: boolean
  /**
   * True when this row is the anchor PINNED back in past the most-recent cap (it is older than
   * every other shown row, with omitted meals between). Render draws an "earlier meals omitted"
   * break before it so it never reads as contiguous with the recent rows.
   */
  pinned: boolean
}

export interface Provenance {
  ownerReported: true
  totalSymptomIncidents: number
  /** Count of in-window symptom incidents whose time is estimated/windowed (B-010) — a limitation disclosed on the report. */
  estimatedOrWindowCount: number
  deletedExcluded: true
  /** Appendix A — every in-window symptom incident, occurred-vs-logged, with per-event phenotype. */
  symptomLog: SymptomLogEntry[]
  /**
   * B-213 — rated meals for the intake appendix, most-recent-first. Capped; older rated meals
   * beyond the cap are counted in intakeLogHiddenOlder, never silently dropped.
   *
   * NO LONGER GATED ON THE INTAKE-DECLINE FLAG (B-532). It used to be, with the rationale
   * "no meal dump when there's no intake concern" — and that rationale is right about a
   * calm record and wrong about the one the cold read failed on. Three separate strings
   * send the reader here for the ratings (the `trial_diet_refusal` safety row, the trial
   * block's refusal sentence, and the legend's own "read the logged ratings in appendix E"),
   * and NONE of them is gated on `intake_decline` — `detectIntakeDecline` is a RELATIVE
   * detector, so a diet refused from day 1 is uniformly low and never fires it. The result
   * was a circular dead end on a chronically vomiting cat: page 1 pointed at an appendix
   * that held one word.
   *
   * `intakeLogScope` says which population is listed, so the appendix can caption itself
   * honestly instead of always claiming to be "the meals behind the reduced-intake flag".
   */
  intakeLog: IntakeLogEntry[]
  /** Count of in-window rated meals older than the intakeLog cap (disclosed, never a silent truncation). */
  intakeLogHiddenOlder: number
  /**
   * WHICH meals `intakeLog` holds — never inferred from its contents:
   *   • `intake_flag`   — every rated meal (most recent first), because the page-1 decline
   *                       figures need their meal-by-meal home and the last-full-meal anchor
   *                       has to be visible even when it predates the cap.
   *   • `unfinished`    — the rated meals that were NOT fully eaten. No flag fired, so there
   *                       is no page-1 figure to trace; what the report points at is the
   *                       ratings themselves, and a list of "ate it all" rows buries them.
   *   • `null`          — nothing rated below "all", so there is nothing to itemise.
   */
  intakeLogScope: 'intake_flag' | 'unfinished' | null
  /** Appendix B — off-diet exposures (treats + human food). */
  confounders: ConfounderExposure[]
  /**
   * Protein tally over non-meal feedings (the poultry-antigen reconciliation, appendix B),
   * keyed by the CANONICAL protein (lib/protein.ts) so one real protein never fragments
   * across case/qualifier variants and junk sentinels ("null") never print as proteins.
   */
  proteinExposureTally: Record<string, number>
  /** Feedings with no usable protein (junk sentinel or nothing recorded) — disclosed in appendix B, never silently dropped (§5.1). */
  proteinUnknownCount: number
  /** Appendix C context — active/monitored conditions. */
  conditions: Array<{ name: string; status: string; diagnosedAt: string | null }>
}

export interface AtAGlance {
  primarySymptom: { type: ReportSymptomType; count: number } | null
  totalSymptomIncidents: number
  windowDays: number
  loggedDays: number
  /**
   * Distinct in-window days carrying a symptom of ANY type — the union, not the
   * per-type maximum. Appendix C's dagger footnote discloses its own base rate, and it
   * was reading `max(symptomDays)` over the per-type aggregates: on a record with 16
   * itching days plus one separate loose-stool day it printed "16 of 46" where the
   * marker itself fires on any symptom, so the footnote understated the denominator and
   * made the marker look more discriminating than it is — inside the footnote whose
   * whole purpose is to admit that it is not (cold read round 5).
   */
  anySymptomDays: number
  /**
   * §5.1 COVERAGE numerator for the trial: distinct local days in the overlap range
   * carrying ≥1 logged NON-TREAT feeding. Null when no trial describes this report.
   *
   * Its denominator is `ReportSnapshot.trial.coverage.daysElapsed`, NOT the window
   * length and NOT the trial length — v0.9 computed a window-scoped numerator over a
   * trial-scoped denominator, so a well-logged 8-week trial with a week-4 recheck
   * rendered "27 / 56". Both sides now come from `computeTrialFacts` over one range.
   *
   * TREATS ARE EXCLUDED, which is not a detail: on live data 82% of feedings are
   * treats and 15.7% of covered days are treat-only, so a "days with food logged"
   * count is clearable entirely by treat data.
   */
  trialDaysLogged: number | null
  weightState: 'trend' | 'single' | 'empty'
  // ── R2-2: the no-trial / symptom-monitoring At-a-glance tile set inputs ──────────
  // (round-2 design PR, B-221). These derive the shape-conditional tiles the render
  // shows when there is NO active trial: episodes-since-onset, trajectory, and the
  // adversarial-gated days-since-last-episode tile (which must never read as recovery).
  /** Local days from the PRIMARY symptom's first onset → window end (inclusive). Null when no symptom. */
  sinceOnsetDays: number | null
  /**
   * Local days from the most recent episode of ANY symptom type → window end (0 = today). Null when
   * no symptom. Across-all (not primary-only) so the generic "most recent episode" tile can never
   * overstate a symptom-free stretch by ignoring a more-recent secondary symptom (adversarial fix).
   */
  daysSinceLastEpisode: number | null
  /**
   * Logged days strictly AFTER the last episode day, through the window end — the adversarial
   * guard behind the days-since tile: a long gap over sparsely-logged days is a LOGGING gap,
   * not a recovery, so the render co-locates this coverage rather than let "N days since" read
   * as improvement. Null when there is no primary symptom.
   */
  loggedDaysSinceLastEpisode: number | null
  /**
   * Logged days (any event) in the FIRST vs SECOND half of the window, over the SAME day-exact
   * partition as `SymptomAggregate.trendHalves` (B-532 — previously a bucket midpoint, which the
   * delta also used but which halved nothing). The unlogged-early-window caveat (R2-6): a
   * "2 → 20" acceleration over an unlogged early window is an artifact, so the render caveats
   * the trajectory when the first half is sparsely logged; its mirror (a FALL over an unlogged
   * late window — an artefactual improvement) is the more dangerous direction and is caveated
   * too. On an odd-length window the middle day is in neither count, matching the delta.
   */
  firstHalfLoggedDays: number
  secondHalfLoggedDays: number
}

/**
 * Off-diet protein exposure binned by the SAME weekly buckets as the symptom chart (#9) — the
 * data behind the "protein exposure over time" stacked bar. Tells the temporal story a table
 * can't ("a lot of proteins early, then collapsed"). Off-diet only (treats + human food, the
 * confounder set), so sum-over-bins reconciles to the Appendix C protein tally (§5.6).
 */
/**
 * SET-MEMBERSHIP SINCE B-351 SLICE 5 (§9): a feeding contributes ONE to EVERY
 * protein its food contains, not one to its primary. A duck-and-chicken treat is
 * a chicken exposure — that is the entire clinical point, and counting it only
 * under "duck" is what made the contaminant invisible.
 *
 * The consequence is a reconciliation change the render must state, not hide:
 * sum-over-proteins is now an EXPOSURE count and can exceed the FEEDING count, so
 * the two are carried separately (`totalByProtein` vs `feedingsByWeek` /
 * `totalFeedings`) and §5.6 reconciles feedings-to-feedings. Appendix C's row
 * count still equals `totalFeedings`.
 *
 * And every count here is a FLOOR, never a total: a food whose ingredient panel
 * was never read contributes only its primary, so its hidden secondaries are
 * missing from the tally. `incompleteFeedings` is what lets the render say so
 * rather than presenting an under-count as complete (D10).
 */
export interface ProteinTimeline {
  /** One week-start day key per bucket — shares the symptom chart's x-axis exactly. */
  weekStartDates: string[]
  /** Canonical protein keys present, ordered by total desc (largest sits on the stack baseline). */
  proteins: string[]
  /** bins[weekIndex][proteinIndex] = off-diet feedings that week CONTAINING that protein. */
  bins: number[][]
  /** Per-week count of off-diet feedings with no recorded protein (disclosed, never dropped, §5.1). */
  unknownByWeek: number[]
  /** Distinct local days with a MEAL-type event logged, per weekly bucket. This is the "was the DIET
   *  observed?" signal — deliberately NOT the symptom chart's any-log `loggedDaysByBucket`, which
   *  would count a logged vomit as diet observation and assert a clean off-diet week over a diet
   *  nobody watched (B-497, adversarial-reviewer). A week with zero off-diet feedings AND a meal
   *  logged is a CLEAN week (draw a `0`); with zero off-diet feedings and no meal it is UNOBSERVED
   *  (draw "not logged", never a `0`). Treats/human food are themselves off-diet feedings, so on a
   *  zero-total week the only meal-type events left are on-diet meals — exactly the right denominator. */
  mealDaysByBucket: number[]
  /** Per-week count of off-diet FEEDINGS (each counted once) — the honest denominator
   *  behind a stack whose segments may now sum higher than the feedings that produced it. */
  feedingsByWeek: number[]
  /** Sum over the window per protein — reconciles to provenance.proteinExposureTally. */
  totalByProtein: Record<string, number>
  hasUnknown: boolean
  totalFeedings: number
  /** Off-diet feedings whose food's protein set may NOT be read as complete (D10).
   *  > 0 ⇒ the tally is a floor and the render must disclose it. */
  incompleteFeedings: number
}

/**
 * A drug the owner dosed WITHOUT a configured regimen — logged doses whose `medicationId` matches no
 * regimen (§3.8). Grouped by drug so a daily OTC antihistamine reads as one line ("3 doses, Jul 2–10")
 * instead of vanishing. Counts mirror MedicationAdherence exactly: `administeredDoses` = given +
 * partial only (an UNCONFIRMED dose is never bundled as given — the compliance-over-read trap), the
 * others stay itemised so the render is honest about what's uncertain. No adherence RATE is computed
 * (there's no regimen schedule to divide by — a rate here would be fabricated).
 */
export interface UnlinkedMedicationGroup {
  itemId: string | null
  drugName: string // resolved from medicationItems, else "Unspecified medication"
  isSupplement: boolean // is_prescription === false ⇒ OTC/supplement
  strength: string | null
  route: string | null
  administeredDoses: number // given + partial
  partialDoses: number
  unconfirmedDoses: number
  refusedDoses: number
  missedDoses: number
  totalDoses: number
  firstDate: string // local day key of the earliest dose in window
  lastDate: string // local day key of the latest dose in window
  /** The local days an ADMINISTERED dose was logged, ascending — mirrors
   *  `MedicationAdherence.doseDays` so Appendix D's date column has one meaning (B-532). */
  doseDays: string[]
}

/**
 * B-140 PR 5 (D2) — one row of the lifetime "Medication history" table (§4.4, mock §05).
 *
 * WINDOW-IGNORING by design: derived over the pet's ENTIRE logged record (all regimens +
 * `lifetimeDoses`), NOT the report window — so a course that ended months before the
 * window still appears. It sits beside the windowed Appendix D (dose-level detail), never
 * replaces it: this is the "what has she been on, ever?" overview; Appendix D is the
 * "how was the current course dosed?" detail.
 *
 * These are FACTS; `render.ts` formats the Dates / Course / Doses cells. Two invariants are
 * STRUCTURAL here so the renderer cannot break them:
 *   • H1 — `ended` / `endStatus` / `endedDay` come SOLELY from an owner action (a
 *     completed/stopped regimen). A course that merely went quiet carries `ended: false`
 *     and a null `endedDay`; there is no field silence can fill, so no code path prints an
 *     ending the owner never made. `lastDoseDay` carries the honest "last dose" instead.
 *   • H4 — `dosesLogged` is the derivation's `dosesTowardTarget` (given + partial), the
 *     same predicate the profile card / med strip / Appendix D count, so no two surfaces
 *     can disagree on how many doses a course delivered.
 */
export interface MedicationHistoryEntry {
  key: string
  source: CourseSource
  /** Clinical name — a regimen's own `drug_name`, or the generic-first `medicationItemName`
   *  for a dose-derived (orphan) course. Never a guessed name. */
  drugName: string
  isActive: boolean
  // ── H1 — owner-action ending ONLY ──
  ended: boolean
  endStatus: 'completed' | 'stopped' | null
  endedDay: string | null // regimen `ended_at` DATE; null unless `ended`
  // ── Dates (all 'YYYY-MM-DD' local day keys, or null) ──
  startedDay: string | null // regimen `started_at` DATE; null on a dose-derived course
  firstDoseDay: string | null
  lastDoseDay: string | null
  singleDay: boolean // exactly one distinct logged dose day (→ a bare "Feb 11" cell)
  // ── Course description facts (all null on a dose-derived course) ──
  targetDurationDays: number | null
  targetDurationDoses: number | null
  dosesPerDay: number | null
  scheduleNotes: string | null
  runDays: number | null // inclusive start→end span, ENDED regimens only (never a countdown)
  /** target_duration_doses OR dosesPerDay×days — the "of N" for an ended course's count. */
  plannedDoses: number | null
  // ── Dose evidence (H4) ──
  dosesLogged: number // dosesTowardTarget (given + partial)
}

export interface MedicationHistoryTable {
  /** Active-first, then most-recent last dose first — the derivation's own order. */
  entries: MedicationHistoryEntry[]
  /**
   * The earliest dated point across all entries (a regimen start or a first dose), for the
   * "Lifetime of record (since <month year>)" note. Null when nothing is dated. It is
   * genuinely lifetime: `lifetimeDoses` is untrimmed and regimens are unbounded, so this is
   * the floor of the actual record, not the lookback.
   */
  sinceDay: string | null
}

export interface ReportSnapshot {
  generatedAt: string
  timezone: string | null
  scope: ScopeInfo
  signalment: Signalment
  clinicalQuestion: ClinicalQuestion
  /** §5.3: EMPTY when no flag is present — never a fabricated "all clear". Ordered: present blood/foreign lead, then engine safety order. */
  safetyFlags: SafetyFlag[]
  weight: WeightSection
  atAGlance: AtAGlance
  symptoms: SymptomAggregate[]
  vomitPhenotype: VomitPhenotype | null
  stool: StoolCharacteristics | null
  diet: DietSummary
  /**
   * B-417 §7 — the diet trial this report describes, or null when none overlaps the
   * window. Every trial-shaped number on the report (coverage, exposures, the antigen
   * tally, the permitted-food counts, the interpretability statement) reads from here,
   * and here reads from `lib/dietTrial.ts`. `diet.trial` keeps the protein-set VIEW of
   * the same trial, which the B-351 off-trial marking is built on.
   */
  trial: TrialBlock | null
  medications: MedicationAdherence[]
  /**
   * §3.8 — doses the owner logged that belong to NO configured regimen (ad-hoc / OTC). Distinct
   * from `medications` (regimens) so the regimen adherence math is untouched; these are surfaced
   * separately on page 1 + Appendix D so nothing logged goes unreported. Empty ⇒ nothing to show.
   */
  unlinkedMedications: UnlinkedMedicationGroup[]
  /**
   * B-140 PR 5 (D2) — the window-ignoring lifetime medication table (§4.4), or null when the
   * pet has no medication record at all (no regimen ever configured, no dose ever logged).
   * Renders beside Appendix D; every count reads `lib/medicationHistory.ts` (H4).
   */
  medicationHistory: MedicationHistoryTable | null
  correlation: CorrelationSummary
  concurrentChanges: ConcurrentChange[]
  proteinTimeline: ProteinTimeline
  provenance: Provenance
  /**
   * PR 7 — every photographed in-window incident, most-recent-first (Appendix E). `dataUri` is
   * populated by the index.ts I/O shell after assembly.
   */
  incidentPhotos: IncidentPhoto[]
  /**
   * PR 7 — count of in-window incidents that have an AI read but NO retained photo (owner removed
   * the photo post-analysis). Appendix E DISCLOSES these so its "every photographed incident" claim
   * never silently contradicts Appendix A's "Photo:" lines / the phenotype counts (which are
   * analysis-scoped). Appendix E renders when `incidentPhotos.length > 0 OR this > 0`.
   */
  incidentPhotosAnalyzedNoRetained: number
}

// ── Small pure helpers ────────────────────────────────────────────────────────

const LBS_PER_KG = 2.20462
/** kg → lbs, rounded to 0.1 lb — the SAME rule as lib/weight.ts so the report and the app agree. */
function kgToLbsNum(kg: number): number {
  return Math.round(kg * LBS_PER_KG * 10) / 10
}

/**
 * "Brand Product (Form)" for a food, or null when nothing is set — one home for the label rule.
 *
 * B-568 — the form is part of the NAME here, not decoration. Brand + product do not
 * identify a food: one prescription line stocked in both wet and dry shares both fields,
 * so without the form two genuinely different foods render as one string throughout the
 * report — the meal appendix, the off-diet exposure list, and the free-fed grouping. Under
 * a diet trial the two formats are separately adherent, which is precisely the question
 * §7 exists to answer, so collapsing them is a clinical loss, not a cosmetic one.
 *
 * Note this also sharpens the fallback grouping key at the free-fed rollup, where the key is
 * `foodItemId ?? mealFoodLabel(m)`: two formats of one product no longer collide into a
 * single group when the id is absent. An unspecified/unmapped form adds nothing (null tag).
 */
function mealFoodLabel(
  meal: { brand: string | null; productName: string | null; format?: FoodFormat | null },
): string | null {
  const name = `${meal.brand ?? ''} ${meal.productName ?? ''}`.trim()
  const form = foodFormatWord(meal.format ?? null)
  if (!name) return form ? form : null
  return form ? `${name} (${form})` : name
}

/**
 * The strict-plurality intake rating across a set of rated meals (R2-3), or null when the set is
 * empty OR two ratings tie for the top count (no honest "typically X"). Deterministic; used only
 * for descriptive texture on the free-fed feeding line. On a tie we return null rather than pick a
 * side — and we never break the tie toward the calmer rating, so this can't manufacture reassurance.
 */
function strictPluralityIntake(ratings: IntakeRating[]): IntakeRating | null {
  const counts = new Map<IntakeRating, number>()
  for (const r of ratings) counts.set(r, (counts.get(r) ?? 0) + 1)
  let mode: IntakeRating | null = null
  let modeN = 0
  let tie = false
  for (const [r, c] of counts) {
    if (c > modeN) {
      mode = r
      modeN = c
      tie = false
    } else if (c === modeN) {
      tie = true
    }
  }
  return tie ? null : mode
}

/**
 * The intake scale, most-eaten first. Kept here rather than imported from detection's
 * `INTAKE_SCORE` because this is a RENDER ORDER, not a score: the report never scores
 * intake, and a shared constant would invite one to be derived from the other.
 */
const INTAKE_SCALE: readonly IntakeRating[] = ['all', 'most', 'some', 'picked', 'refused']

/**
 * Every rating in a group, counted, along the intake scale (B-532). Ratings with zero
 * feedings are omitted — a "0 refused" cell is a negative claim, and this report does not
 * make those.
 */
function intakeBreakdownOf(ratings: IntakeRating[]): Array<{ rating: IntakeRating; count: number }> {
  const counts = new Map<IntakeRating, number>()
  for (const r of ratings) counts.set(r, (counts.get(r) ?? 0) + 1)
  const out: Array<{ rating: IntakeRating; count: number }> = []
  for (const r of INTAKE_SCALE) {
    const c = counts.get(r)
    if (c) out.push({ rating: r, count: c })
  }
  // A rating outside the known scale (a future enum value) is rendered rather than dropped:
  // a value this file has not been taught about must never become a silent blank on a
  // clinical page. Appended after the scale, in first-seen order.
  for (const [r, c] of counts) {
    if (!INTAKE_SCALE.includes(r)) out.push({ rating: r, count: c })
  }
  return out
}

function computeAge(dob: string | null, nowMs: number): { years: number | null; months: number | null } {
  if (!dob) return { years: null, months: null }
  const dobMs = Date.parse(`${dob}T00:00:00Z`)
  if (Number.isNaN(dobMs) || dobMs > nowMs) return { years: null, months: null }
  const d0 = new Date(dobMs)
  const d1 = new Date(nowMs)
  let months = (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + (d1.getUTCMonth() - d0.getUTCMonth())
  if (d1.getUTCDate() < d0.getUTCDate()) months -= 1
  if (months < 0) months = 0
  return { years: Math.floor(months / 12), months: months % 12 }
}

/**
 * Map a raw event_ai_analysis into its single PRIMARY vomit-contents category (mutually exclusive).
 *
 * The food / hair / bile leaves come from the SHARED predicate (lib/vomitContents.ts, CUL-226) — the
 * SAME atoms L3's readFlags reads, so this descriptor and the Signal card can't drift on a token edit.
 * The AGGREGATION is this function's own and stays here: a priority ladder collapsing to ONE category,
 * a deliberately different shape from L3's three independent present-only rates. Priority order is
 * load-bearing — "bilious" means bile AND no food (empty-stomach bilious vomiting), enforced by food
 * returning first. foam/liquid + grass are report-only categories (no Signal-card equivalent), so
 * their single-caller leaves stay local rather than joining the shared vocabulary.
 */
function classifyVomitContents(a: ReportAiAnalysisInput): VomitContentCategory {
  if (hasHair(a.contents)) return 'hairball' // most distinctive marker → highest priority
  if (hasFood(a.contents)) return 'food'
  if (hasBile(a.contents, a.bilePresent)) return 'bile' // bile, and no food/hair above ⇒ empty-stomach bilious
  const contents = new Set(a.contents ?? [])
  if (contents.has('foam') || contents.has('liquid_only')) return 'foam_liquid'
  if (contents.has('grass_or_plant')) return 'grass'
  return 'unsure'
}

/** Status informativeness for picking a collapsed incident's representative analysis (completed = most informative). */
const AI_STATUS_PRIORITY: Record<string, number> = { completed: 0, uncertain: 1, failed: 2, pending: 3 }

/**
 * The single analysis that represents a (possibly de-duplicated) incident's four-state /
 * assessed aggregate — the best-status member (completed > uncertain > failed > pending),
 * earliest-id on ties, or null when no member was analysed. Reading across ALL member ids
 * (not just the representative log) means a photographed bout keeps its read even when the
 * representative is an empty duplicate log.
 */
function pickIncidentAnalysis(
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): ReportAiAnalysisInput | null {
  let best: ReportAiAnalysisInput | null = null
  let bestPri = Number.POSITIVE_INFINITY
  for (const id of memberEventIds) {
    const a = analysisByEvent.get(id)
    if (!a) continue
    const pri = AI_STATUS_PRIORITY[a.status] ?? 4
    if (pri < bestPri || (pri === bestPri && best !== null && a.eventId < best.eventId)) {
      bestPri = pri
      best = a
    }
  }
  return best
}

/**
 * Union present blood / foreign across ALL members of a collapsed incident (§5.9
 * escalate-on-presence). ANY member's flag counts, REGARDLESS of that member's status —
 * a `fresh_red` on a `failed` read still escalates; only 'yes'/present values are folded,
 * never `unsure`/`none_visible`/`no`, so absence is never manufactured. This is why a bout
 * logged twice cannot hide a blood/foreign flag behind whichever duplicate got dropped.
 */
function unionPresentFlags(
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): { bloodKind: 'fresh_red' | 'coffee_ground' | null; foreignPresent: boolean; foreignNote: string | null } {
  let bloodKind: 'fresh_red' | 'coffee_ground' | null = null
  let foreignPresent = false
  let foreignNote: string | null = null
  for (const id of memberEventIds) {
    const a = analysisByEvent.get(id)
    if (!a) continue
    // fresh_red (acute) outranks coffee_ground (digested) when both appear across duplicates.
    if (a.bloodPresent === 'fresh_red') bloodKind = 'fresh_red'
    else if (a.bloodPresent === 'coffee_ground' && bloodKind !== 'fresh_red') bloodKind = 'coffee_ground'
    if (a.foreignMaterialPresent === 'yes') {
      foreignPresent = true
      if (foreignNote == null) foreignNote = a.foreignMaterialNote
    }
  }
  return { bloodKind, foreignPresent, foreignNote }
}

/**
 * Stool sibling of unionPresentFlags — union present blood / mucus across ALL members of a
 * collapsed stool incident (§5.9 escalate-on-presence). ANY member's flag counts regardless of
 * that member's status; only `'yes'` folds, never `'no'`/`'unsure'` (absence is never manufactured).
 * Blood kind is derived from the structured `stoolBloodType` (fresh_red = haematochezia,
 * dark_tarry = melena) exactly as generate-report derives vomit blood from its structured field —
 * NEVER from a stale visual_flags array (the B-247 seam / B-340 override-aware rule); fresh_red
 * (acute) outranks dark_tarry when both appear across duplicates, and a present-but-unread subtype
 * stays `null` (still counts as blood, unknown kind).
 */
function stoolUnionPresentFlags(
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): { bloodPresent: boolean; bloodKind: 'fresh_red' | 'dark_tarry' | null; mucusPresent: boolean } {
  let bloodPresent = false
  let bloodKind: 'fresh_red' | 'dark_tarry' | null = null
  let mucusPresent = false
  for (const id of memberEventIds) {
    const a = analysisByEvent.get(id)
    if (!a) continue
    if (a.stoolBloodPresent === 'yes') {
      bloodPresent = true
      if (a.stoolBloodType === 'fresh_red') bloodKind = 'fresh_red'
      else if (a.stoolBloodType === 'dark_tarry' && bloodKind !== 'fresh_red') bloodKind = 'dark_tarry'
    }
    if (a.stoolMucusPresent === 'yes') mucusPresent = true
  }
  return { bloodPresent, bloodKind, mucusPresent }
}

const STOOL_PHENOTYPE_TYPES = new Set<string>([STOOL_NORMAL_TYPE, DIARRHEA_TYPE])

/**
 * The owner-reviewable per-incident phenotype (present-only fields), shared by Appendix A's
 * symptom log AND Appendix E's incident-photo manifest so the two can never drift. Built for the
 * two analyzed incident families — vomit and stool (migration 034) — as a `kind`-discriminated
 * shape; null for any other type or an incident with no analysis. Reads the BEST-status member for
 * the four-state disclosure and UNIONS present blood/foreign/mucus across all members (§5.9
 * escalate-on-presence — a flag on a dropped duplicate still shows), NEVER folding
 * `unsure`/`none_visible`/`no` into a positive "no" (the reassurance-on-absence §5.9 forbids).
 */
function buildIncidentPhenotype(
  type: string,
  memberEventIds: string[],
  analysisByEvent: Map<string, ReportAiAnalysisInput>,
): SymptomLogPhenotype | null {
  if (STOOL_PHENOTYPE_TYPES.has(type)) {
    const a = pickIncidentAnalysis(memberEventIds, analysisByEvent)
    if (!a) return null
    const present = stoolUnionPresentFlags(memberEventIds, analysisByEvent)
    const stoolBlood: SymptomLogPhenotype['stoolBlood'] = present.bloodPresent
      ? present.bloodKind ?? 'unread'
      : null
    return {
      kind: 'stool',
      status: a.status,
      contentsCategory: null,
      consistency: null,
      colour: null,
      bloodPresent: null,
      foreignPresent: null,
      foreignNote: null,
      bristol: a.status === 'completed' && a.stoolConsistency !== 'unsure' ? a.stoolConsistency : null,
      stoolColour: a.status === 'completed' && a.stoolColour !== 'unsure' ? a.stoolColour : null,
      stoolBlood,
      mucusPresent: present.mucusPresent ? true : null,
      edited: a.editedAt != null,
    }
  }
  const a = type === 'vomit' ? pickIncidentAnalysis(memberEventIds, analysisByEvent) : null
  if (!a) return null
  const present = unionPresentFlags(memberEventIds, analysisByEvent)
  return {
    kind: 'vomit',
    status: a.status,
    contentsCategory: a.status === 'completed' ? classifyVomitContents(a) : null,
    consistency: a.consistency,
    colour: a.colour,
    bloodPresent: present.bloodKind,
    foreignPresent: present.foreignPresent ? true : null,
    foreignNote: present.foreignNote,
    bristol: null,
    stoolColour: null,
    stoolBlood: null,
    mucusPresent: null,
    edited: a.editedAt != null,
  }
}

// ── Detection reuse (spec §7 / §8.5) ─────────────────────────────────────────
// Build a DetectionInput from the WINDOWED rows and run the shared engine, so the
// report's correlation line and safety flags come from the ONE statistical source
// (detection.ts) and can never contradict the rolling Signal. WINDOWING CONTRACT
// (Data Scientist sign-off, spec §7): the engine sees exactly the symptom/meal
// events whose local day falls in [scope.start, scope.end], with now = the window
// end. Correlations therefore span exactly the report window; the safety detectors'
// own natural sub-windows (chronicity's 56d lookback, worsening's week-over-week)
// are measured backward FROM the window end and intersected with it — for the
// primary cases (90-day fallback ⊃ 56d chronicity window; a 21–84d diet trial) this
// reproduces the live Signal's firing exactly. A short custom window can legitimately
// under-fire a safety detector; that is honest to the chosen scope, not a bug.

export interface DetectionExtract {
  established: EstablishedCorrelation[]
  timing: TimingFinding[]
  intakeDecline: IntakeDeclineFinding | null
  /** EVERY chronic course, not just the longest (R4 both-stated, CUL-676). Was a
   *  singular; a `| null` here quietly discarded the engine's second card, so the
   *  report could print one problem line while the Signal showed two. Mirrors
   *  `worsening`, which has always been a list. */
  chronicity: SymptomChronicityFinding[]
  worsening: SymptomWorseningFinding[]
  stapleProtein: string | null
}

/** EXPORTED for the suite only, alongside `resolveScope` and `dedupeEvents`.
 *  `pet.dietTrialActive` decides three whole-detector suppressions and a
 *  priority-band promotion, and its only other observable is the ABSENCE of a
 *  finding — which is exactly why B-422 sat here unnoticed. A test that has to
 *  construct a correlation to observe a missing one is a test nobody writes. */
export function buildDetectionInput(
  input: ReportInput,
  scope: ReportScope,
  windowEvents: Array<ReportEventInput & { dupCount: number }>,
  droppedEventIds: Set<string>,
): DetectionInput {
  const tz = input.timezone

  const symptomEvents: SymptomEvent[] = windowEvents
    .filter((e) => CORRELATION_TYPE_SET.has(e.type))
    .map((e) => ({
      id: e.id,
      type: e.type as SymptomType,
      occurredAt: e.occurredAt,
      severity: e.severity,
      occurredAtConfidence: e.occurredAtConfidence,
    }))

  // Which in-window meals are drug VEHICLES (a dose rode inside), and each meal's
  // intake — mirrors generate-signal/index.ts exactly (B-156 PR C1 / B-174).
  const liveDoses = input.doses.filter((d) => !droppedEventIds.has(d.eventId))
  const pairedEventIds = new Set<string>()
  for (const d of liveDoses) if (d.pairedEventId) pairedEventIds.add(d.pairedEventId)

  const mealEvents: MealEvent[] = []
  const mealIntakeById = new Map<string, IntakeRating | null>()
  for (const e of windowEvents) {
    if (e.type !== 'meal' || !e.meal) continue
    mealIntakeById.set(e.id, e.meal.intakeRating)
    mealEvents.push({
      id: e.id,
      occurredAt: e.occurredAt,
      isMedicationVehicle: pairedEventIds.has(e.id),
      occurredAtConfidence: e.occurredAtConfidence,
      foodItemId: e.meal.foodItemId,
      // STILL THE PRIMARY ONLY, deliberately. B-351 slice 5 widened what the report
      // DISPLAYS to the full captured set; keying the CORRELATION on set membership is
      // slice 6 (Phase B), which needs the collinearity clustering that stops the engine
      // falsely blaming duck when it cannot separate duck from chicken (§7) — and is
      // `adversarial-reviewer`-mandatory. Feeding sets in here without that guardrail
      // would inflate the candidate family and credit collinear proteins. So the report
      // currently shows a wider exposure picture than it correlates over, which is the
      // spec's intended phase boundary, not an oversight.
      primaryProtein: e.meal.primaryProtein,
      intakeRating: e.meal.intakeRating,
      foodType: e.meal.foodType,
      format: e.meal.format,
      foodLabel: mealFoodLabel(e.meal),
    })
  }

  // Free-fed standing exposures overlapping the window (B-040). meal_fed rows are
  // vet-report metadata, never standing exposures (detection contract).
  const feedingArrangements: FeedingArrangement[] = input.feedingArrangements
    .filter((a) => a.method === 'free_choice')
    .filter((a) => {
      const fromNum = a.activeFrom ? dayNumber(a.activeFrom) : -Infinity
      const untilNum = a.activeUntil ? dayNumber(a.activeUntil) : Infinity
      return (fromNum ?? -Infinity) <= scope.endDayNum && scope.startDayNum <= (untilNum ?? Infinity)
    })
    .map((a) => ({
      id: a.id,
      primaryProtein: a.primaryProtein,
      activeFrom: a.activeFrom,
      activeUntil: a.activeUntil,
      attributionConfidence: a.isShared ? ('low' as const) : ('high' as const),
    }))

  // Medication confounder windows — regimen spans + administered dose POINTS in the
  // window (spec §8 / B-117 PR 9). Regimen DATE end pushed to end-of-day-inclusive,
  // and refused/missed/in-doubt-combo doses dropped, exactly as index.ts does.
  const medicationWindows: MedicationWindow[] = []
  for (const m of input.medications) {
    medicationWindows.push({
      medicationItemId: m.medicationItemId,
      activeFrom: m.startedAt,
      activeUntil: regimenEndIso(m.endedAt),
    })
  }
  for (const d of liveDoses) {
    const dn = eventDayNumber(d.occurredAt, tz)
    if (dn === null || dn < scope.startDayNum || dn > scope.endDayNum) continue
    const w = doseToMedicationWindow({
      medicationItemId: d.medicationItemId,
      occurredAt: d.occurredAt,
      adherence: d.adherence,
      pairedVehicleIntake: d.pairedEventId ? (mealIntakeById.get(d.pairedEventId) ?? null) : null,
    })
    if (w) medicationWindows.push(w)
  }

  return {
    pet: {
      name: input.pet.name,
      species: input.pet.species,
      // B-422 — the same gate `generate-signal/index.ts` applies to the same flag,
      // because this feeds the SAME engine: it fully mutes detectors ⑧/⑨/⑩ and
      // promotes correlation to band 1. A trial nobody ended would otherwise
      // silence three dietary-pattern detectors on the vet report permanently.
      dietTrialActive: input.dietTrials.some((t) => {
        const endNum = trialLastDayNum(t, tz)
        return t.status === 'active' && (endNum === null || scope.endDayNum <= endNum)
      }),
    },
    symptomEvents,
    mealEvents,
    feedingArrangements,
    medicationWindows,
    timezone: input.timezone ?? undefined,
    now: scope.detectionNowIso,
  }
}

/** A regimen's DATE end is inclusive of the whole day → push to end-of-day (mirrors generate-signal/index.ts). */
function regimenEndIso(endedAt: string | null): string | null {
  if (endedAt == null) return null
  const ms = Date.parse(`${endedAt}T00:00:00Z`)
  if (Number.isNaN(ms)) return endedAt
  return new Date(ms + MS_PER_DAY).toISOString()
}

function runDetection(detInput: DetectionInput): DetectionExtract {
  // Signals v2 composition (CUL-564). The report renders the v2 timing taxonomy: a lone ⑤
  // (`postprandial_timing`), its empty-stomach mirror `empty_stomach_timing` (L1), and the merged
  // ⑤+L1 `timing_story` — which is the point of the adoption, since the pre-v2 path silently dropped
  // a ⑤ once it merged into a story the report ignored. The two OTHER v2 lanes are deliberately NOT
  // surfaced here (the switch drops them explicitly, below): L2 `trial_response` (the report's
  // dedicated diet-trial section answers that at higher fidelity — PM 2026-08-21) and L4
  // `gap_shortening` (a sub-floor watching row the report's §8.5 Established-only discipline excludes;
  // Appendix A + the §3.5 trend chart already carry the cadence — Dr. Chen 2026-08-21).
  const ranked = detectSignals(detInput, DEFAULT_CONFIG)
  const established: EstablishedCorrelation[] = []
  const timing: TimingFinding[] = []
  let intakeDecline: IntakeDeclineFinding | null = null
  const chronicity: SymptomChronicityFinding[] = []
  const worsening: SymptomWorseningFinding[] = []

  for (const { finding } of ranked) {
    switch (finding.type) {
      case 'food_symptom_correlation': {
        const f = finding as CorrelationFinding
        // §8.5: ONLY Established reaches the report; Early is dropped here, deterministically.
        if (f.tier !== 'established') break
        established.push({
          symptomType: f.symptomType,
          protein: f.protein,
          proteins: f.proteins,
          matchedPairs: f.matchedPairs,
          caseExposed: f.caseExposed,
          controlExposed: f.controlExposed,
          riskDifference: f.riskDifference,
          pValue: f.pValue,
          symptomEventCount: f.symptomEventCount,
          correlationWindowHours: f.correlationWindowHours,
        })
        break
      }
      case 'intake_decline':
        if (!intakeDecline) intakeDecline = finding as IntakeDeclineFinding
        break
      case 'symptom_chronicity':
        // Every course, in the engine's rank order — the ranked list is already sorted
        // (longest span leads), so the report's flag order matches Home's card order.
        chronicity.push(finding as SymptomChronicityFinding)
        break
      case 'symptom_worsening':
        worsening.push(finding as SymptomWorseningFinding)
        break
      case 'postprandial_timing': {
        const f = finding as PostprandialTimingFinding
        timing.push({
          kind: 'postprandial_timing',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            rapidCount: f.rapidCount,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            rapidWindowMinutes: f.rapidWindowMinutes,
            medianMinutesSinceFeeding: f.medianMinutesSinceFeeding,
          },
        })
        break
      }
      case 'timeofday_clustering': {
        const f = finding as TimeOfDayClusteringFinding
        timing.push({
          kind: 'timeofday_clustering',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            clusterStartLocalHour: f.clusterStartLocalHour,
            clusterWindowHours: f.clusterWindowHours,
            clusterCount: f.clusterCount,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            timezone: f.timezone,
          },
        })
        break
      }
      case 'empty_stomach_timing': {
        // L1 (Signals v2, CUL-564) — the ⑤ mirror: vomiting ≥ longGapHours after the last meal (the
        // empty-stomach / long-fast band). Band-named only — the report states the timing, the vet
        // makes the bilious/BVS inference.
        const f = finding as EmptyStomachTimingFinding
        timing.push({
          kind: 'empty_stomach_timing',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            longCount: f.longCount,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            longGapHours: f.longGapHours,
            medianHoursSinceFeeding: f.medianHoursSinceFeeding,
          },
        })
        break
      }
      case 'timing_story': {
        // The merged ⑤+L1 card (Signals v2, CUL-564). The report renders both bands in one line; the
        // per-phenotype `rapid`/`long` evidence blocks are always present in a story (the merge fires
        // only when both lanes did). This is the card the pre-v2 report path silently dropped, taking
        // the ⑤ with it.
        const f = finding as TimingStoryFinding
        timing.push({
          kind: 'timing_story',
          symptomType: f.symptomType,
          windowDays: f.windowDays,
          detail: {
            rapidCount: f.rapid.count,
            longCount: f.long.count,
            eligibleCount: f.eligibleCount,
            totalEpisodes: f.totalEpisodes,
            rapidWindowMinutes: f.rapidWindowMinutes,
            longGapHours: f.longGapHours,
            medianMinutesSinceFeeding: f.rapid.medianMinutesSinceFeeding,
            medianHoursSinceFeeding: f.long.medianHoursSinceFeeding,
          },
        })
        break
      }
      // The v2 lanes the report deliberately does NOT surface (CUL-564), made explicit so the
      // exclusion is an auditable decision, not an accidental `default` drop:
      //  • trial_response (L2) — the report's dedicated diet-trial section renders this at higher
      //    fidelity; a second count block would duplicate it and risk a contradicting denominator.
      //  • gap_shortening (L4) — a sub-floor watching row; §8.5's Established-only discipline keeps
      //    it off the report, and Appendix A + the §3.5 trend chart already carry the cadence.
      case 'trial_response':
      case 'gap_shortening':
        break
      // 'reflection' is owner-side only — never on the clinical report.
      default:
        break
    }
  }

  // The honest "no established threshold — X is in most of what the pet eats" needs the
  // staple. Reuse the coverage engine (it computes exactly this), don't re-derive — but
  // only when there's NO established correlation, since the staple line is the copy for
  // exactly the no-threshold case (skip the extra engine pass otherwise).
  let stapleProtein: string | null = null
  if (established.length === 0) {
    for (const c of detectCoverage(detInput, DEFAULT_CONFIG)) {
      if (c.type === 'staple_washout') {
        stapleProtein = (c as StapleWashoutDiagnostic).protein
        break
      }
    }
  }

  return { established, timing, intakeDecline, chronicity, worsening, stapleProtein }
}

// ── Top-level assembly ────────────────────────────────────────────────────────

/**
 * Assemble the immutable report snapshot from pulled rows + the resolved window.
 * Pure and deterministic — the ONLY entry point. Order of operations matters:
 *   1. resolve the scope window (§6)
 *   2. de-dup ALL events (§5.11), then scope to the window
 *   3. aggregate every section over the deduped, windowed set (denominators baked in)
 *   4. reuse the detection engine over the window for correlations + safety flags
 *   5. compose safety flags (present blood/foreign lead, §2/§5.9), never a false all-clear (§5.3)
 */
export function assembleReport(input: ReportInput): ReportSnapshot {
  const tz = input.timezone
  const nowMs = parseMs(input.now) ?? 0
  const scope = resolveScope(input)
  const { startDayNum, endDayNum, windowDays } = scope

  const inWindowDay = (dn: number | null): boolean => dn !== null && dn >= startDayNum && dn <= endDayNum
  const inWindow = (iso: string): boolean => inWindowDay(eventDayNumber(iso, tz))

  // Analysis lookups + the completed set (drives dedup representative choice).
  const analysisByEvent = new Map<string, ReportAiAnalysisInput>()
  const completedAnalysisEventIds = new Set<string>()
  for (const a of input.aiAnalyses) {
    analysisByEvent.set(a.eventId, a)
    if (a.status === 'completed') completedAnalysisEventIds.add(a.eventId)
  }

  // §5.11 — de-dup across the full pull (window-aware representative so a boundary-
  // straddling duplicate can't drop a genuine in-window bout), then scope to the window.
  const { events: dedupedAll, droppedEventIds } = dedupeEvents(
    input.events,
    completedAnalysisEventIds,
    (e) => inWindow(e.occurredAt),
  )
  const windowEvents = dedupedAll.filter((e) => inWindow(e.occurredAt))

  // Logging-coverage denominators (§5.1) — distinct local days with ANY logged event.
  const loggedDayNums = new Set<number>()
  let firstLoggedDayNum: number | null = null
  let lastLoggedDayNum: number | null = null
  for (const e of windowEvents) {
    const dn = eventDayNumber(e.occurredAt, tz)
    if (dn === null) continue
    loggedDayNums.add(dn)
    if (firstLoggedDayNum === null || dn < firstLoggedDayNum) firstLoggedDayNum = dn
    if (lastLoggedDayNum === null || dn > lastLoggedDayNum) lastLoggedDayNum = dn
  }
  const loggedDays = loggedDayNums.size

  const numBuckets = Math.max(1, Math.ceil(windowDays / WEEK_DAYS))
  const bucketIndexOfDay = (dn: number): number =>
    Math.min(numBuckets - 1, Math.max(0, Math.floor((dn - startDayNum) / WEEK_DAYS)))
  const bucketStartDates = Array.from({ length: numBuckets }, (_, i) =>
    dayKeyFromNumber(startDayNum + i * WEEK_DAYS),
  )

  // ── The ONE window partition (B-532) ─────────────────────────────────────────
  // Day-exact, symmetric, and computed once: the per-symptom delta, the delta's own
  // sparse-logging caveats and `atAGlance.firstHalfLoggedDays`/`secondHalfLoggedDays`
  // all read it, so the caveat can never qualify a partition other than the one it is
  // printed under. `halfDays === 0` (a window under 8 days) means no comparison.
  // Logged days per weekly bucket — shared by every symptom's chart (B-532). Counted once
  // over `loggedDayNums`, so it cannot disagree with `atAGlance.loggedDays` or with the
  // per-half counts below.
  const loggedDaysByBucket = new Array(numBuckets).fill(0)
  for (const dn of loggedDayNums) loggedDaysByBucket[bucketIndexOfDay(dn)]++

  // ONE RULE, TWO SPANS (B-600). The arithmetic lives in `trial.ts.halfPartition`
  // because a second copy of it existed here and in `loggingDensity`, and the two
  // disagreed about the odd middle day — invisible while their spans differed, a
  // self-contradiction on the same page the moment a truncated window made them
  // coincide. The MINIMUM is still this caller's own.
  const partition = halfPartition(startDayNum, endDayNum)
  const halfDays = windowDays >= TREND_HALF_MIN_WINDOW_DAYS ? partition.halfDays : 0
  const firstHalfEndDayNum = partition.firstEndDayIndex
  const lastHalfStartDayNum = partition.lastStartDayIndex
  const inFirstHalf = (dn: number): boolean => halfDays > 0 && dn <= firstHalfEndDayNum
  const inLastHalf = (dn: number): boolean => halfDays > 0 && dn >= lastHalfStartDayNum

  // ── Per-symptom aggregates (§3.5, §5.1) ──────────────────────────────────────
  const symptoms: SymptomAggregate[] = []
  for (const type of REPORT_SYMPTOM_TYPES) {
    const incidents = windowEvents.filter((e) => e.type === type)
    if (incidents.length === 0) continue
    const dayNums = new Set<number>()
    const weeklyBuckets = new Array(numBuckets).fill(0)
    let firstOnset: string | null = null
    let lastOnset: string | null = null
    let firstHalfCount = 0
    let lastHalfCount = 0
    let middleCount = 0
    for (const e of incidents) {
      const dn = eventDayNumber(e.occurredAt, tz)
      if (dn !== null) {
        dayNums.add(dn)
        weeklyBuckets[bucketIndexOfDay(dn)]++
        if (inFirstHalf(dn)) firstHalfCount++
        else if (inLastHalf(dn)) lastHalfCount++
        // THE EXCLUDED MIDDLE DAY IS COUNTED, NOT DISCARDED (B-600, cold read r13).
        else if (halfDays > 0) middleCount++
      }
      if (firstOnset === null || e.occurredAt < firstOnset) firstOnset = e.occurredAt
      if (lastOnset === null || e.occurredAt > lastOnset) lastOnset = e.occurredAt
    }
    symptoms.push({
      type,
      count: incidents.length,
      symptomDays: dayNums.size,
      windowDays,
      loggedDays,
      firstOnset,
      lastOnset,
      weeklyBuckets,
      bucketStartDates,
      loggedDaysByBucket,
      trendHalves:
        halfDays > 0
          ? {
              days: halfDays,
              firstCount: firstHalfCount,
              lastCount: lastHalfCount,
              firstStartDate: dayKeyFromNumber(startDayNum),
              firstEndDate: dayKeyFromNumber(firstHalfEndDayNum),
              lastStartDate: dayKeyFromNumber(lastHalfStartDayNum),
              lastEndDate: dayKeyFromNumber(endDayNum),
              middleCount,
              middleDate: windowDays % 2 === 1 ? dayKeyFromNumber(firstHalfEndDayNum + 1) : null,
            }
          : null,
    })
  }
  symptoms.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
  const primarySymptom = symptoms.length > 0 ? { type: symptoms[0].type, count: symptoms[0].count } : null
  const totalSymptomIncidents = symptoms.reduce((s, x) => s + x.count, 0)

  // ── Vomit phenotype (§3.6, §5.9, §5.10) ──────────────────────────────────────
  const vomitIncidents = windowEvents.filter((e) => e.type === 'vomit')
  let vomitPhenotype: VomitPhenotype | null = null
  if (vomitIncidents.length > 0) {
    const states = { completed: 0, uncertain: 0, failed: 0, pending: 0 }
    const contentsMix: Record<VomitContentCategory, number> = {
      food: 0,
      bile: 0,
      hairball: 0,
      foam_liquid: 0,
      grass: 0,
      unsure: 0,
    }
    const consistencyDistribution: Record<string, number> = {}
    const bloodPresent: VomitPhenotype['bloodPresent'] = []
    const foreignPresent: VomitPhenotype['foreignPresent'] = []
    let withAnalysis = 0
    let reviewedCount = 0
    for (const e of vomitIncidents) {
      // §5.9 present-only — escalate on blood/foreign present in ANY member of the collapsed
      // bout (any status), NEVER folding `unsure`/`none_visible`/`no` into a "0 of N". A flag
      // on a dropped duplicate must still lead the safety band.
      const present = unionPresentFlags(e.memberEventIds, analysisByEvent)
      if (present.bloodKind) bloodPresent.push({ eventId: e.id, occurredAt: e.occurredAt, kind: present.bloodKind })
      if (present.foreignPresent) foreignPresent.push({ eventId: e.id, occurredAt: e.occurredAt, note: present.foreignNote })

      // The four-state disclosure + assessed aggregate use the incident's BEST-status member
      // (completed preferred) — read across all members so a photographed bout keeps its read
      // even when the representative log is an empty duplicate.
      const a = pickIncidentAnalysis(e.memberEventIds, analysisByEvent)
      if (!a) continue
      withAnalysis++
      switch (a.status) {
        case 'completed':
          states.completed++
          break
        case 'uncertain':
          states.uncertain++
          break
        case 'failed':
          states.failed++
          break
        default:
          states.pending++
          break
      }
      // §5.10 — the descriptive contents/consistency aggregate is over the ASSESSED
      // (completed) set only; uncertain/failed/pending contribute NO phenotype content.
      if (a.status === 'completed') {
        contentsMix[classifyVomitContents(a)]++
        if (a.consistency) consistencyDistribution[a.consistency] = (consistencyDistribution[a.consistency] ?? 0) + 1
        if (a.editedAt) reviewedCount++
      }
    }
    vomitPhenotype = {
      totalIncidents: vomitIncidents.length,
      withAnalysis,
      states,
      assessedCount: states.completed,
      contentsMix,
      consistencyDistribution,
      bloodPresent,
      foreignPresent,
      reviewedCount,
    }
  }

  // ── Stool characteristics (§3.7) — normal vs loose; null when no stool events ─
  // Counts are over COLLAPSED incidents (survivors), owner-described. The AI photo-read layer
  // (migration 034 / analyze-stool, PR 7) is aggregated below with the same §5.9/§5.10 discipline
  // as vomit: descriptive Bristol/colour over the assessed set only; blood/mucus present-only,
  // unioned across every member of a collapsed incident so a flag on a dropped duplicate surfaces.
  const stoolIncidents = windowEvents.filter((e) => e.type === STOOL_NORMAL_TYPE || e.type === DIARRHEA_TYPE)
  const stoolNormal = windowEvents.filter((e) => e.type === STOOL_NORMAL_TYPE).length
  const stoolLoose = windowEvents.filter((e) => e.type === DIARRHEA_TYPE).length
  let stool: StoolCharacteristics | null = null
  if (stoolNormal + stoolLoose > 0) {
    const states = { completed: 0, uncertain: 0, failed: 0, pending: 0 }
    const consistencyDistribution: Record<string, number> = {}
    const colourDistribution: Record<string, number> = {}
    const bloodPresent: StoolAiReads['bloodPresent'] = []
    const mucusPresent: StoolAiReads['mucusPresent'] = []
    let withAnalysis = 0
    let reviewedCount = 0
    for (const e of stoolIncidents) {
      // §5.9 present-only — blood/mucus present in ANY member of the collapsed bout (any status).
      const present = stoolUnionPresentFlags(e.memberEventIds, analysisByEvent)
      if (present.bloodPresent) bloodPresent.push({ eventId: e.id, occurredAt: e.occurredAt, kind: present.bloodKind })
      if (present.mucusPresent) mucusPresent.push({ eventId: e.id, occurredAt: e.occurredAt })

      // Four-state disclosure + descriptive aggregate use the incident's BEST-status member.
      const a = pickIncidentAnalysis(e.memberEventIds, analysisByEvent)
      if (!a) continue
      withAnalysis++
      switch (a.status) {
        case 'completed':
          states.completed++
          break
        case 'uncertain':
          states.uncertain++
          break
        case 'failed':
          states.failed++
          break
        default:
          states.pending++
          break
      }
      // §5.10 — Bristol/colour aggregate over ASSESSED (completed) only; 'unsure' is not a legible read.
      if (a.status === 'completed') {
        if (a.stoolConsistency && a.stoolConsistency !== 'unsure') {
          consistencyDistribution[a.stoolConsistency] = (consistencyDistribution[a.stoolConsistency] ?? 0) + 1
        }
        if (a.stoolColour && a.stoolColour !== 'unsure') {
          colourDistribution[a.stoolColour] = (colourDistribution[a.stoolColour] ?? 0) + 1
        }
        if (a.editedAt) reviewedCount++
      }
    }
    const ai: StoolAiReads | null =
      withAnalysis > 0
        ? {
            totalIncidents: stoolNormal + stoolLoose,
            withAnalysis,
            states,
            assessedCount: states.completed,
            consistencyDistribution,
            colourDistribution,
            bloodPresent,
            mucusPresent,
            reviewedCount,
          }
        : null
    stool = { total: stoolNormal + stoolLoose, normalCount: stoolNormal, looseCount: stoolLoose, windowDays, loggedDays, ai }
  }

  // ── Weight (§3.3, B-186) ──────────────────────────────────────────────────────
  // Weigh-ins arrive in their OWN array (weightChecks), NOT in input.events, so the
  // type-and-minute event de-dup never sees them — and it deliberately excludes
  // weight_check anyway, because a distinct weight VALUE means two genuine readings are
  // not duplicates (DEDUP_OBSERVATION_TYPES note). But a double-tap / offline-sync retry
  // produces two near-simultaneous rows for ONE weigh-in, which would inflate readingCount
  // and draw a phantom point on the sparkline (adversarial finding A5). So collapse readings
  // within DEDUP_WINDOW_MS of the prior kept one, keeping the LATER row (last-write-wins,
  // the project's sync-conflict rule) — a correction 5 s later wins, a retry of the same
  // value is idempotent. Distinct readings minutes+ apart are always preserved.
  // First drop any weigh-in whose PARENT event was collapsed by the type-and-minute event
  // de-dup (only reachable if the I/O shell also placed the weight_check event in input.events
  // — weight_check is in DEDUP_OBSERVATION_TYPES; a no-op when weightChecks is a standalone
  // pull), then apply the near-simultaneous collapse below for the standalone-array case.
  const sortedReadings = [...input.weightChecks]
    .filter((r) => !droppedEventIds.has(r.eventId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const allReadings: ReportWeightCheckInput[] = []
  for (const r of sortedReadings) {
    const prev = allReadings[allReadings.length - 1]
    const prevMs = prev ? parseMs(prev.occurredAt) : null
    const curMs = parseMs(r.occurredAt)
    if (prev && prevMs !== null && curMs !== null && curMs - prevMs < DEDUP_WINDOW_MS) {
      allReadings[allReadings.length - 1] = r // collapse the retry/correction pair, keep the later
    } else {
      allReadings.push(r)
    }
  }
  const latestOverall = allReadings.length > 0 ? allReadings[allReadings.length - 1] : null
  const windowReadings = allReadings.filter((r) => inWindow(r.occurredAt))
  const weight = buildWeightSection(latestOverall, windowReadings, tz)

  // ── Medication adherence (§3.8, B-117 §7) ────────────────────────────────────
  const liveDoses = input.doses.filter((d) => !droppedEventIds.has(d.eventId))
  const medications = input.medications.map((m) =>
    buildMedicationAdherence(m, liveDoses, scope, tz),
  )
  // Ad-hoc / OTC doses that belong to no configured regimen — surfaced separately so a drug the
  // owner logged (but never set up as a regimen) is still reported, not silently dropped (§3.8).
  const unlinkedMedications = buildUnlinkedMedications(
    liveDoses,
    new Set(input.medications.map((m) => m.id)),
    input.medicationItems ?? [],
    scope,
    tz,
  )
  // §4.4 (D2) — the LIFETIME medication table, window-ignoring on purpose: derived over the
  // pet's whole record (all regimens + the untrimmed `lifetimeDoses`), not the scoped window.
  const medicationHistory = buildMedicationHistory(input, droppedEventIds, tz)

  // ── Diet / confounder summary (§3.8) ─────────────────────────────────────────
  // The trial this report DESCRIBES — active, or ended inside the window (B-417 §7).
  // `find(status === 'active')` was the old test and it deleted the most valuable
  // report the feature produces: the one sent the morning after the trial finished.
  const reportTrialInput = selectReportTrial(input.dietTrials, scope, tz, TRIAL_ANCHOR_GRACE_DAYS)

  // ── B-704 §7.4 — the trial's protein: naming, provenance, and the mismatch ──────
  //
  // TWO protein values live here and conflating them produces a self-contradictory
  // report (the adversarial finding on a stored-first marking baseline):
  //
  //   • the EXPOSURE BASELINE (`trialProteinTarget`) — the ONE key every off-trial
  //     marking and the antigen footnote are measured against. DERIVED-FIRST (the trial
  //     food's own designated primary), because the antigen COUNTS are closed-world on
  //     the food list (`sanctionedProteinsOn`, TG-1) and never move for any stored value.
  //     Marking against a DIFFERENT protein than the counts use is how one Appendix C
  //     row read "carries nothing the trial diet does not" beside "Duck* — other than the
  //     trial protein (Rabbit)". One baseline for every exposure surface, so the markings,
  //     the footnote and the counts can never disagree. The owner's stored value is only a
  //     FALLBACK — for a THIN trial food whose own primary is unknown, where there is no
  //     count to contradict (the antigen arm is dark) and the stored value rescues the
  //     naming (§7.4's "survives thin food data" intent, preserved without the incoherence).
  //
  //   • the OWNER'S STORED PROTEIN (`trialProteinResolved`) — what the owner recorded the
  //     trial as testing. It drives the identity's "owner-confirmed" provenance and, when
  //     it DISAGREES with the baseline, the `protein_mismatch` safety flag. It never moves
  //     a count (TG-1) and, on a mismatch, never re-bases a marking — the discrepancy is
  //     the flag's subject, not a silent re-labelling of the exposure section.
  //
  // A null baseline (no trial, or a thin food with no stored value) disables off-trial
  // marking entirely: silence, never an all-clear (TG-2).
  const trialProteinResolved: { protein: string | null; source: TrialProteinSource | null } = reportTrialInput
    ? trialTargetProtein(
        { target_protein: reportTrialInput.targetProtein ?? null },
        [{ primaryProtein: reportTrialInput.primaryProtein ?? null }],
      )
    : { protein: null, source: null }

  // The trial food's OWN designated primary (derivation arm only — the sanctioned-set
  // baseline the counts use, and deliberately NOT `proteins[0]`; see the derivation arm's
  // note on why a cleared designation would invert the check).
  const derivedTrialTarget = reportTrialInput
    ? trialTargetProtein(
        { target_protein: null },
        [{ primaryProtein: reportTrialInput.primaryProtein ?? null }],
      ).protein
    : null

  // THE EXPOSURE BASELINE: derived-first, the stored value only as the thin-food fallback.
  const trialProteinTarget = derivedTrialTarget ?? trialProteinResolved.protein

  // The mismatch: the owner stored a protein that DISAGREES with the trial food's own
  // designated primary. Reuses PR 3's `trialFoodProteinMismatches` — THE ONE predicate
  // for this question (the §5.3 rule; my initial `trialProteinLabelMismatch` was deleted
  // at the #597 merge as a contradictory duplicate). It is kinship-aware and source-gated:
  // it fires only when the owner's stored value names a usable source AND differs from the
  // food's primary at a different animal (so 'poultry' vs 'chicken' — kin — is NOT a
  // mismatch, and a source-less process word never fires), which is exactly what the setup
  // sheet's day-0 heads-up uses, so the two surfaces can never disagree. Passing the OWNER's
  // stored value as the target (not the resolved baseline) is what makes it fire only on an
  // owner value — a derived target came from the label and cannot disagree with it.
  const trialProteinMismatchFoods = reportTrialInput
    ? trialFoodProteinMismatches(reportTrialInput.targetProtein ?? null, [
        {
          foodItemId: reportTrialInput.foodItemId ?? 'trial',
          foodLabel: reportTrialInput.foodLabel ?? '',
          primaryProtein: reportTrialInput.primaryProtein ?? null,
        },
      ])
    : []
  // When it fires, the stored value was a usable source, so the stored-first resolution is
  // 'owner' and `trialProteinResolved.protein` is that word — the protein to NAME in the flag.
  const trialProteinMismatch =
    trialProteinMismatchFoods.length > 0 && trialProteinResolved.protein !== null
      ? {
          target: trialProteinResolved.protein,
          foodProtein: trialProteinMismatchFoods[0].foodProtein,
          foodLabel: reportTrialInput!.foodLabel ?? null,
        }
      : null

  // Identity provenance (§7.4): the baseline is "owner-confirmed" ONLY when the owner's
  // stored value IS the baseline — it defines a thin food's baseline, or corroborates the
  // derived one. On a mismatch the baseline is the derived food protein and the owner's
  // (different) value lives in the safety flag, so the identity reads "from the trial diet's
  // label", never a false "owner-confirmed" over the food's protein.
  const provenanceSource: TrialProteinSource | null =
    trialProteinTarget === null
      ? null
      : trialProteinResolved.source === 'owner' && trialProteinResolved.protein === trialProteinTarget
        ? 'owner'
        : 'derived'

  // `confirmedDay` discloses a mid-trial owner set: the 1-based trial day
  // `target_protein_set_at` lands on, shown ONLY when the owner value IS the baseline
  // (provenance 'owner') and it falls after day 1. Same local-day arithmetic the rest of
  // the report uses (`eventDayNumber`/`dayNumber` over `tz`), so it never drifts from the
  // block's own day counter.
  let confirmedDay: number | null = null
  if (provenanceSource === 'owner' && reportTrialInput && reportTrialInput.targetProteinSetAt) {
    const setDay = eventDayNumber(reportTrialInput.targetProteinSetAt, tz)
    const startDay = dayNumber(reportTrialInput.startedAt)
    if (setDay !== null && startDay !== null) {
      const d = setDay - startDay + 1
      if (d >= 2) confirmedDay = d
    }
  }
  const trialProteinProvenance =
    provenanceSource !== null ? { source: provenanceSource, confirmedDay } : null

  /**
   * Build the render-ready protein view for one food.
   *
   * `readProteinSet` — NOT `deriveProteinSet`. This is a read path over stored rows,
   * so it keys Class-A only (`canonicalizeProtein`). Using the write-path derivation
   * here applied D3a's semantic merges retroactively and, worse, keyed the SET
   * differently from the TARGET (which resolves through `canonicalizeProtein`), so an
   * `ocean whitefish` trial food reported itself as contaminated with whitefish. One
   * read path, one keying function. A legacy row carrying only `primary_protein` still
   * yields a one-element set rather than dropping out.
   *
   * `mayClaimCompleteProteinSet` is the same gate the client's Tier-1 disclosure runs —
   * the whole reason it lives in lib/protein.ts.
   */
  function proteinView(
    food: ReportFoodProteinInput & { primaryProtein?: string | null },
    /** B-529/R7 — set ONLY for the food that IS the trial diet. Its own label
     *  naming its own source twice (`hydrolyzed chicken` on the front, `chicken`
     *  on the panel) is not a contamination, and rendering it as one put a false
     *  self-contamination in bold on page 1 — which the B-417 cold read acted on,
     *  reaching the wrong clinical conclusion. Every OTHER food keeps the
     *  unabsorbed comparison, because intact protein from anywhere else is
     *  exactly what a hydrolysed trial excludes. */
    opts?: { isTrialDiet?: boolean },
  ): ProteinSetView {
    const proteins = readProteinSet(food.proteins ?? null, food.primaryProtein ?? null)
    // EVERY food — the trial diet included — is compared to the SAME `trialProteinTarget`
    // (the derived-first exposure baseline). The trial food takes the kin-absorbing
    // `offTrialProteinsInTrialFood` (its own label naming its own source twice is not a
    // contamination); every other food takes the plain comparison. One baseline, so the
    // markings can never disagree with the counts (which are computed against the same
    // derived primary) — the coherence the adversarial pass required on a mismatch.
    return {
      proteins,
      complete: mayClaimCompleteProteinSet(proteins, food.ingredientsNotes ?? null, food.extractionConfidence),
      offTrial: opts?.isTrialDiet
        ? offTrialProteinsInTrialFood(proteins, trialProteinTarget)
        : offTrialProteins(proteins, trialProteinTarget),
    }
  }

  const freeFed = input.feedingArrangements
    .filter((a) => a.method === 'free_choice')
    .filter((a) => {
      const fromNum = a.activeFrom ? dayNumber(a.activeFrom) : -Infinity
      const untilNum = a.activeUntil ? dayNumber(a.activeUntil) : Infinity
      return (fromNum ?? -Infinity) <= endDayNum && startDayNum <= (untilNum ?? Infinity)
    })
    .map((a) => ({
      foodLabel: a.foodLabel,
      primaryProtein: a.primaryProtein,
      activeFrom: a.activeFrom,
      activeUntil: a.activeUntil,
      proteinSet: proteinView(a),
      isShared: a.isShared,
    }))

  const windowMeals = windowEvents.filter((e) => e.type === 'meal' && e.meal)
  const ratedMeals = windowMeals.filter((e) => e.meal!.foodType === 'meal' && e.meal!.intakeRating != null)
  const finishedMeals = ratedMeals.filter((e) => e.meal!.intakeRating === 'all').length
  // R2-3 — the descriptive intake MODE (strict plurality only): "typically <mode>" texture for the
  // free-fed grazer's discrete meals, never a scored figure. A tie yields null (no honest "typical").
  // NOTE: this is descriptive display data only — it does NOT touch the intake-decline engine or the
  // fully-eaten anchor (detection.ts / lastFullMealIso), which the clinical-guardrails floor protects.
  const intakeMode = strictPluralityIntake(ratedMeals.map((e) => e.meal!.intakeRating as IntakeRating))
  const mealCompletion =
    ratedMeals.length > 0
      ? { ratedMeals: ratedMeals.length, finishedMeals, rate: finishedMeals / ratedMeals.length, intakeMode }
      : null

  // Grouped rated-meal items (#7/#8) — surface the ACTUAL foods eaten as meals (e.g. a wet diet),
  // which the pipeline previously reduced to a bare count and discarded. Grouped by food item so
  // the diet history can name them and the meals appendix (E) can itemise them, mirroring the
  // Appendix B treat grouping. Descriptive only — orthogonal to the intake-decline engine.
  const mealGroups = new Map<
    string,
    {
      foodLabel: string | null
      primaryProtein: string | null
      count: number
      firstDate: string | null
      lastDate: string | null
      intakes: IntakeRating[]
      proteinSet: ProteinSetView
    }
  >()
  for (const e of ratedMeals) {
    const m = e.meal!
    // Group by food identity: the library item id when present, else the brand/product label.
    // A meal with NEITHER collapses into ONE "unlabeled" bucket (a fixed key, not the unique
    // event id) so N unlabeled meals never fragment into N singleton "—" rows (code-reviewer).
    //
    // THE LABEL FALLBACK CARRIES THE SET (B-532; the same rule appendix B's `pushFood` already
    // uses, and the B-529 residual named it). Two library rows under one label with DIFFERENT
    // captured sets is a live condition (B-009/B-018 duplicates, a re-photographed bag), and
    // a label-only key made the FIRST member's set stand for both — so an implied-complete
    // set could be printed over feedings that came from a row nobody read. An item id is a
    // real identity and never needs this; only the label fallback does.
    const set = proteinView(m)
    const label = mealFoodLabel(m)
    const key = m.foodItemId ?? (label !== null ? `${label}##${set.proteins.join(',')}|${set.complete ? 'c' : 'i'}` : '__unlabeled__')
    const dayKey = localDayKey(e.occurredAt, tz)
    const g = mealGroups.get(key)
    if (g) {
      g.count++
      if (dayKey && (g.firstDate === null || dayKey < g.firstDate)) g.firstDate = dayKey
      if (dayKey && (g.lastDate === null || dayKey > g.lastDate)) g.lastDate = dayKey
      g.intakes.push(m.intakeRating as IntakeRating)
    } else {
      mealGroups.set(key, {
        foodLabel: mealFoodLabel(m),
        // A junk sentinel ("null"/"unknown") is not a protein — null it so no consumer prints it.
        primaryProtein: canonicalizeProtein(m.primaryProtein) ? m.primaryProtein : null,
        count: 1,
        firstDate: dayKey,
        lastDate: dayKey,
        intakes: [m.intakeRating as IntakeRating],
        // The group key IS food identity (item id, else label), so every member is the
        // same food and the first member's set is the group's set — never a merge
        // across foods, which would invent an exposure no single food carried. The one
        // exception is the fixed `__unlabeled__` bucket, whose members have no food
        // join at all and therefore all derive the same empty, incomplete set.
        proteinSet: proteinView(m),
      })
    }
  }
  const mealItems = [...mealGroups.values()]
    .map((g) => ({
      foodLabel: g.foodLabel,
      primaryProtein: g.primaryProtein,
      count: g.count,
      firstDate: g.firstDate,
      lastDate: g.lastDate,
      intakeMode: strictPluralityIntake(g.intakes),
      intakeBreakdown: intakeBreakdownOf(g.intakes),
      proteinSet: g.proteinSet,
    }))
    .sort((a, b) => b.count - a.count || (a.foodLabel ?? '').localeCompare(b.foodLabel ?? ''))

  // human_food format is the STRONGER confounder signal (B-102, the #1 diet-trial confounder),
  // so it takes precedence: a table-scrap "treat" (foodType='treat' AND format='human_food')
  // counts ONCE, as human food, and is excluded from the treats tally. Without this the same
  // feeding was summed on BOTH the page-1 human-food line and the treats line (adversarial
  // finding A3 — page 1 disagreed with the de-duplicated Appendix B). Appendix B's category
  // ternary is ordered human_food-first to match.
  const humanFoodFeedings = windowMeals.filter((e) => e.meal!.format === 'human_food')
  const treatFeedings = windowMeals.filter(
    (e) => (e.meal!.foodType === 'treat' || e.meal!.format === 'treat') && e.meal!.format !== 'human_food',
  )
  const treatItemIds = new Set(treatFeedings.map((e) => e.meal!.foodItemId ?? e.id))
  const humanFoodDays = new Set<number>()
  const humanFoodItems: Array<{ date: string; label: string | null }> = []
  for (const e of humanFoodFeedings) {
    const key = localDayKey(e.occurredAt, tz)
    const dn = key === null ? null : dayNumber(key)
    if (dn !== null) humanFoodDays.add(dn)
    humanFoodItems.push({ date: key ?? e.occurredAt.slice(0, 10), label: mealFoodLabel(e.meal!) })
  }

  // ── The diet-trial block (B-417 §7) ──────────────────────────────────────────
  // Everything trial-shaped on this report comes from here, and everything here
  // comes from `lib/dietTrial.ts` — the ONE predicate the client and `ask` already
  // import. Built AFTER `medications` because §7's first element is the medication
  // overlap, re-sited inside the block; built BEFORE `confounders` because the
  // off-diet set is re-based onto its classifications.
  const trialBlock: TrialBlock | null = reportTrialInput
    ? buildTrialBlock({
        trial: reportTrialInput,
        species: input.pet.species === 'dog' || input.pet.species === 'cat' ? input.pet.species : 'other',
        // The SAME deduped, window-scoped meal set page 1 counts. Handing the
        // classifier a different set is how "one definition of off-diet across page
        // 1, the tile and the appendix" quietly stops being true.
        meals: windowMeals,
        eventsById: new Map(dedupedAll.map((e) => [e.id, e])),
        doses: liveDoses,
        medicationItems: input.medicationItems ?? [],
        // Regimens AND the ad-hoc doses that belong to no regimen. The orphan-dose
        // gap (§3.8) is not a footnote here: a real owner's daily OTC antihistamine
        // had doses and no regimen, and an antipruritic running through a skin
        // trial is precisely the confound that makes the symptom curve unreadable.
        // An ad-hoc group's span is first dose → last dose, which is all the record
        // supports.
        medications: [
          ...medications,
          ...unlinkedMedications.map((u) => ({
            drugName: u.drugName,
            isSupplement: u.isSupplement,
            startedAt: u.firstDate,
            endedAt: u.lastDate,
            indication: null,
          })),
        ],
        arrangements: input.feedingArrangements,
        // C5's density series: meal-type days. Deliberately NOT "days with any log" —
        // that saturates and certifies the artefact C5 discloses — and deliberately not
        // "non-meal days" either, which on a real record IS the symptom series and so
        // circles back on the count it would be checking. See `TrialLoggingDensity`.
        mealLoggedDayIndices: [
          ...new Set(
            windowEvents
              .filter((e) => e.type === 'meal')
              .map((e) => eventDayNumber(e.occurredAt, tz))
              .filter((dn): dn is number => dn !== null),
          ),
        ],
        symptomDayIndices: windowEvents
          .filter((e) => REPORT_SYMPTOM_SET.has(e.type))
          .map((e) => eventDayNumber(e.occurredAt, tz))
          .filter((dn): dn is number => dn !== null),
        scope,
        nowMs,
        timeZone: tz,
      })
    : null

  const trial = trialBlock
    ? {
        foodLabel: reportTrialInput!.foodLabel ?? null,
        primaryProtein: reportTrialInput!.primaryProtein ?? null,
        startedAt: reportTrialInput!.startedAt,
        targetDurationDays: reportTrialInput!.targetDurationDays,
        vetName: reportTrialInput!.vetName,
        proteinSet: proteinView(reportTrialInput!, { isTrialDiet: true }),
      }
    : null

  const diet: DietSummary = {
    trialTargetProtein: trialProteinTarget,
    trialProteinProvenance,
    trialProteinMismatch,
    trial,
    freeFed,
    intakeNotDirectlyObserved: freeFed.length > 0,
    mealCompletion,
    mealItems,
    treats: { count: treatFeedings.length, distinctItems: treatItemIds.size },
    humanFood: { count: humanFoodFeedings.length, days: humanFoodDays.size, items: humanFoodItems },
  }

  // ── Detection reuse (§7 / §8.5) ──────────────────────────────────────────────
  const detInput = buildDetectionInput(input, scope, windowEvents, droppedEventIds)
  const detection = runDetection(detInput)

  const correlation: CorrelationSummary = {
    established: detection.established,
    hasEstablished: detection.established.length > 0,
    noThreshold: detection.established.length === 0,
    stapleProtein: detection.stapleProtein,
    timing: detection.timing,
  }

  // ── Concurrent interventions (GP-0 note, §3.5/§3.8) ──────────────────────────
  const concurrentChanges = buildConcurrentChanges(
    input,
    scope,
    startDayNum,
    bucketIndexOfDay,
    unlinkedMedications,
  )

  // ── Safety flags (§3.1 order; §5.3 empty when none) ──────────────────────────
  const safetyFlags: SafetyFlag[] = []
  // Present blood / foreign LEAD the safety band (§2 present-only decision). Stool blood
  // (melena/haematochezia) leads exactly as vomit blood does — the report's 60-second scan surface
  // must not bury a large-/upper-GI bleed signal in §3.7 (B-247 PR 7 vet-report-cold-read). Derived
  // from the SAME present-only structured aggregate the §3.7 section uses (single source), so the
  // band and the section can never disagree.
  if (vomitPhenotype && vomitPhenotype.bloodPresent.length > 0) {
    safetyFlags.push({ kind: 'present_blood', source: 'vomit', incidents: vomitPhenotype.bloodPresent })
  }
  if (stool?.ai && stool.ai.bloodPresent.length > 0) {
    safetyFlags.push({ kind: 'present_blood', source: 'stool', incidents: stool.ai.bloodPresent })
  }
  if (vomitPhenotype && vomitPhenotype.foreignPresent.length > 0) {
    safetyFlags.push({ kind: 'present_foreign', incidents: vomitPhenotype.foreignPresent })
  }
  if (detection.intakeDecline) {
    const f = detection.intakeDecline
    // B-213 — the "how long off food?" number, measured from the report's `now` (window end,
    // = the detector's own `now`) to the last fully-eaten meal. Whole hours; clamped ≥0 so a
    // boundary meal can never read as a negative gap. null when no full meal exists in-window.
    const detNowMs = parseMs(scope.detectionNowIso)
    const lastFullMs = parseMs(f.lastFullMealIso)
    const hoursSinceLastFullMeal =
      detNowMs !== null && lastFullMs !== null
        ? Math.max(0, Math.round((detNowMs - lastFullMs) / MS_PER_HOUR))
        : null
    safetyFlags.push({
      kind: 'intake_decline',
      trigger: f.trigger,
      species: f.species,
      baselineScore: f.baselineScore,
      recentScore: f.recentScore,
      daysBelowBaseline: f.daysBelowBaseline,
      refusedFoodLabel: f.refusedFoodLabel,
      ratedMealsConsidered: f.ratedMealsConsidered,
      lastFullMealIso: f.lastFullMealIso,
      hoursSinceLastFullMeal,
    })
  }
  // B-494 — THE REFUSED PRESCRIBED DIET REACHES THE BAND. Ordered immediately after
  // `intake_decline` because it is the same clinical family (is this animal eating?) and
  // deliberately NOT suppressed when that flag also fired: the two are different findings over
  // different populations, and the pre-ship ruling turned on the report never leaving the flag
  // zone silent on a patient the record already knows is in trouble.
  //
  // THE RANGE FACT, NOT THE NOW-FACT. A report is a history: `trialDietRefusal` is bounded to
  // the last 14 days, so a cat that refused 42 bowls in weeks 1–3 and then had its ratings go
  // quiet would empty the recency window and take the flag with it. `rangeRefusal` is the same
  // predicate over the whole range; the now-fact is the fallback for the (rarer) case where the
  // range share is diluted by an eaten stretch but the recent record is not.
  //
  // THE EPISODE GUARD IS REQUIRED ON THE RANGE FACT, and only here — not in the trial
  // block, which is a history and correctly ignores it. `rangeRefusal` drops
  // `REFUSAL_MIN_SPAN_MS` by design, so "two distinct local days" is satisfied by a single
  // bout straddling midnight. That is harmless in a narrated block and wrong in an
  // above-the-fold escalation: `dietTrialCard.ts` already refuses to let a present-tense
  // register speak from an unspanned range fact, and a band that fires where the owner's
  // own card is silent gives one record two answers with the VET's copy taking the louder
  // one. The now-fact carries the span guard internally, so it needs no test here.
  //
  // THIS IS THE SPAN HALF OF `liveRefusal`'S GUARD, NOT THE WHOLE OF IT, and the gap is
  // named rather than papered over: the card ALSO requires `!isEatingNow`, which this
  // cannot mirror because the stand-down pair (`recentFinishedFeedings` /
  // `recentRatedFeedings`) is not on `TrialBlock`. So a pet that refused for a fortnight
  // and has since eaten well still fires the band while the card has stood down —
  // over-fire, the survivable direction, and a history is a defensible thing for a report
  // to escalate on where it is not for a live card. Filed as B-581.
  if (trialBlock) {
    const spannedRange = trialBlock.rangeRefusal && trialBlock.rangeRefusalSpansEpisodes
      ? trialBlock.rangeRefusal
      : null
    const refusal = spannedRange ?? trialBlock.trialDietRefusal
    const stoppedForRefusal = trialBlock.stoppedReason === 'refused'
    if (refusal || stoppedForRefusal) {
      safetyFlags.push({
        kind: 'trial_diet_refusal',
        refusal,
        stoppedForRefusal,
        species: trialBlock.species,
        trialDietLabels: trialBlock.trialDietLabels,
        // EVIDENCE — `refusal.days` is counted over the evidence window, so the
        // dates that render beside it must be too. Off the coverage range the
        // B-494 safety band dated 176 days of refusals inside a 98-day window and
        // reported the most recent refusal 79 days early, on the feline
        // hepatic-lipidosis lane, in the one zone the report teaches vets to scan.
        evidenceStartDate: trialBlock.evidenceStartDate,
        evidenceEndDate: trialBlock.evidenceEndDate,
      })
    }
  }
  // B-704 §6 — the target-vs-label mismatch, promoted to a safety flag so the discrepancy
  // is STATED in the flag zone the report teaches a vet to scan first, never left silent
  // (the B-494 rule; `vet-report-cold-read` 2026-08-05). Ordered here — after the intake /
  // blood / foreign flags, before chronicity / worsening — so a genuine physical-sign flag
  // still outranks it; what matters for B-494 is presence in the band, not the top slot.
  // Trial-level, never per-feeding (TG-3); it names a discrepancy and moves no count.
  // `trialProteinMismatch` is non-null only when an owner value disagrees with the food's
  // designated primary, which requires a live trial.
  if (trialProteinMismatch) {
    safetyFlags.push({
      kind: 'protein_mismatch',
      recordedProtein: trialProteinMismatch.target,
      foodProtein: trialProteinMismatch.foodProtein,
      trialDietLabels:
        trialBlock?.trialDietLabels.length
          ? trialBlock.trialDietLabels
          : trialProteinMismatch.foodLabel
            ? [trialProteinMismatch.foodLabel]
            : [],
    })
  }
  for (const f of detection.chronicity) {
    // The engine buckets by UTC day — deliberate for the rolling Signal (detection.ts §2:
    // chronicity is timezone-independent), but on THIS artifact the numbers sit one page from
    // appendix A + the At-a-glance tile, which a vet tallies in LOCAL days: the first real report
    // said "on 18 days" beside an appendix showing 19, and the re-read caught the flag saying "4
    // days ago" beside the tile's "5 d since" (same fact, UTC-vs-local off-by-one on the LEAD
    // safety line — vet-report-cold-read, PR 7). The report is the local-day surface, so BOTH
    // symptomDays AND daysSinceLastEpisode are recounted over the SAME episode set (deduped window
    // events of this type from the detector's first onset) in the owner's timezone, so the flag
    // agrees with the tile it sits beside. If the report window doesn't cover the detector's full
    // episode set (episode counts differ — the 56d-detector-vs-90d-report gap, B-246), keep the
    // engine's numbers rather than derive from a partial set. The WORSENING flag's sibling UTC
    // counts are still NOT patched here — that reconciliation stays the deferred B-219 decision.
    const firstOnsetMs = Date.parse(f.firstOnsetIso)
    const episodes = windowEvents.filter(
      (e) => e.type === f.symptomType && Number.isFinite(firstOnsetMs) && Date.parse(e.occurredAt) >= firstOnsetMs,
    )
    const localDayNums = new Set<number>()
    let lastLocalDay: number | null = null
    for (const e of episodes) {
      const dn = eventDayNumber(e.occurredAt, tz)
      if (dn !== null) {
        localDayNums.add(dn)
        if (lastLocalDay === null || dn > lastLocalDay) lastLocalDay = dn
      }
    }
    // Only trust the local recount when the report window covers the detector's full episode set
    // (mirrors the symptomDays guard); else the engine's UTC number is the honest fallback.
    // UNIT MISMATCH, FIXED (HR-7 / CUL-676; adversarial pass 2026-08-28). This compared
    // `episodes.length` — minute-deduped ROWS — against `f.episodeCount`, which is the
    // engine's 3-HOUR-CHAINED episode count. For vomiting the two usually coincide (one row
    // per bout), which is why it survived; for COUGH they differ by construction, because a
    // single coughing fit is logged repeatedly and the chain collapses exactly that. The
    // consequence was silent and precisely inverted from its intent: the guard would read
    // "counts differ ⇒ the window doesn't cover the episode set" for EVERY cough flag, so
    // the local-day reconciliation below would disable itself and fall back to the engine's
    // UTC numbers — reinstating the ±1-day disagreement with the At-a-glance tile that the
    // PR-7 cold read caught on the lead safety line. Compare like for like: chain the
    // report's rows with the SAME shared predicate the engine uses (lib/symptomEpisodes —
    // never a second collapse, per §5.3) and compare episode counts to episode counts.
    const reportEpisodeCount = collapseToEpisodeOnsets(
      episodes.map((e) => Date.parse(e.occurredAt)),
      DEFAULT_CONFIG.symptomEpisodeGapHours,
    ).length
    const episodeSetMatches = reportEpisodeCount === f.episodeCount
    const localSymptomDays = episodeSetMatches ? localDayNums.size : f.symptomDays
    const localDaysSince =
      episodeSetMatches && lastLocalDay !== null ? Math.max(0, endDayNum - lastLocalDay) : f.daysSinceLastEpisode
    // EVIDENCE vs BELIEF (CUL-69 / B-700). Everything the engine returned — the onset, the
    // span, and every count — is bounded at the DETECTOR's own `windowDays` lookback,
    // measured back from the window end (computeChronicityStats filters onsets to
    // `ms >= now - windowDays`). The report's window is WIDER by construction on the default
    // artifact — buildDetectionInput's own contract says so ("90-day fallback ⊃ 56d
    // chronicity window") — so for any course that predates the lookback, the detector's
    // first onset lands ~34 days INSIDE the window while appendix A, one page later, prints
    // the earlier entries. Rendering that onset as "first logged" is therefore a FALSE DATE that
    // this report's own appendix contradicts: a cat vomiting since May 20 was dated Jun 13, three
    // weeks short, on the axis a vet reads a chronicity flag FOR. A reader who takes it at face
    // value gets a five-week problem where the record holds a four-month one — the B-532 finding,
    // arriving through a boundary B-532's own left-censor does not test.
    //
    // So the record's own first entry is carried SEPARATELY rather than replacing the engine's
    // anchor: the same split as `TrialFacts.exposureRange` vs `range`, for the same reason — one
    // bounds what the engine counted, the other bounds what the record holds. The render layer
    // states the date from this and the SPAN from the engine, and the reason that split is not
    // squeamishness is in render.ts: a duration is an inference the engine guards with three
    // floors, and widening it here re-opens §10 #4. Read off `occurredAt`, like-for-like with the
    // detector, which saw these same deduped rows.
    //
    // Computed unconditionally, deliberately unlike `localSymptomDays`/`localDaysSince` above,
    // which fall back to the engine when `episodeSetMatches` is false. That guard asks whether the
    // report's episode SET matches the engine's, because those two are recounts of the engine's
    // own numbers. This is not a recount of anything — it is a fact about the record, answerable
    // whether or not the counts reconcile.
    let firstLoggedMs: number | null = null
    for (const e of windowEvents) {
      if (e.type !== f.symptomType) continue
      const ms = Date.parse(e.occurredAt)
      if (!Number.isFinite(ms)) continue
      if (firstLoggedMs === null || ms < firstLoggedMs) firstLoggedMs = ms
    }
    // The `min` is inert by construction, not merely by expectation: `buildDetectionInput` builds
    // `symptomEvents` from these same `windowEvents`, and `toEpisodeOnsets` returns an ACTUAL
    // member instant of a chain rather than a synthesised one, so the engine's onset is always one
    // of the rows scanned above. Kept anyway because the invariant lives in another module, and
    // the unparseable-row fallback keeps the flag stating a date it can defend rather than none.
    const firstLoggedIso =
      firstLoggedMs === null
        ? f.firstOnsetIso
        : new Date(
            Number.isFinite(firstOnsetMs) ? Math.min(firstLoggedMs, firstOnsetMs) : firstLoggedMs,
          ).toISOString()
    safetyFlags.push({
      kind: 'chronicity',
      symptomType: f.symptomType,
      episodeCount: f.episodeCount,
      spanDays: f.spanDays,
      activeWeeks: f.activeWeeks,
      symptomDays: localSymptomDays,
      daysSinceLastEpisode: localDaysSince,
      firstOnsetIso: f.firstOnsetIso,
      firstLoggedIso,
      tier: f.tier,
      windowDays: f.windowDays,
      ...(f.coughVomitAdjacent ? { coughVomitAdjacent: true as const } : {}),
    })
  }
  for (const f of detection.worsening) {
    safetyFlags.push({
      kind: 'symptom_worsening',
      symptomType: f.symptomType,
      currentCount: f.currentCount,
      priorCount: f.priorCount,
      currentDays: f.currentDays,
      priorDays: f.priorDays,
      trigger: f.trigger,
      tier: f.tier,
      windowDays: f.windowDays,
    })
  }

  // ── Provenance / appendices (§3.9, appendix A/B/C) ───────────────────────────
  const symptomLog: SymptomLogEntry[] = windowEvents
    .filter((e) => REPORT_SYMPTOM_SET.has(e.type))
    .map((e) => {
      // Shared with Appendix E's photo manifest (buildIncidentPhenotype) — present blood/foreign
      // unioned over ALL members (§5.9) so a de-duplicated bout still shows a flag carried by a
      // dropped twin, and never a positive "no" on an unsure/absent read.
      const phenotype = buildIncidentPhenotype(e.type, e.memberEventIds, analysisByEvent)
      return {
        eventId: e.id,
        type: e.type,
        occurredAt: e.occurredAt,
        occurredAtConfidence: e.occurredAtConfidence,
        occurredAtEarliest: e.occurredAtEarliest,
        occurredAtLatest: e.occurredAtLatest,
        loggedAt: e.loggedAt,
        severity: e.severity,
        notes: e.notes,
        dupCount: e.dupCount,
        phenotype,
      }
    })
  const estimatedOrWindowCount = symptomLog.filter(
    (e) => e.occurredAtConfidence === 'estimated' || e.occurredAtConfidence === 'window',
  ).length

  // ── The off-diet member set (§7's first bullet — the re-base) ────────────────
  //
  // ONE DEFINITION OF OFF-DIET ACROSS PAGE 1, THE TILE AND THE APPENDIX. This array
  // is that definition: the page-1 off-diet line, the At-a-glance tile, the antigen
  // tally, the protein-over-time chart and Appendix C all read it, and before PR 7
  // they all read a set that had never heard of the trial.
  //
  // WHEN A TRIAL OVERLAPS THE WINDOW the members come from `classifyFeeding` — the
  // shared predicate — so the vet-PERMITTED treat stops being listed as a
  // contaminant and a different-brand kibble fed as a MEAL starts being listed at
  // all. Neither is possible under the heuristic: it keys on treat-or-human-food, a
  // permitted treat is a treat, and a rival kibble is a meal.
  //
  // WITH NO TRIAL the heuristic is retained VERBATIM, deliberately. Off the back of
  // a trial it is not a worse definition, it is the only one available: "everything
  // fed outside the main diet" is what a monitoring report means by off-diet, and
  // there is no allowed set to classify against. Changing it would re-litigate every
  // no-trial report that has already been cold-read.
  //
  // THE ONE EMPIRICAL REASON THIS MATTERS AT ALL (§2.1 case 6): applied to the
  // production account the heuristic reports ~530 off-diet exposures across 645
  // feedings, because 82% of logged feedings are treats. No layout rescues 530
  // exposures — it is unreadable to a vet and unfaceable for an owner. The explicit
  // allowed set is what makes an exposure count small enough to mean anything.
  const trialClassified = trialBlock !== null && !trialBlock.allowedSetUnavailable
  const confounderFeedings = trialClassified
    ? // Rung 1 permitted it, or rungs 2–3 did not. Order and membership come from
      // the classifier; the event join below re-attaches what the render needs.
      (() => {
        const offDietIds = new Map(trialBlock!.exposures.items.map((x) => [x.eventId, x]))
        return windowMeals.filter((e) => offDietIds.has(e.id))
      })()
    : windowMeals.filter(
        // MUST mirror the treatFeedings + humanFoodFeedings union exactly, or an off-diet exposure
        // counted on page 1 (treats) vanishes from Appendix B and the antigen tally — a hidden
        // trial-breaking antigen (adversarial finding: a `format==='treat'` item with a non-'treat'
        // foodType was in page-1 treats but absent from the reconciliation). `format==='treat'` is a
        // legitimate FoodFormat, so the treat arm needs BOTH predicates here too.
        (e) => e.meal!.foodType === 'treat' || e.meal!.format === 'treat' || e.meal!.format === 'human_food',
      )
  const trialExposureByEvent = new Map(
    (trialBlock?.exposures.items ?? []).map((x) => [x.eventId, x]),
  )
  const confounders: ConfounderExposure[] = confounderFeedings.map((e) => {
    const x = trialClassified ? trialExposureByEvent.get(e.id) ?? null : null
    return {
      eventId: e.id,
      occurredAt: e.occurredAt,
      dayKey: localDayKey(e.occurredAt, tz),
      foodLabel: mealFoodLabel(e.meal!),
      // Keep the stored casing for the row display, but a junk sentinel (the literal string
      // "null", "unknown", …) is NOT a protein — null it here so no consumer prints it.
      primaryProtein: canonicalizeProtein(e.meal!.primaryProtein) ? e.meal!.primaryProtein : null,
      format: e.meal!.format,
      foodType: e.meal!.foodType,
      note: e.notes,
      proteinSet: proteinView(e.meal!),
      rung: x ? (x.classification.rung === 'derived_protein' ? 'derived_protein' : 'unrecognised') : null,
      antigens: x?.classification.antigens ?? [],
      symptomInChallengeWindow: x?.symptomInChallengeWindow ?? false,
      panelWasRead: x?.panelWasRead ?? false,
      attributionChecked: x?.attributionChecked ?? true,
      permittedLaterFrom: x?.permittedLaterFrom ?? null,
    }
  })
  // Tally by the CANONICAL key (B-052): "chicken", "Chicken" and "Chicken By-Product Meal"
  // are one antigen for the vet weighing exposures. Feedings with no usable protein are
  // counted separately and disclosed in the render — never a "null ×N" tally line, never
  // silently dropped.
  //
  // SET-MEMBERSHIP SINCE B-351 SLICE 5 (§9). A feeding counts once for EVERY protein its
  // food contains, so a duck-and-chicken treat lands in BOTH bands. This is the whole
  // clinical point — the hidden secondary is the textbook reason an elimination trial
  // silently fails, and tallying only the primary is what kept it invisible. Two
  // consequences, both handled rather than hidden:
  //   (a) sum-over-proteins is an EXPOSURE count and may EXCEED the feeding count, so the
  //       feeding count is carried separately and §5.6 reconciles feedings-to-feedings
  //       (Appendix C's rows still sum to `totalFeedings`);
  //   (b) a food whose panel was never read contributes only its primary, so every count
  //       here is a FLOOR — `incompleteFeedings` is what lets the render say so (D10).
  // A feeding is "unknown" iff its whole derived set is empty — unchanged semantics.
  const proteinExposureTally: Record<string, number> = {}
  let proteinUnknownCount = 0
  let incompleteFeedings = 0
  for (const c of confounders) {
    if (c.proteinSet.proteins.length === 0) {
      // NOT counted as an unread panel: a feeding with no captured protein at all
      // (often no food row at all — a bare human-food log) is already disclosed as
      // "no recorded protein". Counting it here too made the floor line say N
      // feedings "involved a food whose ingredient panel was never captured" when
      // there was no food. Over-disclosure in the safe direction, but the sentence
      // did not mean what it said.
      proteinUnknownCount++
      continue
    }
    if (!c.proteinSet.complete) incompleteFeedings++
    for (const key of c.proteinSet.proteins) {
      proteinExposureTally[key] = (proteinExposureTally[key] ?? 0) + 1
    }
  }

  // Off-diet protein exposure over time (#9) — bin the SAME confounder set by the SAME weekly
  // buckets as the symptom chart, by canonical protein. Every confounder bins (a null local-day
  // key falls back to the UTC slice, which is always parseable), so sum-over-bins === the tally
  // above, and sum-over-`feedingsByWeek` === the Appendix C total (§5.6 reconciliation, now
  // stated in feedings because a stack segment counts exposures). Largest protein first →
  // stack baseline.
  const timelineProteins = Object.keys(proteinExposureTally).sort(
    (a, b) => proteinExposureTally[b] - proteinExposureTally[a] || a.localeCompare(b),
  )
  const proteinIdx = new Map(timelineProteins.map((p, i) => [p, i]))
  const timelineBins: number[][] = Array.from({ length: numBuckets }, () => new Array(timelineProteins.length).fill(0))
  const unknownByWeek: number[] = new Array(numBuckets).fill(0)
  const feedingsByWeek: number[] = new Array(numBuckets).fill(0)
  for (const c of confounders) {
    const dn = dayNumber(c.dayKey ?? c.occurredAt.slice(0, 10))
    if (dn === null) continue
    const w = bucketIndexOfDay(dn)
    feedingsByWeek[w]++
    if (c.proteinSet.proteins.length === 0) {
      unknownByWeek[w]++
      continue
    }
    for (const key of c.proteinSet.proteins) {
      const j = proteinIdx.get(key)
      if (j !== undefined) timelineBins[w][j]++
    }
  }
  // Distinct meal-days per bucket — the off-diet chart's "was the diet observed?" test (B-497). A
  // logged symptom is NOT diet observation, so this counts meal-type events only, never `loggedDayNums`.
  const mealDayNums = new Set<number>()
  for (const e of windowMeals) {
    const dn = eventDayNumber(e.occurredAt, tz)
    if (dn !== null) mealDayNums.add(dn)
  }
  const mealDaysByBucket = new Array(numBuckets).fill(0)
  for (const dn of mealDayNums) mealDaysByBucket[bucketIndexOfDay(dn)]++

  const proteinTimeline: ProteinTimeline = {
    weekStartDates: bucketStartDates,
    proteins: timelineProteins,
    bins: timelineBins,
    unknownByWeek,
    mealDaysByBucket,
    feedingsByWeek,
    totalByProtein: proteinExposureTally,
    hasUnknown: proteinUnknownCount > 0,
    totalFeedings: confounders.length,
    incompleteFeedings,
  }

  // ── Intake appendix (B-213) — recent rated meals, ONLY when an intake flag fired ─────
  // The page-1 intake numbers (baseline, decline, last full meal) must trace to real meal
  // rows. Built from the deduped, windowed rated meals — the SAME set the detector saw — so
  // "declined N of last M" and the last-full-meal date line up with appendix rows. Empty on
  // calm reports (no meal dump when there's no intake concern). Most-recent-first + capped.
  const hasIntakeFlag = safetyFlags.some((f) => f.kind === 'intake_decline')
  const ratedMealsInWindow = windowMeals
    .filter((e) => e.meal!.foodType === 'meal' && e.meal!.intakeRating != null)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  // B-532/B-500 — the second population: every meal the owner did NOT record as FULLY EATEN.
  //
  // The threshold is `!== 'all'`, matching page 1's "N of M rated meals FULLY EATEN"
  // (`finishedMeals` counts `=== 'all'`) and this list's own copy — its lead reads "every
  // rated meal … the owner did not record as fully eaten" and its caption "meals rated below
  // 'ate it all'". B-532 filtered on `feedingWasFinished` (`most`/`all`) instead, so an "ate
  // most" meal was NOT fully eaten on page 1 yet counted as finished here — the one meal page 1
  // singles out as the "1" in "86 of 87" then had no dated row anywhere, and the list's own
  // caption promised it (B-500, `vet-report-cold-read`). `most` is a possible-signal rating for
  // this purpose (page 1 flags it) but not an alarm: `intakeLogRow` still bolds only the
  // below-`most` ratings, so an "ate most" row is present and dated but plain, not a false
  // alert. The grouped table above still carries the full breakdown either way.
  const unfinishedRated = ratedMealsInWindow.filter((e) => e.meal!.intakeRating !== 'all')
  const intakeLogScope: 'intake_flag' | 'unfinished' | null = hasIntakeFlag
    ? 'intake_flag'
    : unfinishedRated.length > 0
      ? 'unfinished'
      : null
  let intakeLog: IntakeLogEntry[] = []
  let intakeLogHiddenOlder = 0
  if (intakeLogScope !== null) {
    const ratedForLog = intakeLogScope === 'intake_flag' ? ratedMealsInWindow : unfinishedRated
    // The page-1 anchor = the most recent fully-eaten meal (ratedForLog is most-recent-first,
    // so the first `all` is exactly the meal detection.ts anchored `lastFullMealIso` on — one
    // rule, no divergence). May be null (no full meal in the window → flag says so honestly).
    // Only the flag population carries it: the unfinished population has no `all` row by
    // construction, and pinning one into it would put a fully-eaten meal in a list captioned
    // as the meals that were not.
    const anchorMeal =
      intakeLogScope === 'intake_flag' ? ratedForLog.find((e) => e.meal!.intakeRating === 'all') ?? null : null
    const head = ratedForLog.slice(0, INTAKE_LOG_CAP)
    // TRACEABILITY (adversarial finding): the "how long off food" number must point at a VISIBLE
    // row. If the anchor predates the most-recent cap (a chronically-inappetent pet with >cap
    // non-full meals since its last full meal), PIN it back in as a trailing row so it is shown
    // and taggable — never left cited-but-invisible. Everything between is disclosed as omitted.
    const anchorInHead = anchorMeal !== null && head.includes(anchorMeal)
    const shownRows = anchorMeal !== null && !anchorInHead ? [...head, anchorMeal] : head
    const shownIds = new Set(shownRows.map((e) => e.id))
    intakeLogHiddenOlder = ratedForLog.filter((e) => !shownIds.has(e.id)).length
    intakeLog = shownRows.map((e) => ({
      eventId: e.id,
      occurredAt: e.occurredAt,
      foodLabel: mealFoodLabel(e.meal!),
      intakeRating: e.meal!.intakeRating as IntakeRating,
      isLastFullMeal: anchorMeal !== null && e.id === anchorMeal.id,
      pinned: !anchorInHead && anchorMeal !== null && e.id === anchorMeal.id,
    }))
  }

  const provenance: Provenance = {
    ownerReported: true,
    totalSymptomIncidents,
    estimatedOrWindowCount,
    deletedExcluded: true,
    symptomLog,
    intakeLog,
    intakeLogHiddenOlder,
    intakeLogScope,
    confounders,
    proteinExposureTally,
    proteinUnknownCount,
    conditions: input.conditions.map((c) => ({
      name: c.conditionName,
      status: c.status,
      diagnosedAt: c.diagnosedAt,
    })),
  }

  // ── Incident photos (Appendix E, PR 7) ───────────────────────────────────────
  // Every photographed IN-WINDOW health incident. Scoped to observation events only
  // (DEDUP_OBSERVATION_TYPES = symptoms + normal stool) — a meal/med/weight/"other" photo is not
  // a clinical incident and never surfaces as one. One entry per attachment, most-recent-first
  // (§3 Appendix E). The present-only safety class is derived from the SAME per-incident phenotype
  // the symptom log + safety band use (single source), so a blood/foreign photo that leads the
  // safety band is exactly the one flagged here. `dataUri` is populated by the index.ts I/O shell.
  const attachmentsByEvent = new Map<string, ReportAttachmentInput[]>()
  for (const at of input.attachments ?? []) {
    const arr = attachmentsByEvent.get(at.eventId)
    if (arr) arr.push(at)
    else attachmentsByEvent.set(at.eventId, [at])
  }
  const incidentPhotos: IncidentPhoto[] = []
  // An incident with a persisted AI read but NO retained photo — the owner removed the photo after
  // it was analysed (app/event/[id].tsx deletes the event_attachments row + storage object but keeps
  // the event_ai_analysis). Its read still prints in Appendix A + counts in the vomit phenotype, so
  // Appendix E MUST disclose it or the "every photographed incident" appendix silently contradicts
  // them — the exact "photos silently missing → erodes trust" failure the §4 all-photos rule exists
  // to prevent (vet-report-cold-read finding, PR 7). Counted here for the disclosure; no card (there
  // is no image to show).
  let incidentPhotosAnalyzedNoRetained = 0
  for (const e of windowEvents) {
    if (!DEDUP_OBSERVATION_TYPES.has(e.type)) continue
    // Union attachments across every member of a de-duplicated bout (§5.11) — a photo logged on a
    // dropped twin still belongs to the surviving incident. Deterministic per-incident order.
    const atts: ReportAttachmentInput[] = []
    for (const mid of e.memberEventIds) {
      const a = attachmentsByEvent.get(mid)
      if (a) atts.push(...a)
    }
    if (atts.length === 0) {
      if (buildIncidentPhenotype(e.type, e.memberEventIds, analysisByEvent)) incidentPhotosAnalyzedNoRetained++
      continue
    }
    atts.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (a.storagePath < b.storagePath ? -1 : a.storagePath > b.storagePath ? 1 : 0),
    )
    const phenotype = buildIncidentPhenotype(e.type, e.memberEventIds, analysisByEvent)
    // Present blood (vomit OR stool) sets the 'blood' safety class so the photo LEADS the band +
    // Appendix E (§2 present-only). Stool carries blood on `stoolBlood`, vomit on `bloodPresent`;
    // mucus is monitor-tier (D5) and never a safety-band lead.
    const phBlood = phenotype?.kind === 'stool' ? phenotype.stoolBlood != null : phenotype?.bloodPresent != null
    const safety: IncidentPhotoSafety | null = phBlood
      ? 'blood'
      : phenotype?.foreignPresent
        ? 'foreign'
        : null
    for (const at of atts) {
      incidentPhotos.push({
        eventId: e.id,
        storagePath: at.storagePath,
        type: e.type,
        occurredAt: e.occurredAt,
        occurredAtConfidence: e.occurredAtConfidence,
        occurredAtEarliest: e.occurredAtEarliest,
        occurredAtLatest: e.occurredAtLatest,
        notes: e.notes,
        safety,
        phenotype,
        dataUri: null,
      })
    }
  }
  // Most-recent-first (§3 Appendix E); stable, deterministic tiebreaks so the same data always
  // renders in the same order (and the index.ts embed cap, if ever hit, drops the same tail).
  incidentPhotos.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return b.occurredAt.localeCompare(a.occurredAt)
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1
    return a.storagePath < b.storagePath ? -1 : a.storagePath > b.storagePath ? 1 : 0
  })

  // ── Cherry-pick guard (§6) — custom window only ──────────────────────────────
  let outOfWindowSymptomCount = 0
  let outOfWindowMostRecent: string | null = null
  let outOfWindowMostRecentType: ReportSymptomType | null = null
  let outOfWindowBefore = 0
  let outOfWindowAfter = 0
  if (scope.isCustomOverride) {
    for (const e of dedupedAll) {
      if (!REPORT_SYMPTOM_SET.has(e.type)) continue
      // An undateable event is not evidence of an out-of-window incident — skip it.
      const dn = eventDayNumber(e.occurredAt, tz)
      if (dn === null) continue
      if (inWindow(e.occurredAt)) continue
      outOfWindowSymptomCount++
      // WHICH SIDE, not just how many. See the field's note: on a both-ends crop the
      // scalar cannot distinguish "five events before the window I picked" from "five
      // after it", and the second is the one that matters on a completed trial.
      if (dn < scope.startDayNum) outOfWindowBefore++
      else outOfWindowAfter++
      if (outOfWindowMostRecent === null || e.occurredAt > outOfWindowMostRecent) {
        outOfWindowMostRecent = e.occurredAt
        // B-613 — the type travels WITH the instant, assigned in the same branch, so the
        // pair can never describe two different events. Held apart in two independent
        // `if`s they drift the moment either condition gains a clause, and the failure is
        // silent: a date from one incident under a noun from another, on the line a vet
        // reads to decide whether the crop matters.
        outOfWindowMostRecentType = e.type as ReportSymptomType
      }
    }
  }

  // ── B-613 — the trial-crop half: what the window hides OF THE TRIAL ──────────
  //
  // Deliberately a SECOND loop rather than a branch inside the one above, because the two
  // answer different questions over different spans and must not share a bound. The guard
  // above asks "what did this hand-picked window leave out of the RECORD?" and ranges over
  // all fetched history. This asks "what did this window leave out of the TRIAL this block
  // describes?" and is bounded by the trial's own elapsed span — outside the trial is
  // outside this block's subject, and counting it here would put a symptom from three
  // months before the diet started into a sentence about the diet.
  //
  // Fires on ANY basis, which is the whole point: the case that produced it is a preset
  // `since_visit` window, where nothing was gated on and nothing was disclosed.
  let trialCropSymptoms: ScopeInfo['trialCropSymptoms'] = null
  if (
    trialBlock !== null &&
    trialBlock.trialDaysOutsideRange.before + trialBlock.trialDaysOutsideRange.after > 0
  ) {
    let count = 0
    let mostRecentIso: string | null = null
    let mostRecentType: ReportSymptomType | null = null
    const tally = new Map<ReportSymptomType, number>()
    // The cropped days themselves, so the count above can be read as a rate. Collected in
    // the SAME pass and with the same two predicates, so the numerator and its denominator
    // can never describe different spans.
    const cropDayNums = new Set<number>()
    const mealDayNums = new Set<number>()
    for (
      let dn = trialBlock.elapsedStartDayIndex;
      dn <= trialBlock.elapsedEndDayIndex;
      dn++
    ) {
      if (dn < scope.startDayNum || dn > scope.endDayNum) cropDayNums.add(dn)
    }
    for (const e of dedupedAll) {
      const dn = eventDayNumber(e.occurredAt, tz)
      if (dn === null) continue
      // Inside the trial…
      if (dn < trialBlock.elapsedStartDayIndex || dn > trialBlock.elapsedEndDayIndex) continue
      // …and outside this report. ONE window predicate, shared with the guard above and
      // with every other section — a second definition of "in this report" is how two
      // sentences on one page come to disagree about the same event (the B-532 class).
      if (inWindow(e.occurredAt)) continue
      if (e.type === 'meal') {
        mealDayNums.add(dn)
        continue
      }
      if (!REPORT_SYMPTOM_SET.has(e.type)) continue
      const t = e.type as ReportSymptomType
      count++
      tally.set(t, (tally.get(t) ?? 0) + 1)
      if (mostRecentIso === null || e.occurredAt > mostRecentIso) {
        mostRecentIso = e.occurredAt
        mostRecentType = t
      }
    }
    const byType = [...tally.entries()]
      .map(([type, n]) => ({ type, count: n }))
      .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
    // IS THIS COUNT A TOTAL OR A FLOOR? Only the HEAD can be short: the pull carries no
    // upper bound (`.gte` only, index.ts), so everything from the floor to `now` is in
    // hand and a tail crop is always fully counted. The head is bounded by
    // `computeLookbackIso`, which a long trial can outrun.
    //
    // The comparison is day-granular and rounded TOWARD "floor" on the boundary day: the
    // pull floor is an instant while the trial's start is a local day, so a floor landing
    // anywhere inside that first day leaves part of it unfetched. Saying "at least" over a
    // day that happened to be complete costs a word; saying "N" over a day that was not
    // costs the disclosure.
    const pullFloorDayNum =
      typeof input.eventsSinceIso === 'string' ? eventDayNumber(input.eventsSinceIso, tz) : null
    const headCropped = trialBlock.trialDaysOutsideRange.before > 0
    const countIsFloor =
      headCropped && (pullFloorDayNum === null || pullFloorDayNum >= trialBlock.elapsedStartDayIndex)
    trialCropSymptoms = {
      count,
      mostRecentIso,
      mostRecentType,
      byType,
      cropDays: cropDayNums.size,
      // `mealDayNums` ALREADY holds only cropped days, and provably so rather than by
      // habit: `inWindow` is `dn >= startDayNum && dn <= endDayNum` over the very
      // `eventDayNumber` computed above (report.ts `inWindowDay`), so the loop's two
      // filters — inside the trial span, not in the window — are exactly the predicate
      // `cropDayNums` is built from. An intersection here would be dead code that reads
      // as a safety net, which is worse than none: it tells the next reader there is a
      // case it handles. The boundary behaviour it would have covered is pinned by test
      // instead, so a change to `inWindow`'s granularity fails loudly.
      mealLoggedDaysInCrop: mealDayNums.size,
      countIsFloor,
    }
  }

  // ── Signalment ────────────────────────────────────────────────────────────────
  const age = computeAge(input.pet.dateOfBirth, nowMs)
  const signalment: Signalment = {
    name: input.pet.name,
    species: input.pet.species,
    breed: input.pet.breed,
    sex: input.pet.sex,
    neuterStatus: input.pet.neuterStatus ?? 'not_recorded',
    ageYears: age.years,
    ageMonths: age.months,
    dateOfBirth: input.pet.dateOfBirth,
    dateOfBirthPrecision: input.pet.dateOfBirthPrecision ?? 'exact',
    ownerName: input.ownerName,
    latestWeight: latestOverall
      ? {
          kg: latestOverall.weightKg,
          lbs: kgToLbsNum(latestOverall.weightKg),
          date: localDayKey(latestOverall.occurredAt, tz) ?? latestOverall.occurredAt.slice(0, 10),
        }
      : null,
  }

  const clinicalQuestion: ClinicalQuestion = {
    question: trial ? 'diet_trial_working' : 'symptom_monitoring',
    primarySymptom: primarySymptom?.type ?? null,
  }

  // ── R2-2 no-trial tile-set inputs (episodes-since-onset, days-since guard, trajectory caveat) ──
  // Derived from the PRIMARY symptom (symptoms[0], highest count) and the window's logged-day set.
  const ps = symptoms[0] ?? null
  // sinceOnset is scoped to the PRIMARY symptom because Tile 1 is labelled with it ("Vomiting since
  // onset").
  const psFirstOnsetDayNum = ps?.firstOnset ? eventDayNumber(ps.firstOnset, tz) : null
  const sinceOnsetDays = psFirstOnsetDayNum !== null ? endDayNum - psFirstOnsetDayNum + 1 : null
  // days-since-last-episode is the most recent episode of ANY symptom type, NOT just the primary —
  // Tile 3's label is the generic "most recent episode", so a more-recent SECONDARY symptom (e.g.
  // diarrhea today while vomiting was 30 d ago) must NOT be erased into a false symptom-free streak
  // that reads as recovery (adversarial finding). The safe error direction for a gap tile is a
  // SMALLER gap, never a larger one, so we take the MAX last-onset day across all symptoms.
  let lastEpisodeDayNum: number | null = null
  for (const s of symptoms) {
    const dn = s.lastOnset ? eventDayNumber(s.lastOnset, tz) : null
    if (dn !== null && (lastEpisodeDayNum === null || dn > lastEpisodeDayNum)) lastEpisodeDayNum = dn
  }
  const daysSinceLastEpisode = lastEpisodeDayNum !== null ? Math.max(0, endDayNum - lastEpisodeDayNum) : null
  let loggedDaysSinceLastEpisode: number | null = null
  if (lastEpisodeDayNum !== null) {
    let c = 0
    for (const dn of loggedDayNums) if (dn > lastEpisodeDayNum && dn <= endDayNum) c++
    loggedDaysSinceLastEpisode = c
  }
  // Window-half logged-day split — THE SAME partition `trendHalves` uses (B-532), so the
  // "unlogged early/later window" caveat can never qualify a different split from the delta
  // it is printed under (R2-6). On an odd window the middle day is in neither count, exactly
  // as it is in neither half of the delta.
  let firstHalfLoggedDays = 0
  let secondHalfLoggedDays = 0
  for (const dn of loggedDayNums) {
    if (inFirstHalf(dn)) firstHalfLoggedDays++
    else if (inLastHalf(dn)) secondHalfLoggedDays++
  }

  const atAGlance: AtAGlance = {
    primarySymptom,
    totalSymptomIncidents,
    windowDays,
    loggedDays,
    anySymptomDays: new Set(
      windowEvents
        .filter((e) => REPORT_SYMPTOM_SET.has(e.type))
        .map((e) => eventDayNumber(e.occurredAt, tz))
        .filter((dn): dn is number => dn !== null),
    ).size,
    // ONE coverage definition. `countTrialDaysLogged` counted a meal of ANY food
    // over a trial-scoped floor — honest about what it counted, but its headline
    // noun phrase was not (§5.1), and it disagreed with the client's card. Deleted
    // in favour of the shared metric.
    trialDaysLogged: trialBlock?.coverage?.daysLogged ?? null,
    weightState: weight.isEmpty ? 'empty' : weight.trend && weight.trend.readingCount >= 2 ? 'trend' : 'single',
    sinceOnsetDays,
    daysSinceLastEpisode,
    loggedDaysSinceLastEpisode,
    firstHalfLoggedDays,
    secondHalfLoggedDays,
  }

  return {
    generatedAt: input.now,
    timezone: tz,
    scope: {
      ...scope,
      outOfWindowSymptomCount,
      outOfWindowMostRecent,
      outOfWindowMostRecentType,
      outOfWindowBefore,
      outOfWindowAfter,
      trialCropSymptoms,
    },
    signalment,
    clinicalQuestion,
    safetyFlags,
    weight,
    atAGlance,
    symptoms,
    vomitPhenotype,
    stool,
    diet,
    trial: trialBlock,
    medications,
    unlinkedMedications,
    medicationHistory,
    correlation,
    concurrentChanges,
    proteinTimeline,
    provenance,
    incidentPhotos,
    incidentPhotosAnalyzedNoRetained,
  }
}

// ── Assembly sub-helpers ──────────────────────────────────────────────────────

function buildWeightSection(
  latestOverall: ReportWeightCheckInput | null,
  windowReadings: ReportWeightCheckInput[],
  tz: string | null,
): WeightSection {
  const isEmpty = latestOverall === null
  const latest = latestOverall
    ? {
        kg: latestOverall.weightKg,
        lbs: kgToLbsNum(latestOverall.weightKg),
        date: localDayKey(latestOverall.occurredAt, tz) ?? latestOverall.occurredAt.slice(0, 10),
      }
    : null

  let trend: WeightTrendView | null = null
  if (windowReadings.length > 0) {
    const seriesKg = windowReadings.map((r) => r.weightKg)
    const seriesLbs = seriesKg.map(kgToLbsNum)
    const count = seriesLbs.length
    const latestLbs = seriesLbs[count - 1]
    const latestKg = seriesKg[count - 1]
    const deltaLbs = count >= 2 ? Math.round((latestLbs - seriesLbs[0]) * 10) / 10 : null
    const deltaKg = count >= 2 ? Math.round((latestKg - seriesKg[0]) * 100) / 100 : null
    trend = {
      readingCount: count,
      seriesLbs,
      seriesKg,
      latestLbs,
      latestKg,
      earliestDate: localDayKey(windowReadings[0].occurredAt, tz),
      latestDate: localDayKey(windowReadings[count - 1].occurredAt, tz),
      deltaLbs,
      deltaKg,
      // Descriptive direction only — never a verdict (guardrail from lib/weight.ts / migration 024).
      direction: deltaLbs == null ? null : deltaLbs > 0 ? 'up' : deltaLbs < 0 ? 'down' : 'flat',
    }
  }
  return { isEmpty, latest, trend }
}

function buildMedicationAdherence(
  m: ReportMedicationInput,
  liveDoses: ReportDoseInput[],
  scope: ReportScope,
  tz: string | null,
): MedicationAdherence {
  const startNum = dayNumber(m.startedAt)
  const endNum = m.endedAt ? dayNumber(m.endedAt) : null
  // Regimen's active span intersected with the report window (inclusive days).
  const spanStart = Math.max(startNum ?? scope.startDayNum, scope.startDayNum)
  const spanEnd = Math.min(endNum ?? scope.endDayNum, scope.endDayNum)
  const overlapsWindow = spanStart <= spanEnd
  const elapsedDaysInWindow = overlapsWindow ? spanEnd - spanStart + 1 : 0

  // Doses linked to THIS regimen, administered in the window.
  const regimenDoses = liveDoses.filter((d) => {
    if (d.medicationId !== m.id) return false
    const dn = eventDayNumber(d.occurredAt, tz)
    return dn !== null && dn >= scope.startDayNum && dn <= scope.endDayNum
  })
  let given = 0
  let partial = 0
  let missed = 0
  let refused = 0
  let unconfirmed = 0
  const doseDayNums = new Set<number>()
  // The same days as `doseDayNums`, as local day KEYS — Appendix D renders dates, and a day
  // number is only meaningful next to the scope that produced it (B-532).
  const doseDayKeys = new Set<string>()
  for (const d of regimenDoses) {
    switch (d.adherence) {
      case 'given':
        given++
        break
      case 'partial':
        partial++
        break
      case 'missed':
        missed++
        break
      case 'refused':
        refused++
        break
      default:
        unconfirmed++
        break
    }
    // Days with an ADMINISTERED dose — given OR partial ONLY. An UNCONFIRMED dose
    // (adherence null) is deliberately NOT counted here: bundling it as administered
    // would overstate compliance for a critical drug (adversarial finding 4). It stays
    // visible as unconfirmedDoses so the render can be honest about it.
    if (d.adherence === 'given' || d.adherence === 'partial') {
      const dn = eventDayNumber(d.occurredAt, tz)
      if (dn !== null) doseDayNums.add(dn)
      const dk = localDayKey(d.occurredAt, tz)
      if (dk !== null) doseDayKeys.add(dk)
    }
  }

  const expectedDoses =
    m.dosesPerDay != null && overlapsWindow ? Math.round(m.dosesPerDay * elapsedDaysInWindow) : null

  // A regimen with ZERO dose EVENTS in the window is "adherence not tracked", NEVER
  // "compliant" (spec §4 trap) — baked into the state, not left to the renderer.
  const adherenceState: 'tracked' | 'not_tracked' = regimenDoses.length === 0 ? 'not_tracked' : 'tracked'

  return {
    regimenId: m.id,
    drugName: m.drugName,
    strength: m.strength ?? null,
    doseAmount: m.doseAmount,
    route: m.route,
    dosesPerDay: m.dosesPerDay,
    scheduleNotes: m.scheduleNotes,
    indication: m.indication,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    status: m.status,
    // Non-prescription ⇒ a supplement (concurrent intervention, §2). Unknown ⇒ not a supplement.
    isSupplement: m.isPrescription === false,
    overlapsWindow,
    adherenceState,
    elapsedDaysInWindow,
    daysWithDose: doseDayNums.size,
    doseDays: [...doseDayKeys].sort(),
    expectedDoses,
    givenDoses: given,
    partialDoses: partial,
    missedDoses: missed,
    refusedDoses: refused,
    unconfirmedDoses: unconfirmed,
  }
}

/**
 * §3.8 orphan-dose gap — doses the owner logged that belong to NO configured regimen, grouped by
 * drug so each reads as one line. A dose carries only `medicationItemId`; its name is resolved
 * through `items` (medication_items). A dose whose `medicationId` points at a regimen we DID load is
 * already counted under that regimen (buildMedicationAdherence) and is excluded here — no double
 * count. A dose whose `medicationId` points at a regimen we somehow did NOT load is treated as
 * unlinked (surfaced) rather than dropped, so nothing logged is silently lost. Counts mirror the
 * regimen path exactly (administered = given + partial; unconfirmed never bundled as given).
 */
function buildUnlinkedMedications(
  liveDoses: ReportDoseInput[],
  regimenIds: Set<string>,
  items: ReportMedicationItemInput[],
  scope: ReportScope,
  tz: string | null,
): UnlinkedMedicationGroup[] {
  const itemById = new Map(items.map((i) => [i.id, i]))
  const orphan = liveDoses.filter((d) => {
    if (d.medicationId !== null && regimenIds.has(d.medicationId)) return false
    const dn = eventDayNumber(d.occurredAt, tz)
    return dn !== null && dn >= scope.startDayNum && dn <= scope.endDayNum
  })

  // Group by medication_item_id; doses with no item id fold into a single "unspecified" bucket.
  // A null item id is only reachable via medication_items ON DELETE SET NULL (migration 020) and
  // there is no delete-item UI today, so in practice every ad-hoc dose carries an id. If item
  // deletion ever ships, revisit so two genuinely-distinct unknown drugs don't pool here (B-305).
  const groups = new Map<string, ReportDoseInput[]>()
  for (const d of orphan) {
    const key = d.medicationItemId ?? ''
    const arr = groups.get(key)
    if (arr) arr.push(d)
    else groups.set(key, [d])
  }

  const out: UnlinkedMedicationGroup[] = []
  for (const [key, doses] of groups) {
    const item = key === '' ? null : itemById.get(key) ?? null
    let administered = 0
    let partial = 0
    let unconfirmed = 0
    let refused = 0
    let missed = 0
    let firstDn = Infinity
    let lastDn = -Infinity
    let firstKey = ''
    let lastKey = ''
    const doseDayKeys = new Set<string>()
    for (const d of doses) {
      switch (d.adherence) {
        case 'given':
          administered++
          break
        case 'partial':
          administered++
          partial++
          break
        case 'missed':
          missed++
          break
        case 'refused':
          refused++
          break
        default:
          unconfirmed++
          break
      }
      const dk = localDayKey(d.occurredAt, tz) ?? d.occurredAt.slice(0, 10)
      if (d.adherence === 'given' || d.adherence === 'partial') doseDayKeys.add(dk)
      const dn = eventDayNumber(d.occurredAt, tz)
      if (dn !== null) {
        if (dn < firstDn) {
          firstDn = dn
          firstKey = dk
        }
        if (dn > lastDn) {
          lastDn = dn
          lastKey = dk
        }
      }
    }
    out.push({
      itemId: item?.id ?? null,
      drugName: medicationItemName(item),
      isSupplement: item?.isPrescription === false,
      strength: item?.strength ?? null,
      route: item?.route ?? null,
      administeredDoses: administered,
      partialDoses: partial,
      unconfirmedDoses: unconfirmed,
      refusedDoses: refused,
      missedDoses: missed,
      totalDoses: doses.length,
      firstDate: firstKey || lastKey,
      lastDate: lastKey || firstKey,
      doseDays: [...doseDayKeys].sort(),
    })
  }
  // Deterministic: most-recently dosed first, then by name (stable render + snapshot tests).
  out.sort((a, b) =>
    a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : a.drugName.localeCompare(b.drugName),
  )
  return out
}

/** Clinical convention: generic name leads, brand in parens — "Cetirizine HCl (Zyrtec)". */
function medicationItemName(item: ReportMedicationItemInput | null): string {
  if (!item) return 'Unspecified medication'
  const g = item.genericName?.trim() || null
  const b = item.brandName?.trim() || null
  if (g && b && g.toLowerCase() !== b.toLowerCase()) return `${g} (${b})`
  return g || b || 'Unspecified medication'
}

/**
 * §4.4 (D2) — assemble the LIFETIME "Medication history" table (mock §05). It reads the pet's
 * WHOLE record — every regimen + `lifetimeDoses` (the untrimmed dose set) — through the ONE shared
 * course derivation (`lib/medicationHistory.ts`), so it is window-ignoring by construction and its
 * counts / end registers can never contradict the app's profile-card, med-detail or rundown surfaces
 * (H4) nor fabricate an ending from silence (H1). Pure; `render.ts` formats the cells.
 *
 * Returns null when the pet has no medication record at all (no regimen ever configured AND no dose
 * ever logged) — a null section, not an empty table with a fabricated "none" row.
 */
function buildMedicationHistory(
  input: ReportInput,
  droppedEventIds: Set<string>,
  tz: string | null,
): MedicationHistoryTable | null {
  // The untrimmed dose set (window-ignoring); a caller without it falls back to the lookback-
  // trimmed `doses` — narrower, never wrong. Then drop any dose whose parent event was collapsed
  // as a duplicate, exactly as `liveDoses` does. (Medication events never dedup — each gets a
  // unique key in dedupeEvents — so this is a no-op in practice, but the two dose paths must be
  // defined identically, §5.11, so a future dedup change can't diverge them.)
  const sourceDoses = input.lifetimeDoses ?? input.doses
  const liveDoses = sourceDoses.filter((d) => !droppedEventIds.has(d.eventId))

  // Map into the shared derivation's input shape. A ReportDoseInput becomes an AttributableDose
  // with `deleted_at: null` — index.ts pulls only non-deleted doses (soft-deleted parents are
  // dropped in mapDoseRows) and the dedup drop is filtered above, so every dose here is live.
  const regimens: MedicationHistoryRegimen[] = input.medications.map((m) => ({
    id: m.id,
    medication_item_id: m.medicationItemId,
    drug_name: m.drugName,
    dose_amount: m.doseAmount,
    route: m.route,
    doses_per_day: m.dosesPerDay,
    schedule_notes: m.scheduleNotes,
    started_at: m.startedAt,
    target_duration_days: m.targetDurationDays,
    target_duration_doses: m.targetDurationDoses ?? null,
    status: m.status,
    ended_at: m.endedAt,
  }))
  const doses: AttributableDose[] = liveDoses.map((d) => ({
    medication_id: d.medicationId,
    medication_item_id: d.medicationItemId,
    adherence: d.adherence,
    deleted_at: null,
    occurred_at: d.occurredAt,
  }))

  const courses = deriveMedicationCourses({ regimens, doses, timeZone: tz ?? undefined })
  if (courses.length === 0) return null

  const itemById = new Map((input.medicationItems ?? []).map((i) => [i.id, i]))
  const regimenById = new Map(input.medications.map((m) => [m.id, m]))

  const entries: MedicationHistoryEntry[] = courses.map((c) => {
    // H1 — the ending fields are read SOLELY from the derivation's `ended` register (a completed/
    // stopped owner action). Everything else leaves them false/null; a last-dose date can never
    // become an ending here or downstream, because the renderer has no ending field to read.
    const ended = c.end.kind === 'ended'
    const endStatus = c.end.kind === 'ended' ? c.end.status : null
    const endedDay = c.end.kind === 'ended' ? c.end.endedAt : null
    // A regimen names itself (drug_name is NOT NULL); a dose-derived course resolves generic-first
    // from the catalog. The report keeps its OWN clinical (generic-first) name, never the app's
    // brand-first one (pastMedications.ts §name-resolution); unresolvable ⇒ "Unspecified medication".
    const drugName =
      c.drugName ??
      medicationItemName(c.medicationItemId ? itemById.get(c.medicationItemId) ?? null : null)
    const reg = c.regimenId ? regimenById.get(c.regimenId) ?? null : null
    return {
      key: c.key,
      source: c.source,
      drugName,
      isActive: c.isActive,
      ended,
      endStatus,
      endedDay,
      startedDay: c.startedAt,
      firstDoseDay: c.firstDoseDay,
      lastDoseDay: c.lastDoseDay,
      // One distinct logged dose day → a bare "Feb 11" cell (the single-ad-hoc-dose case).
      singleDay: c.firstDoseDay !== null && c.firstDoseDay === c.lastDoseDay,
      targetDurationDays: c.targetDurationDays,
      // The dose-denominated total (B-618) is on the regimen, not the course; days- XOR dose-
      // denominated by the migration-049 CHECK, so the renderer picks the phrasing off whichever is set.
      targetDurationDoses: reg?.targetDurationDoses ?? null,
      dosesPerDay: c.dosesPerDay,
      scheduleNotes: c.scheduleNotes,
      runDays: c.runDays,
      plannedDoses: c.plannedDoses,
      dosesLogged: c.dosesLogged,
    }
  })

  // The "since" floor — the earliest dated point anywhere in the table (a regimen start or a first
  // dose). A lexical 'YYYY-MM-DD' min IS the chronological min, with no instant parse (B-441-safe).
  let sinceDay: string | null = null
  for (const e of entries) {
    for (const cand of [e.startedDay, e.firstDoseDay]) {
      if (cand !== null && (sinceDay === null || cand < sinceDay)) sinceDay = cand
    }
  }

  return { entries, sinceDay }
}

/**
 * Interventions that STARTED within the window (GP-0, spec §3.5/§3.8): a diet trial,
 * a medication regimen, a supplement, or a free-fed arrangement introduced mid-window.
 * The single highest-consequence misread to prevent — a co-started drug letting the
 * diet silently take credit — so the concurrent-change data is computed here for the
 * render's "Reading the trend" note.
 */
function buildConcurrentChanges(
  input: ReportInput,
  scope: ReportScope,
  startDayNum: number,
  bucketIndexOfDay: (dn: number) => number,
  /**
   * §3.8's orphan doses — a drug the owner logged with no configured regimen. Added at
   * B-417 PR 7 round 3, because the `vet-report-cold-read` caught the two sources
   * disagreeing on its own artifact: §7.2 named *"Apoquel, afoxolaner (NexGard)
   * overlapped the trial"* while "Reading the trend", eight lines below and attached to
   * the chart the vet is actually looking at, asserted **"One change overlaps this
   * window"**. NexGard had no regimen row, so it never reached this function at all.
   *
   * The general case inverts into a FALSE CLEAN READ on confounding: a patient whose
   * ONLY overlapping intervention is an ad-hoc course gets a trend block saying no
   * change overlaps — in the block a vet trusts precisely because it counts. And the
   * omitted class is not marginal: it is exactly where a mid-trial isoxazoline lands,
   * which for a pruritus endpoint is arguably a larger confound than the antipruritic
   * (flea-allergy dermatitis and sarcoptic mange are the leading differentials, so
   * starting one can resolve itching entirely independent of diet).
   *
   * Its span is first dose → last dose, which is all the record supports and is the same
   * span the trial block uses — so the two now share one notion of "what overlapped".
   */
  unlinkedMedications: readonly UnlinkedMedicationGroup[] = [],
): ConcurrentChange[] {
  const out: ConcurrentChange[] = []
  // An intervention is a concurrent confounder if its ACTIVE SPAN overlaps the window at
  // all — NOT only if it STARTED inside it. A steroid begun before the range and running
  // throughout suppresses exactly the signs the trial measures, so dropping it (the old
  // in-window-start-only gate) let the diet take its credit — adversarial finding A1, the
  // spec §4/B-117 highest-consequence misread. An open-ended (still-active) intervention
  // runs to the window end; one that ENDED before the window never overlaps and is dropped.
  const consider = (kind: InterventionKind, label: string, startDate: string | null, endDate: string | null) => {
    // A NULL startDate = a standing arrangement whose start was never recorded (a free-fed bowl
    // "always down"). Treat it as active from before the window (spanStart -Infinity) so it is
    // never dropped from the confounder note just because its start date is missing (adversarial
    // finding: a null-activeFrom bowl escaped the GP-0 guard). A malformed non-null date bails.
    const startDn = startDate ? dayNumber(startDate) : null
    if (startDate !== null && startDn === null) return
    const spanStart = startDn ?? -Infinity
    const activeEndDn = endDate ? dayNumber(endDate) : null
    const spanEnd = activeEndDn ?? scope.endDayNum // open-ended → active through the window end
    if (spanStart > scope.endDayNum || spanEnd < scope.startDayNum) return // no overlap with the window
    const startedInWindow = startDn !== null && startDn >= scope.startDayNum && startDn <= scope.endDayNum
    // The end date ONLY when it stopped strictly before the window end — so the render says
    // "until <date>" instead of a false present-tense "ongoing since <start>" (adversarial finding).
    const endInWindow = activeEndDn !== null && activeEndDn < scope.endDayNum ? endDate : null
    out.push({
      kind,
      label,
      startDate,
      // A marker only where there is a real start point in-window; a standing confounder gets none.
      bucketIndex: startedInWindow ? bucketIndexOfDay(startDn as number) : null,
      ongoing: !startedInWindow,
      endInWindow,
    })
  }
  for (const t of input.dietTrials) {
    // B-455. `completed_at` is NULL on an ABANDONED trial, so a trial the owner
    // stopped at day 19 arrived here with no end date, `consider` read the null as
    // "open-ended → active through the window end", and the vet's copy of the report
    // said "the trial diet (Royal Canin HP) — ongoing since 3 June" about a diet the
    // cat came off three weeks ago. §3.1 writes `ended_at` on BOTH outcomes precisely
    // so this reader has an end; it just never selected the column.
    consider('diet_trial', t.foodLabel ?? 'Diet trial', t.startedAt, trialEndValue(t))
  }
  for (const m of input.medications) {
    consider(m.isPrescription === false ? 'supplement' : 'medication', m.drugName, m.startedAt, m.endedAt)
  }
  for (const u of unlinkedMedications) {
    // `lastDate` is the last dose IN WINDOW, so an ongoing ad-hoc course reads as
    // ending at its last logged dose rather than running open-ended. That is the
    // honest direction for a dose-derived span: the record ends where the logging does.
    consider(u.isSupplement ? 'supplement' : 'medication', u.drugName, u.firstDate, u.lastDate)
  }
  for (const a of input.feedingArrangements) {
    // A free-fed arrangement's `activeFrom` is WHEN THE OWNER FIRST LOGGED THE FOOD in the app,
    // NOT when the diet actually started (PM-confirmed, B-233) — the food is typically given well
    // before its first log. Rendering it as a diet that "started <activeFrom>" drew a false
    // mid-window diet-change marker + a "started May 16" note for a standing maintenance diet.
    // So pass a NULL start: the diet is a STANDING confounder present across the window with an
    // unrecorded start (no chart marker, framed as context — not a change). `activeUntil` (a
    // deliberate "stopped feeding this" action) is kept, since a stop IS a real signal.
    if (a.method === 'free_choice') consider('free_fed', a.foodLabel ?? 'Free-fed food', null, a.activeUntil)
  }
  // Explicit total order (matches the determinism discipline of every other sort here) —
  // by start date, then kind, then label, so same-day interventions never depend on push order.
  // A null start sorts first (a standing arrangement of unrecorded, hence earliest, origin).
  out.sort(
    (x, y) => (x.startDate ?? '').localeCompare(y.startDate ?? '') || x.kind.localeCompare(y.kind) || x.label.localeCompare(y.label),
  )
  return out
}



