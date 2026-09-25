// The count line (History v2, HV-7 / CUL-1164; spec §3.2, R-1; round 5 of the mock).
//
// Draws `countLineOf`'s answer and nothing it did not say: every word, every number and
// every clause comes from `lib/historyDays.ts` (HV-4), and this file only lays them out. A
// dose count's *N not given in full* (CUL-1193), CUL-1189's *record from* and *past its
// planned end*, and any clause a later ruling adds (CUL-1209) arrive in `line1` / `line2`
// and render as returned.
//
// Five forms: `pending` (the facts answer another window, so the line's silhouette, never
// numbers under the new window's name, C-12), `none` (a new account: nothing), `noticed`
// (one link to Patterns, H-9), `search` (the word and that it never counts, R-2) and `count`.
//
// The door is left-aligned and its own 44pt box (C-5): the FAB floats over the bottom-right
// of every tab, and a control that reached under it mid-scroll would be under the disc.
//
// Each line is said as it is drawn, with its " · " as a pause rather than a word
// (`spokenLine`, HV-10's focus pass).
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { countLineDoorHref } from '../../lib/historyScreen';
import { spokenLine } from '../../lib/spokenLine';
import type { CountLine as CountLineModel, CountLineDoor, CountLineText, HistoryFilter } from '../../lib/historyDays';
import { Skeleton } from '../ui/Skeleton';
import { ThemedText } from '../ui/ThemedText';

export interface CountLineProps {
  line: CountLineModel;
  /** The filter the line counts under: a symptom door opens that symptom's own detail. */
  filter: HistoryFilter;
  /** Overridable so a test follows a door without a router. */
  onOpenDoor?: (door: CountLineDoor) => void;
}

function openDoor(door: CountLineDoor, filter: HistoryFilter): void {
  router.push(countLineDoorHref(door.key, filter));
}

export function CountLine({ line, filter, onOpenDoor }: CountLineProps) {
  const open = (door: CountLineDoor) => (onOpenDoor ? onOpenDoor(door) : openDoor(door, filter));
  switch (line.kind) {
    case 'none':
      return null;
    case 'pending':
      // The line's silhouette while the facts answer another window: no number under a
      // name it does not belong to. Hidden from VoiceOver with the rest of the skeleton.
      return (
        <View style={styles.block} testID="history-count-line-pending" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Skeleton width="72%" height={theme.textSM} />
          <Skeleton width="48%" height={theme.textSM} style={styles.pendingLine2} />
        </View>
      );
    case 'noticed':
      return (
        <View style={styles.block} testID="history-count-line">
          <Door door={line.door} onPress={open} />
        </View>
      );
    case 'search':
      return (
        <View style={styles.block} testID="history-count-line">
          <LineOne text={line.line1} />
          <ThemedText style={styles.line2} accessibilityLabel={spokenLine(line.line2)}>
            {line.line2}
          </ThemedText>
        </View>
      );
    case 'count':
      return (
        <View style={styles.block} testID="history-count-line">
          <LineOne text={line.line1} />
          {line.line2 ? (
            <ThemedText style={styles.line2} accessibilityLabel={spokenLine(line.line2)}>
              {line.line2}
            </ThemedText>
          ) : null}
          {line.doors.map((door) => (
            <Door key={door.key} door={door} onPress={open} />
          ))}
        </View>
      );
  }
}

/** `lead` + **`strong`** + `tail`, one sentence to a screen reader. */
function LineOne({ text }: { text: CountLineText }) {
  return (
    <ThemedText
      style={styles.line1}
      accessibilityLabel={spokenLine(`${text.lead}${text.strong}${text.tail}`)}
      testID="history-count-line-1"
    >
      {text.lead}
      <ThemedText style={styles.strong}>{text.strong}</ThemedText>
      {text.tail}
    </ThemedText>
  );
}

function Door({ door, onPress }: { door: CountLineDoor; onPress: (door: CountLineDoor) => void }) {
  return (
    // The house text action (EmptyState's): a quiet press, no fill.
    <TouchableOpacity
      onPress={() => onPress(door)}
      activeOpacity={0.7}
      accessibilityRole="link"
      // The visible label, without the chevron glyph a screen reader would spell out.
      accessibilityLabel={door.label.replace(/\s*›\s*$/, '')}
      style={styles.door}
      testID={`history-door-${door.key}`}
    >
      <ThemedText style={styles.doorText}>{door.label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },
  line1: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  strong: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  line2: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
    marginTop: theme.spaceMicro,
  },
  pendingLine2: { marginTop: theme.space0_5 },
  // Its own 44pt box, left-aligned and only as wide as its words (C-5; the FAB).
  door: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  doorText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
