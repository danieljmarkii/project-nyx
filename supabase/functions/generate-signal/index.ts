// Supabase Edge Function — generate-signal  (B-045, Step 2)
//
// The AI Signal generator. Architecture B (docs/nyx-ai-signal-requirements.md
// §2, unanimous): DETERMINISTIC DETECTION + LLM PHRASING. The server computes
// and ranks *already-true* findings via the pure detection engine
// (./detection.ts); Claude is handed each finding's structured payload ONLY to
// render one warm sentence. The model never sees a raw event log and never
// decides whether a pattern exists — it cannot invent a correlation.
//
// Pipeline (§2):
//   1. Detect    — run detectSignals() over the pet's events + meals.
//   2. Curate    — cap the low/medium-priority insight set (§3.2); safety/
//                  concern findings are NEVER dropped to honor the cap.
//   3. Phrase    — one Haiku sentence per surfaced finding, in parallel, each
//                  independently falling back to a templated sentence.
//   4. Cache     — write the ordered set to ai_signals.findings (24h TTL).
//   5. Fallback  — on ANY LLM failure the surface is still written, from the
//                  deterministic template. It is never blank because the API
//                  failed (§2 hard rule).
//
// The phrasing / curation / guardrail logic is the pure ./phrasing.ts module
// (unit-tested offline in phrasing.test.ts, mirroring detection.ts). This file
// is the I/O shell: DB reads, the Claude call, and the cache write. It runs with
// the caller's JWT so RLS enforces pet ownership on every read and the cache
// write — no service role needed (no storage, no cross-user data).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  detectSignals,
  detectCoverage,
  doseToMedicationWindow,
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
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
  type DetectionInput,
} from './detection.ts'
import {
  templateForFinding,
  validatePhrasing,
  curateFindings,
  buildBuildingText,
  phrasingPayload,
  PHRASE_TOOL,
  PHRASING_SYSTEM,
  type CachedFinding,
} from './phrasing.ts'
import {
  buildSummaryPacket,
  summaryTemplate,
  summaryModelPayload,
  validateSummary,
  shouldPhraseWithModel,
  SUMMARY_MODEL_PHRASING_ENABLED,
  SUMMARY_TOOL,
  SUMMARY_SYSTEM,
  type CachedSummary,
  type SummaryFactPacket,
} from './summary.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// How far back to pull events. Generous enough for an Established correlation
// (weeks–months) and the 14-day intake baseline, bounded so the query stays on
// the (pet_id, occurred_at) index for a dogfooding-scale dataset.
const LOOKBACK_DAYS = 180

// Claude model for phrasing (PM decision, B-045 Step 2): Haiku 4.5. The
// clinical/statistical reasoning is fully deterministic upstream; the model
// only renders copy from an already-true payload, with a templated fallback,
// so the cheapest capable model is the right call for a per-finding, per-pet,
// daily-cached call (B-001 cost). Bump this one constant if voice disappoints.
const PHRASING_MODEL = 'claude-haiku-4-5'

const MS_PER_DAY = 86_400_000

// ── Phrasing call (the only LLM use; reasoning stays deterministic upstream) ──

interface ClaudeToolResponse {
  content?: Array<{ type: string; name?: string; input?: { sentence?: string } }>
}

