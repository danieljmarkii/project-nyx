// Supabase Edge Function — ask  (B-228, PR A4; requirements §5, §6, §7, §9)
//
// Culprit's first open-ended conversational surface: owner-initiated Q&A over THIS pet's
// own logged record ("how many times has she vomited this month?", "what's her weight
// doing?"). Architecture (§5.1): the model PLANS over a CLOSED toolset → the deterministic
// tools EXECUTE → the model PHRASES an already-true result → `validateAnswer` GATES the
// sentence. The model NEVER computes a number and NEVER authors a query (no text-to-SQL).
//
// This file is the I/O shell (mirroring generate-signal/index.ts). The pure layers are:
//   • ask/tools.ts   — the read-only deterministic tool cores (A3).
//   • ask/answer.ts  — the model toolset, dispatch, validator, deflections, provenance,
//                      component descriptors, and the pure cap/credit decisions (A4).
// It runs with the CALLER'S JWT so RLS enforces pet ownership on every read (no service
// role in THIS file). A8's live photo read (read_photo) is the one write-triggering touch,
// and it rides the shipped analyze-vomit / analyze-stool path — invoked over HTTP with the
// caller's own JWT, so the invoked function does its OWN ownership gate + cap + service-role
// storage fetch/write-back. This file never holds the service role.
//
// Flow (§5.1):
//   OPTIONS/CORS → auth header → JWT verify → OWNERSHIP GATE (uniform 404, BEFORE any cap
//   increment or model call — the B-354 PR 3 pattern) → flag check (§8, fail-closed) →
//   PRE-model cap gate (§9: per-conversation bound + the monthly conversation-credit cap,
//   read-not-incremented — D9) → increment ask_message (COST grain, every model call) →
//   fetch the working set (RLS-scoped) → Sonnet tool-loop (the four-way plan contract) →
//   validateAnswer (one re-phrase → template fallback) → on a SUBSTANTIVE answer commit
//   ask_conversation (VALUE grain, D9) → typed 200.
//
// SAFETY: never-reassure / intake-≠-preference / no-diagnosis are enforced structurally by
// answer.ts's validator + the deflection taxonomy, not by the prompt alone (§7.6 — function
// beats disclaimers). Cached photo-reads relay through the scoped recall tools; LIVE photo
// reads (read_photo, A8) run through the shipped analyze-vomit/-stool machinery and are
// relayed via the SAME override-aware projection — one read path, so Ask can never disagree
// with the event detail screen about what a photo showed (§6.2 / G5-extended-to-reads).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveAllowlistFlagFromRows } from '../_shared/flags.ts'
import { projectCachedRead } from './tools.ts'
import type {
  AskEventRow,
  AskMealRow,
  AskWeightRow,
  AskRegimenRow,
  AskDoseRow,
  AskFeedingArrangementRow,
  AskCachedReadRow,
} from './tools.ts'
import {
  ASK_MODEL,
  MAX_TOOL_ITERATIONS,
  MAX_CONTEXT_TURNS,
  MAX_RECALLED_EVENTS_PER_MESSAGE,
  MAX_LIVE_PHOTO_READS_PER_MESSAGE,
  MODEL_TOOLS,
  SYSTEM_PROMPT,
  GENERAL_SYSTEM_PROMPT,
  dispatchTool,
  planPhotoRead,
  buildPhotoReadResult,
  validateAnswer,
  collectNumerals,
  buildProvenance,
  buildComponent,
  buildDeflection,
  sanitizeFollowups,
  leadingSafetyText,
  isSubstantiveOutcome,
  conversationAlreadyCredited,
  priorAssistantTurns,
  resolvePreModelGate,
  resolveMessageCap,
  resolveAskCaps,
  computeResetsAt,
  type AskDataContext,
  type AskTurn,
  type AskAnswerBody,
  type AskOutcome,
  type ComponentDescriptor,
  type PhotoReadResult,
  type PhotoReadIncident,
} from './answer.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MS_PER_DAY = 86_400_000
// Same 180-day working-set window as generate-signal — generous for an Established
// correlation and the intake baseline, bounded so the read stays on the index.
const LOOKBACK_DAYS = 180
// ai_usage sentinel scope for the per-user grains (matches record_ai_usage's default).
const SENTINEL_SCOPE = '00000000-0000-0000-0000-000000000000'

// The two Track-2 usage grains (§9.1). ask_conversation = the monthly VALUE grain
// (committed only on a substantive answer, D9); ask_message = the per-model-call COST grain.
const CONVERSATION_KEY = 'ask_conversation'
const MESSAGE_KEY = 'ask_message'

const ASK_FLAG = 'ask_enabled'
const GENERAL_FLAG = 'ask_general_enabled'

const VISION_MAX_TOKENS = 1500 // planning + phrasing headroom for the tool loop

// ── Typed response bodies (§5.1) ──────────────────────────────────────────────────

