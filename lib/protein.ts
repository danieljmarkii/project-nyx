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
// ── THE MERGE RULE: Class A vs Class B (PM ruling 2026-07-24, B-414) ──────────
// Two protein values may be merged into one key under two very different
// warrants, and the line between them is a single question: DOES JUSTIFYING THIS
// MERGE REQUIRE KNOWING ANYTHING ABOUT ANIMALS?
//
//   • CLASS A — orthographic / artifact merges. PERMITTED ALWAYS, ON READ,
//     RETROACTIVELY. The same token differing only by a mechanical artifact of
//     capture: casing, padding, boundary punctuation, form-qualifier spellings
//     (`by product`/`byproduct`/`by-product`), and trailing qualifiers that
//     describe PROCESSING rather than the animal. `chicken -`, `Chicken`,
//     `chicken meal`, `chicken by-product meal` are all `chicken`. No clinical
//     judgement is involved, so no merge can pool two species by accident —
//     leaving these split is PURE data loss (the food drops out of every
//     correlation and contaminant check). Fixing one retroactively is expected.
//     Standing guard: a Class-A change re-keys stored data, so pair it with a
//     before/after affected-row count (B-414's own fix: 0 of 59 live rows).
//   • CLASS B — semantic merges. WRITE-PATH ONLY, NEVER RETROACTIVE. Two
//     DIFFERENT tokens asserted to name the same animal, or a strictly vaguer
//     label of it: `buffalo`→`bison`, `ocean whitefish`→`whitefish`,
//     `chicken liver`→`chicken`. These need species knowledge, and a wrong call
//     silently pools two distinct animals across the entire record with nothing
//     an owner could see or undo. They live below the extraction boundary, at
//     capture, where the owner sees the value and can correct it.
//
// This supersedes D3's original blanket "never re-merge already-stored keys",
// which collapsed both classes into one prohibition — and so lent a stray hyphen
// the caution that belongs only to species judgements. D3's real protection
// (Class B) is unchanged. Full ruling: docs/nyx-multi-protein-requirements.md §10 D3.
//
// canonicalizeProtein's scope stays NARROW (PM decision 2026-06-07): Class-A only
// — qualifier-strip, punctuation convergence, junk-drop. It does NOT map species
// synonyms (`ocean whitefish` → `whitefish`, etc.); that is Class B, and lives in
// the extraction write path below. A pure module (no I/O), unit-tested in
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
// ⚠️ The parity claim above covers the CHIPS. It once did NOT cover the "Other"
// typed escape (B-412, caught by PR 2's adversarial pass): extraction applies
// normalizeExtractedProtein at write time, so an AI-captured "Buffalo" stored
// `bison` while an owner typing "Buffalo" into Other stored `buffalo` — one
// animal, two keys, exposure split across them and each under the effective-n
// floor. **CLOSED by PR 3 (D9, PM-ratified 2026-07-24): the typed escape is a
// WRITE path, so it now runs through normalizeExtractedProtein on COMMIT
// (blur/submit, never per keystroke), and the rewrite is disclosed inline in the
// picker rather than applied silently** — see components/food/ProteinPicker.tsx
// and ProteinSetPicker.tsx. Every chip is unaffected (no chip is aliased or
// stripped, locked by a test). Stored
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
// The leading boundary accepts hyphens as well as spaces (`[-\s]+`) so a
// hyphen-joined qualifier ("chicken-meal", "chicken-by-product-meal") strips
// exactly like its spaced form — the same Class-A artifact rule that governs the
// punctuation trim below. `oatmeal` is still untouched (char `t`, no boundary).
const TRAILING_QUALIFIER = /(?:^|[-\s]+)(by-product meal|by-product|meal)$/;

// Boundary punctuation, quotes, and brackets. Applied inside the convergence
// loop in canonicalizeProtein (never once, up front) — see the Class-A note
// there for why running it a single time was a real bug.
const PUNCTUATION_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// Defensive upper bound on a single protein TERM (not an ingredient panel). The
// longest plausible real value is ~35 chars ("hydrolyzed chicken by-product
// meal"), so 120 is ~3× headroom and nothing real trips it — the live library's
// longest value is 22 ("turkey by-product meal"). It exists because the
// convergence loop below is O(n²) in the string length (12 KB → ~244 ms, 48 KB →
// ~3.3 s), bounded today only by `max_tokens` on the vision call. The
// re-derivation backfill contemplated in spec §13 reads `ingredients_notes`
// directly and would NOT respect that ceiling, so the guard belongs here, at the
// entry every path shares, rather than in the backfill that hasn't been written
// yet. Over-length degrades to protein-unknown (null) — never a truncated key,
// which would be an invented protein.
const MAX_PROTEIN_TERM_LENGTH = 120;

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
// and never widen canonicalizeProtein with THESE rules — the synonym table, the
// species-tissue fold, and the descriptor strip are all CLASS B (see the module
// header), so applying them on read would retroactively re-merge stored keys on
// a species judgement, which D3 does not sanction. This is NOT a bar on
// Class-A convergence work inside canonicalizeProtein — punctuation, casing, and
// form-qualifier artifacts are explicitly in scope there and are meant to be
// fixed retroactively (B-414).
//
// Note the picker's "Other" typed escape is a WRITE path, so routing it through
// normalizeExtractedProtein is in-contract, not a violation (B-412).

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

