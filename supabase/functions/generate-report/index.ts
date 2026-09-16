// Supabase Edge Function — generate-report  (Step 9, Phase 2 PR 5)
//
// The vet-report generator. Mirrors the generate-signal split so the load-bearing
// logic is offline-unit-testable and this file is a thin I/O shell:
//   • report.ts   — pure assembly  (rows + window → structured ReportSnapshot)
//   • render.ts   — pure render    (snapshot → canonical clinical HTML)
//   • index.ts    — THIS FILE      (auth, ownership guard, row pull, response)
//
// PR 5 is the OWNER-FACING MVP: an AUTHENTICATED call returns the rendered HTML,
// which the app shows in an in-app WebView and hands to the vet as a PDF via the
// native share sheet. There is deliberately NO public token / no unauthenticated
// path and NO Storage WRITE here — the immutable snapshot row and the public
// `view-report` route are PR 6 (the first unauthenticated path). PR 7 adds the §8
// incident photos to THIS authenticated flow (all photos baked into the report + PDF),
// gated by rls-privacy-reviewer.
//
// SECURITY — confused-deputy guard (spec §7/§8). The client stub sends a body
// `petId` (a live trap). We NEVER trust it beyond what the caller's own JWT
// authorizes: every DATA read runs through a user-scoped client, so RLS enforces pet
// ownership on every table — exactly like generate-signal. The explicit pet load
// is the ownership re-check (RLS returns nothing for a pet the caller doesn't own
// → 404).
//
// PR 7 introduces a service-role client used SOLELY to download incident-photo BYTES
// from the private nyx-event-attachments bucket. Every path it downloads is drawn ONLY
// from the user-scoped, RLS-gated `event_attachments` enumeration of the ALREADY-verified
// owner's pet (RLS binds each row to `pet_id IN (owner's pets)`; ownership is re-checked →
// 404 before the pull) — never a request-supplied path. NB the RLS binds the attachment
// ROW to the pet, not the free-text `storage_path` column to a `${pet_id}/` prefix, so the
// path itself is not cryptographically pet-bound; today that is not exploitable (paths are
// 3×UUIDv4 and unguessable, and the bucket's own read policy is already broader), but a
// prefix-binding CHECK is a backlog hardening (rls-privacy-reviewer, PR 7). Photos are
// fetched through the EXIF-stripping/downscaling image transform (never the raw original)
// and embedded as data: URIs; NO signed URL is minted or persisted, and there is still NO
// Storage write. The service-role Storage WRITE (immutable snapshot) arrives in PR 6.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assembleReport,
  resolveScope,
  type ReportInput,
  type ReportScope,
  type ReportPetInput,
  type ReportEventInput,
  type ReportMealDetail,
  type ReportAiAnalysisInput,
  type ReportWeightCheckInput,
  type ReportDoseInput,
  type ReportMedicationInput,
  type ReportMedicationItemInput,
  type ReportDietTrialInput,
  type ReportVetVisitInput,
  type ReportFeedingArrangementInput,
  type ReportConditionInput,
  type ReportAttachmentInput,
  type IncidentPhoto,
  type ReportAudience,
  type ReportLookInput,
  TRIAL_ANCHOR_GRACE_DAYS,
} from './report.ts'
import { renderReport } from './render.ts'
// B-613 — the ONE "which trial is this report about?" predicate. Imported rather than
// re-implemented so the pull is stretched for exactly the trial the block describes; two
// copies of this test are what once anchored a window on an abandoned trial.
import { selectReportTrial, trialAllowedListMissing } from './trial.ts'
// B-568 — the same format-label map the app and report.ts render from (one copy,
// two runtimes; a duplicate map here is the B-103 drift class).
import { foodFormatWord } from '../../../lib/foodFormat.ts'
import { resolveIanaZone } from '../../../lib/utils.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MS_PER_DAY = 86_400_000
// Baseline event lookback — matches generate-signal (§ enough for an Established
// correlation + the detection engine's natural sub-windows).
const BASE_LOOKBACK_DAYS = 180
// Extra history pulled BEFORE the resolved window start so (a) a custom window's
// cherry-pick disclosure can count out-of-window symptom events that precede it,
// and (b) a since-visit window older than BASE_LOOKBACK_DAYS is still fully
// covered. report.ts scopes everything to the window itself; this only guarantees
// the pull is a superset of what assembly needs.
const CHERRY_PICK_LOOKBACK_DAYS = 90
// B-613 — how far past the window start the pull may be stretched to reach the START of
// the trial this report describes, so the trial-crop symptom count is a total rather than
// a floor. Capped, because the trial that needs it most is also the one that can be
// arbitrarily old: nothing auto-completes a trial (B-422), so a stale-active row from two
// years ago is the STEADY STATE, and an uncapped stretch would turn one forgotten trial
// into a two-year event pull on a `since_visit` report whose window is a fortnight.
//
// Past the cap the count does not become wrong, it becomes a FLOOR and says so — which is
// the trade this number encodes: a bounded query with an honest sentence, never an
// unbounded query for a complete one.
const TRIAL_CROP_LOOKBACK_CAP_DAYS = 400

// ── PR 7 — incident-photo embedding (spec §8 / AC-7) ─────────────────────────────
// Photos are fetched server-side, EXIF/GPS-stripped + downscaled via Supabase Storage image
// transforms (imgproxy), and base64-embedded into the report HTML (and thus the on-device PDF).
// TWO load-bearing invariants:
//  1. The transform RE-ENCODE is what strips EXIF/GPS. So we fetch ONLY through the transform and
//     NEVER fall back to the raw original (a raw download carries the camera's GPS tags — a location
//     leak). A transform failure ⇒ null ⇒ the render shows an honest placeholder, never raw bytes.
//  2. The bytes go straight into a `data:` URI — no signed URL is ever minted or persisted into the
//     stored snapshot, so there is no long-TTL URL to outlive expiry/revocation (AC-7).
const PHOTO_EMBED_EDGE_PX = 1000 // report-figure resolution — ample clinical detail, ~⅓ the analyze-vomit vision size
const PHOTO_EMBED_QUALITY = 72
// A downscaled figure is ~100–250 KB; base64 inflates ×4/3. Cap how many are embedded so a very
// large photo history can't produce a multi-tens-of-MB response/PDF. Safety-flagged photos are
// embedded FIRST and never dropped; anything beyond the cap renders as a DISCLOSED placeholder
// (never silently missing — the appendix preamble states the count). Realistic windows are well below.
const MAX_EMBEDDED_PHOTOS = 40
// Same base64 ceiling analyze-vomit uses (isolate memory + a sane per-image cap). A 1000px figure is
// comfortably under it; anything over is skipped (placeholder), never embedded raw.
const MAX_EMBED_IMAGE_BYTES = 3_900_000

/**
 * How many look rows one report pulls.
 *
 * Below Supabase's default PostgREST `max-rows` (1000) ON PURPOSE: a cap at or above the
 * server's own ceiling is undetectable — the query would come back short of the cap while
 * still being truncated, and `pullComplete` would claim a completeness nobody verified.
 * Under it, a full page is unambiguous.
 *
 * 900 answers is about two and a half years at one a day. If it ever binds, nothing on
 * the report becomes wrong: the pull is ordered newest-first, so the window keeps every
 * row it had, and the one sentence that reads further back says "at least" instead of
 * naming a date.
 */
const LOOK_PULL_CAP = 900

/**
 * How many rows one PAGE of a paginated pull asks for (CUL-975).
 *
 * Not a cap on the pull — `fetchAll` below keeps asking until the result set is
 * exhausted — so this is a round-trip size, not a claim about any record.
 *
 * It is deliberately NOT load-bearing for correctness. The obvious trap in a paged
 * reader is a page size at or above the server's PostgREST `max-rows`: every page then
 * comes back short, and a loop that stops on a short page stops on page one believing it
 * read everything. This function cannot observe that setting (the `looks` pull's comment
 * below says so, and the `rls-privacy-reviewer` named it unverifiable from the repo), so
 * `fetchAll` does not depend on the two being ordered: it ADVANCES BY THE NUMBER OF ROWS
 * IT ACTUALLY RECEIVED, which is correct at any server ceiling, and earns completeness
 * from `count: 'exact'` rather than from the page's fullness.
 */
export const PULL_PAGE = 500

/**
 * The most pages `fetchAll` will request for ONE pull — a ceiling on work, not a
 * statement about the record. It bounds `PULL_MAX_PAGES x min(PULL_PAGE, the server's own
 * page)`, NOT `x PULL_PAGE`: at the default ceiling that is 20,000 rows, roughly eight
 * years of the heaviest record we have measured (~7 events a day), but under a `max-rows`
 * of 25 it is 1,000 — and a record above it then reports incomplete, which on a window-
 * cutting shortfall means (a') refuses and the owner gets no report. That is the fail-safe
 * direction and it is also a cliff, so a deliberately low `max-rows` is a decision about
 * this function whether or not anyone setting it knows that.
 *
 * It exists because an Edge Function has a wall clock and a 256 MB isolate, and a loop
 * with no ceiling turns a runaway query into a timeout with no diagnosis. Reaching it is
 * reported as an INCOMPLETE pull and never as a complete one: the whole of CUL-975 is
 * that a truncation the code cannot see is a truncation nobody discloses.
 */
export const PULL_MAX_PAGES = 40

/** The largest positive UTC offset any IANA zone uses (+14:00, Kiritimati). Used to bound
 *  a local day key from below when it has to be compared against stored instants. */
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000

// ── DB row shapes (the raw select results) ────────────────────────────────────

interface PetRow {
  id: string
  name: string
  species: string
  breed: string | null
  sex: string
  date_of_birth: string | null
  date_of_birth_precision?: string | null
  weight_kg: number | string | null
}

// B-351 slice 5 (§9, D10): the join carries the full captured protein SET plus the
// two facts that say whether that set may be read as COMPLETE — the verbatim panel
// text and the extractor's own per-field confidence. `primary_protein` stays (it is
// `proteins[0]` by migration 039's contract) so every pre-existing read is untouched.
// Without the latter two, `proteins = ['duck']` off a marketing-name-only read is
// byte-identical to a duck food whose panel was actually read, and the report would
// serve the first as a clean single-protein diet under a provenance line claiming the
// label was read — reassurance-on-absence on the surface a vet trusts most.
/** The protein-evidence columns, declared ONCE so the row types and the select string
 *  cannot drift apart — three copies of this shape is three chances to widen the query
 *  without widening the type (or the reverse, which reads as a null at runtime). */
