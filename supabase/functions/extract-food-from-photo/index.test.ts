// Unit tests for extract-food-from-photo pure helpers.
// Run with: deno test supabase/functions/extract-food-from-photo/index.test.ts
//
// Tests cover parseToolResult and normaliseConfidence — the logic that
// translates raw Claude API output into the shape written to food_items.
// Storage I/O and the HTTP handler are integration concerns tested manually.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  parseToolResult,
  normaliseConfidence,
  blobToBase64,
  type ExtractionResult,
} from './index.ts'

// ── normaliseConfidence ───────────────────────────────────────────────────────

Deno.test('normaliseConfidence — fills missing fields with 0', () => {
  const result = normaliseConfidence({})
  assertEquals(result, {
    brand: 0,
    product_name: 0,
    format: 0,
    primary_protein: 0,
    is_grain_free: 0,
    is_prescription: 0,
    ingredients_text: 0,
    upc_barcode: 0,
  })
})

Deno.test('normaliseConfidence — clamps values above 1 to 1', () => {
  const result = normaliseConfidence({ brand: 1.5, product_name: 99 })
  assertStrictEquals(result.brand, 1)
  assertStrictEquals(result.product_name, 1)
})

Deno.test('normaliseConfidence — clamps negative values to 0', () => {
  const result = normaliseConfidence({ brand: -0.1, ingredients_text: -5 })
  assertStrictEquals(result.brand, 0)
  assertStrictEquals(result.ingredients_text, 0)
})

Deno.test('normaliseConfidence — passes valid values through', () => {
  const result = normaliseConfidence({
    brand: 0.98,
    product_name: 0.94,
    format: 0.85,
    primary_protein: 0.9,
    is_grain_free: 0.7,
    is_prescription: 1.0,
    ingredients_text: 0.71,
    upc_barcode: 0.0,
  })
  assertStrictEquals(result.brand, 0.98)
  assertStrictEquals(result.ingredients_text, 0.71)
  assertStrictEquals(result.upc_barcode, 0)
})

// ── parseToolResult ───────────────────────────────────────────────────────────

const makeToolUseResponse = (input: Record<string, unknown>) => ({
  content: [
    {
      type: 'tool_use' as const,
      id: 'toolu_01test',
      name: 'extract_food_data',
      input,
    },
  ],
  stop_reason: 'tool_use',
})

Deno.test('parseToolResult — returns null when no tool_use block present', () => {
  const response = {
    content: [{ type: 'text' as const, text: 'I cannot extract data from this image.' }],
    stop_reason: 'end_turn',
  }
  const result = parseToolResult(response)
  assertEquals(result, null)
})

Deno.test('parseToolResult — returns null when tool name does not match', () => {
  const response = {
    content: [
      {
        type: 'tool_use' as const,
        id: 'toolu_01other',
        name: 'some_other_tool',
        input: {},
      },
    ],
    stop_reason: 'tool_use',
  }
  const result = parseToolResult(response)
  assertEquals(result, null)
})

Deno.test('parseToolResult — full extraction with all fields present', () => {
  const response = makeToolUseResponse({
    brand: 'Royal Canin',
    product_name: 'Hydrolyzed Protein Adult HP',
    format: 'dry',
    primary_protein: 'hydrolyzed soy protein',
    is_grain_free: false,
    is_prescription: true,
    ingredients_text: 'Hydrolyzed Soy Protein, Brewers Rice, Corn Starch...',
    upc_barcode: '030111940005',
    confidence: {
      brand: 0.99,
      product_name: 0.97,
      format: 0.95,
      primary_protein: 0.92,
      is_grain_free: 0.88,
      is_prescription: 1.0,
      ingredients_text: 0.75,
      upc_barcode: 0.99,
    },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertStrictEquals(result.brand, 'Royal Canin')
  assertStrictEquals(result.product_name, 'Hydrolyzed Protein Adult HP')
  assertStrictEquals(result.format, 'dry')
  assertStrictEquals(result.primary_protein, 'hydrolyzed soy protein')
  assertStrictEquals(result.is_grain_free, false)
  assertStrictEquals(result.is_prescription, true)
  assertStrictEquals(result.upc_barcode, '030111940005')
  assertStrictEquals(result.confidence.brand, 0.99)
  assertStrictEquals(result.confidence.ingredients_text, 0.75)
})

Deno.test('parseToolResult — optional fields default to null when absent', () => {
  const response = makeToolUseResponse({
    brand: 'Purina Pro Plan',
    product_name: 'Sensitive Skin & Stomach',
    // format, primary_protein, etc. omitted by Claude (not visible)
    confidence: {
      brand: 0.98,
      product_name: 0.96,
    },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertStrictEquals(result.format, null)
  assertStrictEquals(result.primary_protein, null)
  assertStrictEquals(result.is_grain_free, null)
  assertStrictEquals(result.is_prescription, null)
  assertStrictEquals(result.ingredients_text, null)
  assertStrictEquals(result.upc_barcode, null)
  // Confidence fields absent in response → 0 after normalisation
  assertStrictEquals(result.confidence.format, 0)
  assertStrictEquals(result.confidence.upc_barcode, 0)
})

Deno.test('parseToolResult — confidence values are clamped', () => {
  const response = makeToolUseResponse({
    brand: 'Hill\'s',
    product_name: 'z/d Skin/Food Sensitivities',
    confidence: {
      brand: 1.2,       // above max
      product_name: -0.1, // below min
    },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertStrictEquals(result.confidence.brand, 1)
  assertStrictEquals(result.confidence.product_name, 0)
})

// ── blobToBase64 ──────────────────────────────────────────────────────────────

Deno.test('blobToBase64 — encodes bytes correctly', async () => {
  // Known input: 3 bytes [72, 101, 108] → base64 "SGVs"
  const blob = new Blob([new Uint8Array([72, 101, 108])])
  const result = await blobToBase64(blob)
  assertStrictEquals(result, 'SGVs')
})

Deno.test('blobToBase64 — handles empty blob', async () => {
  const blob = new Blob([new Uint8Array([])])
  const result = await blobToBase64(blob)
  assertStrictEquals(result, '')
})
