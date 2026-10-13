import { StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { COMPLETION_READ_OFFER, COMPLETION_READ_OPEN } from '../../constants/aiConsentCopy';
import { ThemedText } from './ThemedText';

// Frame D0 (CUL-1835; mock round 4 §3): on a photographed vomit or stool's completion
// card while the owner has not answered the AI question. It offers the read and opens
// the record, where the question is asked in the read's own slot; it never asks it, so
// no answer is ever given on a 5-second card.
//
// The FloorRaiseLine's shape: one control, no hitSlop, a 44pt floor, its own row above
// the action row, whose Undo reaches 12pt up (C-5).
export function ReadOfferLine({ onOpen }: { onOpen: () => void }) {
  return (
    <TouchableOpacity
      onPress={onOpen}
      style={styles.block}
      accessibilityRole="link"
      accessibilityLabel={`${COMPLETION_READ_OFFER} ${COMPLETION_READ_OPEN}`}
      activeOpacity={0.8}
      testID="named-card-read-offer"
    >
      <ThemedText style={styles.line}>{COMPLETION_READ_OFFER}</ThemedText>
      <ThemedText style={styles.open}>{COMPLETION_READ_OPEN}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  block: {
    minHeight: 44,
    justifyContent: 'center',
    gap: 2,
  },
  line: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightSemibold,
  },
  open: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
});
