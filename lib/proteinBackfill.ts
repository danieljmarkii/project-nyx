// Re-derivation of `food_items.proteins` from stored `ingredients_notes` (B-416).
//
// WHY THIS EXISTS. Migration 039 backfilled the NAIVE set — `proteins =
// [canonical(primary_protein)]` — and nothing has been re-extracted since. So on
// live data every row still has |proteins| ≤ 1, including the case B-351 was
// written for: `Tiki Cat after DARK Rabbit & Chicken Liver` is keyed `["rabbit"]`
// while its stored panel reads *"Rabbit, duck, chicken broth, chicken liver,
// chicken heart…"*. A rabbit elimination trial run off this library passes the
// slice-4 contaminant check clean. Slice 5 then renders that set on the vet
// report, so the gap stopped being latent the moment the report shipped.
//
// The panels are ALREADY STORED verbatim (spec §12) — 43 of 62 live rows carry
// one — so this is a text-only pass over data we hold, not a re-photographing
// exercise.
//
// ── THE FOUR PROPERTIES THAT GOVERN EVERY LINE BELOW ──────────────────────────
//  1. ADDITIVE ONLY. The pass may APPEND secondaries. It never removes, reorders,
//     or replaces an element already in `proteins` — including keys a human would
//     call junk (`meat by-products`, `liver`, both live today). Deleting a stored
//     exposure is the one direction the wedge cannot afford, and a backfill is the
//     worst possible place to litigate a value's quality.
//  2. THE PRIMARY IS NEVER RE-RANKED. `primary_protein` stays pinned at
//     `proteins[0]` regardless of where it sits on the panel. §6/D8 defines the
//     primary as *what the food is sold as* (and, in a trial, the target protein);
//     a "duck" formula whose panel lists chicken first must not have duck demoted
//     into a secondary, or the §8 contaminant check compares against chicken and
//     calls the trial's own target the contaminant.
//  3. IDEMPOTENT AND RE-RUNNABLE. plan(plan(row)) === plan(row) for every row —
//     property-tested, not asserted. A backfill that drifts on a second run cannot
//     be safely retried, and this one will be retried (new foods keep arriving).
//  4. NO COMPLETENESS CLAIM IS MANUFACTURED. See the note on D10 at the bottom.
//
// ── THE TWO NON-NEGOTIABLE GUARDS (B-351 slice 5's adversarial pass) ───────────
// This backfill is where a bug that was just fixed in CODE can come back as DATA.
// Slice 5 keyed the vet report's read path Class-A only (`readProteinSet`), which
// is correct *because* migration 039 left `canonicalize(primary_protein) ===
// proteins[0]` on every row. This pass is the thing that can break that.
//
//   GUARD 1 — REWRITE `primary_protein` AND `proteins` ATOMICALLY, in one
//   statement. Re-keying the array while leaving the primary verbatim recreates
//   the exact shipped failure: `primary='Ocean Whitefish'` + `proteins=['whitefish']`
//   makes `readProteinSet` hoist the primary and return
//   `['ocean whitefish','whitefish']`, so page 1 of a WHITEFISH trial announces
//   that whitefish reached the pet. `planRow` therefore returns both columns as
//   one value and the emitted SQL sets both in one UPDATE — the two can never be
//   applied apart.
//
//   GUARD 2 — APPEND SECONDARIES THROUGH `normalizeExtractedProtein`, not
//   `canonicalizeProtein`. This is a WRITE path, so Class B is in-contract here
//   (D3a). Using the read-time key would store `Chicken Liver` as a key distinct
//   from `Chicken` and split one animal into two bands in the vet report's
//   exposure tally. Note this cuts the other way too, which is why dedupe below
//   runs in NORMALIZED space: a panel's "Ocean Whitefish" normalizes to
//   `whitefish`, and appending that next to a stored `ocean whitefish` would
//   manufacture guard 1's bug from the secondary side instead of the primary side.
//
// ── WHY A DETERMINISTIC SCAN AND NOT A RE-RUN OF THE VISION MODEL ─────────────
// The alternative was to re-invoke `extract-food-from-photo`'s model over the
// stored panel text. Rejected: a backfill over clinical data has to be auditable
// row by row before it is applied, and 43 model outputs nobody verified is not
// that. A lexicon scan is a pure function — it is unit-tested, it produces the
// same answer twice, its before/after diff fits on a screen, and it cannot
// hallucinate a protein into a novel-protein trial food. The cost is that it can
// only find animals it knows, which is an UNDER-capture, and under-capture is the
// safe direction: today these foods capture nothing at all.

