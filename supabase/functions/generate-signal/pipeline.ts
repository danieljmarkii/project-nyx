// generate-signal — the PURE Signal pipeline (Engines v3 PR-11b, EN-F, CUL-1267).
//
// Rows, the prior cache, a clock value and the Engines flags in; the findings out. No I/O,
// no clock, no environment: index.ts runs the reads, the model calls and the cache write,
// and hands this file what it read. Before this file every step between the reads and the
// phrasing lived inside the handler, so the only way to run the Signal over a scenario was
// a database; the EN-1 harness and the guard corpus (_shared/engineCorpus/) call it
// directly instead.
//
// The code below moved here unchanged from index.ts, in the order it ran there, and the
// existing suites passing (index.test.ts apart from its one source pin, which follows the
// gate to this file) are the refactor proof. Two things are new:
//
//   • `careRecord` is RESERVED. Owner answers and appointment dates are what EN-9's care
//     state is computed from (PR-23), and the critique's AC 10 amendment puts that
//     computation in the engine's shell, never in detection.ts. It is a required input so
//     no caller can forget it (C-37), and nothing below reads it yet: the pipeline's output
//     is independent of it, pinned by signalPipeline.test.ts, which PR-23 flips on purpose.
//     index.ts passes empty lists and makes no read for it.
//   • The stand-down's two halves are split by what they need. The prior row is READ by the
//     shell (a failed read arrives as `prior: null`, which mints nothing: today's wordless
//     vanish), and RESOLVED here, inside the same fence the handler had (a throw costs the
//     marker, never the run). The merge is `assembleSignal`, after the shell has phrased.
//
// Nothing here gates on an Engines key yet (SIGNAL_ENGINE_KEYS is empty); `engineFlags`
// reaches the stand-down gate only. The first Signal phase adds its key and its gated step
// here, and the corpus guard becomes the C-36 absence guard the vomit read has.
//
// The vet report does not use this file: generate-report runs its own detection over its
// own window (report.ts) and never reads the Signal's cache.

import {
  detectSignals,
  detectCoverage,
  stripInternalOnsets,
  computeReflectionDensity,
  computeChronicityCompare,
  doseToMedicationWindow,
  DEFAULT_CONFIG,
  type Finding,
  type CoverageDiagnostic,
  type SymptomEvent,
  type MealEvent,
  type FeedingArrangement,
  type MedicationWindow,
  type SymptomType,
  type IntakeRating,
  type FoodFormat,
  type Species,
  type OccurredAtConfidence,
  type IncidentAnalysisInput,
  type DetectionInput,
  type ReflectionDensity,
  type ChronicityCompare,
  type MedOnBoardContext,
  type PhotoComposition,
} from './detection.ts'
// SR-4 (B-721 §5.4) — the medication-on-board payload decoration. Pure, offline-tested
// (medContext.test.ts); attaches the additive med context + carries the density onto the
// findings AFTER detection, so the engine's output is untouched.
import {
  computeMedOnBoard,
  decorateFinding,
  resolveDrugLabel,
  type MedDoseFact,
} from './medContext.ts'
// L3 (Signals v2 / CUL-9 §2 L3) — photo-record composition evidence decoration. Pure, offline-tested
// (photoComposition.test.ts); attaches retained-food/hair/bile counts (present-only, tristate) onto
// the vomit timing findings AFTER detection, so the engine's output is untouched.
import { computePhotoComposition, type PhotoAnalysisInput } from './photoComposition.ts'
// B-422's effective end, from the ONE module that owns it. Imported across the
// function boundary exactly as `./protein.ts` already re-exports `lib/protein.ts`
// — a second copy of `start + target + grace` living here is the failure mode.
import { isTrialRunning } from '../../../lib/dietTrial.ts'
import { buildBuildingText, curateFindings, templateForFinding, type CachedFinding } from './phrasing.ts'
import {
  mergeStandDowns,
  priorForStandDowns,
  readPriorEntries,
  resolveStandDowns,
  type CachedEntry,
  type StoodDownMarker,
} from './standDown.ts'
import { buildSummaryPacket, summaryTemplate, type CachedSummary, type SummaryFactPacket } from './summary.ts'
// The flag half only: engineFlags.ts has no remote import, so the harness can run this file
// with no network (pipeline.test.ts walks the closure). engineStamps.ts imports supabase-js.
import { SIGNAL_ENGINE_KEYS, standDownMintAllowed, type EngineFlags } from '../_shared/engineFlags.ts'

const MS_PER_DAY = 86_400_000

// ── DB → DetectionInput mapping ───────────────────────────────────────────────

export interface SymptomRow {
  id: string
  event_type: string
  occurred_at: string
  occurred_at_confidence: string | null
  severity: number | null
}

