// "Why this is on the list" — B-616 PR 4 (§2.6), the surface B-475 was filed for.
// Design authority: the reason sheets in `docs/nyx-diet-trial-mockups.html`.
//
// Presentation only, and deliberately thin. Every word comes from
// `lib/dietTrial.explainVerdict` / `oralRouteCopy` via `buildTrialExposuresScreen`;
// this file lays out a title, a row's identity, and the module's two sentences.
//
// ── WHY IT EXISTS AT ALL ────────────────────────────────────────────────────
//
// §6.3: a flag the owner cannot interrogate is an unfalsifiable accusation. The
// list one screen up tells an owner that a feeding fell outside the trial diet;
// this is where they get to ask why, and where the answer names which rung fired
// rather than restating the verdict louder.
//
// It has ONE action — close. Nothing here offers to re-classify the feeding, and
// nothing offers an amnesty: adding the food to the allowed list is reachable from
// the food's own detail screen (FR-14) and applies from today, which is the whole
// point of dated membership. A "this was fine actually" button on the screen that
// itemises exposures would let the record be edited to agree with the owner's
// memory, on the artifact a vet reads.
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import {
  EXPOSURE_REASON_TITLE,
  type TrialExposureRow,
} from '../../lib/trialExposuresScreen';

interface Props {
  row: TrialExposureRow;
  onClose: () => void;
}

export function ExposureReasonSheet({ row, onClose }: Props) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="exposure-reason-sheet">
          <View style={styles.grabber} />
          <ThemedText style={styles.title}>{EXPOSURE_REASON_TITLE}</ThemedText>
          {/* The row's own identity, so the sheet can never be read against the
              wrong feeding — the list is chronological and two rows can carry the
              same food on different days. */}
          <ThemedText style={styles.subject}>
            {row.label} · {row.meta}
          </ThemedText>

          {row.reason !== null && (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <ThemedText testID="exposure-reason-title" style={styles.reasonTitle}>
                {row.reason.title}
              </ThemedText>
              <ThemedText testID="exposure-reason-body" style={styles.reasonBody}>
                {row.reason.body}
              </ThemedText>
            </ScrollView>
          )}

          <PrimaryButton
            testID="exposure-reason-close"
            label="Close"
            variant="secondary"
            onPress={onClose}
            style={styles.close}
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
  },
  subject: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  // Scrolls rather than truncates: the rung-2 reason names every protein it found,
  // and a long ingredient list is exactly the case an owner opened this for.
  body: {
    marginTop: theme.space2,
    maxHeight: 320,
  },
  bodyContent: {
    paddingBottom: theme.space1,
  },
  reasonTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  reasonBody: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  close: {
    marginTop: theme.space3,
  },
});
