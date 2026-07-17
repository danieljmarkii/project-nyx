// Shared descriptor-driven pipeline for per-incident AI analysis (B-247 PR 2, D2).
//
// ONE pipeline — runIncidentAnalysis(descriptor, req) — owns every stage the
// per-incident reads share: auth → confused-deputy guard (RLS-scoped event
// load) → cap/flag gate → contextual-flag SQL → image fetch/downscale →
// vision call → escalation floor → never-clobber write-back → response. Each
// incident type (analyze-vomit today, analyze-stool next) supplies a small
// DESCRIPTOR: its tool schema + system prompt, its tool-result normaliser, its
// contextual-flag computation, its floor predicate, its owner-facing copy, its
// structured write-back columns, and its Track-2 gate keys. A new incident
// type = a descriptor + a schema migration + one monetization config row — no
// handler copy (docs/nyx-stool-analysis-requirements.md §2 D2).
//
// Safety split (clinical-guardrails skill; non-negotiable per D2): the
// FRAMEWORK owns the escalation MECHANISM —
//   - the Recommendation enum has no reassuring value (Pattern 1);
//   - contextual flags force worth_a_call and the model can only escalate,
//     never downgrade (Pattern 2 — applyIncidentEscalationFloor);
//   - the model's free text reaches the owner ONLY on the visual-escalation
//     path; the monitor / no-flag path is always a deterministic template
//     (B-060 — selectIncidentReadText owns the ORDER, descriptors only the
//     template text);
//   - re-analysis never clobbers a human-edited row (Pattern 7 —
//     buildIncidentWriteBack);
//   - unreadable input degrades honestly, never 500s, never reassures, and
//     still runs the contextual floor (Pattern 5).
// Each DESCRIPTOR supplies its own floor RULES (which visual findings force
// escalation — stool's D5 ≠ vomit's) and its own copy. Every new descriptor
// still gets its own mandatory adversarial-reviewer pass + Pattern-8
// reassurance-regex tests — that DoD line is NOT inherited from vomit's review.
//
// No runtime coupling: scripts/deploy-edge.sh esbuild-inlines this module into
// each function's self-contained bundle, so functions still deploy
// independently (the bundle gate hard-fails if a relative import escapes).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Image limits (incident-agnostic) ──────────────────────────────────────────

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

// Oversized photos are re-fetched through Supabase Storage image transformations
// (imgproxy — resizes server-side, so zero isolate memory and no base64 of the
// original) scaled to fit this longest edge. 1568px is the size Claude downsamples
// to internally, so this costs no clinical detail vs. what the model would see
// anyway. Requires the Pro plan's transformation add-on; if it's unavailable or
// errors, we degrade to photoUnreadable (never crash, never reassure).
const DOWNSCALE_EDGE_PX = 1568

// Every incident photo rides the same event-attachment pipeline and bucket.
const EVENT_ATTACHMENTS_BUCKET = 'nyx-event-attachments'

// Per-incident extraction is clinically load-bearing for both the owner-facing
// read and the vet report, so it stays on Sonnet across incident types (D4;
// B-001 reserves Haiku for non-load-bearing phrasing only).
const VISION_MODEL = 'claude-sonnet-4-6'
const VISION_MAX_TOKENS = 1024
// At most this many photos of one event are sent to the model.
const MAX_PHOTOS_PER_ANALYSIS = 3

// ── Recommendation enum (Pattern 1 — framework-owned) ─────────────────────────
// The recommendation vocabulary deliberately contains NO value that asserts
// wellness. Adding one is a clinical regression — flag to the PM, do not merge.

export const RECOMMENDATIONS = ['worth_a_call', 'monitor', 'not_enough_to_say'] as const
export type Recommendation = typeof RECOMMENDATIONS[number]

// ── Claude response shape ──────────────────────────────────────────────────────

export interface ClaudeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  stop_reason: string
}

export interface VisionTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// ── Descriptor contract ────────────────────────────────────────────────────────

// The fields every normalised analysis shares (they map 1:1 onto the
// incident-agnostic columns of event_ai_analysis). Per-type structured fields
// live on the concrete analysis type and reach the DB only through the
// descriptor's structuredColumns().
export interface IncidentAnalysisBase {
  visual_flags: string[]
  recommendation: Recommendation
  read_text: string | null
  confidence: Record<string, number> | null
}

