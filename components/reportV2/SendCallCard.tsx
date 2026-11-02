import { StyleSheet, View, type ViewInstance } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui';
import type { SendCallCard as SendCallCardModel } from '../../lib/reportSend';

// The call card the send sheet leads with and a flagged confirmation repeats (Vet report v2
// PR-18, CUL-2298; spec §10.3, §10.5; mock d1, d5, e2). The composer's card is the same set in
// the same words (`liveCardCopy`); this one adds the rows saying who to call.
//
// STILL, AND SILENT. No pulse, no motion of its own, no haptic: plainness is the severity signal,
// and the card is in the sheet's first frame or not at all. This file is named in
// `guards/haptics.test.ts`'s ALWAYS_SCANNED because it carries none of the markers and is
// exactly where a "landed" buzz would read as natural.
//
// THE ROWS ARE WORDS, NOT BUTTONS. No clinic phone or emergency vet is stored, so a row that
// looked tappable would be a door to nowhere (lib/reportSend.ts header).

interface Props {
  card: SendCallCardModel;
  testID?: string;
  /** The sheet moves VoiceOver focus here once it is up. */
  focusRef?: React.RefObject<ViewInstance | null>;
}

export function SendCallCard({ card, testID, focusRef }: Props) {
  const rows = card.rows.map((r) => r.text).join(' ');
  return (
    <View
      ref={focusRef}
      style={styles.card}
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={[card.title, card.body, rows].filter((x) => x !== '').join('. ')}
    >
      <View style={styles.rail} />
      <View style={styles.text}>
        <ThemedText style={styles.title}>{card.title}</ThemedText>
        <ThemedText style={styles.body}>{card.body}</ThemedText>
        {card.rows.map((r) => (
          <ThemedText key={r.id} style={styles.row} testID={`${testID ?? 'call-card'}-row-${r.id}`}>
            {r.text}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colorEventSymptomBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    overflow: 'hidden',
  },
  rail: { width: theme.railWidth, backgroundColor: theme.colorEventSymptom },
  text: { flex: 1, padding: theme.space2, gap: theme.space1 },
  title: { fontSize: theme.textMD, fontWeight: theme.weightSemibold, color: theme.colorEventSymptomInk },
  body: { fontSize: theme.textSM, color: theme.colorTextPrimary },
  row: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
});
