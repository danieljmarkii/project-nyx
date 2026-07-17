// Supabase Edge Function — analyze-vomit
// Per-incident AI analysis for vomit events (B-027, under B-013).
//
// One Claude Sonnet vision call produces, from a single photo:
//   (1) a plain-language description + structured clinical fields, and
//   (2) an n=1 interpretive read ("based on this one instance, worry?").
// Results are cached to the event_ai_analysis row for this event.
//
// Dr. Chen's non-negotiable asymmetry: the read ESCALATES on the PRESENCE
// of a red flag → 'worth_a_call' (never a diagnosis); it NEVER reassures
// on the ABSENCE of one. The recommendation enum has no reassuring value.
//
// Escalation = context-assembled floor (PM 2026-05-24):
//   - the vision model raises VISUAL flags (blood, suspected foreign
//     material) from the photo;
//   - this function computes CONTEXTUAL flags (repeated vomiting, feline
//     reduced intake, concurrent lethargy) deterministically from
//     events+meals, and they FORCE 'worth_a_call' regardless of the photo
//     — the model cannot downgrade them. This is what catches the
//     clear-foam-but-cat-hasn't-eaten case and protects photo-less logs.
//
// Since B-247 PR 2 (D2, ratified 2026-07-16) the pipeline itself — auth,
// cap/flag gate, image handling, vision call, escalation floor, never-clobber
// write-back — lives in _shared/incident-analysis.ts, and this file is the
// VOMIT DESCRIPTOR: the enums, tool schema, system prompt, contextual-flag
// SQL, owner-facing copy, and Track-2 keys. The thin wrappers below keep the
// pure helpers' shipped signatures — this file is index.test.ts's import
// surface, and that suite passing UNMODIFIED is the refactor's regression
// proof (PR 2 AC). Reads are ownership-scoped via the caller's JWT (RLS);
// storage download and the write-back use the service role (trusted pipeline).

import {
  RECOMMENDATIONS,
  type Recommendation,
  type ClaudeResponse,
  type SupabaseClient,
  type FunctionCaps,
  type IncidentCopy,
  type IncidentDescriptor,
  type AnalysisWriteBack,
  type AnalysisReadFields as IncidentAnalysisReadFields,
  getToolUseInput,
  sanitizeEnum,
  sanitizeEnumArray,
  hoursBetween,
  applyEscalationFloor as applyIncidentEscalationFloor,
  selectReadText as selectIncidentReadText,
  buildAnalysisWriteBack as buildIncidentAnalysisWriteBack,
  runIncidentAnalysis,
} from '../_shared/incident-analysis.ts'

// The incident-agnostic pure helpers moved to the shared pipeline module in the
// D2 refactor; re-export them — and their parameter/return types, i.e. the full
// shipped signatures, of which index.test.ts consumes a subset — under their
// historical names so this file remains vomit's single import surface.
export {
  detectImageMediaType,
  bytesToBase64,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
} from '../_shared/incident-analysis.ts'
export type { FunctionCaps, GateState, AnalysisWriteBack } from '../_shared/incident-analysis.ts'

// ── Clinical thresholds (Dr. Chen, 2026-05-24) ────────────────────────────────
const REPEAT_VOMIT_SHORT_WINDOW_HOURS = 4
const REPEAT_VOMIT_SHORT_WINDOW_COUNT = 2
const REPEAT_VOMIT_DAY_WINDOW_HOURS = 24
const REPEAT_VOMIT_DAY_WINDOW_COUNT = 3
// Feline reduced-intake fires at the 24h edge (not the textbook 48h) because
// it only ever fires alongside an active vomit incident — vomiting + anorexia
// compounds risk toward the hepatic-lipidosis window.
const FELINE_REDUCED_INTAKE_HOURS = 24
const CONCURRENT_LETHARGY_HOURS = 24
// Intake-tracking baseline window: the feline flag keys off ABSENCE of
// positive intake, which conflates "didn't eat" with "didn't log". Only fire
// it for owners who actually track intake — i.e. who have rated a meal in the
// last week — so we never flag a non-logger. (Data caveat, B-027.)
const INTAKE_BASELINE_WINDOW_DAYS = 7