// Per-type owner-facing copy. The selection ORDER over these templates is
// framework-owned (selectIncidentReadText, B-060); descriptors supply only the
// text. Every template a descriptor supplies must be covered by its own
// Pattern-8 reassurance-regex test.
export interface IncidentReadTemplates {
  // Floor escalated on CONTEXT — names the contextual reason; highest acuity wins.
  contextual(petName: string, flags: string[]): string
  // Photo present but unreadable — honest about the failure, routes to the vet.
  photoUnreadable(petName: string): string
  // Escalation on a visual flag when the model wrote no read of its own.
  visualEscalationFallback(petName: string, visualFlags: string[]): string
  // Clear photo, no flags — forward-looking, never comments on absence.
  monitor(petName: string): string
  // Unclear photo / not the incident / no photo at all.
  noFlag(petName: string, hasPhoto: boolean): string
}

export interface IncidentDescriptor<TAnalysis extends IncidentAnalysisBase> {
  // Function name, e.g. 'analyze-vomit' — used verbatim in log prefixes.
  functionName: string
  // events.event_type values this analysis accepts. The row's incident_type is
  // the event's own event_type (migration 013 parameterizes the table by it).
  eventTypes: readonly string[]
  // 400 body when the event exists but is not one of eventTypes.
  wrongTypeError: string
  // Track-2 cap/flag gate keys (docs/monetization-and-throttling-requirements.md §4–§5).
  functionKey: string
  flagKey: string
  caps: FunctionCaps
  // Vision call: per-type prompt + single forced tool + user message.
  systemPrompt: string
  tool: VisionTool
  userMessageText: string
  // Normalise the model's tool_use block. Enum-sanitised — hallucinated values
  // drop to null rather than tripping the DB enum on write. Null when the
  // response carries no matching tool_use block.
  parseToolResult(response: ClaudeResponse): TAnalysis | null
  // Whether the model believes the photo shows this incident type at all.
  appearsToShowIncident(analysis: TAnalysis): boolean
  // Per-type floor RULE: do this analysis's visual findings force worth_a_call?
  // (Vomit: any visual flag. Stool D5: blood/foreign yes; mucus alone is
  // monitor-tier — it surfaces but does not escalate.) The MECHANISM — context
  // forces worth_a_call, the model can never downgrade — is framework-owned.
  escalatesOnVisual(analysis: TAnalysis): boolean
  // Deterministic, server-computed contextual flags (Pattern 3) — SQL over
  // events/meals via the caller-scoped client. The vision model never sees
  // multi-sample context; these compute BEFORE (and independently of) the
  // model call, so they survive the cap and photo-less logs.
  computeContextualFlags(
    userClient: SupabaseClient,
    event: { petId: string; occurredAt: string; species: string },
  ): Promise<string[]>
  // Per-type owner-facing copy (see IncidentReadTemplates).
  readTemplates: IncidentReadTemplates
  // Per-type structured columns for the write-back. MUST map a null analysis
  // (no/failed vision) to all-null columns — never stale or fabricated values.
  structuredColumns(analysis: TAnalysis | null): Record<string, unknown>
}

// ── Pure helpers: tool-result plumbing ─────────────────────────────────────────

export function sanitizeEnum(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

export function sanitizeEnumArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && allowed.includes(v))
}

// First tool_use block matching the descriptor's tool, or null.
export function findToolUseInput(response: ClaudeResponse, toolName: string): Record<string, unknown> | null {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
  if (!block || block.type !== 'tool_use') return null
  return block.input
}

// ── Escalation floor (Pattern 2 — the framework-owned mechanism) ───────────────
// Contextual flags and a per-type visual escalation both force worth_a_call;
// no-photo / not-the-incident collapses to not_enough_to_say; otherwise the
// model may raise to worth_a_call but never lower below monitor. There is
// intentionally no path to a reassuring verdict.

export function applyIncidentEscalationFloor(params: {
  modelRecommendation: Recommendation
  appearsToShowIncident: boolean
  hasPhoto: boolean
  visualEscalation: boolean
  contextualFlags: string[]
}): Recommendation {
  if (params.contextualFlags.length > 0) return 'worth_a_call'
  if (params.visualEscalation) return 'worth_a_call'
  if (!params.hasPhoto) return 'not_enough_to_say'
  if (!params.appearsToShowIncident) return 'not_enough_to_say'
  if (params.modelRecommendation === 'worth_a_call') return 'worth_a_call'
  return 'monitor'
}