import {
  COMMON_PROTEINS,
  MAX_CAPTURED_PROTEINS,
  canonicalizeProtein,
  normalizeExtractedProtein,
} from './protein';

// Animal-protein label phrases to scan an ingredient term for.
//
// SCOPE IS DELIBERATELY ANIMAL-ONLY (plus egg). The extractor's prompt also emits
// plant proteins when the label presents them as such ("hydrolyzed soy protein",
// "pea protein"), and that stays correct for the write path. It is deliberately
// NOT reproduced here: the wedge is the elimination / novel-protein trial, and
// adding `pea`/`soy`/`potato protein` to 43 rows at once would rewrite every
// food's rendered set and the vet report's exposure tally on a judgement no spec
// asked for. Under-capturing costs a secondary that was already missing.
//
// Additions are governed by `EXTRACTION_PROTEIN_ALIASES`' rule (1): a phrase must
// name an animal, or be a label term for one. `poultry` and `fish` earn their
// place as genuine VAGUE label terms — a panel that says "Poultry by-Products"
// really does record an unspecified-bird exposure, and blanking it because it is
// imprecise would drop the exposure entirely. They are never mapped to a species
// (the alias table refuses `poultry`→`chicken` for exactly this reason), so they
// stay honestly vague rather than becoming a fabricated specific.
const PROTEIN_LEXICON: readonly string[] = [
  ...COMMON_PROTEINS,
  // Label terms that the write-path normalizer maps onto one of the above. They
  // are listed so the SCAN can see them on a panel; `normalizeExtractedProtein`
  // is what resolves them (guard 2), never a mapping table of our own.
  'ocean whitefish',
  'ocean fish',
  'buffalo',
  'deer',
  // Other species that appear on real pet-food panels.
  'bison', 'goat', 'kangaroo', 'quail', 'pheasant', 'ostrich', 'elk', 'boar',
  'veal', 'mutton', 'guinea fowl',
  'cod', 'herring', 'mackerel', 'sardine', 'sardines', 'pollock', 'trout',
  'tilapia', 'catfish', 'haddock', 'salmon', 'anchovy', 'krill', 'menhaden',
  'shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop',
  // Vague-but-real label terms (see the note above).
  'poultry',
  'fish',
  // Egg is a first-rank food allergen and the extractor already emits it.
  'egg',
];

