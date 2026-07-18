// Ask — the answer layer (B-228, PR A4; requirements §5, §6, §7, §9).
//
// The PURE half of the `ask` Edge Function (mirroring generate-signal/phrasing.ts and
// ask/tools.ts): everything that turns a question + the pet's fetched, plain-shaped
// working set into a validated, owner-facing answer, EXCEPT the live Claude call and DB
// I/O (those live in index.ts). Kept free of remote/Deno imports so it is unit-testable
// offline (Deno + node:assert), exactly like tools.ts.
//
// This layer owns, in order of the §5.1 flow "LLM plans → tools execute → LLM phrases →
// validator gates":
//
//   • MODEL_TOOLS — the CLOSED toolset the planner selects over (§5.1). The model
//     selects and PARAMETERIZES these; it never authors a query (no text-to-SQL ever).
//     Each data tool maps 1:1 to a pure function in tools.ts. Two control tools close the
//     four-way plan contract (§5.3): `provide_answer` (outcome 1) and `decline` (outcomes
//     2/3/4 — clinical_judgment / unsupported / ambiguous, plus the §7.4 warm deflections).
//
//   • dispatchTool — pure execution of a model tool call against the fetched context.
//     Runs the matching tools.ts core over already-fetched rows; NEVER touches a DB or a
//     model. Every result captured this turn feeds the numeral-subset validator + the
//     server-built provenance.
//
//   • validateAnswer (§7.3, G8 — a test assertion, not a comment) — the output gate.
//     Rejects: exclamation marks; the reassurance lexicon (never reassure — the n=1
//     spine, G2); "picky"/fussy verdicts (intake ≠ preference, G7); causal claims in data
//     mode (associational only); AND — the D2/§5.4 mechanism — ANY numeral in the answer
//     that does not trace to a tool result (the model never does arithmetic). One
//     re-phrase, then a deterministic template fallback (an answer is never blank or
//     unguarded — §7.3 / §2 hard rule).
//
//   • DEFLECTIONS (§7.4) — the designed, warm, never-an-error deflection templates the
//     planner routes to via `decline`. G3: a deflection DRIVES THE WEDGE (rundown / report /
//     line-up-the-evidence), it never dead-ends.
//
//   • Provenance + component — built SERVER-SIDE from the captured tool results the model
//     featured, never model-authored, so the denominator + window (AC-8) are present by
//     construction regardless of the model's prose, and the component's numbers are honest
//     by construction (§5.4 — the server returns a typed descriptor; the client renders).
//
//   • Caps & credit (§9 / D9) — the PURE decisions behind the two-grain meter:
//     `ask_conversation` (the monthly VALUE grain — committed on the first SUBSTANTIVE
//     answer only, never on a deflection/floor/fallback) and `ask_message` (the per-model-
//     call COST grain — every question that reaches the model). The I/O (record_ai_usage)
//     lives in index.ts; the decisions are here so they are tested, not asserted.
//
// SAFETY: this layer inherits the two invariants wholesale. Never reassure (a 0/low count
// is "nothing logged", never "she's well"); intake ≠ preference (decline routes to the
// calm health register, never "picky"). A relayed engine finding or cached photo-read may
// ESCALATE on the PRESENCE of a red flag, never reassure on its ABSENCE — the read text is
// relayed verbatim and the validator gates the surrounding sentence, exactly as
// generate-signal does for the model-phrased paths.

import {
  ASK_SYMPTOM_TYPES,
  coerceWindow,
  countSymptom,
  symptomTrend,
  timeOfDay,
  recallEvent,
  recentEvents,
  lastSymptom,
  photoPresence,
  intakeSummary,
  topFoods,
  topProteins,
  weightSummary,
  dietTrialStatus,
  freeFedStatus,
  medications,
  engineFindings,
  isNotEnoughData,
  projectCachedRead,
  type AskWindow,
  type AskEventRow,
  type AskMealRow,
  type AskWeightRow,
  type AskRegimenRow,
  type AskDoseRow,
  type AskFeedingArrangementRow,
  type AskCachedReadRow,
  type ProjectedRead,
} from './tools.ts'

// ── Model & loop bounds ─────────────────────────────────────────────────────────

// Sonnet 4.6 (§5.4): planning/orchestration over the closed toolset IS load-bearing
// reasoning (the extraction precedent), and a vision-capable model the A8 photo path will
// reuse. Overridable via app_config (S3) at the I/O layer; this constant is the default.
export const ASK_MODEL = 'claude-sonnet-4-6'

// The planner runs bounded iterations of {select tools → read results → decide}. A
// low-confidence plan must fail toward a deflection, never loop forever or guess a query
// (§5.1). Each iteration may batch several tool calls; this caps the ROUND TRIPS.
export const MAX_TOOL_ITERATIONS = 5

// In-session context depth handed back to the model (S2 lean: last ~6 turns). Older turns
// are dropped so a long conversation can't grow the prompt unbounded; the rundown is the
// durable artifact, not the transcript (§10, D8).
export const MAX_CONTEXT_TURNS = 6

// Per-MESSAGE scoped-recall budget (rls-privacy A4 residual a). The per-tool cap (MAX_RECALL
// = 25) bounds ONE recentEvents call; this bounds the WHOLE question so a crafted/injected
// prompt can't page many recall calls across the 5-iteration loop and relay a large fraction
// of the pet's notes across the Anthropic boundary in one turn. Matches the single-tool cap:
// one question surfaces at most this many scoped events (incl. their notes/reads). The owner's
// own data (D2), so this is defense-in-depth on the "one question → scoped answer" claim.
export const MAX_RECALLED_EVENTS_PER_MESSAGE = 25

// ── The fetched working set the pure tools run over ───────────────────────────────
// index.ts fetches these once (RLS-scoped by the caller's JWT, ownership-gated) and hands
// them here; dispatchTool runs the tools.ts cores over them with no further I/O.

export interface AskDataContext {
  nowMs: number
  petName: string
  species: string
  timezone: string | null
  /** Start-of-trial ms for the `since_trial_start` window, or null when no active trial. */
  trialStartMs: number | null
  /** The active diet trial (for dietTrialStatus), or null. */
  trial: { startedAt: string; targetDurationDays: number; status?: string | null; deletedAt?: string | null } | null
  events: AskEventRow[]
  meals: AskMealRow[]
  weights: AskWeightRow[]
  regimens: AskRegimenRow[]
  doses: AskDoseRow[]
  arrangements: AskFeedingArrangementRow[]
  reads: AskCachedReadRow[]
  freeFedFoodIds: ReadonlySet<string>
  /** The engine's cached ai_signals.findings (relay-only, §7.2). */
  engineFindingsRaw: { type?: unknown; priorityClass?: unknown; payload?: unknown }[] | null
}

// ── The four-way plan contract (§5.3) ─────────────────────────────────────────────

/** Every question resolves to exactly one outcome. `answer`, `relayed_safety`, and
 *  `general` are SUBSTANTIVE (they deliver the teaser's value → commit the conversation
 *  credit, D9). The deflection/floor outcomes are NOT (free on the conversation grain). */
export type AskOutcome =
  | 'answer' // (1) tool plan → answer
  | 'relayed_safety' // (1') a relayed engine safety finding leads the answer
  | 'general' // (1'') flag-gated general-mode answer
  | 'clinical_judgment' // (2) diagnosis-shaped → Tier-3 deflection (G1/G3)
  | 'reassurance_fishing' // (2') "so she's fine, right?" → never-rule-out deflection
  | 'unsupported' // (3) out-of-toolset → honest + chips
  | 'ambiguous' // (4) clarifying chip, never a guessed answer
  | 'data_gap' // NotEnoughData floor → honest "not enough logged"
  | 'bulk_export' // "summarize everything" → scoped-retrieval honesty (§7.4 #5)
  | 'llm_unavailable' // the model/network was unreachable → honest fallback (no credit)

/** The SUBSTANTIVE outcomes — the only ones that commit the free `ask_conversation`
 *  credit (D9). A deflection, a NotEnoughData floor, or an LLM-down fallback is free on
 *  the conversation grain (still `ask_message`-metered by the I/O layer). */
const SUBSTANTIVE_OUTCOMES: ReadonlySet<AskOutcome> = new Set<AskOutcome>([
  'answer',
  'relayed_safety',
  'general',
])

export function isSubstantiveOutcome(outcome: AskOutcome): boolean {
  return SUBSTANTIVE_OUTCOMES.has(outcome)
}

// ── The typed answer body (§5.1 typed 200) ────────────────────────────────────────

/** A typed component descriptor the client renders with EXISTING components (§5.4). The
 *  server builds `data` from a captured tool result — never model-authored — so every
 *  numeral in it is honest by construction. The server NEVER returns markup. */
export type ComponentDescriptor =
  | { kind: 'pips'; data: unknown }
  | { kind: 'spark'; data: number[] }
  | { kind: 'ranked'; data: { label: string; count: number }[] }
  | { kind: 'tiles'; data: { label: string; value: string }[] }

export interface AnswerProvenance {
  /** The window the answer used, stated (§3.4 — "the last 7 days" / "all time"). */
  window: string | null
  /** Owner-facing denominator/coverage line ("7 events · logging on 28 of 30 days"). */
  denominator: string | null
  /** A tap-through descriptor the client resolves to a filtered History/Patterns view. */
  tapThrough: { kind: 'events'; eventIds: string[] } | { kind: 'filter'; symptomType?: string; window?: string } | null
}

