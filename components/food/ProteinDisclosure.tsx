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
import { proteinSetCompleteness } from '../../lib/protein';

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
  const { complete } = proteinSetCompleteness(input.ingredientsNotes, input.extractionConfidence);
  if (complete) return 'Read from the ingredient list on the label.';
  return input.proteins.length > 0
    ? "The ingredient list hasn't been read, so there may be more proteins in here than these."
    : "The ingredient list hasn't been read, so the proteins in here aren't known yet.";
}

/**
 * The compact library-row form: the whole set in one line, primary first.
 *
 * Prominence is carried by ORDER rather than weight (a list row has no room for
 * two type sizes), which still honours Dr. Chen's "primary reads first" condition
 * from §9 — the headline protein is never something the eye has to hunt for.
 *
 * Returns null when there is nothing honest to say: an empty set on an unread
 * panel is not "no proteins", it is no information, and a row that renders
 * "Ingredient list not read" against every legacy manual food would turn a
 * library browse into a wall of scolding.
 */
export function proteinSummaryLine(input: ProteinDisclosureInput): string | null {
  const { complete } = proteinSetCompleteness(input.ingredientsNotes, input.extractionConfidence);
  const [main, ...rest] = input.proteins;

  if (!main) {
    // Complete + empty is a real, if rare, answer: a panel WAS read and it lists
    // no animal protein (a hydrolysed or vegetarian diet). Unread + empty is not
    // an answer at all, so it stays silent.
    return complete ? 'No animal proteins on the label' : null;
  }
  if (!complete) return `${display(main)} · ingredient list not read`;
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
