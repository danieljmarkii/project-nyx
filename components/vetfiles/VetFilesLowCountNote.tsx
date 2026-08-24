import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  onAdd: () => void;
}

// The "young library" note (B-712, mock round-3 R3b). A library holding one or two
// documents is not empty — VetFilesEmptyState is a different screen — but on a full
// phone it reads as a void beneath a single row. This is the designed state between
// one and many: a quiet, forward-looking line naming what else belongs here, plus a
// low-key way to add the next.
//
// It is tertiary and calm on purpose — it invites, it does not nag (Principle 4);
// the primary add affordance is still the header +. The copy names concrete record
// types (specific over generic) and the moment they matter (a future vet asking),
// and it never claims completeness — "live here too", not "everything belongs here".
export function VetFilesLowCountNote({ onAdd }: Props) {
  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.line}>
        Vaccine certificates, lab results and clinic emails all live here too —
        whatever a future vet might ask for.
      </ThemedText>
      <TouchableOpacity
        onPress={onAdd}
        activeOpacity={0.7}
        // Small visual target on a calm surface, so the slop carries it past 44pt.
        hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
        accessibilityRole="button"
        accessibilityLabel="Add another document"
      >
        <ThemedText style={styles.add}>Add another document</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 10,
    paddingTop: theme.space3,
    paddingBottom: theme.space2,
    paddingHorizontal: theme.space3,
  },
  line: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
    maxWidth: 280,
  },
  add: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
});