// ── Manual capture — the D8 two-line picker (B-351 Phase A, PR 3) ─────────────
// The picker is two controls over ONE ordered array: "Main protein" is
// proteins[0], "Also contains" is the tail. These two helpers are the whole
// mapping between the stored row and that split, and they live here (not in the
// component) because the seed rule below is a DATA rule with a live-window
// history, not a rendering detail — and because both host screens
// (app/food-capture.tsx, app/food/[id].tsx) need exactly the same answer.

export interface PickerProteins {
  /** The RAW stored `primary_protein`, never rewritten — the picker highlights a
   *  chip by canonicalizing it, exactly as the shipped B-332 control does. */
  main: string | null;
  /** Canonical keys, prominence-ordered, with the main excluded (§6: a protein is
   *  never in both lines). */
  alsoContains: string[];
}

/**
 * Seed the two-line picker from a stored food row.
 *
 * THE SEED RULE (spec §11). `primary_protein` and `proteins` can disagree for
 * rows written in the window between migration 039 going live and this PR — the
 * food screens wrote `primary_protein` alone, leaving `proteins` at the
 * backfilled value. When they disagree **the owner's `primary_protein` wins**
 * and the set is rewritten `[primary, ...rest minus dupes]`: the primary is the
 * field an owner actually chose and the one every existing reader treats as
 * "what the food is sold as" (and, in a trial, the target protein), so a stale
 * array element must never demote it. A live audit found zero rows walked
 * through that window, so this is a guard, not a repair — and it never fires
 * spuriously, because a legacy row's verbatim-dirty primary and its canonical
 * `proteins[0]` are equal UNDER CANONICALIZATION, which is what it compares.
 *
 * A NULL primary means no main is designated — the whole stored set reads as
 * "Also contains". That is the round-trip half of §6's auto-demote rule applied
 * to the clear case: clearing the main demotes it into the tail rather than
 * dropping it, and re-opening the food must not silently promote a secondary
 * back into the main slot.
 */
export function seedPickerProteins(
  rawPrimary: string | null | undefined,
  storedProteins: unknown,
): PickerProteins {
  const listed = Array.isArray(storedProteins) ? storedProteins : [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const p of listed) {
    if (typeof p !== 'string') continue;
    const key = canonicalizeProtein(p);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    rest.push(key);
  }

  const mainKey = canonicalizeProtein(rawPrimary);
  // No usable primary (unset, or a junk placeholder like the literal "null") —
  // no main is designated and the stored set stands as the tail.
  if (mainKey == null) return { main: null, alsoContains: rest };
  return { main: rawPrimary ?? null, alsoContains: rest.filter((p) => p !== mainKey) };
}

/**
 * Flatten the two picker lines back to the ordered `food_items.proteins` array.
 * The main is hoisted to position 0, so `proteins[0]` is the derived
 * `primary_protein` by construction and the pair cannot drift (migration 039's
 * stated contract for this PR).
 *
 * CLASS A ONLY. This canonicalizes; it deliberately does NOT run
 * normalizeExtractedProtein over the set. A seeded value the owner never typed
 * (a legacy `ocean whitefish`, of which the live library has three) would
 * otherwise be re-keyed on a species judgement just because the owner edited
 * some other field on the food — a retroactive CLASS-B merge, which D3a
 * forbids. The typed escape normalizes at the point of typing instead, where
 * the owner sees it (D9); re-deriving stored primaries is spec §11's separate,
 * PM-gated backfill question.
 */
/**
 * The `primary_protein` a save should write for a given picker state.
 *
 * NOT `proteins[0]` — that is the trap. When the owner clears the main while
 * secondaries remain, §6's demote rule moves the old main into the tail, so
 * `proteins[0]` is a *demoted* protein. Writing it as the primary republishes
 * the very designation the owner just cleared, and the next open reseeds it
 * straight back into the main line: the clear silently undoes itself.
 *
 * So a null main writes a NULL primary, and `seedPickerProteins` reads that back
 * as "no main designated" — the two halves of one round-trip. It is the one case
 * where `primary_protein !== proteins[0]`, and it is deliberate: the exposure
 * stays in `proteins` (nothing is lost), while the primary honestly records that
 * the owner named no headline protein.
 *
 * Otherwise the main is canonicalized — a CLASS-A merge, permitted always — so
 * the pair is exactly consistent on every ordinary write.
 */