// ── Enum vocabularies (must match the DB enums in migration 013) ──────────────
const COLOURS = ['clear', 'white', 'yellow', 'green', 'brown', 'tan', 'pink_red', 'dark_red', 'black_coffee_ground', 'mixed', 'unsure'] as const
const CONTENTS = ['undigested_food', 'partially_digested_food', 'bile', 'foam', 'liquid_only', 'grass_or_plant', 'hair', 'unsure'] as const
const CONSISTENCIES = ['watery', 'foamy', 'mucoid_slimy', 'soft_formed', 'chunky', 'unsure'] as const
const BLOOD = ['none_visible', 'fresh_red', 'coffee_ground', 'unsure'] as const
const TRISTATE = ['yes', 'no', 'unsure'] as const
const VISUAL_FLAGS = ['blood', 'suspected_foreign_material'] as const

type ContextualFlag = 'repeated_vomiting' | 'feline_reduced_intake' | 'concurrent_lethargy'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VomitToolInput {
  appears_to_show_vomit?: boolean
  colour?: string
  contents?: string[]
  consistency?: string
  blood_present?: string
  bile_present?: string
  foreign_material_present?: string
  foreign_material_note?: string
  description?: string
  visual_flags?: string[]
  recommendation?: string
  read_text?: string
  confidence?: Record<string, number>
}

// Normalised structured output of the vision call.
export interface VomitAnalysis {
  appears_to_show_vomit: boolean
  colour: string | null
  contents: string[] | null
  consistency: string | null
  blood_present: string | null
  bile_present: string | null
  foreign_material_present: string | null
  foreign_material_note: string | null
  description: string | null
  visual_flags: string[]
  recommendation: Recommendation
  read_text: string | null
  confidence: Record<string, number> | null
}

// ── Vision tool schema ──────────────────────────────────────────────────────────
// Tool use forces structured JSON. The model returns 'unsure' (not a guess)
// for any field it cannot read — carried from the food extraction prompt rule.

