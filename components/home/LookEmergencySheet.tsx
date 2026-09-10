// The emergency door's page — *When to call the vet* (CUL-871 / N-4a; daily-look spec
// §3.7, §4.6, T-4).
//
// One quiet door under the first row of the unfolded grid, labelled for the AMBIGUOUS
// morning rather than the alarmed one: the owner it exists for is the one who is not
// yet worried, and "worried about something more serious" self-selects for the owner
// who already is (Sam) — which is not the wedge user.
//
// IT WRITES NOTHING AND ESCALATES NOTHING. Every judgement here is
// `lib/lookEmergency.ts`'s, which is a pure function over facts the record can already
// settle; this file only draws it. That split is deliberate: the collapse rule (a
// conditional whose condition the record meets becomes the imperative) is the one
// thing on this surface that must be tested per condition, and a test should not have
// to render a Modal to do it.
//
// NO HAPTICS, BY RULE. This is a safety surface: the page can read "Call your vet
// today.", and a phone that buzzes when it does is rewarding the owner for bad news
// (D7, `guards/haptics.test.ts` — this file is in ALWAYS_SCANNED, so the absence is
// enforced rather than remembered).

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import type { LookSpecies } from '../../constants/lookWords';
import {
  CALL_NOW_HEADER,
  CALL_TODAY_HEADER,
  EMERGENCY_SHEET_TITLE,
  resolveEmergencyDoor,
  type EmergencyFacts,
} from '../../lib/lookEmergency';

interface Props {
  visible: boolean;
  species: LookSpecies;
  /** What the record can settle right now — `null` while it has not answered, which
   *  the resolver reads as "fail closed" and NOT as a quiet record (C-12, and the
   *  n=1 asymmetry: absence of facts never reassures). */
  facts: EmergencyFacts | null;
  onClose: () => void;
}

export function LookEmergencySheet({ visible, species, facts, onClose }: Props) {
  const door = resolveEmergencyDoor(species, facts);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <ThemedText style={styles.title}>{EMERGENCY_SHEET_TITLE}</ThemedText>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {/* Block 1 — the signs that are never an impression. Record-independent: none
              of these is a thing the app holds a row for, which is exactly why they are
              printed rather than offered as chips (§4.1 rule 9). */}
          <ThemedText style={styles.blockHeader}>{CALL_NOW_HEADER}</ThemedText>
          {door.now.map((line) => (
            <View key={line} style={styles.row}>
              <ThemedText style={styles.bullet}>·</ThemedText>
              <ThemedText style={styles.rowText}>{line}</ThemedText>
            </View>
          ))}

          <ThemedText style={[styles.blockHeader, styles.blockHeaderSpaced]}>
            {CALL_TODAY_HEADER}
          </ThemedText>
          {/* The collapse. A met threshold does not appear beside the imperative — it
              HAS BECOME the imperative, which is the whole rule (§4.6, the adversarial
              pass's gap 3: v0.1 cited the rule inside the clause that broke it). The
              met condition is deliberately not named: naming it would turn this page
              into a finding about the pet, and this door escalates nothing. */}
          {door.imperative !== null && (
            <ThemedText style={styles.imperative} testID="look-emergency-imperative">
              {door.imperative}
            </ThemedText>
          )}
          {door.thresholds.map((line) => (
            <View key={line} style={styles.row}>
              <ThemedText style={styles.bullet}>·</ThemedText>
              <ThemedText style={styles.rowText}>{line}</ThemedText>
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <ThemedText style={styles.closeText}>Close</ThemedText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    position: 'absolute',
    left: theme.space2,
    right: theme.space2,
    bottom: theme.space3,
    maxHeight: '80%',
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
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
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  scroll: { flexGrow: 0 },
  scrollBody: { gap: theme.space0_5, paddingBottom: theme.space1 },
  blockHeader: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: theme.space1,
  },
  blockHeaderSpaced: { marginTop: theme.space2 },
  row: { flexDirection: 'row', gap: theme.space1 },
  bullet: { fontSize: theme.textSM, color: theme.colorTextSecondary, lineHeight: theme.lineHeightSM },
  rowText: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  imperative: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    // The attention ink on its own wash — the pair theme.contrast.test.ts pins for
    // small text. Never the bright category colour (C-1).
    color: theme.colorAttentionInk,
    backgroundColor: theme.colorAttentionLight,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    marginTop: theme.space0_5,
  },
  close: {
    alignSelf: 'center',
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space3,
    marginTop: theme.space1,
  },
  closeText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
});