// ── Read-text selection (B-060 — the framework-owned ORDER) ────────────────────
// The n=1 read never reassures on the ABSENCE of a red flag. The guarantee is
// STRUCTURAL, not lexical: the model's free text reaches the owner ONLY when
// the recommendation escalates on a visual flag it raised (there the read
// NAMES a present concern — the safe "escalate on presence" direction). On the
// monitor / no-flag path — the reassurance-on-absence risk — the read is a
// deterministic template, never the model's words. (A regex denylist was tried
// and rejected: it can't enumerate the open vocabulary of "the model asserted
// wellness" — it missed ~86% of plausible phrasings while nuking legitimate
// concern reads; adversarial review 2026-06-24.)

export function selectIncidentReadText(
  params: {
    petName: string
    recommendation: Recommendation
    contextualFlags: string[]
    visualFlags: string[]
    modelReadText: string | null
    photoUnreadable: boolean
    hasPhoto: boolean
  },
  templates: IncidentReadTemplates,
): string {
  const { petName, recommendation, contextualFlags, visualFlags, modelReadText, photoUnreadable, hasPhoto } = params
  // 1. Floor escalated on CONTEXT — the model's photo-only read may contradict it.
  if (contextualFlags.length > 0) return templates.contextual(petName, contextualFlags)
  // 2. Unreadable photo — honest failure, never reassures.
  if (photoUnreadable) return templates.photoUnreadable(petName)
  // 3. Escalation on a VISUAL flag — the ONLY path that surfaces the model's free text
  //    (it names a present red flag; "escalate on presence" is the safe direction).
  if (recommendation === 'worth_a_call') return modelReadText ?? templates.visualEscalationFallback(petName, visualFlags)
  // 4. monitor — a clear photo, no flag. NEVER the model's read (the reassurance-on-
  //    absence risk); a deterministic forward-looking template instead.
  if (recommendation === 'monitor') return templates.monitor(petName)
  // 5. not_enough_to_say — unclear photo, not the incident, or no photo.
  return templates.noFlag(petName, hasPhoto)
}

// ── Write-back decision: the server half of the never-clobber guard (B-028) ────
// The n=1 read + flags always refresh (so the deterministic floor can re-escalate
// on worsening context); the structured CLINICAL fields are the owner's once
// edited and must survive a re-analysis untouched (Pattern 7).

export interface AnalysisReadFields {
  recommendation: Recommendation
  read_text: string | null
  visual_flags: string[]
  contextual_flags: string[]
  status: string
  error: null
}

export type AnalysisWriteBack =
  | { mode: 'update'; values: Record<string, unknown> }
  | { mode: 'upsert'; values: Record<string, unknown> }

// When the owner has edited any structured field (edited_at set), refresh ONLY
// the read + flags and leave every structured field + the cached ai_raw_payload
// untouched — re-analysis must never clobber a human-reviewed value the vet will
// rely on. Otherwise (first analysis, or an un-edited row) write the full
// payload. Pure + exported so the guarantee is unit-tested rather than asserted
// by a comment.
export function buildIncidentWriteBack(params: {
  humanEdited: boolean
  eventId: string
  petId: string
  incidentType: string
  // Cached as ai_raw_payload — the descriptor's normalised analysis, or null
  // when no model ran (photo-less, unreadable, capped).
  analysisPayload: unknown
  confidence: Record<string, number> | null
  structuredValues: Record<string, unknown>
  readFields: AnalysisReadFields
}): AnalysisWriteBack {
  if (params.humanEdited) {
    // ONLY the read columns. No structured field, no ai_raw_payload — that's the
    // never-clobber guarantee, by construction.
    return { mode: 'update', values: { ...params.readFields } }
  }
  return {
    mode: 'upsert',
    values: {
      event_id: params.eventId,
      pet_id: params.petId,
      incident_type: params.incidentType,
      ai_raw_payload: params.analysisPayload,
      ai_confidence: params.confidence,
      ...params.structuredValues,
      ...params.readFields,
    },
  }
}