export type FoodItemJoin = {
  primary_protein: string | null
  // B-351 slice 1's captured set. Detection reads it through readProteinSet, which
  // hoists primary_protein to position 0 — so a legacy row where the column is still
  // NULL/empty degrades to exactly today's single-protein behavior.
  proteins: string[] | null
  food_type: string | null
  // B-102 PR 5: physical-form enum. Read so detection can derive the human-food provenance
  // covariate (computeHumanFoodProvenance); ignored by every existing detector.
  format: string | null
  brand: string
  product_name: string
}
export type MealJoin = {
  food_item_id: string | null
  intake_rating: string | null
  food_items: FoodItemJoin | FoodItemJoin[] | null
}
export interface MealEventRow {
  id: string
  occurred_at: string
  occurred_at_confidence: string | null
  meals: MealJoin | MealJoin[] | null
}

export function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function mapSymptomRows(rows: SymptomRow[]): SymptomEvent[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.event_type as SymptomType,
    occurredAt: r.occurred_at,
    // B-010 timestamp confidence (B-078): gates timed-eligibility for the descriptive
    // lane (⑤). NULL/absent ⇒ ignored by ①–④, ineligible for ⑤'s strict witnessed gate.
    occurredAtConfidence: (r.occurred_at_confidence ?? null) as OccurredAtConfidence | null,
    severity: r.severity,
  }))
}

export interface ArrangementRow {
  id: string
  food_item_id: string | null
  created_at: string | null
  is_shared: boolean
  active_from: string | null
  active_until: string | null
  ended_at: string | null
  food_items:
    | { primary_protein: string | null; proteins: string[] | null }
    | { primary_protein: string | null; proteins: string[] | null }[]
    | null
}

// Map active free_choice arrangements to standing exposures (B-040 R1, PR 4). Only
// free_choice rows are fetched (meal_fed is vet-report metadata, not a standing
// exposure — its intake IS the discrete meal stream). is_shared → 'low' attribution
// (multi-cat shared bowl, deferred); in R1 is_shared is always FALSE → 'high'
// (single-pet free-fed: no other pet could have eaten it). Forward-compatible for free.
export function mapArrangementRows(rows: ArrangementRow[]): FeedingArrangement[] {
  return rows.map((r) => {
    const fi = first(r.food_items)
    return {
      id: r.id,
      primaryProtein: fi?.primary_protein ?? null,
      // B-351 slice 6 — every protein a standing bowl carries is uncontrolled background.
      proteins: fi?.proteins ?? null,
      activeFrom: r.active_from,
      activeUntil: r.active_until,
      attributionConfidence: r.is_shared ? 'low' : 'high',
      // CUL-1086 — the intake lane tells a bowl's rating from a watched meal by instant: the
      // toggle-on (`created_at`) and the toggle-off (`ended_at`, migration 076).
      foodItemId: r.food_item_id,
      createdAt: r.created_at,
      endedAt: r.ended_at,
    }
  })
}

// ── Medication confounder windows (B-117 PR 9, §8) ────────────────────────────
// Two DB shapes resolve to one MedicationWindow span set (see detection.ts):
//   • a `medications` regimen row → a continuous span [started_at, ended_at].
//   • an administered `medication` dose event → a POINT at occurred_at.
// Both run with the caller's JWT, so medications_owner / medication_administrations_owner
// RLS scope them to the owner's pets — no service role, like every other read here.

export interface RegimenRow {
  // SR-4 (§5.4): `id` + `drug_name` are read so an administered dose linked to this regimen
  // can be named ("{drug} course"). drug_name is NOT NULL on the regimen (migration 020),
  // the reliable owner-facing label; both are inert to the confounder pass.
  id: string
  drug_name: string
  medication_item_id: string | null
  started_at: string | null // DATE; parses to that day's UTC midnight = start-of-day (correct span start)
  ended_at: string | null // DATE; the drug is on board through the WHOLE day → end-of-day-inclusive below
}

export type MedItemJoin = { generic_name: string | null; brand_name: string | null }
export type MedAdminJoin = {
  // SR-4 (§5.4): `medication_id` links the dose to its regimen (→ drug_name); the nested
  // `medication_items` names an ad-hoc / regimen-unlinked dose (brand, else generic). Both
  // are label sources for the med-on-board context, inert to the confounder pass.
  medication_id: string | null
  medication_item_id: string | null
  medication_items: MedItemJoin | MedItemJoin[] | null
  adherence: string | null
  // B-156 PR C1: the meal/treat event this dose rode inside (a pill in a Delectable), or null
  // for a standalone dose. Migration 023; nullable FK → events(id). Used to (a) attribute the
  // vehicle food to the drug and (b) reconcile an in-doubt combo dose's on-board status (B-174).
  paired_event_id: string | null
}
export interface MedDoseEventRow {
  occurred_at: string
  medication_administrations: MedAdminJoin | MedAdminJoin[] | null
}

