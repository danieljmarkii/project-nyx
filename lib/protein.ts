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
// (canonicalize(v) === v) and non-junk, so an owner-picked CHIP keys IDENTICALLY
// to an AI-extracted value — both enter ranking/correlation through the same
// canonicalizeProtein() below and can never fragment. Rarer or compound proteins
// fall to the picker's "Other" typed escape, which also runs through
// canonicalizeProtein on read: the set is a convenience, never a limit.
//
// ⚠️ The parity claim above covers the CHIPS, and no longer covers the "Other"
// typed escape (B-351 PR 2, caught by the adversarial pass — B-412). Extraction
// now applies normalizeExtractedProtein at write time, so AI-captured "Buffalo"
// stores `bison`, while an owner typing "Buffalo" into Other still stores
// `buffalo` — one animal, two keys, exposure split across them and each under
// the effective-n floor. Every chip is unaffected (no chip is aliased or
// stripped, locked by a test). Closing it is a PRODUCT decision, not a silent
// normalizer change — does the app rewrite what the owner typed? — and it is
// PR 3's to make, since PR 3 owns the picker. Stored
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

// ── proteins cache-column shape (B-351 Phase A, PR 1) ──────────────────────────
// The server's `food_items.proteins TEXT[]` (migration 039) mirrors into the
// SQLite `food_items_cache.proteins` column as a JSON-array string — SQLite has
// no array type, and a JSON string round-trips through the existing TEXT-column
// sync plumbing with zero schema machinery. These two helpers are the ONLY
// sanctioned way across that boundary, so every reader/writer agrees on one
// encoding (they live here, next to the keying they carry, and stay
// dependency-free for the same client/Deno dual-import reason as the rest of
// this module).
//
// Column semantics: NULL = not yet hydrated (a legacy cache row that predates
// the column — unknown, reads as []); '[]' = KNOWN-empty (the server said this
// food has no captured proteins). The distinction only matters to the writer —
// readers treat both as "no exposure to count".

/** Serialize a server `proteins` value for the food_items_cache TEXT column.
 *  Tolerant of the untyped PostgREST payload: a non-array (missing column on a
 *  skewed client, unexpected shape) serializes to null (= unknown) rather than
 *  inventing a known-empty set; non-string elements are dropped. */
export function proteinsToCacheText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return JSON.stringify(value.filter((p): p is string => typeof p === 'string'));
}

/** Parse a food_items_cache `proteins` TEXT value back to the ordered key array.
 *  Never throws: NULL, malformed JSON, or a non-array all read as [] — a cache
 *  decode failure must degrade to "protein-unknown", never crash a read path or
 *  fabricate an exposure. Non-string elements are dropped. */