export interface AskAnswerBody {
  outcome: AskOutcome
  substantive: boolean
  /** Newsreader TLDR headline (D6). */
  headline: string
  /** Descriptive supporting text (D6). */
  detail: string
  component: ComponentDescriptor | null
  provenance: AnswerProvenance | null
  /** A live engine SAFETY finding, relayed VERBATIM, that leads the answer (§7.2 — safety
   *  insights always lead and are never dropped; Principle 3). Set STRUCTURALLY by the I/O
   *  layer from the engine's cached findings — NOT model-discretionary — so a symptom
   *  question can never return a bare count without the live safety finding beside it (the
   *  A4 adversarial #6 fix). Null when the engine is silent (silence ≠ wellness). */
  safetyLead: string | null
  /** The DETERMINISTIC, server-built recount of a photo read this answer featured (A8) —
   *  the photo's clinical content NEVER comes from model prose (the analyze-vomit precedent:
   *  a no-flag read's owner-facing text is a template, not model-authored, because a
   *  reassurance-on-absence denylist provably leaks — §7.7 / adversarial 2026-07-18). The
   *  model is redacted of the benign clinical details (it sees only status + present red
   *  flags, so it can escalate but has nothing benign to editorialize); this line carries
   *  the actual read. Present-only, never "looks fine". Null when no read was featured. */
  readLine: string | null
  followups: string[]
  /** Whether THIS conversation has now committed its free credit (client echoes it back
   *  so a follow-up in the same conversation does not commit a second — D8/D9). */
  conversationCredited: boolean
  /** True for a fenced general-mode answer (§7.5). */
  generalMode: boolean
}

// ══════════════════════════════════════════════════════════════════════════════════
// MODEL_TOOLS — the closed toolset the planner selects over (§5.1)
// ══════════════════════════════════════════════════════════════════════════════════
//
// Each data tool mirrors a tools.ts function 1:1. The model SELECTS and PARAMETERIZES;
// it never authors a query. Windows are a bounded enum (§3.4). Symptom types are the
// closed ASK_SYMPTOM_TYPES set. Adding a tool is a spec change (clinical-guardrails
// Pattern 8) — a new entry needs its query, output contract, guardrail class, and tests.

const WINDOW_ENUM = ['7d', '14d', '30d', 'all', 'since_trial_start']
const SYMPTOM_ENUM = [...ASK_SYMPTOM_TYPES]

export const MODEL_TOOLS: Record<string, unknown>[] = [
  {
    name: 'count_symptom',
    description:
      "Count how many times a symptom was logged for this pet in a window, with the coverage denominator (logged days). Use for 'how many times…', 'how often…'. Returns a raw count (0 is a true fact, never an all-clear).",
    input_schema: {
      type: 'object',
      properties: {
        symptom_type: { type: 'string', enum: SYMPTOM_ENUM },
        window: { type: 'string', enum: WINDOW_ENUM, description: 'Defaults to 7d if omitted.' },
      },
      required: ['symptom_type'],
    },
  },
  {
    name: 'symptom_trend',
    description:
      "Compare a symptom's count in the window against the equal-length prior window (up/down/flat). Use for 'is it getting more/less frequent'. Descriptive direction only — never a wellness verdict.",
    input_schema: {
      type: 'object',
      properties: {
        symptom_type: { type: 'string', enum: SYMPTOM_ENUM },
        window: { type: 'string', enum: WINDOW_ENUM },
      },
      required: ['symptom_type'],
    },
  },
  {
    name: 'time_of_day',
    description:
      "Distribution of a symptom across local time-of-day bands (overnight/morning/afternoon/evening). Only witnessed events with a known timezone are placeable. Use for 'what time of day…'.",
    input_schema: {
      type: 'object',
      properties: {
        symptom_type: { type: 'string', enum: SYMPTOM_ENUM },
        window: { type: 'string', enum: WINDOW_ENUM },
      },
      required: ['symptom_type'],
    },
  },
  {
    name: 'last_symptom',
    description:
      "The single most recent logged event of a type (any time), with its date, note, and cached photo read. Use for 'when did she last…', 'what did the last one look like'. Null = nothing logged (never 'she's well').",
    input_schema: {
      type: 'object',
      properties: { symptom_type: { type: 'string' } },
      required: ['symptom_type'],
    },
  },
  {
    name: 'recent_events',
    description:
      "A bounded, newest-first slice of events (optionally of one type) in a window, each with its note and cached photo read. Capped — never the whole record. Use for 'show me the recent ones'.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Optional event_type filter.' },
        window: { type: 'string', enum: WINDOW_ENUM },
        limit: { type: 'number', description: 'Max events (hard-capped server-side).' },
      },
    },
  },
  {
    name: 'recall_event',
    description:
      "One event by its id, with its note and override-aware cached photo read. Use to look up a specific event's detail after another tool returned its id.",
    input_schema: {
      type: 'object',
      properties: { event_id: { type: 'string' } },
      required: ['event_id'],
    },
  },
  {
    name: 'photo_presence',
    description:
      "Which events in a window carry a photo (count + ids, presence only — the bytes never leave the app). Use for 'do I have photos of…'. The tap-through opens the event where the photo lives.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        window: { type: 'string', enum: WINDOW_ENUM },
      },
    },
  },
  {
    name: 'read_photo',
    description:
      "Look at the photo on ONE vomit or stool event (by id) and return its AI read — a factual recount of what the photo shows (colour, contents, whether blood or foreign material was flagged), never a wellness verdict. Relays the cached read if one exists; otherwise runs a FRESH read through the same machinery the event detail screen uses (this counts against the pet's daily photo-read limit). Use ONLY when the owner asks what an incident looked like AND a recall tool shows the event HAS a photo but no read yet. An empty set of flags means 'nothing was flagged in this one', never 'she's fine'.",
    input_schema: {
      type: 'object',
      properties: { event_id: { type: 'string', description: "The vomit/stool event id (from a recall tool's result)." } },
      required: ['event_id'],
    },
  },
  {
    name: 'intake_summary',
    description:
      "Share of meals the pet finished (most/all) in the window, over rated non-treat non-free-fed meals. Below the sample floor returns not_enough_data. Use for 'is she eating well', 'appetite'. Frame declines as health, never 'picky'.",
    input_schema: {
      type: 'object',
      properties: { window: { type: 'string', enum: WINDOW_ENUM } },
    },
  },
  {
    name: 'top_foods',
    description:
      "Most-LOGGED foods in the window, ranked by meal count, with per-food finished-rate. Positive framing only — 'what's fed most', never a preference verdict. Below the floor returns not_enough_data.",
    input_schema: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: WINDOW_ENUM },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'top_proteins',
    description:
      "Most-consumed primary protein by exposure in the window. Use for 'what protein does she eat most'. Below the floor returns not_enough_data.",
    input_schema: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: WINDOW_ENUM },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'weight_summary',
    description:
      "Weight readings over the window (series in lbs, latest, delta, direction). Descriptive numbers + a neutral direction ONLY — never 'healthy'/'stable'. Use for 'what's her weight doing'.",
    input_schema: {
      type: 'object',
      properties: { window: { type: 'string', enum: WINDOW_ENUM } },
    },
  },
  {
    name: 'diet_trial_status',
    description: "The current diet-trial progress (day counter, target, days remaining). Use for 'how's the trial going', 'what day are we on'.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'free_fed',
    description: "Which foods are currently free-fed (bowl always down). Carries the 'intake not directly observed' caveat. Use for 'what does she graze on'.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'medications',
    description:
      "Current medications + a one-line adherence summary per drug (last given, doses given/missed) in the window. Use for 'what meds is she on', 'when was her last dose'.",
    input_schema: {
      type: 'object',
      properties: { window: { type: 'string', enum: WINDOW_ENUM } },
    },
  },
  {
    name: 'engine_findings',
    description:
      "What the Signal engine currently flags for this pet (safety findings first), relayed verbatim. Use to answer 'is anything flagged', or to check for a live safety finding before answering a symptom question. Empty = nothing flagged (never 'she's well').",
    input_schema: { type: 'object', properties: {} },
  },
  // ── Control tools: the four-way plan contract (§5.3) ──
  {
    name: 'provide_answer',
    description:
      "Give the final answer, phrasing ONLY the facts returned by the data tools you called. Every number in headline/detail MUST appear in a tool result — never compute, never estimate. Phrase counts as 'N of M' with the denominator; reference dates by month + day, not clock times. No exclamation marks. Never say the pet is fine/okay/healthy/normal, never diagnose, never call a decline 'picky', never claim one thing caused another.",
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'One short TLDR sentence (the Newsreader headline).' },
        detail: { type: 'string', description: 'One or two plain-language supporting sentences.' },
        feature_tool: {
          type: 'string',
          description:
            "Optional: the name of ONE data tool you called whose result should be shown as a component (chart/pips/list/tiles) and whose denominator/window should anchor the provenance row.",
        },
        followups: {
          type: 'array',
          items: { type: 'string' },
          description: 'Up to 3 short follow-up question chips the owner might tap next.',
        },
      },
      required: ['headline', 'detail'],
    },
  },
  {
    name: 'decline',
    description:
      "Do NOT answer — route to a designed deflection. Use when the question asks for a diagnosis or interpretation ('does she have X', 'is that a lot', 'should I worry') → clinical_judgment; fishes for reassurance ('so she's fine, right') → reassurance_fishing; asks for feeding/medical advice not from the record and general mode is off → general; asks to dump the whole record ('summarize everything', 'all my notes') → bulk_export; is out of scope → unsupported; or is unclear (which pet/symptom/window) → ambiguous. NEVER guess an answer.",
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['clinical_judgment', 'reassurance_fishing', 'general', 'bulk_export', 'unsupported', 'ambiguous'],
        },
        clarifier: { type: 'string', description: 'For ambiguous: the one thing to clarify (which pet / symptom / window).' },
      },
      required: ['reason'],
    },
  },
]

