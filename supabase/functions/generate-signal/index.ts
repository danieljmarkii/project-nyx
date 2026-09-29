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
// (unit-tested offline in phrasing.test.ts, mirroring detection.ts). Every step
// between the reads and the phrasing (map, detect, curate, decorate, the summary
// packet, the stand-down) is the pure ./pipeline.ts (Engines v3 PR-11b), which the
// EN-1 harness runs with no database. This file is the I/O shell: DB reads, the
// Claude call, and the cache write. It runs with the caller's JWT so RLS enforces
// pet ownership on every read and the cache write.
//
// ONE service-role write (Engines v3 PR-11a, CUL-1378 ruled at the plan): the row per
// served finding in `signal_shown_log`, keyed on the pet id the caller's own RLS-scoped
// `pets` read just returned. The admin client is built for that insert and does nothing
// else (_shared/engineStamps.ts insertShownLog carries why the log must not be
// client-writable).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DEFAULT_CONFIG,
  CORRELATION_SYMPTOM_TYPES,
  RED_FLAG_INCIDENT_TYPES,
  type Finding,
} from './detection.ts'
// Engines v3 PR-11b (CUL-1267): every step between the reads and the phrasing, pure. This
// file reads, phrases and writes; ./pipeline.ts decides what the Signal says.
import {
  assembleSignal,
  runSignalPipeline,
  templateSummary,
  type ActiveTrialRow,
  type ArrangementRow,
  type IncidentAnalysisRow,
  type MealEventRow,
  type MedDoseEventRow,
  type PriorSignal,
  type RegimenRow,
  type SymptomRow,
} from './pipeline.ts'
// Abort the Claude phrasing/summary calls after a bounded timeout (CUL-258). Both
// callers already fall back to the deterministic template on any throw, so a timeout
// degrades safely — it just stops a hung upstream from holding the function open.
import { fetchWithTimeout } from '../_shared/http.ts'
// CUL-989 — CUL-975's paged reader, shared with generate-report and ask.
import { fetchAll, incompletePullNames } from '../_shared/pull.ts'
import {
  templateForFinding,
  validatePhrasing,
  phrasingPayload,
  PHRASE_TOOL,
  PHRASING_SYSTEM,
} from './phrasing.ts'
// CUL-786 (Signal fold v1.1-a) — the labeled stand-down. Pure, offline-tested (standDown.test.ts);
// minted in ./pipeline.ts, after curation and the summary packet, and merged after phrasing, so
// the marker can never reach the cap, the model, the summary, or the vet report (which re-runs
// detection and never reads this cache).
import { type CachedEntry } from './standDown.ts'
// Engines v3 (PR-11a, CUL-1267): the rollout flag, read fail-closed for the pet's owner, and
// the one writer of the cache row's stamps and the shown log.
import { readEngineFlags } from '../_shared/engineFlagsRead.ts'
import {
  buildShownLogRows,
  engineFingerprint,
  insertShownLog,
  signalStampValues,
} from '../_shared/engineStamps.ts'
import {
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

// The Signal engine's version, one input to the cache row's engine_fingerprint (with
// DEFAULT_CONFIG, the phrasing model and the Engines flags; engineStamps.ts). Bump it with
// any change to detection, curation, decoration or phrasing that can change what a pet's
// Signal says: the fingerprint cannot see a code change this number does not record.
export const SIGNAL_ENGINE_VERSION = 'signal.3' // signal.3: CUL-989, paged newest-first reads and the incomplete-read rule. signal.2: CUL-1086, the intake lane excludes free-fed bowls by date (and PR-14's refusal rule, CUL-1190, which shipped under signal.1)

const MS_PER_DAY = 86_400_000

// CUL-989 — how long a Signal computed from an incomplete read is served before the client
// regenerates it. Short, because the shortfall is usually a write racing a multi-page pull,
// which the next read does not repeat; not zero, because a record past the page ceiling is
// incomplete on every read and the per-pet cap should not be spent re-reading it each open.
const INCOMPLETE_READ_TTL_MS = 60 * 60 * 1000

// ── Phrasing call (the only LLM use; reasoning stays deterministic upstream) ──

interface ClaudeToolResponse {
  content?: Array<{ type: string; name?: string; input?: { sentence?: string } }>
}

// Phrase one finding. Returns the model sentence if it passes validation,
// otherwise the deterministic template — so this never throws and never blanks.
async function phraseFinding(finding: Finding, petName: string, phrasingEnabled = true): Promise<string> {
  const fallback = templateForFinding(finding, petName)
  // T2-3 (§5.3): ai_signal_phrasing_enabled off ⇒ template-only phrasing (the
  // existing invisible degradation). Detection is untouched — the flag never gates
  // whether a finding surfaces, only whether the LLM renders its copy.
  if (!phrasingEnabled) return fallback
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
    // Signals v2 (CUL-7) — L1 (empty-stomach) + the merged timing_story are descriptive timing
    // counts, phrased deterministically like ⑤/⑥ (the model would drift toward the 'empty stomach'/
    // 'bilious' mechanism the template forbids).
    finding.type === 'empty_stomach_timing' ||
    finding.type === 'timing_story' ||
    // Signals v2 (CUL-8) — the trial-response lane is a count-anchored comparison; phrased
    // deterministically (never the LLM) so the model can never slide into a verdict ("working"/
    // "improving") the phrasing contract forbids. The template is guardrail-clean by construction.
    finding.type === 'trial_response' ||
    // Signals v2 (CUL-10) — the gap-shortening lane is a plain count of inter-episode gaps; phrased
    // deterministically (never the LLM) so the model can never add a verdict ("worsening") or a
    // reassuring "settling" to what is, by construction, an escalate-only observation. Template-clean.
    finding.type === 'gap_shortening' ||
    finding.type === 'timeofday_clustering' ||
    // B-340 — a SAFETY finding naming what a photo VISIBLY showed, routed to the vet. Template-only
    // (no LLM) is itself a structural never-reassure guarantee, matching the other safety templates.
    finding.type === 'incident_red_flag'
  ) {
    return fallback
  }
  // A JOINT correlation candidate (B-351 slice 6) is phrased deterministically too. Its
  // sentence carries two load-bearing clauses that validatePhrasing structurally cannot
  // police: that EVERY member of the cluster is named (a paraphrase that drops one credits
  // the survivor falsely and exonerates the dropped protein by omission — the exact false
  // attribution the cluster exists to prevent), and the resolving action. The keyword
  // screen can catch a causal verb; it cannot count proteins or notice a missing one. So
  // the joint card renders the template, which is correct by construction and tested.
  // Single-protein correlations are unchanged and still model-phrased.
  if (finding.type === 'food_symptom_correlation' && finding.jointCandidate) {
    return fallback
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('generate-signal: ANTHROPIC_API_KEY unset — using template')
    return fallback
  }
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
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
async function phraseSummaryText(packet: SummaryFactPacket, phrasingEnabled = true): Promise<CachedSummary> {
  // The deterministic form lives in ./pipeline.ts, so the harness and this function build it
  // one way. Every return below is it except the one validated model sentence.
  const templated = templateSummary(packet)
  // T2-3 (§5.3): the phrasing flag also forces the summary to its template. (v1
  // ships template-only anyway via SUMMARY_MODEL_PHRASING_ENABLED; this keeps the
  // flag authoritative if the model path is ever re-enabled.)
  if (!phrasingEnabled) return templated
  // Restraint (PR-4 adversarial review). v1 ships TEMPLATE-ONLY — SUMMARY_MODEL_PHRASING_ENABLED
  // is false, so the model is never called (the summary is a descriptive count statement, phrased
  // template-only like ③/④/⑤/⑥; see the kill-switch doc). Even when re-enabled, the model stays
  // off SAFETY and QUIET summaries (shouldPhraseWithModel) — those are always deterministic.
  if (!SUMMARY_MODEL_PHRASING_ENABLED || !shouldPhraseWithModel(packet)) {
    return templated
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('generate-signal: ANTHROPIC_API_KEY unset — summary using template')
    return templated
  }
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
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
      return templated
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: { summary?: string } }>
    }
    const block = (data.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === 'write_summary',
    )
    const summary = block?.input?.summary?.trim()
    if (summary && validateSummary(summary, packet)) {
      return { ...templated, text: summary, source: 'model' }
    }
    console.warn('generate-signal: summary missing or failed validation — using template')
    return templated
  } catch (err) {
    console.warn('generate-signal: summary error — using template:', err)
    return templated
  }
}