// Longest phrase first so "ocean whitefish" wins over the "whitefish" inside it —
// JS alternation is leftmost-FIRST, not leftmost-longest, so the sort is what
// makes the multi-word entries reachable at all. Word-boundary anchored on both
// sides, which is what keeps `chickpeas` from matching `chick`, `oatmeal` from
// matching `meal`, and `eggplant` from matching `egg`.
const LEXICON_PATTERN = new RegExp(
  `\\b(${[...PROTEIN_LEXICON]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'g',
);

// An ingredient term matching any of these names a protein-DERIVED substance that
// is not the protein exposure itself. Each one is a real false positive on live
// panels, not a hypothetical:
//
//   • fat / tallow — "chicken fat" appears in Hill's DUCK entrée. Without this,
//     the pass would append `chicken` to a novel-protein trial food and the
//     contaminant check would fire on it. lib/protein.ts already refuses to fold
//     fats into their species for the same reason ("inventing a chicken exposure
//     is the unsafe direction"), and a false alarm on a trial diet is the most
//     expensive false positive this feature can produce.
//   • oil — "salmon oil", "menhaden fish oil", "tuna oil". Same class as fat.
//   • flavor / flavored — "liver flavor", "bacon flavor", "dried chicken flavored
//     gravy", "chicken liver flavor". A flavouring is not a protein source, and
//     "bacon flavor" is typically not pork at all.
//   • hydrolyzed — a hydrolyzed protein is clinically a DIFFERENT exposure from
//     the intact protein; that is the entire premise of a hydrolysed prescription
//     diet. lib/protein.ts keeps `hydrolyzed` out of its descriptor strip for this
//     reason. Skipping the term under-captures; mapping it would tell a vet the
//     pet ate chicken when it ate hydrolyzed chicken.
//
// NOT excluded, deliberately: `broth`, `stock`, `digest`, `meal`, `by-product`.
// Those all carry real protein from the named animal — "chicken broth" in the Tiki
// Cat rabbit panel is precisely the hidden exposure B-351 exists to surface.
const NON_EXPOSURE_TERM = /\b(fats?|tallow|oils?|flavou?r(s|ed|ing)?|hydroly[sz]ed)\b/;

// Ingredient-term separators. Parentheses split too, so "Fish Oil (Preserved With
// Mixed Tocopherols)" yields a term that still carries its `oil` disqualifier
// rather than hiding it behind a nested group.
const TERM_SEPARATOR = /[,;.()[\]\n\r]+/;

// Words that legitimately sit beside a species in a protein ingredient. They are
// how a derivation is judged ORDINARY rather than unusual (see `isUnusualTerm`):
// after the species token and these are removed, an ordinary term has nothing
// left. "chicken broth", "turkey by-product meal", "dried egg product" and "lamb
// lung" all reduce to nothing; "dried beef cheese" leaves `cheese`, which is the
// signal that the animal name is riding on something that is not primarily that
// animal.
//
// This is a REPORTING aid, not a filter — an unusual term is still captured. The
// derivation is unchanged by anything in this block; under-capturing a real
// exposure to keep the report tidy would be the wrong trade entirely.
const ORDINARY_COMPANION = new Set<string>([
  // preparation / cut
  'broth', 'stock', 'meal', 'by-product', 'by-products', 'byproduct', 'byproducts',
  'digest', 'product', 'products', 'protein', 'plasma',
  // tissue
  'liver', 'livers', 'heart', 'hearts', 'gizzard', 'gizzards', 'giblets', 'tripe',
  'kidney', 'kidneys', 'cartilage', 'bone', 'bones', 'lung', 'lungs', 'breast',
  'breasts', 'thigh', 'thighs', 'white', 'whites', 'yolk', 'yolks',
  // state / sourcing descriptors
  'fresh', 'frozen', 'dried', 'dehydrated', 'deboned', 'boneless', 'whole', 'raw',
  'real', 'ground', 'natural', 'premium', 'cooked', 'roasted', 'minced', 'chopped',
  'cage-free', 'free-range', 'grass-fed', 'wild-caught', 'farm-raised', 'ocean',
  'and', 'with', 'of', 'the', 'water', 'sufficient', 'for', 'processing',
]);

/** One protein key, with the ingredient term it was read from. */
export interface DerivedProtein {
  key: string;
  /** The panel term, verbatim-ish (whitespace-collapsed, lowercased). */
  term: string;
  /**
   * True when the animal name appeared inside a term that is not straightforwardly
   * that animal — `beef` read from "dried beef cheese" rather than from "beef" or
   * "beef broth". These are the derivations most worth a human eye, and the ones
   * that would make the best owner-facing "did you know this had beef in it?"
   * moment if the provenance ever reaches a surface (B-453).
   */
  unusual: boolean;
}

function isUnusualTerm(term: string, matched: string): boolean {
  const leftover = term
    .split(' ')
    .filter((w) => w && !matched.split(' ').includes(w) && !ORDINARY_COMPANION.has(w));
  return leftover.length > 0;
}

/**
 * Derive the ordered protein keys visible in a stored ingredient panel, each with
 * the ingredient term it came from.
 *
 * Panel (prominence) order is preserved: a key takes the position of its FIRST
 * occurrence, which is what makes the returned array meaningful as the
 * "prominence-ordered" tail migration 039 documents.
 *
 * Every key leaves through `normalizeExtractedProtein` (guard 2). Returns [] for
 * an absent, empty, or protein-free panel — never a junk key.
 */
export function deriveProteinsWithSources(panel: string | null | undefined): DerivedProtein[] {
  if (typeof panel !== 'string') return [];

  const out: DerivedProtein[] = [];
  const seen = new Set<string>();

  for (const rawTerm of panel.split(TERM_SEPARATOR)) {
    // Whitespace-collapsed so a line-wrapped "ocean  whitefish" still matches the
    // multi-word lexicon entries.
    const term = rawTerm.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!term || NON_EXPOSURE_TERM.test(term)) continue;

    // `lastIndex` is per-regex state on a `g` pattern shared across calls, so the
    // matcher is re-anchored for each term rather than resumed mid-panel.
    LEXICON_PATTERN.lastIndex = 0;
    for (const match of term.matchAll(LEXICON_PATTERN)) {
      const key = normalizeExtractedProtein(match[1]);
      if (key == null || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, term, unusual: isUnusualTerm(term, match[1]) });
    }
  }

  return out;
}

/** Keys only — the derivation the backfill actually writes. */
export function deriveProteinsFromPanel(panel: string | null | undefined): string[] {
  return deriveProteinsWithSources(panel).map((d) => d.key);
}

/** One `food_items` row, in the shape the backfill needs to read. */
export interface BackfillRow {
  id: string;
  primary_protein: string | null;
  proteins: readonly string[] | null;
  ingredients_notes: string | null;
}

export interface BackfillPlan {
  id: string;
  /** The `primary_protein` to write. Identical to the stored value unless the
   *  ratified Class-B re-key applies — and then it is written in the SAME
   *  statement as `proteins` (guard 1). */
  primaryProtein: string | null;
  /** The full `proteins` array to write. A SUPERSET of the stored array, in the
   *  stored array's own order, with the primary's key hoisted to [0]. */
  proteins: string[];
  /** Keys this pass adds. Empty ⇒ nothing to write for this row. */
  added: string[];
  /** Where each added key was read from — the panel term, and whether that term
   *  was an unusual carrier for the animal. Reporting only; never affects what is
   *  written. */
  provenance: DerivedProtein[];
  /** True when `primary_protein` is written differently from how it was stored,
   *  under EITHER warrant. Most of these are Class A. */
  rekeyedPrimary: boolean;
  /**
   * True ONLY for a CLASS-B re-key — a semantic merge that needed the PM's nod.
   *
   * Kept separate from `rekeyedPrimary` because the two are not the same decision
   * and reporting them as one number misstates the blast radius of the thing that
   * was actually ratified. On the live table this splits 10 rewritten primaries
   * into 3 Class B (`ocean whitefish` → `whitefish`, the ones argued row by row)
   * and 7 Class A (`Chicken By-Product Meal` → `chicken` — casing and a processing
   * qualifier, no species judgement, permitted always and retroactively).
   */
  classBRekey: boolean;
  changed: boolean;
}

export interface BackfillOptions {
  /**
   * Run stored `primary_protein` values through the write-path normalizer — the
   * D3a Class-B question B-416 was required to ask rather than assume.
   *
   * **PM-RATIFIED 2026-07-25 (explicit nod, as D3a requires).** Live blast radius
   * is 3 rows, all `ocean whitefish` → `whitefish`; every other stored primary is
   * already normalize-stable. The argument that decided it: `'ocean whitefish' →
   * 'whitefish'` is ALREADY shipped on the write path (it is spec §5's own B-048
   * example and sits in `EXTRACTION_PROTEIN_ALIASES` today), so declining does not
   * hold the status quo — it guarantees a widening split, where a food
   * photographed tomorrow stores `whitefish` while these three keep
   * `ocean whitefish` forever. The pass invents no species judgement of its own; it
   * applies only a mapping already ratified and shipped.
   *
   * Kept as an option rather than hardcoded because the ruling is about STORED
   * DATA at one moment in time. A future run over different rows is a different
   * question, and this parameter is where that question has to be asked again.
   */
  rekeyPrimaryProtein: boolean;
}

/**
 * Plan the additive re-derivation for one row. Pure — the caller writes.
 *
 * The returned `proteins` is built in this order, and the order is the contract:
 *   [ the primary's key, …stored keys (original order), …newly derived keys ]
 *
 * Stored keys keep their positions behind the primary because property 1 forbids
 * reordering what is already there; derived keys land after them in panel order.
 */
export function planRow(row: BackfillRow, options: BackfillOptions): BackfillPlan {
  const stored = Array.isArray(row.proteins) ? row.proteins : [];

  // The primary's key. `normalizeExtractedProtein` is the write-path key and is
  // what the ratified re-key applies; `canonicalizeProtein` is the Class-A-only
  // key migration 039 used and the read path still assumes.
  const canonicalPrimary = canonicalizeProtein(row.primary_protein);
  const normalizedPrimary = normalizeExtractedProtein(row.primary_protein);
  const primaryKey = options.rekeyPrimaryProtein ? normalizedPrimary : canonicalPrimary;

  // NEVER blank an owner's value. A primary that carries no usable key (NULL, or
  // the literal string "null" that one live row still holds) is left exactly as
  // stored — a backfill has no business deciding an owner meant nothing.
  //
  // A NULL primary is also not an invitation to promote a derived protein into the
  // main slot: slice 3 defines NULL as "the owner designated no main", and
  // resurrecting one here would undo a deliberate clear. Nothing is hoisted in
  // that case, and the derived keys simply stand as the prominence-ordered set —
  // which is what every reader already does with a NULL primary (`readProteinSet`
  // hoists nothing, `resolveTargetProtein` reads the primary and finds none).
  //
  // The CLASS-A cleanup of the primary runs unconditionally — `Chicken By-Product
  // Meal` is written back as `chicken` whatever the option says, because casing and
  // a processing qualifier are capture artifacts that D3a permits merging always
  // and retroactively, and leaving them split is the data loss B-414 was fixed to
  // stop. It is invisible to the owner either way: the picker already highlights
  // the chip by canonicalizing the stored value, so both spellings render as
  // "Chicken" today. What it buys is that `primary_protein` and `proteins[0]`
  // become EXACTLY equal rather than equal-under-canonicalization — which is the
  // invariant `readProteinSet` leans on, now held literally.
  //
  // `rekeyPrimaryProtein` gates only the CLASS-B step on top of that.
  const primaryProtein = primaryKey != null ? primaryKey : row.primary_protein;
  const rekeyedPrimary = primaryProtein !== row.primary_protein;
  const classBRekey =
    options.rekeyPrimaryProtein &&
    normalizedPrimary != null &&
    canonicalPrimary != null &&
    normalizedPrimary !== canonicalPrimary;

  // Dedupe in NORMALIZED space (guard 2's other edge). A stored `ocean whitefish`
  // and a panel-derived `whitefish` are ONE protein, and appending the second next
  // to the first is the page-1 bug arriving from the secondary side rather than
  // the primary side. So membership is decided on the write-path key even when the
  // value itself is written back with its Class-A key.
  //
  // Note what this means when the re-key IS on: the primary enters as `whitefish`
  // and claims that identity, so the stored `ocean whitefish` element dedupes into
  // it rather than surviving alongside. Nothing is lost — it is the same protein,
  // now written once, in the same statement as the primary. That IS guard 1.
  const proteins: string[] = [];
  const seen = new Set<string>();
  const pushKey = (key: string | null): void => {
    if (key == null) return;
    const dedupeKey = normalizeExtractedProtein(key);
    if (dedupeKey == null || seen.has(dedupeKey)) return;
    if (proteins.length >= MAX_CAPTURED_PROTEINS) return;
    seen.add(dedupeKey);
    proteins.push(key);
  };

  // Stored elements are keyed Class-A ONLY, whatever the option says. The PM's
  // ratification was about stored PRIMARIES — three `ocean whitefish` values whose
  // re-key was argued row by row. Quietly extending a semantic re-key to every
  // secondary in the table would be taking a decision that was never put, which is
  // the whole failure mode D3a's "explicit nod" exists to prevent.
  pushKey(primaryKey);
  for (const value of stored) pushKey(canonicalizeProtein(value));

  const before = new Set(proteins);
  const derived = deriveProteinsWithSources(row.ingredients_notes);
  for (const d of derived) pushKey(d.key);
  const added = proteins.filter((p) => !before.has(p));
  const provenance = added
    .map((key) => derived.find((d) => d.key === key))
    .filter((d): d is DerivedProtein => d != null);

  // A no-op row is one where neither column moves. Comparing the arrays elementwise
  // (not just the added count) is what catches the Class-B re-key of a stored
  // element, which adds nothing but does change what is written.
  const proteinsChanged =
    proteins.length !== stored.length || proteins.some((p, i) => p !== stored[i]);

  return {
    id: row.id,
    primaryProtein,
    proteins,
    added,
    provenance,
    rekeyedPrimary,
    classBRekey,
    changed: proteinsChanged || rekeyedPrimary,
  };
}

// ── A note on D10, and what this pass deliberately does NOT write ─────────────
//
// It does not touch `ai_extraction_confidence`. That is the tempting move — most
// live rows have no `confidence.proteins` at all, so the D10 gate reads them as
// `low_confidence` and every one of these foods still renders "ingredient list not
// read" on the vet report even after this pass fills their sets. Writing a
// confidence value here would clear that.
//
// It would also be a lie, and the specific lie D10 exists to prevent. The gate
// licenses the single reassuring string in the feature — "nothing else on the
// label". This pass finds only the animals in its lexicon, so a panel listing
// kangaroo (absent from the extractor's world too, but present on real raw diets)
// yields a set that is genuinely incomplete. Attesting completeness off a
// keyword scan is reassurance-on-absence on the surface a vet trusts most —
// `clinical-guardrails`, exactly.
//
// So the sets get fuller and the provenance line stays honest: these rows read as
// "ingredient list not read" until a real panel read backs them. That is
// under-claiming, which D10 names as the safe direction (B-437). The real fix is a
// provenance/coverage field written by an extractor that actually read the panel —
// B-437 — not a value invented by a backfill.