// ══════════════════════════════════════════════════════════════════════════════════
// dispatchTool — pure execution of a model tool call against the fetched context
// ══════════════════════════════════════════════════════════════════════════════════

export interface ToolCallResult {
  ok: boolean
  /** The tools.ts result object (captured for numeral-subset + provenance), or an error. */
  result: unknown
  /** True when the tool returned the NotEnoughData floor (routes the outcome to data_gap). */
  notEnoughData?: boolean
}

/** Run one model tool call over the fetched context. Pure — no DB, no model. An unknown
 *  tool name or a bad param yields an error result the loop feeds back (the model can
 *  re-plan), never a throw. Every window is coerced onto the enum inside tools.ts, so an
 *  off-enum string can never widen to an unbounded span (§3.4). */
export function dispatchTool(name: string, rawInput: unknown, ctx: AskDataContext): ToolCallResult {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>
  const window = (input.window as AskWindow) ?? undefined
  const wp = { window: coerceWindow(window as string), nowMs: ctx.nowMs, trialStartMs: ctx.trialStartMs }
  const type = typeof input.type === 'string' ? (input.type as string) : null
  const limit = typeof input.limit === 'number' ? (input.limit as number) : undefined
  const symptomType = typeof input.symptom_type === 'string' ? (input.symptom_type as string) : ''

  try {
    switch (name) {
      case 'count_symptom':
        return ok(countSymptom(ctx.events, { symptomType, ...wp }))
      case 'symptom_trend':
        return ok(symptomTrend(ctx.events, { symptomType, ...wp }))
      case 'time_of_day':
        return ok(timeOfDay(ctx.events, { symptomType, ...wp, timezone: ctx.timezone }))
      case 'last_symptom':
        return ok(lastSymptom(ctx.events, ctx.reads, { symptomType }))
      case 'recent_events':
        return ok(recentEvents(ctx.events, ctx.reads, { ...wp, type, limit }))
      case 'recall_event':
        return ok(recallEvent(ctx.events, ctx.reads, { eventId: String(input.event_id ?? '') }))
      case 'photo_presence':
        return ok(photoPresence(ctx.events, { ...wp, type }))
      case 'intake_summary':
        return floored(intakeSummary(ctx.meals, { ...wp, freeFedFoodIds: ctx.freeFedFoodIds }))
      case 'top_foods':
        return floored(topFoods(ctx.meals, { ...wp, freeFedFoodIds: ctx.freeFedFoodIds, limit }))
      case 'top_proteins':
        return floored(topProteins(ctx.meals, { ...wp, freeFedFoodIds: ctx.freeFedFoodIds, limit }))
      case 'weight_summary':
        return ok(weightSummary(ctx.weights, wp))
      case 'diet_trial_status':
        return ok(dietTrialStatus(ctx.trial, ctx.nowMs))
      case 'free_fed':
        return ok(freeFedStatus(ctx.arrangements))
      case 'medications':
        return ok(medications(ctx.regimens, ctx.doses, wp))
      case 'engine_findings':
        return ok(engineFindings(ctx.engineFindingsRaw))
      default:
        return { ok: false, result: { error: `Unknown tool: ${name}` } }
    }
  } catch (err) {
    return { ok: false, result: { error: err instanceof Error ? err.message : String(err) } }
  }
}

function ok(result: unknown): ToolCallResult {
  return { ok: true, result }
}
/** A tool that may return the NotEnoughData floor — flag it so the loop can route the
 *  outcome to the honest data_gap deflection instead of a guessed rate. */
function floored(result: unknown): ToolCallResult {
  return { ok: true, result, notEnoughData: isNotEnoughData(result) }
}

// ══════════════════════════════════════════════════════════════════════════════════
// read_photo — live per-incident photo reads (§6.2/§7.7, A8). The PURE decision half.
// ══════════════════════════════════════════════════════════════════════════════════
//
// read_photo is the ONE model tool that is not pure to dispatch: when no cached read
// exists it must actually LOOK at the photo, which means a service-role storage fetch +
// a vision call + a write-back — the shipped analyze-vomit / analyze-stool machinery
// (`_shared/incident-analysis.ts`), invoked over HTTP by index.ts exactly as the detail
// screen does (§6.2 — one read path, product-wide). So the split is: this file owns the
// PURE plan (does a usable cached read exist? is this even a readable, photographed
// event? is the per-question live-read budget spent?), and index.ts owns only the I/O
// for the `run` branch. Keeping the plan pure makes the run-or-read-cache decision and
// the never-run guards (no photo / wrong type / budget) unit-testable.
//
// SAFETY: a live read runs through the exact escalation floor + never-clobber write-back
// + never-reassure read-text selection as the detail screen, and Ask relays it via the
// SAME override-aware projection the cached-read path uses (projectCachedRead — present-
// only flags, no all-clear affordance). So a read Ask triggers is immediately a free-
// surface fact (visible on the event detail screen), Ask can never disagree with that
// screen about what a photo showed, and the n=1 asymmetry (escalate on presence, never
// reassure on absence) is inherited wholesale (§7.7). The validator gates the surrounding
// sentence regardless.

/** The event types that carry a per-incident photo-read machinery (vomit + the two stool
 *  event_types). Any other type has no read path — read_photo returns unsupported_type. */
export const PHOTO_READ_EVENT_TYPES: ReadonlySet<string> = new Set(['vomit', 'stool_normal', 'diarrhea'])

export type PhotoReadIncident = 'vomit' | 'stool'

/** Route an event_type to its incident-analysis family (the descriptor index.ts invokes).
 *  Null for a non-readable type. */
export function photoReadIncidentType(eventType: string): PhotoReadIncident | null {
  if (eventType === 'vomit') return 'vomit'
  if (eventType === 'stool_normal' || eventType === 'diarrhea') return 'stool'
  return null
}

/** Per-QUESTION live-read budget (the cost/abuse bound). Each live read is a vision call +
 *  a per-incident cap unit (analyze_vomit / analyze_stool, 10/day — the product-wide read
 *  cap, §9.1); this caps how many one question can TRIGGER so a crafted/injected prompt
 *  can't burn the whole daily cap across the tool loop. A cached RELAY is free (no invoke),
 *  so it never counts against this. 2 allows "compare the last two"; the daily cap backstops. */
export const MAX_LIVE_PHOTO_READS_PER_MESSAGE = 2

/** The read_photo tool result the model phrases from + the server features for provenance.
 *  `read` (when present) is the same override-aware projection the recall path relays. */
export interface PhotoReadResult {
  kind: 'read_photo'
  eventId: string | null
  eventType: string | null
  incidentType: PhotoReadIncident | null
  /**
   *  - `cached`   — a usable read already existed; relayed, no run, no cap burn.
   *  - `ran`      — a fresh read ran through the machinery and is relayed + persisted.
   *  - `capped`   — the daily photo-read limit is reached; no read this time (not "fine").
   *  - `unavailable` — the read couldn't run (flag off / failed / unreadable photo).
   *  - `no_photo` — the event has no photo to look at.
   *  - `unsupported_type` — not a vomit/stool event (no read machinery).
   *  - `not_found` — no live event with that id in the record.
   *  - `budget_exhausted` — this question already ran its allowed live reads.
   */
  status: 'cached' | 'ran' | 'capped' | 'unavailable' | 'no_photo' | 'unsupported_type' | 'not_found' | 'budget_exhausted'
  /** True ONLY when a fresh read actually ran (status 'ran') — drives the "I took a fresh
   *  look" framing and separates a run from a relay for cost accounting. */
  ranLiveRead: boolean
  /** The relayable, override-aware read (present-only flags), or null when there's nothing
   *  to relay (no run / no photo / capped / etc.). Never carries an "all clear" affordance. */
  read: ProjectedRead | null
}

/** The pure plan for a read_photo call, decided over the already-fetched context. `run`
 *  is the only outcome that needs I/O (index.ts invokes the machinery); every other
 *  outcome is a final result with no side effect. */
export type PhotoReadPlan =
  | { action: 'not_found' }
  | { action: 'no_photo'; eventId: string; eventType: string }
  | { action: 'unsupported_type'; eventId: string; eventType: string }
  | { action: 'relay_cached'; eventId: string; eventType: string; incidentType: PhotoReadIncident; read: ProjectedRead }
  | { action: 'budget_exhausted'; eventId: string; eventType: string; incidentType: PhotoReadIncident }
  | { action: 'run'; eventId: string; eventType: string; incidentType: PhotoReadIncident }

