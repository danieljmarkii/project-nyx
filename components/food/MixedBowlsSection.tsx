// Food detail's "In mixed bowls" section (Mixed meals, CUL-2085; spec §7.4, second
// bullet). Read-only: a mix is never a library item, so nothing here edits the food or
// the bowl. Each line is a door into History on its newest bowl's day (a registered
// door, `lib/historyDoors.ts` `food-mixed-bowls`); History keeps All time, so the
// earlier bowls are a scroll away.
//
// THREE STATES BELOW "has lines" (C-12), and only one of them is silent:
//   • loading  → nothing. The section is additive and the screen is already drawn;
//                a skeleton for a heading that may never exist would claim a mix.
//   • never mixed → nothing (§7.4: "only when the food has been mixed").
//   • a failed read → the heading and a way to try again, never the silent branch:
//                absence here reads as "never mixed", which the record has not said.
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { FoodMixLine } from '../../lib/foodMixedBowls';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';

export type MixedBowlsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; lines: FoodMixLine[] };

interface Props {
  state: MixedBowlsState;
  onOpenDay: (dayKey: string) => void;
  onRetry: () => void;
}

export function MixedBowlsSection({ state, onOpenDay, onRetry }: Props) {
  if (state.status === 'loading') return null;
  if (state.status === 'ready' && state.lines.length === 0) return null;

  return (
    <View style={styles.block} testID="food-mixed-bowls">
      <SectionLabel label="In mixed bowls" header />
      {state.status === 'error' ? (
        <TouchableOpacity
          style={styles.row}
          onPress={onRetry}
          activeOpacity={0.7}
          accessibilityRole="button"
          testID="food-mixed-bowls-retry"
        >
          <ThemedText style={styles.errorText}>Couldn't read the mixed bowls. Tap to try again.</ThemedText>
        </TouchableOpacity>
      ) : (
        state.lines.map((line) => (
          <TouchableOpacity
            key={line.key}
            style={styles.row}
            onPress={() => onOpenDay(line.lastDayKey)}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={line.accessibilityLabel}
            testID="food-mixed-bowls-line"
          >
            <ThemedText style={styles.lineText}>{line.text}</ThemedText>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: theme.space1,
  },
  // Full-width rows at the 44pt floor with no hitSlop, so stacked lines never share a
  // hit area (C-5).
  row: {
    minHeight: 44,
    justifyContent: 'center',
  },
  lineText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  errorText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
