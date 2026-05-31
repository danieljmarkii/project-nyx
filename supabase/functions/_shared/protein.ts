// Shared protein-name canonicalization (B-052).
//
// `food_items.primary_protein` is a FREE-TEXT field: it is written by the
// `extract-food-from-photo` extractor (verbatim-ish from a label) and,
// historically, by hand. So a single real protein fragments across casing and
// label-rendering variants — 'chicken', 'Chicken', 'Chicken By-Product Meal',
// 'chicken meal', 'Deboned Chicken' — that are four different strings.
//
// The AI Signal case-crossover detector (generate-signal/detection.ts) groups
// exposures by `primaryProtein` with an EXACT key, so those variants split one
// protein across several keys: fewer discordant matched pairs per key, a real
// association harder to surface, and any finding that does fire phrases badly
// ("meals containing Chicken By-Product Meal"). This module is the single
// source of truth that collapses those variants to one canonical token.
//
// It lives in `_shared/` because BOTH functions need the identical mapping and
// must not drift: `extract-food-from-photo` normalizes at WRITE time (fixes the
// data at the source) and `generate-signal/detection.ts` normalizes
// DEFENSIVELY at read time (covers legacy + pre-fix + hand-entered rows). A
// divergent copy in each would re-introduce exactly the fragmentation B-052
// fixes.
//
// DESIGN — conservative on purpose. A wrong MERGE (lumping two distinct real
// proteins under one key) silently corrupts a clinical correlation and is far
// worse than a missed normalization. So this only ever:
//   (1) lowercases / trims / collapses whitespace + punctuation, and
//   (2) strips well-known rendering QUALIFIERS that describe the cut/processing,
//       not the protein identity ('meal', 'by-product', 'fat', 'hydrolyzed', …),
//   (3) reduces to a single KNOWN canonical protein only when exactly one is
//       present after stripping.
// It NEVER merges two different known proteins (a genuine multi-protein label
// such as "chicken & duck" is preserved, just normalized), and an unrecognized
// protein (e.g. "ostrich") falls through to its lowercased/qualifier-stripped
// form rather than being guessed at.

/**
 * Rendering/processing qualifier words that describe HOW a protein appears on a
 * label, not WHICH protein it is. Stripped before matching so "chicken by-product
 * meal" and "deboned chicken" both reduce to "chicken". 'by-product' is handled
 * as its hyphen/space variants via tokenization below.
 */
const QUALIFIER_TOKENS = new Set([
  'meal',
  'by',
  'product',
  'byproduct',
  'fat',
  'oil',
  'broth',
  'digest',
  'dehydrated',
  'dried',
  'deboned',
  'boneless',
  'fresh',
  'ground',
  'whole',
  'real',
  'natural',
  'hydrolyzed',
  'hydrolysed',
  'protein',
  'isolate',
  'concentrate',
  'flavor',
  'flavour',
])

/**
 * Canonical proteins we recognize. Used only for the final single-protein
 * reduction step — an unknown protein still normalizes by casing/qualifier, it
 * just isn't collapsed against this list. Order is irrelevant. Kept deliberately
 * conservative: every entry here is a distinct source that must NEVER be merged
 * with another entry.
 */
const KNOWN_PROTEINS = new Set([
  'chicken',
  'turkey',
  'duck',
  'goose',
  'quail',
  'poultry',
  'beef',
  'lamb',
  'pork',
  'venison',
  'rabbit',
  'bison',
  'goat',
  'kangaroo',
  'salmon',
  'tuna',
  'trout',
  'herring',
  'mackerel',
  'cod',
  'sardine',
  'whitefish',
  'fish',
  'egg',
  'soy',
  'pea',
  'lentil',
  'potato',
  'chickpea',
  'liver',
  'insect',
])

/**
 * Canonicalize a free-text primary-protein label into a single grouping key.
 * Returns null for null/blank input (an unidentified food contributes no
 * protein exposure). See the module header for the why and the conservatism
 * guarantee (never merges two distinct known proteins).
 */
export function normalizeProtein(raw: string | null | undefined): string | null {
  if (raw == null) return null

  // Lowercase, replace any non-alphanumeric run (hyphens, slashes, commas,
  // ampersands, '&', extra spaces) with a single space, and trim.
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (base.length === 0) return null

  const tokens = base.split(' ').filter((t) => t.length > 0)

  // Strip qualifier words. Keep everything else (real protein words + any
  // connective like "and" — preserved so distinct multi-protein labels stay
  // distinct rather than collapsing to one source).
  const meaningful = tokens.filter((t) => !QUALIFIER_TOKENS.has(t))

  // Everything was a qualifier (e.g. "meal", "by-product meal") — nothing
  // identity-bearing left. Fall back to the lowercased/collapsed original so we
  // never return an empty key; better an honest odd value than a silent drop.
  if (meaningful.length === 0) return base

  // Distinct known proteins among the meaningful tokens.
  const knownPresent = Array.from(new Set(meaningful.filter((t) => KNOWN_PROTEINS.has(t))))

  // Exactly one known protein (alongside any filler like "free"/"range") →
  // reduce to it: "free range chicken" / "deboned chicken meal" → "chicken".
  if (knownPresent.length === 1) return knownPresent[0]

  // Zero or multiple known proteins → preserve the qualifier-stripped string.
  // Multiple = a genuine multi-protein label ("chicken duck"); zero = an
  // unrecognized protein. Either way we return a stable, casing/qualifier-
  // normalized key without risking a wrong merge.
  return meaningful.join(' ')
}