/**
 * Decide what a read_photo call should do — WITHOUT any I/O. Run-or-read-cache (§6.2):
 *   • unknown / soft-deleted id            → not_found (never a reassurance).
 *   • not a vomit/stool event              → unsupported_type.
 *   • no photo on the event                → no_photo (nothing to look at; a photoless
 *     contextual escalation still reaches the owner via engine_findings / safetyLead,
 *     relay-only — so we never invoke, and never burn a cap, for a photoless event).
 *   • a usable cached read already exists   → relay_cached (no run, no cap burn). "Usable"
 *     = a real analysis (completed / uncertain); pending/failed/capped/read_disabled are
 *     NOT usable → re-run. A dismissed-but-completed read still relays (its structured
 *     facts remain a recountable fact — dismissal never hides a present red flag).
 *   • the per-question live-read budget is spent → budget_exhausted (no run).
 *   • otherwise                            → run (index.ts invokes the machinery).
 * `liveReadsUsed` counts prior INVOKES this question (cached relays don't count).
 */
export function planPhotoRead(
  ctx: AskDataContext,
  eventId: string,
  liveReadsUsed: number,
  maxLiveReads: number = MAX_LIVE_PHOTO_READS_PER_MESSAGE,
): PhotoReadPlan {
  const event = ctx.events.find((e) => e.id === eventId && e.deletedAt == null)
  if (!event) return { action: 'not_found' }
  const incidentType = photoReadIncidentType(event.type)
  if (!incidentType) return { action: 'unsupported_type', eventId, eventType: event.type }
  if (!event.hasPhoto) return { action: 'no_photo', eventId, eventType: event.type }

  const read = ctx.reads.find((r) => r.eventId === eventId) ?? null
  if (read && (read.status === 'completed' || read.status === 'uncertain')) {
    return { action: 'relay_cached', eventId, eventType: event.type, incidentType, read: projectCachedRead(read) }
  }
  if (liveReadsUsed >= maxLiveReads) return { action: 'budget_exhausted', eventId, eventType: event.type, incidentType }
  return { action: 'run', eventId, eventType: event.type, incidentType }
}

// ── Deterministic read recount + model redaction (the §7.7 structural fix) ──────────
// The adversarial pass (2026-07-18) broke the first cut: the owner-facing photo-read
// sentence was model-authored free prose gated only by the reassurance denylist, which
// leaks ("that's a good sign", "the read came back clear", "nothing jumped out"). That is
// the exact leaky-denylist hole analyze-vomit closed by making its no-flag read text a
// DETERMINISTIC TEMPLATE (a denylist missed ~86% of reassurance phrasings — the read text
// must be structural, not lexical). So for Ask:
//   • the owner-facing read content is a DETERMINISTIC server line (buildReadLine),
//     never model prose — present-only, reusing the read's own structurally-safe read_text;
//   • the model is REDACTED (redactReadForModel) of the benign clinical details (colour,
//     contents, description, read_text), seeing only status + PRESENT red flags — so it can
//     still ESCALATE on a flag (the safe direction) but has no benign specifics to
//     editorialize into "it looked fine".
// Defense-in-depth (never the net): the reassurance denylist gains the demonstrated leak
// families, so even the model's recall framing can't drift into a photo verdict.

/** A concise, PRESENT-ONLY factual recount of a read's structured fields — the honest
 *  "what it looked like" (§7.7 permits "no blood or foreign material was flagged in this
 *  one" as a recount; being deterministic it can never drift to a wellness verdict). */
function recountReadFacts(read: ProjectedRead): string {
  const f = read.fields
  const parts: string[] = []
  if (read.incidentType === 'stool_normal' || read.incidentType === 'diarrhea') {
    if (f.stoolConsistency) parts.push(`${f.stoolConsistency.replace(/_/g, ' ')} stool`)
    if (read.flags.includes('stool_blood')) parts.push('with blood present')
    if (f.stoolMucusPresent === 'yes') parts.push('with mucus present')
    if (!read.flags.includes('stool_blood')) parts.push('with no blood flagged')
  } else {
    const desc: string[] = []
    if (f.colour) desc.push(f.colour.replace(/_/g, ' '))
    if (Array.isArray(f.contents) && f.contents.length) desc.push(f.contents.map((c) => c.replace(/_/g, ' ')).join(', '))
    if (desc.length) parts.push(desc.join(' '))
    if (read.flags.includes('blood')) parts.push('with what looks like blood')
    if (read.flags.includes('foreign_material')) parts.push(read.fields.foreignMaterialNote ? `with ${read.fields.foreignMaterialNote}` : "with something that doesn't look like food")
    if (!read.flags.includes('blood') && !read.flags.includes('foreign_material')) parts.push('with no blood or foreign material flagged')
  }
  return parts.length ? `Logged as ${parts.join(', ')}.` : ''
}

/** Build the DETERMINISTIC owner-facing read line for a featured read_photo result. Never
 *  model-authored; present-only; reuses the read's own structurally-safe read_text (which,
 *  for a no-flag read, IS the analyze-vomit never-reassure monitor template). Null when
 *  there is nothing to relay (not_found / unsupported_type — the model's recall handles
 *  those). Every branch is unit-tested against the reassurance regex (never-reassure). */
export function buildReadLine(result: PhotoReadResult, petName: string): string | null {
  const p = petName?.trim() || 'your pet'
  switch (result.status) {
    case 'ran':
    case 'cached': {
      const read = result.read
      if (!read) return null
      const facts = recountReadFacts(read)
      // read_text is the deterministic analyze-vomit text (monitor template on the no-flag
      // path — safe by construction). Hidden when dismissed → fall back to a safe generic.
      const tail = read.readText
        ? read.readText
        : `A single photo on its own can't say how ${p} is doing. If you're worried, your vet is the best call.`
      return [facts, tail].filter(Boolean).join(' ')
    }
    case 'no_photo':
      return `There's no photo on that one to look at.`
    case 'capped':
      return `I couldn't take a fresh look — ${p}'s daily photo-read limit has been reached. Open the event to run it later.`
    case 'unavailable':
      return `I couldn't read that photo just now. Open the event to try again.`
    case 'budget_exhausted':
      return `I've looked at as many photos as I can in one go — open the event to see this one.`
    default:
      return null // not_found / unsupported_type — the model's recall handles these
  }
}

/** The REDACTED view of a read_photo result handed to the MODEL. It never carries the benign
 *  clinical details (colour/contents/description/read_text) — and, critically, for a NO-FLAG
 *  read it carries NO absence signal either: `red_flags` is present ONLY when a red flag is
 *  actually present (so the model can lead the escalation — the safe direction). A no-flag
 *  read hands the model NOTHING to editorialize — no `red_flags:[]` to read as "nothing
 *  wrong" (the sibling-channel leak the 2026-07-18 re-review found: `red_flags:[]` IS the
 *  absence signal, and the model's own headline/detail then reassured past the denylist).
 *  `guidance` is SERVER-authored (trusted, not owner data). The deterministic buildReadLine
 *  carries the actual read to the owner; the model's job is the recall framing only. */
export function redactReadForModel(result: PhotoReadResult): Record<string, unknown> {
  const redFlags = result.read?.flags ?? []
  const hasRead = result.status === 'ran' || result.status === 'cached'
  const base = { kind: 'read_photo', eventId: result.eventId, eventType: result.eventType, status: result.status, ranLiveRead: result.ranLiveRead }
  if (hasRead && redFlags.length > 0) {
    // Escalation — the model IS told the present flag so it can lead with the concern.
    return { ...base, red_flags: redFlags, guidance: 'A red flag is present in this photo — lead by naming that concern plainly and route to the vet. The factual read summary is shown to the owner directly; do not add a wellness verdict.' }
  }
  if (hasRead) {
    // NO absence signal — no red_flags field at all. The model is told it has no appearance
    // information and must not mention the photo; there is no factual hook for a wellness verdict.
    return { ...base, guidance: "The photo's read is complete and its factual summary is shown to the owner directly, separately from your text. You have NO information about how the photo looked and did not see it — do NOT describe, characterize, or comment on the photo or its read in any way. Answer ONLY the recall context (when it happened, how often)." }
  }
  // no_photo / capped / unavailable / budget_exhausted / not_found / unsupported_type.
  return { ...base, guidance: 'No read is available for this photo right now. State that plainly and point to the event; never fill any gap with reassurance.' }
}

