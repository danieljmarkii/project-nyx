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
// path and NO Storage write here — the immutable snapshot row, the public
// `view-report` route, and the §8 photo-privacy machinery are PR 6/7 (the first
// unauthenticated path, gated by rls-privacy-reviewer). Keeping PR 5 authenticated
// makes it cheap and reversible while the first real-vet reaction lands (spec §12).
//
// SECURITY — confused-deputy guard (spec §7/§8). The client stub sends a body
// `petId` (a live trap). We NEVER trust it beyond what the caller's own JWT
// authorizes: every read runs through a user-scoped client, so RLS enforces pet
// ownership on every table — exactly like generate-signal. The explicit pet load
// is the ownership re-check (RLS returns nothing for a pet the caller doesn't own
// → 404). No service role is used in PR 5: there is no Storage download/write and
// no cross-user data, so RLS is the whole boundary (its strongest form). The
// service-role pull + Storage write arrive in PR 6 with the public path and its
// mandatory rls-privacy-reviewer gate.

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
  type ReportDietTrialInput,
  type ReportVetVisitInput,
  type ReportFeedingArrangementInput,
  type ReportConditionInput,
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

// ── DB row shapes (the raw select results) ────────────────────────────────────

interface PetRow {
  id: string
  name: string
  species: string
  breed: string | null
  sex: string
  date_of_birth: string | null
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

/** Weigh-ins carry their timing on the PARENT event; soft-delete is on the parent
 * too (1:1 child), so a weigh-in whose event was soft-deleted is dropped here. */
export function mapWeightRows(rows: WeightRow[]): ReportWeightCheckInput[] {
  const out: ReportWeightCheckInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev || ev.deleted_at) continue
    const kg = num(r.weight_kg)
    if (kg === null) continue
    out.push({ eventId: r.event_id, weightKg: kg, occurredAt: ev.occurred_at })
  }
  return out
}

/** Doses carry timing on the parent event; drop soft-deleted parents. The clinical
 * on-board filtering (missed/refused/in-doubt-combo) stays in report.ts/detection. */
export function mapDoseRows(rows: DoseRow[]): ReportDoseInput[] {
  const out: ReportDoseInput[] = []
  for (const r of rows) {
    const ev = first(r.events)
    if (!ev || ev.deleted_at) continue
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

/**
 * The event-pull floor: far enough back to fully cover the resolved window (even a
 * long since-visit range) plus CHERRY_PICK_LOOKBACK_DAYS of pre-window history for
 * the custom-window out-of-range disclosure, and at least BASE_LOOKBACK_DAYS.
 * Pure + exported so the boundary math is unit-tested, not asserted.
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
): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowIso = new Date(nowMs).toISOString()

  // 1. Ownership re-check (confused-deputy guard) + signalment + the window-
  //    determining rows. All RLS-scoped by the caller's JWT — a pet the caller
  //    does not own returns null → 404. Owner name + tz come from the caller's own
  //    profile (RLS: auth.uid() = id), the PIMS-filing identity (spec §7.1).
  const [petRes, profileRes, vetVisitsRes, dietTrialsRes] = await Promise.all([
    supabase
      .from('pets')
      .select('id, name, species, breed, sex, date_of_birth, weight_kg')
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

  const petRow = petRes.data as PetRow | null
  if (!petRow) {
    // Not found OR not owned — indistinguishable by design (no ownership oracle).
    return { status: 404, body: { error: 'Pet not found' } }
  }

  const profile = profileRes.data as { display_name: string | null; timezone: string | null } | null
  const pet = mapPet(petRow)
  const ownerName = profile?.display_name?.trim() || null
  const timezone = profile?.timezone || null
  const vetVisits = mapVetVisitRows((vetVisitsRes.data ?? []) as unknown as VetVisitRow[])
  const dietTrials = mapDietTrialRows((dietTrialsRes.data ?? []) as unknown as DietTrialRow[])

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
  ])

  const input: ReportInput = {
    now: nowIso,
    timezone,
    pet,
    ownerName,
    requestedWindow,
    events: mapEventRows((eventsRes.data ?? []) as unknown as EventRow[]),
    aiAnalyses: mapAiAnalysisRows((aiRes.data ?? []) as unknown as AiAnalysisRow[]),
    weightChecks: mapWeightRows((weightRes.data ?? []) as unknown as WeightRow[]),
    doses: mapDoseRows((dosesRes.data ?? []) as unknown as DoseRow[]),
    medications: mapMedicationRows((medsRes.data ?? []) as unknown as MedicationRow[]),
    dietTrials,
    vetVisits,
    feedingArrangements: mapFeedingArrangementRows((arrangementsRes.data ?? []) as unknown as ArrangementRow[]),
    conditions: mapConditionRows((conditionsRes.data ?? []) as unknown as ConditionRow[]),
  }

  // 4. Pure assembly → pure render. No LLM, no I/O, no mutation.
  const snapshot = assembleReport(input)
  const html = renderReport(snapshot)

  return {
    status: 200,
    body: {
      html,
      pet_name: snapshot.signalment.name,
      start_date: snapshot.scope.startDate,
      end_date: snapshot.scope.endDate,
      scope_basis: snapshot.scope.basis,
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

  try {
    const { status, body } = await generateReportForPet(supabase, petId, Date.now(), requestedWindow)
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
