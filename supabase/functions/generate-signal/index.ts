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
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
  type Finding,
  type CoverageDiagnostic,
  type SymptomEvent,
  type MealEvent,
  type FeedingArrangement,
  type SymptomType,
  type IntakeRating,
  type Species,
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
  // Reflections (③, B-051) AND symptom-worsening (④) are phrased DETERMINISTICALLY —
  // never sent to the LLM. Both are count statements ("4 episodes of vomiting this week
  // — same as last week" / "...up from 2 last week"); the model adds little warmth but
  // introduces real reassurance-drift risk ("on the mend", "trending the right way"),
  // and validatePhrasing's keyword screen cannot reliably catch paraphrase (adversarial
  // review, B-051). Worsening is a SAFETY count where editorializing is most dangerous —
  // exactly where the model must not be in the loop — so we render the template, which
  // is guardrail-clean by construction and tested (clinical-guardrails Pattern 8).
  if (finding.type === 'reflection' || finding.type === 'symptom_worsening') return fallback
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

// ── DB → DetectionInput mapping ───────────────────────────────────────────────

interface SymptomRow {
  id: string
  event_type: string
  occurred_at: string
  severity: number | null
}

type FoodItemJoin = {
  primary_protein: string | null
  food_type: string | null
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
    severity: r.severity,
  }))
}

interface ArrangementRow {
  id: string
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

function mapMealRows(rows: MealEventRow[]): MealEvent[] {
  return rows.map((r) => {
    const meal = first(r.meals)
    const fi = first(meal?.food_items)
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      foodItemId: meal?.food_item_id ?? null,
      primaryProtein: fi?.primary_protein ?? null,
      intakeRating: (meal?.intake_rating ?? null) as IntakeRating | null,
      foodType: (fi?.food_type ?? null) as 'meal' | 'treat' | 'other' | null,
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
    const [petRes, symptomsRes, mealsRes, trialRes, arrangementsRes] = await Promise.all([
      supabase.from('pets').select('name, species').eq('id', petId).maybeSingle(),
      supabase
        .from('events')
        .select('id, event_type, occurred_at, severity')
        .eq('pet_id', petId)
        .in('event_type', [...CORRELATION_SYMPTOM_TYPES])
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso),
      supabase
        .from('events')
        .select(
          'id, occurred_at, meals(food_item_id, intake_rating, food_items(primary_protein, food_type, brand, product_name))',
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
        .select('id, is_shared, active_from, active_until, food_items(primary_protein)')
        .eq('pet_id', petId)
        .eq('method', 'free_choice')
        .is('deleted_at', null),
    ])

    const pet = petRes.data as { name: string; species: string } | null
    if (!pet) {
      return Response.json({ error: 'Pet not found' }, { status: 404, headers: CORS_HEADERS })
    }
    const petName = pet.name || 'your pet'

    const symptomEvents = mapSymptomRows((symptomsRes.data ?? []) as SymptomRow[])
    const mealEvents = mapMealRows((mealsRes.data ?? []) as MealEventRow[])
    const feedingArrangements = mapArrangementRows((arrangementsRes.data ?? []) as ArrangementRow[])
    const dietTrialActive = ((trialRes.data ?? []) as unknown[]).length > 0

    // 2. Detect — the pure engine ranks already-true findings (safety leads).
    const input: DetectionInput = {
      pet: { name: petName, species: pet.species as Species, dietTrialActive },
      symptomEvents,
      mealEvents,
      feedingArrangements,
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
    })
    if (insertError) throw new Error(`ai_signals write failed: ${insertError.message}`)

    return Response.json(
      { is_building: isBuilding, signal_text: signalText, findings: cachedFindings, coverage },
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