function answerResponse(body: AskAnswerBody): Response {
  return Response.json({ ...body, success: true }, { headers: CORS_HEADERS })
}
function capReachedResponse(grain: 'conversation' | 'message', cap: 'daily' | 'monthly', nowMs: number): Response {
  return Response.json(
    { cap_reached: true, grain, cap, function: grain === 'conversation' ? CONVERSATION_KEY : MESSAGE_KEY, resets_at: computeResetsAt(cap, nowMs) },
    { headers: CORS_HEADERS },
  )
}
function featureDisabledResponse(): Response {
  return Response.json({ feature_disabled: true, function: 'ask' }, { headers: CORS_HEADERS })
}

// ── Usage I/O (§9) ────────────────────────────────────────────────────────────────

// Increment + read a per-user usage grain (§4.3). Null on RPC error → fail-open (the cap
// is an abuse backstop, not a billing gate). uid derived inside the SECURITY DEFINER RPC.
async function recordUsage(client: SupabaseClient, functionKey: string): Promise<number | null> {
  const { data, error } = await client.rpc('record_ai_usage', { p_function: functionKey, p_scope_id: null })
  if (error) {
    console.warn(`record_ai_usage(${functionKey}) failed — proceeding under cap:`, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { day_count?: number; month_count?: number } | null
  return row && typeof row.month_count === 'number' && typeof row.day_count === 'number'
    ? (functionKey === CONVERSATION_KEY ? row.month_count : row.day_count)
    : null
}

// Read (WITHOUT incrementing) the caller's ask_conversation total for the current UTC
// month, for the D9 pre-answer conversation-credit gate. Owner-read RLS on ai_usage
// (migration 031). Null on error → the gate treats it as unread (don't block on it).
async function readConversationMonthCount(client: SupabaseClient, nowMs: number): Promise<number | null> {
  const d = new Date(nowMs)
  const monthStart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
  const { data, error } = await client
    .from('ai_usage')
    .select('count')
    .eq('function', CONVERSATION_KEY)
    .eq('scope_id', SENTINEL_SCOPE)
    .gte('day', monthStart)
  if (error || !data) return null
  return (data as { count: number }[]).reduce((sum, r) => sum + (typeof r.count === 'number' ? r.count : 0), 0)
}

// ── The Claude tool-loop (§5.1) ─────────────────────────────────────────────────────

interface ClaudeContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}
interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}
interface ClaudeResponse {
  content?: ClaudeContentBlock[]
  stop_reason?: string
}

interface LoopResult {
  body: AskAnswerBody
}