type FoodProteinCols = {
  primary_protein: string | null
  proteins: string[] | null
  ingredients_notes: string | null
  ai_extraction_confidence: unknown
}
const FOOD_PROTEIN_COLS = 'primary_protein, proteins, ingredients_notes, ai_extraction_confidence'

type FoodItemJoin = FoodProteinCols & {
  food_type: string | null
  format: string | null
  brand: string
  product_name: string
}
type MealJoin = {
  food_item_id: string | null
  intake_rating: string | null
  quantity: string | null
  food_items: FoodItemJoin | FoodItemJoin[] | null
}
interface EventRow {
  id: string
  event_type: string
  occurred_at: string
  occurred_at_confidence: string | null
  occurred_at_earliest: string | null
  occurred_at_latest: string | null
  severity: number | null
  notes: string | null
  created_at: string
  meals: MealJoin | MealJoin[] | null
}

interface AiAnalysisRow {
  event_id: string
  status: string
  colour: string | null
  contents: string[] | null
  consistency: string | null
  blood_present: string | null
  bile_present: string | null
  foreign_material_present: string | null
  foreign_material_note: string | null
  // Stool AI-read fields (migration 034 / analyze-stool). Null on non-stool rows.
  stool_consistency: string | null
  stool_colour: string | null
  stool_blood_present: string | null
  stool_blood_type: string | null
  stool_mucus_present: string | null
  edited_at: string | null
}

type ParentEventJoin = { occurred_at: string; deleted_at: string | null }

/**
 * A daily-look row (migration 064), joined to its parent for timing + soft-delete.
 *
 * The parent join is NOT optional decoration. After an Undo the child row and the
 * owner's sentence survive at rest with no schema-side signal, and the service role
 * sees them — so `deleted_at` on the parent is the ONLY thing standing between a note
 * the owner took back and a document made for her clinic. Same shape, same reason, as
 * `WeightRow` (the `mapWeightRows` precedent named in the N-1 privacy review).
 */
export interface LookRow {
  event_id: string
  local_day: string
  outcome: string
  words: string[] | null
  notes: string | null
  vocab_version: number | null
  created_at: string
  events: ParentEventJoin | ParentEventJoin[] | null
}

interface WeightRow {
  event_id: string
  weight_kg: number | string
  events: ParentEventJoin | ParentEventJoin[] | null
}

interface DoseRow {
  event_id: string
  medication_id: string | null
  medication_item_id: string | null
  adherence: string | null
  dose_amount: string | null
  paired_event_id: string | null
  events: ParentEventJoin | ParentEventJoin[] | null
}

type MedItemJoin = { is_prescription: boolean | null; strength: string | null }
/** medication_items catalog row (migration 019) — resolves an ad-hoc dose's drug name (§3.8). */
interface MedicationItemRow {
  id: string
  generic_name: string | null
  brand_name: string | null
  strength: string | null
  default_route: string | null
  is_prescription: boolean | null
  /** §5.3 rung 4 (C3) — 'chewable' is the oral-route trial-exposure trigger. */
  form: string | null
}
interface MedicationRow {
  id: string
  medication_item_id: string | null
  drug_name: string
  dose_amount: string | null
  route: string | null
  doses_per_day: number | string | null
  schedule_notes: string | null
  indication: string | null
  prescribed_by: string | null
  started_at: string
  target_duration_days: number | null
  target_duration_doses: number | null // B-618 (migration 049) — dose-denominated fixed course
  status: string
  ended_at: string | null
  medication_items: MedItemJoin | MedItemJoin[] | null
}

/** `diet_trial_foods` (migration 040 §3.2) embedded under its parent trial — the
 *  ALLOWED SET, rung 1 of §5.3. Soft-deleted rows are excluded by the select. */
type DietTrialFoodRow = {
  food_item_id: string
  food_label: string
  role: string
  allowed_from: string
  allowed_until: string | null
  // Narrower than `FoodItemJoin` on purpose: the allowed set needs protein evidence
  // and the §5.4 brand+product identity, and nothing else. `food_type`/`format` are
  // properties of a FEEDING's classification, not of membership — a treat is on the
  // list or it is not, and how the app buckets it changes neither answer.
  food_items: TrialFoodJoin | TrialFoodJoin[] | null
}
type TrialFoodJoin = FoodProteinCols & { brand: string; product_name: string; format: string | null }

interface DietTrialRow {
  id: string
  food_item_id: string | null
  started_at: string
  target_duration_days: number
  status: string
  completed_at: string | null
  // B-455: `ended_at` is written on BOTH completed and abandoned (§3.1) and was
  // never selected, so an abandoned trial reached the report with no end date and
  // rendered as still under way.
  ended_at: string | null
  indication: string | null
  outcome: string | null
  outcome_notes: string | null
  stopped_reason: string | null
  /** §3.1's denormalized display fallback — survives archiving the trial food. */
  food_label: string | null
  vet_name: string | null
  /** B-704 migration 053 — the owner's stored trial protein + when it was set. */
  target_protein: string | null
  target_protein_set_at: string | null
  food_items: FoodItemJoin | FoodItemJoin[] | null
  diet_trial_foods: DietTrialFoodRow[] | null
}

interface VetVisitRow {
  // CUL-975 — selected for `fetchAll`'s de-dupe key, not for the render: `visited_at`
  // is not unique (two visits in one day) and a non-unique key drops live rows.
  id: string
  visited_at: string
  clinic_name: string | null
  vet_name: string | null
  reason: string | null
}

type ArrangementFoodJoin = FoodProteinCols & { brand: string; product_name: string; format: string | null }
interface ArrangementRow {
  id: string
  food_item_id: string
  method: string
  active_from: string | null
  active_until: string | null
  is_shared: boolean
  food_items: ArrangementFoodJoin | ArrangementFoodJoin[] | null
}

interface ConditionRow {
  // CUL-975 — the de-dupe key; nothing else here is unique.
  id: string
  condition_name: string
  status: string
  diagnosed_at: string | null
}

