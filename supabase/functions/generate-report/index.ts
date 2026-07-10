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
} from './report.ts'
import { renderReport } from './render.ts'

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

type FoodItemJoin = {
  food_type: string | null
  format: string | null
  primary_protein: string | null
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
  edited_at: string | null
}

type ParentEventJoin = { occurred_at: string; deleted_at: string | null }

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
  status: string
  ended_at: string | null
  medication_items: MedItemJoin | MedItemJoin[] | null
}

interface DietTrialRow {
  id: string
  food_item_id: string | null
  started_at: string
  target_duration_days: number
  status: string
  completed_at: string | null
  vet_name: string | null
  food_items: FoodItemJoin | FoodItemJoin[] | null
}

interface VetVisitRow {
  visited_at: string
  clinic_name: string | null
  vet_name: string | null
  reason: string | null
}

type ArrangementFoodJoin = { primary_protein: string | null; brand: string; product_name: string }
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
  condition_name: string
  status: string
  diagnosed_at: string | null
}

interface AttachmentRow {
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

function foodLabel(fi: { brand: string; product_name: string } | null): string | null {
  if (!fi) return null
  const label = `${fi.brand} ${fi.product_name}`.trim()
  return label.length > 0 ? label : null
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

function mapMealDetail(meal: MealJoin): ReportMealDetail {
  const fi = first(meal.food_items)
  return {
    foodItemId: meal.food_item_id ?? null,
    intakeRating: (meal.intake_rating ?? null) as ReportMealDetail['intakeRating'],
    quantity: meal.quantity ?? null,
    foodType: (fi?.food_type ?? null) as ReportMealDetail['foodType'],
    format: (fi?.format ?? null) as ReportMealDetail['format'],
    primaryProtein: fi?.primary_protein ?? null,
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
      vetName: r.vet_name ?? null,
      foodLabel: foodLabel(fi),
      primaryProtein: fi?.primary_protein ?? null,
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
 */
export function computeLookbackIso(scope: ReportScope, nowMs: number): string {
  const windowStartMs = Date.parse(`${scope.startDate}T00:00:00.000Z`)
  const windowFloor = Number.isNaN(windowStartMs)
    ? nowMs
    : windowStartMs - CHERRY_PICK_LOOKBACK_DAYS * MS_PER_DAY
  const baseFloor = nowMs - BASE_LOOKBACK_DAYS * MS_PER_DAY
  return new Date(Math.min(windowFloor, baseFloor)).toISOString()
}

// The generation body, factored out of the HTTP handler so it is unit-testable with
// an injected client + reference `now` (no Deno.serve, no Date.now()).
export async function generateReportForPet(
  supabase: SupabaseClient,
  petId: string,
  nowMs: number,
  requestedWindow: { startDate: string; endDate: string } | null,
  callerJwt: string | null = null,
  // PR 7 — service-role client used ONLY to download incident-photo bytes (private bucket) for the
  // paths RLS already scoped to the verified owner's pet. Null ⇒ photos are not embedded (their
  // dataUri stays null → the render shows placeholders): the report still generates. The unit tests
  // pass null (no live Storage); the handler passes a real admin client.
  adminClient: SupabaseClient | null = null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowIso = new Date(nowMs).toISOString()

  // 1. Ownership re-check (confused-deputy guard) + signalment + the window-
  //    determining rows. All RLS-scoped by the caller's JWT — a pet the caller
  //    does not own returns null → 404. Owner name + tz come from the caller's own
  //    profile (RLS: auth.uid() = id), the PIMS-filing identity (spec §7.1).
  const [petRes, profileRes, vetVisitsRes, dietTrialsRes] = await Promise.all([
    supabase
      .from('pets')
      .select('id, name, species, breed, sex, date_of_birth, date_of_birth_precision, weight_kg')
      .eq('id', petId)
      .maybeSingle(),
    supabase.from('user_profiles').select('display_name, timezone').maybeSingle(),
    supabase.from('vet_visits').select('visited_at, clinic_name, vet_name, reason').eq('pet_id', petId),
    supabase
      .from('diet_trials')
      .select(
        'id, food_item_id, started_at, target_duration_days, status, completed_at, vet_name, ' +
          'food_items(food_type, format, primary_protein, brand, product_name)',
      )
      .eq('pet_id', petId),
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
  const timezone = profile?.timezone || null
  const vetVisits = mapVetVisitRows(rowsOrThrow<VetVisitRow>(vetVisitsRes, 'vet_visits'))
  const dietTrials = mapDietTrialRows(rowsOrThrow<DietTrialRow>(dietTrialsRes, 'diet_trials'))

  // 2. Resolve the window (§6 cascade) from the small window-determining rows, so
  //    the heavy event pull can be bounded to cover exactly that window (+ buffer).
  const scope = resolveScope({
    now: nowIso,
    timezone,
    pet,
    ownerName,
    requestedWindow,
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    dietTrials,
    vetVisits,
    feedingArrangements: [],
    conditions: [],
  })
  const lookbackIso = computeLookbackIso(scope, nowMs)

  // 3. Pull the remaining rows — every read RLS-scoped by the caller's JWT.
  const [
    eventsRes,
    aiRes,
    weightRes,
    dosesRes,
    medsRes,
    arrangementsRes,
    conditionsRes,
    attachmentsRes,
  ] = await Promise.all([
    // All non-deleted events over the lookback (every type — report.ts scopes,
    // dedups and filters by type internally; meals carry their food join).
    supabase
      .from('events')
      .select(
        'id, event_type, occurred_at, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, ' +
          'severity, notes, created_at, ' +
          'meals(food_item_id, intake_rating, quantity, food_items(food_type, format, primary_protein, brand, product_name))',
      )
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .gte('occurred_at', lookbackIso),
    // Vomit phenotype source (migration 013). Keyed by pet_id; report.ts looks each
    // up by event_id. No occurred_at column → pulled for the pet (bounded, sparse).
    supabase
      .from('event_ai_analysis')
      .select(
        'event_id, status, colour, contents, consistency, blood_present, bile_present, ' +
          'foreign_material_present, foreign_material_note, edited_at',
      )
      .eq('pet_id', petId),
    // Weigh-ins (migration 024) — timing + soft-delete come from the parent event.
    supabase
      .from('weight_checks')
      .select('event_id, weight_kg, events(occurred_at, deleted_at)')
      .eq('pet_id', petId),
    // Administered doses (migration 020/023) — timing + soft-delete from the parent.
    // medication_administrations has TWO FKs to events (event_id + B-156's
    // paired_event_id), so the embed MUST name the constraint or PostgREST 201s
    // (the B-196 ambiguity crash) — disambiguate to the parent-dose FK.
    supabase
      .from('medication_administrations')
      .select(
        'event_id, medication_id, medication_item_id, adherence, dose_amount, paired_event_id, ' +
          'events!medication_administrations_event_id_fkey(occurred_at, deleted_at)',
      )
      .eq('pet_id', petId),
    // Regimens (migration 020) — spans + the item join for strength/is_prescription.
    // No deleted_at (a regimen is "ended", not soft-deleted) and no lookback filter
    // (an old completed course is a valid historical confounder; report.ts scopes).
    supabase
      .from('medications')
      .select(
        'id, medication_item_id, drug_name, dose_amount, route, doses_per_day, schedule_notes, ' +
          'indication, prescribed_by, started_at, target_duration_days, status, ended_at, ' +
          'medication_items(is_prescription, strength)',
      )
      .eq('pet_id', petId),
    // Free-fed / meal-fed standing facts (B-040). No lookback: a bowl set long ago
    // and still down is a current standing exposure; the window overlap is resolved
    // in report.ts. Soft-deleted arrangements excluded.
    supabase
      .from('feeding_arrangements')
      .select('id, food_item_id, method, active_from, active_until, is_shared, food_items(primary_protein, brand, product_name)')
      .eq('pet_id', petId)
      .is('deleted_at', null),
    supabase.from('conditions').select('condition_name, status, diagnosed_at').eq('pet_id', petId),
    // Incident-photo attachments (migration 003, PR 7). RLS-scoped by pet ownership, so this
    // enumerates ONLY the verified owner's pet's attachments — the trusted path set later handed
    // to the service-role Storage download. report.ts scopes to window observation incidents; a
    // meal/food photo pulled here is simply never surfaced as an incident. Metadata rows are tiny,
    // so no lookback bound is needed (the storage fetch itself is capped in embedIncidentPhotos).
    supabase.from('event_attachments').select('event_id, storage_path, mime_type, sort_order').eq('pet_id', petId),
  ])

  // weight_checks / medication_administrations carry no occurred_at column (it lives on
  // the parent event), so they can't be .gte-bounded in the query the way `events` is —
  // bound them here against the same lookback floor so a chronic-regimen pet doesn't
  // process its entire dose/weight history (report.ts scopes to the window regardless).
  const lookbackMs = Date.parse(lookbackIso)

  const doses = mapDoseRows(rowsOrThrow<DoseRow>(dosesRes, 'medication_administrations'), lookbackMs)
  // §3.8 orphan-dose gap: resolve names for the medication_items behind the doses so an ad-hoc dose
  // logged with NO regimen still reports by drug name (a daily OTC antihistamine otherwise vanished
  // from the report). Fetched by the exact item ids present on the doses — the global catalog, the
  // same RLS the regimen→medication_items join already relies on. Skipped when there are no doses.
  const doseItemIds = [...new Set(doses.map((d) => d.medicationItemId).filter((v): v is string => v !== null))]
  let medicationItems: ReportMedicationItemInput[] = []
  if (doseItemIds.length > 0) {
    const medItemsRes = await supabase
      .from('medication_items')
      .select('id, generic_name, brand_name, strength, default_route, is_prescription')
      .in('id', doseItemIds)
    medicationItems = mapMedicationItemRows(rowsOrThrow<MedicationItemRow>(medItemsRes, 'medication_items'))
  }

  const input: ReportInput = {
    now: nowIso,
    timezone,
    pet,
    ownerName,
    requestedWindow,
    events: mapEventRows(rowsOrThrow<EventRow>(eventsRes, 'events')),
    aiAnalyses: mapAiAnalysisRows(rowsOrThrow<AiAnalysisRow>(aiRes, 'event_ai_analysis')),
    weightChecks: mapWeightRows(rowsOrThrow<WeightRow>(weightRes, 'weight_checks'), lookbackMs),
    doses,
    medications: mapMedicationRows(rowsOrThrow<MedicationRow>(medsRes, 'medications')),
    medicationItems,
    dietTrials,
    vetVisits,
    feedingArrangements: mapFeedingArrangementRows(rowsOrThrow<ArrangementRow>(arrangementsRes, 'feeding_arrangements')),
    conditions: mapConditionRows(rowsOrThrow<ConditionRow>(conditionsRes, 'conditions')),
    attachments: mapAttachmentRows(rowsOrThrow<AttachmentRow>(attachmentsRes, 'event_attachments')),
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
    },
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  let petId: string
  let requestedWindow: { startDate: string; endDate: string } | null = null
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
    }
    petId = body.petId ?? ''
    const start = body.startDate ?? body.start_date
    const end = body.endDate ?? body.end_date
    if (start && end) requestedWindow = { startDate: start, endDate: end }
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
    const { status, body } = await generateReportForPet(supabase, petId, Date.now(), requestedWindow, callerJwt, adminClient)
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
})