// ── DB → DetectionInput mapping ───────────────────────────────────────────────
// Moved to ./pipeline.ts (Engines v3 PR-11b) with every step between the reads and the
// phrasing. Re-exported for the existing suites (index.test.ts imports them from here).
export { mapMedDoseFacts, type RegimenRow, type MedDoseEventRow } from './pipeline.ts'

// CUL-1099: the dose pull resolves now (its embed names its FK), and the engine still does not
// read it. The adversarial pass on turning the dose rows on found they can SUPPRESS a true
// food correlate (a pill pocket that is the allergen, marked a drug vehicle; an as-needed
// antiemetic given after each vomit, read as a confounder that withdraws the vomit lane) and
// ADD claims (a new correlate once pocket exposures leave both arms; the med-on-board line),
// so by Engines v3's rule they go behind a flag rather than ship on this PR's proof. Held
// false, the Signal's output is byte-identical to what production has shown since June, when
// every dose read failed. CUL-1425 replaces this constant with a registered Engines key, gated
// in the pipeline, once the corpus guard it must rewrite is free to edit.
export const SIGNAL_DOSE_LANES_ON = false as boolean

// ── Cap + flag gate (Monetization Track 2, T2-3 / B-329 + B-001) ──────────────
// docs/monetization-and-throttling-requirements.md §4–§5. Per-function COPY of the
// shared-shape gate logic (S6: no _shared/ module; copy-paste per function —
// consolidation is a future refactor). generate-signal differs from the extraction
// functions in TWO ways (§5.3):
//   • the flag (ai_signal_phrasing_enabled) does NOT gate the function — off simply
//     forces TEMPLATE phrasing (an invisible degradation). Detection is NEVER gated:
//     the Signal is care (§3). So the flag is threaded into phraseFinding, not used
//     to short-circuit — resolveGateState is used for the CAP only (flagEnabled=true).
//   • the cap is a per-PET bug-loop backstop (scope_id = petId): over cap ⇒ skip
//     regeneration and let the client keep rendering the cached signal (no UI ships).
// Pure pieces are exported + Deno-tested.