// ── Structural bar: the model may not reference a NO-FLAG photo read in its own prose ────
// The re-review's residual: the deterministic readLine is safe, but the model still authors
// headline/detail (the D6 TLDR the owner reads FIRST), and on a no-flag read it can slip a
// wellness verdict past the reassurance denylist ("that one's clean", "the read is negative",
// "all seems well" — 15/15 leaked). We do NOT trust model + denylist on this exact hazard
// (that is why readLine is deterministic), so we do not trust it for the surrounding sentence
// either: when a no-flag read was featured, the model must not reference the photo/read/its
// appearance AT ALL (the readLine carries it). This is a bounded, CATEGORICAL reference bar
// — reference nouns/verbs/verdict words for "the photo/read" — not the open-ended wellness
// vocabulary the denylist can't enumerate; paired with the redaction above (no absence
// signal), the model has neither the hook nor the channel. finalizeAnswer scrubs a
// photo-referencing headline/detail to a deterministic line and keeps the safe readLine.
// `look(?:s|ed|ing)?` covers looks/looked/looking (the round-3 leak was the present-tense
// "looks" — "That one looks typical for her" — which the old `looke?d?` missed).
// The reference set covers the read's OBJECT nouns (photo/image/read) AND its AGENT nouns
// (the AI/analysis/scan/assessment/result) — the round-4 note: "the AI didn't spot anything"
// referenced the read via its agent, not its object, and slipped. On a non-escalating read
// the model must not reference the read at all, by subject or object.
const PHOTO_REFERENCE_RE =
  /\b(photos?|image|picture|pic|snapshot|the shot|the read|the (?:ai|analysis|scan|assessment|result)s?|read (?:came|is|was|did|didn'?t|shows?|showed)|look(?:s|ed|ing)?|appears?|appeared|seems?|seemed|clean|clear|negative|flag(?:s|ged)?|(?:turn(?:s|ed)?|stood|jump(?:s|ed)?|came|show(?:s|ed)?) (?:up|out|back|anything|nothing)|nothing (?:turned|stood|jumped|showed|to flag|to note))\b/i

/** Does this text reference the photo / its appearance / the read verdict? Used ONLY when a
 *  no-flag read was featured, to bar the model from delivering a photo verdict the deterministic
 *  readLine already carries. Pure. */
export function mentionsPhotoAppearance(text: string): boolean {
  return PHOTO_REFERENCE_RE.test(text ?? '')
}

/** True when the most-recent read_photo captured this turn is anything OTHER than a real
 *  present-flag escalation — i.e. the reassurance-on-absence risk cases that trigger the
 *  reference bar: a no-flag ran/cached read, OR a capped/unavailable/no_photo/budget/
 *  not_found/unsupported read (where there is no read at all, so a model "it looked clear"
 *  is a pure fabrication — round-3 residual 2). ONLY a real present-flag read is exempt
 *  (the model SHOULD name the concern — escalate). */
export function featuredNonEscalatingRead(captured: { name: string; result: unknown }[]): boolean {
  for (let i = captured.length - 1; i >= 0; i--) {
    if (captured[i].name !== 'read_photo') continue
    const r = captured[i].result as PhotoReadResult
    const isEscalation = (r.status === 'ran' || r.status === 'cached') && !!r.read && r.read.flags.length > 0
    return !isEscalation
  }
  return false
}

/** The deterministic, guaranteed-clean headline a photo-referencing model sentence is scrubbed
 *  to on a no-flag-read turn (the recall data still rides in component/provenance, the photo in
 *  readLine). Never reassures by construction. */
export const SCRUBBED_READ_HEADLINE = "Here's what's logged for that one."

/** Build the read_photo tool result for every NON-run plan (the run branch's result is
 *  assembled by index.ts from the machinery's persisted row). Pure. */
export function buildPhotoReadResult(plan: Exclude<PhotoReadPlan, { action: 'run' }>): PhotoReadResult {
  switch (plan.action) {
    case 'not_found':
      return { kind: 'read_photo', eventId: null, eventType: null, incidentType: null, status: 'not_found', ranLiveRead: false, read: null }
    case 'no_photo':
      return { kind: 'read_photo', eventId: plan.eventId, eventType: plan.eventType, incidentType: null, status: 'no_photo', ranLiveRead: false, read: null }
    case 'unsupported_type':
      return { kind: 'read_photo', eventId: plan.eventId, eventType: plan.eventType, incidentType: null, status: 'unsupported_type', ranLiveRead: false, read: null }
    case 'relay_cached':
      return { kind: 'read_photo', eventId: plan.eventId, eventType: plan.eventType, incidentType: plan.incidentType, status: 'cached', ranLiveRead: false, read: plan.read }
    case 'budget_exhausted':
      return { kind: 'read_photo', eventId: plan.eventId, eventType: plan.eventType, incidentType: plan.incidentType, status: 'budget_exhausted', ranLiveRead: false, read: null }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// validateAnswer — the output gate (§7.3, G8)
// ══════════════════════════════════════════════════════════════════════════════════

// Reused from generate-signal/phrasing.ts (one guardrail lexicon across the product) and
// EXTENDED for Ask after the A4 adversarial pass. The added terms — `stable`/`steady`/
// `normal`/`unchanged`/`no change`/`no need to worry`/etc. — close the exact wellness-verdict
// words the tool docs ban (weightSummary's "never 'stable'/'improving'", §7.3's "normal for
// her") that the base Signal lexicon didn't carry, since the Signal never phrases a weight or
// a raw count. `\bnormal\b` requires a word boundary, so "normally eats" is NOT matched.
//
// A7 false-positive fix: bare `normal` collided with the ONE legitimate factual use in Ask —
// a recall/count answer about `stool_normal` events ("2 normal stools and 1 loose one this
// week"). `stool_normal` is a real event type reachable via recall (recentEvents/lastSymptom
// take free-form types), and dropping "normal" to satisfy the gate would blur a normal stool
// into a loose one — a safety-adjacent degradation on a stool question. So "normal" is
// excluded ONLY when it directly qualifies a stool/poop/bowel noun; every VERDICT use — "is
// normal", "looks normal", "a normal number for her", "back to normal", "normal range/weight
// /appetite" — still trips it (those don't precede a stool noun). This narrows nothing on the
// relayed photo reads: the analyze-vomit/-stool templates are already forbidden from saying
// "normal" at all (they describe what IS visible), so no relayed read depends on this.
//
// A7 absence-reassurance additions (the A7 adversarial pass, the counterexample-(b) break):
// the base lexicon was built around PRESENCE words (fine/healthy/thriving) but missed the
// reassurance-on-ABSENCE family — which is the half the n=1 invariant is actually about
// (§7.7: "no blood was flagged" is a recount; "it looked fine / no red flags" is unsayable).
// Added: "no red flag(s)", "nothing concerning/alarming/unusual/out of the ordinary", "in the
// clear", "clean bill", "unremarkable", "benign", "looks/looking good". Also added "improv*"
// and "getting/gotten/gets better" — weightSummary's own doc + migration-024 ban "improving",
// but the base lexicon never carried it, so "her weight is improving" slipped the gate. These
// do NOT collide with a relayed read: the analyze-vomit/-stool prompts forbid the model from
// commenting on the absence of a red flag at all ("never 'nothing concerning/alarming', 'no
// red flags', 'looks fine/normal'"), so a relayed monitor read never contains these — only a
// model trying to reassure would, which is exactly what we gate. An ESCALATION that names "a
// red flag" still passes (only the negation "no red flag(s)" is barred).
// The "nothing … wrong/concerning" family allows ONE optional intervening word so an
// absence-reassurance verb ("nothing SEEMED wrong", "nothing LOOKED concerning") can't slip
// the gate the adjacent form catches.
//
// A8 photo-read additions (the 2026-07-18 adversarial pass — the leaky-denylist proof).
// The primary net for a photo read is STRUCTURAL (buildReadLine is deterministic; the model
// is redacted of benign detail) — but the model still authors the recall framing, so these
// close the specific reassurance-on-absence phrasings that pass the base lexicon: "good
// sign", "reassuring", "encouraging", "promising", "came back clear", "reads clear", "looks
// clean", "nothing jumped out", "least concerning", "no worries", "not worried/worrying",
// "nothing remarkable/notable", "nothing of concern". `concern(?:s|ed)?` widens the
// "nothing ... concern" arm to catch "nothing of concern" / "least concern". These are
// verdict phrasings that never appear in an honest count/date recount, so no false positive.
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|no need to worry|nothing serious|no issues?|no problems?|probably fine|no concern|no cause for concern|not a concern|no red flags?|nothing (?:\w+ )?(?:wrong|concern(?:s|ed|ing)?|alarming|unusual|amiss|out of the ordinary|jumped out|to note|notable|remarkable)|least concern(?:ing)?|no worries|not worr(?:y|ied|ying)|good sign|reassur(?:e|es|ed|ing)|encouraging|promising|came back clear|reads? clear|look(?:s|ed|ing)? clean|in the clear|clean bill|unremarkable|benign|look(?:s|ing)? good|don'?t worry|doing great|doing well|all good|on the mend|mend|mending|thriving|recover(?:s|ed|ing)?|much better|get(?:ting|s)? better|gotten better|improv(?:e|es|ed|ing)|back to normal|right track|she'?s well|he'?s well|they'?re well|stable|steady|holding steady|unchanged|no change|normal(?!\s+(?:stools?|poops?|bowels?|movements?))|nothing to change|no need to (?:change|do anything))\b/i
const DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i
// Flagrant spelled-out quantities that assert a count the tools never returned — the
// number-word bypass of the numeral-subset check (A4 adversarial #2). A count claim must be
// a digit traceable to a tool result, so a fabricated word-quantity in a DATA answer is
// drift. Deliberately NARROW: only phrases that never appear in honest count prose. Softer
// words ("a few", "a couple", "several") are left OUT — they legitimately describe time
// spans ("a few more days") and would false-positive good answers into deflections; the
// prompt already instructs digits, and A7's copy pass hardens the tail.
//
// A7 addition: "percent"/"per cent" (and "percentage") — no tool returns a percentage (they
// return "N of M" / raw rates), so ANY percent word in a DATA answer is a model-COMPUTED
// figure (arithmetic, forbidden) that also slips the digit-only numeral check when spelled
// out ("seventy-five percent"). The digit form "75%" is already caught by the numeral-subset
// (0.75 ≠ 75); this closes the word form. Data-mode only (checked below), so general-mode
// guidance can still speak in general terms.
const VAGUE_QUANTITY_RE = /\b(a dozen|dozens|numerous|countless|many times|a bunch of|loads of|tons of|per ?cent|percentages?)\b/i
const CAUSAL_RE =
  /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic)|intoleran(?:t|ce)|reacts? to|leads? to|results? in)\b/i
// A diagnosis assertion — the app never diagnoses (G1). Screens the obvious disease-claim
// verbs; the STRUCTURAL defense is that a diagnosis-shaped question is deflected upstream
// (clinical_judgment), so this is defense-in-depth on the phrasing.
const DIAGNOSIS_RE =
  /\b(has|it'?s|she has|he has|they have|diagnos\w*|suffers? from|is (?:a )?sign of)\s+(?:ibd|pancreatitis|allergy|allergies|kidney disease|renal|diabetes|cancer|lymphoma|hyperthyroid\w*|gastritis|colitis)\b/i

export interface ValidateAnswerParams {
  text: string
  /** The union of numerals traceable to a tool result this turn (D2/§5.4). Empty ⇒ the
   *  numeral-subset check is skipped (a text-only answer with no numbers is fine). */
  allowedNumerals: ReadonlySet<string>
  /** 'data' = grounded in tool results (numeral-subset enforced, causal barred);
   *  'general' = fenced general-mode (§7.5 — no tool numerals, causal allowed as general
   *  knowledge, but still never reassure / diagnose / "picky"). */
  mode: 'data' | 'general'
  /** True when a live engine SAFETY finding is being relayed — reassurance is doubly
   *  barred (it already is unconditionally, but this documents the intent). */
  safety?: boolean
}

export type ValidateResult = { ok: true } | { ok: false; reason: string }

/** Gate the model's phrasing. Never-reassure and never-"picky" apply in EVERY mode (the
 *  n=1 spine is not mode-dependent). Causal + numeral-subset apply in data mode. Returns a
 *  reason so the loop can feed a targeted re-phrase instruction before falling back. */
export function validateAnswer(params: ValidateAnswerParams): ValidateResult {
  const t = (params.text ?? '').trim()
  if (t.length < 4) return { ok: false, reason: 'empty' }
  if (t.length > 600) return { ok: false, reason: 'too_long' }
  if (t.includes('!')) return { ok: false, reason: 'exclamation' } // nyx-voice Pattern 4
  // Never reassure (G2) — unconditional. A recall/count is a factual recount, never a
  // wellness verdict; absence of a red flag is never "she's fine".
  if (REASSURANCE_RE.test(t)) return { ok: false, reason: 'reassurance' }
  // Intake ≠ preference (G7) — unconditional.
  if (DISMISSIVE_RE.test(t)) return { ok: false, reason: 'picky' }
  // Never diagnose (G1) — unconditional defense-in-depth (the question was deflected upstream).
  if (DIAGNOSIS_RE.test(t)) return { ok: false, reason: 'diagnosis' }
  if (params.mode === 'data') {
    // Associational only (G4/§7.2): the model may not assert causation from the log.
    if (CAUSAL_RE.test(t)) return { ok: false, reason: 'causal' }
    // A spelled-out quantity is an un-traceable count — the number-word bypass (A4 #2).
    if (VAGUE_QUANTITY_RE.test(t)) return { ok: false, reason: 'vague_quantity' }
    // D2/§5.4 — every numeral must trace to a tool result. The model never does arithmetic.
    const stray = strayNumerals(t, params.allowedNumerals)
    if (stray.length > 0) return { ok: false, reason: `unverified_number:${stray[0]}` }
  }
  return { ok: true }
}

// ── Numeral-subset machinery (D2/§5.4) ────────────────────────────────────────────

const NUMERAL_RE = /\d+(?:\.\d+)?/g

/** Canonicalize a numeral token so equivalent forms compare equal: strip leading zeros on
 *  integers ('09' → '9'), keep decimals as-is ('0.75' → '0.75'). Lets a recall answer say
 *  "July 9" against an ISO "…-09" edge, and a count "3 of 4" against the raw result. */
export function canonicalNumeral(token: string): string {
  if (token.includes('.')) return token
  const n = Number.parseInt(token, 10)
  return Number.isFinite(n) ? String(n) : token
}

/** Every numeral (canonicalized) reachable from a JSON value — numeric leaves AND numerals
 *  embedded in string values (ISO dates, labels, window phrases). This is the allowed set:
 *  the answer's numerals must be a subset. Recursive, cycle-free (tool results are plain). */
export function collectNumerals(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (value == null) return into
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      into.add(canonicalNumeral(String(value)))
      // A rate like 0.75 is also legitimately rendered as its rounded whole ("75%") is NOT
      // allowed (that's arithmetic); but 0.75 → "0.8"/"1"? No — we add only the raw forms.
    }
    return into
  }
  if (typeof value === 'string') {
    const m = value.match(NUMERAL_RE)
    if (m) for (const tok of m) into.add(canonicalNumeral(tok))
    return into
  }
  if (Array.isArray(value)) {
    for (const v of value) collectNumerals(v, into)
    return into
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectNumerals(v, into)
    return into
  }
  return into
}

