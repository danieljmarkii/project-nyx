import { useState } from 'react';
import { StyleSheet, Platform, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

// The "Change time" bottom sheet, extracted (CUL-606) and now the ONLY one: the
// meal and dose cards' inline copies were deleted in favour of this (CUL-621), so
// all three completion surfaces ask the question the same way. The strangler is
// finished — do not re-inline a fourth.
//
// The `title` prop is REQUIRED, deliberately — see its doc comment. The meal and
// dose cards each edit a witnessed point, so they pass their own question about
// it ("When did this happen?" / "When was this dose given?").
//
// Two details are load-bearing and neither is visible in a diff. The empty-onPress
// Pressable around the sheet: without it a tap on the title or the whitespace falls
// through to the absolute-positioned backdrop and silently dismisses the picker
// mid-edit. And `maximumDate` pins to the mount time rather than a live clock — a
// "now" that advances while the wheel is open would let a scrub land a second in
// the future. Both are pinned by TimeEditSheet.test.tsx, which was mutation-checked
// against each defect rather than trusted for being green.
//
// CALLERS MOUNT THIS CONDITIONALLY (`{open && <TimeEditSheet …/>}`) — `visible` is
// hardcoded on the Modal, and the mount is what pins `maximumDate` to open-time.
// A caller that renders it unconditionally would pin the maximum to card-mount.
interface Props {
  /** The value the picker opens on. */
  value: Date;
  /**
   * The QUESTION being asked, and it is not decoration — it must name the field
   * the caller is about to write.
   *
   * This was hardcoded to "When did this happen?" and the `adversarial-reviewer`
   * broke it: on a "found by 5:33 PM" record the value written is the DISCOVERY
   * bound, not the occurrence time. An owner asked when it happened answers
   * honestly ("I was out from noon, probably around 2"), and the app stores that
   * as "discovered by 2:00 PM" — false, the discovery time it did hold is gone,
   * the window silently narrows, and occurred_at (the correlation engine's key)
   * moves earlier, toward the preceding meal.
   *
   * The confidence CLASS never changed, which is why the class-based guards saw
   * nothing. Required rather than defaulted, so a new caller has to state which
   * field it is editing instead of inheriting a question that may not match it.
   */
  title: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (next: Date) => void;
}

export function TimeEditSheet({ value, title, saving = false, onCancel, onSave }: Props) {
  // Local draft, separate from the caller's authoritative time, so the picker can
  // be opened, scrubbed and cancelled without mutating anything.
  const [draft, setDraft] = useState<Date>(value);
  const [maximum] = useState(() => new Date());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <Pressable style={styles.sheet} onPress={() => {}}>
        <ThemedText style={styles.sheetTitle}>{title}</ThemedText>
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
    opacity: theme.opacityDisabled,
  },
});