// Run the bounded planning loop. Returns a fully-formed answer body (an answer, a relayed-
// safety answer, a general answer, or a designed deflection). Never throws — a model/network
// failure yields the honest llm_unavailable deflection (non-substantive). `alreadyCredited`
// governs whether a substantive answer commits a new credit at the end (D9, decided by the
// caller after this returns).
async function runAskLoop(
  client: SupabaseClient,
  ctx: AskDataContext,
  question: string,
  conversation: AskTurn[],
  generalEnabled: boolean,
  apiKey: string,
  model: string,
): Promise<LoopResult> {
  const petName = ctx.petName
  // Prior turns (last ~6, S2) as plain text — the server holds no transcript; the client
  // passes the in-memory context (D8). Each turn is DELIMITED data, never an instruction
  // (§5.4 / §6.3 — the question AND any quoted note are untrusted input).
  const priorMessages: ClaudeMessage[] = conversation
    .slice(-MAX_CONTEXT_TURNS)
    .map((t) => ({ role: t.role, content: t.content }))

  const messages: ClaudeMessage[] = [
    ...priorMessages,
    { role: 'user', content: `Question about ${petName} (${ctx.species}): ${question}` },
  ]

  // Every tool result captured this turn — the allowed-numeral union (D2/§5.4) + the
  // provenance/component source. Keyed by tool name (last-wins for featuring).
  const captured: { name: string; result: unknown }[] = []
  let sawSafetyFinding = false
  // Per-message scoped-recall budget (rls-privacy A4 residual a). Once the whole question has
  // surfaced this many scoped events (across all recall-family calls), further recall calls
  // return an empty, budget-exhausted result — so one question can't page the record.
  let recalledEvents = 0
  const RECALL_TOOLS = new Set(['recent_events', 'recall_event', 'last_symptom'])
  // Per-question live photo-read budget (A8): how many FRESH reads this question has
  // triggered (each = a vision call + a per-incident cap unit). A cached relay is free and
  // never counts. Bounds cost/abuse across the tool loop; the analyze_* 10/day cap backstops.
  let liveReadsUsed = 0

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: VISION_MAX_TOKENS,
          system: generalEnabled ? GENERAL_SYSTEM_PROMPT : SYSTEM_PROMPT,
          tools: MODEL_TOOLS,
          tool_choice: { type: 'any' }, // force a tool call each turn — never free prose
          messages,
        }),
      })
    } catch (err) {
      console.warn('ask: Claude fetch failed:', err instanceof Error ? err.message : String(err))
      return { body: buildDeflection('llm_unavailable', petName) }
    }
    if (!res.ok) {
      console.warn(`ask: Claude API ${res.status}`)
      return { body: buildDeflection('llm_unavailable', petName) }
    }
    const data = (await res.json()) as ClaudeResponse
    const blocks = (data.content ?? []).filter((b) => b.type === 'tool_use')
    if (blocks.length === 0) {
      // The model returned no tool call (shouldn't happen with tool_choice=any) → unsupported.
      return { body: buildDeflection('unsupported', petName) }
    }

    // Terminal tools win: if the model asked to answer or decline, handle that now.
    const terminal = blocks.find((b) => b.name === 'provide_answer' || b.name === 'decline')
    if (terminal) {
      if (terminal.name === 'decline') {
        const reason = String((terminal.input?.reason as string) ?? 'unsupported')
        const clarifier = typeof terminal.input?.clarifier === 'string' ? (terminal.input.clarifier as string) : null
        return { body: buildDeflection(normalizeDeclineReason(reason), petName, clarifier) }
      }
      // provide_answer — validate → maybe re-phrase → maybe template fallback.
      return {
        body: finalizeAnswer(terminal, captured, ctx, generalEnabled, sawSafetyFinding, question),
      }
    }

    // Otherwise execute the data tools and feed the results back for the next iteration.
    const toolResultBlocks: ClaudeContentBlock[] = []
    // Preserve the assistant turn verbatim (required so the tool_result ids line up).
    messages.push({ role: 'assistant', content: data.content ?? [] })
    for (const b of blocks) {
      const name = b.name ?? ''
      let result: unknown
      if (name === 'read_photo') {
        // Live photo read (§6.2/§7.7, A8) — the one tool that isn't pure to dispatch. The
        // PURE plan (run-or-read-cache; no photo / wrong type / budget) is answer.ts's; only
        // the `run` branch does I/O (invoke the shipped machinery → re-read → project). A
        // cached relay never counts against the live-read budget.
        const eventId = String((b.input?.event_id as string) ?? '')
        const plan = planPhotoRead(ctx, eventId, liveReadsUsed)
        if (plan.action === 'run') {
          liveReadsUsed++ // count the invoke BEFORE it runs — bounds the loop even on failure
          result = await runLivePhotoRead(client, plan.eventId, plan.eventType, plan.incidentType)
        } else {
          result = buildPhotoReadResult(plan)
        }
        // A relayed read surfaces one scoped event's data across the boundary — count it
        // toward the per-question recall budget too (defense-in-depth on scoped data volume).
        if ((result as PhotoReadResult).read) recalledEvents += 1
      } else if (RECALL_TOOLS.has(name) && recalledEvents >= MAX_RECALLED_EVENTS_PER_MESSAGE) {
        // Enforce the per-message recall budget (rls-privacy #a): once exhausted, a recall
        // tool returns a budget-exhausted stub instead of more scoped events. Aggregates are
        // never budgeted (they carry no note/read). The tool layer already caps ONE call at
        // MAX_RECALL; this caps the SUM across the whole question.
        result = { error: 'recall budget for this question is exhausted — ask a narrower question or open the vet report for the full record', budget_exhausted: true }
      } else {
        const call = dispatchTool(name, b.input, ctx)
        recalledEvents += countRecalledEvents(name, call.result)
        result = call.result
      }
      captured.push({ name, result })
      if (name === 'engine_findings' && findingsHaveSafety(result)) sawSafetyFinding = true
      toolResultBlocks.push({
        type: 'tool_result',
        // @ts-ignore — tool_result carries tool_use_id + content (Anthropic shape)
        tool_use_id: b.id,
        content: JSON.stringify(result),
      } as ClaudeContentBlock)
    }
    messages.push({ role: 'user', content: toolResultBlocks })
  }

  // Ran out of iterations without a terminal decision → honest unsupported (never a guess).
  return { body: buildDeflection('unsupported', petName) }
}