interface AttachmentRow {
  // CUL-975 — the de-dupe key. `event_id` is NOT unique on this table (an incident can
  // carry several photos), so it cannot serve as one.
  id: string
  event_id: string
  storage_path: string
  mime_type: string | null
  sort_order: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Supabase embeds return an object or a single-element array depending on the
 * relationship cardinality — normalise both to the first (or null). */
function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** NUMERIC columns arrive as strings from PostgREST; coerce, preserving null. */
function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * "Brand Product (Form)" for a joined food row, or null when there is nothing to name.
 *
 * B-568 — the form belongs to the NAME. This labels the diet trial's own food and the
 * standing feeding arrangements, and a prescription line stocked in both wet and dry
 * shares brand AND product name — so without the form the report cannot say WHICH
 * variant the trial is actually on, which is the first question §7 answers. Mirrors
 * report.ts's mealFoodLabel so the two naming paths cannot drift apart.
 */
function foodLabel(
  fi: { brand: string; product_name: string; format?: string | null } | null,
): string | null {
  if (!fi) return null
  const name = `${fi.brand} ${fi.product_name}`.trim()
  const form = foodFormatWord(fi.format ?? null)
  if (!name) return form ? form : null
  return form ? `${name} (${form})` : name
}

/**
 * Rows from a query result, or THROW on a query error. A vet report renders as a
 * clinical artifact a vet acts on, so a swallowed query error (RLS misconfig,
 * transient PostgREST fault, an ambiguous embed) that silently becomes "zero rows"
 * would produce a FALSE-CLEAN report — the exact absence≠wellness / n=1-never-
 * reassures failure the report exists to avoid. So every read is checked: a real
 * error surfaces as a 500, never as a quietly empty section. (CLAUDE.md: no silent
 * failures in API calls; the B-196 class of bug re-hardened.)
 */
function rowsOrThrow<T>(res: { data: unknown; error: { message: string } | null }, table: string): T[] {
  if (res.error) throw new Error(`${table} read failed: ${res.error.message}`)
  return (res.data ?? []) as T[]
}

/** One page of a paginated pull — the supabase-js response, narrowed to what the loop
 *  reads. `count` is present because every page below is built with `count: 'exact'`. */
interface PullPage {
  data: unknown
  error: { message: string; code?: string } | null
  count?: number | null
}

/** PostgREST's "Requested range not satisfiable" — returned when a `.range()`'s lower bound
 *  is past the end of the result set. On a paged read that means the set SHRANK under the
 *  cursor, which is a short read, not a fault: the loop stops and the count comparison
 *  below reports the pull incomplete. Everything else still throws. */
function isRangeNotSatisfiable(err: { message: string; code?: string } | null): boolean {
  return err !== null && (err.code === 'PGRST103' || /range not satisfiable/i.test(err.message))
}

/** A pull that knows whether it read everything. `complete` is EARNED (see below); a
 *  consumer that treats absent/false as "the record is short" is reading it correctly. */
export interface Pull<T> {
  rows: T[]
  complete: boolean
}

/**
 * How far back the `events` pull ACTUALLY reached — the floor a count may be spoken over.
 *
 * `lookbackIso` is the floor the query ASKED for. Before CUL-975 the two were the same
 * number, because a truncated pull kept the OLDEST rows and therefore still reached the
 * bottom of its own window. Inverting the truncation direction split them: an incomplete
 * pull now reaches only as far back as its oldest row.
 *
 * `report.ts` derives `countIsFloor` from this, for the sentence whose whole purpose is that
 * a trial-crop count is never "an incomplete answer wearing a complete one's clothes". Hand
 * it the requested floor and that count prints as a TOTAL over days nothing was read from —
 * a 300-day elimination trial cropped to 249 days, reporting "2 symptom events" over 129
 * days the pull never saw. (`adversarial-reviewer`, CUL-975.)
 */
export function reachedLookbackIso(lookbackIso: string, complete: boolean, oldestPulledMs: number): string {
  // Complete ⇒ the pull reached its own floor. No rows ⇒ nothing to narrow to, and that case
  // is refused upstream anyway when it matters.
  if (complete || !Number.isFinite(oldestPulledMs)) return lookbackIso
  // Never widen: the query was bounded at `lookbackIso`, so a row cannot predate it, but a
  // clock or a fixture that says otherwise must not push the claimed reach further back.
  const asked = Date.parse(lookbackIso)
  if (Number.isNaN(asked)) return lookbackIso
  return new Date(Math.max(asked, oldestPulledMs)).toISOString()
}

/**
 * Every row a query matches, read in pages, with an EARNED answer to "was that all?".
 *
 * WHY THIS EXISTS (CUL-975). PostgREST caps an unbounded select at the project's
 * `max-rows`. A select with no `ORDER BY` comes back in physical order, which on these
 * append-only tables is insertion order — so the cap kept the OLDEST rows and dropped the
 * NEWEST, silently. The vet report a PM generated for a real appointment on 2026-09-16
 * was missing every event after Sep 7: a cough that happened yesterday printed as ten
 * days ago, and the more diligently the owner had logged, the calmer their pet looked.
 * There was no error, no caveat and no log line, and every number on the page agreed with
 * every other number, because they all derived from the same truncated set.
 *
 * THREE THINGS MAKE A PULL HONEST, and this helper owns the second and third:
 *
 *  1. AN ORDER, at the call site. Every converted pull orders newest-first on a TOTAL
 *     key. Total matters as much as the direction: `occurred_at` is not unique (this
 *     record logs ~7 events a day and meal one-taps land on the same second), and under
 *     a non-total sort Postgres may order tied rows differently per page, which repeats
 *     and skips rows at every page seam. Each call site therefore ends `, id DESC`.
 *
 *  2. A STRIDE THAT MATCHES REALITY. The loop advances by the number of rows it actually
 *     RECEIVED, never by `PULL_PAGE`. This is what makes it correct at a server ceiling
 *     it cannot observe: if `max-rows` were ever below the page size, a fixed stride would
 *     skip the rows between what was asked for and what came back, while advancing by the
 *     received count simply costs more round trips and loses nothing.
 *
 *  3. COMPLETENESS FROM THE COUNT, NEVER FROM THE PAGE'S FULLNESS. `rows.length < PULL_PAGE`
 *     is the inference the `looks` pull's comment already warns against, and it is exactly
 *     what a lowered `max-rows` defeats. The count comes from page 0 — the SAME request
 *     that returned page 0's rows, so for any record that fits in one page (the common
 *     case) the count and the rows are one consistent snapshot and completeness is exact.
 *
 * WHAT `complete: false` MEANS AFTER THIS. Because every pull is newest-first, a shortfall
 * drops the OLDEST rows — the inverse of the defect above. So it means one of: the page
 * ceiling was reached, the server capped a page below what we asked for, or the table was
 * written while the report generated. `generateReportForPet` acts on it per the PM's
 * (a') ruling on CUL-975 — refuse only where the report's own WINDOW could have been cut,
 * disclose otherwise.
 *
 * WHAT A MULTI-PAGE PULL GUARANTEES, measured rather than reasoned. Two earlier versions
 * of this paragraph were wrong in the same way — they described what the author expected
 * the loop to do — so each clause below is a harness result against this reader.
 *
 *   • INSERT during the pull: every row that existed at the count's instant is returned,
 *     and `complete` is true. A head insert shifts the list down and re-serves a row the
 *     previous page already gave us; `keyOf` drops the duplicate and the stride still
 *     advances by the full batch, so the window keeps descending. The new row is NOT
 *     included — it did not exist when the count was taken, and this document is a snapshot
 *     as of the request (the client flushes its queues before calling). Verified for a head
 *     insert, a mid-list backdated insert, and two backdated inserts landing inside the
 *     final partial window.
 *
 *   • DELETE during the pull: the list shifts UP under the cursor, so an offset the loop
 *     has already passed now holds a row it never requested. The overlap check sees that
 *     directly — the overlapped row is unseen — and the pull reports INCOMPLETE. This is the
 *     case a count cannot catch on its own: an `adversarial-reviewer` harness showed one
 *     soft-delete PLUS one backdated insert returning `complete: true` with a live in-window
 *     row absent, because the insert restored the number the delete took away. A number that
 *     can be made whole by a different row is not a proof that no row is missing.
 *
 * So completeness now rests on three independent things, and all three must hold: the loop
 * reached the end of the set (not the page ceiling), no page began on a row it had not
 * already seen, and the rows in hand account for page 0's count.
 *
 * Neither race can reach a single-page record, where the count and the rows come from one
 * request. Keyset pagination on `(occurred_at, id)` would make the offset space irrelevant
 * altogether and is the upgrade if multi-page pulls ever stop being the exception.
 *
 * COST, stated because it is a deliberate trade: `count: 'exact'` rides every page although
 * only page 0's is read, and each page after the first re-reads one row. Keeping the count
 * on one builder function is what makes each call site a single readable chain; the
 * alternative threads a page index through eleven of them to save a counted index scan.
 *
 * @param table   the table name, for the error message `rowsOrThrow` raises
 * @param keyOf   a PRIMARY-KEY-unique key per row — the de-dupe above; a non-unique key
 *                would silently drop live rows, so every call site passes a column the
 *                schema declares unique
 * @param page    builds the query for one half-open range; MUST carry `count: 'exact'`
 */
export async function fetchAll<T>(
  table: string,
  keyOf: (row: T) => string,
  page: (from: number, to: number) => PromiseLike<PullPage>,
): Promise<Pull<T>> {
  const rows: T[] = []
  const seen = new Set<string>()
  let total: number | null = null
  // Proven FALSE by a page that ends the result set. Starting true is the direction that
  // cannot mislead: a loop that falls out of its bounds has not read to the end.
  let hitCeiling = true

  // Set when the offset space moved under the cursor — see the continuity check below.
  let shifted = false

  let from = 0
  for (let p = 0; p < PULL_MAX_PAGES; p++) {
    // ONE ROW OF DELIBERATE OVERLAP on every page after the first, and it is the whole of
    // the continuity check below. It costs one duplicate per page, which `keyOf` absorbs.
    const start = p === 0 ? 0 : from - 1
    const res = await page(start, start + PULL_PAGE - 1)
    if (isRangeNotSatisfiable(res.error)) break
    const batch = rowsOrThrow<T>(res, table)
    // PAGE 0'S COUNT, AND ONLY PAGE 0'S — enforced by the `p === 0`, not merely intended.
    // It is the count taken in the same request as page 0's rows, so for a single-page
    // record the two are one consistent snapshot. A later page's count is a different
    // instant, and measuring completeness against it compares a snapshot to rows that were
    // never in it. Page 0 returning no count leaves `total` null ⇒ incomplete, which is the
    // direction that cannot mislead.
    if (p === 0 && typeof res.count === 'number') total = res.count

    // THE CONTINUITY CHECK. The overlapped row is one we have already returned — unless
    // rows were REMOVED above the cursor, in which case everything shifted up and the row
    // now sitting at this offset is one we never requested. That is a skip, and without
    // this it is invisible: a concurrent delete skips a row while a concurrent insert
    // restores the count, so `rows.length >= total` certifies a pull that is missing a live
    // row. Measured on the shipped reader before this existed — one soft-delete plus one
    // backdated insert during a 1,057-row pull returned `complete: true` with an in-window
    // event absent and no disclosure anywhere. That is CUL-975's own failure class, and a
    // count alone cannot see it because the count was made whole by a different row.
    if (p > 0 && batch.length > 0 && !seen.has(keyOf(batch[0]))) shifted = true

    for (const row of batch) {
      const key = keyOf(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }

    // The result set ended. (An empty page is the unambiguous end; a short one may be the
    // server's ceiling, which is why the stride follows the batch and the loop continues.)
    if (batch.length === 0) {
      hitCeiling = false
      break
    }
    from = start + batch.length
    if (total !== null && rows.length >= total) {
      hitCeiling = false
      break
    }
  }

  // ABSENT MEANS UNKNOWN MEANS INCOMPLETE — the `lookRowsComplete` rule, the direction
  // that cannot mislead. Every page here requests the count, so an absent one is an
  // anomaly, and an anomaly must not read as a clean bill of health.
  return { rows, complete: !hitCeiling && !shifted && total !== null && rows.length >= total }
}

// ── Pure DB → ReportInput mappers (exported for offline deno tests) ────────────
// These are the load-bearing DB-column-to-contract translation. The clinical
// honesty logic lives in report.ts; these only rename fields and normalise
// join/enum/numeric shapes, so they are the natural unit-test seam for the shell.

export function mapPet(row: PetRow): ReportPetInput {
  return {
    id: row.id,
    name: row.name,
    species: row.species as ReportPetInput['species'],
    breed: row.breed ?? null,
    sex: row.sex as ReportPetInput['sex'],
    dateOfBirth: row.date_of_birth ?? null,
    // Whether the DOB is a witnessed birthday ('exact') or a computed anchor from an
    // approximate age entered at onboarding ('approximate', B-251 PR 9 / migration
    // 028). The report must not print a birth year for an approximate DOB. Legacy
    // rows / a null → 'exact' (every pre-028 DOB came from the calendar picker).
    dateOfBirthPrecision: row.date_of_birth_precision === 'approximate' ? 'approximate' : 'exact',
    // Neuter status is NOT stored on `pets` (spec §7.1) → render "not recorded".
    neuterStatus: null,
    // pets.weight_kg is the onboarding snapshot, NOT a weigh-in — report.ts never
    // renders it as the trend, only as the signalment "latest weight".
    weightKg: num(row.weight_kg),
  }
}

/** The raw protein evidence off a food join, unmapped and un-derived — report.ts owns
 *  the derivation so the whole protein view stays offline-testable in the pure layer. */
function mapFoodProteins(fi: FoodProteinCols | null | undefined): {
  proteins: string[] | null
  ingredientsNotes: string | null
  extractionConfidence: unknown
} {
  return {
    proteins: fi?.proteins ?? null,
    ingredientsNotes: fi?.ingredients_notes ?? null,
    extractionConfidence: fi?.ai_extraction_confidence ?? null,
  }
}

function mapMealDetail(meal: MealJoin): ReportMealDetail {
  const fi = first(meal.food_items)
  return {
    foodItemId: meal.food_item_id ?? null,
    intakeRating: (meal.intake_rating ?? null) as ReportMealDetail['intakeRating'],
    quantity: meal.quantity ?? null,
    foodType: (fi?.food_type ?? null) as ReportMealDetail['foodType'],
    format: (fi?.format ?? null) as ReportMealDetail['format'],
    primaryProtein: fi?.primary_protein ?? null,
    ...mapFoodProteins(fi),
    brand: fi?.brand ?? null,
    productName: fi?.product_name ?? null,
  }
}

export function mapEventRows(rows: EventRow[]): ReportEventInput[] {
  return rows.map((r) => {
    const meal = first(r.meals)
    return {
      id: r.id,
      type: r.event_type,
      occurredAt: r.occurred_at,
      occurredAtConfidence: (r.occurred_at_confidence ?? null) as ReportEventInput['occurredAtConfidence'],
      occurredAtEarliest: r.occurred_at_earliest ?? null,
      occurredAtLatest: r.occurred_at_latest ?? null,
      severity: r.severity ?? null,
      notes: r.notes ?? null,
      loggedAt: r.created_at,
      meal: r.event_type === 'meal' && meal ? mapMealDetail(meal) : null,
    }
  })
}

export function mapAiAnalysisRows(rows: AiAnalysisRow[]): ReportAiAnalysisInput[] {
  return rows.map((r) => ({
    eventId: r.event_id,
    status: r.status,
    colour: r.colour ?? null,
    contents: r.contents ?? null,
    consistency: r.consistency ?? null,
    bloodPresent: r.blood_present ?? null,
    bilePresent: r.bile_present ?? null,
    foreignMaterialPresent: r.foreign_material_present ?? null,
    foreignMaterialNote: r.foreign_material_note ?? null,
    stoolConsistency: r.stool_consistency ?? null,
    stoolColour: r.stool_colour ?? null,
    stoolBloodPresent: r.stool_blood_present ?? null,
    stoolBloodType: r.stool_blood_type ?? null,
    stoolMucusPresent: r.stool_mucus_present ?? null,
    editedAt: r.edited_at ?? null,
  }))
}

/** True when a parent-event instant is at/after the lookback floor. weight_checks and
 * medication_administrations carry no occurred_at column, so they can't be bounded in
 * the query the way `events` is (.gte occurred_at) — we post-filter their PARENT's
 * occurred_at here so a pet on a years-long regimen doesn't pull its entire dose/weight
 * history on every report (report.ts scopes to the window anyway; this bounds the pull's
 * processing to the same superset `events` uses). NaN/absent floor ⇒ no bound. */
function withinLookback(occurredAt: string, lookbackMs: number | undefined): boolean {
  if (lookbackMs === undefined) return true
  const ms = Date.parse(occurredAt)
  return Number.isNaN(ms) ? true : ms >= lookbackMs
}

/** Weigh-ins carry their timing on the PARENT event; soft-delete is on the parent
 * too (1:1 child), so a weigh-in whose event was soft-deleted is dropped here. */
export function mapWeightRows(rows: WeightRow[], lookbackMs?: number): ReportWeightCheckInput[] {
  const out: ReportWeightCheckInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev || ev.deleted_at) continue
    if (!withinLookback(ev.occurred_at, lookbackMs)) continue
    const kg = num(r.weight_kg)
    if (kg === null) continue
    out.push({ eventId: r.event_id, weightKg: kg, occurredAt: ev.occurred_at })
  }
  return out
}

