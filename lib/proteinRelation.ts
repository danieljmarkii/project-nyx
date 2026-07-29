// The protein DERIVED-FROM relation (B-529, ruling R7).
//
// ── WHAT THIS IS, AND THE ONE THING IT IS NOT ────────────────────────────────
//
// This module answers ONE question: "do these two protein keys name the same
// source, described at different stages of processing?" — `hydrolyzed chicken`
// and `chicken`; `hydrolyzed soy protein` and `soy`.
//
// IT DOES NOT MERGE KEYS. Nothing here is reachable from `canonicalizeProtein`,
// from `normalizeExtractedProtein`, or from any keying path. `lib/protein.ts`'s
// Class-A/Class-B doctrine is untouched and deliberately so: `hydrolyzed` is
// ABSENT from `LEADING_DESCRIPTOR` because a hydrolysed protein is clinically a
// different exposure from the intact one — that is the entire premise of a
// hydrolysed prescription diet — and a vet must never be told the pet ate
// chicken when it ate hydrolyzed chicken. That rule stands. Every surface that
// NAMES a protein still names the stored key, verbatim.
//
// What this relation is consulted for is narrower and is the whole of R7(a): the
// trial CONTAMINATION and ANTIGEN checks, which do not ask "what is this
// protein" but "is this a SECOND protein, or the same one twice". Those are
// different questions and the repo previously had only one answer to both.
//
// ── THE THREE DEFECTS THIS EXISTS TO CLOSE (all reproduced on `main`) ─────────
//
// A hydrolysed diet's label routinely yields BOTH keys — the front of pack says
// "Hydrolyzed Chicken" (→ `primary_protein`) while the panel lists a chicken
// term that canonicalizes to `chicken`. On `main` that produced, from one row:
//
//   1. `trialContamination` → `[['chicken']]`. The report told the vet the trial
//      food's own label lists a protein the trial is meant to exclude — i.e. it
//      accused the prescription diet of contaminating its own trial. The B-417
//      cold read reached the WRONG clinical conclusion off exactly this (re-run
//      the trial, where the record said proceed to rechallenge).
//   2. `offTrialProteins(set, target)` → `['chicken']` on the trial food's OWN
//      view, so page 1 repeated the accusation in the headline, and the caveat it
//      generated suppressed the earned interpretability statement
//      (`render.ts:1565`, `suppressStatement`).
//   3. `sanctionedProteinsOn` → `{hydrolyzed chicken, chicken}`. Intact chicken
//      entered the sanctioned set, so a plain chicken chew fed during the trial
//      lost its ATTRIBUTION: it still landed off-diet via rung 3 (detection
//      holds), but the antigen tally never named chicken — the one protein a vet
//      reading an elimination trial is looking for.
//
// Note (1)/(2) are ALARM in the false direction and (3) is SILENCE in the false
// direction, from the same root. A relation that resolves only one of them would
// have traded one wrong answer for another.
//
// ── THE ASYMMETRY THAT MAKES THIS SAFE (read before widening anything) ────────
//
// Kinship SUPPRESSES A FINDING, so it is applied on the narrowest possible
// scope: **within a single food, against that food's own designated primary.**
// It is never applied across foods, and this is not a simplification — it is the
// clinical fact:
//
//   • `chicken` on the HYDROLYSED DIET'S OWN LABEL, alongside its own
//     `hydrolyzed chicken` primary, is one source named twice. Not a finding.
//   • `chicken` in a DENTAL CHEW fed during a hydrolyzed-chicken trial is intact
//     protein, and intact protein is precisely what the trial excludes. It breaks
//     the trial. It stays a finding, and this module is never asked about it.
//
// So `proteinsAreKin` is a symmetric predicate about two keys, but every CALLER
// binds one side to a food's own `primary_protein`. A future caller that compares
// two foods' proteins to each other would silently convert a broken trial into a
// clean one — do not add one.
//
// ── DELIBERATELY CONSERVATIVE (the under-claim direction) ─────────────────────
//
// Kinship requires the two bases to be EXACTLY equal after removing hydrolysis
// terms and a trailing generic "protein". No tissue folding, no species
// synonyms, no substring rules. `hydrolyzed chicken liver` and `chicken` are NOT
// kin here (bases `chicken liver` vs `chicken`), so that pair keeps its finding.
// That is the intended direction: a missed kinship leaves a flag standing, which
// costs a conversation with a vet; a wrong kinship deletes a real contamination
// from the one document a vet acts on. Same rule the alias table follows — merge
// only where we are sure, otherwise leave the value alone.
//
// PURE AND DEPENDENCY-FREE, and the `.ts` import extension is load-bearing: this
// module is imported by the RN client AND inlined into the `generate-report` /
// `ask` Deno bundles by esbuild, exactly like `lib/protein.ts` and
// `lib/trialProtein.ts`. Deno will not resolve an extensionless specifier.
import { canonicalizeProtein } from './protein.ts';