// Validate the model's provide_answer against the captured tool results; on failure, fall
// back to a deterministic deflection (never an unguarded model sentence). One-shot here (the
// loop's cost is bounded); the §7.3 "one re-phrase" is folded into the same guarantee — an
// answer is never blank or unguarded. A DATA answer (used ≥1 data tool) is numeral-checked;
// an UNGROUNDED answer routes to general mode when enabled, else the general deflection.
function finalizeAnswer(
  terminal: ClaudeContentBlock,
  captured: { name: string; result: unknown }[],
  ctx: AskDataContext,
  generalEnabled: boolean,
  sawSafetyFinding: boolean,
  _question: string,
): AskAnswerBody {
  const petName = ctx.petName
  const input = terminal.input ?? {}
  const headline = typeof input.headline === 'string' ? input.headline.trim() : ''
  const detail = typeof input.detail === 'string' ? input.detail.trim() : ''
  const featureName = typeof input.feature_tool === 'string' ? (input.feature_tool as string) : null
  // Sanitize model-authored follow-up chips (A4 adversarial #5 — they were unguarded).
  const followups = sanitizeFollowups(input.followups)

  // An answer is "grounded" iff the model actually read ≥1 tool result this turn. An
  // ungrounded answer (no tool calls) is a general-knowledge answer — permitted only in
  // general mode (§7.5); otherwise it is the flag-off general deflection.
  const isGeneral = captured.length === 0

  // An ungrounded answer is only permitted when general mode is on (§7.5); otherwise it is
  // the general deflection (the flag-off redirect, §7.4 #3) — never an unsourced opinion.
  if (isGeneral && !generalEnabled) {
    return buildDeflection('general', petName)
  }

  const mode: 'data' | 'general' = isGeneral ? 'general' : 'data'
  // The allowed-numeral union across ALL captured results (D2/§5.4).
  const allowedNumerals = new Set<string>()
  for (const c of captured) collectNumerals(c.result, allowedNumerals)

  const combined = `${headline} ${detail}`.trim()
  const verdict = validateAnswer({ text: combined, allowedNumerals, mode, safety: sawSafetyFinding })
  if (!verdict.ok) {
    console.warn(`ask: answer failed validation (${verdict.reason}) — using deflection fallback`)
    // A failed model sentence never reaches the owner (never blank, never unguarded). Route to
    // a designed deflection (drives the wedge). A live safety finding does NOT vanish here: the
    // handler attaches it STRUCTURALLY as `safetyLead` on EVERY model-path response, deflections
    // included (§7.2 — safety leads, never dropped; the A4 adversarial #6 fix).
    return buildDeflection(isGeneral ? 'general' : 'unsupported', petName)
  }

  // Server-built provenance + component from the FEATURED tool result (never model-authored
  // numbers, so the denominator/window is present by construction — AC-8).
  const featured = pickFeatured(featureName, captured)
  const provenance = featured ? buildProvenance(featured) : null
  const component: ComponentDescriptor | null = featured ? buildComponent(featured) : null

  const outcome: AskOutcome = isGeneral ? 'general' : sawSafetyFinding ? 'relayed_safety' : 'answer'
  return {
    outcome,
    substantive: isSubstantiveOutcome(outcome),
    headline: headline || detail,
    detail: headline ? detail : '',
    component,
    provenance,
    safetyLead: null, // attached structurally by the handler from the engine's live findings
    followups,
    conversationCredited: false, // set by the caller when the credit actually commits (D9)
    generalMode: isGeneral,
  }
}

// Pick the captured result the model featured (by tool name, most recent), or fall back to
// the most recent data result that has a natural provenance/component.
function pickFeatured(featureName: string | null, captured: { name: string; result: unknown }[]): unknown {
  if (featureName) {
    for (let i = captured.length - 1; i >= 0; i--) {
      if (captured[i].name === featureName) return captured[i].result
    }
  }
  for (let i = captured.length - 1; i >= 0; i--) {
    if (captured[i].name !== 'engine_findings') return captured[i].result
  }
  return null
}

// How many scoped events a recall-family result surfaced (for the per-message budget).
function countRecalledEvents(name: string, result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const r = result as Record<string, unknown>
  if (name === 'recent_events') return Array.isArray(r.events) ? r.events.length : 0
  if (name === 'recall_event' || name === 'last_symptom') return r.event ? 1 : 0
  return 0
}

function findingsHaveSafety(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const findings = (result as { findings?: unknown }).findings
  return Array.isArray(findings) && findings.some((f) => (f as { priorityClass?: unknown })?.priorityClass === 'safety')
}

function normalizeDeclineReason(
  reason: string,
): 'clinical_judgment' | 'reassurance_fishing' | 'general' | 'bulk_export' | 'unsupported' | 'ambiguous' {
  switch (reason) {
    case 'clinical_judgment':
    case 'reassurance_fishing':
    case 'general':
    case 'bulk_export':
    case 'ambiguous':
      return reason
    default:
      return 'unsupported'
  }
}

// ── Data fetch → AskDataContext (RLS-scoped by the caller JWT) ─────────────────────

function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v.length ? v[0] : null
  return v ?? null
}

// The event_ai_analysis columns Ask relays (§6.2 mode 2 — the override-aware structured
// fields + the dismissible n=1 read). Shared by fetchContext (the cached-read snapshot) and
// runLivePhotoRead (the post-run re-read), so both project from the identical column set.
const READ_COLS =
  'event_id, incident_type, status, dismissed_at, edited_at, description, colour, contents, consistency, blood_present, bile_present, foreign_material_present, foreign_material_note, stool_consistency, stool_blood_present, stool_mucus_present, recommendation, read_text'

type ReadRowDb = Record<string, unknown> & { event_id: string; incident_type: string; status: string }

/** Map an event_ai_analysis DB row (READ_COLS) to the AskCachedReadRow the tools relay. */
function mapReadRow(r: ReadRowDb): AskCachedReadRow {
  return {
    eventId: r.event_id,
    incidentType: r.incident_type,
    status: r.status,
    dismissedAt: (r.dismissed_at as string) ?? null,
    editedAt: (r.edited_at as string) ?? null,
    description: (r.description as string) ?? null,
    colour: (r.colour as string) ?? null,
    contents: (r.contents as string[]) ?? null,
    consistency: (r.consistency as string) ?? null,
    bloodPresent: (r.blood_present as string) ?? null,
    bilePresent: (r.bile_present as string) ?? null,
    foreignMaterialPresent: (r.foreign_material_present as string) ?? null,
    foreignMaterialNote: (r.foreign_material_note as string) ?? null,
    stoolConsistency: (r.stool_consistency as string) ?? null,
    stoolBloodPresent: (r.stool_blood_present as string) ?? null,
    stoolMucusPresent: (r.stool_mucus_present as string) ?? null,
    recommendation: (r.recommendation as string) ?? null,
    readText: (r.read_text as string) ?? null,
  }
}

