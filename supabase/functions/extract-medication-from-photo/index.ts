// Supabase Edge Function — extract-medication-from-photo
// Called by app/medication-capture.tsx immediately after a drug-label photo is
// uploaded to the private, per-user nyx-medication-photos bucket. Downloads the
// label, calls Claude Sonnet 4.6 vision with tool use for structured output, and
// RETURNS the drug-product fields to the caller. (B-117 PR 5, spec
// docs/nyx-medication-logging-requirements.md §5.2 / §6.)
//
// This function is intentionally STATELESS — it reads one of the caller's own
// label photos and returns the extraction. It writes NOTHING to the database.
// The client owns persistence: the owner reviews the extraction on the confirm
// screen and only then does the commit write the medication_items catalog row.
// That single decision is what makes the three guardrails below hold cleanly:
//
//  • B-123 — confused-deputy / IDOR defense. The request body carries ONLY a
//    medication_item_id; it NEVER carries a storage path. The label path is
//    BUILT SERVER-SIDE from the authed caller's uid (auth.getUser()), so every
//    read is pinned under {callerUid}/… — a hostile caller cannot forge the uid
//    segment to reach another owner's label, and the path-segment guards reject a
//    '/' or '..' smuggled through the item id. Because the function writes nothing
//    user-readable, there is no cross-user WRITE surface to defend at all (the old
//    service-role write-back + ownership gate are gone with it).
//
//  • B-122 — no owner/pet/clinic PII in the globally-readable catalog. The
//    extraction must capture ONLY drug-product identity. The tool schema has NO
//    free-text/notes/directions field that could absorb the pet's name, the
//    owner's name, the prescribing clinic, an address, or an Rx number, and the
//    system prompt forbids transcribing any of them. The owner's confirm screen is
//    a second, human, in-the-loop check before anything reaches the shared catalog.
//
//  • Clinical safety (§6.5) — never silently trust an AI-extracted dose. Strength
//    is copied EXACTLY as printed or returned null (never inferred/rounded); the
//    confirm screen (client) then BLOCKS save until the owner verifies it against
//    the retained label photo. This function is layer one (prompt + null-not-guess
//    + per-field confidence); the client confirm gate is layer two. No AI value
//    reaches the catalog without passing that gate.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The private per-user bucket (migration 021). The label slot the client uploads
// to via lib/storage.ts buildMedicationPhotoPath(userId, itemId, '0-label').
const MEDICATION_PHOTOS_BUCKET = 'nyx-medication-photos'
const LABEL_SLOT = '0-label'

// Claude rejects a single image whose base64 payload exceeds 5 MB. Client uploads
// are compressed to ≤1600px/q75, but guard the same way analyze-vomit does.
const MAX_CLAUDE_IMAGE_BASE64 = 5_242_880

// ── Enum vocabularies (MUST match migration 020 medication_form / route) ──────
// The tool advertises the exact DB enum members, so there is no AI→DB mapping
// step (unlike food's short names) and thus no drift class to guard. A value
// outside these sets is dropped to null on parse rather than tripping the
// Postgres enum on write.
export const MEDICATION_FORM_ENUM = [
  'tablet', 'capsule', 'liquid', 'chewable', 'transdermal',
  'injection', 'drops', 'ointment', 'powder', 'other',
] as const

export const MEDICATION_ROUTE_ENUM = [
  'oral', 'topical', 'otic', 'ophthalmic', 'injectable', 'inhaled', 'rectal', 'other',
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  // The ONLY input. There is deliberately no photo_paths field — accepting a
  // caller-supplied path is the B-123 vulnerability this function is built to
  // avoid. The path is derived from the authed uid below.
  medication_item_id: string
}

export interface MedicationConfidence {
  generic_name: number
  brand_name: number
  strength: number
  form: number
  route: number
  is_prescription: number
}

export interface MedicationExtraction {
  generic_name: string
  brand_name: string | null
  strength: string | null
  form: string | null
  route: string | null
  is_prescription: boolean | null
  confidence: MedicationConfidence
}

interface MedicationToolInput {
  generic_name?: string
  brand_name?: string
  strength?: string
  form?: string
  route?: string
  is_prescription?: boolean
  confidence?: Partial<MedicationConfidence>
}

interface ClaudeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: MedicationToolInput }
  >
  stop_reason: string
}

