// Off-trial protein predicates (B-351 Phase A) — the SHARED, dependency-free half
// of the trial-contaminant logic.
//
// WHY THIS FILE EXISTS. Slice 4 built these predicates inside
// `lib/trialContaminant.ts`, which is the right home for the client's decision
// layer but imports AsyncStorage, `./supabase` and `./db` at module scope — so it
// cannot be imported from a Deno Edge Function at all. Slice 5 (the vet-report
// render) needs the SAME answer to "which proteins in this food are not the trial
// protein?", and re-deriving it inside `generate-report` is precisely the failure
// B-417 §5.3 documents in this repo: three contradictory off-diet predicates, one
// of them shipped, disagreeing about the wedge feature's core question.
//
// So the pure predicates live here, next to `lib/protein.ts`'s canonicalization,
// with the same rule: ONE implementation, imported by the client and inlined into
// the Edge-Function bundle by esbuild. `lib/trialContaminant.ts` re-exports them
// so every existing client call site and test is unchanged.
//
// Nothing in this file does I/O, reads a store, or builds copy — the client's
// copy/ledger/context layer stays in `trialContaminant.ts`.
// The `.ts` extension is required, not stylistic: this module is imported BOTH by
// the RN client and — inlined by esbuild — into the `generate-report` Deno bundle,
// and Deno will not resolve an extensionless specifier. `moduleResolution:
// "bundler"` (expo's base tsconfig) and Metro both accept it, so one spelling
// satisfies every consumer. Same reason the Edge Functions spell `lib/protein.ts`.
import { canonicalizeProtein } from './protein.ts';
import { dropKinOfPrimary, proteinSourceBase } from './proteinRelation.ts';

/**
 * The proteins in `foodProteins` that the trial diet does not include.
 *
 * The comparison is EXACT canonical-key equality, and that is load-bearing for
 * B-411's two deliberate non-resolutions. `poultry` is never folded into
 * `chicken` (it may be chicken OR turkey, and inventing a specific exposure is
 * the unsafe direction) and `chicken fat` is never folded into `chicken` (that
 * would invent a protein exposure out of a near-protein-free ingredient). Under
 * the "everything but the target" model here, both still surface — they are not
 * the target key, so they are off-trial — which means B-411's under-claim gap
 * does NOT open a hole in this check the way it would in an excluded-list model.
 * What it costs instead is precision in the copy: the owner is told the food has
 * `poultry`, not that it has chicken, which is exactly as much as we know.
 *
 * Order is preserved (prominence order, as captured) so the copy names the most
 * prominent off-trial protein first.
 */
