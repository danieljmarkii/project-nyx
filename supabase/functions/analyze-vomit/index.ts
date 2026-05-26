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
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

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
// photos (uploaded before client-side compression existed) can exceed it; we
// skip those rather than 500.
const MAX_CLAUDE_IMAGE_BASE64 = 5_242_880

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
          'One or two sentences, owner-facing, matching the recommendation. For worth_a_call, name the visible concern plainly and suggest a vet call, calmly. ' +
          'For monitor, be honest and forward-looking but DO NOT reassure (never say the pet is fine/okay/healthy). No diagnosis, no treatment, no exclamation marks.',
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
  '(3) You NEVER reassure based on the absence of a visible problem. A normal-looking photo does not mean the pet is well. ' +
  "If nothing concerning is visible, say only that this one doesn't show anything obviously concerning on its own, and keep the read forward-looking. " +
  'Never say or imply the pet is "fine", "okay", or "healthy". ' +
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

async function blobToImagePart(blob: Blob): Promise<ImagePart> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mediaType = detectImageMediaType(bytes)
  // Encode straight from the byte array. The old btoa(Array.from(bytes,…).join(''))
  // materialised one JS string per byte — for a multi-MB uncompressed phone photo
  // that's hundreds of MB of intermediate strings, tripping the Edge Function
  // memory limit. encodeBase64 operates on the Uint8Array directly.
  const data = encodeBase64(bytes)
  return { data, mediaType }
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
      const imageParts = await Promise.all(blobs.map(blobToImagePart))
      // Drop any image over Claude's 5 MB cap.
      const usableImages = imageParts.filter((p) => p.data.length <= MAX_CLAUDE_IMAGE_BASE64)
      if (usableImages.length === 0) {
        photoUnreadable = true // all oversized
      } else {
        try {
          analysis = await runVisionCall(usableImages)
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

    // 5. Read text: contextual reason overrides a photo-only read when the floor
    // escalated on context; otherwise keep the model's read (or a templated
    // not_enough_to_say for the no-photo case).
    let readText: string | null
    if (contextualFlags.length > 0) {
      readText = buildContextualReadText(petName, contextualFlags)
    } else if (analysis?.read_text) {
      readText = analysis.read_text
    } else if (photoUnreadable) {
      readText = `I couldn't read this photo — it may be too large or in a format I can't open. Try replacing it with a fresh shot and I'll take another look. If you're worried about ${petName}, your vet is the best call.`
    } else {
      readText = buildNoFlagReadText(petName, hasPhoto)
    }

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

    const readFields = {
      recommendation,
      read_text: readText,
      visual_flags: visualFlags,
      contextual_flags: contextualFlags,
      status,
      error: null,
    }

    let writeError
    if (humanEdited) {
      ;({ error: writeError } = await adminClient
        .from('event_ai_analysis')
        .update(readFields)
        .eq('event_id', eventId))
    } else {
      const fullPayload = {
        event_id: eventId,
        pet_id: petId,
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
        ...readFields,
      }
      ;({ error: writeError } = await adminClient
        .from('event_ai_analysis')
        .upsert(fullPayload, { onConflict: 'event_id' }))
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