// ── Extraction tool schema ────────────────────────────────────────────────────
// Tool use forces structured JSON. CRITICAL (B-122): the property set is exactly
// the drug-PRODUCT identity. There is intentionally NO notes / directions /
// raw_text / sig field — those are where a pet's name, the owner's name, or the
// clinic would leak into the globally-readable catalog. Do not add one here; the
// "directions" string (which is regimen data and routinely names the patient)
// belongs to the PR 7 regimen, entered by the owner, never scraped into the
// shared library. (index.test.ts locks the property set against this drift.)
export const EXTRACTION_TOOL = {
  name: 'extract_medication_data',
  description:
    'Extract structured DRUG-PRODUCT identity from one photo of a medication label or package. ' +
    'Return null for any field that is not clearly legible. Never transcribe patient, owner, or clinic information.',
  input_schema: {
    type: 'object',
    properties: {
      generic_name: {
        type: 'string',
        description:
          'The drug / active-ingredient name as printed (e.g. "prednisolone", "gabapentin", "maropitant"). ' +
          'If only a brand name is visible, put the brand here too — the picker needs a non-empty name to show.',
      },
      brand_name: {
        type: 'string',
        description: 'Brand / trade name if printed and distinct from the generic (e.g. "Apoquel", "Cerenia"). Null if not shown.',
      },
      strength: {
        type: 'string',
        description:
          'Drug strength/concentration EXACTLY as printed, with units (e.g. "5 mg", "0.5 mg", "16 mg/mL", "50 mg/tablet"). ' +
          'This is safety-critical: copy it character-for-character. Do NOT infer, round, convert, or guess. ' +
          'If the strength is not clearly legible, return null and set its confidence low — a missing strength is safe; a wrong one is not.',
      },
      form: {
        type: 'string',
        enum: MEDICATION_FORM_ENUM as unknown as string[],
        description: 'Physical form of the medication if evident from the label/packaging.',
      },
      route: {
        type: 'string',
        enum: MEDICATION_ROUTE_ENUM as unknown as string[],
        description: 'Route of administration if stated (e.g. "oral" for tablets/capsules, "otic" for ear drops, "ophthalmic" for eye drops).',
      },
      is_prescription: {
        type: 'boolean',
        description: 'True if the label indicates a prescription / veterinary-only product (e.g. "Rx only", "Caution: Federal law restricts..."). False if clearly OTC. Null if unclear.',
      },
      confidence: {
        type: 'object',
        description: 'Per-field legibility confidence from 0.0 (not visible / guessed) to 1.0 (clearly legible). Be honest and conservative about strength.',
        properties: {
          generic_name:    { type: 'number', minimum: 0, maximum: 1 },
          brand_name:      { type: 'number', minimum: 0, maximum: 1 },
          strength:        { type: 'number', minimum: 0, maximum: 1 },
          form:            { type: 'number', minimum: 0, maximum: 1 },
          route:           { type: 'number', minimum: 0, maximum: 1 },
          is_prescription: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['generic_name', 'brand_name', 'strength', 'form', 'route', 'is_prescription'],
      },
    },
    required: ['generic_name', 'confidence'],
  },
}

export const SYSTEM_PROMPT =
  'You are a veterinary medication-label data extraction assistant. You are given ONE photo of a pet medication ' +
  'label, bottle, box, or blister pack. Extract structured DRUG-PRODUCT data exactly as printed. Hard rules: ' +
  '(1) PRIVACY — never transcribe or extract the pet\'s name, the owner\'s/client\'s name, the prescribing ' +
  'veterinarian or clinic name, any address or phone number, the prescription/Rx number, or any dates. These ' +
  'appear on dispensed labels and must be ignored entirely. Extract ONLY the medication product itself. ' +
  '(2) STRENGTH IS SAFETY-CRITICAL — copy the strength/concentration character-for-character as printed, with its ' +
  'units. Never infer, round, convert, or guess a strength. Misreading "0.5 mg" as "5 mg" is a dosing hazard. If ' +
  'the strength is not clearly legible, return null and set strength confidence low. A missing strength is safe; a ' +
  'wrong one is dangerous. ' +
  '(3) For any field not clearly legible, return null — never hallucinate. Confidence scores reflect legibility. ' +
  '(4) You are extracting data, not giving advice. Never add dosing instructions, diagnoses, or recommendations. ' +
  'Call the extract_medication_data tool with your findings.'

// ── Pure helpers (exported for unit tests — see index.test.ts) ────────────────

function sanitizeEnum(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

function clamp01(v: number | undefined): number {
  return Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0))
}

// Ensures every confidence field is present and clamped to [0, 1].
export function normaliseConfidence(raw: Partial<MedicationConfidence> = {}): MedicationConfidence {
  return {
    generic_name:    clamp01(raw.generic_name),
    brand_name:      clamp01(raw.brand_name),
    strength:        clamp01(raw.strength),
    form:            clamp01(raw.form),
    route:           clamp01(raw.route),
    is_prescription: clamp01(raw.is_prescription),
  }
}

