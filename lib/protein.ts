// Protein-key canonicalization (B-052) — the SHARED single source of truth.
//
// This module is the one canonical implementation, imported by BOTH:
//   • the client analytics aggregate layer (lib/analytics.ts — top-protein ranking,
//     B-023 PR 1), and
//   • the AI-Signal Edge Function's case-crossover detector
//     (supabase/functions/generate-signal/detection.ts, via a thin re-export in
//     that folder's protein.ts).
// It was ported out of the Edge Function (where it originally lived) so a single
// implementation governs how a protein name is keyed everywhere — the dashboard's
// "top protein" and the Signal's correlation key must agree, or the two surfaces
// would rank/pool proteins differently. It is intentionally DEPENDENCY-FREE so the
// same file is importable from the RN/Metro client (no extension) and from Deno
// (with the `.ts` extension) without any runtime-specific code.
//
// ⚠️ COUPLING: the Edge Function re-exports this by relative path
// (supabase/functions/generate-signal/protein.ts → ../../../lib/protein.ts), which
// Deno resolves at dev time and esbuild inlines into the deploy bundle. Do NOT
// rename or move this file without updating that re-export, or the Edge Function
// (and its deno tests) will fail to resolve the import.
//
// Why it exists: real `food_items.primary_protein` values are dirty and fragmented:
// `chicken`, `Chicken`, `Chicken By-Product Meal`, `chicken by-product meal`, and
// the literal string `"null"` are all stored for what is, for ranking/correlation
// purposes, one protein. Keying off the raw value splits a single real protein
// across several keys → a true association is HARDER to surface in the Signal, and
// the dashboard's "top protein" would fragment the same animal across rows.
//
// Scope is deliberately NARROW (PM decision 2026-06-07): qualifier-strip + junk-drop
// only. It does NOT map species synonyms (`ocean whitefish` → `whitefish`, etc.) —
// that is B-048's ingredient-canonicalization lane and is judgement-heavy enough to
// risk wrong merges. A pure module (no I/O), unit-tested in
// supabase/functions/generate-signal/protein.test.ts (deno) — kept green by the
// re-export — and exercised again client-side in lib/analytics.test.ts.

// The closed set offered by the manual "Primary protein" picker (B-332 /
// monetization spec §9 T3-A, sub-decision S5). Derived from the live
// `food_items.primary_protein` distinct values plus the common clinical protein
// set a diet-trial owner reaches for. Every value is canonicalizeProtein-STABLE
// (canonicalize(v) === v) and non-junk, so an owner-picked chip keys IDENTICALLY
// to an AI-extracted value — both enter ranking/correlation through the same
// canonicalizeProtein() below and can never fragment. Rarer or compound proteins
// fall to the picker's "Other" typed escape, which also runs through
// canonicalizeProtein on read: the set is a convenience, never a limit. Stored
// lowercase (matching how extraction writes "chicken"/"salmon"); the picker
// Title-cases for display only. Ordered common-first, then the fish group, then
// the novel-diet tail — the order the picker renders them in.
export const COMMON_PROTEINS: readonly string[] = [
  'chicken',
  'turkey',
  'duck',
  'beef',
  'lamb',
  'pork',
  'salmon',
  'tuna',
  'whitefish',
  'rabbit',
  'venison',
];

// Sentinel / placeholder strings that are not a real protein. A meal whose
// protein canonicalizes to one of these is treated as protein-unknown (returns
// null) and excluded from ranking/correlation — never carried as a junk protein
// key, which would also pad the Bonferroni family size and tighten the bar against
// every real protein in the Signal.
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
 * Canonicalize a raw protein string to a stable ranking/correlation key, or null
 * when it carries no usable protein. Pure and idempotent: canonicalize(canonicalize(x))
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