// A regimen's DATE end is inclusive of the whole ended_at day (the pet took it that day), so
// push activeUntil to that day's END — mirrors classifyArrangements' free-feeding +1-day. Done
// HERE (not in the engine) because dose windows are precise instants the engine must NOT widen;
// keeping the DATE-vs-timestamp knowledge in the caller lets classifyMedicationWindows stay a
// pure instant-span parser. An unparseable end is passed through raw → the engine drops it.
export function regimenEndIso(endedAt: string | null): string | null {
  if (endedAt == null) return null // still active → on board through now (engine: +Infinity)
  const ms = Date.parse(endedAt)
  if (Number.isNaN(ms)) return endedAt
  return new Date(ms + MS_PER_DAY).toISOString()
}

export function mapMedicationWindows(
  regimens: RegimenRow[],
  doseEvents: MedDoseEventRow[],
  // B-156 PR C1 / B-174: meal/treat event id → its intake rating, for resolving a combo dose's
  // paired vehicle. A vehicle that is soft-deleted or out-of-lookback is simply absent here →
  // the lookup is null → the dose keeps the §5.1 default (the safe, conservative on-board read).
  mealIntakeById: Map<string, IntakeRating | null>,
): MedicationWindow[] {
  const windows: MedicationWindow[] = regimens.map((r) => ({
    medicationItemId: r.medication_item_id,
    activeFrom: r.started_at,
    activeUntil: regimenEndIso(r.ended_at),
  }))
  for (const e of doseEvents) {
    const admin = first(e.medication_administrations)
    if (!admin) continue // a medication event with no child (shouldn't happen — 1:1); nothing to place
    // doseToMedicationWindow DROPS missed/refused (drug not given → not on board), DROPS an
    // unconfirmed combo dose whose vehicle was refused/picked (B-174 — carrier not eaten → drug
    // not delivered), and returns a point window for the rest. The clinically load-bearing
    // filter lives in that pure, tested helper, never inline here.
    const pairedVehicleIntake = admin.paired_event_id
      ? (mealIntakeById.get(admin.paired_event_id) ?? null)
      : null
    const w = doseToMedicationWindow({
      medicationItemId: admin.medication_item_id,
      occurredAt: e.occurred_at,
      adherence: admin.adherence,
      pairedVehicleIntake,
    })
    if (w) windows.push(w)
  }
  return windows
}

// SR-4 (§5.4) — the administered, NAMEABLE dose facts for the med-on-board context, built
// from the SAME regimen + dose rows the confounder pass reads. It reuses doseToMedicationWindow
// as the on-board filter, so a fact here is EXACTLY a dose the engine treats as on-board
// (missed / refused / the B-174 in-doubt combo dose all dropped identically — one definition,
// never a second). Each surviving dose is named regimen-first (medication_id → the regimen's
// NOT-NULL drug_name), else by its library item (brand, else generic). A dose that names
// neither is EXCLUDED (it cannot fill "{drug}" — never a blank or guessed name). Empty ⇒
// computeMedOnBoard returns null ⇒ no context line, byte-identical to pre-SR-4.
export function mapMedDoseFacts(
  regimens: RegimenRow[],
  doseEvents: MedDoseEventRow[],
  mealIntakeById: Map<string, IntakeRating | null>,
): MedDoseFact[] {
  const drugNameByRegimenId = new Map<string, string>()
  for (const r of regimens) {
    if (r.id && r.drug_name) drugNameByRegimenId.set(r.id, r.drug_name)
  }
  const facts: MedDoseFact[] = []
  for (const e of doseEvents) {
    const admin = first(e.medication_administrations)
    if (!admin) continue
    const pairedVehicleIntake = admin.paired_event_id
      ? (mealIntakeById.get(admin.paired_event_id) ?? null)
      : null
    const onBoard = doseToMedicationWindow({
      medicationItemId: admin.medication_item_id,
      occurredAt: e.occurred_at,
      adherence: admin.adherence,
      pairedVehicleIntake,
    })
    if (!onBoard) continue // not administered / not on board — never named as a logged dose
    const item = first(admin.medication_items)
    const label = resolveDrugLabel(
      admin.medication_id ? drugNameByRegimenId.get(admin.medication_id) : undefined,
      item?.generic_name,
      item?.brand_name,
    )
    if (!label) continue // unnameable — excluded from the context
    facts.push({ occurredAt: e.occurred_at, drugLabel: label })
  }
  return facts
}

