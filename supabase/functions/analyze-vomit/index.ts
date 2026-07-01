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
// Reads are ownership-scoped via the caller's JWT (RLS); storage download
// and the write-back use the service role (trusted pipeline), mirroring
// extract-food-from-photo. Re-analysis never clobbers a human-edited field.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

// Claude rejects any single image whose base64 payload exceeds 5 MB. Full-res
// photos can exceed it (an uncompressed original — see the sync-path clobber this
// shipped with). We guard on the RAW byte size (blob.size) BEFORE base64-encoding:
// the encode itself is what OOM'd the worker (a 546 memory kill that hard-terminates
// the isolate, so no analysis row was ever written) — the old post-encode size
// filter ran too late to prevent it.
const MAX_CLAUDE_IMAGE_BASE64 = 5_242_880
// base64 inflates bytes by 4/3, so the raw ceiling that stays within the base64
// cap is floor(cap / 4) * 3 ≈ 3.93 MB. floor-then-×3 is provably ≤ cap for ANY
// cap (4·floor(cap/4) ≤ cap), so a future edit to the base64 cap can't quietly
// let an over-cap image through — unlike floor(cap * 3 / 4), which overshoots
// when cap mod 4 == 2.
const MAX_CLAUDE_IMAGE_BYTES = Math.floor(MAX_CLAUDE_IMAGE_BASE64 / 4) * 3

// ── Enum vocabularies (must match the DB enums in migration 013) ──────────────
const COLOURS = ['clear', 'white', 'yellow', 'green', 'brown', 'tan', 'pink_red', 'dark_red', 'black_coffee_ground', 'mixed', 'unsure'] as const
const CONTENTS = ['undigested_food', 'partially_digested_food', 'bile', 'foam', 'liquid_only', 'grass_or_plant', 'hair', 'unsure'] as const
const CONSISTENCIES = ['watery', 'foamy', 'mucoid_slimy', 'soft_formed', 'chunky', 'unsure'] as const
const BLOOD = ['none_visible', 'fresh_red', 'coffee_ground', 'unsure'] as const
const TRISTATE = ['yes', 'no', 'unsure'] as const
const VISUAL_FLAGS = ['blood', 'suspected_foreign_material'] as const
const RECOMMENDATIONS = ['worth_a_call', 'monitor', 'not_enough_to_say'] as const

type Recommendation = typeof RECOMMENDATIONS[number]
type ContextualFlag = 'repeated_vomiting' | 'feline_reduced_intake' | 'concurrent_lethargy'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  event_id: string
}

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

interface ClaudeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: VomitToolInput }
  >
  stop_reason: string
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

function sanitizeEnum(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

function sanitizeEnumArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && allowed.includes(v))
}