export function proteinsFromCacheText(text: string | null | undefined): string[] {
  if (text == null) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

// ── Extraction-time normalization (B-048, absorbed by B-351 §5/D3) ────────────
// Everything below runs ONLY on the WRITE path of an AI extraction
// (extract-food-from-photo), never on read. That boundary is the whole point of
// the B-052 §29 scope note: canonicalizeProtein above is deliberately narrow
// (qualifier-strip + junk-drop) because it runs over ALREADY-STORED values on
// every ranking/correlation read, where a wrong merge would silently pool two
// distinct animals across the entire history with no way for an owner to see or
// undo it. The judgement-heavy synonym mapping B-048 contemplated ("ocean
// whitefish" → "whitefish") is safe HERE and only here: it is applied once, at
// capture, to a value the owner then sees and can correct on the confirm screen.
//
// ⚠️ Never call normalizeExtractedProtein / deriveProteinSet from a read path,
// and never widen canonicalizeProtein with these rules — that would re-merge
// stored keys retroactively, which D3 explicitly does not sanction.

// Leading descriptors that qualify the SOURCING or STATE of a protein, not the
// animal: "deboned chicken", "fresh salmon", and "chicken" are one exposure.
// Stripped to a fixpoint so stacked descriptors ("fresh deboned chicken")
// reduce. `hydrolyzed` is deliberately ABSENT — a hydrolyzed protein is
// clinically a different exposure from the intact protein (that is the entire
// premise of a hydrolyzed prescription diet), so merging them would tell a vet
// the pet ate chicken when it ate hydrolyzed chicken.
// The trailing boundary is `(?:\s+|$)` — a BARE descriptor ("fresh", "raw")
// names no animal, so it strips to empty and reads as protein-unknown rather
// than being stored as its own key.
const LEADING_DESCRIPTOR =
  /^(fresh|frozen|dried|dehydrated|deboned|boneless|whole|raw|real|ground|natural|premium|cage[ -]free|free[ -]range|grass[ -]fed|wild[ -]caught|farm[ -]raised)(?:\s+|$)/;

// Trailing TISSUE terms. "chicken liver", "beef bone", and "chicken" are the
// same species — a species-elimination trial excludes every tissue from that
// animal, so keeping them as separate keys fragments one real exposure (and pads
// the Signal's Bonferroni family). Same `(?:^|\s+)`-anchored shape as
// TRAILING_QUALIFIER, so a word merely ENDING in one ("backbone") is untouched.
// Fats and oils are NOT here: "chicken fat" is not merged into "chicken" (it is a
// different exposure class clinically, and inventing a chicken exposure is the
// unsafe direction); the extraction prompt tells the model not to emit them.
const TRAILING_TISSUE =
  /(?:^|\s+)(livers?|hearts?|gizzards?|giblets?|tripe|kidneys?|cartilage|bones?)$/;

// The strip above only fires when what REMAINS names an animal we recognise.
// Without that gate it did two wrong things (both found by the adversarial pass,
// both with real products behind them):
//   • "Green Tripe" — a mainstream raw-feeding product — became the garbage key
//     `green`, which would reach the Patterns top-protein card and the vet
//     report's protein-exposure section.
//   • a single-ingredient "Liver Treats" pack stripped to empty and read as
//     protein-unknown, DROPPING an exposure the pre-B-351 path captured as
//     `liver`. A sensitivity regression is the one direction the wedge can't
//     afford (§2: capture is the unambiguous win).
// So the rule is now the same one the alias table follows: merge only where we
// are sure, otherwise leave the value alone. A bare `liver` (no species) and an
// unrecognised head both keep their full value — vaguer, but never invented and
// never dropped. Missing a merge for an exotic species is the cheap error.
const TISSUE_STRIP_SPECIES = new Set<string>([
  ...COMMON_PROTEINS,
  'bison', 'goat', 'kangaroo', 'quail', 'pheasant', 'ostrich', 'elk', 'boar',
  'cod', 'herring', 'mackerel', 'sardine', 'pollock', 'trout', 'fish', 'poultry',
]);

function stripTrailingTissue(v: string): string {
  const m = v.match(TRAILING_TISSUE);
  if (!m) return v;
  const remainder = v.slice(0, v.length - m[0].length).trim();
  if (!remainder) return v; // bare tissue word — names no species, keep it whole
  const head = remainder.split(' ').pop() as string;
  // Checks the LAST token so a qualified species still folds:
  // "hydrolyzed chicken liver" → head "chicken" → "hydrolyzed chicken".
  return TISSUE_STRIP_SPECIES.has(head) ? remainder : v;
}

// Exact-match aliases, applied AFTER canonicalization + the strips above (so the
// left-hand side is always a canonical key). EXACT match only — never a substring
// or prefix rule — because "buffalo" → "bison" must not also rewrite "water
// buffalo" (a genuinely different animal). Two rules govern additions:
//   (1) both sides must be the SAME animal or a strictly vaguer label of it —
//       never two species merged for tidiness ("bison"/"beef" stay apart);
//   (2) prefer leaving a value alone over a guessed merge — "poultry" is
//       deliberately absent because it may be chicken OR turkey, and collapsing
//       it to chicken would fabricate a specific exposure a vet would act on.
const EXTRACTION_PROTEIN_ALIASES: Readonly<Record<string, string>> = {
  'ocean whitefish': 'whitefish', // the spec's own B-048 example (§5)
  'ocean fish': 'fish',           // vague label term → the vague key, not a species
  // NOT here: 'white fish' → 'whitefish'. It reads like a spacing variant and
  // was written as one, but it maps VAGUE → SPECIFIC, which is rule (1) backwards:
  // "whitefish" is a specific label term, "white fish" is a generic descriptor for
  // any white-fleshed species (cod, haddock, pollock, tilapia). A cod-based novel-
  // protein diet labelled "white fish" would have been keyed `whitefish` and
  // collided with a real whitefish food in the §8 contaminant check.
  'egg product': 'egg',           // "dried egg product" → (descriptor strip) → egg
  'egg whites': 'egg',            // allergen exposure is to the egg
  'egg white': 'egg',
  buffalo: 'bison',               // US label synonym for the same animal
  deer: 'venison',                // same animal, culinary vs. label naming
};

// Upper bound on a single food's captured protein set — a pure hallucination
// guard, NOT a statistical control.
//
// It was 8, which a real 14-ingredient raw-grind panel (beef, beef liver, lamb,
// salmon, herring, duck, turkey, chicken, egg, rabbit, venison…) blew straight
// through — silently dropping rabbit and venison, i.e. the two most likely
// novel-protein trial targets, and in the mirror case truncating away a
// contaminant sitting 9th on the panel. That is the exact failure B-351 exists
// to stop, and it was buying a Bonferroni-family concern that belongs to Phase B
// (which caps the CANDIDATE FAMILY, §7 #2 — capping the RECORD to pre-pay it
// trades away Job-1 capture, the one thing §2 calls an unambiguous win).
// 24 clears any real panel while still bounding a pathological extraction.
export const MAX_CAPTURED_PROTEINS = 24;

/**
 * Normalize ONE raw protein string from an AI extraction to a canonical key, or
 * null when it carries no usable protein. Extraction write path only (see the
 * boundary note above). Idempotent, like canonicalizeProtein.
 *
 *   "Deboned Chicken"        → "chicken"
 *   "Chicken Liver"          → "chicken"
 *   "Ocean Whitefish"        → "whitefish"
 *   "Dried Egg Product"      → "egg"
 *   "Hydrolyzed Soy Protein" → "hydrolyzed soy protein"  (never merged to soy)
 *   "liver" | "meal" | ""    → null
 */
export function normalizeExtractedProtein(raw: string | null | undefined): string | null {
  let v = canonicalizeProtein(raw);
  if (v == null) return null;

  // Strip descriptors + tissue terms to a joint fixpoint, re-canonicalizing each
  // pass so a strip that exposes a form-qualifier ("fresh chicken liver meal")
  // is picked up by the same loop rather than left behind.
  let prev: string | null;
  do {
    prev = v;
    v = stripTrailingTissue(v.replace(LEADING_DESCRIPTOR, '').trim()).trim();
    v = canonicalizeProtein(v);
    if (v == null) return null;
  } while (v !== prev);

  // hasOwnProperty, not a bare index: a bare `EXTRACTION_PROTEIN_ALIASES[v]`
  // reaches the object literal's PROTOTYPE, so a model that emitted the literal
  // token "constructor" got back the `Object` FUNCTION. It then survived into the
  // returned string[], and JSON.stringify silently rendered it as
  // `{"proteins":[null]}` while DROPPING primary_protein from the update payload
  // entirely (functions are omitted) — so the column would have kept a stale
  // value while "the pair can never drift" quietly stopped being true. Low
  // likelihood, but it is a photographed-label / prompt-injection surface.
  const alias = Object.prototype.hasOwnProperty.call(EXTRACTION_PROTEIN_ALIASES, v)
    ? EXTRACTION_PROTEIN_ALIASES[v]
    : undefined;
  // An alias target is itself canonical + strip-stable by construction (locked by
  // the unit tests), so one hop is enough — no alias chains to resolve.
  return alias ?? v;
}

/**
 * Build the ordered, canonical `food_items.proteins` set from one extraction.
 *
 * `rawPrimary` is HOISTED to position 0 rather than trusting the array's own
 * first element. `proteins` comes back in ingredient-panel order, but
 * `proteins[0]` is also the derived `primary_protein` — and §6/D8 defines that
 * as *what the food is sold as* (and, in a trial, the target protein). Those
 * disagree exactly in the case B-351 exists for: a "duck" formula whose panel
 * lists chicken first. Ordering by the panel alone would demote duck to a
 * secondary and make the §8 contaminant check compare against chicken — i.e.
 * call the trial protein the contaminant. Hoisting keeps `primary_protein`
 * meaning what every existing reader already assumes, and the remaining
 * proteins keep panel prominence order behind it.
 *
 * Hoisting also makes the set STRICTLY additive over today's behaviour: whatever
 * the model returns as `primary_protein` is captured even if it never appears in
 * the `proteins` array (a hydrolyzed-soy prescription diet, where there is no
 * animal protein to list). No food loses protein data it captures today.
 *
 * Returns [] for a protein-unknown food — never a junk key.
 */
export function deriveProteinSet(rawProteins: unknown, rawPrimary: unknown): string[] {
  const listed = Array.isArray(rawProteins) ? rawProteins : [];
  const primary = typeof rawPrimary === 'string' ? rawPrimary : null;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [primary, ...listed]) {
    if (typeof candidate !== 'string') continue;
    const key = normalizeExtractedProtein(candidate);
    // Dedupe on the canonical key, keeping FIRST occurrence — this is what makes
    // the hoist stick when the model lists the primary in the array too. The
    // typeof re-check is belt-and-braces against a non-string ever escaping the
    // normalizer again (see the prototype-chain note there) — nothing but a
    // string may reach a TEXT[] write.
    if (key == null || typeof key !== 'string' || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_CAPTURED_PROTEINS) break;
  }
  return out;
}

/**
 * Canonicalize a raw protein string to a stable ranking/correlation key, or null
 * when it carries no usable protein. Pure and idempotent: canonicalize(canonicalize(x))
 * === canonicalize(x).
 *
 *   "Chicken"                  → "chicken"
 *   "  Chicken  By-Product  Meal " → "chicken"
 *   "Turkey By Product Meal"   → "turkey"
 *   "Chicken Meal"             → "chicken"
 *   "ocean whitefish"          → "ocean whitefish"   (no synonym mapping on READ —
 *                                the B-048 mapping is write-path only, see above)
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