// `pairedEventIds` = the set of meal/treat event ids that are the VEHICLE for a live (non-soft-
// deleted) medication dose (B-156 PR C1). A meal in this set is the drug's carrier, so detection
// attributes its protein to the drug rather than crediting it as a food correlate. Empty (no
// combos logged) ⇒ no meal is flagged ⇒ byte-identical to pre-B-156 behavior.
export function mapMealRows(rows: MealEventRow[], pairedEventIds: Set<string>): MealEvent[] {
  return rows.map((r) => {
    const meal = first(r.meals)
    const fi = first(meal?.food_items)
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      // B-156 PR C1: this meal/treat carried a co-logged dose → attribute it to the drug.
      isMedicationVehicle: pairedEventIds.has(r.id),
      // B-010 timestamp confidence (B-078): a feeding is timed-eligible when 'witnessed'
      // OR NULL (meals are inherently witnessed; legacy NULL carries the same semantics).
      occurredAtConfidence: (r.occurred_at_confidence ?? null) as OccurredAtConfidence | null,
      foodItemId: meal?.food_item_id ?? null,
      primaryProtein: fi?.primary_protein ?? null,
      // B-351 slice 6 — the food's FULL captured protein set, so a hidden secondary
      // (the chicken in a "duck" formula) enters the case-crossover exposure set
      // instead of being dropped on the floor. NULL/absent degrades to the primary.
      proteins: fi?.proteins ?? null,
      intakeRating: (meal?.intake_rating ?? null) as IntakeRating | null,
      foodType: (fi?.food_type ?? null) as 'meal' | 'treat' | 'other' | null,
      // B-102 PR 5: feeds the human-food provenance covariate. Not yet surfaced anywhere
      // (no card — requirements §7); detectors ①–⑥ ignore it, so this is inert to the live
      // Signal today. The covariate (computeHumanFoodProvenance) is exported + tested for a
      // future detector / the Step-9 vet report to consume.
      format: (fi?.format ?? null) as FoodFormat | null,
      foodLabel: fi ? `${fi.brand} ${fi.product_name}`.trim() : null,
      // attributionConfidence omitted → 'high' (today's per-pet logging
      // semantics). B-040 will supply 'low' for shared / free-fed bowls.
    }
  })
}

// ── Per-incident visual red flags (B-340) ─────────────────────────────────────
// The Home safety-lane input for a blood / foreign-material flag the owner photographed. Read from
// event_ai_analysis (RLS-scoped by the caller's JWT, like every read here — the row's own
// event_ai_analysis_owner policy), INNER-joined to events so we get the incident's occurred_at AND
// enforce the two contracts the pure engine relies on: the analyzed event must be NON-soft-deleted
// (deleted_at IS NULL) and within the lookback. We filter to the analysed incident families —
// 'vomit' (B-340) and the two stool event types 'stool_normal' / 'diarrhea' (B-364, migration 034).
// We do NOT filter on status or on the cached visual_flags/recommendation — the engine DERIVES the
// flag from the owner-editable structured fields (blood_present for vomit, stool_blood_present for
// stool, foreign_material_present shared), which is exactly what makes an owner override clear the
// Home card by construction (B-339). Absent rows ⇒ [] ⇒ the detector is silent.
export type IncidentEventJoin = { occurred_at: string } | { occurred_at: string }[] | null
export interface IncidentAnalysisRow {
  event_id: string
  incident_type: string
  status: string // async pipeline state — L3 (CUL-9) reads only 'completed'; the red-flag lane ignores it
  blood_present: string | null // vomit blood (vomit_blood)
  stool_blood_present: string | null // stool blood (stool_tristate, migration 034) — B-364
  foreign_material_present: string | null // shared across families (013)
  contents: string[] | null // vomit_content[] — L3 hair/retained-food (CUL-9); null on non-vomit / illegible
  bile_present: string | null // vomit_tristate — L3 bile (CUL-9); the authoritative bile field (013)
  events: IncidentEventJoin
}

export function mapIncidentAnalyses(rows: IncidentAnalysisRow[]): IncidentAnalysisInput[] {
  const out: IncidentAnalysisInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev?.occurred_at) continue // no joined (non-deleted, in-window) event → skip defensively
    out.push({
      eventId: r.event_id,
      incidentType: r.incident_type, // raw ('vomit'|'stool_normal'|'diarrhea'); the engine maps → family
      occurredAt: ev.occurred_at,
      bloodPresent: r.blood_present, // read only for the vomit family
      stoolBloodPresent: r.stool_blood_present, // read only for the stool family (B-364)
      foreignMaterialPresent: r.foreign_material_present,
    })
  }
  return out
}

