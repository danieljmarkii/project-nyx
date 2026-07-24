// Supabase Edge Function — extract-food-from-photo
// Called by the client immediately after photos are uploaded to nyx-food-photos.
// Downloads photos, calls Claude Sonnet vision with tool use for structured output,
// and writes results back to the food_items row.
// Runs with service role key so it can read storage and write food_items
// regardless of the per-row creator check. Caller JWT is still validated to
// ensure only authenticated users can trigger extraction.
//
// FR-6 ownership gate (B-354 PR 3 — closes B-343's server half). food_items is
// now per-account (migration 033): created_by_user_id is the ownership scope and
// RLS is owner-only. But the extraction write runs on the SERVICE ROLE, which
// bypasses RLS — so this function must enforce ownership itself. Before any
// billable work, it verifies the row named by the caller-supplied food_item_id
// is owned by the JWT-verified caller uid; a foreign or missing id is refused
// (a uniform 404, so ownership is not an existence oracle) rather than
// overwritten. The write predicates are scoped to the
// owner too (defense in depth), so no service-role write can ever touch another
// account's row — including the catch-block 'failed' status stamp.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
// B-351 Phase A PR 2 — the shared protein-keying module (lib/protein.ts) is the
// single source of truth for how a protein name is keyed everywhere. Imported by
// relative path across the function directory, exactly like generate-signal's
// protein.ts re-export; esbuild inlines it into the deploy bundle
// (scripts/deploy-edge.sh), so the deployed artifact stays self-contained.
// ⚠️ Do not rename or move lib/protein.ts without updating this path.
import { deriveProteinSet } from '../../../lib/protein.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  food_item_id: string
  photo_paths: string[]
}

export interface ExtractionResult {
  brand: string
  product_name: string
  format: string | null
  // The ordered, canonical protein set (B-351). proteins[0] is the primary, and
  // `primary_protein` below is derived from it — the two can never disagree.
  // Empty array = protein-unknown (never a junk key).
  proteins: string[]
  primary_protein: string | null
  is_grain_free: boolean | null
  is_prescription: boolean | null
  ingredients_text: string | null
  upc_barcode: string | null
  confidence: ConfidenceScores
}

export interface ConfidenceScores {
  brand: number
  product_name: number
  format: number
  // Legibility of the ingredient panel's protein sources as a whole (B-351).
  // `primary_protein` is kept alongside it for back-compat with rows extracted
  // before PR 2 — the client's confirm screen reads per-field confidence.
  proteins: number
  primary_protein: number
  is_grain_free: number
  is_prescription: number
  ingredients_text: number
  upc_barcode: number
}

interface ClaudeToolInput {
  brand?: string
  product_name?: string
  format?: string
  // Typed `unknown`, not string[]: this is raw model output. deriveProteinSet
  // does the shape-checking (a non-array, or non-string elements, degrade to
  // "nothing captured" rather than throwing mid-extraction).
  proteins?: unknown
  primary_protein?: string
  is_grain_free?: boolean
  is_prescription?: boolean
  ingredients_text?: string
  upc_barcode?: string
  confidence?: Partial<ConfidenceScores>
}

interface ClaudeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: ClaudeToolInput }
  >
  stop_reason: string
}

// ── Extraction tool schema ────────────────────────────────────────────────────
// Tool use forces Claude to return structured JSON rather than prose.
// All non-brand/product_name fields are nullable — Claude must return null
// rather than guess when a field is not clearly visible in the photos.

// The format values Claude may emit. Single source of truth for the tool enum
// below; AI_FORMAT_TO_DB must carry a mapping for every value here (locked by
// index.test.ts) so the two can't drift the way `jerky` once did (B-103).
export const FORMAT_ENUM = [
  'dry', 'wet', 'raw', 'freeze_dried', 'jerky', 'human_food', 'treats', 'supplement', 'other',
] as const

