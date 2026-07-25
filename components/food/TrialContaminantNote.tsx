// Tier-2 trial-contaminant note — the STANDING register (B-351 Phase A, slice 4;
// spec §8, D2/D7, B-417 C2).
//
// The same fact as the completion-card heads-up, in the register of a property of
// a thing rather than a report of an event. Two homes:
//
//   • the food's own detail screen — where a food flagged once at log time keeps
//     saying so, which is what makes the one-heads-up-per-food rule affordable;
//   • the diet-trial card on Pet profile — where the trial DIET's own
//     contamination lives, because B-417's C2 ruling makes that a trial-level
//     standing fact and never a per-feeding verdict (a per-feeding flag on the
//     prescribed food fires 100+ times across a 56-day trial and trains the owner
//     to ignore the flag that matters on day 22).
//
// TONE. This uses the app's existing firm-but-calm safety register — the tinted
// accent card with an accent rail that `analyze-vomit` / `analyze-stool` already
// use for "worth a call". Nyx has no danger/klaxon state and this is deliberately
// not where one gets invented (the same call the PM made on B-340). There is no
// icon, no colour-only meaning: the title carries the fact in words, so the card
// survives a screenshot in greyscale.
//
// NEVER REASSURES. There is no negative form of this component — no "no conflicts"
// state, no all-clear. A caller with nothing to flag renders nothing, and the
// absence of this card is never evidence that a food is on-diet (`clinical-
// guardrails`; D10's presence-only rule).
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  title: string;
  body: string;
}

export function TrialContaminantNote({ title, body }: Props) {
  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${body}`}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorAccentLight,
    borderColor: theme.colorAccent,
    borderLeftWidth: 3,
    borderRadius: theme.radiusMedium,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    gap: 4,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  body: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
  },
});