// ── Cap + flag gate (Monetization Track 2, T2-3 / B-329 + B-001) ──────────────
// docs/monetization-and-throttling-requirements.md §4–§5. Incident-analysis
// functions are ROW-BASED (§4.5): flag-off / cap write a STATE into
// event_ai_analysis.status ('read_disabled' / 'capped'), not an HTTP typed body
// — so this carries the pure gate decision + config/usage readers, but not the
// HTTP response builders. (This module retires the per-function copy for the
// incident-analysis family; extract-food/extract-medication still carry their
// own copies — consolidating those is a separate future refactor.)

export interface FunctionCaps { daily: number; monthly: number }

export type GateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }

// The pure gate decision. `flagEnabled` is the resolved app_config flag (the
// reader fails OPEN on a config read error — §4.2). `counts` are the
// POST-INCREMENT day/month counters from record_ai_usage; pass null ONLY when the
// flag is off (the caller skips the increment then — §5.4). Over-cap is
// strictly-greater because record_ai_usage increments-then-returns: the cap-th
// call returns count === cap and proceeds; the (cap+1)-th returns cap+1 and is
// blocked — exactly `caps.daily` model reads per UTC day.
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

async function readGateConfig(
  client: SupabaseClient,
  flagKey: string,
  functionKey: string,
  defaults: FunctionCaps,
): Promise<{ flagEnabled: boolean; caps: FunctionCaps }> {
  try {
    const { data, error } = await client
      .from('app_config')
      .select('key, value')
      .in('key', [flagKey, 'ai_caps'])
    if (error || !data) return { flagEnabled: true, caps: defaults }
    const byKey = new Map(data.map((r) => [(r as { key: string }).key, (r as { value: unknown }).value]))
    return {
      flagEnabled: resolveFlagValue(byKey.get(flagKey), true),
      caps: resolveCaps(byKey.get('ai_caps'), functionKey, defaults),
    }
  } catch {
    return { flagEnabled: true, caps: defaults }
  }
}

// Increment + read the caller's usage counters (§4.3). Null on RPC error →
// treated as under-cap (fail-open). uid derived inside the RPC (B-252).
async function recordUsage(
  client: SupabaseClient,
  functionKey: string,
): Promise<{ dayCount: number; monthCount: number } | null> {
  const { data, error } = await client.rpc('record_ai_usage', { p_function: functionKey, p_scope_id: null })
  if (error) {
    console.warn(`record_ai_usage(${functionKey}) failed — proceeding under cap:`, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { day_count?: number; month_count?: number } | null
  if (!row || typeof row.day_count !== 'number' || typeof row.month_count !== 'number') return null
  return { dayCount: row.day_count, monthCount: row.month_count }
}

// ── Image plumbing ─────────────────────────────────────────────────────────────

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
// unit-tested. Callers only ever pass a size-guarded (≤~3.93 MB) blob, so the
// window count is small and bounded.
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

// Fetch a photo as a blob within Claude's size cap. An already-small object is
// used as-is (exact bytes, no transform quota). An oversized object is re-fetched
// through Supabase Storage image transformations (imgproxy resizes server-side —
// no isolate memory, no base64 of the multi-MB original) scaled to
// DOWNSCALE_EDGE_PX, so an oversized photo still gets a real read instead of being
// skipped. Returns null when the object can't be brought under the cap (transform
// unavailable/errored — e.g. a format imgproxy can't read, or still too big) so the
// caller degrades to photoUnreadable. A raw-download failure throws (a real,
// retryable error). The worst case of the transform is "degrades exactly like a
// skipped photo"; it introduces no new failure mode.
async function fetchUsableImageBlob(
  adminClient: SupabaseClient,
  path: string,
  functionName: string,
): Promise<Blob | null> {
  const bucket = adminClient.storage.from(EVENT_ATTACHMENTS_BUCKET)
  const { data, error } = await bucket.download(path)
  if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`)
  if (data.size > 0 && data.size <= MAX_CLAUDE_IMAGE_BYTES) return data

  // Oversized (or zero-byte): try a server-side downscale.
  const { data: resized, error: resizeErr } = await bucket.download(path, {
    transform: { width: DOWNSCALE_EDGE_PX, height: DOWNSCALE_EDGE_PX, resize: 'contain' },
  })
  if (resizeErr || !resized) {
    console.warn(`${functionName}: downscale unavailable for ${path}: ${resizeErr?.message ?? 'no data'}`)
    return null
  }
  if (resized.size > 0 && resized.size <= MAX_CLAUDE_IMAGE_BYTES) return resized
  console.warn(`${functionName}: downscaled image still over cap for ${path} (${resized.size} bytes)`)
  return null
}

// ── Vision call ────────────────────────────────────────────────────────────────
// tool_choice is pinned to the descriptor's single tool — the response is always
// structured JSON, never free text that has to be parsed (Pattern 4, layer 2).

async function runVisionCall<TAnalysis extends IncidentAnalysisBase>(
  descriptor: IncidentDescriptor<TAnalysis>,
  images: ImagePart[],
): Promise<TAnalysis | null> {
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
      model: VISION_MODEL,
      max_tokens: VISION_MAX_TOKENS,
      system: descriptor.systemPrompt,
      tools: [descriptor.tool],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: descriptor.userMessageText }],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`)
  }
  return descriptor.parseToolResult(await res.json() as ClaudeResponse)
}

