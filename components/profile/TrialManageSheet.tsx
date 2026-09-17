// The trial card header's door — CUL-1040 (spec §4.1, D6a; mock §2).
//
// Two rows, and the whole point of the file is that they are never confused:
//
//   Change the window  → one row, one continuous episode, a longer window. Reversible.
//   Replace the trial  → ends this trial, starts a new one. Not reversible.
//
// ── WHY A DOOR AND NOT TWO HEADER LINKS ──────────────────────────────────────
//
// D6 weighed three shapes. (b) a second action on the card BODY puts a
// settings-shaped control on an intelligence surface and competes with the card's
// own actions; (c) a third row inside the existing Replace sheet hides the safe
// act inside the dangerous one's flow. (a) — this — resolves CUL-156's actual root
// (a header verb that promised an edit it could not perform) and keeps the
// destructive act behind exactly the tap count it has today, while making the safe
// one no cheaper and no more hidden.
//
// ── PRESENTATION ONLY ────────────────────────────────────────────────────────
//
// It owns no judgement. It does not know whether a window can move — that is
// `lib/trialWindowSheet.ts` and, behind it, `changeTrialWindow`'s own SELECT. It
// does not carry a confirm: `Replace the trial` keeps ITS existing confirm, which
// lives where the destruction does.
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  visible: boolean;
  /** The pet whose trial this is, for the subtitle. The host passes `activePet.name`,
   *  and that is correct here rather than a C-9 violation: this door only opens from
   *  the active pet's own card, so there is no route by which it could render another
   *  pet's record. (An earlier wording claimed the opposite — see the same note on
   *  `TrialWindowSheet`.) */
  petName: string;
  onClose: () => void;
  /** → the §4.2 sheet. */
  onChangeWindow: () => void;
  /** → the existing ordered end-and-replace flow, with its existing confirm. */
  onReplaceTrial: () => void;
}

const ROWS = [
  {
    id: 'change_window',
    label: 'Change the window',
    sub: 'The trial keeps running — only its length changes',
  },
  {
    id: 'replace_trial',
    label: 'Replace the trial',
    sub: 'End this one and start a new one',
  },
] as const;

export function TrialManageSheet({
  visible, petName, onClose, onChangeWindow, onReplaceTrial,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        {/* The layer declares itself modal so a screen reader cannot wander back
            into the profile behind it (C-14). */}
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
          <ThemedText style={styles.title}>Diet trial</ThemedText>
          <ThemedText style={styles.subtitle}>For {petName}</ThemedText>

          <View style={styles.rows}>
            {ROWS.map((row) => (
              <TouchableOpacity
                key={row.id}
                testID={`trial-manage-${row.id}`}
                style={styles.row}
                // ONE responder per row, wrapping BOTH lines, so the sub is part
                // of the same target rather than an inert label beside it — and
                // `accessible` joins them into one announcement instead of two
                // (the `owningTouchable` rule, C-6).
                accessible
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  if (row.id === 'change_window') onChangeWindow();
                  else onReplaceTrial();
                }}
              >
                <ThemedText style={styles.rowLabel}>{row.label}</ThemedText>
                <ThemedText style={styles.rowSub}>{row.sub}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            testID="trial-manage-cancel"
            style={styles.cancel}
            accessibilityRole="button"
            onPress={onClose}
          >
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  rows: {
    marginTop: theme.space2,
    // The two rows are adjacent touchables, so the gap clears both facing reaches.
    // Neither carries a hitSlop — each row is a full-width box well past the 44pt
    // floor — so the separation is the visible one and there is no invisible
    // overlap to derive (C-5).
    gap: theme.space1,
  },
  row: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    // Pins the geometry the 44pt floor depends on rather than leaving it to the
    // type's own leading (C-5).
    minHeight: 60,
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  rowSub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  cancel: {
    marginTop: theme.space2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