// Normalises the tool_use block into a VomitAnalysis. Bad/hallucinated enum
// values are dropped to null rather than tripping the DB enum on write.
export function parseAnalysisToolResult(response: ClaudeResponse): VomitAnalysis | null {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === 'analyze_vomit')
  if (!block || block.type !== 'tool_use') return null
  const input = block.input as VomitToolInput

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

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000
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
// There is intentionally no path to a reassuring verdict.
export function applyEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowVomit: boolean
  hasPhoto: boolean
  visualFlags: string[]
  contextualFlags: ContextualFlag[]
}): Recommendation {
  if (params.contextualFlags.length > 0) return 'worth_a_call'
  if (params.visualFlags.length > 0) return 'worth_a_call'
  if (!params.hasPhoto) return 'not_enough_to_say'
  if (!params.appearsToShowVomit) return 'not_enough_to_say'
  if (params.modelRecommendation === 'worth_a_call') return 'worth_a_call'
  return 'monitor'
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
// lexical: the model's words reach the owner ONLY when the recommendation escalates on
// a visual flag it raised (there the read NAMES a present concern — the safe
// "escalate on presence" direction). On the monitor / no-flag path — the
// reassurance-on-absence risk — the read is a deterministic template, never the
// model's words. (A regex denylist was tried and rejected: it can't enumerate the
// open vocabulary of "the model asserted wellness" — it missed ~86% of plausible
// phrasings while nuking legitimate concern reads; adversarial review 2026-06-24.)

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

// The load-bearing read selection, pure + exported so the never-reassure guarantee is
// unit-tested rather than asserted by a comment. The model's free text reaches the
// owner ONLY on the worth_a_call escalation path; every other path — above all the
// reassurance-on-absence (monitor) path — is a deterministic template.
export function selectReadText(params: {
  petName: string
  recommendation: Recommendation
  contextualFlags: ContextualFlag[]
  visualFlags: string[]
  modelReadText: string | null
  photoUnreadable: boolean
  hasPhoto: boolean
}): string {
  const { petName, recommendation, contextualFlags, visualFlags, modelReadText, photoUnreadable, hasPhoto } = params
  // 1. Floor escalated on CONTEXT — the model's photo-only read may contradict it.
  if (contextualFlags.length > 0) return buildContextualReadText(petName, contextualFlags)
  // 2. Unreadable photo — honest failure, never reassures.
  if (photoUnreadable) return buildPhotoUnreadableReadText(petName)
  // 3. Escalation on a VISUAL flag — the ONLY path that surfaces the model's free text
  //    (it names a present red flag; "escalate on presence" is the safe direction).
  if (recommendation === 'worth_a_call') return modelReadText ?? buildVisualFlagReadText(petName, visualFlags)
  // 4. monitor — a clear photo, no flag. NEVER the model's read (the reassurance-on-
  //    absence risk); a deterministic forward-looking template instead.
  if (recommendation === 'monitor') return buildMonitorReadText(petName)
  // 5. not_enough_to_say — unclear photo, not vomit, or no photo.
  return buildNoFlagReadText(petName, hasPhoto)
}

// ── Write-back decision: the server half of the never-clobber guard (B-028) ────
// The n=1 read + flags always refresh (so the deterministic floor can re-escalate
// on worsening context); the structured CLINICAL fields are the owner's once
// edited and must survive a re-analysis untouched.
interface AnalysisReadFields {
  recommendation: Recommendation
  read_text: string | null
  visual_flags: string[]
  contextual_flags: ContextualFlag[]
  status: string
  error: null
}

export type AnalysisWriteBack =
  | { mode: 'update'; values: Record<string, unknown> }
  | { mode: 'upsert'; values: Record<string, unknown> }

// When the owner has edited any structured field (edited_at set), refresh ONLY
// the read + flags and leave every structured field + the cached ai_raw_payload
// untouched — re-analysis must never clobber a human-reviewed value the vet will
// rely on (Pattern 7 / clinical-guardrails). Otherwise (first analysis, or an
// un-edited row) write the full payload. Pure + exported so the guarantee is
// unit-tested rather than asserted by a comment.
export function buildAnalysisWriteBack(params: {
  humanEdited: boolean
  eventId: string
  petId: string
  analysis: VomitAnalysis | null
  readFields: AnalysisReadFields
}): AnalysisWriteBack {
  if (params.humanEdited) {
    // ONLY the read columns. No structured field, no ai_raw_payload — that's the
    // never-clobber guarantee, by construction.
    return { mode: 'update', values: { ...params.readFields } }
  }
  const { analysis } = params
  return {
    mode: 'upsert',
    values: {
      event_id: params.eventId,
      pet_id: params.petId,
      incident_type: 'vomit',
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
      ...params.readFields,
    },
  }
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

// ── Vision call ────────────────────────────────────────────────────────────────

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
interface ImagePart { data: string; mediaType: ClaudeMediaType }

// Claude rejects a request whose declared media_type doesn't match the actual
// bytes. Photos are uploaded with a hardcoded .jpg name + image/jpeg
// content-type, but the underlying bytes can be WebP/PNG/etc (e.g. iOS image
// picker output). Sniff the magic bytes so we declare the real type.
export function detectImageMediaType(bytes: Uint8Array): ClaudeMediaType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50    // "WEBP"
  ) return 'image/webp'
  // Unknown (incl. HEIC, which Claude does not accept): default to jpeg. If it's
  // genuinely something Claude can't read, the API surfaces a clear 400.
  return 'image/jpeg'
}

