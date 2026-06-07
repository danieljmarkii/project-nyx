// AI Signal — protein-key canonicalization (B-052).
//
// The case-crossover correlation detector (./detection.ts) keys every exposure
// off `MealEvent.primaryProtein`. Real `food_items.primary_protein` values are
// dirty and fragmented: `chicken`, `Chicken`, `Chicken By-Product Meal`,
// `chicken by-product meal`, and the literal string `"null"` are all stored for
// what is, for correlation purposes, one protein. Keying off the raw value splits
// a single real protein across several keys → fewer discordant matched pairs per
// key → a true association is HARDER to surface (it compounds the constant-staple
// washout), and any finding that did fire would phrase badly ("meals containing
// Chicken By-Product Meal").
//
// This is the DEFENSIVE (read-time) half of B-052 — the cheap immediate net that
// cleans existing dirty rows without a backfill. It runs inside detection before
// grouping, so it benefits every historical row the moment it ships. Scope is
// deliberately NARROW (PM decision 2026-06-07): qualifier-strip + junk-drop only.
// It does NOT map species synonyms (`ocean whitefish` → `whitefish`, etc.) — that
// is B-048's ingredient-canonicalization lane and is judgement-heavy enough to
// risk wrong merges. A pure module (no I/O), unit-tested in protein.test.ts.

// Sentinel / placeholder strings that are not a real protein. A meal whose
// protein canonicalizes to one of these is treated as protein-unknown (returns
// null) and excluded from correlation — never carried as a junk protein key,
// which would also pad the Bonferroni family size and tighten the bar against
// every real protein.
const PROTEIN_JUNK = new Set([
  '',
  'null',
  'none',
  'n/a',
  'na',
  'unknown',
  'undefined',
  'unspecified',
]);

// Trailing form-qualifiers that describe the PROCESSING of a protein, not the
// animal. `chicken`, `chicken meal`, and `chicken by-product meal` are the same
// source for an allergen/intolerance association, so the qualifier is stripped.
// Order matters: the longest phrase must be tried first so `by-product meal` is
// removed whole rather than leaving a stray `by-product`. Anchored to the end of
// the string; the leading boundary is `(?:^|\s+)` — start-of-string OR a space —
// so a bare qualifier ("meal", "by-product meal") strips to empty (→ null), while
// a word that merely ENDS in "meal" with no boundary (e.g. "oatmeal", char "t"
// before "meal") is never touched.
const TRAILING_QUALIFIER = /(?:^|\s+)(by-product meal|by-product|meal)$/;

/**
 * Canonicalize a raw protein string to a stable correlation key, or null when it
 * carries no usable protein. Pure and idempotent: canonicalize(canonicalize(x))
 * === canonicalize(x).
 *
 *   "Chicken"                  → "chicken"
 *   "  Chicken  By-Product  Meal " → "chicken"
 *   "Turkey By Product Meal"   → "turkey"
 *   "Chicken Meal"             → "chicken"
 *   "ocean whitefish"          → "ocean whitefish"   (no synonym mapping — B-048)
 *   "null" | "" | "unknown"    → null
 *   "meal"                     → null   (qualifier with no protein left)
 *   null | undefined           → null
 */
export function canonicalizeProtein(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  // Lowercase, trim, collapse internal whitespace runs to single spaces.
  let v = raw.trim().toLowerCase().replace(/\s+/g, ' ');

  // Trim leading/trailing punctuation, quotes, and brackets (e.g. a stray
  // "chicken," or "(chicken)"). A trailing comma/period otherwise blocks the
  // $-anchored qualifier strip below and re-fragments the key ("chicken meal,"
  // would split from both "chicken" and "chicken meal") — the exact starvation
  // B-052 fixes. Internal characters (the hyphen in "by-product") are untouched.
  v = v.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (PROTEIN_JUNK.has(v)) return null;

  // Normalize the spelling of "by product" / "byproduct" → "by-product" so the
  // single qualifier rule below covers all three spellings.
  v = v.replace(/\bby[ -]?product\b/g, 'by-product');

  // Strip trailing form-qualifiers repeatedly until the value is stable, so a
  // stacked qualifier ("chicken meal by-product") fully reduces. Re-check the
  // junk set after stripping in case the qualifier was the only content.
  let prev: string;
  do {
    prev = v;
    v = v.replace(TRAILING_QUALIFIER, '').trim();
  } while (v !== prev);

  if (PROTEIN_JUNK.has(v) || v.length === 0) return null;
  return v;
}
