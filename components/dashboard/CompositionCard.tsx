import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { pluralize } from '../../lib/dashboardCards';
import type { MealTreatComposition } from '../../lib/analytics';

// CompositionCard — the month's split of logged meals vs treats (§5 #6 / §6), as a
// single proportion bar + counts. DESCRIPTIVE ONLY: what was logged, never a verdict
// on the owner's feeding choices (§11 #1). So the segments use neutral greys — no
// good/bad colour, no "too many treats" framing. (A genuine treats-only stretch is
// surfaced as the meal-type-collapse COVERAGE signal on Home, framed as coverage and
// never as blame — that is the Signal's job, not this card's.)

// Neutral, non-semantic greys — distinct enough to read the proportion, deliberately
// carrying no good/bad meaning (meals are NOT "the healthy colour").
const SEGMENT_COLOR = {
  meal: theme.colorNeutralMid,
  treat: theme.colorTextTertiary,
  other: theme.colorBorder,
} as const;

interface Props {
  composition: MealTreatComposition;
  title?: string;
  emptyMessage?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

interface Segment {
  key: 'meal' | 'treat' | 'other';
  label: string;
  count: number;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function CompositionCard({
  composition,
  title = 'Meals & treats',
  emptyMessage,
  onPress,
  accessibilityHint,
}: Props) {
  const { meal, treat, total } = composition;
  // Fold the rarely-populated 'other' + legacy-unclassified rows into one quiet
  // "other" segment so the card stays a clean two-to-three part split.
  const other = composition.other + composition.unclassified;
  const isEmpty = total === 0;

  const segments: Segment[] = [
    { key: 'meal', label: 'Meals', count: meal },
    { key: 'treat', label: 'Treats', count: treat },
    { key: 'other', label: 'Other', count: other },
  ].filter((s) => s.count > 0) as Segment[];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={onPress != null ? accessibilityHint ?? 'Opens the full breakdown' : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress != null && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {onPress != null && <ChevronRight size={18} color={theme.colorTextDisabled} />}
      </View>

      {isEmpty ? (
        <Text style={styles.stateText}>{emptyMessage ?? 'No meals or treats logged yet.'}</Text>
      ) : (
        <>
          <View style={styles.bar}>
            {segments.map((s) => (
              <View key={s.key} style={{ flex: s.count, backgroundColor: SEGMENT_COLOR[s.key] }} />
            ))}
          </View>
          <View style={styles.legend}>
            {segments.map((s) => (
              <View key={s.key} style={styles.legendRow}>
                <View style={[styles.swatch, { backgroundColor: SEGMENT_COLOR[s.key] }]} />
                <Text style={styles.legendLabel}>{s.label}</Text>
                <Text style={styles.legendValue}>
                  {s.count} {pluralize(s.count, 'log')} · {pct(s.count, total)}%
                </Text>
              </View>
            ))}
          </View>
        </>
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
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: theme.radiusXS,
    overflow: 'hidden',
    backgroundColor: theme.colorChartEmpty,
  },
  legend: {
    gap: theme.space1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
  legendValue: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  stateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
});