// Normalises the tool_use block into a MedicationExtraction. Hallucinated enum
// values drop to null (never trip the DB enum on write); a missing strength is
// preserved as null and NEVER coerced to an empty-but-present value — the
// "never fabricate a dose" invariant lives here, not just in the prompt.
export function parseMedicationToolResult(response: ClaudeResponse): MedicationExtraction | null {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === 'extract_medication_data')
  if (!block || block.type !== 'tool_use') return null
  const input = block.input as MedicationToolInput

  // A strength that came back as anything other than a real, non-empty string is
  // a non-value — keep it null so the client confirm screen treats it as
  // "nothing to trust" rather than a confirmed blank dose.
  const strength = typeof input.strength === 'string' && input.strength.trim().length > 0
    ? input.strength.trim()
    : null

  return {
    generic_name: typeof input.generic_name === 'string' ? input.generic_name.trim() : '',
    brand_name:   typeof input.brand_name === 'string' && input.brand_name.trim().length > 0 ? input.brand_name.trim() : null,
    strength,
    form:  sanitizeEnum(input.form, MEDICATION_FORM_ENUM),
    route: sanitizeEnum(input.route, MEDICATION_ROUTE_ENUM),
    is_prescription: typeof input.is_prescription === 'boolean' ? input.is_prescription : null,
    confidence: normaliseConfidence(input.confidence ?? {}),
  }
}

// B-123 — the SERVER-SIDE label-path builder. Mirrors lib/storage.ts
// buildMedicationPhotoPath, replicated here because a Deno Edge Function cannot
// import the React-Native client module. The leading {userId} segment is the
// security boundary (RLS predicate (storage.foldername(name))[1] = auth.uid()),
// and userId here is the VERIFIED caller uid from auth.getUser() — never a body
// value. The segment guards reject a '/' or '..' that could break a hostile
// item-id out of its slot (the ids are server UUIDs today, but the guard keeps
// the one chokepoint honest). Exported for the path-injection unit test.
export function buildLabelPath(userId: string, medicationItemId: string, slot: string = LABEL_SLOT): string {
  if (!userId?.trim()) throw new Error('buildLabelPath: userId is required (RLS prefix)')
  if (!medicationItemId?.trim()) throw new Error('buildLabelPath: medicationItemId is required')
  for (const seg of [userId, medicationItemId, slot]) {
    if (seg.includes('/') || seg.includes('\\') || seg.includes('..')) {
      throw new Error(`buildLabelPath: illegal path segment ${JSON.stringify(seg)}`)
    }
  }
  return `${userId}/${medicationItemId}/${slot}.jpg`
}

// ── Vision call ────────────────────────────────────────────────────────────────

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
interface ImagePart { data: string; mediaType: ClaudeMediaType }

// Claude rejects a request whose declared media_type doesn't match the bytes.
// Photos upload as .jpg/image-jpeg but the bytes can be WebP/PNG (iOS picker),
// so sniff the magic bytes. (Lifted from analyze-vomit.)
export function detectImageMediaType(bytes: Uint8Array): ClaudeMediaType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return 'image/jpeg'
}

async function blobToImagePart(blob: Blob): Promise<ImagePart> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { data: encodeBase64(bytes), mediaType: detectImageMediaType(bytes) }
}

