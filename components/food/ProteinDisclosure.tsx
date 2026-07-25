// Tier-1 protein disclosure (B-351 Phase A, slice 4 — spec §8.5, D7, gated by
// D10/B-413).
//
// Tier 1 is the UNIVERSAL half of multi-protein surfacing: every owner, always,
// trial or no trial. The insight it sells is the one the PM named — *so many foods
// say "chicken" and quietly also contain salmon* — so it is factual, quiet and
// educational. It is NOT a nudge: it renders on the surface where the food is
// already being presented and never barks on a log (Principle 4). Only Tier 2 (the
// trial-contaminant flag) escalates, and it lives in TrialContaminantNote/Sheet.
//
// ── WHY EVERY STRING HERE IS GATED ───────────────────────────────────────────
// `proteins` is a bare array: `['duck']` from a marketing-name-only read is
// byte-identical to `['duck']` read off a genuine single-protein panel. Rendering
// "Duck · nothing else" over the first is reassurance-on-absence — the
// `clinical-guardrails` asymmetry — because the commonest reason a set looks clean
// is that nobody read the label. So EVERY claim about what is NOT in a food is
// gated on lib/protein's proteinSetCompleteness, and when the gate fails the copy
// says the ingredient list hasn't been read instead of implying a complete set.
// The gate lives in lib/protein.ts on purpose: slice 5's vet report must answer
// this question identically, and two implementations would let the app and the
// report disagree about which foods are trustworthy.
//
// TWO SHAPES, ONE RULE. The provenance LINE sits under the D8 picker on the two
// edit surfaces, where the set is already visible as chips — so it adds only what
// the chips cannot say (whether the list is complete). The summary LINE is the
// compact library-row form, where nothing else shows the set at all. Neither is
// rendered on the quick-log picker grid: that is the moment of event, and a
// protein line there buys education at the cost of the 10-second test.
import { Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { mayClaimCompleteProteinSet } from '../../lib/protein';

/** The three stored facts every disclosure decision needs. */
export interface ProteinDisclosureInput {
  proteins: readonly string[];
  ingredientsNotes: string | null | undefined;
  /** Parsed `ai_extraction_confidence` (any shape — the gate is tolerant). */
  extractionConfidence: unknown;
}

function display(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The line that sits under the D8 picker: what the chips above cannot say.
 *
 * Never null — an edit surface that shows a protein set must always say where it
 * came from, because silence there is exactly the ambiguity D10 was ruled on.
 */
export function proteinProvenanceLine(input: ProteinDisclosureInput): string {
  // mayClaimCompleteProteinSet, not proteinSetCompleteness: an EMPTY set never
  // earns the "read from the label" line either, because a partial tool call
  // (panel read, `proteins` array omitted) produces exactly that shape and the
  // line would attest an emptiness nothing actually asserted.
  if (mayClaimCompleteProteinSet(input.proteins, input.ingredientsNotes, input.extractionConfidence)) {
    return 'Read from the ingredient list on the label.';
  }
  return input.proteins.length > 0
    ? "The ingredient list hasn't been read, so there may be more proteins in here than these."
    : "No proteins have been picked out of this food's label yet, so what's in it isn't known.";
}

/**
 * The compact library-row form: the whole set in one line, primary first.
 *
 * Prominence is carried by ORDER rather than weight (a list row has no room for
 * two type sizes), which still honours Dr. Chen's "primary reads first" condition
 * from §9 — the headline protein is never something the eye has to hunt for.
 *
 * An EMPTY set is always silence, never a claim. An earlier draft rendered
 * "No animal proteins on the label" when the panel gate passed, and the
 * adversarial pass broke it with the routine case: the extractor's tool schema
 * makes `proteins` optional while `confidence.proteins` is required, so a model
 * that reads a legible panel and omits the array produces an empty set with a
 * high-confidence panel — and the row asserted a chicken-and-salmon food had no
 * animal protein in it. The theoretical case that string existed for (a genuinely
 * protein-free diet) barely exists, because the extraction prompt tells the model
 * to emit `hydrolyzed soy protein` / `pea protein`. Silence loses nothing real
 * and closes the only reassuring string on this surface.
 *
 * Silence is also right for an unread empty set for a different reason: a row
 * reading "ingredient list not read" against every legacy manual food would turn
 * a library browse into a wall of scolding.
 */
export function proteinSummaryLine(input: ProteinDisclosureInput): string | null {
  const [main, ...rest] = input.proteins;
  if (!main) return null;
  if (!mayClaimCompleteProteinSet(input.proteins, input.ingredientsNotes, input.extractionConfidence)) {
    return `${display(main)} · ingredient list not read`;
  }
  if (rest.length === 0) return `${display(main)} · nothing else on the label`;
  return `${display(main)} · also contains ${rest.join(', ')}`;
}

/** The provenance line, rendered. Pair it with the D8 picker on an edit surface. */
export function ProteinDisclosure({ input }: { input: ProteinDisclosureInput }) {
  return <Text style={styles.line}>{proteinProvenanceLine(input)}</Text>;
}

const styles = StyleSheet.create({
  line: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextSecondary,
  },
});
