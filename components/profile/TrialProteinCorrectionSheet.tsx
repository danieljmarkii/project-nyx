// The mid-trial trial-protein correction confirm — B-704 PR 4 (TP-3, mock frame H).
//
// The setup picker (`TrialProteinPicker`, PR 3) is first-set only; mid-trial, the
// allowed-set screen interposes THIS sheet when an edit CHANGES an existing
// owner-set value — the split `TrialProteinPicker`'s header describes ("the HOST…
// interpose the correction-confirm without this component knowing anything about
// it"). Presentation only: the copy is `TRIAL_PROTEIN_CORRECTION_NOTE` + the
// choice-derived button label, and the write goes through the host's `onConfirm`
// (→ `setTrialTargetProtein`).
//
// It states the whole-trial effect before committing — disclosed, not versioned —
// and its load-bearing second sentence is that the off-diet counts do not move
// (TG-1/TG-5). No checkbox: the C6/FR-11 disclosure pattern.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';

interface Props {
  /** `TRIAL_PROTEIN_CORRECTION_NOTE` — the §8 whole-trial disclosure. */
  note: string;
  /** `trialProteinCorrectionLabel(choice)` — "Change to venison" / "Remove the trial protein". */
  confirmLabel: string;
  /** Mid-write: the confirm button takes `PrimaryButton`'s loading state and both
   *  actions block, so a slow write cannot earn a second tap and two values. */
  saving?: boolean;
  /** A write that did not land — rendered in place, sheet stays open. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TrialProteinCorrectionSheet({
  note,
  confirmLabel,
  saving = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={saving ? undefined : onCancel}>
      <Pressable
        style={styles.scrim}
        onPress={saving ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="trial-protein-correction">
          <View style={styles.grabber} />
          <Text style={styles.note}>{note}</Text>

          {error !== null && (
            <Text testID="trial-protein-error" style={styles.error}>
              {error}
            </Text>
          )}

          <PrimaryButton
            testID="trial-protein-confirm"
            label={confirmLabel}
            onPress={onConfirm}
            loading={saving}
            style={styles.confirm}
          />
          <PrimaryButton
            testID="trial-protein-correction-cancel"
            label="Not now"
            variant="secondary"
            onPress={onCancel}
            disabled={saving}
            style={styles.cancel}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colorScrim,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingHorizontal: theme.space3,
    paddingTop: theme.space2,
    paddingBottom: theme.space3,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space2,
  },
  note: {
    fontSize: theme.textMD,
    lineHeight: theme.textMD * 1.45,
    color: theme.colorTextPrimary,
  },
  error: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextPrimary,
    marginTop: theme.space2,
  },
  confirm: {
    marginTop: theme.space3,
  },
  cancel: {
    marginTop: theme.space1,
  },
});
