// The mid-trial add's confirm sheet — B-616 PR 2 (§2.3 / FR-11; mock screen C).
//
// Presentation only. Every string comes from `buildAddTrialFoodSheet`
// (lib/trialFoodsScreen.ts) and the write goes through `addTrialFood`
// (lib/dietTrialSetup.ts); this file lays out three facts and two buttons and owns
// no judgement of its own.
//
// ── WHAT THIS SHEET DELIBERATELY DOES NOT DO ────────────────────────────────
//
// It does not ask the role (Principle 1 — inferred from the food's own type), and
// it does not ask whether adding is wise. Dr. Chen's note on the mock is the
// reason: the vet made that call, the dated record is the safety mechanism, and
// "are you sure this fits the trial?" would judge an owner for following their
// vet's instruction. There is no destructive path here either — declining just
// closes.
//
// The one line that has to survive every future edit is `Earlier feedings — Keep
// the reading they already have`. Without it the add reads as an amnesty, and the
// write path's whole safety property (`allowed_from` = today, never `started_at`)
// becomes invisible to the person it protects.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import type { AddTrialFoodSheetModel } from '../../lib/trialFoodsScreen';

interface Props {
  model: AddTrialFoodSheetModel;
  /** Mid-write. The confirm button takes `PrimaryButton`'s loading state and both
   *  actions block, so a slow insert cannot earn a second tap and two rows. */
  saving?: boolean;
  /** A write that did not land. Rendered in place rather than as a toast, and the
   *  sheet stays open behind it: the failure mode this exists to prevent is an
   *  owner closing a sheet that silently did nothing and believing the food is on
   *  the list — which would make the vet report's next off-diet exposure look
   *  like the app's mistake to them, and their mistake to the vet. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AddTrialFoodSheet({
  model,
  saving = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={saving ? undefined : onCancel}
    >
      {/* The scrim dismisses, matching every other sheet in the app — but not
          while a write is in flight, where a stray tap outside would leave the
          owner unsure whether the food landed. */}
      <Pressable
        style={styles.scrim}
        onPress={saving ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="add-trial-food-sheet">
          <View style={styles.grabber} />
          <Text style={styles.title}>{model.title}</Text>

          {model.rows.map((row) => (
            <View key={row.label} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{row.label}</Text>
              <Text style={styles.kvValue}>{row.value}</Text>
            </View>
          ))}

          {error !== null && (
            <Text testID="add-trial-food-error" style={styles.error}>
              {error}
            </Text>
          )}

          <PrimaryButton
            testID="add-trial-food-confirm"
            label={model.confirmLabel}
            onPress={onConfirm}
            loading={saving}
            style={styles.confirm}
          />
          <PrimaryButton
            testID="add-trial-food-cancel"
            label={model.cancelLabel}
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
    borderRadius: 2,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginBottom: theme.space2,
  },
  // Label left, value right — the mock's kv shape. The value wraps rather than
  // truncating: a food label is the one thing on this sheet the owner needs to
  // read in full before confirming.
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingVertical: theme.space1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  kvLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flexShrink: 0,
  },
  kvValue: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextPrimary,
    textAlign: 'right',
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
