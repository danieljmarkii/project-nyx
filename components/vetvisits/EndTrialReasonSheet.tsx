import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colorRoles, theme } from '../../constants/theme';
import { Divider } from '../ui/Divider';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import { stopReasonOptions } from '../../lib/dietTrialSetup';
import {
  STOPPED_SHEET_TITLE,
  stopReasonNote,
  type TrialStopReason,
} from '../../lib/dietTrialCompletion';
import type { EndConfirmCopy } from '../../lib/vetVisitPlan';

// CUL-1090 (ruled (b), 2026-10-12): *Ended* before the target asks WHY, because the
// reason is what the vet report prints. A fixed `vet_advised` told a vet "stopped on
// veterinary advice" about a cat that would not eat the food, and `refused` is the
// token that turns on the report's refusal lines and the app's no-adherence rule.
//
// The SAME list *Switched*'s blocked step offers (`stopReasonOptions`, which delegates
// to §4.3's `trialStopReasons`): one vocabulary in one TEXT column a clinician reads
// verbatim. Only the early half is offered — before the target the trial cannot have
// run its course, and `completed` over an abandoned trial would erase the reason.
//
// This sheet WRITES NOTHING. It hands the reason back; the host owns the link, the
// ending, the refused-end race and the settled row (`applyTrialVerdict`). Cancel and
// *Keep it* close it with the trial still running.
//
// PAST THE TARGET it opens too, from the confirm's *Something got in the way* (PM,
// 2026-10-19, the adversarial pass's residual): *End it* there stays the one tap that
// records `completed`, and this sheet is the door a refusal on day 60 of 56 needs —
// without it the report read "Ran its course" over a diet the pet would not eat.
// The list stays the early six; "It ran its course" is the confirm's own button.

/** The question over the reasons. Before the target the day line explains why it is
 *  "early"; past it, nothing is early, so it asks what §4.3's stopped sheet asks. */
export function endTrialReasonPrompt(dayLine: string | null, complete: boolean): string {
  if (complete) return STOPPED_SHEET_TITLE;
  return dayLine ? `${dayLine}, so it’s ending early. Which was it?` : 'Which was it?';
}

interface Props {
  petName: string;
  /** The confirm's own title and day line (`endTrialCopy`), so the sheet names the
   *  same trial and the same day the write will record. */
  copy: EndConfirmCopy;
  /** The question over the reasons (`endTrialReasonPrompt`). */
  prompt: string;
  onKeep: () => void;
  onEnd: (reason: TrialStopReason) => void;
}

export function EndTrialReasonSheet({ petName, copy, prompt, onKeep, onEnd }: Props) {
  const [reason, setReason] = useState<TrialStopReason | null>(null);
  const reasons = stopReasonOptions(petName, false);
  const note = reason ? stopReasonNote(reason, petName) : null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onKeep}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onKeep} hitSlop={8}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Diet trial</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.form}>
          <ThemedText style={styles.sheetTitle}>{copy.title}</ThemedText>
          <ThemedText style={styles.sheetSub}>{copy.body}</ThemedText>
          <Divider style={styles.blockDivider} />
          <ThemedText style={styles.reasonPrompt}>{prompt}</ThemedText>
          {reasons.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={styles.reasonRow}
              // The early list never carries `completed` (the `false` above), so every
              // value here is a stopped-early token, before the target or past it.
              onPress={() => setReason(r.value as TrialStopReason)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: reason === r.value }}
              hitSlop={4}
            >
              <View style={[styles.radio, reason === r.value && styles.radioOn]} />
              <ThemedText style={styles.reasonLabel}>{r.label}</ThemedText>
            </TouchableOpacity>
          ))}
          {/* Intake is not preference: a refusal says it is a health question here,
              in the words the trial screen's own stopped-early sheet uses. */}
          {note ? <ThemedText style={styles.reasonNote}>{note}</ThemedText> : null}
          <PrimaryButton
            label={copy.confirmLabel}
            onPress={() => {
              if (reason) onEnd(reason);
            }}
            disabled={!reason}
            style={styles.primaryAction}
          />
          <TouchableOpacity onPress={onKeep} style={styles.quietAction} hitSlop={8}>
            <ThemedText style={styles.quietActionText}>{copy.keepLabel}</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// The blocked step's styles (`StartTrialModal`), so the two reason lists look alike.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  headerSpacer: {
    width: 56,
  },
  cancelText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  sheetTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorNeutralDark,
  },
  sheetSub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  blockDivider: {
    marginVertical: theme.space2,
  },
  reasonPrompt: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 48,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radiusFull,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
  },
  radioOn: {
    borderColor: colorRoles.selected.edge,
    borderWidth: 6,
  },
  reasonLabel: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  reasonNote: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  primaryAction: {
    marginTop: theme.space2,
  },
  quietAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  quietActionText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
