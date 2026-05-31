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
// ingredients under one key) silently corrupts a clinical correlation and is
// far worse than a missed normalization. So the rules are deliberately narrow
// (these guarantees are pinned by the adversarial-review regression tests):
//
//   (1) lowercase / trim / collapse whitespace + punctuation;
//   (2) strip well-known rendering QUALIFIERS that describe the cut/processing,
//       not the protein identity ('meal', 'by-product', 'fat', …) and the
//       CONNECTIVES that join a blend ('and', '&', 'with') so word-order and
//       connector variants of one label collapse together;
//   (3) reduce to a single token ONLY when exactly one meaningful token remains
//       after stripping — i.e. the qualifier-stripped label IS one word. This
//       is what nails 'chicken by-product meal' → 'chicken' WITHOUT merging
//       'sweet potato' → 'potato' (two meaningful tokens → preserved);
//   (4) any multi-token label (a genuine multi-protein blend, or a protein with
//       a descriptor we won't risk dropping like 'sweet potato') is preserved
//       in full, SORTED, so two distinct ingredients are never collapsed and
//       order variants ('chicken duck' / 'duck chicken') map to one key.
//
// HYDROLYZED is treated as a protein-IDENTITY marker, never stripped: a
// hydrolyzed elimination diet exists precisely because the intact protein
// provokes a reaction and the hydrolysate does not, so 'Hydrolyzed Chicken'
// MUST stay a different key from 'Chicken' or the engine would hide the very
// signal the diet trial was run to find. Both spellings canonicalize to a
// leading 'hydrolyzed ' prefix.

/**
 * Rendering/processing qualifier words (describe HOW a protein appears, not
 * WHICH protein) and blend connectives. Stripped before the single-token
 * reduction so "chicken by-product meal" and "deboned chicken" reduce to
 * "chicken", and so "chicken & duck" / "chicken and duck" / "duck, chicken"
 * all collapse to the same sorted key. NOTE: 'hydrolyzed'/'hydrolysed' are
 * deliberately ABSENT — they mark protein identity (see module header).
 */
const QUALIFIER_TOKENS = new Set([
  // rendering / cut / processing
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
  'flavor',
  'flavour',
  'protein',
  'isolate',
  'concentrate',
  // blend connectives ('&' is already turned into a space by the alnum pass)
  'and',
  'with',
  'plus',
])

const HYDROLYZED_TOKENS = new Set(['hydrolyzed', 'hydrolysed'])

/**
 * Canonicalize a free-text primary-protein label into a single grouping key.
 * Returns null for null/blank input (an unidentified food contributes no
 * protein exposure). See the module header for the why and the conservatism
 * guarantees (never merges two distinct ingredients; keeps hydrolyzed distinct).
 */
export function normalizeProtein(raw: string | null | undefined): string | null {
  if (raw == null) return null

  // Lowercase, replace any non-alphanumeric run (hyphens, slashes, commas,
  // ampersands, extra spaces) with a single space, and trim.
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (base.length === 0) return null

  const tokens = base.split(' ').filter((t) => t.length > 0)

  // Hydrolyzed is an identity marker, not a qualifier — note it, then drop the
  // literal token so it doesn't pollute the protein key; we re-add a canonical
  // 'hydrolyzed ' prefix at the end (also normalizes the -zed/-sed spelling).
  const isHydrolyzed = tokens.some((t) => HYDROLYZED_TOKENS.has(t))

  // Strip qualifiers + connectives + the hydrolyzed token. What's left is the
  // protein identity word(s).
  const meaningful = tokens.filter(
    (t) => !QUALIFIER_TOKENS.has(t) && !HYDROLYZED_TOKENS.has(t),
  )

  // Everything was a qualifier/connective (e.g. "by-product meal") — nothing
  // identity-bearing left. Fall back to the collapsed base so we never return
  // an empty key; better an honest odd value than a silent drop. (Returned
  // WITHOUT the hydrolyzed prefix — a bare "hydrolyzed" carries no protein.)
  if (meaningful.length === 0) return base

  // Reduce to a single token ONLY when the qualifier strip left exactly one —
  // i.e. the label really is one protein word ("chicken by-product meal" →
  // "chicken"). Multi-token labels are preserved in full and SORTED so a
  // genuine blend ("chicken duck") or a compound ingredient ("sweet potato")
  // is never merged into a different key, and word-order variants collapse.
  const key =
    meaningful.length === 1 ? meaningful[0] : [...meaningful].sort().join(' ')

  return isHydrolyzed ? `hydrolyzed ${key}` : key
}