/**
 * Daily looks → the report's input rows, soft-deleted parents dropped.
 *
 * THE DROP IS THE WHOLE PRIVACY GUARD (N-1's review, rule 2). `local_day` is read as
 * STORED and never re-derived from the parent's `occurred_at` — T-19 exists because the
 * device and this function bucket days on two different clocks, and re-deriving here
 * would put Home's answered-day count and the report's at odds over the same rows.
 *
 * NO LOOKBACK TRIM, deliberately, unlike doses and weigh-ins: the page-1 line's
 * "answered on N days before it" clause reads back past the window on purpose, and the
 * query's own floor is what bounds the pull. `generateReportForPet` passes that floor to
 * assembly so the clause degrades to a floor rather than printing a query bound as if it
 * were the record's first day.
 */
export /**
 * A note, bounded where it ENTERS the process rather than where it is printed.
 *
 * `looks.notes` has no length bound at rest — the N-1 privacy review stored a 2 MB note,
 * and the client's 300-character field is a UI constraint, not a column one. The render
 * already caps what it prints; what it could not cap was what the function HOLDS, and the
 * `rls-privacy-reviewer` measured the difference: 900 rows at ~200 KB each is ~360 MB of
 * UTF-16 in the isolate against Edge's 256 MB limit, for a bounded ~1.3 MB of output.
 * Self-inflicted only (RLS scopes the pull to the caller's own pet), so this is
 * robustness rather than a boundary — but a report that OOMs is a report the owner cannot
 * make.
 *
 * ONE CHARACTER OVER THE RENDER'S CAP, deliberately: the render decides whether to
 * disclose a shortening by comparing against `NOTICED_NOTE_CAP`, so the bound here has to
 * leave that comparison true. The disclosure is the render's, and it stays the render's.
 *
 * The slice respects code points, so a note whose cut lands inside an emoji cannot emit a
 * lone surrogate into the document (measured: `U+D83D` alone, rendering as U+FFFD).
 */
const LOOK_NOTE_PULL_BOUND = 1001
function boundNote(note: unknown): string | null {
  if (typeof note !== 'string') return null
  if (note.length <= LOOK_NOTE_PULL_BOUND) return note
  return [...note].slice(0, LOOK_NOTE_PULL_BOUND).join('')
}

export function mapLookRows(rows: LookRow[]): ReportLookInput[] {
  const out: ReportLookInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev || ev.deleted_at) continue
    if (typeof r.local_day !== 'string' || r.local_day.length === 0) continue
    out.push({
      eventId: r.event_id,
      localDay: r.local_day,
      createdAt: r.created_at ?? ev.occurred_at,
      occurredAt: ev.occurred_at,
      // The column is CHECK-bounded to these two values (064); anything else is a
      // corrupt read, and 'observed' is the safe direction — an absence day is the only
      // one a surface may describe as "nothing unusual", and it must never be inferred.
      // Mirrors `hydrateLooks` (lib/looks.ts) rather than deciding again.
      outcome: r.outcome === 'nothing_unusual' ? 'nothing_unusual' : 'observed',
      words: Array.isArray(r.words) ? r.words.filter((w): w is string => typeof w === 'string') : [],
      vocabVersion: typeof r.vocab_version === 'number' ? r.vocab_version : 1,
      notes: boundNote(r.notes),
    })
  }
  return out
}

/** Doses carry timing on the parent event; drop soft-deleted parents. The clinical
 * on-board filtering (missed/refused/in-doubt-combo) stays in report.ts/detection. */
export function mapDoseRows(rows: DoseRow[], lookbackMs?: number): ReportDoseInput[] {
  const out: ReportDoseInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev || ev.deleted_at) continue
    if (!withinLookback(ev.occurred_at, lookbackMs)) continue
    out.push({
      eventId: r.event_id,
      occurredAt: ev.occurred_at,
      medicationId: r.medication_id ?? null,
      medicationItemId: r.medication_item_id ?? null,
      adherence: r.adherence ?? null,
      doseAmount: r.dose_amount ?? null,
      pairedEventId: r.paired_event_id ?? null,
    })
  }
  return out
}

export function mapMedicationItemRows(rows: MedicationItemRow[]): ReportMedicationItemInput[] {
  return rows.map((r) => ({
    id: r.id,
    genericName: r.generic_name ?? null,
    brandName: r.brand_name ?? null,
    strength: r.strength ?? null,
    route: r.default_route ?? null,
    isPrescription: r.is_prescription ?? null,
    form: r.form ?? null,
  }))
}

export function mapMedicationRows(rows: MedicationRow[]): ReportMedicationInput[] {
  return rows.map((r) => {
    const item = first(r.medication_items)
    return {
      id: r.id,
      medicationItemId: r.medication_item_id ?? null,
      drugName: r.drug_name,
      doseAmount: r.dose_amount ?? null,
      route: r.route ?? null,
      dosesPerDay: num(r.doses_per_day),
      scheduleNotes: r.schedule_notes ?? null,
      indication: r.indication ?? null,
      prescribedBy: r.prescribed_by ?? null,
      startedAt: r.started_at,
      targetDurationDays: r.target_duration_days ?? null,
      targetDurationDoses: r.target_duration_doses ?? null,
      status: r.status,
      endedAt: r.ended_at ?? null,
      isPrescription: item?.is_prescription ?? null,
      strength: item?.strength ?? null,
    }
  })
}

export function mapDietTrialRows(rows: DietTrialRow[]): ReportDietTrialInput[] {
  return rows.map((r) => {
    const fi = first(r.food_items)
    return {
      id: r.id,
      foodItemId: r.food_item_id ?? null,
      startedAt: r.started_at,
      targetDurationDays: r.target_duration_days,
      status: r.status,
      completedAt: r.completed_at ?? null,
      // B-455. `completed_at` alone is null on an ABANDONED trial, which the
      // downstream span logic reads as open-ended.
      endedAt: r.ended_at ?? null,
      indication: (r.indication ?? null) as ReportDietTrialInput['indication'],
      outcome: (r.outcome ?? null) as ReportDietTrialInput['outcome'],
      outcomeNotes: r.outcome_notes ?? null,
      stoppedReason: r.stopped_reason ?? null,
      vetName: r.vet_name ?? null,
      // `diet_trials.food_label` is the §3.1 denormalized fallback, and it is what
      // survives archiving the trial food (`food_item_id` is ON DELETE SET NULL).
      // The live join wins when it is there; the stored label is not a second-class
      // value, it is the one that outlives the row.
      foodLabel: foodLabel(fi) ?? r.food_label ?? null,
      primaryProtein: fi?.primary_protein ?? null,
      // B-704 (migration 053) — the owner's stored trial protein, read STORED-FIRST by
      // `trialTargetProtein`; null derives, exactly as today. Never permits (TG-1).
      targetProtein: r.target_protein ?? null,
      targetProteinSetAt: r.target_protein_set_at ?? null,
      ...mapFoodProteins(fi),
      allowedFoods: (r.diet_trial_foods ?? []).map((f) => {
        const ffi = first(f.food_items)
        return {
          foodItemId: f.food_item_id,
          foodLabel: f.food_label,
          role: f.role,
          allowedFrom: f.allowed_from,
          allowedUntil: f.allowed_until ?? null,
          primaryProtein: ffi?.primary_protein ?? null,
          brand: ffi?.brand ?? null,
          productName: ffi?.product_name ?? null,
          ...mapFoodProteins(ffi),
        }
      }),
    }
  })
}

