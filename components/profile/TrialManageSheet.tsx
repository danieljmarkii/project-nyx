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
// ── ONE MODAL, TWO STEPS (C-14) ──────────────────────────────────────────────
//
// *Change the window* does not present a second `Modal` — this one keeps the stage
// and swaps its body for `TrialWindowPanel`. The first cut shipped the panel as its
// own sheet, so this file's row handler closed one sibling Modal and presented
// another in the SAME React commit, which is the shape C-14 records wedging the beta
// log sheet until the app was force-quit. `TrialCompletionSheet`, in this directory,
// already holds one Modal and switches a `step` between its decision rows and the
// forms behind them; this is that.
//
// `Replace the trial` still crosses to `StartTrialModal`, which cannot fold in — it
// is reached independently from a terminal card's header and keeps a half-filled
// form alive across dismissals. So that one hand-off is SEQUENCED instead: the row
// only closes this sheet, and the host opens the next one once this Modal's own
// dismissal has actually completed (`onDismissed`).
//
// ── PRESENTATION ONLY ────────────────────────────────────────────────────────
//
// It owns no judgement. It does not know whether a window can move — that is
// `lib/trialWindowSheet.ts` and, behind it, `changeTrialWindow`'s own SELECT. It
// does not carry a confirm: `Replace the trial` keeps ITS existing confirm, which
// lives where the destruction does.
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { TrialWindowPanel } from './TrialWindowPanel';
import type { TrialWindowSheetTrial } from './TrialWindowPanel';

/** Which body is on the stage. `door` is always where it opens. */
type Step = 'door' | 'window';

interface Props {
  visible: boolean;
  /** The running trial, for the window step. Null on anything but a running trial,
   *  so that step cannot open over a window that is a finished fact. */
  trial: TrialWindowSheetTrial | null;
  busy?: boolean;
  /** The host's phrasing of a refused write — never an error's `message`. */
  writeError?: string | null;
  /** The pet whose trial this is, for the subtitle. The host passes `activePet.name`,
   *  and that is correct here rather than a C-9 violation: this door only opens from
   *  the active pet's own card, so there is no route by which it could render another
   *  pet's record. (An earlier wording claimed the opposite — see the same note on
   *  `TrialWindowSheet`.) */
  petName: string;
  onClose: () => void;
  /**
   * This Modal has finished dismissing, so it is safe to present another.
   *
   * THE ONE HAND-OFF THAT STILL CROSSES A MODAL BOUNDARY rides this rather than
   * firing in the row's own commit (C-14). RN's `onDismiss` is iOS-only and fires
   * after the native dismissal animation, which is precisely the window in which a
   * second `present` is unreliable; Android has no equivalent event and no
   * UIViewController presentation to collide with, so the row calls this directly
   * there. No timer either way.
   */
  onDismissed?: () => void;
  /** The owner chose to end this trial and start another — the EXISTING flow, with
   *  its existing confirm. The host waits for `onDismissed` before presenting it. */
  onReplaceTrial: () => void;
  /** The window step's own props, passed through. */
  onSelectionChanged?: () => void;
  onSave: (input: { targetDurationDays: number; vetDirected: boolean }) => void;
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
  visible, trial, petName, busy = false, writeError = null,
  onClose, onDismissed, onReplaceTrial, onSelectionChanged, onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('door');

  // EVERY OPEN LANDS ON THE DOOR. Re-opening from the header must never drop the
  // owner straight into the form they were last in — the door is what names the two
  // acts, and skipping it is how a destructive neighbour gets picked by muscle
  // memory. The panel's own state resets by UNMOUNTING when the step leaves it.
  useEffect(() => {
    if (visible) setStep('door');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // iOS only, and load-bearing: it fires after the dismissal animation, which is
      // the one moment a sibling Modal may safely present.
      onDismiss={onDismissed}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        {/* The layer declares itself modal so a screen reader cannot wander back
            into the profile behind it (C-14). */}
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />

          {step === 'window' && trial ? (
            <TrialWindowPanel
              trial={trial}
              petName={petName}
              busy={busy}
              writeError={writeError}
              // Back to the door, not out of the sheet — the owner came through it.
              onClose={() => setStep('door')}
              onSelectionChanged={onSelectionChanged}
              onSave={onSave}
            />
          ) : (
            <DoorBody
              petName={petName}
              trial={trial}
              onClose={onClose}
              onChangeWindow={() => setStep('window')}
              onReplaceTrial={onReplaceTrial}
              onDismissed={onDismissed}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DoorBody({
  petName, trial, onClose, onChangeWindow, onReplaceTrial, onDismissed,
}: {
  petName: string;
  trial: TrialWindowSheetTrial | null;
  onClose: () => void;
  onChangeWindow: () => void;
  onReplaceTrial: () => void;
  onDismissed?: () => void;
}) {
  return (
    <>
      <ThemedText style={styles.title}>Diet trial</ThemedText>
      <ThemedText style={styles.subtitle}>For {petName}</ThemedText>

      <View style={styles.rows}>
        {ROWS.map((row) => (
          <TouchableOpacity
            key={row.id}
            testID={`trial-manage-${row.id}`}
            style={styles.row}
            // ONE responder per row, wrapping BOTH lines, so the sub is part of the
            // same target rather than an inert label beside it — and `accessible`
            // joins them into one announcement instead of two (C-6).
            accessible
            accessibilityRole="button"
            // `change_window` is a STEP, so this Modal never dismisses and nothing is
            // presented over it. `replace_trial` is the one act that crosses to
            // another Modal, so it only CLOSES — and on Android, where there is no
            // `onDismiss`, it says so directly.
            disabled={row.id === 'change_window' && !trial}
            onPress={() => {
              if (row.id === 'change_window') { onChangeWindow(); return; }
              // ARM, then close. `onReplaceTrial` sets the host's pending ref; the
              // presenting happens on `onDismissed`. Dropping this call in the first
              // draft of the refactor made `Replace the trial` do nothing at all —
              // the ref never armed, so the dismissal had nothing to consume.
              onReplaceTrial();
              onClose();
              if (Platform.OS !== 'ios') onDismissed?.();
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
    </>
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