const ANALYZE_TOOL = {
  name: 'analyze_vomit',
  description:
    'Record structured observations and a single-instance owner-facing read for one photo of pet vomit. ' +
    'Return "unsure" for any field not clearly visible — never guess.',
  input_schema: {
    type: 'object',
    properties: {
      appears_to_show_vomit: {
        type: 'boolean',
        description: 'True only if the photo plausibly shows pet vomit. False if it shows something else (the pet, food, stool, an empty floor, etc.).',
      },
      colour: { type: 'string', enum: COLOURS, description: 'Dominant colour of the vomit.' },
      contents: {
        type: 'array',
        items: { type: 'string', enum: CONTENTS },
        description: 'Visible material in the vomit (may be several). Do NOT include blood or foreign material here — those have dedicated fields.',
      },
      consistency: { type: 'string', enum: CONSISTENCIES, description: 'Overall consistency.' },
      blood_present: {
        type: 'string',
        enum: BLOOD,
        description: 'fresh_red = bright/red blood; coffee_ground = dark, granular digested blood; none_visible = no blood seen; unsure if not legible.',
      },
      bile_present: { type: 'string', enum: TRISTATE, description: 'Yellow/green bile visible?' },
      foreign_material_present: { type: 'string', enum: TRISTATE, description: 'Anything that is not food/bile/foam — fabric, plastic, string, bone, plant matter that looks non-dietary?' },
      foreign_material_note: { type: 'string', description: 'Short plain description of the suspected foreign material, only if foreign_material_present = yes.' },
      description: {
        type: 'string',
        description: 'One or two calm, plain-language sentences describing what is visible. Owner-facing. No jargon, no diagnosis, no exclamation marks.',
      },
      visual_flags: {
        type: 'array',
        items: { type: 'string', enum: VISUAL_FLAGS },
        description: 'Set "blood" if blood_present is fresh_red or coffee_ground; set "suspected_foreign_material" if foreign_material_present is yes.',
      },
      recommendation: {
        type: 'string',
        enum: RECOMMENDATIONS,
        description:
          "worth_a_call = a visible red flag is present (blood or foreign material); monitor = this photo shows nothing obviously concerning ON ITS OWN; " +
          "not_enough_to_say = the photo is unclear or does not appear to show vomit. NEVER choose a value that reassures the owner the pet is well.",
      },
      read_text: {
        type: 'string',
        description:
          'One or two sentences, owner-facing, matching the recommendation. For worth_a_call, name the visible concern plainly and calmly suggest a vet call. ' +
          'For monitor, do NOT comment on the absence of red flags (never "nothing concerning/alarming", "looks fine/normal", or "all clear"): instead state plainly ' +
          'what IS visible in this one photo, then one calm forward-looking line — what to keep an eye on and that the vet is the best call if the owner is worried or it recurs. ' +
          'No diagnosis, no treatment, no exclamation marks; never say or imply the pet is fine/okay/healthy/normal.',
      },
      confidence: {
        type: 'object',
        description: 'Per-field legibility confidence 0.0–1.0.',
        properties: {
          colour: { type: 'number', minimum: 0, maximum: 1 },
          contents: { type: 'number', minimum: 0, maximum: 1 },
          consistency: { type: 'number', minimum: 0, maximum: 1 },
          blood_present: { type: 'number', minimum: 0, maximum: 1 },
          bile_present: { type: 'number', minimum: 0, maximum: 1 },
          foreign_material_present: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    required: ['appears_to_show_vomit', 'recommendation'],
  },
}

const SYSTEM_PROMPT =
  'You are a veterinary triage assistant analysing a single photo of pet vomit, logged by a pet owner. ' +
  'You produce two things from this one photo: (1) factual structured fields describing what is visible, and ' +
  '(2) a brief, calm owner-facing read of this single instance. Hard rules: ' +
  '(1) You are looking at ONE instance. You never diagnose, never name a disease or condition, never suggest treatment, medication, or dosing. ' +
  '(2) You may flag the PRESENCE of something visibly concerning — visible blood (fresh red or coffee-ground/digested), or material that does not look like food — ' +
  'and when present, recommend the owner call their vet. You phrase this calmly, without alarm. ' +
  '(3) You NEVER reassure based on the absence of a visible problem — absence of a visible red flag does not mean the pet is well, and is never an all-clear. ' +
  'When you see no red flag, do NOT comment on that absence at all: do not say a photo looks fine/normal/okay, that there is nothing concerning or alarming, or that there is nothing to worry about. ' +
  'Instead, describe plainly what IS visible in this one photo, then give a single calm, forward-looking line — what to keep an eye on (e.g. if it happens again, or the pet seems unwell or off their food), and that the vet is the best call if the owner is worried. ' +
  'Never say or imply the pet is "fine", "okay", "healthy", or "normal". ' +
  '(4) For any structured field not clearly visible, return "unsure" — never guess. Set confidence to reflect legibility. ' +
  '(5) If the photo does not appear to show vomit, set appears_to_show_vomit=false, leave fields "unsure", and recommend not_enough_to_say. ' +
  '(6) Plain owner language, not clinical jargon ("blood" not "haematemesis", "something that is not food" not "foreign body"). No exclamation marks. ' +
  'Call the analyze_vomit tool with your findings.'

// ── Pure helpers (exported for unit tests — see index.test.ts) ────────────────

// Normalises the tool_use block into a VomitAnalysis. Bad/hallucinated enum
// values are dropped to null rather than tripping the DB enum on write.
export function parseAnalysisToolResult(response: ClaudeResponse): VomitAnalysis | null {
  const input = getToolUseInput(response, 'analyze_vomit') as VomitToolInput | null
  if (!input) return null

  const appears = input.appears_to_show_vomit === true
  const contents = sanitizeEnumArray(input.contents, CONTENTS)
  const visualFlags = sanitizeEnumArray(input.visual_flags, VISUAL_FLAGS)
  const recommendation = (sanitizeEnum(input.recommendation, RECOMMENDATIONS) ?? 'not_enough_to_say') as Recommendation

  return {
    appears_to_show_vomit: appears,
    colour: sanitizeEnum(input.colour, COLOURS),
    contents: contents.length > 0 ? contents : null,
    consistency: sanitizeEnum(input.consistency, CONSISTENCIES),
    blood_present: sanitizeEnum(input.blood_present, BLOOD),
    bile_present: sanitizeEnum(input.bile_present, TRISTATE),
    foreign_material_present: sanitizeEnum(input.foreign_material_present, TRISTATE),
    foreign_material_note: typeof input.foreign_material_note === 'string' ? input.foreign_material_note : null,
    description: typeof input.description === 'string' ? input.description : null,
    visual_flags: visualFlags,
    recommendation,
    read_text: typeof input.read_text === 'string' ? input.read_text : null,
    confidence: input.confidence && typeof input.confidence === 'object' ? input.confidence : null,
  }
}

export interface ContextInput {
  species: string
  // occurred_at (ISO) of every non-deleted vomit event in the last 24h,
  // INCLUDING the event being analysed. Uses occurred_at (B-010 representative
  // point) — imprecise for windowed events but the agreed sort/representative key.
  recentVomitTimes: string[]
  thisEventOccurredAt: string
  // True if the cat has had a meal rated 'most'/'all' within the feline window.
  hasRecentPositiveIntake: boolean
  // True if the owner actually tracks intake (any rated meal in the baseline
  // window) — guards the feline flag against absence-of-logging false positives.
  tracksIntake: boolean
  // True if a non-deleted lethargy event was logged within the lethargy window.
  hasRecentLethargy: boolean
}

export function computeContextualFlags(input: ContextInput): ContextualFlag[] {
  const flags: ContextualFlag[] = []

  const within = (hours: number) =>
    input.recentVomitTimes.filter((t) => hoursBetween(t, input.thisEventOccurredAt) <= hours).length
  if (
    within(REPEAT_VOMIT_SHORT_WINDOW_HOURS) >= REPEAT_VOMIT_SHORT_WINDOW_COUNT ||
    within(REPEAT_VOMIT_DAY_WINDOW_HOURS) >= REPEAT_VOMIT_DAY_WINDOW_COUNT
  ) {
    flags.push('repeated_vomiting')
  }

  // Cat + vomiting + no full/most meal within the window. Only for owners who
  // track intake, so absence-of-log never masquerades as anorexia.
  if (input.species === 'cat' && input.tracksIntake && !input.hasRecentPositiveIntake) {
    flags.push('feline_reduced_intake')
  }

  if (input.hasRecentLethargy) {
    flags.push('concurrent_lethargy')
  }

  return flags
}

// The escalation floor. Contextual and visual flags both force worth_a_call;
// no-photo / not-vomit collapses to not_enough_to_say; otherwise monitor.
// There is intentionally no path to a reassuring verdict. The mechanism is
// framework-owned (_shared/incident-analysis.ts — a descriptor cannot weaken
// it); this wrapper keeps vomit's shipped signature for the test suite.
export function applyEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowVomit: boolean
  hasPhoto: boolean
  visualFlags: string[]
  contextualFlags: ContextualFlag[]
}): Recommendation {
  return applyIncidentEscalationFloor({
    modelRecommendation: params.modelRecommendation,
    appearsToShowSubject: params.appearsToShowVomit,
    hasPhoto: params.hasPhoto,
    visualFlags: params.visualFlags,
    contextualFlags: params.contextualFlags,
  })
}

// When contextual flags fire, the model's photo-only read may have (honestly)
// said "nothing concerning" — which now contradicts the forced worth_a_call.
// Replace it with a specific, calm read that names the contextual reason.
// Highest-acuity flag wins. Plain language, pet name, no diagnosis, no alarm.
export function buildContextualReadText(petName: string, flags: ContextualFlag[]): string {
  const p = petName || 'Your pet'
  if (flags.includes('feline_reduced_intake')) {
    return `${p} has been vomiting and hasn't eaten a full meal recently. In cats that combination is worth a call to your vet sooner rather than later.`
  }
  if (flags.includes('repeated_vomiting')) {
    return `${p} has thrown up more than once in a short window. Repeated vomiting like that is worth a call to your vet.`
  }
  return `${p} has also been low on energy around this. Together, that's worth a quick call to your vet.`
}

function buildNoFlagReadText(petName: string, hasPhoto: boolean): string {
  const p = petName || 'your pet'
  const lead = hasPhoto
    ? "There's not much I can read from this one on its own."
    : "Without a photo there's not much I can read from this one on its own."
  return `${lead} If you're worried about ${p}, your vet is the best call.`
}

// ── B-060: the n=1 read never reassures on the ABSENCE of a red flag ───────────
// Dr. Chen / clinical-guardrails Pattern 1: a single sample may ESCALATE on the
// presence of a visible flag, never reassure on its absence (absence ≠ wellness —
// the foam-cat hepatic-lipidosis miss). The model's free-text read_text is the only
// owner-facing string a template doesn't produce, so the guarantee is STRUCTURAL, not
// lexical: the model's words reach the owner ONLY when the recommendation is the
// worth_a_call escalation (a visual flag it raised, or its own worth_a_call —
// either way the read NAMES a present concern, the safe "escalate on presence"
// direction). On the monitor / no-flag path — the
// reassurance-on-absence risk — the read is a deterministic template, never the
// model's words. (A regex denylist was tried and rejected: it can't enumerate the
// open vocabulary of "the model asserted wellness" — it missed ~86% of plausible
// phrasings while nuking legitimate concern reads; adversarial review 2026-06-24.)
// The selection ORDER enforcing this lives in the shared module's selectReadText;
// these templates are the vomit-specific copy it selects among.

// monitor: a clear photo with no visible/contextual flag. One sample is never an
// all-clear, so this acknowledges the limit and stays forward-looking — it does NOT
// comment on the absence of concern.
function buildMonitorReadText(petName: string): string {
  const p = petName || 'your pet'
  return `A single photo on its own can't tell you how ${p} is doing. Keep an eye on ${p} — if it happens again, or ${p} seems unwell or goes off food, your vet is the best call.`
}

// Escalation on a model-raised visual flag, used when the model didn't write its own
// read. Names the present concern plainly (the safe direction) and routes to the vet.
function buildVisualFlagReadText(petName: string, visualFlags: string[]): string {
  const p = petName || 'your pet'
  const hasBlood = visualFlags.includes('blood')
  const hasForeign = visualFlags.includes('suspected_foreign_material')
  const seen = hasBlood && hasForeign
    ? "what looks like blood, and something that doesn't look like food,"
    : hasBlood
      ? 'what looks like blood'
      : hasForeign
        ? "something that doesn't look like food"
        : 'something worth a closer look'
  return `I can see ${seen} in this photo. That's worth a call to your vet about ${p}.`
}

// Photo present but unreadable (oversize / undecodable format). Honest about the
// failure, never reassures, routes to the vet.
function buildPhotoUnreadableReadText(petName: string): string {
  const p = petName || 'your pet'
  return `I couldn't read this photo — it may be too large or in a format I can't open. Try replacing it with a fresh shot and I'll take another look. If you're worried about ${p}, your vet is the best call.`
}

// The vomit templates handed to the shared pipeline. Every string here is
// covered by the reassurance-word regex test (Pattern 8) in index.test.ts.
const VOMIT_COPY: IncidentCopy<ContextualFlag> = {
  contextual: buildContextualReadText,
  photoUnreadable: buildPhotoUnreadableReadText,
  monitor: buildMonitorReadText,
  visualFlagFallback: buildVisualFlagReadText,
  noFlag: buildNoFlagReadText,
}

// The load-bearing read selection, pure + exported so the never-reassure guarantee is
// unit-tested rather than asserted by a comment. The model's free text reaches the
// owner ONLY on the worth_a_call escalation path; every other path — above all the
// reassurance-on-absence (monitor) path — is a deterministic template. The selection
// order is the shared module's mechanism; this wrapper binds it to the vomit copy.
export function selectReadText(params: {
  petName: string
  recommendation: Recommendation
  contextualFlags: ContextualFlag[]
  visualFlags: string[]
  modelReadText: string | null
  photoUnreadable: boolean
  hasPhoto: boolean
}): string {
  return selectIncidentReadText(VOMIT_COPY, params)
}

// ── Write-back: the server half of the never-clobber guard (B-028) ─────────────
// The n=1 read + flags always refresh (so the deterministic floor can re-escalate
// on worsening context); the structured CLINICAL fields are the owner's once
// edited and must survive a re-analysis untouched. The update-vs-upsert decision
// is the shared module's (Pattern 7); this file owns only the vomit column set.

type AnalysisReadFields = IncidentAnalysisReadFields<ContextualFlag>

// The vomit structured column values for the full-upsert path. Called with null
// when no model ran — every column is then null (nothing to preserve on a fresh
// row; a prior real analysis routes through update mode instead).
function buildVomitStructuredValues(analysis: VomitAnalysis | null): Record<string, unknown> {
  return {
    ai_raw_payload: analysis,
    ai_confidence: analysis?.confidence ?? null,
    colour: analysis?.colour ?? null,
    contents: analysis?.contents ?? null,
    consistency: analysis?.consistency ?? null,
    blood_present: analysis?.blood_present ?? null,
    bile_present: analysis?.bile_present ?? null,
    foreign_material_present: analysis?.foreign_material_present ?? null,
    foreign_material_note: analysis?.foreign_material_note ?? null,
    description: analysis?.description ?? null,
  }
}

// Kept with vomit's shipped signature (analysis in, incident_type fixed to
// 'vomit') — the test suite pins the never-clobber shape through this wrapper.
export function buildAnalysisWriteBack(params: {
  humanEdited: boolean
  eventId: string
  petId: string
  analysis: VomitAnalysis | null
  readFields: AnalysisReadFields
}): AnalysisWriteBack {
  return buildIncidentAnalysisWriteBack({
    humanEdited: params.humanEdited,
    eventId: params.eventId,
    petId: params.petId,
    incidentType: 'vomit',
    structuredValues: buildVomitStructuredValues(params.analysis),
    readFields: params.readFields,
  })
}

// Exported only so the test can assert the update branch carries no structured
// column (the columns the never-clobber guard must protect).
export const STRUCTURED_FIELD_KEYS = [
  'ai_raw_payload', 'ai_confidence', 'colour', 'contents', 'consistency',
  'blood_present', 'bile_present', 'foreign_material_present', 'foreign_material_note',
  'description',
] as const

// ── Context assembly (DB reads, ownership-scoped via the caller JWT) ───────────

async function assembleContext(
  userClient: SupabaseClient,
  petId: string,
  thisEventOccurredAt: string,
  species: string,
): Promise<ContextInput> {
  const now = Date.now()
  const dayAgo = new Date(now - 24 * 3_600_000).toISOString()
  const intakeBaselineAgo = new Date(now - INTAKE_BASELINE_WINDOW_DAYS * 86_400_000).toISOString()
  const felineWindowAgo = new Date(now - FELINE_REDUCED_INTAKE_HOURS * 3_600_000).toISOString()
  const lethargyWindowAgo = new Date(now - CONCURRENT_LETHARGY_HOURS * 3_600_000).toISOString()

  const [vomitsRes, lethargyRes, mealEventsRes] = await Promise.all([
    userClient
      .from('events')
      .select('occurred_at')
      .eq('pet_id', petId)
      .eq('event_type', 'vomit')
      .is('deleted_at', null)
      .gte('occurred_at', dayAgo),
    userClient
      .from('events')
      .select('id')
      .eq('pet_id', petId)
      .eq('event_type', 'lethargy')
      .is('deleted_at', null)
      .gte('occurred_at', lethargyWindowAgo)
      .limit(1),
    // Meal events in the intake baseline window, with their intake rating.
    userClient
      .from('events')
      .select('occurred_at, meals(intake_rating)')
      .eq('pet_id', petId)
      .eq('event_type', 'meal')
      .is('deleted_at', null)
      .gte('occurred_at', intakeBaselineAgo),
  ])

  const recentVomitTimes = (vomitsRes.data ?? []).map((r) => r.occurred_at as string)
  // Ensure this event is represented even if the read raced its own write.
  if (!recentVomitTimes.includes(thisEventOccurredAt)) recentVomitTimes.push(thisEventOccurredAt)

  const hasRecentLethargy = (lethargyRes.data ?? []).length > 0

  type MealEventRow = { occurred_at: string; meals: { intake_rating: string | null } | { intake_rating: string | null }[] | null }
  const mealRows = (mealEventsRes.data ?? []) as MealEventRow[]
  const ratingOf = (m: MealEventRow): string | null => {
    const meal = Array.isArray(m.meals) ? m.meals[0] : m.meals
    return meal?.intake_rating ?? null
  }
  const tracksIntake = mealRows.some((m) => ratingOf(m) !== null)
  const hasRecentPositiveIntake = mealRows.some(
    (m) => m.occurred_at >= felineWindowAgo && (ratingOf(m) === 'most' || ratingOf(m) === 'all'),
  )

  return {
    species,
    recentVomitTimes,
    thisEventOccurredAt,
    hasRecentPositiveIntake,
    tracksIntake,
    hasRecentLethargy,
  }
}

// ── Cap + flag gate identity (Monetization Track 2, T2-3 / B-329 + B-001) ─────
// docs/monetization-and-throttling-requirements.md §4–§5. The gate logic is the
// shared module's (consolidated there by D2, ending the S6 per-function-copy
// era); the per-type keys + caps stay here in the descriptor.

// analyze-vomit free caps (§4.4): daily 10 / monthly 200. DELIBERATELY identical
// across tiers (D-M2) — the cap gates the descriptive read only; the deterministic
// escalation floor fires regardless (§5.4). Overridable via app_config.ai_caps.
const CAPS: FunctionCaps = { daily: 10, monthly: 200 }
const FUNCTION_KEY = 'analyze_vomit'
const FLAG_KEY = 'ai_vomit_read_enabled'

// ── The vomit descriptor (D2) ───────────────────────────────────────────────────

const VOMIT_DESCRIPTOR: IncidentDescriptor<VomitAnalysis, ContextualFlag> = {
  functionName: 'analyze-vomit',
  eventTypes: ['vomit'],
  wrongEventTypeMessage: 'Event is not a vomit event',
  functionKey: FUNCTION_KEY,
  flagKey: FLAG_KEY,
  caps: CAPS,
  model: 'claude-sonnet-4-6',
  systemPrompt: SYSTEM_PROMPT,
  tool: ANALYZE_TOOL,
  userMessageText: 'Analyse this photo of pet vomit.',
  parseToolResult: parseAnalysisToolResult,
  appearsToShowSubject: (analysis) => analysis.appears_to_show_vomit,
  computeContextualFlags: async (userClient, { petId, occurredAt, species }) =>
    computeContextualFlags(await assembleContext(userClient, petId, occurredAt, species)),
  copy: VOMIT_COPY,
  buildStructuredValues: buildVomitStructuredValues,
}

const handler = (req: Request): Promise<Response> => runIncidentAnalysis(VOMIT_DESCRIPTOR, req)

// Guard the listener so importing this module for `deno test` does not try to
// bind a server (which crashes the test runner). `import.meta.main` is true only
// when this file is the deployed entrypoint, false on test import (B-180).
if (import.meta.main) {
  Deno.serve(handler)
}
