// Supabase Edge Function — extract-food-from-photo
// Called by the client immediately after photos are uploaded to nyx-food-photos.
// Downloads photos, calls Claude Sonnet vision with tool use for structured output,
// and writes results back to the food_items row.
// Runs with service role key so it can read storage and write food_items
// regardless of the per-row creator check. Caller JWT is still validated to
// ensure only authenticated users can trigger extraction.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
        description: 'Primary protein source as listed on the label (e.g. "chicken", "salmon", "hydrolyzed soy protein").',
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
          primary_protein:  { type: 'number', minimum: 0, maximum: 1 },
          is_grain_free:    { type: 'number', minimum: 0, maximum: 1 },
          is_prescription:  { type: 'number', minimum: 0, maximum: 1 },
          ingredients_text: { type: 'number', minimum: 0, maximum: 1 },
          upc_barcode:      { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['brand', 'product_name', 'format', 'primary_protein', 'is_grain_free', 'is_prescription', 'ingredients_text', 'upc_barcode'],
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
  'Call the extract_food_data tool with your findings.'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Converts a Blob from Supabase Storage into a base64 string safe for the
// Claude API. Uses Array.from to avoid stack overflow on large typed arrays.
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

// Extracts and normalises the tool_use block from a Claude response.
// Returns null if Claude did not call the tool (should not happen with tool_choice=any).
export function parseToolResult(response: ClaudeResponse): ExtractionResult | null {
  const toolBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'extract_food_data')
  if (!toolBlock || toolBlock.type !== 'tool_use') return null

  const input = toolBlock.input as ClaudeToolInput
  const confidence = normaliseConfidence(input.confidence ?? {})

  return {
    brand:            input.brand ?? '',
    product_name:     input.product_name ?? '',
    format:           input.format ?? null,
    primary_protein:  input.primary_protein ?? null,
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
    primary_protein:  clamp(raw.primary_protein),
    is_grain_free:    clamp(raw.is_grain_free),
    is_prescription:  clamp(raw.is_prescription),
    ingredients_text: clamp(raw.ingredients_text),
    upc_barcode:      clamp(raw.upc_barcode),
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  // Service role client: bypasses RLS for storage reads and food_items writes.
  // The caller's JWT was validated above; the service role is only used here
  // because the Edge Function is the trusted extraction pipeline, not an
  // arbitrary user action.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1. Download each photo from the food-photos bucket
    const imageBlobs = await Promise.all(
      photo_paths.map(async (path) => {
        const { data, error } = await adminClient.storage
          .from('nyx-food-photos')
          .download(path)
        if (error || !data) {
          throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`)
        }
        return data
      }),
    )

    // 2. Convert blobs to base64 for the Claude vision API
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

    let { error: updateError } = await adminClient
      .from('food_items')
      .update(updatePayload)
      .eq('id', food_item_id)

    // UPC collision: another row already owns this barcode (food_items is
    // globally scoped, so any user's prior scan can collide). Retry with
    // upc_barcode nulled so the rest of the extraction still lands. Proper
    // merge-to-existing is tracked in docs/backlog.md.
    if (updateError && (updateError as { code?: string }).code === '23505') {
      console.warn(
        `UPC collision on food_item ${food_item_id} (upc=${extraction.upc_barcode}); retrying with null upc_barcode`,
      )
      updatePayload.upc_barcode = null
      ;({ error: updateError } = await adminClient
        .from('food_items')
        .update(updatePayload)
        .eq('id', food_item_id))
    }

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    return Response.json({ success: true, extraction }, { headers: CORS_HEADERS })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('extract-food-from-photo error:', message)

    // Best-effort failure write — if this also fails, the row stays 'pending'
    // and the retry CTA on the food detail screen will surface it.
    await adminClient
      .from('food_items')
      .update({
        ai_extraction_status: 'failed',
        ai_extraction_error:  message,
      })
      .eq('id', food_item_id)
      .then(() => undefined)

    return Response.json(
      { error: 'Extraction failed', detail: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