const EXTRACTION_TOOL = {
  name: 'extract_food_data',
  description:
    'Extract structured pet food product data from one or more product packaging photos. ' +
    'Return null for any field that is not clearly legible in the provided images.',
  input_schema: {
    type: 'object',
    properties: {
      brand: {
        type: 'string',
        description: 'Brand name exactly as printed on packaging (e.g. "Royal Canin", "Hill\'s Science Diet").',
      },
      product_name: {
        type: 'string',
        description: 'Product line name exactly as printed (e.g. "Hydrolyzed Protein Adult HP", "Sensitive Stomach & Skin").',
      },
      format: {
        type: 'string',
        enum: FORMAT_ENUM,
        description:
          'Physical format of the food. Use "jerky" for dried meat-strip treats (distinct from "freeze_dried"). ' +
          'Use "human_food" for people-food given to a pet (e.g. deli meat, rotisserie chicken, cheese) rather than commercial pet food.',
      },
      primary_protein: {
        type: 'string',
        description:
          'The single headline protein the product is sold as — the one a vet would call this food\'s protein ' +
          '(e.g. "chicken", "salmon", "hydrolyzed soy protein"). Usually named on the front of pack. ' +
          'This is the MAIN protein even when another protein appears earlier in the ingredient list. ' +
          // Load-bearing: this field is what gets hoisted to proteins[0], and it is NOT in the tool's
          // `required` list (so an unknown stays null rather than being hallucinated). A model that
          // treats it as redundant once it has filled `proteins` silently hands proteins[0] back to
          // panel order — which, on a "Duck Recipe" listing chicken first, makes the PR-4 contaminant
          // check treat chicken as the trial target and flag DUCK as its own trial's contaminant.
          // Asking for it whenever ANY protein was identified closes that without inviting a guess:
          // it selects among proteins already read off the label, it never invents one.
          'Always provide this field whenever you identify any protein at all — if the front of pack does not ' +
          'name one, use the most prominent protein from the ingredient list. Leave it out only when no ' +
          'protein is legible anywhere.',
      },
      // B-351: the ordered set. The single most common reason a home elimination
      // trial silently fails is a SECONDARY protein (a "duck" food that also
      // lists chicken by-product meal) — invisible until it is structured.
      proteins: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Every protein source in the ingredient list, ordered as they appear on the panel (most prominent first). ' +
          'Use the bare animal or protein term only — "chicken", not "chicken by-product meal"; "salmon", not "deboned salmon". ' +
          'Include the primary protein as well as every secondary one. ' +
          'Include a non-animal protein source when the label presents it as a protein (e.g. "hydrolyzed soy protein", "pea protein") — ' +
          'keep "hydrolyzed" when the label says hydrolyzed, as that is a clinically different ingredient. ' +
          'Do NOT include fats or oils (chicken fat, salmon oil), broths, digests, grains, vegetables, or supplements. ' +
          'Return an empty array if the ingredient panel is not legible in the provided photos.',
      },
      is_grain_free: {
        type: 'boolean',
        description: 'True if the packaging explicitly states "grain free" or equivalent. False if grains are listed. Null if unclear.',
      },
      is_prescription: {
        type: 'boolean',
        description: 'True if labelled as a prescription or veterinary diet. False otherwise.',
      },
      ingredients_text: {
        type: 'string',
        description:
          'Full ingredients list verbatim from the label, in AAFCO order as printed. ' +
          'Do not paraphrase, reorder, or omit any ingredient. Null if the ingredients label is not in the provided photos.',
      },
      upc_barcode: {
        type: 'string',
        description: 'UPC barcode digits as a string, if a barcode photo is provided and legible. Null otherwise.',
      },
      confidence: {
        type: 'object',
        description: 'Per-field confidence score from 0.0 (not visible / guessed) to 1.0 (clearly legible, unambiguous).',
        properties: {
          brand:            { type: 'number', minimum: 0, maximum: 1 },
          product_name:     { type: 'number', minimum: 0, maximum: 1 },
          format:           { type: 'number', minimum: 0, maximum: 1 },
          proteins:         { type: 'number', minimum: 0, maximum: 1 },
          primary_protein:  { type: 'number', minimum: 0, maximum: 1 },
          is_grain_free:    { type: 'number', minimum: 0, maximum: 1 },
          is_prescription:  { type: 'number', minimum: 0, maximum: 1 },
          ingredients_text: { type: 'number', minimum: 0, maximum: 1 },
          upc_barcode:      { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['brand', 'product_name', 'format', 'proteins', 'primary_protein', 'is_grain_free', 'is_prescription', 'ingredients_text', 'upc_barcode'],
      },
    },
    required: ['brand', 'product_name', 'confidence'],
  },
}

const SYSTEM_PROMPT =
  'You are a veterinary nutrition data extraction assistant. ' +
  'You are given one to three photos of pet food product packaging: ' +
  'the front of pack (always present), optionally the ingredients panel, and optionally a barcode. ' +
  'Your job is to extract structured data from the packaging exactly as printed — no inference, no paraphrasing. ' +
  'Rules: ' +
  '(1) brand and product_name must be copied verbatim from the packaging. ' +
  '(2) ingredients_text must be the full ingredients list in AAFCO order exactly as printed — do not reorder, paraphrase, or abbreviate. ' +
  '(3) If a field is not clearly visible in the provided photos, return null — never hallucinate. ' +
  '(4) confidence scores reflect legibility: 1.0 = clearly readable, 0.0 = not visible or ambiguous. ' +
  '(5) proteins is read FROM the ingredient list, in panel order, as bare terms — every protein source, ' +
  'not only the headline one. A secondary protein an owner would miss (a "duck" food that also lists chicken ' +
  'by-product meal) is the single most important thing to catch. Never invent a protein that is not printed; ' +
  'an unreadable panel means an empty array, not a guess from the product name. ' +
  'Call the extract_food_data tool with your findings.'

// ── Image size guard + downscale (ported from analyze-vomit, B-204) ────────────
// Claude rejects any single image whose base64 payload exceeds 5 MB, and the
// encode itself is what OOM-kills the worker: btoa(Array.from(bytes,…).join(''))
// materialised one JS string per byte, so a multi-MB photo grew a "rope" of
// millions of cons-string nodes (~250 MB for a 6.5 MB image), blowing the
// isolate's memory limit and returning a 546 (WORKER_RESOURCE_LIMIT) that
// HARD-KILLS the worker before any row is written. Food photos are
// client-compressed (1600px/q75) so this was latent here, but a large/legacy
// upload would OOM identically — the exact bug that hit analyze-vomit (PR #255).
// We guard on the RAW byte size (blob.size) BEFORE encoding, and downscale an
// oversized photo server-side via Supabase Storage image transformations.
const MAX_CLAUDE_IMAGE_BASE64 = 5_242_880
// base64 inflates bytes by 4/3, so the raw ceiling that stays within the base64
// cap is floor(cap / 4) * 3 ≈ 3.93 MB. floor-then-×3 is provably ≤ cap for ANY
// cap (4·floor(cap/4) ≤ cap), so a future edit to the base64 cap can't quietly
// let an over-cap image through — unlike floor(cap * 3 / 4), which overshoots
// when cap mod 4 == 2.
const MAX_CLAUDE_IMAGE_BYTES = Math.floor(MAX_CLAUDE_IMAGE_BASE64 / 4) * 3
// Oversized photos are re-fetched through Supabase Storage image transformations
// (imgproxy — resizes server-side, so zero isolate memory and no base64 of the
// original) scaled to fit this longest edge. 1568px is the size Claude
// downsamples to internally, so this costs no legibility vs. what the model would
// see anyway. Requires the Pro plan's transformation add-on (already on — B-205);
// if it's unavailable or errors, the photo is dropped from the extraction set.
const DOWNSCALE_EDGE_PX = 1568

// ── Helpers ──────────────────────────────────────────────────────────────────

// Chunked base64 encoder — the OOM-safe replacement for the per-byte rope
// string. Encoding in fixed 32 KB byte windows and letting native btoa do the
// work keeps peak memory roughly linear in the image size. Pure + exported so
// correctness is unit-tested (index.test.ts). Callers only ever pass a
// size-guarded (≤~3.93 MB) blob, so the window count is small and bounded.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000 // 32 KB — safe to spread into String.fromCharCode
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Converts a Blob from Supabase Storage into a base64 string safe for the
// Claude API. Delegates to the chunked encoder so a large blob no longer OOMs
// the isolate (B-204). Callers pass only size-guarded blobs (fetchUsableImageBlob).
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return bytesToBase64(bytes)
}