/**
 * L3 (CUL-9) — project the SAME event_ai_analysis rows into the photo-composition input. Separate
 * from mapIncidentAnalyses so the red-flag lane's projection stays clean (blood/foreign only); this
 * one carries the completed/vomit gate's raw material (status + contents + the authoritative bile
 * field) and the parsed occurred ms. computePhotoComposition applies the completed/vomit filter, so
 * this maps every row; a row with no joined event is skipped defensively (occurredMs would be NaN).
 */
export function mapPhotoAnalyses(rows: IncidentAnalysisRow[]): PhotoAnalysisInput[] {
  const out: PhotoAnalysisInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev?.occurred_at) continue
    out.push({
      occurredMs: Date.parse(ev.occurred_at),
      status: r.status,
      incidentType: r.incident_type,
      contents: r.contents,
      bilePresent: r.bile_present,
    })
  }
  return out
}

// ── The input contract ────────────────────────────────────────────────────────

// The active diet trial row (`diet_trials`, status 'active', limit 1).
export interface ActiveTrialRow {
  started_at: string
  target_duration_days: number
}

// The reads, exactly as PostgREST returns them to index.ts (each `data ?? []`). Every
// soft-delete and lookback filter is the QUERY's (detection's documented contract, and
// detectionSoftDelete.test.ts reads the queries in index.ts); this file trusts it.
export interface SignalRows {
  pet: { name: string; species: string }
  symptoms: SymptomRow[]
  meals: MealEventRow[]
  activeTrials: ActiveTrialRow[]
  arrangements: ArrangementRow[]
  // The owner's IANA zone (`user_profiles.timezone`). Null or empty ⇒ detector ⑥ is silent.
  timezone: string | null
  regimens: RegimenRow[]
  doseEvents: MedDoseEventRow[]
  incidentAnalyses: IncidentAnalysisRow[]
}

// The previous cache row (`findings`, `generated_at`, `engine_flags`), as read back and
// untyped. Null when there is none OR the read failed: both mint no stand-down.
export interface PriorSignal {
  findings: unknown
  generatedAt: unknown
  engineFlags: unknown
}

// RESERVED for EN-9's care state (PR-23); read by nothing yet. Only the fields that are
// certain today: a dated owner answer about one finding (the critique's D3 restated: an
// append-only fact per sign, keyed on the finding's identity), and the appointment's own
// columns from 066. PR-21 designs the answer's table and widens OwnerAnswerFact.
export interface OwnerAnswerFact {
  findingKey: string
  answeredAt: string
}
export interface AppointmentFact {
  id: string
  scheduledAt: string
  cancelledAt: string | null
  vetVisitId: string | null
}
export interface CareRecord {
  ownerAnswers: readonly OwnerAnswerFact[]
  appointments: readonly AppointmentFact[]
}

export interface SignalPipelineInput {
  rows: SignalRows
  prior: PriorSignal | null
  nowMs: number
  engineFlags: EngineFlags
  careRecord: CareRecord
}

export interface RankedFinding {
  rank: number
  finding: Finding
}

export interface SignalPipelineResult {
  petName: string
  // What detection ran on (the harness's view of the mapping).
  input: DetectionInput
  // Curated, decorated and stripped, in rank order: what the shell phrases, one each.
  findings: RankedFinding[]
  summaryPacket: SummaryFactPacket | null
  // Empty findings = building/stale (§3.3), NEVER an all-clear (§9).
  isBuilding: boolean
  hasRecentActivity: boolean
  coverage: CoverageDiagnostic[]
  standDowns: StoodDownMarker[]
  // The message when resolving the stand-downs threw; the run keeps its findings and
  // writes no marker. The shell logs it.
  standDownError: string | null
}

// ── The pipeline ──────────────────────────────────────────────────────────────