export function pickerPrimaryProtein(main: string | null): string | null {
  return canonicalizeProtein(main);
}

export function pickerProteinsToSet(
  main: string | null,
  alsoContains: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [main, ...alsoContains]) {
    if (typeof candidate !== 'string') continue;
    const key = canonicalizeProtein(candidate);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_CAPTURED_PROTEINS) break;
  }
  return out;
}

/**
 * Canonicalize a raw protein string to a stable ranking/correlation key, or null
 * when it carries no usable protein. Class-A merges only (module header).
 *
 * Pure and CONVERGENT: canonicalize(canonicalize(x)) === canonicalize(x) for all
 * inputs. That is a hard invariant, not a nicety — every read path canonicalizes
 * independently, so a value that could still re-key on a second pass would let
 * two surfaces disagree about what protein a food is, which is the exact
 * fragmentation this module exists to prevent. Fuzz-tested in protein.test.ts
 * over the full cross-product of casing / padding / boundary punctuation /
 * stacked qualifiers; a fixed example list is NOT sufficient coverage (that is
 * precisely what missed B-414).
 *
 *   "Chicken"                  → "chicken"
 *   "  Chicken  By-Product  Meal " → "chicken"
 *   "Turkey By Product Meal"   → "turkey"
 *   "Chicken Meal"             → "chicken"
 *   "Chicken - Meal"           → "chicken"   (B-414: the qualifier strip exposes
 *                                the hyphen, and the loop cleans it in the same
 *                                pass — this returned "chicken -" before)
 *   "chicken-meal"             → "chicken"   (hyphen-joined qualifier)
 *   <over 120 chars>           → null        (not a protein term; see the guard)
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
  if (v.length > MAX_PROTEIN_TERM_LENGTH) return null;

  // Normalize the spelling of "by product" / "byproduct" → "by-product" so the
  // single qualifier rule below covers all three spellings.
  v = v.replace(/\bby[ -]?product\b/g, 'by-product');

  // Strip boundary punctuation AND trailing form-qualifiers together, to a JOINT
  // fixpoint. Both rules must live inside the same loop, because each one can
  // expose work for the other:
  //   • a stacked qualifier ("chicken meal by-product") needs repeated passes;
  //   • a qualifier strip can EXPOSE punctuation the trim already ran past —
  //     "chicken - meal" → (strip "meal") → "chicken -" → (trim) → "chicken".
  // That second case was a live bug (B-414): the trim ran ONCE, up front, so the
  // function returned the non-key "chicken -" and that food sat outside every
  // correlation, top-protein count, and contaminant check. It is a Class-A
  // (orthographic/artifact) merge — the same token with a capture artifact, no
  // species judgment involved — so converging it is required, not optional; see
  // the Class-A/Class-B note in the module header. The convergence property is
  // fuzz-tested in protein.test.ts, which is what actually keeps this closed: the
  // docstring below already CLAIMED idempotence while the bug was live.
  let prev: string;
  do {
    prev = v;
    v = v.replace(PUNCTUATION_EDGES, '');
    v = v.replace(TRAILING_QUALIFIER, '').trim();
  } while (v !== prev);

  if (PROTEIN_JUNK.has(v) || v.length === 0) return null;
  return v;
}

// ── D10 — the protein-set completeness gate (B-351 Phase A, PR 4; B-413) ──────
//
// THE PROBLEM THIS EXISTS FOR. `proteins` is a bare TEXT[]. A marketing-name-only
// read of the front of a bag yields `['duck']` — a value INDISTINGUISHABLE in the
// column from a set genuinely read off the ingredient panel of a single-protein
// food. Render that plainly and Tier-1 disclosure says "Duck · nothing else" and
// the vet report serves it under "Proteins as read from product labels". On both
// surfaces the ABSENCE of secondaries reads as "clean" when it actually means
// "nobody read the panel" — reassurance-on-absence (`clinical-guardrails`), on
// the surface a vet trusts most.
//
// FOUR PROVENANCES, NOT TWO. The set can arrive from:
//   1. manual capture      — never extracted; `ai_extraction_confidence` is NULL
//   2. failed / capped     — extraction did not run or did not return
//   3. front-of-pack only  — a photo of the bag face; `ingredients_notes` empty,
//                            `confidence.proteins` ≈ 0
//   4. panel-read          — the ingredient panel was photographed AND read
// Only (4) may render as a complete set.
//
// WHY A CONJUNCTION (the PM ruling, D10). Gating on `confidence.proteins` alone
// would trust a model's SELF-REPORT — the least trustworthy field in the payload,
// and the one a hallucinating read inflates. Gating on panel text alone would pass
// a panel that was captured but illegible. Requiring BOTH means the claim
// "complete" rests on one attested artifact (the stored panel text) plus one
// legibility signal, and either failing degrades to the honest "not captured".
//
// SAFE DIRECTION: this predicate under-claims by construction. A manual food
// whose owner typed the full panel AND the full protein set reads as incomplete,
// because nothing in the row attests that the second was derived from the first.
// Under-claiming costs a qualifier the owner does not need; over-claiming tells a
// vet a contaminated food is clean. An explicit provenance column is D10's named
// upgrade (the deferred D4a widening) if this proves too coarse — B-437.
//
// Lives HERE, next to the keying it qualifies, because slice 5's `generate-report`
// must gate on the SAME predicate the client does (§10 D10's consequence: the
// report's food join widens to `proteins, ai_extraction_confidence,
// ingredients_notes`). Two implementations would let the app and the vet report
// disagree about whether a food's set is trustworthy — which is exactly the class
// of split this module exists to prevent. Dependency-free, like everything above.

/** Minimum trimmed length of `ingredients_notes` that counts as a captured panel.
 *  A real AAFCO panel runs to hundreds of characters; the shortest plausible
 *  honest one is a single-ingredient treat ("Chicken breast."). This floor only
 *  rejects a stray fragment ("Ingredients:", "see bag") — it is a junk guard, not
 *  a completeness measure. The confidence arm below is what judges legibility. */