// ── The pipeline ───────────────────────────────────────────────────────────────

interface RequestBody {
  event_id: string
}

export async function runIncidentAnalysis<TAnalysis extends IncidentAnalysisBase>(
  descriptor: IncidentDescriptor<TAnalysis>,
  req: Request,
): Promise<Response> {
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
  let incidentTypeForFailure: string | null = null

  try {
    // 0. Verify the caller uid from the JWT (§4.6). record_ai_usage derives the
    //    uid inside its SECURITY DEFINER body, so this is defense-in-depth + a
    //    clean 401 (rather than an RPC RAISE surfacing as a 500) when the token is
    //    absent/expired. The reads below are already RLS-scoped by this same JWT.
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    // 1. Load the event (ownership-scoped) and confirm it is an active event of
    //    this descriptor's incident type.
    const { data: event } = await userClient
      .from('events')
      .select('id, pet_id, event_type, occurred_at, deleted_at, pets(name, species)')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404, headers: CORS_HEADERS })
    }
    if (!descriptor.eventTypes.includes(event.event_type as string)) {
      return Response.json({ error: descriptor.wrongTypeError }, { status: 400, headers: CORS_HEADERS })
    }

    const pet = (Array.isArray(event.pets) ? event.pets[0] : event.pets) as { name: string; species: string } | null
    const petName = pet?.name ?? 'your pet'
    const species = pet?.species ?? 'unknown'
    const petId = event.pet_id as string
    const occurredAt = event.occurred_at as string
    const incidentType = event.event_type as string
    petIdForFailure = petId
    incidentTypeForFailure = incidentType

    // 2. Photo(s) for this event (ordered). May be empty (logged without a photo).
    const { data: attachments } = await userClient
      .from('event_attachments')
      .select('storage_path')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })

    const photoPaths = (attachments ?? []).map((a) => a.storage_path as string)
    const hasPhoto = photoPaths.length > 0

    // 3. Deterministic contextual flags FIRST (§5.4 step 2 — the reorder). These
    //    are DB reads, fully independent of the vision result (they already run
    //    for photo-less logs), so they compute BEFORE the model call and
    //    therefore SURVIVE the cap. This is what guarantees a capped /
    //    flagged-off incident still escalates when the context warrants it — the
    //    invariant the adversarial review must try to break.
    const contextualFlags = await descriptor.computeContextualFlags(userClient, { petId, occurredAt, species })

    // 3b. Existing analysis row — honors the never-clobber guard (B-028) in every
    //     write path below, and decides whether a cap/disabled STATE may be written
    //     (it must never bury an already-completed or owner-edited read).
    const { data: existing } = await adminClient
      .from('event_ai_analysis')
      .select('id, edited_at, status')
      .eq('event_id', eventId)
      .maybeSingle()
    const humanEdited = !!existing?.edited_at
    const existingRealAnalysis =
      !!existing && existing.status !== 'pending' && existing.status !== 'failed'

    // 4. Flag + cap gate (§5.4 step 3) — immediately before the vision call, AFTER
    //    the escalation-flag computation above. The cap/flag gate the MODEL CALL, so
    //    the gate only runs when there IS a photo to read: a photo-less log makes no
    //    vision call, so it burns no counter unit and takes the byte-identical
    //    pre-diff path (its contextual escalation still fires below via the "under
    //    cap" branch, and the descriptive-read flag is moot with no read to disable).
    //    Flag off ⇒ NO increment (a flagged-off call burns no unit). Flag on ⇒
    //    increment-then-check.
    let gate: GateState = { allow: true }
    if (hasPhoto) {
      const { flagEnabled, caps } = await readGateConfig(userClient, descriptor.flagKey, descriptor.functionKey, descriptor.caps)
      const counts = flagEnabled ? await recordUsage(userClient, descriptor.functionKey) : null
      gate = resolveGateState(flagEnabled, counts, caps)
    }

    // 5. Capped or flagged off (§5.4 step 4): SKIP the vision call. The escalation
    //    floor still runs with NO visual flags (no model ran); a fired contextual
    //    flag STILL forces worth_a_call — never-reassure survives the cap BY
    //    CONSTRUCTION: there is no code path from "capped" to a reassuring verdict.
    if (!gate.allow) {
      const cappedRec = applyIncidentEscalationFloor({
        modelRecommendation: 'not_enough_to_say',
        appearsToShowIncident: false,
        hasPhoto,
        visualEscalation: false,
        contextualFlags,
      })
      if (contextualFlags.length > 0) {
        // Escalation survives the cap → write a COMPLETED escalation row. CRITICAL
        // never-clobber guard (B-028; caught by adversarial + code review 2026-07-14):
        // this write carries a null analysis (no model ran), so a FULL upsert would
        // null the structured clinical fields (blood_present / foreign_material_present
        // / colour / …). A prior REAL analysis's facts must survive untouched — so we
        // route through update-read-fields-only whenever the row is already a real
        // analysis (humanEdited OR completed/uncertain), exactly the protection the
        // no-flags branch below gives via existingRealAnalysis. Only a truly-fresh row
        // (no prior real analysis) takes the full upsert, where null structured fields
        // are correct (there is nothing to preserve — same as a photo-less escalation).
        const preserveStructured = humanEdited || existingRealAnalysis
        const readText = selectIncidentReadText({
          petName,
          recommendation: cappedRec, // worth_a_call
          contextualFlags,
          visualFlags: [],
          modelReadText: null,
          photoUnreadable: false,
          hasPhoto,
        }, descriptor.readTemplates)
        const readFields: AnalysisReadFields = {
          recommendation: cappedRec,
          read_text: readText,
          visual_flags: [],
          contextual_flags: contextualFlags,
          status: 'completed',
          error: null,
        }
        const writeBack = buildIncidentWriteBack({
          humanEdited: preserveStructured,
          eventId,
          petId,
          incidentType,
          analysisPayload: null,
          confidence: null,
          structuredValues: descriptor.structuredColumns(null),
          readFields,
        })
        const { error: writeError } = writeBack.mode === 'update'
          ? await adminClient.from('event_ai_analysis').update(writeBack.values).eq('event_id', eventId)
          : await adminClient.from('event_ai_analysis').upsert(writeBack.values, { onConflict: 'event_id' })
        if (writeError) throw new Error(`DB write failed: ${writeError.message}`)
      } else if (!existingRealAnalysis) {
        // No escalation AND no prior real analysis to protect → record the cap /
        // disabled STATE (§4.5) so the client renders its designed state (T2-4).
        // No recommendation, no read, no flags — nothing reassuring is written. A
        // pre-existing completed/edited analysis is left UNTOUCHED (the cap must
        // never downgrade a real read).
        const status = gate.reason === 'feature_disabled' ? 'read_disabled' : 'capped'
        const { error: writeError } = await adminClient
          .from('event_ai_analysis')
          .upsert(
            { event_id: eventId, pet_id: petId, incident_type: incidentType, status, error: null },
            { onConflict: 'event_id' },
          )
        if (writeError) throw new Error(`DB write failed: ${writeError.message}`)
      }
      // else: capped/disabled, no new flags, but a real analysis already exists →
      // leave it exactly as-is (success, no write).
      return Response.json(
        {
          success: true,
          gated: gate.reason,
          recommendation: contextualFlags.length > 0 ? cappedRec : null,
          contextual_flags: contextualFlags,
          visual_flags: [],
        },
        { headers: CORS_HEADERS },
      )
    }

    // 6. Under cap + enabled — the vision path. Only runs a usable photo through
    //    the model; an oversized/undecodable photo degrades to photoUnreadable.
    let analysis: TAnalysis | null = null
    let photoUnreadable = false
    if (hasPhoto) {
      // Fetch each photo at a size Claude can accept. An already-small object is
      // used as-is; an oversized one is re-fetched via server-side downscaling
      // (imgproxy) so we never base64-encode a multi-MB image (the 546 OOM) AND an
      // oversized photo still gets a real read instead of being skipped. Anything
      // we can't get under the cap becomes null → photoUnreadable (honest degrade,
      // never a crash). The raw-size guard lives in fetchUsableImageBlob, BEFORE
      // any encoding.
      const fetched = await Promise.all(
        photoPaths.slice(0, MAX_PHOTOS_PER_ANALYSIS).map((path) => fetchUsableImageBlob(adminClient, path, descriptor.functionName)),
      )
      const usableBlobs = fetched.filter((b): b is Blob => b !== null)
      if (usableBlobs.length === 0) {
        photoUnreadable = true // no photo we could get within Claude's size limit
      } else {
        const imageParts = await Promise.all(usableBlobs.map(blobToImagePart))
        try {
          analysis = await runVisionCall(descriptor, imageParts)
          if (!analysis) throw new Error('Vision model did not return an analysis')
        } catch (visionErr) {
          const msg = visionErr instanceof Error ? visionErr.message : String(visionErr)
          // A Claude 400 means the image itself is unusable — undecodable format
          // (e.g. HEIC, which Claude can't read), corrupt, or a partial upload.
          // Degrade gracefully to the contextual floor with an honest "couldn't
          // read the photo" read rather than 500. Re-throw anything else
          // (transient Claude/network errors) so it's a real, retryable failure.
          if (msg.includes('Claude API error 400')) {
            console.warn(`${descriptor.functionName}: image unreadable, degrading:`, msg)
            photoUnreadable = true
          } else {
            throw visionErr
          }
        }
      }
    }

    // 7. Escalation floor (contextual flags from step 3 + the model's visual read,
    //    filtered through the descriptor's per-type escalation rule).
    const visualFlags = analysis?.visual_flags ?? []
    const recommendation = applyIncidentEscalationFloor({
      modelRecommendation: analysis?.recommendation ?? 'not_enough_to_say',
      appearsToShowIncident: analysis ? descriptor.appearsToShowIncident(analysis) : false,
      hasPhoto,
      visualEscalation: analysis ? descriptor.escalatesOnVisual(analysis) : false,
      contextualFlags,
    })

    // 8. Read text — the load-bearing never-reassure selection (B-060), pure + tested.
    // The model's free text reaches the owner ONLY on the worth_a_call (visual-flag)
    // escalation path; the monitor / no-flag path is a deterministic template, so a
    // single sample can never assert an all-clear (the n=1 invariant, made structural
    // after a denylist proved too leaky to be the net — adversarial review 2026-06-24).
    const readText = selectIncidentReadText({
      petName,
      recommendation,
      contextualFlags,
      visualFlags,
      modelReadText: analysis?.read_text ?? null,
      photoUnreadable,
      hasPhoto,
    }, descriptor.readTemplates)

    const status = recommendation === 'not_enough_to_say' ? 'uncertain' : 'completed'

    // 9. Write-back, never clobbering a human-edited row (existing read at step 3b).
    // If the owner has edited any structured field (edited_at set), preserve all
    // editable facts and the cached original; only refresh the (non-editable) read +
    // flags so the deterministic floor can still escalate on worsening context.
    const readFields: AnalysisReadFields = {
      recommendation,
      read_text: readText,
      visual_flags: visualFlags,
      contextual_flags: contextualFlags,
      status,
      error: null,
    }

    const writeBack = buildIncidentWriteBack({
      humanEdited,
      eventId,
      petId,
      incidentType,
      analysisPayload: analysis,
      confidence: analysis?.confidence ?? null,
      structuredValues: descriptor.structuredColumns(analysis),
      readFields,
    })

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
    console.error(`${descriptor.functionName} error:`, message)

    // Best-effort failure write so the detail screen can surface a retry CTA.
    // Only possible once we know pet_id (the table requires it NOT NULL); if we
    // failed before loading the event we have nothing valid to write.
    if (petIdForFailure && incidentTypeForFailure) {
      await adminClient
        .from('event_ai_analysis')
        .upsert(
          { event_id: eventId, pet_id: petIdForFailure, incident_type: incidentTypeForFailure, status: 'failed', error: message },
          { onConflict: 'event_id' },
        )
        .then(() => undefined)
    }

    return Response.json(
      { error: 'Analysis failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