export function runSignalPipeline(args: SignalPipelineInput): SignalPipelineResult {
  const { rows, prior: priorSignal, nowMs, engineFlags } = args
  const petName = rows.pet.name || 'your pet'

  const mealRows = rows.meals
  const doseRows = rows.doseEvents
  // B-156 PR C1 — the dose↔vehicle pairing, derived ONCE from the two already-fetched,
  // RLS-scoped, non-soft-deleted sets. A dose's `paired_event_id` names the meal/treat event
  // it rode inside. Two uses below, both keyed off this one join:
  //   • `pairedEventIds` → which meals are drug vehicles (attribute the food to the drug).
  //   • `mealIntakeById` → the vehicle's intake, to reconcile an in-doubt combo dose (B-174).
  // No combos logged ⇒ both empty ⇒ detection behaves exactly as before B-156.
  const pairedEventIds = new Set<string>()
  for (const e of doseRows) {
    const pid = first(e.medication_administrations)?.paired_event_id
    if (pid) pairedEventIds.add(pid)
  }
  const mealIntakeById = new Map<string, IntakeRating | null>()
  for (const r of mealRows) {
    mealIntakeById.set(r.id, (first(r.meals)?.intake_rating ?? null) as IntakeRating | null)
  }

  const symptomEvents = mapSymptomRows(rows.symptoms)
  const mealEvents = mapMealRows(mealRows, pairedEventIds)
  const arrangementRows = rows.arrangements
  const feedingArrangements = mapArrangementRows(arrangementRows)
  // Foods CURRENTLY free-fed (active_until IS NULL) — the §11 #6 exclusion set for the
  // summary's finished-rate. Matches the client's getActiveArrangementsForPet definition
  // (free_choice + active_until IS NULL + not deleted) so the dashboard card and the
  // summary agree on which foods' intake isn't directly observed.
  const freeFedFoodIds = new Set<string>(
    arrangementRows.filter((r) => r.active_until === null && r.food_item_id).map((r) => r.food_item_id as string),
  )
  // B-079 (⑥): the owner's IANA timezone. A non-string / empty value ⇒ undefined ⇒ ⑥ silent.
  const timezone = rows.timezone || undefined
  // B-422 — `dietTrialActive` MEANS "on a diet trial today", and `status =
  // 'active'` stopped meaning that the moment nothing auto-completed a trial.
  //
  // What this flag buys is entirely suppression and promotion: it fully mutes
  // detectors ⑧ staple-washout, ⑨ meal-type-collapse and ⑩ diet-churn (each
  // correctly — during a trial the constant staple IS the elimination diet, and
  // telling the owner to vary it sabotages the trial), and it promotes
  // `food_symptom_correlation` to band 1. Read off a trial that finished in
  // March, all four of those are wrong in the same direction: the engine stays
  // quiet about a real dietary pattern, and leads with a weak correlation,
  // forever. A stale flag here does not produce a wrong sentence — it produces
  // a permanently missing one, which is why it went unnoticed.
  //
  // The zone is the owner's, matching every other day boundary in this function
  // (§5.1 / B-421); absent ⇒ the shared helper's own UTC fallback, which is the
  // same posture `dietTrialStatus` takes — a day counter off by one beats no
  // answer.
  const trialRow = rows.activeTrials[0]
  const dietTrialActive =
    trialRow !== undefined &&
    isTrialRunning(
      { startedAt: trialRow.started_at, targetDurationDays: trialRow.target_duration_days },
      nowMs,
      timezone,
    )
  // B-117 PR 9 (§8): medication confounder windows — regimen spans + administered dose points.
  // Empty (no meds logged) ⇒ detectCorrelations behaves exactly as before.
  const regimenRows = rows.regimens
  const medicationWindows = mapMedicationWindows(regimenRows, doseRows, mealIntakeById)
  // SR-4 (§5.4): the med-on-board context's dose facts — administered, nameable doses from
  // the SAME rows above. Purely additive; nothing here feeds detection.
  const medDoseFacts = mapMedDoseFacts(regimenRows, doseRows, mealIntakeById)
  // B-340: per-incident visual red-flag inputs (vomit blood / foreign material), derived
  // downstream from the owner-editable structured fields. Empty ⇒ the red-flag lane is silent.
  const incidentAnalysisRows = rows.incidentAnalyses
  const incidentAnalyses = mapIncidentAnalyses(incidentAnalysisRows)
  // L3 (CUL-9): the photo-composition projection of the same rows — completed VOMIT reads only
  // (the filter lives in computePhotoComposition). Empty ⇒ no timing card carries composition.
  const photoAnalyses = mapPhotoAnalyses(incidentAnalysisRows)

  // 2. Detect — the pure engine ranks already-true findings (safety leads).
  const input: DetectionInput = {
    pet: { name: petName, species: rows.pet.species as Species, dietTrialActive },
    symptomEvents,
    mealEvents,
    feedingArrangements,
    medicationWindows,
    incidentAnalyses,
    // Signals v2 (CUL-8) — the active trial for the L2 trial-response lane. The SAME row
    // `dietTrialActive` is derived from (id/started_at/target_duration_days), passed through so the
    // lane can place its trial-era-vs-baseline windows and count "day N of M". The detector
    // re-checks `isTrialRunning` itself (the one predicate) — passing the row when it exists, and
    // letting the lane gate, keeps the trial-active flag and the lane on ONE definition. Absent
    // (no active trial) ⇒ the lane is silent, byte-identical to pre-CUL-8.
    dietTrial: trialRow
      ? { startedAt: trialRow.started_at, targetDurationDays: trialRow.target_duration_days }
      : undefined,
    timezone,
    now: new Date(nowMs).toISOString(),
  }
  const ranked = detectSignals(input, DEFAULT_CONFIG)

  // 3. Curate — cap the insight tail; safety findings always kept.
  const curated = curateFindings(ranked)

  // 3b. Decorate (SR-4, B-721 §5.4 + §3.3) — attach the additive payload to the curated
  //     findings BEFORE phrasing, so templateReflection sees the falling-comparison density
  //     gate and each cached finding carries medContext for the client (SR-5). Both facts are
  //     computed POST-detection from data already in hand: the density from the same events
  //     the reflection detector reads, the med context from the same medication rows the
  //     confounder pass reads. `ranked` is untouched — nothing here changes what fires or how
  //     it ranks (§11 AC). A null density / medContext leaves the finding unchanged.
  const reflectionDensity: ReflectionDensity | null = computeReflectionDensity(input, DEFAULT_CONFIG)
  const medOnBoard: MedOnBoardContext | null = computeMedOnBoard(nowMs, medDoseFacts)
  const decoratedWithOnsets = curated.map((r) => {
    // L3 (CUL-9): photo composition is PER-FINDING (each vomit timing finding has its own window +
    // long-episode set), unlike the once-per-regen density/medContext, so it is computed here inside
    // the map. It reads the finding's `longEpisodeOnsets` for the retained-food join, which is why
    // detectSignals leaves the onsets in place (see its note) and the strip happens just below. Null
    // for every non-timing finding and whenever no marker was seen (present-only).
    const photoComposition: PhotoComposition | null = computePhotoComposition(
      r.finding,
      photoAnalyses,
      nowMs,
    )
    // v1.1-b (CUL-787): the counted 4-week halves of ⑦'s lookback, PER chronicity finding (each
    // has its own symptom type), computed from the same events the detector read. Attached here,
    // after detection, so the valve that mutes ③ while ⑦ fires is untouched — the change an
    // easing course shows lives inside the safety card's expand, never as a second calm card.
    const chronicityCompare: ChronicityCompare | null =
      r.finding.type === 'symptom_chronicity'
        ? computeChronicityCompare(input, r.finding.symptomType, DEFAULT_CONFIG)
        : null
    return {
      rank: r.rank,
      finding: decorateFinding(
        r.finding,
        reflectionDensity,
        medOnBoard,
        photoComposition,
        chronicityCompare,
      ),
    }
  })
  // Strip the internal onset arrays now that BOTH consumers have run — the episode-set-aware
  // suppression (inside detectSignals) and L3's retained-food join (just above). This is
  // detectSignals's old final step, relocated here (CUL-9) because L3 needs the onsets alive through
  // decoration; it keeps the raw per-episode timestamps out of the phrasing / cache / HTTP layer
  // (CUL-7 finding ②), including the copy that rides on a merged timing_story's `long` block.
  const strippedFindings = stripInternalOnsets(decoratedWithOnsets.map((r) => r.finding))
  const decorated = decoratedWithOnsets.map((r, i) => ({ rank: r.rank, finding: strippedFindings[i] }))

  // 4a. AI summary (B-023 PR 4). Assemble a DETERMINISTIC fact packet from the curated
  //     findings + the descriptive intake aggregates (computed over the same in-memory
  //     meal/symptom arrays — no second DB read), which the shell phrases (Haiku join-and-smooth,
  //     validateSummary-gated, deterministic template fallback). Null when nothing is
  //     substantive — the client then renders its own "still gathering" state. Reads only
  //     the cards' data, so it is grounded in what the dashboard shows.
  const summaryPacket = buildSummaryPacket({
    petName,
    findings: curated.map((r) => r.finding),
    mealEvents,
    symptomEvents,
    freeFedFoodIds,
    nowMs,
  })

  // 5. Cache. Empty findings = building/stale (§3.3), NEVER an all-clear (§9).
  const isBuilding = decorated.length === 0
  const hasRecentActivity = [...symptomEvents, ...mealEvents].some(
    (e) => nowMs - Date.parse(e.occurredAt) <= 2 * MS_PER_DAY,
  )

  // Coverage diagnostics (B-053) — the "why no signal yet?" reasons. We compute
  // them whenever there are NO findings (isBuilding); the server cannot know which
  // empty-state the client will derive (building/no_pattern/stale needs the local
  // hasSubstantialHistory the server doesn't have), so it caches coverage for any
  // empty result and the CLIENT renders the top diagnostic only on no_pattern. The
  // detectors are individually safe on a truly-empty pet (rate_meals needs ≥1 meal,
  // staple_washout needs a single protein + symptoms), so a pure building pet
  // yields []. Per §9 these describe DATA COVERAGE, never wellness.
  const coverage: CoverageDiagnostic[] = isBuilding ? detectCoverage(input, DEFAULT_CONFIG) : []

  // 5b. The labeled stand-down (CUL-786): mint a marker for a chronicity course that
  //     stopped on its recency floor with logging held across the gap (standDown.ts
  //     carries the four conditions). The prior row is the only memory the engine has of
  //     what the card said last time; the shell read it before this run. `isBuilding`,
  //     the summary packet and the headline are computed over the REAL findings and stay
  //     byte-identical; only the cached array gains the marker, in the card's former slot
  //     (assembleSignal). An older client renders the unknown type as nothing (the G10 pin).
  //     Fenced (code review, 2026-09-03): a throw here must cost the marker, never the
  //     regen, or the pet's Signal blanks over a bug in the one part of the payload that is
  //     decoration on the record rather than the record.
  let standDowns: StoodDownMarker[] = []
  let standDownError: string | null = null
  try {
    let prior: ReturnType<typeof readPriorEntries> = []
    let priorGeneratedAtMs: number | null = null
    if (priorSignal) {
      prior = priorForStandDowns(
        readPriorEntries(priorSignal.findings),
        standDownMintAllowed(priorSignal.engineFlags, engineFlags, SIGNAL_ENGINE_KEYS),
      )
      const gen = Date.parse(String(priorSignal.generatedAt ?? ''))
      priorGeneratedAtMs = Number.isFinite(gen) ? gen : null
    }
    standDowns = resolveStandDowns({
      prior,
      priorGeneratedAtMs,
      current: curated.map((r) => r.finding),
      input,
      config: DEFAULT_CONFIG,
      nowMs,
    })
  } catch (err) {
    standDowns = []
    standDownError = err instanceof Error ? err.message : String(err)
  }

  return {
    petName,
    input,
    findings: decorated,
    summaryPacket,
    isBuilding,
    hasRecentActivity,
    coverage,
    standDowns,
    standDownError,
  }
}

