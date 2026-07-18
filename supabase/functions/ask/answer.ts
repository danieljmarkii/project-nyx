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
  type AskWindow,
  type AskEventRow,
  type AskMealRow,
  type AskWeightRow,
  type AskRegimenRow,
  type AskDoseRow,
  type AskFeedingArrangementRow,
  type AskCachedReadRow,
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
// validateAnswer — the output gate (§7.3, G8)
// ══════════════════════════════════════════════════════════════════════════════════

// Reused verbatim from generate-signal/phrasing.ts so Ask and the Signal reject the same
// drift vocabulary — one guardrail lexicon across the product.
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|nothing serious|probably fine|no concern|don'?t worry|doing great|doing well|all good|on the mend|mend|mending|thriving|recover(?:s|ed|ing)?|much better|back to normal|right track|she'?s well|he'?s well|they'?re well)\b/i
const DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i
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
      return base(
        'llm_unavailable',
        `I couldn't reach the assistant just now.`,
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
  "(3) NEVER diagnose, name a disease, or say what caused something. NEVER reassure: do not say the pet is fine/okay/healthy/normal, and a count of zero means 'nothing logged', never 'she's well' — absence of a symptom is not wellness. " +
  "(4) A pet eating less is a health signal, never 'picky' or 'fussy'. Frame declines calmly and route to the vet if it continues. " +
  "(5) If a data tool returns not_enough_data, decline with a data-gap; don't invent a rate. " +
  "(6) If engine_findings returns a SAFETY finding relevant to the question, lead with it — relay it verbatim, never soften it. " +
  "(7) Plain, warm language; address the owner as 'you'; use the pet's name; no exclamation marks; never cute. One or two sentences of detail. " +
  "(8) For a diagnosis-shaped or interpretive question ('does she have X', 'is that a lot', 'should I worry'), or a fishing-for-reassurance question ('so she's fine, right'), call decline — those are the vet's call, and declining still offers to line up the evidence."

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
