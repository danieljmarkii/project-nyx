// The amber trial-protein heads-up — B-704 §6 (mock frames D + G).
//
// The day-0 catch, and its mid-trial standing form (PR 4). The register is the
// multi-protein Tier-2 amber (D7): a FACTUAL heads-up whose claim-strength is
// matched to what the record actually knows — a label tension, not harm — so it is
// amber, never the rose "danger" pair. The same call the PM made on B-693's
// log-time trial-list heads-up.
//
// THE PROMINENCE CONTRACT (§6, TP-2's condition made testable). The caller renders
// this INLINE, immediately below the offending food row (not at the sheet's foot,
// not a toast), so it shares a viewport with the food it names — verified by the
// §6.6 QA criterion. It is NEVER blocking: it changes no button's enabled state and
// carries no acknowledge gate.
//
// NO ICON, NO COLOUR-ONLY MEANING. The fact is carried in words (the bold lead), so
// the panel survives a greyscale screenshot — the same rule TrialContaminantNote
// follows. And there is NO negative form: a caller with nothing to flag renders
// nothing, and the absence of this note is never evidence a food is on-target
// (TG-2 / `clinical-guardrails`).
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  /** The lead fact, rendered prominently: "{Food} lists {protein} as its main
   *  protein." (§6.2 — lead with the fact). */
  fact: string;
  /** The non-alarming follow-on: "If {pet}'s trial is {target}-only, worth
   *  checking that bag with your vet." */
  advice: string;
}

export function TrialProteinMismatchNote({ fact, advice }: Props) {
  return (
    <View
      style={styles.panel}
      accessibilityRole="summary"
      accessibilityLabel={`${fact} ${advice}`}
    >
      <Text style={styles.fact}>{fact}</Text>
      <Text style={styles.advice}>{advice}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colorAttentionLight,
    borderColor: theme.colorAttentionBorder,
    borderWidth: 1,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1 + theme.space0_5,
    marginBottom: theme.space1,
    gap: theme.spaceMicro,
  },
  fact: {
    fontSize: theme.textSM,
    // Derived from the token, matching the sibling TrialContaminantNote's body line
    // rather than a bare literal.
    lineHeight: theme.textSM * 1.45,
    fontWeight: theme.weightSemibold,
    color: theme.colorAttentionInk,
  },
  advice: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorAttentionInk,
  },
});
