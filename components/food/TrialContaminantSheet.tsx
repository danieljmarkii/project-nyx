// Tier-2 trial-contaminant SOFT CONFIRM, shown when a food being added to the
// library carries a protein the pet's active trial diet does not (B-351 Phase A,
// slice 4; spec §8's add-time row, D2).
//
// WHY A CHOICE IS ALLOWED HERE AND NOWHERE ELSE. D2 ratified the flag at BOTH
// add-time and log-time, with deliberately different registers. Adding a food is
// not the moment of event — the owner is already several screens into a capture
// flow, deciding what to feed rather than recording what they fed — so presenting
// "Not now / Add anyway" costs them nothing they were mid-way through. At LOG
// time the same fact must never gate anything (Principle 1: zero decisions at the
// moment of event), which is why the log path renders a passive line on the
// completion card instead of this sheet. Both surfaces are needed because a food
// often enters the library BEFORE a trial starts, so the library add can't always
// see the trial — and the trial context is always live at log time.
//
// "Add anyway" IS THE PRIMARY ACTION, not a warning to be talked out of. The
// owner may have a perfectly good reason (their vet said so; it's the only thing
// the cat will eat), and Nyx's job here is to make sure they know, not to decide
// for them. So the copy ends by pointing at the vet, not at a rule — and "Not
// now" is the quieter of the two.
//
// NEVER REASSURES, NEVER ALARMS. There is no version of this sheet that says a
// food is fine; a food with nothing flagged simply never opens it. Register is
// the app's existing firm-but-calm safety tone — no danger state, no icon
// carrying meaning colour-only.
import { Modal, View, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  visible: boolean;
  title: string;
  body: string;
  /** "Day 24 of 56 · Zignature Duck" — the standing trial context, or null. */
  trialLine?: string | null;
  /** Proceed with the add (and, on the meal-log capture path, the meal). */
  onAddAnyway: () => void;
  /** Back out. Also fires on backdrop tap and Android back — a dismissed sheet
   *  must never be read as consent. */
  onNotNow: () => void;
}

export function TrialContaminantSheet({
  visible, title, body, trialLine, onAddAnyway, onNotNow,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNotNow}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onNotNow} />
      {/* Empty-onPress wrapper so taps on the sheet's own whitespace don't fall
          through to the absolute-positioned backdrop and dismiss it mid-read. */}
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.grabber} />
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.body}>{body}</ThemedText>
        {trialLine ? <ThemedText style={styles.trialLine}>{trialLine}</ThemedText> : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onNotNow}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Not now — don't add this food"
          >
            <ThemedText style={styles.secondaryText}>Not now</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onAddAnyway}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add this food anyway"
          >
            <ThemedText style={styles.primaryText}>Add anyway</ThemedText>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    position: 'absolute',
    left: theme.space2,
    right: theme.space2,
    bottom: theme.space3,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
    ...shadows.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space1,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  body: {
    fontSize: theme.textMD,
    lineHeight: theme.textMD * 1.45,
    color: theme.colorTextSecondary,
  },
  // The standing trial context, quietest line on the sheet — it answers "which
  // trial?" without competing with the fact above it.
  trialLine: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.space2,
    marginTop: theme.space2,
  },
  // Both targets clear 44pt (the 3am-test floor) via minHeight, not hitSlop alone.
  secondaryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  secondaryText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  primaryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralDark,
  },
  primaryText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
});