// Free caps (§4.4): 12/pet/day, 240/pet/month. The 24h cache + client debounce do
// the real work; this is a backstop against a client regeneration loop. Same across
// tiers. Overridable via app_config.ai_caps.
const CAPS: FunctionCaps = { daily: 12, monthly: 240 }
const FUNCTION_KEY = 'generate_signal'
const FLAG_KEY = 'ai_signal_phrasing_enabled'

export interface FunctionCaps { daily: number; monthly: number }

export type GateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }

// The pure gate decision. Over-cap is strictly-greater because record_ai_usage
// increments-then-returns: the cap-th call returns count === cap and proceeds; the
// (cap+1)-th returns cap+1 and is blocked. For generate-signal the caller always
// passes flagEnabled=true (the phrasing flag doesn't gate the function), so only
// the cap arm can deny. `counts` null (RPC error) ⇒ fail-open to allow.
export function resolveGateState(
  flagEnabled: boolean,
  counts: { dayCount: number; monthCount: number } | null,
  caps: FunctionCaps,
): GateState {
  if (!flagEnabled) return { allow: false, reason: 'feature_disabled' }
  if (!counts) return { allow: true }
  if (counts.dayCount > caps.daily) return { allow: false, reason: 'cap_reached', cap: 'daily' }
  if (counts.monthCount > caps.monthly) return { allow: false, reason: 'cap_reached', cap: 'monthly' }
  return { allow: true }
}

