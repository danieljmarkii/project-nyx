import { useState } from 'react';
import { StyleSheet, Platform, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// The "Change time" bottom sheet, extracted (CUL-606).
//
// MealCompletionCard and MedicationCompletionCard each carry their own inline copy
// of this modal. Rather than land a THIRD, the named card takes this shared one and
// the two incumbents adopt it in a follow-up (filed) — a strangler, not a rewrite:
// touching the app's best-loved surface is not this PR's job.
//
// Two details worth keeping when the others migrate. The empty-onPress Pressable
// around the sheet is load-bearing: without it a tap on the title or the whitespace
// falls through to the absolute-positioned backdrop and silently dismisses the
// picker mid-edit. And `maximumDate` pins to the mount time rather than a live
// clock — a "now" that advances while the wheel is open would let a scrub land a
// second in the future.
interface Props {
  /** The value the picker opens on. */
  value: Date;
  saving?: boolean;
  onCancel: () => void;
  onSave: (next: Date) => void;
}

export function TimeEditSheet({ value, saving = false, onCancel, onSave }: Props) {
  // Local draft, separate from the caller's authoritative time, so the picker can
  // be opened, scrubbed and cancelled without mutating anything.
  const [draft, setDraft] = useState<Date>(value);
  const [maximum] = useState(() => new Date());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <Pressable style={styles.sheet} onPress={() => {}}>
        <ThemedText style={styles.sheetTitle}>When did this happen?</ThemedText>
        <DateTimePicker
          value={draft}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximum}
          onChange={(_e, date) => {
            if (date) setDraft(date);
          }}
        />
        <View style={styles.actions}>
          <TouchableOpacity onPress={onCancel} hitSlop={12} style={styles.btn} accessibilityRole="button">
            <ThemedText style={styles.cancel}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSave(draft)}
            hitSlop={12}
            style={styles.btn}
            disabled={saving}
            accessibilityRole="button"
          >
            <ThemedText style={[styles.save, saving && styles.saveDisabled]}>Save</ThemedText>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrimBackdrop,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    padding: theme.space2,
    gap: theme.space1,
  },
  sheetTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space3,
  },
  btn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  cancel: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  save: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  saveDisabled: {
    opacity: 0.5,
  },
});