/** Sanitize model-authored follow-up chips (A4 adversarial #5 — the followups path had no
 *  gate). A follow-up is a SUGGESTED QUESTION the owner may tap, so it must never ASSERT
 *  wellness ("everything looks healthy — …") or frame intake as "picky", and never shout.
 *  Drops any failing chip (keeps the clean ones), trims to `max`. A diagnosis-SHAPED question
 *  ("Does she have IBD?") is NOT dropped — it is a legitimate question the surface answers
 *  with the clinical_judgment deflection when tapped. Numeral-subset does NOT apply (a
 *  question is not a claim). */
export function sanitizeFollowups(followups: unknown, max = 3): string[] {
  if (!Array.isArray(followups)) return []
  const out: string[] = []
  for (const f of followups) {
    if (typeof f !== 'string') continue
    const t = f.trim()
    if (t.length < 3 || t.length > 120) continue
    if (t.includes('!')) continue
    if (REASSURANCE_RE.test(t) || DISMISSIVE_RE.test(t)) continue
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

/** A generic safe lead used when a live SAFETY-class finding exists but carries no usable
 *  prose — so the guarantee keys on the CLASS, never the text (a safety finding is never
 *  silently skipped just because its `text` is absent; A4 adversarial re-review note). */
export const GENERIC_SAFETY_LEAD =
  "The Signal has a safety flag up for {pet} right now — open Home to see it, and your vet is the best call if you're worried."

/** The verbatim text of the leading live SAFETY finding in the engine's cached findings, or
 *  null. Operates on the ctx.engineFindingsRaw shape ([{ type, priorityClass, payload:{text} }])
 *  so the I/O layer can attach it STRUCTURALLY to every model-path answer (the A4 adversarial
 *  #6 fix — a live safety finding is never model-discretionary). Keys on the safety CLASS:
 *  the engine's own text (produced + validated by generate-signal) when present, else the
 *  generic lead — so a safety finding with empty prose still surfaces, never vanishes. */
export function leadingSafetyText(
  raw: { type?: unknown; priorityClass?: unknown; payload?: unknown }[] | null | undefined,
  petName = 'your pet',
): string | null {
  let hasSafetyClass = false
  for (const f of raw ?? []) {
    if (f?.priorityClass !== 'safety') continue
    hasSafetyClass = true
    const text = (f.payload as { text?: unknown } | null)?.text
    if (typeof text === 'string' && text.trim()) return text.trim()
  }
  return hasSafetyClass ? GENERIC_SAFETY_LEAD.replace('{pet}', petName) : null
}

/** The numerals in `text` that are NOT in `allowed` (canonicalized). A non-empty return is
 *  a validation failure — the model invented or computed a number. Years 2000–2099 and a
 *  small clock set are NOT auto-allowed: they must come from a tool result like everything
 *  else, keeping the check honest. */
export function strayNumerals(text: string, allowed: ReadonlySet<string>): string[] {
  const tokens = text.match(NUMERAL_RE) ?? []
  const stray: string[] = []
  for (const tok of tokens) {
    if (!allowed.has(canonicalNumeral(tok))) stray.push(tok)
  }
  return stray
}

// ══════════════════════════════════════════════════════════════════════════════════
// Provenance + component — built SERVER-SIDE from a captured tool result (§5.4)
// ══════════════════════════════════════════════════════════════════════════════════

/** Build the provenance row (denominator + window + tap-through) from the tool result the
 *  model featured. Server-built, so the denominator/window (AC-8) is present regardless of
 *  the model's prose. Returns null when the featured result has no natural provenance. */
export function buildProvenance(featured: unknown): AnswerProvenance | null {
  if (!featured || typeof featured !== 'object') return null
  const r = featured as Record<string, unknown>
  const window = typeof r.windowLabel === 'string' ? (r.windowLabel as string) : null

  switch (r.kind) {
    case 'count_symptom': {
      const count = num(r.count)
      const loggedDays = num(r.loggedDays)
      const span = num(r.spanDays)
      const denom =
        count != null && loggedDays != null && span != null
          ? `${count} event${count === 1 ? '' : 's'} · logging on ${loggedDays} of ${span} days`
          : null
      return { window, denominator: denom, tapThrough: { kind: 'filter', symptomType: str(r.symptomType), window: str(r.window) } }
    }
    case 'intake_summary': {
      const finished = num(r.finishedMeals)
      const rated = num(r.ratedMeals)
      return {
        window,
        denominator: finished != null && rated != null ? `${finished} of ${rated} meals finished` : null,
        tapThrough: { kind: 'filter', window: str(r.window) },
      }
    }
    case 'time_of_day': {
      const eligible = num(r.eligibleCount)
      const excluded = num(r.excludedCount)
      const denom =
        eligible != null
          ? `${eligible} timed event${eligible === 1 ? '' : 's'}${excluded && excluded > 0 ? ` · ${excluded} couldn't be placed on the clock` : ''}`
          : null
      return { window, denominator: denom, tapThrough: { kind: 'filter', symptomType: str(r.symptomType), window: str(r.window) } }
    }
    case 'weight_summary': {
      const n = num(r.readingCount)
      return { window, denominator: n != null ? `${n} weigh-in${n === 1 ? '' : 's'}` : null, tapThrough: null }
    }
    case 'recent_events': {
      const ids = Array.isArray(r.events) ? (r.events as { id?: unknown }[]).map((e) => String(e.id)).filter(Boolean) : []
      const matched = num(r.matched)
      const denom = matched != null ? `${ids.length} of ${matched} shown` : null
      return { window, denominator: denom, tapThrough: ids.length ? { kind: 'events', eventIds: ids } : null }
    }
    case 'recall_event':
    case 'last_symptom': {
      const ev = r.event as { id?: unknown } | null
      const id = ev && ev.id != null ? String(ev.id) : null
      return { window: null, denominator: null, tapThrough: id ? { kind: 'events', eventIds: [id] } : null }
    }
    case 'read_photo': {
      // The tap-through opens the event where the photo itself lives (§6.2 mode 1) — and,
      // for a live read, where the now-persisted read is visible like any other read. No
      // denominator/window: a single-incident read is not an aggregate.
      const id = r.eventId != null && r.status !== 'not_found' ? String(r.eventId) : null
      return { window: null, denominator: null, tapThrough: id ? { kind: 'events', eventIds: [id] } : null }
    }
    case 'photo_presence': {
      const ids = Array.isArray(r.eventIds) ? (r.eventIds as unknown[]).map(String) : []
      const count = num(r.count)
      return {
        window,
        denominator: count != null ? `${count} photo${count === 1 ? '' : 's'}` : null,
        tapThrough: ids.length ? { kind: 'events', eventIds: ids } : null,
      }
    }
    default:
      return window ? { window, denominator: null, tapThrough: null } : null
  }
}

/** Build a typed component descriptor from the featured tool result (§5.4). The client
 *  renders it with existing components; the data comes only from the result, so its numbers
 *  are honest by construction. Null when the result isn't data-shaped. */
export function buildComponent(featured: unknown): ComponentDescriptor | null {
  if (!featured || typeof featured !== 'object') return null
  const r = featured as Record<string, unknown>
  switch (r.kind) {
    case 'weight_summary': {
      const series = Array.isArray(r.seriesLbs) ? (r.seriesLbs as unknown[]).filter((n): n is number => typeof n === 'number') : []
      return series.length >= 2 ? { kind: 'spark', data: series } : null
    }
    case 'top_foods': {
      const foods = Array.isArray(r.foods) ? (r.foods as { label?: unknown; count?: unknown }[]) : []
      const data = foods.map((f) => ({ label: String(f.label ?? ''), count: num(f.count) ?? 0 }))
      return data.length ? { kind: 'ranked', data } : null
    }
    case 'top_proteins': {
      const proteins = Array.isArray(r.proteins) ? (r.proteins as { protein?: unknown; count?: unknown }[]) : []
      const data = proteins.map((p) => ({ label: String(p.protein ?? ''), count: num(p.count) ?? 0 }))
      return data.length ? { kind: 'ranked', data } : null
    }
    case 'time_of_day': {
      const bands = Array.isArray(r.byBand) ? (r.byBand as { label?: unknown; count?: unknown }[]) : []
      const data = bands.map((b) => ({ label: String(b.label ?? ''), count: num(b.count) ?? 0 }))
      return data.length ? { kind: 'ranked', data } : null
    }
    default:
      return null
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

// ══════════════════════════════════════════════════════════════════════════════════
// DEFLECTIONS (§7.4) — designed, warm, never-an-error; each DRIVES THE WEDGE (G3)
// ══════════════════════════════════════════════════════════════════════════════════

type DeflectionReason =
  | 'clinical_judgment'
  | 'reassurance_fishing'
  | 'general'
  | 'bulk_export'
  | 'unsupported'
  | 'ambiguous'
  | 'data_gap'
  | 'llm_unavailable'

/** The four-way plan contract's non-answer outcomes, rendered as designed deflections
 *  (§7.4). Never blank, never an error toast; every one offers a next step (the rundown,
 *  the report, a scoped question) so it drives the wedge rather than dead-ending (G3).
 *  These are deterministic — no model call, so they are guardrail-clean by construction and
 *  are the fallback when the model's own phrasing fails validation. */
export function buildDeflection(reason: DeflectionReason, petName: string, clarifier?: string | null): AskAnswerBody {
  const p = petName || 'your pet'
  const base = (outcome: AskOutcome, headline: string, detail: string, followups: string[]): AskAnswerBody => ({
    outcome,
    substantive: false,
    headline,
    detail,
    component: null,
    provenance: null,
    safetyLead: null, // set structurally by the I/O layer from the engine's live findings
    readLine: null, // a deflection features no photo read
    followups,
    conversationCredited: false,
    generalMode: false,
  })

  switch (reason) {
    case 'clinical_judgment':
      return base(
        'clinical_judgment',
        `That's one for ${p}'s vet.`,
        `A diagnosis needs an exam and bloodwork, not just a log. I can line up what's in ${p}'s record for the visit, though.`,
        ['Put together a vet-visit rundown', `How many times has ${p} vomited this month?`],
      )
    case 'reassurance_fishing':
      return base(
        'reassurance_fishing',
        `${p}'s record can't rule that out.`,
        `It only shows what's been logged, not how ${p} is doing overall. If your gut says something's off, that's worth a call to your vet. I can show you the counts behind it.`,
        [`How many times has ${p} been sick this week?`, 'Put together a vet-visit rundown'],
      )
    case 'general':
      return base(
        'general',
        `I stick to what ${p}'s record shows.`,
        `Feeding and treatment advice is your vet's call. I can tell you what ${p} has actually eaten or how often something's happened, though.`,
        [`What has ${p} eaten most this month?`, `What's ${p}'s weight doing?`],
      )
    case 'bulk_export':
      return base(
        'bulk_export',
        `I answer one question at a time, not the whole record at once.`,
        `For the full picture, the vet report and the vet-visit rundown pull it together. Ask me something specific and I'll show you the sources.`,
        ['Put together a vet-visit rundown', `How often has ${p} had loose stool lately?`],
      )
    case 'ambiguous':
      return base(
        'ambiguous',
        `Quick check so I get it right.`,
        clarifier ? clarifier : `Which symptom did you mean, and over what stretch of time?`,
        [`This week`, `This month`, `All time`],
      )
    case 'data_gap':
      return base(
        'data_gap',
        `Not enough logged to read that yet.`,
        `I'd rather tell you that than guess. A few more days of logging and I'll have something honest to say.`,
        [`Log something for ${p}`, `What has ${p} eaten most this month?`],
      )
    case 'llm_unavailable':
      // Cause-neutral on purpose: this fires whether the network dropped or the model was
      // unreachable server-side — the owner can't tell the two apart, and "the assistant"
      // reified a chatbot character Ask deliberately is not (§1). The client mirror
      // (buildOfflineDeflection) is kept verbatim-identical so the copy reads the same
      // whether the miss happened before or during the call.
      return base(
        'llm_unavailable',
        `I couldn't answer that just now.`,
        `${p}'s record is still all here. Try again in a moment, or open the vet-visit rundown — it works without a connection.`,
        ['Put together a vet-visit rundown'],
      )
    case 'unsupported':
    default:
      return base(
        'unsupported',
        `I can't answer that from ${p}'s record.`,
        `I can count symptoms, show what ${p}'s eaten, track weight, and relay what the Signal flags. Try one of those.`,
        [`How many times has ${p} vomited this month?`, `What has ${p} eaten most?`, `What's ${p}'s weight doing?`],
      )
  }
}

// ══════════════════════════════════════════════════════════════════════════════════
// System prompts (§5.4)
// ══════════════════════════════════════════════════════════════════════════════════

export const SYSTEM_PROMPT =
  "You are the working voice of Culprit, a calm pet-health app. The owner asks a question about ONE specific pet, and your ONLY sources are the deterministic tools listed. " +
  "You NEVER compute a number yourself and NEVER author a query — you select and parameterize the closed tools, read their results, then phrase an answer using ONLY the facts they returned. " +
  "The pet's name and species are given. Hard rules: " +
  "(1) Every number in your answer MUST come from a tool result. Never estimate, never do arithmetic (no percentages the tools didn't return — phrase as 'N of M'). " +
  "(2) Plan first: call the tools you need (you may call several), then call provide_answer. If a needed fact isn't available from any tool, or the question is unclear, call decline instead — NEVER guess. " +
  "(3) NEVER diagnose, name a disease, or say what caused something. NEVER reassure: do not say the pet is fine/okay/healthy/normal, and a count of zero means 'nothing logged', never 'she's well' — absence of a symptom is not wellness. Never describe the ABSENCE of a red flag as reassuring — do NOT say 'no red flags', 'nothing concerning', 'looks good/fine', or 'in the clear'; only state what IS present in the record, and if a photo read is relayed, recount what it shows, never that it looked okay. " +
  "(4) A pet eating less is a health signal, never 'picky', 'fussy', or a 'preference' — never explain eating less by saying she 'prefers' or 'has gone off' a food. Frame declines calmly and route to the vet if it continues. When asked what a pet 'prefers', answer only with which foods are fed/finished most (a positive rate over many meals), never as a verdict that a decline is just taste. " +
  "(5) If a data tool returns not_enough_data, decline with a data-gap; don't invent a rate. " +
  "(6) If engine_findings returns a SAFETY finding relevant to the question, lead with it — relay it verbatim, never soften it. " +
  "(7) Plain, warm language; address the owner as 'you'; use the pet's name; no exclamation marks; never cute. One or two sentences of detail. " +
  "(8) For a diagnosis-shaped or interpretive question ('does she have X', 'is that a lot', 'should I worry'), or a fishing-for-reassurance question ('so she's fine, right'), call decline — those are the vet's call, and declining still offers to line up the evidence. " +
  "(9) PHOTOS: to answer what a vomit or stool incident LOOKED like, first recall the event, then — only if it HAS a photo but no read yet — call read_photo with its id. read_photo does NOT return the photo's appearance to you: the factual read summary is rendered for the owner DIRECTLY, separately from your text. You get only the read STATUS and any PRESENT red flags. So: if it reports a red flag, lead by naming that concern plainly and route to the vet. Otherwise DO NOT describe, interpret, or comment on how the photo looked — do NOT say it looked fine/clear/normal, that nothing was wrong or concerning, that it's a good sign, or that the read came back clear — give ONLY the recall context (when it happened, how often). If it reports no_photo / capped / unavailable, say so plainly and point to the event. Never fill any gap with reassurance. Do NOT call read_photo for a non-vomit/stool event or speculatively — only when the owner asked what an incident looked like."

export const GENERAL_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  " GENERAL MODE IS ON: if the question is general pet-care guidance not answerable from the record, you MAY give brief, non-diagnostic general guidance — but you MUST fence it clearly as general and not from this pet's record, keep it non-diagnostic, and still route anything clinical to the vet. Never reassure about THIS pet's health, and prefer to ground the answer back into the log where you can."

// ══════════════════════════════════════════════════════════════════════════════════
// Caps & credit — the PURE decisions (§9 / D9). The I/O (record_ai_usage) is index.ts's.
// ══════════════════════════════════════════════════════════════════════════════════

/** Ask's two-grain caps (§9.1/§9.2). `conversationMonthly = null` ⇒ uncapped conversations
 *  (the experiment/allowlist tier the flag gates to today — the PM dogfoods uncapped).
 *  Track-3 overrides via app_config.ai_caps.ask to the free-tier 3/month. `messageDaily` is
 *  the per-user daily cost backstop; `perConversation` bounds one conversation's turns. */
export interface AskCaps {
  conversationMonthly: number | null
  messageDaily: number
  perConversation: number
}

/** Code defaults = the experiment tier (§9.2), because `ask_enabled` is allowlist-gated
 *  until Track-3 wires entitlements — everyone who can reach this IS on the allowlist.
 *  Overridable at runtime via app_config.ai_caps.ask (Track-3 sets the free 3/10/30). */
export const ASK_CAPS: AskCaps = { conversationMonthly: null, messageDaily: 40, perConversation: 10 }

/** Resolve the ask caps from an app_config.ai_caps value (shape: { ask: { conversation_monthly, message_daily, per_conversation } }).
 *  A missing/partial/malformed entry keeps the code defaults — an override can never
 *  accidentally tighten a grain to a broken value. `conversation_monthly: null` is honored
 *  as "uncapped" only when explicitly null; a missing key keeps the default. */
export function resolveAskCaps(aiCaps: unknown, defaults: AskCaps = ASK_CAPS): AskCaps {
  if (!aiCaps || typeof aiCaps !== 'object') return defaults
  const entry = (aiCaps as Record<string, unknown>).ask
  if (!entry || typeof entry !== 'object') return defaults
  const e = entry as Record<string, unknown>
  const posInt = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback
  return {
    conversationMonthly:
      e.conversation_monthly === null
        ? null
        : typeof e.conversation_monthly === 'number' && Number.isFinite(e.conversation_monthly)
          ? Math.max(0, Math.floor(e.conversation_monthly))
          : defaults.conversationMonthly,
    messageDaily: posInt(e.message_daily, defaults.messageDaily),
    perConversation: posInt(e.per_conversation, defaults.perConversation),
  }
}

/** An in-session conversation turn (D8 — held in client memory, echoed to the stateless
 *  server). An assistant turn carries `substantive` so the server can tell whether THIS
 *  conversation has already committed its free credit (D9) without persisting a transcript. */
export interface AskTurn {
  role: 'user' | 'assistant'
  content: string
  substantive?: boolean
}

/** Has this conversation already committed its free `ask_conversation` credit? True iff any
 *  prior ASSISTANT turn was substantive (D9 — the credit commits on the FIRST substantive
 *  answer, so any prior substantive turn means it's already spent). A tap-through that keeps
 *  the same conversation (D8) therefore never commits a second credit. */
export function conversationAlreadyCredited(conversation: AskTurn[] | null | undefined): boolean {
  return (conversation ?? []).some((t) => t.role === 'assistant' && t.substantive === true)
}

/** Count prior model-answering turns in this conversation (assistant turns), for the
 *  per-conversation message bound (§9.1). */
export function priorAssistantTurns(conversation: AskTurn[] | null | undefined): number {
  return (conversation ?? []).filter((t) => t.role === 'assistant').length
}

export type AskGateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; grain: 'conversation' | 'message'; cap: 'daily' | 'monthly' }

/**
 * The PRE-model gate (§9), decided BEFORE any model call or `ask_message` increment:
 *   • flag off ⇒ feature_disabled.
 *   • this conversation is already full (prior assistant turns ≥ perConversation) ⇒
 *     message cap (daily grain shape — the conversation can't take another turn).
 *   • a NEW/uncredited conversation whose owner is already at the monthly conversation cap
 *     ⇒ conversation cap (monthly). An ALREADY-credited conversation never re-checks the
 *     conversation cap (its credit is spent — follow-ups are free on that grain, D9),
 *     only the per-conversation message bound above.
 * `conversationMonthCount` is the caller's CURRENT ask_conversation month total (read, NOT
 * incremented — the credit commits post-answer, D9); null ⇒ unread/uncapped ⇒ don't gate on it.
 */
export function resolvePreModelGate(params: {
  flagEnabled: boolean
  alreadyCredited: boolean
  priorAssistantTurns: number
  conversationMonthCount: number | null
  caps: AskCaps
}): AskGateState {
  if (!params.flagEnabled) return { allow: false, reason: 'feature_disabled' }
  if (params.priorAssistantTurns >= params.caps.perConversation) {
    return { allow: false, reason: 'cap_reached', grain: 'message', cap: 'daily' }
  }
  if (
    !params.alreadyCredited &&
    params.caps.conversationMonthly != null &&
    params.conversationMonthCount != null &&
    params.conversationMonthCount >= params.caps.conversationMonthly
  ) {
    return { allow: false, reason: 'cap_reached', grain: 'conversation', cap: 'monthly' }
  }
  return { allow: true }
}

/** The POST-increment message cap check (§9.1). `messageDayCount` is the value returned by
 *  record_ai_usage(ask_message) (increments-then-returns); null ⇒ RPC error ⇒ fail-open.
 *  Over-cap is strictly-greater, matching every other function's shipped gate. */
export function resolveMessageCap(messageDayCount: number | null, caps: AskCaps): AskGateState {
  if (messageDayCount == null) return { allow: true }
  if (messageDayCount > caps.messageDaily) {
    return { allow: false, reason: 'cap_reached', grain: 'message', cap: 'daily' }
  }
  return { allow: true }
}

/** resets_at for a typed cap-reached body (§4.5): next UTC midnight (daily) / first-of-next-
 *  UTC-month (monthly). Pure over nowMs. Shared shape with the other functions. */
export function computeResetsAt(cap: 'daily' | 'monthly', nowMs: number): string {
  const d = new Date(nowMs)
  if (cap === 'daily') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString()
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString()
}
