// The D9 disclosure for a normalized "Other" typed protein (B-351 PR 3, B-412).
//
// Shared by BOTH typed escapes in the D8 two-line picker — the "Main protein"
// line (ProteinPicker) and the "Also contains" line (ProteinSetPicker) — so one
// rewrite reads identically wherever the owner typed it.
//
// Why a persistent inline note and not a toast: the PM's ruling was "normalize
// but give a user the heads up". A Snackbar narrates a vanished event and then
// leaves an unexplained `Bison` sitting in the field; what we actually mean is a
// STANDING property of the value in that control, so it belongs next to it and
// stays for as long as the value does.
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

/** What the owner typed, and the canonical key it was saved as. */
export interface ProteinRewrite {
  /** The owner's text, as typed (trimmed) — echoed back so the note is legible. */
  typed: string;
  /** The normalized canonical key actually stored. */
  saved: string;
}

/**
 * Build the rewrite record for a committed "Other" value, or null when nothing
 * worth telling the owner about happened.
 *
 * Silent-by-design cases (no note):
 *  • the value is unchanged apart from casing / whitespace ("Bison" → `bison`).
 *    The picker Title-cases for display anyway, so there is no change to explain
 *    — noting it would train owners to ignore the note that matters.
 *  • the normalizer found nothing usable (`null`). The caller keeps the raw text
 *    rather than wiping what the owner typed; see the callers' handling.
 */
export function proteinNoteFor(typed: string, saved: string | null): ProteinRewrite | null {
  if (saved == null) return null;
  const plain = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  return saved === plain ? null : { typed: typed.trim(), saved };
}

// Title-case for display, matching how the chips render a canonical key.
function display(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The note's two registers. Which one is right turns on whether the saved key is
 * still a word IN what the owner typed:
 *
 *  • contained → we kept the protein and dropped the rest ("chicken liver",
 *    "deboned chicken", "ocean whitefish"): *"that's the protein in …"*.
 *  • not contained → we swapped the word for the label name the rest of the
 *    library uses ("buffalo" → Bison, "deer" → Venison): the PM-ratified
 *    *"that's the label name for …"*.
 *
 * Both echo the owner's own words back, which is the whole point — an
 * unexplained `Bison` is the failure this note exists to prevent.
 */
export function proteinNoteText({ typed, saved }: ProteinRewrite): string {
  const words = typed.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const kept = words.includes(saved);
  return kept
    ? `Saved as ${display(saved)} — that's the protein in ${typed.toLowerCase()}.`
    : `Saved as ${display(saved)} — that's the label name for ${typed.toLowerCase()}.`;
}

export function NormalizedProteinNote({ rewrite }: { rewrite: ProteinRewrite }) {
  return <ThemedText style={styles.note}>{proteinNoteText(rewrite)}</ThemedText>;
}

const styles = StyleSheet.create({
  note: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextSecondary,
  },
});