export const MIN_PANEL_TEXT_LENGTH = 12;

/** Minimum `ai_extraction_confidence.proteins` that counts as a read panel.
 *  The model emits 0.0 (not visible / guessed) → 1.0 (clearly legible). 0.5 is the
 *  midpoint: a read the model itself rates as more-likely-guessed-than-read must
 *  not license a completeness claim. Deliberately NOT higher — the conjunction
 *  with captured panel text already carries most of the weight, and pushing the
 *  floor up buys little while silently retiring the Tier-1 education win on
 *  legitimately-read labels. */
export const MIN_PROTEIN_READ_CONFIDENCE = 0.5;

/** Why a set is (in)complete. Carried for tests and for a future surface that
 *  wants to distinguish the causes; every incomplete reason renders the SAME
 *  owner-facing copy today (the owner does not care which arm failed). */
export type ProteinSetProvenance =
  | 'panel_read'      // (4) — the only complete provenance
  | 'no_panel_text'   // (1)/(2)/(3) — nothing substantive in ingredients_notes
  | 'low_confidence'; // panel text present, protein sources not legibly read

export interface ProteinSetCompleteness {
  /** True ONLY for 'panel_read'. Gate every "and nothing else" claim on this. */
  complete: boolean;
  provenance: ProteinSetProvenance;
}

/**
 * Pull `confidence.proteins` out of a raw `ai_extraction_confidence` value.
 *
 * Tolerant by design — the column is untyped jsonb and rows extracted before
 * B-351 PR 2 have no `proteins` key at all. Anything that is not a finite number
 * reads as 0 (= unread), never as "assume it was fine".
 */
export function proteinReadConfidence(raw: unknown): number {
  if (raw == null || typeof raw !== 'object') return 0;
  const v = (raw as Record<string, unknown>).proteins;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// A leading "Ingredients:" label is the panel's HEADING, not its content — and
// "Ingredients:" is itself exactly 12 characters, so without this strip the bare
// heading would clear the length floor on its own and license a completeness
// claim over an empty panel. Stripped before measuring so the floor applies to
// the ingredient list itself.
const PANEL_LABEL_PREFIX = /^\s*ingredients?(\s+list)?\s*[:\-–—]?\s*/i;

/** True when `ingredients_notes` holds a substantive captured panel. */
export function hasCapturedPanelText(notes: string | null | undefined): boolean {
  if (typeof notes !== 'string') return false;
  return notes.replace(PANEL_LABEL_PREFIX, '').trim().length >= MIN_PANEL_TEXT_LENGTH;
}

/**
 * D10's gate: may a surface present this food's `proteins` as the COMPLETE set?
 *
 * `false` does not mean the captured proteins are wrong — they are still real
 * exposures and still feed the contaminant check (which fires on PRESENCE only,
 * so an unknown set yields silence, never an all-clear). It means only that no
 * surface may say "and nothing else".
 */
export function proteinSetCompleteness(
  ingredientsNotes: string | null | undefined,
  extractionConfidence: unknown,
): ProteinSetCompleteness {
  if (!hasCapturedPanelText(ingredientsNotes)) {
    return { complete: false, provenance: 'no_panel_text' };
  }
  if (proteinReadConfidence(extractionConfidence) < MIN_PROTEIN_READ_CONFIDENCE) {
    return { complete: false, provenance: 'low_confidence' };
  }
  return { complete: true, provenance: 'panel_read' };
}
