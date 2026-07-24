// Unit tests for extract-food-from-photo pure helpers.
// Run with: deno test supabase/functions/extract-food-from-photo/index.test.ts
//
// Tests cover parseToolResult and normaliseConfidence — the logic that
// translates raw Claude API output into the shape written to food_items.
// Storage I/O and the HTTP handler are integration concerns tested manually.

import {
  assertEquals,
  assertStrictEquals,
  assertNotStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import {
  parseToolResult,
  normaliseConfidence,
  mapFormatToDb,
  blobToBase64,
  bytesToBase64,
  FORMAT_ENUM,
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
  computeResetsAt,
  validateFoodPhotoPaths,
  resolveFoodOwnership,
  type ExtractionResult,
  type FunctionCaps,
} from './index.ts'
import {
  deriveProteinSet,
  normalizeExtractedProtein,
  canonicalizeProtein,
  MAX_CAPTURED_PROTEINS,
} from '../../../lib/protein.ts'

// ── Cap + flag gate (T2-3) ────────────────────────────────────────────────────
// The shared-shape gate helpers. Food's free caps are daily 15 / monthly 60 (§4.4).

const FOOD_CAPS: FunctionCaps = { daily: 15, monthly: 60 }

Deno.test('resolveGateState — flag off short-circuits to feature_disabled (no counts needed)', () => {
  assertEquals(resolveGateState(false, null, FOOD_CAPS), { allow: false, reason: 'feature_disabled' })
  // Even if counts happen to be present, flag-off wins.
  assertEquals(resolveGateState(false, { dayCount: 1, monthCount: 1 }, FOOD_CAPS), {
    allow: false, reason: 'feature_disabled',
  })
})

Deno.test('resolveGateState — flag on, null counts (RPC error / fail-open) → allow', () => {
  assertEquals(resolveGateState(true, null, FOOD_CAPS), { allow: true })
})

Deno.test('resolveGateState — the cap-th call proceeds, the (cap+1)-th is blocked (increment-then-return)', () => {
  // record_ai_usage increments THEN returns: the 15th call of the day returns
  // dayCount=15 and must proceed; the 16th returns 16 and is blocked.
  assertEquals(resolveGateState(true, { dayCount: 15, monthCount: 20 }, FOOD_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 16, monthCount: 20 }, FOOD_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
})

Deno.test('resolveGateState — daily is checked before monthly', () => {
  // Both over: daily wins (the sooner-resetting, more actionable message).
  assertEquals(resolveGateState(true, { dayCount: 16, monthCount: 61 }, FOOD_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
  // Only monthly over (day under): monthly.
  assertEquals(resolveGateState(true, { dayCount: 3, monthCount: 61 }, FOOD_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'monthly',
  })
})

Deno.test('resolveFlagValue — only a real boolean overrides the fallback', () => {
  assertStrictEquals(resolveFlagValue(true, true), true)
  assertStrictEquals(resolveFlagValue(false, true), false)
  // Missing / wrong-typed JSONB → fail to the fallback (fail-open for AI keys).
  assertStrictEquals(resolveFlagValue(undefined, true), true)
  assertStrictEquals(resolveFlagValue(null, true), true)
  assertStrictEquals(resolveFlagValue('true', true), true)
  assertStrictEquals(resolveFlagValue(1, false), false)
})

Deno.test('resolveCaps — empty / missing / malformed override keeps code defaults', () => {
  assertEquals(resolveCaps({}, 'extract_food', FOOD_CAPS), FOOD_CAPS)
  assertEquals(resolveCaps(null, 'extract_food', FOOD_CAPS), FOOD_CAPS)
  assertEquals(resolveCaps({ extract_food: {} }, 'extract_food', FOOD_CAPS), FOOD_CAPS)
  assertEquals(resolveCaps({ other_fn: { daily: 1 } }, 'extract_food', FOOD_CAPS), FOOD_CAPS)
  // A partial override fills only the present field, keeping the other default.
  assertEquals(resolveCaps({ extract_food: { daily: 5 } }, 'extract_food', FOOD_CAPS), { daily: 5, monthly: 60 })
  assertEquals(resolveCaps({ extract_food: { daily: 5, monthly: 25 } }, 'extract_food', FOOD_CAPS), {
    daily: 5, monthly: 25,
  })
})

Deno.test('computeResetsAt — daily = next UTC midnight, monthly = first of next UTC month', () => {
  const mid = Date.parse('2026-07-14T15:30:00Z')
  assertStrictEquals(computeResetsAt('daily', mid), '2026-07-15T00:00:00.000Z')
  assertStrictEquals(computeResetsAt('monthly', mid), '2026-08-01T00:00:00.000Z')
  // Year/month rollover.
  const dec = Date.parse('2026-12-31T23:59:00Z')
  assertStrictEquals(computeResetsAt('daily', dec), '2027-01-01T00:00:00.000Z')
  assertStrictEquals(computeResetsAt('monthly', dec), '2027-01-01T00:00:00.000Z')
})

Deno.test('validateFoodPhotoPaths — the real client shape passes; a cross-food / traversal path is rejected', () => {
  const foodId = 'abc-123'
  // Real client: `${foodId}/${slot}.jpg`.
  assertStrictEquals(validateFoodPhotoPaths(foodId, [`${foodId}/0-front.jpg`, `${foodId}/1-ingredients.jpg`]), true)
  // A different food's photos — rejected (can't point the extractor elsewhere).
  assertStrictEquals(validateFoodPhotoPaths(foodId, [`other-food/0-front.jpg`]), false)
  // Traversal / absolute — rejected.
  assertStrictEquals(validateFoodPhotoPaths(foodId, [`${foodId}/../secret.jpg`]), false)
  assertStrictEquals(validateFoodPhotoPaths(foodId, [`/etc/passwd`]), false)
  // A single bad path in an otherwise-valid set fails the whole set.
  assertStrictEquals(validateFoodPhotoPaths(foodId, [`${foodId}/0.jpg`, `evil/1.jpg`]), false)
})

// ── resolveFoodOwnership (FR-6 / B-354 PR 3, closes B-343 server half) ─────────
// The service-role write bypasses RLS, so this is the ownership boundary. It must
// allow ONLY a row whose created_by_user_id equals the JWT-verified caller uid,
// and fail closed on everything else (missing row, foreign row, null creator).

const UID_A = '11111111-1111-1111-1111-111111111111'
const UID_B = '22222222-2222-2222-2222-222222222222'

Deno.test('resolveFoodOwnership — caller owns the row → ok', () => {
  assertEquals(resolveFoodOwnership({ created_by_user_id: UID_A }, UID_A), { ok: true })
})

Deno.test('resolveFoodOwnership — another account\'s row → forbidden (B-343 server half)', () => {
  // The whole point: account B cannot drive extraction against account A's food.
  assertEquals(resolveFoodOwnership({ created_by_user_id: UID_A }, UID_B), {
    ok: false, reason: 'forbidden',
  })
})

Deno.test('resolveFoodOwnership — no row for the id → not_found', () => {
  assertEquals(resolveFoodOwnership(null, UID_A), { ok: false, reason: 'not_found' })
})

Deno.test('resolveFoodOwnership — a null/blank creator is never treated as owned (fail closed)', () => {
  // created_by_user_id is NOT NULL post-033, but a defensive read must still
  // refuse rather than let a caller claim an unowned row.
  assertEquals(resolveFoodOwnership({ created_by_user_id: null }, UID_A), {
    ok: false, reason: 'forbidden',
  })
  assertEquals(resolveFoodOwnership({ created_by_user_id: '' }, UID_A), {
    ok: false, reason: 'forbidden',
  })
})

// ── mapFormatToDb ─────────────────────────────────────────────────────────────

Deno.test('mapFormatToDb — translates AI enum to food_format', () => {
  assertStrictEquals(mapFormatToDb('dry'), 'dry_kibble')
  assertStrictEquals(mapFormatToDb('wet'), 'wet_canned')
  assertStrictEquals(mapFormatToDb('treats'), 'treat')
  assertStrictEquals(mapFormatToDb('supplement'), 'topper')
  assertStrictEquals(mapFormatToDb('jerky'), 'jerky')
  assertStrictEquals(mapFormatToDb('raw'), 'raw')
  assertStrictEquals(mapFormatToDb('human_food'), 'human_food') // B-102 PR 3
  assertStrictEquals(mapFormatToDb('other'), 'other')
})

Deno.test('mapFormatToDb — null in, null out', () => {
  assertStrictEquals(mapFormatToDb(null), null)
})

Deno.test('mapFormatToDb — unknown value falls back to other', () => {
  assertStrictEquals(mapFormatToDb('hallucinated_format'), 'other')
})

Deno.test('FORMAT_ENUM — advertises human_food to the vision model (B-102 PR 3)', () => {
  // Without this, a snapped people-food container (deli meat, rotisserie
  // chicken) can only come back as 'other' — the gap PR 3 closes.
  assertEquals(FORMAT_ENUM.includes('human_food'), true)
})

Deno.test('mapFormatToDb — every advertised format maps to a real DB enum (no silent drift)', () => {
  // Guards the jerky-class drift (B-024 → B-103): a value added to the tool
  // enum without a matching AI_FORMAT_TO_DB entry would silently fall back to
  // 'other'. Only 'other' itself is allowed to map to 'other'.
  for (const v of FORMAT_ENUM) {
    if (v === 'other') {
      assertStrictEquals(mapFormatToDb(v), 'other')
    } else {
      assertNotStrictEquals(mapFormatToDb(v), 'other')
    }
  }
})

// ── normaliseConfidence ───────────────────────────────────────────────────────

Deno.test('normaliseConfidence — fills missing fields with 0', () => {
  const result = normaliseConfidence({})
  assertEquals(result, {
    brand: 0,
    product_name: 0,
    format: 0,
    proteins: 0,
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
    proteins: 0.66,
    primary_protein: 0.9,
    is_grain_free: 0.7,
    is_prescription: 1.0,
    ingredients_text: 0.71,
    upc_barcode: 0.0,
  })
  assertStrictEquals(result.brand, 0.98)
  assertStrictEquals(result.proteins, 0.66)
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

Deno.test('human_food round-trips from tool output to the DB enum (B-102 PR 3)', () => {
  // The hero example from docs/human-food-format-requirements.md: a Costco
  // rotisserie chicken container, snapped, must land as format='human_food'
  // (not 'other') so the vet report + engine can see off-commercial-diet days.
  const response = makeToolUseResponse({
    brand: 'Costco',
    product_name: 'Rotisserie Chicken',
    format: 'human_food',
    confidence: { brand: 0.9, product_name: 0.9, format: 0.8 },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertStrictEquals(result.format, 'human_food')
  assertStrictEquals(mapFormatToDb(result.format), 'human_food')
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

// ── Multi-protein extraction (B-351 Phase A PR 2, absorbs B-048) ──────────────
// The write-path normalization lives in lib/protein.ts (shared, dependency-free,
// inlined into this function's deploy bundle). These tests pin the properties the
// clinical surfaces downstream depend on: the set is complete (a hidden secondary
// is never dropped — the elimination-trial failure mode), primary_protein is
// proteins[0] by construction, and nothing junk or unbounded reaches the column.

Deno.test('normalizeExtractedProtein — strips sourcing descriptors to the bare animal', () => {
  assertStrictEquals(normalizeExtractedProtein('Deboned Chicken'), 'chicken')
  assertStrictEquals(normalizeExtractedProtein('Fresh Salmon'), 'salmon')
  assertStrictEquals(normalizeExtractedProtein('cage-free turkey'), 'turkey')
  // Stacked descriptors reduce to a fixpoint.
  assertStrictEquals(normalizeExtractedProtein('fresh deboned chicken'), 'chicken')
  // A descriptor strip that exposes a form-qualifier is picked up in the same loop.
  assertStrictEquals(normalizeExtractedProtein('Dried Chicken By-Product Meal'), 'chicken')
})

Deno.test('normalizeExtractedProtein — tissue terms fold into their species', () => {
  // A species-elimination trial excludes every tissue from that animal, so
  // "chicken liver" and "chicken" must not rank as two proteins.
  assertStrictEquals(normalizeExtractedProtein('Chicken Liver'), 'chicken')
  assertStrictEquals(normalizeExtractedProtein('beef hearts'), 'beef')
  assertStrictEquals(normalizeExtractedProtein('Turkey Giblets'), 'turkey')
  // A word that merely ENDS in a tissue term is untouched.
  assertStrictEquals(normalizeExtractedProtein('backbone'), 'backbone')
})

Deno.test('normalizeExtractedProtein — the tissue strip fires ONLY when a known species remains', () => {
  // Both of these were live defects the adversarial pass found, with real
  // products behind them. The rule is the alias table's: merge only where sure.

  // "Green Tripe" is a mainstream raw-feeding product — stripping blindly
  // produced the garbage key `green`, which would reach the Patterns
  // top-protein card and the vet report's protein-exposure section.
  assertStrictEquals(normalizeExtractedProtein('Green Tripe'), 'green tripe')

  // A single-ingredient "Liver Treats" pack: stripping to empty read as
  // protein-unknown and DROPPED an exposure the pre-B-351 path captured as
  // `liver`. A sensitivity regression is the one direction the wedge can't
  // afford — vaguer is fine, missing is not.
  assertStrictEquals(normalizeExtractedProtein('liver'), 'liver')
  assertStrictEquals(normalizeExtractedProtein('Tripe'), 'tripe')

  // An unrecognised species keeps its whole value rather than inventing a head.
  assertStrictEquals(normalizeExtractedProtein('alpaca liver'), 'alpaca liver')

  // The check reads the LAST token, so a qualified species still folds — and
  // the hydrolysis qualifier survives it.
  assertStrictEquals(normalizeExtractedProtein('hydrolyzed chicken liver'), 'hydrolyzed chicken')
})

Deno.test('normalizeExtractedProtein — the alias lookup cannot reach the prototype chain', () => {
  // A bare EXTRACTION_PROTEIN_ALIASES[v] returned the `Object` FUNCTION for the
  // literal token "constructor". It survived into the returned string[], and
  // JSON.stringify then rendered proteins as [null] AND dropped primary_protein
  // from the update payload entirely (functions are omitted) — so the column
  // kept a stale value while the derived-pair guarantee silently broke.
  // Reachable via a photographed label / prompt injection, not spontaneously.
  const key = normalizeExtractedProtein('constructor')
  assertStrictEquals(typeof key, 'string')
  assertStrictEquals(key, 'constructor')
  const set = deriveProteinSet(['constructor', 'valueOf', 'toString'], 'constructor')
  for (const p of set) assertStrictEquals(typeof p, 'string')
  // And it must survive the wire as a real TEXT[] — never [null].
  assertEquals(JSON.parse(JSON.stringify({ proteins: set })), { proteins: set })
})

Deno.test('normalizeExtractedProtein — the bounded B-048 alias table (write path only)', () => {
  assertStrictEquals(normalizeExtractedProtein('Ocean Whitefish'), 'whitefish')
  // 'white fish' is deliberately NOT aliased — see the table's note (vague -> specific).
  assertStrictEquals(normalizeExtractedProtein('white fish'), 'white fish')
  assertStrictEquals(normalizeExtractedProtein('Dried Egg Product'), 'egg')
  assertStrictEquals(normalizeExtractedProtein('Buffalo'), 'bison')
  // Exact-match only: a genuinely different animal is NOT caught by the alias.
  assertStrictEquals(normalizeExtractedProtein('water buffalo'), 'water buffalo')
  // Deliberately absent: "poultry" may be chicken OR turkey — collapsing it
  // would fabricate a specific exposure a vet would act on.
  assertStrictEquals(normalizeExtractedProtein('poultry'), 'poultry')
})

Deno.test('normalizeExtractedProtein — hydrolyzed is never merged into the intact protein', () => {
  // The entire premise of a hydrolyzed prescription diet: it is a clinically
  // DIFFERENT exposure. Merging it would tell a vet the pet ate soy/chicken.
  assertStrictEquals(normalizeExtractedProtein('Hydrolyzed Soy Protein'), 'hydrolyzed soy protein')
  assertStrictEquals(normalizeExtractedProtein('hydrolyzed chicken liver'), 'hydrolyzed chicken')
})

Deno.test('normalizeExtractedProtein — junk in, protein-unknown out (never a junk key)', () => {
  // A junk key would pad the Signal's Bonferroni family and tighten the bar
  // against every REAL protein the pet eats. Note what is NOT on this list:
  // `liver` and `tripe` are vague, not junk — they name a real exposure with an
  // unknown species, and dropping them loses data (see the tissue-strip test).
  for (const junk of ['', '   ', 'null', 'unknown', 'N/A', 'meal', 'fresh']) {
    assertStrictEquals(normalizeExtractedProtein(junk), null)
  }
  assertStrictEquals(normalizeExtractedProtein(null), null)
  assertStrictEquals(normalizeExtractedProtein(undefined), null)
})

Deno.test('normalizeExtractedProtein — idempotent, and every output is canonicalize-STABLE', () => {
  // Stability is the load-bearing property: the stored key is re-canonicalized on
  // every ranking/correlation READ, so an unstable write would re-key later and
  // fragment the same protein across two keys.
  for (const raw of ['Deboned Chicken', 'Ocean Whitefish', 'Chicken Liver', 'Dried Egg Product', 'Buffalo', 'Hydrolyzed Soy Protein']) {
    const once = normalizeExtractedProtein(raw)
    assertStrictEquals(normalizeExtractedProtein(once), once)
    assertStrictEquals(canonicalizeProtein(once), once)
  }
})

Deno.test('deriveProteinSet — captures the hidden secondary (the trial-contaminant case)', () => {
  // The textbook failure: a "duck" novel-protein food that also lists chicken
  // by-product meal. Before B-351 the chicken was invisible to every surface.
  const set = deriveProteinSet(['Duck', 'Duck Meal', 'Chicken By-Product Meal'], 'duck')
  assertEquals(set, ['duck', 'chicken'])
})

Deno.test('deriveProteinSet — the marketing primary is hoisted to [0], panel order follows', () => {
  // A "duck formula" whose panel lists chicken FIRST. proteins[0] is also the
  // derived primary_protein, and §6/D8 defines that as what the food is sold as —
  // so ordering by the panel alone would make the §8 contaminant check compare
  // against chicken, i.e. call the trial protein the contaminant.
  assertEquals(deriveProteinSet(['chicken', 'duck', 'salmon'], 'duck'), ['duck', 'chicken', 'salmon'])
})

Deno.test('deriveProteinSet — dedupes on the canonical key, keeping prominence order', () => {
  assertEquals(
    deriveProteinSet(['Chicken', 'chicken meal', 'CHICKEN BY-PRODUCT MEAL', 'Salmon'], 'chicken'),
    ['chicken', 'salmon'],
  )
})

Deno.test('deriveProteinSet — a primary absent from the array is still captured (no regression)', () => {
  // A hydrolyzed prescription diet has no animal protein to list on the panel.
  // Pre-B-351 the row captured "hydrolyzed soy protein"; hoisting the primary
  // means the set is strictly additive over that behaviour, never lossy.
  assertEquals(deriveProteinSet([], 'Hydrolyzed Soy Protein'), ['hydrolyzed soy protein'])
  assertEquals(deriveProteinSet(['rice'], null), ['rice'])
})

Deno.test('deriveProteinSet — malformed model output degrades to protein-unknown, never throws', () => {
  // Raw model output: the tool schema is not a guarantee. Every one of these must
  // land as "we don't know", which is what the column default already says.
  assertEquals(deriveProteinSet(undefined, undefined), [])
  assertEquals(deriveProteinSet(null, null), [])
  assertEquals(deriveProteinSet('chicken', null), [])       // a string, not an array
  assertEquals(deriveProteinSet({ 0: 'chicken' }, null), []) // array-like object
  assertEquals(deriveProteinSet([42, null, { a: 1 }], null), [])
  // Junk elements are dropped without taking the real ones with them.
  assertEquals(deriveProteinSet(['null', 'Chicken', '', 'unknown'], null), ['chicken'])
})

Deno.test('deriveProteinSet — a REAL long panel is captured whole, not truncated', () => {
  // The counterexample that moved the cap from 8 to 24: a 14-ingredient raw
  // grind. At 8 this silently dropped rabbit and venison — the two most likely
  // novel-protein trial targets — and in the mirror case would truncate away a
  // contaminant sitting 9th on the panel, which is the exact failure B-351
  // exists to stop. Family-size control belongs to Phase B's candidate set, not
  // to the record.
  const rawGrind = [
    'beef', 'beef liver', 'beef heart', 'beef tripe', 'lamb', 'lamb liver',
    'salmon', 'herring', 'duck', 'turkey', 'chicken', 'egg', 'rabbit', 'venison',
  ]
  const set = deriveProteinSet(rawGrind, 'beef')
  assertEquals(set, ['beef', 'lamb', 'salmon', 'herring', 'duck', 'turkey', 'chicken', 'egg', 'rabbit', 'venison'])
})

Deno.test('deriveProteinSet — still caps a pathological set, dropping the LEAST prominent first', () => {
  // The cap survives as a hallucination guard: prominence-ordered, so the
  // primary is always the last thing standing.
  const soup = Array.from({ length: 40 }, (_, i) => `protein${i}`)
  const set = deriveProteinSet(soup, 'venison')
  assertStrictEquals(set.length, MAX_CAPTURED_PROTEINS)
  assertStrictEquals(set[0], 'venison')
  assertEquals(set.includes('protein39'), false)
})

Deno.test('parseToolResult — proteins land ordered, and primary_protein IS proteins[0]', () => {
  const response = makeToolUseResponse({
    brand: 'Zignature',
    product_name: 'Duck Formula',
    format: 'dry',
    primary_protein: 'Duck',
    proteins: ['Duck', 'Duck Meal', 'Chicken By-Product Meal'],
    ingredients_text: 'Duck, Duck Meal, Chickpeas, Chicken By-Product Meal...',
    confidence: { brand: 0.99, product_name: 0.97, proteins: 0.8, primary_protein: 0.9 },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertEquals(result.proteins, ['duck', 'chicken'])
  // The pair can never drift — primary_protein is derived, not separately parsed.
  assertStrictEquals(result.primary_protein, result.proteins[0])
  assertStrictEquals(result.primary_protein, 'duck')
  assertStrictEquals(result.confidence.proteins, 0.8)
})

Deno.test('parseToolResult — a protein-unknown read writes [] + null, not a junk key', () => {
  const response = makeToolUseResponse({
    brand: 'Purina Pro Plan',
    product_name: 'Sensitive Skin & Stomach',
    confidence: { brand: 0.98, product_name: 0.96 },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertEquals(result.proteins, [])
  assertStrictEquals(result.primary_protein, null)
  assertStrictEquals(result.confidence.proteins, 0)
})

Deno.test('parseToolResult — a legacy-shaped response (no proteins key) still captures the primary', () => {
  // Belt-and-braces for a model that ignores the new array: the primary is
  // hoisted, so this function never captures LESS than it did before PR 2.
  const response = makeToolUseResponse({
    brand: 'Royal Canin',
    product_name: 'Hydrolyzed Protein Adult HP',
    primary_protein: 'hydrolyzed soy protein',
    confidence: { brand: 0.99, product_name: 0.97, primary_protein: 0.92 },
  })

  const result = parseToolResult(response) as ExtractionResult
  assertEquals(result.proteins, ['hydrolyzed soy protein'])
  assertStrictEquals(result.primary_protein, 'hydrolyzed soy protein')
})

// ── bytesToBase64 (B-204) ─────────────────────────────────────────────────────
// The chunked encoder that replaced the rope-building btoa(Array.from(...)) whose
// ~250 MB blowup on a multi-MB image hard-killed the worker with a 546 (the same
// OOM that hit analyze-vomit, PR #255). These pin that it is byte-correct —
// including ACROSS the 32 KB chunk boundary, the one place a chunked encoder can
// go wrong — using deno-std encodeBase64 as the oracle.

Deno.test('bytesToBase64 — empty input', () => {
  assertStrictEquals(bytesToBase64(new Uint8Array([])), '')
})

Deno.test('bytesToBase64 — known vectors incl. 1- and 2-byte padding', () => {
  const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s))
  assertStrictEquals(enc('Man'), 'TWFu')      // no padding
  assertStrictEquals(enc('Ma'), 'TWE=')       // one '='
  assertStrictEquals(enc('M'), 'TQ==')        // two '='
  assertStrictEquals(enc('hello world'), 'aGVsbG8gd29ybGQ=')
})

Deno.test('bytesToBase64 — all 256 byte values match std', () => {
  const bytes = new Uint8Array(256)
  for (let i = 0; i < 256; i++) bytes[i] = i
  assertStrictEquals(bytesToBase64(bytes), encodeBase64(bytes))
})

Deno.test('bytesToBase64 — matches std across the 32 KB chunk boundary', () => {
  // ~100 KB of deterministic pseudo-random bytes spans several 32 KB windows, so
  // any off-by-one at a chunk seam (the classic chunked-encoder bug) shows up.
  const n = 100_003 // deliberately not a multiple of 3 or 0x8000
  const bytes = new Uint8Array(n)
  let x = 0x9e3779b9
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    bytes[i] = x & 0xff
  }
  assertStrictEquals(bytesToBase64(bytes), encodeBase64(bytes))
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