// Phrase one finding. Returns the model sentence if it passes validation,
// otherwise the deterministic template — so this never throws and never blanks.
async function phraseFinding(finding: Finding, petName: string): Promise<string> {
  const fallback = templateForFinding(finding, petName)
  // Reflections (③, B-051), symptom-worsening (④), postprandial-timing (⑤, B-078) AND
  // time-of-day clustering (⑥, B-079) are phrased DETERMINISTICALLY — never sent to the LLM.
  // All are count statements ("4 episodes of vomiting this week — same as last week" /
  // "...up from 2 last week" / "4 of 12 we could time, within 30 min of eating" / "5 of 8
  // between 4am and 8am"); the model adds little warmth but introduces real drift risk —
  // reassurance ("on the mend") for ③/④, and for ⑤/⑥ a slide back into mechanism
  // ("regurgitation"/"bilious") or food attribution that validatePhrasing's keyword screen
  // cannot reliably catch by paraphrase (adversarial review, B-051 / §2 of the descriptive
  // spec). We render the template, which is guardrail-clean by construction and tested.
  if (
    finding.type === 'reflection' ||
    finding.type === 'symptom_worsening' ||
    finding.type === 'symptom_chronicity' ||
    finding.type === 'postprandial_timing' ||
    finding.type === 'timeofday_clustering'
  ) {
    return fallback
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('generate-signal: ANTHROPIC_API_KEY unset — using template')
    return fallback
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PHRASING_MODEL,
        max_tokens: 200,
        system: PHRASING_SYSTEM,
        tools: [PHRASE_TOOL],
        tool_choice: { type: 'tool', name: 'phrase_insight' },
        messages: [
          {
            role: 'user',
            content:
              'Phrase this finding as one sentence, using only the facts in this JSON:\n' +
              JSON.stringify(phrasingPayload(finding, petName)),
          },
        ],
      }),
    })
    if (!res.ok) {
      console.warn(`generate-signal: phrasing API ${res.status} — using template`)
      return fallback
    }
    const data = (await res.json()) as ClaudeToolResponse
    const block = (data.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === 'phrase_insight',
    )
    const sentence = block?.input?.sentence?.trim()
    if (sentence && validatePhrasing(sentence, finding)) return sentence
    console.warn('generate-signal: phrasing missing or failed validation — using template')
    return fallback
  } catch (err) {
    console.warn('generate-signal: phrasing error — using template:', err)
    return fallback
  }
}

// ── AI summary phrasing (B-023 PR 4 — the dashboard centerpiece) ──────────────
// Mirrors phraseFinding: the model is handed the already-true DRAFT sentences and asked
// only to weave them into 2–4 cohesive sentences. validateSummary rejects any number not
// in the packet, any reassurance/causal/disease/preference drift, and (on a safety summary)
// the silent removal of vet-routing. Any failure → the deterministic template. Never throws,
// never reassures, never blank.
async function phraseSummaryText(packet: SummaryFactPacket): Promise<CachedSummary> {
  const template = summaryTemplate(packet)
  const base: Omit<CachedSummary, 'text' | 'source'> = {
    evidence: packet.evidence,
    hasSafety: packet.hasSafety,
    quiet: packet.quiet,
  }
  // Restraint (PR-4 adversarial review). v1 ships TEMPLATE-ONLY — SUMMARY_MODEL_PHRASING_ENABLED
  // is false, so the model is never called (the summary is a descriptive count statement, phrased
  // template-only like ③/④/⑤/⑥; see the kill-switch doc). Even when re-enabled, the model stays
  // off SAFETY and QUIET summaries (shouldPhraseWithModel) — those are always deterministic.
  if (!SUMMARY_MODEL_PHRASING_ENABLED || !shouldPhraseWithModel(packet)) {
    return { ...base, text: template, source: 'template' }
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('generate-signal: ANTHROPIC_API_KEY unset — summary using template')
    return { ...base, text: template, source: 'template' }
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PHRASING_MODEL,
        max_tokens: 320,
        system: SUMMARY_SYSTEM,
        tools: [SUMMARY_TOOL],
        tool_choice: { type: 'tool', name: 'write_summary' },
        messages: [
          {
            role: 'user',
            content:
              'Weave these already-true draft sentences into one cohesive summary, using only ' +
              'the facts in this JSON:\n' + JSON.stringify(summaryModelPayload(packet)),
          },
        ],
      }),
    })
    if (!res.ok) {
      console.warn(`generate-signal: summary API ${res.status} — using template`)
      return { ...base, text: template, source: 'template' }
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: { summary?: string } }>
    }
    const block = (data.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === 'write_summary',
    )
    const summary = block?.input?.summary?.trim()
    if (summary && validateSummary(summary, packet)) {
      return { ...base, text: summary, source: 'model' }
    }
    console.warn('generate-signal: summary missing or failed validation — using template')
    return { ...base, text: template, source: 'template' }
  } catch (err) {
    console.warn('generate-signal: summary error — using template:', err)
    return { ...base, text: template, source: 'template' }
  }
}

// ── DB → DetectionInput mapping ───────────────────────────────────────────────

interface SymptomRow {
  id: string
  event_type: string
  occurred_at: string
  occurred_at_confidence: string | null
  severity: number | null
}