// "hydrolyzed chicken", "hydrolysed chicken", "partially hydrolyzed whey".
// Both spellings, because the extraction prompt preserves whatever the label
// printed and UK/US labels differ. Anchored at the start with a required
// trailing space, so a bare "hydrolyzed" (which names no source) never matches
// and falls out as an unusable base below.
const HYDROLYSIS_PREFIX = /^(?:partially\s+|partly\s+)?hydroly[sz]ed\s+/;

// The postfix spelling: "chicken hydrolysate", "soy hydrolyzate".
const HYDROLYSIS_SUFFIX = /\s+hydroly[sz]ate$/;

// A trailing generic "protein" is a LABEL WORD, not a source: "soy protein" and
// "soy" are the same source, and a hydrolysed diet's primary is routinely stored
// as "hydrolyzed soy protein" while its panel term canonicalizes to "soy". This
// strip happens ONLY when computing a comparison base and never re-keys anything
// — `soy protein` is still stored, rendered and counted as `soy protein`.
const TRAILING_PROTEIN_WORD = /\s+protein$/;

// A base that names no source. Reaching one means the key carried a processing
// term and nothing else ("hydrolyzed protein"), which cannot be kin to anything
// — there is no source to match on. Returning null here is what stops such a key
// absorbing a real protein.
const UNUSABLE_BASES = new Set(['', 'protein', 'proteins', 'hydrolyzed', 'hydrolysed']);

/**
 * Does this key name a hydrolysed form?
 *
 * Reported for callers that want to explain a suppression in copy ("listed as
 * both the hydrolysed and the intact term"); kinship itself does not require the
 * two sides to differ on this flag — see `proteinsAreKin`.
 */
export function isHydrolyzedProtein(raw: string | null | undefined): boolean {
  const key = canonicalizeProtein(raw);
  if (key == null) return false;
  return HYDROLYSIS_PREFIX.test(key) || HYDROLYSIS_SUFFIX.test(key);
}

/**
 * The SOURCE a protein key names, with processing terms and a trailing generic
 * "protein" removed — or null when the key names no usable source.
 *
 *   "hydrolyzed chicken"     → "chicken"
 *   "chicken"                → "chicken"
 *   "hydrolyzed soy protein" → "soy"
 *   "soy protein"            → "soy"
 *   "chicken hydrolysate"    → "chicken"
 *   "hydrolyzed protein"     → null   (a process with no source)
 *   "chicken liver"          → "chicken liver"   (no tissue folding — see header)
 *
 * CONVERGENT: base(base(x)) === base(x) for every input, which the property test
 * enforces over the full cross-product rather than an example list. The affix
 * strips run to a joint fixpoint for the same reason `canonicalizeProtein`'s do
 * — one strip can expose work for the other, and a base that could still move on
 * a second pass would let two call sites disagree about whether two keys are kin.
 */
export function proteinSourceBase(raw: string | null | undefined): string | null {
  let v = canonicalizeProtein(raw);
  if (v == null) return null;

  let prev: string | null;
  do {
    prev = v;
    v = v.replace(HYDROLYSIS_PREFIX, '').replace(HYDROLYSIS_SUFFIX, '').trim();
    v = v.replace(TRAILING_PROTEIN_WORD, '').trim();
    // Re-canonicalize each pass: a strip can expose boundary punctuation or a
    // form-qualifier the first pass ran past, exactly as B-414 found inside
    // canonicalizeProtein itself.
    v = canonicalizeProtein(v);
    if (v == null) return null;
  } while (v !== prev);

  return UNUSABLE_BASES.has(v) ? null : v;
}