// ── Live photo read (§6.2/§7.7, A8) — invoke the shipped read machinery, re-read the row ──

function photoReadOutcome(
  eventId: string,
  eventType: string,
  incidentType: PhotoReadIncident,
  status: PhotoReadResult['status'],
  read: PhotoReadResult['read'] = null,
): PhotoReadResult {
  return { kind: 'read_photo', eventId, eventType, incidentType, status, ranLiveRead: status === 'ran', read }
}

/**
 * Run a live per-incident photo read for `eventId` by invoking the SHIPPED analyze-vomit /
 * analyze-stool Edge Function over HTTP with the caller's JWT — the exact path the event
 * detail screen uses (§6.2, one read path). `transform_only: true` forces the EXIF/GPS-
 * stripping transform fetch (T&S's D2 condition, §6.2.4 / AC-13). The invoked function does
 * its OWN ownership gate, cap increment (analyze_vomit/analyze_stool, 10/day — the product-
 * wide read cap), escalation floor, and never-clobber write-back, then persists to
 * event_ai_analysis. We re-read that row (RLS-scoped by the same JWT) and project it exactly
 * as the cached-read path does — so a read Ask triggers is immediately a free-surface fact
 * and can never disagree with the detail screen. The row's STATUS is the machinery's own
 * truth (robust regardless of the invoke response body): completed/uncertain → a real read
 * to relay; capped → the daily read cap was hit (no read, never "fine"); anything else
 * (read_disabled / failed / pending / none) → unavailable.
 */
async function runLivePhotoRead(
  client: SupabaseClient,
  eventId: string,
  eventType: string,
  incidentType: PhotoReadIncident,
): Promise<PhotoReadResult> {
  const fn = incidentType === 'vomit' ? 'analyze-vomit' : 'analyze-stool'
  try {
    const { error } = await client.functions.invoke(fn, { body: { event_id: eventId, transform_only: true } })
    if (error) {
      // A non-2xx from the machinery (incl. a cap-gated 200 that supabase-js may surface).
      // Don't bail — re-read the row below; the machinery may have persisted a capped/failed
      // STATE we should relay honestly rather than a bare "unavailable".
      console.warn(`ask: live ${fn} read for ${eventId} returned an error:`, error.message)
    }
  } catch (e) {
    console.warn(`ask: live ${fn} invoke threw for ${eventId}:`, e instanceof Error ? e.message : String(e))
    return photoReadOutcome(eventId, eventType, incidentType, 'unavailable')
  }

  const { data } = await client.from('event_ai_analysis').select(READ_COLS).eq('event_id', eventId).maybeSingle()
  if (!data) return photoReadOutcome(eventId, eventType, incidentType, 'unavailable')
  const row = data as ReadRowDb
  if (row.status === 'completed' || row.status === 'uncertain') {
    return photoReadOutcome(eventId, eventType, incidentType, 'ran', projectCachedRead(mapReadRow(row)))
  }
  if (row.status === 'capped') return photoReadOutcome(eventId, eventType, incidentType, 'capped')
  return photoReadOutcome(eventId, eventType, incidentType, 'unavailable')
}