type FoodItemJoin = {
  primary_protein: string | null
  food_type: string | null
  // B-102 PR 5: physical-form enum. Read so detection can derive the human-food provenance
  // covariate (computeHumanFoodProvenance); ignored by every existing detector.
  format: string | null
  brand: string
  product_name: string
}
type MealJoin = {
  food_item_id: string | null
  intake_rating: string | null
  food_items: FoodItemJoin | FoodItemJoin[] | null
}
interface MealEventRow {
  id: string
  occurred_at: string
  occurred_at_confidence: string | null
  meals: MealJoin | MealJoin[] | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function mapSymptomRows(rows: SymptomRow[]): SymptomEvent[] {
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

interface ArrangementRow {
  id: string
  food_item_id: string | null
  is_shared: boolean
  active_from: string | null
  active_until: string | null
  food_items: { primary_protein: string | null } | { primary_protein: string | null }[] | null
}

// Map active free_choice arrangements to standing exposures (B-040 R1, PR 4). Only
// free_choice rows are fetched (meal_fed is vet-report metadata, not a standing
// exposure — its intake IS the discrete meal stream). is_shared → 'low' attribution
// (multi-cat shared bowl, deferred); in R1 is_shared is always FALSE → 'high'
// (single-pet free-fed: no other pet could have eaten it). Forward-compatible for free.
function mapArrangementRows(rows: ArrangementRow[]): FeedingArrangement[] {
  return rows.map((r) => {
    const fi = first(r.food_items)
    return {
      id: r.id,
      primaryProtein: fi?.primary_protein ?? null,
      activeFrom: r.active_from,
      activeUntil: r.active_until,
      attributionConfidence: r.is_shared ? 'low' : 'high',
    }
  })
}

// ── Medication confounder windows (B-117 PR 9, §8) ────────────────────────────
// Two DB shapes resolve to one MedicationWindow span set (see detection.ts):
//   • a `medications` regimen row → a continuous span [started_at, ended_at].
//   • an administered `medication` dose event → a POINT at occurred_at.
// Both run with the caller's JWT, so medications_owner / medication_administrations_owner
// RLS scope them to the owner's pets — no service role, like every other read here.

interface RegimenRow {
  medication_item_id: string | null
  started_at: string | null // DATE; parses to that day's UTC midnight = start-of-day (correct span start)
  ended_at: string | null // DATE; the drug is on board through the WHOLE day → end-of-day-inclusive below
}

type MedAdminJoin = {
  medication_item_id: string | null
  adherence: string | null
  // B-156 PR C1: the meal/treat event this dose rode inside (a pill in a Delectable), or null
  // for a standalone dose. Migration 023; nullable FK → events(id). Used to (a) attribute the
  // vehicle food to the drug and (b) reconcile an in-doubt combo dose's on-board status (B-174).
  paired_event_id: string | null
}
interface MedDoseEventRow {
  occurred_at: string
  medication_administrations: MedAdminJoin | MedAdminJoin[] | null
}

// A regimen's DATE end is inclusive of the whole ended_at day (the pet took it that day), so
// push activeUntil to that day's END — mirrors classifyArrangements' free-feeding +1-day. Done
// HERE (not in the engine) because dose windows are precise instants the engine must NOT widen;
// keeping the DATE-vs-timestamp knowledge in the caller lets classifyMedicationWindows stay a
// pure instant-span parser. An unparseable end is passed through raw → the engine drops it.
function regimenEndIso(endedAt: string | null): string | null {
  if (endedAt == null) return null // still active → on board through now (engine: +Infinity)
  const ms = Date.parse(endedAt)
  if (Number.isNaN(ms)) return endedAt
  return new Date(ms + MS_PER_DAY).toISOString()
}

function mapMedicationWindows(
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

// `pairedEventIds` = the set of meal/treat event ids that are the VEHICLE for a live (non-soft-
// deleted) medication dose (B-156 PR C1). A meal in this set is the drug's carrier, so detection
// attributes its protein to the drug rather than crediting it as a food correlate. Empty (no
// combos logged) ⇒ no meal is flagged ⇒ byte-identical to pre-B-156 behavior.
function mapMealRows(rows: MealEventRow[], pairedEventIds: Set<string>): MealEvent[] {
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
  try {
    const body = (await req.json()) as { petId?: string }
    petId = body.petId ?? ''
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!petId || typeof petId !== 'string') {
    return Response.json({ error: 'petId required' }, { status: 400, headers: CORS_HEADERS })
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  try {
    const nowMs = Date.now()
    const lookbackIso = new Date(nowMs - LOOKBACK_DAYS * MS_PER_DAY).toISOString()

    // 1. Load pet, symptom events, meal events, active diet trial — all
    //    ownership-scoped by RLS via the caller's JWT. Soft-deleted rows are
    //    excluded here (the detection module's documented contract).
    const [petRes, symptomsRes, mealsRes, trialRes, arrangementsRes, profileRes, regimensRes, doseEventsRes] =
      await Promise.all([
      supabase.from('pets').select('name, species').eq('id', petId).maybeSingle(),
      supabase
        .from('events')
        .select('id, event_type, occurred_at, occurred_at_confidence, severity')
        .eq('pet_id', petId)
        .in('event_type', [...CORRELATION_SYMPTOM_TYPES])
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso),
      supabase
        .from('events')
        .select(
          'id, occurred_at, occurred_at_confidence, meals(food_item_id, intake_rating, food_items(primary_protein, food_type, format, brand, product_name))',
        )
        .eq('pet_id', petId)
        .eq('event_type', 'meal')
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso),
      supabase.from('diet_trials').select('id').eq('pet_id', petId).eq('status', 'active').limit(1),
      // Active free-fed standing facts (B-040 R1, PR 4). No lookback filter: a
      // free_choice bowl set months ago and still down is a current standing exposure.
      // The active-window overlap is resolved inside detection, not the query.
      supabase
        .from('feeding_arrangements')
        .select('id, food_item_id, is_shared, active_from, active_until, food_items(primary_protein)')
        .eq('pet_id', petId)
        .eq('method', 'free_choice')
        .is('deleted_at', null),
      // Caller's IANA timezone (B-079, detector ⑥). RLS on user_profiles scopes to the
      // owner's own row (auth.uid() = id), so this returns the pet owner's profile. Absent
      // / unreadable ⇒ undefined ⇒ ⑥ stays silent (never guess UTC — §4.2).
      supabase.from('user_profiles').select('timezone').maybeSingle(),
      // Medication regimens (B-117 PR 9, §8) — exposure spans [started_at, ended_at]. No
      // deleted_at (a regimen is "ended", not soft-deleted) and no lookback filter: an old
      // completed course is a valid historical confounder, and the [from,until] overlap with
      // the bounded symptom set is resolved inside detection. Status is irrelevant to the
      // span — started_at + ended_at fully define it (active → null end → through now).
      supabase.from('medications').select('medication_item_id, started_at, ended_at').eq('pet_id', petId),
      // Administered medication dose events (B-117 PR 9) — point exposures at occurred_at, the
      // dominant signal today since logged doses are regimen-unlinked (B-135). Same shape as the
      // meals join; soft-deleted + out-of-lookback rows excluded here (the engine's contract).
      // missed/refused doses are filtered in mapMedicationWindows (doseToMedicationWindow).
      supabase
        .from('events')
        .select('occurred_at, medication_administrations(medication_item_id, adherence, paired_event_id)')
        .eq('pet_id', petId)
        .eq('event_type', 'medication')
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso),
    ])

    const pet = petRes.data as { name: string; species: string } | null
    if (!pet) {
      return Response.json({ error: 'Pet not found' }, { status: 404, headers: CORS_HEADERS })
    }
    const petName = pet.name || 'your pet'

    const mealRows = (mealsRes.data ?? []) as MealEventRow[]
    const doseRows = (doseEventsRes.data ?? []) as MedDoseEventRow[]
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

    const symptomEvents = mapSymptomRows((symptomsRes.data ?? []) as SymptomRow[])
    const mealEvents = mapMealRows(mealRows, pairedEventIds)
    const arrangementRows = (arrangementsRes.data ?? []) as ArrangementRow[]
    const feedingArrangements = mapArrangementRows(arrangementRows)
    // Foods CURRENTLY free-fed (active_until IS NULL) — the §11 #6 exclusion set for the
    // summary's finished-rate. Matches the client's getActiveArrangementsForPet definition
    // (free_choice + active_until IS NULL + not deleted) so the dashboard card and the
    // summary agree on which foods' intake isn't directly observed.
    const freeFedFoodIds = new Set<string>(
      arrangementRows.filter((r) => r.active_until === null && r.food_item_id).map((r) => r.food_item_id as string),
    )
    const dietTrialActive = ((trialRes.data ?? []) as unknown[]).length > 0
    // B-079 (⑥): the owner's IANA timezone. A non-string / empty value ⇒ undefined ⇒ ⑥ silent.
    const profile = profileRes.data as { timezone: string | null } | null
    const timezone = profile?.timezone || undefined
    // B-117 PR 9 (§8): medication confounder windows — regimen spans + administered dose points.
    // Empty (no meds logged) ⇒ detectCorrelations behaves exactly as before.
    const medicationWindows = mapMedicationWindows(
      (regimensRes.data ?? []) as RegimenRow[],
      doseRows,
      mealIntakeById,
    )

    // 2. Detect — the pure engine ranks already-true findings (safety leads).
    const input: DetectionInput = {
      pet: { name: petName, species: pet.species as Species, dietTrialActive },
      symptomEvents,
      mealEvents,
      feedingArrangements,
      medicationWindows,
      timezone,
      now: new Date(nowMs).toISOString(),
    }
    const ranked = detectSignals(input, DEFAULT_CONFIG)

    // 3. Curate — cap the insight tail; safety findings always kept.
    const curated = curateFindings(ranked)

    // 4. Phrase — one sentence per finding, in parallel, each falling back to
    //    its template independently. The set is never blank because the LLM
    //    failed (§2): a failed call yields the template, not a dropped card.
    const cachedFindings: CachedFinding[] = await Promise.all(
      curated.map(async (r) => ({
        rank: r.rank,
        text: await phraseFinding(r.finding, petName),
        finding: r.finding,
      })),
    )

    // 4b. AI summary (B-023 PR 4). Assemble a DETERMINISTIC fact packet from the curated
    //     findings + the descriptive intake aggregates (computed over the same in-memory
    //     meal/symptom arrays — no second DB read), then phrase it (Haiku join-and-smooth,
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
    const summary: CachedSummary | null = summaryPacket ? await phraseSummaryText(summaryPacket) : null

    // 5. Cache. Empty findings = building/stale (§3.3), NEVER an all-clear (§9).
    const isBuilding = cachedFindings.length === 0
    const hasRecentActivity = [...symptomEvents, ...mealEvents].some(
      (e) => nowMs - Date.parse(e.occurredAt) <= 2 * MS_PER_DAY,
    )
    const signalText = isBuilding
      ? buildBuildingText(petName, hasRecentActivity)
      : cachedFindings[0].text

    // Coverage diagnostics (B-053) — the "why no signal yet?" reasons. We compute
    // them whenever there are NO findings (isBuilding); the server cannot know which
    // empty-state the client will derive (building/no_pattern/stale needs the local
    // hasSubstantialHistory the server doesn't have), so it caches coverage for any
    // empty result and the CLIENT renders the top diagnostic only on no_pattern. The
    // detectors are individually safe on a truly-empty pet (rate_meals needs ≥1 meal,
    // staple_washout needs a single protein + symptoms), so a pure building pet
    // yields []. Per §9 these describe DATA COVERAGE, never wellness.
    const coverage: CoverageDiagnostic[] = isBuilding ? detectCoverage(input, DEFAULT_CONFIG) : []

    // Replace the pet's cached signal (last-write-wins; keeps row count bounded
    // without a unique constraint, matching the project's sync philosophy).
    await supabase.from('ai_signals').delete().eq('pet_id', petId)
    const { error: insertError } = await supabase.from('ai_signals').insert({
      pet_id: petId,
      signal_text: signalText,
      is_building: isBuilding,
      findings: cachedFindings,
      coverage,
      summary,
    })
    if (insertError) throw new Error(`ai_signals write failed: ${insertError.message}`)

    return Response.json(
      { is_building: isBuilding, signal_text: signalText, findings: cachedFindings, coverage, summary },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('generate-signal error:', message)
    return Response.json(
      { error: 'Signal generation failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
