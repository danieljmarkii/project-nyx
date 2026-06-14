import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { calibrationLine, type CardDisplayState } from '../../lib/dashboardCards';

// RankingCard — "Top food", "Top protein" (§5 #3 / §6). A ranked BAR LIST: each row pairs
// the label with an inline magnitude bar (width ∝ its share of the #1 entry) so the
// ranking is read at a glance, not decoded from a column of numbers (the B-098 design
// lift — the old plain numbered list read "bleh"). Still a ranked list with counts, never
// a pie chart (§4.1). DESCRIPTIVE INTAKE, not preference (§11 #1): it answers "what does
// Nyx eat most", never "what does Nyx like" — so it carries NO verdict colour. The bar is
// the same calm accent tint as the composition + finished-rate bars (one magnitude
// language across the dashboard). A treat topping the FOOD list is tagged honestly. Below
// the §11 #5 ranking floor the card shows the calibration state, never a fabricated top-N.

export interface RankingEntry {
  /** Stable key (food id / protein key). */
  key: string;
  /** Display label ("Tiki Cat Tuna", "chicken"). */
  label: string;
  /** Pre-formatted right-side value ("12 logs", "8×"). */
  value: string;
  /** Raw magnitude for the inline bar (relative to the list max). Omit → no bar. */
  count?: number;
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
  // Normalize bars against the busiest entry so #1 fills the track and the rest read as
  // a share of it (the standard bar-list ranking). A list with no counts → no bars.
  const maxCount = entries.reduce((m, e) => (typeof e.count === 'number' && e.count > m ? e.count : m), 0);

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
          {entries.map((entry) => {
            const fraction = maxCount > 0 && typeof entry.count === 'number' ? entry.count / maxCount : null;
            return (
              <View key={entry.key} style={styles.entry}>
                <View style={styles.entryHead}>
                  {/* Let a long food name BREATHE — wrap to a second line rather than
                      truncate ("Purina Friskies Party Mix…"). Value + tag never shrink. */}
                  <Text style={styles.entryLabel} numberOfLines={2}>
                    {entry.label}
                  </Text>
                  {entry.tag != null && <Text style={styles.tag}>{entry.tag}</Text>}
                  <Text style={styles.entryValue}>{entry.value}</Text>
                </View>
                {fraction != null && (
                  <View style={styles.barTrack} testID="rank-bar">
                    <View style={[styles.barFill, { flex: fraction }]} />
                    <View style={{ flex: 1 - fraction }} />
                  </View>
                )}
              </View>
            );
          })}
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
    ...shadows.sm,
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
  // Each entry is a two-row block: the head (label · tag · value) then its magnitude bar.
  entry: {
    gap: 6,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  entryLabel: {
    flex: 1,
    fontSize: theme.textMD,
    lineHeight: 20,
    color: theme.colorTextPrimary,
  },
  tag: {
    fontSize: theme.textXS,
    lineHeight: 20,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    flexShrink: 0,
  },
  entryValue: {
    fontSize: theme.textSM,
    lineHeight: 20,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextSecondary,
    flexShrink: 0,
  },
  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: theme.colorAccentSoft,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
