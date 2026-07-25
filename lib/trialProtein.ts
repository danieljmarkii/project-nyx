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

/**
 * The trial target: the trial food's OWNER-DESIGNATED `primary_protein`, and
 * deliberately NOT `proteins[0]`.
 *
 * They are the same value on every ordinary row (migration 039's contract), and
 * differ in exactly one case: when the owner CLEARS the main protein, slice 3
 * demotes the old main into the tail and writes a NULL primary — so `proteins[0]`
 * is then a protein the owner explicitly un-designated. Reading the target from
 * `proteins[0]` would resurrect that cleared designation and, worse, invert the
 * whole check: every OTHER protein — including the real trial protein — would be
 * reported as the contaminant. A null target disables the check (silence, never
 * an all-clear).
 */
export function resolveTargetProtein(primaryProtein: string | null | undefined): string | null {
  return canonicalizeProtein(primaryProtein);
}

/** "chicken" · "chicken and salmon" · "chicken, salmon and beef". */
export function proteinList(keys: readonly string[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}
