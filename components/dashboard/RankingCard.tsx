import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { calibrationLine, type CardDisplayState } from '../../lib/dashboardCards';

// RankingCard — "Top food", "Top protein" (§5 #3 / §6). A short ranked list with
// counts, never a pie chart. This is DESCRIPTIVE INTAKE, not preference (§11 #1): it
// answers "what does Nyx eat most", never "what does Nyx like" — so it carries NO
// verdict colour (neutral) and no good/bad framing. A treat topping the FOOD list is
// tagged honestly rather than hidden. Below the §11 #5 ranking floor the card shows
// the calibration state, never a fabricated top-N.

export interface RankingEntry {
  /** Stable key (food id / protein key). */
  key: string;
  /** Display label ("Tiki Cat Tuna", "chicken"). */
  label: string;
  /** Pre-formatted right-side value ("12 meals", "8×"). */
  value: string;
  /** Optional honest tag (e.g. "treat" on a treat that tops the food list). */
  tag?: string;
}

interface Props {
  title: string;
  entries: RankingEntry[];
  /** calibrating / empty / populated (§10). Default populated. */
  state?: CardDisplayState;
  calibrationUnit?: string;
  emptyMessage?: string;
  petName?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function RankingCard({
  title,
  entries,
  state = { kind: 'populated' },
  calibrationUnit = 'meal',
  emptyMessage,
  petName,
  onPress,
  accessibilityHint,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full list' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
      </View>

      {state.kind === 'calibrating' ? (
        <Text style={styles.stateText}>
          {calibrationLine(state.remaining, calibrationUnit, petName)}
        </Text>
      ) : state.kind === 'empty' || entries.length === 0 ? (
        <Text style={styles.stateText}>{emptyMessage ?? 'Nothing logged yet.'}</Text>
      ) : (
        <View style={styles.list}>
          {entries.map((entry, i) => (
            <View key={entry.key} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.entryLabel} numberOfLines={1}>
                {entry.label}
              </Text>
              {entry.tag != null && <Text style={styles.tag}>{entry.tag}</Text>}
              <Text style={styles.entryValue}>{entry.value}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space2,
  },
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  list: {
    gap: theme.space2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  rank: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextDisabled,
    width: 16,
  },
  entryLabel: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  tag: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
  },
  entryValue: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