export function offTrialProteins(
  foodProteins: readonly string[],
  targetProtein: string | null,
): string[] {
  if (!targetProtein) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of foodProteins) {
    const key = canonicalizeProtein(raw);
    if (key == null || key === targetProtein || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export type TrialProteinSource = 'owner' | 'derived';

/**
 * The trial's target protein — STORED-FIRST, with a read-time derivation fallback,
 * returning the protein AND its provenance (B-704 §4). This is THE ONE predicate:
 * every consumer that needs to name a trial's protein reads it through here — the
 * §5.3 one-predicate lesson, applied before a third, contradictory definition can
 * exist. (`resolveTargetProtein` below is now its fallback arm, not a public entry
 * point; a consumer importing it directly is a review-blocking finding.)
 *
 * WHY PROVENANCE IS PART OF THE RETURN. The vet report renders the two sources
 * differently ("owner-confirmed" vs "from the trial diet"), and a consumer that
 * cannot tell an owner's stated protein from the app's best guess will eventually
 * present a guess as a confirmation. Returning `source` makes that distinction
 * impossible to drop by accident.
 *
 * NEVER A PERMIT (TG-1). This value only NAMES what the record already counts. The
 * allowed set (`diet_trial_foods`) remains the sole authority on what is off-diet
 * (diet-trial §5.5 D-A); `classifyFeeding`, the sanctioned-set union, rung order,
 * counts, denominators and coverage are byte-identical for every value returned
 * here, including null. Silence (a null protein) is never an all-clear (TG-2): a
 * consumer must conclude nothing from a null target — nothing was named, and
 * nothing was compared.
 *
 * WHAT COUNTS AS A PROTEIN — ONE NOTION, shared with the antigen path (TG-4). The
 * stored value is accepted only when it names a protein SOURCE, gated on the SAME
 * `proteinSourceBase` `isUncharacterizedTrialDiet` uses — so the naming path and
 * the sanctioned-set path can never disagree about whether a value is a protein. A
 * bare process word ('hydrolyzed', 'protein') canonicalizes to a non-null fixpoint
 * but names no source, and asserting it "owner-confirmed" on a vet report would
 * both misname the diet and contradict the antigen arm; it drops to derivation
 * instead. This read gate is NOT a full validator, though — `canonicalizeProtein`
 * is a keyer, so arbitrary well-formed non-protein text ('not a real key') keys to
 * a fixpoint and DOES survive as the owner's word. Keeping that out of the column
 * is the WRITE path's job (the picker's "Other" escape, PR 3, B-412/D9 pattern);
 * the gate here only stops the process-word class from being mislabelled owner.
 * The derivation arm below stays plain `canonicalizeProtein` — the historical
 * report derivation, so the PR-2 report migration is byte-identical; unifying it
 * onto the source gate is a PR-5 report-render change, under the cold-read gate.
 *
 * @param trial          the trial row, read for its owner-stated `target_protein`.
 * @param primaryFoods   the trial's primary-diet foods, most-prominent first — the
 *                       derivation source when nothing is stored. One food yields
 *                       exactly `canonicalizeProtein(primaryProtein)`, so an existing
 *                       single-food caller is unchanged by routing through here.
 */
export function trialTargetProtein(
  trial: { target_protein: string | null },
  primaryFoods: readonly { primaryProtein: string | null }[],
): { protein: string | null; source: TrialProteinSource | null } {
  // Stored-first: an owner-confirmed protein wins — but ONLY when it names a usable
  // source (`proteinSourceBase != null`, the gate the antigen path uses). Canonicalize
  // on READ (a Class-A convergent op — a no-op on a value already written canonical,
  // TG-4). A process word ('hydrolyzed') keys to a non-null fixpoint yet names no
  // source, so it is NOT asserted owner-confirmed; it falls to derivation. Arbitrary
  // non-protein text still survives (the keyer is not a dictionary) — that residual
  // is the write path's to close, see the docstring.
  const stored = canonicalizeProtein(trial.target_protein);
  if (stored != null && proteinSourceBase(stored) != null) {
    return { protein: stored, source: 'owner' };
  }

  // Fallback: derive from the picked primary-diet foods, in prominence order. The
  // derivation is BEST-EFFORT by construction — it is exactly the "the food defines
  // its own target" blindness the stored value exists to fix — so it is always
  // labelled `derived`, never `owner`.
  for (const food of primaryFoods) {
    const derived = resolveTargetProtein(food.primaryProtein);
    if (derived != null) return { protein: derived, source: 'derived' };
  }
  return { protein: null, source: null };
}

/**
 * The target-vs-trial-food tension (B-704 §6 / TG-3): the owner STORED a protein and
 * the trial food's own designated primary names a DIFFERENT one. Returns the
 * disagreeing food-primary canonical key when the tension is live, else null.
 *
 * A TRIAL-LEVEL STANDING FACT, never a per-feeding flag (TG-3). This predicate only
 * REPORTS the disagreement; the consumer decides how to disclose it (the report's
 * §5.5-style line, the client's §6 heads-up / standing note). It never permits and
 * never touches a count — it is pure comparison over two canonical keys.
 *
 * Fires ONLY on an OWNER-stored target: a DERIVED target came FROM the label, so it
 * cannot disagree with it (comparing a value to its own source is never a finding).
 * Fires ONLY when the food HAS a designated primary — §6 leads with "{Food} lists
 * {protein} as its MAIN protein", and a food with no main protein has nothing to
 * disagree with (silence, never a manufactured mismatch — the TG-2 shape). The
 * comparison is EXACT canonical-key equality (via the resolver's already-canonical
 * target and a `canonicalizeProtein` on the food primary), so casing or a form
 * qualifier never fabricates a mismatch (`Duck` vs `duck`, `chicken` vs `chicken meal`).
 */
export function trialProteinLabelMismatch(
  resolved: { protein: string | null; source: TrialProteinSource | null },
  foodPrimaryProtein: string | null,
): string | null {
  if (resolved.source !== 'owner' || resolved.protein == null) return null;
  const foodKey = canonicalizeProtein(foodPrimaryProtein);
  if (foodKey == null || foodKey === resolved.protein) return null;
  return foodKey;
}

/**
 * The DERIVATION FALLBACK ARM of `trialTargetProtein` (B-704 §4) — no longer a
 * public entry point. Reads the trial food's OWNER-DESIGNATED `primary_protein`,
 * and deliberately NOT `proteins[0]`.
 *
 * They are the same value on every ordinary row (migration 039's contract), and
 * differ in exactly one case: when the owner CLEARS the main protein, slice 3
 * demotes the old main into the tail and writes a NULL primary — so `proteins[0]`
 * is then a protein the owner explicitly un-designated. Reading the target from
 * `proteins[0]` would resurrect that cleared designation and, worse, invert the
 * whole check: every OTHER protein — including the real trial protein — would be
 * reported as the contaminant. A null target disables the check (silence, never
 * an all-clear).
 *
 * Kept as a named internal helper rather than inlined so this rationale stays
 * attached to the read it justifies.
 */
function resolveTargetProtein(primaryProtein: string | null | undefined): string | null {
  return canonicalizeProtein(primaryProtein);
}

/**
 * `offTrialProteins` for the ONE food that IS the trial diet (B-529/R7).
 *
 * WHY THIS IS A SECOND FUNCTION AND NOT A FLAG. The two calls ask genuinely
 * different clinical questions, and the answer to one is unsafe as the answer to
 * the other:
 *
 *   • ANOTHER food carrying `chicken` while the trial runs on `hydrolyzed
 *     chicken` is intact protein, which is exactly what a hydrolysed elimination
 *     trial excludes. It breaks the trial. `offTrialProteins` — unchanged.
 *   • THE TRIAL FOOD'S OWN LABEL carrying both terms is one source named twice:
 *     the front of pack says "Hydrolyzed Chicken", the panel yields `chicken`.
 *     On `main` the shared function reported that as the trial diet contaminating
 *     its own trial, in bold on page 1, and the B-417 cold read acted on it and
 *     reached the wrong clinical conclusion.
 *
 * A boolean parameter on the shared function would have put those two answers one
 * typo apart on a clinical artifact, and the default would silently be the wrong
 * one for whichever caller forgot it. Separate names, no default.
 *
 * Returns the genuine off-target proteins only; the absorbed kin terms are
 * available from `partitionKinOfPrimary` for the caller that owes the reader a
 * disclosure (the trial block's own provenance line).
 */
export function offTrialProteinsInTrialFood(
  foodProteins: readonly string[],
  targetProtein: string | null,
): string[] {
  if (!targetProtein) return [];
  // `dropKinOfPrimary`: `offTrialProteins` has already removed the target key
  // itself, so the only thing left to absorb is a kin term. Using the partition
  // helper here would work today purely because that removal already happened —
  // relying on a double-removal is how the two helpers get confused, and the
  // antigen path already paid for that once.
  return dropKinOfPrimary(offTrialProteins(foodProteins, targetProtein), targetProtein);
}

/** "chicken" · "chicken and salmon" · "chicken, salmon and beef". */
export function proteinList(keys: readonly string[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}