// Fetch a food photo as a blob within Claude's size cap. An already-small object
// is used as-is (exact bytes, no transform quota). An oversized object is
// re-fetched through Supabase Storage image transformations (imgproxy resizes
// server-side — no isolate memory, no base64 of the multi-MB original) scaled to
// DOWNSCALE_EDGE_PX, so an oversized photo still gets a real read instead of
// being skipped. Returns null when the object can't be brought under the cap
// (transform unavailable/errored — e.g. a format imgproxy can't read, or still
// too big) so the caller drops it from the extraction set. A raw-download failure
// throws (a real, retryable error), matching the prior behaviour. The worst case
// of the transform is "degrades exactly like before"; it introduces no new
// failure mode.
export async function fetchUsableImageBlob(adminClient: SupabaseClient, path: string): Promise<Blob | null> {
  const bucket = adminClient.storage.from('nyx-food-photos')
  const { data, error } = await bucket.download(path)
  if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`)
  if (data.size > 0 && data.size <= MAX_CLAUDE_IMAGE_BYTES) return data

  // Oversized (or zero-byte): try a server-side downscale.
  const { data: resized, error: resizeErr } = await bucket.download(path, {
    transform: { width: DOWNSCALE_EDGE_PX, height: DOWNSCALE_EDGE_PX, resize: 'contain' },
  })
  if (resizeErr || !resized) {
    console.warn(`extract-food-from-photo: downscale unavailable for ${path}: ${resizeErr?.message ?? 'no data'}`)
    return null
  }
  if (resized.size > 0 && resized.size <= MAX_CLAUDE_IMAGE_BYTES) return resized
  console.warn(`extract-food-from-photo: downscaled image still over cap for ${path} (${resized.size} bytes)`)
  return null
}

// Extracts and normalises the tool_use block from a Claude response.
// Returns null if Claude did not call the tool (should not happen with tool_choice=any).
export function parseToolResult(response: ClaudeResponse): ExtractionResult | null {
  const toolBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'extract_food_data')
  if (!toolBlock || toolBlock.type !== 'tool_use') return null

  const input = toolBlock.input as ClaudeToolInput
  const confidence = normaliseConfidence(input.confidence ?? {})

  // B-351: one derivation for both fields, so `primary_protein` is the derived
  // proteins[0] by construction and the pair can never drift. deriveProteinSet
  // hoists the model's primary to position 0 and canonicalizes the whole set
  // (which is where B-048's synonym mapping lands — see lib/protein.ts).
  const proteins = deriveProteinSet(input.proteins, input.primary_protein ?? null)

  return {
    brand:            input.brand ?? '',
    product_name:     input.product_name ?? '',
    format:           input.format ?? null,
    proteins,
    primary_protein:  proteins[0] ?? null,
    is_grain_free:    input.is_grain_free ?? null,
    is_prescription:  input.is_prescription ?? null,
    ingredients_text: input.ingredients_text ?? null,
    upc_barcode:      input.upc_barcode ?? null,
    confidence,
  }
}

// The Claude tool emits short format names ('dry', 'wet', ...) for token
// efficiency. The Postgres food_format enum uses the longer picker-friendly
// names. Map them here so the DB update doesn't get rejected by the enum.
const AI_FORMAT_TO_DB: Record<string, string> = {
  dry:          'dry_kibble',
  wet:          'wet_canned',
  raw:          'raw',
  freeze_dried: 'freeze_dried',
  jerky:        'jerky',
  human_food:   'human_food', // B-102 PR 3 — people-food container (deli meat, rotisserie chicken)
  treats:       'treat',
  supplement:   'topper',
  other:        'other',
}

export function mapFormatToDb(aiFormat: string | null): string | null {
  if (!aiFormat) return null
  return AI_FORMAT_TO_DB[aiFormat] ?? 'other'
}

// Ensures every confidence field is present and clamped to [0, 1].
export function normaliseConfidence(raw: Partial<ConfidenceScores>): ConfidenceScores {
  const clamp = (v: number | undefined) => Math.min(1, Math.max(0, v ?? 0))
  return {
    brand:            clamp(raw.brand),
    product_name:     clamp(raw.product_name),
    format:           clamp(raw.format),
    proteins:         clamp(raw.proteins),
    primary_protein:  clamp(raw.primary_protein),
    is_grain_free:    clamp(raw.is_grain_free),
    is_prescription:  clamp(raw.is_prescription),
    ingredients_text: clamp(raw.ingredients_text),
    upc_barcode:      clamp(raw.upc_barcode),
  }
}

// ── Cap + flag gate (Monetization Track 2, T2-3 / B-329 + B-001) ──────────────
// docs/monetization-and-throttling-requirements.md §4–§5. This block is the
// per-function COPY of the shared-shape gate logic (S6: the functions carry no
// _shared/ module; the convention here is copy-paste per function, exactly like
// detectImageMediaType — consolidation into _shared/gate.ts is a future refactor).
// All four AI functions carry an identical copy so the shape can't drift. The
// pure pieces (resolveGateState / resolveFlagValue / resolveCaps / computeResetsAt
// / validateFoodPhotoPaths) are exported + Deno-tested; the impure readGateConfig
// / recordUsage wrappers touch the client and are integration-verified.

// This function's code-default caps (§4.4 free tier). Track 2 ships the free
// column only, applied to everyone (no entitlement yet). Overridable at runtime
// via app_config.ai_caps without a deploy.
const CAPS: FunctionCaps = { daily: 15, monthly: 60 }
// The record_ai_usage / ai_caps key for this function (migration 031).
const FUNCTION_KEY = 'extract_food'
const FLAG_KEY = 'ai_food_extraction_enabled'

export interface FunctionCaps { daily: number; monthly: number }

export type GateState =
  | { allow: true }
  | { allow: false; reason: 'feature_disabled' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }

// The pure gate decision. `flagEnabled` is the resolved app_config flag (the
// reader fails OPEN on a config read error — §4.2). `counts` are the
// POST-INCREMENT day/month counters from record_ai_usage; pass null ONLY when the
// flag is off (the caller skips the increment then, so a flagged-off call burns
// no counter unit — §5.1). Over-cap is strictly-greater because record_ai_usage
// increments-then-returns: the cap-th call of the day returns count === cap and
// proceeds; the (cap+1)-th returns cap+1 and is blocked — so exactly `caps.daily`
// model calls land per UTC day.
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

// Resolve a boolean flag from a raw app_config JSONB value; `fallback` for a
// missing / non-boolean value. The read wrapper applies the same fallback on a
// query error (fail-open for the AI keys — §4.2).
export function resolveFlagValue(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

// Code-default caps overridden by app_config.ai_caps[functionKey] when the PM
// sets one (shape: { "<functionKey>": { "daily": N, "monthly": N } }). A missing
// key / partial / malformed object keeps the code defaults — an override can
// never accidentally tighten a cap to zero.
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

// resets_at for the typed cap-reached body (§4.5): next UTC midnight (daily) or
// first-of-next-UTC-month (monthly). Pure over nowMs so it's unit-testable.
export function computeResetsAt(cap: 'daily' | 'monthly', nowMs: number): string {
  const d = new Date(nowMs)
  if (cap === 'daily') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString()
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString()
}

// S3 hardening (§4.6, rls-privacy-reviewer input): the caller supplies photo_paths
// directly (unlike medication, which derives the path from the uid). What this
// guard IS: a traversal / self-consistency check — every path must sit under the
// `${food_item_id}/` the caller claimed, and no `..` / backslash / leading-slash
// can smuggle the service-role download out to another bucket or key. What it is
// NOT: a cross-tenant boundary — `food_item_id` is itself an unauthenticated body
// value, so this only enforces "the paths match the id you claimed," not ownership.
// The cross-tenant READ boundary is now the FR-6 ownership gate in the handler
// (B-354 PR 3): fetchUsableImageBlob is reached only AFTER the caller is proven to
// own `food_item_id`, and this validator then pins every path under that owned id.
// (Migration 033 also scoped the nyx-food-photos SELECT policy to the food's owner,
// so even a direct signed-in read is owner-locked — the pre-033 "globally-readable
// bucket" rationale no longer applies.) Client paths are `${foodId}/${slot}.jpg`
// with food_item_id === foodId, so this is byte-identical for the real client.
// Pure + exported for the unit test.
export function validateFoodPhotoPaths(foodItemId: string, paths: string[]): boolean {
  const prefix = `${foodItemId}/`
  return paths.every((p) =>
    typeof p === 'string' &&
    p.startsWith(prefix) &&
    !p.includes('..') &&
    !p.includes('\\') &&
    !p.startsWith('/'),
  )
}

// ── FR-6 ownership gate (B-354 PR 3 / closes B-343's server half) ─────────────
// The extraction write runs on the SERVICE ROLE, which bypasses the owner-only
// RLS migration 033 added to food_items — so an explicit ownership check is the
// only thing standing between an authenticated caller and another account's food
// row. Without it, a caller could POST a food_item_id they do not own and the
// service role would overwrite that row's extracted fields (and, on failure,
// stamp ai_extraction_status='failed' on it). This closes B-343's server half
// (the client half closed with the RLS rewrite). Unlike validateFoodPhotoPaths
// (a path self-consistency check that is NOT a tenancy boundary), this compares
// the row's persisted owner against the JWT-verified caller uid — the actual
// cross-tenant boundary.
//
// `row` is the fetched food_items row (null when no row exists for the id). A row
// whose creator is null/blank cannot be proven owned, so it is refused rather
// than treated as owned (created_by_user_id is NOT NULL post-033, but fail closed
// regardless). Pure + exported for the unit test.
export type OwnershipResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden' }

export function resolveFoodOwnership(
  row: { created_by_user_id: string | null } | null,
  callerUid: string,
): OwnershipResult {
  if (!row) return { ok: false, reason: 'not_found' }
  if (!row.created_by_user_id || row.created_by_user_id !== callerUid) {
    return { ok: false, reason: 'forbidden' }
  }
  return { ok: true }
}

// Read this function's flag + the ai_caps override in ONE round trip. Fail-OPEN:
// any read error / missing rows → flag defaults to true and caps to the code
// defaults (§4.2 — a transient config blip must never dark-hole a working feature).
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

// Increment + read this caller's usage counters (§4.3). Returns null on RPC error
// — the caller treats null as "under cap" (fail-open: the cap is a generous abuse
// backstop, not a billing gate). The uid is derived INSIDE the SECURITY DEFINER
// RPC from auth.uid(), never a body value (B-252).
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

// ── Handler ───────────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
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

  const { food_item_id, photo_paths } = body

  if (!food_item_id || typeof food_item_id !== 'string') {
    return Response.json({ error: 'food_item_id required' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!Array.isArray(photo_paths) || photo_paths.length === 0) {
    return Response.json({ error: 'photo_paths must be a non-empty array' }, { status: 400, headers: CORS_HEADERS })
  }
  if (photo_paths.length > 3) {
    return Response.json({ error: 'Maximum 3 photos per extraction' }, { status: 400, headers: CORS_HEADERS })
  }
  // S3 (§4.6): bind the caller-supplied paths to this food_item_id + reject
  // traversal, so the extractor can't be pointed at a different food's photos.
  if (!validateFoodPhotoPaths(food_item_id, photo_paths)) {
    return Response.json({ error: 'photo_paths must belong to food_item_id' }, { status: 400, headers: CORS_HEADERS })
  }

  // User-scoped client (caller JWT): used to VERIFY the uid (§4.6 — the counter
  // keys on a JWT-verified id, never a body value) and to read app_config /
  // record_ai_usage as the `authenticated` role. This function previously ran
  // entirely on the service role with no uid; T2-3 adds the verified identity.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  // Service role client: bypasses RLS for storage reads and food_items writes.
  // The caller's JWT was validated above; the service role is only used here
  // because the Edge Function is the trusted extraction pipeline, not an
  // arbitrary user action. Created up front because the FR-6 ownership gate below
  // needs it BEFORE any billable work (or any write that could touch a row).
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // FR-6 ownership gate (B-354 PR 3): the writes below run on the service role
  // and bypass RLS, so verify the caller OWNS this food_item_id before spending a
  // usage unit or a Claude call — and, critically, before the catch-block failure
  // write could stamp ai_extraction_status='failed' on a foreign row. A read
  // error is a 500 (can't verify → don't proceed). Both a missing row AND another
  // account's row return a UNIFORM 404: the 403-vs-404 split would be an existence
  // oracle (confirming a food_items UUID is real), so the reason is logged
  // server-side only and never disclosed to a non-owner. Closes B-343's server half.
  const { data: ownerRow, error: ownerErr } = await adminClient
    .from('food_items')
    .select('created_by_user_id')
    .eq('id', food_item_id)
    .maybeSingle()
  if (ownerErr) {
    console.error(`extract-food-from-photo: ownership check failed for ${food_item_id}:`, ownerErr.message)
    return Response.json({ error: 'Could not verify food ownership' }, { status: 500, headers: CORS_HEADERS })
  }
  const ownership = resolveFoodOwnership(ownerRow, user.id)
  if (!ownership.ok) {
    console.warn(`extract-food-from-photo: ownership denied (${ownership.reason}) for ${food_item_id}`)
    return Response.json({ error: 'food_item not found' }, { status: 404, headers: CORS_HEADERS })
  }

  // Flag → (nothing to preserve for extraction) → cap → Anthropic call (§5.1).
  // Flag off: return the typed 200 WITHOUT touching ai_extraction_status — the
  // food row + photo are already saved; a stale client routes to manual entry.
  const { flagEnabled, caps } = await readGateConfig(userClient)
  if (!flagEnabled) return featureDisabledResponse()
  // Increment-then-check. Cap reached: typed 200, extraction status untouched —
  // the record is never gated, only the model call (§5.1 step 3).
  const counts = await recordUsage(userClient)
  const gate = resolveGateState(flagEnabled, counts, caps)
  if (!gate.allow && gate.reason === 'cap_reached') return capReachedResponse(gate.cap)

  try {
    // 1. Fetch each photo at a size Claude can accept. An already-small object is
    //    used as-is; an oversized one is re-fetched via server-side downscaling
    //    (imgproxy) so we never base64-encode a multi-MB image (the 546 OOM,
    //    B-204). The raw-size guard lives in fetchUsableImageBlob, BEFORE any
    //    encoding. A photo that can't be brought under the cap becomes null and is
    //    dropped from the extraction set (rare — requires the transform to fail).
    const fetched = await Promise.all(
      photo_paths.map((path) => fetchUsableImageBlob(adminClient, path)),
    )
    const imageBlobs = fetched.filter((b): b is Blob => b !== null)
    // Every photo was unreadable/over-cap — nothing to extract from. Degrade to a
    // clean failure (retry CTA surfaces on the food detail screen) rather than
    // sending Claude an empty image set.
    if (imageBlobs.length === 0) {
      throw new Error('No photo could be read within the image size limit')
    }

    // 2. Convert the usable blobs to base64 for the Claude vision API
    const base64Images = await Promise.all(imageBlobs.map(blobToBase64))

    // 3. Build the Claude message — images first, then a brief instruction
    const imageContentBlocks = base64Images.map((data) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data,
      },
    }))

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        // Force Claude to always call the tool — never return prose instead.
        tool_choice: { type: 'any' },
        messages: [
          {
            role: 'user',
            content: [
              ...imageContentBlocks,
              {
                type: 'text',
                text: 'Extract the pet food data from these packaging photos.',
              },
            ],
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      throw new Error(`Claude API error ${claudeRes.status}: ${errText}`)
    }

    const claudeData = await claudeRes.json() as ClaudeResponse
    const extraction = parseToolResult(claudeData)

    if (!extraction || !extraction.brand || !extraction.product_name) {
      throw new Error('Claude did not return a valid extraction result')
    }

    // 4. Write extracted fields back to food_items.
    // `format`, `is_grain_free`, `is_prescription` are NOT NULL on the table
    // with sensible defaults — fall back rather than send null and trip the
    // constraint. `ingredients_notes` is the actual column (Edge Function
    // previously wrote to a non-existent `ingredients` column).
    // Claude's tool-use boolean schema is not always honoured — we've seen
    // the literal string "null" come back for is_grain_free / is_prescription.
    // `?? false` only catches real null/undefined, so coerce strictly here.
    const toBool = (v: unknown): boolean => v === true
    const dbFormat = mapFormatToDb(extraction.format)
    const updatePayload: Record<string, unknown> = {
      brand:                    extraction.brand,
      product_name:             extraction.product_name,
      // B-351: the ordered set is the real datum; primary_protein is written as
      // its derived first element (parseToolResult guarantees the pair). A
      // protein-unknown read writes proteins=[] + primary_protein=null, matching
      // the column default — the row says "we don't know", never a junk key.
      proteins:                 extraction.proteins,
      primary_protein:          extraction.primary_protein,
      is_grain_free:            toBool(extraction.is_grain_free),
      is_prescription:          toBool(extraction.is_prescription),
      ingredients_notes:        extraction.ingredients_text,
      upc_barcode:              extraction.upc_barcode,
      source:                   'ai_extracted',
      ai_extraction_status:     'completed',
      ai_extraction_confidence: extraction.confidence,
      ai_extraction_error:      null,
    }
    if (dbFormat) updatePayload.format = dbFormat

    // Ownership was verified above; the created_by_user_id predicate is kept on
    // every write as defense in depth, so a service-role write can never reach a
    // foreign row even if the pre-check were bypassed.
    let { error: updateError } = await adminClient
      .from('food_items')
      .update(updatePayload)
      .eq('id', food_item_id)
      .eq('created_by_user_id', user.id)

    // UPC collision: another of THIS account's rows already owns this barcode
    // (food_items is per-account now — migration 033 made UPC uniqueness
    // (created_by_user_id, upc_barcode), so a collision is always within-account).
    // Retry with upc_barcode nulled so the rest of the extraction still lands.
    // Proper within-account merge-to-existing is tracked in docs/backlog.md (B-009).
    if (updateError && (updateError as { code?: string }).code === '23505') {
      console.warn(
        `UPC collision on food_item ${food_item_id} (upc=${extraction.upc_barcode}); retrying with null upc_barcode`,
      )
      updatePayload.upc_barcode = null
      ;({ error: updateError } = await adminClient
        .from('food_items')
        .update(updatePayload)
        .eq('id', food_item_id)
        .eq('created_by_user_id', user.id))
    }

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    return Response.json({ success: true, extraction }, { headers: CORS_HEADERS })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('extract-food-from-photo error:', message)

    // Best-effort failure write — if this also fails, the row stays 'pending'
    // and the retry CTA on the food detail screen will surface it. Ownership was
    // verified before the try block, so this only ever reaches the caller's own
    // row; the created_by_user_id predicate keeps that true by construction.
    await adminClient
      .from('food_items')
      .update({
        ai_extraction_status: 'failed',
        ai_extraction_error:  message,
      })
      .eq('id', food_item_id)
      .eq('created_by_user_id', user.id)
      .then(() => undefined)

    return Response.json(
      { error: 'Extraction failed', detail: message },
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