export function resolveFlagValue(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

export function resolveCaps(aiCaps: unknown, functionKey: string, defaults: FunctionCaps): FunctionCaps {
  if (!aiCaps || typeof aiCaps !== 'object') return defaults
  const entry = (aiCaps as Record<string, unknown>)[functionKey]
  if (!entry || typeof entry !== 'object') return defaults
  const e = entry as Record<string, unknown>
  return {
    daily: typeof e.daily === 'number' && Number.isFinite(e.daily) ? e.daily : defaults.daily,
    monthly: typeof e.monthly === 'number' && Number.isFinite(e.monthly) ? e.monthly : defaults.monthly,
  }
}

// resets_at (§4.5): next UTC midnight (daily) / first-of-next-UTC-month (monthly).
export function computeResetsAt(cap: 'daily' | 'monthly', nowMs: number): string {
  const d = new Date(nowMs)
  if (cap === 'daily') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString()
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString()
}

// The phrasing flag + caps fail OPEN (degrade to templates / default caps — a read failure must not
// silence the Signal).
async function readGateConfig(
  client: SupabaseClient,
): Promise<{ flagEnabled: boolean; caps: FunctionCaps }> {
  try {
    const { data, error } = await client
      .from('app_config')
      .select('key, value')
      .in('key', [FLAG_KEY, 'ai_caps'])
    if (error || !data) return { flagEnabled: true, caps: CAPS }
    const byKey = new Map(data.map((r) => [(r as { key: string }).key, (r as { value: unknown }).value]))
    return {
      flagEnabled: resolveFlagValue(byKey.get(FLAG_KEY), true),
      caps: resolveCaps(byKey.get('ai_caps'), FUNCTION_KEY, CAPS),
    }
  } catch {
    return { flagEnabled: true, caps: CAPS }
  }
}

// Increment + read the caller's per-PET usage counters (§4.3, scope_id = petId).
// Null on RPC error → treated as under-cap (fail-open). uid derived inside the RPC
// (B-252). NOTE: petId MUST be passed as scope_id or every pet collapses onto one
// shared per-user counter (§4.4 build guard).
async function recordUsage(
  client: SupabaseClient,
  petId: string,
): Promise<{ dayCount: number; monthCount: number } | null> {
  const { data, error } = await client.rpc('record_ai_usage', { p_function: FUNCTION_KEY, p_scope_id: petId })
  if (error) {
    console.warn(`record_ai_usage(${FUNCTION_KEY}) failed — proceeding under cap:`, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { day_count?: number; month_count?: number } | null
  if (!row || typeof row.day_count !== 'number' || typeof row.month_count !== 'number') return null
  return { dayCount: row.day_count, monthCount: row.month_count }
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

    // 0. Verify the caller uid (§4.6). The reads below are already RLS-scoped by
    //    this JWT; getUser is defense-in-depth + a clean 401 when the token is
    //    absent/expired (rather than an RPC RAISE surfacing as a 500).
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    // 0b. Cap + phrasing-flag gate (§5.3). The cap is a per-PET bug-loop backstop:
    //     over cap ⇒ skip the whole regeneration and let the client keep rendering
    //     its cached signal (no UI state ships — invisible by design). Checked BEFORE
    //     the expensive detection pipeline. The phrasing flag does NOT gate the
    //     function; it only forces template phrasing below.
    const { flagEnabled: phrasingEnabled, caps } = await readGateConfig(supabase)
    const counts = await recordUsage(supabase, petId)
    const gate = resolveGateState(true, counts, caps) // flagEnabled=true: cap-only
    if (!gate.allow && gate.reason === 'cap_reached') {
      return Response.json(
        {
          cap_reached: true,
          cap: gate.cap,
          function: FUNCTION_KEY,
          resets_at: computeResetsAt(gate.cap, nowMs),
        },
        { headers: CORS_HEADERS },
      )
    }

    // 1. Load pet, symptom events, meal events, active diet trial — all
    //    ownership-scoped by RLS via the caller's JWT. Soft-deleted rows are
    //    excluded here (the detection module's documented contract).
    //
    //    CUL-989 — every multi-row pull goes through `fetchAll` (_shared/pull.ts), newest-first
    //    on a TOTAL key, so a record past PostgREST's `max-rows` is read in full and a shortfall
    //    that does happen drops the OLDEST rows and is REPORTED, never silent. Before this every
    //    pull was a bare select that kept the oldest rows and dropped the newest, so a detector
    //    asking "is this still happening?" would have read a record that stopped before today.
    //    And every read's error is now read: a failed query throws (a 500, and the client keeps
    //    its cached Signal) instead of arriving as an empty record written with a fresh TTL.
    //    No exception: the dose pull's was deleted with the hint that made it resolve (CUL-1099).
    const [
      petRes,
      symptomsPull,
      mealsPull,
      trialRes,
      arrangementsPull,
      profileRes,
      regimensPull,
      doseEventsPull,
      incidentAnalysesPull,
    ] =
      await Promise.all([
      supabase.from('pets').select('id, name, species, user_id').eq('id', petId).maybeSingle(),
      fetchAll<SymptomRow>('events', (r) => r.id, (from, to) =>
        supabase
        .from('events')
        .select('id, event_type, occurred_at, occurred_at_confidence, severity', { count: 'exact' })
        .eq('pet_id', petId)
        .in('event_type', [...CORRELATION_SYMPTOM_TYPES])
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
      fetchAll<MealEventRow>('events', (r) => r.id, (from, to) =>
        supabase
        .from('events')
        .select(
          'id, occurred_at, occurred_at_confidence, meals(food_item_id, intake_rating, food_items(primary_protein, proteins, food_type, format, brand, product_name))',
          { count: 'exact' },
        )
        .eq('pet_id', petId)
        .eq('event_type', 'meal')
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
      // `started_at` + `target_duration_days` are selected so the B-422 effective
      // end can be derived here; `select('id')` was enough only while `active`
      // was believed to mean "running today".
      supabase
        .from('diet_trials')
        .select('id, started_at, target_duration_days')
        .eq('pet_id', petId)
        .eq('status', 'active')
        .limit(1),
      // Active free-fed standing facts (B-040 R1, PR 4). No lookback filter: a
      // free_choice bowl set months ago and still down is a current standing exposure.
      // The active-window overlap is resolved inside detection, not the query.
      fetchAll<ArrangementRow>('feeding_arrangements', (r) => r.id, (from, to) =>
        supabase
        .from('feeding_arrangements')
        .select(
          'id, food_item_id, created_at, is_shared, active_from, active_until, ended_at, food_items(primary_protein, proteins)',
          { count: 'exact' },
        )
        .eq('pet_id', petId)
        .eq('method', 'free_choice')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
      // Caller's IANA timezone (B-079, detector ⑥). RLS on user_profiles scopes to the
      // owner's own row (auth.uid() = id), so this returns the pet owner's profile. Absent
      // / unreadable ⇒ undefined ⇒ ⑥ stays silent (never guess UTC — §4.2).
      supabase.from('user_profiles').select('timezone').maybeSingle(),
      // Medication regimens (B-117 PR 9, §8) — exposure spans [started_at, ended_at]. No
      // deleted_at (a regimen is "ended", not soft-deleted) and no lookback filter: an old
      // completed course is a valid historical confounder, and the [from,until] overlap with
      // the bounded symptom set is resolved inside detection. Status is irrelevant to the
      // span — started_at + ended_at fully define it (active → null end → through now).
      // Ordered on `created_at`, not the nullable `started_at` (the generate-report reason).
      fetchAll<RegimenRow>('medications', (r) => r.id, (from, to) =>
        supabase
        .from('medications')
        .select('id, drug_name, medication_item_id, started_at, ended_at', { count: 'exact' })
        .eq('pet_id', petId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
      // Administered medication dose events (B-117 PR 9) — point exposures at occurred_at, the
      // dominant signal today since logged doses are regimen-unlinked (B-135). Same shape as the
      // meals join; soft-deleted + out-of-lookback rows excluded here (the engine's contract).
      // missed/refused doses are filtered in mapMedicationWindows (doseToMedicationWindow).
      // The embed NAMES its FK (CUL-1099): migration 023 gave medication_administrations a
      // second FK to events (`paired_event_id`), so a bare `medication_administrations(...)`
      // is ambiguous and the live API answers PGRST201. Until this hint the read failed on
      // every call and was taken as "no doses"; it now throws like every pull here.
      // `guards/medAdminEmbedHint.test.ts` fails the build on an unhinted embed.
      fetchAll<MedDoseEventRow & { id: string }>('events', (r) => r.id, (from, to) =>
        supabase
        .from('events')
        .select(
          'id, occurred_at, medication_administrations!medication_administrations_event_id_fkey(medication_id, medication_item_id, adherence, paired_event_id, medication_items(generic_name, brand_name))',
          { count: 'exact' },
        )
        .eq('pet_id', petId)
        .eq('event_type', 'medication')
        .is('deleted_at', null)
        .gte('occurred_at', lookbackIso)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
      // Per-incident visual red flags (B-340 vomit + B-364 stool) — the owner-editable structured
      // fields from event_ai_analysis for this pet's analysed incidents, INNER-joined to events so a
      // soft-deleted or out-of-lookback incident is excluded (the engine's contract) and we get
      // occurred_at. incident_type IN (vomit, stool_normal, diarrhea) scopes to the analysed families
      // (itch/scratch/… carry no red-flag lane). No status filter — the red-flag lane derives the flag
      // from the structured fields (override-aware), never the cached visual_flags. `status`,
      // `contents` + `bile_present` are added for L3 photo composition (CUL-9), which reads the same
      // rows but filters to completed VOMIT reads itself (computePhotoComposition). Empty ⇒ silent.
      fetchAll<IncidentAnalysisRow>('event_ai_analysis', (r) => r.event_id, (from, to) =>
        supabase
        .from('event_ai_analysis')
        .select(
          'event_id, incident_type, status, blood_present, stool_blood_present, foreign_material_present, contents, bile_present, events!inner(occurred_at)',
          { count: 'exact' },
        )
        .eq('pet_id', petId)
        .in('incident_type', [...RED_FLAG_INCIDENT_TYPES])
        .is('events.deleted_at', null)
        .gte('events.occurred_at', lookbackIso)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
    ])

    // The single-row reads throw on an error too (a failed trial read is not "no trial": it
    // would unmute ⑧–⑩ and demote the correlation band for a pet mid-trial).
    if (petRes.error) throw new Error(`pets read failed: ${petRes.error.message}`)
    if (trialRes.error) throw new Error(`diet_trials read failed: ${trialRes.error.message}`)
    // The zone alone degrades rather than throws: its documented absence is "detector ⑥ stays
    // silent" (and the trial predicate's UTC fallback), a silence rather than a false calm.
    if (profileRes.error) console.warn('generate-signal: user_profiles read failed, no timezone:', profileRes.error.message)

    // CUL-989 step 3 — which pulls did not read to the end. Named for the log and handed to the
    // pipeline, which withholds every reassuring or resolving entry and states counts as floors.
    // The dose pull counts only while the engine reads it: an unread pull cannot make this
    // run's record incomplete, and counting it would change output the dark gate holds still.
    const incompletePulls = incompletePullNames({
      symptoms: symptomsPull,
      meals: mealsPull,
      arrangements: arrangementsPull,
      regimens: regimensPull,
      ...(SIGNAL_DOSE_LANES_ON ? { doseEvents: doseEventsPull } : {}),
      incidentAnalyses: incidentAnalysesPull,
    })
    if (incompletePulls.length > 0) {
      // Error level on purpose: this is the line whose absence let CUL-975 run for a week.
      console.error('generate-signal incomplete pulls:', petId, incompletePulls.join(', '))
    }

    const pet = petRes.data as { id: string; name: string; species: string; user_id: string | null } | null
    if (!pet) {
      return Response.json({ error: 'Pet not found' }, { status: 404, headers: CORS_HEADERS })
    }

    // 1b. The Engines v3 flag, for the pet's OWNER, failing closed (engineFlags.ts). A read
    //     that did not answer runs the flag-off engine and stamps '{}' (the truth about this
    //     run). Nothing below gates on a key yet (SIGNAL_ENGINE_KEYS is empty): EN-0 is the
    //     per-incident read, and the Signal's first gated phase adds its own key.
    const engineFlags = await readEngineFlags(supabase, typeof pet.user_id === 'string' ? pet.user_id : null)
    const fingerprint = await engineFingerprint({
      engine: 'generate-signal',
      version: SIGNAL_ENGINE_VERSION,
      config: DEFAULT_CONFIG,
      phrasingModel: PHRASING_MODEL,
      engineFlags: engineFlags.on,
    })

    // 1c. The previous cache row, read BEFORE it is replaced: the only memory the engine has
    //     of what the card said last time (the labeled stand-down, CUL-786). Read with the
    //     caller's JWT like every other read here, so RLS scopes it to the owner. A failed
    //     read withholds the marker (today's wordless vanish, the safe direction for a
    //     sentence about absence), warned. Fenced: a throw costs the marker, never the regen.
    let prior: PriorSignal | null = null
    try {
      const { data: priorRow, error: priorError } = await supabase
        .from('ai_signals')
        .select('findings, generated_at, engine_flags')
        .eq('pet_id', petId)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (priorError) {
        console.warn('generate-signal: prior ai_signals read failed — no stand-down minted:', priorError.message)
      } else if (priorRow) {
        prior = { findings: priorRow.findings, generatedAt: priorRow.generated_at, engineFlags: priorRow.engine_flags }
      }
    } catch (priorErr) {
      const detail = priorErr instanceof Error ? priorErr.message : String(priorErr)
      console.warn('generate-signal: prior ai_signals read failed — no stand-down minted:', detail)
    }

    // 2–3. Detect, curate, decorate, build the summary packet and resolve the stand-downs:
    //      the pure pipeline (./pipeline.ts), over exactly the rows read above. The care
    //      record is reserved for EN-9 (PR-23) and read by nothing yet, so no read feeds it.
    const result = runSignalPipeline({
      rows: {
        pet: { name: pet.name, species: pet.species },
        symptoms: symptomsPull.rows,
        meals: mealsPull.rows,
        activeTrials: (trialRes.data ?? []) as ActiveTrialRow[],
        arrangements: arrangementsPull.rows,
        timezone: (profileRes.data as { timezone: string | null } | null)?.timezone ?? null,
        regimens: regimensPull.rows,
        doseEvents: SIGNAL_DOSE_LANES_ON ? doseEventsPull.rows : [],
        incidentAnalyses: incidentAnalysesPull.rows,
      },
      incompletePulls,
      prior,
      nowMs,
      engineFlags,
      careRecord: { ownerAnswers: [], appointments: [] },
    })
    // 4. Phrase — one sentence per finding, in parallel, each falling back to
    //    its template independently. The set is never blank because the LLM
    //    failed (§2): a failed call yields the template, not a dropped card.
    //    CUL-989: over an incomplete read every card is its template, which is where the
    //    "at least N" lives; a model sentence could restate a floor as a total.
    const phraseWithModel = phrasingEnabled && result.incompleteDisclosure === null
    const texts = await Promise.all(
      result.findings.map((r) => phraseFinding(r.finding, result.petName, phraseWithModel)),
    )
    // 4b. AI summary (B-023 PR 4): the pipeline's deterministic fact packet, phrased
    //     (validateSummary-gated, template fallback). Null when nothing is substantive.
    //     Over an incomplete read the pipeline hands the disclosure instead (CUL-989 step 3:
    //     it withholds and SAYS SO), and there is no packet to phrase.
    const summary: CachedSummary | null = result.incompleteDisclosure
      ?? (result.summaryPacket ? await phraseSummaryText(result.summaryPacket, phrasingEnabled) : null)

    // 5. Cache. Empty findings = building/stale (§3.3), NEVER an all-clear (§9).
    const payload = assembleSignal(result, texts, summary)
    if (payload.standDownError !== null) {
      console.warn('generate-signal: stand-down resolution failed — findings written without a marker:', payload.standDownError)
    }
    const { signalText, isBuilding, coverage } = payload
    const cachedEntries: CachedEntry[] = payload.findings

    // Replace the pet's cached signal (last-write-wins; keeps row count bounded
    // without a unique constraint, matching the project's sync philosophy).
    await supabase.from('ai_signals').delete().eq('pet_id', petId)
    const { error: insertError } = await supabase.from('ai_signals').insert({
      pet_id: petId,
      signal_text: signalText,
      is_building: isBuilding,
      findings: cachedEntries,
      coverage,
      summary,
      // CUL-989: a row computed from an incomplete read expires in an hour, not the column's
      // 24h default, so the next open retries the read instead of serving the withheld state
      // (and its disclosure) for a day.
      ...signalStampValues(engineFlags, fingerprint),
      ...(incompletePulls.length > 0 ? { expires_at: new Date(nowMs + INCOMPLETE_READ_TTL_MS).toISOString() } : {}),
    })
    if (insertError) throw new Error(`ai_signals write failed: ${insertError.message}`)

    // 6. What the Signal showed (MFU-3): one row per served entry, identity + tier + a hash
    //    of the text. Service role, keyed on the id the RLS-scoped pets read returned (the
    //    ownership check). Fenced like the stand-down: the log is measurement, and a failure
    //    here must cost its rows, never the Signal the owner is waiting for.
    try {
      const rows = await buildShownLogRows({
        petId: pet.id,
        generatedAtIso: new Date(nowMs).toISOString(),
        entries: cachedEntries,
        engineFlags,
        fingerprint,
      })
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { error: logError } = await insertShownLog(adminClient, rows)
      if (logError) console.warn('generate-signal: the shown-log write failed:', logError)
    } catch (logErr) {
      const detail = logErr instanceof Error ? logErr.message : String(logErr)
      console.warn('generate-signal: the shown-log write failed:', detail)
    }

    return Response.json(
      {
        is_building: isBuilding,
        signal_text: signalText,
        findings: cachedEntries,
        coverage,
        summary,
        // CUL-989: which pulls did not read to the end ([] on a complete read). The cache row
        // has no column for it; the summary carries the owner-facing half.
        record_incomplete: incompletePulls,
      },
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
}

// Guard the listener so importing this module for `deno test` does not try to
// bind a server (which crashes the test runner). `import.meta.main` is true only
// when this file is the deployed entrypoint, false on test import (B-180).
if (import.meta.main) {
  Deno.serve(handler)
}