/**
 * Do these two keys name the SAME source at different stages of processing?
 *
 * Symmetric. FALSE for two spellings of the identical key (that is sameness, not
 * a derivation — callers dedupe on the canonical key before asking). False when
 * either side has no usable source base.
 *
 * ⚠️ Every caller must bind one side to a food's OWN `primary_protein`. See the
 * asymmetry note in the module header: used across two different foods this
 * predicate would turn a broken trial into a clean one.
 */
export function proteinsAreKin(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = canonicalizeProtein(a);
  const kb = canonicalizeProtein(b);
  if (ka == null || kb == null || ka === kb) return false;
  const ba = proteinSourceBase(ka);
  const bb = proteinSourceBase(kb);
  return ba != null && bb != null && ba === bb;
}

export interface KinPartition {
  /** Genuine additional sources — the ones that remain a finding. */
  extra: string[];
  /** Keys absorbed as the primary's own source under a different processing
   *  term. NOT dropped: a caller must DISCLOSE these, never delete them (see
   *  `partitionKinOfPrimary`). */
  derivedFromPrimary: string[];
}

/**
 * Split a food's canonical protein keys against its OWN designated primary.
 *
 * The primary itself is in neither list — it is the comparator, not a finding.
 *
 * WHY THE ABSORBED KEYS ARE RETURNED RATHER THAN DROPPED. Suppressing a
 * contamination finding is the reassurance direction, and `clinical-guardrails`
 * does not permit a surface to get quieter without saying so. So this returns a
 * partition, not a filter: `extra` is what may still be presented as a finding,
 * and `derivedFromPrimary` is what the caller owes the reader as a disclosure —
 * "the label lists both the hydrolysed and the intact term for its own source"
 * is a fact about the RECORD, not an all-clear about the pet.
 *
 * A null / unusable primary returns everything as `extra` and absorbs nothing.
 * That is the honest degenerate case: with no designated primary there is no
 * comparator, so nothing can be shown to be the same source twice. (Callers that
 * cannot act on a missing designation skip the food entirely before reaching
 * here — see `trialContamination` and the R7(c) silence rule.)
 */
/**
 * Remove ONLY the kin terms of `primaryProtein`, KEEPING the primary itself.
 *
 * ⚠️ THE DIFFERENCE FROM `partitionKinOfPrimary` IS LOAD-BEARING, and a real
 * regression caught by an existing test is why these are two functions rather
 * than one with an option.
 *
 * `partitionKinOfPrimary` drops the primary because there it is the COMPARATOR:
 * "what does this food list BEYOND what it says on the front?"
 *
 * The antigen path asks something else entirely: "what proteins reached the
 * animal that the TRIAL DIET does not contain?" — and a permitted food's own
 * primary is very often exactly that. On a duck trial, a vet-approved rabbit
 * jerky's `rabbit` is a genuine antigen exposure (D-B: the treat stays
 * `permitted`, the exposure is still recorded). Dropping it because it happened
 * to be that food's designated primary deleted a real antigen from the vet
 * report, which is the direction this whole ruling exists to prevent.
 *
 * So here the primary survives, and only a term naming the SAME SOURCE at a
 * different stage of processing is absorbed — the `chicken` on a
 * `hydrolyzed chicken` diet's own panel, and nothing else.
 */
export function dropKinOfPrimary(
  canonicalKeys: readonly string[],
  primaryProtein: string | null | undefined,
): string[] {
  const primary = canonicalizeProtein(primaryProtein);
  if (primary == null) return [...canonicalKeys];
  return canonicalKeys.filter((key) => !proteinsAreKin(key, primary));
}

export function partitionKinOfPrimary(
  canonicalKeys: readonly string[],
  primaryProtein: string | null | undefined,
): KinPartition {
  const primary = canonicalizeProtein(primaryProtein);
  const extra: string[] = [];
  const derivedFromPrimary: string[] = [];
  for (const key of canonicalKeys) {
    if (primary != null && key === primary) continue;
    if (primary != null && proteinsAreKin(key, primary)) derivedFromPrimary.push(key);
    else extra.push(key);
  }
  return { extra, derivedFromPrimary };
}
