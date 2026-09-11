import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import type { VisitSaveSummary } from '../../lib/vetVisitPlan';

interface Props {
  summary: VisitSaveSummary;
  onDone: () => void;
}

// The saved moment (mock D2) — the completion surface for a logged visit.
//
// IT SPEAKS THE RECORD, not the word "Saved" (C-17): it names the pet, states what
// the save did to the two surfaces that move because of it, and lists what was
// linked. Every string is DERIVED from `describeVisitSave` rather than assembled
// here, so the one clinically load-bearing sentence on this screen — what happens to
// the vet report's window — has one home and one test.
//
// TWO THINGS IT DELIBERATELY NEVER SAYS:
//   • "from today". The report's rung 1 is strictly before today, so a report built
//     in the car park still runs to yesterday (§4.1 D2, AC 8/AC 9). The mock's own
//     D2 frame reads "starts from today" and is superseded by that ruling.
//   • anything about the visit being good, complete, or well recorded. A visit saved
//     with nothing typed is an ordinary visit, and the moment reads the same.
//
// It does not auto-dismiss. The three bottom cards in `store/momentStore` are beats
// over a surface the owner is already looking at; this is a full screen at the end of
// a flow, and it carries facts the owner may want to re-read — a timer would take
// them away mid-sentence.
export function VisitSavedMoment({ summary, onDone }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Check size={22} color={theme.colorSurface} strokeWidth={3} />
      </View>
      <ThemedText style={styles.heading}>{summary.heading}</ThemedText>

      {summary.reportLine ? (
        <ThemedText style={styles.consequence}>{summary.reportLine}</ThemedText>
      ) : null}
      {summary.homeLine ? (
        <ThemedText style={styles.consequence}>{summary.homeLine}</ThemedText>
      ) : null}

      {summary.linked.length > 0 ? (
        <View style={styles.linked}>
          {summary.linked.map((line) => (
            <View key={line.key} style={styles.linkedRow}>
              <ThemedText style={styles.linkedTitle} numberOfLines={2}>
                {line.title}
              </ThemedText>
              <ThemedText style={styles.linkedNote}>{line.note}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      <ThemedText style={styles.offline}>{summary.offlineLine}</ThemedText>

      <PrimaryButton label="Done" onPress={onDone} style={styles.done} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: theme.space3,
    paddingTop: theme.space5,
    gap: theme.space2,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colorAccentInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    marginTop: theme.space1,
  },
  consequence: {
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextSecondary,
  },
  linked: {
    marginTop: theme.space2,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  linkedTitle: {
    flex: 1,
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  linkedNote: {
    // The note is the shorter half and the one stated fewest times on the surface,
    // so it is the half protected from the squeeze (C-8).
    flexShrink: 0,
    maxWidth: '100%',
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  offline: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space2,
  },
  done: {
    marginTop: 'auto',
    marginBottom: theme.space3,
  },
});