// ── After the phrasing ────────────────────────────────────────────────────────

export interface SignalPayload {
  signalText: string
  isBuilding: boolean
  findings: CachedEntry[]
  coverage: CoverageDiagnostic[]
  summary: CachedSummary | null
  // Why this row carries no marker it should have: resolving the stand-downs or merging them
  // threw. Null when neither did. Not written to the row; the shell logs it (no silent
  // failures), as the handler's single fence did before the split.
  standDownError: string | null
}

// The cache row's content, from the pipeline's result and the shell's phrasing: `texts[i]`
// is the sentence for `result.findings[i]`. The stand-down merge is fenced as it was in the
// handler: a throw writes the findings without a marker.
export function assembleSignal(
  result: SignalPipelineResult,
  texts: readonly string[],
  summary: CachedSummary | null,
): SignalPayload {
  if (texts.length !== result.findings.length) {
    throw new Error(`assembleSignal: ${texts.length} texts for ${result.findings.length} findings`)
  }
  const cachedFindings: CachedFinding[] = result.findings.map((r, i) => ({
    rank: r.rank,
    text: texts[i],
    finding: r.finding,
  }))
  const signalText = result.isBuilding
    ? buildBuildingText(result.petName, result.hasRecentActivity)
    : cachedFindings[0].text
  let entries: CachedEntry[] = cachedFindings
  let standDownError = result.standDownError
  if (standDownError === null) {
    try {
      entries = mergeStandDowns(cachedFindings, result.standDowns, result.petName)
    } catch (err) {
      entries = cachedFindings
      standDownError = err instanceof Error ? err.message : String(err)
    }
  }
  return { signalText, isBuilding: result.isBuilding, findings: entries, coverage: result.coverage, summary, standDownError }
}

// Every card's deterministic sentence: what the shell writes when the model is off, fails
// or is skipped (phraseFinding's fallback). For the harness, which never calls a model.
export function templateTexts(result: SignalPipelineResult): string[] {
  return result.findings.map((r) => templateForFinding(r.finding, result.petName))
}

// The summary's deterministic form: what phraseSummaryText returns whenever it does not
// use the model (every run today: SUMMARY_MODEL_PHRASING_ENABLED is false).
export function templateSummary(packet: SummaryFactPacket): CachedSummary {
  return {
    evidence: packet.evidence,
    hasSafety: packet.hasSafety,
    quiet: packet.quiet,
    text: summaryTemplate(packet),
    source: 'template',
  }
}

// The whole cache row with no model: the harness's view of what Home is handed.
export function templatePayload(result: SignalPipelineResult): SignalPayload {
  return assembleSignal(
    result,
    templateTexts(result),
    result.summaryPacket ? templateSummary(result.summaryPacket) : null,
  )
}