export function mapVetVisitRows(rows: VetVisitRow[]): ReportVetVisitInput[] {
  return rows.map((r) => ({
    visitedAt: r.visited_at,
    clinicName: r.clinic_name ?? null,
    vetName: r.vet_name ?? null,
    reason: r.reason ?? null,
  }))
}

export function mapFeedingArrangementRows(rows: ArrangementRow[]): ReportFeedingArrangementInput[] {
  return rows.map((r) => {
    const fi = first(r.food_items)
    return {
      id: r.id,
      foodItemId: r.food_item_id,
      method: r.method,
      activeFrom: r.active_from ?? null,
      activeUntil: r.active_until ?? null,
      isShared: r.is_shared,
      primaryProtein: fi?.primary_protein ?? null,
      ...mapFoodProteins(fi),
      foodLabel: foodLabel(fi),
    }
  })
}

export function mapConditionRows(rows: ConditionRow[]): ReportConditionInput[] {
  return rows.map((r) => ({
    conditionName: r.condition_name,
    status: r.status,
    diagnosedAt: r.diagnosed_at ?? null,
  }))
}

export function mapAttachmentRows(rows: AttachmentRow[]): ReportAttachmentInput[] {
  return rows.map((r) => ({
    eventId: r.event_id,
    storagePath: r.storage_path,
    mimeType: r.mime_type ?? null,
    sortOrder: r.sort_order ?? 0,
  }))
}

// ── PR 7 — incident-photo fetch/strip/embed (the ONLY I/O between assemble + render) ──

type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * Sniff the transform output's real format from its magic bytes. imgproxy may hand back JPEG,
 * WebP or PNG regardless of the stored mime_type (which we treat as advisory only), so we detect
 * the actual bytes and label the data: URI accordingly. Pure + exported for offline tests.
 */
export function detectPhotoMediaType(bytes: Uint8Array): PhotoMediaType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  // Unknown → default to jpeg (the transform's usual output); the WebView/PDF sniff the bytes too.
  return 'image/jpeg'
}

/** Base64 a Uint8Array in chunks (String.fromCharCode(...bytes) blows the arg limit on a big image). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Fetch ONE photo as an EXIF/GPS-stripped, downscaled data: URI — or null on ANY failure.
 *
 * The Supabase Storage image transform (imgproxy) RE-ENCODES the image, stripping all EXIF/GPS
 * metadata AND downscaling it — the load-bearing privacy control (spec §8). We fetch ONLY through
 * the transform and NEVER fall back to the raw original (which carries the camera's GPS tags), so a
 * transform failure yields null (→ the render's honest placeholder), never a leaked raw frame.
 *
 * Service role is required to read a private-bucket object; it is safe here because `path` came
 * from an RLS-scoped enumeration of the VERIFIED owner's pet (event_attachments, RLS by ownership),
 * never a request-supplied path. No signed URL is minted or persisted (AC-7). Paths are never logged.
 */
async function fetchStrippedPhotoDataUri(adminClient: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient.storage.from('nyx-event-attachments').download(path, {
      transform: {
        width: PHOTO_EMBED_EDGE_PX,
        height: PHOTO_EMBED_EDGE_PX,
        resize: 'contain',
        quality: PHOTO_EMBED_QUALITY,
      },
    })
    if (error || !data) {
      console.warn(`generate-report: photo transform unavailable (${error?.message ?? 'no data'}) — placeholder`)
      return null
    }
    if (data.size === 0 || data.size > MAX_EMBED_IMAGE_BYTES) {
      console.warn(`generate-report: transformed photo out of size bounds (${data.size} bytes) — placeholder`)
      return null
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    return `data:${detectPhotoMediaType(bytes)};base64,${bytesToBase64(bytes)}`
  } catch (err) {
    console.warn(`generate-report: photo fetch failed (${err instanceof Error ? err.message : String(err)}) — placeholder`)
    return null
  }
}

/**
 * Populate each incident photo's data: URI (mutates the snapshot's manifest in place — the ONE I/O
 * step between pure assembly and pure render). Safety-flagged photos are attempted FIRST so a blood/
 * foreign frame is never the one dropped by the cap; the rest follow the manifest's most-recent-first
 * order. Attempts are capped at MAX_EMBEDDED_PHOTOS (bounds response size + isolate work); photos left
 * unembedded (over the cap OR a failed transform) keep dataUri=null → a DISCLOSED render placeholder.
 * Sequential — one transient blob at a time; the accumulated base64 is bounded by the cap.
 */
export async function embedIncidentPhotos(
  adminClient: SupabaseClient,
  photos: IncidentPhoto[],
): Promise<{ total: number; embedded: number; omitted: number }> {
  const total = photos.length
  if (total === 0) return { total: 0, embedded: 0, omitted: 0 }
  // Safety-flagged first, else preserve the snapshot's most-recent-first order (stable sort).
  const order = [...photos].sort((a, b) => (a.safety ? 0 : 1) - (b.safety ? 0 : 1))
  let embedded = 0
  let attempts = 0
  for (const p of order) {
    if (attempts >= MAX_EMBEDDED_PHOTOS) break
    attempts++
    const uri = await fetchStrippedPhotoDataUri(adminClient, p.storagePath)
    if (uri) {
      p.dataUri = uri
      embedded++
    }
  }
  return { total, embedded, omitted: total - embedded }
}

/**
 * The event-pull floor: far enough back to fully cover the resolved window (even a
 * long since-visit range) plus CHERRY_PICK_LOOKBACK_DAYS of pre-window history for
 * the custom-window out-of-range disclosure, and at least BASE_LOOKBACK_DAYS.
 * Pure + exported so the boundary math is unit-tested, not asserted.
 *
 * DELIBERATE BOUND (Data Scientist sign-off, PR 5): the §6 cherry-pick disclosure
 * ("N symptom events outside this range") is therefore computed over at most ~this
 * lookback, not the pet's full record — so for a pet tracked well beyond it with an
 * old symptom cluster and a recent custom window, the out-of-window count can
 * UNDERstate. Accepted for v1: it mirrors generate-signal's own 180-day precedent,
 * keeps the query on the (pet_id, occurred_at) index, and the disclosure is a
 * trust signal, not a load-bearing count. Revisit if real-vet feedback wants
 * full-history cherry-pick accounting (would widen the pull for long-tracked pets).
 *
 * B-613 ADDS A THIRD TERM, and only for the trial. `since_visit` truncates a long trial
 * by construction, and the trial block now discloses what was logged in the days it
 * crops — a count that is only honest if the pull actually reached them. The stretch is
 * bounded by TRIAL_CROP_LOOKBACK_CAP_DAYS and is a floor, not a target: assembly compares
 * this instant against the trial's start and renders "at least N" when the pull fell
 * short, so the cap costs a word rather than a claim.
 *
 * `trialStartIso` is the start of the trial `selectReportTrial` picks — the SAME predicate
 * the block itself is built from, called with the same arguments, never a second
 * "which trial is this report about?" test. A divergent copy is what once anchored a
 * window on an abandoned trial while the block described an active one.
 */
export function computeLookbackIso(
  scope: ReportScope,
  nowMs: number,
  trialStartIso: string | null = null,
): string {
  const windowStartMs = Date.parse(`${scope.startDate}T00:00:00.000Z`)
  const windowFloor = Number.isNaN(windowStartMs)
    ? nowMs
    : windowStartMs - CHERRY_PICK_LOOKBACK_DAYS * MS_PER_DAY
  const baseFloor = nowMs - BASE_LOOKBACK_DAYS * MS_PER_DAY
  // The trial term never RAISES the floor — `Math.min` over all three — so a trial that
  // starts inside the window (the first report of any trial) leaves the pull exactly as
  // it was, and this can only ever widen.
  const trialMs = trialStartIso === null ? NaN : Date.parse(trialStartIso)
  const trialFloor = Number.isNaN(trialMs)
    ? Infinity
    : Math.max(
        trialMs,
        Number.isNaN(windowStartMs) ? -Infinity : windowStartMs - TRIAL_CROP_LOOKBACK_CAP_DAYS * MS_PER_DAY,
      )
  return new Date(Math.min(windowFloor, baseFloor, trialFloor)).toISOString()
}