async function runVisionCall(image: ImagePart): Promise<MedicationExtraction | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // Sonnet 4.6: extraction accuracy is load-bearing (the confirm-screen UX
      // and Dr. Chen's trust in the data), so cheapest-capable does NOT win here
      // — same call as extract-food-from-photo. (Spec §5.2; CLAUDE.md food-vision
      // resolution.)
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: 'Extract the medication product data from this label photo.' },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`)
  }
  return parseMedicationToolResult(await res.json() as ClaudeResponse)
}

// ── Cap + flag gate (Monetization Track 2, T2-3 / B-329 + B-001) ──────────────
// docs/monetization-and-throttling-requirements.md §4–§5. Per-function COPY of the
// shared-shape gate logic (S6: no _shared/ module; copy-paste per function like
// detectImageMediaType — consolidation is a future refactor). Identical shape
// across all four AI functions. Pure pieces are exported + Deno-tested.

// Med free caps (§4.4): daily 10 / monthly 40. Overridable via app_config.ai_caps.
const CAPS: FunctionCaps = { daily: 10, monthly: 40 }
const FUNCTION_KEY = 'extract_medication'
const FLAG_KEY = 'ai_med_extraction_enabled'

export interface FunctionCaps { daily: number; monthly: number }

export type GateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }

// The pure gate decision. `flagEnabled` is the resolved app_config flag (the
// reader fails OPEN on a config read error — §4.2). `counts` are the
// POST-INCREMENT day/month counters from record_ai_usage; pass null ONLY when the
// flag is off (the caller skips the increment then — §5.1). Over-cap is
// strictly-greater because record_ai_usage increments-then-returns: the cap-th
// call returns count === cap and proceeds; the (cap+1)-th returns cap+1 and is
// blocked — exactly `caps.daily` model calls land per UTC day.
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

// Increment + read the caller's usage counters (§4.3). Null on RPC error →
// treated as under-cap (fail-open). uid derived inside the RPC (B-252).
async function recordUsage(
  client: SupabaseClient,
): Promise<{ dayCount: number; monthCount: number } | null> {
  const { data, error } = await client.rpc('record_ai_usage', { p_function: FUNCTION_KEY, p_scope_id: null })
  if (error) {
    console.warn(`record_ai_usage(${FUNCTION_KEY}) failed — proceeding under cap:`, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { day_count?: number; month_count?: number } | null
  if (!row || typeof row.day_count !== 'number' || typeof row.month_count !== 'number') return null
  return { dayCount: row.day_count, monthCount: row.month_count }
}

function capReachedResponse(cap: 'daily' | 'monthly'): Response {
  return Response.json(
    { cap_reached: true, cap, function: FUNCTION_KEY, resets_at: computeResetsAt(cap, Date.now()) },
    { headers: CORS_HEADERS },
  )
}
function featureDisabledResponse(): Response {
  return Response.json({ feature_disabled: true, function: FUNCTION_KEY }, { headers: CORS_HEADERS })
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
  const medicationItemId = body.medication_item_id
  if (!medicationItemId || typeof medicationItemId !== 'string') {
    return Response.json({ error: 'medication_item_id required' }, { status: 400, headers: CORS_HEADERS })
  }

  // User-scoped client: carries the caller's JWT. Used ONLY to resolve + verify
  // the caller uid (auth.getUser) — the uid is the B-123 boundary that pins the
  // label path below.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  // Service-role client: storage download only (the proven extract-food /
  // analyze-vomit pattern). It is ONLY ever pointed at a uid-derived path, so it
  // can never become a confused deputy for another owner's label. It writes
  // nothing — this function is read-only.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1. Resolve + verify the caller uid from the JWT (never trusted from the body).
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    // 1b. Flag → cap → Anthropic call (§5.2). Stateless function: on flag-off /
    //     cap the client routes to manual entry with the label photo still saved
    //     (its own designed state, T2-4), exactly like today's failure path but
    //     rendered as a calm state rather than an error. No DB write on either.
    const { flagEnabled, caps } = await readGateConfig(userClient)
    if (!flagEnabled) return featureDisabledResponse()
    const counts = await recordUsage(userClient)
    const gate = resolveGateState(flagEnabled, counts, caps)
    if (!gate.allow && gate.reason === 'cap_reached') return capReachedResponse(gate.cap)

    // 2. Build the label path SERVER-SIDE from the verified caller uid. The body
    //    never supplies a path; a hostile caller cannot read another owner's label
    //    because they cannot forge this uid segment, and the path-segment guards
    //    reject a '/' or '..' smuggled through the item id.
    const labelPath = buildLabelPath(user.id, medicationItemId)

    // 3. Download the label and run the vision call. No DB row is read or written
    //    — the extraction is returned to the caller, who persists it (post-confirm)
    //    on commit.
    const { data: blob, error: dlErr } = await adminClient.storage
      .from(MEDICATION_PHOTOS_BUCKET)
      .download(labelPath)
    if (dlErr || !blob) {
      throw new Error(`Storage download failed for ${labelPath}: ${dlErr?.message ?? 'no data'}`)
    }

    const imagePart = await blobToImagePart(blob)
    if (imagePart.data.length > MAX_CLAUDE_IMAGE_BASE64) {
      throw new Error('Label image too large to analyse')
    }

    const extraction = await runVisionCall(imagePart)
    // generic_name is the picker's display key and is NOT NULL on the catalog —
    // an empty name is a failed read, surfaced to the client's manual fallback.
    if (!extraction || !extraction.generic_name) {
      throw new Error('Claude did not return a usable medication name')
    }

    return Response.json({ success: true, extraction }, { headers: CORS_HEADERS })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('extract-medication-from-photo error:', message)
    // No DB write on failure: there is no row yet (the client only creates the
    // catalog row on commit), so the client surfaces the manual-entry fallback
    // off this 500 and the owner types the label in by hand.
    return Response.json(
      { error: 'Extraction failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