// Chunked base64 encoder. Both prior encoders built the output one character at a
// time — btoa(Array.from(bytes,…).join('')) materialised one JS string per byte,
// and deno-std encodeBase64 concatenates per 3 bytes — so for a multi-MB image the
// output grew as a "rope" of millions of cons-string nodes (~250 MB for a 6.5 MB
// photo), blowing the isolate's 250 MB memory limit and returning a 546
// (WORKER_RESOURCE_LIMIT) that HARD-KILLS the worker before it can write a row.
// Encoding in fixed byte windows and letting native btoa do the work keeps peak
// memory roughly linear in the image size. Pure + exported so correctness is
// unit-tested (index.test.ts). Callers only ever pass a size-guarded (≤~3.93 MB)
// blob, so the window count is small and bounded.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000 // 32 KB — safe to spread into String.fromCharCode
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function blobToImagePart(blob: Blob): Promise<ImagePart> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mediaType = detectImageMediaType(bytes)
  return { data: bytesToBase64(bytes), mediaType }
}

async function runVisionCall(images: ImagePart[]): Promise<VomitAnalysis | null> {
  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
  }))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [ANALYZE_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: 'Analyse this photo of pet vomit.' }],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`)
  }
  return parseAnalysisToolResult(await res.json() as ClaudeResponse)
}

// ── Handler ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!body.event_id || typeof body.event_id !== 'string') {
    return Response.json({ error: 'event_id required' }, { status: 400, headers: CORS_HEADERS })
  }
  const eventId = body.event_id

  // User-scoped client: RLS enforces that the caller owns the event's pet.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  // Service-role client: storage download + trusted write-back.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Known once the event loads; needed to write a valid failure row (the
  // table requires pet_id + incident_type NOT NULL).
  let petIdForFailure: string | null = null

  try {
    // 1. Load the event (ownership-scoped) and confirm it is an active vomit event.
    const { data: event } = await userClient
      .from('events')
      .select('id, pet_id, event_type, occurred_at, deleted_at, pets(name, species)')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404, headers: CORS_HEADERS })
    }
    if (event.event_type !== 'vomit') {
      return Response.json({ error: 'Event is not a vomit event' }, { status: 400, headers: CORS_HEADERS })
    }

    const pet = (Array.isArray(event.pets) ? event.pets[0] : event.pets) as { name: string; species: string } | null
    const petName = pet?.name ?? 'your pet'
    const species = pet?.species ?? 'unknown'
    const petId = event.pet_id as string
    const occurredAt = event.occurred_at as string
    petIdForFailure = petId

    // 2. Photo(s) for this event (ordered). May be empty (logged without a photo).
    const { data: attachments } = await userClient
      .from('event_attachments')
      .select('storage_path')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })

    const photoPaths = (attachments ?? []).map((a) => a.storage_path as string)
    const hasPhoto = photoPaths.length > 0

    // 3. Vision call (only if there is a usable photo).
    let analysis: VomitAnalysis | null = null
    let photoUnreadable = false
    if (hasPhoto) {
      const blobs = await Promise.all(
        photoPaths.slice(0, 3).map(async (path) => {
          const { data, error } = await adminClient.storage.from('nyx-event-attachments').download(path)
          if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`)
          return data
        }),
      )
      // Guard on the RAW byte size BEFORE encoding. Claude rejects an inline image
      // whose base64 exceeds 5 MB (~3.93 MB raw), and — critically — base64-encoding
      // a multi-MB image is what OOM'd the worker (546) and hard-killed it before
      // the old post-encode filter could drop the image. Filtering the blobs here
      // means an oversized photo is never encoded. (Rare now that the client
      // compresses on every upload path; this is the backstop.)
      const usableBlobs = blobs.filter((b) => b.size > 0 && b.size <= MAX_CLAUDE_IMAGE_BYTES)
      if (usableBlobs.length === 0) {
        photoUnreadable = true // no photo within Claude's size limit (or all empty)
      } else {
        const imageParts = await Promise.all(usableBlobs.map(blobToImagePart))
        try {
          analysis = await runVisionCall(imageParts)
          if (!analysis) throw new Error('Vision model did not return an analysis')
        } catch (visionErr) {
          const msg = visionErr instanceof Error ? visionErr.message : String(visionErr)
          // A Claude 400 means the image itself is unusable — undecodable format
          // (e.g. HEIC, which Claude can't read), corrupt, or a partial upload.
          // Degrade gracefully to the contextual floor with an honest "couldn't
          // read the photo" read rather than 500. Re-throw anything else
          // (transient Claude/network errors) so it's a real, retryable failure.
          if (msg.includes('Claude API error 400')) {
            console.warn('analyze-vomit: image unreadable, degrading:', msg)
            photoUnreadable = true
          } else {
            throw visionErr
          }
        }
      }
    }

    // 4. Deterministic contextual flags + escalation floor.
    const context = await assembleContext(userClient, petId, occurredAt, species)
    const contextualFlags = computeContextualFlags(context)
    const visualFlags = analysis?.visual_flags ?? []
    const recommendation = applyEscalationFloor({
      modelRecommendation: analysis?.recommendation ?? 'not_enough_to_say',
      appearsToShowVomit: analysis?.appears_to_show_vomit ?? false,
      hasPhoto,
      visualFlags,
      contextualFlags,
    })

    // 5. Read text — the load-bearing never-reassure selection (B-060), pure + tested.
    // The model's free text reaches the owner ONLY on the worth_a_call (visual-flag)
    // escalation path; the monitor / no-flag path is a deterministic template, so a
    // single sample can never assert an all-clear (the n=1 invariant, made structural
    // after a denylist proved too leaky to be the net — adversarial review 2026-06-24).
    const readText = selectReadText({
      petName,
      recommendation,
      contextualFlags,
      visualFlags,
      modelReadText: analysis?.read_text ?? null,
      photoUnreadable,
      hasPhoto,
    })

    const status = recommendation === 'not_enough_to_say' ? 'uncertain' : 'completed'

    // 6. Write-back, never clobbering a human-edited row. If the owner has
    // edited any structured field (edited_at set), preserve all editable facts
    // and the cached original; only refresh the (non-editable) read + flags so
    // the deterministic floor can still escalate on worsening context.
    const { data: existing } = await adminClient
      .from('event_ai_analysis')
      .select('id, edited_at')
      .eq('event_id', eventId)
      .maybeSingle()

    const humanEdited = !!existing?.edited_at

    const readFields: AnalysisReadFields = {
      recommendation,
      read_text: readText,
      visual_flags: visualFlags,
      contextual_flags: contextualFlags,
      status,
      error: null,
    }

    const writeBack = buildAnalysisWriteBack({ humanEdited, eventId, petId, analysis, readFields })

    let writeError
    if (writeBack.mode === 'update') {
      ;({ error: writeError } = await adminClient
        .from('event_ai_analysis')
        .update(writeBack.values)
        .eq('event_id', eventId))
    } else {
      ;({ error: writeError } = await adminClient
        .from('event_ai_analysis')
        .upsert(writeBack.values, { onConflict: 'event_id' }))
    }

    if (writeError) throw new Error(`DB write failed: ${writeError.message}`)

    return Response.json(
      { success: true, recommendation, contextual_flags: contextualFlags, visual_flags: visualFlags },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('analyze-vomit error:', message)

    // Best-effort failure write so the detail screen can surface a retry CTA.
    // Only possible once we know pet_id (the table requires it NOT NULL); if we
    // failed before loading the event we have nothing valid to write.
    if (petIdForFailure) {
      await adminClient
        .from('event_ai_analysis')
        .upsert(
          { event_id: eventId, pet_id: petIdForFailure, incident_type: 'vomit', status: 'failed', error: message },
          { onConflict: 'event_id' },
        )
        .then(() => undefined)
    }

    return Response.json(
      { error: 'Analysis failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
