import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { theme, shadows } from '../../constants/theme';
import { AdherenceChipRow, DoseAdherence } from './AdherenceChipRow';
import { comboConfirmHeadsUp, comboAdherencePrompt } from '../../lib/medications';

// B-325 — the retroactive combo-confirm sheet. Shown when an owner adds a med to an
// ALREADY-logged meal/treat the pet DID NOT FINISH (vehicle refused/picked). This is the
// deliberate, discoverable home for the intake→adherence safety prompt that PR B3 first
// gave to the (auto-dismissing) completion card: a modal the owner ANSWERS, never a toast
// they race. The Designer/persona call (B-325): a bottom sheet beats an inline prompt on
// two counts the PM set — discoverable (a modal can't be scrolled past) and it still
// returns the owner to the treat afterwards; adherence stays editable later on the dose's
// own detail screen (the G2 edit home).
//
// The dose is written UNCONFIRMED (null adherence) BEFORE this sheet opens, so a killed
// app can never lose the dose or leave a false "given" — this sheet only RESOLVES a dose
// that already exists safely (clinical-guardrails Pattern 2). "Not sure yet" is a
// first-class dismiss that leaves the dose unconfirmed, which resurfaces calmly (History
// "Unconfirmed" tag + the dose-detail note). There is NO path here to a reassuring verdict
// by construction: the chips start unselected and the only affirmative states are the
// owner's own explicit taps.
interface Props {
  visible: boolean;
  petName: string;
  foodName: string | null;
  // Resolve the dose to the owner's explicit answer.
  onAnswer: (adherence: DoseAdherence) => void;
  // Leave the dose unconfirmed (the calm resurface handles it later).
  onNotSure: () => void;
}

export function ComboDoseConfirmSheet({ visible, petName, foodName, onAnswer, onNotSure }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNotSure}
      statusBarTranslucent
    >
      {/* Tapping the backdrop is "Not sure yet" — a dismiss must never silently coerce a
          "given"; it leaves the dose unconfirmed, exactly like the explicit button. */}
      <Pressable style={styles.backdrop} onPress={onNotSure} />
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.grabber} />
        {/* Heads-up: the fact, naming the specific not-finished food. Never softens the
            refusal, never reassures (clinical-guardrails). */}
        <Text style={styles.headsUp}>{comboConfirmHeadsUp({ petName, foodName })}</Text>
        <Text style={styles.question}>{comboAdherencePrompt({ petName, inDoubt: true })}</Text>
        {/* The real dose-adherence chips (given / partial / missed / refused) — the same
            scale the dose detail screen uses. None pre-lit: a logged combo dose in doubt
            has no assumed state. One tap answers and closes. */}
        <View style={styles.chips}>
          <AdherenceChipRow value={null} onChange={onAnswer} label={null} />
        </View>
        <TouchableOpacity
          style={styles.notSure}
          onPress={onNotSure}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Not sure yet — leave this dose unconfirmed"
        >
          <Text style={styles.notSureText}>Not sure yet</Text>
        </TouchableOpacity>
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
  headsUp: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  question: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  chips: {
    marginBottom: theme.space1,
  },
  // A quiet, centered escape — never louder than the chips (the affirmative path). A
  // 44pt tap target (the 3am-test floor) via padding + hitSlop.
  notSure: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  notSureText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
  },
});