// The generation body, factored out of the HTTP handler so it is unit-testable with
// an injected client + reference `now` (no Deno.serve, no Date.now()).
export async function generateReportForPet(
  supabase: SupabaseClient,
  petId: string,
  nowMs: number,
  requestedWindow: { startDate: string; endDate: string } | null,
  /**
   * CUL-875 / §9 rule 4 — who this render is for. REQUIRED, with no default, and
   * positioned AHEAD of the optional arguments so it cannot become one.
   *
   * IT HAD A DEFAULT AND THE DEFAULT WAS THE BREAK. The reasoning written here was that
   * the `shared_link` arm carries no notes field, so a mint "cannot reach the owner
   * default by omission — it has to be constructed, and constructing it excludes the
   * notes". That is true of `ReportInput.audience`, which is required in the pure layer;
   * it was transplanted one level up onto a signature where it stopped holding. The
   * `rls-privacy-reviewer` proved it end to end: a seven-argument call
   * (`generateReportForPet(c, pet, now, null, null, null, 'UTC')`) type-checked under
   * `--strict`, took the owner arm by omission, and printed the owner's private sentence
   * into the artifact. The union forbids WRITING `shared_link + notes`; the default handed
   * you `owner + notes` for writing nothing at all.
   *
   * So the safety is back where it can be checked: `tsc` now makes PR 6's mint decide,
   * because it cannot call this function without saying who is reading. A default on a
   * privacy decision is not a convenience — it is the decision, taken silently.
   */
  audience: ReportAudience,
  callerJwt: string | null = null,
  // PR 7 — service-role client used ONLY to download incident-photo bytes (private bucket) for the
  // paths RLS already scoped to the verified owner's pet. Null ⇒ photos are not embedded (their
  // dataUri stays null → the render shows placeholders): the report still generates. The unit tests
  // pass null (no live Storage); the handler passes a real admin client.
  adminClient: SupabaseClient | null = null,
  // B-443 — the caller's device IANA zone, preferred over the stored profile zone so the
  // report's trial "Day N" buckets by the same clock the owner's card does. Default null ⇒
  // stored zone (the pre-B-443 behaviour), so every existing call site is unaffected.
  requestTimezone: string | null = null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowIso = new Date(nowMs).toISOString()

  // 1. Ownership re-check (confused-deputy guard) + signalment + the window-
  //    determining rows. All RLS-scoped by the caller's JWT — a pet the caller
  //    does not own returns null → 404. Owner name + tz come from the caller's own
  //    profile (RLS: auth.uid() = id), the PIMS-filing identity (spec §7.1).
  //
  //    CUL-975 — `vet_visits` and `diet_trials` paginate like every other pull, and these
  //    two matter MORE than a count does: they are the scope cascade's rungs 1 and 2, so a
  //    truncated pull here does not shorten a number, it MOVES THE REPORT'S WINDOW. `pets`
  //    and `user_profiles` are `.maybeSingle()` and cannot truncate.
  const [petRes, profileRes, vetVisitsPull, dietTrialsPull] = await Promise.all([
    supabase
      .from('pets')
      .select('id, name, species, breed, sex, date_of_birth, date_of_birth_precision, weight_kg')
      .eq('id', petId)
      .maybeSingle(),
    supabase.from('user_profiles').select('display_name, timezone').maybeSingle(),
    // CUL-899 VV-1 — `.is('deleted_at', null)` is the most consequential member of
    // that PR's reader sweep: these rows ARE the scope cascade's rung 1, so a visit
    // the owner deleted would keep setting the report's window start. It lands on
    // `main` INERT — live is v13 (Jul 18) and this function's redeploy rides CUL-19,
    // which gains this reader as a third rider. That inertness is exactly why the
    // delete CONTROL waits for VV-6: shipping the control first would hide a visit
    // in the app while the deployed report still counted it.
    fetchAll<VetVisitRow>('vet_visits', (r) => r.id, (from, to) =>
      supabase.from('vet_visits').select('id, visited_at, clinic_name, vet_name, reason', { count: 'exact' })
        .eq('pet_id', petId).is('deleted_at', null)
        .order('visited_at', { ascending: false }).order('id', { ascending: false })
        .range(from, to)),
    fetchAll<DietTrialRow>('diet_trials', (r) => r.id, (from, to) =>
      supabase
      .from('diet_trials')
      .select(
        'id, food_item_id, started_at, target_duration_days, status, completed_at, ended_at, ' +
          'indication, outcome, outcome_notes, stopped_reason, food_label, vet_name, ' +
          // B-704 migration 053 — the owner's stored trial protein feeds the report's
          // stored-first naming (§7.4). Selecting it is inert until `generate-report` is
          // redeployed; that redeploy rides the standing B-494 gate, never on its own.
          'target_protein, target_protein_set_at, ' +
          `food_items(food_type, format, ${FOOD_PROTEIN_COLS}, brand, product_name), ` +
          // The allowed set (§3.2) — rung 1 of §5.3, and the only reason the report
          // can tell a vet-permitted treat from a contaminant. Soft-deleted rows are
          // filtered in the embed: a food the owner REMOVED from the list must stop
          // permitting feedings, and `allowed_until` is not written on a delete.
          'diet_trial_foods(food_item_id, food_label, role, allowed_from, allowed_until, ' +
          `food_items(${FOOD_PROTEIN_COLS}, brand, product_name, format))`,
        { count: 'exact' },
      )
      .is('diet_trial_foods.deleted_at', null)
      .eq('pet_id', petId)
      // Newest-first on a TOTAL key. `started_at` alone is not one (two trials can start
      // the same day), and an unstable sort repeats and skips rows at every page seam.
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
  ])

  // A real error on the pet load must NOT masquerade as a 404 ("you don't own this
  // pet") — that would hide a backend fault as an authorization result. Throw → 500;
  // only a genuine null (not found OR not owned) is the 404.
  if (petRes.error) throw new Error(`pets read failed: ${petRes.error.message}`)
  const petRow = petRes.data as PetRow | null
  if (!petRow) {
    // Not found OR not owned — indistinguishable by design (no ownership oracle).
    return { status: 404, body: { error: 'Pet not found' } }
  }
  if (profileRes.error) throw new Error(`user_profiles read failed: ${profileRes.error.message}`)

  const profile = profileRes.data as { display_name: string | null; timezone: string | null } | null
  const pet = mapPet(petRow)
  let ownerName = profile?.display_name?.trim() || null
  // §7.1 PIMS-filing fallback (PM, 2026-07-03): when no display name is set, fall back to
  // the caller's account email — a filing/contact identity beats "Owner: not recorded",
  // and the JWT is already gateway-verified (verify_jwt=true). A failure here must never
  // sink the report: a report without an owner line beats no report.
  if (!ownerName && callerJwt) {
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser(callerJwt)
      if (!userErr) ownerName = userData.user?.email?.trim() || null
    } catch (_err) {
      // Leave null → renders "Owner: not recorded".
    }
  }
  // Prefer the request's device zone, then the stored profile zone, then null (→ UTC). The
  // stored zone can lag the device (a never-stamped profile still carries migration 001's
  // `America/New_York` default), so trusting it alone let the report disagree with the card
  // for a non-New-York owner; the device zone the client sends is the one the card uses (B-443).
  const timezone = resolveIanaZone(requestTimezone, profile?.timezone)
  const vetVisits = mapVetVisitRows(vetVisitsPull.rows)
  const dietTrials = mapDietTrialRows(dietTrialsPull.rows)

  // 2. Resolve the window (§6 cascade) from the small window-determining rows, so
  //    the heavy event pull can be bounded to cover exactly that window (+ buffer).
  //    The five fields the cascade actually reads (`ScopeResolutionInput`), not a stub
  //    report with a dozen empty arrays: the window has never depended on events, doses,
  //    photos or the render's audience, and the stub only existed because the parameter
  //    was typed as the whole input.
  const scope = resolveScope({ now: nowIso, timezone, requestedWindow, dietTrials, vetVisits })
  // The trial the block will describe, resolved HERE only to bound the pull (B-613). One
  // predicate, one call shape — `report.ts` calls the same function with the same window
  // and grace, so the pull is stretched for exactly the trial the block reports on.
  const reportTrialForPull = selectReportTrial(dietTrials, scope, timezone, TRIAL_ANCHOR_GRACE_DAYS)
  const lookbackIso = computeLookbackIso(scope, nowMs, reportTrialForPull?.startedAt ?? null)

  // 3. Pull the remaining rows — every read RLS-scoped by the caller's JWT.
  //
  //    CUL-975 — every pull below except `looks` goes through `fetchAll`: it pages until
  //    the result set is exhausted and reports whether it got there. Each one is ordered
  //    NEWEST-FIRST ON A TOTAL KEY (`<time> DESC, id DESC`); the direction makes any
  //    residual shortfall drop the OLDEST rows, and the `id` tiebreaker is what makes the
  //    paging itself sound — none of these time columns is unique, and under a non-total
  //    sort tied rows can come back in a different order per page, repeating some and
  //    skipping others at every seam. `looks` keeps its deliberate single-page cap.
  const [
    eventsPull,
    aiPull,
    weightPull,
    dosesPull,
    medsPull,
    arrangementsPull,
    conditionsPull,
    attachmentsPull,
    looksRes,
  ] = await Promise.all([
    // All non-deleted events over the lookback (every type — report.ts scopes,
    // dedups and filters by type internally; meals carry their food join).
    // THE PULL CUL-975 WAS ABOUT. It was bare — no `.order()`, no `.limit()`, no
    // `.range()` — so PostgREST capped it at `max-rows` and, with no ORDER BY, Postgres
    // returned physical (insertion) order: the cap kept the OLDEST 1,000 and dropped the
    // NEWEST. `events` is the pull that crosses the cap first, and this document is the
    // one where that reads as a pet getting better.
    fetchAll<EventRow>('events', (r) => r.id, (from, to) =>
      supabase
      .from('events')
      .select(
        'id, event_type, occurred_at, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, ' +
          'severity, notes, created_at, ' +
          `meals(food_item_id, intake_rating, quantity, food_items(food_type, format, ${FOOD_PROTEIN_COLS}, brand, product_name))`,
        { count: 'exact' },
      )
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .gte('occurred_at', lookbackIso)
      // The one pull that can order by the clinical instant itself — every count on
      // page 1 is derived from these rows, so this is the ordering that matters most.
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    // Vomit phenotype source (migration 013). Keyed by pet_id; report.ts looks each
    // up by event_id. No occurred_at column → pulled for the pet (bounded, sparse).
    // No `occurred_at` here (it lives on the parent event), so the order is by when the
    // read was WRITTEN. `created_at` is not the incident's instant — a backdated incident
    // analysed today sorts newest — so the newest-first claim is "most recently analysed",
    // not "most recent incident". `event_id` is UNIQUE on this table (1:1 with events).
    fetchAll<AiAnalysisRow>('event_ai_analysis', (r) => r.event_id, (from, to) =>
      supabase
      .from('event_ai_analysis')
      .select(
        'event_id, status, colour, contents, consistency, blood_present, bile_present, ' +
          'foreign_material_present, foreign_material_note, ' +
          'stool_consistency, stool_colour, stool_blood_present, stool_blood_type, stool_mucus_present, ' +
          'edited_at',
        { count: 'exact' },
      )
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    // Weigh-ins (migration 024) — timing + soft-delete come from the parent event.
    fetchAll<WeightRow>('weight_checks', (r) => r.event_id, (from, to) =>
      supabase
      .from('weight_checks')
      .select('event_id, weight_kg, events(occurred_at, deleted_at)', { count: 'exact' })
      .eq('pet_id', petId)
      // `created_at`, not the weigh-in's instant — that is on the embedded parent and
      // PostgREST cannot ORDER a page by an embedded column reliably. `event_id` is UNIQUE.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    // Administered doses (migration 020/023) — timing + soft-delete from the parent.
    // medication_administrations has TWO FKs to events (event_id + B-156's
    // paired_event_id), so the embed MUST name the constraint or PostgREST 201s
    // (the B-196 ambiguity crash) — disambiguate to the parent-dose FK.
    fetchAll<DoseRow>('medication_administrations', (r) => r.event_id, (from, to) =>
      supabase
      .from('medication_administrations')
      .select(
        'event_id, medication_id, medication_item_id, adherence, dose_amount, paired_event_id, ' +
          'events!medication_administrations_event_id_fkey(occurred_at, deleted_at)',
        { count: 'exact' },
      )
      .eq('pet_id', petId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    // Regimens (migration 020) — spans + the item join for strength/is_prescription.
    // No deleted_at (a regimen is "ended", not soft-deleted) and no lookback filter
    // (an old completed course is a valid historical confounder; report.ts scopes).
    fetchAll<MedicationRow>('medications', (r) => r.id, (from, to) =>
      supabase
      .from('medications')
      .select(
        'id, medication_item_id, drug_name, dose_amount, route, doses_per_day, schedule_notes, ' +
          'indication, prescribed_by, started_at, target_duration_days, target_duration_doses, ' +
          'status, ended_at, medication_items(is_prescription, strength)',
        { count: 'exact' },
      )
      .eq('pet_id', petId)
      // `created_at` rather than the clinically nicer `started_at`, which is nullable —
      // NULLs sort together and would make the newest-first claim untrue for exactly the
      // rows that carry no start date.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    // Free-fed / meal-fed standing facts (B-040). No lookback: a bowl set long ago
    // and still down is a current standing exposure; the window overlap is resolved
    // in report.ts. Soft-deleted arrangements excluded.
    fetchAll<ArrangementRow>('feeding_arrangements', (r) => r.id, (from, to) =>
      supabase
      .from('feeding_arrangements')
      .select(
        `id, food_item_id, method, active_from, active_until, is_shared, food_items(${FOOD_PROTEIN_COLS}, brand, product_name, format)`,
        { count: 'exact' },
      )
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    fetchAll<ConditionRow>('conditions', (r) => r.id, (from, to) =>
      supabase.from('conditions').select('id, condition_name, status, diagnosed_at', { count: 'exact' })
        .eq('pet_id', petId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, to)),
    // Incident-photo attachments (migration 003, PR 7). RLS-scoped by pet ownership, so this
    // enumerates ONLY the verified owner's pet's attachments — the trusted path set later handed
    // to the service-role Storage download. report.ts scopes to window observation incidents; a
    // meal/food photo pulled here is simply never surfaced as an incident. Metadata rows are tiny,
    // so no lookback bound is needed (the storage fetch itself is capped in embedIncidentPhotos).
    fetchAll<AttachmentRow>('event_attachments', (r) => r.id, (from, to) =>
      supabase.from('event_attachments').select('id, event_id, storage_path, mime_type, sort_order', { count: 'exact' })
        .eq('pet_id', petId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, to)),
    // CUL-875 — the daily looks (migration 064). THE ONE PLACE IN supabase/functions/
    // WHERE A LOOK'S NOTE IS SELECTED (guards/lookNotes.test.ts pins it at exactly one;
    // spec T-22 / §9 rule 1 — the note's only home on this document is its appendix).
    //
    // The `events` embed is load-bearing, not metadata: `looks` has no soft-delete of
    // its own, so a look the owner took back — and the sentence she typed with it —
    // survives at rest, and `mapLookRows` drops it on the parent's `deleted_at`. The
    // embed names no constraint because `looks` has a single FK to `events` (unlike
    // medication_administrations' two, the B-196 ambiguity crash).
    //
    // NO DATE BOUND, and an EXPLICIT ORDER + CAP instead. The pre-first-day coverage
    // clause ("answered on 118 days before it since May 3") reads back past the window
    // by design, so a `.gte` would make that sentence a statement about the query. The
    // cap is what stops an unbounded pull, and the ORDER is what makes it safe:
    // newest-first means anything the cap drops is the OLDEST, so every window-scoped
    // number — the page-1 counts, the bars, the strip, the appendix — is untouched, and
    // the single clause that reads older than the window is the single clause that
    // degrades (to a floor with no start date, `pullComplete: false` below).
    supabase
      .from('looks')
      .select('event_id, local_day, outcome, words, notes, vocab_version, created_at, events(occurred_at, deleted_at)', {
        // EXACT, and it is what makes `lookRowsComplete` sound. Inferring completeness
        // from `rows.length < LOOK_PULL_CAP` only works while the cap is below the
        // project's PostgREST `max-rows`, which this function cannot observe and which an
        // admin can change — and if it were ever lower, a truncated pull would report
        // itself complete and the report would print a start date that is a query
        // artifact. The count answers the question directly instead of reasoning about a
        // setting (the `rls-privacy-reviewer` named this as unverifiable from the repo).
        count: 'exact',
      })
      .eq('pet_id', petId)
      .order('local_day', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(LOOK_PULL_CAP),
  ])

  // weight_checks / medication_administrations carry no occurred_at column (it lives on
  // the parent event), so they can't be .gte-bounded in the query the way `events` is —
  // bound them here against the same lookback floor so a chronic-regimen pet doesn't
  // process its entire dose/weight history (report.ts scopes to the window regardless).
  const lookbackMs = Date.parse(lookbackIso)

  // The DB query already returns EVERY dose (medication_administrations can't be .gte-bounded — a
  // dose's instant lives on its parent event), so `doseRows` is the pet's whole dose history. Map it
  // TWICE off the one pull: `doses` trimmed to the lookback for the windowed sections, and
  // `lifetimeDoses` untrimmed for the §4.4 window-ignoring medication-history table (B-140 PR 5).
  // The KNOWN LIMIT that used to be recorded here — "the query carries no explicit .limit(),
  // so a pet with more doses than PostgREST's default max-rows would truncate" — is CLOSED
  // by CUL-975: the pull pages. It was right about the hazard and wrong about which table
  // would meet it first; `events` did, on a real record, on the day before an appointment.
  // The table's copy still says "the medications logged" rather than "every dose ever",
  // which is now a modest claim rather than a necessary one.
  const doseRows = dosesPull.rows
  const doses = mapDoseRows(doseRows, lookbackMs)
  const lifetimeDoses = mapDoseRows(doseRows)
  // §3.8 orphan-dose gap: resolve names for the medication_items behind the doses so an ad-hoc dose
  // logged with NO regimen still reports by drug name (a daily OTC antihistamine otherwise vanished
  // from the report). Keyed off the LIFETIME set (a superset of `doses`) so a course whose only doses
  // predate the lookback still names its drug in the lifetime table. Same RLS the regimen→
  // medication_items join relies on; skipped when there are no doses.
  const doseItemIds = [...new Set(lifetimeDoses.map((d) => d.medicationItemId).filter((v): v is string => v !== null))]
  let medicationItems: ReportMedicationItemInput[] = []
  let medicationItemsComplete = true
  if (doseItemIds.length > 0) {
    // Bounded by the dose set rather than by the pet's whole catalogue, so this one was
    // never near the cap — it pages anyway, because "near the cap" is a judgement the
    // deployed function cannot re-check and this whole issue is what that costs.
    const medItemsPull = await fetchAll<MedicationItemRow>('medication_items', (r) => r.id, (from, to) =>
      supabase
      .from('medication_items')
      .select('id, generic_name, brand_name, strength, default_route, is_prescription, form', { count: 'exact' })
      .in('id', doseItemIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to))
    medicationItems = mapMedicationItemRows(medItemsPull.rows)
    medicationItemsComplete = medItemsPull.complete
  }

  const rawLookRows = rowsOrThrow<LookRow>(looksRes, 'looks')
  const lookRows = mapLookRows(rawLookRows)
  // Exact when PostgREST returned a count; otherwise the cap heuristic, which is the
  // conservative direction (it can only under-claim completeness, never over-claim it,
  // as long as the cap is not above the server's own ceiling).
  const looksTotal = (looksRes as { count?: number | null }).count
  const lookRowsComplete =
    typeof looksTotal === 'number' ? looksTotal <= rawLookRows.length : rawLookRows.length < LOOK_PULL_CAP

  // ── CUL-975 · did every pull read everything, and does it matter? ─────────────
  //
  // THE PM'S (a') RULING, 2026-09-15: refuse to render ONLY where the shortfall could
  // have cut the report's own window; disclose otherwise.
  //
  // The two arms are not a hedge, they are two different documents. A pull that came up
  // short off the OLD end leaves every page-1 count correct — the window is at the new
  // end and every pull is ordered newest-first — and costs the baseline its reach, which
  // is a sentence. A shortfall that reaches INTO the window makes every count on page 1 a
  // query artifact, and there is no sentence that repairs that; the cold read's finding
  // was that such a report is internally consistent and therefore unfalsifiable by its
  // reader. So one is disclosed and the other is refused.
  //
  // Failing closed on BOTH was the issue's own recommendation and was not taken, for a
  // measured reason: the shipped client maps every error to one generic line with a retry
  // button (`app/report.tsx`), so a refusal is indistinguishable from a network fault —
  // and the likeliest trigger of an incomplete pull is now a row being DELETED during
  // generation, which skips at most one row and always the oldest of the window in flight
  // (see `fetchAll`). Refusing there would hand an owner at a clinic no report at all, to
  // protect them from one whose window was intact.
  const incompletePulls = (
    [
      ['events', eventsPull.complete],
      ['event_ai_analysis', aiPull.complete],
      ['weight_checks', weightPull.complete],
      ['medication_administrations', dosesPull.complete],
      ['medications', medsPull.complete],
      ['medication_items', medicationItemsComplete],
      ['feeding_arrangements', arrangementsPull.complete],
      ['conditions', conditionsPull.complete],
      ['event_attachments', attachmentsPull.complete],
      ['vet_visits', vetVisitsPull.complete],
      ['diet_trials', dietTrialsPull.complete],
    ] as [string, boolean][]
  )
    .filter(([, complete]) => !complete)
    .map(([table]) => table)

  if (incompletePulls.length > 0) {
    // Server-side only: the owner sees the page-1 disclosure, and we see WHICH pull, which
    // is the thing that was missing when this defect ran for a week (no error, no caveat,
    // no log line). A cap that cannot be observed will be crossed again.
    console.error('generate-report incomplete pulls:', incompletePulls.join(','))
  }

  // The refusal test, and it is the `events` pull's alone: page 1's counts are computed
  // from those rows and from nothing else. `noticed.ts`'s `windowTruncated` asks exactly
  // this question of the look pull (`!pullComplete && oldestPulledNum > startDayNum`);
  // this is the same question over the rows that carry the clinical counts.
  //
  // MIN over the rows rather than "the last one", so the test does not depend on the
  // driver preserving the ORDER BY it was given.
  //
  // THE ASYMMETRY THIS TEST CANNOT RESOLVE, stated because it is a cliff rather than a bug
  // (`adversarial-reviewer`). It cannot tell "the pull was cut at day 40" from "the record
  // simply starts at day 40" — so any pet whose oldest in-window event falls after the
  // window start refuses on ANY events-pull incompleteness, with nothing actually missing.
  // What keeps that off the common path is that a single-page pull takes its count and its
  // rows from one request and is therefore exact, so the spurious case needs >500 events AND
  // a record starting inside the window AND a race. The systemic version is worth naming:
  // if PostgREST ever stopped returning a count, every pull would report incomplete and that
  // population would get a permanent 503 behind the client's one generic line. Fail-closed,
  // and undiagnosable from the client — which is what the console.error above is for.
  let oldestPulledMs = Infinity
  for (const row of eventsPull.rows) {
    const t = Date.parse(row.occurred_at)
    if (!Number.isNaN(t) && t < oldestPulledMs) oldestPulledMs = t
  }
  // The earliest instant the window's opening LOCAL day can begin in any zone — UTC+14,
  // the maximum positive offset in use. The window start is a local day key and these rows
  // are instants, so the comparison needs a bound rather than a conversion; erring EARLY
  // makes the test fire more readily, which is the direction that cannot mislead.
  const windowStartFloorMs = Date.parse(`${scope.startDate}T00:00:00.000Z`) - MAX_UTC_OFFSET_MS
  const windowMayBeCut =
    !eventsPull.complete && (!Number.isFinite(oldestPulledMs) || oldestPulledMs > windowStartFloorMs)
  if (windowMayBeCut) {
    console.error(
      `generate-report refusing: the events pull is incomplete and its oldest row is inside the window ` +
        `(window opens ${scope.startDate}, ${eventsPull.rows.length} rows read)`,
    )
    // 503 rather than 500: the likeliest cause is a write landing mid-pull, and a retry
    // genuinely clears that. The `error` code is for our logs and for the future client
    // that can say more than "something went wrong" — today's client renders its own line
    // for any non-2xx, so nothing here is owner-facing.
    return {
      status: 503,
      body: {
        error: 'record_incomplete',
        detail: 'The record could not be read completely, so no report was produced.',
      },
    }
  }

  const input: ReportInput = {
    now: nowIso,
    timezone,
    pet,
    ownerName,
    requestedWindow,
    events: mapEventRows(eventsPull.rows),
    aiAnalyses: mapAiAnalysisRows(aiPull.rows),
    weightChecks: mapWeightRows(weightPull.rows, lookbackMs),
    doses,
    lifetimeDoses,
    medications: mapMedicationRows(medsPull.rows),
    medicationItems,
    dietTrials,
    vetVisits,
    feedingArrangements: mapFeedingArrangementRows(arrangementsPull.rows),
    conditions: mapConditionRows(conditionsPull.rows),
    attachments: mapAttachmentRows(attachmentsPull.rows),
    // B-613 — how far back `events` actually reaches, so assembly can tell "nothing was
    // logged in the cropped trial days" apart from "the cropped days were never pulled".
    //
    // CUL-975 MADE THIS TWO DIFFERENT NUMBERS. It used to be safe to pass the floor the
    // query ASKED for, because a truncated pull kept the OLDEST rows and therefore still
    // reached it. Now truncation drops the oldest, so an incomplete pull reaches only as far
    // back as its oldest row — and `report.ts` derives `countIsFloor` from this field for
    // exactly the sentence that must not be "an incomplete answer wearing a complete one's
    // clothes". Passing the requested floor here would print a trial-crop count as a TOTAL
    // over days the pull never read. (`adversarial-reviewer`, this PR.)
    eventsSinceIso: reachedLookbackIso(lookbackIso, eventsPull.complete, oldestPulledMs),
    lookRows,
    // EARNED, never assumed — see `lookRowsComplete` above. Counted on the RAW rows,
    // before `mapLookRows` drops soft-deleted parents: it is the QUERY that was capped,
    // and a page filled with undone looks truncated the pull exactly as much as a page of
    // live ones.
    lookRowsComplete,
    incompletePulls,
    audience,
  }

  // 4. Pure assembly → (PR 7) embed the incident-photo bytes → pure render.
  //    assembleReport builds the photo MANIFEST (which incidents, order, safety class); the ONE I/O
  //    step is fetching each photo through the EXIF-stripping/downscaling transform (never the raw
  //    original) and setting its data: URI in place; renderReport then bakes them into the HTML/PDF.
  const snapshot = assembleReport(input)
  let photoStats = { total: snapshot.incidentPhotos.length, embedded: 0, omitted: snapshot.incidentPhotos.length }
  if (adminClient && snapshot.incidentPhotos.length > 0) {
    photoStats = await embedIncidentPhotos(adminClient, snapshot.incidentPhotos)
  }
  const html = renderReport(snapshot)

  return {
    status: 200,
    body: {
      html,
      pet_name: snapshot.signalment.name,
      start_date: snapshot.scope.startDate,
      end_date: snapshot.scope.endDate,
      scope_basis: snapshot.scope.basis,
      // Owner-visibility (spec §8 "the mitigation is owner visibility"): the app surfaces the count
      // so the owner knows how many of their photos this report hands to the vet. The interactive
      // "tap to exclude any" review is the deferred fast-follow (B-243) that builds on this count.
      photo_count: photoStats.total,
      photo_embedded: photoStats.embedded,
      photo_omitted: photoStats.omitted,
      // R-16 (CUL-998 / CUL-861) — the report's own verdict that its trial has no
      // allowed-food list, returned so the owner hears it on the report screen BEFORE
      // Send, with a door to set the list up, rather than reading it in front of the vet.
      // Scoped to a running trial and to the list's absence (never the unhydrated-set
      // heuristic) — the reasons are on `trialAllowedListMissing`. The app treats an
      // absent field as false, so a client built before this deploys shows nothing.
      trial_allowed_list_missing: trialAllowedListMissing(snapshot.trial, nowMs, timezone),
    },
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  let petId: string
  let requestedWindow: { startDate: string; endDate: string } | null = null
  let requestTimezone: string | null = null
  let includeNotes = true
  try {
    const body = (await req.json()) as {
      petId?: string
      // Owner override (§6) — a hand-picked window triggers the cherry-pick guard
      // inside report.ts. Absent ⇒ the default cascade. Accept snake_case too, so a
      // future caller can pass either.
      startDate?: string
      endDate?: string
      start_date?: string
      end_date?: string
      // B-443 — the caller's device IANA zone (validated in resolveIanaZone before use).
      timezone?: string
      // CUL-875 — the owner's *Include your notes* option, governing whether her daily-
      // look notes appear in the report's Noticed appendix. Default ON, so an older
      // client that sends nothing keeps the spec's default rather than silently
      // dropping a column it does not know exists.
      includeNotes?: boolean
      include_notes?: boolean
    }
    petId = body.petId ?? ''
    const start = body.startDate ?? body.start_date
    const end = body.endDate ?? body.end_date
    if (start && end) requestedWindow = { startDate: start, endDate: end }
    requestTimezone = typeof body.timezone === 'string' ? body.timezone : null
    // A BOOLEAN OR THE DEFAULT — never "anything that is not false".
    //
    // The compatibility this needs is narrow: an older client sends nothing, and nothing
    // must mean the spec's default (on). `rawNotes !== false` delivered that and also
    // made `null`, `"false"`, `0` and `[]` mean ON — failing open on every malformed
    // value when only `undefined` needed to. Unreachable from the shipped client (the
    // control is an RN Switch), and the wrong direction for a privacy toggle regardless
    // (the `rls-privacy-reviewer`).
    const rawNotes = body.includeNotes ?? body.include_notes
    includeNotes = typeof rawNotes === 'boolean' ? rawNotes : true
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!petId || typeof petId !== 'string') {
    return Response.json({ error: 'petId required' }, { status: 400, headers: CORS_HEADERS })
  }

  // User-scoped client — RLS enforces pet ownership on EVERY read (the whole
  // access-control boundary; never trust the body petId beyond what it authorizes).
  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  // PR 7 — service-role client, used SOLELY to download incident-photo bytes from the private
  // nyx-event-attachments bucket for the paths RLS already scoped to the verified owner's pet (the
  // enumeration above runs on the user-scoped client; ownership is re-checked before any pull). It
  // never issues a data query — it only reads the exact object paths the RLS-scoped rows named.
  const adminClient: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const callerJwt = authHeader.replace(/^Bearer\s+/i, '').trim() || null
    const { status, body } = await generateReportForPet(
      supabase,
      petId,
      Date.now(),
      requestedWindow,
      // This route is authenticated and owner-facing; PR 6's public `view-report` route
      // is a different entry point and must construct the `shared_link` arm, which has no
      // notes field to carry (§9 rule 4).
      { kind: 'owner', includeLookNotes: includeNotes },
      callerJwt,
      adminClient,
      requestTimezone,
    )
    return Response.json(body, {
      status,
      // no-store: the report is a snapshot of health data; never cache it at any hop.
      headers: { ...CORS_HEADERS, 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    // Log the detail server-side; return a GENERIC message. A report-assembly error
    // string can interpolate a data value, and this is a health-data function — never
    // echo raw internal error text to the caller (rls-privacy-reviewer hygiene, PR 5).
    const message = err instanceof Error ? err.message : String(err)
    console.error('generate-report error:', message)
    return Response.json(
      { error: 'Report generation failed' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}

// Guard the listener so importing this module for `deno test` does not try to
// bind a server (which crashes the test runner). `import.meta.main` is true only
// when this file is the deployed entrypoint, false on test import (B-180).
if (import.meta.main) {
  Deno.serve(handler)
}