async function fetchContext(
  client: SupabaseClient,
  petId: string,
  pet: { name: string; species: string },
  nowMs: number,
): Promise<AskDataContext> {
  const lookbackIso = new Date(nowMs - LOOKBACK_DAYS * MS_PER_DAY).toISOString()

  const [
    eventsRes,
    mealsRes,
    weightsRes,
    regimensRes,
    doseEventsRes,
    arrangementsRes,
    readsRes,
    trialRes,
    profileRes,
    signalsRes,
  ] = await Promise.all([
    // All non-deleted events in the lookback (any type) — count/recall run over the full
    // stream. event_attachments(id) gives photo PRESENCE only (§6.2 mode 1; bytes never fetched).
    client
      .from('events')
      .select('id, event_type, occurred_at, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, notes, event_attachments(id)')
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .gte('occurred_at', lookbackIso),
    // Meal events with their food/protein/intake join (the rate/food/protein aggregates).
    client
      .from('events')
      .select('id, occurred_at, occurred_at_confidence, event_attachments(id), meals(food_item_id, intake_rating, food_items(primary_protein, food_type, brand, product_name))')
      .eq('pet_id', petId)
      .eq('event_type', 'meal')
      .is('deleted_at', null)
      .gte('occurred_at', lookbackIso),
    // Weight readings — joined to events for occurred_at + soft-delete (weight_checks has no
    // occurred_at of its own). No lookback filter: the full series is a legitimate 'all' answer.
    client.from('weight_checks').select('weight_kg, events!inner(occurred_at, deleted_at)').eq('pet_id', petId).is('events.deleted_at', null),
    // Regimens — status/started_at/ended_at define the active span (no soft-delete on meds).
    client.from('medications').select('id, drug_name, status, started_at, ended_at, dose_amount').eq('pet_id', petId),
    // Administered dose events (point exposures) + their administration child.
    client
      .from('events')
      .select('id, occurred_at, medication_administrations(medication_id, adherence)')
      .eq('pet_id', petId)
      .eq('event_type', 'medication')
      .is('deleted_at', null)
      .gte('occurred_at', lookbackIso),
    // Active free-fed standing facts (no lookback; the active window is resolved in the tool).
    client
      .from('feeding_arrangements')
      .select('id, food_item_id, active_from, active_until, food_items(primary_protein, brand, product_name)')
      .eq('pet_id', petId)
      .eq('method', 'free_choice')
      .is('deleted_at', null),
    // Cached per-incident AI reads (§6.2 mode 2) — the override-aware structured fields.
    client.from('event_ai_analysis').select(READ_COLS).eq('pet_id', petId),
    // Active diet trial → the `since_trial_start` window + diet_trial_status tool.
    client.from('diet_trials').select('started_at, target_duration_days, status').eq('pet_id', petId).eq('status', 'active').limit(1),
    // The caller's IANA timezone (for time_of_day; absent ⇒ the tool stays silent).
    client.from('user_profiles').select('timezone').maybeSingle(),
    // The freshest cached engine findings (relay-only, §7.2).
    client.from('ai_signals').select('findings').eq('pet_id', petId).order('generated_at', { ascending: false }).limit(1),
  ])

  // ── events ──
  type EventRowDb = {
    id: string
    event_type: string
    occurred_at: string
    occurred_at_confidence: string | null
    occurred_at_earliest: string | null
    occurred_at_latest: string | null
    notes: string | null
    event_attachments: { id: string }[] | null
  }
  const events: AskEventRow[] = ((eventsRes.data ?? []) as EventRowDb[]).map((r) => ({
    id: r.id,
    type: r.event_type,
    occurredAt: r.occurred_at,
    occurredAtConfidence: (r.occurred_at_confidence ?? null) as AskEventRow['occurredAtConfidence'],
    occurredAtEarliest: r.occurred_at_earliest,
    occurredAtLatest: r.occurred_at_latest,
    note: r.notes,
    hasPhoto: Array.isArray(r.event_attachments) && r.event_attachments.length > 0,
    deletedAt: null, // filtered in the query
  }))

  // ── meals ──
  type MealRowDb = {
    id: string
    occurred_at: string
    occurred_at_confidence: string | null
    event_attachments: { id: string }[] | null
    meals: { food_item_id: string | null; intake_rating: string | null; food_items: { primary_protein: string | null; food_type: string | null; brand: string | null; product_name: string | null } | null } | { food_item_id: string | null; intake_rating: string | null; food_items: unknown }[] | null
  }
  const meals: AskMealRow[] = ((mealsRes.data ?? []) as MealRowDb[]).map((r) => {
    const meal = first(r.meals) as { food_item_id: string | null; intake_rating: string | null; food_items: { primary_protein: string | null; food_type: string | null; brand: string | null; product_name: string | null } | { primary_protein: string | null; food_type: string | null; brand: string | null; product_name: string | null }[] | null } | null
    const fi = first(meal?.food_items ?? null) as { primary_protein: string | null; food_type: string | null; brand: string | null; product_name: string | null } | null
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      occurredAtConfidence: (r.occurred_at_confidence ?? null) as AskMealRow['occurredAtConfidence'],
      foodItemId: meal?.food_item_id ?? null,
      foodLabel: fi ? `${fi.brand ?? ''} ${fi.product_name ?? ''}`.trim() || null : null,
      foodType: fi?.food_type ?? null,
      primaryProtein: fi?.primary_protein ?? null,
      intakeRating: meal?.intake_rating ?? null,
      note: null, // aggregates carry no note (scoped-retrieval §6.1); event notes ride recall
      hasPhoto: Array.isArray(r.event_attachments) && r.event_attachments.length > 0,
      deletedAt: null,
    }
  })

  // ── weights ──
  type WeightRowDb = { weight_kg: number; events: { occurred_at: string } | { occurred_at: string }[] | null }
  const weights: AskWeightRow[] = ((weightsRes.data ?? []) as WeightRowDb[])
    .map((r): AskWeightRow | null => {
      const ev = first(r.events)
      return ev ? { weightKg: Number(r.weight_kg), occurredAt: ev.occurred_at, deletedAt: null } : null
    })
    .filter((w): w is AskWeightRow => w !== null)

  // ── regimens ──
  type RegimenRowDb = { id: string; drug_name: string; status: string | null; started_at: string | null; ended_at: string | null; dose_amount: string | null }
  const regimens: AskRegimenRow[] = ((regimensRes.data ?? []) as RegimenRowDb[]).map((r) => ({
    id: r.id,
    drugLabel: r.drug_name,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    doseAmount: r.dose_amount,
    deletedAt: null,
  }))

  // ── doses ──
  type DoseRowDb = { id: string; occurred_at: string; medication_administrations: { medication_id: string | null; adherence: string | null } | { medication_id: string | null; adherence: string | null }[] | null }
  const regimenLabelById = new Map(regimens.map((r) => [r.id, r.drugLabel]))
  const doses: AskDoseRow[] = ((doseEventsRes.data ?? []) as DoseRowDb[]).map((r) => {
    const admin = first(r.medication_administrations)
    const medId = admin?.medication_id ?? null
    return {
      id: r.id,
      medicationId: medId,
      drugLabel: medId ? (regimenLabelById.get(medId) ?? null) : null,
      occurredAt: r.occurred_at,
      adherence: admin?.adherence ?? null,
      deletedAt: null,
    }
  })

  // ── arrangements ──
  type ArrRowDb = { id: string; food_item_id: string | null; active_from: string | null; active_until: string | null; food_items: { primary_protein: string | null; brand: string | null; product_name: string | null } | { primary_protein: string | null; brand: string | null; product_name: string | null }[] | null }
  const arrRows = (arrangementsRes.data ?? []) as ArrRowDb[]
  const arrangements: AskFeedingArrangementRow[] = arrRows.map((r) => {
    const fi = first(r.food_items)
    return {
      id: r.id,
      foodItemId: r.food_item_id,
      foodLabel: fi ? `${fi.brand ?? ''} ${fi.product_name ?? ''}`.trim() || null : null,
      primaryProtein: fi?.primary_protein ?? null,
      activeFrom: r.active_from,
      activeUntil: r.active_until,
      deletedAt: null,
    }
  })
  // Foods currently free-fed (active_until IS NULL) — the §11 #6 intake-exclusion set.
  const freeFedFoodIds = new Set<string>(arrRows.filter((r) => r.active_until === null && r.food_item_id).map((r) => r.food_item_id as string))

  // ── reads ──
  const reads: AskCachedReadRow[] = ((readsRes.data ?? []) as ReadRowDb[]).map(mapReadRow)

  // ── trial / timezone / engine findings ──
  const trialRow = first((trialRes.data ?? []) as { started_at: string; target_duration_days: number | null; status: string }[])
  const trial = trialRow
    ? { startedAt: trialRow.started_at, targetDurationDays: trialRow.target_duration_days ?? 0, status: trialRow.status, deletedAt: null }
    : null
  const trialStartMs = trial ? (Number.isFinite(Date.parse(trial.startedAt)) ? Date.parse(trial.startedAt) : null) : null

  const profile = profileRes.data as { timezone: string | null } | null
  const timezone = profile?.timezone || null

  // ai_signals.findings is CachedFinding[] = { rank, text, finding{ type, priorityClass, ... } }.
  // Map to the engineFindings tool's relay shape (type + priorityClass + verbatim payload).
  const signalRow = first((signalsRes.data ?? []) as { findings: unknown }[])
  const rawFindings = Array.isArray(signalRow?.findings) ? (signalRow!.findings as { text?: unknown; finding?: Record<string, unknown> }[]) : []
  const engineFindingsRaw = rawFindings
    .map((f) => {
      const finding = f.finding ?? {}
      return { type: finding.type, priorityClass: finding.priorityClass, payload: { text: f.text, ...finding } }
    })
    .filter((f) => typeof f.type === 'string')

  return {
    nowMs,
    petName: pet.name || 'your pet',
    species: pet.species || 'unknown',
    timezone,
    trialStartMs,
    trial,
    events,
    meals,
    weights,
    regimens,
    doses,
    arrangements,
    reads,
    freeFedFoodIds,
    engineFindingsRaw,
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })

  let body: { pet_id?: string; question?: string; conversation?: AskTurn[] }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }
  const petId = typeof body.pet_id === 'string' ? body.pet_id : ''
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const conversation: AskTurn[] = Array.isArray(body.conversation)
    ? (body.conversation as unknown[])
        .filter((t): t is AskTurn => !!t && typeof t === 'object' && ((t as AskTurn).role === 'user' || (t as AskTurn).role === 'assistant') && typeof (t as AskTurn).content === 'string')
        .map((t) => ({ role: t.role, content: t.content, substantive: t.substantive === true }))
    : []
  if (!petId) return Response.json({ error: 'pet_id required' }, { status: 400, headers: CORS_HEADERS })
  if (!question) return Response.json({ error: 'question required' }, { status: 400, headers: CORS_HEADERS })
  if (question.length > 1000) return Response.json({ error: 'question too long' }, { status: 400, headers: CORS_HEADERS })

  const client: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  try {
    const nowMs = Date.now()

    // 0. Verify the caller uid (§4.6). Reads below are RLS-scoped by this JWT; getUser is
    //    defense-in-depth + a clean 401 (rather than an RPC RAISE surfacing as a 500).
    const { data: { user }, error: authErr } = await client.auth.getUser()
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })

    // 1. OWNERSHIP GATE — BEFORE any cap increment or model call (the B-354 PR 3 pattern).
    //    RLS already scopes this read to the caller's pets, so a foreign/missing pet returns
    //    no row → uniform 404 (never an existence oracle, never a burned cap unit).
    const { data: pet } = await client.from('pets').select('name, species').eq('id', petId).maybeSingle()
    if (!pet) return Response.json({ error: 'Pet not found' }, { status: 404, headers: CORS_HEADERS })

    // 2. Flags (§8) — fail CLOSED (a missing/unreachable/malformed row hides the feature).
    //    ask_enabled gates the whole surface; ask_general_enabled is the general-mode sub-gate.
    const { data: cfg } = await client.from('app_config').select('key, value').in('key', [ASK_FLAG, GENERAL_FLAG, 'ai_caps'])
    const cfgRows = (cfg ?? []) as { key: string; value: unknown }[]
    const askEnabled = resolveAllowlistFlagFromRows(cfgRows, ASK_FLAG, user.id, false)
    if (!askEnabled) return featureDisabledResponse()
    const generalEnabled = resolveAllowlistFlagFromRows(cfgRows, GENERAL_FLAG, user.id, false)
    const caps = resolveAskCaps(cfgRows.find((r) => r.key === 'ai_caps')?.value)

    // 3. PRE-model cap gate (§9 / D9). Computed from the client-passed in-memory conversation
    //    (D8) + a READ (not increment) of the monthly conversation total — the credit only
    //    commits post-answer. A per-conversation-full or over-conversation-cap request stops
    //    here with a typed cap body, before any model call.
    const alreadyCredited = conversationAlreadyCredited(conversation)
    const priorTurns = priorAssistantTurns(conversation)
    // Only read the monthly total when a conversation cap is actually set (default: uncapped
    // experiment tier → skip the read entirely).
    const convMonthCount = !alreadyCredited && caps.conversationMonthly != null ? await readConversationMonthCount(client, nowMs) : null
    const preGate = resolvePreModelGate({ flagEnabled: askEnabled, alreadyCredited, priorAssistantTurns: priorTurns, conversationMonthCount: convMonthCount, caps })
    if (!preGate.allow) {
      if (preGate.reason === 'feature_disabled') return featureDisabledResponse()
      return capReachedResponse(preGate.grain, preGate.cap, nowMs)
    }

    // 4. Increment ask_message — the COST grain, every model-answering turn (D9). Over the
    //    daily backstop ⇒ typed cap body (the unit is already burned — abuse-safe direction).
    const messageDayCount = await recordUsage(client, MESSAGE_KEY)
    const msgGate = resolveMessageCap(messageDayCount, caps)
    if (!msgGate.allow && msgGate.reason === 'cap_reached') return capReachedResponse(msgGate.grain, msgGate.cap, nowMs)

    // 5. The model path. No API key ⇒ honest llm_unavailable (non-substantive, no credit) —
    //    Ask needs the network for an LLM answer (the deliberate online-only exception, §3.2).
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      console.warn('ask: ANTHROPIC_API_KEY unset — returning llm_unavailable')
      return answerResponse(buildDeflection('llm_unavailable', pet.name || 'your pet'))
    }
    const model = Deno.env.get('ASK_MODEL') || ASK_MODEL // S3 — model id via env override

    // 6. Fetch the working set (RLS-scoped) and run the bounded plan-loop.
    const ctx = await fetchContext(client, petId, pet as { name: string; species: string }, nowMs)
    const { body: loopBody } = await runAskLoop(client, ctx, question, conversation, generalEnabled, apiKey, model)

    // 6b. STRUCTURALLY attach a live engine SAFETY finding as the leading card (§7.2 — safety
    //     leads, never dropped). This is NOT model-discretionary: whatever the model did (a
    //     bare count, a deflection, a general answer), a live safety finding from the engine's
    //     cached findings is surfaced beside the answer. The engine is the only minter (relay-
    //     only), so this can never fabricate an escalation; it only refuses to hide one (the A4
    //     adversarial #6 fix). Engine silent ⇒ null (silence ≠ wellness).
    const answerBody = { ...loopBody, safetyLead: leadingSafetyText(ctx.engineFindingsRaw, ctx.petName) }

    // 7. Commit the VALUE grain (D9): ONLY on a substantive answer in a not-yet-credited
    //    conversation. A deflection / floor / fallback is free on this grain; a follow-up in
    //    an already-credited conversation does not commit a second credit (D8/D9).
    let conversationCredited = alreadyCredited
    if (isSubstantiveOutcome(answerBody.outcome) && !alreadyCredited) {
      // Best-effort commit. Even if the RPC failed (null), the answer stands and we still mark
      // the conversation credited so the client's follow-ups in THIS conversation don't attempt
      // a re-commit (abuse-safe: an uncounted conversation is still bounded by the ask_message
      // daily backstop, so a lost increment can't be farmed for unlimited value).
      await recordUsage(client, CONVERSATION_KEY)
      conversationCredited = true
    }
    return answerResponse({ ...answerBody, conversationCredited })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('ask error:', message)
    // Honest, guarded fallback — never a raw 500 to the surface (the deflection is designed).
    return answerResponse(buildDeflection('llm_unavailable', 'your pet'))
  }
}

// Guard the listener so importing this module for `deno test` does not bind a server
// (which crashes the test runner). import.meta.main is true only for the deployed entrypoint.
if (import.meta.main) {
  Deno.serve(handler)
}
